import { REFERRAL_DEEP_LINK_PREFIX } from "@nova-org/shared";

/**
 * Parses the `/start` deep-link payload for a referral code.
 * Example: https://t.me/NovaOrgBot?start=ref_USERCODE
 */
export function parseReferralCode(startPayload: string | undefined): string | undefined {
  if (!startPayload) return undefined;
  if (!startPayload.startsWith(REFERRAL_DEEP_LINK_PREFIX)) return undefined;

  const code = startPayload.slice(REFERRAL_DEEP_LINK_PREFIX.length).trim();
  return code.length > 0 ? code : undefined;
}
