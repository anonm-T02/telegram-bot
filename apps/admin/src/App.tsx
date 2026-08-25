import { useEffect, useState } from "react";
import { Card, theme } from "@nova-org/ui";
import { APP_NAME } from "@nova-org/shared";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

const OVERVIEW_SECTIONS = [
  "Overview",
  "Users",
  "Wallet",
  "Contribution",
  "Workers",
  "Tasks",
  "Services",
  "Referrals",
  "Leaderboard",
  "Security",
  "Settings",
  "Logs",
];

export function App(): JSX.Element {
  const [apiStatus, setApiStatus] = useState<"loading" | "online" | "offline">("loading");

  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then((res) => setApiStatus(res.ok ? "online" : "offline"))
      .catch(() => setApiStatus("offline"));
  }, []);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <nav
        style={{
          width: 200,
          borderRight: `1px solid ${theme.colors.border}`,
          padding: 16,
        }}
      >
        <strong>{APP_NAME} Admin</strong>
        <ul style={{ listStyle: "none", padding: 0, marginTop: 16 }}>
          {OVERVIEW_SECTIONS.map((section) => (
            <li key={section} style={{ padding: "8px 0", color: theme.colors.muted }}>
              {section}
            </li>
          ))}
        </ul>
      </nav>

      <main style={{ flex: 1, padding: 24 }}>
        <Card>
          <p style={{ margin: 0, color: theme.colors.muted }}>API status</p>
          <p style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 600 }}>
            {apiStatus === "loading" && "Checking…"}
            {apiStatus === "online" && "● Online"}
            {apiStatus === "offline" && "● Offline"}
          </p>
        </Card>
        <p style={{ color: theme.colors.muted, marginTop: 16 }}>
          KPI widgets, user tables, and fraud alerts ship starting Phase 4.
        </p>
      </main>
    </div>
  );
}
