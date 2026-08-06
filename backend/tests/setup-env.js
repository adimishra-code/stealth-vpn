// Runs before every test file. env.js validates and crashes if any required
// variable is missing, so we must provide realistic dummy values here.
process.env.NODE_ENV = 'test';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/stealthvpn-test';
process.env.JWT_ACCESS_SECRET = 'a'.repeat(64);
process.env.JWT_REFRESH_SECRET = 'b'.repeat(64);
process.env.WG_ENCRYPTION_KEY = 'c'.repeat(64);
process.env.RAZORPAY_KEY_ID = 'rzp_test_dummy';
process.env.RAZORPAY_KEY_SECRET = 'razorpay-secret-dummy';
process.env.RAZORPAY_WEBHOOK_SECRET = 'razorpay-webhook-dummy';
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_dummy';
process.env.SSH_PRIVATE_KEY_PATH = '/tmp/dummy-ssh-key';
process.env.SMTP_HOST = 'smtp.example.com';
process.env.SMTP_PORT = '587';
process.env.SMTP_USER = 'smtp-user';
process.env.SMTP_PASS = 'smtp-pass';
process.env.EMAIL_FROM = 'noreply@stealthvpn.com';
process.env.CRON_ENABLED = 'false';
process.env.TRUST_PROXY = '0';
process.env.QUOTA_ENFORCE = 'true';
