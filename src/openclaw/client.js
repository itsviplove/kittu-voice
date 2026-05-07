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

  if (!normalized) {
    return "I didn't catch that.";
  }

  if (/(what('?s| is) the time|what time is it|time now|tell me the time)/i.test(lowered)) {
    return `It's ${now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`;
  }

  if (/(what('?s| is) the date|today('?s)? date|which day is it|what day is it)/i.test(lowered)) {
    return `Today is ${now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}.`;
  }

  if (/\bhow are you\b/i.test(lowered)) {
    return 'I am good. Listening and ready.';
  }

  if (/^(hello|hi|hey|yo)\b/i.test(lowered)) {
    return 'Hey, I am here.';
  }

  if (/\bthank(s| you)\b/i.test(lowered)) {
    return 'Anytime.';
  }

  if (/\b(who are you|what are you)\b/i.test(lowered)) {
    return 'I am Kittu Voice, your Discord voice assistant for OpenClaw.';
  }

  if (/\bwhat can you do\b/i.test(lowered)) {
    return 'I can listen in voice, answer simple questions, speak replies, and run slash commands like say, join, leave, and status.';
  }

  if (/\b(joke|funny)\b/i.test(lowered)) {
    return 'Why did the bot join voice chat? Because typing was too quiet.';
  }

  if (/\b(weather|rain|temperature)\b/i.test(lowered)) {
    return 'I cannot check live weather from this voice mode yet, but that can be wired into OpenClaw next.';
  }

  if (/\b(openclaw|open claw)\b/i.test(lowered)) {
    return 'OpenClaw is the local agent system I connect to. This voice project is the Discord voice layer for it.';
  }

  if (/^(tell|explain|describe)\b/i.test(lowered)) {
    const keywords = extractKeywords(normalized);
    if (keywords.length) {
      return `I can give a short answer about ${keywords.join(', ')}, but deeper knowledge needs the OpenClaw brain wired in next.`;
    }
  }

  if (/^(can|could|would|will|should|do|does|did|is|are|am|was|were|what|why|when|where|who|which|how)\b/i.test(lowered)) {
    return 'I heard the question, but my full reasoning brain is not connected yet. The next step is wiring this voice bot to OpenClaw for real answers.';
  }

  if (history.length) {
    return `I heard you say: ${normalized}.`;
  }

  return `I heard: ${normalized}.`;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function normalizeBaseUrl(value) {
  const raw = firstNonEmpty(value);
  if (!raw) return '';
  return raw
    .replace(/^ws:/i, 'http:')
    .replace(/^wss:/i, 'https:')
    .replace(/\/$/, '');
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
    const mode = gateway.auth?.mode || gateway.mode || '';
    return {
      configPath,
      baseUrl: normalizeBaseUrl(baseUrl),
      port: port ? Number(port) : 0,
      token,
      authMode: mode,
    };
  } catch {
    return { configPath, baseUrl: '', port: 0, token: '', authMode: '' };
  }
}

function resolveGatewaySettings(config = {}) {
  const localConfig = readLocalGatewayConfig();
  const baseUrl = normalizeBaseUrl(
    firstNonEmpty(
      config.openClawBaseUrl,
      process.env.OPENCLAW_BASE_URL,
      process.env.OPENCLAW_GATEWAY_URL,
      process.env.OPENCLAW_GATEWAY_HTTP_URL,
      localConfig.baseUrl,
      localConfig.port ? `http://127.0.0.1:${localConfig.port}` : '',
      'http://127.0.0.1:27277',
      'http://127.0.0.1:18789',
    ),
  );

  const token = firstNonEmpty(
    config.openClawApiKey,
    process.env.OPENCLAW_API_KEY,
    process.env.OPENCLAW_GATEWAY_TOKEN,
    localConfig.token,
  );

  const model = firstNonEmpty(
    config.openClawModel,
    process.env.OPENCLAW_MODEL,
    process.env.OPENCLAW_AGENT_MODEL,
    'openclaw/default',
  );

  const requestTimeoutMs = Number.parseInt(
    firstNonEmpty(
      String(config.openClawRequestTimeoutMs || ''),
      process.env.OPENCLAW_REQUEST_TIMEOUT_MS,
      '30000',
    ),
    10,
  );

  return {
    baseUrl,
    token,
    model,
    requestTimeoutMs: Number.isFinite(requestTimeoutMs) && requestTimeoutMs > 0 ? requestTimeoutMs : 30000,
    localConfig,
  };
}

function buildPrompt({ text, userId, history = [], summary = null, userSummary = null }) {
  const contextLines = [];
  if (summary?.lastAssistantText) contextLines.push(`Last assistant: ${summary.lastAssistantText}`);
  if (summary?.lastUserText) contextLines.push(`Last user: ${summary.lastUserText}`);
  if (userSummary?.lastText) contextLines.push(`Last from ${userId}: ${userSummary.lastText}`);
  if (summary?.recentLines?.length) contextLines.push(`Recent turns:\n${summary.recentLines.slice(-8).join('\n')}`);

  return [
    'You are Kittu, a warm concise Discord voice agent.',
    'Keep replies short, natural, and spoken-friendly.',
    history.length ? `Recent context turns: ${history.length}` : 'No prior context.',
    ...contextLines,
    `Current user: ${userId}`,
    `Current transcript: ${text}`,
    'Prefer spoken phrasing. Avoid markdown unless it helps.',
  ].join('\n');
}

function buildMessages({ text, userId, history = [], summary = null, userSummary = null }) {
  const messages = [
    {
      role: 'system',
      content: [
        'You are Kittu, a warm concise Discord voice assistant connected to OpenClaw.',
        'Reply like a spoken assistant: 1-3 short sentences, no markdown, no long preambles.',
        'If the user asks a simple factual question, answer directly.',
        'If context is missing, say so briefly instead of guessing.',
        `Current user: ${userId}`,
        summary?.lastAssistantText ? `Last assistant: ${summary.lastAssistantText}` : null,
        summary?.lastUserText ? `Last user: ${summary.lastUserText}` : null,
        userSummary?.lastText ? `Last from this user: ${userSummary.lastText}` : null,
      ].filter(Boolean).join('\n'),
    },
  ];

  const recentTurns = Array.isArray(history) ? history.slice(-8) : [];
  for (const turn of recentTurns) {
    const speaker = String(turn?.speaker || '').toLowerCase();
    const role = speaker === 'assistant' ? 'assistant' : 'user';
    const content = cleanText(turn?.text || turn?.transcript?.text || '');
    if (!content) continue;
    messages.push({ role, content });
  }

  messages.push({
    role: 'user',
    content: cleanText(text),
  });

  return messages;
}

async function callGatewayBrain({ config, logger, text, userId, history, summary, userSummary }) {
  const settings = resolveGatewaySettings(config);
  if (!settings.baseUrl) {
    return null;
  }

  const messages = buildMessages({ text, userId, history, summary, userSummary });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('OpenClaw Gateway request timed out')), settings.requestTimeoutMs);
  const url = `${settings.baseUrl}/v1/chat/completions`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(settings.token ? { Authorization: `Bearer ${settings.token}` } : {}),
      },
      body: JSON.stringify({
        model: settings.model,
        messages,
        temperature: 0.4,
        stream: false,
      }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message = payload?.error?.message || payload?.message || `HTTP ${response.status}`;
      throw new Error(`OpenClaw Gateway error: ${message}`);
    }

    const textReply = cleanText(
      payload?.choices?.[0]?.message?.content ||
      payload?.choices?.[0]?.text ||
      payload?.output_text ||
      '',
    );

    if (!textReply) {
      throw new Error('OpenClaw Gateway returned an empty reply');
    }

    return {
      text: textReply,
      source: 'openclaw-gateway',
      model: settings.model,
      gatewayUrl: settings.baseUrl,
      usage: payload?.usage || null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function createOpenClawClient({ config, logger }) {
  return {
    isConfigured() {
      const settings = resolveGatewaySettings(config);
      return Boolean(settings.baseUrl);
    },
    buildPrompt,
    async generateResponse({ text, userId, history = [], summary = null, userSummary = null }) {
      const prompt = buildPrompt({ text, userId, history, summary, userSummary });

      try {
        const gatewayReply = await callGatewayBrain({ config, logger, text, userId, history, summary, userSummary });
        if (gatewayReply?.text) {
          logger.info('OpenClaw Gateway reply generated', {
            userId,
            model: gatewayReply.model,
            gatewayUrl: gatewayReply.gatewayUrl,
            replyPreview: compactText(gatewayReply.text, 180),
          });
          return { ...gatewayReply, prompt };
        }
      } catch (error) {
        logger.warn('OpenClaw Gateway reply failed; falling back locally', {
          userId,
          message: error.message,
        });
      }

      logger.debug('Using local voice-agent reply fallback', {
        userId,
        contextTurns: history.length,
        promptPreview: prompt.slice(0, 240),
      });
      return {
        text: buildLocalReply({ text, userId, history }),
        source: 'local-fallback',
        prompt,
      };
    },
  };
}
