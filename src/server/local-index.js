'use strict';
/**
 * ORCH — THE ONE WRITER of the machine's own session index (lane human-cli, 2026-10-28). PURE src/local-index.js says
 * the place, the rows and the doc; this module decides WHEN, writes, and installs the person's CLI beside the index.
 *
 * WHO CALLS (test-architecture §human-cli pins it): server.js broadcastActiveSessions — the session list's ONE notify
 * point, which every create / kill / rename / restore / id adoption already reaches — plus ws-handler's attach (a
 * client attached: the row's attachedAt), the boot (`configure`, at listen: the whole list once) and the shutdown
 * (`stop`: the hub says it stopped, so a reader tells a clean stop from a crash). Nothing else writes the file.
 *
 * ONE FILE PER HUB ROOT (round 2 — two hubs on one HOME fought for ONE file: a clean stop handed it to the other hub, a
 * restart then refused, a crash replaced the dead hub's rows with the live one's): `sessions.<rootDigest>.json`. This hub
 * writes ITS file only; another hub's is never touched — except a DOWN hub's whose sessions are all gone, swept after a
 * day (LI.SWEEP_MS). WHO IS INSTALLED is the root verdict's (src/server-root.js — the one rule for every owner-file
 * write): a plain checkout writes the person's place (the home rung of the PURE ladder) and installs the CLI there; a worktree, a temp
 * root, VIBESPACE_SKIP_AGENT_HOOKS (a lane, a suite) is a THROWAWAY hub — it writes under its OWN root
 * (the PURE module's OWN_ROOT_DIR, read by that root's data/bin/vibespace) and installs nothing.
 *
 * THE WRITER NEVER TOUCHES A MOUNT, AND NEVER ON THE LOOP (round 2 — the 89-minute freeze's shape, re-made by r1's own
 * heartbeat: a fresh chat's transcript LOCATE readdirSync'd data/remote-jsonl on the bindfs every 60 s and held the loop
 * 35 s): a row's transcript is the harness's PURE path rule (store.transcriptPathOf — computed, never located by listing
 * a folder); the place is judged where it LANDS (a symlink followed by lstat/readlink of LOCAL folders only — the mount
 * table is asked before each touch); the boot runs off the listen callback's turn; every write is async (tmp + rename,
 * 0600 in a 0700 folder), one at a time, a write that has not returned in WRITE_BOUND_MS said once. Only the shutdown
 * writes synchronously (the process ends after it), and not over a write that is stuck.
 */
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const LI = require('../local-index.js');

const NOTE_MS = 250;
const WRITE_BOUND_MS = 5000;     // a write not returned in this long is said (the next waits for it — writes never overlap)
const INSTALL_BOUND_MS = 10000;

let cfg = null;          // what configure() was handed
let place = null;        // the PURE place verdict (decided at the boot)
let file = null;         // <place.dir>/sessions.<rootDigest>.json — this hub's own file
let hubFacts = null;     // the hub's own facts (pid + birth, root, port, unit, …)
let timer = null, beat = null, stopped = false, bootP = null;
let lastRows = null, failSaid = null, slowSaid = false, inFlight = null, pending = null, stopText = null;
const attachedAt = new Map();   // session id → the last client attach (pruned to the live ids at each write)
const framesOf = new Map();

const readProcText = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };   // procfs only — never a mount
const say = (lvl, line) => { try { ((cfg && cfg.log) || console)[lvl](line); } catch { } };
const digestOf = (root) => crypto.createHash('sha256').update(String(root || '')).digest('hex').slice(0, 12);
/** A promise with a clock: resolves {ok, v} | {ok: false, late: true} — the work itself goes on (an fs call cannot be cancelled). */
const bounded = (p, ms) => new Promise((res) => { const t = setTimeout(() => res({ ok: false, late: true }), ms); if (t.unref) t.unref(); p.then((v) => { clearTimeout(t); res({ ok: true, v }); }, (e) => { clearTimeout(t); res({ ok: false, e }); }); });

