#!/usr/bin/env node
// server.cjs - Backend Express + SQLite (Express 5 compatível)
// Google OAuth via Passport + JWT em cookie HttpOnly
'use strict';

// (Opcional) carregar .env se existir
try { require('dotenv').config(); } catch {}

const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const path = require('path');
const fs = require('fs');

const app = express();
const HOST = (process.env.HOST || '0.0.0.0').replace(/^https?:/, '');
const PORT = Number(process.env.PORT) || 3006;
const NODE_ENV = process.env.NODE_ENV || 'development';
const WEB_URL = process.env.WEB_URL || `http://localhost:5173`;
const JWT_SECRET = process.env.JWT_SECRET || 'cropfield-secret-key-2025';

// --- Google OAuth ---
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || `http://localhost:${PORT}/auth/google/callback`;

console.log('🔐 Google OAuth Config:', {
  clientId: GOOGLE_CLIENT_ID ? 'Configurado' : 'Não configurado',
  clientSecret: GOOGLE_CLIENT_SECRET ? 'Configurado' : 'Não configurado',
  callbackUrl: GOOGLE_CALLBACK_URL
});

// Robustez
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err && err.stack || err));
process.on('unhandledRejection', (reason) => console.error('[unhandledRejection]', reason));

// FS / DB
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// ======================
// DB init
// ======================
db.serialize(() => {
  db.run('PRAGMA foreign_keys = ON');
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA busy_timeout = 5000');
  db.run('PRAGMA synchronous = NORMAL');

  db.run(`CREATE TABLE IF NOT EXISTS usuarios (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    senha TEXT NOT NULL,
    setor TEXT DEFAULT 'Geral',
    role TEXT DEFAULT 'colaborador',
    ativo INTEGER DEFAULT 1,
    pontos_gamificacao INTEGER DEFAULT 0,
    can_publish_mural INTEGER DEFAULT 0,
    can_moderate_mural INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS mural_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id TEXT NOT NULL,
    titulo TEXT NOT NULL,
    conteudo TEXT NOT NULL,
    pinned INTEGER DEFAULT 0,
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS mural_likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    usuario_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES mural_posts (id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id),
    UNIQUE(post_id, usuario_id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS mural_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    usuario_id TEXT NOT NULL,
    texto TEXT NOT NULL,
    oculto INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES mural_posts (id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS reservas (
    id TEXT PRIMARY KEY,
    usuario_id TEXT NOT NULL,
    sala TEXT NOT NULL,
    data DATE NOT NULL,
    inicio TIME NOT NULL,
    fim TIME NOT NULL,
    assunto TEXT NOT NULL,
    observacoes TEXT,
    responsavel TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
  )`);
  db.run('CREATE INDEX IF NOT EXISTS idx_reservas_sala_data ON reservas (sala, data, inicio, fim)');

  db.run(`CREATE TABLE IF NOT EXISTS trocas_proteina (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id TEXT NOT NULL,
    data DATE NOT NULL,
    proteina_original TEXT NOT NULL,
    proteina_nova TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id),
    UNIQUE(usuario_id, data)
  )`);
  db.run('CREATE INDEX IF NOT EXISTS idx_trocas_user_data ON trocas_proteina (usuario_id, data)');

  db.run(`CREATE TABLE IF NOT EXISTS ti_solicitacoes (
    id TEXT PRIMARY KEY,
    usuario_id TEXT NOT NULL,
    email TEXT NOT NULL,
    nome TEXT NOT NULL,
    titulo TEXT NOT NULL,
    descricao TEXT NOT NULL,
    prioridade TEXT DEFAULT 'medium',
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
  )`);
  db.run('CREATE INDEX IF NOT EXISTS idx_ti_solicitacoes_user ON ti_solicitacoes (usuario_id, created_at)');

  db.run(`CREATE TABLE IF NOT EXISTS portaria_agendamentos (
    id TEXT PRIMARY KEY,
    usuario_id TEXT NOT NULL,
    data DATE NOT NULL,
    hora TIME NOT NULL,
    visitante TEXT NOT NULL,
    documento TEXT,
    observacao TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS pontos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id TEXT NOT NULL,
    acao TEXT NOT NULL,
    pontos INTEGER NOT NULL,
    descricao TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
  )`);
  db.run('CREATE INDEX IF NOT EXISTS idx_pontos_user_created ON pontos (usuario_id, created_at)');

  // Seeds (idempotente)
  const seed = (id, nome, email, senha, setor, role, pub = 1, mod = 1) => {
    db.get('SELECT id FROM usuarios WHERE email = ?', [email], (err, row) => {
      if (err) return console.error('[DB] Seed erro:', email, err.message);
      if (row) return;
      const hashed = bcrypt.hashSync(String(senha), 10);
      db.run(
        `INSERT INTO usuarios (id, nome, email, senha, setor, role, can_publish_mural, can_moderate_mural)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, nome, email.toLowerCase(), hashed, setor, role, pub, mod],
        (e) => e
          ? console.error('[DB] Erro criando usuário seed:', email, e.message)
          : console.log(`👤 Seed criado: ${email} / ${senha}`)
      );
    });
  };
  seed('admin-1', 'Administrador', 'admin@grupocropfield.com.br', 'admin123', 'TI', 'admin', 1, 1);
  seed('rh-1', 'Recursos Humanos', 'rh@grupocropfield.com.br', 'rh123', 'RH', 'rh', 1, 1);
  seed('mod-1', 'Moderador Sistema', 'moderador@grupocropfield.com.br', 'mod123', 'TI', 'moderador', 1, 1);
  seed('colab-1', 'João Colaborador', 'colaborador@grupocropfield.com.br', 'colab123', 'Comercial', 'colaborador', 0, 0);
});

// ======================
// Middlewares globais
// ======================
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  WEB_URL
].filter(Boolean);

const originRegexes = [
  /^https?:\/\/[^/]*\.stackblitz\.io$/i, 
  /^https?:\/\/[^/]*\.netlify\.app$/i,
  /^https?:\/\/[^/]*\.bolt\.new$/i
];
app.use(cors({
  credentials: true,
  origin(origin, cb) {
    // Allow requests with no origin (e.g., mobile apps, Postman)
    if (!origin) return cb(null, true);
    
    if (allowedOrigins.includes(origin) || originRegexes.some(rx => rx.test(origin))) return cb(null, true);
    
    console.warn('[CORS] Bloqueado:', origin);
    return cb(null, false);
  }
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan('dev'));

// ======================
// Helpers de nome (PATCH #1)
// ======================
const titleCaseFromEmail = (email) => {
  const left = String(email || '').split('@')[0];
  return left.replace(/[._-]+/g, ' ')
    .split(' ').filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
};

const computeName = (email, dbOrGoogleName, tokenName) => {
  return (dbOrGoogleName && !/^usu[aá]rio$/i.test(dbOrGoogleName) ? dbOrGoogleName : null)
      || (tokenName && !/^usu[aá]rio$/i.test(tokenName) ? tokenName : null)
      || titleCaseFromEmail(email)
      || 'Usuário';
};

const ensureDbName = (id, currentDbName, targetName) => {
  if (!id || !targetName || currentDbName === targetName) return;
  db.run('UPDATE usuarios SET nome = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [targetName, id], (e) => {
    if (e) console.warn('⚠️ Falha ao ajustar nome no DB:', e.message);
  });
};

// ======================
// Google OAuth (PATCH #2 no callback)
// ======================
if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  console.log('🔐 Configurando Google OAuth...');
  console.log('📍 Callback URL:', GOOGLE_CALLBACK_URL);
  console.log('🌐 Frontend URL:', WEB_URL);

  passport.use(new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: GOOGLE_CALLBACK_URL,
    scope: ['profile', 'email']
  }, async (_accessToken, _refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value?.toLowerCase();
      const googleName = (profile.displayName || `${profile.name?.givenName || ''} ${profile.name?.familyName || ''}`).trim();
      const googlePhoto = profile.photos?.[0]?.value || null;
      
      console.log('[GOOGLE] Processing login for:', email, 'name:', googleName);
      
      if (!email) {
        console.log('[GOOGLE] No email provided by Google');
        return done(new Error('Email não fornecido pelo Google'), null);
      }

      db.get('SELECT * FROM usuarios WHERE email = ? AND ativo = 1', [email], (err, user) => {
        if (err) {
          console.error('[GOOGLE] Database error:', err);
          return done(err, null);
        }
        
        if (!user) {
          console.log('[GOOGLE] User not found or inactive in database:', email);
          return done(new Error(`Usuário ${email} não está autorizado ou inativo. Contate o administrador.`), null);
        }

        console.log('[GOOGLE] User found:', user.email, 'role:', user.role);
        const nomeFinal = computeName(user.email, user.nome, googleName);

        // Update user with Google info if needed
        const needsUpdate = (user.nome !== nomeFinal && nomeFinal !== 'Usuário') || 
                           (googlePhoto && !user.avatar_url);

        if (needsUpdate) {
          console.log('[GOOGLE] Updating user info:', { 
            oldName: user.nome, 
            newName: nomeFinal,
            hasPhoto: !!googlePhoto 
          });
          
          const updateSql = googlePhoto 
            ? 'UPDATE usuarios SET nome = ?, avatar_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
            : 'UPDATE usuarios SET nome = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
          const updateParams = googlePhoto 
            ? [nomeFinal, googlePhoto, user.id]
            : [nomeFinal, user.id];
            
          db.run(updateSql, updateParams, (e) => {
            if (e) console.warn('⚠️ Erro ao atualizar usuário:', e.message);
            
            // Return updated user object
            const updatedUser = { 
              ...user, 
              nome: nomeFinal,
              avatar_url: googlePhoto || user.avatar_url 
            };
            return done(null, updatedUser);
          });
        } else {
          // Just update last access
          db.run('UPDATE usuarios SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [user.id], (e) => {
            if (e) console.warn('⚠️ Erro ao atualizar último acesso:', e.message);
            return done(null, user);
          });
        }
      });
    } catch (error) {
      console.error('[GOOGLE] OAuth strategy error:', error);
      return done(error, null);
    }
  }));

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser((id, done) => {
    db.get('SELECT * FROM usuarios WHERE id = ? AND ativo = 1', [id], (err, user) => done(err, user));
  });

  app.use(passport.initialize());
  console.log('✅ Google OAuth configurado');

  const googleAuth = passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account consent',
    session: false
  });

  app.get('/auth/google', googleAuth);
  app.get('/api/auth/google', googleAuth);

  app.get('/auth/google/callback',
    passport.authenticate('google', { 
      session: false, 
      failureMessage: true,
      keepSessionInfo: false
    }),
    (req, res, next) => {
      console.log('[GOOGLE] Callback executado');
      const user = req.user;
      
      if (!user) {
        console.log('[GOOGLE] Callback sem user');
        return res.redirect(`${WEB_URL}/login?error=google_auth_failed`);
      }

      console.log('[GOOGLE] Gerando token para:', user.email, 'role:', user.role);
      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          role: user.role,
          name: user.nome, // nome já corrigido
          setor: user.setor,
          sector: user.setor,
          picture: user.avatar_url,
          can_publish_mural: user.can_publish_mural || 0,
          can_moderate_mural: user.can_moderate_mural || 0
        },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      console.log('[GOOGLE] Setting cookie and redirecting');
      res.cookie('token', token, {
        httpOnly: true,
        secure: false, // Set to true in production with HTTPS
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000,
        path: '/',
        domain: NODE_ENV === 'production' ? undefined : undefined // Let browser decide
      });

      console.log('[GOOGLE] Cookie set, redirecting to frontend');
      return res.redirect(`${WEB_URL}/?login=success`);
    }
  );

  // Handle auth failures with proper error messages
  app.get('/auth/google/failure', (req, res) => {
    console.log('[GOOGLE] Auth failure:', req.session?.messages);
    const error = req.session?.messages?.[0] || 'authentication_failed';
    res.redirect(`${WEB_URL}/login?error=${encodeURIComponent(error)}`);
  });
} else {
  console.log('⚠️ Google OAuth não configurado - defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET');
  app.get('/auth/google', (_req, res) => {
    console.log('[GOOGLE] OAuth not configured, redirecting with error');
    res.status(503).json({ error: 'Google OAuth não configurado' });
  });
  app.get('/api/auth/google', (_req, res) => {
    console.log('[GOOGLE] OAuth not configured, redirecting with error');
    res.status(503).json({ error: 'Google OAuth não configurado' });
  });
}

// ======================
// Helpers de auth/perm
// ======================
const authenticateToken = (req, res, next) => {
  const header = req.headers.authorization || '';
  const bearer = header.replace(/^Bearer\s+/i, '');
  const token = req.cookies.token || bearer;
  if (!token) return res.status(401).json({ error: 'No token provided' });

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err || !decoded?.id) return res.status(403).json({ error: 'Invalid token' });
    req.user = decoded;
    next();
  });
};

const userSector = (u) => u?.setor || u?.sector || null;
const isPrivileged = (u) => {
  const role = u?.role;
  const setor = userSector(u);
  return role === 'admin' || role === 'moderador' || role === 'rh' || setor === 'TI' || setor === 'RH';
};

const requirePublisher = (req, res, next) => {
  if (req.user?.can_publish_mural === 1) return next();
  if (isPrivileged(req.user)) return next();
  return res.status(403).json({ error: 'Apenas TI/RH/Moderador/Admin (ou com permissão) podem publicar no mural' });
};

const requireModeratorOrAdmin = (req, res, next) => {
  if (req.user?.can_moderate_mural === 1) return next();
  const role = req.user?.role;
  const setor = userSector(req.user);
  if (role === 'admin' || role === 'moderador' || role === 'rh' || setor === 'TI') return next();
  return res.status(403).json({ error: 'Apenas Admin/Moderador/RH/TI (ou com permissão) podem moderar comentários' });
};

const requireAdminOrHRorTI = (req, res, next) => {
  const role = req.user?.role;
  const setor = userSector(req.user);
  if (role === 'admin' || role === 'rh' || setor === 'TI' || role === 'moderador') return next();
  return res.status(403).json({ error: 'Acesso restrito ao painel de usuários (Admin/RH/TI/Moderador)' });
};

const addPoints = (userId, acao, pontos, descricao = null) => {
  db.run('INSERT INTO pontos (usuario_id, acao, pontos, descricao) VALUES (?, ?, ?, ?)', [userId, acao, pontos, descricao]);
  db.run('UPDATE usuarios SET pontos_gamificacao = pontos_gamificacao + ? WHERE id = ?', [pontos, userId]);
};

// ======================
// Moderação básica
// ======================
const PALAVRAS_PROIBIDAS = [
  'porra','caralho','merda','bosta','cacete','droga','inferno',
  'burro','idiota','imbecil','estupido','otario','babaca','trouxa','palhaco','ridiculo',
  'fdp','filho da puta','vai se foder','vai tomar no cu','cuzao','desgracado','maldito','safado','vagabundo',
  'retardado','mongoloide','doente mental','vsf','krl','pqp','tnc'
];
const contemPalavraProibida = (texto) => {
  const textoLimpo = String(texto || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return PALAVRAS_PROIBIDAS.some(p => textoLimpo.includes(p));
};

// ======================
// Auth: e-mail/senha (PATCH #3 em issueLogin)
// ======================
const issueLogin = (res, user) => {
  const fixedName = computeName(user.email, user.nome, null);
  if (fixedName !== user.nome) {
    ensureDbName(user.id, user.nome, fixedName);
    user.nome = fixedName;
  }

  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.nome, // já corrigido
      setor: user.setor,
      sector: user.setor,
      picture: user.avatar_url,
      can_publish_mural: user.can_publish_mural || 0,
      can_moderate_mural: user.can_moderate_mural || 0
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.cookie('token', token, {
    httpOnly: true,
    secure: false, // Set to true in production with HTTPS
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000,
    path: '/'
  });

  res.json({
    user: {
      id: user.id, name: user.nome, email: user.email,
      setor: user.setor, sector: user.setor, role: user.role,
      picture: user.avatar_url,
      can_publish_mural: user.can_publish_mural || 0,
      can_moderate_mural: user.can_moderate_mural || 0,
      token
    }
  });
};

app.post('/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  
  if (!email || !password) {
    console.log('[AUTH] Login attempt with missing credentials');
    return res.status(400).json({ error: 'Email e senha são obrigatórios' });
  }
  
  console.log('[AUTH] Login attempt for email:', email);
  
  db.get('SELECT * FROM usuarios WHERE email = ? AND ativo = 1', [email.toLowerCase()], (err, user) => {
    if (err) {
      console.error('[AUTH] Database error during login:', err);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
    
    if (!user) {
      console.log('[AUTH] User not found:', email);
      return res.status(401).json({ error: 'Email não encontrado ou usuário inativo' });
    }
    
    if (!bcrypt.compareSync(String(password), user.senha)) {
      console.log('[AUTH] Invalid password for user:', email);
      return res.status(401).json({ error: 'Senha incorreta' });
    }
    
    console.log('[AUTH] Login successful for:', email);
    issueLogin(res, user);
  });
});

// Alias route for admin login
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  
  if (!email || !password) {
    console.log('[AUTH] API Login attempt with missing credentials');
    return res.status(400).json({ error: 'Email e senha são obrigatórios' });
  }
  
  console.log('[AUTH] API Login attempt for email:', email);
  
  db.get('SELECT * FROM usuarios WHERE email = ? AND ativo = 1', [email.toLowerCase()], (err, user) => {
    if (err) {
      console.error('[AUTH] API Database error during login:', err);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
    
    if (!user) {
      console.log('[AUTH] API User not found:', email);
      return res.status(401).json({ error: 'Email não encontrado ou usuário inativo' });
    }
    
    if (!bcrypt.compareSync(String(password), user.senha)) {
      console.log('[AUTH] API Invalid password for user:', email);
      return res.status(401).json({ error: 'Senha incorreta' });
    }
    
    console.log('[AUTH] API Login successful for:', email);
    issueLogin(res, user);
  });
});

app.post('/auth/logout', (_req, res) => { res.clearCookie('token'); res.json({ message: 'Logout successful' }); });
app.post('/api/auth/logout', (_req, res) => { res.clearCookie('token'); res.json({ message: 'Logout successful' }); });

// ======================
// Me (PATCH #4 — robusto + corrige DB)
// ======================
app.get('/api/me', authenticateToken, (req, res) => {
  db.get(
    'SELECT id, nome, email, setor, role, can_publish_mural, can_moderate_mural, pontos_gamificacao FROM usuarios WHERE id = ?',
    [req.user.id],
    (err, user) => {
      if (err) {
        console.error('[ME] Database error:', err);
        return res.status(500).json({ error: 'Erro interno do servidor' });
      }
      
      if (!user) {
        console.log('[ME] User not found in database:', req.user.id);
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      const name = computeName(user.email, user.nome, req.user?.name);
      ensureDbName(user.id, user.nome, name); // auto-fix no banco

      res.json({ user: {
        id: user.id, name, email: user.email, setor: user.setor, sector: user.setor,
        role: user.role, 
        picture: user.avatar_url,
        can_publish_mural: user.can_publish_mural || 0, 
        can_moderate_mural: user.can_moderate_mural || 0,
        pontos_gamificacao: user.pontos_gamificacao || 0
      }});
    }
  );
});

// ======================
// Admin: Usuários
// ======================
app.get('/api/admin/users', authenticateToken, requireAdminOrHRorTI, (req, res) => {
  const q = (req.query?.q || '').trim();
  let sql = `SELECT id, nome, email, setor, role, ativo, pontos_gamificacao, can_publish_mural, can_moderate_mural, created_at, updated_at FROM usuarios`;
  const params = [];
  if (q) {
    sql += ` WHERE nome LIKE ? OR email LIKE ? OR setor LIKE ? OR role LIKE ?`;
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  sql += ` ORDER BY created_at DESC`;
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Erro ao listar usuários' });
    res.json({ users: rows });
  });
});

app.get('/api/admin/users/:id', authenticateToken, requireAdminOrHRorTI, (req, res) => {
  db.get(`SELECT id, nome, email, setor, role, ativo, pontos_gamificacao, can_publish_mural, can_moderate_mural, created_at, updated_at FROM usuarios WHERE id = ?`, [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Erro ao carregar usuário' });
    if (!row) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json({ user: row });
  });
});

app.post('/api/admin/users', authenticateToken, requireAdminOrHRorTI, (req, res) => {
  const nome = (req.body?.nome ?? req.body?.name ?? '').toString().trim();
  const email = (req.body?.email ?? '').toString().trim().toLowerCase();
  const senha = (req.body?.senha ?? req.body?.password ?? req.body?.pass ?? '').toString();

  const setor = (req.body?.setor ?? req.body?.sector ?? 'Geral').toString();
  const role  = (req.body?.role  ?? 'colaborador').toString();
  const ativo = Number(req.body?.ativo ?? 1);
  const can_publish_mural   = Number(!!req.body?.can_publish_mural);
  const can_moderate_mural  = Number(!!req.body?.can_moderate_mural);

  if (!nome || !email || !senha) return res.status(400).json({ error: 'nome/email/senha são obrigatórios' });
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
  if (!emailRegex.test(email)) return res.status(400).json({ error: 'E-mail inválido' });

  const id = `user-${(crypto.randomUUID?.() || Date.now())}`;
  const hashed = bcrypt.hashSync(senha, 10);
  const sql = `
    INSERT INTO usuarios (id, nome, email, senha, setor, role, ativo, can_publish_mural, can_moderate_mural)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  db.run(sql, [id, nome, email, hashed, setor, role, ativo, can_publish_mural, can_moderate_mural], function (err) {
    if (err) {
      if (/UNIQUE/i.test(err.message)) return res.status(409).json({ error: 'E-mail já cadastrado' });
      return res.status(500).json({ error: 'Erro ao criar usuário', details: err.message });
    }
    res.json({ created: true, id });
  });
});

app.put('/api/admin/users/:id', authenticateToken, requireAdminOrHRorTI, (req, res) => {
  const fields = ['nome','email','setor','role','ativo','can_publish_mural','can_moderate_mural'];
  const sets = []; const params = [];
  fields.forEach(f => {
    if (req.body?.[f] !== undefined) {
      sets.push(`${f} = ?`);
      const v = (f.startsWith('can_') || f === 'ativo') ? Number(req.body[f]) : String(req.body[f]);
      params.push(v);
    }
  });
  if (!sets.length) return res.status(400).json({ error: 'Nenhum campo para atualizar' });
  sets.push('updated_at = CURRENT_TIMESTAMP'); params.push(req.params.id);
  const sql = `UPDATE usuarios SET ${sets.join(', ')} WHERE id = ?`;
  db.run(sql, params, function (err) {
    if (err) return res.status(500).json({ error: 'Erro ao atualizar usuário', details: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json({ updated: true });
  });
});

app.put('/api/admin/users/:id/password', authenticateToken, requireAdminOrHRorTI, (req, res) => {
  const { novaSenha } = req.body || {};
  if (!novaSenha) return res.status(400).json({ error: 'novaSenha é obrigatória' });
  const hashed = bcrypt.hashSync(String(novaSenha), 10);
  db.run(`UPDATE usuarios SET senha = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [hashed, req.params.id], function (err) {
    if (err) return res.status(500).json({ error: 'Erro ao atualizar senha' });
    if (this.changes === 0) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json({ passwordUpdated: true });
  });
});

app.delete('/api/admin/users/:id', authenticateToken, requireAdminOrHRorTI, (req, res) => {
  db.run(`DELETE FROM usuarios WHERE id = ?`, [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: 'Erro ao remover usuário' });
    if (this.changes === 0) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json({ deleted: true });
  });
});

// ======================
// Mural
// ======================
app.get('/api/mural/posts', authenticateToken, (_req, res) => {
  const q = `
    SELECT mp.id, mp.titulo, mp.conteudo, mp.pinned, mp.created_at,
           u.nome as author,
           (SELECT COUNT(*) FROM mural_likes ml WHERE ml.post_id = mp.id) as likes_count,
           (SELECT COUNT(*) FROM mural_comments mc WHERE mc.post_id = mp.id AND mc.oculto = 0) as comments_count
    FROM mural_posts mp
    JOIN usuarios u ON mp.usuario_id = u.id
    WHERE mp.ativo = 1
    ORDER BY mp.pinned DESC, mp.created_at DESC
  `;
  db.all(q, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Erro ao carregar posts' });
    res.json({ posts: rows });
  });
});

app.post('/api/mural/posts', authenticateToken, requirePublisher, (req, res) => {
  const { titulo, conteudo, pinned = false } = req.body || {};
  if (!titulo || !conteudo) return res.status(400).json({ error: 'Título e conteúdo são obrigatórios' });

  const safePinned = (req.user.role === 'admin') && !!pinned;
  db.run('INSERT INTO mural_posts (usuario_id, titulo, conteudo, pinned) VALUES (?, ?, ?, ?)',
    [req.user.id, titulo, conteudo, safePinned ? 1 : 0],
    function (err) {
      if (err) return res.status(500).json({ error: 'Erro ao criar post' });
      addPoints(req.user.id, 'MURAL_CREATE', 15, `Post: ${titulo}`);
      res.json({ id: this.lastID, points: 15 });
    });
});

app.post('/api/mural/:postId/like', authenticateToken, (req, res) => {
  const { postId } = req.params;
  db.get('SELECT id FROM mural_likes WHERE post_id = ? AND usuario_id = ?', [postId, req.user.id], (err, like) => {
    if (err) return res.status(500).json({ error: 'Erro interno' });
    if (like) {
      db.run('DELETE FROM mural_likes WHERE post_id = ? AND usuario_id = ?', [postId, req.user.id], (e) => {
        if (e) return res.status(500).json({ error: 'Erro ao remover curtida' });
        res.json({ action: 'unliked' });
      });
    } else {
      db.run('INSERT INTO mural_likes (post_id, usuario_id) VALUES (?, ?)', [postId, req.user.id], (e) => {
        if (e) return res.status(500).json({ error: 'Erro ao curtir post' });
        addPoints(req.user.id, 'MURAL_LIKE', 2, `Curtiu post ${postId}`);
        res.json({ action: 'liked', points: 2 });
      });
    }
  });
});

app.post('/api/mural/:postId/comments', authenticateToken, (req, res) => {
  const { postId } = req.params;
  const { texto } = req.body || {};
  if (!texto) return res.status(400).json({ error: 'Texto do comentário é obrigatório' });

  if (contemPalavraProibida(texto)) {
    return res.status(400).json({
      error: 'Comentário contém linguagem inapropriada e foi bloqueado pela moderação automática'
    });
  }

  db.run('INSERT INTO mural_comments (post_id, usuario_id, texto) VALUES (?, ?, ?)',
    [postId, req.user.id, texto],
    function (err) {
      if (err) return res.status(500).json({ error: 'Erro ao criar comentário' });
      addPoints(req.user.id, 'MURAL_COMMENT', 3, `Comentou no post ${postId}`);
      res.json({ id: this.lastID, points: 3 });
    });
});

app.get('/api/mural/:postId/comments', authenticateToken, (req, res) => {
  const { postId } = req.params;
  const verOcultos = isPrivileged(req.user) || (req.user?.can_moderate_mural === 1);
  const q = `
    SELECT mc.id, mc.texto, mc.oculto, mc.created_at, u.nome as author
    FROM mural_comments mc
    JOIN usuarios u ON mc.usuario_id = u.id
    WHERE mc.post_id = ? ${verOcultos ? '' : 'AND mc.oculto = 0'}
    ORDER BY mc.created_at ASC
  `;
  db.all(q, [postId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Erro ao carregar comentários' });
    res.json({ comments: rows });
  });
});

app.put('/api/mural/comments/:commentId/hide', authenticateToken, requireModeratorOrAdmin, (req, res) => {
  db.run('UPDATE mural_comments SET oculto = 1 WHERE id = ?', [req.params.commentId], function (err) {
    if (err) return res.status(500).json({ error: 'Erro ao ocultar comentário' });
    if (this.changes === 0) return res.status(404).json({ error: 'Comentário não encontrado' });
    res.json({ hidden: true });
  });
});
app.put('/api/mural/comments/:commentId/unhide', authenticateToken, requireModeratorOrAdmin, (req, res) => {
  db.run('UPDATE mural_comments SET oculto = 0 WHERE id = ?', [req.params.commentId], function (err) {
    if (err) return res.status(500).json({ error: 'Erro ao reexibir comentário' });
    if (this.changes === 0) return res.status(404).json({ error: 'Comentário não encontrado' });
    res.json({ unhidden: true });
  });
});
app.delete('/api/mural/comments/:commentId', authenticateToken, requireModeratorOrAdmin, (req, res) => {
  db.run('DELETE FROM mural_comments WHERE id = ?', [req.params.commentId], function (err) {
    if (err) return res.status(500).json({ error: 'Erro ao deletar comentário' });
    if (this.changes === 0) return res.status(404).json({ error: 'Comentário não encontrado' });
    res.json({ success: true, message: 'Comentário removido pela moderação' });
  });
});

// ======================
// Reservas
// ======================
app.get('/api/reservas', authenticateToken, (_req, res) => {
  db.all(
    `SELECT r.*, u.nome as responsavel 
     FROM reservas r JOIN usuarios u ON r.usuario_id = u.id 
     ORDER BY r.data, r.inicio`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Erro ao carregar reservas' });
      res.json({ reservas: rows });
    }
  );
});
app.post('/api/reservas', authenticateToken, (req, res) => {
  const { sala, data, inicio, fim, assunto, observacoes = null } = req.body || {};
  if (!sala || !data || !inicio || !fim || !assunto) return res.status(400).json({ error: 'Dados incompletos' });
  if (String(inicio) >= String(fim)) return res.status(400).json({ error: 'Horário inválido: início deve ser antes do fim' });

  const overlapSql = `
    SELECT 1 AS x FROM reservas
    WHERE sala = ? AND data = ? AND NOT (fim <= ? OR inicio >= ?)
    LIMIT 1
  `;
  db.get(overlapSql, [sala, data, inicio, fim], (err, row) => {
    if (err) return res.status(500).json({ error: 'Erro ao validar conflito' });
    if (row) return res.status(409).json({ error: 'Conflito de horário para esta sala' });

    const id = `reserva-${(crypto.randomUUID?.() || Date.now())}`;
    db.run(
      'INSERT INTO reservas (id, usuario_id, sala, data, inicio, fim, assunto, observacoes, responsavel) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, req.user.id, sala, data, inicio, fim, assunto, observacoes, req.user.name],
      (e) => {
        if (e) return res.status(500).json({ error: 'Erro ao criar reserva' });
        addPoints(req.user.id, 'RESERVA_CREATE', 8, `Reserva: ${sala} - ${assunto}`);
        res.json({ id, points: 8 });
      }
    );
  });
});

// ======================
// Trocas de proteína
// ======================
app.get('/api/trocas-proteina', authenticateToken, (req, res) => {
  const { from, to } = req.query || {};
  let query = 'SELECT * FROM trocas_proteina WHERE usuario_id = ?';
  const params = [req.user.id];
  if (from && to) { query += ' AND data BETWEEN ? AND ?'; params.push(from, to); }
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Erro ao carregar trocas' });
    res.json({ trocas: rows });
  });
});
app.post('/api/trocas-proteina/bulk', authenticateToken, (req, res) => {
  const { trocas } = req.body || {};
  if (!Array.isArray(trocas) || trocas.length === 0) return res.status(400).json({ error: 'Lista de trocas inválida' });
  let inseridas = 0; let totalPoints = 0;
  const processTroca = (i) => {
    if (i >= trocas.length) return res.json({ inseridas, totalPoints });
    const t = trocas[i] || {};
    const { data, proteina_original, proteina_nova } = t;
    if (!data || !proteina_original || !proteina_nova) { return processTroca(i + 1); }
    db.run(
      'INSERT OR REPLACE INTO trocas_proteina (usuario_id, data, proteina_original, proteina_nova) VALUES (?, ?, ?, ?)',
      [req.user.id, data, proteina_original, proteina_nova],
      (err) => {
        if (!err) { inseridas++; totalPoints += 5; addPoints(req.user.id, 'TROCA_PROTEINA', 5, `Troca: ${data}`); }
        processTroca(i + 1);
      }
    );
  };
  processTroca(0);
});

// ======================
// TI
// ======================
app.get('/api/ti/solicitacoes', authenticateToken, (_req, res) => {
  db.all(
    `SELECT ts.*, u.nome, u.email 
     FROM ti_solicitacoes ts JOIN usuarios u ON ts.usuario_id = u.id 
     ORDER BY ts.created_at DESC`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Erro ao carregar solicitações' });
      res.json(rows);
    }
  );
});
app.get('/api/ti/minhas', authenticateToken, (req, res) => {
  const email = (req.query && req.query.email) || req.user.email;
  db.all('SELECT * FROM ti_solicitacoes WHERE email = ? ORDER BY created_at DESC', [String(email).toLowerCase()], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Erro ao carregar solicitações' });
    res.json(rows);
  });
});
app.post('/api/ti/solicitacoes', authenticateToken, (req, res) => {
  const { titulo, descricao, prioridade, email, nome } = req.body || {};
  if (!titulo || !descricao) return res.status(400).json({ error: 'Título e descrição são obrigatórios' });
  const id = `ti-${(crypto.randomUUID?.() || Date.now())}`;
  db.run(
    'INSERT INTO ti_solicitacoes (id, usuario_id, email, nome, titulo, descricao, prioridade) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, req.user.id, (email || req.user.email).toLowerCase(), nome || req.user.name, titulo, descricao, prioridade || 'medium'],
    (err) => {
      if (err) return res.status(500).json({ error: 'Erro ao criar solicitação' });
      addPoints(req.user.id, 'TI_SOLICITACAO', 4, `Solicitação TI: ${titulo}`);
      res.json({ id, points: 4 });
    }
  );
});

// ======================
// Portaria
// ======================
app.get('/api/portaria/agendamentos', authenticateToken, (_req, res) => {
  db.all(
    `SELECT pa.*, u.nome as responsavel 
     FROM portaria_agendamentos pa JOIN usuarios u ON pa.usuario_id = u.id 
     ORDER BY pa.data, pa.hora`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Erro ao carregar agendamentos' });
      res.json({ agendamentos: rows });
    }
  );
});
app.post('/api/portaria/agendamentos', authenticateToken, (req, res) => {
  const { data, hora, visitante, documento, observacao } = req.body || {};
  if (!data || !hora || !visitante) return res.status(400).json({ error: 'Dados de agendamento incompletos' });
  const id = `agendamento-${(crypto.randomUUID?.() || Date.now())}`;
  db.run(
    'INSERT INTO portaria_agendamentos (id, usuario_id, data, hora, visitante, documento, observacao) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, req.user.id, data, hora, visitante, documento || null, observacao || null],
    (err) => {
      if (err) return res.status(500).json({ error: 'Erro ao criar agendamento' });
      addPoints(req.user.id, 'PORTARIA_CREATE', 6, `Agendamento: ${visitante}`);
      res.json({ id, points: 6 });
    }
  );
});

// ======================
// Admin Dashboard (retorna userName)
// ======================
app.get('/api/admin/dashboard', authenticateToken, (req, res) => {
  if (!isPrivileged(req.user)) return res.status(403).json({ error: 'Acesso negado' });

  const stats = {};
  const ps = [
    new Promise((r) => db.get('SELECT COUNT(*) as count FROM usuarios WHERE ativo = 1', (_e, row) => { stats.usuarios_ativos = row?.count || 0; r(); })),
    new Promise((r) => db.get('SELECT COUNT(*) as count FROM mural_posts WHERE ativo = 1', (_e, row) => { stats.posts_mural = row?.count || 0; r(); })),
    new Promise((r) => db.get('SELECT COUNT(*) as count FROM reservas', (_e, row) => { stats.reservas_salas = row?.count || 0; r(); })),
    new Promise((r) => db.get('SELECT COUNT(*) as count FROM ti_solicitacoes', (_e, row) => { stats.solicitacoes_ti = row?.count || 0; r(); })),
    new Promise((r) => db.get('SELECT COUNT(*) as count FROM trocas_proteina', (_e, row) => { stats.trocas_proteina = row?.count || 0; r(); })),
    new Promise((r) => db.get('SELECT COUNT(*) as count FROM portaria_agendamentos', (_e, row) => { stats.agendamentos_portaria = row?.count || 0; r(); })),
  ];

  Promise.all(ps).then(() => {
    db.get('SELECT nome, email, pontos_gamificacao FROM usuarios WHERE id = ?', [req.user.id], (_e1, up) => {
      const userName = computeName(up?.email || req.user.email, up?.nome, req.user?.name);
      ensureDbName(req.user.id, up?.nome, userName);

      db.all(
        'SELECT nome, pontos_gamificacao as total_pontos FROM usuarios WHERE ativo = 1 ORDER BY pontos_gamificacao DESC LIMIT 10',
        (_e2, ranking) => res.json({
          stats,
          userPoints: up?.pontos_gamificacao || 0,
          userName,                // <— use este no cabeçalho acima dos pontos
          ranking: ranking || [],
          breakdown: []
        })
      );
    });
  }).catch((e) => {
    console.error('[admin/dashboard]', e);
    res.status(500).json({ error: 'Erro ao montar dashboard' });
  });
});

// ======================
// Health/Ping e 404
// ======================
app.get('/api/health', (_req, res) => res.json({ status: 'OK', timestamp: new Date().toISOString() }));
app.get('/healthz', (_req, res) => res.json({ status: 'OK', timestamp: new Date().toISOString() }));
app.get('/api/ping', (_req, res) => res.send('pong'));

// Config endpoint for frontend
app.get('/api/config', (_req, res) => {
  res.json({
    googleEnabled: !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET),
    environment: NODE_ENV,
    version: '1.0.0',
    googleCallbackUrl: GOOGLE_CALLBACK_URL,
    frontendUrl: WEB_URL
  });
});

// Test endpoint for checking auth
app.get('/api/test-auth', authenticateToken, (req, res) => {
  res.json({
    authenticated: true,
    user: req.user,
    timestamp: new Date().toISOString()
  });
});

// Debug endpoint (development only)
if (NODE_ENV === 'development') {
  app.get('/api/debug', (req, res) => {
    res.json({
      NODE_ENV,
      WEB_URL,
      GOOGLE_CONFIGURED: !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET),
      JWT_SECRET_SET: !!JWT_SECRET,
      timestamp: new Date().toISOString(),
      cookies: req.cookies,
      headers: req.headers
    });
  });
}

// Serve static files from dist in production
if (NODE_ENV === 'production') {
  const path = require('path');
  const distPath = path.join(__dirname, 'dist');
  console.log('📁 Serving static files from:', distPath);
  app.use(express.static(distPath));
  
  // Catch-all handler for SPA
  app.get('*', (req, res, next) => {
    // Skip API routes
    if (req.path.startsWith('/api/') || 
        req.path.startsWith('/auth/') || 
        req.path.startsWith('/healthz') ||
        req.path.startsWith('/login-admin')) {
      return next();
    }
    
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// 404 handlers - must be after all other routes
// 404 handlers for API routes
app.all(/^\/api\/.*/, (req, res) => {
  console.log('[404] API route not found:', req.method, req.path);
  res.status(404).json({ error: 'API endpoint not found', path: req.path, method: req.method });
});

// 404 handlers for Auth routes  
app.all(/^\/auth\/.*/, (req, res) => {
  console.log('[404] Auth route not found:', req.method, req.path);
  res.status(404).json({ error: 'Auth endpoint not found', path: req.path, method: req.method });
});

app.use((err, _req, res, _next) => {
  console.error('[SERVER ERROR]', err?.stack || err?.message || err);
  res.status(500).json({ error: 'Internal server error' });
});

// ======================
// Start
// ======================
const server = app.listen(PORT, HOST, () => {
  console.log(`🚀 Backend server running on http://${HOST}:${PORT}`);
  console.log(`📁 Database: ${dbPath}`);
  console.log(`🌍 Environment: ${NODE_ENV}`);
  console.log(`✅ Frontend (WEB_URL): ${WEB_URL}`);
  console.log(`🔐 Google OAuth: ${GOOGLE_CLIENT_ID ? 'ENABLED' : 'DISABLED'}`);
  console.log('✅ Server ready to accept connections');
});
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
server.on('error', (e) => console.error('[HTTP Server error]', e));

// Graceful shutdown
const shutdown = (signal) => {
  console.log(`\n🛑 Shutting down server (${signal})...`);
  db.close((err) => {
    if (err) console.error('Error closing database:', err);
    else console.log('📚 Database connection closed');
    process.exit(0);
  });
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));