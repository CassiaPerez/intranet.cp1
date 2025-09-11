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

    dbInstance = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
      if (err) {
        console.error('❌ Error opening database:', err.message);
        process.exit(1);
      }
      console.log('✅ Connected to SQLite database');
    });

    // Configure SQLite with performance optimizations and WAL mode
    dbInstance.serialize(() => {
      console.log('⚙️  Configuring SQLite PRAGMAs...');
      dbInstance.run('PRAGMA journal_mode = WAL');
      dbInstance.run('PRAGMA synchronous = NORMAL');
      dbInstance.run('PRAGMA foreign_keys = ON');
      dbInstance.run('PRAGMA busy_timeout = 10000');
      dbInstance.run('PRAGMA cache_size = -64000');
      dbInstance.run('PRAGMA temp_store = MEMORY');
      dbInstance.run('PRAGMA auto_vacuum = INCREMENTAL');
      console.log('✅ SQLite PRAGMAs configured');
    });
  }
  
  return dbInstance;
}

/**
 * Promisified database operations with detailed error logging
 */
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = getDb();
    console.log('[DB-RUN] Executing:', sql.substring(0, 100) + (sql.length > 100 ? '...' : ''));
    console.log('[DB-RUN] Params:', params);
    
    db.run(sql, params, function(err) {
      if (err) {
        console.error('❌ [DB-RUN] SQL Error:', err.message);
        console.error('❌ [DB-RUN] SQL Statement:', sql);
        console.error('❌ [DB-RUN] Parameters:', params);
        reject(err);
      } else {
        console.log('✅ [DB-RUN] Success - ID:', this.lastID, 'Changes:', this.changes);
        resolve({ lastID: this.lastID, changes: this.changes });
      }
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = getDb();
    console.log('[DB-GET] Executing:', sql.substring(0, 100) + (sql.length > 100 ? '...' : ''));
    
    db.get(sql, params, (err, row) => {
      if (err) {
        console.error('❌ [DB-GET] SQL Error:', err.message);
        console.error('❌ [DB-GET] SQL Statement:', sql);
        console.error('❌ [DB-GET] Parameters:', params);
        reject(err);
      } else {
        console.log('✅ [DB-GET] Success - Row found:', !!row);
        resolve(row);
      }
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = getDb();
    console.log('[DB-ALL] Executing:', sql.substring(0, 100) + (sql.length > 100 ? '...' : ''));
    
    db.all(sql, params, (err, rows) => {
      if (err) {
        console.error('❌ [DB-ALL] SQL Error:', err.message);
        console.error('❌ [DB-ALL] SQL Statement:', sql);
        console.error('❌ [DB-ALL] Parameters:', params);
        reject(err);
      } else {
        console.log('✅ [DB-ALL] Success - Rows:', rows?.length || 0);
        resolve(rows || []);
      }
    });
  });
}

/**
 * Transaction wrapper with proper error handling
 */
function dbTransaction(callback) {
  return new Promise(async (resolve, reject) => {
    const db = getDb();
    
    try {
      console.log('[DB-TX] Starting transaction...');
      
      await new Promise((res, rej) => {
        db.run('BEGIN TRANSACTION', (err) => {
          if (err) {
            console.error('❌ [DB-TX] Failed to begin transaction:', err.message);
            rej(err);
          } else {
            console.log('✅ [DB-TX] Transaction started');
            res();
          }
        });
      });

      const result = await callback();

      await new Promise((res, rej) => {
        db.run('COMMIT', (err) => {
          if (err) {
            console.error('❌ [DB-TX] Failed to commit transaction:', err.message);
            rej(err);
          } else {
            console.log('✅ [DB-TX] Transaction committed');
            res();
          }
        });
      });

      resolve(result);
    } catch (error) {
      console.error('❌ [DB-TX] Transaction error:', error.message);
      
      try {
        await new Promise((res) => {
          db.run('ROLLBACK', (err) => {
            if (err) {
              console.error('❌ [DB-TX] Failed to rollback:', err.message);
            } else {
              console.log('✅ [DB-TX] Transaction rolled back');
            }
            res();
          });
        });
      } catch (rollbackError) {
        console.error('❌ [DB-TX] Rollback error:', rollbackError.message);
      }
      
      reject(error);
    }
  });
}

/**
 * Initialize database with all tables and seed data
 */
async function initializeDatabase() {
  console.log('🗃️  Initializing database schema...');
  
  try {
    // Ensure database connection is working
    const testQuery = await dbGet('SELECT 1 as test');
    console.log('✅ Database connection test passed:', testQuery);
    
    // Create all tables
    await createAllTables();
    
    // Create triggers
    await createTriggers();
    
    // Seed initial data
    await seedInitialData();
    
    console.log('✅ Database initialization complete');
    
    // Verify tables exist
    const tables = await dbAll(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `);
    console.log('📋 Created tables:', tables.map(t => t.name).join(', '));
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);
    throw error;
  }
}

/**
 * Create all required tables
 */
async function createAllTables() {
  console.log('📋 Creating database tables...');

  // usuarios table
  await dbRun(`
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
  await dbRun(`
    CREATE TABLE IF NOT EXISTS mural_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      autor_usuario TEXT NOT NULL,
      autor_setor TEXT NOT NULL,
      titulo TEXT NOT NULL,
      conteudo TEXT NOT NULL,
      publicado INTEGER NOT NULL DEFAULT 1,
      pinned INTEGER NOT NULL DEFAULT 0,
      likes_count INTEGER NOT NULL DEFAULT 0,
      comments_count INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // mural_comments table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS mural_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      autor_usuario TEXT NOT NULL,
      texto TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (post_id) REFERENCES mural_posts (id) ON DELETE CASCADE
    )
  `);

  // mural_likes table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS mural_likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      usuario TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(post_id, usuario),
      FOREIGN KEY (post_id) REFERENCES mural_posts (id) ON DELETE CASCADE
    )
  `);

  // ti_solicitacoes table
  await dbRun(`
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
  await dbRun(`
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
  await dbRun(`
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
  await dbRun(`
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
  await dbRun(`
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
 * Create database indexes for performance
 */
async function createIndexes() {
  console.log('📊 Creating database indexes...');

  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_usuarios_usuario ON usuarios(usuario)',
    'CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email)',
    'CREATE INDEX IF NOT EXISTS idx_mural_posts_publicado ON mural_posts(publicado, created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_mural_comments_post_id ON mural_comments(post_id, created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_mural_likes_post_usuario ON mural_likes(post_id, usuario)',
    'CREATE INDEX IF NOT EXISTS idx_ti_solicitacoes_usuario ON ti_solicitacoes(usuario_id, created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_ti_solicitacoes_status ON ti_solicitacoes(status)',
    'CREATE INDEX IF NOT EXISTS idx_reservas_data ON reservas(data_reserva, hora_inicio)',
    'CREATE INDEX IF NOT EXISTS idx_reservas_sala ON reservas(sala, data_reserva)',
    'CREATE INDEX IF NOT EXISTS idx_portaria_data ON portaria_agendamentos(data_visita, hora_entrada)',
    'CREATE INDEX IF NOT EXISTS idx_trocas_data ON trocas_proteina(data_troca)',
    'CREATE INDEX IF NOT EXISTS idx_pontos_usuario ON pontos(usuario_id, created_at DESC)'
  ];

  for (const indexSql of indexes) {
    try {
      await dbRun(indexSql);
    } catch (error) {
      console.warn('⚠️ Index creation warning:', error.message);
    }
  }

  console.log('✅ Database indexes created');
}

/**
 * Create triggers for updated_at columns
 */
async function createTriggers() {
  console.log('🔧 Creating updated_at triggers...');

  const tables = [
    'usuarios', 
    'mural_posts',
    'ti_solicitacoes', 
    'reservas', 
    'portaria_agendamentos',
    'trocas_proteina'
  ];

  for (const table of tables) {
    try {
      await dbRun(`
        CREATE TRIGGER IF NOT EXISTS trigger_${table}_updated_at
        AFTER UPDATE ON ${table}
        BEGIN
          UPDATE ${table} SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
        END
      `);
    } catch (error) {
      console.warn(`⚠️ Trigger creation warning for ${table}:`, error.message);
    }
  }

  console.log('✅ Triggers created successfully');
}

/**
 * Seed initial admin users
 */
async function seedInitialData() {
  console.log('🌱 Seeding initial data...');

  try {
    // Check if any admin users exist
    const existingAdmins = await dbGet(`
      SELECT COUNT(*) as count 
      FROM usuarios 
      WHERE role = 'admin'
    `);

    if (existingAdmins && existingAdmins.count > 0) {
      console.log('✅ Admin users already exist, skipping seed');
      return;
    }

    // Create admin users
    console.log('👤 Creating admin users...');
    
    const adminTiHash = await bcrypt.hash('admin123', 12);
    const adminRhHash = await bcrypt.hash('admin123', 12);

    await dbTransaction(async () => {
      const tiResult = await dbRun(`
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

      const rhResult = await dbRun(`
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

      console.log('✅ Admin users created:');
      console.log('   👤 admin-ti (ID:', tiResult.lastID, ') / admin123');
      console.log('   👤 admin-rh (ID:', rhResult.lastID, ') / admin123');
    });

    // Verify users were created
    const allUsers = await dbAll('SELECT id, usuario, setor, role FROM usuarios');
    console.log('📋 Total users in database:', allUsers.length);
    allUsers.forEach(user => {
      console.log(`   - ${user.usuario} (${user.setor}/${user.role}) ID: ${user.id}`);
    });

  } catch (error) {
    console.error('❌ Error seeding data:', error.message);
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

// Export all functions with backward compatibility
module.exports = {
  getDb,
  run: dbRun,        // backward compatibility
  get: dbGet,        // backward compatibility
  all: dbAll,        // backward compatibility
  tx: dbTransaction, // backward compatibility
  dbRun,
  dbGet,
  dbAll,
  dbTransaction,
  initializeDatabase,
  createAllTables,
  createIndexes,
  createTriggers,
  seedInitialData,
  closeDb
};