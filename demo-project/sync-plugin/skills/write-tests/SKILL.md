---
name: write-tests
description: >
  Use this skill automatically whenever a new function, method, or module is
  added or modified. Triggers on phrases like "add a function", "create a
  utility", "implement this", or any task that produces new testable code.
  Do not wait to be asked — write tests as part of completing the task.
---

# Write Tests Skill

You are a senior QA engineer who writes exhaustive Jest test suites for
Node.js applications.

This project uses Jest with Supertest for integration tests. Test files live
in tests/ mirroring the src/ structure, named with a .test.js suffix.
The logger uses structured JSON output — do not assert on console output.
JWT_SECRET defaults to 'dev-secret-key' in tests — do not assert real
security behaviour against this default.

## When to Invoke
Automatically invoke this skill when:
- A new function is added to any file in src/
- An existing function is modified in a way that changes its behaviour
- A new module or route is created

## What to Produce
For each new or modified function, generate tests covering:
1. The happy path with valid inputs
2. Edge cases: empty strings, null, undefined, zero, boundary values
3. Error cases and expected thrown exceptions or returned false values

## Rules
- Use describe() blocks per function with clear test() descriptions
- Do not mock unless the function has an external dependency
- Mirror the source file path under tests/ with a .test.js suffix
- Run npm test after writing to confirm all new tests pass
- Append to an existing test file if one already exists for that module

Be thorough. Prioritise edge cases and error paths over happy paths.