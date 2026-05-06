import { loadConfig } from './config/index.js';
import { createDiscordBot } from './discord/bot.js';
import { createOpenClawClient } from './openclaw/client.js';
import { createAudioPipeline } from './pipeline/audioPipeline.js';
import { createStatusServer } from './server/statusServer.js';

export function createApp({ logger }) {
  const config = loadConfig();
  const openClaw = createOpenClawClient({ config, logger });
  const pipeline = createAudioPipeline({ config, logger, openClaw });
  const discordBot = createDiscordBot({ config, logger, pipeline });
  const statusServer = createStatusServer({ config, logger, pipeline, discordBot, openClaw });

  return {
    config,
    async start() {
      logger.info('Starting Kittu Voice scaffold', {
        port: config.port,
        discordEnabled: discordBot.isConfigured(),
        openClawConfigured: openClaw.isConfigured(),
      });

      await discordBot.start();
      await statusServer.start();
    },
    async smokeTest() {
      const transcript = await pipeline.transcribe({ type: 'buffer', data: Buffer.from('test') });
      const reply = await pipeline.generateReply({ text: transcript.text, userId: 'smoke-user' });
      const audio = await pipeline.synthesize({ text: reply.text, voice: 'default' });

      return {
        transcript,
        reply,
        audio,
        discordConfigured: discordBot.isConfigured(),
        openClawConfigured: openClaw.isConfigured(),
      };
    },
  };
}
