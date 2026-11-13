#!/usr/bin/env node
// THE NEEDS-DOORS CENSUS — ONE suite, two tables (主开发, 2026-11-13: lane machine-needs-at-pairing's «machine» rows in
// src/machine-needs.js, lane ui-needs-a-button's «ui» rows in src/ui-needs.js; ONE row vocabulary: a door present / none (why) /
// deferred «lane · B-id»). The runner is machine-needs-at-pairing's (scripts/test-machine-needs.mjs, landed first) over both tables:
//   ① THE CENSUS, derived and PRINTED: every sentence a person reads (each t() / tr() / i18nKey() literal in src/ — the same reader as
//      scripts/i18n-extract.mjs) that a table's net catches is claimed by a row of that table or by a non-need with its reason. A
//      sentence the MACHINE table claims is its (a machine's need); the UI table claims the rest
//   ② A DOOR ON EVERY SURFACE THAT STATES IT: a row whose door is present — every file that states one of its sentences (a PURE
//      model's words count for the surface that draws them: `via`) carries the door's marker in its source
//   ③ CONTROLS: a new sentence a net catches that no row claims is RED by name; a surface stating a present-door need without its
//      door is RED by name
// The machine table is read when it exists (it lands on its own lane's pick); the ui table always.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 1400) : '')); } };
const TABLES = [['machine', 'src/machine-needs.js'], ['ui', 'src/ui-needs.js']].filter(([, f]) => fs.existsSync(path.join(REPO, f))).map(([scope, f]) => ({ scope, file: f, T: require(path.join(REPO, f)) }));
ok(TABLES.some((x) => x.scope === 'ui'), 'the ui table exists (src/ui-needs.js)');
console.log(`tables: ${TABLES.map((x) => x.scope + ' (' + x.file + ')').join(' · ')}`);

