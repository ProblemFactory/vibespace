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
const standIn = (mode) => { const calls = []; return { calls, call(op, payload = {}) { calls.push({ op, path: payload.path || payload.newPath }); const m = typeof mode === 'function' ? mode(op, payload) : mode; if (m === 'stall') return new Promise(() => { }); if (m && m.error) return Promise.reject(Object.assign(new Error(m.error), { code: m.code })); if (m && m.text != null) return Promise.resolve({ content: m.text }); return Promise.resolve({ success: true }); } }; };
const NONE = (op) => (op === 'readText' ? { error: 'not there', code: 'ENOENT' } : 'ok');
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
  const a7 = start(it, {}, authCut("      for (const w of found) each(w.file, 'removed', () => SW.removeWitness({ file: w.file }));", '', 'no-removal')).v;
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
  const TM = MUT.load('src/signin-table.js', anchored(fs.readFileSync(path.join(REPO, 'src/signin-table.js'), 'utf-8'), "  const fixKey = kind === 'link' && held.witness ? 'signin-held-link-witness-fix' : `${whyKey}-fix`;\n", "  const fixKey = `${whyKey}-fix`;\n", 'link-fix-no-witness'), 'table-link-fix-no-witness');
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
  ok(/const signinWitness = require\('\.\/src\/server\/hub-port\.js'\)\.piped\(\) \? null : \{ env: process\.env, throwaway: throwawayRoot \? 'throwaway' : false \};/.test(srv) && /PipedAuth : Auth\)\(path\.join\(__dirname, 'data'\), \{ clerk: clerkAuth, witness: signinWitness \}\)/.test(srv) && /const throwawayRoot = require\('\.\/src\/server\/throwaway-root\.js'\)\.throwaway\(__dirname\);/.test(srv), 'server.js hands the PLAIN form\'s Auth THE ONE TEST\'s answer for its own root (decided at the boot\'s first act); the piped form\'s hub gets none (主开发 r2341)');
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
  let cutRemove = null; const d2R = start(it2, { env }, authCut('    if (this._declaredNow()) throw Object.assign(new Error(', '    if (false) throw Object.assign(new Error(', 'no-remove-guard'), 'env-pw-0004').v;
  try { quiet(() => d2R.removePassword()); } catch (e) { cutRemove = e.code; }
  ok(cutRemove === null && !d2R.passwordEnabled, 'RED CONTROL: the remove guard cut — the sign-in IS turned off while the declaration is set');
  const it3 = install('declared-none');
  ok(!start(it3).v.held, 'with no declaration (the default everywhere): no password is no hold');
  const itC = install('declared-cut');
  const dC = start(itC, { env }, authCut('    if (!this._held && this._declaredNow() && ', '    if (!this._held && false && ', 'no-declared-check')).v;
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
  const q2 = start(itD2, { env }, authCut('    if (this._state?.userSet && !declaredNoPw) return {};\n', '    if (this._state?.userSet) return {};\n', 'userset-first'), 'env-pw-0006').v;   // stale-pins: kept — the first form's early return, the red's text
  ok(!!q2.held && q2.held.kind === 'declared', 'RED CONTROL: the page\'s «off» first (the first form) — the act named does not leave the hold');
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
  const r = await nfsLate('nfs-late-red', authCut("      const files = [...new Set([...(f.place && f.place.dir ? [f.file] : []), ...found.filter((w) => w.writable !== false).map((w) => w.file)])];   // the ladder's place + every copy found whose folder takes a write (r2436 (3))\n", "      const files = f.place && f.place.dir ? [f.file] : []; for (const w of found) if (w.file !== f.file) SW.removeWitness({ file: w.file });\n", 'remove-the-other-copy'));
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
  const r = run('refused-red', authCut("      const files = [...new Set([...(f.place && f.place.dir ? [f.file] : []), ...found.filter((w) => w.writable !== false).map((w) => w.file)])];   // the ladder's place + every copy found whose folder takes a write (r2436 (3))\n", "      const files = [...new Set([...(f.place && f.place.dir ? [f.file] : []), ...found.map((w) => w.file)])];\n", 'refused-rewritten'));
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

