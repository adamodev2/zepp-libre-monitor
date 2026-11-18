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
