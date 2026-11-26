#!/usr/bin/env node
// test-signin-witness — B-dc3f (1) (lane lg-text-legs-3, 主开发 r1772 / r1784): A DATA FOLDER THAT IS NOT THE ONE AT THE START
// IS HELD, NEVER A NEW OPEN INSTANCE. The data folder's own id inside it (data/instance.json), the witness outside it (the
// person's CLI index place, its persistent rungs only), the dangling-link rule, and the opt-in declaration VIBESPACE_SIGNIN.
// Scratch roots and a stand-in home only: no real sign-in file, no real data folder, no real home. Every lock its RED.
//   ① the verdict (PURE)  ② the place (law 4)  ③ the restarts: a new instance, the folder gone, back, the one act, learned, the
//   sign-in removed on purpose  ④ the owner's move (law 5): a link retargeted to the same folder; to another  ⑤ a link to
//   nowhere  ⑥ the folder's id never travels (law 2)  ⑦ a throwaway hub (law 4)  ⑧ the declaration  ⑨ a failed witness write
//   (law 3)  ⑩ held: no sign-in file written (law 6)  ⑪ the words: the one act and its full path, en / zh / ja (laws 1, 7)
//   ⑫ two roots on one home  — 主开发 r2152's cure: ⑤ a link to nowhere WITH a witness, left by the act its words name;
//   ⑬ both persistent places read, every copy kept (r2269: never removed because another was written; two named «A and B»),
//   written again at each start  ⑭ a witness there and unreadable holds;
//   ⑧ a sign-in turned off from the page, then the declaration; explicit REDs for the declaration's check, the remove guard,
//   the witness's removal; ⑧ the route's refusal through its handler; ⑪ zh / ja through the server's own fill
//   主开发 r2780 (2): ⑮ H2 — a folder that is not the one the witness saw never opens by saying «off», and no start deletes or
//   writes over another folder's witness; ⑯ H1 (r2869) — a network home's copy, read and written only through the worker pool:
//   held «checking» / «home» meanwhile, one look at a time, its answer decides, the start-new file decides NOW, no sync read
//   主开发 r2341 (the moved form onto the separation's B3b-1): the held words / reason / journal / cause are the table's shared
//   law (src/signin-table.js); the witness is the plain form's — server.js hands it to the plain Auth only (⑦ pins it)
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
const LW = require(path.join(REPO, 'src/login-words.js'));
const MUT = mutantCopies('dc3f-witness', REPO);
const TR = require(path.join(REPO, 'src/server/throwaway-root.js'));   // THE ONE TEST «is this root throwaway» (server.js hands its answer)
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof c !== 'boolean') throw new TypeError(`ok() was handed a ${typeof c}: ${n}`); if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${e !== undefined ? `\n      ${typeof e === 'string' ? e : JSON.stringify(e)}` : ''}`); } };
const J = (x) => JSON.stringify(x);
const ROOT = scratchDir('dc3f-witness');
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
/** the start, as server.js runs it; `envPw` = VIBESPACE_PASSWORD for that start (ensurePassword reads the process's own env) */
const start = (it, extra = {}, A = Auth, envPw = null) => quiet(() => {
  const was = process.env.VIBESPACE_PASSWORD;
  if (envPw) process.env.VIBESPACE_PASSWORD = envPw; else delete process.env.VIBESPACE_PASSWORD;
  try { const a = new A(it.data, { witness: cfgOf(it, extra) }); a.ensurePassword({}); return a; }
  finally { if (was === undefined) delete process.env.VIBESPACE_PASSWORD; else process.env.VIBESPACE_PASSWORD = was; }
});
const witnessFile = (it) => path.join(it.home, '.vibespace', 'local', SW.witnessFileOf(it.root));
const idOf = (it) => { try { return JSON.parse(fs.readFileSync(path.join(it.data, SW.INSTANCE_FILE), 'utf-8')).id; } catch { return null; } };
const varWitness = (it) => path.join(it.base, 'vartmp', `vibespace-${UID}`, SW.witnessFileOf(it.root));   // the install's own var-tmp rung
const res0 = () => ({ code: 0, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; }, type() { return this; }, send(b) { this.body = b; return this; } });
/** an API asked of an instance through its OWN middleware (the server's fill), in `lang` → the answer */
const api = (a, lang = null) => { const res = res0(); a.middleware()({ method: 'GET', path: '/api/whatever', url: '/api/whatever', headers: lang ? { 'accept-language': lang } : {}, cookies: {} }, res, () => { res.code = 200; }); return res; };
/** THE ACT THE HELD WORDS NAME, done as a person reads them: every witness file they name deleted; the link they name replaced
 *  by an empty folder when they say so, else deleted */
const actOf = (fix, it) => {
  for (const f of [witnessFile(it), varWitness(it)]) if (fix.includes(f) && fs.existsSync(f)) fs.unlinkSync(f);
  if (fix.includes(it.data)) { fs.unlinkSync(it.data); if (/empty folder/.test(fix)) fs.mkdirSync(it.data); }
};
// H1 (主开发 r2780 (2), r2869): a stand-in worker pool — each ask recorded; `mode` answers it: 'stall' (never answers: a look stalled
// BY PLACEMENT, never by load), {error, code} (rejected), {text} (read), else ok
const standIn = (mode) => { const calls = []; return { calls, call(op, payload = {}) { calls.push({ op, path: payload.path }); const m = typeof mode === 'function' ? mode(op, payload) : mode; if (m === 'stall') return new Promise(() => { }); if (m && m.error) return Promise.reject(Object.assign(new Error(m.error), { code: m.code })); if (m && m.result) return Promise.resolve(m.result); return Promise.resolve({}); } }; };
// the witness worker's ops (src/signin-witness-worker.js): netRead answers {file, none} / {file, text} / {file, unread}; netWrite / netRemove
const NONE = (op, p) => (op === 'netRead' ? { result: { file: path.join(p.path, 'signin-none.json'), none: true } } : 'ok');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 3000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(10); } return !!(await fn()); };
const nfsOf = (it) => `25 1 0:50 / ${it.home} rw,relatime shared:1 - nfs4 server:/home rw\n`;   // the install's home as a NETWORK mount
const pageOf = (a) => { const res = res0(); a.middleware()({ method: 'GET', path: '/login', url: '/login', headers: { accept: 'text/html' }, cookies: {} }, res, () => { res.code = 200; }); return res; };
const AUTH_SRC = fs.readFileSync(path.join(REPO, 'src/auth.js'), 'utf-8'), SW_SRC = fs.readFileSync(path.join(REPO, 'src/signin-witness.js'), 'utf-8');
const authCut = (from, to, label) => MUT.load('src/auth.js', anchored(AUTH_SRC, from, to, label), `auth-${label}`).Auth;
const swCut = (from, to, label) => MUT.load('src/signin-witness.js', anchored(SW_SRC, from, to, label), `sw-${label}`);

console.log('① the verdict (PURE)');
{
  const w = { id: 'vi-aaaaaaaaaaaa' };
  const V = (o) => SW.verdictOf({ dataDir: '/x/data', ...o }).hold;
  ok(V({ auth: 'present', witness: w }) === null && V({ auth: 'held', witness: w }) === null, 'a sign-in file that is there (read, or held as shipped) decides by itself');
  ok(V({ auth: 'missing' }) === null && V({ auth: 'missing', instance: { id: 'vi-bbbbbbbbbbbb' } }) === null, 'missing with NO witness: a new instance, as today');
  ok(V({ auth: 'missing', witness: w, instance: null }).kind === 'folder' && V({ auth: 'missing', witness: w, instance: { id: 'vi-bbbbbbbbbbbb' } }).kind === 'folder', 'missing, a witness, the folder holds no id or another id: HELD (folder)');
  ok(V({ auth: 'missing', witness: w, instance: { id: w.id } }) === null, 'missing in the folder the witness names (the same id): the person removed it on purpose — no hold');
  ok(V({ auth: 'missing', dataLink: 'dangling' }).kind === 'link', 'missing behind a data folder that is a link to nowhere: HELD (link), witness or not');
  ok(SW.instanceOf('{"id":"vi-0123456789ab"}').id === 'vi-0123456789ab' && SW.instanceOf('{"id":"x"}') === null && SW.instanceOf('nope') === null, 'the folder\'s id file: only a well-formed id counts');
  const doc = SW.witnessDoc({ root: '/r', dataDir: '/r/data', id: 'vi-0123456789ab' });
  const F = [{ file: '/h/w.json', doc: { id: 'vi-aaaaaaaaaaaa' } }, { file: '/t/w.json', doc: { id: 'vi-cccccccccccc' } }];
  ok(V({ auth: 'missing', found: F, instance: { id: 'vi-aaaaaaaaaaaa' } }).kind === 'folder' && J(V({ auth: 'missing', found: F, instance: { id: 'vi-aaaaaaaaaaaa' } }).files) === J(['/h/w.json', '/t/w.json']), 'r2152 (b): both places\' witnesses count — one naming another id holds, and the hold names EVERY file there');
  ok(V({ auth: 'missing', found: [{ file: '/h/w.json', unread: 'it cannot be read (EACCES)' }] }).unread === true && V({ auth: 'missing', found: [{ file: '/h/w.json', unread: 'x' }] }).kind === 'folder', 'r2152 (a): a witness THERE and unreadable holds (folder), never «none»');
  ok(J(V({ auth: 'missing', dataLink: 'dangling', found: [{ file: '/h/w.json', doc: w }] }).files) === J(['/h/w.json']), 'r2152: a link hold carries the witness files there, so its act can name them');
  ok(J(Object.keys(doc).sort()) === J(['dataDir', 'id', 'root', 'setAt', 'v']) && SW.witnessOf(J(doc), { root: '/r', dataDir: '/r/data' }) !== null && SW.witnessOf(J(doc), { root: '/q', dataDir: '/q/data' }) === null, 'law 3: the witness holds the root, the folder\'s path, the id and a time — nothing else; another root\'s file is no witness here');
}

console.log('② the place (law 4): the CLI index ladder, persistent rungs only');
{
  const base = { root: '/r', uid: UID, mountinfo: '', varTmp: '/var/tmp' };
  ok(SW.placeOf({ ...base, home: '/home/x' }).dir === '/home/x/.vibespace/local', 'an installed hub: the home rung (no mount table)');
  ok(SW.placeOf({ ...base, home: '/home/x', throwaway: 'worktree' }).dir === null && SW.placeOf({ ...base, home: '/home/x', throwaway: 'tmp' }).dir === null, 'a throwaway hub (a worktree, a temporary root): NO place — it writes no witness and reads none of the person\'s place');
  const NFS = '25 1 0:50 / /home rw,relatime shared:1 - nfs4 server:/home rw\n';
  const p = SW.placeOf({ ...base, home: '/home/x', mountinfo: NFS });
  ok(p.dir === `/var/tmp/vibespace-${UID}` && p.via === 'var-tmp', `a home on a network mount: the persistent /var/tmp rung (${p.dir})`, p);
  ok(SW.placeOf({ ...base, home: '', uid: null, xdgRuntimeDir: '/run/user/1' }).dir === null, 'only the RAM rung left: no witness (it would not outlive the reboot where mounts are late)');
  const rp = SW.readPlacesOf({ ...base, home: '/home/x' });
  ok(J(rp) === J(['/home/x/.vibespace/local', `/var/tmp/vibespace-${UID}`]) && J(SW.readPlacesOf({ ...base, home: '/home/x', mountinfo: NFS })) === J([`/var/tmp/vibespace-${UID}`]) && J(SW.readPlacesOf({ ...base, home: '/home/x', throwaway: 'worktree' })) === J([]), 'r2152 (b): a start READS both persistent places — never a home on a network mount, never for a throwaway hub', rp);
  const M = MUT.load('src/signin-witness.js', anchored(fs.readFileSync(path.join(REPO, 'src/signin-witness.js'), 'utf-8'), "  if (throwaway) return { dir: null, why: `a ${throwaway} hub keeps no sign-in witness and reads none of the person's place` };\n", '', 'throwaway-reads-home'), 'sw-throwaway');
  ok(M.placeOf({ ...base, home: '/home/x', throwaway: 'worktree' }).dir === '/home/x/.vibespace/local', 'RED CONTROL: the throwaway rule cut — a worktree hub lands on the person\'s home');
}

