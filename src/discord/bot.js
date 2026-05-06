export function createDiscordBot({ config, logger, pipeline }) {
  return {
    isConfigured() {
      return Boolean(config.discordToken);
    },
    async start() {
      if (!config.discordToken) {
        logger.warn('Discord token not configured; bot start skipped');
        return;
      }

      logger.info('Discord bot scaffold initialized', {
        guildId: config.discordGuildId || null,
        pipelineReady: typeof pipeline.transcribe === 'function',
      });
    },
  };
}
