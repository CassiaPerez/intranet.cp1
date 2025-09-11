const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'sua-chave-secreta-super-segura';

// CORS configuration
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'https://intranet.cropfield.com.br'
  ],
  credentials: true
}));

app.use(express.json());
app.use(express.static('public'));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// Database setup
const db = new sqlite3.Database('./database.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database.');
    
    // Create tables if they don't exist
    db.serialize(() => {
      // Create usuarios table for manual login
      db.run(`
        CREATE TABLE IF NOT EXISTS usuarios (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          usuario TEXT UNIQUE NOT NULL,
          nome TEXT NOT NULL,
          senha_hash TEXT NOT NULL,
          setor TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'colaborador',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create authorized_emails table for Google OAuth
      db.run(`
        CREATE TABLE IF NOT EXISTS authorized_emails (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE NOT NULL,
          nome TEXT,
          setor TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'colaborador',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Insert admin users if they don't exist
      const saltRounds = 10;
      bcrypt.hash('admin123', saltRounds, (err, hash) => {
        if (err) {
          console.error('Error hashing password:', err);
          return;
        }

        db.run(`
          INSERT OR IGNORE INTO usuarios (usuario, nome, senha_hash, setor, role)
          VALUES (?, ?, ?, ?, ?)
        `, ['admin-ti', 'Administrador TI', hash, 'TI', 'admin']);

        db.run(`
          INSERT OR IGNORE INTO usuarios (usuario, nome, senha_hash, setor, role)
          VALUES (?, ?, ?, ?, ?)
        `, ['admin-rh', 'Administrador RH', hash, 'RH', 'admin']);
      });
    });
  }
});

// Passport configuration for Google OAuth
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback"
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails[0].value;
      
      db.get(
        "SELECT * FROM authorized_emails WHERE email = ?",
        [email],
        (err, row) => {
          if (err) {
            return done(err);
          }
          
          if (row) {
            const user = {
              id: profile.id,
              email: email,
              nome: row.nome || profile.displayName,
              setor: row.setor,
              role: row.role,
              picture: profile.photos[0]?.value
            };
            return done(null, user);
          } else {
            return done(null, false, { message: 'Email não autorizado no sistema' });
          }
        }
      );
    } catch (error) {
      return done(error);
    }
  }));
}

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

// Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Configuration endpoint
app.get('/api/config', (req, res) => {
  res.json({
    googleEnabled: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
  });
});

// Manual login endpoint for admin users
app.post('/api/login-admin', async (req, res) => {
  try {
    const { usuario, senha } = req.body;

    if (!usuario || !senha) {
      return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
    }

    // Find user in database
    db.get(
      "SELECT * FROM usuarios WHERE usuario = ? AND role = 'admin'",
      [usuario],
      async (err, row) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Erro interno do servidor' });
        }

        if (!row) {
          return res.status(401).json({ error: 'Usuário ou senha inválidos' });
        }

        // Verify password
        try {
          const isValidPassword = await bcrypt.compare(senha, row.senha_hash);
          
          if (!isValidPassword) {
            return res.status(401).json({ error: 'Usuário ou senha inválidos' });
          }

          // Create JWT token
          const token = jwt.sign(
            { 
              id: row.id,
              usuario: row.usuario,
              setor: row.setor,
              role: row.role 
            },
            JWT_SECRET,
            { expiresIn: '24h' }
          );

          // Set cookie
          res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
          });

          // Return user data
          const userData = {
            id: row.id.toString(),
            usuario: row.usuario,
            nome: row.nome,
            email: `${row.usuario}@empresa.local`, // Generate email for compatibility
            setor: row.setor,
            role: row.role
          };

          res.json({
            success: true,
            user: userData,
            token
          });

        } catch (bcryptError) {
          console.error('Bcrypt error:', bcryptError);
          return res.status(500).json({ error: 'Erro na verificação da senha' });
        }
      }
    );

  } catch (error) {
    console.error('Login admin error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Get current user endpoint
app.get('/api/me', (req, res) => {
  try {
    // Check JWT token first
    const token = req.cookies?.token;
    
    if (token) {
      jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (!err && decoded) {
          // Get user from database
          db.get(
            "SELECT * FROM usuarios WHERE id = ?",
            [decoded.id],
            (dbErr, row) => {
              if (!dbErr && row) {
                const userData = {
                  id: row.id.toString(),
                  usuario: row.usuario,
                  nome: row.nome,
                  email: `${row.usuario}@empresa.local`,
                  setor: row.setor,
                  role: row.role
                };
                return res.json({ user: userData });
              }
            }
          );
        }
      });
    }

    // Check session user (Google OAuth)
    if (req.user) {
      return res.json({ user: req.user });
    }

    res.status(401).json({ error: 'Usuário não autenticado' });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Google OAuth routes
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login?error=google_auth_failed' }),
  (req, res) => {
    if (req.user) {
      res.redirect('/login?login=success');
    } else {
      res.redirect('/login?error=authentication_failed');
    }
  }
);

// Logout endpoint
app.post('/auth/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
  });
  
  res.clearCookie('token');
  req.session.destroy((err) => {
    if (err) {
      console.error('Session destroy error:', err);
    }
  });
  
  res.json({ success: true });
});

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Google OAuth ${process.env.GOOGLE_CLIENT_ID ? 'enabled' : 'disabled'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err.message);
    } else {
      console.log('Database connection closed.');
    }
  });
});