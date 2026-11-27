'use strict';
// THE INTERFACE AS ITS OWN PROCESS (the separation, M1 — lane B, piece B2b; lane readings' contract v1,
// /var/tmp/vibespace-lanes/scf/cs/contract-A.md §2). The supervisor starts it with ONE inherited pipe that it NAMES in the
// child's environment — VIBESPACE_START_FD=<n> (src/start-pipe.js, the reader the hub shares; 主开发 00:02Z, law 1 amended) — and writes, in newline JSON:
//   {op:'start', party:'interface', secret, link, signin}   — first: `link` is the unix socket the parties join (this process
//                                                     listens); `signin` the sign-in table this process holds (piece B3b-1,
//                                                     the contract's dated line of 2026-11-21): { file, clerk?, password?, generate? }
//   {op:'admit', party, digest}                     — before that party starts; a later admit for the name REPLACES the
//                                                     earlier, so the previous generation's secret is refused
// END OF FILE on the start pipe = the supervisor is gone: this process closes everything and exits (law 1 of the supervisor).
// THE START PIPE'S VALUES TRAVEL ONLY ON THE START PIPE AND IN MEMORY (主开发 21:43Z): never argv, never the environment, never a log
// line, never an error text — this file prints the party's NAME and the link's path, nothing of a secret or a digest.
// WITHOUT THE WORD it reads NO descriptor and ends by name (exit 2: it runs only under its supervisor). WITH IT, every bad
// start ends by name in bounded time (exit 2, the hub's code for a bad start too): the word names no pipe / no line inside START_LINE_MS / the pipe ended first /
// the first line is no interface start.
// The hub's port: PORT / HOST with the hub's own defaults, `listenAt` — server.js's `process.env.PORT || 3456` and
// `process.env.HOST || '0.0.0.0'` (one owner of the port: the interface, in the piped form, holds the port the hub would).
// THE LAST RESORT: an uncaught error is said once (its name and message — never a start line) and the process exits 1;
// the supervisor starts the next one, and pages reconnect.
// THE LINK'S FOLDER IS THIS ACCOUNT'S ALONE (主开发 r1124 2; the contract's dated line): who may listen at the link's path
// is whoever may write its folder, so the interface starts only on a folder this account owns that no other account can
// write (no group or other write bit) — any other is a bad start, said by name (exit 2), before the path is touched.
// THE SIGN-IN TABLE IS NAMED, NEVER GUESSED (piece B3b-1, 主开发 r1060 + r1517 (A)): `signin.file` is REQUIRED — an absolute path
// whose folder is this account's alone (the link's rule: whoever may write the folder may put another table in its place); a start
// line without it, or with a relative path or a foreign folder, is a bad start by name (exit 2): an interface with no table would
// stamp no login and its hub would refuse every page. A missing FILE is a new instance (sign-in off), as in the plain form — unless the
// named data folder's verdict holds it (B-dc3f (1), 主开发 r3433: `folder`, `root`, `home`, `uid`, `throwaway`, `declared`, ADDITIVE — the
// plain form's src/signin-witness.js, one implementation; a line without them keeps this reading, said once); a file
// that cannot be read HOLDS the instance (B-dc3f). `clerk` = { publishableKey, allowedEmails } — no secret, and no environment is
// read for it; `password` (the supervisor's VIBESPACE_PASSWORD) and `generate` (a container's first start) are the plain form's
// boot resolution (src/auth.js ensurePassword), held in memory only until the table is resolved. A generated password is said
// ONCE in this process's journal, as the plain form's hub says it — the one start value a log line ever holds.
// The table is loaded and resolved BEFORE the port is listened on: no head meets an unloaded table.
// Once it listens it makes no synchronous disk call (scripts/test-interface-process.mjs holds it as a law, with the graph).
const net = require('net');
const path = require('path');
const os = require('os');
const fsp = require('fs').promises;
const { create } = require('./index.js');
const signinTable = require('./signin.js');
const { START_WORD, openStart, firstLine, whyText } = require('../start-pipe.js');

/** where the interface listens: the hub's own defaults (server.js lines `const PORT = process.env.PORT || 3456;` and
 *  `const HOST = process.env.HOST || '0.0.0.0';` — scripts/test-interface-process.mjs ⑥ reads both) */
const listenAt = (env = {}) => ({ port: Number(env.PORT || 3456), host: env.HOST || '0.0.0.0' });

