#!/usr/bin/env node
// test-signin-witness-notice — B-dc3f (3) (lane lg-providers, package s1126-2; 主开发 r5117 / r5157): THE NETWORK HOME's REFUSED
// SIGN-IN COPY IS SAID WHERE A PERSON LOOKS. When the sign-in record's copy on the network home folder cannot be written or removed
// (refused, or parked behind two stuck asks of the home), src/auth.js files ONE For-you notice a cause under its own key «signin»
// (a person's page only), its words naming no path, account or sign-in value; it closes by itself when the copy's next write or
// removal lands, or a start with no sign-in READS the home and finds no copy; «waiting» closes when its parked ask is asked; For you
// held unread: each cause's word owed to the read (one wait, its last word kept). The REAL For-you store (src/user-todos.js) and a
// stand-in worker pool whose own counts are every plant's witness (law 1); nine RED controls, each a copy of src/auth.js cut at one
// line. Split out of test-signin-witness (its ⑰) so that suite keeps its fast reading. Scratch folders only: no real sign-in file.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import './scratch.mjs';   // §113 THE ORDER (主开发 r1845 (2)): the first import after node's own
import { scratchDir, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SW = require(path.join(REPO, 'src/signin-witness.js'));
const { Auth } = require(path.join(REPO, 'src/auth.js'));
const MUT = mutantCopies('dc3f-witness-notice', REPO);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof c !== 'boolean') throw new TypeError(`ok() was handed a ${typeof c}: ${n}`); if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${e !== undefined ? `\n      ${typeof e === 'string' ? e : JSON.stringify(e)}` : ''}`); } };
const ROOT = scratchDir('dc3f-witness-notice');
const UID = typeof process.getuid === 'function' ? process.getuid() : null;
const quiet = (fn) => { const e = console.error, w = console.warn, lines = []; console.error = (...a) => lines.push(a.join(' ')); console.warn = (...a) => lines.push(a.join(' ')); try { return { v: fn(), lines }; } finally { console.error = e; console.warn = w; } };
/** one install: <base>/root/data and a stand-in home; `env` the start's own */
function install(name) {
  const base = path.join(ROOT, name), root = path.join(base, 'root'), data = path.join(root, 'data'), home = path.join(base, 'home');
  fs.mkdirSync(data, { recursive: true }); fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  return { base, root, data, home };
}
// law 4: EVERY rung of the ladder is the install's own scratch — the home, the var-tmp rung, no runtime dir (a rung refused falls
// through to the next: a real /var/tmp would be the test machine's own place)
const cfgOf = (it, extra = {}) => ({ home: it.home, uid: UID, env: {}, mountinfo: '', varTmp: path.join(it.base, 'vartmp'), xdgRuntimeDir: '', throwaway: false, ...extra });
const standIn = (mode) => { const calls = []; return { calls, call(op, payload = {}) { calls.push({ op, path: payload.path }); const m = typeof mode === 'function' ? mode(op, payload) : mode; if (m === 'stall') return new Promise(() => { }); if (m && m.error) return Promise.reject(Object.assign(new Error(m.error), { code: m.code })); if (m && m.result) return Promise.resolve(m.result); return Promise.resolve({}); } }; };
const NONE = (op, p) => (op === 'netRead' ? { result: { file: path.join(p.path, 'signin-none.json'), none: true } } : 'ok');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 3000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(10); } return !!(await fn()); };
const nfsOf = (it) => `25 1 0:50 / ${it.home} rw,relatime shared:1 - nfs4 server:/home rw\n`;   // the install's home as a NETWORK mount
const AUTH_SRC = fs.readFileSync(path.join(REPO, 'src/auth.js'), 'utf-8');
const authCut = (from, to, label) => MUT.load('src/auth.js', anchored(AUTH_SRC, from, to, label), `auth-${label}`).Auth;

console.log('① B-dc3f (3) (lane lg-providers, package s1126-2): the network home\'s REFUSED witness write is said in For you — once a cause, no path, no account, no sign-in value');
{
  const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
  const quick = { netBoundMs: 30, netReaskMs: 60, netReaskMaxMs: 1000 };
  // a For-you store: the REAL one (src/user-todos.js) over the install's own data folder; `held` wraps it as held unread until lifted
  // ('later': read at first, held from hold(); `waits` counts the asks of its «when it reads» door)
  const inboxOf = (it, { held = false } = {}) => {
    const real = new UserTodoManager({ dataDir: it.data, onChange: () => { }, expirySweepMs: 0 });
    if (!held) return real;
    let h = held === true; const waits = [];
    return Object.assign(Object.create(real), { isHeldUnread: () => h, whenRead: (fn) => { waits.push(fn); }, waits: () => waits.length, hold: () => { h = true; }, lift: () => { h = false; waits.splice(0).forEach((fn) => fn()); } });
  };
  const openOf = (t) => t.forSession(['signin']).filter((i) => i.status === 'open' && String(i.itemKey || '').startsWith('signin-witness-'));
  // a stand-in pool whose answers the leg switches (law 1: its calls are the witness that the product read the plant), and whose
  // stats() says how many ended asks still hold their threads (the waiting cause's road)
  const poolOf = () => { const s = { write: 'refuse', remove: 'ok', ending: 0, calls: [], read: null };
    const p = standIn((op, pl) => { s.calls.push(op); return op === 'netRead' ? (s.read ? s.read : NONE(op, pl)) : (op === 'netWrite' && s.write === 'refuse') || (op === 'netRemove' && s.remove === 'refuse') ? { error: 'EIO: placed', code: 'EIO' } : 'ok'; });
    return Object.assign(p, { s, stats: () => ({ ending: s.ending }), onWorkerEnded(fn) { s.ended = fn; } }); };
  const startWith = (it, pool, todos, A = Auth) => quiet(() => { const a = new A(it.data, { witness: cfgOf(it, { mountinfo: nfsOf(it), pool, ...quick }), todos: () => todos }); a.ensurePassword({}); return a; }).v;
  const wordsClean = (it, items, pw) => items.every((i) => { const all = [i.text, i.detail, JSON.stringify(i.i18n || {})].join(' ');
    return ![it.home, it.data, it.root, it.base, pw, SW.witnessFileOf(it.root)].some((x) => x && all.includes(x)) && !/[\\/]/.test([i.text, i.detail].join(' ')); });
  // REFUSED: a set whose home copy's write is refused (placed: the stand-in rejects netWrite)
  const scene = async (A = Auth, tag = 'refused') => {
    const it = install('dc3f-notice-' + tag), todos = inboxOf(it), pool = poolOf(), a = startWith(it, pool, todos, A);
    await until(() => !a.held);
    quiet(() => a.setPassword('pw-notice-0001', { userSet: true })); await a._netWrites;
    const first = openOf(todos), wrote1 = pool.s.calls.filter((c) => c === 'netWrite').length;
    quiet(() => a.setPassword('pw-notice-0002', { userSet: true })); await a._netWrites;
    const again = openOf(todos), wrote2 = pool.s.calls.filter((c) => c === 'netWrite').length;
    pool.s.write = 'ok'; quiet(() => a.setPassword('pw-notice-0003', { userSet: true })); await a._netWrites;
    return { it, a, todos, pool, first, again, wrote1, wrote2, after: openOf(todos) };
  };
  const r = await scene();
  ok(r.wrote1 >= 1 && r.first.length === 1 && r.first[0].itemKey === 'signin-witness-refused' && r.first[0].kind === 'notice' && r.first[0].text === 'The copy of the sign-in record on your network home folder could not be updated',
    'REFUSED (a placed refusal of the home copy\'s write — the stand-in counts the write it refused): ONE For-you notice, its own words', { wrote: r.wrote1, items: r.first.map((i) => [i.itemKey, i.text]) });
  ok(r.wrote2 > r.wrote1 && r.again.length === 1, '…refused AGAIN (a second set): still ONE item — once a cause', { wrote: r.wrote2, open: r.again.length });
  ok(r.first.length === 1 && wordsClean(r.it, r.first, 'pw-notice-0001') && !!r.first[0].i18n && r.first[0].i18n.text.key === r.first[0].text && Array.isArray(r.first[0].i18n.detail) && r.first[0].sessionName === 'Sign-in record' && r.first[0].i18n.source.key === 'Sign-in record' && r.first[0].urgency === 'normal', 'its words name NO path (no home, data or root folder, no file name, no slash), NO account and NO sign-in value; they ride their dictionary key, under a head of their own («Sign-in record»), with the ordinary urgency (it asks nothing of a person — r5254 (3))', r.first[0]);
  ok(r.after.length === 0, '…and a later write that LANDS closes it by itself', r.after.map((i) => i.itemKey));
  // WAITING: the write parked behind ended asks still holding their threads (the stand-in's stats say two)
  {
    const it = install('dc3f-notice-waiting'), todos = inboxOf(it), pool = poolOf(), a = startWith(it, pool, todos);
    await until(() => !a.held); pool.s.write = 'ok'; pool.s.ending = 2;
    quiet(() => a.setPassword('pw-notice-0004', { userSet: true })); await a._netWrites;
    const w = openOf(todos), wrote = pool.s.calls.filter((c) => c === 'netWrite').length;
    pool.s.ending = 0; if (pool.s.ended) pool.s.ended(); await a._netWrites;
    ok(wrote === 0 && w.length === 1 && w[0].itemKey === 'signin-witness-waiting' && wordsClean(it, w, 'pw-notice-0004'), 'WAITING (the write parked behind two ended asks): ONE notice of its own cause, its words as clean — no write asked while parked', { wrote, items: w.map((i) => i.itemKey) });
    ok(openOf(todos).length === 0 && pool.s.calls.includes('netWrite'), '…and when a stuck ask ends the owed write is asked, lands, and the notice closes', openOf(todos).map((i) => i.itemKey));
  }
  // WAITING, THEN REFUSED: the parked write is asked when a stuck ask ends and the home refuses it — «waiting» closes (nothing waits now),
  // the refusal's notice stands alone
  const waitRefused = async (A = Auth, tag = 'waiting-refused') => {
    const it = install('dc3f-notice-' + tag), todos = inboxOf(it), pool = poolOf(), a = startWith(it, pool, todos, A);
    await until(() => !a.held); pool.s.ending = 2;
    quiet(() => a.setPassword('pw-notice-0012', { userSet: true })); await a._netWrites;
    const parked = openOf(todos).map((i) => i.itemKey), w0 = pool.s.calls.filter((c) => c === 'netWrite').length;
    pool.s.ending = 0; quiet(() => { if (pool.s.ended) pool.s.ended(); }); await a._netWrites;
    return { parked, w0, asked: pool.s.calls.filter((c) => c === 'netWrite').length - w0, open: openOf(todos).map((i) => i.itemKey) };
  };
  const wr = await waitRefused();
  ok(wr.parked.join() === 'signin-witness-waiting' && wr.w0 === 0 && wr.asked === 1 && wr.open.join() === 'signin-witness-refused', 'WAITING, THEN REFUSED (the parked write asked when a stuck ask ended; the stand-in refused it): «waiting» closes, the refusal\'s notice stands alone', wr);
  // A REFUSED REMOVAL (the sign-in turned off; the stand-in refuses the home copy's removal): the same notice, its own words
  {
    const it = install('dc3f-notice-removed'), todos = inboxOf(it), pool = poolOf(), a = startWith(it, pool, todos);
    await until(() => !a.held); pool.s.write = 'ok';
    quiet(() => a.setPassword('pw-notice-0013', { userSet: true })); await a._netWrites;
    const before = openOf(todos).length; pool.s.remove = 'refuse';
    quiet(() => a.removePassword()); await a._netWrites;
    const removes = pool.s.calls.filter((c) => c === 'netRemove').length, o = openOf(todos);
    ok(before === 0 && removes >= 1 && o.length === 1 && o[0].itemKey === 'signin-witness-refused' && wordsClean(it, o, 'pw-notice-0013'), 'a REFUSED REMOVAL (the sign-in turned off; the stand-in refused the removal it was asked): the same notice, its words as clean', { before, removes, open: o.map((i) => i.itemKey) });
  }
  // ONCE A CAUSE, the person's word kept: a notice the person dismissed is not filed again by a second refusal in the same run
  const dismissed = async (A = Auth, tag = 'dismissed') => {
    const it = install('dc3f-notice-' + tag), todos = inboxOf(it), pool = poolOf(), a = startWith(it, pool, todos, A);
    await until(() => !a.held); quiet(() => a.setPassword('pw-notice-0014', { userSet: true })); await a._netWrites;
    const first = openOf(todos); if (first[0]) todos.setStatus(first[0].id, 'dismissed', 'user');
    quiet(() => a.setPassword('pw-notice-0015', { userSet: true })); await a._netWrites;
    return { first: first.length, writes: pool.s.calls.filter((c) => c === 'netWrite').length, open: openOf(todos).length };
  };
  const dm = await dismissed();
  ok(dm.first === 1 && dm.writes >= 2 && dm.open === 0, 'ONCE A CAUSE: the person dismissed the notice; a second refusal (read by the stand-in) does not reopen it in this run', dm);
  // THE START-NEW ACT (the person's file): its removal of the home copy — refused ⇒ the notice; landed ⇒ closed; the start-time write that
  // follows it READS none of the home, so its «none» closes nothing (the pool handed after the start: the road where that write runs)
  const LEFT = { origin: 'server', kind: 'notice', urgency: 'high', by: 'system', sessionName: 'Sign-in record', itemKey: 'signin-witness-refused', text: 'The copy of the sign-in record on your network home folder could not be updated' };
  const startNew = async (A = Auth, tag = 'start-new', { remove = 'refuse', left = false } = {}) => {
    const it = install('dc3f-notice-' + tag), todos = inboxOf(it), pool = poolOf(); pool.s.remove = remove;
    if (left) todos.add('signin', LEFT);   // a notice left from an earlier start
    const marker = path.join(it.data, SW.START_NEW); fs.writeFileSync(marker, '');
    const a = quiet(() => new A(it.data, { witness: cfgOf(it, { mountinfo: nfsOf(it), ...quick }), todos: () => todos })).v;
    await until(() => !a.held); quiet(() => a.attachWitnessPool(pool)); await a._netWrites;
    return { calls: pool.s.calls.join(','), marker: fs.existsSync(marker), open: openOf(todos).map((i) => i.itemKey) };
  };
  const sn1 = await startNew();
  ok(sn1.calls === 'netRemove' && sn1.marker && sn1.open.join() === 'signin-witness-refused', 'START-NEW, its removal REFUSED (the stand-in refused the one removal it was asked; nothing read): the notice — the file stays for the next start', sn1);
  const sn2 = await startNew(Auth, 'start-new-landed', { remove: 'ok', left: true });
  ok(sn2.calls === 'netRemove' && !sn2.marker && sn2.open.length === 0, 'START-NEW, its removal LANDED (the stand-in took it): a notice left from an earlier start closes, the file goes', sn2);
  // r5254 (1): THE READ FAILED ON THIS MACHINE's OWN ID (the worker could not read the machine id, so the home copy cannot be named):
  // nothing for the person to mend at the home folder — the journal alone, no notice (the hold's own page names that id)
  const machineUnread = async (A = Auth, tag = 'machine-unread') => {
    const it = install('dc3f-notice-' + tag), todos = inboxOf(it), pool = poolOf(); pool.s.write = 'ok';
    const a1 = startWith(it, pool, todos, A); await until(() => !a1.held); quiet(() => a1.setPassword('pw-notice-0016', { userSet: true })); await a1._netWrites;
    const p2 = poolOf(); p2.s.read = { result: { machineUnknown: { file: path.join(it.base, 'machine-id'), code: 'EACCES' } } };
    const a2 = startWith(it, p2, todos, A); await until(() => p2.s.calls.includes('netRead')); await a2._netWrites;
    return { read: p2.s.calls.filter((c) => c === 'netRead').length, open: openOf(todos).map((i) => i.itemKey) };
  };
  const mu = await machineUnread();
  ok(mu.read >= 1 && mu.open.length === 0, 'THIS MACHINE\'s OWN ID UNREAD at the start-time read (the stand-in answered «machine unknown»): no notice — the home folder is not the place to look (r5254 (1))', mu);
  // r5254 (2): A NOTICE THE PERSON DISMISSED is not filed again at a restart while the home keeps refusing; once its cause LANDS (the
  // landing marks it done), a later refusal is said again
  const restartDismissed = async (A = Auth, tag = 'restart-dismissed') => {
    const it = install('dc3f-notice-' + tag), todos = inboxOf(it), pool = poolOf();
    const a1 = startWith(it, pool, todos, A); await until(() => !a1.held); quiet(() => a1.setPassword('pw-notice-0017', { userSet: true })); await a1._netWrites;
    const first = openOf(todos); if (first[0]) todos.setStatus(first[0].id, 'dismissed', 'user');
    const a2 = startWith(it, pool, todos, A); await until(() => !a2.held); quiet(() => a2.setPassword('pw-notice-0018', { userSet: true })); await a2._netWrites;   // the restart: refused again
    const afterRestart = openOf(todos).length, w2 = pool.s.calls.filter((c) => c === 'netWrite').length;
    pool.s.write = 'ok'; quiet(() => a2.setPassword('pw-notice-0019', { userSet: true })); await a2._netWrites;   // the cause lands
    pool.s.write = 'refuse'; quiet(() => a2.setPassword('pw-notice-0020', { userSet: true })); await a2._netWrites;   // refused again after the landing
    return { first: first.length, w2, afterRestart, again: openOf(todos).map((i) => i.itemKey) };
  };
  const rd = await restartDismissed();
  ok(rd.first === 1 && rd.w2 >= 2 && rd.afterRestart === 0 && rd.again.join() === 'signin-witness-refused', 'A NOTICE THE PERSON DISMISSED (r5254 (2)): refused again after a restart (read by the stand-in) — not filed again; the cause landed, then refused once more — said again', rd);
  // r5254 (4): A LANDING WHILE ANOTHER WRITE IS STILL PARKED keeps «waiting» (closes «refused» only); the parked write asked and landed — closed
  const stillParked = async (A = Auth, tag = 'still-parked') => {
    const it = install('dc3f-notice-' + tag), todos = inboxOf(it), pool = poolOf(), a = startWith(it, pool, todos, A);
    await until(() => !a.held); pool.s.write = 'ok'; pool.s.ending = 2;
    quiet(() => a.setPassword('pw-notice-0021', { userSet: true })); await a._netWrites;   // parked: «waiting»
    const w0 = pool.s.calls.filter((c) => c === 'netWrite').length; pool.s.ending = 0;   // a thread freed, no exit said yet: that write stays owed
    quiet(() => a.setPassword('pw-notice-0022', { userSet: true })); await a._netWrites;   // a later write runs and LANDS
    const landed = pool.s.calls.filter((c) => c === 'netWrite').length - w0, during = openOf(todos).map((i) => i.itemKey);
    quiet(() => { if (pool.s.ended) pool.s.ended(); }); await a._netWrites;   // the exit: the parked write asked, lands
    return { landed, during, after: openOf(todos).map((i) => i.itemKey) };
  };
  const sp = await stillParked();
  ok(sp.landed === 1 && sp.during.join() === 'signin-witness-waiting' && sp.after.length === 0, 'A LANDING WHILE ANOTHER WRITE IS STILL PARKED (r5254 (4); the stand-in took that one write): «waiting» stays; the parked write asked at the exit lands — closed', sp);
  // FOR YOU HELD UNREAD: the notice waits on the store's own «when it reads» door
  {
    const it = install('dc3f-notice-held'), todos = inboxOf(it, { held: true }), pool = poolOf(), a = startWith(it, pool, todos);
    await until(() => !a.held); quiet(() => a.setPassword('pw-notice-0005', { userSet: true })); await a._netWrites;
    const during = openOf(Object.getPrototypeOf(todos)).length; todos.lift();
    ok(during === 0 && openOf(Object.getPrototypeOf(todos)).length === 1, 'For you HELD unread: nothing filed while held; at its read the notice is filed (the store\'s own door)', { during });
  }
  // FOR YOU HELD WHEN THE WRITE LANDS: the close is OWED to the read (the first form dropped it: the notice stood open after a landing)
  const heldClose = async (A = Auth, tag = 'held-close') => {
    const it = install('dc3f-notice-' + tag), todos = inboxOf(it, { held: 'later' }), real = Object.getPrototypeOf(todos), pool = poolOf(), a = startWith(it, pool, todos, A);
    await until(() => !a.held); quiet(() => a.setPassword('pw-notice-0006', { userSet: true })); await a._netWrites;
    const filed = openOf(real).length, w0 = pool.s.calls.filter((c) => c === 'netWrite').length;
    todos.hold(); pool.s.write = 'ok'; quiet(() => a.setPassword('pw-notice-0007', { userSet: true })); await a._netWrites;
    const landed = pool.s.calls.filter((c) => c === 'netWrite').length - w0, during = openOf(real).length;
    todos.lift();
    return { filed, landed, during, after: openOf(real).length };
  };
  const hc = await heldClose();
  ok(hc.filed === 1 && hc.landed >= 1 && hc.during === 1 && hc.after === 0, 'For you HELD when the write LANDS (the stand-in took the write: the landing read): nothing closed while held; at the read the notice closes', hc);
  // …and the LAST word is kept, ONE wait on the door: a refusal then a landing closes; a landing then a refusal files
  {
    const it = install('dc3f-notice-held-order'), todos = inboxOf(it, { held: 'later' }), real = Object.getPrototypeOf(todos), pool = poolOf(), a = startWith(it, pool, todos);
    await until(() => !a.held); todos.hold();
    quiet(() => a.setPassword('pw-notice-0008', { userSet: true })); await a._netWrites;
    pool.s.write = 'ok'; quiet(() => a.setPassword('pw-notice-0009', { userSet: true })); await a._netWrites;
    const waits1 = todos.waits(); todos.lift(); const o1 = openOf(real).length;
    todos.hold(); quiet(() => a.setPassword('pw-notice-0010', { userSet: true })); await a._netWrites;
    pool.s.write = 'refuse'; quiet(() => a.setPassword('pw-notice-0011', { userSet: true })); await a._netWrites;
    const waits2 = todos.waits(); todos.lift(); const o2 = openOf(real);
    const writes = pool.s.calls.filter((c) => c === 'netWrite').length;
    ok(writes >= 4 && waits1 === 1 && o1 === 0 && waits2 === 1 && o2.length === 1 && o2[0].itemKey === 'signin-witness-refused',
      'HELD, two words before the read (four writes read by the stand-in): refused then landed ⇒ nothing open at the read; landed then refused ⇒ the refusal\'s notice — each time ONE wait on the door', { writes, waits1, o1, waits2, o2: o2.map((i) => i.itemKey) });
  }
  // NOTHING AT THE HOME TO REMOVE: a start with no sign-in reads the home folder, finds no copy — the copy is as it should be, a notice
  // left from an earlier refused removal closes
  const noneLeft = async (A = Auth, tag = 'none-left') => {
    const it = install('dc3f-notice-' + tag), todos = inboxOf(it), pool = poolOf();
    todos.add('signin', { origin: 'server', kind: 'notice', urgency: 'high', by: 'system', sessionName: 'Sign-in', itemKey: 'signin-witness-refused', text: 'The copy of the sign-in record on your network home folder could not be updated' });
    const before = openOf(todos).length;
    const a = quiet(() => new A(it.data, { witness: cfgOf(it, { mountinfo: nfsOf(it), pool, ...quick }), todos: () => todos })).v;
    await until(() => !a.held && pool.s.calls.includes('netRead')); await a._netWrites;
    return { before, read: pool.s.calls.filter((c) => c === 'netRead').length, writes: pool.s.calls.filter((c) => c !== 'netRead').length, after: openOf(todos).length };
  };
  const nl = await noneLeft();
  ok(nl.before === 1 && nl.read >= 1 && nl.writes === 0 && nl.after === 0, 'a start with NO sign-in whose home read finds NO copy (the stand-in answered the read: none): the notice left from an earlier refusal closes — nothing written or removed', nl);
  // THE BASE (the REDS): the sayers alone — the journal line, no notice; the landing that closes nothing
  const NO_REFUSED = authCut("this._noticeWitness('refused'), ", '', 'no-notice-refused');
  const red = await scene(NO_REFUSED, 'red-refused');
  ok(red.wrote1 >= 1 && red.first.length === 0, 'RED CONTROL: the base\'s sayer alone (the journal line) — the refused write (read by the product: the stand-in refused it) reaches nobody in For you', { wrote: red.wrote1 });
  const NO_CLOSE = authCut("      this._landedClose();   // B-dc3f (3): the home copy's write / removal LANDED — its notices close by themselves\n", '', 'no-close');
  const red2 = await scene(NO_CLOSE, 'red-close');
  ok(red2.after.length === 1, 'RED CONTROL: a copy that closes nothing at the landing keeps the notice open after the write landed', red2.after.map((i) => i.itemKey));
  const DROP_HELD = authCut("    if (this._heldInbox(store)) return this._owedAtRead(store, Object.fromEntries(causes.map((c) => [c, 'close'])));\n", "    if (this._heldInbox(store)) return;\n", 'drop-held-close');
  const red3 = await heldClose(DROP_HELD, 'red-held-close');
  ok(red3.filed === 1 && red3.landed >= 1 && red3.after === 1, 'RED CONTROL (the first form\'s line: a close while held returns): the write landed (read by the stand-in) and the notice stands open after the read', red3);
  const NONE_KEEPS = authCut("        if (!set && !a.found) return madeUp ? undefined : this._landedClose();", "        if (!set && !a.found) return;", 'none-keeps');
  const red4 = await noneLeft(NONE_KEEPS, 'red-none-left');
  ok(red4.before === 1 && red4.read >= 1 && red4.after === 1, 'RED CONTROL (a start that only returns when the home has no copy): the home read (by the stand-in) and the old notice stays open', red4);
  const MADE_UP = authCut("        if (!set && !a.found) return madeUp ? undefined : this._landedClose();", "        if (!set && !a.found) return this._landedClose();", 'made-up-closes');
  const red5 = await startNew(MADE_UP, 'red-made-up');
  ok(red5.calls === 'netRemove' && red5.marker && red5.open.length === 0, 'RED CONTROL (the first form\'s line: the start-new start\'s made-up «none» closes): the removal refused (by the stand-in) and For you says nothing', red5);
  const NO_SN_CLOSE = authCut(".then(() => { done(); this._landedClose(); })", ".then(done)", 'no-start-new-close');
  const red6 = await startNew(NO_SN_CLOSE, 'red-start-new-landed', { remove: 'ok', left: true });
  ok(red6.calls === 'netRemove' && !red6.marker && red6.open.join() === 'signin-witness-refused', 'RED CONTROL (the start-new removal closes nothing at its landing): the removal landed (the stand-in took it) and the old notice stays open', red6);
  const NO_WAIT_CLOSE = authCut("      if (this._waitingMaybe !== false && !(this._netOwed && this._netOwed.size)) this._closeWitnessNotices(['waiting']);   // B-dc3f (3): nothing waits now — its own end says the rest\n", '', 'no-waiting-close');
  const red7 = await waitRefused(NO_WAIT_CLOSE, 'red-waiting-stays');
  ok(red7.asked === 1 && red7.open.length === 2, 'RED CONTROL (the parked ask asked closes nothing): the write asked and refused (by the stand-in) — «waiting» stays beside «could not be updated»', red7);
  const NO_WAITING = authCut("        this._noticeWitness('waiting');\n", '', 'no-waiting');
  const red8 = await waitRefused(NO_WAITING, 'red-no-waiting');
  ok(red8.parked.length === 0 && red8.w0 === 0 && red8.asked === 1, 'RED CONTROL (the parked sayer alone): the write parked (the stand-in asked nothing until the stuck ask ended) and For you said nothing while it waited', red8);
  const NO_ONCE = MUT.load('src/auth.js', anchored(anchored(AUTH_SRC, "    this._noticed.add(cause);\n", '', 'no-once'), "    if (this._dismissedOf(store, cause)) { this._noticed.add(cause); return; }", '', 'no-once-dismissed'), 'auth-no-once').Auth;
  const red9 = await dismissed(NO_ONCE, 'red-dismissed');
  ok(red9.first === 1 && red9.writes >= 2 && red9.open === 1, 'RED CONTROL (no once-a-cause: neither the run\'s memory nor the person\'s dismissal): the second refusal (read by the stand-in) reopens the notice the person dismissed', red9);
  const ANY_READ = authCut("        if (!a.answered) return (a.machine ? sayJ : say)(set ? 'written' : 'removed', a.why);", "        if (!a.answered) return say(set ? 'written' : 'removed', a.why);", 'machine-says-home');
  const red10 = await machineUnread(ANY_READ, 'red-machine-unread');
  ok(red10.read >= 1 && red10.open.join() === 'signin-witness-refused', 'RED CONTROL (the first form\'s line: every unanswered read files «refused»): this machine\'s own id unread (the stand-in\'s answer read) — the notice sends the person to the home folder', red10);
  const NO_DISMISS = authCut("    if (this._dismissedOf(store, cause)) { this._noticed.add(cause); return; }", '', 'no-dismissed-check');
  const red11 = await restartDismissed(NO_DISMISS, 'red-restart-dismissed');
  ok(red11.first === 1 && red11.w2 >= 2 && red11.afterRestart === 1, 'RED CONTROL (the first form: no look at the person\'s dismissal): the refusal after the restart (read by the stand-in) reopens the notice the person dismissed', red11);
  const ALL_CLOSE = authCut("this._closeWitnessNotices(this._netOwed && this._netOwed.size ? ['refused'] : WITNESS_CAUSES)", "this._closeWitnessNotices(WITNESS_CAUSES)", 'landing-closes-all');
  const red12 = await stillParked(ALL_CLOSE, 'red-still-parked');
  ok(red12.landed === 1 && red12.during.length === 0, 'RED CONTROL (the first form: a landing closes every cause): the later write landed (the stand-in took it) while one is still parked — «waiting» closed early', red12);
  const NO_SN_REFUSED = authCut("(e) => { this._noticeWitness('refused'); this._sayOnce('start-new-net',", "(e) => { this._sayOnce('start-new-net',", 'no-start-new-refused');
  const red13 = await startNew(NO_SN_REFUSED, 'red-start-new-refused');
  ok(red13.calls === 'netRemove' && red13.marker && red13.open.length === 0, 'RED CONTROL (the start-new removal\'s sayer alone): the removal refused (by the stand-in) and For you says nothing', red13);
  // (r5157) A PERSON's PAGE ONLY: the notice is filed under its own key («signin» — no conversation's, so no agent lists it as its own
  // through vibespace-ask), and the For-you doors that read or close an item refuse an agent's or a job's token (an automation key
  // reaches only the verbs of its closed scope table): pinned at the doors
  const UTR = fs.readFileSync(path.join(REPO, 'src/routes/user-todos-reply.js'), 'utf-8');
  const { doorClassOf } = require(path.join(REPO, 'src/door.js'));
  const door = (method, p, bearer, enabled) => doorClassOf({ method, path: p, headers: { authorization: `Bearer ${bearer}`, 'sec-fetch-site': 'same-origin' } }, { enabled }).kind;
  const doors = { list: door('GET', '/api/user-todos', 'vsst_x', true), press: door('POST', '/api/user-todos/x', 'jbt_x', true), off: door('GET', '/api/user-todos', 'vsst_x', false) };
  ok(doors.list === 'page' && doors.press === 'page' && doors.off === 'open', 'A PERSON\'s PAGE (r5157): on a hub a person signs in to, the For-you list and its press are PAGE doors — the cookie decides, and an agent\'s or a job\'s shell holds none; with sign-in OFF every same-origin request passes (the product\'s open hub, for every item alike)', doors);
  ok(r.first.length === 1 && r.first[0].sessionKey === 'signin' && UTR.includes("if (isAgentBearer(req)) return res.status(403).json({ error: 'the user\\'s inbox is read with the user\\'s cookie") && UTR.includes("if (isAgentBearer(req)) return fail(403, 'agent_forbidden', 'resolving the user\\'s inbox is the user\\'s act"),
    'A PERSON\'s PAGE ONLY (r5157): filed under its own key «signin» (no agent\'s conversation), and the doors that read or resolve an item refuse an agent\'s or a job\'s token', r.first[0].sessionKey);
  // THE HUB's WIRING: server.js hands the For-you store to the PLAIN form's Auth as a getter (built after it), with no line added
  const SV = fs.readFileSync(path.join(REPO, 'server.js'), 'utf-8');
  ok(SV.includes("{ clerk: clerkAuth, witness: signinWitness, todos: () => userTodos });"), 'PRODUCTION: server.js hands Auth the For-you store (a getter: the store is built after Auth)');
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
