import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createConversationMemory } from '../src/pipeline/conversationMemory.js';
import { canReuseVoiceConnection } from '../src/discord/bot.js';
import { createDiscordCommandRouter } from '../src/discord/commands.js';
import { buildReplyRoutePlan, createOpenClawClient, formatReplyForVoice } from '../src/openclaw/client.js';

test('say command uses provided text and emits speech message', async () => {
  const router = createDiscordCommandRouter({
    config: {},
    logger: { warn() {}, info() {}, debug() {} },
    pipeline: {
      async synthesize({ text }) {
        return { path: `/tmp/${text}.wav`, engine: 'stub' };
      },
    },
  });

  const result = await router.handleTextMessage('/say anything is working');

  assert.equal(result.ok, true);
  assert.equal(result.spoken, 'anything is working');
  assert.equal(result.message, 'Generated speech for: anything is working');
});

test('openclaw client prefers session-backed replies when available', async () => {
  const fakeModule = {
    loadConfig: async () => ({ agents: { defaults: { model: { name: 'openclaw/default' } } } }),
    getReplyFromConfig: async (ctx, opts) => {
      assert.equal(ctx.SessionKey, 'agent:sam:discord:voice:guild-1:channel-1');
      assert.notEqual(opts?.sourceReplyDeliveryMode, 'message_tool_only');
      assert.match(ctx.BodyForAgent, /Current transcript: what time is it/);
      return { text: 'It is 3:30 PM.' };
    },
  };

  const client = createOpenClawClient({ config: { discordVoiceFastLocalFirst: false }, logger: { info() {}, warn() {}, debug() {} }, deps: { openclawModule: fakeModule } });
  const reply = await client.generateResponse({ text: 'what time is it', userId: 'u1', history: [], scope: { guildId: 'guild-1', channelId: 'channel-1' } });
  assert.equal(reply.source, 'openclaw-session-reply');
  assert.equal(reply.text, 'It is 3:30 PM.');
});

test('reply route plan is deterministic and configurable', async () => {
  assert.deepEqual(buildReplyRoutePlan({}), ['session', 'http', 'local']);
  assert.deepEqual(buildReplyRoutePlan({ openClawReplyStrategy: 'http-first' }), ['http', 'session', 'local']);
  assert.deepEqual(buildReplyRoutePlan({ openClawReplyStrategy: 'session-only' }), ['session', 'local']);
});

test('openclaw client can prefer HTTP replies first when configured', async () => {
  let sessionCalls = 0;
  let httpCalls = 0;
  const fakeModule = {
    loadConfig: async () => ({ agents: { defaults: { model: { name: 'openclaw/default' } } } }),
    getReplyFromConfig: async () => {
      sessionCalls += 1;
      return { text: 'session reply' };
    },
  };

  const client = createOpenClawClient({
    config: { openClawBaseUrl: 'http://127.0.0.1:27277', openClawReplyStrategy: 'http-first', discordVoiceFastLocalFirst: false },
    logger: { info() {}, warn() {}, debug() {} },
    deps: {
      openclawModule: fakeModule,
      fetch: async () => {
        httpCalls += 1;
        return {
          ok: true,
          json: async () => ({ choices: [{ message: { content: 'http reply' } }] }),
        };
      },
    },
  });

  const reply = await client.generateResponse({ text: 'hello there', userId: 'u1', history: [], scope: { guildId: 'guild-1', channelId: 'channel-1' } });
  assert.equal(reply.source, 'openclaw-gateway-http');
  assert.equal(reply.text, 'http reply');
  assert.equal(httpCalls, 1);
  assert.equal(sessionCalls, 0);
});

test('disconnected voice connections are not reused', () => {
  assert.equal(canReuseVoiceConnection({ joinConfig: { channelId: '123' }, state: { status: 'ready' } }, '123'), true);
  assert.equal(canReuseVoiceConnection({ joinConfig: { channelId: '123' }, state: { status: 'disconnected' } }, '123'), false);
  assert.equal(canReuseVoiceConnection({ joinConfig: { channelId: '999' }, state: { status: 'ready' } }, '123'), false);
});

test('formatReplyForVoice trims markdown and keeps spoken replies short', () => {
  const result = formatReplyForVoice('**Hello** there. Here is a second sentence. Here is a third sentence with `code` and https://example.com', {
    discordVoiceReplyMaxChars: 60,
    discordVoiceReplyMaxSentences: 2,
  });

  assert.equal(result.includes('**'), false);
  assert.equal(result.includes('https://'), false);
  assert.match(result, /^Hello there\. Here is a second sentence\.?/);
  assert.equal(result.length <= 60, true);
});

test('openclaw client returns fast local replies for simple prompts when enabled', async () => {
  const client = createOpenClawClient({
    config: { discordVoiceFastLocalFirst: true },
    logger: { info() {}, warn() {}, debug() {} },
    deps: {
      openclawModule: {
        getReplyFromConfig: async () => ({ text: 'slow answer' }),
        loadConfig: async () => ({ agents: { defaults: { model: { name: 'openclaw/default' } } } }),
      },
    },
  });

  const reply = await client.generateResponse({ text: 'what can you do', userId: 'u1', history: [] });
  assert.equal(reply.source, 'local-fast-path');
  assert.match(reply.text, /I can listen in voice/);
});

test('conversation memory builds per-user summaries', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'kittu-memory-'));
  const memory = createConversationMemory({ logger: null, rootDir });
  const scope = { guildId: 'guild-1', channelId: 'channel-1' };

  await memory.appendTurn({ ...scope, userId: 'user-a', speaker: 'user', text: 'hello there' });
  await memory.appendTurn({ ...scope, userId: 'user-b', speaker: 'user', text: 'ignore me' });
  await memory.appendTurn({ ...scope, userId: 'user-a', speaker: 'assistant', text: 'hey user-a' });

  const summary = await memory.buildUserSummary(scope, 'user-a', 8);
  const recent = await memory.readRecentForUser(scope, 'user-a', 8);

  assert.equal(summary.userId, 'user-a');
  assert.equal(summary.totalTurns, 2);
  assert.equal(summary.lastText, 'hey user-a');
  assert.equal(recent.length, 2);
  assert.equal(recent[0].userId, 'user-a');

  await rm(rootDir, { recursive: true, force: true });
});
