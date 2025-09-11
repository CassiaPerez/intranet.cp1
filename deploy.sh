#!/bin/bash

# Deploy Script for Intranet Cropfield
# Run this script on the Ubuntu server as root or with sudo

set -e

echo "🚀 Starting Intranet Cropfield deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BACKEND_DIR="/var/www/intranet"
FRONTEND_DIR="/var/www/intranet-frontend"
NGINX_SITE="intranet-cropfield"
PM2_APP="intranet-backend"

echo -e "${BLUE}📋 Configuration:${NC}"
echo "Backend directory: $BACKEND_DIR"
echo "Frontend directory: $FRONTEND_DIR"
echo "Nginx site: $NGINX_SITE"
echo "PM2 app: $PM2_APP"
echo ""

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Install system dependencies
echo -e "${YELLOW}📦 Installing system dependencies...${NC}"
apt update
apt install -y nginx certbot python3-certbot-nginx curl git

# Install Node.js (if not installed)
if ! command_exists node; then
    echo -e "${YELLOW}📦 Installing Node.js...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt install -y nodejs
else
    echo -e "${GREEN}✅ Node.js already installed:$(NC} $(node --version)"
fi

# Install PM2 globally (if not installed)
if ! command_exists pm2; then
    echo -e "${YELLOW}📦 Installing PM2...${NC}"
    npm install -g pm2
    pm2 install pm2-logrotate
else
    echo -e "${GREEN}✅ PM2 already installed:${NC} $(pm2 --version)"
fi

# Create directories
echo -e "${YELLOW}📁 Creating directories...${NC}"
mkdir -p $BACKEND_DIR
mkdir -p $FRONTEND_DIR
mkdir -p /var/log/intranet
mkdir -p /var/log/pm2

# Set permissions
chown -R www-data:www-data $BACKEND_DIR
chown -R www-data:www-data $FRONTEND_DIR
chmod -R 755 $BACKEND_DIR
chmod -R 755 $FRONTEND_DIR

echo -e "${BLUE}📝 Next steps:${NC}"
echo "1. Copy your application files to:"
echo "   Backend: $BACKEND_DIR"
echo "   Frontend build: $FRONTEND_DIR"
echo ""
echo "2. Configure environment:"
echo "   cp $BACKEND_DIR/.env.production $BACKEND_DIR/.env"
echo "   Edit $BACKEND_DIR/.env with your actual values"
echo ""
echo "3. Install dependencies:"
echo "   cd $BACKEND_DIR && npm install --production"
echo ""
echo "4. Setup SSL certificates:"
echo "   certbot --nginx -d intranet.cropfield.com.br"
echo "   certbot --nginx -d intranet.grupocropfield.com.br"
echo ""
echo "5. Configure Nginx:"
echo "   cp $BACKEND_DIR/nginx.conf /etc/nginx/sites-available/$NGINX_SITE"
echo "   ln -s /etc/nginx/sites-available/$NGINX_SITE /etc/nginx/sites-enabled/"
echo "   nginx -t && systemctl reload nginx"
echo ""
echo "6. Start application:"
echo "   cd $BACKEND_DIR && pm2 start ecosystem.config.js --env production"
echo "   pm2 save && pm2 startup"
echo ""
echo -e "${GREEN}🎉 Deployment preparation complete!${NC}"