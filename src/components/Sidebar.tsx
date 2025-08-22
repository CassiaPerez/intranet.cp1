import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  Home, 
  Calendar, 
  UtensilsCrossed, 
  Cake,
  RefreshCw,
  Users, 
  Monitor, 
  MessageSquare,
  Settings 
} from 'lucide-react';

type NavItem = { 
  to: string; 
  label: string; 
  icon: React.ComponentType<any>;
  adminOnly?: boolean; 
};

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: Home },
  { to: '/reservas', label: 'Reservas', icon: Calendar },
  { to: '/cardapio', label: 'Cardápio', icon: UtensilsCrossed },
  { to: '/aniversariantes', label: 'Aniversariantes', icon: Cake },
  { to: '/troca-proteina', label: 'Troca de Proteínas', icon: RefreshCw },
  { to: '/diretorio', label: 'Contatos', icon: Users },
  { to: '/equipamentos', label: 'Equipamentos', icon: Monitor, adminOnly: true },
  { to: '/mural', label: 'Mural', icon: MessageSquare },
  { to: '/admin', label: 'Painel Admin', icon: Settings, adminOnly: true },
];

function SidebarImpl() {
  const { user } = useAuth();
  
  // Debug user data
  console.log('Sidebar user data:', user);
  
  // Simplified admin check - if any admin indicator is true
  const isAdmin = !!user && (
    user.role === 'admin' ||
    user.role === 'moderador' ||
    user.email === 'admin@grupocropfield.com.br' ||
    user.sector === 'TI' || 
    user.sector === 'RH' ||
    user.setor === 'TI' ||
    user.setor === 'RH' ||
    user.role === 'rh' ||
    user.role === 'ti'
  );
  
  console.log('Is admin:', isAdmin, 'User role:', user?.role, 'User sector:', user?.sector, 'User setor:', user?.setor);

  return (
    <aside className="w-64 min-h-screen border-r bg-white shadow-sm">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg">GC</span>
          </div>
          <div>
            <div className="font-bold text-gray-900">Intranet</div>
            <div className="text-xs text-gray-500 truncate">{user?.name || 'Visitante'}</div>
          </div>
        </div>
      </div>
      
      <nav className="flex flex-col p-4 space-y-1">
        {NAV.filter(item => {
          // Painel Admin: APENAS para admins
          if (item.to === '/admin') {
            return isAdmin;
          }
          // Outros itens adminOnly: para admin/rh/ti
          if (item.adminOnly) {
            return isAdmin;
          }
          // Itens normais: para todos
          return true;
        }).map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center space-x-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive 
                  ? 'bg-blue-600 text-white' 
                  : 'text-gray-700 hover:bg-gray-100'
              }`
            }
          >
            <item.icon className="w-4 h-4" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Botão "Sair" removido */}
    </aside>
  );
}

const Sidebar = SidebarImpl;
export { Sidebar };
export default Sidebar;
