const i18nKey = (k) => k;   // marks a dictionary key (the i18n check reads it) — the B-f276 remainder's held refusals
/**
 * WS 'create' handler (拆分P2): the session-CREATE case family — new session /
 * resume / fork, local + remote (ssh/dial/daemon pipe), account resolution,
 * crash-loop + resume breakers, writer sweep, keeper adoption. Extracted
 * VERBATIM from src/ws-handler.js's switch; the body runs inside a
 * `do { ... } while (0)` so every case-level `break;` keeps its exact
 * pre-extraction meaning (inner loops' breaks are untouched).
 */

const DAY_ONE = require('./day-one.js');   // lane door-day-one-landing: SIGN_IN — a sign-in terminal is not a session row
const LOCKCTX = require('./lock-context.js'); // B-6c55: the context a lock keeps (PURE)
const SFW = require('./settings-file-words.js'); // B-8dcf item two: a person's own settings file at a start (PURE; loaded with the create, never on a pass)
const MANAGED = require('./managed-claude-settings.js'); // lane lg-providers (主开发 23:45Z): a managed key helper outranks every setting a start passes
const BILLPICK = require('./billing-pick.js'); // unit «billing pick alive»: a subscription pick sets the machine's key helper aside (PURE)
const { ensureGitIdentity } = require('./server/git-identity.js');   // lane door-day-one-landing: git's name / email default from the sign-in's account
const { MessageManager } = require('./message-manager');
const { capsOf, worktreeRefusal, worktreeSpawnArgs, toolAllowlistArgs } = require('./backend-caps');
const { spawnGroupIds } = require('./new-session-spec'); // PURE (lane new-session-form): the Task Groups a new session joins, in selection order
const { get: harnessOf } = require('./harnesses'); // S9: store-side fork (opencode serve) before the spawn
const { createMessageManager } = require('./normalizers');
const { cwdToProjectDir, findSessionJsonlPath, warmSessionJsonlAsync } = require('./session-store');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { spawnFor } = require('./spawn'); // decoupling wave 2b: the per-transport spawn ladders (local / ssh / dial)
const { remoteCmdFor, remoteRefusal } = require('./server/remote-cli'); // B-69ec: a paired machine's OWN login shell says where its CLI is
const { sessionSpawnLine } = require('./spawn/line'); // PURE (lane antigravity-spawn-argv): THE local session line — node <wrapper> <buf> <meta> <ONE executable> …args + the env
const SPRI = require('./server/spawn-priority.js'); // B-460d: the start's CPU priority — a local conversation starts below the hub (nice +5 on the line itself)
const { pipePtyShim } = require('./pty-duck'); // B-ae4b: the R6 pipe duck holds a listener SET (the liveness stamp + the consumer)
const { writerSweepOpts, forkChainEnvAsync } = require('./resume-store'); // descriptor store hooks (writerSweep / forkChain), no id branch
const { lockCaptureWanted, captureLockId, captureForkProof, armLockCapture, adoptCapturedId, forkSourceOf } = require('./claude-lock-capture'); // the ONE local lock capture (create + boot re-arm; a terminal fork included; the witness is the wrapper's pid, 2026-09-25)
const { readPpid } = require('./cli-identity');
const { resumeSpawnPick, applyOriginHint, continuityLogLine } = require('./resume-continuity');
const { openOpencodePty } = require('./server/opencode-pty-bridge'); // S9 remainder (c): a serve-owned pty as a normal terminal session
/** B-460d's remainder: a serve terminal runs at the SERVE's priority — the fact its start got (src/opencode-serve.js snapshot cpuNice:
 *  a serve this process started below the hub), or null (a serve adopted from another life claims nothing) */
const ocServeFact = () => { try { return SPRI.factOf(require('./opencode-serve').facts()?.locator?.state?.()?.cpuNice); } catch { return null; } };
const browserProfiles = require('./browser-profiles'); // agent-browser P0: the browser key's continuity ladder + the env composition (PURE)
const browserKeyMod = require('./server/browser-key'); // B-f7ab: THE mint + THE key's session fields (the spawn and a live session's first use)

/**
 * Is a `WorktreeCreate` hook configured for a claude run in `cwd`? — the
 * SECOND half of the CLI's own --worktree gate (2.1.257:
 * `pX(){return fB("WorktreeCreate").length>0}`, OR'd with is-git-repo), so a
 * user driving another VCS through the hook the CLI's error text recommends is
 * not refused by a preflight that only looked for `.git`.
 *
 * Deliberately a CHEAP, WIDE read rather than a reimplementation of the CLI's
 * settings merge: the three files a user can put it in, size-capped, async
 * (never block the event loop), and any parse/IO failure answers `null` =
 * "could not tell" rather than `false`. Only the presence of the event key
 * matters — we never execute, inspect or report the hook's command.
 * @returns {Promise<boolean|null>}
 */
async function claudeWorktreeHookConfigured(cwd) {
  const fsp = require('fs').promises;
  const path = require('path');
  const home = process.env.CLAUDE_CONFIG_DIR || path.join(require('os').homedir(), '.claude');
  const files = [
    path.join(home, 'settings.json'),
    path.join(cwd || '.', '.claude', 'settings.json'),
    path.join(cwd || '.', '.claude', 'settings.local.json'),
  ];
  for (const fp of files) {
    let txt;
    try {
      const st = await fsp.stat(fp);
      if (!st.isFile() || st.size > 512 * 1024) continue;   // a settings file that big is not one we can reason about
      txt = await fsp.readFile(fp, 'utf8');
    } catch { continue; }                                    // absent is not a failure — it simply has no hook
    try {
      const j = JSON.parse(txt);
      const h = j && j.hooks && j.hooks.WorktreeCreate;
      if (Array.isArray(h) ? h.length > 0 : !!h) return true;
    } catch { return null; }                                 // unparseable ⇒ we genuinely cannot tell
  }
  return false;  // every readable settings file was silent about the event
}

/** THE PIN A RESUME CARRIES (2026-09-28; verify r1): `data.poolPin` = the conversation's own pin from
 *  the client's session config `{memberId, at, poolId?}`. Honoured only when ALL of this holds —
 *  never on a FORK (a fork starts unpinned), never for a remote conversation; the pool is the one
 *  THIS SPAWN BILLS, resolved per backend exactly as resolveForSpawn resolves it (a codex
 *  conversation on the default bills `defaultCodexAccountId` — the claude default was asked for
 *  both, so a codex pin on the default pool was dropped at the one moment it can apply); a pin that
 *  names its pool is a pin on THAT pool (it used to follow the conversation onto any other pool
 *  that lists the same member — a pin nobody made there); a pin that names its pool is kept while its member is
 *  out of the pool (as a live conversation keeps it — verify r2), a carrier without a pool needs a listed member.
 *  → {poolId, pin: {memberId, at, by}} | null */
function resumePoolPin(data, accounts, backend = 'claude') {
  try {
    if (!data || data.fork || data.hostId || !accounts) return null;
    const p = data.poolPin;
    if (!p || typeof p !== 'object' || typeof p.memberId !== 'string' || !p.memberId) return null;
    if (data.accountId === 'subscription') return null; // the CLI's own login — no pool
    const st = accounts._state || {};
    // the default THIS backend bills — the descriptor's creds.defaultIdField (codex: defaultCodexAccountId)
    const defaultIdField = (() => { try { return harnessOf(backend).creds?.defaultIdField || null; } catch { return null; } })();
    const poolId = data.accountId || (defaultIdField ? st[defaultIdField] : null) || null;
    if (!poolId || accounts.get(poolId)?.type !== 'pooled') return null;
    if (typeof p.poolId === 'string' && p.poolId && p.poolId !== poolId) return null;
    // a pin that NAMES this pool is the owner's choice FOR it: kept while its member is out of the pool — placed
    // automatically meanwhile (pin-member-unknown), honoured again when the member is re-added — exactly as a LIVE
    // conversation keeps it (verify r2: a resume dropped it from the session while the client still held it). A
    // carrier that names no pool is judged by membership, as before.
    const named = typeof p.poolId === 'string' && p.poolId === poolId;
    if (!named && !(accounts.poolMembership(poolId) || []).includes(p.memberId)) return null;
    return { poolId, pin: { memberId: p.memberId, at: Number(p.at) || Date.now(), by: 'user' } };
  } catch { return null; }
}