// B-dc3f (主开发 r5504 / r5506): A FOLDER's GROUP WRITE BIT IS ACCEPTED ONLY WHEN THE GROUP IS PROVABLY THIS ACCOUNT's OWN. On a machine
// whose file mask is 002 (the distributions that give every account its own private group) the folders a hub makes are 775: the group
// is the person's own and nobody else can write there. The proof: the folder's group is this process's primary group, the group file
// lists no member in it but this account, and no account but this one names it as its primary in the account file. The two files are
// read ONCE, at this process's start, each bounded in size; a read that fails, a file too large, or a group with no line there (the
// accounts come from elsewhere: LDAP, SSSD) is «cannot be proven», never «private» — the start is refused BY NAME, the command that is
// its door in the words. The OTHER-write bit is refused as before (anyone could). The words name the folder, the group and HOW MANY
// other accounts can write — never their names.
const ACCOUNT_FILES = Object.freeze({ group: '/etc/group', passwd: '/etc/passwd' });
const ACCOUNT_FILE_MAX = 4 << 20;   // a bigger file is no proof (the read is bounded)
let accountsSeam = null;   // a suite's: { gid, read(name) → Promise<string> } — the account files' text handed in
let accountTexts = null;   // the two reads, once a process (a promise; the seam's own when a suite hands one)
async function readBounded(file, max = ACCOUNT_FILE_MAX) {
  const h = await fsp.open(file, 'r');
  let text = null, failed = null;
  try { const buf = Buffer.alloc(max + 1); const { bytesRead } = await h.read(buf, 0, buf.length, 0); if (bytesRead > max) throw Object.assign(new Error('too large to read whole'), { code: 'EFBIG' }); text = buf.toString('utf8', 0, bytesRead); }
  catch (e) { failed = e; }
  await h.close();   // a read handle's failed close REJECTS: the read is then «cannot be proven», as any failed read (never a close under an empty catch)
  if (failed) throw failed;
  return text;
}
function accountFacts() {
  if (!accountTexts) {
    const s = accountsSeam, read = s ? s.read : (name) => readBounded(ACCOUNT_FILES[name]);
    const one = (name) => Promise.resolve().then(() => read(name)).then((text) => ({ text: String(text) }), (e) => ({ why: `${ACCOUNT_FILES[name]} could not be read: ${(e && e.code) || 'error'}` }));
    accountTexts = Promise.all([one('group'), one('passwd')]).then(([group, passwd]) => ({ gid: s ? s.gid : (typeof process.getgid === 'function' ? process.getgid() : null), group, passwd }));
  }
  return accountTexts;
}
/** a suite's seam: the account files' text and this process's primary gid handed in (null: the real files again) */
function _accounts(seam) { accountsSeam = seam || null; accountTexts = null; }
/** the folder's group judged → { own: true } | { name, others } (another account can write) | { unproven } (the proof cannot be made) */
async function groupOf(st, uid) {
  const f = await accountFacts();
  if (f.group.why) return { unproven: f.group.why };
  if (f.passwd.why) return { unproven: f.passwd.why };
  const rows = (text, n) => text.split('\n').filter((l) => l && l[0] !== '#').map((l) => l.split(':')).filter((r) => r.length >= n);
  const g = rows(f.group.text, 4).find((r) => Number(r[2]) === st.gid);
  if (!g) return { unproven: `its group ${st.gid} has no line in ${ACCOUNT_FILES.group} (the accounts come from elsewhere)` };
  const users = rows(f.passwd.text, 4);
  const me = users.find((r) => Number(r[2]) === uid);
  if (!me) return { unproven: `this account (uid ${uid}) has no line in ${ACCOUNT_FILES.passwd}`, name: g[0] };
  const others = new Set();
  for (const m of String(g[3] || '').split(',').map((x) => x.trim()).filter(Boolean)) if (m !== me[0]) others.add(m);
  for (const r of users) if (Number(r[3]) === st.gid && Number(r[2]) !== uid) others.add(r[0]);
  if (others.size) return { name: g[0], others: others.size };
  if (f.gid !== null && st.gid !== f.gid) return { unproven: `its group ${g[0]} is not this account's primary group`, name: g[0] };
  return { own: true };
}
/** a folder judged → null (this account's alone) | the words of why not. `what` names it; `uid` = this process's account. */
async function ownFolderWhy(dir, what, uid = typeof process.getuid === 'function' ? process.getuid() : null) {
  let st; try { st = await fsp.stat(dir); } catch (e) { return `${what} ${dir} cannot be read (${(e && e.code) || 'error'})`; }
  if (!st.isDirectory()) return `${what} ${dir} is no folder`;
  if (uid !== null && st.uid !== uid) return `${what} ${dir} belongs to another account (uid ${st.uid}) — it must be this account's alone`;
  const mode = (st.mode & 0o7777).toString(8);
  if (st.mode & 0o002) return `${what} ${dir} can be written by every account (mode ${mode}) — it must be this account's alone: chmod o-w ${dir}, then start again`;
  if (st.mode & 0o020) {
    const g = uid === null ? { unproven: 'this account has no uid here' } : await groupOf(st, uid);
    if (g.own) return null;   // the account's own private group: nobody else can write there (r5506)
    if (g.others) return `${what} ${dir} can be written by its group ${g.name}, which ${g.others} other account${g.others === 1 ? '' : 's'} belong${g.others === 1 ? 's' : ''} to (mode ${mode}) — it must be this account's alone: chmod g-w ${dir}, then start again`;
    return `${what} ${dir} can be written by its group${g.name ? ` ${g.name}` : ''}, which cannot be proven this account's alone (${g.unproven}) (mode ${mode}) — chmod g-w ${dir}, then start again`;
  }
  return null;
}
/** the link's folder judged → null (this account's alone) | the words of why not. `uid` = this process's account. */
const linkFolderWhy = (link, uid) => ownFolderWhy(path.dirname(path.resolve(link)), "the link's folder", uid);
/** THE WITNESS's PLACES, COMPUTED BY THIS PROCESS (主开发 r3926) exactly as the plain form computes them: the data folder is the one the
 *  table itself lives in, under its install root's REAL path (the plain form's root is server.js's own folder, which node resolves),
 *  its own last segment kept (a data folder that is a link stays one, as the plain form's); the home and the uid are this process's own
 *  (src/signin-witness.js startFactsSync's defaults — the system's word for this account, which honours the HOME the process was
 *  started with, exactly as the plain form: a supervisor that starts it with another HOME moves both forms alike) → { folder, root } | { why } */
