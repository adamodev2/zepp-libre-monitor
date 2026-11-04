// LibreLinkUp FactoryTimestamp is a UTC timestamp, even without a timezone suffix.
// Parse its US-style month/day/year format explicitly, independent of device locale.
export function parseFactoryTimestamp(value) {
  if (typeof value !== "string") return 0;
  const text = value.trim();
  const numeric = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})(?:\s*(AM|PM))?$/i.exec(text);
  if (numeric) {
    const month = Number(numeric[1]), day = Number(numeric[2]), year = Number(numeric[3]);
    let hour = Number(numeric[4]);
    const minute = Number(numeric[5]), second = Number(numeric[6]);
    const period = numeric[7]?.toUpperCase();
    if (month < 1 || month > 12 || day < 1 || day > 31 || minute > 59 || second > 59) return 0;
    if (period) {
      if (hour < 1 || hour > 12) return 0;
      hour = (hour % 12) + (period === "PM" ? 12 : 0);
    } else if (hour > 23) return 0;
    const parsed = Date.UTC(year, month - 1, day, hour, minute, second);
    const check = new Date(parsed);
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return 0;
    return parsed;
  }
  // Explicitly zoned ISO-8601 can be interpreted without locale ambiguity.
  const iso = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/i.exec(text);
  if (!iso) return 0;
  const normalized = iso[7] ? text : text + "Z";
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}
