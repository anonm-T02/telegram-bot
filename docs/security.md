# Security

Key principles (see `NOVA_ORG_AGENT_PLAN.md` sections 2.1, 12, 13, 29):

- Device contribution never starts automatically; it requires explicit
  user consent (`START` / `STOP`).
- Coin balances only change through the backend reward engine and ledger —
  never via a direct client-supplied amount.
- Telegram `initData` is validated server-side before trusting any user
  identity.
- Work units are signed, time-limited, and checked for replay/duplicate
  submission before being counted.
- Secrets (`JWT_SECRET`, `SESSION_SECRET`, `WORK_SIGNING_SECRET`,
  `TELEGRAM_BOT_TOKEN`) are provided via environment variables and must
  never be committed to the repository.

These controls are implemented incrementally starting Phase 2/3.
