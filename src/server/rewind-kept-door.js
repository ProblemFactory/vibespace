'use strict';
// ORCH: THE KEPT COPY'S DOOR (row B-437e, the files tier — 主开发 r1247 (2), r1304, r1327; lane lg-rewind, 2026-11-21). The
// decisions are src/rewind-kept.js (PURE); here are the two ROADS that carry them out, and the put-back:
//   THIS HUB: the conversation's own folder under the hub's data (data/chat-attachments/<conversation>/rewind-kept/), every
//   file act on the «rewind-keep» one-worker SafeFs pool (src/server/rewind-keep-worker.js) behind the mount door — a storage
//   that hangs ends that worker, never the hub's loop. The read-back is each copy's sha256 against the original's.
//   A PAIRED MACHINE: under the agent's own state ON THAT MACHINE (<its home>/.vibespace/agentd/rewind-kept/<conversation>/), by
//   the agent's EXISTING file actions only (r1327; no new device op): mkdir, copy (capability `fs-portable` — an older agent is
//   never asked: «cannot keep a copy: upgrade the agent»), stat, list, write, rename, rm, each stamped `by` and gated by that
//   machine's own policy flag `files`. The read-back is the copy's own success and the kept file's size equal to the original's
//   (both stated after the copy); no byte of a person's file crosses the link for a check. The press's manifest is sealed on
//   the machine AND at the hub (the put-back reads the hub's). The machine's sweep reads a press folder by its shape, its mark
//   file's presence and the press time its own name carries.
// THE TOTAL (1 GiB) and THE SWEEP are the MACHINE's: every conversation's press folders on it count, and each keep sweeps them
// all — by that machine's own clock (a paired machine: the time of the press folder it just made). The boot's own sweep is the
// next keep's (server.js takes no line). The press folder and its MARK are made FIRST, so a keep cut short leaves a folder the
// sweep may take after its seven days. Each act on a paired machine is stamped with the person's own `by` (the socket's
// sign-in subject, else human:owner) and bounded 10 s. THE PUT-BACK is fenced like a press (no running turn, no rewind out;
// it holds the files mark while it works), names each path's act before it does it, keeps what stands there now first (the
// law), asks the mount door before each path, and puts back by a temp name beside the path (the press id in it) renamed over
// it — a temp a cut-short act left is removed; it spares its own press from the sweep; it touches nothing of the conversation.
const path = require('path');
const crypto = require('crypto');
const DOOR = require('../mount-door');
const DA = require('../device-acts.js');
const { SafeFs } = require('../safe-fs');
const K = require('../rewind-kept.js');
const RQ = require('./rewind-requests.js');

const DATA_ROOT = path.join(__dirname, '..', '..', 'data', 'chat-attachments');
const CONV_RE = /^[\w-][\w.-]{0,127}$/;
const PAIRED_CONVS_MAX = 500;
let _pool = null;
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
  const rootOf = (c) => path.join(dataRoot, c, 'rewind-kept');
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
  };
}

