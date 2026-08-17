const {
  generateWGKeypair,
  generatePresharedKey,
  generateTCHandle,
  isValidPublicKey,
  isValidPrivateKey,
} = require('../src/utils/wireguard');

describe('WireGuard utilities & Curve25519 key generation', () => {
  test('generates valid base64 32-byte WireGuard keypairs', () => {
    const { privateKey, publicKey } = generateWGKeypair();
    expect(typeof privateKey).toBe('string');
    expect(typeof publicKey).toBe('string');
    expect(isValidPrivateKey(privateKey)).toBe(true);
    expect(isValidPublicKey(publicKey)).toBe(true);
  });

  test('generates valid preshared keys', () => {
    const psk = generatePresharedKey();
    expect(typeof psk).toBe('string');
    expect(isValidPublicKey(psk)).toBe(true);
  });

  test('generates distinct TC handles in hex', () => {
    const handle1 = generateTCHandle();
    const handle2 = generateTCHandle();
    expect(typeof handle1).toBe('string');
    expect(handle1).toMatch(/^[0-9a-f]+$/);
    expect(handle1.length).toBeGreaterThanOrEqual(2);
  });

  test('validates valid and invalid WireGuard keys', () => {
    expect(isValidPublicKey('invalid-key')).toBe(false);
    expect(isValidPrivateKey('invalid-key')).toBe(false);
    const valid = '4mZTj+9zXkLq2wVbNcDfGhJkPqRsTuVwXyZ01234567=';
    expect(isValidPublicKey(valid)).toBe(true);
  });
});
