import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  clearOwnerSession,
  loginOwner,
  readOwnerSession,
  saveOwnerSession,
  registerOwner,

} from '../services/ownerService.js';

const OwnerAuthContext = createContext(null);

export function OwnerAuthProvider({ children }) {
  const [token,     setToken]     = useState(null);
  const [owner,     setOwner]     = useState(null);
  const [restoring, setRestoring] = useState(true);

  // Restore session from localStorage on mount
  useEffect(() => {
    const session = readOwnerSession();
    setToken(session.token);
    setOwner(session.owner);
    setRestoring(false);
  }, []);

  const register = useCallback(async (values) => {
    return registerOwner({
      owner_name: values.ownerName,
      email: values.email,
      password: values.password,
    });
  }, []);
  const login = useCallback(async ({ email, password }) => {
    const data = await loginOwner({ email, password });
    // Backend only returns token on login — store what we have
    // owner_name/email comes from the login form itself
    const ownerInfo = { email };
    saveOwnerSession(data.token, ownerInfo);
    setToken(data.token);
    setOwner(ownerInfo);
    return data;
  }, []);

  const logout = useCallback(() => {
    clearOwnerSession();
    setToken(null);
    setOwner(null);
  }, []);

  const value = useMemo(() => ({
    token, owner, restoring,
    isAuthenticated: Boolean(token),
    login, logout, register,
  }), [token, owner, restoring, register, login, logout]);

  return (
    <OwnerAuthContext.Provider value={value}>
      {children}
    </OwnerAuthContext.Provider>
  );
}

export function useOwnerAuth() {
  const ctx = useContext(OwnerAuthContext);
  if (!ctx) throw new Error('useOwnerAuth must be used inside OwnerAuthProvider');
  return ctx;
}
