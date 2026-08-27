"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/ToastProvider';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PaginationControls from '../../components/PaginationControls';

// Normaliza la URL base: si NEXT_PUBLIC_API_URL viene sin el sufijo /api
// (mala configuración en Vercel), lo agregamos igual para no romper todas las requests.
function normalizeApiUrl(url) {
  const trimmed = url.replace(/\/+$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}
const API_URL = normalizeApiUrl(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api');

export default function AdminDashboard() {
  const { token, isLoggedIn, user, hydrated } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();

  const [policies, setPolicies] = useState([]);
  const [payments, setPayments] = useState([]);
  const [tempRefs, setTempRefs] = useState({});
  const [users, setUsers] = useState([]);
  const [advisors, setAdvisors] = useState([]);
  const [clients, setClients] = useState([]);
  const [logs, setLogs] = useState([]);
  const [tariffs, setTariffs] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [modifiedRows, setModifiedRows] = useState({});
  const [modifiedPolicies, setModifiedPolicies] = useState({});

  // --- PAGINACIÓN ---
  const [pagePolicies, setPagePolicies] = useState(1);
  const [pageSizePolicies, setPageSizePolicies] = useState(10);

  const [pagePayments, setPagePayments] = useState(1);
  const [pageSizePayments, setPageSizePayments] = useState(10);

  const [pageUsers, setPageUsers] = useState(1);
  const [pageSizeUsers, setPageSizeUsers] = useState(10);

  const [pageAdvisors, setPageAdvisors] = useState(1);
  const [pageSizeAdvisors, setPageSizeAdvisors] = useState(10);

  const [pageAttempts, setPageAttempts] = useState(1);
  const [pageSizeAttempts, setPageSizeAttempts] = useState(10);

  const [pageLogs, setPageLogs] = useState(1);
  const [pageSizeLogs, setPageSizeLogs] = useState(10);
  
  // --- ESTADOS DE E-LEARNING (ADMIN) ---
  const [courses, setCourses] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedModule, setSelectedModule] = useState(null);
  const [courseForm, setCourseForm] = useState({ titulo: '', descripcion: '' });
  const [moduleForm, setModuleForm] = useState({ titulo: '', contenido: '', orden: 1, quiz_preguntas: [] });
  const [isEditingCourse, setIsEditingCourse] = useState(null); // 'new', 'edit', or null
  const [isEditingModule, setIsEditingModule] = useState(null); // 'new', 'edit', or null
  const [showProgressDetail, setShowProgressDetail] = useState(null); // attempt object or null
  const [elearningLoading, setElearningLoading] = useState(false);
  const [adminSubTab, setAdminSubTab] = useState('reportes'); // 'reportes', 'editor'
  
  // --- ESTADOS PARA GESTIÓN DE ASESORES ---
  const [advisorForm, setAdvisorForm] = useState({
    nombre: '',
    cedula: '',
    correo: '',
    contrasena: '',
    telefono: '',
    banco: '',
    fecha_nacimiento: '',
    numero_cuenta: ''
  });
  const [showAdvisorModal, setShowAdvisorModal] = useState(false);
  const [submittingAdvisor, setSubmittingAdvisor] = useState(false);

  // --- ESTADOS PARA EMISIÓN DIRECTA DE PÓLIZAS ---
  const [showNewPolicyModal, setShowNewPolicyModal] = useState(false);
  const [submittingNewPolicy, setSubmittingNewPolicy] = useState(false);
  const [newPolicyForm, setNewPolicyForm] = useState({
    cliente_id: '',
    codigo_poliza: '',
    compania_id: '1',
    plan: '',
    area: 'Salud',
    suma_asegurada: '10000',
    deducible: '0',
    prima_anual: '',
    frecuencia_pago: 'contado',
    tipo_negocio: 'nuevo',
    tipo_cobertura: 'individual',
    asesor_id: '',
    estado: 'vigente'
  });

  // --- ESTADOS PARA CREACIÓN E EDICIÓN INTUITIVA DE TARIFAS ---
  const [showNewTariffModal, setShowNewTariffModal] = useState(false);
  const [editingTariffId, setEditingTariffId] = useState(null);
  const [submittingNewTariff, setSubmittingNewTariff] = useState(false);
  const [newTariffForm, setNewTariffForm] = useState({
    compania_id: '1',
    plan: '',
    ramo: 'Salud',
    edad_min: 18,
    edad_max: 29,
    suma_asegurada: 5000,
    deducible: 0,
    prima: 100,
    pago_contado: true,
    pago_semestral: true,
    pago_cuatrimestral: false,
    pago_trimestral: true,
    pago_bimestral: false,
    pago_4_cuotas: false,
    pago_mensual: true,
    atencion_medica_primaria: true,
    medicinas: true,
    consultas_medicas: true,
    rehabilitacion: false,
    protesis: false,
    muleta_silla_ruedas: false,
    examenes_lab_imagenologia: true,
    consultas: true,
    maternidad: false,
    maternidad_suma: '',
    maternidad_costo: '',
    oftalmologia: false,
    odontologia: false,
    muerte_accidental: false,
    muerte_accidental_suma: '',
    muerte_accidental_costo: '',
    invalidez_permanente: false,
    invalidez_permanente_suma: '',
    invalidez_permanente_costo: '',
    ambulancia: true,
    asist_intl_suma: '',
    asist_intl_costo: '',
    funeral_suma: '',
    funeral_costo: ''
  });

  // --- ESTADOS INTERNOS ---
  const [loading, setLoading] = useState(true);
  const [clearingData, setClearingData] = useState(false);
  const [activeTab, setActiveTab] = useState('resumen'); // 'resumen', 'polizas', 'pagos', 'roles', 'tarifas', 'trazabilidad'
  const [fileToUpload, setFileToUpload] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCompany, setFilterCompany] = useState('todas'); // 'todas' o id de aseguradora
  const [filterSuma, setFilterSuma] = useState('todas'); // 'todas' o suma asegurada
  const [filterRamo, setFilterRamo] = useState('todos'); // 'todos' o nombre del ramo
  const [groupBySuma, setGroupBySuma] = useState(false);
  const [expandedPolicies, setExpandedPolicies] = useState({});
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('todos'); // 'todos', 'en_revision', 'pendiente', 'pagado', 'vencido'
  const [tarifarioMeta, setTarifarioMeta] = useState(null);
  const [tariffView, setTariffView] = useState('comparativa'); // 'comparativa' o 'excel'
  const [resizingCol, setResizingCol] = useState(null);
  const [detailedColWidths, setDetailedColWidths] = useState({
    compania_id: 140,
    plan: 100,
    ramo: 90,
    pago_contado: 75,
    pago_semestral: 75,
    pago_cuatrimestral: 85,
    pago_trimestral: 75,
    pago_bimestral: 80,
    pago_4_cuotas: 95,
    pago_mensual: 75,
    edad_min: 70,
    edad_max: 70,
    suma_asegurada: 110,
    deducible: 90,
    prima: 90,
    rehabilitacion: 95,
    atencion_medica_primaria: 105,
    medicinas: 95,
    consultas_medicas: 95,
    protesis: 80,
    muleta_silla_ruedas: 115,
    examenes_lab_imagenologia: 90,
    consultas: 80,
    maternidad: 85,
    oftalmologia: 95,
    odontologia: 95,
    muerte_accidental: 95,
    muerte_accidental_suma: 105,
    muerte_accidental_costo: 105,
    invalidez_permanente: 95,
    invalidez_permanente_suma: 105,
    invalidez_permanente_costo: 105,
    ambulancia: 90,
    maternidad_suma: 100,
    maternidad_costo: 100,
    asist_intl_suma: 100,
    asist_intl_costo: 100,
    funeral_suma: 100,
    funeral_costo: 100,
    acciones: 110
  });
  const [comparativeColWidths, setComparativeColWidths] = useState({});

  // Redirigir si no es admin
  useEffect(() => {
    if (hydrated) {
      if (!isLoggedIn) {
        router.push('/login');
      } else if (user?.rango !== 'admin') {
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
      // 1. Cargar pólizas
      const resPols = await fetch(`${API_URL}/policies`, { headers: { 'Authorization': `Bearer ${token}` } });
      const dataPols = await resPols.json();
      setPolicies(Array.isArray(dataPols) ? dataPols : []);

      // 2. Cargar pagos
      const resPays = await fetch(`${API_URL}/payments/admin`, { headers: { 'Authorization': `Bearer ${token}` } });
      const dataPays = await resPays.json();
      setPayments(Array.isArray(dataPays) ? dataPays : []);

      // 3. Cargar usuarios
      const resUsers = await fetch(`${API_URL}/admin/users`, { headers: { 'Authorization': `Bearer ${token}` } });
      const dataUsers = await resUsers.json();
      setUsers(Array.isArray(dataUsers) ? dataUsers : []);

      // 4. Cargar asesores (detalle administrativo)
      const resAdvs = await fetch(`${API_URL}/admin/advisors`, { headers: { 'Authorization': `Bearer ${token}` } });
      const dataAdvs = await resAdvs.json();
      setAdvisors(Array.isArray(dataAdvs) ? dataAdvs : []);

      // 5. Cargar clientes
      const resClients = await fetch(`${API_URL}/admin/clients`, { headers: { 'Authorization': `Bearer ${token}` } });
      const dataClients = await resClients.json();
      setClients(Array.isArray(dataClients) ? dataClients : []);

      // 6. Cargar logs de trazabilidad
      const resLogs = await fetch(`${API_URL}/admin/logs`, { headers: { 'Authorization': `Bearer ${token}` } });
      const dataLogs = await resLogs.json();
      setLogs(Array.isArray(dataLogs) ? dataLogs : []);

      // 7. Cargar tarifas
      const resTariffs = await fetch(`${API_URL}/admin/tariffs`, { headers: { 'Authorization': `Bearer ${token}` } });
      const dataTariffs = await resTariffs.json();
      const normalizedTariffs = Array.isArray(dataTariffs) ? dataTariffs.map(t => ({
        ...t,
        pago_contado: !!(t.pago_contado === true || t.pago_contado === 'true' || t.pago_contado === 1),
        pago_semestral: !!(t.pago_semestral === true || t.pago_semestral === 'true' || t.pago_semestral === 1),
        pago_cuatrimestral: !!(t.pago_cuatrimestral === true || t.pago_cuatrimestral === 'true' || t.pago_cuatrimestral === 1),
        pago_trimestral: !!(t.pago_trimestral === true || t.pago_trimestral === 'true' || t.pago_trimestral === 1),
        pago_bimestral: !!(t.pago_bimestral === true || t.pago_bimestral === 'true' || t.pago_bimestral === 1),
        pago_4_cuotas: !!(t.pago_4_cuotas === true || t.pago_4_cuotas === 'true' || t.pago_4_cuotas === 1),
        pago_mensual: !!(t.pago_mensual === true || t.pago_mensual === 'true' || t.pago_mensual === 1),
        atencion_medica_primaria: !!(t.atencion_medica_primaria === true || t.atencion_medica_primaria === 'true' || t.atencion_medica_primaria === 'INCL' || t.at_situ_medicamentos === 'INCL'),
        medicinas: !!(t.medicinas === true || t.medicinas === 'true' || t.medicinas === 'INCL'),
        consultas_medicas: !!(t.consultas_medicas === true || t.consultas_medicas === 'true' || t.consultas_medicas === 'INCL' || (typeof t.consultas_medicas === 'string' && t.consultas_medicas.length > 0 && t.consultas_medicas !== 'NO' && t.consultas_medicas !== 'false')),
        rehabilitacion: !!(t.rehabilitacion === true || t.rehabilitacion === 'true' || t.rehabilitacion === 'INCL'),
        protesis: !!(t.protesis === true || t.protesis === 'true' || t.protesis === 'INCL'),
        muleta_silla_ruedas: !!(t.muleta_silla_ruedas === true || t.muleta_silla_ruedas === 'true' || t.muleta_silla_ruedas === 'INCL'),
        consultas: !!(t.consultas === true || t.consultas === 'true' || t.consultas === 'INCL'),
        maternidad: !!(t.maternidad === true || t.maternidad === 'true' || t.maternidad === 'INCL' || (t.maternidad_suma && String(t.maternidad_suma).trim().length > 0 && t.maternidad_suma !== '0' && t.maternidad_suma !== '$0')),
        oftalmologia: !!(t.oftalmologia === true || t.oftalmologia === 'true' || t.oftalmologia === 'INCL'),
        odontologia: !!(t.odontologia === true || t.odontologia === 'true' || t.odontologia === 'INCL'),
        muerte_accidental: !!(t.muerte_accidental === true || t.muerte_accidental === 'true' || t.muerte_accidental === 'INCL' || (t.muerte_accidental_suma && String(t.muerte_accidental_suma).trim().length > 0 && t.muerte_accidental_suma !== '0' && t.muerte_accidental_suma !== '$0')),
        invalidez_permanente: !!(t.invalidez_permanente === true || t.invalidez_permanente === 'true' || t.invalidez_permanente === 'INCL' || (t.invalidez_permanente_suma && String(t.invalidez_permanente_suma).trim().length > 0 && t.invalidez_permanente_suma !== '0' && t.invalidez_permanente_suma !== '$0')),
        examenes_lab_imagenologia: t.examenes_lab_imagenologia || '',
        ambulancia: t.ambulancia || ''
      })) : [];
      setTariffs(normalizedTariffs);

      // 8. Cargar compañías
      const resCompanies = await fetch(`${API_URL}/admin/companies`, { headers: { 'Authorization': `Bearer ${token}` } });
      const dataCompanies = await resCompanies.json();
      setCompanies(Array.isArray(dataCompanies) ? dataCompanies : []);

      // 9. Cargar metadatos de versión del tarifario
      try {
        const resMeta = await fetch(`${API_URL}/admin/tarifario-metadata`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (resMeta.ok) {
          const dataMeta = await resMeta.json();
          setTarifarioMeta(dataMeta);
        }
      } catch (err) {
        console.error('Error al cargar metadatos de tarifario:', err);
      }

    } catch (err) {
      console.error('Error al cargar datos de administración:', err);
      showToast('Error al conectar con la base de datos.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (hydrated && isLoggedIn && user?.rango === 'admin') {
      const timer = setTimeout(() => {
        loadData();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [hydrated, isLoggedIn, user]);

  const handleRegisterAdvisor = async (e) => {
    e.preventDefault();
    if (!advisorForm.nombre || !advisorForm.cedula || !advisorForm.correo || !advisorForm.contrasena || !advisorForm.telefono || !advisorForm.banco || !advisorForm.fecha_nacimiento || !advisorForm.numero_cuenta) {
      return showToast('Por favor rellenar todos los campos obligatorios.', 'error');
    }
    setSubmittingAdvisor(true);
    try {
      const res = await fetch(`${API_URL}/admin/advisors`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(advisorForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al registrar asesor');

      showToast(`Asesor registrado con éxito.`);
      setAdvisorForm({
        nombre: '',
        cedula: '',
        correo: '',
        contrasena: '',
        telefono: '',
        banco: '',
        fecha_nacimiento: '',
        numero_cuenta: ''
      });
      setShowAdvisorModal(false);
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmittingAdvisor(false);
    }
  };

  const handleCreateNewPolicy = async (e) => {
    e.preventDefault();
    if (!newPolicyForm.cliente_id || !newPolicyForm.compania_id || !newPolicyForm.suma_asegurada || !newPolicyForm.prima_anual) {
      return showToast('Por favor seleccione el cliente, compañía, suma asegurada y prima anual.', 'error');
    }
    setSubmittingNewPolicy(true);
    try {
      const res = await fetch(`${API_URL}/policies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newPolicyForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al emitir póliza');

      showToast(`¡Póliza ${data.poliza?.codigo_poliza || ''} emitida con éxito!`);
      setShowNewPolicyModal(false);
      setNewPolicyForm({
        cliente_id: '',
        codigo_poliza: '',
        compania_id: '1',
        plan: '',
        area: 'Salud',
        suma_asegurada: '10000',
        deducible: '0',
        prima_anual: '',
        frecuencia_pago: 'contado',
        tipo_negocio: 'nuevo',
        tipo_cobertura: 'individual',
        asesor_id: '',
        estado: 'vigente'
      });
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmittingNewPolicy(false);
    }
  };

  const handleDeleteAdvisor = async (id) => {
    if (!confirm('¿Está seguro de que desea eliminar este asesor y su cuenta de usuario asociada? Esta acción no se puede deshacer.')) return;
    try {
      const res = await fetch(`${API_URL}/admin/advisors/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al eliminar asesor');

      showToast('Asesor eliminado con éxito.');
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleUpdateAdvisorStatus = async (id, status) => {
    try {
      const res = await fetch(`${API_URL}/admin/advisors/${id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ estado: status })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al cambiar estado del asesor.');

      showToast(`Asesor actualizado a estado: ${status}.`);
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleUpdateAdvisorLevel = async (id, level) => {
    try {
      const res = await fetch(`${API_URL}/admin/advisors/${id}/level`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ tipo_asesor: level })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al cambiar nivel del asesor.');

      showToast(`Nivel jerárquico actualizado con éxito.`);
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const loadElearningData = async () => {
    if (!token) return;
    setElearningLoading(true);
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
      setElearningLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'elearning' && token) {
      const timer = setTimeout(() => {
        loadElearningData();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [activeTab, token]);

  const handleSaveCourse = async (e) => {
    e.preventDefault();
    if (!courseForm.titulo.trim()) return showToast('El título del curso es obligatorio.', 'error');

    setElearningLoading(true);
    try {
      const isEdit = isEditingCourse === 'edit';
      const url = isEdit ? `${API_URL}/elearning/courses/${selectedCourse.id}` : `${API_URL}/elearning/courses`;
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(courseForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar el curso');

      showToast(isEdit ? 'Curso actualizado con éxito.' : 'Curso creado con éxito.', 'success');
      setIsEditingCourse(null);
      setCourseForm({ titulo: '', descripcion: '' });
      setSelectedCourse(null);
      loadElearningData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setElearningLoading(false);
    }
  };

  const handleDeleteCourse = async (courseId) => {
    if (!window.confirm('¿Está seguro de que desea eliminar este curso y todos sus módulos asociados? Esta acción no se puede deshacer.')) return;

    setElearningLoading(true);
    try {
      const res = await fetch(`${API_URL}/elearning/courses/${courseId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al eliminar el curso');

      showToast('Curso eliminado con éxito.', 'success');
      setSelectedCourse(null);
      loadElearningData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setElearningLoading(false);
    }
  };

  const handleSaveModule = async (e) => {
    e.preventDefault();
    if (!moduleForm.titulo.trim() || !moduleForm.contenido.trim()) {
      return showToast('El título y contenido del módulo son requeridos.', 'error');
    }

    setElearningLoading(true);
    try {
      const isEdit = isEditingModule === 'edit';
      const url = isEdit 
        ? `${API_URL}/elearning/modules/${selectedModule.id}` 
        : `${API_URL}/elearning/courses/${selectedCourse.id}/modules`;
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(moduleForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar el módulo');

      showToast(isEdit ? 'Módulo actualizado con éxito.' : 'Módulo creado con éxito.', 'success');
      setIsEditingModule(null);
      setModuleForm({ titulo: '', contenido: '', orden: 1, quiz_preguntas: [] });
      setSelectedModule(null);
      loadElearningData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setElearningLoading(false);
    }
  };

  const handleDeleteModule = async (moduleId) => {
    if (!window.confirm('¿Está seguro de que desea eliminar este módulo?')) return;

    setElearningLoading(true);
    try {
      const res = await fetch(`${API_URL}/elearning/modules/${moduleId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al eliminar el módulo');

      showToast('Módulo eliminado con éxito.', 'success');
      setSelectedModule(null);
      loadElearningData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setElearningLoading(false);
    }
  };

  // Cambiar estado de póliza
  const handleUpdatePolicyStatus = async (policyId, newStatus) => {
    try {
      const res = await fetch(`${API_URL}/policies/${policyId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ estado: newStatus })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al cambiar estado');

      showToast('Estado de póliza actualizado correctamente.');
      loadData(); // Recargar datos para actualizar logs e info
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Reasignar asesor a una póliza
  const handleUpdatePolicyAdvisor = async (policyId, newAdvisorId) => {
    try {
      const res = await fetch(`${API_URL}/policies/${policyId}/advisor`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ asesor_id: newAdvisorId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al reasignar asesor.');
      
      showToast('Asesor reasignado con éxito.');
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Cambios locales en celdas de póliza
  const handlePolicyCellChange = (id, field, value) => {
    setPolicies(prev => prev.map(p => {
      if (p.id === id) {
        return { ...p, [field]: value };
      }
      return p;
    }));
    setModifiedPolicies(prev => ({ ...prev, [id]: true }));
  };

  // Guardar cambios integrales en póliza (Admin)
  const handleSavePolicy = async (policy) => {
    try {
      const res = await fetch(`${API_URL}/policies/${policy.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          asesor_id: policy.asesor_id ? parseInt(policy.asesor_id) : null,
          compania_id: parseInt(policy.compania_id),
          plan: policy.plan,
          suma_asegurada: parseFloat(policy.suma_asegurada),
          prima_anual: parseFloat(policy.prima_anual),
          estado: policy.estado,
          frecuencia_pago: policy.frecuencia_pago || 'contado',
          tipo_negocio: policy.tipo_negocio || 'nuevo',
          tipo_cobertura: policy.tipo_cobertura || 'individual',
          bono_pronto_pago: !!policy.bono_pronto_pago,
          emision_online: !!policy.emision_online
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al actualizar póliza');

      showToast('Póliza guardada y emitida correctamente.');
      setModifiedPolicies(prev => {
        const copy = { ...prev };
        delete copy[policy.id];
        return copy;
      });
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Guardar todas las pólizas modificadas en lote (bulk)
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

  // Descartar cambios locales en pólizas
  const handleDiscardPolicyChanges = () => {
    if (confirm('¿Está seguro de que desea descartar todos los cambios no guardados en las pólizas?')) {
      setModifiedPolicies({});
      loadData();
    }
  };

  // Cambiar estado de pago
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
      
      showToast('Estado de pago actualizado.');
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

  // Administrador: Verificar y Aprobar o Rechazar pago reportado
  const handleVerifyPayment = async (paymentId, accion, motivo = '') => {
    try {
      const res = await fetch(`${API_URL}/payments/${paymentId}/verify`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ accion, motivo_rechazo: motivo })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al verificar el pago');

      setPayments(prev => prev.map(p => {
        if (p.id === paymentId) {
          return {
            ...p,
            estado_pago: accion === 'aprobar' ? 'pagado' : 'rechazado',
            motivo_rechazo: accion === 'rechazar' ? motivo : p.motivo_rechazo
          };
        }
        return p;
      }));

      if (accion === 'aprobar') {
        showToast('¡Pago verificado y aprobado con éxito! La comisión fue registrada para la corrida del BNC.');
      } else {
        showToast('El pago ha sido marcado como rechazado.', 'info');
      }
      await loadData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Limpiar datos de prueba (cotizaciones, pólizas, pagos y comisiones) conservando usuarios
  const handleClearTestData = async () => {
    const confirmMsg = '⚠️ ¿Está seguro de que desea limpiar todos los datos de prueba?\\n\\nEsta acción eliminará todas las cotizaciones compartidas, pólizas, pagos y registros de comisiones generados durante las pruebas.\\n\\nLos usuarios, clientes, asesores y tarifas permanecerán INTACTOS.';
    if (!window.confirm(confirmMsg)) return;

    setClearingData(true);
    try {
      const res = await fetch(`${API_URL}/admin/clear-test-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al limpiar datos de prueba.');

      showToast(data.message || '¡Datos de prueba eliminados correctamente!');
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setClearingData(false);
    }
  };

  // Cambiar rol de usuario
  const handleUpdateUserRole = async (userId, newRole) => {
    try {
      const res = await fetch(`${API_URL}/admin/users/${userId}/role`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ rango: newRole })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al cambiar rango');

      showToast('Rol de usuario actualizado correctamente.');
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // --- MANEJADORES EDITOR EXCEL TARIFAS ---
  const handleCellChange = (id, field, value) => {
    setTariffs(prev => prev.map(t => {
      if (t.id === id) {
        return { ...t, [field]: value };
      }
      return t;
    }));
    setModifiedRows(prev => ({ ...prev, [id]: true }));
  };

  const handleCellMultipleChanges = (id, updates) => {
    setTariffs(prev => prev.map(t => {
      if (t.id === id) {
        return { ...t, ...updates };
      }
      return t;
    }));
    setModifiedRows(prev => ({ ...prev, [id]: true }));
  };

  // Igual que handleCellMultipleChanges, pero para checkboxes de "servicios incluidos":
  // después de aplicar el cambio a la fila actual, ofrece replicarlo a todas las demás
  // filas del mismo plan (misma aseguradora + mismo nombre de plan), sin importar el
  // rango de edad o la suma asegurada de cada fila.
  const handleBenefitChange = (id, updates, label) => {
    handleCellMultipleChanges(id, updates);

    const source = tariffs.find(t => t.id === id);
    if (!source || !source.plan) return;

    const planKey = (t) => `${t.compania_id}|${String(t.plan || '').trim().toUpperCase()}`;
    const key = planKey(source);
    const siblings = tariffs.filter(t => t.id !== id && planKey(t) === key);
    if (siblings.length === 0) return;

    const isIncluded = !!Object.values(updates)[0];
    const confirmMsg = `¿Aplicar "${label}: ${isIncluded ? 'Incluido' : 'No incluido'}" también a las otras ${siblings.length} fila(s) del plan "${source.plan}" (todas las edades y sumas aseguradas de esa aseguradora)?`;

    if (confirm(confirmMsg)) {
      setTariffs(prev => prev.map(t => (planKey(t) === key ? { ...t, ...updates } : t)));
      setModifiedRows(prev => {
        const next = { ...prev };
        siblings.forEach(t => { next[t.id] = true; });
        return next;
      });
    }
  };

  // --- ABRIR MODAL PARA EDITAR TARIFA EXISTENTE ---
  const handleOpenEditTariffModal = (t) => {
    setEditingTariffId(t.id);
    setNewTariffForm({
      compania_id: String(t.compania_id || companies[0]?.id || 1),
      plan: t.plan || '',
      ramo: t.ramo || 'Salud',
      edad_min: t.edad_min,
      edad_max: t.edad_max,
      suma_asegurada: t.suma_asegurada,
      deducible: t.deducible ?? 0,
      prima: t.prima,
      pago_contado: !!(t.pago_contado === true || t.pago_contado === 'true' || t.pago_contado === 1),
      pago_semestral: !!(t.pago_semestral === true || t.pago_semestral === 'true' || t.pago_semestral === 1),
      pago_cuatrimestral: !!(t.pago_cuatrimestral === true || t.pago_cuatrimestral === 'true' || t.pago_cuatrimestral === 1),
      pago_trimestral: !!(t.pago_trimestral === true || t.pago_trimestral === 'true' || t.pago_trimestral === 1),
      pago_bimestral: !!(t.pago_bimestral === true || t.pago_bimestral === 'true' || t.pago_bimestral === 1),
      pago_4_cuotas: !!(t.pago_4_cuotas === true || t.pago_4_cuotas === 'true' || t.pago_4_cuotas === 1),
      pago_mensual: !!(t.pago_mensual === true || t.pago_mensual === 'true' || t.pago_mensual === 1),
      atencion_medica_primaria: !!(t.atencion_medica_primaria === true || t.atencion_medica_primaria === 'true' || t.atencion_medica_primaria === 'INCL' || t.at_situ_medicamentos === 'INCL'),
      medicinas: !!(t.medicinas === true || t.medicinas === 'true' || t.medicinas === 'INCL'),
      consultas_medicas: !!(t.consultas_medicas === true || t.consultas_medicas === 'true' || t.consultas_medicas === 'INCL' || (typeof t.consultas_medicas === 'string' && t.consultas_medicas.length > 0 && t.consultas_medicas !== 'NO' && t.consultas_medicas !== 'false')),
      rehabilitacion: !!(t.rehabilitacion === true || t.rehabilitacion === 'true' || t.rehabilitacion === 'INCL'),
      protesis: !!(t.protesis === true || t.protesis === 'true' || t.protesis === 'INCL'),
      muleta_silla_ruedas: !!(t.muleta_silla_ruedas === true || t.muleta_silla_ruedas === 'true' || t.muleta_silla_ruedas === 'INCL'),
      examenes_lab_imagenologia: !!(t.examenes_lab_imagenologia === true || t.examenes_lab_imagenologia === 'true' || t.examenes_lab_imagenologia === 'INCL' || (typeof t.examenes_lab_imagenologia === 'string' && t.examenes_lab_imagenologia.length > 0 && t.examenes_lab_imagenologia !== 'NO' && t.examenes_lab_imagenologia !== 'false')),
      consultas: !!(t.consultas === true || t.consultas === 'true' || t.consultas === 'INCL'),
      maternidad: !!(t.maternidad === true || t.maternidad === 'true' || t.maternidad === 'INCL'),
      maternidad_suma: t.maternidad_suma || '',
      maternidad_costo: t.maternidad_costo || '',
      oftalmologia: !!(t.oftalmologia === true || t.oftalmologia === 'true' || t.oftalmologia === 'INCL'),
      odontologia: !!(t.odontologia === true || t.odontologia === 'true' || t.odontologia === 'INCL'),
      muerte_accidental: !!(t.muerte_accidental === true || t.muerte_accidental === 'true' || t.muerte_accidental === 'INCL'),
      muerte_accidental_suma: t.muerte_accidental_suma || '',
      muerte_accidental_costo: t.muerte_accidental_costo || '',
      invalidez_permanente: !!(t.invalidez_permanente === true || t.invalidez_permanente === 'true' || t.invalidez_permanente === 'INCL'),
      invalidez_permanente_suma: t.invalidez_permanente_suma || '',
      invalidez_permanente_costo: t.invalidez_permanente_costo || '',
      ambulancia: !!(t.ambulancia === true || t.ambulancia === 'true' || t.ambulancia === 'INCL' || (typeof t.ambulancia === 'string' && t.ambulancia.length > 0 && t.ambulancia !== 'NO' && t.ambulancia !== 'false')),
      asist_intl_suma: t.asist_intl_suma || '',
      asist_intl_costo: t.asist_intl_costo || '',
      funeral_suma: t.funeral_suma || '',
      funeral_costo: t.funeral_costo || ''
    });
    setShowNewTariffModal(true);
  };

  // --- CREAR O EDITAR TARIFA DESDE MODAL GUIADO ---
  const handleSaveTariffModal = async (e) => {
    e.preventDefault();
    if (!newTariffForm.compania_id) {
      showToast('Debe seleccionar una compañía aseguradora.', 'error');
      return;
    }
    if (!newTariffForm.plan || !newTariffForm.plan.trim()) {
      showToast('Debe especificar el nombre del Plan.', 'error');
      return;
    }
    if (isNaN(newTariffForm.edad_min) || isNaN(newTariffForm.edad_max) || parseFloat(newTariffForm.edad_min) > parseFloat(newTariffForm.edad_max)) {
      showToast('El rango de edad es inválido (Edad mínima debe ser menor o igual a edad máxima).', 'error');
      return;
    }
    if (isNaN(newTariffForm.prima) || parseFloat(newTariffForm.prima) <= 0) {
      showToast('La prima debe ser un valor numérico mayor a 0.', 'error');
      return;
    }

    setSubmittingNewTariff(true);
    try {
      const payload = {
        ...newTariffForm,
        compania_id: parseInt(newTariffForm.compania_id),
        edad_min: parseInt(newTariffForm.edad_min),
        edad_max: parseInt(newTariffForm.edad_max),
        suma_asegurada: parseFloat(newTariffForm.suma_asegurada),
        deducible: parseFloat(newTariffForm.deducible || 0),
        prima: parseFloat(newTariffForm.prima),
        pago_contado: !!newTariffForm.pago_contado,
        pago_semestral: !!newTariffForm.pago_semestral,
        pago_cuatrimestral: !!newTariffForm.pago_cuatrimestral,
        pago_trimestral: !!newTariffForm.pago_trimestral,
        pago_bimestral: !!newTariffForm.pago_bimestral,
        pago_4_cuotas: !!newTariffForm.pago_4_cuotas,
        pago_mensual: !!newTariffForm.pago_mensual,
        atencion_medica_primaria: !!newTariffForm.atencion_medica_primaria,
        medicinas: !!newTariffForm.medicinas,
        consultas_medicas: !!newTariffForm.consultas_medicas,
        rehabilitacion: !!newTariffForm.rehabilitacion,
        protesis: !!newTariffForm.protesis,
        muleta_silla_ruedas: !!newTariffForm.muleta_silla_ruedas,
        consultas: !!newTariffForm.consultas,
        maternidad: !!newTariffForm.maternidad,
        maternidad_suma: newTariffForm.maternidad_suma || '',
        maternidad_costo: newTariffForm.maternidad_costo || '',
        oftalmologia: !!newTariffForm.oftalmologia,
        odontologia: !!newTariffForm.odontologia,
        muerte_accidental: !!newTariffForm.muerte_accidental,
        muerte_accidental_suma: newTariffForm.muerte_accidental_suma || '',
        muerte_accidental_costo: newTariffForm.muerte_accidental_costo || '',
        invalidez_permanente: !!newTariffForm.invalidez_permanente,
        invalidez_permanente_suma: newTariffForm.invalidez_permanente_suma || '',
        invalidez_permanente_costo: newTariffForm.invalidez_permanente_costo || '',
        at_situ_medicamentos: newTariffForm.atencion_medica_primaria ? 'INCL' : '',
        examenes_lab_imagenologia: newTariffForm.examenes_lab_imagenologia ? 'INCL' : '',
        ambulancia: newTariffForm.ambulancia ? 'INCL' : ''
      };

      const isEdit = !!editingTariffId;
      const url = isEdit ? `${API_URL}/admin/tariffs/${editingTariffId}` : `${API_URL}/admin/tariffs`;
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || (isEdit ? 'Error al actualizar la tarifa' : 'Error al crear la tarifa'));

      showToast(isEdit ? '¡Tarifa actualizada con éxito en el tarifario!' : '¡Tarifa creada y agregada al tarifario con éxito!');
      setShowNewTariffModal(false);
      setEditingTariffId(null);
      await loadData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmittingNewTariff(false);
    }
  };

  const handleSaveTariff = async (tariff) => {
    const isNew = String(tariff.id).startsWith('new-');
    const method = isNew ? 'POST' : 'PUT';
    const url = isNew ? `${API_URL}/admin/tariffs` : `${API_URL}/admin/tariffs/${tariff.id}`;

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          compania_id: parseInt(tariff.compania_id),
          edad_min: parseInt(tariff.edad_min),
          edad_max: parseInt(tariff.edad_max),
          suma_asegurada: parseFloat(tariff.suma_asegurada),
          deducible: parseFloat(tariff.deducible || 0),
          prima: parseFloat(tariff.prima),
          plan: tariff.plan || '',
          ramo: tariff.ramo || 'Salud',
          pago_contado: !!(tariff.pago_contado === true || tariff.pago_contado === 'true' || tariff.pago_contado === 1),
          pago_semestral: !!(tariff.pago_semestral === true || tariff.pago_semestral === 'true' || tariff.pago_semestral === 1),
          pago_cuatrimestral: !!(tariff.pago_cuatrimestral === true || tariff.pago_cuatrimestral === 'true' || tariff.pago_cuatrimestral === 1),
          pago_trimestral: !!(tariff.pago_trimestral === true || tariff.pago_trimestral === 'true' || tariff.pago_trimestral === 1),
          pago_bimestral: !!(tariff.pago_bimestral === true || tariff.pago_bimestral === 'true' || tariff.pago_bimestral === 1),
          pago_4_cuotas: !!(tariff.pago_4_cuotas === true || tariff.pago_4_cuotas === 'true' || tariff.pago_4_cuotas === 1),
          pago_mensual: !!(tariff.pago_mensual === true || tariff.pago_mensual === 'true' || tariff.pago_mensual === 1),
          maternidad_suma: tariff.maternidad_suma || '',
          maternidad_costo: tariff.maternidad_costo || '',
          asist_intl_suma: tariff.asist_intl_suma || '',
          asist_intl_costo: tariff.asist_intl_costo || '',
          funeral_suma: tariff.funeral_suma || '',
          funeral_costo: tariff.funeral_costo || '',
          at_situ_medicamentos: tariff.at_situ_medicamentos || (tariff.atencion_medica_primaria ? 'INCL' : ''),
          atencion_medica_primaria: !!(tariff.atencion_medica_primaria === true || tariff.atencion_medica_primaria === 'true' || tariff.atencion_medica_primaria === 'INCL' || tariff.at_situ_medicamentos === 'INCL'),
          medicinas: !!(tariff.medicinas === true || tariff.medicinas === 'true' || tariff.medicinas === 'INCL'),
          consultas_medicas: !!(tariff.consultas_medicas === true || tariff.consultas_medicas === 'true' || tariff.consultas_medicas === 'INCL' || (typeof tariff.consultas_medicas === 'string' && tariff.consultas_medicas.length > 0 && tariff.consultas_medicas !== 'NO' && tariff.consultas_medicas !== 'false')),
          rehabilitacion: !!(tariff.rehabilitacion === true || tariff.rehabilitacion === 'true' || tariff.rehabilitacion === 'INCL'),
          protesis: !!(tariff.protesis === true || tariff.protesis === 'true' || tariff.protesis === 'INCL'),
          muleta_silla_ruedas: !!(tariff.muleta_silla_ruedas === true || tariff.muleta_silla_ruedas === 'true' || tariff.muleta_silla_ruedas === 'INCL'),
          examenes_lab_imagenologia: tariff.examenes_lab_imagenologia || '',
          consultas: !!(tariff.consultas === true || tariff.consultas === 'true' || tariff.consultas === 'INCL'),
          maternidad: !!(tariff.maternidad === true || tariff.maternidad === 'true' || tariff.maternidad === 'INCL'),
          oftalmologia: !!(tariff.oftalmologia === true || tariff.oftalmologia === 'true' || tariff.oftalmologia === 'INCL'),
          odontologia: !!(tariff.odontologia === true || tariff.odontologia === 'true' || tariff.odontologia === 'INCL'),
          muerte_accidental: !!(tariff.muerte_accidental === true || tariff.muerte_accidental === 'true' || tariff.muerte_accidental === 'INCL'),
          muerte_accidental_suma: tariff.muerte_accidental_suma || '',
          muerte_accidental_costo: tariff.muerte_accidental_costo || '',
          invalidez_permanente: !!(tariff.invalidez_permanente === true || tariff.invalidez_permanente === 'true' || tariff.invalidez_permanente === 'INCL'),
          invalidez_permanente_suma: tariff.invalidez_permanente_suma || '',
          invalidez_permanente_costo: tariff.invalidez_permanente_costo || '',
          ambulancia: tariff.ambulancia || ''
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar tarifa');

      showToast(isNew ? 'Tarifa creada con éxito.' : 'Tarifa actualizada correctamente.');
      
      setModifiedRows(prev => {
        const copy = { ...prev };
        delete copy[tariff.id];
        return copy;
      });

      // Recargar tarifas para obtener IDs reales
      const resTariffs = await fetch(`${API_URL}/admin/tariffs`, { headers: { 'Authorization': `Bearer ${token}` } });
      const dataTariffs = await resTariffs.json();
      setTariffs(Array.isArray(dataTariffs) ? dataTariffs : []);

    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteTariff = async (id) => {
    if (String(id).startsWith('new-')) {
      setTariffs(prev => prev.filter(t => t.id !== id));
      return;
    }

    if (!confirm('¿Está seguro de que desea eliminar esta tarifa del sistema?')) return;

    try {
      const res = await fetch(`${API_URL}/admin/tariffs/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al eliminar tarifa');

      showToast('Tarifa eliminada con éxito.');
      setTariffs(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleExportCurrentTariffJson = () => {
    try {
      if (!tariffs || tariffs.length === 0) {
        showToast('No hay tarifas registradas para descargar.', 'warning');
        return;
      }
      const jsonStr = JSON.stringify(tariffs, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().split('T')[0];
      a.download = `tarifario_jkaseguros_actual_${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('¡Archivo JSON del tarifario descargado exitosamente!');
    } catch (err) {
      showToast('Error al exportar JSON: ' + err.message, 'error');
    }
  };

  const handleAddTariffRow = () => {
    const tempId = `new-${Date.now()}`;
    const defaultCompanyId = companies[0]?.id || 1;
    const newRow = {
      id: tempId,
      compania_id: defaultCompanyId,
      plan: 'NUEVO PLAN',
      pago_contado: true,
      pago_semestral: false,
      pago_cuatrimestral: false,
      pago_trimestral: false,
      pago_bimestral: false,
      pago_4_cuotas: false,
      pago_mensual: false,
      ramo: 'Salud',
      edad_min: 18,
      edad_max: 29,
      suma_asegurada: 5000,
      deducible: 0,
      prima: 100,
      maternidad_suma: '',
      maternidad_costo: '',
      asist_intl_suma: '',
      asist_intl_costo: '',
      funeral_suma: '',
      funeral_costo: '',
      at_situ_medicamentos: 'INCL',
      atencion_medica_primaria: true,
      medicinas: true,
      consultas_medicas: true,
      rehabilitacion: false,
      protesis: false,
      muleta_silla_ruedas: false,
      examenes_lab_imagenologia: 'INCL',
      consultas: true,
      maternidad: false,
      oftalmologia: false,
      odontologia: false,
      muerte_accidental: false,
      muerte_accidental_suma: '',
      muerte_accidental_costo: '',
      invalidez_permanente: false,
      invalidez_permanente_suma: '',
      invalidez_permanente_costo: '',
      ambulancia: 'INCL'
    };
    setTariffs(prev => [newRow, ...prev]);
    setModifiedRows(prev => ({ ...prev, [tempId]: true }));
    showToast('Nueva fila agregada al inicio de la planilla. Modifícala y presiona "Guardar Cambios".');
  };

  // --- ARRASTRE DE CABECERAS PARA REDIMENSIONAR (ESTILO EXCEL) ---
  const handleResizeStart = (e, colKey) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = detailedColWidths[colKey];
    setResizingCol(colKey);

    const handleMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = Math.max(60, startWidth + deltaX);
      setDetailedColWidths(prev => ({
        ...prev,
        [colKey]: newWidth
      }));
    };

    const handleMouseUp = () => {
      setResizingCol(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleCompResizeStart = (e, colKey, defaultVal) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = comparativeColWidths[colKey] || defaultVal;
    setResizingCol(colKey);

    const handleMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = Math.max(50, startWidth + deltaX);
      setComparativeColWidths(prev => ({
        ...prev,
        [colKey]: newWidth
      }));
    };

    const handleMouseUp = () => {
      setResizingCol(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // --- GUARDAR TODAS LAS TARIFAS MODIFICADAS EN LOTE ---
  const handleSaveAllTariffs = async () => {
    const modifiedIds = Object.keys(modifiedRows).filter(id => modifiedRows[id]);
    const modifiedList = tariffs.filter(t => modifiedIds.includes(String(t.id)));

    if (modifiedList.length === 0) {
      showToast('No hay cambios pendientes de guardar.', 'info');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/tariffs/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ tariffs: modifiedList })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar tarifas en lote');

      showToast(`¡Cambios guardados con éxito! Se procesaron ${data.count} tarifas.`);
      setModifiedRows({});
      await loadData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // --- DESCARTAR CAMBIOS NO GUARDADOS ---
  const handleDiscardChanges = () => {
    if (confirm('¿Está seguro de que desea descartar todos los cambios no guardados en el editor?')) {
      setModifiedRows({});
      loadData();
    }
  };

  // Carga masiva de tarifas JSON
  const handleBulkUpload = async (e) => {
    e.preventDefault();
    if (!fileToUpload) return showToast('Seleccione un archivo JSON para cargar.', 'error');
    
    setLoading(true);
    const formData = new FormData();
    formData.append('archivo', fileToUpload);

    try {
      const res = await fetch(`${API_URL}/admin/data`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      const data = await res.json();
      if (data.count === 0) {
        showToast('El archivo fue recibido pero no contenía tarifas con datos válidos.', 'warning');
      } else {
        showToast(`¡Carga completada! Se guardaron ${data.count} tarifas exitosamente.`);
      }
      setFileToUpload(null);
      const fileInput = document.getElementById('file-upload-input');
      if (fileInput) {
        fileInput.value = '';
      }
      await loadData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // --- CÁLCULO DE MÉTRICAS KPI ---
  const totalPolizas = policies.length;
  const polizasVigentes = policies.filter(p => p.estado === 'vigente').length;
  const polizasNegociacion = policies.filter(p => p.estado === 'negociacion').length;
  const polizasRechazadas = policies.filter(p => p.estado === 'rechazado').length;
  
  const totalIngresos = payments
    .filter(p => {
      if (p.estado_pago !== 'pagado') return false;
      const linkedPol = policies.find(pol => pol.id === p.poliza_id);
      return !linkedPol || (linkedPol.estado !== 'rechazado' && linkedPol.estado !== 'anulada');
    })
    .reduce((sum, p) => sum + parseFloat(p.monto), 0);

  const pagosPendientesCount = payments.filter(p => {
    if (p.estado_pago !== 'pendiente') return false;
    const linkedPol = policies.find(pol => pol.id === p.poliza_id);
    return !linkedPol || (linkedPol.estado !== 'rechazado' && linkedPol.estado !== 'anulada');
  }).length;

  // --- FILTRADO DE DATOS CON SEARCHQUERY ---
  const filteredClients = clients.filter(c =>
    !searchQuery ||
    c.nombre?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.nro_documento?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.telefono?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredPolicies = policies.filter(p =>
    !searchQuery ||
    p.codigo_poliza?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.cliente_nombre?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.compania_nombre?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.asesor_nombre?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.estado?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Agrupación de pagos por póliza con filtrado inteligente
  const groupedPaymentsByPolicy = (() => {
    const map = new Map();

    // 1. Inicializar todas las pólizas registradas
    policies.forEach(pol => {
      const pKey = String(pol.id);
      map.set(pKey, {
        poliza_id: pol.id,
        poliza_codigo: pol.codigo_poliza || 'POL-GENERAL',
        cliente_nombre: pol.cliente_nombre || 'Cliente',
        compania_nombre: pol.compania_nombre || 'Seguros',
        asesor_nombre: pol.asesor_nombre || 'Sin Asesor',
        frecuencia: pol.frecuencia_pago || 'contado',
        plan: pol.plan || '',
        total_prima: parseFloat(pol.prima_anual || 0),
        cuotas: []
      });
    });

    // 2. Asociar cuotas / pagos a cada póliza
    payments.forEach(pa => {
      const pKey = pa.poliza_id ? String(pa.poliza_id) : (pa.poliza_codigo || `temp-${pa.id}`);
      if (!map.has(pKey)) {
        map.set(pKey, {
          poliza_id: pa.poliza_id,
          poliza_codigo: pa.poliza_codigo || 'POL-GENERAL',
          cliente_nombre: pa.cliente_nombre || 'Cliente',
          compania_nombre: pa.compania_nombre || 'Seguros',
          asesor_nombre: pa.asesor_nombre || 'Asesor',
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

    return groups.filter(group => {
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
        group.asesor_nombre?.toLowerCase().includes(q) ||
        group.cuotas.some(c => c.referencia?.toLowerCase().includes(q))
      );
    });
  })();

  const filteredUsers = users.filter(u =>
    !searchQuery ||
    u.correo?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.rango?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredLogs = logs.filter(log =>
    !searchQuery ||
    log.correo_usuario?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.accion?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.descripcion?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredAdvisors = advisors.filter(a => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      a.nombre?.toLowerCase().includes(q) ||
      a.codigo_asesor?.toLowerCase().includes(q) ||
      a.cedula?.toLowerCase().includes(q) ||
      a.correo?.toLowerCase().includes(q) ||
      a.banco?.toLowerCase().includes(q)
    );
  });

  // Sumas aseguradas disponibles (extraídas dinámicamente o del catálogo base)
  const SUMA_ASEGURADA_OPTIONS = useMemo(() => {
    const fromTariffs = [...new Set(tariffs.map(t => parseFloat(t.suma_asegurada)).filter(Boolean))];
    const base = [5000, 10000, 15000, 20000, 30000, 40000, 50000, 75000, 100000, 125000, 150000, 175000, 200000, 225000, 250000];
    return [...new Set([...base, ...fromTariffs])].sort((a, b) => a - b);
  }, [tariffs]);

  // Ramos disponibles
  const RAMO_OPTIONS = useMemo(() => {
    const fromTariffs = [...new Set(tariffs.map(t => t.ramo).filter(Boolean))];
    const base = ['Salud', 'Patrimoniales', 'Visa', 'Vida'];
    return [...new Set([...base, ...fromTariffs])];
  }, [tariffs]);

  // Conteo de tarifas por aseguradora para los badges en el filtro
  const companyTariffCounts = useMemo(() => {
    const counts = {};
    tariffs.forEach(t => {
      const cId = String(t.compania_id);
      counts[cId] = (counts[cId] || 0) + 1;
    });
    return counts;
  }, [tariffs]);

  // Tarifas filtradas para el modo planilla (Excel)
  const filteredTariffs = useMemo(() => {
    return tariffs.filter(t => {
      if (filterCompany !== 'todas' && String(t.compania_id) !== String(filterCompany)) {
        return false;
      }
      if (filterSuma !== 'todas' && parseFloat(t.suma_asegurada) !== parseFloat(filterSuma)) {
        return false;
      }
      if (filterRamo !== 'todos' && t.ramo !== filterRamo) {
        return false;
      }
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase().trim();
      const compName = companies.find(c => c.id === parseInt(t.compania_id))?.nombre || t.compania_nombre || '';
      return (
        compName.toLowerCase().includes(q) ||
        t.plan?.toLowerCase().includes(q) ||
        String(t.edad_min).includes(q) ||
        String(t.edad_max).includes(q) ||
        String(t.suma_asegurada).includes(q) ||
        String(t.prima).includes(q) ||
        (t.ramo && t.ramo.toLowerCase().includes(q))
      );
    });
  }, [tariffs, filterCompany, filterSuma, filterRamo, searchQuery, companies]);

  // Matriz pivote: una fila por (rango de edad, suma asegurada), con la oferta más económica de cada aseguradora
  const pivotRows = useMemo(() => {
    const map = new Map();
    tariffs.forEach(t => {
      const sAseg = parseFloat(t.suma_asegurada);
      if (isNaN(sAseg)) return;
      const key = `${t.edad_min}-${t.edad_max}|${sAseg}`;
      if (!map.has(key)) {
        map.set(key, { edad_min: parseInt(t.edad_min), edad_max: parseInt(t.edad_max), suma_asegurada: sAseg, byCompany: {} });
      }
      const row = map.get(key);
      const compId = parseInt(t.compania_id);
      const compName = (t.compania_nombre || t.compania || '').toLowerCase().trim();
      const existing = (!isNaN(compId) ? row.byCompany[compId] : null) || (compName ? row.byCompany[compName] : null);
      if (!existing || parseFloat(t.prima) < parseFloat(existing.prima)) {
        if (!isNaN(compId)) {
          row.byCompany[compId] = t;
          row.byCompany[String(compId)] = t;
        }
        if (compName) {
          row.byCompany[compName] = t;
        }
      }
    });
    return [...map.values()].sort((a, b) => a.edad_min - b.edad_min || a.suma_asegurada - b.suma_asegurada);
  }, [tariffs]);

  // Aseguradoras visibles en la matriz comparativa según filtros activos (evita mostrar columnas vacías)
  const visibleCompanies = useMemo(() => {
    let list = [...companies];
    if (filterCompany !== 'todas') {
      list = list.filter(c => String(c.id) === String(filterCompany) || (c.nombre && c.nombre.toLowerCase().includes(filterCompany.toLowerCase())));
    } else if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      const matchingCompIds = new Set();
      companies.forEach(c => {
        if (c.nombre.toLowerCase().includes(q)) {
          matchingCompIds.add(c.id);
        }
      });
      tariffs.forEach(t => {
        if (
          t.plan?.toLowerCase().includes(q) ||
          String(t.prima).includes(q) ||
          (t.ramo && t.ramo.toLowerCase().includes(q))
        ) {
          matchingCompIds.add(parseInt(t.compania_id));
        }
      });
      if (matchingCompIds.size > 0) {
        list = list.filter(c => matchingCompIds.has(c.id));
      }
    }
    return list;
  }, [companies, filterCompany, searchQuery, tariffs]);

  // Filas pivote filtradas
  const filteredPivotRows = useMemo(() => {
    return pivotRows.filter(row => {
      if (filterSuma !== 'todas' && parseFloat(row.suma_asegurada) !== parseFloat(filterSuma)) {
        return false;
      }
      // Si la fila no tiene datos para ninguna de las aseguradoras visibles, ocultarla
      const hasDataInVisible = visibleCompanies.some(c => {
        const cName = (c.nombre || '').toLowerCase().trim();
        return !!row.byCompany[c.id] || !!row.byCompany[String(c.id)] || (cName && !!row.byCompany[cName]);
      });
      if (!hasDataInVisible && visibleCompanies.length > 0) {
        return false;
      }
      if (filterRamo !== 'todos') {
        const hasRamoMatch = visibleCompanies.some(c => {
          const cName = (c.nombre || '').toLowerCase().trim();
          const cell = row.byCompany[c.id] || row.byCompany[String(c.id)] || (cName ? row.byCompany[cName] : null);
          return cell && cell.ramo === filterRamo;
        });
        if (!hasRamoMatch) return false;
      }
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase().trim();
      if (`${row.edad_min}-${row.edad_max}`.includes(q) || String(row.suma_asegurada).includes(q)) return true;
      return visibleCompanies.some(c => {
        const cName = (c.nombre || '').toLowerCase().trim();
        const cell = row.byCompany[c.id] || row.byCompany[String(c.id)] || (cName ? row.byCompany[cName] : null);
        if (!cell) return false;
        return c.nombre.toLowerCase().includes(q) || cell.plan?.toLowerCase().includes(q) || String(cell.prima).includes(q);
      });
    });
  }, [pivotRows, filterSuma, filterRamo, searchQuery, visibleCompanies]);


  // --- CÁLCULO DE METRICAS / KPIS ---
  const totalPols = policies.length;
  const vigentesCount = policies.filter(p => p.estado === 'vigente').length;
  const negociacionCount = policies.filter(p => p.estado === 'negociacion').length;
  const vencidosCount = policies.filter(p => p.estado === 'vencido').length;
  const rechazadosCount = policies.filter(p => p.estado === 'rechazado').length;

  const totalPrimaVigente = policies
    .filter(p => p.estado === 'vigente')
    .reduce((sum, p) => sum + parseFloat(p.prima_anual || 0), 0);

  const totalRecaudado = payments
    .filter(p => p.estado_pago === 'pagado')
    .reduce((sum, p) => sum + parseFloat(p.monto || 0), 0);

  const totalPendiente = payments
    .filter(p => p.estado_pago === 'pendiente')
    .reduce((sum, p) => sum + parseFloat(p.monto || 0), 0);

  const totalVencidoPay = payments
    .filter(p => p.estado_pago === 'vencido')
    .reduce((sum, p) => sum + parseFloat(p.monto || 0), 0);

  const tasaCobranza = payments.length > 0 
    ? ((payments.filter(p => p.estado_pago === 'pagado').length / payments.length) * 100).toFixed(1)
    : '0.0';

  const tasaConversion = totalPols > 0 
    ? ((vigentesCount / totalPols) * 100).toFixed(1)
    : '0.0';

  // Rendimiento por asesor:
  const advisorsPerformance = advisors.map(adv => {
    const advPols = policies.filter(p => p.asesor_id === adv.id);
    const activePols = advPols.filter(p => p.estado === 'vigente');
    
    // Contar clientes únicos asociados a las pólizas de este asesor
    const uniqueClientIds = new Set(advPols.filter(p => p.cliente_id).map(p => p.cliente_id));
    const clientsCount = uniqueClientIds.size;
    
    const totalPrima = activePols.reduce((sum, p) => sum + parseFloat(p.prima_anual || 0), 0);
    return {
      ...adv,
      clientsCount,
      activePolicies: activePols.length,
      totalPrima
    };
  }).sort((a, b) => b.totalPrima - a.totalPrima);

  if (!hydrated || !isLoggedIn || user?.rango !== 'admin') return null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h2 style={{ color: 'var(--primary)', fontWeight: 800 }}>Panel Administrativo Principal</h2>
          <p style={{ color: 'var(--text-muted)' }}>Métricas, pólizas, control de pagos y trazabilidad general</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Link href="/dashboard/admin/comisiones" className="btn btn-primary" style={{ padding: '0.5rem 1rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
            💰 Comisiones
          </Link>
          <button onClick={loadData} className="btn btn-secondary" style={{ padding: '0.5rem 1rem' }} disabled={loading}>
            {loading ? 'Sincronizando...' : 'Actualizar Data ↻'}
          </button>
        </div>
      </div>

      {/* KPI METRICS SECTION */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '1.5rem',
        marginBottom: '2.5rem'
      }}>
        <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderLeft: '4px solid var(--accent)' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Ingresos Totales Recaudados</span>
          <span style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--primary)', margin: '0.5rem 0' }}>
            ${totalIngresos.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </span>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Pagos confirmados en el sistema</span>
        </div>

        <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderLeft: '4px solid #10b981' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Pólizas Emitidas (Vigentes)</span>
          <span style={{ fontSize: '1.8rem', fontWeight: 800, color: '#10b981', margin: '0.5rem 0' }}>
            {polizasVigentes} <span style={{ fontSize: '1rem', fontWeight: '400', color: 'var(--text-muted)' }}>/ {totalPolizas} total</span>
          </span>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>En negociación: {polizasNegociacion}</span>
        </div>

        <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderLeft: '4px solid #f59e0b' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Cobros Pendientes</span>
          <span style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f59e0b', margin: '0.5rem 0' }}>
            {pagosPendientesCount}
          </span>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Cuotas pendientes por verificar</span>
        </div>

        <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderLeft: '4px solid var(--primary)' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Asesores / Clientes</span>
          <div style={{ display: 'flex', gap: '1.5rem', margin: '0.5rem 0' }}>
            <div>
              <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--primary)' }}>
                {advisors.length} <span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>perf.</span>
              </span>
              <br />
              <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--accent)' }}>
                {users.filter(u => u.rango === 'asesor').length} <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>ctas.</span>
              </span>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>Asesores</div>
            </div>
            <div style={{ width: '1px', backgroundColor: 'var(--border)', height: '40px', alignSelf: 'center' }}></div>
            <div>
              <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--primary)' }}>
                {clients.length} <span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>perf.</span>
              </span>
              <br />
              <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--accent)' }}>
                {users.filter(u => u.rango === 'cliente').length} <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>ctas.</span>
              </span>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>Clientes</div>
            </div>
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Perfiles / Cuentas creadas</span>
        </div>
      </div>

      {/* TABS NAVIGATION */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border)',
        gap: '0.5rem',
        marginBottom: '2rem',
        overflowX: 'auto',
        paddingBottom: '1px'
      }}>
        {['resumen', 'polizas', 'pagos', 'roles', 'asesores', 'tarifas', 'trazabilidad', 'elearning', 'comisiones'].map((tab) => (
          <button
            key={tab}
            onClick={() => {
              if (tab === 'comisiones') {
                router.push('/dashboard/admin/comisiones');
              } else {
                setActiveTab(tab);
                setSearchQuery('');
              }
            }}
            style={{
              padding: '0.75rem 1.25rem',
              border: 'none',
              background: activeTab === tab ? 'var(--primary)' : 'transparent',
              color: activeTab === tab ? '#fff' : 'var(--text-muted)',
              fontWeight: 600,
              fontSize: '0.9rem',
              borderRadius: '8px 8px 0 0',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'var(--transition)'
            }}
          >
            {tab === 'elearning' ? 'Capacitación' : tab === 'comisiones' ? 'Comisiones' : tab === 'asesores' ? 'Asesores' : tab === 'pagos' ? `Pagos ${payments.filter(p => p.estado_pago === 'en_revision').length > 0 ? `(${payments.filter(p => p.estado_pago === 'en_revision').length}) 🟡` : ''}` : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>Cargando información...</div>
      ) : (
        <div>
          {/* --- RESUMEN DE CLIENTES --- */}
          {activeTab === 'resumen' && (
            <div>
              {/* Alerta de pagos por verificar en el Resumen */}
              {payments.some(p => p.estado_pago === 'en_revision') && (
                <div style={{ 
                  marginBottom: '1.5rem', 
                  padding: '1rem 1.5rem', 
                  backgroundColor: '#fffbeb', 
                  border: '2px solid #f59e0b', 
                  borderRadius: '10px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '1rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '1.75rem' }}>🔔</span>
                    <div>
                      <h4 style={{ margin: 0, color: '#b45309', fontWeight: 800, fontSize: '1.05rem' }}>
                        ¡Hay {payments.filter(p => p.estado_pago === 'en_revision').length} pago(s) reportado(s) pendiente(s) de verificación!
                      </h4>
                      <span style={{ fontSize: '0.85rem', color: '#92400e' }}>
                        Revisa los comprobantes bancarios para aprobarlos y liquidar las comisiones.
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveTab('pagos')}
                    className="btn btn-primary"
                    style={{ background: '#d97706', borderColor: '#d97706', padding: '0.5rem 1rem', fontSize: '0.85rem', fontWeight: 700 }}
                  >
                    💳 Ir a Verificar Pagos →
                  </button>
                </div>
              )}

              {/* --- PANEL DE INDICADORES (KPIs) --- */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.2rem', marginBottom: '2rem' }}>
                
                {/* KPI: Prima de Cartera */}
                <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', boxShadow: 'var(--shadow-lg)' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Prima en Cartera Activa</span>
                  <span style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--primary)' }}>
                    ${totalPrimaVigente.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: '500' }}>
                    📈 {vigentesCount} pólizas vigentes
                  </span>
                </div>

                {/* KPI: Cobrado */}
                <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', boxShadow: 'var(--shadow-lg)' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Recaudación Cobrada</span>
                  <span style={{ fontSize: '1.75rem', fontWeight: '800', color: '#10b981' }}>
                    ${totalRecaudado.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Tasa de Cobranza: <strong>{tasaCobranza}%</strong>
                  </span>
                </div>

                {/* KPI: Pendiente y Vencido */}
                <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', boxShadow: 'var(--shadow-lg)' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Cuentas por Cobrar</span>
                  <span style={{ fontSize: '1.75rem', fontWeight: '800', color: '#f59e0b' }}>
                    ${(totalPendiente + totalVencidoPay).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Pendiente: <strong>${totalPendiente.toLocaleString('en-US')}</strong> | Vencido: <strong style={{ color: '#ef4444' }}>${totalVencidoPay.toLocaleString('en-US')}</strong>
                  </span>
                </div>

                {/* KPI: Conversión */}
                <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', boxShadow: 'var(--shadow-lg)' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tasa de Conversión</span>
                  <span style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--accent)' }}>
                    {tasaConversion}%
                  </span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Pólizas en Negociación: <strong>{negociacionCount}</strong>
                  </span>
                </div>

              </div>

              {/* --- DISTRIBUCIÓN Y RENDIMIENTO DE ASESORES --- */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                
                {/* Card: Distribución de Pólizas */}
                <div className="card" style={{ padding: '1.5rem', boxShadow: 'var(--shadow-lg)' }}>
                  <h4 style={{ color: 'var(--primary)', fontWeight: 'bold', marginBottom: '1.2rem', fontSize: '1rem' }}>Distribución de Pólizas ({totalPols} totales)</h4>
                  
                  {/* Proportional Bar Chart */}
                  <div style={{ display: 'flex', height: '24px', borderRadius: '6px', overflow: 'hidden', marginBottom: '1.5rem', border: '1px solid var(--border)' }}>
                    {vigentesCount > 0 && (
                      <div style={{ width: `${(vigentesCount / totalPols) * 100}%`, background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.75rem', fontWeight: 'bold' }} title={`Vigentes: ${vigentesCount}`}>
                        {Math.round((vigentesCount / totalPols) * 100)}%
                      </div>
                    )}
                    {negociacionCount > 0 && (
                      <div style={{ width: `${(negociacionCount / totalPols) * 100}%`, background: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.75rem', fontWeight: 'bold' }} title={`Negociación: ${negociacionCount}`}>
                        {Math.round((negociacionCount / totalPols) * 100)}%
                      </div>
                    )}
                    {vencidosCount > 0 && (
                      <div style={{ width: `${(vencidosCount / totalPols) * 100}%`, background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.75rem', fontWeight: 'bold' }} title={`Vencidas: ${vencidosCount}`}>
                        {Math.round((vencidosCount / totalPols) * 100)}%
                      </div>
                    )}
                    {rechazadosCount > 0 && (
                      <div style={{ width: `${(rechazadosCount / totalPols) * 100}%`, background: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.75rem', fontWeight: 'bold' }} title={`Rechazadas: ${rechazadosCount}`}>
                        {Math.round((rechazadosCount / totalPols) * 100)}%
                      </div>
                    )}
                    {totalPols === 0 && (
                      <div style={{ width: '100%', background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        Sin pólizas registradas
                      </div>
                    )}
                  </div>

                  {/* Legend */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.85rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#10b981', display: 'inline-block' }}></span>
                      <span>Vigentes: <strong>{vigentesCount}</strong></span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#f59e0b', display: 'inline-block' }}></span>
                      <span>En Negociación: <strong>{negociacionCount}</strong></span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#ef4444', display: 'inline-block' }}></span>
                      <span>Vencidas: <strong>{vencidosCount}</strong></span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#64748b', display: 'inline-block' }}></span>
                      <span>Rechazadas: <strong>{rechazadosCount}</strong></span>
                    </div>
                  </div>
                </div>

                {/* Card: Tabla de Rendimiento de Asesores */}
                <div className="card" style={{ padding: '1.5rem', boxShadow: 'var(--shadow-lg)' }}>
                  <h4 style={{ color: 'var(--primary)', fontWeight: 'bold', marginBottom: '1rem', fontSize: '1rem' }}>Ranking de Asesores</h4>
                  <div className="table-container" style={{ maxHeight: '180px', overflowY: 'auto' }}>
                    <table className="table" style={{ fontSize: '0.8rem', minWidth: '100%' }}>
                      <thead>
                        <tr>
                          <th>Asesor</th>
                          <th>Clientes</th>
                          <th>Pólizas Activas</th>
                          <th>Cartera ($)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {advisorsPerformance.length === 0 ? (
                          <tr><td colSpan="4" className="text-center">No hay asesores registrados.</td></tr>
                        ) : (
                          advisorsPerformance.map(adv => (
                            <tr key={adv.id || adv.id_asesor || adv.codigo_asesor}>
                              <td><strong>{adv.nombre}</strong></td>
                              <td>{adv.clientsCount}</td>
                              <td>{adv.activePolicies}</td>
                              <td><strong style={{ color: 'var(--primary)' }}>${adv.totalPrima.toLocaleString('en-US')}</strong></td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>

              {/* Lista de Clientes Registrados */}
              <div className="card" style={{ boxShadow: 'var(--shadow-lg)' }}>
                <h3 className="card-title" style={{ marginBottom: '1.5rem' }}>Lista de Clientes Registrados</h3>
                <div style={{ marginBottom: '1.2rem' }}>
                  <input
                    type="text"
                    placeholder="🔍 Buscar cliente por nombre, documento o teléfono..."
                    className="form-input"
                    style={{ maxWidth: '350px', padding: '0.5rem 1rem', margin: 0 }}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className="table-container">
                  <table className="table" style={{ fontSize: '0.8rem' }}>
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Cliente</th>
                        <th>Documento</th>
                        <th>Correo</th>
                        <th>Teléfono</th>
                        <th>Nacimiento (Edad)</th>
                        <th>Género</th>
                        <th>Edo. Civil</th>
                        <th>Pólizas</th>
                        <th>Total Aportado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredClients.length === 0 ? (
                        <tr><td colSpan="10" className="text-center">No hay clientes que coincidan con la búsqueda.</td></tr>
                      ) : (
                        filteredClients.map((c) => {
                          const birthYear = c.fecha_nacimiento ? new Date(c.fecha_nacimiento).getFullYear() : null;
                          const age = birthYear ? new Date().getFullYear() - birthYear : 'N/A';
                          const formattedBirth = c.fecha_nacimiento ? new Date(c.fecha_nacimiento).toLocaleDateString('es-VE', { timeZone: 'UTC' }) : 'N/A';
                          return (
                            <tr key={c.id_cliente}>
                              <td>{c.id_cliente}</td>
                              <td>
                                <strong>{c.primer_nombre} {c.segundo_nombre ? c.segundo_nombre + ' ' : ''}{c.primer_apellido} {c.segundo_apellido ? c.segundo_apellido : ''}</strong>
                              </td>
                              <td>{c.tipo_documento ? `${c.tipo_documento}-${c.nro_documento}` : c.nro_documento}</td>
                              <td>{c.correo || 'N/A'}</td>
                              <td>{c.telefono}</td>
                              <td>{formattedBirth} ({age} años)</td>
                              <td>{c.genero || 'N/A'}</td>
                              <td>{c.estado_civil || 'N/A'}</td>
                              <td><span className="badge badge-vigente" style={{ background: 'var(--secondary)', color: 'var(--primary)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>{c.polizas}</span></td>
                              <td><strong style={{ color: '#10b981' }}>{c.historial_pagos}</strong></td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* --- GESTIÓN DE CASOS (PÓLIZAS) --- */}
          {activeTab === 'polizas' && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <h3 className="card-title" style={{ margin: 0 }}>Control de Solicitudes y Casos de Pólizas</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>Administre, asigne asesores o emita nuevas pólizas directamente.</p>
                </div>
                <button
                  onClick={() => setShowNewPolicyModal(true)}
                  className="btn btn-primary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1.1rem', fontWeight: 600 }}
                >
                  ➕ Emitir / Registrar Póliza
                </button>
              </div>

              {/* MODAL DE EMISIÓN DE PÓLIZA */}
              {showNewPolicyModal && (
                <div style={{
                  position: 'fixed',
                  top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: 'rgba(0,0,0,0.5)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  zIndex: 9999, padding: '1rem'
                }}>
                  <div className="card" style={{ maxWidth: '600px', width: '100%', maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
                      <h4 style={{ margin: 0, color: 'var(--primary)', fontWeight: 700 }}>📋 Emitir / Registrar Nueva Póliza</h4>
                      <button 
                        onClick={() => setShowNewPolicyModal(false)}
                        style={{ border: 'none', background: 'transparent', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--text-muted)' }}
                      >
                        ✕
                      </button>
                    </div>

                    <form onSubmit={handleCreateNewPolicy} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div>
                        <label className="form-label" style={{ fontWeight: 600 }}>Cliente Asegurado *</label>
                        <select
                          className="form-input"
                          value={newPolicyForm.cliente_id}
                          onChange={(e) => setNewPolicyForm(prev => ({ ...prev, cliente_id: e.target.value }))}
                          required
                        >
                          <option value="">-- Seleccionar Cliente --</option>
                          {clients.map(c => (
                            <option key={c.id_cliente} value={c.id_cliente}>
                              {c.primer_nombre} {c.primer_apellido} ({c.nro_documento}) - {c.correo}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        <div>
                          <label className="form-label" style={{ fontWeight: 600 }}>Nro. / Código de Póliza</label>
                          <input
                            type="text"
                            placeholder="Ej. 150-352750"
                            className="form-input"
                            value={newPolicyForm.codigo_poliza}
                            onChange={(e) => setNewPolicyForm(prev => ({ ...prev, codigo_poliza: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="form-label" style={{ fontWeight: 600 }}>Compañía Aseguradora *</label>
                          <select
                            className="form-input"
                            value={newPolicyForm.compania_id}
                            onChange={(e) => setNewPolicyForm(prev => ({ ...prev, compania_id: e.target.value }))}
                            required
                          >
                            {companies.map(comp => (
                              <option key={comp.id} value={comp.id}>{comp.nombre}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '0.75rem' }}>
                        <div>
                          <label className="form-label" style={{ fontWeight: 600 }}>Plan / Producto</label>
                          <input
                            type="text"
                            placeholder="Ej. Seguros de Vida Mercantil"
                            className="form-input"
                            value={newPolicyForm.plan}
                            onChange={(e) => setNewPolicyForm(prev => ({ ...prev, plan: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="form-label" style={{ fontWeight: 600 }}>Área / Ramo</label>
                          <select
                            className="form-input"
                            value={newPolicyForm.area}
                            onChange={(e) => setNewPolicyForm(prev => ({ ...prev, area: e.target.value }))}
                          >
                            <option value="Salud">Salud</option>
                            <option value="Vida">Vida</option>
                            <option value="Patrimoniales">Patrimoniales</option>
                            <option value="Automóvil">Automóvil</option>
                          </select>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                        <div>
                          <label className="form-label" style={{ fontWeight: 600 }}>Suma Asegurada ($) *</label>
                          <input
                            type="number"
                            placeholder="10000"
                            className="form-input"
                            value={newPolicyForm.suma_asegurada}
                            onChange={(e) => setNewPolicyForm(prev => ({ ...prev, suma_asegurada: e.target.value }))}
                            required
                          />
                        </div>
                        <div>
                          <label className="form-label" style={{ fontWeight: 600 }}>Deducible ($)</label>
                          <input
                            type="number"
                            placeholder="0"
                            className="form-input"
                            value={newPolicyForm.deducible}
                            onChange={(e) => setNewPolicyForm(prev => ({ ...prev, deducible: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="form-label" style={{ fontWeight: 600 }}>Prima Anual ($) *</label>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="78.24"
                            className="form-input"
                            value={newPolicyForm.prima_anual}
                            onChange={(e) => setNewPolicyForm(prev => ({ ...prev, prima_anual: e.target.value }))}
                            required
                          />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        <div>
                          <label className="form-label" style={{ fontWeight: 600 }}>Frecuencia de Pago</label>
                          <select
                            className="form-input"
                            value={newPolicyForm.frecuencia_pago}
                            onChange={(e) => setNewPolicyForm(prev => ({ ...prev, frecuencia_pago: e.target.value }))}
                          >
                            <option value="contado">Contado (1 cuota)</option>
                            <option value="semestral">Semestral (2 cuotas)</option>
                            <option value="cuatrimestral">Cuatrimestral (3 cuotas)</option>
                            <option value="trimestral">Trimestral (4 cuotas)</option>
                            <option value="mensual">Mensual (12 cuotas)</option>
                          </select>
                        </div>
                        <div>
                          <label className="form-label" style={{ fontWeight: 600 }}>Asesor Asignado</label>
                          <select
                            className="form-input"
                            value={newPolicyForm.asesor_id}
                            onChange={(e) => setNewPolicyForm(prev => ({ ...prev, asesor_id: e.target.value }))}
                          >
                            <option value="">-- Sin Asesor (Asignar luego) --</option>
                            {advisors.map(adv => (
                              <option key={adv.id} value={adv.id}>{adv.nombre}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        <div>
                          <label className="form-label" style={{ fontWeight: 600 }}>Tipo de Negocio</label>
                          <select
                            className="form-input"
                            value={newPolicyForm.tipo_negocio}
                            onChange={(e) => setNewPolicyForm(prev => ({ ...prev, tipo_negocio: e.target.value }))}
                          >
                            <option value="nuevo">Nuevo</option>
                            <option value="renovacion">Renovación</option>
                          </select>
                        </div>
                        <div>
                          <label className="form-label" style={{ fontWeight: 600 }}>Estado Inicial</label>
                          <select
                            className="form-input"
                            value={newPolicyForm.estado}
                            onChange={(e) => setNewPolicyForm(prev => ({ ...prev, estado: e.target.value }))}
                          >
                            <option value="vigente">🟢 Vigente</option>
                            <option value="negociacion">🟡 En Negociación</option>
                          </select>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                        <button
                          type="button"
                          onClick={() => setShowNewPolicyModal(false)}
                          className="btn btn-secondary"
                          style={{ flex: 1 }}
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          className="btn btn-primary"
                          style={{ flex: 1.5 }}
                          disabled={submittingNewPolicy}
                        >
                          {submittingNewPolicy ? 'Emitiendo...' : '✓ Confirmar Emisión'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              <div style={{ marginBottom: '1.2rem' }}>
                <input
                  type="text"
                  placeholder="🔍 Buscar póliza por código, cliente, aseguradora, asesor o estado..."
                  className="form-input"
                  style={{ maxWidth: '350px', padding: '0.5rem 1rem', margin: 0 }}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="table-container">
                <table className="table" style={{ minWidth: '1800px' }}>
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Cliente</th>
                      <th>Aseguradora</th>
                      <th>Plan</th>
                      <th>Suma Asegurada ($)</th>
                      <th>Deducible ($)</th>
                      <th>Prima Anual ($)</th>
                      <th>Frecuencia Pago</th>
                      <th>Negocio</th>
                      <th>Cobertura</th>
                      <th>Asesor Asignado</th>
                      <th>Estado</th>
                      <th>Motivo Rechazo</th>
                      <th style={{ textAlign: 'center', width: '130px' }}>Estado Edición</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPolicies.length === 0 ? (
                      <tr><td colSpan="14" className="text-center">No hay pólizas que coincidan con la búsqueda.</td></tr>
                    ) : (
                      filteredPolicies
                        .slice((pagePolicies - 1) * pageSizePolicies, pagePolicies * pageSizePolicies)
                        .map((p) => {
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
                                value={p.deducible ?? 0}
                                onChange={(e) => handlePolicyCellChange(p.id, 'deducible', e.target.value)}
                                style={{ border: 'none', background: 'transparent', width: '85px', outline: 'none', borderBottom: '1px dashed var(--border)', padding: '0.2rem', color: (parseFloat(p.deducible) > 0) ? '#b45309' : '#15803d', fontWeight: 600 }}
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
                                <option value="cuatrimestral">Cuatrimestral</option>
                                <option value="trimestral">Trimestral</option>
                                <option value="mensual">Mensual</option>
                              </select>
                            </td>
                            <td>
                              <select
                                value={p.tipo_negocio || 'nuevo'}
                                onChange={(e) => handlePolicyCellChange(p.id, 'tipo_negocio', e.target.value)}
                                style={{ padding: '0.25rem', borderRadius: '4px', border: '1px solid var(--border)' }}
                              >
                                <option value="nuevo">Nuevo</option>
                                <option value="renovacion">Renovación</option>
                              </select>
                            </td>
                            <td>
                              <select
                                value={p.tipo_cobertura || 'individual'}
                                onChange={(e) => handlePolicyCellChange(p.id, 'tipo_cobertura', e.target.value)}
                                style={{ padding: '0.25rem', borderRadius: '4px', border: '1px solid var(--border)' }}
                              >
                                <option value="individual">Individual</option>
                                <option value="colectivo">Colectivo</option>
                              </select>
                            </td>
                            <td>
                              <select
                                value={p.asesor_id || ''}
                                onChange={(e) => handlePolicyCellChange(p.id, 'asesor_id', e.target.value)}
                                style={{ padding: '0.25rem', borderRadius: '4px', border: '1px solid var(--border)' }}
                              >
                                <option value="">Sin Asesor</option>
                                {advisors.map(adv => (
                                  <option key={adv.id} value={adv.id}>{adv.nombre}</option>
                                ))}
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
              <PaginationControls
                currentPage={pagePolicies}
                totalItems={filteredPolicies.length}
                pageSize={pageSizePolicies}
                onPageChange={setPagePolicies}
                onPageSizeChange={setPageSizePolicies}
              />

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

          {/* --- CONTROL DE PAGOS --- */}
          {activeTab === 'pagos' && (
            <div className="card">
              <h3 className="card-title" style={{ marginBottom: '1.5rem' }}>Registro Global de Cobranzas y Verificación</h3>
              
              {/* Sección de pagos reportados pendientes por verificar */}
              {payments.some(p => p.estado_pago === 'en_revision') && (
                <div style={{ marginBottom: '2rem', padding: '1.5rem', backgroundColor: '#fffbeb', border: '2px solid #f59e0b', borderRadius: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                    <span style={{ fontSize: '1.5rem' }}>🔔</span>
                    <h4 style={{ margin: 0, color: '#b45309', fontWeight: 800, fontSize: '1.1rem' }}>
                      Pagos Reportados Pendientes de Verificación ({payments.filter(p => p.estado_pago === 'en_revision').length})
                    </h4>
                  </div>
                  <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: '#92400e' }}>
                    Los siguientes pagos han sido reportados por los asesores/asegurados en Bolívares o Dólares. Verifique el comprobante bancario antes de aprobar. Al aprobar, la comisión se encolará automáticamente para la corrida del BNC.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
                    {payments.filter(p => p.estado_pago === 'en_revision').map(p => (
                      <div key={p.id} style={{ backgroundColor: '#ffffff', border: '1px solid #fcd34d', borderRadius: '8px', padding: '1rem', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                          <strong style={{ color: 'var(--primary)' }}>{p.poliza_codigo}</strong>
                          <span style={{ fontSize: '0.8rem', background: '#fef3c7', color: '#b45309', padding: '0.15rem 0.4rem', borderRadius: '4px', fontWeight: 700 }}>
                            {p.moneda_pago === 'VES' ? '🇻🇪 Pago en Bolívares' : '💵 Pago en Dólares'}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.85rem', lineHeight: 1.5, marginBottom: '0.75rem', color: '#334155' }}>
                          <div><strong>Cliente:</strong> {p.cliente_nombre}</div>
                          <div><strong>Aseguradora:</strong> {p.compania_nombre}</div>
                          <div>
                            <strong>Monto Reportado:</strong>{' '}
                            <span style={{ fontWeight: 800, fontSize: '1rem', color: p.moneda_pago === 'VES' ? '#2563eb' : '#16a34a' }}>
                              {p.moneda_pago === 'VES' ? 'Bs.' : '$'} {parseFloat(p.monto_reportado || p.monto).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          <div><strong>Referencia:</strong> <code style={{ fontWeight: 700, background: '#f1f5f9', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>{p.referencia || 'N/A'}</code></div>
                          <div><strong>Fecha Reportada:</strong> {p.fecha_pago ? p.fecha_pago.split('T')[0] : 'N/A'}</div>
                          {p.observaciones && <div><strong>Notas:</strong> <em>{p.observaciones}</em></div>}
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            onClick={() => handleVerifyPayment(p.id, 'aprobar')}
                            className="btn btn-primary"
                            style={{ flex: 2, padding: '0.4rem', fontSize: '0.8rem', background: '#16a34a', borderColor: '#16a34a' }}
                          >
                            ✓ Verificar y Aprobar
                          </button>
                          <button
                            onClick={() => handleVerifyPayment(p.id, 'rechazar')}
                            className="btn btn-secondary"
                            style={{ flex: 1, padding: '0.4rem', fontSize: '0.8rem', color: '#dc2626', borderColor: '#fca5a5' }}
                          >
                            ✕ Rechazar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Barra de Filtros y Control de Vista de Cobranzas */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem', background: '#f8fafc', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border)' }}>
                <input
                  type="text"
                  placeholder="🔍 Buscar por póliza, cliente, aseguradora, asesor o referencia..."
                  className="form-input"
                  style={{ minWidth: '280px', maxWidth: '380px', padding: '0.5rem 1rem', margin: 0 }}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />

                {/* Filtro por estado de pago */}
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
                    <option value="pagado">🟢 Pagados / Verificados</option>
                    <option value="rechazado">🔴 Rechazados</option>
                  </select>

                  <button
                    onClick={() => {
                      const allKeys = {};
                      groupedPaymentsByPolicy.forEach(g => { allKeys[g.poliza_id || g.poliza_codigo] = true; });
                      setExpandedPolicies(prev => (Object.keys(prev).length === groupedPaymentsByPolicy.length ? {} : allKeys));
                    }}
                    className="btn btn-secondary"
                    style={{ fontSize: '0.8rem', padding: '0.45rem 0.8rem', borderRadius: '6px' }}
                  >
                    {Object.keys(expandedPolicies).length === groupedPaymentsByPolicy.length && groupedPaymentsByPolicy.length > 0 ? 'Contraer Todos 🔼' : 'Expandir Todos 🔽'}
                  </button>
                </div>
              </div>

              {/* LISTADO DE PÓLIZAS CON SUS CUOTAS AGRUPADAS */}
              {groupedPaymentsByPolicy.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', background: '#f8fafc', borderRadius: '8px', border: '1px dashed var(--border)' }}>
                  No se encontraron cobros registrados con los criterios seleccionados.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {groupedPaymentsByPolicy
                    .slice((pagePayments - 1) * pageSizePayments, pagePayments * pageSizePayments)
                    .map((group) => {
                    const groupKey = group.poliza_id || group.poliza_codigo;
                    const isExpanded = !!expandedPolicies[groupKey];
                    const progressPercent = group.totalCuotas > 0 ? Math.round((group.cuotasPagadas / group.totalCuotas) * 100) : 0;

                    return (
                      <div
                        key={groupKey}
                        style={{
                          background: '#ffffff',
                          border: group.cuotasEnRevision > 0 ? '2px solid #f59e0b' : '1px solid var(--border)',
                          borderRadius: '10px',
                          overflow: 'hidden',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.03)'
                        }}
                      >
                        {/* Cabecera de la Póliza Agrupada */}
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
                          onClick={() => setExpandedPolicies(prev => ({ ...prev, [groupKey]: !prev[groupKey] }))}
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

                            {/* Alertas */}
                            {group.cuotasEnRevision > 0 && (
                              <span style={{ background: '#fef3c7', color: '#b45309', fontWeight: 800, fontSize: '0.75rem', padding: '0.3rem 0.6rem', borderRadius: '20px', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                🔔 {group.cuotasEnRevision} por verificar
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

                        {/* Tabla Desplegable de Cuotas de esta Póliza */}
                        {isExpanded && (
                          <div style={{ padding: '0.5rem 1rem 1rem 1rem', background: '#ffffff' }}>
                            <table className="table" style={{ margin: 0, fontSize: '0.85rem' }}>
                              <thead>
                                <tr style={{ background: '#f1f5f9' }}>
                                  <th style={{ width: '80px' }}>Cuota</th>
                                  <th>Monto ($)</th>
                                  <th>Monto Reportado</th>
                                  <th>Referencia</th>
                                  <th>Fecha Vencimiento</th>
                                  <th>Estado</th>
                                  <th>Observaciones</th>
                                  <th style={{ textAlign: 'center', width: '150px' }}>Acción</th>
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
                                    <td>
                                      {pa.fecha_vencimiento ? (() => {
                                        const vDateStr = typeof pa.fecha_vencimiento === 'string' ? pa.fecha_vencimiento.split('T')[0] : new Date(pa.fecha_vencimiento).toISOString().split('T')[0];
                                        const vDate2pm = new Date(`${vDateStr}T14:00:00-04:00`);
                                        const isVencido = vDate2pm < new Date() && pa.estado_pago !== 'pagado';

                                        return (
                                          <span style={{
                                            color: isVencido ? '#dc2626' : 'inherit',
                                            fontWeight: isVencido ? 700 : 'normal'
                                          }}>
                                            {vDateStr}
                                            {isVencido && <span style={{ fontSize: '0.7rem', color: '#dc2626', display: 'block', fontWeight: 800 }}>Vencida (2:00 PM)</span>}
                                          </span>
                                        );
                                      })() : 'N/A'}
                                    </td>
                                    <td>
                                      {pa.estado_pago === 'pagado' && (
                                        <span style={{ background: '#dcfce7', color: '#15803d', fontWeight: 700, fontSize: '0.75rem', padding: '0.2rem 0.4rem', borderRadius: '4px' }}>
                                          🟢 Pagado
                                        </span>
                                      )}
                                      {pa.estado_pago === 'en_revision' && (
                                        <span style={{ background: '#fef3c7', color: '#b45309', fontWeight: 700, fontSize: '0.75rem', padding: '0.2rem 0.4rem', borderRadius: '4px' }}>
                                          🟡 En Revisión
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
                                    <td style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                      {pa.observaciones || '—'}
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                      {pa.estado_pago === 'en_revision' ? (
                                        <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'center' }}>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); handleVerifyPayment(pa.id, 'aprobar'); }}
                                            className="btn btn-primary"
                                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#16a34a', borderColor: '#16a34a' }}
                                          >
                                            ✓ Aprobar
                                          </button>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); handleVerifyPayment(pa.id, 'rechazar'); }}
                                            className="btn btn-secondary"
                                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', color: '#dc2626', borderColor: '#fca5a5' }}
                                          >
                                            ✕ Rechazar
                                          </button>
                                        </div>
                                      ) : (
                                        <select
                                          value={pa.estado_pago}
                                          onClick={(e) => e.stopPropagation()}
                                          onChange={(e) => handleUpdatePaymentStatus(pa.id, e.target.value)}
                                          style={{ padding: '0.2rem 0.4rem', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '0.75rem', fontWeight: 600 }}
                                        >
                                          <option value="pendiente">Pendiente</option>
                                          <option value="pagado">Pagado</option>
                                          <option value="vencido">Vencido</option>
                                          <option value="rechazado">Rechazado</option>
                                        </select>
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
              <PaginationControls
                currentPage={pagePayments}
                totalItems={groupedPaymentsByPolicy.length}
                pageSize={pageSizePayments}
                onPageChange={setPagePayments}
                onPageSizeChange={setPageSizePayments}
              />
            </div>
          )}

          {/* --- GESTIÓN DE ROLES --- */}
          {activeTab === 'roles' && (
            <div className="card">
              <h3 className="card-title" style={{ marginBottom: '1.5rem' }}>Usuarios y Configuración de Privilegios</h3>
              <div style={{ marginBottom: '1.2rem' }}>
                <input
                  type="text"
                  placeholder="🔍 Buscar usuarios por correo o rango..."
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
                      <th>ID</th>
                      <th>Correo Electrónico</th>
                      <th>Rol en el Sistema</th>
                      <th>Fecha de Registro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.length === 0 ? (
                      <tr><td colSpan="4" className="text-center">No hay usuarios que coincidan con la búsqueda.</td></tr>
                    ) : (
                      filteredUsers
                        .slice((pageUsers - 1) * pageSizeUsers, pageUsers * pageSizeUsers)
                        .map((u) => (
                        <tr key={u.id}>
                          <td>{u.id}</td>
                          <td>{u.correo}</td>
                          <td>
                            {u.id === user.id ? (
                              <span className="badge badge-vigente" style={{ textTransform: 'uppercase' }}>{u.rango} (Tú)</span>
                            ) : (
                              <select
                                value={u.rango}
                                onChange={(e) => handleUpdateUserRole(u.id, e.target.value)}
                                style={{ padding: '0.25rem', borderRadius: '4px', border: '1px solid var(--border)' }}
                              >
                                <option value="cliente">Cliente</option>
                                <option value="asesor">Asesor</option>
                                <option value="admin">Administrador</option>
                              </select>
                            )}
                          </td>
                          <td>{u.created_at ? u.created_at.split('T')[0] : 'N/A'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <PaginationControls
                currentPage={pageUsers}
                totalItems={filteredUsers.length}
                pageSize={pageSizeUsers}
                onPageChange={setPageUsers}
                onPageSizeChange={setPageSizeUsers}
              />
            </div>
          )}

          {/* --- GESTIÓN DE ASESORES --- */}
          {activeTab === 'asesores' && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <h3 className="card-title" style={{ margin: 0, border: 'none' }}>Directorio y Registro de Asesores</h3>
                <button 
                  onClick={() => setShowAdvisorModal(true)} 
                  className="btn btn-primary"
                  style={{ padding: '0.5rem 1rem' }}
                >
                  + Registrar Nuevo Asesor
                </button>
              </div>

              {/* Formulario de registro (tipo modal / colapsable arriba) */}
              {showAdvisorModal && (
                <div style={{
                  backgroundColor: 'var(--secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '1.5rem',
                  marginBottom: '2rem'
                }}>
                  <h4 style={{ color: 'var(--primary)', marginBottom: '1rem', fontWeight: 700 }}>Nuevo Perfil de Asesor</h4>
                  <form onSubmit={handleRegisterAdvisor}>
                    <div className="form-grid">
                      <div className="form-group">
                        <label className="form-label">Nombre Completo *</label>
                        <input 
                          type="text" 
                          className="form-input" 
                          value={advisorForm.nombre} 
                          onChange={e => setAdvisorForm({...advisorForm, nombre: e.target.value})} 
                          required 
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Cédula *</label>
                        <input 
                          type="text" 
                          className="form-input" 
                          placeholder="Ej: V-12345678" 
                          value={advisorForm.cedula} 
                          onChange={e => setAdvisorForm({...advisorForm, cedula: e.target.value})} 
                          required 
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Correo Electrónico *</label>
                        <input 
                          type="email" 
                          className="form-input" 
                          placeholder="correo@asesor.com" 
                          value={advisorForm.correo} 
                          onChange={e => setAdvisorForm({...advisorForm, correo: e.target.value})} 
                          required 
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Contraseña de Acceso *</label>
                        <input 
                          type="password" 
                          className="form-input" 
                          placeholder="Mínimo 8 caracteres" 
                          value={advisorForm.contrasena} 
                          onChange={e => setAdvisorForm({...advisorForm, contrasena: e.target.value})} 
                          required 
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Teléfono de Contacto *</label>
                        <input 
                          type="text" 
                          className="form-input" 
                          placeholder="0412-1234567" 
                          value={advisorForm.telefono} 
                          onChange={e => setAdvisorForm({...advisorForm, telefono: e.target.value})} 
                          required 
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Fecha de Nacimiento *</label>
                        <input 
                          type="date" 
                          className="form-input" 
                          value={advisorForm.fecha_nacimiento} 
                          onChange={e => setAdvisorForm({...advisorForm, fecha_nacimiento: e.target.value})} 
                          required 
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Banco de la Cuenta *</label>
                        <input 
                          type="text" 
                          className="form-input" 
                          placeholder="Ej: Banesco, Banco de Venezuela" 
                          value={advisorForm.banco} 
                          onChange={e => setAdvisorForm({...advisorForm, banco: e.target.value})} 
                          required 
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Número de Cuenta Bancaria (20 dígitos) *</label>
                        <input 
                          type="text" 
                          className="form-input" 
                          placeholder="0102..." 
                          maxLength="20"
                          value={advisorForm.numero_cuenta} 
                          onChange={e => setAdvisorForm({...advisorForm, numero_cuenta: e.target.value})} 
                          required 
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
                      <button 
                        type="button" 
                        onClick={() => setShowAdvisorModal(false)} 
                        className="btn btn-secondary"
                      >
                        Cancelar
                      </button>
                      <button 
                        type="submit" 
                        className="btn btn-primary" 
                        disabled={submittingAdvisor}
                      >
                        {submittingAdvisor ? 'Registrando...' : 'Registrar Asesor'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Buscador de Asesores */}
              <div style={{ marginBottom: '1.2rem' }}>
                <input
                  type="text"
                  placeholder="🔍 Buscar asesores por nombre, cédula, código o banco..."
                  className="form-input"
                  style={{ maxWidth: '350px', padding: '0.5rem 1rem', margin: 0 }}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Tabla de Asesores */}
              <div className="table-container" style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Nombre</th>
                      <th>Cédula</th>
                      <th>Teléfono</th>
                      <th>Correo</th>
                      <th>Fecha Nac.</th>
                      <th>Datos Bancarios</th>
                      <th>Nivel Jerárquico</th>
                      <th>Clientes</th>
                      <th>Estado</th>
                      <th style={{ textAlign: 'right' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAdvisors.length === 0 ? (
                      <tr><td colSpan="11" className="text-center" style={{ padding: '2rem', color: 'var(--text-muted)' }}>No se encontraron asesores.</td></tr>
                    ) : (
                      filteredAdvisors
                        .slice((pageAdvisors - 1) * pageSizeAdvisors, pageAdvisors * pageSizeAdvisors)
                        .map((a) => (
                        <tr key={a.id_asesor}>
                          <td style={{ fontWeight: 'bold', color: 'var(--primary)' }}>{a.codigo_asesor}</td>
                          <td>{a.nombre}</td>
                          <td>{a.cedula}</td>
                          <td>{a.telefono}</td>
                          <td>{a.correo}</td>
                          <td>{a.fecha_nacimiento}</td>
                          <td>
                            <strong>{a.banco}</strong>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>CTA: {a.numero_cuenta}</span>
                          </td>
                          <td>
                            <select
                              className="form-input"
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', fontWeight: 600, minWidth: '140px', borderColor: '#cbd5e1' }}
                              value={a.tipo_asesor || 'asesor_3'}
                              onChange={(e) => handleUpdateAdvisorLevel(a.id_asesor, e.target.value)}
                            >
                              <option value="asesor_3">🥉 Asesor 3 (Junior)</option>
                              <option value="asesor_2">🥈 Asesor 2 (Intermedio)</option>
                              <option value="asesor_1">🥇 Asesor 1 (Senior)</option>
                            </select>
                          </td>
                          <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.clientes}>
                            {a.clientes}
                          </td>
                          <td>
                            {a.estado === 'aprobado' && <span className="badge badge-vigente" style={{ background: '#10b981', color: '#fff', fontSize: '0.75rem', padding: '0.2rem 0.4rem', borderRadius: '4px' }}>Aprobado</span>}
                            {a.estado === 'pendiente' && <span className="badge badge-negociacion" style={{ background: '#f59e0b', color: '#fff', fontSize: '0.75rem', padding: '0.2rem 0.4rem', borderRadius: '4px' }}>Pendiente</span>}
                            {a.estado === 'rechazado' && <span className="badge badge-vencida" style={{ background: '#ef4444', color: '#fff', fontSize: '0.75rem', padding: '0.2rem 0.4rem', borderRadius: '4px' }}>Rechazado</span>}
                            {a.estado === 'inactivo' && <span className="badge" style={{ background: '#64748b', color: '#fff', fontSize: '0.75rem', padding: '0.2rem 0.4rem', borderRadius: '4px' }}>Inactivo</span>}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                              {a.estado === 'pendiente' && (
                                <>
                                  <button 
                                    onClick={() => handleUpdateAdvisorStatus(a.id_asesor, 'aprobado')} 
                                    className="btn btn-primary" 
                                    style={{ padding: '0.3rem 0.5rem', fontSize: '0.75rem', background: '#10b981', margin: 0 }}
                                    title="Aprobar asesor para que pueda operar"
                                  >
                                    ✓ Aprobar
                                  </button>
                                  <button 
                                    onClick={() => handleUpdateAdvisorStatus(a.id_asesor, 'rechazado')} 
                                    className="btn btn-accent" 
                                    style={{ padding: '0.3rem 0.5rem', fontSize: '0.75rem', background: '#f59e0b', margin: 0 }}
                                    title="Rechazar solicitud de asesor"
                                  >
                                    ✗ Rechazar
                                  </button>
                                </>
                              )}
                              {a.estado === 'aprobado' && (
                                <button 
                                  onClick={() => handleUpdateAdvisorStatus(a.id_asesor, 'inactivo')} 
                                  className="btn" 
                                  style={{ padding: '0.3rem 0.5rem', fontSize: '0.75rem', background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', margin: 0 }}
                                  title="Desactivar temporalmente al asesor (Borrado lógico)"
                                >
                                  ⏸️ Inactivar
                                </button>
                              )}
                              {(a.estado === 'inactivo' || a.estado === 'rechazado') && (
                                <button 
                                  onClick={() => handleUpdateAdvisorStatus(a.id_asesor, 'aprobado')} 
                                  className="btn btn-primary" 
                                  style={{ padding: '0.3rem 0.5rem', fontSize: '0.75rem', background: '#10b981', margin: 0 }}
                                  title="Reactivar asesor"
                                >
                                  ✓ Reactivar
                                </button>
                              )}
                              <button 
                                onClick={() => handleDeleteAdvisor(a.id_asesor)} 
                                className="btn btn-accent" 
                                style={{ padding: '0.3rem 0.5rem', fontSize: '0.75rem', background: '#e11d48', margin: 0 }}
                                title="Eliminar definitivamente del sistema"
                              >
                                🗑️ Eliminar
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <PaginationControls
                currentPage={pageAdvisors}
                totalItems={filteredAdvisors.length}
                pageSize={pageSizeAdvisors}
                onPageChange={setPageAdvisors}
                onPageSizeChange={setPageSizeAdvisors}
              />
            </div>
          )}

          {/* --- CARGA Y EDICIÓN DE TARIFAS --- */}
          {activeTab === 'tarifas' && (
            <div className="card">
              <h3 className="card-title" style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', border: 'none' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  📊 Matriz y Tarifario Oficial
                </span>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button 
                    onClick={() => {
                      setNewTariffForm({
                        compania_id: companies[0]?.id ? String(companies[0].id) : '1',
                        plan: '',
                        ramo: 'Salud',
                        edad_min: 18,
                        edad_max: 29,
                        suma_asegurada: 5000,
                        deducible: 0,
                        prima: 100,
                        pago_contado: true,
                        pago_semestral: true,
                        pago_cuatrimestral: false,
                        pago_trimestral: true,
                        pago_mensual: true,
                        atencion_medica_primaria: true,
                        medicinas: true,
                        consultas_medicas: true,
                        rehabilitacion: false,
                        protesis: false,
                        muleta_silla_ruedas: false,
                        examenes_lab_imagenologia: true,
                        consultas: true,
                        maternidad: false,
                        maternidad_suma: '',
                        maternidad_costo: '',
                        oftalmologia: false,
                        odontologia: false,
                        ambulancia: true,
                        asist_intl_suma: '',
                        asist_intl_costo: '',
                        funeral_suma: '',
                        funeral_costo: ''
                      });
                      setShowNewTariffModal(true);
                    }} 
                    className="btn btn-primary" 
                    style={{ fontSize: '0.85rem', padding: '0.45rem 1rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700 }}
                  >
                    ✨ + Nueva Tarifa (Modal Guiado)
                  </button>
                  {tariffView === 'excel' && (
                    <button onClick={handleAddTariffRow} className="btn btn-accent" style={{ fontSize: '0.85rem', padding: '0.45rem 0.8rem', fontWeight: 600 }}>
                      + Fila Rápida en Tabla
                    </button>
                  )}
                </div>
              </h3>

              {/* MODAL GUIADO PARA CREAR / EDITAR TARIFA */}
              {showNewTariffModal && (
                <div style={{
                  position: 'fixed',
                  top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: 'rgba(0,0,0,0.5)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  zIndex: 9999, padding: '1rem'
                }}>
                  <div className="card" style={{ maxWidth: '750px', width: '100%', maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
                      <div>
                        <h4 style={{ margin: 0, color: 'var(--primary)', fontWeight: 800, fontSize: '1.15rem' }}>
                          {editingTariffId ? `✏️ Editar Tarifa (#${editingTariffId} - ${newTariffForm.plan || 'Plan'})` : '✨ Agregar Nueva Tarifa al Tarifario'}
                        </h4>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {editingTariffId ? 'Modifica los valores del plan, edades, prima y coberturas de esta tarifa.' : 'Configura los datos del plan, edades, prima y coberturas incluidas.'}
                        </p>
                      </div>
                      <button 
                        onClick={() => { setShowNewTariffModal(false); setEditingTariffId(null); }}
                        style={{ border: 'none', background: 'transparent', fontSize: '1.4rem', cursor: 'pointer', color: 'var(--text-muted)' }}
                      >
                        ✕
                      </button>
                    </div>

                    <form onSubmit={handleSaveTariffModal} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                      {/* SECCIÓN 1: ASEGURADORA Y PRODUCTO */}
                      <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                        <h5 style={{ margin: '0 0 0.75rem 0', color: 'var(--primary)', fontWeight: 700, fontSize: '0.9rem' }}>🏢 1. Aseguradora y Plan</h5>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                          <div>
                            <label className="form-label" style={{ fontWeight: 600 }}>Compañía Aseguradora *</label>
                            <select
                              className="form-input"
                              value={newTariffForm.compania_id}
                              onChange={(e) => setNewTariffForm(prev => ({ ...prev, compania_id: e.target.value }))}
                              required
                            >
                              {companies.map(comp => (
                                <option key={comp.id} value={comp.id}>{comp.nombre}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="form-label" style={{ fontWeight: 600 }}>Nombre del Plan / Producto *</label>
                            <input
                              type="text"
                              placeholder="Ej. ACCESS, SALUD EXTERIOR, PLAN DORADO"
                              className="form-input"
                              value={newTariffForm.plan}
                              onChange={(e) => setNewTariffForm(prev => ({ ...prev, plan: e.target.value }))}
                              required
                            />
                          </div>
                          <div>
                            <label className="form-label" style={{ fontWeight: 600 }}>Ramo</label>
                            <select
                              className="form-input"
                              value={newTariffForm.ramo}
                              onChange={(e) => setNewTariffForm(prev => ({ ...prev, ramo: e.target.value }))}
                            >
                              <option value="Salud">Salud</option>
                              <option value="Patrimoniales">Patrimoniales</option>
                              <option value="Vida">Vida</option>
                              <option value="Visa">Visa</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* SECCIÓN 2: VALORES ECONÓMICOS Y RANGO DE EDAD */}
                      <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                        <h5 style={{ margin: '0 0 0.75rem 0', color: 'var(--primary)', fontWeight: 700, fontSize: '0.9rem' }}>💰 2. Rango de Edad y Costos</h5>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem' }}>
                          <div>
                            <label className="form-label" style={{ fontWeight: 600 }}>Edad Mínima *</label>
                            <input
                              type="number"
                              className="form-input"
                              value={newTariffForm.edad_min}
                              onChange={(e) => setNewTariffForm(prev => ({ ...prev, edad_min: e.target.value }))}
                              required
                            />
                          </div>
                          <div>
                            <label className="form-label" style={{ fontWeight: 600 }}>Edad Máxima *</label>
                            <input
                              type="number"
                              className="form-input"
                              value={newTariffForm.edad_max}
                              onChange={(e) => setNewTariffForm(prev => ({ ...prev, edad_max: e.target.value }))}
                              required
                            />
                          </div>
                          <div>
                            <label className="form-label" style={{ fontWeight: 600 }}>Suma Asegurada ($) *</label>
                            <select
                              className="form-input"
                              value={newTariffForm.suma_asegurada}
                              onChange={(e) => setNewTariffForm(prev => ({ ...prev, suma_asegurada: e.target.value }))}
                            >
                              {SUMA_ASEGURADA_OPTIONS.map(s => (
                                <option key={s} value={s}>${s.toLocaleString('en-US')}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="form-label" style={{ fontWeight: 600 }}>Deducible ($)</label>
                            <input
                              type="number"
                              placeholder="0"
                              className="form-input"
                              value={newTariffForm.deducible}
                              onChange={(e) => setNewTariffForm(prev => ({ ...prev, deducible: e.target.value }))}
                            />
                          </div>
                          <div>
                            <label className="form-label" style={{ fontWeight: 600, color: 'var(--accent)' }}>Prima Base ($) *</label>
                            <input
                              type="number"
                              step="0.01"
                              placeholder="100.00"
                              className="form-input"
                              value={newTariffForm.prima}
                              onChange={(e) => setNewTariffForm(prev => ({ ...prev, prima: e.target.value }))}
                              style={{ fontWeight: 'bold', color: 'var(--accent)' }}
                              required
                            />
                          </div>
                        </div>
                      </div>

                      {/* SECCIÓN 3: FRECUENCIAS DE PAGO */}
                      <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                        <h5 style={{ margin: '0 0 0.75rem 0', color: 'var(--primary)', fontWeight: 700, fontSize: '0.9rem' }}>💳 3. Modalidades de Pago Habilitadas</h5>
                        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                          {[
                            { key: 'pago_contado', label: 'Contado (Anual)' },
                            { key: 'pago_semestral', label: 'Semestral (2)' },
                            { key: 'pago_cuatrimestral', label: 'Cuatrimestral (3)' },
                            { key: 'pago_trimestral', label: 'Trimestral (4)' },
                            { key: 'pago_bimestral', label: 'Bimestral (6)' },
                            { key: 'pago_4_cuotas', label: '4 Cuotas Consecutivas (Mensual)' },
                            { key: 'pago_mensual', label: 'Mensual (12)' }
                          ].map(f => (
                            <label key={f.key} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, background: '#fff', padding: '0.35rem 0.6rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                              <input
                                type="checkbox"
                                checked={!!newTariffForm[f.key]}
                                onChange={(e) => setNewTariffForm(prev => ({ ...prev, [f.key]: e.target.checked }))}
                              />
                              {f.label}
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* SECCIÓN 4: COBERTURAS Y ASISTENCIAS */}
                      <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                        <h5 style={{ margin: '0 0 0.75rem 0', color: 'var(--primary)', fontWeight: 700, fontSize: '0.9rem' }}>🏥 4. Coberturas y Beneficios Incluidos</h5>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.6rem' }}>
                          {[
                            { key: 'atencion_medica_primaria', label: '🏥 Atención Médica Primaria (AMP)' },
                            { key: 'medicinas', label: '💊 Medicamentos Prescritos' },
                            { key: 'consultas_medicas', label: '🩺 Consultas Médicas' },
                            { key: 'examenes_lab_imagenologia', label: '🔬 Exámenes Lab e Imágenes' },
                            { key: 'ambulancia', label: '🚑 Servicio de Ambulancia' },
                            { key: 'consultas', label: '📋 Consultas Especialistas' },
                            { key: 'rehabilitacion', label: '🩹 Fisioterapia / Rehabilitación' },
                            { key: 'protesis', label: '🦿 Prótesis Quirúrgicas' },
                            { key: 'muleta_silla_ruedas', label: '♿ Muleta + Silla de Ruedas' },
                            { key: 'oftalmologia', label: '👓 Oftalmología' },
                            { key: 'odontologia', label: '🦷 Odontología' },
                            { key: 'muerte_accidental', label: '🕊️ Muerte Accidental' },
                            { key: 'invalidez_permanente', label: '🩼 Invalidez Permanente' },
                            { key: 'maternidad', label: '🤰 Cobertura de Maternidad' }
                          ].map(b => (
                            <label key={b.key} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', background: '#fff', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                              <input
                                type="checkbox"
                                checked={!!newTariffForm[b.key]}
                                onChange={(e) => setNewTariffForm(prev => ({ ...prev, [b.key]: e.target.checked }))}
                              />
                              <span style={{ fontWeight: 500 }}>{b.label}</span>
                            </label>
                          ))}
                        </div>

                        {/* Coberturas con Sumas Aseguradas y Costos Adicionales */}
                        <div style={{ marginTop: '1rem', borderTop: '1px dashed #cbd5e1', paddingTop: '0.75rem' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>
                            📋 Sumas Aseguradas y Costos Adicionales (dejar en 0 o vacío si está 100% incluido):
                          </span>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                            {/* Muerte Accidental */}
                            <div style={{ background: '#fff', padding: '0.6rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--primary)', display: 'block', marginBottom: '0.3rem' }}>
                                🕊️ Muerte Accidental
                              </label>
                              <div style={{ display: 'flex', gap: '0.4rem' }}>
                                <input
                                  type="text"
                                  placeholder="Suma ($) ej. 10000"
                                  className="form-input"
                                  style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', margin: 0 }}
                                  value={newTariffForm.muerte_accidental_suma}
                                  onChange={(e) => setNewTariffForm(prev => ({ ...prev, muerte_accidental_suma: e.target.value, muerte_accidental: !!e.target.value || prev.muerte_accidental }))}
                                />
                                <input
                                  type="text"
                                  placeholder="Costo Extra ($)"
                                  className="form-input"
                                  style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', margin: 0, width: '110px' }}
                                  value={newTariffForm.muerte_accidental_costo}
                                  onChange={(e) => setNewTariffForm(prev => ({ ...prev, muerte_accidental_costo: e.target.value }))}
                                />
                              </div>
                            </div>

                            {/* Invalidez Permanente */}
                            <div style={{ background: '#fff', padding: '0.6rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--primary)', display: 'block', marginBottom: '0.3rem' }}>
                                🩼 Invalidez Permanente
                              </label>
                              <div style={{ display: 'flex', gap: '0.4rem' }}>
                                <input
                                  type="text"
                                  placeholder="Suma ($) ej. 10000"
                                  className="form-input"
                                  style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', margin: 0 }}
                                  value={newTariffForm.invalidez_permanente_suma}
                                  onChange={(e) => setNewTariffForm(prev => ({ ...prev, invalidez_permanente_suma: e.target.value, invalidez_permanente: !!e.target.value || prev.invalidez_permanente }))}
                                />
                                <input
                                  type="text"
                                  placeholder="Costo Extra ($)"
                                  className="form-input"
                                  style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', margin: 0, width: '110px' }}
                                  value={newTariffForm.invalidez_permanente_costo}
                                  onChange={(e) => setNewTariffForm(prev => ({ ...prev, invalidez_permanente_costo: e.target.value }))}
                                />
                              </div>
                            </div>

                            {/* Maternidad */}
                            <div style={{ background: '#fff', padding: '0.6rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--primary)', display: 'block', marginBottom: '0.3rem' }}>
                                🤰 Maternidad
                              </label>
                              <div style={{ display: 'flex', gap: '0.4rem' }}>
                                <input
                                  type="text"
                                  placeholder="Suma ($) ej. 3000"
                                  className="form-input"
                                  style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', margin: 0 }}
                                  value={newTariffForm.maternidad_suma}
                                  onChange={(e) => setNewTariffForm(prev => ({ ...prev, maternidad_suma: e.target.value, maternidad: !!e.target.value || prev.maternidad }))}
                                />
                                <input
                                  type="text"
                                  placeholder="Costo Extra ($)"
                                  className="form-input"
                                  style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', margin: 0, width: '110px' }}
                                  value={newTariffForm.maternidad_costo}
                                  onChange={(e) => setNewTariffForm(prev => ({ ...prev, maternidad_costo: e.target.value }))}
                                />
                              </div>
                            </div>

                            {/* Asistencia Viajes */}
                            <div style={{ background: '#fff', padding: '0.6rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--primary)', display: 'block', marginBottom: '0.3rem' }}>
                                ✈️ Asistencia Viajes
                              </label>
                              <div style={{ display: 'flex', gap: '0.4rem' }}>
                                <input
                                  type="text"
                                  placeholder="Suma ($) ej. 5000"
                                  className="form-input"
                                  style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', margin: 0 }}
                                  value={newTariffForm.asist_intl_suma}
                                  onChange={(e) => setNewTariffForm(prev => ({ ...prev, asist_intl_suma: e.target.value }))}
                                />
                                <input
                                  type="text"
                                  placeholder="Costo Extra ($)"
                                  className="form-input"
                                  style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', margin: 0, width: '110px' }}
                                  value={newTariffForm.asist_intl_costo}
                                  onChange={(e) => setNewTariffForm(prev => ({ ...prev, asist_intl_costo: e.target.value }))}
                                />
                              </div>
                            </div>

                            {/* Gastos Funerarios */}
                            <div style={{ background: '#fff', padding: '0.6rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--primary)', display: 'block', marginBottom: '0.3rem' }}>
                                ⚱️ Gastos Funerarios
                              </label>
                              <div style={{ display: 'flex', gap: '0.4rem' }}>
                                <input
                                  type="text"
                                  placeholder="Suma ($) ej. 1000"
                                  className="form-input"
                                  style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', margin: 0 }}
                                  value={newTariffForm.funeral_suma}
                                  onChange={(e) => setNewTariffForm(prev => ({ ...prev, funeral_suma: e.target.value }))}
                                />
                                <input
                                  type="text"
                                  placeholder="Costo Extra ($)"
                                  className="form-input"
                                  style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', margin: 0, width: '110px' }}
                                  value={newTariffForm.funeral_costo}
                                  onChange={(e) => setNewTariffForm(prev => ({ ...prev, funeral_costo: e.target.value }))}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                        <button
                          type="button"
                          onClick={() => { setShowNewTariffModal(false); setEditingTariffId(null); }}
                          className="btn btn-secondary"
                          disabled={submittingNewTariff}
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          className="btn btn-primary"
                          disabled={submittingNewTariff}
                          style={{ fontWeight: 700, padding: '0.5rem 1.2rem' }}
                        >
                          {submittingNewTariff ? 'Guardando en Servidor...' : (editingTariffId ? '✓ Guardar Cambios en Tarifa' : '✓ Guardar y Registrar en Tarifario')}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                {tariffView === 'comparativa' 
                  ? 'Por cada rango de edad y suma asegurada se muestra la oferta más económica de cada aseguradora. Los campos vacíos indican que esa aseguradora no ofrece esa combinación.'
                  : 'Editor interactivo en formato hoja de cálculo (Excel). Edita los valores de las celdas directamente, agrega filas y guarda todo el lote al finalizar.'}
              </p>

              {tarifarioMeta && (
                <div style={{
                  backgroundColor: 'var(--secondary)',
                  border: '1.5px dashed var(--primary)',
                  borderRadius: '8px',
                  padding: '1rem',
                  marginBottom: '1.5rem',
                  fontSize: '0.85rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '1rem',
                  color: 'var(--text-primary)'
                }}>
                  <div>
                    <strong>📁 Versión Actual del Tarifario:</strong> <span style={{ color: 'var(--primary)', fontWeight: '800', backgroundColor: 'rgba(37,99,235,0.1)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>v{tarifarioMeta.version}</span>
                  </div>
                  <div>
                    <strong>🕒 Última Modificación:</strong> <span style={{ fontWeight: '600' }}>{new Date(tarifarioMeta.ultima_modificacion).toLocaleString('es-VE')}</span>
                  </div>
                  <div>
                    <strong>👤 Modificado Por:</strong> <span style={{ fontStyle: 'italic', fontWeight: '600' }}>{tarifarioMeta.usuario_correo}</span>
                  </div>
                </div>
              )}

              {/* Selector de Vista: Resumen vs Editor Excel */}
              <div className="segmented-control">
                <button
                  type="button"
                  className={`segmented-button ${tariffView === 'comparativa' ? 'active' : ''}`}
                  onClick={() => setTariffView('comparativa')}
                >
                  📊 Vista Resumen / Comparativa
                </button>
                <button
                  type="button"
                  className={`segmented-button ${tariffView === 'excel' ? 'active' : ''}`}
                  onClick={() => setTariffView('excel')}
                >
                  🗂️ Editor de Planilla (Excel)
                </button>
              </div>

              {/* Buscador de planilla, filtros avanzados y opciones */}
              <div style={{ marginBottom: '1.25rem', background: '#fff', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border)', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', flex: 1 }}>
                    {/* Buscador de texto libre */}
                    <div style={{ position: 'relative', minWidth: '260px', maxWidth: '340px' }}>
                      <input
                        type="text"
                        placeholder="🔍 Buscar aseguradora, plan, edad, prima..."
                        className="form-input"
                        style={{ width: '100%', padding: '0.55rem 2rem 0.55rem 0.85rem', margin: 0, fontSize: '0.85rem' }}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery('')}
                          style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.85rem' }}
                          title="Borrar búsqueda"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    {/* Filtro por Aseguradora */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--primary)', whiteSpace: 'nowrap' }}>
                        🏢 Aseguradora:
                      </label>
                      <select
                        value={filterCompany}
                        onChange={(e) => setFilterCompany(e.target.value)}
                        className="form-input"
                        style={{ padding: '0.5rem 0.75rem', margin: 0, fontSize: '0.82rem', fontWeight: 600, minWidth: '160px' }}
                      >
                        <option value="todas">Todas ({tariffs.length})</option>
                        {companies.map(c => {
                          const cnt = companyTariffCounts[String(c.id)] || 0;
                          return (
                            <option key={c.id} value={c.id}>
                              {c.nombre} {cnt > 0 ? `(${cnt})` : ''}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    {/* Filtro por Suma Asegurada */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--primary)', whiteSpace: 'nowrap' }}>
                        🛡️ Suma:
                      </label>
                      <select
                        value={filterSuma}
                        onChange={(e) => setFilterSuma(e.target.value)}
                        className="form-input"
                        style={{ padding: '0.5rem 0.75rem', margin: 0, fontSize: '0.82rem', fontWeight: 600, minWidth: '130px' }}
                      >
                        <option value="todas">Todas</option>
                        {SUMA_ASEGURADA_OPTIONS.map(s => (
                          <option key={s} value={s}>${s.toLocaleString('en-US')}</option>
                        ))}
                      </select>
                    </div>

                    {/* Filtro por Ramo */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--primary)', whiteSpace: 'nowrap' }}>
                        🏥 Ramo:
                      </label>
                      <select
                        value={filterRamo}
                        onChange={(e) => setFilterRamo(e.target.value)}
                        className="form-input"
                        style={{ padding: '0.5rem 0.75rem', margin: 0, fontSize: '0.82rem', fontWeight: 600, minWidth: '110px' }}
                      >
                        <option value="todos">Todos</option>
                        {RAMO_OPTIONS.map(r => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </div>

                    {/* Botón Limpiar Filtros */}
                    {(searchQuery || filterCompany !== 'todas' || filterSuma !== 'todas' || filterRamo !== 'todos') && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          setFilterCompany('todas');
                          setFilterSuma('todas');
                          setFilterRamo('todos');
                        }}
                        className="btn btn-secondary"
                        style={{ padding: '0.45rem 0.75rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#b91c1c' }}
                      >
                        ✕ Limpiar filtros
                      </button>
                    )}
                  </div>

                  {/* Contador de resultados */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.8rem', background: '#eff6ff', color: '#1e40af', padding: '0.35rem 0.75rem', borderRadius: '20px', fontWeight: 700, border: '1px solid #bfdbfe' }}>
                      {tariffView === 'comparativa' 
                        ? `${filteredPivotRows.length} ${filteredPivotRows.length === 1 ? 'fila' : 'filas'} (${visibleCompanies.length} aseguradoras)`
                        : `${filteredTariffs.length} ${filteredTariffs.length === 1 ? 'tarifa' : 'tarifas'}`
                      }
                    </span>
                  </div>
                </div>

                {/* Botón/menú desplegable de carga y descarga JSON */}
                <details style={{ background: 'var(--secondary)', padding: '0.6rem 1rem', borderRadius: '8px', cursor: 'pointer', border: '1px solid var(--border)' }}>
                  <summary style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--primary)', userSelect: 'none' }}>⚙️ Opciones de Carga y Descarga JSON</summary>
                  <div style={{ marginTop: '1rem', cursor: 'default' }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
                      Descarga el tarifario actual o sube un archivo JSON para actualizarlo masivamente.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                      <button
                        type="button"
                        onClick={handleExportCurrentTariffJson}
                        className="btn btn-primary"
                        style={{ fontSize: '0.8rem', padding: '0.45rem 0.75rem', width: '100%', justifyContent: 'center', background: '#0284c7', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}
                      >
                        📥 Descargar Tarifario Actual (JSON)
                      </button>
                      <a
                        href="/plantilla_tarifas.json"
                        download="plantilla_tarifas.json"
                        className="btn btn-secondary"
                        style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem', width: '100%', justifyContent: 'center' }}
                      >
                        Descargar Plantilla JSON Vacía 📄
                      </a>
                    </div>
                    <form onSubmit={handleBulkUpload} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        type="file"
                        id="file-upload-input"
                        accept=".json"
                        onChange={e => setFileToUpload(e.target.files[0])}
                        style={{ border: '1px solid var(--border)', padding: '0.35rem', borderRadius: '4px', fontSize: '0.8rem', background: '#fff', flex: 1 }}
                      />
                      <button type="submit" className="btn btn-primary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }} disabled={loading}>
                        Subir JSON
                      </button>
                    </form>
                  </div>
                </details>
              </div>

              {tariffView === 'comparativa' ? (
                /* --- VISTA RESUMEN / COMPARATIVA --- */
                <div className="table-container" style={{ maxHeight: '600px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
                  <table className="table" style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: 'max-content' }}>
                    <colgroup>
                      <col style={{ width: `${comparativeColWidths['rango'] || 100}px` }} />
                      <col style={{ width: `${comparativeColWidths['suma_asegurada'] || 130}px` }} />
                      {visibleCompanies.map(c => (
                        <React.Fragment key={c.id}>
                          <col style={{ width: `${comparativeColWidths[`plan_${c.id}`] || 95}px` }} />
                          <col style={{ width: `${comparativeColWidths[`prima_${c.id}`] || 95}px` }} />
                          <col style={{ width: `${comparativeColWidths[`maternidad_${c.id}`] || 115}px` }} />
                          <col style={{ width: `${comparativeColWidths[`asist_fun_${c.id}`] || 130}px` }} />
                        </React.Fragment>
                      ))}
                    </colgroup>
                    <thead>
                      <tr style={{ background: 'var(--secondary)' }}>
                        <th rowSpan={2} style={{ border: '1px solid var(--border)', padding: '0.5rem', position: 'relative', userSelect: 'none' }}>
                          Rango Edad
                          <div className={`resize-handle ${resizingCol === 'rango' ? 'resizing' : ''}`} onMouseDown={(e) => handleCompResizeStart(e, 'rango', 100)} />
                        </th>
                        <th rowSpan={2} style={{ border: '1px solid var(--border)', padding: '0.5rem', position: 'relative', userSelect: 'none' }}>
                          Suma Asegurada ($)
                          <div className={`resize-handle ${resizingCol === 'suma_asegurada' ? 'resizing' : ''}`} onMouseDown={(e) => handleCompResizeStart(e, 'suma_asegurada', 130)} />
                        </th>
                        {visibleCompanies.map(c => (
                          <th key={c.id} colSpan={4} style={{ border: '1px solid var(--border)', padding: '0.5rem', textAlign: 'center' }}>{c.nombre}</th>
                        ))}
                      </tr>
                      <tr style={{ background: 'var(--secondary)' }}>
                        {visibleCompanies.map(c => (
                          <React.Fragment key={c.id}>
                            <th style={{ border: '1px solid var(--border)', padding: '0.4rem', fontSize: '0.75rem', position: 'relative', userSelect: 'none' }}>
                              Plan
                              <div className={`resize-handle ${resizingCol === `plan_${c.id}` ? 'resizing' : ''}`} onMouseDown={(e) => handleCompResizeStart(e, `plan_${c.id}`, 95)} />
                            </th>
                            <th style={{ border: '1px solid var(--border)', padding: '0.4rem', fontSize: '0.75rem', position: 'relative', userSelect: 'none' }}>
                              Prima ($)
                              <div className={`resize-handle ${resizingCol === `prima_${c.id}` ? 'resizing' : ''}`} onMouseDown={(e) => handleCompResizeStart(e, `prima_${c.id}`, 95)} />
                            </th>
                            <th style={{ border: '1px solid var(--border)', padding: '0.4rem', fontSize: '0.75rem', position: 'relative', userSelect: 'none' }}>
                              Maternidad
                              <div className={`resize-handle ${resizingCol === `maternidad_${c.id}` ? 'resizing' : ''}`} onMouseDown={(e) => handleCompResizeStart(e, `maternidad_${c.id}`, 115)} />
                            </th>
                            <th style={{ border: '1px solid var(--border)', padding: '0.4rem', fontSize: '0.75rem', position: 'relative', userSelect: 'none' }}>
                              Asist. Intl / Funeral
                              <div className={`resize-handle ${resizingCol === `asist_fun_${c.id}` ? 'resizing' : ''}`} onMouseDown={(e) => handleCompResizeStart(e, `asist_fun_${c.id}`, 130)} />
                            </th>
                          </React.Fragment>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPivotRows.length === 0 ? (
                        <tr>
                          <td colSpan={visibleCompanies.length > 0 ? (2 + visibleCompanies.length * 4) : 2} className="text-center" style={{ padding: '2rem', color: 'var(--text-muted)' }}>
                            No hay tarifas que coincidan con los filtros aplicados.
                          </td>
                        </tr>
                      ) : (
                        filteredPivotRows.map((row, idx) => (
                          <tr key={`${row.edad_min}-${row.edad_max}-${row.suma_asegurada}`} style={{ background: idx % 2 === 0 ? 'transparent' : 'var(--secondary)' }}>
                            <td style={{ border: '1px solid var(--border)', padding: '0.4rem', textAlign: 'center', fontWeight: 600 }}>
                              {row.edad_min}-{row.edad_max}
                            </td>
                            <td style={{ border: '1px solid var(--border)', padding: '0.4rem', textAlign: 'center', fontWeight: 600 }}>
                              ${row.suma_asegurada.toLocaleString('en-US')}
                            </td>
                            {visibleCompanies.map(c => {
                              const cName = (c.nombre || '').toLowerCase().trim();
                              const cell = row.byCompany[c.id] || row.byCompany[String(c.id)] || (cName ? row.byCompany[cName] : null);
                              const isModified = cell && !!modifiedRows[cell.id];
                              if (!cell) {
                                return (
                                  <React.Fragment key={c.id}>
                                    <td style={{ border: '1px solid var(--border)', padding: '0.4rem', textAlign: 'center', color: 'var(--text-muted)' }}>—</td>
                                    <td style={{ border: '1px solid var(--border)', padding: '0.4rem', textAlign: 'center', color: 'var(--text-muted)' }}>—</td>
                                    <td style={{ border: '1px solid var(--border)', padding: '0.4rem', textAlign: 'center', color: 'var(--text-muted)' }}>—</td>
                                    <td style={{ border: '1px solid var(--border)', padding: '0.4rem', textAlign: 'center', color: 'var(--text-muted)' }}>—</td>
                                  </React.Fragment>
                                );
                              }
                              return (
                                <React.Fragment key={c.id}>
                                  <td style={{ border: '1px solid var(--border)', padding: '0.3rem', textAlign: 'center', fontSize: '0.8rem' }}>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', justifyContent: 'center' }}>
                                      <span style={{ fontWeight: 600 }}>{cell.plan || 'N/A'}</span>
                                      <button
                                        type="button"
                                        onClick={() => handleOpenEditTariffModal(cell)}
                                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.8rem', padding: '0.1rem', opacity: 0.8 }}
                                        title="Editar esta tarifa individual en el modal guiado"
                                      >
                                        ✏️
                                      </button>
                                    </div>
                                  </td>
                                  <td style={{ border: '1px solid var(--border)', padding: '0.2rem', background: isModified ? '#fffaf0' : 'transparent' }}>
                                    <input
                                      type="number"
                                      value={cell.prima ?? ''}
                                      onChange={(e) => handleCellChange(cell.id, 'prima', e.target.value)}
                                      style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', textAlign: 'center', fontWeight: 'bold', color: 'var(--accent)', padding: '0.2rem' }}
                                    />
                                  </td>
                                  <td style={{ border: '1px solid var(--border)', padding: '0.3rem', textAlign: 'center', fontSize: '0.75rem' }}>
                                    {cell.maternidad_suma ? `${cell.maternidad_suma}${cell.maternidad_costo ? ` (+${cell.maternidad_costo})` : ''}` : <span style={{ color: 'var(--text-muted)' }}>No incluida</span>}
                                  </td>
                                  <td style={{ border: '1px solid var(--border)', padding: '0.3rem', textAlign: 'center', fontSize: '0.75rem' }}>
                                    {cell.asist_intl_suma || <span style={{ color: 'var(--text-muted)' }}>—</span>} / {cell.funeral_suma || <span style={{ color: 'var(--text-muted)' }}>—</span>}
                                  </td>
                                </React.Fragment>
                              );
                            })}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                /* --- VISTA EDITOR PLANILLA (ESTILO EXCEL CON COLUMNAS AJUSTABLES) --- */
                <div className="table-container" style={{ maxHeight: '600px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
                  <table className="excel-table">
                    <colgroup>
                      <col style={{ width: `${detailedColWidths.compania_id}px` }} />
                      <col style={{ width: `${detailedColWidths.plan}px` }} />
                      <col style={{ width: `${detailedColWidths.ramo}px` }} />
                      <col style={{ width: `${detailedColWidths.pago_contado}px` }} />
                      <col style={{ width: `${detailedColWidths.pago_semestral}px` }} />
                      <col style={{ width: `${detailedColWidths.pago_cuatrimestral}px` }} />
                      <col style={{ width: `${detailedColWidths.pago_trimestral}px` }} />
                      <col style={{ width: `${detailedColWidths.pago_bimestral}px` }} />
                      <col style={{ width: `${detailedColWidths.pago_4_cuotas}px` }} />
                      <col style={{ width: `${detailedColWidths.pago_mensual}px` }} />
                      <col style={{ width: `${detailedColWidths.edad_min}px` }} />
                      <col style={{ width: `${detailedColWidths.edad_max}px` }} />
                      <col style={{ width: `${detailedColWidths.suma_asegurada}px` }} />
                      <col style={{ width: `${detailedColWidths.deducible}px` }} />
                      <col style={{ width: `${detailedColWidths.prima}px` }} />
                      <col style={{ width: `${detailedColWidths.rehabilitacion}px` }} />
                      <col style={{ width: `${detailedColWidths.atencion_medica_primaria}px` }} />
                      <col style={{ width: `${detailedColWidths.medicinas}px` }} />
                      <col style={{ width: `${detailedColWidths.consultas_medicas}px` }} />
                      <col style={{ width: `${detailedColWidths.protesis}px` }} />
                      <col style={{ width: `${detailedColWidths.muleta_silla_ruedas}px` }} />
                      <col style={{ width: `${detailedColWidths.examenes_lab_imagenologia}px` }} />
                      <col style={{ width: `${detailedColWidths.maternidad}px` }} />
                      <col style={{ width: `${detailedColWidths.oftalmologia}px` }} />
                      <col style={{ width: `${detailedColWidths.odontologia}px` }} />
                      <col style={{ width: `${detailedColWidths.muerte_accidental}px` }} />
                      <col style={{ width: `${detailedColWidths.muerte_accidental_suma}px` }} />
                      <col style={{ width: `${detailedColWidths.muerte_accidental_costo}px` }} />
                      <col style={{ width: `${detailedColWidths.invalidez_permanente}px` }} />
                      <col style={{ width: `${detailedColWidths.invalidez_permanente_suma}px` }} />
                      <col style={{ width: `${detailedColWidths.invalidez_permanente_costo}px` }} />
                      <col style={{ width: `${detailedColWidths.ambulancia}px` }} />
                      <col style={{ width: `${detailedColWidths.maternidad_suma}px` }} />
                      <col style={{ width: `${detailedColWidths.maternidad_costo}px` }} />
                      <col style={{ width: `${detailedColWidths.asist_intl_suma}px` }} />
                      <col style={{ width: `${detailedColWidths.asist_intl_costo}px` }} />
                      <col style={{ width: `${detailedColWidths.funeral_suma}px` }} />
                      <col style={{ width: `${detailedColWidths.funeral_costo}px` }} />
                      <col style={{ width: `${detailedColWidths.acciones}px` }} />
                    </colgroup>
                    <thead>
                      <tr style={{ background: 'var(--primary)' }}>
                        <th style={{ position: 'relative' }}>
                          Aseguradora
                          <div className={`resize-handle ${resizingCol === 'compania_id' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'compania_id')} />
                        </th>
                        <th style={{ position: 'relative' }}>
                          Plan
                          <div className={`resize-handle ${resizingCol === 'plan' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'plan')} />
                        </th>
                        <th style={{ position: 'relative' }}>
                          Ramo / Tipo
                          <div className={`resize-handle ${resizingCol === 'ramo' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'ramo')} />
                        </th>
                        <th style={{ textAlign: 'center', position: 'relative' }}>
                          Contado
                          <div className={`resize-handle ${resizingCol === 'pago_contado' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'pago_contado')} />
                        </th>
                        <th style={{ textAlign: 'center', position: 'relative' }}>
                          Semestral
                          <div className={`resize-handle ${resizingCol === 'pago_semestral' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'pago_semestral')} />
                        </th>
                        <th style={{ textAlign: 'center', position: 'relative' }}>
                          Cuatrimestral
                          <div className={`resize-handle ${resizingCol === 'pago_cuatrimestral' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'pago_cuatrimestral')} />
                        </th>
                        <th style={{ textAlign: 'center', position: 'relative' }}>
                          Trimestral
                          <div className={`resize-handle ${resizingCol === 'pago_trimestral' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'pago_trimestral')} />
                        </th>
                        <th style={{ textAlign: 'center', position: 'relative' }}>
                          Bimestral
                          <div className={`resize-handle ${resizingCol === 'pago_bimestral' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'pago_bimestral')} />
                        </th>
                        <th style={{ textAlign: 'center', position: 'relative' }}>
                          4 Cuotas Mens. Consecutivas
                          <div className={`resize-handle ${resizingCol === 'pago_4_cuotas' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'pago_4_cuotas')} />
                        </th>
                        <th style={{ textAlign: 'center', position: 'relative' }}>
                          Mensual
                          <div className={`resize-handle ${resizingCol === 'pago_mensual' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'pago_mensual')} />
                        </th>
                        <th style={{ position: 'relative' }}>
                          Edad Mín
                          <div className={`resize-handle ${resizingCol === 'edad_min' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'edad_min')} />
                        </th>
                        <th style={{ position: 'relative' }}>
                          Edad Máx
                          <div className={`resize-handle ${resizingCol === 'edad_max' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'edad_max')} />
                        </th>
                        <th style={{ position: 'relative' }}>
                          Suma Asegurada
                          <div className={`resize-handle ${resizingCol === 'suma_asegurada' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'suma_asegurada')} />
                        </th>
                        <th style={{ position: 'relative' }}>
                          Deducible ($)
                          <div className={`resize-handle ${resizingCol === 'deducible' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'deducible')} />
                        </th>
                        <th style={{ position: 'relative' }}>
                          Prima ($)
                          <div className={`resize-handle ${resizingCol === 'prima' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'prima')} />
                        </th>
                        <th style={{ textAlign: 'center', position: 'relative' }}>
                          Rehabilitación
                          <div className={`resize-handle ${resizingCol === 'rehabilitacion' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'rehabilitacion')} />
                        </th>
                        <th style={{ textAlign: 'center', position: 'relative' }}>
                          Atención Médica Primaria
                          <div className={`resize-handle ${resizingCol === 'atencion_medica_primaria' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'atencion_medica_primaria')} />
                        </th>
                        <th style={{ textAlign: 'center', position: 'relative' }}>
                          Medicamentos prescritos
                          <div className={`resize-handle ${resizingCol === 'medicinas' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'medicinas')} />
                        </th>
                        <th style={{ textAlign: 'center', position: 'relative' }}>
                          Consultas Médicas
                          <div className={`resize-handle ${resizingCol === 'consultas_medicas' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'consultas_medicas')} />
                        </th>
                        <th style={{ textAlign: 'center', position: 'relative' }}>
                          Prótesis
                          <div className={`resize-handle ${resizingCol === 'protesis' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'protesis')} />
                        </th>
                        <th style={{ textAlign: 'center', position: 'relative' }}>
                          Muleta + Silla de ruedas
                          <div className={`resize-handle ${resizingCol === 'muleta_silla_ruedas' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'muleta_silla_ruedas')} />
                        </th>
                        <th style={{ textAlign: 'center', position: 'relative' }}>
                          Exámenes
                          <div className={`resize-handle ${resizingCol === 'examenes_lab_imagenologia' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'examenes_lab_imagenologia')} />
                        </th>
                        <th style={{ textAlign: 'center', position: 'relative' }}>
                          Maternidad
                          <div className={`resize-handle ${resizingCol === 'maternidad' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'maternidad')} />
                        </th>
                        <th style={{ textAlign: 'center', position: 'relative' }}>
                          Oftalmología
                          <div className={`resize-handle ${resizingCol === 'oftalmologia' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'oftalmologia')} />
                        </th>
                        <th style={{ textAlign: 'center', position: 'relative' }}>
                          Odontología
                          <div className={`resize-handle ${resizingCol === 'odontologia' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'odontologia')} />
                        </th>
                        <th style={{ textAlign: 'center', position: 'relative' }}>
                          Muerte Accidental
                          <div className={`resize-handle ${resizingCol === 'muerte_accidental' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'muerte_accidental')} />
                        </th>
                        <th style={{ position: 'relative' }}>
                          Muerte Acc. Suma ($)
                          <div className={`resize-handle ${resizingCol === 'muerte_accidental_suma' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'muerte_accidental_suma')} />
                        </th>
                        <th style={{ position: 'relative' }}>
                          Muerte Acc. Costo ($)
                          <div className={`resize-handle ${resizingCol === 'muerte_accidental_costo' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'muerte_accidental_costo')} />
                        </th>
                        <th style={{ textAlign: 'center', position: 'relative' }}>
                          Invalidez Perm.
                          <div className={`resize-handle ${resizingCol === 'invalidez_permanente' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'invalidez_permanente')} />
                        </th>
                        <th style={{ position: 'relative' }}>
                          Invalidez Suma ($)
                          <div className={`resize-handle ${resizingCol === 'invalidez_permanente_suma' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'invalidez_permanente_suma')} />
                        </th>
                        <th style={{ position: 'relative' }}>
                          Invalidez Costo ($)
                          <div className={`resize-handle ${resizingCol === 'invalidez_permanente_costo' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'invalidez_permanente_costo')} />
                        </th>
                        <th style={{ textAlign: 'center', position: 'relative' }}>
                          Ambulancia
                          <div className={`resize-handle ${resizingCol === 'ambulancia' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'ambulancia')} />
                        </th>
                        <th style={{ position: 'relative' }}>
                          Maternidad Suma
                          <div className={`resize-handle ${resizingCol === 'maternidad_suma' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'maternidad_suma')} />
                        </th>
                        <th style={{ position: 'relative' }}>
                          Maternidad Costo
                          <div className={`resize-handle ${resizingCol === 'maternidad_costo' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'maternidad_costo')} />
                        </th>
                        <th style={{ position: 'relative' }}>
                          Asist. viajes Suma
                          <div className={`resize-handle ${resizingCol === 'asist_intl_suma' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'asist_intl_suma')} />
                        </th>
                        <th style={{ position: 'relative' }}>
                          Asist. viajes Costo
                          <div className={`resize-handle ${resizingCol === 'asist_intl_costo' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'asist_intl_costo')} />
                        </th>
                        <th style={{ position: 'relative' }}>
                          gastos funerarios
                          <div className={`resize-handle ${resizingCol === 'funeral_suma' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'funeral_suma')} />
                        </th>
                        <th style={{ position: 'relative' }}>
                          Funerario Costo
                          <div className={`resize-handle ${resizingCol === 'funeral_costo' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'funeral_costo')} />
                        </th>
                        <th style={{ position: 'relative' }}>
                          Acciones
                          <div className={`resize-handle ${resizingCol === 'acciones' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'acciones')} />
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTariffs.length === 0 ? (
                        <tr>
                          <td colSpan="40" className="text-center" style={{ padding: '2rem', color: 'var(--text-muted)' }}>
                            No hay tarifas registradas en la planilla.
                          </td>
                        </tr>
                      ) : (
                        filteredTariffs.map((t) => {
                          const isModified = !!modifiedRows[t.id];
                          const isNew = String(t.id).startsWith('new-');
                          const textInput = (field) => (
                            <input
                              type="text"
                              value={t[field] ?? ''}
                              onChange={(e) => handleCellChange(t.id, field, e.target.value)}
                              className="excel-input"
                            />
                          );

                          return (
                            <tr key={t.id} style={{ background: isNew ? '#f0fff4' : isModified ? '#fffaf0' : 'transparent' }}>
                              {/* Aseguradora select */}
                              <td>
                                <select
                                  value={t.compania_id || ''}
                                  onChange={(e) => handleCellChange(t.id, 'compania_id', e.target.value)}
                                  className="excel-input"
                                  style={{ fontWeight: 'bold' }}
                                >
                                  {companies.map(c => (
                                    <option key={c.id} value={c.id}>{c.nombre}</option>
                                  ))}
                                </select>
                              </td>

                              <td>{textInput('plan')}</td>
                              <td>
                                <select
                                  value={t.ramo || 'Salud'}
                                  onChange={(e) => handleCellChange(t.id, 'ramo', e.target.value)}
                                  className="excel-input"
                                >
                                  <option value="Salud">Salud</option>
                                  <option value="Patrimoniales">Patrimoniales</option>
                                  <option value="Visa">Visa</option>
                                </select>
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={!!t.pago_contado}
                                  onChange={(e) => handleCellChange(t.id, 'pago_contado', e.target.checked)}
                                  style={{ cursor: 'pointer' }}
                                  title="Contado"
                                />
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={!!t.pago_semestral}
                                  onChange={(e) => handleCellChange(t.id, 'pago_semestral', e.target.checked)}
                                  style={{ cursor: 'pointer' }}
                                  title="Semestral"
                                />
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={!!t.pago_cuatrimestral}
                                  onChange={(e) => handleCellChange(t.id, 'pago_cuatrimestral', e.target.checked)}
                                  style={{ cursor: 'pointer' }}
                                  title="Cuatrimestral"
                                />
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={!!t.pago_trimestral}
                                  onChange={(e) => handleCellChange(t.id, 'pago_trimestral', e.target.checked)}
                                  style={{ cursor: 'pointer' }}
                                  title="Trimestral"
                                />
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={!!t.pago_bimestral}
                                  onChange={(e) => handleCellChange(t.id, 'pago_bimestral', e.target.checked)}
                                  style={{ cursor: 'pointer' }}
                                  title="Bimestral"
                                />
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={!!t.pago_4_cuotas}
                                  onChange={(e) => handleCellChange(t.id, 'pago_4_cuotas', e.target.checked)}
                                  style={{ cursor: 'pointer' }}
                                  title="4 Cuotas Consecutivas"
                                />
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={!!t.pago_mensual}
                                  onChange={(e) => handleCellChange(t.id, 'pago_mensual', e.target.checked)}
                                  style={{ cursor: 'pointer' }}
                                  title="Mensual"
                                />
                              </td>

                              {/* Edad Mín */}
                              <td>
                                <input
                                  type="number"
                                  value={t.edad_min ?? ''}
                                  onChange={(e) => handleCellChange(t.id, 'edad_min', e.target.value)}
                                  className="excel-input"
                                  style={{ textAlign: 'center' }}
                                />
                              </td>

                              {/* Edad Máx */}
                              <td>
                                <input
                                  type="number"
                                  value={t.edad_max ?? ''}
                                  onChange={(e) => handleCellChange(t.id, 'edad_max', e.target.value)}
                                  className="excel-input"
                                  style={{ textAlign: 'center' }}
                                />
                              </td>

                              {/* Suma Asegurada Select */}
                              <td>
                                <select
                                  value={t.suma_asegurada ?? ''}
                                  onChange={(e) => handleCellChange(t.id, 'suma_asegurada', e.target.value)}
                                  className="excel-input"
                                  style={{ fontWeight: 600 }}
                                >
                                  {SUMA_ASEGURADA_OPTIONS.map(s => (
                                    <option key={s} value={s}>${s.toLocaleString('en-US')}</option>
                                  ))}
                                </select>
                              </td>

                              {/* Deducible */}
                              <td>
                                <input
                                  type="number"
                                  value={t.deducible ?? 0}
                                  onChange={(e) => handleCellChange(t.id, 'deducible', e.target.value)}
                                  className="excel-input"
                                  placeholder="0"
                                  style={{ textAlign: 'right', fontWeight: 600, color: (parseFloat(t.deducible) > 0) ? '#b45309' : '#15803d' }}
                                />
                              </td>

                              {/* Prima */}
                              <td>
                                <input
                                  type="number"
                                  value={t.prima ?? ''}
                                  onChange={(e) => handleCellChange(t.id, 'prima', e.target.value)}
                                  className="excel-input"
                                  style={{ fontWeight: 'bold', color: 'var(--accent)' }}
                                />
                              </td>

                              {/* Rehabilitación */}
                              <td style={{ textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={!!(t.rehabilitacion === true || t.rehabilitacion === 'true' || t.rehabilitacion === 'INCL')}
                                  onChange={(e) => handleBenefitChange(t.id, { rehabilitacion: e.target.checked }, 'Rehabilitación')}
                                  style={{ cursor: 'pointer' }}
                                  title="Rehabilitación"
                                />
                              </td>

                              {/* Atención Médica Primaria */}
                              <td style={{ textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={!!(t.atencion_medica_primaria === true || t.atencion_medica_primaria === 'true' || t.atencion_medica_primaria === 'INCL' || t.at_situ_medicamentos === 'INCL')}
                                  onChange={(e) => handleBenefitChange(t.id, {
                                    atencion_medica_primaria: e.target.checked,
                                    at_situ_medicamentos: e.target.checked ? 'INCL' : ''
                                  }, 'Atención Médica Primaria')}
                                  style={{ cursor: 'pointer' }}
                                  title="Atención Médica Primaria"
                                />
                              </td>

                              {/* Medicamentos prescritos */}
                              <td style={{ textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={!!(t.medicinas === true || t.medicinas === 'true' || t.medicinas === 'INCL')}
                                  onChange={(e) => handleBenefitChange(t.id, { medicinas: e.target.checked }, 'Medicamentos prescritos')}
                                  style={{ cursor: 'pointer' }}
                                  title="Medicamentos prescritos"
                                />
                              </td>

                              {/* Cons Médicas */}
                              <td style={{ textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={!!(t.consultas_medicas === true || t.consultas_medicas === 'true' || t.consultas_medicas === 'INCL' || (typeof t.consultas_medicas === 'string' && t.consultas_medicas.length > 0 && t.consultas_medicas !== 'NO' && t.consultas_medicas !== 'false'))}
                                  onChange={(e) => handleBenefitChange(t.id, { consultas_medicas: e.target.checked }, 'Consultas Médicas')}
                                  style={{ cursor: 'pointer' }}
                                  title="Consultas Médicas"
                                />
                              </td>

                              {/* Prótesis */}
                              <td style={{ textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={!!(t.protesis === true || t.protesis === 'true' || t.protesis === 'INCL')}
                                  onChange={(e) => handleBenefitChange(t.id, { protesis: e.target.checked }, 'Prótesis')}
                                  style={{ cursor: 'pointer' }}
                                  title="Prótesis"
                                />
                              </td>

                              {/* Muleta + Silla de ruedas */}
                              <td style={{ textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={!!(t.muleta_silla_ruedas === true || t.muleta_silla_ruedas === 'true' || t.muleta_silla_ruedas === 'INCL')}
                                  onChange={(e) => handleBenefitChange(t.id, { muleta_silla_ruedas: e.target.checked }, 'Muleta + Silla de ruedas')}
                                  style={{ cursor: 'pointer' }}
                                  title="Muleta + Silla de ruedas"
                                />
                              </td>

                              {/* Exámenes */}
                              <td style={{ textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={!!(t.examenes_lab_imagenologia === true || t.examenes_lab_imagenologia === 'true' || t.examenes_lab_imagenologia === 'INCL' || (typeof t.examenes_lab_imagenologia === 'string' && t.examenes_lab_imagenologia.length > 0 && t.examenes_lab_imagenologia !== 'NO' && t.examenes_lab_imagenologia !== 'false'))}
                                  onChange={(e) => handleBenefitChange(t.id, { examenes_lab_imagenologia: e.target.checked ? 'INCL' : '' }, 'Exámenes')}
                                  style={{ cursor: 'pointer' }}
                                  title="Exámenes"
                                />
                              </td>

                              {/* Maternidad */}
                              <td style={{ textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={!!(t.maternidad === true || t.maternidad === 'true' || t.maternidad === 'INCL')}
                                  onChange={(e) => handleBenefitChange(t.id, { maternidad: e.target.checked }, 'Maternidad')}
                                  style={{ cursor: 'pointer' }}
                                  title="Maternidad"
                                />
                              </td>

                              {/* Oftalmología */}
                              <td style={{ textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={!!(t.oftalmologia === true || t.oftalmologia === 'true' || t.oftalmologia === 'INCL')}
                                  onChange={(e) => handleBenefitChange(t.id, { oftalmologia: e.target.checked }, 'Oftalmología')}
                                  style={{ cursor: 'pointer' }}
                                  title="Oftalmología"
                                />
                              </td>

                              {/* Odontología */}
                              <td style={{ textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={!!(t.odontologia === true || t.odontologia === 'true' || t.odontologia === 'INCL')}
                                  onChange={(e) => handleBenefitChange(t.id, { odontologia: e.target.checked }, 'Odontología')}
                                  style={{ cursor: 'pointer' }}
                                  title="Odontología"
                                />
                              </td>

                              {/* Muerte Accidental */}
                              <td style={{ textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={!!(t.muerte_accidental === true || t.muerte_accidental === 'true' || t.muerte_accidental === 'INCL')}
                                  onChange={(e) => handleBenefitChange(t.id, { muerte_accidental: e.target.checked }, 'Muerte Accidental')}
                                  style={{ cursor: 'pointer' }}
                                  title="Muerte Accidental"
                                />
                              </td>
                              <td>{textInput('muerte_accidental_suma')}</td>
                              <td>{textInput('muerte_accidental_costo')}</td>

                              {/* Invalidez Permanente */}
                              <td style={{ textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={!!(t.invalidez_permanente === true || t.invalidez_permanente === 'true' || t.invalidez_permanente === 'INCL')}
                                  onChange={(e) => handleBenefitChange(t.id, { invalidez_permanente: e.target.checked }, 'Invalidez Permanente')}
                                  style={{ cursor: 'pointer' }}
                                  title="Invalidez Permanente"
                                />
                              </td>
                              <td>{textInput('invalidez_permanente_suma')}</td>
                              <td>{textInput('invalidez_permanente_costo')}</td>

                              {/* Ambulancia */}
                              <td style={{ textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={!!(t.ambulancia === true || t.ambulancia === 'true' || t.ambulancia === 'INCL' || (typeof t.ambulancia === 'string' && t.ambulancia.length > 0 && t.ambulancia !== 'NO' && t.ambulancia !== 'false'))}
                                  onChange={(e) => handleBenefitChange(t.id, { ambulancia: e.target.checked ? 'INCL' : '' }, 'Ambulancia')}
                                  style={{ cursor: 'pointer' }}
                                  title="Ambulancia"
                                />
                              </td>

                              <td>{textInput('maternidad_suma')}</td>
                              <td>{textInput('maternidad_costo')}</td>
                              <td>{textInput('asist_intl_suma')}</td>
                              <td>{textInput('asist_intl_costo')}</td>
                              <td>{textInput('funeral_suma')}</td>
                              <td>{textInput('funeral_costo')}</td>

                              {/* Acciones */}
                              <td style={{ textAlign: 'center', padding: '0.2rem' }}>
                                <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'center', alignItems: 'center' }}>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditTariffModal(t)}
                                    className="btn btn-secondary"
                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', cursor: 'pointer', whiteSpace: 'nowrap' }}
                                    title="Editar esta tarifa individual en el modal guiado"
                                  >
                                    ✏️ Editar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteTariff(t.id)}
                                    className="btn"
                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#fee2e2', color: '#ef4444', border: '1px solid #fecaca', cursor: 'pointer' }}
                                    disabled={loading}
                                    title="Eliminar tarifa"
                                  >
                                    🗑️
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
              )}

              {/* Barra Flotante de Guardado en Lote */}
              {Object.keys(modifiedRows).length > 0 && (
                <div className="floating-save-bar">
                  <span style={{ fontSize: '0.9rem', color: 'var(--text)' }}>
                    ⚠️ Tienes <strong>{Object.keys(modifiedRows).length}</strong> filas modificadas sin guardar.
                  </span>
                  <button
                    onClick={handleSaveAllTariffs}
                    className="btn btn-primary"
                    style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                    disabled={loading}
                  >
                    💾 Guardar Cambios
                  </button>
                  <button
                    onClick={handleDiscardChanges}
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

          {/* --- TRAZABILIDAD (LOGS) --- */}
          {activeTab === 'trazabilidad' && (
            <div className="card">
              <h3 className="card-title" style={{ marginBottom: '1.5rem' }}>Auditoría de Actividades del Sistema</h3>
              <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                Historial cronológico de acciones ejecutadas en el sistema para control y trazabilidad administrativa.
              </p>
              <div style={{ marginBottom: '1.2rem' }}>
                <input
                  type="text"
                  placeholder="🔍 Buscar en logs por usuario, acción o descripción..."
                  className="form-input"
                  style={{ maxWidth: '350px', padding: '0.5rem 1rem', margin: 0 }}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              
              <div style={{ maxHeight: '500px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '6px' }}>
                {filteredLogs.length === 0 ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No hay logs que coincidan con la búsqueda.</div>
                ) : (
                  <div style={{ padding: '0.5rem' }}>
                    {filteredLogs
                      .slice((pageLogs - 1) * pageSizeLogs, pageLogs * pageSizeLogs)
                      .map((log) => (
                      <div 
                        key={log.id} 
                        style={{ 
                          padding: '1rem', 
                          borderBottom: '1px solid var(--border)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.25rem',
                          fontSize: '0.9rem'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span className="badge badge-vigente" style={{ 
                            fontSize: '0.75rem', 
                            background: log.accion === 'REGISTRO' ? 'var(--secondary)' : log.accion.startsWith('PAGO') ? '#e0f2fe' : '#fee2e2',
                            color: log.accion === 'REGISTRO' ? 'var(--primary)' : log.accion.startsWith('PAGO') ? '#0369a1' : '#b91c1c'
                          }}>
                            {log.accion}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {new Date(log.created_at).toLocaleString('es-VE')}
                          </span>
                        </div>
                        <div style={{ marginTop: '0.25rem' }}>
                          <strong>Usuario:</strong> {log.correo_usuario || 'sistema'}
                        </div>
                        <div style={{ color: 'var(--text-muted)' }}>
                          {log.descripcion}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <PaginationControls
                currentPage={pageLogs}
                totalItems={filteredLogs.length}
                pageSize={pageSizeLogs}
                onPageChange={setPageLogs}
                onPageSizeChange={setPageSizeLogs}
              />
            </div>
          )}

          {/* --- CAPACITACIÓN / E-LEARNING (ADMIN) --- */}
          {activeTab === 'elearning' && (
            <div>
              {/* TOP HEADER */}
              <div style={{
                background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)',
                color: '#ffffff',
                padding: '2rem',
                borderRadius: '12px',
                marginBottom: '2rem',
                boxShadow: '0 4px 20px rgba(30, 58, 138, 0.15)'
              }}>
                <h2 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.25rem' }}>🎓 Aula Virtual - Panel de Administración</h2>
                <p style={{ fontSize: '0.95rem', opacity: 0.9, margin: 0 }}>
                  Gestiona los cursos autoevaluados del sistema y mantén un control detallado sobre el desempeño y progreso de tus asesores.
                </p>
              </div>

              {/* SUB-TABS NAVIGATION */}
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
                <button 
                  onClick={() => setAdminSubTab('reportes')} 
                  className={`btn ${adminSubTab === 'reportes' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ border: 'none', padding: '0.6rem 1.25rem' }}
                >
                  📈 Calificaciones y Rendimiento
                </button>
                <button 
                  onClick={() => setAdminSubTab('editor')} 
                  className={`btn ${adminSubTab === 'editor' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ border: 'none', padding: '0.6rem 1.25rem' }}
                >
                  🛠 Editor de Cursos y Módulos
                </button>
              </div>

              {elearningLoading && <div style={{ padding: '2rem', textAlign: 'center' }}>Procesando cambios...</div>}

              {/* SUB-TAB: REPORTES */}
              {adminSubTab === 'reportes' && !elearningLoading && (
                <div className="card" style={{ padding: '2rem' }}>
                  <h3 className="card-title" style={{ marginBottom: '1.25rem' }}>Reporte General de Capacitación de Asesores</h3>
                  <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', fontSize: '0.9rem' }}>
                    A continuación, se listan los intentos realizados por los asesores en el sistema. Puedes ver qué módulos aprobaron, cuáles fallaron, y entrar a ver el detalle de qué preguntas contestaron incorrectamente.
                  </p>

                  <div className="table-container">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Asesor</th>
                          <th>Curso</th>
                          <th>Módulo</th>
                          <th>Puntaje</th>
                          <th>Porcentaje</th>
                          <th>Estatus</th>
                          <th>Fecha</th>
                          <th>Detalle</th>
                        </tr>
                      </thead>
                      <tbody>
                        {attempts.length === 0 ? (
                          <tr><td colSpan="8" className="text-center" style={{ padding: '2rem' }}>Aún no se registran intentos de evaluación en el sistema.</td></tr>
                        ) : (
                          attempts
                            .slice((pageAttempts - 1) * pageSizeAttempts, pageAttempts * pageSizeAttempts)
                            .map((att) => (
                            <tr key={att.id}>
                              <td>
                                <strong>{att.nombre}</strong>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{att.correo} | {att.rango.toUpperCase()}</div>
                              </td>
                              <td>{att.curso_titulo}</td>
                              <td><strong>{att.modulo_titulo}</strong></td>
                              <td>{att.puntaje} / {att.total_preguntas}</td>
                              <td>{Math.round((att.puntaje / att.total_preguntas) * 100)}%</td>
                              <td>
                                <span style={{
                                  padding: '0.2rem 0.5rem',
                                  borderRadius: '4px',
                                  fontWeight: 'bold',
                                  fontSize: '0.75rem',
                                  backgroundColor: att.aprobado ? '#e6fffa' : '#fff5f5',
                                  color: att.aprobado ? '#047487' : '#e53e3e'
                                }}>
                                  {att.aprobado ? 'APROBADO' : 'REPROBADO'}
                                </span>
                              </td>
                              <td style={{ fontSize: '0.85rem' }}>
                                {new Date(att.created_at).toLocaleDateString('es-VE')} {new Date(att.created_at).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td>
                                <button 
                                  onClick={() => setShowProgressDetail(att)} 
                                  className="btn btn-secondary" 
                                  style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', border: 'none' }}
                                >
                                  🔍 Ver Respuestas
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  <PaginationControls
                    currentPage={pageAttempts}
                    totalItems={attempts.length}
                    pageSize={pageSizeAttempts}
                    onPageChange={setPageAttempts}
                    onPageSizeChange={setPageSizeAttempts}
                  />
                </div>
              )}

              {/* SUB-TAB: EDITOR */}
              {adminSubTab === 'editor' && !elearningLoading && (
                <div>
                  {isEditingCourse ? (
                    /* COURSE FORM */
                    <div className="card" style={{ padding: '2rem', maxWidth: '600px' }}>
                      <h3 className="card-title" style={{ marginBottom: '1.5rem' }}>
                        {isEditingCourse === 'edit' ? 'Editar Curso' : 'Crear Nuevo Curso'}
                      </h3>
                      <form onSubmit={handleSaveCourse}>
                        <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                          <label className="form-label">Título del Curso *</label>
                          <input 
                            type="text" 
                            className="form-input" 
                            value={courseForm.titulo}
                            onChange={(e) => setCourseForm({ ...courseForm, titulo: e.target.value })}
                            required
                          />
                        </div>
                        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                          <label className="form-label">Descripción</label>
                          <textarea 
                            className="form-input" 
                            rows="3"
                            value={courseForm.descripcion}
                            onChange={(e) => setCourseForm({ ...courseForm, descripcion: e.target.value })}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                          <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Guardar Curso</button>
                          <button 
                            type="button" 
                            onClick={() => { setIsEditingCourse(null); setCourseForm({ titulo: '', descripcion: '' }); }} 
                            className="btn btn-secondary"
                            style={{ flex: 1 }}
                          >
                            Cancelar
                          </button>
                        </div>
                      </form>
                    </div>
                  ) : isEditingModule ? (
                    /* MODULE FORM */
                    <div className="card" style={{ padding: '2rem' }}>
                      <h3 className="card-title" style={{ marginBottom: '1.5rem' }}>
                        {isEditingModule === 'edit' ? 'Editar Módulo' : `Añadir Módulo a: ${selectedCourse?.titulo}`}
                      </h3>
                      <form onSubmit={handleSaveModule}>
                        <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                          <div className="form-group">
                            <label className="form-label">Título del Módulo *</label>
                            <input 
                              type="text" 
                              className="form-input" 
                              value={moduleForm.titulo}
                              onChange={(e) => setModuleForm({ ...moduleForm, titulo: e.target.value })}
                              required
                            />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Orden (Ej: 1, 2) *</label>
                            <input 
                              type="number" 
                              className="form-input" 
                              value={moduleForm.orden}
                              onChange={(e) => setModuleForm({ ...moduleForm, orden: e.target.value })}
                              required
                            />
                          </div>
                        </div>

                        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                          <label className="form-label">Contenido de Estudio (Teoría) *</label>
                          <textarea 
                            className="form-input" 
                            rows="10"
                            placeholder="Escribe el material de estudio para este módulo..."
                            value={moduleForm.contenido}
                            onChange={(e) => setModuleForm({ ...moduleForm, contenido: e.target.value })}
                            required
                          />
                        </div>

                        {/* QUIZ QUESTIONS CREATION */}
                        <div style={{ marginBottom: '2rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
                            <h4 style={{ fontSize: '1.05rem', fontWeight: 'bold', margin: 0 }}>Preguntas del Quiz</h4>
                            <button 
                              type="button" 
                              onClick={() => {
                                setModuleForm(prev => ({
                                  ...prev,
                                  quiz_preguntas: [
                                    ...prev.quiz_preguntas,
                                    { pregunta: '', opciones: ['', ''], correcta: 0 }
                                  ]
                                }));
                              }}
                              className="btn btn-secondary" 
                              style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                            >
                              + Agregar Pregunta
                            </button>
                          </div>

                          {moduleForm.quiz_preguntas.length === 0 && (
                            <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.85rem' }}>No has agregado preguntas a este quiz.</p>
                          )}

                          {moduleForm.quiz_preguntas.map((q, qIdx) => (
                            <div key={qIdx} style={{ background: 'var(--surface-muted)', padding: '1.25rem', borderRadius: '8px', marginBottom: '1.25rem', border: '1px solid var(--border)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>Pregunta #{qIdx + 1}</span>
                                <button 
                                  type="button" 
                                  onClick={() => {
                                    setModuleForm(prev => {
                                      const copy = [...prev.quiz_preguntas];
                                      copy.splice(qIdx, 1);
                                      return { ...prev, quiz_preguntas: copy };
                                    });
                                  }}
                                  style={{ border: 'none', background: 'transparent', color: '#e53e3e', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 }}
                                >
                                  Eliminar Pregunta
                                </button>
                              </div>

                              <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                                <input 
                                  type="text" 
                                  className="form-input" 
                                  placeholder="Enunciado de la pregunta..."
                                  value={q.pregunta}
                                  onChange={(e) => {
                                    setModuleForm(prev => {
                                      const copy = [...prev.quiz_preguntas];
                                      copy[qIdx].pregunta = e.target.value;
                                      return { ...prev, quiz_preguntas: copy };
                                    });
                                  }}
                                  required
                                />
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                {q.opciones.map((op, oIdx) => (
                                  <input 
                                    key={oIdx}
                                    type="text" 
                                    className="form-input" 
                                    placeholder={`Opción ${oIdx + 1}...`}
                                    value={op}
                                    onChange={(e) => {
                                      setModuleForm(prev => {
                                        const copy = [...prev.quiz_preguntas];
                                        copy[qIdx].opciones[oIdx] = e.target.value;
                                        return { ...prev, quiz_preguntas: copy };
                                      });
                                    }}
                                    required
                                  />
                                ))}
                              </div>

                              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Opción Correcta:</label>
                                <select 
                                  className="form-input" 
                                  style={{ padding: '0.25rem', width: 'auto', margin: 0 }}
                                  value={q.correcta}
                                  onChange={(e) => {
                                    setModuleForm(prev => {
                                      const copy = [...prev.quiz_preguntas];
                                      copy[qIdx].correcta = parseInt(e.target.value);
                                      return { ...prev, quiz_preguntas: copy };
                                    });
                                  }}
                                >
                                  {q.opciones.map((_, oIdx) => (
                                    <option key={oIdx} value={oIdx}>Opción {oIdx + 1}</option>
                                  ))}
                                </select>
                                <button 
                                  type="button" 
                                  onClick={() => {
                                    setModuleForm(prev => {
                                      const copy = [...prev.quiz_preguntas];
                                      copy[qIdx].opciones.push('');
                                      return { ...prev, quiz_preguntas: copy };
                                    });
                                  }}
                                  style={{ border: 'none', background: 'transparent', color: 'var(--accent)', fontSize: '0.8rem', cursor: 'pointer' }}
                                >
                                  + Añadir Opción
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div style={{ display: 'flex', gap: '1rem' }}>
                          <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Guardar Módulo</button>
                          <button 
                            type="button" 
                            onClick={() => { setIsEditingModule(null); setModuleForm({ titulo: '', contenido: '', orden: 1, quiz_preguntas: [] }); setSelectedModule(null); }} 
                            className="btn btn-secondary"
                            style={{ flex: 1 }}
                          >
                            Cancelar
                          </button>
                        </div>
                      </form>
                    </div>
                  ) : (
                    /* COURSE LIST & MODULE MANAGEMENT */
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
                        <button 
                          onClick={() => { setIsEditingCourse('new'); setCourseForm({ titulo: '', descripcion: '' }); }} 
                          className="btn btn-primary"
                        >
                          + Crear Nuevo Curso
                        </button>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        {courses.map(course => (
                          <div key={course.id} className="card" style={{ padding: '2rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border)', paddingBottom: '1rem', marginBottom: '1rem' }}>
                              <div>
                                <h3 style={{ fontSize: '1.25rem', color: 'var(--primary)', fontWeight: 'bold', margin: 0 }}>
                                  {course.titulo}
                                </h3>
                                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>
                                  {course.descripcion}
                                </p>
                              </div>
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button 
                                  onClick={() => {
                                    setSelectedCourse(course);
                                    setCourseForm({ titulo: course.titulo, descripcion: course.descripcion });
                                    setIsEditingCourse('edit');
                                  }} 
                                  className="btn btn-secondary" 
                                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', border: 'none' }}
                                >
                                  Editar Curso
                                </button>
                                <button 
                                  onClick={() => handleDeleteCourse(course.id)} 
                                  className="btn btn-secondary" 
                                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', border: 'none', color: '#e53e3e' }}
                                >
                                  Eliminar
                                </button>
                              </div>
                            </div>

                            {/* MODULES LIST UNDER COURSE */}
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                <h4 style={{ fontSize: '0.95rem', fontWeight: 'bold', margin: 0 }}>Módulos del Curso:</h4>
                                <button 
                                  onClick={() => {
                                    setSelectedCourse(course);
                                    setModuleForm({ titulo: '', contenido: '', orden: (course.modulos?.length || 0) + 1, quiz_preguntas: [] });
                                    setIsEditingModule('new');
                                  }} 
                                  className="btn btn-secondary" 
                                  style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }}
                                >
                                  + Añadir Módulo
                                </button>
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {(!course.modulos || course.modulos.length === 0) ? (
                                  <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.85rem', margin: 0 }}>No hay módulos configurados en este curso.</p>
                                ) : (
                                  course.modulos.map(mod => (
                                    <div key={mod.id} style={{ 
                                      display: 'flex', 
                                      justifyContent: 'space-between', 
                                      alignItems: 'center', 
                                      padding: '0.75rem 1rem', 
                                      background: 'var(--surface-muted)',
                                      borderRadius: '6px',
                                      fontSize: '0.9rem'
                                    }}>
                                      <div>
                                        <span style={{ fontWeight: 600, color: 'var(--primary)', marginRight: '0.5rem' }}>Mod #{mod.orden}</span>
                                        <span style={{ fontWeight: 500 }}>{mod.titulo}</span>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '1rem' }}>
                                          ({mod.quiz_preguntas ? mod.quiz_preguntas.length : 0} preguntas)
                                        </span>
                                      </div>
                                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button 
                                          onClick={() => {
                                            setSelectedCourse(course);
                                            setSelectedModule(mod);
                                            setModuleForm({
                                              titulo: mod.titulo,
                                              contenido: mod.contenido,
                                              orden: mod.orden,
                                              quiz_preguntas: mod.quiz_preguntas || []
                                            });
                                            setIsEditingModule('edit');
                                          }} 
                                          className="btn btn-secondary" 
                                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', border: 'none' }}
                                        >
                                          Editar Módulo
                                        </button>
                                        <button 
                                          onClick={() => handleDeleteModule(mod.id)} 
                                          className="btn btn-secondary" 
                                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', border: 'none', color: '#e53e3e' }}
                                        >
                                          Eliminar
                                        </button>
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ATTEMPT ANSWERS DETAIL MODAL */}
              {showProgressDetail && (
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
                  <div className="card" style={{ maxWidth: '600px', width: '100%', maxHeight: '90vh', overflowY: 'auto', margin: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                      <div>
                        <h3 className="card-title" style={{ border: 'none', margin: 0 }}>Detalle de Evaluación</h3>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>Asesor: {showProgressDetail.nombre} ({showProgressDetail.correo})</p>
                      </div>
                      <button 
                        onClick={() => setShowProgressDetail(null)} 
                        style={{ border: 'none', background: 'transparent', fontSize: '1.5rem', cursor: 'pointer', fontWeight: 'bold' }}
                      >
                        ×
                      </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem', background: 'var(--surface-muted)', padding: '1rem', borderRadius: '8px' }}>
                      <div>
                        <strong>Curso:</strong> {showProgressDetail.curso_titulo}<br />
                        <strong>Módulo:</strong> {showProgressDetail.modulo_titulo}
                      </div>
                      <div>
                        <strong>Puntaje:</strong> {showProgressDetail.puntaje} / {showProgressDetail.total_preguntas} ({Math.round((showProgressDetail.puntaje / showProgressDetail.total_preguntas) * 100)}%)<br />
                        <strong>Estatus:</strong> <span style={{ fontWeight: 'bold', color: showProgressDetail.aprobado ? '#047487' : '#e53e3e' }}>
                          {showProgressDetail.aprobado ? 'APROBADO' : 'REPROBADO'}
                        </span>
                      </div>
                    </div>

                    <h4 style={{ fontWeight: 'bold', marginBottom: '1rem' }}>Revisión de Preguntas y Respuestas:</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                      {showProgressDetail.respuestas_usuario && showProgressDetail.respuestas_usuario.map((q, idx) => (
                        <div key={idx} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
                          <p style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                            {idx + 1}. {q.pregunta}
                          </p>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem' }}>
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
                                  {op} {isCorrect && '✓ (Correcta)'} {isSelected && !isCorrect && '✗ (Seleccionada)'}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    <button 
                      onClick={() => setShowProgressDetail(null)} 
                      className="btn btn-secondary" 
                      style={{ width: '100%' }}
                    >
                      Cerrar Detalle
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
