#!/usr/bin/env node
// scripts/clean-demo.cjs
// Script para limpeza de dados de demonstração do banco SQLite

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function cleanDemo() {
  const dbPath = path.join(__dirname, '..', 'data', 'database.sqlite');
  
  if (!fs.existsSync(dbPath)) {
    console.log('❌ Banco de dados não encontrado:', dbPath);
    process.exit(1);
  }

  console.log('🗄️  Limpeza de dados de demonstração');
  console.log('📍 Banco:', dbPath);
  console.log('');

  // Conectar ao banco
  const db = new sqlite3.Database(dbPath);

  try {
    // Verificar quantos registros existem
    const counts = {
      mural_posts: await all(db, "SELECT COUNT(*) as count FROM mural_posts").then(r => r[0]?.count || 0),
      mural_likes: await all(db, "SELECT COUNT(*) as count FROM mural_likes").then(r => r[0]?.count || 0),
      mural_comments: await all(db, "SELECT COUNT(*) as count FROM mural_comments").then(r => r[0]?.count || 0),
      trocas_proteina: await all(db, "SELECT COUNT(*) as count FROM trocas_proteina").then(r => r[0]?.count || 0),
      reservas: await all(db, "SELECT COUNT(*) as count FROM reservas").then(r => r[0]?.count || 0),
      portaria_agendamentos: await all(db, "SELECT COUNT(*) as count FROM portaria_agendamentos").then(r => r[0]?.count || 0),
      pontos: await all(db, "SELECT COUNT(*) as count FROM pontos").then(r => r[0]?.count || 0),
      ti_solicitacoes: await all(db, "SELECT COUNT(*) as count FROM ti_solicitacoes").then(r => r[0]?.count || 0),
      usuarios: await all(db, "SELECT COUNT(*) as count FROM usuarios WHERE email != 'admin@grupocropfield.com.br'").then(r => r[0]?.count || 0),
    };

    console.log('📊 Registros encontrados:');
    console.log('   Posts do mural:', counts.mural_posts);
    console.log('   Likes do mural:', counts.mural_likes);
    console.log('   Comentários do mural:', counts.mural_comments);
    console.log('   Trocas de proteína:', counts.trocas_proteina);
    console.log('   Reservas de salas:', counts.reservas);
    console.log('   Agendamentos portaria:', counts.portaria_agendamentos);
    console.log('   Pontos de gamificação:', counts.pontos);
    console.log('   Solicitações TI:', counts.ti_solicitacoes);
    console.log('   Usuários (exceto admin):', counts.usuarios);
    console.log('');

    const totalRecords = Object.values(counts).reduce((sum, count) => sum + count, 0);
    
    if (totalRecords === 0) {
      console.log('✅ Nenhum dado de demonstração encontrado para limpar.');
      db.close();
      rl.close();
      return;
    }

    console.log(`⚠️  TOTAL: ${totalRecords} registros serão deletados`);
    console.log('');
    console.log('⚠️  ATENÇÃO: Esta operação é IRREVERSÍVEL!');
    console.log('   - Todos os dados de demonstração serão perdidos');
    console.log('   - Apenas o usuário admin padrão será mantido');
    console.log('   - O banco ficará limpo para uso em produção');
    console.log('');

    const confirmacao = await question('❓ Tem certeza que deseja continuar? (digite "CONFIRMAR" para prosseguir): ');
    
    if (confirmacao.toUpperCase() !== 'CONFIRMAR') {
      console.log('❌ Operação cancelada pelo usuário.');
      rl.close();
      db.close();
      process.exit(0);
      return;
    }

    console.log('🧹 Iniciando limpeza...');

    // Limpar tabelas na ordem correta (respeitando foreign keys)
    const queries = [
      { name: 'Comentários do mural', sql: 'DELETE FROM mural_comments' },
      { name: 'Likes do mural', sql: 'DELETE FROM mural_likes' },
      { name: 'Posts do mural', sql: 'DELETE FROM mural_posts' },
      { name: 'Pontos de gamificação', sql: 'DELETE FROM pontos' },
      { name: 'Trocas de proteína', sql: 'DELETE FROM trocas_proteina' },
      { name: 'Reservas de salas', sql: 'DELETE FROM reservas' },
      { name: 'Agendamentos portaria', sql: 'DELETE FROM portaria_agendamentos' },
      { name: 'Solicitações TI', sql: 'DELETE FROM ti_solicitacoes' },
      { name: 'Usuários demo', sql: "DELETE FROM usuarios WHERE email != 'admin@grupocropfield.com.br'" },
    ];

    for (const query of queries) {
      try {
        const result = await run(db, query.sql);
        if (result.changes > 0) {
          console.log(`   ✅ ${query.name}: ${result.changes} registros removidos`);
        }
      } catch (error) {
        console.error(`   ❌ Erro ao limpar ${query.name}:`, error.message);
      }
    }

    // Reset autoincrement sequences
    console.log('🔄 Resetando sequências...');
    const resetQueries = [
      "DELETE FROM sqlite_sequence WHERE name IN ('mural_posts', 'mural_comments', 'pontos', 'trocas_proteina', 'reservas', 'portaria_agendamentos', 'ti_solicitacoes')",
    ];

    for (const sql of resetQueries) {
      try {
        await run(db, sql);
        console.log('   ✅ Sequências resetadas');
      } catch (error) {
        console.log('   ⚠️  Aviso ao resetar sequências:', error.message);
      }
    }

    console.log('');
    console.log('🎉 Limpeza concluída com sucesso!');
    console.log('');
    console.log('📝 Resumo:');
    console.log('   ✅ Banco limpo e pronto para produção');
    console.log('   ✅ Usuário admin mantido (admin@grupocropfield.com.br / admin123)');
    console.log('   ✅ Estrutura das tabelas preservada');
    console.log('   ✅ Sequências de ID resetadas');
    console.log('');
    console.log('🚀 O sistema está pronto para uso real!');

  } catch (error) {
    console.error('❌ Erro durante a limpeza:', error);
    rl.close();
    db.close();
    process.exit(1);
  }

  rl.close();
  db.close();
  process.exit(0);
}

if (require.main === module) {
  cleanDemo().catch(console.error);
}

module.exports = { cleanDemo };