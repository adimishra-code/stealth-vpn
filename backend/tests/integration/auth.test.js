// Auth integration tests — full HTTP stack (express app, validation, rate
// limiters, cookie handling) with the User model replaced by an in-memory
// store. Covers the register/login/refresh rotation contract, including the
// token-reuse wipeout on the refresh endpoint.
const request = require('supertest');

let mockIdSeq = 1;
const mockUsers = [];

jest.mock('../../src/models/User', () => {
  const findUser = (pred) => mockUsers.find(pred) || null;

  class User {
    constructor(props) {
      Object.assign(this, props);
      this._id = `u${mockIdSeq++}`;
      this.isActive = true;
      this.refreshTokens = [];
      this.activeSessions = [];
      mockUsers.push(this);
    }

    async save() {}

    async comparePassword(password) {
      return this.passwordHash === password;
    }

    static async findOne(query) {
      if (query.email) return findUser((u) => u.email === query.email);
      if (query.emailVerifyToken) return findUser((u) => u.emailVerifyToken === query.emailVerifyToken);
      if (query.passwordResetToken) return findUser((u) => u.passwordResetToken === query.passwordResetToken);
      return null;
    }

    static async findOneAndUpdate(query, update) {
      // SESSION-02: Support JTI-based session queries
      const user = findUser((u) => {
        if (u._id !== query._id) return false;
        if (query['activeSessions.jti']) {
          return (u.activeSessions || []).some((s) => s.jti === query['activeSessions.jti']);
        }
        return (u.refreshTokens || []).includes(query.refreshTokens);
      });
      if (!user) return null;
      if (update.$pull && update.$pull.activeSessions) {
        user.activeSessions = (user.activeSessions || []).filter(
          (s) => s.jti !== update.$pull.activeSessions.jti
        );
      }
      if (update.$pull && update.$pull.refreshTokens) {
        user.refreshTokens = (user.refreshTokens || []).filter((t) => t !== update.$pull.refreshTokens);
      }
      return user;
    }

    static async updateOne(query, update) {
      const user = findUser((u) => u._id === query._id);
      if (!user) return { modifiedCount: 0 };
      // SESSION-02: Handle activeSessions operations
      if (update.$pull && update.$pull.activeSessions) {
        user.activeSessions = (user.activeSessions || []).filter(
          (s) => s.jti !== update.$pull.activeSessions.jti
        );
      }
      if (update.$pull && update.$pull.refreshTokens) {
        user.refreshTokens = (user.refreshTokens || []).filter((t) => t !== update.$pull.refreshTokens);
      }
      if (update.$push && update.$push.activeSessions) {
        user.activeSessions = (user.activeSessions || []);
        const newSessions = update.$push.activeSessions.$each;
        const slice = update.$push.activeSessions.$slice || Infinity;
        user.activeSessions = [...user.activeSessions, ...newSessions].slice(-slice);
      }
      if (update.$push && update.$push.refreshTokens) {
        user.refreshTokens = [
          ...(user.refreshTokens || []),
          ...update.$push.refreshTokens.$each,
        ].slice(-(update.$push.refreshTokens.$slice || Infinity));
      }
      if (update.$set && Array.isArray(update.$set.refreshTokens)) {
        user.refreshTokens = update.$set.refreshTokens;
      }
      if (update.$set && Array.isArray(update.$set.activeSessions)) {
        user.activeSessions = update.$set.activeSessions;
      }
      if (update.$set && Object.prototype.hasOwnProperty.call(update.$set, 'totpEnabled')) {
        user.totpEnabled = update.$set.totpEnabled;
      }
      if (update.$set && Object.prototype.hasOwnProperty.call(update.$set, 'totpSecretEnc')) {
        user.totpSecretEnc = update.$set.totpSecretEnc;
      }
      if (update.$set && Object.prototype.hasOwnProperty.call(update.$set, 'totpFailedAttempts')) {
        user.totpFailedAttempts = update.$set.totpFailedAttempts;
      }
      if (update.$set && Object.prototype.hasOwnProperty.call(update.$set, 'totpLockedUntil')) {
        user.totpLockedUntil = update.$set.totpLockedUntil;
      }
      if (update.$unset) {
        delete user.totpSecretEnc;
      }
      return { modifiedCount: 1 };
    }

    // Query-shaped findById: auth.middleware chains .select() synchronously
    // on the return value (as real mongoose queries do), so this must NOT be
    // async. select() hands back the same object, preserving any mutations.
    static findById(id) {
      const user = findUser((u) => u._id === id);
      if (!user) return null;
      return { ...user, select: () => user };
    }
  }

  return User;
});

const createApp = require('../../src/app');

function refreshCookieOf(res) {
  const cookie = res.headers['set-cookie'][0];
  return cookie.split(';')[0];
}

