import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/util/logger.js';

test('scaffold smoke path returns stubbed pipeline output', async () => {
  const app = createApp({ logger: createLogger('error') });
  const result = await app.smokeTest();

  assert.equal(result.transcript.text, 'transcribed placeholder speech');
  assert.ok(result.reply.text.length > 0);
  assert.equal(result.audio.engine, 'stub-tts');
});
