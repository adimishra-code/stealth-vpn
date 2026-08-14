// StealthVPN backend — PM2 ecosystem file.
// Run: pm2 start deploy/ecosystem.config.cjs --env production
//
// Two processes, split responsibilities:
//   stealth-vpn-backend — HTTP API, cluster mode (one worker per CPU), no cron.
//   stealth-vpn-cron    — single fork running all scheduled jobs, no HTTP port.
// Why split: a busy cron or SSH hang used to stall the API (and vice versa).
// Separate workers isolate failure domains and let the API scale to every core
// without each worker firing duplicate emails/SSH polls (old CRON_ENABLED juggling).
const commonEnv = {
  NODE_ENV: 'production',
  PORT: '5000',
  FRONTEND_URL: 'https://your-frontend-domain.com',
  TRUST_PROXY: '1',
  QUOTA_ENFORCE: 'true',
  MONGO_URI: '',
  JWT_ACCESS_SECRET: '',
  JWT_REFRESH_SECRET: '',
  JWT_ACCESS_EXPIRES: '15m',
  JWT_REFRESH_EXPIRES: '30d',
  // JWT-01: ES256 key pairs (base64 DER) from scripts/generate-jwt-keys.js — see backend/.env.example.
  JWT_ACCESS_PUBLIC_KEY: '',
  JWT_ACCESS_PRIVATE_KEY: '',
  JWT_REFRESH_PUBLIC_KEY: '',
  JWT_REFRESH_PRIVATE_KEY: '',
  // CSRF-02: secret signing the double-submit CSRF cookie.
  CSRF_SECRET: '',
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
};

module.exports = {
  apps: [
    {
      name: 'stealth-vpn-backend',
      // Runs as the unprivileged 'stealth' system user (deploy/setup.sh) — never root.
      user: 'stealth',
      cwd: './backend',
      script: 'server.js',
      // script resolves relative to cwd, and cwd is already ./backend,
      // so script is just the entrypoint file (no ./ prefix needed)
      instances: 'max', // one worker per CPU — stateless HTTP, safe to scale
      exec_mode: 'cluster',
      kill_timeout: 10000, // matches the app's graceful shutdown budget (10s)
      max_memory_restart: '512M',
      env: {
        ...commonEnv,
        // The API never runs scheduled jobs; the dedicated cron worker does.
        CRON_ENABLED: 'false',
      },
      out_file: './logs/pm2-out.log',
      error_file: './logs/pm2-error.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'stealth-vpn-cron',
      user: 'stealth',
      cwd: './backend',
      script: 'src/cron.js',
      instances: 1, // exactly one cron worker, ever — duplicates = double emails
      exec_mode: 'fork',
      kill_timeout: 10000,
      max_memory_restart: '512M',
      env: {
        ...commonEnv,
        CRON_ENABLED: 'true',
      },
      out_file: './logs/pm2-cron-out.log',
      error_file: './logs/pm2-cron-error.log',
      merge_logs: true,
      time: true,
    },
  ],
};
