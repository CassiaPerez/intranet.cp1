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
const NODE_ENV = process.env.NODE_ENV || 'development';

console.log('🚀 Starting Intranet Cropfield Backend...');
console.log('📊 Environment:', NODE_ENV);
console.log('🔌 Port:', PORT);
console.log('🔐 JWT Secret configured:', !!JWT_SECRET);

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('📁 Created data directory:', dataDir);
}

// Database setup
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'data', 'database.sqlite');
console.log('🗄️  Database path:', dbPath);

// Initialize database connection
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error opening database:', err.message);
    process.exit(1);
  } else {
    console.log('✅ Connected to SQLite database');
    initializeDatabase();
  }
});

// Database initialization function
async function initializeDatabase() {
  return new Promise((resolve, reject) => {
    console.log('🗃️  Initializing database tables...');
    
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
          reject(err);
          return;
        }
        
        console.log('✅ Usuarios table created/verified');
        createAdminUsers(resolve, reject);
      });
    });
  });
}

// Create admin users function
function createAdminUsers(resolve, reject) {
  console.log('👥 Setting up admin users...');
  
  // Check if admin users already exist
  db.get("SELECT COUNT(*) as count FROM usuarios WHERE usuario IN ('admin-ti', 'admin-rh')", [], (err, row) => {
    if (err) {
      console.error('❌ Error checking existing users:', err.message);
      reject(err);
      return;
    }
    
    const existingCount = row.count || 0;
    console.log('📊 Existing admin users:', existingCount);
    
    if (existingCount >= 2) {
      console.log('✅ Admin users already exist, skipping creation');
      resolve();
      return;
    }
    
    // Create password hashes
    const adminTiHash = bcrypt.hashSync('admin123', 10);
    const adminRhHash = bcrypt.hashSync('admin123', 10);
    
    console.log('🔐 Generated password hashes');
    console.log('   TI Hash (first 20 chars):', adminTiHash.substring(0, 20) + '...');
    console.log('   RH Hash (first 20 chars):', adminRhHash.substring(0, 20) + '...');
    
    // Insert admin-ti
    db.run(`
      INSERT OR REPLACE INTO usuarios (usuario, senha_hash, setor, role)
      VALUES (?, ?, ?, ?)
    `, ['admin-ti', adminTiHash, 'TI', 'admin'], function(err) {
      if (err) {
        console.error('❌ Error creating admin-ti:', err.message);
        reject(err);
        return;
      }
      
      console.log('✅ Admin TI created: admin-ti / admin123');
      
      // Insert admin-rh
      db.run(`
        INSERT OR REPLACE INTO usuarios (usuario, senha_hash, setor, role)
        VALUES (?, ?, ?, ?)
      `, ['admin-rh', adminRhHash, 'RH', 'admin'], function(err) {
        if (err) {
          console.error('❌ Error creating admin-rh:', err.message);
          reject(err);
          return;
        }
        
        console.log('✅ Admin RH created: admin-rh / admin123');
        
        // Verify creation
        db.all("SELECT usuario, setor, role FROM usuarios", [], (err, rows) => {
          if (err) {
            console.error('❌ Error verifying users:', err.message);
          } else {
            console.log('📋 Users in database:', rows);
          }
          resolve();
        });
      });
    });
  });
}

