#!/usr/bin/env node
/**
 * Stop hook: appends a per-turn cost/token summary to .claude/session-log.md.
 * Cost and usage data are parsed from the transcript JSONL provided in stdin.
 */

const fs = require('fs');
const path = require('path');

const logFile = path.join('.claude', 'session-log.md');
const timestamp = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' });

/** Sequential turn number derived from entries already written to the log. */
function getNextTurnNumber() {
  try {
    const content = fs.readFileSync(logFile, 'utf8');
    const matches = content.match(/^## Turn #\d+/gm);
    return matches ? matches.length + 1 : 1;
  } catch {
    return 1;
  }
}

/** Format a token count with thousands separators (en-US). */
function fmt(n) {
  return n.toLocaleString('en-US');
}

let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  let transcriptPath = null;

  try {
    const payload = JSON.parse(input);
    transcriptPath = payload.transcript_path;
  } catch {
    // running outside Claude Code (e.g. manual test) — no stdin payload
  }

  let totalCost = 0;
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCacheWrite = 0;
  let parsed = false;

  // Track last assistant entry's values for the "This turn" section
  let lastCost = 0;
  let lastInput = 0;
  let lastOutput = 0;
  let lastCacheRead = 0;
  let lastCacheWrite = 0;

  if (transcriptPath && fs.existsSync(transcriptPath)) {
    const lines = fs.readFileSync(transcriptPath, 'utf8').split('\n').filter(l => l.trim());
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.costUSD != null) {
          lastCost = entry.costUSD;
          totalCost += entry.costUSD;
        }
        const u = entry.usage || entry.message?.usage;
        if (u) {
          lastInput      = u.input_tokens                || 0;
          lastOutput     = u.output_tokens               || 0;
          lastCacheRead  = u.cache_read_input_tokens     || 0;
          lastCacheWrite = u.cache_creation_input_tokens || 0;
          totalInput      += lastInput;
          totalOutput     += lastOutput;
          totalCacheRead  += lastCacheRead;
          totalCacheWrite += lastCacheWrite;
          parsed = true;
        }
      } catch { /* skip malformed lines */ }
    }
  }

  const turnNumber = getNextTurnNumber();

  const fmtCost = c => c > 0 ? `$${c.toFixed(4)}` : 'included in plan';

  // Cache hit rate: what % of input was served from cache
  const totalTokensSeen = totalInput + totalCacheRead;
  const cacheHitRate = totalTokensSeen > 0
    ? ` (${Math.round((totalCacheRead / totalTokensSeen) * 100)}% hit rate)`
    : '';

  const outputLines = parsed
    ? [
        `--- This turn ---`,
        `Input:        ${fmt(lastInput)} tokens`,
        `Output:       ${fmt(lastOutput)} tokens`,
        ...(lastCacheRead  > 0 ? [`Cache read:   ${fmt(lastCacheRead)} tokens`]  : []),
        ...(lastCacheWrite > 0 ? [`Cache write:  ${fmt(lastCacheWrite)} tokens`] : []),
        `Cost:         ${fmtCost(lastCost)}`,
        ``,
        `--- Session total ---`,
        `Input:        ${fmt(totalInput)} tokens`,
        `Output:       ${fmt(totalOutput)} tokens`,
        ...(totalCacheRead  > 0 ? [`Cache read:   ${fmt(totalCacheRead)} tokens${cacheHitRate}`] : []),
        ...(totalCacheWrite > 0 ? [`Cache write:  ${fmt(totalCacheWrite)} tokens`] : []),
        `Cost:         ${fmtCost(totalCost)}`,
      ]
    : ['Token data not available — transcript not found or empty'];

  const summary = outputLines.join('\n');

  console.log(`\n[session-log] Turn #${turnNumber} | cost: ${fmtCost(lastCost)} | ${timestamp}\n`);

  const entry = `\n## Turn #${turnNumber} — ${timestamp}\n\`\`\`\n${summary}\n\`\`\`\n\n---\n`;

  try {
    fs.appendFileSync(logFile, entry, 'utf8');
  } catch (err) {
    console.error(`[session-log] Could not write log: ${err.message}`);
  }
});
