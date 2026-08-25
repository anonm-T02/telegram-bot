# Database

`packages/db` wires up a Prisma client pointed at `DATABASE_URL`, but no
domain models are defined yet. The full schema (users, wallets,
coin_transactions, devices, contribution_sessions, work_units, tasks,
task_claims, referrals, services, service_usage, admin_logs) is specified in
`NOVA_ORG_AGENT_PLAN.md` section 9 and will be added in Phase 2 by
AGENT 2 (Database + Auth).
