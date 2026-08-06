const crypto = require('crypto');
const env = require('../config/env');

function encryptPrivateKey(privateKey) {
  const key = Buffer.from(env.WG_ENCRYPTION_KEY, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(privateKey, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + encrypted.toString('hex') + ':' + tag.toString('hex');
}

function decryptPrivateKey(stored) {
  const [ivHex, encHex, tagHex] = stored.split(':');
  const key = Buffer.from(env.WG_ENCRYPTION_KEY, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const enc = Buffer.from(encHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function randomUUID() {
  return crypto.randomUUID();
}

module.exports = { encryptPrivateKey, decryptPrivateKey, randomToken, randomUUID };