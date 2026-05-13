---
name: deploy
description: Deploy the application to the staging environment
disable-model-invocation: true
allowed-tools: Bash(npm:*), Bash(git:*)
---

# Deployment Skill

Deploy steps in exact order:
1. Run `npm run test` — abort if any test fails
2. Run `npm run build`
3. Run `git tag` with today's date and increment patch version
4. Push the tag to origin
5. Confirm deployment URL is responding with HTTP 200

Never deploy if:
- Any test is failing
- There are uncommitted changes in src/
- The current branch is not staging or main