"use client";

import React, { useState, useEffect } from 'react';

const API_URL = 'https://jkaseguros.onrender.com/api';

export default function Home() {
  // --- ESTADOS DE AUTENTICACIÓN ---
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [cliente, setCliente] = useState(null);
  const [asesor, setAsesor] = useState(null);

  // --- ESTADOS DE INTERFAZ ---
  const [activeModal, setActiveModal] = useState(null); // 'login', 'register', 'profile', 'admin-section'
  const [adminTab, setAdminTab] = useState(null); // 'data', 'polizas', 'clientes', 'asesores', 'usuarios', 'mis-pagos', 'mis-asesores'
  const [toasts, setToasts] = useState([]); // { id, message, type }
  const [loading, setLoading] = useState(false);
  const [quotingResults, setQuotingResults] = useState(null);

  // --- ESTADOS DE LOS FORMULARIOS ---
  const [loginForm, setLoginForm] = useState({ correo: '', contrasena: '' });
  const [quoteForm, setQuoteForm] = useState({
    fecha_nacimiento: '',
    tipo_documento: 'Venezolano',
    nro_documento: '',
    primer_nombre: '',
    segundo_nombre: '',
    primer_apellido: '',
    segundo_apellido: '',
    genero: 'Masculino',
    estado_civil: 'Soltero',
    correo: '',
    confirmar_correo: '',
    codigo_area: '0412',
    numero_celular: '',
    tipo_cobertura: 'colectivo' // 'colectivo' o 'individual'
  });
  const [contrasenaRegistro, setContrasenaRegistro] = useState(''); // para la contraseña en el modal de registro

  // --- ESTADOS DE LOS PANELES Y MODALES INTERNOS ---
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminClients, setAdminClients] = useState([]);
  const [adminAdvisors, setAdminAdvisors] = useState([]);
  const [adminPolicies, setAdminPolicies] = useState([]);
  const [adminPayments, setAdminPayments] = useState([]);
  const [fileToUpload, setFileToUpload] = useState(null);

  // --- EFECTOS INICIALES ---
  useEffect(() => {
    // Cargar credenciales desde localStorage si existen
    const storedToken = localStorage.getItem('jka_token');
    const storedUser = localStorage.getItem('jka_user');
    const storedCliente = localStorage.getItem('jka_cliente');
    const storedAsesor = localStorage.getItem('jka_asesor');

    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
      if (storedCliente) setCliente(JSON.parse(storedCliente));
      if (storedAsesor) setAsesor(JSON.parse(storedAsesor));
    }
  }, []);

  // Rellenar formulario cuando cambia el estado de cliente
  useEffect(() => {
    if (cliente) {
      setQuoteForm(prev => ({
        ...prev,
        fecha_nacimiento: cliente.fecha_nacimiento ? cliente.fecha_nacimiento.split('T')[0] : '',
        tipo_documento: cliente.tipo_documento || 'Venezolano',
        nro_documento: cliente.nro_documento || '',
        primer_nombre: cliente.primer_nombre || '',
        segundo_nombre: cliente.segundo_nombre || '',
        primer_apellido: cliente.primer_apellido || '',
        segundo_apellido: cliente.segundo_apellido || '',
        genero: cliente.genero || 'Masculino',
        estado_civil: cliente.estado_civil || 'Soltero',
        correo: user?.correo || '',
        confirmar_correo: user?.correo || '',
        codigo_area: cliente.codigo_area || '0412',
        numero_celular: cliente.numero_celular || '',
      }));
    } else {
      // Limpiar formulario si se desloguea
      setQuoteForm({
        fecha_nacimiento: '',
        tipo_documento: 'Venezolano',
        nro_documento: '',
        primer_nombre: '',
        segundo_nombre: '',
        primer_apellido: '',
        segundo_apellido: '',
        genero: 'Masculino',
        estado_civil: 'Soltero',
        correo: '',
        confirmar_correo: '',
        codigo_area: '0412',
        numero_celular: '',
        tipo_cobertura: 'colectivo'
      });
    }
  }, [cliente, user]);

  // --- MENSAJES TOAST ALERTA ---
  const showToast = (message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // --- ACCIONES DE AUTENTICACIÓN ---

  // Iniciar Sesión
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (!loginForm.correo || !loginForm.contrasena) {
      return showToast('Por favor, introduce correo y contraseña.', 'error');
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error en inicio de sesión');

      localStorage.setItem('jka_token', data.token);
      localStorage.setItem('jka_user', JSON.stringify(data.user));
      if (data.cliente) localStorage.setItem('jka_cliente', JSON.stringify(data.cliente));
      if (data.asesor) localStorage.setItem('jka_asesor', JSON.stringify(data.asesor));

      setToken(data.token);
      setUser(data.user);
      setCliente(data.cliente);
      setAsesor(data.asesor);
      
      showToast(`¡Bienvenido de nuevo, ${data.cliente ? data.cliente.primer_nombre : data.user.correo}!`);
      setActiveModal(null);
      setLoginForm({ correo: '', contrasena: '' });
      
      // Limpiar cotización previa para forzar una nueva
      setQuotingResults(null);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Registro de Usuario
  const handleRegisterSubmit = async (e) => {
    e.preventDefault();

    if (quoteForm.correo !== quoteForm.confirmar_correo) {
      return showToast('Los correos electrónicos no coinciden.', 'error');
    }

    if (!contrasenaRegistro) {
      return showToast('Debe introducir una contraseña para su cuenta.', 'error');
    }

    setLoading(true);
    try {
      const payload = {
        ...quoteForm,
        correo: quoteForm.correo || user?.correo,
        contrasena: contrasenaRegistro,
        rango: 'cliente' // Por defecto
      };

      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al registrarse');

      // Guardar sesión tras el registro directo
      localStorage.setItem('jka_token', data.token);
      localStorage.setItem('jka_user', JSON.stringify(data.user));
      localStorage.setItem('jka_cliente', JSON.stringify(data.cliente));

      setToken(data.token);
      setUser(data.user);
      setCliente(data.cliente);
      setContrasenaRegistro('');
      
      showToast('Registro e inicio de sesión exitosos.');
      setActiveModal(null);
      
      // Auto-cotizar tras registrarse exitosamente si venía de presionar cotizar
      setTimeout(() => {
        ejecutarCotizacion(data.cliente);
      }, 300);

    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Cerrar Sesión
  const handleLogout = () => {
    localStorage.removeItem('jka_token');
    localStorage.removeItem('jka_user');
    localStorage.removeItem('jka_cliente');
    localStorage.removeItem('jka_asesor');
    setToken(null);
    setUser(null);
    setCliente(null);
    setAsesor(null);
    setQuotingResults(null);
    setActiveModal(null);
    setAdminTab(null);
    showToast('Sesión cerrada correctamente.');
  };

  // Actualizar Perfil
  const handleProfileSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(quoteForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar cambios');

      localStorage.setItem('jka_cliente', JSON.stringify(data.cliente));
      setCliente(data.cliente);
      showToast('Datos de perfil actualizados correctamente.');
      setActiveModal(null);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // --- OPERACIONES DE COTIZACIÓN ---

  // Ejecutar llamada a API de cotización
  const ejecutarCotizacion = async (clienteActivo) => {
    if (!clienteActivo) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha_nacimiento: clienteActivo.fecha_nacimiento,
          tipo_cobertura: quoteForm.tipo_cobertura
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al cotizar');
      
      setQuotingResults(data);
      showToast('Cotización calculada con éxito.');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Botón "Cotizar" del formulario de inicio
  const handleQuoteClick = (e) => {
    e.preventDefault();
    
    // Validar campos básicos del inicio antes de cotizar/registrar
    if (!quoteForm.primer_nombre || !quoteForm.primer_apellido || !quoteForm.fecha_nacimiento || !quoteForm.nro_documento || !quoteForm.numero_celular || !quoteForm.correo) {
      return showToast('Por favor, rellene los campos obligatorios del formulario.', 'error');
    }

    if (!token) {
      // El usuario no está logueado -> Mostrar modal de registro
      // mantendrá los datos actuales del formulario, solo pidiendo la contraseña
      setActiveModal('register');
      showToast('Por favor, cree una contraseña para registrarse y obtener su cotización.', 'info');
    } else {
      // Usuario logueado -> Ejecutar cotización
      ejecutarCotizacion(cliente);
    }
  };

  // Descargar PDF de cotización comparativa
  const downloadPdf = async () => {
    if (!quotingResults || !cliente) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/quote/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente,
          edad: quotingResults.edad,
          tipo_cobertura: quotingResults.tipo_cobertura,
          comparativas: quotingResults.comparativa
        })
      });

      if (!res.ok) throw new Error('Error al descargar el PDF');
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cotizacion_jka_${cliente.nro_documento}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast('PDF de cotización descargado con éxito.');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Crear póliza tras elegir compañía de seguros en la comparativa
  const handleContratarPoliza = async (compania) => {
    if (!token) return showToast('Debe iniciar sesión para solicitar la póliza.', 'error');
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/policies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          compania_id: compania.id,
          tipo_cobertura: quoteForm.tipo_cobertura,
          suma_asegurada: compania.suma_asegurada_tarifa || 5000,
          prima_anual: compania.prima
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al solicitar póliza');

      showToast(`¡Solicitud enviada! Póliza creada con ID: ${data.poliza.codigo_poliza}. Estado: Negociación.`);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // --- CARGA DE DATOS PARA PANELES DE ADMINISTRACIÓN Y REPORTES ---

  const openAdminTab = async (tabName) => {
    setAdminTab(tabName);
    setActiveModal('admin-section');
    setLoading(true);
    try {
      if (tabName === 'usuarios') {
        const res = await fetch(`${API_URL}/admin/users`, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        setAdminUsers(data);
      } else if (tabName === 'clientes') {
        if (user.rango === 'admin') {
          const res = await fetch(`${API_URL}/admin/clients`, { headers: { 'Authorization': `Bearer ${token}` } });
          const data = await res.json();
          setAdminClients(data);
        } else if (user.rango === 'asesor') {
          const res = await fetch(`${API_URL}/advisor/clients`, { headers: { 'Authorization': `Bearer ${token}` } });
          const data = await res.json();
          setAdminClients(data);
        }
      } else if (tabName === 'asesores') {
        if (user.rango === 'admin') {
          const res = await fetch(`${API_URL}/admin/advisors`, { headers: { 'Authorization': `Bearer ${token}` } });
          const data = await res.json();
          setAdminAdvisors(data);
        } else if (user.rango === 'cliente') {
          const res = await fetch(`${API_URL}/client/advisors`, { headers: { 'Authorization': `Bearer ${token}` } });
          const data = await res.json();
          setAdminAdvisors(data);
        }
      } else if (tabName === 'polizas') {
        const res = await fetch(`${API_URL}/policies`, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        setAdminPolicies(data);
      } else if (tabName === 'mis-pagos') {
        const res = await fetch(`${API_URL}/client/payments`, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        setAdminPayments(data);
      }
    } catch (err) {
      showToast('Error al cargar datos de la sección.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Cambiar rol de usuario (Admin)
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

      setAdminUsers(prev => prev.map(u => u.id === userId ? { ...u, rango: newRole } : u));
      showToast('Rango de usuario actualizado correctamente.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Modificar estado de póliza (Asesor / Admin)
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

      setAdminPolicies(prev => prev.map(p => p.id === policyId ? { ...p, estado: newStatus } : p));
      showToast('Estado de póliza actualizado.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Carga masiva de tarifas desde JSON
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
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      {/* Toast Alert list */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type === 'error' ? 'toast-error' : 'toast-success'}`}>
            <span>{t.type === 'error' ? '❌' : '✅'}</span>
            <div>{t.message}</div>
          </div>
        ))}
      </div>

      {/* --- NAVBAR --- */}
      <nav className="navbar">
        <a href="#" className="nav-brand">
          💼 <span>JKA Seguros</span>
        </a>
        <div className="nav-actions">
          {!token ? (
            <>
              <button className="btn btn-secondary" onClick={() => setActiveModal('login')}>Iniciar Sesión</button>
              <button className="btn btn-primary" onClick={() => {
                // Limpiar contraseña de registro anterior
                setContrasenaRegistro('');
                setActiveModal('register');
              }}>Regístrate</button>
            </>
          ) : (
            <>
              <span className="user-email-tag" style={{ marginRight: '1rem', opacity: 0.8, fontSize: '0.9rem' }}>
                👤 {user.correo} ({user.rango})
              </span>
              <button className="btn btn-secondary" onClick={() => setActiveModal('profile')}>Mi Perfil</button>
              <button className="btn btn-primary" onClick={() => setActiveModal('admin-section')}>Panel Administrativo</button>
              <button className="btn btn-danger" onClick={handleLogout}>Salir</button>
            </>
          )}
        </div>
      </nav>

      {/* --- CONTENIDO PRINCIPAL --- */}
      <main className="main-content">
        <div className="card">
          <h2 className="card-title">Cotizador Inteligente de Seguros de Salud</h2>
          
          <form onSubmit={handleQuoteClick}>
            <div className="form-grid">
              
              {/* Fecha de nacimiento */}
              <div className="form-group">
                <label className="form-label">Indica tu fecha de nacimiento *</label>
                <input 
                  type="date" 
                  className="form-input" 
                  value={quoteForm.fecha_nacimiento} 
                  onChange={e => setQuoteForm({...quoteForm, fecha_nacimiento: e.target.value})} 
                  required
                />
              </div>

              {/* Tipo de documento */}
              <div className="form-group">
                <label className="form-label">Tipo de documento de identidad *</label>
                <select 
                  className="form-input" 
                  value={quoteForm.tipo_documento} 
                  onChange={e => setQuoteForm({...quoteForm, tipo_documento: e.target.value})}
                >
                  <option value="Venezolano">Venezolano</option>
                  <option value="Extranjero">Extranjero</option>
                  <option value="Juridico">Jurídico</option>
                  <option value="Pasaporte">Pasaporte</option>
                </select>
              </div>

              {/* Nro de documento */}
              <div className="form-group">
                <label className="form-label">Nro. Documento de identidad *</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Ej: 12345678"
                  value={quoteForm.nro_documento} 
                  onChange={e => setQuoteForm({...quoteForm, nro_documento: e.target.value})} 
                  required
                />
              </div>

              {/* Primer nombre */}
              <div className="form-group">
                <label className="form-label">Indicanos tu primer nombre *</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={quoteForm.primer_nombre} 
                  onChange={e => setQuoteForm({...quoteForm, primer_nombre: e.target.value})} 
                  required
                />
              </div>

              {/* Segundo nombre */}
              <div className="form-group">
                <label className="form-label">Indicanos tu segundo nombre</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={quoteForm.segundo_nombre} 
                  onChange={e => setQuoteForm({...quoteForm, segundo_nombre: e.target.value})} 
                />
              </div>

              {/* Género */}
              <div className="form-group">
                <label className="form-label">Selecciona tu género *</label>
                <select 
                  className="form-input" 
                  value={quoteForm.genero} 
                  onChange={e => setQuoteForm({...quoteForm, genero: e.target.value})}
                >
                  <option value="Masculino">Masculino</option>
                  <option value="Femenino">Femenino</option>
                </select>
              </div>

              {/* Primer apellido */}
              <div className="form-group">
                <label className="form-label">Indicanos tu primer apellido *</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={quoteForm.primer_apellido} 
                  onChange={e => setQuoteForm({...quoteForm, primer_apellido: e.target.value})} 
                  required
                />
              </div>

              {/* Segundo apellido */}
              <div className="form-group">
                <label className="form-label">Indicanos tu segundo apellido</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={quoteForm.segundo_apellido} 
                  onChange={e => setQuoteForm({...quoteForm, segundo_apellido: e.target.value})} 
                />
              </div>

              {/* Estado civil */}
              <div className="form-group">
                <label className="form-label">Estado civil</label>
                <select 
                  className="form-input" 
                  value={quoteForm.estado_civil} 
                  onChange={e => setQuoteForm({...quoteForm, estado_civil: e.target.value})}
                >
                  <option value="Soltero">Soltero/a</option>
                  <option value="Casado">Casado/a</option>
                  <option value="Divorciado">Divorciado/a</option>
                  <option value="Viudo">Viudo/a</option>
                </select>
              </div>

              {/* Correo */}
              <div className="form-group">
                <label className="form-label">Cuál es tu mejor correo *</label>
                <input 
                  type="email" 
                  className="form-input" 
                  placeholder="ejemplo@correo.com"
                  value={quoteForm.correo} 
                  onChange={e => setQuoteForm({...quoteForm, correo: e.target.value})} 
                  required
                />
              </div>

              {/* Confirmar correo */}
              <div className="form-group">
                <label className="form-label">Confirma tu correo *</label>
                <input 
                  type="email" 
                  className="form-input" 
                  placeholder="ejemplo@correo.com"
                  value={quoteForm.confirmar_correo} 
                  onChange={e => setQuoteForm({...quoteForm, confirmar_correo: e.target.value})} 
                  required
                />
              </div>

              {/* Tipo de cobertura */}
              <div className="form-group">
                <label className="form-label">Modalidad de Póliza *</label>
                <select 
                  className="form-input" 
                  value={quoteForm.tipo_cobertura} 
                  onChange={e => setQuoteForm({...quoteForm, tipo_cobertura: e.target.value})}
                >
                  <option value="colectivo">Colectivo (Póliza Grupal)</option>
                  <option value="individual">Individual (Póliza Particular)</option>
                </select>
              </div>

              {/* Celular: Código de Área */}
              <div className="form-group">
                <label className="form-label">Código de área *</label>
                <select 
                  className="form-input" 
                  value={quoteForm.codigo_area} 
                  onChange={e => setQuoteForm({...quoteForm, codigo_area: e.target.value})}
                >
                  <option value="0412">0412</option>
                  <option value="0414">0414</option>
                  <option value="0424">0424</option>
                  <option value="0416">0416</option>
                  <option value="0426">0426</option>
                </select>
              </div>

              {/* Celular: Número */}
              <div className="form-group">
                <label className="form-label">Indicanos tu número celular *</label>
                <input 
                  type="tel" 
                  className="form-input" 
                  placeholder="1234567"
                  value={quoteForm.numero_celular} 
                  onChange={e => setQuoteForm({...quoteForm, numero_celular: e.target.value})} 
                  required
                />
              </div>

              {/* Asesor / Compañía */}
              <div className="form-group">
                <label className="form-label">Asesor de Seguros *</label>
                <select className="form-input">
                  <option value="JKA">JKA BROKER VENEZUELA, C.A.</option>
                  <option value="SV">SEGUROS VENEZUELA, C.A.</option>
                </select>
              </div>

            </div>

            <button type="submit" className="btn btn-accent btn-center" disabled={loading}>
              {loading ? 'Calculando...' : 'Cotizar'}
            </button>
          </form>
        </div>

        {/* --- COMPARATIVA DE RESULTADOS DE COTIZACIÓN --- */}
        {quotingResults && (
          <div className="card" style={{ marginTop: '2rem' }}>
            <div className="justify-between align-center flex" style={{ marginBottom: '1.5rem', borderBottom: '2px solid var(--border)', paddingBottom: '1rem' }}>
              <div>
                <h3 className="card-title" style={{ border: 'none', margin: 0, padding: 0 }}>
                  Comparativa de Pólizas de Salud Encontradas
                </h3>
                <p style={{ fontSize: '0.9rem', opacity: 0.8 }}>
                  Edad calculada: <strong>{quotingResults.edad} años</strong> | Tipo de Cobertura: <strong>{quotingResults.tipo_cobertura.toUpperCase()}</strong>
                </p>
              </div>
              <button className="btn btn-primary" onClick={downloadPdf}>
                📥 Descargar Cuadro Comparativo (PDF)
              </button>
            </div>

            <div className="results-grid">
              {quotingResults.comparativa.map((comp) => {
                const isBest = comp.prima && comp.prima < 200; // marca alguna de ejemplo
                return (
                  <div key={comp.id} className={`result-card ${isBest ? 'best-price' : ''}`}>
                    {isBest && <span className="result-badge">Mejor Opción</span>}
                    
                    <div className="result-header">
                      <div className="result-company">{comp.nombre}</div>
                      <div className="result-price-box">
                        <span className="result-price">
                          {comp.prima ? `$${comp.prima}` : 'No Disponible'}
                        </span>
                        {comp.prima && <span className="result-price-period"> / año</span>}
                      </div>
                    </div>

                    <div className="result-features">
                      <div className="result-feature">
                        <span className="result-feature-label">Suma Salud:</span>
                        <span className="result-feature-value">
                          {quotingResults.tipo_cobertura === 'colectivo' ? comp.col_suma_salud : comp.ind_suma_salud}
                        </span>
                      </div>
                      <div className="result-feature">
                        <span className="result-feature-label">Deducible:</span>
                        <span className="result-feature-value">
                          {quotingResults.tipo_cobertura === 'colectivo' ? comp.col_deducible : comp.ind_deducible}
                        </span>
                      </div>
                      <div className="result-feature">
                        <span className="result-feature-label">Maternidad:</span>
                        <span className="result-feature-value">
                          {quotingResults.tipo_cobertura === 'colectivo' ? comp.col_maternidad : comp.ind_maternidad}
                        </span>
                      </div>
                      <div className="result-feature">
                        <span className="result-feature-label">Plazo Espera:</span>
                        <span className="result-feature-value">
                          {quotingResults.tipo_cobertura === 'colectivo' ? comp.col_espera_inicial : comp.ind_espera_vzla}
                        </span>
                      </div>
                      <div className="result-feature">
                        <span className="result-feature-label">Pago:</span>
                        <span className="result-feature-value">
                          {quotingResults.tipo_cobertura === 'colectivo' ? comp.col_condiciones_pago : comp.ind_condiciones_pago}
                        </span>
                      </div>
                    </div>

                    <button 
                      className="btn btn-primary" 
                      style={{ width: '100%' }}
                      onClick={() => handleContratarPoliza(comp)}
                      disabled={!comp.prima}
                    >
                      Solicitar Contratación
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* --- MODAL: INICIO DE SESIÓN --- */}
      {activeModal === 'login' && (
        <div className="modal-overlay">
          <div className="modal-content">
            <button className="modal-close" onClick={() => setActiveModal(null)}>×</button>
            <h3 className="card-title">Iniciar Sesión</h3>
            <form onSubmit={handleLoginSubmit}>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">Correo Electrónico</label>
                <input 
                  type="email" 
                  className="form-input" 
                  placeholder="correo@ejemplo.com"
                  value={loginForm.correo}
                  onChange={e => setLoginForm({...loginForm, correo: e.target.value})}
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label className="form-label">Contraseña</label>
                <input 
                  type="password" 
                  className="form-input" 
                  placeholder="••••••••"
                  value={loginForm.contrasena}
                  onChange={e => setLoginForm({...loginForm, contrasena: e.target.value})}
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
                {loading ? 'Validando...' : 'Entrar'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: REGISTRO (SOLO PIDE CONTRASEÑA ADICIONAL) --- */}
      {activeModal === 'register' && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <button className="modal-close" onClick={() => setActiveModal(null)}>×</button>
            <h3 className="card-title">Completa tu Registro</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
              Ya hemos guardado tus datos básicos del formulario. Crea una contraseña para asegurar tu cuenta y cotizar de inmediato.
            </p>
            <form onSubmit={handleRegisterSubmit}>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">Tu Nombre</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={`${quoteForm.primer_nombre} ${quoteForm.primer_apellido}`} 
                  disabled 
                />
              </div>
              <div className="form-group" style={{ marginBottom: '1.2rem' }}>
                <label className="form-label">Tu Correo</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={quoteForm.correo} 
                  disabled 
                />
              </div>
              <div className="form-group" style={{ marginBottom: '1.8rem' }}>
                <label className="form-label">Contraseña de Seguridad *</label>
                <input 
                  type="password" 
                  className="form-input" 
                  placeholder="Crear contraseña"
                  value={contrasenaRegistro}
                  onChange={e => setContrasenaRegistro(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn btn-accent" style={{ width: '100%' }} disabled={loading}>
                {loading ? 'Creando cuenta...' : 'Registrar y Cotizar'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: MI PERFIL (EDICIÓN Y ACTUALIZACIÓN) --- */}
      {activeModal === 'profile' && (
        <div className="modal-overlay">
          <div className="modal-content modal-large">
            <button className="modal-close" onClick={() => setActiveModal(null)}>×</button>
            <h3 className="card-title">Mi Perfil de Asegurado</h3>
            <form onSubmit={handleProfileSave}>
              <div className="form-grid">
                
                {/* Primer Nombre */}
                <div className="form-group">
                  <label className="form-label">Primer Nombre</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={quoteForm.primer_nombre} 
                    onChange={e => setQuoteForm({...quoteForm, primer_nombre: e.target.value})} 
                    required 
                  />
                </div>

                {/* Segundo Nombre */}
                <div className="form-group">
                  <label className="form-label">Segundo Nombre</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={quoteForm.segundo_nombre || ''} 
                    onChange={e => setQuoteForm({...quoteForm, segundo_nombre: e.target.value})} 
                  />
                </div>

                {/* Primer Apellido */}
                <div className="form-group">
                  <label className="form-label">Primer Apellido</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={quoteForm.primer_apellido} 
                    onChange={e => setQuoteForm({...quoteForm, primer_apellido: e.target.value})} 
                    required 
                  />
                </div>

                {/* Segundo Apellido */}
                <div className="form-group">
                  <label className="form-label">Segundo Apellido</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={quoteForm.segundo_apellido || ''} 
                    onChange={e => setQuoteForm({...quoteForm, segundo_apellido: e.target.value})} 
                  />
                </div>

                {/* DNI */}
                <div className="form-group">
                  <label className="form-label">Nro. Documento</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={quoteForm.nro_documento} 
                    onChange={e => setQuoteForm({...quoteForm, nro_documento: e.target.value})} 
                    required 
                  />
                </div>

                {/* Fecha Nacimiento */}
                <div className="form-group">
                  <label className="form-label">Fecha Nacimiento</label>
                  <input 
                    type="date" 
                    className="form-input" 
                    value={quoteForm.fecha_nacimiento} 
                    onChange={e => setQuoteForm({...quoteForm, fecha_nacimiento: e.target.value})} 
                    required 
                  />
                </div>

                {/* Género */}
                <div className="form-group">
                  <label className="form-label">Género</label>
                  <select 
                    className="form-input" 
                    value={quoteForm.genero} 
                    onChange={e => setQuoteForm({...quoteForm, genero: e.target.value})}
                  >
                    <option value="Masculino">Masculino</option>
                    <option value="Femenino">Femenino</option>
                  </select>
                </div>

                {/* Estado Civil */}
                <div className="form-group">
                  <label className="form-label">Estado Civil</label>
                  <select 
                    className="form-input" 
                    value={quoteForm.estado_civil} 
                    onChange={e => setQuoteForm({...quoteForm, estado_civil: e.target.value})}
                  >
                    <option value="Soltero">Soltero/a</option>
                    <option value="Casado">Casado/a</option>
                    <option value="Divorciado">Divorciado/a</option>
                    <option value="Viudo">Viudo/a</option>
                  </select>
                </div>

                {/* Celular */}
                <div className="form-group">
                  <label className="form-label">Número Celular</label>
                  <div className="flex gap-2">
                    <select 
                      className="form-input" 
                      style={{ width: '100px' }}
                      value={quoteForm.codigo_area} 
                      onChange={e => setQuoteForm({...quoteForm, codigo_area: e.target.value})}
                    >
                      <option value="0412">0412</option>
                      <option value="0414">0414</option>
                      <option value="0424">0424</option>
                      <option value="0416">0416</option>
                      <option value="0426">0426</option>
                    </select>
                    <input 
                      type="tel" 
                      className="form-input" 
                      value={quoteForm.numero_celular} 
                      onChange={e => setQuoteForm({...quoteForm, numero_celular: e.target.value})} 
                      required 
                    />
                  </div>
                </div>

              </div>

              <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setActiveModal(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: PANEL ADMINISTRATIVO PRINCIPAL --- */}
      {activeModal === 'admin-section' && (
        <div className="modal-overlay">
          <div className="modal-content modal-large" style={{ minHeight: '60vh' }}>
            <button className="modal-close" onClick={() => {
              setActiveModal(null);
              setAdminTab(null);
            }}>×</button>
            
            <h3 className="card-title">Panel Administrativo ({user?.rango?.toUpperCase()})</h3>

            {/* VISTA DE BOTONES DEL PANEL DE ACUERDO AL RANGO */}
            {!adminTab ? (
              <div className="admin-grid">
                
                {/* --- RANGO: CLIENTE --- */}
                {user?.rango === 'cliente' && (
                  <>
                    <div className="admin-card" onClick={() => openAdminTab('polizas')}>
                      <div className="admin-card-icon">📄</div>
                      <div className="admin-card-title">Pólizas</div>
                      <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>Mis coberturas contratadas</p>
                    </div>
                    <div className="admin-card" onClick={() => openAdminTab('asesores')}>
                      <div className="admin-card-icon">📞</div>
                      <div className="admin-card-title">Asesores</div>
                      <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>Mis asesores asignados</p>
                    </div>
                    <div className="admin-card" onClick={() => openAdminTab('mis-pagos')}>
                      <div className="admin-card-icon">💳</div>
                      <div className="admin-card-title">Mis Pagos</div>
                      <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>Historial de cuotas y vencimientos</p>
                    </div>
                  </>
                )}

                {/* --- RANGO: ASESOR --- */}
                {user?.rango === 'asesor' && (
                  <>
                    <div className="admin-card" onClick={() => openAdminTab('polizas')}>
                      <div className="admin-card-icon">📑</div>
                      <div className="admin-card-title">Pólizas Clientes</div>
                      <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>Gestión de estados de pólizas</p>
                    </div>
                    <div className="admin-card" onClick={() => openAdminTab('clientes')}>
                      <div className="admin-card-icon">👥</div>
                      <div className="admin-card-title">Clientes</div>
                      <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>Mi lista de clientes asignados</p>
                    </div>
                  </>
                )}

                {/* --- RANGO: ADMIN --- */}
                {user?.rango === 'admin' && (
                  <>
                    <div className="admin-card" onClick={() => openAdminTab('data')}>
                      <div className="admin-card-icon">⚙️</div>
                      <div className="admin-card-title">Carga de Data</div>
                      <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>Carga masiva de tarifas de seguros</p>
                    </div>
                    <div className="admin-card" onClick={() => openAdminTab('polizas')}>
                      <div className="admin-card-icon">📑</div>
                      <div className="admin-card-title">Todas las Pólizas</div>
                      <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>Control global de cotizaciones y emisión</p>
                    </div>
                    <div className="admin-card" onClick={() => openAdminTab('clientes')}>
                      <div className="admin-card-icon">👥</div>
                      <div className="admin-card-title">Clientes Totales</div>
                      <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>Lista e historial de asegurados</p>
                    </div>
                    <div className="admin-card" onClick={() => openAdminTab('asesores')}>
                      <div className="admin-card-icon">📞</div>
                      <div className="admin-card-title">Asesores de Broker</div>
                      <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>Directorio de intermediarios</p>
                    </div>
                    <div className="admin-card" onClick={() => openAdminTab('usuarios')}>
                      <div className="admin-card-icon">🔑</div>
                      <div className="admin-card-title">Usuarios y Roles</div>
                      <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>Asignación de privilegios de acceso</p>
                    </div>
                  </>
                )}

              </div>
            ) : (
              // --- VISTA DETALLADA DEL TAB SELECCIONADO ---
              <div>
                <div style={{ marginBottom: '1.5rem' }}>
                  <button className="btn btn-secondary" onClick={() => setAdminTab(null)}>
                    ← Volver al Panel
                  </button>
                </div>

                {/* --- TAB: DATA (Admin) --- */}
                {adminTab === 'data' && (
                  <div>
                    <h4 style={{ marginBottom: '1rem' }}>Carga Masiva de Tarifas</h4>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                      Cargue un archivo JSON que contenga las tarifas estructuradas según el modelo. El formato esperado es un arreglo JSON.
                    </p>
                    
                    <form onSubmit={handleBulkUpload} className="flex gap-4 align-center">
                      <input 
                        type="file" 
                        id="file-upload-input"
                        accept=".json"
                        onChange={e => setFileToUpload(e.target.files[0])}
                        style={{ border: '1px solid var(--border)', padding: '0.5rem', borderRadius: '4px' }}
                      />
                      <button type="submit" className="btn btn-primary" disabled={loading}>
                        {loading ? 'Procesando...' : 'Ejecutar Carga Masiva'}
                      </button>
                    </form>

                    <div style={{ marginTop: '2rem', padding: '1rem', border: '1px solid var(--border)', background: 'var(--surface-muted)', borderRadius: '6px' }}>
                      <h5>Ejemplo de Formato del Archivo JSON:</h5>
                      <pre style={{ fontSize: '0.75rem', marginTop: '0.5rem', overflowX: 'auto' }}>
{`[
  {
    "compania": "Seguros Pirámides",
    "tipo_cobertura": "colectivo",
    "edad_min": 30,
    "edad_max": 39,
    "suma_asegurada": 5000,
    "prima": 260.00
  }
]`}
                      </pre>
                    </div>
                  </div>
                )}

                {/* --- TAB: PÓLIZAS (Cliente, Asesor, Admin) --- */}
                {adminTab === 'polizas' && (
                  <div>
                    <h4>Lista de Pólizas</h4>
                    <div className="table-container">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>ID Código</th>
                            {user.rango !== 'cliente' && <th>Cliente</th>}
                            <th>Área</th>
                            <th>Aseguradora</th>
                            <th>Suma Asegurada</th>
                            <th>Prima Anual</th>
                            <th>Asesor</th>
                            <th>Estado Póliza</th>
                          </tr>
                        </thead>
                        <tbody>
                          {adminPolicies.length === 0 ? (
                            <tr>
                              <td colSpan="8" className="text-center">No hay pólizas registradas.</td>
                            </tr>
                          ) : (
                            adminPolicies.map(p => (
                              <tr key={p.id}>
                                <td><strong>{p.codigo_poliza}</strong></td>
                                {user.rango !== 'cliente' && <td>{p.cliente_nombre || 'Asociado'}</td>}
                                <td>{p.area}</td>
                                <td>{p.compania_nombre || p.compania_seguro}</td>
                                <td>${parseFloat(p.suma_asegurada).toLocaleString('en-US')}</td>
                                <td>${parseFloat(p.prima_anual).toLocaleString('en-US')}</td>
                                <td>{p.asesor_nombre || 'Sin Asesor'}</td>
                                <td>
                                  {user.rango === 'cliente' ? (
                                    <span className={`tag tag-${p.estado}`}>{p.estado}</span>
                                  ) : (
                                    <select 
                                      className="form-input" 
                                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem', width: '130px' }}
                                      value={p.estado}
                                      onChange={e => handleUpdatePolicyStatus(p.id, e.target.value)}
                                    >
                                      <option value="negociacion">Negociación</option>
                                      <option value="vigente">Vigente</option>
                                      <option value="vencido">Vencido</option>
                                      <option value="rechazado">Rechazado</option>
                                    </select>
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

                {/* --- TAB: ASESORES (Cliente, Admin) --- */}
                {adminTab === 'asesores' && (
                  <div>
                    <h4>Directorio de Asesores Asignados</h4>
                    <div className="table-container">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>ID</th>
                            <th>Nombre del Asesor</th>
                            {user.rango === 'admin' ? <th>Clientes Vinculados</th> : <th>Área Asignada</th>}
                            {user.rango === 'cliente' && <th>Contacto</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {adminAdvisors.length === 0 ? (
                            <tr>
                              <td colSpan="4" className="text-center">No tiene asesores vinculados.</td>
                            </tr>
                          ) : (
                            adminAdvisors.map(a => (
                              <tr key={a.id_asesor || a.id}>
                                <td>{a.id_asesor || a.id}</td>
                                <td><strong>{a.nombre}</strong></td>
                                <td>{user.rango === 'admin' ? a.clientes : (a.area || 'Salud')}</td>
                                {user.rango === 'cliente' && (
                                  <td>
                                    <a 
                                      href={`https://wa.me/58${a.telefono?.replace(/[^0-9]/g, '')}`} 
                                      target="_blank" 
                                      rel="noreferrer"
                                      className="btn btn-secondary"
                                      style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }}
                                    >
                                      💬 Contactar Asesor
                                    </a>
                                  </td>
                                )}
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* --- TAB: CLIENTES (Asesor, Admin) --- */}
                {adminTab === 'clientes' && (
                  <div>
                    <h4>Clientes Vinculados</h4>
                    <div className="table-container">
                      <table className="table">
                        <thead>
                          {user.rango === 'admin' ? (
                            <tr>
                              <th>ID Cliente</th>
                              <th>Nombre Completo</th>
                              <th>Pólizas Activas</th>
                              <th>Historial de Pagos</th>
                            </tr>
                          ) : (
                            <tr>
                              <th>Nombre Completo</th>
                              <th>Área de Póliza</th>
                              <th>Contacto Directo</th>
                            </tr>
                          )}
                        </thead>
                        <tbody>
                          {adminClients.length === 0 ? (
                            <tr>
                              <td colSpan="4" className="text-center">No hay clientes vinculados.</td>
                            </tr>
                          ) : (
                            adminClients.map(c => (
                              <tr key={c.id_cliente || c.id}>
                                {user.rango === 'admin' ? (
                                  <>
                                    <td>{c.id_cliente}</td>
                                    <td><strong>{c.nombre}</strong></td>
                                    <td>{c.polizas}</td>
                                    <td>{c.historial_pagos}</td>
                                  </>
                                ) : (
                                  <>
                                    <td><strong>{c.nombre}</strong></td>
                                    <td>{c.area || 'Salud'}</td>
                                    <td>
                                      <a 
                                        href={`https://wa.me/58${c.telefono?.replace(/[^0-9]/g, '')}`} 
                                        target="_blank" 
                                        rel="noreferrer"
                                        className="btn btn-secondary"
                                        style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }}
                                      >
                                        📞 Enviar Mensaje
                                      </a>
                                    </td>
                                  </>
                                )}
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* --- TAB: USUARIOS (Admin) --- */}
                {adminTab === 'usuarios' && (
                  <div>
                    <h4>Lista de Usuarios y Roles</h4>
                    <div className="table-container">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>ID</th>
                            <th>Correo Electrónico</th>
                            <th>Fecha Registro</th>
                            <th>Rango / Permiso</th>
                          </tr>
                        </thead>
                        <tbody>
                          {adminUsers.map(u => (
                            <tr key={u.id}>
                              <td>{u.id}</td>
                              <td>{u.correo}</td>
                              <td>{new Date(u.created_at).toLocaleDateString('es-VE')}</td>
                              <td>
                                <select 
                                  className="form-input" 
                                  style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem', width: '130px' }}
                                  value={u.rango}
                                  onChange={e => handleUpdateUserRole(u.id, e.target.value)}
                                >
                                  <option value="cliente">Cliente</option>
                                  <option value="asesor">Asesor</option>
                                  <option value="admin">Administrador</option>
                                </select>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* --- TAB: MIS PAGOS (Cliente) --- */}
                {adminTab === 'mis-pagos' && (
                  <div>
                    <h4>Historial y Control de Pagos</h4>
                    <div className="table-container">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Código Póliza</th>
                            <th>Aseguradora</th>
                            <th>Monto Cuota</th>
                            <th>Vencimiento</th>
                            <th>Estado Pago</th>
                          </tr>
                        </thead>
                        <tbody>
                          {adminPayments.length === 0 ? (
                            <tr>
                              <td colSpan="5" className="text-center">No hay pagos registrados.</td>
                            </tr>
                          ) : (
                            adminPayments.map(pa => (
                              <tr key={pa.id}>
                                <td>{pa.poliza_codigo}</td>
                                <td>{pa.compania_nombre}</td>
                                <td><strong>${parseFloat(pa.monto).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></td>
                                <td>{pa.fecha_vencimiento ? new Date(pa.fecha_vencimiento).toLocaleDateString('es-VE') : 'N/A'}</td>
                                <td>
                                  <span className={`tag tag-${pa.estado_pago}`}>{pa.estado_pago}</span>
                                </td>
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
        </div>
      )}
    </div>
  );
}
