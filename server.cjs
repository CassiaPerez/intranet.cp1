const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const fs = require('fs');

// Load environment variables from .env file
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3005;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';
const GOOGLE_CLIENT_ID = process.env.VITE_GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.VITE_GOOGLE_CLIENT_SECRET;
const GOOGLE_CALLBACK_URL = process.env.VITE_GOOGLE_CALLBACK_URL || 'http://localhost:3005/auth/google/callback';

// Check for Google OAuth credentials
if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.warn('⚠️  Google OAuth credentials (VITE_GOOGLE_CLIENT_ID, VITE_GOOGLE_CLIENT_SECRET) are not set. Google login will not work.');
  console.warn('   Please set them in your .env file and configure your Google Cloud Console project.');
} else {
  console.log('✅ Google OAuth credentials loaded.');
}

// Database setup
const dbPath = path.join(__dirname, 'data', 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Erro ao conectar ao banco de dados SQLite:', err.message);
  } else {
    console.log('Conectado ao banco de dados SQLite.');
    db.run(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        auth_id TEXT UNIQUE,
        nome TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        senha TEXT,
        setor TEXT DEFAULT 'Geral',
        tipo TEXT DEFAULT 'comum',
        avatar_url TEXT,
        pontos_gamificacao INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) {
        console.error('Erro ao criar tabela usuarios:', err.message);
      } else {
        console.log('Tabela usuarios verificada/criada.');
        // Insert default admin user if not exists
        const adminEmail = 'admin@grupocropfield.com.br';
        db.get('SELECT id FROM usuarios WHERE email = ?', [adminEmail], (err, row) => {
          if (err) {
            console.error('Erro ao verificar admin:', err.message);
            return;
          }
          if (!row) {
            bcrypt.hash('admin123', 10, (err, hash) => {
              if (err) {
                console.error('Erro ao hash da senha do admin:', err.message);
                return;
              }
              db.run(
                'INSERT INTO usuarios (nome, email, senha, tipo) VALUES (?, ?, ?, ?)',
                ['Admin', adminEmail, hash, 'admin'],
                (err) => {
                  if (err) {
                    console.error('Erro ao inserir admin padrão:', err.message);
                  } else {
                    console.log('Usuário admin padrão inserido.');
                  }
                }
              );
            });
          }
        });
      }
    });

    // Create other tables if they don't exist
    db.run(`
      CREATE TABLE IF NOT EXISTS gamificacao (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        usuario_id TEXT NOT NULL,
        acao TEXT NOT NULL,
        pontos INTEGER DEFAULT 0,
        modulo TEXT NOT NULL,
        detalhes JSON,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
      )
    `, (err) => {
      if (err) console.error('Erro ao criar tabela gamificacao:', err.message);
      else console.log('Tabela gamificacao verificada/criada.');
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS trocas_proteina (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        usuario_id TEXT NOT NULL,
        data_troca DATE NOT NULL,
        proteina_original TEXT NOT NULL,
        proteina_nova TEXT NOT NULL,
        observacoes TEXT,
        status TEXT DEFAULT 'pendente',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
      )
    `, (err) => {
      if (err) console.error('Erro ao criar tabela trocas_proteina:', err.message);
      else console.log('Tabela trocas_proteina verificada/criada.');
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS reservas_salas (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        usuario_id TEXT NOT NULL,
        sala TEXT NOT NULL,
        data_reserva DATE NOT NULL,
        hora_inicio TIME NOT NULL,
        hora_fim TIME NOT NULL,
        motivo TEXT NOT NULL,
        observacoes TEXT,
        status TEXT DEFAULT 'ativa',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
      )
    `, (err) => {
      if (err) console.error('Erro ao criar tabela reservas_salas:', err.message);
      else console.log('Tabela reservas_salas verificada/criada.');
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS portaria (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        nome_visitante TEXT NOT NULL,
        documento TEXT,
        empresa TEXT,
        data_visita DATE NOT NULL,
        hora_entrada TIME NOT NULL,
        hora_saida TIME,
        responsavel_id TEXT NOT NULL,
        setor_destino TEXT NOT NULL,
        motivo TEXT NOT NULL,
        observacoes TEXT,
        status TEXT DEFAULT 'agendada',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (responsavel_id) REFERENCES usuarios(id) ON DELETE CASCADE
      )
    `, (err) => {
      if (err) console.error('Erro ao criar tabela portaria:', err.message);
      else console.log('Tabela portaria verificada/criada.');
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS equipamentos_ti (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        usuario_id TEXT NOT NULL,
        tipo_equipamento TEXT NOT NULL,
        descricao TEXT NOT NULL,
        justificativa TEXT NOT NULL,
        prioridade TEXT DEFAULT 'média',
        status TEXT DEFAULT 'pendente',
        observacoes_ti TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
      )
    `, (err) => {
      if (err) console.error('Erro ao criar tabela equipamentos_ti:', err.message);
      else console.log('Tabela equipamentos_ti verificada/criada.');
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS mural (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        usuario_id TEXT NOT NULL,
        titulo TEXT NOT NULL,
        conteudo TEXT NOT NULL,
        tipo TEXT DEFAULT 'informativo',
        setor_origem TEXT NOT NULL,
        anexo_url TEXT,
        ativo BOOLEAN DEFAULT TRUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
      )
    `, (err) => {
      if (err) console.error('Erro ao criar tabela mural:', err.message);
      else console.log('Tabela mural verificada/criada.');
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS mural_reacoes (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        mural_id TEXT NOT NULL,
        usuario_id TEXT NOT NULL,
        tipo_reacao TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(mural_id, usuario_id),
        FOREIGN KEY (mural_id) REFERENCES mural(id) ON DELETE CASCADE,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
      )
    `, (err) => {
      if (err) console.error('Erro ao criar tabela mural_reacoes:', err.message);
      else console.log('Tabela mural_reacoes verificada/criada.');
    });
  }
});

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'development' ? ['http://localhost:5173', 'http://127.0.0.1:5173'] : process.env.FRONTEND_URL,
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan('dev')); // Log HTTP requests

