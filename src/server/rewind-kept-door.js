'use strict';
// ORCH: THE KEPT COPY'S DOOR (row B-437e, the files tier — 主开发 r1247 (2), r1304, r1327; lane lg-rewind, 2026-11-21). The
// decisions are src/rewind-kept.js (PURE); here are the two ROADS that carry them out, and the put-back:
//   THIS HUB: the hub's own kept folder (data/rewind-kept/<conversation>/ — beside the dropped files of data/chat-attachments,
//   never inside them: the attachments' «remove what is left» walks only its own root), every
//   file act on the «rewind-keep» one-worker SafeFs pool (src/server/rewind-keep-worker.js) behind the mount door — a storage
//   that hangs ends that worker, never the hub's loop. The read-back is each copy's sha256 against the original's.
//   A PAIRED MACHINE: under the agent's own state ON THAT MACHINE (<its home>/.vibespace/agentd/rewind-kept/<conversation>/), by
//   the agent's EXISTING file actions only (r1327; no new device op): mkdir, copy (capability `fs-portable` — an older agent is
//   never asked: «cannot keep a copy: upgrade the agent»), stat, list, write, rename, rm, each stamped `by` and gated by that
//   machine's own policy flag `files`. The read-back is the copy's own success and the kept file's size equal to the original's
//   (both stated after the copy); no byte of a person's file crosses the link for a check. A LINK is never kept (the round
//   wqdnv452s's MUST): the agent's stat answer says `link` (its own lstat) for the original and for the copy — an agent that
//   does not say it is «cannot keep a copy: upgrade the agent». The press's manifest is sealed on
//   the machine AND at the hub (the put-back reads the hub's). The machine's sweep reads a press folder by its shape, its mark
//   file's presence and the press time its own name carries.
// THE TOTAL (1 GiB) and THE SWEEP are the MACHINE's: every conversation's press folders on it count, and each keep sweeps them
// all — by that machine's own clock (a paired machine: the time of the press folder it just made). The boot's own sweep is the
// next keep's (server.js takes no line). The press folder and its MARK are made FIRST, so a keep cut short leaves a folder the
// sweep may take after its seven days. Each act on a paired machine is stamped with the person's own `by` (the socket's
// sign-in subject, else human:owner) and bounded 10 s. THE PUT-BACK is fenced like a press (no running turn, no rewind out;
// it holds the files mark while it works), names each path's act before it does it, keeps what stands there now first (the
// law), asks the mount door before each path, and puts back by a temp name beside the path (the press id in it) renamed over
// it — a temp a cut-short act left is removed BEFORE each copy (a paired agent's copy never overwrites: a stale temp would be
// renamed over the person's file); no sweep removes a press while it is being put back; it touches nothing of the conversation.
const path = require('path');
const crypto = require('crypto');
const fsp = require('fs/promises');
const DOOR = require('../mount-door');
const DA = require('../device-acts.js');
const { SafeFs } = require('../safe-fs');
const K = require('../rewind-kept.js');
const RQ = require('./rewind-requests.js');
const { addressableId } = require('../claude-lock-capture.js');   // the id a live session may be addressed by (a pending fork's borrowed id is nobody's)

const DATA_ROOT = path.join(__dirname, '..', '..', 'data', 'rewind-kept');
const CONV_RE = /^[\w-][\w.-]{0,127}$/;
const PAIRED_CONVS_MAX = 500;
const PUTTING = new Set();   // the presses being put back now: no keep's sweep removes one of them (any conversation's)
let _pool = null;
const closePool = () => { const p = _pool; _pool = null; return p ? p.close() : undefined; };
const keepPool = () => _pool || (_pool = new SafeFs({ workerPath: path.join(__dirname, 'rewind-keep-worker.js'), name: 'rewind-keep', poolSize: 1, timeouts: { default: K.KEEP.copyMs } }));
const nameOf = (e) => String((e && (e.code || e.message)) || e || 'error').slice(0, 120);
const timedOut = (e) => !!e && (e.safeFsTimeout === true || e.code === 'ETIMEDOUT' || /deadline|timed? ?out/i.test(String(e.message || '')));
const notAllowed = (e) => /op-not-allowed|hub_act_denied|act_without_by|not allowed/i.test(nameOf(e)) || /op-not-allowed|hub_act_denied|act_without_by/.test(String((e && e.message) || ''));
/** the person's own stamp for a device act (device-acts `by`): the socket's sign-in subject, else the owner */
const stampOf = (by) => (by && DA.validBy(by.actBy) ? by.actBy : 'human:owner');
/** one agent call, bounded (the agent's own copy waits up to 130 s: the keep's bound is 10 s a call) */
const bounded = (promise, ms = K.KEEP.copyMs) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' })), ms);
  if (t && typeof t.unref === 'function') t.unref();
  Promise.resolve(promise).then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
});

