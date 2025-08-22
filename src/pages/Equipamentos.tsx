import React, { useEffect, useMemo, useState } from 'react';
import { Layout } from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

const API_BASE = import.meta.env.VITE_API_URL || ''; // vazio = usa proxy do Vite

type Solicitacao = {
  id: string;
  titulo: string;
  descricao: string;
  prioridade: 'low' | 'medium' | 'high' | string;
  status: string;
  created_at: string;
  email?: string;
  nome?: string;
};

export const EquipamentosTI: React.FC = () => {
  const { user } = useAuth();
  const [tab, setTab] = useState<'lista' | 'novo'>('lista');
  const [loading, setLoading] = useState(false);
  const [itens, setItens] = useState<Solicitacao[]>([]);
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [prioridade, setPrioridade] = useState<'low' | 'medium' | 'high'>('medium');

  const headers = useMemo(() => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (user?.token) h['Authorization'] = `Bearer ${user.token}`;
    return h;
  }, [user]);

  const carregarMinhas = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/ti/minhas`, {
        method: 'GET',
        headers,
        credentials: 'include',
      });
      if (!res.ok) {
        let msg = 'Falha ao carregar solicitações';
        try {
          const j = await res.json();
          msg = j?.error || msg;
        } catch {}
        throw new Error(msg);
      }
      const data = await res.json();
      const arr: Solicitacao[] = Array.isArray(data) ? data : (data || []);
      setItens(arr);
    } catch (e: any) {
      console.error('[Equipamentos] Erro ao carregar:', e);
      toast.error(e?.message || 'Erro ao carregar solicitações');
    } finally {
      setLoading(false);
    }
  };

  const criarSolicitacao = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!titulo.trim() || !descricao.trim()) {
      toast.error('Preencha título e descrição');
      return;
    }
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/ti/solicitacoes`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ titulo, descricao, prioridade }),
      });
      if (!res.ok) {
        let msg = 'Falha ao criar solicitação';
        try {
          const j = await res.json();
          msg = j?.error || msg;
        } catch {}
        throw new Error(msg);
      }
      const j = await res.json();
      toast.success('Solicitação enviada com sucesso!');
      setTitulo('');
      setDescricao('');
      setPrioridade('medium');
      setTab('lista');
      await carregarMinhas();
    } catch (e: any) {
      console.error('[Equipamentos] Erro ao criar:', e);
      toast.error(e?.message || 'Erro ao criar solicitação');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // carrega automaticamente ao abrir a aba lista
    if (tab === 'lista') carregarMinhas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  return (
    <Layout title="Equipamentos de TI">
      <div className="max-w-4xl mx-auto p-4">
        <div className="flex gap-2 mb-4">
          <button
            className={`px-4 py-2 rounded-xl border ${tab === 'lista' ? 'bg-gray-100' : ''}`}
            onClick={() => setTab('lista')}
          >
            Minhas solicitações
          </button>
          <button
            className={`px-4 py-2 rounded-xl border ${tab === 'novo' ? 'bg-gray-100' : ''}`}
            onClick={() => setTab('novo')}
          >
            Nova solicitação
          </button>
        </div>

        {tab === 'lista' && (
          <div>
            {loading && <p className="text-sm opacity-70">Carregando...</p>}
            {!loading && itens.length === 0 && (
              <div className="p-6 border rounded-2xl text-center">
                <p className="mb-2">Você ainda não possui solicitações.</p>
                <button
                  className="px-4 py-2 rounded-xl border"
                  onClick={() => setTab('novo')}
                >
                  Criar primeira solicitação
                </button>
              </div>
            )}
            <ul className="grid gap-3">
              {itens.map((s) => (
                <li key={s.id} className="border rounded-2xl p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{s.titulo}</h3>
                    <span className="text-xs px-2 py-1 rounded-full border">
                      {s.prioridade === 'high' ? 'Alta' : s.prioridade === 'low' ? 'Baixa' : 'Média'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm whitespace-pre-wrap">{s.descricao}</p>
                  <div className="mt-2 text-xs opacity-70 flex items-center gap-2">
                    <span>Status: {s.status || 'pending'}</span>
                    <span>•</span>
                    <span>{new Date(s.created_at).toLocaleString()}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === 'novo' && (
          <form onSubmit={criarSolicitacao} className="grid gap-3 max-w-2xl">
            <label className="grid gap-1">
              <span className="text-sm">Título</span>
              <input
                className="border rounded-xl px-3 py-2"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ex.: Notebook sem carregar"
              />
            </label>

            <label className="grid gap-1">
              <span className="text-sm">Descrição</span>
              <textarea
                className="border rounded-xl px-3 py-2 min-h-[120px]"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Explique o problema com detalhes..."
              />
            </label>

            <label className="grid gap-1">
              <span className="text-sm">Prioridade</span>
              <select
                className="border rounded-xl px-3 py-2"
                value={prioridade}
                onChange={(e) => setPrioridade(e.target.value as any)}
              >
                <option value="low">Baixa</option>
                <option value="medium">Média</option>
                <option value="high">Alta</option>
              </select>
            </label>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 rounded-xl border"
              >
                {loading ? 'Enviando...' : 'Enviar'}
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-xl border"
                onClick={() => setTab('lista')}
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>
    </Layout>
  );
};
