# Libre Compact Face — Amazfit Active 2 Round

A separate **second watch face** modeled on the supplied compact large-time design.
The existing diagnostic face in `watchface/` is unchanged and can remain
installed. This project has its own watchface identity (provisional appId
`1092843`) so it does not replace the original face (appId `1092842`).

## Design target

![Compact glucose watchface design target](docs/design-target.svg)

The illustration is the **visual goal**, not an actual watch screenshot.
The time, glucose, graph, heart rate and battery are example values.
The watchface stays read-only and never generates demo glucose values.
The two-hour graph starts immediately after the native trend arrow and
uses true timestamps: if there are fewer than two hours of measurements,
the uncovered left area remains empty instead of inventing history.

**Reading age:** `5 min` on this watchface means the current glucose
measurement is five minutes old. It tracks the same Libre measurement timestamp
as the Mini App's `LIVE 5m` label, *not* the latest repaint, graph fetch,
or shared-storage publication. Minor differences may occur when the two
screens are checked at different times.

## Display

- Large time (HH:MM) with a short English weekday/date above it.
- Black background and rounded dark glucose panel.
- Current glucose in mg/dL, native trend arrow, fixed **2h sparkline** and
  measurement age. Colors use the same thresholds the Mini App publishes.
- Small heart-rate and battery pills; no diagnostics or developer controls.
- Separate minimal AOD scene with time, glucose and reading age.

**No demo readings or synthetic graph points.** If no valid shared reading
is available the face shows `--` and a storage-state code. Above 15 minutes it shows
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

## Regression fix: face-only update

The compact watchface has been restored to the original working
`snapshot` shared-storage reader. **No Libre Monitor reinstall is
needed for this face-only regression test.** The previous extra
`reading` key and its publisher changes were reverted, so the Mini App
remains untouched.

The enlarged arrow and wide graph remain, but widget allocation was
reduced. An optional graph rendering error must not suppress the glucose
number or prevent the screen from redrawing.

If the face still shows `NO DATA`, first return to the Mini App, confirm
its reading is current, then immediately switch back. If that does not
help, collect the watch's `[LibreCompact]` and
`[LibreMonitor] WATCHFACE_` log entries. Avoid changing the working Mini App
until the watchface-specific issue has been isolated.

The background service must actually succeed at refreshing the shared
snapshot for glucose to update while the Mini App is closed. The watchface
polls shared storage every 30 seconds while awake and on minute/resume
events. Zepp OS may suspend updates while the screen is asleep.

## Preview installation (update the face only)

1. In the Codespace repository root, run:
   `git fetch origin && git switch --detach origin/feat/compact-glucose-watchface`.
2. Run `cd watchface-compact && npm install && npm test && npm run preview`.
3. Scan **this watchface QR only** to update `Libre Compact Face`.
4. Compare the glucose value and age with the already-working Libre Monitor.
   Do **not** reinstall Libre Monitor for this regression test.

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
