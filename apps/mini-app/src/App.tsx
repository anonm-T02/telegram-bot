import { useEffect, useState } from "react";
import { APP_NAME } from "@nova-org/shared";
import { useApiHealth } from "./hooks/useApiHealth.js";
import { useClickEngine } from "./hooks/useClickEngine.js";
import { useTelegramSession } from "./hooks/useTelegramSession.js";
import { initTelegram } from "./telegram.js";
import { ReferralScreen } from "./ReferralScreen.js";
import { RewardScreen } from "./RewardScreen.js";
import { SupportScreen } from "./SupportScreen.js";

type View = "home" | "referrals" | "rewards" | "support";

export function App(): JSX.Element {
  useEffect(() => initTelegram(), []);
  const [view, setView] = useState<View>("home");
  const health = useApiHealth();
  const session = useTelegramSession();
  const engine = useClickEngine(session.status === "ready" ? session.client : undefined);
  const data = engine.state.status === "ready" ? engine.state.data : undefined;
  const progress = data?.dailyLimit
    ? Math.min(100, (data.dailyAccepted / data.dailyLimit) * 100)
    : 0;
  const cooldownSeconds = Math.ceil(engine.cooldownMs / 1000);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">NOVA CORE</span>
          <strong>{APP_NAME}</strong>
        </div>
        <span className={`connection connection--${health.status}`}>
          {health.status === "loading" && "CONNECTING"}
          {health.status === "success" && "● SECURE"}
          {health.status === "error" && "● OFFLINE"}
        </span>
      </header>

      <section className="panel session-panel" aria-label="Telegram session">
        <span className="label">SESSION</span>
        <strong>
          {session.status === "authenticating" && "Authenticating…"}
          {session.status === "ready" && `● ${session.activity}`}
          {(session.status === "unavailable" || session.status === "error") && session.message}
        </strong>
      </section>

      {view === "home" ? (
        <section className="core-panel" aria-labelledby="coin-core-title">
          <div className="core-heading">
            <div>
              <span className="eyebrow">SERVER-CONFIRMED REWARDS</span>
              <h1 id="coin-core-title">Coin Core</h1>
            </div>
            <span className="unit">1 TAP = 1 μCOIN</span>
          </div>

          <div
            className="balance"
            aria-label={`${data?.balanceMicrocoins ?? "0"} microcoins balance`}
          >
            <span>BALANCE</span>
            <strong>{data?.balanceMicrocoins ?? "—"}</strong>
            <small>μCOIN</small>
          </div>

          <button
            className="coin-button"
            type="button"
            disabled={engine.disabled}
            onClick={() => void engine.click()}
            aria-describedby="coin-feedback"
          >
            <span className="coin-button__mark">N</span>
            <span>
              {engine.state.status === "loading" && "SYNCING"}
              {engine.state.status === "ready" && engine.state.submitting && "CONFIRMING"}
              {engine.state.status === "ready" &&
                !engine.state.submitting &&
                cooldownSeconds > 0 &&
                `READY IN ${cooldownSeconds}s`}
              {engine.state.status === "ready" &&
                !engine.state.submitting &&
                cooldownSeconds === 0 &&
                (data?.sessionEligible === false
                  ? "SESSION PAUSED"
                  : data?.dailyRemaining === 0
                    ? "LIMIT REACHED"
                    : "ACTIVATE CORE")}
            </span>
          </button>

          <div
            id="coin-feedback"
            className={`feedback ${engine.state.status === "ready" && engine.state.error ? "feedback--error" : ""}`}
            aria-live="polite"
          >
            {engine.state.status === "loading" && "Loading server click status…"}
            {engine.state.status === "ready" && engine.state.error}
            {engine.state.status === "ready" && !engine.state.error && engine.state.message}
            {engine.state.status === "ready" &&
              !engine.state.error &&
              !engine.state.message &&
              (data?.sessionEligible === false
                ? data.sessionRejection === "SESSION_NOT_REWARDABLE"
                  ? "Another active session is currently eligible for rewards."
                  : "Keep this Telegram session active and visible to enable taps."
                : "Rewards are calculated and recorded only by the server.")}
          </div>

          <div className="daily-row">
            <span>DAILY PROGRESS</span>
            <strong>{data ? `${data.dailyAccepted} / ${data.dailyLimit}` : "— / —"}</strong>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-label="Daily confirmed taps"
            aria-valuemin={0}
            aria-valuemax={data?.dailyLimit ?? 0}
            aria-valuenow={data?.dailyAccepted ?? 0}
          >
            <span style={{ width: `${progress}%` }} />
          </div>
          <p className="remaining">
            {data ? `${data.dailyRemaining} confirmed taps remaining today` : "Syncing limits…"}
          </p>
        </section>
      ) : view === "referrals" ? (
        <ReferralScreen client={session.status === "ready" ? session.client : undefined} />
      ) : view === "rewards" ? (
        <RewardScreen client={session.status === "ready" ? session.client : undefined} />
      ) : (
        <SupportScreen client={session.status === "ready" ? session.client : undefined} />
      )}

      {health.status === "error" && (
        <section className="panel error-panel" role="alert">
          Unable to reach the API: {health.message}
        </section>
      )}
      <nav className="bottom-nav" aria-label="Primary navigation">
        <button
          type="button"
          aria-current={view === "home" ? "page" : undefined}
          onClick={() => setView("home")}
        >
          <span aria-hidden="true">⌂</span>
          Home
        </button>
        <button
          type="button"
          aria-current={view === "referrals" ? "page" : undefined}
          onClick={() => setView("referrals")}
        >
          <span aria-hidden="true">◇</span>
          Referrals
        </button>
        <button
          type="button"
          aria-current={view === "rewards" ? "page" : undefined}
          onClick={() => setView("rewards")}
        >
          <span aria-hidden="true">☆</span>
          Rewards
        </button>
        <button
          type="button"
          aria-current={view === "support" ? "page" : undefined}
          onClick={() => setView("support")}
        >
          <span aria-hidden="true">?</span>Support
        </button>
      </nav>
    </main>
  );
}
