const DEFAULT_COMMANDS = ['join', 'leave', 'say', 'status', 'help'];

export function createDiscordCommandRouter({ config, logger, pipeline }) {
  function buildStatus() {
    return {
      botConfigured: Boolean(config.discordToken),
      guildId: config.discordGuildId || null,
      voiceChannelId: config.discordVoiceChannelId || null,
      voiceAutoJoin: config.discordVoiceAutoJoin !== false,
      commandPrefix: config.discordCommandPrefix || '!',
      openClawConfigured: Boolean(config.openClawBaseUrl),
      commands: DEFAULT_COMMANDS,
      voiceMode: 'conversational-voice-agent',
    };
  }

  async function handleTextMessage(text, context = {}) {
    const raw = String(text || '').trim();
    if (!raw) {
      return { ok: false, message: 'Empty command.' };
    }

    const [nameToken, ...rest] = raw.replace(/^\//, '').split(/\s+/);
    const command = nameToken.toLowerCase();
    const argText = rest.join(' ').trim();

    switch (command) {
      case 'join':
        return {
          ok: true,
          command,
          message: 'Discord voice join is scaffolded. Next step: wire the voice SDK and channel target.',
        };
      case 'leave':
        return {
          ok: true,
          command,
          message: 'Discord voice leave is scaffolded. No live connection is active yet.',
        };
      case 'say': {
        const spoken = argText || 'hello from Kittu Voice';
        const audio = await pipeline.synthesize({ text: spoken, voice: context.voice || 'default' });
        return {
          ok: true,
          command,
          spoken,
          audio,
          message: `Prepared voice reply for: ${spoken}`,
        };
      }
      case 'status':
        return {
          ok: true,
          command,
          status: buildStatus(),
          message: 'Kittu Voice scaffold status is ready.',
        };
      case 'help':
        return {
          ok: true,
          command,
          message: `Commands: ${DEFAULT_COMMANDS.map((c) => `/${c}`).join(', ')}`,
        };
      default:
        logger?.warn?.('Unknown Discord command received in scaffold', { command, raw });
        return {
          ok: false,
          command,
          message: `Unknown command: /${command}`,
        };
    }
  }

  return {
    commands: DEFAULT_COMMANDS,
    buildStatus,
    handleTextMessage,
  };
}
