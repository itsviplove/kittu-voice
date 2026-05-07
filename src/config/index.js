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
    openClawBaseUrl: process.env.OPENCLAW_BASE_URL || '',
    openClawApiKey: process.env.OPENCLAW_API_KEY || '',
    discordVoiceChannelId: process.env.DISCORD_VOICE_CHANNEL_ID || '1493512967776637092',
    discordVoiceAutoJoin: process.env.DISCORD_VOICE_AUTO_JOIN !== 'false',
    discordVoiceAutoRespond: process.env.DISCORD_VOICE_AUTO_RESPOND === 'true',
    discordVoiceRespondToAll: process.env.DISCORD_VOICE_RESPOND_TO_ALL !== 'false',
    discordVoiceWakePhrase: process.env.DISCORD_VOICE_WAKE_PHRASE || 'kittu',
    discordVoiceAckEnabled: process.env.DISCORD_VOICE_ACK_ENABLED !== 'false',
    discordVoiceAckText: process.env.DISCORD_VOICE_ACK_TEXT || 'Hmm...',
    discordTtsVoice: process.env.DISCORD_TTS_VOICE || process.env.TTS_VOICE || 'Microsoft Zira Desktop',
    discordVoiceMinTurnMs: Number.parseInt(process.env.DISCORD_VOICE_MIN_TURN_MS || '400', 10),
    discordVoiceEndSilenceMs: Number.parseInt(process.env.DISCORD_VOICE_END_SILENCE_MS || '900', 10),
    discordVoiceWelcomeText: process.env.DISCORD_VOICE_WELCOME_TEXT || 'Kittu Voice is online.',
    discordCommandPrefix: process.env.DISCORD_COMMAND_PREFIX || '!',
  };
}
