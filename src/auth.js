/**
 * Password authentication — optional, single-password (team-shared) model.
 *
 * - No password configured → auth disabled entirely (local single-user compat).
 * - Password sources: VIBESPACE_PASSWORD env var, or data/auth.json (persisted
 *   scrypt hash — written by setPassword / the generate path).
 * - Sessions: random bearer tokens in an HttpOnly cookie, persisted server-side
 *   in data/auth.json so restarts don't log everyone out — as sha256(token)
 *   ONLY (lane vault-e2e-password-fix-r2: a copy of auth.json opens no login;
 *   a plaintext map an older build wrote is hashed at the first start, every
 *   login staying valid). A login lives 30 days from its LAST use (each use
 *   slides it) and never past 180 days from its sign-in (the cap — the owner's
 *   decision ④, design q-042 D9); a vault LOCK signs every login out (the hub's
 *   wiring calls revokeAllTokens and closes every page's socket).
 * - Login attempts are rate limited per IP (5 fails → 60s lock).
 * - THE SIGN-IN FILE IS HELD WHEN IT CANNOT BE READ (B-dc3f, HIGH): a data/auth.json that EXISTS and cannot be read or
 *   parsed (a torn write, a folder or a link to nothing in its place, a permission, a network mount's bad read) HOLDS
 *   the instance CLOSED. Before, it was taken as «no sign-in»: the instance ran OPEN to its network until its next start,
 *   and a later save wrote an empty table over the real file. Held (`_held`, set at load, read by every road from here):
 *   every request the gate sees — pages, APIs and doors — is refused by name with the way out; `enabled` and
 *   `passwordEnabled` answer «on»; no login is valid (`checkToken`, `requestAuthed`: every upgrade that asks); NOTHING is
 *   written over the file (`_save` and every road that would write refuse). The journal says it once, at the start. A
 *   file that is truly missing (nothing at the path) stays a new instance, as before.
 *   THE HOLD CLOSES WHAT THE FILE GUARDS (the round, 主开发 r1148): with single sign-on on, SSO still guards — its logins
 *   live in memory only (nothing is written), the local password road stays refused, the held words stay on the sign-in
 *   page and in the journal. Without it (`shut`) everything is refused, but THE SIGN-IN PAGE ANSWERS AS A PAGE (200, the
 *   held words): a health check's start, ready and alive probes ask it, and a refusal there restarted a held pod for ever.
 *   Every upgrade is shut too (`upgradeHeld`), a public /svc socket included, but a paired machine's dial-in, which
 *   carries its own dial token.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { LOGIN_WORDS, loginWords } = require('./login-words.js'); // lane ui-language: the sign-in page's words, whole in en / zh / ja
const { landingLang } = require('./landing-lang.js'); // the browser's asked language (the landing pages' one rule)
const appCsp = require('./app-csp.js'); // PURE: the sign-in page's report-only policy (lane app-page-csp)
const { crossSiteVerdict, ownOriginOf } = require('./write-origin.js');
const { doorClassOf } = require('./door.js');   // THE DOOR CLASS: one pure function, the middleware judges every request through it
/** the classes the gate lets through WITHOUT a cookie — named, so the gate FAILS CLOSED: a class nobody named here (a sixth one
 *  added to the door class later, a typo) is refused by name, never let in by default (B3a's round wtyy237tl) */
const PASSES = Object.freeze(new Set(['door', 'open', 'login']));
const PD = require('./path-dot-segment.js'); // PURE (r1317): a path with a dot segment is never a door
const { replaceShredding } = require('./secret-file.js');
// THE TABLE'S SHARED LAW (src/signin-table.js, the separation's B3b-1): the cookie, the ages, the digest, the held judgement and words
const { TOKEN_COOKIE, TOKEN_TTL_MS, TOKEN_IDLE_MS, TOKEN_SLIDE_SAVE_MS, OWN_RULE_UPGRADES, LOCAL_ROAD, routeKey, heldWords, heldCause, tokenDigest, loginAlive, cookieMaxAge, judgeRead,
  heldJournal, HELD_UPGRADE, hashSync, hashMatches, migrateTokens, addLogin, heldPage, heldJson, loginCookie, CLEAR_COOKIE, cookieTokenOf, rateCheck, rateFail } = require('./signin-table.js');
const { loginHtml } = require('./login-page.js');   // the sign-in page, one for both holders
const SW = require('./signin-witness.js');   // B-dc3f (1): the data folder's own id inside it, the witness outside it (the plain form)
/** B-dc3f (1), 主开发 r2780 (2) H1 + r2869: the network home's look — its bound, its re-ask (one look out at a time) and its read size */
const NET_BOUND_MS = 5000, NET_REASK_MS = 30000, NET_MAX_BYTES = 4096;

/** the held state's answer (B-dc3f): a page navigation gets the words (in the asked language), an API or a door gets them as
 *  JSON — 503, the way out named. `page` = THE SIGN-IN PAGE itself: it answers AS A PAGE, 200 whatever the request accepts
 *  (a health check asks it — the tree's chart: start, ready and alive — and a refusal there restarted a held pod for ever) */
function refuseHeld(held, req, res, { sso = false, page = false } = {}) {
  const lang = landingLang(req.headers['accept-language']), w = heldWords(lang, sso, held);
  res.setHeader('Retry-After', '3600');
  if (page || (req.method === 'GET' && String(req.headers.accept || '').includes('text/html'))) {
    return res.status(page ? 200 : 503).type('html').send(heldPage(held, lang, w));
  }
  return res.status(503).json(heldJson(held, lang, w));
}
const heldError = (held) => Object.assign(new Error(`the sign-in file is held (${held.why}) — nothing is written over it`), { code: 'signin-held' });

