# Libre Monitor — Amazfit Active 2

**Personal, community-shared glucose display for Zepp OS.** I built this project for my own use and am sharing it with anyone who might find it useful. It is an independent hobby project, not a commercial product, and I cannot promise ongoing support or compatibility.

The app displays **real glucose readings from FreeStyle Libre via LibreLinkUp** on an **Amazfit Active 2**. It talks to LibreLinkUp through the Zepp phone companion, without Nightscout or a separate cloud server.

> [!WARNING]
> **Not a medical device.** This is an experimental, unofficial display. It is **not** approved by Abbott, Zepp Health or a healthcare regulator. Never use it as the sole source for insulin dosing, treatment decisions, hypoglycemia detection or emergency alerts. Keep the official Libre app, CGM notifications and your usual treatment workflow in place.

## Features and verification status

| Feature | Status |
| --- | --- |
| Real current glucose (mg/dL) and trend arrow | **Confirmed on a physical Amazfit Active 2 Round** |
| Glucose colors: below 70 / 70–180 / above 180 mg/dL | Implemented; fixed thresholds, not personalized |
| Automatic refresh every 60 seconds while the app is open; manual **Refresh** | Implemented; physical-device glucose updates confirmed |
| Two-hour / six-hour chart using actual LibreLinkUp history | **Confirmed to display on Active 2**; graph coverage varies |
| One visible real point per five-minute time bucket | Implemented (not synthetic five-minute readings) |
| Solid connections up to 20-minute gaps, dashed connections for 21–30 minutes, disconnection above 30 minutes | Implemented; missing measurements are never recreated |
| Account settings and diagnostic events in Zepp | Implemented |
| In-memory login session reuse (up to 45 minutes) | Implemented; may re-authenticate when the phone service restarts |
| Experimental background service and persisted 6-hour history | **Implemented as opt-in; successful background fetch not yet confirmed on Active 2** |
| Live glucose on a watch face / always-on display | **Not implemented** |
| Glucose alarms, insulin calculations or treatment advice | **Not implemented** |

## What you need

- An **Amazfit Active 2** paired with an **Android phone** running **Zepp**. The round 466 × 466 model is the physically tested target; an optional square layout is included but not verified.
- A functioning FreeStyle Libre setup with glucose sharing enabled and a **LibreLinkUp follower account** that already sees readings in the official LibreLinkUp app. **An ordinary LibreView login is not a drop-in replacement.**
- A computer or GitHub Codespaces with Node.js (CI uses Node.js 22), internet access and a Zepp developer login for private QR installation.
- A watch-to-phone connection and a phone that can reach the Abbott service. This is **not a direct sensor-to-watch connection**.

## Install on your watch (private developer preview)

If you already have a Codespace for this repository:

```bash
git fetch origin
git switch feat/background-glucose-history
git pull
npm install --no-audit --no-fund
npm run zepp:login
npm run preview
```

1. In Zepp on Android, enable **Developer Mode** for your paired watch (the menu position may differ by Zepp version).
2. In the terminal, run `npm run preview` and choose the **round Active 2 / 466 px** target for the round watch.
3. In **Zepp > your watch > Developer Mode**, select **Scan** and scan the freshly generated QR code to install Libre Monitor.
4. Find **Libre Monitor** in the watch's apps list and open it.

**After merge:** once both PR #1 and PR #5 have been merged, use `git switch main` instead of the feature branch above. Until then, use this branch for BG testing.

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

- **Large number:** latest glucose in **mg/dL**; color changes below 70 or above 180 mg/dL.
- **Arrow:** direction reported by LibreLinkUp; `·` means unavailable/unknown.
- **`LibreLinkUp · Xm ago`:** age of the **current reading**, measured using the phone clock. Readings older than **15 minutes** are rejected.
- **`2h / 6h`:** switch the chart time window. It displays at most one real recorded observation per five-minute bucket, not a prediction or interpolated value.
- **`GAP Nm`:** largest interval of over 20 minutes between adjacent displayed observations. A **dashed line** connects actual points across 21–30 minutes; a longer break stays unconnected.
- **`Refresh`:** request a new value manually.
- **`BG OFF / BG ON`:** opt into or stop experimental background collection. Background success must be verified separately.

The **current glucose** comes from LibreLinkUp's connection measurement. The **history** comes from a separate `/llu/connections/{patientId}/graph` request and from real observations collected while the app is running. Abbott may return sparse or delayed history even when the latest glucose is fresh. The chart cannot reconstruct readings that were never received.

