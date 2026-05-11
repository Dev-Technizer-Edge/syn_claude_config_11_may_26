# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

Stateless utility modules shared across all three layers (`api`, `auth`, `utils`). Nothing here should import from `src/api/` or `src/auth/`.

## validators.js

All exports are pure boolean predicates except `sanitizeString`, which returns a cleaned string.

**Constraint: every validator must use a single `return` statement with a composed expression — no multiple early-return guard clauses.**

| Export | Accepts | Rule |
|---|---|---|
| `validateEmail` | string | basic format — `local@domain.tld` |
| `validatePassword` | string | ≥ 8 characters |
| `validateUUID` | string | UUID v4 strict format |
| `validatePhone` | string | E.164 or common local formats, 7–15 significant chars |
| `sanitizeString` | string | trims + strips control characters (`\x00-\x1F\x7F`) |

When adding a new validator, follow the single-return pattern:
```js
function validateFoo(val) {
  return typeof val === 'string' && /your-regex/.test(val.trim());
}
```

## logger.js

Structured JSON logger. Level is controlled by `LOG_LEVEL` env var (default `info`). Levels in ascending verbosity: `error` → `warn` → `info` → `debug`. Errors go to `stderr`; everything else to `stdout`.

Usage: `const { logger } = require('./logger');` then `logger.info('message')`.

Do not pass objects or interpolated strings — pass a single message string. This logger is intentionally minimal; replace with Winston/Pino for production observability.