class Auth {
  constructor(dataDir, { clerk = null, witness = null } = {}) {
    this._file = path.join(dataDir, 'auth.json');
    // B-dc3f (1): `witness` = the start's inputs for the witness ({env, throwaway, …}; server.js passes its env and THE ONE TEST's
    // answer to the PLAIN form only; the home is read when the facts are) — null = no folder check (the piped form's hub, which
    // opens no file; an Auth a suite builds for another purpose); the facts are read ONCE, beside this file's own read
    this._dataDir = dataDir; this._witnessCfg = witness; this._facts = null; this._said = new Set();
    // H1: the hub's worker pool (server.js hands it once built; a suite in `witness.pool`), the network home's look, the boot's held password road
    this._pool = (witness && witness.pool) || null; this._net = null; this._netEnsure = null; this._netWrites = null; this._startId = null;
    this._startNewUsed = false; this._netStartNewOwed = false;   // r2869 (2) + r2926 (1): the person's start-new act at this start
    this._state = null; // { passwordHash, salt, tokens: { token: {createdAt, ua} } }
    this._attempts = new Map(); // ip -> { fails, lockUntil }
    this._clerk = clerk; // optional ClerkAuth (src/clerk-auth.js)
    this._load();
    this._afterLoad();
  }

  /** B-dc3f (1): the start's facts (the folder, its id, the witness) — read once, never while a suite gave no inputs */
  _startFacts() {
    if (!this._witnessCfg) return null;
    if (this._facts) return this._facts;
    try { this._facts = SW.startFactsSync({ dataDir: this._dataDir, ...this._witnessCfg }); } catch (e) { this._sayOnce('facts', `[auth] the data folder's sign-in facts could not be read (${(e && e.message) || e}) — a folder that is not the one reads as before`); this._facts = null; }
    return this._facts;
  }
  _sayOnce(k, line) { if (this._said.has(k)) return; this._said.add(k); try { console.warn(line); } catch { } }
  /** B-dc3f (1): after the load — the folder's id written ONCE (never while held), then the witness learned */
  _afterLoad() {
    if (this._held || !this._witnessCfg) return;
    const f = this._startFacts();
    if (!f) return;
    const startId = f.instance && f.instance.id;   // r2780 (2) H2: the id this folder held AT THE START (before any id is written)
    this._startId = startId;
    if (this._startNewUsed) {   // r2869 (2) + r2926 (1): THE PERSON's START-NEW ACT — this start does not wait for the home folder and READS
      // none of it; as the person's act (like deleting the witness) every witness copy is removed — the home folder's off the loop — and
      // the file is removed only once that copy is gone, so the decision lasts past the next start
      for (const w of (f.found || [])) { try { SW.removeWitness({ file: w.file }); } catch { } }
      f.found = []; f.witness = null;
      this._sayOnce('start-new', `[auth] ${path.join(this._dataDir, SW.START_NEW)} was there: this start did not wait for the home folder ${f.netHome} and read none of it; every sign-in witness copy is removed (the home folder's off the loop), then the file`);
      try { f.instance = SW.ensureInstance(this._dataDir, f.instance); } catch (e) { this._sayOnce('instance', `[auth] the data folder's id could not be written (${(e && e.message) || e})`); }
      this._netStartNew();
      return;
    }
    try { f.instance = SW.ensureInstance(this._dataDir, f.instance); } catch (e) { this._sayOnce('instance', `[auth] the data folder's id (${path.join(this._dataDir, SW.INSTANCE_FILE)}) could not be written (${(e && e.message) || e}) — no witness is kept until it is`); return; }
    this._syncWitness({ atStart: true, startId });
    this._netWitness({ atStart: true, startId });
  }
  /** THE ONE WRITER of the witness (B-dc3f (1), law 3): after the sign-in file is on disk — a password set ⇒ written (this
   *  folder's id), none ⇒ removed. A failure never fails the person's act: said once, learned again at the next start.
   *  主开发 r2152 (c): written again at each start (and at a set or an import) — a hub that does not restart for longer than
   *  the system cleaner's age can still lose a copy on /var/tmp (said in the kb). r2269 (1): EVERY copy found is kept and
   *  refreshed where it can be written, never removed because another was written: a network home late at one start puts its
   *  copy in the folder under the mount point, and the other copy is the one the next start finds. */
  _syncWitness({ atStart = false, startId = null } = {}) {
    if (this._held || !this._witnessCfg) return;
    const f = this._startFacts();
    if (!f || !f.instance) return;
    const set = !!(this._state && this._state.passwordHash), found = f.found || [];
    // 主开发 r2780 (2) H2: NO START whose folder held another id or none DELETES a witness — with no password set, a copy that names
    // another folder (or cannot be read) stays as it is (such a start is held by the verdict first; this is its second lock). A
    // folder GUARDED by its own password (a restore from before ids) is followed, as before: its file decides when the other returns
    if (atStart && !set && SW.foreignAt(found, startId)) { this._sayOnce('foreign', `[auth] a sign-in witness names another data folder than ${this._dataDir} (${found.map((w) => w.file).join(', ')}) — this start keeps every copy as it is`); return; }
    const each = (file, act, fn) => { try { fn(); } catch (e) { this._sayOnce('witness', `[auth] the sign-in witness ${file} could not be ${act} (${(e && e.message) || e}) — it is ${act} again at the next start`); } };
    if (set) {
      const files = [...new Set([...(f.place && f.place.dir ? [f.file] : []), ...found.filter((w) => w.writable !== false).map((w) => w.file)])];   // the ladder's place + every copy found whose folder takes a write (r2436 (3))
      for (const file of files) each(file, 'written', () => SW.writeWitness({ place: { dir: path.dirname(file) }, file, root: f.root, dataDir: f.dataDir, id: f.instance.id, uid: f.uid }));
      f.witness = { id: f.instance.id }; f.found = files.map((file) => ({ file, doc: { id: f.instance.id } }));
    } else {
      for (const w of found) each(w.file, 'removed', () => SW.removeWitness({ file: w.file }));   // the sign-in turned off: every copy
      f.found = []; f.witness = null;
    }
  }
  /** B-dc3f (1), 主开发 r2780 (2) H1 + r2869: THE NETWORK HOME's LOOK — a start that would OPEN (the sign-in file missing, or saying
   *  off) on a hub whose home is a network mount reads that home's witness copy first, ONLY through the worker pool. The start is
   *  HELD «checking» meanwhile (no wait is added: the doors answer, held). ONE look at a time: a look not answered starts no second.
   *  A look past its bound ⇒ HELD «home», asked again at each re-ask while none is out. The first answer ends it for good: no
   *  witness of another folder ⇒ the start goes on as it would have; a witness (another id) or an unreadable one ⇒ held by the
   *  folder's own rule. Nothing is written to the network home while its answer is unknown. */
  _checkHome(was, table) {
    const f = this._facts;
    this._net = { was, table, pending: false, timer: null, looks: 0, done: false };
    this._hold(`the data folder ${this._dataDir} ${was === 'off' ? 'says sign-in is off' : 'holds no sign-in file'}, and the sign-in witness on the home folder ${f.netHome} (a network mount) is read off the loop before it opens`, 'checking', { home: f.netHome });
    this._netLook();
    // r2901: A START NEVER HANDED A POOL (it could not be built; an embedding that forgets it) never sits held and silent: past the
    // bound with no pool it says by name that the check could not be started, with the same act to decide now; a pool handed later still looks
    const unstarted = setTimeout(() => {
      const n = this._net;
      if (!n || n.done || this._pool || !this._held || this._held.kind !== 'checking') return;
      this._held.kind = 'unchecked';
      this._held.why = `the check of the home folder ${f.netHome} for the sign-in witness could not be started (no worker pool to read it with), so it cannot be known whether the data folder ${this._dataDir} is the one its sign-in was set in`;
      try { console.error(`[auth] ${heldJournal(this._file, this._held.why, !!this._clerk?.enabled, this._held)}`); } catch { }
    }, this._netBound());
    if (unstarted.unref) unstarted.unref();
  }
  /** the start-new act's removal of the home folder's copy, off the loop; the file stays until that copy is gone (r2926 (1)) */
  _netStartNew() {
    const f = this._facts, marker = path.join(this._dataDir, SW.START_NEW);
    const done = () => { try { SW.removeWitness({ file: marker }); } catch { } };
    if (!f || !f.netFile) return done();
    if (!this._pool) { this._netStartNewOwed = true; return; }   // attachWitnessPool runs it
    this._netStartNewOwed = false;
    let asked; try { asked = Promise.resolve(this._pool.call('unlink', { path: f.netFile }, { timeoutMs: this._netBound() })); } catch (e) { asked = Promise.reject(e); }
    this._netWrites = asked.then(done, (e) => this._sayOnce('start-new-net', `[auth] the sign-in witness on the home folder ${f.netFile} could not be removed (${(e && e.message) || e}) — ${marker} stays, and the next start removes it again`));
  }
  /** the hub's worker pool, handed by server.js once built (after Auth): the look starts then; the network copy rides it */
  attachWitnessPool(pool) {
    if (!this._witnessCfg || !pool || typeof pool.call !== 'function') return;
    this._pool = pool;
    if (this._netStartNewOwed) { this._netStartNew(); return; }
    if (this._net && !this._net.done) this._netLook();
    else if (!this._held) this._netWitness({ atStart: true, startId: this._startId });
  }
  _netBound() { const v = Number(this._witnessCfg && this._witnessCfg.netBoundMs); return v > 0 ? v : NET_BOUND_MS; }
  _netReask() { const v = Number(this._witnessCfg && this._witnessCfg.netReaskMs); return v > 0 ? v : NET_REASK_MS; }
  _netLook() {
    const n = this._net, f = this._facts;
    if (!n || n.done || n.pending || !this._pool) return;   // ONE look at a time (r2869 (1))
    const bound = this._netBound();
    n.pending = true; n.looks++;
    let over = false;
    const timer = setTimeout(() => { over = true; this._netAnswer({ answered: false, why: `no answer in ${bound} ms` }); }, bound);
    if (timer.unref) timer.unref();
    let asked;   // the look starts AT ONCE (a pool that throws is an answer of «no answer», never a throw out of the start)
    try { asked = Promise.resolve(this._pool.call('readText', { path: f.netFile, maxSize: NET_MAX_BYTES }, { timeoutMs: bound })); } catch (e) { asked = Promise.reject(e); }
    asked.then((r) => ({ text: r && r.content }), (error) => ({ error }))
      .then((res) => {
        clearTimeout(timer); n.pending = false;
        const a = SW.netAnswerOf(res, { root: f.root, dataDir: f.dataDir, file: f.netFile });
        if (!a.answered && over) return;   // said at the bound already; the re-ask asks again
        this._netAnswer(a);
      });
  }
  _netAnswer(a) {
    const n = this._net, f = this._facts;
    if (!n || n.done) return;
    if (!a.answered) {
      if (this._held && (this._held.kind === 'checking' || this._held.kind === 'unchecked')) {
        this._held.kind = 'home';
        this._held.why = `the home folder ${f.netHome} that keeps the sign-in witness has not answered (${a.why}), so it cannot be known whether the data folder ${this._dataDir} is the one its sign-in was set in`;
        try { console.error(`[auth] ${heldJournal(this._file, this._held.why, !!this._clerk?.enabled, this._held)}`); } catch { }
      }
      const again = () => { n.timer = setTimeout(() => { n.timer = null; if (n.done) return; if (n.pending) { again(); return; } this._netLook(); }, this._netReask()); if (n.timer.unref) n.timer.unref(); };
      if (!n.timer) again();
      return;
    }
    n.done = true; if (n.timer) { clearTimeout(n.timer); n.timer = null; }
    if (a.found) f.found = [...(f.found || []), a.found];
    const v = SW.verdictOf({ auth: n.was, dataLink: f.dataLink, instance: f.instance, found: f.found, dataDir: this._dataDir });
    this._held = null;
    if (v.hold) { this._hold(v.hold.why, v.hold.kind, v.hold); return; }   // the folder's own rule (r2869 (3))
    this._state = n.was === 'off' ? n.table : null;
    try { console.warn(`[auth] the home folder ${f.netHome} answered: no sign-in witness of another folder there — the instance opens as it would have`); } catch { }
    this._afterLoad();
    if (this._netEnsure) {   // the boot's own password road, held until the answer (server.js asked it while this was checking)
      const r = this.ensurePassword(this._netEnsure); this._netEnsure = null;
      if (r && r.generated) { try { console.log(`  Generated workspace password: ${r.generated} (persisted in data/auth.json — set VIBESPACE_PASSWORD to choose your own)`); } catch { } }
    }
  }
  /** H1: THE NETWORK HOME's COPY, kept like the others but ONLY through the pool (never on the loop): written at a start that is not
   *  held and at every set / import, removed when the sign-in is turned off; a START reads it first and never writes over or removes
   *  another folder's copy (H2); never while the home's answer is unknown. A failure is said once; the next start learns it. */
  _netWitness({ atStart = false, startId = null } = {}) {
    const f = this._facts;
    if (!f || !f.netFile || !this._pool || this._held || (this._net && !this._net.done) || !f.instance) return null;
    const set = !!(this._state && this._state.passwordHash), id = f.instance.id, bound = this._netBound(), pool = this._pool, file = f.netFile;
    const say = (act, e) => this._sayOnce('net-witness', `[auth] the sign-in witness on the home folder ${file} could not be ${act} (${(e && e.message) || e}) — it is ${act} again at the next start`);
    const ask = (op, payload) => pool.call(op, payload, { timeoutMs: bound });
    const run = async () => {
      if (atStart) {   // H2: a start reads it first, and keeps another folder's copy as it is
        const a = SW.netAnswerOf(await ask('readText', { path: file, maxSize: NET_MAX_BYTES }).then((r) => ({ text: r && r.content }), (error) => ({ error })), { root: f.root, dataDir: f.dataDir, file });
        if (!a.answered) return say(set ? 'written' : 'removed', a.why);
        if (!set && a.found && SW.foreignAt([a.found], startId)) return this._sayOnce('foreign', `[auth] a sign-in witness names another data folder than ${this._dataDir} (${file}) — this start keeps it as it is`);
        if (!set && !a.found) return;
      }
      if (set) {
        await ask('mkdir', { path: path.dirname(file) });
        const tmp = `${file}.tmp-${process.pid}`;
        await ask('writeFile', { path: tmp, content: JSON.stringify(SW.witnessDoc({ root: f.root, dataDir: f.dataDir, id })) });
        await ask('rename', { oldPath: tmp, newPath: file });
      } else await ask('unlink', { path: file });
    };
    this._netWrites = run().catch((e) => say(set ? 'written' : 'removed', e));
    return this._netWrites;
  }
  /** B-dc3f (1): the opt-in declaration (VIBESPACE_SIGNIN=required, set nowhere by default) — read from the start's inputs */
  _declaredNow() { return !!(this._witnessCfg && SW.declaredOf(this._witnessCfg.env || {})); }


