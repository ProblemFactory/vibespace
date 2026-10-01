#!/usr/bin/env node
// LANE SITE-RESET (2026-09-30 — userW's pod: a stale login looped a bank's sign-in page and its app, every verb timed out):
// A PAGE THAT WILL NOT SETTLE IS A NAMED FACT, AND ONE SITE'S STORED LOGIN CAN BE CLEARED — by the agent in its own
// browser, by the user's Approve on a shared one. Fast tier, in-process on a scratch world: the REAL keeper over a fake
// agent-browser (scripts/fixtures/fake-agent-browser.mjs) whose browsers are a FAKE CDP endpoint (tabs, a cookie jar,
// the storage calls — shaped as measured on 0.38.1's Chrome), the REAL dialog watch, the REAL routes on port 0, the REAL
// proposal runner (lane browser-propose's, with this lane's `site-reset` kind) + the REAL clearer the wiring uses, the
// REAL handback announcer's tell over a fake ladder, a REAL For-you store, a REAL normalizer per conversation, the shipped
// CLI (zero vendor calls, no real browser, scratch dirs /tmp/vs-sreset-<pid>).
//   ① THE LOOP through the watch: the MEASURED event shape replayed on a tab ⇒ the long-poll of a verb in flight is
//      answered BY THE EVENT (loop=1); a navigation verb only by a loop that began after its own start; the fact carries it
//   ② the CLI while it stands: a page-waiting verb answers the loop at once without spawning the browser CLI; `stop`,
//      a bare `tab close`, `screenshot` go DIRECT (Page.stopLoading / Target.closeTarget / a bounded capture) — never the
//      browser CLI's queue; a picture that never comes is [no_picture] by name
//   ③ `site-reset` in the conversation's OWN browser: exactly the cookies that reach the host (host-only + parent domain;
//      never a sibling's, never another site's), its origins' storage ON A PAGE'S SESSION, session storage of its tabs;
//      the answer counts and names them; the refusals by name (remote_session, host_not_current + the --host way, bad-host)
//   ④ on a SHARED profile: ONE proposal — ONE card op, ONE For-you item (the card's words line for line + the digest), the
//      same card on a second ask; nothing cleared by the ask; the owner-only doors (an agent's bearer 403, a wrong digest
//      409, none 400); Approve runs EXACTLY the frozen (profile, host): the browser started when it did not run, the jar
//      cleared, the card patched in place to done, the agent told (noWake), the live views told once, the item answered
//   ⑤ Reject: the agent hears it once at its next navigation to the host; more holders than the card said ⇒
//      proposal_stale, nothing cleared
//   ⑤b verify r1: a shared browser nobody's live view shows — an unattributed conversation acts on NO tab, reads no address, and a
//      verb of its that times out beside a looping tab is told THAT much (a kind, never an address) with the way out
//   ⑤c verify r1: gates for the parts a revert left green (the takeover refusal of a direct stop, a cut verb is not a
//      timeout, loop-cleared on a tab close, the boot drop of a gone conversation's proposal, the quiet clock)
//   ⑥ SEVEN patched-copy controls (scripts/mutant-copy.mjs) — each reddens a row above
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { writeFakeAgentBrowser } from './fixtures/fake-agent-browser.mjs';
const require = createRequire(import.meta.url);
const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const B = require('../src/browser-profiles.js');
const SW = require('../src/browser-switch.js');
const ST = require('../src/browser-stuck.js');
const K = require('../src/server/browser-keeper.js');
const D = require('../src/server/browser-dialogs.js');
const PR = require('../src/server/browser-propose.js');
const HB = require('../src/server/browser-handback.js');
const N = require('../src/normalizers.js');
const RT = require('../src/routes/browser.js');
const { UserTodoManager } = require('../src/user-todos.js');
const express = require('express');
const { WebSocketServer } = require('ws');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1500) : '')); } return !!c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms = 5000, every = 10) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await pred(); if (v) return v; await sleep(every); } return pred(); };
const quiet = { log() {}, warn() {}, error() {} };

const ROOT = scratch('sreset');
fs.rmSync(ROOT, { recursive: true, force: true });
const HOME = path.join(ROOT, 'home'); fs.mkdirSync(path.join(HOME, '.agent-browser'), { recursive: true });
const DATA = path.join(ROOT, 'data'); fs.mkdirSync(DATA, { recursive: true });
const BIN = path.join(ROOT, 'bin');
const AB = path.join(ROOT, 'ab-state');
const fake = writeFakeAgentBrowser(BIN, AB);
const PATH_ENV = `${BIN}:${path.dirname(process.execPath)}:/usr/bin:/bin`;
const servers = new Set();
process.on('exit', () => { fake.reap(); for (const s of servers) { try { s.close(); } catch { } } try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(130));
const MUT = mutantCopies('sreset', REPO);
const FIX = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/navigation-loop-0.38.1.json'), 'utf8'));

// ═══ THE FAKE CDP BROWSERS — one per ws path (a profile's browser), shaped as measured on 0.38.1's Chrome ═══
function fakeChromes() {
  const browsers = new Map(); // ws path → {targets: Map, jar: [], calls: [], sessions: Map}
  const of = (p) => { if (!browsers.has(p)) browsers.set(p, { targets: new Map(), jar: [], calls: [], sessions: new Map(), clients: new Set(), shotHang: false, n: 0 }); return browsers.get(p); };
  const wss = new WebSocketServer({ noServer: true });
  const srv = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ Browser: 'Chrome/146.0.7000.1' })); });
  srv.on('upgrade', (req, sock, head) => wss.handleUpgrade(req, sock, head, (ws) => { ws._bpath = new URL(req.url, 'http://x').pathname; wss.emit('connection', ws); }));
  const send = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
  wss.on('connection', (ws) => {
    const b = of(ws._bpath); b.clients.add(ws); ws.on('close', () => b.clients.delete(ws));
    ws.on('message', (d) => {
      const m = JSON.parse(d); const reply = (o) => send(ws, { id: m.id, ...(m.sessionId ? { sessionId: m.sessionId } : {}), ...o });
      const s = m.sessionId ? b.sessions.get(m.sessionId) : null;
      b.calls.push({ method: m.method, params: m.params || {}, sessionId: m.sessionId || null, targetId: s ? s.targetId : null, at: Date.now() });
      switch (m.method) {
        case 'Target.getTargets': return reply({ result: { targetInfos: [...b.targets.values()].map((t) => t.info) } });
        case 'Target.attachToTarget': { if (!b.targets.has(m.params.targetId)) return reply({ error: { code: -32602, message: 'No target' } }); const sid = `S-${m.params.targetId}-${++b.n}`; b.sessions.set(sid, { targetId: m.params.targetId, ws, enabled: false }); return reply({ result: { sessionId: sid } }); }
        case 'Page.enable': if (s) s.enabled = true; return reply({ result: {} });
        case 'Page.stopLoading': { if (b.stopRefuse > 0) { b.stopRefuse--; return reply({ error: { code: -32000, message: 'Not attached to an active page' } }); } const t = s && b.targets.get(s.targetId); if (t && t.replay) { clearTimeout(t.replay); t.replay = null; } return reply({ result: {} }); } // verify r4 #5: Chrome's transient refusal, N times
        case 'Target.createTarget': { const tid = 'N' + (++b.n); api.addTab(ws._bpath, tid, m.params.url || 'about:blank'); return reply({ result: { targetId: tid } }); }
        case 'Target.closeTarget': { const t = b.targets.get(m.params.targetId); if (!t) return reply({ error: { code: -32602, message: 'No target with given id found' } }); if (t.replay) clearTimeout(t.replay); b.targets.delete(m.params.targetId); for (const c of b.clients) send(c, { method: 'Target.targetDestroyed', params: { targetId: m.params.targetId } }); return reply({ result: { success: true } }); }
        case 'Page.captureScreenshot': if (b.shotHang) return undefined; return reply({ result: { data: Buffer.from('fake-png-' + (s ? s.targetId : '?')).toString('base64') } }); // a page that never draws: no answer at all (measured)
        case 'Storage.getCookies': return reply({ result: { cookies: b.jar.map((c) => ({ ...c })) } });
        case 'Network.deleteCookies': { if (!s) return reply({ error: { code: -32601, message: '\'Network.deleteCookies\' wasn\'t found' } }); const p = m.params; b.jar = b.jar.filter((c) => !(c.name === p.name && c.domain === p.domain && c.path === p.path)); return reply({ result: {} }); }
        case 'Storage.clearDataForOrigin': if (!s) return reply({ error: { code: -32603, message: 'Internal error' } }); return reply({ result: {} }); // measured: the browser endpoint answers "Internal error"; a page's session clears
        default: return reply({ result: {} });
      }
    });
  });
  const api = {
    srv, of,
    addTab(bpath, targetId, url) { const b = of(bpath); b.targets.set(targetId, { info: { targetId, type: 'page', url, title: 'T ' + targetId, attached: false }, replay: null }); for (const c of b.clients) send(c, { method: 'Target.targetCreated', params: { targetInfo: b.targets.get(targetId).info } }); },
    removeTab(bpath, targetId) { const b = of(bpath); const t = b.targets.get(targetId); if (!t) return; if (t.replay) clearTimeout(t.replay); b.targets.delete(targetId); for (const c of b.clients) send(c, { method: 'Target.targetDestroyed', params: { targetId } }); },
    pageEvent(bpath, targetId, method, params) { const b = of(bpath); for (const [sid, s] of b.sessions) if (s.targetId === targetId && s.enabled && s.ws.readyState === 1) s.ws.send(JSON.stringify({ sessionId: sid, method, params })); },
    /** replay a MEASURED event shape on a tab (its own timing; the port placeholder → the fixture host). → a promise at its end. */
    replay(bpath, targetId, events, { host = 'http://127.0.0.1:8080', onCommit = null, speed = 8 } = {}) { // the measured gaps ÷ speed (the verdict counts hops in 30 s — the order and the reasons are the shape)
      const b = of(bpath); const t = b.targets.get(targetId);
      return new Promise((resolve) => {
        let i = 0; const t0 = Date.now();
        const step = () => {
          if (!b.targets.has(targetId)) return resolve({ stopped: true, i });
          if (i >= events.length) { t.replay = null; return resolve({ i }); }
          const e = events[i++];
          const url = String(e.url || '').replace(/^http:\/\/127\.0\.0\.1:<P>/, host);
          if (e.method === 'frameRequestedNavigation') api.pageEvent(bpath, targetId, 'Page.frameRequestedNavigation', { frameId: targetId, reason: e.type, url, disposition: 'currentTab' });
          else if (e.method === 'frameStartedNavigating') api.pageEvent(bpath, targetId, 'Page.frameStartedNavigating', { frameId: targetId, url, navigationType: e.type || 'differentDocument', loaderId: 'L' + i });
          else if (e.method === 'frameNavigated') { t.info.url = url; api.pageEvent(bpath, targetId, 'Page.frameNavigated', { frame: { id: targetId, url, loaderId: 'L' + i } }); if (onCommit) onCommit(url); }
          else if (e.method === 'frameStoppedLoading') api.pageEvent(bpath, targetId, 'Page.frameStoppedLoading', { frameId: targetId });
          const next = events[i];
          t.replay = setTimeout(step, next ? Math.max(0, (next.at - e.at) / speed) : 0);
          void t0;
        };
        t.replay = setTimeout(step, 0);
      });
    },
    async listen() { const p = await new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv.address().port))); this.port = p; return this; },
  };
  return api;
}
const chrome = await fakeChromes().listen();
servers.add(chrome.srv);

