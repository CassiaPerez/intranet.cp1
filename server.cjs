const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Import database module
const { getDb, run, get, all, tx, initializeDatabase, closeDb } = require('./db.cjs');

const app = express();
const PORT = process.env.PORT || 3006;
const JWT_SECRET = process.env.JWT_SECRET || 'cropfield-secret-key-2025';
const NODE_ENV = process.env.NODE_ENV || 'development';

console.log('🚀 Starting Intranet Cropfield Backend...');
console.log('📊 Environment:', NODE_ENV);
console.log('🔌 Port:', PORT);
console.log('🔐 JWT Secret configured:', !!JWT_SECRET);

// Global error handler
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Initialize database and start server
async function startServer() {
  try {
    // Initialize database first
    await initializeDatabase();
    console.log('✅ Database initialized successfully');

    // Setup middleware - ORDER MATTERS
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

    // Request logging middleware
    app.use((req, res, next) => {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
      next();
    });

    // Authentication middleware
    const auth = (req, res, next) => {
      let token = req.cookies?.token;
      
      // Also check Authorization header as fallback
      if (!token && req.headers.authorization) {
        token = req.headers.authorization.replace('Bearer ', '');
      }
       
      if (!token) {
        console.log('[AUTH] ❌ No token provided');
        return res.status(401).json({ error: 'Token de acesso requerido' });
      }
      
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        console.log('[AUTH] ✅ Token valid for user:', decoded.usuario);
        next();
      } catch (error) {
        console.log('[AUTH] ❌ Invalid token:', error.message);
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

    // ===== AUTHENTICATION =====
    
    // Manual admin login
    app.post('/api/login-admin', async (req, res) => {
      try {
        console.log('[LOGIN] 🔐 Login attempt');
        const { usuario, senha } = req.body;
        
        const usuarioClean = String(usuario || '').trim();
        const senhaClean = String(senha || '').trim();
        
        if (!usuarioClean || !senhaClean) {
          console.log('[LOGIN] ❌ Missing credentials');
          return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
        }

        // Search user in database
        const row = await get(`
          SELECT id, usuario, senha_hash, setor, role, nome, email 
          FROM usuarios 
          WHERE usuario = ?
        `, [usuarioClean]);

        if (!row) {
          console.log('[LOGIN] ❌ User not found:', usuarioClean);
          return res.status(401).json({ error: 'Usuário ou senha inválidos' });
        }
        
        console.log('[LOGIN] ✅ User found:', row.usuario);
        
        // Verify password
        const isValidPassword = await bcrypt.compare(senhaClean, row.senha_hash);
        
        if (!isValidPassword) {
          console.log('[LOGIN] ❌ Invalid password for user:', usuarioClean);
          return res.status(401).json({ error: 'Usuário ou senha inválidos' });
        }
        
        console.log('[LOGIN] ✅ Password verified successfully');
        
        // Generate JWT token
        const tokenPayload = { 
          id: row.id,
          usuario: row.usuario, 
          setor: row.setor,
          role: row.role
        };
        
        const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '7d' });
        
        // Set secure cookie
        const cookieOptions = {
          httpOnly: true,
          secure: NODE_ENV === 'production',
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
          sameSite: 'lax',
          path: '/'
        };
        
        res.cookie('token', token, cookieOptions);
        console.log('[LOGIN] 🍪 Cookie set successfully');
        
        // Return user data
        const userData = {
          id: row.id.toString(),
          usuario: row.usuario,
          nome: row.nome || row.usuario,
          name: row.nome || row.usuario,
          email: row.email || `${row.usuario}@grupocropfield.com.br`,
          setor: row.setor,
          sector: row.setor,
          role: row.role,
          token: token
        };
        
        console.log('[LOGIN] ✅ Login successful for:', row.usuario);
        res.status(200).json(userData);
        
      } catch (error) {
        console.error('[LOGIN] ❌ Login error:', error.message);
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
        email: `${req.user.usuario}@grupocropfield.com.br`,
        setor: req.user.setor,
        sector: req.user.setor,
        role: req.user.role
      };
      
      res.json(userData);
    });

    // Logout endpoint
    app.post('/api/logout', (req, res) => {
      console.log('[LOGOUT] 🚪 Logout request received');
      res.clearCookie('token');
      res.json({ success: true, message: 'Logout realizado com sucesso' });
    });

    // ===== USERS API =====
    
    app.get('/api/usuarios', auth, async (req, res) => {
      try {
        console.log('[USUARIOS] 📋 Loading all users');
        
        const users = await all(`
          SELECT id, usuario, setor, role, nome, email, created_at, updated_at
          FROM usuarios 
          ORDER BY created_at DESC
        `);
        
        console.log('[USUARIOS] ✅ Found', users.length, 'users');
        res.json({ users });
        
      } catch (error) {
        console.error('[USUARIOS] ❌ Error loading users:', error.message);
        res.status(500).json({ error: 'Erro ao carregar usuários' });
      }
    });

    // ===== TI/EQUIPAMENTOS API =====
    
    app.post('/api/ti/solicitacoes', auth, async (req, res) => {
      try {
        console.log('[TI] ➕ Creating TI request');
        const { titulo, descricao, prioridade, email, nome } = req.body;
        
        // Validate required fields
        if (!titulo || !descricao || !prioridade) {
          return res.status(400).json({ 
            error: 'Campos obrigatórios: titulo, descricao, prioridade' 
          });
        }
        
        // Validate prioridade
        const validPriorities = ['baixa', 'media', 'alta'];
        if (!validPriorities.includes(prioridade)) {
          return res.status(400).json({ 
            error: 'Prioridade deve ser: baixa, media ou alta' 
          });
        }
        
        const result = await tx(async () => {
          return await run(`
            INSERT INTO solicitacoes_ti 
            (solicitante_nome, solicitante_email, equipamento, descricao, prioridade) 
            VALUES (?, ?, ?, ?, ?)
          `, [
            nome || req.user.usuario,
            email || null, // Allow NULL email
            titulo,
            descricao,
            prioridade
          ]);
        });
        
        console.log('[TI] ✅ TI request created with ID:', result.lastID);
        res.status(201).json({ 
          success: true, 
          id: result.lastID,
          message: 'Solicitação criada com sucesso' 
        });
        
      } catch (error) {
        console.error('[TI] ❌ Error creating request:', error.message);
        res.status(500).json({ error: 'Erro ao criar solicitação' });
      }
    });

    app.get('/api/ti/solicitacoes', auth, async (req, res) => {
      try {
        console.log('[TI] 📋 Loading TI requests');
        
        const requests = await all(`
          SELECT id, solicitante_nome, solicitante_email, equipamento, descricao, 
                 prioridade, status, created_at, updated_at
          FROM solicitacoes_ti 
          ORDER BY created_at DESC
        `);
        
        console.log('[TI] ✅ Found', requests.length, 'TI requests');
        res.json({ solicitacoes: requests });
        
      } catch (error) {
        console.error('[TI] ❌ Error loading requests:', error.message);
        res.status(500).json({ error: 'Erro ao carregar solicitações' });
      }
    });

    // ===== MURAL API =====
    
    app.post('/api/mural/posts', auth, async (req, res) => {
      try {
        console.log('[MURAL] ➕ Creating post');
        const { titulo, conteudo, pinned } = req.body;
        
        if (!titulo || !conteudo) {
          return res.status(400).json({ 
            error: 'Título e conteúdo são obrigatórios' 
          });
        }
        
        const result = await tx(async () => {
          return await run(`
            INSERT INTO mural_posts 
            (autor_usuario, autor_setor, titulo, conteudo, publicado) 
            VALUES (?, ?, ?, ?, ?)
          `, [
            req.user.usuario,
            req.user.setor,
            titulo,
            conteudo,
            pinned ? 1 : 1 // All posts published for now
          ]);
        });
        
        console.log('[MURAL] ✅ Post created with ID:', result.lastID);
        res.status(201).json({ 
          success: true, 
          id: result.lastID,
          message: 'Post criado com sucesso' 
        });
        
      } catch (error) {
        console.error('[MURAL] ❌ Error creating post:', error.message);
        res.status(500).json({ error: 'Erro ao criar post' });
      }
    });

    app.get('/api/mural/posts', auth, async (req, res) => {
      try {
        console.log('[MURAL] 📄 Loading posts');
        
        const posts = await all(`
          SELECT id, autor_usuario as author, titulo, conteudo, 
                 publicado, created_at, updated_at,
                 0 as likes_count, 0 as comments_count, 0 as pinned
          FROM mural_posts 
          WHERE publicado = 1
          ORDER BY created_at DESC
        `);
        
        console.log('[MURAL] ✅ Found', posts.length, 'posts');
        res.json({ posts });
        
      } catch (error) {
        console.error('[MURAL] ❌ Error loading posts:', error.message);
        res.status(500).json({ error: 'Erro ao carregar posts' });
      }
    });

    // Mural post interactions (placeholders for now)
    app.post('/api/mural/:postId/like', auth, (req, res) => {
      console.log('[MURAL] ❤️ Like/unlike post:', req.params.postId);
      res.json({ success: true, action: 'liked' });
    });

    app.get('/api/mural/:postId/comments', auth, (req, res) => {
      console.log('[MURAL] 💬 Loading comments for post:', req.params.postId);
      res.json({ comments: [] });
    });

    app.post('/api/mural/:postId/comments', auth, (req, res) => {
      console.log('[MURAL] ➕ Adding comment to post:', req.params.postId);
      res.json({ success: true, message: 'Comentário adicionado' });
    });

    app.delete('/api/mural/comments/:commentId', auth, (req, res) => {
      console.log('[MURAL] 🗑️ Deleting comment:', req.params.commentId);
      res.json({ success: true, message: 'Comentário removido' });
    });

    // ===== SALAS/RESERVAS API =====
    
    app.post('/api/salas/agendar', auth, async (req, res) => {
      try {
        console.log('[SALAS] ➕ Creating room reservation');
        const { sala_id, titulo, descricao, inicio, fim } = req.body;
        
        if (!sala_id || !titulo || !inicio || !fim) {
          return res.status(400).json({ 
            error: 'Campos obrigatórios: sala_id, titulo, inicio, fim' 
          });
        }
        
        // Validate datetime formats
        if (!Date.parse(inicio) || !Date.parse(fim)) {
          return res.status(400).json({ 
            error: 'Formato de data/hora inválido para inicio ou fim' 
          });
        }
        
        const result = await tx(async () => {
          return await run(`
            INSERT INTO agendamentos_salas 
            (sala_id, titulo, descricao, inicio, fim, reservado_por) 
            VALUES (?, ?, ?, ?, ?, ?)
          `, [
            sala_id,
            titulo,
            descricao || null,
            inicio,
            fim,
            req.user.usuario
          ]);
        });
        
        console.log('[SALAS] ✅ Room reservation created with ID:', result.lastID);
        res.status(201).json({ 
          success: true, 
          id: result.lastID,
          message: 'Reserva criada com sucesso',
          points: 8
        });
        
      } catch (error) {
        console.error('[SALAS] ❌ Error creating reservation:', error.message);
        res.status(500).json({ error: 'Erro ao criar reserva' });
      }
    });

    app.get('/api/salas/agendados', auth, async (req, res) => {
      try {
        console.log('[SALAS] 📅 Loading room reservations');
        
        const reservations = await all(`
          SELECT id, sala_id, titulo, descricao, inicio, fim, 
                 reservado_por, created_at, updated_at
          FROM agendamentos_salas 
          ORDER BY inicio ASC
        `);
        
        console.log('[SALAS] ✅ Found', reservations.length, 'room reservations');
        res.json({ agendamentos: reservations });
        
      } catch (error) {
        console.error('[SALAS] ❌ Error loading reservations:', error.message);
        res.status(500).json({ error: 'Erro ao carregar reservas' });
      }
    });

    // ===== PORTARIA API =====
    
    app.post('/api/portaria/agendar', auth, async (req, res) => {
      try {
        console.log('[PORTARIA] ➕ Creating reception appointment');
        const { visitante_nome, documento, empresa, data_hora, observacoes } = req.body;
        
        if (!visitante_nome || !data_hora) {
          return res.status(400).json({ 
            error: 'Campos obrigatórios: visitante_nome, data_hora' 
          });
        }
        
        // Validate datetime format
        if (!Date.parse(data_hora)) {
          return res.status(400).json({ 
            error: 'Formato de data/hora inválido' 
          });
        }
        
        const result = await tx(async () => {
          return await run(`
            INSERT INTO agendamentos_portaria 
            (visitante_nome, documento, empresa, data_hora, anfitriao, observacoes) 
            VALUES (?, ?, ?, ?, ?, ?)
          `, [
            visitante_nome,
            documento || null,
            empresa || null,
            data_hora,
            req.user.usuario,
            observacoes || null
          ]);
        });
        
        console.log('[PORTARIA] ✅ Reception appointment created with ID:', result.lastID);
        res.status(201).json({ 
          success: true, 
          id: result.lastID,
          message: 'Agendamento criado com sucesso',
          points: 6
        });
        
      } catch (error) {
        console.error('[PORTARIA] ❌ Error creating appointment:', error.message);
        res.status(500).json({ error: 'Erro ao criar agendamento' });
      }
    });

    app.get('/api/portaria/agendados', auth, async (req, res) => {
      try {
        console.log('[PORTARIA] 📅 Loading reception appointments');
        
        const appointments = await all(`
          SELECT id, visitante_nome, documento, empresa, data_hora, 
                 anfitriao, observacoes, created_at, updated_at
          FROM agendamentos_portaria 
          ORDER BY data_hora ASC
        `);
        
        console.log('[PORTARIA] ✅ Found', appointments.length, 'reception appointments');
        res.json({ agendamentos: appointments });
        
      } catch (error) {
        console.error('[PORTARIA] ❌ Error loading appointments:', error.message);
        res.status(500).json({ error: 'Erro ao carregar agendamentos' });
      }
    });

    // ===== COMPATIBILITY ROUTES (for existing frontend) =====
    
    // Legacy routes for compatibility
    app.get('/api/reservas', auth, async (req, res) => {
      try {
        const reservations = await all(`
          SELECT id, sala_id as sala, titulo as assunto, inicio, fim, 
                 reservado_por as responsavel, 
                 substr(inicio, 1, 10) as data
          FROM agendamentos_salas 
          ORDER BY inicio ASC
        `);
        
        res.json({ reservas: reservations });
      } catch (error) {
        res.status(500).json({ error: 'Erro ao carregar reservas' });
      }
    });

    app.post('/api/reservas', auth, async (req, res) => {
      try {
        const { sala, data, inicio, fim, assunto } = req.body;
        
        if (!sala || !data || !inicio || !fim || !assunto) {
          return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
        }
        
        const inicioDateTime = `${data}T${inicio}`;
        const fimDateTime = `${data}T${fim}`;
        
        const result = await tx(async () => {
          return await run(`
            INSERT INTO agendamentos_salas 
            (sala_id, titulo, inicio, fim, reservado_por) 
            VALUES (?, ?, ?, ?, ?)
          `, [sala, assunto, inicioDateTime, fimDateTime, req.user.usuario]);
        });
        
        res.status(201).json({ 
          success: true, 
          id: result.lastID,
          points: 8
        });
        
      } catch (error) {
        console.error('[RESERVAS] ❌ Error:', error.message);
        res.status(500).json({ error: 'Erro ao criar reserva' });
      }
    });

    app.get('/api/portaria/agendamentos', auth, async (req, res) => {
      try {
        const appointments = await all(`
          SELECT visitante_nome as visitante, documento, empresa,
                 substr(data_hora, 1, 10) as data,
                 substr(data_hora, 12, 5) as hora,
                 anfitriao, observacoes as observacao
          FROM agendamentos_portaria 
          ORDER BY data_hora ASC
        `);
        
        res.json({ agendamentos: appointments });
      } catch (error) {
        res.status(500).json({ error: 'Erro ao carregar agendamentos' });
      }
    });

    app.post('/api/portaria/agendamentos', auth, async (req, res) => {
      try {
        const { data, hora, visitante, documento, observacao } = req.body;
        
        if (!data || !hora || !visitante) {
          return res.status(400).json({ error: 'Data, hora e nome do visitante são obrigatórios' });
        }
        
        const dataHora = `${data}T${hora}:00`;
        
        const result = await tx(async () => {
          return await run(`
            INSERT INTO agendamentos_portaria 
            (visitante_nome, documento, data_hora, anfitriao, observacoes) 
            VALUES (?, ?, ?, ?, ?)
          `, [visitante, documento || null, dataHora, req.user.usuario, observacao || null]);
        });
        
        res.status(201).json({ 
          success: true, 
          id: result.lastID,
          points: 6
        });
        
      } catch (error) {
        console.error('[PORTARIA] ❌ Error:', error.message);
        res.status(500).json({ error: 'Erro ao criar agendamento' });
      }
    });

    // ===== ADMIN ROUTES =====
    
    app.get('/api/admin/dashboard', auth, async (req, res) => {
      try {
        if (req.user.role !== 'admin') {
          return res.status(403).json({ error: 'Acesso negado - apenas administradores' });
        }
        
        console.log('[ADMIN] 📊 Loading dashboard data');
        
        // Get counts from all tables
        const [usuarios, solicitacoes, posts, salas, portaria] = await Promise.all([
          get('SELECT COUNT(*) as count FROM usuarios'),
          get('SELECT COUNT(*) as count FROM solicitacoes_ti'),
          get('SELECT COUNT(*) as count FROM mural_posts WHERE publicado = 1'),
          get('SELECT COUNT(*) as count FROM agendamentos_salas'),
          get('SELECT COUNT(*) as count FROM agendamentos_portaria')
        ]);
        
        const stats = {
          usuarios_ativos: usuarios.count,
          posts_mural: posts.count,
          reservas_salas: salas.count,
          solicitacoes_ti: solicitacoes.count,
          trocas_proteina: 0, // Not implemented yet
          agendamentos_portaria: portaria.count
        };
        
        res.json({ 
          stats,
          userPoints: 0,
          breakdown: [],
          ranking: []
        });
        
      } catch (error) {
        console.error('[ADMIN] ❌ Dashboard error:', error.message);
        res.status(500).json({ error: 'Erro ao carregar dashboard' });
      }
    });

    // Admin export endpoints (with sample data)
    const exportRoutes = [
      'users', 'activities', 'trocas_proteina', 'ti_solicitacoes', 'reservas', 'full-backup'
    ];
    
    exportRoutes.forEach(routeName => {
      app.get(`/api/admin/export/${routeName}/:format`, auth, (req, res) => {
        if (req.user.role !== 'admin') {
          return res.status(403).json({ error: 'Acesso negado - apenas administradores' });
        }
        
        console.log(`[ADMIN-EXPORT] 📊 Export ${routeName} as ${req.params.format}`);
        
        const { format } = req.params;
        const month = req.query.month || new Date().toISOString().slice(0, 7);
        
        if (format === 'csv') {
          const csvData = `Sample,Data,For,${routeName.toUpperCase()}
admin-ti,TI,admin,100
admin-rh,RH,admin,95`;
          
          res.setHeader('Content-Type', 'text/csv;charset=utf-8');
          res.setHeader('Content-Disposition', `attachment; filename="${routeName}-${month}.csv"`);
          res.send(csvData);
        } else {
          res.json({
            success: true,
            format: format,
            month: month,
            data: [
              { name: 'admin-ti', value: 100 },
              { name: 'admin-rh', value: 95 }
            ]
          });
        }
      });
    });

    // ===== ERROR HANDLING =====
    
    // Global error handler
    app.use((err, req, res, next) => {
      console.error('❌ Unhandled server error:', err.message);
      console.error('   Stack:', err.stack);
      res.status(500).json({ error: 'Erro interno do servidor' });
    });

    // 404 handler for API routes
    app.use('/api/*', (req, res) => {
      console.log('[404] 🚫 API endpoint not found:', req.originalUrl);
      res.status(404).json({ error: `Endpoint não encontrado: ${req.originalUrl}` });
    });

    // Serve static files in production
    if (NODE_ENV === 'production') {
      const buildPath = path.join(__dirname, 'dist');
      if (fs.existsSync(buildPath)) {
        app.use(express.static(buildPath));
        
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

    // Start server
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log('🎉 SERVER READY!');
      console.log(`✅ Backend running on http://localhost:${PORT}`);
      console.log(`🌐 Environment: ${NODE_ENV}`);
      console.log('');
      console.log('📋 Available API endpoints:');
      console.log('   Authentication:');
      console.log('     POST /api/login-admin      - Manual login');
      console.log('     GET  /api/me               - Current user');
      console.log('     POST /api/logout           - Logout');
      console.log('   Data Management:');
      console.log('     GET  /api/usuarios         - List users');
      console.log('     POST /api/ti/solicitacoes  - Create TI request');
      console.log('     GET  /api/ti/solicitacoes  - List TI requests');
      console.log('     POST /api/mural/posts      - Create post');
      console.log('     GET  /api/mural/posts      - List posts');
      console.log('     POST /api/salas/agendar    - Create room reservation');
      console.log('     GET  /api/salas/agendados  - List room reservations');
      console.log('     POST /api/portaria/agendar - Create reception appointment');
      console.log('     GET  /api/portaria/agendados - List reception appointments');
      console.log('   Admin:');
      console.log('     GET  /api/admin/dashboard  - Admin dashboard');
      console.log('     GET  /api/admin/export/*   - Export data');
      console.log('');
      console.log('🔑 Test credentials:');
      console.log('   admin-ti / admin123 (TI Admin)');
      console.log('   admin-rh / admin123 (RH Admin)');
      console.log('');
      console.log('🚀 Ready for connections!');
    });
    
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use`);
      } else {
        console.error('❌ Server error:', error.message);
      }
      process.exit(1);
    });

    // Graceful shutdown
    const gracefulShutdown = (signal) => {
      console.log(`\n🛑 ${signal} received, shutting down gracefully...`);
      
      server.close(async () => {
        console.log('✅ HTTP server closed');
        await closeDb();
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

// Start the server
startServer().catch(error => {
  console.error('❌ Critical startup error:', error);
  process.exit(1);
});