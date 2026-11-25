// DeviceManager (CS refactor M0, server side) — install / token mint / spawn
// supervision / handshake / self-upgrade for vibespace-agentd instances.
// M0 covers DEVICE #0 (localhost) only, but through the SAME protocol every
// device will use (invariant #3: no local special case — the server talks to
// its own machine over the unix socket like any device).
// Lifecycle decision (design addendum): the daemon is ALWAYS setsid-detached;
// the server supervises BY CONNECT — a failed connect (re)spawns from the
// `current` install with backoff. A server restart never touches the daemon.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { Mux, PROTO_VERSION } = require('./mux.js');
const { daemonEnv, serviceEnv, SSH_ENV_KEEP } = require('../agent-env.js');
const DA = require('../device-acts.js'); // lane device-act-audit: the op layers + `by` + THE audit line (PURE)
const AC = require('./answer-caps.js'); // lane lg-remote-hardening (B-7f0b D8): the line's bound and each op's answer cap, one PURE table
// B-c632 cure (batch 71's reader): the act's WHOLE argv — the summary is cut at SUMMARY_MAX, so two long commands alike in their
// first 240 characters were one subject; a hash of the whole argv (cmd + args, or the shell line, + cwd) tells them apart
const argvIdOf = (p) => (p && (p.cmd != null || p.shell != null) ? crypto.createHash('sha256').update(JSON.stringify([p.shell == null ? null : String(p.shell), p.cmd == null ? null : String(p.cmd), Array.isArray(p.args) ? p.args.map(String) : null, p.cwd == null ? null : String(p.cwd)])).digest('hex').slice(0, 16) : '');
const FOLD_SAY_MS = 60 * 60e3, FOLDS_MAX = 256;   // B-c632: a fold of repeated refusals is said at least hourly; open folds kept
// B-c632 (r1): the clients holding an open fold — said at the process's exit (a restart inside the hour keeps its count)
const _OPEN_FOLDS = new Set();
process.on('exit', () => { for (const dm of [..._OPEN_FOLDS]) { try { dm._foldEndAll(); } catch { } } });
// B-0194: THE UPDATE'S REFUSALS AT THE HELLO, per DEVICE — `helloKey` (the dial road `dev:<deviceId>`, the ssh road the same for a
// graduated host, else `host:<hostId>`) → its records; they outlive every DeviceManager of that device (a re-dial / reconnect builds
// a fresh one). Each record says through the writers of the last client that counted it (never the client itself); at most
// HELLO_FOLDS_MAX a device (the oldest said, then evicted); owed counts said at exit.
const HELLO_FOLDS = new Map(), HELLO_FOLDS_MAX = 16;
// a key's GENERATION: dropHelloFolds (an unpair, a pairing made again, a graduation) bumps it — the owner's answer to an ask
// BEGUN before the drop neither makes nor reads that key's store (said, never folded: an answer landing after an unpair); a hello
// begun after it folds as any (a client kept across a re-pair in place, or a graduation rolled back, folds on)
const HELLO_GEN = new Map();
function sayHello(f) {
  if (f.timer) { clearTimeout(f.timer); f.timer = null; }
  if (f.more > 0 && f.out) {
    const l = f.last;
    try { f.out.log(`[agentd] the update ${l.summary} — ${f.code}: ${f.more} more hello(s) since ${new Date(f.saidAt).toISOString()} (the last ${new Date(f.lastAt).toISOString()}) — one line for the repeats`); } catch { }
    if (f.out.onAct) { try { f.out.onAct({ ...l, at: f.lastAt, repeats: f.more, since: f.saidAt }); } catch { } }
  }
  f.more = 0; f.saidAt = f.out ? f.out.clock() : Date.now();
}
process.on('exit', () => { for (const s of HELLO_FOLDS.values()) for (const f of s.values()) { try { sayHello(f); } catch { } } });
/** lane hub-act-ask: the ask's facts an act's audit line carries (`ask`, `answeredBy`) — none when nothing was asked. */
const askFacts = (g) => (g && g.ask ? { ask: g.ask, ...(g.answeredBy ? { answeredBy: g.answeredBy } : {}) } : {});
const BY_UPGRADE = 'system:device-upgrade'; // the hub's version-drift rule pushes a new agent (no person, no agent asked)
const SIG = require('../agentd-signature.js'); // design q-042 D2: the release record a pushed bundle must carry
const DP = require('../device-policy.js'); // lane device-allow-flags: the device's OWN allow list — asked here first, decided there
const MA = require('../mutual-auth.js'); // lane lg-remote-hardening (B-7f0b, q-042 D3): the device proves its own key (PURE)
const { MIC_CAPABILITY } = require('../mic-model.js'); // lane stream-mic-road: the hello-ack word the microphone's op + m-line are gated on (PURE)
const { SOUND_CAPABILITY } = require('../sound-model.js'); // lane speaker-passthrough-v1: the hello-ack word the machine's sound (its track + `stream-audio`) is gated on (PURE)

// lane windows-device-fs — THE DOOR: a POSIX shell is never asked of a WINDOWS agent THAT HAS NONE. The hub ran `sh -c …`
// over the device link for the Files view, the home, path completion, the sweeps; a Windows machine without `sh` answered
// each one "command failed (127)" — a number nobody can act on (GET /api/files?host=<a Windows machine> answered exactly
// that). verify-r1 F1: the shell is the DEVICE'S FACT, not the platform's — Git for Windows / MSYS2 / Cygwin put `sh.exe` on
// PATH and those machines ran every one of these lines. The hello says which shells start there (`posixShells`); a shell
// that list leaves out is refused HERE, by name, before anything is sent (`windows_no_shell`). An agent too old to say is
// ASKED (today's behaviour) and a spawn that fails there is named afterwards (posixShellFailed). Callers that can do the job
// without a shell route around it (src/remote-fs.js).
const winShellOf = (info, cmd) => {
  if (!info || info.platform !== 'win32') return null;
  const base = String(cmd || '').split(/[\\/]/).pop().toLowerCase().replace(/\.exe$/, '');
  return /^(sh|bash|dash|zsh|ksh)$/.test(base) ? base : null;
};
function noShellError(base) {
  const e = new Error(`this needs a POSIX shell (${base}), and this Windows machine has none — not available on Windows machines without one yet`);
  e.code = 'windows_no_shell'; e.params = { shell: base }; // verify-r2: the client words it (zh / ja)
  return e;
}
function posixShellRefusal(info, cmd) {
  const base = winShellOf(info, cmd);
  if (!base || !Array.isArray(info.posixShells) || info.posixShells.includes(base)) return null; // the device has it, or cannot say ⇒ asked
  return noShellError(base);
}
/** a Windows agent was ASKED a shell (it has one, or is too old to say) and the spawn failed — named, not "(127)" */
function posixShellFailed(info, cmd, r) {
  const base = winShellOf(info, cmd);
  if (!base || !r) return null;
  return (r.spawnError && r.spawnError.code === 'ENOENT') || (r.code === 127 && /ENOENT/.test(String(r.error || ''))) ? noShellError(base) : null;
}

/** lane apple-signing r10: a throw of connect() marked `stage: 'connect'` (the error itself; a value that cannot take the mark — not an object,
 *  frozen — is wrapped, its code kept, as `cause`). Idempotent: connect()'s one exit marks it, and so does fsWriteStream's first line — whatever
 *  connect() is there (a subclass's, a suite's stand-in). r11: its twin `stage: 'gate'` — a refusal at the send point, before any channel opens
 *  (the capability gate, no `by`, the device's allow list judged here, the owner's Hub automation gate): marked where it is born, so a caller tells
 *  «never sent» by WHERE it was thrown, whatever its code — one the asker adds later included (src/server/desktop-webrtc.js). */
function stageMark(e, stage) {
  if (e && typeof e === 'object') { try { e.stage = stage; if (e.stage === stage) return e; } catch { /* frozen: wrapped below */ } }
  return Object.assign(new Error(String((e && e.message) || e || `${stage} failed`)), { ...(e && typeof e === 'object' && e.code ? { code: e.code } : {}), ...(e && typeof e === 'object' && typeof e.ask === 'string' ? { ask: e.ask } : {}), stage, cause: e });
}
const connectFailure = (e) => stageMark(e, 'connect');
const gateRefusal = (e) => stageMark(e, 'gate');

/** THE ERROR OF AN AGENT'S ERROR REPLY (`_request` rejects with it): its words, a lost link's code, an op refused by the
 *  device's own allow flags (code / flag / remedy), and the reason an op named for itself (`refused`, B-5e0d's quota-refresh). */
function replyError(m) {
  return Object.assign(new Error(m.error), typeof m.code === 'string' && /^discovery-/.test(m.code) ? { code: m.code } : {}, m.code === 'collector-stuck' ? { code: m.code, ...(m.state && typeof m.state === 'object' ? { state: m.state } : {}) } : {} /* r2974: the folder collector's refusal by name — the hub takes the release's road */, m.code === 'answer-too-large' ? { code: m.code, bytes: m.bytes, cap: m.cap, op: m.op, params: { op: m.op, size: AC.sizeOf(m.bytes), cap: AC.sizeOf(m.cap) } } : {}, m.linkLost ? { code: 'link_lost' } : {}, m.op === 'op-refused' ? { code: m.code, flag: m.flag, remedy: m.remedy } : {}, typeof m.refused === 'string' ? { refused: m.refused } : {});
}
/** B-5e0d: the quota-refresh op's own reason, by name (a reply or the error of one) — 'long-lived' | 'no-valid-login' | null */
const quotaReasonOf = (x) => (x && (x.refused === 'long-lived' || x.refused === 'no-valid-login') ? x.refused : null);

class DeviceManager {
  /**
   * @param {object} opts
   *  dataDir      server data/ (token hash store)
   *  bundlePath   built single-file daemon (data/bin/vibespace-agentd.js)
   *  version      release version (= daemonVersion expected)
   *  log          logger fn
   */
  constructor({ dataDir, bundlePath, version, nodeModules, transport, log = console.log, upgradeLedger = null, helloKey = null, onUpgradeStuck = null, onVersionMatch = null, onUpgradeBegin = null, onAnswer = null, onAct = null, onUpgradeRefused = null, onUpgradeTrusted = null, onPolicy = null, onElevated = null, onRuntime = null, machine = null, actGate = null, hub = '', devicePin = null, onDeviceKey = null, hubIdentity = null, deviceProofRequired = null, deviceJudged = null } = {}) {
    // lane lg-remote-hardening (D3 half b): THIS hub's identity (→ {privateKeyPem, publicKey}; throws `vault_locked` /
    // `hub_identity_lost` by name) — its public half rides every hello, its signature answers a device's nonce
    this._hubIdentity = typeof hubIdentity === 'function' ? hubIdentity : null;
    // lane lg-remote-hardening (D3): the device key THIS machine's record pins (→ raw base64 | null) and who hears a key
    // learned / refused (the record, the For-you watch, the row)
    this._devicePin = typeof devicePin === 'function' ? devicePin : null;
    this._onDeviceKey = typeof onDeviceKey === 'function' ? onDeviceKey : null;
    this._deviceProofRequired = typeof deviceProofRequired === 'function' ? deviceProofRequired : null; // unit 3's cure: the key was forgotten
    this._deviceJudged = typeof deviceJudged === 'function' ? deviceJudged : null; // unit 3's cure: is the device key judged on THIS road
    this._tokFile = path.join(dataDir, 'agentd-tokens.json');
    this._bundlePath = bundlePath;
    this._version = version;
    // lane mac-repair-retires-stale (B-06e9): THIS hub's id (dial-pairing.js hubId) — named in the hello of a DIALED device
    // only (a field an older daemon ignores); the daemon keeps it in its dial.json once the host token proved the hub
    this._hub = typeof hub === 'string' ? hub : '';
    // THE UPGRADE LEDGER (verify-r1 C1, 2026-09-28): the 2.330.0 loop breaker counted attempts ON THIS INSTANCE —
    // and the dial path builds a NEW DeviceManager for every fresh stream (the stale-stream guard), so a device
    // whose upgrade never moves its reported version re-dialed after every re-exec into a counter at 0: measured
    // 180 upgrades in 45 s (4 pushes of 1.6 MB a second, the daemon re-exec'ing each time) once the handshake ran
    // on every dial-in. A ledger OUTLIVES the instance (dial-pairing.js keeps one per device); `get(expected)` →
    // `{tries, gaveUp}` for THIS bundle version, `set(expected, {tries, gaveUp})` after every change.
    this._upgradeLedger = upgradeLedger;
    this._helloKey = typeof helloKey === 'string' && helloKey ? helloKey : null;   // B-0194: the update's refusals at the hello, per DEVICE (HELLO_FOLDS)
    // lane device-upgrade-stuck: THE door of a stuck / healed upgrade (the construction site binds the machine —
    // hosts.onAgentUpgrade → src/server/device-upgrade-watch.js). Pre-fix nothing ever assigned `_onUpgradeStuck`.
    this._onUpgradeStuck = typeof onUpgradeStuck === 'function' ? onUpgradeStuck : null;
    this._onVersionMatch = typeof onVersionMatch === 'function' ? onVersionMatch : null;
    // lane win-upgrade-pipe: an upgrade the hub STARTED and every hello (the device answered) — the same door, so a device
    // that never dials back after its re-exec reaches the user (src/server/device-upgrade-watch.js begun / answered)
    this._onUpgradeBegin = typeof onUpgradeBegin === 'function' ? onUpgradeBegin : null;
    this._onAnswer = typeof onAnswer === 'function' ? onAnswer : null;
    // lane device-act-audit: THE hub's audit door — every act / code op sent through THIS client is ONE line (src/device-acts.js
    // lineOf), handed to the construction site's writer (src/device-audit.js through hosts.deviceAudit; every `new DeviceManager`
    // passes one — scripts/test-device-acts.mjs census)
    this._onAct = typeof onAct === 'function' ? onAct : null;
    // B-c632: REPEATED REFUSALS FOLD (`_foldCount`) — `${op}\0${by}\0${summary}\0${argv hash}` → the open fold of one act's
    // refusals; `_clock` = the folds' time (a test injects one: the hour is never a loaded runner's gaps)
    this._folds = new Map(); this._foldSayMs = FOLD_SAY_MS; this._clock = Date.now;
    this._policyOps = new Set();   // B-2fa8: the ops with a fold of the list's own refusal open (an allowed check of another op computes no key)
    // lane device-bundle-signing (design q-042 D2): an upgrade this hub WILL NOT push (its build is not the signed release)
    // or one the DEVICE refused (its signature did not check) — the same door (device-upgrade-watch `refused`)
    this._onUpgradeRefused = typeof onUpgradeRefused === 'function' ? onUpgradeRefused : null;
    // fix r2 (verify-r1 RED-2): a device that trusted NO release key took the first validly signed one (TOFU) — said
    // through the same door (device-upgrade-watch `trusted`: an URGENT item naming the fingerprint)
    this._onUpgradeTrusted = typeof onUpgradeTrusted === 'function' ? onUpgradeTrusted : null;
    this._releaseCache = null;
    this._unsignedSaid = new Set();
    // lane device-allow-flags: the allow list each hello-ack states (src/device-policy.js reportOf) → the construction site
    // keeps it on the machine's record (the Machines card shows it); `machine` names the machine in a refusal's re-run sentence
    this._onPolicy = typeof onPolicy === 'function' ? onPolicy : null;
    this._onElevated = typeof onElevated === 'function' ? onElevated : null; // lane win-input-elevated: the daemon's OWN token elevation (hello-ack)
    this._onRuntime = typeof onRuntime === 'function' ? onRuntime : null; // lane device-node-version: the node the daemon runs on (hello-ack — src/device-runtime.js runtimeOf)
    this._machine = machine;
    // lane hub-act-ask: THE ASK's door — a REMOTE machine's client (hosts.js ssh, dial-pairing.js dial; never this machine's
    // own daemon: that is the hub) is built with the machine's gate (src/server/hub-act-ask.js over PURE src/hub-act-policy.js):
    // `check(payload, {consent})` → null | {ok: true, ask, answeredBy} | {ok: false, code, error, ask}; `verdict(payload)` sync
    this._actGate = actGate && typeof actGate.check === 'function' ? actGate : null;
    // The version a freshly-upgraded daemon will REPORT is the one baked into
    // the bundle we ship — not this server's package version. They diverge
    // whenever the repo is rebuilt without restarting the server (or vice
    // versa), and comparing against the wrong one makes the upgrade check
    // UNSATISFIABLE: every reconnect sees a mismatch and upgrades again,
    // forever (real incident 2026-08-13: ~8h of 10s-cycle re-installs, 20GB
    // RSS). Read it from the bundle, cached by mtime+size.
    this._bundleVerCache = null;
    this._nodeModules = nodeModules || null; // so the daemon can require node-pty (M1 localhost)
    this._log = log;
    this._root = process.env.VIBESPACE_AGENTD_ROOT || path.join(os.homedir(), '.vibespace', 'agentd');
    this._state = path.join(this._root, 'state');
    // the local daemon's socket (lane-pairing ④): its WITNESS (<root>/state/socket-path, what the daemon really
    // listens on) when it names a live socket, else THE rule (src/sock-path.js) — never the bare natural path,
    // which a long root puts over the platform's sun_path (the daemon then listens on a short rung)
    this._sockOverride = null;
    // Transport (M2): { kind:'local' } = unix socket on this machine; or
    // { kind:'ssh', host, remoteAgentd, sshArgs } = dial the STANDING remote
    // daemon over `ssh … -- node <remoteAgentd> --stdio` (the bridge). Default
    // local keeps M0/M1 unchanged.
    this._transport = transport || { kind: 'local' };
    this._conn = null;         // {mux, info}
    this._connecting = false;
    this._stopped = false;
    // reverse forwards (port → connectLocal fn) survive the connection object:
    // re-registered on every reconnect so device-side listeners self-heal
    this._reverseForwards = new Map();
    try { this._tokens = JSON.parse(fs.readFileSync(this._tokFile, 'utf-8')); } catch { this._tokens = {}; }
  }

  get _sock() {
    if (this._sockOverride) return this._sockOverride;
    if (process.platform === 'win32') return '\\\\.\\pipe\\vibespace-agentd-' + require('crypto').createHash('sha1').update(this._root).digest('hex').slice(0, 12);
    const SP = require('../sock-path.js');
    return SP.witnessOrRule({ root: this._root, platform: process.platform, tmpdir: os.tmpdir(), xdgRuntimeDir: process.env.XDG_RUNTIME_DIR || '', uid: typeof process.getuid === 'function' ? process.getuid() : null }).path
      || path.join(this._state, 'agentd.sock');
  }
  set _sock(v) { this._sockOverride = v || null; }

  /** B-24e2 follow-up (round wr3vak19m (1)): the link's state and the hello it holds — MEMORY ONLY (status() also evaluates the
   *  socket path's witness: a synchronous read and a stat on the loop) */
  isLinked() { return !!this._conn; }
  helloInfo() { return (this._conn && this._conn.info) || null; }

  status() {
    return {
      connected: !!this._conn,
      info: this._conn?.info || null,
      version: this._version,
      socket: this._sock,
    };
  }

  // ── token: vsht_ minted once for device #0; plaintext ONLY in the device's
  // 0600 state file (invariant #4), sha256 server-side ──
  _ensureLocalToken() {
    fs.mkdirSync(this._state, { recursive: true, mode: 0o700 });
    const devTok = path.join(this._state, 'token');
    let raw = null;
    try { raw = fs.readFileSync(devTok, 'utf-8').trim(); } catch { }
    // verify-r3: THE ONE DOOR of a pairing token (src/pairing-token.js) — the mint and the hash
    const PT = require('../pairing-token.js');
    if (!raw) {
      raw = PT.mintToken('host');
      fs.writeFileSync(devTok, raw, { mode: 0o600 });
    }
    const sha = PT.tokenHash(raw);
    if (this._tokens.local !== sha) {
      this._tokens.local = sha;
      try { fs.writeFileSync(this._tokFile, JSON.stringify(this._tokens, null, 2), { mode: 0o600 }); } catch { }
    }
    return raw;
  }

  // Version baked into the bundle we ship (what an upgraded daemon reports).
  // Falls back to our package version when the marker is unreadable.
  _expectedVersion() {
    try {
      const st = fs.statSync(this._bundlePath);
      const key = st.mtimeMs + ':' + st.size;
      if (this._bundleVerCache?.key === key) return this._bundleVerCache.v;
      // the WHOLE file: the marker (src/agentd/version.js, bundled) sits wherever esbuild puts that module —
      // measured at byte 1 076 247 of the 1.6 MB bundle, past the first 400 000 this once read (verify-r1 C1)
      const text = fs.readFileSync(this._bundlePath, 'utf-8');
      const m = /\bVERSION\s*:\s*"(\d+\.\d+\.\d+)"/.exec(text);
      const v = m ? m[1] : this._version;
      this._bundleVerCache = { key, v };
      return v;
    } catch { return this._version; }
  }

