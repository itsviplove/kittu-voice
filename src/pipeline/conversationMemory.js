import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

function safePart(value = '') {
  return String(value).replace(/[^a-zA-Z0-9._-]/g, '_');
}

function toIso(value = new Date()) {
  return new Date(value).toISOString();
}

export function createConversationMemory({ logger, rootDir } = {}) {
  const memoryRoot = rootDir || path.join(process.cwd(), '.kittu-voice-history');

  async function ensureRoot() {
    await mkdir(memoryRoot, { recursive: true });
    return memoryRoot;
  }

  function filePathForScope(scope = {}) {
    const guildId = safePart(scope.guildId || 'global');
    const channelId = safePart(scope.channelId || 'default');
    return path.join(memoryRoot, `${guildId}-${channelId}.jsonl`);
  }

  async function appendTurn(turn) {
    await ensureRoot();
    const record = {
      id: turn.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: toIso(turn.createdAt),
      guildId: turn.guildId || null,
      channelId: turn.channelId || null,
      userId: turn.userId || null,
      speaker: turn.speaker || 'user',
      text: turn.text || '',
      transcript: turn.transcript || null,
      reply: turn.reply || null,
      sourcePath: turn.sourcePath || null,
      capturePath: turn.capturePath || null,
      meta: turn.meta || {},
    };

    const filePath = filePathForScope(record);
    await writeFile(filePath, `${JSON.stringify(record)}\n`, { flag: 'a' });
    logger?.debug?.('Appended conversation turn', {
      filePath,
      speaker: record.speaker,
      userId: record.userId,
    });
    return record;
  }

  async function readRecent(scope = {}, limit = 8) {
    await ensureRoot();
    const filePath = filePathForScope(scope);
    try {
      const content = await readFile(filePath, 'utf8');
      return content
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(-Math.max(1, limit))
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  async function buildSummary(scope = {}, limit = 8) {
    const turns = await readRecent(scope, limit);
    const userTurns = turns.filter((turn) => turn.speaker === 'user');
    const assistantTurns = turns.filter((turn) => turn.speaker === 'assistant');
    const lastUser = [...userTurns].reverse()[0] || null;
    const lastAssistant = [...assistantTurns].reverse()[0] || null;

    return {
      totalTurns: turns.length,
      userTurns: userTurns.length,
      assistantTurns: assistantTurns.length,
      lastUserText: lastUser?.text || null,
      lastAssistantText: lastAssistant?.text || null,
      recentTurns: turns,
    };
  }

  return {
    memoryRoot,
    filePathForScope,
    appendTurn,
    readRecent,
    buildSummary,
  };
}