/** The boot: the hub's own facts now (procfs), everything that touches a disk OFF this turn. → api (`ready()` awaits it). */
function configure({ rootDir, port = null, host = null, version = null, sessions, buffersDir = null, dataDir = null, log = console,
  home = os.homedir(), uid = typeof process.getuid === 'function' ? process.getuid() : null, mountinfo = null, procRoot = '/proc',
  now = Date.now, turnOf = null, heartbeatMs = LI.HEARTBEAT_MS, install = true, throwaway = false, owner = null, adapters = null, harnesses = null,
  env = process.env, xdgRuntimeDir = process.env.XDG_RUNTIME_DIR || '', varTmp = '/var/tmp' } = {}) {
  if (beat) clearInterval(beat);
  if (timer) clearTimeout(timer);
  timer = beat = null;
  cfg = { rootDir, port, host, version, sessions, buffersDir, dataDir, log, home, uid, now, turnOf, procRoot, adapters, heartbeatMs, install, xdgRuntimeDir, varTmp, harnesses };   // the harness registry is resolved lazily (rowsNow, off the listen turn)
  framesOf.clear();
  stopped = false; lastRows = null; place = null; file = null; failSaid = null; slowSaid = false; inFlight = null; pending = null; stopText = null;
  cfg.mountinfo = mountinfo != null ? mountinfo : (readProcText(path.join(procRoot, 'self', 'mountinfo')) || '');
  const own = LI.procStat(readProcText(path.join(procRoot, String(process.pid), 'stat')));
  const dm = dataDir ? LI.mountOf(path.resolve(dataDir), cfg.mountinfo) : null;
  // THE ROLE: the root verdict's refusal kind (owner = src/server-root.js via ownerWriteRefusal(): null = a plain checkout)
  const role = throwaway ? (typeof throwaway === 'string' ? throwaway : 'tmp') : owner && owner.kind ? String(owner.kind) : false;
  // THE UNIT: the cgroup names it, but only the unit's MAIN process owns it (a hub started inside a session sits in the cgroup too)
  const cg = LI.unitOfCgroup(readProcText(path.join(procRoot, 'self', 'cgroup')));
  const unit = cg && LI.unitOwnedBy({ pid: process.pid, execPid: env.SYSTEMD_EXEC_PID, ppid: process.ppid, parentComm: readProcText(path.join(procRoot, String(process.ppid), 'comm')) }) ? cg : null;
  hubFacts = {
    pid: process.pid, starttime: own ? own.starttime : null, bootId: (readProcText(path.join(procRoot, 'sys', 'kernel', 'random', 'boot_id')) || '').trim() || null,
    root: rootDir || null, throwaway: role, host: host || null, port: Number(port) || null, version: version || null,
    unit, startedAt: now(), dataDir: dataDir || null, dataFs: dm ? dm.fstype : null, place: null,
  };
  bootP = new Promise((resolve) => setImmediate(() => boot().then(resolve, (e) => { say('warn', `[local-index] the boot failed: ${e && e.message}`); resolve(false); })));
  return api;
}

/** lstat / readlink / the rung law's facts — called by the PURE ladder only AFTER the mount table said the path is local. */
const lstatLocal = (p) => { try { return { symlink: fs.lstatSync(p).isSymbolicLink() }; } catch (e) { if (e && e.code === 'ENOENT') return null; throw e; } };
const readlinkLocal = (p) => fs.readlinkSync(p);
const factsLocal = (p) => { try { const st = fs.lstatSync(p); return { exists: true, symlink: st.isSymbolicLink(), dir: st.isDirectory(), uid: st.uid, mode: st.mode & 0o7777 }; } catch { return { exists: false }; } };

