#!/usr/bin/env node
/**
 * PostToolUse hook: runs ESLint --fix on any JS file Claude writes or edits.
 * Receives tool input as JSON on stdin.
 */

const { spawnSync } = require('child_process');

let raw = '';
process.stdin.on('data', chunk => (raw += chunk));
process.stdin.on('end', () => {
  let filePath;
  try {
    filePath = JSON.parse(raw).tool_input?.file_path;
  } catch {
    process.exit(0);
  }

  if (!filePath || !/\.(js|mjs|cjs)$/.test(filePath)) {
    process.exit(0);
  }

  console.log(`\n[hook:eslint-fix] Running ESLint on: ${filePath}`);

  const result = spawnSync('npx', ['eslint', '--fix', filePath], {
    encoding: 'utf8',
    shell: true,
  });

  if (result.stdout?.trim()) console.log(result.stdout.trim());
  if (result.stderr?.trim()) console.error(result.stderr.trim());

  const status = result.status === 0 ? 'OK' : `exit code ${result.status}`;
  console.log(`[hook:eslint-fix] Done — ${status}\n`);
});
