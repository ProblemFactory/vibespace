'use strict';
// BOOT RESTORE (decomposition #7): everything that brings sessions back after
// a server restart — the legacy-home project-dir migration self-heal,
// restoreSessions (dtach socket scan → re-attach + meta recovery), the R6
// boot re-open of daemon pipe sessions, and the B-1525 orphaned remote-keeper
// re-adoption sweep. Extracted VERBATIM. ORCH tier; runs once at boot.
const fs = require('fs');
const os = require('os');
const path = require('path');
const PinRecord = require('../pool-pin-record.js'); // lane lg-group-parents B-526c unit 2: the person's pin record, newer than the meta's after a stop
const SFW = require('../settings-file-words.js'); // B-8dcf item two (PURE): the kinds a governing file covers, for a restored session
const { restoredStreaming } = require('../turn-state.js'); // PURE (lane parked-ask-stall): the ring's last turn-state record
const SJ = require('../said-journal.js'); // B-cd4b (the wrapper's hold): which wrapper answers a fence (its sidecar's caps.fence)
const pty = require('node-pty');
const { createMessageManager } = require('../normalizers');
const { costResume, resultsIn } = require('../cost-segments.js'); // PURE (2.369.402): the conversation's cost fold
const costSeedOf = (kept, bufferText) => costResume(kept, resultsIn(bufferText)); // the kept fact, then the results the buffer holds after it
const { pipePtyShim } = require('../pty-duck'); // B-ae4b: the R6 re-open duck holds a listener SET (the liveness stamp + the consumer)
const { dedupWebuiSockets } = require('../session-store');
const { list: harnessList } = require('../harnesses');
const { capsOf } = require('../backend-caps.js'); // PURE: caps.streamProtocol (the apiKeySource field lives in a stream-json init record)
const { spawnGroupIds } = require('../new-session-spec.js'); // PURE (lane new-session-form): meta `taskIds` (else an older meta's `taskId`) → the spawned-into list
const { pickCodexThreadCandidate } = require('../ws-handler');
const { lockCaptureWanted, captureLockId, armLockCapture, adoptCapturedId, restoredForkPending, restoredForkSource, ownsItsId, addressableId } = require('../claude-lock-capture'); // the ONE local lock capture (ws-create's create chain + this boot re-arm; the witness is the wrapper's pid)
const { readPpid } = require('../cli-identity');
const { restoreMarks } = require('../seen-marks.js'); // PURE (B-86d3, lane hook-seen-marks): the hook injection's seen marks come back with the session
const BUILD_VERSION = (() => { try { return require('../../package.json').version; } catch { return ''; } })(); // the build an intro mark must name to count as seen

const { mk } = require('./lazy.js');
const { sessionSpawnLine } = require('../spawn/line.js'); // PURE (lane antigravity-spawn-argv): the ONE session line, shared with ws-create
const { HANDED_MARK, markOf, handedNames } = require('../conversation-env.js'); // PURE: the computed mark (B-ba47's follow-up)

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
/** (B-d578 F2) the record of a move onto a pool's FALLBACK PROVIDER, as the session meta keeps it — `{poolId, provider, fromMember,
 *  fromModel, toModel, at, by}` — or null (a record that does not read as one is no record: nothing is guessed; a record on a
 *  conversation the meta holds on another member — or on none — is no record either: F2 cure 2, r3041 (d)). */
function poolFallbackOf(meta) {
  const r = meta && meta.poolFallback;
  if (!r || typeof r !== 'object' || typeof r.poolId !== 'string' || typeof r.provider !== 'string' || !/^pv-/.test(r.provider)) return null;
  if (meta.heldPoolMember !== r.provider) return null;   // (F2 cure 2, r3041 (d)) the reader checks it against where the conversation is HELD: a record written before a kill the hub never made (it died between the send and the kill) describes a move that never happened
  const str = (v) => (typeof v === 'string' && v ? v.slice(0, 200) : null);
  return { poolId: r.poolId, provider: r.provider, fromMember: str(r.fromMember), fromModel: str(r.fromModel), toModel: str(r.toModel), at: Number(r.at) || null, by: r.by === 'person' ? 'person' : 'pool' };
}
function persistNoStart(sockFile, meta, { readSessionMeta, writeSessionMeta }) {
  try {
    if (!meta || !meta.accountId || heldOriginOf(meta) !== 'no-start' || meta.heldPoolOrigin === 'no-start') return false; // only a session billed to an account can hold a pool member
    writeSessionMeta(sockFile, { ...(readSessionMeta(sockFile) || meta), heldPoolOrigin: 'no-start' });
    return true;
  } catch { return false; }
}

/** THE RESUMABLE ID (lane dead-socket-keeps-chat-meta): the conversation a session meta can be RESUMED by, as its harness
 *  names it — the descriptor's `store.resumeIdOf` (claude's session uuid, codex's thread, agy's conversation, an ACP
 *  session); a harness with no store (a shell) has none. A backend no registered harness answers for (a plugin's, not
 *  loaded at this boot) keeps its generic id: it cannot be asked, so it is never deleted on a guess. */
function resumeIdOf(meta) {
  if (!meta || typeof meta !== 'object') return null;
  let h;
  try { h = require('../harnesses').get(meta.backend || 'claude'); } catch { h = undefined; }
  if (h === undefined) return typeof meta.backendSessionId === 'string' && meta.backendSessionId ? meta.backendSessionId : null;
  const of = h && h.store && h.store.resumeIdOf;
  if (typeof of !== 'function') return null;
  try { const id = of(meta); return typeof id === 'string' && id ? id : null; } catch { return null; }
}
/** Why a kept meta is stopped — the one producer (a dead socket found by a boot or its re-probe); the client words it
 *  «its process ended while the server was down». A `.json.stopped` written by 2.369.365 carries no reason: the same one. */
const STOP_DEAD_SOCKET = 'dead-socket-at-boot';
/** A session on a PAIRED machine (an ssh or dial session: spawn/ssh.js and spawn/dial.js set `host` to the machine's id; a dial
 *  session also `_dialDeviceId`). A kept copy is THIS machine's dead socket and its address (backend:id) names no machine — such a
 *  session consumes none, at a turn end or in the sweep. PURE. */
const pairedSession = (s) => !!(s && ((s.host && s.host !== 'local') || s._dialDeviceId));
/** a kept copy's unlink that failed for a reason other than «already gone» is SAID by name — the file stays, the next boot reads
 *  it again; never with nobody told why (主开发's first should on 9efcf735c — every unlink of a kept copy, one sentence) */
function saidUnlinkFailure(sockFile, err) {
  if (err && err.code !== 'ENOENT') console.warn(`[kept] ${sockFile}: its stopped copy could not be removed (${err.code || err.message}) — it stays on disk and the next boot reads it again`);
}
/** B-a5a4 (2) — PURE: did a turn end WELL, so that it proves the resume loaded its conversation? Not a claude `result` that is an
 *  error — a resume the CLI cannot load answers `{type:'result', subtype:'error_during_execution', is_error:true, errors:['No
 *  conversation found with session ID: …']}` on stdout and exits 1 (scripts/test-resume-breaker.mjs's stub, the record the exit
 *  classifier scans); a claude turn that ended capped or interrupted is not counted either (its subtype is no success) — an ACP
 *  max_tokens / refusal end DID answer, so it ran — not an ACP prompt that ended in 'error' or
 *  'cancelled' (acp-events stamps `session._promptStopReason`; a wrapper whose agent died mid-prompt ends it 'error', and agy can
 *  end one 'cancelled' before its agent answered anything). An ACP end that names NO stop reason counts as ran, on purpose: only a
 *  named failure proves the resume did not load. codex's one turn-end call is `task_complete` (codex-events; its record carries
 *  no failure). Anything not proven keeps the copy for the sweep's road. */
function turnRan(rec, session) {
  if (rec && typeof rec === 'object' && (rec.is_error === true || (typeof rec.subtype === 'string' && rec.subtype !== 'success'))) return false;
  const stop = session && session._promptStopReason;
  return stop !== 'error' && stop !== 'cancelled';
}
// lane end-obeys-verdict (majordomo piece 3): an END ON PURPOSE — a person's Terminate or an agent's admitted end — keeps the same
// stopped record, reason `ended`, with who ended it (kind person | agent, the actor's id, a name) and when (stoppedAt)
const STOP_ENDED = 'ended';
const storeWriter = () => require('../store-writer.js').storeWriter();
/** B-574d (lane bl-jobs, slice «session-and-job-records»): A KEPT COPY (`<sock>.json.stopped` — a restart's dead socket, an end on
 *  purpose) reaches the disk through THE STORE WRITER: one job (no debounce; rank 0, nothing re-derives it), atomic and SYNCED on
 *  the writer's thread — never a write on the hub's loop (the release wrote a boot's copies there, one per dead socket, unsynced,
 *  and an end's unsynced). Forgotten once it lands with nothing newer owed. A failed write is SAID ONCE (`failed(code)`) and stays
 *  the writer's (kept in memory, retried at its pace). → the writer */
function keepCopy(file, kept, failed) {
  const W = storeWriter();
  let said = false;
  W.dirty(file, { name: 'kept-copy.write', debounceMs: 0, rank: 0, produce: () => JSON.stringify(kept),
    onWritten: (ok, err) => {
      if (ok) { try { if (W.owed(file) === null) W.forget(file); } catch { } return; }   // landed: the writer keeps no entry for it
      if (!said) { said = true; try { failed((err && (err.code || err.message)) || 'a failed write'); } catch { } }
    } });
  return W;
}
/** A KEPT COPY LEAVES THROUGH ITS WRITER FIRST (B-574d): a write of it still owed is dropped, one in flight is removed again once it
 *  lands — a copy is never brought back after its removal; then its unlink, a refusal said by name. The forget also RUNS every step
 *  waiting on that file's landing (retireDeadSocket's: the dead socket and the live meta go now — the copy that stands for the
 *  conversation is another one, or none is needed) */
function unlinkKept(sockFile, file, done = null) {
  try { storeWriter().forget(file); } catch { }
  fs.unlink(file, (err) => { saidUnlinkFailure(sockFile, err); if (done) done(); });
}

