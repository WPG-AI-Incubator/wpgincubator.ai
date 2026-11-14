// Inner pages: privacy, the take-the-stage form, the no-JavaScript result
// page for Find your room, and short message pages (thanks, errors).

import { html } from '../html.js';
import { APPLY_KINDS } from '../forms.js';
import { replyCard } from './home.js';

export const PRIVACY_UPDATED = 'November 13, 2026';

export function privacyMain(model) {
  const { site, flags } = model;
  const mail = html`<a href="mailto:${site.contactEmail}">${site.contactEmail}</a>`;
  return html`<section class="sub" aria-labelledby="page-title">
<div class="wrap wrap--narrow">
<h1 id="page-title" class="sub__title">Privacy, in plain words.</h1>
<p class="sub__lead">This site collects as little as it can. Here is all of it.</p>
<div class="prose">
<h2 id="find-your-room">Find your room</h2>
${flags.aiEnabled
  ? html`<p>What you type is used to write your answer and for nothing else. To write it, our server sends your text to Anthropic, the company that makes the AI model we use. We do not save it, log it, or connect it to your name, email or device. Anthropic handles it under its own terms and privacy policy.</p>
<p>The four tap-to-try answers are fixed examples. Tapping one sends nothing to the AI.</p>`
  : html`<p>What you type is used to pick your answer and for nothing else. It is matched against a short list of keywords on our server. We do not save it, log it, or connect it to your name, email or device.</p>`}
<h2>Email</h2>
${flags.subscribeEnabled
  ? html`<p>If you ask for Issue alerts, we keep your email address so we can tell you when a new date is announced. That is the only thing we use it for. To be taken off the list, write to ${mail}.</p>`
  : html`<p>This site does not collect email addresses for a mailing list. If you write to ${mail}, we use your address to reply.</p>`}
${flags.applyEnabled
  ? html`<p>If you apply to give a talk or show your work, the organizers receive your name, your email address and what you wrote, and use them to reply to you.</p>`
  : ''}
<h2>Registering for an Issue</h2>
<p>Registration happens on Eventbrite. What you enter there is collected by Eventbrite under its own privacy policy.</p>
<h2>Analytics and cookies</h2>
${flags.gaEnabled
  ? html`<p>We use Google Analytics to count visits and see which pages people read. It sets cookies. If your browser sends a Global Privacy Control or Do Not Track signal, we do not load it.</p>`
  : html`<p>This site does not use analytics, advertising or tracking cookies.</p>`}
<h2>Server records</h2>
<p>The site's own log records the time, the page asked for and whether it worked. It does not record your IP address or anything you type. To stop abuse, the server counts requests per IP address in memory for up to a day; that count is never written to disk. Our hosting provider may keep its own standard connection logs.</p>
<h2>Questions</h2>
<p>Write to ${mail}.</p>
<p class="prose__date">Last updated ${PRIVACY_UPDATED}.</p>
</div>
</div>
</section>`;
}

function fieldError(errors, name) {
  return errors[name] ? html`<p class="form-error" id="err-${name}">${errors[name]}</p>` : '';
}

function invalid(errors, name) {
  return errors[name] ? html` aria-invalid="true"` : '';
}

function describedBy(errors, name, hintId = '') {
  const ids = [hintId, errors[name] ? `err-${name}` : ''].filter(Boolean).join(' ');
  return ids ? html` aria-describedby="${ids}"` : '';
}

