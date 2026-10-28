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
 * THE WRITE IS SYNCHRONOUS, ON PURPOSE. The 89-minute freeze (2026-10-27) held the hub because data/ sat on a stalled
 * NFS: an fs.promises write here would queue in the same libuv threadpool those stalled calls hold, and the index would
 * go stale exactly when a person needs it. The place verdict put the file on the machine's own disk (never a network or
 * FUSE mount), the file is a few KB, and it is written at most once per NOTE_MS plus a heartbeat every HEARTBEAT_MS —
 * tmp + rename, mode 0600 (the folder 0700): a reader never sees half a file.
 *
 * TWO HUBS, ONE HOME: an index another LIVE hub wrote (another root, its pid + birth still running) is never
 * overwritten — said once in the log; a dead hub's index is replaced.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const LI = require('../local-index.js');

const NOTE_MS = 250;

let cfg = null;          // what configure() was handed
let place = null;        // the PURE place verdict (decided once)
let hubFacts = null;     // the hub's own facts (pid + birth, root, port, unit, …)
let timer = null, beat = null, stopped = false;
let lastRows = null, refusedSaid = null, failSaid = null;
const attachedAt = new Map();   // session id → the last client attach (pruned to the live ids at each write)

const readText = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
const say = (lvl, line) => { try { ((cfg && cfg.log) || console)[lvl](line); } catch { } };

/** The boot: decide the place once, say it, install the CLI beside it, write the whole list, start the heartbeat. */
function configure({ rootDir, port = null, host = null, version = null, sessions, buffersDir = null, dataDir = null, log = console,
  home = os.homedir(), uid = typeof process.getuid === 'function' ? process.getuid() : null, mountinfo = null, procRoot = '/proc',
  now = Date.now, turnOf = null, heartbeatMs = LI.HEARTBEAT_MS, install = true, throwaway = false, adapters = null, harnesses = null } = {}) {
  cfg = { rootDir, port, host, version, sessions, buffersDir, dataDir, log, home, now, turnOf, procRoot, adapters, harnesses: harnesses || safeHarnesses(), throwaway: !!throwaway };
  located.clear(); framesOf.clear();
  stopped = false; lastRows = null;
  const mi = mountinfo != null ? mountinfo : (readText(path.join(procRoot, 'self', 'mountinfo')) || '');
  place = LI.indexPlaceOf({ home, uid, mountinfo: mi, xdgRuntimeDir: process.env.XDG_RUNTIME_DIR || '' });
  const own = LI.procStat(readText(path.join(procRoot, String(process.pid), 'stat')));
  const dm = dataDir ? LI.mountOf(path.resolve(dataDir), mi) : null;
  hubFacts = {
    pid: process.pid, starttime: own ? own.starttime : null, bootId: (readText(path.join(procRoot, 'sys', 'kernel', 'random', 'boot_id')) || '').trim() || null,
    root: rootDir || null, throwaway: !!throwaway, host: host || null, port: Number(port) || null, version: version || null,
    unit: LI.unitOfCgroup(readText(path.join(procRoot, 'self', 'cgroup'))), startedAt: now(), dataDir: dataDir || null,
    dataFs: dm ? dm.fstype : null, place: { via: place.via || null, why: place.why },
  };
  if (!place.file) say('warn', `[local-index] the person's CLI has no index on this machine: ${place.why}`);
  else say('log', `[local-index] sessions index for the person's CLI: ${place.file} (${place.why}) — \`${place.bin}/vibespace ls\` works with no hub`);
  const other = place.file ? foreignLiveHub() : null;
  if (other) say('warn', `[local-index] ${place.file} belongs to ${hubFacts.throwaway && !other.throwaway ? 'the installed' : 'the live'} hub at ${other.root} (pid ${other.pid}) — this hub neither writes it nor installs its CLI there`);
  else if (install && place.file) installPersonCli();
  if (beat) clearInterval(beat);
  beat = setInterval(() => write('heartbeat'), heartbeatMs);
  if (beat.unref) beat.unref();
  write('boot');
  return api;
}

/** Something about the session list changed (or a client attached): one write within NOTE_MS, coalesced. */
function note(reason = 'sessions', id = null) {
  if (reason === 'attach' && id) attachedAt.set(String(id), Date.now());
  if (!cfg || stopped || timer) return;
  timer = setTimeout(() => { timer = null; write(reason); }, NOTE_MS);
  if (timer.unref) timer.unref();
}

function safeHarnesses() { try { return require('../harnesses'); } catch { return null; } }
const harnessOf = (s) => { try { return (cfg.harnesses && cfg.harnesses.get(s.backend || 'claude')) || null; } catch { return null; } };
/** The harness's own conversation id (its declared field beside backendSessionId — claude: claudeSessionId). */
function conversationIdOf(s) {
  const h = harnessOf(s);
  const f = h && h.spawn && h.spawn.conversationIdField;
  return (f && typeof s[f] === 'string' && s[f]) || s.backendSessionId || null;
}
/** The transcript the harness's store LOCATES for a conversation on this machine (null: remote, none yet, no store) —
 *  cached per conversation (a locate may walk the store), a miss re-asked after LOCATE_RETRY_MS. */
