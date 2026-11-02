# Zepp Libre Monitor

Experimental Zepp OS application for Amazfit Active 2.

## MVP status

- Glucose display (mg/dL), trend arrow, color-coded range and manual refresh.
- ZML phone-side service and watch-side request/response.
- **Demo data only** (118 mg/dL). There is no live LibreLinkUp integration yet.
- The project is **not yet build-tested**. A PNG app icon asset still needs to be added before packaging.

## Development

Install Node.js and the Zepp OS developer tooling, then use `npm install` and `npm run dev`. The configured target is a 390 px round-screen profile; verify Active 2 model compatibility before installing.

## Next steps

1. Add the PNG application icon and verify a Zepp OS build on real hardware.
2. Add secure settings for LibreLinkUp credentials and region, without storing secrets in Git.
3. Implement and test unofficial LibreLinkUp API login and recent glucose readings.
4. Add history, reading age and stale-data warnings, then background updates.

## Safety

Experimental, not a medical device. Do not use this project for insulin dosing or to replace official CGM alerts.
