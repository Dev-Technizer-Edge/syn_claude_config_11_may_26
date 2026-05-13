#!/usr/bin/env node
/**
 * PreToolUse hook: blocks dangerous Bash commands before Claude runs them.
 * Exit 0 = allow, exit 2 = block (Claude sees the printed reason).
 */

const DANGER_PATTERNS = [
  /rm\s+-rf\s+\//,
  /sudo\s+rm/,
  /:\(\)\{:|:&\};:/,          // fork bomb
  /dd\s+if=.*of=\/dev\/sd/,
  /chmod\s+777\s+\//,
];

let raw = '';
process.stdin.on('data', chunk => (raw += chunk));
process.stdin.on('end', () => {
  let cmd;
  try {
    cmd = JSON.parse(raw).tool_input?.command ?? '';
  } catch {
    process.exit(0);
  }

  console.log(`\n[hook:bash-guard] Checking command: ${cmd}`);

  for (const pattern of DANGER_PATTERNS) {
    if (pattern.test(cmd)) {
      console.log(`[hook:bash-guard] BLOCKED — matches danger pattern: ${pattern}`);
      process.exit(2);
    }
  }

  console.log(`[hook:bash-guard] Allowed\n`);
  process.exit(0);
});
