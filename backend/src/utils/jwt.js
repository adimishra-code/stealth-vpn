const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../config/env');

// JWT-01: ES256 via per-type ECDSA P-256 key pairs (base64 DER in env). If the
// private key for a type is present we sign ES256 and verify against the
// public key — asymmetric means verification only needs a public key, and an
// attacker holding one signing key still cannot forge the other token type.
// Without the keys we fall back to the shared HMAC secret (legacy mode) so
// existing deployments rotate at their own pace.

// jsonwebtoken only treats STRINGS as potential asymmetric keys; DER buffers
// are always read as symmetric. Convert once at load (this also validates the
// keys — a broken pair crashes at boot, not on the first login).
function derToPem(b64, kind) {
  const der = Buffer.from(b64, 'base64');
  const keyObject =
    kind === 'private'
      ? crypto.createPrivateKey({ key: der, format: 'der', type: 'pkcs8' })
      : crypto.createPublicKey({ key: der, format: 'der', type: 'spki' });
  return keyObject
    .export({ type: kind === 'private' ? 'pkcs8' : 'spki', format: 'pem' })
    .toString();
}

const ACCESS_PRIVATE_PEM = env.JWT_ACCESS_PRIVATE_KEY
  ? derToPem(env.JWT_ACCESS_PRIVATE_KEY, 'private')
  : null;
const ACCESS_PUBLIC_PEM = env.JWT_ACCESS_PUBLIC_KEY
  ? derToPem(env.JWT_ACCESS_PUBLIC_KEY, 'public')
  : null;
const REFRESH_PRIVATE_PEM = env.JWT_REFRESH_PRIVATE_KEY
  ? derToPem(env.JWT_REFRESH_PRIVATE_KEY, 'private')
  : null;
const REFRESH_PUBLIC_PEM = env.JWT_REFRESH_PUBLIC_KEY
  ? derToPem(env.JWT_REFRESH_PUBLIC_KEY, 'public')
  : null;

function signAccessToken(user) {
  const payload = { sub: user._id.toString(), role: user.role, email: user.email };
  if (ACCESS_PRIVATE_PEM) {
    return jwt.sign(payload, ACCESS_PRIVATE_PEM, {
      algorithm: 'ES256',
      expiresIn: env.JWT_ACCESS_EXPIRES,
    });
  }
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES,
  });
}

function signRefreshToken(user) {
  // jti makes every issued token distinct. Without it two sign() calls in the
  // same second produce identical strings, so rotation never invalidates the
  // old token and a stolen one stays replayable.
  const payload = { sub: user._id.toString(), type: 'refresh', jti: crypto.randomUUID() };
  if (REFRESH_PRIVATE_PEM) {
    return jwt.sign(payload, REFRESH_PRIVATE_PEM, {
      algorithm: 'ES256',
      expiresIn: env.JWT_REFRESH_EXPIRES,
    });
  }
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES,
  });
}

// Only the digest is persisted, so a leaked database dump cannot be replayed
// against the refresh endpoint.
function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// algorithms is pinned per key mode: an HMAC secret must never verify an ES256
// token (alg-confusion) and an EC key must never verify a symmetric one.
function verifyAccessToken(token) {
  if (ACCESS_PUBLIC_PEM) {
    return jwt.verify(token, ACCESS_PUBLIC_PEM, {
      algorithms: ['ES256'],
    });
  }
  return jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
}

function verifyRefreshToken(token) {
  if (REFRESH_PUBLIC_PEM) {
    return jwt.verify(token, REFRESH_PUBLIC_PEM, {
      algorithms: ['ES256'],
    });
  }
  return jwt.verify(token, env.JWT_REFRESH_SECRET, { algorithms: ['HS256'] });
}

// True when at least one token type uses ES256 (diagnostics/ops visibility).
function usingEs256() {
  return !!(ACCESS_PRIVATE_PEM || REFRESH_PRIVATE_PEM);
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  hashRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  usingEs256,
};
