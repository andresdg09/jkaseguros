"use client";

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/ToastProvider';
import { useRouter } from 'next/navigation';

// Normaliza la URL base: si NEXT_PUBLIC_API_URL viene sin el sufijo /api
// (mala configuración en Vercel), lo agregamos igual para no romper todas las requests.
function normalizeApiUrl(url) {
  const trimmed = url.replace(/\/+$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}
const API_URL = normalizeApiUrl(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api');

export default function AsesorDashboard() {
  const { token, isLoggedIn, user, asesor, hydrated } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();

  // --- ESTADOS DE DATOS ---
  const [clients, setClients] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [payments, setPayments] = useState([]);
  const [tempRefs, setTempRefs] = useState({});
  const [companies, setCompanies] = useState([]);
  const [policyForm, setPolicyForm] = useState({ cliente_id: '', compania_id: '', plan: '', suma_asegurada: 5000, prima_anual: 300, frecuencia_pago: 'contado' });
  const [loading, setLoading] = useState(true);

  // --- ESTADOS DE E-LEARNING ---
  const [courses, setCourses] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedModule, setSelectedModule] = useState(null);
  const [quizAnswers, setQuizAnswers] = useState({}); // { [preguntaIndex]: opcionIndex }
  const [quizResult, setQuizResult] = useState(null); // { score, total, aprobado, respuestas }
  const [learningLoading, setLearningLoading] = useState(false);

  // --- ESTADOS DE PANELES ---
  const [activeTab, setActiveTab] = useState('clientes'); // 'clientes', 'registrar-cliente', 'pagos'
  const [searchQuery, setSearchQuery] = useState('');

  // --- ESTADOS DE ENVÍO DE DOCUMENTOS ---
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [selectedClientForDocs, setSelectedClientForDocs] = useState(null);
  const [selectedDocType, setSelectedDocType] = useState('Salud');
  
  // Formulario de nuevo cliente
  const [newClientForm, setNewClientForm] = useState({
    correo: '',
    primer_nombre: '',
    segundo_nombre: '',
    primer_apellido: '',
    segundo_apellido: '',
    fecha_nacimiento: '',
    tipo_documento: 'Venezolano',
    nro_documento: '',
    genero: 'Masculino',
    estado_civil: 'Soltero',
    codigo_area: '0412',
    numero_celular: ''
  });
  const [createdClient, setCreatedClient] = useState(null);

  // --- ESTADO REPORTE DE PAGO (SOLO EN BOLÍVARES VES) ---
  const [reportPayModal, setReportPayModal] = useState(null); // null or payment object
  const [reportPayForm, setReportPayForm] = useState({
    poliza_id: '',
    pago_id: '',
    monto_cuota_usd: '',
    monto_reportado_ves: '',
    referencia: '',
    fecha_pago: new Date().toISOString().split('T')[0],
    observaciones: ''
  });

  const handleOpenReportPayModal = (pa) => {
    setReportPayModal(pa);
    setReportPayForm({
      poliza_id: pa.poliza_id,
      pago_id: pa.id,
      monto_cuota_usd: parseFloat(pa.monto || 0),
      monto_reportado_ves: '',
      referencia: pa.referencia || '',
      fecha_pago: new Date().toISOString().split('T')[0],
      observaciones: ''
    });
  };

  const handleSendPaymentReport = async (e) => {
    e.preventDefault();
    if (!reportPayForm.referencia || !reportPayForm.monto_reportado_ves) {
      return showToast('Por favor ingrese el monto en Bolívares y la referencia bancaria.', 'error');
    }

    // Normalizar formato numérico venezolano (ej. 1.500,50 o 1500,50 o 1500.50)
    let rawMonto = String(reportPayForm.monto_reportado_ves).trim();
    if (rawMonto.includes(',') && rawMonto.includes('.')) {
      rawMonto = rawMonto.replace(/\./g, '').replace(',', '.');
    } else if (rawMonto.includes(',')) {
      rawMonto = rawMonto.replace(',', '.');
    }
    const cleanMontoVES = parseFloat(rawMonto);

    if (isNaN(cleanMontoVES) || cleanMontoVES <= 0) {
      return showToast('Por favor ingrese un monto válido en Bolívares.', 'error');
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/payments/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          poliza_id: reportPayForm.poliza_id,
          pago_id: reportPayForm.pago_id,
          monto_reportado_ves: cleanMontoVES,
          monto_usd: parseFloat(reportPayForm.monto_cuota_usd || 0),
          referencia: reportPayForm.referencia,
          fecha_pago: reportPayForm.fecha_pago,
          observaciones: reportPayForm.observaciones
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al reportar pago');

      showToast('¡Pago en Bolívares reportado con éxito! Se encuentra En Revisión por el Administrador.');
      setReportPayModal(null);
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // --- CONTROL DE PÓLIZAS MODIFICADAS ---
  const [modifiedPolicies, setModifiedPolicies] = useState({});

  const handlePolicyCellChange = (id, field, value) => {
    setPolicies(prev => prev.map(p => {
      if (p.id === id) {
        return { ...p, [field]: value };
      }
      return p;
    }));
    setModifiedPolicies(prev => ({ ...prev, [id]: true }));
  };

  const handleSaveAllPolicies = async () => {
    const modifiedIds = Object.keys(modifiedPolicies).filter(id => modifiedPolicies[id]);
    const modifiedList = policies.filter(p => modifiedIds.includes(String(p.id)));

    if (modifiedList.length === 0) {
      showToast('No hay cambios de pólizas pendientes por guardar.', 'info');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/policies/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ policies: modifiedList })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar pólizas en lote');

      showToast(`¡Pólizas guardadas con éxito! Se procesaron ${data.count} casos.`);
      setModifiedPolicies({});
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDiscardPolicyChanges = () => {
    if (confirm('¿Está seguro de que desea descartar todos los cambios no guardados en las pólizas?')) {
      setModifiedPolicies({});
      loadData();
    }
  };

  // Redirigir si no es asesor ni admin
  useEffect(() => {
    if (hydrated) {
      if (!isLoggedIn) {
        router.push('/login');
      } else if (user?.rango !== 'asesor' && user?.rango !== 'admin') {
        showToast('Acceso no autorizado.', 'error');
        router.push('/');
      }
    }
  }, [hydrated, isLoggedIn, user, router]);

  // Cargar datos
  const loadData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      // 1. Cargar clientes asignados al asesor
      const resClients = await fetch(`${API_URL}/advisor/clients`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const dataClients = await resClients.json();
      setClients(Array.isArray(dataClients) ? dataClients : []);

      // 2. Cargar pólizas del asesor
      const resPols = await fetch(`${API_URL}/policies`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const dataPols = await resPols.json();
      setPolicies(Array.isArray(dataPols) ? dataPols : []);

      // 3. Cargar cobros/pagos globales
      const resPays = await fetch(`${API_URL}/payments/admin`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const dataPays = await resPays.json();
      
      if (Array.isArray(dataPays) && Array.isArray(dataPols)) {
        // Filtrar pagos para mostrar solo aquellos vinculados a pólizas de este asesor
        const policyIds = dataPols.map(p => p.id);
        const filteredPays = dataPays.filter(pa => policyIds.includes(pa.poliza_id));
        setPayments(filteredPays);
      } else {
        setPayments([]);
      }

      // Cargar compañías para solicitudes de pólizas
      const resComps = await fetch(`${API_URL}/admin/companies`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const dataComps = await resComps.json();
      setCompanies(Array.isArray(dataComps) ? dataComps : []);

    } catch (err) {
      console.error('Error al cargar datos de asesor:', err);
      showToast('Error al conectar con la base de datos.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (hydrated && isLoggedIn && (user?.rango === 'asesor' || user?.rango === 'admin')) {
      const timer = setTimeout(() => {
        loadData();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [hydrated, isLoggedIn, user]);

  const loadElearningData = async () => {
    if (!token) return;
    setLearningLoading(true);
    try {
      const resCourses = await fetch(`${API_URL}/elearning/courses`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const dataCourses = await resCourses.json();
      setCourses(Array.isArray(dataCourses) ? dataCourses : []);

      const resProgress = await fetch(`${API_URL}/elearning/progress`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const dataProgress = await resProgress.json();
      setAttempts(Array.isArray(dataProgress) ? dataProgress : []);
    } catch (err) {
      console.error('Error al cargar datos de e-learning:', err);
      showToast('Error al cargar datos de capacitación.', 'error');
    } finally {
      setLearningLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'elearning' && token) {
      const timer = setTimeout(() => {
        loadElearningData();
        setSelectedCourse(null);
        setSelectedModule(null);
        setQuizAnswers({});
        setQuizResult(null);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [activeTab, token]);

  const handleSubmitQuiz = async (moduleId) => {
    if (!selectedModule) return;
    const questions = selectedModule.quiz_preguntas || [];
    
    // Validate all answered
    const answersArray = [];
    for (let i = 0; i < questions.length; i++) {
      if (quizAnswers[i] === undefined) {
        return showToast('Por favor responde todas las preguntas del examen.', 'error');
      }
      answersArray.push(parseInt(quizAnswers[i]));
    }

    setLearningLoading(true);
    try {
      const res = await fetch(`${API_URL}/elearning/modules/${moduleId}/attempt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ respuestas_usuario: answersArray })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al enviar la evaluación');

      setQuizResult(data);
      if (data.aprobado) {
        showToast('¡Felicidades! Has aprobado este módulo.', 'success');
      } else {
        showToast('No has alcanzado la nota mínima aprobatoria (70%). Revisa los temas e intenta de nuevo.', 'error');
      }
      loadElearningData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLearningLoading(false);
    }
  };

  // Registrar cliente
  const handleRegisterClient = async (e) => {
    e.preventDefault();
    setLoading(true);
    setCreatedClient(null);
    try {
      const res = await fetch(`${API_URL}/advisor/create-client`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newClientForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al registrar cliente');

      showToast('Cliente registrado exitosamente en el sistema JKA.');
      setCreatedClient(data);
      // Limpiar formulario
      setNewClientForm({
        correo: '',
        primer_nombre: '',
        segundo_nombre: '',
        primer_apellido: '',
        segundo_apellido: '',
        fecha_nacimiento: '',
        tipo_documento: 'Venezolano',
        nro_documento: '',
        genero: 'Masculino',
        estado_civil: 'Soltero',
        codigo_area: '0412',
        numero_celular: ''
      });
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Solicitar nueva póliza al admin
  const handleRequestPolicy = async (e) => {
    e.preventDefault();
    if (!policyForm.cliente_id || !policyForm.compania_id || !policyForm.suma_asegurada || !policyForm.prima_anual) {
      return showToast('Por favor, rellene todos los campos obligatorios del formulario.', 'error');
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/policies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          compania_id: parseInt(policyForm.compania_id),
          plan: policyForm.plan,
          suma_asegurada: parseFloat(policyForm.suma_asegurada),
          prima_anual: parseFloat(policyForm.prima_anual),
          cliente_id: parseInt(policyForm.cliente_id),
          frecuencia_pago: policyForm.frecuencia_pago || 'contado'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al solicitar póliza');

      showToast(`¡Solicitud de póliza enviada! Código: ${data.poliza.codigo_poliza}. Estado: Negociación.`);
      setPolicyForm({
        cliente_id: '',
        compania_id: companies[0]?.id || '',
        plan: '',
        suma_asegurada: 5000,
        prima_anual: 300,
        frecuencia_pago: 'contado'
      });
      loadData();
      setActiveTab('clientes');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Registrar pago como cobrado/pendiente
  const handleUpdatePaymentStatus = async (paymentId, newStatus) => {
    const currentPayment = payments.find(p => p.id === paymentId);
    const ref = tempRefs[paymentId] !== undefined ? tempRefs[paymentId] : (currentPayment?.referencia || '');

    try {
      const res = await fetch(`${API_URL}/payments/${paymentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ estado_pago: newStatus, referencia: ref || null })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al actualizar el pago.');
      
      showToast('Cobranza registrada correctamente.');
      setTempRefs(prev => {
        const copy = { ...prev };
        delete copy[paymentId];
        return copy;
      });
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Enviar recordatorio por WhatsApp
  const sendWhatsAppReminder = (payment) => {
    const cleanPhone = payment.cliente_nombre ? clients.find(c => payment.cliente_nombre.includes(c.primer_nombre))?.telefono.replace(/[^0-9]/g, '') : '';
    const phoneNum = cleanPhone || '584121234567';
    
    const advisorName = asesor ? asesor.nombre : (user?.correo || 'Asesor JKA');
    const mensaje = `Estimado *${payment.cliente_nombre}*, te saluda tu asesor de seguros *${advisorName}* de JKA Consultores. Te escribo para recordarte que tienes un pago pendiente por el monto de *$${payment.monto}* para tu póliza *${payment.poliza_codigo}* de *${payment.compania_nombre}*. Por favor reporta tu referencia en el sistema. ¡Feliz día!`;

    const waUrl = `https://wa.me/${phoneNum}?text=${encodeURIComponent(mensaje)}`;
    window.open(waUrl, '_blank');
  };

  // Enviar recordatorio por EmailJS (REST API)
  const sendEmailReminder = async (payment) => {
    setLoading(true);
    try {
      const clientObj = clients.find(c => payment.cliente_nombre.includes(c.primer_nombre));
      const targetEmail = clientObj ? clientObj.correo : null;

      if (!targetEmail || targetEmail === 'N/A') {
        throw new Error('No se encontró un correo válido para el cliente.');
      }

      const advisorName = asesor ? asesor.nombre : 'Asesor JKA Seguros';

      const emailjsPayload = {
        service_id: 'service_271yuq8',
        template_id: 'template_068mrut',
        user_id: 'jgnK_ClSfIQ6PBYqd',
        accessToken: 's2Qg_q1KjxfL6H28PVCIQ',
        template_params: {
          user_name: payment.cliente_nombre,
          to_email: targetEmail,
          fecha: new Date().toLocaleDateString('es-VE'),
          solicitud_ref: `Recordatorio de Pago Pendiente - Póliza ${payment.poliza_codigo} (${payment.compania_nombre})`,
          cotizacion_pdf: '',
          plan_cards: `
            <div style="background-color: #fffbeb; border: 1.5px solid #f59e0b; border-radius: 8px; padding: 25px; font-family: sans-serif; text-align: left; box-shadow: 0 4px 6px rgba(0,0,0,0.02);">
              <h3 style="color: #b45309; margin-top: 0; border-bottom: 1px solid #fef3c7; padding-bottom: 8px;">Recordatorio de Pago Pendiente</h3>
              <p style="font-size: 15px; color: #334155; line-height: 1.6; margin: 15px 0 15px 0;">
                Hola <strong>${payment.cliente_nombre}</strong>, te saludamos de JKA Seguros. Queremos recordarte que tienes un cobro pendiente de <strong>$${payment.monto}</strong> para tu póliza <strong>${payment.poliza_codigo}</strong> de la compañía <strong>${payment.compania_nombre}</strong>.
              </p>
              <p style="font-size: 15px; color: #334155; line-height: 1.6; margin: 0 0 20px 0;">
                Por favor, ingresa a tu panel en JKA Seguros y reporta el pago con su número de referencia.
              </p>
              <div style="text-align: center; margin-top: 15px;">
                <a href="https://jkaseguros.com" target="_blank" style="background-color: #2563eb; color: #ffffff; padding: 11px 24px; font-size: 13px; font-weight: bold; text-decoration: none; border-radius: 6px; display: inline-block; box-shadow: 0 4px 6px rgba(37,99,235,0.15);">
                  🔑 Ingresar a mi Cuenta JKA
                </a>
              </div>
            </div>
          `
        }
      };

      const emailjsRes = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(emailjsPayload)
      });

      if (!emailjsRes.ok) {
        throw new Error(`EmailJS falló con código ${emailjsRes.status}`);
      }

      showToast(`Recordatorio de cobro enviado por correo a ${targetEmail}.`);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // --- MÉTODOS DE ENVÍO DE DOCUMENTOS ---
  const handleOpenSendDocsModal = (client) => {
    setSelectedClientForDocs(client);
    setSelectedDocType('Salud');
    setDocModalOpen(true);
  };

  const handleSendDocsSubmit = async (e) => {
    e.preventDefault();
    if (!selectedClientForDocs) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/advisor/send-document`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          cliente_id: selectedClientForDocs.id,
          tipo_seguro: selectedDocType
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al enviar la documentación.');

      showToast(`¡Documentación enviada! Se envió el correo a ${selectedClientForDocs.correo || 'el cliente'}.`);
      setDocModalOpen(false);
      loadData(); // Recargar datos para ver trazabilidad
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const [paymentStatusFilter, setPaymentStatusFilter] = useState('todos');
  const [expandedPolicies, setExpandedPolicies] = useState({});

  // --- FILTRADO DE DATOS ---
  const filteredClients = clients.filter(c =>
    !searchQuery ||
    c.nombre?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.nro_documento?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.telefono?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.correo?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Agrupación de pagos por póliza con filtrado inteligente
  const groupedPaymentsByPolicy = (() => {
    const map = new Map();
    payments.forEach(pa => {
      const pKey = pa.poliza_id ? String(pa.poliza_id) : (pa.poliza_codigo || `temp-${pa.id}`);
      if (!map.has(pKey)) {
        map.set(pKey, {
          poliza_id: pa.poliza_id,
          poliza_codigo: pa.poliza_codigo || 'POL-GENERAL',
          cliente_nombre: pa.cliente_nombre || 'Cliente',
          compania_nombre: pa.compania_nombre || 'Seguros',
          frecuencia: pa.poliza_frecuencia || 'contado',
          plan: pa.poliza_plan || '',
          total_prima: parseFloat(pa.poliza_prima || 0),
          cuotas: []
        });
      }
      map.get(pKey).cuotas.push(pa);
    });

    const groups = [...map.values()].map(group => {
      group.cuotas.sort((a, b) => (a.cuota_numero || a.id) - (b.cuota_numero || b.id));
      const pagadas = group.cuotas.filter(c => c.estado_pago === 'pagado').length;
      const revision = group.cuotas.filter(c => c.estado_pago === 'en_revision').length;
      const pendientes = group.cuotas.filter(c => c.estado_pago === 'pendiente').length;
      const rechazadas = group.cuotas.filter(c => c.estado_pago === 'rechazado').length;
      const montoTotalCobrado = group.cuotas.filter(c => c.estado_pago === 'pagado').reduce((acc, c) => acc + parseFloat(c.monto || 0), 0);
      const montoTotalCuotas = group.cuotas.reduce((acc, c) => acc + parseFloat(c.monto || 0), 0);

      // Si hay un filtro de estado activo, filtramos las cuotas visibles dentro del desglose
      const cuotasVisibles = paymentStatusFilter === 'todos' 
        ? group.cuotas 
        : group.cuotas.filter(c => c.estado_pago === paymentStatusFilter);

      return {
        ...group,
        totalCuotas: group.cuotas.length,
        cuotasPagadas: pagadas,
        cuotasEnRevision: revision,
        cuotasPendientes: pendientes,
        cuotasRechazadas: rechazadas,
        montoTotalCobrado,
        montoTotalCuotas,
        cuotas: cuotasVisibles
      };
    });

    // Filtrar las tarjetas de póliza según el estado seleccionado y la búsqueda
    return groups.filter(group => {
      // Si se filtra por estado y no tiene cuotas con ese estado, no se muestra
      if (paymentStatusFilter === 'en_revision' && group.cuotasEnRevision === 0) return false;
      if (paymentStatusFilter === 'pendiente' && group.cuotasPendientes === 0) return false;
      if (paymentStatusFilter === 'pagado' && group.cuotasPagadas === 0) return false;
      if (paymentStatusFilter === 'rechazado' && group.cuotasRechazadas === 0) return false;

      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        group.poliza_codigo?.toLowerCase().includes(q) ||
        group.cliente_nombre?.toLowerCase().includes(q) ||
        group.compania_nombre?.toLowerCase().includes(q) ||
        group.cuotas.some(c => c.referencia?.toLowerCase().includes(q))
      );
    });
  })();

  const filteredPolicies = policies.filter(p =>
    !searchQuery ||
    p.codigo_poliza?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.cliente_nombre?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.compania_nombre?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.estado?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!hydrated || !isLoggedIn || (user?.rango !== 'asesor' && user?.rango !== 'admin')) return null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h2 style={{ color: 'var(--primary)', fontWeight: 800 }}>Panel de Asesor de Broker</h2>
          <p style={{ color: 'var(--text-muted)' }}>Asesor: <strong>{asesor ? asesor.nombre : user.correo}</strong> | Código: {asesor ? asesor.codigo_asesor : 'ASE-SYS'}</p>
        </div>
        <button onClick={loadData} className="btn btn-secondary" style={{ padding: '0.5rem 1rem' }} disabled={loading}>
          {loading ? 'Cargando...' : 'Actualizar Data ↻'}
        </button>
      </div>

      {/* TABS DE ASESOR */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border)',
        gap: '0.5rem',
        marginBottom: '2rem'
      }}>
        <button
          onClick={() => { setActiveTab('clientes'); setSearchQuery(''); }}
          className={`btn ${activeTab === 'clientes' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ borderRadius: '8px 8px 0 0', border: 'none', padding: '0.75rem 1.25rem' }}
        >
          Mis Clientes
        </button>
        <button
          onClick={() => { setActiveTab('registrar-cliente'); setSearchQuery(''); }}
          className={`btn ${activeTab === 'registrar-cliente' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ borderRadius: '8px 8px 0 0', border: 'none', padding: '0.75rem 1.25rem' }}
        >
          Registrar Nuevo Cliente
        </button>
        <button
          onClick={() => { setActiveTab('pagos'); setSearchQuery(''); }}
          className={`btn ${activeTab === 'pagos' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ borderRadius: '8px 8px 0 0', border: 'none', padding: '0.75rem 1.25rem' }}
        >
          Control de Cobranzas
        </button>
        <button
          onClick={() => { setActiveTab('polizas'); setSearchQuery(''); }}
          className={`btn ${activeTab === 'polizas' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ borderRadius: '8px 8px 0 0', border: 'none', padding: '0.75rem 1.25rem' }}
        >
          📋 Gestión de Pólizas
        </button>
        <button
          onClick={() => { 
            setActiveTab('solicitar-poliza'); 
            setSearchQuery(''); 
            setPolicyForm(prev => ({
              ...prev,
              cliente_id: clients[0]?.id || '',
              compania_id: companies[0]?.id || ''
            }));
          }}
          className={`btn ${activeTab === 'solicitar-poliza' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ borderRadius: '8px 8px 0 0', border: 'none', padding: '0.75rem 1.25rem' }}
        >
          Solicitar Emisión Póliza
        </button>
        <button
          onClick={() => { setActiveTab('elearning'); setSearchQuery(''); }}
          className={`btn ${activeTab === 'elearning' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ borderRadius: '8px 8px 0 0', border: 'none', padding: '0.75rem 1.25rem' }}
        >
          Capacitación (E-Learning)
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>Sincronizando con base de datos...</div>
      ) : (
        <div>
          {/* TAB: MIS CLIENTES */}
          {activeTab === 'clientes' && (
            <div className="card">
              <h3 className="card-title" style={{ marginBottom: '1.5rem' }}>Directorio de Asegurados Asignados</h3>
              <div style={{ marginBottom: '1.2rem' }}>
                <input
                  type="text"
                  placeholder="🔍 Buscar asegurado por nombre, documento, correo o móvil..."
                  className="form-input"
                  style={{ maxWidth: '350px', padding: '0.5rem 1rem', margin: 0 }}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Asegurado</th>
                      <th>Documento</th>
                      <th>Teléfono</th>
                      <th>Correo Electrónico</th>
                      <th>Pólizas Activas</th>
                      <th>Contacto Directo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClients.length === 0 ? (
                      <tr><td colSpan="6" className="text-center">No hay clientes que coincidan con la búsqueda.</td></tr>
                    ) : (
                      filteredClients.map((c) => {
                        const clientPols = policies.filter(p => p.cliente_id === c.id);
                        return (
                          <tr key={c.id}>
                            <td><strong>{c.nombre}</strong></td>
                            <td>{c.tipo_documento} {c.nro_documento}</td>
                            <td>{c.telefono}</td>
                            <td>{c.correo}</td>
                            <td>
                              {clientPols.map(p => (
                                <div key={p.id} style={{ fontSize: '0.8rem', margin: '0.2rem 0' }}>
                                  <strong>{p.codigo_poliza}</strong> ({p.estado.toUpperCase()})
                                </div>
                              ))}
                              {clientPols.length === 0 && <span style={{ color: 'var(--text-muted)' }}>Ninguna</span>}
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <a 
                                  href={`https://wa.me/${c.telefono.replace(/[^0-9]/g, '')}`} 
                                  target="_blank" 
                                  className="btn"
                                  style={{ background: '#25d366', color: '#fff', border: 'none', fontSize: '0.8rem', padding: '0.2rem 0.5rem', textDecoration: 'none', display: 'inline-block' }}
                                >
                                  WhatsApp
                                </a>
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem' }}
                                  onClick={() => handleOpenSendDocsModal(c)}
                                >
                                  Enviar Documentos
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: REGISTRAR NUEVO CLIENTE */}
          {activeTab === 'registrar-cliente' && (
            <div className="card" style={{ maxWidth: '700px', margin: '0 auto' }}>
              <h3 className="card-title" style={{ marginBottom: '1rem' }}>Registrar Datos del Nuevo Asegurado</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '2rem' }}>
                Complete la información personal básica del cliente para crear su perfil en el sistema. Se le generará una cuenta con contraseña por defecto.
              </p>

              {createdClient && (
                <div style={{ background: '#e6fffa', border: '1px solid #319795', padding: '1rem', borderRadius: '6px', marginBottom: '2rem' }}>
                  <h5 style={{ color: '#234e52', marginBottom: '0.25rem' }}>✓ Cliente Registrado con Éxito</h5>
                  <p style={{ fontSize: '0.9rem', color: '#2d3748' }}>
                    Se ha creado la cuenta para <strong>{createdClient.cliente.primer_nombre} {createdClient.cliente.primer_apellido}</strong>.
                    <br />
                    <strong>Correo:</strong> {createdClient.cliente.correo}
                    <br />
                    <strong>Contraseña Temporal:</strong> <code style={{ background: '#fff', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>{createdClient.tempPassword}</code>
                  </p>
                </div>
              )}

              <form onSubmit={handleRegisterClient}>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Correo Electrónico *</label>
                    <input type="email" className="form-input" value={newClientForm.correo} onChange={e => setNewClientForm({...newClientForm, correo: e.target.value})} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Fecha de Nacimiento *</label>
                    <input type="date" className="form-input" value={newClientForm.fecha_nacimiento} onChange={e => setNewClientForm({...newClientForm, fecha_nacimiento: e.target.value})} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Tipo Documento *</label>
                    <select className="form-input" value={newClientForm.tipo_documento} onChange={e => setNewClientForm({...newClientForm, tipo_documento: e.target.value})}>
                      <option value="Venezolano">Venezolano</option>
                      <option value="Extranjero">Extranjero</option>
                      <option value="Pasaporte">Pasaporte</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Nro. Documento *</label>
                    <input type="text" className="form-input" value={newClientForm.nro_documento} onChange={e => setNewClientForm({...newClientForm, nro_documento: e.target.value})} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Primer Nombre *</label>
                    <input type="text" className="form-input" value={newClientForm.primer_nombre} onChange={e => setNewClientForm({...newClientForm, primer_nombre: e.target.value})} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Segundo Nombre</label>
                    <input type="text" className="form-input" value={newClientForm.segundo_nombre} onChange={e => setNewClientForm({...newClientForm, segundo_nombre: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Primer Apellido *</label>
                    <input type="text" className="form-input" value={newClientForm.primer_apellido} onChange={e => setNewClientForm({...newClientForm, primer_apellido: e.target.value})} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Segundo Apellido</label>
                    <input type="text" className="form-input" value={newClientForm.segundo_apellido} onChange={e => setNewClientForm({...newClientForm, segundo_apellido: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Género *</label>
                    <select className="form-input" value={newClientForm.genero} onChange={e => setNewClientForm({...newClientForm, genero: e.target.value})}>
                      <option value="Masculino">Masculino</option>
                      <option value="Femenino">Femenino</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Estado Civil</label>
                    <select className="form-input" value={newClientForm.estado_civil} onChange={e => setNewClientForm({...newClientForm, estado_civil: e.target.value})}>
                      <option value="Soltero">Soltero/a</option>
                      <option value="Casado">Casado/a</option>
                      <option value="Divorciado">Divorciado/a</option>
                      <option value="Viudo">Viudo/a</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Código de Área *</label>
                    <select className="form-input" value={newClientForm.codigo_area} onChange={e => setNewClientForm({...newClientForm, codigo_area: e.target.value})}>
                      <option value="0412">0412</option>
                      <option value="0414">0414</option>
                      <option value="0424">0424</option>
                      <option value="0416">0416</option>
                      <option value="0426">0426</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Número Celular *</label>
                    <input type="tel" className="form-input" value={newClientForm.numero_celular} onChange={e => setNewClientForm({...newClientForm, numero_celular: e.target.value})} required />
                  </div>
                </div>
                <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1.5rem' }}>
                  Registrar Asegurado
                </button>
              </form>
            </div>
          )}

          {/* TAB: CONTROL DE COBRANZAS */}
          {activeTab === 'pagos' && (
            <div className="card">
              <h3 className="card-title" style={{ marginBottom: '1.5rem' }}>Monitoreo de Pagos de Mis Pólizas</h3>
              {/* Filtros de Cobranzas */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem', background: '#f8fafc', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border)' }}>
                <input
                  type="text"
                  placeholder="🔍 Buscar cobros por póliza, cliente, aseguradora o referencia..."
                  className="form-input"
                  style={{ minWidth: '280px', maxWidth: '380px', padding: '0.5rem 1rem', margin: 0 }}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary)' }}>
                    Filtrar por Estado:
                  </label>
                  <select
                    value={paymentStatusFilter}
                    onChange={(e) => setPaymentStatusFilter(e.target.value)}
                    className="form-input"
                    style={{ padding: '0.45rem 0.75rem', margin: 0, fontSize: '0.85rem', fontWeight: 600, minWidth: '150px' }}
                  >
                    <option value="todos">Todos los Estados</option>
                    <option value="en_revision">🟡 En Revisión por Admin</option>
                    <option value="pendiente">⚪ Pendiente de Cobro</option>
                    <option value="pagado">🟢 Verificados y Pagados</option>
                    <option value="rechazado">🔴 Rechazados</option>
                  </select>

                  <button
                    onClick={() => {
                      const allKeys = {};
                      groupedPaymentsByPolicy.forEach(g => { allKeys[g.poliza_codigo] = true; });
                      setExpandedPolicies(prev => (Object.keys(prev).length === groupedPaymentsByPolicy.length ? {} : allKeys));
                    }}
                    className="btn btn-secondary"
                    style={{ fontSize: '0.8rem', padding: '0.45rem 0.8rem', borderRadius: '6px' }}
                  >
                    {Object.keys(expandedPolicies).length === groupedPaymentsByPolicy.length && groupedPaymentsByPolicy.length > 0 ? 'Contraer Todos 🔼' : 'Expandir Todos 🔽'}
                  </button>
                </div>
              </div>

              {/* LISTADO DE PÓLIZAS AGRUPADAS CON SUS CUOTAS */}
              {groupedPaymentsByPolicy.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', background: '#f8fafc', borderRadius: '8px', border: '1px dashed var(--border)' }}>
                  No hay cobros registrados con los criterios seleccionados.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {groupedPaymentsByPolicy.map((group) => {
                    const isExpanded = !!expandedPolicies[group.poliza_codigo];
                    const progressPercent = group.totalCuotas > 0 ? Math.round((group.cuotasPagadas / group.totalCuotas) * 100) : 0;

                    return (
                      <div
                        key={group.poliza_codigo}
                        style={{
                          background: '#ffffff',
                          border: group.cuotasEnRevision > 0 ? '2px solid #f59e0b' : '1px solid var(--border)',
                          borderRadius: '10px',
                          overflow: 'hidden',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.03)'
                        }}
                      >
                        {/* Cabecera de la Póliza */}
                        <div
                          style={{
                            padding: '1rem 1.25rem',
                            background: group.cuotasEnRevision > 0 ? '#fffbeb' : '#f8fafc',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '1rem',
                            cursor: 'pointer',
                            borderBottom: isExpanded ? '1px solid var(--border)' : 'none'
                          }}
                          onClick={() => setExpandedPolicies(prev => ({ ...prev, [group.poliza_codigo]: !prev[group.poliza_codigo] }))}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--primary)' }}>
                              🛡️ {group.poliza_codigo}
                            </span>
                            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#334155' }}>
                              {group.cliente_nombre}
                            </span>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                              ({group.compania_nombre} {group.plan ? `- Plan ${group.plan}` : ''})
                            </span>
                            <span style={{ fontSize: '0.75rem', background: '#e2e8f0', color: '#475569', padding: '0.2rem 0.5rem', borderRadius: '4px', textTransform: 'capitalize', fontWeight: 600 }}>
                              Frecuencia: {group.frecuencia}
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                            {/* Progreso de Cobro */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--primary)' }}>
                                  {group.cuotasPagadas}/{group.totalCuotas} Cuotas Pagadas ({progressPercent}%)
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                  Recaudado: <strong>${group.montoTotalCobrado.toFixed(2)}</strong> de ${group.montoTotalCuotas.toFixed(2)}
                                </div>
                              </div>
                              <div style={{ width: '80px', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{ width: `${progressPercent}%`, height: '100%', background: progressPercent === 100 ? '#16a34a' : '#2563eb' }} />
                              </div>
                            </div>

                            {/* Alerta de Cuotas en Revisión */}
                            {group.cuotasEnRevision > 0 && (
                              <span style={{ background: '#fef3c7', color: '#b45309', fontWeight: 800, fontSize: '0.75rem', padding: '0.3rem 0.6rem', borderRadius: '20px' }}>
                                🟡 {group.cuotasEnRevision} en revisión
                              </span>
                            )}

                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', pointerEvents: 'none' }}
                            >
                              {isExpanded ? 'Ocultar Cuotas 🔼' : 'Ver Cuotas (' + group.totalCuotas + ') 🔽'}
                            </button>
                          </div>
                        </div>

                        {/* Desglose de Cuotas */}
                        {isExpanded && (
                          <div style={{ padding: '0.5rem 1rem 1rem 1rem', background: '#ffffff' }}>
                            <table className="table" style={{ margin: 0, fontSize: '0.85rem' }}>
                              <thead>
                                <tr style={{ background: '#f1f5f9' }}>
                                  <th style={{ width: '80px' }}>Cuota</th>
                                  <th>Monto Cuota ($)</th>
                                  <th>Pago Reportado</th>
                                  <th>Referencia Bancaria</th>
                                  <th>Vencimiento</th>
                                  <th>Estado</th>
                                  <th style={{ textAlign: 'center', width: '180px' }}>Acción</th>
                                </tr>
                              </thead>
                              <tbody>
                                {group.cuotas.map((pa, cIdx) => (
                                  <tr key={pa.id} style={{ background: pa.estado_pago === 'en_revision' ? '#fffbeb' : pa.estado_pago === 'pagado' ? '#f0fdf4' : 'transparent' }}>
                                    <td>
                                      <strong>#{pa.cuota_numero || (cIdx + 1)}</strong>
                                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>/{group.totalCuotas}</span>
                                    </td>
                                    <td style={{ fontWeight: 700 }}>
                                      ${parseFloat(pa.monto).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td>
                                      {pa.monto_reportado ? (
                                        <span style={{ fontWeight: 700, color: pa.moneda_pago === 'VES' ? '#2563eb' : '#16a34a' }}>
                                          {pa.moneda_pago === 'VES' ? 'Bs.' : '$'} {parseFloat(pa.monto_reportado).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                                        </span>
                                      ) : (
                                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                                      )}
                                    </td>
                                    <td>
                                      {pa.referencia ? (
                                        <code style={{ fontWeight: 700, background: '#f1f5f9', padding: '0.15rem 0.35rem', borderRadius: '3px' }}>
                                          {pa.referencia}
                                        </code>
                                      ) : (
                                        <span style={{ color: 'var(--text-muted)' }}>Sin Ref</span>
                                      )}
                                    </td>
                                    <td>{pa.fecha_vencimiento ? pa.fecha_vencimiento.split('T')[0] : 'N/A'}</td>
                                    <td>
                                      {pa.estado_pago === 'pagado' && (
                                        <span style={{ background: '#dcfce7', color: '#15803d', fontWeight: 700, fontSize: '0.75rem', padding: '0.2rem 0.4rem', borderRadius: '4px' }}>
                                          🟢 Verificado y Pagado
                                        </span>
                                      )}
                                      {pa.estado_pago === 'en_revision' && (
                                        <span style={{ background: '#fef3c7', color: '#b45309', fontWeight: 700, fontSize: '0.75rem', padding: '0.2rem 0.4rem', borderRadius: '4px' }}>
                                          🟡 En Revisión Admin
                                        </span>
                                      )}
                                      {pa.estado_pago === 'pendiente' && (
                                        <span style={{ background: '#f1f5f9', color: '#64748b', fontWeight: 700, fontSize: '0.75rem', padding: '0.2rem 0.4rem', borderRadius: '4px' }}>
                                          ⚪ Pendiente
                                        </span>
                                      )}
                                      {pa.estado_pago === 'rechazado' && (
                                        <span style={{ background: '#fee2e2', color: '#b91c1c', fontWeight: 700, fontSize: '0.75rem', padding: '0.2rem 0.4rem', borderRadius: '4px' }}>
                                          🔴 Rechazado
                                        </span>
                                      )}
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                      {pa.estado_pago !== 'pagado' ? (
                                        <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'center' }}>
                                          <button
                                            onClick={() => handleOpenReportPayModal(pa)}
                                            className="btn btn-primary"
                                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                                          >
                                            💳 Reportar Pago
                                          </button>
                                          <button
                                            onClick={() => sendWhatsAppReminder(pa)}
                                            className="btn"
                                            title="Recordar por WhatsApp"
                                            style={{ padding: '0.25rem 0.45rem', fontSize: '0.75rem', background: '#25d366', color: '#fff', border: 'none', cursor: 'pointer' }}
                                          >
                                            💬
                                          </button>
                                        </div>
                                      ) : (
                                        <span style={{ fontSize: '0.8rem', color: '#16a34a', fontWeight: 700 }}>✓ Al día</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB: GESTIÓN DE PÓLIZAS */}
          {activeTab === 'polizas' && (
            <div className="card">
              <h3 className="card-title" style={{ marginBottom: '1.5rem' }}>Gestión y Control de tus Pólizas</h3>
              <div style={{ marginBottom: '1.2rem' }}>
                <input
                  type="text"
                  placeholder="🔍 Buscar póliza por código, cliente, aseguradora o estado..."
                  className="form-input"
                  style={{ maxWidth: '350px', padding: '0.5rem 1rem', margin: 0 }}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="table-container">
                <table className="table" style={{ minWidth: '1250px' }}>
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Cliente</th>
                      <th>Aseguradora</th>
                      <th>Plan</th>
                      <th>Suma Asegurada ($)</th>
                      <th>Prima Anual ($)</th>
                      <th>Frecuencia</th>
                      <th>Estado</th>
                      <th>Motivo Rechazo</th>
                      <th style={{ textAlign: 'center', width: '130px' }}>Estado Edición</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPolicies.length === 0 ? (
                      <tr><td colSpan="9" className="text-center">No hay pólizas que coincidan con la búsqueda.</td></tr>
                    ) : (
                      filteredPolicies.map((p) => {
                        const isModified = !!modifiedPolicies[p.id];
                        return (
                          <tr key={p.id} style={{ background: isModified ? '#fffaf0' : 'transparent' }}>
                            <td><strong>{p.codigo_poliza}</strong></td>
                            <td>{p.cliente_nombre || 'Asociado'}</td>
                            <td>{p.compania_nombre || 'Seguros'}</td>
                            <td>
                              <input
                                type="text"
                                value={p.plan || ''}
                                onChange={(e) => handlePolicyCellChange(p.id, 'plan', e.target.value)}
                                style={{ border: 'none', background: 'transparent', width: '110px', outline: 'none', borderBottom: '1px dashed var(--border)', padding: '0.2rem' }}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                value={p.suma_asegurada ?? ''}
                                onChange={(e) => handlePolicyCellChange(p.id, 'suma_asegurada', e.target.value)}
                                style={{ border: 'none', background: 'transparent', width: '105px', outline: 'none', borderBottom: '1px dashed var(--border)', padding: '0.2rem' }}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                value={p.prima_anual ?? ''}
                                onChange={(e) => handlePolicyCellChange(p.id, 'prima_anual', e.target.value)}
                                style={{ border: 'none', background: 'transparent', width: '90px', outline: 'none', borderBottom: '1px dashed var(--border)', fontWeight: 'bold', padding: '0.2rem' }}
                              />
                            </td>
                            <td>
                              <select
                                value={p.frecuencia_pago || 'contado'}
                                onChange={(e) => handlePolicyCellChange(p.id, 'frecuencia_pago', e.target.value)}
                                style={{ padding: '0.25rem', borderRadius: '4px', border: '1px solid var(--border)', fontWeight: 600 }}
                              >
                                <option value="contado">Contado</option>
                                <option value="semestral">Semestral</option>
                                <option value="trimestral">Trimestral</option>
                                <option value="mensual">Mensual</option>
                              </select>
                            </td>
                            <td>
                              <select
                                value={p.estado}
                                onChange={(e) => handlePolicyCellChange(p.id, 'estado', e.target.value)}
                                style={{ 
                                  padding: '0.25rem', 
                                  borderRadius: '4px', 
                                  border: '1px solid var(--border)',
                                  fontWeight: 'bold',
                                  color: p.estado === 'vigente' ? '#10b981' : p.estado === 'negociacion' ? '#f59e0b' : '#ef4444'
                                }}
                              >
                                <option value="negociacion">Negociación</option>
                                <option value="vigente">Vigente</option>
                                <option value="vencido">Vencido</option>
                                <option value="rechazado">Rechazado</option>
                              </select>
                            </td>
                            <td>
                              {p.estado === 'rechazado' ? (
                                <input
                                  type="text"
                                  placeholder="¿Por qué se rechazó?"
                                  value={p.motivo_rechazo || ''}
                                  onChange={(e) => handlePolicyCellChange(p.id, 'motivo_rechazo', e.target.value)}
                                  className="form-input"
                                  style={{ padding: '0.2rem', margin: 0, fontSize: '0.8rem', border: '1px solid #fecaca', backgroundColor: '#fef2f2', width: '180px' }}
                                />
                              ) : (
                                <span style={{ color: 'var(--text-muted)' }}>—</span>
                              )}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {isModified ? (
                                <span className="badge" style={{ backgroundColor: '#fff3cd', color: '#856404', border: '1px solid #ffeeba', fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 600 }}>
                                  Modificado
                                </span>
                              ) : (
                                <span style={{ color: 'var(--text-muted)' }}>—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Barra Flotante de Guardado en Lote para Pólizas */}
              {Object.keys(modifiedPolicies).length > 0 && (
                <div className="floating-save-bar">
                  <span style={{ fontSize: '0.9rem', color: 'var(--text)' }}>
                    ⚠️ Tienes <strong>{Object.keys(modifiedPolicies).length}</strong> pólizas modificadas sin guardar.
                  </span>
                  <button
                    onClick={handleSaveAllPolicies}
                    className="btn btn-primary"
                    style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                    disabled={loading}
                  >
                    💾 Guardar Cambios
                  </button>
                  <button
                    onClick={handleDiscardPolicyChanges}
                    className="btn"
                    style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', background: '#fee2e2', color: '#ef4444', border: '1px solid #fecaca' }}
                    disabled={loading}
                  >
                    Descartar
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB: SOLICITAR EMISIÓN PÓLIZA */}
          {activeTab === 'solicitar-poliza' && (
            <div className="card" style={{ maxWidth: '600px', margin: '0 auto' }}>
              <h3 className="card-title" style={{ marginBottom: '1rem' }}>Solicitar Emisión de Nueva Póliza</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '2rem' }}>
                Complete los detalles del seguro a emitir. La solicitud se registrará en estado de <strong>Negociación</strong> y quedará pendiente de aprobación por el Administrador.
              </p>

              <form onSubmit={handleRequestPolicy}>
                <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                  <label className="form-label">Seleccionar Asegurado *</label>
                  <select
                    className="form-input"
                    value={policyForm.cliente_id}
                    onChange={e => setPolicyForm({...policyForm, cliente_id: e.target.value})}
                    required
                  >
                    <option value="">-- Elija un cliente asignado --</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.nombre} ({c.nro_documento})</option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                  <label className="form-label">Compañía Aseguradora *</label>
                  <select
                    className="form-input"
                    value={policyForm.compania_id}
                    onChange={e => setPolicyForm({...policyForm, compania_id: e.target.value})}
                    required
                  >
                    <option value="">-- Seleccione Aseguradora --</option>
                    {companies.map(c => (
                      <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                  <label className="form-label">Plan del Tarifario *</label>
                  <select
                    className="form-input"
                    value={policyForm.plan}
                    onChange={e => setPolicyForm({...policyForm, plan: e.target.value})}
                    required
                  >
                    <option value="">-- Seleccione Plan del Tarifario --</option>
                    {String(policyForm.compania_id) === '1' && (
                      <>
                        <option value="ACCESS">ACCESS (Mercantil)</option>
                        <option value="PLATINO">PLATINO (Mercantil)</option>
                        <option value="EMERGENCIAS">EMERGENCIAS (Mercantil)</option>
                      </>
                    )}
                    {String(policyForm.compania_id) === '2' && (
                      <>
                        <option value="SALUD EXTERIOR">SALUD EXTERIOR (Seguros Caracas)</option>
                        <option value="SALUD INDIVIDUAL">SALUD INDIVIDUAL (Seguros Caracas)</option>
                      </>
                    )}
                    {String(policyForm.compania_id) === '3' && (
                      <>
                        <option value="BRONCE">BRONCE (Seguros Venezuela)</option>
                        <option value="PLATA">PLATA (Seguros Venezuela)</option>
                        <option value="ORO">ORO (Seguros Venezuela)</option>
                      </>
                    )}
                    {String(policyForm.compania_id) === '4' && (
                      <>
                        <option value="Incendio">Incendio / Patrimoniales (Mapfre)</option>
                        <option value="Vehículos">Vehículos / Automóvil (Mapfre)</option>
                        <option value="Salud Global">Salud Global (Mapfre)</option>
                      </>
                    )}
                    {String(policyForm.compania_id) === '5' && (
                      <>
                        <option value="Cobertura Internacional">Cobertura Internacional (Internacional de Seguros)</option>
                        <option value="Asistencia en Viajes">Asistencia en Viajes (Internacional de Seguros)</option>
                      </>
                    )}
                    <option value="Plan Especial">Plan Especial / Personalizado</option>
                  </select>
                </div>

                <div className="form-grid" style={{ marginBottom: '1.5rem' }}>
                  <div className="form-group">
                    <label className="form-label">Suma Asegurada ($) *</label>
                    <input
                      type="number"
                      className="form-input"
                      value={policyForm.suma_asegurada}
                      onChange={e => setPolicyForm({...policyForm, suma_asegurada: e.target.value})}
                      min="1"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Prima Anual ($) *</label>
                    <input
                      type="number"
                      className="form-input"
                      value={policyForm.prima_anual}
                      onChange={e => setPolicyForm({...policyForm, prima_anual: e.target.value})}
                      min="1"
                      required
                    />
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                  <label className="form-label">Frecuencia de Pago *</label>
                  <select
                    className="form-input"
                    value={policyForm.frecuencia_pago || 'contado'}
                    onChange={e => setPolicyForm({...policyForm, frecuencia_pago: e.target.value})}
                    required
                  >
                    <option value="contado">Pago Anual / Contado (1 cuota)</option>
                    <option value="semestral">Pago Semestral (2 cuotas)</option>
                    <option value="trimestral">Pago Trimestral (4 cuotas)</option>
                    <option value="mensual">Pago Mensual (12 cuotas)</option>
                  </select>
                </div>

                <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }} disabled={loading}>
                  {loading ? 'Procesando...' : 'Enviar Solicitud al Administrador'}
                </button>
              </form>
            </div>
          )}

          {/* TAB: E-LEARNING / CAPACITACIÓN */}
          {activeTab === 'elearning' && (
            <div>
              {/* TOP HEADER */}
              <div style={{
                background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)',
                color: '#ffffff',
                padding: '2.5rem',
                borderRadius: '12px',
                marginBottom: '2rem',
                boxShadow: '0 4px 20px rgba(30, 58, 138, 0.15)'
              }}>
                <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.5rem' }}>🎓 Aula Virtual de Asesores</h2>
                <p style={{ fontSize: '1.05rem', opacity: 0.9 }}>
                  Potencia tus habilidades de ventas, conoce en detalle nuestros ramos de seguros y domina el uso de la plataforma JKA Seguros.
                </p>
              </div>

              {selectedModule ? (
                /* VIEW MODULE & QUIZ */
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'start' }}>
                  {/* LEFT COLUMN: MODULE STUDY CONTENT */}
                  <div className="card" style={{ padding: '2rem' }}>
                    <button 
                      onClick={() => { setSelectedModule(null); setQuizResult(null); setQuizAnswers({}); }} 
                      className="btn btn-secondary" 
                      style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', border: 'none' }}
                    >
                      ← Volver a Cursos
                    </button>
                    
                    <span style={{ display: 'block', fontSize: '0.85rem', color: 'var(--accent)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {selectedCourse?.titulo}
                    </span>
                    <h3 className="card-title" style={{ marginTop: '0.25rem', marginBottom: '1.5rem', border: 'none' }}>
                      {selectedModule.titulo}
                    </h3>
                    
                    <div style={{ 
                      fontSize: '1.05rem', 
                      lineHeight: '1.75', 
                      color: '#334155', 
                      whiteSpace: 'pre-line',
                      backgroundColor: 'var(--surface-muted)',
                      padding: '1.5rem',
                      borderRadius: '8px',
                      borderLeft: '4px solid var(--accent)'
                    }}>
                      {selectedModule.contenido}
                    </div>
                  </div>

                  {/* RIGHT COLUMN: EVALUATION / QUIZ */}
                  <div className="card" style={{ padding: '2rem' }}>
                    <h3 className="card-title" style={{ marginBottom: '1.25rem' }}>📝 Auto-Evaluación del Módulo</h3>
                    
                    {quizResult ? (
                      /* SHOW RESULTS WITH retroalimentation */
                      <div>
                        <div style={{
                          backgroundColor: quizResult.aprobado ? '#e6fffa' : '#fff5f5',
                          border: `1.5px solid ${quizResult.aprobado ? '#047487' : '#e53e3e'}`,
                          padding: '1.5rem',
                          borderRadius: '8px',
                          textAlign: 'center',
                          marginBottom: '2rem'
                        }}>
                          <h4 style={{ color: quizResult.aprobado ? '#047487' : '#e53e3e', fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.25rem' }}>
                            {quizResult.aprobado ? '🎉 ¡APROBADO!' : '❌ INTENTO REPROBADO'}
                          </h4>
                          <p style={{ fontSize: '1.05rem', color: 'var(--text)', margin: 0 }}>
                            Puntaje obtenido: <strong>{quizResult.puntaje} / {quizResult.total_preguntas}</strong> ({Math.round((quizResult.puntaje / quizResult.total_preguntas) * 100)}%)
                          </p>
                          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                            Nota mínima requerida: 70%
                          </p>
                        </div>

                        {/* REVISION DETAILS */}
                        <div style={{ marginBottom: '2rem' }}>
                          <h5 style={{ fontWeight: 'bold', marginBottom: '1rem' }}>Revisión de respuestas:</h5>
                          {quizResult.respuestas_usuario && quizResult.respuestas_usuario.map((q, idx) => (
                            <div key={idx} style={{ 
                              borderBottom: '1px solid var(--border)', 
                              paddingBottom: '1rem', 
                              marginBottom: '1rem' 
                            }}>
                              <p style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.5rem' }}>
                                {idx + 1}. {q.pregunta}
                              </p>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.9rem' }}>
                                {q.opciones.map((op, oIdx) => {
                                  const isSelected = q.seleccionada === oIdx;
                                  const isCorrect = q.correcta === oIdx;
                                  let opStyle = { padding: '0.4rem 0.75rem', borderRadius: '4px', border: '1px solid var(--border)' };
                                  if (isCorrect) {
                                    opStyle.backgroundColor = '#e6fffa';
                                    opStyle.borderColor = '#047487';
                                    opStyle.color = '#047487';
                                    opStyle.fontWeight = '600';
                                  } else if (isSelected) {
                                    opStyle.backgroundColor = '#fff5f5';
                                    opStyle.borderColor = '#e53e3e';
                                    opStyle.color = '#e53e3e';
                                  }
                                  return (
                                    <div key={oIdx} style={opStyle}>
                                      {op} {isCorrect && '✓ (Correcta)'} {isSelected && !isCorrect && '✗ (Tu selección)'}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>

                        <div style={{ display: 'flex', gap: '1rem' }}>
                          {!quizResult.aprobado && (
                            <button 
                              onClick={() => { setQuizResult(null); setQuizAnswers({}); }} 
                              className="btn btn-primary" 
                              style={{ flex: 1 }}
                            >
                              Volver a Intentar Examen ↻
                            </button>
                          )}
                          <button 
                            onClick={() => { setSelectedModule(null); setQuizResult(null); setQuizAnswers({}); }} 
                            className="btn btn-secondary" 
                            style={{ flex: 1 }}
                          >
                            Volver a Temas de Capacitación
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* TAKE QUIZ FORM */
                      <form onSubmit={(e) => { e.preventDefault(); handleSubmitQuiz(selectedModule.id); }}>
                        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '2rem' }}>
                          Responde las preguntas basadas en el contenido teórico del módulo para aprobar y sumar puntos a tu historial.
                        </p>
                        
                        {selectedModule.quiz_preguntas && selectedModule.quiz_preguntas.map((pregunta, pIdx) => (
                          <div key={pIdx} style={{ marginBottom: '2rem' }}>
                            <p style={{ fontWeight: 600, marginBottom: '0.75rem', fontSize: '1rem' }}>
                              {pIdx + 1}. {pregunta.pregunta}
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                              {pregunta.opciones.map((opcion, oIdx) => {
                                const isChecked = quizAnswers[pIdx] === oIdx;
                                return (
                                  <label 
                                    key={oIdx} 
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '0.75rem',
                                      padding: '1rem',
                                      border: `1.5px solid ${isChecked ? 'var(--accent)' : 'var(--border)'}`,
                                      borderRadius: '8px',
                                      background: isChecked ? 'var(--secondary)' : 'none',
                                      cursor: 'pointer',
                                      transition: 'var(--transition)'
                                    }}
                                  >
                                    <input 
                                      type="radio" 
                                      name={`pregunta-${pIdx}`} 
                                      checked={isChecked}
                                      onChange={() => setQuizAnswers(prev => ({ ...prev, [pIdx]: oIdx }))}
                                      style={{ cursor: 'pointer' }}
                                    />
                                    <span style={{ fontSize: '0.95rem', fontWeight: isChecked ? '600' : 'normal' }}>
                                      {opcion}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        ))}

                        <button 
                          type="submit" 
                          className="btn btn-primary" 
                          style={{ width: '100%', padding: '0.9rem', fontSize: '1rem' }} 
                          disabled={learningLoading}
                        >
                          {learningLoading ? 'Evaluando...' : 'Enviar y Evaluar Examen'}
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              ) : (
                /* LIST OF COURSES */
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>
                    {courses.map(course => {
                      const courseAttempts = attempts.filter(att => att.curso_titulo === course.titulo);
                      // Calculate progress percentage
                      const totalModules = course.modulos ? course.modulos.length : 0;
                      const approvedModules = course.modulos ? course.modulos.filter(m => 
                        courseAttempts.some(att => att.modulo_id === m.id && att.aprobado)
                      ).length : 0;
                      
                      const percent = totalModules > 0 ? Math.round((approvedModules / totalModules) * 100) : 0;

                      return (
                        <div key={course.id} className="card" style={{ 
                          display: 'flex', 
                          flexDirection: 'column', 
                          justifyContent: 'space-between',
                          padding: '2rem',
                          height: '100%',
                          position: 'relative'
                        }}>
                          <div>
                            <span className="badge" style={{ 
                              background: percent === 100 ? '#e6fffa' : 'var(--secondary)', 
                              color: percent === 100 ? '#047487' : 'var(--accent)',
                              fontWeight: 'bold',
                              marginBottom: '0.75rem',
                              display: 'inline-block'
                            }}>
                              {percent === 100 ? '✓ Completado' : 'En Curso'}
                            </span>
                            
                            <h3 style={{ fontSize: '1.25rem', color: 'var(--primary)', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                              {course.titulo}
                            </h3>
                            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1.5rem', minHeight: '40px' }}>
                              {course.descripcion}
                            </p>

                            {/* PROGRESS BAR */}
                            <div style={{ marginBottom: '1.5rem' }}>
                              <div style={{ display: 'flex', justifyStyle: 'space-between', display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                                <span>Progreso</span>
                                <span>{approvedModules} / {totalModules} Módulos ({percent}%)</span>
                              </div>
                              <div style={{ width: '100%', background: 'var(--border)', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{ width: `${percent}%`, background: percent === 100 ? '#047487' : 'var(--accent)', height: '100%', transition: 'width 0.5s ease' }}></div>
                              </div>
                            </div>

                            {/* MODULES LIST */}
                            <h4 style={{ fontSize: '0.9rem', fontWeight: 'bold', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '0.75rem' }}>
                              Módulos de Formación:
                            </h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
                              {course.modulos && course.modulos.map(mod => {
                                const modAttempts = courseAttempts.filter(att => att.modulo_id === mod.id);
                                const isApproved = modAttempts.some(att => att.aprobado);
                                const hasFailed = modAttempts.length > 0 && !isApproved;

                                return (
                                  <div key={mod.id} style={{ 
                                    display: 'flex', 
                                    justifyContent: 'space-between', 
                                    alignItems: 'center', 
                                    padding: '0.6rem 0.8rem', 
                                    background: 'var(--surface-muted)',
                                    borderRadius: '6px',
                                    fontSize: '0.85rem'
                                  }}>
                                    <span style={{ fontWeight: 500, color: 'var(--text)' }}>{mod.titulo}</span>
                                    
                                    {isApproved ? (
                                      <span style={{ color: '#047487', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                        ✓ Aprobado
                                      </span>
                                    ) : hasFailed ? (
                                      <span style={{ color: '#e53e3e', fontWeight: 'bold' }}>
                                        ✗ Reprobado
                                      </span>
                                    ) : (
                                      <span style={{ color: 'var(--text-muted)' }}>
                                        Pendiente
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            {course.modulos && course.modulos.map((mod, mIndex) => {
                              const isApproved = courseAttempts.some(att => att.modulo_id === mod.id && att.aprobado);
                              return (
                                <button 
                                  key={mod.id}
                                  onClick={() => {
                                    setSelectedCourse(course);
                                    setSelectedModule(mod);
                                    setQuizAnswers({});
                                    setQuizResult(null);
                                  }}
                                  className={`btn ${isApproved ? 'btn-secondary' : 'btn-primary'}`}
                                  style={{ flex: 1, padding: '0.5rem 0.25rem', fontSize: '0.78rem' }}
                                >
                                  {isApproved ? `Mod ${mIndex + 1} ✓` : `Estudiar Mod ${mIndex + 1}`}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* ATTEMPTS HISTORY */}
                  <div className="card" style={{ marginTop: '3rem', padding: '2rem' }}>
                    <h3 className="card-title" style={{ marginBottom: '1.5rem' }}>📋 Historial de Mis Evaluaciones</h3>
                    <div className="table-container">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Fecha</th>
                            <th>Curso</th>
                            <th>Módulo</th>
                            <th>Puntaje</th>
                            <th>Porcentaje</th>
                            <th>Estatus</th>
                          </tr>
                        </thead>
                        <tbody>
                          {attempts.length === 0 ? (
                            <tr><td colSpan="6" className="text-center">No has realizado ninguna evaluación teórica aún.</td></tr>
                          ) : (
                            attempts.map((att) => (
                              <tr key={att.id}>
                                <td>{new Date(att.created_at).toLocaleDateString('es-VE')} {new Date(att.created_at).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}</td>
                                <td>{att.curso_titulo}</td>
                                <td><strong>{att.modulo_titulo}</strong></td>
                                <td>{att.puntaje} / {att.total_preguntas}</td>
                                <td>{Math.round((att.puntaje / att.total_preguntas) * 100)}%</td>
                                <td>
                                  <span style={{ 
                                    padding: '0.2rem 0.5rem', 
                                    borderRadius: '4px', 
                                    fontWeight: 'bold',
                                    fontSize: '0.8rem',
                                    backgroundColor: att.aprobado ? '#e6fffa' : '#fff5f5', 
                                    color: att.aprobado ? '#047487' : '#e53e3e' 
                                  }}>
                                    {att.aprobado ? 'APROBADO' : 'REPROBADO'}
                                  </span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MODAL DE ENVÍO DE DOCUMENTOS */}
          {docModalOpen && selectedClientForDocs && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: '1rem'
            }}>
              <div className="card" style={{ maxWidth: '450px', width: '100%', margin: 0, cursor: 'default' }}>
                <h3 className="card-title" style={{ marginBottom: '1.25rem', border: 'none' }}>Enviar Documentación de Seguro</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                  Seleccione qué tipo de seguro de salud o patrimonial desea enviar por correo electrónico a <strong>{selectedClientForDocs.nombre}</strong> ({selectedClientForDocs.correo}).
                </p>
                <form onSubmit={handleSendDocsSubmit}>
                  <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                    <label className="form-label">Tipo de Seguro *</label>
                    <select
                      className="form-input"
                      value={selectedDocType}
                      onChange={e => setSelectedDocType(e.target.value)}
                      required
                    >
                      <option value="Salud">Seguro de Salud</option>
                      <option value="Vida">Seguro de Vida</option>
                      <option value="Vehiculo">Seguro de Vehículo</option>
                      <option value="Hogar">Seguro de Hogar / Patrimonial</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setDocModalOpen(false)}
                      disabled={loading}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={loading}
                    >
                      {loading ? 'Enviando...' : 'Enviar por Correo'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* MODAL PARA REPORTAR PAGO EN DÓLARES O BOLÍVARES */}
          {reportPayModal && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 9999,
              padding: '1rem'
            }}>
              <div className="card" style={{
                maxWidth: '520px',
                width: '100%',
                maxHeight: '90vh',
                overflowY: 'auto',
                padding: '2rem',
                borderRadius: '12px',
                background: '#ffffff',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
                  <h3 style={{ margin: 0, color: 'var(--primary)', fontWeight: 800, fontSize: '1.2rem' }}>
                    💳 Reportar Cobro / Pago de Prima
                  </h3>
                  <button 
                    onClick={() => setReportPayModal(null)}
                    style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-muted)' }}
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleSendPaymentReport}>
                  <div style={{ marginBottom: '1.25rem', padding: '0.85rem', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '0.85rem' }}>
                    <p style={{ margin: '0 0 0.35rem 0' }}><strong>Póliza:</strong> {reportPayModal.poliza_codigo}</p>
                    <p style={{ margin: '0 0 0.35rem 0' }}><strong>Cliente:</strong> {reportPayModal.cliente_nombre}</p>
                    <p style={{ margin: '0 0 0.35rem 0' }}><strong>Compañía:</strong> {reportPayModal.compania_nombre}</p>
                    <p style={{ margin: 0, color: 'var(--primary)', fontWeight: 700, fontSize: '0.95rem' }}>
                      <strong>Cuota Referencial:</strong> ${reportPayModal.monto} USD
                    </p>
                  </div>

                  <div style={{ padding: '0.85rem', backgroundColor: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe', marginBottom: '1.25rem', fontSize: '0.85rem', color: '#1e40af' }}>
                    ℹ️ <strong>Información:</strong> Ingrese el monto en <strong>Bolívares (Bs. VES)</strong> pagado a la tasa oficial del BCV del día de la transferencia o pago móvil. El administrador verificará el comprobante bancario.
                  </div>

                  {/* Campo Destacado de Monto en Bolívares */}
                  <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                    <label className="form-label" style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--primary)', marginBottom: '0.4rem' }}>
                      🇻🇪 Monto Pagado en Bolívares (Bs. VES) *
                    </label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <span style={{ position: 'absolute', left: '1rem', fontWeight: 800, fontSize: '1.3rem', color: '#2563eb' }}>
                        Bs.
                      </span>
                      <input 
                        type="text" 
                        inputMode="decimal"
                        className="form-input" 
                        style={{ 
                          paddingLeft: '3.75rem', 
                          fontSize: '1.35rem', 
                          fontWeight: 800, 
                          color: '#1e3a8a', 
                          height: '52px',
                          border: '2px solid #3b82f6',
                          backgroundColor: '#f0f7ff',
                          borderRadius: '8px',
                          letterSpacing: '0.02em'
                        }}
                        placeholder="0,00"
                        value={reportPayForm.monto_reportado_ves} 
                        onChange={e => {
                          let val = e.target.value.replace(/[^0-9.,]/g, '');
                          setReportPayForm({ ...reportPayForm, monto_reportado_ves: val });
                        }}
                        required 
                      />
                    </div>
                    <span style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.35rem', display: 'block' }}>
                      💡 Escriba el monto pagado (puede usar coma o punto para los céntimos, ej: <strong>1.500,50</strong> o <strong>1500.50</strong>).
                    </span>
                  </div>

                  <div className="form-grid" style={{ marginBottom: '1rem' }}>
                    <div className="form-group">
                      <label className="form-label">Fecha del Pago *</label>
                      <input 
                        type="date" 
                        className="form-input" 
                        value={reportPayForm.fecha_pago} 
                        onChange={e => setReportPayForm({ ...reportPayForm, fecha_pago: e.target.value })}
                        required 
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Número de Referencia Bancaria *</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="Ej: 9876543210"
                        value={reportPayForm.referencia} 
                        onChange={e => setReportPayForm({ ...reportPayForm, referencia: e.target.value })}
                        required 
                      />
                    </div>
                  </div>

                  <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                    <label className="form-label">Banco Emisor / Observaciones (Opcional)</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="Ej: Pago Móvil Banesco, Transferencia Mercantil..."
                      value={reportPayForm.observaciones} 
                      onChange={e => setReportPayForm({ ...reportPayForm, observaciones: e.target.value })}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setReportPayModal(null)}
                      disabled={loading}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={loading}
                    >
                      {loading ? 'Enviando Reporte...' : '✓ Enviar Reporte de Pago'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
