const nodemailer = require('nodemailer');
const env = require('../config/env');
const logger = require('../config/logger');

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  connectionTimeout: 10 * 1000,
  greetingTimeout: 10 * 1000,
  socketTimeout: 15 * 1000,
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
});

function wrapTemplate(innerHtml, title) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f7fa; margin: 0; padding: 24px; }
    .container { max-width: 560px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 32px; }
    h1 { color: #0a0e27; font-size: 22px; margin: 0 0 16px; }
    p { color: #4a5568; line-height: 1.6; font-size: 15px; }
    .btn { display: inline-block; background: #4f46e5; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0; }
    .code { font-family: 'Courier New', monospace; font-size: 24px; letter-spacing: 4px; background: #f1f5f9; padding: 12px 16px; border-radius: 6px; text-align: center; margin: 16px 0; }
    .footer { color: #94a3b8; font-size: 12px; margin-top: 24px; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    ${innerHtml}
    <div class="footer">StealthVPN — Encrypted, cloaked, unrestricted.<br>You received this email because you signed up at ${env.EMAIL_FROM.replace(/.*@/, '')}.</div>
  </div>
</body>
</html>`;
}

async function sendVerifyEmail(user, verifyToken) {
  const verifyUrl = `${env.FRONTEND_URL}/verify-email?token=${verifyToken}`;
  const html = wrapTemplate(`
    <h1>Verify your email</h1>
    <p>Welcome to StealthVPN. Click the button below to confirm your email address.</p>
    <a href="${verifyUrl}" class="btn">Verify email</a>
    <p>Or paste this link in your browser:</p>
    <p style="font-size: 13px; color: #4f46e5; word-break: break-all;">${verifyUrl}</p>
    <p>This link expires in 24 hours. If you didn't create this account, you can safely ignore this email.</p>
  `, 'Verify your email');

  await transporter.sendMail({
    from: env.EMAIL_FROM,
    to: user.email,
    subject: 'StealthVPN — Verify your email',
    html,
  });
  logger.info('Verification email sent', { userId: user._id.toString(), email: user.email });
}

async function sendPasswordResetEmail(user, resetToken) {
  const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${resetToken}`;
  const html = wrapTemplate(`
    <h1>Reset your password</h1>
    <p>We received a request to reset your StealthVPN password.</p>
    <a href="${resetUrl}" class="btn">Reset password</a>
    <p>Or paste this link in your browser:</p>
    <p style="font-size: 13px; color: #4f46e5; word-break: break-all;">${resetUrl}</p>
    <p>This link expires in 1 hour. If you didn't request a reset, ignore this email — your password stays unchanged.</p>
  `, 'Reset your password');

  await transporter.sendMail({
    from: env.EMAIL_FROM,
    to: user.email,
    subject: 'StealthVPN — Password reset',
    html,
  });
  logger.info('Password reset email sent', { userId: user._id.toString(), email: user.email });
}

async function sendRenewalWarningEmail(user, daysLeft) {
  const html = wrapTemplate(`
    <h1>Your subscription expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}</h1>
    <p>Your StealthVPN ${user.plan.toUpperCase()} plan expires on ${new Date(user.planExpiresAt).toDateString()}.</p>
    <p>Renew now to keep your VPN running without interruption.</p>
    <a href="${env.FRONTEND_URL}/billing" class="btn">Renew subscription</a>
  `, 'Subscription expiring soon');

  await transporter.sendMail({
    from: env.EMAIL_FROM,
    to: user.email,
    subject: `StealthVPN — Your plan expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
    html,
  });
}

async function sendExpiredEmail(user) {
  const html = wrapTemplate(`
    <h1>Your StealthVPN subscription has expired</h1>
    <p>Your ${user.plan.toUpperCase()} plan expired. All your devices have been deprovisioned.</p>
    <p>Resubscribe anytime to get your VPN back up.</p>
    <a href="${env.FRONTEND_URL}/billing" class="btn">Resubscribe</a>
  `, 'Subscription expired');

  await transporter.sendMail({
    from: env.EMAIL_FROM,
    to: user.email,
    subject: 'StealthVPN — Subscription expired',
    html,
  });
}

async function sendPaymentFailedEmail(user) {
  const html = wrapTemplate(`
    <h1>Payment failed</h1>
    <p>Your last payment didn't go through. No charges have been made.</p>
    <a href="${env.FRONTEND_URL}/billing" class="btn">Try again</a>
  `, 'Payment failed');

  await transporter.sendMail({
    from: env.EMAIL_FROM,
    to: user.email,
    subject: 'StealthVPN — Payment failed',
    html,
  });
}

// SEC-01: Never inline private keys, .conf payloads, or secret VLESS links into
// email bodies. Email travels unencrypted over cleartext SMTP relays and is
// subject to DPI inspection. The email only notifies the user that their device
// is ready and directs them to log into the authenticated web dashboard.
async function sendConfigEmail(user, device) {
  const safeName = String(device.deviceName || 'Device').replace(/[<>&"']/g, (c) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
  const subject = `StealthVPN — ${safeName} ready`;
  const dashboardUrl = `${env.FRONTEND_URL}/dashboard`;
  const html = wrapTemplate(`
    <h1>Your VPN device is ready</h1>
    <p>Your device <strong>${safeName}</strong> on node <strong>${device.serverNode}</strong> is provisioned and active.</p>
    <p>For your security, cryptographic keys and connection credentials are <strong>never sent via email</strong>.</p>
    <p style="margin:24px 0;">
      <a href="${dashboardUrl}" style="background:#2563eb;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">
        Open Dashboard to Connect
      </a>
    </p>
    <p style="font-size:13px;color:#64748b;">
      Log in to your authenticated dashboard to download your WireGuard configuration file, copy your VLESS URI, or scan your connection QR code.
    </p>
  `, subject);

  await transporter.sendMail({
    from: env.EMAIL_FROM,
    to: user.email,
    subject,
    html,
  });
  logger.info('Config ready notification email sent', { userId: user._id.toString(), deviceId: device._id.toString() });
}

module.exports = {
  transporter,
  sendVerifyEmail,
  sendPasswordResetEmail,
  sendRenewalWarningEmail,
  sendExpiredEmail,
  sendPaymentFailedEmail,
  sendConfigEmail,
};