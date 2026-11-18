# Libre Glucose Face (Amazfit Active 2 Round)

The watch face is a **separate Zepp OS package**. The main Libre Monitor
Mini App remains responsible for LibreLinkUp login, background synchronization,
and glucose caching. The watch face only displays measurements.

## Display

- Watch time and date
- Glucose, trend arrow and measurement age with a real 2h or 6h history chart
- Current heart rate (BPM) only when a fresh onCurrentChange measurement is available
- Watch battery percentage
- Large watch time, bigger captions, and glucose on the low-power AOD view

## Data sharing

The main Mini App (appId 1092841) publishes a compact glucose snapshot with
ShareTypedStorage using scope "libre-glucose-face-v1". The face reads the snapshot
with TypedStorage using the same scope and the appId of the Mini App.

This requires Zepp OS API_LEVEL 3.0 or newer. The face does not access the Mini
App's private LocalStorage and does not make network requests.

Glucose snapshots are published both by foreground refreshes and by the
background AppService when it obtains a valid reading. If no glucose was
published, the face shows NO CGM DATA. A value older than 15 minutes is dimmed
and explicitly labelled STALE. Chart gaps are never fabricated.

## Install and test using GitHub Codespaces

1. Install the updated Mini App from the repository root using:
   npm install && npm run preview
2. Open the Mini App, enable BG ON and confirm current glucose and history.
3. Set the preferred 2h/6h chart range in the Mini App; it will be shared.
4. From the repository root, run:
   cd watchface
   npm install
   npm run check
   npm test
   npm run preview
5. Scan the Zepp developer preview QR code to install the **separate face**.
6. Activate the face in watch-face settings and compare the glucose age and
   value to the original Mini App.
7. Close the Mini App for 15–20 minutes and verify that the face still gets
   recent readings as AppService updates shared storage.

The face appId is provisionally set to 1092842. If Zepp requires an appId
registered in your own developer console, change it in watchface/app.json.
Keep the Mini App's appId (1092841) unchanged.

## Current limits

- Fixed 466×466 Active 2 Round layout; physical watch verification pending.
- Chart range follows the Mini App's saved 2h/6h selection. Set it in the Mini App.
- AOD displays time, date, glucose, and age but not the full chart to limit power usage.
  Select the AOD style that follows the active watch face in Zepp settings.
- BPM uses onCurrentChange, not getLast. If no measurement arrives, it displays
  -- BPM instead of a potentially stale number. Continuous measurement may
  increase battery usage; it is disabled in the separate AOD scene and on destroy.
- Refresh is requested on the watch runtime's minute event; scheduling may
  vary with power mode and Zepp OS.
- Experimental, unofficial glucose display. Do not use for alarms or insulin
  dosing. Keep official Libre notifications and CGM alarms enabled.

## AOD test

After the watch dims, make sure the watch system uses **Always-On Display >
Style > Follow current watch face** (exact menu names can vary by firmware).
If the watch uses a system default AOD style, the custom glucose AOD layout
will not appear even when it is correctly installed.

AOD elements have explicit Zepp `show_level.ONAL_AOD`, and normal widgets
are marked `show_level.ONLY_NORMAL`. The watchface re-reads the glucose
snapshot on its minute event and on UI resume. The operating system may
still defer JavaScript updates during screen-off or low-power modes; test
the age before and after wake, and do not interpret AOD values as continuous
or alarm-grade glucose monitoring.
The CGM values on AOD are informational only, not alarm data.

## Diagnosing different values on the face and in the Mini App

The Mini App fetches LibreLinkUp data when opened; the face only sees the last
successful cross-app publication. The face now displays:
- `3m`: glucose measurement age (not face startup age).
- `SHARE 4m`: age of the last successfully published face snapshot.

The producer verifies that the shared store contains the written payload and
rejects older sensor measurements. The face also refuses to roll back to an
older value during an active session. This reduces stale-data regressions but
cannot force background scheduling when Zepp suspends it.

If the face shows `SHARE 20m` but the Mini App immediately shows live data,
the shared snapshot was not updated by the background service during those
20 minutes. To isolate the failure, open the Mini App once and return to the
face: `SHARE` should then become `0m`. If not, check Zepp device logs for
`WATCHFACE_SHARE_VERIFY_FAILED` or `WATCHFACE_SHARE_UNAVAILABLE`.

## Heart rate and screen wake

The face only displays BPM from `HeartRate.onCurrentChange` while
`Wear.getStatus() === 1` (confirmed wearing) and the screen is awake.
It shows `-- BPM` when not worn, the wearer is unknown, or no fresh
measurement arrived within two minutes. Motion alone is not proof of
wearing. Continuous measurement pauses when the face is inactive.

While the normal face is active, its shared-data view is polled every 30
seconds. Screen-on events trigger an immediate refresh. The watch firmware
may suspend JavaScript while the screen is off, so do not expect a live face
to update in darkness solely because background sync is working.

## Identifying AOD mode

The custom AOD screen now includes a small static `LIBRE AOD` label.
If an Always-On screen displays only a generic system clock and *not*
`LIBRE AOD`, Zepp is using its system style or did not load this face's
custom AOD. On Active 2 Round, open the device's Always-On Display settings,
enable AOD, and choose the style that **follows the current watch face**.
Custom AOD is dependent on device firmware and watchface installation.
Do not rely on AOD as a glucose alarm.

## AOD selection and wear-sensor troubleshooting (v0.1.2)

**Style Selection** is Zepp's catalog of built-in/system standby styles.
Custom third-party watch faces do not normally appear as selectable entries in
this catalog. The relevant AOD operating mode is **Follow Current Watch Face**,
not a selection of our face from that catalog. Whether that mode is exposed
by your Active 2 firmware is device-dependent.

The face now reads the **actual system standby mode** using
`getSettings().standby.style` and prints `AOD SYSTEM` (OS default),
`AOD FACE` (follows current face), or `AOD UNKNOWN` next to the chart range.
If it says `AOD SYSTEM`, our screen-off widgets cannot override the chosen
system standby style. Changing watchface code cannot change the system AOD
preference. If the firmware never presents a Follow option, treat custom AOD
as unsupported until a device-specific workaround is confirmed.

Heart rate is now gated more conservatively: a confirmed worn state must
persist for at least 60 seconds, and two fresh live heart-rate callbacks must
occur before a number is displayed. It becomes stale after 45 seconds.
The small `WRIST 0/1/2/3` indicator shows the raw Zepp OS wearing status.
Zepp defines 0=off, 1=on wrist, 2=motion, 3=uncertain. If the watch reports
`WRIST 1` while resting off-wrist, **the device's wearing classifier is
misreporting**. The code cannot establish physical skin contact independently.
In that case do not treat the BPM value as reliable; we can disable BPM on
this hardware if the problem continues. No wearer is identified by the app.
