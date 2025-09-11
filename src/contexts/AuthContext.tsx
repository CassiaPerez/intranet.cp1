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
  avatar?: string;
  avatar_url?: string;
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
    avatar: picture,
    avatar_url: picture,
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
      const meUrl = `${API_BASE}/api/me`;
      console.log('[AUTH] Fetching user from:', meUrl);
      
      const res = await fetch(meUrl, { 
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!res.ok) {
        const errorText = await res.text().catch(() => 'No response body');
        console.log('[AUTH] API /me failed:', res.status, res.statusText, 'body:', errorText.slice(0, 200));
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
        console.error('[AUTH] Failed to parse /me response:', e, 'text:', text.slice(0, 200));
        return null;
      }

      const raw = data.user ?? data; // aceita { ok, user } ou objeto direto
      let u = normalizeUser(raw);
      if (!u) {
        console.log('[AUTH] Failed to normalize user data:', raw);
        return null;
      }
      
      u = fillMissingFields(u);
      console.log('[AUTH] User loaded successfully:', u.email, 'role:', u.role, 'setor:', u.setor);
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
    
    // Check if Google OAuth is enabled first
    fetch(`${API_BASE}/api/config`, { credentials: 'include' })
      .then(res => res.json())
      .then(config => {
        console.log('[AUTH] Config loaded:', config);
        
        if (!config.googleEnabled) {
          console.warn('[AUTH] Google OAuth not enabled on server');
          // Still try to redirect, let server handle the error
        }
        
        const googleUrl = `${API_BASE}/auth/google`;
        console.log('[AUTH] Redirecting to Google OAuth:', googleUrl);
        window.location.href = googleUrl;
      })
      .catch(error => {
        console.error('[AUTH] Failed to check config:', error);
        // Fallback: try direct redirect anyway
        const googleUrl = `${API_BASE}/auth/google`;
        console.log('[AUTH] Config check failed, trying direct redirect to:', googleUrl);
        window.location.href = googleUrl;
      });
  };

  const logout = async () => {
    try {
      console.log('[AUTH] Starting logout process...');
      localStorage.removeItem(STORAGE_KEY);
      
      // Clear user state immediately
      setUser(null);
      
      // Try logout endpoint
      await fetch(`${API_BASE || ''}/auth/logout`, { 
        method: 'POST', 
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      }).catch(() => {}); // Ignore errors
      
      console.log('[AUTH] Logout requests completed');
    } catch (error) {
      console.error('[AUTH] Logout error:', error);
    }
  };

  // Handle URL parameters for login success/error
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const loginParam = urlParams.get('login');
    const errorParam = urlParams.get('error');
    
    if (loginParam === 'success') {
      console.log('[AUTH] Login success detected in URL, reloading user data...');
      // Clear the URL parameter
      window.history.replaceState({}, '', window.location.pathname);
      // Reload user data
      setTimeout(() => reload(), 100);
    } else if (errorParam) {
      console.log('[AUTH] Login error detected in URL:', errorParam);
      // The LoginPage component will handle showing the error
    }
  }, [reload]);

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