/** THIS HUB's road: every act on the keep pool (`call` injectable for the suite: the worker's own runOp) */
function hubRoad(conv, { dataRoot = DATA_ROOT, call = null } = {}) {
  const run = call || ((op, payload) => { const safeFs = keepPool(); return safeFs.call(op, payload, { timeoutMs: K.KEEP.copyMs }); });
  const rootOf = (c) => path.join(dataRoot, c);
  const bytesOf = (e) => (e.manifest && e.manifest.machine ? 0 : e.manifest ? K.usedOf([e.manifest]) : Number(e.kept) || 0);   // a paired press's manifest: its bytes are on its machine
  return {
    paired: false, root: rootOf(conv), machine: null, join: (...p) => path.join(...p),
    machineNow: async () => null,   // this hub's clock is the keep's own `now`
    facts: async (paths) => {
      const open = paths.filter((p) => !DOOR.blocked(p));
      const got = open.length ? await run('facts', { paths: open }) : [];
      return paths.map((p) => (DOOR.blocked(p) ? { path: p, error: 'blocked' } : got.find((f) => f.path === p) || { path: p, error: 'unreadable' }));
    },
    open: (dir, mark) => run('open', { dir, mark }),
    keepOne: (dir, row) => (DOOR.blocked(row.path) ? Promise.reject(Object.assign(new Error('blocked'), { code: 'EBLOCKED' })) : run('keepOne', { dir, row })),
    seal: (dir, manifest) => run('seal', { dir, manifest }),
    list: async () => (await run('list', { root: rootOf(conv) })).map((e) => ({ ...e, conv, bytes: bytesOf(e) })),
    listAll: async () => (await run('listAll', { base: dataRoot })).map((e) => ({ ...e, bytes: bytesOf(e) })),
    removePress: (c, name) => run('removePress', { root: rootOf(c), name }),
    discard: (dir) => run('discard', { dir }),
    keptFacts: (dir, rows) => run('keptFacts', { dir, rows }),
    putOne: (dir, row, act, press) => (DOOR.blocked(row.path) ? Promise.reject(Object.assign(new Error('blocked'), { code: 'EBLOCKED' })) : run('putOne', { dir, row, act, press })),
    dropTmp: (file) => run('dropTmp', { file }),
    readLines: () => run('readLines', { root: rootOf(conv) }),
    writeLines: (lines) => run('writeLines', { root: rootOf(conv), lines }),
  };
}

