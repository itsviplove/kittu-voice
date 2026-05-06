# Discord Implementation Guide

## Phase 1
- Create Discord bot account
- Add token to `.env`
- Set default voice channel to `1493512967776637092`
- Connect to one voice channel
- Add `/join` and `/leave`
- Add `/say` test command
- Add `/status` and `/help`
- Validate command router without live voice first

## Phase 2
- Capture user voice audio
- Add silence/VAD turn detection
- Transcribe with Whisper tiny/base
- Send transcript to OpenClaw
- Speak reply back into Discord

## Phase 3
- Add per-channel memory
- Add configurable wake/response rules
- Add logs and transcript history
- Add fallback TTS engines

## Test checklist
1. Run `npm test`
2. Run `npm run smoke`
3. Start the server with `npm start`
4. Verify `http://127.0.0.1:8787`
5. Inspect smoke output for `commandStatus` and `commandSay`
6. Later, test `/join`, `/say`, and live voice capture in Discord using channel `1493512967776637092`
