import { useState } from "react";
import type { SessionApiClient } from "./apiClient.js";
import { useReferrals } from "./hooks/useReferrals.js";

interface ReferralScreenProps {
  client: SessionApiClient | undefined;
}

const stages = [
  { title: "Registration", reward: "0.005 pending coin", detail: "Invited user joins NOVA." },
  {
    title: "3 active days",
    reward: "+0.005 pending coin",
    detail: "Activity is confirmed on 3 different days.",
  },
  {
    title: "7 active days",
    reward: "+0.010 coin",
    detail: "Seven separate active days are confirmed.",
  },
  {
    title: "Quality verified",
    reward: "Release review",
    detail: "30 active minutes, 300 valid taps and risk checks pass.",
  },
] as const;

const milestoneLabels = {
  REFERRER_REGISTER: "Joined",
  REFERRER_ACTIVE_3_DAYS: "3 days",
  REFERRER_QUALITY_7_DAYS: "7 days",
  REFERRED_USER_QUALITY: "Member quality",
} as const;

const referralStatusLabels = {
  PENDING: "Progress pending",
  ACTIVE: "In progress",
  QUALITY_QUEUED: "Reward queued",
  QUALIFIED: "Requirements met",
  REJECTED: "Not eligible",
  REWARDED: "Reward released",
} as const;

export function ReferralScreen({ client }: ReferralScreenProps): JSX.Element {
  const { state, retry } = useReferrals(client, true);
  const [copyStatus, setCopyStatus] = useState("");

  const copyLink = async (link: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(link);
      setCopyStatus("Referral link copied.");
    } catch {
      setCopyStatus("Could not copy automatically. Press and hold the link to copy it.");
    }
  };

  return (
    <section className="referral-view" aria-labelledby="referral-title">
      <div className="screen-heading">
        <span className="eyebrow">NETWORK GROWTH</span>
        <h1 id="referral-title">Referrals</h1>
        <p>Invite real, active members. Every milestone is verified by the server.</p>
      </div>

      {(state.status === "idle" || state.status === "loading") && (
        <section className="panel state-panel" aria-live="polite">
          Loading referral status…
        </section>
      )}
      {state.status === "error" && (
        <section className="panel state-panel state-panel--error" role="alert">
          <p>{state.message}</p>
          <button className="secondary-button" type="button" onClick={() => void retry()}>
            Retry
          </button>
        </section>
      )}
      {state.status === "ready" && (
        <>
          <section className="panel invite-card" aria-labelledby="invite-title">
            <span className="label">YOUR PERSONAL LINK</span>
            <h2 id="invite-title">Invite to NOVA</h2>
            <div className="link-box">
              <span>{state.data.referralLink}</span>
              <button type="button" onClick={() => void copyLink(state.data.referralLink)}>
                Copy link
              </button>
            </div>
            <p className="assistive-status" aria-live="polite">
              {copyStatus}
            </p>
          </section>

          <section className="stats-grid" aria-label="Referral totals">
            <div className="panel metric">
              <span>Total invited</span>
              <strong>{state.data.stats.invitedCount}</strong>
            </div>
            <div className="panel metric">
              <span>Pending</span>
              <strong>{state.data.stats.pendingCount}</strong>
            </div>
            <div className="panel metric">
              <span>Available</span>
              <strong>{state.data.stats.availableCount}</strong>
            </div>
            <div className="panel metric">
              <span>Quality today</span>
              <strong>{state.data.stats.qualityReleasedToday} / 5</strong>
            </div>
          </section>

          <section className="panel rewards-summary" aria-label="Referral reward status">
            <div>
              <span>Pending rewards</span>
              <strong>{state.data.stats.totalPending} μCOIN</strong>
            </div>
            <div>
              <span>Available rewards</span>
              <strong>{state.data.stats.totalAvailable} μCOIN</strong>
            </div>
            {state.data.stats.queuedCount > 0 && (
              <p>
                {state.data.stats.queuedCount} quality reward(s) waiting for a future daily release.
              </p>
            )}
          </section>

          {state.data.referrals.length > 0 && (
            <section className="panel referral-list" aria-labelledby="recent-referrals-title">
              <span className="label">RECENT ACTIVITY</span>
              <h2 id="recent-referrals-title">Referral progress</h2>
              <ul>
                {state.data.referrals.map((referral) => (
                  <li key={referral.id}>
                    <div className="referral-list__heading">
                      <strong>Invite {referral.id.slice(-6)}</strong>
                      <span>{referralStatusLabels[referral.status]}</span>
                    </div>
                    <div className="milestone-chips" aria-label="Milestone statuses">
                      {referral.milestones.map((milestone) => (
                        <span key={milestone.type}>
                          {milestoneLabels[milestone.type]}: {milestone.status.replaceAll("_", " ")}
                        </span>
                      ))}
                    </div>
                    <p className="referral-metrics">
                      {referral.metrics.activeDays} active days · {referral.metrics.validClicks}{" "}
                      taps · {Math.floor(referral.metrics.activeSeconds / 60)} active min
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <section className="panel milestones" aria-labelledby="milestone-title">
        <span className="label">VERIFIED STAGES</span>
        <h2 id="milestone-title">How rewards unlock</h2>
        <ol>
          {stages.map((stage, index) => (
            <li key={stage.title}>
              <span className="step-number">{index + 1}</span>
              <div>
                <strong>{stage.title}</strong>
                <p>{stage.detail}</p>
              </div>
              <small>{stage.reward}</small>
            </li>
          ))}
        </ol>
      </section>

      <section className="rules" aria-labelledby="rules-title">
        <h2 id="rules-title">Fair network rules</h2>
        <p>
          Self-referrals and changing referrers are blocked. Only five quality bonuses can be
          released per referrer each day; extra verified rewards remain queued. IP address is only
          one risk signal and never causes an automatic ban by itself.
        </p>
      </section>
    </section>
  );
}