/** A PAIRED MACHINE's road over its agent (`dm`), the existing actions only (r1327), each bounded and stamped */
async function pairedRoad(conv, dm, { by: who, host, callMs = K.KEEP.copyMs, allMs = K.KEEP.allMs }) {
  const by = stampOf(who);   // the person's own string stamp — written AT each act call (test-architecture §91)
  const B = (p) => bounded(p, callMs);   // each agent call bounded
  const isAbsent = (e) => /ENOENT|no such file/i.test(nameOf(e));
  const home = (await B(dm.fsHome())).home;   // fs-portable: an older agent throws here (host_needs_daemon) — «upgrade the agent»
  const win = /^[A-Za-z]:[\\/]/.test(home), sep = win ? '\\' : '/';
  const join = (...p) => p.map((x, i) => (i ? String(x).replace(/^[\\/]+/, '') : String(x).replace(/[\\/]+$/, ''))).join(sep);
  const base = join(home, '.vibespace', 'agentd', 'rewind-kept');
  const statOf = async (p) => {
    try {
      const r = await B(dm.fsStat(p));
      if (!r || !r.stat) return { path: p, error: 'unreadable' };
      const isLink = r.stat.link === true || r.stat.link === false ? r.stat.link : r.stat.link === undefined ? undefined : null;   // the agent's own lstat (absent: too old to say)
      return { path: p, mode: r.stat.isDir ? 0o040000 | (Number(r.stat.mode) & 0o7777) : r.stat.mode, size: r.stat.size, mtimeMs: r.stat.mtimeMs, isLink };
    } catch (e) { return isAbsent(e) ? { path: p, absent: true } : { path: p, error: nameOf(e) }; }
  };
  const listOf = async (p) => { try { return ((await B(dm.fsList(p))) || {}).entries || []; } catch (e) { if (isAbsent(e)) return []; throw e; } };
  const pressAt = (name) => parseInt(name.slice(3, name.lastIndexOf('-')), 36);
  const pastBound = () => Object.assign(new Error('timed out (the machine\'s kept copies not listed within the bound)'), { code: 'ETIMEDOUT' });
  const pressesOf = async (c, t0 = Date.now()) => {   // the ONE bound holds inside one conversation's walk too (each press a list call)
    const out = [];
    for (const e of await listOf(join(base, c))) {
      if (!e || !e.isDir || !K.PRESS_RE.test(e.name)) continue;
      if (Date.now() - t0 > allMs) throw pastBound();
      const kids = await listOf(join(base, c, e.name));
      const marked = kids.some((k) => k && k.name === K.MARK_FILE);
      out.push({ conv: c, name: e.name, folderMtimeMs: e.mtimeMs, mark: marked ? { kind: K.MARK_KIND, press: e.name, at: pressAt(e.name) } : null, bytes: kids.reduce((s, k) => s + (k && !k.isDir && /^\d+\.bin$/.test(k.name) ? Number(k.size) || 0 : 0), 0) });
    }
    return out;
  };
  return {
    paired: true, root: join(base, conv), machine: host, join,
    machineNow: async (dir) => { const f = await statOf(dir); return f.error || f.absent ? null : f.mtimeMs; },   // its own clock: the folder it just made
    facts: (paths) => Promise.all(paths.map(statOf)),
    open: async (dir, mark) => { await B(dm.fsMkdir(dir, { by })); await B(dm.fsWrite(join(dir, K.MARK_FILE), Buffer.from(JSON.stringify(mark)), { by })); },
    keepOne: async (dir, row) => {
      const dest = join(dir, K.keptName(row.n));
      await B(dm.fsCopy(row.path, dest, { by }));
      const k = await statOf(dest), s = await statOf(row.path);
      return { ok: !k.error && !k.absent && !s.error && !s.absent, size: k.size, mtimeMs: k.mtimeMs, srcSize: s.size, isLink: k.isLink, srcIsLink: s.isLink };
    },
    seal: async (dir, manifest) => {   // by a temp name renamed over: never a torn manifest
      const tmp = join(dir, K.MANIFEST_FILE + '.tmp');
      await B(dm.fsWrite(tmp, Buffer.from(JSON.stringify(manifest)), { by }));
      await B(dm.fsRename(tmp, join(dir, K.MANIFEST_FILE), { by }));
    },
    list: () => pressesOf(conv),
    listAll: async () => {   // ONE bound for the whole walk (each call 10 s; all of them `allMs`): past it, the total is not known — no-time
      const out = [], t0 = Date.now();
      for (const c of (await listOf(base)).filter((e) => e && e.isDir && CONV_RE.test(e.name)).slice(0, PAIRED_CONVS_MAX)) {
        if (Date.now() - t0 > allMs) throw pastBound();
        out.push(...(await pressesOf(c.name, t0)));
      }
      return out;
    },
    removePress: async (c, name) => {
      if (!K.PRESS_RE.test(name) || !CONV_RE.test(c)) return { ok: false, why: 'not-a-press' };
      if (!(await listOf(join(base, c, name))).some((k) => k && k.name === K.MARK_FILE)) return { ok: false, why: 'no-mark' };
      await B(dm.fsRm(join(base, c, name), true, { by }));
      return { ok: true };
    },
    discard: async (dir) => { if (K.PRESS_RE.test(dir.split(/[\\/]/).pop()) && !(await listOf(dir)).some((k) => k && k.name === K.MANIFEST_FILE)) await B(dm.fsRm(dir, true, { by })).catch(() => { }); },
    keptFacts: async (dir, rows) => {
      const out = {};
      for (const r of rows) if (r.kind !== 'absent') { const f = await statOf(join(dir, K.keptName(r.n))); out[r.n] = f.error || f.absent ? null : { size: f.size, mtimeMs: f.mtimeMs }; }
      return out;
    },
    putOne: async (dir, row, act, press) => {
      if (act === 'remove') { await B(dm.fsRm(row.path, false, { by })); return { ok: true }; }
      if (act !== 'overwrite' && act !== 'create') return { ok: true, skipped: act };
      const tmp = `${row.path}.${press}.vs-tmp`;
      await B(dm.fsRm(tmp, false, { by }));   // a temp a cut-short act left goes FIRST: the agent's copy never overwrites, so a stale one would be renamed over
      await B(dm.fsCopy(join(dir, K.keptName(row.n)), tmp, { by }));
      await B(dm.fsRename(tmp, row.path, { by }));
      return { ok: true };
    },
    dropTmp: (file) => B(dm.fsRm(file, false, { by })),
  };
}

