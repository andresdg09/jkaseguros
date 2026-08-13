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
  const [companies, setCompanies] = useState([]);
  const [policyForm, setPolicyForm] = useState({ cliente_id: '', compania_id: '', plan: '', suma_asegurada: 5000, prima_anual: 300 });
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
          cliente_id: parseInt(policyForm.cliente_id)
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
        prima_anual: 300
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
    try {
      const res = await fetch(`${API_URL}/payments/${paymentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ estado_pago: newStatus })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al actualizar el pago.');
      
      showToast('Cobranza registrada correctamente.');
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

  // --- FILTRADO DE DATOS ---
  const filteredClients = clients.filter(c =>
    !searchQuery ||
    c.nombre?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.nro_documento?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.telefono?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.correo?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredPayments = payments.filter(pa =>
    !searchQuery ||
    pa.poliza_codigo?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    pa.cliente_nombre?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    pa.compania_nombre?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    pa.referencia?.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
              <div style={{ marginBottom: '1.2rem' }}>
                <input
                  type="text"
                  placeholder="🔍 Buscar cobros por póliza, cliente, compañía o referencia..."
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
                      <th>Código Póliza</th>
                      <th>Cliente</th>
                      <th>Compañía</th>
                      <th>Monto Cuota</th>
                      <th>Referencia Informada</th>
                      <th>Fecha Vencimiento</th>
                      <th>Recordatorios</th>
                      <th>Marcar Pago</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPayments.length === 0 ? (
                      <tr><td colSpan="8" className="text-center">No hay cuotas registradas que coincidan con la búsqueda.</td></tr>
                    ) : (
                      filteredPayments.map((pa) => (
                        <tr key={pa.id}>
                          <td><strong>{pa.poliza_codigo}</strong></td>
                          <td>{pa.cliente_nombre}</td>
                          <td>{pa.compania_nombre}</td>
                          <td>${parseFloat(pa.monto).toLocaleString('en-US')}</td>
                          <td>
                            {pa.referencia ? (
                              <span style={{ fontFamily: 'monospace', background: 'var(--secondary)', padding: '0.2rem 0.4rem', borderRadius: '4px' }}>
                                {pa.referencia}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Sin Reportar</span>
                            )}
                          </td>
                          <td>{pa.fecha_vencimiento ? pa.fecha_vencimiento.split('T')[0] : 'N/A'}</td>
                          <td>
                            {pa.estado_pago === 'pendiente' ? (
                              <div style={{ display: 'flex', gap: '0.25rem' }}>
                                <button 
                                  onClick={() => sendWhatsAppReminder(pa)} 
                                  className="btn"
                                  style={{ background: '#25d366', color: '#fff', border: 'none', fontSize: '0.75rem', padding: '0.2rem 0.4rem', cursor: 'pointer' }}
                                >
                                  WhatsApp
                                </button>
                                <button 
                                  onClick={() => sendEmailReminder(pa)} 
                                  className="btn btn-secondary"
                                  style={{ fontSize: '0.75rem', padding: '0.2rem 0.4rem', cursor: 'pointer' }}
                                >
                                  Email
                                </button>
                              </div>
                            ) : (
                              <span style={{ color: '#10b981', fontWeight: 'bold', fontSize: '0.85rem' }}>✓ Confirmado</span>
                            )}
                          </td>
                          <td>
                            <select
                              value={pa.estado_pago}
                              onChange={(e) => handleUpdatePaymentStatus(pa.id, e.target.value)}
                              style={{ 
                                padding: '0.25rem', 
                                borderRadius: '4px', 
                                border: '1px solid var(--border)',
                                fontWeight: 'bold',
                                color: pa.estado_pago === 'pagado' ? '#10b981' : pa.estado_pago === 'pendiente' ? '#f59e0b' : '#ef4444'
                              }}
                            >
                              <option value="pendiente">Pendiente</option>
                              <option value="pagado">Pagado</option>
                              <option value="vencido">Vencido</option>
                            </select>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
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
                  <label className="form-label">Plan / Modalidad *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ej: PLATINO, ACCESS, SALUD EXTERIOR..."
                    value={policyForm.plan}
                    onChange={e => setPolicyForm({...policyForm, plan: e.target.value})}
                    required
                  />
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
        </div>
      )}
    </div>
  );
}