  _load() {
    this._held = null;
    // ONE READ, judged by the table's shared law (src/signin-table.js judgeRead — B-dc3f's shapes and words, the interface's too)
    let text = null, error = null, linkGone = false;
    try { text = fs.readFileSync(this._file, 'utf-8'); } catch (e) { error = e || Object.assign(new Error('an error'), { code: 'an error' }); }
    if (error && error.code === 'ENOENT') { try { fs.lstatSync(this._file); linkGone = true; } catch { /* nothing at the path */ } }
    const j = judgeRead({ error, text, linkGone });
    if (j.held) return this._hold(j.held);
    if (j.missing) {
      // truly missing: nothing at the path — a new instance, UNLESS the folder is not the one (B-dc3f (1)): a link to nowhere,
      // or a witness whose id this folder does not hold; a folder that moved WITH its id file is the same folder
      const f = this._startFacts();
      const v = f ? SW.verdictOf({ auth: 'missing', dataLink: f.dataLink, instance: f.instance, found: f.found, dataDir: this._dataDir }) : { hold: null };
      if (v.hold) return this._hold(v.hold.why, v.hold.kind, v.hold);
      if (f && f.netHome) { if (!f.startNew) return this._checkHome('missing', null); this._startNewUsed = true; }   // H1: the network home's copy is read first, off the loop — unless the person's start-new file decides
      this._state = null; return;
    }
    this._state = j.state;
    // B-dc3f (1), 主开发 r2780 (2) H2: A FOLDER THAT IS NOT THE ONE THE WITNESS SAW NEVER OPENS THE INSTANCE BY SAYING «OFF» — a file
    // that is there with no password record asks the same verdict as a missing one (another id, none, an unreadable witness ⇒ held);
    // the same folder turned off by the person through the product opens, as before (its witness was removed with the act)
    if (!this._state.passwordHash) {
      const f = this._startFacts();
      const v = f ? SW.verdictOf({ auth: 'off', instance: f.instance, found: f.found, dataDir: this._dataDir }) : { hold: null };
      if (v.hold) return this._hold(v.hold.why, v.hold.kind, v.hold);   // H2: held — its own file says off, the witness names another folder
      if (f && f.netHome) { if (!f.startNew) return this._checkHome('off', this._state); this._startNewUsed = true; }   // H1: …and the network home's copy is read first (or the start-new file decides)
    }
    // THE MIGRATION (once, at the first start of this build): a plaintext token map becomes its digests — every login
    // stays valid ONCE (the cookie's token hashes to its key; an older build never stamped a use, so the migration counts as
    // one: 30 days from now, still inside its 180-day cap); the old file's bytes are overwritten (replaceShredding)
    const out = migrateTokens(this._state && this._state.tokens, Date.now());   // the table's shared law (src/signin-table.js)
    if (out) {
      this._state.tokens = out;
      try { this._save(); } catch (e) { console.warn('[auth] the login tokens could not be re-written as digests:', e.message); }
    }
  }

