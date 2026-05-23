# Bleeo

Bleeo is a Manifest V3 extension for Edge and Chrome that blurs sensationalized text on news and social sites.

## Commands

```bash
cmd /C npm install
cmd /C npm run typecheck
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
- The popup can pause filtering on the current site for one hour, then resume it without changing the site's default.
- All classification is local. No page text is sent to a server.
- Sensitivity, global enablement, per-site overrides, and marker visibility are configurable.
- The extension uses `activeTab` for the popup's current-site controls instead of broad tab URL access.
