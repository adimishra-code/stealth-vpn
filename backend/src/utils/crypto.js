const crypto = require('crypto');
const env = require('../config/env');

// AES-256-GCM envelope: fresh 12-byte IV per call, tag included. Format:
//   <iv hex>:<ciphertext hex>:<auth tag hex>
function encryptPrivateKey(privateKey) {
  const key = Buffer.from(env.WG_ENCRYPTION_KEY, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(privateKey, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + encrypted.toString('hex') + ':' + tag.toString('hex');
}

// Rotation support (CRYPTO-01): decrypt tries the current key first, then
// WG_ENCRYPTION_KEY_PREVIOUS (set it before rotating WG_ENCRYPTION_KEY, then
// remove it once no device was provisioned under the old key). Without this a
// key change would silently lose every stored WireGuard private key. Writes
// still always use the CURRENT key.
function decryptPrivateKey(stored) {
  const [ivHex, encHex, tagHex] = stored.split(':');
  const keys = [env.WG_ENCRYPTION_KEY];
  if (env.WG_ENCRYPTION_KEY_PREVIOUS) {
    keys.push(env.WG_ENCRYPTION_KEY_PREVIOUS);
  }
  for (const hexKey of keys) {
    try {
      const key = Buffer.from(hexKey, 'hex');
      const iv = Buffer.from(ivHex, 'hex');
      const enc = Buffer.from(encHex, 'hex');
      const tag = Buffer.from(tagHex, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
    } catch (err) {
      // Wrong key → tag verification fails. Try the previous key if any;
      // otherwise rethrow with context.
      if (hexKey === keys[keys.length - 1]) {
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

// SHA-256 digest for high-entropy secrets stored in the DB (verify/reset
// tokens, refresh tokens). The raw value only ever exists in the email link
// and the request body — a DB leak exposes nothing replayable.
function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

module.exports = { encryptPrivateKey, decryptPrivateKey, randomToken, randomUUID, hashToken };
