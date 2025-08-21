import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

const API_BASE = '';

interface User {
  id: string;
  name: string;
  email: string;
  sector: string;
  setor: string;
  role: string;
  avatar?: string;
  token?: string;
}

interface AuthContextType {
  user: User | null;
  logout: () => void;
  isAuthenticated: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    setLoading(true);
    try {
      console.log('[AUTH] Starting auth check...');
      
      // Check if user is stored in localStorage first
      const storedUser = localStorage.getItem('currentUser');
      if (storedUser) {
        try {
          const userData = JSON.parse(storedUser);
          console.log('[AUTH] Found stored user:', userData.email);
          
          // Normalize user data structure for compatibility
          if (userData && userData.email) {
            // Ensure both sector and setor exist
            if (userData.sector && !userData.setor) {
              userData.setor = userData.sector;
            }
            if (userData.setor && !userData.sector) {
              userData.sector = userData.setor;
            }
            // Ensure role exists
            if (!userData.role) {
              if (userData.email === 'admin@grupocropfield.com.br' || userData.sector === 'TI' || userData.setor === 'TI') {
                userData.role = 'admin';
              } else if (userData.sector === 'RH' || userData.setor === 'RH') {
                userData.role = 'rh';
              } else {
                userData.role = 'colaborador';
              }
            }
            console.log('User data normalized:', userData);
            setUser(userData);
            setIsAuthenticated(true);
            setLoading(false);
            
            // Verify with backend that session is still valid
            try {
              const verifyResponse = await fetch('/api/me', {
                credentials: 'include'
              });
              
              if (!verifyResponse.ok) {
                console.log('[AUTH] Session expired, clearing stored user');
                localStorage.removeItem('currentUser');
                setUser(null);
                setIsAuthenticated(false);
              }
            } catch (verifyError) {
              console.log('[AUTH] Cannot verify session with backend, but keeping local auth');
            }
            
            return;
          }
        } catch (error) {
          console.error('Error parsing stored user:', error);
          localStorage.removeItem('currentUser');
        }
      }

      // Try API call as fallback
      try {
        const response = await fetch('/api/me', {
          credentials: 'include'
        });
        
        if (response.ok) {
          const responseText = await response.text();
          if (responseText) {
            try {
              const data = JSON.parse(responseText);
              // Normalize API user data
              if (data.user) {
                if (data.user.sector && !data.user.setor) {
                  data.user.setor = data.user.sector;
                }
                if (data.user.setor && !data.user.sector) {
                  data.user.sector = data.user.setor;
                }
                if (!data.user.role) {
                  if (data.user.email === 'admin@grupocropfield.com.br' || data.user.sector === 'TI' || data.user.setor === 'TI') {
                    data.user.role = 'admin';
                  } else if (data.user.sector === 'RH' || data.user.setor === 'RH') {
                    data.user.role = 'rh';
                  } else {
                    data.user.role = 'colaborador';
                  }
                }
                // Preserve token if returned by API
                if (data.token) {
                  data.user.token = data.token;
                }
                console.log('API user data normalized:', data.user);
                setUser(data.user);
                setIsAuthenticated(true);
                localStorage.setItem('currentUser', JSON.stringify(data.user));
                setLoading(false);
                return;
              }
            } catch (parseError) {
              console.error('Failed to parse auth response:', parseError);
            }
          }
        }
      } catch (apiError) {
        console.log('API not available, using local auth');
      }

      // If no stored user and API fails, user is not authenticated
      setUser(null);
      setIsAuthenticated(false);
    } catch (error) {
      console.error('Auth check error:', error);
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      // Clear localStorage first
      localStorage.removeItem('currentUser');
      
      await fetch('/auth/logout', {
        method: 'POST',
        credentials: 'include'
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      setIsAuthenticated(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        logout,
        isAuthenticated,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};