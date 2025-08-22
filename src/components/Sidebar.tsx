import React, { useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Calendar, Megaphone, Monitor, Shield, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { isPrivileged } from './ProtectedRoute';

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<any>;
  adminOnly?: boolean;
};

const BASE_NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: Home },
  { to: '/reservas', label: 'Reservas', icon: Calendar },
  { to: '/mural', label: 'Mural', icon: Megaphone },
  { to: '/equipamentos', label: 'Equipamentos', icon: Monitor },        // <- SEM adminOnly
  { to: '/admin', label: 'Admin', icon: Shield, adminOnly: true },
  { to: '/admin/usuarios', label: 'Usuários', icon: Users, adminOnly: true },
];

export default function Sidebar() {
  const { user, loading } = useAuth();

  // Enquanto carregando, evita filtrar errado
  const items = useMemo(() => {
    if (loading) return [];
    const privileged = isPrivileged(user);

    // regra: sempre incluir /equipamentos, filtrar demais por adminOnly
    return BASE_NAV.filter((item) => {
      if (item.to === '/equipamentos') return true;     // força visível a todos os logados
      if (item.adminOnly) return privileged;
      return true;
    });
  }, [user, loading]);

  return (
    <aside className="p-3 w-64 border-r min-h-screen bg-white">
      <div className="text-lg font-semibold mb-4 px-2">Intranet</div>
      <nav className="space-y-1">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-100 transition ${
                isActive ? 'bg-gray-100 font-medium' : ''
              }`
            }
          >
            <Icon className="w-5 h-5" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
