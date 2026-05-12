import { setTimeout as delay } from 'node:timers/promises';
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
import { createVoiceCaptureManager } from '../pipeline/voiceCapture.js';

const NON_SPEECH_PATTERNS = [
  /^\[(?:BLANK_AUDIO|MUSIC|MUSICAL|APPLAUSE|GUNSHOT|GUNSHOTS)\]$/i,
  /^\((?:fire crackling)\)$/i,
  /^transcribed placeholder speech$/i,
];

function isCommandText(text, prefix = '!') {
  const value = String(text || '').trim();
  return value.startsWith(prefix) || value.startsWith('/');
}

export function canReuseVoiceConnection(existing, targetChannelId) {
  const existingChannelId = existing?.joinConfig?.channelId || null;
  const status = existing?.state?.status || null;
  if (!existing || !existingChannelId || existingChannelId !== targetChannelId) return false;
  return status !== VoiceConnectionStatus.Destroyed && status !== VoiceConnectionStatus.Disconnected;
}

export function createDiscordBot({ config, logger, pipeline, conversationMemory }) {
  const router = createDiscordCommandRouter({ config, logger, pipeline });
  const voiceCapture = createVoiceCaptureManager({
    logger,
    onSpeechStart: async () => {
      if (audioPlayer && audioPlayer.state?.status === AudioPlayerStatus.Playing) {
        audioPlayer.stop(true);
        logger.info('Interrupted assistant speech due to new user speech');
      }
    },
    onCapture: async (capture) => {
      if (!config.discordVoiceAutoRespond) return;
      try {
        const transcript = await pipeline.transcribeCapture(capture);
        const scope = {
          guildId: capture.guildId || config.discordGuildId || 'global',
          channelId: capture.channelId || config.discordVoiceChannelId || 'default',
        };
        const turn = {
          guildId: scope.guildId,
          channelId: scope.channelId,
          userId: capture.userId,
          speaker: 'user',
          text: transcript.text,
          transcript,
          capturePath: capture.filePath,
          meta: { reason: capture.reason, durationMs: capture.durationMs },
        };

        const recentTurns = await conversationMemory.readRecent(scope, 8);
        const summary = await conversationMemory.buildSummary(scope, 8);
        const userSummary = await conversationMemory.buildUserSummary(scope, capture.userId, 8);
        const shouldReply = shouldRespondToTranscript(transcript.text);
        const addressedText = normalizeAddressedTranscript(transcript.text);
        const ignoredTranscript = shouldIgnoreTranscript(transcript.text);

        await conversationMemory.appendTurn(turn);

        if (ignoredTranscript) {
          logger.info('Ignored non-speech voice transcript', {
            userId: capture.userId,
            transcript: transcript.text,
          });
          return;
        }

        if (!shouldReply) {
          logger.info('Captured voice turn stored without reply', {
            userId: capture.userId,
            transcript: transcript.text,
          });
          return;
        }

        const ackText = ackEnabled ? chooseAckText() : '';
        if (ackText) {
          await speakInVoice(ackText, 'thinking');
        }

        const reply = await pipeline.generateReply({ text: addressedText, userId: capture.userId, history: recentTurns, summary, userSummary, scope });
        const spokenReply = reply?.spokenText || reply?.text || '';
        if (spokenReply) {
          await speakInVoice(spokenReply, 'default');
        }
        await conversationMemory.appendTurn({
          guildId: scope.guildId,
          channelId: scope.channelId,
          userId: 'kittu',
          speaker: 'assistant',
          text: spokenReply,
          reply,
          meta: { source: reply?.source || null },
        });
        logger.info('Processed Discord voice capture', {
          userId: capture.userId,
          transcript: transcript.text,
          reply: spokenReply || null,
          summaryTurns: summary.totalTurns,
        });
      } catch (error) {
        logger.error('Discord voice capture processing failed', {
          userId: capture.userId,
          message: error.message,
        });
      }
    },
  });
  const commandPrefix = config.discordCommandPrefix || '!';
  const autoJoinVoice = config.discordVoiceAutoJoin !== false;
  const welcomeText = config.discordVoiceWelcomeText || 'Kittu Voice is online.';
  const wakePhrase = String(config.discordVoiceWakePhrase || 'kittu').toLowerCase();
  const ackEnabled = config.discordVoiceAckEnabled !== false;
  const ackCooldownMs = Number.parseInt(String(config.discordVoiceAckCooldownMs || '12000'), 10) || 12000;
  const ackPhrases = String(config.discordVoiceAckText || '').includes('|')
    ? String(config.discordVoiceAckText).split('|').map((entry) => entry.trim()).filter(Boolean)
    : [config.discordVoiceAckText || 'Hmm...', 'One sec.', 'Got it.'];
  const respondToAll = config.discordVoiceRespondToAll === true;

  let client = null;
  let audioPlayer = null;
  let voiceConnection = null;
  let voiceStateHandler = null;
  let reconnectPromise = null;
  let ackCursor = 0;
  let lastAckAt = 0;
  let startupGateResolve;
  const startupGate = new Promise((resolve) => {
    startupGateResolve = resolve;
  });

  function chooseAckText() {
    if (!ackPhrases.length) return '';
    const now = Date.now();
    if (now - lastAckAt < ackCooldownMs) return '';
    const ack = ackPhrases[ackCursor % ackPhrases.length] || '';
    ackCursor += 1;
    lastAckAt = now;
    return ack;
  }

  function ensureAudioPlayer() {
    if (audioPlayer) return audioPlayer;

    audioPlayer = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Play,
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
      if (!canReuseVoiceConnection(existing, channelId)) {
        existing.destroy();
      } else {
        voiceConnection = existing;
        return { ok: true, channelId, guildId, channelName: channel.name || null, reused: true };
      }
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

    if (voiceStateHandler) {
      voiceConnection.off?.('stateChange', voiceStateHandler);
    }
    voiceStateHandler = async (oldState, newState) => {
      if (newState.status === VoiceConnectionStatus.Disconnected || newState.status === VoiceConnectionStatus.Destroyed) {
        logger.warn('Discord voice connection dropped', {
          oldStatus: oldState?.status || null,
          newStatus: newState?.status || null,
        });
        if (newState.status === VoiceConnectionStatus.Destroyed) {
          voiceConnection = null;
          return;
        }
        if (autoJoinVoice) {
          reconnectPromise ??= (async () => {
            try {
              await delay(1500);
              voiceConnection = null;
              await joinConfiguredVoiceChannel({ speakWelcome: false });
            } catch (error) {
              logger.error('Voice reconnect failed', { message: error.message });
            } finally {
              reconnectPromise = null;
            }
          })();
        }
      }
    };
    voiceConnection.on('stateChange', voiceStateHandler);

    await entersState(voiceConnection, VoiceConnectionStatus.Ready, 20_000);
    await voiceCapture.start(voiceConnection, {
      minDurationMs: config.discordVoiceMinTurnMs,
      endSilenceMs: config.discordVoiceEndSilenceMs,
    });

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

  function shouldIgnoreTranscript(text) {
    const normalized = String(text || '').trim();
    if (!normalized) return true;
    return NON_SPEECH_PATTERNS.some((pattern) => pattern.test(normalized));
  }

  function looksAddressedToKittu(text) {
    const normalized = String(text || '').toLowerCase().trim();
    if (!normalized) return false;
    if (normalized.includes(wakePhrase)) return true;
    if (/^<@!?\d+>/.test(normalized)) return true;
    // Whisper often hears "Kittu" as "K2", "key two", "kitty", or "Ito".
    if (/^(@?kittu|kitty|kito|k2|key\s*two|ito)\b/i.test(normalized)) return true;
    return false;
  }

  function isLikelyQuestionOrRequest(text) {
    const normalized = String(text || '').toLowerCase().trim();
    if (!normalized) return false;
    if (normalized.endsWith('?')) return true;
    if (/\b(what time is it|time now|tell me the time|how are you)\b/i.test(normalized)) return true;
    if (/^(what|why|when|where|who|whose|which|how|can|could|would|will|should|do|does|did|is|are|am|was|were|tell|explain|search|find|open|make|create|play|stop|start)\b/i.test(normalized)) return true;
    return false;
  }

  function shouldRespondToTranscript(text) {
    if (shouldIgnoreTranscript(text)) return false;
    if (respondToAll) return true;
    return looksAddressedToKittu(text) || isLikelyQuestionOrRequest(text);
  }

  function normalizeAddressedTranscript(text) {
    let normalized = String(text || '').trim();
    if (!normalized) return normalized;

    const wakePattern = new RegExp(`^(${escapeRegex(wakePhrase)}|<@!?\\d+>|@?kittu|kitty|kito|k2|key\\s*two|ito)[,\\s:.-]*`, 'i');
    normalized = normalized.replace(wakePattern, '').trim();
    if (normalized.toLowerCase().startsWith('hey ' + wakePhrase)) {
      normalized = normalized.slice(('hey ' + wakePhrase).length).trim();
    }
    return normalized || String(text || '').trim();
  }

  function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  async function leaveVoiceChannel() {
    if (voiceConnection) {
      await voiceCapture.stop();
      if (voiceStateHandler) {
        voiceConnection.off?.('stateChange', voiceStateHandler);
        voiceStateHandler = null;
      }
      voiceConnection.destroy();
      voiceConnection = null;
      reconnectPromise = null;
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
      let finished = false;
      let timeoutId = null;

      const cleanup = async () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        try {
          await unlink(audio.path);
        } catch {
          // ignore cleanup errors
        }
      };

      const finish = async (result) => {
        if (finished) return;
        finished = true;
        audioPlayer.off(AudioPlayerStatus.Idle, onIdle);
        audioPlayer.off('error', onError);
        await cleanup();
        resolve(result);
      };
      const onIdle = async () => {
        await finish({ ok: true, audio });
      };
      const onError = async (error) => {
        if (finished) return;
        finished = true;
        audioPlayer.off(AudioPlayerStatus.Idle, onIdle);
        await cleanup();
        reject(error);
      };

      audioPlayer.once(AudioPlayerStatus.Idle, onIdle);
      audioPlayer.once('error', onError);

      timeoutId = setTimeout(() => {
        if (audioPlayer.state?.status !== AudioPlayerStatus.Idle) {
          audioPlayer.stop(true);
          void finish({ ok: true, audio, timedOut: true });
        }
      }, 12_000);
    });

    if (audioPlayer.state?.status === AudioPlayerStatus.Playing) {
      audioPlayer.stop(true);
    }
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

        let text = `/${interaction.commandName}`;
        if (interaction.commandName === 'say') {
          const spokenText = interaction.options.getString('text', true);
          await interaction.reply({ content: `Speaking: ${spokenText}`, ephemeral: true });
          void handleTextCommand(`/say ${spokenText}`, { voice: 'default' }).catch((error) => {
            logger.error('Discord async say command failed', { message: error.message });
          });
          return;
        }

        await interaction.deferReply({ ephemeral: true });
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
      await voiceCapture.stop();
      if (voiceConnection) {
        if (voiceStateHandler) {
          voiceConnection.off?.('stateChange', voiceStateHandler);
          voiceStateHandler = null;
        }
        voiceConnection.destroy();
        voiceConnection = null;
      }
      reconnectPromise = null;
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
        voiceCapture: voiceCapture.getStatus(),
        conversationMemory: conversationMemory.memoryRoot,
        conversationSummary: 'available per channel',
        wakePhrase,
        respondToAll,
        commands: router.commands,
      };
    },
  };
}
