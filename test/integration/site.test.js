// The running site with no settings at all: pages, headers, files, errors.

import assert from 'node:assert/strict';
import net from 'node:net';
import { after, before, test } from 'node:test';
import zlib from 'node:zlib';

import { fakeClock, rawRequest, startSite } from '../helpers/site.js';

let site;
before(async () => {
  site = await startSite();
});
after(() => site.close());

const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'";

test('home: the next Issue is in the first response, as plain HTML', async () => {
  const { res, text } = await site.get('/');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.ok(text.startsWith('<!DOCTYPE html>\n<html lang="en-CA">'));
  assert.equal(text.match(/<h1\b/g).length, 1);
  assert.match(text, /<h1 id="hero-title" class="hero__title cover-title">A room for the curious\.<\/h1>/);
  assert.match(text, /<time datetime="2026-11-25T18:00">Wednesday, November 25, 6:00 to 9:00 PM<\/time>/);
  assert.ok(text.includes('158 Commerce Drive, Winnipeg. Free to attend.'));
  assert.ok(text.includes('<a class="btn btn--ink btn--lg pop-cream" href="https://www.eventbrite.ca/e/wpg-ai-incubator-issue-13-tickets-1999778758098">Register for Issue #13</a>'));
  assert.ok(text.includes('Spotlight:<br>Tad Einstein'));
  assert.ok(text.includes('The Slurpee Capital gets a brain freeze.'));
  assert.ok(text.includes('<strong>Spotlight talk with Tad Einstein.</strong> About 45 minutes, plus a short Q&amp;A.'));
  assert.ok(text.includes('Issues #1 to #5, April to June 2026'));
  assert.ok(text.includes('<title>WPG AI Incubator: a room for the curious in Winnipeg</title>'));
  assert.ok(text.includes('<link rel="canonical" href="https://www.wpgincubator.ai/">'));
  assert.match(text, /<meta name="description" content="[^"]*Next: Issue #13, Wednesday, November 25, 6:00 to 9:00 PM, 158 Commerce Drive\.">/);
  assert.ok(text.includes('© 2026 WPG AI Incubator. Treaty 1 Territory, Winnipeg, Manitoba.'));
});

