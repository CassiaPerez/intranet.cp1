const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

// Singleton database instance
let dbInstance = null;

/**
 * Get singleton database connection with proper error handling
 */
function getDb() {
  if (!dbInstance) {
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      console.log('📁 Created data directory:', dataDir);
    }

    const dbPath = path.join(dataDir, 'database.sqlite');
    console.log('🗄️  Connecting to database:', dbPath);

    // Use synchronous database connection for reliability
    dbInstance = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('❌ Error opening database:', err.message);
        process.exit(1);
      }
      console.log('✅ Connected to SQLite database');
    });

    // Configure SQLite immediately
    dbInstance.serialize(() => {
      console.log('⚙️  Configuring SQLite settings...');
      dbInstance.run('PRAGMA journal_mode = WAL');
      dbInstance.run('PRAGMA synchronous = NORMAL');
      dbInstance.run('PRAGMA foreign_keys = ON');
      dbInstance.run('PRAGMA busy_timeout = 30000'); // 30 seconds
      dbInstance.run('PRAGMA cache_size = -64000');
      dbInstance.run('PRAGMA temp_store = MEMORY');
      console.log('✅ SQLite configured');
    });
  }
  
  return dbInstance;
}

/**
 * Synchronous database operations for reliability
 */
function dbRunSync(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = getDb();
    console.log('[DB-RUN] SQL:', sql.replace(/\s+/g, ' ').substring(0, 150));
    console.log('[DB-RUN] Params:', JSON.stringify(params));
    
    db.run(sql, params, function(err) {
      if (err) {
        console.error('❌ [DB-RUN] ERROR:', err.message);
        console.error('❌ [DB-RUN] SQL:', sql);
        console.error('❌ [DB-RUN] Params:', JSON.stringify(params));
        reject(err);
      } else {
        console.log('✅ [DB-RUN] SUCCESS - lastID:', this.lastID, 'changes:', this.changes);
        resolve({ lastID: this.lastID, changes: this.changes });
      }
    });
  });
}

function dbGetSync(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = getDb();
    console.log('[DB-GET] SQL:', sql.replace(/\s+/g, ' ').substring(0, 150));
    
    db.get(sql, params, (err, row) => {
      if (err) {
        console.error('❌ [DB-GET] ERROR:', err.message);
        reject(err);
      } else {
        console.log('✅ [DB-GET] SUCCESS - Found:', !!row);
        resolve(row);
      }
    });
  });
}

function dbAllSync(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = getDb();
    console.log('[DB-ALL] SQL:', sql.replace(/\s+/g, ' ').substring(0, 150));
    
    db.all(sql, params, (err, rows) => {
      if (err) {
        console.error('❌ [DB-ALL] ERROR:', err.message);
        reject(err);
      } else {
        console.log('✅ [DB-ALL] SUCCESS - Rows:', rows?.length || 0);
        resolve(rows || []);
      }
    });
  });
}

/**
 * Initialize database with all tables and seed data
 */
async function initializeDatabase() {
  console.log('🗃️  STARTING DATABASE INITIALIZATION...');
  
  try {
    // Test basic connection first
    console.log('🔍 Testing database connection...');
    const testResult = await dbGetSync('SELECT 1 as test');
    if (!testResult || testResult.test !== 1) {
      throw new Error('Database connection test failed');
    }
    console.log('✅ Database connection working');

    // Create all tables
    console.log('📋 Creating database tables...');
    await createAllTables();

    // Seed admin users
    console.log('👤 Seeding admin users...');
    await seedAdminUsers();

    // Verify setup
    console.log('🔍 Verifying database setup...');
    await verifyDatabaseSetup();

    console.log('✅ DATABASE INITIALIZATION COMPLETE');
    
  } catch (error) {
    console.error('❌ DATABASE INITIALIZATION FAILED:', error.message);
    throw error;
  }
}

/**
 * Create all required tables
 */