## Optional background sync and saved history (experimental)

This section applies to the **`feat/background-glucose-history`** branch. Background collection is **OFF by default** and is **not guaranteed to run** simply because permission was granted.

- **`ABBOTT GRAPH Xm OLD`** reports the age of Abbott's newest *historical graph* record. This is different from `LibreLinkUp · Xm ago`, which reports the age of the *current glucose measurement*.
- The Side Service stores up to **six hours of real time-stamped glucose readings** in Zepp Settings Storage, so the history can survive a Side Service restart. Storage contains glucose values and timestamps, not the Abbott token; encryption of this sensitive health information is **not verified**.
- Tap **`BG OFF`** on the watch and grant permission when prompted to request the optional Zepp OS background App Service. Tap **`BG ON`** to stop it. **`BG ON`** only indicates that the background service was started; it does not prove that a reading was received.
- If the background App Service and its bridge to the phone actually work, it attempts a glucose update approximately **every five minutes** while the main watch app is closed. When you reopen the app, `BG Xm` shows the age of the **last successful recorded background fetch**; `BG WAIT` means none has yet succeeded.
- Keep the watch paired, the phone connected to the internet and Zepp permitted to run. Zepp OS may deny or suspend background services for privately installed QR builds, and Android power management may stop the phone-side service. **Background communication has not yet been proven reliable on a real Active 2.** A granted permission alone is not a successful test.
- An error such as **`BG unavailable`** indicates a Zepp OS permission/install/runtime restriction, not necessarily an Abbott login issue.
- `BACKGROUND_REQUEST`, `BACKGROUND_SUCCESS`, `BACKGROUND_FAILURE` and `BACKGROUND_STALE` are sanitized diagnostic event codes. Never attach raw Abbott requests or credentials to a report.

**Quick verification:** Enable BG, close Libre Monitor, leave the watch paired for at least 15 minutes, then reopen it. Compare `LibreLinkUp · Xm ago`, `ABBOTT GRAPH Xm OLD` and `BG Xm` / `BG WAIT`. If the BG indicator stays at `WAIT` or does not advance, background fetching is **not confirmed**, regardless of permission status.



## Data flow and refresh

```text
Libre sensor -> official Libre cloud / LibreLinkUp
              -> Zepp companion Side Service on Android
              -> Amazfit Active 2 app screen
```

- Current glucose: immediately on opening, then about **once per minute** while the foreground app remains open.
- When enabled and supported, background sync attempts another reading approximately **every five minutes** after the foreground app is closed; actual delivery is unverified.
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

## Privacy and technical limitations

- The LibreLinkUp integration uses **unofficial/undocumented endpoints**. Abbott can change behavior, require new terms, restrict accounts or stop responses without notice. Regional redirects are handled, but country/account behavior is not guaranteed.
- **Email and password are held in Zepp Settings Storage on the phone. Secure encryption has not been verified.** Use a dedicated follower account, protect your phone, and avoid sharing screenshots or debug logs containing secrets.
- The app and its chart show **personal health data**; do not install it on an untrusted/shared device.
- In the experimental background branch, recent measurements and their timestamps are also saved in Zepp Settings Storage to preserve the chart between Side Service restarts.
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

## Project background and sharing

I originally made this for my **own glucose monitoring on Amazfit Active 2**, then decided to share the work for others who want to experiment with it or improve it. It is supplied **as-is**, without warranty, medical certification, support promises or affiliation with Abbott or Zepp Health.

**Licensing note:** There is currently **no `LICENSE` file** in this repository. I am sharing the source for visibility and community interest, but formal permissions for copying, modifying and redistributing it still need a license decision before calling it a fully open-source release. Contributions, suggestions and careful bug reports are welcome.

## Branch and merge guidance

- **`feat/zepp-glucose-app-mvp`** contains the foreground monitor, settings, chart and direct LibreLinkUp connection. It is reviewed in [PR #1](https://github.com/adamodev2/zepp-libre-monitor/pull/1) against `main`.
- **`feat/background-glucose-history`** builds on the MVP and adds experimental background features and persistent history. It is reviewed in [PR #5](https://github.com/adamodev2/zepp-libre-monitor/pull/5) against the MVP branch.
- **Recommended merge order:** review/merge **PR #1** into `main` first; then retarget **PR #5** to `main`, test its optional background behavior, and merge only when acceptable. The background feature is not needed for normal live-glucose display.
