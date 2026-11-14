// The whole site as one request handler: createApp() -> { handler }.
// No framework. Routes are listed in route() below.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

import { readConfig } from './config.js';
import { isoDate, isoLocal, setUtcOffset, utcOffsetText } from './dates.js';
import { EXAMPLES, cleanInput, createRoomFinder } from './findroom.js';
import { CONSENT_SUBSCRIBE, createFormSink, looksAutomated, validateApply, validateSubscribe } from './forms.js';
import { buildIcs } from './ics.js';
import { createIssueStore, loadContentIssues } from './issues.js';
import { createLimiter } from './ratelimit.js';
import { homeMain } from './render/home.js';
import { layout } from './render/layout.js';
import { applyMain, messageMain, privacyMain, roomResultMain } from './render/pages.js';
import { buildModel, replyView, structuredData } from './view.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};
const COMPRESSIBLE = /^(text\/|image\/svg\+xml|application\/(json|xml))/;
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const BODY_LIMIT = 16 * 1024;

class HttpError extends Error {
  constructor(status) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

// ---------- static files ----------

function createAssets(publicDir) {
  const known = new Map(); // "/css/site.css" -> { file, type, mtimeMs, buf, version, etag, br, gz }

  (function walk(dir, prefix) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || /^readme/i.test(entry.name)) continue;
      const full = path.join(dir, entry.name);
      const urlPath = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(full, urlPath);
      else if (TYPES[path.extname(entry.name).toLowerCase()]) known.set(urlPath, { file: full, type: TYPES[path.extname(entry.name).toLowerCase()] });
    }
  })(publicDir, '');

  function get(urlPath) {
    const entry = known.get(urlPath);
    if (!entry) return null;
    let stat;
    try {
      stat = fs.statSync(entry.file);
    } catch {
      return null;
    }
    if (entry.mtimeMs !== stat.mtimeMs) {
      entry.buf = fs.readFileSync(entry.file);
      entry.mtimeMs = stat.mtimeMs;
      const hash = crypto.createHash('sha1').update(entry.buf).digest('hex');
      entry.version = hash.slice(0, 10);
      entry.etag = `"${hash.slice(0, 20)}"`;
      entry.br = null;
      entry.gz = null;
    }
    return entry;
  }

  const firstExisting = (base, exts) => exts.map((ext) => `${base}.${ext}`).find((p) => known.has(p)) ?? null;

  return {
    get,
    // "/css/site.css" -> "/css/site.css?v=3f2a…": the address changes when the file does, so browsers can keep it for a year.
    url(urlPath) {
      const entry = get(urlPath);
      return entry ? `${urlPath}?v=${entry.version}` : urlPath;
    },
    badge: firstExisting('/brand/badge', ['svg', 'png', 'webp']),
    organizerPhoto(name) {
      const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      return firstExisting(`/brand/organizers/${slug}`, ['webp', 'jpg', 'jpeg', 'png', 'avif']);
    },
  };
}

// ---------- the app ----------

