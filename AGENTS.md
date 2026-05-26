# AGENTS.md

## Project Overview

`inst-translator` is a Manifest V3 Chrome extension that runs translation and related text actions with Chrome Built-in AI. It uses:

- Prompt API (`LanguageModel`) for generation.
- Language Detector API (`LanguageDetector`) for automatic source-language detection in translate mode.
- A content script plus in-page overlay UI for selected text workflows.

The extension is designed to run locally in Chrome. Do not assume normal browser automation or Node tests can fully validate Prompt API behavior; final runtime checks usually require loading `dist/` as an unpacked Chrome extension.

## Repository Structure

```text
inst-translator/
├─ manifest.json          # MV3 extension manifest and web accessible resources
├─ vite.config.ts         # Web extension build config and static copies
├─ src/
│  ├─ ai.ts               # Built-in AI wrappers, availability, sessions, prompts
│  ├─ background.ts       # Context menu and toolbar action entry points
│  ├─ content.ts          # Selection tracking and floating trigger button
│  ├─ overlay.ts          # Host-page overlay shell and iframe/message bridge
│  ├─ overlay.css         # Host-page overlay shell styles
│  ├─ frame.html          # In-page overlay UI document
│  ├─ frame-boot.ts       # Frame focus/close/prefill bridge
│  ├─ popup.html          # Extension popup UI document
│  └─ popup.ts            # Shared UI logic used by popup and overlay frame
├─ tests/                 # Vitest unit tests
├─ icons/                 # Extension icons
└─ dist/                  # Build output loaded by Chrome
```

## Development Commands

- Install dependencies: `pnpm install`
- Build extension: `pnpm build`
- Watch build: `pnpm dev`
- Typecheck: `pnpm typecheck`
- Unit tests: `pnpm test`

After changing extension code, rebuild and reload the unpacked extension in `chrome://extensions`. Loading the source root is not supported; load `dist/`.

## Runtime Architecture

There are three main runtime surfaces:

- `content.ts` runs on matched web pages. It extracts the current selection, shows the floating trigger, and dispatches `st-open-with-text`.
- `overlay.ts` also runs on the host page. It creates the overlay container, loads `src/frame.html` as an extension-origin iframe, and bridges messages between the page and the frame.
- `frame.html` loads `frame-boot.js` and `popup.js`. `frame-boot.ts` handles focus, close, and prefill messages. `popup.ts` owns UI state, settings persistence, and calls into `ai.ts`.

The toolbar popup and the in-page overlay share most UI logic through `popup.ts`. Keep this shared behavior in mind when changing UI state, settings, or Prompt API invocation.

## Important Overlay Lessons

Do not run the overlay UI by writing extension scripts into an `about:blank` iframe. That inherits too much host-page behavior and can break on pages with stricter CSP, unusual page scripts, or timing-sensitive environments.

The overlay should load:

```ts
frame.src = chrome.runtime.getURL('src/frame.html')
```

Because this makes the frame cross-origin relative to the host page, explicitly delegate Built-in AI APIs with Permission Policy:

```ts
frame.allow = 'language-model; language-detector'
```

Without this, `LanguageModel` or `LanguageDetector` may be hidden in the iframe and `ai.ts` will report the Prompt API as unavailable even when Chrome supports it.

When passing selected text into the frame, avoid relying on a single timing point. Store pending text in `overlay.ts`, register message listeners before sending readiness signals, and flush text on both frame `load` and `st-ready` where appropriate. This protects against startup races.

## Built-in AI Notes

- `LanguageModel.availability()` and `LanguageModel.create()` may behave differently across Chrome versions and profiles.
- Initial model download can take time; keep progress reporting intact.
- Automatic source detection depends on `LanguageDetector`; if it is unavailable, translation should still proceed with source language `und` or `auto`.
- The Prompt API is not a normal web API in all contexts. Test in the real extension runtime when debugging availability issues.

## Messaging And Storage

- Use explicit message types such as `st-ready`, `st-set-text`, `st-focus`, `st-close`, `st-storage-get`, and `st-storage-set`.
- Only accept frame messages from the active overlay frame window.
- Storage persistence should not block translation. If the storage bridge fails in frame mode, prefer graceful fallback over surfacing storage errors to the user.
- Keep storage keys centralized. The current UI settings key is `st:prompt-ui:v1`.

## Web Accessible Resources

Any extension resource loaded by a page or page-created iframe must be listed in `manifest.json > web_accessible_resources`.

Typical resources include:

- `icons/*`
- `src/frame.html`
- `src/frame-boot.js`
- `src/popup.js`
- `src/overlay.css`

If Chrome logs `Denying load of chrome-extension://...`, check this manifest list first.

## Development Guidelines

- Prefer small, focused changes that match the existing MV3/Vite structure.
- Do not edit `dist/` manually. Change source files, then run `pnpm build`.
- Keep `popup.ts` compatible with both extension popup mode and in-page overlay frame mode.
- Treat host pages as hostile or unusual environments. Avoid assumptions about CSP, global CSS, page scripts, focus behavior, and selection preservation.
- Use `chrome.runtime.getURL(...)` for extension resource URLs.
- Keep comments short and only where they clarify timing, permissions, or extension runtime behavior.

## Verification Checklist

For ordinary code changes, run:

```bash
pnpm typecheck
pnpm build
pnpm test
```

For overlay or content-script changes, also manually verify in Chrome after reloading the unpacked extension:

- Select page text and click the floating trigger.
- Confirm selected text is prefilled into the overlay input.
- Confirm translation runs with Built-in AI.
- Confirm ESC and the close button dismiss the overlay.
- Try at least one stricter real-world page, such as `https://tailscale.com/blog/aperture-cli-AI-experimentation`.

## GitHub And `gh` CLI Safety

Do not use `gh` CLI to create pull requests or publish/edit GitHub comments without explicit user confirmation immediately before the action. Any operation that may leave content on GitHub requires a second confirmation.

When preparing PR or comment bodies, use Markdown in a temporary file and pass it with `--body-file`. Avoid putting long multi-line text directly on the shell command line.

Before creating or editing a PR, check for PR templates under `.github/PULL_REQUEST_TEMPLATE.md` or `.github/PULL_REQUEST_TEMPLATE/*.md` and follow the template sections.
