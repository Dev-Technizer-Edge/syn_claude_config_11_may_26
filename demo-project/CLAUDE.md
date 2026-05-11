# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Node.js/Express authentication API used as a live demo project. Entry point is `src/index.js`; all auth endpoints are mounted under `/api/auth`.

## Commands

```bash
npm run dev         # Start with nodemon (development)
npm start           # Start server (production mode)
npm test            # Run Jest with coverage (coverage collected from src/**/*.js)
npm run test:watch  # Jest in watch mode
npm test -- path/to/file.test.js           # Run a single test file
npm test -- -t "test name pattern"         # Run tests matching name
npm run lint        # ESLint over src/ and tests/
npm run lint:fix    # ESLint autofix
```

Env vars (see `.env.example`): `PORT`, `NODE_ENV`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `REFRESH_EXPIRES_IN`, `LOG_LEVEL`. All have dev fallbacks, but `JWT_SECRET` defaults to the string `'dev-secret-key'` — do not rely on that in any test that asserts real security behavior.

Note: `tests/` directory currently exists but is empty.

## Tech Stack
- Runtime: Node.js 20
- Framework: Express.js
- Storage: In-memory `Map` for refresh tokens (no database — swap for a persistent store in production)
- Testing: Jest + Supertest
- Language: ECMAScript 2022 for all new code only

## Architecture

Three layers, each in its own `src/` subdirectory:

- **`src/api/`** — Express transport layer. `routes.js` defines `/api/auth/{login,refresh,logout,me}`. `middleware.js` provides `requestLogger`, `authenticate` (Bearer JWT → `req.user`), `validateBody(fields)` factory, and a global `errorHandler`. Middleware order in `index.js` matters: `express.json()` → `requestLogger` → routes → `errorHandler` (must be last).
- **`src/auth/`** — Domain logic. `authService.js` owns login, refresh, and revocation and holds an **in-memory `refreshTokenStore` Map** (process-local; state is lost on restart and not shared across workers). `tokenHelper.js` wraps `jsonwebtoken` with friendlier errors (`TokenExpiredError` → `'Token has expired'`, `JsonWebTokenError` → `'Invalid token'`) and has no store of its own.
- **`src/utils/`** — `validators.js` (email, password, UUID, phone format) and `logger.js` (structured JSON logger used throughout).

## Coding Standards
- Always use async/await, never raw Promises
- All functions must have JSDoc comments
- No console.log in production code — use the logger utility
- Every new function must have at least one unit test
- Pure validation functions use a single return statement with a composed expression
- Never use multiple early-return guard clauses in validator functions

## What Claude Must Never Do
- Never modify .env or .env.* files
- Never push directly to main branch
- Never remove existing tests
- Never install packages without confirming with the developer

## PR and Git Standards
- Commit messages follow Conventional Commits: feat:, fix:, docs:, test:
- PR descriptions must include: what changed, why it changed, how to test

### Request flow (login example)

`POST /api/auth/login` → `validateBody(['email','password'])` → route handler validates format via `validators.js` → `authService.loginUser()` checks bcrypt hash, calls `generateAccessToken` (signed JWT) + `generateRefreshToken` (uuid stored in `refreshTokenStore`) → returns `{ accessToken, refreshToken, user }`. Protected routes (`/logout`, `/me`) go through `authenticate` middleware, which calls `tokenHelper.verifyToken` and attaches the decoded payload to `req.user`.

### Error convention

Route handlers translate known domain errors to HTTP status codes inline (e.g. `'Invalid credentials'` → 401) and pass everything else to `next(err)`, where `errorHandler` logs it and returns a generic 500. Preserve this pattern when adding routes — don't leak internal error messages to clients from the global handler.

### Token model

Two-token scheme: short-lived signed JWT access token (claims: `sub`, `email`, `role`) + opaque UUID refresh token stored server-side in `refreshTokenStore` with `{ userId, createdAt }`. Refresh tokens are revoked by deleting the map entry (`revokeToken`, logout).
