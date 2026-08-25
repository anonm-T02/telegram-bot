const REFERRAL_PREFIX = "ref_";

/**
 * Parses the `/start` deep-link payload for a referral code.
 * Example: https://t.me/NovaOrgBot?start=ref_USERCODE
 *
 * Phase 1 only extracts the code; persisting it against a user record
 * is implemented in Phase 2 once the users/referrals schema exists
 * (see NOVA_ORG_AGENT_PLAN.md section 9 and AGENT 2/AGENT 3).
 */
export function parseReferralCode(startPayload: string | undefined): string | undefined {
  if (!startPayload) return undefined;
  if (!startPayload.startsWith(REFERRAL_PREFIX)) return undefined;

  const code = startPayload.slice(REFERRAL_PREFIX.length).trim();
  return code.length > 0 ? code : undefined;
}
