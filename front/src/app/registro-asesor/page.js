"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/ToastProvider';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function RegistroAsesorPage() {
  const { login, hydrated, isLoggedIn } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();

  // --- PASOS ---
  // 'camera' | 'scanning' | 'form' | 'success'
  const [step, setStep] = useState('camera'); 
  const [tesseractReady, setTesseractReady] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);

  // --- DATOS DEL FORMULARIO ---
  const [form, setForm] = useState({
    nombre: '',
    cedula: '',
    correo: '',
    contrasena: '',
    telefono: '',
    banco: '',
    fecha_nacimiento: '',
    numero_cuenta: ''
  });

  const [accountParts, setAccountParts] = useState(['', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [cameraError, setCameraError] = useState(null);

  // --- REFS ---
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  // Redirección si ya está logueado
  useEffect(() => {
    if (hydrated && isLoggedIn) {
      router.push('/dashboard/asesor');
    }
  }, [hydrated, isLoggedIn, router]);

  // Cargar Tesseract desde un CDN de forma segura
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Verificar si ya existe
    if (window.Tesseract) {
      setTesseractReady(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/tesseract.js@v4.0.1/dist/tesseract.min.js';
    script.async = true;
    script.onload = () => {
      console.log('Tesseract.js cargado desde CDN con éxito');
      setTesseractReady(true);
    };
    script.onerror = () => {
      console.error('Error al cargar Tesseract.js desde CDN');
      showToast('No se pudo inicializar el escáner de ID. Puede registrarse manualmente.', 'warning');
    };
    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  // Iniciar cámara
  const startCamera = async () => {
    setCameraError(null);
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      let stream;
      try {
        // Intentar con configuraciones ideales de alta definición
        const constraints = {
          video: { 
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        console.warn('Fallo con constraints ideales, intentando fallback básico para iOS/Brave...', err);
        // Fallback básico sin especificar resolución (altamente compatible con Safari e iOS Brave)
        const fallbackConstraints = {
          video: { facingMode: 'environment' },
          audio: false
        };
        stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Error de acceso a cámara:', err);
      setCameraError('No se pudo acceder a la cámara trasera. Asegúrese de otorgar permisos de cámara a su navegador en Ajustes -> Safari/Brave -> Cámara -> Permitir.');
    }
  };

  // Detener cámara
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    if (step === 'camera') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [step]);

  // Capturar y procesar OCR
  const captureAndScan = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    setStep('scanning');
    setScanProgress(10);

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      // Dibujar cuadro exacto del viewfinder de la cámara en el lienzo canvas
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageSrc = canvas.toDataURL('image/jpeg', 0.9);
      setScanProgress(30);

      // Usar Tesseract local
      if (!window.Tesseract) {
        throw new Error('El motor de escaneo Tesseract no está listo. Ingrese los datos manualmente.');
      }

      const worker = await window.Tesseract.createWorker({
        logger: m => {
          if (m.status === 'recognizing text') {
            setScanProgress(Math.floor(40 + (m.progress * 50)));
          }
        }
      });

      await worker.loadLanguage('spa');
      await worker.initialize('spa');
      
      const { data: { text } } = await worker.recognize(imageSrc);
      await worker.terminate();
      
      setScanProgress(95);
      
      // Parsear Cédula Venezolana
      const parsed = parseDocText(text);
      
      setForm(prev => ({
        ...prev,
        nombre: parsed.nombre || prev.nombre,
        cedula: parsed.cedula || prev.cedula,
        fecha_nacimiento: parsed.fecha_nacimiento || prev.fecha_nacimiento
      }));

      showToast('Documento escaneado y procesado. Por favor valide la información.');
      setStep('form');
    } catch (err) {
      console.error(err);
      showToast('Error al escanear documento: ' + err.message + '. Introduzca sus datos manualmente.', 'error');
      setStep('form');
    }
  };

  // Parser regex de texto de cédula venezolana
  const parseDocText = (text) => {
    const lines = text.split('\n').map(l => l.trim().toUpperCase());
    console.log('Texto OCR obtenido:', lines);
    
    let cedula = '';
    let nombre = '';
    let apellido = '';
    let fecha_nacimiento = '';

    // Buscar Cédula
    const cedulaRegex = /(V|E|J|G)?[- ]?(\d{1,2})[\.\s]?(\d{3})[\.\s]?(\d{3})/i;
    for (const line of lines) {
      const match = line.match(cedulaRegex);
      if (match) {
        const letter = match[1] || 'V';
        cedula = `${letter}-${match[2]}${match[3]}${match[4]}`;
        break;
      }
    }

    // Buscar Fecha Nacimiento (DD/MM/AAAA) o (DD-MM-AAAA)
    const dateRegex = /(\d{2})[\/-](\d{2})[\/-](\d{4})/;
    for (const line of lines) {
      const match = line.match(dateRegex);
      if (match) {
        fecha_nacimiento = `${match[3]}-${match[2]}-${match[1]}`;
        break;
      }
    }

    // Nombres
    const nombresIdx = lines.findIndex(l => l.includes('NOMBRE'));
    if (nombresIdx !== -1) {
      const line = lines[nombresIdx];
      const match = line.match(/NOMBRE[S]?\s*[:\-\s]\s*(.+)/i);
      if (match && match[1].trim()) {
        nombre = match[1].trim();
      } else if (nombresIdx + 1 < lines.length) {
        nombre = lines[nombresIdx + 1].trim();
      }
    }

    // Apellidos
    const apellidosIdx = lines.findIndex(l => l.includes('APELLIDO'));
    if (apellidosIdx !== -1) {
      const line = lines[apellidosIdx];
      const match = line.match(/APELLIDO[S]?\s*[:\-\s]\s*(.+)/i);
      if (match && match[1].trim()) {
        apellido = match[1].trim();
      } else if (apellidosIdx + 1 < lines.length) {
        apellido = lines[apellidosIdx + 1].trim();
      }
    }

    // Limpiar caracteres no alfabéticos y formatear espacios
    const cleanNombre = `${nombre.replace(/[^A-Z ]/g, '')} ${apellido.replace(/[^A-Z ]/g, '')}`.replace(/\s+/g, ' ').trim();

    return {
      nombre: cleanNombre,
      cedula,
      fecha_nacimiento
    };
  };

  const handlePartChange = (index, value) => {
    const clean = value.replace(/\D/g, '').substring(0, 4);
    const newParts = [...accountParts];
    newParts[index] = clean;
    setAccountParts(newParts);
    setForm(prev => ({ ...prev, numero_cuenta: newParts.join('') }));

    // Auto-focus al siguiente input si se llenan los 4 dígitos
    if (clean.length === 4 && index < 4) {
      const nextInput = document.getElementById(`cta-part-${index + 1}`);
      if (nextInput) nextInput.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    // Si presiona borrar y está vacío, enfoca el input anterior
    if (e.key === 'Backspace' && !accountParts[index] && index > 0) {
      const prevInput = document.getElementById(`cta-part-${index - 1}`);
      if (prevInput) prevInput.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('Text').replace(/\D/g, '').substring(0, 20);
    if (pastedData.length > 0) {
      const newParts = ['', '', '', '', ''];
      for (let i = 0; i < 5; i++) {
        newParts[i] = pastedData.substring(i * 4, (i + 1) * 4);
      }
      setAccountParts(newParts);
      setForm(prev => ({ ...prev, numero_cuenta: newParts.join('') }));
      
      // Enfocar el último input rellenado
      const lastIndex = Math.min(Math.floor((pastedData.length - 1) / 4), 4);
      const targetInput = document.getElementById(`cta-part-${lastIndex >= 0 ? lastIndex : 0}`);
      if (targetInput) targetInput.focus();
    }
  };

  // Guardar Registro de Asesor
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (form.numero_cuenta.length !== 20) {
      return showToast('El número de cuenta bancaria debe tener exactamente 20 dígitos.', 'error');
    }

    setLoading(true);
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api';
      
      const res = await fetch(`${API_URL}/auth/register-asesor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Error al completar el registro.');

      // Login automático con los datos de cuenta
      if (data.token) {
        localStorage.setItem('jka_token', data.token);
        localStorage.setItem('jka_user', JSON.stringify(data.user));
        // Recargar contexto de auth
        window.location.href = '/dashboard/asesor';
      } else {
        setStep('success');
      }
    } catch (err) {
      console.error(err);
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!hydrated) return null;

  return (
    <div style={{ maxWidth: '600px', margin: '1rem auto', padding: '0.5rem' }}>
      <div className="card" style={{ padding: '1.5rem', boxShadow: 'var(--shadow-lg)', borderRadius: '12px' }}>
        
        {/* ENCABEZADO */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
          <div>
            <span className="badge badge-negociacion" style={{ textTransform: 'uppercase', marginBottom: '0.25rem', display: 'inline-block' }}>Afiliación de Asesores</span>
            <h3 style={{ margin: 0, fontWeight: 800, color: 'var(--primary)', fontSize: '1.5rem' }}>Registro Rápido</h3>
          </div>
          <Link href="/login" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}>
            Ir al Login
          </Link>
        </div>

        {/* PASO 1: ESCANEAR CÉDULA */}
        {step === 'camera' && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
              Active su cámara, encuadre su <strong>Cédula de Identidad</strong> en el recuadro y presione <strong>Escanear Cédula</strong> para auto-completar sus datos.
            </p>

            {cameraError ? (
              <div style={{
                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                border: '1.5px solid #ef4444',
                borderRadius: '12px',
                padding: '1.5rem',
                margin: '0 auto 1.5rem auto',
                maxWidth: '450px',
                textAlign: 'left'
              }}>
                <strong style={{ color: '#ef4444', display: 'block', marginBottom: '0.5rem', fontSize: '0.95rem' }}>
                  ⚠️ Acceso a Cámara Denegado o No Soportado
                </strong>
                <p style={{ fontSize: '0.8rem', color: '#991b1b', lineHeight: '1.4', marginBottom: '0.75rem' }}>
                  {cameraError}
                </p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                  <strong>Nota sobre Seguridad:</strong> Los navegadores modernos en dispositivos móviles bloquean el acceso a la cámara en entornos locales que no usen <strong>HTTPS</strong>. Al subir el sistema a <strong>Vercel (HTTPS)</strong>, la cámara funcionará automáticamente.
                </p>
              </div>
            ) : (
              <div style={{
                position: 'relative',
                width: '100%',
                maxWidth: '450px',
                height: '280px',
                backgroundColor: '#000',
                borderRadius: '12px',
                overflow: 'hidden',
                margin: '0 auto 1.5rem auto',
                border: '3px solid var(--primary)',
                boxShadow: 'var(--shadow)'
              }}>
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  muted
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                
                {/* Frame de ayuda para encuadre de la tarjeta */}
                <div style={{
                  position: 'absolute',
                  top: '10%',
                  left: '10%',
                  right: '10%',
                  bottom: '10%',
                  border: '2.5px dashed rgba(255, 255, 255, 0.7)',
                  borderRadius: '8px',
                  pointerEvents: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <span style={{
                    color: '#fff',
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    fontSize: '0.75rem',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px'
                  }}>
                    Coloque su Cédula aquí
                  </span>
                </div>
              </div>
            )}

            <canvas ref={canvasRef} style={{ display: 'none' }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {!cameraError ? (
                <button 
                  onClick={captureAndScan} 
                  className="btn btn-primary"
                  style={{ padding: '0.75rem', fontSize: '1rem', fontWeight: 'bold' }}
                  disabled={!tesseractReady}
                >
                  {tesseractReady ? '📸 Capturar y Escanear Cédula' : 'Cargando lector inteligente...'}
                </button>
              ) : (
                <button 
                  type="button" 
                  onClick={startCamera} 
                  className="btn btn-primary"
                  style={{ padding: '0.7rem' }}
                >
                  🔄 Reintentar Activar Cámara
                </button>
              )}
              
              <button 
                type="button" 
                onClick={() => setStep('form')} 
                className="btn btn-secondary"
                style={{ padding: '0.6rem' }}
              >
                Rellenar datos manualmente
              </button>
            </div>
          </div>
        )}

        {/* PASO 2: ESCANEANDO / OCR */}
        {step === 'scanning' && (
          <div style={{ textAlign: 'center', padding: '3rem 0' }}>
            <div className="spinner" style={{ margin: '0 auto 1.5rem auto' }} />
            <h4 style={{ color: 'var(--primary)', fontWeight: 'bold', marginBottom: '0.5rem' }}>Procesando Documento de Identidad</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Extrayendo nombre completo, cédula y fecha de nacimiento...
            </p>
            <div style={{
              width: '100%',
              backgroundColor: 'var(--secondary)',
              height: '8px',
              borderRadius: '4px',
              overflow: 'hidden',
              maxWidth: '300px',
              margin: '0 auto'
            }}>
              <div style={{
                backgroundColor: 'var(--primary)',
                height: '100%',
                width: `${scanProgress}%`,
                transition: 'width 0.3s ease'
              }} />
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.5rem' }}>
              Progreso: {scanProgress}%
            </span>
          </div>
        )}

        {/* PASO 3: FORMULARIO */}
        {step === 'form' && (
          <form onSubmit={handleSubmit}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
              Valide los datos escaneados e introduzca sus datos de contacto y de abono de comisiones.
            </p>

            <div className="form-grid">
              
              {/* DATOS GENERALES */}
              <div className="form-group col-span-2">
                <label className="form-label">Nombre Completo *</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={form.nombre} 
                  onChange={e => setForm({...form, nombre: e.target.value})} 
                  placeholder="Escriba su nombre completo"
                  autoComplete="off"
                  required 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Cédula de Identidad *</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={form.cedula} 
                  onChange={e => setForm({...form, cedula: e.target.value})} 
                  placeholder="V-00000000"
                  autoComplete="off"
                  required 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Fecha de Nacimiento *</label>
                <input 
                  type="date" 
                  className="form-input" 
                  value={form.fecha_nacimiento} 
                  onChange={e => setForm({...form, fecha_nacimiento: e.target.value})} 
                  autoComplete="off"
                  required 
                />
              </div>

              <div className="form-group col-span-2">
                <label className="form-label">Teléfono Celular *</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={form.telefono} 
                  onChange={e => setForm({...form, telefono: e.target.value})} 
                  placeholder="0400-0000000"
                  autoComplete="off"
                  required 
                />
              </div>

              {/* CREDENCIALES DE ACCESO */}
              <div className="form-group">
                <label className="form-label">Correo Electrónico *</label>
                <input 
                  type="email" 
                  className="form-input" 
                  value={form.correo} 
                  onChange={e => setForm({...form, correo: e.target.value})} 
                  placeholder="usuario@dominio.com"
                  autoComplete="off"
                  required 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Contraseña de Cuenta *</label>
                <input 
                  type="password" 
                  className="form-input" 
                  value={form.contrasena} 
                  onChange={e => setForm({...form, contrasena: e.target.value})} 
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required 
                />
              </div>

              {/* DATOS BANCARIOS */}
              <div className="form-group col-span-2" style={{ marginTop: '0.5rem' }}>
                <span style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: '0.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.2rem' }}>
                  Datos para Abono de Comisiones
                </span>
              </div>

              <div className="form-group col-span-2">
                <label className="form-label">Banco de Destino *</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={form.banco} 
                  onChange={e => setForm({...form, banco: e.target.value})} 
                  placeholder="Nombre de la Institución Bancaria"
                  autoComplete="off"
                  required 
                />
              </div>

              <div className="form-group col-span-2">
                <label className="form-label">Número de Cuenta Bancaria (Exactamente 20 dígitos) *</label>
                
                <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'nowrap', width: '100%', maxWidth: '400px', margin: '0.25rem 0' }}>
                  {accountParts.map((part, idx) => (
                    <React.Fragment key={idx}>
                      <input 
                        id={`cta-part-${idx}`}
                        type="text"
                        className="form-input text-center"
                        value={part}
                        onChange={e => handlePartChange(idx, e.target.value)}
                        onKeyDown={e => handleKeyDown(idx, e)}
                        onPaste={idx === 0 ? handlePaste : undefined}
                        maxLength="4"
                        placeholder="0000"
                        autoComplete="off"
                        style={{ flex: 1, minWidth: '40px', padding: '0.45rem', fontSize: '0.9rem', textAlign: 'center', fontFamily: 'monospace' }}
                        required
                      />
                      {idx < 4 && <span style={{ color: 'var(--text-muted)', fontWeight: 'bold' }}>-</span>}
                    </React.Fragment>
                  ))}
                </div>
                
                {/* AVISO / DISCLAIMER DE RESPONSABILIDAD */}
                <div style={{
                  backgroundColor: 'rgba(217, 119, 6, 0.08)',
                  border: '1.5px solid #d97706',
                  borderRadius: '8px',
                  padding: '0.75rem',
                  fontSize: '0.8rem',
                  color: '#92400e',
                  marginTop: '0.75rem',
                  lineHeight: '1.3'
                }}>
                  <strong>⚠️ Declaración de Responsabilidad:</strong> JKA Consultores no se hace responsable por comisiones transferidas incorrectamente debido a errores cometidos en el ingreso del número de cuenta. Asegúrese de que coincida exactamente con sus 20 dígitos.
                </div>
              </div>

            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button 
                type="button" 
                onClick={() => setStep('camera')} 
                className="btn btn-secondary"
                style={{ flex: 1 }}
              >
                Volver al escáner
              </button>
              <button 
                type="submit" 
                className="btn btn-primary" 
                style={{ flex: 2 }}
                disabled={loading || form.numero_cuenta.length !== 20}
              >
                {loading ? 'Registrando...' : 'Finalizar Registro'}
              </button>
            </div>
          </form>
        )}

        {/* PASO 4: REGISTRO EXITOSO */}
        {step === 'success' && (
          <div style={{ textAlign: 'center', padding: '2rem 0' }}>
            <span style={{ fontSize: '3rem' }}>⏰</span>
            <h4 style={{ color: 'var(--primary)', fontWeight: 'bold', margin: '1rem 0 0.5rem 0' }}>¡Solicitud Recibida!</h4>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '2rem' }}>
              Su solicitud de afiliación como asesor ha sido enviada con éxito. Para mantener la seguridad del portal, su cuenta se encuentra bajo revisión y debe ser aprobada por el administrador antes de poder acceder al sistema.
            </p>
            <Link href="/login" className="btn btn-primary">
              Volver al Inicio
            </Link>
          </div>
        )}

      </div>
    </div>
  );
}
