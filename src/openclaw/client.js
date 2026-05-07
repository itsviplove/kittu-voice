function cleanText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
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
    return 'Right now I can listen in voice, answer simple questions, speak replies, and run slash commands like say, join, leave, and status.';
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

export function createOpenClawClient({ config, logger }) {
  function buildPrompt({ text, userId, history = [], summary = null, userSummary = null }) {
    const contextLines = [];
    if (summary?.lastAssistantText) contextLines.push(`Last assistant: ${summary.lastAssistantText}`);
    if (summary?.lastUserText) contextLines.push(`Last user: ${summary.lastUserText}`);
    if (userSummary?.lastText) contextLines.push(`Last from ${userId}: ${userSummary.lastText}`);

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

  return {
    isConfigured() {
      return false;
    },
    buildPrompt,
    async generateResponse({ text, userId, history = [], summary = null, userSummary = null }) {
      const prompt = buildPrompt({ text, userId, history, summary, userSummary });
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
