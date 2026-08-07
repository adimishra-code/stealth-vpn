// StealthVPN backend — PM2 ecosystem file.
// Run: pm2 start deploy/ecosystem.config.cjs --env production
module.exports = {
  apps: [
    {
      name: 'stealth-vpn-backend',
      // Runs as the unprivileged 'stealth' system user (created by
      // deploy/setup.sh) — never root.
      user: 'stealth',
      cwd: './backend',
      script: 'src/server.js',
      instances: 1, // single instance — cron jobs must not duplicate
      exec_mode: 'fork',
      kill_timeout: 10000, // matches the app's graceful shutdown budget (10s)
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: '5000',
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: '5000',
        FRONTEND_URL: 'https://your-frontend-domain.com',
        CRON_ENABLED: 'true',
        TRUST_PROXY: '1',
        QUOTA_ENFORCE: 'true',
        MONGO_URI: '',
        JWT_ACCESS_SECRET: '',
        JWT_REFRESH_SECRET: '',
        JWT_ACCESS_EXPIRES: '15m',
        JWT_REFRESH_EXPIRES: '30d',
        // JWT-01: ES256 key pairs (base64 DER) — see backend/.env.example.
        // Private keys from scripts/generate-jwt-keys.js.
        JWT_ACCESS_PUBLIC_KEY: '',
        JWT_ACCESS_PRIVATE_KEY: '',
        JWT_REFRESH_PUBLIC_KEY: '',
        JWT_REFRESH_PRIVATE_KEY: '',
        WG_ENCRYPTION_KEY: '',
        RAZORPAY_KEY_ID: '',
        RAZORPAY_KEY_SECRET: '',
        RAZORPAY_WEBHOOK_SECRET: '',
        STRIPE_SECRET_KEY: '',
        STRIPE_WEBHOOK_SECRET: '',
        SSH_PRIVATE_KEY_PATH: '',
        SMTP_HOST: '',
        SMTP_PORT: '587',
        SMTP_USER: '',
        SMTP_PASS: '',
        EMAIL_FROM: '',
        ALERT_EMAIL_TO: '',
        ALERT_WEBHOOK_URL: '',
        ALERT_COOLDOWN_MINUTES: '5',
        NODE_MUMBAI_IP: '',
        NODE_MUMBAI_WG_PUBLIC_KEY: '',
        NODE_MUMBAI_REALITY_PUBLIC_KEY: '',
        NODE_MUMBAI_REALITY_SHORT_ID: '',
        NODE_FRANKFURT_IP: '',
        NODE_FRANKFURT_WG_PUBLIC_KEY: '',
        NODE_FRANKFURT_REALITY_PUBLIC_KEY: '',
        NODE_FRANKFURT_REALITY_SHORT_ID: '',
        XRAY_API_URL: 'http://127.0.0.1:10085',
        XRAY_SNI_DEST: 'microsoft.com',
      },
      out_file: './logs/pm2-out.log',
      error_file: './logs/pm2-error.log',
      merge_logs: true,
      time: true,
    },
  ],
};
