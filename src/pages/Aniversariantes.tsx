import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { Calendar, Gift, User, Cake } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Aniversariante {
  nome: string;
  dataNascimento: string;
  dataISO: string;
  dia: number;
  mesNumero: number;
}

export const Aniversariantes: React.FC = () => {
  const [aniversariantes, setAniversariantes] = useState<Aniversariante[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string>('');

  const mesAtual = new Date().getMonth() + 1; // getMonth() retorna 0-11, precisamos 1-12
  const anoAtual = new Date().getFullYear();
  const nomeDoMes = format(new Date(), 'MMMM', { locale: ptBR });

  useEffect(() => {
    const loadAniversariantes = async () => {
      try {
        const response = await fetch('/dados/aniversariantes.json');
        if (!response.ok) {
          throw new Error('Não foi possível carregar os dados dos aniversariantes');
        }
        const data = await response.json();
        
        // Filtrar aniversariantes do mês atual e ordenar por dia
        const aniversariantesDoMes = data
          .filter((pessoa: Aniversariante) => pessoa.mesNumero === mesAtual)
          .sort((a: Aniversariante, b: Aniversariante) => a.dia - b.dia);
        
        setAniversariantes(aniversariantesDoMes);
      } catch (error) {
        console.error('Erro ao carregar aniversariantes:', error);
        setErro('Erro ao carregar dados dos aniversariantes');
      } finally {
        setLoading(false);
      }
    };

    loadAniversariantes();
  }, [mesAtual]);

  const calcularIdade = (dataISO: string): number => {
    const nascimento = new Date(dataISO);
    const hoje = new Date();
    let idade = hoje.getFullYear() - nascimento.getFullYear();
    
    const mesAtualCompleto = hoje.getMonth();
    const diaAtualCompleto = hoje.getDate();
    const mesNascimento = nascimento.getMonth();
    const diaNascimento = nascimento.getDate();
    
    if (mesAtualCompleto < mesNascimento || (mesAtualCompleto === mesNascimento && diaAtualCompleto < diaNascimento)) {
      idade--;
    }
    
    return idade;
  };

  const jaFezAniversario = (dia: number): boolean => {
    const hoje = new Date();
    return hoje.getDate() >= dia;
  };

  const isAniversarioHoje = (dia: number): boolean => {
    const hoje = new Date();
    return hoje.getDate() === dia && hoje.getMonth() + 1 === mesAtual;
  };

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
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 capitalize">
            Aniversariantes de {nomeDoMes}
          </h1>
          <div className="flex items-center space-x-2">
            <Gift className="w-6 h-6 text-pink-500" />
            <span className="text-sm text-gray-600">
              {aniversariantes.length} aniversariante(s) este mês
            </span>
          </div>
        </div>

        {erro ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="text-red-700">{erro}</div>
          </div>
        ) : aniversariantes.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center">
            <Cake className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Nenhum aniversariante este mês
            </h3>
            <p className="text-gray-600">
              Não há aniversários registrados para {nomeDoMes}.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {aniversariantes.map((pessoa, index) => {
              const idade = calcularIdade(pessoa.dataISO);
              const jaComemorou = jaFezAniversario(pessoa.dia);
              const eHoje = isAniversarioHoje(pessoa.dia);
              
              return (
                <div 
                  key={index} 
                  className={`bg-white rounded-xl p-6 shadow-sm border transition-all hover:shadow-md ${
                    eHoje 
                      ? 'border-pink-300 bg-gradient-to-br from-pink-50 to-white ring-2 ring-pink-200' 
                      : 'border-gray-100'
                  }`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                        eHoje ? 'bg-pink-500' : jaComemorou ? 'bg-green-500' : 'bg-blue-500'
                      }`}>
                        <User className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{pessoa.nome}</h3>
                        {eHoje && (
                          <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-pink-100 text-pink-800 rounded-full">
                            🎉 Hoje!
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center space-x-1 text-gray-500">
                        <Calendar className="w-4 h-4" />
                        <span className="text-sm">{pessoa.dia}/{mesAtual}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Data de nascimento:</span>
                      <span className="font-medium">{pessoa.dataNascimento}</span>
                    </div>
                    
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Idade:</span>
                      <span className="font-medium">
                        {eHoje ? `${idade} anos` : jaComemorou ? `${idade} anos` : `${idade - 1} → ${idade} anos`}
                      </span>
                    </div>

                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <div className="flex items-center space-x-2">
                        <Cake className={`w-4 h-4 ${
                          eHoje ? 'text-pink-500' : jaComemorou ? 'text-green-500' : 'text-blue-500'
                        }`} />
                        <span className={`text-sm font-medium ${
                          eHoje ? 'text-pink-700' : jaComemorou ? 'text-green-700' : 'text-blue-700'
                        }`}>
                          {eHoje 
                            ? 'Feliz Aniversário! 🎂' 
                            : jaComemorou 
                              ? 'Já comemorou este mês' 
                              : `Faltam ${pessoa.dia - new Date().getDate()} dia(s)`
                          }
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <Gift className="w-5 h-5 text-blue-600" />
            <div>
              <h3 className="text-sm font-medium text-blue-900">Dica:</h3>
              <p className="text-sm text-blue-700">
                Não esqueça de parabenizar os colegas no dia do aniversário! 🎉
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};