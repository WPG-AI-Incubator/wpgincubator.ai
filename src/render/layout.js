// The page shell: <head>, header, navigation, footer.

import { html, jsonForHtml, raw } from '../html.js';

const NAV = [
  ['#next-issue', 'Next Issue'],
  ['#what-happens', 'What happens'],
  ['#back-issues', 'Back issues'],
  ['#take-the-stage', 'Take the stage'],
  ['#about', 'About'],
];

function navLinks(model) {
  return NAV.map(([hash, label]) => html`<a class="nav__link" href="${model.anchor(hash)}">${label}</a>`);
}

function header(model, assets) {
  const { cta, site } = model;
  const label = cta.named ? html` aria-label="${cta.label}"` : '';
  return html`<header class="site-header on-ink">
<div class="wrap site-header__bar">
<a class="brand" href="/">
${assets.badge ? html`<img class="brand__badge" src="${assets.url(assets.badge)}" alt="" width="44" height="44">` : ''}
<span class="brand__name">${site.name}</span>
</a>
<nav class="nav nav--wide" aria-label="Primary">
${navLinks(model)}
</nav>
<a class="header-cta" href="${cta.href}"${label}>${cta.short}</a>
</div>
</header>
<nav class="nav nav--narrow on-ink" aria-label="Sections">
${navLinks(model)}
</nav>`;
}

function footer(model) {
  const { site } = model;
  const follow = [...site.social.filter((s) => s.url), { label: 'Eventbrite', url: site.eventbriteOrganizerUrl }];
  return html`<footer class="site-footer on-ink">
<div class="wrap">
<p class="site-footer__motto">${site.tagline}</p>
<div class="site-footer__cols">
<div>
<p class="site-footer__name">${site.name}</p>
<p class="site-footer__roots">${site.roots}</p>
<a class="tl link-row link-row--strong" href="mailto:${site.contactEmail}">${site.contactEmail}</a>
</div>
<nav aria-label="Footer">
<h2 class="site-footer__h">Explore</h2>
<ul class="site-footer__list">
${NAV.map(([hash, label]) => html`<li><a class="tl tl--plain link-row" href="${model.anchor(hash)}">${label}</a></li>`)}
</ul>
</nav>
<div>
<h2 class="site-footer__h">Follow</h2>
<ul class="site-footer__list">
${follow.map((item) => html`<li><a class="tl tl--plain link-row" href="${item.url}" rel="noopener">${item.label}</a></li>`)}
</ul>
</div>
<div>
<h2 class="site-footer__h site-footer__h--gap">Partners</h2>
<p class="site-footer__text">Promoting an Issue? Ask for the Partner Brand Kit and approved artwork.</p>
<a class="tl link-row link-row--strong" href="mailto:${site.contactEmail}">Email the team</a>
</div>
</div>
<div class="site-footer__base">
<span>© ${model.year} ${site.name}. Treaty 1 Territory, Winnipeg, Manitoba.</span>
<a class="tl link-row" href="/privacy">Privacy</a>
</div>
</div>
</footer>`;
}

export function layout({ model, assets, config, title, description, path, main, jsonLd = [], noindex = false }) {
  const { site } = model;
  const canonical = `${config.siteUrl}${path}`;
  const ogImage = `${config.siteUrl}/img/og.png`;
  const page = html`<!DOCTYPE html>
<html lang="en-CA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
${noindex ? html`<meta name="robots" content="noindex">` : html`<link rel="canonical" href="${canonical}">`}
<meta name="theme-color" content="#111111">
<link rel="preload" href="/fonts/bangers-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/archivo-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/anton-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${assets.url('/css/site.css')}">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="${assets.url('/favicon.svg')}" type="image/svg+xml">
<link rel="apple-touch-icon" href="${assets.url('/apple-touch-icon.png')}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${site.name}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${ogImage}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="A room for the curious. ${site.name}, Winnipeg.">
<meta name="twitter:card" content="summary_large_image">
${jsonLd.map((block) => html`<script type="application/ld+json">${raw(jsonForHtml(block))}</script>
`)}<script src="${assets.url('/js/site.js')}" defer></script>
${config.gaId ? html`<script src="${assets.url('/js/analytics.js')}" defer data-ga="${config.gaId}"></script>` : ''}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<div class="page" id="top">
${header(model, assets)}
<main id="main" tabindex="-1">
${main}
</main>
${footer(model)}
</div>
</body>
</html>
`;
  return page.toString();
}
