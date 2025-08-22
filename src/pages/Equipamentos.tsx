import React, { useEffect, useMemo, useState } from 'react';
import { Layout } from '../components/Layout';
import { Monitor, Smartphone, Mouse, Keyboard, Headphones, Printer, Send, CheckCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import { useGamification } from '../contexts/GamificationContext';
import { getAuthHeadersWithJson } from '../utils/authUtils';

/** ========= Tipos ========= */
type Priority = 'low' | 'medium' | 'high';
type StatusFE = 'pending' | 'approved' | 'delivered';

interface EquipmentRequest {
  id: string;
  equipment: string;
  justification: string;
  priority: Priority;
  status: StatusFE;
  requestDate: Date;
  user: string;
  userEmail: string;
}

/** ========= Config/API helpers ========= */
const BASE_API = import.meta.env.VITE_API_URL || '';

/** ========= Utils ========= */
function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
function formatDateBR(d: Date) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return '—';
  try { return new Intl.DateTimeFormat('pt-BR').format(d); } catch { return '—'; }
}
function useGamificationSafe(): { addActivity?: (type: string, title: string, payload?: any) => void } {
  try { return useGamification() as any; } catch { return {}; }
}
const mapStatus = (raw: any): StatusFE => {
  const v = String(raw ?? '').toLowerCase();
  if (v === 'aprovado' || v === 'approved') return 'approved';
  if (v === 'entregue' || v === 'delivered') return 'delivered';
  return 'pending';
};
const mapPriority = (raw: any): Priority => {
  const v = String(raw ?? '').toLowerCase();
  return (v === 'low' || v === 'high' || v === 'medium') ? (v as Priority) : 'medium';
};
const toDate = (v: any) => {
  const d = new Date(v || Date.now());
  return isNaN(d.getTime()) ? new Date() : d;
};

