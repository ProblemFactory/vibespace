#!/usr/bin/env node
// test-browser-takeovers-held — data/browser-takeovers.json UNDER THE STORE-READ LAW (主开发 r3261, its second unit; lane
// bl-machines-b's census of the stores, «37 more»). FAST, in-process: the REAL keeper (src/server/browser-keeper.js — the request
// record's ONE writer) over a scratch data folder, two requests a person was asked for (two leases, two conversations), then a
// RESTART over the same folder with the refusal PLACED on the read: a store that does not parse; a store whose READ CALL is refused
// (r4130 MUST 1: EACCES placed on the synchronous read and the off-loop read of that ONE path — never a mode change, never skipped:
// every leg runs for every user, root too, in both zones).
// THE HARM it judges (the release): `loadRequests` read ANY failure as an empty queue, and the next write — an agent's ask, the
// person's Done, a For-you item's note, a lease's end — wrote the file over: EVERY OPEN REQUEST WAITING FOR A PERSON LOST, and an
// agent's page verbs ran on a browser a person had been asked to take over (the `human_asked` gate saw no request).
import './scratch.mjs';
import { scratch, deadPort, anchored } from './scratch.mjs';
import { writeFakeAgentBrowser } from './fixtures/fake-agent-browser.mjs';   // the tree's fake CLI: its daemons are `sleep`s this suite reaps
import { mutantCopies } from './mutant-copy.mjs';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const K = require('../src/server/browser-keeper.js');
const F = require('../src/browser-facts.js');
const B = require('../src/browser-profiles.js');
let STH = null; try { STH = require('../src/store-read-hold.js'); } catch { STH = null; }   // the tree's one hold (not in the release)
let pass = 0, fail = 0;
const ok = (c, title, detail) => { if (typeof title !== 'string') throw new TypeError('ok(cond, title): the title is no string — a swapped call'); if (c) { pass++; console.log(`  ✓ ${title}`); } else { fail++; console.log(`  ✗ ${title}`); if (detail !== undefined) console.log(`    ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`.slice(0, 900)); } return !!c; };
const quiet = { log() { }, warn() { }, error() { } };
const ROOT = scratch('takeovers-held');
const fake = writeFakeAgentBrowser(path.join(ROOT, 'bin'), path.join(ROOT, 'ab-state'));
process.on('exit', () => fake.reap());   // only the daemons the fake started (their pids in its own launch log)
const DEAD_CDP = await deadPort();   // the fake's cdp-url: a port the kernel just released, never a fixed one (§81)
const PATH_ENV = `${path.join(ROOT, 'bin')}:${path.dirname(process.execPath)}:/usr/bin:/bin`;
process.env.PATH = PATH_ENV;
const KEY_C = 'bk-0000000c', KEY_D = 'bk-0000000d', KEY_E = 'bk-0000000e';
const until = async (fn, ms = 4000) => { const t = Date.now() + ms; while (Date.now() < t) { if (fn()) return true; await new Promise((r) => setTimeout(r, 10)); } return !!fn(); };
const codeOf = (fn) => { try { const v = fn(); return v && typeof v === 'object' && !Array.isArray(v) && v.ok === false ? { code: v.code, error: v.error } : { value: v }; } catch (e) { return { code: e && e.code, error: e && e.message, threw: true }; } };
const heldCode = (x) => !!x && x.code === 'takeovers_unread' && /could not be read/.test(String(x.error || ''));

