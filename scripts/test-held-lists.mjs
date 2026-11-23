#!/usr/bin/env node
// test-held-lists — THE FAMILY's ONE NOTICE (B-f276 family unit B, 主开发 r3032, lane bl-phone-ui). While a list of VibeSpace's cannot be
// read (src/store-read-hold.js and the older holds bridged in src/server/mounts-plugins-wiring.js), ONE chip «Lists unreadable · N» says
// so in the vault chip's slots, and the system panel's section names each list by its PLAIN name with ONE «Read again now». This suite:
//   ① THE HUB HALF over the REAL helper — a hold made by a PLACED refusal (the store's file is a directory: every read answers EISDIR):
//     its start is broadcast ONCE (what is held by its base name, since when, the next try — no path, no value), the press reads every
//     held list again (the helper's and the older ones'), a second press inside the gap and a press while one runs are refused BY NAME,
//     the lift is broadcast and empties the list; an older hold joins by its facts, its read-again and its lift.
//   ② THE WORDS (PURE src/lib/held-lists-words.js): a plain name for every list the hub can name, «a saved list» otherwise; the chip's,
//     a row's (since, next try), the section's, the press's answers; zh and ja for every sentence; no file named.
//   ③ THE PAGE's WIRING (source): the chip in the vault chip's two slots beside For you, its press opens the system panel; the panel's
//     section; app.js's first read, the broadcast, the re-seat; the press's route refuses an agent's token; nothing greyed.
//   ④ THE NAMES' CENSUS: every store the helper holds (its callers' files) has a plain name — a new caller with none is red by name.
//   REDs over copies in memory: the helper without the start's change (no broadcast at a hold); the press without its gap (a second press
//   reads again at once); the names census over a planted caller.
// FAST, in-process: the real helper on a scratch folder, nothing spawned, nothing fetched.
import { scratch, anchored } from './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { dictEntries } from './i18n-extract.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { ok, report } = checker();
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const ROOT = scratch('held-lists');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { /* gone */ } });
const Module = require('node:module');
const memOf = (rel, from, to, what) => { const file = path.join(REPO, rel); const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m._compile(anchored(fs.readFileSync(file, 'utf8'), from, to, what), file); return m.exports; };
const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

console.log('① THE HUB HALF — the real helper, a placed refusal (the store\'s file is a directory)');
const HOLD = require(path.join(REPO, 'src/store-read-hold.js'));
const HL = require(path.join(REPO, 'src/server/held-lists.js'));
async function scene(hold, hlMod, tag) {
  const dir = path.join(ROOT, tag); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'mounts.json'); fs.mkdirSync(file, { recursive: true });   // THE PLACED REFUSAL: every read of it answers EISDIR
  let clock = 1_000_000, olderHeld = true, olderPressed = 0, liftOlder = null;
  const casts = [];
  const older = { key: 'user-todos', facts: () => (olderHeld ? { since: 999_000 } : null), readAgain: async () => { olderPressed++; olderHeld = false; return true; }, onLift: (fn) => { liftOlder = fn; } };
  const hl = hlMod.create({ hold, broadcast: (m) => casts.push(JSON.parse(JSON.stringify(m))), older: [older], now: () => clock });
  const h = hold.create({ file, valid: (v) => !!v && typeof v === 'object' && !Array.isArray(v), aside: (mark) => file + '.corrupt-' + mark, words: () => 'the hub\'s words', code: 'storage_unread', now: () => clock });
  const started = h.start({ state: 'unreadable', code: 'EISDIR', why: 'the read failed' });
  const atStart = casts.slice();
  const first = await hl.readAgain();
  const tooSoon = await hl.readAgain();
  clock += hlMod.PRESS_GAP_MS + 1;
  const p1 = hl.readAgain(), p2 = await hl.readAgain(); await p1;   // a press while one runs
  fs.rmSync(file, { recursive: true, force: true }); fs.writeFileSync(file, '{}');   // the storage answers again
  clock += hlMod.PRESS_GAP_MS + 1;
  const lift = await hl.readAgain();
  await tick(10);
  const out = { started, atStart, first, tooSoon, running: p2, lift, casts, olderPressed, liftOlder: typeof liftOlder, after: hl.list() };
  h.stop(); hl.stop();
  return out;
}
const S = await scene(HOLD, HL, 'now');
const row0 = S.atStart[0] && S.atStart[0].lists && S.atStart[0].lists.find((r) => r.what === 'mounts.json');
ok(S.started === 'held' && S.atStart.length === 1 && S.atStart[0].type === 'held-lists' && !!row0 && row0.since === 1_000_000 && row0.next === 1_000_000 + 30_000 && row0.readAgain === true && S.atStart[0].lists.some((r) => r.key === 'user-todos'),
  'a hold\'s start is broadcast ONCE: what is held (its base name), since when, the next try (the ladder\'s first rung), its read-again; the older hold beside it', S.atStart);