/** the road for a conversation → a road | {ok: false, why} */
async function roadOf(session, conv, { hosts = null, by = null, dataRoot = DATA_ROOT, call = null, dm = null, callMs = K.KEEP.copyMs, allMs = K.KEEP.allMs } = {}) {
  if (conv == null) return { ok: false, why: 'not-started' };   // r4423: no addressable id yet (a pending fork) — no record, said by its cause
  if (typeof conv !== 'string' || !CONV_RE.test(conv) || conv === '.' || conv === '..') return { ok: false, why: 'unreadable' };
  if (!session || !session.host) return hubRoad(conv, { dataRoot, call });
  let agent = dm;
  try { if (!agent) agent = hosts && typeof hosts.deviceBounded === 'function' ? await hosts.deviceBounded(session.host, 2000) : null; } catch { agent = null; }
  if (!agent || typeof agent.fsStat !== 'function') return { ok: false, why: 'unreadable' };
  try { return await pairedRoad(conv, agent, { by, host: session.host, callMs, allMs }); }
  catch (e) { return { ok: false, why: /fs-portable|host_needs_daemon/.test(nameOf(e)) ? 'agent-too-old' : notAllowed(e) ? 'files-not-allowed' : timedOut(e) ? 'no-time' : 'unreadable' }; }
}

/** THE MACHINE's sweep (all its conversations), by its own clock, sparing `spare` → {used: the bytes left, swept} */
async function sweptOn(road, now, { spare = [] } = {}) {
  const entries = await road.listAll(), keep = new Set([...spare, ...PUTTING]);   // a press being put back is never swept
  const gone = new Set();
  for (const e of entries) {
    if (keep.has(e.name) || !K.sweepOf([e], now).length) continue;
    try { const r = await road.removePress(e.conv, e.name); if (r && r.ok) gone.add(e.name); } catch { }
  }
  const left = entries.filter((e) => !gone.has(e.name));
  return { used: left.reduce((s, e) => s + (Number(e.bytes) || 0), 0), swept: [...gone] };
}

/** THE CONFIRM's word: can every listed file be kept? (nothing copied, nothing swept) → {ok, refusals, check} */
async function keepableOf({ session, conv, files, hosts = null, by = null, now = Date.now(), ...opts } = {}) {
  const road = await roadOf(session, conv, { hosts, by, ...opts });
  if (road.ok === false) return { ok: false, refusals: [{ path: null, why: road.why }] };
  try {   // what the next keep's sweep would remove is simply not counted
    const entries = await road.listAll();
    const used = entries.filter((e) => !K.sweepOf([e], now).length).reduce((s, e) => s + (Number(e.bytes) || 0), 0);
    const plan = K.keepPlanOf(await road.facts(files), { used, paired: road.paired });
    return { ok: plan.ok, refusals: plan.refusals, check: road.paired ? 'size' : 'sha256', machine: road.machine || null };   // r2245 (6): the confirm names a paired machine
  } catch (e) { return { ok: false, refusals: [{ path: null, why: timedOut(e) ? 'no-time' : notAllowed(e) ? 'files-not-allowed' : 'unreadable' }] }; }
}

/** THE KEEP before the files press → {ok, press, where, machine, check, swept} | {ok: false, refusals}. The press folder and its
 *  mark first; the machine's sweep by its own clock (sparing `spare` and this press); the plan; each copy (10 s, 60 s all) and
 *  its read-back; the manifest last. A keep that fails leaves no unsealed folder behind */
async function keepFor({ session, conv, files, hosts = null, by = null, now = Date.now(), hex8 = crypto.randomBytes(4).toString('hex'), spare = [], allMs = K.KEEP.allMs, ...opts } = {}) {
  const road = await roadOf(session, conv, { hosts, by, allMs, ...opts });
  if (road.ok === false) return { ok: false, refusals: [{ path: null, why: road.why }] };
  const press = K.pressIdOf(now, hex8), dir = road.join(road.root, press);
  let opened = false;
  const fail = async (refusals) => { if (opened) { try { await road.discard(dir); } catch { } } return { ok: false, refusals }; };
  try {
    const mark = K.markOf({ conv, press, at: now });
    await road.open(dir, mark);
    opened = true;
    const machineNow = (await road.machineNow(dir)) || now;
    const { used, swept } = await sweptOn(road, machineNow, { spare: [press, ...spare] });
    const plan = K.keepPlanOf(await road.facts(files), { used, paired: road.paired });
    if (!plan.ok) return fail(plan.refusals);
    const back = {}, t0 = Date.now();
    for (const row of plan.rows) {
      if (row.kind === 'absent') continue;
      if (Date.now() - t0 > allMs) { back[row.n] = { ok: false, timedOut: true }; break; }
      try { back[row.n] = await road.keepOne(dir, row); } catch (e) { back[row.n] = { ok: false, timedOut: timedOut(e), notAllowed: notAllowed(e) }; }
    }
    const rb = K.readBackOf(plan.rows, back, { paired: road.paired });
    if (!rb.ok) return fail(rb.refusals);
    const manifest = K.manifestOf({ conv, press, at: now, machine: road.machine, paired: road.paired, rows: plan.rows, back });
    await road.seal(dir, manifest);
    if (road.paired) { const hub = hubRoad(conv, { dataRoot: opts.dataRoot, call: opts.call }), hubDir = hub.join(hub.root, press); await hub.open(hubDir, mark); await hub.seal(hubDir, manifest); }   // the hub keeps the manifest
    return { ok: true, press, where: dir, machine: road.machine, check: manifest.check, swept };
  } catch (e) {
    return fail([{ path: null, why: timedOut(e) ? 'no-time' : notAllowed(e) ? 'files-not-allowed' : 'not-kept' }]);
  }
}

