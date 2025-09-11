import React from 'react';
import { Bell, Search, LogOut } from 'lucide-react';
      console.log('[HEADER] Initiating logout...');
      await logout();
      
      // Force navigation to login page
      setTimeout(() => {
        window.location.href = '/login';
      }, 100);
import { useGamification } from '../contexts/GamificationContext';

export const Header: React.FC = () => {
      // Even if logout fails, redirect to login
      setTimeout(() => {
        window.location.href = '/login';
      }, 100);
  const { user, logout } = useAuth();
  const { userStats } = useGamification();

  return (
    <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex-1 max-w-lg">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Pesquisar na intranet..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <ChatBot />
          
          <button className="relative p-2 text-gray-400 hover:text-gray-600 transition-colors">
            <Bell className="w-5 h-5" />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full"></span>
          </button>

          <div className="flex items-center space-x-3">
            <img
              src={user?.avatar || 'https://images.pexels.com/photos/771742/pexels-photo-771742.jpeg?w=150'}
              alt={user?.name || 'Usuário'}
              className="w-8 h-8 rounded-full object-cover"
            />
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-700">{user?.name || 'Usuário'}</span>
              <span className="text-xs text-gray-500">{userStats?.totalPoints || 0} pts • Nível {userStats?.level || 1}</span>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="p-2 text-gray-400 hover:text-red-600 transition-colors"
            title="Sair"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
};