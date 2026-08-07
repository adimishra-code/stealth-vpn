const { buildVlessUri } = require('../src/services/xray.service');

const serverNode = { name: 'mumbai', ip: '203.0.113.10', xrayPort: 443 };

describe('buildVlessUri (stealth-mode client URI)', () => {
  test('produces a well-formed vless:// URI with Reality params', () => {
    const uri = buildVlessUri({
      serverNode,
      uuid: '3f2b9c1e-8a5d-4b7f-9c2e-1d0a6b8f4e3d',
      deviceName: 'My Phone',
      nodeKeys: { realityPublicKey: 'REALITY_PUB_ABCD', realityShortId: 'a1b2c3d4e5f60718' },
    });

    expect(uri.startsWith('vless://')).toBe(true);
    expect(uri).toContain('@203.0.113.10:443');
    expect(uri).toContain('encryption=none');
    expect(uri).toContain('security=reality');
    expect(uri).toContain('sni=microsoft.com');
    expect(uri).toContain('fp=chrome');
    expect(uri).toContain('pbk=REALITY_PUB_ABCD');
    expect(uri).toContain('sid=a1b2c3d4e5f60718');
    expect(uri).toContain('#StealthVPN-My%20Phone');
  });

  test('falls back to default SNI when nodeKeys are missing (unconfigured node)', () => {
    const uri = buildVlessUri({
      serverNode,
      uuid: '3f2b9c1e-8a5d-4b7f-9c2e-1d0a6b8f4e3d',
      deviceName: 'Phone',
      nodeKeys: { realityPublicKey: null, realityShortId: null },
    });
    expect(uri).toContain('sni=microsoft.com');
    expect(uri).not.toContain('pbk=');
    expect(uri).not.toContain('sid=');
  });

  test('respects a non-standard xray port', () => {
    const uri = buildVlessUri({
      serverNode: { ...serverNode, xrayPort: 8443 },
      uuid: '3f2b9c1e-8a5d-4b7f-9c2e-1d0a6b8f4e3d',
      deviceName: 'Phone',
      nodeKeys: { realityPublicKey: 'K', realityShortId: 'S' },
    });
    expect(uri).toContain('@203.0.113.10:8443');
  });

  test('URL-encodes unusual device names in the fragment', () => {
    const uri = buildVlessUri({
      serverNode,
      uuid: '3f2b9c1e-8a5d-4b7f-9c2e-1d0a6b8f4e3d',
      deviceName: 'Pixel 8 & Fold',
      nodeKeys: { realityPublicKey: 'K', realityShortId: 'S' },
    });
    expect(uri).toContain('#StealthVPN-Pixel%208%20%26%20Fold');
  });
});
