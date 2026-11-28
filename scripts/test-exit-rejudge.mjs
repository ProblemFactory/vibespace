#!/usr/bin/env node
// test-exit-rejudge — THE AUTHORITY-CHANGE CENSUS (lane-pairing verify-r3, 2026-09-28). A conversation's reach to a
// machine's network (`use`) or commands (`run`) can be WITHDRAWN by more than the machine's "Who can use it" PATCH:
// two verify rounds found one writer at a time that did not re-judge (a Task Group change, a dead conversation, an
// import …), each leaving an OPEN connection carrying bytes or an "ask me each time" request waiting. The closure:
// every such writer ends in ONE re-judge (src/exit-proxy.js `rejudgeAll`) and this suite is
//   ① THE CENSUS, grep-derived over the tree: every method of src/hosts.js that writes a record's reach facts calls
//     `this._reachChanged(` (server.js → rejudgeAll); every src/task-groups.js method that moves membership calls
//     `this._notify()` (onChange → rejudgeAll); every `activeSessions.delete(` is preceded by `onSessionEnd`; every
//     write of a live session's reach facts (its conversation key, its fork flag, its cwd, its spawn group) is
//     followed by `broadcastActiveSessions()` (→ rejudgeAll), `adoptCapturedId` through each caller; the exit
//     manager's own writers (setAccess / onSessionEnd / onMachineUnpaired) call rejudgeAll and nothing else drops a
//     pair; + planted writers in patched TEXTS (a control per rule: each is caught);
//   ② ONE RUNTIME LEG PER EVENT on the REAL ExitProxyManager with a live forward over an echo "device SOCKS", the REAL
//     HostManager / TaskGroupManager / UserTodoManager in a scratch dir, wired exactly as server.js wires them: the
//     open connection stops carrying bytes, the waiting ask settles by name (its For-you item resolved `revoked` /
//     `conversation-gone`), the row (`view().usedBy`) no longer lists it — and the events that must NOT withdraw
//     (a re-pair, another holder) withdraw nothing;
//   ③ CONTROL: a copy of the manager whose re-judge judges nobody — the session-fact legs go red.
// Zero network beyond loopback, zero vendor calls. Run: node scripts/test-exit-rejudge.mjs
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mutantCopies } from './mutant-copy.mjs';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCR = scratch('exitrejudge');
fs.mkdirSync(SCR, { recursive: true });
process.on('exit', () => { try { fs.rmSync(SCR, { recursive: true, force: true }); } catch { } });
const T0 = Date.now();
process.setMaxListeners(64); // every world's stores register their own exit flush (≈ 1 per store × 18 worlds)

let pass = 0, fail = 0;
const ok = (c, n, d) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? '\n    ' + (typeof d === 'string' ? d : JSON.stringify(d)) : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// r1563 (B-7e49 slice 1, lane bl-tests-e): THE TREE ONCE A RUN — the census and each of its six planted controls called TEXTS(),
// which walked src/ again and read every file from disk; now the listing and every text are this suite's own memo. TEXTS()
// still returns NEW objects (a plant writes into them); only the strings are shared. A missing file still throws (not kept).
const TEXT = new Map();
const read = (rel) => { if (!TEXT.has(rel)) TEXT.set(rel, fs.readFileSync(path.join(REPO, rel), 'utf8')); return TEXT.get(rel); };

