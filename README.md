# Bleeo

Bleeo is a Manifest V3 extension for Edge and Chrome that blurs sensationalized text on news and social sites.

## Commands

```bash
cmd /C npm install
cmd /C npm run build
cmd /C npm test
```

## Load the extension

1. Build the project so `dist/` exists.
2. Open `edge://extensions` or `chrome://extensions`.
3. Enable Developer mode.
4. Choose **Load unpacked**.
5. Select `D:\Code\Bleeo\dist`.

## Current behavior

- Filtering is on by default for common news and social domains.
- Matched text is blurred in place and can be revealed temporarily with a click.
- All classification is local. No page text is sent to a server.
- Sensitivity, global enablement, per-site overrides, and marker visibility are configurable.

## Detection quality

Bleeo uses a local rules-based detector for fast, explainable classification in the browser. See [docs/detection-roadmap.md](docs/detection-roadmap.md) for the current detection approach and the path toward an optional in-browser model.
