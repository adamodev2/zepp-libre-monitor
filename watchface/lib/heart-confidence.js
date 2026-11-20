// Conservative validation for watch-face heart-rate display.
// Wear detection is a sensor estimate, not proof of skin contact.
export const MIN_WEAR_DURATION_MS = 60_000;
export const HEART_MAX_AGE_MS = 45_000;
export const MIN_HEART_EVENTS = 2;

export function isHeartRateDisplayable({
  wearStatus, wearingSince, bpm, measuredAt, eventCount, now,
}) {
  return wearStatus === 1 &&
    Number.isFinite(wearingSince) && wearingSince > 0 &&
    now - wearingSince >= MIN_WEAR_DURATION_MS &&
    Number.isFinite(bpm) && bpm >= 35 && bpm <= 230 &&
    Number.isFinite(measuredAt) && measuredAt >= wearingSince &&
    now - measuredAt >= 0 && now - measuredAt <= HEART_MAX_AGE_MS &&
    eventCount >= MIN_HEART_EVENTS;
}
