const Device = require('../src/models/Device');
const User = require('../src/models/User');
const env = require('../src/config/env');
const { encryptPrivateKey, decryptPrivateKey, CRYPTO_PURPOSES } = require('../src/utils/crypto');
const { runKeyRotation } = require('../src/cron/keyRotation.cron');

jest.mock('../src/models/Device');
jest.mock('../src/models/User');

describe('SEC-14: Key rotation cron rotates both Device keys and User TOTP secrets', () => {
  const originalPrevious = env.WG_ENCRYPTION_KEY_PREVIOUS;

  beforeEach(() => {
    jest.clearAllMocks();
    env.WG_ENCRYPTION_KEY_PREVIOUS = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  });

  afterEach(() => {
    env.WG_ENCRYPTION_KEY_PREVIOUS = originalPrevious;
  });

  test('re-encrypts device keys and user totpSecretEnc', async () => {
    const plainWg = 'test-wg-private-key-12345';
    const plainUuid = 'd89849fa-1d89-4089-9a74-9844e4b50302';
    const plainTotp = 'JBSWY3DPEHPK3PXP';

    const encWg = encryptPrivateKey(plainWg, CRYPTO_PURPOSES.wg);
    const encUuid = encryptPrivateKey(plainUuid, CRYPTO_PURPOSES.wg);
    const encTotp = encryptPrivateKey(plainTotp, CRYPTO_PURPOSES.totp);

    // Mock Device.find().select().sort().limit().lean()
    const mockDevice = {
      _id: 'dev101',
      wgPrivateKey: encWg,
      encryptedXrayUUID: encUuid,
    };

    Device.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            lean: jest.fn()
              .mockResolvedValueOnce([mockDevice])
              .mockResolvedValueOnce([]),
          }),
        }),
      }),
    });
    Device.updateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });

    // Mock User.find().select().sort().limit().lean()
    const mockUser = {
      _id: 'user101',
      totpSecretEnc: encTotp,
    };

    User.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            lean: jest.fn()
              .mockResolvedValueOnce([mockUser])
              .mockResolvedValueOnce([]),
          }),
        }),
      }),
    });
    User.updateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });

    await runKeyRotation();

    expect(Device.updateOne).toHaveBeenCalledWith(
      { _id: 'dev101' },
      expect.objectContaining({
        $set: expect.objectContaining({
          wgPrivateKey: expect.stringMatching(/^v1:/),
          encryptedXrayUUID: expect.stringMatching(/^v1:/),
        }),
      })
    );

    expect(User.updateOne).toHaveBeenCalledWith(
      { _id: 'user101' },
      expect.objectContaining({
        $set: expect.objectContaining({
          totpSecretEnc: expect.stringMatching(/^v1:/),
        }),
      })
    );
  });
});
