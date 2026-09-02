'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useToast } from '../../components/ToastProvider';

function normalizeApiUrl(url) {
  if (!url) return '';
  const trimmed = url.replace(/\/+$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}
const API_URL = normalizeApiUrl(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api');

export default function ActualizarDatosClientePage() {
  const params = useParams();
  const { token } = params;
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [formData, setFormData] = useState({
    primer_nombre: '',
    primer_apellido: '',
    correo: '',
    codigo_area: '0414',
    numero_celular: '',
    estado_civil: 'Soltero',
    numero_hijos: 0,
    dependientes_economicos: 0,
    profesion_ocupacion: '',
    empresa_trabajo: '',
    ciudad_residencia: '',
    zona_sector: '',
    practica_deportes: 'Ninguno',
    frecuencia_viajes: 'No viaja',
    prioridad_familiar: 'Salud y bienestar general',
    interes_principal: 'Salud Integral',
    canal_contacto: 'WhatsApp',
    horario_contacto: 'Tarde (1:00 PM - 5:00 PM)'
  });

  useEffect(() => {
    const fetchPublicData = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API_URL}/client-profiles/public/${token}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Enlace no válido');

        setFormData({
          primer_nombre: data.primer_nombre || '',
          primer_apellido: data.primer_apellido || '',
          correo: data.correo || '',
          codigo_area: data.codigo_area || '0414',
          numero_celular: data.numero_celular || '',
          estado_civil: data.estado_civil || 'Soltero',
          numero_hijos: data.numero_hijos || 0,
          dependientes_economicos: data.dependientes_economicos !== undefined ? data.dependientes_economicos : (data.numero_hijos || 0),
          profesion_ocupacion: data.profesion_ocupacion || '',
          empresa_trabajo: data.empresa_trabajo || '',
          ciudad_residencia: data.ciudad_residencia || '',
          zona_sector: data.zona_sector || '',
          practica_deportes: data.practica_deportes || 'Ninguno',
          frecuencia_viajes: data.frecuencia_viajes || 'No viaja',
          prioridad_familiar: data.prioridad_familiar || 'Salud y bienestar general',
          interes_principal: data.interes_principal || 'Salud Integral',
          canal_contacto: data.canal_contacto || 'WhatsApp',
          horario_contacto: data.horario_contacto || 'Tarde (1:00 PM - 5:00 PM)'
        });
      } catch (err) {
        setErrorMsg(err.message || 'Error al cargar el formulario.');
      } finally {
        setLoading(false);
      }
    };

    if (token) fetchPublicData();
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      const res = await fetch(`${API_URL}/client-profiles/public/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar datos');

      setSuccess(true);
      showToast('¡Tus datos han sido actualizados con éxito!', 'success');
    } catch (err) {
      showToast(err.message || 'Error al enviar información', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div style={{ backgroundColor: '#ffffff', padding: '2.5rem 2rem', borderRadius: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)', textAlign: 'center', maxWidth: '380px', width: '100%' }}>
          <div className="spinner" style={{ width: '40px', height: '40px', margin: '0 auto 1.25rem', borderColor: '#e2e8f0', borderTopColor: 'var(--primary)' }}></div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Cargando tu Ficha</h3>
          <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.35rem' }}>Estamos preparando tu formulario personalizado...</p>
        </div>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div style={{ backgroundColor: '#ffffff', padding: '2.5rem 2rem', borderRadius: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)', textAlign: 'center', maxWidth: '440px', width: '100%' }}>
          <div style={{ width: '60px', height: '60px', borderRadius: '16px', backgroundColor: '#fef2f2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.75rem', margin: '0 auto 1rem' }}>
            ⚠️
          </div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Enlace no disponible</h2>
          <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '0.5rem 0 1.5rem', lineHeight: 1.5 }}>{errorMsg}</p>
          <div style={{ padding: '0.85rem 1rem', backgroundColor: '#f8fafc', borderRadius: '12px', fontSize: '0.8rem', color: '#475569', border: '1px solid #e2e8f0' }}>
            Comunícate con tu asesor de seguros asignado para que te proporcione un nuevo enlace seguro.
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div style={{ backgroundColor: '#ffffff', padding: '3rem 2rem', borderRadius: '24px', boxShadow: '0 25px 50px rgba(0,0,0,0.25)', textAlign: 'center', maxWidth: '480px', width: '100%' }}>
          <div style={{ width: '70px', height: '70px', borderRadius: '20px', backgroundColor: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.2rem', margin: '0 auto 1.25rem', border: '1px solid #a7f3d0', fontWeight: 900 }}>
            ✓
          </div>
          <span style={{ backgroundColor: '#d1fae5', color: '#065f46', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Actualización Exitosa
          </span>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0f172a', marginTop: '0.75rem', marginBottom: '0.5rem' }}>
            ¡Muchas gracias, {formData.primer_nombre}!
          </h2>
          <p style={{ fontSize: '0.875rem', color: '#64748b', lineHeight: 1.6, marginBottom: '1.5rem' }}>
            Tu información ha sido sincronizada de forma segura en nuestro sistema. Tu asesor la revisará para adaptar tus coberturas y recordatorios.
          </p>
          <div style={{ padding: '1rem 1.25rem', background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)', borderRadius: '16px', textAlign: 'left', border: '1px solid #bbf7d0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#065f46', fontWeight: 800, fontSize: '0.85rem', marginBottom: '0.25rem' }}>
              <span>🛡️</span>
              <span>JKA Seguros & Protección 360</span>
            </div>
            <p style={{ fontSize: '0.775rem', color: '#047857', margin: 0, lineHeight: 1.4 }}>
              Tus datos están protegidos bajo estricto secreto profesional. Puedes cerrar esta ventana con total tranquilidad.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const interestOptions = [
    { key: 'Salud Integral', icon: '🏥', title: 'Salud y Emergencias', desc: 'Atención médica integral, hospitalización y cirugías.' },
    { key: 'Protección Familiar (Vida)', icon: '👨‍👩‍👧', title: 'Protección Familiar (Vida)', desc: 'Respaldo económico garantizado para mis dependientes.' },
    { key: 'Patrimonio y Vehículos', icon: '🚗', title: 'Vehículos y Hogar', desc: 'Cobertura integral para autos, motos e inmuebles.' },
    { key: 'Ahorro para Retiro', icon: '📈', title: 'Ahorro e Inversión', desc: 'Planes garantizados de ahorro a mediano y largo plazo.' }
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #0f172a 0%, #1e3a8a 380px, #f1f5f9 380px, #f8fafc 100%)', padding: '2.5rem 1rem 4rem' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
        
        {/* Brand Header */}
        <div style={{ textAlign: 'center', color: '#ffffff' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.4rem 1rem',
            borderRadius: '9999px',
            backgroundColor: 'rgba(255, 255, 255, 0.15)',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            backdropFilter: 'blur(4px)',
            marginBottom: '0.75rem'
          }}>
            <span style={{ fontSize: '1rem' }}>🛡️</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              JKA Seguros • Ficha de Asegurado
            </span>
          </div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 900, margin: '0 0 0.4rem', letterSpacing: '-0.5px' }}>
            Actualiza tus Datos de Contacto
          </h1>
          <p style={{ fontSize: '0.9rem', color: '#cbd5e1', maxWidth: '520px', margin: '0 auto', lineHeight: 1.5 }}>
            Hola <strong style={{ color: '#ffffff' }}>{formData.primer_nombre} {formData.primer_apellido}</strong>. Completa estos sencillos datos para garantizar una atención rápida ante cualquier emergencia o renovación.
          </p>
        </div>

        {/* Form Container */}
        <form onSubmit={handleSubmit} style={{
          backgroundColor: '#ffffff',
          borderRadius: '24px',
          boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.12)',
          border: '1px solid #e2e8f0',
          overflow: 'hidden'
        }}>
          
          <div style={{ padding: '2rem 1.75rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            
            {/* Bloque 1: Contacto */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
                <span style={{ width: '30px', height: '30px', borderRadius: '10px', backgroundColor: '#eff6ff', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.85rem' }}>
                  1
                </span>
                <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  ¿Cómo nos comunicamos contigo?
                </h2>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>Teléfono / WhatsApp *</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <select
                      value={formData.codigo_area}
                      onChange={(e) => setFormData({ ...formData, codigo_area: e.target.value })}
                      className="form-input"
                      style={{ width: '90px', margin: 0, padding: '0.65rem 0.6rem', borderRadius: '10px', fontWeight: 700, background: '#f8fafc' }}
                    >
                      <option value="0412">0412</option>
                      <option value="0414">0414</option>
                      <option value="0424">0424</option>
                      <option value="0416">0416</option>
                      <option value="0426">0426</option>
                    </select>
                    <input
                      type="tel"
                      required
                      value={formData.numero_celular}
                      onChange={(e) => setFormData({ ...formData, numero_celular: e.target.value.replace(/\D/g, '') })}
                      placeholder="1234567"
                      className="form-input"
                      style={{ flex: 1, margin: 0, padding: '0.65rem 0.9rem', borderRadius: '10px' }}
                    />
                  </div>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>Ciudad de Residencia</label>
                  <input
                    type="text"
                    value={formData.ciudad_residencia}
                    onChange={(e) => setFormData({ ...formData, ciudad_residencia: e.target.value })}
                    placeholder="Ej: Caracas, Valencia, Maracaibo..."
                    className="form-input"
                    style={{ margin: 0, padding: '0.65rem 0.9rem', borderRadius: '10px' }}
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>Canal de Contacto Preferido</label>
                  <select
                    value={formData.canal_contacto}
                    onChange={(e) => setFormData({ ...formData, canal_contacto: e.target.value })}
                    className="form-input"
                    style={{ margin: 0, padding: '0.65rem 0.9rem', borderRadius: '10px', background: '#fff' }}
                  >
                    <option value="WhatsApp">💬 Mensaje de WhatsApp</option>
                    <option value="Llamada">📞 Llamada Telefónica</option>
                    <option value="Correo">✉️ Correo Electrónico</option>
                  </select>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>Horario Recomendado</label>
                  <select
                    value={formData.horario_contacto}
                    onChange={(e) => setFormData({ ...formData, horario_contacto: e.target.value })}
                    className="form-input"
                    style={{ margin: 0, padding: '0.65rem 0.9rem', borderRadius: '10px', background: '#fff' }}
                  >
                    <option value="Mañana (8:00 AM - 12:00 PM)">Mañana (8:00 AM - 12:00 PM)</option>
                    <option value="Tarde (1:00 PM - 5:00 PM)">Tarde (1:00 PM - 5:00 PM)</option>
                    <option value="Noche (5:00 PM - 8:00 PM)">Noche (5:00 PM - 8:00 PM)</option>
                    <option value="Indiferente">Cualquier momento hábil</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Bloque 2: Actividad y Familia */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
                <span style={{ width: '30px', height: '30px', borderRadius: '10px', backgroundColor: '#e0e7ff', color: '#4338ca', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.85rem' }}>
                  2
                </span>
                <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  Tu núcleo y actividad
                </h2>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>Profesión u Ocupación</label>
                  <input
                    type="text"
                    value={formData.profesion_ocupacion}
                    onChange={(e) => setFormData({ ...formData, profesion_ocupacion: e.target.value })}
                    placeholder="Ej: Odontólogo, Administrador, Comerciante..."
                    className="form-input"
                    style={{ margin: 0, padding: '0.65rem 0.9rem', borderRadius: '10px' }}
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>Estado Civil</label>
                  <select
                    value={formData.estado_civil}
                    onChange={(e) => setFormData({ ...formData, estado_civil: e.target.value })}
                    className="form-input"
                    style={{ margin: 0, padding: '0.65rem 0.9rem', borderRadius: '10px', background: '#fff' }}
                  >
                    <option value="Soltero">Soltero(a)</option>
                    <option value="Casado">Casado(a)</option>
                    <option value="Divorciado">Divorciado(a)</option>
                    <option value="Viudo">Viudo(a)</option>
                    <option value="Unión Libre">Unión Libre</option>
                  </select>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>Número de Hijos</label>
                  <input
                    type="number"
                    min="0"
                    max="20"
                    value={formData.numero_hijos}
                    onChange={(e) => setFormData({ ...formData, numero_hijos: parseInt(e.target.value) || 0 })}
                    className="form-input"
                    style={{ margin: 0, padding: '0.65rem 0.9rem', borderRadius: '10px' }}
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>Personas que dependen de ti</label>
                  <input
                    type="number"
                    min="0"
                    max="20"
                    value={formData.dependientes_economicos}
                    onChange={(e) => setFormData({ ...formData, dependientes_economicos: parseInt(e.target.value) || 0 })}
                    className="form-input"
                    style={{ margin: 0, padding: '0.65rem 0.9rem', borderRadius: '10px' }}
                  />
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.25rem', display: 'block' }}>
                    Hijos, cónyuge o padres a tu cargo.
                  </span>
                </div>
              </div>
            </div>

            {/* Bloque 3: Interés Principal */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
                <span style={{ width: '30px', height: '30px', borderRadius: '10px', backgroundColor: '#f3e8ff', color: '#7e22ce', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.85rem' }}>
                  3
                </span>
                <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  ¿Qué área de protección es más importante para ti hoy?
                </h2>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.85rem' }}>
                {interestOptions.map((opt) => {
                  const isSelected = formData.interes_principal === opt.key;
                  return (
                    <div
                      key={opt.key}
                      onClick={() => setFormData({ ...formData, interes_principal: opt.key })}
                      style={{
                        padding: '1.1rem 1.25rem',
                        borderRadius: '16px',
                        border: isSelected ? '2px solid #2563eb' : '1.5px solid #e2e8f0',
                        backgroundColor: isSelected ? '#eff6ff' : '#ffffff',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.85rem',
                        transition: 'all 0.2s ease',
                        boxShadow: isSelected ? '0 4px 12px rgba(37, 99, 235, 0.15)' : 'none'
                      }}
                    >
                      <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>{opt.icon}</span>
                      <div>
                        <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: isSelected ? '#1e3a8a' : '#1e293b', margin: 0 }}>
                          {opt.title}
                        </h4>
                        <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '0.2rem 0 0 0', lineHeight: 1.4 }}>
                          {opt.desc}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>

          {/* Bottom Bar Action */}
          <div style={{ padding: '1.75rem', backgroundColor: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <button
              type="submit"
              disabled={saving}
              className="btn btn-primary"
              style={{
                width: '100%',
                maxWidth: '420px',
                padding: '0.85rem 1.5rem',
                fontSize: '0.95rem',
                fontWeight: 800,
                borderRadius: '14px',
                background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
                boxShadow: '0 4px 15px rgba(37, 99, 235, 0.3)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              {saving ? (
                <>
                  <div className="spinner" style={{ width: '18px', height: '18px', borderTopColor: '#fff' }}></div>
                  <span>Guardando tu perfil...</span>
                </>
              ) : (
                <span>✓ Guardar y Actualizar Información</span>
              )}
            </button>
            <p style={{ fontSize: '0.75rem', color: '#94a3b8', textAlign: 'center', marginTop: '0.75rem', margin: 0 }}>
              🔒 Datos protegidos bajo estricto secreto profesional.
            </p>
          </div>

        </form>

      </div>
    </div>
  );
}

