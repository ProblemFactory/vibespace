'use strict';
// BOOT RESTORE (decomposition #7): everything that brings sessions back after
// a server restart — the legacy-home project-dir migration self-heal,
// restoreSessions (dtach socket scan → re-attach + meta recovery), the R6
// boot re-open of daemon pipe sessions, and the B-1525 orphaned remote-keeper
// re-adoption sweep. Extracted VERBATIM. ORCH tier; runs once at boot.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { restoredTurnState } = require('../turn-state.js'); // PURE (lane parked-ask-stall): the ring's last turn-state record
const pty = require('node-pty');
const { createMessageManager } = require('../normalizers');
const { pipePtyShim } = require('../pty-duck'); // B-ae4b: the R6 re-open duck holds a listener SET (the liveness stamp + the consumer)
const { dedupWebuiSockets } = require('../session-store');
const { list: harnessList } = require('../harnesses');
const { capsOf } = require('../backend-caps.js'); // PURE: caps.streamProtocol (the apiKeySource field lives in a stream-json init record)
const { spawnGroupIds } = require('../new-session-spec.js'); // PURE (lane new-session-form): meta `taskIds` (else an older meta's `taskId`) → the spawned-into list
const { pickCodexThreadCandidate } = require('../ws-handler');
const { fdScanShellFns } = require('../writer-sweep.js');
const { lockCaptureWanted, captureLockId, armLockCapture, adoptCapturedId, restoredForkPending, ownsItsId } = require('../claude-lock-capture'); // the ONE local lock capture (ws-create's create chain + this boot re-arm; the witness is the wrapper's pid)
const { readPpid } = require('../cli-identity');
const { restoreMarks } = require('../seen-marks.js'); // PURE (B-86d3, lane hook-seen-marks): the hook injection's seen marks come back with the session
const BUILD_VERSION = (() => { try { return require('../../package.json').version; } catch { return ''; } })(); // the build an intro mark must name to count as seen

const { mk } = require('./lazy.js');
const { sessionSpawnLine } = require('../spawn/line.js'); // PURE (lane antigravity-spawn-argv): the ONE session line, shared with ws-create

/** THE CONVERSATION'S POOL PIN from a session meta (2026-09-28): {memberId, at, by} or null —
 *  the ONE expression all three restore sites use (a pin the pool no longer lists is kept: the
 *  per-session pass judges it `pin-member-unknown`, and the automatic rules place it meanwhile). */
function poolPinFromMeta(meta) {
  const p = meta && meta.poolPin;
  return p && typeof p === 'object' && typeof p.memberId === 'string' && p.memberId ? { memberId: p.memberId, at: Number(p.at) || 0, by: typeof p.by === 'string' ? p.by : 'user' } : null;
}

/** Where a restored session's held pool member came from (design-reset-credits
 *  r4): 'ledger' = the engine derived it from the slot-transition ledger and
 *  persisted it; 'no-start' = no stamp AND the meta never recorded `createdAt`
 *  (the restore fills it with the boot instant, and the ledger would then name
 *  the pool default at the BOOT — accounts.poolMemberOfSession answers unknown). */
function heldOriginOf(meta) {
  if (!meta) return null;
  if (typeof meta.heldPoolMember === 'string') return meta.heldPoolOrigin === 'ledger' ? 'ledger' : null;
  // THE MARKER ITSELF IS PERSISTED (r5, reproduced): the restore fills the
  // missing createdAt with the boot instant, and the rename / codex thread-meta
  // writers then persist THAT — so the second restart read a createdAt and the
  // ledger confidently named the pool default at the previous BOOT. The first
  // restore writes `heldPoolOrigin: 'no-start'` (persistNoStart) and it is
  // honoured before createdAt is looked at.
  if (meta.heldPoolOrigin === 'no-start') return 'no-start';
  return meta.createdAt ? null : 'no-start';
}
/** Persist the 'no-start' marker the first time a restore infers it (r5). */
function persistNoStart(sockFile, meta, { readSessionMeta, writeSessionMeta }) {
  try {
    if (!meta || !meta.accountId || heldOriginOf(meta) !== 'no-start' || meta.heldPoolOrigin === 'no-start') return false; // only a session billed to an account can hold a pool member
    writeSessionMeta(sockFile, { ...(readSessionMeta(sockFile) || meta), heldPoolOrigin: 'no-start' });
    return true;
  } catch { return false; }
}

function create({ rootDir, PORT, BUFFERS_DIR, META_DIR, SOCKETS_DIR, DTACH_CMD,
  NODE_CMD, CHAT_WRAPPER, activeSessions, sessionCounterRef,
  attachToDtach, setupSessionPty, readSessionMeta, writeSessionMeta,
  deleteSessionMeta, broadcastToSession, broadcastActiveSessions,
  refreshWebuiPids, sbNoteServerOp, getHosts, getDialBridge, getExitProxy = () => null, note = () => { }, agentEnv }) {
  const hosts = mk(getHosts);
  const dialBridge = mk(getDialBridge);
  const exitProxyRef = mk(getExitProxy); // B-92a4: a session the re-probe un-adopts ends its exit pairs + waiting asks like any ended one
  const ensureDir = (p) => { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); };
  // THE CLASSIFIER REROUTE SURVIVES A RESTART (2026-09-13 r3 §7). The stamp
  // says "the CLI is answering with a model we did not ask for"; it is
  // announced ONCE and `scope:"session"`, so it can never be re-learned from
  // the stream — only the file carries it. ONE rule, spread into the THREE
  // sites that hydrate `_pickedModel` (a census in test-fable-cap-pool-storm
  // requires every one of them to restore it, so a fourth restore path goes
  // red instead of silently dropping the fact). A shape with no `to` is not a
  // stamp: `projectionFamilyFor`/`servedDefinesModel` both key off it, and a
  // half-object would read as "no reroute" anyway — say so here, once.
  const restoredFallback = (meta) => {
    const fb = meta && meta.servedViaFallback;
    return (fb && typeof fb === 'object' && fb.to)
      ? { from: fb.from || null, to: fb.to, at: Number(fb.at) || 0 } : null;
  };
