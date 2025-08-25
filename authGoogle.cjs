#!/usr/bin/env node
// authGoogle.cjs — Google OAuth com Passport + cookie HTTP-Only
'use strict';
require('dotenv').config();

const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3005/auth/google/callback';
const WEB_URL = process.env.WEB_URL || 'http://localhost:5173';
const JWT_SECRET = process.env.JWT_SECRET || 'cropfield-secret-key-2025';

const OAUTH_ENABLED = !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);

// ——— Helpers (opcional: integra SQLite se você passar db) ———
function ensureAndUpsertUser(db, profile) {
  return new Promise((resolve, reject) => {
    const email = profile.emails?.[0]?.value || '';
    const nome = profile.displayName || '';
    const picture = profile.photos?.[0]?.value || '';

    if (!email) return reject(new Error('Perfil Google sem e-mail.'));

    if (!db) {
      // Sem DB? retorna payload mínimo
      return resolve({
        id: Number(Date.now() % 1e6),
        nome, email, picture, setor: 'Colaborador', role: 'colaborador', provider: 'google'
      });
    }

    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS usuarios (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nome TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          picture TEXT,
          setor TEXT DEFAULT 'Colaborador',
          role TEXT DEFAULT 'colaborador',   -- colaborador | admin-ti | admin-rh | moderador
          provider TEXT DEFAULT 'google',
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);

      db.get(`SELECT * FROM usuarios WHERE email = ?`, [email], (err, row) => {
        if (err) return reject(err);

        if (row) {
          db.run(
            `UPDATE usuarios SET nome = ?, picture = ?, provider = 'google' WHERE email = ?`,
            [nome, picture, email],
            (e2) => {
              if (e2) return reject(e2);
              db.get(`SELECT * FROM usuarios WHERE email = ?`, [email], (e3, refreshed) => {
                if (e3) return reject(e3);
                resolve(refreshed);
              });
            }
          );
        } else {
          db.run(
            `INSERT INTO usuarios (nome, email, picture, setor, role, provider) VALUES (?, ?, ?, 'Colaborador', 'colaborador', 'google')`,
            [nome, email, picture],
            function (e2) {
              if (e2) return reject(e2);
              db.get(`SELECT * FROM usuarios WHERE id = ?`, [this.lastID], (e3, inserted) => {
                if (e3) return reject(e3);
                resolve(inserted);
              });
            }
          );
        }
      });
    });
  });
}

// ——— Instala rotas do Google OAuth ———
function installGoogleAuth(app, db) {
  console.log('🔐 Google OAuth enabled:', OAUTH_ENABLED);
  console.log('🔁 Callback:', GOOGLE_CALLBACK_URL);

  // Frontend pode checar se o botão Google deve aparecer
  app.get('/api/config', (_req, res) => res.json({ googleEnabled: OAUTH_ENABLED }));

  if (!OAUTH_ENABLED) {
    app.get('/auth/google', (_req, res) => res.status(503).json({ ok: false, error: 'google_oauth_disabled' }));
    app.get('/auth/google/callback', (_req, res) => res.redirect(`${WEB_URL}/login?error=google_disabled`));
    app.post('/auth/logout', (req, res) => { res.clearCookie('intranet_token', { path: '/' }); res.json({ ok: true }); });
    return;
  }

  passport.use(new GoogleStrategy(
    {
      clientID:     GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      callbackURL:  GOOGLE_CALLBACK_URL,
      passReqToCallback: true
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        const user = await ensureAndUpsertUser(db, profile);
        const payload = {
          id: user.id,
          nome: user.nome,
          email: user.email,
          picture: user.picture,
          role: user.role,
          setor: user.setor,
          provider: 'google'
        };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
        req._oauthToken = token; // usado no callback
        return done(null, payload);
      } catch (err) {
        return done(err);
      }
    }
  ));

  app.use(passport.initialize());

  // Início do fluxo
  app.get('/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'], prompt: 'select_account', session: false })
  );

  // Callback: seta cookie e volta ao app
  app.get('/auth/google/callback', (req, res, next) => {
    passport.authenticate('google', { session: false }, (err, user) => {
      if (err) {
        console.error('❌ Google callback error:', err);
        return res.redirect(`${WEB_URL}/login?error=google`);
      }
      if (!user || !req._oauthToken) {
        console.error('❌ Sem user/token no callback');
        return res.redirect(`${WEB_URL}/login?error=no_token`);
      }
      const isProd = process.env.NODE_ENV === 'production';
      res.cookie('intranet_token', req._oauthToken, {
        httpOnly: true,
        secure: isProd,                 // true em produção (HTTPS)
        sameSite: isProd ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/'
      });
      return res.redirect(`${WEB_URL}/`);
    })(req, res, next);
  });

  // Logout (limpa cookie)
  app.post('/auth/logout', (req, res) => {
    res.clearCookie('intranet_token', { path: '/' });
    res.json({ ok: true });
  });
}

module.exports = { installGoogleAuth };
