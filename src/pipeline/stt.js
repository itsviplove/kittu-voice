import { access, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

import ffmpegStatic from 'ffmpeg-static';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const whisperToolRoot = path.join(workspaceRoot, 'tools', 'whispercpp');
const whisperDefaultBin = path.join(whisperToolRoot, 'bin', 'Release', 'whisper-cli.exe');
const whisperModelsRoot = path.join(whisperToolRoot, 'models');
const whisperDefaultModel = path.join(whisperModelsRoot, 'ggml-base.bin');

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

function looksLikePath(value = '') {
  return /[\\/]/.test(value) || /\.bin$/i.test(value) || /^[A-Za-z]:/.test(value);
}

function resolveWhisperModelPath() {
  const configured = process.env.WHISPER_MODEL || '';
  if (!configured) {
    return whisperDefaultModel;
  }

  if (looksLikePath(configured)) {
    return configured;
  }

  const normalized = configured.replace(/^ggml-/, '').replace(/\.bin$/i, '').trim().toLowerCase();
  const candidate = path.join(whisperModelsRoot, `ggml-${normalized}.bin`);
  if (existsSync(candidate)) {
    return candidate;
  }

  return whisperDefaultModel;
}

async function ensureWavFromInput(input, logger) {
  const inputPath = input.path;
  if (!inputPath) {
    throw new Error('No audio path available for STT');
  }

  if (/\.wav$/i.test(inputPath) || input.format === 'wav') {
    return { wavPath: inputPath, cleanup: false };
  }

  const wavPath = `${inputPath}.wav`;
  const ffmpegPath = process.env.FFMPEG_PATH || ffmpegStatic;

  if (!ffmpegPath) {
    throw new Error('ffmpeg binary not available');
  }

  const args = input.format === 'pcm-s16le'
    ? ['-y', '-f', 's16le', '-ar', String(input.sampleRate || 48000), '-ac', String(input.channels || 2), '-i', inputPath, wavPath]
    : ['-y', '-i', inputPath, '-ac', '1', '-ar', '16000', wavPath];

  await runCommand(ffmpegPath, args, { logger });
  return { wavPath, cleanup: true };
}

async function runWhisperCli(wavPath, logger) {
  const whisperBin = process.env.WHISPER_BIN || process.env.WHISPER_CLI || whisperDefaultBin;
  const whisperModel = resolveWhisperModelPath();
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
    return { path: input, cleanup: false, format: input.toLowerCase().endsWith('.wav') ? 'wav' : undefined };
  }

  if (input?.path || input?.filePath) {
    const filePath = input.path || input.filePath;
    return {
      path: filePath,
      cleanup: false,
      format: input.format || (String(filePath).toLowerCase().endsWith('.wav') ? 'wav' : undefined),
      sampleRate: input.sampleRate,
      channels: input.channels,
    };
  }

  if (input?.type === 'buffer' && input.data) {
    const tempPath = path.join(process.cwd(), '.kittu-voice-stt-input.opus');
    await writeFile(tempPath, input.data);
    return { path: tempPath, cleanup: true, format: 'opus' };
  }

  throw new Error('Unsupported STT input');
}

export function createSpeechToText({ logger }) {
  return {
    async transcribe(input) {
      logger.debug('STT invoked', {
        inputType: input?.type || 'unknown',
        inputPath: input?.path || input?.filePath || null,
        inputFormat: input?.format || null,
      });

      const capture = await normalizeInput(input);
      let wav = null;

      try {
        wav = await ensureWavFromInput(capture, logger);
        const transcript = await runWhisperCli(wav.wavPath, logger);
        return {
          ...transcript,
          sourcePath: capture.path,
          wavPath: wav.wavPath,
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
          wavPath: wav?.wavPath || null,
        };
      } finally {
        try {
          if (wav?.cleanup && wav?.wavPath) {
            await unlink(wav.wavPath);
          }
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
