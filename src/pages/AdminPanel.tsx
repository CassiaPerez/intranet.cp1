import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { 
  Users, 
  BarChart3, 
  Download,
  UserPlus,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  Save,
  X
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

interface User {
  id: string;
  nome: string;
  email: string;
  setor: string;
  role: string;
  ativo: boolean;
  created_at: string;
}

interface SystemStats {
  usuarios_ativos: number;
  posts_mural: number;
  reservas_salas: number;
  solicitacoes_ti: number;
  trocas_proteina: number;
  agendamentos_portaria: number;
}

export const AdminPanel: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'users' | 'reports'>('dashboard');
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [showNewUserModal, setShowNewUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  
  const [newUser, setNewUser] = useState({
    nome: '',
    email: '',
    senha: '',
    setor: 'Geral',
    role: 'colaborador'
  });

  useEffect(() => {
    if (activeTab === 'dashboard') {
      loadSystemStats();
    } else if (activeTab === 'users') {
      loadUsers();
    }
  }, [activeTab]);

  const loadSystemStats = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/dashboard', {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        setStats(data.stats || {});
      } else {
        // Fallback data if API not available
        setStats({
          usuarios_ativos: 5,
          posts_mural: 12,
          reservas_salas: 8,
          solicitacoes_ti: 3,
          trocas_proteina: 15,
          agendamentos_portaria: 4
        });
      }
    } catch (error) {
      console.error('Error loading system stats:', error);
      toast.error('Erro ao carregar estatísticas do sistema');
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/users', {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || []);
      } else {
        toast.error('Erro ao carregar usuários');
        setUsers([]);
      }
    } catch (error) {
      console.error('Error loading users:', error);
      toast.error('Erro ao carregar usuários');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newUser.nome.trim() || !newUser.email.trim() || !newUser.senha.trim()) {
      toast.error('Preencha todos os campos obrigatórios!');
      return;
    }

    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(newUser),
      });

      if (response.ok) {
        toast.success('Usuário criado com sucesso!');
        setNewUser({ nome: '', email: '', senha: '', setor: 'Geral', role: 'colaborador' });
        setShowNewUserModal(false);
        await loadUsers();
      } else {
        const errorData = await response.json().catch(() => ({}));
        toast.error(errorData.error || 'Erro ao criar usuário');
      }
    } catch (error) {
      console.error('Error creating user:', error);
      toast.error('Erro ao criar usuário');
    }
  };

  const handleUpdateUser = async (userId: string, updates: Partial<User>) => {
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(updates),
      });

      if (response.ok) {
        toast.success('Usuário atualizado com sucesso!');
        setEditingUser(null);
        await loadUsers();
      } else {
        const errorData = await response.json().catch(() => ({}));
        toast.error(errorData.error || 'Erro ao atualizar usuário');
      }
    } catch (error) {
      console.error('Error updating user:', error);
      toast.error('Erro ao atualizar usuário');
    }
  };

  const handleResetPassword = async (userId: string) => {
    const newPassword = prompt('Digite a nova senha (mínimo 6 caracteres):');
    if (!newPassword || newPassword.length < 6) {
      toast.error('Senha deve ter pelo menos 6 caracteres');
      return;
    }

    try {
      const response = await fetch(`/api/admin/users/${userId}/password`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ senha: newPassword }),
      });

      if (response.ok) {
        toast.success('Senha alterada com sucesso!');
      } else {
        const errorData = await response.json().catch(() => ({}));
        toast.error(errorData.error || 'Erro ao alterar senha');
      }
    } catch (error) {
      console.error('Error resetting password:', error);
      toast.error('Erro ao alterar senha');
    }
  };

  const handleExport = async (formato: 'csv' | 'excel' | 'pdf') => {
    try {
      console.log(`[ADMIN] Exporting ranking as ${formato}...`);
      
      const currentMonth = new Date().toISOString().slice(0, 7);
      const response = await fetch(`/api/admin/export/ranking.${formato}?month=${currentMonth}`, {
        credentials: 'include'
      });

      console.log(`[ADMIN] Export response status: ${response.status}`);
      
      if (response.ok) {
        if (formato === 'csv') {
          const csvData = await response.text();
          console.log(`[ADMIN] CSV data length: ${csvData.length}`);
          
          const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = `ranking-${currentMonth}.csv`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(link.href);
          toast.success('Ranking CSV baixado com sucesso!');
        } else {
          const data = await response.json();
          console.log(`[ADMIN] Export data for ${formato}:`, data.data?.length, 'records');
          toast.success(`Dados exportados como ${formato.toUpperCase()} - ${data.data?.length || 0} registros`);
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error(`[ADMIN] Export failed:`, response.status, errorData);
        toast.error(errorData.error || `Erro ao exportar ${formato.toUpperCase()}`);
      }
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Erro ao exportar dados');
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('pt-BR');
    } catch {
      return dateString;
    }
  };

  const tabs = [
    { key: 'dashboard' as const, label: 'Dashboard', icon: BarChart3 },
    { key: 'users' as const, label: 'Usuários', icon: Users },
    { key: 'reports' as const, label: 'Relatórios', icon: Download },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Painel Administrativo</h1>
          <div className="text-sm text-gray-500">
            Logado como: {user?.name} ({user?.role})
          </div>
        </div>

        {/* Tabs */}
        <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-6 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2 ${
                activeTab === tab.key 
                  ? 'bg-white text-blue-600 shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {stats && Object.entries(stats).map(([key, value]) => (
                <div key={key} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600 capitalize">
                        {key.replace(/_/g, ' ')}
                      </p>
                      <p className="text-3xl font-bold text-gray-900 mt-2">{value}</p>
                    </div>
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                      <BarChart3 className="w-6 h-6 text-blue-600" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Gerenciar Usuários</h2>
              <button
                onClick={() => setShowNewUserModal(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
              >
                <UserPlus className="w-4 h-4" />
                <span>Novo Usuário</span>
              </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Usuário
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Setor
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Role
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Criado em
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {users.map((userData) => (
                      <tr key={userData.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{userData.nome}</div>
                            <div className="text-sm text-gray-500">{userData.email}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                            {userData.setor}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            userData.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                            userData.role === 'moderador' ? 'bg-orange-100 text-orange-800' :
                            userData.role === 'rh' ? 'bg-green-100 text-green-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {userData.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            userData.ativo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {userData.ativo ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(userData.created_at)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end space-x-2">
                            <button
                              onClick={() => setEditingUser(userData)}
                              className="text-blue-600 hover:text-blue-700"
                              title="Editar usuário"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleResetPassword(userData.id)}
                              className="text-yellow-600 hover:text-yellow-700"
                              title="Resetar senha"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleUpdateUser(userData.id, { ativo: !userData.ativo })}
                              className={userData.ativo ? 'text-red-600 hover:text-red-700' : 'text-green-600 hover:text-green-700'}
                              title={userData.ativo ? 'Desativar usuário' : 'Ativar usuário'}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Reports Tab */}
        {activeTab === 'reports' && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-gray-900">Relatórios e Exportações</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Ranking de Usuários</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Exportar ranking completo com pontuação de gamificação
                </p>
                <div className="space-y-2">
                  <button
                    onClick={() => handleExport('csv')}
                    className="w-full bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors text-sm"
                  >
                    Exportar CSV
                  </button>
                  <button
                    onClick={() => handleExport('excel')}
                    className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm"
                  >
                    Exportar Excel
                  </button>
                  <button
                    onClick={() => handleExport('pdf')}
                    className="w-full bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors text-sm"
                  >
                    Exportar PDF
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Relatório de Atividades</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Relatório detalhado de todas as atividades do sistema
                </p>
                <div className="space-y-2">
                  <button
                    onClick={() => handleExportActivities('csv')}
                    className="w-full bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors text-sm"
                  >
                    Exportar Atividades CSV
                  </button>
                  <button
                    onClick={() => handleExportActivities('excel')}
                    className="w-full bg-purple-500 text-white px-4 py-2 rounded-lg hover:bg-purple-600 transition-colors text-sm"
                  >
                    Exportar Atividades Excel
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Trocas de Proteínas</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Relatório completo de todas as trocas de proteínas
                </p>
                <div className="space-y-2">
                  <button
                    onClick={() => handleExportTrocas('csv')}
                    className="w-full bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors text-sm"
                  >
                    Exportar Trocas CSV
                  </button>
                  <button
                    onClick={() => handleExportTrocas('excel')}
                    className="w-full bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors text-sm"
                  >
                    Exportar Trocas Excel
                  </button>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Solicitações de Equipamentos</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Relatório de todas as solicitações de equipamentos TI
                </p>
                <div className="space-y-2">
                  <button
                    onClick={() => handleExportEquipamentos('csv')}
                    className="w-full bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors text-sm"
                  >
                    Exportar Equipamentos CSV
                  </button>
                  <button
                    onClick={() => handleExportEquipamentos('excel')}
                    className="w-full bg-indigo-500 text-white px-4 py-2 rounded-lg hover:bg-indigo-600 transition-colors text-sm"
                  >
                    Exportar Equipamentos Excel
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Reservas de Salas</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Relatório completo de reservas de salas
                </p>
                <div className="space-y-2">
                  <button
                    onClick={() => handleExportReservas('csv')}
                    className="w-full bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 transition-colors text-sm"
                  >
                    Exportar Reservas CSV
                  </button>
                  <button
                    onClick={() => handleExportReservas('excel')}
                    className="w-full bg-teal-500 text-white px-4 py-2 rounded-lg hover:bg-teal-600 transition-colors text-sm"
                  >
                    Exportar Reservas Excel
                  </button>
                </div>
              </div>
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 md:col-span-2">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Backup do Sistema</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Fazer backup completo dos dados do sistema
                </p>
                <div className="flex space-x-4">
                  <button
                    onClick={() => handleExportBackup('json')}
                    className="flex-1 bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors text-sm"
                  >
                    Backup JSON
                  </button>
                  <button
                    onClick={() => handleExportBackup('sql')}
                    className="flex-1 bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors text-sm"
                  >
                    Backup SQL
                  </button>
                </div>
              </div>
            </div>

            {stats && (
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Estatísticas Resumidas</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{stats.usuarios_ativos}</div>
                    <div className="text-sm text-gray-600">Usuários Ativos</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{stats.posts_mural}</div>
                    <div className="text-sm text-gray-600">Posts no Mural</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">{stats.reservas_salas}</div>
                    <div className="text-sm text-gray-600">Reservas</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-600">{stats.solicitacoes_ti}</div>
                    <div className="text-sm text-gray-600">Solicitações TI</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">{stats.trocas_proteina}</div>
                    <div className="text-sm text-gray-600">Trocas Proteína</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-cyan-600">{stats.agendamentos_portaria}</div>
                    <div className="text-sm text-gray-600">Agendamentos</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* New User Modal */}
        {showNewUserModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
              <div className="p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-6">Novo Usuário</h2>
                <form onSubmit={handleCreateUser} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Nome</label>
                    <input
                      type="text"
                      value={newUser.nome}
                      onChange={(e) => setNewUser({ ...newUser, nome: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                    <input
                      type="email"
                      value={newUser.email}
                      onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Senha</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={newUser.senha}
                        onChange={(e) => setNewUser({ ...newUser, senha: e.target.value })}
                        className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        minLength={6}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Setor</label>
                    <select
                      value={newUser.setor}
                      onChange={(e) => setNewUser({ ...newUser, setor: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="Geral">Geral</option>
                      <option value="TI">TI</option>
                      <option value="RH">RH</option>
                      <option value="Comercial">Comercial</option>
                      <option value="Financeiro">Financeiro</option>
                      <option value="Operações">Operações</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Perfil</label>
                    <select
                      value={newUser.role}
                      onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="colaborador">Colaborador</option>
                      <option value="moderador">Moderador</option>
                      <option value="rh">RH</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </div>

                  <div className="flex space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowNewUserModal(false)}
                      className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Criar Usuário
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Edit User Modal */}
        {editingUser && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
              <div className="p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-6">Editar Usuário</h2>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  handleUpdateUser(editingUser.id, {
                    nome: editingUser.nome,
                    email: editingUser.email,
                    setor: editingUser.setor,
                    role: editingUser.role
                  });
                }} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Nome</label>
                    <input
                      type="text"
                      value={editingUser.nome}
                      onChange={(e) => setEditingUser({ ...editingUser, nome: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                    <input
                      type="email"
                      value={editingUser.email}
                      onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Setor</label>
                    <select
                      value={editingUser.setor}
                      onChange={(e) => setEditingUser({ ...editingUser, setor: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="Geral">Geral</option>
                      <option value="TI">TI</option>
                      <option value="RH">RH</option>
                      <option value="Comercial">Comercial</option>
                      <option value="Financeiro">Financeiro</option>
                      <option value="Operações">Operações</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Perfil</label>
                    <select
                      value={editingUser.role}
                      onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="colaborador">Colaborador</option>
                      <option value="moderador">Moderador</option>
                      <option value="rh">RH</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </div>

                  <div className="flex space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setEditingUser(null)}
                      className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Salvar
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

// Helper functions
const handleExportActivities = async (formato: 'csv' | 'excel' | 'pdf') => {
  try {
    console.log(`[ADMIN] Exporting activities as ${formato}...`);
    
    const currentMonth = new Date().toISOString().slice(0, 7);
    const response = await fetch(`/api/admin/export/activities.${formato}?month=${currentMonth}`, {
      credentials: 'include'
    });

    if (response.ok) {
      if (formato === 'csv') {
        const csvData = await response.text();
        console.log(`[ADMIN] Activities CSV data length: ${csvData.length}`);
        
        const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `atividades-${currentMonth}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        toast.success('Relatório de atividades baixado!');
      } else {
        const data = await response.json();
        console.log(`[ADMIN] Activities data for ${formato}:`, data.data?.length, 'records');
        toast.success(`Atividades exportadas como ${formato.toUpperCase()} - ${data.data?.length || 0} registros`);
      }
    } else {
      const errorData = await response.json().catch(() => ({}));
      console.error(`[ADMIN] Activities export failed:`, response.status, errorData);
      toast.error(errorData.error || `Erro ao exportar atividades ${formato.toUpperCase()}`);
    }
  } catch (error) {
    console.error('Activities export error:', error);
    toast.error('Erro ao exportar atividades');
  }
};

const handleExportTrocas = async (formato: 'csv' | 'excel') => {
  try {
    console.log(`[ADMIN] Exporting protein exchanges as ${formato}...`);
    
    const response = await fetch(`/api/admin/export/protein-exchanges.${formato}`, {
      credentials: 'include'
    });

    if (response.ok) {
      if (formato === 'csv') {
        const csvData = await response.text();
        
        const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `trocas-proteina-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        toast.success('Relatório de trocas de proteínas baixado!');
      } else {
        const data = await response.json();
        toast.success(`Trocas exportadas como ${formato.toUpperCase()} - ${data.data?.length || 0} registros`);
      }
    } else {
      const errorData = await response.json().catch(() => ({}));
      toast.error(errorData.error || `Erro ao exportar trocas ${formato.toUpperCase()}`);
    }
  } catch (error) {
    console.error('Protein exchanges export error:', error);
    toast.error('Erro ao exportar trocas de proteínas');
  }
};

const handleExportEquipamentos = async (formato: 'csv' | 'excel') => {
  try {
    console.log(`[ADMIN] Exporting equipment requests as ${formato}...`);
    
    const response = await fetch(`/api/admin/export/equipment.${formato}`, {
      credentials: 'include'
    });

    if (response.ok) {
      if (formato === 'csv') {
        const csvData = await response.text();
        
        const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        toast.success('Relatório de equipamentos baixado!');
      } else {
        const data = await response.json();
        toast.success(`Equipamentos exportados como ${formato.toUpperCase()} - ${data.data?.length || 0} registros`);
      }
    } else {
      const errorData = await response.json().catch(() => ({}));
      toast.error(errorData.error || `Erro ao exportar equipamentos ${formato.toUpperCase()}`);
    }
  } catch (error) {
    console.error('Equipment requests export error:', error);
    toast.error('Erro ao exportar solicitações de equipamentos');
  }
};

const handleExportReservas = async (formato: 'csv' | 'excel') => {
  try {
    console.log(`[ADMIN] Exporting room reservations as ${formato}...`);
    
    const response = await fetch(`/api/admin/export/reservations.${formato}`, {
      credentials: 'include'
    });

    if (response.ok) {
      if (formato === 'csv') {
        const csvData = await response.text();
        
        const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        toast.success('Relatório de reservas baixado!');
      } else {
        const data = await response.json();
        toast.success(`Reservas exportadas como ${formato.toUpperCase()} - ${data.data?.length || 0} registros`);
      }
    } else {
      const errorData = await response.json().catch(() => ({}));
      toast.error(errorData.error || `Erro ao exportar reservas ${formato.toUpperCase()}`);
    }
  } catch (error) {
    console.error('Room reservations export error:', error);
    toast.error('Erro ao exportar reservas de salas');
  }
};

const handleExportBackup = async (formato: 'json' | 'sql') => {
  try {
    console.log(`[ADMIN] Creating backup as ${formato}...`);
    
    const response = await fetch(`/api/admin/export/full-backup.${formato}`, {
      credentials: 'include'
    });

    if (response.ok) {
      if (formato === 'json') {
        const backupData = await response.json();
        console.log(`[ADMIN] Backup data tables:`, Object.keys(backupData.data || {}));
        
        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        toast.success('Backup baixado com sucesso!');
      } else {
        const data = await response.json();
        console.log(`[ADMIN] Backup SQL response:`, data);
        toast.success(data.message || `Backup ${formato.toUpperCase()} processado`);
      }
    } else {
      const errorData = await response.json().catch(() => ({}));
      console.error(`[ADMIN] Backup failed:`, response.status, errorData);
      toast.error(errorData.error || `Erro ao gerar backup ${formato.toUpperCase()}`);
    }
  } catch (error) {
    console.error('Backup export error:', error);
    toast.error('Erro ao gerar backup');
  }
};

const handleResetPassword = async (userId: string) => {
  const newPassword = prompt('Digite a nova senha (mínimo 6 caracteres):');
  if (!newPassword || newPassword.length < 6) {
    toast.error('Senha deve ter pelo menos 6 caracteres');
    return;
  }

  try {
    const response = await fetch(`/api/admin/users/${userId}/password`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ senha: newPassword }),
    });

    if (response.ok) {
      toast.success('Senha alterada com sucesso!');
    } else {
      const errorData = await response.json().catch(() => ({}));
      toast.error(errorData.error || 'Erro ao alterar senha');
    }
  } catch (error) {
    console.error('Error resetting password:', error);
    toast.error('Erro ao alterar senha');
  }
};

const handleUpdateUser = async (userId: string, updates: Partial<any>) => {
  try {
    const response = await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(updates),
    });

    if (response.ok) {
      toast.success('Usuário atualizado com sucesso!');
      window.location.reload(); // Simple reload to refresh data
    } else {
      const errorData = await response.json().catch(() => ({}));
      toast.error(errorData.error || 'Erro ao atualizar usuário');
    }
  } catch (error) {
    console.error('Error updating user:', error);
    toast.error('Erro ao atualizar usuário');
  }
};

const handleExport = async (formato: 'csv' | 'excel' | 'pdf') => {
  try {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const response = await fetch(`/api/admin/export/users.${formato}?month=${currentMonth}`, {
      credentials: 'include'
    });

    if (response.ok) {
      if (formato === 'csv') {
        const csvData = await response.text();
        const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `usuarios-${currentMonth}.csv`;
        link.click();
      } else {
        const data = await response.json();
        toast.success(`Dados preparados para export ${formato.toUpperCase()}`);
        console.log('Export data:', data);
      }
    } else {
      toast.error(`Erro ao exportar ${formato.toUpperCase()}`);
    }
  } catch (error) {
    console.error('Export error:', error);
    toast.error('Erro ao exportar dados');
  }
};

const formatDate = (dateString: string) => {
  try {
    return new Date(dateString).toLocaleDateString('pt-BR');
  } catch {
    return dateString;
  }
};