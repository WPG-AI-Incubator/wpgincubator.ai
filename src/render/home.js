// The home page, section by section, in the order a visitor reads it.

import { html, jsonForHtml, raw } from '../html.js';

function tone(assets, file, className, width, height, lazy = true) {
  return html`<img class="${className}" src="${assets.url(`/img/${file}`)}" alt="" width="${width}" height="${height}"${lazy ? raw(' loading="lazy"') : ''} decoding="async">`;
}

function cover(model, assets) {
  const { upcoming: next, site } = model;
  const hook = next ? next.hook : 'To be continued…';
  const size = hook.length > 60 ? ' cover__hook--sm' : hook.length > 42 ? ' cover__hook--md' : '';
  const number = next ? next.number : model.nextNumber;
  let spot = '';
  if (!next) spot = html`<p class="cover__spot">Date to be<br>announced</p>`;
  else if (next.spotlight) spot = html`<p class="cover__spot">Spotlight:<br>${next.spotlight}</p>`;
  return html`<figure class="cover" aria-label="${next ? `${next.name} cover` : 'Next Issue cover'}">
${tone(assets, 'halftone-burst-ink.svg', 'cover__burst', 900, 900, false)}
<div class="cover__card">
<div class="cover__art">
${tone(assets, 'halftone-band-orange.svg', 'cover__band', 720, 300, false)}
<div class="cover__mast"><span>${site.name}</span><span>${next ? next.coverDate : site.venue.city}</span></div>
<div class="cover__body">
<div class="cover__top">
${number !== null ? html`<div class="cover__no"><span class="cover__no-label">Issue</span><span class="cover__no-num">${number}</span></div>` : ''}
${spot}
</div>
<p class="cover__hook${size}">${hook}</p>
<p class="cover__caption">Meanwhile, at ${next ? next.address : site.venue.address}…</p>
</div>
</div>
</div>
</figure>`;
}

function hero(model, assets) {
  const { upcoming: next, cta, site } = model;
  const facts = next
    ? html`<p class="hero__facts"><strong><time datetime="${next.datetime}">${next.when}</time></strong>${next.place}${next.free ? ' Free to attend.' : ''}</p>`
    : html`<p class="hero__facts"><strong>Next date to be announced.</strong>Issues run from ${site.usualHours} at ${site.venue.address}, ${site.venue.city}.</p>`;
  return html`<section class="hero" aria-labelledby="hero-title">
<div class="hero__frame">
<div class="hero__cols">
<div class="hero__copy">
<h1 id="hero-title" class="hero__title cover-title">A room for the curious.</h1>
<p class="hero__lead">${site.intro}</p>
<div id="next-issue" class="hero__cta">
<a class="btn btn--ink btn--lg pop-cream" href="${cta.href}">${cta.label}</a>
${facts}
</div>
</div>
${cover(model, assets)}
</div>
<div class="hero__foot"><span>${site.roots}</span><span>${site.tagline}</span></div>
</div>
</section>`;
}

// One reply card. The page script fills the same elements in place, so the
// markup exists exactly once.
export function replyCard(reply, cta) {
  return html`<div class="reply" data-card>
<p class="reply__said">You said: “<span data-slot="said">${reply.said}</span>”</p>
<div class="reply__band reply__band--${reply.room}" data-slot="band"><p class="reply__word" data-slot="word">${reply.word}</p></div>
<p class="reply__line" data-slot="line">${reply.line}</p>
<p class="reply__why" data-slot="why">${reply.why}</p>
<div class="reply__bring">
<p class="reply__bring-label">Bring this question</p>
<p class="reply__bring-q" data-slot="bring">${reply.bring}</p>
</div>
<a class="btn btn--ink pop-orange reply__cta" href="${cta.href}">${cta.label}</a>
<p class="reply__note" data-slot="note">${reply.note}</p>
</div>`;
}

