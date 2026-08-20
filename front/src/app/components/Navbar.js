"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation';

export default function Navbar() {
  const { user, isLoggedIn, logout, hydrated } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const handleLogoutClick = () => {
    logout();
    setIsOpen(false);
    router.push('/');
  };

  const handleLinkClick = () => {
    setIsOpen(false);
  };

  return (
    <nav className="navbar">
      <Link href="/" className="nav-brand" onClick={handleLinkClick} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', textDecoration: 'none' }}>
        <div style={{ 
          background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)', 
          color: '#ffffff', 
          width: '36px', 
          height: '36px', 
          borderRadius: '10px', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          fontSize: '1.2rem',
          boxShadow: '0 4px 10px rgba(37,99,235,0.25)',
          flexShrink: 0
        }}>
          🛡️
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
          <span style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--primary)', letterSpacing: '-0.3px' }}>
            Protección & Seguros
          </span>
          <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#2563eb', letterSpacing: '2px', textTransform: 'uppercase' }}>
            360
          </span>
        </div>
      </Link>
      
      {/* Botón de Hamburguesa para Móvil */}
      <button 
        className="hamburger-btn" 
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle menu"
        style={{
          background: 'none',
          border: 'none',
          fontSize: '1.75rem',
          color: 'var(--primary)',
          cursor: 'pointer',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0.25rem',
          transition: 'var(--transition)'
        }}
      >
        {isOpen ? '✕' : '☰'}
      </button>

      <div className={`nav-actions ${isOpen ? 'open' : ''}`}>
        <Link 
          href="/" 
          onClick={handleLinkClick}
          className={`btn btn-secondary ${pathname === '/' ? 'active' : ''}`}
        >
          Cotizador
        </Link>
        {hydrated && isLoggedIn ? (
          <>
            {user?.rango === 'admin' && (
              <Link 
                href="/dashboard/admin" 
                onClick={handleLinkClick}
                className={`btn btn-secondary ${pathname.startsWith('/dashboard/admin') ? 'active' : ''}`}
              >
                Panel Admin
              </Link>
            )}
            {user?.rango === 'asesor' && (
              <Link 
                href="/dashboard/asesor" 
                onClick={handleLinkClick}
                className={`btn btn-secondary ${pathname.startsWith('/dashboard/asesor') ? 'active' : ''}`}
              >
                Panel Asesor
              </Link>
            )}
            {user?.rango === 'cliente' && (
              <Link 
                href="/dashboard/cliente" 
                onClick={handleLinkClick}
                className={`btn btn-secondary ${pathname.startsWith('/dashboard/cliente') ? 'active' : ''}`}
              >
                Mis Seguros
              </Link>
            )}
            <Link 
              href="/perfil" 
              onClick={handleLinkClick}
              className={`btn btn-secondary ${pathname === '/perfil' ? 'active' : ''}`}
            >
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
              <Link href="/login" onClick={handleLinkClick} className="btn btn-secondary">
                Iniciar Sesión
              </Link>
              <Link href="/registro" onClick={handleLinkClick} className="btn btn-primary">
                Registrarse
              </Link>
            </>
          )
        )}
      </div>
    </nav>
  );
}