async function boot() {
  const own = hubFacts.throwaway ? { root: cfg.rootDir } : null;
  place = LI.indexPlaceOf({ home: cfg.home, uid: cfg.uid, mountinfo: cfg.mountinfo, xdgRuntimeDir: cfg.xdgRuntimeDir, varTmp: cfg.varTmp, own, lstat: lstatLocal, readlink: readlinkLocal, facts: factsLocal });
  hubFacts.place = { via: place.via || null, why: place.why };
  for (const t of place.tried || []) if (/refused/.test(t.why || '')) say('warn', `[local-index] ${t.why}`);   // a squatted rung, by name
  if (!place.dir) { say('warn', `[local-index] no index for this hub's sessions: ${place.why}`); return false; }
  // the folder: made HERE, 0700 — then judged again (the rung law: a folder someone else made in between is refused)
  const made = await bounded(fsp.mkdir(place.dir, { recursive: true, mode: 0o700 }), WRITE_BOUND_MS);
  if (!made.ok) { say('warn', `[local-index] no index here: ${made.late ? `${place.dir} did not answer in ${WRITE_BOUND_MS / 1000} s` : `${(made.e && made.e.code) || 'error'} (${place.dir})`} — the person's CLI cannot list this hub's sessions`); place = { ...place, dir: null }; return false; }
  const law = LI.rungFolderOf(factsLocal(place.dir), { uid: cfg.uid, dir: place.dir });
  if (!law.ok) { say('warn', `[local-index] no index here: ${law.why}`); place = { ...place, dir: null }; return false; }
  file = path.join(place.dir, LI.indexFileOf(digestOf(cfg.rootDir)));
  if (hubFacts.throwaway) say('log', `[local-index] a throwaway hub (${hubFacts.throwaway}): its sessions index is ${file} under its own root — never the person's ~/.vibespace; \`${path.join(String(cfg.rootDir), 'data', 'bin', 'vibespace')} ls\` reads it`);
  else say('log', `[local-index] sessions index for the person's CLI: ${file} (${place.why}) — \`${place.bin}/vibespace ls\` works with no hub`);
  beat = setInterval(() => { write('heartbeat'); }, cfg.heartbeatMs);
  if (beat.unref) beat.unref();
  const ok = await write('boot');
  if (!hubFacts.throwaway && cfg.install && place.bin) {
    const r = await bounded(installPersonCli(), INSTALL_BOUND_MS);
    if (!r.ok) say('warn', `[local-index] the person's CLI not installed in ${place.bin}: ${r.late ? `no answer in ${INSTALL_BOUND_MS / 1000} s` : (r.e && r.e.message)}`);
  }
  await bounded(sweep(), WRITE_BOUND_MS);
  return ok;
}

/** Something about the session list changed (or a client attached): one write within NOTE_MS, coalesced. */
function note(reason = 'sessions', id = null) {
  if (reason === 'attach' && id) attachedAt.set(String(id), Date.now());
  if (!cfg || stopped || timer || !file) return;   // before the boot's write: that write lists everything
  timer = setTimeout(() => { timer = null; write(reason); }, NOTE_MS);
  if (timer.unref) timer.unref();
}

function safeHarnesses() { try { return require('../harnesses'); } catch { return null; } }
const harnessOf = (s) => { try { if (cfg.harnesses == null) cfg.harnesses = safeHarnesses() || false; return (cfg.harnesses && cfg.harnesses.get(s.backend || 'claude')) || null; } catch { return null; } };
/** The harness's own conversation id (its declared field beside backendSessionId — claude: claudeSessionId). */
function conversationIdOf(s) {
  const h = harnessOf(s);
  const f = h && h.spawn && h.spawn.conversationIdField;
  return (f && typeof s[f] === 'string' && s[f]) || s.backendSessionId || null;
}
/** The transcript path the harness's PURE rule computes (store.transcriptPathOf — no fs; it may not exist yet: the CLI
 *  reads it with a clock and falls back to the wrapper's buffer). A harness with no such rule (a dated rollout name
 *  needs a listing) gives none — the writer never lists a folder. Remote sessions: none here. */
