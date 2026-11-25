'use strict';
// THE SIGN-IN TABLE IN THE INTERFACE (the separation, M1 — lane B, piece B3b-1; 主开发 r1060 «the interface's ONE store», r1517:
// GO with decision (A)). In the PIPED form the interface is the table's ONE reader and writer: the same file as the plain form's
// (data/auth.json — the start line's `signin.file` names it), the same law (src/signin-table.js: the held judgement, a login's
// life, the hash, the cookie, the counters), the same answers on the sign-in road. The piped hub opens no file
// (src/server/piped-auth.js).
//   THE ROAD, ANSWERED HERE: GET/HEAD /login (the page), POST /api/login, /api/clerk-login, /api/logout and
//     /api/auth/set-password — after the door class the hub's gate runs (src/door.js): a cross-site write refused 403, a spelling
//     the router matches that the class does not name (and set-password with sign-in on) needs a live login, else 401 — as the
//     plain form's gate and routes answer them.
//   EVERY OTHER HEAD carries ONE fact on its open line's stamp (decision (A)): `signin: 'off'` (no sign-in), `signin: { alive:
//     <the login's full sha256 digest> }` (its cookie names a live login) or `signin: null` (no live login). The hub's gate decides
//     by it; B3b-2 makes the hub recompute the digest from the cookie it parsed itself (B3b-1 and B3b-2 are picked only together).
//   THE SLIDE: a use of a live login moves its `usedAt` — on disk at most once an hour, and the next page answer for that login
//     carries its cookie again (Max-Age: the slide, never past the cap), as the plain form's gate does. A use = a page-class head
//     or an upgrade from this instance's own page: the two roads on which the plain form's gate checks a cookie (DECLARED: a
//     private /p page or /svc mount, which the plain form's routes check themselves, does not slide a login here).
//   HELD (B-dc3f, the same judgement): shut ⇒ every head refused 503 by name but GET/HEAD /login (200, the held words), every
//     upgrade refused but a paired machine's dial-in; under single sign-on the local password road refused. Nothing written.
//   NO SIGN-IN WORK ON THE LOOP (law 8): scrypt async, at most SCRYPT_MAX in flight (one more refused by name: 503
//     «signin-busy»); ONE writer — one write in flight, the newest table coalesced behind it (src/secret-file.js
//     replaceShreddingAsync: the temp synced, then renamed); Clerk's key set fetched async (8 s), the last good set kept, none ⇒
//     the SSO sign-in fails closed by name.
//   IN MEMORY ONLY, DECLARED: the wrong-password counters (an interface restart resets them) and, while held under single sign-on,
//     its logins (as the plain form).
const fsp = require('fs').promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const T = require('../signin-table.js');
const { loginHtml } = require('../login-page.js');
const appCsp = require('../app-csp.js');
const { landingLang } = require('../landing-lang.js');
const { doorClassOf } = require('../door.js');
const { crossSiteVerdict, ownOriginOf } = require('../write-origin.js');
const { replaceShreddingAsync } = require('../secret-file.js');
const { ClerkAuth } = require('../clerk-auth.js');
const SW = require('../signin-witness.js');   // B-dc3f (1) (主开发 r2341 / r3433): the plain form's verdict and writer — ONE implementation

const SCRYPT_MAX = 4;     // hashes in flight at once; one more is refused by name (never queued on the loop's work)
const BODY_MAX = 4096;    // a sign-in body over this is dropped with its connection (the plain form's express_json_lite)
/** THE ROAD: its routes as the plain form registers them (express: GET answers HEAD too) */
const ROAD = Object.freeze({ '/login': ['GET', 'HEAD'], '/api/login': ['POST'], '/api/clerk-login': ['POST'], '/api/logout': ['POST'], '/api/auth/set-password': ['POST'] });
const JSON_TYPE = 'application/json; charset=utf-8';
const pathOf = (url) => String(url || '/').split('?')[0];
const busyError = () => Object.assign(new Error('too many sign-ins at once'), { code: 'signin-busy' });
const heldError = (held) => Object.assign(new Error(`the sign-in file is held (${held.why}) — nothing is written over it`), { code: 'signin-held' });

