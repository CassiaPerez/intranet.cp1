-- Database Initialization Script for Intranet Cropfield
-- This script creates all tables with proper indexes and constraints
-- Run with: sqlite3 data/database.sqlite < scripts/init-db.sql

-- Enable WAL mode and configure SQLite
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 8000;
PRAGMA cache_size = -64000;
PRAGMA temp_store = MEMORY;

-- ===== TABLES =====

-- usuarios table
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario TEXT UNIQUE NOT NULL,
  senha_hash TEXT NOT NULL,
  setor TEXT NOT NULL,
  role TEXT NOT NULL,
  nome TEXT NULL,
  email TEXT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- solicitacoes_ti table
CREATE TABLE IF NOT EXISTS solicitacoes_ti (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  solicitante_nome TEXT NOT NULL,
  solicitante_email TEXT NULL,
  equipamento TEXT NOT NULL,
  descricao TEXT NOT NULL,
  prioridade TEXT NOT NULL CHECK (prioridade IN ('baixa', 'media', 'alta')),
  status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'aprovada', 'concluida', 'rejeitada')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- mural_posts table  
CREATE TABLE IF NOT EXISTS mural_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  autor_usuario TEXT NOT NULL,
  autor_setor TEXT NOT NULL,
  titulo TEXT NOT NULL,
  conteudo TEXT NOT NULL,
  publicado INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- agendamentos_salas table
CREATE TABLE IF NOT EXISTS agendamentos_salas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sala_id TEXT NOT NULL,
  titulo TEXT NOT NULL,
  descricao TEXT NULL,
  inicio DATETIME NOT NULL,
  fim DATETIME NOT NULL,
  reservado_por TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- agendamentos_portaria table
CREATE TABLE IF NOT EXISTS agendamentos_portaria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visitante_nome TEXT NOT NULL,
  documento TEXT NULL,
  empresa TEXT NULL,
  data_hora DATETIME NOT NULL,
  anfitriao TEXT NOT NULL,
  observacoes TEXT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ===== INDEXES =====

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_usuarios_usuario ON usuarios(usuario);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_ti_status ON solicitacoes_ti(status);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_ti_created ON solicitacoes_ti(created_at);
CREATE INDEX IF NOT EXISTS idx_mural_posts_publicado ON mural_posts(publicado, created_at);
CREATE INDEX IF NOT EXISTS idx_agendamentos_salas_inicio ON agendamentos_salas(inicio);
CREATE INDEX IF NOT EXISTS idx_agendamentos_portaria_data ON agendamentos_portaria(data_hora);

-- ===== TRIGGERS =====

-- updated_at triggers for all tables
CREATE TRIGGER IF NOT EXISTS trigger_usuarios_updated_at
AFTER UPDATE ON usuarios
BEGIN
  UPDATE usuarios SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trigger_solicitacoes_ti_updated_at
AFTER UPDATE ON solicitacoes_ti
BEGIN
  UPDATE solicitacoes_ti SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trigger_mural_posts_updated_at
AFTER UPDATE ON mural_posts
BEGIN
  UPDATE mural_posts SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trigger_agendamentos_salas_updated_at
AFTER UPDATE ON agendamentos_salas
BEGIN
  UPDATE agendamentos_salas SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trigger_agendamentos_portaria_updated_at
AFTER UPDATE ON agendamentos_portaria
BEGIN
  UPDATE agendamentos_portaria SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- ===== SEED DATA =====

-- Admin users (will be handled by application with bcrypt)
-- INSERT OR REPLACE INTO usuarios (usuario, senha_hash, setor, role, nome, email) 
-- VALUES ('admin-ti', '$2a$10$hash...', 'TI', 'admin', 'Administrador TI', 'admin.ti@grupocropfield.com.br');

-- Verify schema
SELECT 'Schema created successfully' as status;