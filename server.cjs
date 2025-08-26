#!/usr/bin/env node
// server.cjs - Backend Express + SQLite (Express 5 compatível)
// - Login local (usuário/e-mail + senha)
// - Login Google OAuth (cookies httpOnly)
// - JWT + CORS + PRAGMAs SQLite (WAL, busy_timeout, foreign_keys)
// - Módulos: Mural, Equipamentos TI, Reservas, Portaria, Painel Admin

'use strict';

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const helmet = require('helmet');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const path = require('path');
const fs = require('fs');
const { nanoid } = require('nanoid');

// =======================
// Config / Ambiente
// =======================
const app = express();

const HOST_ENV = process.env.HOST || '0.0.0.0'; // evite usar "https://localhost" aqui
const PORT = Number(process.env.PORT) || 3006;
const NODE_ENV = process.env.NODE_ENV || 'development';
const WEB_URL = process.env.WEB_URL || 'http://localhost:5173';

const JWT_SECRET = process.env.JWT_SECRET || 'cropfield-secret-key-2025';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_CALLBACK_URL =
  process.env.GOOGLE_CALLBACK_URL || `http://localhost:${PORT}/auth/google/callback`;

// Origem permitida para CORS
const ALLOWED_ORIGINS = [
  WEB_URL,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

// Cookies seguros se produção + https
const IS_PROD = NODE_ENV === 'production';
const COOKIE_SECURE = IS_PROD || WEB_URL.startsWith('https://');

// =======================
// Middlewares
// =======================
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cors({
  origin: function (origin, cb) {
    if (!origin) return cb(null, true); // allow Postman/cURL
    const ok = ALLOWED_ORIGINS.some((o) => origin.startsWith(o));
    cb(ok ? null : new Error('Not allowed by CORS'), ok);
  },
  credentials: true,
}));

