#!/usr/bin/env node
// JWT-01: generate ES256 (ECDSA P-256) key pairs for JWT signing.
//
//   node scripts/generate-jwt-keys.js
//
// Prints four base64-encoded DER keys to paste into .env:
//   JWT_ACCESS_PUBLIC_KEY / JWT_ACCESS_PRIVATE_KEY
//   JWT_REFRESH_PUBLIC_KEY / JWT_REFRESH_PRIVATE_KEY
//
// The PRIVATE keys must go into the control plane's .env ONLY — they are the
// token-signing material. The PUBLIC keys are safe to ship anywhere (they are
// embedded in nothing today, but verification only ever needs them).
// Back up the private keys per docs/BACKUP_KEY_SETUP.md.
//
// Migration: set the four variables, restart, watch the logs for
// 'ES256 enabled'; then delete JWT_ACCESS_SECRET/JWT_REFRESH_SECRET once no
// tokens signed under the old HMAC keys can still arrive (refresh-token
// rotation drains them within the refresh TTL).
const crypto = require('crypto');

function derPair(prefix) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  const priv = privateKey.export({ type: 'pkcs8', format: 'der' });
  const pub = publicKey.export({ type: 'spki', format: 'der' });
  return {
    name: prefix,
    private: priv.toString('base64'),
    public: pub.toString('base64'),
  };
}

const access = derPair('JWT_ACCESS');
const refresh = derPair('JWT_REFRESH');

console.log(`# ES256 key pairs — generated ${new Date().toISOString()}`);
console.log(`# P-256 (prime256v1), DER: PKCS8 (private) / SPKI (public), base64.\n`);
console.log(`JWT_ACCESS_PUBLIC_KEY=${access.public}`);
console.log(`JWT_ACCESS_PRIVATE_KEY=${access.private}\n`);
console.log(`JWT_REFRESH_PUBLIC_KEY=${refresh.public}`);
console.log(`JWT_REFRESH_PRIVATE_KEY=${refresh.private}\n`);
console.log('# Keep the private keys in the control-plane .env. Restart the');
console.log('# backend, verify with: node -e "require(\'./src/utils/jwt\').usingEs256() && console.log(\'ES256 active\')"');
