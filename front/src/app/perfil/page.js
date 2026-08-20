"use client";

import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/ToastProvider';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const bancosVzla = [
  { nombre: "Banco de Venezuela", codigo: "0102" },
  { nombre: "Venezolano de Crédito", codigo: "0104" },
  { nombre: "Banco Mercantil", codigo: "0105" },
  { nombre: "BBVA Provincial", codigo: "0108" },
  { nombre: "Bancaribe", codigo: "0114" },
  { nombre: "Banco Exterior", codigo: "0115" },
  { nombre: "Banco Caroní", codigo: "0128" },
  { nombre: "Banesco", codigo: "0134" },
  { nombre: "Banco Plaza", codigo: "0138" },
  { nombre: "100% Banco", codigo: "0156" },
  { nombre: "Banco del Tesoro", codigo: "0163" },
  { nombre: "Banco Agrícola de Venezuela", codigo: "0166" },
  { nombre: "Bancrecer", codigo: "0168" },
  { nombre: "Banco Activo", codigo: "0171" },
  { nombre: "Bancamiga", codigo: "0172" },
  { nombre: "Banplus", codigo: "0174" },
  { nombre: "Banco Bicentenario", codigo: "0175" },
  { nombre: "Banco de la Fuerza Armada Nacional Bolivariana (BANFANB)", codigo: "0177" },
  { nombre: "Banco Nacional de Crédito (BNC)", codigo: "0191" }
];

