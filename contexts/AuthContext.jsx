'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, ApiError, getToken, setToken } from '@/lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setTokenState] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [sessionError, setSessionError] = useState(null); // server unreachable during restore

  const applySession = useCallback((t, u) => {
    setToken(t);
    setTokenState(t);
    setUser(u);
    setSessionError(null);
  }, []);

  const clearSession = useCallback(() => {
    setToken(null);
    setTokenState(null);
    setUser(null);
  }, []);

  // Session restore: the server (not localStorage) confirms the session.
  const restoreSession = useCallback(async () => {
    const stored = getToken();
    if (!stored) {
      setInitializing(false);
      return;
    }
    setTokenState(stored);
    try {
      const data = await api.get('/api/auth/me', { token: stored });
      applySession(stored, data.user);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.code === 'SESSION_EXPIRED')) {
        clearSession(); // server says invalid/expired — log out for real
      } else {
        // Network/server problem: keep the token, surface a retry state.
        setSessionError(err.message);
      }
    } finally {
      setInitializing(false);
    }
  }, [applySession, clearSession]);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const login = useCallback(async ({ identifier, password, deviceName }) => {
    const data = await api.post('/api/auth/login', { identifier, password, deviceName });
    applySession(data.token, data.user);
    return data.user;
  }, [applySession]);

  const register = useCallback(async ({ username, email, phone, password, deviceName }) => {
    const data = await api.post('/api/auth/register', { username, email, phone, password, deviceName });
    applySession(data.token, data.user);
    return data.user;
  }, [applySession]);

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout', {}); // revoke session server-side
    } catch {
      // offline logout still clears the local session
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo(() => ({
    user,
    token,
    initializing,
    sessionError,
    login,
    register,
    logout,
    restoreSession,
  }), [user, token, initializing, sessionError, login, register, logout, restoreSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