  /** HOLD the instance closed on a sign-in file that cannot be read (B-dc3f): said once, here, at the start */
  _hold(why, kind = 'file', verdict = null) {
    const sso = !!this._clerk?.enabled;
    this._state = sso ? { tokens: {} } : null;   // single sign-on still guards: its logins in MEMORY only (_save writes nothing while held)
    const files = verdict && Array.isArray(verdict.files) ? verdict.files : [];   // B-dc3f (1): every witness file there (both places)
    this._held = { why, kind, ...(kind !== 'file' ? { dir: this._dataDir, ...(files.length ? { witness: files.join(', '), witnesses: files } : {}), ...(verdict && verdict.unread ? { unread: true } : {}) } : {}) };
    if (verdict && verdict.home) this._held.home = verdict.home;   // H1: the network home the look reads
    try { console.error(`[auth] ${heldJournal(this._file, why, sso, this._held)}`); } catch { }   // the table's shared words (src/signin-table.js): a folder / link / declared hold says its own act
  }

  /** the held state (B-dc3f), or null: { why } */
  get held() { return this._held; }
  /** held and nothing else guards (no single sign-on): every page, API, door and upgrade is refused — but the sign-in page */
  get shut() { return !!this._held && !this._clerk?.enabled; }
  /** does the held state refuse this upgrade path? every one but a paired machine's dial-in (its own dial token) */
  upgradeHeld(pathname) { return this.shut && !OWN_RULE_UPGRADES.has(pathname); }
  /** THE BOOT'S SIGN-IN LINE (server.js prints it): true in every state — while held it says HELD by name, never «a password is
   *  set» (主开发 r1195 4: `passwordEnabled` answers «on» while held, for the gate) → the line, or null with no password */
  bootLine() {
    if (this._held) {
      const cause = heldCause(this._held);   // B-dc3f (1): the hold's own cause (src/signin-table.js) — the file's, as before, for a file that cannot be read
      return this._clerk?.enabled ? `  Password auth: HELD — ${cause} (said above): single sign-on still guards, the password sign-in is refused` : `  Password auth: HELD — ${cause} (said above): every page and API is refused but the sign-in page`;
    }
    return this.passwordEnabled ? '  Password auth: ENABLED' : null;
  }
  /** the upgrade dispatcher's refusal while shut: 503 by name, nothing proxied */
  refuseHeldUpgrade(socket) { try { socket.write(HELD_UPGRADE); } catch { } try { socket.destroy(); } catch { } }

