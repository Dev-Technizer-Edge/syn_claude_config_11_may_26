# SRE Demos — The 3 AM Page + Post-Mortem Subagent

Drop this directory anywhere (e.g. `~/sre-demo`), open Claude Code inside it, and run the demos. No services to install — Claude works entirely from these files.

Two demos are pre-staged here:

1. **Triage demo** — Claude diagnoses a live incident from logs and configs (~90 seconds)
2. **Post-mortem demo** — a subagent reads the incident artifacts and drafts a blameless post-mortem (~90 seconds)

Together they form a complete *page → fix → write-up* SRE workflow you can run end-to-end in a 10-minute training slot.

---

## Demo 1 — Triage (The 3 AM Page)

```bash
cd ~/sre-demo
claude
```

Paste:

```
The order-service is throwing ECONNREFUSED on every request — see logs.
Find the root cause and tell me how to fix it.
```

Claude should:

1. Read the most recent log file in `/logs`
2. Notice `ECONNREFUSED` to `127.0.0.1:6380`
3. Read `.env` — see `REDIS_PORT=6380`
4. Read `logs/deploys.log` — see the recent change `6379 → 6380`
5. Cross-reference `CLAUDE.md` (Redis listens on **6379** in prod)
6. Propose the fix: revert `.env` to `REDIS_PORT=6379`

To apply:

```
Apply the fix. Update the .env.
```

---

## Demo 2 — Post-Mortem Subagent

Continue in the same session (or open a fresh one):

```
Write the post-mortem for the redis incident.
Artifacts are in postmortems/2026-05-12-order-service-redis/.
```

Claude reads the agent's description in `.claude/agents/postmortem-writer.md`, recognizes this as a post-mortem request, and delegates to the subagent. The subagent will:

1. Inventory the artifacts (logs, deploy history, Slack transcript)
2. Build a chronological timeline citing each source
3. Identify root cause and contributing factors
4. Generate SMART action items with role-owners (not individuals)
5. Write the post-mortem to `postmortems/2026-05-12-order-service-redis/INC-...md`

Open the file when it finishes — show the audience the timeline citations, the blameless tone, the specific action items.

---

## What's in this directory

```
sre-demo/
├── README.md                                           # This file
├── CLAUDE.md                                           # Project context (auto-loaded)
├── .env                                                # ← The bug: REDIS_PORT=6380
├── src/
│   └── server.js                                       # Service code for Claude to read
├── logs/
│   ├── orders-2026-05-12.log                           # ECONNREFUSED error spam
│   └── deploys.log                                     # Recent deploy history
├── .claude/
│   └── agents/
│       └── postmortem-writer.md                        # The subagent definition
└── postmortems/
    └── 2026-05-12-order-service-redis/                 # Incident artifact archive
        ├── orders-2026-05-12.log                       # (copy of logs/)
        ├── deploys.log                                 # (copy of logs/)
        └── slack-transcript.txt                        # Incident channel transcript
```

The `postmortems/.../` directory duplicates the log files on purpose — it represents the *archived snapshot* of the incident, separate from the live `logs/` directory. In a real workflow you'd `cp logs/* postmortems/.../` after resolution.

---

## Refreshing dates for future demos

The log files use `2026-05-12` as the incident date. To re-run the demo on another day with fresh dates, find-and-replace `2026-05-12` across these files:

- `logs/orders-2026-05-12.log` (rename the file too)
- `logs/deploys.log` (last line)
- `postmortems/2026-05-12-order-service-redis/` (rename the directory)
- `postmortems/.../orders-2026-05-12.log` (rename)
- `postmortems/.../deploys.log` and `slack-transcript.txt`

Or skip it and tell the audience *"these are last month's logs we're walking through"* — works fine for a live demo.

---

## Full trainer runbook

Talking points, Q&A prep, timing, troubleshooting, and the RTCTF-mapping explanation are in the training kit:

- `handouts/sre_triage_demo.md` — demo 1
- `handouts/postmortem_subagent_guide.md` — demo 2