ok(!JSON.stringify(S.casts).includes(ROOT) && !JSON.stringify(S.casts).includes('the hub\'s words'), 'the broadcast names no path and carries no words or value of the store (the page words it by its plain name)', S.casts.map((c) => c.lists));
ok(S.first.ok === true && S.olderPressed === 1 && S.first.lists.length === 1 && S.first.lists[0].what === 'mounts.json', '«Read again now» reads every held list again — the helper\'s (still a directory: held) and the older one\'s (it read: gone from the list)', S.first);
ok(S.tooSoon.ok === false && S.tooSoon.code === 'held_read_too_soon' && S.tooSoon.retryAfterMs > 0 && S.running.ok === false && S.running.code === 'held_read_running', 'a second press inside the gap, and a press while one runs, are refused BY NAME (nothing greyed: the page says each)', { tooSoon: S.tooSoon, running: S.running });
const last = S.casts[S.casts.length - 1];
ok(S.lift.ok === true && S.lift.read === true && S.after.length === 0 && !!last && Array.isArray(last.lists) && last.lists.length === 0, 'the storage answering again: the press lifts the hold — broadcast with an EMPTY list (the chip goes by itself), the list empty', { lift: S.lift, last });
ok(S.liftOlder === 'function', 'an older hold\'s lift is heard (its onLift was asked for the broadcast)');
// RED: the helper without the start's change — no broadcast at a hold
const HOLD_R = memOf('src/store-read-hold.js', "    changed();   // B-f276 unit B: the family's notice hears the set change\n", '', 'held-lists: the start\'s change cut');
const HL_H = memOf('src/server/held-lists.js', "const HOLD = require('../store-read-hold.js');", "const HOLD = null;", 'held-lists: a copy taking the helper it is handed');
const SR1 = await scene(HOLD_R, HL_H, 'red-start');
ok(SR1.atStart.length === 0, 'RED control: the helper without the start\'s change — a hold begins and nothing is broadcast (the chip would not stand)', SR1.atStart);
// RED: the press without its gap
const HL_G = memOf('src/server/held-lists.js', "    if (pressAt && at - pressAt < PRESS_GAP_MS) return { ok: false, code: 'held_read_too_soon', retryAfterMs: PRESS_GAP_MS - (at - pressAt), error: 'the lists were read again a moment ago', lists: list() };\n", '', 'held-lists: the gap cut');
const SR2 = await scene(HOLD, HL_G, 'red-gap');
ok(SR2.tooSoon.ok === true, 'RED control: the press without its gap — a second press reads every list again at once', SR2.tooSoon);

console.log('② THE WORDS — PURE src/lib/held-lists-words.js');
const W = await import(pathToFileURL(path.join(REPO, 'src/lib/held-lists-words.js')).href);
const tt = (k, p) => String(k).replace(/\{(\w+)\}/g, (m, n) => (p && p[n] !== undefined ? String(p[n]) : m));
const NAMES = Object.fromEntries(W.HELD_NAMED.map((k) => [k, W.heldListName(k, tt)]));
ok(NAMES['mounts.json'] === 'the storage list' && NAMES['mount-tokens.json'] === 'the folder links' && NAMES['plugins.json'] === 'the plugins’ settings' && NAMES['user-todos'] === 'For you' && NAMES['task-groups'] === 'the Task Groups' && NAMES.hosts === 'the paired machines' && W.heldListName('frobs.json', tt) === 'a saved list',
  'a plain name for every list the hub can name (the helper\'s stores, the older holds); «a saved list» for one not named yet — never its file', NAMES);
ok(W.heldChipWords(3, tt) === 'Lists unreadable · 3' && W.heldRowWords({ what: 'plugins.json' }, tt, { since: '09:12', next: '09:13' }) === 'the plugins’ settings — since 09:12, next try 09:13' && W.heldRowWords({ what: 'hosts' }, tt, { since: '09:12' }) === 'the paired machines — since 09:12' && W.heldRowWords({ what: 'task-groups' }, tt) === 'the Task Groups',
  'the chip says how many; a row says its plain name, since when and the next try (each only when known)');
const PW = [W.heldPressWords(null, tt), W.heldPressWords({ ok: false, code: 'held_read_too_soon' }, tt), W.heldPressWords({ ok: false, code: 'held_read_running' }, tt), W.heldPressWords({ ok: false, error: 'the hub\'s English' }, tt), W.heldPressWords({ ok: true, lists: [{}, {}] }, tt), W.heldPressWords({ ok: true, lists: [] }, tt)];
ok(PW[0].tone === 'error' && /just read again/.test(PW[1].text) && /being read again/.test(PW[2].text) && !PW[3].text.includes('hub') && PW[3].tone === 'error' && /^2 still could not be read/.test(PW[4].text) && PW[5].text === 'Every list reads again.',
  'every answer of the press reaches the person in the page\'s words — never the hub\'s English', PW.map((x) => x.text));