  /** THE RELEASE STATE of the bundle this hub would push (design q-042 D2): `{signed: true, manifest}` when the
   *  manifest beside it (data/bin/vibespace-agentd.manifest.json — written by the build only when the bytes ARE the signed
   *  release, scripts/agentd-release.mjs) names these exact bytes and this version; else `{signed: false, code:
   *  'unsigned-local-build', why}`. Cached by the bundle's and the manifest's mtime+size (the digest reads 5 MB). */
  _releaseState(bytes = null) {
    const mf = this._bundlePath ? this._bundlePath.replace(/\.js$/, '') + '.manifest.json' : null;
    try {
      const st = fs.statSync(this._bundlePath);
      let mk = 'none'; try { const m = fs.statSync(mf); mk = m.mtimeMs + ':' + m.size; } catch { }
      const key = st.mtimeMs + ':' + st.size + ':' + mk;
      if (!bytes && this._releaseCache?.key === key) return this._releaseCache.v;
      const sha256 = crypto.createHash('sha256').update(bytes || fs.readFileSync(this._bundlePath)).digest('hex');
      let manifest = null; try { manifest = JSON.parse(fs.readFileSync(mf, 'utf-8')); } catch { }
      const v = { ...SIG.manifestMatches(manifest, { sha256, version: this._expectedVersion() }), sha256 };
      this._releaseCache = { key, v };
      return v;
    } catch (e) { return { signed: false, code: 'unsigned-local-build', why: 'the agent bundle is unreadable (' + (e && e.code || 'error') + ')' }; }
  }
  /** The release state of a bundle on disk without a connection (fix r2): the ssh road (src/hosts.js installAgentd)
   *  ships exactly what the dial road would push — `{signed, manifest, sha256, version}` (version = the bundle's own). */
  static releaseOf(bundlePath, version) {
    const dm = Object.create(DeviceManager.prototype);
    Object.assign(dm, { _bundlePath: bundlePath, _version: version, _releaseCache: null, _bundleVerCache: null });
    return { ...dm._releaseState(), version: dm._expectedVersion() };
  }
  /** A device reported its FIRST trust in a release key (fix r2): it trusted none, and the bundle that just landed was
   *  validly signed by a self-consistent key set — the hub's door files the urgent item (the owner checks the fingerprint). */
  _trusted(done, from, to) {
    const ids = done && Array.isArray(done.tofu) ? done.tofu.filter((k) => typeof k === 'string' && /^[0-9a-f]{16}$/.test(k)).slice(0, 16) : [];
    if (!ids.length) return;
    this._log(`[agentd] daemon ${from} → ${to}: it trusted no release key and pinned ${ids.join(', ')} on first use`);
    try { this._onUpgradeTrusted?.(from, to, { keyIds: ids, by: BY_UPGRADE }); } catch { }
  }
  /** May this hub push its bundle to the daemon on the other end? A signed release: yes, to any. An unsigned local
   *  build: only to THIS machine's own daemon (the local proof); any other is told ONCE per version and keeps its agent. */
  _mayPush(from, to) {
    const rel = this._releaseState();
    if (rel.signed || this._transport.kind === 'local') return true;
    if (!this._unsignedSaid.has(to)) {
      this._unsignedSaid.add(to);
      this._log(`[agentd] daemon ${from} ≠ ${to} — NOT upgrading it: this hub's agent build is not the signed release (${rel.why}). The device keeps ${from} (capability-gated); sign the agent before a release (scripts/sign-agentd.mjs).`);
      try { this._onUpgradeRefused?.(from, to, { code: 'unsigned-local-build', why: rel.why, sha256: rel.sha256 || null, by: BY_UPGRADE }); } catch { }
    }
    return false;
  }
  /** The DEVICE refused the bundle (design q-042 D2 — its signature did not check): never pushed again for this version
   *  (the ledger gives up at once), and the hub's door files the urgent For-you item. Other failures keep the 3 tries. */
  _refused(e, from, to, led) {
    if (!e || !SIG.REFUSALS.includes(e.code)) return;
    led.tries = Math.max(3, led.tries); led.gaveUp = true; this._ledgerWrite(to, led);
    this._log(`[agentd] daemon ${from} REFUSED the upgrade to ${to} — ${e.code}${e.keyId ? ' (key ' + e.keyId + ')' : ''}: never pushing this bundle again`);
    try { this._onUpgradeRefused?.(from, to, { code: e.code, keyId: e.keyId || null, floor: e.floor || null, sha256: this._releaseState().sha256 || null, by: BY_UPGRADE }); } catch { }
  }
  /** The local proof (design q-042 D2): 32 random bytes written into the daemon's OWN state dir right before every upgrade
   *  of THIS machine's daemon — whoever writes that dir is this machine's user already; the daemon deletes it on any read. */
  _writeLocalProof() {
    const proof = crypto.randomBytes(32).toString('hex');
    const file = path.join(this._state, 'upgrade-proof'), tmp = file + '.' + process.pid + '.tmp';
    fs.mkdirSync(this._state, { recursive: true, mode: 0o700 });
    try { fs.unlinkSync(tmp); } catch { }
    fs.writeFileSync(tmp, proof, { mode: 0o600 });
    fs.renameSync(tmp, file);
    return proof;
  }

  /** The loop breaker's count for THIS bundle version: the ledger's when one is wired (survives a rebuilt instance),
   *  else this instance's own fields (the pre-ledger shape every other transport keeps). */
  _ledgerRead(expected) {
    if (this._upgradeLedger) { const r = this._upgradeLedger.get(expected); return { tries: Number(r && r.tries) || 0, gaveUp: !!(r && r.gaveUp) }; }
    return { tries: Number(this._upgradeTries) || 0, gaveUp: !!this._upgradeGaveUp };
  }
  _ledgerWrite(expected, { tries, gaveUp }) {
    this._upgradeTries = tries; this._upgradeGaveUp = gaveUp;
    if (this._upgradeLedger) { try { this._upgradeLedger.set(expected, { tries, gaveUp }); } catch { } }
  }

  // ── install: land the built bundle into <root>/<version>/ + repoint current ──
  installLocal() {
    if (!fs.existsSync(this._bundlePath)) throw new Error('agentd bundle missing: ' + this._bundlePath);
    const dir = path.join(this._root, this._version);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const dst = path.join(dir, 'agentd.js');
    fs.copyFileSync(this._bundlePath, dst);
    fs.chmodSync(dst, 0o700);
    const curTmp = path.join(this._root, '.current.tmp');
    try { fs.unlinkSync(curTmp); } catch { }
    fs.symlinkSync(dir, curTmp);
    fs.renameSync(curTmp, path.join(this._root, 'current'));
    return dst;
  }

  _spawnLocal() {
    const cur = path.join(this._root, 'current', 'agentd.js');
    if (!fs.existsSync(cur)) this.installLocal();
    // THE DAEMON IS BORN WITH THE SANITIZED ENV (src/agent-env.js, 2026-09-14):
    // it outlives every server restart by design, and `agentd.spawnEnv()`
    // merges each child over ITS environ — so a `{...process.env}` here handed
    // every cluster secret (the integration env family, the drive presets,
    // the login password…) to every pipe-session claude for as long as the
    // daemon lived, restarts and withdrawn defaults included. Measured on a
    // real CLI's /proc/<pid>/environ. `daemonEnv` keeps the two names the
    // daemon tier itself reads on top of the agent set.
    const child = spawn(process.execPath, [path.join(this._root, 'current', 'agentd.js')], {
      detached: true, stdio: 'ignore',
      // B-6be2: born without an ambient account selector too — a daemon child's env is the server's laid over
      // the daemon's OWN, so a name the server deleted would come back from here (src/harness-env.js).
      // r2224 (4): and without the HUB's inherited address — a pipe session's env is laid over this daemon's own, so a start with
      // Integration OFF (which hands none) would get back the address of a VibeSpace this hub was started inside; the daemon reads none
      env: { ...daemonEnv(process.env, { drop: require('../harness-env.js').agentCredentialEnvNames(require('../harnesses').list()).concat('VIBESPACE_API') }), ...(this._nodeModules ? { VIBESPACE_NODE_MODULES: this._nodeModules } : {}) },
    });
    // ckpt61 cure 2: its error listener at once — a start that fails (a full file table: EMFILE / ENFILE) returns with no pid and
    // its 'error' queued for the next tick; unheard, that is an uncaught exception and the hub ends. The failed start is said; the
    // connect loop's next try fails as a try and backs off as it does when the daemon is late
    child.on('error', (e) => { this._log(`[agentd] the local daemon could not be started: ${(e && e.code) || e}`); });
    child.unref();
    if (child.pid) this._log(`[agentd] spawned local daemon pid=${child.pid}`);
  }

  /** connect (spawning if needed) — resolves with {mux, info}; retries internally. Lane apple-signing r10: what it throws is marked
   *  `stage: 'connect'` HERE, at its one exit (every caller and every joiner awaits this promise) — a throw before any channel, whatever its code
   *  (a locked vault's `vault_locked` from the token function, `auth_failed`, «cannot reach the local daemon», «stopped»): a caller tells «never
   *  sent» by that shape, never by a message's words (the hub's signed-helper push spends no try on it — src/server/desktop-webrtc.js). */
  async connect() {
    if (this._conn) return this._conn;
    if (this._connecting) return this._connectPromise;
    this._connecting = true;
    this._connectPromise = this._connectLoop().catch((e) => { throw connectFailure(e); });
    try { return await this._connectPromise; }
    finally { this._connecting = false; }
  }

  async _connectLoop() {
    // lane vault-e2e-password-fix-r2: a remote transport's token may be a FUNCTION (the hub's vault entry, asked at every
    // connect — a LOCKED vault throws `vault_locked` here, by name, and no copy outlives the lock in this object)
    const tok = this._transport.hostToken;
    const token = this._transport.kind === 'local' ? this._ensureLocalToken() : (typeof tok === 'function' ? tok() : tok);
    const backoffs = [500, 1000, 2000, 5000];
    let clearedLocalPin = false;
    for (let attempt = 0; !this._stopped; attempt++) {
      let lastErr = null;
      const conn = await this._tryOnce(token).catch((e) => { lastErr = e; return null; });
      if (conn) return conn;
      // unit 5's cure (its reader's must 2): THIS box's own agent shares its root and token with an ssh road (a row that is this
      // box, or another hub that reaches this box over ssh) — that road pinned a hub key, and the local hello carries none (a
      // same-user socket proves nothing a pin could add). The hub owns this root: it clears that pin ONCE and asks again, said
      if (lastErr && this._transport.kind === 'local' && !this._hubIdentity && !clearedLocalPin && /^hub-key-(missing|mismatch)$/.test(String(lastErr.code || ''))) {
        clearedLocalPin = true;
        try { fs.unlinkSync(path.join(this._state, 'hub.pub')); } catch { }
        this._log('[agentd] this box\'s own agent pinned a hub key (an ssh road to this same box) — the local road carries none, so that pin is cleared and the agent is asked again');
        continue;
      }
      // lane-pairing ③: a DIALED device that refused OUR host key (its state/token came from another command) is not
      // helped by retrying the same key for a minute — say it now, so the machine row reads `auth-fail`
      if (this._transport.kind === 'stream' && lastErr && /auth failed/.test(String(lastErr.message))) throw lastErr;
      // lane lg-remote-hardening: a refusal BY NAME of what the device said is not helped by a retry on any road — said now (a
      // retry over the dead stream waited out the handshake timer 14 times and lost the name: «cannot reach the local daemon»)
      if (lastErr && TERMINAL_REFUSALS.has(lastErr.code)) throw lastErr;
      if (attempt === 0 && this._transport.kind === 'local') this._spawnLocal(); // local: bring the daemon up (ssh bridge self-spawns the remote one)
      const delay = backoffs[Math.min(attempt, backoffs.length - 1)];
      await new Promise((r) => setTimeout(r, delay));
      if (attempt > 12) throw new Error('agentd: cannot reach the local daemon');
    }
    throw new Error('stopped');
  }

  _openTransport() {
    if (this._transport.kind === 'stream') {
      // Transport B consumption: a device that DIALED IN. Its ws stream is
      // handed to us via getStream() (the server's agentdDials registry). A
      // single-use stream — if it's gone (device disconnected), throw so the
      // connect loop backs off and retries; the device's --dial reconnects and
      // a fresh stream appears.
      const s = this._transport.getStream?.();
      if (!s) throw new Error('dial device not connected');
      return s;
    }
    if (this._transport.kind === 'ssh') {
      const t = this._transport;
      const remoteCmd = t.remoteCmd || `node ${JSON.stringify(t.remoteAgentd)} --stdio`;
      // a service's env (lane spawn-env-census): ssh runs on an EMPTY env with a key file and needs SSH_AUTH_SOCK for an
      // agent-held key (measured, a private sshd on loopback) — never the hub's secrets (the remote side's env is its sshd's)
      const child = spawn(t.sshBin || 'ssh', [...t.sshArgs, '--', remoteCmd], {
        stdio: ['pipe', 'pipe', 'ignore'], env: serviceEnv(process.env, { keep: SSH_ENV_KEEP }), // = HostManager.sshEnv() (its argv comes from the transport)
      });
      // stdin/stdout errors arrive ASYNC as 'error' events on the pipe socket
      // itself — the write wrapper's try/catch only stops sync throws, so a
      // dying ssh child (heartbeat PING → write EPIPE on its stdin) was an
      // UNCAUGHT exception that took the whole server down (2.241.1, userN's
      // 10:34 exit-code-1: crashed 28s after boot during the reattach storm).
      // Swallow here; the 'close' event drives mux teardown + reconnect.
      // ckpt61 cure 2: an error listener BEFORE any pipe — a start that fails at once (a full file table) returns with no pipes and
      // its 'error' queued for the next tick; the try's own listener (`on('error')` below, attached by _tryOnce in this same turn)
      // answers it as a failed try (the loop backs off), and this one keeps it from ever being unheard. Every pipe read guarded
      child.on('error', () => {});
      child.stdin?.on('error', () => {});
      child.stdout?.on('error', () => {});
      // present the child as a duplex stream for the Mux (write→stdin, data←stdout)
      return {
        write: (d) => { try { return child.stdin ? child.stdin.write(d) : false; } catch { return false; } },
        on: (ev, fn) => {
          if (ev === 'data') child.stdout?.on('data', fn);
          else if (ev === 'close') { child.on('close', fn); child.stdout?.on('close', fn); }
          else if (ev === 'error') child.on('error', fn);
        },
        destroy: () => { try { child.kill(); } catch {} },
      };
    }
    return net.connect(this._sock);
  }