console.log('③ the restarts: a new instance, the folder gone, back, the one act, learned, removed on purpose');
{
  const it = install('a');
  const a1 = start(it).v;
  const id = idOf(it);
  ok(!a1.held && !a1.passwordEnabled && SW.ID_RE.test(String(id)) && !fs.existsSync(witnessFile(it)), `a new instance: open, its folder's id written once (${id}), no witness yet`);
  quiet(() => a1.setPassword('pw-first-0001', { userSet: true }));
  const w1 = JSON.parse(fs.readFileSync(witnessFile(it), 'utf-8'));
  ok(w1.id === id && w1.root === it.root && w1.dataDir === it.data && (fs.statSync(witnessFile(it)).mode & 0o777) === 0o600, 'a password set: the witness written AFTER the sign-in file (this folder\'s id, its path; 0600)', w1);
  fs.renameSync(it.data, it.data + '.real'); fs.mkdirSync(it.data);   // the mount not there yet: the folder beneath, empty
  const a2 = start(it, {}, Auth, 'env-pw-0002').v;
  ok(!!a2.held && a2.held.kind === 'folder' && a2.shut && a2.passwordEnabled && !fs.existsSync(path.join(it.data, 'auth.json')) && !fs.existsSync(path.join(it.data, SW.INSTANCE_FILE)), 'THE FOLDER IS NOT THE ONE: HELD SHUT by name (folder) — nothing written there: no sign-in file (not even the env password), no id', a2.held);
  const AR = authCut('      if (v.hold) return this._hold(v.hold.why, v.hold.kind, v.hold);\n', '', 'folder-not-held');
  const a2R = start(it, {}, AR).v;
  ok(!a2R.held && !a2R.passwordEnabled, 'RED CONTROL: the release\'s load (the verdict cut) — the same start is a NEW OPEN INSTANCE');
  fs.rmSync(it.data, { recursive: true, force: true }); fs.renameSync(it.data + '.real', it.data);   // the mount back
  const a3 = start(it).v;
  ok(!a3.held && a3.verifyPassword('pw-first-0001'), 'the folder back: the instance as it was, its password signs in');
  fs.renameSync(it.data, it.data + '.real'); fs.mkdirSync(it.data);
  fs.unlinkSync(witnessFile(it));   // THE ONE ACT: a new instance on purpose
  const a4 = start(it).v;
  ok(!a4.held && !a4.passwordEnabled, 'the one act (the witness deleted): this folder starts as a new instance with no sign-in');
  fs.rmSync(it.data, { recursive: true, force: true }); fs.renameSync(it.data + '.real', it.data);
  const a5 = start(it).v;
  ok(!a5.held && a5.passwordEnabled && JSON.parse(fs.readFileSync(witnessFile(it), 'utf-8')).id === idOf(it), 'the folder there and the witness missing: nothing changes — the witness LEARNED at the start');
  const aged = () => fs.writeFileSync(witnessFile(it), J({ ...JSON.parse(fs.readFileSync(witnessFile(it), 'utf-8')), setAt: 1 }));
  aged(); start(it);
  ok(JSON.parse(fs.readFileSync(witnessFile(it), 'utf-8')).setAt > 1, 'r2152 (c): a start where the witness MATCHES writes it again (a place the system ages out never loses it under a hub that runs long)');
  aged(); start(it, {}, authCut("      for (const file of files) each(file, 'written', ", "      if (!(f.witness && f.witness.id === f.instance.id)) for (const file of files) each(file, 'written', ", 'write-on-mismatch-only'));
  ok(JSON.parse(fs.readFileSync(witnessFile(it), 'utf-8')).setAt === 1, 'RED CONTROL: written only when it does not match (the first form) — the matching witness is never written again');
  fs.unlinkSync(path.join(it.data, 'auth.json'));   // the shipped way out: the person removes the sign-in file in its own folder
  const a6 = start(it).v;
  ok(!a6.held && !a6.passwordEnabled && !fs.existsSync(witnessFile(it)), 'the sign-in file removed on purpose in its own folder (the same id): no sign-in, as the held words promise — the witness removed');
  quiet(() => a6.setPassword('pw-again-0003', { userSet: true }));
  quiet(() => a6.removePassword());
  ok(!fs.existsSync(witnessFile(it)), 'the sign-in turned off from the page: the witness removed');
  const a7 = start(it, {}, authCut("      for (const w of found) if (!w.net) each(w.file, 'removed', () => SW.removeWitness({ file: w.file }));", '', 'no-removal')).v;
  quiet(() => a7.setPassword('pw-again-0004', { userSet: true })); quiet(() => a7.removePassword());
  ok(fs.existsSync(witnessFile(it)), 'RED CONTROL: the removal cut — the sign-in turned off leaves its witness (a later start with the folder gone would hold an instance that has no sign-in)');
  fs.unlinkSync(witnessFile(it));
}

console.log('④ the owner\'s move (law 5): a data folder that MOVES with its id file is the same folder');
{
  const it = install('move');
  const disk1 = path.join(it.base, 'disk1-data'), disk2 = path.join(it.base, 'disk2-data'), other = path.join(it.base, 'other-data');
  fs.rmSync(it.data, { recursive: true, force: true }); fs.mkdirSync(disk1); fs.symlinkSync(disk1, it.data);
  quiet(() => start(it).v.setPassword('pw-move-0001', { userSet: true }));
  fs.cpSync(disk1, disk2, { recursive: true }); fs.unlinkSync(it.data); fs.symlinkSync(disk2, it.data);   // the link retargeted
  const m1 = start(it).v;
  ok(!m1.held && m1.verifyPassword('pw-move-0001'), 'a link retargeted to a whole copy (the same id): the same folder — never held');
  fs.unlinkSync(path.join(disk2, 'auth.json'));
  const m2 = start(it).v;
  ok(!m2.held && !m2.passwordEnabled, '…and its sign-in file removed there on purpose (the same id): no sign-in, never held');
  quiet(() => m2.setPassword('pw-move-0002', { userSet: true }));
  fs.mkdirSync(other); fs.writeFileSync(path.join(other, SW.INSTANCE_FILE), J(SW.newInstance())); fs.unlinkSync(it.data); fs.symlinkSync(other, it.data);
  const m3 = start(it).v;
  ok(!!m3.held && m3.held.kind === 'folder', 'a link retargeted to ANOTHER folder (another id, no sign-in file): HELD — the id decides, never the path', m3.held);
}

console.log('⑤ a data folder that is a link to nowhere: held, witness or not');
{
  const it = install('dangling');
  fs.rmSync(it.data, { recursive: true, force: true }); fs.symlinkSync(path.join(it.base, 'not-there'), it.data);
  const d = start(it).v;
  ok(!!d.held && d.held.kind === 'link' && d.shut && !fs.existsSync(witnessFile(it)), 'a fresh home, the data folder a link to nowhere: HELD (link) — no witness needed', d.held);
  const fx = api(d).body.fix;
  actOf(fx, it);
  ok(/empty folder/.test(fx) && fx.includes(it.data) && !start(it).v.held, 'the act its words name (an empty folder in the link\'s place; git puts back the tracked helpers): a new instance', fx);
  // 主开发 r2152 THE MUST: a link to nowhere WITH a witness — the act the words name leaves the hold, ONE act
  const lw = (name) => { const t = install(name), disk = path.join(t.base, 'disk-data'); fs.rmSync(t.data, { recursive: true, force: true }); fs.mkdirSync(disk); fs.symlinkSync(disk, t.data); quiet(() => start(t).v.setPassword('pw-link-0001', { userSet: true })); fs.rmSync(disk, { recursive: true, force: true }); return t; };
  const W1 = lw('dangling-w'), l1 = start(W1), h1 = l1.v.held, b1 = api(l1.v).body;
  ok(!!h1 && h1.kind === 'link' && h1.witness === witnessFile(W1) && b1.reason === 'link' && b1.fix.includes(witnessFile(W1)) && b1.fix.includes(W1.data) && l1.lines.filter((x) => /SIGN-IN HELD/.test(x)).length === 1 && l1.lines.some((x) => x.includes(witnessFile(W1)) && x.includes('empty folder')), 'a link to nowhere and a witness: HELD (link), and its words and the journal name the WHOLE act — the witness AND the link', { h1, fix: b1.fix });
  for (const lang of ['zh', 'ja']) { const b = api(l1.v, lang).body; ok(b.lang === lang && b.fix === LW.loginWords(lang)['signin-held-link-witness-fix'].replace('{witness}', witnessFile(W1)).replace('{dir}', W1.data).replace('{root}', W1.root), `${lang}: the same act through the server's own fill`, b.fix); }
  actOf(b1.fix, W1);
  const n1 = start(W1).v;
  ok(!n1.held && !n1.passwordEnabled && fs.statSync(W1.data).isDirectory(), 'THE ACT DONE AS NAMED: the next start is a new instance with no sign-in — never held again by the other reason');
  // the words live in the table's shared law (src/signin-table.js, 主开发 r2341): the RED's words are a mutant table's, over the real held state
  const TM = MUT.load('src/signin-table.js', anchored(fs.readFileSync(path.join(REPO, 'src/signin-table.js'), 'utf-8'), "  const fixKey = kind === 'link' && held.witness ? 'signin-held-link-witness-fix' : kind === 'folder' && held.unread && held.net ? 'signin-held-unread-net-fix' : `${whyKey}-fix`;\n", "  const fixKey = kind === 'folder' && held.unread && held.net ? 'signin-held-unread-net-fix' : `${whyKey}-fix`;\n", 'link-fix-no-witness'), 'table-link-fix-no-witness');
  const W2 = lw('dangling-w-red'), r2 = TM.heldWords('en', false, start(W2).v.held).fix;
  actOf(r2, W2);
  const n2 = start(W2).v;
  ok(!r2.includes(witnessFile(W2)) && !!n2.held && n2.held.kind === 'folder', 'RED CONTROL: the words as they stood (the link alone named) — the act done, the next start is HELD AGAIN by the folder reason', n2.held);
}

console.log('⑥ the folder\'s id never travels (law 2)');
{
  const A = install('exp-a'), B = install('exp-b');
  const aa = start(A).v; quiet(() => aa.setPassword('pw-exp-0001', { userSet: true }));
  const rec = aa.exportPasswordRecord();
  ok(J(Object.keys(rec).sort()) === J(['passwordHash', 'salt']), 'the export\'s password record: its hash and salt only — no folder id');
  const bb = start(B).v; quiet(() => bb.importPasswordRecord(rec));
  const wb = JSON.parse(fs.readFileSync(witnessFile(B), 'utf-8'));
  ok(wb.id === idOf(B) && wb.id !== idOf(A) && bb.verifyPassword('pw-exp-0001'), 'imported on another instance: that instance keeps ITS OWN id, and its witness names it');
  const exportSrc = ['src/routes/persistence.js'].map((f) => fs.readFileSync(path.join(REPO, f), 'utf-8')).join('\n');
  ok(!exportSrc.includes(SW.INSTANCE_FILE) && !exportSrc.includes('signin-witness'), 'the config export\'s server side (take / apply) names no folder id file');
}

console.log('⑦ a throwaway hub (law 4): judged by THE ONE TEST (src/server/throwaway-root.js), it writes no witness and reads none');
{
  const it = install('throwaway');
  fs.mkdirSync(path.dirname(witnessFile(it)), { recursive: true, mode: 0o700 });
  fs.writeFileSync(witnessFile(it), J(SW.witnessDoc({ root: it.root, dataDir: it.data, id: 'vi-ffffffffffff' })), { mode: 0o600 });   // planted
  const tw = TR.judge(it.root, it.home).throwaway;   // a scratch root under a temp root, handed a temp home: throwaway
  const t = start(it, { throwaway: tw ? 'throwaway' : false }).v;
  ok(tw === true && !t.held, 'a scratch root handed a temp home is throwaway by THE ONE TEST: the planted witness is never read — no hold');
  fs.unlinkSync(witnessFile(it));
  quiet(() => t.setPassword('pw-tw-0001', { userSet: true }));
  ok(!fs.existsSync(witnessFile(it)), '…and a password set there writes no witness in the person\'s place');
  const u = start(it, { throwaway: 'unsaid' }).v;
  ok(!u.held && SW.startFactsSync({ dataDir: it.data, home: it.home, uid: UID, env: {}, mountinfo: '', varTmp: path.join(it.base, 'vartmp'), xdgRuntimeDir: '' }).place.dir === null, 'UNSAID is throwaway: a caller that hands no answer touches none of the person\'s place');
  const srv = fs.readFileSync(path.join(REPO, 'server.js'), 'utf-8');
  ok(/const signinWitness = require\('\.\/src\/server\/hub-port\.js'\)\.piped\(\) \? null : \{ env: process\.env, throwaway: throwawayRoot \? 'throwaway' : false \};/.test(srv) && /PipedAuth : Auth\)\(path\.join\(__dirname, 'data'\), \{ clerk: clerkAuth, witness: signinWitness, todos: \(\) => userTodos \}\)/.test(srv) && /const throwawayRoot = require\('\.\/src\/server\/throwaway-root\.js'\)\.throwaway\(__dirname\);/.test(srv), 'server.js hands the PLAIN form\'s Auth THE ONE TEST\'s answer for its own root (decided at the boot\'s first act); the piped form\'s hub gets none (主开发 r2341)');
}