// ── the tree's words: every t() / tr() / i18nKey() literal in src/ (not the dictionaries), with the files that hold it ──
const tRe = /\b(?:t|tr|i18nKey)\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;
const unescapeJs = (raw) => JSON.parse('"' + raw.replace(/\\.|"/g, (x) => (x === '"' ? '\\"' : x === "\\'" ? "'" : x)) + '"');
const sources = new Map();
const walk = (dir) => { for (const e of fs.readdirSync(path.join(REPO, dir), { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.js') && !/^i18n/.test(e.name)) sources.set(p, fs.readFileSync(path.join(REPO, p), 'utf8')); } };
walk('src');
const words = new Map();
for (const [file, text] of sources) for (const m of text.matchAll(tRe)) { let k; try { k = unescapeJs(m[1] != null ? m[1] : m[2]); } catch { continue; } if (!words.has(k)) words.set(k, new Set()); words.get(k).add(file); }

/** The census of every table over a set of sentences: a sentence goes to the FIRST table that claims it (machine, then ui). */
function census(ws) {
  const out = TABLES.map(({ scope, T }) => ({ scope, T, rows: new Map(T.NEEDS.map((r) => [r.id, { row: r, sentences: [], files: new Set() }])), non: [], unclaimed: [] }));
  for (const [s, files] of ws) {
    let taken = false;
    for (const c of out) {
      if (!c.T.inNet(s)) continue;
      const r = c.T.needOf(s);
      if (r) { const e = c.rows.get(r.id); e.sentences.push(s); for (const f of files) e.files.add((r.door.via && r.door.via[f]) || f); taken = true; break; }
      const n = c.T.notNeedOf(s);
      if (n) { c.non.push({ s, why: n.why }); taken = true; break; }
    }
    if (taken) continue;
    const first = out.find((c) => c.T.inNet(s));
    if (first) first.unclaimed.push({ s, files: [...files] });
  }
  return out;
}
const markerOf = (mk, f) => (mk instanceof RegExp ? mk : mk[f] || /(?!)/);
const doorless = (e, src = (f) => sources.get(f) || '') => (e.row.door.present ? [...e.files].filter((f) => !markerOf(e.row.door.present.marker, f).test(src(f))) : []);

console.log('① THE CENSUS (derived from the tree)');
const C = census(words);
for (const c of C) {
  const caught = [...words.keys()].filter((s) => c.T.inNet(s)).length;
  console.log(`  [${c.scope}] the net catches ${caught} sentence(s)`);
  for (const e of c.rows.values()) {
    const d = e.row.door;
    const door = d.present ? `door present (${[...e.files].sort().join(', ') || 'no surface'})` : d.none ? `NONE — ${d.none}` : `deferred «${d.deferred}»`;
    console.log(`  · [${c.scope}] ${e.row.id} — ${e.row.need} — ${e.sentences.length} sentence(s) — ${door}`);
  }
  console.log(`  · [${c.scope}] not needs: ${c.non.length} (${[...new Set(c.non.map((x) => x.why))].length} reasons)`);
  ok(c.unclaimed.length === 0, `[${c.scope}] every sentence its net catches is claimed — by a row or a non-need with its reason (${caught})`, c.unclaimed.slice(0, 12));
  ok([...c.rows.values()].every((e) => e.sentences.length > 0), `[${c.scope}] every row claims at least one sentence of the tree (no dead row)`, [...c.rows.values()].filter((e) => !e.sentences.length).map((e) => e.row.id));
  ok(c.T.NEEDS.every((r) => (!!r.door.present + !!r.door.none + !!r.door.deferred) === 1), `[${c.scope}] every row has exactly one door verdict (present / none / deferred)`);
  ok(c.T.NEEDS.filter((r) => r.door.deferred).every((r) => r.door.deferred === c.T.DEFERRED), `[${c.scope}] every deferred door names its owner («${c.T.DEFERRED}»)`);
  if (c.scope === 'machine') ok(c.T.NEEDS.every((r) => ['a', 'b', 'c', '-'].includes(r.kind) && Array.isArray(r.platforms) && r.platforms.length), '[machine] every row has a kind and its platforms');
}

console.log('② A DOOR ON EVERY SURFACE THAT STATES IT');
for (const c of C) for (const e of c.rows.values()) if (e.row.door.present) ok(doorless(e).length === 0 && e.files.size > 0, `[${c.scope}] ${e.row.id}: every surface that states it draws its door (${[...e.files].sort().join(', ')})`, doorless(e));

console.log('③ CONTROLS');
const ui = C.find((c) => c.scope === 'ui');
const planted = new Map(words); planted.set('Turn it on in Settings → Frobnicate first', new Set(['src/lib/planted.js']));
const P = census(planted).find((c) => c.scope === 'ui');
ok(P && P.unclaimed.length === 1 && /Frobnicate/.test(P.unclaimed[0].s), 'CONTROL: a new «… in Settings → X» sentence that no row claims is RED by name', P && P.unclaimed);
const fc = ui && ui.rows.get('folder-create');
const stripped = (f) => (f === 'src/lib/path-field.js' ? (sources.get(f) || '').replace(/data-act="tick"/g, 'data-act="gone"') : sources.get(f) || '');
ok(fc && JSON.stringify(doorless(fc, stripped)) === JSON.stringify(['src/lib/path-field.js']), 'CONTROL: the folder field stating «create it?» with its create door taken out is RED by name', fc && doorless(fc, stripped));

console.log('④ THE SERVER\'S ACTS, DRIVEN IN-PROCESS (lane ui-needs-a-button picks 1–2 + the reader\'s list)');
const os = await import('node:os');
const http = await import('node:http');
const { execFileSync } = await import('node:child_process');
const { pathToFileURL } = await import('node:url');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-needs-doors-'));
const FIFO_BOUND_MS = 400;   // the FIFO leg's read bound: this suite WAITS it on purpose (verifier #4: its ci.mjs row can state no less)
const T32 = (c) => String(c).repeat(32);
{
  // for-you-2: a parked ask is a POINTER — its one closer says what stays true; the note's words name the conversation's card
  const FA = require(path.join(REPO, 'src/foryou-actions.js'));
  const parked = (type) => ({ id: 'x', status: 'open', action: { type } });
  ok(typeof FA.isParkedAsk === 'function' && FA.isParkedAsk(parked('main-ask')) && FA.isParkedAsk(parked('helper-ask')) && !FA.isParkedAsk(parked('exit-run-ask'))
    && JSON.stringify(FA.closersOf(parked('main-ask'))) === '["hide"]' && JSON.stringify(FA.closersOf(parked('helper-ask'))) === '["hide"]',
    'for-you-2: a parked ask (main-ask / helper-ask) is a pointer — its ONE closer is the hide («Stop reminding (the conversation stays paused)»), never «Mark done»', typeof FA.closersOf === 'function' ? FA.closersOf(parked('main-ask')) : null);
  const IR = require(path.join(REPO, 'src/inbox-reply.js'));
  const LAY = await import(pathToFileURL(path.join(REPO, 'src/lib/inbox-window-layout.js')).href);
  const pv = LAY.itemView({ id: 'h1', type: 'helper-ask', status: 'open', sessionKey: 'claude:x', createdAt: 1 }, { reply: { show: false, enabled: false, code: 'card_item', why: IR.REPLY_WHY.card_item } });
  ok(pv && pv.reply && !pv.reply.show && pv.reply.code === 'card_item', 'for-you-2: the window\'s VIEW of a parked ask keeps the code its door is drawn off (card_item) — the door reaches the screen', pv && pv.reply);
  ok(IR.REPLY_WHY.card_item === 'Answered on the conversation’s card — open the conversation to answer it', 'for-you-2: the note names the conversation\'s card (never «the helper\'s»); its door «Open the conversation and answer» is on its line', IR.REPLY_WHY.card_item);
}
{
  // reader #1: «Stop reminding (the conversation stays paused)» HOLDS ACROSS A HUB RESTART — a filer never reopens an item the person hid
  // for the same request (main-asks / helper-asks), while a NEW request of the same conversation is still filed
  const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
  const drive = (kind) => {
    const dir = fs.mkdtempSync(path.join(TMP, 'parked-'));
    const todos = new UserTodoManager({ dataDir: dir, expirySweepMs: 0 });
    const at = Date.now() - 600000;
    const asks = [{ requestId: 'req-1', toolName: 'Bash', kind: kind === 'main' ? 'permission' : 'helper', at, msgId: 'm1', label: 'Fetch the page' }];
    const session = { _webuiId: 'w1', name: 'Session 1', _historyLoaded: true, _normalizer: { pendingAsks: () => asks.slice(), messageIndex: new Map([['m1', { permission: { requestId: 'req-1', toolName: 'Bash', input: { command: 'echo hi' } } }]]) } };
    const file = kind === 'main' ? 'src/server/main-asks.js' : 'src/server/helper-asks.js';
    const type = kind === 'main' ? 'main-ask' : 'helper-ask';
    const saved = {};
    const fresh = () => { for (const k of Object.keys(require.cache)) if (k.endsWith(file)) delete require.cache[k]; const M = require(path.join(REPO, file)); M.install({ userTodos: todos, sessionKeyFor: () => 'claude:w1', activeSessions: new Map([['w1', session]]), log: { log() {}, warn() {} }, readAskedAt: () => saved, persistAskedAt: (_s, m) => Object.assign(saved, m) }); return M; };
    const items = () => todos._state.items.filter((i) => i.action && i.action.type === type).map((i) => `${i.action.requestId}:${i.status}/${i.resolvedBy || '-'}`);
    const out = [];
    let M = fresh(); M.sync(session); out.push(items());
    const it = todos._state.items.find((i) => i.action && i.action.type === type);
    if (it) todos.setStatus(it.id, 'dismissed', 'user');
    out.push(items());
    // a second ask of the conversation, waiting since before the restart (its card's time is its clock at the first look)
    asks.push({ requestId: 'req-2', toolName: 'Edit', kind: kind === 'main' ? 'permission' : 'helper', at, msgId: 'm2', label: 'Edit the file' });
    M = fresh(); M.sync(session); out.push(items());   // a hub restart: a fresh module, the same store, the asks still wait
    try { todos.stop(); } catch { /* the store's timers */ }
    return out;
  };
  for (const kind of ['main', 'helper']) {
    const r = drive(kind);
    ok(JSON.stringify(r[0]) === '["req-1:open/-"]' && JSON.stringify(r[1]) === '["req-1:dismissed/hidden"]' && r[2].includes('req-1:dismissed/hidden') && r[2].some((x) => /^req-2:open/.test(x)) && r[2].length === 2,
      `reader #1 (${kind}-ask): filed → «Stop reminding» (hidden) → a hub RESTART → still hidden (r.399 picks: reopened); the conversation's OTHER waiting request is still filed`, r);
  }
}
{
  // desktop-apps-27: a .deb FILE that is not there is its own code, never «no such package» (and never handed to an agent)
  const DEB = require(path.join(REPO, 'src/app-kinds/deb.js'));
  const r27 = await DEB.planner({ p: { debPath: '/nonexistent-vs-' + process.pid + '/package.deb' }, kind: 'deb', ret: (x) => x, fsp: fs.promises, path, A: { fmtBytes: (n) => String(n) }, DEB_MAX: 1 << 30 }).catch((e) => ({ threw: String(e && e.message) }));
  const DAL = fs.readFileSync(path.join(REPO, 'src/lib/desktop-app-launcher.js'), 'utf8');
  ok(r27 && r27.ok === false && r27.code === 'file_missing' && /package\.deb$/.test(String(r27.path || '')) && !/'file_missing'/.test((/HAND_OFF_CODES = Object\.freeze\(\[[^\]]*\]/.exec(DAL) || [''])[0]),
    'desktop-apps-27: a .deb that is not there ⇒ code file_missing with its path (r.398: not_found — «no such package» and «let an agent find another way»); it is never a hand-off code', r27);
  const AM = require(path.join(REPO, 'src/app-manifest.js'));
  ok(AM.PLAN_CODES.includes('file_missing') && AM.PLAN_CODES.includes('file_unreadable'), 'reader #9: the plan refusals\' closed set (app-manifest PLAN_CODES) names the two .deb FILE codes', AM.PLAN_CODES);
}
{
  // browser-live-1: the person's STOP — any conversation's own tab without a takeover; never another's / nobody's / a mediated one
  const TB = require(path.join(REPO, 'src/browser-tabs.js'));
  const V = (o) => TB.userTabVerdict({ act: 'stop', ...o });
  ok(TB.USER_TAB_ACTS.includes('stop') && V({ owner: 'agent' }).ok && V({ owner: 'you' }).ok && V({ owner: 'agent', mediated: true }).code === 'mediated_tabs' && V({ owner: 'other' }).code === 'not_your_tab' && V({ owner: 'orphan' }).code === 'not_your_tab'
    && TB.TAB_REFUSALS.includes('stop_failed') && /stopped .* loading/.test(TB.userActsSentence([{ kind: 'tab-stop', title: 'Shop', url: 'https://shop.example/' }])),
    'browser-live-1: a stop is the person\'s on the viewed conversation\'s own tab WITHOUT a takeover (nothing but the load stops), on the person\'s own; another\'s, nobody\'s, a mediated one refused by name; said to the agent at the handback while driving');
  const BS = require(path.join(REPO, 'src/browser-stream.js'));
  const vv = BS.viewerMessageVerdict({ type: 'tab-act', act: 'stop', targetId: T32('A'), rid: 3 });
  ok(vv && vv.kind === 'tab-act' && vv.act === 'stop' && !vv.refusal, 'browser-live-1: the bridge takes a {type: tab-act, act: stop} from a viewer', vv);
  // the bridge's guard, DRIVEN (reader #4): a view a bearer opened is refused agent_forbidden, one with no press from this page not_a_press
  const SBS = require(path.join(REPO, 'src/server/browser-stream.js'));
  const WO = require(path.join(REPO, 'src/write-origin.js'));
  const page = (h) => WO.pageOfUpgrade({ headers: { host: 'vs.test', ...h }, url: '/api/browser/stream' });
  const sr = (viewer, msg) => { if (typeof SBS.stopRefusalOf !== 'function') return 'no stopRefusalOf'; const personPress = WO.isPress(WO.pressOf(viewer.page, 'WS /api/browser/stream tab-act stop')); return SBS.stopRefusalOf(viewer, msg, personPress); };
  const person = { bearer: false, page: page({ 'sec-fetch-site': 'same-origin' }) }, agent = { bearer: true, page: page({ authorization: 'Bearer vsst_' + 'a'.repeat(24) }) }, script = { bearer: false, page: page({}) };
  const r1 = sr(agent, vv), r2 = sr(script, vv), r3 = sr(person, vv), r4 = sr(agent, { ...vv, act: 'switch' });
  ok(r1 && r1.code === 'agent_forbidden' && r1.ok === false && r1.type === 'tab-ack' && r2 && r2.code === 'not_a_press' && r3 === null && r4 === null,
    'browser-live-1 (reader #4): the bridge\'s guard, driven — a stop from a view a BEARER opened ⇒ agent_forbidden, from a page that is no press ⇒ not_a_press; the person\'s page passes; a switch is not judged here', { r1, r2, r3, r4 });
  // the keeper's stop over a FAKE CDP (reader #4): Page.stopLoading on THAT tab through the keeper's own CDP; a refused stop sends nothing
  const KP = require(path.join(REPO, 'src/server/browser-keeper.js'));
  if (typeof KP.personStop !== 'function') ok(false, 'browser-live-1 (reader #4): the keeper\'s stop is driven with a fake CDP — personStop (src/server/browser-keeper.js) is missing');
  else {
    const sent = [], notes = [], unnotes = [];
    let answer = { ok: true };
    const args = (o = {}) => ({ id: T32('B'), owner: 'agent', driving: false, counts: { agent: 2, you: 0 }, row: { title: 'Shop', url: 'https://shop.example/' }, target: { kind: 'lease' },
      withCdpUrl: async (_t, fn) => fn('ws://cdp.test/devtools/browser/fake'), refuse: (v) => { throw Object.assign(new Error(v.error), { code: v.code }); },
      VP: { stopLoadingOf: async (url, id) => { sent.push([url, id]); return answer; } }, note: (x) => { notes.push(x); return { rec: notes.length }; }, unnote: (rec, why) => unnotes.push([rec, why]), ...o });
    const a = await KP.personStop(args());
    const b = await KP.personStop(args({ driving: true }));
    answer = { ok: false, error: 'Not attached to an active page' };
    const c = await KP.personStop(args({ driving: true })).catch((e) => ({ code: e.code }));
    const n0 = sent.length;
    const d = await KP.personStop(args({ owner: 'other' })).catch((e) => ({ code: e.code }));
    ok(a.ok && a.stopped && a.targetId === T32('B') && sent[0] && sent[0][1] === T32('B') && /^ws:/.test(sent[0][0]) && b.ok && notes.length >= 1 && notes[0].kind === 'tab-stop' && notes[0].title === 'Shop'
      && c.code === 'stop_failed' && unnotes.length === 1 && /Not attached/.test(unnotes[0][1]) && d.code === 'not_your_tab' && sent.length === n0,
      'browser-live-1 (reader #4): the keeper\'s stop, driven over a fake CDP — Page.stopLoading on THAT tab (its target id); recorded while driving (said at the handback); a refused stop takes its record back (stop_failed); another conversation\'s tab sends nothing', { a, b, c, d, sent, notes, unnotes });
  }
  // reader #2: the loop fact names WHICH tab loops — loopIn → the row fact → loopBlock → the conversation's fact → the page (its digest too)
  const ST = require(path.join(REPO, 'src/browser-stuck.js'));
  const lp = { urls: ['https://bank.example/a', 'https://bank.example/b'], hosts: ['bank.example'], hops: 12, sinceMs: 9000, runStart: 5, targetId: T32('B') };
  const blk = ST.loopBlock(lp), fact = ST.stuckFact({ loop: { ...ST.loopBlock(lp), runStart: lp.runStart } });
  const BF = require(path.join(REPO, 'src/browser-fact.js'));
  const dg = (id) => BF.factDigest({ key: 'k', using: {}, stuck: { state: 'loop', loop: { urls: lp.urls, targetId: id } } });
  const BD = fs.readFileSync(path.join(REPO, 'src/server/browser-dialogs.js'), 'utf8');
  ok(blk.targetId === T32('B') && fact.loop && fact.loop.targetId === T32('B') && dg(T32('A')) !== dg(T32('B')) && /if \(lp\) return \{ state: 'loop', since: lp\.runStart \|\| 0, \.\.\.\(lp\.targetId \? \{ targetId:/.test(BD),
    'reader #2: the loop fact carries the LOOPING tab\'s target id — browser-dialogs loopIn → the row fact (read), loopBlock → the conversation\'s fact (driven), and a loop that moves to another tab is a new digest (the page redraws its doors)', { blk, fact });
}
{
  // machines-1: an ssh machine that refused the key — the PUBLIC half of the key it signs in with, READ (never made), the person's only
  const key = path.join(TMP, 'k');
  execFileSync('ssh-keygen', ['-t', 'ed25519', '-N', '', '-C', 'needs-doors', '-f', key, '-q']);
  const pub = fs.readFileSync(key + '.pub', 'utf8').trim();
  const { HostManager } = require(path.join(REPO, 'src/hosts.js'));
  fs.mkdirSync(path.join(TMP, 'data'), { recursive: true });
  const H = new HostManager({ dataDir: path.join(TMP, 'data') });
  const id = H.add({ name: 'gpu-01', user: 'ubuntu', host: '127.0.0.1', port: 22, keyPath: key });
  const before = fs.readdirSync(TMP).sort().join(',');
  const readPub = (x, o) => (typeof H.publicKeyOf === 'function' ? H.publicKeyOf(x, o) : { ok: false, code: 'no publicKeyOf (the release)' });
  const a = await readPub(id);
  fs.rmSync(key + '.pub');
  const b = await readPub(id);
  const after = fs.readdirSync(TMP).sort().join(',');
  ok(a.ok && a.keys[0].publicKey === pub && a.keys[0].source === 'file' && b.ok && b.keys[0].publicKey.split(' ').slice(0, 2).join(' ') === pub.split(' ').slice(0, 2).join(' ') && b.keys[0].source === 'derived' && after === before.replace('k.pub,', '').replace(',k.pub', '')
    && !/PRIVATE KEY/.test(JSON.stringify([a, b])) && !fs.existsSync(path.join(TMP, 'data', 'ssh', 'id_ed25519')),
    'machines-1: publicKeyOf reads the PUBLIC half of an existing machine\'s key — its .pub, else derived on the server (ssh-keygen -y); no key is made, no private byte is answered', { a, b });
  // reader #3: THE READ IS BOUNDED — a .pub that never answers (a FIFO: its open waits for a writer forever, as a hung mount's read does)
  // is given up at the bound and the derive answers; r.399 picks: fs.promises.readFile held a threadpool thread and never answered
  const fifo = key + '.pub';
  execFileSync('mkfifo', [fifo]);
  const c = await Promise.race([Promise.resolve(readPub(id, { timeoutMs: FIFO_BOUND_MS })), new Promise((r) => setTimeout(() => r({ hung: true }), 3500))]);
  try { const fd = fs.openSync(fifo, fs.constants.O_WRONLY | fs.constants.O_NONBLOCK); fs.closeSync(fd); } catch { /* no reader left: nothing waits on it */ }
  const HS = fs.readFileSync(path.join(REPO, 'src/hosts.js'), 'utf8');
  const pk = (/async publicKeyOf\([\s\S]*?\n  \}\n/.exec(HS) || [''])[0];
  ok(c && c.ok && c.keys[0].source === 'derived' && pk && !/fs\.promises|readFileSync|readFile\(/.test(pk),
    'reader #3: a .pub read that never answers (a FIFO standing in for a hung mount) is given up at the bound — the derive answers before the watchdog (a hang is { hung }); publicKeyOf reads through a bounded child, never fs on the hub', { c });
  // GET /api/hosts/:id/public-key — DRIVEN through an in-process app (reader #4 / #7): THE person verdict (routes/vault.js personVerdict)
  const express = require(path.join(REPO, 'node_modules/express'));
  const app = express();
  const calls = [];
  const hosts = { publicKeyOf: async (hid) => { calls.push(hid); return hid === 'h1' ? { ok: true, keys: [{ publicKey: 'ssh-ed25519 AAAAfake needs-doors', source: 'file' }] } : { ok: false, code: 'no_key' }; }, list: () => [], get: () => null, keyInfo: () => ({ exists: false }) };
  const ER = require(path.join(REPO, 'src/server/exit-routes.js'));
  let made = null;
  try { ER.create({ app, rootDir: REPO, AGENT_BIN_DIR: path.join(TMP, 'no-bin'), activeSessions: new Map(), auth: { enabled: false, requestAuthed: () => true, checkToken: () => true }, wss: null, WS_OPEN: 1, bcastAll: () => {}, integrationEnabled: () => true, unpairDialDevice: () => {}, hosts, getExitProxy: () => null, getMounts: () => null, getPortForwards: () => null }); } catch (e) { made = e.message; }
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const port = srv.address().port;
  const get = (p, headers = {}) => new Promise((res) => { http.get({ host: '127.0.0.1', port, path: p, headers }, (r) => { let body = ''; r.on('data', (d) => { body += d; }); r.on('end', () => { let j = null; try { j = JSON.parse(body); } catch { /* not json */ } res({ status: r.statusCode, code: j && j.code, key: !!(j && j.keys) }); }); }).on('error', (e) => res({ err: e.message })); });
  const SAME = { 'sec-fetch-site': 'same-origin' };
  const rows = {
    page: await get('/api/hosts/h1/public-key', SAME),
    session: await get('/api/hosts/h1/public-key', { ...SAME, authorization: 'Bearer vsst_' + 'x'.repeat(20) }),
    job: await get('/api/hosts/h1/public-key', { ...SAME, authorization: 'Bearer jbt_' + 'y'.repeat(20) }),
    automation: await get('/api/hosts/h1/public-key', { ...SAME, authorization: 'Bearer vsak_' + 'z'.repeat(20) }),
    lowercase: await get('/api/hosts/h1/public-key', { ...SAME, authorization: 'bearer abc123' }),
    crossSite: await get('/api/hosts/h1/public-key', { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' }),
    noBrowser: await get('/api/hosts/h1/public-key'),
    noKey: await get('/api/hosts/h2/public-key', SAME),
  };
  await new Promise((r) => srv.close(r));
  // verifier #3 (the route): «Add it again with a key…» — POST /api/hosts `replaces` names the ssh machine the new record REPLACES: its
  // name is no clash, and the old record is removed only AFTER the new one is saved (a refused add leaves it as it was); without
  // `replaces` the name is still refused (the host-name-taken refusal)
  {
    fs.mkdirSync(path.join(TMP, 'data-replace'), { recursive: true });
    const H2 = new HostManager({ dataDir: path.join(TMP, 'data-replace') });
    const oldId = H2.add({ name: 'gpu-02', user: 'ubuntu', host: '10.0.0.5', port: 2222 });
    const app2 = express();
    app2.use(express.json());
    let made2 = null;
    try { ER.create({ app: app2, rootDir: REPO, AGENT_BIN_DIR: path.join(TMP, 'no-bin'), activeSessions: new Map(), auth: { enabled: false, requestAuthed: () => true, checkToken: () => true }, wss: null, WS_OPEN: 1, bcastAll: () => {}, integrationEnabled: () => true, unpairDialDevice: () => {}, hosts: H2, getExitProxy: () => null, getMounts: () => null, getPortForwards: () => null }); } catch (e) { made2 = e.message; }
    const srv2 = await new Promise((r) => { const x = app2.listen(0, '127.0.0.1', () => r(x)); });
    const post = (p, body) => new Promise((res) => { const data = JSON.stringify(body); const rq = http.request({ host: '127.0.0.1', port: srv2.address().port, path: p, method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } }, (r) => { let b = ''; r.on('data', (d) => { b += d; }); r.on('end', () => { let j = null; try { j = JSON.parse(b); } catch { /* not json */ } res({ status: r.statusCode, id: j && j.id, error: j && j.error }); }); }); rq.on('error', (e) => res({ err: e.message })); rq.end(data); });
    const rows2 = () => H2._state.hosts.map((h) => `${h.name}@${h.host}:${h.port}${h.id === oldId ? ' (old)' : ''}`);
    const taken = await post('/api/hosts', { name: 'gpu-02', user: 'ubuntu', host: '10.0.0.6', port: '2222' });
    const after1 = rows2();
    const refused = await post('/api/hosts', { name: 'gpu-02', user: '', host: '10.0.0.6', port: '2222', replaces: oldId });
    const after2 = rows2();
    const done = await post('/api/hosts', { name: 'gpu-02', user: 'ubuntu', host: '10.0.0.6', port: '2222', replaces: oldId });
    const after3 = rows2();
    await new Promise((r) => srv2.close(r));
    ok(!made2 && taken.status === 400 && JSON.stringify(after1) === '["gpu-02@10.0.0.5:2222 (old)"]' && refused.status === 400 && JSON.stringify(after2) === JSON.stringify(after1)
      && done.status === 200 && done.id && done.id !== oldId && JSON.stringify(after3) === '["gpu-02@10.0.0.6:2222"]',
      'machines-1 (verifier #3): POST /api/hosts `replaces`, DRIVEN — the same name without it is still refused; a refused add leaves the old machine as it was; a saved one REPLACES it (one «gpu-02», the new address; the old record removed only after the new one is saved)', { made2, taken, refused, done, after1, after2, after3 });
  }
  const ERS = fs.readFileSync(path.join(REPO, 'src/server/exit-routes.js'), 'utf8');
  const route = (/app\.get\('\/api\/hosts\/:id\/public-key'[\s\S]*?\n\}\);/.exec(ERS) || [''])[0];
  ok(!made && rows.page.status === 200 && rows.page.key && ['session', 'job', 'automation', 'lowercase'].every((k) => rows[k].status === 403 && rows[k].code === 'human_only' && !rows[k].key)
    && rows.crossSite.status === 403 && rows.crossSite.code === 'cross_site' && rows.noBrowser.status === 403 && rows.noBrowser.code === 'cross_site'
    && rows.noKey.status === 404 && rows.noKey.code === 'no_key' && JSON.stringify(calls) === '["h1","h2"]' && !/generateKey/.test(route) && !/BEARER_KIND/.test(ERS),
    'machines-1 (reader #4 / #7): GET /api/hosts/:id/public-key, DRIVEN — THE person verdict: this page reads the key; any bearer ⇒ 403 human_only, another site or a browser-less caller ⇒ 403 cross_site (never read); no key ⇒ 404 no_key; no local verdict copy, no key made', { made, rows, calls });
  // plugins-integrations-19 (主开发 Q3, words only): the relay address ending /slack/ on a Lark / Google card is ONE page for every provider
  const OSU = fs.readFileSync(path.join(REPO, 'src/oauth-setup.js'), 'utf8');
  ok(/'row\.public': i18nKey\('[^']*one page for Lark, Slack and Google/.test(OSU) && /'row\.own\.tpl': i18nKey\('[^']*one page serves every provider/.test(OSU),
    'plugins-integrations-19: the relay rows say one page serves Lark, Slack and Google (the published path is not renamed)');
  // sidebar-sessions-4: the tick is drawn whether or not the parent exists (one row, its door on the line)
  const PF = fs.readFileSync(path.join(REPO, 'src/lib/path-field.js'), 'utf8');
  ok(/\+ `<label class="pf-tickrow"><input type="checkbox" data-act="tick"/.test(PF) && !/x\.parentOk \? `<label class="pf-tickrow">/.test(PF) && !/nor the folder above — pick another/.test(PF),
    'sidebar-sessions-4: «create it?» always carries its create on the line — a missing parent too (made with it at use: /api/mkdir is mkdir -p)');
}

console.log('⑤ THE PAGE\'S DOORS, DRAWN AND PRESSED (the client bundled by esbuild — build-version stubbed — over a minimal DOM)');
// ── a minimal DOM: elements with children, classes, data-*, style.cssText, listeners, simple selectors ──
const kebab = (k) => k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
const camel = (k) => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
function mkStyle() {
  const st = {};
  Object.defineProperty(st, 'cssText', { enumerable: false, get() { return Object.keys(st).filter((k) => st[k] !== '' && st[k] != null).map((k) => `${kebab(k)}: ${st[k]}`).join('; '); }, set(v) { for (const k of Object.keys(st)) delete st[k]; for (const part of String(v || '').split(';')) { const m = /^\s*([\w-]+)\s*:\s*(.*?)\s*$/.exec(part); if (m) st[camel(m[1])] = m[2]; } } });
  Object.defineProperty(st, 'setProperty', { enumerable: false, value(k, v) { st[camel(k)] = String(v); } });
  Object.defineProperty(st, 'removeProperty', { enumerable: false, value(k) { delete st[camel(k)]; } });
  return st;
}
let DOC = null;
function matchSel(n, sel) {
  return String(sel).split(',').some((one) => {
    const last = one.trim().replace(/^:scope\s*>\s*/, '').split(/\s*>\s*|\s+/).pop();
    const m = /^([a-zA-Z][\w-]*)?((?:\.[\w-]+)*)((?:\[[^\]]+\])*)$/.exec(last);
    if (!m || n.nodeType !== 1) return false;
    if (m[1] && n.tagName !== m[1].toUpperCase()) return false;
    for (const c of (m[2] || '').split('.').filter(Boolean)) if (!n.classList.contains(c)) return false;
    for (const a of (m[3] || '').match(/\[[^\]]+\]/g) || []) { const am = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(a); if (!am) return false; const v = am[1].startsWith('data-') ? n.dataset[camel(am[1].slice(5))] : n.getAttribute(am[1]); if (am[2] === undefined ? v == null : String(v) !== am[2]) return false; }
    return true;
  });
}
class Nd {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.nodeType = tag === '#text' ? 3 : 1; this.children = []; this.parentNode = null; this.style = mkStyle(); this.dataset = {}; this.attributes = {}; this._text = ''; this._ls = {}; this.className = ''; this.id = ''; this.value = ''; this.disabled = false; }
  get classList() { const n = this; const list = () => String(n.className || '').split(/\s+/).filter(Boolean); return { add: (...c) => { n.className = [...new Set([...list(), ...c])].join(' '); }, remove: (...c) => { n.className = list().filter((x) => !c.includes(x)).join(' '); }, contains: (c) => list().includes(c), toggle: (c, f) => { const has = list().includes(c); const want = f === undefined ? !has : !!f; if (want !== has) { if (want) n.classList.add(c); else n.classList.remove(c); } return want; } }; }
  get childNodes() { return this.children; }
  get firstChild() { return this.children[0] || null; }
  get parentElement() { return this.parentNode; }
  get isConnected() { for (let n = this; n; n = n.parentNode) if (n === DOC.body) return true; return false; }
  _drop(n) { const i = this.children.indexOf(n); if (i >= 0) this.children.splice(i, 1); n.parentNode = null; }
  appendChild(n) { if (n.parentNode) n.parentNode._drop(n); this.children.push(n); n.parentNode = this; return n; }
  append(...ns) { for (const n of ns) this.appendChild(typeof n === 'string' ? textNode(n) : n); }
  prepend(...ns) { for (const n of ns.reverse()) this.insertBefore(typeof n === 'string' ? textNode(n) : n, this.children[0] || null); }
  insertBefore(n, ref) { if (n.parentNode) n.parentNode._drop(n); const i = ref ? this.children.indexOf(ref) : -1; if (i < 0) this.children.push(n); else this.children.splice(i, 0, n); n.parentNode = this; return n; }
  replaceChildren(...ns) { for (const c of this.children) c.parentNode = null; this.children = []; this._text = ''; this.append(...ns); }
  remove() { if (this.parentNode) this.parentNode._drop(this); }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { for (const c of this.children) c.parentNode = null; this.children = []; this._text = String(v ?? ''); }
  get innerHTML() { return this._html || ''; }
  set innerHTML(v) { this.children = []; this._text = ''; this._html = String(v ?? ''); }
  setAttribute(k, v) { this.attributes[k] = String(v); if (k === 'class') this.className = String(v); if (k === 'id') this.id = String(v); }
  getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; }
  removeAttribute(k) { delete this.attributes[k]; }
  hasAttribute(k) { return k in this.attributes; }
  addEventListener(type, f) { (this._ls[type] ||= []).push(f); }
  removeEventListener(type, f) { const l = this._ls[type]; if (l) { const i = l.indexOf(f); if (i >= 0) l.splice(i, 1); } }
  listening(type) { return (this._ls[type] || []).length; }
  dispatchEvent(ev) { for (const f of [...(this._ls[ev.type] || [])]) f(ev); return true; }
  matches(sel) { return matchSel(this, sel); }
  closest(sel) { for (let n = this; n && n.nodeType === 1; n = n.parentNode) if (matchSel(n, sel)) return n; return null; }
  querySelectorAll(sel) { const out = []; const walk = (n) => { for (const c of n.children) { if (matchSel(c, sel)) out.push(c); walk(c); } }; walk(this); return out; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  focus() { DOC.activeElement = this; }
  blur() {}
  select() { this.selected = true; }
  click() { const ev = { type: 'click', target: this, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} }; if (typeof this.onclick === 'function') this.onclick(ev); this.dispatchEvent(ev); }
  getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
  get offsetWidth() { return parseFloat(this.style.width) || 0; }
  get offsetHeight() { return parseFloat(this.style.height) || 0; }
  get offsetLeft() { return parseFloat(this.style.left) || 0; }
  get offsetTop() { return parseFloat(this.style.top) || 0; }
}
const textNode = (s) => { const n = new Nd('#text'); n._text = String(s); return n; };
DOC = new Nd('#document'); DOC.nodeType = 9;
DOC.body = new Nd('body'); DOC.head = new Nd('head'); DOC.documentElement = new Nd('html'); DOC.documentElement.lang = 'en';
let PREVIEW = null, EXEC_COPY = false;
Object.assign(DOC, {
  createElement: (tg) => new Nd(tg), createTextNode: textNode, hidden: false, visibilityState: 'visible', hasFocus: () => true,
  getElementById: (id) => { const walk = (n) => { for (const c of n.children) { if (c.id === id) return c; const r = walk(c); if (r) return r; } return null; }; return walk(DOC.body); },
  querySelector: (sel) => (PREVIEW && /desktop-preview-win/.test(sel) ? PREVIEW : DOC.body.querySelector(sel)), querySelectorAll: (sel) => DOC.body.querySelectorAll(sel),
  execCommand: () => EXEC_COPY,
});
const PREFS = {};
let RELOADS = 0;
Object.assign(globalThis, {
  window: globalThis, document: DOC, localStorage: { getItem: (k) => (k in PREFS ? PREFS[k] : null), setItem: (k, v) => { PREFS[k] = String(v); }, removeItem: (k) => { delete PREFS[k]; } },
  sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} }, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
  requestAnimationFrame: (f) => setTimeout(f, 0), cancelAnimationFrame: (i) => clearTimeout(i), ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
  MutationObserver: class { observe() {} disconnect() {} }, IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} }, innerWidth: 1440, innerHeight: 900, devicePixelRatio: 1,
  location: { origin: 'http://vs.test', href: 'http://vs.test/', protocol: 'http:', host: 'vs.test', hostname: 'vs.test', pathname: '/', search: '', hash: '', reload() { RELOADS++; } },
  getComputedStyle: () => ({ getPropertyValue: () => '' }), addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true,
  CustomEvent: class { constructor(type, o) { this.type = type; this.detail = o && o.detail; } },
});
Object.defineProperty(globalThis, 'navigator', { value: { language: 'en', languages: ['en'], userAgent: 'node', maxTouchPoints: 0, clipboard: null }, configurable: true, writable: true });
const realFetch = globalThis.fetch;
let FETCH = async () => { throw new Error('no fetch in this leg'); };
globalThis.fetch = (...a) => FETCH(...a);
// ── the client, bundled ONCE (one module instance: one i18n, one utils) ──
const esbuild = require(path.join(REPO, 'node_modules/esbuild'));
const stubBuildVersion = { name: 'stub-build-version', setup(b) { b.onResolve({ filter: /build-version\.js$/ }, () => ({ path: 'build-version', namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: "export const BUILD_VERSION = 'test';", loader: 'js' })); } };
const ENTRY = [['NL', 'need-line'], ['UT', 'utils'], ['SM', 'sidebar-mounts'], ['WN', 'window'], ['LB', 'browser-loop-banner'], ['SU', 'settings-ui'], ['SET', 'settings'], ['SS', 'settings-schema'],
  ['DAL', 'desktop-app-launcher'], ['AID', 'app-install-dialog'], ['UTR', 'user-todos-row'], ['IW', 'inbox-window'], ['LAY', 'inbox-window-layout'], ['OCR', 'oauth-connect-row'], ['BNP', 'browser-new-profile-model']]
  .map(([k, f]) => `export * as ${k} from './${f}.js';`).join('\n');
let CL = null;
try {
  const out = await esbuild.build({ stdin: { contents: ENTRY, resolveDir: path.join(REPO, 'src/lib'), sourcefile: 'needs-doors-entry.js', loader: 'js' }, bundle: true, format: 'esm', write: false, plugins: [stubBuildVersion], logLevel: 'silent', loader: { '.css': 'empty' } });
  const f = path.join(TMP, 'client.mjs');
  fs.writeFileSync(f, out.outputFiles[0].text);
  CL = await import(pathToFileURL(f).href);
} catch (e) { ok(false, 'the client bundles and imports under the minimal DOM', String(e && e.message).slice(0, 600)); }
const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));
const fn = (m, k) => !!(CL && CL[m] && typeof CL[m][k] === 'function');
if (CL) {
  const { NL, UT, SM, WN, LB, SU, SET, SS, DAL, AID, UTR, IW, OCR, BNP } = CL;
  // need-line: the door makers DRIVEN (reader #4) — settingsDoor {section} opens the row's whole section; without, Settings searched
  // for the row's own words; integrationDoor with no id opens the window
  {
    const opened = [], ints = [];
    const app = { _settingsUI: { open: (o) => opened.push(o) }, openIntegration: (id) => ints.push(id) };
    const sd = NL.settingsDoor(app, 'spend.unattendedPerIdentityDay', { section: true }), ss = NL.settingsDoor(app, 'browser.maxRunning'), sx = NL.settingsDoor(app, 'no.such.row'), it0 = NL.integrationDoor(app, null), it1 = NL.integrationDoor(app, 'llm');
    for (const d of [sd, ss, it0, it1]) if (d && typeof d.run === 'function') d.run();
    const cat = SS.SETTINGS_SCHEMA['spend.unattendedPerIdentityDay'].category, lab = SS.SETTINGS_SCHEMA['browser.maxRunning'].label;
    ok(sd && ss && sx === null && JSON.stringify(opened) === JSON.stringify([{ category: String(cat) }, { search: String(lab) }]) && JSON.stringify(ints) === '[null,"llm"]' && sd.door === 'settings:spend.unattendedPerIdentityDay',
      'need-line (reader #4): settingsDoor { section } opens the row\'s whole Settings section, plain it searches the row\'s own words, an unknown row draws no door; integrationDoor with no id opens the window', { opened, ints });
    ok(!('needLineHtml' in NL) && !('bindNeedDoors' in NL) && !/needLineHtml|bindNeedDoors/.test(fs.readFileSync(path.join(REPO, 'src/lib/need-line.js'), 'utf8')), 'reader #16: need-line.js has no string twin (needLineHtml / bindNeedDoors — no surface used them; a listener bound with no signal)');
  }
  // reader #0: copyText SAYS whether it copied — the clipboard API, else the textarea fallback's own answer (execCommand)
  {
    const nav = globalThis.navigator;
    const run = async (clip, exec) => { nav.clipboard = clip; EXEC_COPY = exec; return UT.copyText('k'); };
    const got = [await run({ writeText: async () => {} }, false), await run({ writeText: async () => { throw new Error('denied'); } }, true), await run({ writeText: async () => { throw new Error('denied'); } }, false), await run(null, false), await run(null, true)];
    ok(JSON.stringify(got) === '[true,true,false,false,true]', 'reader #0: copyText resolves true / false — the clipboard took it; refused but the fallback copied; refused and the fallback too; no clipboard API and the fallback refused; no API, the fallback copied (r.399: always undefined)', got);
  }
  // machines-1: the ssh error's cause in words (reader #4) and the public-key door's every answer (reader #0 / #8)
  {
    const W = typeof SM.hostErrorWords === 'function' ? SM.hostErrorWords : null;
    const w = (raw) => (W ? W(raw, 'ubuntu@gpu-01') : null);
    const a = w('ubuntu@gpu-01: Permission denied (publickey).'), b = w('ssh: connect to host gpu-01 port 22: Connection refused'), c = w('ssh: connect to host gpu-01 port 22: Connection timed out'), d = w('ssh: Could not resolve hostname gpu-01'), e = w('Host key verification failed.'), f = w('weird');
    ok(a && a.refused && a.words === 'Can’t sign in to ubuntu@gpu-01: it refused the key.' && b && !b.refused && /connection was refused/.test(b.words) && /no answer/.test(c.words) && /name was not found/.test(d.words) && /host key changed/.test(e.words) && f.words === 'Can’t reach ubuntu@gpu-01.',
      'machines-1 (reader #4): an ssh machine\'s error, CLASSIFIED — refused the key (its door: the public key to add) / connection refused / no answer / name not found / host key changed / the rest', { a, b, c, d, e, f });
    class FakeSidebar {}
    SM.installSidebarMounts(FakeSidebar);
    const sb = new FakeSidebar();
    const opened = [];
    sb._hostsData = { key: { exists: false }, hosts: [] };
    sb._showAddHostDialog = (hd, from) => opened.push([hd, from]);
    const nav = globalThis.navigator;
    const press = async (answer, clip = { writeText: async (x) => { clip.got = x; } }, exec = false) => {
      FETCH = answer instanceof Error ? async () => { throw answer; } : async () => ({ ok: answer.status === 200, status: answer.status, json: async () => answer.body });
      nav.clipboard = clip; EXEC_COPY = exec;
      const row = DOC.createElement('div'); DOC.body.appendChild(row);
      const more = DOC.createElement('details'); row.appendChild(more);
      const place = (n) => { for (const o of row.querySelectorAll('.mounts-key-shown')) o.remove(); row.insertBefore(n, more); };
      if (typeof sb._publicKeyDoor !== 'function') return { missing: true };
      await sb._publicKeyDoor({ id: 'h1', name: 'gpu-01', user: 'ubuntu', host: 'gpu-01' }, 'ubuntu@gpu-01', place);
      const shown = row.querySelector('.mounts-key-shown');
      row.remove();
      return { shown, clip, code: shown ? shown.dataset.code : null, words: shown ? (shown.querySelector('.need-words') || shown).textContent : '', field: shown ? shown.querySelector('textarea') : null, doors: shown ? shown.querySelectorAll('button').filter((b) => b.dataset.door !== 'dismiss') : [] };
    };
    const KEY = 'ssh-ed25519 AAAAC3fake needs-doors';
    const okKey = { status: 200, body: { ok: true, keys: [{ publicKey: KEY, source: 'file' }] } };
    const r1 = await press(okKey);
    const r2 = await press(okKey, { writeText: async () => { throw new Error('denied'); } }, false);
    ok(!r1.missing && !r1.shown && r1.clip.got === KEY && r2.shown && r2.code === 'copy_refused' && r2.field && r2.field.value === KEY && r2.field.readOnly === true && /select the key in this field/.test(r2.words) && r2.shown.querySelector('textarea') === r2.field,
      'machines-1 (reader #0): «Copy the public key to add» — copied, it says so; a clipboard that REFUSED shows the key itself in a read-only field on the row, the words pointing at THAT field (r.399: «Copied» either way)', { r1: r1.missing ? 'no _publicKeyDoor' : { shown: !!r1.shown, got: r1.clip.got }, r2: { code: r2.code, words: r2.words, value: r2.field && r2.field.value } });
    const r3 = await press({ status: 404, body: { ok: false, code: 'no_key' } });
    const before3 = opened.length;
    if (r3.doors && r3.doors[0]) r3.doors[0].click();
    const r4 = await press({ status: 404, body: { ok: false, code: 'not_ssh' } });
    const r5 = await press({ status: 403, body: { error: 'x', code: 'human_only' } });
    const r6 = await press(new Error('offline'));
    ok(r3.code === 'no_key' && /^No public key to show/.test(r3.words) && r3.doors.length === 1 && r3.doors[0].dataset.door === 'key-setup' && r3.doors[0].textContent === 'Add it again with a key…' && opened.length === before3 + 1
      && r4.code === 'not_ssh' && /dials in/.test(r4.words) && r4.doors.length === 0 && r5.code === 'human_only' && /shown only to you/.test(r5.words) && r6.code === 'network' && /Could not reach VibeSpace/.test(r6.words),
      'machines-1 (reader #8): a key that cannot be shown says WHY by its code — no key (and «Add it again with a key…»: Add machine\'s create / paste a key) / a dial machine / refused / the hub not reached (r.399: one «no key» toast for all)', { r3: [r3.code, r3.words], r4: [r4.code, r4.words], r5: [r5.code, r5.words], r6: [r6.code, r6.words] });
    // verifier #3: «Add it again with a key…» does what its words say for THIS machine — the door hands the machine to the form; the form
    // is filled from it (name, user, address, port), SAYS it replaces it, and its submit names the record it replaces; the plain
    // «Add machine» is blank and replaces nothing
    const handed = opened.length ? opened[opened.length - 1][1] : null;
    const seen = [];
    const sb3 = new FakeSidebar();
    sb3._hostsData = { key: { exists: true, path: '/k' }, hosts: [] };
    sb3._mountsDialog = (title, fields, submit, onSubmit, opts) => { seen.push({ title, fields, submit, onSubmit, opts }); return {}; };
    sb3._renderMounts = () => {};
    const H3 = { id: 'h1', name: 'gpu-01', user: 'ubuntu', host: 'gpu-01.example', port: 2222 };
    FakeSidebar.prototype._showAddHostDialog.call(sb3, sb3._hostsData, H3);
    FakeSidebar.prototype._showAddHostDialog.call(sb3, sb3._hostsData);
    const [dA, dP] = seen;
    const val = (d, k) => (d && (d.fields.find((x) => x.key === k) || {}).value) || '';
    const note = dA ? dA.fields.filter((x) => x.type === 'note').map((x) => x.value).join(' ') : '';
    const posts = [];
    FETCH = async (url, o) => { posts.push([String(url), o && o.body ? JSON.parse(o.body) : null]); return { ok: true, status: 200, json: async () => (String(url) === '/api/hosts' ? { success: true, id: 'h2' } : { ok: true }) }; };
    if (dA) await dA.onSubmit({ name: val(dA, 'name'), user: val(dA, 'user'), host: val(dA, 'host'), port: val(dA, 'port'), keyChoice: 'default' }, { close() {}, err: { isConnected: true } }).catch(() => {});
    const sent = (posts.find(([u]) => u === '/api/hosts') || [])[1];
    ok(handed && handed.id === 'h1' && dA && ['name', 'user', 'host', 'port'].map((k) => val(dA, k)).join('|') === 'gpu-01|ubuntu|gpu-01.example|2222' && /replaces “gpu-01”/.test(note) && /replace/i.test(dA.submit)
      && sent && sent.replaces === 'h1' && sent.name === 'gpu-01' && sent.port === '2222' && dP && ['name', 'user', 'host'].every((k) => !val(dP, k)) && !dP.fields.some((x) => x.type === 'note') && val(dP, 'port') === '22',
      'machines-1 (verifier #3): «Add it again with a key…» opens THIS machine\'s form — filled from it (name, user, address, port), saying it REPLACES it, its submit naming the record it replaces; the plain Add machine stays blank (r.dcd495a1f: a blank form, the refusing row kept)', { handed: handed && handed.id, fields: dA && dA.fields.map((x) => [x.key, x.value]), submit: dA && dA.submit, sent });
    FETCH = async () => { throw new Error('no fetch in this leg'); };
  }
  // machines-1 (verifier #2): the public-key door's answer is the PANEL's, per machine — a Machines re-render (the hosts-updated /
  // mounts-updated broadcast) puts it back on the machine's row; its «Dismiss» ends it, as do the machine's removal and a re-test that passes
  {
    class Sb2 {}
    SM.installSidebarMounts(Sb2);
    const sb2 = new Sb2();
    let onGlobal = null;
    sb2.app = { ws: { onGlobal: (f) => { onGlobal = f; } } };
    sb2.listEl = DOC.createElement('div'); DOC.body.appendChild(sb2.listEl);
    sb2._activeTab = 'mounts';
    const H1 = { id: 'h1', name: 'gpu-01', user: 'ubuntu', host: 'gpu-01', port: 22, keyPath: '/k', keySource: 'app' };
    let hostsNow = [H1];
    const failing = () => ({ ok: false, error: 'ubuntu@gpu-01: Permission denied (publickey).', at: Date.now() });
    sb2._hostStatus = { h1: failing() };
    const KEY2 = 'ssh-ed25519 AAAAC3fake needs-doors-2';
    FETCH = async (url) => {
      const u = String(url);
      const body = u === '/api/mounts' ? { mounts: [], shares: [], rcloneAvailable: true } : u === '/api/hosts' ? { hosts: hostsNow, key: { exists: true } } : u === '/api/mount-tokens' ? { tokens: [] } : u === '/api/machine-mounts' ? { mounts: [] } : /\/public-key$/.test(u) ? { ok: true, keys: [{ publicKey: KEY2, source: 'file' }] } : {};
      return { ok: true, status: 200, json: async () => body };
    };
    globalThis.navigator.clipboard = { writeText: async () => { throw new Error('denied'); } }; EXEC_COPY = false;
    const rowOf = () => sb2.listEl.querySelectorAll('.mounts-row').find((r) => r._hostId === 'h1') || null;
    const answerOf = () => { const r = rowOf(); const a = r && r.querySelector('.mounts-key-shown'); return a ? `${a.dataset.code}:${(a.querySelector('textarea') || {}).value || ''}` : null; };
    const doorOf = (root, name) => (root ? root.querySelectorAll('.need-door').find((b) => b.dataset.door === name) || null : null);
    const ask = async () => { const d = doorOf(rowOf(), 'public-key'); if (d) d.click(); await tick(10); };
    const render = async (ev) => { if (ev && onGlobal) onGlobal({ type: ev }); else await sb2._renderMounts(); await tick(10); };
    let err2 = null;
    const seen2 = {};
    try {
      await render();
      await ask(); seen2.answered = answerOf();
      await render('hosts-updated'); seen2.hostsUpdated = answerOf();
      await render('mounts-updated'); seen2.mountsUpdated = answerOf();
      const dis = doorOf(rowOf() && rowOf().querySelector('.mounts-key-shown'), 'dismiss');
      if (dis) dis.click();
      seen2.dismissed = answerOf(); await render(); seen2.dismissedRerender = answerOf();
      await ask(); sb2._hostStatus.h1 = { ok: true, latencyMs: 5, at: Date.now() }; await render(); sb2._hostStatus.h1 = failing(); await render(); seen2.afterPass = answerOf();
      await ask(); hostsNow = []; await render(); hostsNow = [H1]; await render(); seen2.afterRemove = answerOf();
    } catch (e) { err2 = String((e && e.stack) || e).slice(0, 400); }
    sb2.listEl.remove();
    ok(!err2 && seen2.answered === 'copy_refused:' + KEY2 && seen2.hostsUpdated === seen2.answered && seen2.mountsUpdated === seen2.answered && seen2.dismissed === null && seen2.dismissedRerender === null && seen2.afterPass === null && seen2.afterRemove === null,
      'machines-1 (verifier #2): the public-key door\'s answer (here the key in its field) survives a Machines re-render — the hosts-updated and mounts-updated broadcasts put it back on the machine\'s row; its «Dismiss» ends it, and so do a re-test that passes and the machine\'s removal (r.dcd495a1f: gone at the next render)', { err2, seen2 });
    FETCH = async () => { throw new Error('no fetch in this leg'); };
  }
  // for-you-2: the For-you window's door DRAWN and PRESSED (reader #4), the tray row's closer and its door (reader #4 / #10)
  {
    const it = { id: 'h1', status: 'open', sessionKey: 'claude:x', text: 'A helper needs your approval to use Bash', createdAt: Date.now(), action: { type: 'helper-ask', requestId: 'r1' } };
    const jumps = [];
    const model = { jump: (k, x) => jumps.push([k, x.id]) };
    const el = DOC.createElement('div');
    const v = { reply: { show: false, enabled: false, code: 'card_item', why: 'Answered on the conversation’s card — open the conversation to answer it' } };
    if (fn('IW', 'paintWhy')) IW.paintWhy(el, v.reply.why, v, it, model);
    const btn = el.querySelector('.need-door');
    if (btn) btn.click();
    const el2 = DOC.createElement('div');
    if (fn('IW', 'paintWhy')) IW.paintWhy(el2, 'Background Work item — answer it in the job panel', { reply: { show: false, enabled: false, code: 'job_item', why: 'x' } }, it, model);
    ok(fn('IW', 'paintWhy') && btn && btn.dataset.door === 'jump' && btn.textContent === 'Open the conversation and answer' && /^Answered on the conversation’s card/.test(el.textContent) && JSON.stringify(jumps) === '[["claude:x","h1"]]' && !el2.querySelector('.need-door') && el2.textContent === 'Background Work item — answer it in the job panel',
      'for-you-2 (reader #4): the For-you pane\'s note on a parked ask carries «Open the conversation and answer» — PRESSED, it jumps to the conversation; another note draws no door', { jumps, text: el.textContent });
    const ctx = { t: (x, p) => (p ? x.replace(/\{(\w+)\}/g, (m, k) => (p[k] !== undefined ? String(p[k]) : m)) : x), wordsOf: (i) => i.text, detailOf: () => '', nameFor: () => 'Session 1', replyState: () => ({ show: false }) };
    const FA = require(path.join(REPO, 'src/foryou-actions.js'));
    const pointer = (FA.POINTER_ROWS || []).find((x) => !(FA.PARKED_ASK_TYPES || []).includes(x));
    const html = (item) => UTR.renderRow({ item, band: 2 }, ctx).innerHTML;
    const hp = html(it), hm = html({ ...it, id: 'm1', action: { type: 'main-ask', requestId: 'r2' } }), ho = pointer ? html({ ...it, id: 'p1', text: 'A pointer', action: { type: pointer, requestId: 'r3' } }) : '';
    const attr = (h, cls, a) => { const m = new RegExp(`<button[^>]*class="${cls}[^"]*"[^>]*\\b${a}="([^"]*)"`).exec(h); return m ? m[1] : null; };
    ok(attr(hp, 'ut-act ut-dismiss ut-hide', 'data-label') === 'Stop reminding (the conversation stays paused)' && attr(hm, 'ut-act ut-dismiss ut-hide', 'data-label') === 'Stop reminding (the conversation stays paused)' && (!pointer || attr(ho, 'ut-act ut-dismiss ut-hide', 'data-label') === 'Hide'),
      'for-you-2 (reader #4): the tray row of a parked ask, DRAWN — its one closer says «Stop reminding (the conversation stays paused)»; another pointer\'s says «Hide»', { parked: attr(hp, 'ut-act ut-dismiss ut-hide', 'data-label'), pointer, other: attr(ho, 'ut-act ut-dismiss ut-hide', 'data-label') });
    ok(attr(hp, 'ut-go', 'data-label') === 'Open the conversation and answer' && attr(hp, 'ut-go', 'aria-label') === 'Open the conversation and answer' && /class="ut-go ut-go-answer"/.test(hp) && (!pointer || attr(ho, 'ut-go', 'data-label') === 'Chat'),
      'reader #10: the tray and the phone sheet draw the parked ask\'s door — the row\'s trailing door (its press is the jump to the conversation) says «Open the conversation and answer»; another row\'s says «Chat»', { parked: attr(hp, 'ut-go', 'data-label'), other: attr(ho, 'ut-go', 'data-label') });
    const CSS = fs.readFileSync(path.join(REPO, 'public/style.css'), 'utf8');
    ok(/\.ut-go\.ut-go-answer::after \{ white-space: normal;/.test(CSS) && /:has\(> \.ut-go-answer\) > :is\(\.ut-text, \.ut-meta\) \{ margin-right: 104px; \}/.test(CSS), 'reader #10: the longer door wraps inside itself on the phone (never cut), and the row\'s words keep clear of it');
  }
  // browser-live-1: the loop banner's doors — which views draw them and WHICH TAB they act on (reader #2 / #4)
  {
    const rows = [{ targetId: T32('A'), active: true, title: 'Mail' }, { targetId: T32('B'), active: false, title: 'Bank' }];
    const loop = { urls: ['https://bank.example/a', 'https://bank.example/b'], hops: 14, sinceMs: 9000, targetId: T32('B') };
    const rowOf = fn('LB', 'loopTabRowOf') ? LB.loopTabRowOf : () => null, shown = fn('LB', 'loopDoorsShown') ? LB.loopDoorsShown : () => ({});
    const r = rowOf(rows, loop), gone = rowOf(rows.slice(0, 1), loop), none = rowOf(rows, { ...loop, targetId: undefined });
    ok(r === rows[1] && gone === null && none === null, 'reader #2: the banner\'s doors act on the LOOPING tab\'s row (the fact\'s target id) — never the active tab; a looping tab that is not listed (or a fact naming none) gives no row', { r, gone, none });
    const sv = shown({ row: r }), sd = shown({ row: r, driving: true }), sh = shown({ row: r, human: true }), sn = shown({ row: null, driving: true });
    ok(JSON.stringify([sv, sd, sh, sn]) === JSON.stringify([{ stop: true, close: false }, { stop: true, close: true }, { stop: false, close: true }, { stop: false, close: false }]),
      'reader #2 / #4: the show flags — a conversation\'s view may stop; a close only while driving or in the person\'s own window; no looping row ⇒ no door at all', [sv, sd, sh, sn]);
    const acts = [];
    const bn = LB.createLoopBanner(DOC, { stop: () => acts.push(['stop', rowOf(rows, loop)]), close: () => acts.push(['close', rowOf(rows, loop)]) });
    bn.render(loop, null, sv);
    const s1 = bn.parts.stop && bn.parts.stop.style.display === '' && bn.parts.close.style.display === 'none' && bn.parts.stop.textContent === 'Stop loading';
    if (bn.parts.stop) bn.parts.stop.click();
    bn.render(loop, null, sn);
    ok(s1 && acts.length === 1 && acts[0][0] === 'stop' && acts[0][1] === rows[1] && bn.parts.doors.style.display === 'none' && /may propose clearing the site’s stored login/.test(bn.parts.hint.textContent),
      'browser-live-1: the loop banner draws its ways out as DOORS on its line — «Stop loading» pressed stops the LOOPING tab; with no looping row no door is drawn', acts.map((x) => [x[0], x[1] && x[1].title]));
  }
  // window-manager-1: move mode, DRIVEN (reader #4 / #12) — Esc and «Cancel» put the window AND its preview rect back, every listener leaves
  {
    const wm = Object.create(WN.WindowManager.prototype);
    const el = DOC.createElement('div'); el.style.cssText = 'left: 100px; top: 50px; width: 400px; height: 300px; z-index: 7';
    DOC.body.appendChild(el);
    const win = { id: 'w1', element: el, isMaximized: false, isMinimized: false, _isSnapped: false, onResize() {} };
    Object.assign(wm, { windows: new Map([['w1', win]]), zIndex: 50, workspace: { offsetWidth: 1600, offsetHeight: 1000, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1600, height: 1000 }) }, focusWindow() {}, witnessGeometry() {}, _captureGridBounds() {}, _notify() {}, restore() {} });
    PREVIEW = DOC.createElement('div'); PREVIEW.style.cssText = 'left: 10%; top: 5%';
    const fire = (type, init = {}) => DOC.dispatchEvent({ type, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {}, ...init });
    const listening = () => ['mousemove', 'mousedown', 'keydown'].map((x) => DOC.listening(x)).join(',');
    const overlayUp = () => DOC.body.children.some((c) => c.querySelector && c.querySelector('.move-mode-hint'));
    let witnessed = 0;
    wm.witnessGeometry = () => { witnessed++; };
    const run = async (end) => {
      witnessed = 0;
      wm.startMoveMode('w1');
      const hint = DOC.body.querySelector('.move-mode-hint'), cancel = hint ? hint.querySelector('.move-mode-cancel') : null;
      fire('mousemove', { clientX: 900, clientY: 700 });
      await tick(8);
      const moved = { left: el.style.left, preview: PREVIEW.style.left };
      if (end === 'esc') fire('keydown', { key: 'Escape' });
      // verifier #0: a REAL press on «Cancel» — its mousedown reaches the document's CAPTURE listener first (the drop's), then the click
      // comes only to a button still on the page (a mousedown that dropped the window took the hint, and the click never comes)
      let mid = null;
      if (end === 'cancel') { fire('mousedown', { target: cancel || el }); mid = { listening: listening(), overlay: overlayUp(), witnessed }; if (cancel && cancel.isConnected) cancel.click(); }
      if (end === 'drop') fire('mousedown', { target: DOC.body });
      return { moved, mid, cancel: cancel ? cancel.textContent : null, left: el.style.left, top: el.style.top, z: el.style.zIndex, preview: PREVIEW.style.left, listening: listening(), overlay: overlayUp(), witnessed };
    };
    const esc = await run('esc');
    const can = await run('cancel');
    const drop = await run('drop');
    ok(esc.moved.left !== '100px' && esc.moved.preview !== '10%' && esc.left === '100px' && esc.top === '50px' && esc.z === '7' && esc.preview === '10%' && esc.listening === '0,0,0' && !esc.overlay,
      'window-manager-1 (reader #4 / #12): move mode, Esc — the window back EXACTLY where it was, its desktop-preview rect too (processMove moved both live), the overlay gone, every listener removed', esc);
    ok(can.cancel === 'Cancel' && can.left === '100px' && can.preview === '10%' && can.listening === '0,0,0' && !can.overlay,
      'reader #12: the hint carries «Cancel» — a button every input can press (a touch tablet has no Esc); its press does what Esc does, never a drop', can);
    ok(drop.left !== '100px' && drop.listening === '0,0,0' && !drop.overlay, 'window-manager-1 (reader #4): a click drops the window where it is and removes EVERY listener of the mode — the Esc one too', drop);
    ok(can.mid && can.mid.overlay && can.mid.listening === '1,1,1' && can.mid.witnessed === 0 && can.left === '100px' && can.top === '50px' && can.preview === '10%' && can.witnessed === 0 && can.listening === '0,0,0' && !can.overlay && drop.witnessed === 1,
      'window-manager-1 (verifier #0): a REAL press on «Cancel» — its mousedown through the document\'s capture listener is NO drop (the mode still on: the hint up, its three listeners, no placement recorded), the click that follows puts the window back in place; a press anywhere else is the drop', { can, dropWitnessed: drop.witnessed });
    const CSS = fs.readFileSync(path.join(REPO, 'public/style.css'), 'utf8');
    const hintCss = (/\.move-mode-hint \{[^}]*\}/.exec(CSS) || [''])[0];
    ok(/box-shadow: var\(--shadow-window\)/.test(hintCss) && !/rgba\(/.test(hintCss) && /\.move-mode-hint > \.move-mode-cancel \{ pointer-events: auto; \}/.test(CSS), 'reader #12: the hint\'s shadow is the theme\'s (--shadow-window, no literal colour); its Cancel takes the pointer (the hint itself lets it through)', hintCss);
    PREVIEW = null; el.remove();
  }
  // desktop-apps-27: «Choose another file…» DRAWN and PRESSED (reader #4); the words without facts are whole (reader #9)
  {
    let repicks = 0;
    const mk = (code, o = {}) => (fn('DAL', 'debRefusalLine') ? DAL.debRefusalLine({ code }, { debPath: '/home/u/app.deb', machine: 'gpu-01', repick: () => { repicks++; }, ...o }) : null);
    const l1 = mk('file_missing'), l2 = mk('file_unreadable'), l3 = mk('not_found'), l4 = mk('file_missing', { debPath: '' });
    const b1 = l1 && l1.querySelector('.need-door');
    if (b1) b1.click();
    ok(l1 && b1 && b1.dataset.door === 'deb-repick' && b1.textContent === 'Choose another file…' && repicks === 1 && /^This file is not on gpu-01: \/home\/u\/app\.deb/.test(l1.textContent) && l2 && /cannot be read on gpu-01/.test(l2.textContent) && l3 === null && l4 === null,
      'desktop-apps-27 (reader #4): a .deb file that is not there DRAWS «Choose another file…» on its line — pressed, the path form reopens; any other refusal draws none', { l1: l1 && l1.textContent, repicks });
    const w = [AID.appRefusalText('file_missing'), AID.appRefusalText('file_unreadable'), AID.appRefusalText('file_missing', { path: '/a.deb' }), AID.appRefusalText('file_missing', { machine: 'gpu-01', path: '/a.deb' })];
    ok(w[0] === 'The .deb file is not there any more.' && w[1] === 'The .deb file cannot be read.' && w[2] === w[0] && w[3] === 'This file is not on gpu-01: /a.deb' && w.every((x) => !/ on : |: $| on \{|\{path\}/.test(x)),
      'reader #9: appRefusalText(file_missing | file_unreadable) with no path / machine is a WHOLE sentence (r.399 picks: «在上找不到这个文件：»)', w);
  }
  // settings-13: «Takes effect after a reload» against the value this PAGE LOADED with, re-judged on the store's change event (reader #4 / #13)
  {
    const path13 = Object.keys(SS.SETTINGS_SCHEMA).find((p) => { const r = SS.SETTINGS_SCHEMA[p]; return r && !r.liveApply && r.type === 'boolean' && !r.store; });
    const sch = SS.SETTINGS_SCHEMA[path13];
    const loadWith = async (vals) => { FETCH = async () => ({ ok: true, status: 200, json: async () => ({ ...vals }) }); const m = new SET.SettingsManager(); await m.load(); FETCH = async () => ({ ok: true, status: 200, json: async () => ({}) }); return m; };
    const line = (m) => { if (!fn('SU', 'SettingsUI') || typeof SU.SettingsUI.prototype._reloadLine !== 'function') return null; const ui = Object.create(SU.SettingsUI.prototype); ui.settings = m; ui.app = {}; const l = ui._reloadLine(path13, sch); if (l) DOC.body.appendChild(l); return l; };
    const m = await loadWith({});
    const l = line(m);
    const shown = () => (l ? l.style.display !== 'none' : null);
    const s0 = shown();
    m.set(path13, !sch.default); const s1 = shown();
    m.set(path13, sch.default); const s2 = shown();
    const m3 = await loadWith({});
    const l3 = line(m3);
    m3.applyRemote({ [path13]: !sch.default });   // another client's change, by the broadcast
    const s3 = l3 ? l3.style.display !== 'none' : null;
    if (l3) l3.remove();
    const door = l && l.querySelector('.need-door');
    if (door) door.click();
    const m2 = await loadWith({});
    m2.set(path13, !sch.default);   // changed EARLIER in the page's life (a quick menu, another window) — before Settings is first drawn
    const l2 = line(m2);
    ok(path13 && l && JSON.stringify([s0, s1, s2, s3]) === '[false,true,false,true]' && door && door.textContent === 'Reload now' && RELOADS === 1 && l2 && l2.style.display !== 'none',
      `settings-13 (reader #4 / #13): a row that takes effect at the next load (${path13}) shows «Takes effect after a reload» + «Reload now» once its value differs from the one this PAGE LOADED with — re-judged on the store's change (this page, another client's broadcast); a value moved before Settings was first drawn shows it too`, { s: [s0, s1, s2, s3], l2: l2 && l2.style.display, reloads: RELOADS });
    if (l) l.remove();
    if (l2) l2.remove();
    FETCH = async () => { throw new Error('no fetch in this leg'); };
  }
  // settings-13 (verifier #1): the reload lines' store listeners leave with the surface that bound them — a Settings window opened on
  // the row, drawn again twice (a re-render, a search keystroke) and closed: ONE listener for the row while it is drawn, NONE after the close
  {
    const path1 = Object.keys(SS.SETTINGS_SCHEMA).find((p) => { const r = SS.SETTINGS_SCHEMA[p]; return r && !r.liveApply && r.type === 'boolean' && !r.store; });
    FETCH = async () => ({ ok: true, status: 200, json: async () => ({}) });
    const m = new SET.SettingsManager(); await m.load();
    const wins = new Map();
    let win = null;
    const app = { settings: m, isMobile: false, wm: { windows: wins, revealWindow() {}, createWindow: (o) => { win = { id: 'settings-1', type: o.type, content: DOC.createElement('div'), onClose: null }; wins.set(win.id, win); DOC.body.appendChild(win.content); return win; } } };
    const counts = [];
    let err1 = null, drawn = false;
    const count = () => (m._listeners && m._listeners[path1] ? m._listeners[path1].size : 0);
    try {
      const ui = new SU.SettingsUI(app);
      const label = String(SS.SETTINGS_SCHEMA[path1].label);
      ui.open({ search: label }); counts.push(count());
      drawn = !!win.content.querySelector('.settings-reload-need');
      const content = win.content.querySelector('.settings-content'), nav = win.content.querySelector('.settings-nav');
      ui._renderContent(content, nav); counts.push(count());
      const inp = win.content.querySelector('.settings-search');
      inp.value = label; inp.oninput(); counts.push(count());
      if (typeof win.onClose === 'function') win.onClose();
      win.content.remove();
      counts.push(count());
    } catch (e) { err1 = String((e && e.stack) || e).slice(0, 400); }
    ok(!err1 && drawn && JSON.stringify(counts) === '[1,1,1,0]',
      `settings-13 (verifier #1): the reload line's store listener (${path1}) leaves with the surface that bound it — one while the row is drawn (open, a re-render, a search keystroke), none after the window closes (r.dcd495a1f: one more per render, kept after the close)`, { err1, drawn, counts });
    FETCH = async () => { throw new Error('no fetch in this leg'); };
  }
  // plugins-integrations-13: the https why's door, DRAWN (reader #4 / #14) — on the default «auto» the line also says what is missing
  {
    const drawn = (mode) => {
      const opened = [];
      const app = { settings: { get: (k) => (k === 'server.https' ? mode : undefined) }, _settingsUI: { open: (o) => opened.push(o) } };
      const box = DOC.createElement('div');
      OCR.renderConnectRow(box, { label: 'Connect', words: {}, whys: { 'self-hosted': 'Connecting needs an https address: turn on Tailscale HTTPS, or paste a Dropline key' } }, { connectWhy: 'self-hosted', account: {} }, () => {}, { app });
      const w = box.querySelector('.oauth-connect-words'), b = w && w.querySelector('.need-door');
      if (b) b.click();
      return { text: w ? w.textContent : '', door: b ? b.textContent : null, opened };
    };
    const au = drawn('auto'), of = drawn('off');
    ok(/HTTPS Certificates for your tailnet in the Tailscale admin console/.test(au.text) && au.door === 'Use my own certificate files…' && au.opened.length === 1 && au.opened[0].search === SS.SETTINGS_SCHEMA['server.https'].label
      && !/Tailscale admin console/.test(of.text) && of.door === 'Turn on HTTPS…' && of.opened.length === 1,
      'plugins-integrations-13 (reader #4 / #14): «Connecting needs an https address» — on the default «auto» the line also says what is missing (the tailnet\'s HTTPS certificates, on Tailscale\'s side) and its door is the row for «My own certificate files»; with https off, «Turn on HTTPS…»', { au, of });
    const VT = fs.readFileSync(path.join(REPO, 'src/lib/voice-teach-ui.js'), 'utf8'), IWS = fs.readFileSync(path.join(REPO, 'src/lib/integrations-window.js'), 'utf8'), PU = fs.readFileSync(path.join(REPO, 'src/lib/plugins-ui.js'), 'utf8');
    ok(/renderConnectRow\(box, DROPLINE_CONNECT, st, rerender, \{ app \}\)/.test(VT) && /renderConnectRow\(box, v\.connect, st, \(\) => refresh\(v\.id\), \{ app \}\)/.test(IWS) && /renderVoiceSheet\([\s\S]{0,120}app: this \}\)/.test(PU) && !/t\('[^']*Services › Integrations/.test(VT + PU),
      'plugins-integrations-13: both surfaces hand the app to the Connect block (its door is drawn on the voice sheet AND the Integrations card); no wrong menu path in the key link or the chip\'s title');
  }
  // browser-profiles-4: the browser list's needs said ONCE, each with its door's target — the chosen cloud browser's own card
  {
    const rows = [{ id: 'chromium', control: { ok: true } }, { id: 'cloud:browserbase', control: { ok: true } }, { id: 'cloud:kernel', control: { ok: true } }, { id: 'local-window', control: { ok: false, code: 'provider_needs_consent' } }];
    const ch = typeof BNP.providerChoices === 'function' ? BNP.providerChoices({ providers: rows }) : [];
    const needs = typeof BNP.providerNeedsOf === 'function' ? BNP.providerNeedsOf(ch, { chosen: 'cloud:kernel' }) : [];
    const none = typeof BNP.providerNeedsOf === 'function' ? BNP.providerNeedsOf(BNP.providerChoices({ providers: rows.slice(0, 1) })) : null;
    ok(needs.length === 2 && needs[0].need === 'key' && needs[0].integration === 'cloud:kernel' && needs[1].setting === 'window.realDesktopTargets'
      && ch.filter((c) => c.need === 'key').every((c) => !/⚙|→|Integrations/.test(c.note)) && Array.isArray(none) && none.length === 0,
      'browser-profiles-4: the cloud rows no longer say «(⚙ → Integrations)» each — ONE line under the list, its door the chosen cloud browser\'s card; the desktop window\'s consent its switch; nothing when nothing needs it', { needs, notes: ch.map((c) => c.note) });
  }
  // usage-16: on with no key ⇒ the chip is the door to the key's card; a DOOR chip's words wrap in the narrow rail (reader #6)
  {
    const PU = fs.readFileSync(path.join(REPO, 'src/lib/plugins-ui.js'), 'utf8'), CSS = fs.readFileSync(path.join(REPO, 'public/style.css'), 'utf8');
    ok(/t\('Add the API key…'\)/.test(PU) && /if \(p\.enabled && !p\.configured && !stopW\) onChip = \(\) => this\.openIntegration\?\.\(p\.integration \|\| 'llm'\)/.test(PU),
      'usage-16: the LLM plugin on with no key — its chip says «Add the API key…» and opens the key\'s card');
    const rule = (/\nbutton\.plugin-chip-primary \{[^}]*\}/.exec(CSS) || [''])[0];
    ok(/white-space: normal/.test(rule) && /text-overflow: clip/.test(rule) && CSS.lastIndexOf(rule) > CSS.indexOf('.plugin-chip { max-width: 100%'),
      'usage-16 (reader #6): a primary chip is a DOOR — its words wrap in the narrow rail, never ellipsized («填写 API ...» at 1440)', rule);
  }
}
globalThis.fetch = realFetch;

