import React from 'react';
import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { 
  Calendar, 
  UtensilsCrossed, 
  Users, 
  Monitor, 
  MessageSquare,
  TrendingUp,
  Star,
  Trophy,
  Clock,
  Home
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

const API_BASE = '';

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [pontos, setPontos] = useState({ totalPontos: 0, breakdown: [] });
  const [ranking, setRanking] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      // Try to load real data from backend
      try {
        const response = await fetch('/api/admin/dashboard', {
          credentials: 'include'
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log('[DASHBOARD] Loaded data from API:', data);
          
          // Use real data if available
          setPontos({
            totalPontos: data.userPoints || 0,
            breakdown: data.breakdown || []
          });
          setRanking(data.ranking || []);
        } else {
          throw new Error('API not available');
        }
      } catch (apiError) {
        console.log('[DASHBOARD] API not available, using mock data');
        // Fallback to mock data
        setPontos({
          totalPontos: 150,
          breakdown: [
            { acao: 'MURAL_LIKE', total: 25, count: 5 },
            { acao: 'RESERVA_CREATE', total: 50, count: 5 },
            { acao: 'TROCA_PROTEINA', total: 75, count: 15 }
          ]
        });
        setRanking([]);
      }
    } catch (error) {
      console.error('Erro ao carregar dados do dashboard:', error);
      // Use fallback data instead of showing error
      setPontos({ totalPontos: 0, breakdown: [] });
      setRanking([]);
    } finally {
      setLoading(false);
    }
  };

  const getActionLabel = (acao) => {
    const labels = {
      'MURAL_LIKE': 'Curtidas no Mural',
      'MURAL_COMMENT': 'Comentários no Mural',
      'RESERVA_CREATE': 'Reservas Criadas',
      'PORTARIA_CREATE': 'Agendamentos da Portaria',
      'TROCA_PROTEINA': 'Trocas de Proteína'
    };
    return labels[acao] || acao;
  };

  const getUserRank = () => {
    const userIndex = ranking.findIndex(r => r.nome === user?.nome);
    return userIndex >= 0 ? userIndex + 1 : '-';
  };

  const getUserLevel = (totalPontos) => {
    if (totalPontos < 50) return 1;
    if (totalPontos < 150) return 2;
    if (totalPontos < 300) return 3;
    if (totalPontos < 500) return 4;
    return 5;
  };

  const stats = [
    { 
      title: 'Pontos Totais (Mês)', 
      value: pontos.totalPontos.toString(), 
      icon: Star, 
      color: 'bg-yellow-500' 
    },
    { 
      title: 'Posição no Ranking', 
      value: `#${getUserRank()}`, 
      icon: Trophy, 
      color: 'bg-purple-500' 
    },
    { 
      title: 'Nível Atual', 
      value: getUserLevel(pontos.totalPontos).toString(), 
      icon: TrendingUp, 
      color: 'bg-blue-500' 
    },
    { 
      title: 'Ações Realizadas', 
      value: pontos.breakdown.reduce((sum, b) => sum + b.count, 0).toString(), 
      icon: MessageSquare, 
      color: 'bg-green-500' 
    },
  ];

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Welcome Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-800 rounded-2xl p-8 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">
                Olá, {user?.name?.split(' ')[0] || 'Usuário'}! 👋
              </h1>
              <p className="text-blue-100 mb-4">
                Bem-vindo de volta à Intranet do Grupo Cropfield
              </p>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <Star className="w-5 h-5 text-yellow-300 fill-current" />
                  <span className="font-semibold">{pontos.totalPontos} pontos</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Trophy className="w-5 h-5 text-yellow-300" />
                  <span className="font-semibold">Nível {getUserLevel(pontos.totalPontos)}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm bg-white bg-opacity-20 px-2 py-1 rounded-full">
                    #{getUserRank()} no ranking
                  </span>
                </div>
              </div>
            </div>
            <div className="hidden md:block">
              <div className="w-32 h-32 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                <TrendingUp className="w-16 h-16 text-white" />
              </div>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat, index) => (
            <div key={index} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">{stat.value}</p>
                </div>
                <div className={`${stat.color} rounded-lg p-3`}>
                  <stat.icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Points Breakdown */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Meus Pontos (Mês Atual)</h2>
              <span className="text-sm text-gray-500">{pontos.totalPontos} pontos totais</span>
            </div>
            <div className="space-y-4">
              {pontos.breakdown.map((item, index) => (
                <div key={index} className="flex items-center space-x-4 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                  <div className="bg-blue-100 rounded-lg p-2">
                    <Star className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {getActionLabel(item.acao)}
                    </p>
                    <div className="flex items-center space-x-1 mt-1">
                      <span className="text-xs text-gray-500">{item.count} ações</span>
                      <span className="text-xs text-gray-400">•</span>
                      <span className="text-xs text-green-600">{item.total} pts</span>
                    </div>
                  </div>
                </div>
              ))}
              {pontos.breakdown.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <p>Nenhuma atividade este mês</p>
                  <p className="text-sm">Comece interagindo com a intranet para ganhar pontos!</p>
                </div>
              )}
            </div>
          </div>

          {/* Top Users Ranking */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Ranking de Usuários</h2>
            <div className="space-y-4">
              {ranking.slice(0, 10).map((topUser, index) => (
                <div key={index} className="flex items-center space-x-4 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                  <div className="flex items-center space-x-3">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      index === 0 ? 'bg-yellow-500 text-white' :
                      index === 1 ? 'bg-gray-400 text-white' :
                      index === 2 ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-600'
                    }`}>
                      {index + 1}
                    </span>
                    <img
                      src={topUser.foto || 'https://images.pexels.com/photos/771742/pexels-photo-771742.jpeg?w=150'}
                      alt={topUser.nome}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <p className="font-medium text-gray-900">{topUser.nome}</p>
                      {topUser.nome === user?.nome && (
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">Você</span>
                      )}
                    </div>
                    <div className="flex items-center space-x-3 mt-1">
                      <div className="flex items-center space-x-1">
                        <Star className="w-3 h-3 text-yellow-500 fill-current" />
                        <span className="text-xs text-gray-600">{topUser.total_pontos} pts</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Trophy className="w-3 h-3 text-blue-500" />
                        <span className="text-xs text-gray-600">Nível {getUserLevel(topUser.total_pontos)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {ranking.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <p>Nenhum usuário no ranking este mês</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};