const LOG_KEY = "diagnostic_log";
const MAX_ENTRIES = 30;
const ALLOWED_EVENTS = new Set([
  "SIDE_STARTED", "WATCH_REQUEST", "CREDENTIALS_MISSING",
  "LOGIN_STARTED", "LOGIN_HTTP", "LOGIN_REGION", "LOGIN_INVALID",
  "CONNECTIONS_STARTED", "CONNECTIONS_HTTP", "NO_READINGS",
  "READING_RECEIVED", "REQUEST_FAILED", "REQUEST_FINISHED",
]);

export function addDiagnostic(event, detail = "") {
  if (!ALLOWED_EVENTS.has(event)) return;
  // Only constant event codes and restricted numeric/status metadata are stored.
  const safeDetail = /^[a-zA-Z0-9:_ .-]{0,48}$/.test(String(detail)) ? String(detail) : "redacted";
  const line = `${new Date().toISOString()} ${event}${safeDetail ? " " + safeDetail : ""}`;
  try {
    const previous = settings.settingsStorage.getItem(LOG_KEY) || "";
    const lines = previous.split("\n").filter(Boolean);
    lines.push(line);
    settings.settingsStorage.setItem(LOG_KEY, lines.slice(-MAX_ENTRIES).join("\n"));
  } catch (_) {
    // Diagnostic failures must never prevent glucose retrieval.
  }
  console.log("[LibreMonitor]", event, safeDetail);
}
