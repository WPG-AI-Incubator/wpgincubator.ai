// Entry point: `node server.js` (or `npm start`).

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createApp } from './src/app.js';
import { loadEnvFile } from './src/config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnvFile(path.join(here, '.env')); // optional, for local runs; hosts set real environment variables

const app = await createApp();
if (app.store.enabled) app.store.refresh(); // fetch Issues before the first visitor arrives
const server = http.createServer(app.handler);
server.requestTimeout = 20_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 65_000;

server.listen(app.config.port, app.config.host, () => {
  const { flags, config } = app;
  console.log(`[start] listening on http://${app.config.host}:${server.address().port} (public address ${config.siteUrl})`);
  console.log(`[start] Issues: ${app.store.enabled ? 'Eventbrite, with content/issues.json as the fallback' : 'content/issues.json only (no Eventbrite token)'}`);
  console.log(`[start] Find your room: ${flags.aiEnabled ? `AI replies (${config.ai.model}), keyword fallback` : 'keyword replies only (no API key)'}`);
  console.log(`[start] Forms: newsletter ${flags.subscribeEnabled ? 'on' : 'off (Eventbrite link shown)'}, take the stage ${flags.applyEnabled ? 'on' : 'off (email links shown)'}`);
  console.log(`[start] Analytics: ${flags.gaEnabled ? 'Google Analytics' : 'none'}`);
});

function shutdown(signal) {
  console.log(`[stop] ${signal}`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 8000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
