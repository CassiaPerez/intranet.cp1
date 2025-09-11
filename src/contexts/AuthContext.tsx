// src/contexts/AuthContext.tsx
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

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
  loginManual: (usuario: string, senha: string) => Promise<boolean>;
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
  
  console.log('[AUTH] 📊 Normalizing user data:', Object.keys(raw));
  
  const id = String(raw.id ?? '');
  const email = raw.email || `${raw.usuario}@grupocropfield.com.br`;
  const nome = raw.nome || raw.name || raw.usuario || '';
  const setor = raw.setor || raw.sector || '';
  const role = raw.role || '';
  const picture = raw.picture || raw.avatar || raw.avatar_url || '';

  if (!id) {
    console.log('[AUTH] ❌ Missing required fields - id:', !!id);
    return null;
  }

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
  console.log('[AUTH] 📝 Filling missing fields for user:', u.usuario || u.name);
  
  const role = u.role && u.role.trim()
    ? u.role
    : (u.nome?.includes('admin-ti') || u.setor === 'TI' ? 'admin' : 
       u.nome?.includes('admin-rh') || u.setor === 'RH' ? 'admin' : 'colaborador');
  
  const setor = u.setor && u.setor.trim() 
    ? u.setor 
    : (u.nome?.includes('admin-ti') ? 'TI' : 
       u.nome?.includes('admin-rh') ? 'RH' : 'Geral');
    
  console.log('[AUTH] ✅ Filled fields - role:', role, 'setor:', setor);
    
  return { ...u, role, setor, sector: setor };
}

const STORAGE_KEY = 'currentUser';

export const AuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  async function fetchMe(): Promise<User | null> {
    try {
      console.log('[AUTH] Fetching user from /api/me');
      
      const res = await fetch('/api/me', {  // Use relative path for Vite proxy
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!res.ok) {
        console.log('[AUTH] API /me failed:', res.status, res.statusText);
        return null;
      }

      const data = await res.json();
      console.log('[AUTH] /api/me response data keys:', Object.keys(data || {}));

      const raw = data; // Backend returns user data directly
      let u = normalizeUser(raw);
      if (!u) {
        console.log('[AUTH] Failed to normalize user data');
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
    console.log('[AUTH] Starting Google login redirect...');
    window.location.href = '/auth/google';
  };

  const logout = async () => {
    try {
      console.log('[AUTH] Starting logout process...');
      localStorage.removeItem(STORAGE_KEY);
      
      // Clear user state immediately
      setUser(null);
      
      // Try logout endpoint
      await fetch('/api/logout', { 
        method: 'POST', 
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      }).catch(() => {}); // Ignore errors
      
      console.log('[AUTH] Logout requests completed');
    } catch (error) {
      console.error('[AUTH] Logout error:', error);
    }
  };

  const loginManual = async (username: string, password: string): Promise<boolean> => {
    try {
      console.log('[AUTH] 🔐 Starting manual login for usuario:', username);
      
      // Validate inputs
      const usuarioTrimmed = String(username || '').trim();
      const senhaTrimmed = String(password || '').trim();
      
      console.log('[AUTH] 📝 Login validation:');
      console.log('   Usuario provided:', !!usuarioTrimmed);
      console.log('   Password provided:', !!senhaTrimmed);
      
      if (!usuarioTrimmed || !senhaTrimmed) {
        console.log('[AUTH] ❌ Missing credentials');
        return false;
      }
      
      const response = await fetch('/api/login-admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ 
          usuario: usuarioTrimmed, 
          senha: senhaTrimmed 
        })
      });

      console.log('[AUTH] 📡 Login response status:', response.status);
      console.log('[AUTH] 📡 Login response headers:', Object.fromEntries(response.headers.entries()));
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.error('[AUTH] ❌ Login failed:');
        console.error('   Status:', response.status);
        console.error('   Status Text:', response.statusText);
        console.error('   Response Body:', errorText);
        
        try {
          const errorData = JSON.parse(errorText);
          console.error('   Parsed Error:', errorData.error);
        } catch {
          console.error('   Raw Response:', errorText);
        }
        
        return false;
      }

      const data = await response.json();
      console.log('[AUTH] ✅ Login success! Response data:');
      console.log('   Keys:', Object.keys(data || {}));
      console.log('   Usuario:', data.usuario);
      console.log('   Setor:', data.setor);
      console.log('   Role:', data.role);
      console.log('   Has Token:', !!data.token);
      
      const u = normalizeUser(data);
      
      if (u) {
        const filledUser = fillMissingFields(u);
        setUser(filledUser);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filledUser));
        console.log('[AUTH] ✅ User context updated successfully');
        return true;
      }
      
      console.log('[AUTH] ❌ Failed to normalize user data:', data);
      return false;
    } catch (error) {
      console.error('[AUTH] ❌ Network/fetch error:', error.message);
      return false;
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
  }, []);

  const value = useMemo<AuthContextType>(() => ({
    user,
    isAuthenticated: !!user,
    loading,
    loginWithGoogle,
    loginManual,
    reload,
    logout
  }), [user, loading, loginManual]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