// ── THE PLACED REFUSAL (r4130 MUST 1): the product's READ CALL of one path refused with EACCES — the synchronous read (the start's
//    `loadRequests`) and the off-loop read (the hold's read again) — lifted by removing it; the leg reads the file through the real call
const EACCES = () => Object.assign(new Error('EACCES: permission denied, open (placed by the leg)'), { code: 'EACCES', errno: -13 });
const PLACED = new Set();
const realReadSync = fs.readFileSync, realReadAsync = fs.promises.readFile;
fs.readFileSync = function (f, ...a) { if (PLACED.has(String(f))) throw EACCES(); return realReadSync.call(this, f, ...a); };
fs.promises.readFile = function (f, ...a) { return PLACED.has(String(f)) ? Promise.reject(EACCES()) : realReadAsync.call(this, f, ...a); };
const readOwn = (f, enc) => realReadSync.call(fs, f, enc);
const placements = [
  { name: 'a takeover store that does not parse', slug: 'torn', torn: true, place: (f, good) => fs.writeFileSync(f, good.slice(0, Math.floor(good.length / 2))), lift: () => { } },
  { name: 'a takeover store whose read is refused (EACCES placed on the read call)', slug: 'refused', torn: false, place: (f) => { PLACED.add(f); }, lift: (f) => { PLACED.delete(f); } },
];
const keeperOf = (dir, extra = {}) => {
  const home = path.join(dir, 'home'), data = path.join(dir, 'data');
  fs.mkdirSync(path.join(home, '.agent-browser'), { recursive: true }); fs.mkdirSync(data, { recursive: true });
  const rtEnv = { PATH: PATH_ENV, HOME: home, FAKE_AB_STATE: path.join(ROOT, 'ab-state'), FAKE_AB_CDP_PORT: String(DEAD_CDP) };
  return { data, file: path.join(data, 'browser-takeovers.json'), mk: (Mod = K, more = {}) => Mod.create({ dataDir: data, homeDir: home, env: () => rtEnv, runtime: F.createBrowserRuntime({ env: rtEnv }), facts: F.createBrowserFacts({ env: rtEnv }), broadcast: () => { }, serverSetting: () => undefined, serverNotice: null, getTelemetry: () => null, liveKeys: () => new Set([KEY_C, KEY_D, KEY_E]), log: quiet, tickMs: 3600e3, install: false, ...extra, ...more }) };
};
let heldWords = null;   // the agent's refusal as the gate gives it (the CLI leg prints it)