  _save() {
    if (!this._state || this._held) return;   // NOTHING is written over a held file
    if (this._state.tokens) this._state.tokensHashed = 1;   // a reader's note: the keys are sha256 digests
    replaceShredding(this._file, JSON.stringify(this._state));   // 0600, atomic; the replaced bytes overwritten
  }

  /** The login a cookie token names → its record, or null. Looked up by its DIGEST (the map key): the token itself never
   *  meets a comparison — the only compare is the map's, over sha256 digests of what the caller sent, which leaks no prefix
   *  of any stored login (no early exit over a secret: the constant-time property the plaintext keys never had). */
  _login(token) {
    if (!token || !this._state || !this._state.tokens) return null;
    const d = tokenDigest(token);
    return Object.prototype.hasOwnProperty.call(this._state.tokens, d) ? this._state.tokens[d] : null;
  }
  /** alive = inside the cap (180 days from the sign-in) AND the slide (30 days from the last use) */
  static loginAlive(rec, now = Date.now()) { return loginAlive(rec, now); }   // the table's shared law (src/signin-table.js)
  /** The cookie's Max-Age for a login: the slide, never past the cap. */
  static cookieMaxAge(rec, now = Date.now()) { return cookieMaxAge(rec, now); }

  /** A configured password specifically (Clerk SSO alone also enables auth). */
  get passwordEnabled() { return !!this._held || !!(this._state && this._state.passwordHash); }   // held: «on» — a held file never reads as «off»

  get enabled() { return this.passwordEnabled || !!this._clerk?.enabled; }

  /** SSO (Clerk) specifically — login is handled by the IdP; a local password
   *  is redundant and is skipped in onboarding / ignored on config import. */
  get ssoEnabled() { return !!this._clerk?.enabled; }

  _hash(password, salt) {
    return hashSync(password, salt);   // the table's shared law: scrypt, 32 bytes (src/signin-table.js)
  }

  /**
   * Set (or replace) the password. Existing login tokens stay valid (in-app
   * changes go through the /api/auth/set-password route, which revokes them).
   * userSet marks a password configured from INSIDE the app — boot-time env
   * resolution never overrides a user-set state (incl. user-removed).
   */
  setPassword(password, { userSet = false } = {}) {
    if (this._held) throw heldError(this._held);
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = this._hash(password, salt);
    this._state = { passwordHash, salt, userSet: userSet || this._state?.userSet || false, tokens: this._state?.tokens || {} };
    this._save();
    this._syncWitness();   // B-dc3f (1): the witness, after the sign-in file is on disk
    this._netWitness();   // H1: the network home's copy, off the loop
  }

  /** Disable auth entirely (user choice — env won't re-enable on next boot). */
  removePassword() {
    if (this._held) throw heldError(this._held);
    if (this._declaredNow()) throw Object.assign(new Error(`${SW.DECLARE_ENV}=required is set for this VibeSpace: its sign-in cannot be turned off here — remove that setting and restart first`), { code: 'signin-required' });
    this._state = { userSet: true, tokens: {} };
    this._save();
    this._syncWitness();   // B-dc3f (1): the sign-in turned off — the witness removed
    this._netWitness();   // H1: the network home's copy, off the loop
  }

  /** Revoke every login token except (optionally) one — in-app password change kicks all other devices; a vault LOCK
   *  revokes them all (lane vault-e2e-password-fix-r2 — the hub's wiring). → how many logins ended. */
  revokeAllTokens(exceptToken = null) {
    if (!this._state || this.shut) return 0;   // held under single sign-on: its in-memory logins are revoked (a vault lock still signs everyone out)
    const d = exceptToken ? tokenDigest(exceptToken) : null;
    const keep = d && this._state.tokens ? this._state.tokens[d] : null;
    const n = Object.keys(this._state.tokens || {}).length - (keep ? 1 : 0);
    this._state.tokens = keep ? { [d]: keep } : {};
    this._save();
    return n;
  }

