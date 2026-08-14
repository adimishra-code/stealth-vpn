// CSRF-02: the double-submit cookie pattern must block state-changing requests
// that lack a valid token while leaving GETs and the payment webhook alone.
//
// The suite runs with NODE_ENV=test, which disables enforcement (business-
// logic tests don't mint tokens). This file flips the env to production before
// building the app so the enforcement path is exercised for real.
process.env.NODE_ENV = 'production';

// Keep the app off Mongo: forgot-password never finds a user and answers 200.
jest.mock('../src/models/User', () => {
  class User {
    static async findOne() {
      return null;
    }
  }
  return User;
});

// /health returns 503 when the DB is unreachable; the test asserts the GET
// itself is reachable, so stub mongoose as connected for the duration.
jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
  return {
    ...actual,
    connection: { readyState: 1 },
  };
});

const request = require('supertest');
const createApp = require('../src/app');

describe('CSRF protection', () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  test('GET /api/csrf-token returns a token and sets the httpOnly cookie', async () => {
    const res = await request(app).get('/api/csrf-token');

    expect(res.status).toBe(200);
    expect(typeof res.body.csrfToken).toBe('string');
    expect(res.body.csrfToken.length).toBeGreaterThan(16);

    const setCookie = res.headers['set-cookie'] || [];
    const csrfCookie = setCookie.find((c) => c.startsWith('sv_csrf='));
    expect(csrfCookie).toBeDefined();
    expect(csrfCookie).toContain('HttpOnly');
  });

  test('POST without a CSRF token is rejected 403', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({
      email: 'csrf@example.com',
    });

    expect(res.status).toBe(403);
  });

  test('POST with cookie + matching header passes CSRF', async () => {
    // No agent: supertest over plain http would drop the Secure cookie, so
    // the signed cookie is carried across explicitly.
    const minted = await request(app).get('/api/csrf-token');
    const csrfCookie = (minted.headers['set-cookie'] || []).find((c) =>
      c.startsWith('sv_csrf=')
    );

    const res = await request(app)
      .post('/api/auth/forgot-password')
      .set('Cookie', csrfCookie)
      .set('x-csrf-token', minted.body.csrfToken)
      .send({ email: 'csrf@example.com' });

    // The route always answers 200 (no user enumeration); a 403 here would
    // mean CSRF still failed despite the valid token.
    expect(res.status).toBe(200);
  });

  test('payment webhook is exempt from CSRF', async () => {
    const res = await request(app)
      .post('/api/payment/webhook')
      .send({ payload: 'no-token-needed' });

    // Reaches the route handler (which rejects on signature), not the CSRF gate.
    expect(res.status).not.toBe(403);
  });

  test('GET endpoints remain reachable without a token', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
  });
});
