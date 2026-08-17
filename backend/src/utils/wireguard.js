const { execFileSync } = require('child_process');
const crypto = require('crypto');
const logger = require('../config/logger');

function generateWGKeypairNative() {
  const privateBytes = crypto.randomBytes(32);
  // Curve25519 standard bit clamping
  privateBytes[0] &= 248;
  privateBytes[31] &= 127;
  privateBytes[31] |= 64;
  const privateKey = privateBytes.toString('base64');

  // RFC 8410 / PKCS#8 DER header for X25519: 302e020100300506032b656e04220420 (16 bytes) + 32-byte raw key
  const derPrefix = Buffer.from('302e020100300506032b656e04220420', 'hex');
  const der = Buffer.concat([derPrefix, privateBytes]);
  const privKeyObj = crypto.createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
  const pubKeyObj = crypto.createPublicKey(privKeyObj);
  const pubDer = pubKeyObj.export({ format: 'der', type: 'spki' });
  const publicKey = pubDer.subarray(12).toString('base64');
  return { privateKey, publicKey };
}

function generateWGKeypair() {
  try {
    const privateKey = execFileSync('wg', ['genkey']).toString().trim();
    // Piped through stdin rather than a shell string — the key is base64 and
    // would otherwise be interpolated into a /bin/sh command line.
    const publicKey = execFileSync('wg', ['pubkey'], { input: privateKey }).toString().trim();
    return { privateKey, publicKey };
  } catch (err) {
    logger.debug('wg CLI not found — using native Node.js X25519 keypair generation', { error: err.message });
    try {
      return generateWGKeypairNative();
    } catch (fallbackErr) {
      logger.error('WireGuard keygen failed', { error: fallbackErr.message });
      throw new Error('WireGuard keygen not available on this host');
    }
  }
}

function generatePresharedKey() {
  try {
    return execFileSync('wg', ['genpsk']).toString().trim();
  } catch {
    return crypto.randomBytes(32).toString('base64');
  }
}

function generateTCHandle() {
  const rand = crypto.randomInt(0x100, 0xFFF0);
  return rand.toString(16);
}

function isValidPublicKey(key) {
  return /^[A-Za-z0-9+/]{43}=$/.test(key);
}

function isValidPrivateKey(key) {
  return /^[A-Za-z0-9+/]{42}[AIEOaieoAEIO=]=$/.test(key) || /^[A-Za-z0-9+/]{43}=$/.test(key);
}

module.exports = {
  generateWGKeypair,
  generatePresharedKey,
  generateTCHandle,
  isValidPublicKey,
  isValidPrivateKey,
};