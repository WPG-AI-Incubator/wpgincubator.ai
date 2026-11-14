// Tiny HTML templating: everything interpolated is escaped unless it is already
// the output of html`` or wrapped in raw().

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

class Safe {
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

export function raw(value) {
  return new Safe(String(value ?? ''));
}

function render(value) {
  if (value == null || value === false || value === true) return '';
  if (value instanceof Safe) return value.value;
  if (Array.isArray(value)) return value.map(render).join('');
  return esc(value);
}

export function html(strings, ...values) {
  let out = '';
  for (let i = 0; i < strings.length; i += 1) {
    out += strings[i];
    if (i < values.length) out += render(values[i]);
  }
  return new Safe(out);
}

// JSON that is safe to place inside an HTML attribute or a <script> data block.
export function jsonForHtml(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
