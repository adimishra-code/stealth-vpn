// AUTH-03: forgot-password abuse protection. The limiter is keyed by
// IP + normalized email, so a shared IP (campus NAT) cannot exhaust the
// budget of every address on it and hopping IPs does not help an attacker
// targeting one mailbox.
jest.mock('../src/models/User', () => {
  class User {
    static async findOne() {
      return null; // never found → generic response, no email side effects
    }
  }
  return User;
});

const request = require('supertest');
const createApp = require('../src/app');

describe('Forgot-password rate limit (AUTH-03)', () => {
  const app = createApp();

  test('5 attempts per IP+email, then 429', async () => {
    const ip = '203.0.113.7';
    const email = 'limiter@example.com';
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .set('X-Forwarded-For', ip)
        .send({ email });
      expect(res.status).toBe(200);
    }
    const blocked = await request(app)
      .post('/api/auth/forgot-password')
      .set('X-Forwarded-For', ip)
      .send({ email });
    expect(blocked.status).toBe(429);
  });

  test('the key includes the email — a fresh address resets the window', async () => {
    const ip = '203.0.113.8';
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/auth/forgot-password')
        .set('X-Forwarded-For', ip)
        .send({ email: `spam${i}@example.com` });
    }
    const fresh = await request(app)
      .post('/api/auth/forgot-password')
      .set('X-Forwarded-For', ip)
      .send({ email: 'fresh@example.com' });
    expect(fresh.status).toBe(200);
  });

  test('email is normalized — case does not bypass the budget', async () => {
    const ip = '203.0.113.9';
    const email = 'case@example.com';
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/auth/forgot-password')
        .set('X-Forwarded-For', ip)
        .send({ email: i % 2 ? email : email.toUpperCase() });
    }
    const blocked = await request(app)
      .post('/api/auth/forgot-password')
      .set('X-Forwarded-For', ip)
      .send({ email });
    expect(blocked.status).toBe(429);
  });
});