// ═══ the scratch world: the REAL keeper, watch, runner, routes; three conversations ═══
const settings = {};
const active = new Map();
const opsOf = new Map();
function mkSession(id, bk, name, extra = {}) {
  const mm = N.createMessageManager('claude', id);
  const ops = []; mm.onOp((op) => ops.push(op)); opsOf.set(id, ops);
  const s = { agentToken: 'vsst_' + id.replace(/[^a-z0-9]/g, '').padEnd(24, 'x').slice(0, 24), _browserKey: bk, _browserVariant: 'D', name, webuiName: name, mode: 'chat', claudeSessionId: 'c0ffee00-0000-4000-8000-' + bk.slice(3).padStart(12, '0'), _normalizer: mm, _historyLoaded: true, backend: 'claude', cwd: ROOT, ...extra };
  active.set(id, s);
  return s;
}
const sA = mkSession('sess-a', 'bk-0000a1a1', 'Bank work');
const sB = mkSession('sess-b', 'bk-0000b2b2', 'Statements');
const sC = mkSession('sess-c', 'bk-0000c3c3', 'Third one');
const sR = mkSession('sess-r', 'bk-0000d4d4', 'Remote one', { hostId: 'dev-1' });
const cardOps = (sid, id) => opsOf.get(sid).filter((o) => (o.op === 'create' && o.message && o.message.id === `${sid}:bp:${id}`) || (o.op === 'edit' && o.id === `${sid}:bp:${id}`));
const keeper = K.create({ dataDir: DATA, homeDir: HOME, env: () => ({ PATH: PATH_ENV, HOME, FAKE_AB_STATE: AB, FAKE_AB_CDP_PORT: String(chrome.port) }), serverSetting: (k) => settings[k], liveKeys: () => new Set([...active.values()].map((s) => s._browserKey)), install: false, log: quiet, hostKnown: () => false, driveHoldMs: 200 }); // one driver at a time (owner ruling A): the claim lapses after 0.2 s quiet here, 90 s in the product
const holdersOf = (profileId) => { const out = (keeper.list().leases || []).filter((l) => l && l.profileId === profileId && l.browserKey).map((l) => ({ browserKey: l.browserKey, sessionId: l.sessionId || null, ephemeral: !!l.ephemeral })); return out; };
let worldQuietMs; // verify r1: one block shortens the watch's quiet rule (the product's 8 s) — every other row keeps it
function mkWorld({ Dmod = D, PRmod = PR, RTmod = RT } = {}) {
  const dialogs = Dmod.create({ keeper, log: quiet, holdersOf, leaseCountOf: (pid) => new Set(holdersOf(pid).map((h) => h.browserKey)).size, captureTimeoutMs: 800, ...(worldQuietMs ? { quietMs: worldQuietMs } : {}) }); // the product's 4 s bound, shortened for the fast tier (the heavy suite runs it at 4 s)
  keeper.setStuckSource((bk) => dialogs.stuckForKey(bk));
  const tdir = path.join(DATA, 'todos-' + Math.random().toString(16).slice(2, 8)); fs.mkdirSync(tdir, { recursive: true });
  const todos = new UserTodoManager({ dataDir: tdir, expirySweepMs: 0 });
  const sessionKeyFor = (s) => 'claude:' + s.claudeSessionId;
  const ladder = { calls: [], stash: [] };
  const deliver = {
    async deliverToConversation(cid, text, opts) { ladder.calls.push({ cid, text, opts }); return opts && opts.noWake ? { ok: false, refused: 'no-wake', reason: 'no free lane' } : { ok: true, lane: 'message' }; },
    stashFor(cid, env) { ladder.stash.push({ cid, ...env }); return { stored: true, why: null }; },
  };
  const hb = HB.create({ keeper, deliver, activeSessions: active, userTodos: todos, sessionKeyFor: (s) => sessionKeyFor(s), log: quiet });
  const broadcasts = [];
  const runner = PRmod.create({ keeper, activeSessions: active, userTodos: todos, sessionKeyFor: (s) => sessionKeyFor(s), serverSetting: (k) => settings[k],
    feedCard: (session, block) => N.feedProposalCard(session, block), tell: (o) => hb.tellProposal(o), broadcast: (m) => broadcasts.push(m), log: quiet,
    clearSite: PRmod.siteResetClearer({ dialogs, keeper }) });
  N.setProposalCardSource(({ session = null } = {}) => (session && session._browserKey ? runner.cardsFor(session._browserKey) : []));
  const app = express(); app.use(express.json());
  RTmod.setup({ keeper, activeSessions: active, dialogs, browserEnv: () => null, tasksForSession: () => [], persistPin: () => {}, notice: () => {},
    proposals: { filed: (r) => runner.filed(r), approve: (id, o) => runner.approve(id, o), reject: (id, o) => runner.reject(id, o), rejectionFor: (q) => runner.rejectionFor(q) },
    siteResets: { propose: ({ f, t, host, url }) => runner.fileSiteReset({ profileId: t.profileId, host, url, browserKey: f.browserKey, sessionId: f.sessionId }) } });
  app.use(RTmod.router);
  return { dialogs, todos, ladder, broadcasts, runner, app };
}
let W = mkWorld();
let srv = await new Promise((r) => { const s = W.app.listen(0, '127.0.0.1', () => r(s)); });
servers.add(srv);
let API = `http://127.0.0.1:${srv.address().port}`;
const j = async (method, p, body, headers = {}) => { const res = await fetch(API + p, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined }); let json = null; try { json = await res.json(); } catch { } return { status: res.status, json }; };
const as = (s) => ({ Authorization: 'Bearer ' + s.agentToken });
const PASSWD = path.join(ROOT, 'passwd.cjs'); fs.writeFileSync(PASSWD, `const os = require('os'); const real = os.userInfo; os.userInfo = (o) => ({ ...real(o), homedir: ${JSON.stringify(HOME)} });\n`);
function cli(s, args, { bin = path.join(REPO, 'data/bin/vibespace-browser'), timeoutMs = 30000 } = {}) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const c = spawn(process.execPath, ['--require', PASSWD, bin, ...args], { env: { HOME, PATH: PATH_ENV, FAKE_AB_STATE: AB, FAKE_AB_CDP_PORT: String(chrome.port), VIBESPACE_API: API, VIBESPACE_SESSION_TOKEN: s.agentToken, VIBESPACE_SESSION_CWD: ROOT }, cwd: ROOT });
    let out = '', err = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; });
    const t = setTimeout(() => c.kill('SIGKILL'), timeoutMs);
    c.on('exit', (code) => { clearTimeout(t); resolve({ code, out, err, ms: Date.now() - t0 }); });
  });
}

// the profiles: OWN = only conversation A may use it (nobody else holds it); SHARED = every conversation (A and B hold it)
const own = keeper.createProfile({ label: 'Bank own' }, { owner: { kind: 'only', who: [{ kind: 'session', id: sA._browserKey }] } });
const shared = keeper.createProfile({ label: 'Bank shared' }, { owner: { kind: 'instance', id: null } });
await keeper.attach({ profileId: own.id, browserKey: sA._browserKey, sessionId: 'sess-a', by: 'user' });
const OWNP = new URL(keeper.browserOf(own.id).cdpUrl).pathname;
chrome.addTab(OWNP, 'T1', 'https://app.bank.test/home');
const LOOP = FIX.shapes.pendingLogin300ms;
const HEAD = 'The page keeps navigating by itself and will not settle — ';

