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
      this.recentRotations = [];
      mockUsers.push(this);
    }

    async save() {}

    async comparePassword(password) {
      return this.passwordHash === password;
    }

    static async findOne(query) {
      if (query._id) return findUser((u) => u._id === query._id);
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
        user.activeSessions = user.activeSessions || [];
        const newSessions = update.$push.activeSessions.$each || [update.$push.activeSessions];
        const slice = update.$push.activeSessions.$slice;
        const merged = [...user.activeSessions, ...newSessions];
        user.activeSessions = slice ? merged.slice(slice) : merged;
      }
      if (update.$push && update.$push.recentRotations) {
        user.recentRotations = user.recentRotations || [];
        const newRotations = update.$push.recentRotations.$each || [update.$push.recentRotations];
        const slice = update.$push.recentRotations.$slice;
        const merged = [...user.recentRotations, ...newRotations];
        user.recentRotations = slice ? merged.slice(slice) : merged;
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
      if (update.$set && Array.isArray(update.$set.recentRotations)) {
        user.recentRotations = update.$set.recentRotations;
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

  test('multi-tab concurrent refresh within grace window succeeds without session invalidation', async () => {
    const { signRefreshToken, verifyRefreshToken } = require('../../src/utils/jwt');
    const user = mockUsers.find((u) => u.email === 'verified@example.com');
    const refreshToken = signRefreshToken(user);
    const { jti } = verifyRefreshToken(refreshToken);
    user.activeSessions = [{ jti, createdAt: new Date() }];
    const refreshCookie = `sv_refresh=${refreshToken}`;

    // Tab 1 refreshes
    const tab1 = await request(app).post('/api/auth/refresh').set('Cookie', refreshCookie);
    expect(tab1.status).toBe(200);
    expect(tab1.body.accessToken).toBeTruthy();

    // Tab 2 fires near-simultaneously with the same pre-rotation cookie within 10s grace window
    const tab2 = await request(app).post('/api/auth/refresh').set('Cookie', refreshCookie);
    expect(tab2.status).toBe(200);
    expect(tab2.body.accessToken).toBeTruthy();
  });

  test('adversary presenting stolen rotated refresh token within grace window gets access token without new refresh cookie; event is logged', async () => {
    const { signRefreshToken, verifyRefreshToken } = require('../../src/utils/jwt');
    const logger = require('../../src/config/logger');
    const loggerInfoSpy = jest.spyOn(logger, 'info');

    const user = mockUsers.find((u) => u.email === 'verified@example.com');
    const originalRefreshToken = signRefreshToken(user);
    const { jti } = verifyRefreshToken(originalRefreshToken);
    user.activeSessions = [{ jti, createdAt: new Date() }];
    const originalRefreshCookie = `sv_refresh=${originalRefreshToken}`;

    // 1. Legitimate client rotates token
    const legitRotateRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', originalRefreshCookie);
    expect(legitRotateRes.status).toBe(200);
    expect(legitRotateRes.headers['set-cookie']).toBeDefined();

    // 2. Attacker presents the stolen original refresh token within the 10s grace window
    const attackerRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', originalRefreshCookie);

    // Assert: Attacker receives a short-lived access token
    expect(attackerRes.status).toBe(200);
    expect(attackerRes.body.accessToken).toBeTruthy();
    // Assert: Attacker is NOT issued a new refresh token cookie (cannot gain perpetual persistence)
    expect(attackerRes.headers['set-cookie']).toBeUndefined();

    // Assert: Structured log was emitted recording the grace-window reuse
    expect(loggerInfoSpy).toHaveBeenCalledWith(
      'Refresh token rotation grace window hit — issuing access token without rotation',
      expect.objectContaining({
        oldJti: jti,
      })
    );

    loggerInfoSpy.mockRestore();
  });

  test('replaying a token outside the grace window wipes all sessions', async () => {
    const { signRefreshToken, verifyRefreshToken } = require('../../src/utils/jwt');
    const user = mockUsers.find((u) => u.email === 'verified@example.com');
    const oldRefreshToken = signRefreshToken(user);
    const { jti } = verifyRefreshToken(oldRefreshToken);
    user.activeSessions = [{ jti, createdAt: new Date() }];
    const oldRefreshCookie = `sv_refresh=${oldRefreshToken}`;

    const rotated = await request(app).post('/api/auth/refresh').set('Cookie', oldRefreshCookie);
    expect(rotated.status).toBe(200);
    const newRefreshCookie = refreshCookieOf(rotated);

    // Fast-forward rotation timestamp past the 10s grace window
    user.recentRotations.forEach((r) => {
      r.rotatedAt = new Date(Date.now() - 30_000);
    });

    // Replaying the token outside grace window triggers full invalidation
    const replay = await request(app).post('/api/auth/refresh').set('Cookie', oldRefreshCookie);
    expect(replay.status).toBe(401);
    expect(replay.body.error).toBe('Refresh token revoked');

    // Both old and new cookies are dead now
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

  test('SEC-08: password reset revokes active sessions and invalidates prior access tokens', async () => {
    const { hashToken } = require('../../src/utils/crypto');
    const email = 'reset-sessions@example.com';
    const originalPassword = 'Password123!';
    const newPassword = 'NewPassword456!';

    await request(app)
      .post('/api/auth/register')
      .send({ email, password: originalPassword });

    const user = mockUsers.find((u) => u.email === email);
    user.emailVerified = true;

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email, password: originalPassword });

    expect(loginRes.status).toBe(200);
    const oldAccessToken = loginRes.body.accessToken;
    const oldCookie = refreshCookieOf(loginRes);

    const meResBefore = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${oldAccessToken}`);
    expect(meResBefore.status).toBe(200);

    const rawResetToken = 'a'.repeat(64);
    user.passwordResetToken = hashToken(rawResetToken);
    user.passwordResetExpires = new Date(Date.now() + 3600000);

    // Ensure timestamp advance past token iat (iat is integer seconds)
    await new Promise((r) => setTimeout(r, 1100));

    const resetRes = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: rawResetToken, password: newPassword });

    expect(resetRes.status).toBe(200);
    expect(user.activeSessions.length).toBe(0);

    // Old access token rejected
    const meResAfter = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${oldAccessToken}`);
    expect(meResAfter.status).toBe(401);
    expect(meResAfter.body.error).toContain('password reset');

    // Old refresh token rejected
    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [oldCookie]);
    expect(refreshRes.status).toBe(401);

    // Login with new password succeeds
    const newLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ email, password: newPassword });
    expect(newLoginRes.status).toBe(200);
    expect(newLoginRes.body.accessToken).toBeTruthy();
  });
});

function decrypt(enc) {
  // eslint-disable-next-line global-require
  const { decryptPrivateKey, CRYPTO_PURPOSES } = require('../../src/utils/crypto');
  return decryptPrivateKey(enc, CRYPTO_PURPOSES.totp);
}