function finder(model) {
  const { finder: f, cta } = model;
  return html`<div id="find-your-room" class="finder" data-finder data-examples="${jsonForHtml(f.examples)}" data-busy="Finding your room…" data-empty="Type a sentence or tap an example. Your room shows up here." data-failed="That didn't go through. Check your connection and try again.">
<div class="finder__bar">
<h3 class="finder__title">Find your room</h3>
<span class="finder__mode">${f.mode}</span>
</div>
<div class="finder__body">
<form class="finder__ask" method="post" action="/find-your-room">
<label class="finder__label" for="room-input">What are you working on?</label>
<p class="finder__help" id="room-help">A sentence or two is plenty. "Just curious" is a fine answer.</p>
<textarea class="field" id="room-input" name="text" rows="3" maxlength="500" aria-describedby="room-help room-promise" placeholder="For example: a tool that reads our invoices and flags the odd ones"></textarea>
<div class="finder__go">
<button type="submit" class="btn btn--orange pop-ink" data-find>Find my room</button>
<span class="finder__promise" id="room-promise">What you type is used for this answer only.</span>
<a class="tl link-row" href="/privacy#find-your-room">Privacy</a>
</div>
<div class="finder__chips">
<p class="finder__chips-label" id="chips-label">Or tap one</p>
<div class="chips" role="group" aria-labelledby="chips-label">
${Object.entries(f.examples).map(
  ([key, example]) =>
    html`<button type="submit" class="chip" name="example" value="${key}" data-example="${key}" aria-pressed="${key === f.defaultKey ? 'true' : 'false'}">${example.said}</button>`,
)}
</div>
</div>
</form>
<div class="finder__reply" data-reply aria-live="polite" aria-atomic="true">
${replyCard(f.examples[f.defaultKey], cta)}
<p class="finder__msg" data-msg hidden></p>
</div>
</div>
</div>`;
}

function who(model) {
  return html`<section class="who" aria-labelledby="who-title">
<div class="wrap">
<div class="who__head">
<h2 id="who-title" class="h2">No AI job title required.</h2>
<p class="who__lead">Builders, business leaders, educators, students, founders and anyone who wants to learn or contribute. You do not need an AI job title to belong in the room.</p>
</div>
${finder(model)}
</div>
</section>`;
}

function what(model, assets) {
  const { what: w, cta, upcoming: next } = model;
  const rows = w.rows.map((row) => {
    const mark = w.timed
      ? html`<time class="show__time" datetime="${row.datetime}">${row.mark}</time>`
      : html`<span class="show__time">${row.mark}</span>`;
    const lead = row.strong ? html`<strong>${row.strong}</strong>${row.text ? ' ' : ''}` : '';
    return html`<li class="show__row">${mark}<span class="show__what">${lead}${row.text}${row.until ? `, until ${row.until}` : ''}</span></li>`;
  });
  return html`<section id="what-happens" class="what on-ink" aria-labelledby="what-title">
${tone(assets, 'halftone-corner-orange.svg', 'what__tone', 640, 640)}
<div class="wrap">
<h2 id="what-title" class="h2">One evening. Three rooms.</h2>
<p class="what__lead">${w.lead}</p>
<div class="what__cols">
<div class="show">
<h3 class="show__title">${w.title}</h3>
<ol class="show__list">
${rows}
</ol>
<div class="show__actions">
<a class="btn btn--orange-on-ink btn--md pop-cream" href="${cta.href}">${cta.label}</a>
${next && !next.dateOnly ? html`<a class="tl link-row link-row--strong" href="/next-issue.ics">Add to calendar</a>` : ''}
</div>
</div>
<div class="rooms">
<article class="room room--dream">
${tone(assets, 'halftone-corner-ink.svg', 'room__tone', 640, 640)}
<h3 class="room__word">Dream.</h3>
<p class="room__line">Explore an idea.<br>Ask a better question.</p>
</article>
<article class="room room--build">
${tone(assets, 'halftone-corner-ink.svg', 'room__tone', 640, 640)}
<h3 class="room__word">Build.</h3>
<p class="room__line">Try a tool.<br>Work on something real.</p>
</article>
<article class="room room--execute">
${tone(assets, 'halftone-corner-ink.svg', 'room__tone', 640, 640)}
<h3 class="room__word">Execute.</h3>
<p class="room__line">Share progress.<br>Take the next step.</p>
</article>
</div>
</div>
</div>
</section>`;
}