/** → the table: { load(), ensure(opts), road(req, res, facts) → answered?, head(req, facts, { upgrade }) → { fact, lines },
 *  upgradeRefused(req), refuseUpgrade(socket), revokeAll(why) → n, stateLine(), onChange(fn), flushed(), stats() }
 *  `file` absolute (main.js judged it); `clerk` = { publishableKey, allowedEmails } or null (no environment is read);
 *  `clerkAuth` a suite's stand-in; `now` the clock; `hashOf` the hash (a suite's slow one holds hashes in flight) */
function create({ file, clerk = null, clerkAuth = null, log = console, now = () => Date.now(), hashOf = T.hash, witness = null } = {}) {
  const ck = clerkAuth || (clerk ? new ClerkAuth({ publishableKey: String(clerk.publishableKey || ''), allowedEmails: Array.isArray(clerk.allowedEmails) ? clerk.allowedEmails.join(',') : String(clerk.allowedEmails || ''), keepLastGood: true }) : null);
  let state = null, held = null, scrypts = 0;
  let epoch = 0;   // the follow (law 1): the highest vault-lock order applied — every live login's stamp carries it
  const tries = new Map();   // the follow (a should): an address's guesses IN FLIGHT, counted with its fails before a hash starts
  const attempts = new Map(), slid = new Set(), listeners = new Set();
  const said = { writes: 0, writeFails: 0, lastWriteError: null, busy: 0, crossSite: 0 };
  const sso = () => !!(ck && ck.enabled);
  const passwordEnabled = () => !!held || !!(state && state.passwordHash);   // held: «on» — a held file never reads as «off»
  const enabled = () => passwordEnabled() || sso();
  const shut = () => !!held && !sso();
  const changed = () => { const line = stateLine(); for (const fn of listeners) { try { fn(line); } catch { } } };
  function stateLine() { return { op: 'signin-state', enabled: enabled(), password: passwordEnabled(), sso: sso(), held: held ? held.why : null }; }

  // ── THE ONE WRITER: one write in flight, the newest table coalesced behind it ──
  let writing = null, batch = null;
  /** → a promise of THIS table's landing (true), or false at once when nothing may be written (no table, or held) */
  function save() {
    if (!state || held) return Promise.resolve(false);   // NOTHING is written over a held file
    if (state.tokens) state.tokensHashed = 1;            // a reader's note: the keys are sha256 digests
    const text = JSON.stringify(state);
    if (!batch) { batch = { text }; batch.done = new Promise((res, rej) => { batch.res = res; batch.rej = rej; }); batch.done.catch((e) => e); }
    else batch.text = text;
    const done = batch.done;
    if (!writing) writing = drain();
    return done;
  }
  async function drain() {
    while (batch) {
      const b = batch; batch = null;
      try { await replaceShreddingAsync(file, b.text); said.writes++; b.res(true); }
      catch (e) {
        said.writeFails++;
        const code = (e && e.code) || 'error';
        if (code !== said.lastWriteError) { try { log.error?.(`[interface] the sign-in table could not be written (${code})${e && e.landed ? ' — the new table landed; a close failed' : ' — the table in memory holds, the next change writes it again'}`); } catch { } }
        said.lastWriteError = code;
        if (e && e.landed) b.res(true); else b.rej(e);
      }
    }
    writing = null;
  }

  // ── THE LOAD, judged by the shared law (B-dc3f's shapes and words) ──
  function hold(why, kind = 'file', verdict = null) {
    state = sso() ? { tokens: {} } : null;   // single sign-on still guards: its logins in MEMORY only (save writes nothing while held)
    held = T.heldOf({ why, kind, verdict, dataDir: witness ? witness.folder : '' });   // B-dc3f (1): a folder kind carries its act's files
    try { log.error?.(`[interface] ${T.heldJournal(file, why, sso(), held)}`); } catch { }   // said ONCE, here, at the start
  }
  // ── B-dc3f (1), THE PIPED FORM (主开发 r2341 / r3433): THE SAME VERDICT as the plain form. The start line NAMES the data folder, the
  // install root, the home, the uid, throwaway and declared (`witness`, main.js judged it): the start's facts are read ONCE, BEFORE the
  // interface listens (src/signin-witness.js startFactsSync); every write after is OFF THE LOOP (the async writer). A line that names
  // none of it keeps today's reading BY NAME (an older supervisor), said once. A home on a network mount: its copy is NOT read here (a
  // limit, named in the kb, until a supervisor exists — the plain form's worker pool is its own unit)
  const saidOnce = new Set();
  const sayOnce = (k, line) => { if (saidOnce.has(k)) return; saidOnce.add(k); try { log.warn?.(`[interface] ${line}`); } catch { } };
  let facts = null, lastWitness = Promise.resolve();
  function factsNow() {
    if (!witness) { sayOnce('no-folder', 'the start line names no data folder (signin.folder): the sign-in table is read as before — a missing table is a new instance (an older supervisor)'); return null; }
    if (facts) return facts;
    // 主开发 r3926: the folder and the root are the ones main.js COMPUTED (placesOf), the home and the uid the facts' own defaults (this
    // process's); `scratch` is a suite's scratch home / var-tmp rung, set by no start line (main.js witnessOf never sets it)
    try { facts = SW.startFactsSync({ ...(witness.scratch || {}), dataDir: witness.folder, root: witness.root, env: {}, throwaway: witness.throwaway ? 'throwaway' : false }); }   // the seam FIRST: it never overrides a computed place or a mark (主开发 r3969)
    catch (e) { sayOnce('facts', `the data folder's sign-in facts could not be read (${(e && e.code) || 'error'}) — the table is read as before`); facts = null; }
    // 主开发 r3788 (the round's shoulds): what the start TOOK is said once — a defaulted home or uid (a short line), and a throwaway start
    if (facts && !witness.throwaway) sayOnce('places', `the sign-in witness is read at this process's own places — the data folder ${facts.dataDir}, the home ${(witness.scratch && witness.scratch.home) || os.homedir()}, the uid ${facts.uid} (a folder, root, home or uid the start line names is compared, never used)`);
    if (facts && witness.throwaway) sayOnce('throwaway', 'a throwaway start (signin.throwaway): no sign-in witness is read or written — a lost or replaced table opens as a new instance');
    if (facts && facts.netHome) sayOnce('net-home', `the home folder ${facts.netHome} is a network mount: the piped form does not read its sign-in witness (a limit) — only the persistent local places`);
    return facts;
  }
  /** the start's writes, OFF THE LOOP, at a start that is not held: the folder's id once (never over a file that is there), then the
   *  witness kept by the one writer's choice (SW.writePlan) */
  async function startWrites() {
    const f = factsNow();
    if (!f) return;
    const startId = f.instance && f.instance.id;
    try { const got = await SW.ensureInstanceAsync(witness.folder, f.instance); if (got) f.instance = got; } catch (e) { sayOnce('instance', `the data folder's id could not be written (${(e && e.code) || 'error'}) — no witness is kept until it is`); }
    if (!f.instance) { sayOnce('id-held', `the data folder's id file ${path.join(witness.folder, SW.INSTANCE_FILE)} is there and could not be read: nothing is written over it, and no witness is kept until it reads`); return; }
    await writeWitnesses({ atStart: true, startId });
  }
  function writeWitnesses({ atStart = false, startId = null } = {}) {
    const f = facts;
    if (!f || !f.instance || held) return lastWitness;
    const plan = SW.writePlan({ set: !!(state && state.passwordHash), place: f.place, file: f.file, found: f.found, atStart, startId });
    if (plan.kept) sayOnce('foreign', `a sign-in witness names another data folder than ${witness.folder} — this start keeps every copy as it is`);
    lastWitness = lastWitness.then(async () => {
      for (const w of plan.write) { try { await SW.writeWitnessAsync({ place: { dir: path.dirname(w) }, file: w, root: f.root, dataDir: f.dataDir, id: f.instance.id, uid: f.uid }); } catch (e) { sayOnce('witness', `the sign-in witness ${w} could not be written (${(e && e.message) || e}) — it is written again at the next start`); } }
      for (const w of plan.remove) { try { await SW.removeWitnessAsync({ file: w }); } catch (e) { sayOnce('witness-rm', `the sign-in witness ${w} could not be removed (${(e && e.code) || 'error'}) — it is removed again at the next start`); } }
      if (plan.write.length) { f.witness = { id: f.instance.id }; f.found = plan.write.map((w) => ({ file: w, doc: { id: f.instance.id } })); }
      else if (plan.remove.length) { f.found = []; f.witness = null; }
    });
    return lastWitness;
  }
  async function load() {
    held = null;
    let text = null, error = null, linkGone = false;
    try { text = await fsp.readFile(file, 'utf-8'); } catch (e) { error = e || Object.assign(new Error('an error'), { code: 'an error' }); }
    if (error && error.code === 'ENOENT') { try { await fsp.lstat(file); linkGone = true; } catch (e) { void e; /* nothing at the path */ } }
    const j = T.judgeRead({ error, text, linkGone });
    // B-dc3f (1): a table that is missing, or says off, asks THE SAME VERDICT as the plain form (SW.verdictOf) — never a second copy of it
    const was = j.held ? null : j.missing ? 'missing' : (j.state && !j.state.passwordHash ? 'off' : null);
    const f = was ? factsNow() : null;
    const v = f ? SW.verdictOf({ auth: was, dataLink: f.dataLink, instance: f.instance, found: f.found, dataDir: witness.folder }) : { hold: null };
    if (j.held) hold(j.held);
    else if (v.hold) hold(v.hold.why, v.hold.kind, v.hold);   // a folder that is not the one its sign-in was set in: held, never a new open instance
    else if (j.missing) state = null;   // truly missing: nothing at the path — a new instance (no witness names another folder)
    else {
      state = j.state;
      const out = T.migrateTokens(state.tokens, now());   // a plaintext token map becomes its digests (once)
      if (out) { state.tokens = out; await save().catch((e) => { try { log.warn?.(`[interface] an older build's plaintext login map could not be re-keyed on disk (${(e && e.code) || 'error'}) — it is re-keyed in memory`); } catch { } }); }
    }
    changed();
    if (!held) { factsNow(); await startWrites(); }   // B-dc3f (1): the id and the witness, BEFORE the interface listens (main.js awaits load)
  }

  // ── THE HASH, bounded ──
  async function scrypt(pw, salt) {
    if (scrypts >= SCRYPT_MAX) { said.busy++; throw busyError(); }
    scrypts++;
    try { return await hashOf(pw, salt); } finally { scrypts--; }
  }
  async function verify(pw) {
    if (held || !passwordEnabled()) return false;
    const want = state.passwordHash;
    return T.hashMatches(await scrypt(pw, state.salt), want);
  }
  async function setPassword(pw, { userSet = false } = {}) {
    if (held) throw heldError(held);
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = await scrypt(pw, salt);
    state = { passwordHash, salt, userSet: userSet || state?.userSet || false, tokens: state?.tokens || {} };
    const w = save(); changed();
    w.then((landed) => { if (landed) writeWitnesses(); }, () => { });   // B-dc3f (1): the witness after the table is ON DISK, off the loop
    return w;
  }
  /** THE BOOT'S RESOLUTION, as the plain form's ensurePassword (src/auth.js): a user-set state is kept; `password` (the
   *  supervisor's VIBESPACE_PASSWORD, on the start pipe only) is set when it does not match; `generate` (a container's first
   *  start) makes one and answers it ONCE, for the journal → { generated? } */
  /** B-dc3f (1): THE DECLARATION (named in the start line, never read from the environment) — its cell is the plain form's own
   *  (SW.declaredCell, 主开发 r3629 must 5: one implementation): the page's «off» gives way to the line's password under it, the hold
   *  after the road, the page's turn-off refused by name — nothing of the rule is written here, only what this table holds now */
  const declared = (extra = {}) => SW.declaredCell({ declared: !!(witness && witness.declared), set: !!(state && state.passwordHash), sso: sso(), ...extra });
  async function ensure(opts = {}) {
    const r = await ensureRoad(opts);
    const d = declared(); if (!held && d.hold) { hold(d.hold.why, d.hold.kind); changed(); }
    return r;
  }
  async function ensureRoad({ password = '', generate = false } = {}) {
    if (held) return {};
    const d = declared({ userSet: !!state?.userSet, offered: !!(password || generate) });
    if (d.keepOff) return {};
    if (d.clearUserSet) state.userSet = false;
    if (password) { if (!passwordEnabled() || T.hashMatches(await scrypt(password, state.salt), state.passwordHash) === false) await setPassword(password); return {}; }
    if (passwordEnabled() || !generate) return {};
    const pw = crypto.randomBytes(9).toString('base64url');
    await setPassword(pw);
    return { generated: pw };
  }
  function issue(ua) {
    if (shut()) throw heldError(held);
    const token = crypto.randomBytes(24).toString('hex');
    state = state || { tokens: {} };
    state.tokens = T.addLogin(state.tokens, T.tokenDigest(token), ua || '', now());
    return { token, written: save() };
  }
  function loginOf(token) {
    if (!token || !state || !state.tokens) return null;
    const d = T.tokenDigest(token);
    return Object.prototype.hasOwnProperty.call(state.tokens, d) ? { d, rec: state.tokens[d] } : null;
  }
  /** a use of the cookie's login → its digest when alive (sliding it when `slide`), else null */
  function use(token, slide) {
    if (shut()) return null;
    const l = loginOf(token), t = now();
    if (!l || !T.loginAlive(l.rec, t)) return null;
    if (slide) {
      const was = Number(l.rec.usedAt || l.rec.createdAt) || 0;
      l.rec.usedAt = t;
      if (t - was >= T.TOKEN_SLIDE_SAVE_MS) { slid.add(l.d); save().catch((e) => e); }   // the in-memory slide holds; a failed write is said by the writer
    }
    return l.d;
  }
  const originOk = (req, secure) => crossSiteVerdict({ method: req.method, headers: req.headers || {} }, ownOriginOf(req.headers || {}, { encrypted: !!secure })).ok;
  /** the plain form's requestAuthed: this instance's own page AND (no sign-in, or a live login) */
  const authed = (req, secure) => !shut() && originOk(req, secure) && (!enabled() || !!use(T.cookieTokenOf(req.headers.cookie), true));
  /** the cookie line a slid login's next page answer carries (once), or [] */
  function slideLines(req, d) {
    if (!d || !slid.delete(d)) return [];
    const token = T.cookieTokenOf(req.headers.cookie), l = loginOf(token);
    return l ? ['Set-Cookie', T.loginCookie(token, T.cookieMaxAge(l.rec, now()), req.headers)] : [];
  }
  /** EVERY OTHER HEAD: the stamp's fact, and the answer's extra lines (the slide's cookie on a page answer) */
  function head(req, facts = {}, { upgrade = false } = {}) {
    if (!enabled()) return { fact: 'off', lines: [] };
    const token = T.cookieTokenOf(req.headers.cookie);
    if (!token) return { fact: null, lines: [] };
    const page = !upgrade && doorClassOf({ method: req.method, path: pathOf(req.url), headers: req.headers, encrypted: !!facts.secure }, { enabled: true }).kind === 'page';
    const d = use(token, page || (upgrade && originOk(req, facts.secure)));
    return { fact: d ? { alive: d, epoch } : null, lines: page ? slideLines(req, d) : [] };
  }
  const upgradeRefused = (req) => shut() && !T.OWN_RULE_UPGRADES.has(pathOf(req.url));
  function refuseUpgrade(socket) { try { socket.end(T.HELD_UPGRADE, () => socket.destroy()); } catch { try { socket.destroy(); } catch { } } }
  /** a vault lock (the hub's order `id`): every login revoked → { n, written } — `written` resolves once the table's save LANDED
   *  (true; false when nothing may be written: held, or no table) and rejects when it failed (law 2: the answer means ON DISK).
   *  From this call on every stamp carries the order's id (law 1). The set-password road calls it with no id. */
  function revokeAll(id) {
    if (Number.isSafeInteger(id) && id > epoch) epoch = id;
    if (!state || shut()) return { n: 0, written: Promise.resolve(false) };
    const n = Object.keys(state.tokens || {}).length;
    state.tokens = {}; slid.clear();
    const written = save(); written.catch((e) => e);
    return { n, written };
  }
  /** the hub's word after a join: the highest order its interface answered on disk (this table's file holds it) */
  function adoptEpoch(id) { if (Number.isSafeInteger(id) && id >= 0) epoch = id; }
  /** a guess's place, taken BEFORE its hash: an address's fails AND its guesses in flight count against RATE_FAILS (the plain
   *  form's hash is synchronous, so it never had two in flight) → the release, or null (answered 429) */
  function reserve(ip) {
    if (!T.rateCheck(attempts, ip, now())) return null;
    const a = attempts.get(ip), inflight = tries.get(ip) || 0;
    if ((a ? a.fails : 0) + inflight >= T.RATE_FAILS) return null;
    tries.set(ip, inflight + 1);
    let done = false;
    return () => { if (done) return; done = true; const k = (tries.get(ip) || 1) - 1; if (k > 0) tries.set(ip, k); else tries.delete(ip); };
  }

  // ── THE ROAD'S ANSWERS ──
  const xs = { at: 0, n: 0, muted: 0 };
  function logCrossSite(req, v) {
    const t = now(); said.crossSite++;
    if (t - xs.at > 60e3) { if (xs.muted) { try { log.warn?.(`[interface] ${xs.muted} more cross-site refusals in the last minute (not logged one by one)`); } catch { } } xs.at = t; xs.n = 0; xs.muted = 0; }
    if (++xs.n > 5) { xs.muted++; return; }
    try { log.warn?.(`[interface] refused a cross-site ${String(req.method)} ${pathOf(req.url).split('/').slice(0, 4).join('/') || '/'} — ${v.why}, origin ${JSON.stringify(String(v.origin || '-').slice(0, 120))} (own ${v.own || '-'})`); } catch { }
  }
  function answer(res, status, body, headers, cookies) {
    if (res.headersSent || res.destroyed || res.writableEnded) return;
    const h = { ...headers, 'Content-Length': String(Buffer.byteLength(body)) }; if (cookies && cookies.length) h['Set-Cookie'] = cookies.slice();
    res.writeHead(status, h); res.end(body);   // framed by its length, as the plain form's express frames it (HEAD: the head alone)
  }
  const json = (res, status, obj, cookies, extra = {}) => answer(res, status, JSON.stringify(obj), { 'Content-Type': JSON_TYPE, ...extra }, cookies);
  /** the plain form's res.redirect (express 4): 302, the Location, its short body by what the page accepts */
  function redirect(req, res, to, cookies) {
    const html = /text\/html/.test(String(req.headers.accept || ''));
    answer(res, 302, html ? `<p>Found. Redirecting to <a href="${T.escHtml(to)}">${T.escHtml(to)}</a></p>` : `Found. Redirecting to ${to}`, { Location: to, Vary: 'Accept', 'Content-Type': html ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8' }, cookies);
  }
  function refuseHeld(req, res, { sso: s = false, page = false } = {}) {
    const lang = landingLang(req.headers['accept-language']), w = T.heldWords(lang, s, held);
    if (page || (req.method === 'GET' && String(req.headers.accept || '').includes('text/html'))) return answer(res, page ? 200 : 503, T.heldPage(held, lang, w), { 'Retry-After': '3600', 'Content-Type': 'text/html; charset=utf-8' });
    return json(res, 503, T.heldJson(held, lang, w), null, { 'Retry-After': '3600' });
  }
  const readBody = (req) => new Promise((resolve) => {
    let data = '', over = false;
    req.setEncoding('utf8');
    req.on('data', (c) => { if (over) return; data += c; if (data.length > BODY_MAX) { over = true; req.destroy(); resolve(undefined); } });
    req.on('end', () => { if (over) return; try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
    req.on('error', () => { if (!over) { over = true; resolve(undefined); } });
  });
  const ipOf = (facts) => facts.addr || '?';
  const IDLE_S = Math.floor(T.TOKEN_IDLE_MS / 1000);
  const writeFailed = (res, e, cookies) => json(res, 500, { error: 'The sign-in table could not be written', code: 'signin-write', detail: String((e && e.code) || 'error') }, cookies);
  const busy = (res, cookies) => json(res, 503, { error: 'Too many sign-ins at once — try again in a moment', code: 'signin-busy' }, cookies, { 'Retry-After': '1' });

  async function handle(key, req, res, facts, cookies) {
    if (key === '/login') {
      req.resume();
      if (!enabled() || authed(req, facts.secure)) return redirect(req, res, '/', cookies);
      const nonce = crypto.randomBytes(16).toString('base64');   // its one inline script carries this answer's nonce (lane app-page-csp)
      return answer(res, 200, loginHtml({ clerk: ck, passwordEnabled: held ? false : passwordEnabled(), held, nonce, lang: landingLang(req.headers['accept-language']) }),
        { [appCsp.HEADER]: appCsp.loginPolicy({ nonce, clerkHost: sso() ? ck.frontendApi : '' }), 'Content-Type': 'text/html; charset=utf-8' }, cookies);
    }
    if (key === '/api/logout') {
      req.resume();
      const token = T.cookieTokenOf(req.headers.cookie), l = shut() ? null : loginOf(token);
      if (l) { delete state.tokens[l.d]; slid.delete(l.d); try { await save(); } catch (e) { return writeFailed(res, e, cookies); } }
      return json(res, 200, { success: true }, [T.CLEAR_COOKIE]);
    }
    const body = await readBody(req);
    if (body === undefined) return;   // over the bound or the page left: its connection is gone (the plain form's)
    const ip = ipOf(facts);
    if (key === '/api/login') {
      if (!enabled()) return json(res, 200, { success: true }, cookies);
      const release = reserve(ip);
      if (!release) return json(res, 429, { error: 'Too many attempts — wait a minute', code: 'too-many' }, cookies);
      let good;
      try { good = await verify(String(body?.password ?? '')); } catch (e) { release(); if (e && e.code === 'signin-busy') return busy(res, cookies); throw e; }
      release();
      if (!good) { T.rateFail(attempts, ip, now()); return json(res, 401, { error: 'Wrong password', code: 'wrong-password' }, cookies); }
      attempts.delete(ip);
      const { token, written } = issue(req.headers['user-agent']);
      try { await written; } catch (e) { return writeFailed(res, e, cookies); }
      return json(res, 200, { success: true }, [T.loginCookie(token, IDLE_S, req.headers)]);
    }
    if (key === '/api/clerk-login') {
      if (!sso()) return json(res, 404, { error: 'SSO not configured' }, cookies);
      const release = reserve(ip);
      if (!release) return json(res, 429, { error: 'Too many attempts — wait a minute', code: 'too-many' }, cookies);
      let email;
      try { ({ email } = await ck.verifyToken(String(body?.token || ''))); }
      catch (e) { release(); T.rateFail(attempts, ip, now()); return json(res, 401, { error: `SSO verification failed: ${e && e.message}` }, cookies); }
      release();
      if (!email) return json(res, 403, { error: 'Token has no email claim — add {"email": "{{user.primary_email_address}}"} to the Clerk session token custom claims (or a "vibespace" JWT template)' }, cookies);
      if (!ck.emailAllowed(email)) { T.rateFail(attempts, ip, now()); return json(res, 403, { error: `${email} is not allowed on this instance` }, cookies); }
      attempts.delete(ip);
      const { token, written } = issue(req.headers['user-agent']);
      try { await written; } catch (e) { return writeFailed(res, e, cookies); }   // the round's should: a failed write is no failed verification (no rateFail, no path in a reply)
      return json(res, 200, { success: true, email }, [T.loginCookie(token, IDLE_S, req.headers)]);
    }
    // /api/auth/set-password — WHO MAY SET A PASSWORD, judged by the instance's state (the plain form's route, src/auth.js)
    if (enabled() && !passwordEnabled() && !authed(req, facts.secure)) return json(res, 401, { error: 'unauthorized' }, cookies);
    const release = reserve(ip);
    if (!release) return json(res, 429, { error: 'Too many attempts — wait a minute', code: 'too-many' }, cookies);
    const { current, newPassword, remove } = body || {};
    try {
      if (passwordEnabled()) {
        let good;
        try { good = await verify(String(current ?? '')); } finally { release(); }
        if (!good) { T.rateFail(attempts, ip, now()); return json(res, 401, { error: 'Current password is wrong' }, cookies); }
        attempts.delete(ip);
      } else release();
      if (remove) {
        if (!passwordEnabled()) return json(res, 200, { success: true, enabled: enabled() }, cookies);
        const off = declared().turnOff; if (off) return json(res, 409, { error: off.code, why: off.why }, cookies);   // the declaration's cell, as the plain form's route
        state = { userSet: true, tokens: {} }; slid.clear();
        const w = save(); changed();
        try { await w; } catch (e) { return writeFailed(res, e, cookies); }
        writeWitnesses();   // the sign-in turned off: its witness removed at once, as the plain form's (off the loop)
        return json(res, 200, { success: true, enabled: enabled() }, [T.CLEAR_COOKIE]);   // single sign-on may keep sign-in on
      }
      const pw = String(newPassword ?? '');
      if (pw.length < 4) return json(res, 400, { error: 'Password must be at least 4 characters' }, cookies);
      try { await setPassword(pw, { userSet: true }); } catch (e) { if (e && e.code === 'signin-busy') throw e; return writeFailed(res, e, cookies); }   // the hash, then its write landed
      revokeAll();
      const { token, written } = issue(req.headers['user-agent']);
      try { await written; } catch (e) { return writeFailed(res, e, cookies); }
      return json(res, 200, { success: true, enabled: true }, [T.loginCookie(token, IDLE_S, req.headers)]);
    } catch (e) { if (e && e.code === 'signin-busy') return busy(res, cookies); throw e; }
  }

  /** ONE head: answered HERE (the held state, the road) → true; or false — the caller relays it with head()'s fact */
  function road(req, res, facts = {}) {
    const p = pathOf(req.url), key = T.routeKey(p);
    if (held) {   // HELD (B-dc3f): before every door and route
      if (shut()) { req.resume(); refuseHeld(req, res, { page: (req.method === 'GET' || req.method === 'HEAD') && key === '/login' }); return true; }
      if (T.LOCAL_ROAD.has(key)) { req.resume(); refuseHeld(req, res, { sso: true }); return true; }
    }
    const methods = ROAD[key];
    if (!methods || !methods.includes(req.method)) return false;
    const d = doorClassOf({ method: req.method, path: p, headers: req.headers, encrypted: !!facts.secure }, { enabled: enabled() });
    if (d.kind === 'refused') { req.resume(); logCrossSite(req, d.verdict); json(res, 403, { error: 'cross-site', origin: d.verdict.origin, own: d.verdict.own }); return true; }
    let cookies = null;
    if (d.kind === 'page') {   // the plain form's gate: a live login, or the login form / 401
      const token = T.cookieTokenOf(req.headers.cookie), dg = use(token, true);
      if (!dg) { req.resume(); if (req.method === 'GET' && String(req.headers.accept || '').includes('text/html')) redirect(req, res, '/login'); else json(res, 401, { error: 'unauthorized' }); return true; }
      cookies = slideLines(req, dg).slice(1);
    }
    handle(key, req, res, facts, cookies).catch((e) => {
      try { log.error?.(`[interface] the sign-in road failed (${(e && e.code) || (e && e.name) || 'error'}) — answered 500 by name`); } catch { }
      json(res, 500, { error: 'The sign-in road failed', code: 'signin-failed' });
    });
    return true;
  }

  return {
    load, ensure, road, head, upgradeRefused, refuseUpgrade, revokeAll, adoptEpoch, stateLine,
    onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    flushed: () => writing || Promise.resolve(),
    witnessed: () => lastWitness,   // B-dc3f (1): the witness's last write, off the loop (a suite awaits it)
    get held() { return held; }, get shut() { return shut(); }, get enabled() { return enabled(); },
    stats: () => ({ ...said, held: held ? held.why : null, enabled: enabled(), scrypts, epoch, logins: Object.keys((state && state.tokens) || {}).length }),
  };
}

module.exports = { create, SCRYPT_MAX, BODY_MAX, ROAD };
