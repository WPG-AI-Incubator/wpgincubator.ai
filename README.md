# wpgincubator.ai

The WPG AI Incubator website: one Node program, no framework, no build step, no runtime dependencies.

```
npm start            # http://localhost:3000
```

Needs Node 20 or newer (built and tested on Node 22). With no settings at all the site runs complete: Issues come from `content/issues.json`, Find your room answers by keyword, and the page shows email and Eventbrite links where forms would be. Each setting below switches one more thing on.

## Settings

All optional. Set them as environment variables on the host, or in a `.env` file for local runs (see `.env.example`).

| Setting | What it does | Without it |
|---|---|---|
| `SITE_URL` | Public address, used for links, sitemap and link previews. Default `https://www.wpgincubator.ai`. The other variant (bare domain or `www`) is redirected to it. | Default is used. |
| `PORT` | Port to listen on. Default `3000`. | |
| `TRUST_PROXY` | Number of proxies in front of the app. Default `1`, right for most hosts. Set `0` if the app is reached directly. Only used to tell visitors apart for rate limits. | |
| `EVENTBRITE_TOKEN`, `EVENTBRITE_ORG_ID` | Dates, times, links, venue and the agenda come from Eventbrite and refresh every 15 minutes. | Issues come from `content/issues.json`. |
| `EVENTBRITE_TITLE_FILTER` | Only events whose title contains this are shown. Default `incubator`. | |
| `ANTHROPIC_API_KEY` | Find your room replies to typed text are written by Claude. | Replies are matched by keyword, and the page says so. |
| `ANTHROPIC_MODEL` | Default `claude-haiku-5-5`. | |
| `FIND_ROOM_DAILY_CAP` | Most AI replies per day. Default `500`. Past it, replies are matched by keyword. | |
| `SUBSCRIBE_WEBHOOK_URL` | Shows the "Notify me" form and posts each sign-up to this URL. | The section shows a "Follow on Eventbrite" button instead. |
| `APPLY_WEBHOOK_URL` | Shows the take-the-stage form at `/apply` and posts each application to this URL. | "Apply to speak" and "Ask to be featured" open an email to the team. |
| `FORMS_FILE_STORE=1`, `DATA_DIR` | Also (or instead) append submissions to `DATA_DIR/subscribe.jsonl` and `apply.jsonl`. Needs a disk that survives restarts; many hosts wipe the disk on every deploy. | |
| `GA_MEASUREMENT_ID` | Loads Google Analytics (the current site uses `G-CGCZPS611C`). Skipped for visitors who send Global Privacy Control or Do Not Track. | No analytics, no cookies. |

A form only appears when what it collects has somewhere to go. Nothing a visitor sends can land where nobody reads it.

### Find the Eventbrite organization id

```
curl -H "Authorization: Bearer YOUR_TOKEN" https://www.eventbriteapi.com/v3/users/me/organizations/
```

