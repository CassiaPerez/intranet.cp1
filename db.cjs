const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

// Singleton database instance
let dbInstance = null;

/**
 * Get singleton database connection
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

    dbInstance = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('❌ Error opening database:', err.message);
        process.exit(1);
      }
      console.log('✅ Connected to SQLite database');
    });

    // Configure SQLite with performance optimizations
    dbInstance.serialize(() => {
      console.log('⚙️  Configuring SQLite PRAGMAs...');
      dbInstance.run('PRAGMA journal_mode = WAL');
      dbInstance.run('PRAGMA synchronous = NORMAL');
      dbInstance.run('PRAGMA foreign_keys = ON');
      dbInstance.run('PRAGMA busy_timeout = 8000');
      dbInstance.run('PRAGMA cache_size = -64000'); // 64MB cache
      dbInstance.run('PRAGMA temp_store = MEMORY');
      console.log('✅ SQLite PRAGMAs configured');
    });
  }
  
  return dbInstance;
}

/**
 * Helper function to run SQL with parameters
 */
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = getDb();
    db.run(sql, params, function(err) {
      if (err) {
        console.error('❌ SQL RUN Error:', err.message);
        console.error('   SQL:', sql);
        console.error('   Params:', params);
        reject(err);
      } else {
        resolve({ lastID: this.lastID, changes: this.changes });
      }
    });
  });
}

/**
 * Helper function to get single row
 */
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = getDb();
    db.get(sql, params, (err, row) => {
      if (err) {
        console.error('❌ SQL GET Error:', err.message);
        console.error('   SQL:', sql);
        console.error('   Params:', params);
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

/**
 * Helper function to get all rows
 */
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = getDb();
    db.all(sql, params, (err, rows) => {
      if (err) {
        console.error('❌ SQL ALL Error:', err.message);
        console.error('   SQL:', sql);
        console.error('   Params:', params);
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
}

/**
 * Transaction helper
 */
function tx(callback) {
  return new Promise(async (resolve, reject) => {
    const db = getDb();
    
    try {
      await new Promise((res, rej) => {
        db.run('BEGIN TRANSACTION', (err) => {
          if (err) rej(err);
          else res();
        });
      });

      const result = await callback(db);

      await new Promise((res, rej) => {
        db.run('COMMIT', (err) => {
          if (err) rej(err);
          else res();
        });
      });

      resolve(result);
    } catch (error) {
      console.error('❌ Transaction error:', error.message);
      
      await new Promise((res) => {
        db.run('ROLLBACK', () => res()); // Always resolve rollback
      });
      
      reject(error);
    }
  });
}

/**
 * Initialize database with tables, triggers, and seed data
 */
async function initializeDatabase() {
  console.log('🗃️  Initializing database schema...');
  
  try {
    // Create all tables
    await createTables();
    await createTriggers();
    await seedData();
    
    console.log('✅ Database initialization complete');
  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);
    throw error;
  }
}

/**
 * Create all tables with idempotent DDL
 */
async function createTables() {
  console.log('📋 Creating database tables...');

  // usuarios table
  await run(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario TEXT UNIQUE NOT NULL,
      senha_hash TEXT NOT NULL,
      setor TEXT NOT NULL,
      role TEXT NOT NULL,
      nome TEXT NULL,
      email TEXT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // solicitacoes_ti table
  await run(`
    CREATE TABLE IF NOT EXISTS solicitacoes_ti (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      solicitante_nome TEXT NOT NULL,
      solicitante_email TEXT NULL,
      equipamento TEXT NOT NULL,
      descricao TEXT NOT NULL,
      prioridade TEXT NOT NULL CHECK (prioridade IN ('baixa', 'media', 'alta')),
      status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'aprovada', 'concluida', 'rejeitada')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // mural_posts table
  await run(`
    CREATE TABLE IF NOT EXISTS mural_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      autor_usuario TEXT NOT NULL,
      autor_setor TEXT NOT NULL,
      titulo TEXT NOT NULL,
      conteudo TEXT NOT NULL,
      publicado INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // agendamentos_salas table
  await run(`
    CREATE TABLE IF NOT EXISTS agendamentos_salas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sala_id TEXT NOT NULL,
      titulo TEXT NOT NULL,
      descricao TEXT NULL,
      inicio DATETIME NOT NULL,
      fim DATETIME NOT NULL,
      reservado_por TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // agendamentos_portaria table
  await run(`
    CREATE TABLE IF NOT EXISTS agendamentos_portaria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      visitante_nome TEXT NOT NULL,
      documento TEXT NULL,
      empresa TEXT NULL,
      data_hora DATETIME NOT NULL,
      anfitriao TEXT NOT NULL,
      observacoes TEXT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('✅ All tables created successfully');
}

/**
 * Create triggers for updated_at columns
 */
async function createTriggers() {
  console.log('🔧 Creating updated_at triggers...');

  const tables = [
    'usuarios', 
    'solicitacoes_ti', 
    'mural_posts', 
    'agendamentos_salas', 
    'agendamentos_portaria'
  ];

  for (const table of tables) {
    await run(`
      CREATE TRIGGER IF NOT EXISTS trigger_${table}_updated_at
      AFTER UPDATE ON ${table}
      BEGIN
        UPDATE ${table} SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END
    `);
  }

  console.log('✅ Triggers created successfully');
}

/**
 * Seed initial data (admin users)
 */
async function seedData() {
  console.log('🌱 Seeding initial data...');

  try {
    // Check if admin users already exist
    const existingAdmins = await get(`
      SELECT COUNT(*) as count 
      FROM usuarios 
      WHERE usuario IN ('admin-ti', 'admin-rh')
    `);

    if (existingAdmins.count >= 2) {
      console.log('✅ Admin users already exist, skipping seed');
      return;
    }

    // Create admin users with UPSERT (INSERT OR REPLACE)
    const adminTiHash = bcrypt.hashSync('admin123', 10);
    const adminRhHash = bcrypt.hashSync('admin123', 10);

    await run(`
      INSERT OR REPLACE INTO usuarios 
      (usuario, senha_hash, setor, role, nome, email) 
      VALUES (?, ?, ?, ?, ?, ?)
    `, ['admin-ti', adminTiHash, 'TI', 'admin', 'Administrador TI', 'admin.ti@grupocropfield.com.br']);

    await run(`
      INSERT OR REPLACE INTO usuarios 
      (usuario, senha_hash, setor, role, nome, email) 
      VALUES (?, ?, ?, ?, ?, ?)
    `, ['admin-rh', adminRhHash, 'RH', 'admin', 'Administrador RH', 'admin.rh@grupocropfield.com.br']);

    console.log('✅ Admin users seeded successfully');
    console.log('   👤 admin-ti / admin123 (TI)');
    console.log('   👤 admin-rh / admin123 (RH)');

  } catch (error) {
    console.error('❌ Error seeding data:', error.message);
    throw error;
  }
}

/**
 * Close database connection
 */
function closeDb() {
  if (dbInstance) {
    return new Promise((resolve) => {
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

module.exports = {
  getDb,
  run,
  get,
  all,
  tx,
  initializeDatabase,
  closeDb
};