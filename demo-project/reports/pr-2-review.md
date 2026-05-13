# Multi-Agent Review — PR #2

**PR:** `fix(api): prevent X-Forwarded-For spoofing from bypassing rate limiter`
**Date:** 2026-05-13
**Reviewers:** Security (R1) · Performance & Scalability (R2) · Test Coverage (R3)
**Overall Verdict: Request Changes**

---

## Executive Summary

The core approach is correct — delegating IP resolution to Express is the right architectural direction and a genuine improvement over reading the raw `X-Forwarded-For` header. However, the implementation carries a residual spoofing gap in unproxied deployments, a logic error that allows one extra brute-force attempt per window, and a security test that may be silently non-functional. Six items must be resolved before merge.

---

## Blocked Merge Checklist

- [ ] Replace `trust proxy: 1` with a CIDR env var, with fail-fast in production
- [ ] Fix off-by-one: `entry.count > MAX_REQUESTS` → `>= MAX_REQUESTS`
- [ ] Fix off-by-one in `tracks different IPs independently` test loop (`<= MAX_REQUESTS` → `< MAX_REQUESTS`)
- [ ] Verify and fix security test 1 (loopback + XFF + no trust proxy interaction — likely broken)
- [ ] Add store eviction / size cap
- [ ] Add `store` comment warning about process-locality and cluster scaling

---

## Critical Cross-Cutting Issues

*Flagged independently by multiple reviewers.*

### [R1 Security · R3 Test] `trust proxy: 1` Does Not Fully Close the Spoofing Vector

**Severity: High**

`trust proxy: 1` (numeric) is fragile. Two deployment scenarios leave the bypass intact:

**Scenario A — No reverse proxy (staging/direct internet exposure)**
With no actual proxy in front, Express trusts the rightmost XFF entry appended by the *client*. An attacker sends `X-Forwarded-For: 1.2.3.4` and `req.ip` becomes `1.2.3.4` — the spoofing bypass is fully restored.

**Scenario B — Two upstream hops (CDN + ALB)**
The XFF chain becomes `<client-ip>, <cdn-ip>`. Express peels one hop, yielding the CDN edge IP. All users map to the same bucket — rate limiting collapses to a global shared counter.

**Fix:**
```js
// src/index.js
app.set('trust proxy', process.env.TRUSTED_PROXY_CIDR || '127.0.0.0/8');
```
Add `TRUSTED_PROXY_CIDR` to `.env.example`. Fail-fast with a thrown error in `NODE_ENV=production` if the variable is absent (same pattern as `JWT_SECRET`).

---

### [R1 Security · R3 Test] Off-by-One: The 101st Request Is Served Before Blocking

**Severity: High**

The enforcement condition fires only when `entry.count` *strictly exceeds* `MAX_REQUESTS`, meaning request 101 is the first to receive a 429. In a brute-force context against `/api/auth/login`, this is one extra credential attempt per window.

```js
// src/api/rateLimiter.js line 57 — current (buggy)
if (entry.count > MAX_REQUESTS) {

// fix
if (entry.count >= MAX_REQUESTS) {
```

The test `tracks different IPs independently` compounds this with `i <= MAX_REQUESTS` in its prep loop — change to `i < MAX_REQUESTS` to match every other test and correctly assert the 429 boundary.

---

### [R1 Security · R2 Performance] Unbounded In-Memory Store Is a DoS Vector

**Severity: High**

The `store` Map has no eviction policy. Entries are only reclaimed lazily when the same IP returns after its window expires. Under a botnet rotating unique source IPs:

| Unique IPs / window | Store heap footprint |
|---|---|
| 100,000 | ~10–15 MB |
| 1,000,000 | ~100–150 MB |
| Unbounded | Process OOM |

**Fix:** Add a periodic eviction sweep or a hard size cap. For production, use a Redis-backed store with TTL-keyed entries.

---

## High-Severity Issues

### [R2 Performance] Process-Local Store Breaks in Clustered / Multi-Container Deployments

Each Node.js worker or container has its own independent `store` Map. A 4-worker cluster multiplies the effective rate limit to 400 req/window/IP, completely nullifying the security guarantee in any horizontally scaled deployment. There is no warning in the code or `CLAUDE.md`.

**Fix:** Add a JSDoc warning on the `store` declaration. Document in `CLAUDE.md` that Redis is required before running more than one worker or container.

---

### [R3 Test] Security Test 1 Is Likely Broken

