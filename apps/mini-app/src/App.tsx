import { useEffect } from "react";
import { Card, theme } from "@nova-org/ui";
import { APP_NAME, COIN_TICKER } from "@nova-org/shared";
import { useApiHealth } from "./hooks/useApiHealth.js";
import { initTelegram } from "./telegram.js";

export function App(): JSX.Element {
  useEffect(() => {
    initTelegram();
  }, []);

  const health = useApiHealth();

  return (
    <main
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        padding: 16,
        maxWidth: 480,
        margin: "0 auto",
        width: "100%",
      }}
    >
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong>{APP_NAME}</strong>
        <span style={{ color: theme.colors.muted, fontSize: 12 }}>
          {health.status === "loading" && "Connecting…"}
          {health.status === "success" && `● ${health.data.status.toUpperCase()}`}
          {health.status === "error" && "● OFFLINE"}
        </span>
      </header>

      <Card>
        <p style={{ margin: 0, color: theme.colors.muted }}>{COIN_TICKER} balance</p>
        <p style={{ margin: "4px 0 0", fontSize: 32, fontWeight: 600 }}>—</p>
        <p style={{ margin: "8px 0 0", fontSize: 12, color: theme.colors.muted }}>
          Wallet, tasks, and contribution features ship in Phase 2/3.
        </p>
      </Card>

      {health.status === "error" && (
        <Card>
          <p style={{ margin: 0, color: theme.colors.critical }}>
            Unable to reach the API: {health.message}
          </p>
        </Card>
      )}
    </main>
  );
}
