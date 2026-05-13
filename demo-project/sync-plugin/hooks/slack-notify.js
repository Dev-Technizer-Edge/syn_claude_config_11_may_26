#!/usr/bin/env node
/**
 * Slack notification helper for Claude Code hooks.
 *
 * Usage (as a module):
 *   const { sendSlackNotification } = require('./slack-notify');
 *   await sendSlackNotification('Task completed!');
 *
 * Usage (standalone CLI):
 *   echo '{"message":"hello"}' | node slack-notify.js
 *
 * Requires env var: SLACK_WEBHOOK_URL
 */

const https = require('https');

/**
 * Posts a message to the configured Slack Incoming Webhook.
 * @param {string} message - Plain text message to send.
 * @returns {Promise<void>}
 */
function sendSlackNotification(message) {
  return new Promise((resolve, reject) => {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) {
      return reject(new Error('SLACK_WEBHOOK_URL env var is not set'));
    }

    const body = JSON.stringify({
      text: `🤖 *Claude Code* — ${message}`,
      username: 'Claude Code',
      icon_emoji: ':robot_face:'
    });

    const url = new URL(webhookUrl);
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      },
      (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve();
          } else {
            reject(new Error(`Slack returned HTTP ${res.statusCode}: ${data}`));
          }
        });
      }
    );

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { sendSlackNotification };

// ── Standalone mode: run directly via stdin payload ───────────────────────────
if (require.main === module) {
  let input = '';
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', async () => {
    let message = 'Claude Code needs your attention';
    try {
      const payload = JSON.parse(input);
      if (payload.message) message = payload.message;
    } catch { /* use default */ }

    try {
      await sendSlackNotification(message);
      console.log(`[slack-notify] Sent: "${message}"`);
    } catch (err) {
      console.error(`[slack-notify] Failed: ${err.message}`);
      process.exit(1);
    }
  });
}
