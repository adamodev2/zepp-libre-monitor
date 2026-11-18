import test from "node:test";
import assert from "node:assert/strict";
import { getGlucose, resetSession } from "../app-side/librelinkup.js";

const originalFetch = globalThis.fetch;
function mockFetch(responses) {
  const calls = [];
  globalThis.fetch = async (request) => {
    calls.push(request);
    if (!responses.length) throw new Error("Unexpected request");
    const item = responses.shift();
    if (item instanceof Error) throw item;
    return { status: item.http || 200, body: item.body };
  };
  return calls;
}
const login = {
  status: 0,
  data: { user: { id: "mock-user-id" }, authTicket: { token: "mock-session-token" } },
};
const reading = {
  data: [{ glucoseMeasurement: { Value: 124, TrendArrow: 3, FactoryTimestamp: "2026-11-03T12:00:00Z" } }],
};

test.afterEach(() => { globalThis.fetch = originalFetch; resetSession(); });

test("returns normalized glucose reading from mocked login and connection responses", async () => {
  const calls = mockFetch([{ body: login }, { body: reading }]);
  const events = [];
  const result = await getGlucose("sample@example.invalid", "not-a-real-password", (event) => events.push(event));
  assert.equal(result.value, 124);
  assert.equal(result.trend, 3);
  assert.equal(result.source, "LibreLinkUp");
  assert.equal(result.timestamp, Date.parse("2026-11-03T12:00:00Z"));
  assert.equal(calls.length, 2);
  assert.ok(calls[1].headers.Authorization.startsWith("Bearer "));
  assert.ok(events.includes("READING_RECEIVED"));
});

test("refuses missing credentials without network requests", async () => {
  const calls = mockFetch([]);
  await assert.rejects(getGlucose("", ""), /Configure LibreLinkUp account/);
  assert.equal(calls.length, 0);
});

test("handles a server-side login rejection", async () => {
  mockFetch([{ body: { status: 2, data: {} } }]);
  await assert.rejects(getGlucose("sample@example.invalid", "secret"), /sign-in failed/);
});

test("reports HTTP authentication failures without response bodies", async () => {
  mockFetch([{ http: 401, body: { error: "internal message" } }]);
  await assert.rejects(getGlucose("sample@example.invalid", "secret"), /LOGIN: HTTP 401/);
});

test("detects invalid network JSON", async () => {
  mockFetch([{ body: "unexpected text" }]);
  await assert.rejects(getGlucose("sample@example.invalid", "secret"), /LOGIN: invalid JSON response/);
});

test("handles unreachable server and does not expose credentials", async () => {
  mockFetch([new Error("socket failure: password=secret")]);
  await assert.rejects(getGlucose("sample@example.invalid", "secret"), /^Error: LOGIN: network request failed$/);
});

test("handles no shared readings", async () => {
  mockFetch([{ body: login }, { body: { data: [] } }]);
  await assert.rejects(getGlucose("sample@example.invalid", "secret"), /No shared/);
});

test("follows the region specified during login", async () => {
  const calls = mockFetch([
    { body: { status: 0, data: { region: "eu" } } },
    { body: login },
    { body: reading },
  ]);
  await getGlucose("sample@example.invalid", "secret");
  assert.equal(calls.length, 3);
  assert.ok(calls[1].url.startsWith("https://api-eu.libreview.io/"));
});

test("reuses login session across consecutive readings", async () => {
  const calls = mockFetch([
    { body: login }, { body: reading }, { body: reading },
  ]);
  const events = [];
  await getGlucose("sample@example.invalid", "secret", (event) => events.push(event));
  await getGlucose("sample@example.invalid", "secret", (event) => events.push(event));
  assert.equal(calls.length, 3);
  assert.equal(calls.filter((call) => call.url.endsWith("/llu/auth/login")).length, 1);
  assert.ok(events.includes("SESSION_REUSED"));
});

