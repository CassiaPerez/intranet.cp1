# 🚀 Instruções de Deploy - Intranet Cropfield

## 📋 Pré-requisitos

- Servidor Ubuntu 20.04+ 
- Domínios configurados:
  - `intranet.cropfield.com.br` → Backend API
  - `intranet.grupocropfield.com.br` → Frontend
- Acesso root ou sudo

## 🔧 1. Preparação do Servidor

```bash
# Execute o script de setup (como root)
chmod +x deploy.sh
./deploy.sh
```

## 📁 2. Upload dos Arquivos

### Backend
```bash
# Copie todos os arquivos do projeto para o servidor
scp -r . ubuntu@seu-servidor:/tmp/intranet/
ssh ubuntu@seu-servidor "sudo cp -r /tmp/intranet/* /var/www/intranet/"
```

### Frontend Build
```bash
# Faça o build localmente
npm run build:production

# Copie o build para o servidor
scp -r dist/* ubuntu@seu-servidor:/tmp/intranet-frontend/
ssh ubuntu@seu-servidor "sudo cp -r /tmp/intranet-frontend/* /var/www/intranet-frontend/"
```

## ⚙️ 3. Configuração

### 3.1 Environment Variables
```bash
ssh ubuntu@seu-servidor
cd /var/www/intranet
sudo cp .env.production .env
sudo nano .env
```

Configure no `.env`:
```env
NODE_ENV=production
HOST=127.0.0.1
PORT=3006
WEB_URL=https://intranet.grupocropfield.com.br
JWT_SECRET=SUA_CHAVE_SUPER_SEGURA_AQUI
GOOGLE_CLIENT_ID=seu_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=seu_client_secret
GOOGLE_CALLBACK_URL=https://intranet.cropfield.com.br/auth/google/callback
```

### 3.2 Permissões
```bash
sudo chown -R www-data:www-data /var/www/intranet
sudo chown -R www-data:www-data /var/www/intranet-frontend
sudo chmod -R 755 /var/www/intranet
sudo chmod -R 755 /var/www/intranet-frontend
```

### 3.3 Dependencies
```bash
cd /var/www/intranet
sudo -u www-data npm install --production
```

## 🔐 4. SSL Certificates

```bash
# Instalar certificados Let's Encrypt
sudo certbot --nginx -d intranet.cropfield.com.br
sudo certbot --nginx -d intranet.grupocropfield.com.br

# Verificar renovação automática
sudo systemctl status snap.certbot.renew.timer
```

## 🌐 5. Nginx

```bash
# Copiar configuração
sudo cp /var/www/intranet/nginx.conf /etc/nginx/sites-available/intranet-cropfield

# Habilitar site
sudo ln -sf /etc/nginx/sites-available/intranet-cropfield /etc/nginx/sites-enabled/

# Remover site padrão (se necessário)
sudo rm -f /etc/nginx/sites-enabled/default

# Testar configuração
sudo nginx -t

# Recarregar Nginx
sudo systemctl reload nginx
```

## ⚡ 6. PM2 (Process Manager)

```bash
cd /var/www/intranet

# Iniciar aplicação
sudo -u www-data pm2 start ecosystem.config.js --env production

# Salvar configuração do PM2
sudo -u www-data pm2 save

# Configurar inicialização automática
sudo -u www-data pm2 startup
# Execute o comando que será exibido

# Verificar status
sudo -u www-data pm2 status
```

## 🔍 7. Verificação

### 7.1 Testes de Funcionamento
```bash
# Teste backend
curl -k https://intranet.cropfield.com.br/api/health

# Teste frontend  
curl -k https://intranet.grupocropfield.com.br

# Verificar logs
sudo -u www-data pm2 logs intranet-backend
```

### 7.2 URLs de Teste
- **Frontend**: https://intranet.grupocropfield.com.br
- **Backend Health**: https://intranet.cropfield.com.br/api/health
- **Login Google**: https://intranet.grupocropfield.com.br/login

## 🔧 8. Google OAuth Setup

