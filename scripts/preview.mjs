// Run the site locally in any state, without real keys.
//
//   node scripts/preview.mjs                        as it runs with no settings
//   node scripts/preview.mjs --date 2026-11-27      as it will look on that day (e.g. after an Issue ends)
//   node scripts/preview.mjs --forms                newsletter and take-the-stage forms on (saved to ./data)
//   node scripts/preview.mjs --ai                   Find your room answered by a stand-in AI service
//   node scripts/preview.mjs --eventbrite           Issues served by a stand-in Eventbrite
//   node scripts/preview.mjs --port 4000
//
// The stand-ins run on this machine and are labelled as such. Nothing here talks to a real service.

import http from 'node:http';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { parseLocal } from '../src/dates.js';
import { ebEvent, messageBody, startMockAnthropic, startMockEventbrite } from '../test/helpers/mocks.js';

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const value = (flag, fallback) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback);

const env = { PORT: value('--port', '4000'), SITE_URL: `http://127.0.0.1:${value('--port', '4000')}` };
if (has('--forms')) env.FORMS_FILE_STORE = '1';

if (has('--ai')) {
  const ai = await startMockAnthropic({
    respond: (request) => {
      const said = /<visitor_message>\n([\s\S]*)\n<\/visitor_message>/.exec(request.body?.messages?.[0]?.content ?? '')?.[1] ?? '';
      const room = /ship|launch|user|customer/i.test(said) ? 'execute' : /idea|curious|learn|new to/i.test(said) ? 'dream' : 'build';
      return {
        delayMs: 600,
        body: messageBody(JSON.stringify({ room, why: `Stand-in AI reply for the ${room} room. The real service writes this from your words.`, bring: 'What would you like the room to help with?' })),
      };
    },
  });
  env.ANTHROPIC_API_KEY = 'preview-key';
  env.ANTHROPIC_API_BASE = ai.url;
  console.log(`[preview] stand-in AI service at ${ai.url}`);
}

if (has('--eventbrite')) {
  const eb = await startMockEventbrite({
    events: [
      ebEvent({ id: 3000000000015, title: 'WPG AI Incubator - Issue #15', start: '2026-12-23T18:00:00', end: '2026-12-23T21:00:00' }),
      ebEvent({ id: 3000000000014, title: 'WPG AI Incubator - Issue #14: Agents at work', start: '2026-12-09T18:00:00', end: '2026-12-09T21:00:00' }),
      ebEvent({ id: 1999778758098, title: 'WPG AI Incubator  - Issue #13', start: '2026-11-25T18:00:00', end: '2026-11-25T21:00:00', url: 'https://www.eventbrite.ca/e/wpg-ai-incubator-issue-13-tickets-1999778758098' }),
      ebEvent({ id: 1999776946680, title: 'WPG AI Incubator  - Issue #12', start: '2026-11-10T18:00:00', end: '2026-11-10T21:00:00', status: 'completed' }),
    ],
    descriptions: {
      1999778758098: '<p>6:00 PM – Doors open, coffee and networking</p><p>6:30 PM – Spotlight talk with Tad Einstein (about 45 min plus a short Q&amp;A)</p><p>7:25 PM – Breakout rooms: Dream / Build / Execute (about 35 min)</p><p>8:05 PM – AI Show &amp; Tell</p><p>8:45 – 9:00 PM – Wrap</p>',
    },
  });
  env.EVENTBRITE_TOKEN = 'test-token';
  env.EVENTBRITE_ORG_ID = 'org-1';
  env.EVENTBRITE_API_BASE = eb.base;
  console.log(`[preview] stand-in Eventbrite at ${eb.base}`);
}

let now;
const date = value('--date', '');
if (date) {
  const fixed = parseLocal(date.includes('T') ? date : `${date}T10:00`);
  if (!fixed) throw new Error('--date wants YYYY-MM-DD or YYYY-MM-DDTHH:MM (Winnipeg time)');
  const offset = fixed.getTime() - Date.now();
  now = () => new Date(Date.now() + offset);
  console.log(`[preview] the clock is set to ${fixed.toISOString()}`);
}

const app = await createApp({ config: readConfig(env), ...(now ? { now } : {}) });
http.createServer(app.handler).listen(app.config.port, '127.0.0.1', () => {
  console.log(`[preview] http://127.0.0.1:${app.config.port}/  (flags: ${JSON.stringify(app.flags)})`);
});
