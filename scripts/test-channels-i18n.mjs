#!/usr/bin/env node
// THE i18n CENSUS OF THE COMMUNICATION PANEL (heavy tier; a3 of the polish,
// docs/design-communication-panel-polish-audit.md §1 — owner 2026-09-17
// "似乎没太做好 i18n").
//
// WHAT IT ASSERTS: under zh AND under ja, every one of the eight surfaces —
// the Channels rail panel, the conversation window, the composer + inline
// approval cards + the Outbox window, the Assign & filter editor, the Reach &
// policy editor, the account dialogs (r4: connect type-first incl. a custom Lark client, re-authorize with the port-busy notice, edit, duplicate, remove refused), the
// Options / Push / Search / rule-grain dialogs, and ⚙ → Integrations — renders ZERO visible
// text nodes (and title/placeholder attributes) whose letters are Latin-only,
// except a PRINTED allowlist: proper nouns (Lark, 飞书's Latin twin, Gmail,
// Pub/Sub, OAuth, Google, VibeSpace, the CLI names), URLs / emails / ids /
// version strings, and the fixture's OWN DATA excused by DOM PATH (a
// conversation title, a participant list, a vendor message body, the user's
// typed proposal, a callback URL, a masked key) — text no dictionary could or
// should hold. The census is the a1 driver's `<lang>-desktop-dark-latin-
// leaks.json` (every Latin-only visible string, with the surfaces and DOM
// paths it appeared on), so the gate and the audit read the same evidence.
//
// THE NEGATIVE CONTROL runs BEFORE chrome: the PURE census is handed one
// planted English literal on a chrome path and must go red — an allowlist
// that could excuse everything is not a census.
//
// ④ THE LOOK'S RECT CENSUS (channel-polish, 2026-09-27): the driver's IM pass
// (a seeded Lark group + Gmail thread, the attention list at the 200 / 260 /
// 340 / 500 px rails, an account card, the windows, the phone) under the
// RUNNER'S face ('DejaVu Sans' forced — the .185 lesson), zh / ja / en, dark
// (+ en light): `imCensus` — nothing overlaps, nothing is cut, no part leaves
// its row, nothing scrolls sideways, every phone target ≥ 36 px, every
// avatar's initials ≥ 4.5 : 1 on its computed fill. Its own negative control
// (a planted overlap, a cut time, a 28 px phone button, a 3 : 1 avatar) runs
// before chrome too.
//
// Everything is per-pid (scripts/scratch.mjs); chrome and the worktree server
// are the driver's, torn down by it. Run: node scripts/test-channels-i18n.mjs
// (SKIPs without chrome). VS_UI_LANGS narrows the languages (default zh,ja).
import { spawnSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// The Lark callback URL is DEFINED in the registry and spelled nowhere else
// (test-integration-registry's census fails a second holder) — the control
// fixture below imports it, exactly as scripts/dbg-comm-surfaces.mjs does.
const { LARK_CALLBACK_URL } = createRequire(import.meta.url)(path.join(repo, 'src/integration-registry.js'));

// ── THE ALLOWLIST (printed by the run) ───────────────────────────────────────
// A Latin token is excused when it is one of these words (case-insensitive),
// or when the whole string is a URL / email / id / version / a bare code the
// product deliberately shows as a value (an enum a select offers).
export const ALLOWED_WORDS = [
  // vendors, products, protocols
  'lark', 'feishu', 'gmail', 'google', 'pub', 'sub', 'oauth', 'vibespace', 'cloakbrowser', 'cloak', 'claude', 'codex',
  'api', 'id', 'ids', 'url', 'http', 'https', 'json', 'utc', 'iana',
  // the product's own untranslated terms (the dictionaries map them to themselves)
  'agent', 'agents', 'turn',
  // the fixture's adapter ids (shown as the option VALUES a select offers and in the Options dialog's brand choices)
  'fake', 'poll', 'push', 'scan',
  // the Lark option's declared values — VALUES, not words (§16: never wrap protocol values)
  'im', 'message', 'send_as_user',
  // the Gmail option's declared placeholders / defaults are query syntax
  'label', 'inbox', 'projects', 'project', 'topics', 'topic', 'subscriptions', 'name',
  // the Push dialog's exclusivity choices start with the enum word by design
  'unknown', 'shared', 'exclusive',
  // registry field labels that ARE the vendor's console words
  'app', 'secret',
  // the fixture's people (the fake adapter's participants)
  'ada', 'brook', 'cass',
];
// A whole string is excused when it matches one of these (URLs, emails, ids,
// versions, masked secrets, the CLI's names, key-shaped values).
export const ALLOWED_PATTERNS = [
  /^https?:\/\/\S+$/i,                 // a URL
  /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/,      // an email
  /^v?\d+(\.\d+)+([.-]\w+)?$/,         // a version string
  /^[\w.-]*[•]{2,}[\w.-]*$/,           // a masked secret
  /^(cli_|cb_|fake_|GOCSPX-|sk-|bb_live_)[\w…-]*$/, // key-shaped placeholders / ids (bb_live_: the Browserbase key row, the window's card since r4)
  /^vibespace-[a-z-]+$/,               // an agent CLI's name
  /^[a-z0-9]+(-[a-z0-9]+)+$/,          // a hyphenated id / code shown as a value (fake-poll, send-not-available)
  /^\[\[fake:[a-z]+\]\]$/,             // the fixture's own directives
  /^[A-Z]{2,5}$/,                      // an acronym (ID, URL, HH:MM's parts)
  /^\d[\d:.\s%/×-]*[a-z]{0,2}$/i,     // a number with a unit (5m, 30s, 12.5%)
];
// A text node is DATA — vendor / user content — when its DOM path carries one
// of these classes (or a tag under one): a conversation's title / participants,
// a message body, the user's typed proposal, a callback URL, a masked key…
export const DATA_PATH_CLASSES = [
  'chan-row-title', 'chan-row-sub',
  'chan-search-head', 'chan-search-text',   // a search hit's conversation title / author / message text
  'chanmsg-dlv',   // lane group-pending: the line under a group message names a RECIPIENT ("Waiting for beta's next turn") — its words are t()'d, the name is data
  'chan-orow-title', 'chan-orow-text', 'chan-orow-acct',   // B-f467: an Outbox row's recipients / conversation name, the draft's first line, the account's own label
  'chanwin-bar', 'chanmsg-head', 'chanmsg-body', 'chan-prop-text', 'chan-prop-link', 'chan-prop-orig', 'chan-prop-honesty-line',
  'chan-prop-edit', 'chan-prop-rejectbox',
  'integ-cb-url', 'integ-mask', 'integ-plain', 'chan-flow-input', 'chan-opt-input', 'chan-af-rule',
  'integ-test-error',  // a Test verdict's words are the RUNNER'S / VENDOR'S own (our refusal sentence is `.integ-test-refusal`, censused)
  'window-title', 'win-title', 'titlebar', 'taskbar', 'rail-badge',
  'chan-reach-who',   // the principal's own name (a session / group title)
  'chan-cred-chip',   // r4: the account's client chip carries a PRESET's label (the cluster's own words) after the translated "Preset:"
  // g3 (design §22, the IM-first panel): an agent GROUP's name, its last line and a source's label are
  // AGENT / vendor data; so are member names (the detail + the New group picker), an invite's context,
  // a system record's names and an @-autocomplete candidate
  'chan-grow-title', 'chan-grow-last', 'chan-src-chip', 'chan-gm-name', 'chanmsg-ctx', 'chanmsg-sys-line', 'chan-mention-item',
  // R3 (design §23): the first screen's tag names its AGENT in its own span (the words around it are chrome,
  // censused); an attachment's name is the vendor's file name
  'chan-tag-who', 'chanmsg-att-name',
  // channel-polish (2026-09-27): THE PRINCIPAL PICKER — a session's / group's name (row, chip, trigger), a
  // session's folder, its Task Group chip, a Task Group section's own title; an access row's principal name
  'pp-name', 'pp-chip-name', 'pp-trigger-name', 'pp-folder', 'pp-tg', 'pp-tghead', 'chan-access-who',
];
// The eight surfaces' shot-name stems; a leak seen ONLY on the house-style
// reference shots (`house-*`, the full page) is not this feature's to answer for.
export const FEATURE_SHOT = /^(panel|win|card|outbox|dialog|wizard|integ|toast|narrow)-/;

const LATIN_WORD = /[A-Za-z]{3,}/;
const CJK = /[぀-ヿ㐀-鿿]/;
const tokens = (s) => String(s).split(/[^A-Za-z_]+/).filter((w) => /[A-Za-z]{2,}/.test(w));

/** Is this ONE leak entry excused? Returns `{excused, by}` — `by` names the
 *  rule (a printed reason), so the run's log is the allowlist's audit. */
export function excuse(entry) {
  const text = String(entry.text || '').trim();
  if (!LATIN_WORD.test(text) || CJK.test(text)) return { excused: true, by: 'not-latin-only' };
  const paths = Array.isArray(entry.paths) ? entry.paths : [];
  const cls = paths.join(' ');
  for (const c of DATA_PATH_CLASSES) if (cls.includes(c)) return { excused: true, by: `data-path:${c}` };
  for (const re of ALLOWED_PATTERNS) if (re.test(text)) return { excused: true, by: `pattern:${re.source.slice(0, 24)}` };
  const words = tokens(text);
  const allowed = new Set(ALLOWED_WORDS);
  const bad = words.filter((w) => !allowed.has(w.toLowerCase()) && !/^[A-Z]{2,5}$/.test(w) && !/^\d/.test(w));
  if (!bad.length) return { excused: true, by: 'allowed-words' };
  return { excused: false, by: `latin:${bad.slice(0, 4).join(',')}` };
}

/** The PURE census over one language's leak list: violations + the excused tally. */
export function census(leaks) {
  const violations = [], excused = {};
  for (const e of leaks || []) {
    const surfaces = Array.isArray(e.surfaces) ? e.surfaces : [];
    if (surfaces.length && !surfaces.some((s) => FEATURE_SHOT.test(s))) { excused['house-shot-only'] = (excused['house-shot-only'] || 0) + 1; continue; }
    const v = excuse(e);
    if (v.excused) excused[v.by] = (excused[v.by] || 0) + 1;
    else violations.push({ text: e.text, why: v.by, surfaces: e.surfaces || [], paths: e.paths || [] });
  }
  return { violations, excused };
}

// The eight surfaces, by the driver's shot-name stems (each must have been shot in each language).
export const SURFACES = [
  ['panel', /^panel-02-rows$/],
  ['window', /^win-01-sendable$/],
  ['outbox', /^outbox-window$/],
  // R4 (2026-09-27): access and notification are two operations — Grant access… then Notify…
  ['grant access', /^dialog-access$/],
  ['notify', /^dialog-notify-filter$/],
  ['reach', /^dialog-reach$/],
  // r4 (design-integrations-per-account, chunk 3): the account dialogs are the storage dialog
  // component — connect (type-first, Lark + Custom), re-authorize, edit, duplicate, remove refused
  ['account dialogs', /^wizard-01-connect$/],
  ['account dialogs (Lark, custom client)', /^wizard-02-connect-lark-custom$/],
  ['re-authorize', /^wizard-04-reauth-port-busy$/],
  ['edit', /^wizard-05-edit$/],
  ['duplicate', /^wizard-06-duplicate$/],
  ['remove refused', /^wizard-07-remove-refused$/],
  ['options/push', /^dialog-(options-lark|push)$/],
  // 2026-09-26 (aggregated IM): the Track… picker is gone; search + the rule grain are new surfaces
  ['search', /^dialog-search$/],
  ['rule grain', /^dialog-rule-access$/],
  ['integrations', /^integ-01-window$/],
];

// ── THE LOOK'S RECT CENSUS (channel-polish, 2026-09-27; the owner: "这个当作 IM 用还是有必要把界面好好
// 优化下至少保证人能看清楚必要的信息") ─────────────────────────────────────────────────────────────
// The driver's IM pass (VS_UI_IM=only) writes, per shot, `im` = every row / bar / message / chip it knows
// with the rect of each PART and whether a part that must be WHOLE is cut. `imCensus(shot)` = the
// violations: two parts of one container OVERLAP (a time drawn over the text, an avatar over a name); a
// part past its container's edge; a WHOLE part cut (a time, an unread count, a tag's words, a day pill, a
// button's label, a file's size); a list that scrolls sideways; on a phone (viewport ≤ 480 px) an
// interactive target under 36 px (tall, and wide when it carries no words); an avatar whose initials read
// under 4.5 : 1 on its own fill (the COMPUTED colours — the palette as the theme resolved it).
const IM_TARGET_EXEMPT = /(^|\s)(win-btn|chanblk-a)(\s|$)/;
/** sRGB channels 0..255 from a computed colour (`rgb()` / `rgba()` / `color(srgb …)`). */
export function parseColor(c) {
  const s = String(c || '').trim();
  let m = s.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  m = s.match(/^color\(srgb\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)/i);
  if (m) return [Number(m[1]) * 255, Number(m[2]) * 255, Number(m[3]) * 255];
  return null;
}
/** WCAG 2 contrast ratio of two sRGB colours (0..255). */
export function contrast(a, b) {
  const L = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const x = L(a), y = L(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
const overlapArea = (a, b) => { const w = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]); const h = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]); return w > 1.5 && h > 1.5 ? w * h : 0; };   // a shared 1 px border (a segmented control's seam) is not an overlap
export function imCensus(shot) {
  const out = [];
  const im = shot && shot.im;
  const where = `${shot && shot.tag}/${shot && shot.name}`;
  if (!im || im.missing) return [{ where, what: 'no-measurement', detail: im && im.missing }];
  for (const g of im.groups || []) {
    const parts = Object.entries(g.parts || {});
    for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
      const [an, a] = parts[i], [bn, b] = parts[j];
      const area = overlapArea(a.r, b.r);
      if (area > 2) out.push({ where, what: 'overlap', detail: `${g.name}#${g.idx} ${an} × ${bn} (${Math.round(area)} px²) ${JSON.stringify([a.text, b.text])}` });
    }
    for (const [pn, p] of parts) {
      if (p.cut) out.push({ where, what: 'cut', detail: `${g.name}#${g.idx} ${pn} ${JSON.stringify(p.text)}` });
      if (p.r[0] < g.r[0] - 1 || p.r[0] + p.r[2] > g.r[0] + g.r[2] + 1) out.push({ where, what: 'outside', detail: `${g.name}#${g.idx} ${pn} ${JSON.stringify(p.text)} [${p.r}] vs [${g.r}]` });
    }
    for (const w of g.whole || []) if (w.cut) out.push({ where, what: 'cut', detail: `${g.name}#${g.idx} ${w.sel} ${JSON.stringify(w.text)}` });
  }
  for (const h of im.hscroll || []) if (h.over) out.push({ where, what: 'hscroll', detail: h.cls });
  const phone = Array.isArray(im.viewport) && im.viewport[0] <= 480;
  if (phone) for (const tg of im.targets || []) {
    if (IM_TARGET_EXEMPT.test(tg.cls || '')) continue;
    const [, , w, h] = tg.r;
    if (h < 35.5 || (tg.iconOnly && w < 35.5)) out.push({ where, what: 'small-target', detail: `${tg.tag}.${(tg.cls || '').split(/\s+/)[0]} ${JSON.stringify(tg.text)} ${Math.round(w)}×${Math.round(h)}` });
  }
  for (const a of im.avatars || []) {
    const fg = parseColor(a.color), bg = parseColor(a.background);
    const cr = fg && bg ? contrast(fg, bg) : 0;
    if (cr < 4.5) out.push({ where, what: 'avatar-contrast', detail: `${JSON.stringify(a.text)} hue ${a.hue}${a.self ? ' (self)' : ''}: ${cr.toFixed(2)} : 1 (${a.color} on ${a.background})` });
    if (a.ariaHidden !== 'true') out.push({ where, what: 'avatar-not-paint', detail: JSON.stringify(a.text) });
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let pass = 0, fail = 0;
  const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };

  // ── ① the negative control, BEFORE chrome ──
  console.log('① the PURE census can go red');
  const planted = census([{ text: 'Nothing is fetched yet', paths: ['div.chan-empty < div.chan-list'], surfaces: ['panel-01-fresh'] }]);
  ok(planted.violations.length === 1 && /latin:/.test(planted.violations[0].why), 'NEGATIVE CONTROL: one planted English literal on a chrome path is a violation', JSON.stringify(planted));
  // (the URL sits on a CHROME path here so the pattern rule — not the data-path rule — is what excuses it)
  const excusedData = census([{ text: 'Ops room', paths: ['span.chan-row-title < div.chan-row-line'], surfaces: ['panel-02-rows'] }, { text: LARK_CALLBACK_URL, paths: ['code < div.mounts-field-hint'], surfaces: ['wizard-02-connect-lark-custom'] }, { text: 'Lark / 飞书', paths: ['b < div.chan-sec-head'], surfaces: ['panel-02-rows'] }]);
  ok(excusedData.violations.length === 0 && excusedData.excused['data-path:chan-row-title'] === 1 && Object.keys(excusedData.excused).some((k) => k.startsWith('pattern:')), 'CONTROL: a fixture title (by path), a callback URL (by pattern) and a brand beside CJK are excused, each by a NAMED rule', JSON.stringify(excusedData.excused));
  // the rect census's negative control (④ below): every rule fires on a planted shot
  {
    const planted = { tag: 'control', name: 'planted', im: { viewport: [375, 667], groups: [
      { name: 'grow', idx: 0, r: [0, 0, 200, 40], parts: { title: { r: [40, 4, 120, 16], cut: false, text: 'A title' }, at: { r: [150, 4, 30, 16], cut: true, text: '12:00' } }, whole: [{ sel: '.chan-tag-words', text: 'to approve', cut: true }] },
      { name: 'msg', idx: 0, r: [0, 50, 200, 40], parts: { body: { r: [44, 60, 150, 20], cut: false, text: 'words' }, hover: { r: [180, 60, 30, 14], cut: false, text: '12:01' } } },
    ], targets: [{ tag: 'button', cls: 'icon-btn', text: '', iconOnly: true, r: [0, 0, 28, 28] }, { tag: 'button', cls: 'win-btn', text: '✕', iconOnly: false, r: [0, 0, 20, 20] }],
    avatars: [{ text: 'AE', hue: '1', color: 'rgb(120, 120, 120)', background: 'rgb(60, 60, 60)', ariaHidden: 'true', r: [0, 0, 28, 28] }, { text: 'B', hue: '2', color: 'rgb(230, 230, 230)', background: 'rgb(30, 30, 50)', ariaHidden: null, r: [0, 0, 28, 28] }],
    hscroll: [{ cls: 'chanwin-list', over: true }] } };
    const v = imCensus(planted);
    const kinds = [...new Set(v.map((x) => x.what))].sort();
    ok(['avatar-contrast', 'avatar-not-paint', 'cut', 'hscroll', 'outside', 'overlap', 'small-target'].every((k) => kinds.includes(k)) && v.filter((x) => x.what === 'small-target').length === 1 && v.filter((x) => x.what === 'cut').length === 2,
      `NEGATIVE CONTROL (the rect census): a planted shot trips every rule — an overlap (the hover time over the text), a part past its row, a cut time + cut tag words, a 28 px phone button (the window's own chrome exempt), a 2.3 : 1 avatar, an avatar exposed to assistive tech, a sideways scroll (${kinds.join(', ')})`, JSON.stringify(v));
    const clean = imCensus({ tag: 'control', name: 'clean', im: { viewport: [1200, 800], groups: [{ name: 'seg', idx: 0, r: [0, 0, 200, 26], parts: { focus: { r: [0, 0, 101, 26], cut: false, text: 'a' }, all: { r: [100, 0, 100, 26], cut: false, text: 'b' } } }], targets: [{ tag: 'button', cls: 'icon-btn', text: '', iconOnly: true, r: [0, 0, 20, 20] }], avatars: [{ text: 'AE', color: 'color(srgb 0.9 0.9 0.95)', background: 'color(srgb 0.12 0.12 0.2)', ariaHidden: 'true' }], hscroll: [] } });
    ok(clean.length === 0, 'CONTROL: a segmented control\'s shared 1 px seam, a 20 px desktop icon button and a 12 : 1 avatar (a `color(srgb …)` computed value) are NOT violations', JSON.stringify(clean));
  }
  console.log('  … allowed words: ' + ALLOWED_WORDS.join(', '));
  console.log('  … allowed patterns: ' + ALLOWED_PATTERNS.map((r) => r.source).join('  |  '));
  console.log('  … data-path classes: ' + DATA_PATH_CLASSES.join(', '));

  // ── ② the driver, zh AND ja, desktop, dark ──
  const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
  if (!CHROME) { console.log('SKIP: no chrome/chromium — the census needs the rendered surfaces'); console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} (${pass} passed, ${fail} failed) — chrome legs skipped`); process.exit(fail ? 1 : 0); }
  const LANGS = (process.env.VS_UI_LANGS || 'zh,ja').split(',').map((s) => s.trim()).filter(Boolean);
  const out = scratch('chan-i18n');
  fs.mkdirSync(out, { recursive: true });
  console.log(`② rendering every surface under ${LANGS.join(' + ')} (scripts/dbg-comm-surfaces.mjs → ${out})`);
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(repo, 'scripts/dbg-comm-surfaces.mjs')], {
    cwd: repo, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024, timeout: 15 * 60 * 1000,
    env: { ...process.env, VS_UI_SHOTS_DIR: out, VS_UI_LANGS: LANGS.join(','), VS_UI_VIEWPORTS: 'desktop', VS_UI_THEMES: 'dark' },
  });
  const log = (r.stdout || '') + (r.stderr || '');
  fs.writeFileSync(path.join(out, 'driver.log'), log);
  ok(r.status === 0, `the driver exited 0 in ${Math.round((Date.now() - t0) / 1000)}s (log: ${path.join(out, 'driver.log')})`, r.status === 0 ? '' : log.split('\n').slice(-12).join('\n'));
  let index = null;
  try { index = JSON.parse(fs.readFileSync(path.join(out, 'index.json'), 'utf-8')); } catch {}
  ok(!!index, 'the driver wrote its index');
  const shots = (index && index.shots) || [];
  ok(!shots.some((s) => s.name === 'PASS-FAILED'), 'no language pass failed', JSON.stringify(shots.filter((s) => s.name === 'PASS-FAILED')));

  // ── ③ every surface, in every language; zero violations ──
  for (const lang of LANGS) {
    const tag = `${lang}-desktop-dark`;
    console.log(`③ ${lang}`);
    for (const [name, re] of SURFACES) {
      const hit = shots.find((s) => s.tag === tag && re.test(s.name) && !s.missing);
      ok(!!hit, `${lang}: the ${name} surface was rendered and measured (${re.source})`);
    }
    let leaks = null;
    try { leaks = JSON.parse(fs.readFileSync(path.join(out, `${tag}-latin-leaks.json`), 'utf-8')); } catch {}
    ok(Array.isArray(leaks), `${lang}: the driver wrote the Latin-leak census (${tag}-latin-leaks.json)`);
    const c = census(leaks || []);
    console.log(`  … ${lang}: ${(leaks || []).length} Latin-only strings on screen, excused by rule: ${JSON.stringify(c.excused)}`);
    ok(c.violations.length === 0, `${lang}: ZERO visible Latin-only text nodes outside the allowlist on the eight surfaces`,
      c.violations.slice(0, 40).map((v) => `${JSON.stringify(v.text)} [${v.why}] on ${v.surfaces.slice(0, 3).join(', ')} at ${v.paths[0] || '?'}`).join('\n    '));
    // the census is NON-VACUOUS: the fixture's own data is on screen and was excused BY PATH
    ok((leaks || []).length > 0 && Object.keys(c.excused).some((k) => k.startsWith('data-path:')), `${lang}: the census saw the fixture's data and excused it by path (a census that sees nothing is not a census)`);
  }

  // ── ④ THE LOOK: the IM pass under the runner's face, the rect census over every shot ──
  {
    const hasDejaVu = (() => { try { return /DejaVu Sans/.test(execSync('fc-list : family', { encoding: 'utf8' })); } catch { return false; } })();
    const FACE = hasDejaVu ? 'DejaVu Sans' : '';
    if (!hasDejaVu) console.log("  SKIP (the face only): DejaVu Sans is not installed here (fc-list : family) — the IM pass runs under this box's own face");
    const imOut = scratch('chan-look');
    fs.mkdirSync(imOut, { recursive: true });
    const IM_LANGS = (process.env.VS_UI_IM_LANGS || 'zh,ja,en').split(',').map((x) => x.trim()).filter(Boolean);
    console.log(`④ the look: the IM pass (${IM_LANGS.join(' + ')} · desktop at 200 / 260 / 340 / 500 px + phone · dark + en light${FACE ? ` · '${FACE}'` : ''}) → ${imOut}`);
    const t1 = Date.now();
    const r2 = spawnSync(process.execPath, [path.join(repo, 'scripts/dbg-comm-surfaces.mjs')], {
      cwd: repo, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024, timeout: 20 * 60 * 1000,
      env: { ...process.env, VS_UI_IM: 'only', VS_UI_FACE: FACE, VS_UI_SHOTS_DIR: imOut, VS_UI_LANGS: IM_LANGS.join(','), VS_UI_VIEWPORTS: 'desktop,mobile', VS_UI_THEMES: 'dark,light', VS_UI_LIGHT_LANGS: 'en' },
    });
    const log2 = (r2.stdout || '') + (r2.stderr || '');
    fs.writeFileSync(path.join(imOut, 'driver.log'), log2);
    ok(r2.status === 0, `the IM pass exited 0 in ${Math.round((Date.now() - t1) / 1000)}s (log: ${path.join(imOut, 'driver.log')})`, r2.status === 0 ? '' : log2.split('\n').slice(-12).join('\n'));
    let idx2 = null;
    try { idx2 = JSON.parse(fs.readFileSync(path.join(imOut, 'index.json'), 'utf-8')); } catch {}
    const imShots = ((idx2 && idx2.shots) || []).filter((x) => x.im);
    ok(!((idx2 && idx2.shots) || []).some((x) => x.name === 'PASS-FAILED'), 'no IM pass failed', JSON.stringify(((idx2 && idx2.shots) || []).filter((x) => x.name === 'PASS-FAILED')));
    const want = ['list-focus-200', 'list-focus-260', 'list-focus-340', 'list-focus-500', 'list-all-260', 'accounts-260', 'win-lark', 'win-lark-top', 'win-lark-hover', 'win-gmail', 'win-gmail-open', 'win-readonly', 'm-list-focus', 'm-win-lark', 'm-win-gmail', 'm-win-readonly',
      // the plain-words dialogs (Grant access… with the picker + the authority answers; Notify… as three questions + the preview)
      'dlg-access', 'dlg-notify', 'dlg-notify-rule', 'm-dlg-access', 'm-dlg-notify', 'm-dlg-notify-rule',
      // B-f467: the Outbox window's rows, and one opened (its full card under it)
      'outbox-rows', 'outbox-open', 'm-outbox-rows', 'm-outbox-open'];
    for (const lang of IM_LANGS) {
      const tags = [`im-${lang}-desktop-dark`, `im-${lang}-mobile-dark`];
      const missing = want.filter((n) => !imShots.some((x) => tags.includes(x.tag) && x.name === n && !x.missing));
      ok(!missing.length, `${lang}: every IM surface was shot and measured (${want.length})`, JSON.stringify(missing));
    }
    const viol = [];
    let groups = 0, avatars = 0, targets = 0;
    for (const sh of imShots) {
      let d = null;
      try { d = JSON.parse(fs.readFileSync(path.join(imOut, sh.file.replace(/\.png$/, '.json')), 'utf-8')); } catch {}
      if (!d) { viol.push({ where: sh.name, what: 'no-json' }); continue; }
      groups += ((d.im && d.im.groups) || []).length; avatars += ((d.im && d.im.avatars) || []).length; targets += ((d.im && d.im.targets) || []).length;
      if (FACE) ok(new RegExp(FACE).test((d.im && d.im.face) || ''), `${d.tag}/${d.name}: measured under '${FACE}'`, (d.im && d.im.face) || '');
      viol.push(...imCensus(d));
    }
    const byKind = viol.reduce((m, x) => ({ ...m, [x.what]: (m[x.what] || 0) + 1 }), {});
    console.log(`  … ${imShots.length} IM shots · ${groups} rows / bars / messages · ${avatars} avatars · ${targets} targets measured; violations ${JSON.stringify(byKind)}`);
    ok(imShots.length >= want.length * IM_LANGS.length && groups > 200 && avatars > 100, 'the census is NON-VACUOUS (it measured the rows, the avatars and the targets it judges)', JSON.stringify({ shots: imShots.length, groups, avatars }));
    ok(viol.length === 0, 'THE LOOK: nothing overlaps, nothing is cut, no part leaves its row, nothing scrolls sideways, every phone target ≥ 36 px, every avatar ≥ 4.5 : 1 and paint — at every rail width, in every language, under the runner\'s face',
      viol.slice(0, 30).map((v) => `${v.what} ${v.where}: ${v.detail}`).join('\n    '));
  }

  console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
  process.exit(fail ? 1 : 0);
}
