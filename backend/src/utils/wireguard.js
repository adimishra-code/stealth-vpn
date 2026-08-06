const { execSync } = require('child_process');
const crypto = require('crypto');
const env = require('../config/env');
const logger = require('../config/logger');

function generateWGKeypair() {
  try {
    const privateKey = execSync('wg genkey').toString().trim();
    const publicKey = execSync(`echo "${privateKey}" | wg pubkey`).toString().trim();
    return { privateKey, publicKey };
  } catch (err) {
    logger.error('WireGuard keygen failed — is wireguard-tools installed?', { error: err.message });
    throw new Error('WireGuard keygen not available on this host');
  }
}

function generatePresharedKey() {
  return execSync('wg genpsk').toString().trim();
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