/** the manifest of one press, read at the hub (a paired press's manifest is sealed there too) */
async function manifestAt(conv, press, opts = {}) {
  if (!K.PRESS_RE.test(String(press || '')) || typeof conv !== 'string' || !CONV_RE.test(conv)) return null;
  const hub = hubRoad(conv, opts);
  const e = (await hub.list()).find((x) => x.name === press);
  return e && e.mark && e.mark.kind === K.MARK_KIND && e.mark.press === press && e.manifest ? e.manifest : null;
}

/** «PUT MY FILES BACK AS THEY WERE»: the plan (`dryRun`) or the act → {ok, rows: [{path, act, why, done?}], kept?} | a refusal.
 *  FENCED like a press (no running turn, no rewind out — it holds the files mark while it acts); the act re-plans and refuses
 *  `changed-since` when the plan is not the one the person read (`expect`); keeps what stands at the paths it will change FIRST
 *  (the law; its own press spared from that keep's sweep); then each row, one at a time, the mount door asked before each */
async function putBack({ session, conv, press, by, hosts = null, dryRun = false, expect = null, now = Date.now(), ...opts } = {}) {
  if (!by || by.kind !== 'human') return { ok: false, reason: 'not-the-person', cls: 'cannot' };
  // r4423: THE FENCES BELOW ARE READ ON THE SESSION WHOSE ADDRESSABLE ID IS THE KEY — the conversation's one live session (the ws case
  // keys by that very session; a conversation has one live writer). No live session: not running; no addressable id: not started
  if (!session) return { ok: false, reason: 'not-running', cls: 'cannot' };
  if (conv == null) return { ok: false, reason: 'not-started', cls: 'cannot' };
  const manifest = await manifestAt(conv, press, opts);
  if (!manifest) return { ok: false, reason: 'not-kept', cls: 'cannot' };
  if ((manifest.machine || null) !== ((session && session.host) || null)) return { ok: false, reason: 'stopped', cls: 'cannot' };   // its machine's conversation, live there
  if (session && RQ.rewindStateOf(session).turnRunning) return { ok: false, reason: 'turn-running', cls: 'cannot' };
  if (session && RQ.rewindOut(session, Date.now())) return { ok: false, reason: 'pending', cls: 'cannot' };
  const road = await roadOf(session, conv, { hosts, by, ...opts });
  if (road.ok === false) return { ok: false, reason: road.why, cls: 'cannot' };
  const dir = road.join(road.root, press);
  const cur = Object.fromEntries((await road.facts(manifest.files.map((f) => f.path))).map((f) => [f.path, f]));
  const plan = K.putBackPlanOf(manifest, cur, await road.keptFacts(dir, manifest.files));
  if (dryRun) return { ok: true, dryRun: true, press, rows: plan };
  const key = (p) => JSON.stringify((p || []).map((r) => [r.path, r.act, r.why || null]));
  if (key(plan) !== key(expect)) return { ok: false, reason: 'changed-since', cls: 'moved', rows: plan };
  // asked AGAIN right before the mark is set (no await between: nothing slips in) — two clients pressing one press at once: the
  // second is refused by name, never two put-backs of one press side by side (one's stale-temp removal would undo the other's row)
  if ((session && RQ.rewindOut(session, Date.now())) || PUTTING.has(press)) return { ok: false, reason: 'pending', cls: 'cannot' };
  const mark = { id: `put-${press}`, at: Date.now(), files: true, pty: (session && session.pty) || null };   // tied to its CLI process, like a press's
  if (session) RQ.setFilesOut(session, mark);   // ONE AT A TIME: a press, a confirm and the person's send wait on the put-back
  PUTTING.add(press);
  try {
    const touch = plan.filter((r) => r.act === 'overwrite' || r.act === 'remove').map((r) => r.path);
    let kept = null;
    if (touch.length) {   // THE LAW holds for the put-back too: what stands there now is kept first
      kept = await keepFor({ session, conv, files: touch, hosts, by, now, spare: [press], ...opts });
      if (!kept.ok) return { ok: false, reason: 'not-kept', cls: 'cannot', keep: kept.refusals, rows: plan };
    }
    const rows = [];
    for (const r of plan) {
      const row = manifest.files.find((f) => f.n === r.n);
      if (r.act === 'unchanged' || r.act === 'refused') { rows.push({ ...r, done: false }); continue; }
      try { await road.putOne(dir, row, r.act, press); rows.push({ ...r, done: true }); }
      catch (e) { if (r.act !== 'remove') { try { await road.dropTmp(`${row.path}.${press}.vs-tmp`); } catch { } } rows.push({ ...r, done: false, why: nameOf(e) }); }
    }
    return { ok: true, press, rows, kept: kept && { press: kept.press, where: kept.where, machine: kept.machine } };
  } finally { PUTTING.delete(press); if (session && RQ.filesOutOf(session) === mark) RQ.setFilesOut(session, null); }
}

