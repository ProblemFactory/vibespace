'use strict';
/**
 * THE DESIGN SYSTEM'S TOKEN CHECK — PURE (CJS; requires only the PURE src/design-model.js). Lane design-systems-home,
 * design 003 §2 S5. A design system is a design folder holding system.md (the guide), tokens.css (custom properties)
 * and component artboards; a design made with `vibespace-design new --system <name>` carries a COPY of that
 * tokens.css (it travels with the folder) and `system: {name}` in design.json (validated by design-model.js).
 *
 *   tokensOf(css)                     the custom properties a tokens.css declares + every colour literal and length
 *                                     their values hold
 *   tokenLint(html, css, {file})      ONE artboard's literal colours (hex / rgb() / hsl()) and font sizes that are none
 *                                     of the tokens' values, and a custom property it sets differently from tokens.css —
 *                                     WARNINGS {code: 'not_token'|'token_drift', where, why}, never refusals
 *   tokensVerdict(text)               the tokens.css `new --system` copies: bounded text a <style> element can hold
 *
 * The hub's alone (src/server/design-engine.js runs it at every read of a folder that holds tokens.css): kept out of
 * design-model.js because that file is bundled into the published page's viewer, whose size is budgeted
 * (test-design-canvas). Every scan is LINEAR (indexOf, one pass with a depth counter, regexes with bounded
 * quantifiers and one start per number) — an artboard is agent-written text. Gate: scripts/test-design-model.mjs.
 */
const { scanHtml, utf8Bytes } = require('./design-model.js');