  _tryOnce(token) {
    return new Promise((resolve, reject) => {
      // D3 half b: the hub's identity for THIS hello, read BEFORE the transport opens (none ⇒ the old greeting). A LOCKED vault
      // refuses here, by name, as the host token does — never a plain hello a pinned device would read as an impostor
      let ident = null, identErr = null; try { ident = this._hubIdentity ? this._hubIdentity() : null; } catch (e) { identErr = e; }
      if (identErr && identErr.code === 'vault_locked') return reject(identErr);
      const sock = this._openTransport();
      let settled = false, keepStream = false;
      const fail = (e) => { if (!settled) { settled = true; if (!keepStream) { try { sock.destroy(); } catch { } } else { keptMuxOf.set(sock, mux); try { sock.removeListener?.('error', fail); } catch { } } reject(e || new Error('connect failed')); } };
      sock.on('error', fail);
      const timer = setTimeout(() => fail(new Error('handshake timeout')), 8000);
      // unit 4's cure r2: the Mux a refused handshake KEPT on this dialed stream (it answered the device's heartbeat) leaves
      // before the next one is made, so a stream carries ONE kept Mux however often it is asked again
      { const was = this._transport.kind === 'stream' ? keptMuxOf.get(sock) : null; if (was) { keptMuxOf.delete(sock); was.detach(); } }
      const nonceH = MA.newNonce({ crypto }); // lane lg-remote-hardening (D3): fresh per hello — a recorded answer proves nothing to the next
      const mux = new Mux(sock, {
        onControl: (msg) => {
          if (msg.op === 'hello-ack') {
            clearTimeout(timer);
            // lane lg-remote-hardening (D8a): a greeting of the wrong shape or size is refused BY NAME before any of it is used
            const shape = helloAckVerdict(msg);
            if (!shape.ok) {
              this._log(`[agentd] the device's greeting was refused — ${shape.why}`);
              // a dialed stream is KEPT, as on auth-fail (verify-r1 C2: closing it re-dials every second, each a hosts.json write)
              // unit 4's cure: the refused handshake's Mux stays ONLY to answer the device's heartbeat (its handlers end here,
              // so a second greeting in the same frame is never read); the next handshake on this stream takes its place, and
              // dial-pairing.js remembers the stream (no op re-greets on it for the interval)
              if (this._transport.kind === 'stream') { keepStream = true; mux.onControl = () => {}; }
              return fail(Object.assign(new Error(`the device's greeting was refused — ${shape.why}; update its agent, or rerun its install command on that machine`), { code: 'hello-ack-shape' }));
            }
            // lane lg-remote-hardening (D3): the device's key — learned at the first proof (the token admitted it), then
            // pinned: another key, a bad signature or no proof at all is refused BY NAME; an agent too old to prove anything
            // is not judged until its record holds a key (it works as today). A dialed stream is KEPT on a refusal, as on
            // auth-fail (verify-r1 C2: closing it re-dials every second)
            // unit 3's cure: ONE PIN, ONE ROAD — a machine upgraded to dial-out runs a second agent under its own root, with its own
            // key; its device key is judged on the DIAL road only (where a copied pairing is the threat), and its ssh road is
            // guarded by ssh's own host key check. A road not judged pins nothing and refuses nothing.
            let judged = true; try { judged = !this._deviceJudged || !!this._deviceJudged(); } catch { judged = true; }
            let pinnedKey = null; if (judged) { try { pinnedKey = this._devicePin ? this._devicePin() : null; } catch { pinnedKey = null; } }
            let required = false; if (judged) { try { required = !!(this._deviceProofRequired && this._deviceProofRequired()); } catch { required = false; } }
            const kv = judged ? MA.hubVerdict({ nonceH, ack: msg, pinned: pinnedKey == null ? null : pinnedKey, required }, { crypto }) : { ok: true, judged: false }; // a malformed pin refuses
            if (!kv.ok) {
              this._log(`[agentd] the device's key was refused — ${kv.why}`);
              try { this._onDeviceKey?.('refused', { code: kv.code, fp: MA.fingerprintOf(msg.devPub, { crypto }) }); } catch { }
              if (this._transport.kind === 'stream') { keepStream = true; mux.onControl = () => {}; } // the dial stream kept (as on auth-fail)
              return fail(Object.assign(new Error(`the device's key was refused — ${kv.why}`), { code: kv.code }));
            }
            if (kv.learn && kv.judged !== false) { try { this._onDeviceKey?.('learned', { pub: msg.devPub, fp: MA.fingerprintOf(msg.devPub, { crypto }) }); } catch { } }
            else if (pinnedKey) { try { this._onDeviceKey?.('proved', {}); } catch { } } // the pinned key proved: a refusal said on the row ends
            // D3 half b: a device that asked (its nonce) gets the hub's signature over ITS key and nonce FIRST — before any
            // update push (it is authed only after this ok); it says whether it already pins this hub (the record keeps it)
            if (ident && MA.isNonce(msg.nonceD)) {
              const sigH = MA.hubProof(ident, msg.devPub, msg.nonceD, { crypto });
              if (sigH) { mux.control({ op: 'ok', sigH }); try { this._onDeviceKey?.('hub-pinned', {}); } catch { } } // this ok is what pins it on the device
            }
            const expected = this._expectedVersion();
            try { this._onAnswer?.(msg.daemonVersion); } catch { }
            const pol = DP.reportOf(msg.policy); // lane device-allow-flags: null = an agent older than the list (it judges nothing)
            if (pol) { try { this._onPolicy?.(pol); } catch { } }
            if (typeof msg.elevated === 'boolean') { try { this._onElevated?.(msg.elevated); } catch { } } // lane win-input-elevated: absent on an old daemon ⇒ never called ⇒ the record stays not-elevated
            // lane device-node-version: the node it runs on (every daemon since M0 says `nodeVersion`; `openssl` / `nodeOwn` are
            // new — an older daemon's are null: not said). A daemon that says no node ⇒ the record's runtime is `unknown`, no chip
            try { this._onRuntime?.(require('../device-runtime.js').runtimeOf({ node: msg.nodeVersion, openssl: msg.openssl, own: msg.nodeOwn, platform: msg.platform })); } catch { }
            // LOOP BREAKER (2.330.0): an upgrade that does not change the
            // reported version can never converge — a daemon that fails to
            // install, a stale singleton that will not die, a host missing
            // node. Retry a bounded number of times, then KEEP THE LINK and
            // say so loudly. Capability gating already makes an older daemon
            // safe to talk to; spinning forever is not (it re-installed every
            // ~10s for 8h, drove RSS to 20GB and produced no error anywhere).
            const led = this._ledgerRead(expected);
            // lane hub-act-ask: the update is an act too (`code`) — and it NEVER holds this link (every op behind the hello would
            // wait on the owner): asked ⇒ the link opens on the agent as it is (capability-gated) and an Allow pushes the update
            // over it; refused ⇒ the agent stays as it is (one audit line), asked again at the next hello
            // int316: the owner is asked only about an update this hub WOULD push — the device's own list allows `upgrade`
            // (device-allow-flags) and this build is the signed release (device-bundle-signing: an unsigned one is never asked)
            const held = msg.daemonVersion !== expected && led.tries <= 2 && DP.allows(pol, 'upgrade') && fs.existsSync(this._bundlePath) && this._mayPush(msg.daemonVersion, expected) ? this._upgradeHeld(msg.daemonVersion) : null;
            if (msg.daemonVersion !== expected && led.tries > 2) {
              if (!led.gaveUp) {
                led.gaveUp = true; this._ledgerWrite(expected, led);
                this._log(`[agentd] daemon stays at ${msg.daemonVersion} after ${this._upgradeTries} upgrade attempts to ${expected} — GIVING UP and using it as-is (capability-gated). Fix the device install manually; no further attempts this connection.`);
                try { global.__vsEvent?.('agentd-upgrade-stuck', { detail: `${msg.daemonVersion}→${expected}` }); } catch { }
                try { this._onUpgradeStuck?.(msg.daemonVersion, expected, { platform: msg.platform, capabilities: msg.capabilities }); } catch { }
              }
            } else if (msg.daemonVersion !== expected && !DP.allows(pol, 'upgrade')) {
              // lane device-allow-flags: THIS machine's own list leaves `upgrade` off — no push (the device would refuse it
              // anyway); the link is kept as-is (capability-gated), said once per link, one refused line in the audit
              // B-0194: at every hello — said at once, then counted with the refusal's per-device fold (its journal line rides it)
              if (this._refusedLine({ op: 'upgrade', version: expected, from: msg.daemonVersion || undefined, by: BY_UPGRADE }, DP.verdict(pol, { op: 'upgrade' }, { machine: this._machineName(), platform: msg.platform }), null, { hello: true })) this._log(`[agentd] daemon ${msg.daemonVersion} ≠ ${expected} — its allow list leaves "upgrade" off; using it as-is (${DP.remedyOf({ machine: this._machineName(), allow: pol.allow, flag: 'upgrade', platform: msg.platform })})`);
            } else if (msg.daemonVersion !== expected && fs.existsSync(this._bundlePath) && this._mayPush(msg.daemonVersion, expected) && !held) {
              led.tries += 1; this._ledgerWrite(expected, led);
              this._helloFoldEnd({ op: 'upgrade', version: expected, from: msg.daemonVersion || undefined, by: BY_UPGRADE });   // B-0194: the update goes — its refusals' count said first
              // version drift → stream the new bundle (self-upgrade), then reconnect
              this._log(`[agentd] daemon ${msg.daemonVersion} ≠ ${expected} — upgrading (attempt ${led.tries}/3)`);
              try { this._onUpgradeBegin?.(msg.daemonVersion, expected, { platform: msg.platform }); } catch { }
              this._upgrade(mux, { from: msg.daemonVersion }).then((done) => {
                this._trusted(done, msg.daemonVersion, expected);
                settled = true;
                try { sock.destroy(); } catch { }
                setTimeout(() => resolve(this._connectLoop()), 700); // re-exec window
              }).catch((e) => { this._refused(e, msg.daemonVersion, expected, led); fail(e); });
              return;
            }
            if (msg.daemonVersion === expected) { this._ledgerWrite(expected, { tries: 0, gaveUp: false }); try { this._onVersionMatch?.(expected); } catch { } }
            mux.control({ op: 'ok' });
            settled = true;
            const sessions = new Map(); // chan → { onData, onExit }
            const pending = new Map();  // id → resolve (fs/discovery/cmd/tcp acks)
            this._conn = { mux, info: msg, sessions, pending, nextChan: 2, nextId: 1 };
            try { this._onDeviceKey?.('linked', {}); } catch { } // lane lg-remote-hardening: a link that opened clears an earlier key refusal on the card
            // route byte-channel data + session control to the session handlers.
            // A handler may set manualCredit and credit as it truly consumes
            // (backpressure for socket-piping consumers).
            mux.onData = (chan, buf) => {
              const s = sessions.get(chan);
              s?.onData?.(buf);
              if (!s?.manualCredit) mux.credit(chan, buf.length);
            };
            mux.onWritable = (chan) => { sessions.get(chan)?.onWritable?.(); };
            const prevControl = mux.onControl;
            mux.onControl = (m, bytes) => {
              if (m.op === 'line-refused') { this._lineRefused(m); return; }   // lane lg-remote-hardening (D8): a push the agent refused by name
              if (m.op === 'fs-result' || m.op === 'discovery-result' || m.op === 'discovery-watching' || m.op === 'usage-events-watching' || m.op === 'session-events-watching' || m.op === 'cmd-result' || m.op === 'probe-result' || m.op === 'secret-result' || m.op === 'quota-result' || m.op === 'sysinfo-result' || m.op === 'dir-collect-result' /* r1636 */ || m.op === 'dir-collect-end-result' /* r1633 */ || m.op === 'desktop-apps-list-result' || m.op === 'design-fs-result' || m.op === 'dial-status-result' || m.op === 'proc-list-result' || m.op === 'left-behind-result' /* B-69a7 */ || m.op === 'settings-merge-result' /* B-e7c0 */ || m.op === 'left-behind-end-result' /* B-69a7 (b) */ || m.op === 'opencode-serve-result' || m.op === 'browser-serve-result' || m.op === 'desktop-serve-result' || m.op === 'window-track-result' || m.op === 'window-untrack-result' || m.op === 'window-pin-result' || m.op === 'display-facts-result' || m.op === 'remoteapp-facts-result' || m.op === 'stream-offer-result' || m.op === 'stream-answer-result' || m.op === 'stream-stop-result' || m.op === 'stream-stats-result' || m.op === 'input-events-result' || m.op === 'stream-facts-result' || m.op === 'stream-windows-result' || m.op === 'settings-open-result' || m.op === 'desktop-grab-result' || m.op === 'desktop-input-result' || m.op === 'stream-mic-result' || m.op === 'stream-audio-result' || m.op === 'peer-post-result' || m.op === 'peer-state-result' || m.op === 'pool-orders-ok' || m.op === 'tcp-open' || m.op === 'listen-open' || m.op === 'serve-folder-result' || m.op === 'serve-socks-result' || m.op === 'op-refused') {
                const r = pending.get(m.id); if (r) { pending.delete(m.id); r(m, bytes); }
                if (m.op === 'tcp-open' && !m.error) return; // channel stays live
                return;
              }
              // reverse forward: the daemon accepted a device-local connection
              // on a listener we registered — pipe it to our local target
              if (m.op === 'tcp-accept') { this._onTcpAccept(m); return; }
              if (m.op === 'fs-done') { sessions.get(m.chan)?.onDone?.(m); return; }
              if (m.op === 'stream-start') { const r = pending.get(m.id); if (r) { pending.delete(m.id); r(m, bytes); } return; }
              // stream-exit rides the control channel and can OVERTAKE queued
              // stdout (same class as the fs-done truncation) — a handler that
              // sets onExitMsg keeps its registration and settles itself once
              // the counted bytes landed; legacy handlers keep the old delete.
              if (m.op === 'stream-exit') {
                const h = sessions.get(m.chan);
                if (h?.onExitMsg) { h.onExitMsg(m); return; }
                sessions.delete(m.chan); h?.onExit?.(m.code, m.error); return;
              }
              if (m.op === 'tcp-close') { const h = sessions.get(m.chan); sessions.delete(m.chan); try { mux.forget(m.chan); } catch { } h?.onClose?.(); return; }   // cs M1: the channel's send state goes with it
              if (m.op === 'discovery-dirty') { this._onDiscoveryDirty?.(); return; }
              if (m.op === 'usage-events') { this._onUsageEvents?.(m); return; }
              if (m.op === 'session-events') { this._onSessionEvents?.(m); return; } // step-2 dark stream (unsolicited push branch — the three-touch rule)
              if (m.op === 'window-rect') { this._windowWatches?.get(m.wid)?.push(m.result); return; } // lane machine-app-crop: a followed window's change (unsolicited push branch)
              if (m.op === 'pool-orders-executed') { this._onPoolOrdersExecuted?.(m.events || [], m.reportAck || null); return; }   // (r1225) no agent sends it today; if one does, its ack names its own report
              if (m.op === 'stream-ice' || m.op === 'stream-stats') { const f = this._streamWatches?.get(m.sid); if (m.ended) this._streamWatches?.delete(m.sid); try { f?.(m); } catch { } return; } // lane stream-p1a-transport: a stream session's candidates / numbers (unsolicited push branch)
              if (m.op === 'session-open' || m.op === 'pipe-session-open') { sessions.get(m.chan)?.onOpen?.(m); return; }
              if (m.op === 'session-exit') { const h = sessions.get(m.chan); sessions.delete(m.chan); h?.onExit?.(m.code); return; }
              if (m.op === 'session-error') { const h = sessions.get(m.chan); sessions.delete(m.chan); h?.onError?.(m.error); return; }
              prevControl(m);
            };
            mux.onDead = (why) => {
              if (/^control-line-too-large/.test(String(why || ''))) { try { this._log(`[agentd] ${this._machineName() || 'the machine'}: the link ended — ${String(why).slice(0, 200)}`); } catch { } }   // B-7f0b D8: said by name
              if (this._transport.kind === 'stream') keptMuxOf.set(sock, mux); // unit 4's cure r3: a dead link's Mux leaves the stream at the next handshake on it
              // Tear down local sockets we opened for reverse-forward accepts
              // (mirrors the daemon's own onDead). Without this, each accepted
              // /dav connection's socket + its listeners leak on every link
              // drop — the reconnect self-heal re-listens but never reconciles
              // the stale sockets (review finding, client.js:206).
              // ALSO fire onExit: pty/pipe session handles wire onExit, not
              // onClose — a daemon re-exec (self-upgrade) otherwise left the
              // server holding a silently-dead pty shim, so the detach-path
              // auto-reattach never ran and local terminals froze/blanked
              // until a page reload (real report, 3× in one evening).
              for (const s of sessions.values()) { try { s.onClose?.(); } catch { } try { s.onExit?.(-1); } catch { } }
              sessions.clear();
              // FAIL EVERY IN-FLIGHT REQUEST NOW (lane C2 fix, 2026-09-25): a
              // request already written to THIS mux can never be answered — a
              // re-dial is a NEW connection with its own pending map — yet each
              // one used to wait out its own timeoutMs (desktop-serve 60 s,
              // browser-serve 90 s) while the device was back in ~110 ms. The
              // reply shape carries `linkLost` so _request names it by code.
              for (const r of pending.values()) { try { r({ error: 'device link lost', linkLost: true }); } catch { } }
              pending.clear();
              this._conn = null;
              this._log('[agentd] connection lost');
            };
            resolve(this._conn);
            if (held === 'ask') this._askUpgrade(msg.daemonVersion, { mux, sock, platform: msg.platform }); // lane hub-act-ask
            // self-heal reverse forwards: re-own each registered device port
            for (const [port] of this._reverseForwards) {
              this._request({ op: 'tcp-listen', port }).catch(() => { });
            }
            // re-arm the discovery watch (R4: it also drives the push-
            // triggered usage harvest) — the daemon-side watch survives, but
            // a RESTARTED daemon starts unwatched; idempotent either way
            if (this._onDiscoveryDirty) this._request({ op: 'discovery-watch' }).catch(() => { });
            if (this._onUsageEvents) this._request({ op: 'usage-events-watch' }).catch(() => { });
            if (this._onSessionEvents) this._request({ op: 'session-events-watch' }).catch(() => { }); // session-brain step 2 re-arm
            for (const w of this._windowWatches?.values() || []) w.rearm(); // lane machine-app-crop: a followed window is followed again (and re-pinned)
            for (const sid of [...(this._streamWatches?.keys() || [])]) this._rearmStream(sid); // lane stream-p1a-transport: a stream outlives a link blip (its media never rode it) — this link owns its pushes again
            return;
          }
          if (msg.op === 'auth-fail') {
            // A DIALED device that refused our host key KEEPS ITS LINK (verify-r1 C2, 2026-09-28): destroying the
            // stream made the device re-dial every second forever (accept → hello → auth-fail → close → re-dial:
            // hosts.json rewritten and every client repainted each second, the row reading "offline — no dial
            // attempt has reached this server" 99 % of the time). The link stays up and unauthenticated — the
            // machine row reads `auth-fail`, every op on it is refused fast (dial-pairing.js remembers the
            // refused stream), and this mux stays alive only to answer the daemon's heartbeat.
            if (this._transport.kind === 'stream') { keepStream = true; mux.onControl = () => { }; }
            // D3 half b: the DEVICE refused this hub's key (another hub key, none, a bad signature) — by name, said on the card;
            // a hub that LOST its identity says so as itself (never a silent new key every machine then refuses)
            if (typeof msg.code === 'string' && /^hub-/.test(msg.code)) {
              const own = msg.code === 'hub-key-missing' && identErr;
              const code = own ? (identErr.code === 'hub_identity_lost' ? 'hub_identity_lost' : 'hub_identity_unavailable') : msg.code;
              try { this._onDeviceKey?.('refused', { code }); } catch { }
              const words = code === 'hub_identity_lost' ? `this hub lost its own key — the machine pins the hub it was paired with (${String(identErr.message || '').slice(0, 160)})`
                : code === 'hub_identity_unavailable' ? `this hub could not use its own key (${String((identErr && identErr.message) || '').slice(0, 160)}) — the machine pins it and waits for its proof`
                : `the machine refused this hub's key — ${String(msg.error || msg.code).slice(0, 200)}`;
              if (settled) { this._log(`[agentd] after the link opened, ${words}`); try { this._conn = null; } catch { } try { sock.destroy?.(); } catch { } return; } // a refusal of the signed ok arrives after the settle: the link goes, nothing is muted
              return fail(Object.assign(new Error(words), { code }));
            }
            fail(Object.assign(new Error('agentd auth failed — token mismatch'), { code: 'auth_failed' }));
          }
          if (msg.op === 'proto-mismatch') fail(new Error('agentd protocol mismatch'));
        },
        onDead: () => fail(new Error('connection died during handshake')),
      });
      const sayHello = () => mux.control({ op: 'hello', protoVersion: PROTO_VERSION, hostToken: token, serverVersion: this._version, nonceH, ...(ident && MA.isPub(ident.publicKey) ? { hubPub: ident.publicKey } : {}), ...(this._hub ? { hub: this._hub } : {}) });
      // ssh stdio + a dialed-in ws stream are already connected at open; a unix
      // socket needs its 'connect' event first.
      if (this._transport.kind === 'ssh' || this._transport.kind === 'stream') sayHello();
      else sock.on('connect', sayHello);
    });
  }

