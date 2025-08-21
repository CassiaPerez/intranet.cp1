import React, { useMemo, useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Save, Repeat } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { useGamification } from '../contexts/GamificationContext';
import { getAuthHeadersWithJson } from '../utils/authUtils';

const PROTEIN_OPTIONS = ['Frango','Omelete','Ovo frito','Ovo cozido'] as const;
type ProteinLabel = typeof PROTEIN_OPTIONS[number];

const ORIGINAL_SENTINEL = '__ORIGINAL__';

/** Normaliza textos do cardápio para uma das 4 opções (ou '' se não reconhecer). */
const normalizeProtein = (v: string): ProteinLabel | '' => {
  const s = (v || '').trim().toLowerCase();
  if (!s) return '';
  if (s.includes('frango')) return 'Frango';
  if (s.includes('omelete')) return 'Omelete';
  if (s.includes('frito'))   return 'Ovo frito';
  if (s.includes('cozid'))   return 'Ovo cozido';
  return '';
};

const API_BASE = '';

type CardapioItem = {
  id?: string;
  dia?: string;
  data: string;        // dd/MM/yyyy
  prato?: string;
  descricao?: string;
  proteina: string;
  acompanhamentos?: string[];
  sobremesa?: string;
};

type Troca = {
  data: string;                 // ISO 'yyyy-MM-dd'
  proteina_original: string;    // do cardápio padrão (pode estar vazio se não houver cardápio no dia)
  proteina_nova?: string;
};

// Helper function to check if date is within exchange deadline
const isWithinExchangeDeadline = (exchangeDateISO: string): boolean => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const cutoffTime = new Date(today);
  cutoffTime.setHours(16, 0, 0, 0); // 16:00 (4 PM)
  
  const targetDate = new Date(exchangeDateISO);
  const targetDateOnly = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  
  // If it's past 4 PM today, minimum exchange date is day after tomorrow
  // If it's before 4 PM today, minimum exchange date is tomorrow
  const minExchangeDate = new Date(today);
  if (now >= cutoffTime) {
    minExchangeDate.setDate(today.getDate() + 2); // Day after tomorrow
  } else {
    minExchangeDate.setDate(today.getDate() + 1); // Tomorrow
  }
  
  return targetDateOnly >= minExchangeDate;
};