// THE meta→session CONVERSATION facts (rv-server M3, dc-harness-store
// 2.369.213) — ONE spelling for the three restore paths (restoreSessions,
// restoreAgentdPipeSessions, readoptOrphanKeeperSessions), which used to
// hand-copy them (35 / 10 / 21 assignments, drifting). `transportFacts` = the
// transport-only fields (socket / keeper / pipe / port) and the per-path rows
// a path has never restored (kept per path so behaviour is unchanged); they win.
function sessionFromMeta(meta, transportFacts) {
  return {
    clients: new Map(),
    cwd: meta.cwd || os.homedir(),
    _nameExplicit: meta.nameExplicit === true, // lane peer-card-sender: a name given at creation / by a rename
    _purpose: meta.purpose === 'sign-in' ? 'sign-in' : null, // lane door-day-one-landing: a sign-in terminal is not a session row
    createdAt: meta.createdAt || Date.now(),
    claudeSessionId: meta.claudeSessionId || null,
    agentToken: meta.agentToken || null, // vibespace-status auth survives restarts
    _accountId: meta.accountId || null, // billing identity the session was spawned with (badge only — env lives in the surviving process)
    // …and the ROAD its readings came by (lane oat-identity-fix-r3, verify r3 F-R1): how it billed, which road its long-lived
    // token rides, its generation — a meta older than the stamp restores none, and the engine then treats the road as
    // UNKNOWN (no witness's producer, judges nothing), never as the login
    _billingHow: typeof meta.billingHow === 'string' && meta.billingHow ? meta.billingHow : null,
    _oatRoad: meta.oatRoad === 'env' || meta.oatRoad === 'file' ? meta.oatRoad : null,
    _oatGen: Number(meta.oatGen) > 0 ? Number(meta.oatGen) : null,
    // Permission mode isn't recoverable from the JSONL (init records are
    // stdout-only) — restore what the session was launched with
    _permissionMode: meta.permissionMode || null,
    _effort: meta.effort || null,
    _modelOrigin: meta.modelOrigin || null, _effortOrigin: meta.effortOrigin || null, // B-6b6d: the spawn's model/effort ORIGIN survives a restart (else the panel's honest row degrades to a guess)
    _outputStyle: meta.outputStyle || null, // 2.369.58: the chip must not report "default" for a session really running a style
    _worktree: !!meta.worktree, _worktreePath: meta.worktreePath || null,
    _toolPick: meta.toolPick && typeof meta.toolPick === 'object' && !Array.isArray(meta.toolPick) ? meta.toolPick : null, // lane new-session-form: the 「可用工具」 pick the process was spawned with
    _vcs: meta.vcs && typeof meta.vcs === 'object' ? meta.vcs : null, _prLinks: Array.isArray(meta.prLinks) ? meta.prLinks : null, // design-unknown-records: the git chip + PR chips survive a restart
    _cliTitle: typeof meta.cliTitle === 'string' && meta.cliTitle ? meta.cliTitle : null, // lane session-title-record: the CLI's own title survives a restart
    // agent-browser P0 (§3.2.1): the CONVERSATION's browser identity and the
    // user-data-dir rung it spawned on. Restored so a later resume of this
    // conversation finds its key and the orphan sweep sees this session as
    // live in memory as well as on disk.
    _poolPin: poolPinFromMeta(meta), // THE CONVERSATION'S PIN (2026-09-28) survives a restart
    _browserKey: meta.browserKey || null, _browserVariant: meta.browserVariant || null, _browserProfileId: meta.browserProfileId || null, _browserPinOrigin: meta.browserPinOrigin || null, _browserEnv: Array.isArray(meta.browserEnv) ? meta.browserEnv : null, _browserProfileActive: typeof meta.browserProfileActive === 'string' ? meta.browserProfileActive : null, _browserCap: Number.isInteger(meta.browserCap) ? meta.browserCap : null, _channelTouches: Array.isArray(meta.channelTouches) ? meta.channelTouches : null, _groupCards: Array.isArray(meta.groupCards) ? meta.groupCards : null,
    ...restoreMarks(meta.seenMarks, BUILD_VERSION), // B-86d3: the seen marks (groups' instants + folder digests + lite diff snapshots, the preamble hash, the intros' build) — a restart re-sends only what changed
    ...transportFacts,
  };
}

// ── Personalized-username migration self-heal (2.236.1, userW's real
// incident): the 3.5.0 image renames the container user vibe→<name> and
// symlinks /home/vibe → /home/<name>, which covers every recorded ABSOLUTE
// path — but claude encodes its per-project transcript dirs from the
// RESOLVED cwd, so pre-migration transcripts live under
// projects/-home-vibe-* while post-migration resumes look in
// -home-<name>-* → "No conversation found with session ID". Heal at boot:
// rename each -home-vibe-* dir to the new encoding and leave the old name
// as a symlink (VibeSpace's own cwdToProjectDir over recorded /home/vibe
// cwds keeps working through it). Idempotent; collisions skipped with a log.
function migrateLegacyHomeProjects() {
  try {
    const home = os.homedir();
    if (path.basename(home) === 'vibe') return;
    let st; try { st = fs.lstatSync('/home/vibe'); } catch { return; }
    if (!st.isSymbolicLink()) return;
    // the transcript-dir layout is the harness's (store.homeRename — claude: src/harnesses/claude-home.js)
    for (const h of harnessList()) { const hr = h.store && h.store.homeRename; if (hr && typeof hr.relinkLegacy === 'function') hr.relinkLegacy(home, 'vibe'); }
  } catch (e) { console.warn('[migrate] legacy home projects check failed:', e.message); }
}

// THE CLAUDE LOCK CAPTURE for a restored session (src/claude-lock-capture.js):
// the same pid witness and the same no-cap backoff as ws-create's create
// chain — a restored pending TERMINAL fork included (its source's lock
// excluded, its borrowed id claims nothing). A lock is adopted only when its
// pid is alive and descends from THIS session's wrapper: the old clock window
// adopted an external same-cwd claude's lock started 3 s before the fork and
// cleared the fork flag on that guess, irreversibly. Arming twice is a no-op.
const restoredSidecars = new Map();
function armRestoredCapture(id, s) {
  if (!s || s.host || s.backend !== 'claude' || !lockCaptureWanted(s)) return;
  const { SESSIONS_DIR } = require('../session-store');
  const sidecarPath = restoredSidecars.get(id) || path.join(BUFFERS_DIR, id + '.json');
  armLockCapture({
    id, session: s, activeSessions,
    attempt: () => captureLockId({ session: s, id, activeSessions, sessionsDir: SESSIONS_DIR, sidecarPath, readPpid }),
    onAdopt: (lockId) => {
      const adopted = adoptCapturedId(s, lockId);
      if (s.sockName) { try { writeSessionMeta(s.sockName, { ...(readSessionMeta(s.sockName) || {}), ...adopted }); } catch {} }
      broadcastActiveSessions();
    },
  });
}

