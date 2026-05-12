# Incident Report — Redis Port Misconfiguration Causes Total order-service Outage

**Incident ID:** INC-20260512-01
**Severity:** SEV-2
**Status:** Resolved
**Date:** 2026-05-12 UTC
**Duration:** 6m
**Author:** Drafted by postmortem-writer agent (review and edit before publishing)

---

## TL;DR

At 02:58 UTC on 2026-05-12, the order-service began rejecting 100% of inbound requests with `ECONNREFUSED` errors targeting Redis on port 6380. The root cause was a configuration change introduced in the v1.2.5 deploy at 02:00 UTC that updated `REDIS_PORT` from 6379 (production standard) to 6380 as part of an in-progress cache cluster migration that was not yet ready. The misconfiguration caused the service to be unable to reach Redis on startup, making every request that touched the cache or session store fail immediately. The configuration was reverted and service health was confirmed restored at 03:04 UTC — a total customer-facing outage of approximately 6 minutes.

---

## Impact

- **Services impacted:** order-service (order processing API, cache layer, session store)
- **Customers affected:** All users of the order-service during the window — exact customer count unknown, needs metrics review
- **Duration:** 02:58 UTC → 03:04 UTC (6 minutes)
- **Error rate at peak:** 100% — every inbound request returned a connection failure (confirmed by PagerDuty alert and log pattern; every request entry in the application log is a `Request failed` during the incident window)
- **Revenue / SLO impact:** Pending — all order transactions during the 6-minute window would have failed; revenue impact requires cross-reference with order volume metrics for 02:58–03:04 UTC

---

## Timeline (all times UTC)

| Time | Event | Source |
|---|---|---|
| 2026-05-12 02:00 | v1.2.5 deployed; `REDIS_PORT` changed from `6379` to `6380` in `.env` as part of a work-in-progress cache cluster migration | `deploys.log:3` |
| 02:58:11 | order-service process started (likely a delayed restart post-deploy or a scheduled restart window); service reports listening on port 3000 | `orders-2026-05-12.log:1` |
| 02:58:14 | First `ECONNREFUSED` error recorded — service attempts to connect to Redis at `127.0.0.1:6380`; no listener exists on that port | `orders-2026-05-12.log:2` |
| 02:58:14 | First inbound request fails immediately due to Redis connection failure | `orders-2026-05-12.log:3` |
| 02:58 | PagerDuty fires SEV-2 alert: order-service error rate 100%, ECONNREFUSED detected | `slack-transcript.txt:1` |
| 02:59 | On-call SRE acknowledges alert and begins pulling logs | `slack-transcript.txt:2` |
| 02:58:14–02:58:40 | Continuous stream of paired Redis connection errors and failed requests — one ECONNREFUSED per reconnection attempt, one `Request failed` per inbound request | `orders-2026-05-12.log:2–23` |
| 03:01 | On-call SRE confirms Redis is being contacted on port 6380; expected port is 6379; root cause identified | `slack-transcript.txt:3` |
| 03:02 | Root cause confirmed as the v1.2.5 deploy having changed `REDIS_PORT` in `.env` | `slack-transcript.txt:4` |
| 03:03 | Configuration revert initiated — `REDIS_PORT` restored to `6379` | `slack-transcript.txt:5` |
| 03:04 | Service confirmed healthy; error rate returns to baseline | `slack-transcript.txt:6` |
| 03:05 | On-call SRE flags post-mortem to be written | `slack-transcript.txt:7` |

---

## Root Cause

The v1.2.5 deploy, shipped at 02:00 UTC, updated `REDIS_PORT` in the `.env` configuration from `6379` (the production standard, as documented in `CLAUDE.md`) to `6380`, in anticipation of an in-progress cache cluster migration. The migration was not yet complete and no Redis instance was listening on port 6380 in the production environment. Because the order-service is architected to require Redis — the service crashes or degrades completely when Redis is unreachable — every request that required cache or session access failed with `ECONNREFUSED 127.0.0.1:6380` from the moment the service process came up.

The delay between the deploy timestamp (02:00) and the first error timestamp (02:58:11) indicates the service process was not immediately restarted after the deploy, or a scheduled/rolling restart occurred approximately 58 minutes later. The misconfiguration was therefore dormant until the process restart activated it. Once active, the failure mode was total: 100% of requests failed for the entire 6-minute window until the configuration was reverted.

---

## Contributing Factors

- **Incomplete migration gating** — The `REDIS_PORT` value was updated to target an infrastructure resource (port 6380) that did not yet exist in production. There was no mechanism to validate that the target port was reachable before the configuration change was deployed. (`deploys.log:3` — "cache cluster migration WIP")

- **No pre-deploy smoke test for Redis connectivity** — The deploy pipeline did not include a step to verify that the service could successfully connect to Redis using the new configuration before traffic was shifted. A connectivity check at deploy time would have caught this immediately.

- **Hard dependency on Redis with no graceful degradation** — Per `CLAUDE.md`: "Redis is required; service crashes if unreachable." The service has no fallback behavior when Redis is unavailable — all requests fail rather than a degraded subset. This amplifies the blast radius of any Redis connectivity issue from partial degradation to total outage.

- **Delayed process restart obscured the misconfiguration window** — The ~58-minute gap between the deploy and the first error (02:00 → 02:58:11) meant the configuration change was not immediately validated in production. This delayed detection and could have caused the misconfiguration to persist unnoticed through low-traffic periods.

- **Work-in-progress configuration in a production deploy** — The deploy description explicitly flags the change as "WIP" (`deploys.log:3`). A configuration change targeting infrastructure that is not yet provisioned was promoted to production without a feature flag, environment guard, or rollback pre-plan.

