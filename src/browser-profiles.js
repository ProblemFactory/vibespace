'use strict';
/**
 * THE AGENT BROWSER'S IDENTITY AND ITS SPAWN ENVIRONMENT — PURE (imports only
 * the sibling PURE verb table, r3). docs/design-agent-browser-v2.zh.md §3.2 / §3.2.1 / §3.2.2 / §3.2.3,
 * phase P0 ("零干扰" — stop agents from closing each other's windows).
 *
 * WHAT P0 ACTUALLY IS. Today an agent runs the `agent-browser` CLI out of its
 * own shell and VibeSpace has never heard of it: `git grep agent-browser` over
 * the tracked tree answered with exactly one hit, and that hit was a COMMENT.
 * Every such call lands in the ONE shared profile named by this machine's
 * `~/.agent-browser/config.json`, in that profile's DEFAULT session — so two
 * agents take turns stealing each other's active tab, and `close --all` closes
 * everybody's browser. P0 is four environment variables set at spawn. There is
 * no new VibeSpace process and no new daemon.
 *
 * WHY FOUR AND NOT TWO. `--session` isolates the browser CONTEXT and
 * `--namespace` isolates the daemon SOCKET, and those two are the famous
 * five-line fix. They are not enough, and the two additions are not details:
 *
 *   · THE USER-DATA-DIR IS A DECISION, NEVER AN OMISSION (§3.2.2). The CLI's
 *     own documented precedence is config file < env < flags, so a `profile`
 *     key in `~/.agent-browser/config.json` applies to every call that does not
 *     override it. MEASURED on the installed 0.32.0 (2026-09-13, this box):
 *     with SESSION + NAMESPACE set and nothing else, the chromium child's
 *     resolved `--user-data-dir` is still `~/.agent-browser/default-profile` —
 *     the shared 6.8 GB cookie jar. That is variant B, and it is broken twice
 *     over: it is not ephemeral (which is the whole of D3), and N per-session
 *     daemons would each try to launch chromium against ONE user-data-dir,
 *     which chromium's process singleton does not allow. `variantLadder()`
 *     below is the (D) → (C) → (N) → none answer, D12 — with the design's (A)/(B)
 *     both measured to collide and named rejects (r3).
 *   · THE IDLE TIMEOUT IS SET EXPLICITLY (§3.2.3). P0 is the moment one shared
 *     chromium becomes one per browsing session. The installed build's default
 *     is `disabled by default` (its own --help), and even on ≥0.33.1 the 1-hour
 *     default EXEMPTS headed browsers — and this machine's config is
 *     `headed: true`, so the exemption is the normal case, not a corner. An
 *     inherited default here means nothing ever reclaims the browsers this
 *     feature creates.
 *
 * WHY THE KEY IS NOT THE WEBUI SESSION ID (§3.2.1). `src/ws-create.js` mints
 * `sess-<seq>-<ms>` inside the same `create` case that handles resume and fork,
 * so one CONVERSATION owns many webui keys over its life. Keying the browser on
 * the webui id leaks a browser per resume: a new namespace, a new daemon, a new
 * pinned tab. `browserKey` is minted ONCE (`bk-<8 hex>`), recorded in that
 * session's `session-meta`, and recovered on resume through the join this repo
 * already has (`reading-repair._sessionKeyMap`: conversation id → webui keys).
 * A FORK mints a NEW key — a fork is a new conversation and must not inherit
 * another conversation's cookies or pinned tab (D15) — while it COPIES the pin,
 * because the pin is a PREFERENCE and the key is an IDENTITY.
 *
 * PURE because every one of these is a decision, and the orchestrator half
 * (writing the generated config, making the scratch dir, journaling which rung
 * it landed on) is `src/server/browser-env.js`. The gate is
 * scripts/test-browser-profiles.mjs, and its environment leg asserts the
 * RESOLVED user-data-dir rather than the two env strings — asserting the
 * strings passes on variant B, the broken one.
 */

// takeover r3: the ONE config rule (the sibling PURE verb table the shipped CLI
// carries — a remote CLI composes a command's config by the same words)
const VERBS = require('./browser-verbs.js');

// ── names ───────────────────────────────────────────────────────────────────
/** The agent-browser session/namespace name for a browser key. ONE spelling:
 *  both variables carry it, because §3.2.4's two names answer two different
 *  questions (context vs daemon socket) about the SAME browser. */
function sessionNameFor(browserKey) { return 'vs-' + String(browserKey || ''); }

/** `bk-<8 hex>`. The caller supplies the randomness so this file imports
 *  nothing; `mintBrowserKey(crypto.randomBytes(4).toString('hex'))`. */
function mintBrowserKey(hex8) {
  const h = String(hex8 || '').toLowerCase().replace(/[^0-9a-f]/g, '').slice(0, 8).padStart(8, '0');
  return 'bk-' + h;
}
const BROWSER_KEY_RE = /^bk-[0-9a-f]{8}$/;
function isBrowserKey(v) { return BROWSER_KEY_RE.test(String(v || '')); }

// ── §3.2.1 the continuity ladder ────────────────────────────────────────────
/**
 * Which browser key does THIS create get?  The shape is deliberately
 * `src/resume-continuity.js`'s: an answer plus the ORIGIN that produced it,
 * stated rather than inferred, so a log line and a properties row can never
 * disagree about why.
 *
 *   @param prior      the key recovered for this CONVERSATION, or ''/null
 *   @param resume     this create carries `data.resume && data.resumeId`
 *   @param fork       this create is a fork
 *   @param mint       () => a fresh key (the caller owns the randomness)
 *   @returns {{key, origin: 'conversation'|'fork'|'new'|'resume-unknown'}}
 *
 * `resume-unknown` is NOT 'new' wearing a different hat: a resume that could
 * not find its own previous key is the leak this ladder exists to prevent, and
 * the orchestrator logs it by that name so it is visible when it happens rather
 * than inferred later from a pile of orphaned profile directories.
 */
function browserKeyFor({ prior, resume, fork, mint }) {
  const have = isBrowserKey(prior) ? String(prior) : '';
  if (fork) return { key: mint(), origin: 'fork' };
  if (resume) return have ? { key: have, origin: 'conversation' } : { key: mint(), origin: 'resume-unknown' };
  return { key: mint(), origin: 'new' };
}

// ── §3.2.2 the user-data-dir ladder (D12) ───────────────────────────────────
/**
 * The variants a spawn can land on. Exported so the suite and the journal speak
 * one vocabulary, and so a reader can see which of the design's letters are
 * NAMED REJECTS rather than oversights.
 *
 * THE DESIGN'S (A) AND (B) ARE BOTH REJECTS, AND THAT IS MEASURED (r3). §3.2.2's
 * table gives (A) "SESSION only — no directory conflict, one daemon owns the
 * directory". On the installed 0.32.0 that row is false: with ONE namespace and
 * two `--session` names against a config that names a `profile`, the second
 * session's chromium dies on `SingletonLock: File exists` exactly as (B)'s does
 * (one arm per shape, same host config, 2026-09-14, this box). Every `--session`
 * launches its own chromium, so what decides the collision is not how many
 * daemons there are but whether TWO of them are pointed at ONE user-data-dir —
 * and any config that names a profile points every one of them at it.
 *
 * So the shape below the two directory rungs is not the design's (A). It is
 * (N): the three names with the machine's config left untouched — which is
 * SAFE precisely when that config names NO profile (measured: each daemon then
 * gets the CLI's own ephemeral `/tmp/agent-browser-chrome-<uuid>`) and a hard
 * launch failure when it does. Below (N) there is only `none`: emit nothing and
 * keep today's shared behaviour, because the harm P0 exists to stop (a stolen
 * tab, a crossed `close --all`) is smaller than a browser that cannot start.
 */
const VARIANTS = Object.freeze({
  D: 'D',       // + AGENT_BROWSER_CONFIG=<generated config with NO profile key> — truly ephemeral, carries the fence
  C: 'C',       // + AGENT_BROWSER_PROFILE=<per-session scratch dir> — ours, swept
  N: 'N',       // the three names alone, config untouched — ONLY when that config names no profile
  H: 'H',       // REMOTE: decided ON THE HOST at spawn between C and N by its own config (`remoteBrowserPrelude`)
  NONE: 'none', // nothing emitted — today's shared browser. The floor when the config names a profile and neither D nor C is available
});
/**
 * Does a session that landed on `variant` have its OWN browser (P0 r5)? The
 * tools intro tells an agent "`close --all` closes only yours" — a sentence
 * that is a lie on rung `none` (nothing emitted, today's shared browser) and
 * for a session with no recorded rung (the feature off, the resolver
 * unavailable, a session that predates it). One table, asked by the intro
 * and by the manual's own wording; a new rung is a row here, never a branch.
 */
const ISOLATED_VARIANTS = Object.freeze([VARIANTS.D, VARIANTS.C, VARIANTS.N, VARIANTS.H]);
function isolatedVariant(v) { return ISOLATED_VARIANTS.includes(String(v || '')); }
/** The design's letters this module refuses to ship, with the measurement. */
const REJECTED_VARIANTS = Object.freeze({
  A: 'SESSION only: `close --all` still reaches every session, and with a profile named the second session\'s chromium fails on SingletonLock exactly like B (measured 2026-09-14, 0.32.0)',
  B: 'SESSION + NAMESPACE with the config\'s profile in force: N daemons, one user-data-dir — the second browser fails to launch (measured: ProcessSingleton, `Failed to create <profile>/SingletonLock: File exists`)',
});

/**
 * (D) → (C) → (N) → none, each fallback carrying its reason. The caller passes
 * what it MANAGED to do, never what it hopes: `configPath` is non-empty only
 * when the generated config was written AND read back, `profileDir` only when
 * the scratch directory exists, and `namesProfile` is what the machine's
 * EFFECTIVE config (user file + project file, `layerProjectConfig`) says.
 *
 * The readback is load-bearing and it is measured: with `AGENT_BROWSER_CONFIG`
 * pointing at a missing file the installed CLI prints `⚠ config file not found`
 * and exits 1; pointing at invalid JSON it prints `⚠ invalid config file …` and
 * exits 1 (both measured 2026-09-13 on 0.32.0). That is a hard dependency in
 * the UNSAFE direction — a bug in our writer would break a tool that works
 * today — so the variable is only set once the file has been proven readable,
 * and the rungs below it exist for exactly that failure.
 *
 * Landing on (N) is a DEGRADED P0, not a broken one: session + namespace still
 * isolate the context and the daemon socket, so `close --all` is still scoped
 * and nobody steals anybody's tab, and with no profile named the CLI's own
 * ephemeral directory does the rest. Landing on `none` IS today: the journal
 * says so, with the profile that made the names unsafe.
 *
 * A FENCED CONFIG NEVER LANDS ON (C) (r4). Rung C exports `AGENT_BROWSER_PROFILE`,
 * and the CLI refuses `--allowed-domains` beside a profile at the ARGUMENT
 * check — so under a fenced effective config the C rung is a browser that
 * answers EVERY command `✗ --allowed-domains is not supported with --profile`
 * where the bare CLI works. MEASURED 2026-09-14 on 0.32.0 with one injected
 * variable (the generated config's writer throwing): `allowedDomains:
 * ['example.com']` ⇒ round 3 answered variant C ⇒ `open https://example.com/`
 * refused with that sentence, while the same HOME bare answered `✓ Example
 * Domain`. Round 3's ladder asked only "did the caller manage a scratch dir",
 * and the caller could — the fence lives in the CONFIG, not on the filesystem.
 * `fenced` is therefore an INPUT of the ladder, stated by this PURE half, and a
 * fenced descent skips C by rule. The step is still journalled as "C → N" with
 * the fence as its reason: "C was refused, and here is why" is the sentence a
 * reader needs, and it is a different sentence from "C was tried and failed".
 * Below it the N/`none` decision is unchanged — a fenced config cannot name a
 * profile (the CLI refuses that combination whole, measured), so a fenced
 * descent lands on N BY CONSTRUCTION: the three names keep the fence intact and
 * the CLI's own ephemeral directory does the rest.
 */
/** The sentence the ORCH half journals when it skips C; exported so the reason
 *  is ONE spelling wherever it is printed. `fence` is the effective config's
 *  `allowedDomains` (an array), or anything falsy for the default wording. */
function fencedRungReason(fence) {
  const list = Array.isArray(fence) && fence.length ? fence.join(', ') : 'allowedDomains';
  return `rung C refused: this session's effective config is fenced (allowedDomains: ${list}) and the CLI refuses `
    + `--allowed-domains beside a profile, so a per-session profile directory would make EVERY browser command `
    + `fail where the bare CLI works (measured 0.32.0); the names alone keep the fence and the CLI's own ephemeral directory`;
}
function variantLadder({ configPath, profileDir, reasons = [], namesProfile = false, fenced = false }) {
  const fallbacks = [];
  if (configPath) return { variant: VARIANTS.D, configPath, profileDir: null, fallbacks };
  // ONE RUNG AT A TIME: leaving D is always "D → C", even when C then fails
  // too. A fallback line describes the step that was taken, so a reader can
  // follow the descent; collapsing it to "D → N" hides that C was tried.
  fallbacks.push({ from: VARIANTS.D, to: VARIANTS.C, why: reasons[0] || 'generated config unavailable' });
  // A FENCED config never lands on C, whatever the caller managed to create:
  // the rung itself is the failure there (see above). `profileDir` is ignored
  // on purpose — a scratch dir that exists is not a scratch dir that is safe.
  if (fenced) fallbacks.push({ from: VARIANTS.C, to: VARIANTS.N, why: reasons[1] || fencedRungReason(null) });
  else if (profileDir) return { variant: VARIANTS.C, configPath: null, profileDir, fallbacks };
  else fallbacks.push({ from: VARIANTS.C, to: VARIANTS.N, why: reasons[1] || 'per-session profile directory unavailable' });
  if (!namesProfile) return { variant: VARIANTS.N, configPath: null, profileDir: null, fallbacks };
  fallbacks.push({
    from: VARIANTS.N, to: VARIANTS.NONE,
    why: 'this machine\'s browser config (~/.agent-browser/config.json) names a `profile`, and the names alone would point every session\'s chromium at that ONE user-data-dir — the second browser fails to launch (measured: SingletonLock). Sharing, as today, is the smaller harm than a browser that cannot start',
  });
  return { variant: VARIANTS.NONE, configPath: null, profileDir: null, fallbacks };
}

/** Does this EFFECTIVE config name a user-data-dir? A non-empty string is one
 *  whether it is a path or a Chrome profile NAME (`Default`) — both resolve to a
 *  directory every session would share. `null`/`''`/a number name nothing, and
 *  neither does a `profile` key nested inside another value (a `plugins[]`
 *  entry, say): only the TOP-LEVEL key is the CLI's. The remote fragment's awk
 *  (`TOP_LEVEL_PROFILE_AWK`) answers the SAME question on the host, and the gate
 *  drives both spellings over ONE table (r4 — round 3's `grep '"profile":'`
 *  counted `"profile": null` as naming one, so a host whose config carried that
 *  key beside a fence — a shape that works bare — was handed a profile the CLI
 *  refuses beside `--allowed-domains`, measured). */
function configNamesProfile(cfg) {
  const v = cfg && typeof cfg === 'object' ? cfg.profile : null;
  return typeof v === 'string' && v.trim().length > 0;
}

