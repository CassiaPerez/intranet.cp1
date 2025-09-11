module.exports = {
  apps: [
    {
      name: 'intranet-backend',
      script: './server.cjs',
      cwd: '/var/www/intranet',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: 3006,
        HOST: '0.0.0.0'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3006,
        HOST: '127.0.0.1',
        WEB_URL: 'https://intranet.grupocropfield.com.br',
        JWT_SECRET: process.env.JWT_SECRET || 'CHANGE_THIS_IN_PRODUCTION',
        GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
        GOOGLE_CALLBACK_URL: 'https://intranet.cropfield.com.br/auth/google/callback'
      },
      error_file: '/var/log/pm2/intranet-backend-error.log',
      out_file: '/var/log/pm2/intranet-backend-out.log',
      log_file: '/var/log/pm2/intranet-backend-combined.log',
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_restarts: 10,
      min_uptime: '10s',
      kill_timeout: 5000,
      listen_timeout: 3000,
      shutdown_with_message: true,
      source_map_support: false,
      instance_var: 'INSTANCE_ID'
    }
  ],
  
  deploy: {
    production: {
      user: 'www-data',
      host: 'localhost',
      ref: 'origin/main',
      repo: 'git@github.com:your-repo/intranet.git',
      path: '/var/www/intranet',
      'pre-setup': 'apt update && apt install nodejs npm nginx certbot python3-certbot-nginx -y',
      'post-setup': 'npm install && npm run build',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-deploy': 'git fetch --all'
    }
  }
};