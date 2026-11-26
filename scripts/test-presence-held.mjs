#!/usr/bin/env node
// test-presence-held — B-f276, package s1126 (lane login-request-card, 主开发 r4722): A STORE THAT DECIDED BY AN EXISTENCE CHECK,
// UNDER THE STORE-READ LAW. `fs.existsSync` answers false on ANY failure, so an I/O error read as «not there» and the next write
// went over what was there:
//   ① agy-subs/<account>/ (src/harnesses/antigravity.js): seedHomeRoot, run at every spawn of an Antigravity account, wrote the
//     machine's settings.json over the account's OWN (its allow rules), rewrote the account mark, unlinked a link whose machine file
//     only could not be read, and emptied the farm when the machine's HOME could not be listed; its sign-in stat answered «signed out»
//     for an unreadable login file
// THE LAW: ENOENT is the only «missing» (a first run); any other failure is UNREAD by its code — nothing is written, linked, removed
// on it, it is said once, and the next good read decides (the heal). The unreadable read is a PLACED refusal of the
// call for that one path (EIO), never a permission or a broken disk; existsSync is placed to answer what it answers on that failure
// (false) so the release's road is reproduced by its own call. No torn-bytes leg: the store is not parsed by us (the account's
// settings are the CLI's own file). The REDs are the release's lines planted back in copies
// (scripts/mutant-copy.mjs), each anchored (a gone anchor fails by name). In-process, a scratch HOME, no vendor call, no real CLI.
// Run: node scripts/test-presence-held.mjs
import { scratch, anchored } from './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { checker } from './lib/check.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { ok, report } = checker();
const ROOT = scratch('presence-held');
const M = mutantCopies('presence-held', REPO);

// ── THE PLACED REFUSALS: a call refused for ONE path (an absolute path → the calls refused there) ──
const EIO = (p) => Object.assign(new Error(`EIO: i/o error, a placed refusal (${path.basename(String(p))})`), { code: 'EIO' });
const real = { statSync: fs.statSync, existsSync: fs.existsSync, readdirSync: fs.readdirSync, rmSync: fs.rmSync, access: fs.promises.access, readFileSync: fs.readFileSync, writeFileSync: fs.writeFileSync };
const placed = new Map();
const hit = (p, call) => { if (typeof p !== 'string') return false; const s = placed.get(path.resolve(p)); return !!(s && s.has(call)); };
fs.statSync = function (p, ...a) { if (hit(p, 'stat')) throw EIO(p); return real.statSync.call(this, p, ...a); };
fs.existsSync = function (p) { if (hit(p, 'stat')) return false; return real.existsSync.call(this, p); };   // what it answers on that failure
fs.readdirSync = function (p, ...a) { if (hit(p, 'list')) throw EIO(p); return real.readdirSync.call(this, p, ...a); };
fs.rmSync = function (p, ...a) { if (hit(p, 'rm')) throw EIO(p); return real.rmSync.call(this, p, ...a); };
fs.promises.access = function (p, ...a) { if (hit(p, 'stat')) return Promise.reject(EIO(p)); return real.access.call(this, p, ...a); };
fs.readFileSync = function (p, ...a) { if (hit(p, 'read')) throw EIO(p); return real.readFileSync.call(this, p, ...a); };
fs.writeFileSync = function (p, ...a) { if (hit(p, 'write')) throw EIO(p); return real.writeFileSync.call(this, p, ...a); };
const place = (p, ...calls) => { placed.set(path.resolve(p), new Set(calls)); };
const lift = () => placed.clear();
const said = [];
const warn0 = console.warn, log0 = console.log;
console.warn = (...a) => { said.push(a.map(String).join(' ')); };
const HOME0 = process.env.HOME, FORCE0 = process.env.VIBESPACE_FORCE_AGENT_HOOKS;
const read = (f) => real.readFileSync(f, 'utf8');

