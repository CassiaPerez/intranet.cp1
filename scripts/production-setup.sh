#!/bin/bash

# Production Setup Script for Intranet Cropfield
# Run this on the server after copying files

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🚀 Intranet Cropfield - Production Setup${NC}"
echo "================================================="

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}❌ This script must be run as root${NC}" 
   exit 1
fi

# Configuration
BACKEND_DIR="/var/www/intranet"
FRONTEND_DIR="/var/www/intranet-frontend"
LOG_DIR="/var/log/intranet"
USER="www-data"
GROUP="www-data"

echo -e "${YELLOW}📋 Configuration:${NC}"
echo "Backend: $BACKEND_DIR"
echo "Frontend: $FRONTEND_DIR"
echo "Logs: $LOG_DIR"
echo "User/Group: $USER:$GROUP"
echo ""

# Create necessary directories
echo -e "${YELLOW}📁 Creating directories...${NC}"
mkdir -p $BACKEND_DIR/{data,logs}
mkdir -p $FRONTEND_DIR
mkdir -p $LOG_DIR
mkdir -p /var/log/pm2
mkdir -p /etc/nginx/sites-available
mkdir -p /etc/nginx/sites-enabled

# Set ownership and permissions
echo -e "${YELLOW}🔐 Setting permissions...${NC}"
chown -R $USER:$GROUP $BACKEND_DIR
chown -R $USER:$GROUP $FRONTEND_DIR
chown -R $USER:$GROUP $LOG_DIR
chmod -R 755 $BACKEND_DIR
chmod -R 755 $FRONTEND_DIR
chmod -R 755 $LOG_DIR

# Ensure database directory has correct permissions
chown -R $USER:$GROUP $BACKEND_DIR/data
chmod 755 $BACKEND_DIR/data

echo -e "${GREEN}✅ Directories and permissions configured${NC}"

# Install dependencies if package.json exists
if [ -f "$BACKEND_DIR/package.json" ]; then
    echo -e "${YELLOW}📦 Installing production dependencies...${NC}"
    cd $BACKEND_DIR
    sudo -u $USER npm install --production --silent
    echo -e "${GREEN}✅ Dependencies installed${NC}"
else
    echo -e "${YELLOW}⚠️  package.json not found in $BACKEND_DIR${NC}"
    echo "Make sure to copy your application files first!"
fi

# Create systemd service file for PM2
echo -e "${YELLOW}⚙️  Configuring systemd service...${NC}"
cat > /etc/systemd/system/intranet-pm2.service << 'EOF'
[Unit]
Description=PM2 process manager for Intranet Cropfield
Documentation=https://pm2.keymetrics.io/
After=network.target

[Service]
Type=forking
User=www-data
LimitNOFILE=infinity
LimitNPROC=infinity
LimitCORE=infinity
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=PM2_HOME=/var/www/.pm2
ExecStart=/usr/bin/pm2 resurrect
ExecReload=/usr/bin/pm2 reload all
ExecStop=/usr/bin/pm2 kill
Restart=always

[Install]
WantedBy=multi-user.target
EOF

systemctl enable intranet-pm2
echo -e "${GREEN}✅ Systemd service configured${NC}"

# Create log rotation for application
echo -e "${YELLOW}📝 Configuring log rotation...${NC}"
cat > /etc/logrotate.d/intranet << 'EOF'
/var/log/intranet/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0644 www-data www-data
    postrotate
        /bin/kill -USR1 $(cat /var/run/nginx.pid 2>/dev/null) 2>/dev/null || true
    endscript
}

/var/log/pm2/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    create 0644 www-data www-data
}
EOF

echo -e "${GREEN}✅ Log rotation configured${NC}"

# UFW Firewall basic setup
echo -e "${YELLOW}🔥 Configuring firewall...${NC}"
ufw --force enable
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 'Nginx Full'
echo -e "${GREEN}✅ Firewall configured${NC}"

# Final instructions
echo ""
echo -e "${GREEN}🎉 Production setup complete!${NC}"
echo ""
echo -e "${BLUE}📋 Next Steps:${NC}"
echo "1. Copy your .env file and configure:"
echo "   sudo cp $BACKEND_DIR/.env.production $BACKEND_DIR/.env"
echo "   sudo nano $BACKEND_DIR/.env"
echo ""
echo "2. Configure Nginx:"
echo "   sudo cp $BACKEND_DIR/nginx.conf /etc/nginx/sites-available/intranet-cropfield"
echo "   sudo ln -sf /etc/nginx/sites-available/intranet-cropfield /etc/nginx/sites-enabled/"
echo "   sudo nginx -t && sudo systemctl reload nginx"
echo ""
echo "3. Setup SSL certificates:"
echo "   sudo certbot --nginx -d intranet.cropfield.com.br"
echo "   sudo certbot --nginx -d intranet.grupocropfield.com.br"
echo ""
echo "4. Start application:"
echo "   cd $BACKEND_DIR"
echo "   sudo -u www-data pm2 start ecosystem.config.js --env production"
echo "   sudo -u www-data pm2 save"
echo "   sudo systemctl start intranet-pm2"
echo ""
echo "5. Test deployment:"
echo "   curl -k https://intranet.cropfield.com.br/api/health"
echo "   curl -k https://intranet.grupocropfield.com.br"
echo ""
echo -e "${GREEN}✨ Access your intranet at: https://intranet.grupocropfield.com.br${NC}"