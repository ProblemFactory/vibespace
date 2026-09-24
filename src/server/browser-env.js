'use strict';
/**
 * THE AGENT BROWSER'S SPAWN ENVIRONMENT AND ITS PROFILE DIRECTORY — ORCH
 * (docs/design-agent-browser-v2.zh.md §3.2, phase P0). The decisions are PURE
 * (`src/browser-profiles.js`) and the machine fact is SHARED
 * (`src/browser-facts.js`); this module is the half that TOUCHES things:
 * it writes the generated config, makes the scratch directory, journals which
 * rung it landed on and why, re-points the pin indirection, and sweeps what it
 * created.
 *
 * IT PRODUCES `KEY=VALUE` STRINGS, ON PURPOSE. Both spawn shapes in
 * `src/ws-create.js` consume that form — the local `r6Argv`'s `env` prefix and
 * the remote `buildRemoteExec` `parts`, which shell-quote them — so one
 * composition serves both and `hostId` never becomes a branch downstream.
 *
 * A REMOTE SESSION IS DECIDED ON THE HOST, BY THE HOST (r3). Variants (D) and
 * (C) both name a LOCAL object: a generated config file we validated by
 * reading it back, or a scratch directory we own and sweep. Round 2 therefore
 * sent a remote session the three names alone and called that the floor —
 * and MEASURED (2026-09-14, 0.32.0) that shape is the design's variant (B) on
 * any host whose config names a `profile`: the second concurrent browser
 * fails to launch on `SingletonLock` where today both start. The one fact the
 * decision needs (does THAT machine's effective config name a profile) lives
 * on that machine, so it is asked there: `B.remoteBrowserPrelude` is a shell
 * fragment riding the ONE remote composition (`buildRemoteExec`'s `browser`
 * slot, after its `cd`), which exports a per-key `AGENT_BROWSER_PROFILE` under
 * `~/.vibespace/browser-profiles/` only when the host names a profile (rung C
 * there — a directory the CLI creates lazily and the same prelude sweeps once
 * stale and unlocked) and nothing otherwise (rung N — already ephemeral per
 * daemon there). The variant recorded here is `H`, because from here the rung
 * is genuinely unknown; the journal says so once.
 *
 * THE SAME FACT GOVERNS THE LOCAL FLOOR. When neither (D) nor (C) can be
 * delivered, the names alone are emitted ONLY if this machine's effective
 * config names no profile; otherwise NOTHING is emitted and the session keeps
 * today's shared browser — a stolen tab is a smaller harm than a browser that
 * cannot start, and the journal names the profile that decided it.
 *
 * MEASURED (2026-09-13/14, agent-browser 0.32.0, this box), because every rung
 * below rests on one of these:
 *   · SESSION + NAMESPACE only  ⇒ resolved --user-data-dir was still the shared
 *     `~/.agent-browser/default-profile`. That is variant B, and it is why the
 *     gate asserts the RESOLVED directory instead of the env strings.
 *   · SESSION + NAMESPACE, config names NO profile ⇒ each daemon gets its own
 *     ephemeral `/tmp/agent-browser-chrome-<uuid>`; two sessions both launch.
 *   · + AGENT_BROWSER_CONFIG (no `profile` key) ⇒ ephemeral
 *     `/tmp/agent-browser-chrome-<uuid>`. Variant D works, and a custom config
 *     REPLACES BOTH of the CLI's own files (`~/.agent-browser/config.json` AND
 *     `./agent-browser.json` in the invocation directory, the higher-priority
 *     one) rather than merging with them — which is why `effectiveConfig`
 *     layers the two exactly as the CLI does before anything is generated.
 *   · + AGENT_BROWSER_PROFILE=<dir> ⇒ that exact dir, created by the CLI.
 *   · AGENT_BROWSER_CONFIG at a missing file ⇒ `⚠ config file not found`,
 *     exit 1. At invalid JSON ⇒ `⚠ invalid config file …`, exit 1. That hard
 *     dependency points the UNSAFE way — a bug in our writer breaks a tool that
 *     works today — which is the whole reason the ladder exists and the whole
 *     reason the variable is only set after a successful READ-BACK.
 *
 * THE GENERATED CONFIG IS A SECRET-BEARING FILE (r3). It is a verbatim copy of
 * the user's own config, which legitimately holds a credentialed `proxy` URL
 * and plugin credentials; round 2 wrote it with the process umask (0664 in a
 * 0775 directory, measured) and discarded a 0600 source's mode. Every file
 * this module writes is 0600 and every directory it makes is 0700 — the same
 * mode the token-bearing files beside it in ws-create already use.
 *
 * THE C RUNG IS SKIPPED UNDER A FENCE, AND IT RECORDS THE SESSION'S DIRECTORY
 * (r4). Rung C exports `AGENT_BROWSER_PROFILE`, which the CLI refuses beside a
 * fence at the argument check — so when the generated config cannot be written
 * AND the effective config carries `allowedDomains`, round 3 landed on C and
 * handed the session a browser that answered every command `✗ --allowed-domains
 * is not supported with --profile` (measured, one injected variable), while the
 * journal called it a working `D → C`. The ladder now takes `fenced` as an
 * input and the C block is not even attempted (no symlink, no scratch dir); the
 * journal says `C → N` with the fence as the reason. And because the C rung
 * replaces no config, a later pin there has to ask the CLI's two files as they
 * stand THEN — the project one lives in the session's own directory, which a
 * pin route has no other way to know — so the rung writes `<key>.cwd` beside
 * the link at spawn and `repointPin` reads it back (a missing sidecar refuses
 * the pin BY NAME rather than checking only the user file).
 *
 * THE FIFTH VARIABLE (r4): the CLI's daemon socket lives under `$HOME/.agent-
 * browser` (or `$XDG_RUNTIME_DIR/agent-browser`) and unix sockets are capped at
 * 103 bytes, so with our name shape a home longer than 38 characters made EVERY
 * agent-browser command in a VibeSpace session answer `Session name … is too
 * long` where the bare CLI's `default` name still fit — a regression round 3
 * measured and left in the manual. `socketDirDecision` (PURE) says whether the
 * root the CLI would use is over the limit; when it is, this half creates
 * `<base>/vs-ab-<uid>` 0700, VERIFIES it is a real directory this uid owns (a
 * fixed name in a shared /tmp can be pre-created by anyone), and only then
 * emits `AGENT_BROWSER_SOCKET_DIR`; a hijacked directory means no variable and
 * a journal line, never a socket inside somebody else's directory.
 *
 * THE FLOOR NOTICE LATCHES ON DELIVERY, NOT ON HAVING ASKED (r5). Round 4 set
 * `floorAnnounced = true` BEFORE `serverNotice` said whether any client got
 * the sentence, and the boot probe fires 3 s after the ws handler registers
 * — into an EMPTY client set on the systemd / update.sh restart shape. So
 * the notice was broadcast to nobody and never retried for the life of the
 * process (measured on a real worktree server: a client connecting at
 * Ready+6.3 s received zero server-notice frames while the journal carried
 * the line), and the manual's "the user has already been told" was untrue.
 * `serverNotice` now RETURNS the delivery count, `checkFloor` latches only
 * when it is > 0, and ws-create re-asks it on every client connection (plus
 * a 6 h re-probe) — free once latched, one cached probe otherwise. A channel
 * that reports nothing is treated as UNDELIVERED (the loud direction; the
 * production channel reports, and its own key dedup caps a delivered notice
 * at one per boot).
 *
 * THE CONVERSATION'S KEY OUTLIVES ITS WEBUI SESSION (r5). `priorKeyFor` read
 * only `data/session-meta`, and the product's own Terminate → Resume flow
 * UNLINKS that file (ws-handler's kill case, session-stdout's pty-exit path),
 * so the §3.2.1 `conversation` rung fired only while the previous webui
 * session's meta still existed — i.e. never in the flow it was written for:
 * every resume of a stopped conversation minted a new key, warned
 * `resume-unknown`, and orphaned the previous namespace's daemon + chromium
 * until the idle timeout (measured). The binding now lives in
 * `src/server/browser-bindings.js` (`data/browser-env/bindings.json`,
 * written at session-stdout's ONE meta choke point), consulted FIRST here;
 * the meta join stays as the second rung.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const B = require('../browser-profiles.js');
const { createBrowserFacts } = require('../browser-facts.js');
const { repointPoolSymlink } = require('../account-material.js');
const browserBindings = require('./browser-bindings.js');

/** tmp+rename, like every other store in this tree. A bare writeFileSync here
 *  is worse than elsewhere: a torn config file is a HARD ERROR in the CLI.
 *  MODE 0600 (r3): the content is the user's own config, proxy credentials and
 *  all; the mode is set at CREATE so the file is never readable by anyone else
 *  even for an instant, and rename carries it across. */
