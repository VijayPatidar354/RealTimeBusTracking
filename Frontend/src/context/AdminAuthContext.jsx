import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  clearAdminSession,
  loginAdmin,
  readAdminSession,
  saveAdminSession,
} from '../services/adminService.js';

const AdminAuthContext = createContext(null);

export function AdminAuthProvider({ children }) {
  const [token,     setToken]     = useState(null);
  const [admin,     setAdmin]     = useState(null);
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    const session = readAdminSession();
    setToken(session.token);
    setAdmin(session.admin);
    setRestoring(false);
  }, []);

  const login = useCallback(async ({ email, password }) => {
    const data = await loginAdmin({ email, password });
    saveAdminSession(data.token, data.admin);
    setToken(data.token);
    setAdmin(data.admin);
    return data;
  }, []);

  const logout = useCallback(() => {
    clearAdminSession();
    setToken(null);
    setAdmin(null);
  }, []);

  const value = useMemo(() => ({
    token, admin, restoring,
    isAuthenticated: Boolean(token),
    login, logout,
  }), [token, admin, restoring, login, logout]);

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used inside AdminAuthProvider');
  return ctx;
}
