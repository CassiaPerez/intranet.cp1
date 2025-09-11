import React, { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, User, Lock, Chrome } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

export const LoginPage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState(''); // Changed from username to email
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Handle URL parameters for errors and success
  React.useEffect(() => {
    const error = searchParams.get('error');
    const login = searchParams.get('login');
    
    if (error) {
      // Decode the error message
      const decodedError = decodeURIComponent(error);
      
      if (error === 'google_auth_failed') {
        toast.error('Falha na autenticação com Google. Tente novamente.');
      } else if (error === 'authentication_failed') {
        toast.error('Usuário não encontrado ou não autorizado.');
      } else if (error === 'google_not_configured') {
        toast.error('Login com Google não está configurado. Use email e senha.');
      } else if (decodedError.includes('não está autorizado')) {
        toast.error('Seu email não está autorizado no sistema. Contate o administrador.');
      } else {
        toast.error(`Erro de autenticação: ${decodedError}`);
      }
    }
    
    if (login === 'success') {
      toast.success('Login realizado com sucesso!');
      // Clear the URL parameter
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [searchParams]);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleGoogleLogin = () => {
    console.log('[LOGIN] Iniciando login Google...');
    
    // Check if Google OAuth is enabled and get proper URLs
    fetch(`${API_BASE || ''}/api/config`, { credentials: 'include' })
      .then(res => res.json())
      .then(config => {
        console.log('[LOGIN] Server config:', config);
        
        if (!config.googleEnabled) {
          console.log('[LOGIN] Google OAuth not enabled on server');
          toast.error('Login com Google não está configurado. Use email e senha.');
          return;
        }
        
        const googleUrl = `${API_BASE || ''}/auth/google`;
        console.log('[LOGIN] Redirecting to Google OAuth:', googleUrl);
        window.location.href = googleUrl;
      })
      .catch(error => {
        // Fallback: try direct redirect
        console.error('[LOGIN] Config check failed:', error);
        console.log('[LOGIN] Trying direct redirect anyway...');
        
        const googleUrl = `${API_BASE || ''}/auth/google`;
        console.log('[LOGIN] Direct redirect to:', googleUrl);
        window.location.href = googleUrl;
      });
  };

  const handleManualLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) { // Changed from username to email
      toast.error('Preencha todos os campos!');
      return;
    }

    setLoading(true);
    
    try {
      console.log('[LOGIN] Tentando login manual para:', email);
      
      // Try both endpoints to ensure compatibility
      const endpoints = [
        `${API_BASE || ''}/auth/login`,
        `${API_BASE || ''}/api/auth/login`
      ];
      
      let response = null;
      let lastError = null;
      
      for (const endpoint of endpoints) {
        try {
          console.log('[LOGIN] Trying endpoint:', endpoint);
          response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({ email, password }),
          });
          
          if (response.ok) {
            console.log('[LOGIN] Login successful via:', endpoint);
            break;
          } else {
            console.log('[LOGIN] Login failed via:', endpoint, 'status:', response.status);
            lastError = await response.json().catch(() => ({ error: 'Unknown error' }));
          }
        } catch (error) {
          console.log('[LOGIN] Network error with endpoint:', endpoint, error);
          lastError = { error: 'Network error' };
        }
      }
      
      if (!response || !response.ok) {
        console.log('[LOGIN] All endpoints failed, last error:', lastError);
        toast.error(lastError?.error || 'Erro de conexão. Verifique se o servidor está rodando.');
        return;
      }

      const data = await response.json();
      console.log('[LOGIN] Login response:', { 
        success: !!data.user, 
        userEmail: data.user?.email,
        userRole: data.user?.role 
      });
      
      // Store user data in localStorage for immediate access
      if (data.user) {
        localStorage.setItem('currentUser', JSON.stringify(data.user));
      }
      
      toast.success('Login realizado com sucesso!');
      
      // Force reload to update auth context
      setTimeout(() => {
        window.location.href = '/';
      }, 500);
      
    } catch (error) {
      console.error('Login error:', error);
      toast.error('Erro de conexão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <span className="text-white font-bold text-2xl">GC</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Bem-vindo!</h1>
            <p className="text-gray-600">Faça login para acessar a Intranet</p>
          </div>

          {/* Google Login */}
          <button
            onClick={handleGoogleLogin}
            className="w-full mb-6 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center space-x-3"
          >
            <Chrome className="w-5 h-5" />
            <span className="font-medium">Entrar com Google</span>
          </button>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">ou</span>
            </div>
          </div>

          {/* Manual Login Form */}
          <form onSubmit={handleManualLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="email" // Changed type to email
                  value={email} // Changed from username to email
                  onChange={(e) => setEmail(e.target.value)} // Changed from setUsername to setEmail
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Digite seu email" // Changed placeholder
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Digite sua senha"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              <strong>Contas de Teste:</strong><br />
              <strong>Admin:</strong> <code>admin@grupocropfield.com.br / admin123</code><br />
              <span className="text-xs text-gray-500">
                RH: <code>rh@grupocropfield.com.br / rh123</code> | Moderador: <code>moderador@grupocropfield.com.br / mod123</code><br />
                Colaborador: <code>colaborador@grupocropfield.com.br / colab123</code>
              </span>
            </p>
            
            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-xs text-blue-700">
                💡 <strong>Para login com Google:</strong> Entre em contato com o administrador para autorizar seu email corporativo no sistema.
              </p>
            </div>
            
            <div className="mt-2 p-2 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-600">
                🔧 <strong>Desenvolvimento:</strong> Para configurar Google OAuth, execute <code>npm run setup-oauth</code>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};