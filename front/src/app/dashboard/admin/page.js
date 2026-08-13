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

export default function AdminDashboard() {
  const { token, isLoggedIn, user, hydrated } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();

  // --- ESTADOS DE DATOS ---
  const [policies, setPolicies] = useState([]);
  const [payments, setPayments] = useState([]);
  const [users, setUsers] = useState([]);
  const [advisors, setAdvisors] = useState([]);
  const [clients, setClients] = useState([]);
  const [logs, setLogs] = useState([]);
  const [tariffs, setTariffs] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [modifiedRows, setModifiedRows] = useState({});
  const [modifiedPolicies, setModifiedPolicies] = useState({});
  
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
  
  // --- ESTADOS INTERNOS ---
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('resumen'); // 'resumen', 'polizas', 'pagos', 'roles', 'tarifas', 'trazabilidad'
  const [fileToUpload, setFileToUpload] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [tarifarioMeta, setTarifarioMeta] = useState(null);
  const [tariffView, setTariffView] = useState('comparativa'); // 'comparativa' o 'excel'
  const [resizingCol, setResizingCol] = useState(null);
  const [detailedColWidths, setDetailedColWidths] = useState({
    compania_id: 150,
    plan: 110,
    pago: 130,
    edad_min: 80,
    edad_max: 80,
    suma_asegurada: 120,
    prima: 95,
    maternidad_suma: 110,
    maternidad_costo: 110,
    asist_intl_suma: 110,
    asist_intl_costo: 110,
    funeral_suma: 110,
    funeral_costo: 110,
    at_situ_medicamentos: 120,
    consultas_medicas: 120,
    examenes_lab_imagenologia: 130,
    ambulancia: 110,
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

      // 4. Cargar asesores públicos (para reasignaciones)
      const resAdvs = await fetch(`${API_URL}/public/advisors`);
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
      setTariffs(Array.isArray(dataTariffs) ? dataTariffs : []);

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
          estado: policy.estado
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
      
      showToast('Estado de pago actualizado.');
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
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
          prima: parseFloat(tariff.prima),
          plan: tariff.plan || '',
          pago: tariff.pago || '',
          maternidad_suma: tariff.maternidad_suma || '',
          maternidad_costo: tariff.maternidad_costo || '',
          asist_intl_suma: tariff.asist_intl_suma || '',
          asist_intl_costo: tariff.asist_intl_costo || '',
          funeral_suma: tariff.funeral_suma || '',
          funeral_costo: tariff.funeral_costo || '',
          at_situ_medicamentos: tariff.at_situ_medicamentos || '',
          consultas_medicas: tariff.consultas_medicas || '',
          examenes_lab_imagenologia: tariff.examenes_lab_imagenologia || '',
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

  const handleAddTariffRow = () => {
    const tempId = `new-${Date.now()}`;
    const defaultCompanyId = companies[0]?.id || 1;
    const newRow = {
      id: tempId,
      compania_id: defaultCompanyId,
      plan: '',
      pago: '',
      edad_min: 30,
      edad_max: 39,
      suma_asegurada: 5000,
      prima: 200,
      maternidad_suma: '',
      maternidad_costo: '',
      asist_intl_suma: '',
      asist_intl_costo: '',
      funeral_suma: '',
      funeral_costo: '',
      at_situ_medicamentos: '',
      consultas_medicas: '',
      examenes_lab_imagenologia: '',
      ambulancia: ''
    };
    setTariffs(prev => [...prev, newRow]);
    setModifiedRows(prev => ({ ...prev, [tempId]: true }));
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
      loadData();
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
      if (!res.ok) throw new Error(data.error || 'Error al subir archivo');

      showToast(`¡Carga completada! Se procesaron ${data.count} tarifas.`);
      setFileToUpload(null);
      document.getElementById('file-upload-input').value = '';
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!hydrated || !isLoggedIn || user?.rango !== 'admin') return null;

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

  const filteredPayments = payments.filter(pa =>
    !searchQuery ||
    pa.poliza_codigo?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    pa.cliente_nombre?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    pa.compania_nombre?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    pa.referencia?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    pa.estado_pago?.toLowerCase().includes(searchQuery.toLowerCase())
  );

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

  const filteredTariffs = tariffs.filter(t => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const compName = companies.find(c => c.id === parseInt(t.compania_id))?.nombre || t.compania_nombre || '';
    return (
      compName.toLowerCase().includes(q) ||
      t.plan?.toLowerCase().includes(q) ||
      String(t.edad_min).includes(q) ||
      String(t.edad_max).includes(q) ||
      String(t.suma_asegurada).includes(q) ||
      String(t.prima).includes(q)
    );
  });

  // Sumas aseguradas disponibles (según la matriz del excel de tarifas)
  const SUMA_ASEGURADA_OPTIONS = [5000, 10000, 30000, 50000, 100000, 200000];

  // Matriz pivote: una fila por (rango de edad, suma asegurada), con la oferta más económica de cada aseguradora
  const pivotRows = (() => {
    const map = new Map();
    tariffs.forEach(t => {
      const key = `${t.edad_min}-${t.edad_max}|${t.suma_asegurada}`;
      if (!map.has(key)) {
        map.set(key, { edad_min: t.edad_min, edad_max: t.edad_max, suma_asegurada: parseFloat(t.suma_asegurada), byCompany: {} });
      }
      const row = map.get(key);
      const compId = parseInt(t.compania_id);
      const existing = row.byCompany[compId];
      if (!existing || parseFloat(t.prima) < parseFloat(existing.prima)) {
        row.byCompany[compId] = t;
      }
    });
    return [...map.values()].sort((a, b) => a.edad_min - b.edad_min || a.suma_asegurada - b.suma_asegurada);
  })();

  const filteredPivotRows = pivotRows.filter(row => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    if (`${row.edad_min}-${row.edad_max}`.includes(q) || String(row.suma_asegurada).includes(q)) return true;
    return companies.some(c => {
      const cell = row.byCompany[c.id];
      if (!cell) return false;
      return c.nombre.toLowerCase().includes(q) || cell.plan?.toLowerCase().includes(q) || String(cell.prima).includes(q);
    });
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h2 style={{ color: 'var(--primary)', fontWeight: 800 }}>Panel Administrativo Principal</h2>
          <p style={{ color: 'var(--text-muted)' }}>Métricas, pólizas, control de pagos y trazabilidad general</p>
        </div>
        <button onClick={loadData} className="btn btn-secondary" style={{ padding: '0.5rem 1rem' }} disabled={loading}>
          {loading ? 'Sincronizando...' : 'Actualizar Data ↻'}
        </button>
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
        {['resumen', 'polizas', 'pagos', 'roles', 'tarifas', 'trazabilidad', 'elearning'].map((tab) => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setSearchQuery(''); }}
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
            {tab === 'elearning' ? 'Capacitación' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>Cargando información...</div>
      ) : (
        <div>
          {/* --- RESUMEN DE CLIENTES --- */}
          {activeTab === 'resumen' && (
            <div className="card">
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
          )}

          {/* --- GESTIÓN DE CASOS (PÓLIZAS) --- */}
          {activeTab === 'polizas' && (
            <div className="card">
              <h3 className="card-title" style={{ marginBottom: '1.5rem' }}>Control de Solicitudes y Casos de Pólizas</h3>
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
                <table className="table" style={{ minWidth: '1250px' }}>
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Cliente</th>
                      <th>Aseguradora</th>
                      <th>Plan</th>
                      <th>Suma Asegurada ($)</th>
                      <th>Prima Anual ($)</th>
                      <th>Asesor Asignado</th>
                      <th>Estado</th>
                      <th>Motivo Rechazo</th>
                      <th style={{ textAlign: 'center', width: '130px' }}>Estado Edición</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPolicies.length === 0 ? (
                      <tr><td colSpan="10" className="text-center">No hay pólizas que coincidan con la búsqueda.</td></tr>
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
              <h3 className="card-title" style={{ marginBottom: '1.5rem' }}>Registro Global de Cobranzas</h3>
              <div style={{ marginBottom: '1.2rem' }}>
                <input
                  type="text"
                  placeholder="🔍 Buscar cobros por póliza, cliente, aseguradora, referencia o estado..."
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
                      <th>Aseguradora</th>
                      <th>Monto</th>
                      <th>Referencia</th>
                      <th>Vencimiento</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPayments.length === 0 ? (
                      <tr><td colSpan="7" className="text-center">No hay cobros que coincidan con la búsqueda.</td></tr>
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
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Sin Reportar</span>
                            )}
                          </td>
                          <td>{pa.fecha_vencimiento ? pa.fecha_vencimiento.split('T')[0] : 'N/A'}</td>
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
                      filteredUsers.map((u) => (
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
            </div>
          )}

          {/* --- CARGA Y EDICIÓN DE TARIFAS --- */}
          {activeTab === 'tarifas' && (
            <div className="card">
              <h3 className="card-title" style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', border: 'none' }}>
                <span>Matriz de Tarifas</span>
                {tariffView === 'excel' && (
                  <button onClick={handleAddTariffRow} className="btn btn-accent" style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}>
                    + Agregar Fila
                  </button>
                )}
              </h3>
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

              {/* Buscador de planilla y opciones */}
              <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.5rem' }}>
                <input
                  type="text"
                  placeholder="🔍 Buscar por aseguradora, plan, edad, suma o prima..."
                  className="form-input"
                  style={{ maxWidth: '350px', padding: '0.5rem 1rem', margin: 0 }}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />

                {/* Botón/menú de carga masiva JSON */}
                <details style={{ background: 'var(--secondary)', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', border: '1px solid var(--border)' }}>
                  <summary style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--primary)', userSelect: 'none' }}>Opciones de Carga Masiva JSON</summary>
                  <div style={{ marginTop: '1rem', cursor: 'default' }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1rem' }}>
                      Sube un archivo JSON estructurado para sobreescribir y actualizar masivamente la matriz.
                    </p>
                    <form onSubmit={handleBulkUpload} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                      <input
                        type="file"
                        id="file-upload-input"
                        accept=".json"
                        onChange={e => setFileToUpload(e.target.files[0])}
                        style={{ border: '1px solid var(--border)', padding: '0.35rem', borderRadius: '4px', fontSize: '0.8rem', background: '#fff' }}
                      />
                      <button type="submit" className="btn btn-primary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }} disabled={loading}>
                        Ejecutar Carga JSON
                      </button>
                    </form>
                    <a
                      href="/plantilla_tarifas.json"
                      download="plantilla_tarifas.json"
                      className="btn btn-secondary"
                      style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem', width: '100%', justifyContent: 'center' }}
                    >
                      Descargar Plantilla JSON 📥
                    </a>
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
                      {companies.map(c => (
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
                        {companies.map(c => (
                          <th key={c.id} colSpan={4} style={{ border: '1px solid var(--border)', padding: '0.5rem', textAlign: 'center' }}>{c.nombre}</th>
                        ))}
                      </tr>
                      <tr style={{ background: 'var(--secondary)' }}>
                        {companies.map(c => (
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
                          <td colSpan={2 + companies.length * 4} className="text-center" style={{ padding: '2rem', color: 'var(--text-muted)' }}>
                            No hay tarifas registradas en la planilla.
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
                            {companies.map(c => {
                              const cell = row.byCompany[c.id];
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
                                  <td style={{ border: '1px solid var(--border)', padding: '0.3rem', textAlign: 'center', fontSize: '0.8rem' }}>{cell.plan || 'N/A'}</td>
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
                      <col style={{ width: `${detailedColWidths.pago}px` }} />
                      <col style={{ width: `${detailedColWidths.edad_min}px` }} />
                      <col style={{ width: `${detailedColWidths.edad_max}px` }} />
                      <col style={{ width: `${detailedColWidths.suma_asegurada}px` }} />
                      <col style={{ width: `${detailedColWidths.prima}px` }} />
                      <col style={{ width: `${detailedColWidths.maternidad_suma}px` }} />
                      <col style={{ width: `${detailedColWidths.maternidad_costo}px` }} />
                      <col style={{ width: `${detailedColWidths.asist_intl_suma}px` }} />
                      <col style={{ width: `${detailedColWidths.asist_intl_costo}px` }} />
                      <col style={{ width: `${detailedColWidths.funeral_suma}px` }} />
                      <col style={{ width: `${detailedColWidths.funeral_costo}px` }} />
                      <col style={{ width: `${detailedColWidths.at_situ_medicamentos}px` }} />
                      <col style={{ width: `${detailedColWidths.consultas_medicas}px` }} />
                      <col style={{ width: `${detailedColWidths.examenes_lab_imagenologia}px` }} />
                      <col style={{ width: `${detailedColWidths.ambulancia}px` }} />
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
                          Forma de Pago
                          <div className={`resize-handle ${resizingCol === 'pago' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'pago')} />
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
                          Prima ($)
                          <div className={`resize-handle ${resizingCol === 'prima' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'prima')} />
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
                          Asist. Intl Suma
                          <div className={`resize-handle ${resizingCol === 'asist_intl_suma' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'asist_intl_suma')} />
                        </th>
                        <th style={{ position: 'relative' }}>
                          Asist. Intl Costo
                          <div className={`resize-handle ${resizingCol === 'asist_intl_costo' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'asist_intl_costo')} />
                        </th>
                        <th style={{ position: 'relative' }}>
                          Funeral Suma
                          <div className={`resize-handle ${resizingCol === 'funeral_suma' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'funeral_suma')} />
                        </th>
                        <th style={{ position: 'relative' }}>
                          Funeral Costo
                          <div className={`resize-handle ${resizingCol === 'funeral_costo' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'funeral_costo')} />
                        </th>
                        <th style={{ position: 'relative' }}>
                          At. Situ + Med
                          <div className={`resize-handle ${resizingCol === 'at_situ_medicamentos' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'at_situ_medicamentos')} />
                        </th>
                        <th style={{ position: 'relative' }}>
                          Consultas Méd
                          <div className={`resize-handle ${resizingCol === 'consultas_medicas' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'consultas_medicas')} />
                        </th>
                        <th style={{ position: 'relative' }}>
                          Exám. Lab/Imag
                          <div className={`resize-handle ${resizingCol === 'examenes_lab_imagenologia' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'examenes_lab_imagenologia')} />
                        </th>
                        <th style={{ position: 'relative' }}>
                          Ambulancia
                          <div className={`resize-handle ${resizingCol === 'ambulancia' ? 'resizing' : ''}`} onMouseDown={(e) => handleResizeStart(e, 'ambulancia')} />
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
                          <td colSpan="18" className="text-center" style={{ padding: '2rem', color: 'var(--text-muted)' }}>
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
                              <td>{textInput('pago')}</td>

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

                              <td>{textInput('maternidad_suma')}</td>
                              <td>{textInput('maternidad_costo')}</td>
                              <td>{textInput('asist_intl_suma')}</td>
                              <td>{textInput('asist_intl_costo')}</td>
                              <td>{textInput('funeral_suma')}</td>
                              <td>{textInput('funeral_costo')}</td>
                              <td>{textInput('at_situ_medicamentos')}</td>
                              <td>{textInput('consultas_medicas')}</td>
                              <td>{textInput('examenes_lab_imagenologia')}</td>
                              <td>{textInput('ambulancia')}</td>

                              {/* Acciones */}
                              <td style={{ textAlign: 'center', padding: '0.2rem' }}>
                                <button
                                  onClick={() => handleDeleteTariff(t.id)}
                                  className="btn"
                                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#fee2e2', color: '#ef4444', border: '1px solid #fecaca', cursor: 'pointer' }}
                                  disabled={loading}
                                >
                                  Eliminar
                                </button>
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
                    {filteredLogs.map((log) => (
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
                          attempts.map((att) => (
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
