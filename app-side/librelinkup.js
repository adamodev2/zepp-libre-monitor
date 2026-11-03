import { sha256 } from "js-sha256";

const ALLOWED_REGIONS = ["", "eu", "us", "ap", "au", "ca", "de", "fr", "jp", "ru"];
const headers = {
  "Content-Type": "application/json",
  "Accept": "application/json",
  product: "llu.android",
  version: "4.16.0",
};

function apiHost(region) {
  if (!ALLOWED_REGIONS.includes(region)) throw new Error("Unsupported LibreLinkUp region");
  if (region === "ru") return "https://api.libreview.ru";
  return region ? `https://api-${region}.libreview.io` : "https://api.libreview.io";
}

async function request(url, options = {}) {
  const response = await fetch({ url, method: options.method || "GET", headers: options.headers || headers, ...(options.body ? { body: JSON.stringify(options.body) } : {}) });
  const json = typeof response.body === "string" ? JSON.parse(response.body) : response.body;
  if (response.status >= 400 || !json) throw new Error(`LibreLinkUp HTTP ${response.status || "error"}`);
  return json;
}

export async function getGlucose(email, password) {
  if (!email || !password) throw new Error("Configure LibreLinkUp account in Zepp settings");
  const payload = { email, password };
  let region = "";
  let login = await request(`${apiHost(region)}/llu/auth/login`, { method: "POST", body: payload });
  if (login.data?.region && login.data.region !== region) {
    region = login.data.region.toLowerCase();
    login = await request(`${apiHost(region)}/llu/auth/login`, { method: "POST", body: payload });
  }
  if (login.status !== 0 || !login.data?.authTicket?.token || !login.data?.user?.id) {
    throw new Error(login.status === 4 ? "Accept updated Abbott terms in LibreLinkUp" : "LibreLinkUp sign-in failed");
  }
  const authHeaders = { ...headers, Authorization: `Bearer ${login.data.authTicket.token}`, "account-id": sha256(login.data.user.id) };
  const connections = await request(`${apiHost(region)}/llu/connections`, { headers: authHeaders });
  const reading = connections.data?.[0]?.glucoseMeasurement;
  if (!reading || !Number.isFinite(Number(reading.Value))) throw new Error("No shared LibreLinkUp glucose readings found");
  const parsed = Date.parse(reading.FactoryTimestamp || reading.Timestamp || "");
  return {
    value: Math.round(Number(reading.Value)),
    trend: Number(reading.TrendArrow) || 0,
    timestamp: Number.isFinite(parsed) ? parsed : 0,
    source: "LibreLinkUp",
  };
}
