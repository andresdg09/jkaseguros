'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../contexts/AuthContext';
import { useToast } from '../../../components/ToastProvider';

function normalizeApiUrl(url) {
  if (!url) return '';
  const trimmed = url.replace(/\/+$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}
const API_URL = normalizeApiUrl(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api');

export default function ClientesAnaliticaPage() {
  const { token, isLoggedIn, user, hydrated } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState(null);
  const [activeCategory, setActiveCategory] = useState('vida'); // 'vida', 'salud', 'patrimonial', 'retiro'
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (hydrated && (!isLoggedIn || (user?.rango !== 'admin' && user?.rango !== 'asesor'))) {
      router.push('/login');
    }
  }, [hydrated, isLoggedIn, user, router]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/client-profiles/analytics/summary`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al cargar analítica');
      setAnalytics(data);
    } catch (err) {
      showToast(err.message || 'Error al conectar con el servidor', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchAnalytics();
  }, [token]);

  const getCleanPhone = (phone) => {
    if (!phone) return '';
    let clean = phone.replace(/[^0-9]/g, '');
    if (clean.startsWith('0')) clean = '58' + clean.slice(1);
    if (!clean.startsWith('58') && clean.length === 10) clean = '58' + clean;
    return clean;
  };

  if (!hydrated || loading) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="card" style={{ padding: '3rem', textAlign: 'center', maxWidth: '400px', width: '100%' }}>
          <div style={{
            width: '48px',
            height: '48px',
            border: '4px solid var(--primary)',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 1.5rem auto'
          }} />
          <h3 style={{ color: 'var(--primary)', fontWeight: 800, fontSize: '1.2rem', marginBottom: '0.5rem' }}>
            Analítica Inteligente 360
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Calculando scoring de venta cruzada y segmentación de cartera...
          </p>
        </div>
      </div>
    );
  }

  const conteos = analytics?.conteos || { vida: 0, salud: 0, patrimonial: 0, retiro: 0 };
  const oportunidadesRaw = analytics?.oportunidades?.[activeCategory] || [];
  const oportunidades = oportunidadesRaw.filter(op => 
    !searchTerm || 
    (op.nombre && op.nombre.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (op.telefono && op.telefono.includes(searchTerm))
  );
  const distribuciones = analytics?.distribuciones || {};

  const categoryConfig = {
    vida: {
      label: 'Seguro de Vida & Familia',
      icon: '👨‍👩‍👧',
      color: '#10b981',
      bgLight: '#ecfdf5',
      border: '#a7f3d0',
      tag: 'Protección Familiar'
    },
    salud: {
      label: 'Salud Integral & Colectivo',
      icon: '🏥',
      color: '#0284c7',
      bgLight: '#f0f9ff',
      border: '#bae6fd',
      tag: 'Salud & Viajes'
    },
    patrimonial: {
      label: 'Auto, Hogar & PYME',
      icon: '🚗',
      color: '#8b5cf6',
      bgLight: '#f5f3ff',
      border: '#ddd6fe',
      tag: 'Bienes & Negocios'
    },
    retiro: {
      label: 'Plan de Retiro & Ahorro',
      icon: '📈',
      color: '#f59e0b',
      bgLight: '#fffbeb',
      border: '#fde68a',
      tag: 'Ahorro a Futuro'
    }
  };

  const currentCat = categoryConfig[activeCategory] || categoryConfig.vida;

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem', fontFamily: 'var(--font-sans, system-ui)' }}>
      
      {/* HEADER PRINCIPAL */}
      <div style={{
        background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 50%, #2563eb 100%)',
        borderRadius: '20px',
        padding: '2rem 2.5rem',
        color: '#ffffff',
        marginBottom: '2rem',
        boxShadow: '0 10px 30px -5px rgba(30, 58, 138, 0.25)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.15)', padding: '0.35rem 0.85rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '0.75rem', backdropFilter: 'blur(4px)' }}>
              <span>🛡️ Módulo de Inteligencia de Cartera</span>
            </div>
            <h1 style={{ fontSize: '2.2rem', fontWeight: 800, margin: 0, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
              Analítica 360 & Oportunidades de Venta Cruzada
            </h1>
            <p style={{ color: '#dbeafe', fontSize: '0.95rem', marginTop: '0.5rem', maxWidth: '750px', lineHeight: 1.4 }}>
              Detección algorítmica de necesidades de aseguramiento basada en variables sociodemográficas, patrimoniales y familiares con generación automática de mensajes de contacto.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Link
              href={user?.rango === 'asesor' ? '/dashboard/asesor' : '/dashboard/admin'}
              className="btn"
              style={{ background: 'rgba(255,255,255,0.2)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.3)', backdropFilter: 'blur(4px)', fontWeight: 700 }}
            >
              ← Volver al Panel
            </Link>
            {user?.rango === 'admin' && (
              <Link
                href="/dashboard/admin/comisiones"
                className="btn"
                style={{ background: '#ffffff', color: '#1e3a8a', fontWeight: 800, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
              >
                💵 Matriz de Comisiones
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* KPI METRICS CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
        
        {/* Total Clientes */}
        <div className="card" style={{ padding: '1.5rem', borderTop: '4px solid #3b82f6', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Clientes Totales</span>
            <span style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>👥</span>
          </div>
          <div style={{ margin: '0.75rem 0' }}>
            <span style={{ fontSize: '2.5rem', fontWeight: 900, color: '#1e293b', lineHeight: 1 }}>{analytics?.totalClientes || 0}</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', borderTop: '1px solid #f1f5f9', paddingTop: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
            <span>Fichas 360 Completas:</span>
            <strong style={{ color: '#2563eb' }}>{analytics?.porcentajeCompletitud || 0}%</strong>
          </div>
        </div>

        {/* Oportunidades Vida */}
        <div 
          onClick={() => setActiveCategory('vida')}
          className="card" 
          style={{ 
            padding: '1.5rem', 
            borderTop: '4px solid #10b981', 
            cursor: 'pointer',
            backgroundColor: activeCategory === 'vida' ? '#f0fdf4' : '#ffffff',
            boxShadow: activeCategory === 'vida' ? '0 0 0 2px #10b981' : undefined,
            transition: 'all 0.2s ease'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#047857', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Potencial Vida</span>
            <span style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>👨‍👩‍👧</span>
          </div>
          <div style={{ margin: '0.75rem 0', display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
            <span style={{ fontSize: '2.5rem', fontWeight: 900, color: '#059669', lineHeight: 1 }}>{conteos.vida}</span>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#047857' }}>candidatos</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', borderTop: '1px solid #f1f5f9', paddingTop: '0.5rem' }}>
            Familias con dependientes y deudas
          </div>
        </div>

        {/* Oportunidades Salud */}
        <div 
          onClick={() => setActiveCategory('salud')}
          className="card" 
          style={{ 
            padding: '1.5rem', 
            borderTop: '4px solid #0284c7', 
            cursor: 'pointer',
            backgroundColor: activeCategory === 'salud' ? '#f0f9ff' : '#ffffff',
            boxShadow: activeCategory === 'salud' ? '0 0 0 2px #0284c7' : undefined,
            transition: 'all 0.2s ease'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Potencial Salud</span>
            <span style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#f0f9ff', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>🏥</span>
          </div>
          <div style={{ margin: '0.75rem 0', display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
            <span style={{ fontSize: '2.5rem', fontWeight: 900, color: '#0284c7', lineHeight: 1 }}>{conteos.salud}</span>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0369a1' }}>candidatos</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', borderTop: '1px solid #f1f5f9', paddingTop: '0.5rem' }}>
            Viajeros, ejecutivos e interés de salud
          </div>
        </div>

        {/* Oportunidades Patrimonial */}
        <div 
          onClick={() => setActiveCategory('patrimonial')}
          className="card" 
          style={{ 
            padding: '1.5rem', 
            borderTop: '4px solid #8b5cf6', 
            cursor: 'pointer',
            backgroundColor: activeCategory === 'patrimonial' ? '#f5f3ff' : '#ffffff',
            boxShadow: activeCategory === 'patrimonial' ? '0 0 0 2px #8b5cf6' : undefined,
            transition: 'all 0.2s ease'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6d28d9', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Auto / Patrimonial</span>
            <span style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#f5f3ff', color: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>🚗</span>
          </div>
          <div style={{ margin: '0.75rem 0', display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
            <span style={{ fontSize: '2.5rem', fontWeight: 900, color: '#7c3aed', lineHeight: 1 }}>{conteos.patrimonial}</span>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#6d28d9' }}>candidatos</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', borderTop: '1px solid #f1f5f9', paddingTop: '0.5rem' }}>
            Vehículos, inmuebles y comercios
          </div>
        </div>

      </div>

      {/* SECCIÓN DE GRÁFICOS Y DISTRIBUCIONES */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
        
        {/* Distribución por Edad */}
        <div className="card" style={{ padding: '1.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
            <span style={{ fontSize: '1.25rem' }}>🎂</span>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>Segmentación Etaria</h3>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Distribución de edad de asegurados</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            {Object.entries(distribuciones.gruposEdad || {}).map(([rango, cant]) => {
              const pct = analytics?.totalClientes > 0 ? Math.round((cant / analytics.totalClientes) * 100) : 0;
              return (
                <div key={rango}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '0.3rem' }}>
                    <span>{rango} años</span>
                    <span style={{ color: '#0284c7' }}>{cant} ({pct}%)</span>
                  </div>
                  <div style={{ width: '100%', height: '8px', backgroundColor: '#f1f5f9', borderRadius: '9999px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', backgroundColor: '#0284c7', borderRadius: '9999px', transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Nivel de Ingresos */}
        <div className="card" style={{ padding: '1.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
            <span style={{ fontSize: '1.25rem' }}>💼</span>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>Capacidad Patrimonial</h3>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Rango de ingresos estimados</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            {Object.entries(distribuciones.rangosIngresos || {}).map(([rango, cant]) => {
              const pct = analytics?.totalClientes > 0 ? Math.round((cant / analytics.totalClientes) * 100) : 0;
              return (
                <div key={rango}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '0.3rem' }}>
                    <span>{rango}</span>
                    <span style={{ color: '#10b981' }}>{cant} ({pct}%)</span>
                  </div>
                  <div style={{ width: '100%', height: '8px', backgroundColor: '#f1f5f9', borderRadius: '9999px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', backgroundColor: '#10b981', borderRadius: '9999px', transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Prioridades de Protección */}
        <div className="card" style={{ padding: '1.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
            <span style={{ fontSize: '1.25rem' }}>🎯</span>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>Interés de Cobertura</h3>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Prioridad manifestada por clientes</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            {Object.entries(distribuciones.intereses || {}).map(([interes, cant]) => {
              const pct = analytics?.totalClientes > 0 ? Math.round((cant / analytics.totalClientes) * 100) : 0;
              return (
                <div key={interes}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '0.3rem' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>{interes}</span>
                    <span style={{ color: '#8b5cf6' }}>{cant} ({pct}%)</span>
                  </div>
                  <div style={{ width: '100%', height: '8px', backgroundColor: '#f1f5f9', borderRadius: '9999px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', backgroundColor: '#8b5cf6', borderRadius: '9999px', transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* MATRIZ OPERATIVA DE CROSS-SELLING */}
      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        
        {/* Cabecera de la Tabla y Filtros */}
        <div style={{ padding: '1.75rem 2rem', borderBottom: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.5rem' }}>{currentCat.icon}</span>
                <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  Cola Prioritaria: {currentCat.label}
                </h2>
              </div>
              <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                Clientes con más del 65% de afinidad calculada para esta categoría.
              </p>
            </div>

            {/* Buscador Rápido */}
            <input
              type="text"
              placeholder="🔍 Filtrar por nombre o teléfono..."
              className="form-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ maxWidth: '320px', margin: 0, padding: '0.55rem 1rem', fontSize: '0.875rem' }}
            />
          </div>

          {/* Selector de Pestañas con Colores Vivos */}
          <div style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
            {Object.entries(categoryConfig).map(([catKey, cat]) => {
              const isSelected = activeCategory === catKey;
              return (
                <button
                  key={catKey}
                  onClick={() => setActiveCategory(catKey)}
                  style={{
                    padding: '0.6rem 1.1rem',
                    borderRadius: '12px',
                    fontWeight: 800,
                    fontSize: '0.85rem',
                    border: isSelected ? `2px solid ${cat.color}` : '1px solid #e2e8f0',
                    backgroundColor: isSelected ? cat.bgLight : '#ffffff',
                    color: isSelected ? cat.color : '#64748b',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.2s'
                  }}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.label}</span>
                  <span style={{
                    backgroundColor: isSelected ? cat.color : '#e2e8f0',
                    color: isSelected ? '#ffffff' : '#64748b',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    fontWeight: 900
                  }}>
                    {conteos[catKey] || 0}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tabla Responsiva de Oportunidades */}
        {oportunidades.length === 0 ? (
          <div style={{ padding: '4rem 2rem', textAlign: 'center', color: '#94a3b8' }}>
            <span style={{ fontSize: '3rem', display: 'block', marginBottom: '0.75rem' }}>🔍</span>
            <h4 style={{ fontWeight: 800, color: '#334155', fontSize: '1.1rem', marginBottom: '0.25rem' }}>
              No se encontraron prospectos calificados en esta categoría
            </h4>
            <p style={{ fontSize: '0.85rem', maxWidth: '450px', margin: '0 auto' }}>
              Completa las fichas 360 de tus clientes en el panel de asesor para alimentar el motor analítico de venta cruzada.
            </p>
          </div>
        ) : (
          <div className="table-container" style={{ margin: 0, borderRadius: 0, border: 'none' }}>
            <table className="table" style={{ width: '100%' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ padding: '1rem 1.5rem', color: '#475569', fontWeight: 800, fontSize: '0.75rem', textTransform: 'uppercase' }}>Cliente Asegurado</th>
                  <th style={{ padding: '1rem 1.5rem', color: '#475569', fontWeight: 800, fontSize: '0.75rem', textTransform: 'uppercase' }}>Score Afinidad</th>
                  <th style={{ padding: '1rem 1.5rem', color: '#475569', fontWeight: 800, fontSize: '0.75rem', textTransform: 'uppercase' }}>Pitch Sugerido (WhatsApp)</th>
                  <th style={{ padding: '1rem 1.5rem', color: '#475569', fontWeight: 800, fontSize: '0.75rem', textTransform: 'uppercase', textAlign: 'right' }}>Acción Directa</th>
                </tr>
              </thead>
              <tbody>
                {oportunidades.map((op, idx) => {
                  const cleanPhone = getCleanPhone(op.telefono);
                  const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(op.mensajeWhatsApp || '')}`;
                  const initials = (op.nombre || 'C').split(' ').map(n => n[0]).join('').slice(0, 2);

                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}>
                      
                      {/* Cliente */}
                      <td style={{ padding: '1.25rem 1.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                          <div style={{
                            width: '42px',
                            height: '42px',
                            borderRadius: '12px',
                            background: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)',
                            color: '#ffffff',
                            fontWeight: 900,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.85rem',
                            flexShrink: 0
                          }}>
                            {initials}
                          </div>
                          <div>
                            <strong style={{ color: '#0f172a', fontSize: '0.95rem', display: 'block' }}>
                              {op.nombre}
                            </strong>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                              {op.edad} años • {op.telefono}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Score */}
                      <td style={{ padding: '1.25rem 1.5rem' }}>
                        <div style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          background: currentCat.bgLight,
                          color: currentCat.color,
                          border: `1px solid ${currentCat.border}`,
                          padding: '0.35rem 0.75rem',
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: 800
                        }}>
                          <span>🔥</span>
                          <span>{op.score}% Match</span>
                        </div>
                      </td>

                      {/* Pitch sugerido */}
                      <td style={{ padding: '1.25rem 1.5rem', maxWidth: '420px' }}>
                        <div style={{
                          background: '#f8fafc',
                          padding: '0.65rem 0.85rem',
                          borderRadius: '10px',
                          border: '1px solid #e2e8f0',
                          fontSize: '0.8rem',
                          color: '#475569',
                          fontStyle: 'italic',
                          lineHeight: 1.4
                        }}>
                          "{op.mensajeWhatsApp}"
                        </div>
                      </td>

                      {/* Botón Acción */}
                      <td style={{ padding: '1.25rem 1.5rem', textAlign: 'right' }}>
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            background: '#10b981',
                            color: '#ffffff',
                            padding: '0.6rem 1.1rem',
                            borderRadius: '10px',
                            fontWeight: 800,
                            fontSize: '0.8rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            textDecoration: 'none',
                            boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
                            transition: 'all 0.2s ease',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          <span>💬 Contactar WhatsApp</span>
                        </a>
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      </div>

    </div>
  );
}
