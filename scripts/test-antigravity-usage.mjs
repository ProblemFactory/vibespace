#!/usr/bin/env node
// AN ANTIGRAVITY ACCOUNT SHOWS ITS USAGE AFTER RE-CHECK (lane antigravity-card-fixes, the owner 2026-10-20: the
// Antigravity card showed no usage anywhere). Commit 3 of lane antigravity-harness shipped the judge and the capture kit
// but no reading — the payload's shape needed a signed-in capture. 主开发 captured it (agy 1.4.3, a signed-in Personal
// Ultra account on its HOME root: `agy -p /usage --output-format json` answered WITHOUT a turn), redacted, committed as
// scripts/fixtures/antigravity-usage-1.4.3.json — the ONLY input here (no real agy, no real login).
//   ① the fixture → the typed LIMIT SET (src/quota-model.js): one limit per group as agy names it, a 5h and a 7d window
//      each with its reset, provenance 'cli-usage', agy's window names carried; a partly used variant;
//   ② THE STOP RULE: the same payload with any sign of a turn ⇒ turn-started (never a reading);
//   ③ NEVER GUESSED: every field the capture states, broken one at a time ⇒ 'unparsed';
//   ④ THE DOOR (src/server/cli-usage-door.js) — the real accounts store, the real descriptor, the fake agy
//      (scripts/fixtures/antigravity-agy answering the capture): a person's press reads ONE account once in its own HOME
//      root (the bus disabled, the empty login dir as cwd) and writes through the one write path; an agent, a second
//      press inside the minute, the setting off, a signed-out account, a missing CLI ⇒ refused, agy never runs; a
//      turn-shaped answer ⇒ STOP, nothing written;
//   ⑤ THE CARD: the reading as the roster's donuts (the shared renderer, agy's words in the tooltips), the 'home' stamp
//      the 8 s poll repaints;
//   ⑥ NEVER A TIMER: no probe rung (the auto-cli loop's gate is 'cli-usage'), no limit signal, one door, one caller;
//      no vendor host in the door (test-vendor-whitelist counts HTTP calls — a local CLI spawn is not one);
//   ⑦ NEGATIVE CONTROLS: a parser copy that GUESSES a missing fraction ⇒ ③ RED; a door copy without the STOP ⇒ ④ RED;
//      a door copy without the minute's pace ⇒ ④ RED.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { scratch } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } return !!c; };
if (!fs.existsSync(path.join(REPO, 'src/lib/build-version.js'))) { console.error('src/lib/build-version.js is missing — run `npm run build` first'); process.exit(1); }

