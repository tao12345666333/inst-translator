# inst-translator (Chrome Extension)

A minimal Chrome extension (inst-translator) that:
- Translates selected text on any page via a context menu
- Opens an in-page panel to translate arbitrary text
- Uses Chrome's on-device AI: `Translator` and `LanguageDetector` (Chrome v138+)

## Screenshot

![inst-translator screenshot](https://github.com/user-attachments/assets/e8c79b26-80ce-4e85-9e64-31c7c72e223d)

## Requirements
- Google Chrome 138 or newer

## Install (Load Unpacked)
Recommended (build → load dist/):
1. `pnpm i`
2. `pnpm build`
3. Open `chrome://extensions`
4. Enable "Developer mode"
5. Click "Load unpacked" and select the `dist/` folder

For development (watch → load dist/):
1. `pnpm i`
2. `pnpm dev` (keeps copying into `dist/`)
3. Open `chrome://extensions` and load the `dist/` folder
4. After code changes, click "Reload" on the extension card

## Usage
- Select text on a web page, right-click, and choose "Translate selection" to see an anchored card with translation
- Click the toolbar icon to open an in-page panel; paste or type text and it translates automatically
- Both modes support:
  - Auto language detection if "Source: Auto" is selected (uses LanguageDetector)  
  - Choosing target language (right-click defaults to Chinese; toolbar panel defaults to English)
  - Copying translated text
  - Strict line-by-line translation preserving original formatting

## Features
- **Anchored Selection Translation**: Right-click context menu shows translation card near selected text
- **In-Page Panel**: Click toolbar icon opens a larger panel for extended translation work
- **Line-Preserving Translation**: Maintains original line breaks and paragraph structure
- **On-Device AI**: No external network calls; uses Chrome's built-in Translator API
- **ESC to Close**: Both panel and cards can be closed with Escape key or close buttons

## Development

This project uses pnpm + TypeScript + Vite (vite-plugin-web-extension). The plugin bundles TS entry points from manifest.json and rewrites the manifest to the built files. In-page overlay references built chunks via the plugin's chunk URL mapping, so paths remain valid after bundling.

- Install deps
  - `pnpm i`
- Development (watch copy to dist/)
  - `pnpm dev`
  - Load `dist/` as an unpacked extension in `chrome://extensions`
- Production build
  - `pnpm build`

What the build does:
- Bundles background/content scripts (TS) and rewrites manifest to hashed file names
- Ensures web_accessible_resources include the chunks referenced from code (overlay → about:blank frame)
- Copies icons referenced by manifest

Note: For the about:blank frame, overlay resolves chunk URLs at runtime using the plugin-provided mapping, then sets the iframe content to load those built scripts.

## Notes
- Models may download on first use. Progress is shown in the UI.
- If the API is unavailable on a page, try another normal page (non-privileged).
- No external network LLMs are used; translation runs on-device via Chrome.

## File layout
```
inst-translator/
├─ manifest.json
├─ icons/
│  ├─ icon16.png
│  ├─ icon32.png
│  ├─ icon48.png
│  └─ icon128.png
├─ src/
│  ├─ background.ts/js     # background service worker (TS entry)
│  ├─ content.ts/js        # selection card (right‑click) (TS entry wraps JS now)
│  ├─ overlay.ts           # in‑page panel orchestrator (TS entry; resolves chunk URLs)
│  ├─ overlay.css          # panel styles (injected via content_scripts)
│  ├─ frame-boot.ts/js     # frame boot (TS entry wraps JS now)
│  └─ popup.ts/js          # translator logic for panel (TS entry wraps JS now)
└─ dist/                   # build output (hashed bundles + rewritten manifest)
```

## Troubleshooting
- Toolbar click has no effect
  - Ensure you loaded `dist/`, not the source folder.
  - If you see 404 for chunk paths, run `pnpm i && pnpm build` and reload the extension (manifest must point to built files).
- Panel invisible but exists in DOM
  - Make sure `overlay.css` is injected via manifest (content_scripts). Reload the extension after build.
- ESC/X does not close the panel
  - Some pages block key events; try another page. If persistent, report with URL for a page‑specific workaround.

## Acknowledgements

- Inspired by:
  - [openai-translator](https://github.com/openai-translator/openai-translator/)
  - [fancy-translator](https://github.com/daidr/fancy-translator)
