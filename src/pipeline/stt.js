import { access, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

import ffmpegStatic from 'ffmpeg-static';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const whisperToolRoot = path.join(workspaceRoot, 'tools', 'whispercpp');
const whisperDefaultBin = path.join(whisperToolRoot, 'bin', 'Release', 'whisper-cli.exe');
const whisperDefaultModel = path.join(whisperToolRoot, 'models', 'ggml-base.bin');

function runCommand(command, args, { logger } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const error = new Error(`Command failed: ${command} ${args.join(' ')}`);
      error.code = code;
      error.stderr = stderr;
      reject(error);
    });

    logger?.debug?.('Running command', { command, args });
  });
}

async function ensureWavFromOpus(inputPath, logger) {
  const wavPath = `${inputPath}.wav`;
  const ffmpegPath = process.env.FFMPEG_PATH || ffmpegStatic;

  if (!ffmpegPath) {
    throw new Error('ffmpeg binary not available');
  }

  await runCommand(ffmpegPath, ['-y', '-i', inputPath, '-ac', '1', '-ar', '16000', wavPath], { logger });
  return wavPath;
}

async function runWhisperCli(wavPath, logger) {
  const whisperBin = process.env.WHISPER_BIN || process.env.WHISPER_CLI || whisperDefaultBin;
  const whisperModel = process.env.WHISPER_MODEL || whisperDefaultModel;
  try {
    await access(whisperBin);
  } catch {
    return {
      text: 'whisper stub: configure WHISPER_BIN to transcribe this capture',
      model: 'stub-whisper',
      source: 'stub',
    };
  }

  const whisperLanguage = process.env.WHISPER_LANGUAGE || 'en';
  const args = ['-m', whisperModel, '-l', whisperLanguage === 'auto' ? 'auto' : whisperLanguage, '-nt', '-np', '-f', wavPath];

  const output = await runCommand(whisperBin, args, { logger });
  const text = output.stdout.trim();
  if (text) {
    return {
      text,
      model: path.basename(whisperModel),
      source: 'whisper-cli',
    };
  }

  return {
    text: '(no transcript produced)',
    model: path.basename(whisperModel),
    source: 'whisper-cli',
  };
}

async function normalizeInput(input) {
  if (typeof input === 'string') {
    return { path: input, cleanup: false };
  }

  if (input?.path) {
    return { path: input.path, cleanup: false };
  }

  if (input?.filePath) {
    return { path: input.filePath, cleanup: false };
  }

  if (input?.type === 'buffer' && input.data) {
    const tempPath = path.join(process.cwd(), '.kittu-voice-stt-input.opus');
    await writeFile(tempPath, input.data);
    return { path: tempPath, cleanup: true };
  }

  throw new Error('Unsupported STT input');
}

export function createSpeechToText({ logger }) {
  return {
    async transcribe(input) {
      logger.debug('STT invoked', {
        inputType: input?.type || 'unknown',
        inputPath: input?.path || input?.filePath || null,
      });

      const capture = await normalizeInput(input);
      let wavPath = null;

      try {
        wavPath = await ensureWavFromOpus(capture.path, logger);
        const transcript = await runWhisperCli(wavPath, logger);
        return {
          ...transcript,
          sourcePath: capture.path,
          wavPath,
        };
      } catch (error) {
        logger.warn('Whisper transcription fallback used', {
          message: error.message,
        });
        return {
          text: 'transcribed placeholder speech',
          model: 'stub-stt',
          source: 'fallback',
          sourcePath: capture.path,
          wavPath,
        };
      } finally {
        try {
          await unlink(wavPath);
        } catch {
          // ignore cleanup
        }
        if (capture.cleanup) {
          try {
            await unlink(capture.path);
          } catch {
            // ignore cleanup
          }
        }
      }
    },
  };
}
