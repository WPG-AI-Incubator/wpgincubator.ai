// Stand-ins for the outside services, used by the tests and by scripts/preview.mjs.
// They speak the same wire format as the real services (see src/eventbrite.js and
// src/findroom.js for the documented endpoints) but run on this machine.

import http from 'node:http';

function listen(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        port,
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise((done) => {
            server.closeAllConnections?.();
            server.close(() => done());
          }),
      });
    });
  });
}

function readJson(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        resolve(null);
      }
    });
  });
}

const json = (res, status, value) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(value));
};

// One Eventbrite event object, shaped like the v3 API returns it with expand=venue.
// start and end are Winnipeg wall-clock times ("2026-11-25T18:00:00"); utc is derived
// at UTC-5 unless given, the way Eventbrite sends both.
export function ebEvent({ id, title, start, end, startUtc, endUtc, timezone = 'America/Winnipeg', status = 'live', free = true, url, address = '158 Commerce Drive', city = 'Winnipeg' }) {
  const toUtc = (local) => new Date(Date.parse(`${local}Z`) + 5 * 60 * 60 * 1000).toISOString().replace('.000Z', 'Z');
  return {
    id: String(id),
    name: { text: title, html: title },
    summary: `${title}\nWinnipeg's AI community is back.`,
    description: { text: null, html: null },
    url: url ?? `https://www.eventbrite.ca/e/${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-tickets-${id}`,
    start: { timezone, utc: startUtc ?? toUtc(start), local: start },
    end: { timezone, utc: endUtc ?? toUtc(end), local: end },
    status,
    is_free: free,
    online_event: false,
    venue_id: '3003',
    venue: { id: '3003', name: 'Venue', address: { address_1: address, city, region: 'MB', postal_code: '', country: 'CA' } },
  };
}

export async function startMockEventbrite({ events = [], descriptions = {}, pageSize = 50, token = 'test-token' } = {}) {
  const state = { events, descriptions, failWith: 0, requests: [], hang: false };
  const server = await listen((req, res) => {
    const url = new URL(req.url, 'http://mock');
    state.requests.push({ path: url.pathname, query: Object.fromEntries(url.searchParams), auth: req.headers.authorization ?? '' });
    if (state.hang) return; // never answers: exercises timeouts
    if (state.failWith) return json(res, state.failWith, { error: 'MOCK_FAILURE', status_code: state.failWith });
    if (req.headers.authorization !== `Bearer ${token}`) return json(res, 401, { error: 'INVALID_AUTH', status_code: 401 });

    const list = /^\/v3\/organizations\/([^/]+)\/events\/$/.exec(url.pathname);
    if (list) {
      if (list[1] !== 'org-1') return json(res, 404, { error: 'NOT_FOUND', status_code: 404 });
      const offset = Number(url.searchParams.get('continuation') ?? 0);
      const pageItems = state.events.slice(offset, offset + pageSize);
      const more = offset + pageSize < state.events.length;
      return json(res, 200, {
        pagination: { object_count: state.events.length, page_number: offset / pageSize + 1, page_size: pageSize, has_more_items: more, ...(more ? { continuation: String(offset + pageSize) } : {}) },
        events: pageItems,
      });
    }
    const content = /^\/v3\/events\/([^/]+)\/structured_content\/$/.exec(url.pathname);
    if (content) {
      const body = state.descriptions[content[1]];
      if (body === undefined) return json(res, 200, { modules: [], purpose: 'listing' });
      return json(res, 200, {
        purpose: 'listing',
        page_version_number: '1',
        modules: [
          { id: '1', type: 'image', data: { image: { url: 'https://example.invalid/x.png' } } },
          { id: '2', type: 'text', data: { body: { type: 'text', alignment: 'left', text: body } } },
        ],
      });
    }
    return json(res, 404, { error: 'NOT_FOUND', status_code: 404 });
  });
  return { ...server, base: `${server.url}/v3`, state };
}

// A Messages API response body, including a thinking block before the text block.
export function messageBody(text, { stopReason = 'end_turn' } = {}) {
  return {
    id: 'msg_mock',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-5-5',
    content: [
      { type: 'thinking', thinking: 'mock', signature: 'mock' },
      { type: 'text', text },
    ],
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
  };
}

// respond(request) -> { status?, body?, delayMs?, raw? }. Default: a valid "build" reply.
export async function startMockAnthropic({ respond } = {}) {
  const state = { requests: [], respond };
  const server = await listen(async (req, res) => {
    const body = await readJson(req);
    const entry = { method: req.method, path: req.url, headers: req.headers, body };
    state.requests.push(entry);
    if (req.method !== 'POST' || req.url !== '/v1/messages') return json(res, 404, { type: 'error', error: { type: 'not_found_error', message: 'mock' } });
    const plan = (state.respond ? await state.respond(entry, state.requests.length) : null) ?? {};
    if (plan.delayMs) await new Promise((r) => setTimeout(r, plan.delayMs));
    if (plan.raw !== undefined) {
      res.writeHead(plan.status ?? 200, { 'content-type': 'application/json' });
      return res.end(plan.raw);
    }
    const status = plan.status ?? 200;
    if (status !== 200) return json(res, status, { type: 'error', error: { type: 'mock_error', message: 'mock failure' } });
    const reply = plan.body ?? messageBody(JSON.stringify({ room: 'build', why: 'You are in the middle of making it, so start where the laptops are open.', bring: 'Which part should I show first?' }));
    return json(res, 200, reply);
  });
  return { ...server, state };
}

export async function startWebhook({ status = 200 } = {}) {
  const state = { requests: [], status };
  const server = await listen(async (req, res) => {
    state.requests.push({ method: req.method, path: req.url, headers: req.headers, body: await readJson(req) });
    res.writeHead(state.status, { 'content-type': 'text/plain' });
    res.end('ok');
  });
  return { ...server, state };
}

// A logger that keeps every line, so tests can prove what was and was not written.
export function captureLog() {
  const lines = [];
  const add = (level) => (...parts) => lines.push(`${level} ${parts.join(' ')}`);
  return { lines, info: add('info'), warn: add('warn'), error: add('error'), log: add('info'), text: () => lines.join('\n') };
}