function backIssues(model, assets) {
  const { recent, earlier, site } = model;
  const cards = recent.map(
    (issue) => html`<li>
<div class="issue__cover issue__cover--${issue.tone}" aria-hidden="true">
${tone(assets, issue.tone === 'orange' ? 'halftone-corner-ink.svg' : 'halftone-corner-orange.svg', 'issue__tone', 640, 640)}
<span class="issue__mast">${site.name}</span>
<span class="issue__no">${issue.mark}</span>
</div>
<h3 class="issue__name">${issue.name}</h3>
<p class="issue__meta"><time datetime="${issue.datetime}">${issue.date}</time>${issue.blurb ? `. ${issue.blurb}` : ''}</p>
${issue.url ? html`<a class="tl issue__link" href="${issue.url}" rel="noopener" aria-label="${issue.linkLabel}">Eventbrite page</a>` : ''}
</li>`,
  );
  const older = earlier
    ? html`<details class="earlier">
<summary class="earlier__summary">${earlier.summary}<span class="earlier__toggle" aria-hidden="true"><span class="when-closed">Show</span><span class="when-open">Hide</span></span></summary>
<ol class="earlier__list">
${earlier.items.map(
  (item) => html`<li class="earlier__row"><span class="earlier__no">${item.mark}</span><span class="earlier__title">${item.url ? html`<a class="tl" href="${item.url}" rel="noopener">${item.title}</a>` : item.title}</span><time class="earlier__date" datetime="${item.datetime}">${item.date}</time></li>`,
)}
</ol>
</details>`
    : '';
  return html`<section id="back-issues" class="back" aria-labelledby="back-title">
<div class="wrap">
<div class="back__head">
<div>
<p class="caption caption--boxed">Previously…</p>
<h2 id="back-title" class="h2">Back issues.</h2>
</div>
<a class="tl back__all" href="${site.eventbriteOrganizerUrl}" rel="noopener">All Issues on Eventbrite</a>
</div>
<ul class="issues">
${cards}
</ul>
${older}
</div>
</section>`;
}

function stage(model, assets) {
  const { flags, site } = model;
  const mail = (subject) => `mailto:${site.contactEmail}?subject=${encodeURIComponent(subject)}`;
  const talk = flags.applyEnabled ? '/apply?kind=talk' : mail('Spotlight talk');
  const show = flags.applyEnabled ? '/apply?kind=show' : mail('AI Show & Tell');
  return html`<section id="take-the-stage" class="stage" aria-labelledby="stage-title">
${tone(assets, 'halftone-corner-ink.svg', 'stage__tone', 640, 640)}
<div class="wrap stage__cols">
<div class="stage__copy">
<h2 id="stage-title" class="h2">Bring the thing you're building.</h2>
<p class="stage__lead">You don't need to be a famous founder. If you're building something interesting, solving real problems, or have lessons that could help someone take their next step, we'd love to have you on stage.</p>
</div>
<div class="stage__ways">
<article class="way">
<h3 class="way__title">Give a spotlight talk</h3>
<p class="way__text">About 45 minutes, plus a short Q&amp;A with the room.</p>
<a class="btn btn--ghost" href="${talk}">Apply to speak</a>
</article>
<article class="way">
<h3 class="way__title">Show your work</h3>
<p class="way__text">Demo what you're building at AI Show &amp; Tell and get feedback from the room. As builders ship, their projects get the spotlight here.</p>
<a class="btn btn--ghost" href="${show}">Ask to be featured</a>
</article>
</div>
</div>
</section>`;
}

