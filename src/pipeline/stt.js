export function createSpeechToText({ logger }) {
  return {
    async transcribe(input) {
      logger.debug('STT placeholder invoked', {
        inputType: input?.type || 'unknown',
        inputPath: input?.path || null,
      });

      return {
        text: 'transcribed placeholder speech',
        model: 'stub-stt',
        sourcePath: input?.path || null,
      };
    },
  };
}
