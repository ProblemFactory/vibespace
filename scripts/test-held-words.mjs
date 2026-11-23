#!/usr/bin/env node
// test-held-words — THE FAMILY's HELD CODES ON THE PAGE, a census (B-f276 family, 主开发 r3032 unit A, lane bl-phone-ui).
// A store whose file could not be read is HELD (src/store-read-hold.js and the older holds): its route answers the store's code with
// 503 and the HUB's own sentence — English, the file's name, the read's error code. The page says it in its OWN words, from ONE table
// in its refusal pass (src/lib/utils.js HELD_WORDS, beside heldWordsOf; the older holds keep their own branches there), and a held code
// the table does not know yet takes ONE generic sentence by a stated pattern (HELD_CODE_RE). This suite:
//   ① THE CENSUS — every code a route of the tree answers with 503 (read from the source: `status(503).json({… code: '…'`, an error
//     carrying `status: 503` and its `code`, every caller of the store-read hold's create({ code })) is CLASSIFIED: a row of the table,
//     an older hold's own branch, the generic one by the pattern, or NOT A HOLD with its why (NOT_HELD below). A new code with none is
//     RED by name; a NOT_HELD row naming no live code is DEAD (red); a not-held code that matches the pattern is red (it would be worded
//     as a held list).
//   ② THE WORDS — every row's sentence, the generic one and the phone Files card's have their zh and ja rows; none names a file.
//   ③ THE PASS, DRIVEN — the page's refusal words compiled from utils.js's own source (hostsHeldWords … refusalWords, `t` stood in):
//     a held answer of the family is worded by its code, the hub's sentence kept as `said`; an unknown held code takes the generic
//     sentence; another refusal and an answer that is no refusal pass as they came; heldWordsOf agrees.
//   ④ THE PHONE — the Files card (src/lib/phone-files.js) keeps the list's `unread` and says the held list in one sentence.
//   CONTROLS (each RED by name, over a copy in memory): a planted 503 code; a planted hold with a code of its own; the pattern cut; a
//   table row cut; the pass's fallback cut; the card's sentence cut.
// FAST, PURE: source text only — nothing runs, nothing is fetched.
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dictEntries } from './i18n-extract.mjs';
import { anchored } from './scratch.mjs';
import { checker } from './lib/check.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { ok, report } = checker();
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// ── the tree's server sources (src/ outside the page's src/lib, and server.js) ──
function serverFiles() {
  const out = ['server.js'];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.posix.join(dir, e.name);
      if (e.isDirectory()) { if (rel !== 'src/lib' && e.name !== 'node_modules') walk(rel); continue; }
      if (/\.(?:c?js|mjs)$/.test(e.name)) out.push(rel);
    }
  };
  walk('src');
  return out;
}
const SOURCES = new Map(serverFiles().map((f) => [f, read(f)]));

