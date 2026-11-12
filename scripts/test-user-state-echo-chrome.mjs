#!/usr/bin/env node
// EVERY ACT IS ON THE WIRE AT THE ACT, IN A REAL BROWSER (lane sidebar-echo-order rounds 4–5 — the owner's incident
// inc-mwbn2xp8-ks0b): a page hands each user-state act to the network AT THE ACT, in a request that carries every batch of the
// page not yet confirmed, oldest first (src/user-state-ops.js createSync), so a page closed right after its acts loses none of
// them — as on master. This suite drives the REAL page in headless Chrome against a throwaway server: five acts (three
// archives, a star, a rename) and the tab CLOSED at once — the hub receives every one, each once (round 15: each request that fits goes
// keepalive — the browser completes it after the tab is gone; the .397 hosted mirror, slower than the box, lost the last ones without it).
// THE OVER-BUDGET ROAD, its own row: a select-all whose request is past the 48 KiB keepalive budget goes as a plain fetch, as on master —
// what it promises is that the act was handed to the network and lands at most once, all or nothing (lost if the tab closes before its
// upload ends — named).
// Throwaway server in a git worktree (own data dir + EMPTY fake HOME) + headless chrome over raw CDP.
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port for every server this suite boots (test-architecture §57)
const require = createRequire(import.meta.url);

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const UO = require(path.join(repo, 'src/user-state-ops.js'));
const CHROME = [process.env.VS_CHROME, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => p && fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }

const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('ueo-chrome');
const fakeHome = scratch('ueo-chrome-home');
let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 800) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
execSync('npm run build', { cwd: wt, stdio: 'ignore' });
fs.rmSync(fakeHome, { recursive: true, force: true });
fs.mkdirSync(path.join(fakeHome, '.claude'), { recursive: true });
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });

const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome }, stdio: 'ignore' });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--disable-background-timer-throttling', ...(process.env.VS_CHROME ? ['--no-sandbox'] : []), `--user-data-dir=${wt}-chrome`, 'about:blank'], { stdio: 'ignore' });   // (VS_CHROME: a Chrome for Testing unpacked from its zip has no setuid sandbox helper — as the other suites run it)
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  // what the server started (its sessions run detached under dtach — killing the server ends none of them): every process rooted
  // in this suite's scratch dirs (scratch.mjs; test-architecture §57b)
  try { endRootedProcesses(wt); } catch { }
  try { endRootedProcesses(fakeHome); } catch { }
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  try { fs.rmSync(`${wt}-chrome`, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(fakeHome, { recursive: true, force: true }); } catch {}
};
process.on('exit', cleanup);
const BASE = `http://127.0.0.1:${PORT}`;
for (let i = 0; i < 60; i++) { try { await fetch(`${BASE}/api/home`); break; } catch { await sleep(250); } }
const userState = async () => (await (await fetch(`${BASE}/api/user-state`)).json());
// EACH ONCE, BY THE HUB'S OWN RECORD (the .397 master CI, Chrome 157: every act landed, the revision moved 4 not 5). A page's request
// carries EVERY batch it has not seen confirmed, oldest first, and the hub writes once per request that changes something — so a
// request a LATER one overtook carries only acts already applied: held by their batch id, it writes nothing. The count of writes
// follows the order the requests ARRIVE in (pace); what the leg is for is each act applied ONCE — read off the slot facts the hub
// keeps in user-state.json (stateFacts: per slot, the page and the act counter that last wrote it), never off the write counter.
const factsOnDisk = () => { try { const j = JSON.parse(fs.readFileSync(path.join(wt, 'data', 'user-state.json'), 'utf8')); return j[UO.FACTS_KEY] || {}; } catch { return {}; } };
/** for each act the page made (its unconfirmed ops with their batch ids, read BEFORE the close): the fact of its slot on disk */
const actFacts = (unconf) => { const f = factsOnDisk(); return unconf.map((o) => { const { batch, ...op } = o; const fact = UO.factIn(f[UO.slotOf(op)]); return { slot: UO.slotOf(op), batch, page: fact && fact.page, counter: fact && fact.counter }; }); };
const onceEach = (rows, page) => rows.length > 0 && rows.every((r) => r.page === page && `${page}:${r.counter}` === r.batch) && new Set(rows.map((r) => r.batch)).size === rows.length;