  async _upgrade(mux, { from = null, asked = null } = {}) {
    const bundle = fs.readFileSync(this._bundlePath);
    // lane device-act-audit: the `code` layer's ONE send — it carries its `by` (the version-drift rule) and is ONE audit line
    // (from → to, the size) whatever its end; the device records it in its own state/acts.log
    const req = { op: 'upgrade', version: this._expectedVersion(), size: bundle.length, from: from || undefined, by: BY_UPGRADE };
    const t0 = Date.now();
    const said = (ok, code) => this._act(req, { ok, code, ms: Date.now() - t0, ...askFacts(asked) });
    // THE HUB SHIPS NO UNSIGNED CODE (design q-042 D2): the release record rides the control line (`sig`) and the device
    // verifies it before anything points at the bytes; an unsigned local build reaches only THIS machine's own daemon,
    // with the single-use local proof (src/agentd/agentd.js landingVerdict)
    const rel = this._releaseState(bundle);
    if (!rel.signed && this._transport.kind !== 'local') { const e = new Error(`not upgrading: this hub's agent build is not the signed release — ${rel.why}`); e.code = 'unsigned-local-build'; throw e; }
    const proof = this._transport.kind === 'local' ? this._writeLocalProof() : null; // the hub's OWN daemon: always (it never depends on a pin)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { said(false, 'timeout'); reject(new Error('upgrade timeout')); }, 30000);
      const origOnControl = mux.onControl;
      mux.onControl = (msg, bytes) => {
        if (msg.op === 'upgrade-done') { clearTimeout(timer); mux.onControl = origOnControl; said(true, null); resolve(msg); }
        // lane device-upgrade-stuck: a daemon that could not LAND the bundle says so (≥ 2.369.203) — the attempt ends
        // now with the device's own reason, never a silent 30 s timeout
        else if (msg.op === 'upgrade-failed') { clearTimeout(timer); mux.onControl = origOnControl; said(false, msg.code || 'upgrade_failed'); const e = new Error('the device could not land the upgrade — ' + String(msg.error || '?').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 200)); if (typeof msg.code === 'string') e.code = msg.code.slice(0, 40); if (typeof msg.keyId === 'string') e.keyId = msg.keyId.replace(/[^0-9a-f]/g, '').slice(0, 16); if (typeof msg.floor === 'string' && SIG.VERSION_RE.test(msg.floor)) e.floor = msg.floor; reject(e); }
        else origOnControl(msg, bytes);   // the line's length rides on (the answer caps judge every answer, an upgrade's too)
      };
      // the version the daemon lands under and REPORTS after its re-exec (VIBESPACE_AGENTD_VERSION) is the
      // BUNDLE's own — the one `_expectedVersion()` compares against. Naming the package version here made a
      // rebuilt-without-restart server upgrade the same device on every natural restart (verify-r1 C1).
      mux.control({ ...req, ...(rel.signed ? { sig: rel.manifest } : {}), ...(proof ? { localProof: proof } : {}) });
      // stream on chan 1 in credit-sized slices (the mux queues past the window)
      for (let off = 0; off < bundle.length; off += 65536) {
        mux.data(1, bundle.subarray(off, Math.min(off + 65536, bundle.length)));
      }
    });
  }

  /**
   * Open a device-side session: the daemon spawns the pty and relays bytes.
   * Returns a handle { write(str), resize(cols,rows), kill(), onData, onExit,
   * ready } — onData/onExit are set by the caller before/after; ready resolves
   * with {pid} on session-open or rejects on session-error.
   */
  async openSession({ cmd, args, cols, rows, cwd, env, manualCredit = false }) {
    const conn = await this.connect();
    const noShell = posixShellRefusal(conn.info, cmd); if (noShell) throw noShell; // lane windows-device-fs: THE DOOR
    const noFlag = this._policyError(conn, { op: 'open-session' }, true); if (noFlag) throw noFlag; // lane device-allow-flags
    const chan = conn.nextChan++;
    const handle = { chan, onData: null, onExit: null };
    let resolveReady, rejectReady, readySettled = false;
    handle.ready = new Promise((res, rej) => {
      resolveReady = (v) => { readySettled = true; res(v); };
      rejectReady = (e) => { readySettled = true; rej(e); };
    });
    conn.sessions.set(chan, {
      // MANUAL CREDIT (opt-in — the dial bridge, 主开发 2026-11-17): the caller credits the device with handle.credit(n) as
      // its consumer truly takes the bytes, so a stalled reader leaves them on the device's side instead of in the hub
      manualCredit: manualCredit === true,
      onWritable: () => handle.onWritable?.(),
      onOpen: (m) => { handle.pid = m.pid; resolveReady({ pid: m.pid }); },
      onError: (e) => rejectReady(new Error(e)),
      onData: (buf) => handle.onData?.(buf),
      // Pre-ready link death (2.271.0 T1-6): reject `ready` so a terminal-on-
      // dial open that races a link drop fails visibly instead of hanging.
      onExit: (code) => { if (!readySettled) rejectReady(new Error('device link lost before session opened')); else handle.onExit?.(code); },
      onClose: () => { if (!readySettled) rejectReady(new Error('device link lost before session opened')); },
    });
    handle.write = (b) => conn.mux.data(chan, Buffer.isBuffer(b) ? b : Buffer.from(String(b), 'utf-8'));   // text or bytes; false = queued for the device's credit (onWritable follows)
    handle.credit = (n) => conn.mux.credit(chan, n);
    handle.resize = (c, r) => conn.mux.control({ op: 'resize-session', chan, cols: c, rows: r });
    handle.kill = () => conn.mux.control({ op: 'kill-session', chan });
    conn.mux.control({ op: 'open-session', chan, cmd, args, cols, rows, cwd, env });
    return handle;
  }

  /**
   * Open/attach a PERSISTENT pipe session (chat-class; keeper semantics — the
   * child is daemon-owned, setsid-detached, buffer-file backed). Reattach with
   * a byte offset; the {type:'_remote_exit'} sentinel line in the byte stream
   * means the child really ended. Omit cmd to attach-only.
   */
  async openPipeSession({ sid, cmd, args, cwd, env, offset = 0, manualCredit = false }) {
    const conn = await this.connect();
    const noShell = cmd === undefined ? null : posixShellRefusal(conn.info, cmd); if (noShell) throw noShell; // lane windows-device-fs: THE DOOR (an attach names no cmd)
    const noFlag = this._policyError(conn, { op: cmd === undefined ? 'attach-pipe-session' : 'open-pipe-session', sid }, true); if (noFlag) throw noFlag; // lane device-allow-flags
    const chan = conn.nextChan++;
    const handle = { chan, sid, onData: null, onExit: null };
    let resolveReady, rejectReady, readySettled = false;
    handle.ready = new Promise((res, rej) => {
      resolveReady = (v) => { readySettled = true; res(v); };
      rejectReady = (e) => { readySettled = true; rej(e); };
    });
    let drainThenClose = null;   // B-beaf: a detach waiting for the input this side still queues on the channel
    conn.sessions.set(chan, {
      manualCredit: manualCredit === true,   // opt-in, as openSession's (the dial bridge)
      onWritable: () => { if (drainThenClose) { const f = drainThenClose; drainThenClose = null; f(); return; } handle.onWritable?.(); },
      onOpen: (m) => { handle.pid = m.pid; resolveReady({ pid: m.pid, existing: !!m.existing, exited: m.exited }); },
      onError: (e) => rejectReady(new Error(e)),
      onData: (buf) => handle.onData?.(buf),
      // Pre-ready link death (2.271.0 T1-6, the pre-ready twin of the B-b87b
      // CRITICAL): mux.onDead fires onExit(-1)/onClose before the daemon's
      // open reply — if `ready` is still pending the bridge would `await` it
      // FOREVER and the dial chat/terminal window stayed blank with no error.
      // Reject ready when the link dies unsettled; else pass the real exit on.
      onExit: (code) => { if (!readySettled) rejectReady(new Error('device link lost before session opened')); else handle.onExit?.(code); },
      onClose: () => { if (!readySettled) rejectReady(new Error('device link lost before session opened')); },
    });
    handle.write = (b) => conn.mux.data(chan, Buffer.isBuffer(b) ? b : Buffer.from(String(b), 'utf-8'));   // text or bytes; false = queued for the device's credit (onWritable follows)
    handle.credit = (n) => conn.mux.credit(chan, n);
    handle.kill = () => conn.mux.control({ op: 'kill-pipe-session', sid });
    // B-beaf (3): this consumer is DONE with the channel (the dial bridge's attach client left). ONLY a daemon that says
    // `pipe-detach` can end its tail there: its words go nowhere from now, a pending `ready` is settled, and a CLOSE frame is
    // sent once the input this side still queues on the channel has gone out (a CLOSE overtaking it cut a stdin line in half),
    // then the routing and the channel are forgotten — `true`. An OLDER daemon keeps its tail: nothing is touched and the
    // answer is `false` — the caller takes its own road (the dial bridge's orphan: credited as it arrives, the release's; a
    // channel never credited again would queue that session's every later byte on the device)
    handle.canDetach = () => !!conn.info?.capabilities?.includes?.('pipe-detach');
    let detached = false;
    handle.detach = () => {
      if (!handle.canDetach()) return false;
      if (detached) return true;   // one CLOSE per channel
      detached = true;
      handle.onData = null; handle.onExit = null; handle.onWritable = null;
      if (!readySettled) { handle.ready.catch(() => { }); rejectReady(new Error('detached before the session opened')); }   // never an unhandled rejection in the hub
      const close = () => { conn.sessions.delete(chan); try { conn.mux.closeChan(chan); } catch { } try { conn.mux.forget(chan); } catch { } };
      if (conn.mux.queued(chan) > 0) drainThenClose = close; else close();
      return true;
    };
    conn.mux.control(cmd
      ? { op: 'open-pipe-session', chan, sid, cmd, args, cwd, env, offset }
      : { op: 'attach-pipe-session', chan, sid, offset });
    return handle;
  }

  /** lane device-act-audit: THE ONE SEND POINT. An act / code op (src/device-acts.js layers) carries WHO asked — `by`
   *  (`human:` / `agent:` / `job:` / `system:`) — or it is refused HERE, in-process, `act_without_by`, logged and NEVER sent;
   *  every act that IS sent is ONE audit line (op, by, summary, ok / code, the redacted output head, ms). `audit: false` =
   *  the caller writes the line itself (a stream's line is written at its end — `_streamOp`). */
  async _request(payload, { audit = true, consent = false, asked } = {}) {
    const act = DA.needsBy(payload);
    if (act && !DA.validBy(payload.by)) return this._refuseAct(payload);
    // lane hub-act-ask: THE ASK — an act is judged (and HELD while the owner is asked) BEFORE the send; a refusal throws, never
    // sent. `asked` = the caller judged it already (a stream's request, a write-stream's open)
    const facts = asked !== undefined ? asked : act && DA.auditable(payload) ? await this._gate(payload, { consent }) : null;
    const conn = await this.connect();
    const noFlag = this._policyError(conn, payload, true); if (noFlag) return Promise.reject(gateRefusal(noFlag)); // lane device-allow-flags: never travels (r11: marked so)
    const id = conn.nextId++;
    const line = audit && act && DA.auditable(payload);
    const t0 = Date.now();
    return new Promise((resolve, reject) => {
      conn.pending.set(id, (m, bytes) => {
        // lane lg-remote-hardening (B-7f0b D8): an answer over its op's cap (src/agentd/answer-caps.js — the largest its own code
        // can make) is refused BY NAME, the link kept — a runaway or malformed device never hands its caller more than that
        const cap = AC.capOf(payload.op, conn.info && conn.info.capabilities);   // B-5278: the lowered row for an agent saying producer-bounds
        if (Number(bytes) > cap) {
          if (line) this._act(payload, { ok: false, code: 'answer-too-large', ms: Date.now() - t0, ...askFacts(facts) });
          return reject(Object.assign(new Error(`${this._machineName() || 'the machine'}: its answer to ${payload.op} is ${AC.sizeOf(bytes)} — over the ${AC.sizeOf(cap)} this op may answer; refused (answer-too-large)`), { code: 'answer-too-large', op: payload.op, bytes: Number(bytes), cap, params: { op: payload.op, size: AC.sizeOf(bytes), cap: AC.sizeOf(cap) } }));
        }
        if (line) this._act(payload, { ...DA.answerOf(m), outHead: DA.outHeadOf(m), ms: Date.now() - t0, ...askFacts(facts) });
        return m.error ? reject(replyError(m)) : resolve(m);
      });
      // a request over the line's bound is never sent (the Mux refuses it by name: control-line-too-large) — the caller's refusal
      try { conn.mux.control({ ...payload, id }); } catch (e) {
        conn.pending.delete(id);
        if (line) this._act(payload, { ok: false, code: (e && e.code) || 'request-not-sent', ms: Date.now() - t0, ...askFacts(facts) });
        if (e && e.code === 'control-line-too-large' && !e.params) e.params = { op: payload.op, size: AC.sizeOf(e.bytes), cap: AC.sizeOf(e.cap) };   // r310 (3): worded by code on the page
        return reject(e && e.code ? e : Object.assign(new Error(`${payload.op}: not sent — ${(e && e.message) || e}`), { code: 'request-not-sent', op: payload.op }));
      }
      setTimeout(() => { if (conn.pending.delete(id)) { if (line) this._act(payload, { ok: false, code: 'timeout', ms: Date.now() - t0, ...askFacts(facts) }); reject(new Error(payload.op + ' timeout')); } }, payload.waitMs || payload.timeoutMs || 30000);
    });
  }
  /** lane lg-remote-hardening (B-7f0b D8): the agent refused one of its OWN pushes by name (over the line's bound) — said in the
   *  journal, once a push kind a minute (bounding the producer itself is row B-5278). Never throws. */
  _lineRefused(m) {
    try {
      const clean = (x, n) => String(x || '').replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, n);   // the device's own words: no control character, bounded
      const k = clean((m && m.of) || 'a push', 64), now = Date.now();
      if (!this._lineRefusedAt || this._lineRefusedAt.size > 32) this._lineRefusedAt = new Map();   // a device naming a new kind each time gets no growing memory
      if (now - (this._lineRefusedAt.get(k) || 0) < 60000) return;
      if (!this._lineRefusedMinute || now - this._lineRefusedMinute.at >= 60000) this._lineRefusedMinute = { at: now, n: 0 };
      if (++this._lineRefusedMinute.n > 5) return;   // at most five such lines a device a minute, whatever kinds it names
      this._lineRefusedAt.set(k, now);
      this._log(`[device] ${this._machineName() || 'the machine'} refused its own ${k} push: ${clean((m && m.error) || 'over the line', 240)}`);
    } catch { }
  }
  /** One audit line of an act sent through this client (never throws). */
  _act(payload, facts = {}) {
    if (!this._onAct) return;
    try { this._onAct(DA.lineOf({ at: Date.now(), payload, by: payload.by, ...facts })); } catch { /* the act's answer is the caller's; a writer's failure is the writer's */ }
  }
  /** lane device-allow-flags: the machine's name for a refusal's sentence (`machine` is a name or a getter). */
  _machineName() { try { const m = typeof this._machine === 'function' ? this._machine() : this._machine; return m ? String(m) : null; } catch { return null; } }
  /** lane device-allow-flags: THE hub half of the device's allow list — the verdict over the list its hello-ack stated
   *  (none stated = an older agent = not judged). → null, or the refusal as an Error {code:'op-not-allowed', flag, op,
   *  remedy, allow} whose message names the flag and THE re-run sentence; `line` = said in the journal + ONE audit line (a
   *  repeat of the same refusal counted in its fold, B-2fa8). */
  _policyError(conn, payload, line = false) {
    const info = (conn && conn.info) || {};
    const v = DP.verdict(DP.reportOf(info.policy), payload, { machine: this._machineName(), platform: info.platform });
    if (v.ok) { this._policyFoldEnd(payload); return null; }
    const e = Object.assign(new Error(DP.sentenceOf(v, { machine: this._machineName() })), { code: v.code, flag: v.flag, op: v.op, remedy: v.remedy, allow: v.allow });
    if (line) this._refusedLine(payload, v, e.message);
    return e;
  }
  /** One refused request: the journal line + ONE audit line (`op-not-allowed`, the re-run sentence as its head). B-2fa8: a repeat
   *  of the open fold's refusal (the same act, the same verdict — B-c632's key and say rules) is counted, not said. → true when said */
  _refusedLine(payload, v, sentence = null, { fold = true, hello = false } = {}) {
    let l = null;
    try { l = DA.lineOf({ at: this._clock(), payload, by: payload.by, ok: false, code: v.code, outHead: v.remedy || '' }); if (hello) { if (this._helloFold(l, { code: v.code })) return false; } else if (fold) { this._policyOps.add(l.op); if (this._foldCount(l, { code: v.code }, argvIdOf(payload))) return false; } } catch { }
    try { this._log(`[device-policy] REFUSED ${DA.keyOf(payload)} — ${sentence || DP.sentenceOf(v, { machine: this._machineName() })}`); } catch { }
    if (this._onAct && l) { try { this._onAct(l); } catch { } }
    return true;
  }
  /** B-2fa8: the device's own list ALLOWS this request now — an open fold of its refusal is said and closed (the allowed interval
   *  is a change: a later refusal is said at once). Only a fold of the list's own verdict: _gate's folds are the gate's. */
  _policyFoldEnd(payload) {
    if (!this._policyOps.size || !this._folds.size) return;
    try {
      const op = DA.keyOf(payload); if (!this._policyOps.has(op)) return;   // the cheap test first: an op with no such fold open costs no summary, no hash
      const k = this._foldKey(op, DA.validBy(payload.by) ? payload.by : null, DA.summaryOf(payload), argvIdOf(payload)), f = this._folds.get(k);
      if (f && f.code === 'op-not-allowed') this._foldEnd(k);
      if (![...this._folds.values()].some((x) => x.code === 'op-not-allowed' && x.last && x.last.op === op)) this._policyOps.delete(op);
    } catch { }
  }
  /** lane device-allow-flags: would the machine's own list refuse this request? (a caller that must not START a chain —
   *  a session's setup — asks before its first act). → null | the refusal Error (said + ONE audit line, a repeat folded; nothing sent). */
  async refusalOf(payload) { const conn = await this.connect(); return this._policyError(conn, payload, true); }
  /** lane device-allow-flags: the allow list the connected agent states (null = none stated / not connected). */
  policy() { return DP.reportOf(this._conn && this._conn.info && this._conn.info.policy); }
  /** lane hub-act-ask: THE ASK at the ONE send point — the machine's 「Hub 自动化」 list judges an act by an agent / job / system
   *  (src/server/hub-act-ask.js): it goes (null), it is HELD while the owner is asked (≤ 60 s; one card per machine per kind)
   *  and goes with the answer's facts, or it is refused by name — ONE audit line (`ask`: never / quiet / denied / expired /
   *  unfiled), NEVER sent. A gate that throws refuses (fail closed). */
  async _gate(payload, { consent = false } = {}) {
    if (!this._actGate) return null;
    // int316: the device's OWN allow list (device-allow-flags) is judged BEFORE the owner is asked — a card never asks about
    // an act the device would refuse (the list the live link stated; no link yet ⇒ the send point's own check after connect)
    const noFlag = this._conn ? this._policyError(this._conn, payload, true) : null; if (noFlag) throw gateRefusal(noFlag);
    let g = null;
    try { g = await this._actGate.check(payload, { consent }); }
    catch (e) { g = { ok: false, code: 'hub_act_denied', error: `this act could not be judged (${String(e && e.message).slice(0, 120)}) — nothing was done`, ask: 'error' }; }
    if (!g || g.ok) { if (this._folds.size) this._foldEnd(this._foldKey(DA.keyOf(payload), DA.validBy(payload.by) ? payload.by : null, DA.summaryOf(payload), argvIdOf(payload))); return g || null; }
    const l = DA.lineOf({ at: this._clock(), payload, by: payload.by, ok: false, code: g.code, ask: g.ask, answeredBy: g.answeredBy });
    if (!this._foldCount(l, g, argvIdOf(payload))) {   // B-c632: a repeat of the open fold's refusal is counted, not said
      try { this._log(`[device-acts] NOT SENT ${l.op} by ${l.by} — ${g.code}: ${l.summary}`); } catch { }
      if (this._onAct) { try { this._onAct(l); } catch { } }
    }
    throw Object.assign(new Error(g.error || g.code), { code: g.code, ...(typeof g.ask === 'string' ? { ask: g.ask } : {}), stage: 'gate' }); // lane apple-signing r10: + the asker's own word (never / denied / expired / unfiled / quiet / standing / error); r11: + WHERE — refused at the send point, nothing sent, whatever the code
  }
  /** B-c632: REPEATED REFUSALS FOLD. Under a hub-own hold every stream start (1/min) was refused `ask_standing` with a journal
   *  line AND an audit line each — 1 440 of each a day, nothing tried. A refusal of an act (op, by, summary) whose verdict
   *  (code, ask, who answered) equals its open fold's is a REPEAT: counted, nothing said. The fold is said — ONE journal line and ONE audit line
   *  (`repeats`: how many, `since`: WHEN the line before them was said) — when the subject's verdict changes, when one of its acts goes,
   *  every `_foldSayMs` while repeats keep coming (one line an hour, a timer of its own), at stop() and at the process's exit.
   *  The first refusal is said at once, as before. ONLY IDENTICAL ACTS FOLD (r1's must): the subject is the act itself —
   *  op, by, its summary AND a hash of its whole argv (another command of the same agent is its own line, never hidden in a
   *  count — however long); the verdict carries who answered (a person's Deny is its own line; the stored Deny's repeats fold).
   *  A fold with nothing owed whose last refusal is older than `_foldSayMs` is STALE: the next one is said at once, as a first.
   *  A stopped client folds nothing. → true when `l` was a repeat. */
  _foldKey(op, by, summary = '', argv = '') { return `${op}\0${by || ''}\0${summary || ''}\0${argv || ''}`; }
  _foldCount(l, g, argv = '') {
    if (this._stopped) return false;
    const k = this._foldKey(l.op, l.by, l.summary, argv), v = `${g.code}\0${g.ask || ''}\0${g.answeredBy || ''}`, f = this._folds.get(k);
    if (f && f.v === v && !(f.more === 0 && l.at - f.lastAt >= this._foldSayMs)) {
      f.more++; f.lastAt = l.at; f.last = l;
      this._folds.delete(k); this._folds.set(k, f);   // the oldest fold out is the least recently refused (FOLDS_MAX)
      _OPEN_FOLDS.add(this);   // a count to say at exit — only while one is owed
      if (l.at - f.saidAt >= this._foldSayMs) this._foldSay(k);
      else if (!f.timer) { f.timer = setTimeout(() => { f.timer = null; this._foldSay(k); }, this._foldSayMs - (l.at - f.saidAt)); if (f.timer.unref) f.timer.unref(); }
      return true;
    }
    if (f) this._foldEnd(k);   // the verdict changed: what the old one counted is said first
    this._folds.set(k, { v, code: g.code, last: l, more: 0, saidAt: l.at, lastAt: l.at, timer: null });
    if (this._folds.size > FOLDS_MAX) this._foldEnd(this._folds.keys().next().value);
    return false;
  }
  _foldSay(k) {
    const f = this._folds.get(k);
    if (!f) return;
    if (f.timer) { clearTimeout(f.timer); f.timer = null; }
    if (f.more > 0) {
      const l = f.last;
      try { this._log(`${f.code === 'op-not-allowed' ? `[device-policy] REFUSED ${l.op}` : `[device-acts] NOT SENT ${l.op} by ${l.by}`} — ${f.code}: ${f.more} more time(s) since ${new Date(f.saidAt).toISOString()} (the last ${new Date(f.lastAt).toISOString()}) — one line for the repeats: ${l.summary}`); } catch { }
      if (this._onAct) { try { this._onAct({ ...l, at: f.lastAt, repeats: f.more, since: f.saidAt }); } catch { } }
    }
    f.more = 0; f.saidAt = this._clock();   // the next line counts from THIS line's time (never from a repeat it covered)
    if (![...this._folds.values()].some((x) => x.more > 0)) _OPEN_FOLDS.delete(this);
  }
  _foldEnd(k) { if (!this._folds.has(k)) return; this._foldSay(k); this._folds.delete(k); }
  /** B-0194: THE UPDATE REFUSED AT EACH HELLO. A remote machine gets ONE hello per DeviceManager and every re-dial / reconnect
   *  builds a fresh one, so these refusals fold in the device's store (HELLO_FOLDS, by `helloKey`) — B-c632's rules: the first
   *  said at once, the repeats counted, said on a change of verdict, when the update goes, hourly (a timer of the record's own,
   *  unref'd — the count is said even when the hellos stop), at unpair and at exit. No key ⇒ this instance's own folds. → true
   *  when a repeat */
  _helloGenNow() { return this._helloKey ? (HELLO_GEN.get(this._helloKey) || 0) : 0; }
  _helloStore(make = true, gen = this._helloGenNow()) {   // its key's store — only at the generation the hello began in (a drop since: nothing made, nothing read)
    if (!this._helloKey || this._helloGenNow() !== gen) return null;
    let s = HELLO_FOLDS.get(this._helloKey); if (!s && make) HELLO_FOLDS.set(this._helloKey, (s = new Map())); return s || null;
  }
  _helloFold(l, g, gen) {   // gen: the generation its hello began in (an ask's answer lands later); none ⇒ now
    const s = this._helloStore(true, gen);   // a client stopped by a re-dial still folds into its device's store (its twin joined the same ask)
    if (!s) return this._helloKey ? false : this._foldCount(l, g);   // an answer to an ask begun before a drop: said, never folded
    const k = this._foldKey(l.op, l.by, l.summary), v = `${g.code}\0${g.ask || ''}\0${g.answeredBy || ''}`, f = s.get(k);
    const out = { log: this._log, onAct: this._onAct, clock: this._clock };   // the writers, never the client (a stopped one is not kept alive)
    if (f && f.v === v && !(f.more === 0 && l.at - f.lastAt >= this._foldSayMs)) {
      f.more++; f.lastAt = l.at; f.last = l; f.out = out;
      if (l.at - f.saidAt >= this._foldSayMs) sayHello(f); else this._helloArm(f, this._foldSayMs - (l.at - f.saidAt));
      return true;
    }
    if (f) sayHello(f);   // the verdict changed: what the old one counted is said first
    s.delete(k); s.set(k, { v, code: g.code, last: l, more: 0, saidAt: l.at, lastAt: l.at, out, timer: null });
    if (s.size > HELLO_FOLDS_MAX) { const [ok, of] = s.entries().next().value; sayHello(of); s.delete(ok); }   // the oldest said, then evicted
    return false;
  }
  /** the record's own hourly say (unref'd): the count is said even when no hello comes again */
  _helloArm(f, ms) { if (f.timer) return; f.timer = setTimeout(() => { f.timer = null; sayHello(f); }, Math.max(0, ms)); if (f.timer.unref) f.timer.unref(); }
  /** B-0194: the update goes (pushed at the hello, or allowed by the owner) — its refusals' count said first, the record closed */
  _helloFoldEnd(req, gen) {
    const k = this._foldKey(DA.keyOf(req), req.by, DA.summaryOf(req)), s = this._helloStore(false, gen);
    if (!this._helloKey) { this._foldEnd(k); return; }
    if (!s) return;
    const f = s.get(k); if (f) { sayHello(f); s.delete(k); }
  }
  /** B-0194: a device unpaired — what its store owes is said, then the store goes */
  static dropHelloFolds(key) { HELLO_GEN.set(key, (HELLO_GEN.get(key) || 0) + 1); const s = HELLO_FOLDS.get(key); if (!s) return; for (const f of s.values()) { try { sayHello(f); } catch { } } HELLO_FOLDS.delete(key); }   // the generation bumped first: no answer to an older ask makes it again
  /** (a suite's look at a device's store) */
  static helloFoldsOf(key) { return HELLO_FOLDS.get(key) || null; }
  _foldEndAll() { for (const k of [...this._folds.keys()]) this._foldEnd(k); }
  /** lane hub-act-ask: the hello's update verdict (sync) → null (push it now) | 'ask' | 'deny' (said once, the agent kept). */
  _upgradeHeld(from) {
    if (!this._actGate || typeof this._actGate.verdict !== 'function') return null;
    const req = { op: 'upgrade', version: this._expectedVersion(), from: from || undefined, by: BY_UPGRADE };
    let v = null;
    try { v = this._actGate.verdict(req); } catch { v = { verdict: 'deny', code: 'hub_act_denied', reason: 'error' }; }
    if (!v || v.verdict === 'allow') return null;
    if (v.verdict === 'ask') return 'ask';
    const code = v.code || 'hub_act_denied', ask = v.reason === 'nobody' ? 'never' : v.reason === 'quiet' ? 'quiet' : 'denied';
    let l = null;
    try { l = DA.lineOf({ at: this._clock(), payload: req, by: req.by, ok: false, code, ask }); if (this._helloFold(l, { code, ask })) return 'deny'; } catch { }   // B-0194: a repeat at a later hello — counted (per device), nothing said
    if (this._onAct && l) { try { this._onAct(l); } catch { } }
    this._log(`[agentd] daemon ${from} ≠ ${req.version} — the update is not allowed on this machine (${code}); using it as-is`);
    return 'deny';
  }
  /** lane hub-act-ask: the owner is asked about the update while the link runs on the agent as it is; an Allow pushes it over
   *  THIS link (the daemon takes `upgrade` any time after hello), then the link is dropped and dialed again (the re-exec). */
  _askUpgrade(from, { mux, sock, platform } = {}) {
    const expected = this._expectedVersion(), gen0 = this._helloGenNow();   // the generation this ask began in (its answer lands later)
    const req = { op: 'upgrade', version: expected, from: from || undefined, by: BY_UPGRADE };
    // B-0194: while the standing item refuses this update (its fold open, not stale) a hello's ask is a repeat — no «waits» line
    const k = this._foldKey(DA.keyOf(req), req.by, DA.summaryOf(req)), hs = this._helloStore(false), open = this._helloKey ? (hs ? hs.get(k) : null) : this._folds.get(k);
    if (!(open && open.code === 'ask_standing' && this._clock() - open.lastAt < this._foldSayMs)) this._log(`[agentd] daemon ${from} ≠ ${expected} — the update waits for the owner's answer (For you)`);
    Promise.resolve(this._actGate.check(req)).then((g) => {
      if (g && !g.ok) {
        let l = null;
        try { l = DA.lineOf({ at: this._clock(), payload: req, by: req.by, ok: false, code: g.code, ask: g.ask, answeredBy: g.answeredBy }); if (this._helloFold(l, g, gen0)) return; } catch { }   // B-0194: refused again at a later hello — counted (per device)
        if (this._onAct && l) { try { this._onAct(l); } catch { } }
        this._log(`[agentd] the update to ${expected} was not allowed (${g.code}) — the agent stays at ${from}`); return;
      }
      this._helloFoldEnd(req, gen0);   // B-0194: allowed — its refusals' count said first
      if (!this._conn || this._conn.mux !== mux) { this._log('[agentd] the update was allowed but its link is gone — the next hello asks again'); return; }
      const led = this._ledgerRead(expected); led.tries += 1; this._ledgerWrite(expected, led);
      try { this._onUpgradeBegin?.(from, expected, { platform }); } catch { }
      return this._upgrade(mux, { from, asked: g }).then((done) => {
        this._trusted(done, from, expected); // int316: device-bundle-signing's first-trust door, as at hello
        try { sock.destroy(); } catch { }
        setTimeout(() => { this.connect().catch(() => { }); }, 700); // the re-exec window, as at hello
      }, (e) => { this._refused(e, from, expected, led); throw e; }); // int316: a signature the device refused gives up at once, as at hello
    }).catch((e) => this._log(`[agentd] the allowed update did not land: ${e && e.message}`));
  }
  /** An act without a `by`: refused in-process, said in the journal and the audit, never sent. */
  _refuseAct(payload) {
    const l = DA.lineOf({ at: Date.now(), payload, by: null, ok: false, code: 'act_without_by' });
    try { this._log(`[device-acts] REFUSED ${l.op} with no "by" (who asked) — never sent: ${l.summary}`); } catch { }
    if (this._onAct) { try { this._onAct(l); } catch { } }
    return Promise.reject(Object.assign(new Error(`act_without_by: ${l.op} was not sent — the hub names who asked for every act on a device`), { code: 'act_without_by', stage: 'gate' })); // r11: marked where it is born — never sent
  }

  /** Kill a daemon pipe session by sid without attaching (the dial-chat
   *  terminate path — SIGTERM→SIGKILL escalation happens daemon-side). */
  async killPipeSession(sid) {
    const conn = await this.connect();
    conn.mux.control({ op: 'kill-pipe-session', sid });
  }

  // ── M3 ──
  fsStat(p) { return this._request({ op: 'fs-op', action: 'stat', path: p }); }
  fsList(p) { return this._request({ op: 'fs-op', action: 'list', path: p }); }
  // lane device-act-audit: every write / rename / mkdir / rm names who asked (`{by}` — the ONE send point refuses it without)
  fsWrite(p, buf, { by } = {}) {
    // B-7f0b D8: a file whose request would be over the device link's line is refused BEFORE it is encoded (its base64 alone
    // is 4/3 of the file in memory, and past ~384 MiB that string cannot be made at all) — the file's size and the largest
    // one this request may carry, by name (control-line-too-large, as the Mux's own refusal)
    const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
    const room = AC.LINE_MAX - Buffer.byteLength(JSON.stringify({ op: 'fs-op', action: 'write', path: p, data64: '', by, id: 2 ** 31 }) + '\n');
    const most = Math.max(0, Math.floor(room / 4) * 3);
    if (b.length > most) return Promise.reject(Object.assign(new Error(`${this._machineName() || 'the machine'}: a write of ${AC.sizeOf(b.length)} is over the ${AC.sizeOf(most)} one request to it may carry — not sent (control-line-too-large)`), { code: 'control-line-too-large', op: 'fs-op', bytes: b.length, cap: most, params: { op: 'fs-op', size: AC.sizeOf(b.length), cap: AC.sizeOf(most) } }));
    return this._request({ op: 'fs-op', action: 'write', path: p, data64: b.toString('base64'), by });
  }
  fsRename(p, to, { by } = {}) { return this._request({ op: 'fs-op', action: 'rename', path: p, to, by }); }
  fsMkdir(p, { by } = {}) { return this._request({ op: 'fs-op', action: 'mkdir', path: p, by }); }
  fsRm(p, recursive = false, { by } = {}) { return this._request({ op: 'fs-op', action: 'rm', path: p, recursive, by }); }
  /** lane windows-device-fs: the Files view's ops WITHOUT a shell (`fs-portable`; `~` expanded by the device) — what a
   *  Windows agent does with its own fs. Capability-gated: an older agent is never asked an op it lacks (it would hang). */
  async _fsPortable(payload, waitMs) {
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('fs-portable')) { const e = new Error('daemon lacks fs-portable (capabilities gate) -- upgrade the agent on this machine'); e.code = 'host_needs_daemon'; throw e; }
    return this._request({ op: 'fs-op', ...payload, ...(waitMs ? { waitMs } : {}) });
  }
  fsHome() { return this._fsPortable({ action: 'home', path: '~' }); }
  fsCopy(p, to, { by } = {}) { return this._fsPortable({ action: 'copy', path: p, to, by }, 130000); }
  fsMove(p, to, { by } = {}) { return this._fsPortable({ action: 'move', path: p, to, by }, 130000); }
  fsDu(p) { return this._fsPortable({ action: 'du', path: p }, 70000); }
  /** read [start, start+len) — resolves a Buffer (the transcript-slab primitive).
   *  COUNT-GATED: fs-done rides the credit-EXEMPT control channel, so it can
   *  OVERTAKE data still queued daemon-side behind the 256KB credit window —
   *  resolving on fs-done alone truncated every read past the in-flight window
   *  to exactly INITIAL_WINDOW bytes (real incident: a 45MB remote transcript
   *  cached as a 256KB prefix and stamped complete = permanently ancient chat
   *  history). Resolve only once the expected byte count (ack.sending,
   *  adjusted down by fs-done's `sent` if the file shrank mid-read) has
   *  actually arrived; a 30s data stall rejects so callers can fall back.
   *  lane exit-transfer — THE SINK FORM (`{sink}`): every piece goes to `sink(buf)` as it arrives and nothing is kept;
   *  a sink that returns a promise (the file write) is CREDITED back only once it settles — the device then sends no
   *  faster than the disk takes the bytes (in flight ≤ the link's 256 KiB window, the tcp-forward rule) →
   *  `{size, sent, sha256}`; `{sha256: true}` asks the device for the hash of the bytes it sent (an older daemon ignores
   *  the flag ⇒ `sha256: null`). */
  async fsReadRange(p, start, len, { sink = null, sha256 = false } = {}) {
    const conn = await this.connect();
    const chan = conn.nextChan++;
    const chunks = [];
    // NOTE: mux frames dispatch SYNCHRONOUSLY in one socket-read burst, so for
    // a big read the burst is [ack, ~window of data, fs-done] and the awaited
    // ack's continuation (a microtask) runs only AFTER fs-done was handled —
    // never derive the target from "bytes seen at done time".
    let received = 0, sending = null, sentDone = null, doneSeen = false, legacy = false, stall = null, doneSha = null;
    let resolveP, rejectP;
    const donePromise = new Promise((res, rej) => { resolveP = res; rejectP = rej; });
    donePromise.catch(() => {}); // a stall while still awaiting the ack must not be an unhandled rejection
    const cleanup = () => { clearTimeout(stall); conn.sessions.delete(chan); };
    const bumpStall = () => { clearTimeout(stall); stall = setTimeout(() => { cleanup(); rejectP(new Error('read-range stalled')); }, 30000); };
    const maybeFinish = () => {
      if (!doneSeen) return;
      const t = sentDone != null ? (sending != null ? Math.min(sentDone, sending) : sentDone) : sending;
      if (t != null ? received >= t : legacy) { cleanup(); resolveP(); }
    };
    conn.sessions.set(chan, {
      manualCredit: !!sink,
      onData: (b) => {
        if (sink) {
          let done;
          try { done = sink(b); } catch (e) { cleanup(); rejectP(e); return; }
          Promise.resolve(done).then(() => { try { conn.mux.credit(chan, b.length); } catch { } }, (e) => { cleanup(); rejectP(e); });
        } else chunks.push(b);
        received += b.length; bumpStall(); maybeFinish();
      },
      onDone: (m) => { doneSeen = true; if (typeof m?.sent === 'number') sentDone = m.sent; if (typeof m?.sha256 === 'string' && /^[0-9a-f]{64}$/.test(m.sha256)) doneSha = m.sha256; maybeFinish(); },
    });
    bumpStall();
    const ack = await this._request({ op: 'fs-op', action: 'read-range', path: p, start, len, chan, ...(sha256 ? { sha256: true } : {}) });
    if (ack?.error) { cleanup(); throw new Error(ack.error); }
    if (typeof ack?.sending === 'number') sending = ack.sending;
    else legacy = true; // ancient daemon without counts: resolve on fs-done like before
    maybeFinish();
    await donePromise;
    if (sink) return { size: ack.size, sent: received, sha256: doneSha };
    return { size: ack.size, data: Buffer.concat(chunks) };
  }
  /** lane exit-transfer — an agent's PUSH: `source` (a Readable: the CLI's request body) streamed onto the device's
   *  `write-stream` (`fs-write-stream`; an older agent is NEVER asked — it would hang — `host_needs_daemon` by name):
   *  open ⇒ `<path>.vs-part` made new; the bytes on a byte channel under the window (the source PAUSED while the window
   *  is full); `end` with the count and the sha256 THIS side computed ⇒ the device compares both, renames, answers.
   *  `size` is announced up front: more or fewer bytes is a failure, never a short file. `check()` is asked every
   *  window (8 MiB) — a throw (the grant revoked, the caller gone) aborts. Any failure removes the part. → `{size, sha256}`. */
  async fsWriteStream(p, { source, size, overwrite = false, check = null, windowBytes = 8 * 1024 * 1024, by, consent = false } = {}) {
    let conn; try { conn = await this.connect(); } catch (e) { throw connectFailure(e); } // lane apple-signing r10: before any channel — `stage: 'connect'`
    if (!conn.info?.capabilities?.includes?.('fs-write-stream')) { const e = new Error('daemon lacks fs-write-stream (capabilities gate) -- upgrade the agent on this machine'); e.code = 'host_needs_daemon'; throw gateRefusal(e); }
    if (!DA.validBy(by)) return this._refuseAct({ op: 'fs-op', action: 'write-stream', step: 'open', path: p, size }); // lane device-act-audit: before the channel opens (after the capability gate — §74)
    const asked = await this._gate({ op: 'fs-op', action: 'write-stream', step: 'open', path: p, size, overwrite: !!overwrite, by }, { consent }); // lane hub-act-ask: before the channel opens (a refusal sends nothing, not even an abort)
    const chan = conn.nextChan++;
    const crypto = require('crypto');
    const contentHash = crypto.createHash('sha256'); // the bytes of a file (the device compares it at `end`)
    let sent = 0, nextCheck = windowBytes, waitW = null;
    conn.sessions.set(chan, { onWritable: () => { const f = waitW; waitW = null; f?.(); } });
    const linkGone = () => this._stopped || this._conn !== conn;
    const abort = async () => { if (linkGone()) return; try { await this._request({ op: 'fs-op', action: 'write-stream', step: 'abort', path: p, chan, waitMs: 15000, by }); } catch { } }; // a dropped link: the agent removes the part itself
    try {
      await this._request({ op: 'fs-op', action: 'write-stream', step: 'open', path: p, chan, size, overwrite: !!overwrite, waitMs: 20000, by }, { asked });
      // never destroyOnReturn: a refusal mid-body must still answer the HTTP request the body arrived on
      const it = typeof source.iterator === 'function' ? source.iterator({ destroyOnReturn: false }) : source;
      for await (const piece of it) {
        const b = Buffer.isBuffer(piece) ? piece : Buffer.from(piece);
        sent += b.length;
        if (sent > size) throw Object.assign(new Error(`more than the ${size} bytes announced arrived`), { code: 'size_changed' });
        contentHash.update(b);
        for (let o = 0; o < b.length; o += 65536) {
          if (!conn.mux.data(chan, b.subarray(o, Math.min(o + 65536, b.length)))) {
            // the window is full: wait for the device's credit (the dead-link belt: a link that never answers fails)
            await new Promise((res, rej) => {
              const t0 = Date.now();
              const iv = setInterval(() => {
                const why = linkGone() ? 'the link to the machine dropped' : Date.now() - t0 > 60000 ? 'the machine stopped taking bytes for 60 s' : null;
                if (why) { clearInterval(iv); waitW = null; rej(Object.assign(new Error(why), { code: 'stalled' })); }
              }, 250);
              waitW = () => { clearInterval(iv); res(); };
            });
          }
        }
        if (linkGone()) throw Object.assign(new Error('the link to the machine dropped'), { code: 'stalled' });
        if (sent >= nextCheck) { nextCheck += windowBytes; if (check) await check(sent); }
      }
      if (sent !== size) throw Object.assign(new Error(`${sent} bytes arrived of the ${size} announced`), { code: 'size_changed' });
      if (check) await check(sent);
      if (linkGone()) throw Object.assign(new Error('the link to the machine dropped'), { code: 'stalled' }); // lane apple-signing r10: the end goes on the link the bytes went on, or not at all — never a redial's connect() after the bytes (its throw is `stage: 'connect'`, a «never sent» shape; these bytes went)
      const r = await this._request({ op: 'fs-op', action: 'write-stream', step: 'end', path: p, chan, sent, sha256: contentHash.digest('hex'), waitMs: 120000, by });
      return { size: r.size, sha256: r.sha256 };
    } catch (e) { await abort(); throw e; }
    finally { conn.sessions.delete(chan); }
  }
  async discoverySnapshot() {
    const r = await this._request({ op: 'discovery-snapshot' });
    this._saidDiscoLeft(r);
    return r;
  }
  // B-5278 unit 2 (find 1): what the device's list left out (the folders past its bound) is said ONCE for this machine (this
  // DeviceManager's life), on either road — the snapshot's and the claims'
  _saidDiscoLeft(r) {
    // B-5278 unit 2, part 3: the lock files and open codex rollouts past their bounds, each said ONCE too
    const L = (r && r.left) || {}, nl = Number(L.locks) || 0, nc = Number(L.codexOpen) || 0;
    if (nl > 0 && !this._discoLocksLeftSaid) { this._discoLocksLeftSaid = true; try { this._log(`[discovery] ${this._machineName() || 'the machine'}: ${nl} running-session lock file(s) left out of its list (more than 1000 live, or one over 64 KiB)`); } catch { } }
    if (nc > 0 && !this._discoCodexLeftSaid) { this._discoCodexLeftSaid = true; try { this._log(`[discovery] ${this._machineName() || 'the machine'}: ${nc} open codex rollout(s) left out of its list (more than 1000)`); } catch { } }
    const n = r && r.left && Number(r.left.folders);
    if (n > 0 && !this._discoLeftSaid) { this._discoLeftSaid = true; try { this._log(`[discovery] ${this._machineName() || 'the machine'}: ${n} of its project folders left out of its list (it has more than its bound; the most recently changed are listed)`); } catch { } }
  }
  /** R5 `discovery.v2` (DARK): the device interprets its OWN snapshot into
   *  session cards with the shared functions — the server's job shrinks to
   *  cross-machine merging. Capability-gated (unknown ops hang old daemons). */
  async discoveryClaims({ hostId, hostName, forceInline } = {}) {
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('discovery-claims')) throw new Error('daemon lacks discovery-claims (capabilities gate)');
    const r = await this._request({ op: 'discovery-claims', hostId, hostName, forceInline, timeoutMs: 40000 });
    this._saidDiscoLeft(r);
    return r;
  }
  async watchDiscovery(onDirty) { this._onDiscoveryDirty = onDirty; return this._request({ op: 'discovery-watch' }); }

  /** Subscribe the usage-events PUSH stream (R4 finale). onBatch({batch, seq})
   *  fires per chunk; when a chunk carries `seq`, call ackUsageEvents(seq)
   *  AFTER durable ingest — that commits the device-side cursor (two-phase;
   *  an unacked batch re-emits and the server's rid dedup absorbs it). */
  async watchUsageEvents(onBatch) {
    this._onUsageEvents = onBatch;
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('usage-events')) throw new Error('daemon lacks usage-events (capabilities gate)');
    const r = await this._request({ op: 'usage-events-watch', timeoutMs: 20000 });
    if (r?.error) throw new Error(r.error); // an error-ack resolves — never swallow it
    return true;
  }
  /** Push a pool's sealed orders (ranked member snapshot) to the device;
   *  null clears. onExecuted(events) receives fallback switches the device
   *  performed while no orchestrator was reachable — call ackPoolOrdersLog()
   *  after recording them. */
  async poolOrders(orders, onExecuted, { by } = {}) {
    if (onExecuted) this._onPoolOrdersExecuted = onExecuted;
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('pool-orders')) throw new Error('daemon lacks pool-orders (capabilities gate)');
    const r = await this._request({ op: 'pool-orders', orders, timeoutMs: 15000, by });
    if (r?.error) throw new Error(r.error);
    // B-5278 (the last piece, r1135): what the report could not carry is said once — records not written (eventsDropped), records
    // waiting past its head for the next report (eventsMore, eventsCut), torn lines (eventsTorn); a report with any of them but no
    // record is acked too, so the agent removes exactly what it answered
    const nD = Number(r?.eventsDropped) || 0, nM = Number(r?.eventsMore) || 0, nT = Number(r?.eventsTorn) || 0;
    if (nD > 0 || nM > 0 || nT > 0 || r?.eventsCut) this._saidLeftOnce('pool', [nD > 0 ? `${nD} switch record(s) were not written (more than 2000, or 1 MiB)` : '', nM > 0 || r?.eventsCut ? `${nM > 0 ? nM + ' record(s)' : 'records'} wait past the head of the pool's report for its next read` : '', nT > 0 ? `${nT} torn line(s) left out` : ''].filter(Boolean).join('; '));
    // (r1155) the reply's own token rides to the ack: the device removes exactly what THIS reply answered
    if ((r?.events?.length || nD > 0 || nT > 0) && this._onPoolOrdersExecuted) this._onPoolOrdersExecuted(r.events || [], r?.reportAck || null);
    return r?.events || [];
  }
  ackPoolOrdersLog(report = null) { try { this._conn?.mux?.control({ op: 'pool-orders-log-ack', ...(report && typeof report === 'object' ? { report } : {}) }); } catch { } }   // (r1155) names the report it acks

  ackUsageEvents(seq) {
    try { this._conn?.mux?.control({ op: 'usage-events-ack', seq }); } catch { }
  }
  // ── M4 ──
  /** R1 machine facts (shared src/machine-probes.js runs daemon-side).
   *  Old daemons don't know these ops — callers bound with a timeout and
   *  fall back to the legacy ssh scripts. */
  probeCli(helper = null, { level = false, version = null } = {}) { return this._request({ op: 'probe-cli', timeoutMs: 9000, ...(helper ? { helper } : {}), ...(level ? { level: true, ...(version ? { version } : {}) } : {}) }); }   // B-77ed: a start's cwd and own file; B-24e2: `level` — an older agent ignores it (no new op)
  probeCreds() { return this._request({ op: 'probe-creds', timeoutMs: 9000 }).then((r) => { const n = Number(r && r.facts && r.facts.hostSubsLeft) || 0; if (n > 0) this._saidLeftOnce('subs', `${n} held login folder(s) left out of its accounts answer (more than 500)`); return r; }); }
  // B-5278 unit 2, the last piece: what a bounded producer left out is said ONCE a kind for this machine (this DeviceManager's life)
  _saidLeftOnce(kind, words) { if (!this._leftSaid) this._leftSaid = new Set(); if (this._leftSaid.has(kind)) return; this._leftSaid.add(kind); try { this._log(`[bounds] ${this._machineName() || 'the machine'}: ${words}`); } catch { } }
  /** R3 transcript.* — run one transcript-service method ON the device and
   *  return the parsed JSON result. The result streams on a byte channel with
   *  the read-range count-gating contract (never resolve on the done marker:
   *  control overtakes data, 2.187.0). DARK: no production consumer yet — the
   *  parity suite is the only caller until the switchover round. */
  async transcriptOp(method, ref, params = {}, info = null) {   // B-9a2e: `info` (optional) gets the ack's `unhanded` — the ids the read consulted with nothing handed
    const conn = await this.connect();
    const chan = conn.nextChan++;
    const chunks = [];
    let received = 0, sending = null, sentDone = null, doneSeen = false, stall = null;
    let resolveP, rejectP;
    const donePromise = new Promise((res, rej) => { resolveP = res; rejectP = rej; });
    donePromise.catch(() => {});
    const cleanup = () => { clearTimeout(stall); conn.sessions.delete(chan); };
    const bumpStall = () => { clearTimeout(stall); stall = setTimeout(() => { cleanup(); rejectP(new Error('transcript-op stalled')); }, 30000); };
    const maybeFinish = () => {
      if (!doneSeen) return;
      const t = sentDone != null ? (sending != null ? Math.min(sentDone, sending) : sentDone) : sending;
      if (t != null && received >= t) { cleanup(); resolveP(); }
    };
    conn.sessions.set(chan, {
      onData: (b) => { chunks.push(b); received += b.length; bumpStall(); maybeFinish(); },
      onDone: (m) => { doneSeen = true; if (typeof m?.sent === 'number') sentDone = m.sent; maybeFinish(); },
    });
    bumpStall();
    // parse can legitimately take a while on a huge transcript — generous ack timeout
    const ack = await this._request({ op: 'transcript-op', method, ref, params, chan, timeoutMs: 60000 });
    if (ack?.error) { cleanup(); throw new Error(ack.error); }
    if (typeof ack?.sending === 'number') sending = ack.sending;
    else { cleanup(); throw new Error('daemon lacks transcript-op counts'); }
    if (info && typeof info === 'object') info.unhanded = Array.isArray(ack.unhanded) ? ack.unhanded.filter((x) => typeof x === 'string').slice(0, 16) : [];
    maybeFinish();
    await donePromise;
    return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
  }
  /** `waitMs` (lane-pairing ⑥): how long THIS side waits for the reply — the daemon kills the child at `timeoutMs`
   *  (capped at 30 s there) and still has to send the result, so a caller that uses the cap itself waits past it. */
  async runCmd(cmd, args = [], { stdin, env, timeoutMs, waitMs, by, consent = false } = {}) {
    if (!DA.validBy(by)) return this._refuseAct({ op: 'run-cmd', cmd, args }); // lane device-act-audit: refused before the link is even asked
    const { info } = await this.connect();
    const noShell = posixShellRefusal(info, cmd); if (noShell) throw noShell; // lane windows-device-fs: THE DOOR (the device's fact)
    const r = await this._request({ op: 'run-cmd', cmd, args, env, timeoutMs, ...(waitMs ? { waitMs } : {}), stdin64: stdin ? Buffer.from(stdin).toString('base64') : undefined, by }, { consent });
    const failed = posixShellFailed(info, cmd, r); if (failed) throw failed; // verify-r1 F1: asked, and it was not there ⇒ named
    return r;
  }
  /** lane-exit-run-output E1: a SHELL LINE run under the interpreter the DEVICE has (cmd.exe on Windows, sh elsewhere —
   *  PURE src/exit-shell.js decides THERE); the reply carries `interpreter`, and `spawnError` when the child never
   *  started. Capability-gated (`run-shell` in the hello-ack): an older daemon only knows the argv form — the caller
   *  falls back to `sh -lc` itself and says which it ran; a daemon is never asked an op it lacks (it would hang). */
  async runShell(line, { env, timeoutMs, waitMs, by, consent = false } = {}) {
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('run-shell')) { const e = new Error('daemon lacks run-shell (capabilities gate) -- upgrade the agent on this machine'); e.code = 'host_needs_daemon'; throw e; }
    if (!DA.validBy(by)) return this._refuseAct({ op: 'run-cmd', shell: String(line) }); // lane device-act-audit: after the capability gate (an old agent's refusal stays its own)
    return this._request({ op: 'run-cmd', shell: String(line), env, timeoutMs, ...(waitMs ? { waitMs } : {}), by }, { consent });
  }
  /** streaming argv exec: stdout arrives via onData (byte channel); resolves
   *  {code} at exit. For outputs too large for runCmd (usage-scan NDJSON).
   *  COUNT-GATED like fsReadRange: a NEW daemon's stream-exit carries `sent`
   *  (total stdout bytes) — the resolve holds until that many arrived, so the
   *  credit-gated tail can't be overtaken and silently dropped (truncated
   *  usage harvests / streamed downloads). Old daemons omit it → resolve at
   *  exit as before. A 15s post-exit stall resolves {truncated:true}. */
  async runStream(cmd, args = [], { env, cwd, stdin, onData, timeoutMs, by } = {}) {
    if (!DA.validBy(by)) return this._refuseAct({ op: 'run-stream', cmd, args, cwd });
    const { info } = await this.connect();
    const noShell = posixShellRefusal(info, cmd); if (noShell) throw noShell; // lane windows-device-fs: THE DOOR (the device's fact)
    const r = await this._streamOp({ op: 'run-stream', cmd, args, env, cwd, stdin64: stdin ? Buffer.from(stdin).toString('base64') : undefined, by }, { onData, timeoutMs });
    const failed = posixShellFailed(info, cmd, r); if (failed) throw failed; // verify-r1 F1: asked, and it was not there ⇒ named
    return r;
  }
  /** ONE streaming-op consumer (run-stream + usage-scan): count-gated settle
   *  (stream-exit's `sent` vs received), link-death settles, deadline belt. */
  async _streamOp(req, { onData, timeoutMs = 120000, consent = false } = {}) {
    // lane device-act-audit: an act stream (run-stream) names who asked BEFORE its channel opens, and is ONE audit line at
    // its END (the exit code, the first bytes of its output — redacted —, the whole duration)
    if (DA.needsBy(req) && !DA.validBy(req.by)) return this._refuseAct(req);
    const asked = DA.auditable(req) ? await this._gate(req, { consent }) : null; // lane hub-act-ask: THE ASK, before the channel opens
    const line = DA.auditable(req), t0 = Date.now();
    let head = [], headLen = 0;
    const conn = await this.connect();
    const noFlag = this._policyError(conn, req, true); if (noFlag) throw gateRefusal(noFlag); // lane device-allow-flags: before the channel opens
    const chan = conn.nextChan++;
    let exitR;
    const done = new Promise((r) => { exitR = r; });
    let received = 0, exitMsg = null, stall = null, settled = false;
    const settle = (extra) => {
      if (settled) return; settled = true;
      clearTimeout(stall); conn.sessions.delete(chan);
      const res = { code: exitMsg?.code, error: exitMsg?.error, ...(extra || {}) };
      if (line) this._act(req, { ...DA.answerOf(res), outHead: DA.outHeadOf({ stdout: Buffer.concat(head).toString('utf8') }), ms: Date.now() - t0, ...askFacts(asked) });
      head = [];
      exitR(res);
    };
    const check = () => {
      if (!exitMsg) return;
      if (typeof exitMsg.sent !== 'number' || received >= exitMsg.sent) return settle();
      clearTimeout(stall); stall = setTimeout(() => settle({ truncated: true }), 15000);
    };
    conn.sessions.set(chan, {
      onData: (b) => { received += b.length; if (line && headLen < 2048) { head.push(b.subarray(0, 2048 - headLen)); headLen += Math.min(b.length, 2048 - headLen); } onData?.(b); check(); },
      onExitMsg: (m) => { exitMsg = m; check(); },
      // Link death mid-stream (2.271.0 T1-5): mux.onDead fires onClose/onExit —
      // WITHOUT these the `done` promise NEVER settled, so a single device flap
      // during a usage harvest hung hosts.harvestUsage forever and pinned
      // _harvestBusy true for every host until a server restart.
      onClose: () => settle({ error: 'device link lost' }),
      onExit: () => settle({ error: 'device link lost' }),
    });
    // Overall deadline belt: even absent a clean onClose/onExit (a wedged
    // half-open link that never errors), never leave the caller hanging.
    // `timeoutMs` (default 120 s, every pre-C2 caller): a caller that runs something LONG (the desktop install rung —
    // apt on a small VM) names its own; `timedOut` tells a deadline apart from a real exit (the child is NOT killed —
    // the belt only stops waiting).
    const deadline = setTimeout(() => settle({ error: 'run-stream timed out', timedOut: true }), timeoutMs);
    if (deadline.unref) deadline.unref();
    done.finally?.(() => clearTimeout(deadline));
    let ack;
    try { ack = await this._request({ ...req, chan }, { audit: false, asked }); }
    catch (e) { settled = true; clearTimeout(deadline); conn.sessions.delete(chan); if (line) this._act(req, { ok: false, code: (e && e.code) || 'error', ms: Date.now() - t0, ...askFacts(asked) }); throw e; }
    if (ack.error) { settled = true; clearTimeout(deadline); conn.sessions.delete(chan); clearTimeout(stall); if (line) this._act(req, { ok: false, code: ack.code || 'error', ms: Date.now() - t0, ...askFacts(asked) }); throw new Error(ack.error); }
    return done;
  }
  /** R4 `usage.scan`: run the daemon's BUNDLED ledger walker (no per-harvest
   *  script ship) — returns {ndjson, cursors, cursorFile}. The device does
   *  NOT persist the cursor; the caller commits it (fsWrite+fsRename) only
   *  after this resolves, i.e. after the full transfer landed (two-phase).
   *  Old daemons never answer unknown ops (they'd hang the request), so gate
   *  on the hello's daemonVersion and throw fast → caller falls back. */
  /** Place a secret file (0600, atomic) on the device — THE sanctioned secret
   *  channel; capability-gated so old daemons fall back to fsWrite+chmod. */
  async placeSecret(remotePath, buf, { by } = {}) {
    if (!DA.validBy(by)) return this._refuseAct({ op: 'place-secret', path: remotePath });
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('place-secret')) throw new Error('daemon lacks place-secret (capabilities gate)');
    const r = await this._request({ op: 'place-secret', path: remotePath, data: Buffer.from(buf).toString('base64'), timeoutMs: 15000, by });
    if (r.error) throw new Error(r.error);
    return r.path;
  }

  /** Human-gated quota refresh executed ON the device (its own token, its own
   *  IP — design §Quota refresh origin). Never called from any scheduler. */
  async watchSessionEvents(cb) {
    // Session-brain step 2: subscribe to the daemon's device-side normalizer
    // stream (dark — the caller compares, it must NOT act on these yet).
    this._onSessionEvents = cb;
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('session-events')) throw new Error('daemon lacks session-events (capabilities gate)');
    await this._request({ op: 'session-events-watch' });
  }

  /** lane-pairing ③ (THREE-TOUCH): the device's own record of its dial outcomes (state/dial-status.json).
   *  Capability-gated — an old daemon does not know the op and would HANG the request (the 2.300.0 rule). */
  async dialStatus() {
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('dial-status')) { const e = new Error('daemon lacks dial-status (capabilities gate) -- upgrade the agent on this machine'); e.code = 'host_needs_daemon'; throw e; }
    const r = await this._request({ op: 'dial-status', timeoutMs: 10000 });
    if (r.error) throw new Error(r.error);
    return r.status || null;
  }

  /** The Design window's folder op (dc-twins M1): THE shared module src/design-fs.js run on this machine — one read /
   *  meta / tokens / write-user per call, the result in its wire shape (design-fs fromWire). Capability-gated. */
  async designFs(action, params = {}, { by } = {}) {
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('design-fs')) throw new Error('daemon lacks design-fs (capabilities gate)');
    const r = await this._request({ op: 'design-fs', action, params, timeoutMs: 30000, by });
    if (r.error) throw new Error(r.error);
    return r.result;
  }

  /** r1636 (the paired machine's folder listing — the machine collects, the hub shapes): the folder field's FACTS for the hub's plan,
   *  collected ON this machine (src/dir-collect.js collect). Capability-gated: an agent without `dir-collect` is never asked (an unknown
   *  op hangs) — its caller keeps the sh road. → the facts (JSON-safe; a mark's end in THAT machine's clock, `at` its clock at the reply) */
  async dirCollect(plan, { timeoutMs = 4000, signal = null } = {}) {
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('dir-collect')) throw Object.assign(new Error('daemon lacks dir-collect (capabilities gate)'), { code: 'no-capability' });
    // r1633 (1): a LATE ask (the page's quiet re-ask waits there ≤ 1 s) ends at once when its field asks anew — `signal`: the agent is
    // told by the ask's own key (`dir-collect-end`) and this call rejects now; whatever the agent answers after is dropped
    const key = plan && plan.late && signal ? require('crypto').randomUUID() : null;
    if (signal && signal.aborted) throw Object.assign(new Error('the folder field asked anew'), { code: 'aborted' });
    const asked = this._request({ op: 'dir-collect', plan, timeoutMs, ...(key ? { key } : {}) });
    const r = await (key ? new Promise((resolve, reject) => {
      const end = () => { reject(Object.assign(new Error('the folder field asked anew'), { code: 'aborted' })); this._request({ op: 'dir-collect-end', key, timeoutMs: 2000 }).catch(() => { }); };
      signal.addEventListener('abort', end, { once: true });
      asked.then((v) => { signal.removeEventListener('abort', end); resolve(v); }, (e) => { signal.removeEventListener('abort', end); reject(e); });
    }) : asked);
    // r2974: the machine's refusal keeps its NAME (`collector-stuck`: its collector cannot serve — the hub takes the release's road)
    if (r.error) throw Object.assign(new Error(r.error), typeof r.code === 'string' ? { code: r.code } : {}, r.state && typeof r.state === 'object' ? { state: r.state } : {});
    // r2752 (b): a reply with no facts is refused BY NAME (never a TypeError further on)
    if (!r.facts || typeof r.facts !== 'object') throw Object.assign(new Error('the machine answered the folder ask with no facts'), { code: 'collect-no-facts' });
    return r.facts;
  }
  /** r2974: can this machine's folder-field collector serve now? (asked by the hub behind its answers while it serves the machine by
   *  the release's road) → { live: true } | { live: false, why } — no read is made there for it */
  async dirCollectState({ timeoutMs = 3000 } = {}) {
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('dir-collect')) throw Object.assign(new Error('daemon lacks dir-collect (capabilities gate)'), { code: 'no-capability' });
    const r = await this._request({ op: 'dir-collect', state: true, timeoutMs });
    if (r.error) throw Object.assign(new Error(r.error), typeof r.code === 'string' ? { code: r.code } : {});
    return r.state && typeof r.state === 'object' ? r.state : { live: false, why: 'unsaid' };
  }

  async sysinfo() {
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('sysinfo')) throw new Error('daemon lacks sysinfo (capabilities gate)');
    const r = await this._request({ op: 'sysinfo', timeoutMs: 15000 });
    if (r.error) throw new Error(r.error);
    const { id, op, ...rest } = r;
    return rest;
  }

  /** The apps INSTALLED on THIS device, listed by witness where they are (the installed-apps list, owner 2026-10-11: the SHARED
   *  src/installed-apps.js listInstalled — Windows' Start Menu + Uninstall keys, macOS' /Applications). Capability-gated:
   *  an old daemon that does not know the op would HANG (the 2.300.0 rule), so it is never asked — `host_needs_daemon`. */
  async desktopAppsList({ budgetMs, timeoutMs = 30000 } = {}) {
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('desktop-apps-list')) { const e = new Error('daemon lacks desktop-apps-list (capabilities gate) -- upgrade the agent on this machine'); e.code = 'host_needs_daemon'; throw e; }
    const r = await this._request({ op: 'desktop-apps-list', budgetMs, timeoutMs });
    if (r.error) throw new Error(r.error);
    return r.result || {};
  }

  /** One OpenCode-serve op on THIS device (S9 remainder piece (e), B-eac2).
   *  The op names and shapes come from the SHARED table src/opencode-remote.js
   *  -- the daemon runs the very same runOpencodeOp() against its own facts,
   *  so `hostId` really is only a transport choice. Capability-gated: an old
   *  daemon that does not know the op would HANG (the 2.300.0 rule). */
  async opencodeServe(action, params = {}, { timeoutMs = 20000, start = null } = {}) {   // `start`: B-460d's last part — the serve's start the hub hands (an older agent ignores it)
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('opencode-serve')) throw new Error('daemon lacks opencode-serve (capabilities gate) -- upgrade the agent on this machine');
    const r = await this._request({ op: 'opencode-serve', action, params, ...(start ? { start } : {}), timeoutMs });
    if (r.error) throw new Error(r.error);
    return r.result || {};
  }

  /** One `browser-serve` op on THIS device (agent browser P4, design §7.3 /
   *  D5 (b)): start / status / stop / cdp-url / version of a PROFILE browser
   *  where it runs. The op names and shapes are the SHARED table
   *  src/browser-serve.js — the daemon runs the same runBrowserServeOp()
   *  against its own facts. Capability-gated: an old daemon that does not
   *  know the op would HANG (the 2.300.0 rule), so it is never asked. */
  async browserServe(action, params = {}, { timeoutMs = 90000, by } = {}) {
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('browser-serve')) { const e = new Error('daemon lacks browser-serve (capabilities gate) -- upgrade the agent on this machine'); e.code = 'host_needs_daemon'; throw e; }
    // lane browser-admin 2a: the Chrome build list is its own capability — an older agent is never asked (it would refuse
    // the action by name; a start carrying a build it ignores would run its default build), said by name here
    if ((action === 'builds' || (action === 'start' && params && params.browser && params.browser.kind && params.browser.kind !== 'default')) && !conn.info.capabilities.includes('browser-builds')) { const e = new Error('this machine\'s agent cannot list Chrome builds (it predates the list) -- upgrade the agent on this machine'); e.code = 'builds_unsupported'; throw e; }
    // lane remote-profile-start: removing a profile's folder is its own capability — an older agent is never asked (said by name)
    // lane daemon-orphan-end: ending a daemon that has no browser is its own capability — an older agent is never asked (reported in the row)
    if (action === 'end-daemon' && !conn.info.capabilities.includes('browser-end-daemon')) { const e = new Error('this machine\'s agent cannot end a browser daemon (it predates it) -- upgrade the agent on this machine'); e.code = 'end_daemon_unsupported'; throw e; }
    // B-e799: a stop whose STRUCTURED outcome is asked (facts: true — the manager's stop) is its own capability — an older agent is
    // never asked (its answer is words only); the sentence says how the agent gets the update: the hub pushes its signed agent at the
    // machine's next connection (src/server/device-upgrade-watch.js), so nothing is the asker's to do but ask again after it
    if (action === 'stop' && params && params.facts === true && !conn.info.capabilities.includes('browser-stop-facts')) { const e = new Error(`this machine's agent${conn.info.daemonVersion ? ' (' + conn.info.daemonVersion + ')' : ''} predates the structured stop answer: VibeSpace updates it by itself when the machine next connects — ask again after that; do not try to update it yourself (if its update is stuck, the machine's row in Machines and For you say why and the one step)`); e.code = 'stop_facts_unsupported'; throw e; }
    if (action === 'remove' && !conn.info.capabilities.includes('browser-remove')) { const e = new Error('this machine\'s agent cannot remove a profile\'s folder (it predates it) -- upgrade the agent on this machine'); e.code = 'remove_unsupported'; throw e; }
    const r = await this._request({ op: 'browser-serve', action, params, timeoutMs, by });
    if (r.error) throw new Error(r.error);
    return r.result || {};
  }

  /** One `desktop-serve` op on THIS device (desktop apps lane C1, docs/design-desktop-apps-seamless §3.5): facts /
   *  launch / stop / status / list / windows / fit / keep-alive / relaunch of a desktop application WHERE it runs. The
   *  op names and shapes are the SHARED table src/desktop-serve.js — the daemon runs the same runDesktopServeOp()
   *  against its own machine keeper. Capability-gated: an old daemon that does not know the op would HANG (the
   *  2.300.0 rule), so it is never asked — refused by name `host_needs_daemon`. */
  async desktopServe(action, params = {}, { timeoutMs = 60000, by } = {}) {
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('desktop-serve')) { const e = new Error('daemon lacks desktop-serve (capabilities gate) -- upgrade the agent on this machine'); e.code = 'host_needs_daemon'; throw e; }
    // Layer 0 apps (docs/design-app-persistence.zh.md §3.1): the app-* actions are asked only of a daemon whose hello-ack
    // names `app-install` — an agent that predates them would refuse them by name, but the GATE is the capability
    if (/^app-/.test(String(action)) && !conn.info?.capabilities?.includes?.('app-install')) { const e = new Error('daemon lacks app-install (capabilities gate) -- upgrade the agent on this machine to install apps there'); e.code = 'host_needs_daemon'; throw e; }
    const r = await this._request({ op: 'desktop-serve', action, params, timeoutMs, by });
    if (r.error) throw new Error(r.error);
    return r.result || {};
  }

  /** lane machine-app-crop: FIND one app's window on THIS device (src/machine-window.js runWindowTrack, where the windows are)
   *  — `{pid, since}` of the launched process, or `target` (the window). With `onPush` it is FOLLOWED: every change arrives
   *  there (`window-rect`, ≥ 100 ms apart), the watch is re-armed after a reconnect (by its window; re-pinned if it was),
   *  and `windowUntrack(wid)` ends it. Capability-gated: an old daemon does not know the op and would HANG (the 2.300.0
   *  rule), so it is never asked — `host_needs_daemon`. → { wid?, result } */
  async windowTrack(params = {}, { onPush = null, timeoutMs = 45000 } = {}) {
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('window-track')) { const e = new Error('daemon lacks window-track (capabilities gate) -- upgrade the agent on this machine to show one app as its own window'); e.code = 'host_needs_daemon'; throw e; }
    const ask = { pid: params.pid, since: params.since, target: params.target, findMs: params.findMs };
    if (!onPush) { const r = await this._request({ op: 'window-track', ...ask, timeoutMs }); if (r.error) throw new Error(r.error); return { result: r.result || { state: 'none' } }; }
    if (!this._windowWatches) this._windowWatches = new Map();
    const wid = 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const w = { pinned: false, target: null, push: (a) => { if (a && a.state === 'found') w.target = a.hwnd ?? a.windowId ?? w.target; if (a && a.state !== 'found') this._windowWatches.delete(wid); try { onPush(a); } catch { } },
      rearm: () => { if (!w.target) return; this._request({ op: 'window-track', target: w.target, watch: true, wid, timeoutMs }).then((r) => { if (r.result) w.push(r.result); if (w.pinned && r.result && r.result.state === 'found') this._request({ op: 'window-pin', wid, on: true, timeoutMs: 15000, by: w.pinBy || 'system:window-track' }).catch(() => { }); }, () => { }); } };
    this._windowWatches.set(wid, w);
    let r;
    try { r = await this._request({ op: 'window-track', ...ask, watch: true, wid, timeoutMs }); } catch (e) { this._windowWatches.delete(wid); throw e; }
    if (r.error) { this._windowWatches.delete(wid); throw new Error(r.error); }
    const result = r.result || { state: 'none' };
    if (result.state === 'found') w.target = result.hwnd ?? result.windowId ?? null; else this._windowWatches.delete(wid);
    return { wid, result };
  }
  /** lane machine-app-crop: stop following a window (its pin, if any, is undone on the device). */
  async windowUntrack(wid) {
    const w = this._windowWatches?.get(wid);
    this._windowWatches?.delete(wid);
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('window-track')) return { stopped: false };
    const r = await this._request({ op: 'window-untrack', wid, timeoutMs: 15000 });
    return { stopped: !!(r && r.stopped), wasPinned: !!(w && w.pinned) };
  }
  /** lane remoteapp-r1b (design q-024 r1 §1.4): the machine's Remote Desktop facts for the RemoteApp settings card (the SHARED
   *  src/remoteapp-facts.js, run where they are). Capability-gated: an agent that predates the op is NEVER asked (it would not
   *  answer — the 2.300.0 rule) — `host_needs_daemon` carrying the agent's own version, so the card names the version it needs.
   *  → parseRemoteappFacts' answer | { ok:false, code, error } */
  async remoteappFacts({ timeoutMs = 25000 } = {}) {
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('remoteapp-facts')) { const e = new Error('daemon lacks remoteapp-facts (capabilities gate) -- upgrade the agent on this machine'); e.code = 'host_needs_daemon'; e.daemonVersion = conn.info?.daemonVersion || null; throw e; }
    const r = await this._request({ op: 'remoteapp-facts', timeoutMs });
    if (r.error) throw new Error(r.error);
    return r.result || { ok: false, code: 'facts_failed', error: 'no answer' };
  }
  /** lane stream-p1a-transport (design q-041 r2 §2): a WebRTC STREAM session on this device — the daemon's werift offers ONE
   *  H.264 track + ONE `input` data channel (src/agentd/stream-host.js). `params` = { sid?, sourceKind, sourceId?, maxKbps?,
   *  relay?, relayLeg?, iceRestart? } (`relayLeg` = the hub relay's {port, key, hosts} for the daemon's own UDP leg — lane
   *  stream-relay-udp; an agent that predates it ignores it and the device link carries the relay); the session id is made
   *  HERE (before the request), so the pushes that follow the reply —
   *  `stream-ice` (the offer's candidates, `null` = the last) and `stream-stats` (once a second; `ended` = it is over) — always
   *  find `onPush`; after a reconnect the session is re-armed (this link owns its pushes again). Capability-gated: an agent
   *  that predates the op is never asked (it would not answer — the 2.300.0 rule): `host_needs_daemon` + its version.
   *  → the daemon's answer { ok, sid, offer, source, relayPort, codec } | { ok: false, code, error } */
  async streamOffer(params = {}, { onPush = null, timeoutMs = 20000 } = {}) {
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('stream-offer')) { const e = new Error('daemon lacks stream-offer (capabilities gate) -- upgrade the agent on this machine to stream its desktop'); e.code = 'host_needs_daemon'; e.daemonVersion = conn.info?.daemonVersion || null; throw e; }
    const sid = params.sid || 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    if (!this._streamWatches) this._streamWatches = new Map();
    const fresh = !params.iceRestart;
    if (onPush) this._streamWatches.set(sid, onPush);
    const forget = () => { if (fresh) this._streamWatches.delete(sid); };
    let r;
    try { r = await this._request({ op: 'stream-offer', sid, sourceKind: params.sourceKind, sourceId: params.sourceId, maxKbps: params.maxKbps, relay: !!params.relay, ...(params.relayLeg ? { relayLeg: params.relayLeg } : {}), ...(params.fp16 ? { fp16: true } : {}), ...(params.share ? { share: params.share } : {}), ...(params.hdr ? { hdr: true } : {}), ...(params.mic && conn.info.capabilities.includes(MIC_CAPABILITY) ? { mic: true } : {}), ...(params.audio && conn.info.capabilities.includes(SOUND_CAPABILITY) ? { audio: true } : {}), iceRestart: !fresh, timeoutMs }); } catch (e) { forget(); throw e; }
    if (r.error) { forget(); throw new Error(r.error); }
    const res = r.result || { ok: false, code: 'offer_failed', error: 'no answer' };
    if (!res.ok) forget();
    return res;
  }
  /** lane stream-mic-road (THREE-TOUCH: `stream-mic-result` in the id-keyed routing set, the capability gate here, the
   *  handler in agentd.js): THIS machine's microphone road — its facts (`force`; `prepare` builds and stages a Mac's plug-in for
   *  the install row — a read) or `params.action` = default (`to: 'virtual' | 'restore'` — an ACT: it names its `by`). An agent that predates it is NEVER asked (`host_needs_daemon`);
   *  `streamOffer({ mic: true })` is likewise asked of `stream-mic` agents only — an older one streams without the m-line.
   *  → the module's answer (src/desktop-mic.js) */
  async streamMic(params = {}) {
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.(MIC_CAPABILITY)) { const e = new Error('daemon lacks stream-mic (capabilities gate) -- upgrade the agent on this machine for the microphone'); e.code = 'host_needs_daemon'; e.daemonVersion = conn.info?.daemonVersion || null; throw e; }
    const r = await this._request({ op: 'stream-mic', action: params.action === 'default' ? 'default' : 'facts', ...(params.to ? { to: String(params.to) } : {}), ...(params.force ? { force: true } : {}), ...(params.prepare ? { prepare: true } : {}), timeoutMs: params.prepare ? 300000 : 60000, by: params.by });
    if (r.error) throw new Error(r.error);
    return r.result || { ok: false, code: 'no_answer', error: 'no answer' };
  }
  /** lane speaker-passthrough-v1 (THREE-TOUCH: `stream-audio-result` in the id-keyed routing set, the capability gate here, the
   *  handler in agentd.js): the strip's 「声音」 for one stream session — `on` starts THE capture of the machine's sound, off ends it.
   *  An agent that predates it is NEVER asked (`host_needs_daemon`); `streamOffer({ audio: true })` is likewise asked of
   *  `stream-audio` agents only — an older one streams the picture alone. → { ok, sid, on, endpoint?, audio } | { ok: false, code, error } */
  async streamAudio(sid, { on = false } = {}) {
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.(SOUND_CAPABILITY)) { const e = new Error('daemon lacks stream-audio (capabilities gate) -- upgrade the agent on this machine for its sound'); e.code = 'host_needs_daemon'; e.daemonVersion = conn.info?.daemonVersion || null; throw e; }
    const r = await this._request({ op: 'stream-audio', sid: String(sid || ''), on: on === true, timeoutMs: 30000 });
    if (r.error) throw new Error(r.error);
    return r.result || { ok: false, code: 'no_answer', error: 'no answer' };
  }
  /** The browser's SDP answer, or one trickled candidate of it, for a stream session. → { ok } | { ok: false, code, error } */
  async streamAnswer(sid, { answer = null, candidate = null } = {}) {
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('stream-offer')) { const e = new Error('daemon lacks stream-offer (capabilities gate)'); e.code = 'host_needs_daemon'; throw e; }
    const r = await this._request({ op: 'stream-answer', sid, answer, candidate, timeoutMs: 15000 });
    if (r.error) throw new Error(r.error);
    return r.result || { ok: false, code: 'answer_failed', error: 'no answer' };
  }
  /** End a stream session (its watch goes with it). → { stopped } */
  async streamStop(sid, { why = null } = {}) { // why: the end's name, for the machine's log (an older daemon ignores it)
    this._streamWatches?.delete(sid);
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('stream-offer')) return { stopped: false };
    const r = await this._request({ op: 'stream-stop', sid, ...(why ? { why } : {}), timeoutMs: 10000 });
    return { stopped: !!(r && r.stopped) };
  }
  /** A stream session's numbers now (the daemon's side: fps, kbps, the bandwidth estimate, the input counts). */
  async streamStats(sid) {
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('stream-offer')) { const e = new Error('daemon lacks stream-offer (capabilities gate)'); e.code = 'host_needs_daemon'; throw e; }
    const r = await this._request({ op: 'stream-stats', sid, timeoutMs: 10000 });
    if (r.error) throw new Error(r.error);
    return r.result || { ok: false, code: 'not_found', error: 'no answer' };
  }
  /** After a reconnect: the session is asked for its numbers WITH `watch` (this link owns its pushes again); a session that
   *  ended while the link was down is told to its watcher as ended (`link_lost`). */
  _rearmStream(sid) {
    this._request({ op: 'stream-stats', sid, watch: true, timeoutMs: 10000 }).then((r) => {
      const f = this._streamWatches?.get(sid);
      const res = r && r.result;
      if (res && res.ok) { try { f?.({ op: 'stream-stats', sid, stats: res.stats, state: res.state, ...(res.paused !== undefined ? { paused: res.paused } : {}), rearmed: true }); } catch { } return; } // lane mac-locked-capture: a paused capture stays said
      this._streamWatches?.delete(sid);
      try { f?.({ op: 'stream-stats', sid, state: 'closed', ended: 'link_lost' }); } catch { }
    }, () => { });
  }
  /** Pointer / key / clipboard events into THE machine's injector (the `input-events` op — the data channel's twin for a
   *  caller with no stream). Capability-gated. → { ok, n, kind, refused: [{ i, code }] } */
  async inputEvents(events, { by } = {}) {
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('input-events')) { const e = new Error('daemon lacks input-events (capabilities gate) -- upgrade the agent on this machine'); e.code = 'host_needs_daemon'; e.daemonVersion = conn.info?.daemonVersion || null; throw e; }
    const r = await this._request({ op: 'input-events', events: Array.isArray(events) ? events : [], timeoutMs: 15000, by });
    if (r.error) throw new Error(r.error);
    return r.result || { ok: false, n: 0, refused: [] };
  }
  /** lane stream-p1b-screen (design q-041 r2 §2): the machine's SCREEN-SOURCE facts — each display's HDR state + SDR white level
   *  + DXGI output, the ffmpeg its agent found (path, version, ddagrab, the encoders) and the primary display's plan (the
   *  road, the encoder — or the refusal by name). Capability-gated: an agent that predates the op is never asked (the 2.300.0
   *  rule) — `host_needs_daemon` + its version. `force` re-reads (the agent keeps an answer 30 s).
   *  → { ok, platform, ffmpeg, looked, displays, primary } | { ok: false, code, error } */
  async streamFacts({ force = false, timeoutMs = 45000 } = {}) {
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('stream-facts')) { const e = new Error('daemon lacks stream-facts (capabilities gate) -- upgrade the agent on this machine'); e.code = 'host_needs_daemon'; e.daemonVersion = conn.info?.daemonVersion || null; throw e; }
    const r = await this._request({ op: 'stream-facts', force: !!force, timeoutMs });
    if (r.error) throw new Error(r.error);
    return r.result || { ok: false, code: 'facts_failed', error: 'no answer' };
  }
  /** lane stream-p2w-build (design q-041 r3 §3 P2w): the machine's APPLICATION WINDOWS for the one-window stream's picker
   *  (its vibespace-wgc helper's facts — visible top-level windows, filtered), or with `restore` = that window brought back
   *  from minimized without the focus. Capability-gated (`stream-windows` — the op's own word: a .301–.303 agent already says
   *  `stream-window` without this op, int304): an agent that predates it is never asked —
   *  `host_needs_daemon` + its version. → { ok, platform, helper, windows } | { ok, window } | { ok: false, code, error } */
  async streamWindows({ restore = null, timeoutMs = 90000 } = {}) {
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('stream-windows')) { const e = new Error('daemon lacks stream-windows (capabilities gate) -- upgrade the agent on this machine'); e.code = 'host_needs_daemon'; e.daemonVersion = conn.info?.daemonVersion || null; throw e; }
    const r = await this._request({ op: 'stream-windows', ...(restore != null ? { restore: String(restore) } : {}), timeoutMs });
    if (r.error) throw new Error(r.error);
    return r.result || { ok: false, code: 'facts_failed', error: 'no answer' };
  }
  /** lane stream-mac-stall: 「打开系统设置」 — the Mac shows that Settings pane itself (`screen` | `accessibility`; its agent runs
   *  `open` on the pane's deep link). Capability-gated (`settings-open`): an agent that predates it is never asked —
   *  `host_needs_daemon` + its version (the page then copies the link, as before). → { ok, pane } | { ok: false, code, error } */
  async settingsOpen(pane, { timeoutMs = 15000, by } = {}) {
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('settings-open')) { const e = new Error('daemon lacks settings-open (capabilities gate) -- upgrade the agent on this machine'); e.code = 'host_needs_daemon'; e.daemonVersion = conn.info?.daemonVersion || null; throw e; }
    const r = await this._request({ op: 'settings-open', pane: String(pane || ''), timeoutMs, by });
    if (r.error) throw new Error(r.error);
    return r.result || { ok: false, code: 'open_failed', error: 'no answer' };
  }
  /** lane desktop-handover: ONE still of a stream session's display (the `desktop-grab` op — the picture an agent the owner handed
   *  this machine's desktop to reads; the hub decides who may ask). Capability-gated: an agent that predates the op is never
   *  asked — `host_needs_daemon` + its version. → { ok, png64, w, h, display, origin, road } | { ok: false, code, error } */
  async desktopGrab(sid, { timeoutMs = 30000, by } = {}) { // int315: an act — `by` = the agent the desktop was handed to
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('desktop-grab')) { const e = new Error('daemon lacks desktop-grab (capabilities gate) -- upgrade the agent on this machine'); e.code = 'host_needs_daemon'; e.daemonVersion = conn.info?.daemonVersion || null; throw e; }
    const r = await this._request({ op: 'desktop-grab', sid: String(sid || ''), timeoutMs, by });
    if (r.error) throw new Error(r.error);
    return r.result || { ok: false, code: 'still_failed', error: 'no answer' };
  }
  /** lane desktop-handover: the agent's input records (the data channel's own shapes) into a stream session's sink (the
   *  `desktop-input` op). Capability-gated like desktopGrab. → { ok, n, refused: [{ i, code }], display } | { ok: false, code, error } */
  async desktopInput(sid, events, { timeoutMs = 30000, by } = {}) {
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('desktop-input')) { const e = new Error('daemon lacks desktop-input (capabilities gate) -- upgrade the agent on this machine'); e.code = 'host_needs_daemon'; e.daemonVersion = conn.info?.daemonVersion || null; throw e; }
    const r = await this._request({ op: 'desktop-input', sid: String(sid || ''), events: Array.isArray(events) ? events : [], timeoutMs, by });
    if (r.error) throw new Error(r.error);
    return r.result || { ok: false, code: 'input_failed', error: 'no answer' };
  }
  /** lane desktop-v2-entry: the machine's own screen table (the display picker). Capability-gated (an old agent never hears
   *  an op it would not answer). → { ok, platform, displays } | { ok:false, code, error } */
  async displayFacts({ timeoutMs = 15000 } = {}) {
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('display-facts')) { const e = new Error('daemon lacks display-facts (capabilities gate) -- upgrade the agent on this machine'); e.code = 'host_needs_daemon'; throw e; }
    const r = await this._request({ op: 'display-facts', timeoutMs });
    if (r.error) throw new Error(r.error);
    return r.result || { ok: false, code: 'displays_failed', error: 'no answer' };
  }
  /** lane machine-app-crop: keep a followed window on top (`on`) or not — Windows' topmost; a Mac activates the app instead.
   *  Capability-gated like windowTrack. → { ok, pinned, state?, note? } */
  async windowPin(wid, on, { by } = {}) {
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('window-pin')) { const e = new Error('daemon lacks window-pin (capabilities gate) -- upgrade the agent on this machine'); e.code = 'host_needs_daemon'; throw e; }
    const r = await this._request({ op: 'window-pin', wid, on: !!on, timeoutMs: 15000, by });
    if (r.error) throw new Error(r.error);
    const w = this._windowWatches?.get(wid);
    if (w && r.result && r.result.ok) { w.pinned = !!on; w.pinBy = by; } // lane device-act-audit: a re-arm after a reconnect re-pins it in the name of who pinned it
    return r.result || { ok: false, code: 'pin_failed', error: 'no answer' };
  }

  /** B-e7c0 (paired machine): a subscription pick's merge of the person's own settings file, made ON that machine by its agent
   *  (src/machine-probes.js settingsMergeOp) → { ok, path, dropped } | { ok: false, reason } — asked ONLY of an agent that says it has
   *  it (an old one would never answer an unknown op); ONE ask, bounded, never retried (the create falls to the set-aside) */
  async settingsMerge({ sid, cwd = null, ownFile = null, layer = null, by, timeoutMs = 4000 } = {}) {
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('settings-merge')) { const e = new Error('daemon lacks settings-merge (capabilities gate)'); e.code = 'host_needs_daemon'; throw e; }
    const r = await this._request({ op: 'settings-merge', sid, cwd, ownFile, layer, by, timeoutMs });
    if (r.error) { const e = new Error(r.error); if (r.code) e.code = r.code; throw e; }
    const { id, op, ...rest } = r;
    return rest;
  }
  /** B-69a7 (b): a PERSON's press on a paired machine's left-behind line — ended THERE by its agent (each row re-proven, the pid alone
   *  signalled) → {ok, ended, still, gone, held, unread, unreadRows} | {ok: false, reason} — asked only of an agent that names it */
  async leftBehindEnd({ mark, rows, sid = null, by } = {}) {
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('left-behind-end')) { const e = new Error('daemon lacks left-behind-end (capabilities gate)'); e.code = 'host_needs_daemon'; throw e; }
    const r = await this._request({ op: 'left-behind-end', mark, rows, sid, by, timeoutMs: 10000 });   // the press's re-check + grace ≈ 6 s; the hub's whole wait (connect 3 s + this) stays inside the page's 15 s
    if (r.error) { const e = new Error(r.error); if (r.code) e.code = r.code; throw e; }
    const { id, op, ...rest } = r;
    return rest;
  }
  /** B-69a7: what a stopped turn's command tool left running on that machine — READ-ONLY, asked only of an agent that says it has it */
  async leftBehind({ mark, ageMs, sid = null } = {}) {
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('left-behind')) throw new Error('daemon lacks left-behind (capabilities gate)');
    const r = await this._request({ op: 'left-behind', mark, ageMs, sid, timeoutMs: 15000 });
    if (r.error) throw new Error(r.error);
    const { id, op, ...rest } = r;
    return rest;
  }
  /** Full process table (System panel process manager, 2.354.0). */
  async procList({ max } = {}) {
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('proc-list')) throw new Error('daemon lacks proc-list (capabilities gate)');
    const r = await this._request({ op: 'proc-list', max, timeoutMs: 15000 });
    if (r.error) throw new Error(r.error);
    const { id, op, ...rest } = r;
    return rest;
  }

  /** Post one message into a conversation whose CLI runs on THIS device
   *  (2.362.0 cross-machine delivery rung). */
  async peerPost({ cid, text, by, waitMs = 0 }) {
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('peer-post')) throw new Error('daemon lacks peer-post (capabilities gate)');
    // B-95fc U2: a hand-over to a conversation just resumed THERE asks the machine to wait for its own inbox (bounded there, 60 s);
    // sent only to an agent whose hello advertises peer-post-wait (an older one posts at once, as today), and the request's own
    // timer covers the wait — never «unanswered» for a wait the machine is still keeping
    const wait = waitMs > 0 && conn.info?.capabilities?.includes?.('peer-post-wait') ? Math.min(60000, Math.floor(waitMs)) : 0;
    const r = await this._request({ op: 'peer-post', cid, text, timeoutMs: 15000 + wait, by, ...(wait ? { inboxWaitMs: wait } : {}) });   // never `waitMs`: _request's bound reads it first
    if (r.error) throw new Error(r.error);
    const { id, op, ...rest } = r;
    return rest;
  }

  /** B-95fc U1: is a conversation running on THIS device, and its inbox open — the device's own registry (the shared lookupPeer).
   *  Asked ONLY of an agent whose hello advertises `peer-state` (an unknown op hangs): → {live, inbox} | null (an older agent). */
  async peerState(cid) {
    const info = this.helloInfo();
    if (!info || !Array.isArray(info.capabilities) || !info.capabilities.includes('peer-state')) return null;
    const r = await this._request({ op: 'peer-state', cid, timeoutMs: 6000 });
    if (r.error) throw new Error(r.error);
    return { live: r.live === true, inbox: r.inbox === true };
  }

  async quotaRefresh({ subDir = null, humanGated = false, lawFirst = null } = {}) {
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('quota-refresh')) throw new Error('daemon lacks quota-refresh (capabilities gate)');
    // B-5e0d: THE USAGE BEARER LAW — an agent that does not advertise it would send a long-lived token as the Bearer itself:
    // the caller's own check of the same login file (`lawFirst`, refusing by name) runs before such an agent is asked; an agent
    // WITH the law refuses on its own, makes no request, and still returns its passive cache
    if (!conn.info.capabilities.includes('quota-refresh-bearer-law') && typeof lawFirst === 'function') await lawFirst();
    // B-5e0d: the agent's REASON rides back (`refused`: 'long-lived' beside its reading | 'no-valid-login' on its error, carried
    // by replyError) — the caller answers by it (the error's `code`, the reading's `refused`), with no second look through the
    // shell; an agent older than it sends none (the caller looks as before)
    let r;
    try { r = await this._request({ op: 'quota-refresh', subDir, humanGated, timeoutMs: 40000 }); }
    catch (e) { const why = quotaReasonOf(e); if (why && !e.code) e.code = why; throw e; }
    if (r.error) throw new Error(r.error);
    if (Number(r.passiveLeft) > 0) this._saidLeftOnce('passive', `${Number(r.passiveLeft)} passive usage reading(s) left out (more than 64 files, or one over 64 KiB)`);
    return { usage: r.usage, roles: r.roles, passive: r.passive || null, refused: quotaReasonOf(r) };
  }

  /** The device's usage walk (R4). `hubCursor` (lane ledger-dedup-law F2) = the cursor map the HUB keeps for this machine:
   *  a daemon with `usage-scan-hub-cursor` walks from it (stdin) and never touches its own cursor file; an older one walks
   *  from its own file as it always did — the answer says which (`since: 'hub' | 'device'`; 'unsupported' = a hub cursor was
   *  offered and the daemon cannot take it). The device's cursor is NEVER written from here: the hub's durable ingest is
   *  the commit. */
  async usageScan({ cursorFile, hubCursor = null, bound = null } = {}) {
    const conn = await this.connect();
    if (!conn.info?.capabilities?.includes?.('usage-scan')) throw new Error('daemon lacks usage-scan (capabilities gate)');
    const canHub = !!conn.info?.capabilities?.includes?.('usage-scan-hub-cursor');
    const chunks = [];
    const useHub = !!(hubCursor && typeof hubCursor === 'object' && canHub);
    // B-5278: the harvest's bound for the walk (L1; an older agent ignores it), and the map without the sid it re-derives (L2)
    const lim = bound && Number(bound.maxBytes) > 0 ? { maxBytes: Math.floor(Number(bound.maxBytes)), ...(Number(bound.maxMs) > 0 ? { maxMs: Math.floor(Number(bound.maxMs)) } : {}) } : {};
    const r = await this._streamOp({ op: 'usage-scan', cursorFile, ...lim, ...(useHub ? { hubCursor: true, stdin64: Buffer.from(JSON.stringify(AC.cursorsWithoutSid(hubCursor))).toString('base64') } : {}) }, { onData: (buf) => chunks.push(buf) });
    if (r.error) throw new Error(r.error);
    if (r.truncated) throw new Error('usage-scan stream truncated');
    if (r.code !== 0) throw new Error('usage-scan exit ' + r.code);
    const lines = Buffer.concat(chunks).toString('utf-8').split('\n').filter((l) => l.trim());
    let cursors = null, cf = null, from = null, more = false, oversize = 0;
    if (lines.length) {
      try {
        const last = JSON.parse(lines[lines.length - 1]);
        if (last && last.__cursors__) { cursors = last.__cursors__; cf = last.__cursorFile__ || null; from = last.__cursorsFrom__ || null; more = last.__more__ === true; oversize = Number(last.__oversize__) > 0 ? Math.floor(Number(last.__oversize__)) : 0; lines.pop(); }
      } catch { }
    }
    if (!cursors) throw new Error('usage-scan output missing cursor manifest');
    if (useHub && from !== 'hub') throw new Error('usage-scan: the daemon did not walk from the hub cursor it was handed');
    return { ndjson: lines.length ? lines.join('\n') + '\n' : '', cursors, cursorFile: cf, since: useHub ? 'hub' : hubCursor ? 'unsupported' : 'device', more, oversize };
  }

  /** loopback TCP forward on the device: returns {write, close, onData, onClose}. A server that speaks first (an RFB
   *  greeting, an SSH banner) answers in the same read as the agent's tcp-open — before the caller's `await` resumes
   *  and sets onData. The handle keeps what arrives before its consumer is attached (bytes, then the close) and hands
   *  it over, in order, when onData / onClose are set (lane mirror-green-212 — kb-bugfix-invariants). */
  async tcpForward(port, host, { by } = {}) {
    const conn = await this.connect();
    const noFlag = this._policyError(conn, { op: 'tcp-connect', port, ...(host && host !== '127.0.0.1' ? { host } : {}), by }, true); if (noFlag) throw noFlag; // lane device-allow-flags: before a channel is held
    const chan = conn.nextChan++;
    const early = []; let dataFn = null, closeFn = null, closed = false;
    const drain = () => { while (dataFn && early.length) dataFn(early.shift()); if (closed && closeFn && !early.length) { closed = false; closeFn(); } };
    const handle = { chan, get onData() { return dataFn; }, set onData(f) { dataFn = f; drain(); }, get onClose() { return closeFn; }, set onClose(f) { closeFn = f; drain(); } };
    conn.sessions.set(chan, { onData: (b) => { if (dataFn && !early.length) dataFn(b); else early.push(b); }, onClose: () => { closed = true; drain(); }, onWritable: () => { try { handle.onWritable?.(); } catch { } } });   // cs M1: a write that said false hears when the channel can take more (a link riding it waits for this)
    // host defaults to loopback on the device; an explicit host reaches the
    // device's LAN (a user-driven forward to another internal machine)
    try { await this._request({ op: 'tcp-connect', port, chan, ...(host && host !== '127.0.0.1' ? { host } : {}), by }); } // lane device-act-audit: another LAN host = an act (`by`); the loopback = a read
    catch (e) { if (e && (e.code === 'hub_act_denied' || e.code === 'ask_expired' || e.code === 'ask_unfiled')) conn.sessions.delete(chan); throw e; } // lane hub-act-ask: refused ⇒ no channel kept
    handle.write = (b) => conn.mux.data(chan, Buffer.isBuffer(b) ? b : Buffer.from(b));
    handle.close = () => { conn.sessions.delete(chan); conn.mux.closeChan(chan); };
    return handle;
  }

  // ── REVERSE forward (the tunnel primitive, "互挂云盘"): the daemon binds
  // 127.0.0.1:<port> ON THE DEVICE; every accepted connection is pushed back
  // here and piped into connectLocal() (usually our own HTTP port). NAT-proof
  // by construction — the bytes ride whatever link the device already has
  // (ssh stdio or wss dial-out). Registration survives reconnects. ──
  async reverseForward({ port = 0, connectLocal }) {
    const ack = await this._request({ op: 'tcp-listen', port });
    this._reverseForwards.set(ack.port, connectLocal);
    return { port: ack.port };
  }
  async reverseUnforward(port) {
    this._reverseForwards.delete(port);
    try { await this._request({ op: 'tcp-unlisten', port }); } catch { }
  }

  // ── device-folder-mount: serve a device folder over HTTP (the daemon binds
  // 127.0.0.1:<port>), returns {port}. The server tcp-forwards that port and
  // rclone-http-mounts it. unserveFolder tears the server down. ──
  serveFolder(path, { by } = {}) { return this._request({ op: 'serve-folder', path, by }); }
  unserveFolder(port) { return this._request({ op: 'unserve-folder', port }); }

  // on-demand egress: the device serves a SOCKS5 proxy on its loopback, the
  // server reaches it via tcpForward (the exit-proxy shape). CONNECT only.
  serveSocks({ by, consent = false } = {}) { return this._request({ op: 'serve-socks', by }, { consent }); }
  unserveSocks(port) { return this._request({ op: 'unserve-socks', port }); }
  _onTcpAccept(m) {
    const conn = this._conn;
    if (!conn) return;
    const mkLocal = this._reverseForwards.get(m.port);
    const reject = () => { try { conn.mux.closeChan(m.chan); } catch { } };
    if (!mkLocal) return reject();
    let sock;
    try { sock = mkLocal(); } catch { return reject(); }
    const { mux, sessions } = conn;
    sessions.set(m.chan, {
      manualCredit: true, // credit as the local socket truly drains
      onData: (b) => {
        let ok = false; try { ok = sock.write(b); } catch { }
        if (ok) mux.credit(m.chan, b.length);
        else sock.once('drain', () => { try { mux.credit(m.chan, b.length); } catch { } });
      },
      onClose: () => { try { sock.destroy(); } catch { } },
      onWritable: () => { try { sock.resume(); } catch { } },
    });
    sock.on('data', (d) => { try { if (!mux.data(m.chan, d)) sock.pause(); } catch { } });
    sock.on('close', () => { if (sessions.delete(m.chan)) { try { mux.closeChan(m.chan); } catch { } } });
    sock.on('error', () => { });
  }

  /** Is the device answering on THIS link right now? (a bounded mux ping; false when not connected) */
  ping(ms = 1500) { const mux = this._conn?.mux; return mux ? mux.ping(ms) : Promise.resolve(false); }
  stop() { this._foldEndAll(); this._stopped = true; this._conn?.mux?.destroy(); this._conn = null; }   // B-c632: an open fold is said
}

