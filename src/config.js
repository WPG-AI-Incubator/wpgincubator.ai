// All configuration comes from environment variables. Nothing is required:
// with an empty environment the site runs from content/issues.json, matches
// rooms by keyword and shows email links instead of forms.

import fs from 'node:fs';

// Optional .env file for local runs. Real environment variables always win.
export function loadEnvFile(file, env = process.env) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return false;
  }
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m) continue;
    let value = m[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (env[m[1]] === undefined) env[m[1]] = value;
  }
  return true;
}

function httpUrl(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  try {
    const url = new URL(text);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
  } catch {
    return '';
  }
}

export function readConfig(env = process.env) {
  const text = (name, fallback = '') => String(env[name] ?? '').trim() || fallback;
  const int = (name, fallback, min, max) => {
    const n = Number.parseInt(env[name] ?? '', 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };
  const flag = (name) => /^(1|true|yes|on)$/i.test(text(name));

  const siteUrl = (httpUrl(text('SITE_URL')) || 'https://www.wpgincubator.ai').replace(/\/+$/, '');
  const gaId = text('GA_MEASUREMENT_ID');

  return {
    port: int('PORT', 3000, 0, 65535),
    host: text('HOST', '0.0.0.0'),
    siteUrl,
    // How many proxies sit in front of the app (load balancer, CDN). Used only
    // to pick the visitor address for rate limits. 0 = use the socket address.
    trustProxy: int('TRUST_PROXY', 1, 0, 5),
    eventbrite: {
      token: text('EVENTBRITE_TOKEN'),
      orgId: text('EVENTBRITE_ORG_ID'),
      base: (httpUrl(text('EVENTBRITE_API_BASE')) || 'https://www.eventbriteapi.com/v3').replace(/\/+$/, ''),
      refreshMs: int('EVENTBRITE_REFRESH_MINUTES', 15, 1, 24 * 60) * 60 * 1000,
      titleFilter: text('EVENTBRITE_TITLE_FILTER', 'incubator').toLowerCase(),
    },
    ai: {
      key: text('ANTHROPIC_API_KEY'),
      model: text('ANTHROPIC_MODEL', 'claude-haiku-5-5'),
      base: (httpUrl(text('ANTHROPIC_API_BASE')) || 'https://api.anthropic.com').replace(/\/+$/, ''),
      version: text('ANTHROPIC_VERSION', '2023-06-01'),
      effort: env.ANTHROPIC_EFFORT === undefined ? 'low' : text('ANTHROPIC_EFFORT'),
      timeoutMs: int('FIND_ROOM_TIMEOUT_MS', 8000, 500, 30000),
      dailyCap: int('FIND_ROOM_DAILY_CAP', 500, 0, 1000000),
    },
    forms: {
      subscribeWebhook: httpUrl(text('SUBSCRIBE_WEBHOOK_URL')),
      applyWebhook: httpUrl(text('APPLY_WEBHOOK_URL')),
      fileStore: flag('FORMS_FILE_STORE'),
      dataDir: text('DATA_DIR', './data'),
    },
    gaId: /^G-[A-Z0-9]{4,20}$/.test(gaId) ? gaId : '',
  };
}