console.log('⑧ the declaration (opt-in): VIBESPACE_SIGNIN=required');
{
  const it = install('declared');
  const env = { VIBESPACE_SIGNIN: 'required' };
  const d1 = start(it, { env }).v;
  ok(!!d1.held && d1.held.kind === 'declared' && d1.shut, 'required, no password: HELD (declared)', d1.held);
  const it2 = install('declared-pw');
  const d2 = start(it2, { env }, Auth, 'env-pw-0004').v;
  ok(!d2.held && d2.passwordEnabled, 'required with VIBESPACE_PASSWORD: guarded — not held');
  let refused = null; try { quiet(() => d2.removePassword()); } catch (e) { refused = e.code; }
  ok(refused === 'signin-required' && d2.passwordEnabled, `required: the sign-in cannot be turned off here (${refused})`);
  const H = {}, fakeApp = { get(p, ...h) { H['GET ' + p] = h[h.length - 1]; }, post(p, ...h) { H['POST ' + p] = h[h.length - 1]; }, use() { }, all() { }, put() { }, delete() { } };
  d2.registerRoutes(fakeApp);
  const rr = res0(); quiet(() => H['POST /api/auth/set-password']({ body: { remove: true, current: 'env-pw-0004' }, socket: { remoteAddress: '127.0.0.1' }, headers: {} }, rr));
  ok(rr.code === 409 && rr.body && rr.body.error === 'signin-required' && d2.passwordEnabled, `the page's «turn sign-in off» through the route's own handler: 409 signin-required (${rr.code})`, rr.body);
  let cutRemove = null; const d2R = start(it2, { env }, authCut('    const off = this._declared().turnOff; if (off) throw', '    const off = null; if (off) throw', 'no-remove-guard'), 'env-pw-0004').v;
  try { quiet(() => d2R.removePassword()); } catch (e) { cutRemove = e.code; }
  ok(cutRemove === null && !d2R.passwordEnabled, 'RED CONTROL: the remove guard cut — the sign-in IS turned off while the declaration is set');
  const it3 = install('declared-none');
  ok(!start(it3).v.held, 'with no declaration (the default everywhere): no password is no hold');
  const itC = install('declared-cut');
  const dC = start(itC, { env }, authCut('    const d = this._declared(); if (!this._held && d.hold)', '    const d = this._declared(); if (!this._held && false && d.hold)', 'no-declared-check')).v;
  ok(!dC.held && !dC.passwordEnabled, 'RED CONTROL: the declaration\'s check cut — required and no password is a new OPEN instance');
  // 主开发 r2152 (d): the sign-in turned off from the page earlier, then the declaration — the words' act («set VIBESPACE_PASSWORD») works
  const itD = install('declared-off');
  const o = start(itD).v; quiet(() => o.setPassword('pw-off-0001', { userSet: true })); quiet(() => o.removePassword());
  const o1 = start(itD, { env }).v;
  ok(!!o1.held && o1.held.kind === 'declared' && /VIBESPACE_PASSWORD/.test(api(o1).body.fix), 'the sign-in turned off from the page, then required: HELD (declared), the words name VIBESPACE_PASSWORD');
  const o2 = start(itD, { env }, Auth, 'env-pw-0005').v;
  ok(!o2.held && o2.passwordEnabled && o2.verifyPassword('env-pw-0005'), '…and THE ACT DONE (VIBESPACE_PASSWORD set, a restart): guarded by it — the page\'s «off» gives way to the declaration');
  const itD2 = install('declared-off-red');
  const q = start(itD2).v; quiet(() => q.setPassword('pw-off-0002', { userSet: true })); quiet(() => q.removePassword());
  const q2 = start(itD2, { env }, authCut('    if (d.keepOff) return {};\n', '    if (this._state?.userSet) return {};\n', 'userset-first'), 'env-pw-0006').v;   // stale-pins: kept — the first form's early return, the red's text
  ok(!!q2.held && q2.held.kind === 'declared', 'RED CONTROL: the page\'s «off» first (the first form) — the act named does not leave the hold');
  // 主开发 r3629 must 5: THE CELL is ONE function both forms call (SW.declaredCell; the piped form's legs: test-interface-signin-witness ⑧)
  const C = (o) => J(SW.declaredCell(o));
  const cells = [
    [{}, { keepOff: false, clearUserSet: false, hold: null, turnOff: null }],
    [{ userSet: true }, { keepOff: true, clearUserSet: false, hold: null, turnOff: null }],
    [{ declared: true, set: true, userSet: true }, { keepOff: true, clearUserSet: false, hold: null }],
    [{ declared: true, userSet: true, offered: true }, { keepOff: false, clearUserSet: true }],
    [{ declared: true, userSet: true }, { keepOff: false, clearUserSet: false }],
    [{ declared: true, sso: true }, { hold: null }],
  ];
  const wrong = cells.filter(([i, want]) => Object.entries(want).some(([k, v]) => J(SW.declaredCell(i)[k]) !== J(v))).map(([i]) => C(i));
  const dh = SW.declaredCell({ declared: true }), dt = SW.declaredCell({ declared: true, set: true });
  ok(wrong.length === 0 && dh.hold && dh.hold.kind === 'declared' && dt.turnOff && dt.turnOff.code === 'signin-required' && !dt.hold, 'the declaration\'s cell, ONE function: the page\'s «off» stands unless declared with no password and a password offered; held with no password and no single sign-on; the turn-off refused whenever declared', wrong);
}

console.log('⑨ a failed witness write never fails the person\'s act (law 3)');
{
  const it = install('wfail');
  fs.writeFileSync(path.join(it.home, '.vibespace'), 'a file where the folder goes');   // the rung is chosen (nothing there yet), its folder cannot be made
  const a = start(it).v;
  const r = quiet(() => a.setPassword('pw-wfail-0001', { userSet: true })), r2 = quiet(() => a.setPassword('pw-wfail-0002', { userSet: true }));
  const said = [...r.lines, ...r2.lines].filter((l) => /witness .* could not be written/.test(l)).length;
  ok(a.verifyPassword('pw-wfail-0002') && said === 1, `the witness cannot be written: the password is set all the same (twice), and the journal says so ONCE (${said})`, [...r.lines, ...r2.lines]);
  fs.rmSync(path.join(it.home, '.vibespace'));
  start(it);
  ok(fs.existsSync(witnessFile(it)), '…and the next start learns it');
}

console.log('⑩ while held, nothing writes a sign-in file (law 6)');
{
  const it = install('held-writes');
  quiet(() => start(it).v.setPassword('pw-held-0001', { userSet: true }));
  fs.renameSync(it.data, it.data + '.real'); fs.mkdirSync(it.data);
  const h = start(it).v;
  let e1 = null; try { quiet(() => h.setPassword('pw-new-0002')); } catch (e) { e1 = e.code; }
  let e2 = null; try { quiet(() => h.removePassword()); } catch (e) { e2 = e.code; }
  ok(e1 === 'signin-held' && e2 === 'signin-held' && !fs.existsSync(path.join(it.data, 'auth.json')), 'held: a set and a removal are refused, no sign-in file is written');
}

console.log('⑪ the words: the one act and its full path, en / zh / ja (laws 1, 7)');
{
  const it = install('words');
  quiet(() => start(it).v.setPassword('pw-words-0001', { userSet: true }));
  fs.renameSync(it.data, it.data + '.real'); fs.mkdirSync(it.data);
  const r = start(it);
  const h = r.v.held, wf = witnessFile(it);
  for (const lang of ['en', 'zh', 'ja']) {
    const w = LW.loginWords(lang);
    const why = w['signin-held-folder'].replace('{dir}', it.data), fix = w['signin-held-folder-fix'].replace('{witness}', wf);
    ok(why.includes(it.data) && fix.includes(wf), `${lang}: the folder's held words name the folder and the ONE act on its full path`);
  }
  ok(r.lines.filter((l) => /SIGN-IN HELD/.test(l)).length === 1 && r.lines.some((l) => l.includes(wf)), 'the journal says the hold ONCE at the start, the witness\'s full path in it', r.lines);
  const T = require(path.join(REPO, 'src/signin-table.js'));
  ok(T.heldJson({ why: 'x' }, 'en', T.heldWords('en', false)).reason === 'file' && T.heldJson(h, 'en', T.heldWords('en', false, h)).reason === 'folder', 'r2436 (1): both holders answer through the shared heldJson — the piped form\'s held reply carries `reason` too (file), the plain one its kind');
  ok(h.kind === 'folder' && h.witness === wf && h.dir === it.data, 'the held state carries its own reason word and both paths', h);
  const res = api(r.v);
  ok(res.code === 503 && res.body && res.body.reason === 'folder' && String(res.body.fix).includes(wf), 'an API on the held instance: 503 with its reason and the act', res.body);
  for (const lang of ['zh', 'ja']) { const b = api(r.v, lang).body; ok(b.lang === lang && b.why === LW.loginWords(lang)['signin-held-folder'].replace('{dir}', it.data) && b.fix === LW.loginWords(lang)['signin-held-folder-fix'].replace('{witness}', wf), `${lang}: the answer through the server's own fill names the folder and the act`, b); }
}

console.log('⑫ two roots on one home: two witnesses, neither touches the other');
{
  const A = install('two-a'), B = { ...install('two-b') };
  B.home = A.home;
  quiet(() => start(A).v.setPassword('pw-two-0001', { userSet: true }));
  const b = start(B).v;
  ok(!b.held && !b.passwordEnabled && SW.witnessFileOf(A.root) !== SW.witnessFileOf(B.root) && fs.existsSync(witnessFile(A)) && !fs.existsSync(witnessFile(B)), 'another root on the same home starts on its own: A\'s witness is A\'s only');
}

console.log('⑬ both persistent places read (r2152 (b)): a witness written in one is found from the other; every copy kept (r2269)');
{
  const it = install('places');
  const rung = path.join(it.home, '.vibespace', 'local');
  fs.mkdirSync(rung, { recursive: true, mode: 0o755 }); fs.chmodSync(rung, 0o755);   // the home rung refused for a WRITE (open to others)
  quiet(() => start(it).v.setPassword('pw-places-0001', { userSet: true }));
  ok(fs.existsSync(varWitness(it)) && !fs.existsSync(witnessFile(it)), 'the home rung refused (0755): the witness on the var-tmp rung');
  fs.chmodSync(rung, 0o700);   // later: the home rung allowed — the ladder's place moves
  fs.renameSync(it.data, it.data + '.real'); fs.mkdirSync(it.data);
  const p1 = start(it).v;
  ok(!!p1.held && p1.held.kind === 'folder' && p1.held.witness === varWitness(it), 'the folder gone at a start whose place is the home rung: the var-tmp witness is FOUND — HELD, its file named', p1.held);
  const MP = swCut("  if (v.dir && v.via === 'var-tmp') out.push(v.dir);\n", '', 'one-place');
  const fM = MP.startFactsSync({ dataDir: it.data, ...cfgOf(it) });
  ok(MP.verdictOf({ auth: 'missing', dataLink: fM.dataLink, instance: fM.instance, found: fM.found, dataDir: it.data }).hold === null, 'RED CONTROL: only the ladder\'s place read (the first form) — the same start is a new open instance');
  fs.rmSync(it.data, { recursive: true, force: true }); fs.renameSync(it.data + '.real', it.data);
  const p2 = start(it).v;
  ok(!p2.held && p2.verifyPassword('pw-places-0001') && fs.existsSync(witnessFile(it)) && fs.existsSync(varWitness(it)), 'the folder back: the witness written on the home rung AND the var-tmp copy KEPT — never removed because another was written (r2269)');
  // r2269 (2): two copies there — the held words name both, «A and B», in every language; the act done as named leaves the hold
  fs.renameSync(it.data, it.data + '.real'); fs.mkdirSync(it.data);
  const p3 = start(it).v, b3 = api(p3).body;
  const AND = (lang) => `${witnessFile(it)} ${LW.loginWords(lang)['signin-held-and']} ${varWitness(it)}`;
  ok(!!p3.held && p3.held.kind === 'folder' && b3.fix.includes(AND('en')), 'two copies and the folder gone: HELD, the act names both — «delete A and B»', b3.fix);
  for (const lang of ['zh', 'ja']) { const bl = api(p3, lang).body; ok(bl.fix === LW.loginWords(lang)['signin-held-folder-fix'].replace('{witness}', AND(lang)), `${lang}: «A ${LW.loginWords(lang)['signin-held-and']} B» through the server's own fill`, bl.fix); }
  actOf(b3.fix, it);
  const p4 = start(it).v;
  ok(!fs.existsSync(witnessFile(it)) && !fs.existsSync(varWitness(it)) && !p4.held && !p4.passwordEnabled, 'THE ACT done as named (both deleted): a new instance — one act');
}

