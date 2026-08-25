# Architecture

See `NOVA_ORG_AGENT_PLAN.md` section 4 (Umumiy arxitektura) for the full
system diagram: Telegram Bot + Mini App → Backend API → PostgreSQL/Redis/Queue
→ Work Controller → Server Worker + User Devices → Validator → Reward Engine
→ NOVA Coin ledger.

This document will be expanded with implementation details as each phase
lands.
