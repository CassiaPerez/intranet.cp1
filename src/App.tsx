import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './contexts/AuthContext';
import { GamificationProvider } from './contexts/GamificationContext';
import { ProtectedRoute } from './components/ProtectedRoute';

import { LoginPage } from './pages/LoginPage';
import GoogleOAuth from './pages/GoogleOAuth';
import { Dashboard } from './pages/Dashboard';
import { ReservaSalas } from './pages/ReservaSalas';
import { Cardapio } from './pages/Cardapio';
import { Diretorio } from './pages/Diretorio';
import { Equipamentos } from './pages/Equipamentos';
import { Mural } from './pages/Mural';
import { AdminPanel } from './pages/AdminPanel';
import { TrocaProteinas } from './pages/TrocaProteinas';
import { Aniversariantes } from './pages/Aniversariantes';

import './index.css';

function App() {
  return (
    <AuthProvider>
      <GamificationProvider>
        <Router>
          <Toaster />
          <Routes>
            {/* Público */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/login-google" element={<GoogleOAuth />} />

            {/* Protegido */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reservas"
              element={
                <ProtectedRoute>
                  <ReservaSalas />
                </ProtectedRoute>
              }
            />
            <Route
              path="/cardapio"
              element={
                <ProtectedRoute>
                  <Cardapio />
                </ProtectedRoute>
              }
            />
            <Route
              path="/diretorio"
              element={
                <ProtectedRoute>
                  <Diretorio />
                </ProtectedRoute>
              }
            />
            <Route
              path="/equipamentos"
              element={
                <ProtectedRoute>
                  <Equipamentos />
                </ProtectedRoute>
              }
            />
            <Route
              path="/mural"
              element={
                <ProtectedRoute>
                  <Mural />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/*"
              element={
                <ProtectedRoute requiredRoles={['admin-ti','admin-rh']}>
                  <AdminPanel />
                </ProtectedRoute>
              }
            />
            <Route
              path="/troca-proteinas"
              element={
                <ProtectedRoute>
                  <TrocaProteinas />
                </ProtectedRoute>
              }
            />
            <Route
              path="/aniversariantes"
              element={
                <ProtectedRoute>
                  <Aniversariantes />
                </ProtectedRoute>
              }
            />

            {/* Fallback → login (evita loop) */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </Router>
      </GamificationProvider>
    </AuthProvider>
  );
}

export default App;
