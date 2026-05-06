import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function sanitize(input) {
  return String(input || 'voice')
    .replace(/[^a-z0-9-_]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'voice';
}

function buildWavToneBuffer({ durationMs = 1100, sampleRate = 22050, frequency = 440 }) {
  const numSamples = Math.max(1, Math.floor(sampleRate * (durationMs / 1000)));
  const bytesPerSample = 2;
  const dataSize = numSamples * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28);
  buffer.writeUInt16LE(bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  const amplitude = 0.25 * 0x7fff;
  for (let i = 0; i < numSamples; i += 1) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * frequency * t) * amplitude;
    buffer.writeInt16LE(Math.round(sample), 44 + i * bytesPerSample);
  }

  return buffer;
}

async function writeFallbackWave(filePath, text) {
  const tone = buildWavToneBuffer({
    durationMs: Math.min(1800, Math.max(600, text.length * 45)),
    frequency: 440 + ((text.length % 4) * 110),
  });
  await writeFile(filePath, tone);
}

async function writeWindowsSpeechWave(filePath, text) {
  const script = [
    'Add-Type -AssemblyName System.Speech',
    '$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer',
    `$synth.SetOutputToWaveFile(${JSON.stringify(filePath)})`,
    `$synth.Speak(${JSON.stringify(text)})`,
    '$synth.Dispose()',
  ].join('; ');
  await execFileAsync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script]);
}

export function createTextToSpeech({ logger }) {
  return {
    async synthesize({ text, voice }) {
      const outDir = path.join(os.tmpdir(), 'kittu-voice');
      await mkdir(outDir, { recursive: true });
      const filePath = path.join(outDir, `kittu-${Date.now()}-${sanitize(voice)}.wav`);

      logger.debug('TTS synthesize invoked', {
        voice,
        textLength: text.length,
        filePath,
      });

      try {
        if (process.platform === 'win32') {
          await writeWindowsSpeechWave(filePath, text);
          return {
            format: 'wav',
            path: filePath,
            engine: 'windows-sapi',
          };
        }
      } catch (error) {
        logger.warn('Windows speech synthesis failed; falling back to tone', {
          message: error.message,
        });
      }

      await writeFallbackWave(filePath, text);
      return {
        format: 'wav',
        path: filePath,
        engine: 'tone-fallback',
      };
    },
  };
}
