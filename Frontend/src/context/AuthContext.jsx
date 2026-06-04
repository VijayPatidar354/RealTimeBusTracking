import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  clearPassengerSession,
  loginPassengerAccount,
  readPassengerSession,
  registerPassengerAccount,
  savePassengerSession,
} from '../services/authService.js';
import { AuthContext } from './authContextValue.js';

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [passenger, setPassenger] = useState(null);
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    const session = readPassengerSession();
    setToken(session.token);
    setPassenger(session.passenger);
    setRestoring(false);
  }, []);

  const login = useCallback(async (credentials) => {
    const session = await loginPassengerAccount(credentials);
    savePassengerSession(session);
    setToken(session.token);
    setPassenger(session.passenger);
    return session;
  }, []);

  const register = useCallback(async (values) => {
    return registerPassengerAccount(values);
  }, []);

  const logout = useCallback(() => {
    clearPassengerSession();
    setToken(null);
    setPassenger(null);
  }, []);

  const value = useMemo(
    () => ({
      token,
      passenger,
      restoring,
      isAuthenticated: Boolean(token),
      login,
      register,
      logout,
    }),
    [token, passenger, restoring, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
