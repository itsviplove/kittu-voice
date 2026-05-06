import { createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

import { EndBehaviorType } from '@discordjs/voice';

function safeStamp(value = new Date()) {
  return value.toISOString().replace(/[:.]/g, '-');
}

function safeName(value = '') {
  return String(value).replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function createVoiceCaptureManager({ logger, rootDir, onCapture } = {}) {
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

  async function finalizeCapture(userId, reason = 'ended') {
    if (finalizing.has(userId)) return null;
    const current = active.get(userId);
    if (!current) return null;

    finalizing.add(userId);

    active.delete(userId);
    current.endedAt = new Date().toISOString();
    current.durationMs = new Date(current.endedAt).getTime() - new Date(current.startedAt).getTime();

    if (Number.isFinite(current.durationMs) && current.durationMs < (current.minDurationMs || 0)) {
      finalizing.delete(userId);
      try {
        current.stream.destroy();
        current.writeStream.end();
      } catch {
        // ignore cleanup
      }
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

    await new Promise((resolve) => {
      current.stream.once('close', resolve);
      current.stream.destroy();
      current.writeStream.end();
    });

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
    const fileName = `${safeStamp(startedAt)}-${safeName(userId)}.opus`;
    const filePath = path.join(captureRoot, fileName);

    const stream = connection.receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: options.endSilenceMs || 900,
      },
    });
    const writeStream = createWriteStream(filePath);

    const current = {
      userId,
      startedAt: startedAt.toISOString(),
      endedAt: null,
      durationMs: null,
      minDurationMs: options.minDurationMs || 0,
      filePath,
      format: 'opus',
      stream,
      writeStream,
    };

    active.set(userId, current);

    stream.on('data', (chunk) => {
      if (!writeStream.destroyed) {
        writeStream.write(chunk);
      }
    });

    stream.once('end', async () => {
      if (!writeStream.destroyed) {
        writeStream.end();
      }
      await finalizeCapture(userId, 'silence');
    });

    stream.once('error', async (error) => {
      logger?.error?.('Discord voice capture stream error', {
        userId,
        message: error.message,
      });
      await finalizeCapture(userId, 'error');
    });

    writeStream.once('error', (error) => {
      logger?.error?.('Discord voice capture write error', {
        userId,
        message: error.message,
      });
    });

    logger?.info?.('Started Discord voice capture', { userId, filePath });
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
        void startStreamForUser(userId, options);
      };
      speakingEndHandler = (userId) => {
        void finalizeCapture(userId, 'speaking-end');
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