// =======================
// Banco de Dados (SQLite)
// =======================
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, function (err, row) {
      if (err) return reject(err);
      resolve(row);
    });
  });
}
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, function (err, rows) {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function ensureColumn(table, column, type, defaultSql = null) {
  const info = await all(`PRAGMA table_info(${table});`);
  const exists = info.some((c) => c.name === column);
  if (!exists) {
    await run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type} ${defaultSql ? `DEFAULT ${defaultSql}` : ''};`);
  }
}

async function initDb() {
  await run('PRAGMA journal_mode = WAL;');
  await run('PRAGMA foreign_keys = ON;');
  await run('PRAGMA busy_timeout = 5000;');

  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario TEXT UNIQUE,
      nome TEXT NOT NULL,
      email TEXT UNIQUE,
      senha_hash TEXT,
      role TEXT DEFAULT 'colaborador',
      setor TEXT DEFAULT 'colaborador',
      can_publish_mural INTEGER DEFAULT 0,
      can_moderate_mural INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS mural_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT NOT NULL,
      conteudo TEXT NOT NULL,
      author_id INTEGER NOT NULL,
      pinned INTEGER DEFAULT 0,
      hidden INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS mural_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      author_id INTEGER NOT NULL,
      texto TEXT NOT NULL,
      hidden INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (post_id) REFERENCES mural_posts(id) ON DELETE CASCADE,
      FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS equipamentos_ti (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      titulo TEXT NOT NULL,
      descricao TEXT,
      status TEXT DEFAULT 'aberta', -- aberta, em_andamento, concluida, cancelada
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS reservas_salas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sala TEXT NOT NULL,
      titulo TEXT NOT NULL,
      descricao TEXT,
      inicio TEXT NOT NULL,
      fim TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS portaria_agendamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      visitante_nome TEXT NOT NULL,
      documento TEXT,
      empresa TEXT,
      motivo TEXT,
      inicio TEXT NOT NULL,
      fim TEXT NOT NULL,
      responsavel_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (responsavel_id) REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  // Garantir colunas novas quando necessário
  await ensureColumn('users', 'usuario', 'TEXT', null).catch(() => {});

  // Seeds de admin-ti e admin-rh
  const adminTi = await get(`SELECT id FROM users WHERE usuario = ?`, ['admin-ti']);
  if (!adminTi) {
    const hash = await bcrypt.hash('admin123', 10);
    await run(`
      INSERT INTO users (usuario, nome, email, senha_hash, role, setor, can_publish_mural, can_moderate_mural, is_active)
      VALUES (?, ?, ?, ?, 'admin-ti', 'TI', 1, 1, 1);
    `, ['admin-ti', 'Admin TI', 'admin-ti@cropfield.local', hash]);
  }
  const adminRh = await get(`SELECT id FROM users WHERE usuario = ?`, ['admin-rh']);
  if (!adminRh) {
    const hash = await bcrypt.hash('admin123', 10);
    await run(`
      INSERT INTO users (usuario, nome, email, senha_hash, role, setor, can_publish_mural, can_moderate_mural, is_active)
      VALUES (?, ?, ?, ?, 'admin-rh', 'RH', 1, 1, 1);
    `, ['admin-rh', 'Admin RH', 'admin-rh@cropfield.local', hash]);
  }
}

// =======================
// JWT / Auth Helpers
// =======================
function signToken(user) {
  const payload = {
    id: user.id,
    usuario: user.usuario,
    nome: user.nome,
    email: user.email,
    role: user.role,
    setor: user.setor,
    can_publish_mural: !!user.can_publish_mural,
    can_moderate_mural: !!user.can_moderate_mural,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

async function authFromReq(req) {
  const bearer = req.headers.authorization && req.headers.authorization.startsWith('Bearer ')
    ? req.headers.authorization.slice('Bearer '.length)
    : null;
  const token = req.cookies.token || bearer;
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await get(`SELECT * FROM users WHERE id = ? AND is_active = 1`, [decoded.id]);
    return user || null;
  } catch {
    return null;
  }
}

async function requireAuth(req, res, next) {
  const user = await authFromReq(req);
  if (!user) return res.status(401).json({ error: 'Não autenticado' });
  req.user = user;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Sem permissão' });
    next();
  };
}

function requirePermission(flag) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado' });
    if (!req.user[flag]) return res.status(403).json({ error: 'Sem permissão' });
    next();
  };
}

// =======================
// Passport Google OAuth
// =======================
if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy(
    {
      clientID: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      callbackURL: GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
        const nome = profile.displayName || (profile.name ? `${profile.name.givenName || ''} ${profile.name.familyName || ''}`.trim() : 'Usuário');
        let user = null;
        if (email) {
          user = await get(`SELECT * FROM users WHERE email = ?`, [email]);
        }
        if (!user) {
          // Novo usuário padrão colaborador (sem publicar até o admin conceder)
          const usuarioGerado = (email ? email.split('@')[0] : `user_${nanoid(6)}`).toLowerCase();
          await run(`
            INSERT INTO users (usuario, nome, email, role, setor, can_publish_mural, can_moderate_mural, is_active)
            VALUES (?, ?, ?, 'colaborador', 'colaborador', 0, 0, 1)
          `, [usuarioGerado, nome, email]);
          user = await get(`SELECT * FROM users WHERE email = ?`, [email]);
        }
        return done(null, user);
      } catch (e) {
        return done(e);
      }
    }
  ));
  app.use(passport.initialize());
}

// =======================
// Rotas - Auth
// =======================
app.get('/health', (req, res) => {
  res.json({ ok: true, env: NODE_ENV, db: path.relative(process.cwd(), dbPath) });
});

// Login local (usuário OU e-mail) + senha
app.post('/auth/local/login', async (req, res) => {
  try {
    const { usuario, email, senha } = req.body || {};
    if ((!usuario && !email) || !senha) {
      return res.status(400).json({ error: 'Informe usuário/e-mail e senha' });
    }
    const user = await get(
      `SELECT * FROM users WHERE (usuario = ? OR email = ?) AND is_active = 1`,
      [usuario || email, usuario || email]
    );
    if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });
    if (!user.senha_hash) return res.status(401).json({ error: 'Usuário sem senha local' });
    const ok = await bcrypt.compare(senha, user.senha_hash);
    if (!ok) return res.status(401).json({ error: 'Credenciais inválidas' });

    const token = signToken(user);
    res.cookie('token', token, {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({ user: { ...user, senha_hash: undefined } });
  } catch (e) {
    res.status(500).json({ error: 'Falha no login', detail: e.message });
  }
});

// Registro local opcional (pode ser restrito no futuro)
app.post('/auth/local/register', async (req, res) => {
  try {
    const { usuario, nome, email, senha } = req.body || {};
    if (!usuario || !nome || !email || !senha) {
      return res.status(400).json({ error: 'usuario, nome, email e senha são obrigatórios' });
    }
    const exists = await get(`SELECT id FROM users WHERE usuario = ? OR email = ?`, [usuario, email]);
    if (exists) return res.status(409).json({ error: 'Usuário/e-mail já cadastrado' });

    const hash = await bcrypt.hash(senha, 10);
    await run(`
      INSERT INTO users (usuario, nome, email, senha_hash, role, setor, can_publish_mural, can_moderate_mural, is_active)
      VALUES (?, ?, ?, ?, 'colaborador', 'colaborador', 0, 0, 1)
    `, [usuario, nome, email, hash]);

    res.status(201).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Falha no registro', detail: e.message });
  }
});

app.post('/auth/logout', (req, res) => {
  res.clearCookie('token', { httpOnly: true, secure: COOKIE_SECURE, sameSite: 'lax' });
  res.json({ ok: true });
});

app.get('/api/me', async (req, res) => {
  const user = await authFromReq(req);
  if (!user) return res.status(200).json({ user: null });
  res.json({ user: { ...user, senha_hash: undefined } });
});

// Google OAuth
if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  app.get('/auth/google',
    passport.authenticate('google', {
      scope: ['profile', 'email'],
      prompt: 'select_account',
      session: false,
    })
  );

  app.get('/auth/google/callback',
    passport.authenticate('google', { session: false, failureRedirect: WEB_URL + '/login' }),
    async (req, res) => {
      const user = req.user;
      const token = signToken(user);
      res.cookie('token', token, {
        httpOnly: true,
        secure: COOKIE_SECURE,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      // redireciona para a página do app que trata pós-login
      res.redirect(WEB_URL + '/login-google');
    }
  );
} else {
  console.log('⚠️ Google OAuth não configurado - defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no .env');
}

// =======================
// Rotas - Admin (Usuários)
// =======================
app.get('/api/admin/users', requireAuth, requireRole('admin-ti', 'admin-rh'), async (req, res) => {
  try {
    const rows = await all(`SELECT id, usuario, nome, email, role, setor, can_publish_mural, can_moderate_mural, is_active, created_at FROM users ORDER BY created_at DESC`);
    res.json({ users: rows });
  } catch (e) {
    res.status(500).json({ error: 'Falha ao listar usuários', detail: e.message });
  }
});

app.post('/api/admin/users', requireAuth, requireRole('admin-ti', 'admin-rh'), async (req, res) => {
  try {
    const { usuario, nome, email, senha, role = 'colaborador', setor = 'colaborador', can_publish_mural = 0, can_moderate_mural = 0, is_active = 1 } = req.body || {};
    if (!usuario || !nome || !email || !senha) {
      return res.status(400).json({ error: 'usuario, nome, email e senha são obrigatórios' });
    }
    const exists = await get(`SELECT id FROM users WHERE usuario = ? OR email = ?`, [usuario, email]);
    if (exists) return res.status(409).json({ error: 'Usuário/e-mail já cadastrado' });
    const hash = await bcrypt.hash(senha, 10);
    await run(`
      INSERT INTO users (usuario, nome, email, senha_hash, role, setor, can_publish_mural, can_moderate_mural, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [usuario, nome, email, hash, role, setor, can_publish_mural ? 1 : 0, can_moderate_mural ? 1 : 0, is_active ? 1 : 0]);
    res.status(201).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Falha ao criar usuário', detail: e.message });
  }
});