---

## What Went Well

- **PagerDuty detection was immediate** — The alerting system fired a SEV-2 alert within the same minute as the first error (02:58), leaving no detection lag.
- **On-call response was fast** — The on-call SRE acknowledged within one minute and had root cause identified within three minutes of the alert.
- **Root cause was unambiguous** — The application logs clearly showed the wrong port (`6380`), the deploy log clearly showed which change introduced it, and the Slack transcript shows this was confirmed quickly without guessing.
- **Revert was clean and fast** — The configuration revert resolved the incident in under two minutes (03:03 → 03:04), and no secondary issues were introduced.
- **Total outage window was short** — Despite 100% error rate, the combined detection-to-resolution time of approximately 6 minutes limited customer exposure.

---

## What Went Wrong

- **A work-in-progress infrastructure change was shipped to production** — The `REDIS_PORT` change was premature; the target port was not yet serving traffic. Production deploys should not activate configuration that depends on infrastructure not yet provisioned.
- **No connectivity validation in the deploy pipeline** — The pipeline did not assert that Redis was reachable on the configured port before completing the deploy. This is a process gap that applies to any configuration-driven dependency.
- **Service has no graceful degradation for Redis unavailability** — The all-or-nothing Redis dependency converted what could have been a partial cache miss scenario into a complete service outage.
- **Process restart timing was opaque** — The ~58-minute lag between deploy and activation of the misconfiguration suggests the deployment process does not immediately restart the service or verify it is healthy post-deploy, creating a window where a broken configuration can sit undetected.

---

## Action Items

| # | Action | System / Team | Priority | Status |
|---|---|---|---|---|
| 1 | Add a Redis connectivity health check to the deploy pipeline that validates the configured `REDIS_PORT` is reachable before the deploy is marked successful | Deploy pipeline / Platform team | P1 | Proposed |
| 2 | Add a post-deploy smoke test that exercises at least one Redis read and one Redis write against the production configuration before traffic is shifted | Deploy pipeline / Platform team | P1 | Proposed |
| 3 | Require that configuration changes referencing in-progress infrastructure migrations be gated behind a feature flag or environment variable toggle, so they can be deployed safely and activated separately | Configuration management / Platform team | P1 | Proposed |
| 4 | Evaluate and implement graceful degradation for Redis unavailability in order-service — at minimum, return a 503 with a `Retry-After` header rather than an unhandled connection error, so clients can back off rather than hammering a failing service | order-service / Backend team | P2 | Proposed |
| 5 | Instrument a startup health check endpoint (`/healthz`) that validates Redis connectivity on boot; configure the process supervisor or orchestrator to gate traffic on a passing health check | order-service / Platform team | P2 | Proposed |
| 6 | Ensure the deploy process triggers an immediate service restart and waits for the health check to pass before considering the deploy complete, eliminating the delayed-activation gap observed in this incident | Deploy pipeline / Platform team | P2 | Proposed |
| 7 | Add a deploy policy check that flags any configuration value referencing a port or host that differs from the documented production standard (e.g., `REDIS_PORT != 6379`) for explicit sign-off before promotion to production | Deploy pipeline / Platform team | P3 | Proposed |
| 8 | Document the cache cluster migration plan — target port, readiness criteria, rollback plan, and activation steps — so future migration-related config changes can be reviewed against a defined plan | order-service / Platform team | P3 | Proposed |

---

## Open Questions

- **What caused the ~58-minute delay between the v1.2.5 deploy (02:00) and the service restart (02:58:11)?** Is there a scheduled restart, a rolling deploy window, or a manual restart step that introduces this lag? Understanding this is needed to close action item 6.
- **What is the exact customer and order impact?** The Slack transcript and logs confirm 100% error rate but do not include order volume metrics for the 02:58–03:04 window. Revenue and SLO impact cannot be calculated without cross-referencing the order volume data source (likely a metrics dashboard or database query).
- **Was the cache cluster migration on port 6380 fully planned and tracked?** The deploy note says "WIP" but there is no linked issue or migration document in the available artifacts. The scope and timeline of that work should be confirmed to ensure action item 3 is applied to the correct change.
- **Was the `REDIS_PORT` change the only configuration change in v1.2.5?** The deploy log entry (`deploys.log:3`) describes only the port change, but it is worth confirming whether any other configuration or code changes were included in that deploy that should be reviewed.
- **Are there dashboard screenshots or monitoring graphs for the incident window?** No monitoring snapshots were present in the incident artifact directory. These would help verify the error rate timeline and confirm the exact recovery time more precisely than the Slack transcript allows.

---

## Evidence

- Application log: `postmortems/2026-05-12-order-service-redis/orders-2026-05-12.log` (also present at `logs/orders-2026-05-12.log` — contents are identical)
- Deploy history: `postmortems/2026-05-12-order-service-redis/deploys.log` (also present at `logs/deploys.log` — contents are identical); v1.2.5 entry at line 3
- Incident Slack transcript: `postmortems/2026-05-12-order-service-redis/slack-transcript.txt`
- Service architecture reference: `CLAUDE.md` — documents Redis as a required dependency on port 6379
- Missing: monitoring dashboard screenshots or graphs for 02:00–03:10 UTC
- Missing: `.env` snapshot at time of incident (would confirm exact `REDIS_PORT` value as deployed)
- Missing: on-call runbook or escalation policy document
- Missing: migration plan or issue tracker link for the cache cluster migration referenced in v1.2.5
