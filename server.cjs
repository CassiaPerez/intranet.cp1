const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'sua-chave-secreta-super-segura';

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('Created data directory');
}

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

// Database setup
const dbPath = path.join(__dirname, 'data', 'database.sqlite');
console.log('Database path:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database.');
    
    // Create usuarios table
    db.serialize(() => {
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
          console.error('Error creating usuarios table:', err);
          return;
        }
        
        console.log('Usuarios table created successfully');
        
        // Create admin users with bcrypt
        const adminTiHash = bcrypt.hashSync('admin123', 10);
        const adminRhHash = bcrypt.hashSync('admin123', 10);
        
        // Insert admin-ti
        db.run(`
          INSERT OR IGNORE INTO usuarios (usuario, senha_hash, setor, role)
          VALUES (?, ?, ?, ?)
        `, ['admin-ti', adminTiHash, 'TI', 'admin'], (err) => {
          if (err) {
            console.error('Error creating admin-ti:', err);
          } else {
            console.log('✅ Admin-TI user created: admin-ti / admin123');
          }
        });
        
        // Insert admin-rh  
        db.run(`
          INSERT OR IGNORE INTO usuarios (usuario, senha_hash, setor, role)
          VALUES (?, ?, ?, ?)
        `, ['admin-rh', adminRhHash, 'RH', 'admin'], (err) => {
          if (err) {
            console.error('Error creating admin-rh:', err);
          } else {
            console.log('✅ Admin-RH user created: admin-rh / admin123');
          }
        });
      });
    });
  }
});

// API Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Manual login for admin users
app.post('/api/login-admin', async (req, res) => {
  try {
    const { usuario, senha } = req.body;
    
    console.log('[LOGIN-ADMIN] Login attempt for usuario:', usuario);

    if (!usuario || !senha) {
      console.log('[LOGIN-ADMIN] Missing credentials');
      return res.status(400).json({ error: 'Usuario e senha são obrigatórios' });
    }

    // Buscar usuário no banco
    db.get("SELECT * FROM usuarios WHERE usuario = ?", [usuario], async (err, row) => {
      if (err) {
        console.error('[LOGIN-ADMIN] Database error:', err);
        return res.status(500).json({ error: 'Erro interno do servidor' });
      }

      if (!row) {
        console.log('[LOGIN-ADMIN] Usuario not found:', usuario);
        return res.status(401).json({ error: 'Usuario ou senha inválidos' });
      }
      
      console.log('[LOGIN-ADMIN] User found:', {
        usuario: row.usuario,
        setor: row.setor, 
        role: row.role,
        hasHash: !!row.senha_hash
      });
      
      // Verificar se é admin
      if (row.role !== 'admin') {
        console.log('[LOGIN-ADMIN] User is not admin, role:', row.role);
        return res.status(401).json({ error: 'Apenas administradores podem fazer login manual' });
      }
      
      // Verificar senha
      try {
        const isValidPassword = await bcrypt.compare(senha, row.senha_hash);
        console.log('[LOGIN-ADMIN] Password check result:', isValidPassword);
        
        if (!isValidPassword) {
          console.log('[LOGIN-ADMIN] Invalid password for usuario:', usuario);
          return res.status(401).json({ error: 'Usuario ou senha inválidos' });
        }
        
        // Login bem-sucedido
        console.log('[LOGIN-ADMIN] ✅ Login successful for:', usuario);
        
        // Criar JWT token
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
        
        // Definir cookie
        res.cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production', 
          maxAge: 24 * 60 * 60 * 1000
        });
        
        // Retornar dados do usuário
        const userData = {
          id: row.id.toString(),
          usuario: row.usuario,
          nome: `Admin ${row.setor}`,
          email: `${row.usuario}@grupocropfield.com.br`,
          setor: row.setor,
          role: row.role
        };
        
        res.json({
          success: true,
          user: userData,
          token
        });
        
      } catch (passwordError) {
        console.error('[LOGIN-ADMIN] Password verification error:', passwordError);
        return res.status(500).json({ error: 'Erro na verificação da senha' });
      }
    });
    
  } catch (error) {
    console.error('[LOGIN-ADMIN] General error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Get current user
app.get('/api/me', (req, res) => {
  try {
    const token = req.cookies?.token;
    
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        db.get("SELECT * FROM usuarios WHERE id = ?", [decoded.id], (err, row) => {
          if (err || !row) {
            return res.status(401).json({ error: 'Token inválido' });
          }
          
          const userData = {
            id: row.id.toString(),
            usuario: row.usuario,
            nome: `Admin ${row.setor}`,
            email: `${row.usuario}@grupocropfield.com.br`,
            setor: row.setor,
            role: row.role
          };
          
          res.json({ user: userData });
        });
        
      } catch (jwtError) {
        console.error('[ME] JWT verification failed:', jwtError);
        res.status(401).json({ error: 'Token inválido' });
      }
    } else {
      res.status(401).json({ error: 'Token não encontrado' });
    }

  } catch (error) {
    console.error('[ME] Error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
  try {
    res.clearCookie('token');
    res.json({ success: true, message: 'Logout realizado com sucesso' });
  } catch (error) {
    console.error('[LOGOUT] Error:', error);
    res.status(500).json({ error: 'Erro no logout' });
  }
});

// Configuration endpoint
app.get('/api/config', (req, res) => {
  res.json({
    environment: process.env.NODE_ENV || 'development',
    googleEnabled: false // Desabilitado por enquanto
  });
});

// Test endpoint to verify users in database
app.get('/api/test-users', (req, res) => {
  db.all("SELECT usuario, setor, role, created_at FROM usuarios", [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ users: rows || [] });
  });
});

// Middleware to check authentication
const authenticateToken = (req, res, next) => {
  const token = req.cookies?.token;
  
  if (!token) {
    return res.status(401).json({ error: 'Token de acesso requerido' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido' });
  }
};

// Protected admin routes example
app.get('/api/admin/dashboard', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado' });
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

// Serve static files for production
app.use(express.static(path.join(__dirname, 'dist')));

// Serve React app for non-API routes
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'dist', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ error: 'Frontend not built. Run: npm run build' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Environment:', process.env.NODE_ENV);
  console.log('Database path:', dbPath);
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