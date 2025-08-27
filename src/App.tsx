import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './contexts/AuthContext';
import { GamificationProvider } from './contexts/GamificationContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
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
          <div className="min-h-screen bg-gray-50">
            <Routes>
              <Route path="/login" element={<LoginPage />} />
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
                path="/troca-proteina"
                element={
                  <ProtectedRoute>
                    <TrocaProteinas />
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
                  <ProtectedRoute requireAdmin>
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
                path="/aniversariantes"
                element={
                  <ProtectedRoute>
                    <Aniversariantes />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin"
                element={
                  <ProtectedRoute requireAdmin>
                    <AdminPanel />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/*"
                element={
                  <ProtectedRoute requireAdmin>
                    <AdminPanel />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/painel"
                element={
                  <ProtectedRoute>
                    <Navigate to="/admin" replace />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <Toaster position="top-right" />
          </div>
        </Router>
      </GamificationProvider>
    </AuthProvider>
  );
}

export default App;