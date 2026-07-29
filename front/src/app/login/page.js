"use client";

import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/ToastProvider';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const { login, loading, isLoggedIn, user, hydrated } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const [loginForm, setLoginForm] = useState({ correo: '', contrasena: '' });

  // Redirigir si ya está logueado
  useEffect(() => {
    if (hydrated && isLoggedIn && user) {
      if (user.rango === 'admin') {
        router.push('/dashboard/admin');
      } else if (user.rango === 'asesor') {
        router.push('/dashboard/asesor');
      } else {
        router.push('/dashboard/cliente');
      }
    }
  }, [hydrated, isLoggedIn, user, router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!loginForm.correo || !loginForm.contrasena) {
      return showToast('Por favor, introduce correo y contraseña.', 'error');
    }
    try {
      const data = await login(loginForm.correo, loginForm.contrasena);
      showToast(`¡Bienvenido de nuevo, ${data.cliente ? data.cliente.primer_nombre : data.user.correo}!`);
      
      // La redirección será manejada por el useEffect, pero forzamos aquí si es necesario
      if (data.user.rango === 'admin') {
        router.push('/dashboard/admin');
      } else if (data.user.rango === 'asesor') {
        router.push('/dashboard/asesor');
      } else {
        router.push('/dashboard/cliente');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  if (!hydrated) return null;

  return (
    <div className="card" style={{ maxWidth: '450px', margin: '3rem auto', padding: '2rem' }}>
      <h3 className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: 'none', marginBottom: '1.5rem' }}>
        <span>Iniciar Sesión</span>
        <Link href="/" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem' }}>Volver</Link>
      </h3>
      <form onSubmit={handleSubmit}>
        <div className="form-group" style={{ marginBottom: '1rem' }}>
          <label className="form-label">Correo Electrónico</label>
          <input 
            type="email" 
            className="form-input" 
            placeholder="correo@ejemplo.com"
            value={loginForm.correo}
            onChange={e => setLoginForm({...loginForm, correo: e.target.value})}
            required
          />
        </div>
        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
          <label className="form-label">Contraseña</label>
          <input 
            type="password" 
            className="form-input" 
            placeholder="••••••••"
            value={loginForm.contrasena}
            onChange={e => setLoginForm({...loginForm, contrasena: e.target.value})}
            required
          />
        </div>
        <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
          {loading ? 'Validando...' : 'Entrar'}
        </button>
      </form>
      <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
        ¿No tienes cuenta? <Link href="/registro" style={{ color: 'var(--primary)', fontWeight: 600 }}>Regístrate aquí</Link>
      </p>
    </div>
  );
}