console.log('⑬b a home on a network mount, LATE at one start (r2269 (1)): the copy the next start finds is never removed');
{
  const nfsLate = async (name, A = Auth) => {
    const it = install(name), NFSH = nfsOf(it);
    const first = start(it, { mountinfo: NFSH, pool: standIn(NONE) }).v;   // H1: the network home's look answers «no witness» — it opens
    await until(() => !first.held);
    quiet(() => first.setPassword('pw-nfs-0001', { userSet: true }));   // the home a network mount: var-tmp
    const was = fs.existsSync(varWitness(it)) && !fs.existsSync(witnessFile(it));
    start(it, {}, A);   // the mount LATE at this start: the ladder lands in the folder underneath the mount point
    const both = fs.existsSync(witnessFile(it)) && fs.existsSync(varWitness(it));
    fs.renameSync(it.data, it.data + '.real'); fs.mkdirSync(it.data);
    return { it, was, both, next: start(it, { mountinfo: NFSH }).v };   // the mount back (hiding the copy underneath), the data folder missing
  };
  const g = await nfsLate('nfs-late');
  ok(g.was && g.both, 'the home a network mount: the witness on var-tmp; at a start where the mount is late, a copy written underneath AND the var-tmp copy kept');
  ok(!!g.next.held && g.next.held.kind === 'folder' && g.next.held.witness === varWitness(g.it), '…the mount back and the data folder missing: the var-tmp copy names it — HELD, never open', g.next.held);
  const r = await nfsLate('nfs-late-red', authCut("      const files = [...new Set([...(f.place && f.place.dir ? [f.file] : []), ...found.filter((w) => !w.net && w.writable !== false).map((w) => w.file)])];   // the ladder's place + every LOCAL copy whose folder takes a write (r2436 (3)); a network entry is the worker's alone (r3030)\n", "      const files = f.place && f.place.dir ? [f.file] : []; for (const w of found) if (!w.net && w.file !== f.file) SW.removeWitness({ file: w.file });\n", 'remove-the-other-copy'));
  ok(!r.both && !!r.next.held && r.next.held.kind === 'checking', 'RED CONTROL: the other place\'s copy removed once one is written (the first form) — the var-tmp copy is gone: the next start can only wait on the network home (H1), never held by the copy', r.next.held);
}

console.log('⑬c a copy in a folder the read allows and the write refuses (r2436 (3)): kept as it is, never rewritten nor warned about at each start');
{
  const run = (name, A = Auth) => {
    const it = install(name);
    quiet(() => start(it).v.setPassword('pw-refused-0001', { userSet: true }));   // the home rung 0700: the copy written there
    fs.writeFileSync(witnessFile(it), J({ ...JSON.parse(fs.readFileSync(witnessFile(it), 'utf-8')), setAt: 1 }));
    fs.chmodSync(path.dirname(witnessFile(it)), 0o755);   // later the folder is open to others: the read allows it, the write refuses it
    const r = start(it, {}, A);
    const kept = JSON.parse(fs.readFileSync(witnessFile(it), 'utf-8')).setAt === 1;
    fs.chmodSync(path.dirname(witnessFile(it)), 0o700);
    return { kept, said: r.lines.filter((l) => /witness .* could not be written/.test(l)).length, held: !!r.v.held, varCopy: fs.existsSync(varWitness(it)) };
  };
  const g = run('refused');
  ok(g.kept && g.said === 0 && !g.held && g.varCopy, 'the copy in the refused folder is kept as it is (not rewritten) and nothing is said; the witness is written where the ladder lands (var-tmp)', g);
  const r = run('refused-red', authCut("      const files = [...new Set([...(f.place && f.place.dir ? [f.file] : []), ...found.filter((w) => !w.net && w.writable !== false).map((w) => w.file)])];   // the ladder's place + every LOCAL copy whose folder takes a write (r2436 (3)); a network entry is the worker's alone (r3030)\n", "      const files = [...new Set([...(f.place && f.place.dir ? [f.file] : []), ...found.filter((w) => !w.net).map((w) => w.file)])];\n", 'refused-rewritten'));
  ok(r.said === 1 && r.kept, 'RED CONTROL: every copy found rewritten (the follow\'s form) — the refused folder\'s write fails and is said at this start (and at every start after)', r);
  // r2436 (4): THE BOOT's SYNCED WRITES, measured — printed, never a bound (§2e): the id file and two witness copies, this machine's disk
  const m = install('measure'), d1 = path.join(m.home, '.vibespace', 'local'), d2 = path.join(m.base, 'vartmp', `vibespace-${UID}`);
  const t0 = process.hrtime.bigint();
  const inst = SW.ensureInstance(m.data, null);
  for (const dir of [d1, d2]) SW.writeWitness({ place: { dir }, file: path.join(dir, SW.witnessFileOf(m.root)), root: m.root, dataDir: m.data, id: inst.id, uid: UID });
  console.log(`  · MEASURE (r2436 (4)): the start's synced writes — the id file and two witness copies — took ${(Number(process.hrtime.bigint() - t0) / 1e6).toFixed(1)} ms on this machine (the boot's rule: no step holds the loop 250 ms)`);
}

console.log('⑭ a witness THERE and unreadable holds (r2152 (a)): a missing one is «none», every other read is a hold');
{
  const it = install('unread');
  quiet(() => start(it).v.setPassword('pw-unread-0001', { userSet: true }));
  fs.renameSync(it.data, it.data + '.real'); fs.mkdirSync(it.data);
  fs.writeFileSync(witnessFile(it), 'not a witness');   // damaged
  const u1 = start(it), b = api(u1.v).body;
  ok(!!u1.v.held && u1.v.held.kind === 'folder' && u1.v.held.unread === true && b.reason === 'folder' && b.why.includes(witnessFile(it)) && b.fix.includes(witnessFile(it)) && u1.lines.some((l) => l.includes(witnessFile(it))), 'a damaged witness: HELD by the folder reason, the sentence naming the file', { held: u1.v.held, why: b.why });
  for (const lang of ['zh', 'ja']) { const bl = api(u1.v, lang).body; ok(bl.why === LW.loginWords(lang)['signin-held-unread'].replace('{witness}', witnessFile(it)).replace('{dir}', it.data), `${lang}: the unreadable witness's own words, through the server's fill`); }
  const MU = swCut("  return doc ? { file, doc } : { file, unread: 'its text is not this folder\\'s witness' };\n", '  return doc ? { file, doc } : null;\n', 'unread-is-none');
  const fU = MU.startFactsSync({ dataDir: it.data, ...cfgOf(it) });
  ok(MU.verdictOf({ auth: 'missing', dataLink: fU.dataLink, instance: fU.instance, found: fU.found, dataDir: it.data }).hold === null, 'RED CONTROL: an unreadable witness read as «none» (the first form) — a new open instance');
  if (UID !== 0) {
    fs.writeFileSync(witnessFile(it), J(SW.witnessDoc({ root: it.root, dataDir: it.data, id: 'vi-aaaaaaaaaaaa' }))); fs.chmodSync(witnessFile(it), 0o000);
    const u2 = start(it).v;
    ok(!!u2.held && u2.held.unread === true && /EACCES/.test(u2.held.why), 'a witness that cannot be read (EACCES): HELD, never «none»', u2.held);
    fs.chmodSync(witnessFile(it), 0o600);
  } else console.log('  · (running as root: no EACCES to make — the damaged file stands for every unreadable one)');
  actOf(b.fix, it);
  const u3 = start(it).v;
  ok(!fs.existsSync(witnessFile(it)) && !u3.held && !u3.passwordEnabled, 'THE ACT its words name (the witness deleted): a new instance');
}

console.log('⑮ H2 (主开发 r2780 (2)): a folder that is not the one the witness saw never opens the instance by saying «off»; no start deletes another folder\'s witness');
{
  const offFolder = (dir, id = null) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'auth.json'), J({ userSet: true, tokens: {} })); if (id) fs.writeFileSync(path.join(dir, SW.INSTANCE_FILE), J({ v: 1, id, createdAt: 1 })); };
  const copies = (it) => [witnessFile(it), varWitness(it)].filter((f) => fs.existsSync(f)).length;
  const H2_CHECK = '    if (!this._state.passwordHash) {\n', FOREIGN = "    if (atStart && !set && SW.foreignAt(found, startId)) {";
  const authCut2 = (pairs, label) => MUT.load('src/auth.js', pairs.reduce((t, [from, to, l]) => anchored(t, from, to, l), AUTH_SRC), `auth-${label}`).Auth;
  // (a) another folder in its place whose OWN sign-in file says off — with no id, then with another id
  const it = install('h2-off');
  quiet(() => start(it).v.setPassword('pw-h2-0001', { userSet: true }));
  fs.renameSync(it.data, it.data + '.real'); offFolder(it.data);
  const h1 = start(it).v;
  ok(!!h1.held && h1.held.kind === 'folder' && h1.held.witness === witnessFile(it) && copies(it) === 1 && !fs.existsSync(path.join(it.data, SW.INSTANCE_FILE)), 'a replaced folder whose own sign-in file says off (it holds no id): HELD by the folder reason, the witness named and KEPT, no id written into it', h1.held);
  fs.rmSync(it.data, { recursive: true, force: true }); offFolder(it.data, 'vi-bbbbbbbbbbbb');
  const h2 = start(it).v;
  ok(!!h2.held && h2.held.kind === 'folder' && copies(it) === 1, '…and one holding ANOTHER id: HELD, the witness kept', h2.held);
  ok(/its own sign-in file says sign-in is off/.test(h2.held.why) && /delete/.test(api(h2).body.fix), 'its why says the folder\'s own file says off; its act is the folder hold\'s (delete the witness named)');
  fs.rmSync(it.data, { recursive: true, force: true }); offFolder(it.data);
  const r1 = start(it, {}, authCut2([[H2_CHECK, '    if (false) {\n', 'h2-cut']], 'h2-off-opens')).v;
  ok(!r1.held && !r1.passwordEnabled, 'RED CONTROL: the off file decides by itself (line 438\'s reading) — the same start OPENS');
  ok(copies(it) === 1, 'and even then (the hold cut), that start DELETES no witness: the second lock — no start whose folder held another id or none removes one');
  fs.rmSync(it.data, { recursive: true, force: true }); offFolder(it.data);
  const r2 = start(it, {}, authCut2([[H2_CHECK, '    if (false) {\n', 'h2-cut'], [FOREIGN, '    if (false) {', 'foreign-cut']], 'h2-release')).v;
  ok(!r2.held && copies(it) === 0, 'RED CONTROL: line 438 whole (both cut) — it opens AND deletes every witness copy: the evidence for the real folder gone');
  // (b) the SAME folder turned off by the person through the product still opens
  const it4 = install('h2-same');
  const s4 = start(it4).v; quiet(() => s4.setPassword('pw-h2-0005', { userSet: true })); quiet(() => s4.removePassword());
  const o4 = start(it4).v;
  ok(!o4.held && !o4.passwordEnabled && !fs.existsSync(witnessFile(it4)), 'the SAME folder turned off by the person through the product still opens (its witness went with the act)');
  fs.mkdirSync(path.dirname(witnessFile(it4)), { recursive: true, mode: 0o700 }); fs.writeFileSync(witnessFile(it4), J(SW.witnessDoc({ root: it4.root, dataDir: it4.data, id: idOf(it4) })), { mode: 0o600 });
  const o5 = start(it4).v;
  ok(!o5.held && !o5.passwordEnabled && !fs.existsSync(witnessFile(it4)), '…and a copy left of the SAME id (its removal had failed): it opens, and this start removes the copy');
  // (c) a folder with its OWN password and another id: guarded by it, and the other folder's witness never written over at a start
  const it3 = install('h2-own');
  quiet(() => start(it3).v.setPassword('pw-h2-0003', { userSet: true }));
  const wid = JSON.parse(fs.readFileSync(witnessFile(it3), 'utf-8')).id;
  const own = (A) => { fs.rmSync(it3.data, { recursive: true, force: true }); fs.mkdirSync(it3.data); quiet(() => new Auth(it3.data).setPassword('pw-other-0004', { userSet: true })); fs.writeFileSync(path.join(it3.data, SW.INSTANCE_FILE), J({ v: 1, id: 'vi-cccccccccccc', createdAt: 1 })); return start(it3, {}, A); };
  fs.renameSync(it3.data, it3.data + '.real');
  const g = own(Auth);
  ok(!g.v.held && g.v.verifyPassword('pw-other-0004') && JSON.parse(fs.readFileSync(witnessFile(it3), 'utf-8')).id === 'vi-cccccccccccc', 'a folder GUARDED by its own password and another id (a restore): never held, and the witness FOLLOWS it (its file decides when the other folder returns)', g.lines);
  fs.writeFileSync(witnessFile(it3), J(SW.witnessDoc({ root: it3.root, dataDir: it3.data, id: wid })), { mode: 0o600 });   // the real folder's witness again (the leg above made it follow)
  own(authCut2([[FOREIGN, '    if (atStart && SW.foreignAt(found, startId)) {', 'foreign-also-set']], 'h2-no-follow'));
  ok(JSON.parse(fs.readFileSync(witnessFile(it3), 'utf-8')).id === wid, 'RED CONTROL: the lock widened to a guarded start (the first form of this cure) — the witness does not follow the restore');
}

