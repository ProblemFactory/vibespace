#!/usr/bin/env node
// OWNER RULING A (2026-09-26, "A吧") ON THE REAL BINARY: a named browser profile is usable by ALL of the owner's
// conversations — ONE Chrome per profile, a second conversation JOINS it, one driver at a time, the user's pick is the
// authorization, a refusal names a button. The heavy half of test-browser-share-model (which drives the same keeper and
// routes over a fake binary with patched-copy controls). Here: the REAL keeper, routes, live-view bridge and shipped
// `vibespace-browser` on a scratch instance (its own HOME, XDG_RUNTIME_DIR and data/, an in-process express server on
// port 0, stub sessions — no agent CLI, no vendor call) + the real agent-browser 0.38.1 + a real headless Chrome:
//   ① conversation 1 `new work`, `use work`, browses; the USER pins work for conversation 2 (a rung-D session) and its
//      first bare command browses ⇒ the SAME Chrome (a process census on the directory: exactly one), each on its own
//      tab, no SingletonLock anywhere, both strips list work (the strip model), the live view answered
//   ② one driver at a time: conversation 2 mid-turn while conversation 1 drives ⇒ `browser_busy` naming "First chat"
//      through the shipped CLI; the turn ends ⇒ it runs
//   ③ the user takes over from conversation 2's live view (the real bridge): conversation 2 browser_paused,
//      conversation 1 browser_paused too (lane S2 r6: a takeover is of the BROWSER); the handback frees it
//   ④ "Who can use it" is a LIST (2026-09-27): "Only these: [Task Group G, First chat]" ⇒ conversation 2 (in G) opens work
//      through its group (one Chrome, its own tab), conversation 3 refused not_owner with the list sentence and the CLI's
//      way-out line (no command line, no temporary browser); the user adds conversation 3 ⇒ admitted; the user unbinds
//      conversation 2 from G ⇒ its next command refused and its tab gone (a census of Chrome's own page targets);
//      `profiles` prints the five `used by:` forms
//   ⑤ Rename; Delete… with two pins ⇒ the warning's count, every pin cleared, the browser stopped, the directory set aside
//   ⑥ the migration `2026-09-browser-profiles-who-list` over a PRE-LIST registry (a "bank" kept to conversation 1 and
//      conversation 2's USER pin made after that — yesterday's authorization): refused before the fold (the CONTROL), then
//      conversation 2 opens it through the LIST — one real Chrome
//   ⑦ B-f7ab the LATE KEY: a session created WITHOUT a key (the pre-feature spawn: key, pairs, config stripped after
//      create) runs `vibespace-browser open <local url>` from a shell with no browser pairs ⇒ it succeeds (the first
//      command minted the key, said once), the binding names that conversation, the live view + the fact name the browser
//   ⑨ lane browser-resume (§3.9): a conversation's own (rung D) browser runs on its KEPT directory — a persistent cookie
//      is sent again by a NEW browser after the turn-idle stop; CONTROL: keeping off loses it (the pre-lane shape)
//   ⑧ lane-cloak: the CloakBrowser rung — the measured build installed by the product's own Install, a profile switched to
//      cloak launches UNDER THE EGRESS PROXY (a named site admitted, an unnamed one and loopback refused by name), a page
//      verb, the action trace, the switch back — SKIPs with evidence where the measured build is absent (the Actions mirror)
// SKIPs with evidence without the real binary (a VibeSpace shim first on PATH is skipped, like the runtime does) or a
// chrome. ~60-120 s. The suite reaps only processes that name ITS scratch root.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = new URL('..', import.meta.url).pathname;
const B = require('../src/browser-profiles.js');
const K = require('../src/server/browser-keeper.js');
const F = require('../src/browser-facts.js');
const S = require('../src/browser-stream.js');
const BE = require('../src/server/browser-env.js');
const express = require('express');
const { WebSocket } = require('ws');

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1200) : '')); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = (x) => JSON.stringify(x);
const CMDLINE_RE = /`?vibespace-browser (new|use|pin|detach)\b/;
// a VibeSpace session shell exports its own spawn pairs (AGENT_BROWSER_CONFIG replaces the binary's config search) — never inherited
const BASE_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('AGENT_BROWSER_') && !k.startsWith('VIBESPACE_')));
const ROOT = scratch('browser-share');
const KXD = scratch('bsx'); // a SHORT socket root (the 103-byte socket path limit)
fs.rmSync(ROOT, { recursive: true, force: true });
const KH = path.join(ROOT, 'h'), DATA = path.join(ROOT, 'data'), CWD = path.join(ROOT, 'cwd');
for (const d of [path.join(KH, '.agent-browser'), DATA, CWD, KXD]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
const kenv = { ...BASE_ENV, HOME: KH, XDG_RUNTIME_DIR: KXD };
const quiet = { log() { }, warn() { }, error() { } };
/** The processes THIS run started, found by what they name (our scratch roots) — never anybody else's. */
const mine = () => fs.readdirSync('/proc').filter((x) => /^\d+$/.test(x)).map(Number).filter((pid) => { if (pid === process.pid) return false; try { const e = fs.readFileSync(`/proc/${pid}/environ`, 'utf8'); const c = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8'); return e.includes(ROOT) || e.includes(KXD) || c.includes(ROOT) || c.includes(KXD); } catch { return false; } });
const sleepSync = (ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { /* none */ } };
function cleanup() {
  for (const pid of mine()) { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
  for (let i = 0; i < 5; i++) { sleepSync(i ? 250 : 400); try { fs.rmSync(ROOT, { recursive: true, force: true }); fs.rmSync(KXD, { recursive: true, force: true }); } catch { /* retry */ } if (!fs.existsSync(ROOT) && !fs.existsSync(KXD)) break; }
  if (fs.existsSync(ROOT) || fs.existsSync(KXD)) console.error(`  ! scratch ${ROOT} / ${KXD} could not be removed`);
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(130); });
/** Chrome rewrites its process title — /proc/<pid>/cmdline is then ONE space-joined string; the MAIN browser process has no --type= */
const chromesOn = (dir) => fs.readdirSync('/proc').filter((x) => /^\d+$/.test(x)).filter((pid) => { try { const c = ' ' + fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ') + ' '; return c.includes(` --user-data-dir=${dir} `) && !c.includes(' --type='); } catch { return false; } }).length;

console.log('— owner ruling A on the real binary: one Chrome per profile, a second conversation joins it');
const facts = F.createBrowserFacts({ env: kenv });
let ver = null; try { ver = await facts.probeVersion(); } catch { ver = null; }
const version = typeof ver === 'string' ? ver : (ver && ver.version) || facts.lastVersion() || null;
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!version) { skip(`the real agent-browser is not on PATH (only the VibeSpace shim, or nothing) — every leg needs it (probe: ${JSON.stringify(ver)})`); }
else if (!CHROME) { skip('no chrome on this box'); }
else await (async () => {
  const conv = {}; // browserKey → { turn, name }
  const KA = 'bk-0000d001', KB = 'bk-0000d002', KC = 'bk-0000d003';
  const live = new Set([KA, KB, KC]);
  // "Who can use it" (2026-09-27): the Task Groups each conversation belongs to NOW (the wiring's live store rule) + keys
  // whose store read throws
  const groupsOf = new Map(), unreadable = new Set();
  const taskDeps = { taskIdsForKey: (bk) => { if (unreadable.has(bk)) throw new Error('fake: the task store is unreadable'); return { ids: groupsOf.get(bk) || [], unreadable: false }; }, taskInfo: (id) => (id === 'T-G' ? { title: 'Ops', archived: false } : null) };
  const k = K.create({ ...taskDeps, dataDir: DATA, homeDir: KH, env: () => kenv, serverSetting: () => undefined, liveKeys: () => live, runtime: F.createBrowserRuntime({ env: kenv }), facts, log: quiet, install: false, conversationFacts: (bk) => conv[bk] || { turn: null, name: null } });
  const be = BE.create({ dataDir: DATA, homeDir: KH, serverNotice: null, telemetry: null, log: { warn() { }, log() { } }, env: { XDG_RUNTIME_DIR: KXD } });
  const mkSession = (bk, name, n) => { const e = be.envFor({ browserKey: bk, integrationOn: true, remote: false, cwd: CWD }); return { agentToken: 'vsst_' + String(n).repeat(24), _browserKey: bk, _browserVariant: e.variant, _browserEnv: e.pairs.slice(), name, webuiName: name, mode: 'chat', createdAt: Date.now() }; };
  const s1 = mkSession(KA, 'First chat', 1), s2 = mkSession(KB, 'Second chat', 2), s3 = mkSession(KC, 'Third chat', 3);
  for (const s of [s1, s2, s3]) conv[s._browserKey] = { turn: 'idle', name: s.name };
  const active = new Map([['sess-1', s1], ['sess-2', s2], ['sess-3', s3]]);
  const notices = [];
  const R = require('../src/routes/browser.js');
  R.setup({ keeper: k, activeSessions: active, browserEnv: () => be, adoptRoots: { homeDir: KH, dataDir: DATA }, notice: (sid, s, nn) => notices.push({ sid, n: nn }), persistPin: () => { },
    tasksForSession: (s) => { if (unreadable.has(s && s._browserKey)) throw new Error('fake: the task store is unreadable'); return groupsOf.get(s && s._browserKey) || []; } });
  const TR = require('../src/routes/browser-trace.js');
  const trace = require('../src/server/browser-trace.js').create({ dataDir: DATA, homeDir: KH, keeper: k, bridge: null, serverSetting: () => undefined, broadcast: () => { }, log: quiet });
  TR.setup({ keeper: k, trace, activeSessions: active, releaseProfile: (id) => R.releaseProfile(id), unpinProfile: (id) => R.unpinProfile(id), notice: (sid, s, nn) => notices.push({ sid, n: nn }), keyForPickedSession: (id) => R.keyForPickedSession(id) });
  const bridge = require('../src/server/browser-stream.js').create({ keeper: k, activeSessions: active, requestAuthed: () => true, log: quiet });
  const app = express(); app.use(express.json());
  // lane browser-resume (§3.9): a page that sets a PERSISTENT cookie, and one that shows the cookies it was sent (as its title)
  app.get('/cookie/set', (req, res) => { res.set('Set-Cookie', 'kept=yes-' + String(req.query.v || '').replace(/[^\w-]/g, '') + '; Max-Age=86400; Path=/'); res.type('html').send('<!doctype html><title>set</title><p>set</p>'); });
  app.get('/cookie/get', (req, res) => { res.type('html').send(`<!doctype html><title>cookies:${String(req.headers.cookie || 'none').replace(/[^\w=;-]/g, '')}</title><p>get</p>`); });
  app.get('/page/:name', (req, res) => { res.type('html').send(`<!doctype html><title>${String(req.params.name).replace(/[^\w-]/g, '')}</title><p>${String(req.params.name).replace(/[^\w-]/g, '')}</p>`); });
  app.use(R.router); app.use(TR.router);
  const srv = http.createServer(app);
  srv.on('upgrade', (req, socket, head) => { if (String(req.url || '').startsWith(S.STREAM_PATH)) bridge.handleUpgrade(req, socket, head); else socket.destroy(); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const PORT = srv.address().port, API = `http://127.0.0.1:${PORT}`, PAGE = (n) => `${API}/page/${n}`;
  const j = async (method, p, body) => { const res = await fetch(API + p, { method, headers: body !== undefined ? { 'Content-Type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined }); let json = null; try { json = await res.json(); } catch { } return { status: res.status, json }; };
  // the shipped CLI reads the ACCOUNT's home off its passwd entry — the scratch HOME stands in for it through a preload
  const pw = path.join(ROOT, 'passwd.cjs'); fs.writeFileSync(pw, `const os = require('os'); const real = os.userInfo; os.userInfo = (o) => ({ ...real(o), homedir: ${JSON.stringify(KH)} });\n`);
  const cli = (s, args) => new Promise((resolve) => execFile(process.execPath, ['--require', pw, path.join(REPO, 'data/bin/vibespace-browser'), ...args], { env: { ...kenv, VIBESPACE_API: API, VIBESPACE_SESSION_TOKEN: s.agentToken, VIBESPACE_SESSION_CWD: CWD, ...S.pairsToEnv(s._browserEnv) }, cwd: CWD, encoding: 'utf8', timeout: 90000 }, (err, so, se) => resolve({ ok: !err, code: err ? err.code : 0, out: String(so || ''), err: String(se || '') })));
  const lastLine = (r) => (r.out.trim().split('\n').filter(Boolean).pop() || '');
  const titleOf = (r) => { const t = lastLine(r); try { const o = JSON.parse(t); return (o && o.data && (o.data.title || o.data.result)) || t; } catch { return t; } };
  const allOut = [];
  const run = async (s, args) => { const r = await cli(s, args); allOut.push(r.out + r.err); return r; };
  try {
    // ── ① path A + path B on the real binary ──
    let c = await run(s1, ['new', 'work']);
    const work = k.profileByRef('work');
    ok(c.ok && work && work.owner.kind === 'instance' && work.createdBy === KA && /every conversation of the user's can use it/.test(c.out), `① conversation 1's agent \`new work\` ⇒ a profile every conversation can use (${version})`, c);
    c = await run(s1, ['use', 'work']);
    ok(c.ok, '① conversation 1 `use work`', c);
    c = await run(s1, ['open', PAGE('WORKA')]);
    const tA = await run(s1, ['get', 'title']);
    ok(c.ok && /WORKA/.test(titleOf(tA)) && chromesOn(work.dir) === 1, `① conversation 1 browses in work — its page "${titleOf(tA)}", ONE Chrome on the directory`, { c, tA });
    let r = await j('POST', '/api/browser/pin', { sessionId: 'sess-2', profile: 'work' });
    ok(r.status === 200 && r.json.pin && r.json.pin.by === 'user' && be.resolvedProfileDir(KB) === be.scratchDirFor(KB), '① the USER pins work for conversation 2 (Session properties) — its own config is NOT re-pointed at the directory (it names only the conversation\'s own kept one — lane browser-resume §3.9)', r.json);
    c = await run(s2, ['open', PAGE('WORKB')]);
    const tB = await run(s2, ['get', 'title']);
    const tA2 = await run(s1, ['get', 'title']);
    ok(c.ok && /WORKB/.test(titleOf(tB)) && /WORKA/.test(titleOf(tA2)) && chromesOn(work.dir) === 1 && !k.ephemeralFor(KB), `① conversation 2's first bare command opens its pin — the SAME Chrome (${chromesOn(work.dir)} on the directory), its own tab ("${titleOf(tB)}" beside conversation 1's "${titleOf(tA2)}"), no temporary browser`, { c, tB, tA2 });
    ok(!allOut.some((x) => /SingletonLock|exit code: 21/.test(x)), '① no SingletonLock / exit 21 anywhere (the study\'s red live view)');
    const rowsA = S.browserListFor(k.statusFor(KA)), rowsB = S.browserListFor(k.statusFor(KB));
    const wA = rowsA.find((x) => x.profileId === work.id), wB = rowsB.find((x) => x.profileId === work.id);
    ok(wA && wB && wA.owners === 1 && wB.owners === 1 && wA.label === 'work' && wB.label === 'work', '① both conversations\' strips list work, each saying one other conversation holds it (the strip shows for a shared browser)', { wA, wB });
    const view = await k.streamPortFor(S.streamTargetFor({ browserKey: KB, set: k.setFor(KB), profiles: k.list().profiles }));
    ok(view.ok && Number.isInteger(view.port) && chromesOn(work.dir) === 1, `① conversation 2's live view is answered (${view.port}) on the same Chrome`, view);

    // ── ② one driver at a time, through the shipped CLI ──
    conv[KA].turn = 'running'; conv[KB].turn = 'running';
    const d1 = await run(s1, ['get', 'title']);
    const d2 = await run(s2, ['get', 'title']);
    ok(d1.ok && !d2.ok && /\[browser_busy\]/.test(d2.err) && /"First chat" is using "work" right now/.test(d2.err) && /driven by: "First chat"/.test(d2.err) && !CMDLINE_RE.test(d2.err), '② conversation 2 mid-turn while conversation 1 drives ⇒ browser_busy BY NAME through the shipped CLI (its command did not run; no command line offered)', d2.err);
    conv[KA].turn = 'idle';
    const d3 = await run(s2, ['get', 'title']);
    ok(d3.ok && /WORKB/.test(titleOf(d3)), '② conversation 1\'s turn ended ⇒ conversation 2\'s command runs (its own tab)', d3);

    // ── ③ the user takes over from conversation 2's live view (the real bridge) ──
    conv[KA].turn = 'running';
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}${S.STREAM_PATH}?session=sess-2&profile=${work.id}`);
    const inbox = [];
    ws.on('message', (d) => { try { inbox.push(JSON.parse(String(d))); } catch { /* frame */ } });
    await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
    for (let i = 0; i < 50 && !inbox.some((m) => m.type === 'hello'); i++) await sleep(100);
    ws.send(JSON.stringify({ type: 'takeover' }));
    for (let i = 0; i < 50 && !inbox.some((m) => m.type === 'mode-ack'); i++) await sleep(100);
    const ack = inbox.find((m) => m.type === 'mode-ack');
    const u2 = await run(s2, ['get', 'title']), u1 = await run(s1, ['get', 'title']);
    // integration 2.369.192: a takeover is of the BROWSER (lane S2 r6, the owner's ruling B-7199) — conversation 1 is taken WITH it
    ok(ack && ack.ok && !u2.ok && /\[browser_paused\]/.test(u2.err) && !u1.ok && /\[browser_paused\]/.test(u1.err), '③ the user takes over from conversation 2\'s live view: conversation 2 browser_paused (as today), conversation 1 browser_paused too — the takeover is of the browser, never one conversation\'s', { ack, u2: u2.err, u1: u1.err });
    ws.send(JSON.stringify({ type: 'handback' }));
    for (let i = 0; i < 50 && inbox.filter((m) => m.type === 'mode-ack').length < 2; i++) await sleep(100);
    ws.close();
    conv[KB].turn = 'idle';
    const u3 = await run(s1, ['get', 'title']);
    ok(u3.ok && /WORKA/.test(titleOf(u3)), '③ the handback frees it — conversation 1 acts again', u3);
    conv[KA].turn = 'idle';

    // ── ③b VERIFY S5 (2026-09-26): the user drives from conversation 2's live view when "Only First chat" takes work from
    //    conversation 2 ⇒ that view ENDS (typed), a takeover from conversation 2 is refused no_lease, conversation 1 is free
    //    (before: the view stayed open, took over again, and conversation 1 was refused browser_busy "the user drives it
    //    from Second chat" on a profile the user had just kept to conversation 1)
    conv[KA].turn = 'running';
    const ws3 = new WebSocket(`ws://127.0.0.1:${PORT}${S.STREAM_PATH}?session=sess-2&profile=${work.id}`);
    const inbox3 = [];
    ws3.on('message', (d) => { try { inbox3.push(JSON.parse(String(d))); } catch { inbox3.push({ type: '(frame)' }); } });
    await new Promise((res, rej) => { ws3.once('open', res); ws3.once('error', rej); });
    for (let i = 0; i < 50 && !inbox3.some((m) => m.type === 'hello'); i++) await sleep(100);
    ws3.send(JSON.stringify({ type: 'takeover' }));
    for (let i = 0; i < 50 && !inbox3.some((m) => m.type === 'mode-ack'); i++) await sleep(100);
    const b1 = await run(s1, ['get', 'title']);
    ok(!b1.ok && /\[browser_paused\]/.test(b1.err), '③b setup: the user drives work from conversation 2\'s live view — conversation 1 is browser_paused (taken WITH it: lane S2 r6)', b1.err);
    const mark3 = inbox3.length;
    await sleep(5);
    r = await j('PATCH', `/api/browser/profiles/${work.id}`, { use: { mode: 'only', who: [{ kind: 'session', key: KA }] } });
    for (let i = 0; i < 30 && ws3.readyState === 1; i++) await sleep(100);
    const ended3 = inbox3.slice(mark3).find((m) => m.type === 'status' && m.state === 'ended');
    ok(r.status === 200 && r.json.detached.some((d) => d.browserKey === KB) && !!ended3 && ws3.readyState !== 1 && !inbox3.slice(mark3).some((m) => m.type === '(frame)'), `③b "Only First chat" while the user drives from conversation 2\'s view: the view ENDS with a typed status ("${ended3 && ended3.error}"), no stale picture`, { ended3, state: ws3.readyState });
    const b2 = await run(s1, ['get', 'title']);
    ok(b2.ok && /WORKA/.test(titleOf(b2)) && chromesOn(work.dir) === 1, '③b conversation 1 acts at once — the takeover through conversation 2 ended with its lease', b2.err);
    const t3 = k.takeover({ browserKey: KB, profileId: work.id, viewerId: 99, sessionId: 'sess-2' });
    ok(!t3.ok && t3.code === 'no_lease' && /Session properties/.test(t3.error) && !CMDLINE_RE.test(t3.error), '③b a takeover of work by conversation 2 (no lease) is refused no_lease, naming the button — never a pause of conversation 1', t3);
    try { ws3.close(); } catch { /* closed */ }
    conv[KA].turn = 'idle';
    r = await j('PATCH', `/api/browser/profiles/${work.id}`, { use: { mode: 'all' } });
    r = await j('POST', '/api/browser/pin', { sessionId: 'sess-2', profile: 'work' }); // the ④ leg below starts from a pinned conversation 2 on work (its pin re-made after this narrowing)
    let re2 = await run(s2, ['get', 'title']);
    if (/\[profile_changed\]/.test(re2.err)) re2 = await run(s2, ['get', 'title']);
    ok(re2.ok && k.leasesOn(work.id).some((l) => l.browserKey === KB), '③b conversation 2 is back on work through its (re-made) pin for the legs below', re2.err);

    // ── ④ "Who can use it" is a LIST: [Task Group G, First chat] ──
    /** Chrome's OWN page targets (its CDP /json/list, the keeper's browser) — the tab census. */
    const pagesOf = async () => { const o = await k.leaseCliOpts(work.id, KA); const u = o && o.extraEnv && o.extraEnv.AGENT_BROWSER_CDP; const m = u && /^wss?:\/\/([^/]+)\//.exec(u); if (!m) return null; try { return (await (await fetch(`http://${m[1]}/json/list`)).json()).filter((t) => t.type === 'page').map((t) => t.title || t.url); } catch { return null; } };
    groupsOf.set(KB, ['T-G']);
    await sleep(5);
    let u0 = (await j('GET', `/api/browser/profiles/${work.id}/use`)).json;
    r = await j('PATCH', `/api/browser/profiles/${work.id}`, { use: { mode: 'only', who: [{ kind: 'task', id: 'T-G' }, { kind: 'session', session: 'sess-1' }] }, base: u0.base });
    ok(r.status === 200 && r.json.profile.scope === 'only' && !r.json.detached.some((d) => d.browserKey === KB) && chromesOn(work.dir) === 1, '④ "Only these: Task Group G, First chat": conversation 2 (in G) KEEPS its tab, conversation 1 keeps browsing — one Chrome', r.json);
    let n2 = await run(s2, ['open', PAGE('WORKB2')]);
    const tB2 = await run(s2, ['get', 'title']);
    ok(n2.ok && /WORKB2/.test(titleOf(tB2)) && chromesOn(work.dir) === 1 && !k.ephemeralFor(KB), `④ conversation 2 opens work THROUGH ITS TASK GROUP ("${titleOf(tB2)}" in its own tab, one Chrome)`, { n2, tB2 });
    // conversation 3 — in no group on the list — is refused by the list sentence and the CLI's way-out line
    r = await j('POST', '/api/browser/pin', { sessionId: 'sess-3', profile: 'work' }); // the USER's pick of work for 3 ADDS it — so first the agent asks ITSELF
    ok(r.status === 200 && r.json.added && r.json.added.label === 'work', '④ (the user\'s pick of work for conversation 3 writes the list — the answer says `added`)', r.json);
    r = await j('POST', '/api/browser/pin', { sessionId: 'sess-3', profile: null }); // unpinned again; take 3 back OUT of the list for the refusal leg
    u0 = (await j('GET', `/api/browser/profiles/${work.id}/use`)).json;
    r = await j('PATCH', `/api/browser/profiles/${work.id}`, { use: { mode: 'only', who: [{ kind: 'task', id: 'T-G' }, { kind: 'session', key: KA }] }, base: u0.base });
    const n3 = await run(s3, ['use', 'work']);
    ok(!n3.ok && /\[not_owner\]/.test(n3.err) && /kept to some of the user's conversations and Task Groups/.test(n3.err) && /way out: ask the user to add this conversation under "Who can use it" in the Agent browser panel \(Change…\), or to switch it to "All my conversations"/.test(n3.err) && !CMDLINE_RE.test(n3.err) && !k.ephemeralFor(KC), '④ conversation 3 `use work` ⇒ not_owner with the LIST sentence and the CLI\'s way-out line (no command line, no temporary browser)', n3.err);
    // the five `used by:` forms, as each conversation's `profiles` prints them
    await j('POST', '/api/browser/profiles', { label: 'shop' }); // everyone's
    const pr1 = await run(s1, ['profiles']), pr2 = await run(s2, ['profiles']), pr3 = await run(s3, ['profiles']);
    unreadable.add(KC); const pr3u = await run(s3, ['profiles']); unreadable.delete(KC);
    const workLine = (x) => (x.out.split('\n').find((l) => / work {2}\(/.test(l)) || '');
    const shopLine = (x) => (x.out.split('\n').find((l) => / shop {2}\(/.test(l)) || '');
    ok(/used by: all your conversations/.test(shopLine(pr1)) && /used by: chosen conversations — yours included  /.test(workLine(pr1) + '  ') && /used by: chosen conversations — yours included \(through its Task Group\)/.test(workLine(pr2)) && /used by: chosen conversations — not yours \(the user can add this conversation under "Who can use it" in the Agent browser panel\)/.test(workLine(pr3)) && /used by: chosen conversations — unknown for yours right now \(the Task Group list could not be read\)/.test(workLine(pr3u)) && ![pr1, pr2, pr3, pr3u].some((x) => /bk-[0-9a-f]{8}/.test(x.out)), '④ `profiles` prints the five `used by:` forms (all / yours / through its Task Group / not yours / unknown) — and never a conversation key', { s: shopLine(pr1), a: workLine(pr1), b: workLine(pr2), c: workLine(pr3), u: workLine(pr3u) });
    // the user adds conversation 3 (the UI's attach writes the list) ⇒ admitted
    r = await j('POST', '/api/browser/attach', { sessionId: 'sess-3', profile: 'work' });
    const n3b = await run(s3, ['open', PAGE('WORKC')]);
    ok(r.status === 200 && r.json.added && n3b.ok && chromesOn(work.dir) === 1, '④ the user adds conversation 3 (the UI\'s attach ADDS it to the list) ⇒ it browses in work, still one Chrome', { r: r.json, n3b });
    // unbind conversation 2 from G ⇒ its next command refused AND its tab gone
    const before = await pagesOf();
    groupsOf.set(KB, []);
    const n2b = await run(s2, ['get', 'title']);
    let after = null;
    for (let i = 0; i < 40; i++) { after = await pagesOf(); if (after && !after.some((x) => /WORKB2/.test(x))) break; await sleep(250); }
    ok(!n2b.ok && /\[not_owner\]/.test(n2b.err) && /Your tab in its browser was closed/.test(n2b.err) && !k.leasesOn(work.id).some((l) => l.browserKey === KB) && before && before.some((x) => /WORKB2/.test(x)) && after && !after.some((x) => /WORKB2/.test(x)) && after.some((x) => /WORKA/.test(x)) && chromesOn(work.dir) === 1, `④ conversation 2 unbound from G: its next command refused AND its tab gone (Chrome's pages: ${J(before)} → ${J(after)}), the others keep theirs, one Chrome`, { err: n2b.err, before, after });
    u0 = (await j('GET', `/api/browser/profiles/${work.id}/use`)).json;
    r = await j('PATCH', `/api/browser/profiles/${work.id}`, { use: { mode: 'all' }, base: u0.base });
    await j('POST', '/api/browser/detach', { sessionId: 'sess-3', profile: 'work' });
    let n2c = await run(s2, ['get', 'title']);
    if (/\[profile_changed\]/.test(n2c.err)) n2c = await run(s2, ['get', 'title']);
    ok(r.status === 200 && n2c.ok, '④ "All my conversations" again — conversation 2 browses through its pin (the legs below)', n2c);

    // ── ⑤ Rename; Delete… with two pins ──
    r = await j('PATCH', `/api/browser/profiles/${work.id}`, { label: 'Work (acme)' });
    const pl = await run(s1, ['profiles']);
    ok(r.status === 200 && /Work \(acme\)/.test(pl.out) && /used by: all your conversations/.test(pl.out), '⑤ Rename: the new name is what every conversation lists ("used by: all your conversations")', pl.out);
    r = await j('POST', '/api/browser/pin', { sessionId: 'sess-3', profile: work.id });
    const hk = await j('GET', '/api/browser/housekeeping');
    const row = hk.json && (hk.json.profiles || []).find((x) => x.id === work.id);
    const TV = await import(path.join(REPO, 'src/lib/browser-trace-view.js'));
    const users = row ? TV.usersOf(row) : [];
    ok(row && users.length === 3 && users.filter((u) => u.pinned).length === 2, `⑤ the Delete… warning counts who uses it: ${users.length} conversations, ${users.filter((u) => u.pinned).length} of them pinned to it`, row && row.usedBy);
    const dir = work.dir;
    r = await j('POST', `/api/browser/profiles/${work.id}/forget`, { release: true, unpin: true });
    await sleep(500);
    ok(r.status === 200 && r.json.unpinned === 2 && r.json.stopped === true && !k.pinFor(KB) && !k.pinFor(KC) && s2._browserProfileId === null && s3._browserProfileId === null && !k.profile(work.id) && !fs.existsSync(dir) && fs.existsSync(r.json.to) && chromesOn(dir) === 0 && chromesOn(r.json.to) === 0, '⑤ Delete… with two pins: both pins cleared, every lease detached, the Chrome stopped (none left on the directory), the directory set aside (kept until Delete permanently)', r.json);
    const after2 = await run(s2, ['get', 'title']);
    ok(!/SingletonLock/.test(after2.out + after2.err), '⑤ conversation 2 goes back to a temporary browser of its own (no dangling pin, no lock)', after2);

    // ── ⑥ the migration `2026-09-browser-profiles-who-list` over a PRE-LIST registry (a folded pin) ──
    const R2 = path.join(ROOT, 'inst2'), D2 = path.join(R2, 'data'); fs.mkdirSync(D2, { recursive: true });
    const bankDir = path.join(KH, '.agent-browser', 'vs-bp-0000d0b1'); fs.mkdirSync(bankDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(D2, 'browser-profiles.json'), JSON.stringify({ version: 1, profiles: [{ id: 'bp-0000d0b1', label: 'bank', dir: bankDir, provider: 'chromium', owner: { kind: 'session', id: KA }, sharing: 'owner', createdAt: 1, lastUsedAt: 0, record: false, legacy: false, scopeAt: 100 }], leases: [], browsers: {}, pins: { [KB]: { profileId: 'bp-0000d0b1', origin: 'chosen', at: 200, by: 'user' } } }), { mode: 0o600 });
    const k0 = K.create({ dataDir: D2, homeDir: KH, env: () => kenv, serverSetting: () => undefined, liveKeys: () => live, runtime: F.createBrowserRuntime({ env: kenv }), facts, log: quiet, install: false });
    let e0 = null; try { await k0.attach({ profileId: 'bp-0000d0b1', browserKey: KB, sessionId: 'sess-2', by: 'pin' }); } catch (e) { e0 = e; }
    k0.shutdown();
    ok(e0 && e0.code === 'not_owner' && chromesOn(bankDir) === 0, '⑥ CONTROL: before the fold, conversation 2\'s pin on the pre-list "bank" (yesterday\'s authorization) opens nothing — a pin never authorizes now (not_owner), nothing starts', e0 && e0.message);
    const { runMigrations } = require('../src/migration-runner.js');
    const mm = require('../src/server/migrations.js').create({ rootDir: R2, homeDir: KH, serverNotice: () => { } });
    const res = runMigrations({ ledgerPath: path.join(D2, 'migrations.json'), migrations: mm.MIGRATIONS.filter((x) => x.id === '2026-09-browser-profiles-who-list'), log: () => { }, warn: () => { } })[0];
    const k2 = K.create({ dataDir: D2, homeDir: KH, env: () => kenv, serverSetting: () => undefined, liveKeys: () => live, runtime: F.createBrowserRuntime({ env: kenv }), facts, log: quiet, install: false });
    let a2 = null, e2 = null; try { a2 = await k2.attach({ profileId: 'bp-0000d0b1', browserKey: KB, sessionId: 'sess-2', by: 'pin' }); } catch (e) { e2 = e; }
    ok(res && res.status === 'ran' && res.report.migrated.length === 1 && res.report.migrated[0].folded.join() === KB && !e2 && a2 && B.whoMayUse(k2.profile('bp-0000d0b1')).who.map((w) => w.id).join() === [KA, KB].join() && chromesOn(bankDir) === 1, '⑥ the migration folds conversation 2\'s pin into bank\'s LIST: it opens it — ONE real Chrome on its directory', e2 ? e2.message : res && res.report);
    await k2.stop('bp-0000d0b1').catch(() => { });
    k2.shutdown();

    // ── ⑦ B-f7ab THE LATE KEY on the real binary: a session created WITHOUT a key (the pre-feature spawn, simulated by
    //    stripping its key, its pairs, its generated config and its record's key after create) runs the shipped CLI from
    //    a shell that carries NO browser pairs — its first command gets it a key (the note says so), browses, and the
    //    live view + the fact name the browser; the binding names THAT conversation; a second command mints nothing ──
    {
      const BK = require('../src/server/browser-key.js');
      const BB = require('../src/server/browser-bindings.js');
      const BF = require('../src/browser-fact.js');
      const K4 = 'bk-0000d004', CONV4 = 'c0f7ab00-late-4000-8000-00000000d004';
      const s4 = mkSession(K4, 'Late chat', 4);
      s4.claudeSessionId = CONV4; s4.sockName = 'cw-late'; s4.cwd = CWD;
      const metas = new Map([['cw-late', { webuiSessionId: 'sess-4', name: 'Late chat', cwd: CWD, claudeSessionId: CONV4 }]]);
      delete s4._browserKey; delete s4._browserVariant; delete s4._browserEnv; // what a session spawned before the feature carries
      fs.rmSync(be.configPathFor(K4), { force: true });
      active.set('sess-4', s4);
      const store = BB.create({ dataDir: DATA, log: quiet });
      const persist = (session, patch) => { const meta = { ...(metas.get(session.sockName) || {}), ...patch }; metas.set(session.sockName, meta); if (meta.browserKey) { const sid = store.bindableIdOf(meta); if (sid) store.record(sid, meta.browserKey); } };
      const eng = BK.create({ browserEnv: () => be, keeper: () => k, activeSessions: active, readMeta: (x) => metas.get(x.sockName) || null, persistMeta: persist, log: quiet });
      R.setup({ keeper: k, activeSessions: active, browserEnv: () => be, adoptRoots: { homeDir: KH, dataDir: DATA }, notice: (sid, s, nn) => notices.push({ sid, n: nn }), persistPin: () => { }, tasksForSession: () => [], ensureBrowserKey: (x, o) => eng.ensureBrowserKey(x, o) });
      ok(!s4._browserKey && !fs.existsSync(be.configPathFor(K4)) && BF.browserFactWords(eng.keylessFactOf(s4)).line === 'no browser yet', '⑦ setup: a live session with no key, no pairs, no config — its fact says "no browser yet"');
      // the shell of a pre-feature session: no AGENT_BROWSER_* pair at all (never the spawn pairs `cli()` would add)
      const bare = (args) => new Promise((resolve) => execFile(process.execPath, ['--require', pw, path.join(REPO, 'data/bin/vibespace-browser'), ...args], { env: { ...kenv, VIBESPACE_API: API, VIBESPACE_SESSION_TOKEN: s4.agentToken, VIBESPACE_SESSION_CWD: CWD }, cwd: CWD, encoding: 'utf8', timeout: 90000 }, (err, so, se) => resolve({ ok: !err, code: err ? err.code : 0, out: String(so || ''), err: String(se || '') })));
      const o1 = await bare(['open', PAGE('LATE')]);
      const late = s4._browserKey;
      const t1 = await bare(['get', 'title']);
      ok(o1.ok && B.isBrowserKey(late) && late !== K4 && /\[browser_key_minted\]/.test(o1.err) && /nothing needs restarting/.test(o1.err) && t1.ok && /LATE/.test(titleOf(t1)) && !/\[browser_key_minted\]/.test(t1.err),
        `⑦ \`vibespace-browser open <local url>\` from the pre-feature shell SUCCEEDS: the first command minted ${late} (said once: [browser_key_minted]), the page is "${titleOf(t1)}"; the second command minted nothing`, { o1, t1 });
      ok(BB.create({ dataDir: DATA }).lookup(CONV4) === late && metas.get('cw-late').browserKeyFor === CONV4 && s4._browserVariant === 'D' && fs.existsSync(be.configPathFor(late)) && k.ephemeralFor(late),
        '⑦ bindings.json names THAT conversation → the key; rung D\'s config is written; the keeper manages the conversation\'s own browser');
      const f4 = k.factFor(BF.sessionFactsOf(s4));
      const w4 = BF.browserFactWords(f4);
      ok(f4 && f4.key === late && f4.live && w4.line === 'no profile (temporary browser)' && f4.using.state === 'running', `⑦ the fact (the card / status-bar chip) names the browser: "Agent browser · ${w4.line}" — ${w4.state}, live`, JSON.stringify(f4));
      const ws4 = new WebSocket(`ws://127.0.0.1:${PORT}${S.STREAM_PATH}?session=sess-4`);
      const in4 = [];
      ws4.on('message', (d) => { try { in4.push(JSON.parse(String(d))); } catch { in4.push({ type: '(frame)' }); } });
      await new Promise((res, rej) => { ws4.once('open', res); ws4.once('error', rej); });
      for (let i = 0; i < 80 && !in4.some((m) => m.type === 'hello'); i++) await sleep(100);
      const h4 = in4.find((m) => m.type === 'hello');
      try { ws4.close(); } catch { /* closed */ }
      ok(h4 && h4.target && h4.target.kind === 'ephemeral' && h4.target.ns === B.sessionNameFor(late), '⑦ the live view of that session answers (the real bridge): its target is the conversation\'s own browser under the late key', h4);
      R.setup({ keeper: k, activeSessions: active, browserEnv: () => be, adoptRoots: { homeDir: KH, dataDir: DATA }, notice: (sid, s, nn) => notices.push({ sid, n: nn }), persistPin: () => { }, tasksForSession: () => [] });
    }
    // ── ⑨ lane browser-resume (§3.9, the owner's ruling 1 — "state survives the process"), MEASURED on the real binary +
    //    Chrome: a conversation's own (rung D) browser runs on its KEPT directory, a persistent cookie set in it is sent
    //    again after the browser was STOPPED (the turn-idle release) and a NEW Chrome started by the next command — and the
    //    CONTROL: the same steps with keeping OFF (the pre-lane rung D, the binary's throw-away directory) lose it ──
    {
      const cookieRun = async (bk, n, name, beX) => {
        const e = beX.envFor({ browserKey: bk, integrationOn: true, remote: false, cwd: CWD });
        const sx = { agentToken: 'vsst_' + String(n).repeat(24), _browserKey: bk, _browserVariant: e.variant, _browserEnv: e.pairs.slice(), name, webuiName: name, mode: 'chat', createdAt: Date.now() };
        active.set('sess-' + n, sx); live.add(bk); conv[bk] = { turn: 'idle', name };
        const set = await run(sx, ['open', `${API}/cookie/set?v=${n}`]);
        const before = await run(sx, ['open', `${API}/cookie/get`]);
        const t0 = await run(sx, ['get', 'title']);
        const e0 = k.ephemeralFor(bk);
        const dir0 = e0 && e0.dir;
        const pid0 = e0 && e0.pid;
        if (e0) await k.stop(e0.profileId, { why: 'turn-idle' });
        const stopped = !(k.ephemeralFor(bk) || {}).live && (!dir0 || chromesOn(dir0) === 0);
        const sizeOf = (d) => { let n = 0; const walk = (x) => { let st; try { st = fs.lstatSync(x); } catch { return; } if (st.isDirectory()) { for (const c of fs.readdirSync(x)) walk(path.join(x, c)); } else n += st.size; }; if (d) walk(d); return n; };
        const bytes0 = sizeOf(dir0);
        const after = await run(sx, ['open', `${API}/cookie/get`]);
        const t1 = await run(sx, ['get', 'title']);
        const e1 = k.ephemeralFor(bk);
        const out = { bytes0, set: set.ok, before: before.ok, t0: titleOf(t0), stopped, pid0, pid1: e1 && e1.pid, dir0, dir1: e1 && e1.dir, after: after.ok, t1: titleOf(t1), config: (() => { try { return JSON.parse(fs.readFileSync(beX.configPathFor(bk), 'utf8')).profile || null; } catch { return null; } })() };
        if (e1) await k.stop(e1.profileId, { why: 'user' });
        active.delete('sess-' + n); live.delete(bk);
        return out;
      };
      const K5 = 'bk-0000d005', K6 = 'bk-0000d006';
      const kept5 = await cookieRun(K5, 5, 'Kept chat', be);
      ok(kept5.config === be.scratchDirFor(K5) && kept5.dir0 === be.scratchDirFor(K5) && kept5.set && /kept=yes-5/.test(kept5.t0) && kept5.stopped && kept5.pid1 && kept5.pid1 !== kept5.pid0 && /kept=yes-5/.test(kept5.t1),
        `⑨ lane browser-resume: the conversation's own browser runs on data/browser-profiles/${K5}; its cookie ("${kept5.t0}") is sent again by a NEW browser (daemon ${kept5.pid0} → ${kept5.pid1}) after the turn-idle stop: "${kept5.t1}" — its logins survived the process (its kept directory after two pages: ${(kept5.bytes0 / 1048576).toFixed(1)} MB)`, kept5);
      const beOff = BE.create({ dataDir: DATA, homeDir: KH, serverNotice: null, telemetry: null, log: { warn() { }, log() { } }, env: { XDG_RUNTIME_DIR: KXD }, keepOn: () => false });
      const off6 = await cookieRun(K6, 6, 'Unkept chat', beOff);
      ok(off6.config === null && off6.set && /kept=yes-6/.test(off6.t0) && off6.stopped && /cookies:none/.test(off6.t1),
        `⑨ CONTROL: keeping OFF (the pre-lane rung D — the binary's throw-away directory) — the same steps lose the cookie ("${off6.t0}" → "${off6.t1}"): the leg above can go red`, off6);
    }
    // ── ⑧ lane-cloak (2026-09-28): THE CLOAKBROWSER RUNG on the real binaries — the measured build installed by the
    //    product's own Install (the real package + the measured cache ⇒ nothing downloaded), a never-launched profile
    //    switched to cloak by the USER, the browser launched UNDER THE EGRESS PROXY (a named site admitted — resolved to
    //    this server, nothing leaves — an unnamed one and loopback refused), a page verb, the action trace, the switch back.
    //    SKIPs with evidence where the measured build is absent (the Actions mirror has none): VIBESPACE_TEST_CLOAK_PREFIX
    //    = an npm prefix holding cloakbrowser@<the record's version>, VIBESPACE_TEST_CLOAK_CACHE = a CLOAKBROWSER_CACHE_DIR
    //    whose chromium-<v>/chrome has the record's SHA-256.
    await (async () => {
      const crypto = require('crypto');
      const SWm = require('../src/browser-switch.js');
      const P = B.CLOAK_EGRESS_PROOF;
      const CP = process.env.VIBESPACE_TEST_CLOAK_PREFIX || '', CC = process.env.VIBESPACE_TEST_CLOAK_CACHE || '';
      let why = null, pkgV = null, cbin = null;
      if (!CP || !CC) why = 'VIBESPACE_TEST_CLOAK_PREFIX / VIBESPACE_TEST_CLOAK_CACHE are not set (no measured CloakBrowser build on this machine)';
      else {
        try { pkgV = JSON.parse(fs.readFileSync(path.join(CP, 'node_modules', 'cloakbrowser', 'package.json'), 'utf8')).version; } catch { pkgV = null; }
        cbin = SWm.cloakBinaryPath({ cacheDir: CC, chromium: P.chromium, platform: P.platform });
        if (pkgV !== P.version) why = `the prefix holds cloakbrowser ${pkgV}, the record describes ${P.version}`;
        else if (!cbin || !fs.existsSync(cbin)) why = `no browser at ${cbin}`;
        else { const h = await new Promise((res, rej) => { const hh = crypto.createHash('sha256'); fs.createReadStream(cbin).on('data', (d) => hh.update(d)).on('error', rej).on('end', () => res(hh.digest('hex'))); }); if (h !== P.binary.sha256) why = `the browser's SHA-256 ${h.slice(0, 12)}… is not the record's ${P.binary.sha256.slice(0, 12)}…`; }
      }
      if (why) { skip(`⑧ the CloakBrowser rung: ${why}`); return; }
      const DATA_C = path.join(ROOT, 'data-cloak'), TOOLS = path.join(DATA_C, 'browser-tools');
      fs.mkdirSync(path.join(TOOLS, 'node_modules'), { recursive: true, mode: 0o700 });
      fs.symlinkSync(path.join(CP, 'node_modules', 'cloakbrowser'), path.join(TOOLS, 'node_modules', 'cloakbrowser'));
      fs.symlinkSync(CC, path.join(TOOLS, 'cloak-cache'));
      const SITE = 'cloak-proof.test';
      const rt = F.createBrowserRuntime({ env: kenv });
      const KE = 'bk-0000d005';
      live.add(KE);
      const kc = K.create({ ...taskDeps, dataDir: DATA_C, homeDir: KH, env: () => kenv, serverSetting: (key) => (key === 'browser.cloak.egressAllowlist' ? SITE : undefined), liveKeys: () => live, runtime: rt, facts, log: quiet, install: false, conversationFacts: (bk) => conv[bk] || { turn: null, name: null }, egressResolve: (h) => (h === SITE ? '127.0.0.1' : h) });
      const bridgeC = require('../src/server/browser-stream.js').create({ keeper: kc, activeSessions: active, requestAuthed: () => true, log: quiet });
      const trc = require('../src/server/browser-trace.js').create({ dataDir: DATA_C, homeDir: KH, keeper: kc, bridge: bridgeC, serverSetting: () => undefined, runtime: rt, broadcast: () => { }, log: quiet, sweepEveryMs: 0 });
      try {
        // the product's OWN install over the real package: the pinned build is already in the cache ⇒ the wrapper fetches nothing
        const iv0 = kc.installVerdict();
        ok(iv0.ok && iv0.spec === `cloakbrowser@${P.version}` && iv0.chromium === P.chromium, `⑧ Install… is offered: the verdict pins cloakbrowser@${P.version} + Chromium ${P.chromium}`, iv0);
        await kc.installCloak();
        for (let i = 0; i < 600 && kc.installVerdict().state.running; i++) await sleep(100);
        const st = kc.installVerdict();
        ok(st.state.step === 'done' && !st.state.failed && st.code === 'already_installed' && kc.installedStamp().ok && kc.cloakExecutable().ok && kc.cloakExecutable().path === SWm.cloakBinaryPath({ cacheDir: path.join(TOOLS, 'cloak-cache'), chromium: P.chromium, platform: P.platform }), '⑧ the install ran its steps (the package present at the pinned version, the real `cloakbrowser install`, the SHA-256 check) and the keeper now answers the measured browser', { state: st.state, code: st.code, exe: kc.cloakExecutable() });
        const s5 = mkSession(KE, 'Cloak chat', 5); conv[KE] = { turn: 'idle', name: s5.name }; active.set('sess-5', s5);
        R.setup({ keeper: kc, activeSessions: active, browserEnv: () => be, adoptRoots: { homeDir: KH, dataDir: DATA_C }, notice: (sid, s, nn) => notices.push({ sid, n: nn }), persistPin: () => { }, tasksForSession: () => [] });
        trc.install();
        let c5 = await run(s5, ['new', 'cloakwork']);
        const cw = kc.profileByRef('cloakwork');
        ok(c5.ok && cw && cw.provider === 'chromium', '⑧ conversation 5 `new cloakwork` (chromium, never launched)', c5);
        const view = await j('GET', `/api/browser/switcher?profile=${cw.id}`);
        const vrow = view.json && view.json.rows.find((x) => x.id === 'cloak');
        ok(view.status === 200 && vrow && vrow.state === 'ready-confirm' && vrow.sourceLabel === 'no key needed (free tier)' && vrow.facts.sites === 1 && vrow.facts.binary && vrow.facts.binary.present, '⑧ the switch dialog\'s cloak row: installed, no key needed, one site named — one confirmation (nothing recorded which Chromium wrote the new directory)', vrow);
        let r5 = await j('POST', '/api/browser/switch', { profile: cw.id, provider: 'cloak' });
        ok(r5.status === 409 && r5.json.code === 'downgrade_unknown', '⑧ the switch without the confirmation ⇒ 409 downgrade_unknown (the dialog\'s one question)', r5.json);
        r5 = await j('POST', '/api/browser/switch', { profile: cw.id, provider: 'cloak', confirmDowngrade: true });
        ok(r5.status === 200 && r5.json.to === 'cloak' && kc.profile(cw.id).provider === 'cloak' && Number.isInteger(kc.profile(cw.id).fingerprintSeed), '⑧ the USER switches cloakwork to cloak (confirmed) — the seed minted', r5.json);
        c5 = await run(s5, ['use', 'cloakwork']);
        const o5 = await run(s5, ['open', `http://${SITE}:${PORT}/page/CLOAKA`]);
        const t5 = await run(s5, ['get', 'title']);
        const main = fs.readdirSync('/proc').filter((x) => /^\d+$/.test(x)).map((pid) => { try { return { pid, cmd: fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' '), exe: fs.readlinkSync(`/proc/${pid}/exe`) }; } catch { return null; } }).find((x) => x && x.cmd.includes(`--user-data-dir=${cw.dir}`) && !/--type=/.test(x.cmd));
        const eg = kc.cloakEgress();
        const pport = eg.url && eg.url.split(':').pop();
        ok(c5.ok && o5.ok && /CLOAKA/.test(titleOf(t5)), `⑧ a page verb runs on CloakBrowser: \`open http://${SITE}:${PORT}/page/CLOAKA\` + \`get title\` ⇒ "${titleOf(t5)}"`, { c5, o5, t5 });
        ok(!!main && fs.realpathSync(main.exe) === fs.realpathSync(cbin) && main.cmd.includes(`--proxy-server=http://127.0.0.1:${pport}`) && main.cmd.includes('--proxy-bypass-list=<-loopback>') && main.cmd.includes('--no-sandbox') && main.cmd.includes(`--fingerprint=${kc.profile(cw.id).fingerprintSeed}`), '⑧ the browser on the directory IS the measured CloakBrowser build, launched under the keeper\'s egress proxy (loopback not bypassed), --no-sandbox, the profile\'s seed', main ? { exe: main.exe, cmd: main.cmd.slice(0, 600) } : null);
        ok(eg.stats && eg.stats.allowed >= 1 && eg.allowlist.join() === SITE, `⑧ the page came THROUGH the proxy (${eg.stats && eg.stats.allowed} admitted; the allowlist is exactly the named site)`, eg);
        const n5 = await run(s5, ['open', `http://not-listed.test:${PORT}/page/NO`]);
        const nt = await run(s5, ['get', 'text', 'body']);
        const l5 = await run(s5, ['open', PAGE('LOOP')]);
        const lt = await run(s5, ['get', 'text', 'body']);
        const eg2 = kc.cloakEgress();
        console.log(`    · a refused navigation, as the agent sees it: open (ok=${n5.ok}) → ${JSON.stringify(n5.out.trim().slice(0, 240))} ${JSON.stringify(n5.err.trim().split('\n').filter((x) => !/^profile: /.test(x)).join(' | ').slice(0, 240))}; body → ${JSON.stringify(nt.out.trim().slice(0, 240))}`);
        ok(eg2.recent.some((x) => x.host === 'not-listed.test' && /not in the egress allowlist/.test(x.why)) && eg2.recent.some((x) => x.host === '127.0.0.1' && /loopback/.test(x.why)) && !/NO|LOOP/.test(titleOf(await run(s5, ['get', 'title']))), '⑧ an unnamed site and loopback are REFUSED by the proxy — by name — and their pages never load', { n5: n5.out + n5.err, nt: nt.out.slice(0, 300), l5: l5.out + l5.err, lt: lt.out.slice(0, 300), recent: eg2.recent });
        let es = [];
        for (let i = 0; i < 80 && !es.some((e) => /CLOAKA/.test(JSON.stringify(e))); i++) { await sleep(100); es = trc.list({ sessionId: 'sess-5', profileId: cw.id }); }
        ok(es.some((e) => ['open', 'navigate'].includes(e.action) && /CLOAKA/.test(JSON.stringify(e))), `⑧ the action trace recorded the page verb on the CloakBrowser browser (${es.length} entr${es.length === 1 ? 'y' : 'ies'})`, es.map((e) => ({ action: e.action, target: e.target, url: e.url })).slice(0, 6));
        // the switch back — cloak wrote Chromium 146; chromium's own major is not known to THIS keeper yet ⇒ one confirmation
        r5 = await j('POST', '/api/browser/switch', { profile: cw.id, provider: 'chromium', confirmDowngrade: true });
        const b5 = await run(s5, ['open', PAGE('BACK')]);
        const bt = await run(s5, ['get', 'title']);
        const back = fs.readdirSync('/proc').filter((x) => /^\d+$/.test(x)).map((pid) => { try { return { cmd: fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' '), exe: fs.readlinkSync(`/proc/${pid}/exe`) }; } catch { return null; } }).find((x) => x && x.cmd.includes(`--user-data-dir=${cw.dir}`) && !/--type=/.test(x.cmd));
        ok(r5.status === 200 && r5.json.to === 'chromium' && kc.profile(cw.id).provider === 'chromium' && b5.ok && /BACK/.test(titleOf(bt)) && back && fs.realpathSync(back.exe) !== fs.realpathSync(cbin) && !/--proxy-server/.test(back.cmd), `⑧ the switch back to chromium works: the same directory, the plain browser again (no proxy), the loopback page loads ("${titleOf(bt)}")`, { b5: (b5.out + b5.err).slice(0, 400), bt: (bt.out + bt.err).slice(0, 300), back: back ? { exe: back.exe, cmd: back.cmd.slice(0, 300) } : null, launchEnv: (kc.browserOf(cw.id) || {}).launchEnv, reopened: r5.json && r5.json.reopened });
        ok(kc.profile(cw.id).lastChromiumMajor >= 146 && kc.profile(cw.id).fingerprintSeed != null, '⑧ the profile keeps its seed and the highest Chromium major that wrote it', kc.profile(cw.id));
      } catch (e) { ok(false, '⑧ the cloak rung threw', e && (e.stack || e.message)); }
      finally {
        try { for (const p of kc.list().profiles) await kc.stop(p.id).catch(() => { }); } catch { /* none */ }
        try { trc.shutdown(); bridgeC.shutdown(); kc.shutdown(); } catch { /* none */ }
        R.setup({ keeper: k, activeSessions: active, browserEnv: () => be, adoptRoots: { homeDir: KH, dataDir: DATA }, notice: (sid, s, nn) => notices.push({ sid, n: nn }), persistPin: () => { }, tasksForSession: () => [] });
      }
    })();
  } catch (e) { ok(false, 'the legs threw', e && (e.stack || e.message)); }
  finally {
    try { for (const p of k.list().profiles) await k.stop(p.id).catch(() => { }); } catch { /* none */ }
    try { for (const e of k.ephemerals()) await k.stop(e.profileId).catch(() => { }); } catch { /* none */ }
    try { k.shutdown(); bridge.shutdown(); } catch { /* none */ }
    await new Promise((r) => srv.close(r));
  }
})();

cleanup();
console.log(fail ? `\n${fail} FAILED (${pass} passed${skipped ? ', ' + skipped + ' skipped' : ''})` : `\nALL PASS (${pass}${skipped ? ', ' + skipped + ' skipped' : ''})`);
process.exit(fail ? 1 : 0);