app.patch('/api/admin/users/:id', requireAuth, requireRole('admin-ti', 'admin-rh'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { nome, email, role, setor, can_publish_mural, can_moderate_mural, is_active } = req.body || {};
    const user = await get(`SELECT * FROM users WHERE id = ?`, [id]);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    await run(`
      UPDATE users SET
        nome = COALESCE(?, nome),
        email = COALESCE(?, email),
        role = COALESCE(?, role),
        setor = COALESCE(?, setor),
        can_publish_mural = COALESCE(?, can_publish_mural),
        can_moderate_mural = COALESCE(?, can_moderate_mural),
        is_active = COALESCE(?, is_active)
      WHERE id = ?
    `, [
      nome ?? null,
      email ?? null,
      role ?? null,
      setor ?? null,
      typeof can_publish_mural === 'boolean' ? (can_publish_mural ? 1 : 0) : null,
      typeof can_moderate_mural === 'boolean' ? (can_moderate_mural ? 1 : 0) : null,
      typeof is_active === 'boolean' ? (is_active ? 1 : 0) : null,
      id
    ]);

    const updated = await get(`SELECT id, usuario, nome, email, role, setor, can_publish_mural, can_moderate_mural, is_active, created_at FROM users WHERE id = ?`, [id]);
    res.json({ user: updated });
  } catch (e) {
    res.status(500).json({ error: 'Falha ao atualizar usuário', detail: e.message });
  }
});