export function applyMain(model, { values = {}, errors = {}, failed = false } = {}) {
  const { site } = model;
  const kind = Object.hasOwn(APPLY_KINDS, values.kind) ? values.kind : '';
  const hasErrors = Object.keys(errors).length > 0;
  return html`<section class="sub" aria-labelledby="page-title">
<div class="wrap wrap--narrow">
<h1 id="page-title" class="sub__title">Take the stage.</h1>
<p class="sub__lead">Tell us what you're building. An organizer will reply by email.</p>
<form class="form" method="post" action="/apply" novalidate>
${failed ? html`<p class="form__summary" role="alert">That didn't send. Something went wrong on our side, so nothing was saved. Try again in a minute, or write to ${site.contactEmail}.</p>` : ''}
${hasErrors ? html`<p class="form__summary" role="alert">Almost there. Check the fields marked below.</p>` : ''}
<fieldset class="form__set"${errors.kind ? html` aria-describedby="err-kind"` : ''}>
<legend>What would you like to do?</legend>
<label class="choice"><input type="radio" name="kind" value="talk"${kind === 'talk' ? html` checked` : ''}><span class="choice__text">Give a spotlight talk<span class="choice__hint">About 45 minutes, plus a short Q&amp;A with the room.</span></span></label>
<label class="choice"><input type="radio" name="kind" value="show"${kind === 'show' ? html` checked` : ''}><span class="choice__text">Show your work at AI Show &amp; Tell<span class="choice__hint">Demo what you're building and get feedback from the room.</span></span></label>
${fieldError(errors, 'kind')}
</fieldset>
<div class="form__row">
<label class="form__label" for="apply-name">Your name</label>
<input class="field" id="apply-name" name="name" type="text" maxlength="100" autocomplete="name" value="${values.name ?? ''}"${invalid(errors, 'name')}${describedBy(errors, 'name')}>
${fieldError(errors, 'name')}
</div>
<div class="form__row">
<label class="form__label" for="apply-email">Email address</label>
<p class="form__hint" id="hint-email">We reply here.</p>
<input class="field" id="apply-email" name="email" type="email" maxlength="254" autocomplete="email" value="${values.email ?? ''}"${invalid(errors, 'email')}${describedBy(errors, 'email', 'hint-email')}>
${fieldError(errors, 'email')}
</div>
<div class="form__row">
<label class="form__label" for="apply-about">What are you building?</label>
<p class="form__hint" id="hint-about">A few sentences is plenty: what it is, who it's for and where it's at.</p>
<textarea class="field" id="apply-about" name="about" rows="6" maxlength="1500"${invalid(errors, 'about')}${describedBy(errors, 'about', 'hint-about')}>${values.about ?? ''}</textarea>
${fieldError(errors, 'about')}
</div>
<div class="form__row">
<label class="form__label" for="apply-link">A link, if you have one</label>
<p class="form__hint" id="hint-link">A site, a repo, a demo video. Leave it empty if there isn't one yet.</p>
<input class="field" id="apply-link" name="link" type="text" inputmode="url" maxlength="300" autocomplete="url" value="${values.link ?? ''}"${invalid(errors, 'link')}${describedBy(errors, 'link', 'hint-link')}>
${fieldError(errors, 'link')}
</div>
<div class="hp" aria-hidden="true"><label for="apply-website">Leave this field empty</label><input id="apply-website" name="website" type="text" tabindex="-1" autocomplete="off"></div>
<div class="form__actions">
<button type="submit" class="btn btn--orange pop-ink">Send to the organizers</button>
<a class="tl sub__back" href="/#take-the-stage">Back to the home page</a>
</div>
<p class="form__fine">The organizers see what you send and use it to reply to you. <a class="tl" href="/privacy">Privacy</a></p>
</form>
</div>
</section>`;
}

// A short page with a headline, a sentence and one or two ways onward.
export function messageMain({ title, lead, primary = null, back = null }) {
  return html`<section class="sub" aria-labelledby="page-title">
<div class="wrap wrap--narrow">
<h1 id="page-title" class="sub__title">${title}</h1>
<p class="sub__lead">${lead}</p>
<div class="sub__actions">
${primary ? html`<a class="btn btn--ink pop-orange" href="${primary.href}">${primary.label}</a>` : ''}
${back ? html`<a class="tl sub__back" href="${back.href}">${back.label}</a>` : ''}
</div>
</div>
</section>`;
}

// Find your room without JavaScript: the answer on its own page.
export function roomResultMain(model, reply) {
  return html`<section class="sub" aria-labelledby="page-title">
<div class="wrap wrap--narrow">
<h1 id="page-title" class="sub__title">Your room.</h1>
<div class="result">
${replyCard(reply, model.cta)}
</div>
<div class="sub__actions">
<a class="tl sub__back" href="/#find-your-room">Try another answer</a>
</div>
</div>
</section>`;
}
