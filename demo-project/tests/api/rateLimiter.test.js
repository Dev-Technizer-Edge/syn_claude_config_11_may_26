const express = require('express');
const supertest = require('supertest');
const { rateLimiter, store, MAX_REQUESTS, WINDOW_MS } = require('../../src/api/rateLimiter');

/** Minimal app that applies only the rate limiter (matches production config). */
function buildApp() {
  const app = express();
  app.set('trust proxy', 1); // mirrors src/index.js — loopback is trusted in tests
  app.use(rateLimiter);
  app.get('/test', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('rateLimiter middleware', () => {
  beforeEach(() => store.clear());

  it('allows requests under the limit', async () => {
    const res = await supertest(buildApp()).get('/test');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('sets X-RateLimit-Limit header to MAX_REQUESTS', async () => {
    const res = await supertest(buildApp()).get('/test');
    expect(res.headers['x-ratelimit-limit']).toBe(String(MAX_REQUESTS));
  });

  it('sets X-RateLimit-Reset header on first request', async () => {
    const res = await supertest(buildApp()).get('/test');
    const reset = Number(res.headers['x-ratelimit-reset']);
    expect(reset).toBeGreaterThan(0);
    expect(reset).toBeLessThanOrEqual(Math.ceil(WINDOW_MS / 1000));
  });

  it('decrements X-RateLimit-Remaining with each request', async () => {
    const app = buildApp();
    const first = await supertest(app).get('/test');
    expect(first.headers['x-ratelimit-remaining']).toBe(String(MAX_REQUESTS - 1));

    const second = await supertest(app).get('/test');
    expect(second.headers['x-ratelimit-remaining']).toBe(String(MAX_REQUESTS - 2));
  });

  it('returns 429 on the request that exceeds the limit', async () => {
    const app = buildApp();
    for (let i = 0; i < MAX_REQUESTS; i++) {
      await supertest(app).get('/test');
    }
    const over = await supertest(app).get('/test');
    expect(over.status).toBe(429);
    expect(over.body.error).toMatch(/too many requests/i);
  });

  it('includes Retry-After header on 429 response', async () => {
    const app = buildApp();
    for (let i = 0; i < MAX_REQUESTS; i++) {
      await supertest(app).get('/test');
    }
    const over = await supertest(app).get('/test');
    expect(over.headers['retry-after']).toBeDefined();
    expect(Number(over.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('sets X-RateLimit-Remaining to 0 on the last allowed request', async () => {
    const app = buildApp();
    for (let i = 0; i < MAX_REQUESTS - 1; i++) {
      await supertest(app).get('/test');
    }
    const last = await supertest(app).get('/test');
    expect(last.status).toBe(200);
    expect(last.headers['x-ratelimit-remaining']).toBe('0');
  });

  it('resets the counter after the time window expires', async () => {
    const app = buildApp();
    for (let i = 0; i < MAX_REQUESTS; i++) {
      await supertest(app).get('/test');
    }
    // Backdate windowStart to simulate the window having elapsed
    for (const entry of store.values()) {
      entry.windowStart -= WINDOW_MS + 1;
    }
    const res = await supertest(app).get('/test');
    expect(res.status).toBe(200);
    expect(res.headers['x-ratelimit-remaining']).toBe(String(MAX_REQUESTS - 1));
  });

  it('tracks different IPs independently', async () => {
    const app = buildApp();
    // Exhaust the limit for IP A (trust proxy: 1 + loopback connection → XFF is trusted)
    for (let i = 0; i <= MAX_REQUESTS; i++) {
      await supertest(app).get('/test').set('X-Forwarded-For', '10.0.0.1');
    }
    const blockedA = await supertest(app).get('/test').set('X-Forwarded-For', '10.0.0.1');
    expect(blockedA.status).toBe(429);

    // IP B should be unaffected
    const allowedB = await supertest(app).get('/test').set('X-Forwarded-For', '10.0.0.2');
    expect(allowedB.status).toBe(200);
  });

  it('X-Forwarded-For cannot bypass the rate limit when no reverse proxy is configured', async () => {
    // No trust proxy — req.ip is always the raw socket address (127.0.0.1 from supertest).
    const app = express();
    app.use(rateLimiter);
    app.get('/test', (_req, res) => res.json({ ok: true }));

    for (let i = 0; i < MAX_REQUESTS; i++) {
      await supertest(app).get('/test');
    }

    // Spoofed header must not open a fresh bucket — the real socket IP is still exhausted.
    const spoofed = await supertest(app)
      .get('/test')
      .set('X-Forwarded-For', '9.9.9.9');
    expect(spoofed.status).toBe(429);
  });

  it('returns 429 when limit is exceeded regardless of additional upstream hops in X-Forwarded-For', async () => {
    const app = buildApp();

    // Exhaust the limit as IP 10.0.0.10.
    for (let i = 0; i < MAX_REQUESTS; i++) {
      await supertest(app).get('/test').set('X-Forwarded-For', '10.0.0.10');
    }

    // With trust proxy: 1, req.ip = rightmost XFF entry (index 1 from socket).
    // Prepending an extra upstream address to the left keeps req.ip = 10.0.0.10,
    // so the same bucket is hit and the request must still be blocked.
    const withExtraHop = await supertest(app)
      .get('/test')
      .set('X-Forwarded-For', '1.2.3.4, 10.0.0.10');
    expect(withExtraHop.status).toBe(429);
  });
});
