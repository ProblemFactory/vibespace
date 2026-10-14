/**
 * AccountManager — Anthropic account switching for Claude sessions.
 *
 * Two billing identities exist for the Claude CLI:
 *  - Subscription: the CLI's global OAuth login (~/.claude/.credentials.json).
 *  - API / Console: an org API key. The CLI's own console login MINTS one and
 *    stores it as `primaryApiKey` in ~/.claude.json — but /login is mutually
 *    exclusive (switching wipes the other), so VibeSpace keeps console keys in
 *    its OWN store and injects ANTHROPIC_API_KEY into a session's spawn env
 *    (process-env channel, never argv). Per-session choice, no global switch.
 *
 * Keys are AES-256-GCM encrypted at rest under a server-local key
 * (data/.accounts-key), same pattern as mounts.js. list() never returns
 * secrets — only the key tail (last 8 chars) for identification; that matches
 * how the CLI's own trust list (customApiKeyResponses) fingerprints keys.
 */
const fs = require('fs');
const { get: harnessOf } = require('./harnesses'); // S2: per-harness credential mechanics live on the descriptor (creds)
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { capsOf } = require('./backend-caps.js'); // PURE registry: per-backend hot-switch verdict rides list() so the UI never offers a dead toggle
const { loginRank, loginUsable, withOat, oatFileOurs, credsRestOf, oatFileMerge, oatFileCurrent, oatShapeOf, oatFileBody, materializeVerdict } = require('./login-expiry.js'); // PURE: which login is the WORST of a pool's members; the materialized long-lived token's verdict
const cliCaps = require('./cli-caps.js'); // PURE: oatInFile(version, fixture) — a measured CLI version gates the materialized token
const { lawfulKey } = require('./secret-box.js'); // THE KEY-FILE LAW (src/key-file.js, lane key-file-law-stores): mint only when ABSENT with no ciphertext (tmp + link(2)); else a named refusal
// why a row's long-lived token is NOT in its folder — the row's door names each (pool-oat-materialize + verify r1)
const OAT_FILE_REFUSALS = Object.freeze(['cli-unmeasured', 'no-scopes', 'write-failed', 'read-failed', 'dir-symlink', 'oat-unreadable', 'key-missing', 'key-unreadable']);
// THE KEY-FILE LAW's two refusals (lane oat-census-closure, pool-oat verify r2 O1): `key-missing` (absent while the store
// holds ciphertext — restore the backup) and `key-unreadable:<code>` (EIO / EACCES / EMFILE / a bad length …) — never a new key
function keyRefusal(reason, file) {
  const [kind, code] = String(reason).split(':');
  const words = kind === 'key-missing'
    ? 'the key file is missing but this store holds encrypted secrets — restore it from a backup (no new key was made: it could never decrypt them)'
    : `the key file could not be read (${code || 'error'}) — nothing was written and no new key was made`;
  return Object.assign(new Error(`${file}: ${words}`), { code: String(reason) });
}
const isKeyRefusal = (e) => !!e && /^key-(missing|unreadable(:.*)?)$/.test(String(e.code || ''));
// "no claim" — the shape every non-declaring harness / non-subscription record
// answers with. Never 'ok': an unreadable deadline is ignorance, not health.
const LOGIN_UNKNOWN = () => ({ state: 'unknown', refreshExpiresAt: null, accessExpiresAt: null, msLeft: null });
// THE SLOT-TRANSITION LEDGER (2026-09-07). A symlink has no history, so nothing
// that arrives LATE could ask "which member was this conversation on THEN" —
// and every late consumer (readings, ledger bakes, the repair migration) filled
// that gap with the org the CLI cached at SPAWN, which is the misattribution
// this records away. THIS FILE IS THE SINGLE WRITER: `ensureSessionPoolLink`
// and `setPoolTarget` are the only two functions that move a credential link
// (spawn, engine, manual route, signed-out self-heal, account removal all go
// through them), so no caller can create a hole by forgetting to record one.
const { SlotTransitions } = require('./slot-transitions.js');
// The long-lived-token lifetime has ONE definition (2026-09-07 r2): the panel
// and the readings repair must date an oat's death exactly the way the spawn
// resolver does, and they read it from src/login-state.js (no AccountManager
// to construct at migration time). Same number, one place.
const { OAT_TTL_MS: OAT_TTL_MS_SHARED } = require('./login-state.js');

class AccountManager {
  constructor({ dataDir, onChange, onSessionLinks, platform = process.platform, oatFixture = null }) {
    this.dataDir = dataDir;
    this._file = path.join(dataDir, 'accounts.json');
    this._keyFile = path.join(dataDir, '.accounts-key');
    this._platform = platform;
    // Per-SUBSCRIPTION credential dirs. A subscription account is a real dir
    // holding ONLY that account's .credentials.json; the CLI reads it via
    // CLAUDE_SECURESTORAGE_CONFIG_DIR (relocates the SECRET store only —
    // projects/sessions/settings stay in ~/.claude, so transcripts + discovery
    // stay shared). Verified vs claude 2.1.205 (Wde() = env ?? sn()). This is
    // how we hold MANY subscription logins at once.
    this._dataDir = dataDir;
    this._subsDir = path.join(dataDir, 'subs');
    // Per-CODEX-account homes. Codex has NO auth-only relocation env (CODEX_HOME
    // moves the WHOLE config dir), so we isolate auth by giving each account its
    // own CODEX_HOME whose `sessions/` + `config.toml` are SYMLINKS to the
    // shared ~/.codex — auth.json stays real per-account, threads land in the
    // shared sessions dir (unified discovery), settings stay shared. Verified vs
    // codex 0.142.5 (symlinks survive a run; rollout written to shared dir).
    this._codexSubsDir = path.join(dataDir, 'codex-subs');
    this._onChange = onChange || (() => {});
    this._onSessionLinks = onSessionLinks || (() => {}); // a per-session link moved (see _notifyLinks)
    this.slotTransitions = new SlotTransitions({ dataDir });
    // THE MATERIALIZED LONG-LIVED TOKEN (lane pool-oat-materialize): the hub's CLI
    // version (src/server/oat-file-sync.js learns it the way backend-status does —
    // `claude --version`) and the measurement that grants that version (the
    // fixture) gate every write. Unknown version ⇒ nothing is written.
    this._oatCli = null;
    this._oatFixturePath = oatFixture || path.join(__dirname, '..', 'scripts', 'fixtures', 'oat-in-file.json');
    this._oatFileFacts = new Map(); // id → the last verdict (the row's door)
    this._oatChain = Promise.resolve(); // THE ONE QUEUE of the oat's acts on member credential files (verify r1 F13 / F7)
    this._oatSweeps = new Set();       // sweeps in flight (oatFileSettled waits for them too)
    this._state = { version: 1, defaultAccountId: null, defaultCodexAccountId: null, accounts: [] };
    this._load();
    // Console-login scratch dirs (con-*) are transient; drop any abandoned by a
    // login that never completed before a prior restart.
    try { for (const d of fs.readdirSync(this._subsDir)) if (/^con-/.test(d)) fs.rmSync(path.join(this._subsDir, d), { recursive: true, force: true }); } catch { }
  }

  _acctType(a) { return a.type || 'api'; } // legacy records (no type) = API key
  _acctBackend(a) { return a.backend || 'claude'; } // legacy records = Claude
  _localOnlyClaudeSub(a) {
    return this._platform === 'darwin'
      && !!this._credsOf(this._acctBackend(a))?.keychainSensitive
      && this._acctType(a) === 'subscription';
  }
  subDir(id) { return path.join(this._subsDir, id); }
  // ── S2 generic credential helpers (read the harness descriptor, never a backend-id branch) ──
  _credsOf(be) { return harnessOf(be || 'claude').creds; }
  _acctDir(be, id) { return path.join(this._dataDir, this._credsOf(be).subsDirName, id); }
  _readAuthFor(be, id) { return this._credsOf(be).parseAuth(this._acctDir(be, id)); }
  /** LOGIN LIFETIME of an account (2026-09-07, src/login-expiry.js): when does
   *  the LOGIN SESSION itself end, as opposed to "is there a token right now".
   *  The verdict comes from the harness descriptor's optional creds.loginState
   *  — a harness whose credential format carries no deadline simply does not
   *  declare it and gets 'unknown', i.e. NO CLAIM (never 'ok': claiming health
   *  we cannot read is what made the old behaviour surprise people). */
  //  THE ROW, NOT THE SLOT (2026-10-13, owner: "都绑定长期token了，怎么还提示过期"):
  //  login and long-lived token are two facts and a row lives by the better
  //  one, so a dead login with a VALID token reads 'oat-only' (its own
  //  sessions spawn on the token — resolveForSpawn). `opts.slot` asks the
  //  credential FILE alone: a POOLED session reads the file through its
  //  symlink and can never be handed the token, so every pool reader passes it.
  loginStateOf(id, now = Date.now(), opts = {}) {
    try {
      const a = this.get(id);
      if (!a) return LOGIN_UNKNOWN(now);
      const be = this._acctBackend(a);
      const type = this._acctType(a);
      // A pool has no login of its own — it is exactly its members' worst.
      if (type === 'pooled') return this.poolLoginState(id, now);
      if (type !== 'subscription') return LOGIN_UNKNOWN(now); // API keys / oat records have no OAuth login session
      const fn = this._credsOf(be)?.loginState;
      if (typeof fn !== 'function') return LOGIN_UNKNOWN(now);
      const info = fn(this._acctDir(be, id), now);
      return opts && opts.slot ? info : withOat(info, this._oatFact(a), now);
    } catch { return LOGIN_UNKNOWN(now); }
  }
  /** The long-lived token as a LOGIN-VERDICT input ({ present, validUntil }) —
   *  no decryption: only the mint time matters. null = none / not this harness. */
  _oatFact(a) {
    if (!a || !a.oatEnc || !this._credsOf(this._acctBackend(a))?.longLivedToken) return null;
    return { present: true, validUntil: (Number(a.oatMintedAt) || 0) + this.OAT_TTL_MS };
  }
  /** A pool's row summarises its MEMBERS: the worst state among the candidate
   *  members (the accounts it can actually route to), plus the member that
   *  earned it — one dead login inside a pool is the user-actionable fact even
   *  while the pool as a whole still works. */
  poolLoginState(poolId, now = Date.now()) {
    const out = { ...LOGIN_UNKNOWN(now), members: [] };
    let members = [];
    try { members = this._poolLoginCandidates(poolId); } catch { return out; }
    if (!members.length) return out;
    let worst = null;
    for (const m of members) {
      // the SLOT's verdict: a pooled session reads the member's credential file
      // (the token cannot reach it), so the pool's row tells the slot truth —
      // and names the member's token, so the chip can say why it does not help
      const st = this.loginStateOf(m.id, now, { slot: true });
      const oat = !loginUsable(st) ? this._oatFact(this.get(m.id)) : null;
      if (oat && oat.validUntil > now) {
        st.oatValidUntil = oat.validUntil;
        // why the token is not in its folder (lane pool-oat-materialize): this CLI unmeasured / no subscription shape
        const f = this._oatFileFacts.get(m.id);
        const why = f && (f.reason || f.verdict);
        if (why && OAT_FILE_REFUSALS.includes(why)) st.oatFileRefused = why;
      }
      out.members.push({ id: m.id, name: m.name, state: st.state, refreshExpiresAt: st.refreshExpiresAt, msLeft: st.msLeft });
      if (!worst || loginRank(st) > loginRank(worst.st) || (loginRank(st) === loginRank(worst.st) && (st.msLeft ?? Infinity) < (worst.st.msLeft ?? Infinity))) worst = { m, st };
    }
    if (!worst) return out;
    // worstOatValidUntil = THE ESCAPE (a dead slot whose row holds a valid token); a materialized
    // slot carries its own oatValidUntil but serves, so it is never the escape
    return { ...worst.st, worstId: worst.m.id, worstName: worst.m.name, ...(worst.st.oatValidUntil && !loginUsable(worst.st) ? { worstOatValidUntil: worst.st.oatValidUntil } : {}), ...(worst.st.oatFileRefused ? { worstOatFileRefused: worst.st.oatFileRefused, oatFileCli: this.oatFileCaps().cli } : {}), members: out.members };
  }
  /** Pool members for the LOGIN summary — MEMBERSHIP IS NOT ONE QUESTION
   *  (round-2 verifier, reproduced against this instance's own store):
   *
   *  · EXPLICIT list (`members: [...]`): the user NAMED these accounts, so a
   *    signed-out one IS the pool's finding — it is a member the pool was told
   *    to route to and cannot. Include it, exactly as round 1 did.
   *  · IMPLICIT pool (`members: null` — the default, and the shape of the only
   *    pool on the measured instance): membership is DEFINED as "every
   *    logged-in same-backend subscription" (poolMembers). An account that is
   *    signed out was therefore never a member, and summarising the pool over
   *    it made a fully healthy pool read `logged-out` forever, offered to
   *    re-login an account the pool never routes to, and — because worst-of
   *    ranks 'logged-out' above 'expiring' — MASKED the one warning that
   *    matters: the CURRENT target's login dying in 16 h.
   *
   *  The current link target is always in the set even if it has since died:
   *  the pool is pointed AT it, so its login is the pool's problem no matter
   *  which definition of membership brought it there. */
  _poolLoginCandidates(poolId) {
    const a = this.get(poolId);
    const explicit = Array.isArray(a?.members) && a.members.length ? a.members : null;
    const out = new Map();
    if (explicit) {
      const be = this._acctBackend(a);
      for (const x of this._state.accounts) {
        if (this._acctBackend(x) !== be || this._acctType(x) !== 'subscription') continue;
        if (explicit.includes(x.id)) out.set(x.id, { id: x.id, name: x.name });
      }
    } else {
      for (const m of this.poolMembers(poolId)) out.set(m.id, { id: m.id, name: m.name });
    }
    const cur = this.poolCurrent(poolId);
    if (cur && !out.has(cur)) {
      const c = this.get(cur);
      if (c && this._acctType(c) === 'subscription') out.set(cur, { id: cur, name: c.name });
    }
    return [...out.values()];
  }
  /** remoteCreds for resolveForSpawn — the ONE shape ws-create ships to a host
   *  (tar of `files` from srcDir → $HOME/.vibespace/<dirName>, env var pointed
   *  at it, shared subdirs symlinked, poison-heal probe); every field is the
   *  harness descriptor's. `shippable` only exists for keychain-sensitive
   *  harnesses (macOS Keychain-primary dirs must never be copied). */
  _remoteCreds(be, id, a) {
    const c = this._credsOf(be);
    return {
      srcDir: this._acctDir(be, id), dirName: c.subsDirName + '/' + id, envVar: c.spawnEnvVar,
      files: c.files.slice(), symlinks: { ...(c.remoteSymlinks || {}) }, ensureTargets: [...(c.ensureTargets || [])],
      probe: c.probe ? { ...c.probe } : null,
      ...(c.keychainSensitive ? { shippable: !this._localOnlyClaudeSub(a) } : {}),
    };
  }
  subCredsPath(id) { return path.join(this.subDir(id), '.credentials.json'); }
  codexSubDir(id) { return path.join(this._codexSubsDir, id); }

