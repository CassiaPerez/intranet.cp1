# Intranet Grupo Cropfield

Sistema de intranet corporativa com funcionalidades de:
- Dashboard com gamificação
- Reserva de salas e agendamentos
- Cardápio e troca de proteínas
- Diretório de contatos
- Mural de informações
- Solicitações de equipamentos TI
- Painel administrativo

## Configuração

### 1. Instalar dependências
```bash
npm install
```

### 2. Configurar variáveis de ambiente
Copie `.env.example` para `.env` e configure as variáveis:

```bash
cp .env.example .env
```

### 3. Google OAuth (Opcional)
Para ativar o login com Google:
1. Acesse o [Google Cloud Console](https://console.cloud.google.com/)
2. Crie um projeto ou selecione um existente
3. Ative a Google+ API
4. Crie credenciais OAuth 2.0
5. Configure as URLs de redirecionamento:
   - Desenvolvimento: `http://localhost:3006/auth/google/callback`
   - Produção: `https://sua-api.com/auth/google/callback`
6. Adicione as credenciais no arquivo `.env`

### 4. Executar o projeto
```bash
npm run dev
```

## Perfis de Usuário

- **Colaborador**: Acesso básico (dashboard, reservas, cardápio, diretório, mural - apenas visualizar/interagir)
- **RH**: Colaborador + publicar no mural + painel administrativo
- **Moderador**: Colaborador + publicar no mural + moderar comentários + painel administrativo
- **Admin**: Acesso completo ao sistema

## Usuários Padrão

- **Admin**: admin@grupocropfield.com.br / admin123
- **RH**: rh@grupocropfield.com.br / rh123
- **Moderador**: moderador@grupocropfield.com.br / mod123
- **Colaborador**: colaborador@grupocropfield.com.br / colab123

## Estrutura de Arquivos

```
src/
├── components/     # Componentes reutilizáveis
├── contexts/       # Contextos React (Auth, Gamificação)
├── pages/          # Páginas da aplicação
├── utils/          # Utilitários e helpers
└── lib/            # Configurações (Supabase, etc.)

public/
├── dados/          # Dados estáticos (JSON)
└── cardapio/       # Cardápios mensais

server.cjs          # Backend Express + SQLite
```

## Scripts Disponíveis

- `npm run dev`: Inicia frontend + backend
- `npm run dev:frontend`: Apenas frontend
- `npm run dev:backend`: Apenas backend
- `npm run build`: Build para produção
- `npm run clean-demo`: Limpa dados de demonstração