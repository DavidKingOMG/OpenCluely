# OpenCluely

OpenCluely is a stealth-style desktop interview assistant built with Electron. It provides real-time help from screenshots and voice transcription, with multi-provider LLM support and in-app onboarding.

## What Is New

- Multi-provider LLM support with runtime switching:
  - `gemini` (API key)
  - `openai` (API key)
  - `codex` (OAuth login flow)
  - `anthropic` (API key)
- Startup LLM onboarding modal (provider + model + auth mode).
- Codex OAuth callback flow integrated in-app (local callback server).
- Screenshot analysis now uses the currently selected provider and model.
- STT diagnostics window added with close button and `Esc` support.
- Improved fallback/error messaging for quota/auth/network issues.
- Codex request/response compatibility updates:
  - ChatGPT backend endpoint flow
  - SSE parsing and stabilization
  - duplicate response text fix

## Features

- Stealth overlay windows (floating controls, always-on-top behavior).
- Screenshot-based question analysis.
- Optional speech-to-text input.
- Skill-based prompting (general, programming, dsa, system-design, and more).
- Session-aware responses.
- Draggable response/chat windows with markdown rendering.

## Requirements

- Node.js 18+
- npm
- Windows/macOS/Linux (Electron-supported)

## Quick Start

1) Clone

```bash
git clone https://github.com/DavidKingOMG/OpenCluely.git
cd OpenCluely
```

2) Install

```bash
npm install
```

3) Run

```bash
npm start
```

On first launch, complete the in-app LLM setup modal.

## Configuration

OpenCluely supports in-app provider setup, plus optional `.env` values.

### Optional `.env`

```env
# Default startup selection (optional)
LLM_PROVIDER=openai
LLM_MODEL=gpt-4o-mini

# API keys (for API key auth modes)
GEMINI_API_KEY=your_gemini_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Optional speech settings
AZURE_SPEECH_KEY=your_azure_speech_key
AZURE_SPEECH_REGION=your_azure_region

# Optional Whisper/runtime tuning (if used by your setup)
WHISPER_MODEL=ggml-base.en.bin
WHISPER_INTERVAL_MS=2000
WHISPER_AUDIO_SOURCE=microphone
WHISPER_CAPTURE_DEVICE=auto
```

## Provider/Auth Behavior

- `codex` uses OAuth mode and a local callback flow.
- `openai`, `gemini`, and `anthropic` use API key mode.
- Model selection is validated against the selected provider.
- Screenshot and transcription requests use the active provider/model pair.

## STT Diagnostics

You can open STT diagnostics from Settings.

- Shows current STT health/details.
- Close via button or `Esc`.

## Keyboard Shortcuts

Common defaults include:

- Screenshot capture
- Toggle speech recording
- Toggle interaction mode
- Open chat/settings

(Exact bindings may vary by platform/window context.)

## Troubleshooting

- If provider calls fail, check provider auth mode and credentials in Settings.
- If Codex OAuth succeeds but requests fail, re-run login and confirm selected model is a Codex-supported model.
- If speech is unavailable, app still works with screenshot + typed workflows.

## Security and Privacy

- Keep `.env` out of version control.
- Do not commit API keys, OAuth tokens, or personal credentials.
- This repository includes `env.example` as a template only.

## Development Notes

- Main process: `main.js`
- LLM integration: `src/services/llm.service.js`
- Core config/provider models: `src/core/config.js`
- Settings UI logic: `src/ui/settings-window.js`
- STT diagnostics UI: `stt-diagnostics.html`, `src/ui/stt-diagnostics-window.js`

## License

MIT (see `LICENSE`).
