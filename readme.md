# Kittu Voice

[![GitHub release](https://img.shields.io/github/v/release/itsviplove/kittu-voice)](https://github.com/itsviplove/kittu-voice/releases)
[![License](https://img.shields.io/github/license/itsviplove/kittu-voice)](https://github.com/itsviplove/kittu-voice/blob/main/LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22.12-brightgreen)](https://nodejs.org/)

Kittu Voice is a Discord voice assistant scaffold built for modest hardware, with a target of fitting into ~6 GB VRAM workflows by keeping the first audio stack lightweight.

## What it is

- Discord voice assistant foundation
- Local-first audio pipeline shape
- OpenClaw bridge point for responses and orchestration
- Default test voice channel: `1493512967776637092`
- Designed to grow in phases, not pretend the full system exists yet

## Current state

This repo is a scaffold. It currently includes:

- CLI entrypoint
- HTTP status server
- Config loader
- Discord command router scaffold (`/join`, `/leave`, `/say`, `/status`, `/help`)
- Discord slash command registration for `/join`, `/leave`, `/say`, `/status`, `/help`
- Discord voice join/playback path for the configured channel
- Discord voice receive/capture path that saves Opus chunks per speaking turn
- Optional auto-reply loop (`DISCORD_VOICE_AUTO_RESPOND=true`) that can transcribe, reply, and speak back
- Stub OpenClaw client
- Placeholder STT / reply / TTS pipeline
- Smoke-test path

## Intended stack

- Discord voice receive/send
- VAD for turn detection
- Whisper tiny/base for STT
- OpenClaw bridge for assistant logic
- Lightweight TTS first

## Limitations

- Real Discord voice capture/receive is scaffolded; STT uses a Whisper CLI if configured, otherwise falls back safely
- TTS is still basic and meant for testing, not production
- No queueing, session memory, or conversation state yet
- No production auth/retry logic yet
- Performance target is realistic, not guaranteed

## Project layout

```text
src/
  index.js
  app.js
  config/
  discord/
  openclaw/
  pipeline/
  server/
  util/
```

If the codebase is still sparse, this is the intended structure to grow into.

## Run

```bash
npm install
npm run smoke
npm start
```

## Environment

- `PORT` - status server port, default `8787`
- `LOG_LEVEL` - `debug`, `info`, `warn`, `error`
- `DISCORD_TOKEN` - Discord bot token
- `DISCORD_GUILD_ID` - optional guild scope
- `DISCORD_VOICE_CHANNEL_ID` - default voice channel target (`1493512967776637092`)
- `DISCORD_VOICE_AUTO_JOIN` - auto-join the configured voice channel on startup (`true`/`false`)
- `DISCORD_VOICE_AUTO_RESPOND` - optionally auto-transcribe/reply after a captured utterance (`true`/`false`)
- `FFMPEG_PATH` - optional path to an ffmpeg binary
- `WHISPER_BIN` - optional Whisper CLI / whisper.cpp binary path
- `WHISPER_MODEL` - Whisper model name for the CLI, default `tiny`
- `WHISPER_LANGUAGE` - Whisper language hint, default `en`
- `WHISPER_OUTPUT_DIR` - optional transcript output directory
- `DISCORD_VOICE_WELCOME_TEXT` - text the bot speaks after joining
- `DISCORD_COMMAND_PREFIX` - message command prefix, default `!`
- `OPENCLAW_BASE_URL` - OpenClaw endpoint
- `OPENCLAW_API_KEY` - OpenClaw auth key

## Phased build plan

1. Wire Discord voice join/leave and audio receive.
2. Add VAD to segment speech cleanly.
3. Replace STT stub with Whisper tiny/base.
4. Connect OpenClaw for reply generation.
5. Add lightweight TTS output.
6. Tighten latency, buffering, and recovery.
7. Add tests and deployment hardening.

## Notes

- The smoke test should stay cheap and fast.
- Keep the first implementation simple enough for 6 GB VRAM machines.
- Prefer clear failure modes over clever fallback chains.