  // Pre-seed an isolated login dir's .claude.json with the onboarding-complete
  // flags (hasCompletedOnboarding/hasTrustDialogAccepted) so the login (run with
  // CLAUDE_CONFIG_DIR=dir) does NOT show the first-run onboarding screen. Setting
  // CLAUDE_CONFIG_DIR isolates the identity (oauthAccount) INTO the dir, so the
  // GLOBAL ~/.claude.json is never clobbered — the whole point.
  _seedConfigDir(dir) { return this._credsOf('claude').seedDir(dir); } // S2: the seeder lives on the claude descriptor

  _load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this._file, 'utf-8'));
      if (parsed && Array.isArray(parsed.accounts)) this._state = parsed;
    } catch { /* fresh install */ }
  }

  _save() {
    const tmp = this._file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this._state, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this._file);
  }

  _notify() { try { this._onChange(this.list()); } catch { } }
  /** A PER-SESSION credential link moved (lane badge-stale, 2026-09-30 — the owner's window said
   *  "全部 → Mat Max" 30+ minutes after the pool engine had moved the conversation to UCI Max).
   *  The link's target IS a fact every client caches: the `active-sessions` payload's
   *  `auth.poolTarget` reads it (server.js poolAuth → poolMemberOfSession → poolCurrentFor →
   *  readlink), and that frame is the page's ONLY source of `auth` (/api/sessions carries none).
   *  `setPoolTarget` notifies through `_notify`; the per-session writer said nothing, so the page
   *  kept the member of the last frame until some unrelated broadcast happened to go out (a
   *  running turn publishes none). THE entry point notifies — never a call site (the engine's
   *  per-session switch, a pin, a partial gather, an auth-failure move, a removed-member
   *  eviction all write through here). ONE notification per burst: a pool pass re-pointing N
   *  conversations in one tick sends one frame (setImmediate after the synchronous pass). */
  _notifyLinks() {
    if (this._linksNotifyArmed) return;
    this._linksNotifyArmed = true;
    setImmediate(() => { this._linksNotifyArmed = false; try { this._onSessionLinks(); } catch { } }).unref?.();
  }

  // THE KEY-FILE LAW (lane oat-census-closure, pool-oat verify r2 O1): `.accounts-key` is the one byte string every
  // stored API key and long-lived token needs. A key is MINTED only when the file is ABSENT (ENOENT) and the store
  // holds NO ciphertext — through src/secret-box.js (tmp + link(2): never over a key another writer landed). Absent
  // while ciphertext exists ⇒ `key-missing`; any other failure (EIO, EACCES, EMFILE, a truncated / bad-length file) ⇒
  // `key-unreadable:<code>` for THIS call. A refusal writes nothing: the reader treats the secrets as unreadable for
  // now (the oat row: F4's rung, nothing moves) and the next call reads again. (The old bare catch minted a new key
  // on ANY read error — one EIO during a sweep, which reads it once per row, orphaned every stored secret.)
  _key() { // routed through THE ONE helper (lane key-file-law-stores): src/key-file.js via secret-box lawfulKey (tmp + link(2) mint)
    const r = lawfulKey(this._keyFile, { hasCiphertext: () => this._holdsCiphertext() });
    if (!r.ok) throw keyRefusal(r.code === 'key-malformed' ? 'key-unreadable:malformed' : r.code, this._keyFile);
    return r.key;
  }
  /** Ciphertext anywhere in the store — in memory, or in accounts.json on disk (a file this process could not load
   *  still holds what it holds: unreadable = assume it does). */
  _holdsCiphertext() {
    if (this._state.accounts.some((a) => a && (a.keyEnc || a.oatEnc))) return true;
    try { return /"(keyEnc|oatEnc)"\s*:/.test(fs.readFileSync(this._file, 'utf-8')); } catch (e) { return !(e && e.code === 'ENOENT'); }
  }

  _enc(text) {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', this._key(), iv);
    const enc = Buffer.concat([c.update(text, 'utf-8'), c.final()]);
    return iv.toString('hex') + ':' + c.getAuthTag().toString('hex') + ':' + enc.toString('hex');
  }

  _dec(blob) {
    const [iv, tag, data] = String(blob).split(':').map((s) => Buffer.from(s, 'hex'));
    const d = crypto.createDecipheriv('aes-256-gcm', this._key(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString('utf-8');
  }

  // Sanitized — NEVER includes key material. Subscription accounts add a
  // read-only identity probe (email/plan/loggedIn) from their creds dir.
  list() {
    return {
      defaultAccountId: this._state.defaultAccountId || null,
      defaultCodexAccountId: this._state.defaultCodexAccountId || null,
      accounts: this._state.accounts.map((a) => {
        const type = this._acctType(a);
        const backend = this._acctBackend(a);
        const base = { id: a.id, name: a.name, type, backend, source: a.source, originHost: a.originHost || null, note: a.note || null, hostLogins: a.hostLogins || null, createdAt: a.createdAt, localOnly: this._localOnlyClaudeSub(a), ...(a.serve ? { serve: { ...a.serve }, inPools: this.poolsWithMember(a.id).length > 0 } : {}) }; // inPools: a lapse's words differ for an account no pool lists (verify r2 ③)
        // POOLED FIRST, for every backend (2.369.18): the codex branch used to
        // run before this one, so a codex pool listed as a bare ChatGPT login
        // — no `pooled`/`current`/`memberOptions`/`auto` — and every client
        // surface (roster menu, switcher, New Session) plus the engine's
        // `type==='pooled' && a.auto` tick enumeration saw a pool with no
        // pool fields. Identity reads THROUGH the symlink via the member's
        // own auth reader; hot-switch support is the capability registry's
        // verdict (codex: 'impossible' — the client hides the toggle).
        if (type === 'pooled') {
          const cur = this.poolCurrent(a.id);
          const info = this._readAuthFor(backend, a.id); // resolves through the symlink
          const curAcct = cur ? this.get(cur) : null;
          // loginState on a pool = its MEMBERS' worst (a pool has no login of
          // its own); the row names the member that earned it so the user can
          // act without opening the pool's Members dialog.
          return { ...base, pooled: true, loggedIn: !!info.loggedIn, email: info.email || null, subscriptionType: info.subscriptionType || null, current: cur, currentName: curAcct?.name || null, members: a.members || null, memberOptions: this.poolMembers(a.id), auto: true, priority: Array.isArray(a.priority) ? a.priority.slice() : [], placement: Array.isArray(a.priority) && a.priority.length ? 'priority' : 'automatic', hot: !!a.hot, hotSupported: capsOf(backend).hotSwitch === 'verified', supported: !this._credsOf(backend).keychainSensitive || this.poolSupported(), loginState: this.poolLoginState(a.id) };
        }
        if (type === 'subscription') {
          // ONE branch for every harness (S2): the descriptor's parseAuth reads
          // the account dir; authMode rides only where the reader reports it
          // (codex), long-lived-token meta only where the harness has one.
          // a.email = manual backfill (setEmail) for dirs whose login never
          // wrote the identity file; the dir's own identity wins when present.
          const info = this._readAuthFor(backend, a.id);
          // loginState (2026-09-07): the LOGIN SESSION's own deadline, so every
          // surface can warn BEFORE the refresh fails instead of after a dead
          // turn. 'unknown' where the harness declares no reader.
          const row = { ...base, loggedIn: info.loggedIn, email: info.email || a.email || null, emailDeclared: !info.email && !!a.email, subscriptionType: info.subscriptionType, loginState: this.loginStateOf(a.id), ...(info.authMode !== undefined ? { authMode: info.authMode } : {}), ...(this._credsOf(backend).longLivedToken ? this._oatMeta(a) : {}) };
          if (row.oat) { const door = this._oatFileDoor(a, row.loginState); if (door) row.oatFile = door; }
          return row;
        }
        return { ...base, tail: a.tail };
      }),
    };
  }

  // ── Subscription accounts (each = its own securestorage creds dir) ──

  // Allocate an empty account + dir. The OAuth login happens in an interactive
  // terminal through vibespace-claude-subscription-login.mjs; the caller
  // watches for the creds/status file, then calls finalizeSubscription.
  createSubscription({ name } = {}) {
    const id = 'sub-' + crypto.randomBytes(6).toString('hex');
    fs.mkdirSync(this.subDir(id), { recursive: true, mode: 0o700 });
    this._seedConfigDir(this.subDir(id));
    const a = { id, name: String(name || '').trim().slice(0, 60) || 'Subscription', type: 'subscription', source: 'login', createdAt: Date.now() };
    this._state.accounts.push(a);
    this._save();
    this._notify();
    return { id, dir: this.subDir(id) };
  }

  // Read-only parse of a subscription account's creds. NEVER writes/refreshes
  // (rotation would break the account, issue #20). Returns loggedIn + identity
  // + the access token IF currently valid (for the usage poll).
  readSubCreds(id) { return this._credsOf('claude').parseAuth(this.subDir(id)); } // parser lives on the claude harness descriptor (S2)

  _subscriptionLoginStatus(id) {
    try {
      const status = JSON.parse(fs.readFileSync(path.join(this.subDir(id), '.vibespace-login-status.json'), 'utf-8'));
      if (status?.state !== 'error' || !/^[a-z0-9-]{1,40}$/.test(status.code || '')) return null;
      return { state: 'error', code: status.code };
    } catch { return null; }
  }

  // After the login terminal wrote creds: pull identity, default the name to
  // the email/plan if the user didn't set one. Returns loggedIn.

  // Re-login IDENTITY GUARD (2.333.0, owner directive "orgid不对得自动变成新条
  // 目"): after a re-login into an EXISTING record's dir, the fresh login may
  // belong to a DIFFERENT Anthropic account (wrong browser profile, shared
  // machine). Silently rebranding the record would splice two accounts' ledger
  // history and pool identity together — so a mismatched login MOVES OUT:
  //   · fresh identity matches ANOTHER existing record → its creds move into
  //     that record's dir (fresh login wins there); this record reverts to
  //     signed-out untouched
  //   · fresh identity matches NO record → a NEW record is minted around it;
  //     this record reverts to signed-out untouched
  //   · same identity (or the record never had one) → normal in-place refresh
  // Identity = orgUuid when both sides have it, else email (case-insensitive).
  // The dir's .claude.json rides along with the creds — it carries the fresh
  // identity and belongs with the login, not with the old record.
  reloginResolve(id) {
    const a = this.get(id);
    if (!a || this._acctType(a) !== 'subscription') throw new Error('not a subscription account');
    const fresh = this.readSubCreds(id);
    if (!fresh.loggedIn || fresh.oatFile) return { outcome: 'pending' }; // our long-lived-token file is not the login being completed
    const norm = (s) => String(s || '').trim().toLowerCase();
    const freshEmail = norm(fresh.email);
    const knownEmail = norm(a.email || (String(a.name || '').includes('@') ? a.name : ''));
    const sameIdentity = !knownEmail || !freshEmail || freshEmail === knownEmail;
    if (sameIdentity) return { outcome: 'same', account: this.finalizeSubscription(id) };

    // ── mismatch: move the fresh login out of this record's dir ──
    const src = this.subDir(id);
    const moveLogin = (destDir) => {
      fs.mkdirSync(destDir, { recursive: true, mode: 0o700 });
      for (const f of ['.credentials.json', '.claude.json']) {
        try { fs.renameSync(path.join(src, f), path.join(destDir, f)); } catch { }
      }
    };
    const other = this._state.accounts.find((x) => x.id !== id
      && capsOf(this._acctBackend(x)).oauthUsage && this._acctType(x) === 'subscription'
      && norm(x.email || (String(x.name || '').includes('@') ? x.name : '')) === freshEmail);
    if (other) {
      moveLogin(this.subDir(other.id));
      this._notify();
      return { outcome: 'moved', movedTo: { id: other.id, name: other.name }, freshEmail: fresh.email, keptName: a.name };
    }
    const created = this.createSubscription({ name: (fresh.email || 'Subscription').slice(0, 60) });
    moveLogin(this.subDir(created.id));
    const finalized = this.finalizeSubscription(created.id);
    this._notify();
    return { outcome: 'split', account: finalized, freshEmail: fresh.email, keptName: a.name };
  }

  finalizeSubscription(id) {
    const a = this.get(id);
    if (!a || this._acctType(a) !== 'subscription') throw new Error('not a subscription account');
    const info = this.readSubCreds(id);
    const loginStatus = this._subscriptionLoginStatus(id);
    if (info.loggedIn && (!a.name || a.name === 'Subscription')) {
      a.name = (info.email || (info.subscriptionType ? info.subscriptionType[0].toUpperCase() + info.subscriptionType.slice(1) : 'Subscription')).slice(0, 60);
      this._save();
    }
    this._notify();
    const { accessToken: _accessToken, ...publicInfo } = info;
    return {
      id, ...publicInfo, name: a.name,
      localOnly: this._localOnlyClaudeSub(a),
      loginFailed: !info.loggedIn && loginStatus?.state === 'error',
      loginErrorCode: !info.loggedIn ? loginStatus?.code || null : null,
    };
  }

  // ── Codex subscription accounts (each = its own CODEX_HOME, auth isolated) ──

  // The shared ~/.codex the per-account homes symlink into. Ensure the symlink
  // TARGETS exist (sessions dir + config.toml) so codex reads/writes go there.
  _codexSharedHome() { return this._credsOf('codex').sharedHome(); } // S2: lives on the codex descriptor
  _seedCodexDir(dir) { return this._credsOf('codex').seedDir(dir); } // S2: the seeder lives on the codex descriptor

  createCodexSubscription({ name } = {}) {
    const id = 'cxs-' + crypto.randomBytes(6).toString('hex');
    fs.mkdirSync(this.codexSubDir(id), { recursive: true, mode: 0o700 });
    this._seedCodexDir(this.codexSubDir(id));
    const a = { id, name: String(name || '').trim().slice(0, 60) || 'ChatGPT', type: 'subscription', backend: 'codex', source: 'login', createdAt: Date.now() };
    this._state.accounts.push(a);
    this._save();
    this._notify();
    return { id, dir: this.codexSubDir(id) };
  }

  // Decode a JWT payload without verifying (identity display only — never trust
  // for auth). Returns {} on any malformation.
  _jwtPayload(tok) {
    try {
      const seg = String(tok).split('.')[1];
      return JSON.parse(Buffer.from(seg.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')) || {};
    } catch { return {}; }
  }

  // Read-only parse of a codex auth.json (never refreshes). Reports loggedIn +
  // auth mode + identity (email/plan) from the id_token claims.
  _parseCodexAuthFile(file) { return this._credsOf('codex').parseAuthFile(file); } // parser lives on the codex harness descriptor (S2)
  readCodexSubAuth(id) { return this._credsOf('codex').parseAuth(this.codexSubDir(id)); }
  // The machine's OWN codex login (~/.codex/auth.json) — the codex counterpart
  // of subscriptionStatus(); identity feeds the codex global↔named-account link.
  codexGlobalStatus() { return this._parseCodexAuthFile(path.join(this._codexSharedHome(), 'auth.json')); }

  finalizeCodexSubscription(id) {
    const a = this.get(id);
    if (!a || this._acctBackend(a) !== 'codex') throw new Error('not a codex account');
    const info = this.readCodexSubAuth(id);
    if (info.loggedIn && (!a.name || a.name === 'ChatGPT')) {
      a.name = (info.email || (info.plan ? 'ChatGPT ' + info.plan : 'ChatGPT')).slice(0, 60);
      this._save();
    }
    this._notify();
    return { id, ...info, name: a.name };
  }

  // ── Config export / import (Backup & migrate, 2.100.0) ──
  // Returns PLAINTEXT secrets — the caller MUST put this inside the export's
  // passphrase-encrypted sensitive blob. API keys are decrypted out of the
  // machine-local .accounts-key store (the key file itself never travels);
  // subscription creds ride as whitelisted dir files. Import re-encrypts under
  // the TARGET machine's own key and recreates the dirs.
  exportBundle() {
    const readFiles = (dir, names) => {
      const out = {};
      for (const n of names) {
        try { out[n] = fs.readFileSync(path.join(dir, n), 'utf-8'); } catch { }
      }
      return out;
    };
    const accounts = this._state.accounts.map((a) => {
      const backend = this._acctBackend(a);
      const type = this._acctType(a);
      const rec = { id: a.id, name: a.name, backend, type, source: a.source, createdAt: a.createdAt };
      if (a.email) rec.email = a.email;
      if (a.tail) rec.tail = a.tail;
      if (a.keyEnc) { try { rec.key = this._dec(a.keyEnc); } catch { } }
      // Long-lived token travels like an API key (decrypted into the
      // passphrase blob; re-encrypted under the TARGET's key on import) — an
      // oat-ONLY account would otherwise import as a dead record (B-211a)
      if (a.oatEnc) { try { rec.oat = this._dec(a.oatEnc); rec.oatMintedAt = a.oatMintedAt || null; } catch { } }
      if (a.oatEnc && a.oatShape) rec.oatShape = a.oatShape; // the subscription SHAPE the target re-derives our file with (no secret in it)
      if (type === 'subscription') {
        // macOS secure storage is Keychain-primary. The local fallback is a
        // same-machine compatibility shadow for launchd and can diverge after
        // refresh-token rotation, so never treat it as a portable backup.
        const c = this._credsOf(backend);
        rec.files = readFiles(this._acctDir(backend, a.id), this._localOnlyClaudeSub(a) ? c.files.filter((x) => x !== c.authFile) : c.files);
        // OUR materialized file is never exported (verify r1 F11: the token rides once, as rec.oat) — the
        // CLI's other keys in it travel; the target re-derives ours from rec.oat
        if (rec.files['.credentials.json'] && a.oatEnc) {
          let f = null; try { f = JSON.parse(rec.files['.credentials.json']); } catch { }
          if (oatFileOurs(f, a.id)) { const rest = credsRestOf(f); if (Object.keys(rest).length) rec.files['.credentials.json'] = JSON.stringify(rest); else delete rec.files['.credentials.json']; }
        }
      }
      return rec;
    });
    return {
      version: 1,
      defaultAccountId: this._state.defaultAccountId || null,
      defaultCodexAccountId: this._state.defaultCodexAccountId || null,
      accounts,
    };
  }

  importBundle(bundle) {
    if (!bundle || !Array.isArray(bundle.accounts)) return { imported: 0, skipped: 0 };
    const FILE_OK = /^[.\w][\w.-]*$/; // whitelist shape — no separators, no traversal
    let imported = 0, skipped = 0;
    for (const rec of bundle.accounts) {
      if (!rec || typeof rec.id !== 'string' || !/^(acct|sub|cxs)-[a-f0-9]{6,}$/.test(rec.id)) { skipped++; continue; }
      if (this._state.accounts.some((a) => a.id === rec.id)) { skipped++; continue; } // never clobber an existing account
      const a = {
        id: rec.id,
        name: String(rec.name || '').slice(0, 60) || rec.id,
        source: rec.source || 'import',
        createdAt: rec.createdAt || Date.now(),
      };
      if (rec.email) a.email = String(rec.email).slice(0, 120);
      // backend = any registered harness with credential mechanics (an unknown
      // id falls back to claude exactly like a legacy record with no backend);
      // harnesses without API keys only ever hold subscription-type records.
      const be = (() => { try { return rec.backend && harnessOf(rec.backend).creds ? rec.backend : 'claude'; } catch { return 'claude'; } })();
      if (!this._credsOf(be).legacyGlobalKey) a.backend = be; // the pre-registry harness's records omit `backend`
      if (rec.type === 'subscription' || !this._credsOf(be).supportsApiKeys) a.type = 'subscription';
      if (rec.key && /^sk-ant-/.test(rec.key)) { a.keyEnc = this._enc(String(rec.key)); a.tail = String(rec.key).slice(-8); }
      else if (rec.tail) a.tail = rec.tail;
      if (rec.oat && /^sk-ant-oat\d{2}-/.test(String(rec.oat))) { a.oatEnc = this._enc(String(rec.oat)); a.oatMintedAt = Number(rec.oatMintedAt) || Date.now(); const sh = oatShapeOf(rec.oatShape); if (sh) a.oatShape = sh; }
      if (rec.files && typeof rec.files === 'object' && a.type === 'subscription') {
        const dir = this._acctDir(be, a.id);
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
        this._credsOf(be).seedDir(dir); // claude: onboarding-complete .claude.json; codex: sessions/config.toml symlinks into the shared ~/.codex
        for (const [n, content] of Object.entries(rec.files)) {
          if (!FILE_OK.test(n) || typeof content !== 'string') continue;
          require('./account-material.js').writePrivateFile(path.join(dir, n), content); // the one 0600 atomic writer of account-dir material
        }
      }
      this._state.accounts.push(a);
      imported++;
      if (a.oatEnc) this.syncOatFile(a.id).catch(() => { }); // ours is re-derived here (the export never carries it)
    }
    // Defaults only when the referenced account actually landed and none is set
    // locally — an import must not silently re-route existing sessions' billing.
    for (const [k, v] of [['defaultAccountId', bundle.defaultAccountId], ['defaultCodexAccountId', bundle.defaultCodexAccountId]]) {
      if (v && !this._state[k] && this._state.accounts.some((a) => a.id === v)) this._state[k] = v;
    }
    if (imported) { this._save(); this._notify(); }
    return { imported, skipped };
  }

  /** Identity email of a claude subscription record: the dir's own identity
   *  wins, then the declared email, then an email-shaped name. */
  identityEmailOf(a) {
    let dirEmail = null;
    try { if (this._acctType(a) === 'subscription' && capsOf(a.backend).oauthUsage) dirEmail = this.readSubCreds(a.id).email; } catch { }
    const v = dirEmail || a.email || (String(a.name || '').includes('@') ? a.name : '');
    return String(v || '').trim().toLowerCase();
  }

  /** Merge duplicate records of the SAME real account (same identity email —
   *  2.205.0, real report: a host add-flow login minted a second record of an
   *  account the user already had; "can't it auto-recognize?"). `fromId` (the
   *  newer dup) folds into `intoId` (the survivor): fresh local creds win
   *  when asked, hostLogins union, metadata kept on the survivor, the dup
   *  record spliced WITHOUT the delete-path host cleanup (its host dirs are
   *  renamed to the survivor by the caller first). */
  mergeSubscription(fromId, intoId, { preferFromCreds = false, liveAccountIds = null } = {}) {
    const from = this._state.accounts.find((x) => x.id === fromId);
    const into = this._state.accounts.find((x) => x.id === intoId);
    if (!from || !into || fromId === intoId) throw new Error('bad merge pair');
    // B-3f8a: NEVER rewrite creds while a session of EITHER side is running.
    // The CLI re-reads .credentials.json per HTTP request (verified vs 2.1.222,
    // SharedContext/devices-and-access.md) — so copying over intoDir/.credentials.json
    // would silently re-bill the survivor's live sessions MID-TURN, and the
    // rmSync(fromDir) would yank creds out from under the merged-away side's
    // live sessions. The caller (server.js, which holds activeSessions) passes
    // the set of account ids with a running session; refuse loudly if hit.
    if (liveAccountIds && (liveAccountIds.has?.(fromId) || liveAccountIds.has?.(intoId))) {
      const e = new Error('cannot merge these accounts while a session using either is running — stop those sessions first');
      e.code = 'merge-account-live';
      throw e;
    }
    // Claude's macOS Keychain service is hashed from the config-dir path
    // (PR #23). Moving fresh fallback bytes to another id does NOT
    // move that Keychain item, so the survivor can keep reading its old token
    // and the new item is orphaned. Keep both records instead of claiming a
    // safe file-only merge.
    if (this._localOnlyClaudeSub(from) || this._localOnlyClaudeSub(into)) {
      throw new Error('macOS Keychain-backed subscriptions cannot be merged across config directories');
    }
    // local creds: bring the dup's dir over when it's fresher/the only login
    try {
      const fromDir = this.subDir(fromId), intoDir = this.subDir(intoId);
      const intoAuth = this.readSubCreds(intoId);
      const intoLogged = intoAuth.loggedIn && !intoAuth.oatFile; // our long-lived-token file is not a login to keep over a real one
      // OUR long-lived-token file is never copied (verify r1 F3): it is re-derived on the survivor from the
      // token the fold moves — only the CLI's other keys in it are material to carry
      let fromBytes = null;
      try { fromBytes = fs.readFileSync(path.join(fromDir, '.credentials.json')); } catch { }
      if (fromBytes && (preferFromCreds || !intoLogged)) {
        let fj = null; try { fj = JSON.parse(fromBytes); } catch { }
        if (oatFileOurs(fj, fromId)) { const rest = credsRestOf(fj); fromBytes = Object.keys(rest).length ? Buffer.from(JSON.stringify(rest)) : null; }
        // F3 (pool-oat verify r2): a survivor holding OUR file keeps the CLI's other keys (mcpOAuth …) — the folded
        // login is written OVER them, and they are archived first (`.dead-<ms>-m…`, 0600). Our token never rests in an
        // archive: it is the store's, and the survivor's sync re-derives it (a live login there keeps it out).
        const intoCreds = path.join(intoDir, '.credentials.json');
        let intoFile = null; if (fromBytes && intoAuth.oatFile) { try { intoFile = JSON.parse(fs.readFileSync(intoCreds, 'utf-8')); } catch { } }
        if (fromBytes && oatFileOurs(intoFile, intoId)) {
          const keep = credsRestOf(intoFile);
          if (Object.keys(keep).length) require('./account-material.js').writePrivateFile(`${intoCreds}.dead-${Date.now()}-m${crypto.randomBytes(3).toString('hex')}`, JSON.stringify(keep));
          let fobj = null; try { fobj = JSON.parse(fromBytes); } catch { }
          if (fobj && typeof fobj === 'object' && !Array.isArray(fobj)) fromBytes = Buffer.from(JSON.stringify({ ...keep, ...fobj }));
        }
        fs.mkdirSync(intoDir, { recursive: true, mode: 0o700 });
        fs.chmodSync(intoDir, 0o700);
        for (const f of ['.credentials.json', '.claude.json']) {
          const src = path.join(fromDir, f);
          const bytes = f === '.credentials.json' ? fromBytes : (fs.existsSync(src) ? fs.readFileSync(src) : null);
          // the one 0600 atomic writer of account-dir material (tmp `wx` 0600 + fchmod + fsync + rename)
          if (bytes) require('./account-material.js').writePrivateFile(path.join(intoDir, f), bytes);
        }
      }
      // the folded dir's archived dead logins MOVE to the survivor before the rm (verify r1 F12 — never destroyed)
      fs.mkdirSync(intoDir, { recursive: true, mode: 0o700 });
      require('./account-material.js').moveCredentialArchives(fromDir, intoDir);
      fs.rmSync(fromDir, { recursive: true, force: true });
    } catch { /* best-effort file consolidation */ }
    if (from.hostLogins) into.hostLogins = { ...(from.hostLogins), ...(into.hostLogins || {}) };
    if (!into.email && from.email) into.email = from.email;
    if (!into.oatEnc && from.oatEnc) { into.oatEnc = from.oatEnc; into.oatMintedAt = from.oatMintedAt; if (!into.oatShape && from.oatShape) into.oatShape = from.oatShape; } // long-lived token survives the fold (B-211a)
    if (!into.note && from.note) into.note = from.note;
    if (this._state.defaultAccountId === fromId) this._state.defaultAccountId = intoId;
    this._state.accounts = this._state.accounts.filter((x) => x.id !== fromId);
    this._oatFileFacts.delete(fromId);
    this._save();
    if (into.oatEnc) this.syncOatFile(intoId).catch(() => { }); // ours is re-derived on the survivor
    this._notify();
    return this.list().accounts.find((x) => x.id === intoId) || null;
  }

  /** Write-through from a host identity probe (2.204.0): remember which
   *  machines hold a per-account login dir for each account, so EVERY view
   *  (incl. the local one, which probes no host) can say "logged in on X"
   *  instead of a bare "not logged in" (real report: an account whose only
   *  login lived on the devbox read as dead on the local view). Cleared for a
   *  host when its probe stops listing the account. */
  noteHostLogins(hostId, ids) {
    if (!hostId) return;
    const set = new Set(ids || []);
    let changed = false;
    for (const a of this._state.accounts) {
      const has = !!a.hostLogins?.[hostId];
      if (set.has(a.id) && !has) { (a.hostLogins ||= {})[hostId] = Date.now(); changed = true; }
      else if (!set.has(a.id) && has) {
        delete a.hostLogins[hostId];
        if (!Object.keys(a.hostLogins).length) delete a.hostLogins;
        changed = true;
      }
    }
    if (changed) { this._save(); this._notify(); }
  }

  /** Decrypted key VALUE for the reveal dialog (API-key accounts only).
   *  Same trust model as the mounts config endpoint (2.108.8, user
   *  directive): single-user instance, cookie-authed — blank secrets that
   *  can never be re-read are worse than showing them on request (real
   *  incident: a removed key was unrecoverable; the Console never re-shows
   *  values). */
  revealKey(id) {
    const a = this._state.accounts.find((x) => x.id === id);
    if (!a) throw new Error('unknown account');
    if (!a.keyEnc) throw new Error('not an API-key account');
    return this._dec(a.keyEnc);
  }

  /** Free-text provenance/annotation shown as a dim tag in the roster —
   *  answers "where did this key come from?" (real report: a key imported
   *  from a host read as live-shared from it; the note + originHost make the
   *  independent-copy semantics visible). */
  /** A member's SERVE state (2026-10-08, lane pool-subscription-lapsed): `{state: 'lapsed', since, why, lastFail}`
   *  when its subscription stopped serving (the harness's closed census — quota.classifyServeFailure), or null.
   *  ON THE ACCOUNT RECORD, through the one atomic writer (`_save`: tmp + rename) — never a sidecar — so it
   *  survives a restart; the member's pool membership, note, links and readings are untouched. Cleared only by
   *  the engine on positive evidence (a reading of the member's own window after `lastFail`). */
  serveStateOf(id) {
    const a = this._state.accounts.find((x) => x.id === id);
    return a && a.serve && typeof a.serve === 'object' ? { ...a.serve } : null;
  }
  setServeState(id, serve) {
    const a = this._state.accounts.find((x) => x.id === id);
    if (!a) throw new Error('unknown account');
    if (serve == null) { if (!a.serve) return null; delete a.serve; }
    else {
      if (serve.state !== 'lapsed') throw new Error(`unknown serve state: ${serve.state}`);
      const since = Number(serve.since), lastFail = Number(serve.lastFail);
      if (!(since > 0) || !(lastFail > 0)) throw new Error('serve.since and serve.lastFail must be instants');
      a.serve = { state: 'lapsed', since, why: String(serve.why || '').slice(0, 200), lastFail, ...(typeof serve.fp === 'string' && serve.fp ? { fp: serve.fp.slice(0, 400) } : {}), ...(typeof serve.todoId === 'string' && serve.todoId && serve.todoId.length <= 80 ? { todoId: serve.todoId } : {}) };
    }
    this._save();
    this._notify();
    return a.serve ? { ...a.serve } : null;
  }

  setNote(id, note) {
    const a = this._state.accounts.find((x) => x.id === id);
    if (!a) throw new Error('unknown account');
    const v = String(note || '').trim().slice(0, 120);
    if (v) a.note = v; else delete a.note;
    this._save();
    return this.list().accounts.find((x) => x.id === id) || null;
  }

  add({ name, key, source = 'manual', originHost = null } = {}) {
    key = String(key || '').trim();
    if (!/^sk-ant-/.test(key)) throw new Error('not an Anthropic API key (must start with sk-ant-)');
    const tail = key.slice(-8);
    // Idempotent: re-adding the same key returns the existing record.
    for (const a of this._state.accounts) {
      if (a.tail === tail) {
        try { if (this._dec(a.keyEnc) === key) return { id: a.id, name: a.name, tail: a.tail, existing: true }; } catch { }
      }
    }
    const a = {
      id: 'acct-' + crypto.randomBytes(6).toString('hex'),
      name: String(name || '').trim().slice(0, 60) || ('API key …' + tail),
      keyEnc: this._enc(key),
      tail,
      source,
      // provenance: the machine this key was imported FROM (display only —
      // the record is an independent copy in this store, not live-linked)
      ...(originHost ? { originHost: String(originHost).slice(0, 60) } : {}),
      createdAt: Date.now(),
    };
    this._state.accounts.push(a);
    this._save();
    this._notify();
    return { id: a.id, name: a.name, tail: a.tail };
  }

  rename(id, name) {
    const a = this._state.accounts.find((x) => x.id === id);
    if (!a) throw new Error('account not found');
    a.name = String(name || '').trim().slice(0, 60) || a.name;
    this._save();
    this._notify();
    return { id: a.id, name: a.name, tail: a.tail };
  }

  // Manual identity backfill: some login flows leave a subscription's creds dir
  // without the identity file (.claude.json oauthAccount) — creds work, but the
  // email is unknowable from disk. The email is what links a named account to
  // the machine's own CLI login (usage merge/dedup), so let the user declare it.
  // Stored on the account record; list() uses it only when the dir has none.
  setEmail(id, email) {
    const a = this._state.accounts.find((x) => x.id === id);
    if (!a) throw new Error('account not found');
    a.email = String(email || '').trim().slice(0, 120) || undefined;
    this._save();
    this._notify();
    return { id: a.id, name: a.name, email: a.email || null };
  }

  // `opts.chooseDefault(poolId, fromId)` / `opts.chooseLink(poolId, fromId, sessKey)` = the ENGINE's decision for a
  // pool default / a per-session link that pointed at the deleted account (verify r2): the store has no usage cache
  // to decide with, so without them the heal below keeps its no-engine fallback (the first live member / the default).
  remove(id, opts = {}) {
    const i = this._state.accounts.findIndex((x) => x.id === id);
    if (i < 0) throw new Error('account not found');
    const a = this._state.accounts[i];
    this._state.accounts.splice(i, 1);
    if (this._state.defaultAccountId === id) this._state.defaultAccountId = null;
    if (this._state.defaultCodexAccountId === id) this._state.defaultCodexAccountId = null;
    // POOL HYGIENE (2.335.0, real report: deleting the account a pool was
    // sitting on left the pool's default symlink AND per-session links
    // dangling — the whole pool showed signed-out and running sessions read
    // creds through a dead link until some spawn happened to heal it).
    // Deleting a member must leave every pool self-consistent NOW.
    if (capsOf(this._acctBackend(a)).oauthUsage && this._acctType(a) === 'subscription') {
      this._save(); // poolMembers below must not offer the removed account
      this._healPoolsAfterRemoval(id, opts);
    }
    // Isolated-login accounts own a creds dir — wipe it (best-effort).
    if (this._acctType(a) === 'pooled') { try { fs.unlinkSync(this._acctDir(this._acctBackend(a), id)); } catch { } try { fs.rmSync(this.poolLinksDir(id), { recursive: true, force: true }); } catch { } } // unlink ONLY — the target is a real account's dir; the links dir holds only symlinks (rm never follows)
    else if (this._acctType(a) === 'subscription') { try { fs.rmSync(this._acctDir(this._acctBackend(a), id), { recursive: true, force: true }); } catch { } }
    this._save();
    this._notify();
  }

  /** Every pool that referenced a just-removed member: strip it from explicit
   *  member lists, re-point the default link if it targeted the removed
   *  account, and re-point (or drop, when no member is left) per-session
   *  links that targeted it. Symlink re-points don't care that the old
   *  target dir is about to be rm'd — order-independent of the wipe. */
  _healPoolsAfterRemoval(removedId, { chooseDefault = null, chooseLink = null } = {}) {
    const readTarget = (p) => { try { return path.basename(fs.readlinkSync(p)); } catch { return null; } };
    for (const pool of this._state.accounts.filter((x) => this._acctType(x) === 'pooled')) {
      try {
        if (Array.isArray(pool.members) && pool.members.includes(removedId)) {
          const rest = pool.members.filter((m) => m !== removedId);
          // NEVER null out the list (review finding, high stakes): null/empty
          // means "ALL logged-in subscriptions" — stripping the LAST explicit
          // member would silently WIDEN the pool onto accounts the user
          // deliberately excluded and re-point billing there. A list of only
          // now-nonexistent ids yields zero members through poolMembers'
          // filter, which is the honest "unusable pool" state.
          if (rest.length) pool.members = rest;
        }
        if (Array.isArray(pool.priority)) pool.priority = pool.priority.filter((m) => m !== removedId); // a deleted account has no place in the manual order
        const alive = this.poolMembers(pool.id);
        if (readTarget(this.subDir(pool.id)) === removedId) {
          if (alive.length) {
            // the ENGINE's decision when it is wired (verify r2) — `alive[0]` only as the no-engine fallback
            let pick = null;
            try { const c = chooseDefault ? chooseDefault(pool.id, removedId) : null; if (alive.some((m) => m.id === c)) pick = c; } catch { }
            const to = alive.find((m) => m.id === pick) || alive[0];
            this.setPoolTarget(pool.id, to.id, { why: 'member-removed' });
            console.warn(`[pool] "${pool.name}" target was the deleted account — re-pointed to ${to.name}${pick ? ' (decided)' : ''}`);
          } else {
            try { fs.unlinkSync(this.subDir(pool.id)); } catch { } // a dangling link reads as a phantom login path; absent = honestly signed-out
            console.warn(`[pool] "${pool.name}" lost its only member to deletion — pool is unusable until a member logs in`);
          }
        }
        for (const l of this.sessionPoolLinks(pool.id)) {
          if (readTarget(l.path) !== removedId) continue;
          // each conversation to where the ENGINE decides for IT (its family view, its pin, its own recent walls —
          // verify r2), else the pool default as before (it had to leave: the account's dir is about to be wiped)
          let chosen = null;
          try { const c = chooseLink ? chooseLink(pool.id, removedId, l.sessKey) : null; if (alive.some((m) => m.id === c)) chosen = c; } catch { }
          const target = chosen || this.poolCurrent(pool.id);
          if (target) {
            require('./account-material.js').repointPoolSymlink(l.path, this.subDir(target), this.subCredsPath(target));
            this._noteSlot({ sessionId: l.sessKey, poolId: pool.id, from: removedId, to: target, why: 'member-removed' });
          }
          else { try { fs.unlinkSync(l.path); } catch { } }
        }
      } catch (e) { console.warn(`[pool] hygiene after removing ${removedId} failed for ${pool.id}:`, e.message); }
    }
  }

  // null = the CLI's own global login is the default for new sessions. Each
  // backend has its OWN default (claude vs codex). When id is given the backend
  // is derived from the account; when clearing (id null) the caller passes it.
  setDefault(id, backend = 'claude') {
    let be = backend;
    if (id != null) {
      const a = this.get(id);
      if (!a) throw new Error('account not found');
      be = this._acctBackend(a);
    }
    this._state[this._credsOf(be).defaultIdField] = id || null; // per-harness default-account field (S2)
    this._save();
    this._notify();
  }

  get(id) { return this._state.accounts.find((a) => a.id === id) || null; }

  getKey(id) {
    const a = this.get(id);
    if (!a) return null;
    try { return this._dec(a.keyEnc); } catch { return null; }
  }

  // Resolve what a create request means into a spawn descriptor.
  //   undefined/null → server default; 'subscription' → the CLI's GLOBAL login
  //   (no env override); 'acct-…'/'sub-…' → that account.
  // Returns null (= global login, no env change) or:
  //   { id, name, tail?, kind:'api'|'subscription',
  //     localEnv: {VAR:val},          // set in the LOCAL process spawn env
  //     secret: {var,value} | null }  // shipped over ssh-stdin for REMOTE (api only)
  /**
   * evaluateOnHost — THE single authority for "how does account X run on
   * machine Y" (B-f531, 2.244.0 — after SIX field incidents where four client
   * surfaces and two server branches each computed their own verdict from
   * their own caches). PURE given hostFacts: the same function feeds the
   * display surfaces (accounts-status `verdicts`) and the spawn path
   * (ws-handler create), so what the UI promises is exactly what the spawn
   * does.
   *
   * @param a          account record (this.get(id))
   * @param hostFacts  null = LOCAL spawn; else the accountsStatus() result
   *                   (+ .transport) — LIVE host facts, never a client cache
   * @param opts       { allowShip } — accounts.shipSubscriptionToRemote
   * @returns {usable, how, reason, linked, held, heldVerified}
   *   how:    'local-env'  spawn locally with the account env
   *           'ship'       creds/key ship to the host (resolveForSpawn path)
   *           'host-held'  host-side ~/.vibespace/subs/<id> dir (nothing ships)
   *           'host-login' the host's own CLI login IS this account (email)
   *   reason (when !usable): 'never-signed-in' | 'ship-disabled' |
   *           'dial-no-ship' | 'held-identity-mismatch'
   * PRECEDENCE (2.243.2 lesson): host-held beats email-linked — the dir's
   * creds are the named account deterministically, while the host's config
   * email goes stale right after a /login switch (2.114.1 class). And when
   * the host REPORTS the dir's actual identity (hostSubEmails) and it does
   * NOT match this account, the dir is poisoned/mislabeled — refuse it
   * loudly instead of billing whoever's creds sit in it.
   */
  evaluateOnHost(a, hostFacts, { allowShip = false } = {}) {
    const backend = this._acctBackend(a);
    // Pooled pseudo-accounts are LOCAL-ONLY: shipping would freeze the pool at
    // spawn time (a copy of the symlink's contents) and break the shared-lock
    // invariant on the host. Never let them fall into the API-key always-ship
    // branch below.
    if (this._acctType(a) === 'pooled') {
      if (hostFacts) return { usable: false, how: null, reason: 'pool-local-only', linked: false, held: false, heldVerified: false };
      const ok = !!this.poolCurrent(a.id) && !!this.readSubCreds(a.id).loggedIn;
      return { usable: ok, how: 'local-env', reason: ok ? null : 'pool-no-target', linked: false, held: false, heldVerified: false };
    }
    const isSub = this._acctType(a) === 'subscription' || !this._credsOf(backend).supportsApiKeys;
    const norm = (v) => String(v || '').trim().toLowerCase();
    const acctEmail = norm(a.email || (String(a.name || '').includes('@') ? a.name : ''));
    if (!isSub) {
      // API keys are the sanctioned programmatic path — always shippable
      return { usable: true, how: hostFacts ? 'ship' : 'local-env', reason: null, linked: false, held: false, heldVerified: false };
    }
    const authNow = this._readAuthFor(backend, a.id);
    const loggedIn = !!authNow.loggedIn && !authNow.oatFile; // our long-lived-token file is the token's road ('oat'), not a login to ship
    // Hosts KNOWN to hold this account's own login (noteHostLogins write-
    // through) minus the host being evaluated: "signed in SOMEWHERE else" is
    // a different situation than "never signed in anywhere" — userN's
    // report: ClaudeLu (held on Novita) showed "never finished signing in"
    // in a CW-H200 session's menu, reading as a broken account (2.244.3).
    const otherHosts = Object.keys(a.hostLogins || {}).filter((h) => h !== hostFacts?.hostId);
    const noLoginReason = () => (otherHosts.length ? 'not-on-this-host' : 'never-signed-in');
    // hasOat = a VALID token only — mirrors resolveForSpawn's oatExpired drop
    // (an expired oat must never rank an account usable: the switcher would
    // kill-then-fail the create, and a DEFAULT account would silently flip to
    // the host login the day it expires). Expired gets its own 'oat-expired'
    // reason below so every surface can say re-mint instead of the §ban-safety
    // ship explanation.
    const hasOat = this._credsOf(backend).longLivedToken && !!a.oatEnc && (a.oatMintedAt || 0) + this.OAT_TTL_MS > Date.now();
    const oatExpired = this._credsOf(backend).longLivedToken && !!a.oatEnc && !hasOat;
    // A DEAD dir login (refresh deadline passed — the tokens are only blanked at
    // the CLI's next failed refresh, so it still parses loggedIn) with a VALID
    // token spawns on the token, exactly like a wiped one (resolveForSpawn).
    const dirDead = loggedIn && hasOat && !loginUsable(this.loginStateOf(a.id, Date.now(), { slot: true }));
    if (!hostFacts) {
      if (loggedIn && !dirDead) return { usable: true, how: 'local-env', reason: null, linked: false, held: false, heldVerified: false };
      // no local login but a long-lived token → spawns via the env token
      if (hasOat) return { usable: true, how: 'oat', reason: null, linked: false, held: false, heldVerified: false };
      if (oatExpired) return { usable: false, how: null, reason: 'oat-expired', linked: false, held: false, heldVerified: false };
      return { usable: false, how: null, reason: noLoginReason(), otherHosts, linked: false, held: false, heldVerified: false };
    }
    const hostEmail = norm(hostFacts[this._credsOf(backend).hostFactsKey]?.email);
    const linked = !!acctEmail && !!hostEmail && acctEmail === hostEmail;
    const held = backend === 'claude' && (hostFacts.hostSubs || []).includes(a.id);
    if (held) {
      const dirEmail = norm(hostFacts.hostSubEmails?.[a.id]);
      if (dirEmail && acctEmail && dirEmail !== acctEmail) {
        return { usable: false, how: null, reason: 'held-identity-mismatch', linked, held, heldVerified: false, dirEmail };
      }
      return { usable: true, how: 'host-held', reason: null, linked, held, heldVerified: !!dirEmail };
    }
    if (linked) return { usable: true, how: 'host-login', reason: null, linked, held, heldVerified: false };
    // Long-lived token: usable on ANY host incl. dial — it rides the secret
    // env channel (nothing rotates, no token-endpoint traffic from the host).
    // Ranked below host-held/linked (a full login there has more capability)
    // and above full-login shipping.
    if (hasOat) return { usable: true, how: 'oat', reason: null, linked, held, heldVerified: false };
    if (loggedIn && allowShip && hostFacts.transport !== 'dial') {
      // macOS Keychain-backed logins never ship (PR #23): the file
      // fallback is a same-machine shadow that forks the rotating refresh
      // token the moment either copy refreshes. Log in ON the host instead
      // (held/linked/oat rungs above stay fully usable for these accounts).
      if (this._localOnlyClaudeSub(a)) return { usable: false, how: null, reason: 'local-only-mac', linked, held, heldVerified: false };
      return { usable: true, how: 'ship', reason: null, linked, held, heldVerified: false };
    }
    // Expired oat beats the generic reasons — 're-mint' is the actionable fix
    if (oatExpired) return { usable: false, how: null, reason: 'oat-expired', linked, held, heldVerified: false };
    if (!loggedIn) return { usable: false, how: null, reason: noLoginReason(), otherHosts, linked, held, heldVerified: false };
    // local-only-mac beats ship-disabled: flipping the ship setting would not
    // make a Keychain-backed login portable — say the real constraint.
    return { usable: false, how: null, reason: hostFacts.transport === 'dial' ? 'dial-no-ship' : this._localOnlyClaudeSub(a) ? 'local-only-mac' : 'ship-disabled', linked, held, heldVerified: false };
  }

  // ── Long-lived OAuth token (oat01, B-211a) ─────────────────────────────
  // `claude setup-token` mints a 1-year subscription token with NO refresh
  // token (verified vs 2.1.225: LONG_LIVED_OAUTH_TOKEN_TTL_SECONDS=31536000,
  // inferenceOnly:true; the client adapts it as {refreshToken:null,
  // expiresAt:null} and NEVER touches the token endpoint). Stored encrypted
  // like API keys. What it buys per placement:
  //   · REMOTE: ships as CLAUDE_CODE_OAUTH_TOKEN via the existing 0600-file +
  //     $(cat …) secret channel (ssh AND dial) — never rotates, so the local
  //     and remote copies can never diverge and the host makes ZERO
  //     token-endpoint calls (§ban-safety's #1 signal gone; the creds-dir
  //     tar dance isn't used for oat accounts).
  //   · LOCAL fallback: an account with no local login but an oat spawns via
  //     the env token (macOS keychain bypassed too).
  // Scope is inference-only (no user:profile): the on-demand quota ⟳ cannot
  // work through an oat, and a 401 (revoked/expired) has NO self-heal — the
  // CLI errors until re-mint. Minting the token is treated as the per-account
  // consent to run it on remote machines (finer-grained than the global
  // shipSubscriptionToRemote toggle, which stays for full-login shipping).
  OAT_TTL_MS = OAT_TTL_MS_SHARED;

  setOat(id, token) {
    const a = this.get(id);
    if (!a) throw new Error('unknown account: ' + id);
    if (!this._credsOf(this._acctBackend(a)).longLivedToken || this._acctType(a) !== 'subscription') throw new Error('long-lived tokens apply to Claude subscription accounts only');
    token = String(token || '').trim();
    // sk-ant-oat01-… today; tolerate future oat revisions, refuse everything
    // else (an API key or a pasted access token here would mis-bill silently)
    if (!/^sk-ant-oat\d{2}-[\w-]{20,600}$/.test(token)) throw new Error('that does not look like a long-lived token (expected sk-ant-oat01-…, from `claude setup-token`)');
    a.oatEnc = this._enc(token);
    a.oatMintedAt = Date.now();
    this._save();
    // THE SAME TRANSACTION, off the loop's back: the store first (the token's authority — a failed file
    // write leaves today's env spawn working), then the file through the ONE queue. `mint` = record the
    // subscription SHAPE off this member's own login file now (CLI 2.1.296's setup-token leaves nothing on
    // disk; the file keeps scopes + subscriptionType when the CLI blanks the tokens), so it outlives that
    // file being archived. The answer's oatFile verdict: await oatFileSettled(id).
    this.syncOatFile(id, { mint: true }).catch(() => { });
    this._notify();
    return { id, mintedAt: a.oatMintedAt };
  }

  clearOat(id) {
    const a = this.get(id);
    if (!a) throw new Error('unknown account: ' + id);
    delete a.oatEnc; delete a.oatMintedAt;
    this._save();
    this.syncOatFile(id).catch(() => { }); // no token ⇒ 'none' ⇒ our file (only ours — the mark names this row) goes
    this._notify();
  }

  // ── THE MATERIALIZED LONG-LIVED TOKEN (lane pool-oat-materialize, design q-035 A) ──
  // A pooled session's CLI reads the member's credential FILE through its symlink,
  // so a token that lives only in accounts.json can never serve it. For a member
  // with NO usable login (the owner's decision 2) the row's oat is ALSO written to
  // <member dir>/.credentials.json in the CLI's MEASURED login shape (expiresAt =
  // mint + OAT_TTL, the row's scopes / subscriptionType, NO refresh token, our
  // `vibespaceOat` mark naming the row) by account-material's 0600 atomic writer —
  // and then the slot law needs nothing: ensureSessionPoolLink / repointPoolSymlink
  // / _noteSlot are untouched, the hot switch onto it is the ordinary re-point. The
  // verdict is PURE (login-expiry materializeVerdict); _syncOatFileNow is its one
  // actor, reached from setOat / clearOat, the CLI version changing, a merge / an
  // import, and oat-file-sync's sweep (a login that dies after the mint).
  // VERIFY R1 (pool-oat-verify, 4c1be7e0e REFUTED): the file is the CLI's bag of
  // top-level keys — we replace claudeAiOauth + the mark and keep the rest (F1); a
  // failed READ is a named refusal, never "unreadable" (F2); ours is the MARK's,
  // so a re-mint swaps our token in place (F3); a token that does not decrypt
  // moves nothing (F4); a known unmeasured CLI keeps our file while a link names
  // the member and the pool stops placing on it (F5); every act is guarded by a
  // fresh stat (F7), refuses a symlinked dir (F8), and runs through ONE queue on
  // fs.promises, one sweep row per loop turn (F13).
  noteCliVersion(v) {
    const before = this.oatFileCaps();
    this._oatCli = v == null || v === '' ? null : String(v);
    const after = this.oatFileCaps();
    const changed = before.ok !== after.ok || before.cli !== after.cli;
    if (changed) this.syncOatFiles().catch(() => { }); // a changed verdict re-syncs every row (queued, off the loop's back)
    return { ...after, changed };
  }
  _oatFixture() {
    if (this._oatFixtureMemo === undefined) {
      try { this._oatFixtureMemo = JSON.parse(fs.readFileSync(this._oatFixturePath, 'utf-8')); } catch { this._oatFixtureMemo = null; }
    }
    return this._oatFixtureMemo;
  }
  /** { ok, known, cli, measured } — ok = cliCaps.oatInFile(the hub's CLI, the fixture) on a platform whose CLI reads
   *  the FILE (the measurement is Linux; macOS keys its keychain by the env string — the pool's own platform rule).
   *  An answer that names no version ('unparsed', F9) is a KNOWN CLI nobody measured. */
  oatFileCaps() {
    const fx = this._oatFixture();
    const cli = cliCaps.cliVersionOf(this._oatCli) || (this._oatCli ? 'unparsed' : null);
    const platformOk = this._platform !== 'darwin' && this._platform !== 'win32';
    return { ok: platformOk && cliCaps.oatInFile(this._oatCli, fx), known: !!cli, cli, measured: fx ? cliCaps.cliVersionOf(fx.cliVersion) : null };
  }
  /** ONE QUEUE for every act on a member's credential file (F13 + F7): a setOat, a clearOat and a sweep row
   *  never interleave on one file. → a promise of the row's result. */
  syncOatFile(id, opts = {}) {
    const run = this._oatChain.then(() => this._syncOatFileNow(id, opts));
    this._oatChain = run.catch(() => null);
    return run;
  }
  /** Resolves once every queued act and running sweep has finished (the POST /oat answer, the suites). */
  async oatFileSettled(id = null) {
    for (let i = 0; i < 1000; i++) {
      const chain = this._oatChain, sweeps = [...this._oatSweeps];
      await Promise.all([chain, ...sweeps.map((s) => s.catch(() => null))]);
      if (chain === this._oatChain && !this._oatSweeps.size) break;
    }
    return id ? (this._oatFileFacts.get(id) || null) : null;
  }
  /** Does any conversation's pool link name member `id` right now? (F5) A claude conversation always runs on its
   *  OWN link (ws-create passes the session key — plan C), so a pool's default link is no running reader. */
  async _oatMemberLinked(id) {
    const want = path.resolve(this.subDir(id));
    const named = async (link) => { try { return path.resolve(path.dirname(link), await fs.promises.readlink(link)) === want; } catch { return false; } };
    const root = path.join(this.dataDir, 'pool-links');
    let pools = [];
    try { pools = await fs.promises.readdir(root); } catch { }
    for (const p of pools) {
      let keys = [];
      try { keys = await fs.promises.readdir(path.join(root, p)); } catch { continue; }
      for (const k of keys) if (await named(path.join(root, p, k))) return true;
    }
    return false;
  }
  async _syncOatFileNow(id, { now = Date.now(), mint = false, quiet = false } = {}) {
    const a = this.get(id);
    if (!a || this._acctType(a) !== 'subscription' || !this._credsOf(this._acctBackend(a))?.longLivedToken) return null;
    const material = require('./account-material.js');
    const dir = this._acctDir(this._acctBackend(a), id);
    const seen = await material.readCredentialFile(dir);
    const ours = oatFileOurs(seen.file, id);
    const fileShape = ours ? null : oatShapeOf(seen.file);
    if (fileShape && (mint || !a.oatShape)) { a.oatShape = fileShape; this._save(); } // the shape outlives the file it came from
    let keyNo = null; // THE KEY FILE as why the token does not read (O1) — the failing call's own refusal
    const token = a.oatEnc ? (() => { try { return this._dec(a.oatEnc); } catch (e) { if (isKeyRefusal(e)) keyNo = e; return null; } })() : null;
    const shape = (a.oatShape && Array.isArray(a.oatShape.scopes) ? a.oatShape : null) || fileShape;
    const body = token && shape ? oatFileBody(token, { expiresAt: (Number(a.oatMintedAt) || 0) + this.OAT_TTL_MS, shape, mintedAt: a.oatMintedAt, account: id }) : null;
    const current = ours && !!body && oatFileCurrent(seen.file, body);
    const caps = this.oatFileCaps();
    const linked = ours && caps.known && !caps.ok ? await this._oatMemberLinked(id) : false;
    const fact = this._oatFact(a);
    const v = materializeVerdict({ file: seen.file, fileState: seen.fileState, dirState: seen.dirState, oat: fact && { ...fact, readable: !!token }, ours, current, shape, caps, linked }, now);
    const out = { verdict: v.verdict, ...(v.reason ? { reason: v.reason } : {}), ...(v.held ? { held: true } : {}), ...(v.verdict === 'read-failed' && seen.code ? { code: seen.code } : {}) };
    if (keyNo && v.reason === 'oat-unreadable') { const [kind, code] = keyNo.code.split(':'); out.reason = kind; if (code) out.code = code; } // the row says restore / retry, never re-mint
    try {
      if (v.verdict === 'materialize') {
        // a login there is archived first (whole — never lost); the new file keeps the CLI's other keys either way
        if (v.archive) out.archived = await material.archiveCredentialFile(dir, now, { expect: seen.stat });
        await material.writeCredentialFile(dir, oatFileMerge(seen.fileState === 'present' ? seen.file : null, body), { expect: v.archive ? null : seen.stat });
        out.wrote = true;
      } else if (v.cleanup) {
        out.removed = await material.removeCredentialFile(dir, { isOurs: (f) => oatFileOurs(f, id), rest: credsRestOf, expect: seen.stat });
      }
    } catch (e) { out.verdict = 'write-failed'; out.code = String((e && e.code) || 'error'); }
    const was = this._oatFileFacts.get(id);
    this._oatFileFacts.set(id, { verdict: out.verdict, at: now, ...(out.code ? { code: out.code } : {}), ...(out.reason ? { reason: out.reason } : {}), ...(out.held ? { held: true } : {}) });
    out.doorMoved = !!(out.wrote || out.removed) || !was || was.verdict !== out.verdict || was.code !== out.code || was.reason !== out.reason || !!was.held !== !!out.held;
    if (out.doorMoved && !quiet) this._notify();
    return out;
  }
  /** Every oat row through the queue, ONE row per loop turn (F13); one roster broadcast when a file moved. */
  syncOatFiles({ now = Date.now() } = {}) {
    const run = (async () => {
      const out = {};
      let moved = false;
      const ids = this._state.accounts.filter((a) => this._acctType(a) === 'subscription' && a.oatEnc).map((a) => a.id);
      for (const id of ids) {
        let r = null;
        try { r = await this.syncOatFile(id, { now, quiet: true }); } catch { r = null; }
        if (r) { out[id] = r.verdict; if (r.doorMoved) moved = true; }
        await new Promise((res) => setImmediate(res));
      }
      if (moved) this._notify();
      return out;
    })();
    this._oatSweeps.add(run);
    run.then(() => this._oatSweeps.delete(run), () => this._oatSweeps.delete(run));
    return run;
  }
  /** The row's door about its materialized token (null = nothing to say): the
   *  slot reading proves 'written' — or 'held' when the hub's CLI is a known
   *  unmeasured one (the sessions on it keep running, nothing new is placed);
   *  a refusal is the last verdict's. */
  _oatFileDoor(a, ls) {
    if (!a || !a.oatEnc) return null;
    const caps = this.oatFileCaps();
    const f = this._oatFileFacts.get(a.id);
    const reason = f && (f.reason || f.verdict);
    // a token that no longer decrypts is the row's fact even while the file it wrote still serves (F4)
    if (reason === 'oat-unreadable' || reason === 'key-missing' || reason === 'key-unreadable') return { state: 'refused', reason, cli: caps.cli, ...(f.code ? { code: f.code } : {}) };
    if (ls && ls.oatFile) return caps.known && !caps.ok ? { state: 'held', reason: 'cli-unmeasured', cli: caps.cli } : { state: 'written', cli: caps.cli };
    if (!reason || !OAT_FILE_REFUSALS.includes(reason)) return null;
    return { state: 'refused', reason, cli: caps.cli, ...(f.code ? { code: f.code } : {}) };
  }

  getOat(id) {
    const a = this.get(id);
    if (!a || !a.oatEnc) return null;
    try { return this._dec(a.oatEnc); } catch { return null; }
  }

  _oatMeta(a) {
    if (!a?.oatEnc) return {};
    const expiresAt = (a.oatMintedAt || 0) + this.OAT_TTL_MS;
    return { oat: true, oatMintedAt: a.oatMintedAt || null, oatDaysLeft: Math.floor((expiresAt - Date.now()) / 86400000) };
  }

  // ── Pooled pseudo-account (B-6217) ──────────────────────────────────────
  // A pooled account is NOT a login of its own: its "creds dir" is a DIRECTORY
  // SYMLINK at data/subs/<poolId> pointing at a REAL subscription's dir, and
  // switching accounts = atomically re-pointing that symlink.
  //
  // Why a DIRECTORY symlink and not copies or a file symlink (proven in
  // scripts/test-creds-symlink-swap.mjs, 8 asserts):
  //   · the CLI writes credentials with atomicWrite = tmp+rename, which
  //     REPLACES a *file* symlink on the first refresh — a *directory* one
  //     survives, because the rename happens INSIDE the resolved dir;
  //   · refreshes therefore land in the canonical account dir, so there is
  //     exactly ONE credential copy and Anthropic's ROTATING refresh token
  //     never gets rotated out from under a sibling session (the reason
  //     per-session copies are unsafe);
  //   · `<dir>/.oauth_refresh.lock` resolves through the symlink to the SAME
  //     real lock a normal session of that account takes ⇒ a pooled session
  //     and a normal session of one account are mutually excluded exactly as
  //     two normal sessions are today. Zero new refresh conflict.
  //   · QX() (the CLI's config-home resolver) returns the env STRING with no
  //     realpath and no caching, so the kernel re-resolves per syscall and a
  //     re-point is visible immediately; the stat'd mtime changes too, which
  //     is what invalidates the CLI's credential cache.
  // LINUX ONLY: on macOS credentials go to a keychain whose service name is
  // sha256(NFC(env string)) — the STRING, not the resolved path — so the pool
  // path would get its own keychain entry and the sharing silently breaks.
  poolSupported() { return process.platform !== 'win32' && process.platform !== 'darwin'; }

  // Candidate members: explicit list (filtered to still-valid logins) or, when
  // the pool declares none, EVERY logged-in Claude subscription (the default
  // the user asked for). Never includes another pool.
  poolMembers(id) {
    const a = this.get(id);
    const be = this._acctBackend(a) || 'claude';
    const all = this._state.accounts.filter((x) => this._acctBackend(x) === be && this._acctType(x) === 'subscription');
    const wanted = Array.isArray(a?.members) && a.members.length ? all.filter((x) => a.members.includes(x.id)) : all;
    const loggedIn = (x) => this._placeable(be, x.id);
    return wanted.filter(loggedIn).map((x) => ({ id: x.id, name: x.name }));
  }
  /** May a NEW placement land on this member (pool-oat-materialize verify r1 F5)? Its file holds a
   *  login — or OUR long-lived-token file while the hub's CLI is not a KNOWN unmeasured one: on an
   *  unmeasured CLI the sessions already linked to it keep running (the file stays — the running
   *  processes are the measured binary) and nothing new is placed there. */
  _placeable(be, id) {
    const info = this._readAuthFor(be, id);
    if (!info.loggedIn) return false;
    if (!info.oatFile) return true;
    const c = this.oatFileCaps();
    return !(c.known && !c.ok);
  }
  /** Is `memberId` one of poolMembers(id)? THE SAME ANSWER as
   *  `poolMembers(id).some((m) => m.id === memberId)` — same roster filter,
   *  same login reader — but it reads ONE login, not every member's
   *  (prod-stall-202, 2026-10-03: the billing-slot check ran per pooled
   *  session per auto-cli account, 13 members × 2 files each, ~9K synchronous
   *  reads a tick over the NFS-backed data dir = 6–15 s with the event loop
   *  stopped). A miss still resolves the harness's account dir as poolMembers'
   *  first read would, so an unregistered harness throws here exactly as it
   *  throws there (both readers are total over the files themselves). */
  isPoolMember(id, memberId) {
    const a = this.get(id);
    const be = this._acctBackend(a) || 'claude';
    const all = this._state.accounts.filter((x) => this._acctBackend(x) === be && this._acctType(x) === 'subscription');
    const wanted = Array.isArray(a?.members) && a.members.length ? all.filter((x) => a.members.includes(x.id)) : all;
    if (!wanted.some((x) => x.id === memberId)) { if (wanted.length) this._acctDir(be, wanted[0].id); return false; }
    return this._placeable(be, memberId);
  }
  /** The pools whose CANDIDATES hold `memberId`, with the pool fields list()'s
   *  pooled row carries (`auto` is always true there, `hot` = !!record.hot) —
   *  the engine's memberPoolsOf answer for the projection, read with ONE login
   *  per pool instead of list()'s every login (prod-stall-202). A pool whose
   *  candidates cannot be read holds nobody, as memberPoolsOf has it. */
  poolsWithMember(memberId) {
    const out = [];
    for (const a of this._state.accounts) {
      if (this._acctType(a) !== 'pooled') continue;
      let member = false;
      try { member = this.isPoolMember(a.id, memberId); } catch { }
      if (member) out.push({ id: a.id, name: a.name, backend: this._acctBackend(a), auto: true, hot: !!a.hot });
    }
    return out;
  }
  /** The pool's CONFIGURED membership (2026-09-28, the removed-member wall):
   *  ids of every same-backend subscription the pool LISTS — the explicit list,
   *  or (members:null) every one of them — WHATEVER their login state. This is
   *  the placement fact the pool verdict judges `currentId` against
   *  (decidePoolSwitch `membership`); `poolMembers` (logged-in only) stays the
   *  CANDIDATE list, because a signed-out member is still a member — its wall
   *  is the login, and it must keep saying "re-login", never "removed". */
  poolMembership(id) {
    const a = this.get(id);
    if (!a || this._acctType(a) !== 'pooled') return [];
    const be = this._acctBackend(a) || 'claude';
    const all = this._state.accounts.filter((x) => this._acctBackend(x) === be && this._acctType(x) === 'subscription');
    const wanted = Array.isArray(a.members) && a.members.length ? all.filter((x) => a.members.includes(x.id)) : all;
    return wanted.map((x) => x.id);
  }

  /** The pool's own symlink path + a member's home dir — per backend (codex
   *  pool = symlink among the CODEX_HOME dirs; P2, design-backend-parity §2). */
  _poolLinkDir(a) { return this._acctDir(this._acctBackend(a), a.id); }
  _poolMemberDir(a, subId) { return this._acctDir(this._acctBackend(a), subId); }

  // The real account a pool currently resolves to, read from the symlink
  // itself (the link IS the state — no second source of truth to drift).
  poolCurrent(id) {
    try {
      const a = this.get(id);
      const t = fs.readlinkSync(this._poolLinkDir(a || { id }));
      const sub = path.basename(t);
      return this.get(sub) ? sub : null;
    } catch { return null; }
  }

  // ── Per-SESSION pool links (B-a612 plan C, 2.315.0) ─────────────────────
  // The pool's default link at data/subs/<poolId> stays THE state for display
  // and for sessions with no model identity. A session that declares a model
  // gets its OWN directory symlink at data/pool-links/<poolId>/<sessKey> —
  // same primitive, same lock/credential invariants (N links over M accounts
  // still leave exactly M credential files; every link to account X resolves
  // to X's one refresh lock), so a fable conversation and an opus conversation
  // can bill to DIFFERENT members simultaneously. The link is created at
  // spawn, re-pointed per session by the auto-switch, dropped at kill, and
  // reconciled at boot (a link whose session is gone is unlinked).
  poolLinksDir(poolId) { return path.join(this.dataDir, 'pool-links', String(poolId).replace(/[^\w-]/g, '')); }
  sessionPoolLinkPath(poolId, sessKey) { return path.join(this.poolLinksDir(poolId), String(sessKey).replace(/[^\w.-]/g, '')); }
  ensureSessionPoolLink(poolId, sessKey, memberId, { why = 'session-link' } = {}) {
    const target = this.get(memberId);
    if (!target || this._acctType(target) !== 'subscription') throw new Error('not a subscription: ' + memberId);
    if (!this.readSubCreds(memberId).loggedIn) throw new Error('pool member not logged in: ' + target.name);
    const link = this.sessionPoolLinkPath(poolId, sessKey);
    const from = this.poolCurrentFor(poolId, sessKey); // read BEFORE the re-point — the ledger records a transition, not a state
    fs.mkdirSync(path.dirname(link), { recursive: true });
    require('./account-material.js').repointPoolSymlink(link, this.subDir(memberId), this.subCredsPath(memberId));
    this._noteSlot({ sessionId: sessKey, poolId, from, to: memberId, why });
    this._notifyLinks(); // the payload's auth.poolTarget just changed — every client caches it (lane badge-stale)
    return link;
  }
  /** Append one credential re-point to the transition ledger. Never throws —
   *  a missing record degrades a later attribution to "unknown", it must never
   *  fail the re-point itself (routing around a dead account is the pool's
   *  whole job). */
  _noteSlot({ sessionId = null, poolId = null, from = null, to = null, why = null } = {}) {
    try { this.slotTransitions.record({ sessionId, poolId, from, to, at: Date.now(), why }); } catch { }
  }
  /** A re-point THIS SERVER DID NOT MAKE (2026-09-07 r2, reproduced).
   *
   *  The daemon's sealed-orders reflex re-points a pool credential link while
   *  the orchestrator is DOWN (src/agentd/agentd.js `_execute` →
   *  account-material.repointPoolSymlink, deliberately bypassing this class —
   *  it runs on a machine with no AccountManager). Without a row for it,
   *  `slotAt()` answers with the last ORCHESTRATOR transition: a confident
   *  WRONG answer instead of the "unknown" the ledger promises, and exactly in
   *  the window where reconstructing history matters most (readings written
   *  during a server outage). The device already reports every event it
   *  executed, with every field the ledger needs — this is where they land, so
   *  "accounts.js is the single writer" stays TRUE and physical rather than
   *  becoming a grep that hides a hole.
   *
   *  `from` is the readlink TARGET (a directory path, the only thing the
   *  daemon can read), `link` names WHICH link moved — a per-session (plan C)
   *  link lives directly under poolLinksDir, anything else is the pool's own
   *  default link and therefore `sessionId:null`.
   *
   *  IDEMPOTENT under a replay: the daemon clears its log only on
   *  `ackPoolOrdersLog`, so a crash between report and ack re-delivers the
   *  same events, and the in-memory dedup does not survive a restart — an
   *  identical (sessionId, to, at) row is one fact. */
  noteDeviceRepoint({ link = null, poolId = null, from = null, to = null, at = Date.now(), why = 'sealed-orders' } = {}) {
    try {
      if (!to || !poolId) return null;
      let sessionId = null;
      const lp = String(link || '');
      if (lp && path.dirname(lp) === this.poolLinksDir(poolId)) sessionId = path.basename(lp);
      const fromBase = from ? path.basename(String(from)) : null;
      const fromId = fromBase && this.get(fromBase) ? fromBase : null; // unresolvable ⇒ say nothing, never guess
      const ts = Number(at) || Date.now();
      if (this.slotTransitions.all().some((r) => r.at === ts && r.to === to && (r.sessionId || null) === sessionId)) return null;
      const row = this.slotTransitions.record({ sessionId, poolId, from: fromId, to, at: ts, why });
      // the daemon moved a link this server's clients still show on its OLD member (lane badge-stale):
      // a per-session link is the payload's auth.poolTarget, the pool default is also the list's `current`
      if (sessionId) this._notifyLinks(); else this._notify();
      return row;
    } catch { return null; }
  }
  /** The real account THIS session bills to: its own link's target, else the
   *  pool default. The link IS the state at both granularities. */
  poolCurrentFor(poolId, sessKey) {
    if (sessKey) {
      try {
        const sub = path.basename(fs.readlinkSync(this.sessionPoolLinkPath(poolId, sessKey)));
        if (this.get(sub)) return sub;
      } catch { }
    }
    return this.poolCurrent(poolId);
  }
  /** THE member a pool SESSION's process speaks as (design-reset-credits r3 —
   *  ONE rule for the engine's credit/reading/wall/fire resolution, the ledger's
   *  attribution and the billing badge). A pool whose backend cannot hot-switch
   *  (`capsOf(backend).hotSwitch !== 'verified'` — codex canonicalizes CODEX_HOME
   *  at startup and keeps the tokens in memory) HOLDS the member its process was
   *  spawned with for the process's whole life:
   *    origin 'stamp'   the spawn stamp ws-create writes (`_heldPoolMember`)
   *    origin 'ledger'  no stamp (a process spawned before the stamp existed):
   *                     the pool default the slot-transition ledger says was
   *                     current at the session's `createdAt` — the last default
   *                     row before it, else (the ledger was recording, no row of
   *                     this pool yet: a pool older than the ledger) the `from` of
   *                     the pool's first row after it, else the current default.
   *                     STABLE: a later move never changes the answer (r4)
   *    origin 'unknown' nothing names it — no stamp, the ledger was not recording
   *                     at `createdAt` (or the start instant itself is unknown:
   *                     `_heldPoolOrigin === 'no-start'`), or the rows on either
   *                     side of the start disagree (an unrecorded re-point) — `id`
   *                     is the link (the pre-stamp answer) but NOTHING may spend on it
   *  Every other pool session (a hot pool, a remote one) bills its own link / the
   *  default (origin 'link', held false). `session` may be null (no live process).
   *  → {id, held, origin} */
  poolMemberOfSession(poolId, session, sessKey = null) {
    const key = sessKey || (session && session._webuiId) || null;
    const link = () => this.poolCurrentFor(poolId, key) || null;
    const a = this.get(poolId);
    if (!a || a.type !== 'pooled' || !session || session._accountId !== poolId || session.host) return { id: a && a.type === 'pooled' ? link() : null, held: false, origin: 'link' };
    if (capsOf(a.backend || session.backend || 'claude').hotSwitch === 'verified') return { id: link(), held: false, origin: 'link' };
    const stamp = typeof session._heldPoolMember === 'string' ? session._heldPoolMember : null;
    if (stamp && this.get(stamp)) return { id: stamp, held: true, origin: session._heldPoolOrigin === 'ledger' ? 'ledger' : 'stamp' };
    // a session restored from a meta that never recorded its start (boot-restore
    // fills `createdAt` with the boot instant): the ledger would answer the pool
    // default at the BOOT, not at the process's start — nothing can name it (r4)
    const at = session._heldPoolOrigin === 'no-start' ? 0 : (Number(session.createdAt) || 0);
    if (at) {
      // THE POOL'S OWN DEFAULT ROWS ON EITHER SIDE OF THE START (r4, reproduced):
      // `before` = the last one at or before `createdAt` (what the default was),
      // `after` = the first one after it — whose `from` IS the default the
      // process started on when no row of this pool precedes the start (a pool
      // created before the ledger existed: every codex pool older than
      // 2026-09-07). Reading only `before` made the answer flip from "the current
      // member" to unknown at the pool's first recorded move — the very row that
      // names it — so a restarted server filed the process's wall on the pool's
      // new member. The two rows must AGREE (`after.from === before.to`): a
      // disagreement is a re-point the ledger never saw, and then the ledger
      // cannot say which side of it the process started on.
      let rows = null;
      try { rows = this.slotTransitions.all(); } catch { rows = null; }
      if (rows && rows.length) {
        let before = null, after = null;
        for (const r of rows) {
          if (r.sessionId || r.poolId !== poolId) continue;
          if (r.at <= at) before = r;
          else { after = r; break; }
        }
        const recording = rows[0].at <= at; // the ledger's oldest retained row predates the start (a trim drops only the oldest)
        let id = null;
        if (before) id = after && after.from && after.from !== before.to ? null : before.to;
        else if (recording) id = after ? (after.from || null) : this.poolCurrent(poolId);
        if (id && this.get(id)) return { id, held: true, origin: 'ledger' };
      }
    }
    return { id: link(), held: false, origin: 'unknown' };
  }
  dropSessionPoolLink(poolId, sessKey) { try { fs.unlinkSync(this.sessionPoolLinkPath(poolId, sessKey)); } catch { } }
  /** Boot reconciliation: unlink per-session links whose session no longer
   *  exists — a leaked link is a billing pointer nobody can see or move. */
  sweepSessionPoolLinks(liveKeys) {
    const root = path.join(this.dataDir, 'pool-links');
    let dropped = 0;
    try {
      for (const poolId of fs.readdirSync(root)) {
        const dir = path.join(root, poolId);
        let entries = []; try { entries = fs.readdirSync(dir); } catch { continue; }
        for (const k of entries) if (!liveKeys.has(k)) { try { fs.unlinkSync(path.join(dir, k)); dropped++; } catch { } }
        try { if (!fs.readdirSync(dir).length) fs.rmdirSync(dir); } catch { }
      }
    } catch { }
    return dropped;
  }
  /** Every live link path of a pool (sealed orders carry these so the daemon
   *  can match a banner to the RIGHT link; old daemons ignore the field and
   *  keep matching only the default link — reduced coverage, never a wrong
   *  re-point). */
  sessionPoolLinks(poolId) {
    try { return fs.readdirSync(this.poolLinksDir(poolId)).map((k) => ({ sessKey: k, path: this.sessionPoolLinkPath(poolId, k) })); } catch { return []; }
  }

  // Atomically re-point the pool at `subId`. symlink-to-temp + rename so a
  // concurrent spawn either sees the old target or the new one, never a gap.
  // The target's creds mtime is bumped because the CLI's credential cache is
  // mtime-gated and two accounts could otherwise share an mtimeMs.
  setPoolTarget(id, subId, { sweepSessionLinks = false, skipSessKeys = null, why = 'pool-target' } = {}) {
    const a = this.get(id);
    if (!a || this._acctType(a) !== 'pooled') throw new Error('not a pooled account');
    const be = this._acctBackend(a) || 'claude';
    const target = this.get(subId);
    if (!target || this._acctType(target) !== 'subscription' || this._acctBackend(target) !== be) throw new Error(`not a ${be} subscription: ` + subId);
    if (!this._readAuthFor(be, subId).loggedIn) throw new Error('subscription not logged in: ' + target.name);
    // ONE material implementation (src/account-material.js, 2.298.0): the
    // same primitive the daemon's sealed-orders reflex executes — data/subs
    // is device #0's account store, and the mechanical act is device-tier.
    // codex pools repoint among CODEX_HOME dirs; the creds-mtime bump is a
    // claude cred-cache detail (null for codex — auth.json needs no bump).
    const mat = require('./account-material.js');
    const bump = this._credsOf(be).bumpFile;
    const fromDefault = this.poolCurrent(id); // BEFORE the re-point
    mat.repointPoolSymlink(this._poolLinkDir(a), this._poolMemberDir(a, subId), bump ? path.join(this._acctDir(be, subId), bump) : null);
    // sessionId null = the POOL DEFAULT moved; it decides for every session
    // that has no link of its own, so the ledger's slotAt() falls back to it.
    this._noteSlot({ sessionId: null, poolId: id, from: fromDefault, to: subId, why });
    // sweepSessionLinks (2.355.0, userW's inc-msz495u6 — "热切换死了"):
    // plan C (2.315.0) gave every live session its OWN link and
    // poolCurrentFor prefers it, which silently DEMOTED the manual target
    // change to new-sessions-only: the default moved while every live
    // session's link stayed on the old member (verified on the reporting
    // instance: default → new member, 16 live links → old member). The USER
    // route passes true when the pool is hot (an explicit pick means "all of
    // it, now"); the ENGINE never passes it — its per-session moves are the
    // model-family projections a blanket sweep would clobber.
    let swept = 0;
    if (sweepSessionLinks) {
      for (const { sessKey, path: lp } of this.sessionPoolLinks(id)) {
        // a conversation PINNED to a member is not the pool's to move (2026-09-28: pin > pool
        // priority order > automatic — the "everything now" act included)
        if (skipSessKeys && typeof skipSessKeys.has === 'function' && skipSessKeys.has(sessKey)) continue;
        const fromLink = this.poolCurrentFor(id, sessKey);
        // no bump here: the pool DEFAULT re-point above already bumped this same target's creds
        // (account-material.js — the bump is load-bearing; test-hot-switch-incident §C pins it)
        try { mat.repointPoolSymlink(lp, this.subDir(subId), null); swept++; this._noteSlot({ sessionId: sessKey, poolId: id, from: fromLink, to: subId, why: why + '-sweep' }); } catch { }
      }
      if (swept) console.log(`[pool] manual target → ${target.name}: repointed ${swept} live session link(s)`);
    }
    this._notify();
    return { id, current: subId, name: target.name, swept };
  }

  createPool({ name, members, backend = 'claude' } = {}) {
    const be = backend || 'claude';
    if (!capsOf(be).pool || !this._credsOf(be)) throw new Error('pooling is not supported for backend ' + be); // unknown ids throw in harnessOf
    // The darwin exclusion is claude-specific (keychain service name = a hash
    // of the env string) — codex auth.json is a plain file, pools work anywhere
    // directory symlinks do.
    if (this._credsOf(be).keychainSensitive && !this.poolSupported()) throw new Error('pooled accounts need a platform with directory symlinks and no keychain-backed credentials (Linux)');
    const id = 'pool-' + crypto.randomBytes(6).toString('hex');
    // auto:true ALWAYS (2026-09-28): the whole-pool manual switch is retired — a pool is
    // placed automatically or by its manual `priority` list (empty = automatic)
    const a = { id, name: String(name || '').trim().slice(0, 60) || 'Pool', type: 'pooled', backend: be, members: Array.isArray(members) && members.length ? members.slice(0, 40) : null, auto: true, priority: [], hot: false, createdAt: Date.now() };
    this._state.accounts.push(a);
    this._save();
    const first = this.poolMembers(id)[0];
    if (!first) { this._state.accounts = this._state.accounts.filter((x) => x.id !== id); this._save(); throw new Error(`no logged-in ${this._credsOf(be).loginLabel} subscription to pool`); }
    this.setPoolTarget(id, first.id);
    this._notify();
    return { id, current: first.id };
  }

  // members / auto / hot. A member list that drops the CURRENT target re-points
  // the default (a pool must always resolve to something) — to the member the
  // ENGINE decides (`chooseMember(fromId, list)`, the pool verdict from the
  // removed member with the new membership, 2026-09-28), never simply the first
  // one. `list[0]` below is ONLY the no-engine fallback (a suite, a store used
  // before the engine is wired): this store holds no usage cache to decide with.
  //
  // MANUAL PRIORITY (2026-09-28, the owner retired the whole-pool manual switch):
  // `priority` = an ORDERED list of member ids — validated here (every id a member
  // of THIS pool, deduped, ≤ 40; [] / null = automatic) and pruned whenever the
  // membership narrows. `auto` is ALWAYS true now: a pool is placed automatically
  // or by its priority, never pinned by hand as a whole — `auto:false` is ignored
  // (said once in the journal; the record keeps `auto` for old clients).
  updatePool(id, { members, auto, hot, priority } = {}, { chooseMember = null } = {}) {
    const a = this.get(id);
    if (!a || this._acctType(a) !== 'pooled') throw new Error('not a pooled account');
    if (members !== undefined) a.members = Array.isArray(members) && members.length ? members.slice(0, 40) : null;
    if (auto === false && !AccountManager._autoOffSaid) { AccountManager._autoOffSaid = true; console.log('[pool] auto:false ignored — a pool is placed automatically or by its manual priority (the whole-pool manual switch is retired, 2026-09-28)'); }
    a.auto = true;
    if (hot !== undefined) a.hot = !!hot;
    if (priority !== undefined) {
      if (priority !== null && !Array.isArray(priority)) throw new Error('priority must be a list of member ids');
      const membership = this.poolMembership(id);
      const seen = new Set(), list = [];
      for (const pid of priority || []) {
        if (typeof pid !== 'string' || !membership.includes(pid)) throw new Error('not a member of this pool: ' + String(pid));
        if (!seen.has(pid)) { seen.add(pid); list.push(pid); }
      }
      if (list.length > 40) throw new Error('a priority lists at most 40 members');
      a.priority = list;
    }
    // a narrowed membership prunes the order (a removed member has no place in it)
    if (Array.isArray(a.priority) && a.priority.length) { const m = this.poolMembership(id); a.priority = a.priority.filter((x) => m.includes(x)); }
    this._save();
    const cur = this.poolCurrent(id);
    // (a LAPSED member is no default either — verify r2 ①, the signed-out twin: every listed member lapsed ⇒ the default stays put)
    const list = this.poolMembers(id).filter((m) => this.serveStateOf(m.id)?.state !== 'lapsed');
    if (list.length && !list.some((m) => m.id === cur)) {
      let pick = null;
      try { const c = chooseMember ? chooseMember(cur, list) : null; if (list.some((m) => m.id === c)) pick = c; } catch { }
      this.setPoolTarget(id, pick || list[0].id, { why: 'removed-from-pool' });
    }
    this._notify();
    return this.get(id);
  }

  /** THE ONE-SHOT RESHAPE of the retired whole-pool manual switch (migration
   *  `2026-09-pool-manual-priority`, 2026-09-28): a pool with `auto:false` was
   *  pinned by hand to its current target — that intent becomes the TOP of a
   *  manual priority (`[current, …the other members in list order]`) and the pool
   *  becomes auto. Nothing moves by itself: #1 is the member it already sits on.
   *  A pool already auto (with or without a priority) is untouched. Idempotent
   *  by construction (a reshaped pool is auto). → [{id, name, priority}] */
  migrateManualPools() {
    const out = [];
    for (const a of this._state.accounts) {
      // MANUAL = what the retired switch READ as manual: `auto` anything but true (the list and the
      // engine's tick both asked `!!a.auto`, so a record with no `auto` field was a manual pool too —
      // verify r1: `auto !== false` skipped it and its hand-picked target became an automatic pool's)
      if (this._acctType(a) !== 'pooled' || a.auto === true) continue;
      const cur = this.poolCurrent(a.id);
      const membership = this.poolMembership(a.id);
      const order = (cur && membership.includes(cur) ? [cur] : []).concat(membership.filter((m) => m !== cur)).slice(0, 40);
      a.priority = order;
      a.auto = true;
      out.push({ id: a.id, name: a.name, priority: order.slice() });
    }
    if (out.length) { this._save(); this._notify(); }
    return out;
  }

  resolveForSpawn(requested, backend = 'claude', opts = {}) {
    if (this._credsOf(backend)?.spawnForm === 'isolated-home') return this._resolveHomeSpawn(backend, requested, opts); // the descriptor's creds row picks the form (rv-harnesses H3)
    if (requested === 'subscription') return null; // the CLI's own global login
    const id = requested || this._state.defaultAccountId;
    if (!id) return null;
    const a = this.get(id);
    if (!a) throw new Error('unknown account: ' + id);
    if (this._credsOf(this._acctBackend(a)).spawnForm !== 'securestorage') throw new Error('not a Claude account: ' + a.name);
    if (this._acctType(a) === 'pooled') {
      let cur = this.poolCurrent(id);
      // SELF-HEAL (2.330.2, real outage: BOTH the pool's target and every
      // per-session link pointed at accounts whose refresh token had aged out
      // while idle, so EVERY resume failed with "pooled target is not logged
      // in" and the user had no way forward). Routing around a dead member is
      // the entire point of a pool — a dead target must re-point, not throw.
      // poolMembers() is already filtered to still-valid logins.
      const liveTarget = (x) => !!x && this._placeable('claude', x); // a member a NEW placement may land on (F5)
      if (!cur || !this.readSubCreds(id).loggedIn || !liveTarget(cur)) {
        const alive = this.poolMembers(id).map((m) => m.id);
        if (!alive.length) {
          // every member left holds only our long-lived-token file and the hub's CLI is a known UNMEASURED one:
          // the conversations already on them keep running; a new one waits for a measured CLI (or a sign-in)
          const held = this._poolLoginCandidates(id).filter((m) => this.readSubCreds(m.id).oatFile).length;
          if (held) throw Object.assign(new Error(`pool "${a.name}" can't start a conversation: its members hold only long-lived tokens and the claude CLI ${this.oatFileCaps().cli || ''} was never measured with one in a member's folder — conversations already running continue; sign a member in, or wait for a measured CLI`), { code: 'oat-cli-unmeasured' });
          throw new Error(`every member of pool "${a.name}" is signed out — re-login one in Manage Agents (the pool cannot route around a fully signed-out member set)`);
        }
        // Prefer a member whose LOGIN SESSION is not already dead (2026-09-07):
        // an 'expired' member still parses as loggedIn (the tokens are only
        // blanked at the CLI's next failed refresh), so without this the
        // self-heal happily re-points onto a login that fails the first turn.
        // A STABLE ordering, never a filter — every member being expired must
        // still start the session (and then say so) rather than throw here.
        alive.sort((x, y) => loginRank(this.loginStateOf(x, Date.now(), { slot: true })) - loginRank(this.loginStateOf(y, Date.now(), { slot: true })));
        let pick = null;
        // (the chooser is TOLD which pool it decides for — the one this spawn resolved — and that this is the POOL's
        // default it is placing, not one conversation: a conversation's pin must never become the pool default, verify r2)
        try { const c = opts.chooseMember?.(id, { forDefault: true }); if (alive.includes(c)) pick = c; } catch { }
        pick = pick || alive[0];
        const was = cur;
        this.setPoolTarget(id, pick);
        cur = pick;
        console.warn(`[pool] "${a.name}" target ${was || '(none)'} is signed out — re-pointed to ${this.get(pick)?.name || pick} so the session can start; re-login the dead account in Manage Agents`);
        try { global.__vsEvent?.('pool-target-signed-out', { detail: `${was || 'none'}→${pick}` }); } catch { }
      }
      // A LAPSED SUBSCRIPTION (verify r2 ①, the dead-login twin): a member whose `serve` record says lapsed is never
      // the member a conversation STARTS on — the default is re-pointed off it like a signed-out target, and when no
      // listed, signed-in, active member is left the placement is REFUSED by name (`all_lapsed`), never a first turn
      // that fails with the vendor's 403.
      const lapsed = (x) => !!x && this.serveStateOf(x)?.state === 'lapsed';
      const servable = (x) => liveTarget(x) && !lapsed(x);
      const activeAlt = () => {
        const alive = this.poolMembers(id).map((m) => m.id).filter((x) => !lapsed(x));
        let c = null;
        try { c = opts.chooseMember?.(id, { forDefault: true }); } catch { }
        return alive.includes(c) ? c : (alive[0] || null);
      };
      if (lapsed(cur)) {
        const alt = activeAlt();
        if (!alt) throw Object.assign(new Error(`every member of pool "${a.name}" that is signed in has an inactive subscription — renew one and press Re-check on its row in Manage Agents, or add a member`), { code: 'all_lapsed' });
        const was = cur;
        this.setPoolTarget(id, alt);
        cur = alt;
        console.warn(`[pool] "${a.name}" target ${this.get(was)?.name || was} has an inactive subscription — re-pointed to ${this.get(alt)?.name || alt} so the session can start`);
      }
      // No remoteCreds: shipping would copy the symlink's CONTENTS to a fixed
      // remote dir, freezing the pool at spawn time and (on a macOS host)
      // landing in a per-path keychain entry. Pools are local-only for now.
      // Per-session link (plan C): a session with an identity gets its own
      // symlink so concurrent conversations on different models can bill to
      // different members. The CHOICE is the caller's (chooseMember reads the
      // usage caches, which this store deliberately doesn't); default = the
      // pool's current target, i.e. exactly the legacy behaviour.
      if (opts.sessionKey) {
        let member = null;
        try { member = opts.chooseMember?.(id); } catch { } // the pool THIS spawn bills — the caller never re-derives it (verify r2)
        // The chooser ranks by QUOTA (it reads the usage caches); credentials
        // are this store's authority. A member that is signed out is not a
        // candidate no matter how much quota it shows — same outage, second
        // door (a per-session link pinned to a dead account).
        if (!servable(member)) {
          if (member) console.warn(`[pool] chooser picked ${lapsed(member) ? 'lapsed' : 'signed-out'} member ${member} — falling back to the live target`);
          member = null;
        }
        member = member || cur;
        // THE OWNER'S 全B (2026-09-28): a conversation never STARTS on a member the pool no longer lists — the
        // default can still name one (a removal the engine has not acted on yet, a boot before its first sweep):
        // then the pool's own choice for its default, else the first signed-in member it lists; with none at all
        // the placement is REFUSED with the removal's own sentence (nothing may bill the removed member).
        const listedNow = this.poolMembership(id);
        if (member && !listedNow.includes(member)) {
          const alive2all = this.poolMembers(id).map((m) => m.id);
          const alive2 = alive2all.filter((x) => !lapsed(x));
          let alt = null;
          try { const c = opts.chooseMember?.(id, { forDefault: true }); if (alive2.includes(c)) alt = c; } catch { }
          alt = alt || alive2[0] || null;
          if (!alt && alive2all.length) throw Object.assign(new Error(`"${this.get(member)?.name || member}" was removed from pool "${a.name}" and every member left that is signed in has an inactive subscription — renew one and press Re-check on its row in Manage Agents, or add a member`), { code: 'all_lapsed' });
          if (!alt) throw Object.assign(new Error(`"${this.get(member)?.name || member}" was removed from pool "${a.name}" and no other member can take over — sign a member of the pool in, or add one`), { code: 'removed_no_candidate' });
          member = alt;
        }
        const link = this.ensureSessionPoolLink(id, opts.sessionKey, member, { why: 'spawn' });
        // `linkPath` NAMES the credential symlink (2026-09-07 readings-by-slot):
        // it is the SLOT, and a consumer that needs it (the statusline's
        // per-write resolution) must not have to guess which localEnv key holds
        // it. poolTarget is only where the link points RIGHT NOW.
        return { id: a.id, name: a.name, kind: 'subscription', pooled: true, poolTarget: member, sessionLink: true, linkPath: link, localEnv: { [this._credsOf('claude').spawnEnvVar]: link }, secret: null };
      }
      return { id: a.id, name: a.name, kind: 'subscription', pooled: true, poolTarget: cur, linkPath: this._acctDir('claude', id), localEnv: { [this._credsOf('claude').spawnEnvVar]: this._acctDir('claude', id) }, secret: null };
    }
    if (this._acctType(a) === 'subscription') {
      const info = this.readSubCreds(id);
      // Long-lived token (B-211a): rides the API-key secret channel for
      // remote spawns (both remote paths check .secret BEFORE the creds-dir
      // ship, so an oat account never tars its rotating login to a host).
      // Locally the dir login stays authoritative when present (hot-swap +
      // full capabilities); with NO local login the env token IS the spawn.
      const oatExpired = a.oatEnc && (a.oatMintedAt || 0) + this.OAT_TTL_MS < Date.now();
      const oat = oatExpired ? null : this.getOat(id);
      const oatSecret = oat ? { var: 'CLAUDE_CODE_OAUTH_TOKEN', value: oat } : null;
      // THE MATERIALIZED TOKEN (lane pool-oat-materialize): OUR file in the dir,
      // holding this row's token, on a measured CLI IS the spawn — the CLI reads
      // it like a login and NO CLAUDE_CODE_OAUTH_TOKEN rides the env (the env
      // road defaults the model to sonnet: oat-in-file.json's oat-env). Remote
      // spawns keep the secret channel (no creds dir is ever shipped for it).
      if (oat && info.oatFile && info.accessToken === oat && this.oatFileCaps().ok) {
        return { id: a.id, name: a.name, kind: 'subscription', oatOnly: true, oatFile: true, localEnv: { [this._credsOf('claude').spawnEnvVar]: this._acctDir('claude', id) }, secret: oatSecret };
      }
      // our token file is not a LOGIN: without the above it spawns on the env
      // road, or (its token ended) is refused by name like a missing login
      const loginInDir = !!info.loggedIn && !info.oatFile;
      // …and so does a DEAD dir login (2026-10-13): an 'expired' login still
      // parses loggedIn, and spawning on it fails the first refresh while the
      // row's chip says the token keeps it running — the token IS the spawn.
      const dirDead = !!oat && loginInDir && !loginUsable(this.loginStateOf(id, Date.now(), { slot: true }));
      if ((!loginInDir || dirDead) && oat) {
        return { id: a.id, name: a.name, kind: 'subscription', oatOnly: true, localEnv: { CLAUDE_CODE_OAUTH_TOKEN: oat }, secret: oatSecret };
      }
      // Expired oat: fail the CREATE with the real reason instead of letting
      // the CLI 401 opaquely mid-session (a long-lived 401 has no self-heal).
      // loggedIn + expired-oat just drops the secret — the dir login works
      // locally and the remote paths give their normal actionable errors.
      if (!loginInDir && a.oatEnc && oatExpired) throw new Error(`the long-lived token for ${a.name} has expired — re-mint it in Manage agents (⋯ → Long-lived token)`);
      if (!loginInDir) throw new Error('subscription not logged in: ' + a.name);
      return {
        id: a.id, name: a.name, kind: 'subscription', oatExpired: oatExpired || undefined,
        localEnv: { [this._credsOf('claude').spawnEnvVar]: this._acctDir('claude', id) }, secret: oatSecret,
        // REMOTE: ship the creds dir to the host so the remote CLI reads THIS
        // account's login (securestorage relocated; config stays ~/.claude).
        // probe: newest-wins keeps a POISONED remote file forever (e.g. a
        // Console /login inside a remote session wipes .credentials.json to {}
        // with a fresh mtime) — a remote primary file MISSING the marker is
        // deleted before extract so the valid local copy always restores it.
        remoteCreds: this._remoteCreds('claude', id, a), // shippable:false on a Keychain-primary Mac dir (must never be copied)
      };
    }
    let key = null, keyNo = null;
    try { key = this._dec(a.keyEnc); } catch (e) { if (isKeyRefusal(e)) keyNo = e; }
    if (!key) throw keyNo ? Object.assign(new Error(`account key unavailable (${a.name}) — ${keyNo.message}`), { code: keyNo.code }) : new Error('account key unavailable (decryption failed): ' + a.name); // O1: the key file's refusal, said
    return { id: a.id, name: a.name, tail: a.tail, kind: 'api', localEnv: { ANTHROPIC_API_KEY: key }, secret: { var: 'ANTHROPIC_API_KEY', value: key } };
  }

  // ISOLATED-HOME spawn (creds.spawnForm 'isolated-home' — codex): undefined/null → the harness's own global
  // login (default) or its shared home when none; an account id → that account's own dir as spawnEnvVar.
  _resolveHomeSpawn(backend, requested, opts = {}) {
    if (requested === 'subscription') return null; // codex's own global login
    const id = requested || this._state[this._credsOf(backend).defaultIdField];
    if (!id) return null;
    const a = this.get(id);
    if (!a) throw new Error('unknown account: ' + id);
    // codex POOL (P2, cold-switch v1): CODEX_HOME = the pool's symlink among
    // the member CODEX_HOME dirs — a spawn resolves through it to whichever
    // member the engine currently targets; switches restart the session
    // (kill+resume, the existing cold machinery). Self-heal a dangling link
    // to the first healthy member, exactly like the claude resolve branch.
    if (this._acctType(a) === 'pooled') {
      if (this._acctBackend(a) !== backend) throw new Error('not a ' + harnessOf(backend).label + ' account: ' + a.name);
      let cur = this.poolCurrent(id);
      if (!cur || !this._readAuthFor(backend, cur).loggedIn) {
        const first = this.poolMembers(id)[0];
        if (!first) throw new Error(`pool "${a.name}" has no logged-in ${this._credsOf(backend).loginLabel} member`);
        this.setPoolTarget(id, first.id);
        cur = first.id;
      }
      // THE CONVERSATION'S PIN (2026-09-28): a codex process HOLDS the member its CODEX_HOME names
      // for its whole life, so a pinned conversation spawns straight onto the pinned member's own
      // home (the pool's symlink would give it the pool's current member) — only when the pin is
      // a logged-in member of this pool; else the pool's member, as before (the pin kept)
      let pinned = null;
      try { const m = opts.pinned && opts.chooseMember ? opts.chooseMember(id) : null; if (m && m !== cur && this.poolMembers(id).some((x) => x.id === m) && this._readAuthFor(backend, m).loggedIn) pinned = m; } catch { pinned = null; }
      if (pinned) return { id: a.id, name: a.name, kind: backend + '-pooled', pinnedMember: pinned, localEnv: { [this._credsOf(backend).spawnEnvVar]: this._acctDir(backend, pinned) }, secret: null, remoteCreds: null };
      return { id: a.id, name: a.name, kind: backend + '-pooled', localEnv: { [this._credsOf(backend).spawnEnvVar]: this._acctDir(backend, id) }, secret: null, remoteCreds: null };
    }
    if (this._acctBackend(a) !== backend) throw new Error('not a ' + harnessOf(backend).label + ' account: ' + a.name);
    const info = this._readAuthFor(backend, id);
    if (!info.loggedIn) throw new Error(backend + ' account not logged in: ' + a.name);
    return {
      id: a.id, name: a.name, kind: backend + '-subscription',
      localEnv: { [this._credsOf(backend).spawnEnvVar]: this._acctDir(backend, id) }, secret: null,
      // REMOTE: ship auth.json to the host's CODEX_HOME copy; sessions/config
      // symlink the host's own ~/.codex (targets ensured first) so threads +
      // settings stay shared on the host, auth isolated per account.
      remoteCreds: this._remoteCreds(backend, id, a),
    };
  }

  // ── Add a CONSOLE account (its minted API key) WITHOUT nuking the global
  // subscription. A console /login mints primaryApiKey into ~/.claude.json AND
  // wipes .credentials.json (destructive). We protect the global creds by
  // pointing CLAUDE_SECURESTORAGE_CONFIG_DIR at a throwaway dir — the wipe lands
  // THERE, ~/.claude/.credentials.json is untouched (its token reads from
  // securestorage). The minted key still lands in the shared ~/.claude.json, so
  // capture reads it via importFromCli. Config dir stays ~/.claude → no
  // first-run onboarding. Throwaway dir discarded after.
  beginConsoleLogin() {
    const id = 'con-' + crypto.randomBytes(6).toString('hex');
    const dir = path.join(this._subsDir, id);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    this._seedConfigDir(dir);
    return { id, dir };
  }
  captureConsoleLogin(id, { name } = {}) {
    if (!/^con-[a-f0-9]+$/.test(id)) throw new Error('bad login id');
    const dir = path.join(this._subsDir, id);
    // With CLAUDE_CONFIG_DIR=dir the console login minted primaryApiKey into
    // dir/.claude.json (isolated — ~/.claude.json untouched). Read it there.
    let pk = null, org = null;
    try {
      const cfg = JSON.parse(fs.readFileSync(path.join(dir, '.claude.json'), 'utf-8'));
      pk = cfg?.primaryApiKey; org = cfg?.oauthAccount?.organizationName || null;
    } catch { }
    if (typeof pk !== 'string' || !/^sk-ant-/.test(pk)) return { captured: false };
    const account = this.add({ name: name || (org ? org + ' (Console)' : 'Console API'), key: pk, source: 'console-login' });
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { }
    return { captured: true, account };
  }

  // A subscription account's read-only access token for the usage poll (null if
  // expired/absent — we NEVER refresh; a running session or a next-use refreshes
  // it). Used by server.js to poll per-account /api/oauth/usage.
  usageToken(id) {
    const a = this.get(id);
    // Anthropic-only poll — codex usage is OpenAI-side, not surfaced here.
    if (!a || !capsOf(this._acctBackend(a)).oauthUsage || this._acctType(a) !== 'subscription') return null;
    // never our materialized long-lived token (pool-oat-materialize verify r1 F10): it is inference-only and
    // was never measured as a direct bearer — an oat-only row refuses the ⟳ / identity reads as before
    const info = this.readSubCreds(id);
    return info.oatFile ? null : (info.accessToken || null);
  }

  // ── Read-only probes of the CLI's own login state (NEVER written) ──

  // Subscription = global OAuth login present in ~/.claude/.credentials.json.
  subscriptionStatus() {
    let loggedIn = false;
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude', '.credentials.json'), 'utf-8'));
      loggedIn = !!raw?.claudeAiOauth?.accessToken;
    } catch { }
    let email = null, org = null;
    if (loggedIn) {
      try {
        const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude.json'), 'utf-8'));
        email = cfg?.oauthAccount?.emailAddress || null;
        org = cfg?.oauthAccount?.organizationName || null;
      } catch { }
    }
    return { loggedIn, email, org };
  }

  // The CLI's console login mints primaryApiKey in ~/.claude.json — importable.
  cliPrimaryKey() {
    try {
      const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude.json'), 'utf-8'));
      const pk = cfg?.primaryApiKey;
      if (typeof pk === 'string' && /^sk-ant-/.test(pk)) {
        const tail = pk.slice(-8);
        return {
          present: true,
          tail,
          org: cfg?.oauthAccount?.organizationName || null,
          imported: this._state.accounts.some((a) => a.tail === tail),
        };
      }
    } catch { }
    return { present: false };
  }

  importFromCli() {
    try {
      const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude.json'), 'utf-8'));
      const pk = cfg?.primaryApiKey;
      if (typeof pk !== 'string' || !/^sk-ant-/.test(pk)) throw new Error('no primaryApiKey in ~/.claude.json — log in to a Console account first');
      const org = cfg?.oauthAccount?.organizationName;
      return this.add({ name: org ? org + ' (API)' : 'Console API', key: pk, source: 'cli-import' });
    } catch (e) { throw new Error(e.message); }
  }
}

module.exports = { AccountManager };
