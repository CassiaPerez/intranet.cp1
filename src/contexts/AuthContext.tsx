// src/contexts/AuthContext.tsx
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || ''; // '' => usa proxy do Vite

// Modelo unificado do usuário que o app vai usar
export type User = {
  id: number;
  nome: string;
  email: string;
  setor?: string;
  role?: string;
  picture?: string;
};

type AuthContextType = {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  loginWithGoogle: () => void;
  reload: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};

// Normaliza diferentes formatos vindos do backend/localStorage
function normalizeUser(raw: any): User | null {
  if (!raw) return null;
  const id = raw.id ?? raw.userId ?? raw.uid ?? 0;
  const email = raw.email ?? '';
  const nome = raw.nome ?? raw.name ?? raw.displayName ?? '';
  const setor = raw.setor ?? raw.sector ?? '';
  const role = raw.role ?? '';
  const picture = raw.picture ?? raw.avatar ?? raw.photoURL ?? '';

  if (!email) return null;

  return {
    id: Number(id) || 0,
    email,
    nome,
    setor,
    role,
    picture
  };
}

/** Heurística de fallback caso o backend não envie role/setor (evitar “travar” login) */
function fillMissingFields(u: User): User {
  const role = u.role && u.role.trim()
    ? u.role
    : (u.email === 'admin@grupocropfield.com.br' || u.setor === 'TI' ? 'admin' : (u.setor === 'RH' ? 'rh' : 'colaborador'));
  return { ...u, role };
}

const STORAGE_KEY = 'currentUser';

export const AuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  async function fetchMe(): Promise<User | null> {
    try {
      const res = await fetch(`${API_BASE}/api/me`, { credentials: 'include' });
      if (!res.ok) return null;

      // Algumas hospedagens retornam texto — lidamos com ambos
      const text = await res.text();
      if (!text) return null;

      let data: any;
      try { data = JSON.parse(text); } catch { return null; }

      const raw = data.user ?? data; // aceita { ok, user } ou objeto direto
      let u = normalizeUser(raw);
      if (!u) return null;
      u = fillMissingFields(u);
      return u;
    } catch {
      return null;
    }
  }

  // Recarrega o estado de autenticação (preferir backend; cair para localStorage se offline)
  const reload = async () => {
    setLoading(true);
    try {
      const u = await fetchMe();
      if (u) {
        setUser(u);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
        return;
      }
      // Fallback: localStorage (ex.: offline)
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = normalizeUser(JSON.parse(stored));
        if (parsed) {
          setUser(fillMissingFields(parsed));
          return;
        }
        localStorage.removeItem(STORAGE_KEY);
      }
      setUser(null);
    } finally {
      if (mounted.current) setLoading(false);
    }
  };

  useEffect(() => {
    mounted.current = true;
    reload();
    // Sincroniza logout/login entre abas
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) reload();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      mounted.current = false;
      window.removeEventListener('storage', onStorage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loginWithGoogle = () => {
    // Redireciona para o backend iniciar o OAuth
    window.location.href = `${API_BASE}/auth/google`;
  };

  const logout = async () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch (_) {
      // mesmo que falhe, vamos limpar o estado local
    } finally {
      setUser(null);
    }
  };

  const value = useMemo<AuthContextType>(() => ({
    user,
    isAuthenticated: !!user,
    loading,
    loginWithGoogle,
    reload,
    logout
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