try {
  // ═══ ① THE LOOP through the watch ═══
  console.log('— ① the measured loop replayed on a tab: the verb in flight is answered BY THE EVENT');
  await j('POST', '/api/agent/browser/resolve', { handle: '', argv: ['open', 'https://app.bank.test/'], wrapper: true }, as(sA)); // arms the watch (a /resolve's own act)
  ok(W.dialogs.stats().some((x) => x.profileId === own.id && x.state === 'open' && x.tabs >= 1), 'the /resolve armed the watch on the conversation\'s browser (one socket, every tab)', W.dialogs.stats());
  let seventh = 0, n = 0;
  const poll = j('GET', `/api/agent/browser/dialog?profile=${own.id}&wait=15000&loop=1&after=0`, undefined, as(sA)).then((r) => ({ ...r, at: Date.now() }));
  const rp = chrome.replay(OWNP, 'T1', LOOP, { onCommit: () => { n++; if (n === 7) seventh = Date.now(); } });
  const pr = await poll;
  ok(pr.status === 200 && pr.json.loop && pr.json.via === 'event' && pr.json.loop.urls.length === 2 && pr.json.loop.hops === 6 && /^The page keeps navigating by itself/.test(pr.json.loop.text), 'the long-poll of a verb in flight (loop=1) is answered by the loop — the cycle, the hops, THE sentence', pr.json);
  ok(seventh > 0 && pr.at - seventh >= 0 && pr.at - seventh < 300, `…by the event: ${pr.at - seventh} ms after the 7th commit (the 6th page hop) — never a clock`, { at: pr.at, seventh });
  const nav = await j('GET', `/api/agent/browser/dialog?profile=${own.id}&wait=300&loop=1&after=${Date.now()}`, undefined, as(sA));
  ok(nav.status === 200 && !nav.json.loop, 'a NAVIGATION verb (after = its own start) is not woken by the loop that stood before it', nav.json);
  const fct = keeper.factFor({ browserKey: sA._browserKey, sessionId: 'sess-a', variant: 'D', remote: false, active: null });
  ok(fct && fct.stuck && fct.stuck.state === 'loop' && fct.stuck.loop.urls.every((u) => !/[?#]/.test(u)), 'the conversation\'s browser fact carries the loop (the chip, the live view)', fct && fct.stuck);
  await rp;

  // the live view's banner (src/lib/browser-loop-banner.js over a minimal document): the cycle's addresses, KEYED, patched in place
  {
    const { pathToFileURL } = await import('node:url');
    const LB = await import(pathToFileURL(path.join(REPO, 'src/lib/browser-loop-banner.js')).href);
    class Nd { constructor(tag) { this.tagName = tag; this.children = []; this._t = ''; this.className = ''; this.style = {}; this.attrs = {}; this.writes = 0; } appendChild(n) { this.children.push(n); n.parent = this; return n; } remove() { const p = this.parent; if (p) p.children.splice(p.children.indexOf(this), 1); } setAttribute(k, v) { this.attrs[k] = v; } set textContent(v) { this.writes++; this.children = []; this._t = String(v); } get textContent() { return this._t + this.children.map((c) => c.textContent).join(''); } set innerHTML(v) { throw new Error('innerHTML: ' + v); } }
    const doc = { createElement: (t) => new Nd(t) };
    const bn = LB.createLoopBanner(doc);
    const loop = pr.json.loop;
    bn.render(loop, null);
    const lis0 = [...bn.parts.cycle.children];
    const w0 = bn.parts.line.writes;
    ok(bn.el.style.display === '' && lis0.length === 2 && lis0.map((x) => x.textContent).join(' ') === loop.urls.join(' ') && / ↔ /.test(bn.parts.line.textContent) && bn.parts.title.textContent === 'Navigation loop', 'the live view\'s banner shows the loop with its cycle — one row per address (textContent only)', { line: bn.parts.line.textContent, rows: lis0.map((x) => x.textContent) });
    bn.render({ ...loop, hops: loop.hops + 5, sinceMs: loop.sinceMs + 4000 }, null);
    ok([...bn.parts.cycle.children].every((x, i) => x === lis0[i]) && bn.parts.line.writes === w0 && lis0.every((x) => x.writes === 1), 'a fact push with the same cycle PATCHES in place — the same row elements, the line not rewritten (never a rebuilt banner under the pointer)');
    bn.render({ ...loop, urls: [loop.urls[0]] }, null);
    ok(bn.parts.cycle.children.length === 1 && bn.parts.cycle.children[0] === lis0[0] && /keeps reloading/.test(bn.parts.line.textContent), '…a shorter cycle drops the extra row only');
    bn.render(null, null);
    ok(bn.el.style.display === 'none', '…and the banner hides when the loop is over');
  }

  // ═══ ② the CLI while it stands ═══
  console.log('— ② the CLI: a page-waiting verb answers the loop at once; the ways out go direct');
  const opens0 = fake.opens().length;
  let r = await cli(sA, ['snapshot']);
  ok(r.code === 1 && r.out.startsWith(HEAD) && /\[navigation_loop\]/.test(r.err) && !/unknown verb/.test(r.out + r.err) && fake.opens().length === opens0, '`snapshot` while it loops ⇒ [navigation_loop], THE sentence first, the browser CLI never spawned for it', r);
  r = await cli(sA, ['--json', 'click', '@e1']);
  let jr = null; try { jr = JSON.parse(r.out); } catch { jr = null; }
  ok(r.code === 1 && jr && jr.code === 'navigation_loop' && jr.loop && jr.loop.urls.length === 2 && jr.error.startsWith(HEAD), '--json: ONE object {code: navigation_loop, loop, error: the sentence}', r.out);
  const calls0 = chrome.of(OWNP).calls.length;
  r = await cli(sA, ['screenshot', path.join(ROOT, 'loop.png')]);
  const shotCall = chrome.of(OWNP).calls.slice(calls0).find((c) => c.method === 'Page.captureScreenshot');
  ok(r.code === 0 && fs.existsSync(path.join(ROOT, 'loop.png')) && fs.readFileSync(path.join(ROOT, 'loop.png'), 'utf8') === 'fake-png-T1' && shotCall && shotCall.targetId === 'T1' && /\[navigation_loop\]/.test(r.err), '`screenshot` while it loops goes DIRECT (a capture on the looping tab through VibeSpace\'s socket) — the file written where the agent asked; the loop said beside it', r);
  chrome.of(OWNP).shotHang = true;
  r = await cli(sA, ['screenshot', path.join(ROOT, 'loop2.png')]);
  ok(r.code === 1 && /\[no_picture\]/.test(r.err) && /^no picture: the page never drew a frame within 4 s/.test(r.out) && r.ms < 800 + 2500 && !fs.existsSync(path.join(ROOT, 'loop2.png')), `a page that never draws: [no_picture] by name in ${r.ms} ms (the capture bounded — never the browser CLI's 30 s)`, r);
  chrome.of(OWNP).shotHang = false;
  r = await cli(sA, ['stop']);
  const stopCall = chrome.of(OWNP).calls.find((c) => c.method === 'Page.stopLoading');
  ok(r.code === 0 && /^stopped the page \(it was in a navigation loop\) — "T T1" — https:\/\/app\.bank\.test|^stopped the page \(it was in a navigation loop\)/.test(r.out) && stopCall && stopCall.targetId === 'T1' && r.ms < 5000, '`stop` ⇒ Page.stopLoading on the looping tab\'s own session (direct), "stopped the page (it was in a navigation loop)"', r);
  const f2 = keeper.factFor({ browserKey: sA._browserKey, sessionId: 'sess-a', variant: 'D', remote: false, active: null });
  ok(!(f2 && f2.stuck), '…and the loop is over at once (the stop marker ends the run)', f2 && f2.stuck);
  r = await cli(sA, ['stop']);
  ok(r.code === 0 && /^nothing of yours was loading — no page was stopped\./.test(r.out), '`stop` with nothing loading says so (no act)', r);
  // verify r4 #5 (LOW, seen twice on the real 0.38.1): Chrome's "Not attached to an active page" to a Page.stopLoading on a page
  // mid-swap made `stop` fail outright (stop_failed) — a transient; the watch asks again briefly, a refusal that stands is still said
  {
    await chrome.replay(OWNP, 'T1', LOOP, { speed: 32 });
    chrome.of(OWNP).stopRefuse = 2;
    const n0 = chrome.of(OWNP).calls.filter((c) => c.method === 'Page.stopLoading').length;
    r = await cli(sA, ['stop']);
    const asked = chrome.of(OWNP).calls.filter((c) => c.method === 'Page.stopLoading').length - n0;
    ok(r.code === 0 && /^stopped the page \(it was in a navigation loop\)/.test(r.out) && asked === 3, `verify r4 #5: a stop Chrome refuses twice as "Not attached to an active page" is asked again and lands (${asked} asks; before: stop_failed at the first)`, { r, asked });
    await chrome.replay(OWNP, 'T1', LOOP, { speed: 32 });
    chrome.of(OWNP).stopRefuse = 99;
    r = await cli(sA, ['stop']);
    ok(r.code === 1 && /Not attached to an active page \[stop_failed\]/.test(r.err) && chrome.of(OWNP).stopRefuse === 99 - 4, 'verify r4 #5: …a refusal that stands through the retries is still said by name (4 asks, ≤ 0.5 s)', { r, left: chrome.of(OWNP).stopRefuse });
    chrome.of(OWNP).stopRefuse = 0;
    const dsrc5 = fs.readFileSync(path.join(REPO, 'src/server/browser-dialogs.js'), 'utf8');
    const n5 = "      if (!(r && r.error && /not attached to an active page/i.test(String(r.error.message || '')))) break;";
    ok(dsrc5.includes(n5), 'control setup: the retry rule is found in src/server/browser-dialogs.js');
    const D5 = MUT.load('src/server/browser-dialogs.js', dsrc5.replace(n5, '      break;'), 'r4-no-stop-retry');
    const d5 = D5.create({ keeper, log: quiet, holdersOf, leaseCountOf: (pid) => new Set(holdersOf(pid).map((h) => h.browserKey)).size }); // a bare patched watch over the same keeper (never a rebuilt world: the routes stay on W)
    await d5.arm(own.id);
    await chrome.replay(OWNP, 'T1', LOOP, { speed: 32 });
    chrome.of(OWNP).stopRefuse = 1;
    const st5 = await d5.stopTab({ profileId: own.id, browserKey: sA._browserKey, sessionId: 'sess-a', ephemeral: true });
    ok(st5.ok === false && st5.code === 'stop_failed', 'CONTROL: a watch that never asks again fails the stop at Chrome\'s first transient refusal — the row above reddens on it', st5);
    chrome.of(OWNP).stopRefuse = 0; d5.shutdown();
    await j('POST', '/api/agent/browser/direct', { profile: own.id, action: 'stop' }, as(sA));
  }
  await chrome.replay(OWNP, 'T1', LOOP);
  r = await cli(sA, ['tab', 'close']);
  const closeCalls = chrome.of(OWNP).calls.filter((c) => c.method === 'Target.closeTarget' || c.method === 'Target.createTarget');
  ok(r.code === 0 && /^closed the looping tab/.test(r.out) && /It was the browser's only tab, so a blank one was opened in its place/.test(r.out) && closeCalls.map((c) => c.method).join() === 'Target.createTarget,Target.closeTarget' && closeCalls[1].params.targetId === 'T1', 'a bare `tab close` while it loops goes DIRECT: a blank tab first (it was the only one), then Target.closeTarget on the looping tab', { r, closeCalls });
  chrome.addTab(OWNP, 'T2', 'https://app.bank.test/home');
  await sleep(100);
  // the agent MOVED ON (another tab of its appeared after the loop began): a bare `tab close` / a `screenshot` are its
  // current tab's again — the browser CLI's own verbs (the direct route answers no_loop), never the looping tab by surprise
  await chrome.replay(OWNP, 'T2', LOOP);
  chrome.addTab(OWNP, 'T3', 'https://elsewhere.test/'); await sleep(80);
  r = await j('POST', '/api/agent/browser/direct', { profile: own.id, action: 'close' }, as(sA));
  const r2 = await j('POST', '/api/agent/browser/direct', { profile: own.id, action: 'screenshot' }, as(sA));
  const rs2 = await j('POST', '/api/agent/browser/resolve', { handle: own.id, argv: ['snapshot'], wrapper: true }, as(sA));
  const f3 = keeper.factFor({ browserKey: sA._browserKey, sessionId: 'sess-a', variant: 'D', remote: false, active: null });
  ok(rs2.status === 200 && rs2.json.dialog && rs2.json.dialog.loop === null && f3 && f3.stuck && f3.stuck.state === 'loop', 'the agent moved on to another tab ⇒ its verbs are that tab\'s (the resolve carries no loop — a snapshot runs), while the chip / live view still show the looping tab', { d: rs2.json && rs2.json.dialog, f: f3 && f3.stuck });
  await j('POST', '/api/agent/browser/audit', { profile: own.id, verb: 'snapshot', ok: true }, as(sA));
  const st2 = await j('POST', '/api/agent/browser/direct', { profile: own.id, action: 'stop' }, as(sA));
  ok(r.status === 409 && r.json.code === 'no_loop' && r2.status === 409 && r2.json.code === 'no_loop' && chrome.of(OWNP).targets.has('T2') && st2.status === 200 && /^stopped the page \(it was in a navigation loop\)/.test(st2.json.text), 'the agent moved on to another tab ⇒ `tab close` / `screenshot` are its current tab\'s again (no_loop: the browser CLI\'s own verbs) — the looping tab is never closed by surprise; `stop` still stops the loop', { r: r.json, r2: r2.json, st2: st2.json });
  chrome.removeTab(OWNP, 'T3'); await sleep(80);
  // verify r4 #4 (reproduced on the real 0.38.1): a READABLE loop (its pages load between hops — a dashboard refreshing itself)
  // had every reading verb refused with the loop sentence. Now a reading verb RUNS (the browser CLI spawned) with the loop
  // told beside its answer; an acting verb is still answered with the loop at once
  {
    await sleep(330); // the quiet rule (300 ms here) ends T2's replayed loop
    const hop = async (tid, url) => { chrome.pageEvent(OWNP, tid, 'Page.frameRequestedNavigation', { frameId: tid, reason: 'metaTagRefresh', url, disposition: 'currentTab' }); chrome.pageEvent(OWNP, tid, 'Page.frameStartedNavigating', { frameId: tid, url, navigationType: 'differentDocument', loaderId: 'L' }); chrome.pageEvent(OWNP, tid, 'Page.frameNavigated', { frame: { id: tid, url, loaderId: 'L' } }); await sleep(8); chrome.pageEvent(OWNP, tid, 'Page.frameStoppedLoading', { frameId: tid }); await sleep(20); };
    for (let i = 0; i < 7; i++) await hop('T2', 'https://ops.test/dash');
    const fr = keeper.factFor({ browserKey: sA._browserKey, sessionId: 'sess-a', variant: 'D', remote: false, active: null });
    ok(fr && fr.stuck && fr.stuck.state === 'loop' && fr.stuck.loop && fr.stuck.loop.readable === true, 'setup: a loop whose pages load (a dashboard refreshing itself) stands on the conversation\'s tab — readable', fr && fr.stuck);
    r = await cli(sA, ['snapshot']);
    ok(r.code !== 0 && /unknown verb[^\n]*snapshot/.test(r.out + r.err) && /\[navigation_loop\]/.test(r.err) && !r.out.startsWith(HEAD), 'verify r4 #4: `snapshot` on a READABLE loop RUNS (the browser CLI spawned — the fake answers it as unknown) and the loop is told beside its answer, never instead of it', r);
    r = await cli(sA, ['click', '@e1']);
    ok(r.code === 1 && r.out.startsWith(HEAD) && /\[navigation_loop\]/.test(r.err), 'verify r4 #4: …while an ACTING verb is still answered with the loop at once (it would wait for the page to settle)', r);
    await j('POST', '/api/agent/browser/direct', { profile: own.id, action: 'stop' }, as(sA));
    await sleep(100);
  }

  // ═══ ③ site-reset in the conversation's OWN browser ═══
  console.log('— ③ `site-reset` in the conversation\'s own browser: exactly the site\'s cookies and storage');
  const jarA = () => chrome.of(OWNP).jar;
  chrome.of(OWNP).jar = [
    { name: 'sess', value: 'x', domain: 'app.bank.test', path: '/', secure: true },
    { name: 'sso', value: 'x', domain: '.bank.test', path: '/', secure: true },
    { name: 'pref', value: 'x', domain: 'login.bank.test', path: '/', secure: true },
    { name: 'other', value: 'x', domain: '.other.test', path: '/', secure: true },
    { name: 'mail', value: 'x', domain: 'mail.example.test', path: '/', secure: true },
  ];
  r = await j('POST', '/api/agent/browser/site-reset', { profile: own.id, host: 'other.test' }, as(sA));
  ok(r.status === 409 && r.json.code === 'host_not_current' && /site-reset --host other\.test/.test(r.json.remedy) && jarA().length === 5, 'a host none of its tabs is on ⇒ host_not_current, the explicit `--host` named — nothing cleared', r.json);
  r = await j('POST', '/api/agent/browser/site-reset', { profile: own.id, host: 'bad host;' }, as(sA));
  ok(r.status === 400 && r.json.code === 'bad-host', 'a word that is not a host ⇒ bad-host', r.json);
  r = await j('POST', '/api/agent/browser/site-reset', { profile: null, host: 'app.bank.test' }, as(sR));
  ok(r.status === 409 && r.json.code === 'remote_session', 'a conversation on another machine ⇒ remote_session (its browser is that machine\'s)', r.json);
  const calls1 = chrome.of(OWNP).calls.length;
  r = await cli(sA, ['site-reset', 'app.bank.test']);
  const cc = chrome.of(OWNP).calls.slice(calls1);
  const dels = cc.filter((c) => c.method === 'Network.deleteCookies');
  const clears = cc.filter((c) => c.method === 'Storage.clearDataForOrigin');
  ok(r.code === 0 && /^cleared app\.bank\.test's stored login: 2 cookies \(app\.bank\.test: 1, \.bank\.test: 1\)/.test(r.out) && /HTTP cache is shared by every site and was left/.test(r.out), 'the agent\'s `site-reset app.bank.test` answers what it cleared: 2 cookies, named by domain; the HTTP cache said to be left', r);
  ok(jarA().map((c) => c.name).sort().join() === 'mail,other,pref' && dels.length === 2 && dels.every((c) => c.sessionId), 'EXACTLY the cookies the host receives went (its host-only one + the parent domain\'s), each on a page\'s session — a sibling\'s host-only cookie, another site\'s, untouched', { jar: jarA(), dels });
  ok(clears.length >= 2 && clears.every((c) => c.sessionId && /local_storage/.test(c.params.storageTypes) && !/cookies/.test(c.params.storageTypes)) && clears.some((c) => c.params.origin === 'https://app.bank.test'), 'its origins\' storage cleared ON A PAGE\'S SESSION (the browser endpoint answers Internal error — measured)', clears);
  ok(cc.some((c) => c.method === 'DOMStorage.clear' && c.targetId === 'T2' && c.params.storageId.securityOrigin === 'https://app.bank.test' && c.params.storageId.isLocalStorage === false) && !cc.some((c) => /clearBrowserCookies|Storage\.clearCookies/.test(c.method)), 'session storage of its open tab at that origin; never a whole-browser clear', cc.map((c) => c.method));

  // ═══ ④ a SHARED profile: ONE proposal, the user's Approve ═══
  console.log('— ④ a shared profile: `site-reset` files ONE proposal; the user\'s Approve runs exactly the frozen pair');
  await keeper.attach({ profileId: shared.id, browserKey: sA._browserKey, sessionId: 'sess-a', by: 'user' });
  await keeper.attach({ profileId: shared.id, browserKey: sB._browserKey, sessionId: 'sess-b', by: 'user' });
  keeper.tell(sA._browserKey); keeper.tell(sB._browserKey); // what each was told of its set (the one-time profile_changed is §3.8's own suite)
  const SHP = new URL(keeper.browserOf(shared.id).cdpUrl).pathname;
  chrome.addTab(SHP, 'S1', 'https://app.bank.test/login');
  chrome.of(SHP).jar = [{ name: 'sess', value: 'old', domain: 'app.bank.test', path: '/', secure: true }, { name: 'keep', value: 'x', domain: 'mail.example.test', path: '/', secure: true }];
  r = await cli(sA, ['--profile', shared.id, 'site-reset', '--host', 'app.bank.test']);
  const pid = (/\(proposal (sr-[0-9a-f]{8})\)/.exec(r.out) || [])[1];
  const e0 = pid ? keeper.proposalEntry(pid) : null;
  ok(r.code === 0 && pid && e0 && e0.proposal.kind === 'site-reset' && e0.proposal.state === 'open' && e0.proposal.holders === 2 && e0.proposal.site === 'app.bank.test' && e0.proposal.profileId === shared.id && /Tell the user in ONE sentence that the card waits — then stop: do NOT clear it another way/.test(r.out), 'on a shared profile the verb files ONE proposal (2 conversations named) and tells the agent to say so and stop', { out: r.out, err: r.err, p: e0 && e0.proposal });
  ok(chrome.of(SHP).jar.length === 2, '…and clears NOTHING itself');
  const ops0 = cardOps('sess-a', pid);
  const card0 = ops0[0] && ops0[0].message && ops0[0].message.content[0];
  const L = SW.proposalLines(card0 || {});
  ok(ops0.length === 1 && ops0[0].op === 'create' && card0.type === 'browser_proposal' && card0.kind === 'site-reset' && card0.digest === e0.proposal.digest && SW.lineText(L.claim) === 'The agent proposes clearing app.bank.test\'s login and stored data in the profile "Bank shared".' && L.plan.map(SW.lineText).includes('Every conversation using this profile (2) will be signed out of app.bank.test — and so will you when you browse in it.'), 'ONE card op in the chat: the owner\'s words (what, where, who is signed out), the digest of every word it prints', { card0, words: [L.claim, ...L.plan].map(SW.lineText) });
  const item = W.todos.get(e0.proposal.itemId || keeper.proposalEntry(pid).proposal.itemId || '');
  ok(item && item.origin === 'browser' && item.action.type === 'browser-proposal' && item.action.id === pid && item.action.shown === e0.proposal.digest && item.i18n.detail.length === 1 + L.plan.length, 'ONE For-you item: the same words line for line, its Approve names the proposal + the digest', item);
  r = await cli(sA, ['--profile', shared.id, 'site-reset', '--host', 'app.bank.test']);
  ok(r.code === 0 && new RegExp(`the same card still waits for the user \\(proposal ${pid}`).test(r.out) && cardOps('sess-a', pid).length === 1, 'asking again while it stands: the SAME card (no second op, no second item)', r.out);
  for (const [m, p] of [['POST', `/api/browser/proposals/${pid}/approve`], ['POST', `/api/browser/proposals/${pid}/reject`], ['GET', `/api/browser/proposals/${pid}`]]) {
    const x = await j(m, p, m === 'POST' ? { shown: e0.proposal.digest } : undefined, as(sA));
    ok(x.status === 403 && x.json.code === 'agent_forbidden', `${m} ${p.replace(pid, ':id')} with an agent's bearer ⇒ 403 agent_forbidden`, x);
  }
  r = await j('POST', `/api/browser/proposals/${pid}/approve`, { shown: 'pd-00000000' });
  ok(r.status === 409 && r.json.code === 'proposal_changed' && keeper.proposalEntry(pid).proposal.state === 'open', 'an Approve naming another card\'s digest ⇒ 409 proposal_changed, nothing ran', r.json);
  r = await j('POST', `/api/browser/proposals/${pid}/approve`, {});
  ok(r.status === 400 && r.json.code === 'shown_required', 'an Approve naming no card ⇒ 400 shown_required');
  // the browser does not run when the user presses Approve: the clearer starts it (said on the card), then clears
  // verify r3 #2: a persisted witness (a tab the watch attributed to a lease) dies with the browser — the stop prunes it
  const prunedBefore = keeper.noteOwnTab(shared.id, sB._browserKey, 'PRUNE1') && keeper.holderTabs(shared.id, sB._browserKey).includes('PRUNE1');
  await keeper.stop(shared.id, { why: 'test: stopped before the Approve' }).catch(() => {});
  ok(prunedBefore && !keeper.holderTabs(shared.id, sB._browserKey).includes('PRUNE1') && keeper.noteOwnTab(own.id, sA._browserKey, 'X') === true && keeper.noteOwnTab(shared.id, 'bk-nobody', 'X') === false, 'verify r3 #2: a witnessed tab written on a lease (noteOwnTab) is dropped when its browser STOPS; a key with no lease records nothing', { prunedBefore, after: keeper.holderTabs(shared.id, sB._browserKey) });
  keeper.forgetOwnTab(own.id, sA._browserKey, 'X');
  await W.dialogs.disarm(shared.id);
  r = await j('POST', `/api/browser/proposals/${pid}/approve`, { shown: e0.proposal.digest });
  const SHP2 = await until(() => { const b = keeper.browserOf(shared.id); return b && b.state === 'ready' && b.cdpUrl ? new URL(b.cdpUrl).pathname : null; }, 5000);
  if (SHP2 && SHP2 !== SHP) { chrome.addTab(SHP2, 'S1', 'https://app.bank.test/login'); chrome.of(SHP2).jar = chrome.of(SHP).jar; }
  const done = await until(() => { const e = keeper.proposalEntry(pid); return e && ['done', 'failed'].includes(e.proposal.state) ? e : null; }, 8000);
  const jarS = chrome.of(SHP2 || SHP).jar;
  ok(r.status === 200 && done && done.proposal.state === 'done' && done.proposal.outcome.code === 'cleared' && done.proposal.outcome.cookies === 1 && jarS.map((c) => c.name).join() === 'keep', 'the user\'s Approve ran EXACTLY the frozen pair: app.bank.test\'s cookie gone from "Bank shared", another site\'s kept', { r: r.json, p: done && done.proposal, jarS });
  const opsP = cardOps('sess-a', pid);
  ok(opsP.filter((o) => o.op === 'create').length === 1 && opsP.slice(1).every((o) => o.op === 'edit' && Object.keys(o.fields).join() === 'content') && opsP.some((o) => o.op === 'edit' && o.fields.content[0].progress && o.fields.content[0].progress.step === 'start') && opsP.at(-1).fields.content[0].state === 'done', 'THE CARD: created once, every change an in-place edit — "starting the browser" (it did not run), then done', opsP.map((o) => o.op + ':' + (o.fields ? o.fields.content[0].state + '/' + (o.fields.content[0].progress ? o.fields.content[0].progress.step : '') : '')));
  const tellCall = W.ladder.calls.find((c) => /^Approved: app\.bank\.test's stored login was cleared in the profile "Bank shared" \(1 cookie/.test(c.text));
  ok(tellCall && tellCall.opts.noWake === true && tellCall.cid === sA.claudeSessionId && W.ladder.stash.some((s) => /stored login was cleared/.test(s.text)), 'the agent told for free (noWake — its next turn), never a wake', { calls: W.ladder.calls.map((c) => c.text.slice(0, 80)), stash: W.ladder.stash.length });
  ok(W.broadcasts.some((m) => m.type === 'browser-site-reset' && m.profileId === shared.id && m.host === 'app.bank.test' && m.cookies === 1), 'the holders\' live views get ONE notice (browser-site-reset for this profile)', W.broadcasts.map((m) => m.type));
  ok(W.todos.get(item.id).status === 'done', 'the For-you item is answered');

  // ═══ ⑤ Reject; a stale card ═══
  console.log('— ⑤ Reject is said once at the next navigation; more holders than the card said runs nothing');
  await sleep(300); // A goes quiet: B may drive the shared browser now
  r = await cli(sB, ['--profile', shared.id, 'site-reset', '--host', 'app.bank.test']);
  const pid2 = (/\(proposal (sr-[0-9a-f]{8})\)/.exec(r.out) || [])[1];
  ok(!!pid2, 'the other conversation on the shared profile asks too: its own card', r);
  r = await j('POST', `/api/browser/proposals/${pid2}/reject`, {});
  ok(r.status === 200 && keeper.proposalEntry(pid2).proposal.state === 'rejected', 'the user\'s Reject', r.json);
  let au = await j('POST', '/api/agent/browser/audit', { verb: 'open', ok: true, profile: shared.id, url: 'https://app.bank.test/login' }, as(sB));
  ok(au.status === 200 && au.json.proposalRejected && /^the user rejected clearing app\.bank\.test's stored login in the profile "Bank shared"/.test(au.json.proposalRejected.text), 'the agent hears it at its next navigation to the host', au.json);
  au = await j('POST', '/api/agent/browser/audit', { verb: 'open', ok: true, profile: shared.id, url: 'https://app.bank.test/login' }, as(sB));
  ok(au.status === 200 && !au.json.proposalRejected, '…once');
  chrome.of(SHP2 || SHP).jar.push({ name: 'sess', value: 'again', domain: 'app.bank.test', path: '/', secure: true });
  r = await cli(sB, ['--profile', shared.id, 'site-reset', '--host', 'app.bank.test']);
  const pid3 = (/\(proposal (sr-[0-9a-f]{8})\)/.exec(r.out) || [])[1];
  ok(pid3 && pid3 !== pid2, 'after a told rejection the next ask is a NEW card', r.out);
  await keeper.attach({ profileId: shared.id, browserKey: sC._browserKey, sessionId: 'sess-c', by: 'user' });
  keeper.tell(sC._browserKey);
  const e3 = keeper.proposalEntry(pid3);
  r = await j('POST', `/api/browser/proposals/${pid3}/approve`, { shown: e3.proposal.digest });
  const d3 = await until(() => { const e = keeper.proposalEntry(pid3); return e && ['done', 'failed'].includes(e.proposal.state) ? e : null; }, 5000);
  ok(d3 && d3.proposal.state === 'failed' && d3.proposal.outcome.code === 'proposal_stale' && /3 conversations use "Bank shared" now — this card said 2; nothing was cleared/.test(d3.proposal.outcome.error) && chrome.of(SHP2 || SHP).jar.some((c) => c.value === 'again'), 'a third conversation joined before the press ⇒ proposal_stale, NOTHING cleared (the card never named it)', d3 && d3.proposal);

  // ═══ ⑤b verify r1: a SHARED browser nobody's live view shows — no stranger's tab is acted on, nothing of theirs is read ═══
  console.log('— ⑤b verify r1: on a shared browser with no live view open, a conversation acts on NO tab it cannot prove its own');
  {
    const SP = SHP2 || SHP;
    chrome.addTab(SP, 'S9', 'https://app.bank.test/login'); await sleep(80);
    await j('POST', '/api/agent/browser/resolve', { handle: shared.id, argv: ['snapshot'], wrapper: true }, as(sA)); // arms the watch
    await chrome.replay(SP, 'S9', LOOP, { speed: 32 });
    const stops0 = chrome.of(SP).calls.filter((c) => c.method === 'Page.stopLoading').length;
    r = await j('POST', '/api/agent/browser/direct', { profile: shared.id, action: 'stop' }, as(sB));
    ok(r.status === 409 && r.json.code === 'not_watched' && r.json.why === 'unattributed' && /does not know which tab of this shared browser is yours/.test(r.json.error) && /tab close/.test(r.json.remedy) && chrome.of(SP).calls.filter((c) => c.method === 'Page.stopLoading').length === stops0, 'conversation B\'s `stop` on the shared browser (nobody\'s live view open, no tab pinned): REFUSED by name with the way out — Page.stopLoading never sent to the looping tab (before: it stopped whatever looped or loaded, another conversation\'s page or the user\'s own)', r.json);
    r = await j('POST', '/api/agent/browser/site-reset', { profile: shared.id, host: 'app.bank.test' }, as(sA));
    ok(r.status === 409 && r.json.code === 'host_not_current' && /could not read your current tab's address/.test(r.json.error) && !/\(app\.bank\.test\)/.test(r.json.error) && /--host app\.bank\.test/.test(r.json.remedy), 'the bare `site-reset <host>` there: the current-tab check reads NO stranger\'s address (before: every tab of the browser was "yours") — refused with the --host way', r.json);
    const fA = W.dialogs.factFor({ profileId: shared.id, browserKey: sA._browserKey, sessionId: 'sess-a', ephemeral: false, consume: false });
    ok(fA.unattributed === true && fA.loop === null && fA.loopAny === null && fA.loopShared === true, 'the loop on the unattributed tab is nobody\'s fact (a page\'s addresses are its content — never another conversation\'s) — but THAT a tab of the browser loops is said (`loopShared`, a kind only)', { u: fA.unattributed, l: fA.loop, s: fA.loopShared });
    // verify r1 (the silent incident): a verb of A that TIMED OUT there is told, without an address, with the way out
    const auA = await j('POST', '/api/agent/browser/audit', { profile: shared.id, verb: 'snapshot', ok: false, timedOut: true }, as(sA));
    ok(auA.status === 200 && auA.json.dialog && auA.json.dialog.loopShared === true && auA.json.dialog.loop === null && !/bank\.test/.test(JSON.stringify(auA.json.dialog)), 'the audit of a timed-out verb on the unattributed shared browser says `loopShared` and carries NO address', auA.json.dialog);
    const cliSrc = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-browser'), 'utf8');
    ok(/after\.loopShared && !after\.loop && \(code !== 0 \|\| timedOut\)[^\n]*DS\.loopSharedText\(\)\} \[navigation_loop_shared\]/.test(cliSrc) && /cannot tell whether it is yours/.test(ST.loopSharedText()) && /tab close/.test(ST.loopSharedText()) && /site-reset --host <host>/.test(ST.loopSharedText()) && !/https?:/.test(ST.loopSharedText()), 'the CLI prints THE sentence (no address; `tab close`, `tab new`, `site-reset --host`) on a failed or timed-out verb there [navigation_loop_shared]');
    // attribution from the keeper's own knowledge (the production wiring unions it with a live view's active target)
    const ht = keeper.holderTabs(shared.id, sA._browserKey);
    const leaseA = keeper.leasesFor(sA._browserKey).find((l) => l.profileId === shared.id);
    ok(Array.isArray(ht) && ht.every((x) => typeof x === 'string') && (!leaseA || !leaseA.targetId || ht.includes(String(leaseA.targetId))) && keeper.holderTabs(shared.id, 'bk-nobody').length === 0, 'keeper.holderTabs: a holder\'s pinned tab (strings; nothing for an unknown key)', { ht, lease: leaseA && leaseA.targetId });
    // verify r2 (the revert table): the row above was vacuous without a pinned tab — pin one through the keeper's own re-open
    const pinned = await keeper.openInLease({ profileId: shared.id, browserKey: sB._browserKey, url: 'https://app.bank.test/pinned' });
    const htB = keeper.holderTabs(shared.id, sB._browserKey);
    W.dialogs.setTabsOf((q) => keeper.holderTabs(q && q.profileId, q && q.browserKey) || []); // the production wiring's shape (src/server/mounts-plugins-wiring.js)
    const scPin = W.dialogs.scopeFor({ profileId: shared.id, browserKey: sB._browserKey, sessionId: 'sess-b', ephemeral: false });
    W.dialogs.setTabsOf(null);
    ok(pinned.ok && pinned.targetId && htB.length === 1 && htB[0] === String(pinned.targetId) && scPin instanceof Set && scPin.has(String(pinned.targetId)) && !keeper.holderTabs(shared.id, sA._browserKey).includes(String(pinned.targetId)), 'verify r2: a lease\'s pinned tab (the keeper\'s own `tab new` under its session) is in holderTabs and in its scope — and in no other holder\'s', { pinned, htB, scope: [...(scPin || [])] });
    W.dialogs.setTabsOf((q) => (q.browserKey === sA._browserKey ? ['S9'] : []));
    r = await j('POST', '/api/agent/browser/direct', { profile: shared.id, action: 'stop' }, as(sB));
    const rA = await j('POST', '/api/agent/browser/direct', { profile: shared.id, action: 'stop' }, as(sA));
    ok(r.status === 409 && r.json.why === 'unattributed' && rA.status === 200 && /^stopped the page \(it was in a navigation loop\)/.test(rA.json.text) && chrome.of(SP).calls.filter((c) => c.method === 'Page.stopLoading').length === stops0 + 1, 'with the tab ATTRIBUTED to A (its live view / pinned tab / mediated lease): A\'s `stop` stops it, B\'s is still refused', { b: r.json, a: rA.json });
    W.dialogs.setTabsOf(null);
    chrome.removeTab(SP, 'S9'); await sleep(80);
    // verify r2 (reproduced on the real 0.38.1): the conversation's OWN tab — the one its `tab new` opened between its /resolve
    // and its /audit — was nobody's here, so its own loop was never its fact (its `snapshot` answered "(empty page)", its `stop`
    // was refused). THE CREATION WITNESS through the routes: A's verb in flight, a tab appears ⇒ A's; its loop cuts A's verb
    await j('POST', '/api/agent/browser/resolve', { handle: shared.id, argv: ['tab', 'new', 'https://app.bank.test/login'], wrapper: true }, as(sA));
    chrome.addTab(SP, 'S10', 'https://app.bank.test/login'); await sleep(80);
    await j('POST', '/api/agent/browser/audit', { profile: shared.id, verb: 'tab', ok: true }, as(sA));
    const scA = W.dialogs.scopeFor({ profileId: shared.id, browserKey: sA._browserKey, sessionId: 'sess-a', ephemeral: false }), scB = W.dialogs.scopeFor({ profileId: shared.id, browserKey: sB._browserKey, sessionId: 'sess-b', ephemeral: false });
    ok(scA instanceof Set && scA.has('S10') && scB instanceof Set && !scB.has('S10'), 'verify r2: a tab that appeared between A\'s /resolve and /audit (its `tab new`) is A\'s — in its scope, never B\'s', { a: [...(scA || [])], b: [...(scB || [])] });
    await j('POST', '/api/agent/browser/resolve', { handle: shared.id, argv: ['snapshot'], wrapper: true }, as(sA));
    const wake = fetch(API + `/api/agent/browser/dialog?profile=${shared.id}&wait=6000&loop=1&after=0`, { headers: as(sA) }).then((x) => x.json());
    await chrome.replay(SP, 'S10', LOOP, { speed: 32 });
    const wk = await wake;
    ok(wk && wk.loop && wk.via === 'event' && /pd\/|bank\.test/.test(JSON.stringify(wk.loop.urls)), 'verify r2: the loop on its witnessed tab WAKES its verb in flight (the long-poll answers at the event, never the 25 s timeout)', wk);
    const auW = await j('POST', '/api/agent/browser/audit', { profile: shared.id, verb: 'snapshot', ok: false, loop: 'cut' }, as(sA));
    ok(auW.json.dialog && auW.json.dialog.loop && auW.json.dialog.unattributed === false && auW.json.dialog.loopShared === false, 'verify r2: …and the audit names it as A\'s own loop (not `unattributed`, not `loopShared`)', auW.json.dialog);
    r = await j('POST', '/api/agent/browser/direct', { profile: shared.id, action: 'stop' }, as(sB));
    const rA2 = await j('POST', '/api/agent/browser/direct', { profile: shared.id, action: 'stop' }, as(sA));
    ok(r.status === 409 && r.json.why === 'unattributed' && rA2.status === 200 && /^stopped the page \(it was in a navigation loop\)/.test(rA2.json.text), 'verify r2: A\'s `stop` lands on its own tab; B\'s is still refused by name', { b: r.json, a: rA2.json });
    // a tab born AFTER A's audit (no verb of anybody in flight on this browser) is nobody's — the audit ends the witness window
    // on THIS browser (the route hands the profile to verbEnded; A's verbs on its own browser are no witness here)
    await j('POST', '/api/agent/browser/resolve', { handle: own.id, argv: ['snapshot'], wrapper: true }, as(sA));
    chrome.addTab(SP, 'S11', 'https://app.bank.test/late'); await sleep(80);
    await j('POST', '/api/agent/browser/audit', { profile: own.id, verb: 'snapshot', ok: true }, as(sA));
    const scA2 = W.dialogs.scopeFor({ profileId: shared.id, browserKey: sA._browserKey, sessionId: 'sess-a', ephemeral: false });
    ok(scA2 instanceof Set && !scA2.has('S11') && scA2.has('S10'), 'verify r2: a tab born after A\'s audit on the shared browser (A\'s verb then runs on its OWN browser) is nobody\'s — the witness window is per browser and ends at the audit', [...(scA2 || [])]);
    // verify r3 #2 (reproduced on the real 0.38.1): the witness lived in memory per watch — a VibeSpace restart mid-loop made A's
    // own tab nobody's again (`stop` refused `unattributed`, its loop `loopShared`; the user restarts on every Update). THE
    // PERSISTED WITNESS: the watch writes it on the lease record (`l.tabs`, the keeper's registry on disk); a keeper + watch
    // rebuilt from that disk attribute the tab at once, through the production wiring's `tabsOf` (holderTabs)
    const htA3 = keeper.holderTabs(shared.id, sA._browserKey), htB3 = keeper.holderTabs(shared.id, sB._browserKey);
    ok(htA3.includes('S10') && !htB3.includes('S10') && !htA3.includes('S11') && (keeper.list().leases.find((l) => l.profileId === shared.id && l.browserKey === sA._browserKey) || {}).tabs?.includes('S10'), 'verify r3 #2: the witnessed tab is WRITTEN on A\'s lease record (holderTabs names it; never on B\'s; a nobody\'s tab on neither)', { htA3, htB3 });
    const rebuilt = async (Kmod) => {
      const k2 = Kmod.create({ dataDir: DATA, homeDir: HOME, env: () => ({ PATH: PATH_ENV, HOME, FAKE_AB_STATE: AB, FAKE_AB_CDP_PORT: String(chrome.port) }), serverSetting: (k) => settings[k], liveKeys: () => new Set([...active.values()].map((s) => s._browserKey)), install: false, log: quiet, hostKnown: () => false, driveHoldMs: 200 });
      const h2 = (pid) => (k2.list().leases || []).filter((l) => l && l.profileId === pid && l.browserKey).map((l) => ({ browserKey: l.browserKey, sessionId: l.sessionId || null, ephemeral: !!l.ephemeral }));
      const d2 = D.create({ keeper: k2, log: quiet, holdersOf: h2, leaseCountOf: (pid) => new Set(h2(pid).map((h) => h.browserKey)).size, tabsOf: (q) => k2.holderTabs(q && q.profileId, q && q.browserKey) || [] });
      const armed = await d2.arm(shared.id);
      const sc = d2.scopeFor({ profileId: shared.id, browserKey: sA._browserKey, sessionId: 'sess-a', ephemeral: false });
      const ownB = d2.ownsTab({ profileId: shared.id, browserKey: sB._browserKey, sessionId: 'sess-b', ephemeral: false }, 'S10');
      await chrome.replay(SP, 'S10', LOOP, { speed: 32 }); // Chrome kept looping through the restart: the rebuilt watch records the hops afresh
      const fA = d2.factFor({ profileId: shared.id, browserKey: sA._browserKey, sessionId: 'sess-a', ephemeral: false, consume: false });
      const st = await d2.stopTab({ profileId: shared.id, browserKey: sA._browserKey, sessionId: 'sess-a', ephemeral: false });
      d2.shutdown(); k2.shutdown();
      return { armed: armed.ok, a: sc instanceof Set ? [...sc] : sc, ownB: ownB.code || 'ok', loop: !!(fA.loop && fA.loop.targetId === 'S10'), unattributed: fA.unattributed, loopShared: fA.loopShared, st: st.ok ? (st.targetId === 'S10' ? 'stopped' : 'nothing') : st.code + ':' + st.why };
    };
    const rb = await rebuilt(K);
    ok(rb.armed && rb.a.includes('S10') && rb.ownB === 'not_your_tab' && rb.loop && rb.unattributed === false && rb.loopShared === false && rb.st === 'stopped', 'verify r3 #2: a keeper + watch REBUILT FROM DISK (the restart) still hold A\'s tab as A\'s — in its scope, refused to B, its loop its own fact, its `stop` lands (before: nobody\'s — `stop` refused unattributed, the loop `loopShared`)', rb);
    const ksrc = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
    const kNeedle = '{ if (l.targetId) out.add(String(l.targetId)); for (const t of (Array.isArray(l.tabs) ? l.tabs : [])) if (t) out.add(String(t)); }';
    ok(ksrc.includes(kNeedle), 'control setup: the persisted witness read is found in src/server/browser-keeper.js holderTabs');
    const cb = await rebuilt(MUT.load('src/server/browser-keeper.js', ksrc.replace(kNeedle, '{ if (l.targetId) out.add(String(l.targetId)); }'), 'r3-no-persisted-witness'));
    ok(cb.armed && !cb.a.includes('S10') && cb.ownB === 'ok' && cb.loop === false && cb.st !== 'stopped', 'CONTROL: a keeper whose holderTabs reads no persisted witness leaves the rebuilt watch blind to A\'s tab (the r2 shape after a restart) — the row above reddens on it', cb);
    chrome.removeTab(SP, 'S10'); chrome.removeTab(SP, 'S11'); await sleep(80);
    const gone = await (async () => { for (let i = 0; i < 50; i++) { if (!keeper.holderTabs(shared.id, sA._browserKey).includes('S10')) return true; await sleep(20); } return false; })();
    ok(gone, 'verify r3 #2: the persisted witness goes with the tab (the watch forgets it on Target.targetDestroyed)', keeper.holderTabs(shared.id, sA._browserKey));
    // verify r4 #3 (reproduced on the real 0.38.1): a HEALED browser (Chrome killed, relaunched by its daemon: new target ids) kept
    // the dead ids on every lease — no lease event fires on a relaunch and the dead socket sends no targetDestroyed — so a
    // ghost-only scope read as attributed: `stop` said "nothing of yours was loading" while the conversation had no tab at all.
    // A watch's first look at its browser prunes the witness to the tabs the browser HAS; the keeper's replacement drops it whole
    {
      chrome.addTab(SP, 'S12', 'https://app.bank.test/live'); await sleep(60);
      keeper.noteOwnTab(shared.id, sA._browserKey, 'GHOST1'); keeper.noteOwnTab(shared.id, sA._browserKey, 'S12'); keeper.noteOwnTab(shared.id, sB._browserKey, 'GHOST2');
      const before = { a: keeper.holderTabs(shared.id, sA._browserKey), b: keeper.holderTabs(shared.id, sB._browserKey) };
      const k3 = K.create({ dataDir: DATA, homeDir: HOME, env: () => ({ PATH: PATH_ENV, HOME, FAKE_AB_STATE: AB, FAKE_AB_CDP_PORT: String(chrome.port) }), serverSetting: (k) => settings[k], liveKeys: () => new Set([...active.values()].map((s) => s._browserKey)), install: false, log: quiet, hostKnown: () => false, driveHoldMs: 200 });
      const h3 = (pid) => (k3.list().leases || []).filter((l) => l && l.profileId === pid && l.browserKey).map((l) => ({ browserKey: l.browserKey, sessionId: l.sessionId || null, ephemeral: !!l.ephemeral }));
      const d3 = D.create({ keeper: k3, log: quiet, holdersOf: h3, leaseCountOf: (pid) => new Set(h3(pid).map((h) => h.browserKey)).size, tabsOf: (q) => k3.holderTabs(q && q.profileId, q && q.browserKey) || [] });
      const armed3 = await d3.arm(shared.id, { budgetMs: 3000 });
      const after = { a: k3.holderTabs(shared.id, sA._browserKey), b: k3.holderTabs(shared.id, sB._browserKey) };
      ok(armed3.ok && before.a.includes('GHOST1') && before.a.includes('S12') && before.b.includes('GHOST2') && !after.a.includes('GHOST1') && after.a.includes('S12') && !after.b.includes('GHOST2') && k3.pruneOwnTabs(shared.id, ['S12']) === 0, 'verify r4 #3: a watch\'s first look (a restart, a healed browser) prunes every lease\'s persisted witness to the tabs the browser has — the live tab kept, the ghosts gone from both leases, nothing to prune twice', { before, after });
      d3.shutdown(); k3.shutdown();
      const ksrc3 = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
      const pn = "      const kept = l.tabs.filter((t) => live.has(String(t)));";
      ok(ksrc3.includes(pn), 'control setup: the prune is found in src/server/browser-keeper.js pruneOwnTabs');
      const Kc3 = MUT.load('src/server/browser-keeper.js', ksrc3.replace(pn, '      const kept = l.tabs;'), 'r4-no-prune');
      keeper.noteOwnTab(shared.id, sA._browserKey, 'GHOST3');
      const kc = Kc3.create({ dataDir: DATA, homeDir: HOME, env: () => ({ PATH: PATH_ENV, HOME, FAKE_AB_STATE: AB, FAKE_AB_CDP_PORT: String(chrome.port) }), serverSetting: (k) => settings[k], liveKeys: () => new Set([...active.values()].map((s) => s._browserKey)), install: false, log: quiet, hostKnown: () => false, driveHoldMs: 200 });
      const hc = (pid) => (kc.list().leases || []).filter((l) => l && l.profileId === pid && l.browserKey).map((l) => ({ browserKey: l.browserKey, sessionId: l.sessionId || null, ephemeral: !!l.ephemeral }));
      const dc = D.create({ keeper: kc, log: quiet, holdersOf: hc, leaseCountOf: (pid) => new Set(hc(pid).map((h) => h.browserKey)).size, tabsOf: (q) => kc.holderTabs(q && q.profileId, q && q.browserKey) || [] });
      await dc.arm(shared.id, { budgetMs: 3000 });
      const scC = dc.scopeFor({ profileId: shared.id, browserKey: sA._browserKey, sessionId: 'sess-a', ephemeral: false });
      ok(kc.holderTabs(shared.id, sA._browserKey).includes('GHOST3') && scC instanceof Set && scC.has('GHOST3'), 'CONTROL: a keeper that keeps the ghosts leaves a dead id in the conversation\'s scope after the connect — the row above reddens on it', { tabs: kc.holderTabs(shared.id, sA._browserKey) });
      dc.shutdown(); kc.shutdown();
      keeper.forgetOwnTab(shared.id, sA._browserKey, 'GHOST3'); keeper.forgetOwnTab(shared.id, sA._browserKey, 'S12'); chrome.removeTab(SP, 'S12'); await sleep(60);
    }
    // verify r4 #1 (reproduced on the real 0.38.1): B's `tab new` while A's verb was in flight ⇒ TWO in flight ⇒ nobody's (B never
    // told of a loop there, its `stop` found nothing). THE ACK BINDS through the shipped CLI: the audit carries the id the binary's
    // ack named (text form: `tab list --json`'s active tab; `--json`: data.targetId) and the route binds it
    {
      const binds = []; const origBind = W.dialogs.bindTab; W.dialogs.bindTab = (t, id) => { binds.push({ bk: t.browserKey, id }); return origBind(t, id); };
      await j('POST', '/api/agent/browser/resolve', { handle: shared.id, argv: ['open', 'https://app.bank.test/slow'], wrapper: true }, as(sA)); // A in flight (no audit yet)
      await sleep(215); // the suite's 200 ms drive hold lapses (one driver at a time); A's verb is still IN FLIGHT for the witness (no audit)
      const opens0 = fake.opens().length;
      let rb = await cli(sB, ['tab', 'new', 'https://app.bank.test/b-own']);
      const ob = fake.opens().slice(opens0).find((o) => o.verb === 'tab new');
      const nb = fake.opens().slice(opens0).length;
      ok(rb.code === 0 && ob && binds.length === 1 && binds[0].bk === sB._browserKey && binds[0].id === ob.targetId && nb === 1, 'verify r4 #1: a `tab new` in text form — the CLI asks the session\'s `tab list --json` for the active tab and the audit binds that id to B (one tab opened, one bind, B\'s key)', { rb: rb.code, err: rb.err.slice(0, 300), ob, binds, nb });
      rb = await cli(sB, ['tab', 'new', 'https://app.bank.test/b-two', '--json']); // (the fake reads its verb positionally; the CLI reads --json anywhere)
      const ob2 = fake.opens().slice(-1)[0];
      ok(rb.code === 0 && binds.length === 2 && binds[1].id === ob2.targetId && binds[1].bk === sB._browserKey, 'verify r4 #1: …and in `--json` form the binary\'s own ack (data.targetId) is read — no second spawn', { rb: rb.code, err: rb.err.slice(0, 300), out: rb.out.slice(0, 200), ob2, binds });
      // the watch binds a tab it HAS: the fake chrome gets the next id the fake binary will print, then B's `tab new` during A's verb
      const nsOf = ob.ns, nNext = Number(ob2.targetId.split('-').pop()) + 1;
      chrome.addTab(SP, `t-${nsOf}-${nNext}`, 'https://app.bank.test/b-three'); await sleep(60);
      const scN0 = W.dialogs.scopeFor({ profileId: shared.id, browserKey: sB._browserKey, sessionId: 'sess-b', ephemeral: false });
      rb = await cli(sB, ['tab', 'new', 'https://app.bank.test/b-three']);
      const scN = W.dialogs.scopeFor({ profileId: shared.id, browserKey: sB._browserKey, sessionId: 'sess-b', ephemeral: false });
      const scNA = W.dialogs.scopeFor({ profileId: shared.id, browserKey: sA._browserKey, sessionId: 'sess-a', ephemeral: false });
      ok(rb.code === 0 && !scN0.has(`t-${nsOf}-${nNext}`) && scN.has(`t-${nsOf}-${nNext}`) && !scNA.has(`t-${nsOf}-${nNext}`) && (keeper.list().leases.find((l) => l.profileId === shared.id && l.browserKey === sB._browserKey) || {}).tabs?.includes(`t-${nsOf}-${nNext}`), 'verify r4 #1: a tab born while TWO verbs were in flight (nobody\'s by the witness) is B\'s once B\'s ack names it — in B\'s scope, never A\'s, on B\'s lease record', { before: [...scN0], after: [...scN], a: [...scNA] });
      await j('POST', '/api/agent/browser/audit', { profile: shared.id, verb: 'open', ok: true }, as(sA));
      W.dialogs.bindTab = origBind;
      // CONTROL: a CLI copy that hands no ack over — the tab stays nobody's under two verbs in flight
      const cliSrc0 = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-browser'), 'utf8');
      const ackNeedle = "...(tabAck ? { tab: { new: true, targetId: tabAck.targetId } } : {}),";
      ok(cliSrc0.includes(ackNeedle), 'control setup: the ack field is found in data/bin/vibespace-browser');
      // 2.369.199 integration: a shared profile's `tab new` is the SERVER's since lane browser-resume C (the route binds the binary's
      // ack itself) — the CLI's own ack serves the unfenced path, so the copy takes the fence off too and hands no ack over
      const fenceNeedle = "const tabFenced = r.kind === 'attachment' && !r.mediated;";
      ok(cliSrc0.includes(fenceNeedle), 'control setup: the tab fence is found in data/bin/vibespace-browser');
      const binC = MUT.write('data/bin/vibespace-browser', cliSrc0.replace(ackNeedle, '').replace(fenceNeedle, 'const tabFenced = false;'), 'r4-no-ack', { esm: false });
      await j('POST', '/api/agent/browser/resolve', { handle: shared.id, argv: ['open', 'https://app.bank.test/slow'], wrapper: true }, as(sA));
      await sleep(215);
      const nC = nNext + 1; chrome.addTab(SP, `t-${nsOf}-${nC}`, 'https://app.bank.test/b-four'); await sleep(60);
      rb = await cli(sB, ['tab', 'new', 'https://app.bank.test/b-four'], { bin: binC });
      const scC = W.dialogs.scopeFor({ profileId: shared.id, browserKey: sB._browserKey, sessionId: 'sess-b', ephemeral: false });
      ok(rb.code === 0 && !scC.has(`t-${nsOf}-${nC}`), 'CONTROL: a CLI that hands no ack over leaves the tab born under two verbs nobody\'s — the row above reddens on it', { scope: [...scC] });
      await j('POST', '/api/agent/browser/audit', { profile: shared.id, verb: 'open', ok: true }, as(sA));
    }
  }

  // ═══ ⑤c verify r1: five parts the revert table found no gate for ═══
  console.log('— ⑤c verify r1: gates for the parts a revert left green');
  {
    const SP = SHP2 || SHP;
    const evs = []; const unsub = W.dialogs.onChange((e) => evs.push(e));
    // (a) a direct `stop` while the user drives this conversation's browser is refused (browser_interrupted); allowed again after the handback
    chrome.addTab(OWNP, 'T5', 'https://app.bank.test/login'); await sleep(80);
    await j('POST', '/api/agent/browser/resolve', { handle: own.id, argv: ['snapshot'], wrapper: true }, as(sA));
    await chrome.replay(OWNP, 'T5', LOOP, { speed: 32 });
    const tk = keeper.takeover({ browserKey: sA._browserKey, profileId: own.id, viewerId: 'view-1', sessionId: 'sess-a' });
    ok(tk && tk.ok !== false && keeper.inputStateFor(sA._browserKey, own.id).input === 'user', 'setup: the user takes over the conversation\'s browser', tk);
    const n0 = chrome.of(OWNP).calls.filter((c) => c.method === 'Page.stopLoading').length;
    r = await j('POST', '/api/agent/browser/direct', { profile: own.id, action: 'stop' }, as(sA));
    ok(r.status === 409 && r.json.code === 'browser_interrupted' && chrome.of(OWNP).calls.filter((c) => c.method === 'Page.stopLoading').length === n0, 'a direct `stop` while the user drives is refused (browser_interrupted) — Page.stopLoading not sent', r.json);
    keeper.handback({ browserKey: sA._browserKey, profileId: own.id, viewerId: 'view-1', sessionId: 'sess-a' });
    r = await j('POST', '/api/agent/browser/direct', { profile: own.id, action: 'stop' }, as(sA));
    ok(r.status === 200 && /^stopped the page \(it was in a navigation loop\)/.test(r.json.text), '…after the handback the same `stop` runs', r.json);
    // (b) a verb the loop CUT is a loop outcome, never a timeout: three cuts do not make the page "not responding"
    await j('POST', '/api/agent/browser/resolve', { handle: own.id, argv: ['snapshot'], wrapper: true }, as(sA));
    await chrome.replay(OWNP, 'T5', LOOP, { speed: 32 });
    for (let i = 0; i < 3; i++) await j('POST', '/api/agent/browser/audit', { profile: own.id, verb: 'snapshot', ok: false, loop: 'cut', since: Date.now() - 100 }, as(sA));
    const fCut = W.dialogs.factFor({ profileId: own.id, browserKey: sA._browserKey, sessionId: 'sess-a', ephemeral: false, consume: false });
    await j('POST', '/api/agent/browser/direct', { profile: own.id, action: 'stop' }, as(sA));
    const fAfter = W.dialogs.factFor({ profileId: own.id, browserKey: sA._browserKey, sessionId: 'sess-a', ephemeral: false, consume: false });
    ok(fCut.stuck === null && !!fCut.loop && fAfter.stuck === null && !fAfter.loop, 'three verbs cut by the loop (the audit\'s loop: cut — the shipped CLI never sends timedOut beside it) never read as three timeouts — no "not responding" verdict beside the loop, nor after the stop', { stuck: fCut.stuck, loop: !!fCut.loop, after: fAfter.stuck });
    // (c) the loop-cleared event when the looping tab is closed through the direct route
    await j('POST', '/api/agent/browser/resolve', { handle: own.id, argv: ['snapshot'], wrapper: true }, as(sA));
    await chrome.replay(OWNP, 'T5', LOOP, { speed: 32 });
    const e0 = evs.length;
    r = await j('POST', '/api/agent/browser/direct', { profile: own.id, action: 'close' }, as(sA));
    await until(() => evs.slice(e0).some((e) => e.kind === 'loop-cleared'), 1500);
    ok(r.status === 200 && evs.slice(e0).some((e) => e.kind === 'loop-cleared' && e.targetId === 'T5' && e.why === 'tab-closed'), 'closing the looping tab emits loop-cleared (why: tab-closed) — the digest re-publishes, the chip clears', evs.slice(e0).map((e) => e.kind));
    unsub();
    // (d) a site-reset proposal of a conversation whose key is no longer live is dropped at the boot reconcile; a live one stays
    r = await cli(sC, ['--profile', shared.id, 'site-reset', '--host', 'app.bank.test']);
    const pidC = (/\(proposal (sr-[0-9a-f]{8})\)/.exec(r.out) || [])[1];
    ok(!!pidC && !!keeper.proposalEntry(pidC), 'setup: conversation C filed a proposal on the shared profile', r.out);
    active.delete('sess-c');
    keeper.reconcile();
    ok(keeper.proposalEntry(pidC) === null && !!keeper.proposalEntry(pid3), 'the boot reconcile drops the proposal of a conversation that is gone and keeps a live one\'s', { gone: keeper.proposalEntry(pidC), kept: !!keeper.proposalEntry(pid3) });
  }

  // ═══ ⑥ CONTROLS (a patched copy each) ═══
  console.log('— ⑥ controls: each rule removed alone reddens its row');
  const rel = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');
  const swap = async (Dmod, PRmod, RTmod, fn) => { try { srv.close(); } catch { } W = mkWorld({ Dmod, PRmod, RTmod }); srv = await new Promise((r2) => { const s = W.app.listen(0, '127.0.0.1', () => r2(s)); }); servers.add(srv); API = `http://127.0.0.1:${srv.address().port}`; try { return await fn(); } finally { try { srv.close(); } catch { } } };
  // ⑤c (e) — placed here because it uses the swap helper
  // (e) the quiet rule: a loop whose page stops hopping by itself clears without a stop (a world with the quiet clock at 300 ms)
  worldQuietMs = 300;
  const q = await swap(D, PR, RT, async () => {
    chrome.addTab(OWNP, 'T6', 'https://app.bank.test/login'); await sleep(80);
    await j('POST', '/api/agent/browser/resolve', { handle: own.id, argv: ['snapshot'], wrapper: true }, as(sA));
    const ev2 = []; const un2 = W.dialogs.onChange((e) => ev2.push(e));
    await chrome.replay(OWNP, 'T6', LOOP, { speed: 32 });
    const during = !!W.dialogs.factFor({ profileId: own.id, browserKey: sA._browserKey, sessionId: 'sess-a', ephemeral: false, consume: false }).loopAny;
    const t0 = Date.now();
    await until(() => ev2.some((e) => e.kind === 'loop-cleared' && e.targetId === 'T6'), 2000);
    const ms = Date.now() - t0;
    const after = !!W.dialogs.factFor({ profileId: own.id, browserKey: sA._browserKey, sessionId: 'sess-a', ephemeral: false, consume: false }).loopAny;
    un2(); chrome.removeTab(OWNP, 'T6');
    return { during, after, ms, cleared: ev2.some((e) => e.kind === 'loop-cleared' && e.targetId === 'T6') };
  });
  worldQuietMs = undefined;
  ok(q.during && q.cleared && !q.after && q.ms < 1500, `a loop with no further hop clears by the quiet clock alone (loop-cleared ${q.ms} ms after the last hop at a 300 ms quiet rule) — the chip never outlives the loop`, q);
  // C1: the clearer without the cookieReaches filter — every cookie of the browser goes
  { const src = rel('src/server/browser-dialogs.js'); const nd = "const hits = (all.result.cookies || []).filter((c) => ST.cookieReaches(c, h));"; ok(src.includes(nd), 'control setup C1');
    const Dm = MUT.load('src/server/browser-dialogs.js', src.replace(nd, 'const hits = (all.result.cookies || []);'), 'c1-all-cookies');
    const res = await swap(Dm, PR, RT, async () => { chrome.of(OWNP).jar = [{ name: 'a', domain: 'app.bank.test', path: '/' }, { name: 'b', domain: 'mail.example.test', path: '/' }]; await j('POST', '/api/agent/browser/site-reset', { profile: own.id, host: 'app.bank.test', explicit: true }, as(sA)); return chrome.of(OWNP).jar.length; });
    ok(res === 0, 'CONTROL C1: a clearer without the "reaches the host" filter deletes ANOTHER site\'s login too (the jar emptied) — the ③ row reddens on it', res); }
  // C2: clearDataForOrigin on the browser endpoint (the measured "Internal error") — storage never cleared
  { const src = rel('src/server/browser-dialogs.js'); const nd = "storageTypes: 'local_storage,indexeddb,cache_storage,service_workers,file_systems' }, tabSid, 5000);"; ok(src.includes(nd), 'control setup C2');
    const Dm = MUT.load('src/server/browser-dialogs.js', src.replace(nd, "storageTypes: 'local_storage,indexeddb,cache_storage,service_workers,file_systems' }, null, 5000);"), 'c2-browser-endpoint');
    const res = await swap(Dm, PR, RT, async () => { const x = await j('POST', '/api/agent/browser/site-reset', { profile: own.id, host: 'app.bank.test', explicit: true }, as(sA)); return x.json; });
    ok(res && res.cleared && res.cleared.origins.length === 0 && res.cleared.storageFailed.length >= 2 && /could not be cleared/.test(res.text), 'CONTROL C2: storage cleared on the BROWSER endpoint fails (Internal error, as measured) — and the answer SAYS so; the ③ storage row reddens', res); }
  // C3: the route without the shared check — the agent clears a shared profile itself (no proposal)
  { const src = rel('src/routes/browser.js'); const nd = "const v = ST.siteResetVerdict({ host, explicit, current: tabs.map((x) => x.url), remote: !!f.remote, watched: !!t.ok, shared: !own });"; ok(src.includes(nd), 'control setup C3');
    const Rm = MUT.load('src/routes/browser.js', src.replace(nd, "const v = ST.siteResetVerdict({ host, explicit, current: tabs.map((x) => x.url), remote: !!f.remote, watched: !!t.ok, shared: false });"), 'c3-no-shared');
    const res = await swap(D, PR, Rm, async () => { chrome.of(SHP2 || SHP).jar = [{ name: 'sess', domain: 'app.bank.test', path: '/' }]; const x = await j('POST', '/api/agent/browser/site-reset', { profile: shared.id, host: 'app.bank.test', explicit: true }, as(sA)); return { x: x.json, jar: chrome.of(SHP2 || SHP).jar.length }; });
    ok(res.jar === 0 && res.x && res.x.cleared, 'CONTROL C3: without the shared check the AGENT clears a profile two conversations use (every one signed out, no Approve) — the ④ rows redden', res); }
  // C4: the runner without the holders re-check — a card that said 2 clears with 3
  { const src = rel('src/server/browser-propose.js'); const nd = "if (Number(who.holders) > Number(p.holders)) return fail("; ok(src.includes(nd), 'control setup C4');
    const Pm = MUT.load('src/server/browser-propose.js', src.replace(nd, "if (false) return fail("), 'c4-no-stale');
    const res = await swap(D, Pm, RT, async () => { chrome.of(SHP2 || SHP).jar = [{ name: 'sess', domain: 'app.bank.test', path: '/' }]; await sleep(300); const x = await cli(sA, ['--profile', shared.id, 'site-reset', '--host', 'app.bank.test']); const id = (/\(proposal (sr-[0-9a-f]{8})\)/.exec(x.out) || [])[1]; const e = id && keeper.proposalEntry(id); if (!e) return { x }; const holders = e.proposal.holders; try { keeper.detach({ profileId: shared.id, browserKey: sC._browserKey, by: 'user' }); } catch { /* not attached */ } const e2 = keeper.proposalEntry(id); await j('POST', `/api/browser/proposals/${id}/approve`, { shown: e2.proposal.digest }); await keeper.attach({ profileId: shared.id, browserKey: sC._browserKey, sessionId: 'sess-c', by: 'user' }); const d = await until(() => { const q = keeper.proposalEntry(id); return q && ['done', 'failed'].includes(q.proposal.state) ? q : null; }, 5000); return { holders, state: d && d.proposal.state, jar: chrome.of(SHP2 || SHP).jar.length }; });
    ok(res && res.state === 'done' && res.jar === 0, 'CONTROL C4: a runner that does not re-count the holders clears for a conversation the card never named — the ⑤ stale row reddens', res); }
  // C5: the CLI without the standing-loop refusal — `snapshot` runs the browser CLI behind a page that will not settle
  { const src = rel('data/bin/vibespace-browser'); const nd = "if (loopStand && !loopPass(words0[0] || '') && !(loopStand.readable && loopRead(words0[0] || ''))) {"; ok(src.includes(nd), 'control setup C5'); // verify r4 #4: the line gained the readable-loop clause
    const bin = MUT.write('data/bin/vibespace-browser', src.replace(nd, 'if (false) {'), 'c5-no-loop-refusal', { esm: false });
    const x = await swap(D, PR, RT, async () => { await j('POST', '/api/agent/browser/resolve', { handle: own.id, argv: ['snapshot'], wrapper: true }, as(sA)); await chrome.replay(OWNP, 'T2', LOOP); const y0 = await cli(sA, ['--profile', own.id, 'snapshot']); const y = await cli(sA, ['--profile', own.id, 'snapshot'], { bin }); return { ...y, shipped: y0 }; });
    ok(x.shipped.out.startsWith(HEAD) && !/session_busy/.test(x.shipped.err) && /\[session_busy\]/.test(x.err), 'CONTROL C5: a CLI without the standing-loop answer hands `snapshot` to the browser CLI behind the loop — it must then be CUT, and the session\'s daemon is left finishing it (0.38.1: up to 25 s of queue); the shipped CLI never reaches the browser CLI — the ② row reddens', x); }
  // C6: the watch that wakes nobody at a loop — the verb in flight sits out the browser CLI's own timeout
  { const src = rel('src/server/browser-dialogs.js'); const nd = "for (const x of [...waiters]) if (x.profileId === w.profileId && x.loop && inScope(x.scope(), e.targetId) && Number(e.loop.runStart) >= Number(x.loop.after || 0) && !movedOn(w, x.scope(), e)) { waiters.delete(x); x.resolve({ loop: e.loop, via: 'event', at: t }); }"; ok(src.includes(nd), 'control setup C6');
    const Dm = MUT.load('src/server/browser-dialogs.js', src.replace(nd, ''), 'c6-no-wake');
    const res = await swap(Dm, PR, RT, async () => { await j('POST', '/api/agent/browser/resolve', { handle: own.id, argv: ['snapshot'], wrapper: true }, as(sA)); await cli(sA, ['--profile', own.id, 'stop']); const t0 = Date.now(); const p = j('GET', `/api/agent/browser/dialog?profile=${own.id}&wait=1200&loop=1&after=0`, undefined, as(sA)); await chrome.replay(OWNP, 'T2', LOOP); const x = await p; return { loop: !!(x.json && x.json.loop), via: x.json && x.json.via, ms: Date.now() - t0 }; });
    ok(res && res.via !== 'event' && res.ms >= 1100, 'CONTROL C6: a watch whose judgement wakes no waiter leaves the verb in flight to its own timeout — the ① event row reddens', res); }
  // C7 (verify r1): the watch that admits every tab to an unattributed conversation — B's `stop` lands on a stranger's page
  { const src = rel('src/server/browser-dialogs.js'); const nd = "(t.ephemeral || scope === null || (scope instanceof Set && scope.has(e.targetId))) && ownsTab(t, e.targetId).ok"; ok(src.split(nd).length === 3, 'control setup C7 (pickTab + ownTabs)');
    const Dm = MUT.load('src/server/browser-dialogs.js', src.split(nd).join("(t.ephemeral || scope === null || (scope instanceof Set && (scope.size === 0 || scope.has(e.targetId)))) && ownsTab(t, e.targetId).ok"), 'c7-admit-all');
    const res = await swap(Dm, PR, RT, async () => { const SP = SHP2 || SHP; chrome.addTab(SP, 'S8', 'https://app.bank.test/login'); await sleep(80); await j('POST', '/api/agent/browser/resolve', { handle: shared.id, argv: ['snapshot'], wrapper: true }, as(sA)); await chrome.replay(SP, 'S8', LOOP, { speed: 32 }); const n0 = chrome.of(SP).calls.filter((c) => c.method === 'Page.stopLoading').length; const x = await j('POST', '/api/agent/browser/direct', { profile: shared.id, action: 'stop' }, as(sB)); const landed = chrome.of(SP).calls.filter((c) => c.method === 'Page.stopLoading').length - n0; chrome.removeTab(SP, 'S8'); return { x: x.json, landed }; });
    ok(res.x && res.x.ok && res.landed === 1, 'CONTROL C7: a watch admitting every tab to an unattributed conversation lets B stop a page it cannot prove its own — the ⑤b rows redden on it', res); }
  for (const row of copiesCensus(MUT.files, MUT.dir, REPO, { minCopies: 7, label: 'mutant copies: ' })) ok(row.pass, row.name, row.detail);
} finally { fake.reap(); for (const s of servers) { try { s.close(); } catch { } } }
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
