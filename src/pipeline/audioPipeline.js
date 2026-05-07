import { createSpeechToText } from './stt.js';
import { createTextToSpeech } from './tts.js';

export function createAudioPipeline({ config, logger, openClaw }) {
  const stt = createSpeechToText({ logger });
  const tts = createTextToSpeech({ config, logger });

  return {
    async transcribe(input) {
      return stt.transcribe(input);
    },
    async transcribeCapture(capture) {
      return stt.transcribe({
        type: 'capture-file',
        path: capture?.filePath,
        userId: capture?.userId,
        format: capture?.format,
        sampleRate: capture?.sampleRate,
        channels: capture?.channels,
      });
    },
    async generateReply({ text, userId, history = [], summary = null, userSummary = null }) {
      if (openClaw?.generateResponse) {
        return openClaw.generateResponse({ text, userId, history, summary, userSummary });
      }

      return {
        text: text ? `You said: ${text}.` : "I didn't catch that.",
        source: 'local-fallback',
      };
    },
    async synthesize({ text, voice }) {
      return tts.synthesize({ text, voice });
    },
  };
}