/** every code a source answers with 503, and every code a store-read hold is created with → Map(code → [file, …]) */
function heldCodesOf(sources) {
  const at = new Map();
  const add = (code, f) => { if (!at.has(code)) at.set(code, new Set()); at.get(code).add(f); };
  for (const [f, src] of sources) {
    // the answer's own object (a template's ${…} may sit before its code; never past its closing brace into the next answer)
    for (const m of src.matchAll(/status\(503\)\.json\(\{(?:\$\{[^}]*\}|[^}])*?\bcode: '([A-Za-z0-9_-]+)'/g)) add(m[1], f);
    for (const m of src.matchAll(/\bstatus: 503\b[^;\n]{0,240}?\bcode: '([A-Za-z0-9_-]+)'/g)) add(m[1], f);
    for (const m of src.matchAll(/\bcode: '([A-Za-z0-9_-]+)'[^;\n]{0,60}?\bstatus: 503\b/g)) add(m[1], f);
    if (/require\(['"][./]*store-read-hold\.js['"]\)/.test(src)) for (const m of src.matchAll(/\.create\(\{[\s\S]{0,900}?\bcode: '([A-Za-z0-9_-]+)'/g)) add(m[1], f);
  }
  return at;
}

// ── the page's table, read from src/lib/utils.js ──
const UTILS = read('src/lib/utils.js');
function tableOf(src) {
  const i = src.indexOf('const HELD_WORDS = Object.freeze({'), j = i < 0 ? -1 : src.indexOf('\n});', i);
  const rows = i < 0 || j < 0 ? [] : [...src.slice(i, j).matchAll(/^ {2}'?([A-Za-z0-9_-]+)'?: \(\) =>/gm)].map((m) => m[1]);
  const re = /\nconst HELD_CODE_RE = \/(.+)\/([a-z]*);/.exec(src);
  // the older holds' own branches (heldWordsOf and refusalWords word these codes before the table is asked)
  const older = new Set([...src.matchAll(/d && d\.code === '([A-Za-z0-9_-]+)' \?/g), ...src.matchAll(/body\.code === '([A-Za-z0-9_-]+)'\) return \{ \.\.\.body, said: body\.error/g)].map((m) => m[1]));
  return { rows, pattern: re ? new RegExp(re[1], re[2]) : null, older };
}

// NOT A HOLD: a 503 of the tree that is no store held unread — each with its why (a held list's words would be untrue there)
const NOT_HELD = {
  unavailable: 'a door whose engine is not on this server (a feature off / not wired) — its own sentence',
  'not-durable': 'a person\'s act kept in memory, not on disk yet — channel-words / ws words «not on disk yet» (written later)',
  not_durable: 'the same as not-durable (the exit routes\' spelling)',
  no_engine: 'a browser engine plugin not installed',
  'no-engine': 'a browser engine plugin not installed (the other spelling)',
  not_running: 'a service / daemon not running — its start is the act',
  no_audit: 'the audit log engine absent',
  host_unavailable: 'a paired machine not answering — the machine\'s own state, not a list of VibeSpace\'s',
  transcript_reader_restarting: 'the transcript reader restarting — a moment\'s wait',
  storage_parked: 'a mount\'s network storage parked (the person\'s own storage, not a VibeSpace list) — mount-door\'s parked sentence',
  'storage-blocked': 'a mount root not answering (mount-door) — the person\'s storage, not a VibeSpace list',
  'still-reading': 'a summary still being read past its bound — a wait',
  pin_not_saved: 'a pin whose save the storage refused — its own words',
  parse_busy: 'the parser pool busy — a wait',
  offline: 'a machine or desktop offline',
  no_window_engine: 'no window engine on this machine',
  no_asks: 'the ask channel absent',
  'job-token': 'a job token not minted (the vault) — its own words',
  'grant-unavailable': 'the grants engine absent',
  finding: 'an attachment being found — a wait',
  engine_unwired: 'an engine not wired at this start',
  'count-failed': 'a usage count that failed — a retry',
  LOADING: 'the usage history still loading at the start — a wait',
  'not-on-disk': 'a person\'s start refused because its run could not be saved (a write, not a read)',
  proposal_door_not_ready: 'the proposal card not on this instance yet — the job\'s row says what to tick',
  write_never_started: 'a write to a machine that never started — not saved, said',
  write_unknown: 'a write to a machine that did not answer — it may have been saved, said',
};

function census(codes, table) {
  const red = [], held = [], generic = [];
  for (const [code, files] of [...codes].sort(([a], [b]) => a.localeCompare(b))) {
    const row = table.rows.includes(code) || table.older.has(code), pat = !!table.pattern && table.pattern.test(code), not = Object.prototype.hasOwnProperty.call(NOT_HELD, code);
    if (not && pat) red.push(`${code}: listed NOT_HELD but the pattern words it as a held list (${[...files].join(', ')})`);
    else if (row) held.push(code);
    else if (pat) generic.push(code);
    else if (!not) red.push(`${code}: a 503 with no row, no older branch, not the pattern and not NOT_HELD (${[...files].join(', ')}) — classify it`);
  }
  const dead = Object.keys(NOT_HELD).filter((c) => !codes.has(c));
  return { red, held, generic, dead };
}

console.log('① THE CENSUS — every 503 code of the tree, classified');
const CODES = heldCodesOf(SOURCES), TABLE = tableOf(UTILS);
const C = census(CODES, TABLE);
ok(TABLE.rows.length >= 4 && !!TABLE.pattern && TABLE.older.size >= 4, 'control setup: the table, its pattern and the older holds\' branches are read from src/lib/utils.js', { rows: TABLE.rows, pattern: String(TABLE.pattern), older: [...TABLE.older] });
ok(['storage_unread', 'tokens_unread', 'plugins_unread', 'hosts-unread', 'store_unread'].every((c) => CODES.has(c)), 'control setup: the census finds the helper\'s three callers\' codes and the older holds\' 503s in the tree', [...CODES.keys()]);
ok(C.red.length === 0, `every 503 code of the tree is classified — ${C.held.length} worded by a row or an older branch (${C.held.join(', ')}), ${C.generic.length} by the generic sentence (${C.generic.join(', ')}), ${Object.keys(NOT_HELD).length - C.dead.length} not a hold`, C.red);
ok(C.dead.length === 0, 'every NOT_HELD row names a live 503 code (a dead row is red)', C.dead);
ok(TABLE.rows.every((c) => CODES.has(c)), 'every row of the table names a code the tree answers (no row for nothing)', TABLE.rows.filter((c) => !CODES.has(c)));

console.log('② THE WORDS — zh and ja for every sentence; no file named');
const rowSentences = (() => {
  const i = UTILS.indexOf('const HELD_WORDS = Object.freeze({'), j = UTILS.indexOf('\n});', i);
  const own = [...UTILS.slice(i, j).matchAll(/\bt\('((?:[^'\\]|\\.)*)'\)/g)].map((m) => m[1]);
  const gen = /export function heldGenericWords\(\) \{ return t\('((?:[^'\\]|\\.)*)'\); \}/.exec(UTILS);
  const plug = /export function pluginsHeldWords\(\) \{ return t\('((?:[^'\\]|\\.)*)'\); \}/.exec(UTILS);
  return [...own, gen && gen[1], plug && plug[1]].filter(Boolean).map((s) => s.replace(/\\'/g, "'"));
})();
const PHONE = read('src/lib/phone-files.js');
const PHONE_SENT = 'VibeSpace cannot read its storage list right now, so your storage is not shown here — it comes back by itself when the list reads.';
for (const lang of ['zh', 'ja']) {
  const keys = new Set(dictEntries(read(`src/lib/i18n-${lang}.js`)).map((e) => e.key));
  const missing = [...rowSentences, PHONE_SENT].filter((s) => !keys.has(s));
  ok(rowSentences.length >= 5 && missing.length === 0, `every held sentence (${rowSentences.length} of the table, the generic one, the phone card's) has its ${lang} row`, missing);
}
ok(rowSentences.every((s) => !/\.json\b|data folder|\(E[A-Z]+\)/.test(s)), 'no held sentence names a file, the data folder or a read\'s error code', rowSentences.filter((s) => /\.json\b|data folder|\(E[A-Z]+\)/.test(s)));

console.log('③ THE PASS, DRIVEN — utils.js\'s own refusal words, compiled from its source');
const passOf = (src) => {
  const i = src.indexOf('export function hostsHeldWords() {'), j = src.indexOf('\n}\n', src.indexOf('function refusalWords(body) {'));
  if (i < 0 || j < 0) return null;
  // eslint-disable-next-line no-new-func
  return new Function('t', `${src.slice(i, j + 2).replaceAll('export function', 'function')}\nreturn { refusalWords, heldWordsOf };`)((k) => `«${k}»`);
};
const HUB = (code, file) => ({ error: `changing it: ${file} in VibeSpace's data folder could not be read (EIO); VibeSpace reads it again every few minutes.`, code });
const drive = (P) => {
  if (!P) return null;
  const out = {};
  for (const [code, file] of [['storage_unread', 'mounts.json'], ['tokens_unread', 'mount-tokens.json'], ['plugins_unread', 'plugins.json'], ['store-blocked', 'index.json'], ['TASK_GROUPS_UNREAD', 'task-groups.json'], ['records-unread', 'jobs.json'], ['frobs_unread', 'frobs.json']]) {
    const body = HUB(code, file), w = P.refusalWords(body);
    out[code] = { error: w.error, said: w.said, code: w.code, held: P.heldWordsOf(body) };
  }
  out.other = P.refusalWords({ error: 'no such mount', code: 'not-found' });
  out.success = P.refusalWords({ ok: true, code: 'records-unread', jobs: [] });
  return out;
};
const D = drive(passOf(UTILS));
const GEN = '«VibeSpace cannot read one of its saved lists right now — nothing was changed. Try again in a few minutes.»';
const word = (c) => (D && D[c] ? D[c].error : null);
ok(!!D && word('storage_unread') === '«VibeSpace cannot read its storage list right now — nothing was changed. Try again in a few minutes (it reads it again by itself).»'
  && word('tokens_unread') === '«VibeSpace cannot read its folder links right now — nothing was changed. Try again in a few minutes (it reads them again by itself).»'
  && /^«VibeSpace cannot read its plugins’ settings right now — nothing was changed/.test(word('plugins_unread') || '') && /^«Paused: a channels file could not be read/.test(word('store-blocked') || ''),
  'a held answer of the family is worded by its code, from the table: the storage list, the folder links, the plugins\' settings, the channels\' held files', D);
ok(!!D && ['TASK_GROUPS_UNREAD', 'records-unread', 'frobs_unread'].every((c) => word(c) === GEN), 'a held code the table does not know yet (the pattern) takes the ONE generic sentence — never the hub\'s English', D && { TASK_GROUPS_UNREAD: word('TASK_GROUPS_UNREAD'), frobs_unread: word('frobs_unread') });
ok(!!D && Object.keys(D).filter((k) => !['other', 'success'].includes(k)).every((k) => D[k].said && /data folder/.test(D[k].said) && !/\.json|data folder|\(EIO\)/.test(D[k].error) && D[k].held === D[k].error),
  'the hub\'s own sentence is kept as `said` (the journal\'s), the page\'s carries no file name; heldWordsOf agrees with the pass', D);
ok(!!D && D.other.error === 'no such mount' && D.success.error === undefined && D.success.ok === true, 'another refusal passes as it came; an answer that is no refusal is not touched (a held code on a success is no refusal)', D && { other: D.other, success: D.success });

console.log('④ THE PHONE — the Files card says a held storage list');
const PH_KEEP = "fetchJson('/api/mounts').then((d) => ({ mounts: d && Array.isArray(d.mounts) ? d.mounts : [], held: !!(d && d.unread) }))";
const PH_SAY = `held.textContent = m.held ? t('${PHONE_SENT}') : '';`;
ok(PHONE.includes(PH_KEEP) && PHONE.includes(PH_SAY) && PHONE.includes('held.hidden = !m.held;'), 'the phone Files card keeps the list\'s `unread` and says the held list in one sentence under its chips (shown only while held)');

console.log('CONTROLS — each over a copy in memory, RED by name');
{
  const planted = new Map(SOURCES); planted.set('src/frobs.js', "res.status(503).json({ error: 'frobs gone', code: 'frob-gone' });\n");
  const P1 = census(heldCodesOf(planted), TABLE);
  ok(P1.red.some((r) => r.startsWith('frob-gone:')), 'CONTROL: a new 503 code with no row, no branch, not the pattern and not NOT_HELD is RED by name', P1.red);
  const planted2 = new Map(SOURCES); planted2.set('src/frobs2.js', "const HOLD = require('./store-read-hold.js');\nconst h = HOLD.create({ file, code: 'frob_bad', aside, words });\n");
  const P2 = census(heldCodesOf(planted2), TABLE);
  ok(P2.red.some((r) => r.startsWith('frob_bad:')), 'CONTROL: a new store-read hold created with a code of its own (not the pattern, no row) is RED by name', P2.red);
  const cut = tableOf(anchored(UTILS, "\nconst HELD_CODE_RE = /(?:^|[_-])(?:unread|unreadable)$/i;", '\nconst HELD_CODE_RE = /(?!)/;', 'held-words: the pattern cut'));
  const P3 = census(CODES, cut);
  ok(P3.red.some((r) => r.startsWith('TASK_GROUPS_UNREAD:')), 'CONTROL: the pattern cut — the held codes it carried (TASK_GROUPS_UNREAD, …) are RED by name', P3.red);
  const ROW = "  storage_unread: () => t('VibeSpace cannot read its storage list right now — nothing was changed. Try again in a few minutes (it reads it again by itself).'),   // mounts.json (src/mounts.js)\n";
  const D4 = drive(passOf(anchored(UTILS, ROW, '', 'held-words: a row cut')));
  ok(!!D4 && D4.storage_unread.error === GEN, 'CONTROL: the storage list\'s row cut — its own sentence is lost (the generic one stands in): the row\'s check above goes RED', D4 && D4.storage_unread);
  const FB = "  const fw = body && typeof body === 'object' && body.code && (body.error || body.ok === false) ? familyHeldWords(body.code) : null;";
  const D5 = drive(passOf(anchored(UTILS, FB, '  const fw = null;', 'held-words: the fallback cut')));
  ok(!!D5 && D5.storage_unread.error === HUB('storage_unread', 'mounts.json').error, 'CONTROL: the pass\'s fallback cut — the hub\'s English (the file\'s name, the read\'s error) reaches the page: RED', D5 && D5.storage_unread);
  const PHX = anchored(PHONE, PH_SAY, "held.textContent = '';", 'held-words: the card\'s sentence cut');
  ok(!PHX.includes(PH_SAY), 'CONTROL: the Files card\'s sentence cut — ④ goes RED (a held list reads as no storage again)');
}

report();