console.log('⑯ H1 (主开发 r2780 (2), r2869): a network home keeps a copy too, read and written ONLY through the worker pool; a start that would open is HELD until it answers');
{
  const authCut2 = (pairs, label) => MUT.load('src/auth.js', pairs.reduce((t, [from, to, l]) => anchored(t, from, to, l), AUTH_SRC), `auth-${label}`).Auth;
  // the data folder missing, the witness only on the network home: the var-tmp copy gone (its system cleared it), the real folder away
  const netIt = async (name) => {
    const it = install(name), mi = nfsOf(it), a = start(it, { mountinfo: mi, pool: standIn(NONE) }).v;
    await until(() => !a.held); quiet(() => a.setPassword('pw-net-0001', { userSet: true }));
    const id = idOf(it); fs.rmSync(varWitness(it), { force: true }); fs.renameSync(it.data, it.data + '.real'); fs.mkdirSync(it.data);
    return { it, mi, id, netFile: witnessFile(it), home: path.dirname(witnessFile(it)) };
  };
  const quick = { netBoundMs: 30, netReaskMs: 60 };
  // (1) A STALLED look: held at once and still answering; past its bound HELD «home»; re-asks never stack; nothing written there
  const A = await netIt('h1-stall'), pa = standIn('stall');
  const a1 = start(A.it, { mountinfo: A.mi, pool: pa, ...quick }).v;
  ok(!!a1.held && a1.held.kind === 'checking' && a1.held.home === A.home && pa.calls.length === 1 && pa.calls[0].op === 'readText' && pa.calls[0].path === A.netFile, 'the data folder missing, its witness only on the network home: HELD «checking» at once — ONE look, through the worker pool (never the loop)', { held: a1.held, calls: pa.calls });
  await until(() => a1.held && a1.held.kind === 'home');
  const b = api(a1).body;
  ok(a1.held.kind === 'home' && b.reason === 'home' && b.why.includes(A.home) && b.fix.includes(SW.START_NEW) && b.fix.includes(A.it.data) && pageOf(a1).code === 200, 'past its bound: HELD «home» — the 503 says the reason by name, that it asks again by itself, and the act to decide NOW (the start-new file in the data folder); the sign-in page still answers', b);
  for (const lang of ['zh', 'ja']) { const bl = api(a1, lang).body; ok(bl.why === LW.loginWords(lang)['signin-held-home'].replace('{home}', A.home).replace('{dir}', A.it.data) && bl.fix.includes(SW.START_NEW), `${lang}: the «home» words through the server's own fill`); }
  await sleep(250);
  ok(pa.calls.length === 1 && pa.calls.every((c) => c.op === 'readText') && a1.held.kind === 'home', `a look that has not answered starts no second one (${pa.calls.length} ask over four re-asks' time), and nothing is written to the network home`, pa.calls);
  const RA = authCut2([['    if (!n || n.done || n.pending || !this._pool) return;   // ONE look at a time (r2869 (1))\n', '    if (!n || n.done || !this._pool) return;\n', 'one-look'], ['if (n.pending) { again(); return; } this._netLook();', 'this._netLook();', 'reask-pending']], 'looks-stack');
  const A2 = await netIt('h1-stall-red'), pr = standIn('stall');
  start(A2.it, { mountinfo: A2.mi, pool: pr, ...quick }, RA); await sleep(250);
  ok(pr.calls.length > 1, `RED CONTROL: no «one look at a time» — asks pile on a home that hangs (${pr.calls.length})`);
  // (2) the home answers «no witness there»: it OPENS as a new install does
  const B = await netIt('h1-none'), pb = standIn(NONE);
  const b1 = start(B.it, { mountinfo: B.mi, pool: pb, ...quick }).v;
  await until(() => !b1.held);
  ok(!b1.held && !b1.passwordEnabled && SW.ID_RE.test(String(idOf(B.it))), 'the home answers «no witness there»: it OPENS as a new install does (the folder takes its own id)');
  const RB = authCut('        const a = SW.netAnswerOf(res, { root: f.root, dataDir: f.dataDir, file: f.netFile });\n', "        const a = { answered: false, why: 'the answer cut' };\n", 'none-unheard');
  const B2 = await netIt('h1-none-red');
  const b2 = start(B2.it, { mountinfo: B2.mi, pool: standIn(NONE), ...quick }, RB).v; await sleep(150);
  ok(!!b2.held && b2.held.kind === 'home', 'RED CONTROL: the answer not heard — it stays held (the «opens» leg can fail)');
  // (3) the home answers with the witness (the real folder's id): HELD by the folder's own rule, the network copy named
  const C = await netIt('h1-witness'), doc = J(SW.witnessDoc({ root: C.it.root, dataDir: C.it.data, id: C.id }));
  const pc = standIn((op) => (op === 'readText' ? { text: doc } : 'ok'));
  const c1 = start(C.it, { mountinfo: C.mi, pool: pc, ...quick }).v;
  await until(() => c1.held && c1.held.kind !== 'checking');
  ok(!!c1.held && c1.held.kind === 'folder' && c1.held.witness === C.netFile && pc.calls.every((x) => x.op === 'readText'), 'the home answers with the witness (the real folder\'s id): HELD by the folder\'s own rule, the network copy named; nothing written there', c1.held);
  const RC = authCut('    if (a.found) f.found = [...(f.found || []), a.found];\n', '', 'net-found-dropped');
  const C2 = await netIt('h1-witness-red'), doc2 = J(SW.witnessDoc({ root: C2.it.root, dataDir: C2.it.data, id: C2.id }));
  const c2 = start(C2.it, { mountinfo: C2.mi, pool: standIn((op) => (op === 'readText' ? { text: doc2 } : 'ok')), ...quick }, RC).v;
  await until(() => !c2.held || c2.held.kind !== 'checking');
  ok(!c2.held, 'RED CONTROL: the network copy not heard — the same start OPENS');
  // (4) the act a person at the machine takes NOW: an empty signin-start-new in the data folder — that start READS none of the home;
  // as the person's act every copy is removed (the home's off the loop) and the file stays until that copy is gone (r2926 (1))
  const homeCopy = (doc) => { let there = true; return standIn((op) => (op === 'unlink' ? ((there = false), 'ok') : op === 'readText' ? (there ? { text: doc } : { error: 'gone', code: 'ENOENT' }) : 'ok')); };
  const D = await netIt('h1-start-new'), mD = path.join(D.it.data, SW.START_NEW); fs.writeFileSync(mD, '');
  const pd = homeCopy(J(SW.witnessDoc({ root: D.it.root, dataDir: D.it.data, id: D.id })));
  const ds = start(D.it, { mountinfo: D.mi, pool: pd, ...quick }), d1 = ds.v; await d1._netWrites;
  ok(!d1.held && !pd.calls.some((c) => c.op === 'readText') && pd.calls.filter((c) => c.op === 'unlink' && c.path === D.netFile).length === 1 && !fs.existsSync(mD) && ds.lines.some((l) => /read none of it/.test(l)), 'the act to decide NOW (the start-new file): that start opens and READS none of the home — the person\'s act removes the home\'s copy off the loop, then the file (the journal says just that)', { calls: pd.calls, lines: ds.lines });
  const dn = start(D.it, { mountinfo: D.mi, pool: pd, ...quick }).v;
  await until(() => !dn.held || dn.held.kind !== 'checking');
  ok(!dn.held, '…and the decision LASTS: the next start reads the home, finds no witness, and opens');
  const RD = authCut("      if (f && f.netHome) { if (!f.startNew) return this._checkHome('missing', null); this._startNewUsed = true; }", "      if (f && f.netHome) return this._checkHome('missing', null);", 'start-new-ignored');
  const D2 = await netIt('h1-start-new-red'); fs.writeFileSync(path.join(D2.it.data, SW.START_NEW), '');
  const d2 = start(D2.it, { mountinfo: D2.mi, pool: standIn('stall'), ...quick }, RD).v;
  ok(!!d2.held && d2.held.kind === 'checking', 'RED CONTROL: the start-new file not read — held «checking»');
  const RD2 = authCut('      this._netStartNew();\n      return;\n', "      try { SW.removeWitness({ file: path.join(this._dataDir, SW.START_NEW) }); } catch { }\n      return;\n", 'start-new-once');
  const D3 = await netIt('h1-start-new-once'); fs.writeFileSync(path.join(D3.it.data, SW.START_NEW), '');
  const p3 = homeCopy(J(SW.witnessDoc({ root: D3.it.root, dataDir: D3.it.data, id: D3.id })));
  start(D3.it, { mountinfo: D3.mi, pool: p3, ...quick }, RD2);
  const d3 = start(D3.it, { mountinfo: D3.mi, pool: p3, ...quick }).v;
  await until(() => d3.held && d3.held.kind !== 'checking');
  ok(!!d3.held && d3.held.kind === 'folder', 'RED CONTROL: the file removed at once and the home\'s copy kept (the first form) — the next start is HELD again: the decision did not last', d3.held);
  const D4 = await netIt('h1-start-new-stall'), m4 = path.join(D4.it.data, SW.START_NEW); fs.writeFileSync(m4, '');
  const d4 = start(D4.it, { mountinfo: D4.mi, pool: standIn('stall'), ...quick }).v;
  ok(!d4.held && fs.existsSync(m4), '…the home does not answer the removal: the start opens and the file STAYS — the next start acts again');
  // (7) r2901: a start NEVER HANDED A POOL (it could not be built; an embedding forgets it) never sits held and silent
  const G = await netIt('h1-no-pool');
  const g1 = start(G.it, { mountinfo: G.mi, ...quick }).v;
  await until(() => g1.held && g1.held.kind !== 'checking', 1000);
  const gb = api(g1).body;
  ok(g1.held.kind === 'unchecked' && gb.reason === 'unchecked' && gb.why.includes(G.home) && /could not start its check/.test(gb.why) && gb.fix.includes(SW.START_NEW), 'a start NEVER handed a pool: past the bound HELD «unchecked» — the check could not be started, said by name, with the act to decide now', gb);
  const RG = authCut('    const unstarted = setTimeout(() => {\n', '    const unstarted = false && setTimeout(() => {\n', 'no-pool-silent');
  const G2 = await netIt('h1-no-pool-red');
  const g2 = start(G2.it, { mountinfo: G2.mi, ...quick }, RG).v; await sleep(150);
  ok(!!g2.held && g2.held.kind === 'checking', 'RED CONTROL: no word for a pool that never came — held «checking» for ever, silent');
  // (5) NO synchronous read of the network home at a start: every sync fs call is watched while the start runs
  const E = await netIt('h1-sync'), seen = [];
  const NAMES = ['readFileSync', 'statSync', 'lstatSync', 'existsSync', 'readdirSync', 'openSync', 'readlinkSync', 'accessSync', 'realpathSync'];
  const watch = (fn) => { const keep = NAMES.map((n) => [n, fs[n]]); for (const [n, f0] of keep) fs[n] = function (p, ...r) { if (typeof p === 'string' && (p === E.it.home || p.startsWith(E.it.home + '/'))) seen.push(`${n} ${p}`); return f0.call(this, p, ...r); }; try { return fn(); } finally { for (const [n, f0] of keep) fs[n] = f0; } };
  watch(() => start(E.it, { mountinfo: E.mi, pool: standIn('stall'), ...quick }));
  ok(seen.length === 0, `NO synchronous call reaches the network home at a start (every sync fs call watched): ${seen.length}`, seen);
  const ME = swCut("  if (h.dir && h.via === 'home') out.push(h.dir);\n", "  out.push(String(home).replace(/\\/+$/, '') + '/.vibespace/local');\n", 'net-home-read-sync');
  seen.length = 0; watch(() => ME.startFactsSync({ dataDir: E.it.data, ...cfgOf(E.it, { mountinfo: E.mi }) }));
  ok(seen.length > 0, `RED CONTROL: the home rung read like a local one — a synchronous read of the network home (${seen.length})`);
  // (6) THE REAL WORKER POOL over a scratch home: the copy written off the loop after the sign-in file, read at the next start
  const { SafeFs } = require(path.join(REPO, 'src/safe-fs.js'));
  const pool = new SafeFs({ poolSize: 1, name: 'dc3f-witness-net' });
  try {
    const F = install('h1-real'), mi = nfsOf(F);
    const f0 = start(F, { mountinfo: mi, pool }).v;
    await until(() => !f0.held, 8000);
    quiet(() => f0.setPassword('pw-real-0001', { userSet: true })); await f0._netWrites;
    ok(!f0.held && fs.existsSync(witnessFile(F)) && JSON.parse(fs.readFileSync(witnessFile(F), 'utf-8')).id === idOf(F), 'THE REAL worker pool: the network home\'s copy written off the loop after the sign-in file (this folder\'s id)');
    fs.rmSync(varWitness(F), { force: true }); fs.renameSync(F.data, F.data + '.real'); fs.mkdirSync(F.data);
    const f1 = start(F, { mountinfo: mi, pool }).v;
    await until(() => f1.held && f1.held.kind !== 'checking', 8000);
    ok(!!f1.held && f1.held.kind === 'folder' && f1.held.witness === witnessFile(F), '…and read through the worker at the next start: the data folder missing ⇒ HELD by the network copy', f1.held);
  } finally { pool.close(); }
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
