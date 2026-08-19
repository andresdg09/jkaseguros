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
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Cartera Suscrita</span>
          <span style={{ fontSize: '2rem', fontWeight: 800, color: '#10b981', marginTop: '0.5rem' }}>${totalPrimas.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</span>
        </div>
        <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Margen Broker (Ganancia Real)</span>
          <span style={{ fontSize: '2rem', fontWeight: 800, color: '#6366f1', marginTop: '0.5rem' }}>${totalMargin.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</span>
        </div>
        <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Liquidado a Asesores</span>
          <span style={{ fontSize: '2rem', fontWeight: 800, color: '#d97706', marginTop: '0.5rem' }}>${totalPaidAdvisors.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</span>
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
          onClick={() => setActiveTab('estandar')}
          style={{
            padding: '0.75rem 0.5rem',
            fontWeight: 600,
            fontSize: '0.95rem',
            color: activeTab === 'estandar' ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: activeTab === 'estandar' ? '3px solid var(--primary)' : '3px solid transparent',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
        >
          🏢 Aseguradoras Estándar
        </button>
        <button 
          onClick={() => setActiveTab('personalizado')}
          style={{
            padding: '0.75rem 0.5rem',
            fontWeight: 600,
            fontSize: '0.95rem',
            color: activeTab === 'personalizado' ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: activeTab === 'personalizado' ? '3px solid var(--primary)' : '3px solid transparent',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
        >
          👤 Comisiones por Asesor
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
              <h3 style={{ color: 'var(--primary)', marginBottom: '1rem', fontWeight: 700 }}>Matriz Jerárquica de Porcentajes de Comisiones (5 Niveles)</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                Reglas cruzadas basadas en Mercado, Aseguradora, Ramo, Modalidad de Producto y Perfil de Asesor.
              </p>
              <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', backgroundColor: 'var(--secondary)' }}>
                    <th style={{ padding: '0.75rem' }}>Mercado (Niv 1)</th>
                    <th style={{ padding: '0.75rem' }}>Aseguradora (Niv 2)</th>
                    <th style={{ padding: '0.75rem' }}>Ramo Técnico (Niv 3)</th>
                    <th style={{ padding: '0.75rem' }}>Producto/Modalidad (Niv 4)</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center', backgroundColor: '#eef2ff' }}>Total Comisión</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center' }}>Consultor 1</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center' }}>Consultor 2</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center' }}>Johans</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center' }}>Subagente Niv 1</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center' }}>Agente Niv 2</th>
                  </tr>
                </thead>
                <tbody>
                  {matrizComisiones.length === 0 ? (
                    <tr>
                      <td colSpan="10" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No hay configuraciones jerárquicas sembradas.</td>
                    </tr>
                  ) : (
                    matrizComisiones.map(r => (
                      <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '0.75rem', fontWeight: 600 }}>{r.mercado}</td>
                        <td style={{ padding: '0.75rem' }}>{r.compania_nombre || 'Todas'}</td>
                        <td style={{ padding: '0.75rem', color: '#4f46e5', fontWeight: 500 }}>{r.ramo}</td>
                        <td style={{ padding: '0.75rem', fontStyle: 'italic' }}>{r.producto_modalidad}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'center', fontWeight: 700, color: '#312e81', backgroundColor: '#eef2ff' }}>{r.total_comision}%</td>
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>{r.consultor_1}%</td>
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>{r.consultor_2}%</td>
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>{r.johans}%</td>
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>{r.nivel_1_subagente}%</td>
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>{r.nivel_2_agente}%</td>
                      </tr>
                    ))
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
                          <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 700, color: '#10b981' }}>${run.total_pagado.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td>
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
                <h3 style={{ color: 'var(--primary)', marginBottom: '1rem', fontWeight: 700 }}>Historial de Comisiones Generadas por Cuotas de Pago</h3>
                <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)', backgroundColor: 'var(--secondary)' }}>
                      <th style={{ padding: '0.75rem' }}>ID Pago</th>
                      <th style={{ padding: '0.75rem' }}>Póliza</th>
                      <th style={{ padding: '0.75rem' }}>Aseguradora</th>
                      <th style={{ padding: '0.75rem' }}>Asesor</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right' }}>Monto Pago</th>
                      <th style={{ padding: '0.75rem', textAlign: 'center' }}>% Broker / % Asesor</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right' }}>Com. Bruta Broker</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right' }}>Pago Asesor</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right', backgroundColor: '#f0fdf4' }}>Margen Broker</th>
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
                          <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 600 }}>${h.monto_pago.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>{h.total_comision_porcentaje}% / {h.asesor_porcentaje}%</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right' }}>${h.comision_bruta.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', color: '#b45309' }}>${h.pago_asesor.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 700, color: '#15803d', backgroundColor: '#f0fdf4' }}>${h.margen_broker.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td>
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

          {/* PESTAÑA: COMISIONES ESTÁNDAR (ASEGURADORAS) */}
          {activeTab === 'estandar' && (
            <div className="card" style={{ padding: '1.5rem', overflowX: 'auto' }}>
              <h3 style={{ color: 'var(--primary)', marginBottom: '1rem', fontWeight: 700 }}>Porcentajes Estándares de Aseguradoras</h3>
              <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', backgroundColor: 'var(--secondary)' }}>
                    <th style={{ padding: '0.75rem' }}>Aseguradora</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center' }}>% Comisión Broker JKA</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center' }}>% Comisión Asesor Estándar</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {companias.map(c => {
                    const edit = standardEdits[c.id] || { comision_compania: 0, comision_asesor_estandar: 0 };
                    return (
                      <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '0.75rem', fontWeight: 600 }}>{c.nombre}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                          <input 
                            type="number" 
                            style={{ width: '100px', padding: '0.35rem', textAlign: 'center' }}
                            value={edit.comision_compania}
                            onChange={e => setStandardEdits({
                              ...standardEdits,
                              [c.id]: { ...edit, comision_compania: e.target.value }
                            })}
                          /> %
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                          <input 
                            type="number" 
                            style={{ width: '100px', padding: '0.35rem', textAlign: 'center' }}
                            value={edit.comision_asesor_estandar}
                            onChange={e => setStandardEdits({
                              ...standardEdits,
                              [c.id]: { ...edit, comision_asesor_estandar: e.target.value }
                            })}
                          /> %
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                          <button 
                            onClick={() => handleSaveStandard(c.id)} 
                            className="btn btn-primary"
                            disabled={submitting}
                            style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                          >
                            Actualizar Estándar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* PESTAÑA: COMISIONES PERSONALIZADAS POR ASESOR */}
          {activeTab === 'personalizado' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>
              
              {/* Formulario de creación */}
              <div className="card" style={{ padding: '1.5rem', alignSelf: 'start' }}>
                <h3 style={{ color: 'var(--primary)', marginBottom: '1.25rem', fontWeight: 700 }}>Asignar Porcentaje Personalizado</h3>
                <form onSubmit={handleSaveAdvisorCustom}>
                  <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label className="form-label">Asesor *</label>
                    <select 
                      className="form-input" 
                      value={advisorForm.asesor_id}
                      onChange={e => setAdvisorForm({ ...advisorForm, asesor_id: e.target.value })}
                      required
                    >
                      <option value="">Seleccione un asesor...</option>
                      {asesores.map(a => (
                        <option key={a.id} value={a.id}>{a.nombre} ({a.codigo_asesor})</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label className="form-label">Aseguradora *</label>
                    <select 
                      className="form-input" 
                      value={advisorForm.compania_id}
                      onChange={e => setAdvisorForm({ ...advisorForm, compania_id: e.target.value })}
                      required
                    >
                      <option value="">Seleccione una aseguradora...</option>
                      {companias.map(c => (
                        <option key={c.id} value={c.id}>{c.nombre}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                    <label className="form-label">Porcentaje de Comisión del Asesor (%) *</label>
                    <input 
                      type="number" 
                      className="form-input" 
                      placeholder="Ej: 15"
                      value={advisorForm.porcentaje}
                      onChange={e => setAdvisorForm({ ...advisorForm, porcentaje: e.target.value })}
                      required
                    />
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={submitting}>
                    Guardar Comisión Personalizada
                  </button>
                </form>
              </div>

              {/* Lista de comisiones personalizadas */}
              <div className="card" style={{ padding: '1.5rem', overflowX: 'auto' }}>
                <h3 style={{ color: 'var(--primary)', marginBottom: '1rem', fontWeight: 700 }}>Comisiones Personalizadas Existentes</h3>
                <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)', backgroundColor: 'var(--secondary)' }}>
                      <th style={{ padding: '0.75rem' }}>Asesor</th>
                      <th style={{ padding: '0.75rem' }}>Aseguradora</th>
                      <th style={{ padding: '0.75rem', textAlign: 'center' }}>% Comisión</th>
                      <th style={{ padding: '0.75rem', textAlign: 'center' }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comisionesAsesores.length === 0 ? (
                      <tr>
                        <td colSpan="4" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No hay comisiones personalizadas registradas.</td>
                      </tr>
                    ) : (
                      comisionesAsesores.map(c => {
                        const adv = asesores.find(a => a.id === c.asesor_id);
                        const comp = companias.find(comp => comp.id === c.compania_id);
                        return (
                          <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '0.75rem', fontWeight: 600 }}>{adv ? adv.nombre : `Asesor ID ${c.asesor_id}`}</td>
                            <td style={{ padding: '0.75rem' }}>{comp ? comp.nombre : `Aseguradora ID ${c.compania_id}`}</td>
                            <td style={{ padding: '0.75rem', textAlign: 'center', fontWeight: 700, color: 'var(--primary)' }}>{c.porcentaje}%</td>
                            <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                              <button 
                                onClick={() => handleDeleteAdvisorCustom(c.asesor_id, c.compania_id)} 
                                className="btn btn-secondary"
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', color: '#ef4444', borderColor: '#fee2e2' }}
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

            </div>
          )}

          {/* PESTAÑA: ABONOS BNC (TXT/EXCEL) */}
          {activeTab === 'bnc' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
              
              {/* Formulario y Configuración de Cuenta de Débito */}
              <div className="card" style={{ padding: '1.5rem', maxWidth: '600px', margin: '0 auto', width: '100%' }}>
                <h3 style={{ color: 'var(--primary)', marginBottom: '1rem', fontWeight: 700 }}>Configuración de Pago a Proveedores BNC</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
                  Ingrese la cuenta a debitar de JKA Consultores para generar la estructura del TXT de abono a proveedores.
                </p>
                <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                  <label className="form-label">Cuenta a Debitar JKA (20 dígitos numéricos) *</label>
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
    </div>
  );
}
