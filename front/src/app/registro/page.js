"use client";

import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/ToastProvider';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function RegistroPage() {
  const { register, loading, isLoggedIn, hydrated } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const [form, setForm] = useState({
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
  });
  const [contrasena, setContrasena] = useState('');

  useEffect(() => {
    if (hydrated && isLoggedIn) {
      router.push('/dashboard/cliente');
    }
  }, [hydrated, isLoggedIn, router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.correo !== form.confirmar_correo) {
      return showToast('Los correos electrónicos no coinciden.', 'error');
    }
    if (!contrasena) {
      return showToast('Debe introducir una contraseña para su cuenta.', 'error');
    }
    try {
      await register({ ...form, contrasena, rango: 'cliente' });
      showToast('Registro exitoso. ¡Bienvenido a JKA Consultores!');
      router.push('/dashboard/cliente');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  if (!hydrated) return null;

  return (
    <div className="card" style={{ maxWidth: '550px', margin: '3rem auto', padding: '2rem' }}>
      <h3 className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: 'none', marginBottom: '1rem' }}>
        <span>Crear tu Cuenta</span>
        <Link href="/" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem' }}>Volver</Link>
      </h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
        Complete sus datos personales para registrarse en JKA Consultores y poder cotizar seguros de salud.
      </p>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Fecha de nacimiento *</label>
            <input type="date" className="form-input" value={form.fecha_nacimiento} onChange={e => setForm({...form, fecha_nacimiento: e.target.value})} required />
          </div>
          <div className="form-group">
            <label className="form-label">Tipo de documento *</label>
            <select className="form-input" value={form.tipo_documento} onChange={e => setForm({...form, tipo_documento: e.target.value})}>
              <option value="Venezolano">Venezolano</option>
              <option value="Extranjero">Extranjero</option>
              <option value="Juridico">Jurídico</option>
              <option value="Pasaporte">Pasaporte</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Nro. Documento *</label>
            <input type="text" className="form-input" placeholder="Ej: 12345678" value={form.nro_documento} onChange={e => setForm({...form, nro_documento: e.target.value})} required />
          </div>
          <div className="form-group">
            <label className="form-label">Primer nombre *</label>
            <input type="text" className="form-input" value={form.primer_nombre} onChange={e => setForm({...form, primer_nombre: e.target.value})} required />
          </div>
          <div className="form-group">
            <label className="form-label">Segundo nombre</label>
            <input type="text" className="form-input" value={form.segundo_nombre} onChange={e => setForm({...form, segundo_nombre: e.target.value})} />
          </div>
          <div className="form-group">
            <label className="form-label">Primer apellido *</label>
            <input type="text" className="form-input" value={form.primer_apellido} onChange={e => setForm({...form, primer_apellido: e.target.value})} required />
          </div>
          <div className="form-group">
            <label className="form-label">Segundo apellido</label>
            <input type="text" className="form-input" value={form.segundo_apellido} onChange={e => setForm({...form, segundo_apellido: e.target.value})} />
          </div>
          <div className="form-group">
            <label className="form-label">Género *</label>
            <select className="form-input" value={form.genero} onChange={e => setForm({...form, genero: e.target.value})}>
              <option value="Masculino">Masculino</option>
              <option value="Femenino">Femenino</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Estado civil</label>
            <select className="form-input" value={form.estado_civil} onChange={e => setForm({...form, estado_civil: e.target.value})}>
              <option value="Soltero">Soltero/a</option>
              <option value="Casado">Casado/a</option>
              <option value="Divorciado">Divorciado/a</option>
              <option value="Viudo">Viudo/a</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Correo electrónico *</label>
            <input type="email" className="form-input" placeholder="ejemplo@correo.com" value={form.correo} onChange={e => setForm({...form, correo: e.target.value})} required />
          </div>
          <div className="form-group">
            <label className="form-label">Confirmar correo *</label>
            <input type="email" className="form-input" placeholder="ejemplo@correo.com" value={form.confirmar_correo} onChange={e => setForm({...form, confirmar_correo: e.target.value})} required />
          </div>
          <div className="form-group">
            <label className="form-label">Código de área *</label>
            <select className="form-input" value={form.codigo_area} onChange={e => setForm({...form, codigo_area: e.target.value})}>
              <option value="0412">0412</option>
              <option value="0414">0414</option>
              <option value="0424">0424</option>
              <option value="0416">0416</option>
              <option value="0426">0426</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Número celular *</label>
            <input type="tel" className="form-input" placeholder="1234567" value={form.numero_celular} onChange={e => setForm({...form, numero_celular: e.target.value})} required />
          </div>
          <div className="form-group">
            <label className="form-label">Contraseña de seguridad *</label>
            <input type="password" className="form-input" placeholder="Crear contraseña" value={contrasena} onChange={e => setContrasena(e.target.value)} required />
          </div>
        </div>
        <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1.5rem' }} disabled={loading}>
          {loading ? 'Creando cuenta...' : 'Registrar Cuenta'}
        </button>
      </form>
      <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
        ¿Ya tienes cuenta? <Link href="/login" style={{ color: 'var(--primary)', fontWeight: 600 }}>Inicia sesión aquí</Link>
      </p>
    </div>
  );
}
