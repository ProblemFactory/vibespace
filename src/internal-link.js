/**
 * internal-link.js — PURE (CJS, imports only path-linkify's trailing set; the browser bundle and the server share ONE definition):
 * THE SCHEME `vibespace://` — ONE grammar for EVERY target (主开发 2026-11-17: «one scheme gets one module — one PURE grammar for every
 * target, one option on the renderer, one table of what a press does per target, one rule for where it renders and where it never
 * does»). The owner, 2026-11-16: chat may carry VibeSpace-internal links that open a conversation or jump to a desktop; earlier
 * (2026-11-14) a link straight to one setting. Lane setting-doors pick 1's own parser (src/setting-links.js) is folded in here.
 *
 * THE TABLE (one row per target; no fourth without a row here):
 *   conversation  vibespace://conversation/<backend>:<conversation id>   the row's key, exactly as the list prints it
 *   desktop       vibespace://desktop/<desktop id>                        the stored id (names are not unique)
 *   settings      vibespace://settings/<key>                              the schema's dotted key, exactly as the Settings row prints it
 *
 * THE LAWS:
 *  - a link is written as a markdown link with a label (`[Research](vibespace://conversation/claude:…)`) or bare; a bare one is a DOOR
 *    only when nothing is glued before it (a word, `/`, `.`) — after a colon it is one; the scheme and the target word in any case;
 *  - the reference ends where its own characters end; a sentence's trailing punctuation is shed (the shared trailing set);
 *  - a conversation or a desktop is a door by its SHAPE (the page decides at drawing whether it has it — a target it lacks is the
 *    «unknown» chip, never a link); a setting is a door only when its key IS a row (`has`), the LONGEST known key cut back at `.`
 *    boundaries; a run naming no row is words;
 *  - A LINK ONLY NAVIGATES: no target has a value part — `?`, `=`, `&`, `#` end the reference and stay text; no form sends, ends,
 *    archives or grants;
 *  - EVERY run of the scheme is claimed (a door, or words) — the path rule never links its `//…` tail;
 *  - the vendor's own `conversation://<uuid>` (src/lib/subagent-card.js) is another scheme and stays what it is.
 * WHERE IT RENDERS is the renderers' OPTION (chat-renderers `vsLinks`, For-you `has`), never this module's: it only reads.
 */
'use strict';

const { isTrailing } = require('./path-linkify.js');

const PREFIX = 'vibespace://';
const BACKEND_SRC = '[a-z][a-z0-9_-]{0,31}';
/** THE TABLE — `word` = the URL's target word; `kind` = what a renderer's span / segment calls it; `ch` = the reference's characters;
 *  `mark` = the in-page fragment a renderer carries it under through the sanitizer (which keeps no unknown scheme); `shape` = a whole
 *  reference; `byRow` = a door only when the caller's `has` knows the reference (settings). */
const TARGETS = Object.freeze({
  conversation: Object.freeze({ word: 'conversation', kind: 'conversation', ch: 'A-Za-z0-9_.:~\\-', mark: '#vs-to-conversation-', shape: new RegExp(`^${BACKEND_SRC}:[A-Za-z0-9][A-Za-z0-9_.~-]{0,199}$`), byRow: false }),
  desktop: Object.freeze({ word: 'desktop', kind: 'desktop', ch: 'A-Za-z0-9_.\\-', mark: '#vs-to-desktop-', shape: /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/, byRow: false }),
  settings: Object.freeze({ word: 'settings', kind: 'setting', ch: 'A-Za-z0-9_.\\-', mark: '#vs-setting-', shape: /^[A-Za-z0-9_.-]{1,200}$/, byRow: true }),
});
const ROWS = Object.values(TARGETS);
const BY_KIND = Object.freeze(Object.fromEntries(ROWS.map((r) => [r.kind, r])));
const WORDS = ROWS.map((r) => r.word).join('|');
const ALL_CH = 'A-Za-z0-9_.:~\\-';