const FILE_MODE = 0o600;
const DIR_MODE = 0o700;
function writeJsonAtomic(file, obj) {
  const tmp = file + '.tmp-' + crypto.randomBytes(4).toString('hex');
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), { mode: FILE_MODE });
  fs.renameSync(tmp, file);
}
/** mkdir -p with mode 0700, and chmod an already-existing directory to it —
 *  `mkdirSync`'s `mode` applies only to what it creates. */
function mkdirPrivate(d) {
  fs.mkdirSync(d, { recursive: true, mode: DIR_MODE });
  try { if ((fs.statSync(d).mode & 0o777) !== DIR_MODE) fs.chmodSync(d, DIR_MODE); } catch { }
}

/** A create that has written its indirection but not yet its session-meta is
 *  in flight, and nothing may remove its files. One hour is far wider than any
 *  create takes and far narrower than the orphan problem being prevented. */
const SWEEP_GRACE_MS = 60 * 60 * 1000;

function create({ dataDir, serverSetting = () => undefined, serverNotice = null,
  telemetry = null, homeDir = os.homedir(), facts = null, log = console,
  // The environment the SESSION will get (r4): `agentEnv()` passes the server's
  // own `XDG_RUNTIME_DIR` through and strips every `AGENT_BROWSER_*`, so the
  // socket-root rule reads exactly those two facts from here. Injected so a
  // suite can hand a session a bare ssh-login shape (no XDG) or a long HOME.
  env = process.env,
  // Where the short socket directory lives. The LITERAL `/tmp` in production
  // (`B.SOCKET_DIR_BASE` — a short root is the point, and TMPDIR may be the
  // long path being escaped); a suite hands in a scratch base so the fast tier
  // never claims the real per-uid name (a machine-global fixture).
  socketDirBase = B.SOCKET_DIR_BASE,
  // INJECTED so the read-back guard has a control: the failure it exists for is
  // "our writer produced a file the CLI will refuse", which cannot be staged by
  // breaking the filesystem (that also breaks the write). The suite passes a
  // writer that lands garbage; production never passes this.
  writeJson = writeJsonAtomic } = {}) {
  const ENV_DIR = path.join(dataDir, 'browser-env');        // generated configs + pin symlinks (+ the C rung's `<key>.cwd`)
  const PROFILE_DIR = path.join(dataDir, 'browser-profiles'); // variant C scratch dirs (ours, swept)
  const bf = facts || createBrowserFacts({});
  const uid = () => (typeof process.getuid === 'function' ? process.getuid() : null);
  // The durable conversation → key store (r5). session-stdout's meta writer
  // records into the same file through its own instance; this one only reads.
  const bindings = browserBindings.create({ dataDir, log });

  const setting = (k, d) => { try { const v = serverSetting(k); return v === undefined || v === null || v === '' ? d : v; } catch { return d; } };
  const enabled = () => setting('browser.isolateSessions', true) !== false;
  /** THREE-STATE, because the honest default is "whatever the user's own
   *  ~/.agent-browser/config.json says" and there is no boolean for that.
   *  `null` ⇒ `generatedConfig` carries the user's own value across. A raw
   *  boolean is accepted too: the suites drive this resolver directly. */
  const headedSetting = () => {
    const v = setting('browser.headed', '');
    if (v === true || v === 'yes') return true;
    if (v === false || v === 'no') return false;
    return null;
  };

  function ensureDirs() {
    for (const d of [ENV_DIR, PROFILE_DIR]) { try { mkdirPrivate(d); } catch { } }
  }

  /** The user's own `~/.agent-browser/config.json`, or {}. Read per resolve and
   *  NOT cached: it is one small file on a path that runs once per session
   *  create, and a cached copy is a promise to notice when the user edits it. */
  function userConfig() {
    try { return JSON.parse(fs.readFileSync(path.join(homeDir, B.USER_CONFIG_REL), 'utf8')) || {}; }
    catch { return {}; }
  }
  /**
   * THE CLI'S OTHER FILE (r3): `./agent-browser.json` in the directory a command
   * runs from, at HIGHER priority than the user file, and replaced along with
   * it by `AGENT_BROWSER_CONFIG`. Read from the SESSION's own directory — the
   * one the CLI would read from, since the agent starts there — and layered
   * over the user file with the CLI's own measured rule (`layerProjectConfig`).
   * Returns the merged config plus what it found, so the journal can name the
   * file it carried across and a reader can see why a project-level fence now
   * applies. An unparseable project file is REPORTED, not silently skipped:
   * the CLI would refuse it too, and "we ignored your file" is the sentence
   * this round exists to stop leaving out.
   */
  function effectiveConfig(cwd) {
    const user = userConfig();
    const project = { path: null, keys: [], error: null };
    if (typeof cwd === 'string' && cwd && path.isAbsolute(cwd)) {
      const p = path.join(cwd, B.PROJECT_CONFIG_NAME);
      let raw = null;
      try { raw = fs.readFileSync(p, 'utf8'); } catch { raw = null; }
      if (raw !== null) {
        project.path = p;
        try {
          const parsed = JSON.parse(raw);
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not a JSON object');
          project.keys = Object.keys(parsed);
          return { config: B.layerProjectConfig(user, parsed), user, project, projectFile: parsed };
        } catch (e) { project.error = String(e && e.message); }
      }
    }
    return { config: B.layerProjectConfig(user, null), user, project, projectFile: null };
  }

  const configPathFor = (key) => path.join(ENV_DIR, key + '.json');
  const linkPathFor = (key) => path.join(ENV_DIR, key + '.profile');
  /** The C rung's record of the session's own directory (r4): the one fact a
   *  pin there needs that the link cannot carry. `{cwd: <abs>|null}`, 0600. */
  const cwdPathFor = (key) => path.join(ENV_DIR, key + '.cwd');
  const scratchDirFor = (key) => path.join(PROFILE_DIR, key);
  const readCwdSidecar = (key) => {
    try { const r = JSON.parse(fs.readFileSync(cwdPathFor(key), 'utf8')); return r && typeof r === 'object' ? { cwd: typeof r.cwd === 'string' ? r.cwd : null } : null; }
    catch { return null; }
  };

  /**
   * The short per-uid socket directory (r4), or the reason it may not be used.
   * The name is FIXED and lives in a shared tmp root, so it is verified rather
   * than trusted: it must be a real directory (not a symlink somebody planted),
   * owned by THIS uid, and 0700 — the wire probe's r6 lesson, applied to a
   * directory the CLI will create a socket in. Checked with `lstat` BEFORE any
   * mkdir/chmod, because `mkdirSync({recursive})` tolerates a symlink to a
   * directory and a chmod would follow it onto somebody else's directory.
   */
  function ensureSocketDir(dir) {
    let st = null;
    try { st = fs.lstatSync(dir); } catch (e) { if (e.code !== 'ENOENT') return { ok: false, why: `cannot stat it: ${e.message}` }; }
    if (!st) {
      // `recursive` so a base a suite hands in is made on demand (production's
      // is `/tmp`, which exists); a symlink planted between the two lstats is
      // tolerated by this call and caught by the second lstat below.
      try { fs.mkdirSync(dir, { recursive: true, mode: DIR_MODE }); } catch (e) { return { ok: false, why: `mkdir failed: ${e.message}` }; }
      try { st = fs.lstatSync(dir); } catch (e) { return { ok: false, why: `vanished after mkdir: ${e.message}` }; }
    }
    if (st.isSymbolicLink()) return { ok: false, why: 'it is a SYMLINK, not a directory — something else planted that name in the shared tmp root' };
    if (!st.isDirectory()) return { ok: false, why: 'it exists and is not a directory' };
    const me = uid();
    if (me !== null && st.uid !== me) return { ok: false, why: `it is owned by uid ${st.uid}, not this user (${me}) — a socket must never live in somebody else's directory` };
    if ((st.mode & 0o777) !== DIR_MODE) { try { fs.chmodSync(dir, DIR_MODE); } catch (e) { return { ok: false, why: `cannot make it 0700: ${e.message}` }; } }
    return { ok: true };
  }

  // ── D1: the floor, probed once and remembered, with ONE notice — latched on DELIVERY (r5)
  let floorAnnounced = false;   // true once the sentence REACHED a client (or there was nothing to say)
  let lastFloor = null;
  /** Probe the installed binary and, when it is below the floor (or will not
   *  say), tell the user ONCE through the channel they already read. Never
   *  throws, never blocks a spawn: a browser floor is not a reason to fail to
   *  start a session.
   *
   *  ONCE means once DELIVERED (r5): the boot probe runs into an empty client
   *  set on a headless restart, so "asked" is not "told". The latch is the
   *  delivery count `serverNotice` reports; until it is > 0 every call
   *  re-asks (ws-create calls this on each client connection). Once latched
   *  a call is free — no probe — unless `reprobe` is passed (the 6 h health
   *  cadence: a binary upgraded mid-run should be re-read; a latched notice
   *  is still never re-sent). */
  async function checkFloor({ reprobe = false } = {}) {
    if (floorAnnounced && lastFloor && !reprobe) return lastFloor;
    let v;
    try { v = await bf.floor(); } catch (e) { v = { state: 'unknown', installed: null, floor: B.FLOOR_VERSION, sharedProfiles: false, error: e && e.message }; }
    lastFloor = v;
    if (floorAnnounced) return v;
    const text = B.floorNotice(v);
    if (!text) { floorAnnounced = true; return v; }   // ok / absent: nothing to say, and nothing to re-ask
    let delivered = 0;
    try { delivered = Number(serverNotice?.('agent-browser-floor', text, { level: 'warn' })) || 0; } catch { }
    floorAnnounced = delivered > 0;
    try { telemetry?.event?.('browser-floor', `${v.state} installed=${v.installed || '-'} floor=${v.floor} delivered=${delivered}`); } catch { }
    try { log.warn?.(`[browser] ${text}${delivered > 0 ? '' : ' (no client was connected to receive this — it will be said to the next one)'}`); } catch { }
    return v;
  }
  /** The last verdict WITHOUT paying for a probe (a render or a log line). */
  const floorState = () => lastFloor;

  // ── §3.2.2 the (D) → (C) → (N) → none ladder ────────────────────────────────────
  /**
   * Land this browser key on the highest rung this machine can actually
   * deliver, and say which one and why. `pinnedDir` (P1's pin; P0 writes it
   * only through `repointPin`) decides whether the generated config carries a
   * `profile` key at all.
   */
  function resolveVariant(key, { pinnedDir = null, remote = false, cwd = null } = {}) {
    if (remote) {
      // NOT a fallback: rung (H) is the DESIGNED answer for another machine —
      // the rung is chosen THERE, by that machine's own config, through the
      // shell fragment the remote composition carries. Calling a permanent,
      // correct design decision a "fallback" would make every remote create
      // warn about something working as intended; it is stated ONCE instead
      // (see `journal`).
      return {
        variant: B.VARIANTS.H, configPath: null, profileDir: null, fallbacks: [],
        remote: true, remotePrelude: B.remoteBrowserPrelude({ browserKey: key, socketDirBase }),
        why: 'the generated config and the scratch dir are LOCAL objects, so the rung is decided ON THE HOST at spawn by its own config: a per-key scratch dir under ~/.vibespace/browser-profiles (rung C, swept there once stale and unlocked) when that config names a profile — the names alone would put every session on ONE user-data-dir and the second browser would fail to launch (measured) — else the names alone (rung N, already ephemeral per daemon there)',
      };
    }
    ensureDirs();
    const reasons = [];
    const eff = effectiveConfig(cwd);
    const user = eff.config;
    // A PIN OVER A FENCED CONFIG IS REFUSED, NOT SILENTLY UN-FENCED (§6.3).
    // Since r2 the generated config CARRIES the user's `allowedDomains` — and
    // since r3 the PROJECT file's too — so adding `profile` back would produce
    // a browser that refuses every command. The pin is dropped and SAID; the
    // session stays ephemeral, which is the only one of the two this machine's
    // effective config permits.
    const conflict = B.pinFenceConflict({ userConfig: user, pinnedDir });
    const pin = conflict ? null : pinnedDir;
    // THE FENCE DECIDES THE C RUNG TOO (r4): `AGENT_BROWSER_PROFILE` beside
    // `allowedDomains` is a browser that refuses every command, so a fenced
    // effective config skips C by rule — the ladder is told, and the block
    // below is not attempted (no symlink, no scratch dir left behind).
    const fence = B.configFence(user);
    const fenced = !!fence;
    // (D) — write the generated config and PROVE it readable before the env
    // variable can name it. The read-back is not belt and braces: a missing or
    // invalid file makes the CLI exit 1.
    let cfgPath = null;
    let dropped = [];
    let composed = null;
    try {
      const p = configPathFor(key);
      dropped = B.deniedKeys(user);
      // takeover r3 (finding 2): the user file and the project file are handed
      // SEPARATELY — the project file only narrows (the fence, the policy);
      // its launch keys and every raw-debugging switch in `args` are dropped
      // and said (`projectDropped` / `argsDropped`, journalled below)
      composed = B.generatedConfigParts({ userConfig: eff.user, projectConfig: eff.projectFile, pinnedDir: pin, headed: headedSetting() });
      const cfg = composed.config;
      writeJson(p, cfg);
      const back = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (!back || typeof back !== 'object') throw new Error('read-back was not an object');
      cfgPath = p;
    } catch (e) { reasons[0] = `generated config unusable: ${e && e.message}`; }
    // (C) — our own scratch directory, named by the browser key, under data/,
    // swept. Reached only when (D) failed AND the config is not fenced. 0700:
    // it is a chromium user-data-dir.
    let profDir = null;
    if (!cfgPath && !fenced) {
      try {
        const link = linkPathFor(key);
        const target = pin || scratchDirFor(key);
        mkdirPrivate(target);
        repointPoolSymlink(link, target);
        // The session's own directory, beside the link (r4): this rung replaces
        // no config, so a later pin must ask the CLI's two files as they stand
        // THEN, and the project file lives HERE. Written before `profDir` is
        // claimed: a rung whose record failed is a rung that was not delivered.
        writeJson(cwdPathFor(key), { cwd: typeof cwd === 'string' && cwd && path.isAbsolute(cwd) ? cwd : null });
        profDir = link;
      } catch (e) { reasons[1] = `per-session profile directory unusable: ${e && e.message}`; }
    } else if (!cfgPath) {
      reasons[1] = B.fencedRungReason(fence);
    }
    // (N) / none — the names alone are safe only when the EFFECTIVE config
    // names no profile (variantLadder says why, with the measurement).
    const ladder = B.variantLadder({ configPath: cfgPath, profileDir: profDir, reasons, namesProfile: B.configNamesProfile(user), fenced });
    // THE FIFTH VARIABLE (r4): only for a rung that emits anything, only when
    // the CLI's own root would put the socket over the 103-byte limit, and only
    // at a directory this uid verifiably owns.
    let socket = null, socketDir = null;
    if (ladder.variant !== B.VARIANTS.NONE) {
      socket = B.socketDirDecision({ browserKey: key, home: homeDir, xdgRuntimeDir: env && env.XDG_RUNTIME_DIR, socketDir: null, uid: uid(), base: socketDirBase });
      if (socket.needed) {
        if (!socket.fits) socket.refused = `the short directory ${socket.dir} would itself put the socket at ${socket.dirBytes} bytes (max ${socket.max})`;
        else { const r = ensureSocketDir(socket.dir); if (r.ok) socketDir = socket.dir; else socket.refused = r.why; }
      }
    }
    return { ...ladder, dropped, projectDropped: composed ? composed.dropped.project : [], argsDropped: composed ? composed.dropped.args : [], pinRefused: conflict || null, projectConfig: eff.project, socket, socketDir };
  }

  /** One journal line per fallback, naming the rung it left, the rung it landed
   *  on and the reason — a degrade that only telemetry knows about is a silent
   *  failure.
   *
   *  RATE-LIMITED PER REASON, because the conditions that produce these are
   *  usually PERMANENT (an unwritable data dir; a remote transport) while this
   *  runs once per session CREATE: an unthrottled line would make the journal
   *  say one sentence for ever. The first occurrence logs at once; later ones
   *  are counted and re-logged at most every 10 minutes carrying the count —
   *  the shape the remote-degrade log already uses. The THROTTLE KEY is the
   *  reason, not the browser key, or every session would be its own "first"
   *  occurrence and nothing would ever be throttled. Telemetry still fires per
   *  occurrence: counting is what it is for.
   */
  const JOURNAL_REPEAT_MS = 10 * 60 * 1000;
  const journalSeen = new Map();   // reason → { n, lastAt }
  function journalOnce(reason, line) {
    const now = Date.now();
    const st = journalSeen.get(reason) || { n: 0, lastAt: 0 };
    st.n++;
    if (st.lastAt && now - st.lastAt < JOURNAL_REPEAT_MS) { journalSeen.set(reason, st); return false; }
    const extra = st.n > 1 ? ` (+${st.n - 1} more since the last line)` : '';
    st.lastAt = now; st.n = 1;
    journalSeen.set(reason, st);
    try { log.warn?.(`[browser] ${line}${extra}`); } catch { }
    return true;
  }
  function journal(key, res, { remote }) {
    for (const f of res.fallbacks) {
      journalOnce(`${f.from}->${f.to}:${f.why}`, `${key}: user-data-dir variant ${f.from} → ${f.to} — ${f.why}`);
      try { telemetry?.event?.('browser-variant-fallback', `${f.from}->${f.to} ${remote ? 'remote' : 'local'}: ${f.why}`); } catch { }
    }
    if (res.remote) journalOnce('remote', `${key}: remote sessions decide their user-data-dir on the host — ${res.why}`);
    // THE PROJECT FILE IS NAMED WHEN IT IS CARRIED (r3). Round 2 layered only
    // the user file, so a project-level fence vanished from every local session
    // with `dropped: []` — nothing in the journal, the second file of finding ①.
    // The line also states the one boundary the generated config has: the CLI
    // reads this file per INVOCATION directory and we read it once, from the
    // session's own directory, for the whole session.
    const pc = res.projectConfig;
    if (pc && pc.path) {
      if (pc.error) {
        journalOnce(`project-unreadable:${pc.path}`, `${key}: ${pc.path} exists but could not be layered into the generated config — ${pc.error}. The CLI would refuse it too; fix the file and start a new session.`);
        try { telemetry?.event?.('browser-project-config-unreadable', pc.path); } catch { }
      } else {
        const took = pc.keys.filter((k) => !(res.projectDropped || []).includes(k));
        journalOnce(`project:${pc.path}`, `${key}: the generated agent-browser config also carries the project-level ${pc.path} (keys: ${took.join(', ') || 'none'}), layered over ~/${B.USER_CONFIG_REL} the way the CLI does — `
          + `it applies to this whole session; a different agent-browser.json in a directory the agent cd's into does not (the CLI reads that file per invocation directory, the generated config replaces both files).`);
        try { telemetry?.event?.('browser-project-config-layered', took.length); } catch { }
        // takeover r3: a project file only NARROWS — its launch keys are not carried, and that is SAID
        if ((res.projectDropped || []).length) {
          journalOnce(`project-dropped:${pc.path}`, `${key}: ${pc.path} also sets ${res.projectDropped.join(', ')} — NOT carried: a project file lives where the agent works, so it may only add a restriction (${require('../browser-verbs.js').PROJECT_CONFIG_KEYS.join(', ')}) that ~/${B.USER_CONFIG_REL} does not already set; how the browser launches is this machine's own file and VibeSpace's settings.`);
          try { telemetry?.event?.('browser-project-config-dropped', res.projectDropped.join(',')); } catch { }
        }
      }
    }
    // takeover r3: a raw-debugging / user-data-dir switch in `args` never reaches a browser VibeSpace hands an agent
    if ((res.argsDropped || []).length) {
      journalOnce(`args-dropped:${res.argsDropped.join(',')}`, `${key}: the generated agent-browser config drops ${res.argsDropped.join(' ')} from \`args\` — a switch that opens a raw debugging endpoint or picks the user-data-dir would go around the lease and the mediation (I3); every other launch arg is carried.`);
      try { telemetry?.event?.('browser-config-args-dropped', res.argsDropped.length); } catch { }
    }
    // A DROPPED KEY IS A STATED DECISION (r2). Round 1's generated config was an
    // ALLOW list, so the user's browsing fence and the whole confirmation family
    // vanished by OMISSION — no line, nothing in the journal, no way to notice.
    // One line per KEY (the throttle key is the key, not the session) so a
    // reader learns which restriction of theirs does not apply here and why.
    const carriedFrom = `~/${B.USER_CONFIG_REL}` + (pc && pc.path && !pc.error ? ` and ${pc.path}` : '');
    for (const k of (res.dropped || [])) {
      journalOnce(`drop:${k}`, `${key}: the generated agent-browser config drops \`${k}\` — ${B.EPHEMERAL_DENY[k]}. `
        + `Every other key of ${carriedFrom} is carried across unchanged.`);
      try { telemetry?.event?.('browser-config-key-dropped', k); } catch { }
    }
    if (res.pinRefused) {
      journalOnce(`pin-refused:${res.pinRefused.key}`, `${key}: the profile pin was NOT applied — ${res.pinRefused.why}`);
      try { telemetry?.event?.('browser-pin-refused', res.pinRefused.key); } catch { }
    }
    // THE SOCKET ROOT (r4): said once per root, because a long HOME is
    // permanent while this runs once per create. A refusal is said too — the
    // session's every agent-browser command will fail with the CLI's own
    // sentence, and the journal must say why VibeSpace could not prevent it.
    const sk = res.socket;
    if (sk && sk.needed) {
      const head = `${key}: the agent-browser daemon socket would be ${sk.bytes} bytes under ${sk.root} (${sk.via} decides the root; max ${sk.max}), so every agent-browser command would answer "Session name … is too long"`;
      if (res.socketDir) {
        journalOnce(`socket-dir:${sk.root}`, `${head} — AGENT_BROWSER_SOCKET_DIR=${res.socketDir} is set for this session (a 0700 directory this user owns; ${sk.dirBytes} bytes)`);
        try { telemetry?.event?.('browser-socket-dir', `${sk.via} ${sk.bytes}`); } catch { }
      } else {
        journalOnce(`socket-dir-refused:${sk.refused}`, `${head}, and the short directory ${sk.dir} could NOT be used — ${sk.refused}. Nothing is set: the CLI will refuse every command in this session with that sentence until the directory is fixed or the home path is shorter.`);
        try { telemetry?.event?.('browser-socket-dir-refused', String(sk.refused).slice(0, 80)); } catch { }
      }
    }
  }

  // ── the one composition ──────────────────────────────────────────────────
  /**
   * THE spawn environment for one session, as `KEY=VALUE` strings.
   *
   *   @param browserKey  from `B.browserKeyFor` — the CONVERSATION's key
   *   @param integrationOn  the session's integration toggle; OFF ⇒ zero pairs
   *   @param remote      this session's CLI runs on another machine
   *   @param pinnedDir   a persistent user-data-dir (P1's pin)
   *   @param cwd         the session's own directory — where the CLI would read
   *                      `./agent-browser.json` from (local only; a remote cwd
   *                      is a path on the OTHER machine and is read there by
   *                      the prelude, never here)
   *   @returns {{pairs, remotePrelude, variant, configPath, profileDir, fallbacks, projectConfig}}
   *            `remotePrelude` is the shell fragment for `buildRemoteExec`'s
   *            `browser` slot ('' for a local session).
   */
  function envFor({ browserKey, integrationOn = true, remote = false, pinnedDir = null, cwd = null } = {}) {
    const off = { pairs: [], remotePrelude: '', variant: null, configPath: null, profileDir: null, fallbacks: [], socketDir: null };
    if (!integrationOn || !enabled() || !B.isBrowserKey(browserKey)) return off;
    let res;
    try { res = resolveVariant(browserKey, { pinnedDir, remote, cwd }); }
    catch (e) {
      // The ladder itself failing is a fallback, not "no browser env" — but the
      // names alone are only safe when the config names no profile, and a
      // resolver that threw could not read it. Fail to `none`, the shape that
      // cannot make a browser stop starting, and say why.
      res = {
        variant: B.VARIANTS.NONE, configPath: null, profileDir: null, socketDir: null,
        fallbacks: [{ from: B.VARIANTS.D, to: B.VARIANTS.NONE, why: `resolver threw: ${e && e.message} — with the config unread the names alone might point every session at one profile dir, so nothing is emitted (today's shared browser)` }],
      };
    }
    journal(browserKey, res, { remote });
    const pairs = B.browserEnvFor({
      browserKey, enabled: true, variant: res.variant,
      configPath: res.configPath, profileDir: res.profileDir,
      idleMs: setting('browser.idleTimeoutMs', B.DEFAULT_IDLE_TIMEOUT_MS),
      socketDir: res.socketDir || null,
    });
    return { pairs, remotePrelude: res.remotePrelude || '', ...res };
  }

  // ── §3.2.5 the pin indirection ───────────────────────────────────────────
  /**
   * Re-point what an ALREADY-SPAWNED session's environment names, so a pin in
   * the middle of a task needs no restart. The environment of a running shell
   * is immutable; the file and the symlink it points AT are not.
   *
   * Variant D: rewrite the per-session config atomically — `profile` present
   * when pinned, absent when not (its absence IS the ephemerality).
   * Variant C: re-point the symlink through `repointPoolSymlink`
   * (symlink-to-temp + rename), the pool's own primitive, borrowed rather than
   * re-spelled.
   *
   * WHEN IT TAKES EFFECT IS MEASURED (r4), and it is the opposite of what rounds
   * 1–3 inherited from the pool ("never on a browser already running; on the
   * NEXT launch"): on 0.32.0 the pin leaves the running chromium alone until
   * the NEXT COMMAND, and that command RELAUNCHES chromium onto the new
   * directory — the live page is gone (`get url` ⇒ `about:blank`, new pid on
   * the pinned dir; the no-pin control keeps page and pid). The answer says so
   * (`B.PIN_APPLIES_FROM`); P1's route owes a `close` first or a refusal while
   * a browser is live — "whether one is live" is a fact it can look up.
   *
   * AND A PIN IS REFUSED OVER A FENCED CONFIG (r2, §6.3). The generated config
   * carries the session's `allowedDomains` — the user file's since r2, the
   * project file's since r3 — so applying a pin would hand the session a
   * browser that answers every command with the CLI's own refusal. Saying no
   * with the reason is the design's ruling; accepting a flag that will be
   * silently dropped is the anti-pattern it names.
   *
   * THE PIN EDITS THE SESSION'S OWN FILE, IT DOES NOT REBUILD IT (r3). Round 2
   * regenerated the config from `~/.agent-browser/config.json` at pin time,
   * which would have re-derived the fence WITHOUT the project file that was
   * layered in at spawn (a pin route has no reason to know the session's cwd)
   * — silently un-fencing on pin, the finding-① shape through a second door.
   * The file on disk IS the session's effective config, so the pin toggles
   * exactly one key on it, `profile`, and reads the fence off that same file.
   * The variant-C rung is a symlink and never held a config, so it is
   * unchanged.
   */
  function repointPin(browserKey, pinnedDir) {
    if (!B.isBrowserKey(browserKey)) return { ok: false, why: 'not a browser key' };
    ensureDirs();
    const cfgP = configPathFor(browserKey);
    const linkP = linkPathFor(browserKey);
    // A FILE, not merely a path that exists: the C rung is reached precisely
    // when something non-file is sitting where the config should be, and asking
    // `existsSync` there picks D and then fails writing into a directory.
    const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
    const isLink = (p) => { try { return fs.lstatSync(p).isSymbolicLink(); } catch { return false; } };
    const plan = B.pinResolution({
      variant: isFile(cfgP) ? B.VARIANTS.D : (isLink(linkP) ? B.VARIANTS.C : null),
      pinnedDir, ephemeralDir: scratchDirFor(browserKey),
    });
    try {
      if (plan.variant === B.VARIANTS.D) {
        let current;
        try { current = JSON.parse(fs.readFileSync(cfgP, 'utf8')); } catch (e) { return { ok: false, why: `this session's generated config is unreadable: ${e && e.message}` }; }
        if (!current || typeof current !== 'object') return { ok: false, why: 'this session\'s generated config is not an object' };
        const conflict = B.pinFenceConflict({ userConfig: current, pinnedDir });
        if (conflict) return { ok: false, why: conflict.why, conflict: conflict.key, fence: conflict.fence };
        const next = { ...current };
        if (plan.configProfile) next.profile = plan.configProfile; else delete next.profile;
        writeJson(cfgP, next);
        return { ok: true, variant: plan.variant, appliesFrom: B.PIN_APPLIES_FROM, target: plan.configProfile };
      }
      if (plan.variant === B.VARIANTS.C) {
        // The C rung replaces no config, so the CLI still reads BOTH of its own
        // files there, as they stand NOW — and the project one lives in the
        // session's own directory, which this rung recorded beside the link at
        // spawn (r4). Round 3 asked `effectiveConfig(null)`, the user file
        // alone, so a PROJECT-level fence was invisible to this check. A
        // missing record is a refusal BY NAME, not a fall-back to the user
        // file: checking half the fence is how the last hole was made.
        const rec = readCwdSidecar(browserKey);
        if (!rec) {
          return { ok: false, why: `this session spawned on the per-session directory rung, but its own directory was not recorded beside the link (${path.basename(cwdPathFor(browserKey))} is missing or unreadable), so its project-level ${B.PROJECT_CONFIG_NAME} cannot be checked for a fence — refusing rather than risking a browser that answers every command with the CLI's refusal. Start a new session to pin it.` };
        }
        const conflict = B.pinFenceConflict({ userConfig: effectiveConfig(rec.cwd).config, pinnedDir });
        if (conflict) return { ok: false, why: conflict.why, conflict: conflict.key, fence: conflict.fence };
        if (plan.linkTarget) mkdirPrivate(plan.linkTarget);
        repointPoolSymlink(linkP, plan.linkTarget);
        return { ok: true, variant: plan.variant, appliesFrom: B.PIN_APPLIES_FROM, target: plan.linkTarget };
      }
      return { ok: false, why: 'this session has no browser indirection — it spawned on rung (N), `none`, on another machine (H), or before this feature' };
    } catch (e) { return { ok: false, why: String(e && e.message) }; }
  }

  /** What the NEXT `agent-browser` command in this session would resolve its
   *  user-data-dir to, read back off the indirection itself. This is the thing
   *  the no-restart test asserts, and it deliberately reads the FILE rather
   *  than any in-memory copy — an in-memory answer would pass with a writer
   *  that never lands. `''` = ephemeral (no `profile` key). */
  function resolvedProfileDir(browserKey) {
    const cfgP = configPathFor(browserKey);
    try { const c = JSON.parse(fs.readFileSync(cfgP, 'utf8')); return typeof c.profile === 'string' ? c.profile : ''; } catch { }
    try { return fs.readlinkSync(linkPathFor(browserKey)); } catch { }
    return null;     // no indirection at all (rung N / none / H)
  }

  // ── housekeeping ─────────────────────────────────────────────────────────
  /**
   * Remove the indirection objects and scratch directories of browser keys no
   * live session carries. This is the promise §3.2.2 attaches to variant C —
   * "由 `browserKey` 命名、住在 `data/` 下面、而且会被删除" — and it is the
   * difference between a fallback rung and a second orphan farm.
   *
   * `liveKeys` is a SET the caller derives from its own live sessions. An empty
   * set is a legitimate answer (a fresh boot with nothing restored yet), but a
   * MISSING one is not: pass null and this sweeps nothing and says so, because
   * "I could not enumerate the live sessions" must never be spelled the same
   * way as "there are none".
   */
  function sweep(liveKeys, { graceMs = SWEEP_GRACE_MS } = {}) {
    if (!liveKeys) return { swept: 0, kept: 0, spared: [], skipped: 'no live-session set supplied' };
    let swept = 0, kept = 0;
    const spared = [];
    // THE ON-DISK HALF IS NOT OPTIONAL. A session restored at boot may not
    // carry `_browserKey` in memory at the instant this runs, and a meta file
    // exists for exactly as long as a session does (teardown deletes it), so
    // the union is what "live" means. Asking only the in-memory set would make
    // a server restart delete a running session's own indirection — the pin
    // would silently revert and the next launch would land somewhere else.
    const live = new Set([...liveKeys].filter(Boolean));
    for (const k of liveKeysFromMeta()) live.add(k);
    const sweptAt = Date.now();
    for (const [dir, isDir] of [[ENV_DIR, false], [PROFILE_DIR, true]]) {
      let names = []; try { names = fs.readdirSync(dir); } catch { continue; }
      for (const n of names) {
        // `.cwd` is the C rung's sidecar (r4) — swept with its link, or it is
        // one more thing under data/ that nothing owns.
        // A child's config (`<key>.<n>.json`, rung D's sub-agent) is OWNED by its
        // parent key: it lives exactly as long as the parent session does.
        const key = B.parentKeyOf(isDir ? n : n.replace(/\.(json|profile|cwd)$/, ''));
        if (!B.isBrowserKey(key)) continue;
        if (live.has(key)) { kept++; continue; }
        // A create in flight has written its indirection and not yet its meta.
        // Every sweeper in this tree refuses to remove something that young,
        // and this one reports the age it spared rather than shrugging.
        let ageMs = Infinity;
        // CLAMPED AT ZERO on purpose: `sweptAt` is `Date.now()` (millisecond
        // truncation) while `mtimeMs` carries sub-millisecond precision, so a
        // file written microseconds ago measures as -1 ms old. Negative is
        // already "younger than the grace", but a negative AGE in a log line is
        // a bug report against whoever reads it (measured: -1 on this box's
        // tmpfs, first run).
        try { ageMs = Math.max(0, sweptAt - fs.lstatSync(path.join(dir, n)).mtimeMs); } catch { }
        if (graceMs > 0 && ageMs < graceMs) { spared.push({ name: n, ageMs: Math.round(ageMs) }); kept++; continue; }
        try { fs.rmSync(path.join(dir, n), { recursive: true, force: true }); swept++; } catch { }
      }
    }
    if (swept || spared.length) {
      try { log.log?.(`[browser] swept ${swept} orphaned browser env object(s); ${kept} live${spared.length ? `; spared ${spared.length} younger than ${graceMs}ms (a create may still be in flight)` : ''}`); } catch { }
    }
    return { swept, kept, spared, sweptAt, graceMs };
  }

  /**
   * A sub-agent's OWN generated config on rung D (2026-09-21): the parent's
   * `<key>.json` with `profile` deleted and everything else (the fence, the
   * user's own values, `headed`) kept — written beside it as `<key>.<n>.json`,
   * PROVED readable and profile-less before its path is answered (the same
   * read-back rule as the parent's: a config the CLI cannot read is an exit 1).
   * `namesProfile` reports whether the PARENT's config names a directory, so
   * the PURE `childEnvFor` can choose between inherit and unset when this
   * write fails. Swept with the parent (`sweep` owns child files by their
   * parent key).
   */
  function childConfigFor(childKey) {
    if (!B.isChildKey(childKey)) return { path: null, namesProfile: null, why: 'not a child key' };
    const parentPath = configPathFor(B.parentKeyOf(childKey));
    let cfg;
    try { cfg = JSON.parse(fs.readFileSync(parentPath, 'utf8')); } catch (e) { return { path: null, namesProfile: null, why: `the parent's generated config is unreadable: ${e && e.message}` }; }
    if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return { path: null, namesProfile: null, why: 'the parent\'s generated config is not an object' };
    const namesProfile = B.configNamesProfile(cfg);
    const out = { ...cfg };
    delete out.profile;
    try {
      ensureDirs();
      const p = configPathFor(childKey);
      writeJson(p, out);
      const back = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (!back || typeof back !== 'object' || B.configNamesProfile(back)) throw new Error('read-back names a profile');
      return { path: p, namesProfile, why: null };
    } catch (e) { return { path: null, namesProfile, why: `child config unusable: ${e && e.message}` }; }
  }

  /** Every browser key a session-meta file on disk still names. A meta file
   *  lives exactly as long as its session does, which makes this the durable
   *  half of "live" — see the note in `sweep`. */
  function liveKeysFromMeta() {
    const out = new Set();
    let names = []; try { names = fs.readdirSync(path.join(dataDir, 'session-meta')); } catch { return out; }
    for (const n of names) {
      if (!n.endsWith('.json')) continue;
      try {
        const m = JSON.parse(fs.readFileSync(path.join(dataDir, 'session-meta', n), 'utf8'));
        if (m && B.isBrowserKey(m.browserKey)) out.add(String(m.browserKey));
      } catch { }
    }
    return out;
  }

  // ── §3.2.1 recovering the key a CONVERSATION already had ─────────────────
  /**
   * A conversation owns many webui session keys over its life (`ws-create`
   * mints `sess-<seq>-<ms>` inside the same `create` case that handles resume),
   * so the browser key has to be recovered from the conversation, not from the
   * webui id. The join already exists and is REFERENCED rather than re-spelled:
   * `reading-repair._sessionKeyMap` reads `data/session-meta` and answers
   * conversation id → `[{key, at}]` (the webui key is derived from the FILE
   * NAME, so it survives any field going missing).
   *
   * Newest first, because a conversation's most recent carrier is the one whose
   * browser is still around. A key that was minted but never written (a create
   * that died before `writeSessionMeta`) simply is not there, and the ladder
   * then calls this a `resume-unknown` out loud instead of silently minting.
   */
  function priorKeyFor(conversationId) {
    if (!conversationId) return '';
    // RUNG 1 (r5): the durable binding. The meta files below are UNLINKED by
    // the kill and pty-exit paths, so for the product's own Terminate → Resume
    // this is the only rung that can answer (measured: 0 meta files name the
    // conversation after a ws kill).
    const bound = bindings.lookup(String(conversationId));
    if (bound) return bound;
    // RUNG 2: the meta join — a store that predates the binding file, or a
    // live session whose binding write failed and was journalled.
    let map;
    try { map = require('../reading-repair.js')._sessionKeyMap(dataDir); } catch { return ''; }
    const list = (map && map.get(String(conversationId))) || [];
    const sorted = [...list].sort((a, b) => (b.at || 0) - (a.at || 0));
    for (const e of sorted) {
      // `sess-<seq>-<ms>` ⇒ `cw-<seq>-<ms>.json` (2.304.0: the socket name is
      // DERIVED from the id, which is why the file name is enough).
      const file = path.join(dataDir, 'session-meta', 'cw-' + String(e.key).slice('sess-'.length) + '.json');
      try {
        const m = JSON.parse(fs.readFileSync(file, 'utf8'));
        // r7: the same rule rung 1 was written under — a record that may not
        // BIND this conversation (a live fork still naming its parent, an
        // implicit fork naming an id its key was not decided for) may not
        // answer for it here either.
        if (m && B.isBrowserKey(m.browserKey) && browserBindings.bindableIdOf(m) === String(conversationId)) return String(m.browserKey);
      } catch { }
    }
    return '';
  }

  return {
    envFor, checkFloor, floorState, repointPin, resolvedProfileDir, sweep, priorKeyFor, liveKeysFromMeta, bindings, childConfigFor,
    // paths, so the suite asserts the real ones rather than its own guess
    ENV_DIR, PROFILE_DIR, configPathFor, linkPathFor, cwdPathFor, scratchDirFor, effectiveConfig, ensureSocketDir,
    // takeover r2: the base the remote prelude's short socket dir is built on — `/resolve` names it to a
    // rung-H CLI, which keeps a shell AGENT_BROWSER_SOCKET_DIR only when it is `<base>/vs-ab-<its uid>`
    socketDirBase: B.socketDirBaseOf(socketDirBase),
    _facts: bf,
  };
}

module.exports = { create, writeJsonAtomic, mkdirPrivate, SWEEP_GRACE_MS, FILE_MODE, DIR_MODE };