export default function PerfilPage() {
  const { cliente, asesor, user, updateProfile, loading, isLoggedIn, hydrated } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  
  const [form, setForm] = useState({
    primer_nombre: '', segundo_nombre: '', primer_apellido: '', segundo_apellido: '',
    nro_documento: '', fecha_nacimiento: '', genero: 'Masculino', estado_civil: 'Soltero',
    codigo_area: '0412', numero_celular: ''
  });

  const [asesorForm, setAsesorForm] = useState({
    nombre: '',
    telefono: '',
    cedula: '',
    banco: 'BNC',
    numero_cuenta: '',
    fecha_nacimiento: ''
  });

  useEffect(() => {
    if (hydrated && !isLoggedIn) {
      router.push('/login');
    }
  }, [hydrated, isLoggedIn, router]);

  useEffect(() => {
    if (cliente) {
      setForm({
        primer_nombre: cliente.primer_nombre || '',
        segundo_nombre: cliente.segundo_nombre || '',
        primer_apellido: cliente.primer_apellido || '',
        segundo_apellido: cliente.segundo_apellido || '',
        nro_documento: cliente.nro_documento || '',
        fecha_nacimiento: cliente.fecha_nacimiento ? cliente.fecha_nacimiento.split('T')[0] : '',
        genero: cliente.genero || 'Masculino',
        estado_civil: cliente.estado_civil || 'Soltero',
        codigo_area: cliente.codigo_area || '0412',
        numero_celular: cliente.numero_celular || ''
      });
    }
  }, [cliente]);

  useEffect(() => {
    if (asesor) {
      setAsesorForm({
        nombre: asesor.nombre || '',
        telefono: asesor.telefono || '',
        cedula: asesor.cedula || '',
        banco: asesor.banco || 'BNC',
        numero_cuenta: asesor.numero_cuenta || '',
        fecha_nacimiento: asesor.fecha_nacimiento ? asesor.fecha_nacimiento.split('T')[0] : ''
      });
    }
  }, [asesor]);

  const handleAsesorBankChange = (bankName) => {
    setAsesorForm(prev => {
      const updated = { ...prev, banco: bankName };
      const selectedBank = bancosVzla.find(b => b.nombre === bankName);
      if (selectedBank) {
        const code = selectedBank.codigo;
        if (!prev.numero_cuenta || prev.numero_cuenta.length < 4 || bancosVzla.some(b => b.codigo === prev.numero_cuenta.substring(0, 4))) {
          updated.numero_cuenta = code + prev.numero_cuenta.substring(4);
        }
      }
      return updated;
    });
  };

  const handleAsesorAccountChange = (val) => {
    const clean = val.replace(/\D/g, '').substring(0, 20);
    setAsesorForm(prev => {
      const updated = { ...prev, numero_cuenta: clean };
      if (clean.length >= 4) {
        const first4 = clean.substring(0, 4);
        const detected = bancosVzla.find(b => b.codigo === first4);
        if (detected) {
          updated.banco = detected.nombre;
        }
      }
      return updated;
    });
  };

  if (!hydrated || !isLoggedIn) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (user?.rango === 'asesor') {
        const cleanCta = asesorForm.numero_cuenta.replace(/\D/g, '');
        if (cleanCta.length !== 20) {
          return showToast('El número de cuenta bancaria debe tener exactamente 20 dígitos.', 'error');
        }
        await updateProfile({
          ...asesorForm,
          numero_cuenta: cleanCta
        });
      } else {
        await updateProfile(form);
      }
      showToast('Datos de perfil actualizados correctamente.');
      
      // Redirigir según rango
      if (user.rango === 'admin') {
        router.push('/dashboard/admin');
      } else if (user.rango === 'asesor') {
        router.push('/dashboard/asesor');
      } else {
        router.push('/dashboard/cliente');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const getProfileTitle = () => {
    if (user?.rango === 'admin') return 'Mi Perfil de Administrador';
    if (user?.rango === 'asesor') return 'Mi Perfil de Asesor';
    return 'Mi Perfil de Asegurado';
  };

  const getCancelLink = () => {
    if (user?.rango === 'admin') return '/dashboard/admin';
    if (user?.rango === 'asesor') return '/dashboard/asesor';
    return '/dashboard/cliente';
  };

  return (
    <div className="card" style={{ maxWidth: '650px', margin: '2rem auto', padding: '2rem' }}>
      <h3 className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: 'none', marginBottom: '1.5rem' }}>
        <span>{getProfileTitle()}</span>
        <Link href={getCancelLink()} className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem' }}>Volver</Link>
      </h3>
      
      <form onSubmit={handleSubmit}>
        {/* Banner informativo de cuenta */}
        <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: 'var(--secondary)', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '0.9rem' }}>
          <p style={{ margin: '0 0 0.5rem 0' }}><strong>ℹ️ Información del Usuario:</strong></p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', color: 'var(--text-muted)' }}>
            <span><strong>Correo de Ingreso:</strong> {user?.correo}</span>
            <span><strong>Rol:</strong> {user?.rango?.toUpperCase()}</span>
            <span>
              <strong>Fecha de Registro:</strong> {
                asesor?.created_at 
                  ? new Date(asesor.created_at).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) 
                  : user?.created_at
                    ? new Date(user.created_at).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : 'N/A'
              }
            </span>
            {asesor?.codigo_asesor && <span><strong>Código de Asesor:</strong> {asesor.codigo_asesor}</span>}
          </div>
        </div>

        {user?.rango === 'asesor' ? (
          /* --- FORMULARIO PARA ASESORES --- */
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Nombre Completo *</label>
              <input 
                type="text" 
                className="form-input" 
                value={asesorForm.nombre} 
                onChange={e => setAsesorForm({...asesorForm, nombre: e.target.value})} 
                required 
              />
            </div>
            <div className="form-group">
              <label className="form-label">Cédula de Identidad *</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="Ej: V12345678"
                value={asesorForm.cedula} 
                onChange={e => setAsesorForm({...asesorForm, cedula: e.target.value})} 
                required 
              />
            </div>
            <div className="form-group">
              <label className="form-label">Teléfono de Contacto *</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="Ej: 0412-1234567"
                value={asesorForm.telefono} 
                onChange={e => setAsesorForm({...asesorForm, telefono: e.target.value})} 
                required 
              />
            </div>
            <div className="form-group">
              <label className="form-label">Fecha de Nacimiento *</label>
              <input 
                type="date" 
                className="form-input" 
                value={asesorForm.fecha_nacimiento} 
                onChange={e => setAsesorForm({...asesorForm, fecha_nacimiento: e.target.value})} 
                required 
              />
            </div>
            <div className="form-group">
              <label className="form-label">Banco *</label>
              <select 
                className="form-input" 
                value={asesorForm.banco} 
                onChange={e => handleAsesorBankChange(e.target.value)}
              >
                <option value="">-- Seleccione un Banco --</option>
                {bancosVzla.map((b, idx) => (
                  <option key={idx} value={b.nombre}>{b.nombre}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">Número de Cuenta Bancaria (20 dígitos) *</label>
              <input 
                type="text" 
                className="form-input" 
                maxLength="20"
                placeholder="0191..."
                value={asesorForm.numero_cuenta} 
                onChange={e => handleAsesorAccountChange(e.target.value)} 
                required 
              />
              <small style={{ color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                Longitud actual: {asesorForm.numero_cuenta.length}/20 dígitos.
              </small>
            </div>
          </div>
        ) : (
          /* --- FORMULARIO PARA CLIENTES / ADMINISTRADORES --- */
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Primer Nombre</label>
              <input type="text" className="form-input" value={form.primer_nombre} onChange={e => setForm({...form, primer_nombre: e.target.value})} required />
            </div>
            <div className="form-group">
              <label className="form-label">Segundo Nombre</label>
              <input type="text" className="form-input" value={form.segundo_nombre} onChange={e => setForm({...form, segundo_nombre: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">Primer Apellido</label>
              <input type="text" className="form-input" value={form.primer_apellido} onChange={e => setForm({...form, primer_apellido: e.target.value})} required />
            </div>
            <div className="form-group">
              <label className="form-label">Segundo Apellido</label>
              <input type="text" className="form-input" value={form.segundo_apellido} onChange={e => setForm({...form, segundo_apellido: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">Nro. Documento</label>
              <input type="text" className="form-input" value={form.nro_documento} onChange={e => setForm({...form, nro_documento: e.target.value})} required />
            </div>
            <div className="form-group">
              <label className="form-label">Fecha Nacimiento</label>
              <input type="date" className="form-input" value={form.fecha_nacimiento} onChange={e => setForm({...form, fecha_nacimiento: e.target.value})} required />
            </div>
            <div className="form-group">
              <label className="form-label">Género</label>
              <select className="form-input" value={form.genero} onChange={e => setForm({...form, genero: e.target.value})}>
                <option value="Masculino">Masculino</option>
                <option value="Femenino">Femenino</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Estado Civil</label>
              <select className="form-input" value={form.estado_civil} onChange={e => setForm({...form, estado_civil: e.target.value})}>
                <option value="Soltero">Soltero/a</option>
                <option value="Casado">Casado/a</option>
                <option value="Divorciado">Divorciado/a</option>
                <option value="Viudo">Viudo/a</option>
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">Número Celular</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <select className="form-input" style={{ width: '100px' }} value={form.codigo_area} onChange={e => setForm({...form, codigo_area: e.target.value})}>
                  <option value="0412">0412</option>
                  <option value="0414">0414</option>
                  <option value="0424">0424</option>
                  <option value="0416">0416</option>
                  <option value="0426">0426</option>
                </select>
                <input type="tel" className="form-input" value={form.numero_celular} onChange={e => setForm({...form, numero_celular: e.target.value})} required style={{ flex: 1 }} />
              </div>
            </div>
          </div>
        )}

        <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
          <Link href={getCancelLink()} className="btn btn-secondary">Cancelar</Link>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Guardando...' : 'Guardar Cambios'}
          </button>
        </div>
      </form>
    </div>
  );
}
