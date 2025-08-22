import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function isPrivileged(user: any) {
  const role = user?.role?.toLowerCase?.() || '';
  const setor = (user?.sector || user?.setor || '').toString().toUpperCase();
  return role === 'admin' || role === 'moderador' || role === 'rh' || setor === 'TI' || setor === 'RH';
}

export default function ProtectedRoute({
  children,
  adminOnly = false,
}: {
  children: React.ReactNode;
  adminOnly?: boolean;
}) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return null; // ou um spinner/skeleton

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (adminOnly && !isPrivileged(user)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
