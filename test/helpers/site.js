// Starts the real app on a free local port for a test, with a captured log.

import http from 'node:http';
import { createApp } from '../../src/app.js';
import { readConfig } from '../../src/config.js';
import { parseLocal } from '../../src/dates.js';
import { captureLog } from './mocks.js';

// A clock that can be set and moved. Times are Winnipeg wall-clock strings.
export function fakeClock(start = '2026-11-13T10:00') {
  let current = parseLocal(start).getTime();
  const now = () => new Date(current);
  now.set = (text) => {
    current = parseLocal(text).getTime();
  };
  now.advance = (ms) => {
    current += ms;
  };
  return now;
}

export async function startSite({ env = {}, now = fakeClock(), fetch: fetchImpl, contentDir } = {}) {
  const log = captureLog();
  const config = readConfig({ SITE_URL: 'https://www.wpgincubator.ai', TRUST_PROXY: '1', ...env });
  const app = await createApp({ config, now, log, ...(fetchImpl ? { fetch: fetchImpl } : {}), ...(contentDir ? { contentDir } : {}) });
  const server = http.createServer(app.handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;

  const request = (path, options = {}) => fetch(`${url}${path}`, { redirect: 'manual', ...options });
  const post = (path, body, { json = true, headers = {} } = {}) =>
    request(path, {
      method: 'POST',
      headers: json
        ? { 'content-type': 'application/json', accept: 'application/json', ...headers }
        : { 'content-type': 'application/x-www-form-urlencoded', accept: 'text/html', ...headers },
      body: json ? JSON.stringify(body) : new URLSearchParams(body).toString(),
    });

  return {
    url,
    app,
    log,
    now,
    request,
    post,
    get: async (path, headers = {}) => {
      const res = await request(path, { headers });
      return { res, text: await res.text() };
    },
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

// A request with nothing added or decoded: exact headers in, exact bytes out.
export function rawRequest(url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end(body);
  });
}
