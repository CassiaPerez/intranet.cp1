const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3006;
const JWT_SECRET = process.env.JWT_SECRET || 'cropfield-secret-key-2025';

console.log('🚀 Starting Intranet Cropfield Backend...');
console.log('Port:', PORT);
console.log('Environment:', process.env.NODE_ENV || 'development');

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('📁 Created data directory');
}

// Middleware
app.use(cookieParser());
app.use(express.json());

// CORS configuration - ONLY relative origins, no absolute URLs in Express routes
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174', 
    'http://localhost:5175',
    'https://intranet.grupocropfield.com.br'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
}));

// Database setup with proper path
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'data', 'database.sqlite');
console.log('📂 Database path:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error opening database:', err.message);
    process.exit(1);
  } else {
    console.log('✅ Connected to SQLite database');
    initializeDatabase();
  }
});

// Initialize database with admin users
function initializeDatabase() {
  console.log('🗃️  Initializing database...');
  
  db.serialize(() => {
    // Create usuarios table
    db.run(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario TEXT UNIQUE NOT NULL,
        senha_hash TEXT NOT NULL,
        setor TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) {
        console.error('❌ Error creating usuarios table:', err.message);
        return;
      }
      
      console.log('✅ Usuarios table ready');
      
      // Create admin users
      const adminTiHash = bcrypt.hashSync('admin123', 10);
      const adminRhHash = bcrypt.hashSync('admin123', 10);
      
      // Insert admin-ti
      db.run(`
        INSERT OR REPLACE INTO usuarios (usuario, senha_hash, setor, role)
        VALUES (?, ?, ?, ?)
      `, ['admin-ti', adminTiHash, 'TI', 'admin'], function(err) {
        if (err) {
          console.error('❌ Error creating admin-ti:', err.message);
        } else {
          console.log('✅ Admin TI created: admin-ti / admin123');
        }
      });
      
      // Insert admin-rh
      db.run(`
        INSERT OR REPLACE INTO usuarios (usuario, senha_hash, setor, role)
        VALUES (?, ?, ?, ?)
      `, ['admin-rh', adminRhHash, 'RH', 'admin'], function(err) {
        if (err) {
          console.error('❌ Error creating admin-rh:', err.message);
        } else {
          console.log('✅ Admin RH created: admin-rh / admin123');
        }
      });
    });
  });
}

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Token de acesso requerido' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    console.log('🔐 Invalid token:', error.message);
    return res.status(401).json({ error: 'Token inválido' });
  }
};

// ===== ROUTES - ALL RELATIVE PATHS, NO ABSOLUTE URLs =====

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, status: 'healthy', timestamp: new Date().toISOString() });
});

// Configuration endpoint
app.get('/api/config', (req, res) => {
  res.json({
    environment: process.env.NODE_ENV || 'development',
    googleEnabled: false // Disabled for now
  });
});