// THE RESTORE'S PROBES, OFF THE LOOP (B-1319, measured 2026-10-13: one `fuser` per socket = 93 ms each in a lane and
// 120–470 ms per session on production — 13–18 sessions held the listen tick 1.2–8 s; the live-conversation fd scan
// adds ~3 s at 3 678 processes). The SAME questions as children, asked before the server listens (server.js waits for
// this promise), four at a time: which sockets have an owner (fuser, else pgrep), which remote sockets are alive (fuser),
// which conversations a live process holds (the batched fd scan). restoreSessions takes the answers once and asks
// never asks itself (B-92a4, below): what they did not answer it adopts as probe-pending.
//
// A PROBE THAT CANNOT BE REAPED IS AN ANSWER, NEVER A WAIT (B-92a4, lane boot-probes-unkillable; production 2026-10-14
// 17:14 PDT: the hub printed `[safe-fs] worker pool up`, then nothing for 96 s and no listener until a second restart —
// data/sockets on NFS, ~3 700 processes). A `fuser` stuck in D state on its NFS fd walk never died on runChild's TERM,
// the promise never settled, and server.js listens only after this one. Two bounds now: runChild's timer ANSWERS
// (TIMEOUT, then KILL — src/server/tls.js), and the whole pass has a cap (PROBE_CAP_MS; env VIBESPACE_PROBE_CAP_MS for
// the gate): what is still open at the cap — or ran out both bounds — is `unanswered` (sockFile → the open question),
// named by the boot trace's restore-probes span (probeFacts). A non-answer is never evidence (the keeper law).
const PROBE_CAP_MS = 25000;
const dedupIdsOf = (metas) => [...new Set(metas.map(({ m }) => m.claudeSessionId).filter((s) => /^[\w-]+$/.test(s || '')))];
const fdScanScript = (ids) => `${fdScanShellFns()}\nvs_fd_scan '/(${ids.join('|')})[.]jsonl' | cut -f2`;
const liveConvosOf = (ids, out) => { const held = out.split('\n'), live = new Set(); for (const id of ids) if (held.some((t) => t.includes(`/${id}.jsonl`))) live.add(id); return live; };
const sameIds = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const dedupKey = (m) => `${m.backend || 'claude'}:${m.host || 'local'}:${m.claudeSessionId}`; // dedupWebuiSockets' own key
const runChildP = (bin, args, ms) => require('./tls.js').runChild(bin, args, ms);
// the restore's two liveness rungs, as children: fuser (an owner ⇒ alive), else pgrep -f (a command line naming the socket — never one of `own`, this server's own `dtach -a` attach clients) ⇒ true / false, or null = NO ANSWER (its bound ran out, or the tool is missing)
const noAnswer = (r) => r.code === 'TIMEOUT' || r.code === 'ENOENT';
const ownedP = async (sp, rung2, ask = () => { }, own = new Set()) => { ask('fuser'); const r = await runChildP('fuser', [sp], 2000); if (r.code === 0) return r.out.trim().length > 0; if (!rung2) return noAnswer(r) ? null : false; ask('pgrep'); const g = await runChildP('pgrep', ['-f', sp], 2000); return noAnswer(g) ? null : g.code === 0 && g.out.split('\n').some((x) => x.trim() && !own.has(Number(x))); };
let probed = null, probing = null;
function probeSockets() {
  if (probing) return probing;
  const capMs = Number(process.env.VIBESPACE_PROBE_CAP_MS) || PROBE_CAP_MS;
  const out = { dedupIds: [], liveConvos: null, fdScanError: null, alive: new Map(), remoteAlive: new Map(), unanswered: new Map(), capMs, capped: false };
  const asking = new Map(); // sockFile → the question in flight
  let closed = false; // the cap (or the end): a late answer writes nothing, a queued question is never asked
  probing = (async () => {
    let sockets = []; try { sockets = fs.readdirSync(SOCKETS_DIR).filter(f => f.startsWith('cw-')); } catch { }
    const metas = [];
    for (const sockFile of sockets) { let m; try { m = readSessionMeta(sockFile); } catch { continue; } if (ownsItsId(m)) metas.push({ sockFile, m }); }
    out.dedupIds = dedupIdsOf(metas);
    const answer = (map, key, v) => { if (!closed) map.set(key, v); };
    const asks = sockets.map((sockFile) => async () => answer(out.alive, sockFile, await ownedP(path.join(SOCKETS_DIR, sockFile), true, (q) => { if (closed) throw new Error('past the cap'); asking.set(sockFile, q); })));
    for (const { sockFile, m } of metas) if (m.host) asks.push(async () => answer(out.remoteAlive, sockFile, await ownedP(path.join(SOCKETS_DIR, sockFile), false)));
    if (out.dedupIds.length) asks.unshift(async () => { const r = await runChildP('sh', ['-c', fdScanScript(out.dedupIds)], 20000); if (closed || r.code === 'TIMEOUT') return; if (r.code === 0) out.liveConvos = liveConvosOf(out.dedupIds, r.out); else out.fdScanError = r.err.split('\n')[0] || String(r.code); });
    const drain = async () => { for (let a; !closed && (a = asks.shift());) { try { await a(); } catch { } } };
    let cap = null;
    await Promise.race([Promise.all([drain(), drain(), drain(), drain()]), new Promise((r) => { cap = setTimeout(() => { out.capped = true; r(); }, capMs); })]);
    clearTimeout(cap); closed = true;
    for (const sockFile of sockets) if (out.alive.get(sockFile) == null) out.unanswered.set(sockFile, asking.get(sockFile) || 'not asked');
    if (out.dedupIds.length && !out.liveConvos && !out.fdScanError) { // the conversations the fd scan did not cover: only a duplicate's matter (a lone socket is never retired by the dedup)
      const n = new Map(); for (const { m } of metas) n.set(dedupKey(m), (n.get(dedupKey(m)) || 0) + 1);
      for (const { sockFile, m } of metas) if (!m.host && n.get(dedupKey(m)) > 1 && !out.unanswered.has(sockFile)) out.unanswered.set(sockFile, 'fd-scan');
    }
    probed = out;
    return out;
  })().catch(() => { closed = true; probed = out; return out; }); // never rejects: server.js listens after it whatever happened (what it did not answer is adopted probe-pending)
  return probing;
}
/** The boot trace's restore-probes facts (server.js): the sockets with no answer, named — `N unanswered (fuser cw-…)`. */
function probeFacts(o) {
  const u = o && o.unanswered;
  if (!u || !u.size) return null;
  const named = [...u].slice(0, 3).map(([sockFile, q]) => `${q} ${sockFile}`).join(', ');
  return { unanswered: u.size, capped: !!o.capped, note: `${u.size} unanswered (${named}${u.size > 3 ? `, +${u.size - 3}` : ''})` };
}

// THE TWO RETIRES — ONE function each, called by restoreSessions AND by its deferred re-probe (B-92a4), so a socket the
// re-probe settles dead / a duplicate it settles losing goes exactly the way the boot would have sent it.
/** A dead dtach socket: the socket goes; a REMOTE session's meta is kept as an orphan for the re-adopt, a local one's is deleted. */
function retireDeadSocket(sockFile, socketPath) {
  console.log(`  ✗ Dead socket: ${sockFile} — cleaning up`);
  try { fs.unlinkSync(socketPath); } catch {}
  // B-1525 (2.219.0): a REMOTE session's meta holds the ONLY local record
  // of its keeper sid / dial device — the remote half (keeper daemon,
  // device pipe session) survives a pod-level death, and deleting the
  // meta here orphaned it forever (userL's h200 keeper claudes needed
  // manual surgery). Keep those metas tagged orphanedAt for re-adopt
  // (resume host-inference + findKeeperFor consume them); local-only
  // sessions keep the old cleanup.
  try {
    const dm = readSessionMeta(sockFile) || {};
    if ((dm.host || dm.dialDeviceId) && !dm.orphanedAt) {
      writeSessionMeta(sockFile.replace(/\.orphan$/, ''), { ...dm, orphanedAt: Date.now() });
      const op = path.join(META_DIR, sockFile + '.json');
      fs.renameSync(op, op + '.orphan');
      console.log(`    ↳ remote session meta preserved as orphan (${dm.keeperSid || dm.dialDeviceId || dm.host})`);
      return;
    }
  } catch { }
  deleteSessionMeta(sockFile);
}
/** A stale duplicate of a conversation another socket owns: SIGTERM its dtach session (claude, if any, is the older/losing
 *  writer — the pids from a pgrep CHILD, never a sync ask) and clean socket + buffer + meta. */
function retireDuplicate(sockFile, socketPath, id, claudeSessionId) {
  console.log(`  ⤫ Duplicate of ${claudeSessionId} — retiring stale ${sockFile}`);
  runChildP('pgrep', ['-f', socketPath], 2000).then((r) => {
    for (const p of r.code === 0 ? r.out.split('\n') : []) {
      const pid = Number(p.trim());
      if (pid > 1 && pid !== process.pid) { try { process.kill(pid, 'SIGTERM'); } catch {} }
    }
  }, () => { });
  try { fs.unlinkSync(socketPath); } catch {}
  try { fs.unlinkSync(path.join(BUFFERS_DIR, id + '.buf')); } catch {}
  try { fs.unlinkSync(path.join(BUFFERS_DIR, id + '.json')); } catch {}
  deleteSessionMeta(sockFile);
}