const shown = (v, n = 60) => { const s = String(v == null ? '' : v).replace(/[\x00-\x1f\x7f]+/g, ' '); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
// A design system is a design folder holding system.md (the guide), tokens.css (custom properties) and component
// artboards. A design made with `vibespace-design new --system <name>` carries a COPY of that tokens.css (it travels
// with the folder) and `system: {name}` in design.json. The check below is advice, never a refusal: a literal colour or
// font size in an artboard that is none of the tokens' values is WARNED ("checked against the system", F51).
const TOKENS_FILE = 'tokens.css';
const SYSTEM_FILE = 'system.md';
const TOKEN_LIMITS = Object.freeze({ tokensBytes: 256 * 1024, lintPerArtboard: 6, valueShown: 60 });
const COLOR_RE = /#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z_-])|\b(?:rgba?|hsla?)\([^()]{0,120}\)/g;
const LENGTH_RE = /(?:^|[^\w.#-])(\d+(?:\.\d+)?|\.\d+)(px|rem|em|pt)\b/g;   // one start per number: linear
const PROP_RE = /^(--[A-Za-z0-9_-]{1,80}|-?[a-z][a-z0-9-]{0,40})$/;

/** CSS text without its comments (linear). */
function cssUncommented(s) {
  let out = '', at = 0;
  for (;;) {
    const a = s.indexOf('/*', at);
    if (a < 0) return out + s.slice(at);
    out += s.slice(at, a) + ' ';
    const b = s.indexOf('*/', a + 2);
    if (b < 0) return out;
    at = b + 2;
  }
}
/** A value with every `var(…)` and `url(…)` span blanked (a fallback inside var() is the token's own; a data URI is an
 *  image) — one pass, parenthesis depth counted. */
function blankSpans(v) {
  let out = '', i = 0;
  const n = v.length;
  while (i < n) {
    const low = v.slice(i, i + 4).toLowerCase();
    if (low === 'var(' || low === 'url(') {
      let d = 0, j = i + 3;
      for (; j < n; j++) { const c = v.charCodeAt(j); if (c === 40) d++; else if (c === 41) { d--; if (d === 0) break; } }
      out += ' ';
      i = j + 1;
      continue;
    }
    out += v[i++];
  }
  return out;
}
const normColor = (c) => {
  let x = String(c).toLowerCase().replace(/\s+/g, '');
  if (/^#[0-9a-f]{3,4}$/.test(x)) x = '#' + x.slice(1).split('').map((d) => d + d).join('');
  if (/^#[0-9a-f]{8}$/.test(x) && x.endsWith('ff')) x = x.slice(0, 7);
  return x;
};
const normLength = (num, unit) => `${parseFloat(num)}${unit.toLowerCase()}`;
const colorsIn = (v) => (blankSpans(v).match(COLOR_RE) || []);
function lengthsIn(v) { const out = []; const b = blankSpans(v); LENGTH_RE.lastIndex = 0; let m; while ((m = LENGTH_RE.exec(b))) out.push(normLength(m[1], m[2])); return out; }
/** Every `prop: value` of a CSS text, in order (linear): a chunk ended by `{` is a selector / an at-rule head, never a
 *  declaration. `inline` = a style attribute (no braces; its last chunk needs no `;`). */
function declarationsOf(css, inline = false) {
  const s = cssUncommented(String(css == null ? '' : css));
  const out = [];
  let start = 0;
  const take = (end) => {
    const chunk = s.slice(start, end);
    const c = chunk.indexOf(':');
    if (c > 0) {
      const raw = chunk.slice(0, c).trim();
      const prop = raw.startsWith('--') ? raw : raw.toLowerCase();
      if (PROP_RE.test(prop)) out.push({ prop, value: chunk.slice(c + 1).replace(/!important\s*$/i, '').trim() });
    }
  };
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    if (ch === 123) start = i + 1;                         // {  — what came before was a selector
    else if (ch === 59 || ch === 125) { take(i); start = i + 1; }   // ; or }
  }
  if (inline || start < s.length) take(s.length);
  return out;
}
/** tokens.css → {vars: Map(--name → its value, whitespace folded), colors: Set, lengths: Set} — every colour literal
 *  and every length any custom property's value holds. */
function tokensOf(css) {
  const vars = new Map(), colors = new Set(), lengths = new Set();
  for (const d of declarationsOf(css)) {
    if (!d.prop.startsWith('--')) continue;
    vars.set(d.prop, d.value.replace(/\s+/g, ' '));
    for (const c of colorsIn(d.value)) colors.add(normColor(c));
    for (const l of lengthsIn(d.value)) lengths.add(l);
  }
  return { vars, colors, lengths };
}
/** ONE artboard against a system's tokens → [{code:'not_token'|'token_drift', where, why}] (at most
 *  TOKEN_LIMITS.lintPerArtboard + one "and N more"). Looked at: hex / rgb() / hsl() colours in any declaration and the
 *  size of `font-size` / `font`, in <style> blocks and style attributes (never a script). A custom property the
 *  artboard sets that tokens.css also sets must say the same (drift); one tokens.css does not set is judged like any
 *  other declaration. A value inside var(…) is the token's own and never warned. */
function tokenLint(html, tokensCss, { file = 'artboard' } = {}) {
  const tk = tokensCss && typeof tokensCss === 'object' && tokensCss.vars instanceof Map ? tokensCss : tokensOf(tokensCss);   // tokensOf()'s answer, or the text
  const s = String(html == null ? '' : html);
  const sc = scanHtml(s);
  const out = [], seen = new Set();
  let more = 0;
  const say = (key, code, why) => {
    if (seen.has(key)) return;
    seen.add(key);
    if (out.length < TOKEN_LIMITS.lintPerArtboard) out.push({ code, where: file, why }); else more++;
  };
  for (const [a, b] of sc.css) {
    const inline = !(a > 0 && s.slice(Math.max(0, a - 1), a) === '>');
    for (const d of declarationsOf(s.slice(a, b), inline)) {
      const v = d.value;
      if (d.prop.startsWith('--') && tk.vars.has(d.prop)) {
        const want = tk.vars.get(d.prop), got = v.replace(/\s+/g, ' ');
        if (want.toLowerCase() !== got.toLowerCase()) say('drift ' + d.prop, 'token_drift', `${file} sets ${d.prop} to ${shown(got, TOKEN_LIMITS.valueShown)} — tokens.css says ${shown(want, TOKEN_LIMITS.valueShown)} (copy the system's value, or change tokens.css)`);
        continue;
      }
      for (const c of colorsIn(v)) {
        const n = normColor(c);
        if (!tk.colors.has(n)) say('c ' + n, 'not_token', `${file}: the colour ${shown(c, 40)} (${d.prop}) is not one of the design system's tokens — use var(--…) from tokens.css`);
      }
      if (d.prop === 'font-size' || d.prop === 'font') {
        const ls = lengthsIn(v);
        for (const l of (d.prop === 'font' ? ls.slice(0, 1) : ls)) if (!tk.lengths.has(l)) say('l ' + l, 'not_token', `${file}: the font size ${l} (${d.prop}) is not one of the design system's tokens — use var(--…) from tokens.css`);
      }
    }
  }
  if (more) out.push({ code: 'not_token', where: file, why: `${file}: ${more} more value(s) outside the design system's tokens` });
  return out;
}
/** The tokens.css a `new --system` copies → {ok:true, text} | {ok:false, code, why}: text, bounded, and nothing a
 *  <style> element would end on (the skeleton artboard pastes it into one). */
function tokensVerdict(text) {
  if (typeof text !== 'string') return { ok: false, code: 'bad_type', why: 'tokens.css must be text' };
  if (utf8Bytes(text) > TOKEN_LIMITS.tokensBytes) return { ok: false, code: 'too_big', why: `tokens.css is over ${TOKEN_LIMITS.tokensBytes / 1024} KB — a design system's tokens are custom properties, not a stylesheet` };
  if (text.includes('\x00')) return { ok: false, code: 'bad_value', why: 'tokens.css holds a NUL byte — it is not a text file' };
  if (/<\/style/i.test(text)) return { ok: false, code: 'bad_value', why: 'tokens.css holds "</style" — remove it (the tokens are pasted into each artboard\'s <style>)' };
  return { ok: true, text };
}

module.exports = { TOKENS_FILE, SYSTEM_FILE, TOKEN_LIMITS, tokensOf, tokenLint, tokensVerdict, declarationsOf };