function createWsCreateHandler({ ctx, agentEnv, crashLoopRef, noConvoRef,
  execFileAsync, pickCodexThreadCandidate, getSessionKey, normalizeComparablePath, helperFactMs = 8000, managedClaudeDir = null }) {   // managedClaudeDir: the factory's seam for a suite (a stand-in managed folder) — never a ctx key
  const {
    activeSessions, WS_OPEN, broadcastActiveSessions, broadcastToSession, resizeSessionToMin,
    setupSessionPty, refreshWebuiPids, deleteSessionMeta, writeSessionMeta, readSessionMeta,
    readLayouts, writeLayouts, getSyncStore, serverSetting, integrationEnabled, agentdRemote, dialBridge,
    harnessSetting, harnessDeclares, harnessSpawnSettings, cliConfigPlanB64, cliConfigGate, ownerWriteRefusal,
    sessionCounterRef, createSessionMessages, poolChooser,
    SOCKETS_DIR, BUFFERS_DIR, PTY_WRAPPER, CHAT_WRAPPER,
    NODE_CMD, DTACH_CMD, CLAUDE_CMD, EDITOR_CMD, AGENT_BIN_DIR, PORT, X_ENV, cliCmds,
    adapterRegistry, pty, path, fs, os, ensureDir, hosts,
    accounts, scheduleCtxSync, activeSessionsPayload, otelEnv,
    USAGE_STATUSLINE_CMD, userStatuslineCmd, serverNotice, autoResume,
  } = ctx;
  const helperSaidKeys = new Set();   // unit «billing pick alive»: the helper-set-aside keys this hub has said (for the notice, a said key asks no machine again)
  // THE FACT (the unit's cure, src/billing-pick.js): does the machine the CLI runs on name a key helper? → true / false / null (it
  // cannot be read). A paired machine: its backend status, bounded (no answer in HELPER_FACT_MS = cannot be read). This machine:
  // the CLI's settings file as the SPAWN's own env places it (its config dir, its HOME) — opened non-blocking (a FIFO never holds a
  // start), a regular file under 1 MiB, else cannot be read; no such file names nothing.
  // BOTH roads are bounded (its reader's S1: a config dir on a stuck mount never holds a start): no answer in HELPER_FACT_MS = cannot be read
  const HELPER_FACT_MS = Number(helperFactMs) > 0 ? Number(helperFactMs) : 8000;   // (helperFactMs: the factory's seam for a suite — the bound's own leg; never a ctx key)
  // (a stuck mount: the race below frees the START at the bound, never the libuv threadpool thread a hung open holds — named in the kb)
  const readHelperFactOf = async ({ hostId, backend, creds, env, cwd = null, ownFile = null, sink = null }) => {
    const row = creds && creds.keyHelper;
    if (hostId) return BILLPICK.remoteHelperFact(await hosts.backendStatus(hostId, { helper: { cwd, ownFile } }), backend);   // B-77ed: the start's files on ITS machine
    const file = BILLPICK.settingsFileOf(row, { creds, env, home: (env && env.HOME) || os.homedir() });
    if (!file) return null;
    // cure 2 (主开发 11:18Z): every file the CLI reads a helper from on this machine — its config dir's, the project's two, the person's own
    const placed = BILLPICK.startFilesOf({ cwd, ownFile }, BILLPICK.nodeAt(path, (env && env.HOME) || os.homedir()));   // B-77ed: ONE placement for every road
    const files = [file, ...placed.files];
    const reads = await Promise.all(files.map((f) => readOneFactOnce(f, row)));
    const own = BILLPICK.ownSettingsPathOf(cwd, ownFile), k = own ? files.indexOf(own) : -1;
    if (sink) sink.text = k >= 0 ? reads[k].text : null;   // B-e7c0: the person's own file's text, for THIS start (a late read lands after it moved on)
    const facts = reads.map((x) => x.fact);
    return BILLPICK.combinedFact(placed.unplaced ? facts.concat([null]) : facts);
  };
  // ONE READ IN FLIGHT PER FILE across starts (cure 2, its readers' should): a start that finds a read of the same file still pending
  // joins it — a hung open on a stuck mount holds ONE threadpool thread, never one more per start; the entry leaves when the read ends
  const factReadsInFlight = new Map();
  const readOneFactOnce = (file, row) => {
    const had = factReadsInFlight.get(file);
    if (had) return had;
    const p = readOneFact(file, row).finally(() => factReadsInFlight.delete(file));
    factReadsInFlight.set(file, p);
    return p;
  };
  const readOneFact = async (file, row) => {   // → { fact, text } (B-e7c0: the text it read, for the start whose own file it is)
    let fh = null;
    try {
      fh = await fs.promises.open(file, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
      const st = await fh.stat();
      if (!(st.isFile() && st.size <= BILLPICK.SETTINGS_READ_MAX)) return { fact: null, text: null };   // B-bc9f's bound
      const text = await fh.readFile('utf8');
      return { fact: BILLPICK.localHelperFact({ text }, row), text };
    } catch (e) { return { fact: e && e.code === 'ENOENT' ? BILLPICK.localHelperFact({ missing: true }, row) : null, text: null }; } finally { try { await fh?.close(); } catch { } }
  };
  /** B-e7c0: the one --settings value → <BUFFERS_DIR>/<id>.settings (created 0600, exclusive — no temp file); the line carries the path.
   *  Cannot write ⇒ the RELEASE'S SET-ASIDE (the adapter's own build without the person's file: the override kept, nothing of the person's)
   *  + what a later step of this start added — and SAID like it (its settingsNotes). */
  const ownSettingsOnDisk = async (args, id, spec) => {   // off the loop (the sync-fs and store-write censuses): the create is async
    const i = args.indexOf('--settings');
    if (i < 0) return args;
    const out = args.slice(), file = BUFFERS_DIR ? path.join(BUFFERS_DIR, `${id}.settings`) : null;
    try {
      if (!file) throw new Error('no buffers folder');   // the merged JSON never stays inline: the set-aside, as a write failure
      await fs.promises.unlink(file).catch(() => { });
      await fs.promises.writeFile(file, String(out[i + 1]), { mode: 0o600, flag: 'wx' });
      out[i + 1] = file;
      spec.ownFile = file;   // a start that fails after this removes it (no end path knows a conversation never registered)
    } catch (e) {
      const parse = (v) => { try { const o = JSON.parse(v); return o && typeof o === 'object' ? o : {}; } catch { return {}; } };
      const built = parse(spec.setAside && spec.setAside.merged), fin = parse(out[i + 1]);
      const later = Object.fromEntries(Object.entries(fin).filter(([k, v]) => JSON.stringify(built[k]) !== JSON.stringify(v)));
      out[i + 1] = JSON.stringify({ ...parse(spec.setAside && spec.setAside.settings), ...later });
      spec.settingsNotes = (spec.setAside && spec.setAside.settingsNotes) || [];
      spec.ownFellBack = true;
      console.warn(`[ws-create] ${id}: the merged settings file could not be written (${(e && e.code) || (e && e.message)}) — the person's settings file is set aside for this start`);
    }
    return out;
  };
  const readHelperFact = (o) => {
    let timer = null;
    const late = new Promise((r) => { timer = setTimeout(() => { if (o && o.sink) o.sink.late = true; r(null); }, HELPER_FACT_MS); timer.unref?.(); });   // B-e7c0: a machine that did not answer is not asked again
    return Promise.race([readHelperFactOf(o).catch(() => null), late]).finally(() => clearTimeout(timer));
  };

  // ── THE AGENT BROWSER'S SPAWN ENVIRONMENT (P0, docs/design-agent-browser-v2
  //    §3.2) — constructed HERE, not in server.js, for two reasons that are both
  //    load-bearing. (1) This file is the ONE spawn composition: the local
  //    `r6Argv` lives below and all five `buildRemoteExec` call sites in the
  //    transport ladders it hands its pieces to (src/spawn/, `ladderCtx`), so a
  //    resolver built here reaches both without a second wiring. (2) server.js
  //    is AT its size ratchet (≤2100); a new mechanism belongs in a module, and
  //    this is that module's natural constructor.
  //
  //    LAZY, and that is not tidiness. Registering the ws handler must cost
  //    NOTHING: the gate constructs it with a minimal ctx (test-contributions
  //    passes no `path`, no `BUFFERS_DIR`) and an eager `path.dirname(...)`
  //    here took the whole release gate down with a TypeError at registration
  //    time. It is also the repo's own extraction discipline — a late singleton
  //    is reached through a getter, never captured at construction — and it
  //    means an instance where nobody ever creates a session never touches the
  //    filesystem for this feature at all.
  let _browserEnv;                      // undefined = not asked yet; null = deps missing
  // r3786: THIS process's kept store (the keeper's), asked lazily — null when there is none
  const liveKeptStore = () => { try { const k = require('./server/browser-keeper.js').keeper(); return k && typeof k.keptStore === 'function' ? k.keptStore() : null; } catch { return null; } };
  const browserEnvOf = () => {
    if (_browserEnv !== undefined) return _browserEnv;
    try {
      _browserEnv = require('./server/browser-env.js').create({
        // `<root>/data`, derived from BUFFERS_DIR (`<root>/data/session-buffers`)
        // rather than added to the ws ctx contract, for the same ratchet reason.
        dataDir: require('path').dirname(BUFFERS_DIR),
        serverSetting, serverNotice, telemetry: ctx.telemetry || null,
        // r3786 (LAW 4): the boot sweep judges the kept list by THE kept store's own verdict and facts (undefined: none in this process)
        keptKeys: () => { const ks = liveKeptStore(); return ks && typeof ks.keyVerdict === 'function' ? ks.keyVerdict() : undefined; },
        keptNoted: () => { const ks = liveKeptStore(); return ks && typeof ks.notedKeys === 'function' ? ks.notedKeys() : undefined; },
        keptReady: () => { const ks = liveKeptStore(); return ks && typeof ks.reconciled === 'function' ? ks.reconciled() : Promise.resolve({ done: true, code: null }); },   // r3961 (hold 3 (a))
      });
    } catch (e) {
      // A degrade path that prints the message VERBATIM is the only reason this
      // class of bug is ever found (2.276.0's swallowed ReferenceError).
      console.warn('[browser] per-session browser environment unavailable — ' + (e && e.message));
      _browserEnv = null;
    }
    return _browserEnv;
  };
  // D1's floor is probed ONCE, off the spawn path and only on an instance that
  // has at least registered a ws handler with real deps. A too-old binary
  // degrades by CAPABILITY with one honest notice — it never blocks a create,
  // because P0's own isolation is measured working on the installed 0.32.0.
  setTimeout(() => { try { browserEnvOf()?.checkFloor().catch(() => { }); } catch { } }, 3000).unref?.();
  // …AND RE-ASKED UNTIL SOMEBODY HEARS IT (r5). A systemd / update.sh restart
  // has NO client at boot+3 s, `serverNotice` deliberately burns its key only
  // when a client received it, and round 4's resolver latched BEFORE asking
  // — so the notice went to nobody for the life of the process (measured: a
  // client at Ready+6.3 s got zero frames while the journal carried the
  // line). The resolver now latches on DELIVERY; ws-handler calls this on
  // every client connection (free once latched; a cached probe inside the
  // TTL otherwise), and the 6 h re-probe follows the other health probes so
  // a binary upgraded mid-run is re-read.
  const onClientConnected = () => { try { browserEnvOf()?.checkFloor().catch(() => { }); } catch { } };
  setInterval(() => { try { browserEnvOf()?.checkFloor({ reprobe: true }).catch(() => { }); } catch { } }, 6 * 3600e3).unref?.();
  // Boot sweep of the indirection objects and variant-C scratch dirs no live
  // session carries. §3.2.2 promises those directories are swept; a fallback
  // rung that farms orphans is the very problem this feature exists to end.
  // The live set is passed EXPLICITLY — `sweep(null)` means "I could not
  // enumerate" and deliberately removes nothing.
  setTimeout(() => {
    try { browserEnvOf()?.sweep(new Set([...activeSessions.values()].map((s) => s && s._browserKey).filter(Boolean))); } catch { }
  }, 20000).unref?.();

  // B-f698 verify r1: conversation → the promise its in-flight resume settles (see the resume guard)
  const resumesInFlight = new Map();
  async function createBody(ws, data, attachedSessions, held) {
    do {
          const backend = data.backend || 'claude';
          const adapter = adapterRegistry?.get?.(backend) || null;
          // THE HARNESS'S DECLARED SPAWN ROWS (lane dc-ws-create): every per-harness fact of this
          // create is a row/hook on the descriptor (src/harnesses/<id>.js `spawn`, checked by
          // assertSpawnContract) or a caps row — never a literal-id branch here.
          const harness = (() => { try { return harnessOf(backend); } catch { return null; } })();
          const SP = (harness && harness.spawn) || {};
          const convIdField = SP.conversationIdField || null; // claude: the claudeSessionId twin beside backendSessionId
          if (!adapter) {
            ws.send(JSON.stringify({ type: 'error', reqId: data.reqId, message: `Unknown backend "${backend}".` })); // the request named (r4 N2)
            break;
          }
          // THE SAME DOOR as set-model (lane fable-52-cli-321 r6, model-providers namedModel), ONE behavior with the client's road
          // (round 14): a saved model or lock target that is no model id is DROPPED — the conversation starts on its default (the client
          // says so in one line before it sends; an older bundle's frame starts the same way) — never a resume on the model a door refused
          { const MP = require('./model-providers.js');
            for (const k of ['model', 'lockModel']) if (data[k] != null && data[k] !== '') { const named = MP.namedModel(data[k]); if (!named) console.warn(`[create] ${k} is not a model id — dropped, the default spawns`); data[k] = named || undefined; } }
          // An ACP harness whose executable is not on this machine (S8) is refused by THE ONE verdict below
          // (cliCmds.forSpawn's cli-missing, lane cli-shell-truth) — one road for every harness, before any spawn.
          // Writer-sweep options per backend (P1 codex double-writer, see
          // writer-sweep.js): the codex legs get the webui ids of the LIVE
          // codex sessions on the TARGET machine as a protect list — a codex
          // app-server holds every rollout of its thread tree open (sub-agent
          // threads included, for its whole lifetime), so without it a resume
          // of a finished sub-agent thread would SIGTERM a healthy live
          // session's app-server (the 2.284.4 class). Live sessions are the
          // resume-already-live guard's business; the sweep reaches
          // external/orphaned writers only.
          const sweepOpts = (hostId) => writerSweepOpts(backend, activeSessions, hostId);
          // Resume guard (2.179.0, userW's duplicate-session incident): a
          // plain claude --resume REUSES the conversation id — spawning it
          // while the original session is still LIVE puts TWO claude
          // processes on ONE JSONL (transcript double-writer class) and
          // duplicates the sidebar card. Refuse and hand the LIVE session
          // back; the client attaches it instead. Forks mint a new id (skip).
          // CODEX TOO (P1): the wrapper's `thread/resume` REUSES the thread
          // id (only `thread/fork` mints a new one — the old "codex resume
          // forks a new thread id" exemption was FALSE for the current
          // wrapper), so a second app-server on one rollout is the same
          // B-4058 double-writer class; match on backendSessionId (the live
          // thread id, kept current by session-stdout on every meta record).
          // Gated on the harness CAPS row (every chat harness with a stream
          // protocol — claude/codex/opencode…), never an id list: the S9
          // OpenCode serve store lists sessions this instance may already be
          // driving through a live acp-wrapper, and a plain resume from a
          // stale card would spawn a second `opencode acp` on one session.
          if (capsOf(backend).streamProtocol && data.resume && data.resumeId && !data.fork) {
            // B-f698 verify r1: TWO resumes of one conversation in flight at once BOTH passed this guard — a create
            // registers its session only after its awaits (knob reads, the writer sweep), so the respawn after an
            // unexpected exit racing the user's own Resume click spawned two CLIs on one transcript (B-4058). A resume
            // in flight HOLDS the conversation until it settles; a second one waits for it, then meets the guard.
            const flightKey = `${backend}|${data.hostId || ''}|${data.resumeId}`;
            for (const t0 = Date.now(); resumesInFlight.has(flightKey) && Date.now() - t0 < 60000;) await Promise.race([resumesInFlight.get(flightKey), new Promise((r) => setTimeout(r, 1000))]);
            if (resumesInFlight.has(flightKey)) {
              ws.send(JSON.stringify({ type: 'error', code: 'resume-in-flight', reqId: data.reqId, message: 'This conversation is already being resumed — its window opens when that finishes.' }));
              break;
            }
            let existing = null;
            for (const [eid, es] of activeSessions) {
              if ((es.backend || 'claude') !== backend) continue;
              const liveId = (convIdField && es[convIdField]) || es.backendSessionId; // the harness's own conversation-id field (spawn.conversationIdField), else the generic one
              if (liveId !== data.resumeId) continue;
              if ((es.host || null) !== (data.hostId || null)) continue;
              existing = [eid, es]; break;
            }
            if (existing) {
              ws.send(JSON.stringify({
                type: 'error', code: 'resume-already-live', reqId: data.reqId,
                existingId: existing[0], existingName: existing[1].name || '',
                existingCwd: existing[1].cwd || '', existingMode: existing[1].mode || 'chat',
                message: 'This conversation is already running in a live session — opening that instead of starting a second copy.',
              }));
              break;
            }
            { let release; resumesInFlight.set(flightKey, new Promise((r) => { release = r; })); held.release = () => { resumesInFlight.delete(flightKey); release(); }; }
          }
          // Unresumable-conversation circuit breaker (2.207.1, real bootloop:
          // a remote session killed 9s after creation never flushed a
          // transcript — every resume died in ~2s with the CLI's "No
          // conversation found", and an automated recreation fed the loop 5×
          // in 2 minutes). Refuse further resumes for 10 minutes with the
          // honest explanation instead of another guaranteed death.
          if (data.resume && data.resumeId && !data.ignoreNoConvo) {
            const hit = noConvoRef.map.get(data.resumeId);
            if (hit && Date.now() - hit < 600000) {
              // VERIFY BEFORE BLAMING (2.227.3, userN's 46MB "修轮子"): the
              // CLI's "No conversation found" only proves claude looked in the
              // WRONG PLACE — a stale display-cwd ("Host: /path", the 2.225.2
              // bug) made it search the wrong project dir while the transcript
              // sat intact on the machine. The old text told the user to CLOSE
              // THE CARD AND START OVER, i.e. discard a live conversation.
              // Now: if a transcript for this id EXISTS anywhere we can see
              // (local project dirs OR the remote-jsonl cache), say the truth —
              // we know it exists, the last attempt looked in the wrong folder
              // — and let the client offer a retry instead of a dead end.
              const known = (() => { try { return !!findSessionJsonlPath(data.resumeId, data.cwd || ''); } catch { return false; } })();
              global.__vsEvent?.('resume-refused-no-transcript', known ? 'transcript-exists' : 'transcript-absent');
              ws.send(JSON.stringify({
                type: 'error', reqId: data.reqId, code: 'no-convo-breaker', resumeId: data.resumeId, transcriptKnown: known,
                message: known
                  ? 'The last resume attempt failed: the CLI could not find this conversation in the folder it was started from — but a transcript for it DOES exist, so the conversation is NOT lost. Check the session\'s working directory / machine, then try again (further attempts are paused for a few minutes to avoid a crash loop).'
                  : 'The last resume attempt failed with "no conversation found", and no transcript for it turned up on this machine or in the cache. It may have ended before anything was written — or it lives on a machine this instance can\'t see right now. Further attempts are paused for a few minutes; nothing has been deleted.',
              }));
              break;
            }
          }
          // Resume HOST INFERENCE (2.218.0, real incident): pre-hostId-era
          // window specs resumed REMOTE conversations host-less — a local
          // `claude --resume` of an h200 transcript died "No conversation
          // found" four times in a row while the conversation's home host was
          // reachable the whole time. If a host-less claude resume has no
          // LOCAL transcript but the remote-jsonl cache holds the
          // conversation under exactly ONE registered host, resume it ON that
          // host — and when the host still runs a live keeper child for the
          // conversation, ATTACH (keeperSid) instead of spawning a second
          // writer onto the same JSONL.
          if (data.resume && data.resumeId && !data.hostId && typeof SP.isLocalConversation === 'function'
              && hosts && /^[\w-]+$/.test(data.resumeId)) {
            try {
              const local = !!SP.isLocalConversation(data.resumeId); // the descriptor's answer (claude: ~/.claude/projects/*/<id>.jsonl)
              if (!local) {
                // the B-f276 remainder's cure (主开发 23:20Z, its audit H4): while hosts.json is HELD no paired machine can be named — the
                // conversation is not on this machine, so it is NOT resumed here (the cache scan's get threw into a bare catch and the
                // resume ran locally: «No conversation found», or a second conversation forked on this machine); refused by name
                if (hosts.held && hosts.held()) {
                  ws.send(JSON.stringify({ type: 'error', reqId: data.reqId, code: 'hosts-unread', message: `This conversation is not on this machine (a paired machine may hold it), and ${hosts.unreadWords()}`, i18n: { key: i18nKey('VibeSpace cannot read its paired machines right now — nothing was started. Open it again in a few minutes (it reads them again by itself).') } }));
                  return;
                }
                const cacheRoot = path.join(__dirname, '..', 'data', 'remote-jsonl');
                const cacheRel = harness.store.remoteFind(data.resumeId).cacheRel; // where hosts.fetchTranscript caches this harness's transcript
                const owners = [];
                try {
                  for (const hd of fs.readdirSync(cacheRoot)) {
                    if (hosts.get(hd) && fs.existsSync(path.join(cacheRoot, hd, cacheRel))) owners.push(hd);
                  }
                } catch { }
                // conversation-location INDEX first (R3 tail, 2.297.0): the
                // cache scan only knows conversations whose transcript was
                // already pulled once — the index also knows DISCOVERY-listed
                // ones. When both sources answer they must AGREE (disagreement
                // = ambiguous ⇒ refuse to infer, exactly like owners.length>1).
                const idxOwner = hosts.conversationOwner?.(data.resumeId) || null;
                if (idxOwner && !owners.length) owners.push(idxOwner);
                else if (idxOwner && owners.length === 1 && owners[0] !== idxOwner) owners.push(idxOwner); // force ambiguity
                if (owners.length === 1) {
                  data.hostId = owners[0];
                  console.log(`[session] resume host inferred: ${data.resumeId.slice(0, 8)} → ${owners[0]} (host-less resume of a cached remote conversation)`);
                  if (!data.keeperSid) {
                    try {
                      const k = await hosts.findKeeperFor(owners[0], data.resumeId);
                      // findKeeperFor scans ~/.vibespace/*/state/sessions = AGENTD pipe
                      // sids — tag them (B-218d): the ssh branch must adopt via the
                      // attach-cli, NOT the legacy keeper binary (which only knows
                      // ~/.vibespace/run and can never find these sids).
                      // k.error = the probe FAILED (host lag) — refuse rather than
                      // sweep+respawn onto a possibly-live claude (2.271.0 T1-1).
                      if (k?.error) {
                        ws.send(JSON.stringify({ type: 'error', reqId: data.reqId, code: 'keeper-probe-failed',
                          message: `${owners[0]} isn’t responding — couldn’t verify whether this conversation is still running there. Retry in a moment.` }));
                        return;
                      }
                      if (k) { data.keeperSid = k.sid; data.keeperKind = k.kind; console.log(`[session] live ${k.kind} session ${k.sid} holds ${data.resumeId.slice(0, 8)} — attaching instead of spawning a second writer`); }
                    } catch { }
                  }
                }
              }
            } catch { }
          }
          // A RESUME THAT STATES NO ACCOUNT GOES TO THE ACCOUNT ITS CONVERSATION IS HELD ON (lane dead-socket-keeps-chat-meta
          // r2 — the ONE seam every door crosses: the page's Resume, the For-you reply reopen, an automation's open): the
          // conversation's stopped row names it (a kept meta's, the account root whose index lists it); a harness that keeps
          // a conversation in its account's own store with no account named is refused by name — never the default, whose
          // store does not hold it (acceptance r1: a For-you reply started agy on the default and adopted a NEW conversation).
          if (data.resume && data.resumeId && !data.hostId && !data.accountId && !data.fork) {
            let held = null;
            try { held = await require('./routes/sessions').heldAccountOfNow(backend, data.resumeId); } catch { held = null; }   // B-a5a4 (3): before the first sweep too
            if (held && held.refuse) { ws.send(JSON.stringify({ type: 'error', reqId: data.reqId, code: 'resume-account-unknown', resumeId: data.resumeId, message: held.refuse })); break; }
            if (held && held.accountId) data.accountId = held.accountId;
          } else if (data.resume && data.resumeId && !data.hostId && data.accountId && !data.fork) {
            // B-a5a4 r1 (1): an account-bound harness resumes ONLY on the account its conversation's row names
            let wrong = null;
            try { wrong = await require('./routes/sessions').boundElsewhereOf(backend, data.resumeId, data.accountId, { accounts }); } catch { wrong = null; }
            // B-a5a4 follow-up: the account that holds it, named (the sentence filled; its key + params for the page's words)
            if (wrong && wrong.refuse) { ws.send(JSON.stringify({ type: 'error', reqId: data.reqId, code: wrong.code || 'resume-account-bound', resumeId: data.resumeId, accountId: wrong.accountId, message: wrong.message || wrong.refuse, ...(wrong.params ? { i18n: { key: wrong.refuse, params: wrong.params, ...(wrong.words ? { words: wrong.words } : {}) } } : {}) })); break; }
          }
          // ONE counter value for BOTH the id and the socket name (a fleet user's
          // 2026-08-11 incident, proven in production data): sockName re-read
          // `sessionCounterRef.value` ~100 lines and several AWAITS later
          // (cwd preflight, host inference, findKeeperFor), so a burst of
          // concurrent creates — exactly what a multi-agent orchestrator
          // produces — had every session read the counter's LATEST value:
          // four sessions with ids sess-21/22/31/34 all took sockName cw-36,
          // differing only in the Date.now() millisecond. Two landing in the
          // SAME millisecond share a socket path AND a session-meta file, so
          // one session's metadata (name, claudeSessionId, account, taskId)
          // silently overwrites the other's — the state-crossing class.
          const seq = ++sessionCounterRef.value;
          const id = 'sess-' + seq + '-' + Date.now();
          // cwd default: a REMOTE/DIAL session with no explicit cwd must land
          // in the DEVICE's home, NOT this server's (B-0d70: the pod's
          // /home/<user> doesn't exist on a Mac → `cd` failed and, on the
          // pipe-session path, a nonexistent spawn cwd crashed the daemon).
          let cwd = data.cwd || '';
          let cwdRecreated = false; // B-7812: set when the missing cwd was rebuilt on user confirm
          // Server-side twin of the client's stripCwdHostLabel (utils.js): the
          // sidebar's folder-grouping display cwd "<host name>: /path" leaked
          // into persisted openSpecs, and a resume that `cd`'d into the literal
          // label fell back to $HOME — claude then said "No conversation found"
          // (real incident, userL h200). Strip iff the remainder is a real
          // absolute/home path; heals old clients + already-persisted layouts.
          {
            const m = /^[^/~]+: (?=[/~])/.exec(cwd);
            if (m) { console.warn(`[session] stripped display host-label from cwd: ${cwd}`); cwd = cwd.slice(m[0].length); }
          }
          if (!cwd) {
            if (data.hostId && hosts) {
              try { const hh = hosts.get(data.hostId); cwd = (hh && await hosts.homeDir(hh)) || ''; } catch { }
            }
            if (!cwd) cwd = os.homedir();
          } else if (!SP.homeFallback) { // spawn.homeFallback (shell): a terminal in $HOME is fine
            // Spawn-cwd preflight (2.226.0, user directive "不要静默失败"): an
            // EXPLICIT cwd that doesn't exist used to fall back to $HOME
            // silently — for claude/codex that broke resumes ("No conversation
            // found" from the wrong project dir) and misplaced new sessions.
            // Fail fast with the honest reason. BEST-EFFORT: only a definitive
            // MISSING refuses; a probe error/timeout proceeds as before.
            // (Shell terminals keep the home fallback — a terminal in $HOME is
            // usable; a transcript-coupled session in the wrong dir is not.)
            let missing = false;
            let hostName = '';
            const dirMissing = () => new Promise((resolve) => {
              execFile('test', ['-d', cwd], { timeout: 4000 }, (err) => resolve(!!err && err.code === 1));
            });
            try {
              if (!data.hostId) {
                // Child-process probe, NEVER node fs (§2.108.3 hung-mount
                // doctrine: a wedged FUSE path blocks sync fs / eats a
                // threadpool slot; a stuck child just gets killed by timeout).
                missing = await dirMissing();
              } else if (hosts) {
                const hh = hosts.get(data.hostId);
                if (hh) {
                  hostName = hh.name || hh.host || '';
                  const q = cwd.replace(/'/g, `'\\''`);
                  const out = await Promise.race([
                    hosts._hostShell(hh, `[ -d '${q}' ] && echo __VS_DIR_OK__ || echo __VS_DIR_MISSING__`, { timeoutMs: 5000 }),
                    new Promise((r) => setTimeout(() => r(''), 5500)),
                  ]);
                  missing = String(out).includes('__VS_DIR_MISSING__');
                }
              }
            } catch { /* probe failure must never block a create */ }
            // A FOLDER THAT WAITS IS NOT GONE (B-864f, src/server/cwd-wait.js), asked for EVERY local cwd (a mount point left as a
            // bare folder passes `test -d`) and BEFORE the recreate below (an empty folder made under a mount point that is not up
            // would shadow the mount): the vault locked over the mount's secret ⇒ vault_locked (the page resumes it at the unlock);
            // a mount being brought up ⇒ waited for, bounded; a missing folder under a recorded mount still down ⇒ mount_down.
            if (!data.hostId) {
              const CW = require('./server/cwd-wait.js');
              let w = CW.verdict(cwd, { missing });
              if (w && w.why === 'mount_starting') {
                // B-ce65: SAID before the bounded wait — the page tells the person what the create waits for (the mount's name) and its
                // reply watchdog waits that long too, instead of «taking unusually long» at 15 s while the hub waits up to BACK_MS
                ws.send(JSON.stringify({ type: 'create-waiting', reqId: data.reqId, cwd, waitsFor: w.name, ms: CW.BACK_MS }));
                if (await CW.whenBack(cwd)) missing = await dirMissing();
                ws.send(JSON.stringify({ type: 'create-waiting', reqId: data.reqId, cwd, waitsFor: w.name, done: true }));   // its read (1): the wait is over — the page's line goes back to its own words
                w = CW.verdict(cwd, { missing });
                if (w && w.why === 'mount_starting') w = { ...w, why: 'mount_down' };   // it waited its bound: still not up
              }
              if (w && (w.why === 'vault_locked' || w.why === 'mount_down')) {
                global.__vsEvent?.('spawn-cwd-waits', `${w.why}/${data.resume ? 'resume' : 'new'}`);
                ws.send(JSON.stringify({ type: 'error', reqId: data.reqId, code: w.why, cwd, waitsFor: w.name, ...(w.held ? { held: true } : {}), message: w.why === 'vault_locked' ? CW.lockedWords(cwd, w) : CW.downWords(cwd, w) }));
                break;
              }
            }
            // Recreate-empty-and-resume (B-7812, user-approved DANGER path):
            // only on the client's EXPLICIT flag (set after a red confirm that
            // spells out the files are gone). The resumed agent is told the
            // dir was recreated empty via prompt-context (_cwdRecreated) — the
            // user's hard requirement against silently continuing on a false
            // premise.
            if (missing && data.recreateCwd === true) {
              let made = false;
              try {
                if (!data.hostId) {
                  made = await new Promise((resolve) => {
                    execFile('mkdir', ['-p', cwd], { timeout: 8000 }, (err) => resolve(!err));
                  });
                } else if (hosts) {
                  const hh = hosts.get(data.hostId);
                  const q = cwd.replace(/'/g, `'\\''`);
                  const out = hh ? await hosts._hostShell(hh, `mkdir -p '${q}' && echo __VS_MKDIR_OK__`, { timeoutMs: 8000 }) : '';
                  made = String(out).includes('__VS_MKDIR_OK__');
                }
              } catch { }
              if (made) {
                missing = false;
                cwdRecreated = true;
                global.__vsEvent?.('spawn-cwd-recreated', data.hostId ? 'host' : 'local');
                console.log(`[session] recreated missing cwd (user-confirmed): ${cwd}`);
              } else {
                ws.send(JSON.stringify({
                  type: 'error', reqId: data.reqId, code: 'cwd-mkdir-failed',
                  message: `Could not recreate the directory${hostName ? ` on ${hostName}` : ''}: ${cwd}`,
                }));
                break;
              }
            }
            if (missing) {
              global.__vsEvent?.('spawn-cwd-missing', `${data.hostId ? 'host' : 'local'}/${data.resume ? 'resume' : 'new'}`);
              ws.send(JSON.stringify({
                type: 'error', reqId: data.reqId, code: 'cwd-missing', cwd, hostName: hostName || undefined,
                message: `Working directory does not exist${data.hostId ? " on the session's machine" : ''}: ${cwd}` +
                  (data.resume ? ' — the folder may have been moved or deleted; restore it or start a new session in a valid folder.' : ''),
              }));
              break;
            }
          }
          // PER-SESSION GIT WORKTREE preflight (owner ruling 9). `--worktree`
          // makes the CLI exit 1 outside a git repo BEFORE the session exists
          // ("Error: Can only use --worktree in a git repository, but <dir> is
          // not a git repository." — measured on 2.1.257), so the user would
          // see a window that died instantly with the reason buried in the
          // buffer. Refuse HERE, with the reason and scope:'action' (a
          // session-scoped error flips live windows read-only — inc-mt2arppw).
          // CS separation: `hostId` is a PARAMETER — the same probe runs
          // locally through a bounded child process and on any machine handle
          // (ssh host OR dial device) through hosts._hostShell, exactly like
          // the cwd preflight above. A probe that cannot ANSWER (unreachable,
          // timeout) is not a refusal: it is `null`, and the spawn proceeds
          // with the CLI free to speak for itself.
          // The CLI's gate is `WorktreeCreate hook OR git repo` (2.1.257:
          // `if(!pX() && !await rh())`), so the probe answers BOTH halves —
          // mirroring only the repo half would refuse the very configuration
          // the CLI's own error text tells a non-git user to create.
          if (data.worktree) {
            const refuseNow = worktreeRefusal({ backend, want: true, isGitRepo: true, hasWorktreeHook: null }); // caps-only check first (no probe for a harness that has no flag)
            if (refuseNow) {
              ws.send(JSON.stringify({
                type: 'error', reqId: data.reqId, scope: 'action', code: 'worktree-unsupported',
                message: `${backend} sessions cannot run in their own git worktree — that flag exists only on Claude Code.`,
              }));
              break;
            }
          }
          // …but the REPO probe may only gate the spawns that actually EMIT the
          // flag. Round-2 verifier: gating it on `data.worktree` alone refused
          // a spawn that would never have sent `--worktree` at all — a plain
          // RESUME (worktreeSpawnArgs `resume-rebinds`: the CLI re-enters its
          // own recorded worktree), which carries the standing pick on every
          // restart/resume-all. A user whose repo later disappeared (incl. the
          // B-7812 recreate-cwd path, which rebuilds the folder EMPTY) could
          // then never resume that conversation again, refused for a flag the
          // spawn does not send. That is exactly what the comment above
          // forbids: a preflight STRICTER than the CLI it protects is a false
          // refusal. `unsupported` above stays unconditional — asking a
          // harness for something it has no flag for is a broken promise
          // whatever the spawn kind, and accept-and-ignore is the 2.361.4
          // failure.
          const wtWillPass = worktreeSpawnArgs({
            backend,
            want: !!data.worktree,
            resume: !!(data.resume && data.resumeId),
            fork: !!data.fork,
          }).pass;
          if (wtWillPass) {
            let isGitRepo = null;
            let hasWorktreeHook = null;
            let hostName = '';
            try {
              if (!data.hostId) {
                isGitRepo = await new Promise((resolve) => {
                  execFile('git', ['-C', cwd, 'rev-parse', '--is-inside-work-tree'], { timeout: 6000 }, (err, out) => {
                    if (err && err.killed) return resolve(null);            // timeout ⇒ unknown, never a refusal
                    if (err && err.code === undefined) return resolve(null); // git missing / spawn failure ⇒ unknown
                    resolve(String(out || '').trim() === 'true');
                  });
                });
                // Only worth asking when the repo half already failed — this
                // is the rescue branch, not a fact any other surface wants.
                if (isGitRepo === false) hasWorktreeHook = await claudeWorktreeHookConfigured(cwd);
              } else if (hosts) {
                const hh = hosts.get(data.hostId);
                if (hh) {
                  hostName = hh.name || hh.host || '';
                  const q = cwd.replace(/'/g, `'\\''`);
                  // ONE round trip answers both halves — a second ssh hop to
                  // ask about the hook would double the preflight's latency on
                  // every non-repo folder.
                  const out = await Promise.race([
                    hosts._hostShell(hh, `cd '${q}' 2>/dev/null && git rev-parse --is-inside-work-tree 2>/dev/null && echo __VS_GIT_OK__ || echo __VS_GIT_NO__; `
                      + `grep -l '"WorktreeCreate"' "$HOME/.claude/settings.json" .claude/settings.json .claude/settings.local.json 2>/dev/null | head -1 | grep -q . && echo __VS_WTHOOK_YES__ || echo __VS_WTHOOK_NO__`, { timeoutMs: 8000 }),
                    new Promise((r) => setTimeout(() => r(''), 8500)),
                  ]);
                  const txt = String(out);
                  isGitRepo = txt.includes('__VS_GIT_OK__') ? true : (txt.includes('__VS_GIT_NO__') ? false : null);
                  hasWorktreeHook = txt.includes('__VS_WTHOOK_YES__') ? true : (txt.includes('__VS_WTHOOK_NO__') ? false : null);
                }
              }
            } catch { /* probe failure = unknown, never a refusal */ }
            const refusal = worktreeRefusal({ backend, want: true, isGitRepo, hasWorktreeHook });
            if (refusal) {
              global.__vsEvent?.('spawn-worktree-refused', `${data.hostId ? 'host' : 'local'}/${refusal.reason}`);
              ws.send(JSON.stringify({
                type: 'error', reqId: data.reqId, scope: 'action', code: 'worktree-not-a-git-repo', cwd, hostName: hostName || undefined,
                // The escape hatch is the CLI's OWN advice, so a user working
                // in another VCS is told what to configure instead of being
                // left at a dead end (and a hook we simply could not read is
                // named here rather than silently overruling them).
                message: `"Run in a git worktree" needs a git repository${data.hostId ? ` on ${hostName || "the session's machine"}` : ''}, and ${cwd} is not one — start the session there without the worktree option, run \`git init\` in that folder, or configure a ${refusal.hookEscape || 'WorktreeCreate'} hook in settings.json to use --worktree with another VCS.`,
              }));
              break;
            }
            if (isGitRepo === null) console.warn(`[session] worktree requested but the git-repo probe could not answer for ${cwd} — letting the CLI decide`);
          }
          // ROOT FIX (2.304.0): the socket name is DERIVED FROM THE ID, not
          // minted independently. A session had TWO identities built from two
          // separate expressions (`sess-<seq>-<now>` and `cw-<seq>-<now>`);
          // any divergence between them — a re-read counter, a millisecond
          // drift, a future edit to one and not the other — silently maps two
          // sessions onto one session-meta file. Deriving makes them ONE
          // identity: the meta filename is now a pure function of the session
          // id, so a collision requires duplicate session ids, which the
          // counter+timestamp already excludes.
          const sockName = 'cw-' + id.slice('sess-'.length);
          const socketPath = path.join(SOCKETS_DIR, sockName);
          const sessionMode = data.mode === 'chat' ? 'chat' : 'terminal';
          // Shell-style tokenization: quoted segments stay one argument
          // (plain split broke e.g. --append-system-prompt "two words")
          const extraArgs = Array.isArray(data.extraArgs) ? data.extraArgs.map(String)
            : data.extraArgs
              ? (String(data.extraArgs).trim().match(/"[^"]*"|'[^']*'|\S+/g) || []).map(t => t.replace(/^(["'])(.*)\1$/, '$2'))
              : [];
          // S9 (B-03f2): a harness whose STORE forks server-side (opencode:
          // POST /session/:id/fork on the serve API) mints the NEW conversation
          // id BEFORE the spawn — the session then resumes THAT id (the wrapper's
          // session/load), nothing to adopt later. The user asked for a fork:
          // any failure (not installed / serve parked / no fork endpoint / 404)
          // is refused LOUDLY here, never degraded into a plain resume (that
          // would put two writers on the parent — the B-4058 class).
          if (data.fork && data.resume && data.resumeId && !data.hostId && typeof harnessOf(backend).store?.forkSession === 'function') {
            let forked;
            try { forked = await harnessOf(backend).store.forkSession(data.resumeId, { cwd }); }
            catch (e) {
              ws.send(JSON.stringify({ type: 'error', reqId: data.reqId, code: 'fork-failed', message: `Fork failed: ${e.message}` }));
              break;
            }
            console.log(`[session] ${backend} fork minted ${forked.id} from ${data.resumeId}`);
            data.forkedFromId = data.resumeId;
            data.resumeId = forked.id;
          }
          // ── RESUME CONTINUITY LADDER (B-6b6d, owner ruling 2026-09-07) ──
          // explicit pick > the CONVERSATION's own last value > instance
          // default (logged). The rule and the reason it is not two `||`
          // chains live in src/resume-continuity.js; the per-harness READER is
          // the descriptor's `store.lastTurn<Knob>` hook, whose presence IS the
          // "this harness can answer" declaration (codex: model+effort from its
          // rollout's turn_context; claude: model from the transcript's last
          // assistant record, and NO effort source at all — nothing claude
          // writes records it, so a claude resume with no pick commands none).
          // The client stopped filling the instance default on resumes in the
          // same change: it is a NEW-session default, and filling it there is
          // what suppressed this ladder and resumed an `ultra` conversation at
          // `xhigh` (2.369.62's known residue).
          {
            const isResume = !!(data.resume && data.resumeId);
            const hstore = (() => { try { return harnessOf(backend).store || {}; } catch { return {}; } })();
            // THE instance default of a spawn knob = the harness's DECLARED row
            // (design-harness-settings §5): typed, defaulted, and absent for a
            // harness that never declared it (a plain '' — never another
            // harness's value).
            const instDefault = (key) => { try { return harnessDeclares(backend, key) ? String(harnessSetting(backend, key) ?? '') : ''; } catch { return ''; } };
            const fromConversation = async (hook) => {
              if (!isResume || typeof hook !== 'function') return '';
              // A conversation whose records cannot be read is a MISSING FACT,
              // never a silent zero: it degrades to the instance default one
              // rung down, and the reason is logged verbatim (the swallowed-
              // degrade lesson).
              try { return (await hook(data.resumeId, cwd)) || ''; }
              catch (e) { console.warn(`[session] resume continuity: could not read ${backend} ${String(data.resumeId).slice(0, 8)} — ${e.message}`); return ''; }
            };
            // An explicit pick wins inside the ladder anyway, so do not pay for
            // a store read whose answer cannot be used (an opencode read talks
            // to the serve; a transcript read hits the disk, on the spawn path).
            // `explicit` is forwarded UNTOUCHED: only the ladder may decide what
            // `''` means, and on a NEW session it means a STATED "Auto (model
            // default)" rather than silence (r2 review — normalising it here is
            // how the dialog's explicit Auto became `codex.defaultEffort`).
            const pickKnob = async (explicit, hook, key) => {
              const stated = explicit !== undefined && explicit !== null && String(explicit).trim() !== '';
              const conversation = stated ? '' : await fromConversation(hook);
              return resumeSpawnPick({
                explicit, conversation, instanceDefault: instDefault(key),
                resume: isResume, hasSource: typeof hook === 'function',
              });
            };
            const picks = {
              model: await pickKnob(data.model, hstore.lastTurnModel, 'defaultModel'),
              effort: await pickKnob(data.effort, hstore.lastTurnEffort, 'defaultEffort'),
            };
            // …and on a NEW session the client already ran the same ladder to
            // fill its own chip, so a resolved `<prefix>.default*` arrives here
            // as a bare string indistinguishable from a pick. `spawnOriginHint`
            // is the client saying which it was; applyOriginHint may only turn
            // OUR 'chosen' into 'instance'/'harness' and never touches the value
            // (round 3 — src/resume-continuity.js carries the whole argument).
            const hint = data.spawnOriginHint || {};
            picks.model.origin = applyOriginHint(picks.model.origin, hint.model);
            picks.effort.origin = applyOriginHint(picks.effort.origin, hint.effort);
            // Every downstream reader (the spawn, the pool chooser's declared
            // model, _spawnModel, the lock's implicit target, session._effort)
            // must see the value this session ACTUALLY starts with — one
            // resolved fact, not the request's intent.
            data.model = picks.model.value || undefined;
            data.effort = picks.effort.value || undefined;
            data._modelOrigin = picks.model.origin;
            data._effortOrigin = picks.effort.origin;
            // PLACEMENT IS NOT COMMANDING (round 3). The pooled-spawn chooser
            // downstream wants a model FAMILY ('fable'/'opus'/'sonnet' —
            // src/model-family.js, coarse by construction: no point release, no
            // `[1m]` variant) to project each member's model-scoped weekly cap.
            // A claude resume now deliberately commands NOTHING, so `data.model`
            // is undefined there, `familyOfModel(null)` is null and the chooser
            // short-circuits BEFORE decidePoolSwitch — the session lands on the
            // pool's current target with no placement evaluation at all, even
            // when that member's scoped weekly bucket is spent (the 2.305.0
            // class), and a claude pool switch does not reach a running CLI for
            // ~25min (2.361.0) so the spawn-time placement is the one that
            // counts. This restores exactly the input master had (the client
            // used to fill `claude.defaultModel` into every resume) as a
            // PLACEMENT-ONLY hint: it never reaches data.model, the spawn spec,
            // the argv or session._spawnModel — that field records what the
            // spawn COMMANDED, and this spawn commanded nothing, so putting the
            // hint there would leak a value we never sent into session-meta,
            // the attach payload, the restart chip and sessionModelFor's floor.
            // Unset setting ⇒ null ⇒ master's behaviour when it was unset (the
            // chooser's default target).
            data._placementModelHint = data.model || instDefault('defaultModel') || null;
            if (isResume) console.log(continuityLogLine(backend, data.resumeId, picks));
          }
          // A REASONING EFFORT THE HARNESS'S CLI CANNOT TAKE (lane effort-menu-per-harness) is refused BY NAME before
          // anything spawns — never dropped (agy started a picked «ultracode» as no effort at all, without a word). The
          // adapter names its levels (agy: AGY_EFFORTS); the menus never offer such a value, so this is the fence behind them.
          const effortNo = typeof adapter.effortRefusal === 'function' ? adapter.effortRefusal(data.effort) : null;
          if (effortNo) {
            ws.send(JSON.stringify({ type: 'error', reqId: data.reqId, scope: 'action', code: effortNo.code, effort: effortNo.effort, levels: effortNo.levels, message: effortNo.message }));
            break;
          }
          // A THIRD-PARTY PROVIDER serves only ITS OWN rows (lane lg-providers U2 r1): the model this session starts with is
          // re-resolved against them — an alias onto its row, nothing ⇒ its default; one it does not serve is REFUSED by name
          const pvModelOf = (id) => (accounts && typeof accounts.providerModelFor === 'function' ? ((r) => { if (!(r && !r.ok && r.code === 'model-not-served' && /^(instance|harness)$/.test(String(data._modelOrigin || '')))) return r; const bare = String(data.model || '').replace(/\[1m\]$/i, ''); const a = bare !== String(data.model || '') ? accounts.providerModelFor(id, backend, bare) : null; return a && a.ok ? a : accounts.providerModelFor(id, backend, ''); })(accounts.providerModelFor(id, backend, data.model)) : null);   // an instance / harness DEFAULT the provider does not serve (through its aliases) is no pick at a third party: its own default (U2 cure)
          const pvModel = pvModelOf(data.accountId);   // (the same rule for a pooled create the store places on a provider member: pool unit (d), below)
          if (pvModel && !pvModel.ok) { ws.send(JSON.stringify({ type: 'error', reqId: data.reqId, scope: 'action', code: pvModel.code, message: pvModel.message })); break; }
          if (pvModel) data.model = pvModel.model;
          // A MACHINE WHOSE MANAGED CLAUDE SETTINGS SET A KEY HELPER, OR AN ANTHROPIC CREDENTIAL OR ADDRESS (主开发 23:45Z, as if a must —
          // read from the CLI itself, src/managed-claude-settings.js): the CLI applies the managed source over the inline override and
          // the spawn's env, so a third-party provider's start would hand the organisation's credential to the provider's address —
          // REFUSED BY NAME before anything spawns; what cannot be told refuses too. Only Claude Code (creds.keyHelper)
          // (a start aimed at a PAIRED machine is refused below by its own name — provider-remote, this machine only — never by this one)
          if (!data.hostId && pvModel && harness && harness.creds && harness.creds.keyHelper) {
            const mh = await MANAGED.managedHelperFact({ dir: typeof managedClaudeDir === 'string' ? managedClaudeDir : null });
            if (mh.named !== false) {
              const said = MANAGED.refusalOf(mh, (() => { try { return accounts?.providerRecordOf?.(data.accountId)?.label || data.accountId; } catch { return data.accountId; } })());
              ws.send(JSON.stringify({ type: 'error', reqId: data.reqId, scope: 'action', code: said.code, message: said.message, i18n: said.i18n }));
              break;
            }
          }
          // B-6c55: A LOCKED CONVERSATION'S CONTEXT ASK rides the spawn — the saved fact (the person's, src/lock-context.js), else the
          // spawn's own model when it names [1m]. The TARGET (data.model, the lock, _spawnModel, the pool's request model) stays as it
          // was (law b): only the --model the CLI is COMMANDED with gains [1m]. A CLI whose own catalog says the model has no long
          // context is SAID to the person by name (law c) — never a silent short context
          // the saved fact applies only to the model the lock holds (a model the gear set beside a stale fact is never given it), and
          // without one the spawn's model speaks only when it was the person's own pick (origin 'chosen' — never an instance default)
          const lockOn = !!data.modelLock && !!data.model && require('./server/model-ask.js').sameModel(data.model, data.lockModel || data.model);
          data._lockContext = lockOn ? (LOCKCTX.lockContextOf(data.lockContext) || (data._modelOrigin === 'chosen' ? LOCKCTX.lockContextFor(data.model) : null)) : null;
          let catalog = null;
          if (data._lockContext && !data.hostId) { try { catalog = require('./server/cli-model-catalog.js').view(); } catch { catalog = null; } }   // a remote machine's CLI is not this catalog's: not judged
          const cmdOf = LOCKCTX.commandOf(data.model, data._lockContext, catalog);
          let commandModel = data._lockContext ? cmdOf.model : data.model;   // (`let`: pool unit (d) re-commands a pooled provider placement's model below)
          data._spawnContext = LOCKCTX.contextOf(commandModel);   // what the spawn COMMANDED (a later Lock on this process reads it)
          // SAID after the start registered (batch 21's cure: below, beside the settings-file notices) — a resume refused on the way
          // never «resumed with the standard context»
          data._contextRefused = cmdOf.refused ? String(data.model || '') : null;
          const codexThreadBaseline = typeof SP.threadBaseline === 'function' && !data.resumeId // spawn.threadBaseline: the id appears after the spawn
            ? SP.threadBaseline({ activeSessions })
            : null;

          ensureDir(SOCKETS_DIR);
          ensureDir(BUFFERS_DIR);

          // Billing identity (Claude: subscription ↔ API/console account; Codex:
          // ChatGPT subscription via an isolated CODEX_HOME). Local sessions get
          // the auth via the spawn process env; REMOTE sessions get an API key
          // via an ssh-stdin-shipped 0600 file + shell prefix assignment (see
          // remoteAccountEnv — subscription accounts stay local-only). Resolved
          // BEFORE the session object so a bad account aborts the create cleanly.
          let spawnAccount = null;
          // A LINKED account (same email as the host's own login) spawns via
          // the host's login (spawnAccount nulled below) but the PICKED
          // identity must survive onto session._accountId — else the badge
          // and the billing switcher's ✓ degrade to "CLI login @ host" and a
          // successful switch reads as failed (2.241.0, userN's report).
          let linkedAccountId = null;
          // ADOPT vs explicit billing pick (B-b87b): an adopted session keeps
          // the SURVIVING child's original billing — the requested account
          // would be stamped on the badge but never take effect (billing lie,
          // exactly what the switcher exists to change). With an explicit
          // pick, skip adoption entirely: fall through to the writer sweep +
          // respawn so the pick is real. Adoption probes below carry the same
          // !data.accountId gate.
          if (data.accountId && data.keeperSid) {
            console.log(`[session] explicit account pick ${String(data.accountId).slice(0, 12)} — skipping keeper adopt of ${data.keeperSid} (respawn applies the pick)`);
            delete data.keeperSid; delete data.keeperKind;
          }
          // the DECLARED pool row (caps.pool) on a harness whose credentials VibeSpace manages — or a harness whose creds
          // declare how a named account spawns (creds.spawnForm) without a pool: antigravity's per-session Google accounts
          let poolFallbackRec = null;   // (B-d578 F2 cure, r2939 (1)) the record of a move onto the pool's fallback — rides THIS create's first meta write
          if (harness && harness.creds && accounts && (capsOf(backend).pool || !!harness.creds.spawnForm)) {
            try {
              // Plan C (2.315.0): a LOCAL pooled session gets its own link,
              // chosen by the session's declared model (deps.poolChooser reads
              // the usage caches with the estimator overlay — the store never
              // does). Remote pools stay refused upstream; non-pool accounts
              // ignore the opts entirely.
              // The model here is a FAMILY hint for placement, NOT the spawn's
              // command — a claude resume commands nothing (B-6b6d) and
              // `familyOfModel(null)` skips the whole evaluation, so
              // `_placementModelHint` (set with the ladder above) carries the
              // instance default in as the family guess master used to get.
              // THE CONVERSATION'S PIN (2026-09-28): a RESUME carries the conversation's own pin
              // (the client's session config `poolPin`); a FORK starts unpinned. It is honoured only
              // for the pool this spawn bills and a member that pool still lists — the chooser then
              // starts the conversation on it when it can serve (a codex pool spawns straight onto
              // the pinned member's CODEX_HOME, which is how its process HOLDS it).
              const rp = resumePoolPin(data, accounts, backend);
              data._poolPin = rp ? rp.pin : null;
              data._poolPinPool = rp ? rp.poolId : null;
              // a REMOTE spawn says so (`remote`): a localOnly creds row (antigravity) refuses it by name
              spawnAccount = accounts.resolveForSpawn(data.accountId, backend, data.hostId ? { remote: true } : {
                ...(capsOf(backend).planC ? { sessionKey: id } : {}), // a per-session pool link only where the harness DECLARES plan C (caps.planC — claude)
                // the store hands the chooser THE POOL IT RESOLVED for this spawn (per backend: a codex conversation on
                // the default bills the CODEX default) — the caller never re-derives it (verify r2: a re-derivation here
                // asked the claude default for a codex resume and nothing noticed)
                // (…and the pool DEFAULT the store self-heals is the POOL's choice: the conversation's pin rides only its own link)
                // (`hinted`: the family is the instance default standing in for a resume that commands none — no spare-lane placement on a guess, B-8a65 verify r1)
                // (`forDefault`: the store is placing the POOL's default, not this conversation — no proving spawn there, lane reset-unproven r3)
                // (`resumeOf`, B-d578 pool unit (a): a RESUME names the backend id it resumes — a conversation the pool moved to another
                // provider starts on the member it was moved to, not where the rules under 'never' would put it back; a fork never)
                chooseMember: (poolId, how = {}) => poolChooser?.(poolId, { model: data.model || data._placementModelHint || null, hinted: !data.model, forDefault: !!how.forDefault, ...(how.fallbackOnly ? { fallbackOnly: true } : {}), ...(data._poolPin && !how.forDefault ? { pin: data._poolPin.memberId } : {}), ...(data.resumeId && !data.fork ? { resumeOf: String(data.resumeId) } : {}) }),
                pinned: !!data._poolPin, // a codex pool spawns straight onto the chooser's answer only for a pinned conversation
              });
            }
            catch (e) {
              // the B-f276 family's accounts store (lane bl-windows, 主开发 r2947 — THE MONEY): the accounts could not be read, so NOTHING
              // starts or resumes on another login — never the «deleted account» degrade below (it rewrites the conversation's account to
              // none for good): refused by name, the conversation and its meta untouched; it starts once the accounts read
              if (e && e.code === 'accounts_unread') { ws.send(JSON.stringify({ type: 'error', reqId: data.reqId, code: 'accounts_unread', ...(data.resumeId ? { resumeId: data.resumeId } : {}), message: e.message })); return; }
              // Host-held subscription (2.199.0): an account whose login lives
              // ONLY on a host has an EMPTY local dir — resolveForSpawn throws
              // "not logged in" before the hostSubs mapping below ever runs
              // (real report: picking the account for a session on that very
              // host failed). Probe the host before failing the create; the
              // spawn then points at the host-side dir, nothing ships.
              let rescued = null;
              // DELETED billing account on a RESUME (2.335.0, real report):
              // the stored accountId no longer exists — nothing to re-login,
              // so a hard throw bricks the conversation forever. Degrade to
              // the global login and SAY so; a fresh create keeps the throw
              // (the user just picked that account — failing loud is right).
              if (data.resumeId && /unknown account/.test(String(e.message))) {
                // B-a5a4 (1): a harness whose conversation lives in its account's OWN store never degrades — refused by name
                const gone = (() => { try { return require('./routes/sessions').acctGoneOf(backend); } catch { return null; } })();
                if (gone && gone.refuse) { ws.send(JSON.stringify({ type: 'error', reqId: data.reqId, code: 'resume-account-gone', resumeId: data.resumeId, message: gone.refuse })); return; }
                try { serverNotice?.(`resume-acct-gone-${id}`, `The billing account this conversation used was deleted — it resumed on the default login instead. Pick a new account in its billing switcher if needed.`, { level: 'warn' }); } catch { }
                console.warn(`[session] resume ${id}: stored account ${String(data.accountId).slice(0, 16)} no longer exists — degrading to global login`);
                rescued = { id: null, kind: null, _acctGone: true };
                data.accountId = null; // the dead id must not hold the keeper-adopt gates closed downstream
              }
              if (!rescued && data.hostId && hosts && SP.hostHeldLogin
                  && typeof data.accountId === 'string' && /^sub-[\w-]{1,40}$/.test(data.accountId)
                  && /not logged in/.test(String(e.message))) {
                try {
                  // SINGLE-AUTHORITY verdict (B-f531, 2.244.0): the same
                  // evaluateOnHost that feeds every display surface decides
                  // the rescue — held dir first (deterministic creds), then
                  // email-linked; and a held dir whose REPORTED identity
                  // mismatches the account is refused loudly instead of
                  // billing whoever's creds sit in it.
                  const rs = await hosts.accountsStatus(data.hostId);
                  const facts = { ...rs, hostId: data.hostId, transport: spawnFor(hosts.get(data.hostId) || {}).id };
                  const v = accounts.evaluateOnHost(accounts.get(data.accountId), facts, {});
                  if (v.reason === 'held-identity-mismatch') {
                    ws.send(JSON.stringify({ type: 'error', reqId: data.reqId, message: `Account error: the login held on the host for this account actually belongs to ${v.dirEmail} — re-run "Log in on host as this account" to fix it` }));
                    return;
                  }
                  if (v.usable && v.how === 'host-held') {
                    rescued = {
                      id: data.accountId, kind: 'subscription', _hostSubReady: true,
                      remoteCreds: { dirName: 'subs/' + data.accountId, envVar: 'CLAUDE_SECURESTORAGE_CONFIG_DIR' },
                    };
                  } else if (v.usable && v.how === 'host-login') {
                    rescued = { id: null, kind: null, _useHostLogin: true };
                  }
                } catch { /* probe failed — fall through to the original error */ }
              }
              if (!rescued) {
                // the last resort (lane resume-account-door): a refusal the resume bar's verdict did not foresee names the doors too
                // a THIRD-PARTY provider's refusal says itself, with its code (an unlock door for vault_locked — lane lg-providers r1)
                if (/^(provider-|providers_|vault_|key-unreadable|no-key)/.test(String(e && e.code || ''))) { ws.send(JSON.stringify({ type: 'error', reqId: data.reqId, code: e.code, message: e.message })); return; }
                ws.send(JSON.stringify({ type: 'error', reqId: data.reqId, message: 'Account error: ' + e.message + ' — log it in again in Manage agents, or pick another account in Session Properties.' }));
                return;
              }
              spawnAccount = rescued;
              // email-linked rescue resolves to the host's own login = the
              // same null the 'subscription' sentinel produces downstream
              if (spawnAccount && spawnAccount._useHostLogin) { linkedAccountId = data.accountId; spawnAccount = null; }
              if (spawnAccount && spawnAccount._acctGone) spawnAccount = null; // deleted-account degrade = plain global login
            }
            // REMOTE + the account came from the DEFAULT (nothing specified) +
            // it could only reach the host by shipping subscription creds →
            // fall back to the HOST's own CLI login instead of failing the
            // spawn later with the shipping-disabled error (real report:
            // resuming a remote session with no account picked errored).
            // An EXPLICITLY chosen subscription still errors with guidance,
            // and an opted-in shipSubscriptionToRemote still ships.
            if (spawnAccount?.pooled && data.hostId) {
              // Pools are LOCAL-ONLY (the symlink dir lives on this machine;
              // its path in a remote spawn env is meaningless — the session
              // would silently bill the host's own login while badged as the
              // pool, B-b87b). Default-picked pool → fall back to the host's
              // login honestly; explicitly picked → refuse with guidance.
              if (data.accountId) {
                ws.send(JSON.stringify({ type: 'error', reqId: data.reqId, message: 'Account error: pooled accounts are local-only (the pool switches a credentials directory on THIS machine) — pick a real account for remote sessions, or the host’s own CLI login' }));
                return;
              }
              spawnAccount = null; // = the host's own login
            }
            // POOL UNIT (d) (row B-d578, ruling r1516): a POOLED create the store placed on a third-party PROVIDER member is judged
            // against THAT provider — the create named the pool, so the two checks a provider account takes above (its model
            // re-resolved against its own rows or refused by name; the machine's managed Claude settings) met no provider: they run
            // here, now that the member is known, before anything spawns
            const pooledPv = !data.hostId && spawnAccount && spawnAccount.pooled && spawnAccount.kind === 'provider' && /^pv-/.test(String(spawnAccount.poolTarget || '')) ? String(spawnAccount.poolTarget) : null;
            if (pooledPv) {
              // the record a move onto this fallback left in the engine's carry (the resume of a conversation the pool moved): the session takes it now
              if (data.resumeId && !data.fork) { try { const rec = poolChooser?.(spawnAccount.id, { resumeOf: String(data.resumeId), carryRecord: true }); if (rec && rec.provider === pooledPv) poolFallbackRec = rec; } catch { } }
              const pm = pvModelOf(pooledPv);
              if (pm && !pm.ok) { ws.send(JSON.stringify({ type: 'error', reqId: data.reqId, scope: 'action', code: pm.code, message: pm.message })); return; }
              if (pm) {   // the member's own row is what the spawn COMMANDS (the command was fixed before the member was known)
                data.model = pm.model;
                const cmdPool = LOCKCTX.commandOf(data.model, data._lockContext, catalog);
                commandModel = data._lockContext ? cmdPool.model : data.model;
                data._spawnContext = LOCKCTX.contextOf(commandModel);
              }
              if (harness && harness.creds && harness.creds.keyHelper) {
                const mhPool = await MANAGED.managedHelperFact({ dir: typeof managedClaudeDir === 'string' ? managedClaudeDir : null });
                if (mhPool.named !== false) {
                  const said = MANAGED.refusalOf(mhPool, (() => { try { return accounts?.providerRecordOf?.(pooledPv)?.label || pooledPv; } catch { return pooledPv; } })());
                  ws.send(JSON.stringify({ type: 'error', reqId: data.reqId, scope: 'action', code: said.code, message: said.message, i18n: said.i18n }));
                  return;
                }
              }
            }
            if (spawnAccount?.remoteCreds && !spawnAccount.secret && data.hostId && !data.accountId) {
              let allowShip = false;
              try { allowShip = !!serverSetting('accounts.shipSubscriptionToRemote'); } catch {}
              if (!allowShip || spawnAccount.remoteCreds.shippable === false) spawnAccount = null; // = the host's own login (an oat-bearing account keeps its secret channel instead; macOS Keychain-backed logins never ship — PR #23)
            }
            // EXPLICITLY-chosen subscription on a remote host without the
            // ship opt-in: when the account IS the machine's own login (same
            // email — the identity probe is reliable since 2.197.0), run on
            // the host's login directly instead of failing (real report: "I
            // logged this exact account in ON the machine, yet picking it
            // says this-machine-only"). Zero creds ship — §ban-safety
            // unchanged; a non-matching account still errors with guidance.
            if ((spawnAccount?.remoteCreds || spawnAccount?.oatOnly) && data.hostId && data.accountId && hosts) {
              let allowShip = false;
              try { allowShip = !!serverSetting('accounts.shipSubscriptionToRemote'); } catch {}
              // oatOnly always probes: a host-HELD login outranks the oat
              // (full capability, same identity) and the held-identity-
              // mismatch refusal must not be skippable by adding a token.
              // shippable===false (macOS Keychain-backed, PR #23) probes too —
              // held/linked still work there; only shipping is off the table.
              if (!allowShip || spawnAccount.oatOnly || spawnAccount.remoteCreds?.shippable === false) {
                try {
                  // SINGLE-AUTHORITY verdict (B-f531, 2.244.0) — same
                  // evaluateOnHost as the display surfaces and the rescue
                  // path above. Precedence lesson (2.243.2): host-held beats
                  // email-linked (the dir's creds are deterministic; the
                  // host's config email goes stale right after a /login
                  // switch — the 2.114.1 class — and a stale match billed
                  // the machine's ACTUAL new login under the picked badge).
                  const rs = await hosts.accountsStatus(data.hostId);
                  const facts = { ...rs, hostId: data.hostId, transport: spawnFor(hosts.get(data.hostId) || {}).id };
                  const v = accounts.evaluateOnHost(accounts.get(spawnAccount.id), facts, {});
                  if (v.reason === 'held-identity-mismatch') {
                    ws.send(JSON.stringify({ type: 'error', reqId: data.reqId, message: `Account error: the login held on the host for this account actually belongs to ${v.dirEmail} — re-run "Log in on host as this account" to fix it` }));
                    return;
                  }
                  if (v.usable && v.how === 'host-held') {
                    spawnAccount._hostSubReady = true;
                    // oatOnly shape carries no remoteCreds — the held-dir
                    // pointer paths need one (dirName/envVar only, nothing ships)
                    if (!spawnAccount.remoteCreds) spawnAccount.remoteCreds = { dirName: 'subs/' + spawnAccount.id, envVar: 'CLAUDE_SECURESTORAGE_CONFIG_DIR' };
                  } else if (v.usable && v.how === 'host-login') {
                    linkedAccountId = spawnAccount.id; // identity survives the host-login mapping
                    spawnAccount = null; // = the host's own login (same account)
                  }
                } catch { /* probe failed — keep the explicit-account path (errors later with guidance) */ }
              }
            }
          }

          // A SUBSCRIPTION PICK SETS THE MACHINE'S KEY HELPER ASIDE (unit «billing pick alive», 主开发 2026-11-18 01:45Z;
          // src/billing-pick.js). A helper named in the machine's Claude settings outranks every OAuth login, and from 2.236.0 nothing
          // passed the adapter its neutralizer — a picked subscription billed the helper's paid credential. So the ONE spawn spec is
          // built HERE, after the account is resolved: the local dtach line, the daemon pipe and every remote builder run its args.
          // ONE VARIABLE (主开发 22:14Z, the meeting with lane lg-providers): the helper is set aside when the billing pick's verdict says so
          // OR the conversation runs on a third-party provider — the rule answers both (src/billing-pick.js: the resolved account's kind
          // 'provider'; its own key must never be outranked by the machine's helper — U2); every reader below (the named fact, the
          // notice a person sees) follows it, and a provider's words are its own (onProvider)
          const keyHelperOff = BILLPICK.setsHelperAside({ creds: harness && harness.creds, account: spawnAccount, linked: linkedAccountId });
          const onProvider = !!(spawnAccount && spawnAccount.kind === 'provider');
          // THE CURE (主开发 09:09Z, «as if a must»): the person's own settings FILE is set aside only when that is needed — the ONE read of
          // the fact for this start (shared with the notice below), asked BEFORE the build only by a start that carries such a file (a
          // start without one never waits on a machine); the spawn's own env places the CLI's settings (agentEnv + the account's env)
          let helperFactP = null;
          const ownRead = {};   // B-e7c0: the fact's read of the person's own file leaves its text here (this start's)
          const helperFact = () => (helperFactP = helperFactP || readHelperFact({ hostId: data.hostId || null, backend, creds: harness && harness.creds, sink: ownRead,
            env: { ...agentEnv(), ...((spawnAccount && spawnAccount.localEnv) || {}) },
            cwd, ownFile: typeof adapter.ownSettingsFile === 'function' ? adapter.ownSettingsFile(extraArgs) : null }));
          // (an ADOPTED process — keeperSid known here — keeps the argv it started with: nothing is asked, and its record reads the file as
          // GOVERNING — false — so no later push to the running CLI writes over a file it may hold; its reader's m1)
          const keyHelperNamed = keyHelperOff && typeof adapter.ownSettingsFile === 'function' && adapter.ownSettingsFile(extraArgs) !== null ? (data.keeperSid ? false : await helperFact()) : undefined;
          // B-e7c0: where the person's own settings FILE would be set aside (a helper named, or that fact unread) on THIS machine, the
          // text the fact's read found is merged instead (src/adapters/claude-code.js) — a paired machine keeps the set-aside (its file
          // is not this hub's to read); a file that is no JSON object, or was not read in time, is set aside as before
          // …only for a SUBSCRIPTION pick (a provider's start keeps its own road) whose own file does not ITSELF name a helper (that file is
          // about billing: set aside and said, as the release does)
          const ownGot = keyHelperNamed !== undefined && keyHelperNamed !== false && !data.hostId && !onProvider ? BILLPICK.ownSettingsOf(ownRead.text) : null;
          const ownSettings = ownGot && !BILLPICK.namesHelper(ownGot.settings, harness && harness.creds && harness.creds.keyHelper) ? ownGot.settings : null;
          const ownDropped = ownSettings ? ownGot.dropped : [];   // the names the merged copy does not carry — said once at the start
          // B-ddf3 unit 2 line 1 (the coordinator's r1407 (a)): a LOCAL start waits, bounded, for this machine's CLI config to land
          // (the shipped helper's run through the starter). A person is never refused their conversation for it: past the bound,
          // or after a failed landing, it STARTS and says once, by name, what may be missing (below, after the start)
          const cliLate = !data.hostId && !data.keeperSid && typeof cliConfigGate === 'function' ? await Promise.resolve(cliConfigGate()).catch(() => null) : null;
          const sessionSpec = adapter.buildSessionArgs({
            cwd,
            model: commandModel,
            permissionMode: data.permissionMode,
            resumeId: data.resume && data.resumeId ? data.resumeId : null,
            fork: data.fork || false,
            // the message a fork is cut at (the chat's fork-from-here) — the
            // adapter derives the fork flags from these two facts (B-8b7b)
            forkAt: data.fork && data.forkAtUuid ? String(data.forkAtUuid) : null,
            sessionName: data.sessionName,
            effort: data.effort,
            // client value wins; else the instance default (covers every create
            // path uniformly — resume, layout restore, billing switch)
            // RESPONSE STYLE (2.369.58): client value wins; else the
            // instance default for THIS harness's settings family
            // (`<prefix>.outputStyle` — never the hardcoded claude key, which
            // would have handed a codex spawn "Concise"). A value outside the
            // harness's own vocabulary is dropped here so it never reaches a
            // spawn: the caps row is the ONE enum.
            outputStyle: (data._effOutputStyle = (() => {
              const rs = capsOf(backend).responseStyle || { closed: true, values: [] };
              const want = data.outputStyle || (() => { try { return harnessDeclares(backend, 'outputStyle') ? String(harnessSetting(backend, 'outputStyle') || '') : ''; } catch { return ''; } })();
              // A CLOSED vocabulary (codex Personality) is validated here so an
              // out-of-enum value can never reach a spawn; an OPEN one (claude,
              // whose ~/.claude/output-styles/<name>.md are real user-defined styles)
              // passes through — `values` there is only what the picker offers,
              // and filtering on it would silently eat the user's own style.
              return (!rs.closed || rs.values.includes(want)) ? want : '';
            })()),
            extraArgs,
            // PER-SESSION GIT WORKTREE (owner ruling 9): the client's tick,
            // preflighted above. `fork` already rides this object; the PURE
            // rule in backend-caps decides whether the flag is actually
            // emitted (never on a plain resume — the CLI re-enters its own).
            worktree: !!data.worktree,
            // THE 「可用工具」 PICK (lane new-session-form): the harness's own tool switch — each adapter judges it with
            // backend-caps toolAllowlistArgs (claude --allowedTools/--disallowedTools, codex sandbox + approval)
            tools: data.tools && typeof data.tools === 'object' ? data.tools : undefined,
            // EVERY declared spawn row of this harness, typed, in ONE bag
            // (design-harness-settings §5): --brief, the prompt-cache trio,
            // disableModelFallback, tuiRenderer, … — INSTANCE settings read
            // server-side so every create path (new, resume, layout restore,
            // billing switch) behaves the same, and the adapter consumes them
            // as `opts.settings.<key>` (test-harness-contract drives each row).
            settings: (() => { try { return harnessSpawnSettings(backend); } catch { return {}; } })(),
            initialPrompt: data.initialPrompt || '',
            mode: sessionMode,
            // an explicit per-session pick only; the instance default rides `settings.tuiRenderer`
            tuiRenderer: data.tuiRenderer || '',
            // Shell helper terminals auto-type this — the adapter arms the
            // DISABLE_UPDATE_PROMPT guard (oh-my-zsh's rc-time [Y/n] eats the
            // first typed char: "claude /login" → "laude"). 2.196.0: the field
            // never reached the server before, so the guard was dead code and
            // the mangling hit REMOTE shells (env rides the exec-env prefix).
            initialCommand: data.initialCommand || undefined,
            // Background-job owner notify (2.344.0): our sessions run bypass-
            // permissions, whose inbound default HOLDS an unattested peer
            // message — pre-accept via the CLI's documented --settings knob so
            // job notifications actually deliver. Follows the same global
            // toggle that gates sending; repo/managed settings can tighten.
            // LOCAL spawns only (the remote field is data.hostId — a data.host
            // guard was a dead check, caught by the 2.344.0 review): accept
            // only where our peer-messaging can actually deliver.
            acceptPeerMessages: (() => { try { return !data.hostId && serverSetting('agents.jobNotify') !== false; } catch { return !data.hostId; } })(),
            // unit «billing pick alive» (src/billing-pick.js): a subscription the person picked sets the machine's key helper aside —
            // false for the bare «the CLI's own login» case, whose argv stays the release's byte for byte
            neutralizeKeyHelper: keyHelperOff,
            // the fact (true / false / null = cannot be read; undefined = not read: the start carries no settings file of the person's)
            keyHelperNamed,
            ownSettings,   // B-e7c0: the person's file to merge (this machine only), else null
            // 主开发 r4672 (1): the RESOLVED account's kind, a fact — a third-party provider's conversation ('provider') never carries the
            // entry label (src/claude-entry-label.js entryNameFor): its requests go to that provider's own address, not the vendor's
            accountKind: (spawnAccount && spawnAccount.kind) || null,
          });
          // Resume: the harness's persisted fork chain (store.forkChain → store.forkChainEnv; codex's forked_from).
          // MODEL CONTINUITY (2.369.32) and EFFORT CONTINUITY (B-21e4 item 4)
          // used to sit HERE, as two `if (!sessionSpec.env.CODEX_WEBUI_*)`
          // post-fills. They now run BEFORE the spawn spec, for every harness,
          // through the resume-continuity ladder above — the post-fill could
          // only ever fire when the client sent nothing, and the client sent
          // the instance default on every resume (B-6b6d), so the fallback the
          // env test was guarding was unreachable exactly when it was needed.
          if (data.resumeId && sessionSpec.env) Object.assign(sessionSpec.env, await forkChainEnvAsync(backend, data.resumeId));   // B-a60e remainder: codex's rollout awaited in the rollout index, never walked here

          // THE MEMBER THIS PROCESS WILL HOLD (design-reset-credits r2): a pool on
          // a backend that cannot hot-switch (caps row, never an id — codex's
          // app-server canonicalizes CODEX_HOME at startup) bills the member the
          // pool pointed at NOW for its whole life, whatever the link says after
          // a switch. Local only (pools are local-only); resolved AFTER
          // resolveForSpawn's self-heal re-pointed a dead target.
          let heldPoolMember = null;
          try {
            const pa = spawnAccount && !data.hostId && accounts ? accounts.get(spawnAccount.id) : null;
            if (pa && pa.type === 'pooled' && capsOf(backend).hotSwitch !== 'verified') heldPoolMember = spawnAccount.pinnedMember || accounts.poolCurrent(pa.id) || null; // a pinned codex spawn HOLDS its pin (2026-09-28)
            if (pa && pa.type === 'pooled' && spawnAccount.kind === 'provider' && spawnAccount.poolTarget) heldPoolMember = spawnAccount.poolTarget; // B-d578 pool unit (c): a PROVIDER member is held by its process whatever the hot switch (its key rides the env: no link can point at it)
          } catch { heldPoolMember = null; }
          // WHICH LONG-LIVED TOKEN this process carries (lane oat-identity-fix, verify r1 F1): the ENV road holds the
          // generation it spawned with for life; a LOCAL creds dir is the FILE road (the engine reads the token file's
          // generation per turn); a remote creds dir is not ours to read — no road, so its readings never judge a token
          const oatEnvRoad = !!spawnAccount && !spawnAccount._hostSubReady && (data.hostId ? spawnAccount.secret?.var === 'CLAUDE_CODE_OAUTH_TOKEN' : !!spawnAccount.localEnv?.CLAUDE_CODE_OAUTH_TOKEN);
          // lane new-session-form: the New Session form picks SEVERAL Task Groups (`taskIds`, in selection order); an older
          // page sends one `taskId`. The first stays `_initialGroupId` (and the meta `taskId` old pages read); the list rides
          // `_initialGroupIds` into every groupsForSession ask and the meta `taskIds`. A remote session joins them the same.
          const spawnGroups = spawnGroupIds(data);
          const session = {
            mode: sessionMode,
            pty: null, clients: new Map([[ws, { cols: data.cols || 120, rows: data.rows || 30 }]]),
            cwd, name: data.sessionName || `Session ${seq}`, // seq, not a re-read — two concurrent creates otherwise BOTH default to 'Session N'
            // lane peer-card-sender: a name GIVEN at creation (the client sends `sessionName` only for one — its 'Session N' default
            // stays client-side) outranks the first message on the sidebar card; persisted as meta `nameExplicit`
            _nameExplicit: typeof data.sessionName === 'string' && !!data.sessionName.trim(),
            // lane resume-all-paced L3: a bulk resume's conversation — its FIRST attach reads its history in the hub's bulk line
            // (codex-session-store.js oneReadAtATime), behind every read a person's own window asks for; every later attach is a person's
            _bulkRead: !!(data.resume && data.resumeId && data.bulk === true),   // B-cd4b r1093: the same resume as the first load's below (with no id there is no history to read)
            // lane door-day-one-landing (the naive-user studies: the sign-in terminal and the claude inside it showed as two
            // ACTIVE sessions nobody made): a terminal a sign-in opened says so — the sidebar lists no row for it, the live
            // count skips it, and the claude it runs is no discovered row (routes/sessions.js) — src/day-one.js SIGN_IN
            _purpose: data.purpose === DAY_ONE.SIGN_IN ? DAY_ONE.SIGN_IN : null,
            createdAt: Date.now(),
            // Per-session bearer for the agent-facing API (vibespace-status):
            // spawned into the CLI's env, scopes writes to this session only
            agentToken: 'vsst_' + crypto.randomBytes(12).toString('hex'),
            // Task Group this session was spawned INTO (from the New-session
            // dialog). Belonging is otherwise LIVE-derived server-side from the
            // session token; this only covers the window before the async UI
            // bind lands. VALIDATED to the id shape (metachar-free — kept as
            // defense-in-depth even though it's no longer shell-interpolated).
            _initialGroupId: spawnGroups[0] || null,
            _initialGroupIds: spawnGroups,
            // lane open-task-binds (the owner 2026-10-23: the lanes an automation opened with --task were missing from their
            // group's panel): the group it was opened INTO is a MEMBERSHIP, not a note — bound through the ONE bind writer
            // (src/server/conversation-ops.js settleBirthGroups, asked at the session list's notify point) the moment the
            // conversation has its own id (PURE src/task-membership.js birthBindVerdict); an automation's open adds `by`
            // int346 (new-session-form × open-task-binds): EVERY group the create names (`taskIds`, in the order picked) is
            // bound through that ONE writer — a New Session ticked into two groups is a member of both
            _birthBind: spawnGroups.length ? { groupId: spawnGroups[0], groupIds: spawnGroups.slice(), by: null } : null,
            // Billing identity badge (the key itself only lives in the spawn
            // env); a linked account spawns via the host's login but IS that
            // account — keep its identity (2.241.0)
            _accountId: spawnAccount?.id || linkedAccountId || null,
            _poolFallback: poolFallbackRec, // B-d578 F2 cure: the fallback move's record, in the create's FIRST meta write (poolFallback)
            _heldPoolMember: heldPoolMember, // the pool member this (non-hot) process bills for its life — src/server/usage-pool-engine.js heldPoolMemberFor
            _oatRoad: oatEnvRoad ? 'env' : (spawnAccount && !data.hostId ? 'file' : null), // src/server/usage-pool-engine.js tokenGenOf
            _oatGen: oatEnvRoad && Number(spawnAccount.oatGen) > 0 ? Number(spawnAccount.oatGen) : null,
            _poolPin: (data._poolPin && spawnAccount && spawnAccount.id === data._poolPinPool) ? data._poolPin : null, // THE CONVERSATION'S PIN (2026-09-28): carried by a resume, never by a fork — for the pool the spawn bills (resumePoolPin)
            // HOW the billing resolved (B-f531): rides the created reply so
            // the client persists/displays the POST-FACTO truth, never the
            // pre-facto intent
            _billingHow: spawnAccount?._hostSubReady ? 'host-held'
              // oat rung BEFORE remoteCreds: a logged-in+oat account carries
              // BOTH, but remote spawns use the SECRET channel (env token) —
              // stamping 'ship' told the client its rotating login was tarred
              // to the host, the exact action the oat exists to avoid
              : (spawnAccount?.secret?.var === 'CLAUDE_CODE_OAUTH_TOKEN' && (data.hostId || spawnAccount?.oatOnly)) ? 'oat'
              : (spawnAccount?.remoteCreds && data.hostId) ? 'ship'
              : spawnAccount ? 'local-env'
              : linkedAccountId ? 'host-login'
              : 'cli-login',
            // Billing intent at spawn: without an env key the CLI follows its
            // GLOBAL login — record what that was RIGHT NOW so the badge can
            // warn about API-billed sessions even after the user re-logins to
            // the subscription. The stream's init record (apiKeySource) later
            // CONFIRMS/overrides this guess (chat sessions).
            _authAtSpawn: (spawnAccount?.kind === 'subscription' || spawnAccount?.kind === 'codex-subscription') ? 'subscription-acct'
              : spawnAccount ? 'env-key'
              : typeof SP.authAtSpawn === 'function' ? SP.authAtSpawn({ hostId: data.hostId, accounts }) : null, // the harness's global-login guess (claude)
            backend,
            backendSessionId: data.resumeId || null,
            claudeSessionId: null, // the harness's own conversation-id field is stamped below (spawn.conversationIdField)
            sourceKind: data.sourceKind || null,
            agentKind: data.agentKind || 'primary',
            agentRole: data.agentRole || '',
            agentNickname: data.agentNickname || '',
            parentThreadId: data.parentThreadId || null,
            // Permission mode is not recoverable from the JSONL (init records
            // are stdout-only) — remember what this session was started with
            // so attach can restore the status bar immediately
            _permissionMode: data.permissionMode || null,
            // Effort is never reported back by claude — remember the commanded
            // value (spawn flag now, set-effort later) for the status bar
            _effort: data.effort || null,
            // WHICH FACT the spawn's model/effort came from (B-6b6d):
            // 'chosen' (a pick for this session) / 'conversation' (its own last
            // turn) / 'instance' (the <prefix>.default* setting) / 'harness'
            // (nothing sent — the agent's own config decides). Session
            // Properties SAYS this instead of guessing it from the value, which
            // cannot be done: a conversation's own value and the instance
            // default are frequently the same string.
            _modelOrigin: data._modelOrigin || null,
            _effortOrigin: data._effortOrigin || null,
            _modelLocked: !!data.modelLock,  // #6 lock v2: re-pin the target model after any fallback (turn-end)
            // EXPLICIT target only (review-caught): inferring it from data.model
            // re-targeted the lock to claude.defaultModel on any resume whose
            // saved config had no model. No target ⇒ the server latches the
            // first main-thread served model instead.
            _lockedModel: data.modelLock ? (data.lockModel || data.model || null) : null,
            _lockedContext: data._lockContext || null,   // B-6c55: the person's context ask beside the target (the repin sends both)
            _spawnContext: data._spawnContext || null,   // B-6c55: the context the spawn's --model carried
            _settingsFileGoverns: sessionSpec && sessionSpec.settingsFileGoverns ? [...SFW.GOVERNED_KINDS] : [],   // B-8dcf item two: what the person's settings file governs (running-CLI pushes skip it) — EVERY kind it covers (batch 21's cure)
            // Claude --fork-session mints a NEW session id at startup; this arms
            // the stdout parser to adopt it (so the fork becomes its own session
            // instead of shadowing the parent). One-shot, cleared on adoption.
            _forkRequested: !!data.fork && !!capsOf(backend).fork, // per-harness (codex thread/fork since 2.369.21)
            _forkSourceId: capsOf(backend).fork ? forkSourceOf(data) : null,   // B-5a4d root (r3282): the conversation a fork was made FROM, on the LIVE session too (the meta's forkSourceId below, the same rule); r3330: asked of the harness's fork capability as the request flag above is
            // resume spawn marker (2.219.0): lets the parser adopt claude's
            // IMPLICIT fork (locked-conversation resume mints a new id)
            _resumeSpawn: !!SP.resumeMayFork && !!(data.resume && data.resumeId),
            // lane cache-warmth-compact r2: a conversation this hub STARTED — nothing before its first record (the cache facts'
            // «no request yet» is true only for it; a resume, a fork or an adopted keeper session carries history)
            _bornHere: !(data.resume && data.resumeId) && !data.fork && !data.keeperSid,
            sockName, socketPath, buffer: '',
          };
          if (convIdField) session[convIdField] = data.resumeId || null;
          if (codexThreadBaseline) session._codexThreadBaseline = codexThreadBaseline;
          if (sessionMode === 'chat') {
            session._normalizer = createMessageManager(backend, id);
            session._normEpoch = Date.now();
            session._convFacts = require('./conversation-facts.js').factsFresh(); // lane conversation-facts: a CLI process this hub started — read from its first record
            // A NEW CONVERSATION IS BORN WITH ITS HISTORY LOADED (inc-mvl02dkn-gop0): `_historyLoaded` says "this
            // normalizer holds the whole conversation", and one that sees the conversation's FIRST record does — there
            // is nothing on disk before it. It used to be set only by the first ATTACH's rebuild, and the creator never
            // attaches (2.368.4): every chat started here stayed "not loaded" for its whole life (the owner's busy
            // chat, 1.4 h) — every history page re-read and re-converted the transcript under ids the live
            // stream does not use, and the browser / proposal / group cards waited for an attach that never came. A
            // resume, a fork or an adopted keeper session carries history from before this normalizer: the first
            // attach still loads it.
            if (!(data.resume && data.resumeId) && !data.fork && !data.keeperSid) { session._historyLoaded = true; session._normalizer.recordsFromStart = true; }   // B-437e: born here — every record seen
            session._normalizer.onOp((op) => {
              broadcastToSession(session, id, { type: 'msg', sessionId: id, ...op });
            });
          }

          // Use appropriate wrapper inside dtach:
          // - Terminal: pty-wrapper.js (spawns claude with PTY for TUI mode)
          // - Chat: chat-wrapper.js (spawns claude with --output-format stream-json)
          const bufFile = path.join(BUFFERS_DIR, id + '.buf');
          const metaFileW = path.join(BUFFERS_DIR, id + '.json');
          const wrapper = sessionSpec.wrapper || (sessionMode === 'chat' ? CHAT_WRAPPER : PTY_WRAPPER);
          // Remote session (collaboration P2, terminal mode): the LOCAL dtach+
          // pty-wrapper machinery stays (buffer/restore all work unchanged) but
          // the wrapped command becomes ssh -t … dtach -A on the REMOTE — a
          // network drop doesn't kill the agent; reattach = re-ssh.
          let spawnCmd = sessionSpec.cmd || cliCmds?.current?.('claude') || CLAUDE_CMD; // ONE CLI, ONE BINARY (lane cli-shell-truth r2)
          let spawnArgs = sessionSpec.args || [];
          // a THIRD-PARTY PROVIDER's command-line items (lane lg-providers U2 — codex's `-c model_providers…` table): the
          // descriptor's PURE plan, NON-secret by construction (the key rides localEnv / the 0600 file), ahead of the subcommand
          if (spawnAccount && Array.isArray(spawnAccount.argv) && spawnAccount.argv.length) spawnArgs = [...spawnAccount.argv, ...spawnArgs];
          let spawnEnvPairs = Object.entries(sessionSpec.env || {}).map(([k, v]) => `${k}=${v == null ? '' : String(v)}`);
          // B-0f13: REMOTE claude terminal sessions get the SAME passive
          // statusline capture local ones have had since 2.60.0 — the script
          // ships with the agent tools (per-spawn tar), the cache lands in
          // ~/.vibespace/usage-cache on the host (VIBESPACE_USAGE_CACHE — the
          // host has no data/ layout), and the quota-refresh read path merges
          // it back (fetchedAt-guarded, zero vendor calls). The --settings
          // JSON rides the normal rargs quoting (each remote arg is shq'd),
          // which is the whole quoting hazard handled in one place. Local
          // sessions keep their existing injection below, untouched.
          if (typeof SP.statusline === 'function' && sessionMode === 'terminal' && data.hostId) {
            try {
              spawnArgs = SP.statusline(spawnArgs, '"$HOME"/.vibespace/bin/vibespace-usage'); // the harness's statusline carrier (claude: --settings)
              // Spawn-fixed BY CONSTRUCTION on a remote host (no VIBESPACE_
              // ACCOUNT_LINK twin, unlike the local branch below): a host gets
              // the credentials TARRED to it at spawn and the engine's
              // re-points skip host sessions (`s2.host` ⇒ continue), so there
              // is no later switch for this key to be wrong about.
              const acctKey = spawnAccount?.poolTarget || spawnAccount?.id || '__global__';
              spawnEnvPairs.push(`VIBESPACE_ACCOUNT_KEY=${acctKey}`);
              // NO cache-dir env: env pairs are shq-quoted (a $HOME inside
              // single quotes never expands), and none is needed — the script
              // defaults to __dirname/../usage-cache, which at its shipped
              // location ~/.vibespace/bin resolves to ~/.vibespace/usage-cache
              // exactly. The env override exists for tests only.
            } catch { }
          }
          // B-e7c0 ON A PAIRED MACHINE (r723): where this start sets the person's own settings file aside (a subscription pick, the
          // machine's helper named or unread — the adapter said «billing» / «billingUnread»), its agent merges it THERE (src/server/settings-merge-device.js)
          // — after every layer this hub adds (the statusline above), before the ladder; a start whose agent cannot keeps the set-aside
          let deviceMerged = null;
          if (data.hostId && !data.keeperSid && keyHelperOff && !onProvider && keyHelperNamed !== undefined && keyHelperNamed !== false && !ownRead.late   // a machine whose probe went unanswered is not asked again (no second wait)
            && sessionSpec && Array.isArray(sessionSpec.settingsNotes) && sessionSpec.settingsNotes.some((k) => k === 'billing' || k === 'billingUnread')) {
            const ownFile = typeof adapter.ownSettingsFile === 'function' ? adapter.ownSettingsFile(extraArgs) : null;
            const r = ownFile ? await require('./server/settings-merge-device.js').askDeviceMerge({ hosts, hostId: data.hostId, id, args: spawnArgs, cwd, ownFile, by: (ws && ws._actBy) || 'system:spawn' }) : null;
            if (r && r.args) { spawnArgs = r.args; deviceMerged = r; sessionSpec.settingsNotes = sessionSpec.settingsNotes.filter((k) => k !== 'billing' && k !== 'billingUnread'); }
            else if (r && r.refused) console.warn(`[ws-create] ${id}: the paired machine did not merge the person's settings file (${r.refused}) — it is set aside for this start, as before`);
          }
          let spawnCwd = cwd;
          // Integration master switch (agents.vibespaceIntegration, 2.190.0):
          // OFF ⇒ this spawn carries nothing AGENT-VISIBLE — no VIBESPACE_API,
          // no agent tools on PATH, no remote tools/hook-register/reverse-
          // tunnel. Model-invisible plumbing is EXEMPT by design (2.190.1,
          // user decision): the usage statusline, billing env, and
          // VIBESPACE_SESSION_TOKEN (Ctrl+G editor auth; inert without the
          // api var — every consumer guards on both). Read per spawn = live.
          let integrationOn = integrationEnabled ? integrationEnabled() : true;

          // ── AGENT BROWSER, P0 (docs/design-agent-browser-v2 §3.2) ────────
          // Four variables at spawn, and that is the whole feature: no new
          // process, no daemon. They go into `spawnEnvPairs` HERE — above every
          // remote branch, which consumes that array and then empties it, and
          // above the local `r6Argv`, which reads whatever survives. One push,
          // both transports; `hostId` selects a transport, it never branches
          // the decision.
          //
          // The KEY is the CONVERSATION's, not this webui id's (§3.2.1): the id
          // minted 700 lines up changes on every resume, so keying on it would
          // leak a browser, a namespace, a daemon and a pinned tab per resume.
          // A fork mints a NEW key — a fork is a new conversation and must not
          // inherit another one's cookies (D15).
          //
          // A REMOTE session also gets `spawnBrowserPre` (r3): the shell
          // fragment that decides its user-data-dir rung ON THE HOST, from that
          // machine's own config, riding every `buildRemoteExec` below in its
          // named `browser` slot — the names alone were measured to make two
          // browsers collide on a host whose config names a profile.
          let spawnBrowserPre = '';
          // B-f7ab verify r2: a KEYLESS spawn (per-session browsers off) still runs the pin ladder — its pick is recorded
          // in the session's record (`browserPinAtStart`) as the WITNESS the late key restores, so a default the user
          // changes AFTER this session started never reaches it (a default reaches a conversation only at its start)
          let spawnPinWitness = null;
          let spawnKeyNotKept = false;   // r4099: a key handed past the kept reconcile's bound — NOT KEPT: written into no record of this session (no binding)
          {
            const be0 = browserEnvOf();
            // r3786 (hold 3, THE START's ORDER): no conversation is handed a NEW browser before this start's reconcile of the kept folders'
            // notes has ended or its bound is over (the kept store's RECONCILE_WAIT_MS) — a resume in the first seconds would otherwise mint
            // a new key while its own folder's note (and the binding made again from it) is still unread
            // r3961: the wait and the prior key's read are ONE door of browser-env (startKeyOrder) — the reconcile in flight, whoever began it
            let keptOrder = null;
            const resumeAsk = (be0 && data.resume && data.resumeId && !data.fork) ? String(data.resumeId) : '';
            if (be0 && integrationOn && typeof be0.startKeyOrder === 'function') { try { keptOrder = await be0.startKeyOrder({ resumeId: resumeAsk }); } catch { keptOrder = null; } }
            const prior = resumeAsk ? (keptOrder ? keptOrder.prior : be0.priorKeyFor(data.resumeId)) : '';
            const bk = browserProfiles.browserKeyFor({
              prior, resume: !!(data.resume && data.resumeId), fork: !!data.fork,
              mint: browserKeyMod.mintKey, // THE mint (src/server/browser-key.js — a live session's first use mints through it too, B-f7ab; the fresh-key rule lives there, identity r4)
            });
            // `cwd` is the session's own directory — the one the CLI reads
            // `./agent-browser.json` from (finding ① r3: a project-level fence
            // was dropped whole by the generated config). For a remote session
            // it is a path on the OTHER machine; the resolver never reads it
            // here, the host's prelude does.
            // THE PROFILE PIN (P1, §3.2.5): explicit > this conversation's own
            // pin (a FORK copies its parent's, D15) > the Task Group default
            // (P1's second half hands it in) > the instance default > none.
            // The keeper answers lazily (null before wiring ⇒ ephemeral); the
            // ORIGIN is stated by the ladder and recorded beside the value.
            let pin = { profileId: '', dir: null, origin: 'harness' };
            let forkParentKey = ''; // VERIFY S5: the fork's copy of the parent's pin needs the parent's KEY below
            let pinOwed = null; // the B-f276 remainder, its read r2 (M3): the facts a create the held registry could not judge owes to its read
            try {
              const kp = require('./server/browser-keeper.js').keeper();
              // B-55dc THE SPAWN ROAD DECIDES: the Task Group store's first reads for this create (the cwd's realpath, a
              // relative discover row) are awaited off the loop, bounded — the profile and cap rungs below then answer as the release
              if (kp && integrationOn && typeof kp.taskGroupReadFor === 'function') { const rp = kp.taskGroupReadFor({ cwd, hostId: data.hostId || null, initialGroupId: spawnGroups[0] || null, initialGroupIds: spawnGroups }); if (rp) await rp; }
              if (kp && integrationOn) {
                forkParentKey = (data.fork && be0) ? be0.priorKeyFor(data.forkedFromId || data.resumeId) : '';
                // the Task-Group rung asks the store with the facts a create has (cwd + the dialog's taskId)
                const taskGroupDefault = kp.taskGroupDefaultFor({ cwd, hostId: data.hostId || null, initialGroupId: spawnGroups[0] || null, initialGroupIds: spawnGroups });
                // THE verdict (the keeper's ONE helper — the B-f276 remainder, its read r2 S2: the same for a create judged now and
                // one the held registry owes to its read): the ladder; then B-6b6d r3 — the New Session dialog sends the value it
                // filled in on the user's behalf (the group's / the instance default) as an EXPLICIT string, and its hint may only
                // DOWNGRADE the ladder's own 'chosen' to that rung; then lane new-session-form — the two-column form (it sends
                // `taskIds`) lists ONLY the profiles its groups admit, and a pick it sends is judged by the SAME verdict here
                // (mayAttach over those groups), never added to the profile's "Who can use it" at create
                const pinFacts = { explicit: data.browserProfileId || '', priorKey: prior, forkParentKey, taskGroupDefault, resume: !!(data.resume && data.resumeId), fork: !!data.fork };
                const hint = data.spawnOriginHint && typeof data.spawnOriginHint === 'object' ? data.spawnOriginHint.browserProfile : null;
                const formGroups = Array.isArray(data.taskIds) ? spawnGroups : null;
                pin = kp.pinVerdictForCreate({ facts: pinFacts, hint, formGroups });
                // the B-f276 remainder (bl-jobs): a HELD profile registry names no profile — the pin is never «no longer exists»: this
                // create OWES its pin to the registry's read (its read r2, M3: keyed by the conversation's browser key in the keeper,
                // carried by the conversation's record for a restart — never a live session's closure), judged by the same verdict
                if (pin.held) {
                  console.warn(`[browser] ${id}: ${pin.refused} — its pin is judged once the registry reads`);
                  // its read r3 (S8): the defaults AT THE START ride the facts — the instance default's raw setting and the Task Group's cap
                  // (both readable without the registry), judged with them later (a default reaches a conversation only at its start)
                  const gf = { cwd, hostId: data.hostId || null, initialGroupId: spawnGroups[0] || null, initialGroupIds: spawnGroups };
                  pinOwed = { facts: { ...pinFacts, instanceRef: typeof kp.instanceDefaultRef === 'function' ? kp.instanceDefaultRef() : undefined }, hint: hint || null, formGroups, remote: !!data.hostId, groupFacts: gf, cap: typeof kp.taskGroupCapFor === 'function' ? kp.taskGroupCapFor(gf) : null, at: Date.now() };
                  pin = { profileId: '', dir: null, origin: 'harness', held: true };
                }
                else if (pin.formRefused) console.warn(`[browser] ${id}: the New Session pick ${pin.formRefused} is not open to this conversation (${pin.refused}) — starting without it`);
                else if (pin.refused) console.warn(`[browser] ${id}: ${pin.refused} — starting ephemeral`);
              }
            } catch (e) { console.warn('[browser] pin ladder unavailable — ' + (e && e.message)); }
            // OWNER RULING A (2026-09-26): the pin is the conversation's DEFAULT ATTACHMENT, opened through the keeper by
            // its first bare browser command (the profile's ONE browser, joined when another conversation runs it) —
            // the spawn is NEVER handed the profile's directory (`pinnedDir: null` always). The study's path B: a pinned
            // conversation's own browser launched a second Chrome on the directory the keeper's held — exit 21
            // SingletonLock in the live view, then a silent fall-back to a temporary browser.
            const be = be0 ? be0.envFor({
              browserKey: bk.key, integrationOn, remote: !!data.hostId, cwd, pinnedDir: null,
            }) : { pairs: [], remotePrelude: '', variant: null };
            if (!be.variant && pin.profileId && pin.origin !== 'conversation') {
              // no key today (the switch is off): the ladder's pick at THIS instant is the witness (its date = the start)
              spawnPinWitness = { profileId: pin.profileId, origin: pin.origin, at: Date.now(), by: 'user' };
            } else if (!be.variant && pin.profileId && data.fork && forkParentKey) {
              // a keyless FORK: the copy the spawn would have made (the parent's row verbatim — never laundered)
              try { const pp = require('./server/browser-keeper.js').keeper()?.pinFor(forkParentKey); if (pp && pp.profileId) spawnPinWitness = { profileId: pp.profileId, origin: 'conversation', at: Number(pp.at) || 0, by: pp.by === 'agent' ? 'agent' : 'user' }; } catch { spawnPinWitness = null; }
            }
            if (!be.variant && spawnPinWitness) {
              // + the Task Group's default cap in force NOW (stampGroupCap's read, unstamped — there is no key to stamp it on)
              try { const kc = require('./server/browser-keeper.js').keeper(); const c0 = kc && typeof kc.taskGroupCapFor === 'function' ? kc.taskGroupCapFor({ cwd, hostId: data.hostId || null, initialGroupId: spawnGroups[0] || null, initialGroupIds: spawnGroups }) : null; spawnPinWitness.cap = c0 === undefined ? 'unread' : c0; } catch { spawnPinWitness.cap = null; }   // undefined = Task Groups held: witnessed UNKNOWN
            } else if (!be.variant && pinOwed) {
              // its read r2 (S5): a KEYLESS create the held registry could not judge — its WITNESS is the facts it owes, judged by the
              // late key (the same verdict) once the registry reads: the start's pick, a fork's parent row, never the default by then
              spawnPinWitness = { owed: pinOwed, at: Date.now() };
            } else if (!be.variant && be0 && integrationOn && !pin.held) {   // held: no empty start record (a late key judges afresh then)
              // the ladder ran and picked NOTHING: witnessed too (a cap may still be in force), so the late key knows the
              // start had no default rather than guessing from the default the user has by then
              let c = null; try { const kc = require('./server/browser-keeper.js').keeper(); c = kc && typeof kc.taskGroupCapFor === 'function' ? kc.taskGroupCapFor({ cwd, hostId: data.hostId || null, initialGroupId: spawnGroups[0] || null, initialGroupIds: spawnGroups }) : null; if (c === undefined) c = 'unread'; } catch { c = null; }   // undefined = Task Groups held: witnessed UNKNOWN
              spawnPinWitness = { profileId: '', origin: 'harness', at: Date.now(), by: 'user', cap: c };
            }
            if (be.variant) {
              // The key and the rung are recorded even for `none` (nothing
              // emitted): a later resume of this conversation reuses the key,
              // and a properties row can say WHICH rung decided.
              // THE session fields a key brings (key, rung, pin + origin, and — P2 §4.2 — the very pairs this process
              // browses with, so the live view of an EPHEMERAL browser asks its stream port under exactly these, never
              // a re-run of the ladder): ONE writer shared with a live session's late key (B-f7ab)
              browserKeyMod.applyKey(session, { key: bk.key, env: be, pin });
              // its read r2 (M3): a keyed create the held registry could not judge OWES its pin under its key (judged at the read whatever
              // becomes of this session); the record carries the facts for a restart before then (`browserPinOwed`, re-owed at the boot)
              if (pinOwed) { session._browserPinOwed = pinOwed; try { const ko = require('./server/browser-keeper.js').keeper()?.owePin?.(bk.key, pinOwed); if (ko && ko.kept) session._browserPinOwed = ko.kept; } catch (e) { console.warn(`[browser] ${id}: its owed pin was not registered — ${e && e.message}`); } }   // r4 S12: the record carries the facts the keeper KEEPS (a resume while held keeps the create's pick)
              // A pin that came from anywhere but this conversation's own record
              // becomes its record now, ORIGIN kept — that is what makes the
              // `conversation` rung answer on the next resume (and a fork's copy
              // stick to the fork, not to its parent).
              if (pin.profileId && pin.origin !== 'conversation' && !pin.held) {
                // identity verify r2 (2026-09-28): a REMOTE spawn's explicit pick never writes the conversation into "Who can use
                // it" — a session on another machine never reaches this machine's browser (the pin itself stays a preference)
                try { require('./server/browser-keeper.js').keeper()?.setPin(bk.key, pin.profileId, { origin: pin.origin, remote: !!data.hostId }); } catch { }
              } else if (pin.profileId && data.fork && forkParentKey && forkParentKey !== bk.key && !pin.held) {
                // VERIFY S5 (2026-09-26) MAJOR: a FORK's key is NEW and the 'conversation' rung above is the PARENT's pin —
                // copied into the keeper under the fork's key (the parent's `by`/`at` verbatim: no laundering), else the
                // fork's Session properties say "Pinned: work" while its bare commands open a temporary browser (the pin
                // is the default ATTACHMENT now, carried by the keeper's record alone — no directory rides the spawn env)
                try { require('./server/browser-keeper.js').keeper()?.copyPin(forkParentKey, bk.key); } catch (e) { console.warn(`[browser] ${id}: the fork's pin was not copied — ${e && e.message}`); }
              }
              if (pin.profileId) console.log(`[browser] ${id}: pinned to profile ${pin.profileId} "${pin.label}" (${pin.origin})${be.pinRefused ? ' — REFUSED at the browser layer: ' + be.pinRefused.why : ''}`);
              // MULTIVIEW D4 (design-browser-multiview): the conversation's OWN browser cap — kept per conversation by the
              // keeper like the pin (a resume carries the same key ⇒ the same cap); this is the session's copy for the meta
              // lane P verify (finding 5): the Task Group's default cap is STAMPED here, when the conversation starts
              // (once — a conversation that has its stamp keeps it), never read live off the group afterwards
              try {
                const kc = require('./server/browser-keeper.js').keeper();
                if (kc && typeof kc.stampGroupCap === 'function') kc.stampGroupCap(bk.key, { cwd, hostId: data.hostId || null, initialGroupId: spawnGroups[0] || null, initialGroupIds: spawnGroups });
                session._browserCap = kc && typeof kc.capOf === 'function' ? kc.capOf(bk.key) : null;
              } catch { session._browserCap = null; }
              spawnBrowserPre = be.remotePrelude || '';
              // lane S2 (naive study 2, T4): a SHARED profile chosen in the New Session dialog needs no attach-at-start here —
              // under owner ruling A the dialog's pick IS the pin, and a pin is the conversation's default ATTACHMENT (the
              // keeper opens / joins the profile's one browser on the first bare command; a refusal names the button)
              // `resume-unknown` is the leak this ladder exists to prevent, so
              // it is SAID rather than inferred later from orphaned dirs.
              if (bk.origin === 'resume-unknown') {
                console.warn(`[browser] ${id}: resuming ${String(data.resumeId).slice(0, 8)} but no previous browser key was recorded — minted ${bk.key} (this conversation's earlier browser, if any, is not reused)`);
                // r3786 (hold 3): past the start's reconcile's bound — TOLD BY NAME (its code: the agent's first browser answer, the card)
                if (keptOrder && keptOrder.code) { console.warn(`[browser] ${id}: ${keptOrder.code} — the kept browsers' notes were not read to their end within their bound when this conversation resumed; its earlier browser, if it had one, was not found in time and ${bk.key} is a new one, NOT KEPT (no binding, no note: its own kept browser stays its own)`); spawnKeyNotKept = true; try { require('./server/browser-kept-note.js').markNotKept(bk.key); } catch { } try { liveKeptStore()?.noteStartCode?.(bk.key, keptOrder.code); } catch { } }   // r4145 (5): marked in the note module even with no live store
              }
            }
            if (be.pairs.length) spawnEnvPairs.push(...be.pairs);
          }
          // A remote Add-subscription helper terminal needs this one transport
          // utility even when agent-visible Integration is OFF. It handles the
          // host's own Keychain/file login only and exposes nothing to agents.
          const needsClaudeLoginHelper = !!SP.loginShell
            && String(data.initialCommand || '').includes('/vibespace-claude-subscription-login.mjs');
          // ── THE SPAWN LADDER, ONE FILE PER TRANSPORT (decoupling wave 2b, lane dc-seams-server) ──
          // src/spawn/<transport>.js behind spawnFor(host) (src/spawn/index.js): this machine, an
          // ssh host, a dial device — tool shipping, account placement and adopt-vs-spawn live in the
          // member. A ladder answers the spawn line {spawnCmd, spawnArgs, spawnEnvPairs, spawnCwd}
          // for the shared dtach / pipe spawn tail below, or nothing once it has answered the socket.
          const ladderCtx = (extra) => ({ ctx, execFileAsync, ws, data, id, backend, SP, sessionMode, session, cwd,
            spawnAccount, integrationOn, spawnBrowserPre, needsClaudeLoginHelper, sweepOpts,
            spawnCmd, spawnArgs, spawnEnvPairs, spawnCwd, ...extra });
          if (data.hostId && hosts && sessionMode === 'terminal') {
            let h;
            try { h = hosts.get(data.hostId); }
            catch (e) { ws.send(JSON.stringify({ type: 'error', reqId: data.reqId, ...(e && e.code === 'hosts-unread' ? { code: e.code, message: e.message, i18n: { key: i18nKey('VibeSpace cannot read its paired machines right now — nothing was started. Open it again in a few minutes (it reads them again by itself).') } } : { message: 'Unknown host: ' + data.hostId }) })); return; } // the request named (lane phone-resume-keeps-layout r4 N2: a bare error ended no create on the page)
            const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
            // B-69ec THE REMOTE TWIN: a CLI's terminal runs the program THAT machine's login shell found (src/server/remote-cli.js);
            // it holds none ⇒ refused by name before anything starts; it could not be asked ⇒ the prelude decides, as before
            let rcmdT = null;
            if (cliCmds?.current?.(backend) != null) {
              try { rcmdT = await remoteCmdFor({ hosts, h, backend, name: cliCmds.remoteName ? cliCmds.remoteName(backend, spawnCmd) : (spawnCmd.includes('/') ? path.basename(spawnCmd) : spawnCmd), integrationOn }); } catch (e) {
                if (!e || e.code !== 'cli-missing') throw e;
                global.__vsEvent?.('spawn-cli-missing', `${backend}/remote`);
                ws.send(JSON.stringify(remoteRefusal(e, data.reqId))); return;
              }
            }
            const sp = await spawnFor(h).terminal(ladderCtx({ h, shq, ...(rcmdT ? { rcmd: rcmdT } : {}) }));
            if (!sp) return; // the ladder answered the socket
            ({ spawnCmd, spawnArgs, spawnEnvPairs, spawnCwd } = sp);
          } else if (data.hostId && hosts && sessionMode === 'chat') {
            // 2.139.0 (B-0588): codex remote chat rides the SAME keeper —
            // it's a content-agnostic byte pipe, so app-server JSON-RPC
            // (bidirectional incl. approvals) replays fine by byte offset.
            // Claude's stream-json flags are claude-only (they killed codex
            // spawns opaquely pre-2.129.1 — keep them gated).
            // Remote CHAT (P3): ssh -T gives a CLEAN pipe — stream-json must
            // NOT cross a remote dtach/pty layer (echo + CRLF corrupt JSON).
            // Local dtach still keeps the pipeline across server restarts; an
            // ssh drop ends the remote process (transcript survives remotely,
            // resume-able). Stream flags ride INSIDE the remote string; the
            // wrapper's appended flags land as harmless sh -lc positionals.
            let h;
            try { h = hosts.get(data.hostId); }
            catch (e) { ws.send(JSON.stringify({ type: 'error', reqId: data.reqId, ...(e && e.code === 'hosts-unread' ? { code: e.code, message: e.message, i18n: { key: i18nKey('VibeSpace cannot read its paired machines right now — nothing was started. Open it again in a few minutes (it reads them again by itself).') } } : { message: 'Unknown host: ' + data.hostId }) })); return; } // the request named (lane phone-resume-keeps-layout r4 N2: a bare error ended no create on the page)
            const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
            // ── B-4058 writer sweep script, SHARED by the ssh AND dial resume
            // paths (audit #11/#47 — it was ssh-only, so a device-side orphan
            // claude raced every dial resume as a second JSONL writer). The ONE
            // invariant before a resume: no other process may still be writing
            // this conversation's transcript. Legs: fd scan (kills ANY claude
            // holding <RID>.jsonl open — /proc on Linux, lsof on macOS/BSD),
            // lock-file scan, agentd PIPE-SESSION metas (both the ssh-agentd
            // root and per-instance device@/agentd@ roots — their setsid claude
            // survives pod recreation), keeper run-file bookkeeping (harmless
            // no-op on devices without the keeper).
            // the LOCAL shell's answer is LOCAL (lane cli-shell-truth r3): the remote runs the CLI's configured NAME
            const rcmd = cliCmds?.remoteName ? cliCmds.remoteName(backend, spawnCmd) : (spawnCmd.includes('/') ? path.basename(spawnCmd) : spawnCmd);
            // B-69ec THE REMOTE TWIN: the chat runs the program THAT machine's login shell found for the name (none ⇒ refused)
            let rcmdR = rcmd;
            if (cliCmds?.current?.(backend) != null) {
              try { rcmdR = (await remoteCmdFor({ hosts, h, backend, name: rcmd, integrationOn })) || rcmd; } catch (e) {
                if (!e || e.code !== 'cli-missing') throw e;
                global.__vsEvent?.('spawn-cli-missing', `${backend}/remote`);
                ws.send(JSON.stringify(remoteRefusal(e, data.reqId))); return;
              }
            }
            const rargs = [...spawnArgs];
            // The harness's chat transport flags (adapter.chatTransportArgs —
            // claude's stream-json set; the local chat-wrapper appends the same
            // list): only a harness that DECLARES the hook gets any (the P4
            // hazard: a blanket append once reached every future backend).
            const ta = adapter && typeof adapter.chatTransportArgs === 'function' ? adapter.chatTransportArgs() : [];
            for (const fl of ta) { if (!rargs.includes(fl[0])) rargs.push(...fl); }
            const sp = await spawnFor(h).chat(ladderCtx({ h, shq, rcmd: rcmdR, rargs }));
            if (!sp) return; // the ladder answered the socket
            ({ spawnCmd, spawnArgs, spawnEnvPairs, spawnCwd } = sp);
          }
          // SPAWN-TIME RE-RESOLVE (B-a18e) + THE CLI LOCATION LAW (lane cli-shell-truth): the pty terminal, the chat
          // wrapper and the daemon pipe all run THIS command — checked here, ONCE, for a new session AND a resume. The
          // person's login shell is the truth for where the CLI is (src/server/cli-cmd.js); found NOTHING ⇒ the create
          // is REFUSED by name with what was asked and where it looked, BEFORE the local ladder (its pre-resume writer
          // sweep), dtach, the socket, the buffer or the meta file — the client draws a dialog (cli-missing). Local
          // only: every remote branch above already replaced spawnCmd (ssh / node) or answered the socket.
          let cliShellPath = null;
          if (!session.host && cliCmds) {
            try { spawnCmd = await cliCmds.forSpawn(backend, spawnCmd); } catch (e) {
              if (!e || e.code !== 'cli-missing') throw e;
              global.__vsEvent?.('spawn-cli-missing', `${backend}/${e.answer || 'none'}`);
              ws.send(JSON.stringify({ type: 'error', code: 'cli-missing', reqId: data.reqId, backend, cli: e.cli, shell: e.shell || null, answer: e.answer || null, why: e.why || null, wrapper: e.wrapper || null, envName: e.envName || null, notExecutable: e.notExecutable || null, dangling: e.dangling || null, via: e.via || null, looked: e.looked || [], hubPath: e.hubPath || null, hint: e.hint || null, message: e.message }));
              return;
            }
            cliShellPath = cliCmds.spawnPath?.(backend) || null; // the shell found it ⇒ its PATH is the spawn's base
          }
          const usageEnvPairs = [];
          if (!data.hostId) ({ spawnCmd, spawnArgs, spawnEnvPairs, spawnCwd } = await spawnFor(null)[sessionMode](ladderCtx({ usageEnvPairs })));
          // R6 / session-brain step 4 (2.318.0, FLAG-GATED default OFF —
          // the design's own sequencing law: step 3 must soak first): a local
          // CHAT session spawns as a device-#0 PIPE session — the SAME
          // chat-wrapper with the SAME buffer/meta paths, supervised by the
          // daemon instead of dtach. Adoption-based: existing sessions stay
          // on their dtach path forever; only NEW creates route here, and any
          // failure falls through to the dtach spawn below (never worse).
          let r6Handle = null;
          const r6Wanted = !session.host && sessionMode === 'chat' && !!SP.localPipe
            && serverSetting?.('agentd.localPipeSessions') === true;
          // OPENCODE SERVE TERMINAL (S9 remainder piece (c), B-eac2): a shell
          // the OpenCode SERVE owns, bridged onto the normal ws terminal path.
          // `data.opencodePty` = "open a terminal in this OpenCode session" —
          // the serve creates the pty on ITS machine and streams it over a
          // loopback websocket that NEVER reaches the browser: we connect to
          // it here and hand setupSessionPty the same {onData,onExit,write,
          // resize,kill,pid} shape the daemon pipe shim uses, so xterm, input,
          // resize, the buffer file and every window action work unchanged.
          let ocPty = null;
          if (data.opencodePty) {
            // LOCAL ONLY, said out loud. The serve streams its ptys over a
            // loopback websocket, so a remote machine's shell is not reachable
            // from here (the access layer refuses the op for a hostId too);
            // the sidebar only offers the row locally, but a ws message is not
            // a promise — refusing with the reason beats a window that never
            // fills.
            if (data.hostId || session.host) {
              ws.send(JSON.stringify({ type: 'error', code: 'opencode-pty-remote', reqId: data.reqId, message: `The OpenCode terminal only works on this machine — the serve streams its terminals over a loopback socket that ${session.host || data.hostId} does not share. Open a normal terminal on that machine instead.` }));
              return;
            }
            try {
              ocPty = await openOpencodePty({ cwd: spawnCwd, title: data.name || null });
            } catch (e) {
              // reqId is what un-hangs the client's `ws.request` — an error
              // without it leaves the window spinning with nothing to read, and
              // it must be READ OFF `data` like every other refusal in this
              // file: a bare `reqId` here is a free identifier whose
              // ReferenceError only fires when a user actually clicks the row
              // (test-server-globals is the net; test-opencode-s9 pins the shape)
              ws.send(JSON.stringify({ type: 'error', code: 'opencode-pty-failed', reqId: data.reqId, message: `Could not open an OpenCode terminal: ${e.message}` }));
              return;
            }
          }
          let createPty;
          try {
            // THE SESSION'S NAMES (lane antigravity-spawn-argv, 2026-10-21): every pair below rides the spawn's ENV.
            // The wrapper is born with it (dtach and the R6 daemon pipe both pass `env`) and hands it to its CLI. It
            // never rides the command line. Until 2.369.336 these were an `env K=V … <cli>` prefix INSIDE the
            // wrapper's argv, which made `/usr/bin/env` the program agy-wrapper ran, with its flags in front of the
            // assignments (env's usage exit 125: every Antigravity conversation dead at its start). It also put the
            // session token in /proc/<pid>/cmdline, which every user can read. THE ONE LINE: src/spawn/line.js.
            const r6Pairs = [
              `EDITOR=${EDITOR_CMD}`, `CLAUDE_WEBUI_PORT=${PORT}`, `CLAUDE_WEBUI_SESSION_ID=${id}`,
              ...usageEnvPairs,
              // Agent-facing env: the vibespace tools (data/bin on PATH)
              // authenticate with the per-session token; Task Group belonging is
              // resolved server-side from that token (no task id in the env).
              // Integration OFF strips VIBESPACE_API + the data/bin PATH prefix
              // (the sane-PATH fallback itself stays — the systemd-minimal-env
              // incident class); the TOKEN stays deliberately (it is r6Base's —
              // the wrapper's env carried it already): data/bin/code
              // (Ctrl+G, invoked via the absolute EDITOR path) authenticates
              // with it, it's never model-visible, and every consumer (hook,
              // tools, codex wrapper) guards on api AND token so token-alone is
              // inert. The CLI itself never reads either var.
              ...(integrationOn ? [`VIBESPACE_API=http://127.0.0.1:${PORT}`] : []),
              // lane L r5 F3: the SESSION's directory — the browser tool's write fence (never the agent shell's
              // cwd). A LOCAL session's own cwd (`spawnCwd` = the session's cwd field, host label stripped above);
              // a remote session's CLI gets it from buildRemoteExec's prelude (this argv only runs the local
              // ssh/wrapper there, in the server's home), so it is not repeated here. Like the token it is inert
              // plumbing with integration OFF (no tool on PATH reads it), and structural like the remote export.
              ...(!session.host ? [`VIBESPACE_SESSION_CWD=${spawnCwd}`] : []),
              // AGENT_BIN_DIR (vibespace-* tools), NOT dirname(EDITOR_CMD):
              // the fake `code` lives in editor/ precisely so PATH never
              // resolves it (B-b87b — it shadowed real VS Code locally)
              // lane cli-shell-truth: the base is the person's login-shell PATH when the shell found the CLI (a
              // `#!/usr/bin/env node` shim finds the node their shell would); the hub's own otherwise
              `PATH=${integrationOn ? AGENT_BIN_DIR + ':' : ''}${cliShellPath || process.env.PATH || '/usr/local/bin:/usr/bin:/bin'}`,
              // Probed working X display (see server.js detectXDisplay) — the CLI
              // reads the clipboard itself on Ctrl+V, so it needs BOTH vars
              `DISPLAY=${X_ENV?.DISPLAY || process.env.DISPLAY || ''}`,
              ...(X_ENV?.XAUTHORITY ? [`XAUTHORITY=${X_ENV.XAUTHORITY}`] : []),
              `TERM=xterm-256color`, `COLORTERM=truecolor`,
              ...spawnEnvPairs,
            ];
            const r6Base = (() => {
                const env = {
                  ...agentEnv(), TERM: 'xterm-256color', COLORTERM: 'truecolor',
                  // The WRAPPER (always local, even for remote sessions) needs the
                  // agent API in its OWN env: the codex-chat-wrapper injects task
                  // context via thread/inject_items by calling /api/agent/*. The
                  // pairs above join this env in the ONE line (a pair wins, as the
                  // old `env VAR=val` prefix did), so the wrapper and its CLI see
                  // the same names. Always the LOCAL port.
                  // Integration OFF drops VIBESPACE_API (token kept — see the
                  // note above; wrapper guards require api AND token).
                  ...(integrationOn ? { VIBESPACE_API: `http://127.0.0.1:${PORT}` } : {}),
                  VIBESPACE_SESSION_TOKEN: session.agentToken,
                  ...Object.fromEntries(Object.entries(sessionSpec.env || {}).map(([k, v]) => [k, v == null ? '' : String(v)])),
                  // Remote resilience (2.124.0): tell the wrapper HOW to
                  // survive ssh death — chat reconnects the keeper pipe with
                  // an offset; terminal respawns ssh (remote dtach -A reattaches).
                  ...(session.host ? (sessionMode === 'chat' ? { VIBESPACE_REMOTE_SID: id } : { VIBESPACE_REMOTE_RETRY: '1' }) : {}),
                };
                // Billing identity: the key rides the PROCESS-ENV channel only
                // (dtach → wrapper `env: process.env` → CLI), never argv — argv
                // is world-readable in /proc/cmdline. No account → explicitly
                // strip any ambient key so the CLI uses its global login.
                // r2203: Integration OFF hands on NO hub address — an INHERITED one neither. A hub started by hand inside another VibeSpace
                // (its terminal or job) carries that hub's VIBESPACE_API, and agentEnv keeps the name (the device agent's back-tunnel rides it),
                // so this start drops it itself; ON, this hub's own address is set above. The hub's own env is untouched.
                if (!integrationOn) delete env.VIBESPACE_API;
                for (const n of require('./server/provider-spawn.js').ambientPlanNames(backend, env, undefined, process.env)) delete env[n];   // lane lg-providers U2 cure: no start inherits a provider's plan (address, key, models — told by its home, so BEFORE the deletes below) from the hub's env; a provider start lays its own below
                delete env.ANTHROPIC_API_KEY;
                delete env.CLAUDE_SECURESTORAGE_CONFIG_DIR;
                delete env.CLAUDE_CODE_OAUTH_TOKEN;                 // top-precedence in the CLI — ambient copy = wrong billing
                delete env.CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR;
                // Claude API key → ANTHROPIC_API_KEY; Claude subscription → its
                // own CLAUDE_SECURESTORAGE_CONFIG_DIR (relocates ONLY the creds
                // store, transcripts stay shared); Codex subscription → its own
                // CODEX_HOME (auth isolated, sessions/config symlinked shared).
                // All ride process-env, never argv. No account → the CLI's env
                // is left as-is (CODEX_HOME inherited from the server, if any).
                if (spawnAccount?.localEnv) Object.assign(env, spawnAccount.localEnv);
                // Per-request billing TRUTH (2.361.0, B-345b): LOCAL claude
                // sessions export the CLI's own api_request telemetry
                // (organization.id + request_id) to the loopback OTLP
                // receiver — the only channel that NAMES the billing org per
                // request (hot-switch stale tokens make link-intent
                // attribution wrong). Structurally local-only (remote CLIs
                // get env via buildRemoteExec, never r6Env) but gated
                // explicitly anyway; a user-provided OTEL endpoint in the
                // session spec wins (we never clobber their telemetry).
                if (!session.host && SP.otelExport && typeof otelEnv === 'function'
                    && !(sessionSpec.env && sessionSpec.env.OTEL_EXPORTER_OTLP_ENDPOINT)) {
                  const oe = otelEnv();
                  if (oe) Object.assign(env, oe);
                }
                return env;
              })();
            // THE ONE LINE: `node <wrapper> <buf> <meta> <spawnCmd> …spawnArgs`; the names ride r6Env. B-460d: a LOCAL
            // conversation's line starts with `nice -n 5` (both roads run it: dtach below, the daemon pipe above it) — the
            // setting read at THIS start; the fact rides the session (Session Properties) and its meta (a restart keeps it)
            // B-e7c0: the merged settings (the person's file + the override) go to <id>.settings (0600, THE ONE LIST's kind) — the line
            // carries its path; a file that cannot be written sets the person's file aside as before (only what this start adds)
            if (sessionSpec.ownFileMerged) spawnArgs = await ownSettingsOnDisk(spawnArgs, id, sessionSpec);
            const r6Pri = SPRI.priorityFor({ serverSetting, local: !session.host });
            session._cpuNice = ocPty ? ocServeFact() : (session.host && session._cpuNice !== undefined ? (session._cpuNice || SPRI.factOf((readSessionMeta(sockName) || {}).cpuNice)) : r6Pri.fact);   // an OpenCode serve terminal runs in the serve's pty, not this line: no fact; a paired machine's start brings ITS fact (src/spawn/dial.js, B-460d's remainder); an ADOPTED one keeps what its meta holds and claims nothing new (r705 (3))
            const r6Line = sessionSpawnLine({ node: NODE_CMD, wrapper, bufFile, metaFile: metaFileW, env: r6Base, pairs: r6Pairs,
              exe: spawnCmd, args: spawnArgs, priority: r6Pri.priority,
              handedFrom: agentEnv(),   // B-ba47's follow-up (主开发 r979): the mark = what this create handed against its sanitized base
            });
            const r6Argv = r6Line.argv, r6Env = r6Line.env;
            if (r6Wanted && hosts?.device) {
              try {
                const dm = await hosts.device(null);
                r6Handle = await dm.openPipeSession({ sid: id, cmd: r6Argv[0], args: r6Argv.slice(1), cwd: spawnCwd, env: r6Env });
                // kill/terminate + the step-2/3 device streams key on the daemon sid
                session.agentdSession = true; session.keeperSid = id;
              } catch (e) { console.warn('[r6] device session.open failed — dtach fallback:', e.message); r6Handle = null; }
            }
            if (!r6Handle && !ocPty) createPty = pty.spawn(DTACH_CMD, ['-c', socketPath, '-E', '-r', 'none', ...r6Argv], {
              name: 'xterm-256color', cols: data.cols || 120, rows: data.rows || 30, cwd: spawnCwd, env: r6Env,
            });
          } catch (err) {
            if (sessionSpec && sessionSpec.ownFile) fs.promises.unlink(sessionSpec.ownFile).catch(() => { });   // B-e7c0 cure: the merged file goes with the failed start
            ws.send(JSON.stringify({ type: 'error', reqId: data.reqId, message: `Failed to spawn session: ${err.message}\ndtach=${DTACH_CMD} node=${NODE_CMD} cwd=${cwd}` })); // the request named (r4 N2): the page's window says it failed
            return;
          }
          if (ocPty) {
            session._opencodePtyId = ocPty.ptyId;
            // no dtach socket exists for this one — the pty lives in the SERVE.
            // Leaving a socketPath on it would point every dtach-shaped path
            // (boot restore, the broken-stdin re-attach) at a file that never
            // existed; the pty's persistence story is the serve's, not ours.
            session.socketPath = null;
            setupSessionPty(session, id, ocPty.shim);
          } else if (r6Handle) {
            // pipe → pty-shaped duck: setupSessionPty consumes onData(string)/
            // onExit({exitCode})/write/kill/pid; resize is a chat no-op. The
            // duck holds a listener SET (src/pty-duck.js): setupSessionPty
            // registers the liveness stamp FIRST and the consumer second, and
            // the one-slot literal that lived here let the consumer REPLACE the
            // stamp — ptyQuietSince then read "silent" for a relaying bridge,
            // and the broken-stdin detector's healer (whose first act kills the
            // pipe) was one late ack away (B-ae4b). No dtach socket exists for a
            // pipe either (B-b675): the cw-* path above is never created, and
            // keeping it armed the detector (+ the dead-bridge watch) on every
            // input — a late _stdin_ack + 5 s of quiet killed a healthy pipe.
            // Null it the way the ocPty branch does (the R6 boot re-open never
            // set one); the healer refuses a pipe duck as the belt.
            session.socketPath = null;
            setupSessionPty(session, id, pipePtyShim(r6Handle));
          } else setupSessionPty(session, id, createPty);

          session._cwdRecreated = cwdRecreated; // B-7812: prompt-context tells the agent once
          activeSessions.set(id, session);
          // the B-f276 remainder, its read r3 (M4): a pin this create OWED may have been judged while it was still spawning (the read
          // landed in its awaits: the keeper's hook found no session holding the key) — the session takes the keeper's answer now and
          // its record keeps no facts to re-judge; still owed (held), the hook finds it from here on
          if (session._browserPinOwed && session._browserKey) {
            try { const kq = require('./server/browser-keeper.js').keeper(); if (kq && typeof kq.owedPending === 'function' && !kq.owedPending(session._browserKey) && !kq.held()) { const pq = kq.pinFor(session._browserKey); session._browserProfileId = pq ? pq.profileId : null; session._browserPinOrigin = pq ? pq.origin : null; session._browserCap = typeof kq.capOf === 'function' ? kq.capOf(session._browserKey) : session._browserCap; session._browserPinOwed = null; } } catch (e) { console.warn(`[browser] ${id}: its owed pin's answer was not taken — ${e && e.message}`); }
          }
          // THE ONE END RECORD meets B-a5a4 (2) (主开发's ruling 2026-11-19 03:17Z): the create road consumes NOTHING — a kept copy and
          // its end record leave only at a turn that RAN well (src/server/boot-restore.js consumeKeptOf, server.js noteTurnEnd) or by
          // the stopped list's live check; never at registration: a resume that fails keeps both (B-a5a4's first round lost them)
          session._webuiId = id;
          // B-8dcf item two: what the person's own settings file met at this start (the adapter's `settingsNotes`, read off the argv the hub
          // builds — local and remote alike, nothing reads the file) — SAID by name, once per start, where the person looks, with its door;
          // only a start that got this far is told (a refused one says its refusal)
          // (unit «billing pick alive»: an ADOPTED process — keeperSid — keeps the argv it started with; this start's notes are not its own)
          for (const k of (!data.keeperSid && sessionSpec && sessionSpec.settingsNotes) || []) {
            // a third-party provider's start says ITS billing words (no subscription bills it; no «CLI login» door)
            const w = (onProvider && SFW.PROVIDER_BILLING_WORDS[k]) || SFW.SETTINGS_FILE_WORDS[k], name = String(session.name || data.name || '').slice(0, 80) || 'This conversation';
            if (w) { try { serverNotice?.(`settings-file-${k}-${id}`, w.replace('{name}', () => name), { level: 1, i18n: { key: w, params: { name } } }); } catch { } }   // a function: a «$&» in a name is words
          }
          // B-e7c0 cure: a merged copy that dropped names SAYS them once, by name, with the door to the pick (a fallen-back start said «billing»)
          const mergedDropped = deviceMerged ? deviceMerged.dropped : (sessionSpec && sessionSpec.ownFileMerged && !sessionSpec.ownFellBack ? ownDropped : []);   // B-e7c0: a paired machine's merge says its own
          if (!data.keeperSid && mergedDropped.length) {
            const w = SFW.MERGE_DROPPED_WORDS, name = String(session.name || data.name || '').slice(0, 80) || 'This conversation', names = [...new Set(mergedDropped)].join(', ').slice(0, 400);
            try { serverNotice?.(`settings-file-mergeDropped-${id}`, w.replace('{name}', () => name).replace('{names}', () => names), { level: 1, i18n: { key: w, params: { name, names } } }); } catch { }
          }
          if (cliLate) {   // (r1407 (a)) said once, by name: the start ran on the CLI config as it stood before — once per CAUSE and spell (r3064)
            const w = SFW.CLI_CONFIG_LATE_WORDS, name = String(session.name || data.name || '').slice(0, 80) || 'This conversation', why = String(cliLate.why || (cliLate.late ? 'late' : 'failed')).slice(0, 200);
            const causeKey = crypto.createHash('sha1').update(String(cliLate.cause || why)).digest('hex').slice(0, 12);
            // r3784 (said in the note): ONE notice a cause and a spell — the FIRST conversation started on the old config in that spell is named;
            // a later one in the same spell is not (r1407 / r3064: the person is told the config is late once, not once a conversation)
            try { serverNotice?.(`cli-config-late-${cliLate.spell || 0}-${causeKey}`, w.replace('{name}', () => name).replace('{why}', () => why), { level: 1, i18n: { key: w, params: { name, why } } }); } catch { }
          }
          // B-6c55 (c): the CLI's own catalog gives the locked model no 1M form — SAID here, after the start's refusals (batch 21's cure);
          // an adopted process keeps the context it started with
          if (data._contextRefused && !data.keeperSid) {
            const said = LOCKCTX.NO_LONG_CONTEXT, model = data._contextRefused, name = String(data.name || data.sessionName || '').slice(0, 80) || 'This conversation';
            try { serverNotice?.(`lock-context-${id}`, said.replace(/\{(model|name)\}/g, (m, k) => (k === 'model' ? model : name)), { level: 2, i18n: { key: said, params: { model, name } } }); } catch { }
          }
          // unit «billing pick alive»: the rule SAID where the person looks — once per picked account and machine (src/billing-pick.js
          // noticeKey), only at a start that spawned with it (an adopted process keeps the argv it started with) and only when the
          // Claude settings of the machine the CLI runs on name a helper it set aside — the ONE fact of this start (helperFact: read
          // before the build when the start carries the person's settings file, else now, after the spawn: the start never waits on it)
          if (keyHelperOff && !data.keeperSid && harness && harness.creds && harness.creds.keyHelper) {
            const acctId = (spawnAccount && spawnAccount.id) || linkedAccountId;
            // the paired machine by the name the person reads (the hosts store's record), never its id
            const hostName = data.hostId ? (() => { try { const h = (hosts && hosts.get(data.hostId)) || {}; return h.name || h.host || null; } catch { return null; } })() : null;
            const said = BILLPICK.helperNotice({ name: session.name || data.name, accountId: acctId, host: hostName, hostId: data.hostId || null, provider: onProvider,
              account: (() => { try { return (typeof accounts?.nameShownOf === 'function' ? accounts.nameShownOf(acctId) : accounts?.get?.(acctId)?.name) || accounts?.providerRecordOf?.(acctId)?.label || acctId; } catch { return acctId; } })() });   // a provider conversation: its record's name, never its pv- id
            // a key this hub already said asks the machine nothing more — the notice channel says a key once per hub run
            if (said && !helperSaidKeys.has(said.key)) try { helperFact().then((on) => {
              if (on === true && serverNotice && serverNotice(said.key, said.text, { level: 1, i18n: { key: said.words, params: said.params } }) > 0) helperSaidKeys.add(said.key);
            }).catch(() => { }); } catch { }   // a notice never ends a registered start (a line comment: suites strip block comments across the file)
          }
          // 2.368.0: what this session was spawned with / prefers. undefined on
          // _autoResume means "follow the global default" — the tri-state is
          // deliberate so a per-session OFF survives the default being ON.
          // the EFFECTIVE style (client pick OR the instance default): the chip
          // must report what the session actually runs with, not just what the
          // client asked for (a default-sourced Concise showed as "默认")
          if (data._effOutputStyle) session._outputStyle = data._effOutputStyle;
          if (data.worktree) session._worktree = true;   // owner ruling 9: the tick is a per-session fact (badge + Session Properties + resume carry)
          { const tp = toolAllowlistArgs({ backend, pick: data.tools }); if (tp.dirty) session._toolPick = tp.pick; }   // lane new-session-form: the 「可用工具」 pick as the spawn judged it (meta + resume carry)
          if (data.autoResume !== undefined && data.autoResume !== null) session._autoResume = !!data.autoResume;
          session._spawnModel = data.model || null; // model ladder's floor (plan C) // per-session pool link key (plan C) — the id the session is registered under
          attachedSessions.add(id);
          console.log(`[session] created ${id} "${session.name || ''}" mode=${sessionMode} backend=${backend}${data.hostId ? ' host=' + data.hostId : ''}${session._accountId ? ' account=' + session._accountId : ''}${data.resumeId ? ' resume=' + data.resumeId : ''}`);
          global.__vsEvent?.('session-created', `${sessionMode}/${backend}${data.hostId ? '/remote' : ''}${data.resumeId ? '/resume' : ''}`);
          // Unresumable-conversation circuit breaker (2.207.1): a resume that
          // recently died with "No conversation found" has NO transcript on
          // its machine — every retry is a guaranteed ~2s death. Note this is
          // checked at CREATE below via noConvoRef (the refusal must run
          // BEFORE the spawn; see the guard further up).
          // Crash-loop detector (2.207.0, the userN incident: one
          // conversation restarted 4× in 3.5 minutes with zero signal): ≥3
          // creates of the SAME conversation within 10 minutes is a loop —
          // flag it loudly so Diagnostics/opslog show it in real time.
          if (data.resumeId) {
            const rl = (crashLoopRef.map ||= new Map());
            const arr = (rl.get(data.resumeId) || []).filter((t) => Date.now() - t < 600000);
            arr.push(Date.now());
            rl.set(data.resumeId, arr);
            if (rl.size > 200) rl.delete(rl.keys().next().value);
            if (arr.length >= 3) {
              console.warn(`[session] crash-loop suspected: conversation ${data.resumeId} created ${arr.length}× in 10min`);
              global.__vsEvent?.('session-crash-loop', `${arr.length}x`);
            }
          }
          // Remote session: push its groups' context folders to the host now
          // (the 60s timer + prompt-time trigger keep them fresh afterwards);
          // bust the host's discovery cache so the sidebar's remote zone sees
          // the new session on the next poll instead of after the TTL.
          if (session.host) {
            if (integrationOn) scheduleCtxSync?.(session, id); // ctx-folder sync is task-context machinery
            setTimeout(() => { try { hosts?.invalidateDiscovery?.(session.host); } catch {} }, 3000);
          }

          if (!session.host) ensureGitIdentity().catch(() => {});   // lane door-day-one-landing: a local agent's first commit has an identity (once; never over git's own)
          writeSessionMeta(sockName, {
            name: session.name,
            nameExplicit: session._nameExplicit || undefined, // lane peer-card-sender: restored by boot-restore
            purpose: session._purpose || undefined, // lane door-day-one-landing: a sign-in terminal stays one after a restart
            cwd,
            spawnModel: data.model || null, // plan C model ladder's floor — survives restarts
            cpuNice: session._cpuNice || undefined, // B-460d: the CPU priority this start got — a restored session still says it
            autoResume: data.autoResume !== undefined && data.autoResume !== null ? !!data.autoResume : undefined, // lane auto-resume-bulk: the carried choice survives a restart (boot-restore reads it)
            agentdPipe: r6Handle ? true : undefined, // R6: daemon-owned pipe session (restore re-opens it, no dtach socket exists)
            host: session.host || null,
            hostName: session.hostName || null,
            keeperSid: session.keeperSid || null,
            dialDeviceId: session._dialDeviceId || null,
            bridgePort: session._bridgePort || null,
            // the device-side VIBESPACE_API back-tunnel port (audit #49): the
            // dial-in handler re-owns it on every re-link — without the record
            // a server restart / re-dial silently killed the agent tools' API
            dialReversePort: session._dialReversePort || null,
            // transport mechanism + fork intent survive restarts (2.219.0
            // audit: a restored agentd session's terminate took the keeper
            // branch = silent no-op, remote claude ran on; a restored fork's
            // new id could never be adopted)
            agentdSession: !!session._agentdSession,
            cwdRecreated: session._cwdRecreated || undefined, // B-7812: agent notice pending
            forkRequested: !!session._forkRequested,
            // AGENT BROWSER (P0 r6): the conversation this session was asked to
            // fork FROM. A claude fork resumes the PARENT's id (`--fork-session`)
            // and a codex fork the parent's thread id; the fork's OWN id arrives
            // later from the harness (init frame / wrapper_meta). Until then this
            // record names a conversation that is NOT this session's, so the
            // binding hook (session-stdout.writeSessionMeta → browser-bindings
            // .bindableIdOf) must not bind the parent to THIS session's browser
            // key — it did, and the parent's next resume landed on the fork's
            // browser (measured, the round-5 finding). Carried forward by every
            // later write's spread; an opencode fork is minted BEFORE the spawn,
            // so its id already differs from this source and binds at once.
            forkSourceId: (data.fork && (data.forkedFromId || data.resumeId)) ? String(data.forkedFromId || data.resumeId) : undefined,
            // AGENT BROWSER (P0 r7): the conversation the browser key was
            // DECIDED for — a resume's resumeId (the ladder looked THAT id up,
            // or minted for it). A resume whose harness announces a DIFFERENT
            // id (claude's implicit fork on a locked conversation; a codex/ACP
            // resume that re-mints) is adopted by the consumer, and the record
            // then names an id this key was never decided for — without this
            // statement the choke point bound it, and two conversations
            // shared one browser for ever with no fork flag and no journal
            // line (the round-6 finding). A fork states nothing (its key
            // belongs to the id the harness will announce; `forkSourceId`
            // guards the parent) and a new session states nothing (its first
            // announced id is the one). Spread forward by every later write.
            browserKeyFor: (session._browserKey && data.resume && data.resumeId && !data.fork) ? String(data.resumeId) : undefined,
            // B-f7ab verify r2: a keyless spawn's WITNESS of its pin ladder's pick (+ the group cap) at the start — the late
            // key restores exactly this, never the default the user has by then (browser-key.js; PURE lateDefaultPin)
            browserPinAtStart: (!session._browserKey && spawnPinWitness) ? spawnPinWitness : undefined,
            // the B-f276 remainder, its read r2 (M3 c): a keyed create the held profile registry could not judge — the facts its pin
            // owes to the read (re-owed at a boot that restores this conversation before then; cleared once judged)
            browserPinOwed: session._browserPinOwed || undefined,
            // implicit-fork adoption (2.218.0) is armed by _resumeSpawn and
            // disarmed by _sawFirstId — neither survived a restart, so a
            // restored resume whose claude implicitly forked could never be
            // adopted (B-b87b; the exact 2.219.0 fork-divergence class)
            resumeSpawn: !!session._resumeSpawn,
            sawFirstId: !!session._sawFirstId,
            remotePort: session._remotePort || null, // tools back-tunnel port (boot re-adopt revives it)
            backend: session.backend,
            backendSessionId: session.backendSessionId,
            claudeSessionId: session.claudeSessionId,
            sourceKind: session.sourceKind,
            agentKind: session.agentKind,
            agentRole: session.agentRole,
            agentNickname: session.agentNickname,
            parentThreadId: session.parentThreadId,
            permissionMode: session._permissionMode || null,
            effort: session._effort || null,
            modelOrigin: session._modelOrigin || null, // B-6b6d: which fact the spawn's model/effort came from — a restart must not turn an honest
            effortOrigin: session._effortOrigin || null, // "this conversation's own value" row into a guess
            outputStyle: session._outputStyle || null, // 2.369.58: the EFFECTIVE response style survives a server restart (the chip otherwise reported "default" for a session really running one)
            // AGENT BROWSER (P0, §3.2.1): the browser key is how a CONVERSATION
            // keeps one browser across resume/restart. This write is ALSO where
            // the conversation → key binding is recorded (r5): writeSessionMeta
            // hands it to src/server/browser-bindings.js, a store the kill and
            // pty-exit paths never unlink — the meta file itself IS unlinked by
            // them, which is why `browserEnv.priorKeyFor` asks the store first
            // and this file's join only second. Without the record, every
            // resume mints a new key and leaks a browser, which is the defect
            // the ladder exists to prevent. The variant rides along so a log
            // line, a properties row and the tools intro (r5: the Browsing
            // sentence is chosen by this rung) can say which rung this session
            // landed on without re-deriving it.
            browserKey: session._browserKey || undefined,
            browserVariant: session._browserVariant || undefined,
            browserProfileId: session._browserProfileId || undefined, // P1 §3.2.5: the pin + its origin survive a restart
            browserPinOrigin: session._browserPinOrigin || undefined,
            browserEnv: session._browserEnv || undefined,        // P2: the ephemeral live view's stream is asked under these after a restart
            browserCap: Number.isInteger(session._browserCap) ? session._browserCap : undefined, // MULTIVIEW D4: the conversation's explicit browser cap (null = the default)
            browserProfileActive: session._browserProfileActive === undefined ? undefined : (session._browserProfileActive === null ? undefined : session._browserProfileActive), // P2 §3.8 ③: the profile the agent LAST USED ('' = the ephemeral one)
            worktree: session._worktree || undefined,       // owner ruling 9: the badge + properties row survive a server restart
            worktreePath: session._worktreePath || undefined, // filled by the init frame (the CLI's own announced cwd)
            modelLocked: session._modelLocked || undefined, // #6: survive server restart (else a resumed lock's badge silently reverts — review-caught)
            lockedModel: session._lockedModel || undefined,
            lockedContext: session._lockedContext || undefined,   // B-6c55: survives a server restart beside the target
            spawnContext: session._spawnContext || undefined,     // B-6c55: what the spawn commanded (a Lock after a restart reads it)
            settingsFileGoverns: session._settingsFileGoverns && session._settingsFileGoverns.length ? session._settingsFileGoverns : undefined,   // B-8dcf item two
            agentToken: session.agentToken || null,
            taskId: session._initialGroupId || null, // group spawned into (meta key kept for back-compat)
            taskIds: session._initialGroupIds && session._initialGroupIds.length ? session._initialGroupIds : undefined, // lane new-session-form: every group, in selection order
            toolPick: session._toolPick || undefined, // lane new-session-form: the 「可用工具」 pick survives a restart (Session Properties / a resume re-passes it)
            accountId: session._accountId || null, // billing identity (badge restore across server restarts)
            // THE READING'S ROAD IS A FACT OF THE SESSION (lane oat-identity-fix-r3, verify r3 F-R1): HOW it billed, WHICH road
            // its long-lived token rides and its GENERATION survive a restart — boot-restore's sessionFromMeta restores them, so a
            // restored conversation's readings are never guessed to be the login's (src/server/usage-pool-engine.js readingRoad)
            billingHow: session._billingHow || undefined, oatRoad: session._oatRoad || undefined, oatGen: session._oatGen || undefined,
            heldPoolMember: session._heldPoolMember || undefined, // the member a non-hot pool process holds — survives a server restart with the process it describes
            poolFallback: session._poolFallback || undefined, // B-d578 F2: the record of a move onto the pool's fallback provider (the engine stamps it on the resumed conversation)
            poolFallbackDwell: session._poolFallbackDwell || undefined, // B-d578 F3a: the dwell after a move back (the engine stamps it)
            poolPin: session._poolPin || undefined, // THE CONVERSATION'S PIN (2026-09-28) — survives a server restart (boot-restore's three sites read it back)
            authAtSpawn: session._authAtSpawn || null,
            createdAt: session.createdAt,
            webuiSessionId: id,
            mode: sessionMode,
            // r4099 / r4145 (4): a key handed past the kept reconcile's bound is NOT KEPT — in no record (no binding: the conversation's place
            // stays empty), and its environment pairs go with it (a restart restores no half of that browser)
            ...(spawnKeyNotKept ? { browserKey: undefined, browserKeyFor: undefined, browserEnv: undefined } : {}),
          });

          // Capture claudeSessionId from lock file for new (non-resume) Claude sessions.
          // LOCAL sessions only (2.156.2, trace finding): a REMOTE session's
          // claude runs on the host — scanning the LOCAL lock dir here could
          // FALSE-MATCH a same-cwd local session and adopt the WRONG id.
          // Remote sessions get their id from the stream parser's first-capture
          // (2.156.1), which every stream-json line feeds.
          // A TERMINAL-MODE FORK too (2026-09-25): its row is seeded with the
          // PARENT's id and terminal mode has no stream parser to adopt the
          // fork's own — the one predicate lives in src/claude-lock-capture.js
          // (re-asked on every attempt: a stream parser that won the race ends
          // the chain, so a seeded fork can never make its parent adopt the
          // fork's lock).
          if (lockCaptureWanted(session)) {
            const { SESSIONS_DIR } = require('./session-store');
            // THE WITNESS IS THE PID (src/claude-lock-capture.js): a lock is
            // this session's iff its pid is alive and descends from THIS
            // session's wrapper (the sidecar names the wrapper's pid) — never
            // the first same-cwd lock by clock, which swapped the ids of two
            // sessions created together. Armed until adopted / exited / no
            // longer wanted (no attempt cap: a slow fork's CLI once outlived
            // the old ~17 s window and kept its parent's id for life).
            armLockCapture({
              id, session, activeSessions,
              attempt: () => captureLockId({ session, id, activeSessions, sessionsDir: SESSIONS_DIR, sidecarPath: metaFileW, readPpid }),
              // A FORK IS PROVEN BEFORE THE CHILD WRITES (B-8b7b): a pending
              // fork whose own CLI holds its PARENT's id resumed the parent — a
              // second writer on its transcript. Its CLI is killed (SIGKILL: no
              // turn, no flush) with the session, and the creator told by name.
              proof: () => captureForkProof({ session, sessionsDir: SESSIONS_DIR, sidecarPath: metaFileW, readPpid }),
              onResumedParent: (lock) => {
                const parent = session.claudeSessionId;
                console.error(`[session] ${id}: fork-resumed-parent — the fork's CLI (pid ${lock.pid}) holds its parent ${parent}; killed before its first turn`);
                session._exitAsked = { by: 'fork-resumed-parent', at: Date.now() };
                try { process.kill(Number(lock.pid), 'SIGKILL'); } catch { }
                try { session.pty?.kill(); } catch { }
                try { ws.send(JSON.stringify({ type: 'error', reqId: data.reqId, sessionId: id, code: 'fork-resumed-parent', message: `Fork stopped: "${session.name || id}" resumed its original (${parent}) instead of forking, so it was ended before its first turn — the original is untouched.` })); } catch { }
              },
              onAdopt: (lockId) => {
                const adopted = adoptCapturedId(session, lockId);
                // MERGE into the existing meta (spread base) — a hardcoded
                // field list here silently dropped later-added keys
                // (agentToken, taskId, accountId) on id capture.
                // Spread the base ONLY when the on-disk meta is ours — a
                // foreign meta (sockName collision) would graft another
                // session's name/cwd/account onto this record, which is
                // exactly how the identity crossing was produced.
                const base = readSessionMeta(sockName) || {};
                const own = !base.webuiSessionId || base.webuiSessionId === id;
                if (!own) console.error(`[session] refusing to inherit foreign meta ${sockName} (owner ${base.webuiSessionId}, me ${id})`);
                writeSessionMeta(sockName, {
                  ...(own ? base : {}),
                  webuiSessionId: id,
                  ...adopted,
                }, { durable: true });
                broadcastActiveSessions();
              },
            });
          }

          if (typeof SP.threadBaseline === 'function' && !session.backendSessionId) {
            const tryCapture = (attempts) => {
              if (attempts <= 0 || !activeSessions.has(id)) return;

              const matched = pickCodexThreadCandidate({
                activeSessions,
                webuiSessionId: id,
                cwd: session.cwd,
                createdAt: session.createdAt,
                baselineThreadIds: session._codexThreadBaseline,
                pathLib: path,
              });

              if (matched) {
                session._captureReservedThreadId = matched.backendSessionId || matched.sessionId || null;
                session.backendSessionId = matched.backendSessionId || matched.sessionId || session.backendSessionId;
                session.claudeSessionId = null;
                require('./server/sent-record.js').adoptFor(session);   // B-9a2e part 2: an id report — a send made before the thread was matched follows it
                if (matched.name) session.name = matched.name;
                if (matched.cwd) session.cwd = matched.cwd;
                if (matched.sourceKind) session.sourceKind = matched.sourceKind;
                if (matched.agentKind) session.agentKind = matched.agentKind;
                if (matched.agentRole != null) session.agentRole = matched.agentRole || '';
                if (matched.agentNickname != null) session.agentNickname = matched.agentNickname || '';
                if (matched.parentThreadId !== undefined) session.parentThreadId = matched.parentThreadId || null;

                writeSessionMeta(sockName, {
                  ...(readSessionMeta(sockName) || {}), // preserve keys not re-listed (agentToken/taskId/accountId)
                  name: session.name,
                  cwd: session.cwd,
                  backend: session.backend,
                  backendSessionId: session.backendSessionId,
                  claudeSessionId: session.claudeSessionId,
                  sourceKind: session.sourceKind,
                  agentKind: session.agentKind,
                  agentRole: session.agentRole,
                  agentNickname: session.agentNickname,
                  parentThreadId: session.parentThreadId,
                  forkedFrom: session.forkedFrom || null,
                  permissionMode: session._permissionMode || null,
                  effort: session._effort || null,
                  modelOrigin: session._modelOrigin || null,
                  effortOrigin: session._effortOrigin || null,
                  outputStyle: session._outputStyle || null,
                  createdAt: session.createdAt,
                  webuiSessionId: id,
                  mode: sessionMode,
                }, { durable: true, whole: true });   // r3141: a whole record from the live conversation (restates a torn one)
                delete session._codexThreadBaseline;
                delete session._captureReservedThreadId;
                broadcastActiveSessions();
                return;
              }

              setTimeout(() => tryCapture(attempts - 1), 1500);
            };
            setTimeout(() => tryCapture(40), 1500);
          }

          // Read childPid from wrapper metadata after it has time to spawn
          setTimeout(() => refreshWebuiPids(), 3000);

          ws.send(JSON.stringify({
            type: 'created', sessionId: id, name: session.name, cwd, mode: sessionMode, reqId: data.reqId || undefined,
            // POST-FACTO billing truth (B-f531): what the spawn ACTUALLY
            // resolved to — the client persists/labels from this, never from
            // the requested intent (the badge-vs-reality split class)
            billing: {
              accountId: session._accountId || null,
              how: session._billingHow || null,
              name: session._accountId ? (() => { try { return accounts?.get?.(session._accountId)?.name || null; } catch { return null; } })() : null,
            },
            // The CREATOR never gets an 'attached' payload, so the live style /
            // auto-resume state must ride here or the resumed window shows
            // "default" forever (2.368.4, owner-caught on the resume it was
            // built for). Always present (null = CLI default) so the client's
            // carries-the-key guard fires.
            outputStyle: session._outputStyle || null,
            // …and so must the effort this spawn RESOLVED to (B-6b6d). The
            // creator's chip used to show the value the CLIENT sent, which on a
            // resume is now deliberately nothing — the server is the only party
            // that read the conversation's own last turn. `spawnOrigin` names
            // WHICH fact it is, for the same reason Session Properties needs it.
            effort: session._effort || null,
            spawnModel: session._spawnModel || null,
            spawnOrigin: { model: session._modelOrigin || null, effort: session._effortOrigin || null },
            // Same reason (2.368.4): the CREATOR is the window that has to
            // draw the worktree badge, and it never receives an 'attached'.
            // Always present so the client's carries-the-key guard fires.
            worktree: !!session._worktree,
            worktreePath: session._worktreePath || null,
            toolPick: session._toolPick || null, // lane new-session-form: the creator latches it as the conversation's own pick (its resume carry)
            autoResume: autoResume?.statusFor?.(id) || null,
            // A freshly spawned/resumed wrapper always starts with an EMPTY
            // input queue — stated explicitly (not omitted) so the creator's
            // carries-the-key guard clears any strip a recycled window kept.
            queue: [],
            // …but it is NOT a FACT (2026-09-09): the app-server's queue
            // belongs to the THREAD, so a RESUMED thread hands the new wrapper
            // items it never filled (measured: `queue_changed n=25` two
            // seconds after boot). The `[]` above is the placeholder that
            // clears a recycled window's strip; the FACT is the wrapper's own
            // forced baseline publication, seconds later. Saying so keeps the
            // client from ever showing a row nobody can act on.
            queueKnown: false,
            // The wrapper has not written its sidecar yet, so we do not KNOW
            // whether it publishes a queue: say false and let its own baseline
            // `queue_changed` (published at boot, seconds later) turn the
            // controls on. Guessing 'true' here is the skew bug in miniature —
            // and nothing can be queued before the first turn anyway.
            queueSupported: false,
            // …and NOTHING is known about its verbs yet — `null`, never `[]`
            // (an empty list is a real answer the client would intersect with,
            // leaving a session with no controls at all).
            queueVerbs: null,
            // NO `turnState` here either, for the same reason and one more: a
            // just-spawned CLI has not run a turn yet, so it has said nothing
            // about turn state. null/absent = "not told yet"; the client keeps
            // the derived path until the first `turn-state` push arrives — the
            // same tri-state honesty as responseStyleLive below.
            // NO `responseStyleLive` here, deliberately: the sidecar that
            // adverts it is written seconds later, and the client's third
            // state (undefined = "not told yet") is the honest one — it TRIES
            // the live verb and a refusal flips it to false with the restart
            // row in the same menu (2.369.58). Guessing either way is the
            // capability-skew bug in miniature.
            warning: session._resumeWarning || undefined, // 2.271.0 T1-2: sweep-skipped-under-lag double-write risk
            // A sweep is DESTRUCTIVE by design (it SIGTERMs another claude that
            // held this transcript). Never do that silently — 2.276.0.
            swept: session._resumeSwept || undefined,
          }));
          broadcastActiveSessions();
    } while (0);
  }
  // the resume-in-flight hold is released however the create ends (created, refused, thrown)
  return Object.assign(async function handleCreate(ws, data, attachedSessions) {
    try { require('./server/loop-counts.js').inc(data && (data.resumeId || data.resume) ? 'resumes' : 'creates'); } catch { }   // loop-day-report M5
    const held = { release: null };
    if (data && typeof data === 'object') data._contextRefused = null;   // the hub's own field (B-6c55's block writes it): a client's create frame never sets it
    try { return await createBody(ws, data, attachedSessions, held); } finally { try { held.release?.(); } catch { } }
  }, { onClientConnected });
}

module.exports = { createWsCreateHandler, resumePoolPin };
