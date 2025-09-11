import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

export const DebugInfo: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  const [showDebug, setShowDebug] = useState(false);
  const [systemInfo, setSystemInfo] = useState<any>(null);

  useEffect(() => {
    // Show debug in development mode
    if (import.meta.env.DEV) {
      setShowDebug(true);
    }
    
    // Load system info
    fetch('/api/config', { credentials: 'include' })
      .then(res => res.json())
      .then(setSystemInfo)
      .catch(() => setSystemInfo({ error: 'Config not available' }));
  }, []);

  if (!showDebug) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-black bg-opacity-80 text-white p-4 rounded-lg text-xs max-w-sm">
      <div className="font-bold mb-2">Debug Info (Dev Only)</div>
      <div className="space-y-1">
        <div>Auth: {isAuthenticated ? '✅' : '❌'}</div>
        <div>User: {user?.email || 'None'}</div>
        <div>Role: {user?.role || 'None'}</div>
        <div>Sector: {user?.setor || 'None'}</div>
        <div>Google OAuth: {systemInfo?.googleEnabled ? '✅' : '❌'}</div>
        <div>Environment: {systemInfo?.environment || 'Unknown'}</div>
        <div>API Base: {import.meta.env.VITE_API_URL || 'Proxy'}</div>
      </div>
    </div>
  );
};