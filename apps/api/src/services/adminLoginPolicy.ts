import { createHash, timingSafeEqual } from "node:crypto";

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function verifierMatches(verifier: string, expectedChallenge: string): boolean {
  const supplied = Buffer.from(pkceChallenge(verifier));
  const expected = Buffer.from(expectedChallenge);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function parseAdminLoginPayload(payload?: string): string | null {
  if (!payload?.startsWith("admin_")) return null;
  const id = payload.slice("admin_".length);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    ? id
    : null;
}

export function adminExchangeDecision(
  status: "PENDING" | "APPROVED" | "CONSUMED" | "EXPIRED",
  expiresAtMs: number,
  nowMs: number,
  verifierValid: boolean,
): "ALLOW" | "PENDING" | "EXPIRED" | "CONSUMED" | "INVALID_VERIFIER" {
  if (expiresAtMs <= nowMs || status === "EXPIRED") return "EXPIRED";
  if (status === "PENDING") return "PENDING";
  if (status === "CONSUMED") return "CONSUMED";
  return verifierValid ? "ALLOW" : "INVALID_VERIFIER";
}
