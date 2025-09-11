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
console.log('JWT_SECRET configured:', !!JWT_SECRET);

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
try {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('📁 Created data directory');
  }
} catch (error) {
  console.error('❌ Failed to create data directory:', error);
  process.exit(1);
}

// Database setup
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'data', 'database.sqlite');
console.log('📂 Database path:', dbPath);

let db;
try {
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('❌ Error opening database:', err.message);
      console.error('❌ Database path:', dbPath);
      console.error('❌ Try running: npm run clean:db');
      setTimeout(() => process.exit(1), 1000);
    } else {
      console.log('✅ Connected to SQLite database');
      console.log('📂 Database location:', dbPath);
      initializeDatabase();
    }
  });
} catch (error) {
  console.error('❌ Failed to create database connection:', error);
  console.error('❌ Try running: npm run clean:db');
  setTimeout(() => process.exit(1), 1000);
}

// Initialize database and create admin users
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
    `, function(err) {
      if (err) {
        console.error('❌ Error creating usuarios table:', err.message);
        return;
      }
      
      console.log('✅ Usuarios table created/verified');
      
      // Create admin users with bcrypt hashed passwords
      const adminTiHash = bcrypt.hashSync('admin123', 10);
      const adminRhHash = bcrypt.hashSync('admin123', 10);
      
      console.log('🔐 Creating admin users...');
      console.log('TI hash sample:', adminTiHash.substring(0, 20) + '...');
      console.log('RH hash sample:', adminRhHash.substring(0, 20) + '...');
      
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
      
      // Verify users were created
      setTimeout(() => {
        db.all("SELECT usuario, setor, role FROM usuarios", [], (err, rows) => {
          if (err) {
            console.error('❌ Error verifying users:', err.message);
          } else {
            console.log('📋 Users in database:', rows);
          }
        });
      }, 100);
    });
  });
}

// Middleware setup - ORDER IS IMPORTANT
app.use(cookieParser());
app.use(express.json());

// CORS configuration - ONLY origins, NO absolute URLs in routes
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

// Authentication middleware
const auth = (req, res, next) => {
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
  
  console.log('[AUTH-MIDDLEWARE] Checking token:', !!token);
  
  if (!token) {
    console.log('[AUTH-MIDDLEWARE] ❌ No token provided');
    return res.status(401).json({ error: 'Token de acesso requerido' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    console.log('[AUTH-MIDDLEWARE] ✅ Token valid for user:', decoded.usuario);
    next();
  } catch (error) {
    console.log('[AUTH-MIDDLEWARE] ❌ Invalid token:', error.message);
    return res.status(401).json({ error: 'Token inválido' });
  }
};

// ===== ROUTES - ALL RELATIVE PATHS ONLY =====

// Health check
app.get('/api/health', (req, res) => {
  console.log('[HEALTH] Health check requested');
  res.json({ 
    ok: true, 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    database: 'connected'
  });
});

// Manual admin login - MAIN LOGIN ROUTE
app.post('/api/login-admin', async (req, res) => {
  try {
    console.log('[LOGIN] 🔐 Login attempt started');
    console.log('[LOGIN] Request body keys:', Object.keys(req.body || {}));
    
    const { usuario, senha } = req.body;
    
    // Sanitize and validate input
    const usuarioTrimmed = String(usuario || '').trim();
    const senhaTrimmed = String(senha || '').trim();
    
    console.log('[LOGIN] Usuario (trimmed):', usuarioTrimmed);
    console.log('[LOGIN] Senha provided:', !!senhaTrimmed);

    if (!usuarioTrimmed || !senhaTrimmed) {
      console.log('[LOGIN] ❌ Missing credentials - usuario:', !!usuarioTrimmed, 'senha:', !!senhaTrimmed);
      return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
    }

    // Search user in database
    console.log('[LOGIN] 🔍 Searching user in database...');
    db.get("SELECT * FROM usuarios WHERE usuario = ?", [usuarioTrimmed], async (err, row) => {
      if (err) {
        console.error('[LOGIN] ❌ Database error:', err.message);
        return res.status(500).json({ error: 'Erro interno do servidor' });
      }

      console.log('[LOGIN] Database query result:', !!row);
      
      if (!row) {
        console.log('[LOGIN] ❌ User not found:', usuarioTrimmed);
        return res.status(401).json({ error: 'Usuário ou senha inválidos' });
      }
      
      console.log('[LOGIN] ✅ User found:', {
        id: row.id,
        usuario: row.usuario,
        setor: row.setor, 
        role: row.role,
        hasHash: !!row.senha_hash
      });
      
      // Verify password with bcrypt
      try {
        console.log('[LOGIN] 🔑 Verifying password...');
        console.log('[LOGIN] Hash from DB:', row.senha_hash.substring(0, 20) + '...');
        console.log('[LOGIN] Password to verify:', senhaTrimmed.substring(0, 3) + '...');
        
        const isValidPassword = await bcrypt.compare(senhaTrimmed, row.senha_hash);
        console.log('[LOGIN] 🔑 Password validation result:', isValidPassword);
        
        if (!isValidPassword) {
          console.log('[LOGIN] ❌ Invalid password for usuario:', usuarioTrimmed);
          return res.status(401).json({ error: 'Usuário ou senha inválidos' });
        }
        
        // Check admin role
        if (row.role !== 'admin') {
          console.log('[LOGIN] ❌ User is not admin, role:', row.role);
          return res.status(403).json({ error: 'Apenas administradores podem fazer login manual' });
        }
        
        // Login successful - create JWT token
        console.log('[LOGIN] ✅ Login successful for:', usuarioTrimmed);
        
        const tokenPayload = { 
          id: row.id,
          usuario: row.usuario, 
          setor: row.setor,
          role: row.role
        };
        
        const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '7d' });
        console.log('[LOGIN] 🎫 JWT token generated, length:', token.length);
        
        // Set secure cookie
        res.cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production', 
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
          sameSite: 'lax'
        });
        
        // Return user data (same format as token payload + token for frontend storage)
        const userData = {
          id: row.id.toString(),
          usuario: row.usuario,
          setor: row.setor,
          role: row.role,
          token: token // Include token for frontend if needed
        };
        
        console.log('[LOGIN] 📤 Sending response with user data');
        res.json(userData);
        
      } catch (passwordError) {
        console.error('[LOGIN] ❌ Password verification error:', passwordError);
        return res.status(500).json({ error: 'Erro na verificação da senha' });
      }
    });
    
  } catch (error) {
    console.error('[LOGIN] ❌ General login error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Get current user - protected route
app.get('/api/me', auth, (req, res) => {
  console.log('[ME] Current user request for:', req.user?.usuario);
  
  // Return user data from token (already validated by auth middleware)
  const userData = {
    id: req.user.id.toString(),
    usuario: req.user.usuario,
    setor: req.user.setor,
    role: req.user.role
  };
  
  console.log('[ME] ✅ Returning user data for:', userData.usuario);
  res.json(userData);
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
  console.log('[LOGOUT] Logout request received');
  res.clearCookie('token');
  res.json({ success: true, message: 'Logout realizado com sucesso' });
});

// Google auth routes (placeholder for future implementation)
app.get('/auth/google', (req, res) => {
  console.log('[GOOGLE] Google OAuth requested (not implemented)');
  res.status(501).json({ error: 'Google OAuth não implementado ainda. Use login manual.' });
});

app.get('/auth/google/callback', (req, res) => {
  console.log('[GOOGLE] Google OAuth callback (not implemented)');
  res.status(501).json({ error: 'Google OAuth não implementado ainda' });
});

// Test endpoint to verify users exist
app.get('/api/test-users', (req, res) => {
  console.log('[TEST] Listing all users...');
  db.all("SELECT id, usuario, setor, role, created_at FROM usuarios", [], (err, rows) => {
    if (err) {
      console.error('[TEST] Error querying users:', err.message);
      return res.status(500).json({ error: err.message });
    }
    
    console.log('[TEST] Found', rows?.length || 0, 'users');
    res.json({ users: rows || [] });
  });
});

// Admin dashboard (example protected route)
app.get('/api/admin/dashboard', auth, (req, res) => {
  console.log('[ADMIN] Dashboard access by:', req.user?.usuario);
  
  if (req.user.role !== 'admin') {
    console.log('[ADMIN] ❌ Access denied, role:', req.user.role);
    return res.status(403).json({ error: 'Acesso negado - apenas administradores' });
  }
  
  res.json({
    message: 'Painel administrativo acessado',
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
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// 404 handler for API routes only
app.use('/api/*', (req, res) => {
  console.log('[404] API endpoint not found:', req.originalUrl);
  res.status(404).json({ error: `Endpoint não encontrado: ${req.originalUrl}` });
});

// Start server
let server;
try {
  server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🗄️  Database: ${dbPath}`);
    console.log('📋 Available endpoints:');
    console.log('   GET  /api/health        - Health check');
    console.log('   POST /api/login-admin   - Manual admin login');
    console.log('   GET  /api/me            - Current user (protected)');
    console.log('   POST /api/logout        - Logout');
    console.log('   GET  /api/test-users    - List users (dev)');
    console.log('   GET  /auth/google       - Google OAuth (placeholder)');
    console.log('   GET  /auth/google/callback - Google callback (placeholder)');
    console.log('');
    console.log('🔑 Test credentials:');
    console.log('   admin-ti / admin123 (TI Admin)');
    console.log('   admin-rh / admin123 (RH Admin)');
    console.log('');
    console.log('🚀 Backend ready for connections!');
  });
  
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} is already in use`);
      console.error('❌ Try: killall node OR use a different PORT');
    } else {
      console.error('❌ Server error:', error);
    }
    process.exit(1);
  });
} catch (error) {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  server.close(() => {
    db?.close((err) => {
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
    db?.close((err) => {
      if (err) {
        console.error('❌ Error closing database:', err.message);
      } else {
        console.log('✅ Database connection closed');
      }
      process.exit(0);
    });
  });
});