  /** Export the password record for config transfer (hash + salt, never tokens). */
  exportPasswordRecord() {
    if (this._held || !this.passwordEnabled) return null;
    return { passwordHash: this._state.passwordHash, salt: this._state.salt };
  }

  /** Import a password record (config transfer). Revokes all tokens — caller should issue a fresh one. */
  importPasswordRecord(rec) {
    if (this._held) throw heldError(this._held);
    if (!rec?.passwordHash || !rec?.salt) throw new Error('invalid password record');
    this._state = { passwordHash: String(rec.passwordHash), salt: String(rec.salt), userSet: true, tokens: {} };
    this._save();
    this._syncWitness();   // B-dc3f (1): an imported record is THIS folder's sign-in now (its own id — the export never carries one)
    this._netWitness();   // H1: the network home's copy, off the loop
  }

  /**
   * Boot-time resolution:
   * - user-set state (configured in-app, incl. explicit removal) → ALWAYS kept;
   *   env vars never override it.
   * - VIBESPACE_PASSWORD env → (re)set if it doesn't match the stored hash.
   * - else stored auth.json → keep.
   * - else if generateIfMissing (container first boot) → random password,
   *   returned so the caller can print it prominently.
   * Returns { generated?: string } — the plaintext ONLY when freshly generated.
   */
  ensurePassword(opts = {}) {
    if (this._net && !this._net.done) { this._netEnsure = opts; return {}; }   // H1: the boot's password road waits for the home's answer
    const r = this._ensurePassword(opts);
    // B-dc3f (1): THE DECLARATION (opt-in, set nowhere by default) — required, and no password and no single sign-on ⇒ held
    if (!this._held && this._declaredNow() && !(this._state && this._state.passwordHash) && !this._clerk?.enabled) this._hold(`${SW.DECLARE_ENV}=required is set and no password is set`, 'declared');
    return r;
  }
  _ensurePassword({ generateIfMissing = false } = {}) {
    if (this._held) return {};   // held: neither the env nor a generated password is written over the file
    // B-dc3f (1), 主开发 r2152 (d): the sign-in turned OFF from the page earlier stays off — but NOT under the declaration
    // (VIBESPACE_SIGNIN=required) with no password: there the env password (or a generated one) applies, so the held words'
    // act («set VIBESPACE_PASSWORD and restart») leaves the hold; the page's «off» gives way, and the env password is the env's
    const declaredNoPw = this._declaredNow() && !(this._state && this._state.passwordHash);
    if (this._state?.userSet && !declaredNoPw) return {};
    const envPw = process.env.VIBESPACE_PASSWORD;
    if (declaredNoPw && this._state && this._state.userSet && (envPw || generateIfMissing)) this._state.userSet = false;
    if (envPw) {
      if (!this.passwordEnabled || this._hash(envPw, this._state.salt) !== this._state.passwordHash) {
        this.setPassword(envPw);
      }
      return {};
    }
    if (this.passwordEnabled) return {};
    if (generateIfMissing) {
      const pw = crypto.randomBytes(9).toString('base64url'); // 12 chars, url-safe
      this.setPassword(pw);
      return { generated: pw };
    }
    return {};
  }

  verifyPassword(password) {
    if (this._held || !this.passwordEnabled) return false;
    return hashMatches(this._hash(password, this._state.salt), this._state.passwordHash);   // constant time (src/signin-table.js)
  }

  issueToken(ua = '') {
    if (this.shut) throw heldError(this._held);   // held under single sign-on: the login lives in memory only (_save writes nothing)
    const token = crypto.randomBytes(24).toString('hex');
    const now = Date.now();
    // Clerk-only instances may have no auth.json yet — tokens still persist
    this._state = this._state || { tokens: {} };
    this._state.tokens = this._state.tokens || {};
    this._state.tokens = addLogin(this._state.tokens, tokenDigest(token), ua, now);   // the DIGEST — never the token; the dead evicted, the total capped (src/signin-table.js)
    this._save();
    return token;
  }

  /** A use of a login: alive ⇒ it SLIDES (in memory now; on disk at most once an hour) → true. */
  checkToken(token) {
    if (this.shut) return false;   // held, nothing else guarding: no login is valid (under single sign-on: its in-memory logins)
    if (!this.enabled) return true;
    const rec = this._login(token);
    const now = Date.now();
    if (!Auth.loginAlive(rec, now)) return false;
    const was = Number(rec.usedAt || rec.createdAt) || 0;
    rec.usedAt = now;
    if (now - was >= TOKEN_SLIDE_SAVE_MS) { (this._slid || (this._slid = new Set())).add(tokenDigest(token)); try { this._save(); } catch { /* the in-memory slide holds; the next use saves */ } }
    return true;
  }

  /** The cookie follows the slide: a use that moved `usedAt` on disk re-sets the cookie's Max-Age (30 days, never past
   *  the cap) — a login used every day never expires in the browser before the cap. */
  _slideCookie(req, res, token) {
    const rec = this._login(token), d = token ? tokenDigest(token) : null;
    if (!rec || !this._slid || !this._slid.delete(d) || !res || typeof res.append !== 'function') return;
    res.append('Set-Cookie', loginCookie(token, Auth.cookieMaxAge(rec), req.headers));
  }

  revokeToken(token) {
    if (this.shut) return;
    const d = token ? tokenDigest(token) : null;
    if (d && this._state?.tokens?.[d]) { delete this._state.tokens[d]; this._save(); }
  }

  // ── Rate limiting ──
  _rateCheck(ip) { return rateCheck(this._attempts, ip, Date.now()); }   // the table's shared law: 5 fails lock an address a minute
  _rateFail(ip) { rateFail(this._attempts, ip, Date.now()); }
  _rateOk(ip) { this._attempts.delete(ip); }

  // ── HTTP integration ──