/** The text of a link — what the list verb prints and the product's own sentences carry. `kind` = a row's kind (or its word). */
function linkOf(kind, ref) { const r = BY_KIND[kind] || TARGETS[kind]; return r ? `${PREFIX}${r.word}/${String(ref || '')}` : ''; }

// a DOOR's start: nothing glued before it; the scheme + the target word in any case; then the reference's run
const DOOR_SRC = `(?<![\\w/.])vibespace:\\/\\/(${WORDS})\\/([${ALL_CH}]+)`;
function doorRe() { return new RegExp(DOOR_SRC, 'gi'); }
// EVERY RUN of the scheme, whatever precedes it and whatever its target word — the renderers' words pass claims each one that is no
// door, so the path rule never links its tail («//settings/<key>» answered «Not found» as a FILE — setting-doors l1)
const RUN_SRC = `vibespace:\\/\\/[A-Za-z]*(?:\\/[${ALL_CH}]*)?`;
function runRe() { return new RegExp(RUN_SRC, 'gi'); }
/** Does `text` hold the scheme at all (any case)? — the renderers' cheap early way out. */
function hasScheme(text) { return /vibespace:\/\//i.test(String(text || '')); }
/** Where a run's words may be cut back to (its trailing punctuation shed) — never inside `vibespace://<word>/`. */
function runFloor(run) { const m = /^vibespace:\/\/[A-Za-z]*\/?/i.exec(String(run || '')); return m ? m[0].length : 0; }

const shed = (s) => { let k = String(s || ''); while (k && isTrailing(k[k.length - 1])) k = k.slice(0, -1); return k; };
/** The longest known key a matched settings run names, or null: shed trailing punctuation, then cut back at `.` boundaries. */
function knownKeyOf(run, has) {
  let k = shed(String(run || '').replace(/[^A-Za-z0-9_.-].*$/s, ''));
  for (;;) {
    if (k && has(k)) return k;
    const dot = k.lastIndexOf('.');
    if (dot <= 0) return null;
    k = k.slice(0, dot);
  }
}
/** A run's reference for row `r` → the reference a door names, or null (words). */
function refOf(r, raw, has) {
  if (r.byRow) return typeof has === 'function' ? knownKeyOf(raw, has) : null;
  const ref = shed(String(raw || '').replace(new RegExp(`[^${r.ch}].*$`, 's'), ''));
  return r.shape.test(ref) ? ref : null;
}

/** Every DOOR in `text` → [{ start, end, kind, ref }] (end = after the reference; the rest of the run stays text). `has` = the caller's
 *  key test for settings (absent ⇒ no settings door). */
function linkHits(text, has) {
  const s = String(text || ''), out = [];
  if (!hasScheme(s)) return out;
  const re = doorRe();
  for (let m; (m = re.exec(s));) {
    const r = TARGETS[m[1].toLowerCase()];
    const ref = r && refOf(r, m[2], has);
    if (ref) out.push({ start: m.index, end: m.index + PREFIX.length + r.word.length + 1 + ref.length, kind: r.kind, ref });
  }
  return out;
}
/** `text` as segments: [{ text }] and [{ text, kind, ref }] for each door — for a renderer that builds DOM nodes or spans. */
function splitLinks(text, has) {
  const s = String(text || ''), out = [];
  let at = 0;
  for (const h of linkHits(s, has)) { if (h.start > at) out.push({ text: s.slice(at, h.start) }); out.push({ text: s.slice(h.start, h.end), kind: h.kind, ref: h.ref }); at = h.end; }
  if (at < s.length) out.push({ text: s.slice(at) });
  return out;
}

/** An href that IS a link, exactly (a markdown link's or an autolink's target) → { kind, ref } | null. */
function hrefTarget(href, has) {
  const m = /^vibespace:\/\/([A-Za-z]+)\/(.+)$/i.exec(String(href || ''));
  const r = m && TARGETS[m[1].toLowerCase()];
  if (!r || !r.shape.test(m[2])) return null;
  if (r.byRow && !(typeof has === 'function' && has(m[2]))) return null;
  return { kind: r.kind, ref: m[2] };
}
/** The in-page fragment a renderer carries a link under through the sanitizer, and back. */
function markOf(kind, ref) { const r = BY_KIND[kind]; return r ? r.mark + String(ref || '') : ''; }
function targetOfMark(href) {
  const h = String(href || '');
  for (const r of ROWS) if (h.startsWith(r.mark) && r.shape.test(h.slice(r.mark.length))) return { kind: r.kind, ref: h.slice(r.mark.length) };
  return null;
}
const MARK_PREFIXES = Object.freeze(ROWS.map((r) => r.mark));

// ── settings, as lane setting-doors pick 1 spelled them (one row of the table; the toast and the product's sentences read these) ──
const SETTINGS = TARGETS.settings;
const SCHEME = PREFIX + SETTINGS.word + '/';
const KEY_CH = SETTINGS.ch;
function settingLink(key) { return linkOf('setting', key); }
function settingLinkHits(text, has) { return linkHits(text, has).filter((h) => h.kind === 'setting').map(({ start, end, ref }) => ({ start, end, key: ref })); }
function splitSettingLinks(text, has) {
  return splitLinks(text, has).map((g) => (g.kind === 'setting' ? { text: g.text, key: g.ref } : { text: g.text }))
    .reduce((acc, g) => { const last = acc[acc.length - 1]; if (!g.key && last && !last.key) last.text += g.text; else acc.push(g); return acc; }, []);
}
function keyOfAnchor(href) { const t = targetOfMark(href); return t && t.kind === 'setting' ? t.ref : null; }

// ── WHAT A PRESS DOES — one table, per target (the design's «Internal links»: a press only NAVIGATES) ──
/** A conversation's press, from the page's facts → the plan's name:
 *  `win` (a window of it built on this page, live or history — its desktop, its tab, the flash; an ENDED one lands on its history,
 *  its bar and Resume are there, nothing starts) · `desk` (its row on a desktop this page has not built — switch there; it builds and
 *  is revealed) · `archived` (a toast naming the door) · `attach` (running, no window anywhere — it opens on the desktop on show and
 *  a toast says which) · `tmux` (running in a tmux pane — attached as the sidebar attaches it) · `outside` (running outside VibeSpace,
 *  nothing to attach — the page's own sentence) · `menu` (ENDED, no window — «Resume here» ·
 *  «Read its history» at the link) · `unknown` (the page has no row for it). Facts: `win` = a built window's id, `heldDesk` = the
 *  desktop (≠ the one on show) whose record holds its row, `row` = its sidebar row {live, ended, archived} or null. */
function conversationPlan({ win = null, heldDesk = null, row = null } = {}) {
  if (win) return 'win';
  if (heldDesk) return 'desk';
  if (!row) return 'unknown';
  if (row.archived) return 'archived';
  if (row.live) return 'attach';
  if (row.ended) return 'menu';
  if (row.tmux) return 'tmux';   // running in a tmux pane VibeSpace can attach (the sidebar's own road — 主开发 12:21Z h)
  return 'outside';
}
/** THE TABLE of presses: a target's kind + the page's facts → the plan. A desktop the page has → `switch`; a setting → `settings`
 *  (Settings on that row — it opens, never writes). No plan sends, ends, archives or grants: the menu's «Resume here» is the one item
 *  that starts processes, chosen by name, and it runs the page's own resume with no first message. */
function pressPlan(kind, facts = {}) {
  if (kind === 'conversation') return conversationPlan(facts);
  if (kind === 'desktop') return facts.has ? 'switch' : 'unknown';
  if (kind === 'setting') return 'settings';
  return 'unknown';
}
const PLANS = Object.freeze(['win', 'desk', 'archived', 'attach', 'tmux', 'outside', 'menu', 'unknown', 'switch', 'settings']);

module.exports = {
  conversationPlan, pressPlan, PLANS,
  PREFIX, TARGETS, linkOf, doorRe, runRe, runFloor, hasScheme, linkHits, splitLinks, hrefTarget, markOf, targetOfMark, MARK_PREFIXES,
  SCHEME, KEY_CH, settingLink, knownKeyOf, settingLinkHits, splitSettingLinks, keyOfAnchor,
};