const WSRC = read('src/lib/held-lists-words.js');
const KEYS = [...WSRC.matchAll(/i18nKey\('((?:[^'\\]|\\.)*)'\)/g)].map((m) => m[1].replace(/\\'/g, "'"));
for (const lang of ['zh', 'ja']) {
  const have = new Set(dictEntries(read(`src/lib/i18n-${lang}.js`)).map((e) => e.key));
  const missing = KEYS.filter((k) => !have.has(k));
  ok(KEYS.length >= 18 && missing.length === 0, `every sentence of the notice (${KEYS.length}) has its ${lang} row`, missing);
}
ok(KEYS.every((k) => !/\.json\b|data folder/.test(k)), 'no sentence of the notice names a file or the data folder');

console.log('③ THE PAGE\'s WIRING (source)');
const PAGE = read('src/lib/held-lists.js'), APP = read('src/lib/app.js'), RAIL = read('src/lib/sidebar-rail.js'), WIRE = read('src/server/mounts-plugins-wiring.js'), VAULT = read('src/lib/vault-unlock.js');
ok(PAGE.includes("const CHIP_SLOTS = [['taskbar-tray', 'taskbar-user-todos', 'taskbar-held'], ['mobile-nav', 'mobile-nav-todos', 'mobile-nav-held']];") && VAULT.includes("const CHIP_SLOTS = [['taskbar-tray', 'taskbar-user-todos', 'taskbar-vault'], ['mobile-nav', 'mobile-nav-todos', 'mobile-nav-vault']];"),
  'the chip stands in the vault chip\'s own two slots — beside For you in the taskbar\'s tray and in the phone\'s nav');
ok(PAGE.includes("chip.onclick = () => openHeldSection();") && PAGE.includes("openRailPanel(app, 'system');") && PAGE.includes("document.querySelector('.sys-held')"), 'the chip\'s press opens the system panel and brings its section into view — the act lives there, never behind the chip alone');
ok(RAIL.includes('<div class="sys-held" hidden></div>') && RAIL.includes("paintHeldLists(c.querySelector('.sys-held'));"), 'the system panel carries the section «Lists that could not be read» (drawn only while one is held)');
ok(APP.includes("initHeldLists(this);") && APP.includes("if (msg.type === 'held-lists') applyHeldLists(msg.lists);") && APP.includes("placeHeldChip();"), 'app.js: the first read at boot, the hub\'s broadcast, the chip re-seated after every arrangement (as the vault\'s)');
ok(/app\.post\('\/api\/held-lists\/read-again', async \(req, res\) => \{\n {2}if \(isAgentBearer\(req\)\) return res\.status\(403\)/.test(WIRE) && WIRE.includes("app.get('/api/held-lists', (req, res) => res.json({ lists: heldLists.list() }));"), 'the press\'s route refuses an agent\'s token before anything is read again (a person\'s press); the list is the page\'s first read');
ok(!/\.disabled\s*=\s*true/.test(PAGE), 'nothing of the notice is greyed: a press while one runs is said, never disabled');

console.log('④ THE NAMES\' CENSUS — every store the helper holds has a plain name');
function heldStoreFiles(files) {
  const out = new Map();
  for (const [f, src] of files) {
    if (!/require\(['"][./]*store-read-hold\.js['"]\)/.test(src) || /held-lists\.js$/.test(f)) continue;
    const names = [...src.matchAll(/_file = path\.join\([^)]*'([A-Za-z0-9._-]+\.json)'\)/g)].map((m) => m[1]);
    out.set(f, names);
  }
  return out;
}
const srcFiles = () => { const out = new Map(); const walk = (d) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const r = path.posix.join(d, e.name); if (e.isDirectory()) { if (r !== 'src/lib') walk(r); } else if (/\.(?:c?js)$/.test(e.name)) out.set(r, read(r)); } }; walk('src'); return out; };
const STORES = heldStoreFiles(srcFiles());
const unnamed = (stores) => [...stores].flatMap(([f, names]) => (names.length ? names.filter((n) => !W.HELD_NAMED.includes(n)).map((n) => `${n} (${f})`) : [`${f}: its store file is not found by the census`]));
ok(STORES.size >= 3 && unnamed(STORES).length === 0, `every store the helper holds has a plain name (${[...STORES.values()].flat().join(', ')})`, unnamed(STORES));
const planted = new Map(STORES); planted.set('src/frobs.js', ['frobs.json']);
ok(unnamed(planted).some((x) => x.startsWith('frobs.json')), 'CONTROL: a new store held by the helper with no plain name is RED by name', unnamed(planted));

report();