// ── U3 (主开发 r1988): THE KEPT LINES — one per keep of a person's files (a files press, a put-back's keep-first), a RECORD of what a
// rewind did to them: data/rewind-kept/<conversation>/lines.json on THIS hub for every machine (a paired press's manifest is the
// hub's too), written synced by the keep pool, so a hub restart keeps them and no sweep takes them. A page draws them above the
// conversation, again after a reload; every client of the conversation is told a change live — AS A PAGE DRAWS IT (its door
// computed, r2245 (1)). The door («Put my files back as they were») stands ONLY while its copy does: after the seven days, or once
// every file is put back, the line stays and SAYS so (never a greyed door). The record goes with its conversation (forgetLines).
const LINES_MAX = 32;
/** THE CONVERSATION's OWN KEY (主开发 r2372 (1)): the kept copies and their lines follow the CONVERSATION, not the session — a resume
 *  or an exit gives a new session id, the harness's own conversation id stays (claude: its session uuid; codex: its thread) →
 *  '<backend>-<id>' | null. A BORROWED ID IS NOBODY's ADDRESS (r4423): a pending fork carries its parent's id until the CLI announces
 *  its own, so the key is the conversation's ADDRESSABLE id (claude-lock-capture.js addressableId) — none yet, no key: nothing is
 *  drawn, kept or put back for it, refused «not started yet» */
function convKeyOf(session) {
  const id = addressableId(session);
  const be = String((session && session.backend) || 'claude');
  return id && /^[\w-]{1,100}$/.test(String(id)) && /^[a-z][\w-]{0,20}$/.test(be) ? `${be}-${id}` : null;
}
const FORGOTTEN = new Set();   // conversations whose record was forgotten: a press answering after it writes nothing (r2372 (5))
const LINE_CHAIN = new Map();   // conversation → its last line write (one after another: two notes never race one file)
function chained(conv, fn) {
  const prev = LINE_CHAIN.get(conv) || Promise.resolve();
  const next = prev.catch(() => { }).then(fn);
  LINE_CHAIN.set(conv, next);
  next.finally(() => { if (LINE_CHAIN.get(conv) === next) LINE_CHAIN.delete(conv); }).catch(() => { });
  return next;
}
/** a line whose copy may still stand: kept, inside its seven days */
const standing = (l, now) => !!l && l.state === 'kept' && Number(now) < Number(l.until);
/** THE CAP (r2245 (5)): past LINES_MAX the SETTLED lines leave first, oldest first (put back, gone, past their days); a line whose
 *  copy may still stand is never dropped (its door is the only way back to that copy) */
function cappedOf(lines, now, max = LINES_MAX) {
  let over = lines.length - max;
  return over <= 0 ? lines : lines.filter((l) => (over > 0 && !standing(l, now) ? (over--, false) : true));
}
/** one line written (merged by its press) → the line as it stands | the line NOT recorded ({…, unrecorded}: the record could not be
 *  read — it is never written over, r2245 (8)) | null */
