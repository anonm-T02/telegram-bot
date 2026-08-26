import { useEffect, useState } from "react";
import {
  authenticateTelegram,
  SessionApiClient,
  SessionUnauthorizedError,
  type ActivityState,
} from "../apiClient.js";
import { getTelegramInitData } from "../telegram.js";

const HEARTBEAT_MS = 20_000;
const IDLE_AFTER_MS = 60_000;

export type TelegramSessionState =
  | { status: "authenticating" }
  | { status: "ready"; activity: ActivityState; client: SessionApiClient }
  | { status: "unavailable"; message: string }
  | { status: "error"; message: string };

function currentActivity(lastInteraction: number): ActivityState {
  if (document.visibilityState === "hidden") return "BACKGROUND";
  return Date.now() - lastInteraction >= IDLE_AFTER_MS ? "IDLE" : "ACTIVE";
}

export function useTelegramSession(): TelegramSessionState {
  const [state, setState] = useState<TelegramSessionState>({ status: "authenticating" });

  useEffect(() => {
    const initData = getTelegramInitData();
    if (!initData) {
      setState({ status: "unavailable", message: "Open this Mini App inside Telegram." });
      return;
    }

    let disposed = false;
    let lastInteraction = Date.now();
    let lastState: ActivityState = "ONLINE";
    let clientSequence = 0;
    let interval: ReturnType<typeof setInterval> | undefined;
    const cleanups: Array<() => void> = [];

    const begin = async (): Promise<void> => {
      try {
        const auth = await authenticateTelegram(initData);
        if (disposed) return;
        const client = new SessionApiClient(auth.accessToken, auth.refreshToken);

        const report = async (heartbeat: boolean): Promise<void> => {
          const activity = currentActivity(lastInteraction);
          const payload = {
            state: activity,
            clientTimestamp: new Date().toISOString(),
            clientSequence: clientSequence++,
            isVisible: document.visibilityState === "visible",
          };
          if (heartbeat) await client.heartbeat(payload);
          if (activity !== lastState) await client.reportState(payload);
          lastState = activity;
          if (!disposed) setState({ status: "ready", activity, client });
        };

        const onInteraction = (): void => {
          lastInteraction = Date.now();
          void report(false).catch(() => undefined);
        };
        const onVisibility = (): void => {
          void report(false).catch(() => undefined);
        };

        for (const event of ["pointerdown", "keydown", "touchstart"] as const) {
          window.addEventListener(event, onInteraction, { passive: true });
          cleanups.push(() => window.removeEventListener(event, onInteraction));
        }
        document.addEventListener("visibilitychange", onVisibility);
        cleanups.push(() => document.removeEventListener("visibilitychange", onVisibility));

        await report(true);
        interval = setInterval(() => {
          void report(true).catch((error: unknown) => {
            if (!disposed && error instanceof SessionUnauthorizedError) {
              if (interval) clearInterval(interval);
              setState({ status: "error", message: "Session expired. Reopen the Mini App." });
            }
          });
        }, HEARTBEAT_MS);
      } catch (error) {
        if (!disposed) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : "Telegram sign-in failed.",
          });
        }
      }
    };

    void begin();
    return () => {
      disposed = true;
      if (interval) clearInterval(interval);
      cleanups.forEach((cleanup) => cleanup());
    };
  }, []);

  return state;
}