function create({ rootDir, PORT, BUFFERS_DIR, META_DIR, SOCKETS_DIR, DTACH_CMD,
  NODE_CMD, CHAT_WRAPPER, activeSessions, sessionCounterRef,
  attachToDtach, setupSessionPty, readSessionMeta, writeSessionMeta,
  deleteSessionMeta, broadcastToSession, broadcastActiveSessions,
  refreshWebuiPids, getHosts, getDialBridge, getExitProxy = () => null, note = () => { }, step = (name, fn) => fn(), agentEnv, retireWaitMs = 5000 }) {   // retireWaitMs: the duplicate retire's bound for the kernel's word (B-b2d3 step 2; a suite's seam)
  const hosts = mk(getHosts);
  const dialBridge = mk(getDialBridge);
  const exitProxyRef = mk(getExitProxy); // B-92a4: a session the re-probe un-adopts ends its exit pairs + waiting asks like any ended one
  const ensureDir = (p) => { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); };
  // B-526c unit 2 (r1070): the pin record at a LOCAL restore — each pool's folder listed ONCE this boot; the record's decision
  // written back into the meta (paced: the record stays); a record that cannot be read said by name
  const pinListings = new Map();
  const pinAtBoot = (sockFile) => ({ listing: pinListings, write: PinRecord.writeBack({ readSessionMeta, writeSessionMeta }, sockFile), say: (line) => console.warn(line) });
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
// the B-f276 remainder (browser-profiles.json, its read r4 S12): a conversation restored LATE — a pipe re-opened, a remote orphan
// re-adopted, after the keeper's boot owed the restored ones — owes the pin its create could not judge, as those do (idempotent)
function oweRestoredPin(session) {
  if (!session || !session._browserKey || !session._browserPinOwed) return;
  try { require('./browser-keeper.js').keeper()?.owePin?.(session._browserKey, { ...session._browserPinOwed, restored: true }); } catch (e) { console.warn('[browser] a late-restored conversation\'s owed pin —', e && e.message); }
}
function sessionFromMeta(meta, transportFacts) {
  return {
    clients: new Map(),
    cwd: meta.cwd || os.homedir(),
    _nameExplicit: meta.nameExplicit === true, // lane peer-card-sender: a name given at creation / by a rename
    _purpose: meta.purpose === 'sign-in' ? 'sign-in' : null, // lane door-day-one-landing: a sign-in terminal is not a session row
    createdAt: meta.createdAt || Date.now(),
    claudeSessionId: meta.claudeSessionId || null,
    _forkSourceId: restoredForkSource(meta),   // B-5a4d root (r3282): the conversation a fork was made FROM comes back with it (the restore's one rule — a pre-.134 record's by its own chain)
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
    // B-460d: the CPU priority the process STARTED with (src/server/spawn-priority.js factOf, spelled inline: this body is
    // compiled alone by test-oat-identity) — the running process keeps it across the hub's restart, so its properties do
    _cpuNice: meta.cpuNice && typeof meta.cpuNice === 'object' && Number.isInteger(meta.cpuNice.by) && meta.cpuNice.by >= 0 && meta.cpuNice.by <= 19 && (meta.cpuNice.by > 0 || ['off', 'no-nice', 'remote'].includes(meta.cpuNice.why)) ? (meta.cpuNice.by > 0 ? { by: meta.cpuNice.by, ...(meta.cpuNice.of === 'login' ? { of: 'login', ...(meta.cpuNice.join === true ? { join: true } : {}) } : {}) } : { by: 0, why: meta.cpuNice.why, ...(meta.cpuNice.join === true ? { join: true } : {}) }) : null,   // B-460d follow: an ssh road's `of` / `join` kept across a restart — spawn-priority factOf's rule, inline (this function is evaluated on its own by suites: no require here; test-session-spawn-line holds the two equal)
    // lane auto-resume-bulk: WHY it stopped (a usage wall / an overloaded model) survives a restart — the card keeps its
    // mark until the session runs again — and so does a per-session auto-resume choice (the bulk «turn it on for every
    // session» was undone by every deploy before: the flag lived only in memory and in the client's resume config)
    _stoppedBy: meta.stoppedBy && typeof meta.stoppedBy === 'object' ? meta.stoppedBy : null, // every reader re-validates it (src/stopped-by.js normalizeStoppedBy); this function is also evaluated stand-alone by suites, so it names nothing outside it
    ...(typeof meta.autoResume === 'boolean' ? { _autoResume: meta.autoResume } : {}),
    // agent-browser P0 (§3.2.1): the CONVERSATION's browser identity and the
    // user-data-dir rung it spawned on. Restored so a later resume of this
    // conversation finds its key and the orphan sweep sees this session as
    // live in memory as well as on disk.
    _poolPin: poolPinFromMeta(meta), // THE CONVERSATION'S PIN (2026-09-28) survives a restart
    // lane cache-warmth-compact: what the last request's record SAID about the prompt cache (its TTL, read / created / cold —
    // amendment 1) and a compaction's reset still standing survive a restart beside the stamp (the three paths' own lines)
    _cacheFact: meta.cacheFact && typeof meta.cacheFact === 'object' && !Array.isArray(meta.cacheFact) ? meta.cacheFact : null,
    _compactedAt: Number(meta.compactedAt) > 0 ? Number(meta.compactedAt) : null,
    _browserKey: meta.browserKey || null, _browserVariant: meta.browserVariant || null, _browserProfileId: meta.browserProfileId || null, _browserPinOrigin: meta.browserPinOrigin || null, _browserPinOwed: meta.browserPinOwed && typeof meta.browserPinOwed === 'object' && !Array.isArray(meta.browserPinOwed) ? meta.browserPinOwed : null, _browserEnv: Array.isArray(meta.browserEnv) ? meta.browserEnv : null, _browserProfileActive: typeof meta.browserProfileActive === 'string' ? meta.browserProfileActive : null, _browserCap: Number.isInteger(meta.browserCap) ? meta.browserCap : null, _channelTouches: Array.isArray(meta.channelTouches) ? meta.channelTouches : null, _groupCards: Array.isArray(meta.groupCards) ? meta.groupCards : null,
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
    // B-ba47 shape H: a THROWAWAY hub (the one test) never relinks a person's transcript folders
    if (require('./throwaway-root.js').throwaway()) { console.log('[migrate] legacy home projects: refused — this copy is a throwaway one; only an installed copy relinks a person\'s transcript folders'); return; }
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
      if (s.sockName) { try { writeSessionMeta(s.sockName, { ...(readSessionMeta(s.sockName) || {}), ...adopted }, { durable: true }); } catch {} }
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
// B-b2d3 STEP 2 (主开发 r5028 / r5032, lane nl-starts): A LOCAL DUPLICATE PAIR IS DECIDED BY EACH SOCKET'S OWN PROGRAM — its wrapper's
// CLI child, read from the wrapper's side file — never by the live-conversation fd scan (it cannot see a living claude, which appends
// and closes; it is no longer asked, and its seconds at a start went with it). programOf(id, socketPath) → 'alive' | 'dead' | 'unknown':
//  · a wrapper that keeps its CLI's BIRTH (chat-wrapper: childPid + childStart + childBoot) — proc-identity's tokenVerdict: `same` =
//    alive; gone / pid-recycled / zombie = dead; anything else = unknown;
//  · a wrapper that keeps a NUMBER with no birth (pty-wrapper, acp-wrapper, agy-wrapper, codex-chat-wrapper): no /proc/<childPid> =
//    dead; a number still there = unknown (it is never signalled);
//  · no /proc on this machine = unknown for both kinds: a birth is never read by a program on this road (its round's find, lens 3: the
//    release would have asked `ps` synchronously on the loop at every re-probe pass — the boot's own law, round w57qbqw4n);
//  · no side file, an unreadable one, no child number = unknown.
//  Since the births follow (主开发 r5367) the four wrappers above keep a birth too (pidStart / childStart beside each pid); an OLDER
//  record without one stays the number's road: unknown while the number is there, never signalled.
const PIB = require('../proc-identity.js');
async function programOf(id, socketPath) {
  if (!id || !PIB.hasProc()) return 'unknown';
  let w = null;
  try { w = JSON.parse(await fs.promises.readFile(path.join(BUFFERS_DIR, id + '.json'), 'utf-8')); } catch { return 'unknown'; }
  const pid = Number(w && w.childPid);
  if (!Number.isInteger(pid) || pid <= 1) return 'unknown';
  if (typeof w.childStart === 'string' && w.childStart) {
    const v = PIB.tokenVerdict(pid, w.childStart, typeof w.childBoot === 'string' ? w.childBoot : '');
    if (v === 'same') return 'alive';
    if (v === 'pid-recycled' || v === 'zombie') return childVerdict(w, 'dead');   // a birth READ that is not its own; a zombie
    if (v === 'gone') return childVerdict(w, (await procGone(pid)) ? 'dead' : 'unknown');   // its reader's find: a /proc read that failed (EMFILE…) also reads «gone» — only the kernel's ENOENT is
    return 'unknown';
  }
  return childVerdict(w, (await procGone(pid)) ? 'dead' : 'unknown');
}
/** B-b2d3's births follow (its reader's find): a child proven ENDED beside a wrapper that still runs AND has a living child is a program
 *  started again (agy-wrapper's restart spawns the new child on the old one's exit, its record lagging by its write debounce) — so a dead
 *  child reads dead only when its wrapper is gone or has no child: the kernel's own list of the wrapper's children
 *  (/proc/<pid>/task/<pid>/children); a list that cannot be read proves nothing (unknown). By proof, never by a settle. */
async function childVerdict(w, v) {
  if (v !== 'dead') return v;
  const wp = Number(w && w.pid);
  if (!(wp > 1) || wp === process.pid || (await procGone(wp))) return 'dead';
  let kids = null; try { kids = String(await fs.promises.readFile(`/proc/${wp}/task/${wp}/children`, 'utf-8')).trim(); } catch { return 'unknown'; }
  return kids ? 'unknown' : 'dead';
}
/** the kernel's own word that a path names nothing: ENOENT — any other failure proves nothing (procGone: /proc/<pid>) */
async function pathGone(p) { try { await fs.promises.access(p); return false; } catch (e) { return !!e && e.code === 'ENOENT'; } }
async function procGone(pid) { return pathGone('/proc/' + pid); }
/** a held program proven GONE: its birth read and not its own (recycled), a zombie, or no such process by the kernel's word */
async function heldGone(ident) { const v = PIB.judge(ident).verdict; if (v === 'same') return false; if (v === 'pid-recycled' || v === 'zombie') return true; if (v === 'gone') return procGone(ident.pid); return false; }
/** L3: of a LOCAL pair (rows: {sockFile, createdAt, program}), every member PROVEN DEAD retires — unless all are, then all but the
 *  newest (the release's rule). → { retire: Set, kept: rows } — two or more kept = a pair a person sees as two cards (said). */
function pairDecision(rows) {
  const dead = rows.filter((r) => r.program === 'dead');
  if (dead.length === rows.length) { const newest = rows.reduce((a, b) => ((b.createdAt || 0) > (a.createdAt || 0) ? b : a)); return { retire: new Set(rows.filter((r) => r !== newest).map((r) => r.sockFile)), kept: [newest] }; }
  return { retire: new Set(dead.map((r) => r.sockFile)), kept: rows.filter((r) => r.program !== 'dead') };
}
/** the pair's sentence in Diagnostics: the two cards as a person sees them — their names on the list, never a path */
const pairsSaid = new Set();   // a pair is said ONCE per hub process (its reader's find: an unproven pair was never said by its names)
const ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth'];
// its round's find: two unnamed cards read «a conversation» twice — an unnamed one is told by its harness and the ORDER it started in among the pair
const cardWords = (r, i, all) => {
  if (r.name) return `«${r.name}»`;
  const at = all.map((x) => Number(x.createdAt) || 0), known = at.every((t) => t > 0) && new Set(at).size === at.length;   // its reader's find: an order nobody knows is never stated
  if (!known) return `an unnamed ${r.backend || 'claude'} conversation (one of ${all.length}; the order they started in is not known)`;
  const k = [...all].sort((a, b) => a.createdAt - b.createdAt).indexOf(r);
  return `the unnamed ${r.backend || 'claude'} conversation that started ${ORDINAL[k] || `#${k + 1}`}`;
};
const pairWords = (kept) => `two cards of one conversation: ${kept.map(cardWords).join(' and ')} — both kept: each one's program runs or is not proven ended, and none is ended because of a pair; end the one you meant`;
const dedupKey = (m) => `${m.backend || 'claude'}:${m.host || 'local'}:${m.claudeSessionId}`; // dedupWebuiSockets' own key
const runChildP = (bin, args, ms) => require('./tls.js').runChild(bin, args, ms);
// B-323e's remainder (lane nl-starts): THE RE-PROBE'S questions (the ladder below is a TIMER of the hub's — and the duplicate retire's
// fuser of the loser's own socket it reaches) ride the hub's starter (src/server/child-starter.js), never a fork of the hub: the same program, args, bound and
// runChild's 4 MiB; the hub's PATH of the moment rides the request (runChild's child inherited it; none set ⇒ the starter's own). The
// boot's own questions (before the listen) keep runChild — a start's. ON THIS ROAD THE ONLY ANSWER IS THE PROGRAM'S OWN CLEAN END WITH
// ITS OWN NUMBER (主开发 r4793): the starter's silence, the bound, a start error, an output past the buffer, a run that rejects, an end
// with neither a number nor a signal, a signal — each is NO REPLY, a code that is no number (starterRead, from the starter's own
// result; src/server/tls.js runViaStarter's table reads three of them as 1, for its own user — the certificate pass — unchanged). A
// question that got no reply is SAID once per (program, socket) — runChild's own rule for its bound (the read of da7320225: the
// duplicate retire's pgrep with no answer had left a husk running and nothing in the journal)
function starterRead(r) {
  if (r && r.started !== false && !r.unknown && !r.timedOut && !r.overflow && !r.rejected && Number.isInteger(r.code)) return { code: r.code, out: String(r.stdout || ''), err: String(r.stderr || '') };
  const code = !r || r.unknown || r.timedOut ? 'TIMEOUT' : r.rejected ? 'REJECTED' : r.started === false ? String(r.error || 'NOT-STARTED') : r.overflow ? 'OVERFLOW' : r.signal ? String(r.signal) : 'NO-EXIT';
  return { code, out: '', err: code === 'TIMEOUT' ? 'timeout' : String((r && (r.stderr || r.error || r.rejected)) || code) };
}
const starterSaid = new Set();
const starterP = (bin, args, ms) => {
  const t0 = Date.now();
  return Promise.resolve().then(() => require('./child-starter').childStarter().run(bin, args, { timeoutMs: ms, capture: true, maxBuffer: 4 * 1024 * 1024, ...(process.env.PATH != null ? { envAdd: { PATH: process.env.PATH } } : {}) }))
    .then((r) => r, (e) => ({ rejected: String((e && e.message) || e) || 'rejected' }))
    .then((raw) => {
      const r = { ...starterRead(raw), ms: Date.now() - t0 };
      // said once: a rung's no answer (noAnswer)
      if (noAnswer(r)) { const p = (args || []).find((a) => typeof a === 'string' && a.startsWith('/')), key = p ? `${bin} ${path.basename(p)}` : String(bin); if (!starterSaid.has(key)) { starterSaid.add(key); console.warn(`[child] ${key}: no answer through the hub's starter (${r.code === 'TIMEOUT' ? `none in ${ms} ms` : r.code}) — no answer, never a kill`); } }
      return r;
    });
};
// the restore's two liveness rungs, as children: fuser (an owner ⇒ alive), else pgrep -f (a command line naming the socket — never one of `own`, this server's own `dtach -a` attach clients) ⇒ true / false, or null = NO ANSWER
// AN ANSWER IS THE TOOL'S OWN EXIT 0 OR 1 (found / none — fuser's and pgrep's). Anything else is NO answer, never «dead» (B-323e's
// remainder, its reader's find, lane nl-starts): its bound ran out, the tool is missing, its start failed (EAGAIN / EMFILE at a full
// process or file table), a signal ended it, its output passed the buffer, or the tool's own fault (pgrep 2 / 3) — the release read
// all but the first two as «nobody owns it» and a LIVE socket could be retired
const noAnswer = (r) => !(r.code === 0 || r.code === 1);
const ownedP = async (sp, rung2, ask = () => { }, own = new Set(), run = runChildP) => { ask('fuser'); const r = await run('fuser', [sp], 2000); if (r.code === 0) return r.out.trim().length > 0; if (!rung2) return noAnswer(r) ? null : false; ask('pgrep'); const g = await run('pgrep', ['-f', sp], 2000); return noAnswer(g) ? null : g.code === 0 && g.out.split('\n').some((x) => x.trim() && !own.has(Number(x))); };
let probed = null, probing = null;
function probeSockets() {
  if (probing) return probing;
  const capMs = Number(process.env.VIBESPACE_PROBE_CAP_MS) || PROBE_CAP_MS;
  const out = { alive: new Map(), remoteAlive: new Map(), programs: new Map(), unanswered: new Map(), capMs, capped: false };
  const asking = new Map(); // sockFile → the question in flight
  let closed = false; // the cap (or the end): a late answer writes nothing, a queued question is never asked
  probing = (async () => {
    let sockets = []; try { sockets = fs.readdirSync(SOCKETS_DIR).filter(f => f.startsWith('cw-')); } catch { }
    const metas = [];
    for (const sockFile of sockets) { let m; try { m = readSessionMeta(sockFile); } catch { continue; } if (ownsItsId(m)) metas.push({ sockFile, m }); }
    const answer = (map, key, v) => { if (!closed) map.set(key, v); };
    const asks = sockets.map((sockFile) => async () => answer(out.alive, sockFile, await ownedP(path.join(SOCKETS_DIR, sockFile), true, (q) => { if (closed) throw new Error('past the cap'); asking.set(sockFile, q); })));
    for (const { sockFile, m } of metas) if (m.host) asks.push(async () => answer(out.remoteAlive, sockFile, await ownedP(path.join(SOCKETS_DIR, sockFile), false)));
    // B-b2d3 step 2: each member of a LOCAL duplicate pair — its program read from its wrapper's side file (programOf), first in line
    const pairs = new Map(); for (const { sockFile, m } of metas) if (!m.host && m.claudeSessionId) { const k = dedupKey(m); if (!pairs.has(k)) pairs.set(k, []); pairs.get(k).push({ sockFile, m }); }
    for (const g of pairs.values()) if (g.length > 1) for (const { sockFile, m } of g) asks.unshift(async () => answer(out.programs, sockFile, await programOf(m.webuiSessionId, path.join(SOCKETS_DIR, sockFile))));
    const drain = async () => { for (let a; !closed && (a = asks.shift());) { try { await a(); } catch { } } };
    let cap = null;
    await Promise.race([Promise.all([drain(), drain(), drain(), drain()]), new Promise((r) => { cap = setTimeout(() => { out.capped = true; r(); }, capMs); })]);
    clearTimeout(cap); closed = true;
    for (const sockFile of sockets) if (out.alive.get(sockFile) == null) out.unanswered.set(sockFile, asking.get(sockFile) || 'not asked');
    for (const g of pairs.values()) if (g.length > 1) for (const { sockFile } of g) if (!out.programs.has(sockFile) && !out.unanswered.has(sockFile)) out.unanswered.set(sockFile, 'program');   // not read by the cap: unknown (kept)
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
/** A dead dtach socket: the socket goes; a REMOTE session's meta is kept as an orphan for the re-adopt; a LOCAL one that names a
 *  conversation is kept as STOPPED (`<sock>.json.stopped`, stoppedAt) and deleted only when its harness answers that no
 *  transcript exists (settleStopped, off the loop); one that names none (a shell) is deleted as before.
 *  r1 of lane dead-socket-keeps-chat-meta: «names a conversation» = its harness's resumable id (resumeIdOf); the kept copy
 *  says `status: 'stopped'`, `stopReason`, and is READ BACK (keptStopped → stoppedSessions → /api/sessions: the sidebar's
 *  stopped row, the window's history, the resume-all offer — with the name, cwd and account it kept). */
function retireDeadSocket(sockFile, socketPath) {
  console.log(`  ✗ Dead socket: ${sockFile} — cleaning up`);
  // B-574d (主开发 r5005): THE DEAD SOCKET LEAVES WITH ITS RECORD. On the kept-copy road it goes only once the stopped copy LANDED,
  // in the same step as the live meta: a hub killed before that landing leaves the dead socket, and the next start retires it
  // again (the boot walks sockets — a meta with no socket and no copy would be retired by nothing). Every other road: at once
  const dropSocket = (p) => { try { fs.unlinkSync(p); } catch {} };   // its path as its parameter: each road that calls it is a counted site (test-store-write-census)
  let socketRides = false;
  // B-1525 (2.219.0): a REMOTE session's meta holds the ONLY local record
  // of its keeper sid / dial device — the remote half (keeper daemon,
  // device pipe session) survives a pod-level death, and deleting the
  // meta here orphaned it forever (userL's h200 keeper claudes needed
  // manual surgery). Keep those metas tagged orphanedAt for re-adopt
  // (resume host-inference + findKeeperFor consume them); local-only
  // sessions keep the old cleanup.
  try {
    const dm = readSessionMeta(sockFile) || {};
    // r3137 (2): an UNREAD record is a LIVE conversation to every sweep — its dead socket's record is KEPT as it is (never deleted,
    // never written over as stopped from nothing): its read answers off the loop, and the next start judges it whole
    if (require('./session-meta-verdict.js').isUnread(dm)) { deadTally.kept.push(sockFile); console.log(`    ↳ ${sockFile}: its record could not be read — kept as it is (nothing removed or written over)`); return; }
    if ((dm.host || dm.dialDeviceId) && !dm.orphanedAt) {
      writeSessionMeta(sockFile.replace(/\.orphan$/, ''), { ...dm, orphanedAt: Date.now() }, { sync: true });
      const op = path.join(META_DIR, sockFile + '.json');
      fs.renameSync(op, op + '.orphan');
      console.log(`    ↳ remote session meta preserved as orphan (${dm.keeperSid || dm.dialDeviceId || dm.host})`);
      return;
    }
    // A DEAD LOCAL SESSION IS A STOPPED SESSION, NOT A DELETED ONE (lane layout-stopped-window — 2026-10-30 02:55 the owner's
    // user manager died with every dtach session, and the 04:59 boot deleted each local meta): the conversation's transcript is
    // the record and the session is resumable (the sidebar lists it stopped from that transcript, the resume-all offer resumes
    // it); its meta — the session's name, account, groups, model / effort, browser key — is kept beside it as STOPPED, out of
    // every live reader's `*.json` scan. Deleted only when no transcript exists (a shell, a conversation that never spoke).
    // r2 — KEPT FIRST, LOOKED FOR OFF THE LOOP (§19): the boot never walks a transcript store (the claude projects scan, the
    // codex rollout walk) per dead socket on its loop — the meta is kept now (an atomic write; the live `.json` goes through
    // the ONE delete road, whose tombstone stops a straggler writer resurrecting it) and its harness's own locate answers in
    // the transcript worker; only its «no transcript» deletes the stopped meta, no answer keeps it.
    const cid = resumeIdOf(dm);
    if (!dm.orphanedAt && cid) {
      const stopped = path.join(META_DIR, sockFile + '.json.stopped');
      const kept = { ...dm, status: 'stopped', stoppedAt: deadTally.at || (deadTally.at = Date.now()), stopReason: STOP_DEAD_SOCKET }; // ONE instant per pass: its duplicates are ordered by createdAt
      // B-574d: the copy is THE STORE WRITER's (never a write on the boot's loop — a machine's reboot retires every local
      // conversation in one pass); the dead socket and the live meta (its ONE delete road) go only AFTER the copy LANDED — or when
      // its owner removes the copy (a forget runs every step that waits on that file's landing: a superseded or consumed copy).
      // A copy that does not land leaves the socket and the meta as they are, never deleted (said once; the writer retries it)
      let W = null;
      try { W = keepCopy(stopped, kept, (why) => console.warn(`    ↳ ${sockFile}: its stopped copy is not written yet (${why}) — the meta is left as it is, never deleted, until the copy lands (the store writer retries it)`)); }
      catch (e) { console.warn(`    ↳ ${sockFile}: its stopped copy could not be written (${e.message}) — the meta is left as it is, never deleted`); return; }
      const landed = W.afterLanding(stopped, () => { dropSocket(socketPath); deleteSessionMeta(sockFile); }, { what: 'the dead socket and the live meta, removed once its stopped copy landed', timeoutMs: null });
      socketRides = true;   // the dead socket leaves in that step, never before it
      settling.add(landed); landed.finally(() => settling.delete(landed));   // a test's wait (stoppedSettled) waits for the landing too
      const dropped = keepStopped(sockFile, kept, cid); // r2: a newer stop of the SAME conversation keeps one copy — the line says which went
      if (dropped === sockFile) { deadTally.superseded.push(sockFile); return; }
      if (dropped && deadTally.kept.includes(dropped)) { deadTally.kept.splice(deadTally.kept.indexOf(dropped), 1); deadTally.superseded.push(dropped); }
      deadTally.kept.push(sockFile);
      console.log(`    ↳ local session meta kept as stopped (${dm.backend || 'claude'} ${cid.slice(0, 8)}…: its transcript is looked for off the loop)`);
      settleStopped(sockFile, stopped, dm, cid);
      return;
    }
  } catch { } finally { if (!socketRides) dropSocket(socketPath); }   // every road but the kept copy's: the dead socket goes at once, as before
  deadTally.deleted.push(sockFile);
  deleteSessionMeta(sockFile);
}
// THE READ-BACK (lane dead-socket-keeps-chat-meta — the owner's 2026-10-30 session: kept or deleted, nothing read a
// stopped meta back, so its window, name, cwd and account were gone either way). `backend:id` → {sockFile, meta, id}: the
// metas this boot kept, and — once, off the loop — every `<sock>.json.stopped` an earlier boot kept. A newer stop of the
// same conversation supersedes the older copy (unlinked); a conversation a live session runs again CONSUMES its copy.
// r2 — THE ONE PREDICATE («A PENDING FORK IS NOT A CLAIM», claude-lock-capture): only a meta that holds its id AS ITS OWN is
// keyed by its conversation; a pending fork still carrying its SOURCE's id is keyed by its own socket — it never supersedes
// its parent's copy, is never superseded by it, and no live session consumes it through the id it borrowed (acceptance r1:
// a parent and its pending fork both dead left ONE copy, the fork's name and account on the parent's row).
// B-a5a4 (4): a kept meta of a harness whose conversation lives in its account's OWN store (`store.accountBound`) that named no
// account ran on the machine's own login — its row says 'subscription' (agy-discover's word for that root), never null
const accountBoundOf = (backend) => { try { return require('../harnesses').get(backend || 'claude')?.store?.accountBound === true; } catch { return false; } };
const keptStopped = new Map();
let keptLoaded = null;
const keptFile = (sockFile) => path.join(META_DIR, sockFile + '.json.stopped');
const keptKey = (sockFile, meta, id) => (restoredForkPending(meta) ? `sock:${sockFile}` : `${meta.backend || 'claude'}:${id}`);
const msOf = (v) => (typeof v === 'number' ? v : Date.parse(v) || 0);
/** a's stop is the newer: its stoppedAt, then (one boot's stops share a clock tick) the later-created session */
const newerStop = (a, b) => (msOf(a.stoppedAt) - msOf(b.stoppedAt) || msOf(a.createdAt) - msOf(b.createdAt)) > 0;
/** → the sockFile whose copy this unlinked (the older stop of the same conversation), or null */
// AN END OUTRANKS A RESTART (the one end record's contract, 主开发 2026-11-17 14:51Z): a record whose reason is `ended` (a person's
// Terminate, an agent's admitted end) stands over a restart's copy of the same conversation, newer or not — a later restart that finds
// its stale dead socket never turns it back into «a restart ended it»; it leaves with the kept copy only at a turn that RAN well
// (consumeKeptOf) or by the stopped list's live check — never at the create (主开发's ruling 2026-11-19 03:17Z)
const endRank = (m) => (m && m.stopReason === STOP_ENDED ? 1 : 0);
function keepStopped(sockFile, meta, id) {
  const k = keptKey(sockFile, meta, id), was = keptStopped.get(k);
  if (was && was.sockFile !== sockFile) {
    if (endRank(was.meta) > endRank(meta) || (endRank(was.meta) === endRank(meta) && newerStop(was.meta, meta))) { unlinkKept(sockFile, keptFile(sockFile)); return sockFile; }
    unlinkKept(was.sockFile, keptFile(was.sockFile));
    keptStopped.set(k, { sockFile, meta, id });
    return was.sockFile;
  }
  keptStopped.set(k, { sockFile, meta, id });
  return null;
}
function loadKept() {
  if (!keptLoaded) keptLoaded = (async () => {
    let names = [];
    try { names = await fs.promises.readdir(META_DIR); } catch { return; }
    for (const f of names) {
      if (!f.endsWith('.json.stopped')) continue;
      const sockFile = f.slice(0, -'.json.stopped'.length);
      if ([...keptStopped.values()].some((e) => e.sockFile === sockFile)) continue; // this boot's own — already here
      let m = null;
      try { m = JSON.parse(await fs.promises.readFile(path.join(META_DIR, f), 'utf-8')); } catch { continue; }
      // B-a5a4 (9): a PENDING FORK's copy an earlier boot kept is swept — its own id never arrived, so nothing can ever resume
      // it (its id is its parent's) and nothing consumed it (keyed by its socket): kept and listed for the boot that made it
      if (restoredForkPending(m)) { fs.promises.unlink(path.join(META_DIR, f)).catch((err) => saidUnlinkFailure(sockFile, err)); say(`kept copies: a pending fork's copy swept (nothing to resume: ${sockFile})`); continue; }
      const id = resumeIdOf(m);
      if (!id) continue;
      keepStopped(sockFile, m, id);
      // ITS AGE (the contract): an ENDED record nothing resumed leaves the way a restart's copy does — superseded by a newer stop
      // of the same conversation, consumed when it is live again, deleted when its harness answers that no transcript exists. A
      // restart's copy is asked at its retire; an ended one is asked here, once per boot, ONE AT A TIME (a chain, off the loop)
      // a record of ANOTHER machine's conversation is never asked here (this machine's locate cannot see its transcript): a consume or a
      // newer stop retires it
      if (m.stopReason === STOP_ENDED && !m.host) { const file = path.join(META_DIR, f); endedSettle = endedSettle.then(() => locateOrDrop(sockFile, file, m, id)).catch(() => null); }
    }
  })().catch(() => { });
  return keptLoaded;
}
let endedSettle = Promise.resolve();
/** The kept metas as /api/sessions rows (routes/sessions merges them over its harnesses' discover): STOPPED, why and when,
 *  and the name / cwd / mode / account the meta kept — the doors resume with them. */
/**
 * lane end-obeys-verdict (majordomo piece 3) — TERMINATE SAYS WHO. An end on purpose keeps the stopped record a restart already
 * leaves (no new store): reason `ended`, `endedBy` {kind: 'person'|'agent', actorId, name}, and when. Called AFTER the kill took
 * the session out of the live map — a session-list read during the kill would otherwise consume the copy (stoppedSessions drops
 * a copy whose conversation is live). One write through THE STORE WRITER, awaited to its landing; a record that did not land
 * keeps nothing and says so.
 */
async function keepEnded(sockFile, meta, endedBy, endFacts = null) {
  const id = resumeIdOf(meta);
  if (!sockFile || !id) return null;
  const by = endedBy && typeof endedBy === 'object' ? { kind: endedBy.kind === 'agent' ? 'agent' : 'person', actorId: endedBy.actorId ? String(endedBy.actorId).slice(0, 200) : null, name: endedBy.name ? String(endedBy.name).slice(0, 120) : null, ...(endedBy.forced === true ? { forced: true } : {}), ...(endedBy.proposedBy && typeof endedBy.proposedBy === 'object' && endedBy.proposedBy.key ? { proposedBy: { key: String(endedBy.proposedBy.key).slice(0, 200), name: endedBy.proposedBy.name ? String(endedBy.proposedBy.name).slice(0, 120) : null } } : {}) } : { kind: 'person', actorId: null, name: null };   // proposedBy: lane login-request-card (the cure's law 12)
  const facts = endFacts && typeof endFacts === 'object' ? endFacts : { goalStated: false, queueRead: false, notStated: 'nothing was read before the end' };
  const kept = { ...meta, status: 'stopped', stoppedAt: Date.now(), stopReason: STOP_ENDED, endedBy: by, endFacts: facts };
  const file = keptFile(sockFile);
  // B-574d (the family's ruling (b)): made ONCE at an END — a person's Terminate or an agent's admitted end, one conversation at a
  // time: THE STORE WRITER, the record AWAITED to its DURABLE landing (synced on the writer's thread; the release's was unsynced). A
  // record that did not land is said and dropped — kept nothing (a write of it still in flight is removed again once it lands)
  let why = null, landed = false;
  try { landed = (await keepCopy(file, kept, (w) => { why = w; }).durable(file)) === true; } catch (e) { why = e.message; }
  if (!landed) { try { storeWriter().forget(file); } catch { } console.warn(`[end] ${sockFile}: its ended record could not be written (${why || 'not on disk within its bound'}) — kept nothing`); return null; }
  keepStopped(sockFile, kept, id);
  return kept;
}
/**
 * THE ONE READ BEFORE THE KILL (the contract): the kill body removes the session's meta and its wrapper's sidecar, so the facts a
 * resume needs are read from the sidecar NOW — ONE async read, BOUNDED (END_READ_MS, a second); past it, or failed, the record is
 * written from what the hub holds in memory and its facts say «not stated» with why. A Terminate never waits longer than the bound,
 * whatever a mount does. → endFacts — piece 4's reader's words (int359/majordomo/piece4-reader-expects.md): { goalStated (true only
 * when the sidecar HELD `goal` or `goalStatus`), goalStatus (the wrapper's effective status: its goalStatus, else «active» when it
 * holds a goal, else null; null when not stated), queueRead (true only when the wrapper STATES it really read the thread's queue —
 * its `queueReadAt` mark beside `queue`: the codex wrapper's, when a fresh list answered), queueCount (a whole number when read, else
 * null), mode, folder, machine, notStated? }. No harness id is branched on here. `read` is a test's seam.
 */
const END_READ_MS = 1000;
async function endFactsBefore(session, webuiId, { boundMs = END_READ_MS, read = null } = {}) {
  const s = session || {};
  const base = { mode: s.mode || 'terminal', folder: s.cwd || null, machine: s.host || null };
  const name = typeof webuiId === 'string' && /^[A-Za-z0-9._-]+$/.test(webuiId) && !webuiId.includes('..') ? webuiId : null;
  const none = (why) => ({ ...base, goalStated: false, goalStatus: null, queueRead: false, queueCount: null, notStated: why });
  if (!name) return none('its wrapper file has no plain name');
  let timer = null;
  const got = await Promise.race([
    (async () => { try { return { wm: JSON.parse(await (read || ((f) => fs.promises.readFile(f, 'utf8')))(path.join(BUFFERS_DIR, name + '.json'))) }; } catch (e) { return { err: (e && e.code) || 'unreadable' }; } })(),
    new Promise((r) => { timer = setTimeout(() => r({ late: true }), boundMs); }),
  ]);
  clearTimeout(timer);
  if (got.late) return none(`its wrapper's file was not read within ${boundMs} ms`);
  if (got.err) return none(`its wrapper's file could not be read (${got.err})`);
  const wm = got.wm && typeof got.wm === 'object' && !Array.isArray(got.wm) ? got.wm : {};
  const goalStated = Object.hasOwn(wm, 'goal') || Object.hasOwn(wm, 'goalStatus');
  const queueRead = Array.isArray(wm.queue) && Number.isFinite(wm.queueReadAt);
  return { ...base, mode: wm.mode === 'chat' ? 'chat' : base.mode, goalStated,
    goalStatus: goalStated ? (wm.goalStatus ? String(wm.goalStatus).slice(0, 40) : wm.goal ? 'active' : null) : null,
    queueRead, queueCount: queueRead ? wm.queue.length : null };
}
/** THE KEPT RECORD of an ended conversation (the manager design's piece 4 — its READER; piece 3 owns the writer of an end's
 *  record): `backend:id` → {sockFile, meta, id} or null — this boot's copy and, loaded once, the earlier boots'. The resume verb
 *  judges it (src/server/resume-line.js keptFacts): what the record does not state is UNKNOWN. */
async function keptRecordOf(key) {
  await loadKept();
  const e = keptStopped.get(String(key || ''));
  return e ? { sockFile: e.sockFile, meta: e.meta, id: e.id } : null;
}
async function stoppedSessions() {
  await loadKept();
  const live = new Set(); // the conversations live sessions ADDRESS (addressableId: a pending fork addresses none — r2)
  for (const s of activeSessions.values()) { const id = pairedSession(s) ? null : addressableId(s); if (id) live.add(`${(s && s.backend) || 'claude'}:${id}`); } // a paired machine's session addresses no copy of this machine's
  const rows = [];
  for (const [k, e] of [...keptStopped]) {
    if (live.has(k)) { keptStopped.delete(k); unlinkKept(e.sockFile, keptFile(e.sockFile)); continue; } // resumed: the live session is the record now
    const m = e.meta;
    rows.push({ backend: m.backend || 'claude', sessionId: e.id, backendSessionId: e.id, cwd: m.cwd || '', name: m.name || '', mode: m.mode || 'terminal', status: 'stopped',
      startedAt: m.stoppedAt || m.createdAt || 0, stoppedAt: m.stoppedAt || null, stopReason: m.stopReason || STOP_DEAD_SOCKET, accountId: m.accountId || (accountBoundOf(m.backend) ? 'subscription' : null), kept: e.sockFile,
      ...(m.endedBy && typeof m.endedBy === 'object' ? { endedBy: m.endedBy } : {}), // lane end-obeys-verdict: who ended it on purpose
      ...(m.host ? { host: m.host } : {}), // its MACHINE: a paired machine's conversation is never listed as a local row (a resume goes there)
      ...(m.nameExplicit === true && m.name ? { nameExplicit: true, webuiName: m.name } : {}), // THE NAME LADDER: a GIVEN name is rung ② (src/session-name.js); a default is not
      ...(k.startsWith('sock:') ? { forkPending: true } : {}) }); // a pending fork's copy: kept and listed here, but `id` is its PARENT's — no sidebar row (routes/sessions)
  }
  return rows;
}
/** B-a5a4 (2) — A RESUME THAT RAN CONSUMES ITS COPY AT ONCE: a live session that addresses a kept copy's conversation ended a turn
 *  WELL (server.js's ONE turn-end entry — claude `result`, codex `task_complete`, ACP `prompt_end` — every chat harness's stdout
 *  consumer) ⇒ the live session is the record, and its copy goes now, not at the next /api/sessions sweep. A resume that ran and
 *  ended with no page asking in between left the copy: a «its process ended while the server was down» row with the old time, and
 *  the old account its next resume went to. Never at registration, never on a turn that FAILED (`turnRan`): r1 of B-a5a4 consumed at
 *  registration and lost a failed resume's copy. A pending fork addresses nothing (addressableId), so it consumes nothing.
 *  `rec` = the turn-end record the entry was handed (claude's `result`, codex's `task_complete`, ACP's `prompt_end`). → the consumed
 *  sockFile | null */
async function consumeKeptOf(session, rec = null) {
  if (!turnRan(rec, session)) return null;
  if (pairedSession(session)) return null;   // a kept copy is THIS machine's socket; the address names no machine
  const id = session ? addressableId(session) : null;
  if (!id) return null;
  await loadKept();
  const k = `${session.backend || 'claude'}:${id}`, e = keptStopped.get(k);
  if (!e) return null;
  keptStopped.delete(k);
  await new Promise((r) => unlinkKept(e.sockFile, keptFile(e.sockFile), r));   // forgotten here; a refused unlink is said
  return e.sockFile;
}
// THE FACTS LINE (the boot trace's notes, ⚙ Diagnostics): what the dead sockets of a restore / a re-probe pass became —
// said once the pass's kept copies were looked for (r2: a copy its harness then answered «no transcript» for is said
// DELETED, one a newer stop of its conversation replaced is said SUPERSEDED — never «kept» for a copy that is gone).
const deadTally = { kept: [], deleted: [], superseded: [], settles: [], at: 0 };
function sayDead(when = '') {
  const { kept, deleted, superseded, settles } = deadTally;
  deadTally.kept = []; deadTally.deleted = []; deadTally.superseded = []; deadTally.settles = []; deadTally.at = 0;
  if (!kept.length && !deleted.length && !superseded.length) return;
  const named = (l) => l.slice(0, 3).join(', ') + (l.length > 3 ? `, +${l.length - 3}` : '');
  const p = Promise.all(settles).then((answers) => {
    const gone = new Set(answers.filter(Boolean));
    const k = kept.filter((s) => !gone.has(s)), d = [...deleted, ...kept.filter((s) => gone.has(s))];
    say(`dead sockets${when}: ${k.length} stopped${k.length ? ` (kept: ${named(k)})` : ''}, ${d.length} deleted${d.length ? ` (nothing to resume: ${named(d)})` : ''}`
      + (superseded.length ? `, ${superseded.length} superseded (by a newer copy of the same conversation: ${named(superseded)})` : ''));
  });
  settling.add(p); p.finally(() => settling.delete(p));
}
/** The one question a kept meta leaves: does its conversation have a transcript here? Its harness descriptor's own
 *  `store.locate(id, cwd)`, run in the transcript worker (adapters/codex.js transcriptWorkerCall, op `locate`, 20 s bound);
 *  `false` deletes the stopped meta, `true` / no answer (the pool down, past its bound) keeps it — never deleted on a guess. */
const settling = new Set();
function settleStopped(sockFile, file, meta, id) {
  const p = locateOrDrop(sockFile, file, meta, id);
  settling.add(p); p.finally(() => settling.delete(p));
  deadTally.settles.push(p.then((r) => (r === false ? sockFile : null), () => null)); // the facts line's answer for this copy
}
/** The kept copy's transcript question itself (settleStopped's, and an ended record's at a later boot): → found (true / null) or
 *  false (no transcript: the copy and its file are gone). */
function locateOrDrop(sockFile, file, meta, id) {
  return (async () => {
    let found = null;
    try { found = await require('../adapters/codex.js').transcriptWorkerCall('locate', { backend: meta.backend || 'claude', id, cwd: meta.cwd || '' }, () => null); } catch { found = null; }
    if (found !== false) return found;
    const k = keptKey(sockFile, meta, id);
    if (keptStopped.get(k)?.sockFile === sockFile) keptStopped.delete(k);
    await new Promise((r) => unlinkKept(sockFile, file, r));
    console.log(`    ↳ ${sockFile}: no transcript — its stopped meta deleted`);
    return false;
  })();
}
/** A stale duplicate of a conversation another socket owns — B-b2d3 step 2 (主开发 r5028 / r5032, lane nl-starts): NOTHING IS SIGNALLED BY
 *  A PATTERN, AND THE SOCKET LEAVES LAST (L1, L2). The release SIGTERMed every pid a `pgrep -f <socket path>` named (the hub's own attach,
 *  a person's own `dtach -a`, any tool naming the path) and removed the socket before its answer. Now, in this order:
 *   (a) its HELD programs: the socket's own master — `fuser <that socket>`, the kernel's answer for THAT one file (its listener; an
 *       attach to it is not in that answer), each pid's birth read at once — and its wrapper, by the side file's pid + pidStart where
 *       the wrapper keeps one (a number with no birth is never signalled); the hub's own attach of an adopted loser by its own pty handle;
 *   (b) SIGTERM each still proven that very process (proc-identity signalIdentity reads its birth again right before the signal) — the
 *       WRAPPER first, the master only once the wrapper is gone (a dtach master removes its own socket as it ends);
 *   (c) the kernel's word that each is gone (a recycled birth, a zombie, or ENOENT — a read that failed proves nothing), waited for at
 *       most RETIRE_WAIT_MS; a wrapper's number with no birth is watched for its end, never signalled;
 *   (d) ONLY THEN the socket, the wrapper's files and the meta (today's order).
 *  A program still there past the bound, or holders that cannot be read or proven (no /proc), LEAVE EVERYTHING AS IT IS — said once, no
 *  second, stronger signal on this road; the next start judges again. → Promise<{ retired, why? }> */
const RETIRE_WAIT_MS = Number(retireWaitMs) > 0 ? Number(retireWaitMs) : 5000;
const RETIRE_POLL_MS = Math.min(100, Math.max(10, Math.round(RETIRE_WAIT_MS / 20)));   // 100 ms in the hub (its 5 s bound); a suite's shorter bound reads the kernel more often
const retireSaid = new Set();
async function retireDuplicate(sockFile, socketPath, id, claudeSessionId, run = runChildP, adopted = null, recheck = false, onUnadopt = null, card = null) {   // card: the card's words for ⚙ Diagnostics (its reader's find: a socket file name is no card a person can find)   // recheck: a LOCAL member's program read again; onUnadopt: the re-probe's unadopt of `adopted`, run only once every check passed   // run: the re-probe hands its starter's runner; adopted: the re-probe's own (already unadopted) session of it
  console.log(`  ⤫ Duplicate of ${claudeSessionId} — retiring stale ${sockFile}`);
  let touched = false;   // set at the first touch: after it, a leave on the re-probe's road has no card left to keep
  const leave = (why) => {
    if (!retireSaid.has(sockFile)) {
      retireSaid.add(sockFile);
      const line = `${sockFile}: not retired — ${why}; the socket and its files left as they are (no stronger signal on this road; the next start judges again)`;
      console.warn(`[boot-restore] ${line}`);
      // said once — in ⚙ Diagnostics too, by the card's words (its reader's find); a leave AFTER the first touch says the card is gone and what stays
      const head = card ? `${card} (${sockFile}): not retired — ${why}` : `${sockFile}: not retired — ${why}`;
      const words = touched && adopted
        ? `${head}; its card is already gone (its program was proven ended before the first touch); the socket and what still holds it stay until the next start judges again`
        : card ? `${head}; nothing more is done to it on this road, the next start judges again` : line;
      try { note(words); } catch { }
    }
    return { retired: false, why };
  };
  // (c) the kernel's word, waited for at most the bound — a number with no birth is WATCHED (proved gone), never signalled
  const waitGone = async (held, watched = []) => {
    const left = async () => { const out = []; for (const h of held) if (!(await heldGone(h.ident))) out.push(h.what); for (const w of watched) if (!(await procGone(w.pid))) out.push(w.what); return out; };
    let l = await left();
    for (const t0 = Date.now(); l.length && Date.now() - t0 < RETIRE_WAIT_MS;) { await new Promise((r) => setTimeout(r, RETIRE_POLL_MS)); l = await left(); }
    return l;
  };
  try {
    if (!PIB.hasProc()) return leave('no /proc here: its programs cannot be proven');
    // (a) its held records: the wrapper (pid + birth where it keeps one; else its number, to watch) and the socket's own master. A record
    // that is not there names no wrapper; one that cannot be read or parsed (EMFILE, a torn write) LEAVES everything (its reader's find)
    let w = null;
    try { w = JSON.parse(await fs.promises.readFile(path.join(BUFFERS_DIR, id + '.json'), 'utf-8')); }
    catch (e) { if (!(e && e.code === 'ENOENT')) return leave(`its record could not be read (${(e && (e.code || e.name)) || 'unreadable'})`); }
    const wrapper = [], watched = [];
    if (w && Number(w.pid) > 1 && Number(w.pid) !== process.pid) {
      if (typeof w.pidStart === 'string' && w.pidStart) {
        const v = PIB.tokenVerdict(Number(w.pid), w.pidStart, typeof w.pidBoot === 'string' ? w.pidBoot : '');
        if (v === 'same') wrapper.push({ what: `its wrapper (pid ${w.pid})`, ident: PIB.identityFromToken(Number(w.pid), w.pidStart, w.pidBoot) });
        // its round's find: a birth that is not `same` proves the wrapper ENDED only as programOf reads it — recycled, a zombie, or the
        // kernel's ENOENT; any other answer (a failed read, unknown) LEAVES everything
        else if (!(v === 'pid-recycled' || v === 'zombie' || (v === 'gone' && (await procGone(Number(w.pid)))))) return leave(`its wrapper (pid ${w.pid}) is neither proven its own nor proven ended (${v})`);
      }
      else watched.push({ what: `its wrapper (pid ${w.pid}, a number with no birth)`, pid: Number(w.pid) });
    }
    const f = await run('fuser', [socketPath], 2000);
    const masters = [];
    if (f && f.code === 0) {
      for (const t of String(f.out).match(/\d+/g) || []) {
        const pid = Number(t); if (!(pid > 1) || pid === process.pid || wrapper.some((x) => x.ident.pid === pid)) continue;
        const ident = PIB.identityOf(pid);
        if (ident) masters.push({ what: `its socket's master (pid ${pid})`, ident });
        else if (!(await procGone(pid))) return leave(`its socket's holder ${pid} could not be proven (its birth not read)`);
      }
    } else if (f && f.code === 1) {
      // exit 1 with nothing SAID = nobody holds it (runChild's `stderr` is the program's own; its `err` falls back to «Command failed»);
      // exit 1 WITH words (it could not stat or see the file) is nobody only when the socket is gone by the kernel's word — a master
      // removes its own socket as it ends — else no answer: LEFT (its reader's finds)
      const said = String(typeof f.stderr === 'string' ? f.stderr : f.err || '').trim();
      if (said && !(await pathGone(socketPath))) return leave(`who holds its socket was not answered (1: ${said.split('\n')[0].replace(socketPath, path.basename(socketPath)).slice(0, 160)})`);
    } else return leave(`who holds its socket was not answered (${f ? f.code : 'no answer'})`);
    // (b0) A WRAPPER WITH NO BIRTH (an older record) is never signalled: it is WAITED FOR first, before anything of the session is touched
    // (its CLI is proven ended; a local wrapper ends right after its child) — bounded like every wait here, off the loop; past the bound
    // NOTHING is signalled or ended, the card kept: left, said once (its reader's find: the unadopt used to come before this wait)
    let left = await waitGone([], watched);
    if (left.length) return leave(`${left.join(', ')} still there ${RETIRE_WAIT_MS / 1000} s after its program ended — nothing signalled`);
    // (b1) THE DECISION READ AGAIN, right before the first touch (its reader's finds: after the fuser question and the watched wait, so a
    // restart landing there is seen): a LOCAL member's program (programOf — a child ended beside a wrapper that has a living child reads
    // unknown) no longer proven ended ⇒ LEFT, nothing of it touched, its card kept
    if (recheck) { const p = await programOf(id, socketPath); if (p !== 'dead') return leave(`its program is no longer proven ended at the retire (${p})`); }
    touched = true;   // THE FIRST TOUCH: from here a leave keeps no card (its program proven ended just above)
    if (adopted) {   // the hub's own attach of it: its session unadopted FIRST (the re-probe hands that step in), then ended by its own handle
      if (onUnadopt) { try { onUnadopt(); } catch { } }
      if (adopted.pty) { try { adopted.pty.kill(); } catch { } }
    }
    // (b) THE WRAPPER FIRST, the master after it is gone: a dtach master removes its own socket as it ends (its reader's find), so a
    // wrapper that outlives the bound must leave the master, and so the socket, as they are
    for (const h of wrapper) PIB.signalIdentity(h.ident, 'SIGTERM', { what: h.what });
    left = await waitGone(wrapper);
    if (left.length) return leave(`${left.join(', ')} still there ${RETIRE_WAIT_MS / 1000} s after its signal`);
    for (const h of masters) PIB.signalIdentity(h.ident, 'SIGTERM', { what: h.what });
    left = await waitGone(masters);
    if (left.length) return leave(`${left.join(', ')} still there ${RETIRE_WAIT_MS / 1000} s after its signal`);
    // (d) only now the socket, the wrapper's files and the meta
    try { fs.unlinkSync(socketPath); } catch {}
    require('./wrapper-files.js').removeWrapperFiles(BUFFERS_DIR, id); // THE ONE LIST (lane human-cli r5): round 4 left this path's .receipts to the 7-day sweep
    deleteSessionMeta(sockFile);
    return { retired: true };
  } catch (e) { return leave(`its retire failed: ${(e && e.message) || e}`); }
}

// THE RE-PROBE (B-92a4): restoreSessions adopts a socket with no answer ALIVE — never retired, never dedup-killed, never
// marked stopped on a non-answer; its card is an ordinary card. After listen, off the loop, the SAME questions are asked
// again — through the hub's starter (starterP, B-323e's remainder): 10 s, then 30 / 60 / 120 / 120 s (≤ 5 tries). alive ⇒ the mark clears; dead ⇒
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
function reprobePending(onlyKeys = null) {   // onlyKeys: the boot's deferred pairs — their groups only, no try of the ladder
  if (reprobing) return reprobing;
  clearTimeout(reprobeTimer); reprobeTimer = null;
  reprobing = reprobePass(onlyKeys).finally(() => { reprobing = null; armReprobe(); });
  return reprobing;
}
async function reprobePass(onlyKeys = null) {
  if (!pendingProbes.size) return { tries: reprobeTries, alive: [], dead: [], duplicate: [], open: [] };
  if (!onlyKeys) reprobeTries++;
  const tally = { tries: reprobeTries, alive: [], dead: [], duplicate: [], open: [] };
  if (!onlyKeys) {   // 1. the sockets' own questions — a groups-only pass (the boot's deferred pairs) asks none
  const own = new Set([...activeSessions.values()].map((s) => s && s.pty && s.pty.pid).filter(Boolean));
  const asks = [];
  for (const [sockFile, p] of [...pendingProbes]) { // 1. is the socket alive — four at a time, like the boot's probes
    if (activeSessions.get(p.id) !== p.session) { pendingProbes.delete(sockFile); continue; } // ended or replaced meanwhile (a Terminate): nothing left to settle
    if (p.q.has('alive')) asks.push(async () => {
      const v = await ownedP(p.socketPath, true, () => { }, own, starterP);
      if (v === true) p.q.delete('alive');
      else if (v === false && activeSessions.get(p.id) === p.session) { retireDeadSocket(sockFile, p.socketPath); unadopt(p.id, p.session); pendingProbes.delete(sockFile); tally.dead.push(sockFile); }
    });
  }
  const drain = async () => { for (let a; (a = asks.shift());) { try { await a(); } catch { } } };
  await Promise.all([drain(), drain(), drain(), drain()]);
  }
  for (const [key, members] of [...pendingGroups]) { // 2. which duplicate wins — once every pending member's socket answered
    if (onlyKeys && !onlyKeys.has(key)) continue;
    const rows = members.map((sockFile) => { let m = null; try { m = readSessionMeta(sockFile); } catch { } return { sockFile, m, p: pendingProbes.get(sockFile) }; }).filter((r) => r.m && ownsItsId(r.m));
    if (rows.some((r) => r.p && r.p.q.has('alive'))) continue;
    let retire = new Set(), kept = [], undecided = false;
    if (rows.some((r) => r.m.host)) {   // L4: two local transports of ONE remote program — the release's rule (their transports' fuser), ended by L1 / L2 only
      const remote = new Map(); let known = true;
      for (const r of rows) { const v = await ownedP(path.join(SOCKETS_DIR, r.sockFile), false, undefined, undefined, starterP); if (v == null) known = false; remote.set(r.sockFile, v); }
      if (!known) continue;
      ({ retire } = dedupWebuiSockets(rows.map(({ sockFile, m }) => ({ sockFile, backend: m.backend || 'claude', host: m.host || 'local', claudeSessionId: m.claudeSessionId, createdAt: m.createdAt || 0, claudeAlive: !!remote.get(sockFile) }))));
    } else {   // L3: each member's program, read again
      const prog = await Promise.all(rows.map(async ({ sockFile, m }) => ({ sockFile, createdAt: m.createdAt || 0, name: m.name || '', backend: m.backend || 'claude', program: await programOf(m.webuiSessionId, path.join(SOCKETS_DIR, sockFile)) })));
      ({ retire, kept } = pairDecision(prog));
      undecided = kept.length > 1 && kept.some((x) => x.program === 'unknown');   // not proven: the kept ones asked again at the cadence; the proven dead ones go now
    }
    if (undecided) pendingGroups.set(key, kept.map((x) => x.sockFile));
    else pendingGroups.delete(key);
    if (kept.length > 1 && !pairsSaid.has(key)) { pairsSaid.add(key); say(pairWords(kept)); }   // kept as a pair (both alive, or one not proven): said once, never again
    const again = new Set();   // its reader's find: a member whose retire LEFT and is still a card is judged again (its pair said then)
    for (const r of rows) {   // ONE retire road for both (a decided pair's losers, an undecided pair's proven-dead members)
      if (!r.p) continue;
      if (!undecided) r.p.q.delete('dedup');
      if (retire.has(r.sockFile)) {
        pendingProbes.delete(r.sockFile);
        const done = await retireDuplicate(r.sockFile, r.p.socketPath, r.p.id, r.m.claudeSessionId, starterP, r.p.session, !r.m.host, () => unadopt(r.p.id, r.p.session), r.m.name ? `the card «${r.m.name}»` : `an unnamed ${r.m.backend || 'claude'} card`);
        if (done && done.retired) tally.duplicate.push(r.sockFile);
        else if (activeSessions.get(r.p.id) === r.p.session) { r.p.q.add('dedup'); pendingProbes.set(r.sockFile, r.p); again.add(r.sockFile); }
      }
    }
    if (again.size) pendingGroups.set(key, [...new Set([...(pendingGroups.get(key) || kept.map((x) => x.sockFile)), ...again])]);
  }
  if (onlyKeys) { for (const [sockFile, p] of [...pendingProbes]) if (!p.q.size) pendingProbes.delete(sockFile); return tally; }   // the boot's own retire of its pairs' proven-ended members: no pass line, no try counted; what it answered leaves the list (its reader's find)
  for (const [sockFile, p] of [...pendingProbes]) { if (p.q.size) tally.open.push(sockFile); else { pendingProbes.delete(sockFile); tally.alive.push(sockFile); } }
  say(`re-probe ${reprobeTries}/${REPROBE_MS.length}: ${tally.alive.length} alive, ${tally.dead.length} dead (retired), ${tally.duplicate.length} duplicate (retired), ${tally.open.length} still unanswered`);
  sayDead(` (re-probe ${reprobeTries})`); // the same road as the boot's: what its dead ones became
  if (tally.open.length && reprobeTries === REPROBE_MS.length) say(`re-probe gave up after ${reprobeTries} tries: ${tally.open.join(', ')} kept alive — a non-answer is never a kill`);
  return tally;
}

// B-cd4b: THE SURVIVORS' ATTACHES IN BOUNDED BATCHES. Each attach starts a pty (a fork of the hub's whole memory) and wires its
// stream consumer: a hub restart with 80 survivors held its listen turn 527 ms in ONE synchronous pass (the B-cd4b measure, the
// first test machine). Every survivor is in the live set when restoreSessions returns (the listen callback's later steps and an
// attach read it); its ATTACH runs here — a small restore (one batch) at once, as it always was; a bigger one ATTACH_BATCH a
// turn, the FIRST in a turn after the registration's own (the round's follow: the registration and its first batch shared the
// listen turn — 275 ms at 80 survivors on the first test machine), each batch in a loop turn of its own (src/server/loop-turns.js:
// after a timers phase, one job a turn, the listen step's turns in the same queue — a batch never shares a turn with them; the
// sign-in page and every request answer between two batches, once the listen step's last turn has run).
// A SURVIVOR USED BEFORE ITS BATCH IS ATTACHED AT ONCE: the doors read `session.pty` and refused a pty-less one («not a live chat
// session» — the page's resent message, an agent's delivery: dropped), so each asks `session._attachPending()` first — the page's
// socket messages (src/ws-handler.js: its input, an interrupt, a resize, an attach) and every chat send
// (src/server/user-input.js send). A batch skips one attached that way, or one that ended or was replaced meanwhile. Every
// restore attach takes the LOCAL road (`restore: true`), as the one-pass restore did (it ran before the device link was up): a
// link that comes up mid-drain never sends the later survivors down the daemon road. An attach that throws (a refused fork) is
// said and STAYS PENDING: its next use attaches it, and so do retries 2, 10 and 30 s on — a throw no longer stops the others.
// ATTACH_BATCH = 8: the measured attach is ~1.1 ms of JavaScript a survivor plus its fork (localAttach 88 ms over 80) — eight a
// turn stays an order of magnitude under the 250 ms boot law; the restore's own timing is said once, at the end.
const ATTACH_BATCH = 8, ATTACH_RETRY_MS = [2000, 10000, 30000];
const REGISTER_BATCH = 32;   // B-cd4b unit 3: survivors registered a turn (~42 ms at the first test machine's 1.3 ms a survivor)
const { turn: loopTurn } = require('./loop-turns.js');
function drainSurvivorAttaches(queue, { tRestore, tBuilt, regTurns = null }) {
  const total = queue.length;
  if (!total) return;
  let batches = 0, longest = 0, attachMs = 0, used = 0, caught = 0;
  const release = (entry) => { entry.done = true; if (entry.timer) { clearTimeout(entry.timer); entry.timer = null; } if (entry[2]._attachPending === entry.pend) entry[2]._attachPending = null; };
  const attach = (entry, { use = false } = {}) => {
    const [id, socketPath, session] = entry;
    if (entry.done) return;
    if (activeSessions.get(id) !== session || session.pty) { release(entry); return; }   // ended or replaced, or attached by another road
    const cu = restoreCatchUp(session._restoreBuf);   // the SAME turn as the attach below (the round's law: one turn, as at the release)
    if (cu && cu.skipped) console.warn(`[boot-restore] ${session.name || id}: what it wrote since the restore's read is not caught up — ${cu.skipped}`);
    // B-cd4b (the wrapper's hold): its fence reads on from where THIS catch-up's read ended (or the registration's, nothing written since)
    // (r1236: a catch-up that fed text reads on from ITS end, never the registration's — the lines it fed are never fed again)
    const rb0 = session._restoreBuf, fence = rb0 && rb0.fence && !(cu && cu.skipped) && !(cu && cu.text && !cu.rb) ? { rb: cu && cu.text ? cu.rb : rb0, read: restoreCatchUp } : null;
    try {
      attachToDtach(id, socketPath, session, { restore: true, catchUp: cu && cu.text ? cu : null, fence });
      release(entry);
      session._restoreBuf = null; session._attachFailed = null;
      if (cu && cu.text) caught++;
      if (use) used++;
    } catch (e) {
      const why = String((e && e.message) || e).slice(0, 200);
      session._attachFailed = why;   // the next chat send says it in these words (src/server/user-input.js), never «not a live chat session»
      // ONE retry chain (round wed0m8jzl): a failed USE never arms a second beside the one already armed
      if (entry.timer) { console.warn(`[boot-restore] ${session.name || id}: the attach failed (${why}) — it stays pending: its next use attaches it, and its retry is armed already`); return; }
      const wait = ATTACH_RETRY_MS[entry.tries];
      console.warn(`[boot-restore] ${session.name || id}: the attach failed (${why}) — it stays pending: its next use attaches it${wait ? `, or a retry in ${wait / 1000} s` : ' (its retries are spent)'}`);
      if (wait) { entry.tries++; entry.timer = setTimeout(() => { entry.timer = null; attach(entry); }, wait); if (entry.timer.unref) entry.timer.unref(); return; }
      // the retries spent: the PERSON is told at the conversation (the card road a dead bridge's catch-up already has) — ONCE
      if (entry.carded) return;
      entry.carded = true;
      try { require('../normalizers').feedPeerCard(session, { fromName: 'VibeSpace', kind: 'notification', text: `This conversation could not be reconnected after the restart (${why}). It keeps running; sending a message tries again.` }); } catch { }
    }
  };
  for (const entry of queue) { entry.tries = 0; entry.done = false; entry.timer = null; entry.carded = false; entry.pend = () => attach(entry, { use: true }); entry[2]._attachPending = entry.pend; }
  const one = () => {
    const t0 = performance.now();
    for (const entry of queue.splice(0, ATTACH_BATCH)) attach(entry);
    const ms = performance.now() - t0; batches++; attachMs += ms; if (ms > longest) longest = ms;
    if (queue.length) { loopTurn(one); return; }
    console.log(`[boot-restore] ${total} survivor(s): registered in ${Math.round(tBuilt - tRestore)} ms; attached in ${batches} batch(es) of ≤ ${ATTACH_BATCH} (${Math.round(attachMs)} ms, the longest batch ${Math.round(longest)} ms)${used ? `; ${used} attached at their first use` : ''}${caught ? `; ${caught} caught up what they wrote since the read` : ''}${regTurns && regTurns.n > 1 ? `; registered in ${regTurns.n} turns of ≤ ${REGISTER_BATCH} (the longest ${Math.round(regTurns.longest)} ms)` : ''}`);
  };
  if (total <= ATTACH_BATCH) one(); else loopTurn(one);   // the round's follow: a big restore's first batch leaves the registration's turn
}

function restoreSessions() {
  ensureDir(SOCKETS_DIR);
  ensureDir(BUFFERS_DIR);
  const P = probed || { alive: new Map(), remoteAlive: new Map(), programs: new Map(), unanswered: new Map() }; probed = null; probing = null; // the probes answer THIS restore only (none ran: every socket is unanswered)
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
  // B-b2d3 STEP 2 (主开发 r5028 / r5032): a LOCAL pair is decided by each socket's own PROGRAM (programOf, read by the probe — P.programs;
  // one it did not read is unknown), never by the live-conversation fd scan (THE HONEST LIMIT measured it: a live claude appends and
  // closes its transcript, so the scan answered «nobody» for every pair and the OLDER socket's living program was ended). L3: a member
  // proven dead retires; all dead — the newest is kept; every other pair keeps BOTH, said once as a pair (two cards of one
  // conversation), nothing signalled; one not proven waits for the re-probe. The accurate «which of two living programs writes it» (the
  // CLI's own registry) is not asked: no ending depends on it (L5).
  // REMOTE pairs (L4, audit 2.192.0/B-82ea): the /proc view cannot see a claude ON THE HOST — the LOCAL transport's liveness decides
  // (its dtach socket has an owner = the ssh / agentd pipe survived the restart), as before; the older transport is ended by L1 / L2.
  const remoteSockAlive = new Set();
  const remoteUnknown = new Set();
  for (const { sockFile, m } of dedupMetas) {
    if (!m.host) continue;
    const v = P.remoteAlive.get(sockFile);
    if (v === true) remoteSockAlive.add(sockFile); else if (v == null) remoteUnknown.add(sockFile); // B-92a4: no answer ⇒ the re-probe asks
  }
  // B-92a4: a duplicate set whose liveness has no answer (a remote member's fuser; a local member's program not proven) is UNDECIDED —
  // none of it retires now but a member proven dead; the rest is adopted probe-pending and the re-probe decides it again.
  const groupOf = new Map();
  for (const { sockFile, m } of dedupMetas) { const k = dedupKey(m); if (!groupOf.has(k)) groupOf.set(k, []); groupOf.get(k).push(sockFile); }
  const undecided = new Set(), keptPairs = [], deferred = new Set(), deferredSocks = new Set();   // deferred: a LOCAL pair with a member proven ended (below)
  for (const [k, members] of groupOf) {
    const rows = members.map((sf) => dedupMetas.find((x) => x.sockFile === sf)).filter(Boolean);
    if (rows.length < 2 || rows.some((r) => r.m.host) || !rows[0].m.claudeSessionId) continue;   // R5: a harness with no id here is never a pair (unchanged)
    const d = pairDecision(rows.map(({ sockFile, m }) => ({ sockFile, createdAt: m.createdAt || 0, name: m.name || '', backend: m.backend || 'claude', program: P.programs.get(sockFile) || 'unknown' })));
    // B-b2d3's births follow (its reader's find): such a pair is ADOPTED, every member a card for the moment of its retire, and retired
    // on the re-probe's road at once (its groups only, no try of the ladder): a retire that leaves — its program alive again, a wait past
    // its bound — keeps the card, never a living program the person cannot see
    if (d.retire.size) deferred.add(k);
    if (d.kept.length > 1) { if (d.kept.some((x) => x.program === 'unknown')) undecided.add(k); keptPairs.push([k, d.kept]); }
  }
  for (const { sockFile, m } of dedupMetas) if (m.host && groupOf.get(dedupKey(m)).length > 1 && remoteUnknown.has(sockFile)) undecided.add(dedupKey(m));
  const { retire: remoteRetire } = dedupWebuiSockets(dedupMetas.filter(({ m }) => m.host && !undecided.has(dedupKey(m))).map(({ sockFile, m }) => ({
    sockFile, backend: m.backend || 'claude', host: m.host || 'local',
    claudeSessionId: m.claudeSessionId, createdAt: m.createdAt || 0,
    claudeAlive: remoteSockAlive.has(sockFile),
  })));
  const retireSockets = new Set(remoteRetire);   // L4: a remote pair's older transport retires at the start (the release's road)
  for (const [k, kept] of keptPairs) if (!pairsSaid.has(k)) { pairsSaid.add(k); say(pairWords(kept)); }   // two cards a person ends one of — said once (an unproven pair is asked again, never said again)

  const attachQueue = [], tRestore = performance.now();   // B-cd4b: every survivor in the live set at once, its attach queued
  const regTurns = { n: 0, longest: 0 };   // B-cd4b unit 3: the registration's turns (said in the restore's line)
  // r1487 (box row 54: a one-pass restore wrote back 0 of 80 billing sources): EACH SURVIVOR'S BILLING SOURCE IS TAKEN FROM THE
  // REGISTRATION'S OWN READ, at the registration (PURE lastIndexOf over the ≤ 500 KB ring already in hand), and the backfill writes
  // THAT. It used to read `s.buffer` 3 s later, after the attach — and the wrapper's hold feeds a survivor's held bytes into that
  // buffer when its fence comes back or at its 3 s bound; on the ONE-PASS road (every restore of ATTACH_BATCH survivors or fewer)
  // those 3 s timers are armed inside the attach loop, BEFORE finish() arms the backfill's, so they fire first, and the consumer's
  // cut (750 K → 500 K) can leave the buffer without the ring's last init. Nothing fed after the attach reaches this map
  const billingRead = new Map();   // session → the LAST `apiKeySource` of the ring this restore read for it
  function* registerEach() {   // B-cd4b unit 3: ONE survivor a step — the batches below take REGISTER_BATCH of them a turn
  for (const sockFile of sockets) {
    const socketPath = path.join(SOCKETS_DIR, sockFile);
    try { fs.statSync(socketPath); } catch { continue; }

    // Verify socket is live — the probes' answer (fuser, else pgrep: asked before listen, as children). NO ANSWER
    // (B-92a4) is not "dead": the socket is adopted ALIVE, probe-pending, and the re-probe after listen settles it.
    const open = new Set();
    let socketAlive = P.alive.get(sockFile);
    if (socketAlive == null) { open.add('alive'); socketAlive = true; }

    if (!socketAlive) { retireDeadSocket(sockFile, socketPath); yield; continue; }   // unit 3's follow (r1050): a retire is real work (a sync meta write, a rename) — counted in its batch

    const meta = readSessionMeta(sockFile);
    // r3137 (2): a live socket whose record is UNREAD is NOT re-adopted under a new id (its pool link, its attach config and its
    // browser would be swept as another's): nothing of it is removed, and it is adopted at the next start once it reads.
    // r3245 (1): a person sees and stops what runs — it is LISTED under its SOCKET's name (never a minted id) with the words that its
    // record could not be read; it is never attached (an attach is refused by name: ws-handler), and it carries NO `sockName`, so no
    // writer reaches the record through it (a rename's whole write would restate the torn record from a stub); only its Stop names
    // its socket and its record (ws-handler endSessionBody: the socket's process ended, the record's removal remembered for its read)
    if (require('./session-meta-verdict.js').isUnread(meta)) {
      const listed = sessionFromMeta({ name: sockFile }, { mode: 'terminal', pty: null, name: sockFile, buffer: '', _remoteState: { state: 'record-unread', at: Date.now() } });   // the list row's state: the card's chip says it
      listed._metaUnread = { sock: sockFile, socketPath }; listed._webuiId = sockFile;
      activeSessions.set(sockFile, listed);
      console.log(`  ⏸ ${sockFile}: its record could not be read — LISTED under its socket's name (Stop ends it; never attached, no new id, nothing of it removed; adopted at the next start once it reads)`); yield; continue;
    }
    const id = meta.webuiSessionId || ('sess-' + (++sessionCounterRef.value) + '-' + Date.now());
    persistNoStart(sockFile, meta, { readSessionMeta, writeSessionMeta }); // r5: before any writer persists the boot instant as its createdAt

    // stale duplicate of a conversation another socket owns — do NOT adopt (two
    // cards); retire the husk so it can't double-write the JSONL (retireDuplicate).
    // B-92a4: never on a non-answer — an undecided set, or an unanswered socket the dedup would retire, waits probe-pending.
    const dk = ownsItsId(meta) ? dedupKey(meta) : null;
    if (dk && (((undecided.has(dk) || deferred.has(dk)) && !retireSockets.has(sockFile)) || (open.size && retireSockets.has(sockFile)))) { if (deferred.has(dk)) deferredSocks.add(sockFile); open.add('dedup'); pendingGroups.set(dk, (groupOf.get(dk) || [sockFile]).filter((sf) => !retireSockets.has(sf) || P.unanswered.has(sf))); }   // one list for every member (its reader's find: each member wrote its own)
    else if (retireSockets.has(sockFile)) { retireDuplicate(sockFile, socketPath, id, meta.claudeSessionId, undefined, null, !meta.host); yield; continue; }   // B-b2d3 step 2: its own ordered road (L1, L2), not awaited by the restore   // counted, as a dead socket's retire

    // Detect mode and streaming state from wrapper metadata
    let sessionMode = meta.mode || 'terminal';
    let wrapperStreaming = false;
    let wrapperGoal = null, wrapperGoalStatus = null, wrapperGoalElapsed = 0, wrapperGoalTokens = 0;
    let bareRemote = false;
    let restoredRemote = null;
    let wrapperAgentTasks = null;
    let wrapperObs = null; // lane conversation-facts: the wrapper's sidecar as read (its observations + its pid), judged at adoption
    let wrapperHeld = null;
    let wrapperTodos = null;   // unit 3's follow (r1050): block-scoped — a sidecar with no todos shows none, never the PREVIOUS survivor's (a `var` carried it)
    const wrapperFiles = require('./wrapper-files.js').resolveWrapperFiles(BUFFERS_DIR, id, path.join(SOCKETS_DIR, sockFile));
    restoredSidecars.set(id, wrapperFiles.sidecar); // the lock capture's pid witness (the wrapper's own pid)
    try {
      const wrapperMeta = JSON.parse(fs.readFileSync(wrapperFiles.sidecar, 'utf-8'));
      if (wrapperMeta.mode === 'chat') sessionMode = 'chat';
      if (wrapperMeta.streaming != null) wrapperStreaming = !!wrapperMeta.streaming;
      wrapperObs = wrapperMeta;
      wrapperHeld = Array.isArray(wrapperMeta.queue) ? wrapperMeta.queue.length : null; // the prompts its queue holds, as its sidecar last said
      if (wrapperMeta.goal) { wrapperGoal = wrapperMeta.goal; wrapperGoalStatus = wrapperMeta.goalStatus || null; wrapperGoalElapsed = wrapperMeta.goalElapsed || 0; wrapperGoalTokens = wrapperMeta.goalTokensUsed || 0; }
      // Agent's live todo list survives the restart (2.219.0 audit — the
      // card's progress pill/Steps went blank until the next TodoWrite)
      if (Array.isArray(wrapperMeta.todos) && wrapperMeta.todos.length) {
        const done = wrapperMeta.todos.filter((t) => t?.status === 'completed').length;
        const cur = wrapperMeta.todos.find((t) => t?.status === 'in_progress');
        wrapperTodos = { done, total: wrapperMeta.todos.length, current: cur ? String(cur.content || cur.activeForm || cur.step || '').slice(0, 140) : null };
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

    let savedBuffer = '', restoreBuf = null;
    // B-cd4b (round wzvgb5033): where this read ENDS — the attach that follows in a later batch catches up from it (restoreCatchUp)
    try { const raw = fs.readFileSync(wrapperFiles.buf); savedBuffer = raw.toString('utf-8'); restoreBuf = restoreBufOf(wrapperFiles.buf, raw); } catch {}
    // B-cd4b (the wrapper's hold): a wrapper that writes every said line before saying it answers a FENCE — its attach then reads what
    // it said between the catch-up and the connect (session-stdout setupSessionPty `fence`); an older wrapper is attached as before
    if (restoreBuf && wrapperObs && wrapperObs.caps && wrapperObs.caps.fence === SJ.FENCE_VERSION) restoreBuf.fence = true;
    // r1418 (2): a CHAT record whose sidecar could not be read (or parsed) may be a journaled wrapper, whose file is APPENDED — a read
    // can land in the middle of a line. Its catch-up takes the SAFE SHAPE, whole lines: a torn tail is never fed, so a line said after
    // the connect never lands glued to its head. No fence follows (a wrapper we could not read is never asked one)
    else if (restoreBuf && !wrapperObs && sessionMode === 'chat') restoreBuf.wholeLines = true;

    PinRecord.restorePin(path.dirname(META_DIR), meta, sockFile, pinAtBoot(sockFile));   // B-526c unit 2 (r1070): the record decides, written back into the meta
    const session = sessionFromMeta(meta, { // transport-only + per-path facts (win over the shared ones)
      mode: sessionMode,
      pty: null,
      host: meta.host || null,
      _bareRemote: bareRemote,
      keeperSid: meta.keeperSid || null,
      _agentdSession: !!meta.agentdSession, // transport mechanism (2.219.0 — kill branch correctness)
      _cwdRecreated: !!meta.cwdRecreated, // B-7812: undelivered recreated-cwd agent notice survives restarts
      _remoteState: restoredRemote,
      _todos: wrapperTodos || null,
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
      _lockedContext: require('../lock-context.js').lockContextOf(meta.lockedContext),   // B-6c55
      _spawnContext: require('../lock-context.js').lockContextOf(meta.spawnContext),     // B-6c55: what the spawn commanded
      _settingsFileGoverns: Array.isArray(meta.settingsFileGoverns) && meta.settingsFileGoverns.some((k) => typeof k === 'string') ? [...SFW.GOVERNED_KINDS] : [],   // B-8dcf item two — a governing file governs EVERY kind (batch 21's cure 3: a 2.369.410 meta holds only the kinds that stood down at its start)
      _initialGroupId: meta.taskId || null, // group spawned into; belonging is live-derived, this only covers the pre-bind window
      _initialGroupIds: spawnGroupIds(meta), // lane new-session-form: every group it was spawned into (meta `taskIds`; an older meta's one `taskId`)
      _heldPoolMember: typeof meta.heldPoolMember === 'string' ? meta.heldPoolMember : null, // the pool member the surviving (non-hot) process holds (design-reset-credits r2)
      _poolFallback: poolFallbackOf(meta), // B-d578 F2: the record of a move onto the pool's fallback provider (its first member and model) — the surviving process stays on the fallback
      _poolFallbackDwell: Number(meta.poolFallbackDwell) || null, // B-d578 F3a: a conversation the pool moved back is not moved onto the fallback again for one dwell
      _heldPoolOrigin: heldOriginOf(meta), // r4: a ledger-derived stamp stays 'ledger'; a meta that never recorded its start cannot be answered by the ledger
      _authAtSpawn: meta.authAtSpawn || null,
      _apiKeySource: meta.apiKeySource || null, // CLI-confirmed auth (init record); backfilled from the buffer below when absent
      sockName: sockFile,
      socketPath,
      buffer: savedBuffer,
      // the harness's OWN last word on record in that ring (lane parked-ask-stall, a fleet pod): a turn
      // parked on a permission ask restores as `requires_action` — waiting on the user, the session list's
      // 'waiting' dot, the attach's turn state — not a bare sidecar `streaming:true` that every reader took
      // for "thinking"; and (B-ba09) the streaming FLAG is that word's too — an idle ring restores NOT
      // streaming whatever the derived sidecar says (the sidecar only for a CLI that never says a word)
      ...restoredStreaming(savedBuffer, wrapperStreaming),
      _goal: wrapperGoal,
      _goalStatus: wrapperGoalStatus,
      _goalElapsed: wrapperGoalElapsed,
      _goalTokensUsed: wrapperGoalTokens,
    });
    // the copies' kept pictures (lane claude-steer-inject r6): read OFF the loop, bounded; the first history read awaits it
    if (savedBuffer.includes('"webui_copy"')) session._keptLoad = require('../kept-copies.js').preload(BUFFERS_DIR, id, savedBuffer).then((m) => { session._keptFiles = m; }, () => { session._keptFiles = new Map(); });
    // Create normalizer for chat sessions (populated on first attach from JSONL + buffer)
    if (sessionMode === 'chat') {
      session._normalizer = createMessageManager(session.backend || 'claude', id);
      session._normEpoch = Date.now();
      // lane conversation-facts (majordomo piece 2): the facts a restart cannot read back come from the wrapper that kept them
      // (src/conversation-facts.js); a sidecar without them = an older wrapper — unknown with its reason, never guessed
      {
        const CF = require('../conversation-facts.js');
        // the observations are accepted only from the wrapper this boot adopts, PROVEN FROM THAT PROCESS'S STAT ALONE (proc-identity
        // birthReading): the pid and the birth its sidecar names against that process's state and start ticks, in ONE clock (B-03af:
        // never this hub's time origin, which a slow start stamps late) — never its command line (a wrapper stuck in the
        // uninterruptible state can hold that read for ever). Not proven ⇒ not from its start — unknown, said.
        const PI = require('../proc-identity.js');
        const p = wrapperObs && Number.isInteger(wrapperObs.pid) ? wrapperObs.pid : 0;
        const proof = CF.adoptionProof(wrapperObs, p > 1 ? PI.birthReading(p, { start: wrapperObs.pidStart, boot: wrapperObs.pidBoot }) : null);
        session._convFacts = CF.factsAtAdoption(wrapperObs, proof.pid, proof.why);
        if (Number.isInteger(wrapperHeld)) session._convFacts.heldAtBoot = wrapperHeld;
      }
      // 2.369.402: the conversation's cost fold — the kept fact (meta.costKept) resumed over the results the buffer still holds
      // (a trimmed head lost the earlier processes; the kept fact did not) — src/cost-segments.js
      if (typeof session._normalizer.seedCost === 'function') { try { session._normalizer.seedCost(costSeedOf(meta.costKept, savedBuffer)); } catch { } }
      session._normalizer.onOp((op) => {
        broadcastToSession(session, id, { type: 'msg', sessionId: id, ...op });
      });
    }
    session._restoreBuf = restoreBuf;   // B-cd4b: the read's end, for its attach's catch-up (cleared once attached)
    if (!session._apiKeySource && savedBuffer) { const src = lastApiKeySource(savedBuffer); if (src) billingRead.set(session, src); }   // r1487: read here, written by the backfill
    activeSessions.set(id, session);
    require('./sent-record.js').restoredFor(session);   // B-9a2e part 2: its id was reported before the restart (unless it may still change)
    session._webuiId = id; // per-session pool link key (plan C) — the id the session is registered under
    session._spawnModel = meta.spawnModel || null; session._pickedModel = meta.pickedModel || null; session._pickedModelAt = meta.pickedModelAt || 0; Object.assign(session, require('./model-ask.js').hydratedFacts(meta)); session._servedViaFallback = restoredFallback(meta); // plan C model ladder survives restarts — and so does the classifier reroute (r3 §7)
    session._msgReachability = meta.msgReachability || null; // Channels v1 per-session reach override survives restarts
    session._lastRequestAt = Number(meta.lastRequestAt) || undefined; // lane cache-warmth-tiles r1a′: the last model request survives a restart (the prompt cache does)
    session._lastRequestMember = (typeof meta.lastRequestMember === 'string' && meta.lastRequestMember) || null; // r3: and the member that served it (where the cache lives)
    session._taskRecords = (meta.taskRecords && typeof meta.taskRecords === 'object') ? meta.taskRecords : null; // 2.369.140: the live-only task records survive the restart
    session._artifacts = (meta.artifacts && typeof meta.artifacts === 'object') ? meta.artifacts : null; // lane artifacts-model: the deliverable rows (the user's saves live only here) survive the restart
    session._helperAskedAt = (meta.helperAskedAt && typeof meta.helperAskedAt === 'object') ? meta.helperAskedAt : null; // verify r3: each waiting helper ask's first-seen instant — the 60 s inbox clock survives the restart
    attachQueue.push([id, socketPath, session]);   // B-cd4b: its pty attach in the bounded batches below (it is in the live set now)
    if (open.size) pendingProbes.set(sockFile, { id, session, socketPath, q: open });

    console.log(`  ✓ Reconnected: ${session.name} (${session.cwd})`);
    yield;
  }
  }
  const finish = () => {   // B-cd4b unit 3: after the LAST registration batch (every survivor in the live set): the attaches, the said lines, the timers
  drainSurvivorAttaches(attachQueue, { tRestore, tBuilt: performance.now(), regTurns });
  sayDead();
  if (pendingProbes.size) {
    const asked = [...pendingProbes].filter(([sockFile]) => !deferredSocks.has(sockFile));   // a deferred pair's members were answered: not «no answer»
    const named = asked.slice(0, 3).map(([sockFile]) => `${P.unanswered.get(sockFile) || 'not asked'} ${sockFile}`).join(', ');
    if (asked.length) say(`${asked.length} session(s) adopted probe-pending — no answer (${named}${asked.length > 3 ? `, +${asked.length - 3}` : ''}); asked again from ${REPROBE_MS[0] / 1000} s, never retired on a non-answer`);
    if (deferred.size) reprobePending(deferred).catch((e) => console.warn('[boot-restore] the retire of its pairs\' proven-ended members failed:', e.message));   // its groups only; the ladder armed after it
    else armReprobe();
  }

  // Populate webuiPids cache after all sessions are restored
  refreshWebuiPids();

  // Backfill billing identity for sessions restored WITHOUT a recorded
  // apiKeySource (spawned before tracking): chat sessions carry the init
  // record in their buffer; terminal sessions get a /proc env probe (env
  // key = definite API). One broadcast when done.
  // B-cd4b: NEVER A PROGRAM, NO READ — the LAST `apiKeySource":"…"` of the ring THIS RESTORE'S REGISTRATION read for the
  // conversation (r1487: taken at the registration, `billingRead` — nothing fed into the buffer after the attach takes it away; the
  // file resolveWrapperFiles named, the counter-collision case included — never `${id}.buf` by name). It used to
  // fork `sh -c grep … | tail -1` for EVERY restored session in ONE synchronous pass: at 80 survivors that was 80 forks of the
  // hub's whole memory in one turn — the loop held 1.6 s (the B-cd4b measure, the first test machine; the owner's hub is several
  // times that memory, and restarts at every update). A buffer is the wrapper's ≤ 500 KB ring: its lastIndexOf is well under a
  // millisecond. Until a session's value arrives, its one reader (src/harnesses/claude.js billingIdentity → the page's billing
  // chip) shows the spawn-time guess marked `guessed`, or «unknown» — never a confirmed source it did not read
  // A conversation this restore did not read (an R6 pipe re-open, a re-adopted remote keeper session) falls back to the copy it
  // holds (`s.buffer`); one with an EMPTY copy stays unset until its live stream says its init (the chip: guessed / unknown meanwhile)
  setTimeout(() => {
    let changed = false;
    for (const [, s] of activeSessions) {
      if (!s.backend || capsOf(s.backend).streamProtocol !== 'stream-json' || s._apiKeySource) continue;   // the live stream said it (its own word wins)
      // r1487: the registration's own read FIRST — whatever was fed into the buffer after the attach cannot take it away; a session
      // this restore did not read (an R6 pipe re-open, a re-adopted remote keeper session) falls back to the copy it holds
      const src = billingRead.has(s) ? billingRead.get(s) : lastApiKeySource(typeof s.buffer === 'string' ? s.buffer : '');
      if (src) {
        s._apiKeySource = src;
        if (s.sockName) { try { writeSessionMeta(s.sockName, { ...(readSessionMeta(s.sockName) || {}), apiKeySource: src }); } catch { } }
        changed = true;
      } else if (!s._authAtSpawn && s._childPid) {
        // terminal session: env probe (only the env-key case is provable)
        try {
          const env = fs.readFileSync(`/proc/${s._childPid}/environ`, 'utf-8');
          if (env.includes('ANTHROPIC_API_KEY=')) { s._apiKeySource = 'ANTHROPIC_API_KEY'; changed = true; }
        } catch { }
      }
    }
    billingRead.clear();
    if (changed) broadcastActiveSessions();
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
            require('./sent-record.js').adoptFor(s);   // B-9a2e part 2: an id report — a send made before the thread was matched follows it
            if (matched.name) s.name = matched.name;
            if (matched.cwd) s.cwd = matched.cwd;
            if (s.backendSessionId && s.sockName) {
              try { writeSessionMeta(s.sockName, { ...(readSessionMeta(s.sockName) || {}), name: s.name, cwd: s.cwd, backendSessionId: s.backendSessionId, claudeSessionId: null }, { durable: true }); } catch {}
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
  };
  // B-cd4b unit 3 (主开发 r688 / r844): THE REGISTRATION IN BATCHES — its pass grows with the count (~1.3 ms a survivor on the first
  // test machine: 105 ms at 80, the 250 ms law alone near 190). A restore of up to REGISTER_BATCH survivors registers in this one
  // turn, as it always did; a bigger one registers REGISTER_BATCH a turn, each batch AHEAD of every other queued turn
  // (src/server/loop-turns.js `first`): the listen step's rest ('listen-rest', asked by server.js right after this returns) runs only
  // after the LAST batch, and the front holds every new connection until it has run (src/server/tls.js turn) — nothing asks for a
  // survivor before the live set is whole. The attaches, the said lines and the timers follow the last batch (finish). Only the
  // FIRST batch is in the live set when restoreSessions returns; the rest arrive before the listen step's rest. A batch counts every
  // survivor that did real work — a retired dead or duplicate socket too. Between two batches the hub's one-second digest may
  // broadcast a partial roster: nothing reads it (the front holds every page until the step's last turn). Past the front's 5 s
  // bound (thousands of survivors: about 3 800 at 32 a turn of ~42 ms) the hold lets go between two batches — the live set is
  // not yet whole then (src/server/tls.js says the same).
  const it = registerEach();
  if (sockets.length <= REGISTER_BATCH) { while (!it.next().done) { } regTurns.n = 1; finish(); return; }
  const oneBatch = () => {
    const t0 = performance.now(); let n = 0, done = false;
    while (n < REGISTER_BATCH) { if (it.next().done) { done = true; break; } n++; }
    const ms = performance.now() - t0; regTurns.n++; if (ms > regTurns.longest) regTurns.longest = ms;
    if (done) finish(); else loopTurn(() => step('restore-batch', oneBatch), { first: true });   // the later batches named in the boot trace
  };
  oneBatch();
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
    PinRecord.restorePin(path.dirname(META_DIR), meta, sockFile, pinAtBoot(sockFile));   // B-526c unit 2 (r1070): the record decides, written back into the meta
    const session = sessionFromMeta(meta, { // transport-only + per-path facts (win over the shared ones)
      mode: 'chat', backend: meta.backend || 'claude',
      name: meta.name || 'Session', sockName: sockFile,
      buffer: '', taskId: meta.taskId || null,
      _heldPoolMember: typeof meta.heldPoolMember === 'string' ? meta.heldPoolMember : null, // design-reset-credits r2: the member the surviving pipe process holds
      _poolFallback: poolFallbackOf(meta), // B-d578 F2: the record of a move onto the pool's fallback provider
      _poolFallbackDwell: Number(meta.poolFallbackDwell) || null, // B-d578 F3a: the dwell after a move back
      _heldPoolOrigin: heldOriginOf(meta), // r4: a ledger-derived stamp stays 'ledger'; a meta that never recorded its start cannot be answered by the ledger
      backendSessionId: meta.claudeSessionId || meta.backendSessionId || null,
      _forkRequested: restoredForkPending(meta), // a pending fork re-opened by the daemon still adopts its own id (parser or lock capture) — round 3
      agentdSession: true, keeperSid: id, agentdPipe: true,
      _spawnModel: meta.spawnModel || null, _pickedModel: meta.pickedModel || null, _pickedModelAt: meta.pickedModelAt || 0, ...require('./model-ask.js').hydratedFacts(meta),
      _servedViaFallback: restoredFallback(meta), // the classifier reroute survives a restart (r3 §7)
      _lastRequestAt: Number(meta.lastRequestAt) || undefined, // lane cache-warmth-tiles r1a′: the last model request survives a restart
      _lastRequestMember: (typeof meta.lastRequestMember === 'string' && meta.lastRequestMember) || null, // r3: and the member that served it
      _msgReachability: meta.msgReachability || null,
    });
    hosts.device(null).then(async (dm) => {
      let offset = 0;
      try { offset = fs.statSync(path.join(BUFFERS_DIR, id + '.buf')).size; } catch { }
      const h = await dm.openPipeSession({ sid: id, offset });
      // the SAME duck as ws-create's R6 create path (it was a verbatim one-slot
      // twin that dropped the liveness stamp — B-ae4b)
      const shim = pipePtyShim(h);
      activeSessions.set(id, session); oweRestoredPin(session);
      require('./sent-record.js').restoredFor(session);   // B-9a2e part 2: its id was reported before the restart (unless it may still change)
      session._webuiId = id;
      setupSessionPty(session, id, shim);
      broadcastActiveSessions();   // lane human-cli (test-architecture §104): a re-opened pipe session reaches the list's ONE notify point — the web and the person's index learn it now, not at the next unrelated broadcast
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
  await require('./agent-listener.js').ready(); // lane lg-remote-hardening (D8b): a re-adopted session's -R ends at the door, never the hub's port for its life
  let files = [];
  try { files = fs.readdirSync(META_DIR).filter((f) => f.endsWith('.json.orphan')); } catch { return; }
  if (!files.length) return;
  // the B-f276 remainder's cure (主开发 23:20Z, its audit): while hosts.json is HELD no orphan's machine can be named — its one caller
  // (server.js, the boot's 8 s timer) WAITS for the read (the get threw here: the boot's one pass ended, and a later resume killed
  // the still-running remote agent it would adopt); a pass run while held anyway adopts nothing
  if (hosts.held && hosts.held()) return;
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
    const sshArgs = [...hosts.sshArgs(h, rport ? { reverse: `${rport}:127.0.0.1:${require('./agent-listener.js').tunnelPort(PORT, id)}` } : {}), '-T', '--', inner]; // lane lg-remote-hardening (D8b): the agent door
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
      readoptEnv[HANDED_MARK] = markOf(handedNames(readoptEnv, agentEnv()));   // B-ba47's follow-up (主开发 r979): the mark = what the re-adopt handed
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
      _lockedContext: require('../lock-context.js').lockContextOf(meta.lockedContext),   // B-6c55
      _spawnContext: require('../lock-context.js').lockContextOf(meta.spawnContext),     // B-6c55: what the spawn commanded
      _settingsFileGoverns: Array.isArray(meta.settingsFileGoverns) && meta.settingsFileGoverns.some((k) => typeof k === 'string') ? [...SFW.GOVERNED_KINDS] : [],   // B-8dcf item two — a governing file governs EVERY kind (batch 21's cure 3: a 2.369.410 meta holds only the kinds that stood down at its start)
      _initialGroupId: meta.taskId || null,
      _initialGroupIds: spawnGroupIds(meta),
      _remotePort: rport,
      sockName, socketPath, buffer: '',
    });
    session._normalizer = createMessageManager('claude', id);
    session._normEpoch = Date.now();
    session._convFacts = require('../conversation-facts.js').factsAdopted(); // lane conversation-facts: adopted with no sidecar read — unknown, never guessed
    try { session._normalizer.seedCost(costSeedOf(meta.costKept, '')); } catch { } // 2.369.402: the kept cost fold (no buffer here)
    session._normalizer.onOp((op) => broadcastToSession(session, id, { type: 'msg', sessionId: id, ...op }));
    activeSessions.set(id, session); oweRestoredPin(session);
    require('./sent-record.js').restoredFor(session);   // B-9a2e part 2: its id was reported before the restart (unless it may still change)
    session._webuiId = id; // per-session pool link key (plan C) — the id the session is registered under
    session._spawnModel = meta.spawnModel || null; session._pickedModel = meta.pickedModel || null; session._pickedModelAt = meta.pickedModelAt || 0; Object.assign(session, require('./model-ask.js').hydratedFacts(meta)); session._servedViaFallback = restoredFallback(meta); // plan C model ladder survives restarts — and so does the classifier reroute (r3 §7)
    session._msgReachability = meta.msgReachability || null; // Channels v1 per-session reach override survives restarts
    session._lastRequestAt = Number(meta.lastRequestAt) || undefined; // lane cache-warmth-tiles r1a′: the last model request survives a restart (the prompt cache does)
    session._lastRequestMember = (typeof meta.lastRequestMember === 'string' && meta.lastRequestMember) || null; // r3: and the member that served it (where the cache lives)
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
    readoptOrphanKeeperSessions, probeSockets, probeFacts, reprobePending, probePending: () => new Map([...pendingProbes].map(([f, p]) => [f, [...p.q]])),
    stoppedSettled: () => Promise.all([...settling]), // the kept metas' transcript answers (settleStopped) — a test's wait
    keepEnded, endFactsBefore, // lane end-obeys-verdict: the ONE end record — its one read before the kill, its writer (it leaves with the kept copy: consumeKeptOf below, or the stopped list's live check — 主开发 2026-11-19 03:17Z)
    stoppedSessions, keptRecordOf, // THE READ-BACK: the kept metas as /api/sessions' stopped rows (routes/sessions, server.js); one conversation's record (the resume verb — piece 4 reads it)
    consumeKeptOf }; // B-a5a4 (2): a turn ended on a live session — its conversation's kept copy goes at once (server.js noteTurnEnd)
}
// B-cd4b (round wzvgb5033, the MUST): WHAT A SURVIVOR WROTE BETWEEN THE RESTORE'S READ AND ITS ATTACH. A dtach master DROPS what it
// reads while no client is attached (bridge-watch.js, measured). At the release the read and the attach ran in ONE turn; with the
// batches a survivor waits up to its batch (~200 ms at 80 on the first test machine, longer under load). So EVERY attach of the
// restore (a batch, a retry, a first use) reads, IN THE SAME TURN, the buffer file from where the registration's read ended — from
// the start of that read's partial last line, so the conversation receives whole records — and feeds it before the pty's first
// byte (session-stdout setupSessionPty `catchUp`). THE FILE IS NOT A TEE (round wed0m8jzl): the chat wrapper keeps its ring in
// memory and REWRITES the file whole (tmp + rename) on a timer (2 s; 250 ms while a CLI follows it); only the queue's own records
// (its DURABLE_RECORDS) are written BEFORE they are said. So a line said inside the window and not yet written at the attach (a
// permission ask rode the timer) was still lost, as at the release — cured by THE WRAPPER'S HOLD (src/said-journal.js: every said line in the file before it is said; the fence below reads the read→connect gap). No record is read twice:
// the order is read, then spawn, then connect, and dtach drops what is said before the client connects. The file also holds lines
// the live output never carries (a held copy of a person's frame): the catch-up feeds them as the registration's read holds them.
// A ring rewritten meanwhile (trimmed: shorter, the same size, or its bytes before that point changed) is searched for the read's
// last whole-line end (a ≤ 256 B guard); not found ⇒ nothing fed, said. Bounded: at most RESTORE_CATCHUP_MAX bytes are read.
const RESTORE_CATCHUP_MAX = 2 * 1024 * 1024, RESTORE_GUARD = 256;
function restoreBufOf(file, raw) {
  const lineAt = raw.lastIndexOf(10) + 1;   // the byte after the read's last '\n' (0: no whole line yet)
  return { file, len: raw.length, lineAt, guard: Buffer.from(raw.subarray(Math.max(0, lineAt - RESTORE_GUARD), lineAt)), partial: raw.subarray(lineAt).toString('utf-8'), partialBytes: Buffer.from(raw.subarray(lineAt)) };   // r1266: the partial as BYTES too (a read torn inside a many-byte character decodes to a replacement mark)
}
/** → null (nothing written since the read), { text, drop } (feed `text`; it begins with `drop`, the read's partial last line,
 *  which leaves the session's buffer first), or { skipped: why }. */
function restoreCatchUp(rb, { max = RESTORE_CATCHUP_MAX } = {}) {
  if (!rb || !rb.file) return null;
  let fd = null;
  try {
    fd = fs.openSync(rb.file, 'r');
    const size = fs.fstatSync(fd).size;
    const read = (at, n) => { const b = Buffer.alloc(Math.max(0, n)); const got = n > 0 ? fs.readSync(fd, b, 0, n, at) : 0; return b.subarray(0, got); };
    // the read's end still where it was: its guard and its partial line, byte for byte (a ring REWRITTEN to the very same size
    // is told from an unchanged file by these bytes, never by the size alone — round wed0m8jzl)
    const pb = rb.partialBytes || Buffer.from(String(rb.partial || ''), 'utf-8');   // r1266: compared as BYTES — a partial torn inside a many-byte character (a Chinese or Japanese line) never matched as text
    const inPlace = () => size >= rb.len && read(rb.lineAt - rb.guard.length, rb.guard.length).equals(rb.guard) && read(rb.lineAt, rb.len - rb.lineAt).equals(pb);
    if (size === rb.len && inPlace()) return null;   // nothing written since the read
    let start = -1;
    if (size > rb.len && inPlace()) start = rb.lineAt;   // appended: the plain case
    else if (rb.guard.length) {   // rewritten (the ring trimmed): find where the read's whole lines ended
      const all = read(Math.max(0, size - max), Math.min(size, max)), k = all.lastIndexOf(rb.guard);
      if (k >= 0) start = Math.max(0, size - max) + k + rb.guard.length;
    }
    if (start < 0) return { skipped: `its buffer was rewritten (${rb.len} → ${size} bytes) and the read's end is not in it` };
    if (size - start > max) return { skipped: `${size - start} bytes since the read — over the ${max}-byte bound` };
    // B-cd4b (the wrapper's hold, its follow r1236): THE RESTORE READS WHOLE LINES ONLY. The file is APPENDED now (the said journal), so
    // a read can land in the middle of an append: a tail with no line end is not text yet — never fed (a consumer would hold its head,
    // and the line arriving whole after it would be lost to both). It is THIS read's partial: the fence, or the next catch-up, reads on
    // from the last line end, so that line arrives whole, once. No line end since the read ⇒ nothing to feed (null): the fence reads
    // from the read's own end, exactly what was fed. THIS read's end comes from the bytes it read (no second read of the tail): its
    // guard is the 256 bytes before that line end — this read's own, after the read's guard (which ends where `start` begins)
    const body = read(start, size - start), pfx = body.subarray(0, pb.length).equals(pb);   // does what follows begin with the read's own partial (its bytes)
    // r1266 (the law said right): WHOLE LINES ONLY WHERE THE FILE IS APPENDED AND A FENCE FOLLOWS — a journaled chat wrapper (its sidecar
    // adverts caps.fence). Every other survivor's file is fed AS READ, as the release fed it: a terminal's raw screen bytes, rewritten
    // whole by a rename (never torn) — a prompt with no line end («Overwrite existing file? [y/N] ») is the text a person must see, and
    // nothing later delivers it (no fence; a plain shell repaints nothing); an older wrapper's file. r1418 (2): a chat record whose sidecar
    // could not be read (`wholeLines`) takes whole lines too, with no fence after them
    if (!rb.fence && !rb.wholeLines) return body.length > pb.length ? { text: body.toString('utf-8'), drop: pfx ? rb.partial : '' } : null;
    const nl = body.lastIndexOf(10);
    if (nl < 0) return null;
    const whole = body.subarray(0, nl + 1), text = whole.toString('utf-8'), ctx = Buffer.concat([rb.guard, whole]), tailB = body.subarray(nl + 1);
    const rbEnd = { file: rb.file, len: size, lineAt: start + nl + 1, guard: Buffer.from(ctx.subarray(Math.max(0, ctx.length - RESTORE_GUARD))), partial: tailB.toString('utf-8'), partialBytes: Buffer.from(tailB), fence: !!rb.fence, ...(rb.wholeLines ? { wholeLines: true } : {}) };
    return whole.length > pb.length ? { text, drop: pfx ? rb.partial : '', rb: rbEnd } : null;
  } catch (e) { return { skipped: `its buffer could not be read (${(e && e.code) || (e && e.message) || e})` }; }
  finally {   // one owner, closed once, the number forgotten at its close; a failed close is SAID (its errno and the file), never swallowed — what was read is returned whatever the close answered (test-fd-close-census)
    if (fd !== null) { try { fs.closeSync(fd); } catch (e) { console.warn(`[boot-restore] the catch-up could not close its descriptor of ${rb.file} (${(e && e.code) || (e && e.message) || e})`); } fd = null; }
  }
}
// B-cd4b: the LAST billing source a buffer holds (the restore's backfill reads the copy the restore already holds) — PURE
const API_KEY_SOURCE = 'apiKeySource":"';
function lastApiKeySource(text) { const k = text.lastIndexOf(API_KEY_SOURCE); if (k < 0) return null; const m = /^apiKeySource":"([^"]*)"/.exec(text.slice(k, k + 200)); return m ? m[1] : null; }
module.exports = { create, lastApiKeySource, restoreBufOf, restoreCatchUp, heldOriginOf, persistNoStart, resumeIdOf, turnRan, pairedSession, poolPinFromMeta, poolFallbackOf, STOP_DEAD_SOCKET, STOP_ENDED }; // r5; poolFallbackOf (B-d578 F2): the two held-origin helpers are PURE over a meta + store (test-codex-pool §R17b)
