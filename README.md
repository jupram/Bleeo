# Bleeo

Bleeo is a privacy-first browser extension for Edge and Chrome that softens sensationalized text before it grabs your attention.

It runs locally in your browser, looks for emotionally sharp or clickbait-style language on news and social feeds, and blurs matched text in place. You stay in control: click a blurred phrase to reveal it temporarily, adjust sensitivity, disable filtering globally, or set per-site overrides.

## Why Bleeo exists

Modern feeds are optimized to pull people into urgency, outrage, and panic. Bleeo is built around a smaller goal: make the web feel calmer without blocking access to information.

The extension does not rate people, sources, or viewpoints. It only looks at the wording of visible text and applies a local filter when the language appears sensationalized.

## Features

- Local text classification with no remote server calls.
- Default filtering on common news and social domains.
- In-place blur that preserves page layout.
- Click-to-reveal behavior for filtered text.
- One-hour per-site pause from the popup.
- Sensitivity controls for low, medium, and high filtering.
- Global enablement and per-site overrides.
- Optional visible markers on filtered text.
- Extension badge count for the current page.

## Privacy

Bleeo is designed so page text stays on your device.

- No article text, post text, or browsing content is sent to a server.
- Classification happens in the extension runtime.
- Global preferences are stored in sync storage. Per-site overrides and snooze state are stored in local storage only and do not follow the user across signed-in profiles or devices.
- The extension only requests access to the supported news and social domains and does not run on other sites. `activeTab` is used for popup current-site controls.
- The project has no analytics, tracking SDK, or telemetry dependency.

## How Filtering Works

Bleeo scans visible page text and identifies candidate headlines, posts, and short text blocks. It then scores those candidates using local heuristics, including:

- alarm-style words such as urgent, shocking, panic, chaos, and disaster;
- clickbait phrases such as "you won't believe" and "what happened next";
- fear appeals, outrage bait, urgency frames, and curiosity-gap hooks;
- loaded words such as bombshell, exposed, and unbelievable;
- repeated punctuation and strong uppercase emphasis;
- social-feed-specific handling for all-caps hooks.

This is intentionally conservative and explainable. The current classifier is rules-based, so contributors can inspect and improve the behavior without needing a hosted model.

## Detection Quality

Bleeo uses a local rules-based detector for fast, explainable classification in the browser. See [docs/detection-roadmap.md](docs/detection-roadmap.md) for the current detection approach and the path toward an optional in-browser model.

## Install For Development

Requirements:

- Node.js
- npm
- Microsoft Edge or Google Chrome

Install dependencies:

```bash
cmd /C npm install
cmd /C npm run typecheck
cmd /C npm run build
```

Run tests:

```bash
cmd /C npm test
```

Start watch mode while developing:

```bash
cmd /C npm run dev
```

On Windows PowerShell, use `cmd /C npm ...` if script execution policy blocks `npm.ps1`.

## Load The Extension

1. Build the project so `dist/` exists.
2. Open `edge://extensions` or `chrome://extensions`.
3. Enable Developer mode.
4. Choose **Load unpacked**.
5. Select the `dist` folder from this repository.

For this workspace, that folder is:

```text
D:\Code\Bleeo\dist
```

## Project Structure

```text
public/
  manifest.json       Extension manifest
  popup.html/css      Toolbar popup UI
  options.html/css    Settings page UI
  content.css         Styles injected into filtered pages

src/
  background/         Service worker and extension message handling
  content/            Page scanning, DOM wrapping, reveal behavior
  offscreen/          Offscreen classification entrypoint
  popup/              Popup UI logic
  options/            Settings page logic
  shared/             Settings, validation, types, heuristics

tests/
  *.test.ts           Vitest coverage for shared behavior
```

## Attribution And License

Bleeo is licensed under the Apache License 2.0. Redistributed copies must keep the copyright, license, and NOTICE attribution.

Copyright is credited to `jupram`. See [LICENSE](LICENSE) and [NOTICE](NOTICE) for details.