// ── the daemon socket path bound (r4) ──────────────────────────────────────
/**
 * A unix socket path is at most 103 bytes (`sun_path` less its NUL) and the CLI
 * checks it BEFORE anything launches: `✗ Session name 'vs-bk-…' is too long.
 * Socket path would be 104 bytes (max 103). Use a shorter session name or set
 * AGENT_BROWSER_SOCKET_DIR to a shorter path.` The socket lives at
 * `<root>/namespaces/<ns>/run/<session>.sock`, and the root is — MEASURED
 * 2026-09-14 on 0.32.0 through `session info --json`'s own `socketDir`, one
 * variable per arm — `AGENT_BROWSER_SOCKET_DIR` when set, else
 * `$XDG_RUNTIME_DIR/agent-browser` when THAT is set, else `$HOME/.agent-browser`.
 * With both names `vs-bk-<8 hex>` the tail past the root is 50 bytes, so under
 * `$HOME` the whole path is |HOME| + 65: a home of 38 characters fits (103) and
 * one of 39 does not (104 — `tab list` refused before anything launched, while
 * the bare CLI's `default` name still fits at 39). Round 3 recorded this as an
 * open boundary and left it to the manual; r4 sets the CLI's own remedy — ONLY
 * when the path the CLI would otherwise use is over the limit — at a SHORT
 * per-uid directory the ORCH half creates 0700 and VERIFIES it owns (a fixed
 * name in a shared /tmp can be pre-created by anyone, the wire probe's r6
 * lesson; a hijacked directory means NO variable and a journal line, never a
 * socket in somebody else's directory). The design's name shape (§3.2,
 * `vs-<browserKey>`) is untouched: shortening the NAME is the owner's call, the
 * socket root is the CLI's own knob for exactly this.
 *
 * `SOCKET_DIR_BASE` is the LITERAL `/tmp`, not `os.tmpdir()`: the whole point is
 * a short root, and `TMPDIR` may be the long path being escaped (this is the
 * same reasoning as the heavy gate's machine lock). The remote fragment applies
 * the identical rule on the host, in shell, from the host's own `$HOME`.
 */
const SOCKET_PATH_MAX = 103;
const SOCKET_DIR_BASE = '/tmp';
/** Bytes, not characters: the kernel's `sun_path` counts bytes. */
function utf8Bytes(s) {
  const str = String(s == null ? '' : s);
  if (typeof Buffer !== 'undefined' && Buffer.byteLength) return Buffer.byteLength(str, 'utf8');
  let n = 0;
  for (const ch of str) { const c = ch.codePointAt(0); n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; }
  return n;
}
/** The part of the socket path past the root, for our name shape. 50 bytes for
 *  `vs-bk-<8 hex>` on both names; computed, not typed, so the shell rule and
 *  this one derive from the same names. */
function socketTailBytes(browserKey) {
  const name = sessionNameFor(browserKey);
  return utf8Bytes(`/namespaces/${name}/run/${name}.sock`);
}
/** Which root the CLI will use, given the environment the session gets — the
 *  measured precedence, one rung per variable. */
function socketRootFor({ home, xdgRuntimeDir, socketDir } = {}) {
  if (socketDir) return { root: String(socketDir), via: 'AGENT_BROWSER_SOCKET_DIR' };
  if (xdgRuntimeDir) return { root: `${String(xdgRuntimeDir)}/agent-browser`, via: 'XDG_RUNTIME_DIR' };
  return { root: `${String(home || '')}/.agent-browser`, via: 'HOME' };
}
/** A shell-safe base for the short directory: our own literal, or a scratch
 *  base a suite hands in. Anything a shell could read as syntax falls back to
 *  the literal — the fragment interpolates it unquoted-by-construction. */
function socketDirBaseOf(base) {
  const b = String(base || SOCKET_DIR_BASE).replace(/\/+$/, '');
  return /^\/[A-Za-z0-9._/-]*$/.test(b) ? (b || '/') : SOCKET_DIR_BASE;
}
/**
 * Does THIS session need `AGENT_BROWSER_SOCKET_DIR`, and where would it point?
 *   @returns {{needed, root, via, bytes, max, dir, dirBytes, fits}}
 *   `needed`  = the CLI's own root would put the socket over the limit
 *   `dir`     = `<base>/vs-ab-<uid>`, the short per-uid directory
 *   `fits`    = that directory itself keeps the path under the limit (a base a
 *               suite hands in could be long; the ORCH refuses to emit a
 *               remedy that does not remedy)
 */
function socketDirDecision({ browserKey, home, xdgRuntimeDir, socketDir, uid, base } = {}) {
  const r = socketRootFor({ home, xdgRuntimeDir, socketDir });
  const tail = socketTailBytes(browserKey);
  const bytes = utf8Bytes(r.root) + tail;
  const dir = `${socketDirBaseOf(base)}/vs-ab-${Number.isInteger(uid) && uid >= 0 ? uid : 'u'}`;
  const dirBytes = utf8Bytes(dir) + tail;
  return { needed: bytes > SOCKET_PATH_MAX, root: r.root, via: r.via, bytes, max: SOCKET_PATH_MAX, dir, dirBytes, fits: dirBytes <= SOCKET_PATH_MAX };
}

// ── the CLI's own two-file precedence (r3) ─────────────────────────────────
/**
 * `agent-browser` reads TWO files before the environment — `~/.agent-browser/
 * config.json` (user level) and `./agent-browser.json` in the directory a
 * command runs from (project level, HIGHER priority) — and `AGENT_BROWSER_CONFIG`
 * replaces BOTH. Round 2 carried only the first across, so a project-level
 * browsing fence (or its action policy, confirmation list, init scripts…) was
 * still deleted from every local session, and with `dropped: []` there was
 * nothing in the journal about it. Finding ① unfixed for the second file.
 *
 * THE MERGE RULE IS THE CLI'S, MEASURED (2026-09-14, 0.32.0, one variable per
 * arm): a key present in both files takes the PROJECT value — `args` from the
 * project file reached the chromium cmdline and the user file's did not — a
 * key present in one file survives (`userAgent` set only at user level still
 * answered), and `extensions` is the ONE key that is CONCATENATED, user first
 * (`--load-extension=<user>,<project>`; the CLI's own `--help` says "Extensions
 * from user and project configs are merged (not replaced)"). The CLI does NOT
 * walk up: from a subdirectory of the project the fence was absent, so the
 * project file is EXACTLY the one in the directory the command runs from.
 *
 * WHAT THAT MEANS FOR A GENERATED CONFIG, stated rather than hidden: the layer
 * is taken at SPAWN from the session's own directory. Today the file applies
 * per INVOCATION — an agent that cd's into another directory with its own
 * `agent-browser.json` would get that one instead — and under the generated
 * config it does not; the session's directory is the one that applies for the
 * whole session. The journal names the file it layered.
 */
const USER_CONFIG_REL = '.agent-browser/config.json';
const PROJECT_CONFIG_NAME = 'agent-browser.json';
function layerProjectConfig(userConfig = {}, projectConfig = null) {
  const u = userConfig && typeof userConfig === 'object' ? userConfig : {};
  const p = projectConfig && typeof projectConfig === 'object' ? projectConfig : null;
  if (!p) return { ...u };
  const out = { ...u, ...p };
  const ext = (v) => (Array.isArray(v) ? v : (v === undefined || v === null || v === '' ? [] : [v]));
  if ('extensions' in u || 'extensions' in p) out.extensions = [...ext(u.extensions), ...ext(p.extensions)];
  return out;
}

// ── §3.2.3 the bound ───────────────────────────────────────────────────────
/** 15 minutes for a browser nobody leased (§3.2.3's recommendation). P1's
 *  keeper raises it to 0 for the duration of a lease; P0 has no keeper, so this
 *  is the ONLY thing that ever reclaims a browser this feature created, which
 *  is why it is set explicitly instead of inherited. */
const DEFAULT_IDLE_TIMEOUT_MS = 15 * 60 * 1000;

function idleTimeoutMs(setting) {
  const n = Number(setting);
  // An explicit 0 is the CLI's own "never shut down" and a user may mean it;
  // anything unparseable is silence, and silence takes the bound.
  if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  return DEFAULT_IDLE_TIMEOUT_MS;
}

// ── the env itself ─────────────────────────────────────────────────────────
/**
 * THE ONE COMPOSITION. Returns `KEY=VALUE` strings, because that is what both
 * spawn paths consume: the local `r6Argv`'s `env` prefix and the remote
 * `buildRemoteExec` `parts` (which shell-quotes them). `hostId` never appears
 * here — it is a parameter of the CALLER's transport choice, never a branch in
 * the decision (the CS separation law).
 *
 * INTEGRATION OFF ⇒ ZERO PAIRS. A session with the integration switched off
 * carries nothing agent-visible, and this is part of that nothing: the negative
 * control in the suite asserts the empty array, not "some smaller set".
 */
function browserEnvFor({ browserKey, enabled = true, variant = VARIANTS.N,
  configPath = null, profileDir = null, idleMs = DEFAULT_IDLE_TIMEOUT_MS, socketDir = null } = {}) {
  if (!enabled || !isBrowserKey(browserKey)) return [];
  // `none` IS a decision — today's shared browser, because the names alone
  // would put every session on one user-data-dir (see variantLadder).
  if (variant === VARIANTS.NONE) return [];
  const name = sessionNameFor(browserKey);
  const pairs = [
    `AGENT_BROWSER_SESSION=${name}`,
    `AGENT_BROWSER_NAMESPACE=${name}`,
    `AGENT_BROWSER_IDLE_TIMEOUT_MS=${idleTimeoutMs(idleMs)}`,
  ];
  if (variant === VARIANTS.D && configPath) pairs.push(`AGENT_BROWSER_CONFIG=${configPath}`);
  else if (variant === VARIANTS.C && profileDir) pairs.push(`AGENT_BROWSER_PROFILE=${profileDir}`);
  // The FIFTH variable, only when the CLI's own socket root is over the 103-byte
  // limit for our names (r4; `socketDirDecision`). The ORCH half decides and
  // owns the directory; this composition only carries what it was handed.
  if (socketDir) pairs.push(`AGENT_BROWSER_SOCKET_DIR=${socketDir}`);
  return pairs;
}

// ── the REMOTE rung: decided on the host, by the host (r3) ─────────────────
/**
 * A remote session cannot take rung (D) or (C) from here: both name a LOCAL
 * object (a file we read back, a directory we sweep). Round 2 therefore sent
 * the three names alone and called it the floor. MEASURED (2026-09-14, 0.32.0):
 * on a host whose config names a `profile`, that is variant (B) — the second
 * concurrent session's chromium dies on `SingletonLock: File exists` where
 * today both launch — while on a host that names no profile the names alone
 * are already ephemeral per daemon. And the directory rung is not safe to send
 * unconditionally either: on a FENCED host (`allowedDomains`, which the CLI
 * forbids beside a profile) an `AGENT_BROWSER_PROFILE` makes every command
 * answer `--allowed-domains is not supported with --profile`.
 *
 * So the decision needs one fact — does THIS host's effective config name a
 * profile — and the fact lives on the host. This fragment asks it there, in
 * the shell that is already running as the ONE remote composition's prelude
 * (`buildRemoteExec`, after its `cd`, so `./agent-browser.json` is the
 * session's own directory, exactly the file the CLI would read):
 *
 *   · names a profile ⇒ export AGENT_BROWSER_PROFILE=$HOME/.vibespace/
 *     browser-profiles/<vs-key>, i.e. rung (C) on that host: a per-key
 *     directory the CLI creates lazily (measured — only when the agent browses)
 *     and that this same prelude SWEEPS on every later spawn once it is older
 *     than REMOTE_SCRATCH_STALE_DAYS and holds no live browser. Both files stay
 *     in force (env overrides only `profile`), so a fence is impossible here —
 *     the CLI already refuses profile+fence in the same config.
 *   · names none ⇒ nothing: rung (N), ephemeral per daemon there already.
 *
 * LIVENESS IS `-L`, NOT `-e`. Chromium's `SingletonLock` is a DANGLING SYMLINK
 * to `<host>-<pid>` while the browser runs (measured: `isSymbolicLink=true`,
 * `existsSync=false`) and is removed at exit; `[ -e ]` follows the link and
 * answers "absent" for a LIVE profile, which would sweep a running browser's
 * directory out from under it.
 *
 * "NAMES A PROFILE" IS THE SAME QUESTION `configNamesProfile` ANSWERS, spelled
 * in awk (r4). Round 3 asked `grep -qs '"profile"[[:space:]]*:'` over both
 * files, which is a LOOSER spelling: it counts `"profile": null` and `""` as
 * naming one (measured on 0.32.0 — a host config `{…, allowedDomains, profile:
 * null}` works bare and answered `✗ --allowed-domains is not supported with
 * --profile` under the exported variable), it counts a key nested inside
 * another value, and it cannot see a project file's `null` OVERRIDING the user
 * file's string. `TOP_LEVEL_PROFILE_AWK` walks the JSON with a depth counter
 * and answers `yes` (a non-empty top-level string), `no` (the key is present
 * but names nothing) or `absent`; the project file is asked FIRST and a `yes`
 * or `no` there is final — the CLI's own per-key precedence, the rule
 * `layerProjectConfig` spells on this side. Driven under every shell AND every
 * awk on the box (mawk, busybox) over ONE table with the PURE predicate.
 *
 * THE SOCKET ROOT RULE RIDES HERE TOO (r4, `socketDirDecision` in shell): the
 * host's own `$HOME` decides, `printf | wc -c` counts BYTES like the kernel,
 * a pre-set `AGENT_BROWSER_SOCKET_DIR` is left alone, `$XDG_RUNTIME_DIR` is
 * honoured as the CLI's own second rung, and the short directory is exported
 * only when it exists, is not a symlink and `-O` says this user owns it.
 *
 * POSIX AND QUOTED: this text runs under `sh -lc` on the ssh terminal path and
 * under the remote user's LOGIN SHELL on the keeper path (zsh on this box —
 * the B-3185 lesson, where an unquoted pattern was a zsh glob group). No glob
 * is expanded here: the candidate directories come from `find -name`, single-
 * quoted, and the awk program is one single-quoted word with no quote of its
 * own. Every line ends in `; ` like the preludes beside it, and the last
 * statement is an `if` so the fragment leaves `$?` at 0 whether or not the dir
 * existed.
 */
const REMOTE_SCRATCH_DIR_SH = '$HOME/.vibespace/browser-profiles';
const REMOTE_SCRATCH_STALE_DAYS = 7;
/** One line of POSIX awk: does the TOP-LEVEL `profile` key of this JSON file
 *  name a non-empty string? Prints `yes` / `no` / `absent`. Character-by-
 *  character on purpose (no regex over the whole file): a string can hold
 *  braces and escaped quotes, and only depth 1 is the CLI's. No single quote
 *  anywhere in it — the fragment wraps it in single quotes. */