console.log('⑥ THE NEED-WORD NET (reader #5: a sentence that says something failed / is needed / is off / is not set / is missing)');
{
  const UI = TABLES.find((x) => x.scope === 'ui').T;
  // THE FROZEN DEBT (scripts/fixtures/need-debt.json — out of src, where its sentences would read as surfaces to other censuses)
  const DEBT_FILE = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/need-debt.json'), 'utf8'));
  const DEBT = Array.isArray(DEBT_FILE.list) ? DEBT_FILE.list : [];
  const SHAPES = (DEBT_FILE.shapes || []).map((x) => new RegExp(x));
  const needDebtOf = (s) => { const p = String(s).slice(0, 64); return DEBT.includes(p) ? p : SHAPES.find((r) => r.test(String(s))) || null; };
  const claimedBy = (s) => TABLES.some(({ T }) => T.needOf(s) || T.notNeedOf(s));
  const needNet = (ws) => {
    const out = { caught: 0, claimed: 0, debt: new Set(), fresh: [] };
    if (!UI.NET.need) return { ...out, fresh: [{ s: 'the ui table has no NEED net (NET.need)' }] };
    for (const [s, files] of ws) {
      if (!UI.NET.need.test(s)) continue;
      out.caught++;
      if (claimedBy(s)) { out.claimed++; continue; }
      const d = needDebtOf(s);
      if (d) { out.debt.add(String(d)); continue; }
      out.fresh.push({ s, files: [...files] });
    }
    return out;
  };
  const N = needNet(words);
  console.log(`  · the need net catches ${N.caught} sentence(s): ${N.claimed} claimed by a row / a non-need, ${N.debt.size} by the frozen debt (${DEBT.length} entries + ${SHAPES.length} shapes)`);
  ok(N.fresh.length === 0, `every sentence the need net catches is a row, a non-need with its reason, or an entry of the frozen NEED_DEBT — a NEW one is red by its words (${N.caught})`, N.fresh.slice(0, 12));
  const stale = DEBT.filter((p) => !N.debt.has(p)).concat(SHAPES.filter((r) => !N.debt.has(String(r))).map(String));
  ok(stale.length === 0, 'the NEED_DEBT is current — an entry whose sentence is gone or now claimed by a row is taken out (the list only shrinks)', stale.slice(0, 12));
  const NEED_DEBT_CEILING = 390;   // the list when the net landed (reader follow-up of picks 1–2) — it may only go DOWN
  ok(DEBT.length > 0 && DEBT.length <= NEED_DEBT_CEILING, `the NEED_DEBT never grows (${DEBT.length} ≤ ${NEED_DEBT_CEILING})`);
  // CONTROL: the reader's planted sentences (logs-reader/planted.log) — three need sentences the r.399 nets let through, and a direction
  const PLANTED = ['Sign-in failed — the token has expired.', 'This machine needs a key before it can connect.', 'Turn it on in the Advanced section of the settings window.', 'Enable it with the switch below.'];
  const pw = new Map(words); for (const s of PLANTED) pw.set(s, new Set(['src/lib/planted-needs.js']));
  const PN = needNet(pw), PC = census(pw).find((c) => c.scope === 'ui');
  const redNeed = PN.fresh.map((x) => x.s), redNet = PC ? PC.unclaimed.map((x) => x.s) : [];
  ok(PLANTED.slice(0, 3).every((s) => redNeed.includes(s)) && redNet.includes(PLANTED[3]) && PN.fresh.every((x) => PLANTED.includes(x.s)),
    'CONTROL: the reader\'s planted sentences go RED by name — «Sign-in failed…», «This machine needs a key…», «Turn it on in the Advanced section…» (the need net), «Enable it with the switch below.» (the direction net)', { redNeed, redNet: redNet.filter((s) => PLANTED.includes(s)) });
}

