import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  clearDriverSession,
  loginDriver,
  readDriverSession,
  saveDriverSession,
  getDriverProfile,
} from '../services/driverService.js';

const DriverAuthContext = createContext(null);

export function DriverAuthProvider({ children }) {
  const [token, setToken]       = useState(null);
  const [driver, setDriver]     = useState(null);
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    const session = readDriverSession();
    setToken(session.token);
    setDriver(session.driver);
    setRestoring(false);
  }, []);

  const login = useCallback(async ({ phone, password }) => {
    const data = await loginDriver({ phone, password });
    // Fetch full profile to get bus + route info
    const profileData = await getDriverProfile(data.token);
    const driverInfo  = profileData.driver;
    saveDriverSession(data.token, driverInfo);
    setToken(data.token);
    setDriver(driverInfo);
    return driverInfo;
  }, []);

  const logout = useCallback(() => {
    clearDriverSession();
    setToken(null);
    setDriver(null);
  }, []);

  const refreshProfile = useCallback(async (currentToken) => {
    const profileData = await getDriverProfile(currentToken);
    setDriver(profileData.driver);
    saveDriverSession(currentToken, profileData.driver);
    return profileData.driver;
  }, []);

  const value = useMemo(() => ({
    token, driver, restoring,
    isAuthenticated: Boolean(token),
    login, logout, refreshProfile,
  }), [token, driver, restoring, login, logout, refreshProfile]);

  return (
    <DriverAuthContext.Provider value={value}>
      {children}
    </DriverAuthContext.Provider>
  );
}

export function useDriverAuth() {
  const ctx = useContext(DriverAuthContext);
  if (!ctx) throw new Error('useDriverAuth must be used inside DriverAuthProvider');
  return ctx;
}