const TOP_LEVEL_PROFILE_AWK = String.raw`{ s = s $0 "\n" }; END { n = length(s); d = 0; q = 0; e = 0; w = "key"; k = ""; t = ""; i = 1; while (i <= n) { c = substr(s, i, 1); if (q) { if (e) { t = t c; e = 0 } else if (c == "\\") { e = 1 } else if (c == "\"") { q = 0; if (d == 1 && w == "key") { k = t; w = "colon" } else if (d == 1 && w == "value") { if (k == "profile") { if (length(t) > 0) print "yes"; else print "no"; exit }; w = "sep" } } else t = t c } else if (c == "\"") { q = 1; t = "" } else if (c == "{" || c == "[") { if (d == 1 && w == "value") { if (k == "profile") { print "no"; exit }; w = "sep" }; d++ } else if (c == "}" || c == "]") { d-- } else if (d == 1) { if (c == ":" && w == "colon") w = "value"; else if (c == ",") w = "key"; else if (w == "value" && c != " " && c != "\t" && c != "\n" && c != "\r") { if (k == "profile") { print "no"; exit }; w = "sep" } }; i++ }; print "absent" }`;
function remoteBrowserPrelude({ browserKey, staleDays = REMOTE_SCRATCH_STALE_DAYS, socketDirBase = SOCKET_DIR_BASE } = {}) {
  if (!isBrowserKey(browserKey)) return '';
  const name = sessionNameFor(browserKey);   // bk-<8 hex> ⇒ no character a shell could read as syntax
  const days = Math.max(1, Math.floor(Number(staleDays) || REMOTE_SCRATCH_STALE_DAYS));
  const base = socketDirBaseOf(socketDirBase);
  const tail = socketTailBytes(browserKey);
  return `vs_ab_d="${REMOTE_SCRATCH_DIR_SH}"; `
    // which file names a profile: project first, its verdict final; else the user file
    + `vs_ab_p() { [ -r "$1" ] && awk '${TOP_LEVEL_PROFILE_AWK}' "$1" 2>/dev/null; }; `
    + `vs_ab_v=$(vs_ab_p ./${PROJECT_CONFIG_NAME}); case "$vs_ab_v" in yes|no) ;; *) vs_ab_v=$(vs_ab_p "$HOME/${USER_CONFIG_REL}");; esac; `
    + `if [ "$vs_ab_v" = yes ]; then export AGENT_BROWSER_PROFILE="$vs_ab_d/${name}"; fi; `
    // the socket root: the CLI's precedence, bytes like the kernel, an owned 0700 dir or nothing
    + `if [ -z "\${AGENT_BROWSER_SOCKET_DIR:-}" ]; then if [ -n "\${XDG_RUNTIME_DIR:-}" ]; then vs_ab_r="$XDG_RUNTIME_DIR/agent-browser"; else vs_ab_r="$HOME/.agent-browser"; fi; `
    + `vs_ab_n=$(printf %s "$vs_ab_r" | wc -c); if [ $(( $vs_ab_n + ${tail} )) -gt ${SOCKET_PATH_MAX} ]; then vs_ab_s="${base}/vs-ab-$(id -u)"; `
    + `mkdir -p -m 700 "$vs_ab_s" 2>/dev/null; if [ -d "$vs_ab_s" ] && [ ! -L "$vs_ab_s" ] && [ -O "$vs_ab_s" ]; then chmod 700 "$vs_ab_s" 2>/dev/null; export AGENT_BROWSER_SOCKET_DIR="$vs_ab_s"; fi; fi; fi; `
    + `if [ -d "$vs_ab_d" ]; then find "$vs_ab_d" -mindepth 1 -maxdepth 1 -type d -name 'vs-bk-*' -mtime +${days} -exec sh -c '[ -L "$1/SingletonLock" ] || [ -e "$1/SingletonLock" ] || rm -rf "$1"' _ {} \\; 2>/dev/null; fi; `;
}

// ── §3.2.5 the pin, and the indirection that makes it live ─────────────────
/**
 * A pinned session points at a PERSISTENT user-data-dir instead of an
 * ephemeral one. The spawn environment of a running shell is immutable, so a
 * mid-task pin can never change a variable — it changes what the variable
 * POINTS AT. This function is the whole of that: given the pin, what should the
 * indirection file/symlink resolve to on the NEXT launch.
 *
 * WHEN IT TAKES EFFECT IS MEASURED, NOT INHERITED (r4). Rounds 1–3 stated the
 * account pool's sentence — "re-pointing does NOT reach a browser that is
 * already running; it takes effect on the NEXT browser launch" — and on 0.32.0
 * that is FALSE in the direction that costs the agent its page: the pin leaves
 * the running chromium untouched (same pid, same ephemeral dir) until the
 * NEXT COMMAND, and that command makes the CLI RELAUNCH chromium onto the
 * pinned directory, discarding the live page — measured 2026-09-14 through the
 * shipped resolver: `open <probe>` ⇒ chromium 1611523 on the ephemeral dir;
 * `repointPin` ⇒ unchanged; `get url` ⇒ `about:blank`, chromium 1611712 on the
 * pinned dir, `get title` empty; the no-pin control keeps the page and the pid.
 * So the honest sentence is `PIN_APPLIES_FROM`: "on the next command, which
 * relaunches the browser — pages open in the running one are lost". Whether a
 * session has a live browser right now is a FACT you can look up, and P1's
 * pin route owes it: `close` the session's browser first or refuse while one
 * is live, rather than let the next command silently throw the page away.
 *
 * `variant` is echoed back because the two variants indirect through different
 * objects — D through the generated config's `profile` key, C through a
 * symlink — and the caller must not have to re-derive which.
 */
const PIN_APPLIES_FROM = 'next command (the CLI relaunches the browser on the new directory; pages open in the running browser are lost)';
function pinResolution({ variant, pinnedDir, ephemeralDir }) {
  const dir = pinnedDir ? String(pinnedDir) : null;
  return {
    variant,
    // variant D: rewrite the per-session config. `null` means "emit a config
    // with NO profile key", which is what makes D ephemeral in the first place.
    configProfile: variant === VARIANTS.D ? dir : null,
    // variant C: re-point the symlink at either the pin or the scratch dir.
    linkTarget: variant === VARIANTS.C ? (dir || (ephemeralDir ? String(ephemeralDir) : null)) : null,
    pinned: !!dir,
  };
}

/**
 * The generated config's CONTENT. It REPLACES the user's config files rather
 * than merging with them (measured: with `AGENT_BROWSER_CONFIG` set to a file
 * holding only `args`, the resolved user-data-dir became an ephemeral
 * `/tmp/agent-browser-chrome-<uuid>` instead of the config file's
 * `default-profile`), so anything of the user's that must survive has to be
 * carried across explicitly. `args` is the load-bearing one on this desktop:
 * drop `--no-sandbox` / `--ozone-platform=wayland` and the browser does not
 * start at all.
 *
 * `profile` is present ONLY when pinned. Its ABSENCE is the ephemerality.
 *
 * IT IS A DENY, NOT AN ALLOW, AND THE DENY IS DERIVED (r2). Round 1 carried
 * across an enumerated list of seven keys, which SILENTLY DELETED the user's
 * own browsing fence and the whole confirmation/action-policy family from every
 * local session — measured end to end on 0.32.0: with the user's own config a
 * navigation is refused (`Domain '…' is not in the allowed domains list`) and
 * with the generated one it succeeds. The design names that exact anti-pattern
 * (§6.3: the registry must REFUSE a fence "而不是接受一个之后会被悄悄丢掉的
 * 标志") and §3.2.2 sells variant D on "能否带 --allowed-domains: 是", which is
 * a promise the ALLOW list cancelled. A hand-written preserve list is also the
 * tool this repo has already been beaten by six times on one store
 * (usage-cache's carry-forward), so the rule is inverted: carry EVERYTHING and
 * drop, by name, only the keys we exist to drop.
 *
 * THE DENY SET IS THE CLI'S OWN CLASSIFICATION, not ours. `--allowed-domains`
 * is refused beside exactly the flags that mean "this is not a fresh, isolated,
 * controllable context", which is the same property P0 sells; so the deny set
 * is "the keys that make the binary refuse to install a fence". MEASURED,
 * 2026-09-13, agent-browser 0.32.0, one arm per key (config = args + headed +
 * allowedDomains + the candidate; the refusal is an argument check, so nothing
 * launches and `autoConnect` never reaches a real browser):
 *
 *   profile      ✗ not supported with --profile … Chrome may restore existing pages
 *   restore      ✗ not supported with --restore … saved state can replay origins
 *   sessionName  ✗ not supported with --restore   ← the legacy restore key TURNS RESTORE ON
 *   state        ✗ not supported with --state/storageState … replays saved origins
 *   autoConnect  ✗ not supported with --auto-connect … containment cannot be installed
 *   cdp          ✗ not supported with --cdp … containment cannot be installed
 *   extensions / userAgent / downloadPath / engine / initScripts / actionPolicy  ✓ (fence installs)
 *   confirmActions                                                              ✓ (it WORKS: "Confirmation required:")
 *
 * `sessionName` is why this is measured rather than reasoned: "a key, not a
 * switch" was the obvious reading and the binary says otherwise. `session` and
 * `namespace` are deliberately NOT denied — the CLI's documented precedence is
 * config < env < flags and we always set both variables, so a config-file copy
 * cannot win; a smaller deny set is a better deny set.
 *
 * A USER CONFIG THAT THE CLI ALREADY REFUSES STAYS REFUSED. Carrying a
 * badly-typed value through reproduces the user's own situation rather than
 * silently repairing it — and it is not a new failure class: the seven keys the
 * ALLOW list carried had exactly the same property.
 */
const EPHEMERAL_DENY = Object.freeze({
  profile: 'a persistent user-data-dir — its absence IS the ephemerality (D3)',
  restore: 'auto-saves and replays this session\'s cookies + localStorage across launches',
  sessionName: 'the legacy restore key, and it turns restore ON (measured: the CLI answers with the --restore refusal)',
  state: 'loads a saved auth state file, so the session starts from somebody else\'s logged-in origins',
  autoConnect: 'attaches to a Chrome that is ALREADY RUNNING — the interference P0 exists to stop',
  cdp: 'drives an existing browser instead of launching an isolated one',
});

/** The denied keys this user config actually carries — the ORCH half journals
 *  them, so the drop is a STATED decision rather than one made by omission.
 *  `generatedConfig` uses this same function, so the two cannot drift. */
function deniedKeys(userConfig = {}) {
  const src = (userConfig && typeof userConfig === 'object') ? userConfig : {};
  return Object.keys(EPHEMERAL_DENY).filter((k) => Object.prototype.hasOwnProperty.call(src, k));
}

/**
 * A FENCE AND A PIN ARE MUTUALLY EXCLUSIVE AT THE BROWSER LAYER, and §1.5 says
 * so in the design's own words: "任何同时承诺这两样的设计都在撒谎". Once the
 * generated config CARRIES the user's `allowedDomains`, adding `profile` back
 * for a pin produces a browser that refuses EVERY command — measured on 0.32.0,
 * `open` and `get title` alike. §6.3's ruling is to REFUSE with a message
 * rather than accept a flag that will be silently dropped, so this is the
 * refusal, stated here (PURE) and enforced by `repointPin`.
 *
 * An EMPTY `allowedDomains` is measured NOT to be a fence (`[]` + a profile
 * opens the page), so it may not block a pin.
 */
function configFence(userConfig = {}) {
  const v = userConfig && typeof userConfig === 'object' ? userConfig.allowedDomains : null;
  if (Array.isArray(v)) return v.length ? v : null;
  return v ? [String(v)] : null;
}

/** `null` = the pin may be applied; otherwise the reason it may not, in words a
 *  route can hand straight to the user. */
function pinFenceConflict({ userConfig = {}, pinnedDir = null }) {
  if (!pinnedDir) return null;
  const fence = configFence(userConfig);
  if (!fence) return null;
  return {
    key: 'allowedDomains',
    fence,
    why: `this machine's browser config (~/.agent-browser/config.json) restricts browsing to ${fence.join(', ')}, and the CLI refuses `
      + `--allowed-domains together with a profile (Chrome may restore existing pages before network containment is `
      + `installed). A per-task domain allowlist and a persistent logged-in profile are mutually exclusive at the `
      + `browser layer — pinning here would make every command fail. Fence the persistent profile at its proxy `
      + `instead, or remove allowedDomains from ~/.agent-browser/config.json.`,
  };
}

/**
 * THE GENERATED CONFIG (rung D). takeover r3 (finding 2): it is composed by the
 * ONE rule every sanctioned command's config follows (`sanctionedConfig`, in
 * the CLI's own verb table so a remote CLI composes by the same words): the
 * user file carried minus EPHEMERAL_DENY and the raw CDP keys, its `args`
 * minus the raw-debugging / user-data-dir switches, and the PROJECT file
 * (`projectConfig`, the session directory's `./agent-browser.json`) only for
 * the keys that NARROW — r3 of the v2 design layered it whole, so a repo
 * carrying `{"args":"--remote-debugging-port=…"}` opened a raw port on the
 * watched browser (measured). `userConfig` alone (no `projectConfig`) is the
 * pre-r3 call shape and composes the same way.
 */
function generatedConfigParts({ userConfig = {}, projectConfig = null, pinnedDir = null, headed = null }) {
  const r = VERBS.sanctionedConfig({ user: userConfig, project: projectConfig, deny: Object.keys(EPHEMERAL_DENY) });
  const out = r.config;
  // OUR value is ours to coerce; the user's rides across verbatim.
  if (headed !== null) out.headed = !!headed;
  if (pinnedDir) out.profile = String(pinnedDir);
  return { config: out, dropped: r.dropped };
}
function generatedConfig(args) { return generatedConfigParts(args).config; }

// ── §3.2.5 the pin ORIGIN ladder ───────────────────────────────────────────
/**
 * WHICH FACT chose this session's profile. P0 ships the mechanism and the two
 * rungs it can actually answer — an explicit pin, and nothing — because the
 * registry that would answer `conversation` / `task-group` is P1. The ladder is
 * written here whole so P1 adds rows to a table instead of inventing a second
 * vocabulary, and so the origin strings are pinned by a test from day one.
 *
 * `task-group` is a FIFTH value in a vocabulary `src/resume-continuity.js`
 * froze at four, and its client mirror (`spawnValueOrigin` in agent-meta.js)
 * whitelists those four and silently mislabels anything else. The design's
 * option (a) — add it to both — is P1's job, in P1's commit. P0 therefore never
 * EMITS 'task-group'; `PIN_ORIGINS` lists it so the suite can assert that what
 * P0 emits is a SUBSET of what both vocabularies already accept.
 */
const PIN_ORIGINS = Object.freeze(['chosen', 'conversation', 'task-group', 'instance', 'harness']);
/** What P0 is allowed to emit today — see above. The suite pins this against
 *  `SPAWN_ORIGINS` and against the client mirror. */
const P0_PIN_ORIGINS = Object.freeze(['chosen', 'conversation', 'instance', 'harness']);

/**
 * P1: the FIVE-rung ladder (§3.2.5's table, verbatim): an explicit choice for
 * THIS session > the profile this CONVERSATION last ran on > the Task Group's
 * default > the instance default > nothing (ephemeral). `task-group` is the
 * fifth value the four-value vocabulary gained in this same commit (the design's
 * option (a): `SPAWN_ORIGINS` + the client's `spawnValueOrigin` whitelist), and
 * it is resolved BEFORE `resumeSpawnPick`-shaped callers ever see it — the
 * generic knob ladder's signature is untouched. `taskGroup` may be omitted: the
 * P0 four-input call shape still answers the same four origins.
 */
function pinPick({ explicit, conversation, taskGroup, instanceDefault }) {
  const s = (v) => (v === undefined || v === null ? '' : String(v).trim());
  if (s(explicit)) return { value: s(explicit), origin: 'chosen' };
  if (s(conversation)) return { value: s(conversation), origin: 'conversation' };
  if (s(taskGroup)) return { value: s(taskGroup), origin: 'task-group' };
  if (s(instanceDefault)) return { value: s(instanceDefault), origin: 'instance' };
  return { value: '', origin: 'harness' };
}
/**
 * WHICH prior applies to THIS create (§3.2.5 + D15): a FORK copies its
 * parent's pin (a pin is a preference; the browser KEY is an identity and a
 * fork mints a new one — `browserKeyFor` says so), a RESUME restores the
 * conversation's own pin, a NEW session has no conversation rung at all.
 */
function pinForCreate({ explicit, prior, forkParent, taskGroup, instanceDefault, resume = false, fork = false } = {}) {
  const conversation = fork ? forkParent : (resume ? prior : '');
  return pinPick({ explicit, conversation, taskGroup, instanceDefault });
}
/** What a mid-session pin can honestly promise (§3.2.5's "which sentence
 *  depends on whether a lease exists right now, a fact that can be looked up"). */
function pinApplyNotice({ liveBrowser = false } = {}) {
  return liveBrowser
    ? `applies on your next \`vibespace-browser\` command, which RELAUNCHES the running browser on the new profile — pages open in it are lost (close it first to keep them)`
    : `applies from your next \`vibespace-browser\` command (the browser launches on it)`;
}

// ═══ P1 — THE REGISTRY, THE LEASE AND THE KEEPER'S VERDICTS (§3.3–§3.5) ════
// Every decision the ORCH keeper (src/server/browser-keeper.js) acts on is
// stated here so the fast gate (test-browser-pin) can drive it without a
// process, and so the routes and the CLI speak ONE vocabulary of codes.

