import { sha256 } from "./sha256.js";
import { parseFactoryTimestamp } from "./timestamps.js";
import { readStoredHistory, saveStoredHistory, readBackgroundSyncAgeMinutes } from "./history-store.js";

const ALLOWED_REGIONS = ["", "eu", "us", "ap", "au", "ca", "de", "fr", "jp", "ru"];
const SESSION_MAX_AGE_MS = 45 * 60_000;
const HISTORY_REFRESH_MS = 10 * 60_000;
const READING_CACHE_MS = 90_000;
const HISTORY_WINDOW_MS = 6 * 60 * 60_000;
const RATE_LIMIT_PAUSE_MS = 30 * 60_000;
const RATE_LIMIT_UNTIL_KEY = "libre_api_rate_limit_until_v1";
const headers = {
  "Content-Type": "application/json",
  Accept: "application/json",
  product: "llu.android",
  version: "4.16.0",
};

// Ephemeral in-memory state only. Never persist auth tokens in Zepp Settings Storage.
let session = null;
let historyCache = { patientId: "", at: 0, points: [] };
let liveSamples = [];
let activePatientId = "";
let rateLimitedUntil = 0;
let inFlightReading = null;
let latestReading = null;

// Reuse successful LibreLinkUp requests for concurrent foreground/background
// callers. Cached data keeps its original measurement timestamp.
function withUpdatedAge(record, recordedAt, now) {
  const elapsedMs = Math.max(0, now - recordedAt);
  return {
    ...record,
    ageMs: now - record.timestamp,
    history: record.history.map((sample) => ({
      ...sample, ageMinutes: sample.ageMinutes + elapsedMs / 60_000,
    })),
    historyMeta: {
      ...record.historyMeta,
      graphAgeMinutes: Number.isFinite(record.historyMeta?.graphAgeMinutes)
        ? record.historyMeta.graphAgeMinutes + Math.floor(elapsedMs / 60_000)
        : null,
    },
  };
}

function readRateLimitUntil(storage) {
  let persisted = 0;
  try {
    persisted = Number(storage?.getItem(RATE_LIMIT_UNTIL_KEY)) || 0;
  } catch (_) {
    // In-memory backoff remains active if persistence is unavailable.
  }
  // Do not let corrupted timestamps block syncing indefinitely.
  const now = Date.now();
  if (persisted > now + 24 * 60 * 60_000) persisted = 0;
  return Math.max(rateLimitedUntil, persisted);
}

function limitError(until) {
  const minutes = Math.max(1, Math.ceil((until - Date.now()) / 60_000));
  return new Error("HTTP 429: retry in " + minutes + "m");
}

function guardRateLimit(storage, report) {
  const until = readRateLimitUntil(storage);
  if (until <= Date.now()) return;
  report("RATE_LIMIT_PAUSED", String(Math.ceil((until - Date.now()) / 60_000)));
  throw limitError(until);
}

function recordRateLimit(storage, report, step) {
  rateLimitedUntil = Date.now() + RATE_LIMIT_PAUSE_MS;
  try {
    storage?.setItem(RATE_LIMIT_UNTIL_KEY, String(rateLimitedUntil));
  } catch (_) {
    // Local memory still prevents rapid consecutive requests.
  }
  report("RATE_LIMITED", step);
  throw limitError(rateLimitedUntil);
}

export function resetSession() {
  session = null;
  historyCache = { patientId: "", at: 0, points: [] };
  liveSamples = [];
  activePatientId = "";
  rateLimitedUntil = 0;
  inFlightReading = null;
  latestReading = null;
}

function apiHost(region) {
  if (!ALLOWED_REGIONS.includes(region)) throw new Error("Unsupported LibreLinkUp region");
  if (region === "ru") return "https://api.libreview.ru";
  return region ? `https://api-${region}.libreview.io` : "https://api.libreview.io";
}

