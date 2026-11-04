# Zepp Libre Monitor

Experimental Zepp OS app for Amazfit Active 2. Live LibreLinkUp glucose and trend display have been confirmed on an Active 2; new chart and session-caching features still require physical-device verification. No demo readings are used.

## Versioning

- Builds from `main` use the official semantic version in `app.json` (for example `0.1.0`).
- Feature branch and PR builds use the same base with a unique development suffix (for example `0.1.0-dev.42`).
- Development builds receive a CI-specific numeric internal version code. To release a new stable version, update both `app.version.name` and `app.version.code` in `app.json` through a pull request.
- Development numbering is generated during CI and does not modify committed project files.

## Automated checks

GitHub Actions runs on pushes, pull requests and manual dispatch:
- Installs dependencies and validates JavaScript/manifest.
- Generates the app icon and attempts a Zeus CLI build.
- Uploads the `.zab` package in the run's **Artifacts** if the build succeeds.

Find runs under **Actions > Zepp OS CI**. A successful package build does not guarantee real-device compatibility.

## Private installation without publishing

Zepp's officially documented private installation method uses **Developer Mode in Zepp** and a QR code generated with `zeus preview`. A downloaded `.zab` file is not an Android `.apk` and cannot be installed by tapping it on your phone.

### GitHub Codespaces (no local checkout)

1. Create a Codespace on `feat/zepp-glucose-app-mvp` (GitHub > Code > Codespaces).
2. Open its terminal and run `npm install --no-audit --no-fund`.
3. Run `npm run zepp:login` and complete the Zepp Open Platform developer sign-in. **Remote browser login is not guaranteed to work in Codespaces.** If it fails, use a local terminal instead.
4. Run `npm run preview` and select the correct Active 2 round-screen target when prompted. The command now prepares the missing Zeus private-module symlink and generates both app icons before invoking Zeus.
5. Open Zepp on your Android phone > Profile > paired Active 2 > Developer Mode > Scan, scan the preview QR, and confirm installation.

Note: **Codespaces has not been verified end-to-end for Zepp login or QR generation.** It is a possible route, not a guaranteed one-click installer. See the Zepp OS documentation: https://docs.zepp.com/docs/guides/tools/cli/

### Local fallback when Codespaces login fails

Clone/download the source **once** to a computer, install Node.js, then run `npm install`, `npm run zepp:login`, `npm run preview`. Scan the QR from Zepp Developer Mode. This is the documented installation route; it is separate from the GitHub Actions downloadable artifact.

### Testing live glucose

After installation, configure a dedicated LibreLinkUp follower account in Libre Monitor settings in Zepp. Open Libre Monitor on the watch and verify that it displays an actual recent reading. The LibreLinkUp API implementation and settings login are **not yet tested on a physical Active 2**. Never share credentials in GitHub issues or chat. App settings storage has not been verified as encrypted secret storage.

If the preview fails, capture the **first error line** and the command where it occurred (`npm install`, `npm run zepp:login`, or `npm run preview`), while removing credentials and tokens.

## Display targets

- Default/first target: **Amazfit Active 2 (Round), 466 × 466**.
- Optional target: **Amazfit Active 2 (Square), 390 × 450** (`st: s`, `dw: 390`).
- The app detects the connected screen shape and dimensions and adjusts its glucose view.
- When running `npm run preview`, select the **round Active 2** profile for the round watch. The order in the manifest does not override a manual Zeus device selection.

## Automatic refresh

While Libre Monitor is open, it fetches LibreLinkUp data immediately and again every 60 seconds. A 20-second watch-side timeout clears a stalled request and permits the next manual or scheduled retry; late results from timed-out requests are ignored. Manual Refresh still works. Concurrent refreshes are skipped; after an error, the next timer tick retries automatically. The timer is stopped when the app page closes. This is **not** background synchronization or a watch face update. Readings older than 15 minutes are rejected. Real-device behavior is not yet verified.

## Roadmap

1. Verify the app compiles and launches on a real Amazfit Active 2.
2. Replace basic Zepp Settings Storage credential persistence with stronger secure storage or session-based sign-in before general release.
3. Verify EU LibreLinkUp login, measurements, region redirects and current account headers against a real account.
4. Add charts, background polling, and an optional watch face.

## Safety

This is not a medical device. Do not dose insulin based on this app or replace official Libre alerts.

## Troubleshooting indefinite loading

If the screen remains on `Connecting to phone...` for more than 20 seconds, the app should now show `Timeout: check Zepp phone connection` instead of blocking forever. Confirm the watch is connected to the phone, Zepp is running, and companion account settings are saved. Other failures show an abbreviated error on the watch. A green GitHub build does **not** prove LibreLinkUp login succeeds on the phone; the unofficial API still requires testing.