// Session middleware for Passport
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);

app.use(session({
  secret: process.env.SESSION_SECRET || 'secretkey',
  resave: false,
  saveUninitialized: false,
  store: new SQLiteStore({ db: 'sessions.sqlite', table: 'sessions' }),
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
    httpOnly: true,
    sameSite: 'Lax',
  }
}));

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

// Passport Local Strategy (for manual login)
passport.use(new LocalStrategy({
  usernameField: 'email', // Expects 'email' from the frontend
  passwordField: 'password'
}, (email, password, done) => {
  console.log(`[AUTH] Attempting local login for email: ${email}`);
  db.get('SELECT * FROM usuarios WHERE email = ?', [email], (err, user) => {
    if (err) {
      console.error('[AUTH] Database error during local login:', err.message);
      return done(err);
    }
    if (!user) {
      console.log(`[AUTH] User not found: ${email}`);
      return done(null, false, { message: 'Email ou senha incorretos.' });
    }

    // Compare password
    if (user.senha) { // Check if password exists (for manual users)
      bcrypt.compare(password, user.senha, (err, isMatch) => {
        if (err) {
          console.error('[AUTH] Bcrypt compare error:', err.message);
          return done(err);
        }
        if (isMatch) {
          console.log(`[AUTH] Local login successful for user: ${user.email}`);
          return done(null, user);
        } else {
          console.log(`[AUTH] Incorrect password for user: ${user.email}`);
          return done(null, false, { message: 'Email ou senha incorretos.' });
        }
      });
    } else { // No password set (e.g., Google-only user)
      console.log(`[AUTH] User ${user.email} has no local password set.`);
      return done(null, false, { message: 'Este usuário não possui senha local. Tente o login com Google.' });
    }
  });
}));

// Passport Google Strategy
passport.use(new GoogleStrategy({
  clientID: GOOGLE_CLIENT_ID,
  clientSecret: GOOGLE_CLIENT_SECRET,
  callbackURL: GOOGLE_CALLBACK_URL,
  scope: ['profile', 'email']
}, (accessToken, refreshToken, profile, done) => {
  const email = profile.emails && profile.emails.length > 0 ? profile.emails.value : null;
  const name = profile.displayName;
  const avatar_url = profile.photos && profile.photos.length > 0 ? profile.photos.value : null;

  console.log(`[AUTH] Google login attempt for email: ${email}`);

  if (!email) {
    console.error('[AUTH] Google profile missing email.');
    return done(new Error('Google profile missing email.'));
  }

  db.get('SELECT * FROM usuarios WHERE email = ?', [email], (err, user) => {
    if (err) {
      console.error('[AUTH] Database error during Google login:', err.message);
      return done(err);
    }
    if (user) {
      console.log(`[AUTH] Existing user logged in via Google: ${user.email}`);
      // Update user info if necessary (e.g., avatar_url)
      db.run('UPDATE usuarios SET nome = ?, avatar_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [name, avatar_url, user.id], (updateErr) => {
          if (updateErr) console.error('Error updating user info:', updateErr.message);
        });
      return done(null, user);
    } else {
      // Create new user
      console.log(`[AUTH] Creating new user from Google: ${email}`);
      db.run(
        'INSERT INTO usuarios (nome, email, avatar_url, tipo, auth_id) VALUES (?, ?, ?, ?, ?)',
        [name, email, avatar_url, 'comum', profile.id],
        function (err) {
          if (err) {
            console.error('[AUTH] Error creating new Google user:', err.message);
            return done(err);
          }
          const newUserId = this.lastID;
          db.get('SELECT * FROM usuarios WHERE id = ?', [newUserId], (err, newUser) => {
            if (err) return done(err);
            console.log(`[AUTH] New Google user created with ID: ${newUser.id}`);
            return done(null, newUser);
          });
        }
      );
    }
  });
}));

// Passport serialization/deserialization
passport.serializeUser((user, done) => {
  console.log(`[AUTH] Serializing user: ${user.id}`);
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  console.log(`[AUTH] Deserializing user: ${id}`);
  db.get('SELECT * FROM usuarios WHERE id = ?', [id], (err, user) => {
    if (err) {
      console.error('[AUTH] Error deserializing user:', err.message);
      return done(err);
    }
    if (!user) {
      console.log(`[AUTH] User with ID ${id} not found during deserialization.`);
      return done(null, false);
    }
    // Normalize user object for frontend
    user.role = user.tipo; // Use 'tipo' as 'role'
    user.sector = user.setor; // Use 'setor' as 'sector'
    console.log(`[AUTH] Deserialized user: ${user.email}, Role: ${user.role}`);
    done(null, user);
  });
});

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  console.log('[AUTH] Access denied: User not authenticated.');
  res.status(401).json({ error: 'Não autorizado. Faça login para acessar.' });
};

// Middleware to check if user is admin
const isAdmin = (req, res, next) => {
  if (req.isAuthenticated() && req.user && req.user.tipo === 'admin') {
    return next();
  }
  console.log(`[AUTH] Access denied: User ${req.user ? req.user.email : 'N/A'} is not admin.`);
  res.status(403).json({ error: 'Acesso negado. Apenas administradores podem acessar esta funcionalidade.' });
};

// Middleware to check if user is admin or RH/TI
const isAdminOrHRorTI = (req, res, next) => {
  if (req.isAuthenticated() && req.user && (req.user.tipo === 'admin' || req.user.setor === 'RH' || req.user.setor === 'TI')) {
    return next();
  }
  console.log(`[AUTH] Access denied: User ${req.user ? req.user.email : 'N/A'} is not admin, RH, or TI.`);
  res.status(403).json({ error: 'Acesso negado. Apenas administradores, RH ou TI podem acessar esta funcionalidade.' });
};

