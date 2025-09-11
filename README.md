# Corporate Intranet Application

Sistema de intranet corporativa desenvolvido para o Grupo Cropfield.

## 🚀 Funcionalidades

- **Autenticação**: Login com Google OAuth + email/senha
- **Dashboard**: Visão geral com sistema de gamificação
- **Reservas**: Agendamento de salas e visitas da portaria
- **Cardápio**: Visualização e troca de proteínas do almoço
- **Diretório**: Contatos de colaboradores e representantes
- **Mural**: Publicações internas da empresa
- **Equipamentos**: Solicitações de equipamentos de TI
- **Aniversariantes**: Lista dos aniversários do mês
- **Sistema de Pontos**: Gamificação com ranking de usuários

## 🛠️ Tecnologias

- **Frontend**: React 18 + TypeScript + Tailwind CSS
- **Backend**: Node.js + Express 5 + SQLite
- **Autenticação**: Passport.js + Google OAuth 2.0 + JWT
- **Calendar**: FullCalendar
- **Outras**: date-fns, react-router-dom, react-hot-toast

## ⚙️ Configuração

### 1. Instalação
```bash
npm install
```

### 2. Configuração do ambiente
Crie um arquivo `.env` baseado no `.env.example`:

```bash
cp .env.example .env
```

Configure as variáveis:
```env
# Backend
PORT=3006
NODE_ENV=development
WEB_URL=http://localhost:5173
JWT_SECRET=your-jwt-secret-here

# Google OAuth (opcional)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3006/auth/google/callback

# Frontend
VITE_API_URL=http://localhost:3006
```

### 3. Google OAuth (Opcional)
Para habilitar login com Google:

1. Acesse [Google Cloud Console](https://console.cloud.google.com/)
2. Crie um novo projeto ou selecione um existente
3. Habilite a API "Google+ API"
4. Crie credenciais OAuth 2.0:
   - Tipo: Aplicação web
   - URIs de redirecionamento autorizados: `http://localhost:3006/auth/google/callback`
5. Configure as variáveis `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`

## 🚀 Execução

### Desenvolvimento (Recomendado)
```bash
npm run dev
```
Inicia frontend (port 5173) e backend (port 3006) simultaneamente.

### Desenvolvimento Separado
Terminal 1 (Backend):
```bash
npm run server
```

Terminal 2 (Frontend):
```bash
npm run dev:frontend
```

### Produção
```bash
npm run build
npm start
```

## 🗄️ Banco de Dados

O sistema usa SQLite com as seguintes tabelas principais:
- `usuarios` - Dados dos usuários
- `mural_posts` - Posts do mural interno
- `reservas` - Reservas de salas
- `trocas_proteina` - Trocas de proteínas do cardápio
- `ti_solicitacoes` - Solicitações de equipamentos
- `portaria_agendamentos` - Agendamentos da portaria
- `pontos` - Sistema de gamificação

### Usuários Padrão
O sistema cria automaticamente usuários de teste:

| Email | Senha | Role |
|-------|-------|------|
| admin@grupocropfield.com.br | admin123 | admin |
| rh@grupocropfield.com.br | rh123 | rh |
| moderador@grupocropfield.com.br | mod123 | moderador |
| colaborador@grupocropfield.com.br | colab123 | colaborador |

## 📁 Estrutura do Projeto

```
├── src/
│   ├── components/       # Componentes React
│   ├── contexts/         # Contextos (Auth, Gamification)
│   ├── pages/           # Páginas da aplicação
│   ├── utils/           # Utilitários
│   └── lib/            # Configurações (Supabase, etc)
├── public/
│   ├── dados/          # Arquivos JSON (contatos, aniversariantes)
│   └── cardapio/       # Dados do cardápio
├── data/               # Banco SQLite (criado automaticamente)
├── server.cjs          # Servidor backend
└── package.json
```

## 🎯 Permissões

### Colaborador
- Visualizar todas as páginas
- Fazer reservas e agendamentos
- Trocar proteínas
- Curtir e comentar no mural
- Solicitar equipamentos

### RH/TI/Moderador/Admin
- Todas as permissões de colaborador
- Publicar no mural
- Moderar comentários
- Acessar painel administrativo (admin apenas)

## 🐛 Troubleshooting

### Problemas de Login
1. Verifique se o backend está rodando na porta 3006
2. Confirme se as variáveis de ambiente estão configuradas
3. Para Google OAuth, verifique se as URLs de callback estão corretas
4. Limpe cookies e localStorage se necessário

### Problemas de CORS
O sistema está configurado para aceitar requisições de:
- `http://localhost:5173` (desenvolvimento)
- `*.stackblitz.io` (StackBlitz)
- `*.netlify.app` (Netlify)

### Limpeza do Banco
Para limpar dados de demonstração:
```bash
npm run clean-demo
```

## 📝 Scripts Disponíveis

- `npm run dev` - Inicia frontend e backend
- `npm run dev:frontend` - Apenas frontend
- `npm run server` - Apenas backend  
- `npm run build` - Build para produção
- `npm run clean:db` - Limpa banco de dados
- `npm run clean-demo` - Limpa dados de demonstração

## 🔒 Segurança

- Senhas criptografadas com bcrypt
- JWT com expiração de 24h
- Cookies HTTP-Only
- Validação de dados no backend
- Sistema de permissões por role
- Moderação automática de comentários

## 📱 Responsividade

A aplicação é totalmente responsiva e funciona em:
- Desktop (1200px+)
- Tablet (768px - 1199px) 
- Mobile (< 768px)

## 🎮 Sistema de Gamificação

Ganhe pontos por atividades:
- Visitar páginas: 1 ponto
- Curtir posts: 2 pontos
- Comentar: 3 pontos
- Solicitar equipamentos: 4 pontos
- Trocar proteínas: 5 pontos
- Agendar portaria: 6 pontos
- Reservar salas: 8 pontos
- Criar posts: 15 pontos

## 📄 Licença

Propriedade do Grupo Cropfield - Todos os direitos reservados.