// ── §3.3 the profile record ────────────────────────────────────────────────
const PROFILE_ID_RE = /^bp-[0-9a-f]{8}$/;
function mintProfileId(hex8) {
  const h = String(hex8 || '').toLowerCase().replace(/[^0-9a-f]/g, '').slice(0, 8).padStart(8, '0');
  return 'bp-' + h;
}
function isProfileId(v) { return PROFILE_ID_RE.test(String(v || '')); }
/** The user-data-dir NAME for a minted profile: `~/.agent-browser/vs-bp-<id>`.
 *  Adopted directories keep their own path; the LABEL never reaches a path. */
function profileDirName(id) { return 'vs-' + String(id); }
// ═══ P4 — PROVIDERS ARE ROWS, NOT AN `if` CHAIN (§7.1's two tables, §7.2.1,
// §7.3, §7.6). `provider` IS the backend and the TIER is derived from it
// (§3.3) — never stored twice. Every capability a provider lacks is a CELL a
// control reads, so the control is disabled WITH ITS REASON rather than
// failing at use time (the backend-caps discipline). Cells:
//   tier         1 CDP undisguised · 2 fingerprint (still CDP) · 3 no CDP at all
//   wired        this build can START/REACH one — false ⇒ `provider_unavailable`
//                naming why (for `cloak` the why is the §7.2.1 record below)
//   keyScope     'none' | 'local-only' (D34: a key-bearing provider is REFUSED
//                on `host != null` — `provider_needs_local_key`)
//   canSwitchTo  §7.4: 'in-place' | 'export-only' | 'no'
//   ownsDir      the record's `dir` is OURS (P5 sweeps exactly these rows —
//                there is deliberately no second `swept` cell, §7.1)
//   leaseKind    'tab' | 'window-target' (§4.9)
//   remote       HOW a paired machine runs it: 'browser-serve' (the device op
//                starts it there) | 'tcp-forward' (somebody else's browser, a
//                loopback port tunnelled) | null (this machine only)
//   starts       we start a process for it ('cdp' starts nothing — §7.1)
//   headed       may draw a window (null = the CLI's own config decides)
//   binary       the executable the machine must have (for the version probe)
//   cdp          it hands out a CDP url (tier 3 does not — §7.6: "has no CDP" is
//                the row's VALUE, and `use --print` / `cdp-url` refuse by name)
//   allowedDomains  it can carry a domain fence (a CDP-side rule; a window on
//                the user's desktop has no such control — the site is what they opened)
//   pinTab       `--pin-tab` pins a CDP target; a window target is leased by handle
//   consent      P10 (D27 (b)): the SETTING that must read true before the row
//                may be used on this machine (`provider_needs_consent` otherwise —
//                a user act with its own confirmation; agents cannot write settings)
const PROVIDERS = Object.freeze({
  chromium: Object.freeze({ tier: 1, wired: true, label: 'Chromium (a browser VibeSpace starts)', keyScope: 'none', canSwitchTo: 'in-place', ownsDir: true, leaseKind: 'tab', remote: 'browser-serve', starts: true, headed: null, binary: 'agent-browser', cdp: true, allowedDomains: true, pinTab: true, consent: null }),
  cloak: Object.freeze({ tier: 2, wired: false, label: 'CloakBrowser (the same profile directory opened by the cloakbrowser binary, seeded)', keyScope: 'local-only', canSwitchTo: 'in-place', ownsDir: true, leaseKind: 'tab', remote: null, starts: true, headed: false, binary: 'cloakbrowser', cdp: true, allowedDomains: true, pinTab: true, consent: null }),
  cdp: Object.freeze({ tier: 1, wired: true, label: 'An existing browser over CDP (yours, or one on a paired machine)', keyScope: 'none', canSwitchTo: 'no', ownsDir: false, leaseKind: 'tab', remote: 'tcp-forward', starts: false, headed: null, binary: null, cdp: true, allowedDomains: true, pinTab: true, consent: null }),
  // P10 (§7.6 tier 3, D27 (b), D31): WIRED — a window already open on the user's
  // own desktop, addressed through vibespace-window (the AT-SPI tree + its own
  // pixmap), NO CDP, NO process of ours, NO directory of ours; usable only while
  // the consent setting reads true (src/window-desktop.js is the model)
  'local-window': Object.freeze({ tier: 3, wired: true, label: 'A window on your own desktop (tier 3: the accessibility tree + pixels, no CDP)', keyScope: 'none', canSwitchTo: 'no', ownsDir: false, leaseKind: 'window-target', remote: null, starts: false, headed: true, binary: null, cdp: false, allowedDomains: false, pinTab: false, consent: 'window.realDesktopTargets' }),
});
/** `cloud:<name>` is a FAMILY of rows (§7.1): each vendor's own browser,
 *  reached with a key from the integration store (§7.5). The key half
 *  LANDED (P4 second half): the local `agent-browser` daemon is started with
 *  upstream's own `-p <name>` and the vendor's key in THAT child's env only
 *  (src/browser-switch.js), so `starts` is true (a daemon of ours; the
 *  browser is the vendor's — `ownsDir` false) and the four rows whose env
 *  names the installed binary states are `wired`. `agentcore`'s field set is
 *  UNVERIFIED against upstream (§7.5's table says so), so its row stays
 *  unwired BY NAME — a refusal, never a spawn that fails at the vendor. */
const CLOUD_PROVIDERS = Object.freeze(['browserbase', 'browserless', 'kernel', 'browseruse', 'agentcore']);
const CLOUD_ROW = Object.freeze({ tier: 2, wired: true, keyScope: 'local-only', canSwitchTo: 'export-only', ownsDir: false, leaseKind: 'tab', remote: null, starts: true, headed: false, binary: 'agent-browser', cdp: true, allowedDomains: true, pinTab: true, consent: null });
const CLOUD_UNWIRED = Object.freeze({ agentcore: 'its field set (AWS access key / secret / region) is unverified against upstream\'s provider table (§7.5) — the row stays unwired until it is measured' });
/** The row for a provider id, `cloud:<name>` included; null when unknown. */
function providerRow(id) {
  const s = String(id == null || id === '' ? 'chromium' : id);
  if (PROVIDERS[s]) return PROVIDERS[s];
  const m = /^cloud:([a-z0-9-]+)$/.exec(s);
  if (m && CLOUD_PROVIDERS.includes(m[1])) return Object.freeze({ ...CLOUD_ROW, wired: !CLOUD_UNWIRED[m[1]], unwiredWhy: CLOUD_UNWIRED[m[1]] || null, label: `${m[1]} (cloud, key required)`, cloud: m[1] });
  return null;
}
function providerIds() { return [...Object.keys(PROVIDERS), ...CLOUD_PROVIDERS.map((n) => 'cloud:' + n)]; }

/**
 * §7.2.1 — THE EGRESS PRECONDITION, AS A RECORDED RESULT. Modelled verbatim
 * on src/local-oracles.js: a record carries `tool`, `date`, `version` and
 * per-run INET connect counts, or it is not a record. CloakBrowser is a
 * network tool by definition, so it can never be an ORACLE — this record
 * contributes the proof's SHAPE, not a zero-network verdict; it lives beside
 * the provider row so the UI can show what was measured and when.
 *
 * `status: 'refused'` + `blocks: 'cloak.wired'` is the local-oracles `blocks`
 * discipline: the measurement could not be taken, and THAT is why the caps
 * cell is false. test-browser-providers asserts the named cell really IS
 * false — a row somebody re-enables without re-measuring fails the suite —
 * and that a `measured` record carries the four runs §7.2.1 names.
 *
 * Taken with scripts/measure-cloak-egress.mjs (the same strace method as
 * local-oracles: `env -i HOME=<empty dir> PATH=… strace -f -qq -e
 * trace=network`, every connect(AF_INET|AF_INET6) counted, a DNS :53 connect
 * counted as INET). Re-run it after installing the pinned package and paste
 * its output here; the version it names is the version the counts describe
 * (an unpinned auto-download silently invalidates the record).
 */
const CLOAK_EGRESS_RUNS = Object.freeze(['first launch (download expected)', 'second launch from cache', 'launch with a license key present', '10-minute idle browser']);
const CLOAK_EGRESS_PROOF = Object.freeze({
  provider: 'cloak',
  tool: 'strace -f -qq -e trace=network',
  date: '2026-09-16',
  version: null,
  status: 'refused',
  refusal: 'binary_absent',
  detail: 'neither `cloakbrowser` nor `cloakserve` is installed on the measuring machine and the package is not in node_modules (npm `cloakbrowser` 0.5.10 downloads a ~200 MB proprietary binary on first launch — installing it is a USER action that comes AFTER this measurement, never a side effect of it). Nothing was downloaded; no vendor host was contacted.',
  blocks: 'cloak.wired',
  runs: Object.freeze([]),
  expectedRuns: CLOAK_EGRESS_RUNS,
});
/** The local-oracles discipline over a proof record + the rows it claims to
 *  explain: `{ok:true}` or `{ok:false, error}`. A record with no counts is
 *  not a record; a `blocks` claim must name a cell that IS false; a measured
 *  record must carry every run §7.2.1 names, each with an INET count. */
function proofVerdict(proof, rows = PROVIDERS) {
  if (!proof || typeof proof !== 'object') return { ok: false, error: 'no proof record' };
  for (const k of ['tool', 'date', 'version', 'runs']) if (!(k in proof)) return { ok: false, error: `proof record lacks ${k}` };
  if (!Array.isArray(proof.runs)) return { ok: false, error: 'proof.runs is not a list' };
  if (proof.status === 'measured') {
    if (proof.blocks) return { ok: false, error: 'a measured record may not carry a blocks claim (the cell it would explain is not explained by a measurement that succeeded)' };
    if (!proof.version) return { ok: false, error: 'a measured record names the version it describes' };
    const want = proof.expectedRuns || CLOAK_EGRESS_RUNS;
    for (const w of want) {
      const r = proof.runs.find((x) => x && x.what === w);
      if (!r) return { ok: false, error: `measured record lacks the run "${w}"` };
      if (!Number.isInteger(r.inetConnects) || r.inetConnects < 0) return { ok: false, error: `run "${w}" has no INET connect count` };
    }
    return { ok: true };
  }
  if (proof.status !== 'refused') return { ok: false, error: `unknown proof status ${JSON.stringify(proof.status)}` };
  if (!proof.refusal) return { ok: false, error: 'a refused record names its refusal' };
  if (proof.runs.length) return { ok: false, error: 'a refused record carries no runs (a run with counts is a measurement)' };
  const m = /^([a-z:-]+)\.([a-zA-Z]+)$/.exec(String(proof.blocks || ''));
  if (!m) return { ok: false, error: 'a refused record must say which capability cell it blocks (`<provider>.<cell>`)' };
  const row = rows[m[1]];
  if (!row) return { ok: false, error: `blocks names an unknown provider ${m[1]}` };
  if (row[m[2]] !== false) return { ok: false, error: `blocks claims ${proof.blocks} is false, but the cell reads ${JSON.stringify(row[m[2]])} — re-enabled without re-measuring` };
  return { ok: true };
}
/** The proof record that explains a false cell, or null (`blockedCell('cloak','wired')`). */
function blockedCell(provider, cell) {
  return CLOAK_EGRESS_PROOF.blocks === `${provider}.${cell}` ? CLOAK_EGRESS_PROOF : null;
}

/**
 * THE ONE ANSWER to "may this provider be used here" — the typed refusal a
 * disabled control shows, before anything is spawned or resolved:
 *   provider_unknown           not a row
 *   provider_unavailable       the row is not wired (the reason names why —
 *                              for cloak, §7.2.1's refusal by name)
 *   provider_needs_local_key   keyScope local-only on host != null (D34)
 *   provider_local_only        the row has no remote transport
 *   provider_needs_consent     the row names a consent SETTING and it does not
 *                              read true here (P10: tier 3 is the user's own
 *                              desktop — `desktopConsent` is that setting's
 *                              value as the server reads it; undefined = OFF)
 * `{ok:true, row}` otherwise.
 */
function providerControl(provider, { host = null, desktopConsent = undefined } = {}) {
  const id = provider == null || provider === '' ? 'chromium' : String(provider);
  const row = providerRow(id);
  if (!row) return { ok: false, code: 'provider_unknown', error: `unknown provider "${id}" — one of ${providerIds().join(', ')}` };
  // The STRUCTURAL refusals first (they never change with a measurement):
  // a key-bearing row on another machine (D34), a row with no remote transport.
  if (host) {
    if (row.keyScope === 'local-only') return { ok: false, code: 'provider_needs_local_key', error: `provider "${id}" needs a key that lives in this instance's registry and has no channel to another machine (D34) — a profile on ${host} may use chromium or cdp` };
    if (!row.remote) return { ok: false, code: 'provider_local_only', error: `provider "${id}" runs only on this machine (no remote transport)` };
  }
  if (!row.wired) {
    const why = blockedCell(id, 'wired');
    const reason = why ? `its §7.2.1 egress measurement is recorded as ${why.refusal} (${why.date}): ${why.detail}` : (row.unwiredWhy || 'not wired in this release');
    return { ok: false, code: 'provider_unavailable', error: `provider "${id}" (${row.label}) cannot be used on this build — ${reason}` };
  }
  if (row.consent && desktopConsent !== true) return { ok: false, code: 'provider_needs_consent', error: `provider "${id}" addresses windows on the user's REAL desktop and is off until the user turns on "${row.consent}" (Settings → Agent browser, a switch with its own confirmation) — nothing on the desktop is listed or addressable before that`, consent: row.consent };
  return { ok: true, row };
}
/** The refusal for ONE control a provider lacks (a disabled button's title):
 *  `capabilityRefusal('cdp', 'start')` → {code:'provider_lacks_capability',
 *  capability, error}; null when the row has it. */
function capabilityRefusal(provider, capability) {
  const id = provider == null || provider === '' ? 'chromium' : String(provider);
  const row = providerRow(id);
  if (!row) return { code: 'provider_unknown', capability, error: `unknown provider "${id}"` };
  const lacks = (why) => ({ code: 'provider_lacks_capability', capability, error: `provider "${id}" cannot ${capability}: ${why}` });
  switch (capability) {
    case 'start': return row.starts ? null : lacks(row.leaseKind === 'window-target' ? 'a window target is a window already open on the user\'s desktop — nothing is started' : 'the browser is somebody else\'s — nothing is started, only reached');
    case 'stop': return row.starts ? null : lacks('nothing was started, so nothing is stopped — only the tunnel is closed');
    case 'headed': return row.headed === false ? lacks('it has no window of ours to show') : null;
    case 'switch': return row.canSwitchTo === 'no' ? lacks(id === 'cdp' ? 'it is somebody else\'s browser, so "switch to cdp" is really a second profile (§7.4)' : 'its state is the user\'s own browser profile, not a directory we own (§7.6 rule 3) — escalating to tier 3 does not re-point this profile; the user turns on the real-desktop switch and the agent opens a WINDOW TARGET (vibespace-window list / attach)') : null;
    case 'sweep': return row.ownsDir ? null : lacks('it owns no directory of ours (§7.1: swept ⇔ ownsDir)');
    case 'remote': return row.remote ? null : lacks('it has no remote transport');
    // P10 — the three things the tier-3 row cannot do, each refused by name (§7.6, §9's test-browser-tier3 row)
    case 'cdp': return row.cdp === false ? lacks('it has no CDP — a window on the user\'s desktop is addressed through vibespace-window (the accessibility tree and its own pixmap); there is no url to hand out, so `use --print` / `cdp-url` have nothing to print') : null;
    case 'allowed-domains': return row.allowedDomains === false ? lacks('a domain fence (--allowed-domains) is a CDP-side rule on a browser we launch; a window on the user\'s desktop has no such control — the site is whatever the user opened') : null;
    case 'pin-tab': return row.pinTab === false ? lacks('--pin-tab pins a CDP target id; a window target is leased by its handle (vibespace-window attach) and has no target id') : null;
    case 'live-view': return row.leaseKind === 'window-target' ? lacks('VibeSpace draws no live pane for the user\'s own desktop in this version — the user is looking at it; a native Wayland window would need the ScreenCast portal\'s consent click + a PipeWire consumer (not wired)') : null;
    default: return { code: 'bad-request', capability, error: `unknown capability ${JSON.stringify(capability)}` };
  }
}
/** Every row with its cells + the local verdict + (with a host) the verdict
 *  for that machine — what `GET /api/browser/providers` and the digest carry. */