for (const pl of placements) {
  console.log(`— ${pl.name}`);
  let clock = 5_000_000;
  const W = keeperOf(path.join(ROOT, pl.slug), { now: () => clock });
  const k1 = W.mk();
  const p1 = k1.createProfile({ label: 'Bank' }, { owner: { kind: 'session', id: KEY_C } }), p2 = k1.createProfile({ label: 'Mail' }, { owner: { kind: 'session', id: KEY_D } });
  await k1.attach({ profileId: p1.id, browserKey: KEY_C, sessionId: 'sess-c' }); await k1.attach({ profileId: p2.id, browserKey: KEY_D, sessionId: 'sess-d' });
  const a1 = k1.requestTakeover({ browserKey: KEY_C, profileId: p1.id, sessionId: 'sess-c', conversationName: 'Bank reconcile', text: 'Log in to the bank and solve the captcha' });
  clock += 1000;
  const a2 = k1.requestTakeover({ browserKey: KEY_D, profileId: p2.id, sessionId: 'sess-d', conversationName: 'Mail sort', text: 'Approve the sign-in on your phone' });
  const id1 = a1 && a1.request && a1.request.id, id2 = a2 && a2.request && a2.request.id;
  const gate1 = codeOf(() => k1.resolveFor({ browserKey: KEY_C }));
  k1.shutdown?.();
  const file = W.file, good = readOwn(file, 'utf8');
  let disk = null; try { disk = JSON.parse(good); } catch { disk = null; }
  ok(!!a1.ok && !!a2.ok && !!disk && Array.isArray(disk.requests) && disk.requests.filter((r) => r.state === 'waiting').length === 2 && gate1.code === 'human_asked',
    'PREMISE: two requests WAIT for a person on disk (two leases, two conversations), and a page verb on the asked browser is refused human_asked', { a1: a1.ok || a1.code, a2: a2.ok || a2.code, gate: gate1.code, n: disk && disk.requests && disk.requests.length });
  pl.place(file, good);
  if (!pl.torn) {
    let probe = null; try { fs.readFileSync(file); probe = 'read'; } catch (e) { probe = e.code; }
    ok(probe === 'EACCES' && (fs.statSync(file).mode & 0o777) === 0o600, `${pl.name}: PREMISE — the product's read of this path answers EACCES (placed), the file itself untouched (mode 0600: no permission change)`, { probe, mode: (fs.statSync(file).mode & 0o777).toString(8) });
  }
  const s0 = fs.statSync(file), b0 = readOwn(file);
  clock += 1000;
  const notices = [];
  const k = W.mk(K, { serverNotice: (key, text, o) => { notices.push({ key, text, i18n: o && o.i18n }); return 1; } });
  const queue = codeOf(() => k.takeoverRequests());
  ok(heldCode(queue), `${pl.name}: the owner's queue says THE HOLD by name (takeovers_unread) — never an empty «No browser is waiting for you»`, queue.value !== undefined ? { queue: Array.isArray(queue.value) ? queue.value.length : queue.value } : queue);
  const byId = codeOf(() => k.takeoverRequest(id1));
  ok(heldCode(byId), `${pl.name}: a request by its id says THE HOLD — never «no such request» (the person's Done, the agent's --status and its wait)`, byId.value !== undefined ? { found: byId.value } : byId);
  const gate = codeOf(() => k.resolveFor({ browserKey: KEY_C }));
  ok(heldCode(gate) && /do not ask a person again/.test(String(gate.error || '')), `${pl.name}: a page verb on a browser a person may have been asked to take over is refused BY NAME while it cannot be told (fail closed), and the agent is told plainly to wait and not to ask a person again (r4130 (a))`, gate.code ? gate : { ran: gate.value && gate.value.kind });
  if (!pl.torn && gate.code) heldWords = gate.error;
  const ask = codeOf(() => k.requestTakeover({ browserKey: KEY_C, profileId: p1.id, sessionId: 'sess-c', conversationName: 'Bank reconcile', text: 'Asked again after the restart' }));
  ok(heldCode(ask), `${pl.name}: the agent's ask is refused BY NAME before anything is filed`, ask.value !== undefined ? { filed: ask.value && ask.value.request && ask.value.request.id } : ask);
  const done = codeOf(() => k.resolveTakeoverRequest(id2, 'done'));
  ok(heldCode(done), `${pl.name}: the person's Done is refused BY NAME — never «not found»`, done);
  // r4130 (b) + (d): a For-you item pressed while held is PUT BACK open, and the person is told at that press (one notice a hold)
  if (!pl.torn) {
    const H = require('../src/server/browser-handback.js');
    let onStatus = null; const sets = [];
    const ut = { onStatus: (fn) => { onStatus = fn; return () => { }; }, setStatus: (id, st, by) => { sets.push({ id, st, by }); return { ok: true }; }, get: () => null, add: () => null };
    const ann = H.create({ keeper: k, userTodos: ut, deliver: null, activeSessions: new Map(), serverSetting: () => undefined, log: quiet });
    ann.install();
    const item = { id: 'ut-0001', status: 'done', action: { type: 'browser-takeover', requestId: id1, browserKey: KEY_C, profileId: p1.id } };
    try { onStatus && onStatus(item, { status: 'done', by: 'user' }); } catch { /* the leg reads what happened */ }
    const back = sets.find((x) => x.id === 'ut-0001' && x.st === 'open' && x.by === 'system');
    const told = notices.find((n) => /^takeovers-held-put-back:/.test(n.key) && n.i18n && n.i18n.key === n.text && /put back/.test(n.text));
    ok(!!onStatus && !!back && !!told, `${pl.name}: the person's ✓ on the request's For-you item while held: the item is PUT BACK open (by system) and the person is told at that press, in their language (one notice a hold) — never a silent bounce (r4130 (b))`, { installed: !!onStatus, sets, notices });
    ann.uninstall?.();
  }
  const s1 = fs.statSync(file);
  ok(s1.ino === s0.ino && (s1.mode & 0o777) === (s0.mode & 0o777) && s1.size === s0.size && readOwn(file).equals(b0), `${pl.name}: after every press the store is NEVER written over — the same file, its bytes and mode (the two open requests kept)`, { ino: [s0.ino, s1.ino], mode: [(s0.mode & 0o777).toString(8), (s1.mode & 0o777).toString(8)] });
  const listed = !!STH && typeof STH.holds === 'function' && STH.holds().some((h) => h && h.held && path.basename(String(h.file || '')) === 'browser-takeovers.json');
  ok(listed, `${pl.name}: the family's ONE notice sees it (the helper's live holds list browser-takeovers.json while held)`);
  const hold = k._takeoverHold || null;   // THE SUITE's SEAM on the keeper's object (r4130 (f)): the hold handed out, asked to read again
  if (!pl.torn) {
    pl.lift(file);   // the read call answers again (the placed refusal removed)
    if (hold) await hold.again();
    await until(() => !hold || !hold.held());
    const back = codeOf(() => [k.takeoverRequest(id1), k.takeoverRequest(id2)]);
    const rs = Array.isArray(back.value) ? back.value : [];
    ok(rs.length === 2 && rs.every((r) => r && r.state === 'waiting'), `${pl.name}: once the store reads again, with NO restart, BOTH requests answer — still waiting for the person`, back.value ? rs.map((r) => r && r.state) : back);
    const gate2 = codeOf(() => k.resolveFor({ browserKey: KEY_C }));
    ok(gate2.code === 'human_asked', `${pl.name}: …and the asked browser's page verb is refused human_asked again (the request is known)`, gate2);
    k.shutdown?.();
  } else {
    await until(() => !hold || !hold.held());
    const copies = fs.readdirSync(W.data).filter((n) => n.startsWith('browser-takeovers.json.corrupt-'));
    const copy = copies[0] ? path.join(W.data, copies[0]) : null;
    ok(copies.length === 1 && readOwn(copy).equals(b0) && (fs.statSync(copy).mode & 0o777) === 0o600, `${pl.name}: the torn bytes are kept aside ONCE, byte for byte, mode 0600`, { copies });
    const dmg = codeOf(() => (typeof k.takeoversDamaged === 'function' ? k.takeoversDamaged() : null));
    let live = null; try { live = JSON.parse(readOwn(file, 'utf8')); } catch (e) { live = { unread: e.code }; }
    ok(!!dmg.value && dmg.value.copy === copies[0] && !!live && !!live.damaged && live.damaged.copy === copies[0], `${pl.name}: then it starts EMPTY with the DAMAGED mark — in the new file and in the queue's answer (the copy's name)`, { said: dmg.value || dmg, file: live && live.damaged });
    k.shutdown?.();
    const k3 = W.mk();
    const d3 = codeOf(() => (typeof k3.takeoversDamaged === 'function' ? k3.takeoversDamaged() : null));
    ok(!!d3.value && d3.value.copy === copies[0], `${pl.name}: a RESTART still says the queue was damaged, with the copy's name (the mark lives in the file)`, d3.value || d3);
    // r4130 (c): the mark has an END — the first request filed after the lift (the queue is live again; its save drops the mark)
    const fresh = codeOf(() => k3.requestTakeover({ browserKey: KEY_C, profileId: p1.id, sessionId: 'sess-c', conversationName: 'Bank reconcile', text: 'A new ask after the lift' }));
    let after = null; try { after = JSON.parse(readOwn(file, 'utf8')); } catch (e) { after = { unread: e.code }; }
    ok(!!fresh.value && fresh.value.ok === true && k3.takeoversDamaged() === null && !!after && !after.damaged && Array.isArray(after.requests) && after.requests.length === 1, `${pl.name}: the damaged mark ENDS at the first request filed after the lift — the queue's answer and the file no longer carry it (r4130 (c))`, { fresh: fresh.value ? fresh.value.ok : fresh, said: k3.takeoversDamaged(), file: after && after.damaged });
    k3.shutdown?.();
    // r4130 (d): «kept aside ONCE per content» ACROSS a restart — the same torn bytes placed again make no second copy
    fs.writeFileSync(file, b0);
    const k4 = W.mk();
    codeOf(() => k4.takeoverRequests());
    const h4 = k4._takeoverHold || null; await until(() => !h4 || !h4.held());
    const copies4 = fs.readdirSync(W.data).filter((n) => n.startsWith('browser-takeovers.json.corrupt-'));
    ok(copies4.length === 1 && copies4[0] === copies[0], `${pl.name}: the SAME torn bytes placed again after a restart make NO second copy (kept aside once per content, across lives)`, { copies: copies4 });
    k4.shutdown?.();
    // r4130 (c): the copy's name read back is BOUNDED (its known head and a length) — a planted path or an endless name is no mark
    fs.writeFileSync(file, JSON.stringify({ version: 1, requests: [], damaged: { copy: '../../../etc/passwd', at: 1 } }));
    const k5 = W.mk(); const planted = k5.takeoversDamaged(); k5.shutdown?.();
    fs.writeFileSync(file, JSON.stringify({ version: 1, requests: [], damaged: { copy: 'browser-takeovers.json.corrupt-' + 'x'.repeat(400), at: 1 } }));
    const k6 = W.mk(); const endless = k6.takeoversDamaged(); k6.shutdown?.();
    ok(planted === null && endless === null, `${pl.name}: a damaged mark naming another path, or a name past its bound, reads as NO mark (the copy's head and a length)`, { planted, endless: endless && endless.copy.length });
  }
}