Use the `id` of the organization that owns the Issues. Endpoints used: `GET /v3/organizations/{id}/events/` and `GET /v3/events/{id}/structured_content/` ([Eventbrite docs](https://www.eventbrite.co/platform/docs/events)). The site only reads.

### What a webhook receives

A JSON `POST`. Anything that accepts one works: a list tool, an automation, a spreadsheet script.

```json
{ "type": "subscribe", "email": "…", "consent": "Asked to be emailed when new WPG AI Incubator Issue dates are announced.", "submittedAt": "2026-11-13T15:00:00.000Z", "site": "https://www.wpgincubator.ai", "text": "New Issue alerts: …" }
{ "type": "apply", "kind": "talk", "kindLabel": "Give a spotlight talk", "name": "…", "email": "…", "about": "…", "link": "…", "submittedAt": "…", "site": "…", "text": "one-line summary" }
```

If the webhook does not answer with a 2xx status, the visitor is told it did not save. The site records the consent wording with each sign-up. Canada's anti-spam law expects emails to a list to say who they are from and how to unsubscribe; check the details with whoever advises you.

## Changing what the site says

| To change | Edit | Then |
|---|---|---|
| The next Issue, with Eventbrite connected | Eventbrite. Title like `WPG AI Incubator - Issue #14: Subtitle`; agenda as lines starting with a time (`6:30 PM – Spotlight talk with Name (about 45 min)`). | Nothing. It shows up within 15 minutes. |
| The cover line for an Issue, an archive blurb, or an Issue with no Eventbrite page | `content/issues.json` | Restart |
| The next Issue, without Eventbrite | `content/issues.json` (add the Issue with `start`, `end`, `url`, `schedule`) | Restart |
| Organizers, contact email, social links, venue, usual hours | `content/site.json` | Restart |
| Header badge, organizer photos | Drop files into `public/brand/` (see the README there) | Restart |
| Page copy | `src/render/home.js`, `src/render/pages.js` | Restart |
| Link preview image, icons | `scripts/build-images.mjs`, then `npm run build:images` | |

How the next Issue is chosen: the soonest Issue that has not ended. When it ends, the page switches by itself to "Next date to be announced" until another is published. With Eventbrite connected, Eventbrite is the only authority on future Issues: one that is cancelled there disappears here. If Eventbrite is unreachable the last good answer is used for up to a day, then `content/issues.json`.

Keep cover lines (`hook`) under about 45 characters. Longer ones shrink to fit.

Times: Manitoba has been on UTC-5 all year since November 1, 2026 ([gov.mb.ca/timechange](https://www.gov.mb.ca/timechange/)). The site uses that fixed offset (`utcOffset` in `content/site.json`) and the wall-clock time from Eventbrite, so it shows the right hour even on a server with out-of-date time zone data.

## Find your room

- The four tap-to-try answers are fixed copy in `src/findroom.js`. They never call the API.
- Typed text goes to the Claude Messages API (`POST /v1/messages`, [reference](https://platform.claude.com/docs/en/api/messages/create)) with a JSON schema for the reply ([structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)). The reply is checked on the server (known room, length, no links, no markup) before a visitor sees it.
- If the API is slow (8 seconds), down, refuses, returns something unusable, or the daily cap is reached, the visitor gets a keyword match with a note that says so. They never see an error for it.
- Limits per visitor: 6 typed tries a minute, 40 a day. At most 500 characters are read.
- Cost: one short request per typed try, a fraction of a cent at [Haiku 5.5 prices](https://platform.claude.com/docs/en/models/haiku-5-5/overview). The daily cap bounds the worst case.
- Privacy: what a visitor types is sent to the API for that one reply and is never written to a log, a file or an error message. The tests check this. `/privacy` states what the running configuration actually does.

## Tests

```
npm test               # 109 server tests, about 8 seconds, needs nothing installed
npm install            # test tools only (Playwright, axe-core, html-validate)
npm run test:browser   # 39 checks in real Chrome, about 3 minutes
```

The browser tests need Chrome: set `CHROME_PATH`, or run `npx playwright install chromium`. Screenshots and a JSON report land in `test/browser/out/`.

All tests run against stand-ins for Eventbrite, the Claude API and the webhook (`test/helpers/mocks.js`) that speak the documented wire formats. Nothing in the test suite contacts a real service. See `TEST-REPORT.md` for what was run and what could not be.

To see the site in any state without keys:

```
node scripts/preview.mjs --forms --ai --eventbrite     # everything on, with stand-ins
node scripts/preview.mjs --date 2026-11-27             # the day after Issue #13
```

## Deploying

Any host that runs a long-lived Node process works. There is nothing to build.

- Start command: `npm start` (or `node server.js`). Health check: `GET /healthz`.
- Or use the `Dockerfile` (it was written but not built in the workspace this was made in, which had no Docker daemon).
- Put it behind HTTPS. The app sends HSTS only when the proxy reports HTTPS.
- One process is enough. Rate limits and the Eventbrite cache live in memory, so running several copies makes the limits looser, nothing worse.
- If people see "That's a lot of tries in a row" on their first try, `TRUST_PROXY` is too low: the app is counting a proxy's address as one visitor. A CDN in front of the host usually means `2`.
- Logs go to stdout: one line per request (method, path, status, time) and warnings. No IP addresses, no query strings, nothing a visitor typed.

## Moving the domain

1. Deploy to the new host and open it on the host's temporary address. Check: the home page shows the same Issue as Eventbrite; a typed Find your room answer says "Written by AI"; a test sign-up and a test application arrive where you expect; "Add to calendar" opens at the right time.
2. Export the email sign-ups from the current site before switching. This build starts with an empty list.
3. Add both `wpgincubator.ai` and `www.wpgincubator.ai` to the new host so it issues certificates for both. Set `SITE_URL` to the one you want people to see; the site redirects the other.
4. Change only the web records in DNS (the `A`/`CNAME` records for the bare domain and `www`). Leave `MX` and `TXT` alone or hello@wpgincubator.ai stops receiving mail.
5. Remove the domain from the old Vercel project once traffic has moved, and keep that project for a week. Rolling back is pointing DNS at it again.
6. Afterwards: load `https://wpgincubator.ai` and `http://www.wpgincubator.ai` and confirm both end at `SITE_URL`; check `/robots.txt` and `/sitemap.xml`; paste the address into a chat app to see the link preview.

Links to the old page's sections (`/#join`, `/#events`, `/#showcase`, `/#resources`, `/#about`) land on the matching new sections.

## Not carried over from the old site

- The admin editor and dashboard. Content is two JSON files; with Eventbrite connected most changes need no edit at all.
- The Eventbrite pop-up checkout. "Register" is a plain link to the Issue's Eventbrite page.
- The spots counter. The brand kit says to skip capacity-pressure lines.
- The member directory and showcase placeholders, which were empty.

## Still needed from the team

- The approved skyline badge file, for the header (`public/brand/badge.svg`). Until then the header shows the name alone.
- Organizer photos (`public/brand/organizers/`). Until then, initials.
- The LinkedIn page address (`content/site.json`). The link is hidden until it is filled in. The Instagram link was built from the handle in the brand kit; open it once to confirm.
- A read of the copy this build added: the no-Issue state, the notes under Find your room answers, form labels and confirmations, the privacy page, the not-found page. All of it is in `src/render/` and `src/view.js`. The privacy page describes what the code does; it has not had a legal review.

## Layout

```
server.js              entry point
src/app.js             routes, headers, static files
src/issues.js          which Issues exist and which is next (Eventbrite + content file)
src/eventbrite.js      Eventbrite API client
src/schedule.js        reads an agenda out of an Eventbrite description
src/findroom.js        Find your room: prompt, API call, reply checks, keyword rules
src/forms.js           form validation and delivery
src/view.js            every decision about wording, from Issues and settings
src/render/            HTML templates
src/dates.js           Winnipeg time
content/               site.json, issues.json
public/                css, js, fonts (SIL OFL, licences included), images
test/                  unit, integration, browser
scripts/               preview, screenshots, link-preview image
```
