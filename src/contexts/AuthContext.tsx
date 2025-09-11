// src/contexts/AuthContext.tsx
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, ''); // Remove trailing slashes

// Modelo unificado do usuário que o app vai usar
export type User = {
  id: string;
  nome?: string;
  name?: string;
  email: string;
  setor: string;
  sector?: string;
  role: string;
  picture?: string;
  can_publish_mural?: number;
  can_moderate_mural?: number;
  pontos_gamificacao?: number;
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
  const id = String(raw.id ?? raw.userId ?? raw.uid ?? '');
  const email = raw.email ?? '';
  const nome = raw.nome ?? raw.name ?? raw.displayName ?? '';
  const setor = raw.setor ?? raw.sector ?? '';
  const role = raw.role ?? '';
  const picture = raw.picture ?? raw.avatar ?? raw.photoURL ?? raw.avatar_url ?? '';

  if (!email || !id) return null;

  return {
    id,
    email,
    nome,
    name: nome,
    setor,
    sector: setor,
    role,
    picture,
    can_publish_mural: raw.can_publish_mural ?? 0,
    can_moderate_mural: raw.can_moderate_mural ?? 0,
    pontos_gamificacao: raw.pontos_gamificacao ?? 0
  };
}

/** Heurística de fallback caso o backend não envie role/setor (evitar “travar” login) */
function fillMissingFields(u: User): User {
  const role = u.role && u.role.trim()
    ? u.role
    : (u.email === 'admin@grupocropfield.com.br' || u.setor === 'TI' ? 'admin' : (u.setor === 'RH' ? 'rh' : 'colaborador'));
  
  const setor = u.setor && u.setor.trim() 
    ? u.setor 
    : (u.email === 'admin@grupocropfield.com.br' ? 'TI' : 'Geral');
    
  return { ...u, role, setor, sector: setor };
}

const STORAGE_KEY = 'currentUser';

export const AuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  async function fetchMe(): Promise<User | null> {
    try {
      console.log('[AUTH] Fetching user from:', `${API_BASE}/api/me`);
      const res = await fetch(`${API_BASE}/api/me`, { credentials: 'include' });
      
      if (!res.ok) {
        console.log('[AUTH] API /me failed:', res.status, res.statusText);
        return null;
      }

      // Algumas hospedagens retornam texto — lidamos com ambos
      const text = await res.text();
      if (!text) {
        console.log('[AUTH] API /me returned empty response');
        return null;
      }

      let data: any;
      try { 
        data = JSON.parse(text); 
      } catch (e) {
        console.error('[AUTH] Failed to parse /me response:', e);
        return null;
      }

      const raw = data.user ?? data; // aceita { ok, user } ou objeto direto
      let u = normalizeUser(raw);
      if (!u) {
        console.log('[AUTH] Failed to normalize user data:', raw);
        return null;
      }
      
      u = fillMissingFields(u);
      console.log('[AUTH] User loaded successfully:', u.email, u.role);
      return u;
    } catch (error) {
      console.error('[AUTH] Error fetching user:', error);
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
    console.log('[AUTH] Starting Google login...');
    const googleUrl = `${API_BASE}/auth/google`;
    console.log('[AUTH] Redirecting to:', googleUrl);
    window.location.href = googleUrl;
  };

  const logout = async () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      await fetch(`${API_BASE}/auth/logout`, { 
        method: 'POST', 
        credentials: 'include' 
      }).catch(() => {}); // ignore errors on logout
    } catch (_) {
      // mesmo que falhe, vamos limpar o estado local
    } finally {
      setUser(null);
      console.log('[AUTH] Logout completed');
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