try {
  log0('— ① agy-subs/<account>/: the account root seeded by the law (src/harnesses/antigravity.js)');
  const AG_REL = 'src/harnesses/antigravity.js';
  const AGSRC = read(path.join(REPO, AG_REL));
  const AG = require(path.join(REPO, AG_REL));
  const mutA = (anchor, to, name) => require(M.write(AG_REL, anchored(AGSRC, anchor, to, name), name.replace(/\W+/g, '-')));
  const MACHINE_SETTINGS = '{"from":"the machine"}\n';
  const OWN = '{"permissions":{"allow":["Bash(make test)"]}}\n';   // the account's own rule (an «Allow and retry» lands here)
  const world = (name) => {
    const machine = path.join(ROOT, name, 'machine'), root = path.join(ROOT, name, 'acct');
    const mcli = path.join(machine, '.gemini', 'antigravity-cli'), acli = path.join(root, '.gemini', 'antigravity-cli');
    fs.mkdirSync(mcli, { recursive: true });
    fs.writeFileSync(path.join(mcli, 'settings.json'), MACHINE_SETTINGS);
    fs.writeFileSync(path.join(mcli, 'hooks.json'), '{"from":"the machine\'s hooks"}\n');
    fs.writeFileSync(path.join(machine, '.gitconfig'), '[core]\n');
    fs.mkdirSync(path.join(machine, '.ssh'), { recursive: true });
    return { machine, root, sp: path.join(acli, 'settings.json'), mark: path.join(root, AG.ACCOUNT_MARK), hooksLink: path.join(acli, 'hooks.json'), machineHooks: path.join(mcli, 'hooks.json'), token: path.join(acli, 'antigravity-oauth-token') };
  };
  const linksOf = (d) => real.readdirSync(d).filter((n) => { try { return fs.lstatSync(path.join(d, n)).isSymbolicLink(); } catch { return false; } }).sort();
  ok(AGSRC.includes("const TOKEN_REL = path.join('.gemini', 'antigravity-cli', 'antigravity-oauth-token');"), 'PIN: the login file this suite stats is the module\'s own TOKEN_REL');

  const a = world('a');
  AG.seedHomeRoot(a.root, a.machine);
  ok(read(a.sp) === MACHINE_SETTINGS && real.existsSync(a.mark) && linksOf(a.root).includes('.gitconfig') && linksOf(a.root).includes('.ssh'),
    'FIRST RUN (ENOENT, the only «missing»): the account\'s settings.json is seeded from the machine\'s, the mark written, the farm linked');
  fs.writeFileSync(a.sp, OWN);
  fs.writeFileSync(a.mark, 'kept by the suite\n');
  said.length = 0;
  place(a.sp, 'stat'); place(a.mark, 'stat');
  let env = null;
  process.env.HOME = a.machine;   // the spawn's own road: creds.spawnEnv seeds from the machine HOME
  try { env = AG.creds.spawnEnv(a.root); AG.seedHomeRoot(a.root, a.machine); } finally { process.env.HOME = HOME0; lift(); }
  ok(read(a.sp) === OWN && read(a.mark) === 'kept by the suite\n' && !!env && env.HOME === a.root,
    'UNREAD (a placed EIO on the stat of the account\'s settings.json and of its mark): a spawn\'s seed and a second seed write NOTHING over them — both byte for byte, the spawn env still answered', { sp: read(a.sp), mark: read(a.mark), env });
  const named = said.filter((l) => /could not be read \(EIO\)/.test(l));
  ok(named.length === 2 && named.some((l) => l.includes(a.sp)) && named.some((l) => l.includes(a.mark)),
    'SAID BY NAME, ONCE A PATH: one line for each unread path with its code (two seeds, two lines)', said);

  place(a.machineHooks, 'stat');
  try { AG.seedHomeRoot(a.root, a.machine); } finally { lift(); }
  let link = null; try { link = fs.lstatSync(a.hooksLink).isSymbolicLink() ? fs.readlinkSync(a.hooksLink) : 'not a link'; } catch (e) { link = `gone (${e.code})`; }
  ok(link === a.machineHooks, 'UNREAD (the machine\'s hooks.json): the account\'s link to it is KEPT', { link });

  const before = linksOf(a.root);
  place(a.machine, 'list');
  try { AG.seedHomeRoot(a.root, a.machine); } finally { lift(); }
  const after = linksOf(a.root);
  ok(before.length >= 2 && JSON.stringify(after) === JSON.stringify(before), 'UNREAD (the machine HOME could not be listed): the farm is kept as it is, every link stays', { before, after });

  AG.seedHomeRoot(a.root, a.machine);
  ok(read(a.sp) === OWN && read(a.mark) === 'kept by the suite\n', 'HEAL: the next good read keeps the account\'s own settings and its mark (there ⇒ kept)');
  fs.rmSync(a.sp);
  AG.seedHomeRoot(a.root, a.machine);
  ok(read(a.sp) === MACHINE_SETTINGS, 'HEAL: a settings.json truly gone (ENOENT) is a first run again, seeded from the machine\'s');
  // the adversarial read's find: the MACHINE's settings unread at the account's first spawn seeded «{}» as the account's own — never
  // seeded from the machine again (a file there is kept)
  const f = world('f'), machineSp = path.join(f.machine, '.gemini', 'antigravity-cli', 'settings.json');
  said.length = 0;
  place(machineSp, 'read');
  try { AG.seedHomeRoot(f.root, f.machine); } finally { lift(); }
  ok(!real.existsSync(f.sp) && said.filter((l) => l.includes(machineSp) && /could not be read \(EIO\)/.test(l)).length === 1,
    'UNREAD (a placed EIO on the read of the MACHINE\'s settings at the account\'s first spawn): nothing is seeded, said by name', { there: real.existsSync(f.sp), said });
  AG.seedHomeRoot(f.root, f.machine);
  ok(read(f.sp) === MACHINE_SETTINGS, 'HEAL: the next spawn that reads it seeds the machine\'s copy');

  const t = world('t');
  AG.seedHomeRoot(t.root, t.machine);
  const absent = AG.parseAgyAuthDir(t.root);
  place(t.token, 'stat');
  let unread = null; try { unread = AG.parseAgyAuthDir(t.root); } finally { lift(); }
  fs.writeFileSync(t.token, 'x'.repeat(16));
  const signed = AG.parseAgyAuthDir(t.root);
  ok(absent.loggedIn === false && absent.absent === true && !('unread' in absent), 'THE READER: no login file (ENOENT) ⇒ signed out, said `absent`', absent);
  ok(!!unread && unread.loggedIn === false && unread.unread === 'EIO' && !unread.absent, 'THE READER: a login file whose stat failed ⇒ `unread` with its code, never `absent`', unread);
  ok(signed.loggedIn === true, 'THE READER: a login file there ⇒ signed in, as on the release', signed);
  const seedText = AGSRC.slice(AGSRC.indexOf('function seedHomeRoot('), AGSRC.indexOf('\n}\n', AGSRC.indexOf('function seedHomeRoot(')));
  ok(seedText.length > 200 && !seedText.includes('existsSync('), 'PIN: seedHomeRoot asks no existsSync (each existence it acts on goes through presenceOf)', seedText.length);

  // REDs: the release's lines planted back
  const PRESENCE = "  try { fs.statSync(p); return { state: 'there' }; } catch (error) { const a = SR.storeAnswer({ error }); return a.state === 'missing' ? { state: 'missing' } : { state: 'unreadable', code: a.code }; }";
  const AGR = mutA(PRESENCE, "  return fs.existsSync(p) ? { state: 'there' } : { state: 'missing' };", 'the release existsSync');
  { const r = world('red'); AGR.seedHomeRoot(r.root, r.machine); fs.writeFileSync(r.sp, OWN); place(r.sp, 'stat');
    try { AGR.seedHomeRoot(r.root, r.machine); } finally { lift(); }
    ok(read(r.sp) === MACHINE_SETTINGS, 'RED (the release\'s existsSync planted back): the same placed EIO WRITES the machine\'s settings over the account\'s own — its allow rule lost', read(r.sp)); }
  const LIST = "    if (a.state !== 'missing') { saidUnread(real, a.code, 'the folder the account mirrors'); return; }";
  const AGL = mutA(LIST, '', 'an unlisted HOME read as empty');
  { const r = world('redl'); AGL.seedHomeRoot(r.root, r.machine); const b = linksOf(r.root); place(r.machine, 'list');
    try { AGL.seedHomeRoot(r.root, r.machine); } finally { lift(); }
    const af = linksOf(r.root);
    ok(b.length >= 2 && af.length < b.length, 'RED (an unlisted HOME read as an empty one): the farm\'s links are unlinked', { b, af }); }
  const AGM = mutA('    if (machineUnread) saidUnread(', '    if (false) saidUnread(', 'the machine settings unread seeded as none');
  { const r = world('redm'), msp = path.join(r.machine, '.gemini', 'antigravity-cli', 'settings.json'); place(msp, 'read');
    try { AGM.seedHomeRoot(r.root, r.machine); } finally { lift(); }
    ok(real.existsSync(r.sp) && read(r.sp) === '{}\n', 'RED (the release\'s silent catch): the unread machine settings seed «{}» as the account\'s own', real.existsSync(r.sp) ? read(r.sp) : 'none'); }
  const READER = "  return failed && failed.state === 'missing' ? { loggedIn: false, absent: true } : failed ? { loggedIn: false, unread: failed.code } : { loggedIn: false };";
  const AGT = mutA(READER, '  return { loggedIn: false };', 'the release reader');
  { const r = world('redt'); AGT.seedHomeRoot(r.root, r.machine); const ab = AGT.parseAgyAuthDir(r.root); place(r.token, 'stat');
    let un = null; try { un = AGT.parseAgyAuthDir(r.root); } finally { lift(); }
    ok(JSON.stringify(ab) === JSON.stringify(un), 'RED (the release\'s reader): a missing login file and an unreadable one answer the same', { ab, un }); }

} finally {
  fs.statSync = real.statSync; fs.existsSync = real.existsSync; fs.readdirSync = real.readdirSync; fs.rmSync = real.rmSync; fs.promises.access = real.access; fs.readFileSync = real.readFileSync; fs.writeFileSync = real.writeFileSync;
  console.warn = warn0;
  if (HOME0 === undefined) delete process.env.HOME; else process.env.HOME = HOME0;
  if (FORCE0 === undefined) delete process.env.VIBESPACE_FORCE_AGENT_HOOKS; else process.env.VIBESPACE_FORCE_AGENT_HOOKS = FORCE0;
}
report();