// ── r4130 MUST 2: while HELD, whether a person was asked is UNKNOWN to the keeper's OWN callers — the idle release releases nothing,
//    the stop list's row is «unknown» (null, refused by name by the stop verdict), never «nobody asked» — each with its RED (the check cut)
{
  console.log('— MUST 2: the idle release and the stop list while held');
  const W = keeperOf(path.join(ROOT, 'idle'));
  const facts = { [KEY_E]: { turn: 'idle' } };
  const more = { conversationFacts: (key) => facts[key] || {} };
  const k1 = W.mk(K, more);
  const SOCK = path.join(ROOT, 'sock'); fs.mkdirSync(SOCK, { recursive: true });
  const envPairs = [...B.browserEnvFor({ browserKey: KEY_E, variant: B.VARIANTS.N, idleMs: 600000 }), `AGENT_BROWSER_SOCKET_DIR=${SOCK}`];   // the conversation's own spawn pairs (test-browser-ephemeral's own road)
  let e = null; try { e = await k1.ensureEphemeral({ browserKey: KEY_E, sessionId: 'sess-e', envPairs, sessionName: 'e' }); } catch (x) { e = { threw: x && x.message }; }
  const asked = codeOf(() => k1.requestTakeover({ browserKey: KEY_E, profileId: null, sessionId: 'sess-e', conversationName: 'e', text: 'Sign in on this page' }));
  k1.shutdown?.();
  ok(!!e && !!e.browser && !!asked.value && asked.value.ok === true, 'PREMISE: the conversation\'s own browser runs, and a person was asked to take it over (the request on disk)', { e: e && (e.threw || (e.browser && e.browser.state)), asked: asked.value ? asked.value.ok : asked });
  PLACED.add(W.file);
  const judge = (Mod) => {
    const k = W.mk(Mod, more);
    const t0 = Date.now() + 1000;
    let released = null; try { k.sweepIdleReleases(t0); released = k.sweepIdleReleases(t0 + 3600e3).length; } catch (x) { released = { threw: x && x.message }; }
    let row = null; try { const rows = k.stopRows(); row = (rows || []).find((r) => r.kind === 'own') || 'no own row'; } catch (x) { row = { threw: x && x.code }; }
    k.shutdown?.();
    return { released, takenOver: row && typeof row === 'object' && 'takenOver' in row ? row.takenOver : row };
  };
  const cure = judge(K);
  ok(cure.released === 0, 'while held the IDLE RELEASE releases NOTHING — never the page a person was asked to sign in on', cure);
  ok(cure.takenOver === null, 'while held the STOP LIST says «unknown» for that browser (null — the stop verdict refuses it by name), never «nobody asked»', cure);
  // RED: a copy of the keeper whose two checks are cut — the release stops the browser, the row says «false»
  const src = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  const cut1 = "    if (takeoversHeld()) return released;   // r4130 MUST 2:";
  const cut2 = "const takenOver = takeoversHeld() ? null : keys.some(";
  let red = null;
  if (src.includes(cut1) && src.includes(cut2)) {
    const mut = anchored(anchored(src, cut1, '    if (false) return released;   // cut:', 'must2-idle-hold-check'), cut2, 'const takenOver = keys.some(', 'must2-stop-hold-check');   // stale-pins: kept (the red copy's own text: the hold check cut)
    const KM = mutantCopies('takeovers-held-must2', REPO).load('src/server/browser-keeper.js', mut, 'no-hold-check');
    red = judge(KM);
  }
  ok(!!red && (red.released === 1 || red.takenOver === false), 'CONTROL (RED): with the two hold checks cut, the idle release stops the browser or the stop list says «nobody asked» — the legs above would go red', red);
  PLACED.delete(W.file);
}

