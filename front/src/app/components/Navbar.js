"use client";

import React from 'react';
import Link from 'next/link';
import { useAuth } from '../contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation';

export default function Navbar() {
  const { user, isLoggedIn, logout, hydrated } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const handleLogoutClick = () => {
    logout();
    router.push('/');
  };

  return (
    <nav className="navbar">
      <Link href="/" className="nav-brand">
        JKA <span>Seguros</span>
      </Link>
      <div className="nav-actions">
        <Link href="/" className={`btn btn-secondary ${pathname === '/' ? 'active' : ''}`}>
          Cotizador
        </Link>
        {hydrated && isLoggedIn ? (
          <>
            {user?.rango === 'admin' && (
              <Link href="/dashboard/admin" className={`btn btn-secondary ${pathname.startsWith('/dashboard/admin') ? 'active' : ''}`}>
                Panel Admin
              </Link>
            )}
            {user?.rango === 'asesor' && (
              <Link href="/dashboard/asesor" className={`btn btn-secondary ${pathname.startsWith('/dashboard/asesor') ? 'active' : ''}`}>
                Panel Asesor
              </Link>
            )}
            {user?.rango === 'cliente' && (
              <Link href="/dashboard/cliente" className={`btn btn-secondary ${pathname.startsWith('/dashboard/cliente') ? 'active' : ''}`}>
                Mis Seguros
              </Link>
            )}
            <Link href="/perfil" className={`btn btn-secondary ${pathname === '/perfil' ? 'active' : ''}`}>
              Mi Perfil
            </Link>
            <button 
              onClick={handleLogoutClick} 
              className="btn" 
              style={{ background: 'var(--text-muted)', color: '#fff', cursor: 'pointer' }}
            >
              Cerrar Sesión
            </button>
          </>
        ) : (
          hydrated && (
            <>
              <Link href="/login" className="btn btn-secondary">
                Iniciar Sesión
              </Link>
              <Link href="/registro" className="btn btn-primary">
                Registrarse
              </Link>
            </>
          )
        )}
      </div>
    </nav>
  );
}
