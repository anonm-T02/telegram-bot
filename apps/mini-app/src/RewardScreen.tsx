import { useEffect, useRef, useState } from "react";
import type { RewardItem, RewardsResponse, SessionApiClient } from "./apiClient.js";
import { SessionRequestError } from "./apiClient.js";

const statusLabels: Record<RewardItem["status"], string> = {
  REQUESTED: "Qabul qilindi",
  RISK_CHECK: "Tekshirilmoqda",
  APPROVED: "Tasdiqlandi",
  QUEUED: "Navbatda",
  SENDING: "Yuborilmoqda",
  PAID: "To‘landi",
  REVIEW_REQUIRED: "Qo‘lda tekshiruvda",
  FAILED: "Yuborilmadi",
  REJECTED: "Rad etildi",
  REFUNDED: "Coin qaytarildi",
};

function newKey() {
  return `reward_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function RewardScreen({ client }: { client?: SessionApiClient }): JSX.Element {
  const [data, setData] = useState<RewardsResponse>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const pendingKey = useRef<string>();

  async function load() {
    if (!client) return;
    setLoading(true);
    try {
      setData(await client.getRewards());
      setMessage("");
    } catch {
      setMessage("Mukofot ma’lumotlarini yuklab bo‘lmadi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [client]);

  async function requestReward() {
    if (!client || submitting) return;
    pendingKey.current ??= newKey();
    setSubmitting(true);
    setMessage("");
    try {
      const result = await client.requestReward(pendingKey.current);
      pendingKey.current = undefined;
      setMessage(
        result.duplicate
          ? "Bugungi so‘rov avval qabul qilingan."
          : "Mukofot so‘rovi qabul qilindi.",
      );
      setData(await client.getRewards());
    } catch (error) {
      if (error instanceof SessionRequestError && error.definitive) pendingKey.current = undefined;
      setMessage(
        error instanceof SessionRequestError && error.body.error === "INSUFFICIENT_BALANCE"
          ? "So‘rov uchun kamida 100 000 μCOIN kerak."
          : "So‘rovni yuborib bo‘lmadi. Qayta urinish mumkin.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="reward-view" aria-labelledby="rewards-title">
      <div className="screen-heading">
        <span className="eyebrow">SERVER-CONTROLLED PAYOUTS</span>
        <h2 id="rewards-title">Rewards</h2>
        <p>10 Stars qiymatidagi Telegram mukofoti — 100 000 μCOIN.</p>
      </div>
      <div className="reward-balances">
        <div className="panel metric">
          <span>Mavjud</span>
          <strong>{data?.wallet.availableMicrocoins ?? "—"}</strong>
          <small>μCOIN</small>
        </div>
        <div className="panel metric">
          <span>Bloklangan</span>
          <strong>{data?.wallet.lockedMicrocoins ?? "—"}</strong>
          <small>μCOIN</small>
        </div>
      </div>
      <button
        className="secondary-button reward-request"
        type="button"
        disabled={!client || loading || submitting}
        onClick={() => void requestReward()}
      >
        {submitting ? "YUBORILMOQDA…" : "MUKOFOT SO‘RASH"}
      </button>
      <p className="assistive-status" aria-live="polite">
        {message}
      </p>
      <div className="panel reward-history">
        <span className="label">SO‘ROVLAR TARIXI</span>
        {loading ? (
          <p>Yuklanmoqda…</p>
        ) : data?.rewards.length ? (
          <ul>
            {data.rewards.map((reward) => (
              <li key={reward.id}>
                <div>
                  <strong>{reward.rewardUnits} birlik</strong>
                  <small>{new Date(reward.requestedAt).toLocaleDateString()}</small>
                </div>
                <span>{statusLabels[reward.status]}</span>
                {reward.failureCode && <small>{reward.failureCode}</small>}
              </li>
            ))}
          </ul>
        ) : (
          <p>Hozircha mukofot so‘rovi yo‘q.</p>
        )}
      </div>
    </section>
  );
}
