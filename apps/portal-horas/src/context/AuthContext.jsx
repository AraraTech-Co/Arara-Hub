import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { resolveEffectiveScreenPermissions } from '../config/screenPermissions.js';
import { araraLogin, loadHorasAppUser } from '../lib/arara.ts';

const AuthContext = createContext(null);

async function mapAraraLogin(data) {
  return loadHorasAppUser({
    id: data.user.id,
    email: data.user.email,
    fullName: data.user.name || data.user.email,
  });
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem('user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem('token'));

  const hydrateAppUser = useCallback(async (platformUser) => {
    if (!import.meta.env.VITE_ARARA_API_URL || !platformUser) return platformUser;
    try {
      const merged = await mapAraraLogin({ user: platformUser });
      localStorage.setItem('user', JSON.stringify(merged));
      setUser(merged);
      return merged;
    } catch {
      return platformUser;
    }
  }, []);

  useEffect(() => {
    if (!import.meta.env.VITE_ARARA_API_URL || !token || !user?.id || user?.horasProfileLoaded) return;
    hydrateAppUser(user);
  }, [token, user?.id, user?.horasProfileLoaded, hydrateAppUser]);

  const login = useCallback(async (email, password) => {
    if (import.meta.env.VITE_ARARA_API_URL) {
      const data = await araraLogin(email, password);
      const mapped = await mapAraraLogin(data);
      localStorage.setItem('token', data.token || data.accessToken);
      localStorage.setItem('user', JSON.stringify(mapped));
      setToken(data.token || data.accessToken);
      setUser(mapped);
      return mapped;
    }
    const { data } = await api.post('/api/auth/login', { email, password });
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('arara_jwt');
    localStorage.removeItem('arara_user');
    localStorage.removeItem(
      `arara_app_key:${import.meta.env.VITE_ARARA_APP_SLUG || 'portal-horas'}`
    );
    setToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const { data } = await api.get('/api/auth/me');
    if (import.meta.env.VITE_ARARA_API_URL) {
      const merged = await mapAraraLogin({ user: data.user });
      localStorage.setItem('user', JSON.stringify(merged));
      setUser(merged);
      return merged;
    }
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }, []);

  const value = useMemo(
    () => {
      const screenPermissions = resolveEffectiveScreenPermissions(user);
      return {
        user,
        token,
        isAuthenticated: !!token && !!user,
        isAdmin: user?.role === 'admin',
        isManager: user?.role === 'admin',
        screenPermissions,
        canAccessScreen: (screenKey) => screenPermissions.includes(screenKey),
        login,
        logout,
        refreshUser,
      };
    },
    [user, token, login, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
