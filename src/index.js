#!/usr/bin/env node
import path from 'node:path';

import { createApp } from './app.js';
import { createLogger } from './util/logger.js';

loadProjectEnv();
const logger = createLogger(process.env.LOG_LEVEL || 'info');

async function main() {
  const command = process.argv[2] || 'start';
  const app = createApp({ logger });

  if (command === 'smoke') {
    const result = await app.smokeTest();
    logger.info('Smoke test passed', result);
    return;
  }

  if (command === 'start') {
    await app.start();
    return;
  }

  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  logger.error(`Unknown command: ${command}`);
  printHelp();
  process.exitCode = 1;
}

function loadProjectEnv() {
  try {
    const envPath = path.join(process.cwd(), '.env');
    process.loadEnvFile(envPath);
  } catch {
    // ignore missing or unreadable .env files
  }
}

function printHelp() {
  console.log(`Kittu Voice\n\nUsage:\n  node src/index.js start   Start the status server skeleton\n  node src/index.js smoke   Run the scaffold smoke test\n  node src/index.js help    Show this help\n`);
}

main().catch((error) => {
  logger.error('Fatal error while running Kittu Voice', {
    message: error.message,
    stack: error.stack,
  });
  process.exitCode = 1;
});
