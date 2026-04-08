# OpenCluely

OpenCluely is an Electron desktop assistant for real-time interview support using screenshots and speech transcription, with stealth-style floating windows and multi-provider LLM support.

## Current Capabilities

- Multi-provider LLM runtime:
  - `codex` (OAuth)
  - `openai` (API key mode in-app)
  - `gemini` (API key mode in-app)
  - `anthropic` (API key mode in-app)
- Screenshot analysis uses the currently selected provider and model.
- Transcription flow with intelligent responses and fallback handling.
- STT diagnostics window (open from Settings, close button + `Esc`).
- Session-aware responses and skill-based prompts.
- Stealth-oriented overlay windows and global shortcut workflow.

## Recent Updates

- Codex OAuth callback/login flow stabilized.
- Codex request/response compatibility aligned (including SSE handling).
- Duplicate response rendering fixed.
- Provider-model alignment fixed for screenshot/transcription calls.
- Settings now persist and restore last-used model per provider.
- Removed `.env`-based setup dependency from runtime docs/flow.

## Requirements

- Node.js 18+
- npm
- Windows/macOS/Linux

## Quick Start

```bash
git clone https://github.com/DavidKingOMG/OpenCluely.git
cd OpenCluely
npm install
npm start
```

On first launch, configure provider/model in-app.

## In-App Configuration

All primary configuration is handled in Settings:

- Select provider and model.
- Use Codex OAuth login for `codex`.
- Set speech provider and Whisper/Azure options.
- Last-used provider/model is automatically remembered.

## Build Redistributables

### Windows

```bash
npm run build:win
```

Typical artifacts in `dist/`:

- `OpenCluely Setup 1.0.0.exe` (NSIS installer)
- `OpenCluely 1.0.0.exe` (portable)

If NSIS output is locked by another process, you can still build portable directly:

```bash
npx electron-builder --win portable --x64 --ia32
```

### Other Platforms

```bash
npm run build:mac
npm run build:linux
```

## Project Structure

- `main.js` - main process app orchestration and IPC
- `src/services/llm.service.js` - provider request/response handling
- `src/services/speech.service.js` - speech providers and diagnostics
- `src/ui/settings-window.js` - settings UI behavior and persistence wiring
- `src/core/config.js` - base runtime config and provider model lists

## Security

- Do not commit API keys, OAuth tokens, or personal credentials.
- Keep local auth/config files private on your machine.

## License

MIT (see `LICENSE`).
