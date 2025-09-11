import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { Calendar, Clock, Users, Plus, User } from 'lucide-react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { useGamification } from '../contexts/GamificationContext';

const API_BASE = import.meta.env.VITE_API_URL || '';

const salas = [
  { id: 'aquario', name: 'Sala Aquário', capacity: 8, color: '#3B82F6' },
  { id: 'grande', name: 'Sala Grande', capacity: 20, color: '#10B981' },
  { id: 'pequena', name: 'Sala Pequena', capacity: 6, color: '#F59E0B' },
  { id: 'recepcao', name: 'Recepção', capacity: 4, color: '#EF4444' },
];

// opção “Todas as salas”
const SALAS_ALL = { id: 'all', name: 'Todas as salas', capacity: null as unknown as number, color: '#6366F1' as const };
const salasComTodas = [SALAS_ALL, ...salas];

// garante HH:MM:SS
const toTime = (s: string) => {
  const t = s.split('T')[1] || '';
  return t.length === 5 ? `${t}:00` : t;
};

export const ReservaSalas: React.FC = () => {
  const { user } = useAuth();
  const { addActivity } = useGamification();
  const [activeTab, setActiveTab] = useState<'salas' | 'portaria'>('salas');
  const [selectedRoom, setSelectedRoom] = useState<string>('all'); // mostra tudo por padrão
  const [showReservationModal, setShowReservationModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [reservationData, setReservationData] = useState({
    sala: '',
    motivo: '',
    descricao: '',
    inicio: '',
    fim: '',
  });

  const [portariaData, setPortariaData] = useState({
    data: '',
    hora: '',
    visitante: '',
    documento: '',
    observacao: '',
  });

  const [events, setEvents] = useState<any[]>([]);
  const [agendamentos, setAgendamentos] = useState<any[]>([]);

  useEffect(() => {
    loadReservations();
    loadAgendamentos();
  }, []);

  const loadReservations = async () => {
    try {
      const response = await fetch('/api/reservas', { 
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      if (response.ok) {
        const data = await response.json();
        const formattedEvents = (data.reservas || []).map((reserva: any) => {
          const sala = salas.find(s => s.id === reserva.sala);
          const norm = (time: string) => (time?.length === 5 ? `${time}:00` : time);
          return {
            id: String(reserva.id),
            title: `${reserva.assunto} - ${reserva.responsavel || 'Usuário'}`,
            start: `${reserva.data}T${norm(reserva.inicio)}`,
            end: `${reserva.data}T${norm(reserva.fim)}`,
            backgroundColor: sala?.color || '#3B82F6',
            borderColor: sala?.color || '#3B82F6',
            extendedProps: {
              sala: reserva.sala,
              salaName: sala?.name || reserva.sala,
              motivo: reserva.assunto,
              responsavel: reserva.responsavel || 'Usuário',
            },
          };
        });
        setEvents(formattedEvents);
      } else {
        setEvents([]);
      }
    } catch (error) {
      console.error('Erro ao carregar reservas:', error);
      setEvents([]);
    }
  };

  const loadAgendamentos = async () => {
    try {
      const response = await fetch('/api/portaria/agendamentos', { 
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      if (response.ok) {
        const data = await response.json();
        setAgendamentos(data.agendamentos || []);
      }
    } catch (error) {
      console.error('Erro ao carregar agendamentos:', error);
      setAgendamentos([]);
    }
  };

  // Filter events for selected room
  const roomEvents = selectedRoom === 'all'
    ? events
    : events.filter(event => event.extendedProps.sala === selectedRoom);

  const handleDateClick = (selectInfo: any) => {
    setSelectedDate(selectInfo.start);
    const startTime = selectInfo.start.toISOString().slice(0, 16);
    const endDate = new Date(selectInfo.start);
    endDate.setHours(endDate.getHours() + 1);
    const endTime = endDate.toISOString().slice(0, 16);

    setReservationData({
      sala: selectedRoom === 'all' ? '' : selectedRoom, // força escolher sala se “Todas”
      motivo: '',
      descricao: '',
      inicio: startTime,
      fim: endTime,
    });
    setShowReservationModal(true);
  };

  const handleReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (!reservationData.sala || !reservationData.inicio || !reservationData.fim || !reservationData.motivo) {
      toast.error('Preencha todos os campos obrigatórios!');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sala: reservationData.sala,
          data: reservationData.inicio.split('T')[0],
          inicio: toTime(reservationData.inicio),
          fim: toTime(reservationData.fim),
          assunto: reservationData.motivo
        })
      });

      if (response.ok) {
        const data = await response.json();
        const salaInfo = salas.find(s => s.id === reservationData.sala);
        addActivity('room_reservation', `Reservou ${salaInfo?.name} para ${reservationData.motivo}`, {
          sala: reservationData.sala,
          data: reservationData.inicio.split('T')[0],
          motivo: reservationData.motivo,
        });

        toast.success(`Reserva realizada com sucesso! +${data.points || 10} pontos`);
        setShowReservationModal(false);
        setReservationData({ sala: '', motivo: '', descricao: '', inicio: '', fim: '' });

        setSelectedRoom(reservationData.sala); // destaca a sala recém-reservada
        await loadReservations();
      } else {
        const errorData = await response.json().catch(() => ({}));
        toast.error(errorData.error || 'Erro ao criar reserva');
      }
    } catch (error) {
      console.error('Erro ao criar reserva:', error);
      toast.error('Erro ao criar reserva');
    } finally {
      setLoading(false);
    }
  };

  const handlePortariaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (!portariaData.data || !portariaData.hora || !portariaData.visitante) {
      toast.error('Preencha todos os campos obrigatórios!');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/portaria/agendamentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(portariaData)
      });

      if (response.ok) {
        const data = await response.json();
        addActivity('reception_appointment', `Agendou visita de ${portariaData.visitante}`, {
          visitante: portariaData.visitante,
          data: portariaData.data,
        });

        toast.success(`Agendamento realizado com sucesso! +${data.points || 10} pontos`);
        await loadAgendamentos();
        setPortariaData({ data: '', hora: '', visitante: '', documento: '', observacao: '' });
      } else {
        const errorData = await response.json().catch(() => ({}));
        toast.error(errorData.error || 'Erro ao criar agendamento');
      }
    } catch (error) {
      console.error('Erro ao criar agendamento:', error);
      toast.error('Erro ao criar agendamento');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Reserva de Espaços</h1>
          <button
            onClick={() => {
              setReservationData({ ...reservationData, sala: selectedRoom === 'all' ? '' : selectedRoom });
              setShowReservationModal(true);
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Reserva</span>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit">
          <button
            onClick={() => setActiveTab('salas')}
            className={`px-6 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'salas' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Salas de Reunião
          </button>
          <button
            onClick={() => setActiveTab('portaria')}
            className={`px-6 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'portaria' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Agendamentos da Portaria
          </button>
        </div>

        {activeTab === 'salas' && (
          <>
            {/* Room Selection */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Selecione a Sala</h2>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {salasComTodas.map((sala) => (
                  <button
                    key={sala.id}
                    onClick={() => setSelectedRoom(sala.id)}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      selectedRoom === sala.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-4 h-4 rounded-full" style={{ backgroundColor: sala.color }}></div>
                      <div className="text-left">
                        <h3 className="font-semibold text-gray-900">{sala.name}</h3>
                        {sala.id !== 'all' && (
                          <div className="flex items-center space-x-1 mt-1">
                            <Users className="w-3 h-3 text-gray-400" />
                            <span className="text-xs text-gray-500">{sala.capacity} pessoas</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Calendar for Selected Room */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">
                  Calendário - {selectedRoom === 'all'
                    ? 'Todas as salas'
                    : salas.find(s => s.id === selectedRoom)?.name}
                </h2>
                <div className="flex items-center space-x-2">
                  <div
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: (selectedRoom === 'all'
                      ? SALAS_ALL.color
                      : salas.find(s => s.id === selectedRoom)?.color) }}
                  ></div>
                  <span className="text-sm text-gray-600">
                    {roomEvents.length} reservas
                  </span>
                </div>
              </div>

              <FullCalendar
                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' }}
                initialView="timeGridWeek"
                editable={false}
                selectable
                selectMirror
                dayMaxEvents
                weekends
                events={roomEvents}
                select={handleDateClick}
                locale="pt-br"
                height="600px"
                slotMinTime="07:00:00"
                slotMaxTime="19:00:00"
                businessHours={{ daysOfWeek: [1, 2, 3, 4, 5], startTime: '08:00', endTime: '18:00' }}
                eventClick={(info) => {
                  toast(`${info.event.extendedProps.motivo} - ${info.event.extendedProps.responsavel}`);
                }}
              />
            </div>
          </>
        )}

        {activeTab === 'portaria' && (
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Agendamentos da Portaria</h2>

            {/* Formulário de Agendamento */}
            <form onSubmit={handlePortariaSubmit} className="mb-8 p-4 border border-gray-200 rounded-lg">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Novo Agendamento</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Data *</label>
                  <input
                    type="date"
                    value={portariaData.data}
                    onChange={(e) => setPortariaData({ ...portariaData, data: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Hora *</label>
                  <input
                    type="time"
                    value={portariaData.hora}
                    onChange={(e) => setPortariaData({ ...portariaData, hora: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Nome do Visitante *</label>
                  <input
                    type="text"
                    value={portariaData.visitante}
                    onChange={(e) => setPortariaData({ ...portariaData, visitante: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Nome completo do visitante"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Documento</label>
                  <input
                    type="text"
                    value={portariaData.documento}
                    onChange={(e) => setPortariaData({ ...portariaData, documento: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="RG, CPF ou outro documento"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Observações</label>
                  <textarea
                    value={portariaData.observacao}
                    onChange={(e) => setPortariaData({ ...portariaData, observacao: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows={3}
                    placeholder="Informações adicionais sobre a visita..."
                  />
                </div>
              </div>
              <div className="mt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Agendando...' : 'Agendar Visita'}
                </button>
              </div>
            </form>

            {/* Lista de Agendamentos */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900">Agendamentos Recentes</h3>
              {agendamentos.length === 0 ? (
                <div className="text-center py-8">
                  <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">Nenhum agendamento encontrado</p>
                </div>
              ) : (
                agendamentos.map((agendamento, index) => (
                  <div key={index} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                    <div className="flex items-center space-x-4">
                      <div className="bg-blue-100 rounded-lg p-3">
                        <User className="w-6 h-6 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{agendamento.visitante}</h3>
                        <p className="text-sm text-gray-600">
                          {agendamento.documento && `Doc: ${agendamento.documento}`}
                        </p>
                        <div className="flex items-center space-x-4 mt-1">
                          <div className="flex items-center space-x-1">
                            <Calendar className="w-4 h-4 text-gray-400" />
                            <span className="text-sm text-gray-500">{agendamento.data}</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Clock className="w-4 h-4 text-gray-400" />
                            <span className="text-sm text-gray-500">{agendamento.hora}</span>
                          </div>
                        </div>
                        {agendamento.observacao && (
                          <p className="text-xs text-gray-500 mt-1">{agendamento.observacao}</p>
                        )}
                      </div>
                    </div>
                    <span className="px-3 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                      Agendado
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Reservation Modal */}
        {showReservationModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
              <div className="p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-6">Nova Reserva</h2>
                <form onSubmit={handleReservation} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Sala</label>
                    <select
                      value={reservationData.sala}
                      onChange={(e) => setReservationData({ ...reservationData, sala: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    >
                      <option value="">Selecione uma sala</option>
                      {salas.map((sala) => (
                        <option key={sala.id} value={sala.id}>
                          {sala.name} ({sala.capacity} pessoas)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Data/Hora Início</label>
                      <input
                        type="datetime-local"
                        value={reservationData.inicio}
                        onChange={(e) => setReservationData({ ...reservationData, inicio: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Data/Hora Fim</label>
                      <input
                        type="datetime-local"
                        value={reservationData.fim}
                        onChange={(e) => setReservationData({ ...reservationData, fim: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Motivo</label>
                    <input
                      type="text"
                      value={reservationData.motivo}
                      onChange={(e) => setReservationData({ ...reservationData, motivo: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Ex: Reunião de vendas"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Descrição (opcional)</label>
                    <textarea
                      value={reservationData.descricao}
                      onChange={(e) => setReservationData({ ...reservationData, descricao: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      rows={3}
                      placeholder="Detalhes adicionais sobre a reunião..."
                    />
                  </div>

                  <div className="flex space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowReservationModal(false)}
                      className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                      {loading ? 'Reservando...' : 'Reservar'}
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
