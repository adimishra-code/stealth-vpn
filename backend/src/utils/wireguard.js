const { execFileSync } = require('child_process');
const crypto = require('crypto');
const logger = require('../config/logger');

function generateWGKeypair() {
  try {
    const privateKey = execFileSync('wg', ['genkey']).toString().trim();
    // Piped through stdin rather than a shell string — the key is base64 and
    // would otherwise be interpolated into a /bin/sh command line.
    const publicKey = execFileSync('wg', ['pubkey'], { input: privateKey }).toString().trim();
    return { privateKey, publicKey };
  } catch (err) {
    logger.error('WireGuard keygen failed — is wireguard-tools installed?', { error: err.message });
    throw new Error('WireGuard keygen not available on this host');
  }
}

function generatePresharedKey() {
  return execFileSync('wg', ['genpsk']).toString().trim();
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