function noteLine(conv, patch, opts = {}) {
  if (typeof conv !== 'string' || !CONV_RE.test(conv) || !patch || !K.PRESS_RE.test(String(patch.press || ''))) return Promise.resolve(null);
  if (FORGOTTEN.has(conv)) { try { console.warn(`[rewind-kept] a line for ${conv} after its record was forgotten — not written`); } catch { } return Promise.resolve(null); }
  return chained(conv, async () => {
    if (FORGOTTEN.has(conv)) return null;   // forgotten while this note waited its turn
    const hub = hubRoad(conv, { dataRoot: opts.dataRoot, call: opts.call });
    const read = await hub.readLines();
    if (read.torn || read.unreadable) {
      try { console.warn(`[rewind-kept] the kept lines of ${conv} could not be read (${read.torn ? 'torn' : read.unreadable}) — left as they are, this line not recorded`); } catch { }
      return { ...patch, unrecorded: true };
    }
    const lines = read.lines;
    const i = lines.findIndex((l) => l && l.press === patch.press);
    const line = { ...(i >= 0 ? lines[i] : {}), ...patch };
    await hub.writeLines(i >= 0 ? lines.map((l, k) => (k === i ? line : l)) : cappedOf(lines.concat([line]), Number(opts.now) || Date.now()));
    return line;
  });
}
/** what a page draws of one stored line now: `door` only while its press's copy stands on this hub's record (`here`) and its seven
 *  days have not passed; a kept line past that reads 'gone' */
const viewOf = (l, here, now) => {
  const live = standing(l, now) && here.has(l.press);
  return { ...l, state: l.state === 'kept' && !live ? 'gone' : l.state, door: live };
};
const hereOf = async (hub) => new Set((await hub.list()).filter((e) => e && e.manifest).map((e) => e.name));
/** the record as a page draws it → {lines: [{press, at, until, machine, files, msgId, msgAt, step, of, state: 'kept' | 'put-back' |
 *  'gone', door, …}], torn: bool} */
async function linesRead(conv, { now = Date.now(), ...opts } = {}) {
  if (typeof conv !== 'string' || !CONV_RE.test(conv)) return { lines: [], torn: false };
  const hub = hubRoad(conv, { dataRoot: opts.dataRoot, call: opts.call });
  const [read, here] = await Promise.all([hub.readLines(), hereOf(hub)]);
  return { lines: read.lines.filter((l) => l && K.PRESS_RE.test(String(l.press || ''))).map((l) => viewOf(l, here, now)), torn: !!(read.torn || read.unreadable) };
}
const linesOf = async (conv, opts = {}) => (await linesRead(conv, opts)).lines;
/** a keep's line: `step` = what the files step did after it ('done' put back · 'partial' may have put some back · 'none' put nothing
 *  back, r2245 (7)); `of` = 'put-back' for a put-back's keep-first; `msgAt` = the rewound message's own time (WHICH rewind) */
const lineOfKeep = (kept, { at, msgId = null, msgAt = null, machine = null, files = 0, step = null, of = null } = {}) => ({ press: kept.press, at, until: at + K.KEEP.lifeMs,
  msgId: typeof msgId === 'string' ? msgId : null, msgAt: Number.isFinite(Number(msgAt)) && Number(msgAt) > 0 ? Number(msgAt) : null, machine, files: Number(files) || 0, step, of, state: 'kept' });
const nameOf2 = (hosts, id) => { if (!id) return null; try { const h = hosts && typeof hosts.get === 'function' ? hosts.get(id) : null; return (h && (h.name || h.label)) || String(id); } catch { return String(id); } };
const told = (broadcastToSession, session, sid, line) => { if (!line || typeof broadcastToSession !== 'function' || !session) return; try { broadcastToSession(session, sid, { type: 'msg', sessionId: sid, op: 'meta', subtype: 'rewind-kept-line', data: line }); } catch { } };
/** the lines just written, TOLD as a page draws them (r2245 (1): the door computed exactly as an attach's) to the page's session
 *  `sid`. A look at the machines that fails tells NOTHING (r2372 (3): never a false «gone»); a patch that was not recorded and has
 *  no state of its own is told as the patch only (the page keeps the state it drew) */
async function tellLines(session, conv, lines, { broadcastToSession, now, sid = conv, ...opts }) {
  const got = lines.filter(Boolean);
  if (!got.length) return got;
  let here = null;
  try { here = await hereOf(hubRoad(conv, { dataRoot: opts.dataRoot, call: opts.call })); } catch { return []; }
  const views = got.map((l) => (l.unrecorded && !l.state ? { ...l } : { ...viewOf(l, here, now), ...(l.unrecorded ? { unrecorded: true } : {}) }));
  for (const v of views) told(broadcastToSession, session, sid, v);
  return views;
}
/** after a FILES PRESS answered (src/ws-handler.js, the rewind-files case): a keep made ⇒ its line, told to every client — whatever
 *  the files step did after it (r2245 (7): a seven-day copy with no line is a lost door), its words from that step */