// THE RE-PROBE (B-92a4): restoreSessions adopts a socket with no answer ALIVE — never retired, never dedup-killed, never
// marked stopped on a non-answer; its card is an ordinary card. After listen, off the loop, the SAME questions are asked
// again through runChild: 10 s, then 30 / 60 / 120 / 120 s (≤ 5 tries). alive ⇒ the mark clears; dead ⇒
// retireDeadSocket and the adopted session goes; a duplicate's conversation answered ⇒ the same dedup, its loser
// retireDuplicate'd; no answer after the tries ⇒ it stays alive, said in ⚙ Diagnostics (the boot trace) — never a kill.
const REPROBE_MS = [10000, 30000, 60000, 120000, 120000];
const pendingProbes = new Map(); // sockFile → { id, session, socketPath, q: Set('alive' | 'dedup') }
const pendingGroups = new Map(); // dedup key → every member sockFile of an undecided duplicate set
let reprobeTries = 0, reprobeTimer = null, reprobing = null;
const say = (line) => { console.log(`[boot-restore] ${line}`); try { note(line); } catch { } };
const unadopt = (id, s) => {
  if (activeSessions.get(id) !== s) return;
  try { exitProxyRef.onSessionEnd?.(s, id); } catch { } // its exit pairs + waiting asks end with it (the exit path's rule)
  activeSessions.delete(id); restoredSidecars.delete(id); broadcastActiveSessions();
};
function armReprobe() {
  if (reprobeTimer || reprobing || !pendingProbes.size || reprobeTries >= REPROBE_MS.length) return;
  reprobeTimer = setTimeout(() => { reprobeTimer = null; reprobePending().catch((e) => console.warn('[boot-restore] re-probe failed:', e.message)); }, REPROBE_MS[reprobeTries]);
  if (reprobeTimer.unref) reprobeTimer.unref();
}
/** One pass of the ladder (the timer's, or a caller's now — it takes the scheduled one's place; one pass at a time). */
function reprobePending() {
  if (reprobing) return reprobing;
  clearTimeout(reprobeTimer); reprobeTimer = null;
  reprobing = reprobePass().finally(() => { reprobing = null; armReprobe(); });
  return reprobing;
}
async function reprobePass() {
  if (!pendingProbes.size) return { tries: reprobeTries, alive: [], dead: [], duplicate: [], open: [] };
  reprobeTries++;
  const tally = { tries: reprobeTries, alive: [], dead: [], duplicate: [], open: [] };
  const own = new Set([...activeSessions.values()].map((s) => s && s.pty && s.pty.pid).filter(Boolean));
  const asks = [];
  for (const [sockFile, p] of [...pendingProbes]) { // 1. is the socket alive — four at a time, like the boot's probes
    if (activeSessions.get(p.id) !== p.session) { pendingProbes.delete(sockFile); continue; } // ended or replaced meanwhile (a Terminate): nothing left to settle
    if (p.q.has('alive')) asks.push(async () => {
      const v = await ownedP(p.socketPath, true, () => { }, own);
      if (v === true) p.q.delete('alive');
      else if (v === false && activeSessions.get(p.id) === p.session) { retireDeadSocket(sockFile, p.socketPath); unadopt(p.id, p.session); pendingProbes.delete(sockFile); tally.dead.push(sockFile); }
    });
  }
  const drain = async () => { for (let a; (a = asks.shift());) { try { await a(); } catch { } } };
  await Promise.all([drain(), drain(), drain(), drain()]);
  for (const [key, members] of [...pendingGroups]) { // 2. which duplicate wins — once every pending member's socket answered
    const rows = members.map((sockFile) => { let m = null; try { m = readSessionMeta(sockFile); } catch { } return { sockFile, m, p: pendingProbes.get(sockFile) }; }).filter((r) => r.m && ownsItsId(r.m));
    if (rows.some((r) => r.p && r.p.q.has('alive'))) continue;
    let live = new Set(), known = true;
    const ids = dedupIdsOf(rows.filter((r) => !r.m.host));
    if (ids.length) { const r = await runChildP('sh', ['-c', fdScanScript(ids)], 20000); if (r.code === 0) live = liveConvosOf(ids, r.out); else if (r.code === 'TIMEOUT') known = false; }
    const remote = new Map();
    for (const r of rows) if (r.m.host) { const v = await ownedP(path.join(SOCKETS_DIR, r.sockFile), false); if (v == null) known = false; remote.set(r.sockFile, v); }
    if (!known) continue;
    pendingGroups.delete(key);
    const { retire } = dedupWebuiSockets(rows.map(({ sockFile, m }) => ({ sockFile, backend: m.backend || 'claude', host: m.host || 'local', claudeSessionId: m.claudeSessionId, createdAt: m.createdAt || 0, claudeAlive: m.host ? !!remote.get(sockFile) : live.has(m.claudeSessionId) })));
    for (const r of rows) {
      if (!r.p) continue;
      r.p.q.delete('dedup');
      if (retire.has(r.sockFile)) { retireDuplicate(r.sockFile, r.p.socketPath, r.p.id, r.m.claudeSessionId); unadopt(r.p.id, r.p.session); pendingProbes.delete(r.sockFile); tally.duplicate.push(r.sockFile); }
    }
  }
  for (const [sockFile, p] of [...pendingProbes]) { if (p.q.size) tally.open.push(sockFile); else { pendingProbes.delete(sockFile); tally.alive.push(sockFile); } }
  say(`re-probe ${reprobeTries}/${REPROBE_MS.length}: ${tally.alive.length} alive, ${tally.dead.length} dead (retired), ${tally.duplicate.length} duplicate (retired), ${tally.open.length} still unanswered`);
  if (tally.open.length && reprobeTries === REPROBE_MS.length) say(`re-probe gave up after ${reprobeTries} tries: ${tally.open.join(', ')} kept alive — a non-answer is never a kill`);
  return tally;
}

