# Libre Monitor — Amazfit Active 2

**Personal, community-shared glucose display for Zepp OS.** I built this project for my own use and am sharing it with anyone who might find it useful. It is an independent hobby project, not a commercial product, and I cannot promise ongoing support or compatibility.

The app displays **real glucose readings from FreeStyle Libre via LibreLinkUp** on an **Amazfit Active 2**. It talks to LibreLinkUp through the Zepp phone companion, without Nightscout or a separate cloud server.

> [!WARNING]
> **Not a medical device.** This is an experimental, unofficial display. It is **not** approved by Abbott, Zepp Health or a healthcare regulator. Never use it as the sole source for insulin dosing, treatment decisions, hypoglycemia detection or emergency alerts. Keep the official Libre app, CGM notifications and your usual treatment workflow in place.

## Disclaimer: use at your own risk

**USE AT YOUR OWN RISK.** This project is provided **"AS IS" and "AS AVAILABLE"**, without warranties of any kind, including accuracy, reliability, fitness for a particular purpose, continuous operation, or compatibility. Glucose readings, timestamps, history, and background synchronization can be **missing, delayed, incorrect, or unavailable**. Do not use this app to make insulin-dosing or other medical decisions, to detect emergencies, or as a replacement for your approved CGM app and alarms.

**To the maximum extent permitted by applicable law, the author accepts no liability for damage, loss, injury, or other consequences arising from installing, using, modifying, or relying on this project.** Users are responsible for deciding whether to install it, protecting their accounts and data, and independently verifying all medical information with their official CGM system. This statement does not override rights or responsibilities that cannot legally be excluded.

## Development, AI assistance, and sharing

I created Libre Monitor **for my own use** and **I use it myself**. I have built and refined it **together with AI-assisted development tools**. I make a genuine effort to review, test, troubleshoot, and improve the software using my own watch and glucose setup, but **AI-assisted code and my tests may still contain mistakes**.

This is a **work in progress under active development**, not a finished or medically validated product. Features may change, break, or stop working; updates, support, fixes, and continued development are not guaranteed. I share the code publicly so others who find it useful can try it, inspect it, and contribute improvements **at their own risk**. This project is independent and is not affiliated with, endorsed by, or supported by Abbott or Zepp Health.

## Features and verification status

| Feature | Status |
| --- | --- |
| Real current glucose (mg/dL) and trend arrow | **Confirmed on a physical Amazfit Active 2 Round** |
| Glucose colors: green 80–160 mg/dL, yellow 70–79 and 161–240, red below 70 or above 240; all four thresholds adjustable | Implemented; watch verification pending |
| Automatic refresh every 60 seconds while the app is open; manual **Refresh** | Implemented; physical-device glucose updates confirmed |
| Two-hour / six-hour chart using actual LibreLinkUp history | **Confirmed to display on Active 2**; graph coverage varies |
| One visible real point per five-minute time bucket | Implemented (not synthetic five-minute readings) |
| Solid connections up to 20-minute gaps, dashed connections for 21–30 minutes, disconnection above 30 minutes | Implemented; missing measurements are never recreated |
| Account settings and diagnostic events in Zepp | Implemented |
| In-memory login session reuse (up to 45 minutes) | Implemented; may re-authenticate when the phone service restarts |
| Optional background synchronization and persisted six-hour history | **Experimental; not yet confirmed to fetch while app is closed** |
| Glucose watch face (time, date, glucose, graph, BPM, battery) | **MVP on feat/glucose-watchface-mvp; hardware verification pending** |
| Glucose alarms, insulin calculations or treatment advice | **Not implemented** |

## Watch face MVP

The separate, read-only watch face project is in `watchface/`. The Mini App
publishes a compact glucose snapshot using Zepp OS shared typed storage.
See `watchface/README.md` for installation instructions and limitations.

## What you need

- An **Amazfit Active 2** paired with an **Android phone** running **Zepp**. The round 466 × 466 model is the physically tested target; an optional square layout is included but not verified.
- A functioning FreeStyle Libre setup with glucose sharing enabled and a **LibreLinkUp follower account** that already sees readings in the official LibreLinkUp app. **An ordinary LibreView login is not a drop-in replacement.**
- A computer or GitHub Codespaces with Node.js (CI uses Node.js 22), internet access and a Zepp developer login for private QR installation.
- A watch-to-phone connection and a phone that can reach the Abbott service. This is **not a direct sensor-to-watch connection**.

