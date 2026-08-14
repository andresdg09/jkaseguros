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

  // --- NUEVOS ESTADOS PARA ASESOR ---
  const [clientsList, setClientsList] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [companiesList, setCompaniesList] = useState([]);
  const [selectedCompanies, setSelectedCompanies] = useState([]);
  const [activeResultTab, setActiveResultTab] = useState('suma1'); // 'suma1', 'suma2'

  // --- ESTADO DEL FORMULARIO ---
  const [quoteForm, setQuoteForm] = useState({
    fecha_nacimiento: '',
    tipo_documento: 'Venezolano',
    nro_documento: '',
    primer_nombre: '',
    primer_apellido: '',
    genero: 'Masculino',
    estado_civil: 'Soltero',
    tiene_dependientes: 'No',
    cantidad_dependientes: '',
    dependientes: [],
    correo: '',
    codigo_area: '0412',
    numero_celular: '',
    suma_asegurada: '',
    suma_asegurada_2: '',
    asesor_id: ''
  });

  const isAdvisorOrAdmin = isLoggedIn && (user?.rango === 'asesor' || user?.rango === 'admin');

  // Cargar lista pública de asesores
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

  // Cargar sumas aseguradas
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

  // Cargar clientes asignados al asesor o todos si es admin
  useEffect(() => {
    if (isAdvisorOrAdmin && token) {
      const fetchClients = async () => {
        try {
          const endpoint = user.rango === 'asesor' ? '/advisor/clients' : '/admin/clients';
          const res = await fetch(`${API_URL}${endpoint}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            setClientsList(data);
          }
        } catch (err) {
          console.error('Error al cargar clientes:', err);
        }
      };
      fetchClients();
    }
  }, [isAdvisorOrAdmin, token, user]);

  // Cargar todas las compañías
  useEffect(() => {
    if (isAdvisorOrAdmin && token) {
      const fetchCompanies = async () => {
        try {
          const res = await fetch(`${API_URL}/admin/companies`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            setCompaniesList(data);
            // Por defecto, pre-seleccionar hasta las primeras 3 compañías
            setSelectedCompanies(data.slice(0, 3).map(c => c.id));
          }
        } catch (err) {
          console.error('Error al cargar compañías:', err);
        }
      };
      fetchCompanies();
    }
  }, [isAdvisorOrAdmin, token, user]);

  // Establecer asesor por defecto si el usuario logueado es asesor
  useEffect(() => {
    if (isLoggedIn && user?.rango === 'asesor' && advisorsList.length > 0) {
      // Buscar asesor correspondiente al usuario
      const found = advisorsList.find(a => a.correo === user.correo);
      if (found) {
        setQuoteForm(prev => ({ ...prev, asesor_id: String(found.id) }));
      }
    }
  }, [isLoggedIn, user, advisorsList]);

  // Manejar cambio de cliente seleccionado en la cotización
  const handleSelectClientChange = (e) => {
    const cid = e.target.value;
    setSelectedClientId(cid);

    if (!cid) {
      // Limpiar campos personales
      setQuoteForm(prev => ({
        ...prev,
        fecha_nacimiento: '',
        nro_documento: '',
        primer_nombre: '',
        primer_apellido: '',
        correo: '',
        numero_celular: '',
        estado_civil: 'Soltero',
        genero: 'Masculino',
        tiene_dependientes: 'No',
        cantidad_dependientes: '',
        dependientes: []
      }));
      return;
    }

    const selectedCli = clientsList.find(c => String(c.id || c.id_cliente) === String(cid));
    if (selectedCli) {
      const birth = selectedCli.fecha_nacimiento ? selectedCli.fecha_nacimiento.split('T')[0] : '';
      const telParts = selectedCli.telefono ? selectedCli.telefono.split('-') : ['', ''];
      const area = telParts[0] || '0412';
      const num = telParts[1] || '';

      setQuoteForm(prev => ({
        ...prev,
        fecha_nacimiento: birth,
        primer_nombre: selectedCli.primer_nombre || selectedCli.nombre?.split(' ')[0] || '',
        primer_apellido: selectedCli.primer_apellido || selectedCli.nombre?.split(' ')[1] || '',
        nro_documento: selectedCli.nro_documento || '',
        tipo_documento: selectedCli.tipo_documento || 'Venezolano',
        genero: selectedCli.genero || 'Masculino',
        estado_civil: selectedCli.estado_civil || 'Soltero',
        tiene_dependientes: 'No',
        cantidad_dependientes: '',
        dependientes: [],
        correo: selectedCli.correo || '',
        codigo_area: area,
        numero_celular: num
      }));
    }
  };

  const handleCantidadDependientesChange = (qtyStr) => {
    const qty = Math.max(0, parseInt(qtyStr) || 0);
    setQuoteForm(prev => {
      const newDeps = [...prev.dependientes];
      if (newDeps.length < qty) {
        for (let i = newDeps.length; i < qty; i++) {
          newDeps.push({ relacion: 'hijo', edad: '' });
        }
      } else if (newDeps.length > qty) {
        newDeps.splice(qty);
      }
      return {
        ...prev,
        cantidad_dependientes: qtyStr,
        dependientes: newDeps
      };
    });
  };

  // Manejar selección de aseguradoras por checkbox
  const handleCompanyCheckboxChange = (id) => {
    setSelectedCompanies(prev => {
      if (prev.includes(id)) {
        return prev.filter(cId => cId !== id);
      } else {
        if (prev.length >= 3) {
          showToast('Solo puede seleccionar un máximo de 3 compañías de seguros.', 'error');
          return prev;
        }
        return [...prev, id];
      }
    });
  };

  // Ejecutar llamada a API de cotización
  const ejecutarCotizacion = async (clienteActivo, sumaAsegurada, sumaAsegurada2 = null, companiaIds = null) => {
    setLoading(true);
    try {
      const bodyPayload = {
        fecha_nacimiento: clienteActivo.fecha_nacimiento,
        suma_asegurada: sumaAsegurada,
        ...(sumaAsegurada2 ? { suma_asegurada_2: sumaAsegurada2 } : {}),
        ...(companiaIds && companiaIds.length > 0 ? { compania_ids: companiaIds } : {}),
        dependientes: clienteActivo.dependientes || []
      };

      const res = await fetch(`${API_URL}/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al cotizar');

      setQuotingResults(data);
      setActiveResultTab('suma1');
      showToast('Cotización calculada con éxito.');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Paso 1: avanzar al paso 2
  const handleContinueStep1 = (e) => {
    e.preventDefault();
    if (!quoteForm.fecha_nacimiento || !quoteForm.correo || !quoteForm.numero_celular) {
      return showToast('Por favor, rellene todos los campos obligatorios.', 'error');
    }
    setStep(2);
  };

  // Paso 2: Ejecutar cotización
  const handleQuoteSubmit = async (e) => {
    e.preventDefault();

    // Validar restricción de máximo 3 aseguradoras y mínimo 1
    if (selectedCompanies.length === 0) {
      return showToast('Debe seleccionar al menos 1 compañía de seguros.', 'error');
    }
    if (selectedCompanies.length > 3) {
      return showToast('Solo puede seleccionar un máximo de 3 compañías de seguros.', 'error');
    }

    if (!quoteForm.primer_nombre || !quoteForm.primer_apellido || !quoteForm.nro_documento || !quoteForm.suma_asegurada || !quoteForm.asesor_id) {
      return showToast('Por favor, rellene todos los campos obligatorios.', 'error');
    }

    const activeCli = {
      primer_nombre: quoteForm.primer_nombre,
      primer_apellido: quoteForm.primer_apellido,
      fecha_nacimiento: quoteForm.fecha_nacimiento,
      tipo_documento: quoteForm.tipo_documento,
      nro_documento: quoteForm.nro_documento,
      genero: quoteForm.genero,
      estado_civil: quoteForm.estado_civil,
      correo: quoteForm.correo,
      telefono: `${quoteForm.codigo_area}-${quoteForm.numero_celular}`,
      tiene_dependientes: quoteForm.tiene_dependientes,
      cantidad_dependientes: quoteForm.tiene_dependientes === 'Sí' ? parseInt(quoteForm.cantidad_dependientes) || 0 : 0,
      dependientes: quoteForm.tiene_dependientes === 'Sí' ? quoteForm.dependientes : []
    };

    ejecutarCotizacion(
      activeCli,
      quoteForm.suma_asegurada,
      quoteForm.suma_asegurada_2 || null,
      selectedCompanies.length > 0 ? selectedCompanies : null
    );
  };

  // Enviar PDF de cotización por correo manualmente
  const sendEmailPdf = async () => {
    const activeCli = {
      primer_nombre: quoteForm.primer_nombre,
      primer_apellido: quoteForm.primer_apellido,
      fecha_nacimiento: quoteForm.fecha_nacimiento,
      tipo_documento: quoteForm.tipo_documento,
      nro_documento: quoteForm.nro_documento,
      genero: quoteForm.genero,
      estado_civil: quoteForm.estado_civil,
      correo: quoteForm.correo,
      telefono: `${quoteForm.codigo_area}-${quoteForm.numero_celular}`,
      tiene_dependientes: quoteForm.tiene_dependientes,
      cantidad_dependientes: quoteForm.tiene_dependientes === 'Sí' ? parseInt(quoteForm.cantidad_dependientes) || 0 : 0,
      dependientes: quoteForm.tiene_dependientes === 'Sí' ? quoteForm.dependientes : []
    };

    if (!quotingResults || !activeCli.fecha_nacimiento) return;
    setLoading(true);

    const activeComparativa = (activeResultTab === 'suma2' && quotingResults.comparativa_2) ? quotingResults.comparativa_2 : quotingResults.comparativa;
    const activeSuma = (activeResultTab === 'suma2') ? quotingResults.suma_asegurada_2 : quotingResults.suma_asegurada;

    try {
      const selectedAdvisor = advisorsList.find(a => String(a.id) === String(quoteForm.asesor_id));
      const res = await fetch(`${API_URL}/quote/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente: activeCli,
          edad: quotingResults.edad,
          suma_asegurada: activeSuma,
          comparativas: activeComparativa,
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
    if (!token) return showToast('Debe iniciar sesión para realizar esta acción.', 'error');
    setLoading(true);

    // Buscar si existe un cliente registrado con ese número de documento para vincularlo
    let targetClienteId = null;
    if (selectedClientId) {
      targetClienteId = selectedClientId;
    } else {
      const matched = clientsList.find(c => c.nro_documento === quoteForm.nro_documento);
      if (matched) targetClienteId = matched.id;
    }

    if (!targetClienteId) {
      return showToast('Por favor registre al cliente en el sistema antes de solicitar la emisión formal de la póliza.', 'error');
    }

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
          suma_asegurada: compania.suma_asegurada,
          prima_anual: compania.prima,
          asesor_id: quoteForm.asesor_id || user?.id,
          cliente_id: targetClienteId
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

    const mensaje = `Hola ${advisorName}, estoy interesado en contratar el seguro de salud de *${compania.nombre}*${planText} con una prima anual de *$${compania.prima}* para la suma asegurada de *$${compania.suma_asegurada}*. Datos de asegurado: *${quoteForm.primer_nombre} ${quoteForm.primer_apellido}* (${docText}, edad: ${userAge} años). ¡Espero su respuesta!`;
    
    const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(mensaje)}`;
    window.open(waUrl, '_blank');
  };

  if (!hydrated) return null;

  // --- RENDERIZAR BANNER PARA CLIENTE / INVITADO ---
  if (!isAdvisorOrAdmin) {
    return (
      <div style={{ padding: '2rem 1rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--primary)', marginBottom: '1rem' }}>
            JKA Consultores de Seguros
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', maxWidth: '600px', margin: '0 auto' }}>
            Broker de seguros con asesoría integral personalizada para proteger lo que más quieres.
          </p>
        </div>

        <div className="card" style={{ maxWidth: '750px', margin: '0 auto', padding: '2.5rem', textAlign: 'center' }}>
          <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>🛡️</div>
          <h2 style={{ color: 'var(--primary)', fontWeight: 700, marginBottom: '1rem' }}>Cotizaciones Personalizadas</h2>
          
          <p style={{ color: 'var(--text-muted)', fontSize: '1rem', lineHeight: '1.6', marginBottom: '2rem' }}>
            Estimado asegurado, le informamos que las cotizaciones y cuadros comparativos son gestionados directamente por nuestros asesores certificados para garantizar la mejor tasa y cobertura adaptada a sus necesidades específicas.
          </p>

          <div style={{ backgroundColor: 'var(--secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '1.5rem', marginBottom: '2.5rem', textAlign: 'left' }}>
            <h4 style={{ color: 'var(--primary)', margin: '0 0 0.5rem 0', fontWeight: 'bold' }}>¿Deseas una Cotización?</h4>
            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem' }}>
              Puedes ponerte en contacto directo con cualquiera de nuestros asesores a través de WhatsApp. Te responderemos de inmediato y te enviaremos tu cuadro comparativo en PDF y por correo electrónico.
            </p>
          </div>

          <h3 style={{ color: 'var(--primary)', fontWeight: 'bold', marginBottom: '1.25rem', textAlign: 'left', borderBottom: '1.5px solid var(--border)', paddingBottom: '0.5rem' }}>
            Directorio de Asesores JKA
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem', textAlign: 'left', marginBottom: '2rem' }}>
            {advisorsList.map(adv => {
              const cleanPhone = adv.telefono ? adv.telefono.replace(/[^0-9]/g, '') : '584121234567';
              const waLink = `https://wa.me/${cleanPhone}?text=Hola%20deseo%20cotizar%20un%20seguro%20de%20salud%20con%20usted.%20Mi%20nombre%20es...`;
              return (
                <div key={adv.id} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '1rem', backgroundColor: '#fff' }}>
                  <strong style={{ color: 'var(--primary)', display: 'block', fontSize: '0.95rem' }}>{adv.nombre}</strong>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.75rem' }}>Código: {adv.codigo_asesor}</span>
                  <a 
                    href={waLink} 
                    target="_blank" 
                    className="btn btn-accent" 
                    style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', textDecoration: 'none' }}
                  >
                    💬 Contactar Asesor
                  </a>
                </div>
              );
            })}
          </div>

          {!isLoggedIn && (
            <button 
              className="btn btn-primary" 
              style={{ width: '200px', display: 'block', margin: '0 auto' }} 
              onClick={() => router.push('/login')}
            >
              Iniciar Sesión
            </button>
          )}
        </div>
      </div>
    );
  }

  // --- RENDERIZAR COTIZADOR PARA ASESORES Y ADMINS ---
  const selectedCount = selectedCompanies.length;
  const showRestrictionWarning = selectedCount === 0 || selectedCount > 3;

  return (
    <div style={{ padding: '1rem 0' }}>
      <div style={{ textAlign: 'center', marginBottom: '3rem', marginTop: '1rem' }}>
        <span className="badge badge-vigente" style={{ textTransform: 'uppercase', marginBottom: '0.5rem', display: 'inline-block' }}>Panel de {user?.rango === 'admin' ? 'Administrador' : 'Asesor'}</span>
        <h1 style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--primary)', marginBottom: '0.5rem', marginTop: 0 }}>
          Generador de Cotizaciones Comparativas
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '1rem', maxWidth: '600px', margin: '0 auto' }}>
          Calcule y envíe cotizaciones de salud de múltiples compañías para sus asegurados.
        </p>
      </div>

      {/* FORMULARIO DE COTIZACIÓN (POR PASOS) */}
      <div className="card">
        <h3 className="card-title" style={{ marginBottom: '0.25rem' }}>Rellenar Datos del Asegurado</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
          Paso {step} de 2: {step === 1 ? 'Cliente y Contacto' : 'Información y Plan de Salud'}
        </p>

        {step === 1 && (
          <form onSubmit={handleContinueStep1}>
            <div className="form-grid">
              
              {/* Dropdown de Clientes del Asesor */}
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Seleccionar Asegurado Asignado</label>
                <select
                  className="form-input"
                  value={selectedClientId}
                  onChange={handleSelectClientChange}
                  style={{ border: '1px solid var(--primary)', fontWeight: '600' }}
                >
                  <option value="">-- Nuevo Asegurado (Rellenar Manualmente) --</option>
                  {clientsList.map(c => {
                    const cid = c.id || c.id_cliente;
                    return (
                      <option key={cid} value={cid}>
                        {c.nombre} ({c.nro_documento})
                      </option>
                    );
                  })}
                </select>
              </div>

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

              {/* ¿Tiene dependientes? */}
              <div className="form-group">
                <label className="form-label">¿Tiene dependientes? *</label>
                <select
                  className="form-input"
                  value={quoteForm.tiene_dependientes}
                  onChange={e => {
                    const val = e.target.value;
                    setQuoteForm(prev => ({
                      ...prev,
                      tiene_dependientes: val,
                      cantidad_dependientes: val === 'Sí' ? prev.cantidad_dependientes || '1' : '',
                      dependientes: val === 'Sí' ? (prev.dependientes.length > 0 ? prev.dependientes : [{ relacion: 'hijo', edad: '' }]) : []
                    }));
                  }}
                >
                  <option value="No">No</option>
                  <option value="Sí">Sí</option>
                </select>
              </div>

              {/* Cantidad de dependientes */}
              {quoteForm.tiene_dependientes === 'Sí' && (
                <div className="form-group">
                  <label className="form-label">Cantidad de dependientes *</label>
                  <input
                    type="number"
                    min="1"
                    className="form-input"
                    placeholder="1"
                    value={quoteForm.cantidad_dependientes}
                    onChange={e => handleCantidadDependientesChange(e.target.value)}
                    required
                  />
                </div>
              )}

              {/* Espacios para cada dependiente */}
              {quoteForm.tiene_dependientes === 'Sí' && quoteForm.dependientes.map((dep, idx) => (
                <div key={idx} className="form-group" style={{ gridColumn: 'span 2', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', border: '1px solid var(--border)', borderRadius: '6px', padding: '1rem', marginTop: '0.5rem', backgroundColor: 'var(--secondary-bg, #f8fafc)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <label className="form-label" style={{ fontSize: '0.85rem' }}>Parentesco dependiente {idx + 1} *</label>
                    <select
                      className="form-input"
                      value={dep.relacion}
                      onChange={e => {
                        const newDeps = [...quoteForm.dependientes];
                        newDeps[idx].relacion = e.target.value;
                        setQuoteForm({...quoteForm, dependientes: newDeps});
                      }}
                      required
                    >
                      <option value="hijo">Hijo</option>
                      <option value="hija">Hija</option>
                      <option value="esposo">Esposo</option>
                      <option value="esposa">Esposa</option>
                      <option value="padre">Padre</option>
                      <option value="madre">Madre</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <label className="form-label" style={{ fontSize: '0.85rem' }}>Edad dependiente {idx + 1} *</label>
                    <input
                      type="number"
                      min="0"
                      max="120"
                      className="form-input"
                      placeholder="Edad"
                      value={dep.edad}
                      onChange={e => {
                        const newDeps = [...quoteForm.dependientes];
                        newDeps[idx].edad = e.target.value;
                        setQuoteForm({...quoteForm, dependientes: newDeps});
                      }}
                      required
                    />
                  </div>
                </div>
              ))}

              {/* Suma Asegurada Principal */}
              <div className="form-group">
                <label className="form-label">Suma Asegurada 1 *</label>
                <select
                  className="form-input"
                  value={quoteForm.suma_asegurada}
                  onChange={e => setQuoteForm({...quoteForm, suma_asegurada: e.target.value})}
                  required
                >
                  <option value="">Selecciona una suma...</option>
                  {sumsList.map(s => (
                    <option key={s} value={s}>${s.toLocaleString('en-US')}</option>
                  ))}
                </select>
              </div>

              {/* Suma Asegurada Secundaria (Opcional) */}
              <div className="form-group">
                <label className="form-label">Suma Asegurada 2 (Opcional)</label>
                <select
                  className="form-input"
                  value={quoteForm.suma_asegurada_2}
                  onChange={e => setQuoteForm({...quoteForm, suma_asegurada_2: e.target.value})}
                >
                  <option value="">-- Ninguna --</option>
                  {sumsList.filter(s => String(s) !== String(quoteForm.suma_asegurada)).map(s => (
                    <option key={s} value={s}>${s.toLocaleString('en-US')}</option>
                  ))}
                </select>
              </div>

              {/* Asesor JKA */}
              <div className="form-group">
                <label className="form-label">Asesor Comercial *</label>
                <select
                  className="form-input"
                  value={quoteForm.asesor_id}
                  onChange={e => setQuoteForm({...quoteForm, asesor_id: e.target.value})}
                  required
                  disabled={user?.rango === 'asesor'}
                >
                  <option value="">Selecciona un asesor...</option>
                  {advisorsList.map(adv => (
                    <option key={adv.id} value={adv.id}>
                      {adv.nombre} ({adv.codigo_asesor})
                    </option>
                  ))}
                </select>
              </div>

              {/* Selección de Aseguradoras */}
              <div className="form-group" style={{ gridColumn: 'span 2', borderTop: '1px solid var(--border)', paddingTop: '1.25rem', marginTop: '0.5rem' }}>
                <label className="form-label" style={{ fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Seleccionar Compañías a Cotizar</span>
                  <span style={{ fontSize: '0.8rem', color: showRestrictionWarning ? 'var(--text-accent)' : '#10b981', fontWeight: 600 }}>
                    Seleccionadas: {selectedCount} / 3 máx.
                  </span>
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem', marginTop: '0.5rem' }}>
                  {companiesList.map(c => {
                    const checked = selectedCompanies.includes(c.id);
                    const disabled = !checked && selectedCount >= 3;
                    return (
                      <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: disabled ? 'not-allowed' : 'pointer', padding: '0.35rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border)', backgroundColor: checked ? 'var(--secondary)' : '#fff', opacity: disabled ? 0.6 : 1 }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => handleCompanyCheckboxChange(c.id)}
                          style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
                        />
                        {c.nombre}
                      </label>
                    );
                  })}
                </div>
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.8rem', color: showRestrictionWarning ? 'var(--text-accent)' : 'var(--text-muted)', fontWeight: showRestrictionWarning ? 600 : 'normal' }}>
                  💡 Puede seleccionar un máximo de 3 compañías de seguros para realizar la cotización.
                </p>
              </div>

            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '2.5rem' }}>
              <button type="button" className="btn btn-secondary" style={{ width: '150px' }} onClick={() => setStep(1)} disabled={loading}>
                Atrás
              </button>
              <button 
                type="submit" 
                className="btn btn-accent" 
                style={{ width: '200px' }} 
                disabled={loading || showRestrictionWarning}
              >
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
                Cuadro Comparativo de Opciones
              </h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Asegurado: <strong>{quoteForm.primer_nombre} {quoteForm.primer_apellido}</strong> | Edad: <strong>{quotingResults.edad} años</strong>
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn btn-secondary" onClick={sendEmailPdf} disabled={loading}>
                Enviar por Correo
              </button>
            </div>
          </div>

          {/* Selector de Pestañas de Suma Asegurada */}
          {quotingResults.suma_asegurada_2 && (
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.75rem', borderBottom: '2px solid var(--border)', paddingBottom: '0.5rem' }}>
              <button
                type="button"
                className={`btn ${activeResultTab === 'suma1' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveResultTab('suma1')}
                style={{ fontSize: '0.85rem', padding: '0.4rem 1rem', borderRadius: '4px' }}
              >
                Suma Asegurada: ${Number(quotingResults.suma_asegurada).toLocaleString('en-US')}
              </button>
              <button
                type="button"
                className={`btn ${activeResultTab === 'suma2' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveResultTab('suma2')}
                style={{ fontSize: '0.85rem', padding: '0.4rem 1rem', borderRadius: '4px' }}
              >
                Suma Asegurada: ${Number(quotingResults.suma_asegurada_2).toLocaleString('en-US')}
              </button>
            </div>
          )}

          {/* Listado de aseguradoras cotizadas */}
          <div className="results-grid">
            {((activeResultTab === 'suma2' && quotingResults.comparativa_2) ? quotingResults.comparativa_2 : quotingResults.comparativa).map((comp) => {
              const isBest = comp.recomendada;
              return (
                <div 
                  key={comp.id} 
                  className={`result-card ${isBest ? 'result-card-best' : ''}`}
                  style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
                >
                  {isBest && (
                    <div className="result-badge">
                      MEJOR RELACIÓN COSTO / CALIDAD
                    </div>
                  )}

                  <div className="result-header">
                    <h4 className="result-title">{comp.nombre}</h4>
                    <span className="result-plan-tag">PLAN: {comp.plan || 'N/D'}</span>
                  </div>

                  <div className="result-price-box">
                    <span className="result-price-label">PRIMA ANUAL</span>
                    <span className="result-price-val">
                      {comp.prima ? `$${Number(comp.prima).toLocaleString('en-US')}` : 'N/D'}
                    </span>
                    <span className="result-price-period">por año</span>
                  </div>

                  <div className="result-features">
                    <div className="result-feature">
                      <span className="result-feature-label">Maternidad:</span>
                      <span className="result-feature-value">
                        {comp.maternidad_suma ? `${comp.maternidad_suma}${comp.maternidad_costo ? ` (+${comp.maternidad_costo}/año)` : ''}` : 'No incluida'}
                      </span>
                    </div>
                    <div className="result-feature">
                      <span className="result-feature-label">Asist. Internacional:</span>
                      <span className="result-feature-value">
                        {comp.asist_intl_suma ? `${comp.asist_intl_suma}${comp.asist_intl_costo ? ` (+${comp.asist_intl_costo}/año)` : ''}` : 'No incluida'}
                      </span>
                    </div>
                    <div className="result-feature">
                      <span className="result-feature-label">Servicio Funeral:</span>
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

                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: 'auto', paddingTop: '1rem' }}>
                    <button 
                      className="btn btn-primary" 
                      style={{ flex: 1, padding: '0.6rem 0.5rem', fontSize: '0.85rem' }}
                      onClick={() => handleContratarPoliza(comp)}
                      disabled={!comp.prima || loading}
                    >
                      Solicitar Emisión
                    </button>
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
