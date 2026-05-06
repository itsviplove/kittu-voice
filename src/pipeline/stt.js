import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

import ffmpegStatic from 'ffmpeg-static';

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
  const whisperBin = process.env.WHISPER_BIN || process.env.WHISPER_CLI;
  if (!whisperBin) {
    return {
      text: 'whisper stub: configure WHISPER_BIN to transcribe this capture',
      model: 'stub-whisper',
      source: 'stub',
    };
  }

  const whisperModel = process.env.WHISPER_MODEL || 'tiny';
  const whisperLanguage = process.env.WHISPER_LANGUAGE || 'en';
  const whisperOutputDir = process.env.WHISPER_OUTPUT_DIR || path.join(process.cwd(), '.kittu-voice-whisper');
  await mkdir(whisperOutputDir, { recursive: true });

  const prefix = path.join(whisperOutputDir, `capture-${Date.now()}`);
  const args = [
    '--model', whisperModel,
    '--language', whisperLanguage,
    '--output_dir', whisperOutputDir,
    '--output_format', 'txt',
    wavPath,
  ];

  await runCommand(whisperBin, args, { logger });

  const txtPath = `${prefix}.txt`;
  const altTxtPath = `${path.basename(wavPath, path.extname(wavPath))}.txt`;

  for (const candidate of [txtPath, path.join(whisperOutputDir, altTxtPath)]) {
    try {
      const content = await readFile(candidate, 'utf8');
      return {
        text: content.trim() || '(empty transcript)',
        model: whisperModel,
        source: 'whisper-cli',
      };
    } catch {
      // try next candidate
    }
  }

  return {
    text: '(no transcript produced)',
    model: whisperModel,
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