async function createAllTables() {
  // usuarios table
  await dbRunSync(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario TEXT UNIQUE NOT NULL,
      senha_hash TEXT NOT NULL,
      setor TEXT NOT NULL DEFAULT 'Geral',
      role TEXT NOT NULL DEFAULT 'colaborador',
      nome TEXT NULL,
      email TEXT NULL,
      ativo INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // mural_posts table
  await dbRunSync(`
    CREATE TABLE IF NOT EXISTS mural_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      autor_usuario TEXT NOT NULL,
      autor_setor TEXT NOT NULL,
      titulo TEXT NOT NULL,
      conteudo TEXT NOT NULL,
      publicado INTEGER NOT NULL DEFAULT 1,
      pinned INTEGER NOT NULL DEFAULT 0,
      likes_count INTEGER NOT NULL DEFAULT 0,
      comments_count INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
    )
  `);

  // mural_comments table
  await dbRunSync(`
    CREATE TABLE IF NOT EXISTS mural_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      usuario_id INTEGER NOT NULL,
      autor_usuario TEXT NOT NULL,
      texto TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (post_id) REFERENCES mural_posts (id) ON DELETE CASCADE,
      FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
    )
  `);

  // mural_likes table
  await dbRunSync(`
    CREATE TABLE IF NOT EXISTS mural_likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      usuario_id INTEGER NOT NULL,
      usuario TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(post_id, usuario_id),
      FOREIGN KEY (post_id) REFERENCES mural_posts (id) ON DELETE CASCADE,
      FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
    )
  `);

  // ti_solicitacoes table
  await dbRunSync(`
    CREATE TABLE IF NOT EXISTS ti_solicitacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      solicitante_nome TEXT NOT NULL,
      solicitante_email TEXT NULL,
      equipamento TEXT NOT NULL,
      descricao TEXT NOT NULL,
      prioridade TEXT NOT NULL CHECK (prioridade IN ('baixa', 'media', 'alta')),
      status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovada', 'entregue', 'rejeitada')),
      observacoes_ti TEXT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
    )
  `);

  // reservas table
  await dbRunSync(`
    CREATE TABLE IF NOT EXISTS reservas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      sala TEXT NOT NULL,
      data_reserva DATE NOT NULL,
      hora_inicio TIME NOT NULL,
      hora_fim TIME NOT NULL,
      motivo TEXT NOT NULL,
      observacoes TEXT NULL,
      status TEXT NOT NULL DEFAULT 'confirmada',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
    )
  `);

  // portaria_agendamentos table
  await dbRunSync(`
    CREATE TABLE IF NOT EXISTS portaria_agendamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome_visitante TEXT NOT NULL,
      documento TEXT NULL,
      empresa TEXT NULL,
      data_visita DATE NOT NULL,
      hora_entrada TIME NOT NULL,
      hora_saida TIME NULL,
      responsavel_id INTEGER NOT NULL,
      setor_destino TEXT NOT NULL DEFAULT 'Geral',
      motivo TEXT NOT NULL DEFAULT 'Visita',
      observacoes TEXT NULL,
      status TEXT NOT NULL DEFAULT 'agendado',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (responsavel_id) REFERENCES usuarios (id)
    )
  `);

  // trocas_proteina table
  await dbRunSync(`
    CREATE TABLE IF NOT EXISTS trocas_proteina (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      data_troca DATE NOT NULL,
      proteina_original TEXT NOT NULL,
      proteina_nova TEXT NOT NULL,
      observacoes TEXT NULL,
      status TEXT NOT NULL DEFAULT 'confirmada',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(usuario_id, data_troca),
      FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
    )
  `);

  // pontos table for gamification
  await dbRunSync(`
    CREATE TABLE IF NOT EXISTS pontos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      acao TEXT NOT NULL,
      pontos INTEGER NOT NULL,
      descricao TEXT NULL,
      metadata TEXT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
    )
  `);

  console.log('✅ All tables created successfully');
}

/**
 * Seed admin users if they don't exist
 */
async function seedAdminUsers() {
  try {
    // Check if any admin users exist
    const existingAdmin = await dbGetSync(`
      SELECT COUNT(*) as count 
      FROM usuarios 
      WHERE role = 'admin'
    `);

    if (existingAdmin && existingAdmin.count > 0) {
      console.log('✅ Admin users already exist, skipping seed');
      return;
    }

    console.log('👤 Creating admin users...');
    
    // Create admin users with bcrypt
    const adminTiHash = bcrypt.hashSync('admin123', 12);
    const adminRhHash = bcrypt.hashSync('admin123', 12);

    const tiResult = await dbRunSync(`
      INSERT INTO usuarios 
      (usuario, senha_hash, setor, role, nome, email, ativo) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      'admin-ti', 
      adminTiHash, 
      'TI', 
      'admin', 
      'Administrador TI', 
      'admin.ti@grupocropfield.com.br',
      1
    ]);

    const rhResult = await dbRunSync(`
      INSERT INTO usuarios 
      (usuario, senha_hash, setor, role, nome, email, ativo) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      'admin-rh', 
      adminRhHash, 
      'RH', 
      'admin', 
      'Administrador RH', 
      'admin.rh@grupocropfield.com.br',
      1
    ]);

    console.log('✅ Admin users created successfully:');
    console.log('   👤 admin-ti (ID:', tiResult.lastID, ')');
    console.log('   👤 admin-rh (ID:', rhResult.lastID, ')');

  } catch (error) {
    console.error('❌ Error seeding admin users:', error.message);
    throw error;
  }
}

/**
 * Verify database setup is working
 */
async function verifyDatabaseSetup() {
  try {
    // Check tables exist
    const tables = await dbAllSync(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `);
    
    console.log('📋 Database tables:', tables.map(t => t.name).join(', '));
    
    if (tables.length < 5) {
      throw new Error(`Expected at least 5 tables, found ${tables.length}`);
    }

    // Check admin users exist
    const adminCount = await dbGetSync(`
      SELECT COUNT(*) as count FROM usuarios WHERE role = 'admin'
    `);
    
    console.log('👤 Admin users in database:', adminCount.count);
    
    if (!adminCount || adminCount.count < 1) {
      throw new Error('No admin users found in database');
    }

    // Test write operation
    const testResult = await dbRunSync(`
      INSERT OR REPLACE INTO usuarios 
      (id, usuario, senha_hash, setor, role, nome, email, ativo) 
      VALUES (999, 'test-user', 'test-hash', 'Test', 'colaborador', 'Test User', 'test@test.com', 1)
    `);
    
    if (!testResult || !testResult.lastID) {
      throw new Error('Test write operation failed');
    }
    
    // Clean up test user
    await dbRunSync('DELETE FROM usuarios WHERE id = 999');
    
    console.log('✅ Database setup verification passed');

  } catch (error) {
    console.error('❌ Database verification failed:', error.message);
    throw error;
  }
}

/**
 * Close database connection gracefully
 */
function closeDb() {
  if (dbInstance) {
    return new Promise((resolve) => {
      console.log('🔒 Closing database connection...');
      dbInstance.close((err) => {
        if (err) {
          console.error('❌ Error closing database:', err.message);
        } else {
          console.log('✅ Database connection closed');
        }
        dbInstance = null;
        resolve();
      });
    });
  }
  return Promise.resolve();
}

// Export functions
module.exports = {
  getDb,
  run: dbRunSync,
  get: dbGetSync,
  all: dbAllSync,
  initializeDatabase,
  createAllTables,
  seedAdminUsers,
  verifyDatabaseSetup,
  closeDb
};