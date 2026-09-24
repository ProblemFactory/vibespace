#!/usr/bin/env node
// THE i18n CENSUS OF THE COMMUNICATION PANEL (heavy tier; a3 of the polish,
// docs/design-communication-panel-polish-audit.md §1 — owner 2026-09-17
// "似乎没太做好 i18n").
//
// WHAT IT ASSERTS: under zh AND under ja, every one of the eight surfaces —
// the Channels rail panel, the conversation window, the composer + inline
// approval cards + the Outbox window, the Assign & filter editor, the Reach &
// policy editor, the account dialogs (r4: connect type-first incl. a custom Lark client, re-authorize with the port-busy notice, edit, duplicate, remove refused), the
// Options / Push / Track dialogs, and ⚙ → Integrations — renders ZERO visible
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
// Everything is per-pid (scripts/scratch.mjs); chrome and the worktree server
// are the driver's, torn down by it. Run: node scripts/test-channels-i18n.mjs
// (SKIPs without chrome). VS_UI_LANGS narrows the languages (default zh,ja).
import { spawnSync } from 'node:child_process';
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
  'chan-row-title', 'chan-row-sub', 'chan-track-title', 'chan-track-sub',
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
  'chan-grow-title', 'chan-grow-last', 'chan-src-chip', 'chan-gm-name', 'chan-gpick-name', 'chanmsg-ctx', 'chanmsg-sys-line', 'chan-mention-item',
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
  ['panel', /^panel-02-tracked$/],
  ['window', /^win-01-tracked-sendable$/],
  ['outbox', /^outbox-window$/],
  ['assign-filter', /^dialog-assign-filter$/],
  ['reach', /^dialog-reach$/],
  // r4 (design-integrations-per-account, chunk 3): the account dialogs are the storage dialog
  // component — connect (type-first, Lark + Custom), re-authorize, edit, duplicate, remove refused
  ['account dialogs', /^wizard-01-connect$/],
  ['account dialogs (Lark, custom client)', /^wizard-02-connect-lark-custom$/],
  ['re-authorize', /^wizard-04-reauth-port-busy$/],
  ['edit', /^wizard-05-edit$/],
  ['duplicate', /^wizard-06-duplicate$/],
  ['remove refused', /^wizard-07-remove-refused$/],
  ['options/push/track', /^dialog-(options-lark|push|track)$/],
  ['integrations', /^integ-01-window$/],
];

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let pass = 0, fail = 0;
  const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };

  // ── ① the negative control, BEFORE chrome ──
  console.log('① the PURE census can go red');
  const planted = census([{ text: 'Nothing is fetched yet', paths: ['div.chan-empty < div.chan-list'], surfaces: ['panel-01-fresh'] }]);
  ok(planted.violations.length === 1 && /latin:/.test(planted.violations[0].why), 'NEGATIVE CONTROL: one planted English literal on a chrome path is a violation', JSON.stringify(planted));
  // (the URL sits on a CHROME path here so the pattern rule — not the data-path rule — is what excuses it)
  const excusedData = census([{ text: 'Ops room', paths: ['span.chan-row-title < div.chan-row-line'], surfaces: ['panel-02-tracked'] }, { text: LARK_CALLBACK_URL, paths: ['code < div.mounts-field-hint'], surfaces: ['wizard-02-connect-lark-custom'] }, { text: 'Lark / 飞书', paths: ['b < div.chan-sec-head'], surfaces: ['panel-02-tracked'] }]);
  ok(excusedData.violations.length === 0 && excusedData.excused['data-path:chan-row-title'] === 1 && Object.keys(excusedData.excused).some((k) => k.startsWith('pattern:')), 'CONTROL: a fixture title (by path), a callback URL (by pattern) and a brand beside CJK are excused, each by a NAMED rule', JSON.stringify(excusedData.excused));
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

  console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
  process.exit(fail ? 1 : 0);
}