// Get deadline message for UI
const getDeadlineMessage = (): string => {
  const now = new Date();
  const cutoffTime = new Date();
  cutoffTime.setHours(16, 0, 0, 0);
  const isPastCutoff = now >= cutoffTime;
  
  const today = now.toLocaleDateString('pt-BR');
  const currentTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  
  if (isPastCutoff) {
    return `⏰ Hoje ${today} às ${currentTime} - Após 16h: só é possível trocar proteínas para depois de amanhã`;
  } else {
    return `⏰ Hoje ${today} às ${currentTime} - Antes das 16h: é possível trocar proteínas para amanhã em diante`;
  }
};
export const TrocaProteinas: React.FC = () => {
  const { user } = useAuth();
  const { addActivity } = useGamification();
  const [loading, setLoading] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(true);
  const hoje = new Date();

  const [cardapioPadrao, setCardapioPadrao] = useState<CardapioItem[]>([]);
  const [cardapioLight, setCardapioLight] = useState<CardapioItem[]>([]);
  const [trocas, setTrocas] = useState<Record<string, Troca>>({}); // key=data ISO
  const [trocasExistentes, setTrocasExistentes] = useState<Record<string, Troca>>({});
  const [applyAllProtein, setApplyAllProtein] = useState<string>("");

  // Carrega cardápio (padrão + light) do mês e trocas já salvas
  useEffect(() => {
    (async () => {
      try {
        console.log('[TROCAS] Loading cardapio and existing exchanges...');
        // Load from static JSON files (ajuste os caminhos conforme seu projeto)
        const [padrao, light] = await Promise.all([
          fetch('/cardapio/cardapio-agosto-padrao.json').then(r => r.json()),
          fetch('/cardapio/cardapio-agosto-light.json').then(r => r.json()),
        ]);
        setCardapioPadrao(Array.isArray(padrao) ? padrao : []);
        setCardapioLight(Array.isArray(light) ? light : []);
        console.log('[TROCAS] Cardapio loaded - Padrao:', padrao?.length, 'Light:', light?.length);

        // Carregar trocas existentes no mês (seu backend já expõe esse GET)
        const from = format(startOfMonth(hoje), 'yyyy-MM-01');
        const to   = format(endOfMonth(hoje),   'yyyy-MM-dd');
        console.log('[TROCAS] Loading existing exchanges from API...');
        const prevRes = await fetch(`/api/trocas-proteina?from=${from}&to=${to}`, { 
          headers: getAuthHeadersWithJson(user),
        }).catch(() => ({ ok: false }));
        
        if (prevRes.ok) {
          const prev = await prevRes.json();
          const trocasData = Array.isArray(prev.trocas) ? prev.trocas : [];
          const map: Record<string, Troca> = {};
          console.log('[TROCAS] Processing', trocasData.length, 'existing exchanges');
          
          for (const t of trocasData) {
            try {
              const dataISO = t.data; // Assume já está em formato ISO
              map[dataISO] = { 
                data: dataISO, 
                proteina_original: t.proteina_original || "", 
                proteina_nova: t.proteina_nova 
              };
            } catch (e) {
              console.error('[TROCAS] Error processing exchange:', t, e);
            }
          }
          setTrocasExistentes(map);
          console.log('[TROCAS] Loaded', Object.keys(map).length, 'existing exchanges');
        } else {
          console.log('[TROCAS] API not available for existing exchanges, using empty state');
          setTrocasExistentes({});
        }
      } catch (e) {
        console.error('[TROCAS] Error loading data:', e);
        toast.error('Falha ao carregar dados do cardápio.');
      } finally {
        setLoadingExisting(false);
      }
    })();
  }, [hoje]);

  // Todos os dias do mês (sempre)
  const diasDoMes = useMemo(() => {
    return eachDayOfInterval({ start: startOfMonth(hoje), end: endOfMonth(hoje) });
  }, [hoje]);

  // Mapa dataISO -> proteína original (vinda do cardápio padrão)
  const originalByDate = useMemo(() => {
    const map: Record<string, string> = {};
    for (const it of cardapioPadrao) {
      const [dd, mm, yyyy] = (it.data || '').split('/');
      if (dd && mm && yyyy) {
        const iso = `${yyyy}-${mm}-${dd}`;
        map[iso] = it.proteina || '';
      }
    }
    console.log('[TROCAS] Original proteins by date:', Object.keys(map).length, 'days');
    return map;
  }, [cardapioPadrao]);

  // Opções = união das proteínas que aparecem no mês (padrão + light)
  const opcoesProteina = useMemo(() => {
    // Limita às opções fixas de troca de proteína apenas
    return [...PROTEIN_OPTIONS];
  }, [cardapioPadrao, cardapioLight]);

  // Get current value for a date (existing exchange or new selection)
  const getCurrentValue = (dataISO: string): string => {
    // Priority: new selection > existing exchange > original
    if (trocas[dataISO]?.proteina_nova) {
      return trocas[dataISO].proteina_nova;
    }
    if (trocasExistentes[dataISO]?.proteina_nova) {
      return trocasExistentes[dataISO].proteina_nova;
    }
    return "";
  };

  // Alterar uma linha
  const handleChange = (dataISO: string, nova: string) => {
    const original = originalByDate[dataISO] || ''; // vazio se não houver cardápio naquele dia
    
    console.log('[TROCAS] Handling change for', dataISO, 'from', original, 'to', nova);
    
    // Se o usuário escolheu vazio (manter original), removemos a troca
    if (!nova || nova === ORIGINAL_SENTINEL) {
      setTrocas(prev => {
        const copy = { ...prev };
        delete copy[dataISO];
        console.log('[TROCAS] Removed exchange for', dataISO);
        return copy;
      });
      return;
    }
    
    // Garantir que a nova proteína está nas opções válidas
    if (!PROTEIN_OPTIONS.includes(nova as ProteinLabel)) {
      console.log('[TROCAS] Invalid protein option:', nova);
      return; // Ignorar valores inválidos
    }
    
    // Se igual à original, não precisamos da troca
    const normalizedOriginal = normalizeProtein(original);
    if (nova === normalizedOriginal) {
      setTrocas(prev => {
        const copy = { ...prev };
        delete copy[dataISO];
        console.log('[TROCAS] No change needed for', dataISO, '- same as original');
        return copy;
      });
      return;
    }
    
    console.log('[TROCAS] Setting exchange for', dataISO, ':', { original, nova });
    setTrocas(prev => ({ ...prev, [dataISO]: { data: dataISO, proteina_original: original, proteina_nova: nova } }));
  };

  // Aplicar para todos os dias disponíveis (com cardápio)
  const aplicarParaTodos = () => {
    const target = applyAllProtein.trim();
    if (!target) {
      toast('Escolha a proteína para aplicar em todos os dias.');
      return;
    }
    if (opcoesProteina.length && !opcoesProteina.includes(target)) {
      toast.error('Proteína inválida para este mês.');
      return;
    }
    
    // Check deadline for all days
    const validDays = diasDoMes.filter(d => {
      const iso = format(d, 'yyyy-MM-dd');
      const original = originalByDate[iso] || '';
      return original && isWithinExchangeDeadline(iso);
    });
    
    if (validDays.length === 0) {
      toast.error('Nenhum dia disponível para troca dentro do prazo permitido.');
      return;
    }

    console.log('[TROCAS] Applying protein to all days:', target);
    setTrocas(prev => {
      const copy = { ...prev };
      let applied = 0;
      for (const d of validDays) {
        const iso = format(d, 'yyyy-MM-dd');
        const original = originalByDate[iso] || '';
        // Só aplicamos nos dias que têm cardápio, estão no prazo e quando a troca muda algo
        const normalizedOriginal = normalizeProtein(original);
        if (original && target !== normalizedOriginal && isWithinExchangeDeadline(iso)) {
          copy[iso] = { data: iso, proteina_original: original, proteina_nova: target };
          applied++;
        } else {
          // se não houver cardápio neste dia ou não muda nada, não mantemos troca
          delete copy[iso];
        }
      }
      console.log('[TROCAS] Applied to', applied, 'days');
      return copy;
    });
    toast.success(`Aplicado a ${validDays.length} dias dentro do prazo permitido.`);
  };

  // Salvar em lote via API
  const salvar = async () => {
    const payload = Object.values(trocas).filter(t => {
      const isValid = t.proteina_nova && 
        t.proteina_nova !== t.proteina_original && 
        t.proteina_original;
      
      if (!isValid) return false;
      
      // Check deadline
      if (!isWithinExchangeDeadline(t.data)) {
        const date = new Date(t.data).toLocaleDateString('pt-BR');
        toast.error(`Prazo expirado para ${date}. Trocas devem ser feitas até 16h do dia anterior.`);
        return false;
      }
      
      return true;
    });
    
    if (payload.length === 0) {
      toast('Nenhuma troca válida para salvar dentro do prazo.');
      return;
    }
    
    setLoading(true);
    
    try {
      console.log('[TROCAS] Saving', payload.length, 'exchanges to API...');
      
      const response = await fetch('/api/trocas-proteina/bulk', {
        method: 'POST',
        headers: getAuthHeadersWithJson(user),
        body: JSON.stringify({ trocas: payload }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      
      const data = await response.json();
      console.log('[TROCAS] Bulk save result:', data);
      
      // Gamificação local para as trocas inseridas
      if (data.inseridas > 0) {
        payload.slice(0, data.inseridas).forEach(troca => {
          addActivity('protein_exchange', `Trocou proteína do dia ${format(parseISO(troca.data), 'dd/MM')}`, {
            data: troca.data,
            proteinaOriginal: troca.proteina_original,
            proteinaNova: troca.proteina_nova,
          });
        });
      }
      
      toast.success(`${data.inseridas || 0} trocas salvas! +${data.totalPoints || 0} pontos`);
      
      // Limpa seleções temporárias e recarrega dados existentes
      setTrocas({});
      
      // Reload existing exchanges
      const from = format(startOfMonth(hoje), 'yyyy-MM-01');
      const to   = format(endOfMonth(hoje),   'yyyy-MM-dd');
      const reloadRes = await fetch(`/api/trocas-proteina?from=${from}&to=${to}`, {
        headers: getAuthHeadersWithJson(user),
      }).catch(() => ({ ok: false }));
      
      if (reloadRes.ok) {
        const reloadData = await reloadRes.json();
        const trocasData = Array.isArray(reloadData.trocas) ? reloadData.trocas : [];
        const map: Record<string, Troca> = {};
        
        for (const t of trocasData) {
          try {
            const dataISO = t.data;
            map[dataISO] = { 
              data: dataISO, 
              proteina_original: t.proteina_original || "", 
              proteina_nova: t.proteina_nova 
            };
          } catch (e) {
            console.error('[TROCAS] Error reloading exchange:', t, e);
          }
        }
        setTrocasExistentes(map);
        console.log('[TROCAS] Reloaded', Object.keys(map).length, 'existing exchanges');
      } else {
        console.log('[TROCAS] Failed to reload exchanges from API');
      }
      
    } catch (error) {
      console.error('[TROCAS] Error saving exchanges:', error);
      toast.error(error.message || 'Falha ao salvar trocas.');
    } finally {
      setLoading(false);
    }
  };

  // Resumo simples
  const novasSelecionadas = Object.values(trocas).filter(t => t.proteina_nova && t.proteina_nova !== t.proteina_original && t.proteina_original).length;
  const jaExistentes = Object.values(trocasExistentes).filter(t => t.proteina_nova && t.proteina_nova !== t.proteina_original && t.proteina_original).length;
  const totalSelecionadas = novasSelecionadas + jaExistentes;
  const totalDiasComCardapio = diasDoMes.filter(d => originalByDate[format(d, 'yyyy-MM-dd')]).length;
  const faltantes = Math.max(totalDiasComCardapio - totalSelecionadas, 0);

  if (loadingExisting) {
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
      <div className="p-4 md:p-6 space-y-4">
        {/* Deadline Information */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <svg className="w-5 h-5 text-yellow-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-medium text-yellow-800 mb-1">Regra de Prazo para Trocas</h3>
              <p className="text-sm text-yellow-700 mb-2">
                As trocas de proteínas devem ser solicitadas <strong>até às 16h do dia anterior</strong> ao dia desejado.
              </p>
              <p className="text-xs text-yellow-600">
                {getDeadlineMessage()}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-semibold">Troca de Proteínas</h1>
            <p className="text-sm text-slate-600">
              Defina trocas usando as proteínas disponíveis no cardápio do mês. Você pode aplicar a mesma proteína para todos os dias disponíveis.
            </p>
            <div className="mt-2 text-xs text-slate-500">
              Já salvas: <strong>{jaExistentes}</strong> · Novas: <strong>{novasSelecionadas}</strong> · Restantes: <strong>{faltantes}</strong> (dias com cardápio)
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              className="border rounded-lg px-3 py-2"
              value={applyAllProtein}
              onChange={(e) => setApplyAllProtein(e.target.value)}
            >
              <option value="">Trocar todos os dias para…</option>
              {opcoesProteina.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <button
              onClick={aplicarParaTodos}
              disabled={!applyAllProtein}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border hover:bg-slate-50"
            >
              <Repeat className="w-4 h-4" /> Aplicar em todos
            </button>
            <button
              onClick={salvar}
              disabled={loading || novasSelecionadas === 0}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white"
            >
              <Save className="w-4 h-4" /> {loading ? 'Salvando...' : `Salvar ${novasSelecionadas} seleções`}
            </button>
          </div>
        </div>

        <div className="overflow-auto rounded-xl border bg-white">
          <table className="min-w-[860px] w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left">Data</th>
                <th className="px-3 py-2 text-left">Proteína do Cardápio</th>
                <th className="px-3 py-2 text-left">Trocar para</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Prazo</th>
              </tr>
            </thead>
            <tbody>
              {diasDoMes.filter(d => originalByDate[format(d, 'yyyy-MM-dd')]).map((d) => {
                const dataISO = format(d, 'yyyy-MM-dd');
                const original = originalByDate[dataISO] || ''; // vazio quando não há cardápio
                const currentValue = getCurrentValue(dataISO);
                const isExisting = !!trocasExistentes[dataISO]?.proteina_nova;
                const isNewSelection = !!trocas[dataISO]?.proteina_nova;
                const withinDeadline = isWithinExchangeDeadline(dataISO);

                return (
                  <tr key={dataISO} className={`border-t ${!withinDeadline ? 'bg-gray-50 opacity-60' : ''}`}>
                    <td className="px-3 py-2">{format(d, 'dd/MM/yyyy (EEE)', { locale: ptBR })}</td>
                    <td className="px-3 py-2">{original}</td>
                    <td className="px-3 py-2 relative z-10 pointer-events-auto">
                      <select
                        className={`border rounded-lg px-2 py-1 w-full ${!withinDeadline ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                        value={currentValue}
                        onChange={(e) => withinDeadline ? handleChange(dataISO, e.target.value) : toast.error('Prazo expirado para esta data')}
                        onMouseDown={(e)=>e.stopPropagation()}
                        onClick={(e)=>e.stopPropagation()}
                        onKeyDown={(e)=>e.stopPropagation()}
                        disabled={loading || !withinDeadline}
                      >
                        <option value="">— Manter original —</option>
                        {PROTEIN_OPTIONS.map((p) => (
                          <option key={p} value={p} disabled={normalizeProtein(original) === p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      {isExisting && !isNewSelection && (
                        <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                          Salvo
                        </span>
                      )}
                      {isNewSelection && (
                        <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                          Novo
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {withinDeadline ? (
                        <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                          ✅ Disponível
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded-full">
                          ⏰ Prazo expirado
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
};

// ✅ export nomeado e default
export default TrocaProteinas;
