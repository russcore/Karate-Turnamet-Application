import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';

export interface AuthUser {
  id: number;
  username: string;
  role: 'admin' | 'tatami_editor' | 'viewer';
  displayName?: string | null;
  tatamiIds: number[];
}

interface AuthCtx {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/api/auth/me')
      .then((u) => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (username: string, password: string) => {
    const u = await api.post('/api/auth/login', { username, password });
    setUser(u);
  };
  const logout = async () => {
    await api.post('/api/auth/logout');
    setUser(null);
  };

  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth outside provider');
  return ctx;
}
