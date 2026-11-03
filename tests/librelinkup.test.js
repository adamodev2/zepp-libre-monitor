import test from "node:test";
import assert from "node:assert/strict";
import { getGlucose } from "../app-side/librelinkup.js";

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

test.afterEach(() => { globalThis.fetch = originalFetch; });

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
