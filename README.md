# Zepp Libre Monitor

Experimental Zepp OS app for Amazfit Active 2. This branch contains an **unverified live LibreLinkUp integration**; it has not yet been tested with a real follower account. No demo readings are used.

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
