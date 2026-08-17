const fs = require('fs');
const path = require('path');
const os = require('os');
const logger = require('../src/config/logger');
const env = require('../src/config/env');
const { verifySshKeySecurity } = require('../server');

describe('Boot-time SSH Private Key Security Check (verifySshKeySecurity)', () => {
  let tmpKeyPath;
  let warnSpy;
  let infoSpy;
  const originalKeyPath = env.SSH_PRIVATE_KEY_PATH;

  beforeEach(() => {
    warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});
    tmpKeyPath = path.join(os.tmpdir(), `test-key-${Date.now()}`);
    fs.writeFileSync(tmpKeyPath, 'fake-private-key');
  });

  afterEach(() => {
    warnSpy.mockRestore();
    infoSpy.mockRestore();
    env.SSH_PRIVATE_KEY_PATH = originalKeyPath;
    try {
      if (fs.existsSync(tmpKeyPath)) fs.unlinkSync(tmpKeyPath);
    } catch {}
  });

  test('warns when SSH private key file does not exist', () => {
    env.SSH_PRIVATE_KEY_PATH = '/path/to/nonexistent/id_rsa';
    verifySshKeySecurity();
    expect(warnSpy).toHaveBeenCalledWith(
      'SSH private key file not accessible at boot',
      expect.objectContaining({ path: '/path/to/nonexistent/id_rsa' })
    );
  });

  test('warns when SSH private key has insecure permissions (e.g. 0644 or 0777 on non-win32)', () => {
    env.SSH_PRIVATE_KEY_PATH = tmpKeyPath;

    // Mock platform to simulate linux/posix server and statSync to return 0o644 (world-readable)
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

    const statSpy = jest.spyOn(fs, 'statSync').mockReturnValue({
      mode: 0o100644, // regular file with 0644 permissions
    });

    verifySshKeySecurity();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('has insecure permissions (644). Expected 0600.')
    );

    statSpy.mockRestore();
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
  });

  test('passes and logs info when SSH key has secure 0600 permissions', () => {
    env.SSH_PRIVATE_KEY_PATH = tmpKeyPath;

    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

    const statSpy = jest.spyOn(fs, 'statSync').mockReturnValue({
      mode: 0o100600, // regular file with 0600 permissions
    });

    verifySshKeySecurity();

    expect(warnSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith(
      'SSH private key security verified',
      expect.objectContaining({ path: tmpKeyPath })
    );

    statSpy.mockRestore();
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
  });
});
