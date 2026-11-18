#!/usr/bin/env node
// test-exit-cost — B-48a4 (the owner's incident inc-mwlgtu4o-uosz, 2026-11-18: about 1.5 exit commands a second for ten minutes held
// the hub's main loop 200 s in an hour; one command took 15–19 s to answer). THE LAW: A COMMAND THROUGH A MACHINE'S EXIT COSTS THE HUB'S
// MAIN LOOP NO SYNCHRONOUS FILE CALL ON THE DATA DIR. Measured on a scratch hub of 2.369.408 with a stand-in machine: 6 such calls a
// command (the two audit writers — mkdirSync + statSync + appendFileSync each), 7 with a page open (GET /api/hosts read the public key
// file at every call), hosts.json renamed once a minute per machine — each a FUSE round trip on the owner's data mount.
//   ① the REAL ExitProxyManager over a REAL HostManager (a scratch data dir; the device link a stand-in that writes the act line through
//      hosts.noteAct, as src/agentd/client.js _act does): 40 commands — each with its save of hosts.json (setLastRun, the throttle's
//      window opened each time) — and 40 key reads (the route's keyInfo) ⇒ ZERO synchronous fs calls on the data dir between the first
//      and the last (a counter over every fs …Sync, outer calls only — loop-blame's rule); once written every line is on disk — in
//      order, once each — and hosts.json carries the LAST run (every save of the file is the store writer's: the latest state last)
//   ② RED CONTROLS, the same drive with today's lines compiled back in at their real paths (Module._compile, never src/): the exit
//      audit's synchronous block ⇒ 3 a command, the device audit's ⇒ 3 an act, keyInfo's read ⇒ 1 a call, hosts.js _save's
//      writeFileSync + renameSync ⇒ 2 a save
//   ③ THE ONE APPENDER (src/device-audit.js journal) over a stand-in writer: in order across bursts; a batch is at most half the bound
//      and produce() is never null while a line is queued (the hub's exit flush writes the queue — a stop loses nothing); a failed append
//      keeps its lines for the retry (the writer says the failure); the queue's bound drops the oldest unwritten lines (said once) and
//      never one an append in flight carries; ONE journal per file; the reader judges the queued lines first, a line on disk AND still
//      queued (landed, its answer not back) once, and a queued id inside another line's text hides nothing
//   ④ THE RING ON THE WRITER'S THREAD (the real store writer): 400 device acts at a 64 KiB bound ⇒ no synchronous call on the data dir,
//      the live file and .1 each at most the bound, the newest line live; a stop's synchronous flush writes every queued line
//   ⑤ U3 + (B) — THE MEMBERSHIP ASKED EXACTLY WHEN IT CAN DECIDE: a grant that names no group asks it ONCE a command (asked by the
//      user or not); a grant that names a group asks it at each verdict, so a removal no store write announces (a folder gone, a mount
//      dropped) is REFUSED during the ask and RECORDED during the run; RED CONTROLS: the judge's walk alone misses both; every verdict
//      walking again ⇒ 3 asks a command
//   ⑧ (B) THE CENSUS: over every grant that names no group (all modes × every list of the grant model's other principal kinds × six
//      callers), the verdict is the same under every membership (groups, none, an unreadable store); a list naming a group is decided
//      by it; the run's two later verdicts ask again exactly then (pin)
//   ⑦ THE CURE (the readers' SHOULDs on the taken unit): (a) a save the store writer cannot make durable says why (whyNotDurable) and the
//      person-act doors await it (pins); (b) a migration's reshape is ON DISK before its ledger says done; (c) a rotation's rename the storage
//      refuses keeps the ring recording; (d) generateKey reads the key fresh (the kept facts dropped); (e) a removal from the group DURING
//      the user's ask is refused at the stillGranted verdict; (f) THE CHECKPOINT CURE (2.369.411): the dial-token migration renames its
//      legacy file only once hosts.json holds the hashes (read AT the rename), and a flush that left the file keeps it — renamed in this
//      process once the writer says it is on disk; (g) a reshape the writer left is a FAILED migration (the REAL runner stamps no ledger;
//      the exit's deferred flush and a silent writer too) — each with its red control
//   ⑥ U3 — THE AMPLIFIER LAW (a slow hub is never sent more requests because it is slow): the REAL CLI `vibespace-exit run` against a
//      stand-in hub that answers the run only after the 1 s note was said ⇒ ONE request; RED CONTROL: today's note (a copy outside the
//      tree, scripts/mutant-copy.mjs), side by side ⇒ a second request, GET /api/agent/exit (causal: the hub answers its run after it)
// Run: node scripts/test-exit-cost.mjs
import fs from 'node:fs';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratch } from './scratch.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// THE COUNTER — installed before any src module is loaded: every fs …Sync, OUTER calls only, whose path lies in `watch`
let watch = null, depth = 0;
const seen = [];
for (const k of Object.keys(fs)) {
  if (!k.endsWith('Sync') || typeof fs[k] !== 'function') continue;
  const orig = fs[k];
  fs[k] = function (...a) {
    if (depth > 0) return orig.apply(this, a);
    depth++;
    try { return orig.apply(this, a); }
    finally {
      depth--;
      const p = typeof a[0] === 'string' ? path.resolve(a[0]) : null;
      if (watch && p && (p === watch || p.startsWith(watch + '/'))) seen.push(`${k} ${path.relative(watch, p) || '.'}`);
    }
  };
}
const countDuring = async (dir, fn) => { seen.length = 0; watch = dir; try { await fn(); } finally { watch = null; } const out = seen.slice(); seen.length = 0; return out; };
const tally = (rows) => { const t = {}; for (const r of rows) t[r] = (t[r] || 0) + 1; return t; };

const { ExitProxyManager } = require(path.join(REPO, 'src/exit-proxy.js'));
const { HostManager } = require(path.join(REPO, 'src/hosts.js'));
const DAU = require(path.join(REPO, 'src/device-audit.js'));
const DA = require(path.join(REPO, 'src/device-acts.js'));
const GS = require(path.join(REPO, 'src/server/grants-store.js'));
const SW = require(path.join(REPO, 'src/store-writer.js'));

const { ok, report } = checker();   // THE ONE ASSERTION HELPER (scripts/lib/check.mjs): the condition first, a boolean — a swap throws
const SCR = scratch('exitcost');
fs.mkdirSync(SCR, { recursive: true });
process.on('exit', () => { try { fs.rmSync(SCR, { recursive: true, force: true }); } catch { } });
const tick = () => new Promise((r) => setImmediate(r));

/** a module compiled at its REAL path with `from` → `to` (a red control: today's line back in) */
const compileAt = (rel, pairs) => {
  const file = path.join(REPO, rel);
  let src = fs.readFileSync(file, 'utf8');
  for (const [from, to] of pairs) { if (src.split(from).length !== 2) throw new Error(`the control's anchor moved in ${rel} — update this suite: ${from.slice(0, 80)}`); src = src.replace(from, to); }
  const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m._compile(src, file);
  return m.exports;
};

