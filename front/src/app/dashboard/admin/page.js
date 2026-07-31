"use client";

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/ToastProvider';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api';

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
  
  // --- ESTADOS INTERNOS ---
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('resumen'); // 'resumen', 'polizas', 'pagos', 'roles', 'tarifas', 'trazabilidad'
  const [fileToUpload, setFileToUpload] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

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

    } catch (err) {
      console.error('Error al cargar datos de administración:', err);
      showToast('Error al conectar con la base de datos.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (hydrated && isLoggedIn && user?.rango === 'admin') {
      loadData();
    }
  }, [hydrated, isLoggedIn, user]);

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
          tipo_cobertura: policy.tipo_cobertura,
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
          tipo_cobertura: tariff.tipo_cobertura,
          edad_min: parseInt(tariff.edad_min),
          edad_max: parseInt(tariff.edad_max),
          suma_asegurada: parseFloat(tariff.suma_asegurada),
          prima: parseFloat(tariff.prima)
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
      tipo_cobertura: 'colectivo',
      edad_min: 30,
      edad_max: 39,
      suma_asegurada: 5000,
      prima: 200
    };
    setTariffs(prev => [...prev, newRow]);
    setModifiedRows(prev => ({ ...prev, [tempId]: true }));
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
    .filter(p => p.estado_pago === 'pagado')
    .reduce((sum, p) => sum + parseFloat(p.monto), 0);

  const pagosPendientesCount = payments.filter(p => p.estado_pago === 'pendiente').length;

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
      t.tipo_cobertura?.toLowerCase().includes(q) ||
      String(t.edad_min).includes(q) ||
      String(t.edad_max).includes(q) ||
      String(t.suma_asegurada).includes(q) ||
      String(t.prima).includes(q)
    );
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
        {['resumen', 'polizas', 'pagos', 'roles', 'tarifas', 'trazabilidad'].map((tab) => (
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
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
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
                <table className="table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Cliente</th>
                      <th>Aseguradora</th>
                      <th>Tipo</th>
                      <th>Suma Asegurada ($)</th>
                      <th>Prima Anual ($)</th>
                      <th>Asesor Asignado</th>
                      <th>Estado</th>
                      <th style={{ textAlign: 'center' }}>Acciones</th>
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
                            <td>{p.tipo_cobertura === 'colectivo' ? 'Colectivo' : 'Individual'}</td>
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
                            <td style={{ textAlign: 'center' }}>
                              <button
                                onClick={() => handleSavePolicy(p)}
                                className="btn btn-primary"
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', visibility: isModified ? 'visible' : 'hidden' }}
                                disabled={loading}
                              >
                                Guardar
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
              <h3 className="card-title" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', border: 'none' }}>
                <span>Matriz de Tarifas (Planilla Interactiva)</span>
                <button onClick={handleAddTariffRow} className="btn btn-accent" style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}>
                  + Agregar Fila
                </button>
              </h3>

              {/* Buscador de planilla */}
              <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.5rem' }}>
                <input
                  type="text"
                  placeholder="🔍 Buscar por aseguradora, cobertura, edad o prima..."
                  className="form-input"
                  style={{ maxWidth: '350px', padding: '0.5rem 1rem', margin: 0 }}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                
                {/* Botón secundario para mostrar panel de carga masiva JSON */}
                <details style={{ background: 'var(--secondary)', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', border: '1px solid var(--border)' }}>
                  <summary style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--primary)', userSelect: 'none' }}>Opciones de Carga Masiva JSON</summary>
                  <div style={{ marginTop: '1rem', cursor: 'default' }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1rem' }}>
                      Sube un archivo JSON estructurado para sobreescribir y actualizar masivamente la matriz.
                    </p>
                    <form onSubmit={handleBulkUpload} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
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
                  </div>
                </details>
              </div>

              {/* SpreadSheet Grid */}
              <div className="table-container" style={{ maxHeight: '600px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
                <table className="table" style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead>
                    <tr style={{ background: 'var(--secondary)' }}>
                      <th style={{ border: '1px solid var(--border)', padding: '0.5rem' }}>Aseguradora</th>
                      <th style={{ border: '1px solid var(--border)', padding: '0.5rem', width: '130px' }}>Cobertura</th>
                      <th style={{ border: '1px solid var(--border)', padding: '0.5rem', width: '90px' }}>Edad Mín</th>
                      <th style={{ border: '1px solid var(--border)', padding: '0.5rem', width: '90px' }}>Edad Máx</th>
                      <th style={{ border: '1px solid var(--border)', padding: '0.5rem', width: '130px' }}>Suma Asegurada ($)</th>
                      <th style={{ border: '1px solid var(--border)', padding: '0.5rem', width: '110px' }}>Prima ($)</th>
                      <th style={{ border: '1px solid var(--border)', padding: '0.5rem', width: '145px', textAlign: 'center' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTariffs.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="text-center" style={{ padding: '2rem', color: 'var(--text-muted)' }}>
                          No hay tarifas registradas en la planilla.
                        </td>
                      </tr>
                    ) : (
                      filteredTariffs.map((t) => {
                        const isModified = !!modifiedRows[t.id];
                        const isNew = String(t.id).startsWith('new-');
                        
                        return (
                          <tr key={t.id} style={{ background: isNew ? '#f0fff4' : isModified ? '#fffaf0' : 'transparent' }}>
                            {/* Aseguradora Select */}
                            <td style={{ border: '1px solid var(--border)', padding: '0.25rem' }}>
                              <select
                                value={t.compania_id || ''}
                                onChange={(e) => handleCellChange(t.id, 'compania_id', e.target.value)}
                                style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', color: 'inherit', fontWeight: 'bold', padding: '0.25rem' }}
                              >
                                {companies.map(c => (
                                  <option key={c.id} value={c.id}>{c.nombre}</option>
                                ))}
                              </select>
                            </td>

                            {/* Cobertura Select */}
                            <td style={{ border: '1px solid var(--border)', padding: '0.25rem' }}>
                              <select
                                value={t.tipo_cobertura}
                                onChange={(e) => handleCellChange(t.id, 'tipo_cobertura', e.target.value)}
                                style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', color: 'inherit', padding: '0.25rem' }}
                              >
                                <option value="colectivo">Colectivo</option>
                                <option value="individual">Individual</option>
                              </select>
                            </td>

                            {/* Edad Mín Input */}
                            <td style={{ border: '1px solid var(--border)', padding: '0.25rem' }}>
                              <input
                                type="number"
                                value={t.edad_min ?? ''}
                                onChange={(e) => handleCellChange(t.id, 'edad_min', e.target.value)}
                                style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', padding: '0.25rem', textAlign: 'center' }}
                              />
                            </td>

                            {/* Edad Máx Input */}
                            <td style={{ border: '1px solid var(--border)', padding: '0.25rem' }}>
                              <input
                                type="number"
                                value={t.edad_max ?? ''}
                                onChange={(e) => handleCellChange(t.id, 'edad_max', e.target.value)}
                                style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', padding: '0.25rem', textAlign: 'center' }}
                              />
                            </td>

                            {/* Suma Asegurada Input */}
                            <td style={{ border: '1px solid var(--border)', padding: '0.25rem' }}>
                              <input
                                type="number"
                                value={t.suma_asegurada ?? ''}
                                onChange={(e) => handleCellChange(t.id, 'suma_asegurada', e.target.value)}
                                style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', padding: '0.25rem', fontWeight: 600 }}
                              />
                            </td>

                            {/* Prima Input */}
                            <td style={{ border: '1px solid var(--border)', padding: '0.25rem' }}>
                              <input
                                type="number"
                                value={t.prima ?? ''}
                                onChange={(e) => handleCellChange(t.id, 'prima', e.target.value)}
                                style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', padding: '0.25rem', fontWeight: 'bold', color: 'var(--accent)' }}
                              />
                            </td>

                            {/* Acciones */}
                            <td style={{ border: '1px solid var(--border)', padding: '0.25rem', textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'center' }}>
                                <button
                                  onClick={() => handleSaveTariff(t)}
                                  className="btn btn-primary"
                                  style={{ 
                                    padding: '0.25rem 0.5rem', 
                                    fontSize: '0.75rem', 
                                    visibility: (isModified || isNew) ? 'visible' : 'hidden' 
                                  }}
                                  disabled={loading}
                                >
                                  {isNew ? 'Crear' : 'Guardar'}
                                </button>
                                <button
                                  onClick={() => handleDeleteTariff(t.id)}
                                  className="btn"
                                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#fee2e2', color: '#ef4444', border: '1px solid #fecaca', cursor: 'pointer' }}
                                  disabled={loading}
                                >
                                  Eliminar
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
        </div>
      )}
    </div>
  );
}
