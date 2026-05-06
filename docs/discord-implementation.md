# Discord Implementation Guide

## Phase 1
- Create Discord bot account
- Add token to `.env`
- Set default voice channel to `1493512967776637092`
- Enable `Message Content` and voice intents in the Discord app settings
- Connect to one voice channel
- Add `/join` and `/leave`
- Add `/say` test command
- Add `/status` and `/help`
- Validate command router without live voice first

## Phase 2
- Capture user voice audio and save Opus chunks per speaking turn
- Add silence/VAD turn detection (current capture end behavior is silence-based)
- Transcribe with the bundled Whisper.cpp base model by default; override with `WHISPER_BIN` / `WHISPER_MODEL` if needed (fallback stays safe when decode fails)
- Send transcript to OpenClaw
- Speak reply back into Discord
- Optional end-to-end voice loop via `DISCORD_VOICE_AUTO_RESPOND=true`
- Keep the voice bridge focused on the configured channel `1493512967776637092`

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
6. Set `DISCORD_TOKEN`, `DISCORD_VOICE_CHANNEL_ID=1493512967776637092`, and `DISCORD_VOICE_AUTO_JOIN=true`
7. Start the bot and confirm it joins `general` and speaks the welcome text
8. Prefer slash commands: send `/say text: hello` in Discord and confirm playback
9. If using prefix commands, send `!say hello`; this requires Message Content Intent