## Install on your watch (private developer preview)

If you already have a Codespace for this repository:

```bash
git fetch origin
git switch --detach origin/feat/background-glucose-history
npm install --no-audit --no-fund
npm run zepp:login
npm run preview
```

1. In Zepp on Android, enable **Developer Mode** for your paired watch (the menu position may differ by Zepp version).
2. In the terminal, run `npm run preview` and choose the **round Active 2 / 466 px** target for the round watch.
3. In **Zepp > your watch > Developer Mode**, select **Scan** and scan the freshly generated QR code to install Libre Monitor.
4. Find **Libre Monitor** in the watch's apps list and open it.

**After merge:** use `git switch main` instead of `git switch feat/zepp-glucose-app-mvp` to install the released MVP from the default branch.

You may need to sign in to the Zepp developer platform using `npm run zepp:login`. Browser-based login from Codespaces is not guaranteed; if it fails, clone the repo locally, run `npm install`, `npm run zepp:login` and `npm run preview` on your computer.

**Important:** A CI-generated `.zab` package is not an Android APK. It cannot be installed by tapping the file on your phone. A QR preview build is for private testing, not App Store distribution. See the [Zepp CLI documentation](https://docs.zepp.com/docs/guides/tools/cli/).

## Configure LibreLinkUp

1. In the **official LibreLinkUp app**, verify your dedicated follower account can already see a recent glucose value and that the person wearing the sensor is sharing with that account.
2. In **Zepp on your phone**, open the paired watch's installed apps, find **Libre Monitor**, and open its **Settings**.
3. Enter **LibreLinkUp email** and **LibreLinkUp password** for the follower account (not your Zepp account).
4. Open **Libre Monitor** on the watch. The page first checks the phone service and then requests a live reading.
5. Confirm the displayed glucose is recent and agrees reasonably with the **official LibreLinkUp app**; check the `LibreLinkUp · Xm ago` timestamp before trusting the display's freshness.

Settings also provide **Diagnostics (select and copy text)**, **Clear diagnostic logs**, and **Disconnect and erase credentials**. The disconnect button clears the email/password stored in Zepp Settings Storage; it is not a confirmed secure erase of backups or all historical data.

**Do not paste your password, Abbott auth token, full request logs or account identifiers into GitHub issues.** Use only sanitized diagnostic event codes when reporting a problem.

## Using the watch

- **Large number:** latest glucose in **mg/dL**; green from 80 to 160 mg/dL, yellow from 70–79 or 161–240 mg/dL, and red below 70 or above 240 mg/dL (all thresholds adjustable).
- **Color range:** in Zepp > Libre Monitor > Settings, edit Very Low, Low, High, and Very High glucose thresholds. Defaults are 70, 80, 160, and 240 mg/dL respectively. The current number, trend arrow, actual history dots, and line pixels are red outside the extremes, yellow outside the green range, and green inside the Low/High boundaries. Invalid/reversed limits fall back to defaults. This is a visual distinction only, not a glucose alert.
- **Arrow:** all five directions are drawn using native Zepp shapes, not Unicode text. Arrow color follows the current glucose band; a muted dot means unavailable/unknown.
- **`LibreLinkUp · Xm ago`:** age of the **current reading**, measured using the phone clock. Readings older than **15 minutes** are rejected.
- **`2h / 6h`:** switch the chart time window. It displays at most one real recorded observation per five-minute bucket, not a prediction or interpolated value.
- **`GAP Nm`:** largest interval of over 20 minutes between adjacent displayed observations. A **dashed line** connects actual points across 21–30 minutes; a longer break stays unconnected.
- **`Refresh`:** request a new value manually and reload the current color thresholds.
- **`BG OFF / BG ON`:** enable/disable experimental background sync. `BG ON` means the service is active, not that data collection has succeeded.
- **`LIVE Xm · GRAPH Ym · BG Zm`:** age of live reading, newest Abbott graph record, and last successful background fetch. `BG WAIT` means none has succeeded.

The **current glucose** comes from LibreLinkUp's connection measurement. The **history** comes from a separate `/llu/connections/{patientId}/graph` request and from real observations collected while the app is running. Abbott may return sparse or delayed history even when the latest glucose is fresh. The chart cannot reconstruct readings that were never received.

## Data flow and refresh

```text
Libre sensor -> official Libre cloud / LibreLinkUp
              -> Zepp companion Side Service on Android
              -> Amazfit Active 2 app screen
```

- Current glucose: immediately on opening, then about **once per minute** while the foreground app remains open. Foreground collection **stops after the page is closed**.
- Abbott history: cached for up to **five minutes** between graph requests.
- Login: ephemeral token in memory, reused for up to **45 minutes**, with one retry after an HTTP 401.
- A pending watch request times out after approximately **20 seconds**; failed fetches can retry on the next tick.
- The phone-side service does not contact Libre through Bluetooth and does not require Nightscout.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| `Connecting to phone...` or timeout | Watch Bluetooth/Zepp connection, phone internet, Zepp running; reopen the app. |
| `Phone OK, contacting Libre...` but no glucose | LibreLinkUp sharing, follower credentials, Abbott availability; review sanitized diagnostics. |
| `Configure LibreLinkUp account` | Fill in the follower email and password in Zepp's Libre Monitor settings. |
| `No shared LibreLinkUp glucose readings found` | Confirm the official LibreLinkUp app shows the follower's active shared sensor. |
| Sign-in rejected or Abbott terms requested | Sign in to the official LibreLinkUp app and accept any updated terms; then retry. |
| `Reading unavailable or older than 15 min` | The received current measurement is stale or timestamp parsing failed; check official LibreLinkUp and connectivity. |
| Dots but gaps on the graph | Current readings and graph history have different freshness. The chart never invents missing points. |
| Blank/old history while glucose is current | Abbott's graph endpoint can lag, fail or return only a short history window. |
| Different chart or controls than expected | Check the active Git branch, run `git pull`, generate a **new** preview QR and reinstall. |

If the phone service fails to start, look for `[LibreMonitor] SIDE_SERVICE_INITIALIZED` in Zepp developer logs. Its absence suggests a Zepp service/module issue rather than proof of failed Abbott authentication.

## Offline startup cache

The watch stores the last successfully received glucose reading, its original timestamp, thresholds, and up to six hours of timestamped chart points in Zepp's watch-local storage. When reopening the app it immediately shows that saved snapshot with a **CACHED Xm** label while a fresh LibreLinkUp request is underway. Cached data is **not a new measurement** and can be old; failure to connect leaves a **CACHED** label and never silently represents an old reading as live. The cache is refreshed only after successful, fresh live readings and is removed with app uninstallation. This is separate from phone-side background synchronization, and does **not** demonstrate that a background request succeeded. Avoid sharing this watch with other users because its stored measurements are sensitive personal information.

## Cache verification after preview installation

Installing a new QR preview can start with no watch-local cache. **Do not judge offline restore on the first launch after installing a preview.** Open Libre Monitor, wait until a fresh number and chart have appeared, then close the watch app and reopen **without installing another QR code**. The next launch should immediately show `CACHED Xm` and previously saved measurements while connecting.

If it remains blank, check watch developer logs for `WATCH_CACHE_SAVED`, `WATCH_CACHE_VERIFY_FAILED`, or `WATCH_CACHE_WRITE_FAILED` before reinstalling. Cache storage is sensitive personal data and does not prove that background sync is working.

## Background sync: device test checklist

This branch is rebased on the latest `main`, including PR #7 native arrows without unsupported Unicode glyphs. It retains the four customizable thresholds, readable layout, and chart color rendering.

1. Use the QR preview for `feat/background-glucose-history`.
2. Open Libre Monitor, check the normal glucose reading and the yellow/green/red thresholds. Close and immediately reopen it; the last reading and chart should show as **CACHED Xm** before the new network response arrives.
3. Tap **BG OFF**, grant background-service permission on the watch, and verify the button changes to **BG ON**.
4. Close Libre Monitor completely. Keep the watch paired and Zepp running on the phone.
5. After **15–20 minutes**, reopen Libre Monitor. Check `BG Xm` and the six-hour chart. **BG WAIT** indicates no successful background phone fetch. Other device-side indicators can help diagnose failures: **BG NO LINK** (the App Service has no phone request bridge), **BG REQUEST** (attempt made), **BG FAILED** (request failed), **BG NO DATA** (request did not report success), **BG STARTED** (service started but no successful fetch yet).
6. In Zepp app settings, inspect sanitized diagnostics for `BACKGROUND_REQUEST`, `BACKGROUND_SUCCESS`, `BACKGROUND_FAILURE`, or `BACKGROUND_STALE`. Never share credentials, account IDs, or tokens.

The watch App Service attempts a background phone request approximately every five minutes, subject to Zepp OS and Android restrictions. The service may start without its request bridge working; a successful build and permission grant do not confirm real background updates. Persisted glucose history is stored in Zepp Settings Storage on the phone; verified at-rest encryption is not available. This is **not** an alarm system or medical device. Keep official Libre notifications enabled.

## Privacy and technical limitations

- The LibreLinkUp integration uses **unofficial/undocumented endpoints**. Abbott can change behavior, require new terms, restrict accounts or stop responses without notice. Regional redirects are handled, but country/account behavior is not guaranteed.
- **Email and password are held in Zepp Settings Storage on the phone. Secure encryption has not been verified.** Use a dedicated follower account, protect your phone, and avoid sharing screenshots or debug logs containing secrets.
- The app and its chart show **personal health data**; do not install it on an untrusted/shared device.
- A green CI build proves syntax/tests and package generation only; it does **not** prove live Abbott connectivity, display behavior on every watch or reliability in the background.
- The app must not replace official Libre alarms, even if you see a fresh glucose number.
- Do not assume compatibility with Libre 3, Medtronic, other sensors, iOS or non-Active-2 watches without additional device/account testing.

## Development and builds

```bash
npm install --no-audit --no-fund
npm run check
npm test
npm run preview
```

GitHub Actions **Zepp OS CI** checks JavaScript and the manifest, runs mocked LibreLinkUp tests and builds a `.zab` package. CI artifacts can be found under **Actions > Zepp OS CI > Artifacts**. Tests use fabricated mock readings; live device display uses real LibreLinkUp readings, **not demo values**.

`app.json` tracks the stable base version (`0.1.0` in this branch). CI development builds can add a unique development suffix. Actual stable release/versioning and Zepp Store distribution are separate tasks.

## Readable Active 2 screen layout (experimental branch)

The `feat/active2-readable-layout` branch changes **only the watch display layout** (no LibreLinkUp, account, or data-processing changes):

- Main glucose value increased from **84 to 92 px** (approximately 10% larger).
- Trend arrow moved to the **right of the glucose number**, with a **15 px gap** on the same row; it has its own 52 px font.
- Smaller typography increased for readability: caption 17 → 21 px, status 16 → 19 px, units 23 → 26 px, buttons 16–17 → 19 px, heading 25 → 27 px.
- The 2h/6h chart is slightly taller; controls are positioned further inside the round display.
- Screen layout is separately defined and tested for Active 2 round (466 × 466) and square (390 × 450) variants.

**Physical-device check required:** Confirm the complete three-digit glucose number, arrow, status and both buttons are visible without clipping on your actual Active 2. This branch is intended to merge into the MVP branch first, then follow the MVP into `main` after review.

## Project background and sharing

This is my personal, **AI-assisted** project, shared for others who may find it useful. I use it myself, make a genuine effort to test and improve it, and continue developing it. **All use is at your own risk**; see [Disclaimer: use at your own risk](#disclaimer-use-at-your-own-risk) for important limitations and liability terms.

**Licensing note:** There is currently **no `LICENSE` file** in this repository. I am sharing the source for visibility and community interest, but formal permissions for copying, modifying and redistributing it still need a license decision before calling it a fully open-source release. Contributions, suggestions and careful bug reports are welcome.

## Branch and merge guidance

- **`feat/zepp-glucose-app-mvp`** contains the foreground monitor, settings, chart and direct LibreLinkUp connection. It is reviewed in [PR #1](https://github.com/adamodev2/zepp-libre-monitor/pull/1) against `main`.
- **`feat/background-glucose-history`** builds on the MVP and adds experimental background features and persistent history. It is reviewed in [PR #5](https://github.com/adamodev2/zepp-libre-monitor/pull/5) against the MVP branch.
- **Recommended merge order:** review/merge **PR #1** into `main` first; then retarget **PR #5** to `main`, test its optional background behavior, and merge only when acceptable. The background feature is not needed for normal live-glucose display.

## Configurable display threshold testing

The branch `feat/configurable-glucose-colors` includes the larger glucose number and the adjacent trend arrow from `feat/active2-readable-layout`, plus adjustable red/yellow/green ranges. Choose this branch for a combined device preview. The thresholds are visual preferences, not medical alerts; official Libre alarms remain necessary.