/** THE WORLD: a scratch data dir with one dial machine on record, a REAL HostManager, a REAL ExitProxyManager, one conversation */
let wn = 0;
async function world({ Mgr = ExitProxyManager, HM = HostManager, byGroup = false, ask = false } = {}) {
  const dataDir = path.join(SCR, 'w' + (++wn)); fs.mkdirSync(path.join(dataDir, 'ssh'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'hosts.json'), JSON.stringify({ hosts: [{ id: 'host-dial-standin', name: 'standin', transport: 'dial', deviceId: 'standin', createdAt: 1 }] }));
  fs.writeFileSync(path.join(dataDir, 'ssh', 'id_ed25519.pub'), 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIStandInKeyOnly vibespace\n');
  const hm = new HM({ dataDir });
  hm.dialOnline = () => true;
  const acts = [], gate = { p: null };
  const member = new Set(['A']);   // the conversations in Task Group G (by claudeSessionId)
  let groupAsks = 0;
  const dm = {
    status: () => ({ info: { capabilities: ['run-shell'], platform: 'linux' } }),
    // the stand-in device link: its act line goes through hosts.noteAct, as src/agentd/client.js _act → onAct does
    runShell: async (line, opts) => { acts.push(line); if (gate.p) await gate.p; hm.noteAct('host-dial-standin', DA.lineOf({ at: Date.now(), payload: { op: 'run-cmd', shell: line }, by: opts.by, ok: true, ms: 1 })); return { code: 0, stdout: 'ok\n', stderr: '', timedOut: false, signal: null, truncated: false, interpreter: 'sh' }; },
  };
  hm.deviceBounded = async () => dm;
  const grants = GS.create({ dataDir });
  const sessions = new Map([['wa', { name: 'agent A', backend: 'claude', claudeSessionId: 'A', cwd: '/w/a' }]]);
  const cards = [], bc = [];
  const mgr = new Mgr({ hosts: hm, grants, log: () => {}, dataDir, sessionsMap: () => sessions, bcastAll: (m) => bc.push(m), emitCard: (s, c) => { cards.push(c); return true; },
    groupsOf: (sess) => { groupAsks++; return member.has(sess.claudeSessionId) ? [{ id: 'G' }] : []; } });
  await mgr.setAccess('host-dial-standin', { run: byGroup ? { mode: 'only', who: [{ kind: 'group', id: 'G' }], ask: !!ask } : { mode: 'everyone', ask: !!ask } });
  return { dataDir, hm, mgr, dm, acts, sessions, cards, bc, gate, member, asks: () => groupAsks, resetAsks: () => { groupAsks = 0; } };
}
const N = 40;
const drive = async (w) => {
  for (let i = 0; i < N; i++) {
    const r = await w.mgr.run(w.sessions.get('wa'), 'wa', 'standin', 'true #' + i);
    if (!r || r.code !== 0) throw new Error('a command did not run: ' + JSON.stringify(r).slice(0, 200));
    w.hm.keyInfo();   // the route GET /api/hosts reads it at every call (a page's re-fetch after hosts-updated)
  }
};

// ═══ ① ═══
console.log('① the exit road costs the main loop no synchronous call on the data dir');
{
  const w = await world();
  w.hm.keyInfo();   // the key's facts are read ONCE (then kept); the window starts after it
  await w.mgr.run(w.sessions.get('wa'), 'wa', 'standin', 'warm');
  await w.mgr.auditWritten(); await w.hm.deviceAudit.whenWritten(); await w.hm.persisted();
  const rows = await countDuring(w.dataDir, async () => {
    for (let i = 0; i < N; i++) {
      if (w.hm._throttle) w.hm._throttle.clear();   // the run ledger's 60 s window opened: EVERY command saves hosts.json
      const r = await w.mgr.run(w.sessions.get('wa'), 'wa', 'standin', 'true #' + i);
      if (!r || r.code !== 0) throw new Error('a command did not run: ' + JSON.stringify(r).slice(0, 200));
      w.hm.keyInfo();   // the route GET /api/hosts reads it at every call (a page's re-fetch after hosts-updated)
    }
  });
  ok(rows.length === 0 && w.acts.length === N + 1, `${N} commands (each with its hosts.json save) + ${N} key reads ⇒ ${rows.length} synchronous fs calls on the data dir (${w.acts.length} runs reached the stand-in machine)`, tally(rows));
  ok(w.bc.filter((m) => m.type === 'exit-audit' && m.line && m.line.verb === 'run').length === N + 1 && w.cards.length === N + 1, 'every command still says itself: one exit-audit frame and one card each', { frames: w.bc.length, cards: w.cards.length });
  const queued = w.mgr.auditTail({ hostId: 'host-dial-standin', limit: 100 }).filter((l) => l.verb === 'run').map((l) => l.cmd);
  ok(queued.length === N + 1 && queued[0] === 'warm' && queued[N] === 'true #' + (N - 1), `the history reads every run at once, written or not (${queued.length}, oldest first)`, queued.slice(-3));
  ok(await w.mgr.auditWritten() && await w.hm.deviceAudit.whenWritten(), 'both appenders say every line is on disk');
  const lines = fs.readFileSync(path.join(w.dataDir, 'exit-audit.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((l) => l.verb === 'run');
  ok(lines.length === N + 1 && new Set(lines.map((l) => l.id)).size === N + 1 && lines.every((l, i) => l.cmd === (i === 0 ? 'warm' : 'true #' + (i - 1))), `exit-audit.jsonl holds every run in order, once each (${lines.length})`);
  const actLines = fs.readFileSync(path.join(w.dataDir, 'device-audit.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  ok(actLines.length === N + 1 && new Set(actLines.map((l) => l.id)).size === N + 1, `device-audit.jsonl holds every act once (${actLines.length})`);
  const st = fs.statSync(path.join(w.dataDir, 'device-audit.jsonl'));
  ok((st.mode & 0o777) === 0o600, `the device audit keeps its mode 0600 (${(st.mode & 0o777).toString(8)})`);
  ok(await w.hm.persisted(), 'hosts.json: the store writer says the saved state is on disk');
  const last = JSON.parse(fs.readFileSync(path.join(w.dataDir, 'hosts.json'), 'utf8')).hosts.find((h) => h.id === 'host-dial-standin').exit.lastRun.cmd;
  ok(last === 'true #' + (N - 1), `…and it is the LAST run (${last}) — one writer of the file, the latest state last`);
}

// ═══ ② ═══
console.log('② RED CONTROLS — today\'s lines back in');
{
  const EP = compileAt('src/exit-proxy.js', [[
    "      try { this._auditJournal().append(JSON.stringify(rec) + '\\n', { id: rec.id }); }\n      catch (e) { this.log(`audit line not queued: ${e.message}`); }",
    "      try {\n        fs.mkdirSync(this.dataDir, { recursive: true });\n        const f = path.join(this.dataDir, AUDIT_FILE), text = JSON.stringify(rec) + '\\n';\n        let size = 0; try { size = fs.statSync(f).size; } catch { }\n        if (size > 0 && size + Buffer.byteLength(text) > this.auditMaxBytes) { try { fs.renameSync(f, f + '.1'); } catch (e) { this.log(`audit not rotated: ${e.message}`); } }\n        fs.appendFileSync(f, text);\n      } catch (e) { this.log(`audit line not written: ${e.message}`); }",   // stale-pins: kept — today's exit audit, compiled back in as the red control
  ]]);
  const w1 = await world({ Mgr: EP.ExitProxyManager }); w1.hm.keyInfo();
  await w1.mgr.run(w1.sessions.get('wa'), 'wa', 'standin', 'warm'); await w1.hm.deviceAudit.whenWritten(); await w1.hm.persisted();
  const r1 = tally(await countDuring(w1.dataDir, () => drive(w1)));
  ok(r1['appendFileSync exit-audit.jsonl'] === N && r1['statSync exit-audit.jsonl'] === N && r1['mkdirSync .'] === N, `CONTROL (RED): the exit audit's synchronous block ⇒ 3 calls a command (${JSON.stringify(r1)})`);
  const DAm = compileAt('src/device-audit.js', [[
    "    if (jr) { try { jr.append(JSON.stringify(rec) + '\\n', { id: rec.id }); } catch (e) { log(`[device-audit] line not queued: ${e.message}`); } }   // B-48a4: off the main loop (journal)",
    "    if (dataDir) {\n      try {\n        fs.mkdirSync(dataDir, { recursive: true });\n        const f = path.join(dataDir, AUDIT_FILE), text = JSON.stringify(rec) + '\\n';\n        let size = 0; try { size = fs.statSync(f).size; } catch { }\n        if (size > 0 && size + Buffer.byteLength(text) > bound) { try { fs.renameSync(f, f + '.1'); } catch (e) { log(`[device-audit] not rotated: ${e.message}`); } }\n        fs.appendFileSync(f, text, { mode: 0o600 });\n      } catch (e) { log(`[device-audit] line not written: ${e.message}`); }\n    }",   // stale-pins: kept — today's device audit, compiled back in as the red control
  ]]);
  const d2 = path.join(SCR, 'd2'); fs.mkdirSync(d2, { recursive: true });
  const st2 = DAm.create({ dataDir: d2 });
  const r2 = tally(await countDuring(d2, async () => { for (let i = 0; i < N; i++) st2.append(DA.lineOf({ at: Date.now(), hostId: 'h', payload: { op: 'run-cmd', shell: 'x' }, by: 'system:x', ok: true })); }));
  ok(r2['appendFileSync device-audit.jsonl'] === N && r2['statSync device-audit.jsonl'] === N, `CONTROL (RED): the device audit's synchronous block ⇒ 3 calls an act (${JSON.stringify(r2)})`);
  const HMk = compileAt('src/hosts.js', [[
    "    const priv = path.join(this._sshDir, 'id_ed25519');\n    if (this._key) return { ...this._key.v };",
    "    const priv = path.join(this._sshDir, 'id_ed25519');\n    try { return { exists: true, path: priv, publicKey: fs.readFileSync(priv + '.pub', 'utf-8').trim() }; } catch { return { exists: false, path: priv, publicKey: null }; }",
  ]]);
  const w3 = await world({ HM: HMk.HostManager });
  const r3 = tally(await countDuring(w3.dataDir, async () => { for (let i = 0; i < N; i++) w3.hm.keyInfo(); }));
  ok(r3['readFileSync ssh/id_ed25519.pub'] === N, `CONTROL (RED): keyInfo reading the key file at every call ⇒ ${r3['readFileSync ssh/id_ed25519.pub']} reads for ${N} calls`);
  const HMs = compileAt('src/hosts.js', [[
    "    const W = this._storeWriter || require('./store-writer.js').storeWriter();\n    W.dirty(this._file, { name: 'hosts.write', produce: () => JSON.stringify(this._state, null, 2) });\n    W.durable(this._file).catch(() => { });",
    "    const tmp = this._file + '.tmp';\n    fs.writeFileSync(tmp, JSON.stringify(this._state, null, 2));\n    fs.renameSync(tmp, this._file);",   // stale-pins: kept — today's hosts.js _save, compiled back in as the red control
  ]]);
  const w4 = await world({ HM: HMs.HostManager }); w4.hm.keyInfo();
  await w4.mgr.run(w4.sessions.get('wa'), 'wa', 'standin', 'warm'); await w4.mgr.auditWritten(); await w4.hm.deviceAudit.whenWritten();
  const r4 = tally(await countDuring(w4.dataDir, async () => { w4.hm._throttle.clear(); await w4.mgr.run(w4.sessions.get('wa'), 'wa', 'standin', 'true'); }));
  ok(r4['writeFileSync hosts.json.tmp'] === 1 && r4['renameSync hosts.json.tmp'] === 1, `CONTROL (RED): hosts.js _save writing on the main loop ⇒ a write + a rename of hosts.json per save (${JSON.stringify(r4)})`);
  for (const w of [w1, w3, w4]) { await w.mgr.auditWritten(); await w.hm.deviceAudit.whenWritten(); }
}

// ═══ ③ ═══
console.log('③ the one appender (src/device-audit.js journal) over a stand-in writer');
{
  /** a stand-in of THE STORE WRITER: the journal's ask is kept, `step(ok)` performs ONE write the way the writer's thread does
   *  (the produced append lands on `disk`, or fails) and answers onWritten */
  const standin = () => {
    const st = { opts: null, asks: 0, disk: '', writes: [] };
    const ask = (o) => { st.opts = o; st.asks++; };
    const step = (good = true, onDisk = null) => { const b = st.opts && st.opts.produce(); if (b === null) return null; st.writes.push(Buffer.byteLength(b.append)); if (good) { st.disk += b.append; if (onDisk) onDisk(b.append); } st.opts.onWritten(good); return b; };
    return { st, ask, step, durable: async () => true };
  };
  const L = (i) => JSON.stringify({ i, pad: 'x'.repeat(80) }) + '\n';
  const said = [];
  const S = standin();
  const jr = DAU.journal({ file: path.join(SCR, 'nowhere-a.jsonl'), bound: 1000, ask: S.ask, durable: S.durable, log: (m) => said.push(m) });
  for (let i = 0; i < 3; i++) jr.append(L(i), { id: 'a' + i });
  S.step();
  for (let i = 3; i < 5; i++) jr.append(L(i), { id: 'a' + i });
  S.step();
  ok(S.st.disk === [0, 1, 2, 3, 4].map(L).join('') && jr.pending().length === 0, 'in order across two bursts, each burst one append');
  for (let i = 5; i < 20; i++) jr.append(L(i), { id: 'a' + i });
  let nulls = 0; S.st.writes.length = 0;
  for (let k = 0; k < 20 && jr.pending().length; k++) if (S.step() === null) nulls++;
  ok(nulls === 0 && S.st.writes.every((b) => b <= 500) && S.st.writes.length >= 3 && S.st.disk === Array.from({ length: 20 }, (_, i) => L(i)).join(''), `a batch is at most half the bound (${S.st.writes.join(' + ')} B) and produce() is never null while a line is queued — the exit flush writes the queue`);
  ok(DAU.journal({ file: path.join(SCR, 'nowhere-a.jsonl'), ask: () => { } }) === jr, 'ONE journal per file: a second manager on the same data dir gets the same one');
  const F = standin(); const saidF = [];
  const jf = DAU.journal({ file: path.join(SCR, 'nowhere-f.jsonl'), ask: F.ask, durable: F.durable, log: (m) => saidF.push(m) });
  jf.append(L(1), { id: 'f1' }); jf.append(L(2), { id: 'f2' });
  F.step(false); F.step(false); F.step(false);
  ok(jf.pending().length === 2 && saidF.length === 0 && F.st.asks >= 4, `a failed append keeps its lines and asks the writer again (${jf.pending().length} kept; the failure is the writer's to say — the journal adds no second voice)`);
  F.step(true);
  ok(F.st.disk === L(1) + L(2) && jf.pending().length === 0, '…and the append that lands writes them in order');
  const B = standin(); const saidB = [];
  const jb = DAU.journal({ file: path.join(SCR, 'nowhere-b.jsonl'), ask: B.ask, durable: B.durable, log: (m) => saidB.push(m) });
  const MB = 'y'.repeat(1024 * 1024 - 20);
  jb.append(JSON.stringify({ n: 0, MB }) + '\n', { id: 'b0' });
  const inFlight = B.st.opts.produce();   // the writer took line 0 and never answers (a storage that hangs)
  for (let n = 1; n <= 6; n++) jb.append(JSON.stringify({ n, MB }) + '\n', { id: 'b' + n });
  const left = jb.pending().map((t) => JSON.parse(t).n);
  ok(!!(inFlight && left[0] === 0 && left.length < 7 && left[left.length - 1] === 6 && saidB.filter((m) => /oldest unwritten lines are dropped/.test(m)).length === 1), `past the queue's bound (${DAU.QUEUE_MAX / 1048576} MB) the oldest unwritten lines go — never the one in flight, never the newest — said once (left ${left.join(',')})`);
  // the reader: the queued lines first (the newest), a line on disk AND still queued read once, a queued id inside a text hides nothing
  const dir = path.join(SCR, 'tail'); fs.mkdirSync(dir, { recursive: true });
  const T = { opts: null };
  const store = DAU.create({ dataDir: dir, writer: { dirty: (f, o) => { T.opts = o; }, durable: async () => true } });
  const recs = [];
  for (let i = 0; i < 3; i++) recs.push(store.append(DA.lineOf({ at: 1000 + i, hostId: 'h1', payload: { op: 'run-cmd', shell: 'echo ' + i }, by: 'system:x', ok: true })));
  const q1 = store.tail({ hostId: 'h1' });
  ok(q1.length === 3 && q1[0].at === 1002, 'the queued lines are read (newest first) before any reaches the disk', q1.map((r) => r.at));
  fs.appendFileSync(path.join(dir, DAU.AUDIT_FILE), JSON.stringify({ at: 999, hostId: 'h1', op: 'run-cmd', layer: 'act', by: 'system:x', summary: `echo "id":"${recs[0].id}"`, id: 'feedfacecafe' }) + '\n');
  ok(store.tail({ hostId: 'h1' }).length === 4, 'a line on disk whose TEXT holds a queued line\'s id is still read (its own id is its last field)');
  let midRead = null;
  const b = T.opts.produce(); fs.appendFileSync(path.join(dir, DAU.AUDIT_FILE), b.append); midRead = store.tail({ hostId: 'h1' }); T.opts.onWritten(true);   // landed, the answer not back yet
  ok(!!(midRead && midRead.length === 4 && new Set(midRead.map((r) => r.id)).size === 4), `a line on disk and still queued is read ONCE (${midRead && midRead.length} of 4)`);
  const after = store.tail({ hostId: 'h1' });
  ok(after.length === 4 && after[0].at === 1002, 'after the answer the lines are read from the file', after.map((r) => r.at));
}

// ═══ ④ ═══
console.log('④ the ring on the writer\'s thread (the real store writer)');
{
  const dirR = path.join(SCR, 'ring'); fs.mkdirSync(dirR, { recursive: true });
  const ring = DAU.create({ dataDir: dirR, maxBytes: 64 * 1024 });
  const rowsR = await countDuring(dirR, async () => { for (let i = 0; i < 400; i++) ring.append(DA.lineOf({ at: 5000 + i, hostId: 'h', payload: { op: 'run-cmd', cmd: 'echo', args: ['x'.repeat(200), String(i)] }, by: 'system:x', ok: true, ms: 1 })); });
  ok(await ring.whenWritten(), 'the 400 lines are on disk once the appender says so');
  const live = fs.statSync(path.join(dirR, DAU.AUDIT_FILE)).size, old = fs.statSync(path.join(dirR, DAU.AUDIT_FILE + '.1')).size;
  const newest = JSON.parse(fs.readFileSync(path.join(dirR, DAU.AUDIT_FILE), 'utf8').trim().split('\n').pop());
  ok(rowsR.length === 0 && live <= 64 * 1024 && old <= 64 * 1024 && newest.at === 5399, `400 acts at a 64 KiB bound: ${rowsR.length} synchronous calls on the data dir, the ring rotated on the writer's thread (live ${live} B + .1 ${old} B), the newest line live`, tally(rowsR));
  const dirS = path.join(SCR, 'stop'); fs.mkdirSync(dirS, { recursive: true });
  const stop = DAU.create({ dataDir: dirS, maxBytes: 64 * 1024 });
  for (let i = 0; i < 50; i++) stop.append(DA.lineOf({ at: 7000 + i, hostId: 'h', payload: { op: 'run-cmd', shell: 'x' }, by: 'system:x', ok: true }));
  for (let k = 0; k < 10; k++) SW.storeWriter().flushSync([path.join(dirS, DAU.AUDIT_FILE)]);   // a stop's synchronous flush, as the exit does
  const onDisk = fs.readFileSync(path.join(dirS, DAU.AUDIT_FILE), 'utf8').trim().split('\n').length;
  ok(onDisk === 50, `a stop's flush writes every queued line (${onDisk} of 50) — produce() never answers «nothing» while lines wait`);
}

// ═══ ⑤ ═══
console.log('⑤ U3 + (B) — the Task Group membership is asked exactly when it can decide');
{
  /** one command: `byGroup` = the run list names Task Group G (else everyone); `during(w)` runs while the device holds the run (the
   *  gate); `duringAsk(w)` while the user's ask is open (a stand-in ask that does not settle itself) */
  const one = async (Mgr, { byGroup = false, ask = false, during = null, duringAsk = null } = {}) => {
    const w = await world({ Mgr, byGroup, ask: ask || !!duringAsk });
    let answer = null;
    if (ask) w.mgr._ask = async () => 'allowed';
    if (duringAsk) w.mgr._ask = () => new Promise((r) => { answer = r; });
    let open = null;
    if (during) w.gate.p = new Promise((r) => { open = r; });
    w.resetAsks();
    const p = w.mgr.run(w.sessions.get('wa'), 'wa', 'standin', 'true').then((v) => ({ v }), (e) => ({ e }));
    if (duringAsk) { for (let i = 0; i < 20 && !answer; i++) await tick(); await duringAsk(w); answer('allowed'); }
    if (during) { for (let i = 0; i < 20 && w.acts.length === 0; i++) await tick(); await during(w); open(); }
    const r = await p;
    await w.mgr.auditWritten(); await w.hm.deviceAudit.whenWritten();
    return { asks: w.asks(), ran: w.acts.length, code: r.e && r.e.code, revoked: !!(r.v && r.v.revokedDuringRun), card: String((w.cards.at(-1) || {}).text || '') };
  };
  // a removal from G that NO store write announces (a Context folder gone on disk, a mount dropped): the walk answers otherwise, no re-judge
  const silent = async (w) => { w.member.delete('A'); };
  const plain = await one(ExitProxyManager), asked = await one(ExitProxyManager, { ask: true });
  ok(plain.ran === 1 && plain.asks === 1 && asked.ran === 1 && asked.asks === 1, `a grant that names no group: the membership asked ONCE a command (${plain.asks}×), asked by the user or not (${asked.asks}×) — it cannot decide the verdict (⑧)`, { plain, asked });
  const grp = await one(ExitProxyManager, { byGroup: true });
  ok(grp.ran === 1 && grp.asks === 3, `a grant that names a group: asked at each verdict (${grp.asks}×: the judge, the verdict before the run, the record after it)`, grp);
  const goneRun = await one(ExitProxyManager, { byGroup: true, during: silent }), goneAsk = await one(ExitProxyManager, { byGroup: true, duringAsk: silent });
  ok(goneRun.ran === 1 && goneRun.revoked && /\(access was removed while it ran\)/.test(goneRun.card) && goneAsk.code === 'not_granted' && goneAsk.ran === 0,
    `a removal no store write announces — during the run it is RECORDED (revokedDuringRun ${goneRun.revoked}), during the user's ask it is REFUSED (${goneAsk.code}, ${goneAsk.ran} run)`, { goneRun, goneAsk });
  const EPj = compileAt('src/exit-proxy.js', [   // the judge's walk alone (never asked again — U3's first form)
    ["    const ctxNow = this._ctxAgain(session, sessionId, j.ctx, accNow.run);", "    const ctxNow = j.ctx;"],
    ["    const ctxAfter = this._ctxAgain(session, sessionId, ctxNow, accAfter.run);", "    const ctxAfter = ctxNow;"],
  ]);
  const jRun = await one(EPj.ExitProxyManager, { byGroup: true, during: silent }), jAsk = await one(EPj.ExitProxyManager, { byGroup: true, duringAsk: silent });
  ok(!jRun.revoked && jAsk.ran === 1, `CONTROL (RED): the judge's walk alone ⇒ the removal is neither recorded (revokedDuringRun ${jRun.revoked}) nor refused (the command ran: ${jAsk.ran})`);
  // B-55dc ⋈ B-48a4 (lg-text-legs-3, the -moved2 meeting): the context B-48a4 asks AGAIN after the run is judged by B-55dc's law — a
  // membership still being READ when the run ends is NO revocation (the holder is re-judged at the store's signal); a removal still is
  // (above). RED: B-48a4's line alone (the plant proves itself: compileAt refuses an anchor that is not there exactly once)
  const reading = async (w) => { w.mgr.groupsOf = () => { const a = []; Object.defineProperty(a, 'unread', { value: true, enumerable: false }); return a; }; };
  const readRun = await one(ExitProxyManager, { byGroup: true, during: reading });
  const EPu = compileAt('src/exit-proxy.js', [["    const revokedDuringRun = this._endsOn(E.exitVerdict(accAfter, 'run', ctxAfter), ctxAfter);", "    const revokedDuringRun = !E.exitVerdict(accAfter, 'run', ctxAfter).ok;"]]);   // stale-pins: kept — the RED control PLANTS B-48a4's line alone (the text the meeting replaced)
  const readRed = await one(EPu.ExitProxyManager, { byGroup: true, during: reading });
  ok(readRun.ran === 1 && !readRun.revoked && readRed.ran === 1 && readRed.revoked,
    `B-55dc ⋈ B-48a4: a membership still being READ when the run ends is NOT recorded as a revocation (revokedDuringRun ${readRun.revoked}); RED CONTROL: B-48a4's line alone records it (${readRed.revoked})`, { readRun, readRed });
  const EP3 = compileAt('src/exit-proxy.js', [   // today's: every verdict walks again
    ["    if (namesGroup) return this.ctxFor(session, sessionId);", "    if (namesGroup || true) return this.ctxFor(session, sessionId);"],
  ]);
  const today = await one(EP3.ExitProxyManager);
  ok(today.ran === 1 && today.asks === 3, `CONTROL (RED): every verdict walking again ⇒ ${today.asks} membership asks for a grant that names no group`);
}

// ═══ ⑥ ═══
console.log('⑥ U3 — the amplifier law: a slow hub is never sent more requests because it is slow');
{
  const http = await import('node:http');
  const { spawn } = await import('node:child_process');
  const { mutantCopies } = await import('./mutant-copy.mjs');
  // the stand-in hub: each CLI by its own token; a run is answered only AFTER the CLI's 1 s note was said (`release`) or the old
  // note's list request was answered — causal, never a race with the clock (cap 8 s)
  const logs = new Map(), held = new Map();
  const answerRun = (tok) => { const h = held.get(tok); if (!h || h.done) return; h.done = true; clearTimeout(h.cap); h.res.writeHead(200, { 'content-type': 'application/json' }); h.res.end(JSON.stringify({ machine: 'standin', code: 0, stdout: 'ok\n', stderr: '', ms: 1300, timedOut: false, truncated: false, interpreter: 'sh', line: '# ran on standin — exit 0, 1.3 s (recorded)' })); };
  const srv = http.createServer((req, res) => {
    const tok = String(req.headers.authorization || '').replace(/^Bearer\s+/, '');
    if (!logs.has(tok)) logs.set(tok, []);
    logs.get(tok).push(`${req.method} ${req.url.split('?')[0]}`);
    if (req.method === 'POST' && req.url.startsWith('/api/agent/exit/run')) { req.resume(); held.set(tok, { res, done: false, cap: setTimeout(() => answerRun(tok), 8000) }); return; }
    if (req.url.startsWith('/api/agent/exit')) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ exits: [{ id: 'host-dial-standin', name: 'standin', grants: { run: true, runAsk: true } }] })); setTimeout(() => answerRun(tok), 50); return; }
    res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}');
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const api = `http://127.0.0.1:${srv.address().port}`;
  const home = path.join(SCR, 'cli-home'); fs.mkdirSync(home, { recursive: true });
  const NOTE = /# waiting for the user's approval \(up to 60 s\) if the machine asks… — an approval card in this conversation and in the For-you tray/;
  const runCli = (file, tok) => new Promise((resolve) => {
    const c = spawn(process.execPath, [file, 'run', 'standin', '--', 'true'], { env: { PATH: path.dirname(process.execPath) + ':/usr/bin:/bin', HOME: home, VIBESPACE_API: api, VIBESPACE_SESSION_TOKEN: tok }, stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '', out = '';
    const kill = setTimeout(() => { try { c.kill('SIGKILL'); } catch { } }, 20000);   // our own child, by its handle
    c.stdout.on('data', (d) => { out += d; });
    c.stderr.on('data', (d) => { err += d; if (NOTE.test(err)) answerRun(tok); });   // the note said ⇒ the hub answers the run
    c.on('close', (code) => { clearTimeout(kill); resolve({ code, err, out }); });
  });
  const M = mutantCopies('exitcost', REPO);
  const cliSrc = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-exit'), 'utf8');
  const NEW = `    const waitNote = setTimeout(() => console.error("# waiting for the user's approval (up to 60 s) if the machine asks… — an approval card in this conversation and in the For-you tray"), 1000);\n`;
  const OLD = "    const waitNote = setTimeout(async () => {\n      try {\n        const res = await CC.call(api + '/api/agent/exit', { headers: { Authorization: 'Bearer ' + token }, onExpiry: 'throw' });\n        const { exits } = res.ok ? await res.json() : { exits: [] };\n        const r0 = String(machine || '').toLowerCase();\n        const hit = (exits || []).filter((e) => !r0 || e.id === machine || String(e.name).toLowerCase().includes(r0));\n        if (hit.some((e) => e.grants && e.grants.runAsk)) console.error(\"# waiting for the user's approval (up to 60 s)… Filed for you: an approval — answer it on the card in this conversation or in the For-you tray\");\n      } catch { }\n    }, 1000);\n";
  if (cliSrc.split(NEW).length !== 2) throw new Error("the control's anchor moved in data/bin/vibespace-exit — update this suite");
  const copy = M.write('data/bin/vibespace-exit', cliSrc.replace(NEW, OLD), 'oldnote');
  const TA = 'vsst_' + 'a'.repeat(24), TB = 'vsst_' + 'b'.repeat(24);
  const [now, old] = await Promise.all([runCli(path.join(REPO, 'data/bin/vibespace-exit'), TA), runCli(copy, TB)]);   // side by side: one wait, not two
  const nowAsked = logs.get(TA) || [], oldAsked = logs.get(TB) || [];
  ok(now.code === 0 && nowAsked.length === 1 && nowAsked[0] === 'POST /api/agent/exit/run' && NOTE.test(now.err) && /ok/.test(now.out), `a call that outlives a second sends ONE request (${nowAsked.join(', ')}) and still says its note`, now.err.slice(0, 300));
  ok(old.code === 0 && oldAsked.length === 2 && oldAsked.includes('GET /api/agent/exit'), `CONTROL (RED): today's note asks the hub to word itself ⇒ ${oldAsked.length} requests for one command (${oldAsked.join(', ')})`);
  srv.close();
}

// ═══ ⑦ ═══
console.log('⑦ the cure — the readers\' SHOULDs');
{
  // (a) not durable ⇒ the words, and the person-act doors await it
  const wa = await world();
  wa.hm._storeWriter = { dirty: () => { }, durable: async () => false, whyNotDurable: () => ({ why: 'queued', ahead: 2 }), flushSync: () => ({ written: [], left: [] }) };
  wa.hm._save();
  const pa = await wa.hm.persisted(), why = wa.hm.whyNotDurable();
  const ER = fs.readFileSync(path.join(REPO, 'src/server/exit-routes.js'), 'utf8'), MPW = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8');
  ok(!!(pa === false && why && why.why === 'queued' && (ER.match(/if \(await notDurable\(res\)\) return;/g) || []).length === 3 && (MPW.match(/typeof hosts\.persisted === 'function' && !\(await hosts\.persisted\(\)\)/g) || []).length === 2),
    'a save the writer cannot make durable says why; the doors that take a person\'s act on a machine (add, remove, the exit-access PATCH; the pairing mint and the graduation) answer only once it is on disk', { pa, why });
  // (b) a migration's reshape on disk before its ledger says done (read in the same tick: no wait)
  const wb = await world(); await wb.hm.persisted();
  wb.hm.reshapeStore((st) => { st.hosts[0].name = 'reshaped'; return { n: 1 }; });
  const nb = JSON.parse(fs.readFileSync(path.join(wb.dataDir, 'hosts.json'), 'utf8')).hosts[0].name;
  const HMr = compileAt('src/hosts.js', [["    if (!this._flushLanded()) throw new Error('data/hosts.json is not on disk yet", "    if (false) throw new Error('data/hosts.json is not on disk yet"]]);
  const wbc = await world({ HM: HMr.HostManager }); await wbc.hm.persisted();
  wbc.hm.reshapeStore((st) => { st.hosts[0].name = 'reshaped'; return { n: 1 }; });
  const nbc = JSON.parse(fs.readFileSync(path.join(wbc.dataDir, 'hosts.json'), 'utf8')).hosts[0].name;
  ok(nb === 'reshaped' && nbc !== 'reshaped', `a migration's reshape is on disk before its ledger stamps (read at once: «${nb}»); CONTROL (RED): without the flush the file still says «${nbc}»`);
  await wbc.hm.persisted();
  // (c) a rotation's rename refused ⇒ the ring keeps recording (the worker's own job, a stand-in fs refusing the rename)
  const { writeJob } = require(path.join(REPO, 'src/store-writer-worker.js'));
  const fc = path.join(SCR, 'ring-refused.jsonl'); fs.writeFileSync(fc, 'x'.repeat(2000) + '\n');
  const refusing = new Proxy(fs, { get: (t, k) => (k === 'renameSync' ? () => { throw Object.assign(new Error('refused'), { code: 'EACCES' }); } : t[k]) });
  let thrown = null; try { writeJob({ file: fc, append: true, parts: [Buffer.from('new line\n')], rotateAt: 1000 }, refusing); } catch (e) { thrown = e; }
  const WKr = compileAt('src/store-writer-worker.js', [["        try { fs.renameSync(m.file, m.file + '.1'); } catch {", "        { fs.renameSync(m.file, m.file + '.1'); } if (0) {"]]);
  let thrownC = null; try { WKr.writeJob({ file: fc, append: true, parts: [Buffer.from('control line\n')], rotateAt: 1000 }, refusing); } catch (e) { thrownC = e; }
  ok(!!(!thrown && fs.readFileSync(fc, 'utf8').endsWith('new line\n') && thrownC && thrownC.code === 'EACCES'), `a rotation's rename the storage refuses keeps the ring recording past its bound; CONTROL (RED): without the fallback the append fails (${thrownC && thrownC.code})`);
  // (d) generateKey reads the key fresh: the kept facts are dropped
  const wd = await world();
  const k1 = wd.hm.keyInfo().publicKey;
  fs.writeFileSync(path.join(wd.dataDir, 'ssh', 'id_ed25519.pub'), 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIStandInKeyTwo vibespace\n');
  const kept = wd.hm.keyInfo().publicKey, made = (await wd.hm.generateKey()).publicKey, after = wd.hm.keyInfo().publicKey;
  ok(kept === k1 && /KeyTwo/.test(made) && /KeyTwo/.test(after), 'the key\'s facts are kept between calls, and generateKey reads the key fresh (a key placed meanwhile is never overwritten — ssh-keygen would ask)', { k1, kept, made, after });
  // (e) a removal from the group DURING the user's ask is refused at the stillGranted verdict (the ask stand-in does not settle itself)
  const askRemoval = async (Mgr) => {
    const w = await world({ Mgr, byGroup: true, ask: true });
    let answer; w.mgr._ask = () => new Promise((r) => { answer = r; });
    const p = w.mgr.run(w.sessions.get('wa'), 'wa', 'standin', 'true').then((v) => ({ v }), (e) => ({ e }));
    for (let i = 0; i < 20 && !answer; i++) await tick();
    w.member.delete('A'); w.mgr.rejudgeAll('task-groups'); answer('allowed');
    const r = await p; await w.mgr.auditWritten(); await w.hm.deviceAudit.whenWritten();
    return { code: r.e && r.e.code, ran: w.acts.length };
  };
  const refused = await askRemoval(ExitProxyManager);
  const EPn = compileAt('src/exit-proxy.js', [["    const ctxNow = this._ctxAgain(session, sessionId, j.ctx, accNow.run);", "    const ctxNow = j.ctx;"]]);
  const ranC = await askRemoval(EPn.ExitProxyManager);
  ok(refused.code === 'not_granted' && refused.ran === 0 && ranC.ran === 1, `a removal from the group during the user's ask ⇒ refused (${refused.code}, ${refused.ran} run); CONTROL (RED): the membership as judged ⇒ the command ran (${ranC.ran})`);
  // (f) the checkpoint's red (heavy test-machine-migrate, 2.369.411 block 1): the dial-token migration renames its legacy file only
  // once the hashes ARE on disk — read the file at the rename itself (the moment a kill would lose them)
  const migrate = async (HMx) => {
    const w = await world({ HM: HMx }); await w.hm.persisted();
    const legacy = path.join(w.dataDir, 'agentd', 'dial-tokens.json'); fs.mkdirSync(path.dirname(legacy), { recursive: true });
    fs.writeFileSync(legacy, JSON.stringify({ standin: 'a'.repeat(64), 'paired-only': 'b'.repeat(64) }));
    const real = fs.renameSync; let atRename = null;
    fs.renameSync = function (from, to) { if (from === legacy) { try { atRename = JSON.parse(fs.readFileSync(path.join(w.dataDir, 'hosts.json'), 'utf8')); } catch { atRename = null; } } return real.apply(this, arguments); };
    let ok1;
    try { ok1 = w.hm.migrateDialTokenFile(legacy); } finally { fs.renameSync = real; }
    const has = (st, id, h) => !!(st && Array.isArray(st.hosts) && st.hosts.some((x) => x.id === id && x.dialTokenHash === h));
    await w.hm.persisted();
    return { ok1, renamed: !fs.existsSync(legacy), onDisk: has(atRename, 'host-dial-standin', 'a'.repeat(64)) && has(atRename, 'host-dial-paired-only', 'b'.repeat(64)) };
  };
  const mf = await migrate(HostManager);
  const HMf = compileAt('src/hosts.js', [["    if (!this._flushLanded()) {\n      console.warn('[hosts] dial-token migration", "    if (false) {\n      console.warn('[hosts] dial-token migration"]]);
  const mfc = await migrate(HMf.HostManager);
  ok(mf.ok1 === true && mf.renamed && mf.onDisk && mfc.renamed && !mfc.onDisk, `the dial-token migration renames its legacy file only once both hashes are ON DISK (at the rename: ${mf.onDisk}); CONTROL (RED): without the flush the legacy file is renamed while hosts.json lacks them (${mfc.onDisk}) — a kill there locks every paired daemon out`);
  // (f2) its read (S1 + S2): a flush that LEFT hosts.json ⇒ the legacy file is KEPT at return, and renamed IN THIS PROCESS once the
  // writer says the state is on disk (an unpair before the next boot is never undone by a rerun) — a writer stand-in that leaves it
  const keptOf = async (HMx) => {
    const w = await world({ HM: HMx }); await w.hm.persisted();
    let land = null; const landed = new Promise((r) => { land = r; });
    w.hm._storeWriter = { dirty: () => { }, durable: () => landed, whyNotDurable: () => null, flushSync: (names) => ({ written: [], left: (names || []).map((f) => ({ name: 'hosts.write', file: f, why: 'held' })) }) };
    const legacy = path.join(w.dataDir, 'agentd', 'dial-tokens.json'); fs.mkdirSync(path.dirname(legacy), { recursive: true });
    fs.writeFileSync(legacy, JSON.stringify({ standin: 'a'.repeat(64) }));
    const ret = w.hm.migrateDialTokenFile(legacy), keptAtReturn = fs.existsSync(legacy), held = w.hm.dialTokenHash('standin') === 'a'.repeat(64);
    land(true); for (let i = 0; i < 50 && fs.existsSync(legacy); i++) await new Promise((r) => setTimeout(r, 10));
    return { ret, keptAtReturn, held, renamedLater: !fs.existsSync(legacy) && fs.existsSync(legacy + '.migrated') };
  };
  const kf = await keptOf(HostManager);
  const HMk2 = compileAt('src/hosts.js', [["    if (!this._flushLanded()) {\n      console.warn('[hosts] dial-token migration", "    if (!this.flushThrottled() && false) {\n      console.warn('[hosts] dial-token migration"]]);
  const kfc = await keptOf(HMk2.HostManager);
  ok(kf.ret === false && kf.keptAtReturn && kf.held && kf.renamedLater && kfc.ret === true && !kfc.keptAtReturn, `a flush that LEFT hosts.json: the legacy file is kept at return (${kf.keptAtReturn}, the hash held in memory), renamed in this process once the writer says it is on disk (${kf.renamedLater}); CONTROL (RED: the answer ignored): renamed at once (kept ${kfc.keptAtReturn}) while the file is not on disk`);
  // (g) the census of the class (2.369.411): a reshape the writer LEFT (held past its bound, or a failed write) is no migration done —
  // the REAL runner over a writer stand-in that leaves hosts.json: the ledger is NOT stamped (it runs again at the next boot)
  const { runMigrations } = require(path.join(REPO, 'src/migration-runner.js'));
  const stampOf = async (HMx, tag) => {
    const w = await world({ HM: HMx }); await w.hm.persisted();
    w.hm._storeWriter = { dirty: () => { }, durable: async () => false, whyNotDurable: () => null, flushSync: (names) => ({ written: [], left: (names || []).map((f) => ({ name: 'hosts.write', file: f, why: 'its write was still held by the storage at the bound' })) }) };
    const ledgerPath = path.join(w.dataDir, `migrations-${tag}.json`);
    const res = runMigrations({ ledgerPath, migrations: [{ id: 'standin-reshape', run: () => w.hm.reshapeStore((st) => { st.hosts[0].name = 'reshaped'; return { n: 1 }; }) }], log: () => { }, warn: () => { } });
    let led = null; try { led = JSON.parse(fs.readFileSync(ledgerPath, 'utf8')); } catch { }
    return { status: res[0] && res[0].status, stamped: !!(led && led.applied && led.applied['standin-reshape']) };
  };
  const sg = await stampOf(HostManager, 'g');
  // its read (N2): the other «not on disk» answers — the exit's deferred flush, a writer that answers nothing — are failed runs too
  const sgOf = async (flush, tag) => { const w = await world(); await w.hm.persisted(); w.hm._storeWriter = { dirty: () => { }, durable: async () => false, whyNotDurable: () => null, flushSync: flush }; const lp = path.join(w.dataDir, `migrations-${tag}.json`); const res = runMigrations({ ledgerPath: lp, migrations: [{ id: 'standin-reshape', run: () => w.hm.reshapeStore(() => ({ n: 0 })) }], log: () => { }, warn: () => { } }); return res[0] && res[0].status; };
  const sgd = await sgOf(() => ({ written: [], left: [], deferred: true }), 'gd'), sgn = await sgOf(() => undefined, 'gn'), sgo = await sgOf((names) => ({ written: [], left: [{ name: 'other', file: '/elsewhere/other.json', why: 'held' }] }), 'go');
  const HMg = compileAt('src/hosts.js', [["    if (!this._flushLanded()) throw new Error('data/hosts.json is not on disk yet", "    if (!this.flushThrottled() && false) throw new Error('data/hosts.json is not on disk yet"]]);
  const sgc = await stampOf(HMg.HostManager, 'gc');
  ok(sgd === 'failed' && sgn === 'failed' && sgo === 'ran', `the exit's deferred flush (${sgd}) and a writer that answers nothing (${sgn}) are not «on disk» either; another store's held write is not this file's (${sgo})`);
  ok(sg.status === 'failed' && !sg.stamped && sgc.status === 'ran' && sgc.stamped, `a reshape the writer LEFT: the migration counts as failed (${sg.status}) and the ledger is NOT stamped (${sg.stamped}) — it runs again at the next boot; CONTROL (RED: the flush's answer ignored): «${sgc.status}», stamped (${sgc.stamped}) over a file not on disk`);
}

// ═══ ⑧ ═══
console.log('⑧ (B) — THE CENSUS: the membership decides a verdict only through a group named in the lists');
{
  const E = require(path.join(REPO, 'src/exit-reach.js'));
  const GMk = require(path.join(REPO, 'src/grant-model.js'));
  // every principal kind the grant model knows, but the group: the lists a grant may hold without one
  const kinds = GMk.PRINCIPAL_KINDS || ['everyone', 'group', 'conversation'];
  ok(kinds.includes('group') && kinds.every((k) => ['everyone', 'group', 'conversation'].includes(k)), `the grant model's principal kinds are the census's (${kinds.join(', ')}) — a new kind is red here until the census reads it`);
  const P = [{ kind: 'conversation', key: 'A' }, { kind: 'conversation', key: 'B' }, { kind: 'everyone' }];
  const subsets = (xs) => xs.reduce((acc, x) => acc.concat(acc.map((a) => [...a, x])), [[]]);
  const ctxs = [];
  for (const keys of [['A'], ['B'], ['C']]) for (const fork of [false, true]) ctxs.push({ conversationKeys: keys, forkPending: fork });
  const memberships = [{ groupIds: [] }, { groupIds: ['G'] }, { groupIds: ['G', 'H'] }, { groupIds: [], unreadable: true }, { groupIds: ['H'], unreadable: true }];
  let shapes = 0, differs = 0;
  for (const mode of ['everyone', 'only', 'nobody']) for (const who of subsets(P)) for (const except of subsets(P.slice(0, 2))) for (const c of ctxs) {
    const access = E.exitAccessOf({ exit: { ask: false } }, { run: [{ door: 'exit', resource: 'h:run', to: mode === 'everyone' ? [{ kind: 'everyone' }, ...who] : mode === 'nobody' ? [] : who, except }], use: [] });
    if (!access || access.mode === 'unknown') continue;
    shapes++;
    const seen = new Set(memberships.map((m) => JSON.stringify(E.exitVerdict(access, 'run', { ...c, ...m }))));
    if (seen.size !== 1) differs++;
  }
  ok(shapes > 200 && differs === 0, `over ${shapes} grants that name no group × 6 callers: the verdict is the SAME under ${memberships.length} memberships (groups, none, an unreadable store) — ${differs} shape(s) differ`);
  const gAccess = E.exitAccessOf({ exit: { ask: false } }, { run: [{ door: 'exit', resource: 'h:run', to: [{ kind: 'group', id: 'G' }], except: [] }], use: [] });
  const gDiff = new Set(memberships.map((m) => JSON.stringify(E.exitVerdict(gAccess, 'run', { conversationKeys: ['A'], ...m })))).size;
  const exceptG = E.exitAccessOf({ exit: { ask: false } }, { run: [{ door: 'exit', resource: 'h:run', to: [{ kind: 'everyone' }], except: [{ kind: 'group', id: 'G' }] }], use: [] });
  const eDiff = new Set(memberships.map((m) => JSON.stringify(E.exitVerdict(exceptG, 'run', { conversationKeys: ['A'], ...m })))).size;
  ok(gDiff > 1 && eDiff > 1, `…and a list that names a group (in to: ${gDiff} verdicts; in except: ${eDiff}) is decided by the membership — the census sees the difference it guards`);
  const PX = fs.readFileSync(path.join(REPO, 'src/exit-proxy.js'), 'utf8');
  ok(/const namesGroup = !!grantNow && \[\.\.\.\(Array\.isArray\(grantNow\.who\) \? grantNow\.who : \[\]\), \.\.\.\(Array\.isArray\(grantNow\.except\) \? grantNow\.except : \[\]\)\]\.some\(\(e\) => e && e\.kind === 'group'\);/.test(PX)
    && (PX.match(/this\._ctxAgain\(session, sessionId, /g) || []).length === 2, 'the run\'s two verdicts after the judge ask the membership again exactly when the lists they read name a group (to or except)');
}

report();
