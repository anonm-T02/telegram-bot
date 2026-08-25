# API

Phase 1 exposes a single endpoint:

```
GET /health
```

Response:

```json
{ "status": "ok", "service": "nova-org-api", "timestamp": "2026-08-25T00:00:00.000Z" }
```

The full API surface (auth, wallet, contribution, work, tasks, referral,
services, leaderboard) is defined in `NOVA_ORG_AGENT_PLAN.md` section 20 and
will be implemented in Phase 2/3.