console.log('⑦ THE RELEASE FACTS (verifier #4 / #5)');
{
  // verifier #4: the ci.mjs row states this suite's cost truly — never less than what the suite WAITS on purpose (the FIFO read's bound)
  const CI = fs.readFileSync(path.join(REPO, 'scripts/ci.mjs'), 'utf8');
  const rowM = /\{ name: 'test-needs-doors', tier: 'fast', why: 'in-process · ([\d.]+) (ms|s)' \}/.exec(CI);
  const statedMs = rowM ? Number(rowM[1]) * (rowM[2] === 's' ? 1000 : 1) : null;
  ok(statedMs !== null && statedMs > FIFO_BOUND_MS, `verifier #4: scripts/ci.mjs's test-needs-doors row states a cost above the ${FIFO_BOUND_MS} ms this suite waits on purpose (the FIFO read's bound) — it states ${rowM ? rowM[1] + ' ' + rowM[2] : 'no time'}`, rowM && rowM[0]);
  // verifier #5: the user CHANGELOG's newest «Fixed» is what a user of the RELEASE notices — none of its bullets names a door the same
  // version ADDS (a defect of a door the release never had is the engineering log's); the three languages keep one bullet count
  const sectionOf = (file) => { const t = fs.readFileSync(path.join(REPO, file), 'utf8'); const top = t.split(/\n## /)[1] || ''; const fixed = (top.split(/\n### /).find((x) => /^(Fixed|修复|修正)\s/.test(x)) || ''); return { head: top.split('\n')[0], fixed: fixed.split('\n').filter((l) => l.startsWith('- ')) }; };
  const en = sectionOf('CHANGELOG.md'), zh = sectionOf('CHANGELOG.zh.md'), ja = sectionOf('CHANGELOG.ja.md');
  const ADDED_DOORS = ['Copy the public key to add', 'Stop loading', 'Close this tab', 'Reload now', 'Add the API key'];   // the doors picks 1–2 ADD (CHANGELOG «Added»)
  const named = en.fixed.filter((b) => ADDED_DOORS.some((d) => b.includes(d)));
  ok(/^2\.369\.\d+ — /.test(en.head) && en.fixed.length > 0 && named.length === 0 && zh.fixed.length === en.fixed.length && ja.fixed.length === en.fixed.length,
    `verifier #5: CHANGELOG ${en.head} «Fixed» says what a user of the release notices — no bullet names a door this version adds (${en.fixed.length} bullets, the same in zh / ja)`, { named, counts: [en.fixed.length, zh.fixed.length, ja.fixed.length] });
}

console.log('⑥ WINDOWS, DIALOGS AND MACHINE ROWS (lane ui-needs-a-button pick 3)');
{
  const { pathToFileURL } = await import('node:url');
  const src = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  const imp = (f) => import(pathToFileURL(path.join(REPO, f)).href);
  // machines-6: an offline device's state SHORT (the row draws the pairing sheet's door beside it; the whole sentence folded)
  const DA = await imp('src/lib/dial-address-picker.js');
  const short = typeof DA.dialStateShort === 'function' ? [DA.dialStateShort({ state: 'silent', at: Date.now(), host: 'h' }), DA.dialStateShort({ state: 'never', at: Date.now() }), DA.dialStateShort({ state: 'connected', at: Date.now() })] : [];
  const SM = src('src/lib/sidebar-mounts.js');
  ok(/^Offline since \S/.test(short[0] || '') && short[1] === 'Never connected' && short[2] === '' && /const shortOff = dialStateShort\(rs\);[\s\S]{0,300}doors: \[pairDoor\(this\.app, h, \{ kind: 'secondary' \}\)\][\s\S]{0,300}tx\.textContent = dialWords/.test(SM),
    'machines-6: an offline device says «Offline since …» / «Never connected» with «Show the pairing command…» on the row; what to check is folded under it', short);
  const NL = src('src/lib/need-line.js');
  ok(/export function pairDoor\(app, host = null/.test(NL) && /run: \(\) => sb\._showDevicePairDialog\(host \|\| null\)/.test(NL),
    'need-line: pairDoor opens THE pairing sheet (pair-dialog-polish\'s dialog, never changed) — that machine\'s, or a new pairing');
  ok(/doors: \[pairDoor\(this\.app, h, \{ kind: 'primary' \}\)/.test(SM) && /copy\.className = 'btn-cancel'; copy\.textContent = tr\('Copy'\)/.test(SM),
    'machines-29: «Show the pairing command…» is the primary of the elevate dialog; the PowerShell recipe\'s Copy the second way');
  ok(/if \(!h\.dialLive\) \{[\s\S]{0,200}dataset\.door = 'dial-reinstall'[\s\S]{0,200}this\._showGraduateDialog\(\{ \.\.\.h, graduated: false \}\)/.test(SM) && /rm\.className = h\.dialLive \? 'btn-create danger' : 'btn-cancel danger'/.test(SM),
    'machines-27: installed but not dialed in ⇒ «Reinstall…» (the install form again) is the primary, «Remove dial-out» a secondary danger');
  ok(/_offlineMountNeed\(h\) \{[\s\S]{0,400}rs\.state === 'connected'\) return;[\s\S]{0,200}ctx\.body\.prepend\(needLine/.test(SM) && /this\._offlineMountNeed\(h\); \/\/ lane ui-needs-a-button \(storage-5\)/.test(SM),
    'storage-5: a mount onto a dial machine that is not connected says so first, with its pairing sheet on the line (Mount stays live)');
  ok(/if \(e && e\.code === 'host-name-taken'\) e\.door = this\._hostRowDoor\(v\.name, close\)/.test(SM) && /e\.door && typeof e\.door\.run === 'function'\) err\.append\(' ', needDoorButton\(e\.door\)\)/.test(src('src/lib/mounts-dialog.js')),
    'machines-12: a name already taken (ui-language\'s code host-name-taken) carries «Open that machine» on the error line');
  // agents-accounts-6 / -8
  const MA = src('src/lib/manage-agents.js');
  ok(/needLine\(\{ words: t\('No machines yet — add an SSH machine or pair a device\.'\)[\s\S]{0,80}doors: \[addSsh, pairDoor\(this, null/.test(MA) && !/t\('No machines yet — add an SSH host or pair a device in the Remote tab\.'\)/.test(MA),
    'agents-accounts-6: no machine yet — «Add an SSH machine…» and «Pair a device…» on the line, never «in the Remote tab»');
  ok(/if \(info\.installed && !info\.loggedIn\) \{[\s\S]{0,200}quietLogin \? t\('Log in on this machine…'\)/.test(MA) && !/claude \/login\)…'\)/.test(MA),
    'agents-accounts-8: the machine login stays a door on its row (quiet beside the named accounts); the menu item names no command');
  // gear-and-system-12
  const AP = src('src/lib/app.js');
  ok(/\]\.filter\(Boolean\);\n\s*if \(sensRows\.length\) sensWrap\.append\(\.\.\.sensRows\);/.test(AP) && /door: 'set-password', run: \(\) => this\._showPasswordDialog\(\)/.test(AP) && !/disabled: !info\.sensitive\./.test(AP),
    'gear-and-system-12: only the sensitive data that exists is a row (no greyed rows); none ⇒ one line; no password ⇒ «Set a password…»');
  // channels-accounts-4 / outbox-2 / policy-7 / policy-1
  const CA = src('src/lib/channel-account-dialogs.js');
  ok(/function refDoor\(app, a, ref, close\)/.test(CA) && /showGrantAccessDialog\(app, target\)/.test(CA) && /showAccountReachDialog\(app, a\)/.test(CA) && /disc\.dataset\.door = 'disconnect'/.test(CA) && !/same rule as a credential with submounts/.test(CA),
    'channels-accounts-4: each reference carries «Release…» (its Grant access / Reach & policy), «Disconnect» sits beside them; the rule\'s echo is gone');
  const WV = await imp('src/lib/webhook-view.js');
  const pk = typeof WV.pickerRows === 'function' ? WV.pickerRows([{ id: 'c1', name: 'Billing', delivery: { mode: 'none' } }, { id: 'c2', name: 'Ops', delivery: { mode: 'reply-url' } }]) : [];
  ok(pk.length === 2 && pk[0].disabled && pk[0].why === 'takes no replies' && /if \(pk\.disabled\) \{ m\.body\.appendChild\(needLine\([\s\S]{0,200}door: 'callers', run: \(\) => \{ m\.close\(\); showCallersDialog\(app, slug/.test(src('src/lib/channel-webhook.js')),
    'channels-groups-outbox-2: a caller that takes no replies is its line with «Change delivery…» (Callers…), never a greyed box', pk);
  const CP = require(path.join(REPO, 'src/channel-policy.js'));
  const d1 = typeof CP.policyDoorOf === 'function' ? CP.policyDoorOf({ grain: 'conversation', source: 'conversation' }) : null, d2 = d1 ? CP.policyDoorOf({ grain: 'conversation', source: 'account' }) : null;
  const FE = src('src/lib/channel-filter-editor.js');
  ok(d1 && d1.grain === 'conversation' && d2.grain === 'account' && d1.label === 'Change the sending policy…' && /cap\.code === 'policy-review' && policyAbove\) capNote\.textContent/.test(FE) && /door: 'policy', run \}/.test(FE)
    && /policyAbove: true \}\);/.test(src('src/lib/channel-reach-editor.js')) && /if \(opts\.length === 1\) auth\.appendChild\(el\('span', 'chan-radio-words chan-auth-only', t\('Can only draft \(you approve\)'\)\)\)/.test(FE),
    'channels-policy-7 / -1: a review policy\'s refusal opens WHERE it is set (the conversation\'s or the account\'s Reach & policy); inside Reach & policy it names the row above; one possible answer is said, not a lone radio');
  // browser-profiles-19 / browser-live-13
  const SWm = require(path.join(REPO, 'src/browser-switch.js'));
  const L = SWm.proposalLines({ why: 'sign-in-refused', host: 'shop.example', plan: { kind: 'none' } });
  ok(L && L.none && Array.isArray(L.none.doors) && L.none.doors.join() === 'browser-plugin,agent-browser' && !/⚙|→/.test(L.none.key) && /'browser-plugin': app && typeof app\._pluginInstallDialog === 'function'/.test(src('src/lib/browser-proposal-card.js')),
    'browser-profiles-19: why no switch is offered names its two ways as doors on the card («Install a browser plugin…», «Agent browser…»), no menu path', L && L.none);
  const BP = require(path.join(REPO, 'src/browser-passkey.js'));
  const pw = BP.passkeyWords({ state: BP.PASSKEY_OPEN_CODE, rpId: 'shop.example', id: 'p1' }, null, {});
  ok(pw && pw.settings === 'Passkey settings…' && !/Agent browser panel/.test(pw.line) && /open: 'passkeys'/.test(src('src/lib/browser-live-window.js')) && /if \(r && !pkOpen\.has\(r\.id\)\) pkToggle\(r\);/.test(src('src/lib/browser-trace-view.js')),
    'browser-live-13: a page waiting for a passkey has «Passkey settings…» beside Cancel — the Agent browser panel at that profile, its Passkeys open', pw);
}

console.log('⑦ ACTS, DEAD ENDS AND COMPANY WORDS (lane ui-needs-a-button pick 4)');
{
  const src = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  const LA = src('src/lib/desktop-app-launcher.js');
  ok(/door: 'install-recheck'/.test(LA) && /sayDeadEnd\('no_sudo'/.test(LA) && /sayDeadEnd\('no_apt'/.test(LA) && /door: 'install-terminal'/.test(LA) && /door: 'install-xpra-page'/.test(LA) && !/in a terminal there, then check again/.test(LA),
    'desktop-apps-20 / -21 (M5): no passwordless sudo ⇒ «Open a terminal» + «Check again»; no apt-get ⇒ «Open the xpra download page» + «Check again» + «Close» — on the refusal\'s line; «there» never said of this machine (the machine table\'s marker: door: \'install-recheck\')');
  ok(/dataset\.door = 'registry-install'/.test(LA) && /openAppSearch\(app, machineOf\(host\), \{ query,/.test(LA) && /\{ onDone = null, query = '' \}/.test(src('src/lib/app-install-dialog.js')),
    'desktop-apps-3: a built-in app that is not installed carries «Install…» — the package search with its program\'s name filled in');
  ok(/door: 'remove-forget'/.test(LA) && /door: 'remove-copy'/.test(LA) && /desktop-remove-details/.test(LA) && !/p\.textContent = \[said, r && r\.error\]/.test(LA),
    'desktop-apps-18: a failed removal says it ONCE with «Forget it» / «Copy the command» / «Close»; the error and output once, under «Details»');
  const CE = src('src/lib/code-editor.js');
  ok(/'● ' \+ t\('Unsaved'\)/.test(CE) && /'✓ ' \+ t\('Saved'\)/.test(CE) && /door: 'disk-keep'/.test(CE) && /m <= \(this\._diskKept \|\| 0\)/.test(CE),
    'desktop-apps-30: the editor\'s marks are words of the page\'s language; a file changed on disk says so with «Reload from disk» / «Keep my changes» (kept = quiet until it changes again)');
  const OS = require(path.join(REPO, 'src/oauth-setup.js'));
  const kOwn = typeof OS.refusalKeys === 'function' ? OS.refusalKeys({ preset: false }) : [], kPre = typeof OS.refusalKeys === 'function' ? OS.refusalKeys({ preset: true }) : [];
  ok(!kOwn.includes('refusal.admin') && kPre.includes('refusal.admin') && !/admin/.test(OS.WORDS.refusal) && /company app/.test(OS.WORDS['refusal.admin'] || ''),
    'M3 (plugins-integrations-20): a company app\'s admin is named only beside a company preset — the refusal line itself assumes none', { kOwn, kPre });
  const SC = src('src/lib/signin-card.js');
  ok(!/Ask your administrator|Your company uses/.test(SC) && /data-door="claude-signup" href="https:\/\/claude\.ai\/"/.test(SC) && !/your company uses/i.test(src('src/lib/setup-flows.js')),
    'agents-accounts-15 / first-run-6 (M3): no Claude preset kind exists ⇒ the sign-in words are personal; «No Claude account yet?» carries «Sign up at claude.ai»');
  const MP = ['cloud', 'drive', 'gmail', 'onedrive'].map((n) => src(`src/mount-providers/${n}.js`)).join('\n');
  ok(!/below — no terminal needed/.test(MP) && (MP.match(/— no terminal needed/g) || []).length >= 4,
    'storage-1: no access box points BELOW at its Connect button (drawn above it) — the button is named, no direction');
  const UI = TABLES.find((x) => x.scope === 'ui').T;
  const deferredRows = UI.NEEDS.filter((r) => r.door.deferred).map((r) => r.id);
  const remainder = [...words.keys()].filter((w) => UI.inNet(w) && (UI.needOf(w) || {}).id === 'settings-paths').length;
  ok(deferredRows.length === 1 && deferredRows[0] === 'settings-paths' && remainder <= 49,
    `the ui table's deferred remainder is ONE row, shrink-only (${remainder} ≤ 49 path sentences, each named in pick 4's report)`, { deferredRows, remainder });
}

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* a FIFO left by a hung read */ }
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
