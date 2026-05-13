---
name: code-review
description: >
  Use this skill when the task involves reviewing, auditing, or assessing
  code quality, security, or test coverage. Triggers on phrases like
  "review this", "check this code", "audit the auth module", or any
  request to evaluate existing code.
---

# Code Review Skill

When performing a code review, always cover all four dimensions in order:

## 1. Security
- Check for injection vulnerabilities (SQL, command, path traversal)
- Verify authentication and authorization on every endpoint
- Confirm sensitive data is never logged or exposed in responses

## 2. Performance
- Identify N+1 query patterns
- Flag synchronous operations that should be async
- Note missing database indexes on queried fields

## 3. Test Coverage
- List functions that have no test coverage
- Identify edge cases not covered by existing tests
- Suggest specific test cases with example inputs and expected outputs

## 4. Code Quality
- Flag violations of standards defined in CLAUDE.md
- Identify duplicated logic that should be extracted
- Note missing error handling

Produce output as a structured report with a severity level (Critical / High / Medium / Low)
for each finding. End with a summary score out of 10 and one concrete recommended first action.