describe('Auth API (integration)', () => {
  const app = createApp();

  test('register creates an account', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'new@example.com', password: 'super-secret-123' });

    expect(res.status).toBe(201);
    expect(res.body.message).toContain('Check your email');
    expect(mockUsers).toHaveLength(1);
  });

  test('duplicate email is not disclosed (anti-enumeration 201)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'new@example.com', password: 'super-secret-123' });

    // AUTH-01: existing emails get the identical 201 + generic message —
    // no 409 reveals the account, and no second account is created.
    expect(res.status).toBe(201);
    expect(res.body.message).toContain('Check your email');
    expect(mockUsers).toHaveLength(1);
  });

  test('unverified account cannot log in', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'new@example.com', password: 'super-secret-123' });

    // Anti-enumeration: indistinguishable from a wrong-password attempt —
    // same 401, same message — so the response never confirms the email
    // exists or that the password was correct.
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  test('wrong password returns 401', async () => {
    const User = require('../../src/models/User');
    mockUsers.push(new User({ email: 'verified@example.com', emailVerified: true, passwordHash: 'right-password' }));

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'verified@example.com', password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  test('login issues access token and sets refresh cookie', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'verified@example.com', password: 'right-password' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.email).toBe('verified@example.com');
    expect(res.headers['set-cookie'][0]).toContain('sv_refresh=');
  });

  test('refresh rotates the token; replaying the old one wipes all sessions', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'verified@example.com', password: 'right-password' });

    const oldRefreshCookie = refreshCookieOf(loginRes);

    const rotated = await request(app).post('/api/auth/refresh').set('Cookie', oldRefreshCookie);
    expect(rotated.status).toBe(200);
    expect(rotated.body.accessToken).toBeTruthy();
    const newRefreshCookie = refreshCookieOf(rotated);

    // Replaying the already-consumed token is a theft signal: 401 + all sessions dropped.
    const replay = await request(app).post('/api/auth/refresh').set('Cookie', oldRefreshCookie);
    expect(replay.status).toBe(401);
    expect(replay.body.error).toBe('Refresh token revoked');

    // The freshly rotated token is also dead now — everything was revoked.
    const afterWipeout = await request(app).post('/api/auth/refresh').set('Cookie', newRefreshCookie);
    expect(afterWipeout.status).toBe(401);
  });
});

describe('Sessions (SESSION-01)', () => {
  const app = createApp();
  const { signAccessToken } = require('../../src/utils/jwt');

  test('logout-all revokes every session and clears the refresh cookie', async () => {
    const User = require('../../src/models/User');
    mockUsers.push(new User({
      email: 'sessions@example.com',
      emailVerified: true,
      isActive: true,
      passwordHash: 'right-password',
    }));

    const login = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '10.0.2.1')
      .send({ email: 'sessions@example.com', password: 'right-password' });
    expect(login.status).toBe(200);
    const cookie = refreshCookieOf(login);

    const user = mockUsers.find((u) => u.email === 'sessions@example.com');
    const res = await request(app)
      .delete('/api/auth/sessions')
      .set('X-Forwarded-For', '10.0.2.2')
      .set('Authorization', `Bearer ${signAccessToken(user)}`)
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.sessionsRevoked).toBe(true);
    const setCookies = res.headers['set-cookie'] || [];
    expect(setCookies.some((c) => c.startsWith('sv_refresh=;'))).toBe(true);

    // The old cookie is dead — refresh can no longer rotate it.
    const replay = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(replay.status).toBe(401);
  });
});

describe('TOTP (ADMIN-01)', () => {
  const app = createApp();
  const { authenticator } = require('otplib');
  const { encryptPrivateKey, CRYPTO_PURPOSES } = require('../../src/utils/crypto');
  const User = require('../../src/models/User');

  test('admin with 2FA: password alone gets 401 "code required"', async () => {
    const secret = authenticator.generateSecret();
    mockUsers.push(new User({
      email: 'admin-totp@example.com',
      role: 'admin',
      emailVerified: true,
      isActive: true,
      passwordHash: 'admin-password',
      totpEnabled: true,
      totpSecretEnc: encryptPrivateKey(secret, CRYPTO_PURPOSES.totp),
    }));

    const res = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '10.0.0.1')
      .send({ email: 'admin-totp@example.com', password: 'admin-password' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Two-factor code required');
  });

  test('admin with 2FA: wrong code is rejected', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '10.0.0.2')
      .send({ email: 'admin-totp@example.com', password: 'admin-password', totpCode: '000000' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid two-factor code');
  });

  test('admin with 2FA: correct code logs in', async () => {
    const admin = mockUsers.find((u) => u.email === 'admin-totp@example.com');
    const code = authenticator.generate(decrypt(admin.totpSecretEnc));

    const res = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '10.0.0.3')
      .send({ email: 'admin-totp@example.com', password: 'admin-password', totpCode: code });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.totpEnabled).toBe(true);
  });

  test('setup → verify round trip enables 2FA; disable requires a code', async () => {
    const { signAccessToken } = require('../../src/utils/jwt');
    const admin = mockUsers.find((u) => u.email === 'admin-totp@example.com');
    const token = signAccessToken(admin);

    const setup = await request(app).post('/api/auth/totp/setup').set('Authorization', `Bearer ${token}`);
    expect(setup.status).toBe(200);
    expect(setup.body.secret).toBeTruthy();
    expect(setup.body.otpauth).toContain('otpauth://');

    const code = authenticator.generate(setup.body.secret);
    const verify = await request(app)
      .post('/api/auth/totp/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({ totpCode: code });
    expect(verify.status).toBe(200);
    expect(verify.body.totpEnabled).toBe(true);

    const badDisable = await request(app)
      .post('/api/auth/totp/disable')
      .set('Authorization', `Bearer ${token}`)
      .send({ totpCode: '000000' });
    expect(badDisable.status).toBe(400);

    const disable = await request(app)
      .post('/api/auth/totp/disable')
      .set('Authorization', `Bearer ${token}`)
      .send({ totpCode: authenticator.generate(setup.body.secret) });
    expect(disable.status).toBe(200);
    expect(disable.body.totpEnabled).toBe(false);
  });
});

function decrypt(enc) {
  // eslint-disable-next-line global-require
  const { decryptPrivateKey, CRYPTO_PURPOSES } = require('../../src/utils/crypto');
  return decryptPrivateKey(enc, CRYPTO_PURPOSES.totp);
}