// Auth Routes
app.post('/auth/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) {
      console.error('[AUTH] Passport local auth error:', err.message);
      return res.status(500).json({ error: 'Erro no servidor durante a autenticação.' });
    }
    if (!user) {
      console.log('[AUTH] Local auth failed:', info.message);
      return res.status(401).json({ error: info.message });
    }
    req.logIn(user, (err) => {
      if (err) {
        console.error('[AUTH] req.logIn error:', err.message);
        return res.status(500).json({ error: 'Erro ao fazer login.' });
      }
      console.log(`[AUTH] User ${user.email} successfully logged in.`);
      // Generate JWT token (optional, if you want token-based auth alongside sessions)
      const token = jwt.sign({ id: user.id, email: user.email, role: user.tipo }, JWT_SECRET, { expiresIn: '1h' });
      res.json({ message: 'Login bem-sucedido!', user: { id: user.id, nome: user.nome, email: user.email, setor: user.setor, tipo: user.tipo, avatar_url: user.avatar_url }, token });
    });
  })(req, res, next);
});

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    console.log(`[AUTH] Google login successful for user: ${req.user.email}`);
    // Successful authentication, redirect home.
    res.redirect(process.env.FRONTEND_URL || 'http://localhost:5173');
  }
);

app.post('/auth/logout', isAuthenticated, (req, res, next) => {
  req.logout((err) => {
    if (err) {
      console.error('[AUTH] req.logout error:', err.message);
      return next(err);
    }
    req.session.destroy((err) => {
      if (err) {
        console.error('[AUTH] req.session.destroy error:', err.message);
        return next(err);
      }
      res.clearCookie('connect.sid'); // Clear session cookie
      console.log('[AUTH] User logged out and session destroyed.');
      res.json({ message: 'Logout bem-sucedido!' });
    });
  });
});

app.get('/api/me', (req, res) => {
  if (req.isAuthenticated()) {
    console.log(`[API] /api/me accessed by: ${req.user.email}`);
    res.json({ user: req.user });
  } else {
    console.log('[API] /api/me accessed by unauthenticated user.');
    res.status(401).json({ error: 'Não autenticado.' });
  }
});

// Admin Routes
app.get('/api/admin/dashboard', isAuthenticated, isAdmin, (req, res) => {
  console.log('[ADMIN] Accessing dashboard stats.');
  // Mock data for now, replace with actual DB queries
  const stats = {
    usuarios_ativos: 10,
    posts_mural: 25,
    reservas_salas: 15,
    solicitacoes_ti: 5,
    trocas_proteina: 30,
    agendamentos_portaria: 8
  };
  res.json({ stats });
});

// New: Admin user management routes
app.get('/api/admin/users', isAuthenticated, isAdmin, (req, res) => {
  console.log('[ADMIN] Fetching all users.');
  db.all('SELECT id, nome, email, setor, tipo AS role, avatar_url, pontos_gamificacao, created_at FROM usuarios', [], (err, rows) => {
    if (err) {
      console.error('[ADMIN] Error fetching users:', err.message);
      return res.status(500).json({ error: 'Erro ao buscar usuários.' });
    }
    res.json({ users: rows });
  });
});

app.post('/api/admin/users', isAuthenticated, isAdmin, (req, res) => {
  const { nome, email, senha, setor, role } = req.body;
  console.log(`[ADMIN] Creating new user: ${email} with role: ${role}`);

  if (!nome || !email || !senha) {
    return res.status(400).json({ error: 'Nome, email e senha são obrigatórios.' });
  }

  db.get('SELECT id FROM usuarios WHERE email = ?', [email], (err, row) => {
    if (err) {
      console.error('[ADMIN] Error checking existing user:', err.message);
      return res.status(500).json({ error: 'Erro ao verificar usuário existente.' });
    }
    if (row) {
      console.log(`[ADMIN] User creation failed: Email ${email} already exists.`);
      return res.status(409).json({ error: 'Este email já está cadastrado.' });
    }

    bcrypt.hash(senha, 10, (err, hashedPassword) => {
      if (err) {
        console.error('[ADMIN] Error hashing password for new user:', err.message);
        return res.status(500).json({ error: 'Erro ao processar senha.' });
      }

      db.run(
        'INSERT INTO usuarios (nome, email, senha, setor, tipo) VALUES (?, ?, ?, ?, ?)',
        [nome, email, hashedPassword, setor || 'Geral', role || 'comum'],
        function (err) {
          if (err) {
            console.error('[ADMIN] Error inserting new user:', err.message);
            return res.status(500).json({ error: 'Erro ao criar usuário.' });
          }
          console.log(`[ADMIN] New user ${email} created successfully with ID: ${this.lastID}`);
          res.status(201).json({ message: 'Usuário criado com sucesso!', userId: this.lastID });
        }
      );
    });
  });
});

