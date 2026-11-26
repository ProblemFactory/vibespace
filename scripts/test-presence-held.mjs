#!/usr/bin/env node
// test-presence-held — B-f276, package s1126 (lane login-request-card, 主开发 r4722): TWO STORES THAT DECIDED BY AN EXISTENCE CHECK,
// UNDER THE STORE-READ LAW. `fs.existsSync` answers false on ANY failure, so an I/O error read as «not there» and the next write
// went over what was there:
//   ① agy-subs/<account>/ (src/harnesses/antigravity.js): seedHomeRoot, run at every spawn of an Antigravity account, wrote the
//     machine's settings.json over the account's OWN (its allow rules), rewrote the account mark, unlinked a link whose machine file
//     only could not be read, and emptied the farm when the machine's HOME could not be listed; its sign-in stat answered «signed out»
//     for an unreadable login file
//   ② data/.agent-hooks-optout (src/server/agent-tool-generators.js, server.js): a start whose read of the mark failed WROTE BACK
//     the hooks a person had removed, every run of this machine's config carried our hook rows (hooksWanted), the status said «not
//     opted out», and an Install whose removal of the mark failed installed (the next start stripped it again)
// THE LAW: ENOENT is the only «missing» (a first run); any other failure is UNREAD by its code — nothing is written, linked, removed
// or registered on it, it is said once, and the next good read decides (the heal). The unreadable read is a PLACED refusal of the
// call for that one path (EIO), never a permission or a broken disk; existsSync is placed to answer what it answers on that failure
// (false) so the release's road is reproduced by its own call. No torn-bytes leg: neither store is parsed by us (the account's
// settings are the CLI's own file; the mark's presence is the fact). The REDs are the release's lines planted back in copies
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
let worldN = 0;

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

  log0('— ② data/.agent-hooks-optout: the opt-out mark by the law (src/server/agent-tool-generators.js, server.js)');
  const G_REL = 'src/server/agent-tool-generators.js';
  const GSRC = read(path.join(REPO, G_REL));
  const GM = require(path.join(REPO, G_REL));
  const mutG = (anchor, to, name) => require(M.write(G_REL, anchored(GSRC, anchor, to, name), name.replace(/\W+/g, '-')));
  const home = path.join(ROOT, 'home'); fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  process.env.HOME = home; process.env.VIBESPACE_FORCE_AGENT_HOOKS = '1';   // a scratch HOME: the generators write only there
  const genWorld = async (Gmod, name) => {
    const rootDir = path.join(ROOT, name); fs.mkdirSync(path.join(rootDir, 'data'), { recursive: true });
    const applied = [];
    const G = Gmod.create({ rootDir, port: 0, applyThisMachine: (o) => { applied.push({ reason: o.reason, hooks: !!o.hooks, strip: !!o.strip }); return Promise.resolve({ ok: true, receipts: [], created: [], after: {} }); },
      homeRead: (fn) => Promise.resolve().then(fn).then((value) => ({ value }), (error) => ({ error })) });
    if (typeof G.rootFactsNow === 'function') await G.rootFactsNow();
    return { G, applied, mark: G.HOOK_OPTOUT_FILE };
  };
  const PERSON = 'opted out by the person\n';
  {
    const { G, applied, mark } = await genWorld(GM, 'gen-a');
    fs.writeFileSync(mark, PERSON);
    ok(G.optOutMarkNow() === 'opted-out' && (await G.optOutMark()) === 'opted-out', 'THE MARK THERE ⇒ opted out (the start\'s reader and the synchronous one)');
    said.length = 0;
    place(mark, 'stat');
    let st = null, now = null, status = null;
    try { st = await G.ensureAgentHooks({ auto: true }); now = G.optOutMarkNow(); status = await G.agentHooksStatus(); } finally { lift(); }
    ok(!!st && st.skipped === true && st.optOutUnread === 'EIO' && st.optedOut === true && /opt-out mark could not be read \(EIO\)/.test(st.error || '') && applied.length === 0,
      'UNREAD (a placed EIO on the mark): the start decides at its call and registers NOTHING, removes nothing — no run of this machine\'s config is asked; its answer says why', { st, applied });
    // the answer's readers say it by name (the adversarial read's must): the switch's answer, the Apply press, the hook-root watch
    const LA = require(path.join(REPO, 'src/server/landing-answer.js'));
    ok(/opt-out mark could not be read \(EIO\)/.test(LA.notLanded(st) || ''), 'THE SWITCH\'s ANSWER says why (landing-answer notLanded), never a bare «skipped»', LA.notLanded(st));
    const routes = {}, app = { post: (p, h) => { routes[p] = h; } };
    require(path.join(REPO, 'src/server/hooks-late.js')).create({ activeSessions: new Map(), getSessionStatus: () => null, getUserTodos: () => null, sessionStatusKey: () => '', harnesses: { get: () => null, list: () => [] } })
      .registerApplyRoute(app, { ensureAgentHooks: () => st, agentHooksStatus: async () => ({}), integrationEnabled: () => true, harnessConfig: { syncCliConfig: async () => ({}), cliConfigStatus: async () => ({}) }, hookRegistrationSafe: () => true });
    const out = {}, res = { status: (c) => { out.code = c; return res; }, json: (j) => { out.body = j; return res; } };
    await routes['/api/cli-config/apply']({ body: {} }, res);
    ok(!!out.body && out.body.ok === false && /opt-out mark could not be read \(EIO\)/.test(out.body.error || ''), 'THE APPLY PRESS says it by name (hooks-late), never «applied» over a mark it could not read', out.body && { ok: out.body.ok, error: out.body.error });
    const RW_REL = 'src/server/hook-root-watch.js', RWSRC = read(path.join(REPO, RW_REL));
    const watchOn = async (RW) => { const d = path.join(ROOT, `rw-${++worldN}`); fs.mkdirSync(d, { recursive: true }); const timers = [];
      const w = RW.create({ dataDir: d, ensureAgentHooks: () => st, rootRecovery: () => null, ownerWriteRefusal: () => null, serverNotice: () => 1, setTimer: (fn, ms) => { timers.push(ms); return { unref() {} }; } });
      await w.sync(); return timers.length; };
    ok((await watchOn(require(path.join(REPO, RW_REL)))) === 1, 'THE HOOK-ROOT WATCH reads it again (its backoff armed) — never left until the six-hourly probe');
    const RWX = require(M.write(RW_REL, anchored(RWSRC, ' && (r.settingsHeld || r.optOutUnread)) arm();', ' && r.settingsHeld) arm();', 'the watch reading a held settings skip only'), 'rw-held-only'));   // stale-pins: kept (the release's line, planted back for the red)
    ok((await watchOn(RWX)) === 0, 'RED (the watch\'s release line): an unread mark is never read again by the backoff');
    ok(!!now && now.unread === 'EIO', 'server.js\'s synchronous callers get the same answer, unread by its code: hooksWanted is false (a run carries no hook rows) and the health probe returns', now);
    ok(!!status && status.optedOut === true && status.optOutUnread === 'EIO', 'THE STATUS: unread answers as the start acts on it (nothing will be created: no «will be created at the next start») and says why', status && { optedOut: status.optedOut, optOutUnread: status.optOutUnread });
    ok(read(mark) === PERSON, 'the mark byte for byte after every reader and writer was asked');
    ok(said.filter((l) => /opt-out mark .* could not be read \(EIO\)/.test(l)).length === 1, 'SAID ONCE by its code (three asks, one line)', said);
  }
  {
    const { G, applied, mark } = await genWorld(GM, 'gen-b');
    fs.writeFileSync(mark, PERSON);
    place(mark, 'rm');
    let inst = null; try { inst = await G.ensureAgentHooks({ auto: false }); } finally { lift(); }
    const answers = Object.values(inst || {});
    ok(answers.length >= 1 && answers.every((x) => !!x && x.ok === false && /could not be removed \(EIO\)/.test(x.error || '')) && applied.length === 0 && read(mark) === PERSON,
      'THE INSTALL whose removal of the mark FAILED (a placed EIO on its rm): nothing installed, each CLI told why by name, the mark as it was', { inst, applied });
  }
  {
    const { G, applied, mark } = await genWorld(GM, 'gen-c');
    fs.writeFileSync(mark, PERSON);
    const opted = await G.ensureAgentHooks({ auto: true });   // the scratch HOME holds none of our rows: nothing to remove
    const n0 = applied.length;
    fs.rmSync(mark);
    await G.ensureAgentHooks({ auto: true });
    ok(!!opted && opted.optedOut === true && n0 === 0, 'HEAL — the mark read: opted out, nothing registered', { opted, applied });
    ok(applied.filter((x) => x.reason === 'hooks' && x.hooks && !x.strip).length === 1 && G.optOutMarkNow() === 'not', 'HEAL — the mark truly absent (ENOENT, the only «no»): the start registers once', { applied });
  }
  {
    const { G, applied, mark } = await genWorld(GM, 'gen-d');
    place(mark, 'write');
    let rm = null; try { rm = await G.removeAgentHooks(); } finally { lift(); }
    ok(!!rm && rm.ok === false && /could not be written \(EIO\)/.test(rm.why || '') && applied.length === 0 && !real.existsSync(mark),
      'THE REMOVE whose mark could not be WRITTEN (a placed EIO; the adversarial read\'s find): nothing removed, said by name (the route\'s «the removal did not land»)', { rm, applied });
  }
  const ANSWER = "const optOutAnswer = (error) => { const a = SR.storeAnswer({ error }); if (a.state === 'missing') return 'not';";
  const GR = mutG(ANSWER, "const optOutAnswer = (error) => { const a = SR.storeAnswer({ error }); if (a) return 'not';", 'every failure read as no mark');
  { const { G, applied, mark } = await genWorld(GR, 'gen-red'); fs.writeFileSync(mark, PERSON); place(mark, 'stat');
    try { await G.ensureAgentHooks({ auto: true }); } finally { lift(); }
    ok(applied.some((x) => x.hooks && !x.strip), 'RED (the release\'s reading — a failed read is «no mark»): the same placed EIO REGISTERS the hooks the person removed', { applied }); }
  const STUCK = "  if (!auto) { try { fs.rmSync(HOOK_OPTOUT_FILE, { force: true }); } catch (e) { return Promise.resolve(optOutMarkStuck(e)); } }";
  const GS2 = mutG(STUCK, '  if (!auto) { try { fs.rmSync(HOOK_OPTOUT_FILE, { force: true }); } catch {} }', 'the release silent catch');   // stale-pins: kept (the release's line, planted back for the red)
  { const { G, applied, mark } = await genWorld(GS2, 'gen-red2'); fs.writeFileSync(mark, PERSON); place(mark, 'rm');
    try { await G.ensureAgentHooks({ auto: false }); } finally { lift(); }
    ok(applied.some((x) => x.hooks) && real.existsSync(mark), 'RED (the release\'s silent catch): the Install installs with the mark left behind — the next start strips it', { applied }); }
  const WRITE = "} catch (e) { const why = `the opt-out mark could not be written (";
  const GW = mutG(WRITE, "} catch (e) { } if (0) { const why = `the opt-out mark could not be written (", 'the release silent catch of the mark write');
  { const { G, applied, mark } = await genWorld(GW, 'gen-red3'); place(mark, 'write');
    try { await G.removeAgentHooks(); } finally { lift(); }
    ok(applied.some((x) => x.strip) && !real.existsSync(mark), 'RED (the release\'s silent catch): the Remove strips with no mark written — the next start puts the hooks back', { applied }); }
  const SV = read(path.join(REPO, 'server.js'));
  ok(SV.includes("hooksWanted: () => integrationEnabled() && optOutMarkNow() === 'not',") && SV.includes("|| optOutMarkNow() !== 'not') return;") && !SV.includes('HOOK_OPTOUT_FILE'),
    'WIRING: server.js asks the mark only through the generators\' answer — a run carries hook rows only on «not» (ENOENT), the health probe returns on anything else; no existsSync of the mark is left there');
  ok(!GSRC.includes('existsSync(HOOK_OPTOUT_FILE)'), 'no existsSync of the mark is left in the generators');   // stale-pins: kept (an absence check)
} finally {
  fs.statSync = real.statSync; fs.existsSync = real.existsSync; fs.readdirSync = real.readdirSync; fs.rmSync = real.rmSync; fs.promises.access = real.access; fs.readFileSync = real.readFileSync; fs.writeFileSync = real.writeFileSync;
  console.warn = warn0;
  if (HOME0 === undefined) delete process.env.HOME; else process.env.HOME = HOME0;
  if (FORCE0 === undefined) delete process.env.VIBESPACE_FORCE_AGENT_HOOKS; else process.env.VIBESPACE_FORCE_AGENT_HOOKS = FORCE0;
}
report();
