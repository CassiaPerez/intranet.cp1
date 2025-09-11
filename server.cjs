const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Import database module
const { run, get, all, initializeDatabase, closeDb } = require('./db.cjs');

const app = express();
const PORT = process.env.PORT || 3006;
const JWT_SECRET = process.env.JWT_SECRET || 'cropfield-secret-key-2025';
const NODE_ENV = process.env.NODE_ENV || 'development';

console.log('🚀 Starting Intranet Cropfield Backend...');
console.log('📊 Environment:', NODE_ENV);
console.log('🔌 Port:', PORT);

/**
 * Initialize and start the server
 */
async function startServer() {
  try {
    console.log('='.repeat(50));
    console.log('🔄 INITIALIZING DATABASE...');
    console.log('='.repeat(50));
    
    // Initialize database first - this is critical
    await initializeDatabase();
    
    console.log('='.repeat(50));
    console.log('🔄 SETTING UP EXPRESS SERVER...');
    console.log('='.repeat(50));

    // Setup middleware
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

    // Request logging
    app.use((req, res, next) => {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] ${req.method} ${req.url}`);
      if (req.body && Object.keys(req.body).length > 0) {
        console.log(`[${timestamp}] Body:`, JSON.stringify(req.body).substring(0, 200));
      }
      next();
    });

    // Authentication middleware
    const auth = async (req, res, next) => {
      try {
        let token = req.cookies?.token;
        
        if (!token && req.headers.authorization) {
          token = req.headers.authorization.replace('Bearer ', '');
        }
         
        if (!token) {
          console.log('[AUTH] ❌ No token provided for:', req.url);
          return res.status(401).json({ error: 'Token de acesso requerido' });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Get fresh user data from database
        const userData = await get(`
          SELECT id, usuario, setor, role, nome, email 
          FROM usuarios 
          WHERE id = ? AND ativo = 1
        `, [decoded.id]);
        
        if (!userData) {
          console.log('[AUTH] ❌ User not found or inactive:', decoded.id);
          return res.status(401).json({ error: 'Usuário não encontrado ou inativo' });
        }
        
        req.user = userData;
        console.log('[AUTH] ✅ Authenticated user:', userData.usuario);
        next();
      } catch (error) {
        console.log('[AUTH] ❌ Token verification failed:', error.message);
        return res.status(401).json({ error: 'Token inválido' });
      }
    };

    // ===== AUTHENTICATION ROUTES =====
    
    // Health check
    app.get('/api/health', async (req, res) => {
      try {
        // Test database connection
        const dbTest = await get('SELECT COUNT(*) as count FROM usuarios');
        
        res.json({ 
          ok: true, 
          status: 'healthy', 
          timestamp: new Date().toISOString(),
          database: 'connected',
          users: dbTest.count,
          environment: NODE_ENV
        });
      } catch (error) {
        res.status(500).json({
          ok: false,
          status: 'unhealthy',
          error: error.message
        });
      }
    });

    // Manual admin login
    app.post('/api/login-admin', async (req, res) => {
      try {
        console.log('[LOGIN] 🔐 Login attempt started');
        const { usuario, senha } = req.body;
        
        console.log('[LOGIN] Request body keys:', Object.keys(req.body));
        console.log('[LOGIN] Usuario field:', !!usuario);
        console.log('[LOGIN] Senha field:', !!senha);
        
        if (!usuario || !senha) {
          console.log('[LOGIN] ❌ Missing credentials');
          return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
        }

        const usuarioClean = String(usuario).trim();
        const senhaClean = String(senha).trim();
        
        console.log('[LOGIN] Searching for user:', usuarioClean);

        // Search user in database
        const userRow = await get(`
          SELECT id, usuario, senha_hash, setor, role, nome, email, ativo
          FROM usuarios 
          WHERE usuario = ? AND ativo = 1
        `, [usuarioClean]);

        if (!userRow) {
          console.log('[LOGIN] ❌ User not found:', usuarioClean);
          return res.status(401).json({ error: 'Usuário ou senha inválidos' });
        }
        
        console.log('[LOGIN] ✅ User found:', userRow.usuario, 'role:', userRow.role);
        
        // Verify password with bcrypt
        const isValidPassword = await bcrypt.compare(senhaClean, userRow.senha_hash);
        
        if (!isValidPassword) {
          console.log('[LOGIN] ❌ Invalid password for user:', usuarioClean);
          return res.status(401).json({ error: 'Usuário ou senha inválidos' });
        }
        
        console.log('[LOGIN] ✅ Password verified successfully');
        
        // Generate JWT token
        const tokenPayload = { 
          id: userRow.id,
          usuario: userRow.usuario, 
          setor: userRow.setor,
          role: userRow.role
        };
        
        const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '7d' });
        console.log('[LOGIN] ✅ JWT token generated');
        
        // Set secure cookie
        const cookieOptions = {
          httpOnly: true,
          secure: false, // Set to false for development
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
          sameSite: 'lax',
          path: '/'
        };
        
        res.cookie('token', token, cookieOptions);
        console.log('[LOGIN] 🍪 Cookie set with options:', cookieOptions);
        
        // Return complete user data
        const userData = {
          id: userRow.id.toString(),
          usuario: userRow.usuario,
          nome: userRow.nome || userRow.usuario,
          name: userRow.nome || userRow.usuario,
          email: userRow.email || `${userRow.usuario}@grupocropfield.com.br`,
          setor: userRow.setor,
          sector: userRow.setor,
          role: userRow.role,
          token: token
        };
        
        console.log('[LOGIN] ✅ Login successful, returning user data');
        res.status(200).json(userData);
        
      } catch (error) {
        console.error('[LOGIN] ❌ Login error:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
      }
    });

    // Get current user
    app.get('/api/me', auth, (req, res) => {
      console.log('[ME] ✅ Current user request for:', req.user.usuario);
      
      const userData = {
        id: req.user.id.toString(),
        usuario: req.user.usuario,
        nome: req.user.nome || req.user.usuario,
        name: req.user.nome || req.user.usuario,
        email: req.user.email || `${req.user.usuario}@grupocropfield.com.br`,
        setor: req.user.setor,
        sector: req.user.setor,
        role: req.user.role
      };
      
      res.json(userData);
    });

    // Logout endpoint
    app.post('/api/logout', (req, res) => {
      console.log('[LOGOUT] 🚪 Logout request');
      res.clearCookie('token');
      res.json({ success: true, message: 'Logout realizado com sucesso' });
    });

    // ===== USERS API =====
    
    app.get('/api/usuarios', auth, async (req, res) => {
      try {
        console.log('[USUARIOS] 📋 Loading all users');
        
        const users = await all(`
          SELECT id, usuario, setor, role, nome, email, ativo, created_at, updated_at
          FROM usuarios 
          ORDER BY created_at DESC
        `);
        
        console.log('[USUARIOS] ✅ Found', users.length, 'users');
        res.json({ users });
        
      } catch (error) {
        console.error('[USUARIOS] ❌ Error:', error);
        res.status(500).json({ error: 'Erro ao carregar usuários' });
      }
    });

    app.post('/api/usuarios', auth, async (req, res) => {
      try {
        console.log('[USUARIOS] ➕ Creating new user');
        const { nome, email, senha, setor, role } = req.body;
        
        if (!nome || !email || !senha) {
          return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
        }
        
        if (senha.length < 6) {
          return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' });
        }
        
        // Check if user already exists
        const existing = await get('SELECT id FROM usuarios WHERE email = ?', [email]);
        if (existing) {
          return res.status(400).json({ error: 'Email já está em uso' });
        }
        
        // Hash password
        const senhaHash = bcrypt.hashSync(senha, 12);
        
        // Create user
        const result = await run(`
          INSERT INTO usuarios (usuario, senha_hash, setor, role, nome, email, ativo) 
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [email.split('@')[0], senhaHash, setor, role, nome, email, 1]);
        
        console.log('[USUARIOS] ✅ User created with ID:', result.lastID);
        res.status(201).json({ 
          success: true, 
          id: result.lastID,
          message: 'Usuário criado com sucesso' 
        });
        
      } catch (error) {
        console.error('[USUARIOS] ❌ Error creating user:', error);
        res.status(500).json({ error: 'Erro ao criar usuário' });
      }
    });

    // ===== TI/EQUIPAMENTOS API =====
    
    app.post('/api/ti/solicitacoes', auth, async (req, res) => {
      try {
        console.log('[TI] ➕ Creating TI request');
        console.log('[TI] Request body:', JSON.stringify(req.body));
        console.log('[TI] User:', req.user.usuario);
        
        const { titulo, descricao, prioridade, email, nome } = req.body;
        
        if (!titulo || !descricao || !prioridade) {
          console.log('[TI] ❌ Missing required fields');
          return res.status(400).json({ 
            error: 'Campos obrigatórios: titulo, descricao, prioridade' 
          });
        }
        
        const validPriorities = ['baixa', 'media', 'alta'];
        if (!validPriorities.includes(prioridade)) {
          console.log('[TI] ❌ Invalid priority:', prioridade);
          return res.status(400).json({ 
            error: 'Prioridade deve ser: baixa, media ou alta' 
          });
        }
        
        console.log('[TI] Inserting into database...');
        const result = await run(`
          INSERT INTO ti_solicitacoes 
          (usuario_id, solicitante_nome, solicitante_email, equipamento, descricao, prioridade, status) 
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          req.user.id,
          nome || req.user.nome || req.user.usuario,
          email || req.user.email,
          titulo,
          descricao,
          prioridade,
          'pendente'
        ]);
        
        console.log('[TI] ✅ TI request created with ID:', result.lastID);
        
        // Verify it was saved
        const saved = await get('SELECT * FROM ti_solicitacoes WHERE id = ?', [result.lastID]);
        console.log('[TI] ✅ Verification - saved record:', !!saved);
        
        res.status(201).json({ 
          success: true, 
          id: result.lastID,
          message: 'Solicitação criada com sucesso',
          points: 4
        });
        
      } catch (error) {
        console.error('[TI] ❌ Error creating request:', error);
        res.status(500).json({ error: 'Erro ao criar solicitação: ' + error.message });
      }
    });

    app.get('/api/ti/solicitacoes', auth, async (req, res) => {
      try {
        console.log('[TI] 📋 Loading TI requests');
        
        const requests = await all(`
          SELECT t.id, t.solicitante_nome, t.solicitante_email, t.equipamento, 
                 t.descricao, t.prioridade, t.status, t.created_at, t.updated_at,
                 u.usuario, u.setor
          FROM ti_solicitacoes t
          LEFT JOIN usuarios u ON t.usuario_id = u.id
          ORDER BY t.created_at DESC
        `);
        
        console.log('[TI] ✅ Found', requests.length, 'TI requests');
        res.json({ solicitacoes: requests });
        
      } catch (error) {
        console.error('[TI] ❌ Error loading requests:', error);
        res.status(500).json({ error: 'Erro ao carregar solicitações' });
      }
    });

    app.get('/api/ti/minhas', auth, async (req, res) => {
      try {
        console.log('[TI] 📋 Loading user TI requests for:', req.user.usuario);
        
        const requests = await all(`
          SELECT id, solicitante_nome as nome, solicitante_email as email, equipamento, 
                 descricao, prioridade, status, created_at, updated_at
          FROM ti_solicitacoes 
          WHERE usuario_id = ?
          ORDER BY created_at DESC
        `, [req.user.id]);
        
        console.log('[TI] ✅ Found', requests.length, 'requests for user');
        res.json({ solicitacoes: requests });
        
      } catch (error) {
        console.error('[TI] ❌ Error loading user requests:', error);
        res.status(500).json({ error: 'Erro ao carregar suas solicitações' });
      }
    });

    // ===== MURAL API =====
    
    app.post('/api/mural/posts', auth, async (req, res) => {
      try {
        console.log('[MURAL] ➕ Creating post');
        console.log('[MURAL] Request body:', JSON.stringify(req.body));
        console.log('[MURAL] User:', req.user.usuario);
        
        const { titulo, conteudo, pinned } = req.body;
        
        if (!titulo || !conteudo) {
          console.log('[MURAL] ❌ Missing required fields');
          return res.status(400).json({ 
            error: 'Título e conteúdo são obrigatórios' 
          });
        }
        
        console.log('[MURAL] Inserting into database...');
        const result = await run(`
          INSERT INTO mural_posts 
          (usuario_id, autor_usuario, autor_setor, titulo, conteudo, publicado, pinned) 
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          req.user.id,
          req.user.usuario,
          req.user.setor,
          titulo,
          conteudo,
          1,
          pinned ? 1 : 0
        ]);
        
        console.log('[MURAL] ✅ Post created with ID:', result.lastID);
        
        // Verify it was saved
        const saved = await get('SELECT * FROM mural_posts WHERE id = ?', [result.lastID]);
        console.log('[MURAL] ✅ Verification - saved record:', !!saved);
        
        res.status(201).json({ 
          success: true, 
          id: result.lastID,
          message: 'Post criado com sucesso',
          points: 15
        });
        
      } catch (error) {
        console.error('[MURAL] ❌ Error creating post:', error);
        res.status(500).json({ error: 'Erro ao criar post: ' + error.message });
      }
    });

    app.get('/api/mural/posts', auth, async (req, res) => {
      try {
        console.log('[MURAL] 📄 Loading posts');
        
        const posts = await all(`
          SELECT p.id, p.autor_usuario as author, p.titulo, p.conteudo, 
                 p.publicado, p.pinned, p.likes_count, p.comments_count,
                 p.created_at, p.updated_at
          FROM mural_posts p
          WHERE p.publicado = 1
          ORDER BY p.pinned DESC, p.created_at DESC
        `);
        
        console.log('[MURAL] ✅ Found', posts.length, 'posts');
        res.json({ posts });
        
      } catch (error) {
        console.error('[MURAL] ❌ Error loading posts:', error);
        res.status(500).json({ error: 'Erro ao carregar posts' });
      }
    });

    // Mural interactions
    app.post('/api/mural/:postId/like', auth, async (req, res) => {
      try {
        const postId = parseInt(req.params.postId);
        console.log('[MURAL] ❤️ Like/unlike post:', postId, 'by:', req.user.usuario);
        
        // Check if already liked
        const existing = await get(`
          SELECT id FROM mural_likes 
          WHERE post_id = ? AND usuario_id = ?
        `, [postId, req.user.id]);
        
        if (existing) {
          // Unlike
          await run('DELETE FROM mural_likes WHERE id = ?', [existing.id]);
          await run('UPDATE mural_posts SET likes_count = likes_count - 1 WHERE id = ?', [postId]);
          res.json({ success: true, action: 'unliked' });
        } else {
          // Like
          await run(`
            INSERT INTO mural_likes (post_id, usuario_id, usuario) 
            VALUES (?, ?, ?)
          `, [postId, req.user.id, req.user.usuario]);
          await run('UPDATE mural_posts SET likes_count = likes_count + 1 WHERE id = ?', [postId]);
          res.json({ success: true, action: 'liked' });
        }
        
      } catch (error) {
        console.error('[MURAL] ❌ Error processing like:', error);
        res.status(500).json({ error: 'Erro ao processar curtida' });
      }
    });

    app.get('/api/mural/:postId/comments', auth, async (req, res) => {
      try {
        const postId = parseInt(req.params.postId);
        console.log('[MURAL] 💬 Loading comments for post:', postId);
        
        const comments = await all(`
          SELECT id, autor_usuario as author, texto, created_at
          FROM mural_comments 
          WHERE post_id = ?
          ORDER BY created_at ASC
        `, [postId]);
        
        console.log('[MURAL] ✅ Found', comments.length, 'comments');
        res.json({ comments });
        
      } catch (error) {
        console.error('[MURAL] ❌ Error loading comments:', error);
        res.status(500).json({ error: 'Erro ao carregar comentários' });
      }
    });

    app.post('/api/mural/:postId/comments', auth, async (req, res) => {
      try {
        const postId = parseInt(req.params.postId);
        const { texto } = req.body;
        
        console.log('[MURAL] ➕ Adding comment to post:', postId);
        
        if (!texto || !texto.trim()) {
          return res.status(400).json({ error: 'Texto do comentário é obrigatório' });
        }
        
        const result = await run(`
          INSERT INTO mural_comments (post_id, usuario_id, autor_usuario, texto) 
          VALUES (?, ?, ?, ?)
        `, [postId, req.user.id, req.user.usuario, texto.trim()]);
        
        // Update comment count
        await run('UPDATE mural_posts SET comments_count = comments_count + 1 WHERE id = ?', [postId]);
        
        console.log('[MURAL] ✅ Comment added with ID:', result.lastID);
        res.status(201).json({ 
          success: true, 
          id: result.lastID,
          message: 'Comentário adicionado com sucesso' 
        });
        
      } catch (error) {
        console.error('[MURAL] ❌ Error adding comment:', error);
        res.status(500).json({ error: 'Erro ao adicionar comentário' });
      }
    });

    app.delete('/api/mural/comments/:commentId', auth, async (req, res) => {
      try {
        const commentId = parseInt(req.params.commentId);
        console.log('[MURAL] 🗑️ Deleting comment:', commentId);
        
        // Get post_id before deleting
        const comment = await get('SELECT post_id FROM mural_comments WHERE id = ?', [commentId]);
        
        if (!comment) {
          return res.status(404).json({ error: 'Comentário não encontrado' });
        }
        
        // Delete comment
        await run('DELETE FROM mural_comments WHERE id = ?', [commentId]);
        
        // Update comment count
        await run('UPDATE mural_posts SET comments_count = comments_count - 1 WHERE id = ?', [comment.post_id]);
        
        console.log('[MURAL] ✅ Comment deleted');
        res.json({ success: true, message: 'Comentário removido com sucesso' });
        
      } catch (error) {
        console.error('[MURAL] ❌ Error deleting comment:', error);
        res.status(500).json({ error: 'Erro ao remover comentário' });
      }
    });

    // ===== RESERVAS API =====
    
    app.post('/api/reservas', auth, async (req, res) => {
      try {
        console.log('[RESERVAS] ➕ Creating room reservation');
        console.log('[RESERVAS] Request body:', JSON.stringify(req.body));
        
        const { sala, data, inicio, fim, assunto } = req.body;
        
        if (!sala || !data || !inicio || !fim || !assunto) {
          console.log('[RESERVAS] ❌ Missing required fields');
          return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
        }
        
        console.log('[RESERVAS] Inserting into database...');
        const result = await run(`
          INSERT INTO reservas 
          (usuario_id, sala, data_reserva, hora_inicio, hora_fim, motivo, status) 
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          req.user.id,
          sala,
          data,
          inicio,
          fim,
          assunto,
          'confirmada'
        ]);
        
        console.log('[RESERVAS] ✅ Reservation created with ID:', result.lastID);
        
        // Verify it was saved
        const saved = await get('SELECT * FROM reservas WHERE id = ?', [result.lastID]);
        console.log('[RESERVAS] ✅ Verification - saved record:', !!saved);
        
        res.status(201).json({ 
          success: true, 
          id: result.lastID,
          message: 'Reserva criada com sucesso',
          points: 8
        });
        
      } catch (error) {
        console.error('[RESERVAS] ❌ Error creating reservation:', error);
        res.status(500).json({ error: 'Erro ao criar reserva: ' + error.message });
      }
    });

    app.get('/api/reservas', auth, async (req, res) => {
      try {
        console.log('[RESERVAS] 📅 Loading reservations');
        
        const reservations = await all(`
          SELECT r.id, r.sala, r.data_reserva as data, r.hora_inicio as inicio, 
                 r.hora_fim as fim, r.motivo as assunto, r.status,
                 u.nome as responsavel, r.created_at, r.updated_at
          FROM reservas r
          LEFT JOIN usuarios u ON r.usuario_id = u.id
          ORDER BY r.data_reserva ASC, r.hora_inicio ASC
        `);
        
        console.log('[RESERVAS] ✅ Found', reservations.length, 'reservations');
        res.json({ reservas: reservations });
        
      } catch (error) {
        console.error('[RESERVAS] ❌ Error loading reservations:', error);
        res.status(500).json({ error: 'Erro ao carregar reservas' });
      }
    });

    // ===== PORTARIA API =====
    
    app.post('/api/portaria/agendamentos', auth, async (req, res) => {
      try {
        console.log('[PORTARIA] ➕ Creating appointment');
        console.log('[PORTARIA] Request body:', JSON.stringify(req.body));
        
        const { data, hora, visitante, documento, observacao } = req.body;
        
        if (!data || !hora || !visitante) {
          console.log('[PORTARIA] ❌ Missing required fields');
          return res.status(400).json({ error: 'Data, hora e nome do visitante são obrigatórios' });
        }
        
        console.log('[PORTARIA] Inserting into database...');
        const result = await run(`
          INSERT INTO portaria_agendamentos 
          (nome_visitante, documento, data_visita, hora_entrada, responsavel_id, motivo, observacoes, status) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          visitante,
          documento || null,
          data,
          hora,
          req.user.id,
          'Visita',
          observacao || null,
          'agendado'
        ]);
        
        console.log('[PORTARIA] ✅ Appointment created with ID:', result.lastID);
        
        // Verify it was saved
        const saved = await get('SELECT * FROM portaria_agendamentos WHERE id = ?', [result.lastID]);
        console.log('[PORTARIA] ✅ Verification - saved record:', !!saved);
        
        res.status(201).json({ 
          success: true, 
          id: result.lastID,
          message: 'Agendamento criado com sucesso',
          points: 6
        });
        
      } catch (error) {
        console.error('[PORTARIA] ❌ Error creating appointment:', error);
        res.status(500).json({ error: 'Erro ao criar agendamento: ' + error.message });
      }
    });

    app.get('/api/portaria/agendamentos', auth, async (req, res) => {
      try {
        console.log('[PORTARIA] 📅 Loading appointments');
        
        const appointments = await all(`
          SELECT p.id, p.nome_visitante as visitante, p.documento, p.empresa,
                 p.data_visita as data, p.hora_entrada as hora, p.motivo,
                 p.observacoes as observacao, p.status,
                 u.nome as anfitriao, p.created_at, p.updated_at
          FROM portaria_agendamentos p
          LEFT JOIN usuarios u ON p.responsavel_id = u.id
          ORDER BY p.data_visita ASC, p.hora_entrada ASC
        `);
        
        console.log('[PORTARIA] ✅ Found', appointments.length, 'appointments');
        res.json({ agendamentos: appointments });
        
      } catch (error) {
        console.error('[PORTARIA] ❌ Error loading appointments:', error);
        res.status(500).json({ error: 'Erro ao carregar agendamentos' });
      }
    });

    // ===== ADMIN ROUTES =====
    
    app.get('/api/admin/dashboard', auth, async (req, res) => {
      try {
        console.log('[ADMIN] 📊 Loading dashboard data');
        
        // Get counts from all tables
        const [usuarios, solicitacoes, posts, reservas, portaria, pontos] = await Promise.all([
          get('SELECT COUNT(*) as count FROM usuarios WHERE ativo = 1'),
          get('SELECT COUNT(*) as count FROM ti_solicitacoes'),
          get('SELECT COUNT(*) as count FROM mural_posts WHERE publicado = 1'),
          get('SELECT COUNT(*) as count FROM reservas'),
          get('SELECT COUNT(*) as count FROM portaria_agendamentos'),
          get('SELECT COUNT(*) as count FROM pontos')
        ]);
        
        const stats = {
          usuarios_ativos: usuarios.count,
          posts_mural: posts.count,
          reservas_salas: reservas.count,
          solicitacoes_ti: solicitacoes.count,
          trocas_proteina: 0,
          agendamentos_portaria: portaria.count
        };
        
        console.log('[ADMIN] ✅ Dashboard stats:', stats);
        
        res.json({ 
          stats,
          userPoints: 0,
          breakdown: [],
          ranking: []
        });
        
      } catch (error) {
        console.error('[ADMIN] ❌ Dashboard error:', error);
        res.status(500).json({ error: 'Erro ao carregar dashboard' });
      }
    });

    app.get('/api/admin/users', auth, async (req, res) => {
      try {
        if (req.user.role !== 'admin') {
          return res.status(403).json({ error: 'Acesso negado - apenas administradores' });
        }
        
        console.log('[ADMIN] 👥 Loading users');
        
        const users = await all(`
          SELECT id, usuario, nome, email, setor, role, ativo, created_at, updated_at
          FROM usuarios 
          ORDER BY created_at DESC
        `);
        
        console.log('[ADMIN] ✅ Found', users.length, 'users');
        res.json({ users });
        
      } catch (error) {
        console.error('[ADMIN] ❌ Error loading users:', error);
        res.status(500).json({ error: 'Erro ao carregar usuários' });
      }
    });

    app.post('/api/admin/users', auth, async (req, res) => {
      try {
        if (req.user.role !== 'admin') {
          return res.status(403).json({ error: 'Acesso negado - apenas administradores' });
        }
        
        console.log('[ADMIN] ➕ Creating user');
        const { nome, email, senha, setor, role } = req.body;
        
        if (!nome || !email || !senha) {
          return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
        }
        
        // Check if user already exists
        const existing = await get('SELECT id FROM usuarios WHERE email = ? OR usuario = ?', [email, email.split('@')[0]]);
        if (existing) {
          return res.status(400).json({ error: 'Email já está em uso' });
        }
        
        // Hash password
        const senhaHash = bcrypt.hashSync(senha, 12);
        
        // Create user
        const result = await run(`
          INSERT INTO usuarios (usuario, senha_hash, setor, role, nome, email, ativo) 
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [email.split('@')[0], senhaHash, setor, role, nome, email, 1]);
        
        console.log('[ADMIN] ✅ User created with ID:', result.lastID);
        res.status(201).json({ 
          success: true, 
          id: result.lastID,
          message: 'Usuário criado com sucesso' 
        });
        
      } catch (error) {
        console.error('[ADMIN] ❌ Error creating user:', error);
        res.status(500).json({ error: 'Erro ao criar usuário: ' + error.message });
      }
    });

    // Admin export endpoints
    const exportRoutes = [
      'users', 'activities', 'trocas_proteina', 'ti_solicitacoes', 'reservas', 'full-backup'
    ];
    
    exportRoutes.forEach(routeName => {
      app.get(`/api/admin/export/${routeName}/:format`, auth, async (req, res) => {
        try {
          if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Acesso negado - apenas administradores' });
          }
          
          console.log(`[ADMIN-EXPORT] 📊 Export ${routeName} as ${req.params.format}`);
          
          const { format } = req.params;
          const month = req.query.month || new Date().toISOString().slice(0, 7);
          
          if (format === 'csv') {
            let csvData = '';
            
            if (routeName === 'users') {
              const users = await all('SELECT usuario, nome, setor, role, created_at FROM usuarios');
              csvData = 'Usuario,Nome,Setor,Role,Criado\n';
              csvData += users.map(u => `${u.usuario},${u.nome},${u.setor},${u.role},${u.created_at}`).join('\n');
            } else if (routeName === 'ti_solicitacoes') {
              const requests = await all('SELECT equipamento, prioridade, status, created_at FROM ti_solicitacoes');
              csvData = 'Equipamento,Prioridade,Status,Criado\n';
              csvData += requests.map(r => `${r.equipamento},${r.prioridade},${r.status},${r.created_at}`).join('\n');
            } else {
              csvData = `Sample,Data,For,${routeName.toUpperCase()}\nadmin-ti,TI,admin,100\nadmin-rh,RH,admin,95`;
            }
            
            res.setHeader('Content-Type', 'text/csv;charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${routeName}-${month}.csv"`);
            res.send(csvData);
          } else {
            res.json({
              success: true,
              format: format,
              month: month,
              data: []
            });
          }
          
        } catch (error) {
          console.error(`[ADMIN-EXPORT] ❌ Error exporting ${routeName}:`, error);
          res.status(500).json({ error: 'Erro ao exportar dados' });
        }
      });
    });

    // ===== DEBUGGING ROUTES =====
    
    app.get('/api/debug/database', auth, async (req, res) => {
      try {
        if (req.user.role !== 'admin') {
          return res.status(403).json({ error: 'Acesso negado' });
        }
        
        const tables = await all(`
          SELECT name FROM sqlite_master 
          WHERE type='table' AND name NOT LIKE 'sqlite_%'
          ORDER BY name
        `);
        
        const counts = {};
        for (const table of tables) {
          const count = await get(`SELECT COUNT(*) as count FROM ${table.name}`);
          counts[table.name] = count.count;
        }
        
        res.json({
          tables: tables.map(t => t.name),
          counts,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error('[DEBUG] ❌ Error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // ===== ERROR HANDLING =====
    
    app.use((err, req, res, next) => {
      console.error('❌ Unhandled server error:', err);
      res.status(500).json({ error: 'Erro interno do servidor' });
    });

    app.use('/api/*', (req, res) => {
      console.log('[404] 🚫 API endpoint not found:', req.originalUrl);
      res.status(404).json({ error: `Endpoint não encontrado: ${req.originalUrl}` });
    });

    // Start server
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log('');
      console.log('🎉 ='.repeat(25) + ' SERVER READY! ' + '='.repeat(25));
      console.log(`✅ Backend running on http://localhost:${PORT}`);
      console.log(`🌐 Environment: ${NODE_ENV}`);
      console.log('');
      console.log('🔑 Test credentials:');
      console.log('   👤 admin-ti / admin123 (TI Admin)');
      console.log('   👤 admin-rh / admin123 (RH Admin)');
      console.log('');
      console.log('📊 Test with: GET /api/health');
      console.log('🐛 Debug with: GET /api/debug/database (admin only)');
      console.log('');
      console.log('🚀 All API endpoints ready for data persistence!');
      console.log('='.repeat(70));
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
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Global error handlers
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
  process.exit(1);
});

// Start the server
startServer().catch(error => {
  console.error('❌ Critical startup error:', error);
  process.exit(1);
});