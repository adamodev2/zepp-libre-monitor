# Libre Compact Face — Amazfit Active 2 Round

A separate **second watch face** modeled on the supplied compact large-time design.
The existing diagnostic face in `watchface/` is unchanged and can remain
installed. This project has its own watchface identity (provisional appId
`1092843`) so it does not replace the original face (appId `1092842`).

## Display

- Large time (HH:MM) with a short English weekday/date above it.
- Black background and rounded dark glucose panel.
- Current glucose in mg/dL, native trend arrow, fixed **2h sparkline** and
  measurement age. Colors use the same thresholds the Mini App publishes.
- Small heart-rate and battery pills; no diagnostics or developer controls.
- Separate minimal AOD scene with time, glucose and reading age.

**No demo readings or synthetic graph points.** If no shared reading is
available the face shows `--` / `NO DATA`. Above 15 minutes it shows
`STALE Xm` and dims the value. History gaps longer than 11 minutes are
not joined by a chart line. BPM shows `--` until the wearing sensor has
reported confirmed wearing for 60 seconds and at least two fresh heart-rate
events have occurred. The watch's wearing sensor may misclassify off-wrist
status: BPM is experimental.

## Connection to Libre Monitor

The **existing** Mini App (appId `1092841`) remains the only
LibreLinkUp client and publishes the glucose snapshot using Zepp
`ShareTypedStorage("libre-glucose-face-v1")`. This face reads that same
snapshot using `TypedStorage(1092841, "libre-glucose-face-v1")`.
No credentials, pairing, new service, or network access are added.

The background service must actually succeed at refreshing the shared
snapshot for glucose to update while the Mini App is closed. The watchface
polls shared storage every 30 seconds while awake and on minute/resume
events. Zepp OS may suspend updates while the screen is asleep.

## Preview installation

1. Switch to branch `feat/compact-glucose-watchface` in the same Codespace.
2. Install/preview the updated Mini App from the repository root:
   `npm install && npm run preview`.
3. In Libre Monitor, verify real glucose and switch `BG ON`.
4. Open the new project:
   `cd watchface-compact && npm install && npm run check && npm test && npm run preview`.
5. Scan the new Zepp developer QR in Zepp and activate **Libre Compact Face**
   from installed watch faces. Leave **Libre Glucose Face** installed if
   you want to compare or switch back.

**Important:** `1092843` is an unverified/provisional watchface appId.
Zepp may require a separate appId registered to your developer account;
if preview rejects it, change only `watchface-compact/app.json`. Do not
change the Mini App's `1092841` publisher identity.

The chart is intentionally fixed to 2h to match the design. Its history
still comes from the existing six-hour publisher, independently of the
Mini App's selected chart range.

## Real-watch test checklist

1. Verify time, day, battery and the entire rounded layout fit the Active 2.
2. Compare glucose, arrow and measurement age to Libre Monitor / LibreLinkUp.
3. Close Libre Monitor and recheck after 5–15 minutes, including a screen wake.
4. Test while off-wrist: the heart pill should become `--`. A displayed
   BPM despite off-wrist means the system's wear detection is unreliable.
5. Try Always-On Display set to **Follow current watch face**, where available.
   If the OS selects a system standby face, it cannot be overridden by this
   project; custom AOD behavior requires verification on the actual watch.

Experimental non-medical glucose display; do not use it for CGM alarms,
insulin dosing or safety-critical decisions. Keep official alerts enabled.
