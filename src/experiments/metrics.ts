import { getAnalyticsPreference } from "../analytics/visits";
import { experimentKeys, type ExperimentKey } from "./registry";
import { MAX_REVISION, type Assignment } from "./assignment";

export type ExperimentOutcome =
  "exposure" | "success" | "error" | "use" | "rollback";
const API = (import.meta.env.VITE_PUSH_API_URL || "").replace(/\/$/, "");
let sent = 0;
export function metricsAllowed(): boolean {
  return (
    Boolean(API) &&
    getAnalyticsPreference() === "accepted" &&
    navigator.onLine !== false &&
    sent < 120
  );
}

/** Fixed technical dimensions only. No browser bucket, account, route or record data. */
export function recordExperimentMetric(
  key: ExperimentKey,
  assignment: Assignment,
  outcome: ExperimentOutcome,
): boolean {
  if (
    !metricsAllowed() ||
    assignment.forced ||
    !experimentKeys.includes(key) ||
    !Number.isInteger(assignment.revision) ||
    assignment.revision < 1 ||
    assignment.revision > MAX_REVISION ||
    !["control", "experiment"].includes(assignment.arm) ||
    !["exposure", "success", "error", "use", "rollback"].includes(outcome)
  )
    return false;
  const body = JSON.stringify({
    experiment: key,
    revision: assignment.revision,
    arm: assignment.arm,
    outcome,
    environment:
      window.location.hostname === "biorotina.app.br"
        ? "production"
        : "development",
  });
  try {
    sent += 1;
    void fetch(`${API}/api/telemetry/experiment`, {
      method: "POST",
      credentials: "omit",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}