### 8.1 Google Cloud Console
1. Acesse: https://console.cloud.google.com/
2. Crie/selecione projeto "Intranet Cropfield"
3. Habilite "Google+ API"
4. Crie credenciais OAuth 2.0:
   - **Origens JavaScript autorizadas**: 
     - `https://intranet.grupocropfield.com.br`
   - **URIs de redirecionamento autorizados**:
     - `https://intranet.cropfield.com.br/auth/google/callback`

### 8.2 Configuração no Servidor
```bash
cd /var/www/intranet
sudo nano .env
# Adicione GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET
sudo -u www-data pm2 restart intranet-backend
```

## 📊 9. Monitoramento

### 9.1 PM2 Commands
```bash
# Status
sudo -u www-data pm2 status

# Logs
sudo -u www-data pm2 logs intranet-backend

# Restart
sudo -u www-data pm2 restart intranet-backend

# Monit
sudo -u www-data pm2 monit
```

### 9.2 Nginx Logs
```bash
# Error logs
sudo tail -f /var/log/nginx/error.log

# Access logs  
sudo tail -f /var/log/nginx/access.log
```

### 9.3 Application Logs
```bash
# PM2 logs
sudo tail -f /var/log/pm2/intranet-backend-out.log
sudo tail -f /var/log/pm2/intranet-backend-error.log

# Custom app logs (if configured)
sudo tail -f /var/log/intranet/app.log
```

## 🔄 10. Updates & Maintenance

### 10.1 Update Application
```bash
# Backend update
cd /var/www/intranet
sudo -u www-data git pull origin main  # or upload new files
sudo -u www-data npm install --production
sudo -u www-data pm2 restart intranet-backend

# Frontend update
npm run build:production
scp -r dist/* ubuntu@servidor:/tmp/frontend-new/
ssh ubuntu@servidor "sudo cp -r /tmp/frontend-new/* /var/www/intranet-frontend/"
```

### 10.2 Database Backup
```bash
# Create backup
sudo -u www-data cp /var/www/intranet/data/database.sqlite /backup/database-$(date +%Y%m%d).sqlite

# Automated backup (add to crontab)
sudo crontab -e
# Add: 0 2 * * * cp /var/www/intranet/data/database.sqlite /backup/database-$(date +\%Y\%m\%d).sqlite
```

### 10.3 SSL Certificate Renewal
```bash
# Check renewal
sudo certbot certificates

# Manual renewal (if needed)
sudo certbot renew

# Auto-renewal is configured via systemd timer
sudo systemctl status snap.certbot.renew.timer
```

## 🚨 11. Troubleshooting

### 11.1 Common Issues

**Backend not starting:**
```bash
sudo -u www-data pm2 logs intranet-backend
cd /var/www/intranet && node server.cjs  # Test directly
```

**Database issues:**
```bash
# Check permissions
ls -la /var/www/intranet/data/
# Reset database (CAUTION: will delete all data)
rm -f /var/www/intranet/data/database.sqlite
sudo -u www-data pm2 restart intranet-backend
```

**Nginx issues:**
```bash
sudo nginx -t  # Test config
sudo systemctl status nginx
sudo tail -f /var/log/nginx/error.log
```

**SSL issues:**
```bash
sudo certbot certificates
openssl s_client -connect intranet.cropfield.com.br:443 -servername intranet.cropfield.com.br
```

### 11.2 Performance Monitoring
```bash
# Server resources
htop
df -h
free -h

# Application monitoring
sudo -u www-data pm2 monit
```

## 🎯 12. Security Checklist

- [ ] SSL certificates installed and valid
- [ ] Firewall configured (UFW)
- [ ] Strong JWT_SECRET configured  
- [ ] Google OAuth properly configured
- [ ] Database file permissions correct (www-data)
- [ ] Nginx security headers enabled
- [ ] Rate limiting configured
- [ ] Regular backups scheduled
- [ ] PM2 logs rotation configured
- [ ] System updates scheduled

## 📞 Support

Para suporte técnico:
- **Logs**: Sempre verifique PM2 e Nginx logs primeiro
- **Health check**: https://intranet.cropfield.com.br/api/health
- **Debug**: https://intranet.cropfield.com.br/api/debug (apenas desenvolvimento)

---

**⚠️ IMPORTANTE**: Teste sempre em ambiente de staging antes de aplicar em produção!