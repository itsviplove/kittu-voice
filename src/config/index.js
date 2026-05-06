export function loadConfig() {
  return {
    port: Number.parseInt(process.env.PORT || '8787', 10),
    logLevel: process.env.LOG_LEVEL || 'info',
    discordToken: process.env.DISCORD_TOKEN || '',
    discordGuildId: process.env.DISCORD_GUILD_ID || '',
    openClawBaseUrl: process.env.OPENCLAW_BASE_URL || '',
    openClawApiKey: process.env.OPENCLAW_API_KEY || '',
    discordVoiceChannelId: process.env.DISCORD_VOICE_CHANNEL_ID || '1493512967776637092',
    discordVoiceAutoJoin: process.env.DISCORD_VOICE_AUTO_JOIN !== 'false',
    discordVoiceAutoRespond: process.env.DISCORD_VOICE_AUTO_RESPOND === 'true',
    discordVoiceWelcomeText: process.env.DISCORD_VOICE_WELCOME_TEXT || 'Kittu Voice is online.',
    discordCommandPrefix: process.env.DISCORD_COMMAND_PREFIX || '!',
  };
}
