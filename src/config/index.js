function firstEnv(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (value) return value;
  }
  return '';
}

export function loadConfig() {
  return {
    port: Number.parseInt(process.env.PORT || '8787', 10),
    logLevel: process.env.LOG_LEVEL || 'info',
    discordToken: firstEnv('DISCORD_TOKEN', 'DISCORD', 'discord'),
    discordGuildId: process.env.DISCORD_GUILD_ID || '',
    openClawBaseUrl: process.env.OPENCLAW_BASE_URL || process.env.OPENCLAW_GATEWAY_URL || process.env.OPENCLAW_GATEWAY_HTTP_URL || '',
    openClawApiKey: process.env.OPENCLAW_API_KEY || process.env.OPENCLAW_GATEWAY_TOKEN || '',
    openClawModel: process.env.OPENCLAW_MODEL || process.env.OPENCLAW_AGENT_MODEL || 'openclaw/default',
    openClawAgentId: process.env.OPENCLAW_AGENT_ID || 'sam',
    openClawRequestTimeoutMs: Number.parseInt(process.env.OPENCLAW_REQUEST_TIMEOUT_MS || '30000', 10),
    openClawSessionTimeoutMs: Number.parseInt(process.env.OPENCLAW_SESSION_TIMEOUT_MS || '8000', 10),
    openClawVoiceTimeoutMs: Number.parseInt(process.env.OPENCLAW_VOICE_TIMEOUT_MS || '5000', 10),
    openClawReplyStrategy: process.env.OPENCLAW_REPLY_STRATEGY || 'session-first',
    openClawFastAnswerFirst: process.env.OPENCLAW_FAST_ANSWER_FIRST !== 'false',
    openClawToolsProfile: process.env.OPENCLAW_TOOLS_PROFILE || '',
    openClawToolsAllow: process.env.OPENCLAW_TOOLS_ALLOW || '',
    discordVoiceChannelId: process.env.DISCORD_VOICE_CHANNEL_ID || '1493512967776637092',
    discordVoiceAutoJoin: process.env.DISCORD_VOICE_AUTO_JOIN !== 'false',
    discordVoiceAutoRespond: process.env.DISCORD_VOICE_AUTO_RESPOND === 'true',
    discordVoiceRespondToAll: process.env.DISCORD_VOICE_RESPOND_TO_ALL !== 'false',
    discordVoiceWakePhrase: process.env.DISCORD_VOICE_WAKE_PHRASE || 'kittu',
    discordVoiceAckEnabled: process.env.DISCORD_VOICE_ACK_ENABLED !== 'false',
    discordVoiceAckText: process.env.DISCORD_VOICE_ACK_TEXT || 'Hmm...',
    discordVoiceAckCooldownMs: Number.parseInt(process.env.DISCORD_VOICE_ACK_COOLDOWN_MS || '12000', 10),
    discordTtsVoice: process.env.DISCORD_TTS_VOICE || process.env.TTS_VOICE || 'Microsoft Zira Desktop',
    discordVoiceMinTurnMs: Number.parseInt(process.env.DISCORD_VOICE_MIN_TURN_MS || '400', 10),
    discordVoiceEndSilenceMs: Number.parseInt(process.env.DISCORD_VOICE_END_SILENCE_MS || '900', 10),
    discordVoiceReplyMaxChars: Number.parseInt(process.env.DISCORD_VOICE_REPLY_MAX_CHARS || '240', 10),
    discordVoiceReplyMaxSentences: Number.parseInt(process.env.DISCORD_VOICE_REPLY_MAX_SENTENCES || '2', 10),
    discordVoiceContextLines: Number.parseInt(process.env.DISCORD_VOICE_CONTEXT_LINES || '4', 10),
    discordVoiceFastLocalFirst: process.env.DISCORD_VOICE_FAST_LOCAL_FIRST !== 'false',
    discordVoiceWelcomeText: process.env.DISCORD_VOICE_WELCOME_TEXT || 'Kittu Voice is online.',
    discordCommandPrefix: process.env.DISCORD_COMMAND_PREFIX || '!',
  };
}