async function placesOf(file) {
  const folderRaw = path.dirname(path.resolve(file));
  let root; try { root = await fsp.realpath(path.dirname(folderRaw)); } catch (e) { return { why: `the sign-in table's install folder ${path.dirname(folderRaw)} cannot be read (${(e && e.code) || 'error'})` }; }
  return { folder: path.join(root, path.basename(folderRaw)), root };
}
/** a claimed path in ONE normal form, to be compared: a folder resolved, its parent's real path, its own last segment kept; a root or a
 *  home resolved to its real path (one that cannot be read keeps its resolved text, and so differs) */
async function folderForm(p) { const r = path.resolve(p); try { return path.join(await fsp.realpath(path.dirname(r)), path.basename(r)); } catch { return r; } }
async function realForm(p) { const r = path.resolve(p); try { return await fsp.realpath(r); } catch { return r; } }
/** the start line's sign-in table judged → { why } (the words of why it is no start, piece B3b-1) | { places } (the witness's places
 *  THIS PROCESS computed — null when the line names no folder): the check and the places are ONE computation (主开发 r3969) */
async function judgeSignin(signin, uid) {
  let at = null;   // the places THIS PROCESS computed (folder named), handed on — never computed twice (主开发 r3969)
  if (!signin || typeof signin !== 'object' || Array.isArray(signin)) return { why: 'the start line names no sign-in table (signin.file) — the interface holds the table and never guesses its path' };
  if (typeof signin.file !== 'string' || !signin.file) return { why: 'the start line names no sign-in table (signin.file) — the interface holds the table and never guesses its path' };
  if (!path.isAbsolute(signin.file)) return { why: `the sign-in table's path is not absolute (${JSON.stringify(signin.file.slice(0, 120))})` };
  const c = signin.clerk;
  if (c != null && (typeof c !== 'object' || Array.isArray(c) || typeof c.publishableKey !== 'string' || !(c.allowedEmails == null || typeof c.allowedEmails === 'string' || Array.isArray(c.allowedEmails)))) return { why: 'the start line\'s single sign-on settings are not { publishableKey, allowedEmails }' };
  // B-dc3f (1) (主开发 r3433 Q1): THE NAMED FIELDS of the same verdict — ADDITIVE: a line that names none of them keeps today's reading by name.
  // 主开发 r3788 (round w80b4230f's must): A NAMED VALUE THAT IS NOT THIS PROCESS's OWN IS REFUSED BY NAME (a bad start, exit 2 — the
  // supervisor's fault, said) — never read as a place with no witness; only an ABSENT value is defaulted (to this process's own, as the
  // plain form). The folder is the table's own folder, the root its parent, the home and the uid this process's.
  const WITNESS_FIELDS = ['root', 'home', 'uid', 'throwaway', 'declared'];
  if (signin.folder === undefined) {
    const stray = WITNESS_FIELDS.filter((k) => signin[k] !== undefined);
    if (stray.length) return { why: `the start line names ${stray.map((k) => `signin.${k}`).join(', ')} but no data folder (signin.folder) — a misspelled or lost folder is no start` };
  } else {
    // 主开发 r3926: THE LINE's VALUES ARE CLAIMS, NEVER PLACES — each is checked for its kind, then COMPARED, in one normal form, with
    // what this process computed (placesOf: the table's own folder, its root, this process's home and uid); a claim that differs is a
    // bad start by name. Nothing after this reads the line's folder, root, home or uid: the witness is built from the computed places
    if (typeof signin.folder !== 'string' || !path.isAbsolute(signin.folder)) return { why: `the sign-in table's data folder (signin.folder) is not an absolute path (${JSON.stringify(String(signin.folder).slice(0, 120))})` };
    for (const k of ['root', 'home']) if (signin[k] !== undefined && (typeof signin[k] !== 'string' || !path.isAbsolute(signin[k]))) return { why: `the sign-in table's ${k} (signin.${k}) is not an absolute path` };
    if (signin.uid !== undefined && !Number.isInteger(signin.uid)) return { why: 'the sign-in table\'s uid (signin.uid) is not a whole number' };
    for (const k of ['throwaway', 'declared']) if (signin[k] !== undefined && typeof signin[k] !== 'boolean') return { why: `the sign-in table's ${k} (signin.${k}) is not true or false` };
    at = await placesOf(signin.file);
    if (at.why) return { why: at.why };
    if ((await folderForm(signin.folder)) !== at.folder) return { why: `the sign-in table's data folder (signin.folder) ${signin.folder} is not the folder of its table (${at.folder})` };
    if (signin.root !== undefined && (await realForm(signin.root)) !== at.root) return { why: `the sign-in table's root (signin.root) ${signin.root} is not its data folder's own (${at.root})` };
    if (signin.home !== undefined && (await realForm(signin.home)) !== (await realForm(os.homedir()))) return { why: `the sign-in table's home (signin.home) ${signin.home} is not this account's home (${os.homedir()})` };
    const own = uid !== undefined ? uid : (typeof process.getuid === 'function' ? process.getuid() : null);
    if (signin.uid !== undefined && signin.uid !== own) return { why: `the sign-in table's uid (signin.uid) ${signin.uid} is not this process's own (${own})` };
  }
  const ownWhy = await ownFolderWhy(path.dirname(signin.file), "the sign-in table's folder", uid);
  return ownWhy ? { why: ownWhy } : { places: at };   // 主开发 r3969: the places computed ONCE, handed on to the builder
}
/** the start line's sign-in table judged → null | the words of why it is no start (piece B3b-1) — judgeSignin's words alone */
async function signinWhy(signin, uid) { return (await judgeSignin(signin, uid)).why || null; }
/** B-dc3f (1): THE TABLE's WITNESS FACTS — built from the places THIS PROCESS computed and the line's two MARKS only (主开发 r3926): it takes
 *  no folder, root, home or uid of the line (the home and the uid are the facts' own defaults: this process's) */