app.post('/api/admin/users/:id/reset-password', requireAuth, requireRole('admin-ti', 'admin-rh'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { nova_senha } = req.body || {};
    if (!nova_senha) return res.status(400).json({ error: 'nova_senha é obrigatória' });
    const hash = await bcrypt.hash(nova_senha, 10);
    await run(`UPDATE users SET senha_hash = ? WHERE id = ?`, [hash, id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Falha ao resetar senha', detail: e.message });
  }
});

// =======================
// Rotas - Mural
// =======================
app.get('/api/mural/posts', requireAuth, async (req, res) => {
  try {
    const posts = await all(`
      SELECT p.*, u.nome AS author_nome, u.usuario AS author_usuario
      FROM mural_posts p
      JOIN users u ON u.id = p.author_id
      WHERE p.hidden = 0
      ORDER BY p.pinned DESC, p.created_at DESC
    `);

    // contar comentários
    const ids = posts.map(p => p.id);
    let counts = {};
    if (ids.length) {
      const rows = await all(`
        SELECT post_id, COUNT(*) AS c FROM mural_comments
        WHERE hidden = 0 AND post_id IN (${ids.map(() => '?').join(',')})
        GROUP BY post_id
      `, ids);
      rows.forEach(r => { counts[r.post_id] = r.c; });
    }

    const out = posts.map(p => ({
      ...p,
      comments_count: counts[p.id] || 0
    }));
    res.json({ posts: out });
  } catch (e) {
    res.status(500).json({ error: 'Falha ao listar posts', detail: e.message });
  }
});

app.post('/api/mural/posts', requireAuth, async (req, res) => {
  try {
    const can = req.user.role === 'admin-ti' || req.user.role === 'admin-rh' || !!req.user.can_publish_mural;
    if (!can) return res.status(403).json({ error: 'Sem permissão para publicar' });

    const { titulo, conteudo, pinned = false } = req.body || {};
    if (!titulo || !conteudo) return res.status(400).json({ error: 'titulo e conteudo são obrigatórios' });

    await run(`
      INSERT INTO mural_posts (titulo, conteudo, author_id, pinned)
      VALUES (?, ?, ?, ?)
    `, [titulo, conteudo, req.user.id, pinned ? 1 : 0]);
    res.status(201).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Falha ao criar post', detail: e.message });
  }
});

app.get('/api/mural/posts/:id/comments', requireAuth, async (req, res) => {
  try {
    const postId = Number(req.params.id);
    const comments = await all(`
      SELECT c.*, u.nome AS author_nome, u.usuario AS author_usuario
      FROM mural_comments c
      JOIN users u ON u.id = c.author_id
      WHERE c.post_id = ? AND c.hidden = 0
      ORDER BY c.created_at ASC
    `, [postId]);
    res.json({ comments });
  } catch (e) {
    res.status(500).json({ error: 'Falha ao listar comentários', detail: e.message });
  }
});

app.post('/api/mural/posts/:id/comments', requireAuth, async (req, res) => {
  try {
    const postId = Number(req.params.id);
    const { texto } = req.body || {};
    if (!texto) return res.status(400).json({ error: 'texto é obrigatório' });
    const post = await get(`SELECT id FROM mural_posts WHERE id = ? AND hidden = 0`, [postId]);
    if (!post) return res.status(404).json({ error: 'Post não encontrado' });

    await run(`
      INSERT INTO mural_comments (post_id, author_id, texto)
      VALUES (?, ?, ?)
    `, [postId, req.user.id, texto]);
    res.status(201).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Falha ao comentar', detail: e.message });
  }
});

// Moderação: esconder/mostrar comentários (moderadores ou admins)
app.patch('/api/mural/comments/:id/hidden', requireAuth, async (req, res) => {
  try {
    const can = req.user.role === 'admin-ti' || req.user.role === 'admin-rh' || !!req.user.can_moderate_mural;
    if (!can) return res.status(403).json({ error: 'Sem permissão de moderação' });
    const id = Number(req.params.id);
    const { hidden } = req.body || {};
    await run(`UPDATE mural_comments SET hidden = ? WHERE id = ?`, [hidden ? 1 : 0, id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Falha ao moderar comentário', detail: e.message });
  }
});

// Fixar/ocultar post (admins)
app.patch('/api/mural/posts/:id', requireAuth, requireRole('admin-ti', 'admin-rh'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { pinned, hidden } = req.body || {};
    const post = await get(`SELECT * FROM mural_posts WHERE id = ?`, [id]);
    if (!post) return res.status(404).json({ error: 'Post não encontrado' });
    await run(`
      UPDATE mural_posts
      SET pinned = COALESCE(?, pinned),
          hidden = COALESCE(?, hidden)
      WHERE id = ?
    `, [
      typeof pinned === 'boolean' ? (pinned ? 1 : 0) : null,
      typeof hidden === 'boolean' ? (hidden ? 1 : 0) : null,
      id
    ]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Falha ao atualizar post', detail: e.message });
  }
});

// =======================
// Rotas - Equipamentos TI
// =======================
app.post('/api/equipamentos', requireAuth, async (req, res) => {
  try {
    const { titulo, descricao } = req.body || {};
    if (!titulo) return res.status(400).json({ error: 'titulo é obrigatório' });
    await run(`
      INSERT INTO equipamentos_ti (user_id, titulo, descricao)
      VALUES (?, ?, ?)
    `, [req.user.id, titulo, descricao || null]);
    res.status(201).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Falha ao criar solicitação TI', detail: e.message });
  }
});

app.get('/api/equipamentos/minhas', requireAuth, async (req, res) => {
  try {
    const rows = await all(`
      SELECT e.*, u.nome AS user_nome
      FROM equipamentos_ti e
      JOIN users u ON u.id = e.user_id
      WHERE e.user_id = ?
      ORDER BY e.created_at DESC
    `, [req.user.id]);
    res.json({ items: rows });
  } catch (e) {
    res.status(500).json({ error: 'Falha ao listar minhas solicitações TI', detail: e.message });
  }
});

// Apenas TI visualiza todas
app.get('/api/admin/equipamentos', requireAuth, requireRole('admin-ti'), async (req, res) => {
  try {
    const rows = await all(`
      SELECT e.*, u.nome AS user_nome, u.setor AS user_setor
      FROM equipamentos_ti e
      JOIN users u ON u.id = e.user_id
      ORDER BY e.created_at DESC
    `);
    res.json({ items: rows });
  } catch (e) {
    res.status(500).json({ error: 'Falha ao listar solicitações TI', detail: e.message });
  }
});

app.patch('/api/admin/equipamentos/:id', requireAuth, requireRole('admin-ti'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body || {};
    if (!status) return res.status(400).json({ error: 'status é obrigatório' });
    await run(`UPDATE equipamentos_ti SET status = ? WHERE id = ?`, [status, id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Falha ao atualizar solicitação TI', detail: e.message });
  }
});

// =======================
// Rotas - Reservas de Salas
// =======================
app.get('/api/reservas', requireAuth, async (req, res) => {
  try {
    const rows = await all(`SELECT * FROM reservas_salas ORDER BY inicio DESC`);
    res.json({ eventos: rows });
  } catch (e) {
    res.status(500).json({ error: 'Falha ao listar reservas', detail: e.message });
  }
});

app.post('/api/reservas', requireAuth, async (req, res) => {
  try {
    const { sala, titulo, descricao, inicio, fim } = req.body || {};
    if (!sala || !titulo || !inicio || !fim) {
      return res.status(400).json({ error: 'sala, titulo, inicio e fim são obrigatórios' });
    }
    await run(`
      INSERT INTO reservas_salas (sala, titulo, descricao, inicio, fim, user_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [sala, titulo, descricao || null, inicio, fim, req.user.id]);
    res.status(201).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Falha ao criar reserva', detail: e.message });
  }
});

app.delete('/api/reservas/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await run(`DELETE FROM reservas_salas WHERE id = ?`, [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Falha ao excluir reserva', detail: e.message });
  }
});

// =======================
// Rotas - Portaria (Agendamentos)
// =======================
app.get('/api/portaria', requireAuth, async (req, res) => {
  try {
    const rows = await all(`SELECT * FROM portaria_agendamentos ORDER BY inicio DESC`);
    res.json({ eventos: rows });
  } catch (e) {
    res.status(500).json({ error: 'Falha ao listar agendamentos', detail: e.message });
  }
});

app.post('/api/portaria', requireAuth, async (req, res) => {
  try {
    const { visitante_nome, documento, empresa, motivo, inicio, fim } = req.body || {};
    if (!visitante_nome || !inicio || !fim) {
      return res.status(400).json({ error: 'visitante_nome, inicio e fim são obrigatórios' });
    }
    await run(`
      INSERT INTO portaria_agendamentos (visitante_nome, documento, empresa, motivo, inicio, fim, responsavel_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [visitante_nome, documento || null, empresa || null, motivo || null, inicio, fim, req.user.id]);
    res.status(201).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Falha ao criar agendamento', detail: e.message });
  }
});

// =======================
// Admin Dashboard simples
// =======================
app.get('/api/admin/dashboard', requireAuth, requireRole('admin-ti', 'admin-rh'), async (req, res) => {
  try {
    const totalUsers = await get(`SELECT COUNT(*) AS c FROM users`);
    const totalPosts = await get(`SELECT COUNT(*) AS c FROM mural_posts WHERE hidden = 0`);
    const totalComments = await get(`SELECT COUNT(*) AS c FROM mural_comments WHERE hidden = 0`);
    const tiOpen = await get(`SELECT COUNT(*) AS c FROM equipamentos_ti WHERE status != 'concluida' AND status != 'cancelada'`);
    res.json({
      users: totalUsers.c,
      posts: totalPosts.c,
      comments: totalComments.c,
      ti_abertas: tiOpen.c,
    });
  } catch (e) {
    res.status(500).json({ error: 'Falha ao carregar dashboard', detail: e.message });
  }
});

// =======================
// Boot
// =======================
(async () => {
  await initDb();

  app.listen(PORT, HOST_ENV, () => {
    console.log('🔐 Google OAuth Config:', {
      clientId: GOOGLE_CLIENT_ID ? '(definido)' : 'Não configurado',
      clientSecret: GOOGLE_CLIENT_SECRET ? '(definido)' : 'Não configurado',
      callbackUrl: GOOGLE_CALLBACK_URL,
    });
    console.log(`🚀 Backend rodando em http://${HOST_ENV}:${PORT}`);
    console.log(`📁 Database: ${dbPath}`);
    console.log(`🌍 Environment: ${NODE_ENV}`);
    console.log(`✅ CORS origin permitido: ${ALLOWED_ORIGINS.join(', ')}`);
  });

  // Keep-alive leve do DB (evita idle em alguns ambientes)
  setInterval(() => {
    db.get('SELECT 1', [], () => {});
  }, 60_000);
})();