function restoreSessions() {
  ensureDir(SOCKETS_DIR);
  ensureDir(BUFFERS_DIR);
  const P = probed || { dedupIds: [], liveConvos: null, fdScanError: null, alive: new Map(), remoteAlive: new Map(), unanswered: new Map() }; probed = null; probing = null; // the probes answer THIS restore only (none ran: every socket is unanswered)
  const sockets = fs.readdirSync(SOCKETS_DIR).filter(f => f.startsWith('cw-'));
  if (!sockets.length) return;

  console.log(`  Found ${sockets.length} existing session(s), reconnecting...`);
  // Dial-session bridges live in THIS process — recreate them on the SAME
  // recorded port so the surviving wrapper's attach reconnect lands (the
  // host-mounts tunnel re-own pattern). Must happen before wrappers retry.
  for (const sockFile of sockets) {
    try {
      // Metas are keyed by the FULL sockName (cw-N-TS) — the old cw-stripped
      // read NEVER matched, so no dial bridge was ever restored and every
      // dial session died on any server restart (2.219.0 audit CRITICAL;
      // wrapper reconnected forever against the dead port). Bridge keyed by
      // the recorded webui id so kill's dialBridge.close(sessionId) finds it.
      const m = readSessionMeta(sockFile) || {};
      if (m.dialDeviceId && m.bridgePort) {
        dialBridge.ensure({ sid: m.webuiSessionId || sockFile, deviceId: m.dialDeviceId, port: m.bridgePort })
          .catch((e) => console.warn('[dial-bridge] restore failed:', e.message));
      }
    } catch { }
  }
  // Dedup by conversation BEFORE adoption: a plain `claude --resume` reuses the
  // conversation id, so a resume of a session whose claude had already died
  // minted a SECOND dtach session for the SAME claudeSessionId → two sidebar
  // cards (real owner report; userW's local double-writer class). Keep one
  // socket per conversation (alive-claude > dead, then newest), retire the rest.
  // A PENDING FORK IS NOT A CLAIM (round 3, reproduced on a scratch server):
  // its meta carries its SOURCE's id (ws-create seeds it), so the dedup called
  // the live PARENT the stale duplicate of its own fork and SIGTERMed +
  // unlinked it — at every restart inside a fork's pending window, and at the
  // update boot for every terminal fork an older server left naming its
  // parent for life. `ownsItsId` = the claimedLockIds rule (a borrowed id is
  // not a claim); two sockets that each hold the id AS THEIR OWN still dedup.
  const dedupMetas = [];
  for (const sockFile of sockets) {
    let m; try { m = readSessionMeta(sockFile); } catch { continue; }
    if (ownsItsId(m)) dedupMetas.push({ sockFile, m });
  }
  // ONE /proc pass: which conversations have a live claude holding their JSONL?
  // (a lingering dtach husk whose claude crashed has a DEAD conversation and
  // must lose to a live one).
  //
  // B-3185: this used to fork a `readlink` PER FD — 405,735 of them on the dev
  // box, ~6.4 minutes — so it ALWAYS blew its own 6s timeout, and the catch
  // turned that into a silent empty set. (The forks were the ONLY problem: its
  // fd-level glob fed a SHELL for-loop, which expands in the shell's own memory
  // and never reaches execve, so ARG_MAX never applied — r1 said it did, which
  // was wrong. ARG_MAX bounds the batched scan's `ls` argv instead, which is
  // why THAT is chunked.) It now runs THE batched fd scan the writer sweep uses
  // — 3.0s at 3678 processes — and a failure SAYS SO.
  //
  // HONEST LIMIT, measured on the installed CLI (2.1.226, native binary): a
  // live claude does NOT keep its transcript open — it appends and closes, and
  // a machine-wide scan found ZERO processes holding any
  // ~/.claude/projects/**.jsonl. So this answers "nobody" for current claude
  // however fast it runs; it only sees a holder that really exists. The CLI's
  // OWN registry (~/.claude/sessions/<pid>.json, sessionId + pid + procStart)
  // is the accurate liveness source — deliberately NOT swapped in here,
  // because retiring is destructive (SIGTERM + unlink the dtach socket) and
  // changing which socket boot destroys is its own decision, not a rider on a
  // performance fix. Backlog: give claudeAlive the registry, keyed with the
  // procStart counter-capture so pid reuse cannot fake it.
  let liveConvos = new Set(), convosUnknown = false;
  const dedupIds = dedupIdsOf(dedupMetas);
  if (dedupIds.length && sameIds(P.dedupIds, dedupIds) && (P.liveConvos || P.fdScanError)) {
    // Degrading to "nobody is live" is survivable (the dedup falls back to
    // createdAt), but it must never be silent again — that is what hid this
    // for as long as it was broken.
    if (P.liveConvos) liveConvos = P.liveConvos; else console.warn('[boot-restore] live-conversation fd scan failed:', P.fdScanError);
  } else if (dedupIds.length) convosUnknown = true; // B-92a4: the scan gave NO answer for these conversations (its bound or the cap ran out, or a socket appeared since) — never asked here; their duplicates wait for the re-probe
  // REMOTE sockets: the /proc scan can't see a claude running ON THE HOST, so
  // claudeAlive was unconditionally false and duplicate sockets of one remote
  // conversation could retire the wrong one (audit 2.192.0/B-82ea). Substitute
  // the LOCAL transport liveness (dtach socket has an owner = the ssh/agentd
  // pipe survived the restart) — the same signal the adoption loop uses below.
  const remoteSockAlive = new Set();
  const remoteUnknown = new Set();
  for (const { sockFile, m } of dedupMetas) {
    if (!m.host) continue;
    const v = P.remoteAlive.get(sockFile);
    if (v === true) remoteSockAlive.add(sockFile); else if (v == null) remoteUnknown.add(sockFile); // B-92a4: no answer ⇒ the re-probe asks
  }
  // B-92a4: a duplicate set whose liveness has no answer (local: the fd scan; remote: a member's fuser) is UNDECIDED —
  // none of its sockets is retired now; each is adopted probe-pending and the re-probe re-runs this dedup once it answers.
  const groupOf = new Map();
  for (const { sockFile, m } of dedupMetas) { const k = dedupKey(m); if (!groupOf.has(k)) groupOf.set(k, []); groupOf.get(k).push(sockFile); }
  const undecided = new Set();
  for (const { sockFile, m } of dedupMetas) if (groupOf.get(dedupKey(m)).length > 1 && (m.host ? remoteUnknown.has(sockFile) : convosUnknown)) undecided.add(dedupKey(m));
  const { retire: retireSockets } = dedupWebuiSockets(dedupMetas.filter(({ m }) => !undecided.has(dedupKey(m))).map(({ sockFile, m }) => ({
    sockFile, backend: m.backend || 'claude', host: m.host || 'local',
    claudeSessionId: m.claudeSessionId, createdAt: m.createdAt || 0,
    claudeAlive: m.host ? remoteSockAlive.has(sockFile) : liveConvos.has(m.claudeSessionId),
  })));

  for (const sockFile of sockets) {
    const socketPath = path.join(SOCKETS_DIR, sockFile);
    try { fs.statSync(socketPath); } catch { continue; }

    // Verify socket is live — the probes' answer (fuser, else pgrep: asked before listen, as children). NO ANSWER
    // (B-92a4) is not "dead": the socket is adopted ALIVE, probe-pending, and the re-probe after listen settles it.
    const open = new Set();
    let socketAlive = P.alive.get(sockFile);
    if (socketAlive == null) { open.add('alive'); socketAlive = true; }

    if (!socketAlive) { retireDeadSocket(sockFile, socketPath); continue; }

    const meta = readSessionMeta(sockFile);
    const id = meta.webuiSessionId || ('sess-' + (++sessionCounterRef.value) + '-' + Date.now());
    persistNoStart(sockFile, meta, { readSessionMeta, writeSessionMeta }); // r5: before any writer persists the boot instant as its createdAt

    // stale duplicate of a conversation another socket owns — do NOT adopt (two
    // cards); retire the husk so it can't double-write the JSONL (retireDuplicate).
    // B-92a4: never on a non-answer — an undecided set, or an unanswered socket the dedup would retire, waits probe-pending.
    const dk = ownsItsId(meta) ? dedupKey(meta) : null;
    if (dk && (undecided.has(dk) || (open.size && retireSockets.has(sockFile)))) { open.add('dedup'); pendingGroups.set(dk, groupOf.get(dk) || [sockFile]); }
    else if (retireSockets.has(sockFile)) { retireDuplicate(sockFile, socketPath, id, meta.claudeSessionId); continue; }

    // Detect mode and streaming state from wrapper metadata
    let sessionMode = meta.mode || 'terminal';
    let wrapperStreaming = false;
    let wrapperGoal = null, wrapperGoalStatus = null, wrapperGoalElapsed = 0, wrapperGoalTokens = 0;
    let bareRemote = false;
    let restoredRemote = null;
    let wrapperAgentTasks = null;
    const wrapperFiles = require('./wrapper-files.js').resolveWrapperFiles(BUFFERS_DIR, id, path.join(SOCKETS_DIR, sockFile));
    restoredSidecars.set(id, wrapperFiles.sidecar); // the lock capture's pid witness (the wrapper's own pid)
    try {
      const wrapperMeta = JSON.parse(fs.readFileSync(wrapperFiles.sidecar, 'utf-8'));
      if (wrapperMeta.mode === 'chat') sessionMode = 'chat';
      if (wrapperMeta.streaming != null) wrapperStreaming = !!wrapperMeta.streaming;
      if (wrapperMeta.goal) { wrapperGoal = wrapperMeta.goal; wrapperGoalStatus = wrapperMeta.goalStatus || null; wrapperGoalElapsed = wrapperMeta.goalElapsed || 0; wrapperGoalTokens = wrapperMeta.goalTokensUsed || 0; }
      // Agent's live todo list survives the restart (2.219.0 audit — the
      // card's progress pill/Steps went blank until the next TodoWrite)
      if (Array.isArray(wrapperMeta.todos) && wrapperMeta.todos.length) {
        const done = wrapperMeta.todos.filter((t) => t?.status === 'completed').length;
        const cur = wrapperMeta.todos.find((t) => t?.status === 'in_progress');
        var wrapperTodos = { done, total: wrapperMeta.todos.length, current: cur ? String(cur.content || cur.activeForm || cur.step || '').slice(0, 140) : null };
      }
      // Agents still RUNNING per the wrapper's task map (chat-wrapper keeps
      // them until task_notification) need their JSONL watchers re-armed —
      // startSubagentWatcher's only other call site is the live task_started
      // parse, so an agent spanning the restart went monitoring-dark (frozen
      // tool card, empty live View Log) until it completed.
      if (sessionMode === 'chat' && wrapperMeta.tasks) {
        const running = Object.entries(wrapperMeta.tasks)
          .filter(([, t]) => t && t.type === 'agent' && t.status === 'running' && t.id)
          .map(([tuid, t]) => ({ tuid, agentId: t.id }));
        if (running.length) wrapperAgentTasks = running;
      }
      // B-0845: a REMOTE chat session restored WITHOUT the wrapper's remote
      // field predates the keeper (2.124.0) — claude hangs bare off the ssh
      // pipe and one network wobble kills the conversation. Surface it.
      if (meta.host && sessionMode === 'chat' && !wrapperMeta.remote) bareRemote = true;
      if (wrapperMeta.remote && wrapperMeta.remote.state && wrapperMeta.remote.state !== 'connected') {
        restoredRemote = { state: wrapperMeta.remote.state, attempts: wrapperMeta.remote.attempts || 0, at: wrapperMeta.remote.at || Date.now() };
      }
    } catch {}

    let savedBuffer = '';
    try { savedBuffer = fs.readFileSync(wrapperFiles.buf, 'utf-8'); } catch {}

    const session = sessionFromMeta(meta, { // transport-only + per-path facts (win over the shared ones)
      mode: sessionMode,
      pty: null,
      host: meta.host || null,
      _bareRemote: bareRemote,
      keeperSid: meta.keeperSid || null,
      _agentdSession: !!meta.agentdSession, // transport mechanism (2.219.0 — kill branch correctness)
      _cwdRecreated: !!meta.cwdRecreated, // B-7812: undelivered recreated-cwd agent notice survives restarts
      _remoteState: restoredRemote,
      _todos: (typeof wrapperTodos !== 'undefined' && wrapperTodos) || null,
      _restoreAgentTasks: wrapperAgentTasks, // re-armed post-attach (setupSessionPty defines the watcher)
      _pendingEditor: meta.pendingEditor || null, // Ctrl+G edit in flight — re-broadcast on attach
      _prevGoal: meta.prevGoal || null, // /goal resume works across restarts
      // pending fork-id adoption survives restart — but only while the record
      // still names its source: an adopted chat fork's meta kept
      // `forkRequested: true` (the stream adoption write never re-listed it),
      // and a restored stale flag made the fork's OWN id claim nothing
      _forkRequested: restoredForkPending(meta),
      _resumeSpawn: !!meta.resumeSpawn, // implicit-fork adoption stays armed across restarts (B-b87b)
      _sawFirstId: !!meta.sawFirstId,
      _dialDeviceId: meta.dialDeviceId || null,
      _bridgePort: meta.bridgePort || null,
      _dialReversePort: meta.dialReversePort || null, // VIBESPACE_API back-tunnel, re-owned at the next dial-in (audit #49)
      hostName: meta.hostName || null,
      name: meta.name || sockFile,
      backend: meta.backend || 'claude',
      backendSessionId: meta.backendSessionId || meta.claudeSessionId || null,
      sourceKind: meta.sourceKind || null,
      agentKind: meta.agentKind || 'primary',
      agentRole: meta.agentRole || '',
      agentNickname: meta.agentNickname || '',
      parentThreadId: meta.parentThreadId || null,
      forkedFrom: meta.forkedFrom || null,
      _modelLocked: !!meta.modelLocked,
      _lockedModel: meta.lockedModel || null,
      _initialGroupId: meta.taskId || null, // group spawned into; belonging is live-derived, this only covers the pre-bind window
      _initialGroupIds: spawnGroupIds(meta), // lane new-session-form: every group it was spawned into (meta `taskIds`; an older meta's one `taskId`)
      _heldPoolMember: typeof meta.heldPoolMember === 'string' ? meta.heldPoolMember : null, // the pool member the surviving (non-hot) process holds (design-reset-credits r2)
      _heldPoolOrigin: heldOriginOf(meta), // r4: a ledger-derived stamp stays 'ledger'; a meta that never recorded its start cannot be answered by the ledger
      _authAtSpawn: meta.authAtSpawn || null,
      _apiKeySource: meta.apiKeySource || null, // CLI-confirmed auth (init record); backfilled from the buffer below when absent
      sockName: sockFile,
      socketPath,
      buffer: savedBuffer,
      _isStreaming: wrapperStreaming,
      // …and the harness's OWN last word on record in that ring (lane parked-ask-stall, a fleet pod):
      // a turn parked on a permission ask restores as `requires_action` — waiting on the user, the
      // session list's 'waiting' dot, the attach's turn state — not a bare sidecar `streaming:true`
      // that every reader took for "thinking" (and the client's stall watchdog for a lost delivery)
      ...restoredTurnState(savedBuffer),
      _goal: wrapperGoal,
      _goalStatus: wrapperGoalStatus,
      _goalElapsed: wrapperGoalElapsed,
      _goalTokensUsed: wrapperGoalTokens,
    });
    // Create normalizer for chat sessions (populated on first attach from JSONL + buffer)
    if (sessionMode === 'chat') {
      session._normalizer = createMessageManager(session.backend || 'claude', id);
      session._normEpoch = Date.now();
      session._normalizer.onOp((op) => {
        try { if (session.host && session.keeperSid) sbNoteServerOp(session.host, session.keeperSid, op); } catch { } // step-2 dark tap (the daemon streams by ITS sid = keeperSid)
        broadcastToSession(session, id, { type: 'msg', sessionId: id, ...op });
      });
    }
    activeSessions.set(id, session);
    session._webuiId = id; // per-session pool link key (plan C) — the id the session is registered under
    session._spawnModel = meta.spawnModel || null; session._pickedModel = meta.pickedModel || null; session._pickedModelAt = meta.pickedModelAt || 0; session._servedViaFallback = restoredFallback(meta); // plan C model ladder survives restarts — and so does the classifier reroute (r3 §7)
    session._msgReachability = meta.msgReachability || null; // Channels v1 per-session reach override survives restarts
    session._taskRecords = (meta.taskRecords && typeof meta.taskRecords === 'object') ? meta.taskRecords : null; // 2.369.140: the live-only task records survive the restart
    session._artifacts = (meta.artifacts && typeof meta.artifacts === 'object') ? meta.artifacts : null; // lane artifacts-model: the deliverable rows (the user's saves live only here) survive the restart
    session._helperAskedAt = (meta.helperAskedAt && typeof meta.helperAskedAt === 'object') ? meta.helperAskedAt : null; // verify r3: each waiting helper ask's first-seen instant — the 60 s inbox clock survives the restart
    attachToDtach(id, socketPath, session);
    if (open.size) pendingProbes.set(sockFile, { id, session, socketPath, q: open });

    console.log(`  ✓ Reconnected: ${session.name} (${session.cwd})`);
  }
  if (pendingProbes.size) {
    const named = [...pendingProbes].slice(0, 3).map(([sockFile]) => `${P.unanswered.get(sockFile) || 'not asked'} ${sockFile}`).join(', ');
    say(`${pendingProbes.size} session(s) adopted probe-pending — no answer (${named}${pendingProbes.size > 3 ? `, +${pendingProbes.size - 3}` : ''}); asked again from ${REPROBE_MS[0] / 1000} s, never retired on a non-answer`);
    armReprobe();
  }

  // Populate webuiPids cache after all sessions are restored
  refreshWebuiPids();

  // Backfill billing identity for sessions restored WITHOUT a recorded
  // apiKeySource (spawned before tracking): chat sessions carry the init
  // record in their buffer (grep the last occurrence — bounded child
  // process, off the boot critical path); terminal sessions get a /proc env
  // probe (env key = definite API). One broadcast when done.
  setTimeout(() => {
    const { execFile } = require('child_process');
    let pending = 0, changed = false;
    const finish = () => { if (--pending === 0 && changed) broadcastActiveSessions(); };
    for (const [id, s] of activeSessions) {
      if (!s.backend || capsOf(s.backend).streamProtocol !== 'stream-json' || s._apiKeySource) continue;
      const buf = path.join(BUFFERS_DIR, `${id}.buf`);
      pending++;
      execFile('sh', ['-c', `grep -o 'apiKeySource":"[^"]*"' ${JSON.stringify(buf)} 2>/dev/null | tail -1`], { timeout: 20000 }, (err, out) => {
        const m = /apiKeySource":"([^"]*)"/.exec(String(out || ''));
        if (m) {
          s._apiKeySource = m[1];
          if (s.sockName) { try { writeSessionMeta(s.sockName, { ...(readSessionMeta(s.sockName) || {}), apiKeySource: m[1] }); } catch { } }
          changed = true;
        } else if (!s._authAtSpawn && s._childPid) {
          // terminal session: env probe (only the env-key case is provable)
          try {
            const env = fs.readFileSync(`/proc/${s._childPid}/environ`, 'utf-8');
            if (env.includes('ANTHROPIC_API_KEY=')) { s._apiKeySource = 'ANTHROPIC_API_KEY'; changed = true; }
          } catch { }
        }
        finish();
      });
    }
    if (!pending) { /* nothing to backfill */ }
  }, 3000);

  // Re-arm live subagent monitoring for agents that span the restart: the
  // wrapper meta's task map (captured into _restoreAgentTasks above) still
  // lists them as running, but startSubagentWatcher's only live call site is
  // the task_started stream parse. The handle lands on the session when
  // setupSessionPty runs — async for agentd-restored sessions, hence the
  // delayed pass + one late retry.
  const rearmSubagentWatchers = (retry) => {
    for (const [, s] of activeSessions) {
      const tasks = s._restoreAgentTasks;
      if (!tasks || !tasks.length) continue;
      if (typeof s._startSubagentWatcher !== 'function') { if (!retry) s._restoreAgentTasks = null; continue; }
      s._restoreAgentTasks = null;
      for (const t of tasks) { try { s._startSubagentWatcher(t.tuid, t.agentId); } catch {} }
    }
  };
  setTimeout(() => rearmSubagentWatchers(true), 5000);
  setTimeout(() => rearmSubagentWatchers(false), 20000);

  // Re-arm the backend-id capture for restored sessions still missing their id
  // (server restarted inside the create-time ~2-17s/60s capture window — those
  // retry chains died with the old process). Claude CHAT self-heals via the
  // stream parser's first-capture on the next line; claude TERMINAL and codex
  // have NO other backfill and stayed id-less for life (sessionKey '' → no
  // status/config/star binding, no transcript link). LOCAL sessions only —
  // scanning the local lock dir for a remote session false-matches (2.156.2).
  // CLAUDE: the ONE capture (src/claude-lock-capture.js), armed per restored
  // session by armRestoredCapture (above restoreSessions) — 2 s after the loop,
  // where the old recaptureIds first ran at +4 s; R6 pipe sessions arm from
  // their own re-open.
  setTimeout(() => { for (const [id, s] of activeSessions) armRestoredCapture(id, s); }, 2000);
  // CODEX: no lock file to witness — the thread candidate pick keeps its own
  // bounded re-arm.
  const recaptureIds = (attempts) => {
    let changed = false, missing = false;
    for (const [id, s] of activeSessions) {
      if (s.host) continue;
      if (s.backend === 'codex' && !s.backendSessionId) {
        try {
          const matched = pickCodexThreadCandidate({ activeSessions, webuiSessionId: id, cwd: s.cwd, createdAt: s.createdAt, baselineThreadIds: null, pathLib: path });
          // no create-time baseline here — refuse clearly-stale threads (the
          // same startedAt window the claude lock guard uses)
          if (matched && (Number(matched.startedAt) || 0) > (s.createdAt || 0) - 5000) {
            s.backendSessionId = matched.backendSessionId || matched.sessionId || null;
            s.claudeSessionId = null;
            if (matched.name) s.name = matched.name;
            if (matched.cwd) s.cwd = matched.cwd;
            if (s.backendSessionId && s.sockName) {
              try { writeSessionMeta(s.sockName, { ...(readSessionMeta(s.sockName) || {}), name: s.name, cwd: s.cwd, backendSessionId: s.backendSessionId, claudeSessionId: null }); } catch {}
              changed = true;
            }
          }
        } catch {}
        if (!s.backendSessionId) missing = true;
      }
    }
    if (changed) broadcastActiveSessions();
    if (missing && attempts > 1) setTimeout(() => recaptureIds(attempts - 1), 2000);
  };
  setTimeout(() => recaptureIds(5), 4000);

  // Warn about surviving sessions whose CLI is still running in child-session
  // mode (spawned while the server env carried CLAUDE_CODE_CHILD_SESSION —
  // e.g. a pre-fix server restarted from inside a Claude session). Those CLIs
  // keep their poisoned env until recreated: their conversations are NOT being
  // written to any transcript and will be lost on terminate+resume.
  if (process.platform === 'linux') {
    setTimeout(() => {
      const affected = [];
      for (const [id, s] of activeSessions) {
        const pid = s._childPid;
        if (!pid) continue;
        try {
          const env = fs.readFileSync(`/proc/${pid}/environ`, 'utf-8');
          if (env.includes('CLAUDE_CODE_CHILD_SESSION=1')) affected.push(`${s.name} (${s.cwd})`);
        } catch {}
      }
      if (affected.length) {
        console.warn(`[env] ${affected.length} running session(s) were spawned with CLAUDE_CODE_CHILD_SESSION=1 and are NOT persisting transcripts — finish + recreate them to restore persistence:\n  - ${affected.join('\n  - ')}`);
      }
    }, 3000); // after refreshWebuiPids has populated _childPid
  }
}

// ── R6: boot RE-OPEN of local daemon PIPE sessions (agentdPipe metas) ────────
// These sessions have NO dtach socket — the daemon supervises the wrapper and
// survives server restarts by itself. Restore = re-open the pipe by sid with
// the daemon's offset-reattach; failure leaves the meta for the view-only
// rescue (never deletes — the transcript is intact either way).
function restoreAgentdPipeSessions() {
  let metas = [];
  try { metas = fs.readdirSync(META_DIR).filter((f) => f.endsWith('.json')); } catch { return; }
  for (const mf of metas) {
    let meta = null; try { meta = JSON.parse(fs.readFileSync(path.join(META_DIR, mf), 'utf-8')); } catch { continue; }
    if (!meta?.agentdPipe) continue;
    const sockFile = mf.slice(0, -5);
    const id = 'sess-' + sockFile.replace(/^cw-/, '');
    if (activeSessions.has(id)) continue;
    persistNoStart(sockFile, meta, { readSessionMeta, writeSessionMeta }); // r5
    const session = sessionFromMeta(meta, { // transport-only + per-path facts (win over the shared ones)
      mode: 'chat', backend: meta.backend || 'claude',
      name: meta.name || 'Session', sockName: sockFile,
      buffer: '', taskId: meta.taskId || null,
      _heldPoolMember: typeof meta.heldPoolMember === 'string' ? meta.heldPoolMember : null, // design-reset-credits r2: the member the surviving pipe process holds
      _heldPoolOrigin: heldOriginOf(meta), // r4: a ledger-derived stamp stays 'ledger'; a meta that never recorded its start cannot be answered by the ledger
      backendSessionId: meta.claudeSessionId || meta.backendSessionId || null,
      _forkRequested: restoredForkPending(meta), // a pending fork re-opened by the daemon still adopts its own id (parser or lock capture) — round 3
      agentdSession: true, keeperSid: id, agentdPipe: true,
      _spawnModel: meta.spawnModel || null, _pickedModel: meta.pickedModel || null, _pickedModelAt: meta.pickedModelAt || 0,
      _servedViaFallback: restoredFallback(meta), // the classifier reroute survives a restart (r3 §7)
      _msgReachability: meta.msgReachability || null,
    });
    hosts.device(null).then(async (dm) => {
      let offset = 0;
      try { offset = fs.statSync(path.join(BUFFERS_DIR, id + '.buf')).size; } catch { }
      const h = await dm.openPipeSession({ sid: id, offset });
      // the SAME duck as ws-create's R6 create path (it was a verbatim one-slot
      // twin that dropped the liveness stamp — B-ae4b)
      const shim = pipePtyShim(h);
      activeSessions.set(id, session);
      session._webuiId = id;
      setupSessionPty(session, id, shim);
      broadcastActiveSessions();   // lane human-cli (test-architecture §103): a re-opened pipe session reaches the list's ONE notify point — the web and the person's index learn it now, not at the next unrelated broadcast
      console.log(`[restore] re-opened daemon pipe session ${id} "${session.name}"`);
      armRestoredCapture(id, session); // a pipe session's capture arms from its own re-open (the sweep above may run before it)
    }).catch((e) => console.warn(`[restore] daemon pipe session ${id} not re-opened (view-only rescue covers it): ${e.message}`));
  }
}
try { restoreAgentdPipeSessions(); } catch (e) { console.warn('[restore] agentd pipe scan failed:', e.message); }

// ── B-1525 second half: boot AUTO RE-ADOPT of orphaned remote keeper sessions ──
// Pod-level death kills every local dtach; the dead-socket cleanup preserves
// REMOTE sessions' metas as .orphan files. For each orphan whose keeper child
// (the remote claude) is STILL ALIVE on its ssh host, respawn the local
// transport half attached to the SAME keeper sid — the session comes back
// LIVE by itself (the userL manual-surgery class, automated).
// Attach ≠ create, which keeps this spawn MINIMAL and safe:
//  - keeper `run <sid> <offset>` on a LIVE sid only ATTACHES (never spawns a
//    claude) → billing env and tools shipping are irrelevant here;
//  - session.agentToken REUSES the original vsst_ value, so the remote
//    claude's baked env token maps straight onto the re-adopted session;
//  - the remote claude's baked VIBESPACE_API port is read from its
//    /proc/<pid>/environ and the new `ssh -R` binds the SAME port, so the
//    agent tools' back-tunnel heals completely.
async function readoptOrphanKeeperSessions() {
  let files = [];
  try { files = fs.readdirSync(META_DIR).filter((f) => f.endsWith('.json.orphan')); } catch { return; }
  if (!files.length) return;
  const { execFile } = require('child_process');
  const sshOut = (h, script) => new Promise((resolve) => {
    execFile('ssh', [...hosts.sshArgs(h, { multiplex: true }), '--', script],
      { env: hosts.sshEnv(), timeout: 15000, maxBuffer: 256 * 1024 }, (err, out) => resolve(err ? null : String(out || '')));
  });
  let adopted = 0;
  for (const f of files) {
    if (adopted >= 8) break; // per-boot cap — a huge orphan pile shouldn't storm hosts
    let meta = null;
    try { meta = JSON.parse(fs.readFileSync(path.join(META_DIR, f), 'utf-8')); } catch { continue; }
    if (!meta?.host || !meta.keeperSid || meta.mode !== 'chat' || (meta.backend || 'claude') !== 'claude') continue;
    const h = hosts.get?.(meta.host);
    if (!h || h.transport === 'dial') continue; // dial pipe re-adopt is a separate path
    // A live session already tracking this conversation wins — never double up
    let dup = false;
    for (const [, s] of activeSessions) {
      if (meta.claudeSessionId && (s.claudeSessionId === meta.claudeSessionId || s.backendSessionId === meta.claudeSessionId)) { dup = true; break; }
    }
    if (dup) continue;
    // Liveness probe: keeper meta → childPid alive → baked VIBESPACE_API port
    const probe = `K="$HOME/.vibespace/run/${meta.keeperSid}.json"; [ -e "$K" ] || exit 3; `
      + `P=$(sed -n 's/.*"childPid":\\([0-9]*\\).*/\\1/p' "$K" | head -1); `
      + `[ -n "$P" ] && kill -0 "$P" 2>/dev/null || exit 4; echo "PID=$P"; `
      + `tr '\\0' '\\n' < /proc/$P/environ 2>/dev/null | grep '^VIBESPACE_API=' | head -1`;
    const out = await sshOut(h, probe);
    if (!out || !out.includes('PID=')) continue; // host down or claude gone — leave the orphan for a later boot
    const rport = Number((/VIBESPACE_API=http:\/\/127\.0\.0\.1:(\d+)/.exec(out) || [])[1]) || null;

    // sockName DERIVED from the id (2.304.0 root fix — one identity, not two;
    // see the ws-handler create path)
    const id = 'sess-' + (++sessionCounterRef.value) + '-' + Date.now();
    const sockName = 'cw-' + id.slice('sess-'.length);
    const socketPath = path.join(SOCKETS_DIR, sockName);
    const bufFile = path.join(BUFFERS_DIR, id + '.buf');
    const metaFileW = path.join(BUFFERS_DIR, id + '.json');
    const inner = `export PATH="$HOME/.vibespace/bin:$HOME/.local/bin:$PATH"; [ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1; `
      + `exec node "$HOME/.vibespace/bin/vibespace-remote-keeper" run ${meta.keeperSid} __VS_OFFSET__`;
    const sshArgs = [...hosts.sshArgs(h, rport ? { reverse: `${rport}:127.0.0.1:${PORT}` } : {}), '-T', '--', inner];
    let ptyProc;
    try {
      // THE TRANSPORT'S ENV IS BUILT (lane spawn-env-debts, 2026-10-20): agentEnv() as ws-create's r6Env (the server's,
      // with its credential drop), never the hub's whole env. The chat wrapper reads VIBESPACE_REMOTE_SID alone and hands
      // the rest to ssh; a stray identity (agentEnv keeps VIBESPACE_SESSION_TOKEN / _API / _TASK_ID for a spawn that SETS
      // them — this one sets none: the remote claude holds its own) and r6Env's ambient billing names never ride it.
      const readoptEnv = { ...agentEnv(), TERM: 'xterm-256color', VIBESPACE_REMOTE_SID: id };
      for (const k of ['VIBESPACE_SESSION_TOKEN', 'VIBESPACE_API', 'VIBESPACE_TASK_ID', 'ANTHROPIC_API_KEY', 'CLAUDE_SECURESTORAGE_CONFIG_DIR', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR']) delete readoptEnv[k];
      // THE ONE LINE (lane antigravity-spawn-argv, src/spawn/line.js): the wrapper runs `ssh …`, its names ride the env
      readoptEnv.CLAUDE_WEBUI_PORT = String(PORT); readoptEnv.CLAUDE_WEBUI_SESSION_ID = id;
      const { argv } = sessionSpawnLine({ node: NODE_CMD, wrapper: CHAT_WRAPPER, bufFile, metaFile: metaFileW, exe: 'ssh', args: sshArgs });
      ptyProc = pty.spawn(DTACH_CMD, ['-c', socketPath, '-E', '-r', 'none', ...argv], {
        name: 'xterm-256color', cols: 190, rows: 45, cwd: os.homedir(),
        env: readoptEnv,
      });
    } catch (e) { console.warn(`[readopt] spawn failed for ${meta.keeperSid}: ${e.message}`); continue; }
    const session = sessionFromMeta(meta, { // transport-only + per-path facts (win over the shared ones)
      mode: 'chat', pty: null,
      host: meta.host, hostName: meta.hostName || null,
      keeperSid: meta.keeperSid,
      name: meta.name || 'Session',
      backend: 'claude',
      backendSessionId: meta.claudeSessionId || meta.backendSessionId || null,
      _authAtSpawn: meta.authAtSpawn || null,
      _modelLocked: !!meta.modelLocked,
      _lockedModel: meta.lockedModel || null,
      _initialGroupId: meta.taskId || null,
      _initialGroupIds: spawnGroupIds(meta),
      _remotePort: rport,
      sockName, socketPath, buffer: '',
    });
    session._normalizer = createMessageManager('claude', id);
    session._normEpoch = Date.now();
    session._normalizer.onOp((op) => broadcastToSession(session, id, { type: 'msg', sessionId: id, ...op }));
    activeSessions.set(id, session);
    session._webuiId = id; // per-session pool link key (plan C) — the id the session is registered under
    session._spawnModel = meta.spawnModel || null; session._pickedModel = meta.pickedModel || null; session._pickedModelAt = meta.pickedModelAt || 0; session._servedViaFallback = restoredFallback(meta); // plan C model ladder survives restarts — and so does the classifier reroute (r3 §7)
    session._msgReachability = meta.msgReachability || null; // Channels v1 per-session reach override survives restarts
    session._taskRecords = (meta.taskRecords && typeof meta.taskRecords === 'object') ? meta.taskRecords : null; // 2.369.140: the live-only task records survive the restart
    session._artifacts = (meta.artifacts && typeof meta.artifacts === 'object') ? meta.artifacts : null; // lane artifacts-model: the deliverable rows (the user's saves live only here) survive the restart
    session._helperAskedAt = (meta.helperAskedAt && typeof meta.helperAskedAt === 'object') ? meta.helperAskedAt : null; // verify r3: each waiting helper ask's first-seen instant — the 60 s inbox clock survives the restart
    setupSessionPty(session, id, ptyProc);
    writeSessionMeta(sockName, { ...meta, orphanedAt: undefined, readoptedAt: Date.now(), webuiSessionId: id, mode: 'chat' });
    try { fs.unlinkSync(path.join(META_DIR, f)); } catch { }
    adopted++;
    console.log(`[readopt] re-adopted orphan keeper session ${meta.keeperSid} (${(meta.claudeSessionId || '').slice(0, 8)}) on ${h.name || meta.host} → ${id}${rport ? ` (tools tunnel :${rport} revived)` : ''}`);
    await new Promise((r) => setTimeout(r, 500));
  }
  if (adopted) { refreshWebuiPids(); broadcastActiveSessions(); }
}

  return { migrateLegacyHomeProjects, restoreSessions, restoreAgentdPipeSessions,
    readoptOrphanKeeperSessions, probeSockets, probeFacts, reprobePending, probePending: () => new Map([...pendingProbes].map(([f, p]) => [f, [...p.q]])) };
}
module.exports = { create, heldOriginOf, persistNoStart }; // r5: the two held-origin helpers are PURE over a meta + store (test-codex-pool §R17b)
