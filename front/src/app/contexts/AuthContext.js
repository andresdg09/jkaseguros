"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

// Normaliza la URL base: si NEXT_PUBLIC_API_URL viene sin el sufijo /api
// (mala configuración en Vercel), lo agregamos igual para no romper todas las requests.
function normalizeApiUrl(url) {
  const trimmed = url.replace(/\/+$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}
const API_URL = normalizeApiUrl(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api');

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [cliente, setCliente] = useState(null);
  const [asesor, setAsesor] = useState(null);
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(false);

  const isTokenExpired = (tok) => {
    try {
      const parts = tok.split('.');
      if (parts.length !== 3) return true;
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (!payload.exp) return false;
      return Date.now() >= payload.exp * 1000;
    } catch (e) {
      return true;
    }
  };

  useEffect(() => {
    // Cargar credenciales desde localStorage tras el montaje en el cliente
    const storedToken = localStorage.getItem('jka_token');
    const storedUser = localStorage.getItem('jka_user');
    const storedCliente = localStorage.getItem('jka_cliente');
    const storedAsesor = localStorage.getItem('jka_asesor');

    if (storedToken && storedUser) {
      if (isTokenExpired(storedToken)) {
        localStorage.removeItem('jka_token');
        localStorage.removeItem('jka_user');
        localStorage.removeItem('jka_cliente');
        localStorage.removeItem('jka_asesor');
      } else {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
        if (storedCliente) setCliente(JSON.parse(storedCliente));
        if (storedAsesor) setAsesor(JSON.parse(storedAsesor));
      }
    }
    setHydrated(true);
  }, []);

  const login = async (correo, contrasena) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correo, contrasena })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error en el inicio de sesión');

      localStorage.setItem('jka_token', data.token);
      localStorage.setItem('jka_user', JSON.stringify(data.user));
      if (data.cliente) localStorage.setItem('jka_cliente', JSON.stringify(data.cliente));
      if (data.asesor) localStorage.setItem('jka_asesor', JSON.stringify(data.asesor));

      setToken(data.token);
      setUser(data.user);
      setCliente(data.cliente || null);
      setAsesor(data.asesor || null);

      return data;
    } catch (err) {
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const register = async (formData) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error en el registro');

      localStorage.setItem('jka_token', data.token);
      localStorage.setItem('jka_user', JSON.stringify(data.user));
      if (data.cliente) localStorage.setItem('jka_cliente', JSON.stringify(data.cliente));
      if (data.asesor) localStorage.setItem('jka_asesor', JSON.stringify(data.asesor));

      setToken(data.token);
      setUser(data.user);
      setCliente(data.cliente || null);
      setAsesor(data.asesor || null);

      return data;
    } catch (err) {
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('jka_token');
    localStorage.removeItem('jka_user');
    localStorage.removeItem('jka_cliente');
    localStorage.removeItem('jka_asesor');

    setToken(null);
    setUser(null);
    setCliente(null);
    setAsesor(null);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const res = await originalFetch(...args);
      if (res.status === 401 || res.status === 403) {
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
        if (!url.includes('/auth/login') && !url.includes('/auth/register') && !url.includes('/public/')) {
          logout();
          window.location.href = '/login';
        }
      }
      return res;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [token]);

  const updateProfile = async (profileData) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(profileData)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al actualizar perfil');

      localStorage.setItem('jka_cliente', JSON.stringify(data.cliente));
      setCliente(data.cliente);
      
      // Si el usuario es asesor, también actualizamos su información de asesor local
      if (user?.rango === 'asesor') {
        const updatedAsesor = {
          ...asesor,
          nombre: `${profileData.primer_nombre} ${profileData.primer_apellido}`,
          telefono: `${profileData.codigo_area}-${profileData.numero_celular}`
        };
        localStorage.setItem('jka_asesor', JSON.stringify(updatedAsesor));
        setAsesor(updatedAsesor);
      }

      return data;
    } catch (err) {
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const isLoggedIn = !!token;

  return (
    <AuthContext.Provider value={{
      token,
      user,
      cliente,
      asesor,
      hydrated,
      loading,
      isLoggedIn,
      login,
      register,
      logout,
      updateProfile
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider');
  }
  return context;
}
