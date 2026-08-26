const crypto = require('crypto');
const { encryptPrivateKey, decryptPrivateKey, CRYPTO_PURPOSES } = require('../src/utils/crypto');
const env = require('../src/config/env');

describe('WG private key encryption (AES-256-GCM at rest)', () => {
  const sampleKeys = [
    '4mZTj+9zXkLq2wVbNcDfGhJkPqRsTuVwXyZ0123456789abcdEFGH=',
    'eIpWx9dS0f1gH2iJ3kL4mN5oP6qR7sT8uV9wX0yZ1aB2cD3=',
    'short-key',
  ];

  test('roundtrips a real-looking key', () => {
    for (const key of sampleKeys) {
      const stored = encryptPrivateKey(key);
      expect(decryptPrivateKey(stored)).toBe(key);
    }
  });

  test('each encryption uses a fresh IV — same plaintext never yields same ciphertext', () => {
    const a = encryptPrivateKey('same-key-value-123');
    const b = encryptPrivateKey('same-key-value-123');
    expect(a).not.toBe(b);
  });

  test('ciphertext is never the plaintext', () => {
    const stored = encryptPrivateKey('secret-wg-key-here');
    expect(stored).not.toContain('secret-wg-key-here');
  });

  test('tampered ciphertext fails to decrypt', () => {
    const stored = encryptPrivateKey('some-valid-wg-private-key-000');
    const raw = stored.startsWith('v1:') ? stored.slice(3) : stored;
    const [iv, enc, tag] = raw.split(':');
    const flipped = (stored.startsWith('v1:') ? 'v1:' : '') + iv.slice(0, -2) + (iv.endsWith('ff') ? '00' : 'ff') + ':' + enc + ':' + tag;
    expect(() => decryptPrivateKey(flipped)).toThrow();
  });

  test('format is v1:iv:ciphertext:tag (hex)', () => {
    const stored = encryptPrivateKey('key-for-format-check');
    expect(stored.startsWith('v1:')).toBe(true);
    const parts = stored.slice(3).split(':');
    expect(parts).toHaveLength(3);
    expect(parts[0]).toMatch(/^[0-9a-f]{24}$/); // 12-byte IV
    expect(parts[2]).toMatch(/^[0-9a-f]{32}$/); // 16-byte GCM tag
  });
});

describe('purpose-scoped HKDF subkeys (CRYPTO-03)', () => {
  test('a blob encrypted under one purpose does not decrypt under another', () => {
    const stored = encryptPrivateKey('totp-secret-value', CRYPTO_PURPOSES.totp);
    expect(() => decryptPrivateKey(stored, CRYPTO_PURPOSES.wg)).toThrow();
    expect(decryptPrivateKey(stored, CRYPTO_PURPOSES.totp)).toBe('totp-secret-value');
  });

  test('legacy raw-key blobs (pre-HKDF) still decrypt via the fallback path', () => {
    // Simulate a row written before purpose-scoping: AES-256-GCM with the
    // raw WG_ENCRYPTION_KEY and no HKDF derivation.
    const key = Buffer.from(env.WG_ENCRYPTION_KEY, 'hex');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update('old-device-key', 'utf8'), cipher.final()]);
    const legacy = iv.toString('hex') + ':' + enc.toString('hex') + ':' + cipher.getAuthTag().toString('hex');

    expect(decryptPrivateKey(legacy)).toBe('old-device-key');
  });

  test('writes after the change use a derived key, not the raw master key', () => {
    const stored = encryptPrivateKey('fresh-wg-key');
    const raw = Buffer.from(env.WG_ENCRYPTION_KEY, 'hex');
    const payload = stored.startsWith('v1:') ? stored.slice(3) : stored;
    const [ivHex, encHex, tagHex] = payload.split(':');
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      raw,
      Buffer.from(ivHex, 'hex')
    );
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    expect(() => Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()])).toThrow();
  });
});
