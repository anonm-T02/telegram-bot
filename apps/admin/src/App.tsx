import { useEffect, useState } from "react";
import { APP_NAME } from "@nova-org/shared";

const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:4000").replace(/\/$/, "");
type View = "overview" | "users" | "rewards" | "fraud" | "audit" | "settings";
type Dashboard = {
  generatedAt: string;
  users: { total: number; online: number };
  coins: { issuedMicrocoins: string; spentMicrocoins: string };
  fraud: { openSignals: number };
  rewards: {
    byStatus: Record<string, number>;
    today: { limitUnits: number; reservedUnits: number; paidUnits: number };
  };
};
const views: Array<[View, string]> = [
  ["overview", "Overview"],
  ["users", "Users"],
  ["rewards", "Rewards"],
  ["fraud", "Fraud"],
  ["audit", "Audit log"],
  ["settings", "Settings"],
];

export function App(): JSX.Element {
  const [token, setToken] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [view, setView] = useState<View>("overview");
  const [dashboard, setDashboard] = useState<Dashboard>();
  const [payload, setPayload] = useState<unknown>();
  const [status, setStatus] = useState("Admin Telegram sessiyasi bilan kiring.");
  async function telegramLogin() {
    setLoginBusy(true);
    setStatus("Telegram tasdiqlash havolasi tayyorlanmoqda…");
    try {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const verifier = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
      const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replaceAll("=", "");
      const created = await fetch(`${API_URL}/admin/auth/challenge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ codeChallenge: challenge }),
      });
      if (!created.ok) throw new Error("Kirish so‘rovini yaratib bo‘lmadi.");
      const login = (await created.json()) as { challengeId: string; botDeepLink: string };
      window.open(login.botDeepLink, "_blank", "noopener,noreferrer");
      setStatus("Telegram botda START tugmasini bosing. Tasdiq kutilmoqda…");
      for (let attempt = 0; attempt < 100; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 3000));
        const exchanged = await fetch(`${API_URL}/admin/auth/exchange`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ challengeId: login.challengeId, codeVerifier: verifier }),
        });
        if (exchanged.status === 202) continue;
        if (!exchanged.ok) throw new Error("Telegram tasdiqlashi bekor qilindi yoki eskirdi.");
        const session = (await exchanged.json()) as { token: string };
        setToken(session.token);
        setStatus("");
        return;
      }
      throw new Error("Tasdiqlash vaqti tugadi. Qayta urinib ko‘ring.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Kirish amalga oshmadi.");
    } finally {
      setLoginBusy(false);
    }
  }
  async function request(path: string) {
    const response = await fetch(`${API_URL}/admin${path}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok)
      throw new Error(
        response.status === 403
          ? "Bu Telegram akkauntiga admin ruxsati berilmagan."
          : "Admin sessiyasi yaroqsiz yoki muddati tugagan.",
      );
    return response.json() as Promise<unknown>;
  }
  useEffect(() => {
    if (!token) return;
    setStatus("Yuklanmoqda…");
    void request(view === "overview" ? "/dashboard" : `/${view}`)
      .then((result) => {
        if (view === "overview") setDashboard(result as Dashboard);
        else setPayload(result);
        setStatus("");
      })
      .catch((error: Error) => {
        setStatus(error.message);
        setToken("");
      });
  }, [token, view]);
  if (!token)
    return (
      <main className="login-shell">
        <section className="login-card">
          <span className="eyebrow">SECURE ADMIN ACCESS</span>
          <h1>{APP_NAME} Admin</h1>
          <p>Faqat ruxsat berilgan Telegram administrator sessiyasi qabul qilinadi.</p>
          <button type="button" disabled={loginBusy} onClick={() => void telegramLogin()}>
            {loginBusy ? "TASDIQ KUTILMOQDA…" : "TELEGRAM ORQALI KIRISH"}
          </button>
          <small>{status}</small>
        </section>
      </main>
    );
  return (
    <div className="admin-shell">
      <nav>
        <div>
          <span className="eyebrow">NOVA CONTROL</span>
          <strong>{APP_NAME}</strong>
        </div>
        {views.map(([key, label]) => (
          <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key)}>
            {label}
          </button>
        ))}
        <button
          className="logout"
          onClick={() => {
            setToken("");
          }}
        >
          Chiqish
        </button>
      </nav>
      <main>
        <header>
          <div>
            <span className="eyebrow">ADMIN DASHBOARD</span>
            <h1>{views.find(([key]) => key === view)?.[1]}</h1>
          </div>
          <span className="secure">● SECURE</span>
        </header>
        {status && <div className="notice">{status}</div>}
        {view === "overview" && dashboard && (
          <>
            <section className="metrics">
              <Metric label="Jami users" value={dashboard.users.total} />
              <Metric label="Online" value={dashboard.users.online} />
              <Metric label="Ochiq fraud" value={dashboard.fraud.openSignals} />
              <Metric
                label="Bugungi limit"
                value={`${dashboard.rewards.today.paidUnits + dashboard.rewards.today.reservedUnits} / ${dashboard.rewards.today.limitUnits}`}
              />
            </section>
            <section className="panel">
              <h2>Coin oqimi</h2>
              <div className="two-col">
                <Metric label="Chiqarilgan μCOIN" value={dashboard.coins.issuedMicrocoins} />
                <Metric label="Sarflangan μCOIN" value={dashboard.coins.spentMicrocoins} />
              </div>
            </section>
            <section className="panel">
              <h2>Reward holatlari</h2>
              <div className="status-grid">
                {Object.entries(dashboard.rewards.byStatus).map(([key, value]) => (
                  <div key={key}>
                    <span>{key}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
        {view !== "overview" && !status && <DataTable value={payload} />}
      </main>
    </div>
  );
}
function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function DataTable({ value }: { value: unknown }) {
  const container = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const rows = (Object.values(container).find(Array.isArray) ?? []) as Array<
    Record<string, unknown>
  >;
  if (!rows.length) return <section className="panel empty">Hozircha yozuv yo‘q.</section>;
  const keys = Object.keys(rows[0]!)
    .filter((key) => !["before", "after", "metadata"].includes(key))
    .slice(0, 7);
  return (
    <section className="table-wrap">
      <table>
        <thead>
          <tr>
            {keys.map((key) => (
              <th key={key}>{key}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={String(row.id ?? index)}>
              {keys.map((key) => (
                <td key={key}>{render(row[key])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
function render(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "string" && /^\d{4}-\d\d-\d\dT/.test(value))
    return new Date(value).toLocaleString();
  return String(value);
}
