#!/usr/bin/env node
/**
 * Script auxiliar para configuração do Google OAuth
 * Executa verificações e orienta sobre a configuração
 */

const fs = require('fs');
const path = require('path');

console.log('🔐 Setup do Google OAuth para Intranet Cropfield\n');

// Verificar se .env existe
const envPath = path.join(__dirname, '..', '.env');
const envExamplePath = path.join(__dirname, '..', '.env.example');

if (!fs.existsSync(envPath)) {
  console.log('📁 Arquivo .env não encontrado. Criando...');
  
  if (fs.existsSync(envExamplePath)) {
    fs.copyFileSync(envExamplePath, envPath);
    console.log('✅ Arquivo .env criado baseado no .env.example\n');
  } else {
    console.log('❌ Arquivo .env.example não encontrado');
    process.exit(1);
  }
}

// Ler .env atual
const envContent = fs.readFileSync(envPath, 'utf8');
const envLines = envContent.split('\n');

// Verificar variáveis do Google OAuth
const checkVar = (name) => {
  const line = envLines.find(l => l.startsWith(`${name}=`));
  if (!line) return null;
  const value = line.split('=')[1] || '';
  return value.trim() === 'your_google_client_id_here' || 
         value.trim() === 'your_google_client_secret_here' || 
         value.trim() === '' ? null : value.trim();
};

const googleClientId = checkVar('GOOGLE_CLIENT_ID');
const googleClientSecret = checkVar('GOOGLE_CLIENT_SECRET');
const googleCallbackUrl = checkVar('GOOGLE_CALLBACK_URL');

console.log('🔍 Status da configuração:');
console.log(`   GOOGLE_CLIENT_ID: ${googleClientId ? '✅ Configurado' : '❌ Não configurado'}`);
console.log(`   GOOGLE_CLIENT_SECRET: ${googleClientSecret ? '✅ Configurado' : '❌ Não configurado'}`);
console.log(`   GOOGLE_CALLBACK_URL: ${googleCallbackUrl || 'http://localhost:3006/auth/google/callback'}`);

if (!googleClientId || !googleClientSecret) {
  console.log('\n📋 Para configurar o Google OAuth:');
  console.log('\n1. Acesse: https://console.cloud.google.com/');
  console.log('2. Crie um projeto ou selecione um existente');
  console.log('3. Habilite a "Google+ API" ou "Google Identity API"');
  console.log('4. Vá em "Credenciais" → "Criar credenciais" → "ID do cliente OAuth 2.0"');
  console.log('5. Configure:');
  console.log('   - Tipo: Aplicação da Web');
  console.log('   - Nome: Intranet Cropfield');
  console.log('   - URIs de origem autorizados: http://localhost:5173');
  console.log('   - URIs de redirecionamento: http://localhost:3006/auth/google/callback');
  console.log('\n6. Copie o Client ID e Client Secret');
  console.log('7. Edite o arquivo .env e configure:');
  console.log('   GOOGLE_CLIENT_ID=seu_client_id_aqui');
  console.log('   GOOGLE_CLIENT_SECRET=seu_client_secret_aqui');
  console.log('\n⚠️  Importante: Mantenha o Client Secret em segurança!');
} else {
  console.log('\n✅ Google OAuth configurado corretamente!');
  console.log('\n🚀 Agora você pode:');
  console.log('1. Executar: npm run dev');
  console.log('2. Acessar: http://localhost:5173');
  console.log('3. Clicar em "Entrar com Google"');
  console.log('\n💡 Lembre-se: apenas emails autorizados no banco podem fazer login.');
}

console.log('\n📚 Documentação completa: README.md');