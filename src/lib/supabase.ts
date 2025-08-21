import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL!
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Database = {
  public: {
    Tables: {
      usuarios: {
        Row: {
          id: string
          auth_id: string | null
          nome: string
          email: string
          setor: string
          tipo: string
          avatar_url: string | null
          pontos_gamificacao: number | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          auth_id?: string | null
          nome: string
          email: string
          setor?: string
          tipo?: string
          avatar_url?: string | null
          pontos_gamificacao?: number | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          auth_id?: string | null
          nome?: string
          email?: string
          setor?: string
          tipo?: string
          avatar_url?: string | null
          pontos_gamificacao?: number | null
          created_at?: string | null
          updated_at?: string | null
        }
      }
      reservas_salas: {
        Row: {
          id: string
          usuario_id: string
          sala: string
          data_reserva: string
          hora_inicio: string
          hora_fim: string
          motivo: string
          observacoes: string | null
          status: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          usuario_id: string
          sala: string
          data_reserva: string
          hora_inicio: string
          hora_fim: string
          motivo: string
          observacoes?: string | null
          status?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          usuario_id?: string
          sala?: string
          data_reserva?: string
          hora_inicio?: string
          hora_fim?: string
          motivo?: string
          observacoes?: string | null
          status?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
      }
      mural: {
        Row: {
          id: string
          usuario_id: string
          titulo: string
          conteudo: string
          tipo: string | null
          setor_origem: string
          anexo_url: string | null
          ativo: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          usuario_id: string
          titulo: string
          conteudo: string
          tipo?: string | null
          setor_origem: string
          anexo_url?: string | null
          ativo?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          usuario_id?: string
          titulo?: string
          conteudo?: string
          tipo?: string | null
          setor_origem?: string
          anexo_url?: string | null
          ativo?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
      }
      trocas_proteina: {
        Row: {
          id: string
          usuario_id: string
          data_troca: string
          proteina_original: string
          proteina_nova: string
          observacoes: string | null
          status: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          usuario_id: string
          data_troca: string
          proteina_original: string
          proteina_nova: string
          observacoes?: string | null
          status?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          usuario_id?: string
          data_troca?: string
          proteina_original?: string
          proteina_nova?: string
          observacoes?: string | null
          status?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
      }
      equipamentos_ti: {
        Row: {
          id: string
          usuario_id: string
          tipo_equipamento: string
          descricao: string
          justificativa: string
          prioridade: string | null
          status: string | null
          observacoes_ti: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          usuario_id: string
          tipo_equipamento: string
          descricao: string
          justificativa: string
          prioridade?: string | null
          status?: string | null
          observacoes_ti?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          usuario_id?: string
          tipo_equipamento?: string
          descricao?: string
          justificativa?: string
          prioridade?: string | null
          status?: string | null
          observacoes_ti?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
      }
      portaria: {
        Row: {
          id: string
          nome_visitante: string
          documento: string
          empresa: string | null
          data_visita: string
          hora_entrada: string
          hora_saida: string | null
          responsavel_id: string
          setor_destino: string
          motivo: string
          observacoes: string | null
          status: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          nome_visitante: string
          documento: string
          empresa?: string | null
          data_visita: string
          hora_entrada: string
          hora_saida?: string | null
          responsavel_id: string
          setor_destino: string
          motivo: string
          observacoes?: string | null
          status?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          nome_visitante?: string
          documento?: string
          empresa?: string | null
          data_visita?: string
          hora_entrada?: string
          hora_saida?: string | null
          responsavel_id?: string
          setor_destino?: string
          motivo?: string
          observacoes?: string | null
          status?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
      }
    }
  }
}