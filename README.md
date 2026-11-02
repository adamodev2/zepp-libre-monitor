# Zepp Libre Monitor

Experimental Zepp OS app for Amazfit Active 2. Current app displays **DEMO data (118 mg/dL)**; it does not fetch LibreLinkUp readings yet.

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

## Local installation and testing

1. Install Node.js, clone the repository, and check out `feat/zepp-glucose-app-mvp`.
2. Run `npm install`, `node scripts/generate-icon.cjs`, then `npm run build`.
3. For **device installation**, run `npx zeus login` (Zepp developer account required) and `npx zeus preview` to generate a device-specific QR code.
4. On your Android phone, open Zepp > Profile > Settings > About and tap the Zepp logo seven times to enable Developer Mode.
5. Open the **Active 2** device page > **Developer Mode** > **Scan**, and scan the preview QR shown on your computer.
6. Launch **Libre Monitor** on your watch. Verify demo value, trend arrow, refresh button and text fit.

The GitHub Actions `.zab` artifact is a build output, **not an Android APK** and not necessarily a directly installable QR code. The documented installation path uses `zeus preview`.

If the build fails, consult the specific job log rather than assuming an artifact was produced.

## Roadmap

1. Verify the app compiles and launches on a real Amazfit Active 2.
2. Implement secure settings for LibreLinkUp credentials and region; never put secrets in source code.
3. Integrate LibreLinkUp, show reading timestamps and stale/error state.
4. Add charts, background polling, and an optional watch face.

## Safety

This is not a medical device. Do not dose insulin based on this app or replace official Libre alerts.
