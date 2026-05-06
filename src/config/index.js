export function loadConfig() {
  return {
    port: Number.parseInt(process.env.PORT || '8787', 10),
    logLevel: process.env.LOG_LEVEL || 'info',
    discordToken: process.env.DISCORD_TOKEN || '',
    discordGuildId: process.env.DISCORD_GUILD_ID || '',
    openClawBaseUrl: process.env.OPENCLAW_BASE_URL || '',
    openClawApiKey: process.env.OPENCLAW_API_KEY || '',
  };
}