function providerRows({ host = null, desktopConsent = undefined } = {}) {
  return providerIds().map((id) => {
    const row = providerRow(id);
    const local = providerControl(id, { desktopConsent });
    const onHost = host ? providerControl(id, { host, desktopConsent }) : null;
    return { id, ...row, control: local.ok ? { ok: true } : { ok: false, code: local.code, error: local.error }, ...(onHost ? { onHost: onHost.ok ? { ok: true, host } : { ok: false, host, code: onHost.code, error: onHost.error } } : {}), proof: blockedCell(id, 'wired') };
  });
}

// ── §7.2.1 the cloakserve egress ALLOWLIST (opt-in on the free tier) ────
/** Does the allowlist admit this host? Entries are exact hostnames or
 *  `.suffix` (a leading dot admits every sub-domain — and the bare domain).
 *  Loopback and link-local are NEVER admitted by a rule (the container must
 *  not reach the hub's own services through the proxy); an empty list admits
 *  nothing (deny by default is the whole point of an allowlist). */
function parseEgressAllowlist(v) {
  const raw = Array.isArray(v) ? v : String(v == null ? '' : v).split(/[\s,]+/);
  const out = [];
  for (const e0 of raw) {
    const e = String(e0 || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/:].*$/, '');
    if (!e || !/^\.?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(e)) continue;
    if (!out.includes(e)) out.push(e);
  }
  return out;
}
function egressVerdict(host, allowlist) {
  const h = String(host || '').trim().toLowerCase().replace(/\.$/, '');
  const list = Array.isArray(allowlist) ? allowlist : parseEgressAllowlist(allowlist);
  if (!h) return { allow: false, why: 'no host' };
  if (h === 'localhost' || /^127\./.test(h) || h === '::1' || /^\[?::1\]?$/.test(h) || /^169\.254\./.test(h) || h.endsWith('.localhost') || h === 'host.docker.internal') return { allow: false, why: `${h} is loopback/link-local — never admitted by a rule` };
  if (!list.length) return { allow: false, why: 'the egress allowlist is empty — deny by default' };
  for (const e of list) {
    if (e.startsWith('.')) { if (h === e.slice(1) || h.endsWith(e)) return { allow: true, rule: e }; }
    else if (h === e) return { allow: true, rule: e };
  }
  return { allow: false, why: `${h} is not in the egress allowlist (${list.join(', ')})` };
}
/** The pinned cloakserve image: the version the §7.2.1 record describes.
 *  An unpinned `:latest` silently invalidates the measurement. */
const CLOAKSERVE_IMAGE = 'cloakhq/cloakserve:0.5.10';
/**
 * THE PLAN for running cloakserve on this machine — PURE: it composes the
 * docker argv and the egress boundary, it runs nothing. Refused (typed) when
 * the opt-in is off, the §7.2.1 measurement is not recorded, or the allowlist
 * is empty; otherwise the container joins an INTERNAL docker network (no
 * route out of the host), publishes 9222 on the hub's loopback only (§6.1),
 * and reaches the world ONLY through the hub's allowlisting CONNECT proxy
 * (src/server/egress-proxy.js) — a deployment property that survives the
 * vendor shipping a new binary, which a measurement alone does not.
 */
function cloakservePlan({ enabled = false, proof = CLOAK_EGRESS_PROOF, allowlist = '', proxyPort = 0, port = 9222, image = CLOAKSERVE_IMAGE, network = 'vs-cloak-egress', name = 'vs-cloakserve' } = {}) {
  if (!enabled) return { ok: false, code: 'cloak_opt_in_off', error: 'CloakBrowser is opt-in: turn on browser.cloak.enabled (Settings → Agent browser) first' };
  const pv = proofVerdict(proof);
  if (!pv.ok) return { ok: false, code: 'egress_proof_invalid', error: `the §7.2.1 egress record is malformed: ${pv.error}` };
  if (proof.status !== 'measured') return { ok: false, code: 'egress_not_measured', error: `the §7.2.1 egress precondition is recorded as ${proof.refusal} (${proof.date}) — measure first (scripts/measure-cloak-egress.mjs), then install the pinned package` };
  const hosts = parseEgressAllowlist(allowlist);
  if (!hosts.length) return { ok: false, code: 'egress_allowlist_empty', error: 'the egress allowlist is empty — name the sites this profile is for (browser.cloak.egressAllowlist)' };
  const pp = Number(proxyPort);
  if (!Number.isInteger(pp) || pp < 1 || pp > 65535) return { ok: false, code: 'egress_proxy_missing', error: 'the allowlisting egress proxy is not listening' };
  const proxy = `http://host.docker.internal:${pp}`;
  return {
    ok: true, image, network, name, port: Number(port) || 9222, cdpUrl: `http://127.0.0.1:${Number(port) || 9222}`,
    egress: { mode: 'allowlist', hosts, proxy, enforcedBy: 'internal docker network + the hub\'s allowlisting CONNECT proxy' },
    docker: [
      ['network', 'create', '--internal', network],
      ['run', '-d', '--name', name, '--restart', 'unless-stopped', '--network', network, '--add-host', 'host.docker.internal:host-gateway',
        '-p', `127.0.0.1:${Number(port) || 9222}:9222`, '-e', `HTTPS_PROXY=${proxy}`, '-e', `HTTP_PROXY=${proxy}`, '-e', 'NO_PROXY=127.0.0.1,localhost', image],
    ],
  };
}
const OWNER_KINDS = Object.freeze(['task', 'session', 'instance']);
const LABEL_MAX = 80;
function cleanLabel(v) {
  // eslint-disable-next-line no-control-regex
  return String(v == null ? '' : v).replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, LABEL_MAX);
}
/** A proxy is `scheme://[user:pass@]host[:port]` for http/https/socks4/socks5,
 *  or nothing. The SECRET half (user:pass) never leaves the server:
 *  `publicProfileView` strips it. */
function normalizeProxy(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return { ok: true, value: null };
  const m = /^(https?|socks4|socks5|socks5h):\/\/(?:([^@/\s]+)@)?([A-Za-z0-9.\-_[\]]+)(?::(\d{1,5}))?\/?$/.exec(s);
  if (!m) return { ok: false, error: 'proxy must look like http(s)://[user:pass@]host[:port] or socks5://host[:port]' };
  return { ok: true, value: s };
}
function proxyPublicView(v) {
  const s = String(v == null ? '' : v);
  if (!s) return null;
  return s.replace(/^([a-z0-9]+:\/\/)[^@/\s]+@/i, '$1***@');
}
/**
 * The ONE validator for a create request (route + CLI + migration). Refusals
 * carry a `code` a route maps to a status and the CLI prints verbatim:
 *   label_required / label_taken / provider_unknown / provider_unavailable /
 *   unsupported-host (v1 is this machine only) / sharing_refused (D6: the
 *   cooperative lease is not a boundary between owners, so `instance` sharing
 *   is a value only where §6.5's mediating proxy exists — `mediation` — and
 *   only on THIS machine; `why` names which) / fence_refused (§3.3/§6.3: a per-task domain
 *   allowlist and a persistent profile are mutually exclusive at the browser
 *   layer — refuse, never accept a flag that would be silently dropped) /
 *   bad_proxy.
 */
function validateProfileInput(input = {}, { existing = [], control = null, mediation = false } = {}) {
  const src = input && typeof input === 'object' ? input : {};
  const label = cleanLabel(src.label);
  if (!label) return { ok: false, code: 'label_required', error: 'a profile needs a label (a human name, never a path)' };
  const taken = (existing || []).find((p) => p && String(p.label || '').toLowerCase() === label.toLowerCase());
  if (taken) return { ok: false, code: 'label_taken', error: `a profile named "${label}" already exists (${taken.id})` };
  const provider = src.provider == null || src.provider === '' ? 'chromium' : String(src.provider);
  // P4 (§7.1/§7.3, D5 (b)): `host` = the PAIRED machine the browser runs on
  // (null = this one). The ROW decides whether that is possible — a
  // key-bearing provider is refused there by name (D34), a local-only one too;
  // whether the id names a machine that is actually paired is the keeper's
  // question (it holds the host registry), asked right after this.
  const host = src.host == null || src.host === '' || src.host === 'local' ? null : String(src.host);
  if (host && !/^[A-Za-z0-9._:-]{1,128}$/.test(host)) return { ok: false, code: 'unsupported-host', error: `host ${JSON.stringify(host)} is not a machine id` };
  // the capability control is INJECTABLE (the keeper hands its own, which a gate may override) — one gate ignoring the override is an inconsistent seam
  const pc = (typeof control === 'function' ? control : providerControl)(provider, { host });
  if (!pc.ok) return { ok: false, code: pc.code, error: pc.error };
  const row = pc.row;
  // P10 (§7.6 rule 3): tier 3 is NOT a profile — escalating to a window on the
  // user's own desktop creates no record and re-points none (a record would
  // have no dir, no seed, nothing the ladder or the sweep could act on, and
  // its lease is the window-target kind keyed on a HANDLE, not a browserKey)
  if (row.leaseKind === 'window-target') return { ok: false, code: 'tier3_is_a_window_target', error: `"${provider}" is not a profile: a window on your own desktop is addressed as a WINDOW TARGET (vibespace-window list / attach) once the real-desktop switch is on — no browser profile is created or re-pointed for tier 3 (§7.6 rule 3)` };
  // `cdp`: the browser is somebody else's — its loopback CDP port (on `host`,
  // or on this machine) is the whole configuration; nothing is started.
  let cdpPort = null;
  if (provider === 'cdp') {
    const n = Number(src.cdpPort);
    if (!Number.isInteger(n) || n < 1 || n > 65535) return { ok: false, code: 'cdp_port_required', error: 'a cdp profile names the loopback port the browser\'s --remote-debugging-port listens on (cdpPort 1-65535) — on the paired machine when host is set, else on this one' };
    cdpPort = n;
  } else if (src.cdpPort != null && src.cdpPort !== '') return { ok: false, code: 'bad-request', error: `cdpPort belongs to the cdp provider only (this is ${provider})` };
  // P6 (§6.2 / D6): `instance` is a value only where the mediating proxy
  // exists — the keeper says whether it does (`mediation`), the verdict says why not
  const sv = sharingVerdict({ sharing: src.sharing, host, mediation });
  if (!sv.ok) return { ok: false, code: sv.code, error: sv.error, why: sv.why };
  const sharing = sv.value;
  const fence = configFence({ allowedDomains: src.allowedDomains });
  if (fence) return { ok: false, code: 'fence_refused', error: `a persistent profile cannot carry allowedDomains (${fence.join(', ')}): the CLI refuses a domain fence beside a profile, so the flag would have to be dropped silently — fence at the proxy instead (§6.3)` };
  const proxy = normalizeProxy(src.proxy);
  if (!proxy.ok) return { ok: false, code: 'bad_proxy', error: proxy.error };
  const seed = src.fingerprintSeed == null || src.fingerprintSeed === '' ? null : Number(src.fingerprintSeed);
  // §7.4: a per-profile default backend names a ROW (validated like any other
  // provider id; whether it can be used HERE is the switch's question)
  const defaultBackend = src.defaultBackend == null || src.defaultBackend === '' ? null : String(src.defaultBackend);
  if (defaultBackend && !providerRow(defaultBackend)) return { ok: false, code: 'provider_unknown', error: `defaultBackend "${defaultBackend}" is not a provider — one of ${providerIds().join(', ')}` };
  return {
    ok: true,
    value: {
      label, provider, proxy: proxy.value, host, sharing, cdpPort, ownsDir: !!row.ownsDir,
      record: !!src.record, notes: cleanLabel(src.notes).slice(0, 400),
      fingerprintSeed: Number.isFinite(seed) ? Math.floor(seed) : null,
      defaultBackend,
    },
  };
}
/** `dir` is null for a row that owns no directory (`cdp`) and for a profile
 *  on a PAIRED machine (the device composes and owns its directory — the hub
 *  records what the device answered on the BROWSER record, never here). */
function newProfileRecord({ id, label, dir, provider = 'chromium', proxy = null, notes = '', record = false, fingerprintSeed = null, owner = null, legacy = false, now = 0, host = null, cdpPort = null, defaultBackend = null, sharing = null, ephemeral = false } = {}) {
  // takeover C3 (design-browser-takeover §5.1): a MANAGED EPHEMERAL record is
  // owned by its CONVERSATION (kind 'conversation', id = the browser key — a
  // child key included) and by nothing else: never mediated, never legacy,
  // chromium, sharing 'owner'. A record that asks for `ephemeral` without a
  // browser key is not one (the owner is what reaps it).
  if (ephemeral) {
    const key = owner && owner.id != null ? String(owner.id) : '';
    if (!isBrowserKey(key) && !isChildKey(key)) throw new Error('an ephemeral browser record needs its conversation\'s browser key as its owner');
    return {
      id: String(id), label: cleanLabel(label) || ephemeralLabel(''), dir: dir == null ? null : String(dir), provider: 'chromium',
      fingerprintSeed: null, proxy: null, host: null, cdpPort: null, allowedDomains: null,
      owner: { kind: 'conversation', id: key }, sharing: 'owner', record: false, ephemeral: true,
      lastChromiumMajor: null, lastBackend: null, legacy: false, defaultBackend: null, lastSwitchAt: 0,
      createdAt: Number(now) || 0, lastUsedAt: 0, notes: '',
    };
  }
  const o = owner && OWNER_KINDS.includes(owner.kind) ? { kind: owner.kind, id: owner.id == null ? null : String(owner.id) } : { kind: 'instance', id: null };
  return {
    id: String(id), label: cleanLabel(label), dir: dir == null ? null : String(dir), provider: String(provider),
    fingerprintSeed: fingerprintSeed == null ? null : fingerprintSeed, proxy: proxy || null, host: host == null || host === '' ? null : String(host),
    cdpPort: Number.isInteger(cdpPort) ? cdpPort : null,
    allowedDomains: null, owner: o, sharing: legacy ? 'instance' : (sharing === 'instance' ? 'instance' : 'owner'), record: !!record,
    lastChromiumMajor: null, lastBackend: null, legacy: !!legacy,
    // §7.4: "this profile is for that kind of work" — a per-profile DEFAULT
    // backend, said once; null = the instance's plain chromium
    defaultBackend: defaultBackend == null || defaultBackend === '' ? null : String(defaultBackend), lastSwitchAt: 0,
    createdAt: Number(now) || 0, lastUsedAt: 0, notes: String(notes || ''),
  };
}
/** The registry document, normalised — a missing or foreign file is an empty
 *  registry, never a crash; unknown keys are dropped on purpose (the file is a
 *  registry, not a copy). `browsers` (the BROWSER records, §3.1) and `pins`
 *  (browserKey → the conversation's pin) live beside the design's three lists. */
