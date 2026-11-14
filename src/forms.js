// Newsletter sign-up and "take the stage" applications.
//
// A form only appears on the site when what it collects has somewhere to go:
//   SUBSCRIBE_WEBHOOK_URL / APPLY_WEBHOOK_URL   JSON POST to your list tool,
//                                               automation or spreadsheet script
//   FORMS_FILE_STORE=1                          append to DATA_DIR/*.jsonl
// With neither, the page shows email and Eventbrite links instead, so nothing
// a visitor sends can land where nobody reads it.

import fs from 'node:fs/promises';
import path from 'node:path';

const EMAIL = /^[^\s@<>()[\],;:"\\]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;

const single = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const multi = (value, max) =>
  String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, max);

export function validEmail(value) {
  const email = single(value, 320);
  return email.length <= 254 && EMAIL.test(email) ? email : '';
}

export const CONSENT_SUBSCRIBE = 'Asked to be emailed when new WPG AI Incubator Issue dates are announced.';

export function validateSubscribe(body) {
  const errors = {};
  const email = validEmail(body?.email);
  if (!email) errors.email = 'Enter an email address, like name@example.com.';
  return { ok: !Object.keys(errors).length, errors, values: { email: single(body?.email, 254) }, record: { email } };
}

export const APPLY_KINDS = {
  talk: 'Give a spotlight talk',
  show: 'Show your work at AI Show & Tell',
};

export function validateApply(body) {
  const errors = {};
  const kind = Object.hasOwn(APPLY_KINDS, body?.kind) ? body.kind : '';
  const name = single(body?.name, 100);
  const email = validEmail(body?.email);
  const about = multi(body?.about, 1500);
  let link = single(body?.link, 300);
  if (!kind) errors.kind = 'Choose a talk or a demo.';
  if (name.length < 2) errors.name = 'Enter your name.';
  if (!email) errors.email = 'Enter an email address, like name@example.com.';
  if (about.length < 10) errors.about = 'Tell us a little about what you are building. A sentence or two is plenty.';
  if (link) {
    if (!/^https?:\/\//i.test(link)) link = `https://${link}`;
    try {
      const url = new URL(link);
      if (!/^https?:$/.test(url.protocol) || !url.hostname.includes('.')) throw new Error('not a web address');
      link = url.toString();
    } catch {
      errors.link = 'That link does not look like a web address. Fix it or leave it empty.';
    }
  }
  return {
    ok: !Object.keys(errors).length,
    errors,
    values: { kind, name, email: single(body?.email, 254), about, link: single(body?.link, 300) },
    record: { kind, kindLabel: APPLY_KINDS[kind] ?? '', name, email, about, link },
  };
}

// The hidden "website" field. People never see it; scripts that fill every field do.
export function looksAutomated(body) {
  return single(body?.website, 200) !== '';
}

export function createFormSink({ config, fetchImpl = fetch, now = () => new Date(), log = console }) {
  const { subscribeWebhook, applyWebhook, fileStore, dataDir } = config.forms;
  const webhooks = { subscribe: subscribeWebhook, apply: applyWebhook };

  async function toWebhook(url, payload) {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`webhook answered ${res.status}`);
  }

  async function toFile(kind, payload) {
    await fs.mkdir(dataDir, { recursive: true });
    await fs.appendFile(path.join(dataDir, `${kind}.jsonl`), `${JSON.stringify(payload)}\n`, { mode: 0o600 });
  }

  function summary(kind, record) {
    if (kind === 'subscribe') return `New Issue alerts: ${record.email}`;
    const link = record.link ? ` Link: ${record.link}` : '';
    return `${record.kindLabel}: ${record.name} <${record.email}>. ${record.about}${link}`;
  }

  // Resolves true only when the record is stored somewhere. Never logs the record.
  async function deliver(kind, record) {
    const payload = {
      type: kind,
      ...record,
      submittedAt: now().toISOString(),
      site: config.siteUrl,
      text: summary(kind, record),
    };
    const jobs = [];
    if (webhooks[kind]) jobs.push(toWebhook(webhooks[kind], payload));
    if (fileStore) jobs.push(toFile(kind, payload));
    if (!jobs.length) return false;
    const results = await Promise.allSettled(jobs);
    const failed = results.filter((r) => r.status === 'rejected');
    for (const failure of failed) {
      log.error(`[forms] ${kind} delivery failed (${failure.reason?.message ?? 'error'})`);
    }
    return failed.length < results.length;
  }

  return {
    subscribeEnabled: Boolean(subscribeWebhook || fileStore),
    applyEnabled: Boolean(applyWebhook || fileStore),
    deliver,
  };
}