const FIX_REL = 'scripts/fixtures/antigravity-usage-1.4.3.json';
const FIX = JSON.parse(read(FIX_REL));
const AT = Date.parse(FIX.capturedAt);
const QM = require(path.join(REPO, 'src/quota-model.js'));
const U = require(path.join(REPO, 'src/harnesses/antigravity-usage.js'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const judge = (Mod, env, measuredAt = AT) => Mod.judgeUsageAnswer({ code: 0, stdout: JSON.stringify(env), measuredAt });

/** ① ② ③ as rows over a parser module (the real one or a mutant copy). */
function parserLegs(Mod) {
  const out = [];
  const leg = (name, pass, detail) => out.push({ name, pass: !!pass, detail });
  const j = judge(Mod, FIX.envelope);
  const set = j.reading;
  leg('the capture is a READING of the pinned shape (usage-groups)', j.verdict === 'reading' && j.shape === 'usage-groups', j.verdict + ' ' + (j.why || ''));
  if (set) {
    leg('…a valid typed limit set (quota-model validateLimitSet)', QM.validateLimitSet(set).ok, JSON.stringify(QM.validateLimitSet(set).errors));
    leg('…one limit per group, named as agy names them, scope model', set.limits.map((l) => l.limitId).join('|') === 'Gemini Models|Claude and GPT models' && set.limits.every((l) => l.name === l.limitId && l.scope === 'model'));
    const w = (l, k) => set.limits.find((x) => x.limitId === l)?.windows.find((x) => x.kind === k);
    const g7 = w('Gemini Models', '7d'), g5 = w('Gemini Models', '5h'), c5 = w('Claude and GPT models', '5h');
    leg('…each group a 7d (agy "weekly", 10080 min) and a 5h (300 min) window with its reset from reset_time', g7?.minutes === 10080 && g5?.minutes === 300 && g7.resetsAt === Date.parse('2026-10-27T17:42:46Z') / 1000 && c5?.resetsAt === Date.parse('2026-10-20T22:42:46Z') / 1000, JSON.stringify({ g7, g5 }));
    leg('…remaining_fraction 1 ⇒ 0 % used, and a window whose reset is a full window away is EMPTY (B-8b12: starts on first use)', [g7, g5, c5].every((x) => x.usedPct === 0 && x.state === 'empty' && x.measuredAt === AT));
    leg('…provenance cli-usage on the set and every limit', set.source === 'cli-usage' && set.limits.every((l) => l.source === 'cli-usage'));
    leg('…agy\'s window names ride extra.windowNames', set.extra?.windowNames?.['Gemini Models/7d'] === 'Weekly Limit Remaining' && set.extra?.windowNames?.['Claude and GPT models/5h'] === 'Five Hour Limit Remaining');
  }
  const used = clone(FIX.envelope);
  used.command.data.groups[0].buckets[1].remaining_fraction = 0.25;
  used.command.data.groups[0].buckets[1].reset_time = new Date(AT + 2 * 3600e3).toISOString();
  const u5 = judge(Mod, used).reading?.limits[0].windows.find((x) => x.kind === '5h');
  leg('a partly used window: remaining 0.25 ⇒ 75 % used, RUNNING (2 h of 5 left)', u5?.usedPct === 75 && u5.state === 'running', JSON.stringify(u5));
  // ② the STOP rule wins over the shape
  const turns = [{ num_turns: 1 }, { conversation_id: 'c-1' }, { usage: { ...FIX.envelope.usage, output_tokens: 3 } }].map((p) => ({ ...clone(FIX.envelope), ...p }));
  leg('THE STOP RULE: the captured payload with any sign of a turn (num_turns, a conversation, one token) is turn-started, never a reading', turns.every((e) => judge(Mod, e).verdict === 'turn-started'), turns.map((e) => judge(Mod, e).verdict).join(','));
  // ③ never guessed
  const breaks = {
    'a window code the capture never showed (daily)': (e) => { e.command.data.groups[0].buckets[0].window = 'daily'; },
    'remaining_fraction missing': (e) => { delete e.command.data.groups[0].buckets[0].remaining_fraction; },
    'remaining_fraction outside 0..1': (e) => { e.command.data.groups[1].buckets[1].remaining_fraction = 1.2; },
    'remaining_fraction a string': (e) => { e.command.data.groups[0].buckets[1].remaining_fraction = '100%'; },
    'reset_time not a date': (e) => { e.command.data.groups[1].buckets[0].reset_time = 'next week'; },
    'a group with no buckets': (e) => { e.command.data.groups[1].buckets = []; },
    'two 5h buckets in one group': (e) => { e.command.data.groups[0].buckets[0].window = '5h'; },
    'a bucket with no name': (e) => { delete e.command.data.groups[0].buckets[0].name; },
    'another command (quota)': (e) => { e.command.name = 'quota'; },
    'no groups': (e) => { e.command.data.groups = []; },
    'no command at all': (e) => { delete e.command; },
  };
  const verdicts = Object.entries(breaks).map(([k, f]) => { const e = clone(FIX.envelope); f(e); return [k, judge(Mod, e).verdict]; });
  leg(`NEVER GUESSED: each of ${verdicts.length} broken fields leaves the answer unparsed`, verdicts.every(([, v]) => v === 'unparsed'), verdicts.filter(([, v]) => v !== 'unparsed').map(([k, v]) => `${k} → ${v}`).join('; '));
  return out;
}

console.log('① ② ③ the fixture → the typed limit set; the STOP rule; never guessed');
for (const r of parserLegs(U)) ok(r.name, r.pass, r.detail);
{
  const raw = read(FIX_REL);
  ok('the fixture is the signed-in capture, redacted: no e-mail, no token-length string, no account name, no turn', /signed-in capture/.test(FIX.provenance) && FIX.version === '1.4.3' && !/@/.test(raw) && !/[A-Za-z0-9_-]{40,}/.test(raw) && !/Personal|Ultra/.test(raw) && U.turnSigns(FIX.envelope).length === 0);
  ok('…and its argv is the reading command', JSON.stringify(FIX.argv) === JSON.stringify(U.USAGE_ARGV));
}

// ── ④ THE DOOR ──────────────────────────────────────────────────────────────
const ROOT = scratch('agy-usage');
fs.rmSync(ROOT, { recursive: true, force: true });
const MACHINE = path.join(ROOT, 'machine-home'), DATA = path.join(ROOT, 'data'), CACHE = path.join(DATA, 'usage-cache'), LOG = path.join(ROOT, 'agy.log');
for (const d of [MACHINE, CACHE]) fs.mkdirSync(d, { recursive: true });
process.env.HOME = MACHINE;
const STUB = path.join(REPO, 'scripts/fixtures/antigravity-agy');
const AGY = require(path.join(REPO, 'src/harnesses/antigravity.js'));
const harnesses = require(path.join(REPO, 'src/harnesses'));
const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
const am = new AccountManager({ dataDir: DATA });
const acct = am.createHomeSubscription('antigravity', { name: 'Personal Ultra' });
fs.writeFileSync(path.join(acct.dir, AGY.TOKEN_REL), 'LOGIN', { mode: 0o600 }); am.finalizeHomeSubscription(acct.id);
const off = am.createHomeSubscription('antigravity', { name: 'Signed out' });
const runs = () => { try { return fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((x) => x.argv && x.argv[0] === '-p'); } catch { return []; } };
const cwds = () => { try { return fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((x) => x.usageCwd).map((x) => x.usageCwd); } catch { return []; } };

/** ④ as rows over a door module. */
async function doorLegs(DoorMod) {
  const out = [];
  const leg = (name, pass, detail) => out.push({ name, pass: !!pass, detail });
  fs.rmSync(LOG, { force: true }); fs.rmSync(path.join(CACHE, acct.id + '.json'), { force: true });
  const clock = { t: AT };
  let mode = 'capture', installed = true, setting = 'manual';
  const logs = [];
  const door = DoorMod.createCliUsageDoor({
    accounts: am, harnessOf: (id) => harnesses.get(id), cacheDir: CACHE,
    cliCmds: { check: async (be, o) => (be === 'antigravity' && o && o.force === true && installed ? STUB : null) },
    agentEnv: () => ({ PATH: process.env.PATH, AGY_STUB_LOG: LOG, AGY_STUB_USAGE: mode, GEMINI_API_KEY: 'ambient-key' }),
    setting: () => setting, now: () => clock.t, log: (l) => logs.push(l),
  });
  const file = path.join(CACHE, acct.id + '.json');
  const a0 = await door.read(acct.id, { person: false });
  leg('an AGENT\'s call (no person) is refused 403 and agy never runs', a0.status === 403 && a0.code === 'agent_forbidden' && runs().length === 0, JSON.stringify(a0));
  const s0 = await door.read(off.id, { person: true });
  leg('a signed-out account: 409 login-needed, agy never runs', s0.status === 409 && s0.loginNeeded === true && runs().length === 0, JSON.stringify(s0));
  setting = 'off';
  const o0 = await door.read(acct.id, { person: true });
  leg('the on-demand refresh setting OFF: 403, agy never runs', o0.status === 403 && o0.code === 'refresh-off' && runs().length === 0, JSON.stringify(o0));
  setting = 'manual';
  installed = false;
  const n0 = await door.read(acct.id, { person: true });
  leg('agy not installed (the forced read-time check says null): 409, nothing runs', n0.status === 409 && n0.code === 'not-installed' && runs().length === 0, JSON.stringify(n0));
  installed = true; clock.t += 61000;
  const r1 = await door.read(acct.id, { person: true });
  const run1 = runs()[0];
  leg('A PERSON\'S PRESS: one read, written (2 limits)', r1.ok === true && r1.limits === 2 && runs().length === 1, JSON.stringify(r1));
  leg('…agy ran the reading command in the ACCOUNT\'S HOME root, the bus disabled, its empty login dir as cwd', run1 && JSON.stringify(run1.argv) === JSON.stringify(U.USAGE_ARGV) && run1.home === acct.dir && run1.bus === 'disabled:' && cwds()[0] === path.join(acct.dir, '.vibespace-login'), JSON.stringify({ run1, cwd: cwds()[0] }));
  const disk = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  leg('…through the one write path: data/usage-cache/<id>.json holds the typed limits, source cli-usage, agy\'s window names', disk && Array.isArray(disk.limits) && disk.limits.length === 2 && disk.source === 'cli-usage' && disk.windowNames?.['Gemini Models/5h'] === 'Five Hour Limit Remaining' && disk.fetchedAt === clock.t, JSON.stringify(disk)?.slice(0, 300));
  const r2 = await door.read(acct.id, { person: true });
  leg('a second press inside the minute: 429 throttled with the wait, agy NOT run again', r2.status === 429 && r2.throttled === true && r2.retryInMs > 0 && runs().length === 1, JSON.stringify(r2));
  clock.t += 61000;
  const both = await Promise.all([door.read(acct.id, { person: true }), door.read(acct.id, { person: true })]);
  leg('two presses in flight share ONE read', both.every((x) => x.ok) && runs().length === 2, `runs=${runs().length}`);
  const before = fs.readFileSync(file, 'utf8');
  mode = 'turn'; clock.t += 61000;
  const t1 = await door.read(acct.id, { person: true });
  leg('THE STOP: a turn-shaped answer ⇒ 502 turn-started, the cache file UNCHANGED, one loud line', t1.status === 502 && t1.code === 'turn-started' && fs.readFileSync(file, 'utf8') === before && logs.some((l) => /STOP/.test(l)), JSON.stringify(t1));
  mode = 'auth'; clock.t += 61000;
  const u1 = await door.read(acct.id, { person: true });
  leg('agy says not signed in: 409 login-needed, nothing written', u1.status === 409 && u1.loginNeeded === true && fs.readFileSync(file, 'utf8') === before, JSON.stringify(u1));
  mode = 'ok'; clock.t += 61000;
  const p1 = await door.read(acct.id, { person: true });
  leg('a SUCCESS in a shape no capture pinned: unparsed, nothing written (never guessed)', p1.ok === false && p1.code === 'unparsed' && fs.readFileSync(file, 'utf8') === before, JSON.stringify(p1));
  return out;
}

console.log('④ the door: a person\'s press, the account\'s own HOME root, once a minute, the STOP rule');
const DOOR = require(path.join(REPO, 'src/server/cli-usage-door.js'));
for (const r of await doorLegs(DOOR)) ok(r.name, r.pass, r.detail);
ok('the ambient key never reaches agy (the door drops the descriptor\'s keyEnvVars): the stub saw no GEMINI_API_KEY', (() => { const src = read('src/server/cli-usage-door.js'); return /for \(const k of creds\.keyEnvVars \|\| \[\]\) delete env\[k\];/.test(src) && AGY.creds.keyEnvVars.includes('GEMINI_API_KEY'); })());

// ── ⑤ THE CARD ──────────────────────────────────────────────────────────────
console.log('⑤ the card: the reading as the roster\'s donuts');
const MA = await import(path.join(REPO, 'src/lib/manage-agents.js'));
{
  const usageCache = require(path.join(REPO, 'src/usage-cache-write.js'));
  const c = usageCache.readCacheObject(CACHE, acct.id);
  const reading = { limits: c.limits, fetchedAt: c.fetchedAt, source: c.source, windowNames: c.windowNames }; // /api/usage homeAccounts' row (usage-routes onDemandReadings)
  const v = MA.onDemandUsageView(reading);
  ok('onDemandUsageView: four windows, each group 5h then 7d, agy\'s words and number in the tooltip', v && v.windows.map((w) => w.label).join(',') === '5h,7d,5h,7d' && v.windows[0].tip === 'Gemini Models · Five Hour Limit Remaining 100%' && v.windows[3].tip === 'Claude and GPT models · Weekly Limit Remaining 100%', JSON.stringify(v?.windows));
  ok('…legacy-shaped buckets the shared renderer reads (utilization 0..1, resetsAt in seconds, the empty state kept)', v.windows.every((w) => w.utilization === 0 && w.resetsAt > 1e9 && w.resetsAt < 1e11 && w.state === 'empty'));
  ok('no reading / no limits ⇒ null (the cell draws nothing — never a fake 0 %)', MA.onDemandUsageView(null) === null && MA.onDemandUsageView({ limits: [] }) === null);
  class App { }
  MA.installManageAgents(App, {});
  const app = new App();
  const html = app._acctUsageHtml(v);
  const titles = [...html.matchAll(/class="acct-usage-donut[^"]*" title="([^"]*)"/g)].map((m) => m[1]);
  ok('the SHARED renderer draws exactly those four donuts, titled in agy\'s words (no 5h/7d from an absent legacy view)', titles.length === 4 && titles[1] === 'Gemini Models · Weekly Limit Remaining 100%', JSON.stringify(titles));
  const snap = MA.rosterUsageSnapshot({ usageSrc: 'home', usageKey: acct.id }, { home: { [acct.id]: reading } });
  ok('the \'home\' stamp resolves through rosterUsageSnapshot (the 8 s poll repaints the cell)', snap && snap.u.windows.length === 4 && MA.rosterUsageSnapshot({ usageSrc: 'home', usageKey: 'nope' }, { home: {} }) === null);
  // the roster row itself
  const el = (tag) => ({ tagName: tag, className: '', style: {}, innerHTML: '', textContent: '', title: '', children: [], isConnected: true, onclick: null, append(...k) { this.children.push(...k); }, appendChild(k) { this.children.push(k); return k; } });
  const prevDoc = globalThis.document; globalThis.document = { createElement: el, querySelectorAll: () => [] };
  try {
    app.refreshAccounts = async () => ({ accounts: am.list().accounts, defaultAntigravityAccountId: null });
    app._homeAccountUsage = { [acct.id]: reading };
    const body = el('div');
    await app._renderHomeAccounts({ body, selectedHost: null, done() { }, refresh() { }, st: { antigravity: { loggedIn: false } }, stale: () => false }, 'antigravity');
    const left = body.children[0]?.children?.find((k) => /acct-key-row/.test(k.innerHTML || ''));
    const cell = new RegExp(`data-id="${acct.id}"[\\s\\S]*?<span class="acct-usage-cell" data-usage-src="home" data-usage-key="${acct.id}">([\\s\\S]*?)</span>\\s*<span class="acct-key-actions">`).exec(left?.innerHTML || '');
    ok('THE REPORT: the Personal Ultra row\'s usage cell (stamped home) carries the four donuts', cell && (cell[1].match(/acct-usage-donut/g) || []).length === 4, (left?.innerHTML || '').slice(0, 200));
    const offCell = new RegExp(`data-id="${off.id}"[\\s\\S]*?<span class="acct-usage-cell" data-usage-src="home" data-usage-key="${off.id}">([\\s\\S]*?)</span>`).exec(left?.innerHTML || '');
    ok('…an account never read draws an empty cell', offCell && offCell[1] === '');
  } finally { globalThis.document = prevDoc; }
}

// ── ⑥ NEVER A TIMER ─────────────────────────────────────────────────────────
console.log('⑥ never a timer, one door, no vendor call');
{
  const { capsOf } = require(path.join(REPO, 'src/backend-caps.js'));
  const h = harnesses.get('antigravity');
  ok('antigravity declares NO probe rung (quota.probe null, caps.quotaProbe null) — the auto-cli loop runs only for quotaProbe \'cli-usage\'', h.quota.probe === null && capsOf('antigravity').quotaProbe === null && /capsOf\(a\.backend\)\.quotaProbe !== 'cli-usage'/.test(read('src/server/auto-cli-loop.js')));
  ok('…no limit signal (NULL_QUOTA\'s), so auto-resume stays derived off; pool stays false', h.quota.signalFromStream === harnesses.NULL_QUOTA.signalFromStream && capsOf('antigravity').autoResume.supported === false && capsOf('antigravity').pool === false);
  ok('…the on-demand reading is the descriptor\'s: argv, source, judge, the login dir as cwd', JSON.stringify(h.quota.onDemand.argv) === JSON.stringify(U.USAGE_ARGV) && h.quota.onDemand.source === 'cli-usage' && h.quota.onDemand.judge === U.judgeUsageAnswer && h.quota.onDemand.cwdOf({ HOME: '/r' }) === '/r/.vibespace-login');
  const door = read('src/server/cli-usage-door.js'), routes = read('src/server/account-usage-routes.js');
  ok('the door arms no timer of its own (one setTimeout: the 30 s kill of its own child), no setInterval', (door.match(/setTimeout\(/g) || []).length === 1 && /setTimeout\(\(\) => \{ try \{ child\.kill\('SIGKILL'\)/.test(door) && !/setInterval/.test(door));
  const srcFiles = (dir) => fs.readdirSync(path.join(REPO, dir), { withFileTypes: true }).flatMap((d) => d.isDirectory() ? (d.name === 'public' ? [] : srcFiles(path.join(dir, d.name))) : /\.js$/.test(d.name) ? [path.join(dir, d.name)] : []);
  const makers = [...srcFiles('src'), 'server.js'].filter((f) => /createCliUsageDoor\(/.test(read(f)) && !/cli-usage-door\.js$/.test(f));
  ok(`ONE door, made once (account-usage-routes), read by ONE route, a person's press only (${makers.join(', ')})`, makers.length === 1 && makers[0] === 'src/server/account-usage-routes.js' && (routes.match(/usageDoor\.read\(/g) || []).length === 1 && /app\.post\('\/api\/accounts\/home-subscription\/:id\/usage'/.test(routes) && /usageDoor\.read\(req\.params\.id, \{ person: !isAgentBearer\(req\) \}\)/.test(routes));
  ok('the reading is a local CLI spawn, not a vendor HTTP call: the door names no host and makes no request', !/https?:\/\/|https\.request|fetch\(|googleapis|google\.com/.test(door));
  ok('/api/usage carries the readings as homeAccounts (what the last press left — no estimate, no poll)', /homeAccounts: onDemandReadings\(\)/.test(read('src/usage-routes.js')) && /this\._homeAccountUsage = data\?\.homeAccounts \|\| \{\};/.test(read('src/lib/usage-meter.js')));
  ok('the ⋯ Re-check reads usage only when the login check says signed in, then re-reads /api/usage', /if \(r\?\.loggedIn\) \{\n\s*try \{ u = await fetchJson\(`\/api\/accounts\/home-subscription\/\$\{encodeURIComponent\(id\)\}\/usage`, \{ method: 'POST' \}\);/.test(read('src/lib/manage-agents.js')));
}

// ── ⑦ NEGATIVE CONTROLS ─────────────────────────────────────────────────────
console.log('⑦ negative controls (patched copies outside the tree)');
{
  const M = mutantCopies('agy-usage', REPO);
  const PSRC = read('src/harnesses/antigravity-usage.js');
  const GUESS_FIND = "      const rf = b.remaining_fraction;";
  ok('control guess-fraction: the line exists', PSRC.includes(GUESS_FIND));
  const guess = M.load('src/harnesses/antigravity-usage.js', PSRC.replace(GUESS_FIND, "      const rf = typeof b.remaining_fraction === 'number' ? b.remaining_fraction : 1; // a GUESS: no fraction ⇒ full"), 'guess-fraction');
  const redG = parserLegs(guess).filter((r) => !r.pass);
  ok(`control guess-fraction (a missing fraction read as "full"): the NEVER GUESSED leg is RED (${redG.length} red)`, redG.some((r) => /^NEVER GUESSED/.test(r.name) && /remaining_fraction missing → reading/.test(r.detail || '')), redG.map((r) => r.detail).join(' | ').slice(0, 300));
  const DSRC = read('src/server/cli-usage-door.js');
  const STOP_FIND = "    if (j.verdict === 'turn-started') {";
  ok('control no-stop: the STOP line exists', DSRC.includes(STOP_FIND));
  const noStop = M.load('src/server/cli-usage-door.js', DSRC.replace(STOP_FIND, "    if (false && j.verdict === 'turn-started') {").replace("    if (j.verdict !== 'reading') return", "    if (j.verdict !== 'reading' && j.verdict !== 'turn-started') return").replace("    const set = { ...j.reading, identity: id };", "    const set = { ...(j.reading || { limits: [{ limitId: 'x', windows: [] }] }), identity: id };"), 'no-stop');
  const redS = (await doorLegs(noStop)).filter((r) => !r.pass).map((r) => r.name);
  ok(`control no-stop (a turn-shaped answer written): THE STOP leg is RED (${redS.length} red)`, redS.some((n) => /^THE STOP/.test(n)), redS.join(' | ').slice(0, 300));
  const PACE_FIND = "      if (since < paceMs) return";
  ok('control no-pace: the pace line exists', DSRC.includes(PACE_FIND));
  const noPace = M.load('src/server/cli-usage-door.js', DSRC.replace(PACE_FIND, "      if (false && since < paceMs) return"), 'no-pace');
  const redP = (await doorLegs(noPace)).filter((r) => !r.pass).map((r) => r.name);
  ok(`control no-pace (every press runs agy): the "inside the minute" leg is RED (${redP.length} red)`, redP.some((n) => /inside the minute/.test(n)), redP.join(' | ').slice(0, 300));
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 3 })) ok(r.name, r.pass, r.detail);
}

console.log(`\n${fail ? fail + ' FAILED (' + pass + ' passed)' : 'ALL PASS (' + pass + ')'}`);
process.exit(fail ? 1 : 0);