export async function createApp(options = {}) {
  const config = options.config ?? readConfig(options.env ?? process.env);
  const now = options.now ?? (() => new Date());
  const log = options.log ?? console;
  const fetchImpl = options.fetch ?? fetch;
  const contentDir = options.contentDir ?? path.join(ROOT, 'content');
  const publicDir = options.publicDir ?? path.join(ROOT, 'public');

  const site = JSON.parse(fs.readFileSync(path.join(contentDir, 'site.json'), 'utf8'));
  if (site.utcOffset && !setUtcOffset(site.utcOffset)) log.warn('[start] content/site.json: utcOffset should look like "-05:00"; using -05:00');
  const contentIssues = loadContentIssues(path.join(contentDir, 'issues.json'));
  const store = createIssueStore({ config, contentIssues, fetchImpl, now, log });
  const finder = createRoomFinder({ config, fetchImpl, now, log });
  const sink = createFormSink({ config, fetchImpl, now, log });
  const limiter = createLimiter({ now: () => now().getTime() });
  const assets = createAssets(publicDir);
  const flags = {
    aiEnabled: finder.aiEnabled,
    subscribeEnabled: sink.subscribeEnabled,
    applyEnabled: sink.applyEnabled,
    gaEnabled: Boolean(config.gaId),
  };
  const siteHost = new URL(config.siteUrl).host;
  const otherHost = siteHost.startsWith('www.') ? siteHost.slice(4) : `www.${siteHost}`;
  const siteIsHttps = config.siteUrl.startsWith('https://');

  const ga = flags.gaEnabled;
  const csp = [
    "default-src 'self'",
    `script-src 'self'${ga ? ' https://www.googletagmanager.com' : ''}`,
    "style-src 'self'",
    `img-src 'self' data:${ga ? ' https://*.google-analytics.com https://*.googletagmanager.com' : ''}`,
    "font-src 'self'",
    `connect-src 'self'${ga ? ' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com' : ''}`,
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'",
  ].join('; ');

  function secure(req, res) {
    res.setHeader('Content-Security-Policy', csp);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=(), payment=()');
    if (req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    }
  }

  function encodingFor(req) {
    const accepted = String(req.headers['accept-encoding'] ?? '');
    if (/\bbr\b/.test(accepted)) return 'br';
    if (/\bgzip\b/.test(accepted)) return 'gzip';
    return '';
  }

  // Compressed copies of recent pages, keyed by content. The home page is the same
  // for every visitor until an Issue changes, so it is compressed once, not per request.
  const packed = new Map();
  function compress(buf, encoding, key) {
    const id = key ? `${encoding}:${key}` : '';
    if (id && packed.has(id)) return packed.get(id);
    const out =
      encoding === 'br'
        ? zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } })
        : zlib.gzipSync(buf, { level: 6 });
    if (id) {
      if (packed.size >= 24) packed.delete(packed.keys().next().value);
      packed.set(id, out);
    }
    return out;
  }

  // Sends a response we built in memory (pages, JSON, text).
  function send(req, res, status, body, headers = {}) {
    let buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body ?? ''), 'utf8');
    const type = headers['Content-Type'] ?? 'text/html; charset=utf-8';
    res.statusCode = status;
    res.setHeader('Content-Type', type);
    for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
    if (!res.hasHeader('Cache-Control')) res.setHeader('Cache-Control', 'no-store');

    const cacheable = status === 200 && (req.method === 'GET' || req.method === 'HEAD') && res.getHeader('Cache-Control') !== 'no-store';
    let etag = '';
    if (cacheable) {
      etag = `W/"${crypto.createHash('sha1').update(buf).digest('base64url').slice(0, 22)}"`;
      res.setHeader('ETag', etag);
      if (req.headers['if-none-match'] === etag) {
        res.statusCode = 304;
        res.end();
        return;
      }
    }
    if (COMPRESSIBLE.test(type) && buf.length > 1024) {
      res.setHeader('Vary', 'Accept-Encoding');
      const encoding = encodingFor(req);
      if (encoding) {
        buf = compress(buf, encoding, etag);
        res.setHeader('Content-Encoding', encoding);
      }
    }
    res.setHeader('Content-Length', buf.length);
    res.end(req.method === 'HEAD' ? undefined : buf);
  }

  const sendJson = (req, res, status, value, headers = {}) =>
    send(req, res, status, JSON.stringify(value), { 'Content-Type': 'application/json; charset=utf-8', ...headers });

  function redirect(res, status, location) {
    res.statusCode = status;
    res.setHeader('Location', location);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Length', 0);
    res.end();
  }

  function sendStatic(req, res, entry, versioned) {
    res.statusCode = 200;
    res.setHeader('Content-Type', entry.type);
    res.setHeader('ETag', entry.etag);
    const longLived = versioned || entry.type === 'font/woff2';
    res.setHeader('Cache-Control', longLived ? 'public, max-age=31536000, immutable' : 'public, max-age=3600');
    if (entry.type === 'font/woff2') res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.headers['if-none-match'] === entry.etag) {
      res.statusCode = 304;
      res.end();
      return;
    }
    let buf = entry.buf;
    if (COMPRESSIBLE.test(entry.type) && buf.length > 1024) {
      res.setHeader('Vary', 'Accept-Encoding');
      const encoding = encodingFor(req);
      if (encoding === 'br') {
        entry.br ??= zlib.brotliCompressSync(buf);
        buf = entry.br;
        res.setHeader('Content-Encoding', 'br');
      } else if (encoding === 'gzip') {
        entry.gz ??= zlib.gzipSync(buf, { level: 9 });
        buf = entry.gz;
        res.setHeader('Content-Encoding', 'gzip');
      }
    }
    res.setHeader('Content-Length', buf.length);
    res.end(req.method === 'HEAD' ? undefined : buf);
  }

  // ---------- request helpers ----------

  // The visitor's address, used only as a key for rate limits.
  function clientKey(req) {
    if (config.trustProxy > 0) {
      const chain = String(req.headers['x-forwarded-for'] ?? '').split(',').map((part) => part.trim()).filter(Boolean);
      if (chain.length) return chain[Math.max(0, chain.length - config.trustProxy)];
    }
    return req.socket.remoteAddress ?? 'unknown';
  }

  // Forms on this site are only ever posted from this site.
  function fromElsewhere(req) {
    const fetchSite = req.headers['sec-fetch-site'];
    if (fetchSite === 'same-origin' || fetchSite === 'none') return false;
    if (fetchSite) return true;
    const origin = req.headers.origin;
    if (!origin || origin === 'null') return false;
    try {
      const host = new URL(origin).host;
      return ![req.headers.host, req.headers['x-forwarded-host'], siteHost].includes(host);
    } catch {
      return true;
    }
  }

  async function readBody(req) {
    if (Number(req.headers['content-length']) > BODY_LIMIT) throw new HttpError(413);
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > BODY_LIMIT) throw new HttpError(413);
      chunks.push(chunk);
    }
    const text = Buffer.concat(chunks).toString('utf8');
    const type = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    if (type === 'application/json') {
      let value;
      try {
        value = JSON.parse(text);
      } catch {
        throw new HttpError(400);
      }
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400);
      return value;
    }
    if (type === 'application/x-www-form-urlencoded') return Object.fromEntries(new URLSearchParams(text));
    throw new HttpError(415);
  }

  const wantsJson = (req) =>
    /application\/json/.test(String(req.headers.accept ?? '')) || /application\/json/.test(String(req.headers['content-type'] ?? ''));

  // ---------- pages ----------

  async function modelFor(home) {
    const issues = await store.get();
    return { issues, model: buildModel({ site, issues, flags, now: now(), home }) };
  }

  function page(model, { title, description, path: pagePath, main, jsonLd = [], noindex = false }) {
    return layout({ model, assets, config, title, description, path: pagePath, main, jsonLd, noindex });
  }

  const PAGE_CACHE = { 'Cache-Control': 'public, max-age=0, must-revalidate' };

  async function home(req, res) {
    const { model } = await modelFor(true);
    const next = model.upcoming;
    const description = next
      ? `${site.intro} Next: ${next.name}, ${next.when}, ${next.address}.`
      : site.intro;
    const body = page(model, {
      title: `${site.name}: a room for the curious in Winnipeg`,
      description,
      path: '/',
      main: homeMain(model, assets),
      jsonLd: structuredData({ site, model, siteUrl: config.siteUrl, badge: assets.badge }),
    });
    send(req, res, 200, body, PAGE_CACHE);
  }

  async function privacy(req, res) {
    const { model } = await modelFor(false);
    const body = page(model, {
      title: `Privacy - ${site.name}`,
      description: `What ${site.name} collects on this site, in plain words.`,
      path: '/privacy',
      main: privacyMain(model),
    });
    send(req, res, 200, body, PAGE_CACHE);
  }

  async function message(req, res, status, { title, lead, primary = null, back = null, headers = {} }) {
    const { model } = await modelFor(false);
    const body = page(model, {
      title: `${title.replace(/\.$/, '')} - ${site.name}`,
      description: lead,
      path: '/',
      main: messageMain({ title, lead, primary, back }),
      noindex: true,
    });
    send(req, res, status, body, headers);
  }

  const HOME_LINK = { href: '/', label: 'Go to the home page' };

  const notFound = (req, res) =>
    message(req, res, 404, {
      title: 'Wrong room.',
      lead: 'There is nothing at this address. The home page has the next Issue and everything else.',
      primary: HOME_LINK,
    });

  // ---------- Find your room ----------

  const TOO_MANY = "That's a lot of tries in a row. Give it a minute, then try again.";
  const EMPTY = 'Type a sentence or tap an example. Your room shows up here.';

  async function findRoom(req, res) {
    const json = wantsJson(req);
    if (fromElsewhere(req)) return json ? sendJson(req, res, 403, { error: 'Send this from the site itself.' }) : notFound(req, res);
    const body = await readBody(req);
    const who = clientKey(req);

    if (!limiter.hit(`all:${who}`, 60, MINUTE).ok) return tooMany(req, res, json, 60);

    let reply;
    let said;
    if (typeof body.example === 'string' && Object.hasOwn(EXAMPLES, body.example)) {
      const example = EXAMPLES[body.example];
      reply = { room: example.room, why: example.why, bring: example.bring, source: 'example', fellBack: false };
      said = example.label;
    } else {
      const text = cleanInput(body.text);
      if (!text) {
        return json ? sendJson(req, res, 422, { error: EMPTY }) : redirect(res, 303, '/#find-your-room');
      }
      const perMinute = limiter.hit(`room-m:${who}`, 6, MINUTE);
      const perDay = limiter.hit(`room-d:${who}`, 40, 24 * HOUR);
      if (!perMinute.ok || !perDay.ok) return tooMany(req, res, json, Math.max(perMinute.retryAfter, perDay.retryAfter));
      reply = await finder.find(text);
      said = text;
    }

    const view = replyView({ reply, said, aiEnabled: flags.aiEnabled });
    if (json) return sendJson(req, res, 200, view);
    const { model } = await modelFor(false);
    const html = page(model, {
      title: `Your room - ${site.name}`,
      description: 'Your room at the next WPG AI Incubator Issue.',
      path: '/',
      main: roomResultMain(model, view),
      noindex: true,
    });
    return send(req, res, 200, html);
  }

  function tooMany(req, res, json, retryAfter) {
    const headers = { 'Retry-After': String(retryAfter) };
    if (json) return sendJson(req, res, 429, { error: TOO_MANY }, headers);
    return message(req, res, 429, { title: 'Give it a minute.', lead: TOO_MANY, back: { href: '/', label: 'Back to the home page' }, headers });
  }

  // ---------- forms ----------

  const SUBSCRIBED = "You're on the list. We'll email you when the next Issue date is live.";
  const notSaved = () => `That didn't save. Something went wrong on our side. Try again in a minute, or write to ${site.contactEmail}.`;

  async function subscribe(req, res) {
    if (!flags.subscribeEnabled) return notFound(req, res);
    const json = wantsJson(req);
    if (fromElsewhere(req)) return json ? sendJson(req, res, 403, { error: 'Send this from the site itself.' }) : notFound(req, res);
    const body = await readBody(req);
    const limit = limiter.hit(`sub:${clientKey(req)}`, 5, HOUR);
    if (!limit.ok) return tooMany(req, res, json, limit.retryAfter);

    const back = { href: '/#newsletter', label: 'Back to the home page' };
    const done = () =>
      json ? sendJson(req, res, 200, { ok: true, message: SUBSCRIBED }) : message(req, res, 200, { title: "You're on the list.", lead: "We'll email you when the next Issue date is live.", back });

    if (looksAutomated(body)) return done(); // say thanks, store nothing
    const checked = validateSubscribe(body);
    if (!checked.ok) {
      return json
        ? sendJson(req, res, 422, { error: checked.errors.email })
        : message(req, res, 422, { title: 'Check that address.', lead: checked.errors.email, back: { href: '/#newsletter', label: 'Try again' } });
    }
    const stored = await sink.deliver('subscribe', { ...checked.record, consent: CONSENT_SUBSCRIBE });
    if (!stored) {
      return json ? sendJson(req, res, 502, { error: notSaved() }) : message(req, res, 502, { title: "That didn't save.", lead: notSaved(), back: { href: '/#newsletter', label: 'Try again' } });
    }
    return done();
  }

  async function applyPage(req, res, url) {
    if (!flags.applyEnabled) return redirect(res, 302, '/#take-the-stage');
    const { model } = await modelFor(false);
    const kind = url.searchParams.get('kind') ?? '';
    const body = page(model, {
      title: `Take the stage - ${site.name}`,
      description: 'Apply to give a spotlight talk or show your work at a WPG AI Incubator Issue.',
      path: '/apply',
      main: applyMain(model, { values: { kind } }),
    });
    send(req, res, 200, body, PAGE_CACHE);
  }

  async function apply(req, res) {
    if (!flags.applyEnabled) return notFound(req, res);
    const json = wantsJson(req);
    if (fromElsewhere(req)) return json ? sendJson(req, res, 403, { error: 'Send this from the site itself.' }) : notFound(req, res);
    const body = await readBody(req);
    const limit = limiter.hit(`apply:${clientKey(req)}`, 5, HOUR);
    if (!limit.ok) return tooMany(req, res, json, limit.retryAfter);

    const thanks = {
      title: 'Got it.',
      lead: 'Your note is with the organizers. One of them will reply by email.',
      back: { href: '/', label: 'Back to the home page' },
    };
    const done = () => (json ? sendJson(req, res, 200, { ok: true, message: thanks.lead }) : message(req, res, 200, thanks));
    if (looksAutomated(body)) return done();

    const checked = validateApply(body);
    const form = async (status, extra) => {
      const { model } = await modelFor(false);
      const html = page(model, {
        title: `Take the stage - ${site.name}`,
        description: 'Apply to give a spotlight talk or show your work at a WPG AI Incubator Issue.',
        path: '/apply',
        main: applyMain(model, { values: checked.values, ...extra }),
        noindex: true,
      });
      return send(req, res, status, html);
    };
    if (!checked.ok) return json ? sendJson(req, res, 422, { errors: checked.errors }) : form(422, { errors: checked.errors });
    const stored = await sink.deliver('apply', checked.record);
    if (!stored) return json ? sendJson(req, res, 502, { error: notSaved() }) : form(502, { failed: true });
    return done();
  }

  // ---------- small routes ----------

  async function calendar(req, res) {
    const { issues, model } = await modelFor(false);
    const next = issues.upcoming;
    if (!next || next.dateOnly) return notFound(req, res);
    const venue = next.venue ?? site.venue;
    const ics = buildIcs({
      issue: next,
      name: model.upcoming.eventName,
      location: `${venue.address}, ${venue.city}, ${site.venue.region}`,
      siteUrl: config.siteUrl,
      stamp: now(),
    });
    const slug = next.number !== null ? `issue-${next.number}` : isoDate(next.start);
    send(req, res, 200, ics, {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="wpg-ai-incubator-${slug}.ics"`,
      'Cache-Control': 'public, max-age=300',
    });
  }

  async function nextIssueJson(req, res) {
    const { issues, model } = await modelFor(false);
    const next = model.upcoming;
    const payload = {
      issue: next
        ? {
            number: next.number,
            name: next.eventName,
            start: next.dateOnly ? isoDate(next.start) : next.start.toISOString(),
            end: next.end && !next.dateOnly ? next.end.toISOString() : null,
            startLocal: next.dateOnly ? isoDate(next.start) : isoLocal(next.start),
            timezone: 'America/Winnipeg',
            utcOffset: utcOffsetText(),
            when: next.when,
            venue: { address: next.address, city: next.city, region: site.venue.region, country: site.venue.country },
            free: next.free,
            registerUrl: next.url,
            spotlight: next.spotlight || null,
          }
        : null,
      source: issues.source,
      site: `${config.siteUrl}/`,
    };
    sendJson(req, res, 200, payload, { 'Cache-Control': 'public, max-age=300', 'Access-Control-Allow-Origin': '*' });
  }

  function sitemap(req, res) {
    const paths = ['/', '/privacy', ...(flags.applyEnabled ? ['/apply'] : [])];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths
      .map((p) => `  <url><loc>${config.siteUrl}${p}</loc></url>`)
      .join('\n')}\n</urlset>\n`;
    send(req, res, 200, xml, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
  }

  function robots(req, res) {
    send(req, res, 200, `User-agent: *\nAllow: /\n\nSitemap: ${config.siteUrl}/sitemap.xml\n`, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    });
  }

  // ---------- routing ----------

  const GET_ROUTES = {
    '/': home,
    '/privacy': privacy,
    '/apply': applyPage,
    '/next-issue.ics': calendar,
    '/api/next-issue': nextIssueJson,
    '/sitemap.xml': sitemap,
    '/robots.txt': robots,
    '/healthz': (req, res) => sendJson(req, res, 200, { ok: true }),
  };
  const POST_ROUTES = {
    '/find-your-room': findRoom,
    '/subscribe': subscribe,
    '/apply': apply,
  };

  // One address for the site: the bare domain and the www domain both end up at
  // SITE_URL, and plain http is sent to https when the proxy says the visitor used http.
  // Requests for any other host name (health checks, internal addresses) are left alone.
  function canonicalRedirect(req) {
    const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '').toLowerCase();
    if (host === otherHost) return true;
    return host === siteHost && siteIsHttps && req.headers['x-forwarded-proto'] === 'http';
  }

  async function route(req, res, url) {
    const pathname = url.pathname;
    const reading = req.method === 'GET' || req.method === 'HEAD';

    if (reading && canonicalRedirect(req)) return redirect(res, 301, `${config.siteUrl}${url.pathname}${url.search}`);

    if (reading && Object.hasOwn(GET_ROUTES, pathname)) return GET_ROUTES[pathname](req, res, url);
    if (req.method === 'POST' && Object.hasOwn(POST_ROUTES, pathname)) return POST_ROUTES[pathname](req, res, url);

    if (Object.hasOwn(GET_ROUTES, pathname) || Object.hasOwn(POST_ROUTES, pathname)) {
      const allow = [Object.hasOwn(GET_ROUTES, pathname) ? 'GET, HEAD' : '', Object.hasOwn(POST_ROUTES, pathname) ? 'POST' : ''].filter(Boolean).join(', ');
      return send(req, res, 405, 'Method not allowed\n', { 'Content-Type': 'text/plain; charset=utf-8', Allow: allow });
    }

    const asset = assets.get(pathname);
    if (asset) {
      if (!reading) return send(req, res, 405, 'Method not allowed\n', { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' });
      return sendStatic(req, res, asset, url.searchParams.get('v') === asset.version);
    }

    if (reading && pathname.length > 1 && pathname.endsWith('/')) {
      const trimmed = pathname.replace(/\/+$/, '');
      if (Object.hasOwn(GET_ROUTES, trimmed)) return redirect(res, 301, trimmed);
    }
    if (!reading) return send(req, res, 405, 'Method not allowed\n', { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' });
    return notFound(req, res);
  }

  // Never log a message: messages can quote what a visitor sent. Name and place are enough.
  function describe(error) {
    const frame = String(error?.stack ?? '').split('\n').find((line) => line.includes('/src/')) ?? '';
    return `${error?.name ?? 'Error'}${frame ? ` ${frame.trim()}` : ''}`;
  }

  async function handler(req, res) {
    const started = performance.now();
    let pathname = '?';
    secure(req, res);
    try {
      const url = new URL(req.url ?? '/', 'http://site.local');
      pathname = url.pathname.slice(0, 200);
      await route(req, res, url);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : error instanceof TypeError && pathname === '?' ? 400 : 500;
      if (status === 500) log.error(`[error] ${req.method} ${pathname} ${describe(error)}`);
      if (!res.headersSent) {
        if (status === 413) res.setHeader('Connection', 'close');
        try {
          if (wantsJson(req) || status !== 500) {
            const text = { 400: 'Bad request', 413: 'Too much text', 415: 'Unsupported content type', 500: 'Server error' }[status] ?? 'Error';
            if (wantsJson(req)) sendJson(req, res, status, { error: text });
            else send(req, res, status, `${text}\n`, { 'Content-Type': 'text/plain; charset=utf-8' });
          } else {
            await message(req, res, 500, {
              title: 'That broke.',
              lead: 'Something went wrong on our side. Try again in a minute.',
              primary: HOME_LINK,
            });
          }
        } catch {
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          }
          res.end('Server error\n');
        }
      } else {
        res.destroy();
      }
    } finally {
      // Path only: never the query string, never a body, never an address.
      log.info(`${req.method} ${pathname} ${res.statusCode} ${Math.round(performance.now() - started)}ms`);
    }
  }

  return { handler, config, flags, store };
}
