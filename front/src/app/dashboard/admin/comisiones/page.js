'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../contexts/AuthContext';
import { useToast } from '../../../components/ToastProvider';

function normalizeApiUrl(url) {
  if (!url) return '';
  const trimmed = url.replace(/\/+$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}
const API_URL = normalizeApiUrl(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api');

export default function ComisionesPage() {
  const { token, isLoggedIn, user, hydrated } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();

  // --- ESTADOS DE DATOS ---
  const [companias, setCompanias] = useState([]);
  const [asesores, setAsesores] = useState([]);
  const [comisionesAsesores, setComisionesAsesores] = useState([]);
  const [polizas, setPolizas] = useState([]);
  const [bncPreview, setBncPreview] = useState([]);
  const [matrizComisiones, setMatrizComisiones] = useState([]);
  const [historicoComisiones, setHistoricoComisiones] = useState([]);
  const [corridasComisiones, setCorridasComisiones] = useState([]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // --- ESTADOS DE EDICIÓN / FORMULARIOS ---
  const [activeTab, setActiveTab] = useState('polizas'); // 'polizas', 'estandar', 'personalizado', 'matriz', 'historico', 'bnc'
  const [standardEdits, setStandardEdits] = useState({}); // { [companiaId]: percentage }
  const [cuentaDebitar, setCuentaDebitar] = useState('01910100201000123456');
  
  // Formulario de comisión por asesor y aseguradora
  const [advisorForm, setAdvisorForm] = useState({
    asesor_id: '',
    compania_id: '',
    porcentaje: ''
  });

  // Edición rápida de comisión de póliza
  const [editingPolicyId, setEditingPolicyId] = useState(null);
  const [editingPolicyVal, setEditingPolicyVal] = useState('');

  // --- ESTADOS DE EDICIÓN DE MATRIZ JERÁRQUICA ---
  const [matrixModal, setMatrixModal] = useState(null); // 'new' | 'edit' | null
  const [matrixForm, setMatrixForm] = useState({
    id: null,
    mercado: 'Nacionales',
    compania_id: '',
    ramo: 'Salud',
    producto_modalidad: '',
    total_comision: 20,
    asesor_1: 15,
    asesor_2: 12,
    asesor_3: 10,
    consultor_1: 15,
    consultor_2: 12,
    johans: 15,
    nivel_1_subagente: 10,
    nivel_2_agente: 8
  });

  // Redirección si no es admin
  useEffect(() => {
    if (hydrated) {
      if (!isLoggedIn) {
        router.push('/login');
      } else if (user?.rango !== 'admin') {
        showToast('Acceso no autorizado. Solo para administradores.', 'error');
        router.push('/');
      }
    }
  }, [hydrated, isLoggedIn, user, router]);

  const loadData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/commissions`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al cargar comisiones');

      setCompanias(data.companias || []);
      setAsesores(data.asesores || []);
      setComisionesAsesores(data.comisiones_asesores || []);
      setPolizas(data.polizas || []);
      setBncPreview(data.bnc_preview || []);
      setMatrizComisiones(data.matriz_comisiones || []);
      setHistoricoComisiones(data.historico_comisiones || []);
      setCorridasComisiones(data.corridas_comisiones || []);

      // Inicializar el estado de edición estándar
      const edits = {};
      (data.companias || []).forEach(c => {
        edits[c.id] = {
          comision_compania: c.comision_compania !== undefined ? c.comision_compania : 0,
          comision_asesor_estandar: c.comision_asesor_estandar !== undefined ? c.comision_asesor_estandar : 0
        };
      });
      setStandardEdits(edits);

    } catch (err) {
      console.error(err);
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (hydrated && isLoggedIn && user?.rango === 'admin') {
      loadData();
    }
  }, [hydrated, isLoggedIn, user]);

  // Guardar comisión estándar
  const handleSaveStandard = async (companiaId) => {
    const edit = standardEdits[companiaId];
    if (!edit || edit.comision_compania === '' || edit.comision_asesor_estandar === '') {
      return showToast('Los porcentajes no pueden estar vacíos.', 'error');
    }
    
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/admin/commissions/standard`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          compania_id: parseInt(companiaId),
          comision_compania: parseFloat(edit.comision_compania),
          comision_asesor_estandar: parseFloat(edit.comision_asesor_estandar)
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar');

      showToast('Porcentajes estándares actualizados correctamente.');
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Guardar comisión personalizada por asesor
  const handleSaveAdvisorCustom = async (e) => {
    e.preventDefault();
    const { asesor_id, compania_id, porcentaje } = advisorForm;
    if (!asesor_id || !compania_id || porcentaje === '') {
      return showToast('Todos los campos son obligatorios.', 'error');
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/admin/commissions/advisor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          asesor_id: parseInt(asesor_id),
          compania_id: parseInt(compania_id),
          porcentaje: parseFloat(porcentaje)
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar');

      showToast('Comisión de asesor guardada correctamente.');
      setAdvisorForm({ asesor_id: '', compania_id: '', porcentaje: '' });
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Eliminar comisión personalizada por asesor (restablecer a estándar)
  const handleDeleteAdvisorCustom = async (asesorId, companiaId) => {
    if (!confirm('¿Está seguro de que desea eliminar esta comisión personalizada? El asesor volverá a ganar el porcentaje estándar de la aseguradora.')) return;
    
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/admin/commissions/advisor/${asesorId}/${companiaId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al eliminar');

      showToast('Comisión personalizada eliminada.');
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Guardar comisión específica de una póliza
  const handleSavePolicyCommission = async (polizaId) => {
    const val = editingPolicyVal;
    
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/admin/commissions/policy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          poliza_id: parseInt(polizaId),
          comision_porcentaje: val === '' ? null : parseFloat(val)
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar');

      showToast('Comisión de póliza actualizada correctamente.');
      setEditingPolicyId(null);
      setEditingPolicyVal('');
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // --- GESTIÓN DE MATRIZ JERÁRQUICA ---
  const handleOpenNewMatrixModal = () => {
    setMatrixForm({
      id: null,
      mercado: 'Nacionales',
      compania_id: companias.length > 0 ? companias[0].id : '',
      ramo: 'Salud',
      producto_modalidad: '',
      total_comision: 20,
      asesor_1: 15,
      asesor_2: 12,
      asesor_3: 10,
      consultor_1: 15,
      consultor_2: 12,
      johans: 15,
      nivel_1_subagente: 10,
      nivel_2_agente: 8
    });
    setMatrixModal('new');
  };

  const handleOpenEditMatrixModal = (rule) => {
    setMatrixForm({
      id: rule.id,
      mercado: rule.mercado || 'Nacionales',
      compania_id: rule.compania_id || '',
      ramo: rule.ramo || 'Salud',
      producto_modalidad: rule.producto_modalidad || '',
      total_comision: rule.total_comision !== undefined ? rule.total_comision : 20,
      asesor_1: rule.asesor_1 !== undefined ? rule.asesor_1 : (rule.consultor_1 || 15),
      asesor_2: rule.asesor_2 !== undefined ? rule.asesor_2 : (rule.consultor_2 || 12),
      asesor_3: rule.asesor_3 !== undefined ? rule.asesor_3 : 10,
      consultor_1: rule.consultor_1 !== undefined ? rule.consultor_1 : (rule.asesor_1 || 15),
      consultor_2: rule.consultor_2 !== undefined ? rule.consultor_2 : (rule.asesor_2 || 12),
      johans: rule.johans !== undefined ? rule.johans : 15,
      nivel_1_subagente: rule.nivel_1_subagente !== undefined ? rule.nivel_1_subagente : 10,
      nivel_2_agente: rule.nivel_2_agente !== undefined ? rule.nivel_2_agente : 8
    });
    setMatrixModal('edit');
  };

  const handleSaveMatrixRule = async (e) => {
    e.preventDefault();
    if (!matrixForm.mercado || !matrixForm.ramo || !matrixForm.producto_modalidad || matrixForm.total_comision === '') {
      return showToast('Por favor completa todos los campos requeridos.', 'error');
    }

    setSubmitting(true);
    try {
      const isEdit = matrixModal === 'edit';
      const url = isEdit ? `${API_URL}/admin/commissions/matrix/${matrixForm.id}` : `${API_URL}/admin/commissions/matrix`;
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(matrixForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar regla');

      showToast(isEdit ? 'Regla jerárquica actualizada con éxito.' : 'Regla jerárquica creada con éxito.');
      setMatrixModal(null);
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteMatrixRule = async (ruleId) => {
    if (!confirm('¿Está seguro de que desea eliminar esta regla de la matriz? Las pólizas futuras de este ramo usarán los porcentajes estándar.')) return;

    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/admin/commissions/matrix/${ruleId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al eliminar regla');

      showToast('Regla jerárquica eliminada correctamente.');
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetMatrixDefaults = async () => {
    if (!confirm('¿Desea restablecer y sincronizar la Matriz de Comisiones con los planes del Tarifario Oficial de Protección y Seguros 360?')) return;

    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/admin/commissions/matrix/reset-defaults`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al restablecer matriz');

      showToast('Matriz de comisiones sincronizada exitosamente con el tarifario.');
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Exportar reporte TXT general
  const handleExportTxt = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/commissions/export-txt`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Error al descargar el reporte.');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'comisiones_asesores_historico.txt';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast('Reporte TXT generado y descargado con éxito.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Exportar TXT para el BNC (Pago de Proveedores)
  const handleExportBncTxt = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/commissions/export-bnc-txt?cuenta_debitar=${cuentaDebitar}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Error al descargar el archivo para el BNC.');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'bnc_pago_proveedores.txt';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast('Archivo TXT para abonos BNC descargado y corrida guardada con éxito.');
      await loadData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Descargar TXT de una corrida pasada
  const handleDownloadPastTxt = (run) => {
    if (!run.archivo_txt) return showToast('No hay archivo TXT disponible para esta corrida.', 'error');
    const blob = new Blob([run.archivo_txt], { type: 'text/plain; charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bnc_pago_proveedores_run_${run.id}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    showToast(`TXT de la corrida #${run.id} descargado.`);
  };

  const handleCopyBncTable = () => {
    const header = "Fecha de Pago\tCuenta a Debitar\tCuenta Beneficiario\tMonto\tDescripción\tID Beneficiario\tNombre Beneficiario\tEmail Beneficiario\tReferencia del Cliente";
    const rows = bncPreview.map(r => 
      `${r.fecha_pago}\t${cuentaDebitar}\t${r.cuenta_beneficiario}\t${r.monto}\t${r.descripcion}\t${r.id_beneficiario}\t${r.nombre_beneficiario}\t${r.email_beneficiario}\t${r.referencia}`
    ).join('\n');
    navigator.clipboard.writeText(`${header}\n${rows}`);
    showToast('Datos copiados al portapapeles. Listo para pegar en Excel.');
  };

  // --- CÁLCULO DE MÉTRICAS ---
  const totalPolizas = polizas.length;
  const totalPrimas = polizas.reduce((sum, p) => sum + parseFloat(p.prima_anual || 0), 0);
  const totalMargin = historicoComisiones.reduce((sum, h) => sum + parseFloat(h.margen_broker || 0), 0);
  const totalPaidAdvisors = historicoComisiones.reduce((sum, h) => sum + parseFloat(h.pago_asesor || 0), 0);

  if (!hydrated || !isLoggedIn || user?.rango !== 'admin') {
    return null;
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ color: 'var(--primary)', fontWeight: 800, fontSize: '2rem', marginBottom: '0.25rem' }}>
            📊 Panel de Comisiones, Matriz y Conciliación Bancaria
          </h1>
          <p style={{ color: 'var(--text-muted)' }}>
            Estructuras jerárquicas de comisiones por mercado, ramo y perfil, histórico de cobranza y corridas BNC.
          </p>
        </div>
        <button onClick={handleExportTxt} className="btn btn-accent" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#3b82f6', color: 'white' }}>
          📄 Exportar Reporte Histórico Detallado
        </button>
      </div>

      {/* Tarjetas de Resumen Rápido */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
        <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Pólizas Totales</span>
          <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--primary)', marginTop: '0.5rem' }}>{totalPolizas}</span>
        </div>
        <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Cartera Suscrita ($ USD)</span>
          <span style={{ fontSize: '2rem', fontWeight: 800, color: '#10b981', marginTop: '0.5rem' }}>${totalPrimas.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span>
        </div>
        <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Margen Broker (Ganancia en Bs.)</span>
          <span style={{ fontSize: '2rem', fontWeight: 800, color: '#6366f1', marginTop: '0.5rem' }}>Bs. {totalMargin.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span>
        </div>
        <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Liquidado a Asesores (Bs. BNC)</span>
          <span style={{ fontSize: '2rem', fontWeight: 800, color: '#d97706', marginTop: '0.5rem' }}>Bs. {totalPaidAdvisors.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span>
        </div>
      </div>

      {/* Navegación por pestañas */}
      <div style={{ display: 'flex', borderBottom: '2px solid var(--border)', marginBottom: '1.5rem', gap: '1.5rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
        <button 
          onClick={() => setActiveTab('polizas')}
          style={{
            padding: '0.75rem 0.5rem',
            fontWeight: 600,
            fontSize: '0.95rem',
            color: activeTab === 'polizas' ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: activeTab === 'polizas' ? '3px solid var(--primary)' : '3px solid transparent',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
        >
          📋 Pólizas e Individuales
        </button>
        <button 
          onClick={() => setActiveTab('matriz')}
          style={{
            padding: '0.75rem 0.5rem',
            fontWeight: 600,
            fontSize: '0.95rem',
            color: activeTab === 'matriz' ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: activeTab === 'matriz' ? '3px solid var(--primary)' : '3px solid transparent',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
        >
          📊 Matriz Jerárquica
        </button>
        <button 
          onClick={() => setActiveTab('historico')}
          style={{
            padding: '0.75rem 0.5rem',
            fontWeight: 600,
            fontSize: '0.95rem',
            color: activeTab === 'historico' ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: activeTab === 'historico' ? '3px solid var(--primary)' : '3px solid transparent',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
        >
          📜 Historial y Corridas
        </button>
        <button 
          onClick={() => setActiveTab('bnc')}
          style={{
            padding: '0.75rem 0.5rem',
            fontWeight: 600,
            fontSize: '0.95rem',
            color: activeTab === 'bnc' ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: activeTab === 'bnc' ? '3px solid var(--primary)' : '3px solid transparent',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
        >
          🏦 Corrida / Abonos BNC
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: 'var(--text-muted)' }}>Cargando información de comisiones...</p>
        </div>
      ) : (
        <div>
          
          {/* PESTAÑA: DETALLE DE PÓLIZAS */}
          {activeTab === 'polizas' && (
            <div className="card" style={{ padding: '1.5rem', overflowX: 'auto' }}>
              <h3 style={{ color: 'var(--primary)', marginBottom: '1rem', fontWeight: 700 }}>Lista de Pólizas Suscritas y Overrides</h3>
              <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', backgroundColor: 'var(--secondary)' }}>
                    <th style={{ padding: '0.75rem' }}>Código Póliza</th>
                    <th style={{ padding: '0.75rem' }}>Aseguradora</th>
                    <th style={{ padding: '0.75rem' }}>Plan</th>
                    <th style={{ padding: '0.75rem' }}>Cliente</th>
                    <th style={{ padding: '0.75rem' }}>Prima Anual</th>
                    <th style={{ padding: '0.75rem' }}>Asesor</th>
                    <th style={{ padding: '0.75rem' }}>Estado</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center' }}>% Override Asesor</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {polizas.length === 0 ? (
                    <tr>
                      <td colSpan="9" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No hay pólizas registradas.</td>
                    </tr>
                  ) : (
                    polizas.map(p => (
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '0.75rem', fontWeight: 600 }}>{p.codigo_poliza}</td>
                        <td style={{ padding: '0.75rem' }}>{p.compania_nombre}</td>
                        <td style={{ padding: '0.75rem' }}>{p.plan || 'Sin Plan'}</td>
                        <td style={{ padding: '0.75rem' }}>{`${p.primer_nombre || ''} ${p.primer_apellido || ''}`}</td>
                        <td style={{ padding: '0.75rem', fontWeight: 600 }}>${parseFloat(p.prima_anual || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '0.75rem' }}>{p.asesor_nombre} ({p.codigo_asesor})</td>
                        <td style={{ padding: '0.75rem' }}>
                          <span style={{
                            padding: '0.25rem 0.5rem',
                            borderRadius: '0.25rem',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            backgroundColor: p.estado === 'vigente' ? '#d1fae5' : p.estado === 'pendiente' ? '#fef3c7' : '#fee2e2',
                            color: p.estado === 'vigente' ? '#065f46' : p.estado === 'pendiente' ? '#92400e' : '#991b1b'
                          }}>{p.estado}</span>
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                          {editingPolicyId === p.id ? (
                            <input 
                              type="number" 
                              style={{ width: '80px', padding: '0.25rem', textAlign: 'center' }}
                              value={editingPolicyVal}
                              onChange={e => setEditingPolicyVal(e.target.value)}
                              placeholder="Estándar"
                            />
                          ) : (
                            <span style={{ fontWeight: 600, color: p.comision_porcentaje !== null ? '#4f46e5' : 'inherit' }}>
                              {p.comision_porcentaje !== null ? `${p.comision_porcentaje}% (Anulado)` : 'Usa Matriz/Estándar'}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                          {editingPolicyId === p.id ? (
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                              <button onClick={() => handleSavePolicyCommission(p.id)} className="btn btn-primary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>Guardar</button>
                              <button onClick={() => setEditingPolicyId(null)} className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>Cancelar</button>
                            </div>
                          ) : (
                            <button 
                              onClick={() => {
                                setEditingPolicyId(p.id);
                                setEditingPolicyVal(p.comision_porcentaje !== null ? String(p.comision_porcentaje) : '');
                              }} 
                              className="btn btn-secondary" 
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                            >
                              Editar Override
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* PESTAÑA: MATRIZ JERÁRQUICA */}
          {activeTab === 'matriz' && (
            <div className="card" style={{ padding: '1.5rem', overflowX: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <h3 style={{ color: 'var(--primary)', margin: 0, fontWeight: 700 }}>Matriz Jerárquica de Porcentajes de Comisiones</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>
                    Reglas vinculadas estrictamente con las Aseguradoras y Planes reales del Tarifario oficial.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <button 
                    onClick={handleResetMatrixDefaults}
                    className="btn btn-secondary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.45rem 0.9rem', fontSize: '0.85rem', borderColor: '#3b82f6', color: '#1d4ed8', backgroundColor: '#eff6ff' }}
                    title="Restablece la matriz con los porcentajes congruentes del tarifario"
                  >
                    🔄 Sincronizar con Tarifario
                  </button>
                  <button 
                    onClick={handleOpenNewMatrixModal}
                    className="btn btn-primary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.45rem 0.9rem', fontSize: '0.85rem' }}
                  >
                    ➕ Nueva Regla Jerárquica
                  </button>
                </div>
              </div>

              <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', backgroundColor: 'var(--secondary)' }}>
                    <th style={{ padding: '0.65rem' }}>Mercado</th>
                    <th style={{ padding: '0.65rem' }}>Aseguradora</th>
                    <th style={{ padding: '0.65rem' }}>Ramo Técnico</th>
                    <th style={{ padding: '0.65rem' }}>Plan / Modalidad (Tarifario)</th>
                    <th style={{ padding: '0.65rem', textAlign: 'center', backgroundColor: '#eef2ff' }}>Total Comisión Broker</th>
                    <th style={{ padding: '0.65rem', textAlign: 'center' }}>🥇 Asesor 1 (Senior)</th>
                    <th style={{ padding: '0.65rem', textAlign: 'center' }}>🥈 Asesor 2 (Interm)</th>
                    <th style={{ padding: '0.65rem', textAlign: 'center', backgroundColor: '#fef3c7' }}>🥉 Asesor 3 (Junior)</th>
                    <th style={{ padding: '0.65rem', textAlign: 'center', backgroundColor: '#ecfdf5', color: '#065f46' }}>🏢 Margen Empresa (Asesor 3)</th>
                    <th style={{ padding: '0.65rem', textAlign: 'center' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {matrizComisiones.length === 0 ? (
                    <tr>
                      <td colSpan="10" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No hay reglas jerárquicas configuradas. Haz clic en "Sincronizar con Tarifario" para sembrar las reglas oficiales.</td>
                    </tr>
                  ) : (
                    matrizComisiones.map(r => {
                      const totalPct = parseFloat(r.total_comision || 0);
                      const a3Pct = parseFloat(r.asesor_3 !== undefined ? r.asesor_3 : 0);
                      const margenEmpresaA3 = Math.max(0, totalPct - a3Pct);

                      return (
                        <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '0.65rem', fontWeight: 600 }}>{r.mercado}</td>
                          <td style={{ padding: '0.65rem', fontWeight: 700 }}>{r.compania_nombre || 'Todas'}</td>
                          <td style={{ padding: '0.65rem', color: '#4f46e5', fontWeight: 500 }}>{r.ramo}</td>
                          <td style={{ padding: '0.65rem', fontStyle: 'italic', maxWidth: '240px' }}>{r.producto_modalidad}</td>
                          <td style={{ padding: '0.65rem', textAlign: 'center', fontWeight: 700, color: '#312e81', backgroundColor: '#eef2ff' }}>{r.total_comision}%</td>
                          <td style={{ padding: '0.65rem', textAlign: 'center', fontWeight: 600 }}>{r.asesor_1 !== undefined ? r.asesor_1 : (r.consultor_1 || 0)}%</td>
                          <td style={{ padding: '0.65rem', textAlign: 'center', fontWeight: 600 }}>{r.asesor_2 !== undefined ? r.asesor_2 : (r.consultor_2 || 0)}%</td>
                          <td style={{ padding: '0.65rem', textAlign: 'center', fontWeight: 700, color: '#92400e', backgroundColor: '#fef3c7' }}>{r.asesor_3 !== undefined ? r.asesor_3 : 0}%</td>
                          <td style={{ padding: '0.65rem', textAlign: 'center', fontWeight: 700, color: '#047857', backgroundColor: '#ecfdf5' }}>
                            {margenEmpresaA3.toFixed(1)}%
                          </td>
                          <td style={{ padding: '0.65rem', textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'center' }}>
                              <button
                                onClick={() => handleOpenEditMatrixModal(r)}
                                className="btn btn-secondary"
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                              >
                                ✏️ Editar
                              </button>
                              <button
                                onClick={() => handleDeleteMatrixRule(r.id)}
                                className="btn btn-secondary"
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', color: '#ef4444', borderColor: '#fee2e2' }}
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

          {/* PESTAÑA: HISTORIAL Y CORRIDAS */}
          {activeTab === 'historico' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
              
              {/* Sección A: Corridas Realizadas */}
              <div className="card" style={{ padding: '1.5rem', overflowX: 'auto' }}>
                <h3 style={{ color: 'var(--primary)', marginBottom: '1rem', fontWeight: 700 }}>Histórico de Corridas del BNC Realizadas</h3>
                <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)', backgroundColor: 'var(--secondary)' }}>
                      <th style={{ padding: '0.75rem' }}>ID Corrida</th>
                      <th style={{ padding: '0.75rem' }}>Fecha Ejecución</th>
                      <th style={{ padding: '0.75rem' }}>Tipo de Ejecución</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right' }}>Total Liquidado</th>
                      <th style={{ padding: '0.75rem', textAlign: 'center' }}>Cantidad de Asesores</th>
                      <th style={{ padding: '0.75rem', textAlign: 'center' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {corridasComisiones.length === 0 ? (
                      <tr>
                        <td colSpan="6" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No se han ejecutado corridas bancarias todavía.</td>
                      </tr>
                    ) : (
                      corridasComisiones.map(run => (
                        <tr key={run.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '0.75rem', fontWeight: 600 }}>#{run.id}</td>
                          <td style={{ padding: '0.75rem' }}>{new Date(run.fecha_ejecucion).toLocaleString()}</td>
                          <td style={{ padding: '0.75rem', textTransform: 'capitalize' }}>{run.tipo_ejecucion}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 700, color: '#10b981' }}>Bs. {parseFloat(run.total_pagado || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>{run.cantidad_asesores}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                            <button 
                              onClick={() => handleDownloadPastTxt(run)} 
                              className="btn btn-secondary" 
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                            >
                              💾 Descargar TXT BNC
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Sección B: Desglose de Comisiones del Histórico */}
              <div className="card" style={{ padding: '1.5rem', overflowX: 'auto' }}>
                <h3 style={{ color: 'var(--primary)', marginBottom: '1rem', fontWeight: 700 }}>Historial de Comisiones Generadas por Cuotas de Pago (Bs. VES)</h3>
                <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)', backgroundColor: 'var(--secondary)' }}>
                      <th style={{ padding: '0.75rem' }}>ID Pago</th>
                      <th style={{ padding: '0.75rem' }}>Póliza</th>
                      <th style={{ padding: '0.75rem' }}>Aseguradora</th>
                      <th style={{ padding: '0.75rem' }}>Asesor</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right' }}>Monto Aprobado (Bs.)</th>
                      <th style={{ padding: '0.75rem', textAlign: 'center' }}>% Broker / % Asesor</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right' }}>Com. Bruta Broker (Bs.)</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right' }}>Pago Asesor (Bs.)</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right', backgroundColor: '#f0fdf4' }}>Margen Broker (Bs.)</th>
                      <th style={{ padding: '0.75rem' }}>Fecha Pago</th>
                      <th style={{ padding: '0.75rem' }}>Estado Corrida</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historicoComisiones.length === 0 ? (
                      <tr>
                        <td colSpan="11" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No se registran transacciones de comisiones en el histórico.</td>
                      </tr>
                    ) : (
                      historicoComisiones.map(h => (
                        <tr key={h.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '0.75rem', fontWeight: 600 }}>#{h.pago_id}</td>
                          <td style={{ padding: '0.75rem' }}>{h.codigo_poliza} ({h.plan})</td>
                          <td style={{ padding: '0.75rem' }}>{h.compania_nombre}</td>
                          <td style={{ padding: '0.75rem' }}>{h.asesor_nombre}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 600 }}>Bs. {parseFloat(h.monto_pago || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>{h.total_comision_porcentaje}% / {h.asesor_porcentaje}%</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right' }}>Bs. {parseFloat(h.comision_bruta || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', color: '#b45309' }}>Bs. {parseFloat(h.pago_asesor || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 700, color: '#15803d', backgroundColor: '#f0fdf4' }}>Bs. {parseFloat(h.margen_broker || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
                          <td style={{ padding: '0.75rem' }}>{new Date(h.fecha_pago).toLocaleDateString()}</td>
                          <td style={{ padding: '0.75rem' }}>
                            <span style={{
                              padding: '0.2rem 0.4rem',
                              borderRadius: '0.25rem',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              backgroundColor: h.estado_corrida === 'pendiente' ? '#fee2e2' : '#d1fae5',
                              color: h.estado_corrida === 'pendiente' ? '#991b1b' : '#065f46'
                            }}>{h.estado_corrida}</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

            </div>
          )}

          {/* PESTAÑA: ABONOS BNC (TXT/EXCEL) */}
          {activeTab === 'bnc' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
              
              {/* Formulario y Configuración de Cuenta de Débito */}
              <div className="card" style={{ padding: '1.5rem', maxWidth: '600px', margin: '0 auto', width: '100%' }}>
                <h3 style={{ color: 'var(--primary)', marginBottom: '1rem', fontWeight: 700 }}>Configuración de Pago a Proveedores BNC</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
                  Ingrese la cuenta a debitar de la empresa para generar la estructura del TXT de abono a proveedores.
                </p>
                <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                  <label className="form-label">Cuenta a Debitar de la Empresa (20 dígitos numéricos) *</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={cuentaDebitar} 
                    onChange={e => setCuentaDebitar(e.target.value.replace(/\D/g, '').substring(0, 20))}
                    placeholder="Ej: 01910100201000123456" 
                    maxLength="20"
                    required
                  />
                  {cuentaDebitar.length !== 20 && (
                    <span style={{ color: 'red', fontSize: '0.8rem', display: 'block', marginTop: '0.25rem' }}>
                      La cuenta debe tener exactamente 20 caracteres numéricos (actualmente: {cuentaDebitar.length})
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button 
                    onClick={handleExportBncTxt} 
                    className="btn btn-primary"
                    disabled={cuentaDebitar.length !== 20 || bncPreview.length === 0}
                    style={{ flex: 1 }}
                  >
                    🚀 Procesar Corrida y Descargar TXT BNC
                  </button>
                  <button 
                    onClick={handleCopyBncTable} 
                    className="btn btn-secondary"
                    disabled={bncPreview.length === 0}
                    style={{ flex: 1 }}
                  >
                    Copiar Tabla para Excel
                  </button>
                </div>
              </div>

              {/* Previsualización del archivo Tabular */}
              <div className="card" style={{ padding: '1.5rem', width: '100%', overflowX: 'auto' }}>
                <h3 style={{ color: 'var(--primary)', marginBottom: '1rem', fontWeight: 700 }}>Previsualización Tabular BNC (Pago de Proveedores)</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
                  Esta tabla simula exactamente la estructura requerida por el validador del BNC. Al presionar el botón de arriba, se liquidarán las comisiones de esta vista y se guardará el histórico.
                </p>
                <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)', backgroundColor: 'var(--secondary)' }}>
                      <th style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>Fecha de Pago (Col 1)</th>
                      <th style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>Cuenta Debitar (Col 2)</th>
                      <th style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>Cuenta Beneficiario (Col 3)</th>
                      <th style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>Monto (Col 4)</th>
                      <th style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>Descripción (Col 5)</th>
                      <th style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>ID Beneficiario (Col 6)</th>
                      <th style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>Nombre Beneficiario (Col 7)</th>
                      <th style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>Email Beneficiario (Col 8)</th>
                      <th style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>Referencia (Col 9)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bncPreview.length === 0 ? (
                      <tr>
                        <td colSpan="9" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No hay abonos pendientes para liquidar a asesores en este momento.</td>
                      </tr>
                    ) : (
                      bncPreview.map((r, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border)', fontSize: '0.8rem' }}>
                          <td style={{ padding: '0.5rem' }}>{r.fecha_pago}</td>
                          <td style={{ padding: '0.5rem', fontFamily: 'monospace' }}>{cuentaDebitar}</td>
                          <td style={{ padding: '0.5rem', fontFamily: 'monospace' }}>{r.cuenta_beneficiario}</td>
                          <td style={{ padding: '0.5rem', fontWeight: 600, color: 'var(--accent)' }}>{r.monto}</td>
                          <td style={{ padding: '0.5rem' }}>{r.descripcion}</td>
                          <td style={{ padding: '0.5rem' }}>{r.id_beneficiario}</td>
                          <td style={{ padding: '0.5rem', fontWeight: 500 }}>{r.nombre_beneficiario}</td>
                          <td style={{ padding: '0.5rem' }}>{r.email_beneficiario}</td>
                          <td style={{ padding: '0.5rem' }}>{r.referencia}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

            </div>
          )}
        </div>
      )}

      {/* MODAL DE CREACIÓN / EDICIÓN DE REGLA JERÁRQUICA */}
      {matrixModal && (
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
            maxWidth: '650px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '2rem',
            borderRadius: '12px',
            background: '#ffffff',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
              <h3 style={{ margin: 0, color: 'var(--primary)', fontWeight: 800, fontSize: '1.25rem' }}>
                {matrixModal === 'edit' ? '✏️ Editar Regla Jerárquica de Comisión' : '➕ Nueva Regla Jerárquica de Comisión'}
              </h3>
              <button 
                onClick={() => setMatrixModal(null)}
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveMatrixRule}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                
                <div className="form-group">
                  <label className="form-label">Mercado *</label>
                  <select
                    className="form-input"
                    value={matrixForm.mercado}
                    onChange={e => setMatrixForm({ ...matrixForm, mercado: e.target.value })}
                    required
                  >
                    <option value="Nacionales">Nacionales</option>
                    <option value="Internacionales">Internacionales</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Aseguradora *</label>
                  <select
                    className="form-input"
                    value={matrixForm.compania_id}
                    onChange={e => setMatrixForm({ ...matrixForm, compania_id: e.target.value })}
                    required
                  >
                    <option value="">Seleccione aseguradora...</option>
                    {companias.map(c => (
                      <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Ramo Técnico *</label>
                  <select
                    className="form-input"
                    value={matrixForm.ramo}
                    onChange={e => setMatrixForm({ ...matrixForm, ramo: e.target.value })}
                    required
                  >
                    <option value="Salud">🏥 Salud</option>
                    <option value="Patrimoniales">🏢 Patrimoniales (Incendio / Riesgos)</option>
                    <option value="Automovil">🚗 Automóvil</option>
                    <option value="Vida">🛡️ Vida</option>
                    <option value="Viajes">✈️ Viajes / Asistencia</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Producto / Plan del Tarifario *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ej: ACCESS, SALUD EXTERIOR, BRONCE, Incendio..."
                    value={matrixForm.producto_modalidad}
                    onChange={e => setMatrixForm({ ...matrixForm, producto_modalidad: e.target.value })}
                    required
                  />
                  {/* Sugerencias Rápidas de Planes según Aseguradora */}
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginRight: '0.25rem', alignSelf: 'center' }}>Sugerencias:</span>
                    {matrixForm.compania_id === '1' && (
                      <>
                        <button type="button" onClick={() => setMatrixForm({...matrixForm, producto_modalidad: 'ACCESS (Salud Cobertura Nacional)'})} style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#f1f5f9', cursor: 'pointer' }}>ACCESS</button>
                        <button type="button" onClick={() => setMatrixForm({...matrixForm, producto_modalidad: 'PLATINO (Salud Cobertura Amplia)'})} style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#f1f5f9', cursor: 'pointer' }}>PLATINO</button>
                        <button type="button" onClick={() => setMatrixForm({...matrixForm, producto_modalidad: 'EMERGENCIAS (Cobertura Médica)'})} style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#f1f5f9', cursor: 'pointer' }}>EMERGENCIAS</button>
                      </>
                    )}
                    {matrixForm.compania_id === '2' && (
                      <>
                        <button type="button" onClick={() => setMatrixForm({...matrixForm, producto_modalidad: 'SALUD EXTERIOR (Salud Integral)'})} style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#f1f5f9', cursor: 'pointer' }}>SALUD EXTERIOR</button>
                        <button type="button" onClick={() => setMatrixForm({...matrixForm, producto_modalidad: 'SALUD INDIVIDUAL (Salud Integral)'})} style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#f1f5f9', cursor: 'pointer' }}>SALUD INDIVIDUAL</button>
                      </>
                    )}
                    {matrixForm.compania_id === '3' && (
                      <>
                        <button type="button" onClick={() => setMatrixForm({...matrixForm, producto_modalidad: 'BRONCE (Salud)'})} style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#f1f5f9', cursor: 'pointer' }}>BRONCE</button>
                        <button type="button" onClick={() => setMatrixForm({...matrixForm, producto_modalidad: 'PLATA (Salud)'})} style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#f1f5f9', cursor: 'pointer' }}>PLATA</button>
                        <button type="button" onClick={() => setMatrixForm({...matrixForm, producto_modalidad: 'ORO (Salud)'})} style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#f1f5f9', cursor: 'pointer' }}>ORO</button>
                      </>
                    )}
                    {matrixForm.compania_id === '4' && (
                      <>
                        <button type="button" onClick={() => setMatrixForm({...matrixForm, producto_modalidad: 'Incendio y Riesgos Patrimoniales', ramo: 'Patrimoniales'})} style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#f1f5f9', cursor: 'pointer' }}>Incendio</button>
                        <button type="button" onClick={() => setMatrixForm({...matrixForm, producto_modalidad: 'Vehículos / Automóvil', ramo: 'Automovil'})} style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#f1f5f9', cursor: 'pointer' }}>Vehículos</button>
                      </>
                    )}
                    {matrixForm.compania_id === '5' && (
                      <>
                        <button type="button" onClick={() => setMatrixForm({...matrixForm, producto_modalidad: 'Cobertura Internacional / Asistencia en Viajes', ramo: 'Viajes'})} style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#f1f5f9', cursor: 'pointer' }}>Cobertura Internacional</button>
                      </>
                    )}
                    <button type="button" onClick={() => setMatrixForm({...matrixForm, producto_modalidad: 'Todos los Planes'})} style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#f1f5f9', cursor: 'pointer' }}>Todos los Planes</button>
                  </div>
                </div>
              </div>

              <div style={{ backgroundColor: '#f8fafc', border: '1px solid var(--border)', borderRadius: '8px', padding: '1.25rem', marginBottom: '1.5rem' }}>
                <h4 style={{ margin: '0 0 1rem 0', color: 'var(--primary)', fontSize: '0.95rem', fontWeight: 700 }}>
                  Porcentajes de Comisión (% sobre prima cobrada)
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 700, color: '#1e3a8a' }}>Total Comisión Broker *</label>
                    <input
                      type="number"
                      step="0.1"
                      className="form-input"
                      style={{ fontWeight: 700, backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }}
                      value={matrixForm.total_comision}
                      onChange={e => setMatrixForm({ ...matrixForm, total_comision: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">🥇 Asesor 1 (Senior)</label>
                    <input
                      type="number"
                      step="0.1"
                      className="form-input"
                      value={matrixForm.asesor_1}
                      onChange={e => setMatrixForm({ ...matrixForm, asesor_1: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">🥈 Asesor 2 (Interm)</label>
                    <input
                      type="number"
                      step="0.1"
                      className="form-input"
                      value={matrixForm.asesor_2}
                      onChange={e => setMatrixForm({ ...matrixForm, asesor_2: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ color: '#92400e', fontWeight: 700 }}>🥉 Asesor 3 (Junior)</label>
                    <input
                      type="number"
                      step="0.1"
                      className="form-input"
                      style={{ backgroundColor: '#fffbeb', borderColor: '#fde68a' }}
                      value={matrixForm.asesor_3}
                      onChange={e => setMatrixForm({ ...matrixForm, asesor_3: e.target.value })}
                    />
                  </div>
                </div>

                {/* Desglose en Vivo de Margen Empresa */}
                <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: '#ecfdf5', borderRadius: '6px', border: '1px solid #a7f3d0', fontSize: '0.85rem' }}>
                  <strong style={{ color: '#065f46' }}>🏢 Margen Neto para Protección y Seguros 360 (Empresa):</strong>
                  <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.35rem', color: '#047857', flexWrap: 'wrap' }}>
                    <span>Con Asesor 3 (Junior): <strong>{Math.max(0, parseFloat(matrixForm.total_comision || 0) - parseFloat(matrixForm.asesor_3 || 0)).toFixed(1)}%</strong></span>
                    <span>Con Asesor 2 (Interm): <strong>{Math.max(0, parseFloat(matrixForm.total_comision || 0) - parseFloat(matrixForm.asesor_2 || 0)).toFixed(1)}%</strong></span>
                    <span>Con Asesor 1 (Senior): <strong>{Math.max(0, parseFloat(matrixForm.total_comision || 0) - parseFloat(matrixForm.asesor_1 || 0)).toFixed(1)}%</strong></span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setMatrixModal(null)}
                  className="btn btn-secondary"
                  disabled={submitting}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting}
                >
                  {submitting ? 'Guardando...' : (matrixModal === 'edit' ? 'Guardar Cambios' : 'Crear Regla')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
