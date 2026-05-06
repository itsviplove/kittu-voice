const LEVELS = ['debug', 'info', 'warn', 'error'];

export function createLogger(level = 'info') {
  const threshold = LEVELS.indexOf(level);

  function shouldLog(target) {
    const index = LEVELS.indexOf(target);
    return index >= (threshold === -1 ? 1 : threshold);
  }

  function emit(target, message, meta) {
    if (!shouldLog(target)) return;
    const timestamp = new Date().toISOString();
    const payload = meta ? ` ${JSON.stringify(meta)}` : '';
    console.log(`[${timestamp}] ${target.toUpperCase()} ${message}${payload}`);
  }

  return {
    debug: (message, meta) => emit('debug', message, meta),
    info: (message, meta) => emit('info', message, meta),
    warn: (message, meta) => emit('warn', message, meta),
    error: (message, meta) => emit('error', message, meta),
  };
}
