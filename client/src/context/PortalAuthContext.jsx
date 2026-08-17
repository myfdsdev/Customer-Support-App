import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { portalAuthService, setPortalToken, clearPortalToken, getPortalToken } from '../services/portalApi';

/**
 * Customer membership-portal authentication.
 *
 * Entirely separate from the admin `AuthContext`: different service, different
 * token store, different identity. The two can even be signed in at once in
 * the same browser (an admin previewing the portal) without interfering,
 * because the staff token lives in localStorage and the portal token in a
 * cookie + sessionStorage.
 */
const PortalAuthContext = createContext(null);

export function PortalAuthProvider({ children }) {
  const [customer, setCustomer] = useState(null);
  const [productCount, setProductCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await portalAuthService.me();
      setCustomer(data.customer);
      setProductCount(data.productCount || 0);
      return data.customer;
    } catch {
      setCustomer(null);
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // The cookie may authenticate us even with no bearer token, so always
      // probe /me once on load rather than gating on a stored token.
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const login = useCallback(async (email, password) => {
    const data = await portalAuthService.login({ email, password });
    if (data.token) setPortalToken(data.token);
    setCustomer(data.customer);
    await refresh();
    return data.customer;
  }, [refresh]);

  const register = useCallback(async (payload) => {
    const data = await portalAuthService.register(payload);
    if (data.requiresVerification) return { requiresVerification: true, email: data.email };
    if (data.token) setPortalToken(data.token);
    setCustomer(data.customer);
    await refresh();
    return { customer: data.customer };
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await portalAuthService.logout();
    } catch {
      /* local sign-out matters more than the round-trip */
    }
    clearPortalToken();
    setCustomer(null);
    setProductCount(0);
  }, []);

  const value = useMemo(
    () => ({
      customer,
      productCount,
      loading,
      isAuthenticated: Boolean(customer),
      login,
      register,
      logout,
      refresh,
      setCustomer,
      hasToken: Boolean(getPortalToken()),
    }),
    [customer, productCount, loading, login, register, logout, refresh]
  );

  return <PortalAuthContext.Provider value={value}>{children}</PortalAuthContext.Provider>;
}

export function usePortalAuth() {
  const ctx = useContext(PortalAuthContext);
  if (!ctx) throw new Error('usePortalAuth must be used inside a PortalAuthProvider');
  return ctx;
}
