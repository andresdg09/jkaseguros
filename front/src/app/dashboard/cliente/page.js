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

export default function ClienteDashboard() {
  const { token, isLoggedIn, cliente, user, hydrated } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();

  // --- ESTADOS DE DATOS ---
  const [policies, setPolicies] = useState([]);
  const [payments, setPayments] = useState([]);
  const [advisors, setAdvisors] = useState([]);
  const [loading, setLoading] = useState(true);

  // --- ESTADO INTERNO ---
  const [activeTab, setActiveTab] = useState('polizas'); // 'polizas', 'pagos', 'asesores'
  const [reportedRefs, setReportedRefs] = useState({}); // { [paymentId]: referenceNumber }
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedPolicies, setExpandedPolicies] = useState({});
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('todos');

  // --- PAGINACIÓN ---
  const [pagePolicies, setPagePolicies] = useState(1);
  const [pageSizePolicies, setPageSizePolicies] = useState(10);

  const [pagePayments, setPagePayments] = useState(1);
  const [pageSizePayments, setPageSizePayments] = useState(10);

  // Redirigir si no está logueado o no tiene datos completos
  useEffect(() => {
    if (hydrated) {
      if (!isLoggedIn) {
        router.push('/login');
      } else if (user?.rango !== 'cliente') {
        // Redirigir a sus propios paneles si es asesor o admin
        if (user?.rango === 'admin') router.push('/dashboard/admin');
        else if (user?.rango === 'asesor') router.push('/dashboard/asesor');
      }
    }
  }, [hydrated, isLoggedIn, user, router]);

  // Cargar datos
  const loadData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      // 1. Cargar pólizas del cliente
      const resPols = await fetch(`${API_URL}/policies`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const dataPols = await resPols.json();
      setPolicies(Array.isArray(dataPols) ? dataPols : []);

      // 2. Cargar historial de pagos del cliente
      const resPays = await fetch(`${API_URL}/payments/client`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const dataPays = await resPays.json();
      setPayments(Array.isArray(dataPays) ? dataPays : []);

      // 3. Cargar asesores asignados
      const resAdvs = await fetch(`${API_URL}/client/advisors`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const dataAdvs = await resAdvs.json();
      setAdvisors(Array.isArray(dataAdvs) ? dataAdvs : []);

    } catch (err) {
      console.error('Error al cargar datos de cliente:', err);
      showToast('Error al conectar con el servidor.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (hydrated && isLoggedIn && user?.rango === 'cliente') {
      loadData();
    }
  }, [hydrated, isLoggedIn, user, activeTab]);

  // --- ESTADO REPORTE DE PAGO EN BOLÍVARES ---
  const [payModal, setPayModal] = useState(null);
  const [payForm, setPayForm] = useState({
    pago_id: '',
    poliza_id: '',
    monto_usd: 0,
    monto_reportado_ves: '',
    referencia: '',
    fecha_pago: new Date().toISOString().split('T')[0],
    observaciones: ''
  });

  const handleOpenPayModal = (pa) => {
    setPayModal(pa);
    setPayForm({
      pago_id: pa.id,
      poliza_id: pa.poliza_id,
      monto_usd: parseFloat(pa.monto || 0),
      monto_reportado_ves: '',
      referencia: pa.referencia || '',
      fecha_pago: new Date().toISOString().split('T')[0],
      observaciones: ''
    });
  };

  // Reportar pago
  const handleReportPayment = async (e) => {
    if (e) e.preventDefault();
    if (!payForm.referencia || !payForm.monto_reportado_ves) {
      return showToast('Por favor, introduzca una referencia válida y el monto en Bolívares.', 'error');
    }

    if (payForm.referencia.trim().length !== 6) {
      return showToast('Por favor ingrese exactamente los últimos 6 dígitos de la referencia.', 'error');
    }

    // Normalizar formato numérico venezolano (ej. 1.500,50 o 1500,50 o 1500.50)
    let rawMonto = String(payForm.monto_reportado_ves).trim();
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
          pago_id: payForm.pago_id,
          poliza_id: payForm.poliza_id,
          monto_reportado_ves: cleanMontoVES,
          monto_usd: parseFloat(payForm.monto_usd || 0),
          referencia: payForm.referencia,
          fecha_pago: payForm.fecha_pago,
          observaciones: payForm.observaciones
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al reportar pago');

      showToast('¡Pago en Bolívares reportado con éxito! Se encuentra En Revisión por el Administrador.');
      
      // Actualización optimista inmediata en la UI
      setPayments(prev => prev.map(p => {
        if (String(p.id) === String(payForm.pago_id) || (!payForm.pago_id && String(p.poliza_id) === String(payForm.poliza_id) && p.estado_pago === 'pendiente')) {
          return {
            ...p,
            estado_pago: 'en_revision',
            referencia: payForm.referencia,
            monto_reportado: cleanMontoVES,
            moneda_pago: 'VES',
            fecha_pago: payForm.fecha_pago,
            observaciones: payForm.observaciones || p.observaciones
          };
        }
        return p;
      }));

      // Mantener la póliza expandida para ver el cambio de inmediato
      if (payForm.poliza_id) {
        setExpandedPolicies(prev => ({ ...prev, [String(payForm.poliza_id)]: true }));
      }

      setPayModal(null);
      await loadData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // --- FILTRADO DE DATOS ---
  const filteredPolicies = policies.filter(p =>
    !searchQuery ||
    p.codigo_poliza?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.compania_nombre?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.asesor_nombre?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.estado?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Agrupación de pagos por póliza individual (estrictamente separadas por poliza_id)
  const groupedPaymentsByPolicy = (() => {
    const map = new Map();
    payments.forEach(pa => {
      const pKey = pa.poliza_id ? String(pa.poliza_id) : (pa.poliza_codigo || `temp-${pa.id}`);
      if (!map.has(pKey)) {
        map.set(pKey, {
          poliza_id: pa.poliza_id,
          poliza_codigo: pa.poliza_codigo || 'POL-GENERAL',
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

    if (!searchQuery) return groups;
    const q = searchQuery.toLowerCase();
    return groups.filter(g =>
      g.poliza_codigo?.toLowerCase().includes(q) ||
      g.compania_nombre?.toLowerCase().includes(q) ||
      g.plan?.toLowerCase().includes(q) ||
      g.cuotas.some(c => c.referencia?.toLowerCase().includes(q) || c.estado_pago?.toLowerCase().includes(q))
    );
  })();

  const filteredAdvisors = advisors.filter(adv =>
    !searchQuery ||
    adv.nombre?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    adv.codigo_asesor?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!hydrated || !isLoggedIn || user?.rango !== 'cliente') return null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
        <div>
          <h2 style={{ color: 'var(--primary)', fontWeight: 800 }}>Mi Panel de Asegurado</h2>
          <p style={{ color: 'var(--text-muted)' }}>
            Bienvenido, <strong>{cliente ? `${cliente.primer_nombre} ${cliente.primer_apellido}` : user.correo}</strong>
          </p>
        </div>
        <button onClick={loadData} className="btn btn-secondary" style={{ padding: '0.5rem 1rem' }} disabled={loading}>
          {loading ? 'Cargando...' : 'Sincronizar Panel ↻'}
        </button>
      </div>

      {!cliente && (
        <div style={{ background: '#fffbeb', border: '1px solid #f59e0b', padding: '1rem', borderRadius: '8px', marginBottom: '2rem' }}>
          <h5 style={{ color: '#b45309', marginBottom: '0.25rem' }}>⚠ Perfil Incompleto</h5>
          <p style={{ fontSize: '0.9rem', color: '#78350f', margin: 0 }}>
            Por favor, complete sus datos en <a href="/perfil" style={{ fontWeight: 'bold', textDecoration: 'underline' }}>Mi Perfil</a> para poder cotizar y ver sus seguros adecuadamente.
          </p>
        </div>
      )}

      {/* TABS DE CLIENTE */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border)',
        gap: '0.5rem',
        marginBottom: '2rem'
      }}>
        {['polizas', 'pagos', 'asesores'].map((tab) => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setSearchQuery(''); }}
            className={`btn ${activeTab === tab ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: '8px 8px 0 0', border: 'none', padding: '0.75rem 1.25rem' }}
          >
            {tab === 'polizas' ? 'Mis Pólizas' : tab === 'pagos' ? 'Mis Pagos y Cuotas' : 'Mis Asesores'}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>Sincronizando información...</div>
      ) : (
        <div>
          {/* TAB: MIS PÓLIZAS */}
          {activeTab === 'polizas' && (
            <div className="card">
              <h3 className="card-title" style={{ marginBottom: '1.5rem' }}>Pólizas de Salud Solicitadas y Contratadas</h3>
              <div style={{ marginBottom: '1.2rem' }}>
                <input
                  type="text"
                  placeholder="🔍 Buscar póliza por código, compañía, asesor o estado..."
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
                      <th>Código Único</th>
                      <th>Modalidad</th>
                      <th>Área</th>
                      <th>Suma Asegurada</th>
                      <th>Deducible</th>
                      <th>Prima Anual</th>
                      <th>Asesor Asignado</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPolicies.length === 0 ? (
                      <tr><td colSpan="8" className="text-center">No hay pólizas que coincidan con la búsqueda.</td></tr>
                    ) : (
                      filteredPolicies
                        .slice((pagePolicies - 1) * pageSizePolicies, pagePolicies * pageSizePolicies)
                        .map((p) => (
                        <tr key={p.id}>
                          <td><strong>{p.codigo_poliza}</strong></td>
                          <td>{p.plan || 'N/A'}</td>
                          <td>{p.area}</td>
                          <td>${parseFloat(p.suma_asegurada).toLocaleString('en-US')}</td>
                          <td>
                            <span style={{ fontWeight: 600, color: (p.deducible && parseFloat(p.deducible) > 0) ? '#b45309' : '#15803d' }}>
                              {(p.deducible && parseFloat(p.deducible) > 0) ? `$${Number(p.deducible).toLocaleString('en-US')}` : '$0 (Sin deducible)'}
                            </span>
                          </td>
                          <td>${parseFloat(p.prima_anual).toLocaleString('en-US')}</td>
                          <td>{p.asesor_nombre || 'Asesor Asignado'}</td>
                          <td>
                            <span 
                              className={`badge ${p.estado === 'vigente' ? 'badge-vigente' : 'badge-negociacion'}`}
                              style={{
                                background: p.estado === 'vigente' ? '#e6fffa' : p.estado === 'negociacion' ? '#fffbeb' : '#fee2e2',
                                color: p.estado === 'vigente' ? '#047487' : p.estado === 'negociacion' ? '#b45309' : '#b91c1c'
                              }}
                            >
                              {p.estado.toUpperCase()}
                            </span>
                          </td>
                        </tr>
                      ))
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
            </div>
          )}

          {/* TAB: MIS PAGOS */}
          {activeTab === 'pagos' && (
            <div className="card">
              <h3 className="card-title" style={{ marginBottom: '1.5rem' }}>Estatus de Cuotas y Facturas</h3>

              {/* Filtros de Cobranzas */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem', background: '#f8fafc', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border)' }}>
                <input
                  type="text"
                  placeholder="🔍 Buscar cobros por póliza, aseguradora, referencia o estado..."
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
                    <option value="en_revision">🟡 En Revisión</option>
                    <option value="pendiente">⚪ Pendiente de Pago</option>
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
                    style={{ fontSize: '0.85rem', padding: '0.5rem 0.85rem', whiteSpace: 'nowrap' }}
                  >
                    {Object.keys(expandedPolicies).length === groupedPaymentsByPolicy.length ? 'Contraer Todas' : 'Expandir Todas'}
                  </button>
                </div>
              </div>

              {/* LISTADO DE PÓLIZAS CON SUS CUOTAS INDIVIDUALES */}
              {groupedPaymentsByPolicy.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', background: '#f8fafc', borderRadius: '8px', border: '1px dashed var(--border)' }}>
                  No hay cobros registrados con los criterios seleccionados.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {groupedPaymentsByPolicy
                    .slice((pagePayments - 1) * pageSizePayments, pagePayments * pageSizePayments)
                    .map((group) => {
                    const groupKey = group.poliza_id || group.poliza_codigo;
                    const isExpanded = expandedPolicies[groupKey] !== false; // Abierto por defecto
                    const progressPercent = group.totalCuotas > 0 ? Math.round((group.cuotasPagadas / group.totalCuotas) * 100) : 0;

                    return (
                      <div
                        key={groupKey}
                        style={{
                          background: '#ffffff',
                          border: group.cuotasEnRevision > 0 ? '2px solid #f59e0b' : '1.5px solid var(--border)',
                          borderRadius: '12px',
                          overflow: 'hidden',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.04)'
                        }}
                      >
                        {/* Cabecera de la Póliza Individual */}
                        <div 
                          style={{ 
                            padding: '1.25rem', 
                            background: group.cuotasEnRevision > 0 ? '#fffbeb' : '#f8fafc', 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '1rem',
                            cursor: 'pointer',
                            borderBottom: isExpanded ? '1px solid var(--border)' : 'none'
                          }}
                          onClick={() => setExpandedPolicies(prev => ({ ...prev, [groupKey]: !isExpanded }))}
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
                                <strong style={{ fontSize: '1.1rem', color: 'var(--primary)' }}>{group.poliza_codigo}</strong>
                                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>• {group.compania_nombre}</span>
                              </div>
                              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                                Plan {group.plan} | Modalidad: <span style={{ textTransform: 'capitalize' }}>{group.frecuencia}</span>
                              </div>
                            </div>
                          </div>

                          {/* Estadísticas de Cobro */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>
                                {group.cuotasPagadas}/{group.totalCuotas} Cuotas Pagadas ({progressPercent}%)
                              </div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                Pagado: ${group.montoTotalCobrado.toFixed(2)} de ${group.montoTotalCuotas.toFixed(2)}
                              </div>
                            </div>

                            {/* Badges de Alerta */}
                            {group.cuotasEnRevision > 0 && (
                              <span style={{ background: '#f59e0b', color: '#fff', fontSize: '0.75rem', fontWeight: 'bold', padding: '0.25rem 0.6rem', borderRadius: '20px' }}>
                                🟡 {group.cuotasEnRevision} en Revisión
                              </span>
                            )}

                            {group.cuotasPendientes > 0 && (
                              <span style={{ background: '#e2e8f0', color: '#475569', fontSize: '0.75rem', fontWeight: 'bold', padding: '0.25rem 0.6rem', borderRadius: '20px' }}>
                                ⚪ {group.cuotasPendientes} por Pagar
                              </span>
                            )}

                            {group.cuotasRechazadas > 0 && (
                              <span style={{ background: '#fee2e2', color: '#dc2626', fontSize: '0.75rem', fontWeight: 'bold', padding: '0.25rem 0.6rem', borderRadius: '20px' }}>
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
                          <div style={{ padding: '0.75rem' }}>
                            {group.cuotas.length === 0 ? (
                              <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                No hay cuotas registradas para esta póliza.
                              </div>
                            ) : (
                              <div className="table-container" style={{ margin: 0 }}>
                                <table className="table" style={{ fontSize: '0.85rem' }}>
                                  <thead>
                                    <tr>
                                      <th>Cuota / Nro</th>
                                      <th>Monto Cuota ($)</th>
                                      <th>Vencimiento</th>
                                      <th>Estatus</th>
                                      <th>Referencia Bancaria</th>
                                      <th>Fecha Pago</th>
                                      <th>Acción</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {group.cuotas.map((pa, idx) => (
                                      <tr key={pa.id} style={{ background: pa.estado_pago === 'en_revision' ? '#fffbeb' : 'inherit' }}>
                                        <td>
                                          <strong>Cuota #{pa.cuota_numero || (idx + 1)}</strong>
                                        </td>
                                        <td>
                                          <strong style={{ color: 'var(--primary)' }}>${parseFloat(pa.monto).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                                        </td>
                                        <td>
                                          {pa.fecha_vencimiento ? pa.fecha_vencimiento.split('T')[0] : 'N/A'}
                                        </td>
                                        <td>
                                          <span 
                                            className="badge"
                                            style={{
                                              background: pa.estado_pago === 'pagado' ? '#e6fffa' : pa.estado_pago === 'en_revision' ? '#fffbeb' : pa.estado_pago === 'rechazado' ? '#fee2e2' : '#f1f5f9',
                                              color: pa.estado_pago === 'pagado' ? '#047487' : pa.estado_pago === 'en_revision' ? '#b45309' : pa.estado_pago === 'rechazado' ? '#b91c1c' : '#475569',
                                              fontWeight: 'bold'
                                            }}
                                          >
                                            {pa.estado_pago === 'en_revision' ? 'EN REVISIÓN' : pa.estado_pago.toUpperCase()}
                                          </span>
                                        </td>
                                        <td>
                                          {pa.referencia ? (
                                            <span style={{ fontFamily: 'monospace', background: 'var(--secondary)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                                              {pa.referencia}
                                            </span>
                                          ) : (
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No Informado</span>
                                          )}
                                        </td>
                                        <td>
                                          {pa.fecha_pago ? (typeof pa.fecha_pago === 'string' ? pa.fecha_pago.split('T')[0] : new Date(pa.fecha_pago).toISOString().split('T')[0]) : '—'}
                                        </td>
                                        <td>
                                          {pa.estado_pago === 'pendiente' || pa.estado_pago === 'rechazado' ? (
                                            <button 
                                              onClick={() => handleOpenPayModal(pa)} 
                                              className="btn btn-primary"
                                              style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', cursor: 'pointer' }}
                                            >
                                              💳 Reportar en Bs.
                                            </button>
                                          ) : pa.estado_pago === 'en_revision' ? (
                                            <span style={{ color: '#b45309', fontWeight: 'bold', fontSize: '0.8rem' }}>🟡 Esperando Aprobación</span>
                                          ) : (
                                            <span style={{ color: '#10b981', fontWeight: 'bold', fontSize: '0.8rem' }}>✓ Pagado</span>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
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

          {/* TAB: MIS ASESORES */}
          {activeTab === 'asesores' && (
            <div className="card">
              <h3 className="card-title" style={{ marginBottom: '1.5rem' }}>Mis Intermediarios Asignados</h3>
              <div style={{ marginBottom: '1.2rem' }}>
                <input
                  type="text"
                  placeholder="🔍 Buscar asesores por nombre o código..."
                  className="form-input"
                  style={{ maxWidth: '350px', padding: '0.5rem 1rem', margin: 0 }}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="results-grid">
                {filteredAdvisors.length === 0 ? (
                  <div style={{ gridColumn: '1 / -1', padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No se encontraron asesores que coincidan con la búsqueda.
                  </div>
                ) : (
                  filteredAdvisors.map((adv) => (
                    <div key={adv.id} className="result-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--primary)' }}>{adv.nombre}</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Código de Broker: {adv.codigo_asesor}</div>
                      <div style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
                        <strong>Correo:</strong> {adv.correo}
                      </div>
                      <div style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>
                        <strong>Teléfono:</strong> {adv.telefono}
                      </div>
                      <a 
                        href={createWhatsAppLink(adv.telefono, `Hola ${adv.nombre}, necesito soporte con mis pólizas en Protección y Seguros 360.`)}
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="btn"
                        style={{ background: '#25d366', color: '#fff', border: 'none', textAlign: 'center', fontWeight: 'bold', textDecoration: 'none', display: 'block', width: '100%', marginTop: 'auto' }}
                      >
                        Contactar por WhatsApp
                      </a>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* MODAL DE REPORTE DE PAGO EN BOLÍVARES CON TASA BCV */}
          {payModal && (
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
                maxWidth: '500px',
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
                    💳 Reportar Pago en Bolívares
                  </h3>
                  <button 
                    onClick={() => setPayModal(null)}
                    style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-muted)' }}
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleReportPayment}>
                  <div style={{ marginBottom: '1.25rem', padding: '0.85rem', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '0.85rem' }}>
                    <p style={{ margin: '0 0 0.35rem 0' }}><strong>Póliza:</strong> {payModal.poliza_codigo}</p>
                    <p style={{ margin: '0 0 0.35rem 0' }}><strong>Aseguradora:</strong> {payModal.compania_nombre}</p>
                    <p style={{ margin: 0, color: 'var(--primary)', fontWeight: 700, fontSize: '0.95rem' }}>
                      <strong>Cuota Referencial:</strong> ${payModal.monto} USD
                    </p>
                  </div>

                  <div style={{ padding: '0.85rem', backgroundColor: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe', marginBottom: '1.25rem', fontSize: '0.85rem', color: '#1e40af' }}>
                    ℹ️ <strong>Información:</strong> Ingrese el monto pagado en <strong>Bolívares (Bs. VES)</strong> calculado a la tasa oficial del BCV del día de la transferencia o pago móvil. El administrador validará el comprobante bancario.
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
                        value={payForm.monto_reportado_ves} 
                        onChange={e => {
                          let val = e.target.value.replace(/[^0-9.,]/g, '');
                          setPayForm({ ...payForm, monto_reportado_ves: val });
                        }}
                        required 
                      />
                    </div>
                    <span style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.35rem', display: 'block' }}>
                      💡 Escriba el monto pagado (ej: <strong>1.500,50</strong> o <strong>1500.50</strong>).
                    </span>
                  </div>

                  <div className="form-grid" style={{ marginBottom: '1rem' }}>
                    <div className="form-group">
                      <label className="form-label">Fecha del Pago *</label>
                      <input 
                        type="date" 
                        className="form-input" 
                        value={payForm.fecha_pago} 
                        onChange={e => setPayForm({ ...payForm, fecha_pago: e.target.value })}
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
                        value={payForm.referencia} 
                        onChange={e => {
                          const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                          setPayForm({ ...payForm, referencia: val });
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
                      placeholder="Ej: Pago móvil Banesco, Transferencia Mercantil..."
                      value={payForm.observaciones} 
                      onChange={e => setPayForm({ ...payForm, observaciones: e.target.value })}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setPayModal(null)}
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
