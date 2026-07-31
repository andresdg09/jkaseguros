"use client";

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/ToastProvider';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api';

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

  // --- ESTADOS DE PANELES ---
  const [activeTab, setActiveTab] = useState('clientes'); // 'clientes', 'registrar-cliente', 'pagos'
  const [searchQuery, setSearchQuery] = useState('');
  
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
      loadData();
    }
  }, [hydrated, isLoggedIn, user]);

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
          // Mensaje de texto formateado en lugar de PDF
          cotizacion_pdf: Buffer.from(`Estimado cliente, tiene un cobro pendiente de $${payment.monto} con fecha de vencimiento. Por favor ingrese a su panel JKA y reporte la referencia. Saludos, ${advisorName}.`).toString('base64')
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
                              <a 
                                href={`https://wa.me/${c.telefono.replace(/[^0-9]/g, '')}`} 
                                target="_blank" 
                                className="btn"
                                style={{ background: '#25d366', color: '#fff', border: 'none', fontSize: '0.8rem', padding: '0.2rem 0.5rem', textDecoration: 'none', display: 'inline-block' }}
                              >
                                WhatsApp
                              </a>
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
        </div>
      )}
    </div>
  );
}
