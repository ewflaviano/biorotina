// Never add free-form values to this payload. Error messages, stacks, URLs,
// record contents, photos, account identifiers and tokens stay on the device.
import { getAnalyticsPreference } from "../analytics/visits";
export type ErrorSource =
  "runtime" | "storage" | "drive" | "push" | "photo" | "billing" | "feedback";
export type ErrorCode =
  | "runtime_exception"
  | "unhandled_rejection"
  | "render_failure"
  | "local_storage_failed"
  | "drive_sync_failed"
  | "drive_reconnect_required"
  | "push_failed"
  | "photo_analysis_failed"
  | "billing_failed"
  | "feedback_failed"
  | "network_failed"
  | "response_invalid";
export type ErrorOperation =
  | "app_runtime"
  | "app_render"
  | "storage_read"
  | "storage_write"
  | "google_restore_session"
  | "google_connect"
  | "google_reconnect"
  | "google_authorize_drive"
  | "drive_list"
  | "drive_download"
  | "drive_hash"
  | "drive_compare"
  | "drive_upload"
  | "drive_restore"
  | "drive_merge"
  | "drive_disconnect"
  | "drive_guest_merge"
  | "push_load"
  | "push_save"
  | "push_config"
  | "push_register"
  | "push_update"
  | "push_remove"
  | "push_test"
  | "billing_request"
  | "billing_status"
  | "billing_trial_config"
  | "billing_checkout"
  | "billing_cancel"
  | "photo_analyze"
  | "photo_parse"
  | "photo_prepare"
  | "feedback_send";

const knownScreens = new Set([
  "peso",
  "atividades",
  "alimentacao",
  "medicamentos",
  "hidratacao",
  "habitos",
  "mais",
  "configuracoes",
  "privacidade",
  "apoiar",
  "instalar",
  "assinatura",
]);
const apiBase = (import.meta.env.VITE_PUSH_API_URL || "").replace(/\/$/, "");
const recent = new Map<string, number>();
let sent = 0;

function screen(): string {
  const path = window.location.hash.replace(/^#\/?/, "").split(/[?#]/, 1)[0];
  if (!path) return "home";
  return knownScreens.has(path) ? path : "unknown";
}

export function reportClientError(
  source: ErrorSource,
  code: ErrorCode,
  operation: ErrorOperation,
  status?: number,
): void {
  if (
    !apiBase ||
    getAnalyticsPreference() !== "accepted" ||
    sent >= 20 ||
    navigator.onLine === false
  )
    return;
  const safeStatus =
    status !== undefined &&
    Number.isInteger(status) &&
    status >= 100 &&
    status <= 599
      ? status
      : undefined;
  const payload = {
    source,
    code,
    operation,
    screen: screen(),
    environment:
      window.location.hostname === "biorotina.app.br"
        ? "production"
        : "development",
    status: safeStatus,
  };
  const key = JSON.stringify(payload);
  const now = Date.now();
  if (now - (recent.get(key) ?? 0) < 60_000) return;
  recent.set(key, now);
  sent += 1;
  // A failure in telemetry must never become another reported error.
  try {
    void fetch(apiBase + "/api/telemetry/error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: key,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // No logging of the failed request or its values.
  }
}

export function installGlobalErrorHandlers(): void {
  window.addEventListener("error", () => {
    reportClientError("runtime", "runtime_exception", "app_runtime");
  });
  window.addEventListener("unhandledrejection", () => {
    reportClientError("runtime", "unhandled_rejection", "app_runtime");
  });
}
