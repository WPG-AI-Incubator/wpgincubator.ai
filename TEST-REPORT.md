# Test report

Run on November 13, 2026, on the finished code in this folder.
Node 22.23.4 on Linux. Chrome 153.0.8010.12. Playwright 1.65.0, axe-core 4.14.0, html-validate 9.7.1, Lighthouse 13.6.0.

## Result

| Suite | Result | How to run it |
|---|---|---|
| Server tests (unit and end-to-end) | 109 of 109 pass | `npm test` |
| Browser checks in real Chrome | 39 of 39 pass | `npm run test:browser` |
| Lighthouse, 4 pages, phone and desktop profiles | 100 in every category on all 8 runs | see below |

## What the server tests cover (109)

- **Issues.** Which Issue is next, minute by minute around an Issue's end. The switch to "Next date to be announced". Several future Issues. Eventbrite facts winning over the content file while the content file keeps its cover line. An Issue cancelled on Eventbrite disappearing. Events on the same Eventbrite account that are not Issues being left out. Archive paging.
- **Eventbrite trouble.** Down at start-up, down later, wrong token, wrong organization, a title filter that matches nothing, an agenda request that fails, a server that never answers. In every case the page still loads with saved data; the last good answer is kept for a day; nobody waits more than about 4 seconds, and only the first visitors after a start can wait at all.
- **Agenda reading.** The line formats organizers use, including the `8:45 9:00 PM – Wrap` line the current site produces, bullets, ranges, daytime events, HTML from Eventbrite, and prose that must not be mistaken for an agenda.
- **Time.** Winnipeg wall-clock time at UTC-5 all year. A test feeds the site an Eventbrite time converted with the old fall-back rule and checks the page still says 6:00 PM.
- **Find your room.** The exact request sent to the Messages API (headers, model, schema, no temperature). Eleven ways the API can fail (errors, overload, bad key, garbage, prose instead of JSON, an unknown room, a link in the reply, a refusal, a timeout), each ending in a keyword reply and never an error. The retry without `output_config` on a 400. The daily cap. Rate limits per visitor. Requests from other sites refused. Oversized and malformed bodies.
- **Privacy promise.** A marked sentence is typed through every path, success and failure, with and without JavaScript, and every log line is searched for it. Email addresses, names, the Eventbrite token and query strings are searched for the same way.
- **Forms.** Validation, the hidden trap field, delivery to a webhook and to a file, what the visitor is told when delivery fails, values kept and escaped when a form comes back with errors, rate limits.
- **The site itself.** Every page type, security headers on every response, caching and 304s, brotli and gzip, HEAD, static files and eleven attempts to read files outside `public/`, 404, 405, redirects for the bare domain and plain http, robots, sitemap, calendar file, JSON for the next Issue, structured data, analytics on and off, a malformed request line, and an internal failure whose details stay out of the response and the log.

## What the browser checks cover (39)

- **Layout at 14 widths from 320 to 1920px**, in three states (no settings, everything on, no Issue announced), plus deliberately awkward content (very long names, titles, agenda lines and cover line), the privacy page, the form page and the not-found page. At every width: no sideways scrolling, no text leaving the page, nothing cut off inside a box, every tap target at least 44px in both directions, one `h1`, no skipped heading levels, all fonts and images loaded, no console errors, nothing blocked by the content security policy.
- "Nothing cut off" is checked on pixels: the page is photographed, every clipping box is allowed to overflow, and it is photographed again. A self-test cuts a word off on purpose and confirms the check notices.
- **First screen.** The main button's bottom edge sits at 658px on a 1440x900 screen, 613px at 1280x720, 519px at 390x844, 536px at 360x740 and 551px at 320x568 (up to 6px lower when no Issue is announced).
- **Text at 200%** causes no sideways scrolling and cuts nothing off.
- **Find your room.** Examples swap the answer without contacting the server. A typed sentence shows a busy state, then the reply. An empty box asks for a sentence. Two fast clicks send one request. Ctrl+Enter sends. Too many tries, a server error and a lost connection each get a plain message and the button comes back. The real limit trips after six tries. Markup typed by a visitor is displayed as text and does not run. On a phone the answer is scrolled into view.
- **Keyboard only.** Skip link, a visible 3px focus ring on every stop, the full Find your room flow with Tab, Enter and Space.
- **Newsletter.** Saved and confirmed in place with focus moved to the confirmation; failure reported with the form and the typed address kept.
- **JavaScript off.** Find your room (examples and typed), the newsletter, the application form with errors and success, and the earlier-Issues list all work as plain pages.
- **Analytics.** Requested for an ordinary visitor; not requested for one sending Global Privacy Control or Do Not Track.
- **Old links.** `/#join`, `/#events`, `/#showcase`, `/#resources` and `/#about` land on the matching sections, clear of the sticky header.
- **Reduced motion** is respected.
- **Accessibility scan** (axe-core, WCAG 2.0, 2.1 and 2.2 A and AA plus best practices) on 10 page states: 0 violations.
- **HTML validity** (html-validate, recommended rules) on 9 page types: 0 errors.

