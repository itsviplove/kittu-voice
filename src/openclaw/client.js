import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function cleanText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function compactText(text, maxLength = 220) {
  const value = cleanText(text);
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function stripMarkdownish(text = '') {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/[_*~>#-]+/g, ' ')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitSentences(text = '') {
  return cleanText(text)
    .split(/(?<=[.!?])\s+/)
    .map((part) => cleanText(part))
    .filter(Boolean);
}

function limitSentences(text = '', maxSentences = 2) {
  const sentences = splitSentences(text);
  if (!sentences.length) return cleanText(text);
  return sentences.slice(0, Math.max(1, maxSentences)).join(' ');
}

export function formatReplyForVoice(text, config = {}) {
  const maxChars = Number.parseInt(String(config.discordVoiceReplyMaxChars || '240'), 10) || 240;
  const maxSentences = Number.parseInt(String(config.discordVoiceReplyMaxSentences || '2'), 10) || 2;
  const cleaned = stripMarkdownish(text);
  const sentenceLimited = limitSentences(cleaned, maxSentences);
  const compacted = compactText(sentenceLimited, maxChars);
  return compacted || "I didn't catch that.";
}

function getContextWindow(config = {}) {
  return Math.max(1, Number.parseInt(String(config.discordVoiceContextLines || '4'), 10) || 4);
}

function normalizeReplyStrategy(value = '') {
  const normalized = cleanText(value).toLowerCase();
  switch (normalized) {
    case 'auto':
    case 'session-first':
    case 'http-first':
    case 'session-only':
    case 'http-only':
      return normalized || 'session-first';
    default:
      return 'session-first';
  }
}

export function buildReplyRoutePlan(config = {}) {
  const strategy = normalizeReplyStrategy(config.openClawReplyStrategy || 'session-first');
  switch (strategy) {
    case 'http-first':
      return ['http', 'session', 'local'];
    case 'session-only':
      return ['session', 'local'];
    case 'http-only':
      return ['http', 'local'];
    case 'auto':
    case 'session-first':
    default:
      return ['session', 'http', 'local'];
  }
}

function parseCsvList(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function extractKeywords(text) {
  return cleanText(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 3 && !['what', 'when', 'where', 'which', 'would', 'could', 'should', 'about', 'please', 'kittu'].includes(word))
    .slice(0, 4);
}

function buildLocalReply({ text, userId, history = [] }) {
  const normalized = cleanText(text);
  const lowered = normalized.toLowerCase();
  const now = new Date();

  if (!normalized) return "I didn't catch that.";
  if (/(what('?s| is) the time|what time is it|time now|tell me the time)/i.test(lowered)) return `It's ${now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`;
  if (/(what('?s| is) the date|today('?s)? date|which day is it|what day is it)/i.test(lowered)) return `Today is ${now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}.`;
  if (/\bhow are you\b/i.test(lowered)) return 'I am good. Listening and ready.';
  if (/^(hello|hi|hey|yo)\b/i.test(lowered)) return 'Hey, I am here.';
  if (/\bthank(s| you)\b/i.test(lowered)) return 'Anytime.';
  if (/\b(who are you|what are you)\b/i.test(lowered)) return 'I am Kittu Voice, your Discord voice assistant for OpenClaw.';
  if (/\bwhat can you do\b/i.test(lowered)) return 'I can listen in voice, answer simple questions, speak replies, and run slash commands like say, join, leave, and status.';
  if (/\b(joke|funny)\b/i.test(lowered)) return 'Why did the bot join voice chat? Because typing was too quiet.';
  if (/\b(weather|rain|temperature)\b/i.test(lowered)) return 'I cannot check live weather from this voice mode yet, but that can be wired into OpenClaw next.';
  if (/\b(openclaw|open claw)\b/i.test(lowered)) return 'OpenClaw is the local agent system I connect to. This voice project is the Discord voice layer for it.';
  if (/^(tell|explain|describe)\b/i.test(lowered)) {
    const keywords = extractKeywords(normalized);
    if (keywords.length) {
      return `I can give a short answer about ${keywords.join(', ')}, but deeper knowledge needs the OpenClaw brain wired in next.`;
    }
  }
  if (/^(can|could|would|will|should|do|does|did|is|are|am|was|were|what|why|when|where|who|which|how)\b/i.test(lowered)) {
    return 'I heard the question, but my full reasoning brain is not connected yet. The next step is wiring this voice bot to OpenClaw for real answers.';
  }
  if (history.length) return `I heard you say: ${normalized}.`;
  return `I heard: ${normalized}.`;
}

function buildFastLocalReply(text = '') {
  const normalized = cleanText(text);
  const lowered = normalized.toLowerCase();
  if (!normalized) return '';

  if (/^(hello|hi|hey|yo)\b/i.test(lowered)) return 'Hey, I am here.';
  if (/(what('?s| is) the time|what time is it|time now|tell me the time)/i.test(lowered)) {
    return `It's ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`;
  }
  if (/(what('?s| is) the date|today('?s)? date|which day is it|what day is it)/i.test(lowered)) {
    return `Today is ${new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}.`;
  }
  if (/\bhow are you\b/i.test(lowered)) return 'I am good. Listening and ready.';
  if (/\b(who are you|what are you)\b/i.test(lowered)) return 'I am Kittu Voice, your Discord voice assistant for OpenClaw.';
  if (/\bwhat can you do\b/i.test(lowered)) return 'I can listen in voice, answer short questions, speak replies, and run join, leave, say, and status commands.';
  if (/\bthank(s| you)\b/i.test(lowered)) return 'Anytime.';

  return '';
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function readLocalGatewayConfig() {
  const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
  try {
    const raw = readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    const gateway = parsed?.gateway || {};
    const baseUrl = gateway.baseUrl || gateway.url || '';
    const port = gateway.port || gateway.http?.port || gateway.api?.port || '';
    const token = gateway.auth?.token || gateway.token || '';
    return { configPath, baseUrl: baseUrl ? String(baseUrl).replace(/\/$/, '') : '', port: port ? Number(port) : 0, token: token || '' };
  } catch {
    return { configPath, baseUrl: '', port: 0, token: '' };
  }
}

function resolveGatewaySettings(config = {}) {
  const localConfig = readLocalGatewayConfig();
  const baseUrl = firstNonEmpty(
    config.openClawBaseUrl,
    process.env.OPENCLAW_BASE_URL,
    process.env.OPENCLAW_GATEWAY_URL,
    process.env.OPENCLAW_GATEWAY_HTTP_URL,
    localConfig.baseUrl,
    localConfig.port ? `http://127.0.0.1:${localConfig.port}` : '',
    'http://127.0.0.1:27277',
    'http://127.0.0.1:18789',
  );

  const token = firstNonEmpty(
    config.openClawApiKey,
    process.env.OPENCLAW_API_KEY,
    process.env.OPENCLAW_GATEWAY_TOKEN,
    localConfig.token,
  );

  return {
    baseUrl,
    token,
    model: firstNonEmpty(config.openClawModel, process.env.OPENCLAW_MODEL, process.env.OPENCLAW_AGENT_MODEL, 'openclaw/default'),
    agentId: firstNonEmpty(config.openClawAgentId, process.env.OPENCLAW_AGENT_ID, 'sam'),
    requestTimeoutMs: Number.parseInt(firstNonEmpty(String(config.openClawRequestTimeoutMs || ''), process.env.OPENCLAW_REQUEST_TIMEOUT_MS, '30000'), 10) || 30000,
    localConfig,
  };
}

function buildPrompt({ text, userId, history = [], summary = null, userSummary = null, scope = null, config = {} }) {
  const contextWindow = getContextWindow(config);
  const contextLines = [];
  if (scope?.guildId) contextLines.push(`Discord guild: ${scope.guildId}`);
  if (scope?.channelId) contextLines.push(`Discord channel: ${scope.channelId}`);
  if (summary?.lastAssistantText) contextLines.push(`Last assistant: ${compactText(summary.lastAssistantText, 120)}`);
  if (summary?.lastUserText) contextLines.push(`Last user: ${compactText(summary.lastUserText, 120)}`);
  if (userSummary?.lastText) contextLines.push(`Last from ${userId}: ${compactText(userSummary.lastText, 120)}`);
  if (summary?.recentLines?.length) contextLines.push(`Recent turns:\n${summary.recentLines.slice(-contextWindow).join('\n')}`);
  if (userSummary?.recentLines?.length) contextLines.push(`User memory:\n${userSummary.recentLines.slice(-Math.max(1, Math.min(3, contextWindow))).join('\n')}`);
  return [
    'You are Kittu, a warm concise Discord voice assistant connected to OpenClaw.',
    'Keep replies short, natural, and spoken-friendly.',
    config.openClawFastAnswerFirst === false
      ? 'Answer clearly and conversationally.'
      : `Lead with the direct answer in sentence one. Default to at most ${Number.parseInt(String(config.discordVoiceReplyMaxSentences || '2'), 10) || 2} short sentences and keep the spoken reply under about ${Number.parseInt(String(config.discordVoiceReplyMaxChars || '240'), 10) || 240} characters unless absolutely necessary.`,
    history.length ? `Recent context turns: ${history.length}` : 'No prior context.',
    ...contextLines,
    `Current user: ${userId}`,
    `Current transcript: ${text}`,
    'Prefer spoken phrasing. Avoid markdown unless it helps.',
  ].join('\n');
}

function buildSessionKey(scope = {}, agentId = 'sam') {
  const guildId = scope?.guildId || 'global';
  const channelId = scope?.channelId || 'default';
  return `agent:${agentId}:discord:voice:${guildId}:${channelId}`;
}

function buildMsgContext({ text, userId, history = [], summary = null, userSummary = null, scope = null, agentId = 'sam' }) {
  const cleanBody = cleanText(text);
  const bodyForAgent = buildPrompt({ text: cleanBody, userId, history, summary, userSummary, scope, config: scope?.config || {} });
  const inboundHistory = Array.isArray(history)
    ? history.slice(-8).map((turn) => ({
        sender: String(turn?.speaker || turn?.userId || 'user'),
        body: cleanText(turn?.text || turn?.transcript?.text || ''),
        timestamp: turn?.timestamp ? Number(turn.timestamp) : undefined,
      })).filter((turn) => turn.body)
    : [];

  return {
    Body: cleanBody,
    BodyForAgent: bodyForAgent,
    BodyForCommands: cleanBody,
    RawBody: cleanBody,
    CommandBody: cleanBody,
    CommandSource: 'native',
    From: userId,
    To: scope?.channelId || undefined,
    SessionKey: buildSessionKey(scope, agentId),
    Provider: 'discord',
    Surface: 'voice',
    ChatType: 'group',
    ConversationLabel: scope?.channelName || scope?.channelId || 'Discord voice channel',
    GroupChannel: scope?.channelName || scope?.channelId || undefined,
    GroupSpace: scope?.guildName || scope?.guildId || undefined,
    GroupSubject: scope?.guildName || undefined,
    InboundHistory: inboundHistory,
    Timestamp: Date.now(),
    InputProvenance: {
      provider: 'discord',
      surface: 'voice',
      channelId: scope?.channelId,
      guildId: scope?.guildId,
      userId,
    },
  };
}

function buildConfigOverride(config = {}) {
  const toolsAllow = parseCsvList(config.openClawToolsAllow);
  const toolsProfile = String(config.openClawToolsProfile || '').trim();
  if (!toolsAllow.length && !toolsProfile) return null;

  const override = {
    agents: {
      defaults: {
        tools: {},
      },
    },
  };

  if (toolsProfile) {
    override.agents.defaults.tools.profile = toolsProfile;
  }

  if (toolsAllow.length) {
    override.agents.defaults.tools.allow = toolsAllow;
  }

  return override;
}

function extractReplyText(reply) {
  if (!reply) return '';
  if (typeof reply === 'string') return cleanText(reply);
  if (Array.isArray(reply)) return reply.map(extractReplyText).filter(Boolean).join(' ');
  if (typeof reply !== 'object') return '';
  return cleanText(reply.text || reply.spokenText || reply.message || reply.content || reply.reply || reply.output || '');
}

async function callOpenClawReply({ config, text, userId, history, summary, userSummary, scope, deps, logger }) {
  const openclawModule = deps?.openclawModule || await import('openclaw');
  const getReplyFromConfig = openclawModule.getReplyFromConfig;
  const loadConfig = openclawModule.loadConfig;
  if (typeof getReplyFromConfig !== 'function') return null;

  const ctx = buildMsgContext({ text, userId, history, summary, userSummary, scope: { ...(scope || {}), config }, agentId: config.openClawAgentId || 'sam' });
  const localConfig = typeof loadConfig === 'function' ? await loadConfig() : undefined;
  const voiceConfigOverride = buildConfigOverride(config);
  const mergedConfig = voiceConfigOverride
    ? {
        ...(localConfig || {}),
        agents: {
          ...((localConfig || {}).agents || {}),
          defaults: {
            ...(((localConfig || {}).agents || {}).defaults || {}),
            ...((voiceConfigOverride.agents || {}).defaults || {}),
          },
        },
      }
    : localConfig;

  const sessionTimeoutMs = Number.parseInt(String(config.openClawSessionTimeoutMs || ''), 10) || 8000;
  const sessionReply = await Promise.race([
    getReplyFromConfig(ctx, {
      disableTools: false,
      suppressTyping: true,
      bootstrapContextMode: 'lightweight',
    }, mergedConfig).catch((error) => {
      logger?.debug?.('OpenClaw getReplyFromConfig failed', { message: error.message });
      return undefined;
    }),
    new Promise((resolve) => setTimeout(() => resolve({ __timeout: true }), sessionTimeoutMs)),
  ]);

  if (sessionReply?.__timeout) {
    logger?.warn?.('OpenClaw session reply timed out; falling back to HTTP gateway', {
      sessionKey: ctx.SessionKey,
      timeoutMs: sessionTimeoutMs,
    });
    return null;
  }

  const textReply = extractReplyText(sessionReply);
  if (!textReply) return null;

  return {
    text: formatReplyForVoice(textReply, config),
    rawText: textReply,
    source: 'openclaw-session-reply',
    model: localConfig?.agents?.defaults?.model?.name || localConfig?.agents?.defaults?.model?.id || null,
    gatewayUrl: resolveGatewaySettings(config).baseUrl,
    sessionKey: ctx.SessionKey,
    prompt: ctx.BodyForAgent,
  };
}

async function callHttpGatewayBrain({ config, logger, text, userId, history, summary, userSummary, scope }) {
  const settings = resolveGatewaySettings(config);
  if (!settings.baseUrl) return null;
  const fetchImpl = config.__fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('Fetch is not available for OpenClaw Gateway HTTP replies');
  }

  const messages = [
    {
      role: 'system',
      content: buildPrompt({ text, userId, history, summary, userSummary, scope, config }),
    },
    ...((history || []).slice(-getContextWindow(config)).map((turn) => ({
      role: String(turn?.speaker || '').toLowerCase() === 'assistant' ? 'assistant' : 'user',
      content: cleanText(turn?.text || turn?.transcript?.text || ''),
    })).filter((turn) => turn.content)),
    { role: 'user', content: cleanText(text) },
  ];

  const controller = new AbortController();
  const timeoutMs = Number.parseInt(String(config.openClawVoiceTimeoutMs || ''), 10) || 5000;
  const timeout = setTimeout(() => controller.abort(new Error('OpenClaw Gateway request timed out')), timeoutMs);
  const url = `${settings.baseUrl}/v1/chat/completions`;

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(settings.token ? { Authorization: `Bearer ${settings.token}` } : {}),
        ...(scope ? { 'x-openclaw-session-key': buildSessionKey(scope, settings.agentId) } : {}),
      },
      body: JSON.stringify({ model: settings.model, messages, temperature: 0.4, stream: false }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message = payload?.error?.message || payload?.message || `HTTP ${response.status}`;
      throw new Error(`OpenClaw Gateway error: ${message}`);
    }

    const textReply = cleanText(payload?.choices?.[0]?.message?.content || payload?.choices?.[0]?.text || payload?.output_text || '');
    if (!textReply) throw new Error('OpenClaw Gateway returned an empty reply');

    return { text: formatReplyForVoice(textReply, config), rawText: textReply, source: 'openclaw-gateway-http', model: settings.model, gatewayUrl: settings.baseUrl, usage: payload?.usage || null };
  } finally {
    clearTimeout(timeout);
  }
}

export function createOpenClawClient({ config, logger, deps = {} }) {
  const routePlan = buildReplyRoutePlan(config);
  const httpConfig = {
    ...config,
    __fetchImpl: deps.fetch,
  };

  return {
    isConfigured() {
      const settings = resolveGatewaySettings(config);
      return Boolean(settings.baseUrl || deps?.openclawModule);
    },
    buildPrompt,
    buildReplyRoutePlan() {
      return routePlan.slice();
    },
    async generateResponse({ text, userId, history = [], summary = null, userSummary = null, scope = null }) {
      const prompt = buildPrompt({ text, userId, history, summary, userSummary, scope, config });

      if (config.discordVoiceFastLocalFirst !== false) {
        const fastLocalReply = buildFastLocalReply(text);
        if (fastLocalReply) {
          return {
            text: formatReplyForVoice(fastLocalReply, config),
            rawText: fastLocalReply,
            source: 'local-fast-path',
            prompt,
          };
        }
      }

      for (const route of routePlan) {
        if (route === 'local') break;

        try {
          const reply = route === 'session'
            ? await callOpenClawReply({ config, text, userId, history, summary, userSummary, scope, deps, logger })
            : await callHttpGatewayBrain({ config: httpConfig, logger, text, userId, history, summary, userSummary, scope });

          if (reply?.text) {
            logger.info(`OpenClaw ${route} reply generated`, {
              userId,
              source: reply.source,
              model: reply.model || null,
              gatewayUrl: reply.gatewayUrl || null,
              sessionKey: reply.sessionKey || null,
              replyPreview: compactText(reply.text, 180),
            });
            return { ...reply, prompt };
          }
        } catch (error) {
          const isTimeout = /timed out|AbortError|aborted/i.test(error.message || '');
          logger.warn(`OpenClaw ${route} reply failed`, {
            userId,
            message: error.message,
            timeout: isTimeout,
            routePlan,
          });
        }
      }

      logger.debug('Using local voice-agent reply fallback', {
        userId,
        contextTurns: history.length,
        promptPreview: prompt.slice(0, 240),
        routePlan,
      });
      const fallback = buildLocalReply({ text, userId, history });
      return { text: formatReplyForVoice(fallback, config), rawText: fallback, source: 'local-fallback', prompt };
    },
  };
}
