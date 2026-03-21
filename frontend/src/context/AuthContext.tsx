import { createContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getMe } from '../services/auth.api';

const TOKEN_KEY = 'diplom_token';

export type AuthState = {
  token: string | null;
  user: { id: string; nickname: string } | null;
  setToken: (token: string | null) => void;
  reloadMe: () => Promise<void>;
};

export const AuthContext = createContext<AuthState>({
  token: null,
  user: null,
  setToken: () => undefined,
  reloadMe: async () => undefined,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<{ id: string; nickname: string } | null>(null);

  const setToken = (value: string | null) => {
    setTokenState(value);
    if (value) {
      localStorage.setItem(TOKEN_KEY, value);
    } else {
      localStorage.removeItem(TOKEN_KEY);
      setUser(null);
    }
  };

  const reloadMe = async () => {
    if (!token) {
      setUser(null);
      return;
    }
    try {
      const me = await getMe(token);
      setUser({ id: me.id, nickname: me.nickname });
    } catch {
      setToken(null);
    }
  };

  useEffect(() => {
    void reloadMe();
  }, [token]);

  const value = useMemo(() => ({ token, user, setToken, reloadMe }), [token, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}