const witnessOf = (places, { throwaway, declared } = {}) => ({ folder: places.folder, root: places.root, throwaway: throwaway === true, declared: declared === true });
/** the start line's sign-in fields (judged by signinWhy first) → the table's witness | null (the line names no folder: today's reading, said
 *  once by the table) */
async function witnessFor(signin, handed = null) {
  if (!signin || signin.folder === undefined) return null;
  const at = handed || await placesOf(signin.file);   // the start hands the places its judge computed (主开发 r3969: once); a suite may ask anew
  if (at.why) throw Object.assign(new Error(at.why), { badStart: true });   // never «no witness»: a place that cannot be computed is no start
  return witnessOf(at, signin);
}

/** → { iface, ready: Promise<{ port, link }>, stop() } — `pipe` = a suite's stream handed in AS the start pipe (else the
 *  descriptor VIBESPACE_START_FD names); `exit(code)` ends the process (a suite hands a spy); `startMs` the start line's bound. */
function main({ pipe = null, env = process.env, exit = (c) => process.exit(c), log = console, startMs } = {}) {
  const iface = create({ log });
  let started = null, linkServer = null, stopping = null, buf = '';
  let readyResolve, readyReject;
  const ready = new Promise((res, rej) => { readyResolve = res; readyReject = rej; });
  ready.catch(() => { });
  async function start(line) {
    const folder = await linkFolderWhy(line.link);   // BEFORE the path is touched: another account's folder is never written in
    if (folder) { const e = new Error(folder); e.badStart = true; throw e; }
    const judged = await judgeSignin(line.signin);       // the sign-in table is named, never guessed (piece B3b-1)
    if (judged.why) { const e = new Error(judged.why); e.badStart = true; throw e; }
    const t = signinTable.create({ file: line.signin.file, clerk: line.signin.clerk || null, log, witness: await witnessFor(line.signin, judged.places) });
    await t.load();
    const { generated } = await t.ensure({ password: typeof line.signin.password === 'string' ? line.signin.password : '', generate: line.signin.generate === true });
    line.signin = { file: line.signin.file };   // the boot's password is not kept past its resolution
    if (generated) { try { log.log?.(`[interface] Generated workspace password: ${generated} (persisted in the sign-in table — the supervisor's VIBESPACE_PASSWORD chooses your own)`); } catch { } }
    iface.useSignin(t);
    started = { party: line.party, link: line.link };   // the secret of the interface's own start is not kept: it joins no link
    await fsp.rm(line.link, { force: true });          // a stale socket file of a previous start (before listen: off the loop anyway)
    linkServer = net.createServer((s) => { iface.attachLink(s); });
    await new Promise((res, rej) => { linkServer.once('error', rej); linkServer.listen(line.link, () => { linkServer.removeListener('error', rej); res(); }); });
    linkServer.on('error', (e) => { try { log.error?.(`[interface] the link socket: ${(e && e.code) || 'error'}`); } catch { } });
    const at = listenAt(env), addr = await iface.listen(at.port, at.host);
    try { log.log?.(`[interface] listening on ${addr.address}:${addr.port}; parties join at ${line.link}; the sign-in table ${line.signin.file} (${t.held ? 'HELD' : t.enabled ? 'sign-in on' : 'sign-in off'})`); } catch { }
    readyResolve({ port: addr.port, link: line.link });
  }
  function onLine(text) {
    let m; try { m = JSON.parse(text); } catch { return; }   // a line that is not JSON is no instruction
    if (!m || typeof m !== 'object' || m.op === 'start') return;   // the start is the FIRST line only; a later one is no instruction
    else if (m.op === 'admit') iface.admit(m);
  }
  const lines = (chunk) => { buf += chunk; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (l.trim()) onLine(l); } };
  const ends = (why, code) => { try { log.error?.(`[interface] ${why} — it ends`); } catch { } readyReject(new Error(why)); stop(code); };
  (pipe ? firstLine(pipe, { ms: startMs }) : openStart({ env, ms: startMs })).then((s) => {
    if (s.word === false) return ends(`started without ${START_WORD}: it runs only under its supervisor, who names its start pipe`, 2);
    if (s.pipe) s.pipe.on('error', () => { });   // a read error on a pipe we are leaving is no second, unnamed end
    if (s.why) return ends(whyText(s), 2);
    const m = s.first, input = s.pipe;
    if (!(m && m.op === 'start' && m.party === 'interface' && typeof m.link === 'string')) return ends(whyText({ why: 'no-start' }), 2);   // (its `signin` is judged in start(), by name)
    start(m).catch((e) => { if (e && e.badStart) return ends(e.message, 2); const why = `the interface could not start (${(e && e.code) || 'error'})`; try { log.error?.(`[interface] ${why} — it ends`); } catch { } readyReject(new Error(why)); stop(1); });   // said BY NAME (the link socket or the port refused)
    input.on('data', lines);
    input.on('end', () => stop(0));      // END OF FILE: the supervisor is gone
    input.on('error', () => stop(0));
    if (s.rest) lines(s.rest);
    input.resume();
  });
  function stop(code) {
    if (stopping) return stopping;
    stopping = (async () => {
      try { await iface.close(); } catch { }
      try { linkServer && linkServer.close(); } catch { }
      try { started && await fsp.rm(started.link, { force: true }); } catch { }
      exit(code);
    })();
    return stopping;
  }
  return { iface, ready, stop };
}

if (require.main === module) {
  process.on('uncaughtException', (e) => {   // THE LAST RESORT: said once, then exit 1 (never a start line in the words)
    try { console.error(`[interface] uncaught ${(e && e.name) || 'Error'}: ${(e && e.message) || e}`); } catch { }
    process.exit(1);
  });
  main();
}

module.exports = { main, listenAt, linkFolderWhy, signinWhy, judgeSignin, witnessOf, witnessFor, placesOf, _accounts, _readBounded: readBounded, ACCOUNT_FILES };   // _accounts, _readBounded: a suite's seam and the bounded reader (r5506)
