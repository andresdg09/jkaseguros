"use client";

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/ToastProvider';
import { useRouter } from 'next/navigation';
import { createWhatsAppLink } from '../../utils/whatsapp';
import PaginationControls from '../../components/PaginationControls';

// Normaliza la URL base: si NEXT_PUBLIC_API_URL viene sin el sufijo /api
// (mala configuración en Vercel), lo agregamos igual para no romper todas las requests.
function normalizeApiUrl(url) {
  const trimmed = url.replace(/\/+$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}
const API_URL = normalizeApiUrl(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api');

function calculateAge(birthDateStr) {
  if (!birthDateStr) return null;
  const today = new Date();
  const birthDate = new Date(birthDateStr);
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return isNaN(age) || age < 0 ? null : age;
}

const DEFAULT_COMPANIES = [
  { id: 1, nombre: "Mercantil Seguros" },
  { id: 2, nombre: "Seguros Caracas" },
  { id: 3, nombre: "Seguros Venezuela" },
  { id: 4, nombre: "Mapfre Seguros" },
  { id: 5, nombre: "Internacional de Seguros" }
];

const DEFAULT_COMPANY_PLANS = {
  '1': ['ACCESS', 'PLATINO', 'EMERGENCIAS'],
  '2': ['SALUD EXTERIOR', 'SALUD INDIVIDUAL'],
  '3': ['BRONCE', 'PLATA', 'ORO'],
  '4': ['Salud Global', 'Incendio', 'Vehículos'],
  '5': ['Cobertura Internacional', 'Asistencia en Viajes']
};

const DEFAULT_PLAN_SUMS = {
  'ACCESS': [30000, 50000, 100000, 200000],
  'PLATINO': [5000, 10000],
  'EMERGENCIAS': [5000, 10000],
  'SALUD EXTERIOR': [50000, 100000, 200000],
  'SALUD INDIVIDUAL': [30000],
  'BRONCE': [50000],
  'PLATA': [100000],
  'ORO': [200000],
  'Salud Global': [10000, 20000, 50000, 100000],
  'Incendio': [50000, 100000, 250000],
  'Vehículos': [10000, 25000, 50000],
  'Cobertura Internacional': [50000, 100000, 200000],
  'Asistencia en Viajes': [25000, 50000]
};

function isTariffOfCompany(t, compId, companyList = []) {
  if (!t || !compId) return false;
  if (String(t.compania_id) === String(compId)) return true;
  const compObj = companyList.find(c => String(c.id) === String(compId));
  if (compObj) {
    const compName = (compObj.nombre || '').toLowerCase();
    const tCompName = (t.compania_nombre || t.compania || '').toLowerCase();
    if (tCompName && (compName.includes(tCompName) || tCompName.includes(compName))) return true;
    if (compName.includes('mercantil') && (String(t.compania_id) === '1' || tCompName.includes('mercantil'))) return true;
    if (compName.includes('caracas') && (String(t.compania_id) === '2' || tCompName.includes('caracas'))) return true;
    if (compName.includes('venezuela') && (String(t.compania_id) === '3' || tCompName.includes('venezuela'))) return true;
    if (compName.includes('mapfre') && (String(t.compania_id) === '4' || tCompName.includes('mapfre'))) return true;
    if (compName.includes('internacional') && (String(t.compania_id) === '5' || tCompName.includes('internacional'))) return true;
  }
  return false;
}

function getAvailablePlans(compId, tariffsList = [], companyList = []) {
  if (!compId) return [];
  const fromTariffs = Array.from(new Set(
    tariffsList
      .filter(t => isTariffOfCompany(t, compId, companyList))
      .map(t => t.plan)
      .filter(Boolean)
  )).sort();

  if (fromTariffs.length > 0) return fromTariffs;

  const compKey = String(compId);
  if (DEFAULT_COMPANY_PLANS[compKey]) return DEFAULT_COMPANY_PLANS[compKey];
  
  const compObj = companyList.find(c => String(c.id) === compKey);
  if (compObj) {
    const cName = compObj.nombre.toLowerCase();
    if (cName.includes('mercantil')) return DEFAULT_COMPANY_PLANS['1'];
    if (cName.includes('caracas')) return DEFAULT_COMPANY_PLANS['2'];
    if (cName.includes('venezuela')) return DEFAULT_COMPANY_PLANS['3'];
    if (cName.includes('mapfre')) return DEFAULT_COMPANY_PLANS['4'];
    if (cName.includes('internacional')) return DEFAULT_COMPANY_PLANS['5'];
  }

  return ['Plan Estándar', 'Plan Especial'];
}

function getAvailableSums(compId, planName, tariffsList = [], companyList = []) {
  if (!planName) return [];
  const fromTariffs = Array.from(new Set(
    tariffsList
      .filter(t => isTariffOfCompany(t, compId, companyList) && t.plan === planName)
      .map(t => parseFloat(t.suma_asegurada))
      .filter(n => !isNaN(n) && n > 0)
  )).sort((a, b) => a - b);

  if (fromTariffs.length > 0) return fromTariffs;

  if (DEFAULT_PLAN_SUMS[planName]) return DEFAULT_PLAN_SUMS[planName];

  return [5000, 10000, 20000, 30000, 50000, 100000, 200000];
}

export default function AsesorDashboard() {
  const { token, isLoggedIn, user, asesor, hydrated } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();

  // --- ESTADOS DE DATOS ---
  const [clients, setClients] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [payments, setPayments] = useState([]);
  const [tempRefs, setTempRefs] = useState({});
  const [companies, setCompanies] = useState(DEFAULT_COMPANIES);
  const [tariffs, setTariffs] = useState([]);
  const [policyForm, setPolicyForm] = useState({ 
    cliente_id: '', 
    compania_id: '', 
    plan: '', 
    suma_asegurada: '', 
    prima_anual: '', 
    frecuencia_pago: 'contado',
    edad_calculada: null
  });
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

  // --- PAGINACIÓN ---
  const [pageClients, setPageClients] = useState(1);
  const [pageSizeClients, setPageSizeClients] = useState(10);

  const [pagePayments, setPagePayments] = useState(1);
  const [pageSizePayments, setPageSizePayments] = useState(10);

  const [pagePolicies, setPagePolicies] = useState(1);
  const [pageSizePolicies, setPageSizePolicies] = useState(10);

  // --- ESTADOS DE ENVÍO DE DOCUMENTOS ---
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [selectedClientForDocs, setSelectedClientForDocs] = useState(null);
  const [selectedDocType, setSelectedDocType] = useState('Salud');
  
  // --- ESTADOS DE FICHA 360 DEL CLIENTE ---
  const [clientViewMode, setClientViewMode] = useState('tarjetas'); // 'tarjetas' | 'tabla'
  const [profileModalClient, setProfileModalClient] = useState(null);
  const [profileModalTab, setProfileModalTab] = useState('socio'); // 'socio', 'familiar', 'patrimonial', 'conductual', 'notas'
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    numero_hijos: 0,
    estado_civil: 'Soltero',
    profesion_ocupacion: '',
    empresa_trabajo: '',
    nivel_educativo: 'Universitario',
    ciudad_residencia: '',
    zona_sector: '',
    tipo_vivienda: 'Propia',
    fumador: 'No fumador',
    practica_deportes: 'Ninguno',
    frecuencia_viajes: 'No viaja',
    sosten_principal: true,
    dependientes_economicos: 0,
    edades_hijos: '',
    nombre_conyuge: '',
    prioridad_familiar: '',
    rango_ingresos: '$1,000 - $3,000',
    posee_vehiculos: false,
    cantidad_vehiculos: 0,
    detalles_vehiculos: '',
    posee_inmuebles: false,
    cantidad_inmuebles: 0,
    posee_empresa_negocio: false,
    nombre_empresa_ramo: '',
    capacidad_ahorro: 'Media',
    tiene_hipoteca_deuda: false,
    seguros_actuales: [],
    experiencia_previa: 'Positiva',
    perfil_riesgo: 'Moderado',
    interes_principal: 'Salud Integral',
    canal_contacto: 'WhatsApp',
    horario_contacto: 'Tarde (1:00 PM - 5:00 PM)',
    notas_asesor: ''
  });

  // Estado para edición rápida de teléfono del cliente
  const [editPhoneModalClient, setEditPhoneModalClient] = useState(null);
  const [editPhoneForm, setEditPhoneForm] = useState({ codigo_area: '0414', numero_celular: '' });
  const [savingPhone, setSavingPhone] = useState(false);

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
      return showToast('Por favor ingrese el monto en Bolívares y la referencia (últimos 6 dígitos).', 'error');
    }

    if (reportPayForm.referencia.trim().length !== 6) {
      return showToast('Por favor ingrese exactamente los últimos 6 dígitos de la referencia.', 'error');
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
      
      // Actualización optimista inmediata en la UI
      setPayments(prev => prev.map(p => {
        if (String(p.id) === String(reportPayForm.pago_id) || (!reportPayForm.pago_id && String(p.poliza_id) === String(reportPayForm.poliza_id) && p.estado_pago === 'pendiente')) {
          return {
            ...p,
            estado_pago: 'en_revision',
            referencia: reportPayForm.referencia,
            monto_reportado: cleanMontoVES,
            moneda_pago: 'VES',
            fecha_pago: reportPayForm.fecha_pago,
            observaciones: reportPayForm.observaciones || p.observaciones
          };
        }
        return p;
      }));

      // Mantener la póliza expandida para ver el pago reportado en revisión de inmediato
      if (reportPayForm.poliza_id) {
        setExpandedPolicies(prev => ({ ...prev, [String(reportPayForm.poliza_id)]: true }));
      }

      setReportPayModal(null);
      await loadData();
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

  // --- HANDLERS DE FICHA 360 & TELÉFONO ---
  const handleOpenProfileModal = (c) => {
    setProfileModalClient(c);
    setProfileModalTab('socio');
    const p = c.perfil_360 || {};
    let cArea = c.codigo_area || '0414';
    let numCel = c.numero_celular || '';
    if (!numCel && c.telefono) {
      const clean = c.telefono.replace(/[^0-9]/g, '');
      if (clean.length >= 10) {
        cArea = clean.slice(0, 4);
        numCel = clean.slice(4);
      } else {
        numCel = clean;
      }
    }
    setProfileForm({
      codigo_area: cArea,
      numero_celular: numCel,
      numero_hijos: c.numero_hijos || 0,
      estado_civil: c.estado_civil || 'Soltero',
      profesion_ocupacion: p.profesion_ocupacion || '',
      empresa_trabajo: p.empresa_trabajo || '',
      nivel_educativo: p.nivel_educativo || 'Universitario',
      ciudad_residencia: p.ciudad_residencia || '',
      zona_sector: p.zona_sector || '',
      tipo_vivienda: p.tipo_vivienda || 'Propia',
      fumador: p.fumador || 'No fumador',
      practica_deportes: p.practica_deportes || 'Ninguno',
      frecuencia_viajes: p.frecuencia_viajes || 'No viaja',
      sosten_principal: p.sosten_principal !== false,
      dependientes_economicos: p.dependientes_economicos !== undefined ? p.dependientes_economicos : (c.numero_hijos || 0),
      edades_hijos: p.edades_hijos || '',
      nombre_conyuge: p.nombre_conyuge || '',
      prioridad_familiar: p.prioridad_familiar || '',
      rango_ingresos: p.rango_ingresos || '$1,000 - $3,000',
      posee_vehiculos: p.posee_vehiculos === true,
      cantidad_vehiculos: p.cantidad_vehiculos || 0,
      detalles_vehiculos: p.detalles_vehiculos || '',
      posee_inmuebles: p.posee_inmuebles === true,
      cantidad_inmuebles: p.cantidad_inmuebles || 0,
      posee_empresa_negocio: p.posee_empresa_negocio === true,
      nombre_empresa_ramo: p.nombre_empresa_ramo || '',
      capacidad_ahorro: p.capacidad_ahorro || 'Media',
      tiene_hipoteca_deuda: p.tiene_hipoteca_deuda === true,
      seguros_actuales: Array.isArray(p.seguros_actuales) ? p.seguros_actuales : [],
      experiencia_previa: p.experiencia_previa || 'Positiva',
      perfil_riesgo: p.perfil_riesgo || 'Moderado',
      interes_principal: p.interes_principal || 'Salud Integral',
      canal_contacto: p.canal_contacto || 'WhatsApp',
      horario_contacto: p.horario_contacto || 'Tarde (1:00 PM - 5:00 PM)',
      notas_asesor: p.notas_asesor || ''
    });
  };

  const handleOpenEditPhone = (c) => {
    setEditPhoneModalClient(c);
    let cArea = c.codigo_area || '0414';
    let numCel = c.numero_celular || '';
    if (!numCel && c.telefono) {
      const clean = c.telefono.replace(/[^0-9]/g, '');
      if (clean.length >= 10) {
        cArea = clean.slice(0, 4);
        numCel = clean.slice(4);
      } else {
        numCel = clean;
      }
    }
    setEditPhoneForm({ codigo_area: cArea, numero_celular: numCel });
  };

  const handleSavePhone = async (e) => {
    e.preventDefault();
    if (!editPhoneModalClient) return;
    try {
      setSavingPhone(true);
      const res = await fetch(`${API_URL}/client-profiles/${editPhoneModalClient.id}/phone`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(editPhoneForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al actualizar teléfono');

      showToast('¡Teléfono del cliente actualizado con éxito!', 'success');
      setEditPhoneModalClient(null);
      await loadData();
    } catch (err) {
      showToast(err.message || 'Error al guardar teléfono', 'error');
    } finally {
      setSavingPhone(false);
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!profileModalClient) return;
    try {
      setSavingProfile(true);
      const res = await fetch(`${API_URL}/client-profiles/${profileModalClient.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(profileForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar perfil 360');

      showToast('¡Ficha 360 del cliente guardada con éxito!', 'success');
      setProfileModalClient(null);
      await loadData();
    } catch (err) {
      showToast(err.message || 'Error al guardar', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleCopyPublicLink = (tokenPublico) => {
    if (!tokenPublico) return showToast('No se encontró el token del cliente', 'error');
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const link = `${origin}/actualizar-datos/${tokenPublico}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(link);
      showToast('¡Enlace de actualización copiado al portapapeles! Envíalo al cliente.', 'success');
    } else {
      showToast(`Enlace: ${link}`, 'info');
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
      // 1. Cargar clientes asignados al asesor con Ficha 360 y Scoring
      let dataClients = [];
      try {
        const res360 = await fetch(`${API_URL}/client-profiles/my-clients`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res360.ok) {
          dataClients = await res360.json();
        }
      } catch (e) {
        console.warn('Fallback a /advisor/clients:', e);
      }

      if (!Array.isArray(dataClients) || dataClients.length === 0) {
        const resClients = await fetch(`${API_URL}/advisor/clients`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const fallbackClients = await resClients.json();
        dataClients = Array.isArray(fallbackClients) ? fallbackClients : [];
      }
      setClients(dataClients);

      // 2. Cargar pólizas del asesor
      const resPols = await fetch(`${API_URL}/policies`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const dataPols = await resPols.json();
      const validPols = Array.isArray(dataPols) ? dataPols : [];
      setPolicies(validPols);

      // 3. Cargar cobros/pagos globales
      const resPays = await fetch(`${API_URL}/payments/admin`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const dataPays = await resPays.json();
      
      if (Array.isArray(dataPays)) {
        // Filtrar pagos para mostrar aquellos vinculados a pólizas de este asesor
        const policyIds = new Set(validPols.map(p => String(p.id)));
        const advisorId = asesor?.id || user?.id;
        const filteredPays = dataPays.filter(pa => 
          policyIds.has(String(pa.poliza_id)) || 
          (advisorId && pa.asesor_id && String(pa.asesor_id) === String(advisorId))
        );
        setPayments(filteredPays);
      } else {
        setPayments([]);
      }

      // Cargar compañías para solicitudes de pólizas
      let loadedComps = [];
      try {
        const resComps = await fetch(`${API_URL}/admin/companies`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (resComps.ok) {
          const dataComps = await resComps.json();
          if (Array.isArray(dataComps) && dataComps.length > 0) {
            loadedComps = dataComps;
          }
        }
      } catch (e) {
        console.warn('Error al cargar companias:', e);
      }
      setCompanies(loadedComps.length > 0 ? loadedComps : DEFAULT_COMPANIES);

      // Cargar tarifas del tarifario oficial (intentar /quote/tariffs o /admin/tariffs)
      let loadedTariffs = [];
      try {
        const resTariffs = await fetch(`${API_URL}/quote/tariffs`);
        if (resTariffs.ok) {
          const dataTariffs = await resTariffs.json();
          if (Array.isArray(dataTariffs) && dataTariffs.length > 0) {
            loadedTariffs = dataTariffs;
          }
        }
      } catch (e) {
        console.warn('Error al cargar /quote/tariffs:', e);
      }

      if (loadedTariffs.length === 0) {
        try {
          const resAdminTariffs = await fetch(`${API_URL}/admin/tariffs`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (resAdminTariffs.ok) {
            const dataAdminTariffs = await resAdminTariffs.json();
            if (Array.isArray(dataAdminTariffs) && dataAdminTariffs.length > 0) {
              loadedTariffs = dataAdminTariffs;
            }
          }
        } catch (e) {
          console.warn('Error al cargar /admin/tariffs:', e);
        }
      }
      setTariffs(loadedTariffs);

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
  }, [hydrated, isLoggedIn, user, activeTab]);

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

      showToast('Cliente registrado exitosamente en el sistema Protección y Seguros 360.');
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

  // Helper: Encontrar tarifa correspondiente según Aseguradora, Plan, Suma y Edad
  const findMatchingTariff = (companyId, planName, sumVal, age) => {
    if (!companyId || !planName || !sumVal) return null;
    const cleanSum = parseFloat(sumVal);
    const clientAge = (age !== null && age !== undefined && !isNaN(age)) ? age : null;

    if (clientAge !== null) {
      const match = tariffs.find(t =>
        isTariffOfCompany(t, companyId, companies) &&
        t.plan === planName &&
        parseFloat(t.suma_asegurada) === cleanSum &&
        t.edad_min <= clientAge &&
        t.edad_max >= clientAge
      );
      if (match) return match;
    }

    return tariffs.find(t =>
      isTariffOfCompany(t, companyId, companies) &&
      t.plan === planName &&
      parseFloat(t.suma_asegurada) === cleanSum
    ) || null;
  };

  const handlePolicyClientChange = (clientId) => {
    const selectedCli = clients.find(c => String(c.id) === String(clientId));
    const age = selectedCli?.fecha_nacimiento ? calculateAge(selectedCli.fecha_nacimiento) : null;
    
    let newPrima = policyForm.prima_anual;
    let matchingTariff = null;
    if (policyForm.compania_id && policyForm.plan && policyForm.suma_asegurada) {
      matchingTariff = findMatchingTariff(policyForm.compania_id, policyForm.plan, policyForm.suma_asegurada, age);
      if (matchingTariff) newPrima = matchingTariff.prima;
    }

    setPolicyForm(prev => ({
      ...prev,
      cliente_id: clientId,
      edad_calculada: age,
      prima_anual: matchingTariff ? String(matchingTariff.prima) : newPrima
    }));
  };

  const handlePolicyCompanyChange = (companyId) => {
    const availablePlans = getAvailablePlans(companyId, tariffs, companies);
    const firstPlan = availablePlans[0] || '';
    
    const availableSums = getAvailableSums(companyId, firstPlan, tariffs, companies);
    const firstSum = availableSums[0] || '';
    const match = findMatchingTariff(companyId, firstPlan, firstSum, policyForm.edad_calculada);

    setPolicyForm(prev => ({
      ...prev,
      compania_id: companyId,
      plan: firstPlan,
      suma_asegurada: firstSum ? String(firstSum) : '',
      prima_anual: match ? String(match.prima) : prev.prima_anual,
      frecuencia_pago: match?.pago_contado ? 'contado' : (match?.pago_semestral ? 'semestral' : (match?.pago_cuatrimestral ? 'cuatrimestral' : (match?.pago_trimestral ? 'trimestral' : 'mensual')))
    }));
  };

  const handlePolicyPlanChange = (planName) => {
    const availableSums = getAvailableSums(policyForm.compania_id, planName, tariffs, companies);
    const firstSum = availableSums[0] || '';
    const match = findMatchingTariff(policyForm.compania_id, planName, firstSum, policyForm.edad_calculada);

    setPolicyForm(prev => ({
      ...prev,
      plan: planName,
      suma_asegurada: firstSum ? String(firstSum) : '',
      prima_anual: match ? String(match.prima) : prev.prima_anual,
      frecuencia_pago: match?.pago_contado ? 'contado' : (match?.pago_semestral ? 'semestral' : (match?.pago_cuatrimestral ? 'cuatrimestral' : (match?.pago_trimestral ? 'trimestral' : 'mensual')))
    }));
  };

  const handlePolicySumChange = (sumVal) => {
    const match = findMatchingTariff(policyForm.compania_id, policyForm.plan, sumVal, policyForm.edad_calculada);

    setPolicyForm(prev => ({
      ...prev,
      suma_asegurada: sumVal,
      prima_anual: match ? String(match.prima) : prev.prima_anual,
      frecuencia_pago: match?.pago_contado ? 'contado' : (match?.pago_semestral ? 'semestral' : (match?.pago_cuatrimestral ? 'cuatrimestral' : (match?.pago_trimestral ? 'trimestral' : 'mensual')))
    }));
  };

  // Solicitar nueva póliza al admin
  const handleRequestPolicy = async (e) => {
    e.preventDefault();
    if (!policyForm.cliente_id || !policyForm.compania_id || !policyForm.suma_asegurada || !policyForm.prima_anual) {
      return showToast('Por favor, seleccione el cliente, aseguradora, plan y suma asegurada.', 'error');
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
          frecuencia_pago: policyForm.frecuencia_pago || 'contado',
          asesor_id: asesor?.id ? parseInt(asesor.id) : undefined
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al solicitar póliza');

      showToast(`¡Solicitud de póliza enviada con éxito! Código: ${data.poliza.codigo_poliza}. Estado: Negociación.`);
      setPolicyForm({
        cliente_id: '',
        compania_id: '',
        plan: '',
        suma_asegurada: '',
        prima_anual: '',
        frecuencia_pago: 'contado',
        edad_calculada: null
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
    const clientObj = clients.find(c => payment.cliente_nombre && payment.cliente_nombre.includes(c.primer_nombre));
    const phone = clientObj ? clientObj.telefono : '';
    
    const advisorName = asesor ? asesor.nombre : (user?.correo || 'Asesor Comercial');
    const mensaje = `Estimado *${payment.cliente_nombre}*, te saluda tu asesor de seguros *${advisorName}* de *Protección y Seguros 360*. Te escribo para recordarte que tienes un pago pendiente por el monto de *$${payment.monto}* para tu póliza *${payment.poliza_codigo}* de *${payment.compania_nombre}*. Por favor reporta tu referencia en el sistema. ¡Feliz día!`;

    const waUrl = createWhatsAppLink(phone, mensaje);
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

      const advisorName = asesor ? asesor.nombre : 'Asesor Protección y Seguros 360';

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
                Hola <strong>${payment.cliente_nombre}</strong>, te saludamos de <strong>Protección y Seguros 360</strong>. Queremos recordarte que tienes un cobro pendiente de <strong>$${payment.monto}</strong> para tu póliza <strong>${payment.poliza_codigo}</strong> de la compañía <strong>${payment.compania_nombre}</strong>.
              </p>
              <p style="font-size: 15px; color: #334155; line-height: 1.6; margin: 0 0 20px 0;">
                Por favor, ingresa a tu portal en Protección y Seguros 360 y reporta el pago con su número de referencia.
              </p>
              <div style="text-align: center; margin-top: 15px;">
                <a href="${typeof window !== 'undefined' ? window.location.origin : 'https://proteccionyseguros360.com'}/login" target="_blank" style="background-color: #2563eb; color: #ffffff; padding: 11px 24px; font-size: 13px; font-weight: bold; text-decoration: none; border-radius: 6px; display: inline-block; box-shadow: 0 4px 6px rgba(37,99,235,0.15);">
                  🔑 Ingresar a mi Cuenta
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
        throw new Error('No se pudo enviar el correo de recordatorio.');
      }

      showToast(`Recordatorio de pago enviado exitosamente a ${targetEmail}`);
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

    // 1. Inicializar todas las pólizas del asesor
    policies.forEach(pol => {
      const pKey = String(pol.id);
      map.set(pKey, {
        poliza_id: pol.id,
        poliza_codigo: pol.codigo_poliza || 'POL-GENERAL',
        cliente_nombre: pol.cliente_nombre || 'Cliente',
        compania_nombre: pol.compania_nombre || 'Seguros',
        frecuencia: pol.frecuencia_pago || 'contado',
        plan: pol.plan || '',
        total_prima: parseFloat(pol.prima_anual || 0),
        cuotas: []
      });
    });

    // 2. Asociar cuotas / pagos
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
        montoTotalCuotas: montoTotalCuotas || group.total_prima,
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
      const q = searchQuery.toLowerCase().trim();
      return (
        group.poliza_codigo?.toLowerCase().includes(q) ||
        group.cliente_nombre?.toLowerCase().includes(q) ||
        group.compania_nombre?.toLowerCase().includes(q) ||
        group.plan?.toLowerCase().includes(q) ||
        group.cuotas.some(c => 
          (c.referencia && String(c.referencia).toLowerCase().includes(q)) ||
          (c.monto_reportado && String(c.monto_reportado).includes(q)) ||
          (c.estado_pago && String(c.estado_pago).toLowerCase().includes(q))
        )
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
      {/* KPI METRICS DE ASESOR */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1.2rem',
        marginBottom: '2rem'
      }}>
        <div className="card" style={{ padding: '1.2rem', display: 'flex', flexDirection: 'column', borderLeft: '4px solid var(--primary)' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Mis Asegurados</span>
          <span style={{ fontSize: '1.7rem', fontWeight: 800, color: 'var(--primary)', margin: '0.3rem 0' }}>
            {clients.length}
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Clientes en cartera</span>
        </div>

        <div className="card" style={{ padding: '1.2rem', display: 'flex', flexDirection: 'column', borderLeft: '4px solid #10b981' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Pólizas Vigentes</span>
          <span style={{ fontSize: '1.7rem', fontWeight: 800, color: '#10b981', margin: '0.3rem 0' }}>
            {policies.filter(p => p.estado === 'vigente').length} <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 400 }}>/ {policies.length} tot.</span>
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>En negociación: {policies.filter(p => p.estado === 'negociacion').length}</span>
        </div>

        <div className="card" style={{ padding: '1.2rem', display: 'flex', flexDirection: 'column', borderLeft: '4px solid var(--accent)' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Cartera Total ($)</span>
          <span style={{ fontSize: '1.7rem', fontWeight: 800, color: 'var(--accent)', margin: '0.3rem 0' }}>
            ${policies.filter(p => p.estado === 'vigente').reduce((sum, p) => sum + parseFloat(p.prima_anual || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Primas anuales vigentes</span>
        </div>

        <div className="card" style={{ padding: '1.2rem', display: 'flex', flexDirection: 'column', borderLeft: '4px solid #f59e0b' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Cobranzas Pendientes</span>
          <span style={{ fontSize: '1.7rem', fontWeight: 800, color: '#f59e0b', margin: '0.3rem 0' }}>
            {payments.filter(p => p.estado_pago === 'pendiente').length}
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Cuotas por cobrar</span>
        </div>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <h3 style={{ color: 'var(--primary)', fontWeight: 800, fontSize: '1.4rem', margin: 0 }}>
                    📇 Directorio de Clientes & Fichas 360
                  </h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                    Segmentación integral, potencialidades de venta cruzada y actualización rápida de asegurados.
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  {/* Switcher de Vista */}
                  <div style={{ display: 'flex', background: '#f1f5f9', padding: '0.25rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <button
                      type="button"
                      onClick={() => setClientViewMode('tarjetas')}
                      style={{
                        padding: '0.45rem 0.9rem',
                        borderRadius: '9px',
                        border: 'none',
                        fontWeight: 800,
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        background: clientViewMode === 'tarjetas' ? 'var(--primary)' : 'transparent',
                        color: clientViewMode === 'tarjetas' ? '#ffffff' : '#64748b',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      📇 Tarjetas 360
                    </button>
                    <button
                      type="button"
                      onClick={() => setClientViewMode('tabla')}
                      style={{
                        padding: '0.45rem 0.9rem',
                        borderRadius: '9px',
                        border: 'none',
                        fontWeight: 800,
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        background: clientViewMode === 'tabla' ? 'var(--primary)' : 'transparent',
                        color: clientViewMode === 'tabla' ? '#ffffff' : '#64748b',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      📋 Vista Tabla
                    </button>
                  </div>

                  <a
                    href="/dashboard/admin/clientes-analitica"
                    className="btn"
                    style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)', color: '#ffffff', fontWeight: 800, fontSize: '0.8rem', padding: '0.5rem 1rem', textDecoration: 'none', boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)' }}
                  >
                    📊 Tablero Analítico 360
                  </a>
                </div>
              </div>

              {/* Buscador Rápido */}
              <div style={{ marginBottom: '1.75rem' }}>
                <input
                  type="text"
                  placeholder="🔍 Buscar por nombre, cédula, correo, profesión o teléfono..."
                  className="form-input"
                  style={{ maxWidth: '480px', padding: '0.65rem 1.1rem', margin: 0, fontSize: '0.9rem', borderRadius: '12px' }}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* VISTA EN TARJETAS 360 */}
              {clientViewMode === 'tarjetas' && (
                <div>
                  {filteredClients.length === 0 ? (
                    <div className="card" style={{ padding: '3.5rem 2rem', textAlign: 'center', color: '#94a3b8' }}>
                      <span style={{ fontSize: '3rem', display: 'block', marginBottom: '0.5rem' }}>👤</span>
                      <h4 style={{ fontWeight: 800, color: '#334155', fontSize: '1.1rem' }}>No se encontraron clientes</h4>
                      <p style={{ fontSize: '0.85rem' }}>Intenta ajustar el término de búsqueda.</p>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
                      {filteredClients
                        .slice((pageClients - 1) * pageSizeClients, pageClients * pageSizeClients)
                        .map((c) => {
                          const clientPols = policies.filter(p => p.cliente_id === c.id);
                          const p360 = c.perfil_360 || {};
                          const analisis = c.analisis || {
                            scores: { vida: 20, salud: 25, patrimonial: 15, retiro: 15 },
                            topOportunidad: { tipo: 'Seguro de Salud', score: 25 }
                          };
                          const cleanPhone = (c.telefono || '').replace(/[^0-9]/g, '');
                          const waPhone = cleanPhone.startsWith('0') ? '58' + cleanPhone.slice(1) : (cleanPhone.startsWith('58') ? cleanPhone : '58' + cleanPhone);
                          const waUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(analisis.mensajeWhatsApp || '')}`;
                          const initials = (c.nombre || 'C').split(' ').map(n => n[0]).join('').slice(0, 2);

                          return (
                            <div
                              key={c.id}
                              className="card"
                              style={{
                                padding: '1.5rem',
                                borderTop: `4px solid ${analisis.scores?.vida >= 65 ? '#10b981' : (analisis.scores?.salud >= 65 ? '#0284c7' : '#1e3a8a')}`,
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between',
                                transition: 'transform 0.2s ease, box-shadow 0.2s ease'
                              }}
                            >
                              {/* Encabezado de la Tarjeta */}
                              <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div style={{
                                      width: '46px',
                                      height: '46px',
                                      borderRadius: '12px',
                                      background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
                                      color: '#ffffff',
                                      fontWeight: 900,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: '0.95rem',
                                      boxShadow: '0 4px 10px rgba(37,99,235,0.2)'
                                    }}>
                                      {initials}
                                    </div>
                                    <div>
                                      <h4 style={{ fontWeight: 800, color: '#0f172a', fontSize: '1rem', margin: 0, lineHeight: 1.2 }}>
                                        {c.nombre || `${c.primer_nombre} ${c.primer_apellido}`}
                                      </h4>
                                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginTop: '0.25rem' }}>
                                        <span style={{ backgroundColor: '#f1f5f9', color: '#475569', fontSize: '0.75rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                                          {c.tipo_documento} {c.nro_documento}
                                        </span>
                                        <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                                          📞 {c.telefono}
                                          <button
                                            type="button"
                                            onClick={() => handleOpenEditPhone(c)}
                                            title="Editar teléfono del cliente"
                                            style={{
                                              background: '#eff6ff',
                                              border: '1px solid #bfdbfe',
                                              borderRadius: '6px',
                                              color: '#1d4ed8',
                                              cursor: 'pointer',
                                              fontSize: '0.65rem',
                                              padding: '0.1rem 0.35rem',
                                              fontWeight: 800
                                            }}
                                          >
                                            ✏️ Editar
                                          </button>
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  <span style={{
                                    backgroundColor: clientPols.length > 0 ? '#ecfdf5' : '#f8fafc',
                                    color: clientPols.length > 0 ? '#059669' : '#64748b',
                                    border: `1px solid ${clientPols.length > 0 ? '#a7f3d0' : '#e2e8f0'}`,
                                    fontSize: '0.7rem',
                                    fontWeight: 800,
                                    padding: '0.2rem 0.55rem',
                                    borderRadius: '9999px',
                                    textTransform: 'uppercase'
                                  }}>
                                    {clientPols.length} {clientPols.length === 1 ? 'Póliza' : 'Pólizas'}
                                  </span>
                                </div>

                                {/* Cuadrícula de Datos Sociodemográficos */}
                                <div style={{ backgroundColor: '#f8fafc', padding: '0.85rem 1rem', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.775rem' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: '#64748b' }}>💼 Ocupación:</span>
                                    <strong style={{ color: '#1e293b', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {p360.profesion_ocupacion || 'Sin especificar'}
                                    </strong>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: '#64748b' }}>📍 Ciudad:</span>
                                    <strong style={{ color: '#1e293b' }}>{p360.ciudad_residencia || 'No especificada'}</strong>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: '#64748b' }}>👨‍👩‍👧 Familia:</span>
                                    <strong style={{ color: '#1e293b' }}>
                                      {c.estado_civil || 'Soltero'} • {p360.dependientes_economicos || c.numero_hijos || 0} dep.
                                    </strong>
                                  </div>
                                  {p360.rango_ingresos && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: '0.25rem' }}>
                                      <span style={{ color: '#64748b' }}>💵 Ingresos:</span>
                                      <strong style={{ color: '#10b981' }}>{p360.rango_ingresos}</strong>
                                    </div>
                                  )}
                                </div>

                                {/* Mini Indicadores de Cross-Selling */}
                                <div style={{ marginBottom: '1.25rem' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                    <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                      Potencial de Venta Cruzada
                                    </span>
                                    <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#4f46e5', background: '#eef2ff', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                                      {analisis.topOportunidad?.tipo}
                                    </span>
                                  </div>

                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem', textAlign: 'center' }}>
                                    {/* Vida */}
                                    <div style={{ background: '#ecfdf5', padding: '0.4rem 0.2rem', borderRadius: '8px', border: '1px solid #a7f3d0' }}>
                                      <span style={{ display: 'block', fontSize: '0.65rem', color: '#047857', fontWeight: 700 }}>Vida</span>
                                      <strong style={{ fontSize: '0.8rem', color: '#059669', fontWeight: 900 }}>{analisis.scores?.vida}%</strong>
                                    </div>

                                    {/* Salud */}
                                    <div style={{ background: '#f0f9ff', padding: '0.4rem 0.2rem', borderRadius: '8px', border: '1px solid #bae6fd' }}>
                                      <span style={{ display: 'block', fontSize: '0.65rem', color: '#0369a1', fontWeight: 700 }}>Salud</span>
                                      <strong style={{ fontSize: '0.8rem', color: '#0284c7', fontWeight: 900 }}>{analisis.scores?.salud}%</strong>
                                    </div>

                                    {/* Auto */}
                                    <div style={{ background: '#f5f3ff', padding: '0.4rem 0.2rem', borderRadius: '8px', border: '1px solid #ddd6fe' }}>
                                      <span style={{ display: 'block', fontSize: '0.65rem', color: '#6d28d9', fontWeight: 700 }}>Auto</span>
                                      <strong style={{ fontSize: '0.8rem', color: '#7c3aed', fontWeight: 900 }}>{analisis.scores?.patrimonial}%</strong>
                                    </div>

                                    {/* Retiro */}
                                    <div style={{ background: '#fffbeb', padding: '0.4rem 0.2rem', borderRadius: '8px', border: '1px solid #fde68a' }}>
                                      <span style={{ display: 'block', fontSize: '0.65rem', color: '#b45309', fontWeight: 700 }}>Retiro</span>
                                      <strong style={{ fontSize: '0.8rem', color: '#d97706', fontWeight: 900 }}>{analisis.scores?.retiro}%</strong>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Botones de Acción */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenProfileModal(c)}
                                    className="btn btn-primary"
                                    style={{ fontSize: '0.775rem', padding: '0.45rem', justifyContent: 'center' }}
                                  >
                                    📝 Ficha 360
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleCopyPublicLink(c.token_publico)}
                                    className="btn btn-secondary"
                                    style={{ fontSize: '0.775rem', padding: '0.45rem', justifyContent: 'center' }}
                                    title="Copiar enlace para el cliente"
                                  >
                                    🔗 Link Cliente
                                  </button>
                                </div>

                                <a
                                  href={waUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    backgroundColor: '#10b981',
                                    color: '#ffffff',
                                    padding: '0.5rem',
                                    borderRadius: '10px',
                                    fontWeight: 800,
                                    fontSize: '0.775rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.4rem',
                                    textDecoration: 'none',
                                    boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
                                    transition: 'all 0.2s ease'
                                  }}
                                >
                                  <span>💬 WhatsApp (Propuesta)</span>
                                </a>
                              </div>

                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              )}

              {/* VISTA EN TABLA TRADICIONAL */}
              {clientViewMode === 'tabla' && (
                <div className="table-container">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Asegurado</th>
                        <th>Documento</th>
                        <th>Contacto</th>
                        <th>Ocupación & Residencia</th>
                        <th>Pólizas</th>
                        <th>Scoring 360</th>
                        <th style={{ textAlign: 'right' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredClients.length === 0 ? (
                        <tr><td colSpan="7" className="text-center">No hay clientes que coincidan con la búsqueda.</td></tr>
                      ) : (
                        filteredClients
                          .slice((pageClients - 1) * pageSizeClients, pageClients * pageSizeClients)
                          .map((c) => {
                            const clientPols = policies.filter(p => p.cliente_id === c.id);
                            const p360 = c.perfil_360 || {};
                            const analisis = c.analisis || {
                              scores: { vida: 20, salud: 25, patrimonial: 15, retiro: 15 },
                              topOportunidad: { tipo: 'Seguro de Salud', score: 25 }
                            };
                            const cleanPhone = (c.telefono || '').replace(/[^0-9]/g, '');
                            const waPhone = cleanPhone.startsWith('0') ? '58' + cleanPhone.slice(1) : (cleanPhone.startsWith('58') ? cleanPhone : '58' + cleanPhone);
                            const waUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(analisis.mensajeWhatsApp || '')}`;

                            return (
                              <tr key={c.id}>
                                <td>
                                  <strong style={{ color: '#0f172a', display: 'block' }}>
                                    {c.nombre || `${c.primer_nombre} ${c.primer_apellido}`}
                                  </strong>
                                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{c.correo}</span>
                                </td>
                                <td>
                                  <span style={{ background: '#f1f5f9', padding: '0.15rem 0.45rem', borderRadius: '4px', fontWeight: 700, fontSize: '0.75rem' }}>
                                    {c.tipo_documento} {c.nro_documento}
                                  </span>
                                </td>
                                <td>
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                    <span>{c.telefono}</span>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenEditPhone(c)}
                                      title="Editar teléfono del cliente"
                                      style={{
                                        background: '#eff6ff',
                                        border: '1px solid #bfdbfe',
                                        borderRadius: '4px',
                                        color: '#1d4ed8',
                                        cursor: 'pointer',
                                        fontSize: '0.65rem',
                                        padding: '0.1rem 0.35rem',
                                        fontWeight: 800
                                      }}
                                    >
                                      ✏️
                                    </button>
                                  </div>
                                </td>
                                <td>
                                  <div style={{ fontWeight: 600, fontSize: '0.8rem', color: '#1e293b' }}>
                                    {p360.profesion_ocupacion || 'Sin especificar'}
                                  </div>
                                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                    {p360.ciudad_residencia || 'No registrada'}
                                  </div>
                                </td>
                                <td>
                                  {clientPols.length === 0 ? (
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Ninguna</span>
                                  ) : (
                                    clientPols.map(p => (
                                      <div key={p.id} style={{ fontSize: '0.75rem', margin: '0.15rem 0' }}>
                                        <strong style={{ color: 'var(--primary)' }}>{p.codigo_poliza}</strong>{' '}
                                        <span style={{ fontSize: '0.7rem', color: '#059669', fontWeight: 700 }}>({p.estado})</span>
                                      </div>
                                    ))
                                  )}
                                </td>
                                <td>
                                  <span style={{
                                    backgroundColor: '#eef2ff',
                                    color: '#4f46e5',
                                    padding: '0.2rem 0.5rem',
                                    borderRadius: '9999px',
                                    fontSize: '0.75rem',
                                    fontWeight: 800,
                                    whiteSpace: 'nowrap'
                                  }}>
                                    🔥 {analisis.topOportunidad?.tipo}
                                  </span>
                                </td>
                                <td>
                                  <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                    <button
                                      type="button"
                                      className="btn btn-primary"
                                      style={{ fontSize: '0.725rem', padding: '0.25rem 0.5rem' }}
                                      onClick={() => handleOpenProfileModal(c)}
                                    >
                                      📝 Ficha
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-secondary"
                                      style={{ fontSize: '0.725rem', padding: '0.25rem 0.5rem' }}
                                      onClick={() => handleCopyPublicLink(c.token_publico)}
                                      title="Copiar link para cliente"
                                    >
                                      🔗 Link
                                    </button>
                                    <a 
                                      href={waUrl} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      style={{
                                        background: '#10b981',
                                        color: '#ffffff',
                                        fontSize: '0.725rem',
                                        padding: '0.25rem 0.5rem',
                                        borderRadius: '6px',
                                        textDecoration: 'none',
                                        fontWeight: 800,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.25rem'
                                      }}
                                    >
                                      💬 WA
                                    </a>
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

              <PaginationControls
                currentPage={pageClients}
                totalItems={filteredClients.length}
                pageSize={pageSizeClients}
                onPageChange={setPageClients}
                onPageSizeChange={setPageSizeClients}
              />
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

              {/* LISTADO DE PÓLIZAS AGRUPADAS CON SUS CUOTAS */}
              {groupedPaymentsByPolicy.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', background: '#f8fafc', borderRadius: '8px', border: '1px dashed var(--border)' }}>
                  No hay cobros registrados con los criterios seleccionados.
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
                          onClick={() => setExpandedPolicies(prev => ({ ...prev, [groupKey]: !prev[groupKey] }))}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{
                              width: '42px',
                              height: '42px',
                              borderRadius: '8px',
                              background: group.cuotasEnRevision > 0 ? '#fef3c7' : '#e0f2fe',
                              color: group.cuotasEnRevision > 0 ? '#d97706' : '#0284c7',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '1.2rem',
                              fontWeight: 'bold'
                            }}>
                              🛡️
                            </div>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                <strong style={{ fontSize: '1.05rem', color: 'var(--primary)' }}>{group.poliza_codigo}</strong>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>• {group.cliente_nombre}</span>
                              </div>
                              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                                <strong>{group.compania_nombre}</strong> {group.plan ? `- Plan ${group.plan}` : ''} | Frecuencia: <span style={{ textTransform: 'capitalize' }}>{group.frecuencia}</span>
                              </div>
                            </div>
                          </div>

                          {/* Estadísticas de Cobro */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: group.cuotasPagadas === group.totalCuotas && group.totalCuotas > 0 ? '#16a34a' : 'inherit' }}>
                                {group.cuotasPagadas}/{group.totalCuotas} Cuotas Pagadas ({progressPercent}%)
                              </div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                Recaudado: ${group.montoTotalCobrado.toFixed(2)} de ${group.montoTotalCuotas.toFixed(2)}
                              </div>
                            </div>

                            {/* Badges de Alerta */}
                            {group.cuotasEnRevision > 0 && (
                              <span style={{ background: '#f59e0b', color: '#fff', fontSize: '0.75rem', fontWeight: 700, padding: '0.25rem 0.6rem', borderRadius: '20px' }}>
                                🟡 {group.cuotasEnRevision} por Verificar
                              </span>
                            )}

                            {group.cuotasPendientes > 0 && (
                              <span style={{ background: '#e2e8f0', color: '#475569', fontSize: '0.75rem', fontWeight: 600, padding: '0.25rem 0.6rem', borderRadius: '20px' }}>
                                ⚪ {group.cuotasPendientes} Pendientes
                              </span>
                            )}

                            {group.cuotasRechazadas > 0 && (
                              <span style={{ background: '#fee2e2', color: '#dc2626', fontSize: '0.75rem', fontWeight: 700, padding: '0.25rem 0.6rem', borderRadius: '20px' }}>
                                🔴 {group.cuotasRechazadas} Rechazadas
                              </span>
                            )}

                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                            >
                              {isExpanded ? 'Ocultar Cuotas 🔼' : `Ver Cuotas (${group.cuotas.length}) 🔽`}
                            </button>
                          </div>
                        </div>

                        {/* Desglose de Cuotas Expandible */}
                        {isExpanded && (
                          <div style={{ padding: '1rem', background: '#fafafa' }}>
                            <table className="table" style={{ margin: 0, fontSize: '0.85rem' }}>
                              <thead>
                                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                                  <th>Cuota</th>
                                  <th>Monto Cuota ($)</th>
                                  <th>Pago Reportado</th>
                                  <th>Referencia Bancaria</th>
                                  <th>Vencimiento</th>
                                  <th>Estado</th>
                                  <th style={{ textAlign: 'center' }}>Acción</th>
                                </tr>
                              </thead>
                              <tbody>
                                {group.cuotas.map((pa) => (
                                  <tr key={pa.id} style={{ background: pa.estado_pago === 'en_revision' ? '#fffbeb' : 'transparent' }}>
                                    <td>
                                      <strong>#{pa.cuota_numero || 1}/{pa.cuota_total || group.totalCuotas || 1}</strong>
                                    </td>
                                    <td>
                                      <strong>${parseFloat(pa.monto).toFixed(2)}</strong>
                                    </td>
                                    <td>
                                      {pa.monto_reportado ? (
                                        <div>
                                          <strong style={{ color: '#0284c7' }}>
                                            {pa.moneda_pago === 'USD' ? '$' : 'Bs. '}
                                            {parseFloat(pa.monto_reportado).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                                          </strong>
                                          {pa.moneda_pago && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '0.2rem' }}>({pa.moneda_pago})</span>}
                                        </div>
                                      ) : (
                                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                                      )}
                                    </td>
                                    <td>
                                      {pa.referencia ? (
                                        <code style={{ fontWeight: 700, background: '#f1f5f9', padding: '0.15rem 0.35rem', borderRadius: '4px' }}>
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
                                             {isVencido && <span style={{ fontSize: '0.72rem', color: '#dc2626', display: 'block', fontWeight: 800 }}>Vencida (2:00 PM)</span>}
                                           </span>
                                         );
                                       })() : (
                                         <span style={{ color: 'var(--text-muted)' }}>Inmediato</span>
                                       )}
                                    </td>
                                    <td>
                                      {pa.estado_pago === 'pagado' && (
                                        <span style={{ background: '#dcfce7', color: '#16a34a', fontWeight: 700, fontSize: '0.75rem', padding: '0.2rem 0.4rem', borderRadius: '4px' }}>
                                          🟢 Verificado y Pagado
                                        </span>
                                      )}
                                      {pa.estado_pago === 'en_revision' && (
                                        <span style={{ background: '#fef3c7', color: '#d97706', fontWeight: 700, fontSize: '0.75rem', padding: '0.2rem 0.4rem', borderRadius: '4px' }}>
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
              <PaginationControls
                currentPage={pagePayments}
                totalItems={groupedPaymentsByPolicy.length}
                pageSize={pageSizePayments}
                onPageChange={setPagePayments}
                onPageSizeChange={setPageSizePayments}
              />
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
                      <th>Deducible ($)</th>
                      <th>Prima Anual ($)</th>
                      <th>Frecuencia</th>
                      <th>Estado</th>
                      <th>Motivo Rechazo</th>
                      <th style={{ textAlign: 'center', width: '130px' }}>Estado Edición</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPolicies.length === 0 ? (
                      <tr><td colSpan="11" className="text-center">No hay pólizas que coincidan con la búsqueda.</td></tr>
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

          {/* TAB: SOLICITAR EMISIÓN PÓLIZA */}
          {activeTab === 'solicitar-poliza' && (() => {
            const selectedClientObj = clients.find(c => String(c.id) === String(policyForm.cliente_id));
            const clientAge = policyForm.edad_calculada ?? (selectedClientObj?.fecha_nacimiento ? calculateAge(selectedClientObj.fecha_nacimiento) : null);

            // Filtrar planes según aseguradora seleccionada
            const availablePlans = getAvailablePlans(policyForm.compania_id, tariffs, companies);

            // Filtrar sumas aseguradas según aseguradora y plan seleccionados
            const availableSums = getAvailableSums(policyForm.compania_id, policyForm.plan, tariffs, companies);

            const activeTariff = findMatchingTariff(policyForm.compania_id, policyForm.plan, policyForm.suma_asegurada, clientAge);
            const primaNum = parseFloat(policyForm.prima_anual || activeTariff?.prima || 0);

            return (
              <div className="card" style={{ maxWidth: '650px', margin: '0 auto', padding: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '1.75rem' }}>📋</span>
                  <h3 className="card-title" style={{ margin: 0 }}>Solicitar Emisión de Nueva Póliza</h3>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.75rem' }}>
                  Seleccione el cliente y el plan del tarifario oficial. Los montos de <strong>Suma Asegurada</strong> y <strong>Prima Anual</strong> se obtienen automáticamente del tarifario según la edad del asegurado.
                </p>

                <form onSubmit={handleRequestPolicy}>
                  {/* 1. Seleccionar Cliente */}
                  <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                    <label className="form-label">1. Asegurado (Cliente Asignado) *</label>
                    <select
                      className="form-input"
                      value={policyForm.cliente_id}
                      onChange={e => handlePolicyClientChange(e.target.value)}
                      required
                    >
                      <option value="">-- Elija un cliente asignado --</option>
                      {clients.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.nombre} ({c.nro_documento}) {c.fecha_nacimiento ? `- ${calculateAge(c.fecha_nacimiento)} años` : ''}
                        </option>
                      ))}
                    </select>
                    {selectedClientObj && (
                      <span style={{ fontSize: '0.8rem', color: '#2563eb', marginTop: '0.35rem', display: 'block' }}>
                        👤 Edad del cliente: <strong>{clientAge !== null ? `${clientAge} años` : 'No registrada'}</strong> | Tel: {selectedClientObj.telefono || selectedClientObj.numero_celular || 'N/A'}
                      </span>
                    )}
                  </div>

                  {/* 2. Compañía Aseguradora */}
                  <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                    <label className="form-label">2. Compañía Aseguradora *</label>
                    <select
                      className="form-input"
                      value={policyForm.compania_id}
                      onChange={e => handlePolicyCompanyChange(e.target.value)}
                      required
                    >
                      <option value="">-- Seleccione Aseguradora --</option>
                      {companies.map(c => (
                        <option key={c.id} value={c.id}>{c.nombre}</option>
                      ))}
                    </select>
                  </div>

                  {/* 3. Plan del Tarifario */}
                  <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                    <label className="form-label">3. Plan del Tarifario *</label>
                    <select
                      className="form-input"
                      value={policyForm.plan}
                      onChange={e => handlePolicyPlanChange(e.target.value)}
                      disabled={!policyForm.compania_id}
                      required
                    >
                      <option value="">
                        {!policyForm.compania_id ? '-- Primero elija una aseguradora --' : '-- Seleccione Plan del Tarifario --'}
                      </option>
                      {availablePlans.map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>

                  {/* 4. Suma Asegurada (Select dinámico) */}
                  <div className="form-grid" style={{ marginBottom: '1.25rem' }}>
                    <div className="form-group">
                      <label className="form-label">4. Suma Asegurada del Tarifario *</label>
                      <select
                        className="form-input"
                        value={policyForm.suma_asegurada}
                        onChange={e => handlePolicySumChange(e.target.value)}
                        disabled={!policyForm.plan}
                        required
                      >
                        <option value="">
                          {!policyForm.plan ? '-- Elija un plan --' : '-- Seleccione Suma Asegurada --'}
                        </option>
                        {availableSums.map(s => (
                          <option key={s} value={s}>${s.toLocaleString('en-US')}</option>
                        ))}
                      </select>
                    </div>

                    {/* 5. Prima Anual (Auto-calculada con el tarifario) */}
                    <div className="form-group">
                      <label className="form-label">Prima Anual ($ USD) *</label>
                      <input
                        type="number"
                        step="0.01"
                        className="form-input"
                        value={policyForm.prima_anual}
                        onChange={e => setPolicyForm({...policyForm, prima_anual: e.target.value})}
                        placeholder={activeTariff ? `$${activeTariff.prima}` : '0.00'}
                        style={{ backgroundColor: '#f0fdf4', borderColor: '#86efac', fontWeight: 700, color: '#166534' }}
                        required
                      />
                      <span style={{ fontSize: '0.75rem', color: '#15803d', marginTop: '0.25rem', display: 'block' }}>
                        {activeTariff ? `✓ Obtenido del tarifario (Rango: ${activeTariff.edad_min}-${activeTariff.edad_max} años)` : 'Se autocalcula según el plan y edad'}
                      </span>
                    </div>
                  </div>

                  {/* Tarjeta de Resumen y Beneficios del Tarifario */}
                  {activeTariff && (
                    <div style={{ backgroundColor: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <span style={{ fontWeight: 700, color: 'var(--primary)' }}>
                          🛡️ {activeTariff.compania_nombre || 'Aseguradora'} - {activeTariff.plan}
                        </span>
                        <span style={{ backgroundColor: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '4px', fontWeight: 600, fontSize: '0.75rem' }}>
                          Suma: ${parseFloat(activeTariff.suma_asegurada).toLocaleString('en-US')}
                        </span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        <div>Deducible: <strong style={{ color: (activeTariff.deducible && parseFloat(activeTariff.deducible) > 0) ? '#b45309' : '#15803d' }}>{(activeTariff.deducible && parseFloat(activeTariff.deducible) > 0) ? `$${Number(activeTariff.deducible).toLocaleString('en-US')}` : '$0 (Sin deducible)'}</strong></div>
                        <div>Maternidad: <strong>{activeTariff.maternidad_suma || activeTariff.maternidad_costo || 'No'}</strong></div>
                        <div>Asist. Intl: <strong>{activeTariff.asist_intl_suma || activeTariff.asist_intl_costo || 'No'}</strong></div>
                        <div>Funeral: <strong>{activeTariff.funeral_suma || activeTariff.funeral_costo || 'No'}</strong></div>
                        <div>Forma Pago: <strong>{activeTariff.pago || 'Varios'}</strong></div>
                      </div>
                    </div>
                  )}

                  {/* 6. Frecuencia de Pago */}
                  <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                    <label className="form-label">5. Frecuencia de Pago *</label>
                    <select
                      className="form-input"
                      value={policyForm.frecuencia_pago || 'contado'}
                      onChange={e => setPolicyForm({...policyForm, frecuencia_pago: e.target.value})}
                      required
                    >
                      <option value="contado">
                        Pago Anual / Contado (1 cuota de ${primaNum > 0 ? primaNum.toFixed(2) : '0.00'})
                      </option>
                      <option value="semestral">
                        Pago Semestral (2 cuotas de ${primaNum > 0 ? (primaNum / 2).toFixed(2) : '0.00'})
                      </option>
                      <option value="cuatrimestral">
                        Pago Cuatrimestral (3 cuotas de ${primaNum > 0 ? (primaNum / 3).toFixed(2) : '0.00'})
                      </option>
                      <option value="trimestral">
                        Pago Trimestral (4 cuotas de ${primaNum > 0 ? (primaNum / 4).toFixed(2) : '0.00'})
                      </option>
                      <option value="mensual">
                        Pago Mensual (12 cuotas de ${primaNum > 0 ? (primaNum / 12).toFixed(2) : '0.00'})
                      </option>
                    </select>
                  </div>

                  <button 
                    type="submit" 
                    className="btn btn-primary" 
                    style={{ width: '100%', padding: '0.85rem', fontWeight: 700, fontSize: '1rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }} 
                    disabled={loading}
                  >
                    {loading ? 'Procesando...' : '🚀 Enviar Solicitud de Póliza al Administrador'}
                  </button>
                </form>
              </div>
            );
          })()}

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
                  Potencia tus habilidades de ventas, conoce en detalle nuestros ramos de seguros y domina el uso de la plataforma Protección y Seguros 360.
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
                      <label className="form-label">Referencia * (últimos 6)</label>
                      <input 
                        type="text" 
                        inputMode="numeric"
                        maxLength={6}
                        className="form-input" 
                        placeholder="123456"
                        value={reportPayForm.referencia} 
                        onChange={e => {
                          const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                          setReportPayForm({ ...reportPayForm, referencia: val });
                        }}
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

          {/* MODAL FICHA 360 DEL CLIENTE */}
          {profileModalClient && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.75)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 9999,
              padding: '1rem'
            }}>
              <div style={{
                backgroundColor: '#ffffff',
                borderRadius: '20px',
                boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.35)',
                width: '100%',
                maxWidth: '880px',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                border: '1px solid #e2e8f0'
              }}>
                
                {/* Modal Header */}
                <div style={{
                  background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 50%, #2563eb 100%)',
                  padding: '1.25rem 1.75rem',
                  color: '#ffffff',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '14px',
                      backgroundColor: 'rgba(255, 255, 255, 0.15)',
                      border: '1px solid rgba(255, 255, 255, 0.25)',
                      color: '#ffffff',
                      fontWeight: 900,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.1rem',
                      boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.2)'
                    }}>
                      {(profileModalClient.nombre || 'C').split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                        <span style={{
                          backgroundColor: 'rgba(59, 130, 246, 0.25)',
                          color: '#bfdbfe',
                          border: '1px solid rgba(147, 197, 253, 0.4)',
                          fontSize: '0.65rem',
                          fontWeight: 800,
                          padding: '0.15rem 0.5rem',
                          borderRadius: '9999px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px'
                        }}>
                          Ficha 360 del Asegurado
                        </span>
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>• Modo Asesor</span>
                      </div>
                      <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#ffffff' }}>
                        {profileModalClient.nombre || `${profileModalClient.primer_nombre} ${profileModalClient.primer_apellido}`}
                      </h3>
                      <p style={{ fontSize: '0.75rem', color: '#cbd5e1', margin: '0.15rem 0 0 0' }}>
                        {profileModalClient.tipo_documento} {profileModalClient.nro_documento} • {profileModalClient.correo} • {profileModalClient.telefono}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setProfileModalClient(null)}
                    style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '10px',
                      backgroundColor: 'rgba(255, 255, 255, 0.12)',
                      border: 'none',
                      color: '#ffffff',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.9rem',
                      fontWeight: 700,
                      transition: 'background-color 0.2s ease'
                    }}
                  >
                    ✕
                  </button>
                </div>

                {/* Subheader / Segmented Pill Tabs */}
                <div style={{
                  backgroundColor: '#f8fafc',
                  padding: '0.75rem 1.5rem',
                  borderBottom: '1px solid #e2e8f0',
                  overflowX: 'auto',
                  display: 'flex',
                  gap: '0.5rem'
                }}>
                  <button
                    type="button"
                    onClick={() => setProfileModalTab('socio')}
                    style={{
                      padding: '0.5rem 1rem',
                      fontSize: '0.8rem',
                      fontWeight: 800,
                      borderRadius: '10px',
                      border: profileModalTab === 'socio' ? 'none' : '1px solid #e2e8f0',
                      cursor: 'pointer',
                      backgroundColor: profileModalTab === 'socio' ? 'var(--primary)' : '#ffffff',
                      color: profileModalTab === 'socio' ? '#ffffff' : '#475569',
                      boxShadow: profileModalTab === 'socio' ? '0 2px 6px rgba(30, 58, 138, 0.25)' : 'none',
                      transition: 'all 0.2s ease',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    📌 Sociodemográfico
                  </button>
                  <button
                    type="button"
                    onClick={() => setProfileModalTab('familiar')}
                    style={{
                      padding: '0.5rem 1rem',
                      fontSize: '0.8rem',
                      fontWeight: 800,
                      borderRadius: '10px',
                      border: profileModalTab === 'familiar' ? 'none' : '1px solid #e2e8f0',
                      cursor: 'pointer',
                      backgroundColor: profileModalTab === 'familiar' ? 'var(--primary)' : '#ffffff',
                      color: profileModalTab === 'familiar' ? '#ffffff' : '#475569',
                      boxShadow: profileModalTab === 'familiar' ? '0 2px 6px rgba(30, 58, 138, 0.25)' : 'none',
                      transition: 'all 0.2s ease',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    👨‍👩‍👧 Familiar
                  </button>
                  <button
                    type="button"
                    onClick={() => setProfileModalTab('patrimonial')}
                    style={{
                      padding: '0.5rem 1rem',
                      fontSize: '0.8rem',
                      fontWeight: 800,
                      borderRadius: '10px',
                      border: profileModalTab === 'patrimonial' ? 'none' : '1px solid #e2e8f0',
                      cursor: 'pointer',
                      backgroundColor: profileModalTab === 'patrimonial' ? '#059669' : '#ffffff',
                      color: profileModalTab === 'patrimonial' ? '#ffffff' : '#475569',
                      boxShadow: profileModalTab === 'patrimonial' ? '0 2px 6px rgba(5, 150, 105, 0.25)' : 'none',
                      transition: 'all 0.2s ease',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    💼 Patrimonio (Privado)
                  </button>
                  <button
                    type="button"
                    onClick={() => setProfileModalTab('conductual')}
                    style={{
                      padding: '0.5rem 1rem',
                      fontSize: '0.8rem',
                      fontWeight: 800,
                      borderRadius: '10px',
                      border: profileModalTab === 'conductual' ? 'none' : '1px solid #e2e8f0',
                      cursor: 'pointer',
                      backgroundColor: profileModalTab === 'conductual' ? '#7c3aed' : '#ffffff',
                      color: profileModalTab === 'conductual' ? '#ffffff' : '#475569',
                      boxShadow: profileModalTab === 'conductual' ? '0 2px 6px rgba(124, 58, 237, 0.25)' : 'none',
                      transition: 'all 0.2s ease',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    🎯 Hábitos & Seguros
                  </button>
                  <button
                    type="button"
                    onClick={() => setProfileModalTab('notas')}
                    style={{
                      padding: '0.5rem 1rem',
                      fontSize: '0.8rem',
                      fontWeight: 800,
                      borderRadius: '10px',
                      border: profileModalTab === 'notas' ? 'none' : '1px solid #e2e8f0',
                      cursor: 'pointer',
                      backgroundColor: profileModalTab === 'notas' ? '#d97706' : '#ffffff',
                      color: profileModalTab === 'notas' ? '#ffffff' : '#475569',
                      boxShadow: profileModalTab === 'notas' ? '0 2px 6px rgba(217, 119, 6, 0.25)' : 'none',
                      transition: 'all 0.2s ease',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    📝 Bitácora Asesor
                  </button>
                </div>

                {/* Form Body with Scroll */}
                <form onSubmit={handleSaveProfile} style={{ flex: 1, overflowY: 'auto', padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  
                  {/* TAB 1: SOCIODEMOGRÁFICO */}
                  {profileModalTab === 'socio' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                      <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
                        <h4 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                          Datos Sociodemográficos y Residencia
                        </h4>
                        <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.2rem 0 0 0' }}>
                          Información sobre la ocupación, nivel de educación y lugar de residencia del asegurado.
                        </p>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>Teléfono / WhatsApp de Contacto</label>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <select
                              value={profileForm.codigo_area || '0414'}
                              onChange={e => setProfileForm({ ...profileForm, codigo_area: e.target.value })}
                              className="form-input"
                              style={{ width: '90px', margin: 0, padding: '0.65rem 0.6rem', borderRadius: '10px', fontWeight: 700, background: '#f8fafc' }}
                            >
                              <option value="0412">0412</option>
                              <option value="0414">0414</option>
                              <option value="0424">0424</option>
                              <option value="0416">0416</option>
                              <option value="0426">0426</option>
                            </select>
                            <input
                              type="tel"
                              value={profileForm.numero_celular || ''}
                              onChange={e => setProfileForm({ ...profileForm, numero_celular: e.target.value.replace(/\D/g, '') })}
                              placeholder="1234567"
                              className="form-input"
                              style={{ flex: 1, margin: 0, padding: '0.65rem 0.9rem', borderRadius: '10px' }}
                            />
                          </div>
                        </div>

                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>Profesión u Oficio</label>
                          <input
                            type="text"
                            value={profileForm.profesion_ocupacion}
                            onChange={e => setProfileForm({ ...profileForm, profesion_ocupacion: e.target.value })}
                            placeholder="Ej: Médico Cirujano, Ingeniero Civil..."
                            className="form-input"
                            style={{ margin: 0, padding: '0.65rem 0.9rem', borderRadius: '10px' }}
                          />
                        </div>

                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>Empresa / Lugar de Trabajo</label>
                          <input
                            type="text"
                            value={profileForm.empresa_trabajo}
                            onChange={e => setProfileForm({ ...profileForm, empresa_trabajo: e.target.value })}
                            placeholder="Ej: Clínica Santa Sofía, Independiente..."
                            className="form-input"
                            style={{ margin: 0, padding: '0.65rem 0.9rem', borderRadius: '10px' }}
                          />
                        </div>

                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>Nivel Educativo</label>
                          <select
                            value={profileForm.nivel_educativo}
                            onChange={e => setProfileForm({ ...profileForm, nivel_educativo: e.target.value })}
                            className="form-input"
                            style={{ margin: 0, padding: '0.65rem 0.9rem', borderRadius: '10px', background: '#fff' }}
                          >
                            <option value="Bachillerato">Bachillerato</option>
                            <option value="Técnico Superior">Técnico Superior</option>
                            <option value="Universitario">Universitario</option>
                            <option value="Especialización / Master">Especialización / Master</option>
                            <option value="Doctorado">Doctorado</option>
                          </select>
                        </div>

                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>Ciudad de Residencia</label>
                          <input
                            type="text"
                            value={profileForm.ciudad_residencia}
                            onChange={e => setProfileForm({ ...profileForm, ciudad_residencia: e.target.value })}
                            placeholder="Ej: Caracas, Lechería, Valencia..."
                            className="form-input"
                            style={{ margin: 0, padding: '0.65rem 0.9rem', borderRadius: '10px' }}
                          />
                        </div>

                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>Zona / Urbanización</label>
                          <input
                            type="text"
                            value={profileForm.zona_sector}
                            onChange={e => setProfileForm({ ...profileForm, zona_sector: e.target.value })}
                            placeholder="Ej: Altamira, Los Palos Grandes..."
                            className="form-input"
                            style={{ margin: 0, padding: '0.65rem 0.9rem', borderRadius: '10px' }}
                          />
                        </div>

                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>Tipo de Vivienda</label>
                          <select
                            value={profileForm.tipo_vivienda}
                            onChange={e => setProfileForm({ ...profileForm, tipo_vivienda: e.target.value })}
                            className="form-input"
                            style={{ margin: 0, padding: '0.65rem 0.9rem', borderRadius: '10px', background: '#fff' }}
                          >
                            <option value="Propia">Casa / Apartamento Propio</option>
                            <option value="Alquilada">Alquilada</option>
                            <option value="Familiar">Familiar / Prestada</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 2: FAMILIAR */}
                  {profileModalTab === 'familiar' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                      <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
                        <h4 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                          Estructura y Dependientes Familiares
                        </h4>
                        <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.2rem 0 0 0' }}>
                          Variables determinantes para calcular la cobertura ideal de Seguro de Vida y Salud Colectivo.
                        </p>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>Estado Civil</label>
                          <select
                            value={profileForm.estado_civil}
                            onChange={e => setProfileForm({ ...profileForm, estado_civil: e.target.value })}
                            className="form-input"
                            style={{ margin: 0, padding: '0.65rem 0.9rem', borderRadius: '10px', background: '#fff' }}
                          >
                            <option value="Soltero">Soltero(a)</option>
                            <option value="Casado">Casado(a)</option>
                            <option value="Divorciado">Divorciado(a)</option>
                            <option value="Viudo">Viudo(a)</option>
                            <option value="Unión Libre">Unión Libre</option>
                          </select>
                        </div>

                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>Nombre de Cónyuge (Opcional)</label>
                          <input
                            type="text"
                            value={profileForm.nombre_conyuge}
                            onChange={e => setProfileForm({ ...profileForm, nombre_conyuge: e.target.value })}
                            placeholder="Ej: María González"
                            className="form-input"
                            style={{ margin: 0, padding: '0.65rem 0.9rem', borderRadius: '10px' }}
                          />
                        </div>

                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>Número de Hijos</label>
                          <input
                            type="number"
                            min="0"
                            max="20"
                            value={profileForm.numero_hijos}
                            onChange={e => setProfileForm({ ...profileForm, numero_hijos: parseInt(e.target.value) || 0 })}
                            className="form-input"
                            style={{ margin: 0, padding: '0.65rem 0.9rem', borderRadius: '10px' }}
                          />
                        </div>

                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>Edades de los Hijos</label>
                          <input
                            type="text"
                            value={profileForm.edades_hijos}
                            onChange={e => setProfileForm({ ...profileForm, edades_hijos: e.target.value })}
                            placeholder="Ej: 4, 11, 15 años"
                            className="form-input"
                            style={{ margin: 0, padding: '0.65rem 0.9rem', borderRadius: '10px' }}
                          />
                        </div>

                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>Dependientes Económicos Totales</label>
                          <input
                            type="number"
                            min="0"
                            max="20"
                            value={profileForm.dependientes_economicos}
                            onChange={e => setProfileForm({ ...profileForm, dependientes_economicos: parseInt(e.target.value) || 0 })}
                            className="form-input"
                            style={{ margin: 0, padding: '0.65rem 0.9rem', borderRadius: '10px' }}
                          />
                          <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.25rem', display: 'block' }}>
                            Hijos, padres mayores o dependientes directos.
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <label style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            padding: '0.85rem 1rem',
                            backgroundColor: '#f8fafc',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            color: '#1e293b',
                            width: '100%'
                          }}>
                            <input
                              type="checkbox"
                              checked={profileForm.sosten_principal}
                              onChange={e => setProfileForm({ ...profileForm, sosten_principal: e.target.checked })}
                              style={{ width: '18px', height: '18px', accentColor: 'var(--primary)' }}
                            />
                            ¿Es el principal sostén económico del hogar?
                          </label>
                        </div>

                        <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                          <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>Prioridad Familiar Declarada</label>
                          <input
                            type="text"
                            value={profileForm.prioridad_familiar}
                            onChange={e => setProfileForm({ ...profileForm, prioridad_familiar: e.target.value })}
                            placeholder="Ej: Asegurar educación universitaria de los hijos, tranquilidad en caso de falta del padre..."
                            className="form-input"
                            style={{ margin: 0, padding: '0.65rem 0.9rem', borderRadius: '10px' }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 3: PATRIMONIAL & FINANZAS */}
                  {profileModalTab === 'patrimonial' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                      <div style={{
                        padding: '1rem 1.25rem',
                        backgroundColor: '#ecfdf5',
                        borderRadius: '14px',
                        border: '1px solid #a7f3d0',
                        fontSize: '0.8rem',
                        color: '#065f46',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem'
                      }}>
                        <span style={{ fontSize: '1.5rem' }}>🔒</span>
                        <div>
                          <strong style={{ display: 'block', fontWeight: 800, color: '#047857' }}>
                            Información de Uso Interno Confidencial
                          </strong>
                          <span>Estos datos financieros no son visibles por el cliente. Se emplean para calibrar scoring de venta cruzada y pólizas de vida/patrimonio.</span>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>Rango Estimado de Ingresos Mensuales</label>
                          <select
                            value={profileForm.rango_ingresos}
                            onChange={e => setProfileForm({ ...profileForm, rango_ingresos: e.target.value })}
                            className="form-input"
                            style={{ margin: 0, padding: '0.65rem 0.9rem', borderRadius: '10px', background: '#fff' }}
                          >
                            <option value="Menos de $1,000">Menos de $1,000 USD</option>
                            <option value="$1,000 - $3,000">$1,000 - $3,000 USD</option>
                            <option value="$3,000 - $6,000">$3,000 - $6,000 USD</option>
                            <option value="Más de $6,000">Más de $6,000 USD (Alto Patrimonio)</option>
                          </select>
                        </div>

                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>Capacidad Estimada de Ahorro</label>
                          <select
                            value={profileForm.capacidad_ahorro}
                            onChange={e => setProfileForm({ ...profileForm, capacidad_ahorro: e.target.value })}
                            className="form-input"
                            style={{ margin: 0, padding: '0.65rem 0.9rem', borderRadius: '10px', background: '#fff' }}
                          >
                            <option value="Baja">Baja (Menos del 10% de ingresos)</option>
                            <option value="Media">Media (10% - 25% de ingresos)</option>
                            <option value="Alta">Alta (Más del 25% de ingresos)</option>
                          </select>
                        </div>

                        {/* Inmuebles */}
                        <div style={{
                          padding: '1.2rem',
                          backgroundColor: '#f8fafc',
                          borderRadius: '14px',
                          border: '1px solid #e2e8f0',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.75rem'
                        }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontWeight: 800, fontSize: '0.85rem', color: '#0f172a' }}>
                            <input
                              type="checkbox"
                              checked={profileForm.posee_inmuebles}
                              onChange={e => setProfileForm({ ...profileForm, posee_inmuebles: e.target.checked })}
                              style={{ width: '18px', height: '18px', accentColor: '#059669' }}
                            />
                            🏠 ¿Posee Inmuebles / Bienes Raíces?
                          </label>
                          {profileForm.posee_inmuebles && (
                            <div>
                              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: '0.25rem' }}>Cantidad de Inmuebles</label>
                              <input
                                type="number"
                                min="1"
                                max="50"
                                value={profileForm.cantidad_inmuebles}
                                onChange={e => setProfileForm({ ...profileForm, cantidad_inmuebles: parseInt(e.target.value) || 1 })}
                                className="form-input"
                                style={{ margin: 0, padding: '0.5rem 0.75rem', borderRadius: '8px' }}
                              />
                            </div>
                          )}
                        </div>

                        {/* Vehículos */}
                        <div style={{
                          padding: '1.2rem',
                          backgroundColor: '#f8fafc',
                          borderRadius: '14px',
                          border: '1px solid #e2e8f0',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.75rem'
                        }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontWeight: 800, fontSize: '0.85rem', color: '#0f172a' }}>
                            <input
                              type="checkbox"
                              checked={profileForm.posee_vehiculos}
                              onChange={e => setProfileForm({ ...profileForm, posee_vehiculos: e.target.checked })}
                              style={{ width: '18px', height: '18px', accentColor: '#059669' }}
                            />
                            🚗 ¿Posee Vehículos Automotores?
                          </label>
                          {profileForm.posee_vehiculos && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                              <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: '0.25rem' }}>Cantidad de Vehículos</label>
                                <input
                                  type="number"
                                  min="1"
                                  max="20"
                                  value={profileForm.cantidad_vehiculos}
                                  onChange={e => setProfileForm({ ...profileForm, cantidad_vehiculos: parseInt(e.target.value) || 1 })}
                                  className="form-input"
                                  style={{ margin: 0, padding: '0.5rem 0.75rem', borderRadius: '8px' }}
                                />
                              </div>
                              <div>
                                <input
                                  type="text"
                                  placeholder="Detalle: Toyota Fortuner 2022, Corolla..."
                                  value={profileForm.detalles_vehiculos}
                                  onChange={e => setProfileForm({ ...profileForm, detalles_vehiculos: e.target.value })}
                                  className="form-input"
                                  style={{ margin: 0, padding: '0.5rem 0.75rem', borderRadius: '8px' }}
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Negocio / Empresa */}
                        <div style={{
                          padding: '1.2rem',
                          backgroundColor: '#f8fafc',
                          borderRadius: '14px',
                          border: '1px solid #e2e8f0',
                          gridColumn: '1 / -1',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.75rem'
                        }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontWeight: 800, fontSize: '0.85rem', color: '#0f172a' }}>
                            <input
                              type="checkbox"
                              checked={profileForm.posee_empresa_negocio}
                              onChange={e => setProfileForm({ ...profileForm, posee_empresa_negocio: e.target.checked })}
                              style={{ width: '18px', height: '18px', accentColor: '#059669' }}
                            />
                            🏢 ¿Es Dueño de Empresa, Comercio o Negocio Propio?
                          </label>
                          {profileForm.posee_empresa_negocio && (
                            <div>
                              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: '0.25rem' }}>Ramo de la Empresa / Nro. Empleados</label>
                              <input
                                type="text"
                                placeholder="Ej: Distribuidora de Alimentos, 20 empleados"
                                value={profileForm.nombre_empresa_ramo}
                                onChange={e => setProfileForm({ ...profileForm, nombre_empresa_ramo: e.target.value })}
                                className="form-input"
                                style={{ margin: 0, padding: '0.5rem 0.75rem', borderRadius: '8px' }}
                              />
                            </div>
                          )}
                        </div>

                        {/* Hipotecas / Deudas */}
                        <div style={{ gridColumn: '1 / -1' }}>
                          <label style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            padding: '1rem',
                            backgroundColor: '#f8fafc',
                            borderRadius: '14px',
                            border: '1px solid #e2e8f0',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            color: '#1e293b'
                          }}>
                            <input
                              type="checkbox"
                              checked={profileForm.tiene_hipoteca_deuda}
                              onChange={e => setProfileForm({ ...profileForm, tiene_hipoteca_deuda: e.target.checked })}
                              style={{ width: '18px', height: '18px', accentColor: '#059669' }}
                            />
                            💳 ¿Posee deudas, hipotecas o créditos comerciales activos? (Alto potencial de Seguro de Vida Desgravamen)
                          </label>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 4: CONDUCTUAL & HÁBITOS */}
                  {profileModalTab === 'conductual' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                      <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
                        <h4 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                          Hábitos, Estilo de Vida y Preferencias
                        </h4>
                        <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.2rem 0 0 0' }}>
                          Información conductual para afinar recomendaciones y canal de comunicación ideal.
                        </p>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>Frecuencia de Viajes</label>
                          <select
                            value={profileForm.frecuencia_viajes}
                            onChange={e => setProfileForm({ ...profileForm, frecuencia_viajes: e.target.value })}
                            className="form-input"
                            style={{ margin: 0, padding: '0.65rem 0.9rem', borderRadius: '10px', background: '#fff' }}
                          >
                            <option value="No viaja">Rara vez viaja</option>
                            <option value="Nacional frecuente">Viajes nacionales frecuentes</option>
                            <option value="Internacional ocasional">Internacional (1-2 veces al año)</option>
                            <option value="Internacional frecuente">Internacional frecuente (Múltiples al año)</option>
                          </select>
                        </div>

                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>Práctica de Deportes / Fitness</label>
                          <select
                            value={profileForm.practica_deportes}
                            onChange={e => setProfileForm({ ...profileForm, practica_deportes: e.target.value })}
                            className="form-input"
                            style={{ margin: 0, padding: '0.65rem 0.9rem', borderRadius: '10px', background: '#fff' }}
                          >
                            <option value="Ninguno">Sedentario / No habitual</option>
                            <option value="Ocasional">Deporte recreativo ocasional</option>
                            <option value="Frecuente">Gimnasio / Running habitual</option>
                            <option value="Alto impacto">Deportes extremos o alto impacto</option>
                          </select>
                        </div>

                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>Hábito Tabáquico</label>
                          <select
                            value={profileForm.fumador}
                            onChange={e => setProfileForm({ ...profileForm, fumador: e.target.value })}
                            className="form-input"
                            style={{ margin: 0, padding: '0.65rem 0.9rem', borderRadius: '10px', background: '#fff' }}
                          >
                            <option value="No fumador">No fumador</option>
                            <option value="Fumador social">Fumador social</option>
                            <option value="Fumador habitual">Fumador habitual</option>
                          </select>
                        </div>

                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>Perfil de Aversión al Riesgo</label>
                          <select
                            value={profileForm.perfil_riesgo}
                            onChange={e => setProfileForm({ ...profileForm, perfil_riesgo: e.target.value })}
                            className="form-input"
                            style={{ margin: 0, padding: '0.65rem 0.9rem', borderRadius: '10px', background: '#fff' }}
                          >
                            <option value="Conservador">Conservador (Prioriza seguridad y respaldo)</option>
                            <option value="Moderado">Moderado (Balance costo / cobertura)</option>
                            <option value="Abierto">Abierto / Inversionista</option>
                          </select>
                        </div>

                        <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                          <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>Área de Mayor Interés de Cobertura</label>
                          <select
                            value={profileForm.interes_principal}
                            onChange={e => setProfileForm({ ...profileForm, interes_principal: e.target.value })}
                            className="form-input"
                            style={{ margin: 0, padding: '0.65rem 0.9rem', borderRadius: '10px', background: '#fff', fontWeight: 700, color: 'var(--primary)' }}
                          >
                            <option value="Salud Integral">🏥 Salud Integral (Atención médica y emergencias)</option>
                            <option value="Protección Familiar (Vida)">👨‍👩‍👧 Protección Familiar & Futuro (Seguro de Vida)</option>
                            <option value="Patrimonio y Vehículos">🚗 Cobertura Patrimonial (Vehículo, Hogar, PYME)</option>
                            <option value="Ahorro para Retiro">📈 Plan de Ahorro para Retiro e Inversión</option>
                          </select>
                        </div>

                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>Canal de Contacto Preferido</label>
                          <select
                            value={profileForm.canal_contacto}
                            onChange={e => setProfileForm({ ...profileForm, canal_contacto: e.target.value })}
                            className="form-input"
                            style={{ margin: 0, padding: '0.65rem 0.9rem', borderRadius: '10px', background: '#fff' }}
                          >
                            <option value="WhatsApp">💬 WhatsApp</option>
                            <option value="Llamada">📞 Llamada Telefónica</option>
                            <option value="Correo">✉️ Correo Electrónico</option>
                            <option value="Presencial">🤝 Reunión Presencial</option>
                          </select>
                        </div>

                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>Horario Preferido</label>
                          <select
                            value={profileForm.horario_contacto}
                            onChange={e => setProfileForm({ ...profileForm, horario_contacto: e.target.value })}
                            className="form-input"
                            style={{ margin: 0, padding: '0.65rem 0.9rem', borderRadius: '10px', background: '#fff' }}
                          >
                            <option value="Mañana (8:00 AM - 12:00 PM)">Mañana (8:00 AM - 12:00 PM)</option>
                            <option value="Tarde (1:00 PM - 5:00 PM)">Tarde (1:00 PM - 5:00 PM)</option>
                            <option value="Noche (5:00 PM - 8:00 PM)">Noche (5:00 PM - 8:00 PM)</option>
                            <option value="Indiferente">Indiferente / Flexible</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 5: NOTAS DEL ASESOR */}
                  {profileModalTab === 'notas' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                      <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
                        <h4 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                          Bitácora y Notas del Asesor
                        </h4>
                        <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.2rem 0 0 0' }}>
                          Anota acuerdos verbales, fechas clave de renovación o detalles para seguimiento comercial.
                        </p>
                      </div>

                      <div className="form-group" style={{ margin: 0 }}>
                        <textarea
                          rows={8}
                          value={profileForm.notas_asesor}
                          onChange={e => setProfileForm({ ...profileForm, notas_asesor: e.target.value })}
                          placeholder="Ej: El cliente solicitó cotización de vida en septiembre. Muy interesado en asegurar el vehículo de su esposa en la próxima renovación..."
                          className="form-input"
                          style={{ margin: 0, padding: '1rem', borderRadius: '12px', minHeight: '180px', fontFamily: 'inherit', fontSize: '0.875rem' }}
                        ></textarea>
                      </div>
                    </div>
                  )}

                  {/* Modal Footer */}
                  <div style={{
                    paddingTop: '1.25rem',
                    borderTop: '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: '0.75rem'
                  }}>
                    <button
                      type="button"
                      onClick={() => setProfileModalClient(null)}
                      className="btn btn-secondary"
                      style={{ padding: '0.6rem 1.2rem', fontSize: '0.85rem' }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={savingProfile}
                      className="btn btn-primary"
                      style={{
                        padding: '0.6rem 1.5rem',
                        fontSize: '0.85rem',
                        background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
                        boxShadow: '0 4px 12px rgba(37,99,235,0.25)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}
                    >
                      {savingProfile ? (
                        <>
                          <div className="spinner" style={{ width: '16px', height: '16px', borderTopColor: '#fff' }}></div>
                          <span>Guardando...</span>
                        </>
                      ) : (
                        <span>✓ Guardar Ficha 360</span>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* MODAL EDICIÓN RÁPIDA DE TELÉFONO */}
          {editPhoneModalClient && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.75)',
              backdropFilter: 'blur(6px)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 99999,
              padding: '1rem'
            }}>
              <div style={{
                backgroundColor: '#ffffff',
                borderRadius: '20px',
                boxShadow: '0 25px 50px rgba(0, 0, 0, 0.25)',
                width: '100%',
                maxWidth: '440px',
                overflow: 'hidden',
                border: '1px solid #e2e8f0'
              }}>
                <div style={{
                  background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
                  padding: '1.25rem 1.5rem',
                  color: '#ffffff',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: '#ffffff' }}>
                      📞 Modificar Teléfono
                    </h3>
                    <p style={{ fontSize: '0.75rem', color: '#bfdbfe', margin: '0.15rem 0 0 0' }}>
                      {editPhoneModalClient.nombre || `${editPhoneModalClient.primer_nombre} ${editPhoneModalClient.primer_apellido}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditPhoneModalClient(null)}
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(255, 255, 255, 0.15)',
                      border: 'none',
                      color: '#ffffff',
                      cursor: 'pointer',
                      fontSize: '0.85rem'
                    }}
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleSavePhone} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>Número de Teléfono / WhatsApp *</label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <select
                        value={editPhoneForm.codigo_area}
                        onChange={e => setEditPhoneForm({ ...editPhoneForm, codigo_area: e.target.value })}
                        className="form-input"
                        style={{ width: '90px', margin: 0, padding: '0.65rem 0.6rem', borderRadius: '10px', fontWeight: 700, background: '#f8fafc' }}
                      >
                        <option value="0412">0412</option>
                        <option value="0414">0414</option>
                        <option value="0424">0424</option>
                        <option value="0416">0416</option>
                        <option value="0426">0426</option>
                      </select>
                      <input
                        type="tel"
                        required
                        value={editPhoneForm.numero_celular}
                        onChange={e => setEditPhoneForm({ ...editPhoneForm, numero_celular: e.target.value.replace(/\D/g, '') })}
                        placeholder="1234567"
                        className="form-input"
                        style={{ flex: 1, margin: 0, padding: '0.65rem 0.9rem', borderRadius: '10px' }}
                      />
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.35rem', display: 'block' }}>
                      Se actualizará el número para el envío de recordatorios y WhatsApp.
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', paddingTop: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => setEditPhoneModalClient(null)}
                      className="btn btn-secondary"
                      style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={savingPhone}
                      className="btn btn-primary"
                      style={{ padding: '0.5rem 1.25rem', fontSize: '0.8rem', background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)' }}
                    >
                      {savingPhone ? 'Guardando...' : '✓ Guardar Teléfono'}
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
