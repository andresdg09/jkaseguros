"use client";

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useToast } from '../../../components/ToastProvider';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

function normalizeApiUrl(url) {
  const trimmed = url.replace(/\/+$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}
const API_URL = normalizeApiUrl(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api');

export default function ComisionesPage() {
  const { token, isLoggedIn, user, hydrated } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();

  // --- ESTADOS DE DATOS ---
  const [companias, setCompanias] = useState([]);
  const [asesores, setAsesores] = useState([]);
  const [comisionesAsesores, setComisionesAsesores] = useState([]);
  const [polizas, setPolizas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // --- ESTADOS DE EDICIÓN / FORMULARIOS ---
  const [activeTab, setActiveTab] = useState('polizas'); // 'polizas', 'estandar', 'personalizado'
  const [standardEdits, setStandardEdits] = useState({}); // { [companiaId]: percentage }
  
  // Formulario de comisión por asesor y aseguradora
  const [advisorForm, setAdvisorForm] = useState({
    asesor_id: '',
    compania_id: '',
    porcentaje: ''
  });

  // Edición rápida de comisión de póliza
  const [editingPolicyId, setEditingPolicyId] = useState(null);
  const [editingPolicyVal, setEditingPolicyVal] = useState('');

  // Redirección si no es admin
  useEffect(() => {
    if (hydrated) {
      if (!isLoggedIn) {
        router.push('/login');
      } else if (user?.rango !== 'admin') {
        showToast('Acceso no autorizado. Solo para administradores.', 'error');
        router.push('/');
      }
    }
  }, [hydrated, isLoggedIn, user, router]);

  const loadData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/commissions`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al cargar comisiones');

      setCompanias(data.companias || []);
      setAsesores(data.asesores || []);
      setComisionesAsesores(data.comisiones_asesores || []);
      setPolizas(data.polizas || []);

      // Inicializar el estado de edición estándar
      const edits = {};
      (data.companias || []).forEach(c => {
        edits[c.id] = {
          comision_compania: c.comision_compania !== undefined ? c.comision_compania : 0,
          comision_asesor_estandar: c.comision_asesor_estandar !== undefined ? c.comision_asesor_estandar : 0
        };
      });
      setStandardEdits(edits);

    } catch (err) {
      console.error(err);
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (hydrated && isLoggedIn && user?.rango === 'admin') {
      loadData();
    }
  }, [hydrated, isLoggedIn, user]);

  // Guardar comisión estándar
  const handleSaveStandard = async (companiaId) => {
    const edit = standardEdits[companiaId];
    if (!edit || edit.comision_compania === '' || edit.comision_asesor_estandar === '') {
      return showToast('Los porcentajes no pueden estar vacíos.', 'error');
    }
    
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/admin/commissions/standard`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          compania_id: parseInt(companiaId),
          comision_compania: parseFloat(edit.comision_compania),
          comision_asesor_estandar: parseFloat(edit.comision_asesor_estandar)
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar');

      showToast('Porcentajes estándares actualizados correctamente.');
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Guardar comisión personalizada por asesor
  const handleSaveAdvisorCustom = async (e) => {
    e.preventDefault();
    const { asesor_id, compania_id, porcentaje } = advisorForm;
    if (!asesor_id || !compania_id || porcentaje === '') {
      return showToast('Todos los campos son obligatorios.', 'error');
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/admin/commissions/advisor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          asesor_id: parseInt(asesor_id),
          compania_id: parseInt(compania_id),
          porcentaje: parseFloat(porcentaje)
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar');

      showToast('Comisión de asesor guardada correctamente.');
      setAdvisorForm({ asesor_id: '', compania_id: '', porcentaje: '' });
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Eliminar comisión personalizada por asesor (restablecer a estándar)
  const handleDeleteAdvisorCustom = async (asesorId, companiaId) => {
    if (!confirm('¿Está seguro de que desea eliminar esta comisión personalizada? El asesor volverá a ganar el porcentaje estándar de la aseguradora.')) return;
    
    setSubmitting(true);
    try {
      // Como no tenemos un endpoint delete directo, enviamos la comisión estándar actual de la aseguradora como porcentaje
      // O podemos definir un endpoint en el backend. Pero un delete es más limpio,
      // Espera, para evitar cambios mayores en el back, podemos modificar el backend o simplemente enviar el porcentaje igual a la estándar
      // O, mejor, puesto que comisiones_asesores es una tabla, podemos crear una ruta DELETE o en el POST enviar el porcentaje estándar.
      // Espera, la ruta POST en el backend para /commissions/advisor simplemente hace INSERT ON CONFLICT DO UPDATE.
      // Si quisiéramos borrarlo para que regrese al estándar, necesitamos poder borrar la fila en Postgres/fallback.
      // Vamos a verificar si implementamos un delete o si podemos borrarlo.
      // Espera, en el back no definimos DELETE /commissions/advisor. Vamos a ver:
      // ¿Podemos enviar una petición especial o crear el delete?
      // Podemos crear un endpoint DELETE en el back:
      // Pero espera, no hace falta si simplemente definimos en el back una forma de borrarlo, o creamos un endpoint DELETE ahora.
      // ¡Ah! Modificar el backend para agregar DELETE es sencillísimo y es lo correcto. Pero espera, ¿ya está el backend modificado?
      // Sí, ya escribimos el backend. Pero podemos volver a escribirlo o simplemente agregar una ruta DELETE o hacer que si porcentaje es null o vacío lo elimine.
      // Espera, ¿y si en el POST /commissions/advisor si porcentaje es negativo, o si enviamos una llamada?
      // Es más limpio agregar un DELETE /api/admin/commissions/advisor en el backend.
      // Vamos a ver si podemos hacerlo. ¡Sí, podemos editar `admin.js` para agregar el DELETE!
      // Pero esperemos: ¿podemos hacerlo sin modificar el back?
      // Si enviamos porcentaje = standard, se comporta igual. Pero borrar es más limpio.
      // Agreguemos una ruta en el backend para eliminar un override de asesor.
      // O podemos simplemente manejarlo con un POST /commissions/advisor donde si porcentaje es nulo o menor a 0, se elimine de la BD.
      // Sí, en el backend Postgres: `DELETE FROM comisiones_asesores WHERE asesor_id = $1 AND compania_id = $2`.
      // Hagamos una cosa, agreguemos la ruta DELETE en el backend para que quede perfecto!
      // Vamos a ver la ruta DELETE /commissions/advisor:
      // "DELETE FROM comisiones_asesores WHERE asesor_id = $1 AND compania_id = $2"
      // Vamos a ver cómo actualizar el backend.
      // Pero primero terminemos el front-end de forma que use `DELETE` con body `{ asesor_id, compania_id }` o ruta `/commissions/advisor/:asesor_id/:compania_id`.
      // Hagamos fetch con DELETE al endpoint `${API_URL}/admin/commissions/advisor/${asesorId}/${companiaId}`.
      const res = await fetch(`${API_URL}/admin/commissions/advisor/${asesorId}/${companiaId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al eliminar');

      showToast('Comisión personalizada eliminada.');
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Guardar comisión específica de una póliza
  const handleSavePolicyCommission = async (polizaId) => {
    const val = editingPolicyVal;
    
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/admin/commissions/policy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          poliza_id: parseInt(polizaId),
          comision_porcentaje: val === '' ? null : parseFloat(val)
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar');

      showToast('Comisión de póliza actualizada correctamente.');
      setEditingPolicyId(null);
      setEditingPolicyVal('');
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Exportar reporte TXT
  const handleExportTxt = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/commissions/export-txt`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Error al descargar el reporte.');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'comisiones_asesores.txt';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast('Reporte TXT generado y descargado con éxito.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // --- CÁLCULO DE MÉTRICAS ---
  const totalPolizas = polizas.length;
  const totalPrimas = polizas.reduce((sum, p) => sum + parseFloat(p.prima_anual || 0), 0);
  const totalComisiones = polizas.reduce((sum, p) => sum + (p.comision_calculada || 0), 0);

  if (!hydrated || !isLoggedIn || user?.rango !== 'admin') return null;

  return (
    <div style={{ padding: '1rem 0' }}>
      {/* Encabezado */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <span className="badge badge-vigente" style={{ textTransform: 'uppercase', marginBottom: '0.5rem', display: 'inline-block' }}>Administración</span>
          <h1 style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--primary)', margin: 0 }}>
            Módulo de Comisiones de Asesores
          </h1>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>
            Defina y gestione las comisiones estándar, por asesor o individuales por póliza.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={handleExportTxt} className="btn btn-accent" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            📄 Descargar TXT
          </button>
          <Link href="/dashboard/admin" className="btn btn-secondary">
            Volver al Panel
          </Link>
        </div>
      </div>

      {/* Tarjetas de Resumen */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
        <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <span style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>Total Pólizas Registradas</span>
          <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--primary)', marginTop: '0.25rem' }}>{totalPolizas}</span>
        </div>
        <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <span style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>Volumen Total de Primas</span>
          <span style={{ fontSize: '2rem', fontWeight: 800, color: '#10b981', marginTop: '0.25rem' }}>${totalPrimas.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
        </div>
        <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <span style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>Total Comisiones Estimadas</span>
          <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--accent)', marginTop: '0.25rem' }}>${totalComisiones.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
        </div>
      </div>

      {/* Navegación por pestañas */}
      <div style={{ display: 'flex', borderBottom: '2px solid var(--border)', marginBottom: '1.5rem', gap: '1.5rem' }}>
        <button 
          onClick={() => setActiveTab('polizas')}
          style={{
            padding: '0.75rem 0.5rem',
            fontWeight: 600,
            fontSize: '0.95rem',
            color: activeTab === 'polizas' ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: activeTab === 'polizas' ? '3px solid var(--primary)' : '3px solid transparent',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
            transition: 'var(--transition)'
          }}
        >
          📋 Detalle de Pólizas e Individual
        </button>
        <button 
          onClick={() => setActiveTab('estandar')}
          style={{
            padding: '0.75rem 0.5rem',
            fontWeight: 600,
            fontSize: '0.95rem',
            color: activeTab === 'estandar' ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: activeTab === 'estandar' ? '3px solid var(--primary)' : '3px solid transparent',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
            transition: 'var(--transition)'
          }}
        >
          🏢 Comisiones Estándar (Aseguradoras)
        </button>
        <button 
          onClick={() => setActiveTab('personalizado')}
          style={{
            padding: '0.75rem 0.5rem',
            fontWeight: 600,
            fontSize: '0.95rem',
            color: activeTab === 'personalizado' ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: activeTab === 'personalizado' ? '3px solid var(--primary)' : '3px solid transparent',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
            transition: 'var(--transition)'
          }}
        >
          👤 Comisiones por Asesor
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: 'var(--text-muted)' }}>Cargando información de comisiones...</p>
        </div>
      ) : (
        <div>
          {/* PESTAÑA: DETALLE DE PÓLIZAS */}
          {activeTab === 'polizas' && (
            <div className="card" style={{ padding: '1.5rem', overflowX: 'auto' }}>
              <h3 style={{ color: 'var(--primary)', marginBottom: '1.25rem', fontWeight: 700 }}>Comisión Individual por Póliza</h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                Aquí puede ver la comisión calculada para cada póliza. El porcentaje se aplica siguiendo la jerarquía: <strong>Comisión de Póliza</strong> &gt; <strong>Comisión por Asesor</strong> &gt; <strong>Comisión Estándar de la Aseguradora</strong>.
              </p>

              <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)' }}>
                    <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>Póliza</th>
                    <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>Aseguradora / Plan</th>
                    <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>Asesor</th>
                    <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>Cliente</th>
                    <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>Prima Anual</th>
                    <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>Comisión JKA</th>
                    <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>% Asesor</th>
                    <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>Origen</th>
                    <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>Com. Asesor</th>
                    <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)', textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {polizas.length === 0 ? (
                    <tr>
                      <td colSpan="10" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No hay pólizas registradas.</td>
                    </tr>
                  ) : (
                    polizas.map(p => {
                      const isEditing = editingPolicyId === p.id;
                      const badgeType = p.origen_comision === 'Poliza' ? 'badge-vigente' : (p.origen_comision === 'Asesor' ? 'badge-negociacion' : 'badge-vencido');
                      const originLabel = p.origen_comision === 'Poliza' ? 'Póliza Específica' : (p.origen_comision === 'Asesor' ? 'Personalizado Asesor' : 'Estándar Aseguradora');

                      return (
                        <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600, color: 'var(--primary)' }}>{p.codigo_poliza}</td>
                          <td style={{ padding: '0.75rem 0.5rem' }}>
                            <strong style={{ display: 'block' }}>{p.compania_nombre}</strong>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Plan: {p.plan || 'N/A'}</span>
                          </td>
                          <td style={{ padding: '0.75rem 0.5rem' }}>{p.asesor_nombre} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>({p.codigo_asesor})</span></td>
                          <td style={{ padding: '0.75rem 0.5rem' }}>{p.primer_nombre} {p.primer_apellido}</td>
                          <td style={{ padding: '0.75rem 0.5rem', fontWeight: 500 }}>${parseFloat(p.prima_anual || 0).toLocaleString('en-US')}</td>
                          <td style={{ padding: '0.75rem 0.5rem' }}>
                            <strong>${(p.comision_jka || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>({p.comision_compania_pct}%)</span>
                          </td>
                          <td style={{ padding: '0.75rem 0.5rem' }}>
                            {isEditing ? (
                              <input 
                                type="number" 
                                className="form-input" 
                                value={editingPolicyVal} 
                                onChange={e => setEditingPolicyVal(e.target.value)} 
                                style={{ width: '80px', padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}
                                placeholder="%"
                                min="0"
                                max="100"
                                step="0.1"
                              />
                            ) : (
                              <span>{p.porcentaje_aplicado}%</span>
                            )}
                          </td>
                          <td style={{ padding: '0.75rem 0.5rem' }}>
                            <span className={`badge ${badgeType}`} style={{ fontSize: '0.7rem' }}>
                              {originLabel}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600, color: 'var(--accent)' }}>
                            ${p.comision_calculada.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                            {isEditing ? (
                              <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                                <button 
                                  onClick={() => handleSavePolicyCommission(p.id)} 
                                  className="btn btn-primary" 
                                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                                  disabled={submitting}
                                >
                                  💾
                                </button>
                                <button 
                                  onClick={() => { setEditingPolicyId(null); setEditingPolicyVal(''); }} 
                                  className="btn btn-secondary" 
                                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                                >
                                  ❌
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                                <button 
                                  onClick={() => { setEditingPolicyId(p.id); setEditingPolicyVal(p.comision_porcentaje !== null ? String(p.comision_porcentaje) : ''); }} 
                                  className="btn btn-secondary" 
                                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                                  title="Personalizar comisión de esta póliza"
                                >
                                  ✏️ Editar
                                </button>
                                {p.comision_porcentaje !== null && (
                                  <button 
                                    onClick={() => { setEditingPolicyVal(''); handleSavePolicyCommission(p.id); }} 
                                    className="btn btn-accent" 
                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#e11d48' }}
                                    title="Restablecer comisión a estándar"
                                  >
                                    🔄 Restablecer
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* PESTAÑA: COMISIONES ESTÁNDAR (ASEGURADORAS) */}
          {activeTab === 'estandar' && (
            <div className="card" style={{ padding: '1.5rem', maxWidth: '700px', margin: '0 auto' }}>
              <h3 style={{ color: 'var(--primary)', marginBottom: '1.25rem', fontWeight: 700 }}>Comisión Estándar por Aseguradora</h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                Establezca la comisión por defecto para cada compañía de seguros. Todos los asesores ganarán este porcentaje por defecto en las pólizas de esta aseguradora, a menos que tengan una comisión personalizada configurada.
              </p>

              <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)' }}>
                    <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>Aseguradora</th>
                    <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>% Comisión Aseguradora (JKA)</th>
                    <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>% Comisión Asesor (de Comisión JKA)</th>
                    <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)', textAlign: 'right' }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {companias.length === 0 ? (
                    <tr>
                      <td colSpan="4" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No hay aseguradoras registradas.</td>
                    </tr>
                  ) : (
                    companias.map(c => {
                      const edit = standardEdits[c.id] || { comision_compania: 0, comision_asesor_estandar: 0 };
                      return (
                        <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>{c.nombre}</td>
                          <td style={{ padding: '0.75rem 0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <input 
                                type="number"
                                className="form-input"
                                value={edit.comision_compania}
                                onChange={e => setStandardEdits({
                                  ...standardEdits,
                                  [c.id]: { ...edit, comision_compania: e.target.value }
                                })}
                                style={{ width: '90px', padding: '0.35rem 0.5rem' }}
                                min="0"
                                max="100"
                                step="0.1"
                              />
                              <span>%</span>
                            </div>
                          </td>
                          <td style={{ padding: '0.75rem 0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <input 
                                type="number"
                                className="form-input"
                                value={edit.comision_asesor_estandar}
                                onChange={e => setStandardEdits({
                                  ...standardEdits,
                                  [c.id]: { ...edit, comision_asesor_estandar: e.target.value }
                                })}
                                style={{ width: '90px', padding: '0.35rem 0.5rem' }}
                                min="0"
                                max="100"
                                step="0.1"
                              />
                              <span>%</span>
                            </div>
                          </td>
                          <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                            <button 
                              onClick={() => handleSaveStandard(c.id)}
                              className="btn btn-primary"
                              style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
                              disabled={submitting}
                            >
                              Actualizar
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* PESTAÑA: COMISIONES POR ASESOR */}
          {activeTab === 'personalizado' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
              
              {/* Formulario de Creación */}
              <div className="card" style={{ padding: '1.5rem', maxWidth: '600px', margin: '0 auto', width: '100%' }}>
                <h3 style={{ color: 'var(--primary)', marginBottom: '1.25rem', fontWeight: 700 }}>Asignar Comisión Personalizada</h3>
                <form onSubmit={handleSaveAdvisorCustom}>
                  <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <div className="form-group">
                      <label className="form-label">Asesor Comercial *</label>
                      <select 
                        className="form-input" 
                        value={advisorForm.asesor_id}
                        onChange={e => setAdvisorForm({ ...advisorForm, asesor_id: e.target.value })}
                        required
                      >
                        <option value="">Seleccione un asesor...</option>
                        {asesores.map(a => (
                          <option key={a.id} value={a.id}>{a.nombre} ({a.codigo_asesor})</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Aseguradora *</label>
                      <select 
                        className="form-input" 
                        value={advisorForm.compania_id}
                        onChange={e => setAdvisorForm({ ...advisorForm, compania_id: e.target.value })}
                        required
                      >
                        <option value="">Seleccione aseguradora...</option>
                        {companias.map(c => (
                          <option key={c.id} value={c.id}>{c.nombre}</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group" style={{ gridColumn: 'span 2' }}>
                      <label className="form-label">Porcentaje de Comisión (%) *</label>
                      <input 
                        type="number" 
                        className="form-input" 
                        value={advisorForm.porcentaje}
                        onChange={e => setAdvisorForm({ ...advisorForm, porcentaje: e.target.value })}
                        placeholder="Ej: 12.5"
                        min="0"
                        max="100"
                        step="0.1"
                        required
                      />
                    </div>
                  </div>

                  <button 
                    type="submit" 
                    className="btn btn-primary btn-center" 
                    style={{ marginTop: '1.5rem', width: '200px', display: 'block' }}
                    disabled={submitting}
                  >
                    {submitting ? 'Guardando...' : 'Asignar Comisión'}
                  </button>
                </form>
              </div>

              {/* Listado de overrides */}
              <div className="card" style={{ padding: '1.5rem', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
                <h3 style={{ color: 'var(--primary)', marginBottom: '1.25rem', fontWeight: 700 }}>Comisiones Personalizadas Asignadas</h3>
                
                <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)' }}>
                      <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>Asesor</th>
                      <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>Aseguradora</th>
                      <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>Porcentaje Especial</th>
                      <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)', textAlign: 'right' }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comisionesAsesores.length === 0 ? (
                      <tr>
                        <td colSpan="4" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No hay comisiones personalizadas asignadas a asesores.</td>
                      </tr>
                    ) : (
                      comisionesAsesores.map(ca => {
                        const advisor = asesores.find(a => a.id === ca.asesor_id);
                        const comp = companias.find(c => c.id === ca.compania_id);
                        return (
                          <tr key={ca.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '0.75rem 0.5rem', fontWeight: 500 }}>
                              {advisor ? advisor.nombre : `Asesor ID ${ca.asesor_id}`}
                              {advisor && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Código: {advisor.codigo_asesor}</span>}
                            </td>
                            <td style={{ padding: '0.75rem 0.5rem' }}>{comp ? comp.nombre : `Aseguradora ID ${ca.compania_id}`}</td>
                            <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600, color: 'var(--accent)' }}>{ca.porcentaje}%</td>
                            <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                              <button 
                                onClick={() => handleDeleteAdvisorCustom(ca.asesor_id, ca.compania_id)}
                                className="btn btn-accent"
                                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', background: '#e11d48' }}
                                disabled={submitting}
                              >
                                Eliminar
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

            </div>
          )}
        </div>
      )}
    </div>
  );
}
