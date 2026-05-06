import { createDiscordCommandRouter } from './commands.js';

export function createDiscordBot({ config, logger, pipeline }) {
  const router = createDiscordCommandRouter({ config, logger, pipeline });

  return {
    isConfigured() {
      return Boolean(config.discordToken);
    },
    router,
    async start() {
      if (!config.discordToken) {
        logger.warn('Discord token not configured; bot start skipped');
        return;
      }

      logger.info('Discord bot scaffold initialized', {
        guildId: config.discordGuildId || null,
        pipelineReady: typeof pipeline.transcribe === 'function',
        commands: router.commands,
      });
    },
    async simulateCommand(text, context = {}) {
      return router.handleTextMessage(text, context);
    },
  };
}
