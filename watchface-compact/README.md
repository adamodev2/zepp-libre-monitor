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

The background service must actually succeed at refreshing the shared
snapshot for glucose to update while the Mini App is closed. The watchface
polls shared storage every 30 seconds while awake and on minute/resume
events. Zepp OS may suspend updates while the screen is asleep.

## Shared-storage investigation

There are two distinct installations, both using the same Libre data source:

- **Libre Monitor** (appId `1092841`) publishes watchface snapshots.
- **Libre Glucose Face** and **Libre Compact Face** only read shared snapshots.

The original Mini App on `main` does not contain
`publishWatchfaceSnapshot()`. The publisher was introduced by PR #10,
but both the `main` and feature branch used to identify themselves as
version `0.1.0` (`code: 1`). The Mini App on this branch is now
**version 0.1.1 (`code: 2`)** to make an upgrade unambiguous.

The existing Libre Monitor heading displays `SH OK` after the first
successful shared-storage write, or `SH ERR` if writing/verification
fails. `SH ?` means no new valid measurement was published in this
session yet. This does not interfere with glucose shown by Libre Monitor.

### Test order

1. From the **repository root**, run
   `git fetch origin && git switch --detach origin/feat/compact-glucose-watchface`.
2. From that root, run `npm install && npm run preview`. Scan the QR
   to **update Libre Monitor**, not the face. Keep its appId `1092841`
   and existing LibreLinkUp settings.
3. Open Libre Monitor, press **Refresh**, and read `SH OK` / `SH ERR`
   on its heading.
4. Switch directly to either already installed watchface. **No watchface
   reinstall is required for this test.**
5. If `SH OK` but the compact diagnostic face still has no glucose,
   report its code (`NO SHARE`, `READ ERR`, `BAD JSON`, `FUTURE`,
   `EXPIRED`, etc.) to isolate cross-app access from publication.

The compact face v0.1.3 intentionally retains the original working layout
and diagnostic label temporarily. Once cross-app data is verified, the
visual design can be reintroduced independently.

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

## HTTP 429 protection

A real HTTP 429 from any LibreLinkUp login, connection, or graph request
starts a **local 30-minute cooldown**. The app-side service persists the
cooldown in its settings storage so restarts and background sync do not
immediately trigger more network calls. The UI shows
`HTTP 429: retry in Xm`, or keeps a clearly marked cached reading.

The 30-minute delay is our conservative default, **not** a confirmed
Abbott rate-limit duration. Stop extra manual Refresh attempts and, if
needed, disable the BG service until the API recovers. Official Libre
readings and alarms remain the source for treatment decisions.

## Reduced LibreLinkUp requests (v0.1.3)

- Foreground Mini App now polls the phone every **2 minutes**, previously
  every minute. Manual **Refresh** still bypasses the short-term cache.
- App-side requests made within **90 seconds** reuse the last real reading
  and recompute its age from the **original sensor timestamp**, never
  the cache age. Foreground and BG requests arriving simultaneously share
  one in-flight network transaction.
- The Abbott graph endpoint is fetched no more than once every **10 minutes**
  per active AppSide session, previously five minutes. The graph still
  includes recent actual readings acquired from the connections endpoint.
- The independent BG service remains at **5 minutes**, so that CGM updates
  continue to reach both watchfaces while the Mini App is closed.
- The existing **30-minute 429 cooldown** remains in place.

This lowers avoidable API load while preserving each reading's actual
measurement timestamp, glucose age and stale-data warnings. Network
savings depend on app usage and BG scheduling; no official Abbott rate
limit is assumed.

## Uniform AMOLED-black background (v0.1.4)

The face background, glucose panel, graph fill and heart-rate/battery pills
all use pure black (`#000000`). This is a visual-only change; watchface
glucose sharing, timing, widgets and the Mini App are unchanged.