function afterFilesPress(session, conv, r, { broadcastToSession, hosts = null, msgId = null, now = Date.now(), ...opts } = {}) {
  const kept = r && r.results && r.results.kept;
  if (!kept || !K.PRESS_RE.test(String(kept.press || ''))) return Promise.resolve(null);
  const f = r.results.files, step = f && f.ok === true ? 'done' : r.outcome && r.outcome.maybePartial ? 'partial' : 'none';
  return noteLine(conv, lineOfKeep(kept, { at: now, msgId, msgAt: kept.msgAt, machine: nameOf2(hosts, kept.machine), files: kept.files, step }), { ...opts, now })
    .then((line) => tellLines(session, conv, [line], { broadcastToSession, now, ...opts }).then((v) => v[0] || null), () => null);
}
/** after a PUT-BACK acted: its line reads «put back» ONLY when every row that had an act was done (r2245 (2)) — else it stays kept
 *  (its door while the copy stands) and records the try (`triedAt`, `notPut`); its keep-first (what stood there) is a line of its own */
function afterPutBack(session, conv, press, r, { broadcastToSession, hosts = null, now = Date.now(), ...opts } = {}) {
  if (!r || r.ok !== true || r.dryRun === true || !K.PRESS_RE.test(String(press || ''))) return Promise.resolve(null);
  const rows = Array.isArray(r.rows) ? r.rows : [], acted = rows.filter((x) => x && x.act !== 'unchanged'), left = acted.filter((x) => x.done !== true);
  // r2372 (4): a row refused because its KEPT COPY cannot be read (or no longer matches) is named apart — the copy does not hold it
  const keptLost = left.filter((x) => x.why === 'kept-changed').length, notPut = left.length - keptLost;
  const jobs = [noteLine(conv, left.length ? { press, triedAt: now, notPut, keptLost } : { press, state: 'put-back', putBackAt: now }, { ...opts, now })];
  if (r.kept && K.PRESS_RE.test(String(r.kept.press || ''))) jobs.push(noteLine(conv, lineOfKeep(r.kept, { at: now, of: 'put-back', machine: nameOf2(hosts, r.kept.machine), files: rows.filter((x) => x.act === 'overwrite' || x.act === 'remove').length }), { ...opts, now }));
  return Promise.all(jobs).then((lines) => tellLines(session, conv, lines, { broadcastToSession, now, ...opts }), () => null);
}
/** an ATTACH (a reload): the conversation's lines sent again as their own meta, read off the loop — and only where it HAS a lines
 *  file (one async look: a conversation that never kept anything starts no keep pool); a record that cannot be read is SAID */
function sendKeptLines(ws, conv, { dataRoot = DATA_ROOT, sid = conv, ...opts } = {}) {
  if (typeof conv !== 'string' || !CONV_RE.test(conv)) return Promise.resolve([]);
  return fsp.access(path.join(dataRoot, conv, K.LINES_FILE)).then(() => linesRead(conv, { dataRoot, ...opts }), () => ({ lines: [], torn: false })).then(({ lines, torn }) => {
    if ((lines.length || torn) && ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'msg', sessionId: sid, op: 'meta', subtype: 'rewind-kept-lines', data: { lines, ...(torn ? { torn: true } : {}) } }));
    return lines;
  }, () => []);
}
/** THE CONVERSATION DELETED (r2372 (1)): its lines record goes, after any note in flight, and a press answering later writes nothing
 *  (r2372 (5)); its press folders stay for their own seven days (the sweep takes them). NOT a session's end — a resume or an exit
 *  keeps the conversation and its copies. VibeSpace has no delete road today (an archive is a flag), so nothing calls it yet */
function forgetLines(conv, { dataRoot = DATA_ROOT } = {}) {
  if (typeof conv !== 'string' || !CONV_RE.test(conv) || conv === '.' || conv === '..') return Promise.resolve(false);
  FORGOTTEN.add(conv);
  const dir = path.join(dataRoot, conv);
  return chained(conv, () => fsp.rm(path.join(dir, K.LINES_FILE), { force: true }).then(() => fsp.rmdir(dir).catch(() => { })).then(() => true, () => false));
}
const chainOf = (conv) => LINE_CHAIN.get(conv) || null;   // a leg's wait for the writes in flight

module.exports = { keepableOf, keepFor, putBack, manifestAt, roadOf, hubRoad, pairedRoad, stampOf, closePool, noteLine, linesOf, linesRead, afterFilesPress, afterPutBack, sendKeptLines, forgetLines, chainOf, convKeyOf, cappedOf, machineNameOf: nameOf2, LINES_MAX, DATA_ROOT };
