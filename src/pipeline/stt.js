export function createSpeechToText({ logger }) {
  return {
    async transcribe(input) {
      logger.debug('STT placeholder invoked', {
        inputType: input?.type || 'unknown',
      });

      return {
        text: 'transcribed placeholder speech',
        model: 'stub-stt',
      };
    },
  };
}
