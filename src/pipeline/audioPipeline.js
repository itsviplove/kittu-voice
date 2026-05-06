import { createSpeechToText } from './stt.js';
import { createTextToSpeech } from './tts.js';

export function createAudioPipeline({ logger, openClaw }) {
  const stt = createSpeechToText({ logger });
  const tts = createTextToSpeech({ logger });

  return {
    async transcribe(input) {
      return stt.transcribe(input);
    },
    async transcribeCapture(capture) {
      return stt.transcribe({
        type: 'opus-file',
        path: capture?.filePath,
        userId: capture?.userId,
      });
    },
    async generateReply({ text, userId, history = [] }) {
      if (openClaw?.isConfigured?.()) {
        return openClaw.generateResponse({ text, userId, history });
      }

      return {
        text: history.length ? `Echo: ${text} (context turns: ${history.length})` : `Echo: ${text}`,
        source: 'local-echo',
      };
    },
    async synthesize({ text, voice }) {
      return tts.synthesize({ text, voice });
    },
  };
}
