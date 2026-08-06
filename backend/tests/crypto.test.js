const { encryptPrivateKey, decryptPrivateKey } = require('../src/utils/crypto');
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
    const [iv, enc, tag] = stored.split(':');
    const flipped = iv.slice(0, -2) + (iv.endsWith('ff') ? '00' : 'ff') + ':' + enc + ':' + tag;
    expect(() => decryptPrivateKey(flipped)).toThrow();
  });

  test('format is iv:ciphertext:tag (hex)', () => {
    const stored = encryptPrivateKey('key-for-format-check');
    const parts = stored.split(':');
    expect(parts).toHaveLength(3);
    expect(parts[0]).toMatch(/^[0-9a-f]{24}$/); // 12-byte IV
    expect(parts[2]).toMatch(/^[0-9a-f]{32}$/); // 16-byte GCM tag
  });
});