  /** lane device-act-audit: WHO a cookie request is, for an audit line — 12 hex of the sign-in cookie's sha256 (never the
   *  cookie itself; one sign-in = one handle), or null without one. The ONE cookie reader stays this file (test-auth). */
  static signInHandle(req) { const t = Auth.cookieToken(req); return t ? tokenDigest(t).slice(0, 12) : null; }   // int317: the ONE hash door — the first 12 hex of auth.json's key for this login (no secret)

  static cookieToken(req) { return cookieTokenOf(req.headers.cookie); }   // the table's shared reader (src/signin-table.js)

  /** THE SAME-ORIGIN RULE for this request (src/write-origin.js): a write or a WebSocket handshake that rides the
   *  cookie must come from this instance's own page — its own origin as the reverse proxies forward it */
  originVerdict(req) {
    return crossSiteVerdict({ method: req.method, headers: req.headers || {} }, ownOriginOf(req.headers, { encrypted: !!(req.socket && req.socket.encrypted) }));
  }

  /** ONE log line per refusal — at most 5 a minute, the rest counted (a hostile page can repeat itself) */
  _logCrossSite(req, v) {
    const now = Date.now(), w = this._xsLog || (this._xsLog = { at: 0, n: 0, muted: 0 });
    if (now - w.at > 60e3) { if (w.muted) console.warn(`[auth] ${w.muted} more cross-site refusals in the last minute (not logged one by one)`); w.at = now; w.n = 0; w.muted = 0; }
    if (++w.n > 5) { w.muted++; return; }
    const route = String(req.path || req.url || '').split('?')[0].split('/').slice(0, 4).join('/') || '/'; // first 3 segments — paths can carry user data
    console.warn(`[auth] refused a cross-site ${req.headers && req.headers.upgrade ? 'WebSocket' : String(req.method)} ${route} — ${v.why}, origin ${JSON.stringify(String(v.origin || '-').slice(0, 120))} (own ${v.own || '-'})`);
  }

  /** true when this request carries a valid token (or auth is disabled) — and, a write or a WebSocket handshake, came
   *  from this instance's own page: every caller (the upgrade dispatcher's /ws and /proxy/, the desktop and browser
   *  streams, private /svc mounts, private /p pages) inherits the same-origin rule */
  requestAuthed(req) {
    if (this.shut) return false;   // held, nothing else guarding: every upgrade and private page that asks is refused
    const v = this.originVerdict(req);
    if (!v.ok) { this._logCrossSite(req, v); return false; }
    if (!this.enabled) return true;
    return this.checkToken(Auth.cookieToken(req));
  }

  /** Express middleware guarding everything except the login flow — server.js mounts it BEFORE every router */
  middleware() {
    return (req, res, next) => {
      const p = req.path;
      if (this._held) {   // HELD (B-dc3f): before every door and route — each path judged as the router matches it (routeKey)
        // nothing else guards: nothing is open — but THE SIGN-IN PAGE answers as a page (200, the held words: a health check asks it)
        if (this.shut) return refuseHeld(this._held, req, res, { page: (req.method === 'GET' || req.method === 'HEAD') && routeKey(p) === '/login' });
        if (LOCAL_ROAD.has(routeKey(p))) return refuseHeld(this._held, req, res, { sso: true });   // single sign-on still guards: the local password road stays refused
      }
      // ── A PATH WITH A DOT SEGMENT IS NEVER A DOOR (lane lg-remote-hardening, B-7f0b r1317): the public files' handler runs
      // after this gate and resolves one away — /dav/../index.html, its escaped spellings, rode a door's prefix past the sign-in
      // check to the app's own files. A browser never sends one; refused by name before anything (src/path-dot-segment.js).
      // Judged on the WHOLE request line on purpose (originalUrl): a copy of this gate under a mounted router keeps judging what
      // the files' handler and the routes will read, never a path cut at its mount point ──
      if (PD.dotSegment(req.originalUrl || req.url)) { const r = PD.refusal(); return res.status(r.status).json(r.body); }
      // THE DOOR CLASS (src/door.js — the lines that stood here, lifted verbatim): a door, a cross-site refusal, the open
      // instance, the login flow — or a page, which the owner's cookie decides below
      const d = doorClassOf({ method: req.method, path: req.path, headers: req.headers, encrypted: !!(req.socket && req.socket.encrypted) }, { enabled: this.enabled });
      if (d.kind === 'refused') { this._logCrossSite(req, d.verdict); return res.status(403).json({ error: 'cross-site', origin: d.verdict.origin, own: d.verdict.own }); }
      if (PASSES.has(d.kind)) return next();   // a door, the open instance, the login flow
      if (d.kind !== 'page') { console.warn(`[auth] refused a request of a door class nobody named («${String(d.kind).slice(0, 40)}») — the gate fails closed`); return res.status(500).json({ error: 'unclassed', kind: String(d.kind).slice(0, 40) }); }
      { const tok = Auth.cookieToken(req); if (this.checkToken(tok)) { this._slideCookie(req, res, tok); return next(); } }
      // Browsers navigating to pages get the login form; API calls get 401
      const wantsHtml = req.method === 'GET' && (req.headers.accept || '').includes('text/html');
      if (wantsHtml) return res.redirect('/login');
      res.status(401).json({ error: 'unauthorized' });
    };
  }

  /** Issue a login token + set the cookie (shared by password + Clerk login). */
  _grantSession(req, res) {
    const token = this.issueToken(req.headers['user-agent']);
    // Secure only behind an https INGRESS (no http door to that host): the hub's own https (src/server/tls.js) shares ONE
    // port + host with http, and a Secure cookie set over it would lock the http origin out (Chrome: an insecure origin
    // never reads or overwrites a Secure cookie) — lane https-tailscale, cookies as before (req.secure was never true)
    res.setHeader('Set-Cookie', loginCookie(token, Math.floor(TOKEN_IDLE_MS / 1000), req.headers));   // the slide's 30 days (each use re-sets it)
    return token;
  }