/** A PAIRED MACHINE's road over its agent (`dm`), the existing actions only (r1327), each bounded and stamped */
async function pairedRoad(conv, dm, { by: who, host }) {
  const by = stampOf(who);   // the person's own string stamp — written AT each act call (test-architecture §91)
  const isAbsent = (e) => /ENOENT|no such file/i.test(nameOf(e));
  const home = (await bounded(dm.fsHome())).home;   // fs-portable: an older agent throws here (host_needs_daemon) — «upgrade the agent»
  const win = /^[A-Za-z]:[\\/]/.test(home), sep = win ? '\\' : '/';
  const join = (...p) => p.map((x, i) => (i ? String(x).replace(/^[\\/]+/, '') : String(x).replace(/[\\/]+$/, ''))).join(sep);
  const base = join(home, '.vibespace', 'agentd', 'rewind-kept');
  const statOf = async (p) => {
    try {
      const r = await bounded(dm.fsStat(p));
      if (!r || !r.stat) return { path: p, error: 'unreadable' };
      return { path: p, mode: r.stat.isDir ? 0o040000 | (Number(r.stat.mode) & 0o7777) : r.stat.mode, size: r.stat.size, mtimeMs: r.stat.mtimeMs };
    } catch (e) { return isAbsent(e) ? { path: p, absent: true } : { path: p, error: nameOf(e) }; }
  };
  const listOf = async (p) => { try { return ((await bounded(dm.fsList(p))) || {}).entries || []; } catch (e) { if (isAbsent(e)) return []; throw e; } };
  const pressAt = (name) => parseInt(name.slice(3, name.lastIndexOf('-')), 36);
  const pressesOf = async (c) => {
    const out = [];
    for (const e of await listOf(join(base, c))) {
      if (!e || !e.isDir || !K.PRESS_RE.test(e.name)) continue;
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
    open: async (dir, mark) => { await bounded(dm.fsMkdir(dir, { by })); await bounded(dm.fsWrite(join(dir, K.MARK_FILE), Buffer.from(JSON.stringify(mark)), { by })); },
    keepOne: async (dir, row) => {
      const dest = join(dir, K.keptName(row.n));
      await bounded(dm.fsCopy(row.path, dest, { by }));
      const k = await statOf(dest), s = await statOf(row.path);
      return { ok: !k.error && !k.absent && !s.error && !s.absent, size: k.size, mtimeMs: k.mtimeMs, srcSize: s.size };
    },
    seal: (dir, manifest) => bounded(dm.fsWrite(join(dir, K.MANIFEST_FILE), Buffer.from(JSON.stringify(manifest)), { by })),
    list: () => pressesOf(conv),
    listAll: async () => {
      const out = [];
      for (const c of (await listOf(base)).filter((e) => e && e.isDir && CONV_RE.test(e.name)).slice(0, PAIRED_CONVS_MAX)) out.push(...(await pressesOf(c.name)));
      return out;
    },
    removePress: async (c, name) => {
      if (!K.PRESS_RE.test(name) || !CONV_RE.test(c)) return { ok: false, why: 'not-a-press' };
      if (!(await listOf(join(base, c, name))).some((k) => k && k.name === K.MARK_FILE)) return { ok: false, why: 'no-mark' };
      await bounded(dm.fsRm(join(base, c, name), true, { by }));
      return { ok: true };
    },
    discard: async (dir) => { if (K.PRESS_RE.test(dir.split(/[\\/]/).pop()) && !(await listOf(dir)).some((k) => k && k.name === K.MANIFEST_FILE)) await bounded(dm.fsRm(dir, true, { by })).catch(() => { }); },
    keptFacts: async (dir, rows) => {
      const out = {};
      for (const r of rows) if (r.kind !== 'absent') { const f = await statOf(join(dir, K.keptName(r.n))); out[r.n] = f.error || f.absent ? null : { size: f.size, mtimeMs: f.mtimeMs }; }
      return out;
    },
    putOne: async (dir, row, act, press) => {
      if (act === 'remove') { await bounded(dm.fsRm(row.path, false, { by })); return { ok: true }; }
      if (act !== 'overwrite' && act !== 'create') return { ok: true, skipped: act };
      const tmp = `${row.path}.${press}.vs-tmp`;
      await bounded(dm.fsCopy(join(dir, K.keptName(row.n)), tmp, { by }));
      await bounded(dm.fsRename(tmp, row.path, { by }));
      return { ok: true };
    },
    dropTmp: (file) => bounded(dm.fsRm(file, false, { by })),
  };
}

/** the road for a conversation → a road | {ok: false, why} */
async function roadOf(session, conv, { hosts = null, by = null, dataRoot = DATA_ROOT, call = null, dm = null } = {}) {
  if (typeof conv !== 'string' || !CONV_RE.test(conv) || conv === '.' || conv === '..') return { ok: false, why: 'unreadable' };
  if (!session || !session.host) return hubRoad(conv, { dataRoot, call });
  let agent = dm;
  try { if (!agent) agent = hosts && typeof hosts.deviceBounded === 'function' ? await hosts.deviceBounded(session.host, 2000) : null; } catch { agent = null; }
  if (!agent || typeof agent.fsStat !== 'function') return { ok: false, why: 'unreadable' };
  try { return await pairedRoad(conv, agent, { by, host: session.host }); }
  catch (e) { return { ok: false, why: /fs-portable|host_needs_daemon/.test(nameOf(e)) ? 'agent-too-old' : notAllowed(e) ? 'files-not-allowed' : timedOut(e) ? 'no-time' : 'unreadable' }; }
}

/** THE MACHINE's sweep (all its conversations), by its own clock, sparing `spare` → {used: the bytes left, swept} */
async function sweptOn(road, now, { spare = [] } = {}) {
  const entries = await road.listAll(), keep = new Set(spare);
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
    return { ok: plan.ok, refusals: plan.refusals, check: road.paired ? 'size' : 'sha256' };
  } catch (e) { return { ok: false, refusals: [{ path: null, why: timedOut(e) ? 'no-time' : notAllowed(e) ? 'files-not-allowed' : 'unreadable' }] }; }
}

/** THE KEEP before the files press → {ok, press, where, machine, check, swept} | {ok: false, refusals}. The press folder and its
 *  mark first; the machine's sweep by its own clock (sparing `spare` and this press); the plan; each copy (10 s, 60 s all) and
 *  its read-back; the manifest last. A keep that fails leaves no unsealed folder behind */
async function keepFor({ session, conv, files, hosts = null, by = null, now = Date.now(), hex8 = crypto.randomBytes(4).toString('hex'), spare = [], ...opts } = {}) {
  const road = await roadOf(session, conv, { hosts, by, ...opts });
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
      if (Date.now() - t0 > K.KEEP.allMs) { back[row.n] = { ok: false, timedOut: true }; break; }
      try { back[row.n] = await road.keepOne(dir, row); } catch (e) { back[row.n] = { ok: false, timedOut: timedOut(e), notAllowed: notAllowed(e) }; }
    }
    const rb = K.readBackOf(plan.rows, back, { paired: road.paired });
    if (!rb.ok) return fail(rb.refusals);
    const manifest = K.manifestOf({ conv, press, at: now, machine: road.machine, paired: road.paired, rows: plan.rows, back });
    await road.seal(dir, manifest);
    if (road.paired) { const hub = hubRoad(conv, opts), hubDir = hub.join(hub.root, press); await hub.open(hubDir, mark); await hub.seal(hubDir, manifest); }   // the hub keeps the manifest
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
  const mark = { id: `put-${press}`, at: Date.now(), files: true };
  if (session) RQ.setFilesOut(session, mark);   // ONE AT A TIME: a press, a confirm and the person's send wait on the put-back
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
  } finally { if (session && RQ.filesOutOf(session) === mark) RQ.setFilesOut(session, null); }
}

module.exports = { keepableOf, keepFor, putBack, manifestAt, roadOf, hubRoad, pairedRoad, stampOf, DATA_ROOT };
