import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

/**
 * Wrapper component for handling Google OAuth redirects
 * This component is used when users return from Google OAuth flow
 */
const GoogleOAuth: React.FC = () => {
  const { isAuthenticated, loading, reload } = useAuth();
  const location = useLocation();

  useEffect(() => {
    // Log the redirect for debugging
    console.log('[GOOGLE-OAUTH] Redirect received:', location.search, location.pathname);
    
    // Force reload on callback
    if (!isAuthenticated && !loading) {
      console.log('[GOOGLE-OAUTH] Not authenticated yet, forcing reload...');
      setTimeout(() => reload(), 500);
    }
  }, [location, isAuthenticated, loading, reload]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4">
          <div className="text-center">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <span className="text-white font-bold text-2xl">GC</span>
            </div>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Finalizando login...</h2>
            <p className="text-gray-600 text-sm">Aguarde enquanto verificamos suas credenciais do Google.</p>
          </div>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    console.log('[GOOGLE-OAUTH] User authenticated, redirecting to dashboard');
    return <Navigate to="/" replace />;
  }

  // If not authenticated, redirect to login page with error handling
  console.log('[GOOGLE-OAUTH] Not authenticated, redirecting to login');
  return <Navigate to={`/login${location.search}`} replace />;
};

export default GoogleOAuth;