function transcriptOf(s, convId) {
  if (!s || s.host || !convId) return null;
  const h = harnessOf(s);
  const rule = h && h.store && h.store.transcriptPathOf;
  if (typeof rule !== 'function') return null;
  try { const p = rule(convId, s.cwd); return typeof p === 'string' && p ? p : null; } catch { return null; }
}
/** The session's adapter, asked ONCE per backend for its two stdin frames with the PURE placeholders → the row's templates.
 *  The line is the adapter's ENTER frame (`steer: true` — the owner's law: Enter hands a line to the running turn; an
 *  adapter that has no such door ignores the option). */
function inputOf(s) {
  if (s.mode !== 'chat' || !cfg.adapters) return null;
  const b = s.backend || 'claude';
  if (framesOf.has(b)) return framesOf.get(b);
  let v = null;
  try { const a = cfg.adapters.get(b); v = a ? LI.frameTemplatesOf(a.formatChatInput(LI.FRAME_TEXT, LI.FRAME_ID, { steer: true }).stdinPayload, a.formatInterrupt(s)) : null; } catch { v = null; }
  framesOf.set(b, v);
  return v;
}

function rowsNow() {
  const rows = [];
  const live = new Set();
  let list = [];
  try { list = cfg.sessions ? [...cfg.sessions()] : []; } catch { list = []; }
  for (const [id, s] of list) {
    if (!s || s.isTmuxView) continue;
    live.add(String(id));
    let turn = null;
    if (s.mode === 'chat' && typeof cfg.turnOf === 'function') { try { turn = cfg.turnOf(s); } catch { turn = null; } }
    const conversationId = conversationIdOf(s);
    rows.push(LI.rowOf(id, s, { buffersDir: cfg.buffersDir, transcript: transcriptOf(s, conversationId), turn, attachedAt: attachedAt.get(String(id)) || null, conversationId, input: inputOf(s) }));
  }
  for (const k of [...attachedAt.keys()]) if (!live.has(k)) attachedAt.delete(k);
  return rows;
}

/** ONE write at a time, async (tmp + rename): a note during a write is carried by the next. → Promise<boolean>. */
function write(reason) {
  if (!cfg || !file || stopped) return Promise.resolve(false);
  if (inFlight) {
    pending = pending || reason;
    if (!slowSaid && Date.now() - inFlight.at > WRITE_BOUND_MS) { slowSaid = true; say('warn', `[local-index] the write to ${file} has not returned in ${WRITE_BOUND_MS / 1000} s — the next waits for it (that disk is not answering)`); }
    return inFlight.p.then(() => false);
  }
  const rows = rowsNow();
  const rowsJson = JSON.stringify(rows);
  if (reason !== 'heartbeat' && reason !== 'boot' && rowsJson === lastRows) return Promise.resolve(false);
  const t = cfg.now();
  const text = JSON.stringify(LI.docOf({ hub: { ...hubFacts, seenAt: t, stoppedAt: null }, rows, now: t }), null, 1) + '\n';
  const tmp = `${file}.${process.pid}.tmp`;
  const p = (async () => {
    try { await fsp.writeFile(tmp, text, { mode: 0o600 }); await fsp.rename(tmp, file); lastRows = rowsJson; failSaid = null; slowSaid = false; return true; }
    catch (e) { if (failSaid !== e.code) { failSaid = e.code; say('warn', `[local-index] ${file} not written (${e.message}) — the person's CLI reads the last one`); } return false; }
  })();
  inFlight = { at: Date.now(), p };
  return p.then((ok) => {
    inFlight = null;
    if (stopText) { try { fs.writeFileSync(tmp, stopText, { mode: 0o600 }); fs.renameSync(tmp, file); } catch { } return ok; }   // a write that landed after the stop: the stop's word stays last
    if (pending && !stopped) { const r = pending; pending = null; write(r); }
    return ok;
  });
}

/** The shutdown: the hub says it stopped (a reader then tells a clean stop from a crash) and writes no more. Synchronous
 *  (the process ends next) — on the folder the boot judged local, never over a write that is stuck. */
