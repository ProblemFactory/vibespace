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
//   ④ THE NAMES' CENSUS: every store the helper holds (its callers' files) has a plain name — a new caller with none is red by name;
//     a file that only ASKS the helper (its kept copies) holds nothing through it and needs no row (r3354).
//   ⑤ THE FOLLOW (主开发 r3284): every list the hub answers carries its mark and the page drops an answer older than its last broadcast;
//     the paired machines' wait, let go past their bound, is armed again (the real hosts.js whenRead, the wiring's own row); the chip's
//     press scrolls an already-open section at once; a next try that passes while the section is open is worded again by its timer; the
//     chips beside For you keep ONE order whichever draws first — the page's module and customize-mode.js compiled from their source.
//   REDs over copies in memory: the helper without the start's change (no broadcast at a hold); the press without its gap (a second press
//   reads again at once); the names census over a planted caller, an unmapped caller, a second store in a mapped file; each ⑤ leg's cure cut.
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
const { ok, report } = checker({ whole: true });   // r3928: a failing line's list printed whole, one item a line
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
ok(S.liftOlder === 'function', 'an older hold\'s lift signal was armed (its onLift handed the broadcast)');
// r3212 MUST 2: A BRIDGED STORE THAT LIFTS BY ITSELF IS BROADCAST — its own lift signal, not a press, not another hold's change
{
  let held = true, fire = null, ready = false, reenter = 0;
  const casts = [];
  const selfLift = { key: 'task-groups', facts: () => (held ? { since: 5 } : null), readAgain: async () => false, onLift: (fn) => { if (!ready) return false; fire = fn; return true; } };   // its object comes later (the Task Groups' manager)
  const atOnce = { key: 'hosts', facts: () => null, onLift: (fn) => { reenter++; fn(); return true; } };   // a signal that answers at once (not held): say → list → arm re-enters
  const hl = HL.create({ broadcast: (m) => casts.push(m), older: [selfLift, atOnce], now: () => 1 });
  const before = fire;
  ready = true; hl.list();   // the next list arms it (lazily)
  hl.say();
  const n0 = casts.length;
  held = false; if (fire) fire();   // the store read again by itself and lifted
  const last = casts[casts.length - 1];
  ok(before === null && typeof fire === 'function' && reenter === 1 && casts.length === n0 + 1 && !!last && !last.lists.some((r) => r.key === 'task-groups'),
    'r3212: a bridged store that lifts BY ITSELF is broadcast through its own lift signal (armed lazily once its object exists; a signal that answers at once re-enters once, never loops)', { armedLate: typeof fire, reenter, casts: casts.length - n0 });
  hl.stop();
}
// r3212 small: the press answers within its bound — a read that never answers (a hung mount) holds neither it nor a later press
{
  let clock = 10;
  const hung = { key: 'user-todos', facts: () => ({ since: 1 }), readAgain: () => new Promise(() => { }), onLift: () => true };
  const hl = HL.create({ broadcast: () => { }, older: [hung], now: () => clock, boundMs: 40 });
  const a = await hl.readAgain();   // it answers at its bound (the leg would hang without it — no wall clock read here)
  clock += HL.PRESS_GAP_MS + 1; const b = await hl.readAgain();
  ok(a.ok === true && a.timedOut === true && a.lists.length === 1 && b.code !== 'held_read_running' && b.timedOut === true,
    'r3212: a press whose read never answers returns at its bound with the true state (still held), and the next press is no «running» for good', { a: { ok: a.ok, timedOut: a.timedOut }, b: b.code || b.ok });
  hl.stop();
}
// RED: the helper without the start's change — no broadcast at a hold
const HOLD_R = memOf('src/store-read-hold.js', "    changed();   // B-f276 unit B: the family's notice hears the set change\n", '', 'held-lists: the start\'s change cut');
const HL_H = memOf('src/server/held-lists.js', "const HOLD = require('../store-read-hold.js');", "const HOLD = null;", 'held-lists: a copy taking the helper it is handed');
const SR1 = await scene(HOLD_R, HL_H, 'red-start');
ok(SR1.atStart.length === 0, 'RED control: the helper without the start\'s change — a hold begins and nothing is broadcast (the chip would not stand)', SR1.atStart);
// RED: the press without its gap
const HL_G = memOf('src/server/held-lists.js', "    if (pressAt && at - pressAt < PRESS_GAP_MS) return { ok: false, code: 'held_read_too_soon', retryAfterMs: PRESS_GAP_MS - (at - pressAt), error: 'the lists were read again a moment ago', lists: list(), ...mark() };\n", '', 'held-lists: the gap cut');
const SR2 = await scene(HOLD, HL_G, 'red-gap');
ok(SR2.tooSoon.ok === true, 'RED control: the press without its gap — a second press reads every list again at once', SR2.tooSoon);

