/**
 * In-memory IP rate limiter middleware.
 * Fixed-window: each IP is allowed MAX_REQUESTS per WINDOW_MS.
 */

const MAX_REQUESTS = 100;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/** @type {Map<string, { count: number, windowStart: number }>} */
const store = new Map();

/**
 * Returns the client IP from req.ip.
 * Express resolves req.ip via the X-Forwarded-For chain only when the
 * connection originates from a trusted proxy (app.set('trust proxy', 1) in
 * src/index.js). Direct connections always use the socket address, so this
 * value cannot be spoofed by a client setting an arbitrary X-Forwarded-For
 * header.
 *
 * @param {import('express').Request} req
 * @returns {string}
 */
function getClientIp(req) {
  return req.ip;
}

/**
 * Express middleware enforcing per-IP rate limiting.
 * Responds 429 with Retry-After when the limit is exceeded.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function rateLimiter(req, res, next) {
  const ip = getClientIp(req);
  const now = Date.now();
  const entry = store.get(ip);

  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    store.set(ip, { count: 1, windowStart: now });
    res.set('X-RateLimit-Limit', String(MAX_REQUESTS));
    res.set('X-RateLimit-Remaining', String(MAX_REQUESTS - 1));
    res.set('X-RateLimit-Reset', String(Math.ceil(WINDOW_MS / 1000)));
    return next();
  }

  entry.count += 1;

  const remaining = Math.max(0, MAX_REQUESTS - entry.count);
  const resetSecs = Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000);

  res.set('X-RateLimit-Limit', String(MAX_REQUESTS));
  res.set('X-RateLimit-Remaining', String(remaining));
  res.set('X-RateLimit-Reset', String(resetSecs));

  if (entry.count > MAX_REQUESTS) {
    res.set('Retry-After', String(resetSecs));
    return res.status(429).json({ error: 'Too many requests, please try again later.' });
  }

  next();
}

module.exports = { rateLimiter, store, MAX_REQUESTS, WINDOW_MS };
