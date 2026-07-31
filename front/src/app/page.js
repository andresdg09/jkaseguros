"use client";

import React, { useState, useEffect } from 'react';
import { useAuth } from './contexts/AuthContext';
import { useToast } from './components/ToastProvider';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api';

export default function Home() {
  const { token, isLoggedIn, cliente, user, hydrated } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();

  // --- ESTADOS DE LA INTERFAZ ---
  const [loading, setLoading] = useState(false);
  const [quotingResults, setQuotingResults] = useState(null);
  const [advisorsList, setAdvisorsList] = useState([]);
  const [sumsList, setSumsList] = useState([]);
  const [step, setStep] = useState(1); // 1: Datos de contacto, 2: Datos personales

  // --- ESTADO DEL FORMULARIO ---
  // tipo_documento y genero ya no se piden en el formulario: se usan valores por defecto fijos
  const [quoteForm, setQuoteForm] = useState({
    fecha_nacimiento: '',
    tipo_documento: 'Venezolano',
    nro_documento: '',
    primer_nombre: '',
    primer_apellido: '',
    genero: 'Masculino',
    estado_civil: 'Soltero',
    numero_hijos: '',
    correo: '',
    codigo_area: '0412',
    numero_celular: '',
    suma_asegurada: '',
    asesor_id: ''
  });

  // Cargar lista pública de asesores para cotizaciones
  useEffect(() => {
    const fetchAdvisors = async () => {
      try {
        const res = await fetch(`${API_URL}/public/advisors`);
        if (res.ok) {
          const data = await res.json();
          setAdvisorsList(data);
        }
      } catch (err) {
        console.error('Error al cargar asesores:', err);
      }
    };
    fetchAdvisors();
  }, []);

  // Cargar sumas aseguradas disponibles en la matriz de tarifas
  useEffect(() => {
    const fetchSums = async () => {
      try {
        const res = await fetch(`${API_URL}/quote/sums`);
        if (res.ok) {
          const data = await res.json();
          setSumsList(data);
        }
      } catch (err) {
        console.error('Error al cargar sumas aseguradas:', err);
      }
    };
    fetchSums();
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
        primer_apellido: cliente.primer_apellido || '',
        genero: cliente.genero || 'Masculino',
        estado_civil: cliente.estado_civil || 'Soltero',
        numero_hijos: cliente.numero_hijos ?? prev.numero_hijos,
        correo: user?.correo || '',
        codigo_area: cliente.codigo_area || '0412',
        numero_celular: cliente.numero_celular || '',
        asesor_id: prev.asesor_id || ''
      }));
    }
  }, [cliente, user]);

  // Manejar el retorno de un registro/login pendiente tras cotizar
  useEffect(() => {
    if (hydrated) {
      const pendingQuote = localStorage.getItem('jka_pending_quote');
      if (pendingQuote) {
        const parsed = JSON.parse(pendingQuote);
        setQuoteForm(parsed);
        localStorage.removeItem('jka_pending_quote');

        if (isLoggedIn && cliente) {
          showToast('Sesión iniciada. Procesando tu cotización pendiente...');
          ejecutarCotizacion(cliente, parsed.suma_asegurada);
        }
      }
    }
  }, [hydrated, isLoggedIn, cliente]);

  // Ejecutar llamada a API de cotización
  const ejecutarCotizacion = async (clienteActivo, sumaAsegurada) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha_nacimiento: clienteActivo.fecha_nacimiento,
          suma_asegurada: sumaAsegurada || quoteForm.suma_asegurada
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al cotizar');

      setQuotingResults(data);
      showToast('Cotización calculada con éxito.');

      // Enviar cotización comparativa por correo de forma automática en segundo plano
      try {
        const selectedAdvisor = advisorsList.find(a => String(a.id) === String(quoteForm.asesor_id));
        fetch(`${API_URL}/quote/email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cliente: clienteActivo,
            edad: data.edad,
            suma_asegurada: data.suma_asegurada,
            comparativas: data.comparativa,
            email: quoteForm.correo || clienteActivo.correo,
            asesor: selectedAdvisor || null
          })
        });
        showToast('Enviamos el cuadro comparativo a tu correo electrónico.');
      } catch (emailErr) {
        console.error('Error al enviar correo automático:', emailErr);
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Paso 1: Datos de contacto -> avanza al paso 2
  const handleContinueStep1 = (e) => {
    e.preventDefault();

    if (!quoteForm.fecha_nacimiento || !quoteForm.correo || !quoteForm.numero_celular) {
      return showToast('Por favor, rellene todos los campos obligatorios.', 'error');
    }

    setStep(2);
  };

  // Paso 2: Datos personales -> botón "Cotizar Seguros" del formulario
  const handleQuoteSubmit = async (e) => {
    e.preventDefault();

    // Validar campos obligatorios
    if (!quoteForm.primer_nombre || !quoteForm.primer_apellido || !quoteForm.nro_documento || !quoteForm.suma_asegurada || !quoteForm.asesor_id) {
      return showToast('Por favor, rellene todos los campos obligatorios, incluyendo la suma asegurada y el asesor.', 'error');
    }

    if (!isLoggedIn) {
      setLoading(true);
      try {
        // Verificar si el correo o documento ya tiene cuenta registrada
        const checkRes = await fetch(`${API_URL}/auth/check-user`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            correo: quoteForm.correo,
            nro_documento: quoteForm.nro_documento
          })
        });
        const checkData = await checkRes.json();

        // Guardar estado del formulario en caliente para el retorno
        localStorage.setItem('jka_pending_quote', JSON.stringify(quoteForm));
        
        if (checkData.exists) {
          showToast('Esta cuenta ya existe. Redirigiendo para que inicies sesión y ver tu cotización...', 'info');
          setTimeout(() => {
            router.push(`/login?email=${encodeURIComponent(quoteForm.correo)}`);
          }, 1500);
        } else {
          showToast('Para continuar, crea una contraseña de seguridad para registrarte.', 'info');
          setTimeout(() => {
            // Guardamos datos en storage para que registro/page.js pueda recuperarlos y pre-rellenarlos si es necesario
            localStorage.setItem('jka_pending_register_form', JSON.stringify(quoteForm));
            router.push('/registro');
          }, 1500);
        }
      } catch (err) {
        console.error('Error al verificar existencia de usuario:', err);
        showToast('Error de conexión. Intente registrarse directamente.', 'error');
      } finally {
        setLoading(false);
      }
    } else {
      // Logueado (Cliente, Asesor o Admin)
      const activeCli = cliente || {
        primer_nombre: quoteForm.primer_nombre,
        primer_apellido: quoteForm.primer_apellido,
        fecha_nacimiento: quoteForm.fecha_nacimiento,
        tipo_documento: quoteForm.tipo_documento,
        nro_documento: quoteForm.nro_documento,
        genero: quoteForm.genero,
        estado_civil: quoteForm.estado_civil,
        correo: quoteForm.correo,
        telefono: `${quoteForm.codigo_area}-${quoteForm.numero_celular}`
      };
      ejecutarCotizacion(activeCli, quoteForm.suma_asegurada);
    }
  };

  // Enviar PDF de cotización por correo
  const sendEmailPdf = async () => {
    const activeCli = cliente || {
      primer_nombre: quoteForm.primer_nombre,
      primer_apellido: quoteForm.primer_apellido,
      fecha_nacimiento: quoteForm.fecha_nacimiento,
      tipo_documento: quoteForm.tipo_documento,
      nro_documento: quoteForm.nro_documento,
      genero: quoteForm.genero,
      estado_civil: quoteForm.estado_civil,
      correo: quoteForm.correo,
      telefono: `${quoteForm.codigo_area}-${quoteForm.numero_celular}`
    };

    if (!quotingResults || !activeCli || !activeCli.fecha_nacimiento) return;
    setLoading(true);
    try {
      const selectedAdvisor = advisorsList.find(a => String(a.id) === String(quoteForm.asesor_id));
      const res = await fetch(`${API_URL}/quote/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente: activeCli,
          edad: quotingResults.edad,
          suma_asegurada: quotingResults.suma_asegurada,
          comparativas: quotingResults.comparativa,
          email: quoteForm.correo || activeCli.correo,
          asesor: selectedAdvisor || null
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al enviar el correo');
      showToast('Cotización enviada por correo con éxito.');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Crear póliza tras elegir compañía de seguros
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
          plan: compania.plan,
          suma_asegurada: compania.suma_asegurada || quoteForm.suma_asegurada,
          prima_anual: compania.prima,
          asesor_id: quoteForm.asesor_id
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al solicitar póliza');

      showToast(`¡Solicitud enviada! Póliza creada: ${data.poliza.codigo_poliza}. Estado: Negociación.`);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Contactar Asesor vía WhatsApp (Mensaje con datos del seguro elegido)
  const handleWhatsAppContact = (compania) => {
    const selectedAdvisor = advisorsList.find(a => String(a.id) === String(quoteForm.asesor_id));
    const phone = selectedAdvisor ? selectedAdvisor.telefono : (advisorsList[0]?.telefono || '584121234567');
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const advisorName = selectedAdvisor ? selectedAdvisor.nombre : 'Asesor JKA';
    
    const docText = `${quoteForm.tipo_documento} ${quoteForm.nro_documento}`;
    const userAge = quotingResults ? quotingResults.edad : 'No calculada';
    const planText = compania.plan ? ` (Plan ${compania.plan})` : '';

    const mensaje = `Hola ${advisorName}, estoy interesado en contratar el seguro de salud de *${compania.nombre}*${planText} con una prima anual de *$${compania.prima}* para mí (edad: ${userAge} años). Mi nombre es *${quoteForm.primer_nombre} ${quoteForm.primer_apellido}* y mi documento de identidad es ${docText}. ¡Espero su respuesta!`;
    
    const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(mensaje)}`;
    window.open(waUrl, '_blank');
  };

  if (!hydrated) return null;

  return (
    <div>
      {/* SECCIÓN HERO / PRESENTACIÓN */}
      <div style={{ textAlign: 'center', marginBottom: '3rem', marginTop: '1rem' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--primary)', marginBottom: '1rem' }}>
          Cotiza tu Seguro de Salud al Instante
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', maxWidth: '600px', margin: '0 auto' }}>
          Compara coberturas colectivas e individuales de las aseguradoras más prestigiosas de Venezuela y contrata con el asesor de tu preferencia.
        </p>
      </div>

      {/* FORMULARIO DE COTIZACIÓN (POR PASOS) */}
      <div className="card">
        <h3 className="card-title" style={{ marginBottom: '0.25rem' }}>Indica tus datos para cotizar</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
          Paso {step} de 2: {step === 1 ? 'Datos de contacto' : 'Datos personales'}
        </p>

        {step === 1 && (
          <form onSubmit={handleContinueStep1}>
            <div className="form-grid">

              {/* Fecha de nacimiento */}
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

              {/* Correo */}
              <div className="form-group">
                <label className="form-label">Correo electrónico *</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="correo@ejemplo.com"
                  value={quoteForm.correo}
                  onChange={e => setQuoteForm({...quoteForm, correo: e.target.value})}
                  required
                />
              </div>

              {/* Teléfono: Código de Área */}
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

              {/* Teléfono: Número */}
              <div className="form-group">
                <label className="form-label">Número de teléfono *</label>
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

            <button type="submit" className="btn btn-accent btn-center" style={{ marginTop: '2rem', display: 'block', width: '200px' }}>
              Continuar
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleQuoteSubmit}>
            <div className="form-grid">

              {/* Primer nombre */}
              <div className="form-group">
                <label className="form-label">Nombre *</label>
                <input
                  type="text"
                  className="form-input"
                  value={quoteForm.primer_nombre}
                  onChange={e => setQuoteForm({...quoteForm, primer_nombre: e.target.value})}
                  required
                />
              </div>

              {/* Primer apellido */}
              <div className="form-group">
                <label className="form-label">Apellido *</label>
                <input
                  type="text"
                  className="form-input"
                  value={quoteForm.primer_apellido}
                  onChange={e => setQuoteForm({...quoteForm, primer_apellido: e.target.value})}
                  required
                />
              </div>

              {/* Cédula */}
              <div className="form-group">
                <label className="form-label">Cédula *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ej: 12345678"
                  value={quoteForm.nro_documento}
                  onChange={e => setQuoteForm({...quoteForm, nro_documento: e.target.value})}
                  required
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

              {/* Número de hijos */}
              <div className="form-group">
                <label className="form-label">Número de hijos</label>
                <input
                  type="number"
                  min="0"
                  className="form-input"
                  placeholder="0"
                  value={quoteForm.numero_hijos}
                  onChange={e => setQuoteForm({...quoteForm, numero_hijos: e.target.value})}
                />
              </div>

              {/* Suma Asegurada */}
              <div className="form-group">
                <label className="form-label">Suma Asegurada Deseada *</label>
                <select
                  className="form-input"
                  value={quoteForm.suma_asegurada}
                  onChange={e => setQuoteForm({...quoteForm, suma_asegurada: e.target.value})}
                  required
                >
                  <option value="">Selecciona una suma asegurada...</option>
                  {sumsList.map(s => (
                    <option key={s} value={s}>${s.toLocaleString('en-US')}</option>
                  ))}
                </select>
              </div>

              {/* Asesor / Compañía */}
              <div className="form-group">
                <label className="form-label">Asesor JKA Seleccionado *</label>
                <select
                  className="form-input"
                  value={quoteForm.asesor_id}
                  onChange={e => setQuoteForm({...quoteForm, asesor_id: e.target.value})}
                  required
                >
                  <option value="">Selecciona un asesor...</option>
                  {advisorsList.map(adv => (
                    <option key={adv.id} value={adv.id}>
                      {adv.nombre} ({adv.codigo_asesor})
                    </option>
                  ))}
                </select>
              </div>

            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '2rem' }}>
              <button type="button" className="btn btn-secondary" style={{ width: '150px' }} onClick={() => setStep(1)} disabled={loading}>
                Atrás
              </button>
              <button type="submit" className="btn btn-accent" style={{ width: '200px' }} disabled={loading}>
                {loading ? 'Calculando...' : 'Cotizar Seguros'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* --- COMPARATIVA DE RESULTADOS DE COTIZACIÓN --- */}
      {quotingResults && (
        <div className="card" style={{ marginTop: '3rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
            <div>
              <h3 className="card-title" style={{ border: 'none', margin: 0, padding: 0 }}>
                Cuadro Comparativo de Opciones Encontradas
              </h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Edad cotizada: <strong>{quotingResults.edad} años</strong> | Suma Asegurada: <strong>${Number(quotingResults.suma_asegurada).toLocaleString('en-US')}</strong>
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn btn-secondary" onClick={sendEmailPdf} disabled={loading}>
                Enviar por Correo
              </button>
            </div>
          </div>

          <div className="results-grid">
            {quotingResults.comparativa.map((comp) => {
              const isBest = comp.recomendada;
              return (
                <div 
                  key={comp.id} 
                  className={`result-card ${isBest ? 'best-price' : ''}`}
                  style={{
                    position: 'relative',
                    border: isBest ? '2px solid #10b981' : '1px solid var(--border)',
                    boxShadow: isBest ? '0 10px 30px rgba(16, 185, 129, 0.08)' : '0 4px 10px var(--shadow)'
                  }}
                >
                  {isBest && (
                    <span 
                      className="result-badge" 
                      style={{ 
                        position: 'absolute', 
                        top: '-12px', 
                        left: '1.5rem', 
                        background: '#10b981', 
                        color: '#fff', 
                        padding: '0.25rem 0.75rem', 
                        borderRadius: '20px', 
                        fontSize: '0.75rem', 
                        fontWeight: '700',
                        boxShadow: '0 4px 10px rgba(16, 185, 129, 0.2)'
                      }}
                    >
                      ★ ¡Recomendación JKA (Mejor Costo/Beneficio)!
                    </span>
                  )}
                  
                  <div className="result-header" style={{ marginTop: isBest ? '0.5rem' : '0' }}>
                    <div className="result-company" style={{ fontSize: '1.25rem', fontWeight: '800' }}>{comp.nombre}</div>
                    <div className="result-price-box">
                      <span className="result-price" style={{ color: isBest ? '#10b981' : 'var(--primary)' }}>
                        {comp.prima ? `$${comp.prima}` : 'No Disponible'}
                      </span>
                      {comp.prima && <span className="result-price-period"> / año</span>}
                    </div>
                  </div>

                  <div className="result-features" style={{ margin: '1.5rem 0' }}>
                    <div className="result-feature">
                      <span className="result-feature-label">Plan:</span>
                      <span className="result-feature-value">{comp.plan || 'N/A'}</span>
                    </div>
                    <div className="result-feature">
                      <span className="result-feature-label">Maternidad:</span>
                      <span className="result-feature-value">
                        {comp.maternidad_suma ? `${comp.maternidad_suma}${comp.maternidad_costo ? ` (+${comp.maternidad_costo}/año)` : ''}` : 'No incluida'}
                      </span>
                    </div>
                    <div className="result-feature">
                      <span className="result-feature-label">Asistencia Internacional:</span>
                      <span className="result-feature-value">
                        {comp.asist_intl_suma ? `${comp.asist_intl_suma}${comp.asist_intl_costo ? ` (+${comp.asist_intl_costo}/año)` : ''}` : 'No incluida'}
                      </span>
                    </div>
                    <div className="result-feature">
                      <span className="result-feature-label">Funeral:</span>
                      <span className="result-feature-value">
                        {comp.funeral_suma ? `${comp.funeral_suma}${comp.funeral_costo ? ` (+${comp.funeral_costo}/año)` : ''}` : 'No incluido'}
                      </span>
                    </div>
                    <div className="result-feature">
                      <span className="result-feature-label">Condición Pago:</span>
                      <span className="result-feature-value">{comp.pago || 'Consultar'}</span>
                    </div>

                    {/* Mostrar puntuación técnica */}
                    <div className="result-feature" style={{ borderTop: '1px dashed var(--border)', paddingTop: '0.5rem', marginTop: '0.5rem' }}>
                      <span className="result-feature-label" style={{ fontWeight: '600' }}>Score de Cobertura:</span>
                      <span className="result-feature-value" style={{ color: 'var(--primary)', fontWeight: '700' }}>
                        {comp.calidadScore} / 50 pts
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: 'auto' }}>
                    {(!isLoggedIn || (user && user.rango === 'cliente')) && (
                      <button 
                        className="btn btn-primary" 
                        style={{ flex: 1, padding: '0.6rem 0.5rem', fontSize: '0.85rem' }}
                        onClick={() => handleContratarPoliza(comp)}
                        disabled={!comp.prima}
                      >
                        {!isLoggedIn ? 'Regístrate para Solicitar' : 'Solicitar Emisión'}
                      </button>
                    )}
                    <button 
                      className="btn" 
                      style={{ 
                        flex: 1, 
                        padding: '0.6rem 0.5rem', 
                        fontSize: '0.85rem', 
                        background: '#25d366', 
                        color: '#fff', 
                        border: 'none', 
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.25rem',
                        fontWeight: '600'
                      }}
                      onClick={() => handleWhatsAppContact(comp)}
                      disabled={!comp.prima}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.717-1.458L0 24zm6.59-4.846c1.6.95 3.498 1.45 5.419 1.451 5.541 0 10.05-4.509 10.054-10.052.002-2.686-1.043-5.207-2.943-7.109-1.9-1.901-4.42-2.946-7.11-2.946-5.544 0-10.056 4.513-10.06 10.058-.001 1.906.5 3.757 1.45 5.372L2.553 21.05l5.094-1.896zm12.338-7.37c-.328-.164-1.94-.959-2.241-1.07-.302-.11-.522-.164-.742.164-.22.329-.85 1.07-1.043 1.29-.193.22-.385.247-.713.082-.328-.164-1.386-.51-2.64-1.627-.975-.87-1.633-1.946-1.825-2.274-.192-.329-.02-.507.144-.671.147-.148.328-.384.493-.576.164-.192.22-.329.328-.548.11-.22.055-.41-.027-.575-.083-.164-.742-1.787-1.017-2.446-.268-.644-.543-.556-.742-.566-.19-.01-.41-.012-.63-.012-.22 0-.577.082-.88.411-.302.33-1.154 1.129-1.154 2.75 0 1.623 1.18 3.193 1.345 3.413.165.22 2.322 3.546 5.626 4.973.785.34 1.398.543 1.879.697.79.25 1.509.215 2.078.13.633-.095 1.94-.794 2.215-1.56.275-.767.275-1.424.192-1.56-.083-.137-.303-.22-.63-.384z"/>
                      </svg>
                      Contratar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