// ── raw CDP, one socket per page target ─────────────────────────────────────
const WebSocket = require('ws');
async function attach(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => ws.on('open', r));
  let seq = 0; const pend = new Map(); const handlers = [];
  ws.on('message', (m) => { const d = JSON.parse(m); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method) for (const h of handlers) h(d); });
  const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); try { ws.send(JSON.stringify({ id, method, params })); } catch { res({}); } });
  const evl = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.text + ' ' + (r.result.exceptionDetails.exception?.description || '')); return r.result?.result?.value; };
  return { ws, cdp, evl, on: (h) => handlers.push(h) };
}
async function newPage() {
  const t = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const p = await attach(t);
  p.id = t.id;
  await p.cdp('Page.enable');
  await p.cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await p.cdp('Page.navigate', { url: `${BASE}/` });
  for (let i = 0; i < 60; i++) { if (await p.evl(`!!(window.app && app.sidebar && app.sidebar._userStateFetched && app.sidebar.__userSync && app.sidebar.__userSync.hasBase())`).catch(() => false)) break; await sleep(250); }
  return p;
}
try {
  const p = await newPage();
  const before = await userState();
  const keys = [1, 2, 3, 4, 5].map((i) => `claude:e000000${i}-0000-4000-8000-00000000000${i}`);
  // five acts in one go, then the tab closed AT ONCE — no wait for any answer
  const made = await p.evl(`(() => { const sb = app.sidebar; sb.toggleArchive(${JSON.stringify(keys[0])}); sb.toggleArchive(${JSON.stringify(keys[1])}); sb.toggleArchive(${JSON.stringify(keys[2])}); sb.toggleStar(${JSON.stringify(keys[3])}); sb.setCustomName(${JSON.stringify(keys[4])}, 'closed at once'); return { n: sb.__userSync.inFlight(), page: sb.__userSync.pageId, unconf: sb.__userSync.unconfirmed() }; })()`);
  console.log(`  · requests in flight as the tab closes: ${made.n}`);
  await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${p.id}`);
  let after = null;
  for (let i = 0; i < 40; i++) { after = await userState(); if (keys.slice(0, 3).every((k) => after.archivedSessions.includes(k)) && after.starredSessions.includes(keys[3]) && after.customNames[keys[4]] === 'closed at once') break; await sleep(250); }
  await sleep(1000);
  after = await userState();
  check('acts made and the tab closed AT ONCE: the hub received every one (three archives, a star, a rename)', keys.slice(0, 3).every((k) => after.archivedSessions.includes(k)) && after.starredSessions.includes(keys[3]) && after.customNames[keys[4]] === 'closed at once', { archived: after.archivedSessions, starred: after.starredSessions, names: after.customNames });
  // each once, by the hub's record (the write count is printed — four is a lawful arrival order; more than five is not)
  let rows = [];
  for (let i = 0; i < 20; i++) { rows = actFacts(made.unconf); if (onceEach(rows, made.page)) break; await sleep(250); }   // (the store writer lands the file a moment after the answer)
  const writes = UO.revOf(after) - UO.revOf(before);
  check(`…each once, by the hub's own record: each of the five acts' slots names this page and THAT act's batch (${writes} write(s) — a request a later one overtook writes nothing)`,
    made.unconf.length === 5 && onceEach(rows, made.page) && writes >= 1 && writes <= 5, { writes, page: made.page, rows });
  try { p.ws.close(); } catch {}
  // THE FOUR-WRITE ORDER, BUILT — not waited for, never by load: the five acts again on a page whose SECOND request is held inside
  // the browser (CDP Fetch, the request stage) until the later three landed. Every act is on the hub in FOUR writes (R1, then R3
  // carrying b2+b3, R4, R5). Then a later act of the SAME page un-archives the first conversation (b6, its own request), and only
  // then is the held request let go: it carries b1 + b2, both applied already — HELD by their batch ids, it writes nothing, and the
  // un-archive stands. A duplicate applied again would archive it again: the owner's «批量归档不再回滚», on the hub.
  {
    const r = await newPage();
    await r.cdp('Network.enable');
    const before3 = await userState();
    const keys3 = [1, 2, 3, 4, 5].map((i) => `claude:e100000${i}-0000-4000-8000-00000000000${i}`);
    let heldId = null, heldNet = null, heldDone = false, paused = 0;
    r.on((d) => {
      if (d.method === 'Fetch.requestPaused') {
        paused++;
        const ids = ((d.params.request.postData || '').match(/"batch":/g) || []).length;
        if (!heldId && ids === 2) { heldId = d.params.requestId; heldNet = d.params.networkId; return; }   // R2: b1 + b2 — held
        r.cdp('Fetch.continueRequest', { requestId: d.params.requestId });
      } else if ((d.method === 'Network.loadingFinished' || d.method === 'Network.loadingFailed') && heldNet && d.params.requestId === heldNet) heldDone = d.method;
    });
    await r.cdp('Fetch.enable', { patterns: [{ urlPattern: '*/api/user-state/batches*', requestStage: 'Request' }] });
    const made3 = await r.evl(`(() => { const sb = app.sidebar; sb.toggleArchive(${JSON.stringify(keys3[0])}); sb.toggleArchive(${JSON.stringify(keys3[1])}); sb.toggleArchive(${JSON.stringify(keys3[2])}); sb.toggleStar(${JSON.stringify(keys3[3])}); sb.setCustomName(${JSON.stringify(keys3[4])}, 'held one'); return { page: sb.__userSync.pageId, unconf: sb.__userSync.unconfirmed() }; })()`);
    const all5 = (st) => keys3.slice(0, 3).every((k) => st.archivedSessions.includes(k)) && st.starredSessions.includes(keys3[3]) && st.customNames[keys3[4]] === 'held one';
    let mid = null;
    for (let i = 0; i < 40; i++) { mid = await userState(); if (all5(mid)) break; await sleep(250); }
    const writes4 = UO.revOf(mid) - UO.revOf(before3);
    check(`the four-write order BUILT (the second request held in the browser until the later three landed): every one of the five acts on the hub in ${writes4} writes`,
      !!heldId && !heldDone && all5(mid) && writes4 === 4, { held: !!heldId, paused, writes4, rev: [UO.revOf(before3), UO.revOf(mid)] });
    // a later act of the same page on the held request's first slot: un-archive the first conversation (b6, its own request)
    const made6 = await r.evl(`(() => { const sb = app.sidebar; sb.toggleArchive(${JSON.stringify(keys3[0])}); return sb.__userSync.unconfirmed(); })()`);
    let mid6 = null;
    for (let i = 0; i < 40; i++) { mid6 = await userState(); if (!mid6.archivedSessions.includes(keys3[0])) break; await sleep(250); }
    // the person's screen while the held request is let go: the first conversation must never show archived again
    await r.evl(`(() => { const sb = app.sidebar, k = ${JSON.stringify(keys3[0])}; window.__seen = []; window.__tick = setInterval(() => window.__seen.push(sb._archivedIds && sb._archivedIds.has(k)), 10); })()`);
    if (heldId) await r.cdp('Fetch.continueRequest', { requestId: heldId });
    for (let i = 0; i < 40 && !heldDone; i++) await sleep(100);
    await sleep(500);
    const seen = await r.evl(`(() => { clearInterval(window.__tick); return window.__seen; })()`);
    const end3 = await userState();
    let rows3 = [];
    const act6 = made6.filter((o) => !made3.unconf.some((m) => m.batch === o.batch));   // (the page may not have read R5's answer yet: b5 still unconfirmed beside b6)
    const want = [...made3.unconf.slice(1), ...act6];   // acts 2–5, and act 6 now owns the first conversation's slot
    for (let i = 0; i < 20; i++) { rows3 = actFacts(want); if (onceEach(rows3, made3.page)) break; await sleep(250); }
    check(`…the held request let go AFTER a later act of the page undid its first: HELD by its batch ids — it wrote nothing (${UO.revOf(end3) - UO.revOf(mid6)} writes), the un-archive stands on the hub and on the screen (${seen.length} looks, archived again in ${seen.filter(Boolean).length})`,
      heldDone === 'Network.loadingFinished' && !end3.archivedSessions.includes(keys3[0]) && UO.revOf(end3) === UO.revOf(mid6) && seen.length > 0 && !seen.some(Boolean) && onceEach(rows3, made3.page) && act6.length === 1,
      { heldDone, archived0: end3.archivedSessions.includes(keys3[0]), revs: [UO.revOf(mid6), UO.revOf(end3)], seenArchived: seen.filter(Boolean).length, rows3 });
    try { await r.cdp('Fetch.disable'); } catch {}
    await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${r.id}`);
    try { r.ws.close(); } catch {}
  }
  // THE OVER-BUDGET ROAD: one act — a select-all of 900 (its request ~80 KB, past the keepalive budget) — and the tab closed at once
  const q = await newPage();
  const before2 = await userState();
  const many = Array.from({ length: 900 }, (_, i) => `claude:f${String(i).padStart(7, '0')}-0000-4000-8000-000000000000`);
  const inflight2 = await q.evl(`(() => { app.sidebar.archiveSessions(${JSON.stringify(many)}.map((k) => ({ sessionKey: k }))); return app.sidebar.__userSync.inFlight(); })()`);
  await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${q.id}`);
  await sleep(4000);
  const after2 = await userState();
  const landed2 = many.filter((k) => after2.archivedSessions.includes(k)).length, writes2 = UO.revOf(after2) - UO.revOf(before2);
  check(`the over-budget road (a select-all of 900, past the keepalive budget, the tab closed at once): handed to the network (${inflight2} request), all or nothing and at most once — ${landed2} of 900 landed in ${writes2} write(s)`,
    inflight2 === 1 && (landed2 === 0 || landed2 === 900) && writes2 === (landed2 ? 1 : 0), { inflight2, landed2, writes2 });
  try { q.ws.close(); } catch {}
} catch (e) {
  failed++; console.error('  ✗ threw:', e.stack || e.message);
}
console.log(failed ? `\n${failed} FAILED` : 'ALL PASS');
process.exit(failed ? 1 : 0);