// ── r4130 (d): THE SAVE's OWN GUARD (tqHold.writable) has a red of its own — a copy whose ask does not refuse first still writes nothing
//    while held; a copy with the guard cut as well writes the file over (the two open requests lost)
{
  console.log('— the save\'s own guard while held');
  const W = keeperOf(path.join(ROOT, 'guard'));
  const k1 = W.mk();
  const p = k1.createProfile({ label: 'Bank' }, { owner: { kind: 'session', id: KEY_C } });
  await k1.attach({ profileId: p.id, browserKey: KEY_C, sessionId: 'sess-c' });
  k1.requestTakeover({ browserKey: KEY_C, profileId: p.id, sessionId: 'sess-c', conversationName: 'Bank', text: 'Log in please' });
  k1.shutdown?.();
  const b0 = readOwn(W.file);
  const src = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  const ASK = "    if (tqHold.held()) return tqRefusal('asking a person to take over');";
  const GUARD = "    if (!tqHold.writable('a takeover request change')) return false;";
  const tryAsk = (text, tag) => {
    PLACED.add(W.file);
    const KM = mutantCopies('takeovers-held-guard', REPO).load('src/server/browser-keeper.js', text, tag);
    const k = W.mk(KM);
    codeOf(() => k.requestTakeover({ browserKey: KEY_C, profileId: p.id, sessionId: 'sess-c', conversationName: 'Bank', text: 'Asked through the copy' }));
    k.shutdown?.(); PLACED.delete(W.file);
    const same = readOwn(W.file).equals(b0);
    fs.writeFileSync(W.file, b0);
    return same;
  };
  const okAsk = src.includes(ASK) && src.includes(GUARD);
  const noAsk = okAsk ? anchored(src, ASK, '    // (the ask\'s own refusal cut)', 'guard-ask-refusal-cut') : null;
  const guardHolds = okAsk ? tryAsk(noAsk, 'no-ask-refusal') : null;
  const guardCut = okAsk ? tryAsk(anchored(noAsk, GUARD, '    // (the guard cut)', 'guard-write-guard-cut'), 'no-guard') : null;
  ok(guardHolds === true, 'the SAVE\'s own guard: with the ask\'s refusal cut, the ask reaches the save while held and the guard writes NOTHING — the file is the same bytes', { guardHolds });
  ok(guardCut === false, 'CONTROL (RED): with the guard cut too, the same ask writes the file over — the leg above would go red', { guardCut });
}

