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

This repo now includes:

- CLI entrypoint
- HTTP status server
- Config loader
- Discord command router scaffold (`/join`, `/leave`, `/say`, `/status`, `/help`)
- Discord slash command registration for `/join`, `/leave`, `/say`, `/status`, `/help`
- Discord voice join/playback path for the configured channel
- Discord voice receive/capture path that saves Opus chunks per speaking turn
- Optional auto-reply loop (`DISCORD_VOICE_AUTO_RESPOND=true`) that can transcribe, reply, and speak back
- OpenClaw reply routing with configurable session/http fallback order
- Fast local-first answers for simple voice prompts
- Spoken-reply compaction so long model text gets shortened for voice
- Less repetitive voice acknowledgements with cooldown support
- Smoke-test path

## Near-term plans

- Keep realtime replies under a short latency cap so the bot responds instead of stalling.
- Keep improving voice brevity, spoken naturalness, and interruption handling.
- Add better conversation summarization for long sessions.
- Add clearer runtime observability for slow/fallback turns.

## Intended stack

- Discord voice receive/send
- VAD for turn detection
- Whisper tiny/base for STT
- OpenClaw bridge for assistant logic
- Lightweight TTS first

## Limitations

- Real Discord voice capture/receive is scaffolded; STT uses the bundled Whisper.cpp model path resolution and falls back safely when decoding fails
- TTS is still basic and meant for testing, not production
- Conversation memory/history exists, but the runtime still needs more live validation and hardening
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
- `DISCORD` - supported alias for the Discord bot token
- `DISCORD_GUILD_ID` - optional guild scope
- `DISCORD_VOICE_CHANNEL_ID` - default voice channel target (`1493512967776637092`)
- `DISCORD_VOICE_AUTO_JOIN` - auto-join the configured voice channel on startup (`true`/`false`)
- `DISCORD_VOICE_AUTO_RESPOND` - auto-transcribe/reply after a captured utterance (`true`/`false`)
- `DISCORD_VOICE_RESPOND_TO_ALL` - default `true`; set `false` to require the wake phrase
- `DISCORD_VOICE_WAKE_PHRASE` - wake phrase for targeted replies, default `kittu`
- `DISCORD_VOICE_ACK_ENABLED` - speak a short acknowledgement before processing, default `true`
- `DISCORD_VOICE_ACK_TEXT` - acknowledgement phrase, or `|`-separated phrase list, default rotates short acknowledgements
- `DISCORD_VOICE_ACK_COOLDOWN_MS` - minimum time between spoken acknowledgements, default `12000`
- `DISCORD_TTS_VOICE` - Windows TTS voice name, default `Microsoft Zira Desktop`
- `DISCORD_VOICE_REPLY_MAX_CHARS` - target max spoken reply length, default `240`
- `DISCORD_VOICE_REPLY_MAX_SENTENCES` - target max spoken reply sentences, default `2`
- `DISCORD_VOICE_CONTEXT_LINES` - recent context lines to feed into reply generation, default `4`
- `DISCORD_VOICE_FAST_LOCAL_FIRST` - answer simple prompts locally before hitting OpenClaw, default `true`
- `OPENCLAW_BASE_URL` - Gateway HTTP URL, default auto-detected from local OpenClaw config
- `OPENCLAW_GATEWAY_TOKEN` - Gateway auth token
- `OPENCLAW_MODEL` - model/agent alias, default `openclaw/default`
- `OPENCLAW_AGENT_ID` - OpenClaw agent id, default `sam`
- `OPENCLAW_REQUEST_TIMEOUT_MS` - Gateway request timeout, default `30000`
- `OPENCLAW_REPLY_STRATEGY` - one of `session-first`, `http-first`, `session-only`, `http-only`
- `OPENCLAW_FAST_ANSWER_FIRST` - ask OpenClaw to lead with the direct short answer first, default `true`
- `OPENCLAW_TOOLS_PROFILE` - optional OpenClaw tool profile override
- `OPENCLAW_TOOLS_ALLOW` - optional comma-separated tool allowlist override
- `DISCORD_VOICE_MIN_TURN_MS` - ignore very short captured turns, default `400`
- `DISCORD_VOICE_END_SILENCE_MS` - silence window before ending a turn, default `900`
- `FFMPEG_PATH` - optional path to an ffmpeg binary
- `WHISPER_BIN` - optional Whisper CLI / whisper.cpp binary path
- `WHISPER_MODEL` - Whisper model name or model path; simple names like `base` resolve to the bundled whisper.cpp model
- `WHISPER_LANGUAGE` - Whisper language hint, default `en`
- `WHISPER_OUTPUT_DIR` - optional transcript output directory
- `.kittu-voice-history/` - local JSONL transcript history by guild/channel
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
