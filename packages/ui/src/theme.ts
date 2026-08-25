/**
 * NOVA ORG design tokens.
 * See NOVA_ORG_AGENT_PLAN.md section 22 (UI Design System).
 */
export const theme = {
  colors: {
    background: "#05090D",
    surface: "#0A1118",
    surface2: "#0D1720",
    border: "rgba(68, 220, 235, 0.18)",
    primaryCyan: "#36DDE8",
    teal: "#34C8B6",
    gold: "#D5A84B",
    warning: "#E5A84B",
    critical: "#D95C5C",
    success: "#40C78B",
    text: "#EAF4F5",
    muted: "#7F9198",
  },
} as const;

export type Theme = typeof theme;