function stop() {
  if (!cfg || stopped) return;
  if (timer) { clearTimeout(timer); timer = null; }
  if (beat) { clearInterval(beat); beat = null; }
  stopped = true;
  if (!file) return;
  if (inFlight && Date.now() - inFlight.at > WRITE_BOUND_MS) { say('warn', `[local-index] the stop is not written: a write to ${file} is stuck`); return; }
  try {
    const t = cfg.now();
    stopText = JSON.stringify(LI.docOf({ hub: { ...hubFacts, seenAt: t, stoppedAt: t }, rows: rowsNow(), now: t }), null, 1) + '\n';
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, stopText, { mode: 0o600 });
    fs.renameSync(tmp, file);
  } catch (e) { say('warn', `[local-index] the stop is not written to ${file} (${e.message})`); }
}

/** Another hub's file whose hub is DOWN and whose sessions' processes are all gone, a day after its last word: swept. */
async function sweep() {
  if (!place || !place.dir) return;
  const bootId = hubFacts.bootId || '';
  const procOf = (pid) => readProcText(path.join(cfg.procRoot, String(pid), 'stat'));
  for (const name of await fsp.readdir(place.dir)) {
    if (!LI.INDEX_FILE_RE.test(name) || path.join(place.dir, name) === file) continue;
    let doc; try { const r = LI.parseIndex(await fsp.readFile(path.join(place.dir, name), 'utf8')); if (!r.ok) continue; doc = r.doc; } catch { continue; }
    const h = doc.hub || {};
    if (LI.procVerdict(h, { stat: procOf(h.pid), bootId }) === 'same') continue;
    const last = Number(h.stoppedAt) || Number(h.seenAt) || Number(doc.writtenAt) || 0;
    if (!last || cfg.now() - last < LI.SWEEP_MS) continue;
    if (doc.sessions.some((r) => r.child && LI.procVerdict(r.child, { stat: procOf(r.child.pid), bootId }) === 'same')) continue;
    try { await fsp.unlink(path.join(place.dir, name)); say('log', `[local-index] swept ${name}: the hub at ${h.root || '?'} has been down since ${new Date(last).toISOString()} and none of its sessions runs`); } catch { }
  }
}

/** The CLI and its PURE half, copied onto the machine's own disk (a CLI under data/ hangs with data/) when the bytes
 *  differ — async, bounded by the boot: the two files are read from this hub's own checkout, once per boot. */
async function installPersonCli() {
  const pairs = [[path.join(cfg.rootDir, 'data', 'bin', 'vibespace'), 'vibespace', 0o755], [path.join(cfg.rootDir, 'src', 'local-index.js'), 'vibespace-local-index.js', 0o644]];
  await fsp.mkdir(place.bin, { recursive: true, mode: 0o700 });
  for (const [src, name, mode] of pairs) {
    const bytes = await fsp.readFile(src);
    const dst = path.join(place.bin, name);
    let cur = null; try { cur = await fsp.readFile(dst); } catch { cur = null; }
    if (cur && cur.equals(bytes)) continue;
    await fsp.writeFile(dst + '.tmp', bytes, { mode });
    await fsp.chmod(dst + '.tmp', mode);
    await fsp.rename(dst + '.tmp', dst);
  }
}

function _reset() { if (timer) clearTimeout(timer); if (beat) clearInterval(beat); cfg = null; place = null; file = null; hubFacts = null; timer = null; beat = null; stopped = false; bootP = null; lastRows = null; failSaid = null; slowSaid = false; inFlight = null; pending = null; stopText = null; attachedAt.clear(); framesOf.clear(); }

const api = {
  configure, note, stop, placeOf: () => place, fileOf: () => file, hubFactsOf: () => hubFacts, ready: () => bootP || Promise.resolve(false),
  flush: (reason = 'flush') => { if (timer) { clearTimeout(timer); timer = null; } return write(reason); }, _reset,
};
module.exports = api;
