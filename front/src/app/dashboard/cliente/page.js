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
  }, [hydrated, isLoggedIn, user]);

  // Reportar pago
  const handleReportPayment = async (paymentId) => {
    const ref = reportedRefs[paymentId];
    if (!ref || !ref.trim()) {
      return showToast('Por favor, introduzca una referencia bancaria válida.', 'error');
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/payments/${paymentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ referencia: ref, estado_pago: 'pagado' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al reportar pago');

      showToast('Pago reportado con éxito. Se actualizará en breve.');
      setReportedRefs(prev => {
        const copy = { ...prev };
        delete copy[paymentId];
        return copy;
      });
      loadData();
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

  const filteredPayments = payments.filter(pa =>
    !searchQuery ||
    pa.poliza_codigo?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    pa.compania_nombre?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    pa.referencia?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    pa.estado_pago?.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
                      <th>Prima Anual</th>
                      <th>Asesor JKA</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPolicies.length === 0 ? (
                      <tr><td colSpan="7" className="text-center">No hay pólizas que coincidan con la búsqueda.</td></tr>
                    ) : (
                      filteredPolicies.map((p) => (
                        <tr key={p.id}>
                          <td><strong>{p.codigo_poliza}</strong></td>
                          <td>{p.plan || 'N/A'}</td>
                          <td>{p.area}</td>
                          <td>${parseFloat(p.suma_asegurada).toLocaleString('en-US')}</td>
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
            </div>
          )}

          {/* TAB: MIS PAGOS */}
          {activeTab === 'pagos' && (
            <div className="card">
              <h3 className="card-title" style={{ marginBottom: '1.5rem' }}>Estatus de Cuotas y Facturas</h3>
              <div style={{ marginBottom: '1.2rem' }}>
                <input
                  type="text"
                  placeholder="🔍 Buscar cobros por póliza, aseguradora, referencia o estado..."
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
                      <th>Aseguradora</th>
                      <th>Monto a Pagar</th>
                      <th>Fecha Vencimiento</th>
                      <th>Estatus</th>
                      <th>Referencia Reportada</th>
                      <th>Reportar Pago</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPayments.length === 0 ? (
                      <tr><td colSpan="7" className="text-center">No hay cuotas que coincidan con la búsqueda.</td></tr>
                    ) : (
                      filteredPayments.map((pa) => (
                        <tr key={pa.id}>
                          <td><strong>{pa.poliza_codigo}</strong></td>
                          <td>{pa.compania_nombre}</td>
                          <td>${parseFloat(pa.monto).toLocaleString('en-US')}</td>
                          <td>{pa.fecha_vencimiento ? pa.fecha_vencimiento.split('T')[0] : 'N/A'}</td>
                          <td>
                            <span 
                              className="badge"
                              style={{
                                background: pa.estado_pago === 'pagado' ? '#e6fffa' : '#fffbeb',
                                color: pa.estado_pago === 'pagado' ? '#047487' : '#b45309',
                                fontWeight: 'bold'
                              }}
                            >
                              {pa.estado_pago.toUpperCase()}
                            </span>
                          </td>
                          <td>
                            {pa.referencia ? (
                              <span style={{ fontFamily: 'monospace', background: 'var(--secondary)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                                {pa.referencia}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No Informado</span>
                            )}
                          </td>
                          <td>
                            {pa.estado_pago === 'pendiente' ? (
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <input 
                                  type="text" 
                                  placeholder="Nro. Referencia" 
                                  className="form-input" 
                                  style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem', width: '130px', margin: 0 }}
                                  value={reportedRefs[pa.id] || ''}
                                  onChange={(e) => setReportedRefs({ ...reportedRefs, [pa.id]: e.target.value })}
                                />
                                <button 
                                  onClick={() => handleReportPayment(pa.id)} 
                                  className="btn btn-accent"
                                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem', cursor: 'pointer' }}
                                >
                                  Reportar
                                </button>
                              </div>
                            ) : (
                              <span style={{ color: '#10b981', fontWeight: 'bold', fontSize: '0.85rem' }}>✓ Completado</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
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
                        href={`https://wa.me/${adv.telefono.replace(/[^0-9]/g, '')}?text=Hola%20${encodeURIComponent(adv.nombre)}%20necesito%20soporte%20con%20mis%20polizas%20JKA`}
                        target="_blank" 
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
        </div>
      )}
    </div>
  );
}