test("fetches graph history once and reuses it during five-minute refresh interval", async () => {
  const withPatient = {
    data: [{
      patientId: "11111111-1111-1111-1111-111111111111",
      glucoseMeasurement: reading.data[0].glucoseMeasurement,
    }],
  };
  const calls = mockFetch([
    { body: login },
    { body: withPatient },
    { body: { data: { graphData: [
      { FactoryTimestamp: new Date(Date.now() - 2 * 60_000).toISOString(), ValueInMgPerDl: 110 },
    ] } } },
    { body: withPatient },
  ]);
  const first = await getGlucose("sample@example.invalid", "secret");
  const second = await getGlucose("sample@example.invalid", "secret");
  assert.equal(first.history.length, 1);
  assert.equal(second.history.length, 1);
  assert.equal(calls.filter((call) => call.url.endsWith("/graph")).length, 1);
});

test("a failed graph endpoint does not block the current glucose reading", async () => {
  const withPatient = {
    data: [{ patientId: "11111111-1111-1111-1111-111111111111", glucoseMeasurement: reading.data[0].glucoseMeasurement }],
  };
  mockFetch([{ body: login }, { body: withPatient }, { http: 503, body: {} }]);
  const result = await getGlucose("sample@example.invalid", "secret");
  assert.equal(result.value, 124);
  assert.deepEqual(result.history, []);
});

test("reauthenticates once on an expired bearer token", async () => {
  const calls = mockFetch([
    { body: login }, { http: 401, body: {} }, { body: login }, { body: reading },
  ]);
  const result = await getGlucose("sample@example.invalid", "secret");
  assert.equal(result.value, 124);
  assert.equal(calls.filter((call) => call.url.endsWith("/llu/auth/login")).length, 2);
});

test("restores persisted graph samples when Side Service restarts and graph fetch fails", async () => {
  const saved = new Map();
  const storage = {
    getItem(key) { return saved.get(key) || null; },
    setItem(key, value) { saved.set(key, value); },
  };
  const recentTimestamp = new Date(Date.now() - 5 * 60_000).toISOString();
  const withPatient = {
    data: [{
      patientId: "11111111-1111-1111-1111-111111111111",
      glucoseMeasurement: reading.data[0].glucoseMeasurement,
    }],
  };
  mockFetch([
    { body: login },
    { body: withPatient },
    { body: { data: { graphData: [{ FactoryTimestamp: recentTimestamp, ValueInMgPerDl: 133 }] } } },
  ]);
  const first = await getGlucose("sample@example.invalid", "secret", () => {}, storage);
  assert.equal(first.history.length, 1);
  assert.ok(first.historyMeta.graphAgeMinutes >= 4);

  resetSession();
  mockFetch([
    { body: login },
    { body: withPatient },
    { http: 503, body: {} },
  ]);
  const restored = await getGlucose("sample@example.invalid", "secret", () => {}, storage);
  assert.deepEqual(restored.history.map((point) => point.value), [133]);
  assert.equal(restored.historyMeta.graphAgeMinutes, null);
});

test("latest Abbott graph age remains distinct from current measurement age", async () => {
  const current = new Date(Date.now() - 60_000).toISOString();
  const historical = new Date(Date.now() - 21 * 60_000).toISOString();
  const connection = {
    data: [{
      patientId: "11111111-1111-1111-1111-111111111111",
      glucoseMeasurement: { Value: 125, TrendArrow: 3, FactoryTimestamp: current },
    }],
  };
  mockFetch([
    { body: login },
    { body: connection },
    { body: { data: { graphData: [{ FactoryTimestamp: historical, ValueInMgPerDl: 118 }] } } },
  ]);
  const result = await getGlucose("sample@example.invalid", "secret");
  assert.ok(result.ageMs < 2 * 60_000);
  assert.ok(result.historyMeta.graphAgeMinutes >= 20);
  assert.ok(result.historyMeta.graphAgeMinutes <= 22);
});
