import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authService } from '../services/endpoints';
import { setToken, clearToken, getToken } from '../services/api';
import { connectAgentSocket, disconnectAgentSocket, getAgentSocket } from '../socket/socket';

const AuthContext = createContext(null);

/** Role -> which admin sections are reachable. Mirrors the server's rules. */
const PERMISSIONS = {
  super_admin: ['dashboard', 'inbox', 'tickets', 'customers', 'products', 'knowledge', 'training', 'marketing', 'announcements', 'team', 'analytics', 'settings', 'integrations', 'portal-content'],
  support_manager: ['dashboard', 'inbox', 'tickets', 'customers', 'products', 'knowledge', 'training', 'announcements', 'team', 'analytics', 'settings', 'portal-content'],
  support_agent: ['inbox', 'tickets', 'customers', 'knowledge', 'training', 'settings'],
  marketing_manager: ['marketing', 'announcements', 'analytics', 'settings', 'portal-content'],
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState(null);

  const bootstrapSocket = useCallback(() => {
    const token = getToken();
    if (!token) return null;
    const s = connectAgentSocket(token);
    setSocket(s);
    return s;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const data = await authService.me();
        if (cancelled) return;
        setUser(data.user);
        setProducts(data.products || []);
        bootstrapSocket();
      } catch {
        clearToken();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bootstrapSocket]);

  const login = useCallback(
    async (email, password) => {
      const data = await authService.login({ email, password });
      setToken(data.token);
      setUser(data.user);
      const me = await authService.me().catch(() => null);
      if (me) setProducts(me.products || []);
      bootstrapSocket();
      return data.user;
    },
    [bootstrapSocket]
  );

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch {
      /* logging out locally matters more than the server round-trip */
    }
    disconnectAgentSocket();
    setSocket(null);
    clearToken();
    setUser(null);
    setProducts([]);
  }, []);

  const value = useMemo(
    () => ({
      user,
      products,
      loading,
      socket: socket || getAgentSocket(),
      login,
      logout,
      setUser,
      isAuthenticated: Boolean(user),
      can: (section) => Boolean(user && (PERMISSIONS[user.role] || []).includes(section)),
      role: user?.role,
    }),
    [user, products, loading, socket, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside an AuthProvider');
  return ctx;
}

export { PERMISSIONS };
