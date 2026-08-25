import type { CSSProperties, PropsWithChildren } from "react";
import { theme } from "./theme.js";

const cardStyle: CSSProperties = {
  background: theme.colors.surface,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: 8,
  padding: 16,
  color: theme.colors.text,
};

/**
 * Base card surface used across the Mini App and Admin Panel, following
 * the "premium dark / minimal cyber" design system.
 */
export function Card({ children }: PropsWithChildren): JSX.Element {
  return <div style={cardStyle}>{children}</div>;
}