async function request(url, options = {}) {
  const report = options.report || (() => {});
  const step = options.step || "UNKNOWN";
  let response;
  try {
    response = await fetch({
      url,
      method: options.method || "GET",
      headers: options.headers || headers,
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch (_) {
    report("REQUEST_FAILED", `${step}:NETWORK`);
    throw new Error(`${step}: network request failed`);
  }
  report(step === "LOGIN" ? "LOGIN_HTTP" : step === "GRAPH" ? "GRAPH_HTTP" : "CONNECTIONS_HTTP", String(response.status || "unknown"));
  // 429 often has an empty/non-JSON body. Detect before parsing and
  // stop further requests from foreground and background callers.
  if (Number(response.status) === 429) {
    recordRateLimit(options.storage, report, step);
  }
  let json;
  try {
    json = typeof response.body === "string" ? JSON.parse(response.body) : response.body;
  } catch (_) {
    throw new Error(`${step}: invalid JSON response`);
  }
  if (response.status >= 400 || !json) throw new Error(`${step}: HTTP ${response.status || "error"}`);
  return json;
}

async function authenticate(email, password, report, storage) {
  const payload = { email, password };
  let region = "";
  report("LOGIN_STARTED");
  let login = await request(`${apiHost(region)}/llu/auth/login`, { method: "POST", body: payload, step: "LOGIN", report, storage });
  if (login.data?.region && login.data.region !== region) {
    region = String(login.data.region).toLowerCase();
    report("LOGIN_REGION", ALLOWED_REGIONS.includes(region) ? region : "unknown");
    login = await request(`${apiHost(region)}/llu/auth/login`, { method: "POST", body: payload, step: "LOGIN", report, storage });
  }
  if (login.status !== 0 || !login.data?.authTicket?.token || !login.data?.user?.id) {
    report("LOGIN_INVALID", String(Number(login.status) || 0));
    throw new Error(login.status === 4 ? "Accept updated Abbott terms in LibreLinkUp" : "LibreLinkUp sign-in failed");
  }
  return {
    key: sha256(email + "\n" + password),
    host: apiHost(region),
    token: login.data.authTicket.token,
    accountId: sha256(login.data.user.id),
    at: Date.now(),
  };
}

async function connectionRequest(auth, report, storage) {
  return request(`${auth.host}/llu/connections`, {
    headers: { ...headers, Authorization: `Bearer ${auth.token}`, "account-id": auth.accountId },
    step: "CONNECTIONS",
    report,
    storage,
  });
}

export function parseHistory(graphData, now = Date.now()) {
  if (!Array.isArray(graphData)) return [];
  const dedup = {};
  for (const sample of graphData) {
    const timestamp = parseFactoryTimestamp(sample?.FactoryTimestamp);
    const value = Number(sample?.ValueInMgPerDl ?? sample?.Value);
    if (!timestamp || !Number.isFinite(value) || value < 20 || value > 600) continue;
    if (timestamp > now + 60_000 || timestamp < now - HISTORY_WINDOW_MS) continue;
    const minute = Math.floor(timestamp / 60_000);
    dedup[minute] = { timestamp, value: Math.round(value) };
  }
  return Object.keys(dedup).map((key) => dedup[key]).sort((a, b) => a.timestamp - b.timestamp).slice(-361);
}

function combineHistory(graphPoints, current, patientId, now, storage) {
  if (patientId !== activePatientId) {
    liveSamples = [];
    activePatientId = patientId;
  }
  if (current?.timestamp && Number.isFinite(current.value)) {
    liveSamples.push({ timestamp: current.timestamp, value: current.value });
  }
  const dedup = {};
  for (const point of [...readStoredHistory(storage, patientId, now), ...graphPoints, ...liveSamples]) {
    if (point.timestamp >= now - HISTORY_WINDOW_MS && point.timestamp <= now + 60_000) {
      dedup[Math.floor(point.timestamp / 60_000)] = point;
    }
  }
  const result = Object.keys(dedup).map((key) => dedup[key])
    .sort((a, b) => a.timestamp - b.timestamp).slice(-361);
  liveSamples = liveSamples.filter((point) => point.timestamp >= now - HISTORY_WINDOW_MS);
  saveStoredHistory(storage, patientId, result, now);
  return result;
}

async function loadHistory(auth, patientId, report, storage) {
  if (!/^[a-z0-9-]{1,80}$/i.test(patientId)) return [];
  if (historyCache.patientId === patientId && Date.now() - historyCache.at < HISTORY_REFRESH_MS) {
    return historyCache.points;
  }
  try {
    const graph = await request(`${auth.host}/llu/connections/${patientId}/graph`, {
      headers: { ...headers, Authorization: `Bearer ${auth.token}`, "account-id": auth.accountId },
      step: "GRAPH",
      report,
      storage,
    });
    const points = parseHistory(graph.data?.graphData, Date.now());
    historyCache = { patientId, at: Date.now(), points };
    report("GRAPH_POINTS", String(points.length));
    return points;
  } catch (_) {
    // A graph failure must never suppress an otherwise valid live measurement.
    report("GRAPH_UNAVAILABLE");
    return historyCache.patientId === patientId ? historyCache.points : [];
  }
}

export async function getGlucose(email, password, report = () => {}, storage = null, force = false) {
  if (!email || !password) throw new Error("Configure LibreLinkUp account in Zepp settings");
  guardRateLimit(storage, report);
  const key = sha256(email + "\n" + password);
  // One server transaction can serve the foreground Mini App and the BG
  // service, even when they ask at almost the same moment.
  if (inFlightReading?.key === key) {
    report("REQUEST_COALESCED");
    return inFlightReading.promise;
  }
  if (!force && latestReading?.key === key &&
      Date.now() - latestReading.at < READING_CACHE_MS) {
    report("READING_CACHE_REUSED");
    return withUpdatedAge(latestReading.record, latestReading.at, Date.now());
  }

  const promise = fetchGlucoseFromServer(email, password, report, storage, key)
    .then((record) => {
      latestReading = { key, at: Date.now(), record };
      return record;
    });
  inFlightReading = { key, promise };
  try {
    return await promise;
  } finally {
    if (inFlightReading?.promise === promise) inFlightReading = null;
  }
}

async function fetchGlucoseFromServer(email, password, report, storage, key) {
  if (!session || session.key !== key || Date.now() - session.at >= SESSION_MAX_AGE_MS) {
    resetSession();
    session = await authenticate(email, password, report, storage);
  } else {
    report("SESSION_REUSED");
  }

  let connections;
  try {
    connections = await connectionRequest(session, report, storage);
  } catch (error) {
    if (!/CONNECTIONS: HTTP 401/.test(String(error.message))) throw error;
    // A revoked or expired token is retried with a fresh login just once.
    resetSession();
    session = await authenticate(email, password, report, storage);
    connections = await connectionRequest(session, report, storage);
  }

  const connection = connections.data?.[0];
  const reading = connection?.glucoseMeasurement;
  if (!reading || !Number.isFinite(Number(reading.ValueInMgPerDl ?? reading.Value))) {
    report("NO_READINGS");
    throw new Error("No shared LibreLinkUp glucose readings found");
  }
  report("READING_RECEIVED");
  const parsed = parseFactoryTimestamp(reading.FactoryTimestamp);
  if (!parsed) report("REQUEST_FAILED", "TIMESTAMP_INVALID");
  const ageMs = parsed ? Date.now() - parsed : null;
  if (ageMs !== null && (ageMs < -60_000 || ageMs > 900_000)) report("REQUEST_FAILED", "READING_STALE");

  const patientId = typeof connection.patientId === "string" ? connection.patientId : "";
  const graphHistory = await loadHistory(session, patientId, report, storage);
  const now = Date.now();
  const patientKey = sha256(patientId || email.trim().toLowerCase());
  const history = combineHistory(
    graphHistory,
    { timestamp: parsed, value: Math.round(Number(reading.ValueInMgPerDl ?? reading.Value)) },
    patientKey, now, storage,
  );
  const newestGraphPoint = graphHistory.length ? graphHistory[graphHistory.length - 1] : null;
  const graphAgeMinutes = newestGraphPoint
    ? Math.max(0, Math.floor((now - newestGraphPoint.timestamp) / 60_000))
    : null;
  return {
    value: Math.round(Number(reading.ValueInMgPerDl ?? reading.Value)),
    trend: Number(reading.TrendArrow) || 0,
    timestamp: parsed,
    ageMs,
    source: "LibreLinkUp",
    historyMeta: {
      graphAgeMinutes,
      backgroundSyncAgeMinutes: readBackgroundSyncAgeMinutes(storage, sha256(email.trim().toLowerCase()), now),
    },
    history: history.map((point) => ({
      value: point.value,
      ageMinutes: Math.max(0, Math.round((Date.now() - point.timestamp) / 60_000)),
    })),
  };
}
