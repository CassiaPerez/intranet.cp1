import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { ChefHat, Wheat, Milk, Egg, Fish, Leaf, Download } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { useGamification } from '../contexts/GamificationContext';

interface MenuItem {
  id: string;
  dia: string;
  data: string; // dd/MM/yyyy
  prato: string;
  descricao: string;
  proteina: string;
  acompanhamentos: string[];
  sobremesa: string;
  alergenos?: string[];
}

interface ProteinExchange {
  dia: number;
  proteinaOriginal: string;
  proteinaNova: string;
  usuario: string;
  data: Date;
}

export const Cardapio: React.FC = () => {
  const { user } = useAuth();
  const { addActivity } = useGamification();
  const [cardapioPadrao, setCardapioPadrao] = useState<MenuItem[]>([]);

  const currentMonth = new Date();
  const diasUteis = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  }).filter(date => {
    const day = date.getDay();
    return day !== 0 && day !== 6;
  });

  const proteinas = [
    'Frango Grelhado', 'Carne Bovina', 'Peixe Assado', 'Porco Assado',
    'Vegetariano', 'Frango Empanado', 'Hambúrguer', 'Salmão'
  ];

  const alergenos = {
    gluten: { icon: Wheat, name: 'Glúten', color: 'text-yellow-600' },
    lactose: { icon: Milk, name: 'Lactose', color: 'text-blue-600' },
    ovo: { icon: Egg, name: 'Ovo', color: 'text-orange-600' },
    peixe: { icon: Fish, name: 'Peixe', color: 'text-cyan-600' },
    vegetariano: { icon: Leaf, name: 'Vegetariano', color: 'text-green-600' },
  };

  useEffect(() => {
    const fetchCardapio = async () => {
      try {
        console.log('[CARDAPIO] Loading menus...');
        const resPadrao = await fetch('/cardapio/cardapio-agosto-padrao.json').catch(() => ({ ok: false }));
        
        const jsonPadrao = resPadrao.ok ? await resPadrao.json() : [];
        
        setCardapioPadrao(Array.isArray(jsonPadrao) ? jsonPadrao : []);
        
        console.log('[CARDAPIO] Loaded - Padrao:', jsonPadrao?.length);
      } catch (err) {
        console.error('Erro ao carregar cardápio:', err);
        toast.error('Erro ao carregar cardápio.');
        setCardapioPadrao([]);
      }
    };

    fetchCardapio();
  }, []);


  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Cardápio Inteligente</h1>
          <div className="flex items-center space-x-2">
            <ChefHat className="w-6 h-6 text-orange-500" />
            <span className="text-sm text-gray-600">
              {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {diasUteis.map(date => {
            const dataStr = format(date, 'dd/MM/yyyy');
            const item = cardapioPadrao.find(c => c.data === dataStr);
            if (!item) return (
              <div key={dataStr} className="bg-white border rounded-xl p-4 text-gray-500 italic">
                <div className="bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-semibold w-fit mb-2">{dataStr}</div>
                Cardápio não disponível para este dia.
              </div>
            );

            return (
              <div key={item.data} className="bg-white rounded-xl shadow-sm border hover:shadow-md transition p-4">
                <div className="bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-semibold w-fit mb-2">{item.data}</div>
                <h3 className="font-semibold text-gray-900">{item.prato}</h3>
                <p className="text-sm text-gray-700"><strong>Proteína:</strong> {item.proteina}</p>
                <p className="text-sm text-gray-700"><strong>Acompanhamentos:</strong> {item.acompanhamentos?.join(', ') || '---'}</p>
                <p className="text-sm text-gray-700"><strong>Sobremesa:</strong> {item.sobremesa}</p>
              </div>
            );
          })}
        </div>
      </div>
    </Layout>
  );
};