// THE GREETING IS JUDGED BEFORE IT IS BELIEVED (lane lg-remote-hardening, B-7f0b — design q-042 D8a). A device's hello-ack
// drives the hub's decisions (platform → the shell road, capabilities → which ops are asked, posixShells → the Windows door,
// daemonVersion → the update) and is kept whole as the link's `info` for the link's life — a hostile or broken device could
// send any shape, any size (a frame may carry 64 MiB). A field that is PRESENT must have its shape; an older agent that
// never says a field is not judged on it — daemonVersion is the one exception: REQUIRED (every agent and the bridge say one).
// → {ok} | {ok:false, why}. The link is refused by name (hello-ack-shape). A platform WORD Node.js does not name yet (a future
// port) passes as it is — a lock-out that only a by-hand reinstall cures is no defence against a mistake (unit 4's cure).
/** the handshake refusals a retry cannot cure (the connect loop throws them at once, on every road) */
const TERMINAL_REFUSALS = new Set(['hello-ack-shape', 'device-key-mismatch', 'device-signature-bad', 'device-key-missing', 'device-key-shape', 'device-key-unusable', 'hub-key-mismatch', 'hub-key-missing', 'hub-key-shape', 'hub-signature-bad', 'hub_identity_lost', 'hub_identity_unavailable', 'vault_locked']); // + lane lg-remote-hardening D3's device-key refusals
/** a dialed stream → the Mux its last refused handshake kept there (auth-fail or a terminal refusal): it answers the device's
 *  heartbeat, so the kept link stays alive, and the next handshake on that stream detaches it first (unit 4's cure r2) */