## Automated mock integration tests and diagnostics

The CI `validate` job runs `npm test` with mocked LibreLinkUp responses: success, missing account, authentication rejection, HTTP failure, invalid JSON, network failure, no shared readings, and regional redirect. Tests require no Abbott account and do not contact Abbott. They cannot validate real account authentication or Bluetooth communication.

In Zepp > Libre Monitor settings, the **Diagnostics (select and copy text)** input displays up to 30 timestamped event codes from the phone-side service. The **Clear diagnostic logs** button removes them. Log events contain no email, password, token, glucose reading, raw HTTP body or full request URL. The diagnostic UI's actual copy behavior needs a real Zepp app check. Do not share the old JS App Log if it includes secrets.

## Side Service startup diagnosis

If the watch shows a handshake timeout or the Zepp JS App Log shows `Cannot read properties of undefined (reading 'onInit')`, the phone's Side Service may not have initialized. This is **not evidence of an Abbott login failure**.

This development build first sends a `PING` to the Side Service before fetching glucose. `Phone OK, contacting Libre...` means the Side Service responded. A timeout before that message points to the watch-phone bridge or service startup. The Side Service emits a startup marker `[LibreMonitor] SIDE_SERVICE_INITIALIZED` in Zepp developer logs. No credentials are included in these messages.

If the worker fails before the startup marker appears, capture the full stack trace (excluding account secrets); the crash may occur during module evaluation or library initialization. The package build and mocked LibreLinkUp tests alone cannot verify phone Side Service execution.

## Mini chart and session reuse

- The watch shows a 2-hour glucose trace, switchable to 6 hours with the **2h / 6h** button. It displays at most one actual measurement per five-minute time bucket, with adjacent points connected when their timestamps differ by no more than twenty minutes. Longer gaps remain unconnected.
- Actual points come from the unofficial LibreLinkUp `/llu/connections/{patientId}/graph` endpoint. Samples are positioned by time with five-minute buckets, and gaps longer than twenty minutes are not connected. If graph history is unavailable, current glucose remains visible.
- Graph history is requested at most once per five minutes while the Side Service is running. Live current glucose is requested every minute while the page is open.
- LibreLinkUp bearer tokens and account hash remain in memory only and are reused for up to 45 minutes, with a single reauthentication attempt after an HTTP 401. Closing/restarting the Zepp Side Service may require signing in again.
- `GRAPH_HTTP`, `GRAPH_POINTS`, `GRAPH_UNAVAILABLE` and `SESSION_REUSED` diagnostics contain no account IDs, tokens, passwords, glucose values or graph contents.
- The history feature is still experimental and not validated against real Abbott graph responses on the Active 2. Do not interpret gaps as normal glucose values.

## Watch face integration

The glucose display inside **Libre Monitor** is now implemented. A separate live **watch face** is not included in this PR. Zepp OS watch faces do not share the Mini Program Side Service network interface directly; a separate watch-face/background data bridge and installation flow are needed. See https://github.com/orgs/zepp-health/discussions/330.

## Active 2 chart rendering fix

The original CANVAS-based graph displayed a black region even when the watch received real history (for example `LAST 2 HOURS · 7 PTS`). The chart now uses standard Zepp OS CIRCLE markers and GRADKIENT_POLYLINE segments, with a FILL_RECT axis and explicit widget cleanup on refresh. The range remains 2 hours by default, switchable to 6 hours. This change requires real-device verification because CI validates the package but cannot verify graphics on the physical watch.

## Two/six-hour graph update

The graph now uses five-minute sampling buckets (no synthetic values) and native connected polylines for actual points no more than twenty minutes apart. This accommodates the sparse points returned by Abbott while retaining visible breaks during outages. The phone retains up to six hours of graph/history data and the watch switches between two and six hours without another login. Graph history older than what Abbott returns cannot be reconstructed automatically. The graph is not intended for treatment decisions.

## Active 2 line/marker alignment

The native GRADKIENT_POLYLINE widget uses local bottom-origin coordinates, while CIRCLE markers use absolute screen coordinates. A physical-device test showed the two renderers did not align. For consistent placement, connecting strokes now use short FILL_RECT segments generated in the same absolute top-left coordinate system as the CIRCLE measurement markers. The rasterized stroke has a capped widget budget, keeps missing-data gaps, and does not alter LibreLinkUp readings or five-minute sampling. Physical-device confirmation is still needed.