console.log('⑯ H1 (主开发 r2780 (2), r2869, r2901, r3030): a network home keeps its copy, read and written ONLY by the witness worker; a start that would open waits held for it');
{
  const authCut2 = (pairs, label) => MUT.load('src/auth.js', pairs.reduce((t, [from, to, l]) => anchored(t, from, to, l), AUTH_SRC), `auth-${label}`).Auth;
  const WW = require(path.join(REPO, 'src/signin-witness-worker.js'));
  const quick = { netBoundMs: 30, netReaskMs: 60, netReaskMaxMs: 1000 };
  // the real folder's sign-in set on a network home; the var-tmp copy gone (its system cleared it); `away` ⇒ the data folder missing too
  const netIt = async (name, { away = true } = {}) => {
    const it = install(name), mi = nfsOf(it), a = start(it, { mountinfo: mi, pool: standIn(NONE) }).v;
    await until(() => !a.held); quiet(() => a.setPassword('pw-net-0001', { userSet: true })); await a._netWrites;
    const id = idOf(it), home = path.dirname(witnessFile(it)); fs.rmSync(varWitness(it), { force: true });
    if (away) { fs.renameSync(it.data, it.data + '.real'); fs.mkdirSync(it.data); }
    return { it, mi, id, home, netFile: path.join(home, 'signin-net.json') };
  };
  const docOf = (W, id) => J(SW.witnessDoc({ root: W.it.root, dataDir: W.it.data, id }));
  const answers = (W, read) => standIn((op) => (op === 'netRead' ? read : 'ok'));
  const settled = (a) => until(() => !a.held || (a.held.kind !== 'checking'));
  // (1) A STALLED look (placement, never load): held at once and still answering; past its bound «home»; re-asks never stack
  const A = await netIt('h1-stall'), pa = standIn('stall');
  const a1 = start(A.it, { mountinfo: A.mi, pool: pa, ...quick }).v;
  ok(!!a1.held && a1.held.kind === 'checking' && a1.held.home === A.home && pa.calls.length === 1 && pa.calls[0].op === 'netRead' && pa.calls[0].path === A.home, 'the data folder missing, its witness only on the network home: HELD «checking» at once — ONE look, through the witness worker (never the loop)', { held: a1.held, calls: pa.calls });
  await until(() => a1.held && a1.held.kind === 'home');
  const b = api(a1).body;
  ok(a1.held.kind === 'home' && b.reason === 'home' && b.why.includes(A.home) && b.fix.includes(SW.START_NEW) && b.fix.includes(A.it.data) && pageOf(a1).code === 200, 'past its bound: HELD «home» — the 503 says the reason by name, that it asks again by itself, and the act to decide NOW; the sign-in page still answers', b);
  for (const lang of ['zh', 'ja']) { const bl = api(a1, lang).body; ok(bl.why === LW.loginWords(lang)['signin-held-home'].replace('{home}', A.home).replace('{dir}', A.it.data) && bl.fix.includes(SW.START_NEW), `${lang}: the «home» words through the server's own fill`); }
  await until(() => (a1._net.reasks || 0) >= 3);
  ok(a1._net.reasks >= 3 && pa.calls.length === 1 && pa.calls.every((c) => c.op === 'netRead') && a1.held.kind === 'home', `a look that has not answered starts no second one (${pa.calls.length} ask over ${a1._net.reasks} re-asks), and nothing is written to the network home`, pa.calls);
  const RA = authCut2([['    if (!n || n.done || n.pending || !this._pool) return;   // ONE look at a time (r2869 (1))\n', '    if (!n || n.done || !this._pool) return;\n', 'one-look'], ['if (n.pending) { again(); return; } this._netLook();', 'this._netLook();', 'reask-pending']], 'looks-stack');
  const A2 = await netIt('h1-stall-red'), pr = standIn('stall');
  start(A2.it, { mountinfo: A2.mi, pool: pr, ...quick }, RA); await until(() => pr.calls.length > 1);
  ok(pr.calls.length > 1, `RED CONTROL: no «one look at a time» — asks pile on a home that hangs (${pr.calls.length})`);
  // round wefspq2j3 (r3172): the re-ask BACKS OFF — 60 ms here, doubling (to its bound): after three re-asks the next waits 8 times the first
  const backoffOf = (a) => (a._net && a._net.timer ? a._net.timer._idleTimeout : -1);
  ok(backoffOf(a1) >= 8 * 60 && backoffOf(a1) <= 1000, `the re-ask BACKS OFF: after ${a1._net.reasks} re-asks the next waits ${backoffOf(a1)} ms (the first: 60 ms; doubling, to its bound)`);
  const RBO = authCut2([['const wait = Math.min(this._netReaskMax(), this._netReask() * 2 ** Math.min(n.waits || 0, 20));', 'const wait = this._netReask();', 'backoff-cut']], 'no-backoff');
  const A3 = await netIt('h1-backoff-red'), a3 = start(A3.it, { mountinfo: A3.mi, pool: standIn('stall'), ...quick }, RBO).v;
  await until(() => (a3._net.reasks || 0) >= 3);
  ok(backoffOf(a3) === 60, `RED CONTROL: no backoff — every re-ask waits the first ${backoffOf(a3)} ms, for as long as the home hangs`);
  // (2) «no witness there» opens as a new install does — quietly (r3030 (f): nothing journalled under the bound)
  const B = await netIt('h1-none');
  const bs = start(B.it, { mountinfo: B.mi, pool: standIn(NONE), ...quick }), b1 = bs.v;
  await until(() => !b1.held);
  ok(!b1.held && !b1.passwordEnabled && SW.ID_RE.test(String(idOf(B.it))) && !bs.lines.some((l) => /SIGN-IN HELD|answered/.test(l)), 'the home answers «no witness there»: it OPENS as a new install does, and an open instance\'s look journals nothing (no held error, no answer line, under the bound)', bs.lines);
  const RB = authCut('        const a = SW.netAnswerOf(res, { root: f.root, dataDir: f.dataDir });\n', "        const a = { answered: false, why: 'the answer cut' };\n", 'none-unheard');
  const B2 = await netIt('h1-none-red');
  const b2 = start(B2.it, { mountinfo: B2.mi, pool: standIn(NONE), ...quick }, RB).v; await until(() => b2.held && b2.held.kind === 'home');
  ok(!!b2.held && b2.held.kind === 'home', 'RED CONTROL: the answer not heard — it stays held (the «opens» leg can fail)');
  // (3) «a witness» (the real folder's id) holds by the folder's own rule; the network copy named
  const C = await netIt('h1-witness');
  const pc = answers(C, { result: { file: C.netFile, text: docOf(C, C.id) } });
  const c1 = start(C.it, { mountinfo: C.mi, pool: pc, ...quick }).v; await settled(c1);
  ok(!!c1.held && c1.held.kind === 'folder' && c1.held.witness === C.netFile && pc.calls.every((x) => x.op === 'netRead'), 'the home answers with the witness (the real folder\'s id): HELD by the folder\'s own rule, the network copy named; nothing written there', c1.held);
  const RC = authCut('    if (a.found) f.found = [...(f.found || []), a.found];   // MARKED net (SW.netAnswerOf): the local writer never takes it\n', '', 'net-found-dropped');
  const C2 = await netIt('h1-witness-red');
  const c2 = start(C2.it, { mountinfo: C2.mi, pool: answers(C2, { result: { file: C2.netFile, text: docOf(C2, C2.id) } }), ...quick }, RC).v; await settled(c2);
  ok(!c2.held, 'RED CONTROL: the network copy not heard — the same start OPENS');
  // (3b) AN ERROR ANSWER, THREE WAYS (r3030 (d), (c)): an answered refusal holds «unread» and its act names start-new; a stale
  // network road is SILENCE (asked again, «home»); a copy over the size bound is «unread», held and named — never asked for ever
  const E1 = await netIt('h1-eacces'), e1 = start(E1.it, { mountinfo: E1.mi, pool: answers(E1, { result: { file: E1.netFile, code: 'EACCES' } }), ...quick }).v; await settled(e1);
  ok(!!e1.held && e1.held.kind === 'folder' && e1.held.unread === true && e1.held.net === true && e1.held.witness === E1.netFile && api(e1).body.fix.includes(SW.START_NEW), 'an answered refusal (EACCES): HELD «unread» by the folder reason, the copy NAMED — its act names the start-new file (a file on a refusing home may not be deletable)', e1.held);
  const E2 = await netIt('h1-estale'), pe2 = answers(E2, { result: { file: E2.netFile, code: 'ESTALE' } });
  const e2 = start(E2.it, { mountinfo: E2.mi, pool: pe2, ...quick }).v; await until(() => pe2.calls.length >= 2);
  ok(!!e2.held && e2.held.kind === 'home' && pe2.calls.length >= 2, `a stale network road (ESTALE) is SILENCE: HELD «home», asked again (${pe2.calls.length} asks) — never «unread» for good`, e2.held);
  const E3 = await netIt('h1-size'), e3 = start(E3.it, { mountinfo: E3.mi, pool: answers(E3, { result: { file: E3.netFile, unread: 'it is larger than 4096 bytes' } }), ...quick }).v; await settled(e3);
  ok(!!e3.held && e3.held.kind === 'folder' && e3.held.unread === true && e3.held.witness === E3.netFile, 'a copy over the size bound: «unread», HELD and named — never «has not answered» asked for ever', e3.held);
  // (3c) H1 MEETS H2: a sign-in file that says off on a network home — the network copy of another id holds it; none opens the off folder
  const H = await netIt('h1-h2-off'); fs.writeFileSync(path.join(H.it.data, 'auth.json'), J({ userSet: true, tokens: {} }));
  const h1 = start(H.it, { mountinfo: H.mi, pool: answers(H, { result: { file: H.netFile, text: docOf(H, H.id) } }), ...quick }).v; await settled(h1);
  ok(!!h1.held && h1.held.kind === 'folder' && /its own sign-in file says sign-in is off/.test(h1.held.why), 'H1 meets H2: a replaced folder whose own file says off, the witness only on the network home: HELD by the network copy', h1.held);
  const H2 = await netIt('h1-h2-off-none'); fs.writeFileSync(path.join(H2.it.data, 'auth.json'), J({ userSet: true, tokens: {} }));
  const h2 = start(H2.it, { mountinfo: H2.mi, pool: standIn(NONE), ...quick }).v; await until(() => !h2.held);
  ok(!h2.held && !h2.passwordEnabled, '…the home answers «none»: the off folder opens, as the person left it');
  // (4) THE PERSON's START-NEW ACT — that start READS none of the home; every copy removed (the home's by the worker); the file kept until
  const homeCopy = (W) => { let there = true; return standIn((op) => (op === 'netRemove' ? ((there = false), 'ok') : op === 'netRead' ? { result: there ? { file: W.netFile, text: docOf(W, W.id) } : { file: W.netFile, none: true } } : 'ok')); };
  const D = await netIt('h1-start-new'), mD = path.join(D.it.data, SW.START_NEW); fs.writeFileSync(mD, '');
  const pd = homeCopy(D), ds = start(D.it, { mountinfo: D.mi, pool: pd, ...quick }), d1 = ds.v; await d1._netWrites;
  ok(!d1.held && !pd.calls.some((c) => c.op === 'netRead') && pd.calls.filter((c) => c.op === 'netRemove' && c.path === D.home).length === 1 && !fs.existsSync(mD) && ds.lines.some((l) => /read none of it/.test(l)), 'the act to decide NOW (the start-new file): that start opens and READS none of the home — the worker removes the home\'s copy, then the file (the journal says just that)', { calls: pd.calls, lines: ds.lines });
  const dn = start(D.it, { mountinfo: D.mi, pool: pd, ...quick }).v; await settled(dn);
  ok(!dn.held, '…and the decision LASTS: the next start reads the home, finds no witness, and opens');
  const RD = authCut("      if (f && f.netHome) { if (!f.startNew) return this._checkHome('missing', null); this._startNewUsed = true; }", "      if (f && f.netHome) return this._checkHome('missing', null);", 'start-new-ignored');
  const D2 = await netIt('h1-start-new-red'); fs.writeFileSync(path.join(D2.it.data, SW.START_NEW), '');
  const d2 = start(D2.it, { mountinfo: D2.mi, pool: standIn('stall'), ...quick }, RD).v;
  ok(!!d2.held && d2.held.kind === 'checking', 'RED CONTROL: the start-new file not read — held «checking»');
  const RD2 = authCut('      this._netStartNew();\n      return;\n', "      try { SW.removeWitness({ file: path.join(this._dataDir, SW.START_NEW) }); } catch { }\n      return;\n", 'start-new-once');
  const D3 = await netIt('h1-start-new-once'); fs.writeFileSync(path.join(D3.it.data, SW.START_NEW), '');
  const p3 = homeCopy(D3); start(D3.it, { mountinfo: D3.mi, pool: p3, ...quick }, RD2);
  const d3 = start(D3.it, { mountinfo: D3.mi, pool: p3, ...quick }).v; await settled(d3);
  ok(!!d3.held && d3.held.kind === 'folder', 'RED CONTROL: the file removed at once and the home\'s copy kept (the first form) — the next start is HELD again: the decision did not last', d3.held);
  const D4 = await netIt('h1-start-new-stall'), m4 = path.join(D4.it.data, SW.START_NEW); fs.writeFileSync(m4, '');
  const d4 = start(D4.it, { mountinfo: D4.mi, pool: standIn('stall'), ...quick }).v;
  ok(!d4.held && fs.existsSync(m4), '…the home does not answer the removal: the start opens and the file STAYS — the next start acts again');
  // (4b) r3030 (e): the start-new act WITH a boot-time sign-in (VIBESPACE_PASSWORD): that sign-in's network copy is written at the SAME start, after the removal
  const D5 = await netIt('h1-start-new-env'); fs.writeFileSync(path.join(D5.it.data, SW.START_NEW), '');
  const p5 = homeCopy(D5), d5 = start(D5.it, { mountinfo: D5.mi, pool: p5, ...quick }, Auth, 'env-pw-0007').v; await d5._netWrites;
  const ops5 = p5.calls.map((c) => c.op).join(',');
  ok(!d5.held && d5.verifyPassword('env-pw-0007') && ops5 === 'netRemove,netWrite', `the start-new act with the boot's own sign-in: the old copy removed, then THAT sign-in's copy written — at the same start, in that order (${ops5})`);
  // (5) THE BOOT's SIGN-IN REPLAYED after the answer: a fresh network home with VIBESPACE_PASSWORD — guarded by it once the home answers
  // the env stays set while the answer is out, as a real boot's does (start() restores it at once)
  const withEnv = async (pw, fn) => { const was = process.env.VIBESPACE_PASSWORD; process.env.VIBESPACE_PASSWORD = pw; try { return await fn(); } finally { if (was === undefined) delete process.env.VIBESPACE_PASSWORD; else process.env.VIBESPACE_PASSWORD = was; } };
  const boot = (W, A0) => quiet(() => { const x = new A0(W.data, { witness: cfgOf(W, { mountinfo: nfsOf(W), pool: standIn(NONE), ...quick }) }); x.ensurePassword({}); return x; }).v;
  const R = install('h1-boot-pw');
  const r1 = await withEnv('env-pw-0008', async () => { const a = boot(R, Auth); await until(() => !a.held); return a; });
  ok(!r1.held && r1.passwordEnabled && r1.verifyPassword('env-pw-0008'), 'the boot\'s password road waits for the answer and is REPLAYED after it: guarded by VIBESPACE_PASSWORD');
  const RR = authCut('    this._replayEnsure();   // the boot\'s own password road, held until the answer', '    void 0;   // the boot\'s own password road, held until the answer', 'replay-cut');
  const R2 = install('h1-boot-pw-red');
  const r2 = await withEnv('env-pw-0009', async () => { const a = boot(R2, RR); await until(() => !a.held); return a; });
  ok(!r2.held && !r2.passwordEnabled, 'RED CONTROL: the replay cut — the fresh install opens with NO sign-in though VIBESPACE_PASSWORD was set');
  // (6) THE ROAD PRODUCTION TAKES: the pool handed AFTER the start (server.js) — a look started late; the owed start-new removal; the start-time write
  const L1 = await netIt('h1-late-look'), l1 = start(L1.it, { mountinfo: L1.mi, ...quick }).v, pl1 = standIn(NONE);
  const before = l1.held && l1.held.kind; l1.attachWitnessPool(pl1); await until(() => !l1.held);
  ok(before === 'checking' && !l1.held && pl1.calls[0].op === 'netRead', 'the pool handed AFTER the start: the look starts then, and its answer decides');
  const L2 = await netIt('h1-late-start-new'), m2 = path.join(L2.it.data, SW.START_NEW); fs.writeFileSync(m2, '');
  const l2 = start(L2.it, { mountinfo: L2.mi, ...quick }).v, pl2 = homeCopy(L2); l2.attachWitnessPool(pl2); await l2._netWrites;
  const ops2 = pl2.calls.map((c) => c.op).join(',');
  ok(!l2.held && ops2 === 'netRemove' && !fs.existsSync(m2), `the owed start-new removal runs when the pool comes, then the file goes — and that start READS none of the home, late or not (${ops2})`);
  const L2b = await netIt('h1-late-start-new-env'), m2b = path.join(L2b.it.data, SW.START_NEW); fs.writeFileSync(m2b, '');
  const l2b = start(L2b.it, { mountinfo: L2b.mi, ...quick }, Auth, 'env-pw-0010').v, pl2b = homeCopy(L2b); l2b.attachWitnessPool(pl2b); await l2b._netWrites;
  const ops2b = pl2b.calls.map((c) => c.op).join(',');
  ok(!l2b.held && l2b.verifyPassword('env-pw-0010') && ops2b === 'netRemove,netWrite' && !fs.existsSync(m2b), `…with the boot's own sign-in and the pool late: the old copy removed, then THAT sign-in's copy written, nothing read (${ops2b})`);
  const RL = authCut('    const madeUp = atStart && this._startNewUsed, seen = madeUp ? { answered: true, found: null } : atStart && this._net && this._net.done ? this._net.answer : null;\n', '    const madeUp = false, seen = atStart && this._net && this._net.done ? this._net.answer : null;\n', 'late-start-new-reads');
  const L2r = await netIt('h1-late-start-new-red'); fs.writeFileSync(path.join(L2r.it.data, SW.START_NEW), '');
  const l2r = start(L2r.it, { mountinfo: L2r.mi, ...quick }, RL).v, pl2r = homeCopy(L2r); l2r.attachWitnessPool(pl2r); await l2r._netWrites;
  ok(pl2r.calls.some((c) => c.op === 'netRead'), `RED CONTROL: the start-time write's read kept at a start-new start — the pool handed late reads the home (${pl2r.calls.map((c) => c.op).join(',')})`);
  const L3 = await netIt('h1-late-write', { away: false }), l3 = start(L3.it, { mountinfo: L3.mi, ...quick }).v, pl3 = answers(L3, { result: { file: L3.netFile, text: docOf(L3, L3.id) } });
  l3.attachWitnessPool(pl3); await l3._netWrites;
  ok(!l3.held && l3.passwordEnabled && pl3.calls.map((c) => c.op).join(',') === 'netRead,netWrite', `the start-time write when the pool comes: read first, then written (${pl3.calls.map((c) => c.op).join(',')})`);
  // (6b) round wefspq2j3: server.js hands a FACTORY — the witness pool is BUILT only for a hub whose home is a network mount
  let built = 0; const factory = () => () => { built++; return standIn(NONE); };
  const LH = install('h1-lazy-local'), lh = start(LH).v; lh.attachWitnessPool(factory());
  const NH = await netIt('h1-lazy-net'), nh = start(NH.it, { mountinfo: NH.mi, ...quick }).v, b0 = built; nh.attachWitnessPool(factory()); await until(() => !nh.held);
  ok(b0 === 0 && built === 1 && !nh.held, `the witness pool is built only for a network home (a local home: ${b0} built; a network home: ${built - b0}), and that hub's look runs on it`);
  const RLZ = authCut('      if (!f || !f.netHome) return;\n      try { pool = pool(); }', '      try { pool = pool(); }', 'lazy-cut');
  const bLz = built; start(install('h1-lazy-red'), {}, RLZ).v.attachWitnessPool(factory());
  ok(built === bLz + 1, 'RED CONTROL: the factory called for a LOCAL home too — a worker thread started for every hub');
  // (7) r2901: a start NEVER HANDED A POOL never sits held and silent
  const G = await netIt('h1-no-pool'), g1 = start(G.it, { mountinfo: G.mi, ...quick }).v;
  await until(() => g1.held && g1.held.kind !== 'checking', 1000);
  const gb = api(g1).body;
  ok(g1.held.kind === 'unchecked' && gb.reason === 'unchecked' && gb.why.includes(G.home) && /could not start its check/.test(gb.why) && gb.fix.includes(SW.START_NEW), 'a start NEVER handed a pool: past the bound HELD «unchecked» — said by name, with the act to decide now', gb);
  const RG = authCut('    const unstarted = setTimeout(() => {\n', '    const unstarted = false && setTimeout(() => {\n', 'no-pool-silent');
  const G2 = await netIt('h1-no-pool-red'), g2 = start(G2.it, { mountinfo: G2.mi, ...quick }, RG).v;
  await until(() => g2.held && g2.held.kind !== 'checking', 300);
  ok(!!g2.held && g2.held.kind === 'checking', 'RED CONTROL: no word for a pool that never came — held «checking» for ever, silent');
  // (8) THE MUST (round wom600meg): NO SYNCHRONOUS CALL — read OR write — reaches the network home, on every road
  const NAMES = ['readFileSync', 'statSync', 'lstatSync', 'existsSync', 'readdirSync', 'openSync', 'readlinkSync', 'accessSync', 'realpathSync', 'unlinkSync', 'mkdirSync', 'writeFileSync', 'renameSync', 'rmSync', 'rmdirSync', 'copyFileSync', 'cpSync', 'appendFileSync', 'chmodSync', 'symlinkSync', 'truncateSync', 'opendirSync', 'statfsSync', 'utimesSync', 'lutimesSync', 'chownSync', 'lchownSync', 'linkSync', 'mkdtempSync'].filter((n) => typeof fs[n] === 'function');
  const watchHome = async (home, fn) => { const seen = [], keep = NAMES.map((n) => [n, fs[n]]); for (const [n, f0] of keep) fs[n] = function (...r) { const at = r.find((p) => typeof p === 'string' && (p === home || p.startsWith(home + '/'))); if (at) seen.push(`${n} ${at}`); return f0.apply(this, r); }; try { await fn(); } finally { for (const [n, f0] of keep) fs[n] = f0; } return seen; };
  const roads = {};
  { const W = await netIt('h1-sync-stall'); roads.stalled = await watchHome(W.it.home, async () => { start(W.it, { mountinfo: W.mi, pool: standIn('stall'), ...quick }); }); }
  { const W = await netIt('h1-sync-none'); roads.none = await watchHome(W.it.home, async () => { const a = start(W.it, { mountinfo: W.mi, pool: standIn(NONE), ...quick }).v; await until(() => !a.held); await a._netWrites; }); }
  const sameId = async (name, A0) => { const W = await netIt(name, { away: false }); fs.unlinkSync(path.join(W.it.data, 'auth.json')); const file = path.join(W.home, 'signin-same.json'); return { W, seen: await watchHome(W.it.home, async () => { const a = start(W.it, { mountinfo: W.mi, pool: answers(W, { result: { file, text: docOf(W, W.id) } }), ...quick }, A0).v; await until(() => !a.held); await a._netWrites;
    // r3172 (1): THE PERSON's ACTS after that open — a new sign-in word, turning it off, an import — each with the network entry in its copies
    quiet(() => a.setPassword('pw-same-0002', { userSet: true })); await a._netWrites; quiet(() => a.removePassword()); await a._netWrites; quiet(() => a.importPasswordRecord(REC)); await a._netWrites; }) }; };
  const REC = (() => { const x = start(install('h1-sync-rec')).v; quiet(() => x.setPassword('pw-rec-0003', { userSet: true })); return x.exportPasswordRecord(); })();
  roads.sameId = (await sameId('h1-sync-same')).seen;
  { const W = await netIt('h1-sync-start-new'); fs.writeFileSync(path.join(W.it.data, SW.START_NEW), ''); roads.startNew = await watchHome(W.it.home, async () => { const a = start(W.it, { mountinfo: W.mi, pool: homeCopy(W), ...quick }).v; await a._netWrites; }); }
  { const W = install('h1-sync-boot'); roads.boot = await watchHome(W.home, async () => { await withEnv('env-pw-0011', async () => { const a = boot(W, Auth); await until(() => !a.held); await a._netWrites; }); }); }   // r3172 (1): the replayed boot road
  { const W = await netIt('h1-sync-late'); roads.late = await watchHome(W.it.home, async () => { const a = start(W.it, { mountinfo: W.mi, ...quick }).v; a.attachWitnessPool(standIn(NONE)); await until(() => !a.held); await a._netWrites; }); }
  const n8 = Object.values(roads).reduce((t, v) => t + v.length, 0);
  ok(n8 === 0, `NO synchronous call, read or write, reaches the network home — the stalled look, the answered «none», the answered SAME id (the person removed the sign-in file) and the person's acts after that open (a new sign-in word, turning it off, an import), the start-new road, the replayed boot road, the pool handed late (${NAMES.length} names, every path argument): ${n8}`, roads);
  const RM = authCut("      for (const w of found) if (!w.net) each(w.file, 'removed', () => SW.removeWitness({ file: w.file }));", "      for (const w of found) each(w.file, 'removed', () => SW.removeWitness({ file: w.file }));", 'net-entry-unmarked');   // stale-pins: kept (the red's TO is line 606's remover, put back on purpose)
  const red8 = (await sameId('h1-sync-same-red', RM)).seen;
  ok(red8.some((x) => /^unlinkSync /.test(x)), `RED CONTROL: the network entry taken by the local remover (line 606's form) — an unlinkSync on the network home from the loop (${red8.length})`, red8);
  const RWR = authCut('found.filter((w) => !w.net && w.writable !== false)', 'found.filter((w) => w.writable !== false)', 'net-entry-written');   // stale-pins: kept (the red's TO is line 642's writer filter, put back on purpose)
  const red8w = (await sameId('h1-sync-same-red-w', RWR)).seen;
  ok(red8w.some((x) => /^(writeFileSync|openSync|renameSync) /.test(x)), `RED CONTROL: the network entry taken by the local WRITER at the person's new sign-in word — a synchronous write on the network home from the loop (${red8w.length})`, red8w);
  const ME = swCut("  if (h.dir && h.via === 'home') out.push(h.dir);\n", "  out.push(String(home).replace(/\\/+$/, '') + '/.vibespace/local');\n", 'net-home-read-sync');
  const Wm = await netIt('h1-sync-read-red'), seenM = await watchHome(Wm.it.home, async () => { ME.startFactsSync({ dataDir: Wm.it.data, ...cfgOf(Wm.it, { mountinfo: Wm.mi }) }); });
  ok(seenM.length > 0, `RED CONTROL: the home rung read like a local one — a synchronous read of the network home (${seenM.length})`);
  // (9) THE REAL WITNESS WORKER over a scratch home: the rung law (0700 folder, 0600 file), the machine's key, the older shape read once then rewritten
  const { SafeFs } = require(path.join(REPO, 'src/safe-fs.js'));
  const pool = new SafeFs({ workerPath: path.join(REPO, 'src/signin-witness-worker.js'), name: 'dc3f-witness-net', poolSize: 1, hungMs: 0 });
  try {
    const F = install('h1-real'), mi = nfsOf(F), rung = path.dirname(witnessFile(F)), key = SW.digestOf(F.root), mine = path.join(rung, WW.nameOf(key, WW.machineKey())), older = path.join(rung, WW.nameOf(key, ''));
    const f0 = start(F, { mountinfo: mi, pool }).v; await until(() => !f0.held, 8000);
    quiet(() => f0.setPassword('pw-real-0001', { userSet: true })); await f0._netWrites;
    ok(!f0.held && fs.existsSync(mine) && JSON.parse(fs.readFileSync(mine, 'utf-8')).id === idOf(F) && (fs.statSync(mine).mode & 0o777) === 0o600 && (fs.statSync(rung).mode & 0o777) === 0o700 && (WW.machineKey() === '' || path.basename(mine) !== path.basename(older)), `THE REAL worker: the network copy written after the sign-in file — keyed by the root AND this machine (${path.basename(mine)}), the file 0600, its folder 0700`);
    if (WW.machineKey()) {   // round wefspq2j3: ONE NAME A MACHINE — the root-only name is a machine-id-less machine's, never this one's
      const other = docOf({ it: F }, 'vi-0123456789ab'); fs.writeFileSync(older, other);
      const f1 = start(F, { mountinfo: mi, pool }).v; await until(() => !f1.held, 8000); await f1._netWrites;
      ok(!f1.held && fs.readFileSync(older, 'utf-8') === other && fs.existsSync(mine), 'a root-only copy beside this machine\'s (the name a machine with NO machine id uses) is left as it is — not read as this machine\'s, not written over, not removed');
      fs.rmSync(older, { force: true });
    } else console.log('  · (this machine has no readable machine id: its copy IS the root-only name — the one-name-a-machine leg has nothing to tell apart)');
    fs.rmSync(varWitness(F), { force: true }); fs.renameSync(F.data, F.data + '.real'); fs.mkdirSync(F.data);
    const f2 = start(F, { mountinfo: mi, pool }).v; await until(() => f2.held && f2.held.kind !== 'checking', 8000);
    ok(!!f2.held && f2.held.kind === 'folder' && f2.held.witness === mine, '…and read by the worker at the next start: the data folder missing ⇒ HELD by the network copy', f2.held);
    fs.writeFileSync(mine, 'x'.repeat(5000));
    const f3 = start(F, { mountinfo: mi, pool }).v; await until(() => f3.held && f3.held.kind !== 'checking', 8000);
    ok(!!f3.held && f3.held.unread === true && f3.held.witness === mine, 'the REAL worker\'s size bound: a copy over 4 KiB is «unread», held and named', f3.held);
    if (process.getuid && process.getuid() !== 0) {   // a refusal the read answers (the copy there, its mode 000): named, held «unread» — never «has not answered»
      fs.writeFileSync(mine, '{}'); fs.chmodSync(mine, 0);
      const f4 = start(F, { mountinfo: mi, pool }).v; await until(() => f4.held && f4.held.kind !== 'checking', 8000); fs.chmodSync(mine, 0o600);
      ok(!!f4.held && f4.held.unread === true && f4.held.witness === mine && /EACCES/.test(f4.held.why), 'the REAL worker\'s refused read (EACCES): the copy NAMED with its code, held «unread»', f4.held);
    } else console.log('  · SKIPPED (running as root: a mode-000 copy is readable by root) — the real worker\'s refused read (EACCES)');
  } finally { pool.close(); }
  // (9b) r3172 (3) + (5): THE WRITER's LAW through the real worker's own op, each with its red — a linked folder, one open to others,
  // another user's: refused by name, nothing written; a write failing at its rename removes its temp; ONE NAME A MACHINE: this machine's
  // write and removal leave the root-only copy (a machine with no machine id) as it is
  {
    const RS = path.join(ROOT, 'rung-law');
    const WSRC = fs.readFileSync(path.join(REPO, 'src/signin-witness-worker.js'), 'utf-8');
    const wCut = (from, to, label) => MUT.load('src/signin-witness-worker.js', anchored(WSRC, from, to, label), `worker-${label}`);
    const tryW = (W0, dir, uid = UID) => { try { W0.runOp('netWrite', { path: dir, root: 'r0', content: J({ v: 1, id: 'vi-00000000000a' }), uid }); return 'written'; } catch (e) { return (e && e.code) || String(e); } };
    const nameIn = (d) => path.join(d, WW.nameOf('r0', WW.machineKey()));
    const setOf = (tag) => { const d = path.join(RS, tag); fs.mkdirSync(d, { recursive: true }); const real = path.join(d, 'real'), link = path.join(d, 'link'), open = path.join(d, 'open'), theirs = path.join(d, 'theirs'); fs.mkdirSync(real, { mode: 0o700 }); fs.symlinkSync(real, link); fs.mkdirSync(open); fs.chmodSync(open, 0o755); fs.mkdirSync(theirs, { mode: 0o700 }); return { real, link, open, theirs }; };
    const L0 = setOf('law'), r0 = [tryW(WW, L0.link), tryW(WW, L0.open), tryW(WW, L0.theirs, UID + 1)];
    ok(r0.every((x) => x === 'EWITNESSFOLDER') && ![L0.real, L0.open, L0.theirs].some((d) => fs.existsSync(nameIn(d))), `the writer's rung law REFUSES by name — a linked folder, one open to others (0755), another user's (${r0.join(' / ')}) — and writes nothing`);
    const LAW = wCut("    if (!law.ok) throw Object.assign(new Error(law.why), { code: 'EWITNESSFOLDER' });\n", '', 'rung-law-cut');
    const L1 = setOf('law-red'), r1 = [tryW(LAW, L1.link), tryW(LAW, L1.open), tryW(LAW, L1.theirs, UID + 1)];
    ok(r1.every((x) => x === 'written') && fs.existsSync(nameIn(L1.real)), `RED CONTROL: the law cut — written through the link into its target, into the open folder and into another user's (${r1.join(' / ')})`);
    const tmpsOf = (d) => fs.readdirSync(d).filter((x) => x.includes('.tmp-'));
    const T0 = path.join(RS, 'temp'); fs.mkdirSync(T0, { recursive: true, mode: 0o700 }); fs.mkdirSync(nameIn(T0));   // the copy's name taken by a FOLDER: the rename fails
    const t0 = tryW(WW, T0);
    ok(t0 !== 'written' && tmpsOf(T0).length === 0, `a write failing at its rename (${t0}) removes its temp file — none left`);
    const TMP = wCut("    } catch (e) { try { fs.unlinkSync(tmp); } catch { /* not made */ } throw e; }\n", "    } catch (e) { throw e; }\n", 'temp-kept');
    const T1 = path.join(RS, 'temp-red'); fs.mkdirSync(T1, { recursive: true, mode: 0o700 }); fs.mkdirSync(nameIn(T1)); tryW(TMP, T1);
    ok(tmpsOf(T1).length === 1, 'RED CONTROL: the temp\'s removal cut — the temp is left behind in the home folder');
    if (WW.machineKey()) {
      const O0 = path.join(RS, 'one-name'); fs.mkdirSync(O0, { recursive: true, mode: 0o700 }); const theirCopy = path.join(O0, WW.nameOf('r0', ''));
      fs.writeFileSync(theirCopy, 'theirs'); const w0 = tryW(WW, O0), read0 = WW.runOp('netRead', { path: O0, root: 'r0' }).result.file; WW.runOp('netRemove', { path: O0, root: 'r0' });
      ok(w0 === 'written' && read0 === nameIn(O0) && fs.readFileSync(theirCopy, 'utf-8') === 'theirs', 'one name a machine: this machine reads, writes and removes only its own name — the root-only copy (a machine with no machine id) stays as it is');
      const OLD = wCut("    let d = null, note = null;\n", "    try { fs.unlinkSync(path.join(dir, nameOf(root, ''))); } catch { }\n    let d = null, note = null;\n", 'older-removed');
      tryW(OLD, O0);
      ok(!fs.existsSync(theirCopy), 'RED CONTROL: line 642\'s form (the older shape removed after the write) — the other machine\'s only copy deleted');
    } else console.log('  · (this machine has no readable machine id: the one-name-a-machine legs have nothing to tell apart)');
  }
  // (10) THE MUST (round wefspq2j3): A HOME THAT HANGS FOR GOOD. Each look's worker blocks IN THE KERNEL (open() of a FIFO with no writer —
  // placed, never load); the REAL SafeFs ends it at its deadline and its thread cannot exit. No new look past 2 such threads: the hold
  // stays «home» with its start-new act, said ONCE; the look resumes when a stuck thread exits. RED: the cap cut — the threads grow
  {
    const { execFileSync } = require('child_process');
    const { SafeFs } = require(path.join(REPO, 'src/safe-fs.js'));
    const wedgeOf = (tag, size = 1) => {
      const dir = path.join(ROOT, `wedge-${tag}`); fs.mkdirSync(dir, { recursive: true });
      const fifo = path.join(dir, 'home.fifo'), flag = path.join(dir, 'stall'), wf = path.join(dir, 'worker.js');
      execFileSync('mkfifo', [fifo]); fs.writeFileSync(flag, '');
      fs.writeFileSync(wf, [
        "const fs = require('fs'); const { parentPort } = require('worker_threads');",
        'parentPort.on(\'message\', ({ id, op }) => {',
        `  if (op === 'netRead' && fs.existsSync(${J(flag)})) fs.closeSync(fs.openSync(${J(fifo)}, 'r'));   // blocks in the kernel until a writer comes`,
        `  parentPort.postMessage({ id, ok: true, result: op === 'netRead' ? { file: ${J(path.join(dir, 'signin-x.json'))}, none: true } : {} });`,
        '});', ''].join('\n'));
      const pool = new SafeFs({ workerPath: wf, name: `dc3f-wedge-${tag}`, poolSize: size, hungMs: 0 });
      // the release: the flag gone, then the FIFO held open read-write by this thread — a writer now exists, so every open() of it
      // returns at once (the stuck ones, and one that raced past the flag)
      let rw = null;
      const release = () => { fs.rmSync(flag, { force: true }); if (rw === null) rw = fs.openSync(fifo, 'r+'); };
      const done = () => { if (rw !== null) { fs.closeSync(rw); rw = null; } };
      return { pool, release, done };
    };
    const threads = () => fs.readdirSync('/proc/self/task').length;
    const cfgW = { netBoundMs: 30, netReaskMs: 60, netReaskMaxMs: 120 };
    const KG = await netIt('h1-wedge'), KR = await netIt('h1-wedge-red');
    const RCAP = authCut('    if (ending >= NET_ENDING_MAX) {   // round wefspq2j3 (r3172)', '    if (false) {   // round wefspq2j3 (r3172)', 'ending-cap-cut');
    const fillParked = (lang) => LW.loginWords(lang)['signin-held-home-parked'].replace('{home}', KG.home).replace('{dir}', KG.it.data);
    const said = [], warn0 = console.warn, err0 = console.error;
    console.warn = (...a) => said.push(a.join(' ')); console.error = (...a) => said.push(a.join(' '));
    const thrBefore = threads(), WG = wedgeOf('fix');
    let WR = null;
    try {
      // the fixed hub takes its pool the way server.js hands it (attachWitnessPool, after the start), alone: the PROCESS's own thread
      // count is read while it is parked (r3219 (3)) — before the six forced looks and after them, a loop turn each
      const g = start(KG.it, { mountinfo: KG.mi, ...cfgW }).v;
      g.attachWitnessPool(WG.pool);
      await until(() => g._net.parked && WG.pool.stats().alive === 1, 15000);
      const thrParked = threads();
      for (let i = 0; i < 6; i++) { g._netLook(); await new Promise((r0) => setImmediate(r0)); }   // six more re-asks while parked
      const thrAfter = threads(), sg = WG.pool.stats(), parkedLines = said.filter((l) => l.includes('no new look until') && l.includes(KG.home));
      ok(g._net.parked && sg.ending === 2 && sg.timeouts >= 2 && thrParked <= thrBefore + 3 && thrAfter === thrParked && g.held && g.held.kind === 'home' && api(g).body.fix.includes(SW.START_NEW) && parkedLines.length === 1,
        `a home that hangs for good: ${sg.timeouts} looks ended at their deadline (a fresh worker that missed its deadline before the op ran exits as ever), ${sg.ending} threads stuck in the kernel — then NO new look over ${g._net.reasks || 0} re-asks and 6 more; the process's own threads: ${thrBefore} before the pool, ${thrParked} parked, ${thrAfter} after the six (two stuck and one live at most); held «home» with its start-new act; said once (${parkedLines.length})`, { sg, thrBefore, thrParked, thrAfter, held: g.held && g.held.kind });
      // r3219 (2): THE PARKED STATE's OWN WORDS — nothing is asked until a stuck check ends; the restart named as the other way out
      const pb = api(g).body, langs = ['zh', 'ja'].filter((l) => api(g, l).body.why === fillParked(l));
      ok(pb.reason === 'home' && pb.why === fillParked('en') && /restart VibeSpace/.test(pb.fix) && pb.fix.includes(SW.START_NEW) && langs.length === 2, `while parked the page says so: «${pb.why.slice(-90)}» — and names the restart beside the start-new act (zh / ja through the table: ${langs.join(', ')})`, pb);
      // RED CONTROL: the cap cut — its pool of THREE workers ends one more at each look with no 500 ms respawn to wait for
      WR = wedgeOf('red', 3);
      const r = start(KR.it, { mountinfo: KR.mi, pool: WR.pool, ...cfgW }, RCAP).v;
      await until(() => WR.pool.stats().ending > 2, 15000);
      const sr = WR.pool.stats();
      ok(sr.ending > 2, `RED CONTROL: the cap cut — each re-ask leaves one more thread stuck in the kernel (${sr.ending} and growing)`, sr);
      // the red's pool goes first (it keeps ending fresh workers until its home answers); then the fixed pool, whose look is parked:
      // no look of its own is out, so its thread count moves by its stuck threads only
      WR.release(); await until(() => !r.held && WR.pool.stats().ending === 0, 8000);
      const before = threads(), stuck = sg.ending;
      WG.release();
      await until(() => WG.pool.stats().ending === 0 && !g.held && before - threads() >= stuck, 8000);
      const after = threads();
      ok(WG.pool.stats().ending === 0 && !g.held && !g.passwordEnabled && before - after >= stuck, `the stuck threads EXIT once the kernel lets go (${before} → ${after} threads, ${stuck} were stuck: the pool's count follows the real threads) — and the parked look RESUMES at that exit: the home answers, the instance opens`, { ending: WG.pool.stats().ending, held: g.held && g.held.kind, net: g._net && { parked: g._net.parked, pending: g._net.pending, timer: !!g._net.timer, done: g._net.done }, said: said.slice(-4) });
    } finally { console.warn = warn0; console.error = err0; WG.release(); WG.pool.close(); WG.done(); if (WR) { WR.release(); WR.pool.close(); WR.done(); } }
  }
  // (10b) r3219 (1): THE WRITE ROADS ASK THE SAME COUNT — past two stuck threads a person's write of the network copy is OWED (the latest
  // of its kind), said once, and asked at a stuck thread's exit; (10c) r3219 (4): ONE exit hook a pool, whichever roads it came by.
  // The pool's two names here (stats().ending, onWorkerEnded) are the real SafeFs's own — (10) reads them over the real pool.
  {
    const endingPool = () => { const calls = [], hooks = []; const P = { calls, hooks, ending: 0, stats: () => ({ ending: P.ending }), onWorkerEnded: (fn) => { hooks.push(fn); return () => {}; }, call(op, payload) { calls.push(op); return Promise.resolve(op === 'netRead' ? { file: path.join(payload.path, 'signin-x.json'), none: true } : {}); } }; return P; };
    const capRun = async (name, A0) => {
      const P = endingPool(), W = await netIt(name), q = start(W.it, { mountinfo: W.mi, pool: P, ...quick }, A0).v;
      await until(() => !q.held); await q._netWrites;
      P.ending = 2; const c0 = P.calls.length, lines = [], w0 = console.warn;
      console.warn = (...a) => lines.push(a.join(' '));
      try { q.setPassword('pw-cap-0004', { userSet: true }); await q._netWrites; q.removePassword(); await q._netWrites; } finally { console.warn = w0; }
      const parked = P.calls.slice(c0).join(','), owed = q._netOwed ? q._netOwed.size : 0;
      P.ending = 1; P.hooks.forEach((h) => h()); await q._netWrites;
      return { parked, owed, after: P.calls.slice(c0).join(','), said: lines.filter((l) => l.includes('is not written or removed now')).length };
    };
    const cw = await capRun('h1-write-cap');
    ok(cw.parked === '' && cw.owed === 1 && cw.said === 1 && cw.after === 'netRemove', `past two stuck threads a person's write is NOT asked (a new sign-in word, then turning it off: ${cw.parked || 'none'} asked), owed once as the latest (${cw.owed}), said once (${cw.said}); at a stuck thread's exit the latest is asked (${cw.after})`, cw);
    const RW2 = authCut("      if (ending >= NET_ENDING_MAX) {   // r3219 (1)", "      if (false) {   // r3219 (1)", 'write-cap-cut');
    const cr = await capRun('h1-write-cap-red', RW2);
    ok(cr.parked === 'netWrite,netRemove', `RED CONTROL: the write's cap cut — each act asks the home that hangs (${cr.parked}): one more stuck thread an act`, cr);
    const P2 = endingPool(), hh = start(install('h1-hook-once'), { pool: P2 }).v; hh.attachWitnessPool(P2);
    const RH = authCut('if (!pool || pool === this._hookedPool || typeof', 'if (!pool || typeof', 'hook-twice');
    const P3 = endingPool(), h3 = start(install('h1-hook-twice'), { pool: P3 }, RH).v; h3.attachWitnessPool(P3);
    ok(P2.hooks.length === 1 && P3.hooks.length === 2, `ONE exit hook a pool handed by both roads (${P2.hooks.length}); RED CONTROL: the check cut — two hooks, every exit heard twice (${P3.hooks.length})`);
  }
  // (11) 主开发 r3351: THE MACHINE's NAME — a read of this machine's id that FAILED is UNKNOWN, never «none». PLACED: the read call
  // refused for the two machine id files only (no system file touched, no mode changed), over a fresh copy of the worker run in-process
  if (WW.machineKey()) {
    const WSRC3 = fs.readFileSync(path.join(REPO, 'src/signin-witness-worker.js'), 'utf-8');
    const inproc = (W0) => ({ call: (op, payload) => { try { return Promise.resolve(W0.runOp(op, payload).result); } catch (e) { return Promise.reject(e); } } });
    const refused = new Set(WW.MACHINE_FILES), rf0 = fs.readFileSync;
    let refusing = true;
    fs.readFileSync = function (p, ...r) { if (refusing && typeof p === 'string' && refused.has(p)) throw Object.assign(new Error(`EACCES: permission denied, open '${p}'`), { code: 'EACCES' }); return rf0.call(this, p, ...r); };
    try {
      const machineRun = async (name, text) => {
        refusing = true;
        const W = await netIt(name), copy = path.join(W.home, WW.nameOf(SW.digestOf(W.it.root), WW.machineKey()));
        fs.mkdirSync(W.home, { recursive: true, mode: 0o700 }); fs.writeFileSync(copy, docOf(W, W.id));   // this machine's own copy stands in the home; the data folder is empty
        const a = start(W.it, { mountinfo: W.mi, pool: inproc(MUT.load('src/signin-witness-worker.js', text, `worker-${name}`, { same: text === WSRC3 })), ...quick }).v;   // the green's copy is the file itself, on purpose: a fresh worker (its own unknown key)
        await until(() => !a.held || a.held.kind !== 'checking');
        const at = { kind: a.held ? a.held.kind : null, machine: a.held ? a.held.machine : null, body: a.held ? api(a).body : null, zh: a.held ? api(a, 'zh').body.why : null };
        refusing = false;   // the read answers again: the NEXT look reads the id again (unknown is never kept)
        await until(() => !a.held || a.held.kind === 'folder', 3000);
        return { at, after: a.held ? { kind: a.held.kind, witness: a.held.witness } : null, copy, W };
      };
      const fillM = (lang, W) => LW.loginWords(lang)['signin-held-home-machine'].replace('{machine}', WW.MACHINE_FILES[0]).replace('{home}', W.home).replace('{dir}', W.it.data);
      const m1 = await machineRun('h1-machine', WSRC3);
      ok(m1.at.kind === 'home' && m1.at.machine === WW.MACHINE_FILES[0] && m1.at.body.why === fillM('en', m1.W) && m1.at.zh === fillM('zh', m1.W) && m1.at.body.fix.includes(SW.START_NEW), `this machine's id read REFUSED (EACCES), its own copy in the home, the data folder empty: HELD «home» by THAT name — «${m1.at.body && m1.at.body.why.slice(0, 80)}…» — never the root-only name's «none»`, m1.at);
      ok(!!m1.after && m1.after.kind === 'folder' && m1.after.witness === m1.copy, 'unknown is NOT kept: the read answers again, the next look reads the id — this machine\'s own copy found, held by the folder\'s rule', m1.after);
      const OLDM = anchored(WSRC3, "    try { t = fs.readFileSync(f, 'utf-8'); } catch (e) { if (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) continue; return { key: null, unknown: { file: f, code: String((e && e.code) || 'EUNKNOWN') } }; }\n", "    try { t = fs.readFileSync(f, 'utf-8'); } catch (e) { continue; }   // e31a56467's form: any failed read falls to the next file, then to none\n", 'machine-any-failure-none');
      const m2 = await machineRun('h1-machine-red', OLDM);
      ok(m2.at.kind === null, 'RED CONTROL: e31a56467\'s form (any failed read of the id is «none», kept) — the root-only name, nothing there: the empty data folder OPENS while this machine\'s own copy stands', m2.at);
    } finally { fs.readFileSync = rf0; }
  } else console.log('  · (this machine has no readable machine id: the machine-name legs have nothing to refuse)');
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