const keptMuxOf = new WeakMap();
const HELLO_BOUNDS = Object.freeze({ bytes: 64 * 1024, capabilities: 256, posixShells: 16, text: 64 });
function helloAckVerdict(msg) {
  const no = (why) => ({ ok: false, why });
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return no('it is not an object');
  let bytes = 0;
  try { bytes = Buffer.byteLength(JSON.stringify(msg)); } catch { return no('it does not serialize'); }
  if (bytes > HELLO_BOUNDS.bytes) return no(`it is ${bytes} bytes (at most ${HELLO_BOUNDS.bytes})`);
  if (!SIG.verOf(msg.daemonVersion)) return no('its daemonVersion is not a version');
  if (msg.platform !== undefined && !(typeof msg.platform === 'string' && /^[a-z0-9_-]{1,32}$/.test(msg.platform))) return no(`its platform is not a word (${JSON.stringify(msg.platform).slice(0, 24)})`);
  if (msg.capabilities !== undefined && (!Array.isArray(msg.capabilities) || msg.capabilities.length > HELLO_BOUNDS.capabilities || !msg.capabilities.every((c) => typeof c === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(c)))) return no(`its capabilities are not a list of at most ${HELLO_BOUNDS.capabilities} words`);
  if (msg.posixShells !== undefined && (!Array.isArray(msg.posixShells) || msg.posixShells.length > HELLO_BOUNDS.posixShells || !msg.posixShells.every((c) => typeof c === 'string' && /^[A-Za-z0-9._-]{1,32}$/.test(c)))) return no(`its posixShells are not a list of at most ${HELLO_BOUNDS.posixShells} shell names`);
  for (const k of ['arch', 'nodeVersion', 'openssl']) if (msg[k] != null && (typeof msg[k] !== 'string' || msg[k].length > HELLO_BOUNDS.text)) return no(`its ${k} is not a short string`);
  if (msg.elevated !== undefined && typeof msg.elevated !== 'boolean') return no('its elevated is not true / false');
  if (msg.nodeOwn !== undefined && msg.nodeOwn !== null && typeof msg.nodeOwn !== 'boolean') return no('its nodeOwn is not true / false');
  if (msg.nicePath != null && typeof msg.nicePath !== 'string') return no('its nicePath is not a string'); // B-460d's remainder (the hub lowers only by an absolute path with no space: src/server/spawn-priority.js nicePathOf)
  if (msg.nodePath != null && typeof msg.nodePath !== 'string') return no('its nodePath is not a string'); // B-b83c (the hello's own bound covers its size; the hub reads only an absolute path: remote-shell.js agentNodeOf)
  return { ok: true };
}

module.exports = { posixShellRefusal, posixShellFailed, replyError, DeviceManager, helloAckVerdict, HELLO_BOUNDS, TERMINAL_REFUSALS };
