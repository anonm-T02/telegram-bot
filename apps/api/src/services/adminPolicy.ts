export function isConfiguredAdmin(telegramId: bigint, configuredIds: string[]): boolean {
  return configuredIds.includes(telegramId.toString());
}

export function canAdminMutate(role: string, action: "USER_STATUS" | "SETTING"): boolean {
  if (role === "SUPER_ADMIN") return true;
  return role === "OPERATOR" && action === "USER_STATUS";
}

export function settingValueIsValid(key: string, value: boolean | number): boolean {
  if (key === "reward.payoutPaused") return typeof value === "boolean";
  if (key === "reward.dailyLimitUnits")
    return typeof value === "number" && value >= 1 && value <= 1_000;
  return false;
}

type AuditReplay = {
  adminId: string;
  action: string;
  entityId: string;
  after: unknown;
  metadata: unknown;
};

function objectValue(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null && key in value
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

export function adminReplayMatches(
  existing: AuditReplay,
  expected: {
    adminId: string;
    action: string;
    entityId: string;
    payloadKey: "status" | "value";
    payloadValue: string | boolean | number;
    reason: string;
  },
): boolean {
  return (
    existing.adminId === expected.adminId &&
    existing.action === expected.action &&
    existing.entityId === expected.entityId &&
    objectValue(existing.after, expected.payloadKey) === expected.payloadValue &&
    objectValue(existing.metadata, "reason") === expected.reason
  );
}
