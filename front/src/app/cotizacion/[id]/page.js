'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useToast } from '../../components/ToastProvider';

function normalizeApiUrl(url) {
  if (!url) return '';
  const trimmed = url.replace(/\/+$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}
const API_URL = normalizeApiUrl(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api');

export default function CotizacionPublicaPage() {
  const params = useParams();
  const { id } = params;
  const router = useRouter();
  const { showToast } = useToast();

  const [quoteData, setQuoteData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [acceptedPolicy, setAcceptedPolicy] = useState(null);

  const fetchQuote = async () => {
    try {
      const res = await fetch(`${API_URL}/quote/share/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo cargar la cotización.');
      setQuoteData(data);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchQuote();
    }
  }, [id]);

  const handleAcceptOption = async (option) => {
    const confirmAccept = confirm(
      `¿Está seguro de que desea seleccionar esta propuesta con ${option.nombre} (Plan: ${option.plan || 'N/A'})? Se registrará su solicitud y su cuenta en el sistema.`
    );
    if (!confirmAccept) return;

    setAccepting(true);
    try {
      const res = await fetch(`${API_URL}/quote/share/${id}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          compania_id: option.id,
          plan: option.plan,
          prima_anual: option.prima,
          suma_asegurada: option.suma_asegurada
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al procesar la aceptación de la cotización.');

      showToast('¡Cotización aceptada y póliza solicitada con éxito!', 'success');
      setAcceptedPolicy(data.poliza);
      
      // Actualizar estado local
      setQuoteData(prev => ({ ...prev, estado: 'aceptada' }));
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '4rem', textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <h3 style={{ color: 'var(--primary)' }}>Cargando cotización personalizada...</h3>
        <p style={{ color: 'var(--text-muted)' }}>Espere un momento, por favor.</p>
      </div>
    );
  }

  if (!quoteData) {
    return (
      <div style={{ padding: '4rem', textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <h3 style={{ color: '#ef4444' }}>Cotización no encontrada</h3>
        <p style={{ color: 'var(--text-muted)' }}>El enlace podría estar vencido o el identificador es incorrecto.</p>
        <button className="btn btn-primary" onClick={() => router.push('/')} style={{ marginTop: '1.5rem' }}>
          Ir al Inicio
        </button>
      </div>
    );
  }

  const { cliente_datos, asesor, comparativa, suma_asegurada } = quoteData;
  const clientName = `${cliente_datos.primer_nombre} ${cliente_datos.primer_apellido}`;
  const advisorName = asesor ? asesor.nombre : 'Asesor Comercial';

  if (acceptedPolicy) {
    return (
      <div style={{ maxWidth: '650px', margin: '4rem auto', padding: '2rem', fontFamily: 'system-ui, sans-serif' }} className="card">
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <span style={{ fontSize: '4rem' }}>🎉</span>
          <h2 style={{ color: '#10b981', fontWeight: 800, marginTop: '1rem' }}>¡Solicitud Enviada con Éxito!</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginTop: '0.5rem' }}>
            Tu cuenta y póliza se han registrado de forma automática en JKA Seguros.
          </p>
        </div>

        <div style={{ backgroundColor: 'var(--secondary)', padding: '1.5rem', borderRadius: '8px', marginBottom: '2rem', border: '1px solid var(--border)' }}>
          <h4 style={{ margin: '0 0 0.75rem 0', color: 'var(--primary)' }}>Detalles de la Emisión:</h4>
          <ul style={{ paddingLeft: '1.25rem', margin: 0, fontSize: '0.9rem', lineHeight: '1.6' }}>
            <li><strong>Código de Póliza:</strong> {acceptedPolicy.codigo_poliza}</li>
            <li><strong>Aseguradora:</strong> {comparativa.find(c => c.id === acceptedPolicy.compania_id)?.nombre || 'Seleccionada'}</li>
            <li><strong>Plan:</strong> {acceptedPolicy.plan}</li>
            <li><strong>Estado:</strong> <span style={{ color: '#d97706', fontWeight: 'bold' }}>{acceptedPolicy.estado.toUpperCase()}</span></li>
            <li><strong>Asesor Asignado:</strong> {advisorName}</li>
          </ul>
        </div>

        <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', padding: '1rem', borderRadius: '8px', marginBottom: '2rem', fontSize: '0.88rem', color: '#1e3a8a' }}>
          <p style={{ margin: '0 0 0.5rem 0' }}><strong>🔒 Credenciales de Acceso:</strong></p>
          <p style={{ margin: 0 }}>
            Se ha creado tu cuenta con el correo: <strong>{cliente_datos.correo}</strong>.
            <br />
            Tu contraseña temporal es: <code style={{ backgroundColor: '#fff', padding: '0.1rem 0.3rem', borderRadius: '4px', fontWeight: 'bold' }}>JKA-{cliente_datos.nro_documento}</code>.
            Puedes ingresar cuando quieras para gestionar tus cuotas y pagos.
          </p>
        </div>

        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: '1.5', textAlign: 'center' }}>
          📧 Hemos enviado un correo electrónico a <strong>{cliente_datos.correo}</strong> con la documentación y condicionado oficial del seguro. Revísalo para completar tu planilla médica.
        </p>

        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <button className="btn btn-primary" onClick={() => router.push('/login')} style={{ width: '100%' }}>
            🔑 Iniciar Sesión en JKA
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      
      {/* Banner de Bienvenida */}
      <div className="card" style={{ padding: '2rem', borderBottom: '4px solid var(--primary)', marginBottom: '2.5rem' }}>
        <h2 style={{ color: 'var(--primary)', fontWeight: 800, margin: 0 }}>Propuesta de Seguro de Salud</h2>
        <p style={{ fontSize: '1.05rem', color: 'var(--text-muted)', marginTop: '0.5rem', lineHeight: '1.6' }}>
          Hola <strong>{clientName}</strong>, tu asesor comercial <strong>{advisorName}</strong> de JKA Consultores ha diseñado esta cotización a tu medida. Revisa los planes a continuación y solicita el de tu preferencia de forma instantánea presionando <strong>"Quiero este plan"</strong>.
        </p>
        {asesor && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem', fontSize: '0.9rem' }}>
            <span>📞 <strong>Contacto Asesor:</strong> {asesor.telefono}</span>
            <span>|</span>
            <span>✉ <strong>Email:</strong> {asesor.correo}</span>
          </div>
        )}
      </div>

      <h3 style={{ color: 'var(--primary)', fontWeight: 700, marginBottom: '1.5rem' }}>Planes de Seguro Cotizados:</h3>

      {/* Grid de comparativas */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
        {comparativa.map((comp) => {
          const isBest = !!comp.recomendada;
          return (
            <div 
              key={comp.id} 
              className="card" 
              style={{ 
                padding: '2rem', 
                border: isBest ? '2px solid #2563eb' : '1px solid var(--border)',
                backgroundColor: isBest ? '#f8fafc' : '#fff',
                boxShadow: '0 4px 6px rgba(0,0,0,0.02)',
                position: 'relative'
              }}
            >
              {isBest && (
                <div style={{ 
                  position: 'absolute', 
                  top: '-15px', 
                  right: '20px', 
                  backgroundColor: '#10b981', 
                  color: '#fff', 
                  fontSize: '0.75rem', 
                  fontWeight: 'bold', 
                  padding: '0.35rem 0.85rem', 
                  borderRadius: '20px',
                  boxShadow: '0 2px 4px rgba(16,185,129,0.3)'
                }}>
                  👍 MEJOR RELACIÓN CALIDAD/PRECIO
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <h4 style={{ color: 'var(--primary)', fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>{comp.nombre}</h4>
                  <span style={{ fontSize: '0.85rem', color: '#2563eb', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Plan: {comp.plan || 'Único'}
                  </span>
                </div>
                <div style={{ backgroundColor: isBest ? '#eef2ff' : 'var(--secondary)', padding: '0.75rem 1.25rem', borderRadius: '8px', textAlign: 'center', minWidth: '130px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', textTransform: 'uppercase' }}>Prima Anual</span>
                  <span style={{ fontSize: '1.6rem', color: 'var(--primary)', fontWeight: 800 }}>${parseFloat(comp.prima).toLocaleString('en-US')}</span>
                </div>
              </div>

              {/* Beneficios */}
              <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1.25rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                  <div><strong>🤰 Maternidad:</strong> {comp.maternidad_suma ? comp.maternidad_suma + (comp.maternidad_costo ? ' (+' + comp.maternidad_costo + ')' : '') : 'No incluida'}</div>
                  <div><strong>🌍 Asistencia Internacional:</strong> {comp.asist_intl_suma ? comp.asist_intl_suma + (comp.asist_intl_costo ? ' (+' + comp.asist_intl_costo + ')' : '') : 'No incluida'}</div>
                  <div><strong>⚰ Funeral:</strong> {comp.funeral_suma ? comp.funeral_suma + (comp.funeral_costo ? ' (+' + comp.funeral_costo + ')' : '') : 'No incluido'}</div>
                  <div><strong>💳 Suma Asegurada:</strong> ${parseFloat(comp.suma_asegurada || suma_asegurada).toLocaleString('en-US')}</div>
                </div>
              </div>

              {/* Acciones */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2rem', borderTop: '1px dashed var(--border)', paddingTop: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Calidad de Cobertura: <strong>{comp.calidadScore || 0}/50 pts</strong>
                </span>
                
                {quoteData.estado === 'aceptada' ? (
                  <button className="btn btn-secondary" disabled style={{ color: '#10b981', borderColor: '#d1fae5', background: '#f0fdf4' }}>
                    ✓ Cotización ya Procesada
                  </button>
                ) : (
                  <button 
                    onClick={() => handleAcceptOption(comp)}
                    className="btn btn-accent" 
                    style={{ padding: '0.75rem 2rem', fontWeight: 'bold' }}
                    disabled={accepting}
                  >
                    {accepting ? 'Procesando...' : 'Quiero este plan 🚀'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      
    </div>
  );
}
