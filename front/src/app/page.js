"use client";

import React, { useState, useEffect } from 'react';

const API_URL = 'http://localhost:5000/api';

// Objeto por defecto para inicializar el formulario
const DEFAULT_QUOTE_FORM = {
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
};

const getStoredJson = (key) => {
  if (typeof window === 'undefined') return null;
  const item = localStorage.getItem(key);
  if (!item || item === 'undefined') return null;
  try {
    return JSON.parse(item);
  } catch {
    return null;
  }
};

const getStoredToken = () => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('jka_token');
};

export default function Home() {
  // --- ESTADOS DE AUTENTICACIÓN ---
  const [token, setToken] = useState(getStoredToken);
  const [user, setUser] = useState(() => getStoredJson('jka_user'));
  const [cliente, setCliente] = useState(() => getStoredJson('jka_cliente'));
  const [asesor, setAsesor] = useState(() => getStoredJson('jka_asesor'));

  // --- ESTADOS DE INTERFAZ ---
  const [activeModal, setActiveModal] = useState(null); // 'login', 'register', 'profile'
  const [toasts, setToasts] = useState([]); // { id, message, type }
  const [loading, setLoading] = useState(false);
  const [quotingResults, setQuotingResults] = useState(null);

  // --- ESTADOS DE LOS FORMULARIOS ---
  const [loginForm, setLoginForm] = useState({ correo: '', contrasena: '' });
  const [quoteForm, setQuoteForm] = useState(() => {
    const parsedCliente = getStoredJson('jka_cliente');
    if (!parsedCliente) return DEFAULT_QUOTE_FORM;

    const cleanedCliente = Object.fromEntries(
      Object.entries(parsedCliente).filter(([_, val]) => val !== null && val !== undefined)
    );

    return {
      ...DEFAULT_QUOTE_FORM,
      ...cleanedCliente,
      fecha_nacimiento: parsedCliente.fecha_nacimiento
        ? String(parsedCliente.fecha_nacimiento).split('T')[0]
        : DEFAULT_QUOTE_FORM.fecha_nacimiento,
      correo: parsedCliente.correo || DEFAULT_QUOTE_FORM.correo,
      confirmar_correo: parsedCliente.correo || DEFAULT_QUOTE_FORM.confirmar_correo
    };
  });
  const [contrasenaRegistro, setContrasenaRegistro] = useState('');

  // --- MENSAJES TOAST ---
  const showToast = (message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // --- LOGIC DE AUTENTICACIÓN Y FORMULARIOS ---
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (!loginForm.correo || !loginForm.contrasena) {
      return showToast('Introduce correo y contraseña.', 'error');
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al iniciar sesión');

      localStorage.setItem('jka_token', data.token);
      localStorage.setItem('jka_user', JSON.stringify(data.user));
      if (data.cliente) localStorage.setItem('jka_cliente', JSON.stringify(data.cliente));
      if (data.asesor) localStorage.setItem('jka_asesor', JSON.stringify(data.asesor));

      setToken(data.token);
      setUser(data.user);
      setCliente(data.cliente);
      setAsesor(data.asesor);
      
      showToast(`¡Bienvenido, ${data.cliente ? data.cliente.primer_nombre : data.user.correo}!`);
      setActiveModal(null);
      setLoginForm({ correo: '', contrasena: '' });
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

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
        correo: quoteForm.correo,
        contrasena: contrasenaRegistro,
        rango: 'cliente'
      };

      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al registrarse');

      localStorage.setItem('jka_token', data.token);
      localStorage.setItem('jka_user', JSON.stringify(data.user));
      localStorage.setItem('jka_cliente', JSON.stringify(data.cliente));

      setToken(data.token);
      setUser(data.user);
      setCliente(data.cliente);
      setContrasenaRegistro('');
      
      showToast('Registro e inicio de sesión exitosos.');
      setActiveModal(null);
      
      setTimeout(() => {
        ejecutarCotizacion(data.cliente);
      }, 300);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

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
    showToast('Sesión cerrada correctamente.');
  };

  // --- COTIZACIÓN ---
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
      if (!res.ok) throw new Error(data.error || 'Error al procesar la cotización');
      
      setQuotingResults(data);
      showToast('Cotización realizada exitosamente.');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleQuoteClick = (e) => {
    e.preventDefault();
    if (!quoteForm.primer_nombre || !quoteForm.primer_apellido || !quoteForm.fecha_nacimiento || !quoteForm.nro_documento || !quoteForm.numero_celular || !quoteForm.correo) {
      return showToast('Rellene todos los campos obligatorios del formulario.', 'error');
    }

    if (!token) {
      setActiveModal('register');
      showToast('Cree una contraseña para registrarse y ver los resultados.', 'info');
    } else {
      ejecutarCotizacion(cliente);
    }
  };

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

      if (!res.ok) throw new Error('Error generando el PDF');
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cotizacion_jka_${cliente.nro_documento}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast('PDF descargado correctamente.');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      {/* Toast Notifications */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type === 'error' ? 'toast-error' : 'toast-success'}`}>
            <span>{t.type === 'error' ? '❌' : '✅'}</span>
            <div>{t.message}</div>
          </div>
        ))}
      </div>

      {/* Navbar */}
      <nav className="navbar">
        <a href="#" className="nav-brand">
          💼 <span>JKA Seguros</span>
        </a>
        <div className="nav-actions">
          {!token ? (
            <>
              <button className="btn btn-secondary" onClick={() => setActiveModal('login')}>Iniciar Sesión</button>
              <button className="btn btn-primary" onClick={() => {
                setContrasenaRegistro('');
                setActiveModal('register');
              }}>Regístrate</button>
            </>
          ) : (
            <>
              <span className="user-email-tag" style={{ marginRight: '1rem', opacity: 0.8, fontSize: '0.9rem' }}>
                👤 {user?.correo} ({user?.rango})
              </span>
              <button className="btn btn-danger" onClick={handleLogout}>Salir</button>
            </>
          )}
        </div>
      </nav>

      {/* Main Content */}
      <main className="main-content">
        <div className="card">
          <h2 className="card-title">Cotizador Inteligente de Seguros de Salud</h2>
          
          <form onSubmit={handleQuoteClick}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Fecha de nacimiento *</label>
                <input 
                  type="date" 
                  className="form-input" 
                  value={quoteForm.fecha_nacimiento} 
                  onChange={e => setQuoteForm({...quoteForm, fecha_nacimiento: e.target.value})} 
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Tipo de documento *</label>
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

              <div className="form-group">
                <label className="form-label">Nro. Documento *</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Ej: 12345678"
                  value={quoteForm.nro_documento} 
                  onChange={e => setQuoteForm({...quoteForm, nro_documento: e.target.value})} 
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Primer nombre *</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={quoteForm.primer_nombre} 
                  onChange={e => setQuoteForm({...quoteForm, primer_nombre: e.target.value})} 
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Segundo nombre</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={quoteForm.segundo_nombre} 
                  onChange={e => setQuoteForm({...quoteForm, segundo_nombre: e.target.value})} 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Primer apellido *</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={quoteForm.primer_apellido} 
                  onChange={e => setQuoteForm({...quoteForm, primer_apellido: e.target.value})} 
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Segundo apellido</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={quoteForm.segundo_apellido} 
                  onChange={e => setQuoteForm({...quoteForm, segundo_apellido: e.target.value})} 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Género *</label>
                <select 
                  className="form-input" 
                  value={quoteForm.genero} 
                  onChange={e => setQuoteForm({...quoteForm, genero: e.target.value})}
                >
                  <option value="Masculino">Masculino</option>
                  <option value="Femenino">Femenino</option>
                </select>
              </div>

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

              <div className="form-group">
                <label className="form-label">Correo electrónico *</label>
                <input 
                  type="email" 
                  className="form-input" 
                  placeholder="ejemplo@correo.com"
                  value={quoteForm.correo} 
                  onChange={e => setQuoteForm({...quoteForm, correo: e.target.value})} 
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Confirmar correo *</label>
                <input 
                  type="email" 
                  className="form-input" 
                  placeholder="ejemplo@correo.com"
                  value={quoteForm.confirmar_correo} 
                  onChange={e => setQuoteForm({...quoteForm, confirmar_correo: e.target.value})} 
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Modalidad de póliza *</label>
                <select 
                  className="form-input" 
                  value={quoteForm.tipo_cobertura} 
                  onChange={e => setQuoteForm({...quoteForm, tipo_cobertura: e.target.value})}
                >
                  <option value="colectivo">Colectivo (Póliza Grupal)</option>
                  <option value="individual">Individual (Póliza Particular)</option>
                </select>
              </div>

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

              <div className="form-group">
                <label className="form-label">Número celular *</label>
                <input 
                  type="tel" 
                  className="form-input" 
                  placeholder="1234567"
                  value={quoteForm.numero_celular} 
                  onChange={e => setQuoteForm({...quoteForm, numero_celular: e.target.value})} 
                  required
                />
              </div>
            </div>

            <button type="submit" className="btn btn-accent btn-center" style={{ marginTop: '1.5rem' }} disabled={loading}>
              {loading ? 'Calculando...' : 'Cotizar Ahora'}
            </button>
          </form>
        </div>

        {/* Resultados de Cotización */}
        {quotingResults && (
          <div className="card" style={{ marginTop: '2rem' }}>
            <div className="justify-between align-center flex" style={{ marginBottom: '1.5rem', borderBottom: '2px solid var(--border)', paddingBottom: '1rem' }}>
              <div>
                <h3 className="card-title" style={{ border: 'none', margin: 0, padding: 0 }}>
                  Comparativa de Pólizas
                </h3>
                <p style={{ fontSize: '0.9rem', opacity: 0.8 }}>
                  Edad: <strong>{quotingResults.edad} años</strong> | Cobertura: <strong>{quotingResults.tipo_cobertura.toUpperCase()}</strong>
                </p>
              </div>
              <button className="btn btn-primary" onClick={downloadPdf}>
                📥 Descargar PDF
              </button>
            </div>

            <div className="results-grid">
              {quotingResults.comparativa.map((comp) => (
                <div key={comp.id} className="result-card">
                  <div className="result-header">
                    <div className="result-company">{comp.nombre}</div>
                    <div className="result-price-box">
                      <span className="result-price">
                        {comp.prima ? `$${comp.prima}` : 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Modal: Login */}
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
                {loading ? 'Ingresando...' : 'Iniciar Sesión'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Registro */}
      {activeModal === 'register' && (
        <div className="modal-overlay">
          <div className="modal-content">
            <button className="modal-close" onClick={() => setActiveModal(null)}>×</button>
            <h3 className="card-title">Completar Registro</h3>
            <form onSubmit={handleRegisterSubmit}>
              <p style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>
                Correo: <strong>{quoteForm.correo}</strong>
              </p>
              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label className="form-label">Crea tu Contraseña *</label>
                <input 
                  type="password" 
                  className="form-input" 
                  placeholder="••••••••"
                  value={contrasenaRegistro}
                  onChange={e => setContrasenaRegistro(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn btn-accent" style={{ width: '100%' }} disabled={loading}>
                {loading ? 'Registrando...' : 'Registrar y Cotizar'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}