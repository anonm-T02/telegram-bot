import { useEffect, useState } from "react";
import type { HealthCheckResponse } from "@nova-org/shared";

type HealthState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: HealthCheckResponse };

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export function useApiHealth(): HealthState {
  const [state, setState] = useState<HealthState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    fetch(`${API_URL}/health`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`API returned ${res.status}`);
        return (await res.json()) as HealthCheckResponse;
      })
      .then((data) => {
        if (!cancelled) setState({ status: "success", data });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : "Unknown error",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