function normalizeRegistry(doc) {
  const d = doc && typeof doc === 'object' ? doc : {};
  const list = (v, pred) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object' && pred(x)) : []);
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? { ...v } : {});
  return {
    version: 1,
    // takeover C3: a managed ephemeral record is admitted only in its own
    // shape (owner = a conversation's browser key) — a record claiming
    // `ephemeral` with anything else is not ours to reap and is dropped
    profiles: list(d.profiles, (p) => isProfileId(p.id) && (!p.ephemeral || isEphemeralProfile(p))),
    leases: list(d.leases, (l) => isProfileId(l.profileId) && (isBrowserKey(l.browserKey) || isChildKey(l.browserKey))),
    siteHints: list(d.siteHints, (h) => typeof h.host === 'string'),
    browsers: obj(d.browsers),
    pins: obj(d.pins),
    runawayParkedUntil: obj(d.runawayParkedUntil),
    // P1 second half (§3.7/§3.8): the CHILD handles a conversation minted for
    // its sub-agents (browserKey → {parent, since, sessionId}) and what each
    // conversation was LAST TOLD about its attachment set (browserKey → the
    // toldView) — the memory layer ①'s one-time refusal fires on.
    children: obj(d.children),
    told: obj(d.told),
    // P4 second half (§7.4): the SEAT reading per key row (integrationId →
    // {tier, total, at, source}) read back from the FIRST REAL LAUNCH, the
    // Chromium major each backend was last seen writing (provider →
    // {major, at}) for the version ladder, and the agent's `blocked` CLAIMS
    // (bounded list; a claim carries who made it, never a detection)
    seats: obj(d.seats),
    majors: obj(d.majors),
    blocked: list(d.blocked, (b) => typeof b.url === 'string' && b.by === 'agent'),
  };
}
/** Resolve a profile by id or by label (exact, case-insensitive). */
function findProfile(profiles, ref) {
  const r = String(ref == null ? '' : ref).trim();
  if (!r) return null;
  const byId = (profiles || []).find((p) => p.id === r);
  if (byId) return byId;
  const hits = (profiles || []).filter((p) => String(p.label || '').toLowerCase() === r.toLowerCase());
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) return { ambiguous: hits.map((p) => p.id) };
  return null;
}
/** What a route or the CLI may see of a record: the proxy's secret half is
 *  masked, and `dir` stays (a path is not a secret; the label never becomes one). */
function publicProfileView(p) {
  if (!p) return null;
  return { ...p, proxy: proxyPublicView(p.proxy) };
}

// ── §6.2 who may attach ────────────────────────────────────────────────────
/** The two values, and where each one is a value at all (P6, D6). */
const SHARING_VALUES = ['owner', 'instance'];
/**
 * `owner` always. `instance` only when a mediating CDP proxy is available in
 * this process (`mediation` — the keeper's fact; a fresh instance without one
 * is the pre-P6 world and refuses with D6's sentence) AND the profile runs on
 * THIS machine (the proxy serves per-session urls on the hub; a session on a
 * paired machine would reach the browser without it — refused BY NAME, never
 * a silent downgrade to owner). `why` = unknown | mediation_unavailable | host.
 */
function sharingVerdict({ sharing, host = null, mediation = false } = {}) {
  const v = sharing == null || sharing === '' ? 'owner' : String(sharing);
  if (!SHARING_VALUES.includes(v)) return { ok: false, code: 'sharing_refused', why: 'unknown', error: `sharing "${v}" is not a value — one of ${SHARING_VALUES.join(', ')}` };
  if (v === 'owner') return { ok: true, value: 'owner' };
  if (!mediation) return { ok: false, code: 'sharing_refused', why: 'mediation_unavailable', error: 'sharing "instance" is refused: a shared profile\'s CDP endpoint confers authority over every tab in it, so between different owners the lease is not a boundary (D6) — this instance has no mediating CDP proxy, so "owner" is the only value here' };
  if (host) return { ok: false, code: 'sharing_refused', why: 'host', error: `sharing "instance" is refused on a profile that runs on ${host}: the mediating proxy serves per-session urls on THIS machine, and a session on a paired machine would reach that browser without it — keep "owner", or run the profile here` };
  return { ok: true, value: 'instance' };
}
/** Is this record's attachment MEDIATED (each lease its own scoped CDP url,
 *  P6)? `instance` sharing on a record the migration did NOT create — the
 *  legacy "Shared (legacy)" record keeps its cooperative, pre-P6 attachment
 *  (its sessions run the CLI's own default daemon path; it is labelled
 *  legacy and promises no isolation). */
function isMediatedProfile(p) { return !!p && p.sharing === 'instance' && !p.legacy && !p.ephemeral; }

// ── takeover C3 (design-browser-takeover §5): the MANAGED EPHEMERAL browser ──
/** Is this a conversation's managed ephemeral record? The flag AND its shape:
 *  owned by a conversation whose id is a browser key (a child key included). */
function isEphemeralProfile(p) {
  return !!p && p.ephemeral === true && !!p.owner && p.owner.kind === 'conversation' && (isBrowserKey(p.owner.id) || isChildKey(p.owner.id));
}
/** The label a managed ephemeral record carries: `(ephemeral) <session name>`. */
function ephemeralLabel(sessionName) {
  const n = String(sessionName == null ? '' : sessionName).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  return `(ephemeral) ${n || 'this conversation'}`;
}
/** The pair list a managed ephemeral browser is started, probed and stopped
 *  under: exactly the session's spawn pairs (never a re-run of the ladder —
 *  the r3 lesson), and only when they NAME this conversation's browser
 *  (`AGENT_BROWSER_SESSION`/`NAMESPACE` = `vs-<key>`). Anything else ⇒ not
 *  managed (the shared rung, a remote rung, no pairs) with the reason. */
function ephemeralPairsVerdict(pairs, browserKey) {
  const list = Array.isArray(pairs) ? pairs.filter((s) => typeof s === 'string' && /^AGENT_BROWSER_[A-Z_]+=/.test(s)) : [];
  if (!list.length) return { ok: false, why: 'no spawn pairs (per-session browsers are off for this session, or it predates them)' };
  const want = sessionNameFor(browserKey);
  const has = (k) => list.includes(`${k}=${want}`);
  if (!has('AGENT_BROWSER_SESSION') || !has('AGENT_BROWSER_NAMESPACE')) return { ok: false, why: `the spawn pairs do not name this conversation's browser (${want})` };
  return { ok: true, pairs: list };
}
/** The directory a managed ephemeral browser writes, when the rung names one
 *  (rung C's per-session scratch dir) — null on D/N (the CLI's own temp dir).
 *  Recorded, never deleted here: browser-env's sweep owns it. */
function ephemeralDirOf(pairs) {
  for (const s of Array.isArray(pairs) ? pairs : []) if (typeof s === 'string' && s.startsWith('AGENT_BROWSER_PROFILE=')) return s.slice('AGENT_BROWSER_PROFILE='.length) || null;
  return null;
}
/**
 * Ownership is COOPERATIVE and it is by CONVERSATION (the browserKey), never
 * by webui session id, which churns on every resume. `instance`-owned (and
 * the migration's legacy shared record) admit any session on this instance;
 * `task`-owned admit the sessions bound to that Task Group; `session`-owned
 * admit the conversation that created it.
 */
function mayAttach(profile, { browserKey, taskIds = [] } = {}) {
  if (!profile) return { ok: false, code: 'not-found', error: 'no such profile' };
  const o = profile.owner || { kind: 'instance' };
  if (o.kind === 'instance' || profile.legacy) return { ok: true };
  const parent = isChildKey(browserKey) ? parentKeyOf(browserKey) : browserKey;
  if (o.kind === 'session') return o.id === parent ? { ok: true } : { ok: false, code: 'not_owner', error: `profile "${profile.label}" belongs to another conversation` };
  if (o.kind === 'task') return (taskIds || []).includes(o.id) ? { ok: true } : { ok: false, code: 'not_owner', error: `profile "${profile.label}" belongs to Task Group ${o.id}, which this session is not bound to` };
  return { ok: false, code: 'not_owner', error: `profile "${profile.label}" has an owner kind this release cannot judge (${o.kind})` };
}

// ── §3.4 the lease ─────────────────────────────────────────────────────────
/** A sub-agent's handle is its parent's key plus a suffix (§3.7): the parent's
 *  teardown reaps them by PREFIX. Ordinary rows, not a second record type. */
const CHILD_KEY_RE = /^bk-[0-9a-f]{8}\.\d{1,4}$/;
function isChildKey(v) { return CHILD_KEY_RE.test(String(v || '')); }
function parentKeyOf(v) { const s = String(v || ''); return isChildKey(s) ? s.slice(0, s.indexOf('.')) : s; }
function findLease(leases, profileId, browserKey) {
  return (leases || []).find((l) => l.profileId === profileId && l.browserKey === browserKey) || null;
}
/**
 * ONE lease per (profileId, browserKey) — the unit of ownership is the TAB a
 * conversation holds in a profile's browser. A resume (same key, new session)
 * rewrites `sessionId` IN PLACE; it never creates a second lease. `input` has
 * exactly one holder (`agent` at attach; the live view flips it, P2).
 */
function decideAttach({ profile, leases, browserKey, sessionId, now = 0, taskIds = [] } = {}) {
  const may = mayAttach(profile, { browserKey, taskIds });
  if (!may.ok) return may;
  if (!isBrowserKey(browserKey) && !isChildKey(browserKey)) return { ok: false, code: 'bad-request', error: 'a lease needs a browser key' };
  const existing = findLease(leases, profile.id, browserKey);
  const others = (leases || []).filter((l) => l.profileId === profile.id && l.browserKey !== browserKey).length;
  if (existing) {
    const lease = { ...existing, sessionId: sessionId || existing.sessionId || null, carrierLostAt: null };
    return { ok: true, lease, created: false, resumed: lease.sessionId !== existing.sessionId, others };
  }
  const lease = { profileId: profile.id, browserKey, sessionId: sessionId || null, targetId: null, since: Number(now) || 0, input: 'agent', viewers: 0, carrierLostAt: null };
  return { ok: true, lease, created: true, resumed: false, others };
}
function decideDetach({ leases, profileId, browserKey } = {}) {
  const lease = findLease(leases, profileId, browserKey);
  if (!lease) return { ok: false, code: 'no_lease', error: 'this session holds no lease on that profile' };
  const remaining = (leases || []).filter((l) => !(l.profileId === profileId && l.browserKey === browserKey));
  return { ok: true, lease, remaining, others: remaining.filter((l) => l.profileId === profileId).length };
}
/** The leases a browser key holds — a parent's set includes its children. */
function leasesOf(leases, browserKey, { children = false } = {}) {
  return (leases || []).filter((l) => l.browserKey === browserKey || (children && parentKeyOf(l.browserKey) === browserKey && l.browserKey !== browserKey));
}
/** Is this key CARRIED by a live session? A child is carried by its parent. */
function keyCarried(browserKey, liveKeys) {
  const live = liveKeys instanceof Set ? liveKeys : new Set(liveKeys || []);
  return live.has(browserKey) || live.has(parentKeyOf(browserKey));
}
/** A session restart must not cost a cold browser (§3.5): a lease whose
 *  carrier vanished is held this long before it is dropped, EXCEPT at boot
 *  (graceMs 0 — restoreSessions has already run, so "nobody carries it" is
 *  final and must be decided BEFORE anything is kept alive). */
const LEASE_DROP_GRACE_MS = 2 * 60 * 1000;
/**
 * §3.5 boot reconciliation AND the tick's runtime half, ONE rule: a lease
 * nobody carries is dropped (at once when graceMs is 0; after the grace
 * otherwise, stamped once with `carrierLostAt`), a lease somebody carries
 * again is un-stamped. Returns the surviving list plus what was dropped and
 * why — the keeper logs by key and by reason.
 */
function reconcileLeases({ leases, liveKeys, now = 0, graceMs = 0 } = {}) {
  const kept = [], dropped = [], stamped = [];
  for (const l of (leases || [])) {
    if (keyCarried(l.browserKey, liveKeys)) { kept.push(l.carrierLostAt ? { ...l, carrierLostAt: null } : l); continue; }
    if (!(graceMs > 0)) { dropped.push({ lease: l, why: 'no live session carries its browser key' }); continue; }
    if (!l.carrierLostAt) { const s = { ...l, carrierLostAt: Number(now) || 0 }; kept.push(s); stamped.push(s); continue; }
    if ((Number(now) || 0) - l.carrierLostAt >= graceMs) { dropped.push({ lease: l, why: `its browser key has had no live session for ${Math.round(((Number(now) || 0) - l.carrierLostAt) / 1000)} s (grace ${Math.round(graceMs / 1000)} s)` }); continue; }
    kept.push(l);
  }
  return { kept, dropped, stamped };
}

// ── §3.5 the keeper's verdicts ─────────────────────────────────────────────
const BROWSER_STATES = Object.freeze(['starting', 'ready', 'stopped', 'failed']);
const LIVE_BROWSER_STATES = Object.freeze(['starting', 'ready']);
function isLiveBrowser(rec) { return !!rec && LIVE_BROWSER_STATES.includes(rec.state); }
/** A browser is idle when it has NO lease: the daemon is launched with the
 *  CLI's own timeout at 0 and the KEEPER owns the clock, so a lease that drops
 *  and returns never restarts anything. `idleMs` 0 = never. */
function browserIdle(rec, leases, now, idleMs) {
  const leased = (leases || []).some((l) => l.profileId === rec.profileId);
  const since = Number(rec.lastLeaseDroppedAt || rec.startedAt) || now;
  const idle = Math.max(0, now - since);
  const limit = Number(idleMs) > 0 ? Number(idleMs) : 0;
  return { leased, idleMs: idle, limit, expired: !leased && !!limit && idle >= limit };
}
/** The concurrency ceiling (§3.2.3/§3.5): shared with every keeper through
 *  src/keeper-limits.js. Refused LOUDLY, naming the holders and who leases them.
 *  takeover C3 (design-browser-takeover §5.3, D2): `running` includes the
 *  managed EPHEMERAL browsers (they count), `others` are the holders another
 *  keeper reports through the count seam (a desktop app: `{label, kind}`), and
 *  `ephemeral:true` answers the typed `browser_cap` a conversation's FIRST
 *  page verb gets — naming every holder and the two ways out (an idle-out, or
 *  the user stopping one); a named profile's start keeps its `cap` sentence. */
function ceilingVerdict(running, leases, limits, { others = [], ephemeral = false, idleMs = DEFAULT_IDLE_TIMEOUT_MS } = {}) {
  const cap = Number(limits && limits.CONCURRENT_CAP) || 6;
  const live = (running || []).filter(isLiveBrowser);
  const extra = (Array.isArray(others) ? others : []).filter((o) => o && typeof o === 'object');
  if (live.length + extra.length < cap) return null;
  const holders = [
    ...live.map((r) => ({ profileId: r.profileId, label: r.label || r.profileId, ephemeral: !!r.ephemeral, sessions: (leases || []).filter((l) => l.profileId === r.profileId).map((l) => l.browserKey), kind: r.ephemeral ? 'ephemeral' : 'profile' })),
    ...extra.map((o) => ({ profileId: null, label: String(o.label || o.id || 'desktop app'), ephemeral: false, sessions: [], kind: String(o.kind || 'desktop-app') })),
  ];
  const n = live.length + extra.length;
  if (ephemeral) {
    const names = holders.map((h) => (h.kind === 'profile' ? `${h.label}${h.sessions.length ? ' (' + h.sessions.join(', ') + ')' : ''}` : h.kind === 'ephemeral' ? h.label : `${h.label} (${h.kind})`));
    const min = Math.max(1, Math.round((Number(idleMs) > 0 ? Number(idleMs) : DEFAULT_IDLE_TIMEOUT_MS) / 60000));
    return { code: 'browser_cap', cap, holders, error: `${n} browsers are running on this instance (the ceiling of ${cap} is shared with desktop apps): ${names.join(', ')}; yours starts when one idles out (${min} min without a command) or is stopped by the user (Agent browser panel). \`vibespace-browser status\` shows the holders; nothing of yours is queued`, remedy: `wait for an idle-out (${min} min) or ask the user to stop one of the holders — then run the same command again` };
  }
  const names = holders.map((h) => (h.profileId ? `${h.label} (${h.profileId}${h.sessions.length ? ', leased by ' + h.sessions.join(', ') : ', no lease'})` : `${h.label} (${h.kind})`));
  return { code: 'cap', cap, holders, error: `browser ceiling reached (${n}/${cap} running: ${names.join('; ')}) — stop one first (vibespace-browser detach, or Stop in the Browser panel)` };
}
/** Per-PROVIDER runaway thresholds (§3.5: chromium's normal floor is higher
 *  than a serve's — measured 6 processes / 420–667 MB PSS per idle browser, so a
 *  serve's 2 GiB would trip on a few heavy tabs). The sample cadence, the
 *  sustain window and the cooldown stay the shared numbers. */
