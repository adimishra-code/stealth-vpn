const crypto = require('crypto');
const env = require('../config/env');

// CRYPTO-03: purpose-scoped subkeys via HKDF-SHA256. One master
// WG_ENCRYPTION_KEY serves multiple secret classes (WG keys, Xray UUIDs,
// TOTP secrets) — a distinct subkey per purpose means a leak of one
// ciphertext class can never decrypt another, and the master key never
// touches AES directly.
const CRYPTO_PURPOSES = {
  wg: 'stealthvpn:envelope:wg/v1',
  totp: 'stealthvpn:envelope:totp/v1',
};

function deriveKey(hexKey, purpose) {
  return crypto.hkdfSync('sha256', Buffer.from(hexKey, 'hex'), Buffer.alloc(0), purpose, 32);
}

// AES-256-GCM envelope: fresh 12-byte IV per call, tag included. Format:
//   <iv hex>:<ciphertext hex>:<auth tag hex>
function encryptPrivateKey(privateKey, purpose = CRYPTO_PURPOSES.wg) {
  const key = deriveKey(env.WG_ENCRYPTION_KEY, purpose);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(privateKey, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + encrypted.toString('hex') + ':' + tag.toString('hex');
}

// Rotation support (CRYPTO-01): try the current key first, then
// WG_ENCRYPTION_KEY_PREVIOUS — set it BEFORE rotating WG_ENCRYPTION_KEY and
// remove it once no device was provisioned under the old key. Without this a
// key change would silently lose every stored private key. Writes always
// use the current key.
//
// CRYPTO-03 migration: blobs written BEFORE purpose-scoping used the raw
// master key. Those are tried last so old rows stay decryptable; once
// re-encrypted (any write path), they move to a derived key permanently.
function decryptPrivateKey(stored, purpose = CRYPTO_PURPOSES.wg) {
  const [ivHex, encHex, tagHex] = stored.split(':');
  const attempts = [{ key: deriveKey(env.WG_ENCRYPTION_KEY, purpose), label: 'derived-current' }];
  if (env.WG_ENCRYPTION_KEY_PREVIOUS) {
    attempts.push({ key: deriveKey(env.WG_ENCRYPTION_KEY_PREVIOUS, purpose), label: 'derived-previous' });
  }
  attempts.push({ key: Buffer.from(env.WG_ENCRYPTION_KEY, 'hex'), label: 'legacy-current' });
  if (env.WG_ENCRYPTION_KEY_PREVIOUS) {
    attempts.push({ key: Buffer.from(env.WG_ENCRYPTION_KEY_PREVIOUS, 'hex'), label: 'legacy-previous' });
  }
  for (const attempt of attempts) {
    try {
      const iv = Buffer.from(ivHex, 'hex');
      const enc = Buffer.from(encHex, 'hex');
      const tag = Buffer.from(tagHex, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-gcm', attempt.key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
    } catch (err) {
      // Wrong key → tag verification fails. Try the next candidate key;
      // rethrow with context only after every candidate was exhausted.
      if (attempt === attempts[attempts.length - 1]) {
        throw new Error(`Failed to decrypt WireGuard key (${err.message})`);
      }
    }
  }
  throw new Error('Failed to decrypt WireGuard key');
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function randomUUID() {
  return crypto.randomUUID();
}

// Strict validation for UUID format (RFC 4122). Prevents shell injection
// if UUID origin changes in the future.
function isValidUUID(value) {
  if (typeof value !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

// SHA-256 digest for high-entropy secrets stored in the DB (verify/reset
// tokens, refresh tokens). The raw value only ever exists in the email link
// and the request body — a DB leak exposes nothing replayable.
function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

module.exports = {
  encryptPrivateKey,
  decryptPrivateKey,
  randomToken,
  randomUUID,
  hashToken,
  CRYPTO_PURPOSES,
  isValidUUID,
};