## Contrast

The scan cannot judge text that sits over a texture or has an outline, and set those aside (19 items at 1440px, 24 at 390px). Each was computed against its solid background. All meet their requirement (lowest: 6.54:1 for ink on orange) except one by the numbers: the outlined headline "A room for the curious." is cream on orange, 2.63:1 against a 3:1 requirement for large text. It is separated from the orange by a thick ink outline, and cream on that outline is 17.23:1. This is the brand kit's headline treatment and is the only place it is used.

## Speed (Lighthouse 13.6.0, local server)

| Page | Profile | Performance | Accessibility | Best practices | SEO | First paint | Largest paint | Layout shift | Transfer |
|---|---|---|---|---|---|---|---|---|---|
| Home, no settings | phone | 100 | 100 | 100 | 100 | 0.8 s | 1.6 s | 0 | 105 KiB |
| Home, no settings | desktop | 100 | 100 | 100 | 100 | 0.2 s | 0.4 s | 0 | 109 KiB |
| Home, everything on | phone | 100 | 100 | 100 | 100 | 0.8 s | 1.6 s | 0 | 105 KiB |
| Home, everything on | desktop | 100 | 100 | 100 | 100 | 0.2 s | 0.4 s | 0 | 109 KiB |
| Take the stage | phone | 100 | 100 | 100 | 100 | 0.8 s | 0.8 s | 0 | 90 KiB |
| Take the stage | desktop | 100 | 100 | 100 | 100 | 0.2 s | 0.2 s | 0 | 90 KiB |
| Privacy | phone | 100 | 100 | 100 | 100 | 0.8 s | 0.8 s | 0 | 90 KiB |
| Privacy | desktop | 100 | 100 | 100 | 100 | 0.2 s | 0.2 s | 0 | 90 KiB |

The phone profile simulates a slow 4G connection and a mid-range phone. The server was on the same machine, so real numbers will add the distance to your host. Lighthouse's newer "agentic browsing" category also scored 100.

A load check on one process: about 2,300 compressed home pages a second, median 18 ms with 50 requests in flight; 9,000 requests, none failed.

## What testing found and fixed

- Winnipeg time. The server's time zone data reflects Manitoba's move to UTC-5 all year, but a host with older data would have shown Issue times an hour off. The site now uses the wall-clock time and a fixed offset.
- A slow Eventbrite made every first visitor in a minute wait. Now only the first visitors after a start can wait, once.
- The speaker's name was read with trailing words attached ("Tad Einstein About 45 min").
- On 320 and 360px phones the headline wrapped to three lines and pushed the main button off the first screen.
- A long button label overflowed its frame on phones when no Issue is announced.
- Four link labels for screen readers did not contain their visible text.
- Two navigation regions had the same name.
- A missing space in "Also on the calendar" entries.
- The Find my room button could still read "Finding your room…" for an instant after an error message appeared.

## Not exercised here

No keys were available and the workspace could only reach package registries, so these were tested against stand-ins that follow the published formats, not against the real thing:

- **Eventbrite's live API.** In particular the exact wording of the agenda in your event descriptions, which the reader has only seen as the current site reports it.
- **The Claude API.** The request shape follows the reference; whether replies read well in your voice needs real replies. If the API rejects the `output_config` field for your account, the code retries without it.
- **Your webhook destination**, and email delivery after it.
- **Google Analytics** beyond "the script is requested and the content policy allows it".

Also not done:

- **Safari and Firefox.** Their engines could not be downloaded here. Everything was run in Chrome only. The headline's outline uses `-webkit-text-stroke` with `paint-order`, which is the first thing to look at in Safari.
- **Real phones and a screen reader pass by a person.** The automated scan and keyboard run are not a substitute.
- **The Dockerfile build** (no Docker daemon here) and **Node 20** (only Node 22 was installed).
- **A legal read of the privacy page.**
- **The cover line** "The Slurpee Capital gets a brain freeze." is carried over from the approved mockup. The other Issue #13 facts were re-read from the current site's own data today; that line was not among them, so check it against the Issue #13 artwork.