function newsletter(model) {
  const { flags, site, later } = model;
  const body = flags.subscribeEnabled
    ? html`<p class="news__lead">Leave your email and we'll tell you the moment the next date is live.</p>
<form class="news__form" method="post" action="/subscribe" data-subscribe data-busy="Saving…" data-failed="That didn't go through. Check your connection and try again.">
<div class="news__field">
<label class="news__label" for="nl-email">Email address</label>
<input class="field" id="nl-email" name="email" type="email" required maxlength="254" autocomplete="email" placeholder="you@example.com" aria-describedby="nl-fine">
</div>
<div class="hp" aria-hidden="true"><label for="nl-website">Leave this field empty</label><input id="nl-website" name="website" type="text" tabindex="-1" autocomplete="off"></div>
<button type="submit" class="btn btn--orange-on-ink btn--md pop-cream">Notify me</button>
</form>
<p class="form-error" data-status role="alert" hidden></p>
<p class="news__fine" id="nl-fine">We only use it to announce new Issues. Ask us to take you off the list any time.</p>
<a class="tl news__more" href="${site.eventbriteOrganizerUrl}" rel="noopener">See new dates on Eventbrite</a>`
    : html`<p class="news__lead">New Issues are announced on Eventbrite. Follow the organizer page there and you'll hear about the next date.</p>
<a class="btn btn--orange-on-ink btn--md pop-cream" href="${site.eventbriteOrganizerUrl}" rel="noopener">Follow on Eventbrite</a>`;
  const more = later.length
    ? html`<div class="news__later">
<h3 class="news__later-title">Also on the calendar</h3>
<ul class="news__later-list">
${later.map(
  (issue) =>
    html`<li>${issue.url ? html`<a class="tl link-row" href="${issue.url}" rel="noopener"><span>${issue.name}, <time datetime="${issue.datetime}">${issue.when}</time></span></a>` : html`<span class="link-row"><span>${issue.name}, <time datetime="${issue.datetime}">${issue.when}</time></span></span>`}</li>`,
)}
</ul>
</div>`
    : '';
  return html`<section id="newsletter" class="news on-ink" aria-labelledby="news-title">
<div class="wrap news__cols">
<div class="news__head">
<p class="caption">To be continued…</p>
<h2 id="news-title" class="h2">Never miss an Issue.</h2>
</div>
<div class="news__body">
${body}
${more}
</div>
</div>
</section>`;
}

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .filter((ch, index, all) => index === 0 || index === all.length - 1)
    .join('')
    .toUpperCase();
}

function about(model, assets) {
  const { site } = model;
  const people = site.organizers.map((person) => {
    const photo = assets.organizerPhoto(person.name);
    const tile = photo
      ? html`<img class="person__photo" src="${assets.url(photo)}" alt="Portrait of ${person.name}" width="400" height="400" loading="lazy" decoding="async">`
      : html`<div class="person__tile" aria-hidden="true">
${tone(assets, 'halftone-corner-orange.svg', 'person__tone', 640, 640)}
<span class="person__initials">${person.initials || initials(person.name)}</span>
</div>`;
    return html`<li>
${tile}
<p class="person__name">${person.name}</p>
</li>`;
  });
  return html`<section id="about" class="about" aria-labelledby="about-title">
<div class="wrap about__cols">
<div class="about__copy">
<h2 id="about-title" class="h2">Built in Winnipeg, for Winnipeg.</h2>
<p class="about__text">WPG AI Incubator started in April 2026 with a simple idea: give Winnipeg's AI builders a regular room to dream, build and execute together. What began as a launch night at 158 Commerce Drive has become a ritual every two weeks, hands-on and open to everyone.</p>
<p class="about__rule">One rule: show your work and help the next person ship.</p>
</div>
<div class="about__people">
<h3 class="about__people-title">Organizers</h3>
<ul class="people">
${people}
</ul>
</div>
</div>
</section>`;
}

// Links shared before this redesign pointed at the old page's sections
// (wpgincubator.ai/#join, #events, ...). These empty markers keep them landing
// in the right place.
const oldLink = (id) => html`<div id="${id}" class="old-link"></div>`;

export function homeMain(model, assets) {
  return html`${hero(model, assets)}
${who(model)}
${oldLink('resources')}
${what(model, assets)}
${oldLink('events')}
${backIssues(model, assets)}
${oldLink('showcase')}
${stage(model, assets)}
${oldLink('join')}
${newsletter(model)}
${about(model, assets)}`;
}