// Wait for database initialization before setting up middleware
async function startServer() {
  try {
    await initializeDatabase();
    console.log('✅ Database initialization complete');
    
    // Middleware setup - IMPORTANT: ORDER MATTERS
    app.use(cookieParser());
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true }));

    // CORS configuration
    app.use(cors({
      origin: [
        'http://localhost:5173',
        'http://localhost:5174', 
        'http://localhost:5175',
        'https://intranet.grupocropfield.com.br',
        /\.stackblitz\.io$/,
        /\.webcontainer\.io$/
      ],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'X-Requested-With']
    }));

    // Authentication middleware
    const auth = (req, res, next) => {
      const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
      
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

    // ===== API ROUTES =====

    // Health check
    app.get('/api/health', (req, res) => {
      console.log('[HEALTH] ✅ Health check requested');
      res.json({ 
        ok: true, 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        database: 'connected',
        environment: NODE_ENV
      });
    });

    // Manual admin login
    app.post('/api/login-admin', async (req, res) => {
      try {
        console.log('[LOGIN] 🔐 Login attempt started');
        console.log('[LOGIN] Request headers:', Object.keys(req.headers || {}));
        console.log('[LOGIN] Request body:', req.body ? 'present' : 'missing');
        
        const { usuario, senha } = req.body;
        
        // Validate input
        const usuarioClean = String(usuario || '').trim();
        const senhaClean = String(senha || '').trim();
        
        console.log('[LOGIN] 📝 Credentials check:');
        console.log('   Usuario (trimmed):', usuarioClean);
        console.log('   Senha provided:', !!senhaClean);
        console.log('   Senha length:', senhaClean.length);

        if (!usuarioClean || !senhaClean) {
          console.log('[LOGIN] ❌ Missing credentials');
          return res.status(400).json({ 
            error: 'Usuário e senha são obrigatórios',
            details: {
              usuario: !!usuarioClean,
              senha: !!senhaClean
            }
          });
        }

        // Search user in database
        console.log('[LOGIN] 🔍 Searching for user:', usuarioClean);
        
        db.get("SELECT * FROM usuarios WHERE usuario = ?", [usuarioClean], async (err, row) => {
          if (err) {
            console.error('[LOGIN] ❌ Database error:', err.message);
            return res.status(500).json({ error: 'Erro interno do servidor' });
          }

          console.log('[LOGIN] 📊 Database query result:');
          console.log('   User found:', !!row);
          
          if (!row) {
            console.log('[LOGIN] ❌ User not found in database:', usuarioClean);
            
            // List all users for debugging
            db.all("SELECT usuario FROM usuarios", [], (err, allUsers) => {
              if (!err) {
                console.log('[LOGIN] 📋 Available users:', allUsers.map(u => u.usuario));
              }
            });
            
            return res.status(401).json({ error: 'Usuário ou senha inválidos' });
          }
          
          console.log('[LOGIN] ✅ User found in database:');
          console.log('   ID:', row.id);
          console.log('   Usuario:', row.usuario);
          console.log('   Setor:', row.setor);
          console.log('   Role:', row.role);
          console.log('   Has hash:', !!row.senha_hash);
          console.log('   Hash preview:', row.senha_hash ? row.senha_hash.substring(0, 20) + '...' : 'none');
          
          // Verify password with bcrypt
          try {
            console.log('[LOGIN] 🔑 Starting password verification...');
            console.log('   Input password:', senhaClean.substring(0, 3) + '***');
            console.log('   Stored hash preview:', row.senha_hash.substring(0, 20) + '...');
            
            const isValidPassword = await bcrypt.compare(senhaClean, row.senha_hash);
            console.log('[LOGIN] 🔑 Password verification result:', isValidPassword);
            
            if (!isValidPassword) {
              console.log('[LOGIN] ❌ Password verification failed for user:', usuarioClean);
              return res.status(401).json({ error: 'Usuário ou senha inválidos' });
            }
            
            // Login successful
            console.log('[LOGIN] ✅ Password verification successful!');
            
            const tokenPayload = { 
              id: row.id,
              usuario: row.usuario, 
              setor: row.setor,
              role: row.role
            };
            
            console.log('[LOGIN] 🎫 Creating JWT token with payload:', tokenPayload);
            const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '7d' });
            console.log('[LOGIN] 🎫 JWT token generated, length:', token.length);
            
            // Set secure cookie
            const cookieOptions = {
              httpOnly: true,
              secure: NODE_ENV === 'production',
              maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
              sameSite: NODE_ENV === 'production' ? 'none' : 'lax'
            };
            
            res.cookie('token', token, cookieOptions);
            console.log('[LOGIN] 🍪 Cookie set with options:', cookieOptions);
            
            // Return user data
            const userData = {
              id: row.id.toString(),
              usuario: row.usuario,
              nome: row.usuario, // For compatibility
              name: row.usuario, // For compatibility  
              setor: row.setor,
              sector: row.setor, // For compatibility
              role: row.role,
              token: token
            };
            
            console.log('[LOGIN] 📤 Sending success response');
            res.json(userData);
            
          } catch (passwordError) {
            console.error('[LOGIN] ❌ bcrypt.compare error:', passwordError.message);
            return res.status(500).json({ error: 'Erro na verificação da senha' });
          }
        });
        
      } catch (error) {
        console.error('[LOGIN] ❌ General login error:', error.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
      }
    });

    // Get current user
    app.get('/api/me', auth, (req, res) => {
      console.log('[ME] ✅ Current user request for:', req.user?.usuario);
      
      const userData = {
        id: req.user.id.toString(),
        usuario: req.user.usuario,
        nome: req.user.usuario,
        name: req.user.usuario,
        setor: req.user.setor,
        sector: req.user.setor,
        role: req.user.role
      };
      
      console.log('[ME] 📤 Returning user data');
      res.json(userData);
    });

    // Logout endpoint
    app.post('/api/logout', (req, res) => {
      console.log('[LOGOUT] 🚪 Logout request received');
      res.clearCookie('token');
      res.json({ success: true, message: 'Logout realizado com sucesso' });
    });

    // Test endpoint to check database
    app.get('/api/test-users', (req, res) => {
      console.log('[TEST] 📋 Listing all users...');
      
      db.all("SELECT id, usuario, setor, role, created_at FROM usuarios", [], (err, rows) => {
        if (err) {
          console.error('[TEST] ❌ Error querying users:', err.message);
          return res.status(500).json({ error: err.message });
        }
        
        console.log('[TEST] 📊 Found users:', rows?.length || 0);
        res.json({ users: rows || [], count: rows?.length || 0 });
      });
    });

    // Test password verification endpoint (development only)
    if (NODE_ENV === 'development') {
      app.post('/api/test-password', async (req, res) => {
        try {
          const { usuario, senha } = req.body;
          
          if (!usuario || !senha) {
            return res.status(400).json({ error: 'Usuario and senha required' });
          }
          
          db.get("SELECT * FROM usuarios WHERE usuario = ?", [usuario], async (err, row) => {
            if (err) {
              return res.status(500).json({ error: err.message });
            }
            
            if (!row) {
              return res.status(404).json({ error: 'User not found' });
            }
            
            const isValid = await bcrypt.compare(senha, row.senha_hash);
            
            res.json({
              usuario: row.usuario,
              hashPreview: row.senha_hash.substring(0, 20) + '...',
              passwordProvided: senha.substring(0, 3) + '***',
              isValid: isValid,
              role: row.role,
              setor: row.setor
            });
          });
          
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      });
    }

    // Admin dashboard (protected route)
    app.get('/api/admin/dashboard', auth, (req, res) => {
      console.log('[ADMIN] 📊 Dashboard access by:', req.user?.usuario);
      
      if (req.user.role !== 'admin') {
        console.log('[ADMIN] ❌ Access denied, role:', req.user.role);
        return res.status(403).json({ error: 'Acesso negado - apenas administradores' });
      }
      
      res.json({
        message: 'Dashboard acessado com sucesso',
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

    // ===== MURAL API ROUTES =====
    
    // Get all posts
    app.get('/api/mural/posts', auth, (req, res) => {
      console.log('[MURAL] 📄 Loading posts for user:', req.user?.usuario);
      res.json([]);
    });

    // Create new post
    app.post('/api/mural/posts', auth, (req, res) => {
      console.log('[MURAL] ➕ Creating new post by user:', req.user?.usuario);
      res.json({ success: true, message: 'Post criado com sucesso' });
    });

    // Like/unlike post
    app.post('/api/mural/:postId/like', auth, (req, res) => {
      console.log('[MURAL] ❤️ Like/unlike post:', req.params.postId, 'by user:', req.user?.usuario);
      res.json({ success: true, liked: true });
    });

    // Get post comments
    app.get('/api/mural/:postId/comments', auth, (req, res) => {
      console.log('[MURAL] 💬 Loading comments for post:', req.params.postId);
      res.json([]);
    });

    // Add comment to post
    app.post('/api/mural/:postId/comments', auth, (req, res) => {
      console.log('[MURAL] ➕ Adding comment to post:', req.params.postId, 'by user:', req.user?.usuario);
      res.json({ success: true, message: 'Comentário adicionado com sucesso' });
    });

    // Delete comment
    app.delete('/api/mural/comments/:commentId', auth, (req, res) => {
      console.log('[MURAL] 🗑️ Deleting comment:', req.params.commentId, 'by user:', req.user?.usuario);
      res.json({ success: true, message: 'Comentário removido com sucesso' });
    });

    // ===== EQUIPAMENTOS/TI API ROUTES =====
    
    // Get all TI requests (for admins/TI users)
    app.get('/api/ti/solicitacoes', auth, (req, res) => {
      console.log('[TI] 📋 Loading TI requests for user:', req.user?.usuario, 'role:', req.user?.role);
      res.json([]);
    });

    // Get user's own TI requests
    app.get('/api/ti/minhas', auth, (req, res) => {
      console.log('[TI] 📋 Loading user TI requests for:', req.user?.usuario);
      res.json([]);
    });

    // Create new TI request
    app.post('/api/ti/solicitacoes', auth, (req, res) => {
      console.log('[TI] ➕ Creating TI request by user:', req.user?.usuario);
      res.json({ success: true, message: 'Solicitação criada com sucesso' });
    });
    // Google OAuth placeholders (for compatibility)
    app.get('/auth/google', (req, res) => {
      console.log('[GOOGLE] 🔗 Google OAuth requested (not implemented)');
      res.redirect('/login?error=google_not_configured');
    });

    app.get('/auth/google/callback', (req, res) => {
      console.log('[GOOGLE] 🔗 Google OAuth callback (not implemented)');
      res.redirect('/login?error=google_not_configured');
    });

    // Serve static files in production
    if (NODE_ENV === 'production') {
      const buildPath = path.join(__dirname, 'dist');
      if (fs.existsSync(buildPath)) {
        app.use(express.static(buildPath));
        
        // Catch-all for SPA routing
        app.get('*', (req, res) => {
          const indexPath = path.join(buildPath, 'index.html');
          if (fs.existsSync(indexPath)) {
            res.sendFile(indexPath);
          } else {
            res.status(404).json({ error: 'Frontend build not found' });
          }
        });
      }
    }

    // Error handling middleware
    app.use((err, req, res, next) => {
      console.error('❌ Server error:', err.message);
      res.status(500).json({ error: 'Erro interno do servidor' });
    });

    // 404 handler for API routes only
    app.use('/api/*', (req, res) => {
      console.log('[404] 🚫 API endpoint not found:', req.originalUrl);
      res.status(404).json({ error: `Endpoint não encontrado: ${req.originalUrl}` });
    });

    // Start server
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log('🎉 SERVER READY!');
      console.log(`✅ Backend running on http://localhost:${PORT}`);
      console.log(`🌐 Environment: ${NODE_ENV}`);
      console.log(`🗄️  Database: ${dbPath}`);
      console.log('');
      console.log('📋 Available API endpoints:');
      console.log('   GET  /api/health           - Health check');
      console.log('   POST /api/login-admin      - Manual admin login');
      console.log('   GET  /api/me               - Current user (protected)');
      console.log('   POST /api/logout           - Logout');
      console.log('   GET  /api/test-users       - List users (dev)');
      if (NODE_ENV === 'development') {
        console.log('   POST /api/test-password    - Test password (dev only)');
      }
      console.log('   GET  /auth/google          - Google OAuth (placeholder)');
      console.log('   GET  /auth/google/callback - Google callback (placeholder)');
      console.log('');
      console.log('🔑 Test credentials:');
      console.log('   admin-ti / admin123 (TI Admin)');
      console.log('   admin-rh / admin123 (RH Admin)');
      console.log('');
      console.log('🚀 Ready for frontend connections!');
    });
    
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use`);
        console.error('💡 Try: killall node OR set different PORT');
      } else {
        console.error('❌ Server error:', error.message);
      }
      process.exit(1);
    });

    // Graceful shutdown
    const gracefulShutdown = (signal) => {
      console.log(`\n🛑 ${signal} received, shutting down gracefully...`);
      
      server.close(() => {
        console.log('✅ HTTP server closed');
        
        db.close((err) => {
          if (err) {
            console.error('❌ Error closing database:', err.message);
          } else {
            console.log('✅ Database connection closed');
          }
          process.exit(0);
        });
      });
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
  } catch (error) {
    console.error('❌ Failed to initialize server:', error.message);
    process.exit(1);
  }
}

// Start the server
startServer().catch(error => {
  console.error('❌ Critical error starting server:', error);
  process.exit(1);
});