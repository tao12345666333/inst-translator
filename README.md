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
1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the project folder

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

## Notes
- Models may download on first use. Progress is shown in the UI.
- If the API is unavailable on a page, try another normal page (non-privileged).
- No external network LLMs are used; translation runs on-device via Chrome.

## Acknowledgements

- Inspired by:
  - [openai-translator](https://github.com/openai-translator/openai-translator/)
  - [fancy-translator](https://github.com/daidr/fancy-translator)