console.log('② THE WORDS — PURE src/lib/held-lists-words.js');
const W = await import(pathToFileURL(path.join(REPO, 'src/lib/held-lists-words.js')).href);
const tt = (k, p) => String(k).replace(/\{(\w+)\}/g, (m, n) => (p && p[n] !== undefined ? String(p[n]) : m));
const NAMES = Object.fromEntries(W.HELD_NAMED.map((k) => [k, W.heldListName(k, tt)]));
ok(NAMES['mounts.json'] === 'the storage list' && NAMES['mount-tokens.json'] === 'the folder links' && NAMES['plugins.json'] === 'the plugins’ settings' && NAMES['user-todos'] === 'For you' && NAMES['task-groups'] === 'the Task Groups' && NAMES['hosts.json'] === 'the paired machines' && NAMES['machine-mounts.json'] === 'the mounts of your paired machines' && W.heldListName('frobs.json', tt) === 'a saved list',
  'a plain name for every list the hub can name (the helper\'s stores, the older holds); «a saved list» for one not named yet — never its file', NAMES);
ok(W.heldChipWords(3, tt) === 'Lists unreadable · 3' && W.heldRowWords({ what: 'plugins.json' }, tt, { since: '09:12', next: '09:13' }) === 'the plugins’ settings — since 09:12, next try 09:13' && W.heldRowWords({ what: 'hosts.json' }, tt, { since: '09:12' }) === 'the paired machines — since 09:12' && W.heldRowWords({ what: 'machine-mounts.json' }, tt) === 'the mounts of your paired machines' && W.heldRowWords({ what: 'task-groups' }, tt) === 'the Task Groups',
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
ok(PAGE.includes("chip.onclick = () => openHeldSection();") && PAGE.includes("openRailPanel(app, 'system');") && PAGE.includes('scrollWanted = true;'), 'the chip\'s press opens the system panel and brings its section into view — the act lives there, never behind the chip alone');
ok(RAIL.includes('<div class="sys-held" hidden></div>') && RAIL.includes("paintHeldLists(c.querySelector('.sys-held'));"), 'the system panel carries the section «Lists that could not be read» (drawn only while one is held)');
ok(APP.includes("initHeldLists(this);") && APP.includes("if (msg.type === 'held-lists') applyHeldLists(msg.lists, msg);") && APP.includes("placeHeldChip();"), 'app.js: the first read at boot, the hub\'s broadcast (with its mark), the chip re-seated after every arrangement (as the vault\'s)');
ok(WIRE.includes("app.get('/api/held-lists', (req, res) => res.json({ lists: heldLists.list(), ...heldLists.mark() }));") && !/held-lists\/read-again[\s\S]{0,200}isAgentBearer\(req\)/.test(WIRE), 'the list is the page\'s first read; the press\'s route asks no file-local token rule (the one verdict below)');
ok(!/\.disabled\s*=\s*true/.test(PAGE), 'nothing of the notice is greyed: a press while one runs is said, never disabled');
ok(APP.includes("      refreshStoreHolds();   // B-225b R7: a hold said — or lifted — while this page was away (its word never arrives)\n      refreshHeldLists().catch(() => { });"), 'r3212 MUST 1: the held lists are read again at EVERY reconnect, beside the store strip\'s own re-read (a lift broadcast while the page was away is never missed)');
const WARM = read('src/lib/warmth-chrome.js'), CM = read('src/lib/customize-mode.js');
ok(PAGE.includes("seatBeside(chip, besideId, document.getElementById(hostId));") && WARM.includes("seatBeside(chip, 'taskbar-user-todos', document.getElementById('taskbar-tray'));")
  && VAULT.includes("if (chip.parentNode !== slot.parent || chip.nextSibling !== slot.before) slot.parent.insertBefore(chip, slot.before);")
  && CM.includes("const BESIDE_ORDER = Object.freeze([Object.freeze(['taskbar-warmth', 'taskbar-held', 'taskbar-vault']), Object.freeze(['mobile-nav-held', 'mobile-nav-vault'])]);"),
  'r3284: the chips beside For you are seated by ONE order (customize-mode.js BESIDE_ORDER) — the held lists\' and the cache warmth\'s through seatBeside; the vault\'s lock is each row\'s last, so its own seating (just before For you) is that order (⑤ drives it)');
ok(PAGE.includes('scrollWanted = true;') && PAGE.includes('if (scrollWanted) { scrollWanted = false;') && !PAGE.includes('setTimeout(() => { try { document.querySelector'), 'r3212: the section scrolls into view at its FIRST draw after the chip opened the panel (never a fixed wait that can come before it exists)');   // stale-pins: kept — a deliberate absence check (the fixed wait the cure removed)
ok(PAGE.includes('r.next > at ? stampAt(r.next) : heldSoonWord(t)'), 'r3212: a next try that has passed is worded at paint («in a moment»), never a time in the past');
ok(/app\.post\('\/api\/held-lists\/read-again', async \(req, res\) => \{\n {2}if \(require\('\.\.\/write-origin\.js'\)\.pressBearer\(req\.headers\)\) return res\.status\(403\)/.test(WIRE), 'r3212: the press refuses EVERY bearer by the tree\'s ONE verdict (write-origin.js pressBearer: an agent\'s, a job\'s, an automation\'s) — a person\'s press');
// r3212 MUST 2 + small: EVERY bridged row hands a lift signal, and every name it asks is a method its production object carries
const OLDER = (() => { const i = WIRE.indexOf('  older: ['), j = WIRE.indexOf('\n  ],\n});', i); return i < 0 || j < 0 ? [] : WIRE.slice(i, j).split(/\n    \{ key: '/).slice(1).map((b) => ({ key: b.slice(0, b.indexOf("'")), body: b })); })();
const liftless = (rows) => rows.filter((r) => !/\bonLift: \(fn(?:, again)?\) =>/.test(r.body)).map((r) => r.key);
ok(OLDER.length === 2 && liftless(OLDER).length === 0,   // 2b: the paired machines are on the helper (no bridged row)
   `every bridged row (${OLDER.map((r) => r.key).join(', ')}) hands a lift signal`, liftless(OLDER));
ok(liftless([...OLDER, { key: 'frobs', body: "frobs', facts: () => null, readAgain: () => frobs.readAgain() }" }]).includes('frobs'), 'CONTROL: a bridged row without a lift signal is RED by name');
const METHODS = { 'user-todos': ['src/user-todos.js', ['unreadState', 'readAgain', 'whenRead']], 'task-groups': ['src/task-groups.js', ['unreadState', 'readAgain', 'onLift']] };   // 2b: hosts — on the helper, listed by its own row
const missingNames = Object.entries(METHODS).flatMap(([key, [file, names]]) => { const src = read(file), row = OLDER.find((r) => r.key === key); return names.filter((n) => !new RegExp(`\\n {2}(?:async )?${n}\\(`).test(src) || !row || !row.body.includes(`.${n}(`) && !row.body.includes(`.${n} !== 'function'`)).map((n) => `${key}.${n} (${file})`); });
ok(missingNames.length === 0, 'every name a bridged row asks is a method its production object carries (user-todos, the Task Groups) — a rename cannot drop a list from the notice with every leg green', missingNames);
ok(read('src/task-groups.js').includes("      for (const fn of [...(this._liftHooks || [])]) { try { fn(); } catch { /* a listener's own */ } }   // B-f276 unit B"), 'the Task Groups\' manager fires its lift signal in its own lift (after its listeners are told)');

console.log('④ THE NAMES\' CENSUS — every store the helper holds has a plain name');
// THE HELPER's CALLERS, each with its store's file (a STATED map — a caller's file names more than its store; r3224: the stores that joined the
// helper on the hotfix's tip): a caller the tree has and this map does not is red by name (name its store, then its plain name in the words)
// r3284: EVERY store a file holds (a list a file): the count of the helper's holds in each file (its `<name>.create(`) must equal its row's —
// a SECOND held store in an already-mapped file is red by name, as an unmapped caller is
const CALLERS = { 'src/hosts.js': ['hosts.json'], 'src/machine-mounts.js': ['machine-mounts.json'] /* 2b */, 'src/mounts.js': ['mounts.json'], 'src/server/login-expiry-watch.js': ['login-expiry.json'], 'src/server/stash-handover.js': ['stash-handover.json'], 'src/server/conversation-deliver.js': ['msg-stash.json'], 'src/webdav.js': ['mount-tokens.json'], 'src/plugins.js': ['plugins.json'], 'src/accounts.js': ['accounts.json'], 'src/server/apps-engine.js': ['app-proposals.json'],
  'src/routes/files.js': ['extract-journal.json'],   // r3333 unit 2: the archive extraction journal
  'src/server/auto-resume.js': ['auto-resume.json'], 'src/server/browser-trace.js': ['browser-forgotten.json'], 'src/server/channel-api.js': ['api-proposals.json'], 'src/server/channels-attention.js': ['decision-examples.json'],
  'src/server/design-engine.js': ['designs.json'], 'src/server/feedback-forward.js': ['feedback-outbox.json'], 'src/server/doc-engine.js': ['doc-owners.json'], 'src/server/feedback-store.js': ['feedback.json'], 'src/server/provider-store.js': ['providers.json'],
  'src/server/voice-teach-engine.js': ['voice-suggestions.json'], 'src/server/cli-unmeasured-notice.js': ['cli-unmeasured-notice.json'], 'src/server/ops-routes.js': ['maintenance.json'], 'src/server/cli-model-catalog.js': ['cli-model-catalog.json'], // r3333 unit 3
  'src/server/published-pages.js': ['published-pages.json'], 'src/server/setting-holds.js': ['setting-holds.json'], 'src/server/vault-use-grants.js': ['vault-use-marks.json'], 'src/session-status.js': ['session-status.json'],
  // r3314: the units picked into the hotfix's trial after the chain
  'src/channels/webhook.js': ['callers.json', 'pair-pending.json'], 'src/server/vault-totp.js': ['vault-grants.json'], 'src/usage-reset-claim.js': ['usage-reset-claims.json'],
  'src/server/vault-run-door.js': ['vault-grant-ends.json'],   // r3377: lg-vault-env's grant ends
  'src/server/agent-listener.js': ['agent-door.json'],   // r3333 unit 1: the agent door's record (its port)
  // 主开发 r3336 (lane lg-text-legs-3): the data folder's own id file, held by the sign-in's start
  'src/auth.js': { sites: 1, stores: ['instance.json'] },   // (it names the file through SW.INSTANCE_FILE)
  'src/opencode-serve.js': ['opencode-serve.json'],   // r3334 unit 1 (lane bl-chat-b): the OpenCode serve's record
  'src/server/plugin-loader.js': ['plugin-registry.json'],   // bl-browser-a (主开发 r3305): which plugins are on and trusted
  'src/server/vault-engine.js': { sites: 1, stores: ['vault.json'] },   // lg-vault-env's vault record (unit (b)): the engine names its file through src/vault.js VAULT_FILE, never a quoted literal
  'src/server/browser-dialogs.js': ['browser-passkeys.json'],   // r3261: bl-browser-b's passkey store
  'src/usage-history.js': ['pricing.json'],   // r3145 unit 2 (bl-ci; r3488: a unit that adds a hold carries its row): the person's edited prices
  'src/server/browser-keeper.js': ['browser-takeovers.json'],   // r3261: bl-browser-b's takeover requests
  'src/server/sealed-json.js': { sites: 1, stores: ['dropline-oauth.json'] },   // r3334 unit 2 (lane bl-chat-b): a sealed file that names its hold (the voice sign-in; its name is the caller's)
  // A STORE MADE PER THING from ONE create site (r3314): { sites, stores } — `sites` the file's create sites, `stores` the names the hub lists them
  // by (a shape's example where each thing has its own file), checked against the notice's names, not against the file's literals
  'src/server/session-stdout.js': { sites: 1, stores: ['cw-1-1700000000000.json'] },
  'src/channel-store.js': { sites: 1, stores: ['people.json'] },   // bl-mail (line 698, 主开发 r3608): ONE create site (the people memo's hold), a store per channels account
  'src/sync-store.js': { sites: 1, stores: ['drafts.json', 'settings-sync.json', 'uploads-sync.json', 'stage-sync.json'] } };   // lg-recovery (r3489): ONE create site (SyncStore._load), a store per file
// r3354: A FILE THAT ONLY ASKS the helper (its kept copies: copiesOf — no create site, inline or bound, and no destructured create) holds
// no store through it: it needs no row and no plain name (hosts.js, jobs.js, machine-mounts.js ask it for their OLDER holds' copies, which
// the notice bridges by their own doors). A file in the map is never let off this way (its rows would go dead unseen), and an asker that
// ALSO creates a hold is a caller like any other (red by name until mapped).
function heldStoreFiles(files, map = CALLERS) {
  const out = new Map();
  out.askers = [];
  for (const [f, src] of files) {
    if (!/require\(['"][./]*store-read-hold\.js['"]\)/.test(src) || /held-lists\.js$/.test(f)) continue;
    const bound = /\bconst (\w+) = require\(['"][./]*store-read-hold\.js['"]\)/.exec(src);
    const creates = (bound ? (src.match(new RegExp(`\\b${bound[1]}\\.create\\(`, 'g')) || []).length : 0) + (src.match(/require\(['"][./]*store-read-hold\.js['"]\)\.create\(/g) || []).length;   // bound by a name, or called inline
    const destructured = /\bconst \{[^}]*\bcreate\b[^}]*\} = require\(['"][./]*store-read-hold\.js['"]\)/.test(src);
    if (!creates && !destructured && !Object.prototype.hasOwnProperty.call(map, f)) { out.askers.push(f); continue; }   // r3354: it only asks
    const row = map[f], many = !!row && !Array.isArray(row), want = many ? row.stores : row || [];
    out.set(f, { mapped: Object.prototype.hasOwnProperty.call(map, f), want, sites: many ? row.sites : want.length, names: many ? want.slice() : want.filter((n) => src.includes(`'${n}'`)), creates });
  }
  return out;
}
const srcFiles = () => { const out = new Map(); const walk = (d) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const r = path.posix.join(d, e.name); if (e.isDirectory()) { if (r !== 'src/lib') walk(r); } else if (/\.(?:c?js)$/.test(e.name)) out.set(r, read(r)); } }; walk('src'); return out; };
const SRC_ALL = srcFiles();   // the tree read once (the controls plant over copies of it)
const STORES = heldStoreFiles(SRC_ALL);
const unnamed = (stores) => [...stores].flatMap(([f, s]) => {
  if (!s.mapped) return [`${f}: a caller of the helper with no store in the census's map (CALLERS in this suite) — name its stores, then their plain names in src/lib/held-lists-words.js NAMES`];
  if (s.creates !== s.sites || s.names.length !== s.want.length) return [`${f}: ${s.creates ? `${s.creates} hold(s) of the helper` : 'no hold of the helper the census reads'} but ${s.sites} in the census's map (${s.names.length} of ${s.want.length} store(s) named in the file) — name every store it holds`];
  return s.names.filter((n) => !W.heldNamed(n)).map((n) => `${n} (${f}) — add its plain name to src/lib/held-lists-words.js NAMES`);
});
ok(STORES.size >= 3 && unnamed(STORES).length === 0, `every store the helper holds has a plain name, each file's holds counted (${[...STORES.values()].flatMap((s) => s.names).join(', ')})`, unnamed(STORES));
const FROBS = "const HOLD = require('./store-read-hold.js');\nconst h = HOLD.create({ file: path.join(dir, 'frobs.json'), code: 'frobs_unread' });\n";
const planted = heldStoreFiles(new Map([...SRC_ALL, ['src/frobs.js', FROBS]]), { ...CALLERS, 'src/frobs.js': ['frobs.json'] });
ok(unnamed(planted).some((x) => x.startsWith('frobs.json')), 'CONTROL: a new store held by the helper with no plain name is RED by name', unnamed(planted));
const unmapped = heldStoreFiles(new Map([...SRC_ALL, ['src/frobs.js', FROBS]]));
ok(unnamed(unmapped).some((x) => x.startsWith('src/frobs.js: a caller of the helper with no store')), 'CONTROL: a new caller of the helper the census\'s map does not name is RED by name', unnamed(unmapped));
const second = new Map(SRC_ALL); second.set('src/mounts.js', second.get('src/mounts.js') + "\nconst h2 = HOLD.create({ file: path.join(dir, 'frobs.json'), code: 'frobs_unread' });\n");
ok(unnamed(heldStoreFiles(second)).some((x) => x.startsWith('src/mounts.js: 2 hold(s) of the helper but 1 in the census')), 'CONTROL: a SECOND store held in an already-mapped file (src/mounts.js) is RED by name — never unnamed with every leg green', unnamed(heldStoreFiles(second)));

const shaped = heldStoreFiles(new Map([...SRC_ALL, ['src/frobs.js', FROBS]]), { ...CALLERS, 'src/frobs.js': { sites: 1, stores: ['frob-7.json'] } });
ok(unnamed(shaped).some((x) => x.startsWith('frob-7.json (src/frobs.js)')), 'CONTROL (r3314): a store made per thing from one create site, its name unknown to the notice, is RED by name', unnamed(shaped));
const shapedSites = heldStoreFiles(new Map([...SRC_ALL, ['src/frobs.js', FROBS + FROBS.split('\n')[1] + '\n']]), { ...CALLERS, 'src/frobs.js': { sites: 1, stores: ['cw-1-1700000000000.json'] } });
const ASKER = "const HOLD = require('./store-read-hold.js');\nconst kept = HOLD.copiesOf(path.join(dir, 'frobs.json'));\n";
const asks = heldStoreFiles(new Map([...SRC_ALL, ['src/frobs.js', ASKER]]));
ok(!asks.has('src/frobs.js') && asks.askers.includes('src/frobs.js') && unnamed(asks).length === 0 && STORES.askers.length >= 1,
  `r3354: a file that only ASKS the helper (its kept copies) holds no store through it — no row, no plain name (the tree's askers: ${STORES.askers.join(', ')})`, { askers: STORES.askers, planted: asks.askers });
const asksAndHolds = heldStoreFiles(new Map([...SRC_ALL, ['src/frobs.js', ASKER + "const h = HOLD.create({ file: path.join(dir, 'frobs.json'), code: 'frobs_unread' });\n"]]));
ok(unnamed(asksAndHolds).some((x) => x.startsWith('src/frobs.js: a caller of the helper with no store')), 'CONTROL (r3354): the same asker that ALSO creates a hold is RED by name', unnamed(asksAndHolds));
const mappedGone = new Map(SRC_ALL); mappedGone.set('src/mounts.js', "const HOLD = require('./store-read-hold.js');\nconst kept = HOLD.copiesOf(path.join(dir, 'mounts.json'));\n");
ok(unnamed(heldStoreFiles(mappedGone)).some((x) => x.startsWith('src/mounts.js: no hold of the helper the census reads but 1')), 'CONTROL (r3354): a MAPPED file whose hold is gone (only an ask left) is RED by its count — never let off as an asker', unnamed(heldStoreFiles(mappedGone)));
ok(unnamed(shapedSites).some((x) => x.startsWith('src/frobs.js: 2 hold(s) of the helper but 1 in the census')), 'CONTROL (r3314): a second create site in a file stated as one site making its stores is RED by its count', unnamed(shapedSites));
ok(W.heldListName('cw-12-1700000000123.json', tt) === 'a conversation’s saved details' && W.heldListName('cw-x.json', tt) === 'a saved list' && W.heldListName('callers.json', tt) === 'the webhook callers' && W.heldNamed('vault-grants.json') && W.heldNamed('usage-reset-claims.json') && !W.heldNamed('frobs.json'),
  'r3314: the trial\'s new stores have their plain names (the webhook callers, the pending pairing codes, who may receive your two-step codes, the reset marks); a conversation\'s record is named by its shape (cw-<seq>-<ms>.json), any other shape by «a saved list»');
// r3314 (3): «Read again now» reads each helper hold BY ITS ROW — two held stores of ONE base name (each channel account's people file) are each read
{
  const calls = [];
  const two = { holds: () => [{ key: 'h1', file: 'people.json', held: true, since: 1 }, { key: 'h2', file: 'people.json', held: true, since: 2 }], readAgainOf: async (w) => { calls.push(w); return false; }, onHoldsChange: () => () => { } };
  const hl = HL.create({ hold: two, broadcast: () => { } });
  const listed = hl.list(); await hl.readAgain(); hl.stop();
  ok(listed.length === 2 && listed[0].key !== listed[1].key && calls.length === 2 && calls.every((c) => c && typeof c === 'object' && /^h[12]$/.test(c.key)),
    'r3314: two held stores of one base name are two rows of the notice, and the press reads EACH by its row (the helper matches a row\'s key; the shared base name would match neither)', { keys: listed.map((r) => r.key), calls: calls.map((c) => (c && c.key) || c) });
  const calls2 = [];
  const HLX = memOf('src/server/held-lists.js', 'await hold.readAgainOf(h.key ? h : h.file);', 'await hold.readAgainOf(h.file);', 'held-lists: the press by base name');   // stale-pins: kept — the press as unit B had it, planted as the RED control (r3314)
  const hx = HLX.create({ hold: { ...two, readAgainOf: async (w) => { calls2.push(w); return false; } }, broadcast: () => { } });
  await hx.readAgain(); hx.stop();
  ok(calls2.length === 2 && calls2.every((c) => c === 'people.json'), 'CONTROL: the press by base name — both reads ask «people.json», which the helper matches for neither: RED', calls2);
}

console.log('⑤ THE FOLLOW (主开发 r3284) — the mark, the let-go wait, the scroll, the next try, the one order');
// (1) the hub's mark: every list it answers carries its start and its broadcasts so far
{
  const seqs = S.casts.map((m) => m.seq);
  ok(S.casts.length >= 2 && S.casts.every((m) => typeof m.epoch === 'string' && m.epoch === S.casts[0].epoch) && seqs.every((n, i) => n === i + 1)
    && S.first.epoch === S.casts[0].epoch && Number.isInteger(S.first.seq) && S.tooSoon.seq === S.first.seq && S.lift.seq === S.casts[S.casts.length - 1].seq,
    'r3284: every list the hub answers carries its mark — one start (epoch) on every broadcast and answer, the broadcasts counted one by one (seq), a press\'s answer marked as of the last broadcast', { seqs, first: S.first.seq, lift: S.lift.seq });
}
// (2) 2b (主开发 r3790 decision 2): THE PAIRED MACHINES ARE ON THE HELPER — the notice lists hosts.json by the helper's own row (its
// plain name the one that exists), «Read again now» reads it, and its lift is broadcast. No bridged row is left, and no wait of the
// notice is queued on hosts, so none can be let go: r3284's let-go leg is retired (the helper's notice road is legs 67–74's)
async function hostsOnHelper(tag) {
  const { HostManager } = require(path.join(REPO, 'src/hosts.js'));
  const d = path.join(ROOT, tag), f = path.join(d, 'hosts.json'); fs.mkdirSync(f, { recursive: true });   // THE PLACED REFUSAL: hosts.json is a directory
  const warn = console.warn; console.warn = () => { };
  let H = null, hl = null;
  try {
    H = new HostManager({ dataDir: d }); const casts = [];
    hl = HL.create({ broadcast: (m) => casts.push(m), older: [] });
    hl.say();
    const mine = (lists) => (lists || []).some((r) => r.what === 'hosts.json');
    const listed = mine(hl.list()), cast0 = !!casts.length && mine(casts[casts.length - 1].lists);
    fs.rmSync(f, { recursive: true, force: true }); fs.writeFileSync(f, JSON.stringify({ hosts: [] }));   // the storage answers again
    const press = await hl.readAgain();
    const last = casts[casts.length - 1];
    return { listed, cast0, pressed: !!(press && press.ok), lifted: !H.held(), told: !!last && !mine(last.lists) };
  } finally { console.warn = warn; if (H) H._hold.stop(); if (hl) hl.stop(); }
}
const OH = await hostsOnHelper('hosts-on-helper');
ok(OH.listed && OH.cast0 && OH.pressed && OH.lifted && OH.told, '2b (decision 2): a HELD hosts.json is listed by the helper\'s own row (hosts.json — «the paired machines»), «Read again now» reads it and lifts the hold, and the lift is broadcast (the chip goes)', OH);

// THE PAGE's MODULE compiled from its source (src/lib/held-lists.js; its imports stood in, the words the real PURE module's)
const PAGE_NAMES = ['t', 'fetchJson', 'showToast', 'stampAt', 'slotBeside', 'seatBeside', 'openRailPanel', 'heldChipWords', 'heldChipTitle', 'heldSectionTitle', 'heldSectionNote', 'heldPressLabel', 'heldRowWords', 'heldPressWords', 'heldSoonWord', 'document', 'setTimeout', 'clearTimeout', 'Date'];
const pageOf = (src, env) => {
  const i = src.indexOf('\nlet lists = [];');
  if (i < 0) return null;
  const body = src.slice(i).replace(/^export (async function|function|const) /gm, '$1 ');
  return new Function(...PAGE_NAMES, `${body}\nreturn { applyHeldLists, refreshHeldLists, paintHeldLists, openHeldSection, onHeldLists };`)(...PAGE_NAMES.map((n) => env[n]));   // eslint-disable-line no-new-func
};
const pageEnv = (over = {}) => {
  const timers = [];
  const doc = { getElementById: () => null, querySelector: () => null, createElement: (tag) => ({ tag, className: '', textContent: '', type: '', onclick: null }) };
  const env = { t: tt, fetchJson: async () => null, showToast: () => { }, stampAt: (ms) => `@${ms}`, slotBeside: () => null, seatBeside: () => false, openRailPanel: () => true,
    heldChipWords: W.heldChipWords, heldChipTitle: W.heldChipTitle, heldSectionTitle: W.heldSectionTitle, heldSectionNote: W.heldSectionNote, heldPressLabel: W.heldPressLabel, heldRowWords: W.heldRowWords, heldPressWords: W.heldPressWords, heldSoonWord: W.heldSoonWord,
    document: doc, setTimeout: (fn, ms) => { timers.push({ fn, ms, cleared: false }); return timers.length; }, clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].cleared = true; }, Date: { now: () => 1_000 }, ...over };
  return { env, timers, doc };
};
const A1 = [{ key: 'store:mounts.json', what: 'mounts.json', since: 500 }];
// (3) an answer made BEFORE the last broadcast the page took is dropped (a reconnect's read answered after the lift's broadcast)
async function order(src) {
  let answer = null;
  const P = pageOf(src, pageEnv({ fetchJson: () => new Promise((r) => { answer = r; }) }).env);
  P.applyHeldLists(A1, { type: 'held-lists', epoch: 'e1', seq: 1 });
  const out = P.refreshHeldLists();   // a reconnect's read, out
  P.applyHeldLists([], { type: 'held-lists', epoch: 'e1', seq: 2 });   // the lift's broadcast comes first
  answer({ lists: A1, epoch: 'e1', seq: 1 }); const older = (await out).length;   // the read's answer, made before the lift
  const o2 = P.refreshHeldLists(); answer({ lists: A1, epoch: 'e1', seq: 2 }); const same = (await o2).length;   // made after it: taken
  const o3 = P.refreshHeldLists(); answer({ lists: [], epoch: 'e2', seq: 0 }); const other = (await o3).length;   // another hub (a restart): taken
  return { older, same, other };
}
const OR = await order(PAGE);
ok(OR.older === 0 && OR.same === 1 && OR.other === 0, 'r3284: a read\'s answer made before the last broadcast the page took is DROPPED (the lift stands, the chip stays gone); an answer as new is taken; another hub\'s (a restart) is taken', OR);
const DROP = '  if (olderThanHeld(m)) return false;\n';
const ORX = await order(anchored(PAGE, DROP, '', 'held-lists page: the mark cut'));
ok(ORX.older === 1, 'CONTROL: the mark\'s check cut — the older answer puts the held list back after the lift: RED', ORX);
// (4) the chip's press with the System panel already open as a window (brought forward, nothing painted again): its section scrolls AT ONCE
function press(src) {
  let scrolled = 0;
  const sec = { isConnected: true, hidden: false, kids: [], getClientRects: () => [1], scrollIntoView: () => { scrolled++; }, replaceChildren(...k) { this.kids = k; } };
  const pe = pageEnv({ openRailPanel: () => ({ id: 'w-system' }) });
  pe.doc.querySelector = (q) => (q === '.sys-held' ? sec : null);
  const P = pageOf(src, pe.env);
  P.applyHeldLists(A1, { epoch: 'e', seq: 1 });
  P.paintHeldLists(sec);   // the panel open as a window, its section drawn
  P.openHeldSection({});
  const atPress = scrolled;
  P.applyHeldLists([...A1, { key: 'hosts', what: 'hosts', since: 600 }], { epoch: 'e', seq: 2 });   // a later draw (a reconnect's, a broadcast)
  return { atPress, after: scrolled };
}
const PR = press(PAGE);
ok(PR.atPress === 1 && PR.after === 1, 'r3284: the chip\'s press with the panel already open as a window scrolls its section AT ONCE — and a later draw (a reconnect\'s) scrolls nothing with no press', PR);
const NOW = '  if (sec && sec.isConnected && !sec.hidden && sec.getClientRects?.().length) { scrollWanted = false; try { sec.scrollIntoView?.({ block: \'nearest\' }); } catch { /* none */ } }\n';
const PRX = press(anchored(PAGE, NOW, '', 'held-lists page: the at-once scroll cut'));
ok(PRX.atPress === 0 && PRX.after === 1, 'CONTROL: the at-once scroll cut — the press scrolls nothing and the NEXT draw scrolls the panel with no press: RED', PRX);
// (5) a next try that passes while the section stays open is worded again — by the section's own timer, at the try
function nextTry(src) {
  let now = 1_000;
  const pe = pageEnv({ Date: { now: () => now } });
  const P = pageOf(src, pe.env);
  P.applyHeldLists([{ key: 'store:mounts.json', what: 'mounts.json', since: 500, next: 61_000 }], { epoch: 'e', seq: 1 });
  const el = { isConnected: true, hidden: false, kids: [], replaceChildren(...k) { this.kids = k; }, scrollIntoView() { } };
  P.paintHeldLists(el);
  const row = () => ((el.kids.find((k) => k.className === 'sys-held-row') || {}).textContent || '');
  const before = row(), live = pe.timers.filter((x) => !x.cleared);
  now = 61_300; if (live.length) live[live.length - 1].fn();
  return { before, after: row(), timers: live.length, ms: live.length ? live[0].ms : null, left: pe.timers.filter((x) => !x.cleared).length };
}
const NT = nextTry(PAGE);
ok(NT.before.includes('@61000') && NT.timers === 1 && NT.ms === 60_250 && NT.after.includes(W.heldSoonWord(tt)) && !NT.after.includes('@61000') && NT.left === 0,
  'r3284: the section shows the next try\'s time, its own timer fires just after it, and the row then says «in a moment» — never a time in the past while it stays open', NT);
const TIMER = '    if (due.length) timer = setTimeout(draw, Math.min(Math.min(...due) - at + 250, NEXT_TRY_REPAINT_MAX_MS));\n';
const NTX = nextTry(anchored(PAGE, TIMER, '', 'held-lists page: the next-try timer cut'));
ok(NTX.timers === 0 && NTX.after.includes('@61000'), 'CONTROL: the timer cut — the passed try keeps its time until the next change: RED', NTX);
// (6) ONE ORDER beside For you, whichever chip draws first — customize-mode.js seatBeside compiled from its source over a stand-in zone;
// the vault's lock seated by its own line (just before For you, pinned in ③)
const seatOf = (src) => {
  const END = '\n  return true;\n}\n', i = src.indexOf('export function slotBeside('), j = src.indexOf(END, src.indexOf('export function seatBeside('));
  if (i < 0 || j < 0) return null;
  return (doc) => new Function('document', `${src.slice(i, j + END.length).replaceAll('export function', 'function')}\nreturn { slotBeside, seatBeside };`)(doc);   // eslint-disable-line no-new-func
};
function seated(src, draws) {
  const nodes = new Map();
  const mk = (id) => { const n = { id, parentNode: null, get nextSibling() { if (!this.parentNode) return null; const k = this.parentNode.kids; return k[k.indexOf(this) + 1] || null; } }; nodes.set(id, n); return n; };
  const tray = { id: 'taskbar-tray', kids: [], parentNode: null, insertBefore(n, ref) { if (n.parentNode) n.parentNode.kids.splice(n.parentNode.kids.indexOf(n), 1); const at = ref ? this.kids.indexOf(ref) : -1; if (at < 0) this.kids.push(n); else this.kids.splice(at, 0, n); n.parentNode = this; return n; } };
  nodes.set(tray.id, tray); tray.insertBefore(mk('taskbar-user-todos'), null);
  const M = seatOf(src)({ getElementById: (id) => { const n = nodes.get(id); return n && (n === tray || n.parentNode) ? n : null; } });
  const draw = (id) => {
    const chip = nodes.get(id) || mk(id);
    if (id === 'taskbar-vault') { const s = M.slotBeside('taskbar-user-todos', tray); if (chip.parentNode !== s.parent || chip.nextSibling !== s.before) s.parent.insertBefore(chip, s.before); }   // vault-unlock.js's own line
    else M.seatBeside(chip, 'taskbar-user-todos', tray);
  };
  const orders = draws.map((seq) => { for (const id of seq) draw(id); return tray.kids.map((k) => k.id).join(' '); });
  return orders;
}
const THREE = ['taskbar-warmth', 'taskbar-held', 'taskbar-vault'];
const PERMS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]].map((p) => p.map((k) => THREE[k]));
const ONE = 'taskbar-warmth taskbar-held taskbar-vault taskbar-user-todos';
const orderOf = (src) => PERMS.map((first) => seated(src, [first, ...PERMS])).flat();
const SO = orderOf(CM);
ok(SO.length === 42 && SO.every((o) => o === ONE), `r3284: whichever chip draws first and however they redraw (6 first orders × 6 redraws each), the chips beside For you stand in ONE order: ${ONE}`, [...new Set(SO)]);
const SEARCH = '  for (const later of row.slice(row.indexOf(chip.id) + 1)) {';
const SOX = orderOf(anchored(CM, SEARCH, '  for (const later of []) {', 'customize-mode: the later chips\' search cut'));
ok(new Set(SOX).size > 1, 'CONTROL: the search for the later chips cut (each chip just before For you, as before) — the chips trade places at redraws: RED', [...new Set(SOX)]);

report();