app.patch('/api/admin/users/:id', isAuthenticated, isAdmin, (req, res) => {
  const { id } = req.params;
  const { nome, email, setor, role, ativo } = req.body;
  console.log(`[ADMIN] Updating user ID: ${id}`);

  const updates = [];
  const params = [];

  if (nome !== undefined) { updates.push('nome = ?'); params.push(nome); }
  if (email !== undefined) { updates.push('email = ?'); params.push(email); }
  if (setor !== undefined) { updates.push('setor = ?'); params.push(setor); }
  if (role !== undefined) { updates.push('tipo = ?'); params.push(role); }
  if (ativo !== undefined) { updates.push('ativo = ?'); params.push(ativo ? 1 : 0); } // SQLite uses 1/0 for boolean

  if (updates.length === 0) {
    return res.status(400).json({ error: 'Nenhum dado para atualizar.' });
  }

  params.push(id);
  db.run(
    `UPDATE usuarios SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    params,
    function (err) {
      if (err) {
        console.error(`[ADMIN] Error updating user ${id}:`, err.message);
        return res.status(500).json({ error: 'Erro ao atualizar usuário.' });
      }
      if (this.changes === 0) {
        console.log(`[ADMIN] User ${id} not found for update.`);
        return res.status(404).json({ error: 'Usuário não encontrado.' });
      }
      console.log(`[ADMIN] User ${id} updated successfully.`);
      res.json({ message: 'Usuário atualizado com sucesso!' });
    }
  );
});

app.patch('/api/admin/users/:id/password', isAuthenticated, isAdmin, (req, res) => {
  const { id } = req.params;
  const { senha } = req.body;
  console.log(`[ADMIN] Resetting password for user ID: ${id}`);

  if (!senha || senha.length < 6) {
    return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
  }

  bcrypt.hash(senha, 10, (err, hashedPassword) => {
    if (err) {
      console.error('[ADMIN] Error hashing new password:', err.message);
      return res.status(500).json({ error: 'Erro ao processar a nova senha.' });
    }

    db.run(
      'UPDATE usuarios SET senha = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [hashedPassword, id],
      function (err) {
        if (err) {
          console.error(`[ADMIN] Error resetting password for user ${id}:`, err.message);
          return res.status(500).json({ error: 'Erro ao redefinir a senha.' });
        }
        if (this.changes === 0) {
          console.log(`[ADMIN] User ${id} not found for password reset.`);
          return res.status(404).json({ error: 'Usuário não encontrado.' });
        }
        console.log(`[ADMIN] Password reset successfully for user ${id}.`);
        res.json({ message: 'Senha redefinida com sucesso!' });
      }
    );
  });
});

// Admin Export Routes
app.get('/api/admin/export/ranking.csv', isAuthenticated, isAdmin, (req, res) => {
  console.log('[ADMIN] Exporting ranking as CSV.');
  const month = req.query.month || new Date().toISOString().slice(0, 7); // YYYY-MM

  db.all(`
    SELECT u.nome, u.email, u.setor, u.pontos_gamificacao AS total_pontos
    FROM usuarios u
    ORDER BY u.pontos_gamificacao DESC
  `, [], (err, rows) => {
    if (err) {
      console.error('[ADMIN] Error fetching ranking data for CSV:', err.message);
      return res.status(500).json({ error: 'Erro ao buscar dados do ranking.' });
    }

    let csv = 'Nome,Email,Setor,Pontos\n';
    rows.forEach(row => {
      csv += `${row.nome},${row.email},${row.setor},${row.total_pontos}\n`;
    });

    res.header('Content-Type', 'text/csv');
    res.attachment(`ranking-${month}.csv`);
    res.send(csv);
    console.log(`[ADMIN] Ranking CSV for ${month} sent.`);
  });
});

app.get('/api/admin/export/ranking.excel', isAuthenticated, isAdmin, async (req, res) => {
  console.log('[ADMIN] Exporting ranking as Excel.');
  const month = req.query.month || new Date().toISOString().slice(0, 7); // YYYY-MM

  try {
    const rows = await new Promise((resolve, reject) => {
      db.all(`
        SELECT u.nome, u.email, u.setor, u.pontos_gamificacao AS total_pontos
        FROM usuarios u
        ORDER BY u.pontos_gamificacao DESC
      `, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Ranking');

    worksheet.columns = [
      { header: 'Nome', key: 'nome', width: 30 },
      { header: 'Email', key: 'email', width: 40 },
      { header: 'Setor', key: 'setor', width: 20 },
      { header: 'Pontos', key: 'total_pontos', width: 15 }
    ];

    worksheet.addRows(rows);

    res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.attachment(`ranking-${month}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
    console.log(`[ADMIN] Ranking Excel for ${month} sent.`);
  } catch (err) {
    console.error('[ADMIN] Error exporting ranking to Excel:', err.message);
    res.status(500).json({ error: 'Erro ao exportar ranking para Excel.' });
  }
});