test('home: nothing inline that a strict content policy would block', async () => {
  const { text } = await site.get('/');
  assert.equal(/\sstyle="/.test(text), false, 'no inline styles');
  assert.equal(/<style\b/.test(text), false);
  assert.equal(/\son[a-z]+="/.test(text), false, 'no inline event handlers');
  const scripts = [...text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  for (const [, attrs, body] of scripts) {
    if (attrs.includes('application/ld+json')) continue;
    assert.match(attrs, /\ssrc="\/js\/[a-z]+\.js\?v=[0-9a-f]{10}" defer/);
    assert.equal(body, '');
  }
  assert.equal(text.includes('googletagmanager'), false, 'no analytics unless configured');
  assert.equal(/https?:\/\/(?!www\.eventbrite\.ca|www\.instagram\.com|www\.wpgincubator\.ai|schema\.org)[^"\s]+/.test(text.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '')), false, 'no third-party addresses besides the Eventbrite and Instagram links');
});

test('home: structured data is valid JSON with the right facts', async () => {
  const { text } = await site.get('/');
  const blocks = [...text.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  assert.deepEqual(blocks.map((b) => b['@type']), ['Organization', 'Event']);
  assert.equal(blocks[1].startDate, '2026-11-25T18:00:00-05:00');
  assert.equal(blocks[1].url, 'https://www.eventbrite.ca/e/wpg-ai-incubator-issue-13-tickets-1999778758098');
});

test('home: every file the page asks for is served', async () => {
  const { text } = await site.get('/');
  const local = new Set([...text.matchAll(/(?:src|href)="(\/[^"#]*)"/g)].map((m) => m[1]).filter((p) => /\.[a-z0-9]+(\?|$)/.test(p)));
  assert.ok(local.size >= 9, `expected the page to reference its assets, found ${local.size}`);
  for (const path of local) {
    const res = await site.request(path);
    assert.equal(res.status, 200, path);
    await res.arrayBuffer();
  }
  // and the fonts the stylesheet points to
  const css = await (await site.request('/css/site.css')).text();
  const fonts = [...css.matchAll(/url\(\.\.\/(fonts\/[a-z-]+\.woff2)\)/g)].map((m) => `/${m[1]}`);
  assert.equal(fonts.length, 6);
  for (const path of fonts) assert.equal((await site.request(path)).status, 200, path);
});

test('home: with no form destinations, the page offers links instead of forms that go nowhere', async () => {
  const { text } = await site.get('/');
  assert.equal(text.includes('action="/subscribe"'), false);
  assert.ok(text.includes('>Follow on Eventbrite</a>'));
  assert.ok(text.includes('href="mailto:hello@wpgincubator.ai?subject=Spotlight%20talk">Apply to speak</a>'));
  assert.ok(text.includes('<span class="finder__mode">Answer matched by keyword</span>'));
  assert.equal(text.includes('written by AI'), false);
});

test('security headers on every kind of response', async () => {
  for (const path of ['/', '/privacy', '/nope', '/css/site.css', '/healthz', '/robots.txt']) {
    const res = await site.request(path);
    await res.arrayBuffer();
    assert.equal(res.headers.get('content-security-policy'), CSP, path);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff', path);
    assert.equal(res.headers.get('x-frame-options'), 'DENY', path);
    assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin', path);
    assert.equal(res.headers.get('strict-transport-security'), null, 'no HSTS over plain HTTP');
  }
  const viaHttps = await site.request('/', { headers: { 'x-forwarded-proto': 'https' } });
  await viaHttps.arrayBuffer();
  assert.equal(viaHttps.headers.get('strict-transport-security'), 'max-age=31536000');
});

test('caching: pages revalidate, and an unchanged page costs no bytes', async () => {
  const first = await site.request('/');
  const etag = first.headers.get('etag');
  await first.arrayBuffer();
  assert.equal(first.headers.get('cache-control'), 'public, max-age=0, must-revalidate');
  assert.match(etag, /^W\/"[\w-]{22}"$/);
  const again = await site.request('/', { headers: { 'if-none-match': etag } });
  assert.equal(again.status, 304);
  assert.equal((await again.arrayBuffer()).byteLength, 0);
});

test('compression: brotli and gzip are honoured and decode to the same page', async () => {
  const plain = await rawRequest(`${site.url}/`);
  assert.equal(plain.headers['content-encoding'], undefined);
  assert.equal(plain.headers.vary, 'Accept-Encoding');
  const br = await rawRequest(`${site.url}/`, { headers: { 'accept-encoding': 'gzip, br' } });
  assert.equal(br.headers['content-encoding'], 'br');
  assert.equal(Number(br.headers['content-length']), br.body.length);
  assert.ok(br.body.length < plain.body.length / 3, `brotli ${br.body.length} vs plain ${plain.body.length}`);
  assert.equal(zlib.brotliDecompressSync(br.body).toString(), plain.body.toString());
  const gz = await rawRequest(`${site.url}/css/site.css`, { headers: { 'accept-encoding': 'gzip' } });
  assert.equal(gz.headers['content-encoding'], 'gzip');
  assert.ok(zlib.gunzipSync(gz.body).toString().includes('--orange:#FF6900'));
  const font = await rawRequest(`${site.url}/fonts/bangers-latin.woff2`, { headers: { 'accept-encoding': 'gzip, br' } });
  assert.equal(font.headers['content-encoding'], undefined, 'fonts are already compressed');
});

test('HEAD answers like GET without a body', async () => {
  const get = await rawRequest(`${site.url}/privacy`);
  const head = await rawRequest(`${site.url}/privacy`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.body.length, 0);
  assert.equal(head.headers['content-length'], get.headers['content-length']);
  const file = await rawRequest(`${site.url}/img/og.png`, { method: 'HEAD' });
  assert.deepEqual([file.status, file.body.length, file.headers['content-type']], [200, 0, 'image/png']);
});

test('static files: long cache only for versioned addresses, 304 when unchanged', async () => {
  const { text } = await site.get('/');
  const versioned = /href="(\/css\/site\.css\?v=[0-9a-f]{10})"/.exec(text)[1];
  const a = await site.request(versioned);
  await a.arrayBuffer();
  assert.equal(a.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.equal(a.headers.get('content-type'), 'text/css; charset=utf-8');
  const b = await site.request('/css/site.css');
  await b.arrayBuffer();
  assert.equal(b.headers.get('cache-control'), 'public, max-age=3600');
  const stale = await site.request('/css/site.css?v=0000000000');
  await stale.arrayBuffer();
  assert.equal(stale.headers.get('cache-control'), 'public, max-age=3600', 'a wrong version is not cached for a year');
  const font = await site.request('/fonts/archivo-latin.woff2');
  await font.arrayBuffer();
  assert.equal(font.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.equal(font.headers.get('access-control-allow-origin'), '*');
  const unchanged = await site.request('/css/site.css', { headers: { 'if-none-match': b.headers.get('etag') } });
  assert.equal(unchanged.status, 304);
});

test('static files: nothing outside public/ can be reached', async () => {
  for (const path of ['/../package.json', '/css/../../package.json', '/%2e%2e/package.json', '/..%2fpackage.json', '/css/%2e%2e%2f%2e%2e%2fserver.js', '/content/site.json', '/src/app.js', '/.env', '/brand/README.txt', '/package.json', '/data/subscribe.jsonl']) {
    const res = await rawRequest(`${site.url}${path}`);
    assert.equal(res.status, 404, path);
    assert.equal(res.body.toString().includes('"devDependencies"'), false, path);
  }
});

test('not found: a real 404 with a way home, kept out of search results', async () => {
  const { res, text } = await site.get('/admin');
  assert.equal(res.status, 404);
  assert.ok(text.includes('<h1 id="page-title" class="sub__title">Wrong room.</h1>'));
  assert.ok(text.includes('<meta name="robots" content="noindex">'));
  assert.ok(text.includes('href="/">Go to the home page</a>'));
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('wrong method: 405 with the allowed methods', async () => {
  const cases = [['POST', '/', 'GET, HEAD'], ['DELETE', '/privacy', 'GET, HEAD'], ['GET', '/find-your-room', 'POST'], ['PUT', '/apply', 'GET, HEAD, POST'], ['POST', '/css/site.css', 'GET, HEAD'], ['POST', '/nope', 'GET, HEAD']];
  for (const [method, path, allow] of cases) {
    const res = await site.request(path, { method });
    await res.arrayBuffer();
    assert.equal(res.status, 405, `${method} ${path}`);
    assert.equal(res.headers.get('allow'), allow, `${method} ${path}`);
  }
});

test('a trailing slash is redirected to the one true address', async () => {
  const res = await site.request('/privacy/');
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('location'), '/privacy');
  assert.equal((await site.request('/nope/')).status, 404);
});

test('one address: the bare domain and plain http are sent to the public address', async () => {
  const hop = async (headers, path = '/privacy?x=1') => {
    const res = await rawRequest(`${site.url}${path}`, { headers });
    return [res.status, res.headers.location];
  };
  assert.deepEqual(await hop({ host: 'wpgincubator.ai' }), [301, 'https://www.wpgincubator.ai/privacy?x=1']);
  assert.deepEqual(await hop({ host: 'internal-lb', 'x-forwarded-host': 'wpgincubator.ai' }), [301, 'https://www.wpgincubator.ai/privacy?x=1']);
  assert.deepEqual(await hop({ host: 'www.wpgincubator.ai', 'x-forwarded-proto': 'http' }, '/'), [301, 'https://www.wpgincubator.ai/']);
  assert.deepEqual(await hop({ host: 'www.wpgincubator.ai', 'x-forwarded-proto': 'https' }), [200, undefined]);
  assert.deepEqual(await hop({ host: 'www.wpgincubator.ai' }), [200, undefined]);
  assert.deepEqual(await hop({ host: '10.0.0.12:3000', 'x-forwarded-proto': 'http' }, '/healthz'), [200, undefined], 'health checks on internal addresses are not redirected');
  const post = await rawRequest(`${site.url}/find-your-room`, { method: 'POST', headers: { host: 'wpgincubator.ai', 'content-type': 'application/json' }, body: '{"example":"idea"}' });
  assert.equal(post.status, 200, 'a form post is never bounced and lost');
});

test('privacy page says what this setup actually does', async () => {
  const { res, text } = await site.get('/privacy');
  assert.equal(res.status, 200);
  assert.ok(text.includes('It is matched against a short list of keywords on our server.'));
  assert.equal(text.includes('Anthropic'), false);
  assert.ok(text.includes('This site does not collect email addresses for a mailing list.'));
  assert.ok(text.includes('This site does not use analytics, advertising or tracking cookies.'));
  assert.ok(text.includes('<link rel="canonical" href="https://www.wpgincubator.ai/privacy">'));
  assert.ok(text.includes('href="/#next-issue">Next Issue</a>'), 'navigation points back to the home page');
});

test('robots, sitemap, health check', async () => {
  const robots = await site.get('/robots.txt');
  assert.equal(robots.text, 'User-agent: *\nAllow: /\n\nSitemap: https://www.wpgincubator.ai/sitemap.xml\n');
  const map = await site.get('/sitemap.xml');
  assert.equal(map.res.headers.get('content-type'), 'application/xml; charset=utf-8');
  assert.deepEqual([...map.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]), ['https://www.wpgincubator.ai/', 'https://www.wpgincubator.ai/privacy']);
  const health = await site.get('/healthz');
  assert.deepEqual(JSON.parse(health.text), { ok: true });
});

test('calendar file and JSON for the next Issue', async () => {
  const ics = await site.get('/next-issue.ics');
  assert.equal(ics.res.status, 200);
  assert.equal(ics.res.headers.get('content-type'), 'text/calendar; charset=utf-8');
  assert.equal(ics.res.headers.get('content-disposition'), 'attachment; filename="wpg-ai-incubator-issue-13.ics"');
  assert.ok(ics.text.includes('DTSTART:20261125T230000Z\r\nDTEND:20261126T020000Z\r\nSUMMARY:WPG AI Incubator Issue #13\r\nLOCATION:158 Commerce Drive\\, Winnipeg\\, MB\r\n'));

  const api = await site.get('/api/next-issue');
  assert.equal(api.res.headers.get('access-control-allow-origin'), '*');
  assert.deepEqual(JSON.parse(api.text), {
    issue: {
      number: 13,
      name: 'WPG AI Incubator Issue #13',
      start: '2026-11-25T23:00:00.000Z',
      end: '2026-11-26T02:00:00.000Z',
      startLocal: '2026-11-25T18:00',
      timezone: 'America/Winnipeg',
      utcOffset: '-05:00',
      when: 'Wednesday, November 25, 6:00 to 9:00 PM',
      venue: { address: '158 Commerce Drive', city: 'Winnipeg', region: 'MB', country: 'CA' },
      free: true,
      registerUrl: 'https://www.eventbrite.ca/e/wpg-ai-incubator-issue-13-tickets-1999778758098',
      spotlight: 'Tad Einstein',
    },
    source: 'content',
    site: 'https://www.wpgincubator.ai/',
  });
});

test('the log records the path and the result, never the query string', async () => {
  await site.get('/?email=someone@example.com&note=private+words');
  const text = site.log.text();
  assert.match(text, /info GET \/ 200 \d+ms/);
  assert.equal(text.includes('someone@example.com'), false);
  assert.equal(text.includes('private'), false);
  assert.equal(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(text), false, 'no IP addresses in the log');
});

test('a malformed request line gets a 400, not a crash', async () => {
  const port = Number(new URL(site.url).port);
  const answer = await new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1', () => socket.write('GET http://[ HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n'));
    let data = '';
    socket.on('data', (chunk) => (data += chunk));
    socket.on('end', () => resolve(data));
    socket.on('error', reject);
  });
  assert.match(answer, /^HTTP\/1\.1 400 /);
  assert.equal((await site.get('/healthz')).res.status, 200, 'the server is still up');
});

test('after the Issue ends and before the next is announced', async () => {
  const later = await startSite({ now: fakeClock('2026-11-26T08:00') });
  try {
    const { text } = await later.get('/');
    assert.ok(text.includes('<strong>Next date to be announced.</strong>Issues run from 6:00 to 9:00 PM at 158 Commerce Drive, Winnipeg.'));
    assert.ok(text.includes('href="#newsletter">Get notified about the next Issue</a>'));
    assert.ok(text.includes('<a class="header-cta" href="#newsletter">Notify me</a>'));
    assert.ok(text.includes('<span class="cover__no-num">14</span>'));
    assert.ok(text.includes('To be continued…'));
    assert.ok(text.includes('A typical Issue'));
    assert.equal(text.includes('Register for'), false);
    assert.equal(text.includes('"@type":"Event"'), false);
    assert.equal(text.includes('Add to calendar'), false);
    assert.ok(text.includes('<h3 class="issue__name">Issue #13</h3>'), 'Issue #13 has moved to the back issues');
    assert.equal((await later.get('/next-issue.ics')).res.status, 404);
    assert.equal(JSON.parse((await later.get('/api/next-issue')).text).issue, null);
    const inner = await later.get('/privacy');
    assert.ok(inner.text.includes('<a class="header-cta" href="/#newsletter">Notify me</a>'));
  } finally {
    await later.close();
  }
});

test('an unexpected failure becomes a plain 500 and the log keeps the details out', async () => {
  let broken = false;
  const clock = fakeClock();
  const now = () => {
    if (broken) throw new Error('database password is hunter2');
    return clock();
  };
  const fragile = await startSite({ now });
  try {
    assert.equal((await fragile.get('/')).res.status, 200);
    broken = true;
    const { res, text } = await fragile.get('/');
    assert.equal(res.status, 500);
    assert.equal(text, 'Server error\n');
    assert.match(fragile.log.text(), /error \[error\] GET \/ Error/);
    assert.equal(fragile.log.text().includes('hunter2'), false);
    broken = false;
    assert.equal((await fragile.get('/')).res.status, 200, 'the next request works again');
  } finally {
    await fragile.close();
  }
});

test('analytics: loaded only when configured, with the content policy opened just enough', async () => {
  const measured = await startSite({ env: { GA_MEASUREMENT_ID: 'G-CGCZPS611C' } });
  try {
    const { res, text } = await measured.get('/');
    assert.match(text, /<script src="\/js\/analytics\.js\?v=[0-9a-f]{10}" defer data-ga="G-CGCZPS611C"><\/script>/);
    const csp = res.headers.get('content-security-policy');
    assert.ok(csp.includes("script-src 'self' https://www.googletagmanager.com;"));
    assert.ok(csp.includes("connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com;"));
    assert.ok(csp.includes("default-src 'self';") && csp.includes("frame-ancestors 'none'"));
    const privacy = await measured.get('/privacy');
    assert.ok(privacy.text.includes('We use Google Analytics to count visits'));
    assert.ok(privacy.text.includes('Global Privacy Control or Do Not Track'));
  } finally {
    await measured.close();
  }
  const { text } = await site.get('/');
  assert.equal(text.includes('analytics.js'), false);
});
