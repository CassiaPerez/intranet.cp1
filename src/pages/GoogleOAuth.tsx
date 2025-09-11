import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LoginPage as BaseLoginPage } from './LoginPage';

/**
 * Wrapper component for handling Google OAuth redirects
 * This component is used when users return from Google OAuth flow
 */
const GoogleOAuth: React.FC = () => {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  useEffect(() => {
    // Log the redirect for debugging
    console.log('[GOOGLE-OAUTH] Redirect received:', location.search);
    
    // The auth context will handle checking authentication status
    // If user is authenticated, they'll be redirected to dashboard
    // If not, they'll be redirected to login with error message
  }, [location]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Finalizando login...</h2>
            <p className="text-gray-600 text-sm">Aguarde enquanto verificamos suas credenciais.</p>
          </div>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  // If not authenticated, show login page (which will handle error display)
  return <BaseLoginPage />;
};

export default GoogleOAuth;