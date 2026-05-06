import { unlink } from 'node:fs/promises';

import { Client, Events, GatewayIntentBits, Partials, ApplicationCommandOptionType } from 'discord.js';
import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
} from '@discordjs/voice';

import { createDiscordCommandRouter } from './commands.js';

function isCommandText(text, prefix = '!') {
  const value = String(text || '').trim();
  return value.startsWith(prefix) || value.startsWith('/');
}

export function createDiscordBot({ config, logger, pipeline }) {
  const router = createDiscordCommandRouter({ config, logger, pipeline });
  const commandPrefix = config.discordCommandPrefix || '!';
  const autoJoinVoice = config.discordVoiceAutoJoin !== false;
  const welcomeText = config.discordVoiceWelcomeText || 'Kittu Voice is online.';

  let client = null;
  let audioPlayer = null;
  let voiceConnection = null;
  let startupGateResolve;
  const startupGate = new Promise((resolve) => {
    startupGateResolve = resolve;
  });

  function ensureAudioPlayer() {
    if (audioPlayer) return audioPlayer;

    audioPlayer = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Pause,
      },
    });

    audioPlayer.on(AudioPlayerStatus.Playing, () => {
      logger.info('Discord audio player started');
    });

    audioPlayer.on(AudioPlayerStatus.Idle, () => {
      logger.info('Discord audio player is idle');
    });

    audioPlayer.on('error', (error) => {
      logger.error('Discord audio player error', {
        message: error.message,
      });
    });

    return audioPlayer;
  }

  async function resolveTargetVoiceChannel() {
    if (!client?.isReady?.()) return null;
    if (!config.discordVoiceChannelId) return null;
    return client.channels.fetch(config.discordVoiceChannelId);
  }

  async function registerSlashCommands(readyClient) {
    const channel = await resolveTargetVoiceChannel();
    const guildId = config.discordGuildId || channel?.guildId || channel?.guild?.id;
    if (!guildId) {
      logger.warn('Cannot register slash commands; guild ID is unknown');
      return { ok: false, reason: 'guild-id-missing' };
    }

    const guild = await readyClient.guilds.fetch(guildId);
    const commands = [
      { name: 'join', description: 'Join the configured Kittu Voice channel' },
      { name: 'leave', description: 'Leave the Kittu Voice channel' },
      {
        name: 'say',
        description: 'Speak text in the configured voice channel',
        options: [
          {
            name: 'text',
            description: 'Text for Kittu to speak',
            type: ApplicationCommandOptionType.String,
            required: true,
          },
        ],
      },
      { name: 'status', description: 'Show Kittu Voice status' },
      { name: 'help', description: 'Show Kittu Voice commands' },
    ];

    await guild.commands.set(commands);
    logger.info('Registered Discord slash commands', {
      guildId,
      commands: commands.map((command) => command.name),
    });
    return { ok: true, guildId };
  }

  async function joinConfiguredVoiceChannel({ speakWelcome = false } = {}) {
    if (!client?.isReady?.()) {
      return { ok: false, reason: 'Discord client not ready yet' };
    }

    const channelId = config.discordVoiceChannelId;
    if (!channelId) {
      return { ok: false, reason: 'No voice channel ID configured' };
    }

    const channel = await resolveTargetVoiceChannel();
    if (!channel?.isVoiceBased?.()) {
      return { ok: false, reason: `Channel ${channelId} is not a voice channel` };
    }

    const guildId = channel.guildId || channel.guild?.id;
    if (!guildId || !channel.guild?.voiceAdapterCreator) {
      return { ok: false, reason: 'Voice adapter unavailable for channel' };
    }

    const existing = getVoiceConnection(guildId);
    if (existing) {
      existing.destroy();
    }

    ensureAudioPlayer();

    voiceConnection = joinVoiceChannel({
      channelId,
      guildId,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false,
    });
    voiceConnection.subscribe(audioPlayer);

    await entersState(voiceConnection, VoiceConnectionStatus.Ready, 20_000);

    logger.info('Joined Discord voice channel', {
      channelId,
      guildId,
      channelName: channel.name || null,
    });

    if (speakWelcome) {
      await speakInVoice(welcomeText, 'welcome');
    }

    return { ok: true, channelId, guildId, channelName: channel.name || null };
  }

  async function leaveVoiceChannel() {
    if (voiceConnection) {
      voiceConnection.destroy();
      voiceConnection = null;
      return { ok: true, message: 'Disconnected from voice channel.' };
    }

    return { ok: true, message: 'No active voice connection.' };
  }

  async function speakInVoice(text, voice = 'default') {
    if (!text) {
      return { ok: false, reason: 'No text to speak' };
    }

    const audio = await pipeline.synthesize({ text, voice });
    if (!audio?.path) {
      return { ok: false, reason: 'Synthesizer did not return a file path' };
    }

    const joined = await joinConfiguredVoiceChannel();
    if (!joined.ok || !voiceConnection) {
      try {
        await unlink(audio.path);
      } catch {
        // ignore cleanup errors
      }

      return {
        ok: true,
        audio,
        playbackSkipped: true,
        reason: joined.reason || 'Voice connection not available yet',
      };
    }

    ensureAudioPlayer();

    const resource = createAudioResource(audio.path, {
      inputType: StreamType.Arbitrary,
      metadata: {
        text,
        voice,
        engine: audio.engine,
      },
    });

    const playbackDone = new Promise((resolve, reject) => {
      const cleanup = async () => {
        try {
          await unlink(audio.path);
        } catch {
          // ignore cleanup errors
        }
      };

      audioPlayer.once(AudioPlayerStatus.Idle, async () => {
        await cleanup();
        resolve({ ok: true, audio });
      });
      audioPlayer.once('error', async (error) => {
        await cleanup();
        reject(error);
      });
    });

    audioPlayer.play(resource);
    return playbackDone;
  }

  async function handleTextCommand(text, context = {}) {
    const result = await router.handleTextMessage(text, context);

    if (!result.ok) {
      return result;
    }

    if (result.command === 'join') {
      const joined = await joinConfiguredVoiceChannel({ speakWelcome: false });
      return {
        ...result,
        joined,
        message: joined.ok
          ? `Joined voice channel ${joined.channelName || joined.channelId}.`
          : `Could not join voice channel: ${joined.reason}`,
      };
    }

    if (result.command === 'leave') {
      const left = await leaveVoiceChannel();
      return {
        ...result,
        left,
        message: left.message || 'Left voice channel.',
      };
    }

    if (result.command === 'say') {
      const spoken = result.spoken || text.replace(/^\/(say|!say)\s*/i, '').trim();
      const playback = await speakInVoice(spoken, context.voice || 'default');
      return {
        ...result,
        playback,
        message: playback.playbackSkipped
          ? `Generated audio, but playback was skipped: ${playback.reason}`
          : `Spoke in voice channel: ${spoken}`,
      };
    }

    return result;
  }

  function buildClient() {
    if (client) return client;

    client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
      ],
      partials: [Partials.Channel],
    });

    client.once(Events.ClientReady, async (readyClient) => {
      logger.info('Discord bot ready', {
        user: readyClient.user?.tag || null,
        guildId: config.discordGuildId || null,
        voiceChannelId: config.discordVoiceChannelId || null,
        commands: router.commands,
      });

      try {
        await registerSlashCommands(readyClient);
      } catch (error) {
        logger.error('Discord slash command registration failed', {
          message: error.message,
        });
      }

      try {
        if (autoJoinVoice && config.discordVoiceChannelId) {
          await joinConfiguredVoiceChannel({ speakWelcome: true });
        }
      } catch (error) {
        logger.error('Auto-join voice channel failed', {
          message: error.message,
        });
      } finally {
        startupGateResolve?.();
      }
    });

    client.on(Events.InteractionCreate, async (interaction) => {
      try {
        if (!interaction.isChatInputCommand()) return;

        await interaction.deferReply({ ephemeral: true });
        let text = `/${interaction.commandName}`;
        if (interaction.commandName === 'say') {
          text = `/say ${interaction.options.getString('text', true)}`;
        }

        const result = await handleTextCommand(text, { voice: 'default' });
        await interaction.editReply(result.message || 'Done.');
      } catch (error) {
        logger.error('Discord slash command failed', {
          message: error.message,
        });
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply('Kittu Voice command failed. Check bot logs.');
          } else {
            await interaction.reply({ content: 'Kittu Voice command failed. Check bot logs.', ephemeral: true });
          }
        } catch {
          // ignore response failures
        }
      }
    });

    client.on(Events.MessageCreate, async (message) => {
      try {
        if (message.author?.bot || !message.guild) return;
        const content = String(message.content || '').trim();
        if (!isCommandText(content, commandPrefix)) return;

        const result = await handleTextCommand(content, { voice: 'default' });
        const response = result.message || 'Done.';
        await message.reply(response);
      } catch (error) {
        logger.error('Discord message command failed', {
          message: error.message,
        });
      }
    });

    return client;
  }

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

      buildClient();
      logger.info('Logging into Discord bot', {
        guildId: config.discordGuildId || null,
        voiceChannelId: config.discordVoiceChannelId || null,
        commands: router.commands,
      });
      await client.login(config.discordToken);
      await startupGate;
    },
    async stop() {
      if (voiceConnection) {
        voiceConnection.destroy();
        voiceConnection = null;
      }
      if (client) {
        await client.destroy();
        client = null;
      }
    },
    async simulateCommand(text, context = {}) {
      return handleTextCommand(text, context);
    },
    async joinVoiceChannel() {
      return joinConfiguredVoiceChannel({ speakWelcome: false });
    },
    async speak(text, voice = 'default') {
      return speakInVoice(text, voice);
    },
    async leaveVoiceChannel() {
      return leaveVoiceChannel();
    },
    getStatus() {
      return {
        configured: Boolean(config.discordToken),
        voiceChannelId: config.discordVoiceChannelId || null,
        connected: Boolean(voiceConnection),
        commands: router.commands,
      };
    },
  };
}
