import http from 'node:http';

export function createStatusServer({ config, logger }) {
  let server;

  return {
    async start() {
      if (server) return;

      server = http.createServer((req, res) => {
        const body = JSON.stringify({
          name: 'kittu-voice',
          status: 'ok',
          path: req.url,
        });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(body);
      });

      await new Promise((resolve) => {
        server.listen(config.port, () => {
          logger.info(`Status server listening on ${config.port}`);
          resolve();
        });
      });
    },
  };
}