/** ========= Página ========= */
const Equipamentos: React.FC = () => {
  const { user } = useAuth();
  const { addActivity } = useGamificationSafe();

  const [formData, setFormData] = useState({
    equipment: '',
    customEquipment: '',
    justification: '',
    priority: 'medium' as Priority,
  });
  const [submitting, setSubmitting] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [requests, setRequests] = useState<EquipmentRequest[]>([]);

  const isTI = useMemo(() => {
    const setor = (user as any)?.sector ?? (user as any)?.setor;
    return String(setor || '').trim().toUpperCase() === 'TI';
  }, [user]);

  // UI maps
  const priorityColors: Record<Priority, string> = {
    low: 'bg-green-100 text-green-800',
    medium: 'bg-yellow-100 text-yellow-800',
    high: 'bg-red-100 text-red-800',
  };
  const statusColors: Record<StatusFE, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-blue-100 text-blue-800',
    delivered: 'bg-green-100 text-green-800',
  };
  const priorityLabels: Record<Priority, string> = {
    low: 'Baixa',
    medium: 'Média',
    high: 'Alta',
  };
  const statusLabels: Record<StatusFE, string> = {
    pending: 'Pendente',
    approved: 'Aprovado',
    delivered: 'Entregue',
  };

  const equipmentTypes = [
    { id: 'notebook', name: 'Notebook', icon: Monitor },
    { id: 'desktop', name: 'Computador Desktop', icon: Monitor },
    { id: 'smartphone', name: 'Smartphone', icon: Smartphone },
    { id: 'mouse', name: 'Mouse', icon: Mouse },
    { id: 'keyboard', name: 'Teclado', icon: Keyboard },
    { id: 'headset', name: 'Headset', icon: Headphones },
    { id: 'printer', name: 'Impressora', icon: Printer },
    { id: 'other', name: 'Outro', icon: Monitor },
  ];

  /** Carrega lista quando usuário/setor disponíveis */
  useEffect(() => {
    if (!user) return;
    void loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isTI]);

  const loadRequests = async () => {
    try {
      setListLoading(true);

      let path: string;
      if (isTI) {
        path = `/api/ti/solicitacoes`; // TI vê todas
      } else {
        const email = encodeURIComponent(user?.email || '');
        if (!email) {
          setRequests([]);
          return;
        }
        path = `/api/ti/minhas?email=${email}`;
      }

      const url = `${BASE_API}${path}`;
      const response = await fetch(url, {
        headers: getAuthHeadersWithJson(user),
        credentials: 'include', // <<< envia cookie 'token'
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        console.error('[Equipamentos] GET', url, 'status=', response.status, response.statusText, 'body=', body?.slice(0, 400));
        toast.error(`Erro ao carregar solicitações (${response.status})`);
        setRequests([]);
        return;
      }

      const data = await response.json();
      const rows: any[] = Array.isArray(data) ? data : (data.solicitacoes || []);
      const transformed: EquipmentRequest[] = rows.map((req: any) => ({
        id: String(req.id ?? req.uuid ?? uid()),
        equipment: String(req.titulo ?? req.equipment ?? 'Equipamento'),
        justification: String(req.descricao ?? req.justificativa ?? ''),
        priority: mapPriority(req.prioridade ?? req.priority),
        status: mapStatus(req.status),
        requestDate: toDate(req.created_at ?? req.createdAt),
        user: String(req.nome ?? user?.name ?? 'Usuário'),
        userEmail: String(req.email ?? user?.email ?? '').toLowerCase(),
      }));

      const finalList = isTI
        ? transformed
        : transformed.filter(r => !!r.userEmail && !!user?.email && r.userEmail === user.email.toLowerCase());

      setRequests(finalList);
    } catch (err) {
      console.error('Erro ao carregar solicitações:', err);
      toast.error('Erro ao carregar solicitações');
      setRequests([]);
    } finally {
      setListLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.email) {
      toast.error('Você precisa estar logado para solicitar.');
      return;
    }

    const equipmentName = formData.equipment === 'other'
      ? formData.customEquipment.trim()
      : formData.equipment.trim();

    if (!equipmentName || !formData.justification.trim()) {
      toast.error('Preencha todos os campos obrigatórios!');
      return;
    }

    setSubmitting(true);
    try {
      const url = `${BASE_API}/api/ti/solicitacoes`;
      const res = await fetch(url, {
        method: 'POST',
        headers: getAuthHeadersWithJson(user),
        credentials: 'include', // <<< envia cookie 'token'
        body: JSON.stringify({
          titulo: equipmentName,
          descricao: `Prioridade: ${formData.priority}\nJustificativa: ${formData.justification}`,
          prioridade: formData.priority,
          email: user.email,
          nome: (user as any)?.name || (user as any)?.nome || '',
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.error('[Equipamentos] POST', url, 'status=', res.status, res.statusText, 'body=', body?.slice(0, 400));
        let msg = 'Erro ao enviar solicitação';
        try { const j = JSON.parse(body); if (j?.error) msg = j.error; } catch {}
        toast.error(`${msg} (${res.status})`);
        return;
      }

      try {
        addActivity?.('equipment_request', `Solicitou equipamento: ${equipmentName}`, {
          equipment: equipmentName,
          priority: formData.priority,
          justification: formData.justification,
        });
      } catch {}

      toast.success('Solicitação enviada com sucesso! O setor de TI foi notificado.');

      setFormData({ equipment: '', customEquipment: '', justification: '', priority: 'medium' });
      await loadRequests();
    } catch (error) {
      console.error('Erro ao enviar solicitação:', error);
      toast.error('Erro ao enviar solicitação');
    } finally {
      setSubmitting(false);
    }
  };

  const TitleRight = () => {
    if (isTI) return <div className="text-sm text-gray-600">{requests.length} solicitações totais</div>;
    return null;
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Equipamentos de TI</h1>
          <TitleRight />
        </div>

        {/* Formulário */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Nova Solicitação</h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">Tipo de Equipamento</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {equipmentTypes.map((equipment) => (
                  <button
                    key={equipment.id}
                    type="button"
                    onClick={() => setFormData((p) => ({ ...p, equipment: equipment.id }))}
                    className={`p-4 border rounded-lg text-center transition-colors ${
                      formData.equipment === equipment.id
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <equipment.icon className="w-6 h-6 mx-auto mb-2" />
                    <span className="text-sm font-medium">{equipment.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {formData.equipment === 'other' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Especificar Equipamento</label>
                <input
                  type="text"
                  value={formData.customEquipment}
                  onChange={(e) => setFormData((p) => ({ ...p, customEquipment: e.target.value }))}
                  placeholder="Descreva o equipamento necessário"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Prioridade</label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData((p) => ({ ...p, priority: e.target.value as Priority }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="low">Baixa</option>
                <option value="medium">Média</option>
                <option value="high">Alta</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Justificativa</label>
              <textarea
                value={formData.justification}
                onChange={(e) => setFormData((p) => ({ ...p, justification: e.target.value }))}
                placeholder="Explique por que você precisa deste equipamento..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={4}
                required
              />
            </div>

            <button
              type="submit"
              disabled={
                submitting ||
                !formData.equipment ||
                !formData.justification.trim() ||
                (formData.equipment === 'other' && !formData.customEquipment.trim())
              }
              aria-busy={submitting}
              className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 flex items-center justify-center space-x-2"
            >
              <Send className="w-4 h-4" />
              <span>{submitting ? 'Enviando...' : 'Enviar Solicitação'}</span>
            </button>
          </form>
        </div>

        {/* Lista */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">
            {isTI ? 'Todas as Solicitações' : 'Minhas Solicitações'}
          </h2>

          {listLoading ? (
            <div className="text-center py-12 text-gray-500">Carregando...</div>
          ) : requests.length === 0 ? (
            <div className="text-center py-8">
              <Monitor className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">Nenhuma solicitação encontrada</p>
            </div>
          ) : (
            <div className="space-y-4">
              {requests.map((request) => (
                <div
                  key={request.id}
                  className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="font-semibold text-gray-900">{request.equipment}</h3>
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${priorityColors[request.priority]}`}>
                          {priorityLabels[request.priority]}
                        </span>
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusColors[request.status]}`}>
                          {statusLabels[request.status]}
                        </span>
                      </div>

                      <p className="text-sm text-gray-600 whitespace-pre-wrap mb-3">
                        {request.justification}
                      </p>

                      <div className="flex items-center space-x-4 text-xs text-gray-500">
                        <span>Solicitado por: {request.user}</span>
                        <span>•</span>
                        <span>{formatDateBR(request.requestDate)}</span>
                      </div>
                    </div>

                    {request.status === 'delivered' && (
                      <CheckCircle className="w-6 h-6 text-green-500 flex-shrink-0" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default Equipamentos;
export { Equipamentos };
