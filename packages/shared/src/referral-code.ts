const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no 0/O/1/I to avoid confusion
const CODE_LENGTH = 8;

/**
 * Generates a short, human-shareable referral code (e.g. `A7K9QX3P`).
 * Uses the Web Crypto API (available in both Node.js 20+ and browsers)
 * so this module stays bundler-friendly for the Mini App/Admin builds.
 * Collisions are handled by the caller (retry with a fresh code on a
 * unique-constraint violation) since this module has no DB access.
 */
export function generateReferralCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);

  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  }
  return code;
}
