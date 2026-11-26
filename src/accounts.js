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
const SR = require('./store-read.js');           // the B-f276 family (lane bl-windows, 主开发 r2947 / r3043): accounts.json under THE STORE READ
const HOLD = require('./store-read-hold.js');    // …on the family's helper (bl-jobs, r3019): the hold, its read again, the torn bytes' copy
const i18nKey = (k) => k;   // the extraction marker (scripts/i18n-extract.mjs): the client words a For-you item with t(key)
const ACCOUNTS_TORN_TEXT = 'The accounts file is damaged — its bytes are kept beside it. Nothing is changed and no conversation starts on another login until it is mended or removed and VibeSpace restarted.';   // r3129 (5): torn bytes never mend by themselves — their own words
const ACCOUNTS_HELD_TEXT = 'The accounts could not be read — none is shown as gone. Nothing is changed and no conversation starts on another login until they read; VibeSpace reads them again by itself.';   // r3046: ONE notice while the list is unread
const { tokenTieOf } = require('./login-tie.js'); // the refresh token's fingerprint, kept in MEMORY only (row B-87fd identity unit 3, r2779)
const accountIdentity = require('./account-identity.js'); // PURE (row B-87fd unit 2): the ONE identity record + the ONE «same account?» comparison
const DISPLAY = require('./account-display-facts.js'); // B-360d (lane chrome-157): the list's sign-in facts, read OFF the loop and kept a folder
// B-360d, THE DECISION ROAD's bound (主开发 r1221): a DECIDER counts a folder's kept sign-in facts only while the snapshot that read
// or confirmed them (each sign-in file's stamp: size + time) started within this — a sign-in changed under the hub from a terminal is
// seen by a decider within it; a confirmation is asked behind the ask at half of it
const DECIDE_WITHIN_MS = 10000;
// …and a person's act waits for the folders it compares at most this long (a stalled unrelated share never holds a press)
const PERSON_BOUND_MS = 6000;
// THE RELOGIN's BEFORE (row B-87fd identity unit 3): kept in memory from the «sign in again» press until its resolve — a sign-in
// that takes longer reads as a LOST before (the row then asks, unless its own word settles it); the held sign-in's folder
const RELOGIN_BEFORE_TTL_MS = 30 * 60e3;
const RELOGIN_HELD = '.vibespace-relogin-held';
/** the row's own WORD for its address: the typed one, else a name that is an address (the release's knownEmail) — or null */
const reloginWordOf = (a) => { const w = (a && (a.email || (String(a.name || '').includes('@') ? a.name : ''))) || ''; return String(w).trim() || null; };
const RR = require('./run-reads.js'); // B-403e: one ask per file of the mount per synchronous run
const { get: harnessOf, list: listHarnesses } = require('./harnesses'); // S2: per-harness credential mechanics live on the descriptor (creds)
const path = require('path');
const PinRecord = require('./pool-pin-record.js'); // lane lg-group-parents B-526c unit 2: the person's pin records leave with the links' boot sweep
const { presetOf: builtInProviderOf, fitsHarness: providerFitsHarness } = require('./model-providers.js'); // PURE: a built-in record's id (pv-anthropic-…) is never a third-party account (lane lg-providers U2); a pool's fallback provider serves its harness (B-d578)
const os = require('os');
const crypto = require('crypto');
const { capsOf } = require('./backend-caps.js'); // PURE registry: per-backend hot-switch verdict rides list() so the UI never offers a dead toggle
const { loginRank, loginUsable, withOat, oatFileOf, oatFileOurs, usageBearerOk, credsRestOf, oatFileMerge, oatFileCurrent, oatShapeOf, storedShapeOf, oatFileBody, materializeVerdict } = require('./login-expiry.js'); // PURE: which login is the WORST of a pool's members; the materialized long-lived token's verdict
const { identityRowState } = require('./oat-identity-model.js'); // PURE: what the roster says of a row's token identity (lane oat-identity-fix)
const { probeEligibility, probeRecordOf } = require('./auto-cli-model.js'); // PURE: may the quota panel probe PROVE this row; its last failed probe, bounded (lane auto-cli-oat-unprobeable)
const cliCaps = require('./cli-caps.js'); // PURE: oatInFile(version, fixture) — a measured CLI version gates the materialized token
const { lawfulKey } = require('./secret-box.js'); // THE KEY-FILE LAW (src/key-file.js, lane key-file-law-stores): mint only when ABSENT with no ciphertext (tmp + link(2)); else a named refusal
// why a row's long-lived token is NOT in its folder — the row's door names each (pool-oat-materialize + verify r1)
const OAT_FILE_REFUSALS = Object.freeze(['cli-unmeasured', 'no-scopes', 'write-failed', 'read-failed', 'dir-symlink', 'oat-unreadable', 'key-missing', 'key-unreadable']);
// THE KEY-FILE LAW's two refusals (lane oat-census-closure, pool-oat verify r2 O1): `key-missing` (absent while the store
// holds ciphertext — restore the backup) and `key-unreadable:<code>` (EIO / EACCES / EMFILE / a bad length …) — never a new key
function keyRefusal(reason, file) {
  const [kind, code] = String(reason).split(':');
  const words = code === 'vault_locked'
    ? 'the vault is locked — the stored keys open after the owner unlocks it with the second password on this instance\'s page; the owner has already been told (For you names what is waiting on it) — nothing was written'
    : kind === 'key-missing'
    ? 'the key file is missing but this store holds encrypted secrets — restore it from a backup (no new key was made: it could never decrypt them)'
    : `the key file could not be read (${code || 'error'}) — nothing was written and no new key was made`;
  return Object.assign(new Error(`${file}: ${words}`), { code: String(reason) });
}
const isKeyRefusal = (e) => !!e && /^key-(missing|unreadable(:.*)?)$/.test(String(e.code || ''));
// two shapes say the same plan to a person: the same TYPE and TIER (a sign-in's wider scopes are no change of plan — acceptance r1)
const sameWordOf = (x, y) => !!x && !!y && (x.subscriptionType || null) === (y.subscriptionType || null) && (x.rateLimitTier || null) === (y.rateLimitTier || null);
const planNames = require('./plan-names.js'); // PURE (lane oat-add-door): the guided door's choices
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
const { isLedgerHeld } = require('./slot-transitions.js');   // B-f276 slot-ledger-gap: the held ledger's one answer
// THE PROVIDER OF A POOL MEMBER (q-053 P0b, lane pool-provider-aware): every account answers ONE provider — the record
// the provider store answers for it (the lookup that store registers: setProviderLookup(account → record)), else
// its harness's FIRST-PARTY subscription, read off the harness's own creds row (`loginLabel` — "Claude subscription",
// "ChatGPT subscription"; the CLI's own login, every pool member today). A LABEL on the member, never a member:
// readings and rejections stay the credential SLOT's. `models` is absent on it: a member of the conversation's OWN
// provider serves its model by construction (account-pool-auto, THE PROVIDER rule 1).
// SEAM (P0a, lane provider-record, cbbbe0e6): the lookup = `(acct) => providers.forAccount(acct)` (src/server/provider-store.js
// — accountProviderId + the rows filled from the harness's catalog); its presets then answer every account and this
// fallback only covers a harness with no preset.
const CROSS_PROVIDER_VALUES = Object.freeze(['never', 'allow']); // a pool's crossProvider (absent = 'never', the owner's default)
const FALLBACK_PROVIDERS_MAX = 8; // a pool's fallbackProviders (B-d578, the fallback member): at most 8 third-party providers
// The long-lived-token lifetime has ONE definition (2026-09-07 r2): the panel
// and the readings repair must date an oat's death exactly the way the spawn
// resolver does, and they read it from src/login-state.js (no AccountManager
// to construct at migration time). Same number, one place.
const { OAT_TTL_MS: OAT_TTL_MS_SHARED } = require('./login-state.js');

// THE LOCAL FACET (lane cli-self-measure): the hub's own check of the CLI it spawns, as the words read it — elapsed minutes and
// «late» computed HERE (the store owns the clock), so every sentence is a pure function of the answer
function localFacetOf(caps, now = Date.now()) {
  const l = caps && caps.local;
  if (!l || typeof l.state !== 'string') return {};
  const startedAt = Number(l.startedAt) || null;
  return { local: { state: l.state, ...(startedAt ? { elapsedMin: Math.max(0, Math.floor((now - startedAt) / 60e3)) } : {}), ...(l.state === 'checking' && Number(l.lateAt) && now >= Number(l.lateAt) ? { late: true } : {}), typicalMin: Math.max(1, Math.round((Number(l.typicalMs) || 300e3) / 60e3)), ...(Number(l.killAt) && startedAt ? { boundMin: Math.round((Number(l.killAt) - startedAt) / 60e3) } : {}), ...(l.reason && l.reason.code ? { reason: String(l.reason.code), observation: String(l.reason.observation || ''), ...(l.reason.version ? { reasonVersion: String(l.reason.version).slice(0, 20) } : {}), ...(l.reason.machine ? { reasonMachine: String(l.reason.machine) } : {}) } : {}) } };
}

// (B-ba7d) the name an account is SHOWN by, and a stored name's mask — ONE function each (src/key-names.js; usage-history asks it too)
const { publicNameOf, maskDefaultKeyName } = require('./key-names.js');

