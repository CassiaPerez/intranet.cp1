# 🧪 Testing Guide - Intranet Cropfield

## 🚀 Quick Start

1. **Start the application**:
```bash
npm run dev
```

2. **Login with test credentials**:
   - Username: `admin-ti` Password: `admin123`
   - Username: `admin-rh` Password: `admin123`

## 📊 Database Testing

### Manual Database Inspection
```bash
# Connect to SQLite database
sqlite3 data/database.sqlite

# Check tables
.tables

# Check users
SELECT * FROM usuarios;

# Check TI requests
SELECT * FROM solicitacoes_ti;

# Check mural posts
SELECT * FROM mural_posts;

# Check room reservations
SELECT * FROM agendamentos_salas;

# Check reception appointments
SELECT * FROM agendamentos_portaria;

# Exit SQLite
.quit
```

### Reset Database
```bash
# Stop server first
# Delete database file
rm -f data/database.sqlite

# Start server again - it will recreate everything
npm run dev
```

## 🔧 API Testing with curl

### 1. Login and get token
```bash
# Login
curl -X POST http://localhost:3006/api/login-admin \
  -H "Content-Type: application/json" \
  -d '{"usuario":"admin-ti","senha":"admin123"}' \
  -c cookies.txt

# Or save token from response and use in Authorization header
TOKEN="your_jwt_token_here"
```

### 2. Test TI Solicitações
```bash
# Create TI request
curl -X POST http://localhost:3006/api/ti/solicitacoes \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "titulo": "Notebook Dell",
    "descricao": "Preciso de um notebook para desenvolvimento",
    "prioridade": "alta",
    "nome": "Admin TI"
  }'

# List TI requests
curl -X GET http://localhost:3006/api/ti/solicitacoes \
  -b cookies.txt
```

### 3. Test Mural Posts
```bash
# Create post
curl -X POST http://localhost:3006/api/mural/posts \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "titulo": "Bem-vindos!",
    "conteudo": "Este é o primeiro post do mural da intranet!"
  }'

# List posts
curl -X GET http://localhost:3006/api/mural/posts \
  -b cookies.txt
```

### 4. Test Room Reservations
```bash
# Create room reservation (new API)
curl -X POST http://localhost:3006/api/salas/agendar \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "sala_id": "aquario",
    "titulo": "Reunião de equipe",
    "descricao": "Planejamento semanal",
    "inicio": "2025-01-15T09:00:00",
    "fim": "2025-01-15T10:00:00"
  }'

# List room reservations
curl -X GET http://localhost:3006/api/salas/agendados \
  -b cookies.txt

# Legacy API for existing frontend
curl -X POST http://localhost:3006/api/reservas \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "sala": "grande",
    "data": "2025-01-16", 
    "inicio": "14:00",
    "fim": "15:00",
    "assunto": "Reunião comercial"
  }'
```

### 5. Test Reception Appointments
```bash
# Create appointment (new API)
curl -X POST http://localhost:3006/api/portaria/agendar \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "visitante_nome": "João Silva",
    "documento": "123.456.789-00",
    "empresa": "Fornecedor XYZ",
    "data_hora": "2025-01-17T14:30:00",
    "observacoes": "Reunião sobre fornecimento"
  }'

# List appointments
curl -X GET http://localhost:3006/api/portaria/agendados \
  -b cookies.txt

# Legacy API for existing frontend
curl -X POST http://localhost:3006/api/portaria/agendamentos \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "data": "2025-01-18",
    "hora": "16:00",
    "visitante": "Maria Santos",
    "documento": "987.654.321-00",
    "observacao": "Cliente importante"
  }'
```

### 6. Test Admin Dashboard
```bash
# Get admin dashboard data
curl -X GET http://localhost:3006/api/admin/dashboard \
  -b cookies.txt

# Export users as CSV
curl -X GET "http://localhost:3006/api/admin/export/users/csv" \
  -b cookies.txt \
  -o users-export.csv

# Export as Excel (JSON response)
curl -X GET "http://localhost:3006/api/admin/export/users/excel" \
  -b cookies.txt
```

### 7. List All Users
```bash
curl -X GET http://localhost:3006/api/usuarios \
  -b cookies.txt
```

## 🧪 Concurrency Testing

Test that WAL mode prevents SQLITE_BUSY errors:

```bash
# Run 5 concurrent TI requests
for i in {1..5}; do
  curl -X POST http://localhost:3006/api/ti/solicitacoes \
    -H "Content-Type: application/json" \
    -b cookies.txt \
    -d "{
      \"titulo\": \"Equipamento $i\",
      \"descricao\": \"Solicitação de teste $i\",
      \"prioridade\": \"media\",
      \"nome\": \"Teste Concorrência\"
    }" &
done
wait

# Check results
curl -X GET http://localhost:3006/api/ti/solicitacoes -b cookies.txt | jq '.solicitacoes | length'
```

## ✅ Expected Results

After running the tests above, you should see:

1. **Database file created**: `data/database.sqlite`
2. **Tables created**: 5 tables (usuarios, solicitacoes_ti, mural_posts, agendamentos_salas, agendamentos_portaria)
3. **Admin users**: 2 admin users seeded automatically
4. **Data persistence**: All POST requests should return 201 with generated IDs
5. **Data retrieval**: All GET requests should return the created data
6. **No SQLITE_BUSY errors** during concurrent operations

## 🐛 Troubleshooting

### Check database file exists
```bash
ls -la data/database.sqlite
```

### Check WAL files
```bash
ls -la data/database.sqlite*
# Should see: database.sqlite, database.sqlite-wal, database.sqlite-shm
```

### Check server logs
Look for these log messages in the server console:
- `✅ Connected to SQLite database`
- `✅ SQLite PRAGMAs configured`
- `✅ Database initialized successfully`
- `✅ Admin users seeded successfully`

### Frontend debugging
Open browser console and look for:
- `[LOGIN] ✅ Login successful`
- `[TI] ✅ TI request created with ID: X`
- `[MURAL] ✅ Post created with ID: X`
- No 401/404 errors from API calls

### Common issues
1. **401 errors**: Make sure you're logged in and cookies are set
2. **404 errors**: Check that server is running on port 3006
3. **Database locked**: Stop server completely and restart
4. **CORS errors**: Ensure frontend is on http://localhost:5173