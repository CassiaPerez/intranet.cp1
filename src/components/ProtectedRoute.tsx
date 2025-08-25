import React, { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  children: ReactNode;
  requireAdmin?: boolean;              // compat com seu código atual
  allowedRoles?: string[];             // novo: use para rotas específicas (ex.: ['ti','admin'])
}

const ADMIN_ROLES = ['admin', 'moderador', 'ti', 'rh'];

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children,
  requireAdmin = false,
  allowedRoles
}) => {
  const { isAuthenticated, loading, user } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Normaliza papel do usuário
  const role = String(user?.role || user?.setor || user?.sector || '').toLowerCase();

  // Modo legado: requireAdmin
  if (requireAdmin) {
    const isAdmin = !!user && (
      ADMIN_ROLES.includes(role) ||
      user?.email === 'admin@grupocropfield.com.br'
    );

    if (!isAdmin) {
      console.warn('[ProtectedRoute] Bloqueado por requireAdmin. user=', user);
      return <Navigate to="/" replace />;
    }
  }

  // Novo modo: allowedRoles
  if (allowedRoles && allowedRoles.length > 0) {
    const ok = allowedRoles.map(r => r.toLowerCase()).includes(role);
    if (!ok) {
      console.warn('[ProtectedRoute] Bloqueado por allowedRoles:', allowedRoles, 'user.role=', role);
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
};
