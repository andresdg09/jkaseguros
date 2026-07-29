"use client";

import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/ToastProvider';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function PerfilPage() {
  const { cliente, user, updateProfile, loading, isLoggedIn, hydrated } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const [form, setForm] = useState({
    primer_nombre: '', segundo_nombre: '', primer_apellido: '', segundo_apellido: '',
    nro_documento: '', fecha_nacimiento: '', genero: 'Masculino', estado_civil: 'Soltero',
    codigo_area: '0412', numero_celular: ''
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

  if (!hydrated || !isLoggedIn) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await updateProfile(form);
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
          <div className="form-group">
            <label className="form-label">Número Celular</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <select className="form-input" style={{ width: '100px' }} value={form.codigo_area} onChange={e => setForm({...form, codigo_area: e.target.value})}>
                <option value="0412">0412</option>
                <option value="0414">0414</option>
                <option value="0424">0424</option>
                <option value="0416">0416</option>
                <option value="0426">0426</option>
              </select>
              <input type="tel" className="form-input" value={form.numero_celular} onChange={e => setForm({...form, numero_celular: e.target.value})} required />
            </div>
          </div>
        </div>
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