// B-574d unit 1 (a) cure (主开发 r3763, the should): THE SAVES OF ONE REQUEST — the /api/accounts door runs each write request inside a
// context, and every save made in its async chain counts there: the reply waits only for ITS act's saves (a pool tick or a reading's
// save in the same window is no reason to hold it, nor to answer «not on disk» for an act that saved nothing)
const SAVES = new (require('async_hooks').AsyncLocalStorage)();
/** run `fn` with `ctx` ({ saves: 0 }) as the saves' context — the count of the saves made in fn's async chain lands in ctx.saves */
function countingSaves(ctx, fn) { return SAVES.run(ctx, fn); }
class AccountManager {
  constructor({ dataDir, onChange, onSessionLinks, platform = process.platform, oatFixture = null, mintFixture = null, safeFs = null, displayMaxAgeMs = 60000, storeWriter = null }) {
    this.dataDir = dataDir;
    this._storeWriter = storeWriter;   // B-574d unit 1: the store writer accounts.json is written through (a suite hands its own; else the hub's one)
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
    // B-403e: the folders whose files a pool pass, a record and a broadcast ask — one ask per file per synchronous run (a
    // write this process makes under them drops the run's answers whole)
    for (const d of [this._subsDir, this._codexSubsDir, path.join(dataDir, 'pool-links')]) RR.watch(d);
    this._onChange = onChange || (() => {});
    this._onSessionLinks = onSessionLinks || (() => {}); // a per-session link moved (see _notifyLinks)
    this.slotTransitions = new SlotTransitions({ dataDir });
    // THE MATERIALIZED LONG-LIVED TOKEN (lane pool-oat-materialize): the hub's CLI
    // version (src/server/oat-file-sync.js learns it the way backend-status does —
    // `claude --version`) and the measurement that grants that version (the
    // fixture) gate every write. Unknown version ⇒ nothing is written.
    this._oatCli = null;
    this._oatCliBin = null;    // lane cli-self-measure: {path, cmd, sha256, identity} of the binary that answered (oat-file-sync)
    this._cliMeasured = null;  // …and the hub's OWN measurement of it (src/server/cli-self-measure.js hands it in: noteCliMeasured)
    this._cliNoteHook = null;  // …which is told synchronously at every version note (it decides checking / pass from its ledger)
    this._cliRecheck = null;   // the version clock's tick (oat-file-sync registers it; the 60 s binary-identity check asks it)
    this._oatFixturePath = oatFixture || path.join(__dirname, '..', 'scripts', 'fixtures', 'oat-in-file.json');
    // the scopes each measured CLI version's mint asks for (lane oat-add-door: way ② of the guided door — cli-caps mintScopesOf)
    this._mintFixturePath = mintFixture || path.join(__dirname, '..', 'scripts', 'fixtures', 'oat-mint-scopes.json');
    this._oatFileFacts = new Map(); // id → the last verdict (the row's door)
    this._oatChain = Promise.resolve(); // THE ONE QUEUE of the oat's acts on member credential files (verify r1 F13 / F7)
    this._oatSweeps = new Set();       // sweeps in flight (oatFileSettled waits for them too)
    // B-360d (lane chrome-157; 主开发 r1201 / r1217): THE LIST READS NO FILE ON THE LOOP. Each account folder's DISPLAY facts (who it
    // is, its sign-in state) are read OFF the loop through the tree's file door (SafeFs: a worker, a deadline a call) and KEPT a
    // folder; list(), rowOf() and their broadcast answer from what is kept, a row in one of three honest states (read with its age,
    // not read yet, could not be read by name). The DECISION readers (_placeable, evaluateOnHost, the finalizes) read fresh.
    this._displayMaxAgeMs = displayMaxAgeMs;
    // the file door: the hub hands its own (server.js); a store built with none (a tool, a suite) makes its OWN — the same door, a
    // worker thread with its deadline (one, unref'd: it never holds a process open), built at the first read. ONE road either way.
    const door = safeFs != null ? (typeof safeFs === 'function' ? safeFs : () => safeFs)
      : () => this._ownDoor || (this._ownDoor = new (require('./safe-fs.js').SafeFs)({ poolSize: 1, name: 'accounts-door' }));
    this._display = DISPLAY.create({ safeFs: door, onLanded: () => { this._landedN = (this._landedN || 0) + 1; this._notifyRowsSoon(); } });
    this._state = { version: 1, defaultAccountId: null, defaultCodexAccountId: null, accounts: [] };
    this._load();
    this._finishHeldMoves();   // r4177 (1): an asking row whose sign-in never reached the hold — set aside before anything starts on it
    // Console-login scratch dirs (con-*) are transient; drop any abandoned by a
    // login that never completed before a prior restart.
    try { for (const d of fs.readdirSync(this._subsDir)) if (/^con-/.test(d)) fs.rmSync(path.join(this._subsDir, d), { recursive: true, force: true }); } catch { }
    this._displayAll();   // B-360d: the start — every account folder read once, off the loop (each row «not read yet» until it lands)
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
  _readAuthFor(be, id) { return this._signInAnswer(this.get(id), () => this._credsOf(be).parseAuth(this._acctDir(be, id))); }
  /** 主开发 r4177 (1) / r4200 (1)(2) — THE ONE CHOKE POINT: every read of a row's sign-in folder that decides «signed in» (readSubCreds,
   *  the pool's placement, the remote ship, the pool-to-subscription link, the engine's read) and the list's display rows answer through
   *  this rule: while a row ASKS, the signed-out shape ONLY — no token, no identity of the sign-in in question, whatever its folder
   *  holds (its move into the hold could not finish). `read` runs only for a row that does not ask */
  _signInAnswer(a, read) { return a && a.reloginAsk ? { loggedIn: false } : read(); }
  /** An isolated-home account's spawn env: the descriptor's `creds.spawnEnv(dir)` when it declares one (antigravity:
   *  HOME = the account's root + the bus disabled — a name no `*EnvVar` field may carry, those are stripped from
   *  every agent), else its one `spawnEnvVar` pointed at the dir (codex's CODEX_HOME). */
  _homeSpawnEnv(be, dir) {
    const c = this._credsOf(be);
    return typeof c.spawnEnv === 'function' ? c.spawnEnv(dir) : { [c.spawnEnvVar]: dir };
  }
  /** Every harness's default-account field (creds.defaultIdField — claude's, codex's, antigravity's …): the store's
   *  list / remove / export / import walk THESE, so a harness with a roster needs no edit here (lane antigravity-harness). */
  _defaultIdFields() {
    const out = [];
    for (const h of listHarnesses()) { const f = h.creds && h.creds.defaultIdField; if (typeof f === 'string' && f && !out.includes(f)) out.push(f); }
    return out;
  }
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
        if (why === 'no-scopes') st.oatChoose = this.oatShapeOffer().choices.length > 0;   // lane oat-add-door: the guided door's way ② — offered here or not
      }
      out.members.push({ id: m.id, name: m.name, state: st.state, refreshExpiresAt: st.refreshExpiresAt, msLeft: st.msLeft });
      if (!worst || loginRank(st) > loginRank(worst.st) || (loginRank(st) === loginRank(worst.st) && (st.msLeft ?? Infinity) < (worst.st.msLeft ?? Infinity))) worst = { m, st };
    }
    if (!worst) return out;
    // worstOatValidUntil = THE ESCAPE (a dead slot whose row holds a valid token); a materialized
    // slot carries its own oatValidUntil but serves, so it is never the escape
    return { ...worst.st, worstId: worst.m.id, worstName: worst.m.name, ...(worst.st.oatValidUntil && !loginUsable(worst.st) ? { worstOatValidUntil: worst.st.oatValidUntil } : {}), ...(worst.st.oatFileRefused ? { worstOatFileRefused: worst.st.oatFileRefused, oatFileCli: this.oatFileCaps().cli } : {}), members: out.members };
  }
  /** poolLoginState's display twin (B-360d): the members' kept facts, never a file */
  poolLoginStateShown(poolId, now = Date.now()) {
    const out = { ...LOGIN_UNKNOWN(now), members: [] };
    let members = [];
    try { members = this._poolLoginCandidatesShown(poolId); } catch { return out; }
    if (!members.length) return out;
    let worst = null;
    for (const m of members) {
      // the SLOT's verdict: a pooled session reads the member's credential file
      // (the token cannot reach it), so the pool's row tells the slot truth —
      // and names the member's token, so the chip can say why it does not help
      const st = this._loginStateShown(this.get(m.id), now, { slot: true });
      const oat = !loginUsable(st) ? this._oatFact(this.get(m.id)) : null;
      if (oat && oat.validUntil > now) {
        st.oatValidUntil = oat.validUntil;
        // why the token is not in its folder (lane pool-oat-materialize): this CLI unmeasured / no subscription shape
        const f = this._oatFileFacts.get(m.id);
        const why = f && (f.reason || f.verdict);
        if (why && OAT_FILE_REFUSALS.includes(why)) st.oatFileRefused = why;
        if (why === 'no-scopes') st.oatChoose = this.oatShapeOffer().choices.length > 0;   // lane oat-add-door: the guided door's way ② — offered here or not
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

  // THE B-f276 FAMILY'S GRAVEST STORE (lane bl-windows, 主开发 r2947 / r3043): accounts.json under THE STORE READ, on the family's helper
  // (src/store-read-hold.js). The release read ANY failure — a read that failed or bytes that do not parse — as a fresh install, and the
  // first adding save wrote its one row over the file: every other account, every pool and their order gone. Now «not there» alone is a
  // fresh list; a failed read HOLDS it: ONE read-only fact every consumer asks (`held()`), nothing written over the file (the save's
  // guard, every site), every adding and changing act refused by name (accounts_unread, 503), NOTHING starts or resumes on another login
  // by a guess (the spawn door refuses), and the helper reads it again off the loop; a lift ADOPTS the file. A restart while held reads
  // the same file again: held again.
  _accountsValid(v) { return !!v && typeof v === 'object' && !Array.isArray(v) && Array.isArray(v.accounts); }
  _load() {
    this._hold = HOLD.create({
      file: this._file, valid: (v) => this._accountsValid(v), code: 'accounts_unread', aside: (mark) => `${this._file}.corrupt-${mark}`,
      words: (h) => (h && h.code === 'torn bytes' ? this._tornWords(null)
        : `the accounts could not be read (${h ? h.code : 'unreadable'}) — nothing was changed and nothing starts on another login until they read; VibeSpace reads them again by itself`),
      // the helper's journal says «then it starts empty» for torn bytes: here they stay HELD (r3043) — its lines said true
      log: (line) => { if (/kept aside as .* — it starts empty/.test(line)) return; console.warn('[accounts] ' + String(line).replace(' — held while its bytes are copied aside; then it starts empty', ' — held while its bytes are copied aside; the accounts stay held (never «none») until the file is mended or removed')); },
      onLift: (v, facts) => this._lifted(v, facts),
    });
    let read; try { read = { text: fs.readFileSync(this._file, 'utf-8') }; } catch (error) { read = { error }; }   // the manager's own start
    const a = SR.storeAnswer(read, { valid: (v) => this._accountsValid(v) });
    if (this._hold.start(a) === 'data') this._state = a.value;
  }
  /** the torn hold's words (r3104 / r3129 (5)): WHERE the damaged bytes are kept (by base name, once the copy exists), and what the
   *  person can do — never «restore that copy» (it is the damaged bytes); they do not mend by themselves */
  _tornWords(aside) {
    return `the accounts file is damaged — ${aside ? `its damaged bytes are kept beside it as ${aside}` : 'its damaged bytes are being copied beside it'}; nothing is changed and nothing starts on another login meanwhile. It does not mend by itself: mend the file by hand and restart VibeSpace, or remove it and restart to start with no accounts (the old sign-ins stay on disk unused, and each account is signed in again)`;
  }
  /** the hub's For-you tray (server.js, once it exists): the held list is TOLD ONCE (r3046) — and a start that READS closes any item of
   *  that kind a held life left open (r3129 (1): its id lived in memory only; «mend and restart» must end the notice) */
  setUserTodos(todos) { this._todos = todos || null; if (this.held()) this._fileHeldNotice(); else this._closeHeldNotice(); }
  /** the open For-you items of the held kinds (this life's, or one an earlier life left) — never another filer's under the same key */
  _openHeldItems() {
    const todos = this._todos;
    try { return todos && typeof todos.forSession === 'function' ? todos.forSession('accounts').filter((i) => i && i.origin === 'login' && (i.text === ACCOUNTS_HELD_TEXT || i.text === ACCOUNTS_TORN_TEXT)) : []; } catch { return []; }
  }
  /** r3173 (2): the held items the PERSON hid (✕) — never filed again while that hold lasts (a restart while still held included) */
  _hiddenHeldItems() {
    const todos = this._todos;
    try { return todos && typeof todos.hiddenFor === 'function' ? todos.hiddenFor('accounts').filter((i) => i && i.origin === 'login' && (i.text === ACCOUNTS_HELD_TEXT || i.text === ACCOUNTS_TORN_TEXT)) : []; } catch { return []; }
  }
  _fileHeldNotice() {
    const todos = this._todos, h = this.held();
    if (!todos || typeof todos.add !== 'function' || !h) return;
    if (h.code === 'torn bytes' && !this._torn) return;   // r3129 (5): the torn notice is filed once its copy exists (it names it)
    const text = this._torn ? ACCOUNTS_TORN_TEXT : ACCOUNTS_HELD_TEXT;
    const open = this._openHeldItems();
    for (const i of open) if (i.text !== text) { try { todos.setStatus(i.id, 'done', 'system'); } catch (e) { console.warn('[accounts] the other cause\'s notice could not be closed (it stays until the next start reads):', e && e.message); } }   // the other cause's item: its fact ended
    if (this._hiddenHeldItems().some((i) => i.text === text)) return;   // r3173 (2): the person hid this notice — it is not filed again for this hold
    const same = open.find((i) => i.text === text);
    if (same) { this._heldTodoId = same.id; return; }   // r3129 (1): an item a restart while still held left open IS this hold's — adopted, never a second
    try {
      const item = todos.add('accounts', {
        origin: 'login', kind: 'notice', urgency: 'high', by: 'system', sessionName: 'Manage Agents', text,
        detail: `${h.why}. No account is added, changed or removed and nothing is written over the list meanwhile; this notice closes ${this._torn ? 'at the next start of VibeSpace that reads the file (once it is mended or removed)' : 'when the accounts read'}.`,   // r3173 (5)
        i18n: { text: { key: this._torn ? i18nKey('The accounts file is damaged — its bytes are kept beside it. Nothing is changed and no conversation starts on another login until it is mended or removed and VibeSpace restarted.') : i18nKey('The accounts could not be read — none is shown as gone. Nothing is changed and no conversation starts on another login until they read; VibeSpace reads them again by itself.'), params: {} }, source: { key: i18nKey('Manage agents') } },
      });
      this._heldTodoId = (item && item.id) || null;
    } catch (e) { console.warn('[accounts] could not file the For-you notice about the accounts:', e && e.message); }
  }
  _closeHeldNotice() {
    this._heldTodoId = null;
    const todos = this._todos;
    if (!todos || typeof todos.setStatus !== 'function') return;
    for (const i of [...this._openHeldItems(), ...this._hiddenHeldItems()]) { try { todos.setStatus(i.id, 'done', 'system'); } catch (e) { console.warn('[accounts] the accounts\' notice could not be closed:', e && e.message); } }   // r3173 (2): a hidden one too — the next hold says it afresh
  }
  /** the hold LIFTED (src/store-read-hold.js): the file read (its value, or null: «not there» twice in a row — a fresh list) */
  _lifted(v, facts = {}) {
    if (facts && facts.setAside) {
      // r3019 / r3043 — «EMPTY» IS NOT SAFE WHERE A REMOVER READS THE STORE: the sign-in expiry sweep and the account migrations read
      // this list's silence. Torn bytes, once the helper made their copy, stay HELD for this life — never lifted as empty, and (r3129 (4))
      // NOT put back on the helper's ladder: bytes that do not parse do not mend by themselves — no read and no journal line every
      // 30 s, the first «since» kept, said once. The hold ends at a start that reads the file (mended) or finds it «not there» (removed)
      const since = (this._torn && this._torn.since) || (facts.was && facts.was.since) || Date.now();
      if (!this._torn) console.warn(`[accounts] accounts.json did not parse — its damaged bytes are kept beside it as ${facts.setAside}; the accounts stay HELD (never «none») until the file is mended or removed and VibeSpace restarted`);
      this._torn = { since, aside: facts.setAside };
      this._fileHeldNotice();   // the torn notice — now that its copy exists (it names it)
      this._notify();           // every page learns the hold's true words
      return;
    }
    this._torn = null;
    this._state = v && this._accountsValid(v) ? v : { version: 1, defaultAccountId: null, defaultCodexAccountId: null, accounts: [] };   // a lift ADOPTS the file
    this._finishHeldMoves();   // r4177 (1): the list's first read of this life — as at the start
    try { this._displayAll(); } catch { }   // the start's folder reads, now over the list (off the loop)
    this._closeHeldNotice();
    this._notify();
  }
  /** THE ONE READ-ONLY FACT «the list is unread» (主开发 r3043) — {code, at, why} while held (a failed read, or torn bytes kept aside),
   *  else null. Every consumer that must not act on an EMPTY list asks it (never «unknown account», never «no limit», never «gone») */
  held() {
    if (this._torn) return { code: 'torn bytes', at: this._torn.since, why: this._tornWords(this._torn.aside) };
    const h = this._hold && this._hold.held();
    return h ? { code: h.code, at: h.since, why: this._hold.words() } : null;
  }
  /** THE REFUSAL BY NAME while held (accounts_unread, 503): what was refused, then the hold's words */
  _heldRefusal(what) { const h = this.held(); return Object.assign(new Error(`${what}: ${h ? h.why : 'the accounts could not be read'}`), { code: 'accounts_unread', status: 503 }); }
  /** a person's adding or changing act while held: refused BY NAME (accounts_unread, 503) before anything moves */
  _refuseWhileHeld(what = 'changing the accounts') { if (this.held()) throw this._heldRefusal(what); }

  _save({ now = false, why = 'the change' } = {}) {
    if (this._torn) { if (!this._tornSaveSaid) { this._tornSaveSaid = true; console.warn('[accounts] an accounts change was refused: the file is damaged, and nothing is written over it until it is mended or removed'); } return; }   // THE GUARD for torn bytes held (r3043)
    if (this._hold && !this._hold.writable('an accounts change')) return;   // THE GUARD (r2947 (1)): every one of the 35 sites — nothing written over a file that could not be read
    // B-574d unit 1 (主开发 r3450 / r3455): accounts.json goes through THE STORE WRITER — its thread writes the temp, SYNCS it, renames
    // it, so a power loss never leaves an empty or torn list (which the store-read law would then hold); the hub's loop never waits on
    // the data folder for it (before: writeFileSync + renameSync on the loop at every one of ~40 saves, unsynced). The bytes are made
    // AT the write (a burst of saves is one write) and the write is urgent (`durable`), as the old write was immediate. A write
    // queued before a hold never lands the held list: the producer refuses (EHELD) and the writer keeps it owed. A person's act
    // answers after its landing (account-usage-routes.js's /api/accounts door, the config import, the mint's save: `persisted()`)
    this._saveSeq = (this._saveSeq || 0) + 1;
    { const c = SAVES.getStore(); if (c) c.saves++; }   // this request's own save (the door's count)
    const W = this._writer();
    W.dirty(this._file, { name: 'accounts.write', mode: 0o600, produce: () => {
      if (this._torn || (this._hold && this._hold.held())) throw Object.assign(new Error('accounts.json is held (it could not be read, or its bytes are damaged) — nothing is written over it until it reads'), { code: 'EHELD' });
      return JSON.stringify(this._state, null, 2);
    } });
    // 主开发 r3782 — THE LAW: A SAVE THAT CARRIES A SIGN-IN IS IN THE FILE BEFORE ITS CALL RETURNS, as at the release: `now` (the seven
    // calls that add, set, move, import, merge or remove a key or a long-lived token, and the two boot migrations that reshape the list)
    // goes by the store writer's own SYNCHRONOUS road (flushSync: its thread writes, syncs and renames while the loop waits — a small
    // file, and only when a person or a mint changes a sign-in). By construction the member's own file is then written after the list,
    // the hub never hands a conversation a value the file does not hold, and a kill loses nothing the release kept. A landing that FAILS
    // throws `not-durable` by name (the caller rolls the change back where it can: nothing is handed out from memory). Every other save
    // (the pool's ticks, the display, the billing marks: the many) rides the writer off the loop
    if (now) {
      let r = null; try { r = W.flushSync([this._file], { waitedBy: `accounts.json: ${why}` }); } catch (e) { r = { left: [{ file: this._file, why: (e && e.message) || 'the writer threw' }] }; }
      const miss = !r ? { why: 'the store writer did not answer' } : r.deferred ? { why: 'the hub is stopping' } : (r.left || []).find((x) => x && x.file === this._file);
      if (miss) throw Object.assign(new Error(`accounts.json could not be written (${miss.why || 'the write failed'}) — ${why} was not saved`), { code: 'not-durable', status: 503, signInSave: true });
      return true;
    }
    W.durable(this._file).catch(() => { });
    return true;
  }
  /** (主开发 r4048) a save a sign-in's place depends on, where the act cannot stop on a failed landing (it already happened): the
   *  synchronous road, and when that cannot land the writer keeps the write owed (it writes it again) and the act says its own
   *  outcome. → true when it landed */
  _saveOrOwe(why) { try { return this._save({ now: true, why }) === true; } catch (e) { if (e && e.code === 'not-durable') return false; throw e; } }
  /** 主开发 r3977 (2) — THE THREE WITH NO UNDO (remove, merge, clear) DO NOT STOP IN THE MIDDLE: their synchronous save's failure is
   *  caught, the act FINISHES what it started in memory and on the machine (the pools healed, the folder wiped, the file act queued, every
   *  page told), and only then is the landing's failure said — `landingOwed`: the change stays in memory and the store writer writes it
   *  again (it lands later; the words say so, never «not saved»). → the error to throw at the act's end, or null */
  _saveFinishing(why) {
    try { this._save({ now: true, why }); return null; }
    catch (e) {
      if (!e || !e.signInSave) throw e;
      return Object.assign(new Error(`${why[0].toUpperCase()}${why.slice(1)} was done here, but accounts.json could not be written (${String(e.message || '').replace(/^accounts\.json could not be written \((.*?)\).*$/, '$1') || 'the write failed'}) — VibeSpace keeps it in memory and writes it again`), { code: 'not-durable', status: 503, landingOwed: true });
    }
  }
  /** a sign-in act's memory before it (r3782): restored when its synchronous landing fails — nothing is handed out from memory */
  _snapshot() { return JSON.parse(JSON.stringify(this._state)); }   // the same bytes the writer would put on disk
  _restore(snap) { this._state = snap; this._notify(); }
  _writer() { return this._storeWriter || require('./store-writer.js').storeWriter(); }
  /** how many saves this manager has asked for — a door compares it before and after a person's act (B-574d unit 1) */
  saveSeq() { return this._saveSeq || 0; }
  /** accounts.json holds every change saved so far (a HELD or damaged list is never «on disk»: its saves are refused) */
  persisted(answer = null) {
    // (r3763 required 3) `answer(ok)` rides the store writer's OWN answer road (durable's synchronous one): an answer made there goes out
    // even inside the hub's exit flush — a reply made from a promise's then is never sent at a stop (the exit's flush and the exit run in
    // one synchronous run)
    if (this.held()) { if (typeof answer === 'function') { try { answer(false); } catch { } } return Promise.resolve(false); }
    return this._writer().durable(this._file, typeof answer === 'function' ? { answer } : {});
  }
  /** why the last save is not on disk yet (the writer's own words) — null when it is */
  whyNotDurable() { const h = this.held(); if (h) return { why: 'held', code: h.code }; const W = this._writer(); return (typeof W.whyNotDurable === 'function' && W.whyNotDurable(this._file)) || null; }

  _notify() { this._tailsN = (this._tailsN || 0) + 1; try { this._onChange(this.list()); } catch { } }   // every store change moves the tails generation (B-ee0a)
  /** THE TAILS GENERATION (B-ee0a smalls — its reader's MUST: «never a wrong tail»): a word that changes whenever a tail the person's
   *  read answers MAY have changed — every store change (_notify: a key added, replaced or removed, a provider re-keyed) and the CLI's
   *  own key seen different on a read of ~/.claude.json (which nothing watches: that read pushes the list then). Unique per hub boot.
   *  The list (so its push), GET /api/accounts and the person's read carry it; the page reuses a read only for the SAME word. */
  tailsGen() { return `${this._tailsBoot || (this._tailsBoot = crypto.randomBytes(6).toString('hex'))}:${this._tailsN || 0}`; }
  /** the CLI's own key's tail as just read: a different one than last seen moves the generation and pushes the list (the first sight
   *  only remembers) */
  _noteCliTail(tail) { const t = tail || null; const was = this._cliTailSeen; this._cliTailSeen = t; if (was !== undefined && was !== t) this._notify(); }
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
    let providerRows = [];
    try { providerRows = this._providerRows ? this._providerRows() || [] : []; } catch { providerRows = []; }
    return {
      providerRows,   // lane lg-providers U5: BESIDE `accounts`, never in it (the hub's account readers see records only)
      ...this._providersLockOf(),   // (r3886 (B), r3908 (2)) providersUnread (the store's words while HELD) or providersDamaged ({copy}: lifted EMPTY over torn bytes) — from the SAME fact the hub's refusal reads
      ...Object.fromEntries(this._defaultIdFields().map((f) => [f, this._state[f] || null])), // defaultAccountId, defaultCodexAccountId, defaultAntigravityAccountId …
      accounts: this._rowsOf(this._state.accounts),
      tailsGen: this.tailsGen(),   // B-ee0a: the page reuses its read of the tails only for the same word
      ...(this.held() ? { held: this.held() } : {}),   // r2947 (3) / r3043: the accounts could not be read — never an empty list as a fact
    };
  }
  /** THE LIST'S ROWS for `accs`, from the kept display facts only (B-360d): no file is opened here */
  _rowsOf(accs) {
    let offerOnce = null;   // the guided door's offer, read once per roster (lane oat-add-door: oatShapeOffer)
    return accs.map((a) => {
        const type = this._acctType(a);
        const backend = this._acctBackend(a);
        const base = { id: a.id, name: publicNameOf(a), type, backend, source: a.source, originHost: a.originHost || null, note: a.note || null, hostLogins: a.hostLogins || null, createdAt: a.createdAt, localOnly: this._localOnlyClaudeSub(a), ...(a.serve ? { serve: { ...a.serve }, inPools: this.poolsWithMember(a.id).length > 0 } : {}) }; // inPools: a lapse's words differ for an account no pool lists (verify r2 ③)
        // POOLED FIRST, for every backend (2.369.18): the codex branch used to
        // run before this one, so a codex pool listed as a bare ChatGPT login
        // — no `pooled`/`current`/`memberOptions`/`auto` — and every client
        // surface (roster menu, switcher, New Session) plus the engine's
        // `type==='pooled' && a.auto` tick enumeration saw a pool with no
        // pool fields. Identity reads THROUGH the symlink via the member's
        // own auth reader; hot-switch support is the capability registry's
        // verdict (codex: 'impossible' — the client hides the toggle).
        if (type === 'pooled') {
          // B-360d: the KEPT facts of the pool's folder (its link and its current member's files, read off the loop) — no file here
          const d = this._displayOf(a);
          const cur = this._poolCurrentShown(a.id);
          const info = (d.state === 'read' && d.auth) || {};
          const curAcct = cur ? this.get(cur) : null;
          // loginState on a pool = its MEMBERS' worst (a pool has no login of
          // its own); the row names the member that earned it so the user can
          // act without opening the pool's Members dialog.
          return { ...base, pooled: true, facts: this._factsOf(d), loggedIn: d.state === 'read' ? !!info.loggedIn : null, email: info.email || null, subscriptionType: info.subscriptionType || null, current: cur, currentName: curAcct?.name || null, members: a.members || null, memberOptions: this.poolMembersShown(a.id), auto: true, priority: Array.isArray(a.priority) ? a.priority.slice() : [], placement: Array.isArray(a.priority) && a.priority.length ? 'priority' : 'automatic', hot: !!a.hot, crossProvider: a.crossProvider === 'allow' ? 'allow' : 'never', fallbackProviders: this.fallbackListRowsOf(a.id), fallbackStatus: (() => { try { const r = this._fallbackStatusOf ? this._fallbackStatusOf(a.id) : null; return Array.isArray(r) && r.length ? r : null; } catch { return null; } })(), currentProvider: cur ? this._providerBrief(this.memberProviderOf(cur)) : null, hotSupported: capsOf(backend).hotSwitch === 'verified', supported: !this._credsOf(backend).keychainSensitive || this.poolSupported(), loginState: this.poolLoginStateShown(a.id) };
        }
        if (type === 'subscription') {
          // ONE branch for every harness (S2): the descriptor's parseAuth reads
          // the account dir; authMode rides only where the reader reports it
          // (codex), long-lived-token meta only where the harness has one.
          // a.email = manual backfill (setEmail) for dirs whose login never
          // wrote the identity file; the dir's own identity wins when present.
          const d = this._displayOf(a);   // B-360d: the folder's KEPT facts — no file is opened here
          const info = this._signInAnswer(a, () => (d.state === 'read' && d.auth) || {});   // r4200: an asking row's line reads signed out, as every read does
          // loginState (2026-09-07): the LOGIN SESSION's own deadline, so every
          // surface can warn BEFORE the refresh fails instead of after a dead
          // turn. 'unknown' where the harness declares no reader.
          const row = { ...base, facts: this._factsOf(d), loggedIn: d.state === 'read' ? !!info.loggedIn : null, email: info.email || a.email || null, emailDeclared: !info.email && !!a.email, subscriptionType: info.subscriptionType, ...(info.rateLimitTier ? { rateLimitTier: info.rateLimitTier } : {}), loginState: this._loginStateShown(a), ...(info.authMode !== undefined ? { authMode: info.authMode } : {}), ...(this._credsOf(backend).longLivedToken ? this._oatMeta(a) : {}), ...(a.reloginAsk ? { reloginAsk: { at: a.reloginAsk.at, ...(a.reloginAsk.lost ? { lost: true } : {}) } } : {}) };   // the held sign-in's question (row B-87fd identity unit 3): a mark, no identity
          if (row.oat) { const door = this._oatFileDoor(a, row.loginState); if (door) row.oatFile = door; }
          // THE QUOTA PROBE (lane auto-cli-oat-unprobeable): the SAME verdict the auto-cli loop and the probe door read, off
          // the row's own facts — an oat-only row is probed through the token in its folder when the token carries
          // user:profile (`oatScopes`, the recorded shape — no secret) and the hub's CLI is measured with it (`oatCli`,
          // oatFileCaps); else the row names the fact that failed and says it refreshes when a session uses it — + the
          // last failed probe's reason
          if (row.oat) {
            row.oatScopes = a.oatShape && Array.isArray(a.oatShape.scopes) ? a.oatShape.scopes.filter((x) => typeof x === 'string').slice(0, 20) : [];
            // THE SHAPE'S PROVENANCE (lane oat-add-door): whose word the row's subscription type is — a sign-in's or the person's
            // (typeless = «先不选») — and a choice a sign-in replaced (its words for 7 days); no secret in any of it
            const sh = storedShapeOf(a.oatShape);
            if (sh) row.oatShape = { source: a.oatShapeSource === 'person' ? 'person' : 'login', at: Number(a.oatShapeAt) || null, type: sh.subscriptionType || null, tier: sh.rateLimitTier || null, typeless: !!sh.typeless };
            // NO TYPE YET (acceptance r1 MUST 1): the roster's words name the guided door — `oatChoose`: way ② offered on this hub
            const nf = this._oatFileFacts.get(a.id);
            if (nf && (nf.reason || nf.verdict) === 'no-scopes') { if (offerOnce === null) offerOnce = this.oatShapeOffer().choices.length > 0; row.oatChoose = offerOnce; row.loginState = { ...(row.loginState || {}), oatNoType: true, oatChoose: offerOnce }; }
            const rp = a.oatShapeReplaced;
            if (rp && Number(rp.at) > Date.now() - 7 * 86400e3) row.oatShapeReplaced = { at: Number(rp.at), type: (rp.was && rp.was.subscriptionType) || null, tier: (rp.was && rp.was.rateLimitTier) || null, typeless: !!(rp.was && rp.was.typeless) };
            const caps = this.oatFileCaps();
            row.oatCli = { cli: caps.cli, measured: !!caps.ok };
          }
          const pe = probeEligibility(row, { quotaProbe: capsOf(backend).quotaProbe });
          if (pe) row.probeEligibility = pe;
          const pr = probeRecordOf(a.probe);
          if (pr) row.probe = pr;
          return row;
        }
        return base;   // NO key tail (B-ba7d, the owner's decision 2026-11-18): this list and its push reach every client and every agent-readable mirror — the person's read is keyTails() (POST /api/accounts/tails)
    });
  }
  /** ONE row by its id (B-360d: the callers that built a whole list for one row) — null = no such account */
  rowOf(id) { const a = this.get(id); return a ? this._rowsOf([a])[0] : null; }
  // ── B-360d: the display facts (src/account-display-facts.js) ─────────────
  /** account `a`'s folder's kept facts — a folder not read yet, or read longer ago than the stated age, is asked of the keeper
   *  (off the loop) and the caller goes on with what is kept: { state: 'read', at, auth, target, rd } | { state: 'unread' } |
   *  { state: 'unreadable', at, reason } */
  _displayOf(a) {
    if (this._decideSince != null) return this._factsSince(a, this._decideSince);   // the decision road's rows (decisionList / decisionRowOf)
    const dir = this._acctDir(this._acctBackend(a), a.id);
    if (this._display.stale(dir, this._displayMaxAgeMs)) this._displayRead(a);
    return this._display.get(dir);
  }
  _displayFilesOf(a) { const be = this._acctBackend(a), creds = this._credsOf(be), dir = this._acctDir(be, a.id); return { creds, dir, files: typeof creds.displayFiles === 'function' ? creds.displayFiles(dir) : [], keep: typeof creds.displayKeep === 'function' ? creds.displayKeep : null, ident: typeof creds.folderIdentityOf === 'function' ? creds.folderIdentityOf : null }; }
  _displayRead(a, { after = 0, ensure = false, urgent = false } = {}) {
    try {
      const { creds, dir, files, keep, ident } = this._displayFilesOf(a);
      const p = this._display[ensure ? 'ensure' : 'refresh'](dir, files, (rd) => creds.parseAuth(dir, rd), { link: this._acctType(a) === 'pooled', after, keep, urgent, identity: ident ? (rd) => ident(dir, rd, { tied: this._tiedFn(a.id, { seed: this._acctType(a) === 'subscription' }) }) : null });
      p.catch(() => { });
      return p;
    } catch { return Promise.resolve(null); }
  }
  _displayAll() { for (const a of this._state.accounts) { const ty = this._acctType(a); if (ty === 'subscription' || ty === 'pooled') this._displayRead(a); } }
  /** A WRITER THAT KNOWS THE FACTS SETS THEM IN ITS OWN STEP (主开发 r1217): a person's own sign-in or re-authorisation has just
   *  parsed this folder through run-reads — the same run's answers seed the kept facts, so the next list shows the row at once;
   *  an off-loop read then only confirms */
  _displaySeed(a) {
    // the confirming read starts AFTER the seed (a read already in flight began before the act: it never overwrites the seed)
    try { const { creds, dir, files, keep, ident } = this._displayFilesOf(a); this._display.seed(dir, files, (rd) => creds.parseAuth(dir, rd), RR, { keep, identity: ident ? (rd) => ident(dir, rd, { tied: this._tiedFn(a.id, { seed: this._acctType(a) === 'subscription' }) }) : null }); this._displayRead(a, { after: this._display.clock() }); } catch { }
  }
  /** the switch: the pool's folder now shows `subId`'s files — seeded from the member the switch has just checked, target set */
  _displaySeedPool(pool, subId) {
    try {
      const m = this.get(subId); if (!m) return;
      const { creds, dir: mdir, files, keep, ident } = this._displayFilesOf(m);
      this._display.seed(this._acctDir(this._acctBackend(pool), pool.id), files, (rd) => creds.parseAuth(mdir, rd), RR, { target: subId, keep, identity: ident ? (rd) => ident(mdir, rd, { tied: this._tiedFn(m.id) }) : null });
      this._displayRead(pool, { after: this._display.clock() });
    } catch { }
  }
  /** a removal: the folder's kept facts go with it */
  _displayForget(a) { try { this._display.drop(this._acctDir(this._acctBackend(a), a.id)); } catch { } }
  /** every display read in flight landed (the suites' ONE seam; a clean shutdown) */
  displaySettled() { return this._display.settled(); }
  /** how many times a folder's kept facts LANDED changed (read or found unreadable) in this run — a memo built over the kept facts
   *  (the pool engine's identity groups, 主开发 r3680) is dropped when it moves */
  landedEpoch() { return this._landedN || 0; }
  /** the store's OWN file door (built only when none was handed: a suite, a tool) is ended — its worker goes (round wldn7whag) */
  close() { const d = this._ownDoor; this._ownDoor = null; try { if (d && typeof d.close === 'function') d.close(); } catch { } try { this._hold && this._hold.stop(); } catch { } }
  /** ask a folder again now — a suite that wrote a sign-in file itself (the ONE seam, then displaySettled) */
  displayRefresh(id) { const a = this.get(id); if (a) this._displayRead(a, { after: this._display.clock() }); return this._display.settled(); }   // a read that started before the suite's own write is chained once
  /** a landed read that changed what is kept: ONE broadcast for the landings of 100 ms (a start lands many folders together) */
  _notifyRowsSoon() {
    if (this._rowsSoon) return;
    this._rowsSoon = true;
    const t = setTimeout(() => { this._rowsSoon = false; try { this._onChange(this.list()); } catch { } }, 100);   // a start's landings, ~100 ms apart at most, ride one push
    if (t.unref) t.unref();
  }
  // ── B-360d: THE DECISION ROAD over the kept facts (主开发 r1221 / r1231) ──────────────────────────────────────────────────────
  // DISPLAY reads list() / rowOf() (kept facts, three states). A DECIDER reads these: the facts count only when the snapshot
  // that read or confirmed them started at or after its bound — a timer decider awaits signinFactsSettled first, a person's act
  // asks it with withinMs 0 (read now), a per-record one asks signinFacts without a wait. «unknown» DECIDES NOTHING.
  _decideSinceOf(opts) { return opts && Number.isFinite(opts.since) ? opts.since : Date.now() - (opts && Number.isFinite(opts.withinMs) ? opts.withinMs : DECIDE_WITHIN_MS); }
  /** account `a`'s kept facts as a decider may use them (read or unreadable since `since`, else «unread»); a confirmation is asked
   *  behind once the kept one is older than half the bound (the next ask finds it) */
  _factsSince(a, since) {
    const dir = this._acctDir(this._acctBackend(a), a.id), half = (Date.now() + since) / 2;
    if (!this._display.askedSince(dir, half)) this._displayRead(a, { after: half, ensure: true });
    const d = this._display.get(dir);
    return (d.state === 'read' || d.state === 'unreadable') && d.from >= since ? d : { state: 'unread' };
  }
  /** THE DECISION ACCESSOR (sync): { state: 'read', auth, at, from, target } when confirmed within the bound (`opts.since`, an
   *  instant, or `opts.withinMs`, default DECIDE_WITHIN_MS) — else { state: 'unknown', why: 'not-read-yet' | 'unreadable', reason }.
   *  `since: 0` = the KEPT facts at ANY age: 'not-read-yet' only for a folder this run has never landed (the engine's identity
   *  groups ask it so — «landed» is landed once, 主开发 r3311 MUST 1); it asks no confirmation of its own */
  signinFacts(id, opts = {}) {
    const a = this.get(id), ty = a ? this._acctType(a) : null;
    if (ty !== 'subscription' && ty !== 'pooled') return { state: 'unknown', why: a ? 'no-sign-in' : 'no-account' };
    const d = this._factsSince(a, this._decideSinceOf(opts));
    if (d.state === 'read') return { state: 'read', auth: d.auth || {}, at: d.at, from: d.from, target: d.target || null };
    return { state: 'unknown', why: d.state === 'unreadable' ? 'unreadable' : 'not-read-yet', ...(d.reason ? { reason: d.reason } : {}) };
  }
  /** THE DECISION ACCESSOR (async): the named accounts' folders (default every sign-in account) confirmed OFF the loop — a snapshot
   *  started at or after (the ask − withinMs; 0 = a person's act: read now), awaited, each ask bounded by the file door's deadline
   *  and the whole by `boundMs` when given (a person's act) — → { since, facts: Map(id → signinFacts) }; pass `since` on to
   *  decisionList / decisionRowOf / decisionLoginStateOf */
  async signinFactsSettled(ids = null, { withinMs = DECIDE_WITHIN_MS, boundMs = 0, urgent = false } = {}) {
    // withinMs 0 = a read that starts AFTER this ask: the keeper's strictly increasing stamp (a write and the ask can share a ms)
    const since = withinMs > 0 ? Date.now() - withinMs : this._display.clock();
    const accs = (Array.isArray(ids) ? ids.map((id) => this.get(id)) : this._state.accounts)
      .filter((a) => a && (this._acctType(a) === 'subscription' || this._acctType(a) === 'pooled'));
    const all = Promise.all(accs.map((a) => this._displayRead(a, { after: since, ensure: true, urgent })));
    // A PERSON'S ACT WAITS ON WHAT IT NEEDS, BOUNDED (round wldn7whag): `boundMs` — the folders not landed by then answer
    // «unknown» (the act says what it could not compare); a timer's settle has no bound but the door's own deadlines
    if (boundMs > 0) { let t = null; await Promise.race([all, new Promise((r) => { t = setTimeout(r, boundMs); if (t.unref) t.unref(); })]); clearTimeout(t); }
    else await all;
    const facts = new Map();
    for (const a of accs) facts.set(a.id, this.signinFacts(a.id, { since }));
    return { since, facts };
  }
  /** A PERSON'S ACT: the named folders read NOW (a read that starts after the ask), the wait bounded by PERSON_BOUND_MS — what did
   *  not land by then answers «unknown» and the act says it could not compare (round wldn7whag) */
  signinFactsNow(ids) { return this.signinFactsSettled(ids, { withinMs: 0, boundMs: PERSON_BOUND_MS, urgent: true }); }
  /** the list's rows as a DECIDER reads them: the same rows over the decision road's facts (a row not confirmed since the bound
   *  carries facts { state: 'unread' } and no sign-in field) */
  decisionList(opts = {}) { const was = this._decideSince; this._decideSince = this._decideSinceOf(opts); try { return this.list(); } finally { this._decideSince = was; } }
  decisionRowOf(id, opts = {}) { const was = this._decideSince; this._decideSince = this._decideSinceOf(opts); try { return this.rowOf(id); } finally { this._decideSince = was; } }
  /** loginStateOf on the decision road — null = unknown (decides nothing: no notice, no retraction) */
  decisionLoginStateOf(id, now = Date.now(), opts = {}) {
    const a = this.get(id);
    if (!a || this._acctType(a) !== 'subscription') return null;
    const was = this._decideSince; this._decideSince = this._decideSinceOf(opts);
    try { return this._displayOf(a).state === 'read' ? this._loginStateShown(a, now, opts) : null; } finally { this._decideSince = was; }
  }
  /** the kept facts' reader of account `id`'s folder (run-reads' shape, scrubbed) — null = not read yet / unreadable: no claim */
  displayReaderOf(id) { const a = this.get(id); if (!a) return null; const d = this._displayOf(a); return d.state === 'read' ? d.rd : null; }
  /** THE IDENTITY RECORD of row `id` (row B-87fd unit 2, src/account-identity.js): its harness, the address the person declared
   *  (setEmail) and WHO its folder is signed in as (the harness's folderIdentityOf, read off the loop with the kept facts), on the
   *  DECISION ROAD — confirmed within the bound like signinFacts (`opts.since` / `opts.withinMs`) — or null: no sign-in folder of
   *  its own (a pool, an API key, a gone row), not read within the bound, unreadable — no claim (sameAccount answers «unproven»).
   *  Built at each ask, held by nobody: a seat's or an organisation's id stays in memory — never in a row, a push or a journal
   *  line (r1477) */
  identityRecordOf(id, opts = {}) {
    const a = this.get(id);
    if (!a || this._acctType(a) !== 'subscription' || this.signinFacts(id, opts).state !== 'read') return null;
    const be = this._acctBackend(a);
    const rec = accountIdentity.identityRecordOf({ harness: be, declared: a.email || null, auth: this._display.identityOf(this._acctDir(be, a.id)) });
    return rec ? { ...rec, tie: this._tieKindOf(id) } : rec;   // r3022 (2)(d): a SEEDED tie is told apart from a proven one
  }
  /** the facts a row carries: { state: 'read', at } | { state: 'unread' } | { state: 'unreadable', at, reason } */
  _factsOf(d) { return d.state === 'read' ? { state: 'read', at: d.at } : d.state === 'unreadable' ? { state: 'unreadable', at: d.at, reason: d.reason } : { state: 'unread' }; }
  /** loginStateOf's display twin: the harness's own reader over the KEPT, scrubbed snapshot, its clock the caller's; a folder
   *  not read (or unreadable) is LOGIN_UNKNOWN — «no claim», which every consumer treats as «do not block», never «expired» */
  _loginStateShown(a, now = Date.now(), opts = {}) {
    try {
      if (!a) return LOGIN_UNKNOWN(now);
      const type = this._acctType(a);
      if (type === 'pooled') return this.poolLoginStateShown(a.id, now);
      if (type !== 'subscription') return LOGIN_UNKNOWN(now);
      const fn = this._credsOf(this._acctBackend(a))?.loginState;
      if (typeof fn !== 'function') return LOGIN_UNKNOWN(now);
      const d = this._displayOf(a);
      if (d.state !== 'read') return { ...LOGIN_UNKNOWN(now), facts: d.state, ...(d.reason ? { factsReason: d.reason } : {}) };
      const info = fn(this._acctDir(this._acctBackend(a), a.id), now, d.rd);
      return opts && opts.slot ? info : withOat(info, this._oatFact(a), now);
    } catch { return LOGIN_UNKNOWN(now); }
  }
  /** _placeable's display twin (the member a pool's dialog offers): the same rule over the kept facts; a member not read yet is
   *  offered, its row saying so — never dropped as «signed out» */
  _placeableShown(x) {
    const d = this._displayOf(x);
    if (d.state !== 'read') return true;
    const info = d.auth || {};
    if (!info.loggedIn) return false;
    if (!info.oatFile) return true;
    if (this.oatCheckOf(x.id)?.state === 'mismatch') return false;
    const c = this.oatFileCaps();
    return !c.known || c.ok;   // the same rule as _placeable's, its own spelling (that line is a mutant anchor of test-oat-materialize)
  }
  /** poolMembers' display twin */
  poolMembersShown(id) {
    const a = this.get(id);
    const be = this._acctBackend(a) || 'claude';
    const all = this._state.accounts.filter((x) => this._acctBackend(x) === be && this._acctType(x) === 'subscription');
    const wanted = Array.isArray(a?.members) && a.members.length ? all.filter((x) => a.members.includes(x.id)) : all;
    return wanted.filter((x) => this._placeableShown(x)).map((x) => ({ id: x.id, name: x.name, provider: this._providerBrief(this.memberProviderOf(x.id)), facts: this._factsOf(this._displayOf(x)) }));
  }
  /** poolCurrent's display twin: the pool folder's link target, as the keeper read it */
  _poolCurrentShown(id) {
    const a = this.get(id); if (!a) return null;
    const d = this._displayOf(a);
    return d.state === 'read' && d.target && this.get(d.target) ? d.target : null;
  }
  /** _poolLoginCandidates' display twin */
  _poolLoginCandidatesShown(poolId) {
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
      for (const m of this.poolMembersShown(poolId)) out.set(m.id, { id: m.id, name: m.name });
    }
    const cur = this._poolCurrentShown(poolId);
    if (cur && !out.has(cur)) {
      const c = this.get(cur);
      if (c && this._acctType(c) === 'subscription') out.set(cur, { id: cur, name: c.name });
    }
    return [...out.values()];
  }
  /** (B-ba7d) the name an account is SHOWN by (publicNameOf) — null for an unknown id */
  nameShownOf(id) { const a = this.get(id); return a ? publicNameOf(a) : null; }
  /** THE KEY TAILS — THE PERSON'S READ ONLY (B-ba7d, the owner's decision 2026-11-18 14:48 PT): every API-key account's tail and the
   *  CLI's own primary key's, answered ONLY through POST /api/accounts/tails behind the person verdict (src/routes/account-tails.js);
   *  list(), cliPrimaryKey() and the accounts-updated push carry none. A provider's tail is the provider list's (POST
   *  /api/providers/list, the same verdict). → { accounts: { [id]: tail }, cliKey: tail | null } */
  keyTails() {
    const accounts = {};
    for (const a of this._state.accounts) if (a && a.tail && this._acctType(a) === 'api') accounts[a.id] = String(a.tail);
    return { accounts, cliKey: this._cliPrimaryTail() };
  }
  /** the CLI's own primary API key's tail (~/.claude.json primaryApiKey) — null when none; never answered beside the list */
  _cliPrimaryTail() {
    let tail = null;
    try {
      const pk = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude.json'), 'utf-8'))?.primaryApiKey;
      tail = typeof pk === 'string' && /^sk-ant-/.test(pk) ? pk.slice(-8) : null;
      this._noteCliTail(tail);
    } catch (e) { tail = null; if (e && e.code === 'ENOENT') this._noteCliTail(null); }   // a torn or unreadable file is no sight (moves nothing)
    return tail;
  }

  // ── Subscription accounts (each = its own securestorage creds dir) ──

  // Allocate an empty account + dir. The OAuth login happens in an interactive
  // terminal through vibespace-claude-subscription-login.mjs; the caller
  // watches for the creds/status file, then calls finalizeSubscription.
  createSubscription({ name, signinPending = false } = {}) {
    this._refuseWhileHeld();   // r2947 (2) / r3043: an adding or changing act over a list that could not be read is refused by name
    const id = 'sub-' + crypto.randomBytes(6).toString('hex');
    fs.mkdirSync(this.subDir(id), { recursive: true, mode: 0o700 });
    this._seedConfigDir(this.subDir(id));
    const a = { id, name: String(name || '').trim().slice(0, 60) || 'Subscription', type: 'subscription', source: 'login', createdAt: Date.now(), ...(signinPending ? { signinPending: Date.now() } : {}) };
    this._state.accounts.push(a);
    // 主开发 r3977 (3): A NEW MEMBER's ROW is on disk before its folder can receive a login (the login's split road moves a real login
    // into it right after): the synchronous road; a landing that fails undoes the row and its empty folder, said by name
    try { this._save({ now: true, why: 'the new account' }); }
    catch (e) { if (e && e.signInSave) { this._state.accounts = this._state.accounts.filter((x) => x.id !== id); try { fs.rmSync(this.subDir(id), { recursive: true, force: true }); } catch { } this._notify(); } throw e; }
    this._displaySeed(a);   // B-360d: the writer made this folder — its facts set in the same step (the row says «not signed in», never «not read yet»)
    this._notify();
    return { id, dir: this.subDir(id) };
  }

  // THE SIGN-IN CARD'S ROW (lane door-signin-fixes, the verify's debris): every
  // «Sign in with Claude» / «Try again» used to push a NEW «Subscription» row, so
  // each failed attempt left one that never logged in. The card's row is MARKED
  // `signinPending` (cleared by finalize once it logs in); the next attempt
  // REUSES an idle marked row (`busy` = a sign-in is running on it), and
  // src/server/claude-signin.js sweeps a marked row past the sign-in TTL.
  // lane signin-card-real-screen (the fleet pods: 2–3 presses on a card stuck at «starting» left 2–3 rows): a row
  // whose sign-in is RUNNING (`busy`) is JOINED by the next press — one login run per account, never a second row
  pendingSignin({ busy = () => false } = {}) {
    // B-403e LOOK-AGAIN reads: a row handed to a sign-in is still not signed in — asked of the mount itself, never the run's answer
    const running = this._state.accounts.find((a) => a.signinPending && this._acctType(a) === 'subscription' && busy(a.id) && !this._lookAgain(a.id).loggedIn);
    if (running) return { id: running.id, dir: this.subDir(running.id), reused: true, joined: true };
    const idle = this._state.accounts.find((a) => a.signinPending && this._acctType(a) === 'subscription' && !busy(a.id) && !this._lookAgain(a.id).loggedIn);
    if (idle) return { id: idle.id, dir: this.subDir(idle.id), reused: true };
    return this.createSubscription({ signinPending: true });
  }
  pendingSignins() { return this._state.accounts.filter((a) => a.signinPending && this._acctType(a) === 'subscription').map((a) => ({ id: a.id, signinPending: a.signinPending })); }
  /** Remove a marked row that never logged in — never one that did, a pool lists by name, or a harness default. */
  discardPendingSignin(id) {
    const a = this.get(id);
    if (!a || !a.signinPending || this._acctType(a) !== 'subscription' || this._lookAgain(id).loggedIn) return false;   // B-403e: look again before the row's folder goes
    if (this._state.accounts.some((p) => this._acctType(p) === 'pooled' && Array.isArray(p.members) && p.members.includes(id))) return false;
    if (this._defaultIdFields().some((f) => this._state[f] === id)) return false;
    this.remove(id);
    return true;
  }

  // Read-only parse of a subscription account's creds. NEVER writes/refreshes
  // (rotation would break the account, issue #20). Returns loggedIn + identity
  // + the access token IF currently valid (for the usage poll).
  readSubCreds(id) { return this._signInAnswer(this.get(id), () => this._credsOf('claude').parseAuth(this.subDir(id))); }   // the parser lives on the claude harness descriptor (S2); WHILE A ROW ASKS IT READS SIGNED OUT (_signInAnswer, the one rule: a spawn refuses «not logged in», the pool places nothing on it)
  /** A LOOK-AGAIN READ (B-403e): the member's sign-in folder asked of the mount ITSELF — never the synchronous run's earlier
   *  answer (src/run-reads.js) — for a check whose purpose is «look again before I write»; its answer is the run's from then on.
   *  The callers, each before a write: pendingSignin and discardPendingSignin (a row handed to a sign-in or removed),
   *  reloginResolve (the login moved out of a row); the two slot writers (ensureSessionPoolLink, setPoolTarget) look again
   *  through LOOK_AGAIN_SLOT_WRITERS below, outside their text (THE SLOT LAW keeps them byte-identical) — each folder named in its
   *  own try, and a folder that cannot be named drops the whole run's memo (dropRun). */
  _lookAgain(id) { RR.forget(this.subDir(id)); return this.readSubCreds(id); }

  /** THE TIE between a row's credentials and its config (主开发 r2779): the login session the product's OWN sign-in saw — recorded at
   *  each sign-in it completes (finalize; a relogin's move into another row). Its deadline (refreshTokenExpiresAt: a refresh keeps it,
   *  a new sign-in replaces it — src/login-expiry.js) is kept on the row (a deadline, no identity); the refresh token it saw, by its
   *  fingerprint (src/login-tie.js) kept in MEMORY only (never written, never logged, never answered). The record names a seat only
   *  from a config tied so */
  _noteLoginTie(id, { fresh = false, seeded = false } = {}) {
    const a = this.get(id);
    if (!a) return;
    if (!this._tieSeeded) this._tieSeeded = new Set();
    if (seeded) this._tieSeeded.add(id); else this._tieSeeded.delete(id);   // r3022 (2)(d): a sign-in through the product replaces a seeded tie by a proven one
    if (a.loginTieDropped) { delete a.loginTieDropped; this._save(); }
    if (fresh) { try { RR.forget(this.subDir(id)); } catch { } }   // a file this run just moved or wrote: read it again
    let o = null;
    try { o = JSON.parse(RR.facts(this.subCredsPath(id)).text)?.claudeAiOauth || null; } catch { o = null; }
    if (!this._loginTies) this._loginTies = new Map();
    const rt = o && typeof o.refreshToken === 'string' && o.refreshToken ? o.refreshToken : null;
    if (rt) this._loginTies.set(id, tokenTieOf(rt)); else this._loginTies.delete(id);
    const rte = o && Number.isFinite(o.refreshTokenExpiresAt) ? o.refreshTokenExpiresAt : null;
    const was = a.loginTie && a.loginTie.rte, wasSeeded = !!(a.loginTie && a.loginTie.seeded);
    if (rte) { if (was !== rte || wasSeeded !== seeded) { a.loginTie = seeded ? { rte, seeded: true } : { rte }; this._save(); } }   // a live sign-in's deadline — or the CLI's blanked residue's, its login's
    else if (a.loginTie) { delete a.loginTie; this._save(); }
  }
  /** the row's tie DROPPED (r2972 1): after an unvouched outcome the folder holds a sign-in nothing tied — the next press seeds from it */
  _dropLoginTie(id) {
    const a = this.get(id); if (this._loginTies) this._loginTies.delete(id); if (this._tieSeeded) this._tieSeeded.delete(id);
    // …and the row is marked DROPPED (r3022 (2)(a): seeded once): its next landing never seeds it — the next press does (r2972 1)
    if (a && (a.loginTie || !a.loginTieDropped)) { delete a.loginTie; a.loginTieDropped = true; this._save(); }
  }
  /** THE SEED AT A ROW's FIRST LANDING (主开发 r3022 (2)): a row with NO tie on record — signed in before the tie existed — takes its
   *  tie from THAT landing's own snapshot (`o`: the credentials the keeper has just parsed — no read of its own, no new writer, no
   *  vendor call, no timer), so the update never splits an account that spans two rows. Never over a tie, never on a row whose tie
   *  was dropped (the next press seeds it), nothing from credentials naming no login session. MARKED SEEDED — its folder trusted
   *  as the release trusted it — and a later sign-in through the product replaces it by a proven one (_noteLoginTie).
   *  SEEDED ONCE, a restart included (主开发 r3311 (1)): the row keeps the MARK itself (`loginTieSeeded`, no value of the sign-in).
   *  A seed whose credentials carry no deadline (refreshTokenExpiresAt) has its tie in memory only, so after a restart that row is
   *  UNTIED — its record names no seat, «unproven» beside its twin, apart (the safe side) — until a sign-in through the product
   *  ties it again; never seeded again from whatever its folder then holds (another account after a sign-in inside a conversation) */
  _seedTieAt(id, o) {
    const a = this.get(id);
    if (!a || a.loginTieDropped || a.loginTieSeeded || this._hasTie(id) || !o || typeof o !== 'object') return;
    const rt = typeof o.refreshToken === 'string' && o.refreshToken ? o.refreshToken : null;
    const rte = Number.isFinite(o.refreshTokenExpiresAt) ? o.refreshTokenExpiresAt : null;
    if (!rt && !rte) return;
    if (!this._loginTies) this._loginTies = new Map();
    if (!this._tieSeeded) this._tieSeeded = new Set();
    if (rt) this._loginTies.set(id, tokenTieOf(rt));
    this._tieSeeded.add(id);
    a.loginTieSeeded = true;   // the mark on the row (r3311 (1)): never a second seed
    if (rte) a.loginTie = { rte, seeded: true };
    // ONE MANAGER A DATA FOLDER (r4262): this save writes this manager's WHOLE state at a row's first display landing — a second
    // AccountManager on the same folder (a hub builds one: server.js) would write its own, older state over the first one's file here
    this._save();
  }
  /** the tie's kind for row `id`: 'proven' (a sign-in through the product), 'seeded' (its folder trusted: r3022 (2)(d)) or null */
  _tieKindOf(id) {
    if (!this._hasTie(id)) return null;
    const a = this.get(id);
    return (a && a.loginTie && a.loginTie.seeded) || (this._tieSeeded && this._tieSeeded.has(id)) ? 'seeded' : 'proven';
  }
  /** a tie on record for row `id` (its deadline on the row, or its refresh token's fingerprint this process saw) */
  _hasTie(id) { const a = this.get(id); return !!((a && a.loginTie) || (this._loginTies && this._loginTies.has(id))); }
  /** → (claudeAiOauth) ⇒ tied to the login session the product's own sign-in saw for row `id` (its deadline, or its refresh token's hash) */
  _tiedFn(id, { seed = false } = {}) {
    return (o) => {
      if (!o || typeof o !== 'object') return false;
      if (seed) { try { this._seedTieAt(id, o); } catch { } }   // a row's own landing seeds a row with no tie (r3022 (2))
      const a = this.get(id), rte = Number.isFinite(o.refreshTokenExpiresAt) ? o.refreshTokenExpiresAt : null;
      if (rte && a && a.loginTie && a.loginTie.rte === rte) return true;
      const fp = this._loginTies && this._loginTies.get(id);
      return !!(fp && tokenTieOf(o.refreshToken) === fp);
    };
  }
  /** the sign-in helper's own status file of this row — { state: 'running' | 'success' | 'error', attempt?, code? } | null (its ONE read) */
  _loginStatusRaw(id) {
    try { const s = JSON.parse(fs.readFileSync(path.join(this.subDir(id), '.vibespace-login-status.json'), 'utf-8')); return s && typeof s === 'object' ? s : null; } catch { return null; }
  }
  _subscriptionLoginStatus(id) {
    const status = this._loginStatusRaw(id);
    if (status?.state !== 'error' || !/^[a-z0-9-]{1,40}$/.test(status.code || '')) return null;
    return { state: 'error', code: status.code };
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
  // The dir's .claude.json rides along with the creds — it carries the fresh
  // identity and belongs with the login, not with the old record.
  // THE FIRST DOOR ON THE ONE COMPARISON (row B-87fd identity unit 3, 主开发 r2533 / r2536): BEFORE is what the row's folder named
  // at the «sign in again» press (reloginBegin, kept in memory), AFTER what it names now; src/account-identity.js
  // beforeAfterVerdict decides — R1 nothing to disagree with ⇒ in place; R2 read facts ⇒ sameAccount (same in place, different
  // moved / a new row, unproven ⇒ ASK); R3 the row's own word checks AFTER's read address (equal in place, else ASK — never a split
  // on a word alone). «ASK»: the sign-in is HELD in the row's folder (its RELOGIN_HELD subfolder: the CLI never reads it, nothing
  // spawns on it), not adopted, until the person answers on the row (reloginAnswer) — no dialog, no clock. Law (5) holds on both
  // sides: both are read through the harness's folderIdentityOf (a long-lived token names no seat; a config naming another login
  // names none); BEFORE in a folder the CLI itself signed out reads its LAST login (folderLastLoginOf: the config beside the CLI's
  // blanked residue, by its exact shape), and the row's own word outranks that config alone (a disagreeing word is a conflict ⇒ ask).
  /** THE BEFORE, at the person's «sign in again» press: the folder read now (one fresh ask a file, B-403e), kept in memory for
   *  RELOGIN_BEFORE_TTL_MS with the press's ATTEMPT id (the login command carries it; the helper writes it with its states) — never
   *  stored, never sent. → { attempt } when kept; 'ask-open' when the row is ASKING (one open question: no press moves on it —
   *  主开发 r2734 MUST 2); null when the row has no sign-in folder of this kind */
  reloginBegin(id) {
    const a = this.get(id);
    if (!a || this._acctType(a) !== 'subscription' || !capsOf(this._acctBackend(a)).oauthUsage) return null;   // the declared capability the relogin route asks (never a harness id: test-architecture §78)
    if (a.reloginAsk) return 'ask-open';
    // A SECOND PRESS JOINS THE RUN STILL OUT (主开发 r2915 (a)): its BEFORE and attempt stand (the same command again) — never a
    // replaced attempt that leaves the first run's sign-in unjudged; only an errored run or a BEFORE past its time starts afresh
    const was = this._reloginBefore && this._reloginBefore.get(id);
    if (was && Date.now() - was.at <= RELOGIN_BEFORE_TTL_MS) {
      const st0 = this._loginStatusRaw(id);
      // r2972 3: the run's SUCCESS already sits unjudged (the tab closed, the watch stopped): judged FIRST, then this press begins
      // afresh — never a second command whose later sign-in lands with no watcher
      if (st0 && st0.attempt === was.attempt && st0.state === 'success') { try { this.reloginResolve(id); } catch { } if (this._reloginBefore) this._reloginBefore.delete(id); return this.reloginBegin(id); }
      if (!(st0 && st0.attempt === was.attempt && st0.state === 'error')) return { attempt: was.attempt, joined: true };
    }
    const be = this._acctBackend(a), creds = this._credsOf(be), dir = this.subDir(id), word = reloginWordOf(a);
    try { this._lookAgain(id); } catch { }
    // A ROW WITH NO TIE ON RECORD (signed in before the tie existed, or a merge's survivor before r2915) takes its tie from the
    // credentials in its folder NOW — its own folder trusted as the release trusted it (主开发 r2915): a wrong seed names the config's
    // older seat, and the fresh sign-in of any other account then reads DIFFERENT (a move or a new row) — never a silent adoption
    if (!this._hasTie(id)) this._noteLoginTie(id, { seeded: true });
    let live = null, last = null;
    const tied = this._tiedFn(id);   // a config untied to the credentials beside it names no seat (r2779: a /login inside one of the row's sessions)
    try { live = typeof creds.folderIdentityOf === 'function' ? creds.folderIdentityOf(dir, RR, { tied }) : null; } catch { live = null; }
    if (!live) { try { last = typeof creds.folderLastLoginOf === 'function' ? creds.folderLastLoginOf(dir, RR, { tied }) : null; } catch { last = null; } }
    // the row's own word, read ONE way on both roads: its typed address, or a name that is an address
    const record = live || last ? accountIdentity.identityRecordOf({ harness: be, declared: word, auth: live || last }) : null;
    const attempt = 'rl-' + crypto.randomBytes(8).toString('hex');
    if (!this._reloginBefore) this._reloginBefore = new Map();
    this._reloginBefore.set(id, { record, word, attempt, at: Date.now() });
    return { attempt };
  }
  /** MOVE A SIGN-IN between folders: its credentials first — none to move ⇒ 0 and NOTHING at the destination is touched; then its
   *  config — one that did not come along (the sign-in lacks it, or its rename failed for ANY reason: r2734 (b)) is REMOVED at the
   *  destination, never left naming the old login beside new credentials (law (5)'s class). A row folder's .claude.json holds the
   *  login-time config only — the first-run seed (onboarding, trust) and the account block; a person's own settings and projects
   *  live in the machine's config, not here. → the number of files moved */
  _moveLogin(srcDir, destDir) {
    fs.mkdirSync(destDir, { recursive: true, mode: 0o700 });
    let moved = 0;
    for (const f of ['.credentials.json', '.claude.json']) {
      try { fs.renameSync(path.join(srcDir, f), path.join(destDir, f)); moved++; }
      catch (e) { if (!moved) return 0; try { fs.unlinkSync(path.join(destDir, f)); } catch { } }
    }
    return moved;
  }
  /** 主开发 r4177 (1) — THE MOVE FINISHED: a row that ASKS whose hold is empty while its own folder holds a sign-in (a stop of the hub
   *  between the question's landing and the move: r2734 (c)) sets that sign-in aside now, at its first read after a start — the store's
   *  start, a held list's lift, a reply — before anything can start on it. Our own long-lived-token file is never moved (it is not the
   *  question's sign-in). → the number of files moved (0: nothing to finish) */
  _finishHeldMove(id) {
    const a = this.get(id);
    if (!a || !a.reloginAsk || this._acctType(a) !== 'subscription') return 0;
    const where = this._heldSignInAt(id);
    if (where !== 'row') return 0;
    let moved = 0;
    try { moved = this._moveLogin(this.subDir(id), path.join(this.subDir(id), RELOGIN_HELD)); } catch { moved = 0; }
    try { RR.forget(this.subDir(id)); } catch { }
    if (moved) console.warn('[accounts] a row that asks about its new sign-in still held it in its own folder (the hub stopped before the move): set aside now, before anything starts on it');
    else console.warn('[accounts] a row that asks about its new sign-in still holds it in its own folder and it could not be set aside — the row reads signed out until the question is answered');
    return moved;
  }
  _finishHeldMoves() { for (const a of this._state.accounts || []) if (a && a.reloginAsk) { try { this._finishHeldMove(a.id); } catch { } } }
  /** where an asking row's sign-in sits: 'hold' (set aside), 'row' (still in its own folder), or null (neither) — read fresh */
  _heldSignInAt(id) {
    const dir = this.subDir(id), hold = path.join(dir, RELOGIN_HELD), parse = (d) => { try { return this._credsOf('claude').parseAuth(d) || {}; } catch { return {}; } };
    try { RR.forget(dir); } catch { }
    if (parse(hold).loggedIn) return 'hold';
    const own = parse(dir);
    return own.loggedIn && !own.oatFile ? 'row' : null;
  }
  reloginResolve(id) {
    const a = this.get(id);
    if (!a || this._acctType(a) !== 'subscription') throw new Error('not a subscription account');
    // A ROW THAT ASKS HAS ONE OPEN QUESTION AND NOTHING ELSE MOVES ON IT (主开发 r2734 MUST 2): the answer is its two presses
    if (a.reloginAsk) return { outcome: 'ask', keptName: a.name, ...(a.reloginAsk.lost ? { lost: true } : {}) };
    const fresh = this._lookAgain(id);   // B-403e: look again before the login is moved
    if (!fresh.loggedIn || fresh.oatFile) return { outcome: 'pending' }; // our long-lived-token file is not the login being completed
    const kept = this._reloginBefore ? this._reloginBefore.get(id) : null;
    const lost = !kept || Date.now() - kept.at > RELOGIN_BEFORE_TTL_MS;
    // THE RESOLVE JUDGES ONLY A SIGN-IN NEW SINCE THE PRESS (主开发 r2734 MUST 1): the helper says «success» for THIS press's attempt —
    // written after the vendor's program wrote BOTH files — else «pending», BEFORE kept and the page still watching (an expired
    // sign-in reads as signed in, so the first poll would judge the untouched folder). A lost before: pending while a helper run
    // is still going; with no helper road at all (a sign-in another process wrote), judged as before
    const st = this._loginStatusRaw(id);
    if (!lost ? !(st && st.state === 'success' && st.attempt === kept.attempt) : !!(st && st.state === 'running')) return { outcome: 'pending' };
    if (this._reloginBefore) this._reloginBefore.delete(id);
    const be = this._acctBackend(a), creds = this._credsOf(be), src = this.subDir(id);
    let afterAuth = null;
    // AFTER: the helper's success for this sign-in vouches that its credentials and config were written together (tied); without it
    // (a lost before with no helper road) the row's own tie decides
    // r2915 (b): on the LOST road only a success that names THIS attempt vouches (a BEFORE past its time still knows it); after a
    // restart, a status naming some attempt is not known to be this one — only a helper road with no attempt at all vouches
    const vouched = !lost ? true : kept ? !!(st && st.state === 'success' && st.attempt === kept.attempt) : !(st && st.attempt);
    try { afterAuth = typeof creds.folderIdentityOf === 'function' ? creds.folderIdentityOf(src, RR, { tied: vouched ? () => true : this._tiedFn(id) }) : null; } catch { afterAuth = null; }
    const after = accountIdentity.identityRecordOf({ harness: be, declared: null, auth: afterAuth });
    const verdict = accountIdentity.beforeAfterVerdict({ before: lost ? null : kept.record, after, word: lost ? reloginWordOf(a) : kept.word, lost });
    // r2972 1: an unvouched sign-in ties nothing AND unties the row — the next press seeds from its folder. Never on an ASK: its sign-in
    // is held out of the folder and the answer ties it, and a hold that FAILS leaves an unproven sign-in live that must never be a seed
    if (!vouched && verdict !== 'ask') this._dropLoginTie(id);
    if (verdict === 'same') return { outcome: 'same', account: this.finalizeSubscription(id, { tie: vouched }) };   // a stale success ties nothing
    if (verdict === 'ask') {
      // HELD, not adopted: the row stays signed out until the person answers on it (reloginAnswer). The MARK goes on disk BEFORE the
      // move (a crash between leaves a question that can be answered — r2734 (c)); a sign-in that could not be moved is never left
      // live in a row that asks: the mark comes off and the resolve refuses by name (r2734 (a))
      a.reloginAsk = { at: Date.now(), ...(lost ? { lost: true } : {}) };
      // B-574d (line 832 on the 2.369.418 train, r2734 (c)): THE MARK IS ON DISK BEFORE THE MOVE — the store writer's synchronous road,
      // as a sign-in save (off the loop the sign-in would be set aside before its question is in the file). A mark that cannot land
      // moves nothing: it comes off (queued behind the write that carries it — never a second wait of the writer's bound), and the
      // resolve refuses as when the move fails (the page's own sentence), its cause by name
      try { this._save({ now: true, why: 'the question about the new sign-in' }); }
      catch (e) { if (!e || e.code !== 'not-durable') throw e; delete a.reloginAsk; this._save(); return { outcome: 'refused', code: 'not-durable', notOnDisk: true, error: `${e.message}, so the new sign-in was not set aside and this row was not asked — sign in again` }; }
      let moved = 0;
      try { moved = this._moveLogin(src, path.join(src, RELOGIN_HELD)); } catch { moved = 0; }
      // r2915 (c): the refusal REACHES THE PERSON — an answer the page shows (and stops on), never a throw it polls into every 3 s;
      // r4048: the question comes off ON DISK before the call returns — a kill after it never leaves a row that asks while the sign-in
      // that could not be moved is live in its folder (r2734 (a)); a landing that fails stays owed (written again)
      if (!moved) { delete a.reloginAsk; this._saveOrOwe('the question taken back'); return { outcome: 'refused', code: 'relogin_hold_failed', error: 'the new sign-in could not be set aside to ask about it, so this row was not asked — sign in again' }; }
      this._displaySeed(a);   // B-360d: this folder just changed — its facts set in this step
      this._notify();
      return { outcome: 'ask', keptName: a.name, ...(lost ? { lost: true } : {}) };
    }
    // ── different: the row whose record is «same» as the sign-in, else a NEW row ──
    const other = this._state.accounts.find((x) => {
      if (x.id === id || !capsOf(this._acctBackend(x)).oauthUsage || this._acctType(x) !== 'subscription') return false;
      let rec = this.identityRecordOf(x.id, { withinMs: RELOGIN_BEFORE_TTL_MS });
      if (!this._hasTie(x.id)) {   // r2915: another account's row with NO tie on record is seeded from its own credentials and read now (it takes the move)
        this._noteLoginTie(x.id, { seeded: true });
        let auth = null;
        try { auth = typeof creds.folderIdentityOf === 'function' ? creds.folderIdentityOf(this.subDir(x.id), RR, { tied: this._tiedFn(x.id) }) : null; } catch { auth = null; }
        rec = auth ? accountIdentity.identityRecordOf({ harness: be, declared: x.email || null, auth }) : null;
      }
      return accountIdentity.sameAccount(rec, after) === 'same';
    });
    if (other) {
      this._moveLogin(src, this.subDir(other.id));
      if (vouched) this._noteLoginTie(other.id, { fresh: true });   // the moved sign-in is the product's own: its tie goes with it (a stale success ties nothing)
      this._displaySeed(this.get(other.id)); this._displaySeed(a);   // B-360d: both folders just changed — their facts set in this step
      this._notify();
      return { outcome: 'moved', movedTo: { id: other.id, name: other.name }, freshEmail: fresh.email, keptName: a.name };
    }
    const created = this.createSubscription({ name: (fresh.email || 'Subscription').slice(0, 60) });
    this._moveLogin(src, this.subDir(created.id));
    this._displaySeed(a);   // B-360d: this record's folder lost its login in this step (the created one is seeded by its finalize)
    const finalized = this.finalizeSubscription(created.id, { tie: vouched });
    this._notify();
    return { outcome: 'split', account: finalized, freshEmail: fresh.email, keptName: a.name };
  }
  /** THE PERSON's ANSWER to a held sign-in («ask»), on the row: 'same' ⇒ the sign-in returns into this row (in place); 'another' ⇒ a
   *  NEW row is made around it. → { outcome: 'same' | 'split' | 'none' (nothing asked) | 'gone' (nothing held any more) } */
  /** 主开发 r4200 (3) — AN ANSWER's MOVE THAT MOVED NOTHING: while the sign-in still sits in the row or in the hold, the question is PUT
   *  BACK (on disk, as its removal was: the synchronous road, a landing that fails stays owed) and the answer is refused BY NAME; «gone»
   *  is said only when the sign-in sits nowhere. (A move that moved the credentials and not the config counts as moved: r2734 (b)
   *  removes the destination's config, so both reads then say signed in, with no address until the CLI writes its config again.) */
  _reloginMoveFailed(id, asked, where) {
    const a = this.get(id);
    if (!a || !this._heldSignInAt(id)) { this._notify(); return { outcome: 'gone' }; }
    a.reloginAsk = asked;
    this._saveOrOwe('the question put back');
    this._displaySeed(a); this._notify();
    return { outcome: 'refused', code: 'relogin_move_failed', error: `the new sign-in could not be moved ${where}, so this row still asks about it — answer again, or sign in again` };
  }
  reloginAnswer(id, answer) {
    const a = this.get(id);
    if (!a || this._acctType(a) !== 'subscription') throw new Error('not a subscription account');
    if (answer !== 'same' && answer !== 'another') throw new Error('answer must be «same» or «another»');
    if (!a.reloginAsk) return { outcome: 'none' };
    // 主开发 r4177: a reply is a first read — a sign-in that never reached the hold is set aside first (1); one whose move cannot finish
    // is found in the row's own folder (2): «another account» takes it from there, never «gone» while it sits in this row
    this._finishHeldMove(id);
    const at = this._heldSignInAt(id);
    const asked = a.reloginAsk;
    delete a.reloginAsk;
    const held = path.join(this.subDir(id), RELOGIN_HELD);
    if (answer === 'same') {
      // r3782 (主开发 r4177): the question comes off ON DISK before the sign-in moves back — a stop after the move never finds the
      // question again and sets the answered sign-in aside once more; a landing that fails keeps the question, said by name
      try { this._save({ now: true, why: 'the answer to the question about the new sign-in' }); }
      catch (e) { if (e && e.signInSave) { a.reloginAsk = asked; this._save(); this._notify(); } throw e; }
      if (at === 'row') return { outcome: 'same', account: this.finalizeSubscription(id) };   // already in place (its move never finished)
      if (!this._moveLogin(held, this.subDir(id))) return this._reloginMoveFailed(id, asked, 'back into this row');
      return { outcome: 'same', account: this.finalizeSubscription(id) };
    }
    this._save();   // «another»: the new row's synchronous landing below carries the question's removal with it (both land, or neither)
    // 主开发 r4168 (MUST 2): WHILE A SIGN-IN SITS IN THE HOLD ITS ROW ASKS — a new row whose landing fails (it undoes itself) puts the
    // question back before the refusal goes out (the queued write then carries it; nothing left the hold)
    let created = null;
    try { created = this.createSubscription({ name: 'Subscription' }); }
    catch (e) { if (e && e.code === 'not-durable') { a.reloginAsk = asked; this._save(); this._notify(); } throw e; }
    if (!this._moveLogin(at === 'row' ? this.subDir(id) : held, this.subDir(created.id))) { this.remove(created.id); return this._reloginMoveFailed(id, asked, 'into a new row'); }
    const finalized = this.finalizeSubscription(created.id);
    this._notify();
    return { outcome: 'split', account: finalized, keptName: a.name };
  }

  finalizeSubscription(id, { tie = true } = {}) {
    const a = this.get(id);
    if (!a || this._acctType(a) !== 'subscription') throw new Error('not a subscription account');
    const info = this.readSubCreds(id);
    if (tie) this._noteLoginTie(id);   // the product's own sign-in: the tie between its credentials and its config (r2779); a stale success ties nothing (r2915 (b))
    const loginStatus = this._subscriptionLoginStatus(id);
    if (info.loggedIn && (!a.name || a.name === 'Subscription')) {
      a.name = (info.email || (info.subscriptionType ? info.subscriptionType[0].toUpperCase() + info.subscriptionType.slice(1) : 'Subscription')).slice(0, 60);
      this._save();
    }
    if (info.loggedIn && a.signinPending) { delete a.signinPending; this._save(); } // the card's row logged in: an account now, never swept
    this._displaySeed(a);   // B-360d: the person's own sign-in — the row right at once
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
    this._refuseWhileHeld();   // r2947 (2) / r3043: an adding or changing act over a list that could not be read is refused by name
    const id = 'cxs-' + crypto.randomBytes(6).toString('hex');
    fs.mkdirSync(this.codexSubDir(id), { recursive: true, mode: 0o700 });
    this._seedCodexDir(this.codexSubDir(id));
    const a = { id, name: String(name || '').trim().slice(0, 60) || 'ChatGPT', type: 'subscription', backend: 'codex', source: 'login', createdAt: Date.now() };
    this._state.accounts.push(a);
    // 主开发 r3977 (3): A NEW MEMBER's ROW is on disk before its folder can receive a login (the login's split road moves a real login
    // into it right after): the synchronous road; a landing that fails undoes the row and its empty folder, said by name
    try { this._save({ now: true, why: 'the new account' }); }
    catch (e) { if (e && e.signInSave) { this._state.accounts = this._state.accounts.filter((x) => x.id !== id); try { fs.rmSync(this.codexSubDir(id), { recursive: true, force: true }); } catch { } this._notify(); } throw e; }
    this._displaySeed(a);   // B-360d: the writer made this folder — its facts set in the same step (the row says «not signed in», never «not read yet»)
    this._notify();
    return { id, dir: this.codexSubDir(id) };
  }

  // ── Isolated-home logins of any harness that declares one (lane antigravity-harness): creds.spawnForm
  // 'isolated-home' + creds.idPrefix + creds.loginCommand(dir) — antigravity's Google accounts. The CLI's OWN
  // login runs in a terminal against the account's dir; the store never sees a token. (codex keeps the
  // createCodexSubscription pair above, which predates this.)
  createHomeSubscription(backend, { name } = {}) {
    this._refuseWhileHeld();   // r2947 (2) / r3043: an adding or changing act over a list that could not be read is refused by name
    const c = this._credsOf(backend);
    if (!c || c.spawnForm !== 'isolated-home' || typeof c.loginCommand !== 'function' || !/^[a-z]{2,6}$/.test(c.idPrefix || '')) throw new Error(`${harnessOf(backend).label} has no login VibeSpace can run here`);
    const id = c.idPrefix + '-' + crypto.randomBytes(6).toString('hex');
    const dir = this._acctDir(backend, id);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    c.seedDir(dir);
    const a = { id, name: String(name || '').trim().slice(0, 60) || c.loginLabel, type: 'subscription', backend, source: 'login', createdAt: Date.now() };
    this._state.accounts.push(a);
    // 主开发 r3977 (3): A NEW MEMBER's ROW is on disk before its folder can receive a login (the login's split road moves a real login
    // into it right after): the synchronous road; a landing that fails undoes the row and its empty folder, said by name
    try { this._save({ now: true, why: 'the new account' }); }
    catch (e) { if (e && e.signInSave) { this._state.accounts = this._state.accounts.filter((x) => x.id !== id); try { fs.rmSync(dir, { recursive: true, force: true }); } catch { } this._notify(); } throw e; }
    this._displaySeed(a);   // B-360d: the writer made this folder — its facts set in the same step (the row says «not signed in», never «not read yet»)
    this._notify();
    return { id, dir, loginCmd: c.loginCommand(dir) };
  }

  /** "Sign in again" on an existing isolated-home account (its login lapsed, or never landed): the dir is refreshed
   *  (creds.seedDir — idempotent) and the CLI's own login command on it is answered; finalize then re-checks. */
  homeLoginCommand(id) {
    const a = this.get(id);
    const be = a ? this._acctBackend(a) : null;
    const c = be ? this._credsOf(be) : null;
    if (!a || this._acctType(a) !== 'subscription' || c?.spawnForm !== 'isolated-home' || typeof c.loginCommand !== 'function') throw new Error('not an account VibeSpace can sign in here');
    const dir = this._acctDir(be, id);
    c.seedDir(dir);
    return { id, loginCmd: c.loginCommand(dir) };
  }

  /** After the login terminal wrote the account's creds: identity → the name (when the user set none). */
  finalizeHomeSubscription(id) {
    const a = this.get(id);
    const be = a ? this._acctBackend(a) : null;
    if (!a || this._acctType(a) !== 'subscription' || this._credsOf(be)?.spawnForm !== 'isolated-home') throw new Error('not an isolated-login account');
    const info = this._readAuthFor(be, id);
    if (info.loggedIn && info.email && (!a.name || a.name === this._credsOf(be).loginLabel)) { a.name = String(info.email).slice(0, 60); this._save(); }
    this._displaySeed(a);   // B-360d: the person's own sign-in — the row right at once
    this._notify();
    return { id, ...info, name: a.name };
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
    this._displaySeed(this.get(id));   // B-360d: the person's own sign-in — the row right at once
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
      if (a.oatEnc && a.oatShape) { rec.oatShape = a.oatShape; rec.oatShapeSource = a.oatShapeSource === 'person' ? 'person' : 'login'; if (a.oatShapeAt) rec.oatShapeAt = a.oatShapeAt; } // the subscription SHAPE the target re-derives our file with (no secret in it) + whose word it is (lane oat-add-door)
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
      ...Object.fromEntries(this._defaultIdFields().map((f) => [f, this._state[f] || null])),
      accounts,
    };
  }

  importBundle(bundle) {
    this._refuseWhileHeld();   // r2947 (2) / r3043: an adding or changing act over a list that could not be read is refused by name
    const snap = this._snapshot();   // r3782: undone in memory if its synchronous landing fails
    if (!bundle || !Array.isArray(bundle.accounts)) return { imported: 0, skipped: 0 };
    const FILE_OK = /^[.\w][\w.-]*$/; // whitelist shape — no separators, no traversal
    let imported = 0, skipped = 0;
    for (const rec of bundle.accounts) {
      if (!rec || typeof rec.id !== 'string' || !/^(acct|sub|cxs|agy)-[a-f0-9]{6,}$/.test(rec.id)) { skipped++; continue; }
      if (this._state.accounts.some((a) => a.id === rec.id)) { skipped++; continue; } // never clobber an existing account
      const a = {
        id: rec.id,
        name: maskDefaultKeyName(String(rec.name || '').slice(0, 60)) || rec.id,   // B-ba7d: an export made before the rename brings back no «API key …<tail>»
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
      // an imported token is CHECKED like a saved one (lane oat-identity-fix-r3, verify r3 L-R2): its post-check armed with
      // its generation (the mint instant spawns carry), this instance's first-token instant = the import
      if (rec.oat && /^sk-ant-oat\d{2}-/.test(String(rec.oat))) { this._oatSaveIdentity(a, Date.now()); a.oatEnc = this._enc(String(rec.oat)); a.oatMintedAt = Number(rec.oatMintedAt) || Date.now(); const sh = storedShapeOf(rec.oatShape); if (sh) { a.oatShape = sh; a.oatShapeSource = rec.oatShapeSource === 'person' ? 'person' : 'login'; if (Number(rec.oatShapeAt)) a.oatShapeAt = Number(rec.oatShapeAt); } a.oatCheck = { state: 'pending', since: Date.now(), gen: a.oatMintedAt }; }
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
      { const ty = this._acctType(a); if (ty === 'subscription') this._displaySeed(a); }   // B-360d: the import wrote this folder — its facts set in this step
      if (a.oatEnc) this.syncOatFile(a.id).catch(() => { }); // ours is re-derived here (the export never carries it)
    }
    // Defaults only when the referenced account actually landed and none is set
    // locally — an import must not silently re-route existing sessions' billing.
    for (const [k, v] of this._defaultIdFields().map((f) => [f, bundle[f]])) {
      if (v && !this._state[k] && this._state.accounts.some((a) => a.id === v)) this._state[k] = v;
    }
    if (imported) { try { this._save({ now: true, why: 'the imported accounts' }); } catch (e) { if (e && e.signInSave) this._restore(snap); throw e; } this._notify(); }   // r3782: a sign-in save, in the file before the call returns; a failed landing undone in memory (the imported folders' files stay: said by name)
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
  mergeSubscription(fromId, intoId, { preferFromCreds = false, liveAccountIds = null, facts = null } = {}) {   // facts: {stood} filled for the login route's reply (r2928 (4))
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
    let foldKept = null;   // r2928 (3): why the folded row's sign-in could not be moved (its folder is then kept)
    const fromDir = this.subDir(fromId), intoDir = this.subDir(intoId), who = into.name || intoId;
    // r3042 (2): an aside that could not be removed or cut to its CLI keys still holds OUR token — said by name, once a merge
    let oursSaid = false;
    const oursLeft = () => { if (oursSaid) return; oursSaid = true; console.log(`[accounts] ${who}: an archive of its earlier credential file could not be cut to the CLI's keys or removed — it still holds our token, in the member's own folder (0600)`); };
    try {
      const intoCreds = path.join(intoDir, '.credentials.json');
      // ONE reading of each side's file: account-material's PURE credsMergeVerdict judges these bytes and the act
      // writes and archives exactly what it said (lane creds-merge-keep-rest, B-5fc0 — a survivor whose file was
      // not OUR token file, a real CLI login with mcpOAuth beside it, was overwritten whole and archived nowhere)
      let intoBytes = null, fromBytes = null;
      try { intoBytes = fs.readFileSync(intoCreds); } catch { }
      try { fromBytes = fs.readFileSync(path.join(fromDir, '.credentials.json')); } catch { }
      const parsed = (b) => { try { return JSON.parse(b); } catch { return null; } };
      const intoObj = parsed(intoBytes), fromObj = parsed(fromBytes);
      const v = require('./account-material.js').credsMergeVerdict({
        intoFile: intoBytes, intoOurs: oatFileOurs(intoObj, intoId), fromFile: fromBytes, fromOurs: oatFileOurs(fromObj, fromId), preferFrom: preferFromCreds,
        // parseClaudeAuth's loggedIn (an access token) read off THESE bytes — our long-lived-token file is not a login to keep over a real one
        intoLogged: !!(intoObj && intoObj.claudeAiOauth && intoObj.claudeAiOauth.accessToken) && !oatFileOf(intoObj), rest: credsRestOf });
      if (v.fold) {
        // r2928 (8): nothing is archived BEFORE the guard's verdict — the swap's aside IS the survivor's archive (`.dead-<ms>-a<8 hex>`,
        // 0600), settled as the verdict says: a sign-in whole as it was read, OUR file's CLI keys alone (our token is the store's: the
        // survivor's sync re-derives it), or removed — so a refused swap leaves no archive of a word already rotated
        fs.mkdirSync(intoDir, { recursive: true, mode: 0o700 });
        fs.chmodSync(intoDir, 0o700);
        // r2822: THE SURVIVOR's FILE IS SWAPPED ONLY WHILE IT IS THE FILE THE VERDICT READ — the content guard's sync form, on the
        // same read (intoBytes): a refresh by the vendor's program between that read and this write STANDS (and so does its
        // .claude.json); the folded row's file is archived beside it (moved with the archives below), never lost; said once by name
        let stood = false;
        for (const f of ['.credentials.json', '.claude.json']) {
          if (stood) break;
          const src = path.join(fromDir, f);
          const bytes = f === '.credentials.json' ? (v.write && JSON.stringify(v.write)) : (fs.existsSync(src) ? fs.readFileSync(src) : null);
          // the one 0600 atomic writer of account-dir material (tmp `wx` 0600 + fchmod + fsync + rename / the guarded swap)
          const creds = f === '.credentials.json', guard = creds ? { expectBytes: intoBytes, asideAs: v.archive ? v.aside : null } : {};
          // r2928 (2): ANY failure of the survivor's write stands the survivor (never the best-effort catch's silence)
          try { if (bytes) { const fate = require('./account-material.js').writePrivateFile(path.join(intoDir, f), bytes, guard); if (creds && fate === 'ours') oursLeft(); } } catch (e) { if (creds && e) stood = e; else throw e; }
        }
        if (stood) {
          // the folded row's file is archived beside the survivor's (moved with the archives below), never lost — and OUR long-lived
          // token in it is not kept (r2928 (1)): an our-token file keeps the CLI's keys alone, or goes with its folder
          // r3042 (3): «ours?» asked AGAIN on the folded file as it is NOW (a vendor sign-in that landed since the first read is kept whole)
          const fc = path.join(fromDir, '.credentials.json');
          let fromNow = fromObj; try { fromNow = parsed(fs.readFileSync(fc)); } catch { }
          const fromOurs = oatFileOurs(fromNow, fromId), restF = fromOurs ? credsRestOf(fromNow) : null;
          if (stood.asideSettled === 'ours') oursLeft();
          const arch = `${fc}.dead-${Date.now()}-m${crypto.randomBytes(3).toString('hex')}`;
          let foldedWhy = null;
          try { if (!fromOurs) fs.renameSync(fc, arch); else if (restF && Object.keys(restF).length) require('./account-material.js').writePrivateFile(arch, JSON.stringify(restF)); } catch (e) { if (!(e && e.code === 'ENOENT')) foldedWhy = String((e && e.code) || 'error'); }
          if (foldedWhy) foldKept = foldedWhy;
          const folded = !fromOurs ? 'the folded row\'s file is archived beside it' : restF && Object.keys(restF).length ? 'the CLI\'s keys of the folded row\'s file are archived beside it (our token in it is not kept)' : 'the folded row\'s file held our token alone, which is not kept';
          const code = String(stood.code || 'error');
          // r3042 (1): what became of the file read, said as it is (the aside removed when it held our token alone)
          const rests = stood.asideSettled === 'removed' ? 'it held our token alone, which is not kept (the hub writes ours again)' : stood.asideSettled === 'rest' ? 'the CLI\'s keys of it rest archived in its folder (our token in it is not kept)' : 'it rests archived in its folder';
          console.log(stood.restsArchived
            ? (code === 'changed'
              ? `[accounts] ${into.name || intoId}: its credential file changed since the merge read it and could not go back to its name — the fresher file rests archived in its folder and its own name is empty; ${folded}`
              : `[accounts] ${into.name || intoId}: the merge could not write its credential file (${code}) and the file read could not go back to its name — ${rests}, and its own name is empty; ${folded}`)
            : code === 'changed' || code === 'symlink'
              ? `[accounts] ${into.name || intoId}: its credential file changed or went since the merge read it — the folded row's file is not written over it; what is there stands, and ${folded}`
              : `[accounts] ${into.name || intoId}: the merge could not write its credential file (${code}) — what is there stands, and ${folded}`);
          if (facts) facts.stood = { why: stood.restsArchived ? 'archived' : code === 'changed' || code === 'symlink' ? 'changed' : 'error', code };
          if (foldedWhy && facts) facts.foldKept = path.relative(this.dataDir, fromDir);   // r3042 (4): WHERE the new sign-in is (no row names that folder)
        }
      }
      // the folded dir's archived dead logins MOVE to the survivor before the rm (verify r1 F12 — never destroyed)
      fs.mkdirSync(intoDir, { recursive: true, mode: 0o700 });
      const moved = require('./account-material.js').moveCredentialArchives(fromDir, intoDir);
      // r2928 (3): the folded row's folder is NOT removed while a sign-in of it could not be moved — said by name, once
      if (foldKept || (moved && moved.left)) console.log(`[accounts] ${into.name || intoId}: the folded row's sign-in could not be moved beside it (${foldKept || 'an archive did not move'}) — its folder ${path.basename(fromDir)} is kept, not removed`);
      else fs.rmSync(fromDir, { recursive: true, force: true });
      if (moved && moved.left && facts) facts.foldKept = path.relative(this.dataDir, fromDir);
    } catch (e) {   // r3042 (6): any other failure of the fold's files (the settings file's write, a folder step) said by name — never silent
      console.log(`[accounts] ${who}: the merge could not move the folded row's files (${String((e && e.code) || (e && e.message) || 'error')}) — the survivor keeps what it has; the folded row's folder ${path.basename(fromDir)} is kept, not removed`);
      if (facts) facts.foldKept = path.relative(this.dataDir, fromDir);
    }
    if (from.hostLogins) into.hostLogins = { ...(from.hostLogins), ...(into.hostLogins || {}) };
    if (!into.email && from.email) into.email = from.email;
    // long-lived token survives the fold (B-211a) — and is CHECKED on the survivor like a re-bind (lane oat-identity-fix-r3,
    // verify r3 L-R1): its post-check armed with the token's generation, the survivor's first-token instant kept; the folded
    // row's check goes with the row, what it filed resolved (below, once saved)
    const foldedCheck = from.oatCheck || null;
    if (!into.oatEnc && from.oatEnc) { this._oatSaveIdentity(into, Date.now()); into.oatEnc = from.oatEnc; into.oatMintedAt = from.oatMintedAt; if (!into.oatShape && from.oatShape) { into.oatShape = from.oatShape; if (from.oatShapeSource) into.oatShapeSource = from.oatShapeSource; if (from.oatShapeAt) into.oatShapeAt = from.oatShapeAt; } into.oatCheck = { state: 'pending', since: Date.now(), gen: into.oatMintedAt }; }
    if (!into.note && from.note) into.note = from.note;
    if (this._state.defaultAccountId === fromId) this._state.defaultAccountId = intoId;
    this._state.accounts = this._state.accounts.filter((x) => x.id !== fromId);
    this._oatFileFacts.delete(fromId);
    // r3782: the survivor's token in the file before the call returns — only when a sign-in field is there (r3977 (5)); r3977 (2): the
    // merge's file moves ran before it (no undo), so a landing that fails is said AFTER the fold finished
    const signIn = !!(into.oatEnc || from.oatEnc || into.keyEnc || from.keyEnc);
    const unlanded = signIn ? this._saveFinishing('the merge of the two accounts') : (this._save(), null);
    this._oatCheckReplaced(fromId, foldedCheck, 'the row was folded into ' + (into.name || intoId));
    if (into.oatEnc) this.syncOatFile(intoId).catch(() => { }); // ours is re-derived on the survivor
    this._noteLoginTie(intoId, { fresh: true });   // the MERGE carries the tie onto the survivor: its folder now holds the folded sign-in (r2915)
    if (this._loginTies) this._loginTies.delete(fromId);   // …and the folded row's own fingerprint leaves with it (r2972 5)
    this._displayForget(from); this._displaySeed(into);   // B-360d: the folded folder is gone; the survivor's facts are what the fold just wrote
    this._notify();
    if (unlanded) throw Object.assign(unlanded, { merged: this.rowOf(intoId) });   // the fold HAPPENED: its caller wakes the survivor
    return this.rowOf(intoId);   // B-360d: one row by its id, never a whole list
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

  /** lane vault-contents-window: THE VAULT WINDOW's rows of this store — one per sealed field (an API key, a long-lived
   *  token), masked: the ciphertext rides only to src/vault-inventory.js's length class (rowOf keeps none of it). */
  vaultRows() {
    const out = [];
    for (const a of this._state.accounts) {
      if (!a || !a.id) continue;
      let detail = ''; try { detail = (harnessOf(this._acctBackend(a)) || {}).label || ''; } catch { /* an unknown harness: no detail */ }   // the harness's own name (the kind word says the rest)
      if (a.keyEnc) out.push({ entry: a.id, field: 'key', kind: 'api-key', label: a.name || a.id, detail, createdAt: a.createdAt || null, cipher: a.keyEnc });
      if (a.oatEnc) { const f = a.oatMintedAt ? this._oatFact(a) : null; out.push({ entry: a.id, field: 'oat', kind: 'long-lived-oauth-token', label: a.name || a.id, detail: [detail, 'setup-token'].filter(Boolean).join(' · '), createdAt: a.oatMintedAt || null, cipher: a.oatEnc, expiresAt: f ? f.validUntil : null }); }   // lane vault-one-door: 「长期 OAuth 令牌」 · setup-token; lane vault-window-v2: when it stops working (the row's 「N 天后到期」)
    }
    return out;
  }
  /** lane vault-contents-window: ONE value (the Vault window's reveal, inside its 5-minute window) — null when gone. */
  vaultReveal(entry, field) {
    const a = this._state.accounts.find((x) => x && x.id === entry);
    const blob = a ? (field === 'key' ? a.keyEnc : field === 'oat' ? a.oatEnc : null) : null;
    return blob ? this._dec(blob) : null;
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
  /** THE LAST FAILED QUOTA PROBE (lane auto-cli-oat-unprobeable, 2026-10-22): `{at, ok: false, why}` ON the account record,
   *  through the one atomic writer (`_save`: tmp + rename) — never a sidecar — so the reason survives a restart (a failed
   *  probe's retry is hours away under the backoff). Written by the ONE probe door (usage-routes refreshViaCliPanel, ⟳ and
   *  auto-cli alike) with the reason already scrubbed there (src/auto-cli-model.js probeWhyText — bounded and
   *  secret-shapes-redacted; scrubbed again here, idempotent); dropped by the door's next WRITTEN answer (null). The row
   *  carries it (`probe`) and its age chip says it. A write only when the fact moved: a cleared record is not re-saved. */
  probeOf(id) {
    const a = this._state.accounts.find((x) => x.id === id);
    return a ? probeRecordOf(a.probe) : null;
  }
  noteProbe(id, probe) {
    const a = this._state.accounts.find((x) => x.id === id);
    if (!a) throw new Error('unknown account');
    if (probe == null) { if (!a.probe) return null; delete a.probe; }
    else {
      const p = probeRecordOf({ ...probe, ok: false });
      if (!p) throw new Error('probe needs an instant and a reason');
      a.probe = p;
    }
    this._save();
    this._notify();
    return a.probe ? { ...a.probe } : null;
  }
  /** THE LONG-LIVED TOKEN'S IDENTITY (lane oat-identity-postcheck, B-3102 (a)(b)) — two facts ON the account
   *  record, through the one atomic writer (`_save`), never a sidecar. `oatCheck` = the passive post-check of the
   *  CURRENT token: {state: 'pending'|'confirmed'|'mismatch', since (= the token's save), at, why, fp, others,
   *  todoId} — armed by every save (setOat / moveOat), dropped with the token (clearOat). `oatAnchor` = the window
   *  an owner-confirmed pick stated for this row's token (src/oat-identity-model.js
   *  anchorFromProbe) — read by the mint's ladder and the post-check, NEVER by the reading guard (the `.window-`
   *  sidecar stays the slot's). The PURE verdict is src/oat-identity-model.js; the ONE orchestrator is
   *  src/server/oat-identity.js. `_oatCheckHook(id, prevCheck, why)` = that orchestrator, told when a save or a
   *  removal replaces a check (it resolves the notice the old one filed). */
  oatCheckOf(id) {
    const a = this._state.accounts.find((x) => x.id === id);
    return a && a.oatEnc && a.oatCheck && typeof a.oatCheck === 'object' ? { ...a.oatCheck } : null;
  }
  /** is ANY row's token check armed (pending)? — the engine's turn-end stamp asks this before it reads a token file */
  oatArmed() { return this._state.accounts.some((a) => a && a.oatEnc && a.oatCheck && a.oatCheck.state === 'pending'); }
  setOatCheck(id, check) {
    const a = this._state.accounts.find((x) => x.id === id);
    if (!a) throw new Error('unknown account');
    if (!a.oatEnc) throw new Error('no long-lived token on this account');
    if (!check || !['pending', 'confirmed', 'mismatch'].includes(check.state) || !(Number(check.since) > 0)) throw new Error('oatCheck needs a state and the token\'s save instant');
    const str = (v, n) => (typeof v === 'string' && v ? v.slice(0, n) : null);
    const c = { state: check.state, since: Number(check.since) };
    for (const k of ['at', 'gen', 'armedAt']) if (Number(check[k]) > 0) c[k] = Number(check[k]);
    for (const [k, n] of [['why', 300], ['fp', 400], ['via', 40], ['on', 20], ['todoId', 80], ['anchorFp', 400]]) if (str(check[k], n)) c[k] = str(check[k], n);
    if (Array.isArray(check.others) && check.others.length) c.others = check.others.filter((x) => typeof x === 'string' && x).slice(0, 8);
    // lane oat-identity-fix (verify r1): weekly windows only ({sevenDay, scoped}) — the K-run's suspects, the mark's own
    // window and the anchor it was judged by (F2 / F5), and ONE open ask (F4 hint / F6 anchor) with the window it names
    const wk = (w) => { if (!w || typeof w !== 'object') return null; const sc = {}; for (const [k, v] of Object.entries(w.scoped || {})) if (Number(v) > 0) sc[String(k).toLowerCase().slice(0, 60)] = Number(v); const sd = Number(w.sevenDay) > 0 ? Number(w.sevenDay) : null; return sd || Object.keys(sc).length || str(w.orgUuid, 80) ? { sevenDay: sd, scoped: sc, ...(str(w.orgUuid, 80) ? { orgUuid: str(w.orgUuid, 80) } : {}), ...(Number(w.at) > 0 ? { at: Number(w.at) } : {}) } : null; };
    if (Array.isArray(check.run) && check.run.length) { const run = check.run.map(wk).filter(Boolean).slice(-4); if (run.length) c.run = run; }
    for (const k of ['win', 'anchorWin']) { const w = wk(check[k]); if (w) c[k] = w; }
    if (check.ask && typeof check.ask === 'object' && ['hint', 'anchor'].includes(check.ask.kind)) {
      c.ask = { kind: check.ask.kind, ...(str(check.ask.todoId, 80) ? { todoId: str(check.ask.todoId, 80) } : {}), others: (Array.isArray(check.ask.others) ? check.ask.others : []).filter((x) => typeof x === 'string' && x).slice(0, 8), ...(wk(check.ask.win) ? { win: wk(check.ask.win) } : {}), ...(Number(check.ask.at) > 0 ? { at: Number(check.ask.at) } : {}), ...(check.ask.lost === true && check.ask.kind === 'anchor' ? { lost: true } : {}) };
    }
    // lane oat-identity-fix-r3: a conversation whose road is unknown read the token (judged nothing) — the roster says so
    if (check.unknownRoad && typeof check.unknownRoad === 'object' && Number(check.unknownRoad.at) > 0) c.unknownRoad = { at: Number(check.unknownRoad.at), ...(str(check.unknownRoad.sid, 80) ? { sid: str(check.unknownRoad.sid, 80) } : {}) };
    a.oatCheck = c;
    this._save();
    this._notify();
    return { ...c };
  }
  oatAnchorOf(id) {
    const a = this._state.accounts.find((x) => x.id === id);
    return a && a.oatAnchor && typeof a.oatAnchor === 'object' ? { ...a.oatAnchor, scoped: { ...(a.oatAnchor.scoped || {}) } } : null;
  }
  /** every row's token anchor, {id: anchor} (the post-check names whose window a token's reading carries) */
  oatAnchors() {
    const out = {};
    for (const a of this._state.accounts) if (a && a.oatAnchor && typeof a.oatAnchor === 'object') out[a.id] = { ...a.oatAnchor, scoped: { ...(a.oatAnchor.scoped || {}) } };
    return out;
  }
  setOatAnchor(id, anchor) {
    const a = this._state.accounts.find((x) => x.id === id);
    if (!a) throw new Error('unknown account');
    if (anchor == null) { if (!a.oatAnchor) return null; delete a.oatAnchor; }
    else {
      const sevenDay = Number(anchor.sevenDay) > 0 ? Number(anchor.sevenDay) : null;
      const scoped = {};
      for (const [k, v] of Object.entries(anchor.scoped || {})) if (Number(v) > 0) scoped[String(k).toLowerCase().slice(0, 60)] = Number(v);
      if (!sevenDay && !Object.keys(scoped).length) throw new Error('an anchor needs a weekly window');
      if (anchor.how !== 'owner-confirmed') throw new Error(`unknown anchor proof: ${anchor.how}`);
      a.oatAnchor = { sevenDay, scoped, how: anchor.how, at: Number(anchor.at) || Date.now(), ...(typeof anchor.orgUuid === 'string' && anchor.orgUuid ? { orgUuid: anchor.orgUuid.slice(0, 80) } : {}), ...(typeof anchor.fp === 'string' && anchor.fp ? { fp: anchor.fp.slice(0, 400) } : {}), ...(typeof anchor.mint === 'string' && anchor.mint ? { mint: anchor.mint.slice(0, 40) } : {}), ...(typeof anchor.followed === 'string' && anchor.followed ? { followed: anchor.followed.slice(0, 40) } : {}) };
    }
    this._save();
    this._notify();
    return a.oatAnchor ? { ...a.oatAnchor } : null;
  }
  _oatCheckReplaced(id, prev, why) { if (prev && typeof this._oatCheckHook === 'function') { try { this._oatCheckHook(id, prev, why); } catch { } } }
  /** The first instant this row held a long-lived token (lane oat-identity-fix-r2): a `.window-` stamp written before
   *  stamps named their producer is the row's identity only when it is older (null = the row never held one). */
  oatFirstAtOf(id) {
    const a = this._state.accounts.find((x) => x.id === id);
    if (!a) return null;
    return Number(a.oatFirstAt) > 0 ? Number(a.oatFirstAt) : (Number(a.oatMintedAt) > 0 ? Number(a.oatMintedAt) : null);
  }
  /** a save on row `a` (setOat / moveOat's target): the first-token instant kept (set once), and the previous token's
   *  MINT-PROBE anchor RETIRED — it was that token's own reading (`self`), never this row's identity; an anchor the
   *  owner answered (or one that followed a re-anchor proven without the token) stays (verify r2 F-A / A3) */
  _oatSaveIdentity(a, now) {
    if (!(Number(a.oatFirstAt) > 0)) a.oatFirstAt = Number(a.oatMintedAt) > 0 ? Math.min(Number(a.oatMintedAt), now) : now;
    if (a.oatAnchor && a.oatAnchor.mint && !a.oatAnchor.followed) delete a.oatAnchor;
  }

  setNote(id, note) {
    const a = this._state.accounts.find((x) => x.id === id);
    if (!a) throw new Error('unknown account');
    const v = String(note || '').trim().slice(0, 120);
    if (v) a.note = v; else delete a.note;
    this._save();
    return this.rowOf(id);   // B-360d: one row by its id, never a whole list
  }

  add({ name, key, source = 'manual', originHost = null } = {}) {
    this._refuseWhileHeld();   // r2947 (2) / r3043: an adding or changing act over a list that could not be read is refused by name
    const snap = this._snapshot();   // r3782: undone in memory if its synchronous landing fails
    key = String(key || '').trim();
    if (!/^sk-ant-/.test(key)) throw new Error('not an Anthropic API key (must start with sk-ant-)');
    const tail = key.slice(-8);
    // Idempotent: re-adding the same key returns the existing record.
    for (const a of this._state.accounts) {
      if (a.tail === tail) {
        try { if (this._dec(a.keyEnc) === key) return { id: a.id, name: publicNameOf(a), existing: true }; } catch { }   // no tail in an answer, nor in its name (B-ba7d: any caller reads it)
      }
    }
    const a = {
      id: 'acct-' + crypto.randomBytes(6).toString('hex'),
      name: String(name || '').trim().slice(0, 60) || 'API key',   // never the tail in a NAME (B-ba7d: a name travels in every list, push and payload)
      keyEnc: this._enc(key),
      tail,
      source,
      // provenance: the machine this key was imported FROM (display only —
      // the record is an independent copy in this store, not live-linked)
      ...(originHost ? { originHost: String(originHost).slice(0, 60) } : {}),
      createdAt: Date.now(),
    };
    this._state.accounts.push(a);
    try { this._save({ now: true, why: 'the key' }); } catch (e) { if (e && e.signInSave) this._restore(snap); throw e; }   // r3782: a sign-in save, in the file before the call returns; a failed landing undone in memory
    this._notify();
    return { id: a.id, name: publicNameOf(a) };   // no tail in an answer, nor in its name (B-ba7d)
  }

  rename(id, name) {
    const a = this._state.accounts.find((x) => x.id === id);
    if (!a) throw new Error('account not found');
    a.name = String(name || '').trim().slice(0, 60) || a.name;
    this._save();
    this._notify();
    return { id: a.id, name: publicNameOf(a) };   // no tail in an answer, nor in its name (B-ba7d)
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
    return { id: a.id, name: publicNameOf(a), email: a.email || null };   // B-ba7d: never a tail in a name
  }

  // `opts.chooseDefault(poolId, fromId)` / `opts.chooseLink(poolId, fromId, sessKey)` = the ENGINE's decision for a
  // pool default / a per-session link that pointed at the deleted account (verify r2): the store has no usage cache
  // to decide with, so without them the heal below keeps its no-engine fallback (the first live member / the default).
  remove(id, opts = {}) {
    const i = this._state.accounts.findIndex((x) => x.id === id);
    if (i < 0) throw new Error('account not found');
    const a = this._state.accounts[i];
    const hadSignIn = !!(a && (a.keyEnc || a.oatEnc));   // r3782: its removal goes by the synchronous road
    // (lane pool-provider-latents, q-055 M2) the provider it served, read while the store still knows it: the heal below
    // re-points its conversations only onto THAT provider, and the engine's removal verdicts name it (goneProviderOf)
    let goneProvider = null; try { goneProvider = this.memberProviderOf(id); } catch { }
    (this._gone || (this._gone = new Map())).set(id, { provider: goneProvider, name: a.name || null });
    let unlanded0 = null;
    this._state.accounts.splice(i, 1);
    for (const f of this._defaultIdFields()) if (this._state[f] === id) this._state[f] = null; // every harness's default field
    // POOL HYGIENE (2.335.0, real report: deleting the account a pool was
    // sitting on left the pool's default symlink AND per-session links
    // dangling — the whole pool showed signed-out and running sessions read
    // creds through a dead link until some spawn happened to heal it).
    // Deleting a member must leave every pool self-consistent NOW.
    // (B-e381's second unit, 主开发 r4613) EVERY harness that keeps a sign-in here (its creds row — never a harness's name) has pools
    // to heal: «this harness reports usage by its sign-in» (oauthUsage, the old gate) is not «this harness has pools». THE ORDER: the
    // links move BEFORE the member's folder is wiped; a heal that failed keeps the folder standing and the answer says so
    let kept = null;
    if (this._acctType(a) === 'subscription' && this._keepsSignIn(this._acctBackend(a))) {
      // poolMembers below must not offer the removed account; 主开发 r4168 (MUST 1): a row that held a sign-in is OFF THE FILE before its
      // pools are healed and its folder wiped, as at the release (a kill after the wipe never brings it back with its sign-in and its pools);
      // the act still finishes (it has no undo) and a landing that fails is said at its end (r3977 (2))
      unlanded0 = hadSignIn ? this._saveFinishing('the removal of the account') : (this._save(), null);
      const failed = this._healPoolsAfterRemoval(id, { ...opts, removedProvider: goneProvider });
      if (failed.length) kept = { pools: failed.length, codes: [...new Set(failed.map((f) => f.code))] };
    }
    // Isolated-login accounts own a creds dir — wipe it (best-effort).
    if (this._acctType(a) === 'pooled') { try { fs.unlinkSync(this._acctDir(this._acctBackend(a), id)); } catch { } try { fs.rmSync(this.poolLinksDir(id), { recursive: true, force: true }); } catch { } } // unlink ONLY — the target is a real account's dir; the links dir holds only symlinks (rm never follows)
    else if (this._acctType(a) === 'subscription') {
      if (kept) console.warn(`[pool] a removed member's sign-in folder is KEPT: ${kept.pools} pool(s) could not be moved off it (${kept.codes.join(', ')}) — its links still read it`);   // B-e381: names no account
      else { try { fs.rmSync(this._acctDir(this._acctBackend(a), id), { recursive: true, force: true }); } catch { } }
    }
    this._displayForget(a);   // B-360d: the folder's kept facts go with it
    // r3782: a row that held a sign-in is gone from the file before the call returns; r3977 (2): a landing that fails is said AFTER the act
    // finished (the pools healed, the folder wiped, every page told) — the person's retry never meets a half-done removal
    const unlanded = hadSignIn ? this._saveFinishing('the removal of the account') : (this._save(), null);
    this._notify();
    // B-e381 (formed with B-574d's r3977): a landing that fails is said at the end as before, and a kept folder rides it (keptFolder)
    const owed = unlanded || unlanded0;
    if (owed) { if (kept) owed.keptFolder = kept; throw owed; }
    return kept ? { keptFolder: kept } : {};   // B-e381: the removal's answer — the folder kept when a pool could not be moved off it
  }
  /** B-e381: this harness keeps a sign-in here — its descriptor's creds row has a reader (an unknown harness keeps none) */
  _keepsSignIn(be) { try { const c = this._credsOf(be); return !!(c && typeof c.parseAuth === 'function'); } catch { return false; } }

  /** Every pool that referenced a just-removed member: strip it from explicit
   *  member lists, re-point the default link if it targeted the removed
   *  account, and re-point (or drop, when no member is left) per-session
   *  links that targeted it. Symlink re-points don't care that the old
   *  target dir is about to be rm'd — order-independent of the wipe.
   *  THE PROVIDER (lane pool-provider-latents, q-055 M2): every re-point here is HOT — the running CLI follows the link
   *  by itself, its base URL and model env stay — so it lands only on a member of the deleted account's OWN provider
   *  (`removedProvider`), which serves the conversation's model by construction (one provider, one list); the engine's
   *  pick is taken only when it is one. Nobody of that provider left ⇒ the link is UNPLACED — unlinked and marked
   *  (`unplacedOf`), never re-pointed to another provider: the engine decides it from the deleted member at its next
   *  pass (a member of its provider when one can serve; under 'allow' the cold move with its line; otherwise the
   *  owner's For-you card). The default the same way. No provider read ⇒ one provider (the old heal). */
  _healPoolsAfterRemoval(removedId, { chooseDefault = null, chooseLink = null, removedProvider = null } = {}) {
    const readTarget = (p) => { try { return path.basename(fs.readlinkSync(p)); } catch { return null; } };
    const goneKey = this._providerKeyOf(removedProvider);
    const sameProv = (mid) => goneKey == null || this._providerKeyOf(this.memberProviderOf(mid)) === goneKey;
    const provWord = (removedProvider && (removedProvider.label || removedProvider.kind || removedProvider.id)) || 'its provider';
    const failed = [];
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
        const aliveSame = alive.filter((m) => sameProv(m.id)); // (q-055 M2) the deleted member's OWN provider only
        if (readTarget(this._poolLinkDir(pool)) === removedId) {   // B-e381: the POOL's own link (its harness's folder), never Claude's path
          if (aliveSame.length) {
            // the ENGINE's decision when it is wired (verify r2) — `aliveSame[0]` only as the no-engine fallback
            let pick = null;
            try { const c = chooseDefault ? chooseDefault(pool.id, removedId) : null; if (aliveSame.some((m) => m.id === c)) pick = c; } catch { }
            const to = aliveSame.find((m) => m.id === pick) || aliveSame[0];
            this.setPoolTarget(pool.id, to.id, { why: 'member-removed' });
            console.warn(`[pool] "${pool.name}" target was the deleted account — re-pointed to ${to.name}${pick ? ' (decided)' : ''}`);
          } else {
            try { fs.unlinkSync(this._poolLinkDir(pool)); } catch { } // a dangling link reads as a phantom login path; absent = honestly signed-out (B-e381: the pool's own link)
            this._displayForget(pool);   // B-360d: the pool's folder is gone — never a minute of the removed member's identity on its row
            if (alive.length) {
              this._markUnplaced(pool, null, removedId, removedProvider);
              console.warn(`[pool] "${pool.name}" target was the deleted account and no other ${provWord} member is left — the default is UNPLACED (never moved to another provider)`);
            } else console.warn(`[pool] "${pool.name}" lost its only member to deletion — pool is unusable until a member logs in`);
          }
        }
        for (const l of this.sessionPoolLinks(pool.id)) {
          if (readTarget(l.path) !== removedId) continue;
          // each conversation to where the ENGINE decides for IT (its family view, its pin, its own recent walls —
          // verify r2), else the pool default as before (it had to leave: the account's dir is about to be wiped)
          let chosen = null;
          try { const c = chooseLink ? chooseLink(pool.id, removedId, l.sessKey) : null; if (aliveSame.some((m) => m.id === c)) chosen = c; } catch { }
          const def = this.poolCurrent(pool.id);
          // (q-055 M2) never the default of ANOTHER provider: the default when it is the deleted member's provider, else that
          // provider's first live member (the engine re-decides it within its provider next pass), else UNPLACED
          const target = chosen || (def && sameProv(def) ? def : null) || (aliveSame[0] ? aliveSame[0].id : null);
          let signIn = null; if (target) { try { signIn = this._memberSignIn(this.get(target)); } catch (e) { console.warn(`[pool] a conversation's link could not move to its member: that member's sign-in cannot be read here (${(e && e.code) || 'refused by its harness'}) — the link is dropped`); } }   // B-e381: the member's OWN harness folder; the reason said, no account named
          if (signIn) {
            require('./account-material.js').repointPoolSymlink(l.path, signIn.dir, signIn.bump);
            this._noteSlot({ sessionId: l.sessKey, poolId: pool.id, from: removedId, to: target, why: 'member-removed' });
          }
          else {
            try { fs.unlinkSync(l.path); } catch { }
            if (alive.length) {
              this._markUnplaced(pool, l.sessKey, removedId, removedProvider);
              console.warn(`[pool] "${pool.name}": conversation ${l.sessKey} was on the deleted account and no ${provWord} member can take it — UNPLACED (never moved to another provider; the owner is asked)`);
            }
          }
        }
      } catch (e) { console.warn(`[pool] hygiene after removing ${removedId} failed for ${pool.id}:`, e.message); failed.push({ poolId: pool.id, code: (e && e.code) || 'error' }); }
    }
    return failed;   // B-e381: the pools this removal could not move off the member (the caller keeps its folder)
  }

  // null = the CLI's own global login is the default for new sessions. Each
  // backend has its OWN default (claude vs codex). When id is given the backend
  // is derived from the account; when clearing (id null) the caller passes it.
  setDefault(id, backend = 'claude') {
    this._refuseWhileHeld();   // r2947 (2) / r3043: an adding or changing act over a list that could not be read is refused by name
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
      const ok = !!this.poolCurrent(a.id) && !!this._readAuthFor(backend, a.id).loggedIn;   // B-e381: the pool's link read through its OWN harness
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
    const snap = this._snapshot();   // r3782: undone in memory if its synchronous landing fails
    const now = Date.now(); // ONE instant: the token's mint time and (on a row's first token) its first-token instant
    this._oatSaveIdentity(a, now);
    a.oatEnc = this._enc(token);
    a.oatMintedAt = now;
    // every save ARMS the token's identity post-check (lane oat-identity-postcheck): its first reading is compared
    // with the row's known identity — the check the previous token held is replaced, its notice resolved
    const prevCheck = a.oatCheck || null;
    a.oatCheck = { state: 'pending', since: a.oatMintedAt, gen: a.oatMintedAt };
    try { this._save({ now: true, why: 'the long-lived token' }); } catch (e) { if (e && e.signInSave) this._restore(snap); throw e; }   // r3782: a sign-in save, in the file before the call returns; a failed landing undone in memory
    this._oatCheckReplaced(id, prevCheck, 'a new token was saved');
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
    const had = !!a.oatEnc;   // r3977 (5): the synchronous road only when a token was truly there
    delete a.oatEnc; delete a.oatMintedAt;
    // the token's identity goes with it: its check (the notice resolved) and the anchor its pick confirmed
    const prevCheck = a.oatCheck || null;
    delete a.oatCheck; delete a.oatAnchor;
    // r3782: a removal the person asked for is in the file before the call returns (a kill never brings it back); r3977 (2): its failure
    // is said after the act finished (the check resolved, the member's file act queued, every page told)
    const unlanded = had ? this._saveFinishing('the removal of the long-lived token') : (this._save(), null);
    this._oatCheckReplaced(id, prevCheck, 'the token was removed');
    this.syncOatFile(id).catch(() => { }); // no token ⇒ 'none' ⇒ our file (only ours — the mark names this row) goes
    this._notify();
    if (unlanded) throw unlanded;
  }

  /** RE-BIND (改绑, lane oat-identity-postcheck): the owner moves a row's long-lived token to the account it
   *  belongs to. The SEALED blob moves as it is (never decrypted here), with its mint instant (the token's real
   *  year), onto a Claude subscription row that holds no live token of its own; the target's post-check is armed
   *  (its first reading judges it again), the source's check + anchor go (its notice resolved). Both credential
   *  files follow through the one queue. */
  moveOat(fromId, toId) {
    const a = this.get(fromId), b = this.get(toId);
    if (!a || !b) throw new Error('unknown account: ' + (!a ? fromId : toId));
    if (fromId === toId) throw new Error('pick another account');
    if (!a.oatEnc) throw new Error('this account holds no long-lived token');
    if (!this._credsOf(this._acctBackend(b)).longLivedToken || this._acctType(b) !== 'subscription' || b.pooled) throw new Error('long-lived tokens apply to Claude subscription accounts only');
    if (b.oatEnc && (b.oatMintedAt || 0) + this.OAT_TTL_MS > Date.now()) throw Object.assign(new Error('that account already holds a long-lived token of its own — remove it there first'), { code: 'target_has_token' });
    const snap = this._snapshot();   // r3782: undone in memory if its synchronous landing fails
    const prevA = a.oatCheck || null, prevB = b.oatCheck || null;
    this._oatSaveIdentity(b, Date.now());
    b.oatEnc = a.oatEnc; b.oatMintedAt = a.oatMintedAt || Date.now();
    delete b.oatShape; delete b.oatShapeSource; delete b.oatShapeAt; delete b.oatShapeReplaced;
    b.oatCheck = { state: 'pending', since: Date.now(), gen: b.oatMintedAt };
    delete a.oatEnc; delete a.oatMintedAt; delete a.oatCheck; delete a.oatAnchor;
    try { this._save({ now: true, why: 'the moved long-lived token' }); } catch (e) { if (e && e.signInSave) this._restore(snap); throw e; }   // r3782: a sign-in save, in the file before the call returns; a failed landing undone in memory
    this._oatCheckReplaced(fromId, prevA, 'the token was moved to ' + (b.name || toId));
    this._oatCheckReplaced(toId, prevB, 'another token was moved here');
    this.syncOatFile(fromId).catch(() => { });
    this.syncOatFile(toId, { mint: true }).catch(() => { });
    this._notify();
    return { from: fromId, to: toId, mintedAt: b.oatMintedAt };
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
  noteCliVersion(v, bin = null) {
    const before = this.oatFileCaps();
    this._oatCli = v == null || v === '' ? null : String(v);
    // THE BYTES BESIDE THE VERSION (lane cli-self-measure, law 1 + acceptance law B): the hub's own PASS is keyed by version +
    // sha256 — the bytes are the key, the version a label. No facts at all (an old caller, no stat) ⇒ the last known bytes stand
    this._oatCliBin = this._nextCliBin(bin);
    if (typeof this._cliNoteHook === 'function') { this._inCliNote = true; try { this._cliNoteHook(this.oatFileCaps()); } catch { } finally { this._inCliNote = false; } }
    const after = this.oatFileCaps();
    const changed = before.ok !== after.ok || before.cli !== after.cli;
    if (changed) this.syncOatFiles().catch(() => { }); // a changed verdict re-syncs every row (queued, off the loop's back)
    return { ...after, changed };
  }
  /** law B: the next bytes facts from a read — a hash that failed on an UNCHANGED identity changes nothing (no flap); a CHANGED
   *  identity whose hash failed is unknown bytes (sha256 null ⇒ no own PASS); no facts ⇒ the last known stand */
  _nextCliBin(bin) {
    const prev = this._oatCliBin;
    if (!bin || typeof bin !== 'object' || !bin.identity) return prev || null;
    if (typeof bin.sha256 === 'string' && bin.sha256) return { path: bin.path || null, cmd: bin.cmd || null, sha256: bin.sha256, identity: bin.identity };
    if (prev && prev.identity === bin.identity) return prev;
    return { path: bin.path || null, cmd: bin.cmd || null, sha256: null, identity: bin.identity };
  }
  /** law B — A CHANGED BINARY IS HELD AT ONCE: the version clock read no version (silent: a loaded box, mid-upgrade) but the file
   *  the sessions spawn has a new identity ⇒ the bytes facts move now, so this hub's own PASS (keyed by the old bytes) stops
   *  counting on this tick; a changed verdict re-syncs every row. → {...caps, changed} */
  noteCliBinary(bin) {
    const before = this.oatFileCaps();
    this._oatCliBin = this._nextCliBin(bin);
    if (typeof this._cliNoteHook === 'function') { this._inCliNote = true; try { this._cliNoteHook(this.oatFileCaps()); } catch { } finally { this._inCliNote = false; } }
    const after = this.oatFileCaps();
    const changed = before.ok !== after.ok;
    if (changed) this.syncOatFiles().catch(() => { });
    return { ...after, changed };
  }
  /** THE HUB'S OWN MEASUREMENT (lane cli-self-measure): src/server/cli-self-measure.js — the ledger's one writer — hands in
   *  its view of the binary in use: {cli, sha256, state: 'checking'|'pass'|'fail'|'cannot-run'|'aborted', startedAt, lateAt,
   *  killAt, typicalMs, reason: {code, observation}} or null. A view for another version or other bytes is never read
   *  (oatFileCaps). A changed verdict re-syncs every row (queued), as a version note does. */
  noteCliMeasured(view) {
    const before = this.oatFileCaps();
    this._cliMeasured = view && typeof view === 'object' && typeof view.state === 'string' ? { ...view } : null;
    if (this._inCliNote) return null; // inside noteCliVersion: it compares and re-syncs itself
    const after = this.oatFileCaps();
    const changed = before.ok !== after.ok;
    if (changed) this.syncOatFiles().catch(() => { });
    if (changed || JSON.stringify(before.local) !== JSON.stringify(after.local)) this._notify();
    return { ...after, changed };
  }
  setCliNoteHook(fn) { this._cliNoteHook = typeof fn === 'function' ? fn : null; }
  /** does any subscription here hold a long-lived token? (lane cli-self-measure: the hub's own check runs only when it has one to place) */
  hasLongLivedTokens() { return this._state.accounts.some((a) => this._acctType(a) === 'subscription' && !!a.oatEnc); }
  setCliRecheck(fn) { this._cliRecheck = typeof fn === 'function' ? fn : null; }
  /** the version clock's tick now (the 60 s binary-identity check: the file the sessions spawn changed) → its caps, or null */
  recheckCli() { try { return this._cliRecheck ? Promise.resolve(this._cliRecheck()) : Promise.resolve(null); } catch { return Promise.resolve(null); } }
  /** the binary the version clock last read: {path, cmd, sha256, identity} or null */
  cliBinary() { return this._oatCliBin ? { ...this._oatCliBin } : null; }
  _oatFixture(which = 'oat') {
    const memo = which === 'mint' ? '_mintFixtureMemo' : '_oatFixtureMemo';
    if (this[memo] === undefined) {
      try { this[memo] = JSON.parse(fs.readFileSync(which === 'mint' ? this._mintFixturePath : this._oatFixturePath, 'utf-8')); } catch { this[memo] = null; }
    }
    return this[memo];
  }
  /** THE MINT'S OWN SCOPES for the hub's CLI (lane oat-add-door) → {ok, cli, scopes, from: 'fixture'|'hub'} — the release road's
   *  record of exactly this version (scripts/fixtures/oat-mint-scopes.json), else the hub's own check of exactly these bytes
   *  (cli-self-measure's view: `mintScopes`); ok = the scopes are known AND the file road is this hub's (oatFileCaps' platform
   *  rule). Not ok ⇒ way ② of the guided door is not offered — the door says «sign in once». */
  oatMintCaps() {
    const cli = cliCaps.cliVersionOf(this._oatCli);
    const platformOk = this._platform !== 'darwin' && this._platform !== 'win32';
    const fx = cliCaps.mintScopesOf(this._oatCli, this._oatFixture('mint'));
    const bin = this._oatCliBin, lm = this._cliMeasured;
    const own = !fx && lm && cli && lm.cli === cli && bin && lm.sha256 === bin.sha256 ? cliCaps.scopesOk(lm.mintScopes) : null;
    const scopes = fx || own || null;
    return { ok: platformOk && !!scopes, cli: cli || null, scopes, ...(scopes ? { from: fx ? 'fixture' : 'hub' } : {}) };
  }
  /** The binary in use's plan values (src/server/oat-shape-routes.js hands its reader in when the hub mounts the door — the
   *  catalog reader's `plans()`; suites hand their own). */
  setPlansReader(fn) { this._plansReader = typeof fn === 'function' ? fn : null; }
  /** WAY ② OF THE GUIDED DOOR, ONCE (acceptance r1: the walls, ⟳, the roster and the routes read the SAME offer — never «or choose
   *  it» where the door cannot) → {mint, plans, choices, why}: src/plan-names.js planChoices over this CLI's own values and its
   *  mint's scopes; none ⇒ `why` ∈ mint-unmeasured · platform · plans-unread · version-mismatch · no-types. */
  oatShapeOffer() {
    const mint = this.oatMintCaps();
    let plans = null; try { plans = this._plansReader ? this._plansReader() : null; } catch { plans = null; }
    const agree = !!plans && (!plans.cli || !mint.cli || plans.cli === mint.cli);
    const choices = mint.ok && agree ? planNames.planChoices(plans, { scopes: mint.scopes }) : [];
    // a binary whose map was never found (anchor false) is UNREAD — «could not read the types» — never «names no type» (heavy r1)
    const why = choices.length ? null : !mint.scopes ? 'mint-unmeasured' : !mint.ok ? 'platform' : (!plans || plans.anchor === false) ? 'plans-unread' : !agree ? 'version-mismatch' : 'no-types';
    return { mint, plans: agree ? plans : null, choices, ...(why ? { why } : {}) };
  }
  /** THE PERSON'S STATEMENT of a row's subscription shape (lane oat-add-door — the guided door's way ②, a person's door only:
   *  the route refuses an agent's bearer). `shape` = src/plan-names.js choiceShape's (the mint's scopes + the chosen type and
   *  tier, or typeless «先不选»). Refused by code: no token on the row (`no_token`), a shape a SIGN-IN stated (`from_login` —
   *  the vendor's word is not overwritten by hand; a sign-in again states it), a shape the grammar refuses (`bad_shape`). The
   *  file follows through the one queue. → a promise of the sync's result. */
  setOatShapeByPerson(id, shape, { now = Date.now() } = {}) {
    const a = this.get(id);
    const no = (msg, code) => Object.assign(new Error(msg), { code });
    if (!a) throw no('unknown account: ' + id, 'unknown');
    if (!this._credsOf(this._acctBackend(a))?.longLivedToken || this._acctType(a) !== 'subscription' || a.pooled) throw no('the subscription type applies to Claude subscription accounts only', 'not_subscription');
    if (!a.oatEnc) throw no('this account holds no long-lived token', 'no_token');
    if (a.oatShape && (a.oatShapeSource || 'login') === 'login') throw no('a sign-in stated this account’s subscription type — sign in again to change it', 'from_login');
    // A LOCKED VAULT ANSWERS AS THE VAULT DOES (acceptance r1, MUST 2): the token must open before anything is recorded — the
    // shape of a token that cannot be written is never «saved»; the vault's own refusal goes out by name (its door: Unlock…)
    try { this._dec(a.oatEnc); } catch (e) { if (isKeyRefusal(e)) { const locked = /vault_locked/.test(String(e.code)); throw Object.assign(new Error(String((e && (e.message || e.code)) || 'key')), { code: locked ? 'vault_locked' : 'key_unreadable', door: locked ? 'unlock' : null }); } throw e; }
    const sh = storedShapeOf(shape);
    if (!sh) throw no('that is not a subscription type this Claude Code offers', 'bad_shape');
    a.oatShape = sh; a.oatShapeSource = 'person'; a.oatShapeAt = now; delete a.oatShapeReplaced;
    this._save();
    this._notify();
    return this.syncOatFile(id, { now });
  }
  /** { ok, known, cli, measured } — ok = cliCaps.oatInFile(the hub's CLI, the fixture) on a platform whose CLI reads
   *  the FILE (the measurement is Linux; macOS keys its keychain by the env string — the pool's own platform rule).
   *  An answer that names no version ('unparsed', F9) is a KNOWN CLI nobody measured. measured = every version the
   *  fixture holds a record of, oldest first ('2.1.296, 2.1.306' — lane oat-in-file-2-1-306), null for none. */
  oatFileCaps() {
    const fx = this._oatFixture();
    const cli = cliCaps.cliVersionOf(this._oatCli) || (this._oatCli ? 'unparsed' : null);
    const platformOk = this._platform !== 'darwin' && this._platform !== 'win32';
    const fixtureOk = cliCaps.oatInFile(this._oatCli, fx);
    // the hub's own PASS counts for EXACTLY the version and the bytes it measured (law 2: never another build)
    const bin = this._oatCliBin, lm = this._cliMeasured;
    const own = !fixtureOk && lm && cli && lm.cli === cli && bin && lm.sha256 === bin.sha256 ? lm : null;
    const local = own ? { state: own.state, startedAt: Number(own.startedAt) || null, lateAt: Number(own.lateAt) || null, killAt: Number(own.killAt) || null, typicalMs: Number(own.typicalMs) || null, ...(own.reason ? { reason: { code: String(own.reason.code || ''), observation: String(own.reason.observation || '').slice(0, 600), ...(typeof own.reason.version === 'string' && own.reason.version ? { version: own.reason.version.slice(0, 20) } : {}), ...(own.reason.machine === 'image' || own.reason.machine === 'managed' ? { machine: own.reason.machine } : {}) } } : {}) } : null;
    return { ok: platformOk && (fixtureOk || (!!local && local.state === 'pass')), known: !!cli, cli, measured: cliCaps.measuredVersions(fx).join(', ') || null, ...(local ? { local } : {}) };
  }
  /** ONE QUEUE for every act on a member's credential file (F13 + F7): a setOat, a clearOat and a sweep row
   *  never interleave on one file. → a promise of the row's result. */
  syncOatFile(id, opts = {}) {
    // B-360d: THE WRITER SETS THE FACTS IN ITS OWN STEP — the token file was written: the folder is read again off the loop (a
    // read that started after the write) and the act ends when it lands, so whoever awaits the act reads the row it left
    const again = () => { const a = this.get(id); return a ? this._displayRead(a, { after: this._display.clock() }) : null; };
    const run = this._oatChain.then(() => this._syncOatFileNow(id, opts)).then(async (r) => { await again(); return r; }, async (e) => { await again(); throw e; });
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
    // the shape outlives the file it came from. A SIGN-IN'S SHAPE REPLACES THE PERSON'S CHOICE (lane oat-add-door): the vendor's
    // word over a hand's, said once — a journal line and the row's `oatShapeReplaced` (its words for 7 days); a row stored before
    // provenance existed (no oatShapeSource) holds a sign-in's
    const personal = !!a.oatShape && a.oatShapeSource === 'person';
    if (fileShape && (mint || !a.oatShape || personal)) {
      if (personal && sameWordOf(a.oatShape, fileShape)) delete a.oatShapeReplaced;   // the same plan said again is no replacement (acceptance r1)
      else if (personal) { a.oatShapeReplaced = { at: now, was: a.oatShape }; console.log(`[oat-file] ${a.name || id}: a sign-in stated the subscription type (${fileShape.subscriptionType}) — it replaces the one chosen by hand (${a.oatShape.subscriptionType || 'none chosen'})`); }
      a.oatShape = fileShape; a.oatShapeSource = 'login'; a.oatShapeAt = now;
      this._save();
    }
    let keyNo = null; // THE KEY FILE as why the token does not read (O1) — the failing call's own refusal
    const token = a.oatEnc ? (() => { try { return this._dec(a.oatEnc); } catch (e) { if (isKeyRefusal(e)) keyNo = e; return null; } })() : null;
    const shape = storedShapeOf(a.oatShape) || fileShape;
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
        // r2928: replacing OUR file — an aside that cannot go back keeps the CLI's keys alone, never our token
        const rest = !v.archive && ours ? credsRestOf(seen.file) : null, asideAs = rest && Object.keys(rest).length ? JSON.stringify(rest) : null;
        await material.writeCredentialFile(dir, oatFileMerge(seen.fileState === 'present' ? seen.file : null, body), { expect: v.archive ? null : seen.stat, ...(!v.archive && ours ? { asideAs } : {}) });
        out.wrote = true;
      } else if (v.cleanup) {
        out.removed = await material.removeCredentialFile(dir, { isOurs: (f) => oatFileOurs(f, id), rest: credsRestOf, expect: seen.stat });
        // A TAKE-BACK IS JOURNALED BY NAME (lane pool-silent-members R1): the sweep runs quiet, and 90c995a3 deleted six
        // members' files on a CLI update with no line at all — whatever the reason, the journal names the account
        if (out.removed) console.log(`[oat-file] took ${this.get(id)?.name || id}'s long-lived-token file back out of its folder — ${v.verdict}; the pool cannot place it until its token is written again or it logs in`);
      }
    } catch (e) {
      out.verdict = 'write-failed'; out.code = String((e && e.code) || 'error');
      // r2697: the file CHANGED since it was read (the vendor's program wrote it): ours is not written, the fresher file stands — said
      // ONCE an episode in the journal, by the member's name (never a token, a content sum or the file's bytes)
      if (e && e.restsArchived) {   // r2824 (1) / r2928 (2): it could not go back — said TRUE, once an episode
        const said = (this._oatArchSaid ||= new Set());
        if (!said.has(id)) { said.add(id); console.log(out.code === 'changed'
          ? `[oat-file] ${a.name || id}: its credential file changed since it was read and could not go back to its name — the fresher file rests archived in its folder and its own name is empty, so the next sync writes ours there`
          : `[oat-file] ${a.name || id}: ours could not be written (${out.code}) and the file read could not go back to its name — its own name is empty, so the next sync writes ours there (${e.asideSettled === 'removed' ? 'it held our token alone, which is not kept' : e.asideSettled === 'ours' ? 'our token could not be taken out of its archive, in the member\'s own folder' : 'the CLI\'s keys in it rest archived in its folder'})`); }   // r3042 (1): as it is
      } else if (out.code === 'changed' && this._oatFileFacts.get(id)?.code !== 'changed') console.log(`[oat-file] ${a.name || id}: its credential file changed or went since it was read — ours is not written; what is there stands`);
      if (e && e.asideSettled === 'ours' && !e.restsArchived) console.log(`[oat-file] ${a.name || id}: an archive of its earlier file could not be cut to the CLI's keys or removed — it still holds our token, in the member's own folder (0600)`);   // r3042 (2): never silent
    }
    const was = this._oatFileFacts.get(id);
    if (out.verdict !== 'write-failed' && this._oatArchSaid) this._oatArchSaid.delete(id);   // the episode ended: a next failed put-back is said again
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
    if (ls && ls.oatFile) return caps.known && !caps.ok ? { state: 'held', reason: 'cli-unmeasured', cli: caps.cli, ...localFacetOf(caps) } : { state: 'written', cli: caps.cli };
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
    // the post-check's verdict rides the row only once it SAID something (lane oat-identity-postcheck): a
    // mismatch names the rows whose window the token's reading carried (names, never ids or windows)
    // lane oat-identity-fix: an open ASK (a hint naming the row its window matches, an anchor that moved) and a token
    // no reading judged for a day ('unverified', F8) ride the row too — the roster's words, never a notice
    const st = identityRowState(a.oatCheck, Date.now());
    const named = st === 'mismatch' ? a.oatCheck.others : (st === 'hint' ? a.oatCheck.ask?.others : null);
    const rows = Array.isArray(named) ? named.map((x) => this.get(x)).filter(Boolean) : [];
    const other = rows.map((x) => x.name || x.id).join(', ');
    return { oat: true, oatMintedAt: a.oatMintedAt || null, oatDaysLeft: Math.floor((expiresAt - Date.now()) / 86400000), ...(st ? { oatIdentity: st } : {}), ...(other ? { oatIdentityOther: other.slice(0, 120), oatIdentityOtherIds: rows.map((x) => x.id) } : {}) };
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
    // (q-053 P0b) each member names its provider — {id, kind, label}; the whole record is memberProviderOf's
    return wanted.filter(loggedIn).map((x) => ({ id: x.id, name: x.name, provider: this._providerBrief(this.memberProviderOf(x.id)) }));
  }
  /** The provider store's lookup (P0a): `(account) → record | null`. Unset ⇒ every account answers its harness's own subscription. */
  setProviderLookup(fn, { clean = true, unread = null, damaged = null } = {}) { this._providerLookup = typeof fn === 'function' ? fn : null; this._providerStoreClean = typeof clean === 'function' ? clean : () => clean !== false; this._providerUnread = typeof unread === 'function' ? unread : null; this._providerDamaged = typeof damaged === 'function' ? damaged : null; if (this._providerLookup) { try { this.pruneFallbackProviders(); } catch { } } }   // (B-d578 F2, round wokm0ktwv) ONE prune at a start: a removal's two files with a crash between them still end in the same act
  /** (lane lg-providers) a third-party provider was added / changed / removed: every page re-reads the account lists */
  providersChanged() { this.pruneFallbackProviders(); this._notify(); }
  /** THE POOL'S FALLBACK PROVIDERS (row B-d578, the fallback member — ruling r1516 / the scene page r2733): third-party providers
   *  a CLAUDE pool may use only when EVERY member is out — never in `members`, never ranked with them (account-pool-auto's
   *  `fallbackOnly`, held apart and chosen last). The LIVE list: the ids the pool names whose record the provider store still
   *  holds and that serve the pool's harness (a record that stopped fitting is no fallback until it fits again). → [pv-…] */
  poolFallbacksOf(id) {
    const a = this.get(id);
    if (!a || this._acctType(a) !== 'pooled' || !Array.isArray(a.fallbackProviders) || !a.fallbackProviders.length) return [];
    const be = this._acctBackend(a) || 'claude';
    return a.fallbackProviders.filter((pv) => { const p = this.providerRecordOf(pv); return !!p && p.known !== false && providerFitsHarness(p, be); });
  }
  /** (r3886 (C)) the pool's SAVED fallback list for its row — every id on the record, a live one with its label, one the provider store
   *  does not know or that does not fit now (removed, skipped, the list unreadable) marked `known: false`: the page LISTS it with its
   *  word and it leaves the list only by the person's own act (a save after adding one provider never drops another unseen) */
  fallbackListRowsOf(id) {
    const a = this.get(id);
    if (!a || this._acctType(a) !== 'pooled' || !Array.isArray(a.fallbackProviders) || !a.fallbackProviders.length) return [];
    const live = new Set(this.poolFallbacksOf(id));
    return a.fallbackProviders.map((pv) => {
      if (live.has(pv)) return { id: pv, label: (this.providerRecordOf(pv) || {}).label || pv };
      const p = this.providerRecordOf(pv);   // (r3908 small) a record the store still HOLDS that no longer serves this pool's vendor: said as that, by its label
      return p && p.known !== false ? { id: pv, label: p.label || pv, fits: false } : { id: pv, label: pv, known: false };
    });
  }
  /** (r3908 (2)) ONE FACT for the page's note and the hub's refusal: the lookup's clean flag (held, or lifted EMPTY over torn bytes) →
   *  { providersUnread: the store's words } while held | { providersDamaged: { copy } } after a torn lift | {} when it reads */
  _providersLockOf() {
    let clean = true; try { clean = typeof this._providerStoreClean === 'function' ? this._providerStoreClean() !== false : true; } catch { clean = true; }
    if (clean) return { providersUnread: null };
    let d = null; try { d = this._providerDamaged ? this._providerDamaged() : null; } catch { d = null; }
    if (d && d.copy) return { providersUnread: null, providersDamaged: { copy: String(d.copy) } };
    let w = null; try { w = this._providerUnread ? this._providerUnread() : null; } catch { w = null; }
    return { providersUnread: w || 'VibeSpace cannot read its list of model providers right now' };
  }
  /** The list a person's save hands in, judged BY NAME before anything is written (updatePool): [] / null ⇒ none (the field
   *  goes: absent = none); each a third-party provider id the store holds that serves this pool's harness; Claude pools only (a
   *  pool whose harness places each conversation on its own — caps `planC`);
   *  deduped; at most FALLBACK_PROVIDERS_MAX. → the list to keep | null (none) — throws a sentence otherwise. */
  _fallbackListOf(a, input) {
    if (input === null || (Array.isArray(input) && !input.length)) return null;
    if (!Array.isArray(input)) throw new Error('fallbackProviders must be a list of provider ids');
    const be = this._acctBackend(a) || 'claude';
    // a fallback needs each conversation placed on its OWN (the per-session links — the harness's caps row `planC`): a Claude pool today
    if (!capsOf(be).planC) throw new Error(`a ${(harnessOf(be) || {}).label || be} pool takes no fallback provider — only a pool that places each conversation on its own takes one`);
    const out = [];
    for (const pv of input) {
      if (typeof pv !== 'string' || !/^pv-[a-z0-9][a-z0-9-]{0,63}$/.test(pv) || builtInProviderOf(pv)) throw new Error('not a third-party provider: ' + String(pv).slice(0, 80));
      const p = this.providerRecordOf(pv), listed = Array.isArray(a.fallbackProviders) && a.fallbackProviders.includes(pv);
      // (r3886 (C)) an id ALREADY on the pool's list that the store does not know now stays as the person left it — never refused, never dropped
      if (!p || p.known === false) { if (listed) { if (!out.includes(pv)) out.push(pv); continue; } throw new Error('no such provider on this hub: ' + pv); }
      if (!providerFitsHarness(p, be)) { if (listed) { if (!out.includes(pv)) out.push(pv); continue; } throw new Error(`${p.label || pv} does not serve Claude Code — it cannot be this pool's fallback`); }
      if (!out.includes(pv)) out.push(pv);
    }
    if (out.length > FALLBACK_PROVIDERS_MAX) throw new Error(`a pool lists at most ${FALLBACK_PROVIDERS_MAX} fallback providers`);
    return out;
  }
  /** A PROVIDER REMOVED LEAVES EVERY POOL'S LIST IN THE SAME ACT (the scene page, scene 7): the provider routes' every write
   *  calls providersChanged — a record the store no longer holds leaves each pool's fallbackProviders (the field goes when
   *  none is left). Only with the store's lookup wired: without one every record reads as gone, and nothing is pruned.
   *  → [{ poolId, gone: [pv-…] }] */
  pruneFallbackProviders() {
    if (!this._providerLookup || (typeof this._providerStoreClean === 'function' && this._providerStoreClean() === false)) return [];   // (F2 cure, the lens of round wuq1b1trm) an UNREADABLE providers.json is no «every provider removed»: nothing pruned
    const out = [];
    for (const a of this._state.accounts) {
      if (this._acctType(a) !== 'pooled' || !Array.isArray(a.fallbackProviders) || !a.fallbackProviders.length) continue;
      const gone = a.fallbackProviders.filter((pv) => !this.providerRecordOf(pv));
      if (!gone.length) continue;
      const keep = a.fallbackProviders.filter((pv) => !gone.includes(pv));
      if (keep.length) a.fallbackProviders = keep; else delete a.fallbackProviders;
      out.push({ poolId: a.id, gone });
    }
    if (out.length) { this._save(); for (const x of out) console.log(`[pool] ${x.poolId}: fallback provider${x.gone.length === 1 ? '' : 's'} ${x.gone.join(', ')} removed with the provider`); }
    return out;
  }
  /** (lane lg-providers U5) the third-party providers' roster rows (model-providers rosterRowsOf) — list().providerRows */
  setProviderRows(fn) { this._providerRows = typeof fn === 'function' ? fn : null; }
  /** (B-d578 F3b, r3316 (2)) the pool engine's fallback counts for a pool's row — `(poolId) → [{provider, label, running, canReturn, waiting}]` */
  setFallbackStatusLookup(fn) { this._fallbackStatusOf = typeof fn === 'function' ? fn : null; }
  /** (F3b) the counts changed: every client is told the list again (no store change — the tails generation does not move) */
  noteFallbackStatus() { try { this._onChange(this.list()); } catch { } }
  /** (lane lg-providers U2) the third-party provider spawn road: `(id, backend, opts) → spawn account | throws by name` */
  setProviderSpawn(fn, modelFor = null) { this._providerSpawn = typeof fn === 'function' ? fn : null; this._providerModel = typeof modelFor === 'function' ? modelFor : null; }
  /** (lane lg-providers U2 r1) a provider record by its id (the badge's name and tail) — null for anything else */
  providerRecordOf(id) { try { return /^pv-/.test(String(id || '')) && !builtInProviderOf(String(id)) && this._providerLookup ? this._providerLookup({ id: String(id) }) : null; } catch { return null; } }
  /** (B-d578, the fallback member F2) may a conversation start on this third-party provider NOW — its key readable (the vault
   *  open, its entry there)? The roster rows' own flag (setProviderRows); no rows wired ⇒ false (nothing would start there). */
  providerReady(id, be = 'claude') {
    let rows = []; try { rows = this._providerRows ? this._providerRows() || [] : []; } catch { rows = []; }
    const r = rows.find((x) => x && x.id === id && x.backend === be);
    return !!(r && r.loggedIn);
  }
  /** (lane lg-providers U2 r1) the model a `pv-` account's session starts with — null when the id is no provider's */
  providerModelFor(id, backend, model) {
    if (!/^pv-[a-z0-9][a-z0-9-]{0,63}$/.test(String(id || '')) || builtInProviderOf(String(id)) || !this._providerModel) return null;
    return this._providerModel(String(id), backend, model);
  }
  _providerKeyOf(p) { return p && typeof p === 'object' ? (String(p.id || p.kind || '') || null) : (typeof p === 'string' && p ? p : null); }
  /** (lane pool-provider-latents, q-055 M2) THE PROVIDER OF A DELETED ACCOUNT — what it served when it was removed (this
   *  process remembers it; an UNPLACED mark carries it across a restart). null = never known here. */
  goneProviderOf(id) {
    const g = id && this._gone && this._gone.get(id);
    if (g && g.provider) return g.provider;
    const hit = this._unplacedRows().find((r) => r.member === id && r.provider);
    return hit ? hit.provider : null;
  }
  goneNameOf(id) {
    const g = id && this._gone && this._gone.get(id);
    if (g && g.name) return g.name;
    const hit = this._unplacedRows().find((r) => r.member === id && r.name);
    return hit ? hit.name : null;
  }
  /** THE UNPLACED MARK (q-055 M2): a conversation (`sessKey`) or a pool's DEFAULT (`sessKey` null) whose member was deleted
   *  with nobody of its provider left to take it — its link is gone and it bills nobody until the engine places it
   *  (onto its own provider, the owner's Allow, a pin) — never onto another provider by itself. Persisted on the pool
   *  record: {default?, links: {sessKey: {member, name, provider: {id, kind, label}, at}}}. A mark holds only while the
   *  link is ABSENT: once a placement writes the link (or the default) again, the mark is cleared HERE, where it is read —
   *  the slot writers (ensureSessionPoolLink / setPoolTarget) stay byte-identical (THE SLOT LAW, test-oat-materialize). */
  unplacedOf(poolId, sessKey = null) {
    const u = this.get(poolId)?.unplaced;
    if (!u || typeof u !== 'object') return null;
    const row = sessKey == null ? u.default : (u.links && u.links[String(sessKey)]);
    if (!(row && typeof row === 'object' && row.member)) return null;
    let placed = false;
    if (sessKey == null) placed = !!this.poolCurrent(poolId);
    else { try { placed = RR.entryExists(this.sessionPoolLinkPath(poolId, sessKey)); } catch { } }
    if (placed) { if (this._clearUnplaced(poolId, sessKey)) this._save(); return null; }
    return row;
  }
  /** The pools holding an UNPLACED mark (the deletion route decides them at once). */
  unplacedPools() { return this._state.accounts.filter((p) => p && p.unplaced && typeof p.unplaced === 'object' && (this.unplacedOf(p.id, null) || Object.keys(p.unplaced.links || {}).some((k) => this.unplacedOf(p.id, k)))).map((p) => p.id); }
  _unplacedRows() {
    const out = [];
    for (const p of this._state.accounts) {
      const u = p && p.unplaced;
      if (!u || typeof u !== 'object') continue;
      if (u.default) out.push(u.default);
      for (const r of Object.values(u.links || {})) out.push(r);
    }
    return out;
  }
  _markUnplaced(pool, sessKey, memberId, provider) {
    const u = pool.unplaced && typeof pool.unplaced === 'object' ? pool.unplaced : (pool.unplaced = {});
    const row = { member: memberId, name: (this._gone && this._gone.get(memberId) && this._gone.get(memberId).name) || null, provider: this._providerBrief(provider), at: Date.now() };
    if (sessKey == null) u.default = row;
    else (u.links || (u.links = {}))[String(sessKey)] = row;
  }
  /** The owner was asked about an UNPLACED conversation (the engine's card with no move to offer): once, across a restart. */
  noteUnplacedAsked(poolId, sessKey, todoId = null) {
    const row = this.unplacedOf(poolId, sessKey);
    if (!row || row.asked) return;
    row.asked = Date.now(); if (todoId) row.todoId = String(todoId);
    this._save();
  }
  /** Clear a mark (a placement made: the link written again, the default set). → true when one was cleared (the caller saves). */
  _clearUnplaced(poolId, sessKey = null) {
    const p = this.get(poolId);
    const u = p && p.unplaced;
    if (!u || typeof u !== 'object') return false;
    let hit = false;
    if (sessKey == null) { if (u.default) { delete u.default; hit = true; } }
    else if (u.links && u.links[String(sessKey)]) { delete u.links[String(sessKey)]; hit = true; }
    if (u.links && !Object.keys(u.links).length) delete u.links;
    if (!Object.keys(u).length) delete p.unplaced;
    return hit;
  }
  /** THE PROVIDER of an account (q-053 P0b) — the whole record (models, aliases, fallbackOnly) the pool decisions read:
   *  the provider store's answer for the account when it has one, else its harness's own subscription. Never null for a
   *  known account (a provider is a LABEL every member wears); null for an unknown id. */
  memberProviderOf(id) {
    const x = this.get(id);
    if (!x) return this._providerMemberOf(id);
    if (this._providerLookup) {
      try { const p = this._providerLookup(x); if (p && typeof p === 'object' && (p.id || p.kind)) return p; } catch { }
    }
    return this.firstPartyProviderOf(this._acctBackend(x) || 'claude');
  }
  /** A THIRD-PARTY PROVIDER's RECORD as a pool member (row B-d578, the pool's fallback unit (b), ruling r1516): a `pv-…` id is
   *  no account — the provider store's own record names it (providerRecordOf: its registered lookup asked with the id). A record the store does not hold (deleted, or no store wired) still names a provider
   *  of ITS OWN that lists no model (it serves nothing) — never null, which the pool reads as ITS OWN first-party provider
   *  (and an unknown provider agrees with any in the PURE rules): a provider member is never a same-provider (hot) move. */
  _providerMemberOf(id) {
    if (!/^pv-/.test(String(id || '')) || builtInProviderOf(String(id))) return null;
    const p = this.providerRecordOf(id);
    if (p && typeof p === 'object' && (p.id || p.kind)) return p;
    return { id: String(id), kind: 'unknown', label: String(id), models: [], modelsSource: 'none', known: false };
  }
  /** A harness's OWN subscription as a provider (its creds row's `loginLabel`) — what every same-backend subscription
   *  member answers, and what the engine reads for a member the store no longer knows (a deleted pool member was one). */
  firstPartyProviderOf(be) {
    let label = null; try { label = (this._credsOf(be) || {}).loginLabel || null; } catch { }
    return { id: 'pv-' + be + '-subscription', kind: 'subscription', label: (label || be) + ' subscription', firstParty: true, harness: be };
  }
  _providerBrief(p) { return p ? { id: String(p.id || p.kind || ''), kind: p.kind || null, label: String(p.label || p.kind || p.id || '') } : null; }
  /** May a NEW placement land on this member (pool-oat-materialize verify r1 F5)? Its file holds a
   *  login — or OUR long-lived-token file while the hub's CLI is not a KNOWN unmeasured one: on an
   *  unmeasured CLI the sessions already linked to it keep running (the file stays — the running
   *  processes are the measured binary) and nothing new is placed there. */
  _placeable(be, id) {
    const info = this._readAuthFor(be, id);
    if (!info.loggedIn) return false;
    if (!info.oatFile) return true;
    // the post-check found this token to be ANOTHER account's (lane oat-identity-postcheck): the sessions already
    // linked keep running on it (the F5 ruling), nothing new is placed where the pool would spend it
    if (this.oatCheckOf(id)?.state === 'mismatch') return false;
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
  /** THE POOL'S ROSTER (lane pool-silent-members R2, inc-mvsjhna7): EVERY member the pool lists — the Usage window shows
   *  each one — with whether a NEW placement may land on it and, when not, WHY in the store's own facts. poolMembers stays
   *  the CANDIDATE list; the pool's verdict and its notice name every roster member the candidates lack (12:56 PT: the
   *  notice could name 6 of 14, because 8 never reached the decision). → [{id, name, placeable, why?}] */
  poolRoster(id) {
    const a = this.get(id);
    if (!a || this._acctType(a) !== 'pooled') return [];
    const be = this._acctBackend(a) || 'claude';
    return this.poolMembership(id).map((mid) => {
      let why = null;
      try { why = this._unplaceableWhy(be, mid); } catch { why = { code: 'unreadable' }; }
      return { id: mid, name: this.get(mid)?.name || mid, placeable: !why, ...(why ? { why } : {}) };
    });
  }
  /** The members some pool LISTS that the hub's CLI keeps out because it was never measured with their token file
   *  (R1's For-you item, oat-file-sync) → [{id, name}], each once. */
  cliUnmeasuredMembers() {
    const out = new Map();
    for (const p of this._state.accounts) {
      if (this._acctType(p) !== 'pooled') continue;
      for (const r of this.poolRoster(p.id)) if (r.why && r.why.code === 'cli-unmeasured' && !out.has(r.id)) out.set(r.id, { id: r.id, name: r.name });
    }
    return [...out.values()];
  }
  /** R1's For-you item for the hub's CLI right now (oat-file-sync files it — that module requires nothing, so the words
   *  come from here): null when the CLI is measured / unknown or no pool member is out for it; else {cli, members, prefix,
   *  item} (PURE src/cli-caps.js cliUnmeasuredItem / cliUnmeasuredPrefix). */
  cliUnmeasuredNotice() {
    const c = this.oatFileCaps();
    if (!c.known || c.ok || !c.cli || c.cli === 'unparsed') return null;
    // RULING R2 (lane cli-self-measure): a check inside its bound files NOTHING — the pool's card and the roster say it; an
    // item only once it runs late, fails, cannot run or was stopped (each with what differed and the «check again» press)
    const lf = localFacetOf(c).local;
    if (lf && lf.state === 'checking' && !lf.late) return null;
    const members = this.cliUnmeasuredMembers();
    if (!members.length) return null;
    return { cli: c.cli, members, prefix: cliCaps.cliUnmeasuredPrefix(c.cli), state: lf ? lf.state + (lf.late ? ':late' : '') : 'none', item: cliCaps.cliUnmeasuredItem({ cli: c.cli, names: members.map((m) => m.name), local: lf }) };
  }
  /** WHY a NEW placement may not land on member `id` — null exactly when _placeable says true (test-account-pool pins the
   *  two as one answer over every shape); else { code, cli?, file?, reason? }:
   *    cli-unmeasured     a long-lived token the hub's CLI was never measured with (file: whether our file sits there)
   *    vault-locked       a long-lived token the sweep could not decrypt: the vault is locked (kept; written once it opens)
   *    oat-not-in-folder  a long-lived token not (yet) written to the folder on a measured CLI (reason: the store's refusal,
   *                       'pending' before this process's first sweep)
   *    oat-expired        no login, and the long-lived token has ended
   *    oat-mismatch       the post-check read the token as ANOTHER account's
   *    logged-out | expired | no-file | no-login   the login itself (wiped / ended / no file / nothing readable) */
  /** THE POOL'S OWN WALL FOR ONE ACCOUNT (lane account-reset-door): what keeps a NEW placement off it that is not a quota —
   *  the roster's `why` (a CLI not measured, the vault, the login, a token), null when the pool may place on it. ⟳'s refusal,
   *  the reset claim's answer and the pick say THIS — one cause per account, the pool's. */
  placeWallOf(id) {
    const a = this.get(id);
    if (!a || this._acctType(a) !== 'subscription') return null;
    const be = this._acctBackend(a) || 'claude';
    try { return this._unplaceableWhy(be, id) || null; } catch { return { code: 'unreadable' }; }
  }
  /** A FACT RECORDED WHILE LOCKED ENDS AT THE UNLOCK (lane account-reset-door: ⟳ said «the vault is locked» 14× with the vault
   *  open — the sweep's per-account `vault_locked` lasted to the next 15-min tick). The vault's unlock drops every such fact
   *  (the row then reads «pending» or its true cause) and the caller ticks the sweep, which records what is true now. */
  forgetVaultLockedFacts() {
    let n = 0;
    for (const [id, f] of this._oatFileFacts) if (f && f.code === 'vault_locked') { this._oatFileFacts.delete(id); n++; }
    if (n) this._notify();
    return n;
  }
  _unplaceableWhy(be, id) {
    const info = this._readAuthFor(be, id);
    const caps = this.oatFileCaps();
    const unmeasured = caps.known && !caps.ok;
    if (info.loggedIn && !info.oatFile) return null;
    if (info.loggedIn) {
      if (this.oatCheckOf(id)?.state === 'mismatch') return { code: 'oat-mismatch' };
      return unmeasured ? { code: 'cli-unmeasured', cli: caps.cli, file: true, ...localFacetOf(caps) } : null;
    }
    const fact = this._oatFact(this.get(id));
    if (fact && fact.validUntil > Date.now()) {
      if (unmeasured) return { code: 'cli-unmeasured', cli: caps.cli, file: false, ...localFacetOf(caps) };
      const f = this._oatFileFacts.get(id);
      // (acceptance r2) the LOCKED vault is its own wall (the sweep could not decrypt the token: kept, written once the
      // vault opens) — and before this process's first sweep there is no refusal yet to name (never «re-login»)
      if (f && f.code === 'vault_locked') return { code: 'vault-locked' };
      if (!f) return { code: 'oat-not-in-folder', reason: 'pending' };
      const reason = f.reason || f.verdict ? String(f.reason || f.verdict) : null;
      // NO TYPE YET (lane oat-add-door, acceptance r1 MUST 1): the row never signed in — its wall names the guided door, and
      // whether way ② (choose the type) is offered on this hub (`choose`): never «re-login», never «or choose it» where it cannot
      return { code: 'oat-not-in-folder', ...(reason ? { reason } : {}), ...(reason === 'no-scopes' ? { choose: this.oatShapeOffer().choices.length > 0 } : {}) };
    }
    if (fact) return { code: 'oat-expired' };
    const ls = this.loginStateOf(id, Date.now(), { slot: true });
    return { code: ls.absent ? 'no-file' : (ls.state === 'logged-out' || ls.state === 'expired') ? ls.state : 'no-login' };
  }

  /** The pool's own symlink path + a member's home dir — per backend (codex
   *  pool = symlink among the CODEX_HOME dirs; P2, design-backend-parity §2). */
  _poolLinkDir(a) { return this._acctDir(this._acctBackend(a), a.id); }
  _poolMemberDir(a, subId) { return this._acctDir(this._acctBackend(a), subId); }
  /** B-e381: a pool member read by ITS OWN harness — the harness's creds row (its descriptor, the one source) gives the sign-in
   *  reader, the folder a pool link points at and the file a re-point bumps; a harness that keeps no sign-in here (no creds row) is
   *  refused by name, never read as Claude's. For a Claude member these are readSubCreds / subDir / subCredsPath, value for value.
   *  → { dir, bump, auth() } */
  _memberSignIn(member) {
    const be = this._acctBackend(member), creds = this._credsOf(be);
    if (!creds || typeof creds.parseAuth !== 'function') throw new Error(`pool member's harness keeps no sign-in here (${be}): ` + member.name);
    const dir = this._acctDir(be, member.id);
    return { dir, bump: creds.bumpFile ? path.join(dir, creds.bumpFile) : null, auth: () => this._readAuthFor(be, member.id) };
  }

  // The real account a pool currently resolves to, read from the symlink
  // itself (the link IS the state — no second source of truth to drift).
  poolCurrent(id) {
    try {
      const a = this.get(id);
      const t = RR.readlink(this._poolLinkDir(a || { id }));
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
    // B-e381 (主开发 r4614): THE POOL's HARNESS decides — a member of another harness is refused by name (the pool's default writer's own
    // words), and a per-session link is written ONLY where its harness's process reads one: the capability row's planC (the row the
    // engine tests before its per-session loop) — never a harness's name. A harness without it holds its member for life on the pool's
    // default; a link written there would credit the conversation to a member its process does not bill.
    const pool = this.get(poolId), poolBe = pool && this._acctType(pool) === 'pooled' ? this._acctBackend(pool) : null;
    if (poolBe != null) {
      if (this._acctBackend(target) !== poolBe) throw new Error(`not a ${poolBe} subscription: ` + memberId);
      if (!capsOf(poolBe).planC) throw new Error(`no per-session pool link for this harness (${poolBe}): its conversations read the pool's default`);
    }
    const signIn = this._memberSignIn(target);   // B-e381: judged by its OWN harness (its reader and folder)
    if (!signIn.auth().loggedIn) throw new Error('pool member not logged in: ' + target.name);
    const link = this.sessionPoolLinkPath(poolId, sessKey);
    const from = this.poolCurrentFor(poolId, sessKey); // read BEFORE the re-point — the ledger records a transition, not a state
    fs.mkdirSync(path.dirname(link), { recursive: true });
    require('./account-material.js').repointPoolSymlink(link, signIn.dir, signIn.bump);
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
      let seen = false;
      try { seen = this.slotTransitions.all().some((r) => r.at === ts && r.to === to && (r.sessionId || null) === sessionId); } catch (e) { if (!isLedgerHeld(e)) throw e; }   // HELD: the dedup cannot look — the row appends (an identical row is one fact to every reader)
      if (seen) return null;
      const row = this.slotTransitions.record({ sessionId, poolId, from: fromId, to, at: ts, why });
      // the daemon moved a link this server's clients still show on its OLD member (lane badge-stale):
      // a per-session link is the payload's auth.poolTarget, the pool default is also the list's `current`
      if (sessionId) this._notifyLinks(); else this._notify();
      return row;
    } catch { return null; }
  }
  /** The real account THIS session bills to: its own link's target, else the
   *  pool default. The link IS the state at both granularities. */
  poolCurrentFor(poolId, sessKey, { withProvider = false } = {}) {
    // (q-053 P0b) `withProvider` ⇒ {memberId, provider:{id, kind, label}} — the member AND the provider it bills through;
    // the plain answer (an id) is unchanged for every existing caller
    const answer = (id) => (withProvider ? (id ? { memberId: id, provider: this._providerBrief(this.memberProviderOf(id)) } : null) : id);
    if (sessKey) {
      try {
        const sub = path.basename(RR.readlink(this.sessionPoolLinkPath(poolId, sessKey)));
        if (this.get(sub)) return answer(sub);
      } catch { if (this.unplacedOf(poolId, sessKey)) return answer(null); } // (q-055 M2) UNPLACED: it bills nobody — never "the default"
    }
    return answer(this.poolCurrent(poolId));
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
    const stamp = typeof session._heldPoolMember === 'string' ? session._heldPoolMember : null;
    // A PROVIDER MEMBER (row B-d578, the pool's fallback unit (c)): its process HOLDS it whatever the harness's hot switch — its
    // key rides the spawn's env, no credential link can point at it — so it bills that provider, never the link's member
    if (stamp && this._providerMemberOf(stamp)) return { id: stamp, held: true, origin: 'provider' };
    if (capsOf(a.backend || session.backend || 'claude').hotSwitch === 'verified') return { id: link(), held: false, origin: 'link' };
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
      try { rows = this.slotTransitions.all(); } catch (e) { rows = null; if (isLedgerHeld(e)) return { id: link(), held: false, origin: 'unknown', why: 'ledger-held' }; }   // HELD: nothing names the member — nothing may spend on it
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
  dropSessionPoolLink(poolId, sessKey) { try { fs.unlinkSync(this.sessionPoolLinkPath(poolId, sessKey)); } catch { } if (this._clearUnplaced(poolId, sessKey)) this._save(); }
  /** Boot reconciliation: unlink per-session links whose session no longer
   *  exists — a leaked link is a billing pointer nobody can see or move. */
  sweepSessionPoolLinks(liveKeys) {
    const root = path.join(this.dataDir, 'pool-links');
    let dropped = 0;
    // r3137 (2): while any conversation's record is UNREAD (src/server/session-meta-verdict.js) the sweep cannot tell which link that
    // record names — it removes NOTHING (the next start sweeps again)
    const SMV = require('./server/session-meta-verdict.js');
    if (SMV.anyUnreadable()) { console.warn('[pool] the per-session link sweep removed nothing: a conversation\'s record could not be read, and a link it names is kept'); return 0; }
    try {
      for (const poolId of fs.readdirSync(root)) {
        const dir = path.join(root, poolId);
        let entries = []; try { entries = fs.readdirSync(dir); } catch { continue; }
        for (const k of entries) if (!liveKeys.has(k) && !SMV.namedByTorn(k)) { try { fs.unlinkSync(path.join(dir, k)); dropped++; } catch { } }   // (r3141: a link a kept torn record names is kept)
        try { if (!fs.readdirSync(dir).length) fs.rmdirSync(dir); } catch { }
      }
    } catch { }
    // lane lg-group-parents (B-526c unit 2): the PIN RECORDS (data/pool-pins) of conversations that are gone — no meta on disk.
    // r3078 — THE KEEP TEST tells «not there» from every other failure (unknown is not gone): only ENOENT — the conversation's meta is
    // gone — lets its pin go; any other failed look (a refused stat, a storage that does not answer) KEEPS the pin this pass (an
    // exists check answered «no» on ANY error). The sweep's listings already remove nothing when they fail (src/pool-pin-record.js).
    try { PinRecord.sweep(this.dataDir, (key) => { try { fs.statSync(path.join(this.dataDir, 'session-meta', key + '.json')); return true; } catch (e) { return !(e && e.code === 'ENOENT'); } }); } catch { }
    // (q-055 M2) an UNPLACED mark of a conversation that no longer exists goes with it
    let cleared = false;
    for (const p of this._state.accounts) for (const k of Object.keys((p && p.unplaced && p.unplaced.links) || {})) if (!liveKeys.has(k)) cleared = this._clearUnplaced(p.id, k) || cleared;
    if (cleared) this._save();
    return dropped;
  }
  /** Every live link path of a pool (sealed orders carry these so the daemon
   *  can match a banner to the RIGHT link; old daemons ignore the field and
   *  keep matching only the default link — reduced coverage, never a wrong
   *  re-point). */
  sessionPoolLinks(poolId) {
    try { return RR.readdir(this.poolLinksDir(poolId)).map((k) => ({ sessKey: k, path: this.sessionPoolLinkPath(poolId, k) })); } catch { return []; }
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
    this._displaySeedPool(a, subId);   // B-360d: the switch — the pool's row shows its new member at once, never the old identity
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
    this._refuseWhileHeld();   // r2947 (2) / r3043: an adding or changing act over a list that could not be read is refused by name
    const be = backend || 'claude';
    if (!capsOf(be).pool || !this._credsOf(be)) throw new Error('pooling is not supported for backend ' + be); // unknown ids throw in harnessOf
    // The darwin exclusion is claude-specific (keychain service name = a hash
    // of the env string) — codex auth.json is a plain file, pools work anywhere
    // directory symlinks do.
    if (this._credsOf(be).keychainSensitive && !this.poolSupported()) throw new Error('pooled accounts need a platform with directory symlinks and no keychain-backed credentials (Linux)');
    if (Array.isArray(members) && members.some((m) => /^pv-/.test(String(m || '')))) throw new Error('a provider is never a pool member — list it as a fallback provider'); // (B-d578)
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
  updatePool(id, { members, auto, hot, priority, crossProvider, fallbackProviders, crossProviderOpened, fallbackProvidersOpened } = {}, { chooseMember = null } = {}) {
    const a = this.get(id);
    if (!a || this._acctType(a) !== 'pooled') throw new Error('not a pooled account');
    // (B-d578) a third-party provider is never a MEMBER — it is a fallback (below); judged before anything is written
    // (a provider id ALREADY on the record — a save an older hub took — is dropped by this save, never refused: the member's own «Exclude
    // from pool» re-sends the list as it stands; round wokm0ktwv)
    if (Array.isArray(members) && members.some((m) => /^pv-/.test(String(m || '')) && !(Array.isArray(a.members) && a.members.includes(m)))) throw new Error('a provider is never a pool member — list it as a fallback provider');
    // (r3886 (B)) THE LAW ON THE HUB: while the provider store cannot be read (held, or lifted EMPTY over torn bytes — the prune's own
    // fact), a CHANGE of the list is refused by name: no page and no caller can empty or shorten it then
    // (r3908 (1)) A STALE DIALOG's EDIT IS REFUSED BY NAME: a request that carries a spend field with the value its dialog OPENED with is
    // refused when the stored value is no longer that one (changed on another page) — the switch, the list as a set and its order; a
    // caller that sends no opening value is judged as before
    const idsOf = (x) => (Array.isArray(x) ? x.map(String) : []).join('\n');
    if (crossProvider !== undefined && crossProviderOpened !== undefined && (a.crossProvider === 'allow' ? 'allow' : 'never') !== (crossProviderOpened === 'allow' ? 'allow' : 'never')) {
      const e = new Error(`«When every member is out» was changed on another page (it is now ${a.crossProvider === 'allow' ? '«Move without asking»' : '«Ask me first»'}) — nothing was saved; the dialog shows it as it is now`); e.code = 'pool_changed_elsewhere'; throw e;
    }
    if (fallbackProviders !== undefined && fallbackProvidersOpened !== undefined && idsOf(a.fallbackProviders) !== idsOf(fallbackProvidersOpened)) {
      const e = new Error('the pool\'s fallback providers were changed on another page — nothing was saved; the dialog shows them as they are now'); e.code = 'pool_changed_elsewhere'; throw e;
    }
    if (fallbackProviders !== undefined && typeof this._providerStoreClean === 'function' && this._providerStoreClean() === false) {
      if (idsOf(fallbackProviders) !== idsOf(a.fallbackProviders)) {
        // (r3908 (2)) the words by the SAME fact the page's note reads: lifted EMPTY over torn bytes names the copy and the way out
        const lock = this._providersLockOf();
        if (lock.providersDamaged) { const e = new Error(`the list of model providers was damaged, so it started empty — VibeSpace kept the damaged bytes as ${lock.providersDamaged.copy}. Add the providers again; the pool's fallback providers stay as they are until VibeSpace restarts with the list it reads now`); e.code = 'providers_damaged'; throw e; }
        const e = new Error(`${lock.providersUnread || 'VibeSpace cannot read its list of model providers right now'} — the pool's fallback providers are not changed until it reads again`); e.code = 'providers_unread'; throw e;
      }
    }
    const fallbackList = fallbackProviders !== undefined ? this._fallbackListOf(a, fallbackProviders) : undefined;
    // A REFUSED WRITE CHANGES NOTHING (B-d578 F2, round wokm0ktwv): the record as it was is kept and put back whole when any check below
    // refuses — a write refused for its priority used to leave the list and the older fields on the live record for the next save
    const was = JSON.parse(JSON.stringify(a));
    try {
    // (q-053 P0b) the owner's per-pool rule for a move to ANOTHER provider: 'never' (the default — a card asks first) or
    // 'allow' (a cold switch + one line in the conversation); anything else is refused by name
    if (crossProvider !== undefined) {
      if (!CROSS_PROVIDER_VALUES.includes(crossProvider)) throw new Error("crossProvider must be 'never' or 'allow'");
      a.crossProvider = crossProvider;
    }
    // (B-d578) the pool's FALLBACK PROVIDERS — used only when every member is out (poolFallbacksOf); absent = none
    if (fallbackList !== undefined) { if (fallbackList) a.fallbackProviders = fallbackList; else delete a.fallbackProviders; }
    if (members !== undefined) { const ms = Array.isArray(members) ? members.filter((m) => !/^pv-/.test(String(m || ''))) : null; a.members = ms && ms.length ? ms.slice(0, 40) : null; }
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
    } catch (e) { for (const k of Object.keys(a)) delete a[k]; Object.assign(a, was); throw e; }
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

  /** THE ONE-SHOT RENAME (migration `2026-11-default-key-names`, B-ba7d — the owner's decision 2026-11-18): a key added without a name
   *  was named «API key …<its tail>», and that name travels in every list, push, payload, notice, refusal and usage row — it becomes
   *  «API key». Idempotent (a renamed record no longer matches). → [{ id }] */
  renameDefaultKeyNames() {
    const out = [];
    for (const a of this._state.accounts) if (a && a.tail && a.name === 'API key …' + a.tail) { a.name = 'API key'; out.push({ id: a.id }); }
    if (out.length) { this._save({ now: true, why: 'the migration of the default key names' }); this._notify(); }   // r3782: a boot migration's reshape lands before its ledger row
    return out;
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
    if (out.length) { this._save({ now: true, why: 'the migration of the manual pools' }); this._notify(); }   // r3782: a boot migration's reshape lands before its ledger row
    return out;
  }

  resolveForSpawn(requested, backend = 'claude', opts = {}) {
    // A THIRD-PARTY PROVIDER (lane lg-providers, B-d578 U2): `pv-<id>` — asked for, or this harness's default — names a provider
    // RECORD, not an account: its own road (src/server/provider-spawn.js through setProviderSpawn), refused by name when unwired
    const pvWant = requested === 'subscription' ? null : (requested || this._state[(this._credsOf(backend) || {}).defaultIdField] || null);
    if (pvWant && /^pv-[a-z0-9][a-z0-9-]{0,63}$/.test(String(pvWant)) && !builtInProviderOf(String(pvWant))) {
      if (!this._providerSpawn) throw Object.assign(new Error('third-party model providers are not available on this hub'), { code: 'provider-unwired' });
      return this._providerSpawn(String(pvWant), backend, opts);
    }
    // THE MONEY (主开发 r2947 / r3043): while the accounts are held NOTHING starts or resumes on another login by a guess — the default and
    // every named account are unknown: refused by name (never null = the machine's own login); a person's own «this machine's login» stays theirs
    if (requested !== 'subscription' && this.held()) throw this._heldRefusal('starting a conversation on an account');
    if (this._credsOf(backend)?.spawnForm === 'isolated-home') return this._resolveHomeSpawn(backend, requested, opts); // the descriptor's creds row picks the form (rv-harnesses H3)
    if (requested === 'subscription') return null; // the CLI's own global login
    const id = requested || this._state.defaultAccountId;
    if (!id) return null;
    const a = this.get(id);
    if (!a) throw new Error('unknown account: ' + id);
    if (this._credsOf(this._acctBackend(a)).spawnForm !== 'securestorage') throw new Error('not a Claude account: ' + a.name);
    if (this._acctType(a) === 'pooled') {
      // THE FALLBACK PROVIDER (row B-d578, the fallback member): the chooser placed this conversation on a third-party provider
      // the pool lists as its fallback (poolFallbacksOf) — its own road (the provider's key from the vault, its own empty home;
      // refused by name like any provider spawn), the pool's id kept: billed to the pool, attributed to the provider (ws-create
      // stamps poolTarget as the held member). Asked BEFORE the self-heal below: a fallback is used when every member is out,
      // signed out included — the heal would refuse that pool before the conversation's placement was read. The question asked here is
      // a PEEK (`fallbackOnly`: the chooser names a fallback the conversation was moved to, or nothing — no proving mark, no line, no
      // dropped carry: round wokm0ktwv's (3)); the conversation's ordinary ask stays below, after the heal, where it always was.
      if (opts.sessionKey && this._providerSpawn && this.poolFallbacksOf(id).length) {
        let fb = null; try { fb = opts.chooseMember?.(id, { fallbackOnly: true }) ?? null; } catch { fb = null; }
        if (fb && this.poolFallbacksOf(id).includes(fb)) return { ...this._providerSpawn(String(fb), backend, opts), id: a.id, name: a.name, pooled: true, poolTarget: String(fb), kind: 'provider' };
      }
      RR.forget(this._poolLinkDir(a)); // B-403e: the spawn's self-heal looks again before it re-points the pool default
      let cur = this.poolCurrent(id);
      if (cur) RR.forget(this.subDir(cur));
      // SELF-HEAL (2.330.2, real outage: BOTH the pool's target and every
      // per-session link pointed at accounts whose refresh token had aged out
      // while idle, so EVERY resume failed with "pooled target is not logged
      // in" and the user had no way forward). Routing around a dead member is
      // the entire point of a pool — a dead target must re-point, not throw.
      // poolMembers() is already filtered to still-valid logins.
      const liveTarget = (x) => !!x && this._placeable('claude', x); // a member a NEW placement may land on (F5)
      let startOff = null; // (q-055 M2) a NEW conversation's first member while the pool's default stays UNPLACED
      if (!cur || !this.readSubCreds(id).loggedIn || !liveTarget(cur)) {
        const alive = this.poolMembers(id).map((m) => m.id);
        if (!alive.length) {
          // every member left holds only our long-lived-token file and the hub's CLI is a known UNMEASURED one:
          // the conversations already on them keep running; a new one waits for a measured CLI (or a sign-in)
          const held = this._poolLoginCandidates(id).filter((m) => this.readSubCreds(m.id).oatFile).length;
          // …or every such token is ANOTHER account's (the identity post-check, lane oat-identity-postcheck): said by name
          const foreignM = this._poolLoginCandidates(id).filter((m) => this.readSubCreds(m.id).oatFile && this.oatCheckOf(m.id)?.state === 'mismatch'), foreign = foreignM.map((m) => m.name || m.id);
          // B-8703 (r4586): each member's row named as its menu shows it — «Long-lived token (expired)…» once the token's lifetime ran out, else «(active)…»
          const rowOf = (m) => `«Long-lived token (${m.oatEnc && (m.oatMintedAt || 0) + this.OAT_TTL_MS < Date.now() ? 'expired' : 'active'})…»`;
          const rows = foreignM.length === 1 ? `${rowOf(foreignM[0])} on its row` : foreignM.map((m) => `${m.name || m.id}: ${rowOf(m)}`).join('; ');
          if (held && foreign.length === held) throw Object.assign(new Error(`pool "${a.name}" can't start a conversation: the long-lived token${foreign.length === 1 ? '' : 's'} its member${foreign.length === 1 ? '' : 's'} ${foreign.join(', ')} ${foreign.length === 1 ? 'holds belongs' : 'hold belong'} to another account — conversations already running continue; re-mint or re-bind ${foreignM.length === 1 ? 'it' : 'each'} in Manage agents (${rows})`), { code: 'oat-identity-mismatch' });   // B-8703 (r4450 / r4586): the live labels, each row as its menu shows it
          if (held) throw Object.assign(new Error(cliCaps.cliHeldSpawnText({ pool: a.name, cli: this.oatFileCaps().cli, local: localFacetOf(this.oatFileCaps()).local })), { code: 'oat-cli-unmeasured' });
          throw new Error(`every member of pool "${a.name}" is signed out — re-login one in Manage Agents (the pool cannot route around a fully signed-out member set)`);
        }
        // Prefer a member whose LOGIN SESSION is not already dead (2026-09-07):
        // an 'expired' member still parses as loggedIn (the tokens are only
        // blanked at the CLI's next failed refresh), so without this the
        // self-heal happily re-points onto a login that fails the first turn.
        // A STABLE ordering, never a filter — every member being expired must
        // still start the session (and then say so) rather than throw here.
        alive.sort((x, y) => loginRank(this.loginStateOf(x, Date.now(), { slot: true })) - loginRank(this.loginStateOf(y, Date.now(), { slot: true })));
        // (lane pool-provider-latents, q-055 M2) a default a deletion left UNPLACED is set again only onto a member of ITS
        // provider: a conversation with no link of its own reads the default link, and another provider's member under it
        // would move that conversation silently. With none, a conversation that gets its own link (below) starts without
        // the default; one that would read the default is refused by name.
        const ud = this.unplacedOf(id, null);
        const udKey = ud ? this._providerKeyOf(ud.provider) : null;
        const healable = udKey ? alive.filter((x) => this._providerKeyOf(this.memberProviderOf(x)) === udKey) : alive;
        if (!healable.length) {
          if (!opts.sessionKey) throw Object.assign(new Error(`pool "${a.name}" sat on "${ud.name || ud.member}" (${(ud.provider && ud.provider.label) || 'its provider'}), which was deleted, and no other member of that provider is left — its conversations wait in For you; add or sign in one`), { code: 'default_unplaced' });
          startOff = alive[0];
        } else {
          let pick = null;
          // (the chooser is TOLD which pool it decides for — the one this spawn resolved — and that this is the POOL's
          // default it is placing, not one conversation: a conversation's pin must never become the pool default, verify r2)
          try { const c = opts.chooseMember?.(id, { forDefault: true }); if (healable.includes(c)) pick = c; } catch { }
          pick = pick || healable[0];
          const was = cur;
          this.setPoolTarget(id, pick);
          cur = pick;
          console.warn(`[pool] "${a.name}" target ${was || '(none)'} is signed out — re-pointed to ${this.get(pick)?.name || pick} so the session can start; re-login the dead account in Manage Agents`);
          try { global.__vsEvent?.('pool-target-signed-out', { detail: `${was || 'none'}→${pick}` }); } catch { }
        }
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
        member = member || cur || startOff;
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
        return { id: a.id, name: a.name, kind: 'subscription', oatOnly: true, oatFile: true, oatGen: a.oatMintedAt || null, localEnv: { [this._credsOf('claude').spawnEnvVar]: this._acctDir('claude', id) }, secret: oatSecret };
      }
      // our token file is not a LOGIN: without the above it spawns on the env
      // road, or (its token ended) is refused by name like a missing login
      const loginInDir = !!info.loggedIn && !info.oatFile;
      // …and so does a DEAD dir login (2026-10-13): an 'expired' login still
      // parses loggedIn, and spawning on it fails the first refresh while the
      // row's chip says the token keeps it running — the token IS the spawn.
      const dirDead = !!oat && loginInDir && !loginUsable(this.loginStateOf(id, Date.now(), { slot: true }));
      if ((!loginInDir || dirDead) && oat) {
        return { id: a.id, name: a.name, kind: 'subscription', oatOnly: true, oatGen: a.oatMintedAt || null, localEnv: { CLAUDE_CODE_OAUTH_TOKEN: oat }, secret: oatSecret };
      }
      // Expired oat: fail the CREATE with the real reason instead of letting
      // the CLI 401 opaquely mid-session (a long-lived 401 has no self-heal).
      // loggedIn + expired-oat just drops the secret — the dir login works
      // locally and the remote paths give their normal actionable errors.
      if (!loginInDir && a.oatEnc && oatExpired) throw new Error(`the long-lived token for ${a.name} has expired — re-mint it in Manage agents with «Long-lived token (expired)…» on its row`);
      if (!loginInDir) throw new Error('subscription not logged in: ' + a.name);
      return {
        id: a.id, name: a.name, kind: 'subscription', oatExpired: oatExpired || undefined, ...(oatSecret ? { oatGen: a.oatMintedAt || null } : {}),
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
    if (!key) throw keyNo ? Object.assign(new Error(`account key unavailable (${publicNameOf(a)}) — ${keyNo.message}`), { code: keyNo.code }) : new Error('account key unavailable (decryption failed): ' + publicNameOf(a)); // O1: the key file's refusal, said; the account by its public name (B-ee0a smalls)
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
    // a localOnly row (antigravity — the login is a secret file we never read, so never ship) runs on THIS machine
    if (opts.remote && this._credsOf(backend).localOnly) throw new Error(`${harnessOf(backend).label} accounts run on this machine only — "${a.name}" cannot start on another machine; pick that machine's own login`);
    // codex POOL (P2, cold-switch v1): CODEX_HOME = the pool's symlink among
    // the member CODEX_HOME dirs — a spawn resolves through it to whichever
    // member the engine currently targets; switches restart the session
    // (kill+resume, the existing cold machinery). Self-heal a dangling link
    // to the first healthy member, exactly like the claude resolve branch.
    if (this._acctType(a) === 'pooled') {
      if (this._acctBackend(a) !== backend) throw new Error('not a ' + harnessOf(backend).label + ' account: ' + a.name);
      RR.forget(this._poolLinkDir(a)); // B-403e: the self-heal looks again before it re-points the pool default
      let cur = this.poolCurrent(id);
      if (cur) RR.forget(this._acctDir(backend, cur));
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
      if (pinned) return { id: a.id, name: a.name, kind: backend + '-pooled', pinnedMember: pinned, localEnv: this._homeSpawnEnv(backend, this._acctDir(backend, pinned)), secret: null, remoteCreds: null };
      return { id: a.id, name: a.name, kind: backend + '-pooled', localEnv: this._homeSpawnEnv(backend, this._acctDir(backend, id)), secret: null, remoteCreds: null };
    }
    if (this._acctBackend(a) !== backend) throw new Error('not a ' + harnessOf(backend).label + ' account: ' + a.name);
    const info = this._readAuthFor(backend, id);
    if (!info.loggedIn) throw new Error(backend + ' account not logged in: ' + a.name);
    return {
      id: a.id, name: a.name, kind: backend + '-subscription',
      localEnv: this._homeSpawnEnv(backend, this._acctDir(backend, id)), secret: null,
      // REMOTE: ship auth.json to the host's CODEX_HOME copy; sessions/config
      // symlink the host's own ~/.codex (targets ensured first) so threads +
      // settings stay shared on the host, auth isolated per account. A localOnly
      // row (antigravity: a login we never read) ships nothing — refused above.
      remoteCreds: this._credsOf(backend).localOnly ? null : this._remoteCreds(backend, id, a),
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
    // …nor ANY long-lived token (acceptance r3 F4, login-expiry usageBearerOk): one planted without our mark is the same credential
    // — known by its SHAPE, an access token with no refresh token beside it, never by its prefix (acceptance r4)
    const info = this.readSubCreds(id);
    return info.oatFile || !usageBearerOk({ accessToken: info.accessToken, refreshToken: info.refreshable }) ? null : info.accessToken;
  }
  /** Why the folder's own token is no usage Bearer, by name — 'long-lived' (a long-lived token, ours or not) — or null */
  usageTokenRefusal(id) {
    const a = this.get(id);
    if (!a || this._acctType(a) !== 'subscription') return null;
    const info = this.readSubCreds(id);
    return info.oatFile || (typeof info.accessToken === 'string' && info.accessToken && !usageBearerOk({ accessToken: info.accessToken, refreshToken: info.refreshable })) ? 'long-lived' : null;
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
        this._noteCliTail(tail);   // B-ee0a: a different CLI key than last seen moves the tails generation (and pushes the list)
        return {   // NO tail beside the list (B-ba7d): `imported` says what the page compared it for; the person's read is keyTails().cliKey
          present: true,
          org: cfg?.oauthAccount?.organizationName || null,
          imported: this._state.accounts.some((a) => a.tail === tail),
        };
      }
      this._noteCliTail(null);   // parsed, no key in it
    } catch (e) { if (e && e.code === 'ENOENT') this._noteCliTail(null); }   // a torn or unreadable file (a CLI writing it) is no sight: it moves nothing
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

// B-403e LOOK-AGAIN for THE TWO SLOT WRITERS, from outside their text (THE SLOT LAW, test-oat-materialize: they stay
// byte-identical): before a billing link is written, the member's sign-in folder and the link(s) it re-points are FORGOTTEN by
// the synchronous run (src/run-reads.js), so the writer's own «is this member signed in» check and the ledger's «from» ask the
// mount itself — never an earlier answer of the run another process may have changed since
const LOOK_AGAIN_SLOT_WRITERS = [
  // the member's folder, the conversation's own link, and the pool's default link (a conversation with no link of its own
  // reads its «from» through it) — EACH NAMED BY ITS OWN FUNCTION (B-403e follow-up): one that cannot be named never skips the others
  ['ensureSessionPoolLink', [
    function (poolId, sessKey, memberId) { return this.subDir(memberId); },
    function (poolId, sessKey) { return this.sessionPoolLinkPath(poolId, sessKey); },
    function (poolId) { return this._poolLinkDir(this.get(poolId) || { id: poolId }); },
  ]],
  ['setPoolTarget', [
    function (id, subId) { const a = this.get(id); return this._acctDir((a && this._acctBackend(a)) || 'claude', subId); },
    function (id) { const a = this.get(id); return a ? this._poolLinkDir(a) : null; },
    function (id) { return this.poolLinksDir(id); },
  ]],
];
// each folder is named in its OWN try, and a folder that cannot be NAMED drops the run's memo (RR.dropRun; forget itself never throws): the
// writer's check then asks the mount for everything — never an earlier answer the look-again could not forget by name
for (const [name, namers] of LOOK_AGAIN_SLOT_WRITERS) {
  const writer = AccountManager.prototype[name];
  AccountManager.prototype[name] = { [name](...args) { for (const nameOf of namers) { let d = null; try { d = nameOf.apply(this, args); } catch { RR.dropRun(); continue; } if (d) RR.forget(d); } return writer.apply(this, args); } }[name];
}

module.exports = { countingSaves, AccountManager, publicNameOf, maskDefaultKeyName };