app.get('/api/admin/export/ranking.pdf', isAuthenticated, isAdmin, async (req, res) => {
  console.log('[ADMIN] Exporting ranking as PDF.');
  const month = req.query.month || new Date().toISOString().slice(0, 7); // YYYY-MM

  try {
    const rows = await new Promise((resolve, reject) => {
      db.all(`
        SELECT u.nome, u.email, u.setor, u.pontos_gamificacao AS total_pontos
        FROM usuarios u
        ORDER BY u.pontos_gamificacao DESC
      `, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    const doc = new PDFDocument();
    let filename = `ranking-${month}.pdf`;
    filename = encodeURIComponent(filename);
    res.setHeader('Content-disposition', 'attachment; filename="' + filename + '"');
    res.setHeader('Content-type', 'application/pdf');

    doc.pipe(res);

    doc.fontSize(20).text('Ranking de Usuários - ' + month, { align: 'center' });
    doc.moveDown();

    const table = {
      headers: ['Nome', 'Email', 'Setor', 'Pontos'],
      rows: rows.map(row => [row.nome, row.email, row.setor, row.total_pontos.toString()])
    };

    const tableTop = 150;
    const itemHeight = 20;
    let currentY = tableTop;

    // Draw headers
    doc.font('Helvetica-Bold').fontSize(10);
    table.headers.forEach((header, i) => {
      doc.text(header, 50 + i * 150, currentY, { width: 140, align: 'left' });
    });
    currentY += itemHeight;
    doc.font('Helvetica').fontSize(9);

    // Draw rows
    rows.forEach(row => {
      doc.text(row.nome, 50, currentY, { width: 140, align: 'left' });
      doc.text(row.email, 200, currentY, { width: 140, align: 'left' });
      doc.text(row.setor, 350, currentY, { width: 100, align: 'left' });
      doc.text(row.total_pontos.toString(), 450, currentY, { width: 80, align: 'right' });
      currentY += itemHeight;
    });

    doc.end();
    console.log(`[ADMIN] Ranking PDF for ${month} sent.`);
  } catch (err) {
    console.error('[ADMIN] Error exporting ranking to PDF:', err.message);
    res.status(500).json({ error: 'Erro ao exportar ranking para PDF.' });
  }
});

app.get('/api/admin/export/activities.csv', isAuthenticated, isAdmin, (req, res) => {
  console.log('[ADMIN] Exporting activities as CSV.');
  const month = req.query.month || new Date().toISOString().slice(0, 7); // YYYY-MM

  db.all(`
    SELECT g.acao, g.modulo, g.pontos, g.detalhes, g.created_at, u.nome AS usuario_nome, u.email AS usuario_email
    FROM gamificacao g
    JOIN usuarios u ON g.usuario_id = u.id
    WHERE strftime('%Y-%m', g.created_at) = ?
    ORDER BY g.created_at DESC
  `, [month], (err, rows) => {
    if (err) {
      console.error('[ADMIN] Error fetching activities data for CSV:', err.message);
      return res.status(500).json({ error: 'Erro ao buscar dados de atividades.' });
    }

    let csv = 'Ação,Módulo,Pontos,Detalhes,Data,Usuário Nome,Usuário Email\n';
    rows.forEach(row => {
      const details = row.detalhes ? JSON.stringify(row.detalhes).replace(/"/g, '""') : '';
      csv += `${row.acao},${row.modulo},${row.pontos},"${details}",${row.created_at},${row.usuario_nome},${row.usuario_email}\n`;
    });

    res.header('Content-Type', 'text/csv');
    res.attachment(`atividades-${month}.csv`);
    res.send(csv);
    console.log(`[ADMIN] Activities CSV for ${month} sent.`);
  });
});

app.get('/api/admin/export/activities.excel', isAuthenticated, isAdmin, async (req, res) => {
  console.log('[ADMIN] Exporting activities as Excel.');
  const month = req.query.month || new Date().toISOString().slice(0, 7); // YYYY-MM

  try {
    const rows = await new Promise((resolve, reject) => {
      db.all(`
        SELECT g.acao, g.modulo, g.pontos, g.detalhes, g.created_at, u.nome AS usuario_nome, u.email AS usuario_email
        FROM gamificacao g
        JOIN usuarios u ON g.usuario_id = u.id
        WHERE strftime('%Y-%m', g.created_at) = ?
        ORDER BY g.created_at DESC
      `, [month], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Atividades');

    worksheet.columns = [
      { header: 'Ação', key: 'acao', width: 20 },
      { header: 'Módulo', key: 'modulo', width: 20 },
      { header: 'Pontos', key: 'pontos', width: 10 },
      { header: 'Detalhes', key: 'detalhes', width: 50 },
      { header: 'Data', key: 'created_at', width: 25 },
      { header: 'Usuário Nome', key: 'usuario_nome', width: 30 },
      { header: 'Usuário Email', key: 'usuario_email', width: 40 }
    ];

    worksheet.addRows(rows.map(row => ({
      ...row,
      detalhes: row.detalhes ? JSON.stringify(row.detalhes) : ''
    })));

    res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.attachment(`atividades-${month}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
    console.log(`[ADMIN] Activities Excel for ${month} sent.`);
  } catch (err) {
    console.error('[ADMIN] Error exporting activities to Excel:', err.message);
    res.status(500).json({ error: 'Erro ao exportar atividades para Excel.' });
  }
});

app.get('/api/admin/export/backup.json', isAuthenticated, isAdmin, async (req, res) => {
  console.log('[ADMIN] Exporting full database backup as JSON.');
  try {
    const tables = ['usuarios', 'gamificacao', 'trocas_proteina', 'reservas_salas', 'portaria', 'equipamentos_ti', 'mural', 'mural_reacoes'];
    const backupData = {};

    for (const table of tables) {
      backupData[table] = await new Promise((resolve, reject) => {
        db.all(`SELECT * FROM ${table}`, [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    }

    res.header('Content-Type', 'application/json');
    res.attachment(`backup-${new Date().toISOString().slice(0, 10)}.json`);
    res.json({
      metadata: {
        timestamp: new Date().toISOString(),
        format: 'json',
        generatedBy: 'Intranet Backend',
        tables: tables
      },
      data: backupData
    });
    console.log('[ADMIN] Full database backup JSON sent.');
  } catch (err) {
    console.error('[ADMIN] Error exporting database backup to JSON:', err.message);
    res.status(500).json({ error: 'Erro ao gerar backup JSON.' });
  }
});

app.get('/api/admin/export/backup.sql', isAuthenticated, isAdmin, (req, res) => {
  console.log('[ADMIN] Exporting full database backup as SQL (placeholder).');
  // This would typically involve dumping the SQLite database schema and data
  // For a simple placeholder, we just return a message
  res.json({ message: 'Funcionalidade de backup SQL em desenvolvimento.' });
});

// API Routes (example)
app.get('/api/reservas', isAuthenticated, (req, res) => {
  console.log('[API] Fetching reservations.');
  db.all('SELECT rs.*, u.nome AS responsavel FROM reservas_salas rs JOIN usuarios u ON rs.usuario_id = u.id ORDER BY rs.data_reserva DESC, rs.hora_inicio DESC', [], (err, rows) => {
    if (err) {
      console.error('[API] Error fetching reservations:', err.message);
      return res.status(500).json({ error: 'Erro ao buscar reservas.' });
    }
    res.json({ reservas: rows });
  });
});

app.post('/api/reservas', isAuthenticated, async (req, res) => {
  const { sala, data, inicio, fim, assunto } = req.body;
  const usuario_id = req.user.id; // From deserialized user
  console.log(`[API] Creating reservation for user ${req.user.email} in room ${sala} on ${data}.`);

  if (!sala || !data || !inicio || !fim || !assunto) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
  }

  try {
    // Check for overlapping reservations
    const overlap = await new Promise((resolve, reject) => {
      db.get(`
        SELECT COUNT(*) AS count FROM reservas_salas
        WHERE sala = ? AND data_reserva = ?
        AND (
          (? < hora_fim AND ? > hora_inicio) OR
          (? = hora_inicio AND ? = hora_fim)
        )
      `, [sala, data, inicio, fim, inicio, fim], (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });

    if (overlap > 0) {
      console.log(`[API] Overlapping reservation detected for room ${sala} on ${data}.`);
      return res.status(409).json({ error: 'Já existe uma reserva para esta sala neste horário.' });
    }

    const result = await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO reservas_salas (usuario_id, sala, data_reserva, hora_inicio, hora_fim, motivo) VALUES (?, ?, ?, ?, ?, ?)',
        [usuario_id, sala, data, inicio, fim, assunto],
        function (err) {
          if (err) reject(err);
          else resolve(this);
        }
      );
    });

    // Add gamification points
    const points = 10;
    db.run(
      'INSERT INTO gamificacao (usuario_id, acao, pontos, modulo, detalhes) VALUES (?, ?, ?, ?, ?)',
      [usuario_id, 'RESERVA_CREATE', points, 'Reservas', JSON.stringify({ sala, data, inicio, fim, assunto })],
      (err) => {
        if (err) console.error('Erro ao adicionar pontos de gamificação:', err.message);
      }
    );

    console.log(`[API] Reservation created successfully with ID: ${result.lastID}`);
    res.status(201).json({ message: 'Reserva criada com sucesso!', id: result.lastID, points });
  } catch (err) {
    console.error('[API] Error creating reservation:', err.message);
    res.status(500).json({ error: 'Erro ao criar reserva.' });
  }
});

app.get('/api/portaria/agendamentos', isAuthenticated, (req, res) => {
  console.log('[API] Fetching portaria appointments.');
  db.all('SELECT p.*, u.nome AS responsavel_nome FROM portaria p JOIN usuarios u ON p.responsavel_id = u.id ORDER BY p.data_visita DESC, p.hora_entrada DESC', [], (err, rows) => {
    if (err) {
      console.error('[API] Error fetching portaria appointments:', err.message);
      return res.status(500).json({ error: 'Erro ao buscar agendamentos da portaria.' });
    }
    res.json({ agendamentos: rows });
  });
});

app.post('/api/portaria/agendamentos', isAuthenticated, async (req, res) => {
  const { data, hora, visitante, documento, observacao } = req.body;
  const responsavel_id = req.user.id; // From deserialized user
  const setor_destino = req.user.setor || 'Geral'; // Use user's sector as default destination
  const motivo = `Visita de ${visitante}`; // Default motive

  console.log(`[API] Creating portaria appointment for ${visitante} on ${data} at ${hora}.`);

  if (!data || !hora || !visitante) {
    return res.status(400).json({ error: 'Data, hora e nome do visitante são obrigatórios.' });
  }

  try {
    const result = await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO portaria (nome_visitante, documento, data_visita, hora_entrada, responsavel_id, setor_destino, motivo, observacoes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [visitante, documento, data, hora, responsavel_id, setor_destino, motivo, observacao],
        function (err) {
          if (err) reject(err);
          else resolve(this);
        }
      );
    });

    // Add gamification points
    const points = 10;
    db.run(
      'INSERT INTO gamificacao (usuario_id, acao, pontos, modulo, detalhes) VALUES (?, ?, ?, ?, ?)',
      [responsavel_id, 'PORTARIA_CREATE', points, 'Portaria', JSON.stringify({ visitante, data, hora })],
      (err) => {
        if (err) console.error('Erro ao adicionar pontos de gamificação:', err.message);
      }
    );

    console.log(`[API] Portaria appointment created successfully with ID: ${result.lastID}`);
    res.status(201).json({ message: 'Agendamento criado com sucesso!', id: result.lastID, points });
  } catch (err) {
    console.error('[API] Error creating portaria appointment:', err.message);
    res.status(500).json({ error: 'Erro ao criar agendamento da portaria.' });
  }
});

app.get('/api/ti/solicitacoes', isAuthenticated, isAdminOrHRorTI, (req, res) => {
  console.log('[API] Fetching all TI requests (admin/TI/RH view).');
  db.all(`
    SELECT e.*, u.nome AS usuario_nome, u.email AS usuario_email
    FROM equipamentos_ti e
    JOIN usuarios u ON e.usuario_id = u.id
    ORDER BY e.created_at DESC
  `, [], (err, rows) => {
    if (err) {
      console.error('[API] Error fetching TI requests:', err.message);
      return res.status(500).json({ error: 'Erro ao buscar solicitações de TI.' });
    }
    res.json({ solicitacoes: rows });
  });
});

app.get('/api/ti/minhas', isAuthenticated, (req, res) => {
  const userEmail = req.query.email;
  if (!userEmail) {
    return res.status(400).json({ error: 'Email do usuário é obrigatório.' });
  }
  console.log(`[API] Fetching TI requests for user: ${userEmail}.`);

  db.all(`
    SELECT e.*, u.nome AS usuario_nome, u.email AS usuario_email
    FROM equipamentos_ti e
    JOIN usuarios u ON e.usuario_id = u.id
    WHERE u.email = ?
    ORDER BY e.created_at DESC
  `, [userEmail], (err, rows) => {
    if (err) {
      console.error('[API] Error fetching user TI requests:', err.message);
      return res.status(500).json({ error: 'Erro ao buscar suas solicitações de TI.' });
    }
    res.json({ solicitacoes: rows });
  });
});

app.post('/api/ti/solicitacoes', isAuthenticated, async (req, res) => {
  const { titulo, descricao, prioridade, email, nome } = req.body;
  const usuario_id = req.user.id; // From deserialized user
  console.log(`[API] Creating TI request for user ${req.user.email}: ${titulo}.`);

  if (!titulo || !descricao || !prioridade) {
    return res.status(400).json({ error: 'Título, descrição e prioridade são obrigatórios.' });
  }

  try {
    const result = await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO equipamentos_ti (usuario_id, tipo_equipamento, descricao, justificativa, prioridade) VALUES (?, ?, ?, ?, ?)',
        [usuario_id, titulo, descricao, descricao, prioridade], // Using descricao for justificativa as well
        function (err) {
          if (err) reject(err);
          else resolve(this);
        }
      );
    });

    // Add gamification points
    const points = 5;
    db.run(
      'INSERT INTO gamificacao (usuario_id, acao, pontos, modulo, detalhes) VALUES (?, ?, ?, ?, ?)',
      [usuario_id, 'EQUIPMENT_REQUEST', points, 'Equipamentos TI', JSON.stringify({ titulo, prioridade })],
      (err) => {
        if (err) console.error('Erro ao adicionar pontos de gamificação:', err.message);
      }
    );

    console.log(`[API] TI request created successfully with ID: ${result.lastID}`);
    res.status(201).json({ message: 'Solicitação de TI criada com sucesso!', id: result.lastID, points });
  } catch (err) {
    console.error('[API] Error creating TI request:', err.message);
    res.status(500).json({ error: 'Erro ao criar solicitação de TI.' });
  }
});

app.get('/api/mural/posts', isAuthenticated, (req, res) => {
  console.log('[API] Fetching mural posts.');
  db.all(`
    SELECT m.id, m.titulo, m.conteudo, m.created_at, m.ativo, m.anexo_url, m.tipo, m.setor_origem,
           u.nome AS author,
           (SELECT COUNT(*) FROM mural_reacoes mr WHERE mr.mural_id = m.id AND mr.tipo_reacao = 'like') AS likes_count,
           (SELECT COUNT(*) FROM mural_reacoes mr WHERE mr.mural_id = m.id AND mr.tipo_reacao = 'comment') AS comments_count
    FROM mural m
    JOIN usuarios u ON m.usuario_id = u.id
    WHERE m.ativo = TRUE
    ORDER BY m.created_at DESC
  `, [], (err, rows) => {
    if (err) {
      console.error('[API] Error fetching mural posts:', err.message);
      return res.status(500).json({ error: 'Erro ao buscar posts do mural.' });
    }
    res.json({ posts: rows });
  });
});

app.post('/api/mural/posts', isAuthenticated, isAdminOrHRorTI, async (req, res) => {
  const { titulo, conteudo, pinned } = req.body;
  const usuario_id = req.user.id;
  const setor_origem = req.user.setor || 'Geral';
  const tipo = pinned ? 'aviso' : 'informativo'; // Simple mapping for now

  console.log(`[API] Creating mural post by ${req.user.email}: ${titulo}.`);

  if (!titulo || !conteudo) {
    return res.status(400).json({ error: 'Título e conteúdo são obrigatórios.' });
  }

  try {
    const result = await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO mural (usuario_id, titulo, conteudo, tipo, setor_origem, ativo) VALUES (?, ?, ?, ?, ?, ?)',
        [usuario_id, titulo, conteudo, tipo, setor_origem, true],
        function (err) {
          if (err) reject(err);
          else resolve(this);
        }
      );
    });

    // Add gamification points
    const points = 15;
    db.run(
      'INSERT INTO gamificacao (usuario_id, acao, pontos, modulo, detalhes) VALUES (?, ?, ?, ?, ?)',
      [usuario_id, 'POST_CREATION', points, 'Mural', JSON.stringify({ titulo, tipo })],
      (err) => {
        if (err) console.error('Erro ao adicionar pontos de gamificação:', err.message);
      }
    );

    console.log(`[API] Mural post created successfully with ID: ${result.lastID}`);
    res.status(201).json({ message: 'Publicação criada com sucesso!', id: result.lastID, points });
  } catch (err) {
    console.error('[API] Error creating mural post:', err.message);
    res.status(500).json({ error: 'Erro ao criar publicação.' });
  }
});

app.post('/api/mural/:postId/like', isAuthenticated, async (req, res) => {
  const { postId } = req.params;
  const usuario_id = req.user.id;
  const tipo_reacao = 'like';

  console.log(`[API] User ${req.user.email} reacting to post ${postId} with ${tipo_reacao}.`);

  try {
    const existingReaction = await new Promise((resolve, reject) => {
      db.get('SELECT id FROM mural_reacoes WHERE mural_id = ? AND usuario_id = ? AND tipo_reacao = ?',
        [postId, usuario_id, tipo_reacao], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
    });

    let action = '';
    let points = 0;

    if (existingReaction) {
      // Unlike
      await new Promise((resolve, reject) => {
        db.run('DELETE FROM mural_reacoes WHERE id = ?', [existingReaction.id], function (err) {
          if (err) reject(err);
          else resolve(this);
        });
      });
      action = 'unliked';
      points = -2; // Deduct points for unliking
      console.log(`[API] User ${req.user.email} unliked post ${postId}.`);
    } else {
      // Like
      await new Promise((resolve, reject) => {
        db.run('INSERT INTO mural_reacoes (mural_id, usuario_id, tipo_reacao) VALUES (?, ?, ?)',
          [postId, usuario_id, tipo_reacao], function (err) {
            if (err) reject(err);
            else resolve(this);
          });
      });
      action = 'liked';
      points = 2; // Add points for liking
      console.log(`[API] User ${req.user.email} liked post ${postId}.`);
    }

    // Update user's total gamification points
    db.run('UPDATE usuarios SET pontos_gamificacao = pontos_gamificacao + ? WHERE id = ?',
      [points, usuario_id], (err) => {
        if (err) console.error('Erro ao atualizar pontos de gamificação:', err.message);
      });

    // Record gamification activity
    db.run(
      'INSERT INTO gamificacao (usuario_id, acao, pontos, modulo, detalhes) VALUES (?, ?, ?, ?, ?)',
      [usuario_id, 'MURAL_LIKE', points, 'Mural', JSON.stringify({ postId, action })],
      (err) => {
        if (err) console.error('Erro ao adicionar atividade de gamificação:', err.message);
      }
    );

    res.json({ message: `Post ${action}!`, action, points });
  } catch (err) {
    console.error('[API] Error processing like reaction:', err.message);
    res.status(500).json({ error: 'Erro ao processar reação.' });
  }
});

app.post('/api/mural/:postId/comments', isAuthenticated, async (req, res) => {
  const { postId } = req.params;
  const { texto } = req.body;
  const usuario_id = req.user.id;
  const tipo_reacao = 'comment'; // Using 'comment' as a reaction type for simplicity

  console.log(`[API] User ${req.user.email} commenting on post ${postId}.`);

  if (!texto) {
    return res.status(400).json({ error: 'O comentário não pode ser vazio.' });
  }

  try {
    const result = await new Promise((resolve, reject) => {
      db.run('INSERT INTO mural_reacoes (mural_id, usuario_id, tipo_reacao, conteudo) VALUES (?, ?, ?, ?)',
        [postId, usuario_id, tipo_reacao, texto], // Assuming 'conteudo' column exists for comment text
        function (err) {
          if (err) reject(err);
          else resolve(this);
        });
    });

    // Add gamification points
    const points = 3;
    db.run('UPDATE usuarios SET pontos_gamificacao = pontos_gamificacao + ? WHERE id = ?',
      [points, usuario_id], (err) => {
        if (err) console.error('Erro ao atualizar pontos de gamificação:', err.message);
      });

    // Record gamification activity
    db.run(
      'INSERT INTO gamificacao (usuario_id, acao, pontos, modulo, detalhes) VALUES (?, ?, ?, ?, ?)',
      [usuario_id, 'MURAL_COMMENT', points, 'Mural', JSON.stringify({ postId, texto })],
      (err) => {
        if (err) console.error('Erro ao adicionar atividade de gamificação:', err.message);
      }
    );

    res.status(201).json({ message: 'Comentário adicionado!', id: result.lastID, points });
  } catch (err) {
    console.error('[API] Error adding comment:', err.message);
    res.status(500).json({ error: 'Erro ao adicionar comentário.' });
  }
});

app.get('/api/trocas-proteina', isAuthenticated, (req, res) => {
  const { from, to } = req.query;
  const usuario_id = req.user.id;

  console.log(`[API] Fetching protein exchanges for user ${req.user.email} from ${from} to ${to}.`);

  let query = 'SELECT * FROM trocas_proteina WHERE usuario_id = ?';
  const params = [usuario_id];

  if (from && to) {
    query += ' AND data_troca BETWEEN ? AND ?';
    params.push(from, to);
  }

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('[API] Error fetching protein exchanges:', err.message);
      return res.status(500).json({ error: 'Erro ao buscar trocas de proteína.' });
    }
    res.json({ trocas: rows });
  });
});

app.post('/api/trocas-proteina/bulk', isAuthenticated, async (req, res) => {
  const { trocas } = req.body;
  const usuario_id = req.user.id;
  console.log(`[API] Bulk saving ${trocas.length} protein exchanges for user ${req.user.email}.`);

  if (!Array.isArray(trocas)) {
    return res.status(400).json({ error: 'Formato de dados inválido. Esperado um array de trocas.' });
  }

  let insertedCount = 0;
  let totalPoints = 0;

  try {
    for (const troca of trocas) {
      const { data, proteina_original, proteina_nova } = troca;

      if (!data || !proteina_original || !proteina_nova) {
        console.warn('[API] Skipping invalid exchange data:', troca);
        continue;
      }

      // Check if an exchange for this date already exists for this user
      const existingExchange = await new Promise((resolve, reject) => {
        db.get('SELECT id FROM trocas_proteina WHERE usuario_id = ? AND data_troca = ?',
          [usuario_id, data], (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
      });

      if (existingExchange) {
        // Update existing exchange
        await new Promise((resolve, reject) => {
          db.run(
            'UPDATE trocas_proteina SET proteina_original = ?, proteina_nova = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [proteina_original, proteina_nova, existingExchange.id],
            function (err) {
              if (err) reject(err);
              else resolve(this);
            }
          );
        });
        console.log(`[API] Updated existing protein exchange for ${data}.`);
      } else {
        // Insert new exchange
        await new Promise((resolve, reject) => {
          db.run(
            'INSERT INTO trocas_proteina (usuario_id, data_troca, proteina_original, proteina_nova) VALUES (?, ?, ?, ?)',
            [usuario_id, data, proteina_original, proteina_nova],
            function (err) {
              if (err) reject(err);
              else resolve(this);
            }
          );
        });
        insertedCount++;
        totalPoints += 5; // Points for each new exchange
        console.log(`[API] Inserted new protein exchange for ${data}.`);
      }
    }

    // Update user's total gamification points
    if (totalPoints > 0) {
      db.run('UPDATE usuarios SET pontos_gamificacao = pontos_gamificacao + ? WHERE id = ?',
        [totalPoints, usuario_id], (err) => {
          if (err) console.error('Erro ao atualizar pontos de gamificação:', err.message);
        });
      // Record gamification activity
      db.run(
        'INSERT INTO gamificacao (usuario_id, acao, pontos, modulo, detalhes) VALUES (?, ?, ?, ?, ?)',
        [usuario_id, 'TROCA_PROTEINA', totalPoints, 'Cardapio', JSON.stringify({ count: insertedCount })],
        (err) => {
          if (err) console.error('Erro ao adicionar atividade de gamificação:', err.message);
        }
      );
    }

    res.status(200).json({ message: 'Trocas salvas com sucesso!', inseridas: insertedCount, totalPoints });
  } catch (err) {
    console.error('[API] Error in bulk protein exchange:', err.message);
    res.status(500).json({ error: 'Erro ao salvar trocas de proteína.' });
  }
});

// Admin config route (example, can be expanded)
app.get('/api/admin/config', isAuthenticated, isAdmin, (req, res) => {
  console.log('[ADMIN] Accessing system config.');
  res.json({
    appName: 'Corporate Intranet',
    version: '1.0.0',
    environment: process.env.NODE_ENV,
    features: {
      gamification: true,
      roomBooking: true,
      mealExchange: true,
      itRequests: true,
      mural: true,
      directory: true,
    },
    limits: {
      maxUploadSize: '10MB',
      sessionTimeout: '24h',
    },
    databaseStatus: 'connected',
  });
});


// Start the server
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`Acesse o frontend em: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
});