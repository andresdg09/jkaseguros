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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100 flex flex-col items-center max-w-sm w-full text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <h3 className="font-extrabold text-slate-800 text-lg">Cargando tu perfil</h3>
          <p className="text-slate-500 text-xs mt-1">Estamos preparando tu formulario personalizado...</p>
        </div>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 text-center border border-slate-100">
          <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl font-bold shadow-inner">
            ⚠️
          </div>
          <h2 className="text-2xl font-black text-slate-800 mb-2">Enlace no disponible</h2>
          <p className="text-slate-500 text-sm mb-6 leading-relaxed">{errorMsg}</p>
          <div className="p-4 bg-slate-50 rounded-2xl text-xs text-slate-500 border border-slate-200">
            Comunícate con tu asesor de seguros asignado para que te proporcione un nuevo enlace seguro.
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50/50 to-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8 text-center border border-slate-100 animate-fadeIn">
          <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-3xl flex items-center justify-center mx-auto mb-5 text-4xl shadow-inner border border-emerald-100">
            ✓
          </div>
          <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-extrabold uppercase tracking-wider">
            Actualización Exitosa
          </span>
          <h2 className="text-2xl font-black text-slate-900 mt-3 mb-2">¡Muchas gracias, {formData.primer_nombre}!</h2>
          <p className="text-slate-600 text-sm mb-6 leading-relaxed">
            Tu información ha sido sincronizada de forma segura en nuestro sistema. Tu asesor la revisará para adaptar tus coberturas y recordatorios.
          </p>
          <div className="p-5 bg-gradient-to-br from-blue-50 to-indigo-50/50 rounded-2xl text-left border border-blue-100/80">
            <div className="flex items-center gap-2 text-blue-900 font-extrabold text-sm mb-1">
              <span>🛡️</span>
              <span>JKA Seguros & Protección 360</span>
            </div>
            <p className="text-xs text-blue-700 leading-relaxed">
              Siempre protegemos tu privacidad. Puedes cerrar esta ventana con total tranquilidad.
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
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-white to-blue-50/40 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto space-y-6">
        
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-200/60 shadow-xs">
            <span className="text-base">🛡️</span>
            <span className="text-xs font-extrabold text-blue-800 tracking-wider uppercase">JKA Seguros • Ficha de Asegurado</span>
          </div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Actualiza tus Datos de Contacto</h1>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Hola <strong className="text-slate-800 font-bold">{formData.primer_nombre} {formData.primer_apellido}</strong>. Completa estos sencillos datos para garantizar una atención rápida en caso de emergencias o renovaciones.
          </p>
        </div>

        {/* Form Container */}
        <form onSubmit={handleSubmit} className="bg-white rounded-3xl shadow-xl shadow-slate-200/60 border border-slate-200/80 overflow-hidden">
          
          <div className="p-6 sm:p-8 space-y-8">
            
            {/* Bloque 1: Contacto */}
            <div>
              <div className="flex items-center gap-2.5 mb-4 pb-2 border-b border-slate-100">
                <span className="w-7 h-7 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-black text-xs">1</span>
                <h2 className="text-base font-extrabold text-slate-900">¿Cómo nos comunicamos contigo?</h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Teléfono / WhatsApp *</label>
                  <div className="flex gap-2">
                    <select
                      value={formData.codigo_area}
                      onChange={(e) => setFormData({ ...formData, codigo_area: e.target.value })}
                      className="w-24 px-3 py-2.5 border border-slate-300 rounded-xl text-sm bg-slate-50 font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
                      className="flex-1 px-4 py-2.5 border border-slate-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Ciudad de Residencia</label>
                  <input
                    type="text"
                    value={formData.ciudad_residencia}
                    onChange={(e) => setFormData({ ...formData, ciudad_residencia: e.target.value })}
                    placeholder="Ej: Caracas, Valencia, Maracaibo..."
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Canal de Contacto Preferido</label>
                  <select
                    value={formData.canal_contacto}
                    onChange={(e) => setFormData({ ...formData, canal_contacto: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm bg-white font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="WhatsApp">💬 Mensaje de WhatsApp</option>
                    <option value="Llamada">📞 Llamada Telefónica</option>
                    <option value="Correo">✉️ Correo Electrónico</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Horario Recomendado</label>
                  <select
                    value={formData.horario_contacto}
                    onChange={(e) => setFormData({ ...formData, horario_contacto: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm bg-white font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
            <div>
              <div className="flex items-center gap-2.5 mb-4 pb-2 border-b border-slate-100">
                <span className="w-7 h-7 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-xs">2</span>
                <h2 className="text-base font-extrabold text-slate-900">Tu núcleo y actividad</h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Profesión u Ocupación</label>
                  <input
                    type="text"
                    value={formData.profesion_ocupacion}
                    onChange={(e) => setFormData({ ...formData, profesion_ocupacion: e.target.value })}
                    placeholder="Ej: Odontólogo, Administrador, Comerciante..."
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Estado Civil</label>
                  <select
                    value={formData.estado_civil}
                    onChange={(e) => setFormData({ ...formData, estado_civil: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm bg-white font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="Soltero">Soltero(a)</option>
                    <option value="Casado">Casado(a)</option>
                    <option value="Divorciado">Divorciado(a)</option>
                    <option value="Viudo">Viudo(a)</option>
                    <option value="Unión Libre">Unión Libre</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Número de Hijos</label>
                  <input
                    type="number"
                    min="0"
                    max="20"
                    value={formData.numero_hijos}
                    onChange={(e) => setFormData({ ...formData, numero_hijos: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Personas que dependen de ti</label>
                  <input
                    type="number"
                    min="0"
                    max="20"
                    value={formData.dependientes_economicos}
                    onChange={(e) => setFormData({ ...formData, dependientes_economicos: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">Hijos, cónyuge o padres a tu cargo.</span>
                </div>
              </div>
            </div>

            {/* Bloque 3: Interés Principal */}
            <div>
              <div className="flex items-center gap-2.5 mb-4 pb-2 border-b border-slate-100">
                <span className="w-7 h-7 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-black text-xs">3</span>
                <h2 className="text-base font-extrabold text-slate-900">¿Qué área de protección es más importante hoy?</h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {interestOptions.map((opt) => {
                  const isSelected = formData.interes_principal === opt.key;
                  return (
                    <div
                      key={opt.key}
                      onClick={() => setFormData({ ...formData, interes_principal: opt.key })}
                      className={`p-4 rounded-2xl border-2 cursor-pointer transition-all duration-200 flex items-start gap-3 ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/50 shadow-sm ring-1 ring-blue-500'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <span className="text-2xl flex-shrink-0">{opt.icon}</span>
                      <div>
                        <h4 className={`text-xs font-black ${isSelected ? 'text-blue-900' : 'text-slate-800'}`}>
                          {opt.title}
                        </h4>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
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
          <div className="p-6 bg-slate-50 border-t border-slate-100 flex flex-col items-center">
            <button
              type="submit"
              disabled={saving}
              className={`w-full max-w-md py-4 px-6 rounded-2xl font-black text-white shadow-xl transition-all flex items-center justify-center space-x-2 text-sm ${
                saving
                  ? 'bg-blue-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 hover:shadow-blue-500/25 active:scale-[0.99]'
              }`}
            >
              {saving ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Guardando tu perfil...</span>
                </>
              ) : (
                <span>✓ Guardar y Actualizar Información</span>
              )}
            </button>
            <p className="text-[11px] text-slate-400 text-center mt-3">
              🔒 Datos protegidos bajo estricto secreto profesional.
            </p>
          </div>

        </form>

      </div>
    </div>
  );
}
