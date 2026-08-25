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

const FREQ_OPTIONS = [
  { key: 'contado', label: 'Contado (1 pago)', cuotas: 1 },
  { key: 'semestral', label: 'Semestral (2 cuotas)', cuotas: 2 },
  { key: 'cuatrimestral', label: 'Cuatrimestral (3 cuotas)', cuotas: 3 },
  { key: 'trimestral', label: 'Trimestral (4 cuotas)', cuotas: 4 },
  { key: 'mensual', label: 'Mensual (12 cuotas)', cuotas: 12 },
];

export default function CotizacionPublicaPage() {
  const params = useParams();
  const { id } = params;
  const router = useRouter();
  const { showToast } = useToast();

  const [quoteData, setQuoteData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [acceptedPolicy, setAcceptedPolicy] = useState(null);
  const [activeTab, setActiveTab] = useState('suma1'); // 'suma1' | 'suma2'

  // Estado de frecuencia seleccionada por plan: { [compKey]: 'contado' | 'semestral' | ... }
  const [selectedFreqs, setSelectedFreqs] = useState({});

  const fetchQuote = async () => {
    try {
      const res = await fetch(`${API_URL}/quote/share/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo cargar la cotización.');
      setQuoteData(data);

      // Inicializar frecuencia seleccionada para todos los planes disponibles en ambas sumas
      const initialFreqs = {};
      const allPlans = [...(data.comparativa || []), ...(data.comparativa_2 || [])];
      allPlans.forEach(comp => {
        const sumVal = comp.suma_asegurada || data.suma_asegurada;
        const key = `${comp.id}_${comp.plan}_${sumVal}`;
        if (comp.pago_contado) initialFreqs[key] = 'contado';
        else if (comp.pago_semestral) initialFreqs[key] = 'semestral';
        else if (comp.pago_cuatrimestral) initialFreqs[key] = 'cuatrimestral';
        else if (comp.pago_trimestral) initialFreqs[key] = 'trimestral';
        else if (comp.pago_mensual) initialFreqs[key] = 'mensual';
        else initialFreqs[key] = 'contado';
      });
      setSelectedFreqs(initialFreqs);
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

  // Helper: obtener opciones de frecuencia disponibles para un plan
  const getAvailableFreqs = (comp) => {
    const available = [];
    if (comp.pago_contado) available.push(FREQ_OPTIONS[0]);
    if (comp.pago_semestral) available.push(FREQ_OPTIONS[1]);
    if (comp.pago_cuatrimestral) available.push(FREQ_OPTIONS[2]);
    if (comp.pago_trimestral) available.push(FREQ_OPTIONS[3]);
    if (comp.pago_mensual) available.push(FREQ_OPTIONS[4]);
    
    // Si ninguna está marcada o solo 1, ofrecer todas las opciones estándar para que el cliente tenga flexibilidad
    if (available.length <= 1) {
      return FREQ_OPTIONS;
    }
    return available;
  };

  const handleAcceptOption = async (option, sumVal) => {
    const targetSuma = option.suma_asegurada || sumVal || quoteData.suma_asegurada;
    const compKey = `${option.id}_${option.plan}_${targetSuma}`;
    const freq = selectedFreqs[compKey] || 'contado';
    const freqLabel = FREQ_OPTIONS.find(f => f.key === freq)?.label || freq;

    const confirmAccept = confirm(
      `¿Está seguro de que desea seleccionar la propuesta con ${option.nombre} (Plan: ${option.plan || 'Único'}, Suma Asegurada: $${Number(targetSuma).toLocaleString('en-US')}) con frecuencia de pago: ${freqLabel}?\n\nSe registrará su solicitud y su cuenta en el sistema.`
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
          suma_asegurada: targetSuma,
          deducible: option.deducible !== undefined ? option.deducible : 0,
          frecuencia_pago: freq
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
      <div style={{ padding: '4rem 1.5rem', textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <h3 style={{ color: 'var(--primary)' }}>Cargando cotización personalizada...</h3>
        <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Espere un momento, por favor.</p>
      </div>
    );
  }

  if (!quoteData) {
    return (
      <div style={{ padding: '4rem 1.5rem', textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <h3 style={{ color: '#ef4444' }}>Cotización no encontrada</h3>
        <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>El enlace podría estar vencido o el identificador es incorrecto.</p>
        <button className="btn btn-primary" onClick={() => router.push('/')} style={{ marginTop: '1.5rem' }}>
          Ir al Inicio
        </button>
      </div>
    );
  }

  const { cliente_datos, asesor, comparativa, comparativa_2, suma_asegurada, suma_asegurada_2 } = quoteData;
  const clientName = `${cliente_datos.primer_nombre} ${cliente_datos.primer_apellido}`;
  const advisorName = asesor ? asesor.nombre : 'Asesor Comercial';

  const hasMultipleSums = Boolean(suma_asegurada_2 && comparativa_2 && comparativa_2.length > 0);
  const currentComparativa = (activeTab === 'suma2' && hasMultipleSums) ? comparativa_2 : comparativa;
  const currentSuma = (activeTab === 'suma2' && hasMultipleSums) ? suma_asegurada_2 : suma_asegurada;

  if (acceptedPolicy) {
    const allComparativas = [...(comparativa || []), ...(comparativa_2 || [])];
    const compMatch = allComparativas.find(c => c.id === acceptedPolicy.compania_id);

    return (
      <div style={{ maxWidth: '650px', margin: '2rem auto', padding: '2rem', fontFamily: 'system-ui, sans-serif' }} className="card">
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <span style={{ fontSize: '3.5rem' }}>🎉</span>
          <h2 style={{ color: '#10b981', fontWeight: 800, marginTop: '1rem', fontSize: '1.75rem' }}>¡Solicitud Enviada con Éxito!</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginTop: '0.5rem' }}>
            Tu cuenta y póliza se han registrado de forma automática en Protección y Seguros 360.
          </p>
        </div>

        <div style={{ backgroundColor: 'var(--secondary)', padding: '1.5rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid var(--border)' }}>
          <h4 style={{ margin: '0 0 0.75rem 0', color: 'var(--primary)', fontWeight: 700 }}>Detalles de la Emisión:</h4>
          <ul style={{ paddingLeft: '1.25rem', margin: 0, fontSize: '0.9rem', lineHeight: '1.7' }}>
            <li><strong>Código de Póliza:</strong> {acceptedPolicy.codigo_poliza}</li>
            <li><strong>Aseguradora:</strong> {compMatch?.nombre || 'Seleccionada'}</li>
            <li><strong>Plan:</strong> {acceptedPolicy.plan}</li>
            <li><strong>Suma Asegurada:</strong> ${Number(acceptedPolicy.suma_asegurada).toLocaleString('en-US')}</li>
            <li><strong>Deducible:</strong> <span style={{ color: acceptedPolicy.deducible > 0 ? '#b45309' : '#15803d', fontWeight: 'bold' }}>{acceptedPolicy.deducible > 0 ? `$${Number(acceptedPolicy.deducible).toLocaleString('en-US')}` : '$0 (Sin deducible)'}</span></li>
            <li><strong>Frecuencia de Pago:</strong> <span style={{ color: '#2563eb', fontWeight: 'bold', textTransform: 'capitalize' }}>{acceptedPolicy.frecuencia_pago || 'contado'}</span></li>
            <li><strong>Estado:</strong> <span style={{ color: '#d97706', fontWeight: 'bold' }}>{acceptedPolicy.estado.toUpperCase()}</span></li>
            <li><strong>Asesor Asignado:</strong> {advisorName}</li>
          </ul>
        </div>

        <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', padding: '1.25rem', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.9rem', color: '#1e3a8a' }}>
          <p style={{ margin: '0 0 0.5rem 0' }}><strong>🔒 Credenciales de Acceso a tu Portal:</strong></p>
          <p style={{ margin: 0, lineHeight: '1.5' }}>
            Se ha creado tu cuenta con el correo: <strong>{cliente_datos.correo}</strong>.
            <br />
            Tu contraseña temporal es: <code style={{ backgroundColor: '#fff', padding: '0.15rem 0.4rem', borderRadius: '4px', fontWeight: 'bold', color: '#1d4ed8' }}>PS360-{cliente_datos.nro_documento}</code>
            <br />
            <span style={{ fontSize: '0.82rem', color: '#475569', marginTop: '0.25rem', display: 'block' }}>
              Puedes ingresar cuando quieras para consultar el estado de tu póliza y reportar pagos.
            </span>
          </p>
        </div>

        <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: '1.5', textAlign: 'center' }}>
          📧 Hemos enviado un correo electrónico a <strong>{cliente_datos.correo}</strong> con la documentación y condicionado oficial del seguro.
        </p>

        <div style={{ textAlign: 'center', marginTop: '1.75rem' }}>
          <button className="btn btn-primary" onClick={() => router.push('/login')} style={{ width: '100%', padding: '0.75rem' }}>
            🔑 Iniciar Sesión en Protección y Seguros 360
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '1rem 0', maxWidth: '900px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      
      {/* Banner de Bienvenida */}
      <div className="card" style={{ padding: '2rem', borderBottom: '4px solid var(--primary)', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '1.5rem' }}>🛡️</span>
          <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Protección & Seguros 360
          </span>
        </div>
        <h2 style={{ color: 'var(--primary)', fontWeight: 800, margin: 0, fontSize: '1.75rem' }}>Propuesta de Seguro de Salud</h2>
        <p style={{ fontSize: '1rem', color: 'var(--text-muted)', marginTop: '0.75rem', lineHeight: '1.6' }}>
          Hola <strong>{clientName}</strong>, tu asesor comercial <strong>{advisorName}</strong> de <strong>Protección y Seguros 360</strong> ha diseñado esta cotización a tu medida. Revisa los planes a continuación, elige la frecuencia de pago que más te convenga y solicita tu póliza presionando <strong>&quot;Quiero este plan&quot;</strong>.
        </p>
        {asesor && (
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginTop: '1.25rem', borderTop: '1px solid var(--border)', paddingTop: '1rem', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
            <span>📞 <strong>Contacto Asesor:</strong> {asesor.telefono}</span>
            <span>✉ <strong>Email:</strong> {asesor.correo}</span>
          </div>
        )}
      </div>

      {/* Selector de Pestañas si se cotizaron dos sumas aseguradas */}
      {hasMultipleSums && (
        <div style={{ marginBottom: '1.75rem' }}>
          <p style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
            Selecciona la Suma Asegurada para comparar opciones:
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`btn ${activeTab === 'suma1' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab('suma1')}
              style={{ padding: '0.6rem 1.25rem', fontSize: '0.9rem', borderRadius: '8px', fontWeight: 700 }}
            >
              💵 Suma Asegurada: ${Number(suma_asegurada).toLocaleString('en-US')}
            </button>
            <button
              type="button"
              className={`btn ${activeTab === 'suma2' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab('suma2')}
              style={{ padding: '0.6rem 1.25rem', fontSize: '0.9rem', borderRadius: '8px', fontWeight: 700 }}
            >
              💵 Suma Asegurada: ${Number(suma_asegurada_2).toLocaleString('en-US')}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h3 style={{ color: 'var(--primary)', fontWeight: 700, margin: 0 }}>
          Planes Disponibles (Suma: ${Number(currentSuma).toLocaleString('en-US')}):
        </h3>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          {currentComparativa.length} {currentComparativa.length === 1 ? 'opción cotizada' : 'opciones cotizadas'}
        </span>
      </div>

      {/* Grid de comparativas */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.75rem' }}>
        {currentComparativa.map((comp) => {
          const targetSuma = comp.suma_asegurada || currentSuma;
          const compKey = `${comp.id}_${comp.plan}_${targetSuma}`;
          const availableFreqs = getAvailableFreqs(comp);
          const currentFreq = selectedFreqs[compKey] || 'contado';
          const currentFreqInfo = FREQ_OPTIONS.find(f => f.key === currentFreq) || FREQ_OPTIONS[0];
          const cuotaMonto = parseFloat(comp.prima) / currentFreqInfo.cuotas;

          const parseExtraCost = (costStr) => {
            if (!costStr) return 0;
            const num = parseFloat(String(costStr).replace(/[^0-9.]/g, ''));
            return isNaN(num) ? 0 : num;
          };
          const costoMat = parseExtraCost(comp.maternidad_costo);
          const costoAsist = parseExtraCost(comp.asist_intl_costo);
          const costoFuneral = parseExtraCost(comp.funeral_costo);
          const totalExtras = costoMat + costoAsist + costoFuneral;
          const primaBase = parseFloat(comp.prima || 0);
          const primaConExtras = primaBase + totalExtras;

          const serviciosBase = [
            { name: 'At. Primaria', active: !!(comp.atencion_medica_primaria || comp.at_situ_medicamentos === 'INCL') },
            { name: 'Medicamentos', active: !!comp.medicinas },
            { name: 'Cons. Médicas', active: !!comp.consultas_medicas },
            { name: 'Exámenes', active: !!(comp.examenes_lab_imagenologia && comp.examenes_lab_imagenologia !== 'NO') },
            { name: 'Ambulancia', active: !!(comp.ambulancia && comp.ambulancia !== 'NO') },
            { name: 'Rehabilitación', active: !!comp.rehabilitacion },
            { name: 'Prótesis', active: !!comp.protesis },
            { name: 'Muleta + Silla', active: !!comp.muleta_silla_ruedas },
            { name: 'Consultas', active: !!comp.consultas },
            { name: 'Maternidad base', active: !!((comp.maternidad || comp.maternidad_suma) && costoMat === 0) },
            { name: 'Oftalmología', active: !!comp.oftalmologia },
            { name: 'Odontología', active: !!comp.odontologia }
          ];

          return (
            <div 
              key={compKey} 
              className="card" 
              style={{ 
                padding: '1.75rem', 
                border: '1px solid var(--border)',
                backgroundColor: '#fff',
                boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
                position: 'relative'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <h4 style={{ color: 'var(--primary)', fontSize: '1.35rem', fontWeight: 800, margin: 0 }}>{comp.nombre}</h4>
                  <span style={{ fontSize: '0.85rem', color: '#2563eb', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Plan: {comp.plan || 'Único'}
                  </span>
                </div>
                
                {/* Caja de Precio Dual */}
                <div style={{ backgroundColor: 'var(--secondary)', border: '1px solid var(--border)', padding: '0.75rem 1.25rem', borderRadius: '8px', textAlign: 'center', minWidth: '150px' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 700, display: 'block', textTransform: 'uppercase' }}>Prima Base (Sin Extras)</span>
                  <span style={{ fontSize: '1.4rem', color: 'var(--primary)', fontWeight: 800 }}>${primaBase.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>por año</span>
                  
                  <div style={{ borderTop: '1px dashed var(--border)', paddingTop: '0.35rem', marginTop: '0.2rem' }}>
                    {totalExtras > 0 ? (
                      <>
                        <span style={{ fontSize: '0.7rem', color: '#b45309', fontWeight: 700, display: 'block', textTransform: 'uppercase' }}>Total con Extras</span>
                        <span style={{ fontSize: '1.15rem', color: '#15803d', fontWeight: 800 }}>${primaConExtras.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        <span style={{ fontSize: '0.68rem', color: '#b45309', display: 'block' }}>(+${totalExtras.toFixed(2)} en extras)</span>
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize: '0.7rem', color: '#15803d', fontWeight: 700, display: 'block', textTransform: 'uppercase' }}>Plan Completo</span>
                        <span style={{ fontSize: '1rem', color: '#15803d', fontWeight: 800 }}>${primaBase.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>(sin costos extras)</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* SECCIÓN 1: INCLUIDO EN PLAN BASE */}
              <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--primary)', display: 'block', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                  ✓ Incluido en el Plan Base:
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.6rem', fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
                  <div><strong>💳 Suma Asegurada:</strong> ${parseFloat(targetSuma).toLocaleString('en-US')}</div>
                  <div><strong>🛡️ Deducible:</strong> <span style={{ fontWeight: 700, color: (comp.deducible && parseFloat(comp.deducible) > 0) ? '#b45309' : '#15803d' }}>{(comp.deducible && parseFloat(comp.deducible) > 0) ? `$${Number(comp.deducible).toLocaleString('en-US')}` : '$0 (Sin deducible)'}</span></div>
                  <div><strong>📋 Modalidad Base:</strong> Anual / Contado</div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>
                  {serviciosBase.map((s, idx) => (
                    <span 
                      key={idx}
                      style={{ 
                        fontSize: '0.75rem', 
                        padding: '0.2rem 0.5rem', 
                        borderRadius: '4px',
                        background: s.active ? '#dcfce7' : '#f1f5f9',
                        color: s.active ? '#15803d' : '#94a3b8',
                        fontWeight: s.active ? 700 : 500
                      }}
                    >
                      {s.active ? '✓' : '○'} {s.name}
                    </span>
                  ))}
                </div>
              </div>

              {/* SECCIÓN 2: COBERTURAS Y BENEFICIOS EXTRAS (OPCIONALES CON COSTO) */}
              <div style={{ marginTop: '1rem', background: '#f8fafc', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.85rem 1rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: totalExtras > 0 ? '#b45309' : 'var(--primary)', display: 'block', marginBottom: '0.4rem' }}>
                  {totalExtras > 0 ? '➕ Coberturas Extras Opcionales (con costo adicional):' : '➕ Coberturas Opcionales / Suplementarias:'}
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem', fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                  <div>
                    <strong>🤰 Maternidad:</strong> {comp.maternidad_suma ? comp.maternidad_suma : 'No incluida'} {costoMat > 0 && <span style={{ color: '#b45309', fontWeight: 700 }}>(+${costoMat.toFixed(2)}/año)</span>}
                  </div>
                  <div>
                    <strong>🌍 Asist. Internacional:</strong> {comp.asist_intl_suma ? comp.asist_intl_suma : 'No incluida'} {costoAsist > 0 && <span style={{ color: '#b45309', fontWeight: 700 }}>(+${costoAsist.toFixed(2)}/año)</span>}
                  </div>
                  <div>
                    <strong>⚰ Funeral:</strong> {comp.funeral_suma ? comp.funeral_suma : 'No incluido'} {costoFuneral > 0 && <span style={{ color: '#b45309', fontWeight: 700 }}>(+${costoFuneral.toFixed(2)}/año)</span>}
                  </div>
                </div>
              </div>

              {/* Selector de Frecuencia de Pago */}
              {quoteData.estado !== 'aceptada' && (
                <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                  <p style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '0.6rem' }}>
                    💳 Escoge tu forma / frecuencia de pago preferida:
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.5rem' }}>
                    {availableFreqs.map(fOpt => {
                      const isActive = currentFreq === fOpt.key;
                      const cuota = parseFloat(comp.prima) / fOpt.cuotas;
                      return (
                        <button
                          type="button"
                          key={fOpt.key}
                          onClick={() => setSelectedFreqs(prev => ({ ...prev, [compKey]: fOpt.key }))}
                          style={{
                            padding: '0.6rem 0.75rem',
                            borderRadius: '8px',
                            border: isActive ? '2px solid #2563eb' : '1px solid var(--border)',
                            backgroundColor: isActive ? '#eff6ff' : '#f8fafc',
                            color: isActive ? '#1e40af' : 'var(--text-primary)',
                            fontWeight: isActive ? 700 : 500,
                            cursor: 'pointer',
                            fontSize: '0.82rem',
                            textAlign: 'center',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <span style={{ display: 'block', fontSize: '0.8rem' }}>{fOpt.label}</span>
                          <span style={{ display: 'block', fontSize: '1rem', fontWeight: 800, color: isActive ? '#2563eb' : 'var(--primary)', marginTop: '0.2rem' }}>
                            ${cuota.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {fOpt.cuotas === 1 ? 'pago único' : 'por cuota'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {currentFreqInfo && (
                    <div style={{ backgroundColor: '#f8fafc', padding: '0.5rem 0.75rem', borderRadius: '6px', marginTop: '0.6rem', border: '1px dashed var(--border)' }}>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                        {currentFreqInfo.cuotas === 1 ? (
                          <>📋 Modalidad de <strong>Contado</strong>: 1 cuota única de <strong>${parseFloat(comp.prima).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> al inicio de la cobertura.</>
                        ) : (
                          <>📋 Plan fraccionado en <strong>{currentFreqInfo.cuotas} cuotas</strong> de <strong>${cuotaMonto.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> c/u (Total: ${parseFloat(comp.prima).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</>
                        )}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Acciones */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem', borderTop: '1px dashed var(--border)', paddingTop: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Score de Cobertura: <strong>{comp.calidadScore || 0}/50 pts</strong>
                </span>
                
                {quoteData.estado === 'aceptada' ? (
                  <button className="btn btn-secondary" disabled style={{ color: '#10b981', borderColor: '#d1fae5', background: '#f0fdf4', fontSize: '0.85rem' }}>
                    ✓ Cotización ya Procesada
                  </button>
                ) : (
                  <button 
                    onClick={() => handleAcceptOption(comp, targetSuma)}
                    className="btn btn-accent" 
                    style={{ padding: '0.65rem 1.75rem', fontWeight: 700, fontSize: '0.95rem' }}
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
