import { useCallback, useEffect, useRef, useState } from "react";
import { SessionApiClient, SessionRequestError, type ClickStatusResponse } from "../apiClient.js";

type ClickEngineState =
  | { status: "loading" }
  | {
      status: "ready";
      data: ClickStatusResponse;
      submitting: boolean;
      message?: string;
      error?: string;
    };

function statusFromError(
  error: SessionRequestError,
  previous: ClickStatusResponse,
): ClickStatusResponse {
  if (error.body.error === "COOLDOWN" && error.body.nextAllowedAt) {
    return {
      ...previous,
      canClick: false,
      nextAllowedAt: error.body.nextAllowedAt,
      balanceMicrocoins: error.body.balanceMicrocoins ?? previous.balanceMicrocoins,
    };
  }
  if (error.body.error === "DAILY_LIMIT") {
    const dailyAccepted = error.body.dailyAccepted ?? previous.dailyAccepted;
    const dailyLimit = error.body.dailyLimit ?? previous.dailyLimit;
    return {
      ...previous,
      dailyAccepted,
      dailyLimit,
      dailyRemaining: Math.max(0, dailyLimit - dailyAccepted),
      canClick: false,
      balanceMicrocoins: error.body.balanceMicrocoins ?? previous.balanceMicrocoins,
    };
  }
  return previous;
}

export function useClickEngine(client: SessionApiClient | undefined) {
  const [state, setState] = useState<ClickEngineState>({ status: "loading" });
  const [now, setNow] = useState(Date.now());
  const pendingRequestId = useRef<string>();

  useEffect(() => {
    pendingRequestId.current = undefined;
    if (!client) return;
    let disposed = false;
    client
      .getClickStatus()
      .then((data) => {
        if (!disposed) setState({ status: "ready", data, submitting: false });
      })
      .catch((error: unknown) => {
        if (!disposed) {
          setState({
            status: "ready",
            data: {
              dailyAccepted: 0,
              dailyRemaining: 0,
              dailyLimit: 0,
              nextAllowedAt: null,
              canClick: false,
              balanceMicrocoins: "0",
              sessionEligible: false,
            },
            submitting: false,
            error: error instanceof Error ? error.message : "Click status is unavailable.",
          });
        }
      });
    return () => {
      disposed = true;
    };
  }, [client]);

  useEffect(() => {
    if (state.status !== "ready" || !state.data.nextAllowedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [state.status, state.status === "ready" ? state.data.nextAllowedAt : null]);

  const click = useCallback(async () => {
    if (!client || state.status !== "ready" || state.submitting) return;
    setState({ ...state, submitting: true, error: undefined, message: undefined });
    const requestId = pendingRequestId.current ?? crypto.randomUUID();
    pendingRequestId.current = requestId;
    try {
      const result = await client.click(requestId);
      pendingRequestId.current = undefined;
      setState({
        status: "ready",
        submitting: false,
        message: result.duplicate ? "Tap already confirmed." : "+1 microcoin confirmed by server.",
        data: {
          dailyAccepted: result.dailyAccepted,
          dailyRemaining: Math.max(0, result.dailyLimit - result.dailyAccepted),
          dailyLimit: result.dailyLimit,
          nextAllowedAt: result.nextAllowedAt,
          canClick: result.dailyAccepted < result.dailyLimit,
          balanceMicrocoins: result.balanceMicrocoins,
          sessionEligible: state.data.sessionEligible,
          sessionRejection: state.data.sessionRejection,
        },
      });
    } catch (error) {
      const serverResponded = error instanceof SessionRequestError;
      if (serverResponded && error.definitive) pendingRequestId.current = undefined;
      const data = serverResponded ? statusFromError(error, state.data) : state.data;
      setState({
        status: "ready",
        data,
        submitting: false,
        error:
          error instanceof SessionRequestError && error.body.error === "COOLDOWN"
            ? "Core is cooling down."
            : error instanceof SessionRequestError && error.body.error === "DAILY_LIMIT"
              ? "Daily tap limit reached."
              : !serverResponded || !error.definitive
                ? "Confirmation is unknown. Tap again to safely retry the same request."
                : error instanceof Error
                  ? error.message
                  : "Tap was not confirmed.",
      });
    }
  }, [client, state]);

  const cooldownMs =
    state.status === "ready" && state.data.nextAllowedAt
      ? Math.max(0, new Date(state.data.nextAllowedAt).getTime() - now)
      : 0;
  const serverAllowsClick =
    state.status === "ready" &&
    state.data.sessionEligible &&
    (state.data.canClick || (Boolean(state.data.nextAllowedAt) && cooldownMs === 0));
  const disabled =
    !client ||
    state.status !== "ready" ||
    state.submitting ||
    state.data.dailyRemaining <= 0 ||
    !serverAllowsClick ||
    cooldownMs > 0;

  return { state, click, cooldownMs, disabled };
}