// ── r4130 (a) + (d): THE AGENT's REFUSED VERB AS THE CLI PRINTS IT — the shipped CLI over a stand-in hub answering what the held gate
//    answers: a page verb prints the hold's words with its code; a page verb asked while a person was asked WAITS, and a poll the hold
//    answers says the hold, never «the request is gone — your command runs now»
{
  console.log('— the CLI while held');
  const words = heldWords || 'the takeover requests could not be read';
  let mode = 'refused';
  const srv = http.createServer((req, res) => {
    let body = ''; req.on('data', (d) => { body += d; }); req.on('end', () => {
      const send = (st, o) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (req.url.startsWith('/api/agent/browser/resolve')) {
        if (mode === 'refused') return send(503, { error: words, code: 'takeovers_unread' });
        return send(409, { error: 'a person was asked to take over this browser', code: 'human_asked', request: { id: 'tr-0000000a', waitMs: 2500, pollMs: 1000 } });
      }
      if (req.url.startsWith('/api/agent/browser/takeover-request')) return send(503, { error: words, code: 'takeovers_unread' });
      return send(404, { error: 'not here', code: 'not_found' });
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const API = `http://127.0.0.1:${srv.address().port}`;
  const env = { PATH: PATH_ENV, HOME: path.join(ROOT, 'cli-home'), VIBESPACE_API: API, VIBESPACE_SESSION_TOKEN: 'vsst_' + 'e'.repeat(24) };
  fs.mkdirSync(env.HOME, { recursive: true });
  const runCli = (argv) => new Promise((resolve) => {
    const ch = spawn(process.execPath, [path.join(REPO, 'data/bin/vibespace-browser'), ...argv], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = ''; ch.stdout.on('data', (d) => { out += d; }); ch.stderr.on('data', (d) => { err += d; });
    const t = setTimeout(() => { try { ch.kill('SIGKILL'); } catch { } }, 20000);
    ch.on('close', (status) => { clearTimeout(t); resolve({ status, out, err }); });
  });
  const r1 = await runCli(['snapshot']);
  ok(r1.status !== 0 && /\[takeovers_unread\]/.test(r1.err) && /do not ask a person again/.test(r1.err), 'the CLI prints a page verb refused while held WITH the hold\'s words and its code — wait, it reads again by itself, do not ask a person again — and exits non-zero', { status: r1.status, err: r1.err.slice(0, 400) });
  mode = 'asked';
  const r2 = await runCli(['snapshot']);
  ok(r2.status !== 0 && /\[takeovers_unread\] — your command did NOT run/.test(r2.err) && !/your command runs now/.test(r2.err), 'a page verb asked while a person was asked WAITS, and a poll the hold answers says the hold — never «the request is gone, your command runs now» (r4130 (a))', { status: r2.status, err: r2.err.slice(0, 500) });
  await new Promise((r) => srv.close(r));
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