// Manual admin login - FIXED ROUTE
app.post('/api/login-admin', async (req, res) => {
  try {
    const { usuario, senha } = req.body;
    
    console.log('[LOGIN-ADMIN] 🔐 Login attempt for usuario:', usuario);

    if (!usuario || !senha) {
      console.log('[LOGIN-ADMIN] ❌ Missing credentials');
      return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
    }

    // Search user in database
    db.get("SELECT * FROM usuarios WHERE usuario = ?", [usuario], async (err, row) => {
      if (err) {
        console.error('[LOGIN-ADMIN] ❌ Database error:', err.message);
        return res.status(500).json({ error: 'Erro interno do servidor' });
      }

      if (!row) {
        console.log('[LOGIN-ADMIN] ❌ Usuario not found:', usuario);
        return res.status(401).json({ error: 'Usuário ou senha inválidos' });
      }
      
      console.log('[LOGIN-ADMIN] ✅ User found:', {
        id: row.id,
        usuario: row.usuario,
        setor: row.setor, 
        role: row.role
      });
      
      // Verify password
      try {
        const isValidPassword = await bcrypt.compare(senha, row.senha_hash);
        console.log('[LOGIN-ADMIN] 🔑 Password validation result:', isValidPassword);
        
        if (!isValidPassword) {
          console.log('[LOGIN-ADMIN] ❌ Invalid password for usuario:', usuario);
          return res.status(401).json({ error: 'Usuário ou senha inválidos' });
        }
        
        // Verify admin role
        if (row.role !== 'admin') {
          console.log('[LOGIN-ADMIN] ❌ User is not admin, role:', row.role);
          return res.status(401).json({ error: 'Apenas administradores podem fazer login manual' });
        }
        
        // Login successful
        console.log('[LOGIN-ADMIN] ✅ Login successful for:', usuario);
        
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
        
        // Set secure cookie
        res.cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production', 
          maxAge: 24 * 60 * 60 * 1000, // 24 hours
          sameSite: 'lax'
        });
        
        // Return user data
        const userData = {
          id: row.id.toString(),
          usuario: row.usuario,
          nome: `Admin ${row.setor}`,
          email: `${row.usuario}@grupocropfield.com.br`,
          setor: row.setor,
          role: row.role,
          token: token
        };
        
        res.json({
          success: true,
          ...userData
        });
        
      } catch (passwordError) {
        console.error('[LOGIN-ADMIN] ❌ Password verification error:', passwordError);
        return res.status(500).json({ error: 'Erro na verificação da senha' });
      }
    });
    
  } catch (error) {
    console.error('[LOGIN-ADMIN] ❌ General error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Get current user
app.get('/api/me', (req, res) => {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      console.log('[ME] No token found');
      return res.status(401).json({ error: 'Token não encontrado' });
    }
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      console.log('[ME] Token decoded for user ID:', decoded.id);
      
      db.get("SELECT * FROM usuarios WHERE id = ?", [decoded.id], (err, row) => {
        if (err) {
          console.error('[ME] Database error:', err.message);
          return res.status(500).json({ error: 'Erro no banco de dados' });
        }
        
        if (!row) {
          console.log('[ME] User not found in DB for ID:', decoded.id);
          return res.status(401).json({ error: 'Usuário não encontrado' });
        }
        
        const userData = {
          id: row.id.toString(),
          usuario: row.usuario,
          nome: `Admin ${row.setor}`,
          email: `${row.usuario}@grupocropfield.com.br`,
          setor: row.setor,
          role: row.role
        };
        
        console.log('[ME] ✅ User data sent for:', userData.usuario);
        res.json({ user: userData });
      });
      
    } catch (jwtError) {
      console.error('[ME] JWT verification failed:', jwtError.message);
      res.status(401).json({ error: 'Token inválido' });
    }
  } catch (error) {
    console.error('[ME] General error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
  try {
    console.log('[LOGOUT] Clearing token cookie');
    res.clearCookie('token');
    res.json({ success: true, message: 'Logout realizado com sucesso' });
  } catch (error) {
    console.error('[LOGOUT] Error:', error);
    res.status(500).json({ error: 'Erro no logout' });
  }
});

// Google auth routes (placeholder - not implemented)
app.get('/auth/google', (req, res) => {
  res.status(501).json({ error: 'Google OAuth não implementado ainda' });
});

app.get('/auth/google/callback', (req, res) => {
  res.status(501).json({ error: 'Google OAuth não implementado ainda' });
});

// Test endpoint to list users
app.get('/api/test-users', (req, res) => {
  db.all("SELECT id, usuario, setor, role, created_at FROM usuarios", [], (err, rows) => {
    if (err) {
      console.error('Test users error:', err.message);
      return res.status(500).json({ error: err.message });
    }
    
    console.log('[TEST-USERS] Found', rows?.length || 0, 'users');
    res.json({ users: rows || [] });
  });
});

// Admin dashboard (protected route example)
app.get('/api/admin/dashboard', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado - apenas administradores' });
  }
  
  res.json({
    message: 'Painel administrativo',
    user: req.user,
    stats: {
      usuarios_ativos: 2,
      posts_mural: 0,
      reservas_salas: 0,
      solicitacoes_ti: 0,
      trocas_proteina: 0,
      agendamentos_portaria: 0
    }
  });
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  const buildPath = path.join(__dirname, 'dist');
  app.use(express.static(buildPath));
  
  // Catch-all for SPA routing
  app.get('*', (req, res) => {
    const indexPath = path.join(buildPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).json({ error: 'Frontend não encontrado. Execute: npm run build' });
    }
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(500).json({ error: 'Erro interno do servidor', details: err.message });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: `Endpoint não encontrado: ${req.originalUrl}` });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🗄️  Database: ${dbPath}`);
  console.log('📋 Available endpoints:');
  console.log('   GET  /api/health');
  console.log('   POST /api/login-admin');
  console.log('   GET  /api/me');
  console.log('   POST /api/logout');
  console.log('   GET  /auth/google');
  console.log('   GET  /auth/google/callback');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  server.close(() => {
    db.close((err) => {
      if (err) {
        console.error('❌ Error closing database:', err.message);
      } else {
        console.log('✅ Database connection closed');
      }
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  server.close(() => {
    db.close((err) => {
      if (err) {
        console.error('❌ Error closing database:', err.message);
      } else {
        console.log('✅ Database connection closed');
      }
      process.exit(0);
    });
  });
});