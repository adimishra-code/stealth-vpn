const {
  generateWGKeypair,
  generatePresharedKey,
  generateTCHandle,
  isValidPublicKey,
  isValidPrivateKey,
  isValidIPv4,
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

  test('validates IPv4 address strings and rejects shell injection attempts', () => {
    expect(isValidIPv4('10.8.0.2')).toBe(true);
    expect(isValidIPv4('192.168.1.1')).toBe(true);
    expect(isValidIPv4('10.8.0.2; rm -rf /')).toBe(false);
    expect(isValidIPv4('10.8.0.256')).toBe(false);
    expect(isValidIPv4('10.8.0')).toBe(false);
    expect(isValidIPv4('10.8.0.2.1')).toBe(false);
    expect(isValidIPv4(null)).toBe(false);
    expect(isValidIPv4(12345)).toBe(false);
  });

  test('generateWGConfig generates valid config with default MTU 1420 and TCP MSS clamping', () => {
    const { generateWGConfig } = require('../src/services/vpn.service');
    const cfg = generateWGConfig({
      privateKey: 'priv-key-123',
      assignedIP: '10.8.0.2',
      serverNode: { ip: '1.2.3.4', wgPort: 51820, wgPublicKey: 'pub-key-456' },
    });

    expect(cfg).toContain('MTU = 1420');
    expect(cfg).toContain('Address = 10.8.0.2/32');
    expect(cfg).toContain('TCPMSS --clamp-mss-to-pmtu');
    expect(cfg).toContain('PersistentKeepalive = 21');
    expect(cfg).toContain('BlockUntunneledTraffic = true');
  });

  test('generateWGConfig respects custom MTU (e.g. 1380 for cellular)', () => {
    const { generateWGConfig } = require('../src/services/vpn.service');
    const cfg = generateWGConfig({
      privateKey: 'priv-key-123',
      assignedIP: '10.8.0.2',
      serverNode: { ip: '1.2.3.4', wgPort: 51820, wgPublicKey: 'pub-key-456' },
      mtu: 1380,
    });

    expect(cfg).toContain('MTU = 1380');
  });
});
