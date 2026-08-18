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
    banco: 'Banco Nacional de Crédito (BNC)',
    fecha_nacimiento: '',
    numero_cuenta: ''
  });

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

      const constraints = {
        video: { 
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Error de acceso a cámara:', err);
      setCameraError('No se pudo acceder a la cámara trasera. Asegúrese de otorgar permisos.');
      setStep('form'); // Fallback inmediato a formulario manual
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
        // Formato YYYY-MM-DD para input date
        fecha_nacimiento = `${match[3]}-${match[2]}-${match[1]}`;
        break;
      }
    }

    // Nombres y Apellidos
    const nombresIdx = lines.findIndex(l => l.includes('NOMBRE') || l.includes('NOMBRES'));
    const apellidosIdx = lines.findIndex(l => l.includes('APELLIDO') || l.includes('APELLIDOS'));
    
    if (nombresIdx !== -1 && nombresIdx + 1 < lines.length) {
      nombre = lines[nombresIdx + 1].replace(/[^A-Z ]/g, '').trim();
    }
    if (apellidosIdx !== -1 && apellidosIdx + 1 < lines.length) {
      apellido = lines[apellidosIdx + 1].replace(/[^A-Z ]/g, '').trim();
    }

    const cleanNombre = `${nombre} ${apellido}`.trim();

    return {
      nombre: cleanNombre,
      cedula,
      fecha_nacimiento
    };
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
    <div style={{ maxWidth: '600px', margin: '2rem auto', padding: '1rem' }}>
      <div className="card" style={{ padding: '2rem', boxShadow: 'var(--shadow-lg)' }}>
        
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

            <canvas ref={canvasRef} style={{ display: 'none' }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button 
                onClick={captureAndScan} 
                className="btn btn-primary"
                style={{ padding: '0.75rem', fontSize: '1rem', fontWeight: 'bold' }}
                disabled={!tesseractReady}
              >
                {tesseractReady ? '📸 Capturar y Escanear Cédula' : 'Cargando lector inteligente...'}
              </button>
              
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
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Nombre Completo *</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={form.nombre} 
                  onChange={e => setForm({...form, nombre: e.target.value})} 
                  placeholder="Escanee su cédula o escríbalo aquí"
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
                  placeholder="V-12345678"
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
                  required 
                />
              </div>

              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Teléfono Celular *</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={form.telefono} 
                  onChange={e => setForm({...form, telefono: e.target.value})} 
                  placeholder="Ej: 0412-1234567"
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
                  placeholder="correo@asesor.com"
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
                  placeholder="Mínimo 8 caracteres"
                  required 
                />
              </div>

              {/* DATOS BANCARIOS */}
              <div className="form-group" style={{ gridColumn: 'span 2', marginTop: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: '0.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.2rem' }}>
                  Datos para Abono de Comisiones
                </span>
              </div>

              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Banco de Destino *</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={form.banco} 
                  onChange={e => setForm({...form, banco: e.target.value})} 
                  placeholder="Ej: Banco Nacional de Crédito (BNC), Banesco"
                  required 
                />
              </div>

              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Número de Cuenta Bancaria (Exactamente 20 dígitos) *</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={form.numero_cuenta} 
                  onChange={e => setForm({...form, numero_cuenta: e.target.value.replace(/\D/g, '').substring(0, 20)})} 
                  placeholder="0191..."
                  maxLength="20"
                  required 
                />
                
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
            <span style={{ fontSize: '3rem' }}>✅</span>
            <h4 style={{ color: 'var(--primary)', fontWeight: 'bold', margin: '1rem 0 0.5rem 0' }}>¡Registro Completado con éxito!</h4>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '2rem' }}>
              Su cuenta de asesor ha sido afiliada correctamente. Ahora puede iniciar sesión.
            </p>
            <Link href="/login" className="btn btn-primary">
              Iniciar Sesión en el Portal
            </Link>
          </div>
        )}

      </div>
    </div>
  );
}
