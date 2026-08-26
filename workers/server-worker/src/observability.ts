import type { StopReason } from "./sessionPolicy.js";
export type WorkerEvent =
  | { event: "session_started"; session_id: string; at: number }
  | {
      event: "task_completed";
      session_id: string;
      task_id: string;
      duration_ms: number;
      at: number;
    }
  | { event: "session_stopped"; session_id: string; reason: StopReason; at: number };
export interface WorkerMetrics {
  sessions_started: number;
  tasks_completed: number;
  task_duration_ms_total: number;
  stops_by_reason: Partial<Record<StopReason, number>>;
}
export function createWorkerMetrics(): WorkerMetrics {
  return {
    sessions_started: 0,
    tasks_completed: 0,
    task_duration_ms_total: 0,
    stops_by_reason: {},
  };
}
export function observe(metrics: WorkerMetrics, event: WorkerEvent): void {
  if (event.event === "session_started") metrics.sessions_started += 1;
  if (event.event === "task_completed") {
    metrics.tasks_completed += 1;
    metrics.task_duration_ms_total += event.duration_ms;
  }
  if (event.event === "session_stopped")
    metrics.stops_by_reason[event.reason] = (metrics.stops_by_reason[event.reason] ?? 0) + 1;
}