  /** Register /login + /api/login + /api/clerk-login + /api/logout on the app */
  registerRoutes(app) {
    app.get('/login', (req, res) => {
      if (!this.enabled || this.requestAuthed(req)) return res.redirect('/');
      // lane app-page-csp: the sign-in page reports too — its one inline script carries this response's nonce
      const nonce = crypto.randomBytes(16).toString('base64');
      res.set(appCsp.HEADER, appCsp.loginPolicy({ nonce, clerkHost: this._clerk?.enabled ? this._clerk.frontendApi : '' }));
      res.type('html').send(loginHtml({ clerk: this._clerk, passwordEnabled: this._held ? false : this.passwordEnabled, held: this._held, nonce, lang: landingLang(req.headers['accept-language']) }));   // held under single sign-on: SSO only, the held words
    });

    // Clerk SSO exchange: the login page verified the user on Clerk's hosted
    // UI and posts the session JWT here. Verify signature/exp/iss vs Clerk's
    // JWKS, gate on the email allowlist, then issue OUR cookie token — from
    // here on the session is indistinguishable from a password login.
    app.post('/api/clerk-login', express_json_lite, async (req, res) => {
      if (!this._clerk?.enabled) return res.status(404).json({ error: 'SSO not configured' });
      const ip = req.socket.remoteAddress || '?';
      if (!this._rateCheck(ip)) return res.status(429).json({ error: 'Too many attempts — wait a minute', code: 'too-many' });
      try {
        const { email } = await this._clerk.verifyToken(String(req.body?.token || ''));
        if (!email) {
          return res.status(403).json({ error: 'Token has no email claim — add {"email": "{{user.primary_email_address}}"} to the Clerk session token custom claims (or a "vibespace" JWT template)' });
        }
        if (!this._clerk.emailAllowed(email)) {
          this._rateFail(ip);
          return res.status(403).json({ error: `${email} is not allowed on this instance` });
        }
        this._rateOk(ip);
        this._grantSession(req, res);
        res.json({ success: true, email });
      } catch (e) {
        this._rateFail(ip);
        res.status(401).json({ error: `SSO verification failed: ${e.message}` });
      }
    });

    app.post('/api/login', express_json_lite, (req, res) => {
      if (!this.enabled) return res.json({ success: true });
      const ip = req.socket.remoteAddress || '?';
      if (!this._rateCheck(ip)) return res.status(429).json({ error: 'Too many attempts — wait a minute', code: 'too-many' });
      const pw = String(req.body?.password ?? '');
      if (!this.verifyPassword(pw)) {
        this._rateFail(ip);
        return res.status(401).json({ error: 'Wrong password', code: 'wrong-password' });
      }
      this._rateOk(ip);
      this._grantSession(req, res);
      res.json({ success: true });
    });

    app.post('/api/logout', (req, res) => {
      const token = Auth.cookieToken(req);
      if (token) this.revokeToken(token);
      res.setHeader('Set-Cookie', CLEAR_COOKIE);
      res.json({ success: true });
    });

    // In-app password management. A configured password must be presented
    // again (defense against an unlocked screen); an SSO-only instance needs a
    // signed-in request (the route's own check — see below). When auth is
    // disabled, setting a password is open — that's how a local instance opts
    // INTO auth.
    // Changing/setting revokes every other device's token (that's usually the
    // point); the caller gets a fresh token so they stay logged in.
    app.post('/api/auth/set-password', express_json_lite, (req, res) => {
      // WHO MAY SET A PASSWORD is judged HERE too, by the instance's state — server.js registered these routes BEFORE
      // the cookie gate until .274 (lane owner-write-origin: on a Clerk-only instance an anonymous POST set a password,
      // revoked every token and handed the caller a session); the route never leans on a mount order again:
      //   a password configured ⇒ the current password (below) · SSO and no password ⇒ a signed-in request only ·
      //   neither ⇒ open — that is how a local instance opts INTO auth (first-run onboarding)
      if (this.enabled && !this.passwordEnabled && !this.requestAuthed(req)) return res.status(401).json({ error: 'unauthorized' });
      const ip = req.socket.remoteAddress || '?';
      if (!this._rateCheck(ip)) return res.status(429).json({ error: 'Too many attempts — wait a minute', code: 'too-many' });
      const { current, newPassword, remove } = req.body || {};
      // Gate on the PASSWORD being set (not this.enabled): a Clerk-only
      // instance has no current password — its cookie-authed user may set one.
      if (this.passwordEnabled) {
        if (!this.verifyPassword(String(current ?? ''))) {
          this._rateFail(ip);
          return res.status(401).json({ error: 'Current password is wrong' });
        }
        this._rateOk(ip);
      }
      if (remove) {
        if (!this.passwordEnabled) return res.json({ success: true, enabled: this.enabled });
        if (this._declaredNow()) return res.status(409).json({ error: 'signin-required', why: `${SW.DECLARE_ENV}=required is set for this VibeSpace: its sign-in cannot be turned off here — remove that setting and restart first` });   // B-dc3f (1)
        this.removePassword();
        res.setHeader('Set-Cookie', CLEAR_COOKIE);
        return res.json({ success: true, enabled: this.enabled }); // Clerk may keep auth on
      }
      const pw = String(newPassword ?? '');
      if (pw.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
      this.setPassword(pw, { userSet: true });
      this.revokeAllTokens();
      const token = this.issueToken(req.headers['user-agent']);
      res.setHeader('Set-Cookie', loginCookie(token, Math.floor(TOKEN_IDLE_MS / 1000), req.headers)); // Secure behind an https ingress only — the hub's own https shares the host with http (above)
      res.json({ success: true, enabled: true });
    });
  }
}

// Minimal body parser for the login route only (registered before express.json)
function express_json_lite(req, res, next) {
  if (req.body !== undefined) return next();
  let data = '';
  req.on('data', (c) => { data += c; if (data.length > 4096) req.destroy(); });
  req.on('end', () => {
    try { req.body = JSON.parse(data || '{}'); } catch { req.body = {}; }
    next();
  });
}

module.exports = { Auth, TOKEN_COOKIE, TOKEN_TTL_MS, TOKEN_IDLE_MS, TOKEN_SLIDE_SAVE_MS, tokenDigest };
