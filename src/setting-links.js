/**
 * setting-links.js — PURE (CJS, imports only path-linkify's trailing set; the browser bundle and the server share ONE definition):
 * A DOOR TO ONE SETTING (lane setting-doors pick 1, 2026-11-14 — the owner, after a For-you item could only describe the way to a
 * ceiling in words: «…或者至少你应该能提供一个 vibespace://settings/ 之类的链接可以让我点了之后直通对应的选项来改»).
 *
 * THE SPELLING: `vibespace://settings/<key>`, the key being the schema's own dotted key, exactly as the Settings row prints it
 * (`vibespace://settings/spend.unattendedPerInstanceDay`). An agent writes it in plain text — no tool — and every place the owner
 * reads words draws it as a link (the chat, a For-you item's question and detail, a notice); the product's own sentences carry it.
 *
 * THE LAWS:
 *  - a link only when the key IS a row (`has(key)`, the client's schema); an unknown key stays plain text;
 *  - the key ends where the key's own characters end (letters, digits, `_`, `-`, `.`) — a sentence's trailing punctuation is shed
 *    (the shared trailing set) and the LONGEST known key wins, cut back at `.` boundaries (`…/spend.unattendedPerInstanceDay.` at a
 *    sentence's end is the row, `…/spend.nope` is text);
 *  - A LINK OPENS, IT NEVER WRITES: the grammar has no value part — `?`, `=`, `&`, `#` end the key and stay text;
 *  - EVERY run of the scheme is claimed (a door, or words) — the path rule never links its tail (l1, 2026-11-15).
 */
'use strict';

const { isTrailing } = require('./path-linkify.js');

const SCHEME = 'vibespace://settings/';
const KEY_CH = 'A-Za-z0-9_.\\-';
// a DOOR: not glued to a word or a path before it (`xvibespace://…`, `/vibespace://…`); after a colon it is one (l1, 主开发 2026-11-15:
// «上限在这里:» + the link — a real web address is claimed by the address pass first); the scheme in any case (`VIBESPACE://…`)
const LINK_SRC = `(?<![\\w/.])vibespace:\\/\\/settings\\/([${KEY_CH}]+)`;
/** A fresh global regex each call (a shared `g` regex carries lastIndex state). */
function linkRe() { return new RegExp(LINK_SRC, 'gi'); }
// EVERY RUN of the scheme, whatever precedes it — the renderers' words pass claims each one that is no door, so the path rule never
// links its tail («//settings/<key>» answered «Not found» as a FILE)
const RUN_SRC = `vibespace:\\/\\/settings\\/[${KEY_CH}]*`;
function runRe() { return new RegExp(RUN_SRC, 'gi'); }
/** Does `text` hold the scheme at all (any case)? — the renderers' cheap early way out. */
function hasScheme(text) { return /vibespace:\/\/settings\//i.test(String(text || '')); }

/** The text of a link to one row — what the product's own sentences carry. */
function settingLink(key) { return SCHEME + String(key || ''); }

/** The longest known key a matched run names, or null: shed trailing punctuation, then cut back at `.` boundaries. */
function knownKeyOf(run, has) {
  let k = String(run || '');
  while (k && isTrailing(k[k.length - 1])) k = k.slice(0, -1);
  for (;;) {
    if (k && has(k)) return k;
    const dot = k.lastIndexOf('.');
    if (dot <= 0) return null;
    k = k.slice(0, dot);
  }
}

/** Every link to a KNOWN row in `text` → [{ start, end, key }] (end = after the key; the rest of the run stays text). */
function settingLinkHits(text, has) {
  const s = String(text || ''), out = [];
  if (typeof has !== 'function' || !hasScheme(s)) return out;
  const re = linkRe();
  for (let m; (m = re.exec(s));) {
    const key = knownKeyOf(m[1], has);
    if (key) out.push({ start: m.index, end: m.index + SCHEME.length + key.length, key });
  }
  return out;
}

/** `text` as segments: [{ text }] and [{ text, key }] for each known link — for a renderer that builds DOM nodes. */
function splitSettingLinks(text, has) {
  const s = String(text || ''), hits = settingLinkHits(s, has), out = [];
  let at = 0;
  for (const h of hits) { if (h.start > at) out.push({ text: s.slice(at, h.start) }); out.push({ text: s.slice(h.start, h.end), key: h.key }); at = h.end; }
  if (at < s.length) out.push({ text: s.slice(at) });
  return out;
}

/** The key a `#vs-setting-<key>` anchor (the chat's pre-sanitize rewrite) names, or null. */
const ANCHOR_PREFIX = '#vs-setting-';
function keyOfAnchor(href) { const h = String(href || ''); return h.startsWith(ANCHOR_PREFIX) && new RegExp(`^[${KEY_CH}]+$`).test(h.slice(ANCHOR_PREFIX.length)) ? h.slice(ANCHOR_PREFIX.length) : null; }

module.exports = { SCHEME, KEY_CH, linkRe, runRe, hasScheme, settingLink, knownKeyOf, settingLinkHits, splitSettingLinks, ANCHOR_PREFIX, keyOfAnchor };
