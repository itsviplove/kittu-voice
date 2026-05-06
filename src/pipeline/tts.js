export function createTextToSpeech({ logger }) {
  return {
    async synthesize({ text, voice }) {
      logger.debug('TTS placeholder invoked', {
        voice,
        textLength: text.length,
      });

      return {
        format: 'text/plain',
        payload: `AUDIO_PLACEHOLDER:${voice}:${text}`,
        engine: 'stub-tts',
      };
    },
  };
}