The test `X-Forwarded-For cannot bypass the rate limit when no reverse proxy is configured` (line 102) expects the spoofed XFF to be ignored when `trust proxy` is not set. However, **Express unconditionally trusts loopback addresses (`127.0.0.1`, `::1`) regardless of the `trust proxy` setting**. Since supertest connects via loopback, XFF is still parsed — `req.ip` resolves to `9.9.9.9` (a fresh empty bucket), meaning the request likely returns `200`, not `429`.

The test comment ("req.ip is always the raw socket address") is factually incorrect about Express loopback behaviour. This test may be providing false security assurance. Run it in isolation and verify the output before merge.

---

## Medium-Severity Issues

| # | Reviewer | Finding | Recommendation |
|---|---|---|---|
| M1 | R2 Performance | **Fixed-window burst:** 200 requests possible in ~2 seconds at window boundaries. Especially concerning for `/api/auth/login`. | Consider per-route tighter limit, or sliding window / token bucket for auth endpoints. |
| M2 | R3 Test | **Security test 2 comment misrepresents Express semantics.** Comment says "req.ip = rightmost XFF entry" but Express with `trust proxy: 1` resolves leftmost-untrusted, not rightmost. | Fix comment. Add a test verifying behaviour with more hops than the trust level. |
| M3 | R3 Test | **No test or guard for `req.ip === undefined`.** All requests with unresolvable IP share a single `undefined` bucket silently. | Add defensive check in `getClientIp` and a corresponding test. |
| M4 | R3 Test | **IPv6 keys are untested.** `::1` and `::ffff:127.0.0.1` are distinct Map keys. | Add a test exercising an IPv6 address as the rate-limit key. |
| M5 | R3 Test | **No integration test for `src/index.js` `trust proxy` setting.** If removed from the real entry point, all tests still pass because `buildApp()` sets it independently. | Add a test importing the real app and asserting `app.get('trust proxy') === 1`. |
| M6 | R2 Performance | **No Redis migration path documented.** Unlike the refresh token store, the rate limiter store has no "swap in production" callout. | Add a comment on `store` and a note in `CLAUDE.md`. |

---

## Low-Severity Issues

| # | Reviewer | Finding | Recommendation |
|---|---|---|---|
| L1 | R1 Security | Rate limiter mounted inside auth sub-router only — `/health` unprotected; future routes on the app instance silently bypass it. | Mount globally in `index.js` before the router. |
| L2 | R1/R3 | IPv6/IPv4 dual-stack gap: `::ffff:1.2.3.4` and `1.2.3.4` are different Map keys — dual-stack client gets two independent buckets. | Normalize `::ffff:` prefix in `getClientIp`: `ip.startsWith('::ffff:') ? ip.slice(7) : ip`. |
| L3 | R1 Security | `X-RateLimit-Remaining` + `X-RateLimit-Reset` on unauthenticated responses gives credential-stuffers a precise window-timing oracle. | Suppress or omit these headers on 401/429 for login endpoint. |
| L4 | R2 Performance | Duplicate `res.set()` calls in both branches + inconsistent `X-RateLimit-Reset` (full window vs. time-remaining). | Extract a `setRateLimitHeaders(res, limit, remaining, resetSecs)` helper. |
| L5 | R3 Test | Exact `WINDOW_MS` boundary (equality) not tested — only `WINDOW_MS + 1` is covered. | Add tests for `WINDOW_MS` exactly and `WINDOW_MS - 1`. |
| L6 | R1 Security | (Pre-existing) Email addresses logged in plain text on auth failures — PII concern under GDPR. | Redact or hash email in failure log messages. |

---

## What the PR Gets Right

- Core approach is correct: `req.ip` via Express trust-proxy resolution is the right architecture.
- `getClientIp` simplification eliminates redundant string parsing — minor performance improvement.
- `Date.now()` called once per request — correct pattern, no concern.
- `trust proxy` setting adds negligible per-request overhead.
- The two-test scenario structure (no-proxy and multi-hop) is the right test design — the implementation just needs to be corrected.
- PR description is clear, complete, and well-structured.

---

## Findings Summary

| Severity | Count | Source |
|---|---|---|
| High (cross-cutting, multi-reviewer) | 3 | R1+R3, R1+R3, R1+R2 |
| High (single reviewer) | 2 | R2, R3 |
| Medium | 6 | R2 ×1, R3 ×5 |
| Low | 6 | R1 ×3, R2 ×1, R3 ×2 |
| Info | 3 | R1, R2, R3 |

---

*Generated by a 3-agent review team (Security · Performance & Scalability · Test Coverage) running independently and synthesized into this report.*