function providerGuard(provider, limits) {
  const base = limits || {};
  if (provider === 'chromium') return { ...base, GUARD_RSS_BYTES: 3 * 1024 * 1024 * 1024, GUARD_CPU_PCT: 250 };
  return { ...base };
}
/** ONE runaway sample — the opencode-serve / desktop-app guard arithmetic,
 *  verbatim, over the provider-scaled limits. `why` non-null ⇒ stop + park. */
function runawayVerdict(sample, prev, hotSince, now, { clkTck = 100, limits } = {}) {
  if (!sample) return { cpuPct: null, hotSince: 0, why: null };
  const L = limits || {};
  let cpuPct = null;
  if (prev && now > prev.at) cpuPct = (sample.cpuTicks - prev.cpuTicks) * 100000 / clkTck / (now - prev.at);
  let why = null;
  let hot = hotSince || 0;
  if (sample.rssBytes > L.GUARD_RSS_BYTES) {
    why = `RSS ${(sample.rssBytes / 2 ** 30).toFixed(1)} GB (limit ${(L.GUARD_RSS_BYTES / 2 ** 30).toFixed(1)} GB)`;
  } else if (cpuPct !== null && cpuPct > L.GUARD_CPU_PCT) {
    if (!hot) hot = now;
    if (now - hot >= L.GUARD_CPU_SUSTAIN_MS) why = `${cpuPct.toFixed(0)}% CPU sustained for ${Math.round((now - hot) / 60000)} min (limit ${L.GUARD_CPU_PCT}%)`;
  } else hot = 0;
  return { cpuPct, hotSince: hot, why };
}
function runawayParkVerdict(profileId, parkedUntil, now) {
  const until = profileId && parkedUntil ? Number(parkedUntil[profileId]) : 0;
  if (!until || until <= now) return null;
  return { code: 'runaway-parked', until, error: `this profile's browser was stopped as a runaway; not starting it again for ${Math.ceil((until - now) / 60000)} min` };
}
/**
 * Is the recorded daemon pid STILL the process we mean? `pid` + the recorded
 * starttime against what /proc says now. An identity nobody recorded (no
 * starttime, no /proc) is NEVER 'ours' — an unproven pid is never signalled.
 */
function pidVerdict({ alive, sameStart } = {}) {
  if (!alive) return 'gone';
  return sameStart ? 'ours' : 'unproven';
}
/** Boot ADOPTION: a browser record comes back `ready` only when its daemon is
 *  the recorded process (pid AND starttime) AND the CLI says that namespace is
 *  active; otherwise it is recorded ended with the reason, and an unproven pid
 *  is left alone. */
function adoptVerdict(rec, { verdict, active } = {}) {
  if (!rec || !isLiveBrowser(rec)) return null;
  if (verdict === 'gone') return { state: 'stopped', lastError: 'the browser daemon exited while VibeSpace was down' };
  if (verdict === 'unproven') return { state: 'stopped', lastError: `pid ${rec.pid} is not provably the recorded daemon (starttime differs or is unreadable) — left alone, never signalled` };
  if (!active) return { state: 'stopped', lastError: 'the recorded daemon is alive but its namespace no longer answers' };
  return { state: 'ready', adopted: true };
}
/** The environment a session attached to a profile browses WITH: the
 *  profile's daemon namespace + the session's OWN context inside it (§3.4 —
 *  the tab is the unit, the browser is shared) + the profile's directory.
 *  `AGENT_BROWSER_SESSION` stays the session's key so `close` is scoped to it. */
function attachedEnvFor({ browserKey, profileId, profileDir, cdpUrl = null }) {
  if (!isProfileId(profileId)) return [];
  const bk = String(browserKey || '');
  // P4 (§7.1 `cdp`, §7.3): a browser REACHED rather than launched — the
  // session's own agent-browser daemon connects over CDP to the hub-side
  // loopback url (a paired machine's port arrives tunnelled, §6.1) and no
  // profile directory is named: the state lives in THAT browser.
  const viaCdp = !!cdpUrl && /^(ws|http)s?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/.test(String(cdpUrl));
  return [
    `AGENT_BROWSER_SESSION=${sessionNameFor(bk)}`,
    `AGENT_BROWSER_NAMESPACE=${sessionNameFor(profileId)}`,
    ...(viaCdp ? [`AGENT_BROWSER_CDP=${cdpUrl}`] : (profileDir ? [`AGENT_BROWSER_PROFILE=${profileDir}`] : [])),
    'AGENT_BROWSER_IDLE_TIMEOUT_MS=0',
  ];
}
/** Is this env pair the CDP endpoint (the ONE pair `use --print` withholds —
 *  §5.1: `use` never prints a CDP url; the subshell and the `--` form carry it
 *  without printing it)? */
function isCdpPair(kv) { return /^AGENT_BROWSER_CDP=/.test(String(kv || '')); }
/** Re-point a loopback CDP url at the hub's forward of it: the scheme and
 *  the path survive, only host:port changes (`ws://127.0.0.1:9222/devtools/…`
 *  → `ws://127.0.0.1:<localPort>/devtools/…`). A bare port becomes an http
 *  endpoint (agent-browser resolves /json/version itself). */
function forwardedCdpUrl(remote, localPort) {
  const lp = Number(localPort);
  if (!Number.isInteger(lp) || lp < 1 || lp > 65535) return null;
  const s = String(remote == null ? '' : remote).trim();
  if (/^\d{1,5}$/.test(s) || !s) return `http://127.0.0.1:${lp}`;
  const m = /^((?:ws|http)s?):\/\/[^/]+(\/.*)?$/.exec(s);
  if (!m) return null;
  return `${m[1]}://127.0.0.1:${lp}${m[2] || ''}`;
}
/** The port a loopback CDP url names, or null. */
function cdpPortOf(url) {
  const m = /^(?:ws|http)s?:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):(\d{1,5})(?:\/|$)/.exec(String(url || '').trim());
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : null;
}

// ═══ P1 second half — THE ATTACHMENT SET, HANDLES, THE TWO REFUSALS, THE AUDIT
// (§3.7 + §3.8). A session holds a SET of attachments (its leases on
// profiles, each with a short alias) of which at most ONE is the default; a
// bare command lands on the default, and once the set has two or more
// members a command must NAME a handle — a typed refusal, never a guess.
// PURE: the keeper asks these with its own registry, the suite drives them
// with a literal one, and the CLI prints the codes verbatim.

// ── §3.7 aliases ──────────────────────────────────────────────────────────
const ALIAS_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
/** A label's slug, made unique against `taken`: "Work account" → `work-account`,
 *  then `work-account-2`. Never empty (a label with no usable character gets
 *  the profile id itself). */
