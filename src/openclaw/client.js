export function createOpenClawClient({ config, logger }) {
  return {
    isConfigured() {
      return Boolean(config.openClawBaseUrl);
    },
    async generateResponse({ text, userId, history = [], summary = null }) {
      if (!config.openClawBaseUrl) {
        logger.debug('OpenClaw base URL missing; using local fallback response');
        return {
          text: history.length
            ? `Local fallback reply for ${userId}: ${text} (context turns: ${history.length})`
            : `Local fallback reply for ${userId}: ${text}`,
          source: 'local-fallback',
        };
      }

      logger.info('OpenClaw client scaffold would call remote endpoint here', {
        baseUrl: config.openClawBaseUrl,
      });

      return {
        text: `Stubbed OpenClaw reply to: ${text}`,
        source: 'openclaw-stub',
      };
    },
  };
}
