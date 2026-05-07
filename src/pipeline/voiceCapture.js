import { createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { EndBehaviorType } from '@discordjs/voice';

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const prism = require(path.join(projectRoot, 'node_modules', '@discordjs', 'voice', 'node_modules', 'prism-media'));

function safeStamp(value = new Date()) {
  return value.toISOString().replace(/[:.]/g, '-');
}

function safeName(value = '') {
  return String(value).replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function createVoiceCaptureManager({ logger, rootDir, onCapture, onSpeechStart } = {}) {
  const captureRoot = rootDir || path.join(process.cwd(), '.kittu-voice-captures');
  const active = new Map();
  const finalizing = new Set();
  const recentCaptures = [];
  let connection = null;
  let speakingStartHandler = null;
  let speakingEndHandler = null;

  async function ensureRoot() {
    await mkdir(captureRoot, { recursive: true });
    return captureRoot;
  }

  function pushRecent(entry) {
    recentCaptures.unshift(entry);
    recentCaptures.length = Math.min(recentCaptures.length, 12);
  }

  async function closeCaptureStreams(current) {
    await new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      current.writeStream.once('close', finish);
      current.writeStream.once('finish', finish);
      current.writeStream.once('error', finish);

      try {
        current.stream.unpipe?.(current.decoder);
      } catch {
        // ignore unpipe errors
      }

      try {
        current.stream.destroy();
      } catch {
        // ignore destroy errors
      }

      try {
        current.decoder.end();
      } catch {
        // ignore decoder end errors
      }

      try {
        current.writeStream.end();
      } catch {
        finish();
      }
    });
  }

  async function finalizeCapture(userId, reason = 'ended') {
    if (finalizing.has(userId)) return null;
    const current = active.get(userId);
    if (!current) return null;

    finalizing.add(userId);
    active.delete(userId);

    current.endedAt = new Date().toISOString();
    current.durationMs = new Date(current.endedAt).getTime() - new Date(current.startedAt).getTime();

    try {
      await closeCaptureStreams(current);
    } catch {
      // ignore close errors and continue cleanup
    }

    if (Number.isFinite(current.durationMs) && current.durationMs < (current.minDurationMs || 0)) {
      finalizing.delete(userId);
      try {
        await writeStreamCleanup(current.filePath);
      } catch {
        // ignore cleanup
      }
      logger?.info?.('Skipped short Discord voice capture', {
        userId,
        durationMs: current.durationMs,
        reason,
      });
      return null;
    }

    const capture = { ...current, reason };
    try {
      const info = await stat(capture.filePath);
      capture.bytes = info.size;
    } catch {
      capture.bytes = null;
    }

    pushRecent(capture);
    logger?.info?.('Saved Discord voice capture', {
      userId: capture.userId,
      filePath: capture.filePath,
      durationMs: capture.durationMs,
      bytes: capture.bytes,
      reason,
      format: capture.format,
    });
    if (onCapture) {
      void onCapture(capture);
    }
    finalizing.delete(userId);
    return capture;
  }

  async function writeStreamCleanup(filePath) {
    try {
      const { unlink } = await import('node:fs/promises');
      await unlink(filePath);
    } catch {
      // ignore cleanup
    }
  }

  async function startStreamForUser(userId, options = {}) {
    if (!connection?.receiver) return null;
    if (active.has(userId)) return active.get(userId);

    await ensureRoot();
    const startedAt = new Date();
    const fileName = `${safeStamp(startedAt)}-${safeName(userId)}.pcm`;
    const filePath = path.join(captureRoot, fileName);

    const stream = connection.receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: options.endSilenceMs || 900,
      },
    });
    const decoder = new prism.opus.Decoder({
      rate: 48000,
      channels: 2,
      frameSize: 960,
    });
    const writeStream = createWriteStream(filePath);

    stream.pipe(decoder).pipe(writeStream);

    const current = {
      userId,
      startedAt: startedAt.toISOString(),
      endedAt: null,
      durationMs: null,
      minDurationMs: options.minDurationMs || 0,
      filePath,
      format: 'pcm-s16le',
      sampleRate: 48000,
      channels: 2,
      bitDepth: 16,
      stream,
      decoder,
      writeStream,
    };

    active.set(userId, current);

    stream.once('end', async () => {
      await finalizeCapture(userId, 'silence');
    });

    stream.once('error', async (error) => {
      logger?.error?.('Discord voice capture stream error', {
        userId,
        message: error.message,
      });
      await finalizeCapture(userId, 'error');
    });

    decoder.once('error', async (error) => {
      logger?.error?.('Discord voice capture decode error', {
        userId,
        message: error.message,
      });
      await finalizeCapture(userId, 'decode-error');
    });

    writeStream.once('error', (error) => {
      logger?.error?.('Discord voice capture write error', {
        userId,
        message: error.message,
      });
    });

    logger?.info?.('Started Discord voice capture', { userId, filePath, format: current.format });
    return current;
  }

  function stopAll() {
    for (const userId of [...active.keys()]) {
      void finalizeCapture(userId, 'stopped');
    }
    if (connection?.receiver && speakingStartHandler) {
      connection.receiver.speaking.off('start', speakingStartHandler);
    }
    if (connection?.receiver && speakingEndHandler) {
      connection.receiver.speaking.off('end', speakingEndHandler);
    }
    connection = null;
    speakingStartHandler = null;
    speakingEndHandler = null;
  }

  return {
    async start(voiceConnection, options = {}) {
      stopAll();
      connection = voiceConnection;
      if (!connection?.receiver) {
        return { ok: false, reason: 'voice receiver unavailable' };
      }

      speakingStartHandler = (userId) => {
        if (onSpeechStart) {
          void onSpeechStart(userId);
        }
        void startStreamForUser(userId, options);
      };
      speakingEndHandler = (userId) => {
        logger?.debug?.('Discord speaking end observed; waiting for receiver silence', { userId });
      };

      connection.receiver.speaking.on('start', speakingStartHandler);
      connection.receiver.speaking.on('end', speakingEndHandler);

      logger?.info?.('Discord voice capture listener attached', {
        activeCaptures: active.size,
        captureRoot,
      });

      return { ok: true, captureRoot };
    },
    async stop() {
      stopAll();
      return { ok: true };
    },
    getStatus() {
      return {
        captureRoot,
        activeCount: active.size,
        recentCaptures: recentCaptures.slice(0, 5).map(({ userId, startedAt, endedAt, durationMs, filePath, format, bytes, reason }) => ({
          userId,
          startedAt,
          endedAt,
          durationMs,
          filePath,
          format,
          bytes,
          reason,
        })),
      };
    },
  };
}