const LOCATE_RETRY_MS = 60000;
const located = new Map();   // `${backend}\0${id}` → {path, at}
function transcriptOf(s, convId) {
  if (!s || s.host || !convId) return null;
  const h = harnessOf(s);
  const loc = h && h.store && h.store.locate;
  if (typeof loc !== 'function') return null;
  const k = `${s.backend || 'claude'}\0${convId}`;
  const c = located.get(k);
  if (c && (c.path || Date.now() - c.at < LOCATE_RETRY_MS)) return c.path;
  let p = null; try { p = loc(convId, s.cwd) || null; } catch { p = null; }
  located.set(k, { path: typeof p === 'string' ? p : null, at: Date.now() });
  return typeof p === 'string' ? p : null;
}
/** The session's adapter, asked ONCE per backend for its two stdin frames with the PURE placeholders → the row's templates. */
const framesOf = new Map();
function inputOf(s) {
  if (s.mode !== 'chat' || !cfg.adapters) return null;
  const b = s.backend || 'claude';
  if (framesOf.has(b)) return framesOf.get(b);
  let v = null;
  try { const a = cfg.adapters.get(b); v = a ? LI.frameTemplatesOf(a.formatChatInput(LI.FRAME_TEXT, LI.FRAME_ID).stdinPayload, a.formatInterrupt(s)) : null; } catch { v = null; }
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
  if (located.size > 4 * (live.size + 8)) located.clear();
  return rows;
}

/** May this hub write the index on disk? → null (yes) | the other hub's facts (no). Never over another LIVE hub's (its
 *  root differs and its pid + birth still run). A THROWAWAY hub (a root under the temp folder — a suite's scratch) never
 *  replaces an INSTALLED hub's index, dead or alive: that file is the person's way in while their hub is down. An installed
 *  hub replaces a throwaway's. */
function foreignLiveHub() {
  const cur = LI.parseIndex(readText(place.file));
  if (!cur.ok || !cur.doc.hub || !cur.doc.hub.root || cur.doc.hub.root === hubFacts.root) return null;
  const h = cur.doc.hub;
  if (Number(h.pid) === process.pid) return null;
  if (hubFacts.throwaway && !h.throwaway) return h;
  if (!hubFacts.throwaway && h.throwaway) return null;
  const v = LI.procVerdict(h, { stat: readText(path.join(cfg.procRoot, String(h.pid), 'stat')), bootId: hubFacts.bootId || '' });
  return v === 'same' && !h.stoppedAt ? h : null;
}

function write(reason, { stoppedAt = null } = {}) {
  if (!cfg || !place || !place.file) return false;
  if (stopped && !stoppedAt) return false;
  const rows = rowsNow();
  const rowsJson = JSON.stringify(rows);
  if (reason !== 'heartbeat' && reason !== 'boot' && !stoppedAt && rowsJson === lastRows) return false;
  try {
    const other = foreignLiveHub();
    if (other) {
      if (refusedSaid !== other.root) { refusedSaid = other.root; say('warn', `[local-index] not written: ${place.file} belongs to ${hubFacts.throwaway && !other.throwaway ? 'the installed' : 'the live'} hub at ${other.root} (pid ${other.pid}) — this hub's sessions are not in the person's index`); }
      return false;
    }
    const t = cfg.now();
    const doc = LI.docOf({ hub: { ...hubFacts, seenAt: t, stoppedAt }, rows, now: t });
    fs.mkdirSync(place.dir, { recursive: true, mode: 0o700 });
    const tmp = `${place.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(doc, null, 1) + '\n', { mode: 0o600 });
    fs.renameSync(tmp, place.file);
    lastRows = rowsJson; failSaid = null;
    return true;
  } catch (e) {
    if (failSaid !== e.code) { failSaid = e.code; say('warn', `[local-index] ${place.file} not written (${e.message}) — the person's CLI reads the last one`); }
    return false;
  }
}

/** The shutdown: the hub says it stopped (a reader then tells a clean stop from a crash) and writes no more. */
function stop() {
  if (!cfg || stopped) return;
  if (timer) { clearTimeout(timer); timer = null; }
  if (beat) { clearInterval(beat); beat = null; }
  write('stop', { stoppedAt: cfg.now() });
  stopped = true;
}

/** The CLI and its PURE half, copied onto the machine's own disk (a CLI under data/ hangs with data/) when the bytes differ. */
function installPersonCli() {
  const pairs = [[path.join(cfg.rootDir, 'data', 'bin', 'vibespace'), 'vibespace', 0o755], [path.join(cfg.rootDir, 'src', 'local-index.js'), 'vibespace-local-index.js', 0o644]];
  try {
    fs.mkdirSync(place.bin, { recursive: true, mode: 0o700 });
    for (const [src, name, mode] of pairs) {
      const bytes = fs.readFileSync(src);
      const dst = path.join(place.bin, name);
      let cur = null; try { cur = fs.readFileSync(dst); } catch { cur = null; }
      if (cur && cur.equals(bytes)) continue;
      fs.writeFileSync(dst + '.tmp', bytes, { mode });
      fs.chmodSync(dst + '.tmp', mode);
      fs.renameSync(dst + '.tmp', dst);
    }
  } catch (e) { say('warn', `[local-index] the person's CLI not installed in ${place.bin}: ${e.message}`); }
}

function _reset() { if (timer) clearTimeout(timer); if (beat) clearInterval(beat); cfg = null; place = null; hubFacts = null; timer = null; beat = null; stopped = false; lastRows = null; refusedSaid = null; failSaid = null; attachedAt.clear(); located.clear(); framesOf.clear(); }

const api = { configure, note, stop, placeOf: () => place, hubFactsOf: () => hubFacts, flush: (reason = 'flush') => { if (timer) { clearTimeout(timer); timer = null; } return write(reason); }, _reset };
module.exports = api;
