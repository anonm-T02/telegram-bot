import { useCallback, useEffect, useState } from "react";
import {
  SessionApiClient,
  SessionUnauthorizedError,
  type ReferralsResponse,
} from "../apiClient.js";

type ReferralState =
  | { status: "idle" | "loading" }
  | { status: "ready"; data: ReferralsResponse }
  | { status: "error"; message: string };

export function useReferrals(client: SessionApiClient | undefined, enabled: boolean) {
  const [state, setState] = useState<ReferralState>({ status: "idle" });

  const load = useCallback(async (): Promise<void> => {
    if (!client) return;
    setState({ status: "loading" });
    try {
      setState({ status: "ready", data: await client.getReferrals() });
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof SessionUnauthorizedError
            ? "Session expired. Reopen the Mini App."
            : error instanceof Error
              ? error.message
              : "Referral details could not be loaded.",
      });
    }
  }, [client]);

  useEffect(() => {
    if (enabled && state.status === "idle") void load();
  }, [enabled, load, state.status]);

  return { state, retry: load };
}