function aliasFor(label, taken = [], fallback = '') {
  let base = String(label == null ? '' : label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
  if (!base) base = String(fallback || 'profile').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'profile';
  const used = new Set((taken || []).map((a) => String(a).toLowerCase()));
  if (!used.has(base)) return base;
  for (let n = 2; n < 1000; n++) { const c = `${base}-${n}`; if (!used.has(c)) return c; }
  return `${base}-${Date.now().toString(36)}`;
}
function isAlias(v) { return ALIAS_RE.test(String(v || '')); }
/** A child handle for a sub-agent: `bk-<parent>.<n>` (§3.7 / D23). */
function childHandleFor(parentKey, n) { return `${parentKeyOf(parentKey)}.${Math.max(1, Math.floor(Number(n) || 1))}`; }
/** Does this string look like a FILESYSTEM PATH rather than a registry handle?
 *  `agent-browser`'s own `--profile` takes a name OR a path (§1.4) — ours takes
 *  a handle only, and the two must be told apart LOUDLY (§3.7's last row). */
function looksLikePath(v) {
  const s = String(v == null ? '' : v).trim();
  return !!s && (s.startsWith('/') || s.startsWith('./') || s.startsWith('../') || s.startsWith('~') || s.includes('/') || s.startsWith('\\') || /^[A-Za-z]:[\\/]/.test(s));
}

// ── §3.7 the attachment set ───────────────────────────────────────────────
/**
 * The attachment set of ONE browser key, derived from the registry: its
 * leases (children EXCLUDED — a child is its own handle, listed beside the
 * set), each named by its alias (stored on the lease, else the label's slug),
 * and the DEFAULT: the pin when it is among the attachments, else the only
 * attachment when there is exactly one, else NONE (two or more with no pin
 * among them ⇒ every command must name a handle). `fingerprint` is what
 * §3.8's layer ① watches: it moves when the default moves, when a member is
 * added and when one is removed — and on nothing else.
 *
 *   @returns {{browserKey, attachments:[{profileId, alias, label, dir, since, isDefault}],
 *              children:[{handle, since}], defaultId, fingerprint, handles:[…]}}
 */
function attachmentsFor({ leases = [], profiles = [], browserKey, pin = null, children = [] } = {}) {
  const bk = String(browserKey || '');
  // takeover C3: the managed EPHEMERAL browser's lease is not an attachment —
  // it carries no handle, a bare command still lands on it (`kind:'none'`),
  // and it never counts toward `profile_required`
  const byId = new Map((profiles || []).filter((p) => p && !isEphemeralProfile(p)).map((p) => [p.id, p]));
  const mine = (leases || []).filter((l) => l.browserKey === bk && byId.has(l.profileId))
    .slice().sort((a, b) => (Number(a.since) || 0) - (Number(b.since) || 0));
  const taken = [];
  const attachments = mine.map((l) => {
    const p = byId.get(l.profileId);
    const alias = isAlias(l.alias) ? String(l.alias) : aliasFor(p.label, taken, p.id);
    taken.push(alias);
    return { profileId: p.id, alias, label: p.label, dir: p.dir, since: Number(l.since) || 0, isDefault: false };
  });
  const pinId = pin && pin.profileId ? String(pin.profileId) : '';
  let defaultId = null;
  if (pinId && attachments.some((a) => a.profileId === pinId)) defaultId = pinId;
  else if (attachments.length === 1) defaultId = attachments[0].profileId;
  for (const a of attachments) a.isDefault = a.profileId === defaultId;
  const kids = (children || []).filter((c) => c && parentKeyOf(c.handle) === bk && c.handle !== bk)
    .map((c) => ({ handle: String(c.handle), since: Number(c.since) || 0 }));
  const fingerprint = `${defaultId || '-'}|${attachments.map((a) => a.profileId).sort().join(',')}`;
  const handles = [
    ...attachments.map((a) => ({ handle: a.alias, profileId: a.profileId, label: a.label, isDefault: a.isDefault, kind: 'attachment' })),
    ...kids.map((c) => ({ handle: c.handle, profileId: null, label: 'child (own ephemeral browser)', isDefault: false, kind: 'child' })),
  ];
  return { browserKey: bk, attachments, children: kids, defaultId, fingerprint, handles };
}
/** The one-line spelling of a handle list, for refusals and answers. */
function handlesText(handles) {
  const list = (handles || []).map((h) => `${h.handle}${h.profileId ? ' (' + h.profileId + ')' : ''}${h.isDefault ? ' [default]' : ''}`);
  return list.length ? list.join(', ') : '(none)';
}

// ── §3.7 handle resolution + the named refusals ───────────────────────────
/**
 * WHICH browser does this command act on. `handle` is the `--profile` value
 * (or `VIBESPACE_BROWSER`), or nothing for a bare command.
 *
 *   ok, kind 'none'        no attachment at all ⇒ the session's OWN ephemeral browser (§3.2)
 *   ok, kind 'attachment'  one attachment resolved (the default, or the named one)
 *   ok, kind 'child'       a child handle (its own ephemeral browser, §3.7 / D23)
 *   refused profile_path_refused   `--profile` was a filesystem PATH — the refusal
 *                                  carries the command that turns a path into a handle
 *   refused profile_required       ≥2 attachments and no handle: EVERY handle is
 *                                  listed and the default is marked (the only
 *                                  diagnostic the agent gets); `subagent:true`
 *                                  adds the diagnostic ASIDE and never the reason
 *   refused not_attached           a handle naming a profile this session is not
 *                                  attached to — refused, never silently attached
 *   refused ambiguous              a handle two attachments answer to (label case)
 */
function resolveHandle({ set, handle = '', subagent = false } = {}) {
  const S = set || attachmentsFor({});
  const h = String(handle == null ? '' : handle).trim();
  const handles = S.handles;
  if (h) {
    if (looksLikePath(h)) {
      return { ok: false, code: 'profile_path_refused', handles, error: `--profile takes a registry HANDLE (an alias or a profile id), never a filesystem path — ${JSON.stringify(h)} looks like a path. Register it first: \`vibespace-browser new <label> --adopt ${h}\`, then \`vibespace-browser use <label>\`.` };
    }
    const kid = S.children.find((c) => c.handle === h);
    if (kid) return { ok: true, kind: 'child', handle: kid.handle, child: kid, handles };
    const hits = S.attachments.filter((a) => a.alias === h || a.profileId === h || String(a.label || '').toLowerCase() === h.toLowerCase());
    if (hits.length === 1) return { ok: true, kind: 'attachment', handle: hits[0].alias, attachment: hits[0], handles };
    if (hits.length > 1) return { ok: false, code: 'ambiguous', handles, error: `${JSON.stringify(h)} names ${hits.length} attachments (${hits.map((a) => a.alias).join(', ')}) — use the alias or the id` };
    return { ok: false, code: 'not_attached', handles, error: `this session is not attached to ${JSON.stringify(h)} — attach first: \`vibespace-browser use ${h}\` (attached: ${handlesText(handles)})` };
  }
  if (!S.attachments.length) return { ok: true, kind: 'none', handle: null, handles };
  if (S.attachments.length === 1) return { ok: true, kind: 'attachment', handle: S.attachments[0].alias, attachment: S.attachments[0], handles };
  const d = S.attachments.find((a) => a.isDefault);
  const aside = subagent ? ' (a sub-agent seems to be running in this session right now — a sub-agent gets its own browser with `vibespace-browser new-child`, or is handed one of these handles by its parent)' : '';
  return {
    ok: false, code: 'profile_required', handles, default: d ? d.alias : null,
    error: `this session holds ${S.attachments.length} browsers — name one with --profile <handle> (or export VIBESPACE_BROWSER=<handle>): ${handlesText(handles)}${d ? '' : '; no default is set (`vibespace-browser pin <handle>` sets one)'}${aside}`,
  };
}
/** §3.8 layer ①: the typed one-time refusal when the set's fingerprint moved
 *  since this session was last told. `was`/`now` are attachment-set views. */
function profileChangedRefusal({ was, now } = {}) {
  const d = (S) => (S && S.attachments ? (S.attachments.find((a) => a.isDefault) || null) : null);
  const spell = (S) => (S ? `${d(S) ? d(S).alias + ' [default]' : 'no default'} of ${S.attachments.length ? S.attachments.map((a) => a.alias).join(', ') : '(none)'}` : 'unknown');
  return {
    ok: false, code: 'profile_changed',
    was: was ? { default: d(was) ? d(was).alias : null, handles: was.handles } : null,
    now: { default: d(now) ? d(now).alias : null, handles: now ? now.handles : [] },
    handles: now ? now.handles : [],
    error: `this session's browser attachments changed since your last command (was: ${spell(was)}; now: ${spell(now)}) — this command did NOT run; re-issue it${now && now.attachments.length > 1 ? ' with --profile <handle>' : ''} and the new default applies from here on`,
  };
}
/** §3.8 layer ②: the free notice that rides the user's next message. */
function profileChangeNotice({ was = '', now = '', at = 0, by = 'user', handles = [] } = {}) {
  return { kind: 'browser-profile', was: was || null, now: now || null, at: Number(at) || 0, by, handles: Array.isArray(handles) ? handles.map((h) => (typeof h === 'string' ? h : h.handle)) : [] };
}
function renderProfileChangeNotice(n) {
  const was = n.was || 'ephemeral (no profile)';
  const now = n.now || 'ephemeral (no profile)';
  const list = n.handles && n.handles.length ? ` Attached now: ${n.handles.join(', ')}.` : '';
  return '<system-reminder>\n'
    + `browser profile changed: ${was} → ${now} (by ${n.by || 'user'}).${list}\n`
    + 'Your next `vibespace-browser` command lands on the NEW default after being refused once with profile_changed so you notice. `vibespace-browser status` shows the current set.\n'
    + '</system-reminder>';
}

// ── §3.7 the audit line ───────────────────────────────────────────────────
/** `{at, sessionId, browserKey, profileId, verb, ok}` and NOTHING else — a
 *  `fill`'s content is never recorded, only the verb (§3.7: this is an audit
 *  of who used a live credential, not telemetry). */
function auditVerbOf(argv) {
  const a = (Array.isArray(argv) ? argv : []).map((x) => String(x)).filter((x) => !x.startsWith('-'));
  return (a[0] || '').slice(0, 32) || null;
}
function auditLine({ at = 0, sessionId = null, browserKey = null, profileId = null, verb = null, ok = true } = {}) {
  return JSON.stringify({ at: Number(at) || 0, sessionId: sessionId == null ? null : String(sessionId), browserKey: browserKey == null ? null : String(browserKey), profileId: profileId == null ? null : String(profileId), verb: verb == null ? null : String(verb).slice(0, 32), ok: !!ok });
}

// ── §3.8 layer ① bookkeeping: what a session was LAST TOLD ────────────────
/** The memory a one-time refusal needs: the fingerprint, and the words to
 *  spell "was" (aliases + which one was the default). Stored per browserKey
 *  in the registry's `told`. */
function toldView(set, at = 0) {
  const S = set || attachmentsFor({});
  return {
    fingerprint: S.fingerprint,
    attachments: S.attachments.map((a) => ({ profileId: a.profileId, alias: a.alias, label: a.label, isDefault: a.isDefault })),
    handles: S.handles.map((h) => ({ ...h })),
    at: Number(at) || 0,
  };
}
/**
 * Does THIS command get the one-time `profile_changed` refusal? `told` is the
 * view recorded when the session was last told (null = never: its first
 * command is told now and never refused — there is nothing it could have
 * believed instead). Same fingerprint ⇒ nothing to say. The caller records
 * `toldView(set)` in BOTH outcomes, so the refusal speaks exactly once per
 * change and never once per command.
 */
function blindnessVerdict({ told, set } = {}) {
  const S = set || attachmentsFor({});
  if (!told || typeof told !== 'object' || !told.fingerprint) return null;
  if (told.fingerprint === S.fingerprint) return null;
  return profileChangedRefusal({ was: { attachments: told.attachments || [], handles: told.handles || [] }, now: S });
}
/** The lowest child suffix not yet minted under a parent (1-based). */
function nextChildN(children, parentKey) {
  const used = new Set(Object.keys(children || {}).filter((k) => parentKeyOf(k) === parentKey && isChildKey(k)).map((k) => Number(k.slice(k.indexOf('.') + 1))));
  let n = 1; while (used.has(n)) n++;
  return n;
}
/**
 * A child's OWN ephemeral browser (§3.7 / D23): its own session AND its own
 * daemon, named by the child key. The sub-agent inherits the parent's
 * environment (VibeSpace spawns no sub-agent), so this is what it exports in
 * its own tool call. `unset` names the parent variables that would put the
 * child INSIDE the parent's browser: on the per-session-directory rung (C)
 * the inherited `AGENT_BROWSER_PROFILE` symlink is the parent's scratch dir,
 * and two daemons on one dir die on SingletonLock (P0's measured reject).
 *
 * RUNG D IS NOT EXEMPT (2026-09-21, the verifier's finding): the inherited
 * `AGENT_BROWSER_CONFIG` is the parent's generated config, and once the
 * parent is PINNED that file names the pinned directory — a second namespace
 * resolving the SAME user-data-dir is the SingletonLock shape again (or, with
 * the parent's browser stopped, the child silently browsing in the parent's
 * cookie jar). So on rung D the child gets a config of its OWN
 * (`childConfigPath`, written by browser-env from the parent's with `profile`
 * deleted and the fence kept); when none could be written, a parent config
 * that NAMES a profile is unset (the child falls to the CLI's own defaults —
 * never the parent's directory), and one that names none is safe to inherit
 * (each daemon then gets the CLI's own ephemeral dir). `why` says which.
 */
function childEnvFor({ childKey, parentVariant = null, childConfigPath = null, parentNamesProfile = null } = {}) {
  if (!isChildKey(childKey)) return { pairs: [], unset: [], why: null };
  const pairs = [`AGENT_BROWSER_SESSION=${sessionNameFor(childKey)}`, `AGENT_BROWSER_NAMESPACE=${sessionNameFor(childKey)}`, `VIBESPACE_BROWSER=${childKey}`];
  const v = String(parentVariant || '');
  if (v === VARIANTS.C) return { pairs, unset: ['AGENT_BROWSER_PROFILE'], why: 'rung C: the inherited profile symlink is the parent\'s scratch dir' };
  if (v === VARIANTS.D) {
    if (typeof childConfigPath === 'string' && childConfigPath) return { pairs: [...pairs, `AGENT_BROWSER_CONFIG=${childConfigPath}`], unset: [], why: 'rung D: the child browses on its own generated config (no profile, the fence kept)' };
    if (parentNamesProfile === true) return { pairs, unset: ['AGENT_BROWSER_CONFIG'], why: 'rung D: no child config could be written and the parent\'s names a pinned directory — unset, never the parent\'s dir' };
    return { pairs, unset: [], why: 'rung D: the inherited config names no profile — safe to share (each daemon gets its own ephemeral dir)' };
  }
  return { pairs, unset: [], why: null };
}

/** takeover C3: the FULL pair list a child handle's browser runs under — the
 *  parent's spawn pairs, minus what `childEnvFor` unsets, overridden by the
 *  child's own — i.e. exactly the environment the CLI composes for a child
 *  command, so the keeper starts and probes the SAME daemon. */
function childPairsOver(parentPairs, child) {
  const drop = new Set((child && child.unset) || []);
  const out = new Map();
  for (const s of Array.isArray(parentPairs) ? parentPairs : []) { const i = String(s).indexOf('='); if (i > 0 && !drop.has(s.slice(0, i))) out.set(s.slice(0, i), s); }
  for (const s of (child && child.pairs) || []) { const i = String(s).indexOf('='); if (i > 0) out.set(s.slice(0, i), s); }
  return [...out.values()].filter((s) => /^AGENT_BROWSER_[A-Z_]+=/.test(s));
}

/** An absolute path with `.`/`..`/empty segments folded — the PURE module
 *  imports nothing, so path.resolve is spelled here (a `..` inside an adoptable
 *  root must not walk out of it). */
function normAbsPath(p) {
  const out = [];
  for (const seg of String(p || '').split('/')) { if (!seg || seg === '.') continue; if (seg === '..') { out.pop(); continue; } out.push(seg); }
  return '/' + out.join('/');
}
/**
 * May THIS session register `dir` as a profile it owns (`new --adopt <dir>`)?
 * (2026-09-21, the verifier's finding: ANY existing directory — the user's own
 * Chrome profile, the legacy shared jar — could be registered as session-owned,
 * handed to the agent's env and idle-managed by the keeper.) Adoptable = strictly
 * inside `~/.agent-browser/` or `data/browser-profiles/` (rung C's scratch
 * dirs); the legacy `~/.agent-browser/default-profile` is the migration's
 * "Shared (legacy)" record, never a session's; a directory another owner already
 * registered is theirs (`use` it by handle); one THIS session already owns is
 * idempotent. Every refusal is typed and carries the remedy.
 */
function adoptDirVerdict({ dir, homeDir = null, dataDir = null, existing = null, browserKey = null } = {}) {
  const raw = typeof dir === 'string' ? dir : '';
  if (!raw || !raw.startsWith('/')) return { ok: false, code: 'adopt_failed', error: 'adopt needs an absolute directory path' };
  const d = normAbsPath(raw);
  const roots = [homeDir ? normAbsPath(homeDir) + '/.agent-browser' : null, dataDir ? normAbsPath(dataDir) + '/browser-profiles' : null].filter(Boolean);
  if (!roots.length) return { ok: false, code: 'adopt_failed', error: 'no adoptable roots are configured on this instance' };
  if (!roots.some((r) => d.startsWith(r + '/'))) return { ok: false, code: 'adopt_outside_roots', error: `${raw} is outside the adoptable roots (${roots.join(', ')}) — a profile a session owns lives under ~/.agent-browser/; a browser directory of the user's own is theirs to keep, never a session's to register` };
  if (homeDir && d === normAbsPath(homeDir) + '/.agent-browser/default-profile') return { ok: false, code: 'adopt_legacy_refused', error: `${raw} is the legacy shared profile — the migration's "Shared (legacy)" record, never a session's; \`vibespace-browser use "Shared (legacy)"\` attaches it` };
  if (existing && !(existing.owner && existing.owner.kind === 'session' && browserKey && existing.owner.id === browserKey)) return { ok: false, code: 'adopt_registered', error: `${raw} is already registered as "${existing.label}" (${existing.id}), owned by ${existing.owner ? existing.owner.kind : 'somebody'} — \`vibespace-browser use ${existing.id}\` attaches it; it is not yours to adopt` };
  return { ok: true, code: null, error: null, dir: d };
}

// ── D1: the version floor ──────────────────────────────────────────────────
/**
 * 0.34.0 brought the persistent session→tab binding (`--pin-tab`) that makes
 * "several sessions, one shared profile" safe; 0.35.2 the reverse-proxy origin
 * hardening; 0.37.0 recording. D1's ruling is to pin 0.37.1 and CHECK the floor
 * at runtime rather than assume it.
 *
 * The floor gates the SHARED-PROFILE half only. P0's own isolation (four env
 * vars) works on the installed 0.32.0 — measured end to end — so a too-old
 * binary must degrade by capability with one honest notice, never crash and
 * never go quiet.
 */
const FLOOR_VERSION = '0.37.1';

/** Numeric-segment compare. Returns -1/0/1; an unparseable version is `null`
 *  and a null is NEVER treated as "old enough" by the callers below. */
function cmpVersion(a, b) {
  const pa = parseVersion(a), pb = parseVersion(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < 3; i++) { if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1; }
  return 0;
}
function parseVersion(v) {
  const m = String(v || '').match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/**
 * Three outcomes, each with a name, because "we could not tell" is not "too
 * old" and neither is "not installed":
 *
 *   ok          — at or above the floor; the shared-profile half is available
 *   too-old     — installed and below the floor; ONE notice, capability off
 *   absent      — no binary; say nothing (an agent that never browses should
 *                 not be nagged about a tool it does not use)
 *   unknown     — a binary that would not state its version; treated like
 *                 too-old for CAPABILITY (fail closed on the feature) but it
 *                 says so in its own words rather than claiming a version
 */
function floorVerdict(installed, floor = FLOOR_VERSION) {
  // `null`/`undefined` = THERE IS NO BINARY. `''` = there is one and it would
  // not state a version — a different fact, and only one of them deserves a
  // sentence, so they may not collapse into the same answer.
  if (installed === null || installed === undefined) return { state: 'absent', installed: null, floor, sharedProfiles: false };
  if (installed === '') return { state: 'unknown', installed: '', floor, sharedProfiles: false };
  const c = cmpVersion(installed, floor);
  if (c === null) return { state: 'unknown', installed: String(installed), floor, sharedProfiles: false };
  if (c < 0) return { state: 'too-old', installed: String(installed), floor, sharedProfiles: false };
  return { state: 'ok', installed: String(installed), floor, sharedProfiles: true };
}

/** The user-facing sentence, so the suite asserts the SENTENCE and the notice
 *  channel cannot drift from the verdict. Returns null when there is nothing
 *  honest to say. */
function floorNotice(v) {
  if (!v || v.state === 'ok' || v.state === 'absent') return null;
  if (v.state === 'too-old') {
    return `Your agent-browser is too old for shared profiles — ${v.installed} is installed, ${v.floor} or newer is needed. `
      + `Per-session isolation is on and working; profiles several sessions can share stay off until you upgrade (npm install -g agent-browser@${v.floor}).`;
  }
  return `Could not read the installed agent-browser version, so shared profiles stay off. `
    + `Per-session isolation is on and working. \`npm ls -g agent-browser\` shows what is installed.`;
}

module.exports = {
  sessionNameFor, mintBrowserKey, isBrowserKey, BROWSER_KEY_RE,
  browserKeyFor,
  VARIANTS, REJECTED_VARIANTS, ISOLATED_VARIANTS, isolatedVariant, variantLadder, fencedRungReason, configNamesProfile,
  SOCKET_PATH_MAX, SOCKET_DIR_BASE, utf8Bytes, socketTailBytes, socketRootFor, socketDirBaseOf, socketDirDecision,
  USER_CONFIG_REL, PROJECT_CONFIG_NAME, layerProjectConfig,
  DEFAULT_IDLE_TIMEOUT_MS, idleTimeoutMs,
  browserEnvFor,
  REMOTE_SCRATCH_DIR_SH, REMOTE_SCRATCH_STALE_DAYS, TOP_LEVEL_PROFILE_AWK, remoteBrowserPrelude,
  PIN_APPLIES_FROM, pinResolution, generatedConfig, generatedConfigParts,
  EPHEMERAL_DENY, deniedKeys, configFence, pinFenceConflict,
  PIN_ORIGINS, P0_PIN_ORIGINS, pinPick, pinForCreate, pinApplyNotice,
  FLOOR_VERSION, cmpVersion, parseVersion, floorVerdict, floorNotice,
  // P1 (§3.3–§3.5): the registry, the lease and the keeper's verdicts
  PROFILE_ID_RE, mintProfileId, isProfileId, profileDirName, PROVIDERS, OWNER_KINDS, LABEL_MAX, cleanLabel,
  normalizeProxy, proxyPublicView, validateProfileInput, newProfileRecord, normalizeRegistry, findProfile, publicProfileView,
  SHARING_VALUES, sharingVerdict, isMediatedProfile, isEphemeralProfile, ephemeralLabel, ephemeralPairsVerdict, ephemeralDirOf, mayAttach, CHILD_KEY_RE, isChildKey, parentKeyOf, findLease, decideAttach, decideDetach, leasesOf, keyCarried,
  LEASE_DROP_GRACE_MS, reconcileLeases,
  BROWSER_STATES, LIVE_BROWSER_STATES, isLiveBrowser, browserIdle, ceilingVerdict, providerGuard, runawayVerdict, runawayParkVerdict,
  pidVerdict, adoptVerdict, attachedEnvFor,
  // P4 (§7.1–§7.3): provider rows + capability gating, the §7.2.1 egress record, the cdp env pair, the cloakserve plan
  CLOUD_PROVIDERS, CLOUD_UNWIRED, providerRow, providerIds, providerControl, capabilityRefusal, providerRows,
  CLOAK_EGRESS_PROOF, CLOAK_EGRESS_RUNS, proofVerdict, blockedCell,
  isCdpPair, forwardedCdpUrl, cdpPortOf,
  parseEgressAllowlist, egressVerdict, CLOAKSERVE_IMAGE, cloakservePlan,
  // P1 second half (§3.7/§3.8): the attachment set, handles, the two refusals, the audit line
  ALIAS_RE, aliasFor, isAlias, childHandleFor, looksLikePath, attachmentsFor, handlesText, resolveHandle,
  profileChangedRefusal, profileChangeNotice, renderProfileChangeNotice, auditVerbOf, auditLine,
  toldView, blindnessVerdict, nextChildN, childEnvFor, childPairsOver, adoptDirVerdict, normAbsPath,
};