// ════════════════════════════════ ① THE CENSUS ════════════════════════════════
/** The 2-space-indented methods of a class file: [{name, line, body}] (header to the next header). */
function methodsOf(src) {
  const lines = src.split('\n'), out = [];
  const HEAD = /^ {2}(?:async\s+|static\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/;
  lines.forEach((l, i) => { const m = HEAD.exec(l); if (m && !['if', 'for', 'while', 'switch', 'catch', 'function'].includes(m[1])) out.push({ name: m[1], line: i + 1 }); });
  return out.map((m, k) => ({ ...m, body: lines.slice(m.line - 1, (out[k + 1] ? out[k + 1].line : lines.length + 1) - 1).join('\n') }));
}
/** ONE place for every census rule — texts in, violations out (so a control can feed planted texts). */
function census(T) {
  const v = [];
  // C1 — a host record's reach facts: its `exit`, the record itself (replaced / removed / reshaped)
  const HOST_WRITE = /\.exit\s*=(?!=)|delete\s+[\w.]+\.exit\b|this\._state\.hosts\s*=(?!=)|this\._state\.hosts\.(?:splice|pop|shift)\(|\bfn\(this\._state\)/;
  const HOST_EXEMPT = {
    constructor: 'boot: nothing is lent yet', _load: 'boot: nothing is lent yet',
    setLastRun: 'lifts a pre-migration record through migrateExitAccess — the same verdict by construction (test-exit-reach pins the rule), then writes lastRun only',
  };
  for (const m of methodsOf(T.hosts)) if (HOST_WRITE.test(m.body) && !HOST_EXEMPT[m.name] && !/this\._reachChanged\(/.test(m.body)) v.push(`hosts.js ${m.name}() writes a record's reach facts without this._reachChanged(…)`);
  // C2 — Task Group membership: the tasks map, a group's sessions / folders / archived
  const TASK_WRITE = /this\._state\.tasks\[[^\]]*\]\s*=(?!=)|delete\s+this\._state\.tasks\[|\.sessions\s*=(?!=)|\.sessions\.(?:push|splice|pop|shift)\(|\.folders\s*=(?!=)|\.archived\s*=(?!=)|this\._state\s*=(?!=)/;
  const TASK_EXEMPT = { constructor: 'boot', _load: 'boot', _migrateGroups: 'boot (the constructor\'s one-time migration)', _afterLoad: 'boot (the constructor\'s own body, moved whole by lane bl-windows — a held store\'s late load notifies in readAgain)' };
  for (const m of methodsOf(T.tasks)) if (TASK_WRITE.test(m.body) && !TASK_EXEMPT[m.name] && !/this\._notify\([^)]*\)/.test(m.body)) v.push(`task-groups.js ${m.name}() moves membership without this._notify()`);   // lane task-group-fanout: _notify(ids) names the groups
  // «make room» 2026-11-17: moved whole out of server.js: the store is built in src/server/task-groups-wiring.js createStore — server.js hands it the exitProxy getter
  if (!/const tasks = new TaskGroupManager\(\{[\s\S]{0,900}?onChange: \(ch\) => \{[\s\S]{0,400}?exitProxy\(\)\.rejudgeAll\(/.test(T.tgw) || !/task-groups-wiring\.js'\)\.createStore\(\{[^}\n]*\bexitProxy: \(\) => exitProxy\b/.test(T.server)) v.push('server.js: the TaskGroupManager onChange does not call exitProxy.rejudgeAll (src/server/task-groups-wiring.js createStore, or the getter server.js hands it)');
  if (!/\nhosts\.onReachChange = \(why\) => exitProxy\.rejudgeAll\(/.test(T.server)) v.push('server.js: hosts.onReachChange is not exitProxy.rejudgeAll');
  // C3 — the conversation's END: every removal from the live map tells the manager first
  for (const [file, src] of Object.entries(T.sessionFiles)) {
    const lines = src.split('\n');
    lines.forEach((l, i) => { if (/\bactiveSessions\.delete\(/.test(l) && !/^\s*\/\//.test(l)) { const pre = lines.slice(Math.max(0, i - 2), i).join('\n'); if (!/onSessionEnd\?*\.?\(/.test(pre)) v.push(`${file}:${i + 1} removes a session from the live map without onSessionEnd right before`); } });
  }
  // C4 — a live session's own reach facts (its conversation key, its fork flag, its cwd, its spawn group)
  const FACT = /\b(?:session|s|sess)\.(?:claudeSessionId|backendSessionId|_forkRequested|_initialGroupId|cwd)\s*=(?!=)/;
  for (const [file, src] of Object.entries(T.sessionFiles)) {
    const lines = src.split('\n');
    const inAdopt = (i) => file === 'src/claude-lock-capture.js' && /function adoptCapturedId\(/.test(lines.slice(Math.max(0, i - 12), i + 1).join('\n'));
    lines.forEach((l, i) => {
      if (!FACT.test(l) || /^\s*\/\//.test(l)) return;
      if (inAdopt(i)) return; // its callers are checked below
      const ahead = lines.slice(i + 1, i + 81).join('\n');
      if (!/broadcastActiveSessions\(\)/.test(ahead)) v.push(`${file}:${i + 1} moves a live session's reach fact without broadcastActiveSessions() within 80 lines`);
    });
    lines.forEach((l, i) => {
      if (!/\badoptCapturedId\(/.test(l) || /function adoptCapturedId|require\(|^\s*\/\//.test(l)) return;
      if (!/broadcastActiveSessions\(\)/.test(lines.slice(i + 1, i + 31).join('\n'))) v.push(`${file}:${i + 1} adopts a captured id without broadcastActiveSessions() within 30 lines`);
    });
  }
  if (!/function broadcastActiveSessions\(\) \{[^\n]*\n\s*try \{ exitProxy\.rejudgeAll\('sessions'\); \} catch \{ \}/.test(T.server)) v.push('server.js: broadcastActiveSessions does not call exitProxy.rejudgeAll');
  // C5 — the exit manager's own writers end in THE ONE re-judge; nothing else drops a pair
  const X = methodsOf(T.exit);
  for (const n of ['setAccess', 'onSessionEnd', 'onMachineUnpaired']) { const m = X.find((x) => x.name === n); if (!m || !/this\.rejudgeAll\(/.test(m.body)) v.push(`exit-proxy.js ${n}() does not end in this.rejudgeAll(…)`); }
  for (const m of X) if (/this\._dropCred\(/.test(m.body) && !['rejudgeAll', '_credOk', '_dropCred'].includes(m.name)) v.push(`exit-proxy.js ${m.name}() drops a pair outside the re-judge`);
  for (const m of X) if (/'revoked'\)/.test(m.body) && /this\._asks\.values\(\)/.test(m.body) && m.name !== 'rejudgeAll') v.push(`exit-proxy.js ${m.name}() runs a second ask re-judge loop`);
  // C6 — a machine's un-pairing tells the manager (the routes; before its record goes)
  if (!/exitProxy\.onMachineUnpaired\(/.test(T.dialPairing)) v.push('dial-pairing.js unpairDialDevice does not call exitProxy.onMachineUnpaired');
  // (lane ui-needs-a-button, verifier #3: the removal is ONE function, removeHost — DELETE /api/hosts/:id and a machine replaced by
  // POST /api/hosts `replaces` both go through it)
  if (!/try \{ exitProxy\.onMachineUnpaired\(h\.id\); \} catch \{ \}\s*\n\s*hosts\.remove\(h\.id\);/.test(T.exitRoutes) || !/app\.delete\('\/api\/hosts\/:id'[^\n]*\n(?:\s*if \(hosts\.unreadWords && hosts\.unreadWords\(\)\) return res\.status\(503\)[^\n]*\n)?[^\n]*\n\s*await removeHost\(hosts\.get\(req\.params\.id\)\);/.test(T.exitRoutes)) v.push('exit-routes.js DELETE /api/hosts/:id (removeHost) does not call exitProxy.onMachineUnpaired before hosts.remove');
  return v;
}
let SESSION_FILES = null;
const sessionFileList = () => SESSION_FILES || (SESSION_FILES = (() => {
  const out = ['server.js'];
  const walk = (d) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const r = path.join(d, e.name); if (e.isDirectory()) { if (r !== path.join('src', 'lib')) walk(r); } else if (e.name.endsWith('.js')) out.push(r); } };
  walk('src');
  return out;
})());
const TEXTS = () => ({
  hosts: read('src/hosts.js'), tasks: read('src/task-groups.js'), server: read('server.js'), tgw: read('src/server/task-groups-wiring.js'), exit: read('src/exit-proxy.js'),
  dialPairing: read('src/server/dial-pairing.js'), exitRoutes: read('src/server/exit-routes.js'),
  sessionFiles: Object.fromEntries(sessionFileList().map((f) => [f, read(f)])),
});
console.log('① the census');
{
  const T = TEXTS();
  const v = census(T);
  ok(v.length === 0, `every writer that can withdraw reach names THE ONE re-judge (${Object.keys(T.sessionFiles).length} files scanned)`, v);
  // the census is not vacuous: it FOUND the writers it judges
  const hostW = methodsOf(T.hosts).filter((m) => /this\._reachChanged\(/.test(m.body)).map((m) => m.name).sort();
  ok(JSON.stringify(hostW) === JSON.stringify(['_loadAnswer', 'importBundle', 'remove', 'reshapeStore', 'setExitAccess']), 'hosts.js: the five record writers found (_loadAnswer — a held hosts.json read again mid-life, the B-f276 remainder — importBundle, remove, reshapeStore, setExitAccess)', hostW);
  const taskW = methodsOf(T.tasks).filter((m) => /this\._notify\([^)]*\)/.test(m.body)).length;
  ok(taskW >= 6, `task-groups.js: ${taskW} membership writers found, each notifying`);
  const dels = Object.entries(T.sessionFiles).flatMap(([f, s]) => s.split('\n').map((l, i) => (/\bactiveSessions\.delete\(/.test(l) && !/^\s*\/\//.test(l) ? `${f}:${i + 1}` : null)).filter(Boolean));
  ok(dels.length >= 2, `the conversation's end: ${dels.length} removal sites found (${dels.join(', ')})`);
  const facts = Object.entries(T.sessionFiles).flatMap(([f, s]) => s.split('\n').map((l, i) => (/\b(?:session|s|sess)\.(?:claudeSessionId|backendSessionId|_forkRequested|_initialGroupId|cwd)\s*=(?!=)/.test(l) && !/^\s*\/\//.test(l) ? `${f}:${i + 1}` : null)).filter(Boolean));
  ok(facts.length >= 10 && new Set(facts.map((x) => x.split(':')[0])).size >= 5, `a live session's reach facts: ${facts.length} write sites in ${new Set(facts.map((x) => x.split(':')[0])).size} files found`, facts);
  // CONTROLS: a planted writer per rule is caught
  const plant = (k, from, to) => { const T2 = TEXTS(); if (k.includes('/')) { T2.sessionFiles[k] = T2.sessionFiles[k].replace(from, to); } else T2[k] = T2[k].replace(from, to); return census(T2); };
  let c = plant('hosts', '\n  setLastRun(id, rec) {', '\n  sneak(id) {\n    this.get(id).exit = { use: { mode: \'nobody\' } };\n    this._save();\n  }\n  setLastRun(id, rec) {');
  ok(verdictOf(c.some((x) => /hosts\.js sneak\(\)/.test(x))), 'CONTROL C1: a planted hosts.js method rewriting `exit` without _reachChanged is caught', c);
  c = plant('tasks', '\n  bind(id, sessionKey) {', '\n  sneakUnbind(id, key) {\n    const t = this.get(id);\n    t.sessions.splice(t.sessions.indexOf(key), 1);\n    this._save();\n  }\n  bind(id, sessionKey) {');
  ok(verdictOf(c.some((x) => /task-groups\.js sneakUnbind\(\)/.test(x))), 'CONTROL C2: a planted Task Group unbind without _notify is caught', c);
  c = plant('src/ws-handler.js', 'try { getExitProxy()?.onSessionEnd?.(session, data.sessionId); } catch { }', 'try { } catch { }');
  ok(verdictOf(c.some((x) => /src\/ws-handler\.js:\d+ removes a session/.test(x))), 'CONTROL C3: the kill path without onSessionEnd is caught', c);
  c = plant('src/server/stdout/acp-events.js', '              session.claudeSessionId = null;', '              session.claudeSessionId = null;\n' + '\n'.repeat(90) + '              session.backendSessionId = msg.sessionId + "x";');
  ok(verdictOf(c.some((x) => /acp-events\.js:\d+ moves a live session's reach fact/.test(x))), 'CONTROL C4: a planted key write with no broadcast after it is caught', c);
  c = plant('server', "  try { exitProxy.rejudgeAll('sessions'); } catch { }", '  ;');
  ok(verdictOf(c.some((x) => /broadcastActiveSessions does not call/.test(x))), 'CONTROL C4b: broadcastActiveSessions without the re-judge is caught', c);
  c = plant('exit', "    await this.rejudgeAll('access-changed').done;", "    for (const k of [...this._asks.values()]) { if (k.hostId === hostId) this._settleAsk(k, 'denied', 'revoked'); }");
  ok(gateOf(c.some((x) => /setAccess\(\) does not end in this\.rejudgeAll/.test(x))) && verdictOf(c.some((x) => /setAccess\(\) runs a second ask re-judge loop/.test(x))), 'CONTROL C5: a setAccess with its own loop instead of THE ONE re-judge is caught', c);
}

// ════════════════════════════════ ② ONE RUNTIME LEG PER EVENT ════════════════════════════════
const { ExitProxyManager } = require('../src/exit-proxy.js');
const { HostManager } = require('../src/hosts.js');
const { TaskGroupManager } = require('../src/task-groups.js');
const { UserTodoManager } = require('../src/user-todos.js');
const { adoptCapturedId } = require('../src/claude-lock-capture.js');
const GM = require('../src/grant-model.js');
const GS = require('../src/server/grants-store.js');
const echoPort = await new Promise((r) => { const s = net.createServer((c) => c.on('data', (d) => c.write(Buffer.concat([Buffer.from('EX:'), d])))); s.listen(0, '127.0.0.1', () => r(s.address().port)); s.unref(); });
let runs = 0;
const mkDevice = () => ({
  async serveSocks() { return { port: echoPort }; },
  async tcpForward(port) { const sock = net.connect(port, '127.0.0.1'); const h = { onData: null, onClose: null, write: (b) => sock.write(b), close: () => sock.destroy() }; sock.on('data', (b) => h.onData?.(b)); sock.on('close', () => h.onClose?.()); sock.on('error', () => h.onClose?.()); return h; },
  async unserveSocks() { return { closed: true }; },
  async runCmd() { runs++; return { code: 0, stdout: 'ran', stderr: '', truncated: false, timedOut: false }; },
});
const credsOf = (url) => { const m = /^socks5h:\/\/([^:]+):([^@]+)@127\.0\.0\.1:(\d+)$/.exec(url); return m && { user: m[1], pass: m[2], port: Number(m[3]) }; };
const openConn = (port, c) => new Promise((resolve) => { const s = net.connect(port, '127.0.0.1', () => s.write(Buffer.from([0x05, 1, 0x02]))); let st = 0, got = ''; s.on('data', (d) => { if (st === 0) { st = 1; s.write(Buffer.concat([Buffer.from([0x01, c.user.length]), Buffer.from(c.user), Buffer.from([c.pass.length]), Buffer.from(c.pass)])); } else if (st === 1) { st = 2; resolve({ s, got: () => got }); } else got += d; }); s.on('error', () => {}); setTimeout(() => resolve({ s, got: () => got }), 2000); });
const talk = async (o, msg) => { if (o.s.destroyed) return ''; o.s.write(msg); await sleep(120); return o.s.destroyed ? '' : o.got(); };
const closed = (o, ms = 1000) => new Promise((res) => { if (o.s.destroyed) return res(true); o.s.once('close', () => res(true)); setTimeout(() => res(false), ms); });
const auth = (port, c) => new Promise((resolve) => { const s = net.connect(port, '127.0.0.1', () => s.write(Buffer.from([0x05, 1, 0x02]))); let st = 0; s.on('data', (d) => { if (st === 0) { st = 1; s.write(Buffer.concat([Buffer.from([0x01, c.user.length]), Buffer.from(c.user), Buffer.from([c.pass.length]), Buffer.from(c.pass)])); } else { s.destroy(); resolve(d[1]); } }); s.on('error', () => resolve(-1)); setTimeout(() => { s.destroy(); resolve(-2); }, 1500); });

/** A world wired EXACTLY as server.js wires it. */
let wn = 0;
function world(Mgr = ExitProxyManager, dir = path.join(SCR, `w${++wn}`)) {
  fs.mkdirSync(dir, { recursive: true });
  const sessions = new Map();
  const hosts = new HostManager({ dataDir: dir });
  hosts.deviceBounded = async () => mkDevice(); hosts.dialOnline = () => true;
  let ex = null;
  const tasks = new TaskGroupManager({ dataDir: dir, onChange: () => { try { ex.rejudgeAll('task-groups'); } catch { } } });
  const todos = new UserTodoManager({ dataDir: dir, onChange: () => {}, expirySweepMs: 0 });
  const grants = GS.create({ dataDir: dir });   // lane grants-unify: THE store the lists live in
  const sessionStatusKey = (s, id) => { const b = s?.backendSessionId || s?.claudeSessionId; return b ? `${s.backend || 'claude'}:${b}` : `webui:${id}`; };
  ex = new Mgr({ hosts, grants, userTodos: todos, sessionsMap: () => sessions, log: () => {}, groupsOf: (s, id) => tasks.memberIds({ sessionKey: sessionStatusKey(s, id), cwd: s.cwd, hostId: s.host || null, initialGroupId: s._initialGroupId, initialGroupIds: s._initialGroupIds }), lineageOf: (ids) => tasks.grantGroupsOf(ids).inherited });   // + the lineage, as server.js wires it (lane lg-group-parents U3a)
  hosts.onReachChange = (why) => ex.rejudgeAll(`hosts-${why}`);          // server.js (A-r3a)
  grants.onChange(({ door }) => { if (door === 'exit') { try { ex.rejudgeAll('grants'); } catch { } } });   // server.js (lane grants-unify)
  const broadcastActiveSessions = () => { try { ex.rejudgeAll('sessions'); } catch { } }; // server.js (the census's C4)
  const kill = (id) => { ex.onSessionEnd(sessions.get(id), id); sessions.delete(id); broadcastActiveSessions(); }; // ws-handler + session-stdout order
  const unpair = (hid) => { ex.onMachineUnpaired(hid); hosts.remove(hid); };                                         // exit-routes DELETE order
  return { dir, sessions, hosts, tasks, todos, grants, ex, broadcastActiveSessions, kill, unpair };
}
// lane grants-unify: both lists as rows of the ONE store (a `<backend>:<cid>` key in the ONE spelling), the ask on the record
const grantBoth = (w, hid, who) => { const to = who.map((p) => GM.fromSessionPrincipal(p)); w.grants.setMany([{ door: 'exit', resource: `${hid}:use`, to }, { door: 'exit', resource: `${hid}:run`, to }]); w.hosts.setExitAccess(hid, { ask: true, updatedAt: 1 }); };
/** Arm a leg: session `id` holds an OPEN connection through the machine and a waiting ask on it. */
async function arm(w, hid, id, { ask = true } = {}) {
  const S = w.sessions.get(id);
  const r = await w.ex.use(S, id, 'Box');
  const cr = credsOf(r.url);
  const o = await openConn(r.localPort, cr);
  const carried = (await talk(o, 'one')).includes('EX:one');
  let p = null, item = null;
  if (ask) {
    p = w.ex.run(S, id, 'Box', 'id').then((v) => ({ v }), (e) => ({ e }));
    await sleep(20);
    const k = w.ex.listAsks().find((a) => a.sessionId === id);
    item = k && (w.todos.snapshot().open || []).find((it) => it.action && it.action.askId === k.askId);
  }
  return { o, cr, port: r.localPort, carried, p, item };
}
/** What the leg saw after the event. */
async function outcome(w, hid, id, a, waitMs = 1000) {
  const cut = await closed(a.o, waitMs);
  const after = await talk(a.o, 'two');
  const r = a.p ? await Promise.race([a.p, sleep(waitMs).then(() => ({ waiting: true }))]) : null;
  const it = a.item ? w.todos.get(a.item.id) : null;
  let usedBy = null; try { usedBy = w.ex.view(hid).usedBy; } catch { usedBy = { use: [], run: [], gone: true }; }
  const pair = await auth(a.port, a.cr);
  return { cut, bytes: after.includes('EX:two'), code: r ? (r.e ? r.e.code : r.waiting ? 'waiting' : 'ran') : null, resolvedBy: it ? it.resolvedBy : null, listed: usedBy.use.some((u) => u.sessionId === id), asks: usedBy.run.filter((k) => k.sessionId === id).length, pair };
}
const withdrawn = (x, askCode, resolvedBy) => x.cut && !x.bytes && (askCode === null || (x.code === askCode && x.resolvedBy === resolvedBy)) && !x.listed && x.asks === 0 && x.pair !== 0;
async function leg(name, { setup, event, askCode = 'not_granted', resolvedBy = 'revoked', ask = true, Mgr, expect = 'withdrawn', waitMs = 1000 }) {
  const w = world(Mgr);
  const hid = w.hosts.add({ name: 'Box', user: 'u', host: 'box.invalid' });
  const id = await setup(w, hid);
  const a = await arm(w, hid, id, { ask });
  const pre = a.carried && (!ask || !!a.item);
  await event(w, hid, id);
  const x = await outcome(w, hid, id, a, expect === 'withdrawn' ? waitMs : 300);
  const res = expect === 'withdrawn' ? pre && withdrawn(x, ask ? askCode : null, resolvedBy) : pre && !x.cut && x.bytes && x.listed;
  try { a.o.s.destroy(); } catch { }
  for (const k of w.ex.listAsks()) { try { w.ex.answerAsk(k.askId, { answer: 'deny', by: 'user' }); } catch { } }
  if (a.p) await Promise.race([a.p, sleep(200)]);
  for (const [k] of w.ex._live) await w.ex.stop(k);
  w.todos.stop();
  return { name, ok: res, pre, x };
}
const S = (key, extra = {}) => ({ name: 'agent', backend: 'claude', claudeSessionId: key, cwd: '/x', ...extra });
const EVENTS = [
  ['the machine row\'s "Who can use it" PATCH', {
    setup: (w, hid) => { w.sessions.set('w1', S('c1')); grantBoth(w, hid, [{ kind: 'session', id: 'claude:c1' }]); return 'w1'; },
    event: (w, hid) => w.ex.setAccess(hid, { use: { mode: 'nobody' }, run: { mode: 'nobody', ask: false } }) }],
  ['a Task Group membership change (unbind)', {
    setup: (w, hid) => { const g = w.tasks.create({ title: 'G', sessions: ['claude:c1'] }); w.g = g; w.sessions.set('w1', S('c1')); grantBoth(w, hid, [{ kind: 'group', id: g.id }]); return 'w1'; },
    event: (w) => w.tasks.unbind(w.g.id, 'claude:c1') }],
  ['a Task Group DELETE', {
    setup: (w, hid) => { const g = w.tasks.create({ title: 'G', sessions: ['claude:c1'] }); w.g = g; w.sessions.set('w1', S('c1')); grantBoth(w, hid, [{ kind: 'group', id: g.id }]); return 'w1'; },
    event: (w) => w.tasks.remove(w.g.id) }],
  ['a Task Group archive', {
    setup: (w, hid) => { const g = w.tasks.create({ title: 'G', sessions: ['claude:c1'] }); w.g = g; w.sessions.set('w1', S('c1')); grantBoth(w, hid, [{ kind: 'group', id: g.id }]); return 'w1'; },
    event: (w) => w.tasks.update(w.g.id, { archived: true }) }],
  ['the folder rule: the group\'s folders edited', {
    setup: (w, hid) => { const g = w.tasks.create({ title: 'G', folders: [{ path: '/work/a', recursive: true }] }); w.g = g; w.sessions.set('w1', S('c1', { cwd: '/work/a/x' })); grantBoth(w, hid, [{ kind: 'group', id: g.id }]); return 'w1'; },
    event: (w) => w.tasks.update(w.g.id, { folders: [] }) }],
  ['the folder rule: the session\'s cwd moves (codex / ACP thread cwd)', {
    setup: (w, hid) => { const g = w.tasks.create({ title: 'G', folders: [{ path: '/work/a', recursive: true }] }); w.sessions.set('w1', { name: 'cx', backend: 'codex', backendSessionId: 'T1', cwd: '/work/a/x' }); grantBoth(w, hid, [{ kind: 'group', id: g.id }]); return 'w1'; },
    event: (w) => { w.sessions.get('w1').cwd = '/elsewhere'; w.broadcastActiveSessions(); } }],
  ['a codex thread change (the conversation key moves)', {
    setup: (w, hid) => { w.sessions.set('w1', { name: 'cx', backend: 'codex', backendSessionId: 'T1', cwd: '/x' }); grantBoth(w, hid, [{ kind: 'session', id: 'codex:T1' }]); return 'w1'; },
    event: (w) => { const s = w.sessions.get('w1'); s.backendSessionId = 'T2'; s.claudeSessionId = null; w.broadcastActiveSessions(); } }],
  ['a pending fork\'s adoption (its parent\'s explicit group was its only grant)', { ask: false,
    setup: (w, hid) => { const g = w.tasks.create({ title: 'G', sessions: ['claude:P'] }); w.sessions.set('wf', { name: 'fork', backend: 'claude', claudeSessionId: 'P', backendSessionId: 'P', _forkRequested: true, _forkSourceId: 'P', cwd: '/x' }); grantBoth(w, hid, [{ kind: 'group', id: g.id }]); return 'wf'; },
    event: (w) => { adoptCapturedId(w.sessions.get('wf'), 'F2'); w.broadcastActiveSessions(); } }],
  ['the conversation\'s END — killed (onSessionEnd BEFORE it leaves the map)', { askCode: 'conversation_gone', resolvedBy: 'conversation-gone',
    setup: (w, hid) => { w.sessions.set('w1', S('c1')); grantBoth(w, hid, [{ kind: 'session', id: 'claude:c1' }]); return 'w1'; },
    event: (w, hid, id) => w.kill(id) }],
  ['the conversation\'s END — its process exited (the stdout exit path, same order)', { askCode: 'conversation_gone', resolvedBy: 'conversation-gone',
    setup: (w, hid) => { w.sessions.set('w1', S('c1')); grantBoth(w, hid, [{ kind: 'session', id: 'claude:c1' }]); return 'w1'; },
    event: (w, hid, id) => { w.ex.onSessionEnd(w.sessions.get(id), id); w.sessions.delete(id); } }],
  ['the conversation resumed ELSEWHERE (the old webui session ends; the new one holds nothing of it)', { askCode: 'conversation_gone', resolvedBy: 'conversation-gone',
    setup: (w, hid) => { w.sessions.set('w1', S('c1')); grantBoth(w, hid, [{ kind: 'session', id: 'claude:c1' }]); return 'w1'; },
    event: (w, hid, id) => { w.sessions.set('w2', S('c1')); w.kill(id); } }],
  ['the machine un-paired (onMachineUnpaired, then its record removed)', {
    setup: (w, hid) => { w.sessions.set('w1', S('c1')); grantBoth(w, hid, [{ kind: 'session', id: 'claude:c1' }]); return 'w1'; },
    event: (w, hid) => w.unpair(hid) }],
  ['Settings → Import config narrowing the machine\'s lists (A-r3a)', {
    setup: (w, hid) => { w.sessions.set('w1', S('c1')); grantBoth(w, hid, [{ kind: 'session', id: 'claude:c1' }]); return 'w1'; },
    event: (w) => { const recs = JSON.parse(JSON.stringify(w.hosts.exportBundle().hosts)); recs[0].exit = { use: { mode: 'nobody' }, run: { mode: 'nobody', ask: false }, updatedAt: 2 }; const b = { hosts: recs, keys: {} }; w.hosts.importBundle(b); w.ex.importLists(b); } }],   // persistence.js's order (lane grants-unify: an older bundle's lists mapped into the store)
  ['Settings → Import config without the machine (a rename by import is the same write)', {
    setup: (w, hid) => { w.sessions.set('w1', S('c1')); grantBoth(w, hid, [{ kind: 'session', id: 'claude:c1' }]); return 'w1'; },
    event: (w) => w.hosts.importBundle({ hosts: [], keys: {} }) }],
];
console.log('② one runtime leg per event (the REAL manager + stores, a live forward, a waiting ask)');
for (const [name, spec] of EVENTS) {
  const r = await leg(name, spec);
  ok(verdictOf(r.ok), `${name} ⇒ the open connection stops carrying bytes, ${spec.ask === false ? '' : `the ask settles ${spec.askCode || 'not_granted'} (item ${spec.resolvedBy || 'revoked'}), `}the row no longer lists it, its pair is refused`, r);
}
// the events that must NOT withdraw
{
  const r = await leg('a re-pair of the machine (a rotated dial token)', { expect: 'kept', ask: false,
    setup: (w, hid) => { w.sessions.set('w1', S('c1')); grantBoth(w, hid, [{ kind: 'session', id: 'claude:c1' }]); return 'w1'; },
    event: (w) => { const d = w.hosts.add({ name: 'Mac', transport: 'dial', deviceId: 'mac1' }); w.hosts.setDialToken('mac1', 'ab'.repeat(32)); w.hosts.setDialToken('mac1', 'cd'.repeat(32)); return d; } });
  ok(verdictOf(r.ok), 'a RE-PAIR withdraws nothing: the machine keeps its lists (the device link is what a rotation cuts — B8-r2), the connection is kept', r);
  const r2 = await leg('another holder\'s conversation ends', { expect: 'kept', ask: false,
    setup: (w, hid) => { w.sessions.set('w1', S('c1')); w.sessions.set('w9', S('c9')); grantBoth(w, hid, [{ kind: 'session', id: 'claude:c1' }, { kind: 'session', id: 'claude:c9' }]); return 'w1'; },
    event: (w) => w.kill('w9') });
  ok(verdictOf(r2.ok), 'another conversation ending withdraws nothing from this one', r2);
}
// the grant's own expiry: there is none — a stored grant carries no clock (the reader drops it); the ASK's 60 s is the one clock
{
  const E = require('../src/exit-reach.js');
  const acc = E.exitAccessOf({ exit: { use: { mode: 'everyone', expiresAt: 1, until: 1 }, run: { mode: 'nobody', expiresAt: 1 } } });
  ok(!('expiresAt' in acc.use) && !('until' in acc.use) && !('expiresAt' in acc.run), 'a grant has no expiry of its own: the reader drops any clock a record carries (nothing to census)');
  const timers = new Map(); let tid = 0;
  const w = world(ExitProxyManager);
  w.ex.timers = { set: (fn) => { const i = ++tid; timers.set(i, fn); return i; }, clear: (i) => timers.delete(i) };
  const hid = w.hosts.add({ name: 'Box', user: 'u', host: 'box.invalid' });
  w.sessions.set('w1', S('c1')); grantBoth(w, hid, [{ kind: 'session', id: 'claude:c1' }]);
  const a = await arm(w, hid, 'w1');
  for (const fn of [...timers.values()]) fn();
  const x = await Promise.race([a.p, sleep(1000).then(() => ({ waiting: true }))]);
  ok(gateOf(x.e) && x.e.code === 'ask_expired' && w.todos.get(a.item.id).resolvedBy === 'ask-expired' && w.ex.view(hid).usedBy.run.length === 0, 'the ask\'s own 60 s expiry settles it (ask_expired, the item resolved ask-expired, the row lists no ask)', { code: x.e && x.e.code, by: w.todos.get(a.item.id).resolvedBy });
  a.o.s.destroy(); for (const [k] of w.ex._live) await w.ex.stop(k); w.todos.stop();
}
// the ask answered by another client
{
  const w = world(ExitProxyManager);
  const hid = w.hosts.add({ name: 'Box', user: 'u', host: 'box.invalid' });
  w.sessions.set('w1', S('c1')); grantBoth(w, hid, [{ kind: 'session', id: 'claude:c1' }]);
  const a = await arm(w, hid, 'w1');
  const askId = w.ex.listAsks()[0].askId;
  const r0 = runs;
  const first = w.ex.answerAsk(askId, { answer: 'allow', by: 'user' });
  let second; try { second = w.ex.answerAsk(askId, { answer: 'deny', by: 'user' }); } catch (e) { second = e.code; }
  const x = await a.p;
  ok(first.state === 'allowed' && second === 'ask_settled' && gateOf(x.v) && runs === r0 + 1 && w.todos.get(a.item.id).resolvedBy === 'allowed', 'the ask answered by ANOTHER client: the first answer runs once, the second hears ask_settled, the item says allowed', { first, second, runs: runs - r0, by: w.todos.get(a.item.id).resolvedBy });
  a.o.s.destroy(); for (const [k] of w.ex._live) await w.ex.stop(k); w.todos.stop();
}
// a HUB RESTART: the process that lent the machine is gone — its forward, its pairs and its waiting asks with it; the
// sessions come back (restoreSessions) holding the old url, which opens nothing; the dead process's ask item resolves
{
  const dir = path.join(SCR, 'restart'); fs.mkdirSync(dir, { recursive: true });
  const w = world(ExitProxyManager, dir);
  const hid = w.hosts.add({ name: 'Box', user: 'u', host: 'box.invalid' });
  // r2969 / r2976 (主开发; placed by reading: work/place-exit-rejudge.md of lane bl-machines-b): the scene is a hub whose machine was
  // added long before it died — ON DISK. hosts.json is written through the store writer: an URGENT write (its _save asks durable()),
  // queued on the writer's one thread behind the process's other stores' writes, then its IO; the death below runs no code (no exit
  // flush), so the leg waits for the scene's machine writes to land — a fact; before, a loaded gate's second world read hosts.json
  // before the first one's write landed and started with no machines
  w.sessions.set('w1', S('c1')); grantBoth(w, hid, [{ kind: 'session', id: 'claude:c1' }]);
  const landed = await w.hosts.persisted();   // its read: after the machine's own access write too (grantBoth's setExitAccess)
  const a = await arm(w, hid, 'w1');
  // the process dies: its listening socket and every connection with it; nothing settles (no code runs)
  const live = w.ex._live.get(hid); for (const s of live.sockets) s.destroy(); live.server.close();
  for (const k of w.ex._asks.values()) { try { w.ex.timers.clear(k.timer); } catch { } }
  w.todos.stop();
  const cut = await closed(a.o);
  // the new process over the SAME data dir; restoreSessions brings w1 back under the same id
  const w2 = world(ExitProxyManager, dir);
  w2.sessions.set('w1', S('c1'));
  const n = w2.ex.reconcileAsks();
  const it = w2.todos.get(a.item.id);
  const refused = await auth(a.port, a.cr); // the old port is closed (ECONNREFUSED) — or, were it reused, the pair is unknown
  ok(gateOf(cut) && n === 1 && it.status === 'done' && it.resolvedBy === 'ask-expired' && w2.ex.listAsks().length === 0 && !w2.ex._live.size && refused !== 0 && w2.ex._credOk(hid, a.cr.user, a.cr.pass) === false,
    'a HUB RESTART: the open connection died with the process, the dead ask\'s item resolves ask-expired at boot, nothing is lent, the old pair opens nothing', { cut, n, by: it && it.resolvedBy, refused });
  const r2 = await w2.ex.use(w2.sessions.get('w1'), 'w1', 'Box').catch((e) => ({ error: String((e && e.message) || e) }));   // a refusal is a named cross, never an unhandled crash
  ok(landed === true && !r2.error && credsOf(r2.url).pass !== a.cr.pass, '…a `use` after the restart mints a NEW pair (never the old one) — the machine on disk before its hub died', { landed, error: r2.error });
  for (const [k] of w2.ex._live) await w2.ex.stop(k); w2.todos.stop();
}

// r2969 RED, made by STATE (never load): the machine's write still QUEUED when its hub dies — a writer whose write never lands — and
// no wait: the next life over the same folder starts with no machines, and the use is refused BY NAME (the gates' crash, at will)
{
  const dir = path.join(SCR, 'restart-held'); fs.mkdirSync(dir, { recursive: true });
  const w = world(ExitProxyManager, dir);
  w.hosts._storeWriter = { dirty() { }, durable: () => new Promise(() => { }), whyNotDurable: () => ({ why: 'queued' }) };   // its write queued, never landed
  w.hosts.add({ name: 'Box', user: 'u', host: 'box.invalid' });
  const guard = await Promise.race([w.hosts.persisted().then(() => 'landed'), new Promise((r) => setTimeout(() => r('pending'), 50))]);   // its read: the GUARD pinned too — the wait the leg relies on is still pending while its write is queued
  const w2 = world(ExitProxyManager, dir); w2.sessions.set('w1', S('c1'));
  const r = await w2.ex.use(w2.sessions.get('w1'), 'w1', 'Box').then((x) => x, (e) => ({ error: String((e && e.message) || e) }));
  ok(guard === 'pending' && !!r.error && gateOf(/no machine matches/.test(r.error)) && !w2.hosts.list().some((h) => h.name === 'Box'),
    'RED (by state): the machine\'s write still queued when its hub dies — its wait still pending, the next life has no «Box» and the use is refused by name; the restart leg above waits for the landing', { guard, ...r });
  w.todos.stop(); w2.todos.stop();
}

// ════════════════════════════════ ③ CONTROL ════════════════════════════════
console.log('③ control (a patched copy)');
{
  const M = mutantCopies('exitrejudge', REPO);
  const src = read('src/exit-proxy.js');
  const patched = editAnchor(editAnchor(src, "        for (const sid of new Set([...live.users, ...(live.bySession ? live.bySession.keys() : [])])) {", '        for (const sid of []) {', "src/exit-proxy.js"),
    "        const kwhy = !s ? 'conversation-gone' : (endedH.has(k.hostId) || (() => { const c = this.ctxFor(s, k.sessionId); return this._endsOn(E.exitVerdict(this.access(k.hostId), 'run', c), c); })()) ? 'revoked' : null;", '        const kwhy = null;', "src/exit-proxy.js");
  ok(patched !== src && patched.split('for (const sid of [])').length === 2 && verdictOf(patched.includes('const kwhy = null;')), '(the control patch applies: a re-judge that judges nobody)');
  const { ExitProxyManager: Dead } = M.load('src/exit-proxy.js', patched, 'judgesnobody');
  const picks = EVENTS.filter(([n]) => /cwd moves|codex thread change|Import config narrowing|Task Group DELETE/.test(n));
  for (const [name, spec] of picks) {
    const r = await leg(name, { ...spec, Mgr: Dead, waitMs: 300 });
    ok(!r.ok && verdictOf(r.x.bytes), `CONTROL: with a re-judge that judges nobody "${name}" leaves the open connection carrying bytes — the leg above goes red`, r);
  }
}

console.log(`\n${fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`} — ${Date.now() - T0} ms`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
