#!/usr/bin/env node
// test-cli-config-runner — B-ddf3 unit 2, LINE 1 (lane bl-scratch, the coordinator's r1404 / r1407). THE HUB'S OWN MACHINE IS
// WRITTEN BY THE SHIPPED HELPER through the starter (src/server/cli-config-runner.js), never by the hub's own process. FAST,
// in-process; the real helper (data/bin/vibespace-hook-register.mjs, as the generator writes it) runs on a scratch HOME through a
// stand-in starter that starts it with this node, as the starter does.
//   ① ONE APPLY IN FLIGHT, THE NEWEST WAITING: requests made during a run coalesce into the NEXT run, with the newest plan; each
//     resolves at the landing of a run that started after it.             RED: the queue's guard taken out (two runs at once)
//   ② NO SECOND WRITER: a starter that does not answer is a FAILED landing, said by name; the next request asks again.
//   ③ the spawn gate (harness-config-sync startGate, r1407 (a)): landed → null; a run past the bound → late; a failed last
//     landing → asked again, then failed; nothing asked → null.         RED: a gate that never waits
//   ④ THE REAL HELPER on a scratch HOME: our hooks + the managed keys written by ONE run; the file the CLI never wrote is
//     reported created (read off the loop); a second run creates nothing.
//   ⑤ (f) THE ENV: argv is the helper's path only; envAdd holds VIBESPACE_CLI_CONFIG and HOME — nothing else, no secret shape.
//   ⑥ (e) THE HOOK COMMAND REWRITTEN ONCE: a stored command naming another node is rewritten to the stable spelling — and
//     nothing else in the file moves (compared key by key).
//   ⑦ (b) THE SETTINGS ANSWER AT THE LANDING (src/server/landing-answer.js): landed / failed / still writing past the bound /
//     refused, each by name; no landing → the plain answer.             RED: an answer that never waits
//   ①d–①l THE RUNNER'S BOUNDS (stalled, slow and released homes; one read out per class): scripts/test-cli-config-runner-bounds.mjs
//     (r2740: split out word for word, the fast file sat near the tier's 10 s) — the PIN below holds every leg there.
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { checker } from './lib/check.mjs';
import { scratch, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { ok, report, counts } = checker();
const SKIPPED = [];   // r3784 (5): a skip is not a green — each skipped leg is named in the CLOSING line (the house form «ALL PASS (n, 1 skipped — …)»)
const ROOT = scratch('cli-config-runner');
fs.mkdirSync(ROOT, { recursive: true });
const MC = mutantCopies('cli-config-runner', REPO);
const tick = () => new Promise((r) => setImmediate(r));
const KEEP = setInterval(() => {}, 60000);   // the runner's bound timers are unref'd (a hub's loop is alive anyway): this run's own is not
const RUNNER_REL = 'src/server/cli-config-runner.js', SYNC_REL = 'src/server/harness-config-sync.js', ANSWER_REL = 'src/server/landing-answer.js';
const src = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

// a starter whose runs the suite finishes by hand (the queue's legs), recording every request
function handStarter() {
  const calls = [], live = new Set();
  let most = 0;
  return { calls, most: () => most, run: (cmd, args, o) => new Promise((resolve) => { const c = { cmd, args, o, finish: (r) => { live.delete(c); resolve(r); } }; calls.push(c); live.add(c); most = Math.max(most, live.size); }) };
}
const okRun = { started: true, code: 0, stdout: 'CFG|claude|transcriptRetentionDays|unchanged|%2236500%22|%2236500%22|null\n', stderr: '' };

async function queueLegs(R) {
  const st = handStarter(), r = R.createCliConfigRunner({ starter: st, helperPath: '/x/helper.mjs', stat: async () => { throw new Error('none'); }, journal: () => {}, warn: () => {} });
  const a = r.apply(() => 'PLAN-A', 'a'), b = r.apply(() => 'PLAN-B', 'b'), c = r.apply(() => 'PLAN-C', 'c');
  await tick();
  const first = st.calls.length;
  st.calls[0].finish(okRun); await tick(); await tick();
  const second = st.calls.length, plan2 = st.calls[1] && st.calls[1].o.envAdd.VIBESPACE_CLI_CONFIG;
  // every run started is finished (a red copy starts one per request), and the wait is bounded: a leg never hangs the suite
  for (let k = 0; k < 3; k++) { for (const call of st.calls) call.finish(okRun); await tick(); }
  const all = await Promise.race([Promise.all([a, b, c]), new Promise((r) => setTimeout(() => r(null), 5000))]);
  const [la, lb, lc] = all || [];
  return { first, second, plan2, most: st.most(), same: !!all && lb === lc && la !== lb, settled: !!all };
}

console.log('① one apply in flight, the newest waiting');
const R = require(path.join(REPO, RUNNER_REL));
{
  const q = await queueLegs(R);
  ok(q.first === 1 && q.second === 2 && q.plan2 === 'PLAN-C' && q.most === 1 && q.same, 'three quick requests: ONE run in flight, the two waiting ones coalesce into the next run with the NEWEST plan, never two runs at once', q);
  const M = require(MC.write(RUNNER_REL, anchored(src(RUNNER_REL), '    if (inFlight || !queue.length) return;', '    if (!queue.length) return;', 'two runs at once'), 'two-at-once'));
  const qm = await queueLegs(M);
  ok(qm.most > 1, 'RED (the queue\'s guard taken out): two helper runs at once on one file', qm);
}

console.log('①b r1518 (the full round\'s must): a request is NEVER replaced by one of another kind — each kind asked runs, in order');
// THE TIP's MERGE (c90929dc8): one waiting slot, the newest request's kind written over the waiting one's — rebuilt for the red
const TAIL = '      if (tail && tail.kind === kind) { tail.planOf = planOf; tail.reason = reason; if (before) tail.before = before; if (after) tail.after = after; tail.whens.push(when); tail.resolvers.push(resolve); return; }';
const MERGED = '      if (tail) { tail.kind = kind; tail.uninstall = uninstall; tail.planOf = planOf; tail.reason = reason; if (before) tail.before = before; if (after) tail.after = after; tail.whens.push(when); tail.resolvers.push(resolve); return; }';   // stale-pins: kept (the tip's merge, rebuilt for the red control)
async function kindLegs(Rm) {
  const st = handStarter(), r = Rm.createCliConfigRunner({ starter: st, helperPath: '/x/helper.mjs', stat: async () => { throw new Error('none'); }, journal: () => {}, warn: () => {} });
  const inflight = r.apply(() => 'PLAN-0', 'a save', { kind: 'apply' });
  await tick();
  const strip = r.apply(() => 'PLAN-S', 'hooks removed', { uninstall: true }), save = r.apply(() => 'PLAN-A', 'settings change', { kind: 'apply' });
  for (let k = 0; k < 4; k++) { for (const call of st.calls) call.finish(okRun); await tick(); }
  const all = await Promise.race([Promise.all([inflight, strip, save]), new Promise((res) => setTimeout(() => res(null), 5000))]);
  return { runs: st.calls.map((c) => (c.args.includes('--uninstall') ? 'strip' : 'apply') + ':' + c.o.envAdd.VIBESPACE_CLI_CONFIG), kinds: all ? all.map((l) => l.kind) : null };
}
{
  const k = await kindLegs(R);
  ok(JSON.stringify(k.runs) === JSON.stringify(['apply:PLAN-0', 'strip:PLAN-S', 'apply:PLAN-A']) && JSON.stringify(k.kinds) === JSON.stringify(['apply', 'strip', 'apply']),
    'a removal waiting behind a run, then a save: BOTH run, in the order asked (the strip with --uninstall), and each caller is told by a run of its OWN kind', k);
  const km = await kindLegs(require(MC.write(RUNNER_REL, anchored(src(RUNNER_REL), TAIL, MERGED, 'the tip\'s merge'), 'tip-merge')));
  ok(!km.runs.some((x) => x.startsWith('strip')) && km.kinds && km.kinds[1] === 'apply', 'RED (the tip\'s merge): the removal is REPLACED by the save — no --uninstall run, and the removal\'s caller is told «landed» by a run of another kind', km);
}

console.log('② no second writer: a starter that does not answer is a failed landing, said; asked again next time');
{
  let n = 0;
  const r = R.createCliConfigRunner({ starter: { run: async () => { n++; return { unknown: true, why: 'no starter' }; } }, helperPath: '/x/h.mjs', stat: async () => { throw new Error('none'); }, journal: () => {}, warn: () => {} });
  const l1 = await r.apply(() => 'P', 'boot'), l2 = await r.apply(() => 'P', 'again');
  ok(!l1.ok && /the starter did not answer/.test(l1.why) && /nothing was written by this hub/.test(l1.why) && n === 2 && !l2.ok, 'the landing FAILS by name («the starter did not answer … nothing was written by this hub»), and the next request asks the starter again', { l1, n });
  const code = (rel) => src(rel).replace(/\/\/[^\n]*/g, ''), APPLIER = /\b(?:applyConfigPlan|writeJsonManaged|writeTomlManaged|ensureCliConfig)\b/;   // the code, its comments set aside
  ok(!APPLIER.test(code(RUNNER_REL)) && !APPLIER.test(code(SYNC_REL)), 'there is no in-process writer to fall back to: neither the runner nor harness-config-sync calls the applier');
}

console.log('③ the spawn gate (r1407 (a)): it waits within the bound, then the start goes on and says it');
async function gateLegs(Sync) {
  const out = {};
  const mk = (starter) => Sync.create({ serverSetting: () => undefined, harnesses: require(path.join(REPO, 'src/harnesses/index.js')), adapterRegistry: { get: () => null }, activeSessions: new Map(), hookRegistrationSafe: () => true, runner: R.createCliConfigRunner({ starter, helperPath: '/x/h.mjs', boundMs: 60, stat: async () => { throw new Error('none'); }, journal: () => {}, warn: () => {} }), log: () => {}, warn: () => {} });
  out.nothingAsked = await mk({ run: async () => okRun }).startGate();
  { const s = mk({ run: async () => okRun }); s.syncCliConfig({ reason: 'boot' }); out.landed = await s.startGate(); }
  { const s = mk({ run: () => new Promise(() => {}) }); s.syncCliConfig({ reason: 'boot' }); out.late = await s.startGate(); }
  { let n = 0; const s = mk({ run: async () => { n++; return { started: true, code: 1, stdout: '', stderr: 'EIO' }; } }); await s.syncCliConfig({ reason: 'boot' }); out.failed = await s.startGate(); out.asked = n; }
  return out;
}
{
  const Sync = require(path.join(REPO, SYNC_REL));
  const g = await gateLegs(Sync);
  ok(g.nothingAsked === null && g.landed === null, 'landed → the start goes on (null); nothing asked (a refused or skipped server) → no wait (null)', g);
  ok(!!g.late && g.late.late === true && /did not land within 60 ms/.test(g.late.why), 'a run past the bound → the start is told «late» at the bound, never refused', g);
  ok(!!g.failed && g.failed.failed === true && /exited 1/.test(g.failed.why) && g.asked === 2, 'a FAILED last landing is asked again by the start, and said failed by name', g);
  const M = require(MC.write(SYNC_REL, anchored(src(SYNC_REL), "return cliRunner.landedWithin(cliRunner.BOUND_MS).then((g) => (g.landed ? null : { ...g, cause: g.why || (g.late ? 'late' : 'failed'), spell: landedSpell }));", 'return Promise.resolve(null);', 'a gate that never waits'), 'no-wait'));
  const gm = await gateLegs(M);
  ok(gm.late === null, 'RED (a gate that never waits): the late start is never told', gm);
  const wc = src('src/ws-create.js'), sfw = src('src/settings-file-words.js');
  const gateAt = wc.indexOf('const cliLate = '), buildAt = wc.indexOf('const sessionSpec = adapter.buildSessionArgs({');
  ok(gateAt > 0 && gateAt < buildAt && /await Promise\.resolve\(cliConfigGate\(\)\)/.test(wc) && /serverNotice\?\.\(`cli-config-late-\$\{cliLate\.spell \|\| 0\}-\$\{causeKey\}`, w\.replace/.test(wc) && /CLI_CONFIG_LATE_WORDS/.test(wc),
    'WIRING: a local start awaits the gate BEFORE its args are built, and a late / failed gate is said once, by name (cli-config-late-<id>)');
  const words = require(path.join(REPO, 'src/settings-file-words.js')).CLI_CONFIG_LATE_WORDS;
  ok(/\{name\}/.test(words) && /\{why\}/.test(words) && src('src/lib/i18n-zh.js').includes(JSON.stringify(words)) && src('src/lib/i18n-ja.js').includes(JSON.stringify(words)) && sfw.includes('CLI_CONFIG_LATE_WORDS'), 'the words name the conversation and the why, in zh and ja');
}

console.log('①c r1675: a request\'s own check of the files runs INSIDE its job — before the next queued request starts');
async function afterLegs(Rm) {
  const order = [], st = handStarter(), r = Rm.createCliConfigRunner({ starter: { run: (cmd, args, o) => { order.push('run ' + o.envAdd.VIBESPACE_CLI_CONFIG); return st.run(cmd, args, o); } }, helperPath: '/x/helper.mjs', stat: async () => { throw new Error('none'); }, journal: () => {}, warn: () => {} });
  const first = r.apply(() => 'PLAN-0', 'a save', { kind: 'apply' });
  await tick();
  const strip = r.apply(() => 'PLAN-S', 'hooks removed', { uninstall: true, after: async () => { await tick(); await tick(); order.push('check of PLAN-S'); return ['read'] } });
  const reg = r.apply(() => 'PLAN-R', 'hooks (asked)', { kind: 'apply+hooks' });
  for (let k = 0; k < 8; k++) { for (const call of st.calls) call.finish(okRun); await tick(); }
  const all = await Promise.race([Promise.all([first, strip, reg]), new Promise((res) => setTimeout(() => res(null), 5000))]);
  return { order, after: all && all[1].after };
}
{
  const a = await afterLegs(R);
  ok(a.order.indexOf('check of PLAN-S') >= 0 && a.order.indexOf('check of PLAN-S') < a.order.indexOf('run PLAN-R') && JSON.stringify(a.after) === '["read"]',
    'Remove then Install inside one run: the removal\'s check reads the files BEFORE the registration\'s helper starts, its answer on its own landing', a);
  const AFTER = '        const a = homeStuck > 0 ? { held: true } : await bounded(() => job.after(landing));';
  const am = await afterLegs(require(MC.write(RUNNER_REL, anchored(src(RUNNER_REL), AFTER, '        inFlight = null; pump(); const a = homeStuck > 0 ? { held: true } : await bounded(() => job.after(landing));', 'the check after the queue moved on'), 'after-late')));
  ok(am.order.indexOf('run PLAN-R') >= 0 && am.order.indexOf('run PLAN-R') < am.order.indexOf('check of PLAN-S'), 'RED (the check after the queue moved on — the cure\'s form): the registration\'s helper runs BEFORE the removal\'s check reads the files', am);
}

console.log('①d–①l THE RUNNER\'S BOUND LEGS live in scripts/test-cli-config-runner-bounds.mjs (r2740: split out word for word; this file keeps the pin)');
const HCJ = require(path.join(REPO, 'src/harness-config.js'));
const planAt = (dir) => HCJ.encodePlan({ v: 1, files: [{ harness: 'claude', id: 'settings', rel: [dir, 'settings.json'], format: 'json', set: [] }] });
{
  const TWIN_REL = 'scripts/test-cli-config-runner-bounds.mjs', twin = fs.existsSync(path.join(REPO, TWIN_REL)) ? src(TWIN_REL) : '';
  const MOVED = ['①d r1813', '①e r1876', '①f r1876', '①g r2109', '①h r2224 (3)', '①i r2224 (2)', '①k r2513 (1)', '①l r2592 (2)', '①j r2224 (5)'];
  // the reader's find: a header alone is no leg — read past comment lines, the twin's CHECKS are counted too (20 at the split: a
  // floor, so a later leg may join it), and the scratch import is the twin's FIRST import, not merely one of them
  const code = twin.split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');
  const missing = MOVED.filter((h) => !code.includes(`console.log('${h}`)), checks = code.split(/\bok\(/).length - 1, firstImport = (code.match(/^import .*$/m) || [''])[0];
  ok(!!(twin && !missing.length && checks >= 20 && firstImport === "import './scratch.mjs';" && src('scripts/ci.mjs').includes("{ name: 'test-cli-config-runner-bounds', tier: 'fast',")),
    'PIN (r2740): every runner-bound leg (①d ①e ①f ①g ①h ①i ①k ①l ①j) lives in the twin with its checks (20 at the split), which runs in the fast tier with the scratch import first', { missing, checks, firstImport });
}

console.log('④⑤⑥ the REAL helper on a scratch HOME — one run, created read off the loop, the env, the hook command key by key');
{
  const home = path.join(ROOT, 'home'); fs.mkdirSync(path.join(home, '.claude', 'projects'), { recursive: true });
  const genRoot = path.join(ROOT, 'gen'); fs.mkdirSync(path.join(genRoot, 'data'), { recursive: true });
  const HOME0 = process.env.HOME; process.env.HOME = home;
  try {
    let SYNC = null;
    const GEN = require(path.join(REPO, 'src/server/agent-tool-generators.js')).create({ rootDir: genRoot, port: 0, applyThisMachine: (o) => SYNC.applyThisMachine(o), homeRead: (fn) => SYNC.homeRead(fn) });
    const asked = [];
    const starter = { run: (cmd, args, o = {}) => new Promise((resolve) => { asked.push({ cmd, args, envAdd: { ...(o.envAdd || {}) } }); let out = '', err = ''; const c = spawn(cmd, args, { env: { ...process.env, ...(o.envAdd || {}) }, stdio: ['ignore', 'pipe', 'pipe'] }); c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; }); c.on('close', (code) => resolve({ started: true, code, stdout: out, stderr: err })); }) };
    SYNC = require(path.join(REPO, SYNC_REL)).create({ serverSetting: () => undefined, harnesses: require(path.join(REPO, 'src/harnesses/index.js')), adapterRegistry: { get: () => null }, activeSessions: new Map(), hookRegistrationSafe: () => true, home, helperPath: path.join(genRoot, 'data', 'bin', 'vibespace-hook-register.mjs'), starter, hooksWanted: () => true, log: () => {}, warn: () => {} });
    const l1 = await SYNC.applyThisMachine({ reason: 'boot' });
    const sf = path.join(home, '.claude', 'settings.json'), j = JSON.parse(fs.readFileSync(sf, 'utf8'));
    const HC = require(path.join(REPO, 'src/harness-config.js')), stable = `${JSON.stringify(HC.stableNodePath(process.execPath))} ${GEN.HOOK_CMD}`;
    const cmdOf = (root, ev) => root.hooks && root.hooks[ev] && root.hooks[ev][0] && root.hooks[ev][0].hooks[0].command;
    ok(l1.ok && j.cleanupPeriodDays === 36500 && ['SessionStart', 'UserPromptSubmit', 'Stop'].every((ev) => cmdOf(j, ev) === stable) && l1.created.some((c) => c.rel === '.claude/settings.json'),
      'ONE helper run wrote our hooks (the stable spelling) AND the managed key; the file the CLI never wrote is reported created', { l1, j });
    const l2 = await SYNC.applyThisMachine({ reason: 'again' });
    ok(l2.ok && l2.created.length === 0, 'a second run creates nothing', l2);
    ok(asked.length === 2 && asked.every((x) => x.cmd === process.execPath && x.args.length === 1 && x.args[0].endsWith('vibespace-hook-register.mjs') && JSON.stringify(Object.keys(x.envAdd).sort()) === JSON.stringify(['HOME', 'VIBESPACE_CLI_CONFIG'])),
      '(f) argv is the helper\'s path alone; the request adds VIBESPACE_CLI_CONFIG and HOME, nothing else (the starter\'s service env below them)', asked.map((x) => ({ args: x.args, env: Object.keys(x.envAdd) })));
    // (e) the hook command rewritten ONCE, nothing else moving
    const planted = { ...j, model: 'opus', permissions: { allow: ['Bash(ls:*)'] } };
    for (const ev of ['SessionStart', 'UserPromptSubmit', 'Stop']) planted.hooks[ev][0].hooks[0].command = `"/opt/old-node/bin/node" ${GEN.HOOK_CMD}`;
    fs.writeFileSync(sf, JSON.stringify(planted, null, 2) + '\n');
    // through the generator the boot runs (its refusals lifted as test-claude-retention §7 does), the journal read
    const said = [], log0 = console.log;
    const hooks = async () => { process.env.VIBESPACE_FORCE_AGENT_HOOKS = '1'; console.log = (...a) => { said.push(a.join(' ')); }; try { return await GEN.ensureAgentHooks({ auto: true }); } finally { console.log = log0; delete process.env.VIBESPACE_FORCE_AGENT_HOOKS; } };
    const rh = await hooks();
    const after = JSON.parse(fs.readFileSync(sf, 'utf8'));
    const flat = (o, p = '', out = {}) => { if (o && typeof o === 'object') { for (const k of Object.keys(o)) flat(o[k], p ? `${p}.${k}` : k, out); } else out[p] = o; return out; };
    const fb = flat(planted), fa = flat(after), moved = [...new Set([...Object.keys(fb), ...Object.keys(fa)])].filter((k) => fb[k] !== fa[k]);
    ok(rh.claude && rh.claude.ok === true && moved.length === 3 && moved.every((k) => /^hooks\.(SessionStart|UserPromptSubmit|Stop)\.0\.hooks\.0\.command$/.test(k) && fa[k] === stable),
      '(e) a stored command naming another node is rewritten to the stable spelling — the three hook commands only; every other key of the file as it was', { moved, rh });
    const line = `Hook command rewritten in ~/.claude/settings.json (SessionStart, UserPromptSubmit, Stop): "/opt/old-node/bin/node" ${GEN.HOOK_CMD} → ${stable} — the stable spelling, once; only those entries' "command" changed, nothing else in the file`;
    ok(said.filter((l) => l.startsWith('Hook command rewritten')).length === 1 && said.includes(line), '(e) …journalled by name: the file, the entries, the spelling before and after, and that nothing else moved', said);
    said.length = 0;
    const rh2 = await hooks();
    ok(rh2.claude && rh2.claude.ok === true && !said.some((l) => l.startsWith('Hook command rewritten')), '(e) …ONCE: the next registration finds the stable spelling and rewrites nothing', said);
    // (d) the six-hourly check reads the status and starts a run only when it reads stale or not installed: a spelling the
    // applier KEEPS (the same node, one real file — keepsHookCommand) reads installed, and a registration over it leaves it
    const link = path.join(ROOT, 'node-link'); fs.symlinkSync(process.execPath, link);
    const keptCmd = `${JSON.stringify(link)} ${GEN.HOOK_CMD}`, k = JSON.parse(fs.readFileSync(sf, 'utf8'));
    for (const ev of ['SessionStart', 'UserPromptSubmit', 'Stop']) k.hooks[ev][0].hooks[0].command = keptCmd;
    fs.writeFileSync(sf, JSON.stringify(k, null, 2) + '\n');
    const stK = (await GEN.agentHooksStatus()).claude;
    said.length = 0;
    const rk = await hooks();
    const kAfter = JSON.parse(fs.readFileSync(sf, 'utf8'));
    ok(stK.installed === true && stK.stale === false && rk.claude && rk.claude.ok === true && ['SessionStart', 'UserPromptSubmit', 'Stop'].every((ev) => cmdOf(kAfter, ev) === keptCmd) && !said.some((l) => l.startsWith('Hook command rewritten')),
      '(d) a kept spelling reads installed (the check starts nothing for it), and a registration over it keeps it, rewrites nothing and reads ok', { stK, rk, said });
    const GENM = require(MC.write('src/server/agent-tool-generators.js', anchored(src('src/server/agent-tool-generators.js'), '  const sameRunner = (c) => c === hookCmd || keepsHookCommand(c, hookCmd);', '  const sameRunner = (c) => c === hookCmd;', 'a plain string compare'), 'plain-compare')).create({ rootDir: genRoot, port: 0, applyThisMachine: (o) => SYNC.applyThisMachine(o), homeRead: (fn) => SYNC.homeRead(fn) });
    const stKm = (await GENM.agentHooksStatus()).claude;
    ok(stKm.installed === false && stKm.stale === true, 'RED (a plain string compare): the kept spelling reads stale — the six-hourly check would start a run for it every time', stKm);
    // THE REMOVAL (the Integration switch off, «Remove hooks»): the helper's --uninstall strips ONLY our entries, never a managed key
    const HC2 = require(path.join(REPO, 'src/harness-config.js'));
    const oursIn = (root) => Object.values((root && root.hooks) || {}).some((gs) => (gs || []).some((g) => (g.hooks || []).some((h) => String(h && h.command).includes(HC2.HOOK_MARKER))));
    const notHooks = (root) => Object.fromEntries(Object.entries(flat(root)).filter(([key]) => !key.startsWith('hooks.')));
    const stripLeg = async (S) => {
      await SYNC.applyThisMachine({ reason: 'boot' });   // our entries in place first (the real road)
      const was = JSON.parse(fs.readFileSync(sf, 'utf8'));
      const l = await S.applyThisMachine({ reason: 'hooks removed', strip: true });
      const now = JSON.parse(fs.readFileSync(sf, 'utf8'));
      return { ok: l.ok, had: oursIn(was), left: oursIn(now), others: JSON.stringify(notHooks(was)) === JSON.stringify(notHooks(now)) };
    };
    const sl = await stripLeg(SYNC);
    ok(sl.ok && sl.had && !sl.left && sl.others, 'the REMOVAL through the helper (--uninstall): our entries gone, every other key of the file as it was (the managed key included)', sl);
    const SM = require(MC.write(SYNC_REL, anchored(src(SYNC_REL), 'planFor({ hooks: strip ? true : hooks })', 'planFor({ hooks: strip ? false : hooks })', 'a strip plan without its hook rows'), 'strip-no-hooks'));   // stale-pins: kept (the line's first build, rebuilt for the red control)
    const mkS = (M) => M.create({ serverSetting: () => undefined, harnesses: require(path.join(REPO, 'src/harnesses/index.js')), adapterRegistry: { get: () => null }, activeSessions: new Map(), hookRegistrationSafe: () => true, home, helperPath: path.join(genRoot, 'data', 'bin', 'vibespace-hook-register.mjs'), starter, hooksWanted: () => true, log: () => {}, warn: () => {} });
    const slm = await stripLeg(mkS(SM));
    ok(slm.had && slm.left, 'RED (a strip plan without its hook rows — this line\'s first build): the removal «lands» and strips nothing', slm);
    // r1518's must on the REAL files: a removal queued behind a run in flight, then a save that moves a managed key — BOTH land
    const store = {}; let hold = null;
    const holdStarter = { run: (cmd, args, o) => (hold ? hold.then(() => starter.run(cmd, args, o)) : starter.run(cmd, args, o)) };
    const mkK = (runner) => require(path.join(REPO, SYNC_REL)).create({ serverSetting: (k) => store[k], harnesses: require(path.join(REPO, 'src/harnesses/index.js')), adapterRegistry: { get: () => null }, activeSessions: new Map(), hookRegistrationSafe: () => true, home, helperPath: path.join(genRoot, 'data', 'bin', 'vibespace-hook-register.mjs'), starter: holdStarter, hooksWanted: () => false, runner, log: () => {}, warn: () => {} });
    const both = async (S) => {
      delete store['claude.transcriptRetentionDays'];
      await SYNC.applyThisMachine({ reason: 'boot', hooks: true });   // our entries and the managed key in place (the real road)
      let release; hold = new Promise((r) => { release = r; });
      const first = S.applyThisMachine({ reason: 'a save in flight' });
      await tick();
      const strip = S.applyThisMachine({ reason: 'hooks removed', strip: true });
      store['claude.transcriptRetentionDays'] = 365;
      const save = S.applyThisMachine({ reason: 'settings change' });
      hold = null; release();
      const ls = await Promise.all([first, strip, save]);
      const now = JSON.parse(fs.readFileSync(sf, 'utf8'));
      return { hooksLeft: oursIn(now), days: now.cleanupPeriodDays, kinds: ls.map((l) => l.kind) };
    };
    const bk = await both(mkK(null));
    ok(!bk.hooksLeft && bk.days === 365 && JSON.stringify(bk.kinds) === JSON.stringify(['apply', 'strip', 'apply']), 'r1518: a removal queued behind a run, then a save: our hook entries are GONE and the saved key is written (365) — both effects on the real files', bk);
    const MR = require(MC.write(RUNNER_REL, anchored(src(RUNNER_REL), TAIL, MERGED, 'the tip\'s merge'), 'tip-merge-real'));
    const bkm = await both(mkK(MR.createCliConfigRunner({ starter: holdStarter, helperPath: path.join(genRoot, 'data', 'bin', 'vibespace-hook-register.mjs'), home, journal: () => {}, warn: () => {} })));
    ok(bkm.hooksLeft && bkm.days === 365, 'RED (the tip\'s merge): the removal is replaced by the save — our hook entries STAY in the person\'s file, and its caller was told «landed»', bkm);
    // ON then OFF at once: the registration is queued at its call, so the removal asked after it runs after it (the hooks end removed)
    const genSay = [], warn0 = console.warn, log0b = console.log;
    process.env.VIBESPACE_FORCE_AGENT_HOOKS = '1'; console.warn = (...a) => { genSay.push(a.join(' ')); }; console.log = (...a) => { genSay.push(a.join(' ')); };
    try {
      const [reg, rm] = await Promise.all([GEN.ensureAgentHooks({ auto: true }), GEN.stripAgentHookEntries()]);
      ok(!!reg.claude && rm && rm.ok === true && !oursIn(JSON.parse(fs.readFileSync(sf, 'utf8'))), 'ON then OFF at once: the registration runs first, the removal after it — our entries end REMOVED (never registered with the switch off)', { reg: reg.claude, rm: rm && rm.ok });
      // a removal's OUTCOME is read on the files before «removed» is said: an unreadable file is a removal that did not land
      await SYNC.applyThisMachine({ reason: 'boot', hooks: true });
      const good = fs.readFileSync(sf, 'utf8');
      fs.writeFileSync(sf, good.slice(0, -3));   // torn: not valid JSON (the CAS writer refuses it, our entries stay in it)
      genSay.length = 0;
      const bad = await GEN.stripAgentHookEntries();
      ok(bad && bad.ok === false && /claude\.hooks: \S*\.claude\/settings\.json exists but is not valid JSON — not touching it/.test(bad.why || '') && genSay.some((l) => /\[hooks\] the removal did not land: /.test(l)) && !genSay.some((l) => /Removed VibeSpace hooks/.test(l)),
        'r1518: a removal the files did not take (a torn ~/.claude/settings.json) is said NOT landed, by name — never «Removed VibeSpace hooks»', { bad, genSay });
      fs.writeFileSync(sf, good);
      // r2844 (the adversarial read, 3): r1518's check ON THE FILES, on real files — a helper that answers «landed» (its hooks receipt
      // «unchanged») and strips nothing: the removal's own read of the files says it did not land, by name, our entries still there
      {
        const GEN_REL = 'src/server/agent-tool-generators.js', HELPER_P = path.join(genRoot, 'data', 'bin', 'vibespace-hook-register.mjs');
        const STRIPLESS = path.join(ROOT, 'stripless-helper', 'vibespace-hook-register.mjs');
        fs.mkdirSync(path.dirname(STRIPLESS), { recursive: true });
        fs.writeFileSync(STRIPLESS, anchored(fs.readFileSync(HELPER_P, 'utf8'), "          if (uninstall) { if (stripHookEntries(root)) { changed = true; out.hooks = 'stripped'; } }", "          if (uninstall) { /* strips nothing */ }", 'a helper that strips nothing'));
        const pairWith = (Gmod) => { let S2 = null; const G2 = Gmod.create({ rootDir: genRoot, port: 0, applyThisMachine: (o) => S2.applyThisMachine(o), homeRead: (fn) => S2.homeRead(fn) }); S2 = require(path.join(REPO, SYNC_REL)).create({ serverSetting: () => undefined, harnesses: require(path.join(REPO, 'src/harnesses/index.js')), adapterRegistry: { get: () => null }, activeSessions: new Map(), hookRegistrationSafe: () => true, home, helperPath: STRIPLESS, starter, hooksWanted: () => true, log: () => {}, warn: () => {} }); return G2; };
        await SYNC.applyThisMachine({ reason: 'boot', hooks: true });
        genSay.length = 0;
        const kept = await pairWith(require(path.join(REPO, GEN_REL))).stripAgentHookEntries();
        const keptSay = genSay.splice(0);
        ok(!!(kept && kept.ok === false && /our hook entries are still in ~\/\.claude\/settings\.json/.test(kept.why || '') && oursIn(JSON.parse(fs.readFileSync(sf, 'utf8'))) && keptSay.some((l) => /\[hooks\] the removal did not land: /.test(l)) && !keptSay.some((l) => /Removed VibeSpace hooks/.test(l))),
          'r2844 (r1518 on real files): a run that «lands» and strips nothing — the removal reads the files and says it did not land, by name (our entries still there)', { kept, keptSay });
        const noRead = await pairWith(require(MC.write(GEN_REL, anchored(src(GEN_REL), 'after: (landing) => (landing && landing.ok && !landing.skipped ? ourRowsOnDisk() : [])', 'after: null', 'the removal without its read of the files'), 'gen-no-read'))).stripAgentHookEntries();
        const noReadSay = genSay.splice(0);
        ok(!!(noRead && noRead.ok === true && noReadSay.some((l) => /Removed VibeSpace hooks/.test(l))), 'RED (the removal without its read of the files): «Removed VibeSpace hooks» over a file that still holds them', { noRead, noReadSay });
      }
      // r2844 (the adversarial read, 1): THE JOURNAL SAYS IT ONCE — a sync's journal names no hooks receipt (the registration's to say; a
      // missing CLI folder is no failure, r1518) and a failed landing is journalled once, by the runner. RED: the sync journalling them too
      {
        const journalOf = async (Smod) => {
          const said = [];
          const S3 = Smod.create({ serverSetting: () => undefined, harnesses: require(path.join(REPO, 'src/harnesses/index.js')), adapterRegistry: { get: () => null }, activeSessions: new Map(), hookRegistrationSafe: () => true, home, helperPath: path.join(genRoot, 'data', 'bin', 'vibespace-hook-register.mjs'), starter, hooksWanted: () => true, log: (m) => said.push(String(m)), warn: (m) => said.push(String(m)) });
          await S3.syncCliConfig({ reason: 'a save' });   // a good file, no ~/.codex: landed
          const landed = said.splice(0);
          const g3 = fs.readFileSync(sf, 'utf8');
          fs.writeFileSync(sf, g3.slice(0, -3));   // hand-broken
          try { await S3.syncCliConfig({ reason: 'a save' }); } finally { fs.writeFileSync(sf, g3); }
          return { landed, broken: said, hooksNamed: landed.filter((l) => /\.hooks[ :=]/.test(l)), brokenTimes: said.filter((l) => /claude\.hooks: /.test(l)).length };
        };
        const jn = await journalOf(require(path.join(REPO, SYNC_REL)));
        ok(!!(jn.hooksNamed.length === 0 && jn.brokenTimes === 1), 'r2844: the journal says it once — a landed sync names no hooks receipt (no «codex.hooks: not applied — missing» where codex never ran), a refused hooks part is journalled once (the runner)', jn);
        const jr = await journalOf(require(MC.write(SYNC_REL, anchored(anchored(src(SYNC_REL),
          "      if (!r.ok) return { error: r.why, receipts: r.receipts || [], parts: r.parts || [], files: [] };",
          "      if (!r.ok) { warn(`[cli-config] failed (${reason}): ${r.why}`); return { error: r.why, receipts: r.receipts || [], parts: r.parts || [], files: [] }; }", 'the sync saying the failure too'),
          "        if (x.key === 'hooks') continue;", "", 'the sync journalling the hooks receipt'), 'sync-says-too')));
        ok(!!(jr.hooksNamed.length > 0 && jr.brokenTimes === 2), 'RED (the sync journalling the runner\'s words and the hooks receipt): «codex.hooks: not applied — missing» at a landed sync, the refusal journalled twice', jr);
      }
      // r1675 (1) on the real files: Remove, then Install, both inside one helper run in flight — each answer is about ITS run
      const SK = mkK(null), GENK = require(path.join(REPO, 'src/server/agent-tool-generators.js')).create({ rootDir: genRoot, port: 0, applyThisMachine: (o) => SK.applyThisMachine(o) });
      let releaseK; hold = new Promise((r) => { releaseK = r; });
      const inflight = SK.applyThisMachine({ reason: 'a save in flight' });
      await tick();
      const rmK = GENK.stripAgentHookEntries(), regK = GENK.ensureAgentHooks({ auto: false });
      hold = null; releaseK();
      const [, rmA, regA] = await Promise.all([inflight, rmK, regK]);
      ok(rmA && rmA.ok === true && regA.claude && regA.claude.ok === true && oursIn(JSON.parse(fs.readFileSync(sf, 'utf8'))),
        'r1675: Remove then Install inside one run — the removal is answered «removed» (its check read its own run\'s files) and the registration «ok»; the rows end there (the last request)', { rm: rmA && { ok: rmA.ok, why: rmA.why }, reg: regA.claude });
      // r1675 (2): at a start, the opt-out mark present AND our rows found (a removal the hub's stop lost) queues ONE removal
      const optLegs = async (G) => {
        await SYNC.applyThisMachine({ reason: 'boot', hooks: true });
        fs.writeFileSync(G.HOOK_OPTOUT_FILE, new Date().toISOString() + '\n');
        const r = await G.ensureAgentHooks({ auto: true });
        const left = oursIn(JSON.parse(fs.readFileSync(sf, 'utf8')));
        fs.rmSync(G.HOOK_OPTOUT_FILE, { force: true });
        return { r: r && { optedOut: r.optedOut, removed: r.removed && r.removed.ok }, left };
      };
      const op = await optLegs(GEN);
      ok(op.r.optedOut === true && op.r.removed === true && !op.left, 'r1675: a start with the opt-out mark and our rows still in the file queues ONE removal — the rows are gone', op);
      const OPT_NOW = /  function optedOutLook\(\) \{ return \(typeof homeRead[^\n]*/;   // B-f276 (s1126): the opted-out start's look, its own function now
      const GENO = require(MC.write('src/server/agent-tool-generators.js', anchored(src('src/server/agent-tool-generators.js'), OPT_NOW, '  function optedOutLook() { return Promise.resolve({ optedOut: true }); }', 'the cure\'s early return'), 'opt-out-early')).create({ rootDir: genRoot, port: 0, applyThisMachine: (o) => SYNC.applyThisMachine(o), homeRead: (fn) => SYNC.homeRead(fn) });   // stale-pins: kept (the cure's line, rebuilt for the red control)
      const opm = await optLegs(GENO);
      ok(opm.r.optedOut === true && !opm.r.removed && opm.left, 'RED (the cure\'s early return): opted out, nothing removed — our rows stay in the person\'s file', opm);
      // r2224 (1): that look at our rows is a read under the home made OUTSIDE a job — it goes through the runner's guard: while an
      // earlier read of the home is out it reads NOTHING, queues no removal and says why (the hook-root watch asks it at every backoff)
      const heldOptLegs = async (GM) => {
        await SYNC.applyThisMachine({ reason: 'boot', hooks: true });   // our rows in the file
        const RH = R.createCliConfigRunner({ starter: handStarter(), helperPath: '/x/helper.mjs', home: ROOT, timeoutMs: 80, stat: () => new Promise(() => {}), journal: () => {}, warn: () => {} });
        await RH.apply(() => planAt('.held'), 'a save', { kind: 'apply' });   // a home that never answers: one read out
        const queued = [];
        const G = GM.create({ rootDir: genRoot, port: 0, applyThisMachine: (o) => { queued.push(o.reason); return SYNC.applyThisMachine(o); }, homeRead: (fn) => RH.homeRead(fn) });
        fs.writeFileSync(G.HOOK_OPTOUT_FILE, new Date().toISOString() + '\n');
        const rf0 = fs.promises.readFile; let reads = 0;
        fs.promises.readFile = (f, ...a) => { if (String(f).startsWith(home)) reads++; return rf0.call(fs.promises, f, ...a); };
        let r = null; try { r = await G.ensureAgentHooks({ auto: true }); } finally { fs.promises.readFile = rf0; }
        const left = oursIn(JSON.parse(fs.readFileSync(sf, 'utf8')));
        fs.rmSync(G.HOOK_OPTOUT_FILE, { force: true });
        return { r: r && { optedOut: r.optedOut, error: r.error || null, removed: !!r.removed }, reads, queued, left };
      };
      const ho = await heldOptLegs(require(path.join(REPO, 'src/server/agent-tool-generators.js')));
      ok(!!(ho.r && ho.r.optedOut === true && !ho.r.removed && /our hook entries on disk were not read \(the home still has not answered an earlier read \(1 still out\)\)/.test(ho.r.error || '') && ho.reads === 0 && !ho.queued.length),
        'r2224 (1): opted out while an earlier read of the home is out — the start reads NOTHING under the home, queues no removal, and says why by name', ho);
      const GENU = require(MC.write('src/server/agent-tool-generators.js', anchored(src('src/server/agent-tool-generators.js'), "typeof homeRead === 'function' ? homeRead(ourRowsOnDisk, undefined, { cls: 'opted-out-look' }) : ", '', 'the read outside the guard'), 'opt-out-unguarded'));
      const hom = await heldOptLegs(GENU);
      ok(hom.reads > 0, 'RED (the read outside the guard — the second follow\'s form): the opted-out start reads the hook files into the held home', hom);
      ok(src('server.js').includes('homeRead: (fn, ms, opts) => harnessConfig.homeRead(fn, ms, opts)') && src(SYNC_REL).includes('function homeRead(fn, ms, opts) { return cliRunner ? cliRunner.homeRead(fn, ms, opts)'),
        'WIRING (r2224 (1)): the hub hands the generators the runner\'s guarded read (server.js → harness-config-sync → the runner), with the reader\'s own bound (r2345)');
      // r2345 (THE ROW's OWN HARM): the hook STATUS (the six-hourly check, the hooks routes, the Apply answer) is read OFF THE LOOP,
      // through the runner's guard and within its own bound — a home that stops answering is said «not read», never waited on
      const statusLegs = async (GM) => {
        await SYNC.applyThisMachine({ reason: 'boot', hooks: true });   // our rows in the file: a status that reads them says installed
        const asked = [];
        const RS = R.createCliConfigRunner({ starter: handStarter(), helperPath: '/x/helper.mjs', timeoutMs: 80, stat: async () => { throw new Error('none'); }, journal: () => {}, warn: () => {} });
        const G = GM.create({ rootDir: genRoot, port: 0, applyThisMachine: (o) => SYNC.applyThisMachine(o), homeRead: (fn, ms) => { asked.push(ms); return RS.homeRead(fn, 80); } });   // the stand-in bound: 80 ms
        const live = await G.agentHooksStatus();
        const rf0 = fs.promises.readFile, rs0 = fs.readFileSync, ex0 = fs.existsSync; let reads = 0, syncReads = 0;
        fs.promises.readFile = (f, ...a) => (String(f).startsWith(home) ? (reads++, new Promise(() => {})) : rf0.call(fs.promises, f, ...a));   // the home stops answering
        fs.readFileSync = (f, ...a) => { if (String(f).startsWith(home)) syncReads++; return rs0.call(fs, f, ...a); };
        fs.existsSync = (f) => { if (String(f).startsWith(home)) syncReads++; return ex0.call(fs, f); };
        let hung = null, next = null, readsAfterFirst = 0; const t0 = Date.now();
        try {
          hung = await Promise.race([G.agentHooksStatus(), new Promise((res) => setTimeout(() => res(null), 400))]);   // 5× the stand-in bound
          readsAfterFirst = reads;
          next = hung && await Promise.race([G.agentHooksStatus(), new Promise((res) => setTimeout(() => res(null), 400))]);   // asked again while that read is out
        } finally { fs.promises.readFile = rf0; fs.readFileSync = rs0; fs.existsSync = ex0; }
        return { live: live.claude && { installed: live.claude.installed, fileExists: live.claude.fileExists }, hung: hung && hung.claude, ms: Date.now() - t0, next: next && next.claude, reads, readsAfterFirst, syncReads, asked: [...new Set(asked)] };
      };
      const sl = await statusLegs(require(path.join(REPO, 'src/server/agent-tool-generators.js')));
      ok(!!(sl.live && sl.live.installed === true && sl.hung && /the home did not answer within 80 ms/.test(sl.hung.unread || '') && sl.hung.fileExists === null && sl.hung.installed === null
          && sl.next && /the home still has not answered an earlier read \(1 still out\)/.test(sl.next.unread || '') && sl.reads === sl.readsAfterFirst && sl.syncReads === 0 && sl.asked.join() === '10000'),
        'r2345: the hook status reads the home OFF the loop through the guard, within its own bound (10 s, asked by name): a home that stops answering is «not read» at the bound — no fact claimed (fileExists / installed null) — and the next ask is refused at once with no new read', sl);
      const GNG = require(MC.write('src/server/agent-tool-generators.js', anchored(src('src/server/agent-tool-generators.js'), "typeof homeRead === 'function' ? await homeRead(hookFileFacts, STATUS_READ_MS, { cls: 'hook-status' }) : ", '', 'the status read outside the guard'), 'status-unguarded'));
      const slg = await statusLegs(GNG);
      ok(!slg.hung, 'RED (the status read outside the guard): a home that stops answering holds the page — no answer within 400 ms (5× the bound)', slg);
      const GSY = require(MC.write('src/server/agent-tool-generators.js', anchored(src('src/server/agent-tool-generators.js'), "try { text = await fs.promises.readFile(file, 'utf-8'); }", "try { text = fs.readFileSync(file, 'utf-8'); }", 'the release\'s synchronous read'), 'status-sync'));
      const sls = await statusLegs(GSY);
      ok(sls.syncReads > 0, 'RED (the release\'s synchronous read of the hook file): the status reads the home ON the hub\'s loop', sls);
      const SJ2 = src('server.js'), HL2 = src('src/server/hooks-late.js'), hc2 = SJ2.slice(SJ2.indexOf('async function checkAgentHookHealth()'), SJ2.indexOf('async function checkAgentHookHealth()') + 2400);
      const calls2 = (t) => [(t.match(/agentHooksStatus\(\)/g) || []).length, (t.match(/await agentHooksStatus\(\)/g) || []).length];
      ok(SJ2.includes('async function checkAgentHookHealth()') && hc2.indexOf('const st = await agentHooksStatus();') > 0 && hc2.indexOf('if (!info.fileExists || info.parseError) continue;') > hc2.indexOf('const st = await agentHooksStatus();')
          && hc2.indexOf('if (!info.fileExists || info.parseError) continue;') < hc2.indexOf('ensureAgentHooks({ auto: true })') && calls2(SJ2)[0] === calls2(SJ2)[1] && calls2(HL2)[0] === calls2(HL2)[1] && calls2(SJ2)[0] >= 4,
        'WIRING (r2345): the six-hourly check awaits the status and skips an entry whose file is not known to exist (an unread one) before any repair; every status call of server.js and the Apply route is awaited', { server: calls2(SJ2), applyRoute: calls2(HL2) });
      const ma2 = src('src/lib/manage-agents.js');
      ok(ma2.indexOf('if (st.unread) return') > 0 && ma2.indexOf('if (st.unread) return') < ma2.indexOf('if (st.stale) return') && src('src/lib/i18n-zh.js').includes('"{label}: not read — {why}"') && src('src/lib/i18n-ja.js').includes('"{label}: not read — {why}"'),
        'WIRING (r2345): Manage agents says an unread hook file by name, with its reason (zh, ja), before any other verdict of that file');
      // r2345 (b): the person's OWN statusLine, read at each local terminal start — off the loop, through the guard, within 2 s
      const slineLegs = async (GM) => {
        const sfl = path.join(home, '.claude', 'settings.json'), j0 = fs.readFileSync(sfl, 'utf8'), jl = JSON.parse(j0);
        jl.statusLine = { type: 'command', command: 'my-own-statusline --flag' }; fs.writeFileSync(sfl, JSON.stringify(jl, null, 2) + '\n');
        const asked = [];
        const RS = R.createCliConfigRunner({ starter: handStarter(), helperPath: '/x/helper.mjs', timeoutMs: 80, stat: async () => { throw new Error('none'); }, journal: () => {}, warn: () => {} });
        const G = GM.create({ rootDir: genRoot, port: 0, homeRead: (fn, ms) => { asked.push(ms); return RS.homeRead(fn, 80); } });   // the stand-in bound: 80 ms
        const rf0 = fs.promises.readFile, rs0 = fs.readFileSync; let reads = 0, syncReads = 0, readsAfterFirst = 0, live = null, hung = null, next = null;
        const within = (p) => Promise.race([p, new Promise((res) => setTimeout(() => res('NO ANSWER'), 400))]);   // 5× the stand-in bound
        try {
          live = await within(G.userStatuslineCmd());
          fs.promises.readFile = (f, ...a) => (String(f).startsWith(home) ? (reads++, new Promise(() => {})) : rf0.call(fs.promises, f, ...a));   // the home stops answering
          fs.readFileSync = (f, ...a) => { if (String(f).startsWith(home)) syncReads++; return rs0.call(fs, f, ...a); };
          hung = await within(G.userStatuslineCmd());
          readsAfterFirst = reads;
          next = await within(G.userStatuslineCmd());   // the next start, while that read is out
        } finally { fs.promises.readFile = rf0; fs.readFileSync = rs0; fs.writeFileSync(sfl, j0); }
        return { live, hung, next, reads, readsAfterFirst, syncReads, asked: [...new Set(asked)] };
      };
      const sll = await slineLegs(require(path.join(REPO, 'src/server/agent-tool-generators.js')));
      ok(!!(sll.live === 'my-own-statusline --flag' && sll.hung === '' && sll.next === '' && sll.reads === sll.readsAfterFirst && sll.syncReads === 0 && sll.asked.join() === '2000'),
        'r2345 (b): the person\'s own statusLine is read off the loop through the guard, within 2 s (asked by name): passed through when the home answers; a home that stops answering passes none through at the bound, and the next start asks nothing (refused at once)', sll);
      const GSU = require(MC.write('src/server/agent-tool-generators.js', anchored(src('src/server/agent-tool-generators.js'), "typeof homeRead === 'function' ? await homeRead(read, STATUSLINE_READ_MS, { cls: 'statusline' }) : ", '', 'the statusline read outside the guard'), 'sline-unguarded'));
      const slu = await slineLegs(GSU);
      ok(slu.hung === 'NO ANSWER', 'RED (the statusline read outside the guard): a home that stops answering holds the terminal\'s start — no answer within 400 ms (5× the bound)', slu);
      const GSS = require(MC.write('src/server/agent-tool-generators.js', anchored(src('src/server/agent-tool-generators.js'), "const read = () => fs.promises.readFile(path.join(os.homedir(), '.claude', 'settings.json'), 'utf-8');", "const read = async () => fs.readFileSync(path.join(os.homedir(), '.claude', 'settings.json'), 'utf-8');", 'the release\'s synchronous read'), 'sline-sync'));
      const sls2 = await slineLegs(GSS);
      ok(sls2.syncReads > 0, 'RED (the release\'s synchronous read): each terminal start reads the person\'s home ON the hub\'s loop', sls2);
      const LOC = src('src/spawn/local.js');
      ok(LOC.includes("const orig = (userStatuslineCmd && await userStatuslineCmd({ unread: (why, seq) => {") && LOC.includes("try { return ctx.serverNotice?.(`statusline-unread-${seq}`, W.replace('{why}', () => why), { level: 1, i18n: { key: W, params: { why } } }) || 0; } catch { return 0; }") && /STATUSLINE_UNREAD_WORDS/.test(LOC),
        'WIRING (r2345 (b) + r2513 (2) + r2592 (1)): the local start awaits the statusline read; a start without the person\'s statusLine raises a notice named for its silent spell (statusline-unread-<seq>), with why, and hands back how many pages it reached');
      const SUW = require(path.join(REPO, 'src/settings-file-words.js')).STATUSLINE_UNREAD_WORDS;
      ok(/\{why\}/.test(SUW) && /next start tries to read your statusLine again/.test(SUW) && src('src/lib/i18n-zh.js').includes(JSON.stringify(SUW)) && src('src/lib/i18n-ja.js').includes(JSON.stringify(SUW)),
        'r2513 (2) + r2592 (3): the words say why and that the next start TRIES to read it again (it may be refused while a read is still out), in zh and ja');
      // r2513 (3) + r2592 (1): the count back to zero after a LATE answer, and THE PERSON IS TOLD — through a stand-in with serverNotice's
      // OWN rule (server.js: a name is said once a boot; with no page open nothing is burned and 0 comes back)
      const lateLegs = async (GM) => {
        await SYNC.applyThisMachine({ reason: 'boot', hooks: true });
        const RS = R.createCliConfigRunner({ starter: handStarter(), helperPath: '/x/helper.mjs', timeoutMs: 80, journal: () => {}, warn: () => {} });
        const G = GM.create({ rootDir: genRoot, port: 0, homeRead: (fn) => RS.homeRead(fn, 80) });
        const sfl = path.join(home, '.claude', 'settings.json'), j0 = fs.readFileSync(sfl, 'utf8'), jl = JSON.parse(j0);
        jl.statusLine = { type: 'command', command: 'my-own-statusline --flag' }; fs.writeFileSync(sfl, JSON.stringify(jl, null, 2) + '\n');
        const rf0 = fs.promises.readFile, w0 = console.warn; let stall = false; const held = [], warned = [], shown = [], sentNames = new Map(); let clients = 0;
        fs.promises.readFile = (f, ...a) => (stall && String(f).startsWith(home) ? new Promise((res, rej) => { held.push(() => rf0.call(fs.promises, f, ...a).then(res, rej)); }) : rf0.call(fs.promises, f, ...a));
        console.warn = (...a) => { warned.push(a.join(' ')); };
        const unread = (why, seq) => { const key = `statusline-unread-${seq}`; if (sentNames.has(key)) return sentNames.get(key); if (!clients) return 0; shown.push(key); sentNames.set(key, clients); return clients; };   // local.js's notice through serverNotice's rule
        const out = {};
        try {
          stall = true;
          out.s0 = await G.userStatuslineCmd({ unread }); out.shownS0 = shown.length;   // no page open (a resume, a task): no one told, nothing latched
          clients = 1;
          out.s1 = await G.userStatuslineCmd({ unread }); out.shownS1 = shown.length;   // a page is open now; the read still out (refused): told
          out.s2 = await G.userStatuslineCmd({ unread }); out.shownS2 = shown.length;   // the next stalled start: NOT told again
          out.h1 = (await G.agentHooksStatus()).claude.unread || null; out.warnStatus1 = warned.filter((l) => l.startsWith('[hooks]')).length;
          stall = false; for (const f of held.splice(0)) f();   // the home answers LATE
          // wait for BOTH readers to come back, never a fixed time (a loaded machine overran 30 ms: the gate's box zone and another lane's
          // UTC run read the spell as never ended): while the home is still out every poll is refused at once by the runner's in-flight
          // count (this stand-in reads with no class) — no new notice, the journal once a spell; once the count is back to zero a poll
          // reads for real — so only the answer moves it
          for (let i = 0; i < 300 && !out.h2; i++) { await new Promise((res) => setTimeout(res, 10)); out.h2 = (await G.agentHooksStatus()).claude.installed; }
          for (let i = 0; i < 300 && !out.s3; i++) { out.s3 = await G.userStatuslineCmd({ unread }); if (!out.s3) await new Promise((res) => setTimeout(res, 10)); }   // the count back to zero: read, passed through; the spell ends
          stall = true; out.s4 = await G.userStatuslineCmd({ unread });   // hours later, a NEW stall: told again, under a fresh name
          stall = false; for (const f of held.splice(0)) f(); await new Promise((res) => setTimeout(res, 30));
          out.shown = shown.slice(); out.journal = warned.filter((l) => l.startsWith('[statusline]')).length;
        } finally { fs.promises.readFile = rf0; console.warn = w0; fs.writeFileSync(sfl, j0); }
        return out;
      };
      const lt = await lateLegs(require(path.join(REPO, 'src/server/agent-tool-generators.js')));
      ok(!!(lt.s0 === '' && lt.shownS0 === 0 && lt.s1 === '' && lt.shownS1 === 1 && lt.shownS2 === 1 && lt.h1 && lt.warnStatus1 === 1 && lt.s3 === 'my-own-statusline --flag' && lt.h2 === true && lt.s4 === ''
          && lt.shown.join() === 'statusline-unread-0,statusline-unread-1' && lt.journal === 2),
        'r2592 (1): a start with no page open tells no one and latches nothing; the next stalled start with a page open IS told, the one after not again; a LATE answer brings the count back to zero on both readers and ends the spell; a new stall hours later is told again under a fresh name (the journal once a spell)', lt);
      const GSQ = require(MC.write('src/server/agent-tool-generators.js', anchored(src('src/server/agent-tool-generators.js'), 'if (_statuslineTold || _statuslineWarned) _statuslineSeq++; ', '', 'one notice name for the whole boot'), 'notice-one-name'));
      const lsq = await lateLegs(GSQ);
      // the reader's find: the late answer must have COME (both readers back) — else one notice is also what a spell that never ended shows
      ok(lsq.shown.length === 1 && lsq.s3 === 'my-own-statusline --flag' && lsq.h2 === true, 'RED (one notice name for the whole boot — line 454\'s follow\'s form): the reply came, and the stall after it shows nothing (serverNotice says a name once a boot)', lsq);
      const GLT = require(MC.write('src/server/agent-tool-generators.js', anchored(src('src/server/agent-tool-generators.js'), 'if (n > 0) _statuslineTold = true;', '_statuslineTold = true;', 'the mark latched whoever saw it'), 'notice-latch-blind'));
      const llt = await lateLegs(GLT);
      ok(llt.shownS1 === 0, 'RED (the mark latched before anyone saw it — line 454\'s follow\'s form): a start with no page open latches the mark, and the next stalled start with a page open is not told', llt);
      // r2513 (3): THE SIX-HOURLY CHECK's SKIP BY BEHAVIOUR — the check lifted from server.js and run: an unread entry calls no repair
      const SJ4 = src('server.js'), c0 = SJ4.indexOf('async function checkAgentHookHealth() {'), c1 = SJ4.indexOf('\n}\n', c0) + 2;
      const runCheck = async (text, st, mark = 'not') => {   // B-f276 (s1126): `mark`, the opt-out mark's answer the check is handed
        const calls = [];
        const fn = new Function('hookRootWatch', 'integrationEnabled', 'fs', 'optOutMarkNow', 'HOOK_CMD', 'createHookHelper', 'agentHooksStatus', 'ensureAgentHooks', 'serverNotice', text + '\nreturn checkAgentHookHealth;')(   // B-f276 (s1126): the mark's answer, not an existsSync
          { probeMayRun: () => true, saidRecoveryInstead: () => false }, () => true, { existsSync: (f) => f === '/hook-cmd' }, () => mark, '/hook-cmd', () => {},
          async () => st, (a) => { calls.push(a); return { claude: { ok: true } }; }, () => {});
        await fn(); await tick();
        return calls.length;
      };
      const UNREAD = { file: 'x', unread: 'the home did not answer within 10000 ms', fileExists: null, dirExists: null, creatable: false, parseError: false, installed: null, stale: false };
      const STALE = { file: 'x', fileExists: true, dirExists: true, creatable: false, parseError: false, installed: false, stale: true };
      const chk = SJ4.slice(c0, c1);
      const nUnread = await runCheck(chk, { hookPath: '/hook-cmd', optedOut: false, claude: UNREAD, codex: UNREAD }), nStale = await runCheck(chk, { hookPath: '/hook-cmd', optedOut: false, claude: STALE, codex: UNREAD });
      ok(c0 > 0 && c1 > c0 && nUnread === 0 && nStale === 1, 'r2513 (3): the six-hourly check, RUN (lifted from server.js): two unread entries call NO repair; a stale one beside an unread one calls ONE', { nUnread, nStale });
      const SKIP = '      if (!info.fileExists || info.parseError) continue; // that CLI isn\'t set up here / unreadable\n';
      const nRed = chk.includes(SKIP) ? await runCheck(chk.replace(SKIP, ''), { hookPath: '/hook-cmd', optedOut: false, claude: UNREAD, codex: UNREAD }) : -1;
      ok(nRed === 2, 'RED (the skip taken out): an unread entry (installed null) reads «not installed» and the check calls a repair for each', { nRed });
      const nHeldMark = await runCheck(chk, { hookPath: '/hook-cmd', optedOut: false, claude: STALE, codex: UNREAD }, { unread: 'EIO' });
      ok(nHeldMark === 0, 'B-f276 (s1126): the six-hourly check with the opt-out mark UNREAD returns before its probe — no repair asked (the same stale entry called one above)', { nHeldMark });
      // r1813 (2): an Install pressed WHILE the start reads the mark and the rows (outside the queue): the start's removal reads the
      // mark again INSIDE its job — the Install, answered «ok», is never stripped after it. B-f276 (s1126): the start reads the mark
      // OFF the loop now, so the press is PLACED in the start's wait by a fact: the start's look at our rows is asked (the mark was
      // read «opted out») and held on a gate; the press comes then, and the gate opens after it (never a clock)
      const pressLegs = async (Gmod) => {
        let lookAsked = null, openLook = null;
        const asked = new Promise((r) => { lookAsked = r; }), lookGate = new Promise((r) => { openLook = r; });
        const G = Gmod.create({ rootDir: genRoot, port: 0, applyThisMachine: (o) => SYNC.applyThisMachine(o), homeRead: (fn) => { lookAsked(); return lookGate.then(() => SYNC.homeRead(fn)); } });
        await SYNC.applyThisMachine({ reason: 'boot', hooks: true });
        fs.writeFileSync(G.HOOK_OPTOUT_FILE, new Date().toISOString() + '\n');
        const stP = G.ensureAgentHooks({ auto: true });
        let bound = null; const askedIn = await Promise.race([asked.then(() => true), new Promise((r) => { bound = setTimeout(() => r(false), 30000); })]); clearTimeout(bound);   // the start read the mark («opted out») and asked its look
        if (!askedIn) { openLook(); return { harness: 'HARNESS (B-f276 s1126): the start never asked its look at our rows within 30 s (the wait\'s bound, never the product\'s answer)' }; }
        const instP = G.ensureAgentHooks({ auto: false });   // the press in the start's wait
        openLook();
        const [st, inst] = await Promise.all([stP, instP]);
        const left = oursIn(JSON.parse(fs.readFileSync(sf, 'utf8')));
        fs.rmSync(G.HOOK_OPTOUT_FILE, { force: true });
        return { start: st && { optedOut: st.optedOut, removed: st.removed && { ok: st.removed.ok, skipped: st.removed.skipped || null } }, install: inst.claude && inst.claude.ok, left };
      };
      const pl = await pressLegs(require(path.join(REPO, 'src/server/agent-tool-generators.js')));
      ok(!!(pl.install === true && pl.left && pl.start && pl.start.removed && /no longer asked/.test(pl.start.removed.skipped || '')), 'r1813: an Install pressed during the start\'s wait is answered ok and STAYS — the start\'s removal finds the mark gone in its own job and is not run', pl);
      const WHEN = "when: ifOptedOut ? stillOptedOut : null,";
      const GENW = require(MC.write('src/server/agent-tool-generators.js', anchored(src('src/server/agent-tool-generators.js'), WHEN, 'when: null,', 'the mark read outside the queue'), 'no-when'));   // B-f276 (s1126): pressLegs builds it on its own gate
      const plm = await pressLegs(GENW);
      ok(plm.install === true && !plm.left, 'RED (the mark read outside the queue — the r1675 form): the Install is answered ok, then the start\'s removal strips it', plm);
      // r1813 (3) the true words: a run that broke BEFORE its check says the run's own reason, never «the check … broke»
      const GENB = require(path.join(REPO, 'src/server/agent-tool-generators.js')).create({ rootDir: genRoot, port: 0, applyThisMachine: async () => ({ at: 1, ok: false, receipts: [], created: [], why: 'the plan could not be built' }) });
      const rb = await GENB.ensureAgentHooks({ auto: false });
      ok(!!(rb.claude && rb.claude.ok === false && rb.claude.error === 'the plan could not be built'), 'r1813: a run that broke before its check tells each CLI the RUN\'s reason («the plan could not be built»)', rb);
      // r2844 (the verifier's law 4): A REFUSED HOOKS PART IS NEVER «LANDED». The usual plan (our hooks, no managed row set) on a
      // settings file that is hand-broken, unreadable or a link to nowhere: the file is left untouched (rightly) and the refusal is now a
      // receipt the helper prints and the runner judges — not landed, by name. Through the REAL helper.
      const isRootR = typeof process.getuid === 'function' && process.getuid() === 0;   // root reads a mode-000 file: that plant reads only unprivileged
      const sfH = path.join(home, '.claude', 'settings.json');
      const PLANTS = {
        'hand-broken': () => { const j0 = fs.readFileSync(sfH, 'utf8'); fs.writeFileSync(sfH, '{ "model": "opus", '); return () => fs.writeFileSync(sfH, j0); },
        unreadable: () => { fs.chmodSync(sfH, 0o000); return () => fs.chmodSync(sfH, 0o600); },
        dangling: () => { fs.renameSync(sfH, sfH + '.kept'); fs.symlinkSync(path.join(home, '.claude', 'nowhere.json'), sfH); return () => { fs.unlinkSync(sfH); fs.renameSync(sfH + '.kept', sfH); }; },
      };
      const PLAN_H = HCJ.encodePlan(SYNC.cliConfigPlan({ hooksOnly: true }));   // the usual plan: our hooks, NO managed row set (the verifier's scene)
      const hooksRun = async (Rn, plant) => {
        await SYNC.applyThisMachine({ reason: 'boot', hooks: true });   // our rows in place first
        const before = fs.lstatSync(sfH).isSymbolicLink() ? null : fs.readFileSync(sfH, 'utf8');
        const restore = plant ? PLANTS[plant]() : () => {};
        let l = null, gate = null, untouched = null;
        try {
          const sig = () => { try { const st = fs.lstatSync(sfH); return st.isSymbolicLink() ? `link → ${fs.readlinkSync(sfH)}` : `${st.ino}:${st.mtimeMs}:${st.size}`; } catch { return 'gone'; } };
          const planted = sig();
          l = await Rn.apply(() => PLAN_H, 'hooks', { kind: 'apply+hooks' });
          gate = await Rn.landedWithin(50);
          untouched = sig() === planted && planted !== 'gone' && !fs.existsSync(path.join(home, '.claude', 'nowhere.json'));
        } finally { restore(); }
        return { ok: l && l.ok, why: l && l.why, hooks: ((l && l.receipts) || []).filter((x) => x.key === 'hooks').map((x) => `${x.harness}:${x.state}`).join(), gate: gate && (gate.failed ? 'failed' : gate.late ? 'late' : 'landed'), untouched, before: !!before };
      };
      const HELPER = path.join(genRoot, 'data', 'bin', 'vibespace-hook-register.mjs');
      const OLD_HELPER = path.join(ROOT, 'old-helper', 'vibespace-hook-register.mjs');   // today's helper: no receipt for our hook entries
      fs.mkdirSync(path.dirname(OLD_HELPER), { recursive: true });
      { let h = fs.readFileSync(HELPER, 'utf8');
        for (const line of ["      if (touchesHooks) receipts.push(receipt(f, HOOKS_ROW, 'refused', { reason: badRel }));\n", "      if (touchesHooks) receipts.push(receipt(f, HOOKS_ROW, state, { reason: e.message, ...(e.missing ? { missing: e.missing } : {}) }));\n", "    if (touchesHooks && out.hooks !== 'error') receipts.push(receipt(f, HOOKS_ROW, out.hooks === 'unchanged' ? 'unchanged' : 'applied', { current: out.hooks }));\n"]) h = anchored(h, line, '', 'today: no receipt for our hook entries');
        fs.writeFileSync(OLD_HELPER, h); }
      const RUNNER_TODAY = require(MC.write(RUNNER_REL, anchored(src(RUNNER_REL), '    const silent = status ? [] : hooksHarnessesOf(planB64, uninstall).filter((h) => !receipts.some((x) => x.harness === h && x.key === \'hooks\'));', '    const silent = [];', 'today: a silent hooks part read as landed'), 'runner-no-hooks-check'));
      const runnerWith = (Rm, helperPath) => Rm.createCliConfigRunner({ starter, helperPath, home, journal: () => {}, warn: () => {} });
      const SNEW = runnerWith(R, HELPER), STODAY = runnerWith(RUNNER_TODAY, OLD_HELPER), SOLD = runnerWith(R, OLD_HELPER);
      for (const plant of ['hand-broken', 'unreadable', 'dangling']) {
        if (plant === 'unreadable' && isRootR) { SKIPPED.push(`r2844 ${plant}: not read as root`); console.log(`  SKIP r2844: ${plant} — not read as root (root reads a mode-000 file); read where the suite runs unprivileged`); continue; }
        const h = await hooksRun(SNEW, plant);
        ok(!!(h.ok === false && /claude\.hooks: /.test(h.why || '') && /claude:(refused|error)/.test(h.hooks) && h.gate === 'failed' && h.untouched),
          `r2844: a ${plant} settings file — untouched, and the run is NOT landed, by name («claude.hooks: …»), the spawn gate told «failed»`, h);
        const t = await hooksRun(STODAY, plant);
        ok(!!(t.ok === true && t.gate === 'landed'), `RED (today's helper and runner, ${plant}): the refused hooks part reads «landed» — the gate says landed, our hooks are not in the file`, t);
      }
      const o = await hooksRun(SOLD, null);   // an OLDER helper (no hooks receipt) on a good file: whether our hooks landed is not known
      ok(!!(o.ok === false && /claude\.hooks: not known — the helper printed no word of our hook entries \(an older helper\)/.test(o.why || '') && o.gate === 'failed'),
        'r2844: an older helper prints no word of our hook entries — the newer runner says «not known», never «landed»', o);
      const om = await hooksRun(STODAY, null);
      ok(!!(om.ok === true && om.gate === 'landed'), 'RED (the runner without the check): the older helper\'s silence reads «landed»', om);
      // the Apply press says EACH failed part ONCE (the hooks part by the hooks answer for the CLI it belongs to, each refused row once),
      // and the status never calls our hooks installed
      {
        const HL_REL = 'src/server/hooks-late.js';
        const press = async (HLm) => {
          await SYNC.applyThisMachine({ reason: 'boot', hooks: true });
          const restore = PLANTS['hand-broken']();
          let body = null, st = null;
          try {
            const routes = {}, app = { post: (pp, fn) => { routes[pp] = fn; } };
            HLm.create({ activeSessions: new Map(), getSessionStatus: () => null, getUserTodos: () => null, sessionStatusKey: () => null, harnesses: { list: () => [] }, log: () => { }, warn: () => { } })
              .registerApplyRoute(app, { ensureAgentHooks: (a) => GEN.ensureAgentHooks(a), agentHooksStatus: () => GEN.agentHooksStatus(), integrationEnabled: () => true, harnessConfig: SYNC, hookRegistrationSafe: () => true });
            const res = { status() { return res; }, json(x) { body = x; return res; } };
            await routes['/api/cli-config/apply']({ body: {}, query: {}, headers: {} }, res);
            st = (await GEN.agentHooksStatus()).claude;
          } finally { restore(); }
          const segs = ((body && body.error) || '').split('; ').filter(Boolean);
          return { error: body && body.error, ok: body && body.ok, said: (((body && body.error) || '').match(/hooks: /g) || []).length, twice: segs.filter((x, i) => segs.indexOf(x) !== i), installed: st && st.installed };
        };
        const ap = await press(require(path.join(REPO, HL_REL)));
        ok(!!(ap.ok === false && /claude: hooks: /.test(ap.error || '') && ap.said === 1 && !ap.twice.length && /claude\.transcriptRetentionDays: /.test(ap.error || '') && ap.installed === false),
          'r2844: the Apply press says each failed part ONCE — the refused hooks part for the CLI it belongs to, the refused row once — and the status never calls our hooks installed', ap);
        const HL_BESIDE = require(MC.write(HL_REL, anchored(src(HL_REL), "        ...(cfg && cfg.error && Array.isArray(cfg.parts) && cfg.parts.length\n          ? cfg.parts.filter((p) => !(p.key === 'hooks' && saidHooks(p.harness))).map((p) => `${p.harness}.${p.why}`)\n          : cfg && cfg.error && !Object.keys(hooks && typeof hooks === 'object' ? hooks : {}).some((k) => saidHooks(k) && (hooks[k].error || hooks[k].why) === cfg.error) ? [cfg.error] : []),",
          "        ...((cfg && cfg.receipts) || []).filter((x) => (x.state === 'error' || x.state === 'refused') && x.key !== 'hooks').map((x) => `${x.harness}.${x.key}: ${x.reason || x.state}`),\n        ...(cfg && cfg.error ? [cfg.error] : []),", 'the error beside its parts'), 'apply-beside'));
        const apb = await press(HL_BESIDE);
        ok(!!(apb.ok === false && apb.said === 2 && apb.twice.length > 0), 'RED (the settings answer\'s error said beside its receipts): the hooks part is said twice and a refused row twice', apb);
      }
      // r3064 (round w9xxaxn8a's smalls and the remote road) — a STAND-IN starter hands the helper's lines back at once (no run)
      {
        const GEN_R = 'src/server/agent-tool-generators.js', HC_R = 'src/harness-config.js', HL_R = 'src/server/hooks-late.js', HOSTS_R = 'src/hosts.js';
        const fakeStarter = (out) => ({ run: async () => ({ started: true, code: 0, stdout: typeof out === 'function' ? out() : out, stderr: '' }) });
        const enc = (v) => encodeURIComponent(JSON.stringify(v));
        const line = (h, k, st, why) => `CFG|${h}|${k}|${st}|${enc(null)}|${enc(null)}|${enc(why || '')}`;
        const syncWith = (Smod, st) => Smod.create({ serverSetting: () => undefined, harnesses: require(path.join(REPO, 'src/harnesses/index.js')), adapterRegistry: { get: () => null }, activeSessions: new Map(), hookRegistrationSafe: () => true, home, helperPath: HELPER, starter: st, hooksWanted: () => true, log: () => {}, warn: () => {} });
        // (a) A CRASH INSIDE THE HELPER is said by its own words: the whole-run line keeps its state and its message
        const CRASH = `CFG|*|*|error|${enc('a planted crash inside the helper')}\n`;
        const pc = HCJ.parseReceiptLines(CRASH)[0];
        const lc = await R.createCliConfigRunner({ starter: fakeStarter(CRASH), helperPath: HELPER, home, journal: () => {}, warn: () => {} }).apply(() => PLAN_H, 'hooks', { kind: 'apply+hooks' });
        ok(!!(pc && pc.state === 'error' && pc.reason === 'a planted crash inside the helper' && lc && lc.ok === false && /^the helper failed: a planted crash inside the helper/.test(lc.why || '') && !/not known/.test(lc.why || '')),
          'r3064: a crash inside the helper is said by its own words («the helper failed: …»), never «an older helper»', { pc, why: lc && lc.why });
        const HC_OLDW = require(MC.write(HC_R, anchored(src(HC_R), "    if (p[1] === '*') { const st = p[3] !== 'unknown' && RECEIPT_STATES.includes(p[3]) ? p[3] : 'unknown'; out.push({ harness: null, key: null, state: st, reason: p[3] === 'unknown' ? 'helper predates --status' : st === 'unknown' ? p[3] : (dec(p[4] || '') || p[3]) }); continue; }", "    if (p[1] === '*') { out.push({ harness: null, key: null, state: 'unknown', reason: p[3] === 'unknown' ? 'helper predates --status' : p[3] }); continue; }", 'the whole-run line read «unknown»'), 'hc-old-whole'));   // stale-pins: kept (the OLD parse, planted in a copy for the red)
        const po = HC_OLDW.parseReceiptLines(CRASH)[0];
        ok(!!(po && po.state === 'unknown' && po.reason === 'error'), 'RED (the old parse): the crash reads «unknown» and its message is thrown away', po);
        const CH = await import(pathToFileURL(path.join(REPO, 'src/lib/cli-config-chips.js')).href), tt = (x, p) => String(x).replace(/\{(\w+)\}/g, (_, k) => (p && p[k] != null ? p[k] : `{${k}}`));
        const chipCrash = CH.receiptLine(pc, { t: tt, where: 'm' }).text, chipLink = CH.receiptLine({ harness: 'claude', key: 'k', rel: '.claude/settings.json', state: 'unreadable', reason: 'a link to nowhere' }, { t: tt, where: 'm' }).text;
        ok(/the helper failed — a planted crash inside the helper/.test(chipCrash) && /settings\.json is a link to nowhere — not touched/.test(chipLink) && /all\.find\(\(x\) => x && !x\.harness && !x\.key\)/.test(src('src/lib/settings-ui.js')),
          'r3064: the chips word the helper\'s own failure (a read or a write alike) and a link to nowhere for what they are; «Check machines…» takes any whole-run line', { chipCrash, chipLink });
        // (b) THE REMOTE ROAD (r3064 (4)): the real helper's own lines on a hand-broken file — a paired machine's install (our hooks + the
        //     managed keys) is NOT landed, one cause said once with its keys; a good file: nothing; no receipt of a planned hooks part:
        //     «not known»; the root verdict's refusal: said
        const HM = require(path.join(REPO, HOSTS_R)).HostManager;
        const helperLines = async () => { const r = await starter.run(process.execPath, [HELPER], { envAdd: { VIBESPACE_CLI_CONFIG: HCJ.encodePlan(SYNC.cliConfigPlan()), HOME: home } }); return HCJ.parseReceiptLines((r && r.stdout) || ''); };
        await SYNC.applyThisMachine({ reason: 'boot', hooks: true });
        const goodL = await helperLines();
        const restoreB = PLANTS['hand-broken']();
        let brokenL = null; try { brokenL = await helperLines(); } finally { restoreB(); }
        const hk = HM.hooksOfPlan(HCJ.encodePlan(SYNC.cliConfigPlan()));
        const nlG = HM.installNotLanded(goodL, { hooks: hk }), nlB = HM.installNotLanded(brokenL, { hooks: hk }), nlR = HM.installNotLanded(brokenL, { refused: { kind: 'worktree', line: 'a planted refusal' } });
        const nlSilent = HM.installNotLanded([], { hooks: hk }), nlCrash = HM.installNotLanded([pc], { hooks: hk });
        ok(!!(hk.includes('claude') && nlG.length === 0 && nlB.length === 1 && /^claude \((?=[^)]*hooks)(?=[^)]*transcriptRetentionDays)[^)]*\): .*not valid JSON/.test(nlB[0]) && nlR.length === 1 && /not registered there: a planted refusal/.test(nlR[0]) && nlSilent.length === hk.length && nlSilent.every((w) => /\(hooks\): not known/.test(w)) && nlCrash.length === 1 && /^the helper: a planted crash/.test(nlCrash[0])),
          'r3064 (4): a paired machine\'s install says what did not land there — one cause once, with its keys; nothing printed of a planned hooks part: «not known»; the helper\'s crash; the root verdict\'s refusal', { nlG, nlB, nlR, nlSilent, nlCrash });
        ok(/const r = await hosts\.installAgentTools\(req\.params\.id, AGENT_BIN_DIR\), bad = \(r && r\.notLanded\) \|\| \[\]; res\.json\(\{ success: !bad\.length,/.test(src('src/server/exit-routes.js')) && /notLanded: HostManager\.installNotLanded\(cliConfig, \{ refused, hooks: HostManager\.hooksOfPlan\(this\._cliConfigPlanB64\(\)\) \}\)/.test(src(HOSTS_R)) && /t\('Not everything landed on \{host\}: \{what\}'/.test(src('src/lib/manage-agents.js')),
          'PIN r3064 (4): the install route answers success only when nothing failed (else what did not land, by name), and the machine card\'s toast says it', {});
        // the Remove road (the round's read): a strip that did not land keeps the tools — the entries left in the file still find their program
        // the stand-in machine: the strip prints `out`; the look at the hook files answers `look`; a removal that FAILS (`rmFails`) prints
        // what the command echoes on failure (the release's command echoes VS-REMOVED whatever rm did)
        const unOf = async (Hmod, out, { look = 'HOOK|claude|no\nHOOK|codex|no\n', rmFails = false, refusal = null } = {}) => { const calls = []; let rmCmd = null, lookCmd = null; const H = Object.create(Hmod.HostManager.prototype); H.get = () => ({ id: 'h-0001' }); if (refusal) H._ownerWriteRefusal = () => refusal; H._ssh = async (h, cmd) => { const k = /--uninstall/.test(cmd) ? 'strip' : /rm -f/.test(cmd) ? 'rm' : /grep -q vibespace-hook\.mjs/.test(cmd) ? 'look' : 'other'; calls.push(k); if (k === 'rm') rmCmd = cmd; if (k === 'look') lookCmd = cmd; if (k === 'strip') return out; if (k === 'look') return look; return rmFails && /\|\| echo VS-NOT-REMOVED/.test(cmd) ? 'VS-NOT-REMOVED' : 'VS-REMOVED'; }; const r = await H.uninstallAgentTools('h-0001'); return { ok: r.ok, notLanded: r.notLanded || [], error: r.error || null, code: r.code || null, unread: r.unread || null, left: r.left || null, calls, rmCmd, lookCmd }; };
        const STRIP_BAD = 'VS-HELPER-RAN\n' + line('claude', 'hooks', 'refused', 'settings.json exists but is not valid JSON — not touching it') + '\nVS-STRIPPED\n', STRIP_OK = 'VS-HELPER-RAN\n' + line('claude', 'hooks', 'applied') + '\nVS-STRIPPED\n';
        const unB = await unOf(require(path.join(REPO, HOSTS_R)), STRIP_BAD), unG = await unOf(require(path.join(REPO, HOSTS_R)), STRIP_OK);
        ok(!!(unB.ok === false && unB.notLanded.length === 1 && JSON.stringify(unB.calls) === '["strip"]' && unG.ok === true && JSON.stringify(unG.calls) === '["strip","look","rm"]' && /success: !\(r && r\.ok === false\)/.test(src('src/server/exit-routes.js'))),
          'r3064: a paired machine\'s Remove — a refused strip answers NOT removed by name and keeps the tools (no rm); a strip that landed removes them', { unB, unG });
        const unX = await unOf(require(MC.write(HOSTS_R, anchored(src(HOSTS_R), '      if (stripped.length) return { ok: false, notLanded: stripped, error: `the hooks were not removed on that machine (the tools kept, so the entries left still run): ${stripped.join(\'; \')}` };\n', '', 'the tools removed whatever the strip said'), 'hosts-rm-anyway')), STRIP_BAD);
        ok(!!(unX.ok === true && JSON.stringify(unX.calls) === '["strip","look","rm"]'), 'RED (the tools removed whatever the strip said): «removed», and the entries left call a program that is gone', unX);
        // r3784, THE REMOVE ROAD's LAW IN TWO HALVES: a strip that printed NO hooks receipt (an older helper, silent even when it succeeds)
        // is looked at — our marker still in a hook file ⇒ the tools kept, said by name; gone ⇒ removed (never refused for a helper's age)
        const SILENT = 'VS-STRIPPED\n';
        const unS = await unOf(require(path.join(REPO, HOSTS_R)), SILENT, { look: 'HOOK|claude|yes\nHOOK|codex|no\n' }), unSg = await unOf(require(path.join(REPO, HOSTS_R)), SILENT);
        ok(!!(unS.ok === false && JSON.stringify(unS.calls) === '["strip","look"]' && unS.notLanded.length === 1 && /^claude \(hooks\): still in its hook file/.test(unS.notLanded[0]) && unSg.ok === true && JSON.stringify(unSg.calls) === '["strip","look","rm"]'),
          'r3784: a strip that said nothing of our hooks — the machine is LOOKED at: entries still there ⇒ the tools are kept, by name; gone ⇒ the tools are removed (an older helper is never refused)', { unS, unSg });
        const unSx = await unOf(require(MC.write(HOSTS_R, anchored(src(HOSTS_R), '      if (unsaid.length) { const kept = await look(', '      if (false) { const kept = await look(', 'the silent strip taken as landed'), 'hosts-silent-landed')), SILENT, { look: 'HOOK|claude|yes\nHOOK|codex|no\n' });
        ok(!!(unSx.ok === true && JSON.stringify(unSx.calls) === '["strip","rm"]'), 'RED (a silent strip taken as landed — the release\'s Remove): the tools are removed under hooks still in the file', unSx);
        // each cause in its own words (the round's read): a helper that RAN and said nothing this hub knows; no helper at all; a state from
        // a newer helper; a server that never writes a machine's CLI config (it strips nothing: the look still guards the tools)
        const unRan = await unOf(require(path.join(REPO, HOSTS_R)), 'VS-HELPER-RAN\nVS-STRIPPED\n', { look: 'HOOK|claude|yes\nHOOK|codex|no\n' });
        const unNew = await unOf(require(path.join(REPO, HOSTS_R)), 'VS-HELPER-RAN\nCFG|claude|hooks|a-state-from-the-future|%22%22|%22%22|%22%22\nVS-STRIPPED\n', { look: 'HOOK|claude|yes\nHOOK|codex|no\n' });
        const unRef = await unOf(require(path.join(REPO, HOSTS_R)), 'unused', { refusal: { kind: 'worktree', why: 'a git worktree of the checkout' }, look: 'HOOK|claude|yes\nHOOK|codex|no\n' });
        const unRefG = await unOf(require(path.join(REPO, HOSTS_R)), 'unused', { refusal: { kind: 'worktree', why: 'a git worktree of the checkout' } });
        ok(!!(/no helper ran there/.test(unS.notLanded[0] || '') && unRan.ok === false && /the helper there said nothing this hub knows of the strip/.test(unRan.notLanded[0] || '') && unNew.ok === false && JSON.stringify(unNew.calls) === '["strip","look"]'
            && unRef.ok === false && JSON.stringify(unRef.calls) === '["look"]' && /never writes a machine's CLI config/.test(unRef.notLanded[0] || '') && unRefG.ok === true && JSON.stringify(unRefG.calls) === '["look","rm"]'),
          'r3784: each cause in its words — no helper ran; a helper that said nothing this hub knows; a hooks row in a state from a newer helper (looked at, not taken as landed); a server that strips nothing (looked at: entries there keep the tools)', { unS: unS.notLanded, unRan: unRan.notLanded, unNew: unNew.calls, unRef: unRef.calls, unRefG: unRefG.calls });
        const unR = await unOf(require(path.join(REPO, HOSTS_R)), STRIP_OK, { rmFails: true });
        ok(!!(unR.ok === false && /its tools could not be removed/.test(unR.error || '') && unR.notLanded.some((w) => /^the tools: could not be removed/.test(w))), 'r3784: the removal\'s OWN failure is said (the hooks removed, the tools not), never «removed»', unR);
        const unRx = await unOf(require(MC.write(HOSTS_R, anchored(src(HOSTS_R), ' && echo VS-REMOVED || echo VS-NOT-REMOVED`;', '; echo VS-REMOVED`;', 'the release\'s removal echo'), 'hosts-rm-echo')), STRIP_OK, { rmFails: true });   // stale-pins: kept — the red's copy writes the release's own echo back
        ok(!!(unRx.ok === true), 'RED (the release\'s removal: echo VS-REMOVED whatever rm did): «removed» though the tools are still there', unRx);
        // r4014 (2): UNKNOWN REMOVES NOTHING, LITERALLY — a look that could not read a hook file («err») keeps the tools, said by its
        // cause; a look that did not reply (empty, garbage) removes nothing and names its door by its code (the page words it, en/zh/ja)
        const HMr0 = require(path.join(REPO, HOSTS_R));
        const unE = await unOf(HMr0, SILENT, { look: 'HOOK|claude|err\nHOOK|codex|no\n' });
        const unN = await unOf(require(path.join(REPO, HOSTS_R)), SILENT, { look: '' }), unQ = await unOf(require(path.join(REPO, HOSTS_R)), SILENT, { look: 'HOOK|claude|maybe\nsome text\n' });
        ok(!!(unE.ok === false && JSON.stringify(unE.calls) === '["strip","look"]' && /^claude \(hooks\): its hook file is there but could not be read, so whether our entries are left is not known — no helper ran there/.test(unE.notLanded[0] || '')
            && [unN, unQ].every((u) => u.ok === false && u.code === 'look-no-reply' && JSON.stringify(u.calls) === '["strip","look"]' && /^the look at that machine's hook files did not reply — nothing removed \(the tools kept\): no helper ran there/.test(u.error || ''))
            && src('src/lib/manage-agents.js').includes("r?.code === 'look-no-reply' ? t('{host}: the look at its hook files did not reply — nothing was removed', { host: hostName })")
            && ['src/lib/i18n-zh.js', 'src/lib/i18n-ja.js'].every((f) => src(f).includes('"{host}: the look at its hook files did not reply — nothing was removed":'))),
          'r4014 (2): a hook file there but unreadable keeps the tools, by its cause; a look that did not reply (empty, garbage) removes nothing and names its door — the page words it by its code in en / zh / ja', { unE: unE.notLanded, unN: [unN.code, unN.error, unN.calls], unQ: [unQ.code, unQ.calls] });
        const unF = await (async () => { const H = Object.create(HMr0.HostManager.prototype); H.get = () => ({ id: 'h-0001' }); const calls = []; H._ssh = async (h, cmd) => { const k = /--uninstall/.test(cmd) ? 'strip' : /grep -q vibespace-hook\.mjs/.test(cmd) ? 'look' : 'rm'; calls.push(k); if (k === 'look') throw new Error('Command failed: a planted ssh timeout\nmore'); return k === 'strip' ? SILENT : 'VS-REMOVED'; }; const r = await H.uninstallAgentTools('h-0001'); return { ...r, calls }; })();
        ok(!!(unF.ok === false && unF.code === 'look-no-reply' && JSON.stringify(unF.calls) === '["strip","look"]' && /nothing removed \(the tools kept\): no helper ran there.* — Command failed: a planted ssh timeout$/.test(unF.error || '')), 'r4014 (its read\'s S8): a look that failed over ssh (a hung mount there) removes nothing and names the same door, with its cause', { code: unF.code, calls: unF.calls, error: unF.error });
        const unD = await unOf(HMr0, SILENT, { look: 'HOOK|claude|err|dangling\nHOOK|codex|err|folder-dangling\n' });
        const PAGE = src('src/lib/manage-agents.js'), ERR_KEYS = ['{host}: the tools were kept — whether our hook entries are left is not known: {what}', 'its hook file is there but could not be read', 'its hook file is a link to nowhere (a volume not mounted yet?)', 'its folder is a link to nowhere (a volume not mounted yet?)', 'its folder cannot be searched', 'its hook file could not be looked at', 'still in its hook file', 'not known — its hook file could not be read'];
        ok(!!(unD.ok === false && unD.code === 'look-err' && JSON.stringify(unD.calls) === '["strip","look"]' && /^claude \(hooks\): its hook file is a link to nowhere \(a volume not mounted yet\?\), so whether/.test(unD.notLanded[0] || '') && /^codex \(hooks\): its folder is a link to nowhere/.test(unD.notLanded[1] || '') && !unD.notLanded.some((w) => /is there but/.test(w))
            && unE.code === 'look-err' && /r\?\.code === 'look-err' && Array\.isArray\(r\.unread\) \? t\('\{host\}: the tools were kept — whether our hook entries are left is not known: \{what\}'/.test(PAGE)
            && ERR_KEYS.slice(1, 7).every((k) => PAGE.includes(`t('${k}')`)) && ['src/lib/i18n-zh.js', 'src/lib/i18n-ja.js'].every((f) => ERR_KEYS.every((k) => src(f).includes(JSON.stringify(k) + ':')))),
          'r4073 (2): «err» has its own code and each cause its TRUE words (a link to nowhere is never «there»); the page words the door and every cause in en / zh / ja', { unD: [unD.code, unD.notLanded], unE: unE.code });
        const unDx = await unOf(require(MC.write(HOSTS_R, anchored(src(HOSTS_R), "m[3] && Object.hasOwn(HostManager.LOOK_ERR_WORDS, m[3]) ? m[3] : m[3] ? 'unknown' : 'unreadable'", "'unreadable'", 'every cause read as unreadable'), 'hosts-err-one-cause')), SILENT, { look: 'HOOK|claude|err|dangling\nHOOK|codex|err|folder-dangling\n' });
        ok(!!(unDx.notLanded.every((w) => /is there but could not be read/.test(w))), 'RED (every cause read as «unreadable»): a link to nowhere is said to be «there»', { notLanded: unDx.notLanded });
        // the follow's read: a cause this hub does not know (or a prototype name) gets the neutral words, never a function's text
        const unK = await unOf(HMr0, SILENT, { look: 'HOOK|claude|err|constructor\nHOOK|codex|err|a-cause-from-the-future\n' });
        ok(!!(unK.code === 'look-err' && unK.unread.every((u) => u.why === 'unknown') && unK.notLanded.every((w) => /: its hook file could not be looked at, so whether/.test(w))), 'r4073\'s follow read (S3): an unknown cause (a newer probe, or «constructor») is «could not be looked at», never another cause\'s words or a function\'s text', { unread: unK.unread, notLanded: unK.notLanded });
        // the follow's read (M1): THE USUAL ROAD — the helper RAN and printed «missing» for a CLI whose folder is a link to nowhere
        const MISSING = 'VS-HELPER-RAN\n' + line('claude', 'hooks', 'missing', '~/.claude not found') + '\n' + line('codex', 'hooks', 'missing', '~/.codex not found') + '\nVS-STRIPPED\n';
        const unM = await unOf(HMr0, MISSING, { look: 'HOOK|claude|err|folder-dangling\nHOOK|codex|no\n' }), unMg = await unOf(HMr0, MISSING);
        ok(!!(unM.ok === false && unM.code === 'look-err' && JSON.stringify(unM.calls) === '["strip","look"]' && unMg.ok === true && JSON.stringify(unMg.calls) === '["strip","look","rm"]'), 'r4073\'s follow read (M1): a strip that RAN and read «missing» is looked at — a folder that is a link to nowhere keeps the tools; truly absent, they go', { unM: [unM.code, unM.calls], unMg: unMg.calls });
        const unMx = await unOf(require(MC.write(HOSTS_R, anchored(src(HOSTS_R), " && x.state !== 'unknown' && x.state !== 'missing'));", " && x.state !== 'unknown'));", '«missing» taken as landed'), 'hosts-missing-landed')), MISSING, { look: 'HOOK|claude|err|folder-dangling\nHOOK|codex|no\n' });
        ok(!!(unMx.ok === true && JSON.stringify(unMx.calls) === '["strip","rm"]'), 'RED (a «missing» receipt taken as landed): the helper\'s road removes the tools under a folder that is a link to nowhere', unMx);
        // r4073 (3): the status probe's chip reads «err» as NOT KNOWN, never «not registered»
        const statusOf = async (Hm) => { const H = Object.create(Hm.HostManager.prototype); H.get = () => ({ id: 'h-0001' }); H._agentNodeOf = async () => null; H._hostShell = async () => 'HOOK|claude|err|unreadable\nHOOK|codex|yes\nNODE|yes\n'; H._ownerWriteRefusal = () => null; return H.agentToolsStatus('h-0001'); };
        const stE = await statusOf(HMr0);
        ok(!!(stE.hooks.claude === null && stE.hooks.codex === true && PAGE.includes("rs.hooks?.[k] === null ? `<span class=\"ob-warn\">${escHtml(getBackendMeta(k).label)} ${t('hook')}: ${t('not known — its hook file could not be read')}</span>`")), 'r4073 (3): a paired machine\'s status reads an unreadable hook file as NOT KNOWN (null), and the card says so — never «not registered»', { hooks: stE.hooks });
        const stX = await statusOf(require(MC.write(HOSTS_R, anchored(src(HOSTS_R), "st.hooks[p[1]] = p[2] === 'yes' ? true : p[2] === 'err' ? null : false;", "st.hooks[p[1]] = p[2] === 'yes';", 'the release\'s two-state read'), 'hosts-status-two-state')));
        ok(!!(stX.hooks.claude === false), 'RED (the release\'s two-state read): an unreadable hook file reads «not registered»', { hooks: stX.hooks });
        const unNx = await unOf(require(MC.write(HOSTS_R, anchored(src(HOSTS_R), '      if (!clis.every((c) => said.has(c))) return {', '      if (false) return {', 'a look with no reply taken for «gone»'), 'hosts-look-no-reply')), SILENT, { look: '' });
        ok(!!(unNx.ok === true && JSON.stringify(unNx.calls) === '["strip","look","rm"]'), 'RED (a look with no reply taken for «nothing left»): the tools are removed on a look that said nothing', unNx);
        // THE LOOK's OWN TEXT, RUN (a POSIX sh on a scratch HOME): a hook file that is THERE but cannot be read (a folder in its place,
        // which no user reads as a file — root neither) says «err», never «no»; our marker: «yes»; no file: «no». The list is the registry's
        const shHome = path.join(ROOT, `look-home-${process.pid}`);
        fs.rmSync(shHome, { recursive: true, force: true });
        fs.mkdirSync(path.join(shHome, '.claude', 'settings.json'), { recursive: true });   // a folder where the file should be
        fs.mkdirSync(path.join(shHome, '.codex'), { recursive: true });
        fs.writeFileSync(path.join(shHome, '.codex', 'hooks.json'), JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'node "$HOME/.vibespace/bin/vibespace-hook.mjs"' }] }] } }));
        const runLook = (Hm) => { const r = spawnSync('sh', ['-c', Hm.HostManager.hookLeftProbe(Hm.HostManager.hookClis())], { env: { PATH: process.env.PATH || '/usr/bin:/bin', HOME: shHome }, encoding: 'utf8', timeout: 10000 }); return String(r.stdout || ''); };
        const shHome2 = path.join(ROOT, `look-home2-${process.pid}`);
        fs.rmSync(shHome2, { recursive: true, force: true }); fs.mkdirSync(path.join(shHome2, '.claude'), { recursive: true });
        fs.symlinkSync(path.join(ROOT, `a-volume-not-mounted-${process.pid}`, 'settings.json'), path.join(shHome2, '.claude', 'settings.json'));   // a link to nowhere (a volume not mounted yet)
        const runLook2 = (Hm) => { const r = spawnSync('sh', ['-c', Hm.HostManager.hookLeftProbe(Hm.HostManager.hookClis())], { env: { PATH: process.env.PATH || '/usr/bin:/bin', HOME: shHome2 }, encoding: 'utf8', timeout: 10000 }); return String(r.stdout || ''); };
        // r4073 (1): the CLI's FOLDER a link to nowhere (~/.claude on a volume not mounted yet) is err too
        const shHome3 = path.join(ROOT, `look-home3-${process.pid}`);
        fs.rmSync(shHome3, { recursive: true, force: true }); fs.mkdirSync(shHome3, { recursive: true });
        fs.symlinkSync(path.join(ROOT, `a-volume-not-mounted-${process.pid}`, '.claude'), path.join(shHome3, '.claude'));
        const runLook3 = (Hm) => { const r = spawnSync('sh', ['-c', Hm.HostManager.hookLeftProbe(Hm.HostManager.hookClis())], { env: { PATH: process.env.PATH || '/usr/bin:/bin', HOME: shHome3 }, encoding: 'utf8', timeout: 10000 }); return String(r.stdout || ''); };
        const shHome4 = path.join(ROOT, `look-home4-${process.pid}`), realClaude = path.join(ROOT, `real-claude-${process.pid}`);
        fs.rmSync(shHome4, { recursive: true, force: true }); fs.rmSync(realClaude, { recursive: true, force: true }); fs.mkdirSync(shHome4, { recursive: true }); fs.mkdirSync(realClaude, { recursive: true });
        fs.writeFileSync(path.join(realClaude, 'settings.json'), JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'node "$HOME/.vibespace/bin/vibespace-hook.mjs"' }] }] } }));
        fs.symlinkSync(realClaude, path.join(shHome4, '.claude'));   // a folder that is a link to a REAL folder: looked at as itself
        const shHome5 = path.join(ROOT, `look-home5-${process.pid}`); fs.rmSync(shHome5, { force: true }); fs.symlinkSync(path.join(ROOT, `a-home-not-mounted-${process.pid}`), shHome5);   // the HOME itself a link to nowhere
        const runLookAt = (Hm, home) => { const r = spawnSync('sh', ['-c', Hm.HostManager.hookLeftProbe(Hm.HostManager.hookClis())], { env: { PATH: process.env.PATH || '/usr/bin:/bin', HOME: home }, encoding: 'utf8', timeout: 10000 }); return String(r.stdout || ''); };
        const HMr = require(path.join(REPO, HOSTS_R)), lookOut = runLook(HMr), lookOut2 = runLook2(HMr), lookOut3 = runLook3(HMr), lookOut4 = runLookAt(HMr, shHome4), lookOut5 = runLookAt(HMr, shHome5), declared = require(path.join(REPO, 'src/harnesses/index.js')).list().filter((x) => x.inject && x.inject.hookFile).map((x) => x.id);
        ok(!!(/^HOOK\|claude\|err\|unreadable$/m.test(lookOut) && /^HOOK\|codex\|yes$/m.test(lookOut) && /^HOOK\|claude\|err\|dangling$/m.test(lookOut2) && /^HOOK\|codex\|no$/m.test(lookOut2) && /^HOOK\|claude\|err\|folder-dangling$/m.test(lookOut3) && /^HOOK\|codex\|no$/m.test(lookOut3) && /^HOOK\|claude\|yes$/m.test(lookOut4) && /^HOOK\|claude\|err\|unsearchable$/m.test(lookOut5) && /^HOOK\|codex\|err\|unsearchable$/m.test(lookOut5) && declared.length >= 2 && JSON.stringify(HMr.HostManager.hookClis()) === JSON.stringify(declared) && /HostManager\.hookLeftProbe\(HostManager\.hookClis\(\)\)/.test(src(HOSTS_R)) && !/HOOK\|claude\|yes/.test(src(HOSTS_R))),
          'r4014 (1)(2) + r4073 (1): the look, run by a POSIX sh — a hook file there but unreadable, a file that is a link to nowhere, and a CLI FOLDER that is a link to nowhere each say «err» with its cause; our marker «yes»; no file «no»; its list is every registry row with a hook file (no literal table), and the status probe uses the same look', { lookOut, lookOut2, lookOut3, lookOut4, lookOut5, declared, clis: HMr.HostManager.hookClis() });
        const NO_FOLDER = MC.write(HOSTS_R, anchored(src(HOSTS_R), `if [ -L "$d" ] && [ ! -e "$d" ]; then v='err|folder-dangling'; elif `, 'if false; then :; elif ', 'the folder\'s link not looked at'), 'hosts-look-no-folder');
        const nfOut = runLook3(require(NO_FOLDER));
        ok(!!(/^HOOK\|claude\|no$/m.test(nfOut)), 'RED (r4073 (1): the CLI\'s folder not looked at): a folder that is a link to nowhere says «no», and the tools would go', { nfOut });
        const OLD_LOOK = MC.write(HOSTS_R, anchored(src(HOSTS_R), "`f=${file}; d=\"\\${f%/*}\"; if [ -L \"$d\" ] && [ ! -e \"$d\" ]; then v='err|folder-dangling'; elif [ ! -d \"\\${d%/*}\" ] || [ ! -x \"\\${d%/*}\" ]; then v='err|unsearchable'; elif [ -L \"$f\" ] && [ ! -e \"$f\" ]; then v='err|dangling'; elif [ ! -e \"$f\" ] && [ -d \"$d\" ] && [ ! -x \"$d\" ]; then v='err|unsearchable'; elif [ ! -e \"$f\" ]; then v=no; elif [ ! -r \"$f\" ]; then v='err|unreadable'; else grep -q vibespace-hook.mjs \"$f\" 2>/dev/null; v=$?; if [ \"$v\" = 0 ]; then v=yes; elif [ \"$v\" = 1 ]; then v=no; else v='err|unreadable'; fi; fi; printf 'HOOK|%s|%s\\\\n' ${q} \"$v\"; `", "`grep -q vibespace-hook.mjs ${file} 2>/dev/null && printf 'HOOK|%s|yes\\\\n' ${q} || printf 'HOOK|%s|no\\\\n' ${q}; `", 'the release\'s look: an error read as gone'), 'hosts-look-old');
        const oldOut = runLook(require(OLD_LOOK)), oldOut2 = runLook2(require(OLD_LOOK));
        ok(!!(/^HOOK\|claude\|no$/m.test(oldOut) && /^HOOK\|claude\|no$/m.test(oldOut2)), 'RED (the release\'s look: grep\'s error read as «gone»): a hook file there but unreadable, and a link to nowhere, say «no», and the tools would go', { oldOut, oldOut2 });
        // THE REMOVAL's OWN TEXT, RUN on a scratch HOME: our tools and shims go — by find, ONE level, a quoted name — and nothing else;
        // an empty HOME's folder ('/.vibespace/bin') is skipped by its -d test (pinned in the text: never run against the root)
        const rmHome = path.join(ROOT, `rm-home-${process.pid}`), bin = path.join(rmHome, '.vibespace', 'bin');
        fs.rmSync(rmHome, { recursive: true, force: true }); fs.mkdirSync(path.join(bin, 'deeper'), { recursive: true });
        const toolsNow = HMr.HostManager.agentTools();
        for (const n of [...toolsNow, 'vibespace-tool-a-shim', 'a-file-of-the-person', 'deeper/vibespace-tool-not-ours']) fs.writeFileSync(path.join(bin, n), 'x');
        const unG2 = await unOf(HMr, STRIP_OK);
        const rmRun = spawnSync('sh', ['-c', String(unG2.rmCmd || 'false')], { env: { PATH: process.env.PATH || '/usr/bin:/bin', HOME: rmHome }, encoding: 'utf8', timeout: 10000 });
        const left = fs.readdirSync(bin).sort();
        ok(!!(unG2.ok === true && /VS-REMOVED/.test(rmRun.stdout || '') && JSON.stringify(left) === '["a-file-of-the-person","deeper"]' && fs.existsSync(path.join(bin, 'deeper', 'vibespace-tool-not-ours'))
            && String(unG2.rmCmd).includes(`[ ! -d "$HOME/.vibespace/bin" ] || find "$HOME/.vibespace/bin" -maxdepth 1 -name 'vibespace-tool-*' -exec rm -f {} + 2>/dev/null;`)),
          'r4014: the removal\'s own text, run — our tools and every shim go (find from a fixed root, one level, a quoted name); the person\'s file and a deeper folder stay; an empty HOME is skipped by the -d test', { out: rmRun.stdout, left, tools: toolsNow.length });
        // r3784 (a should, pinned either way): a receipt state this hub does not know (a newer helper's) is parsed «unknown» and is NOT a
        // failure — on this road the helper is the hub's own; a hooks row in it counts as printed
        const unk = HM.installNotLanded(HCJ.parseReceiptLines('CFG|claude|hooks|a-state-from-the-future|%22%22|%22%22|%22%22'), { hooks: ['claude'] });
        ok(!!(Array.isArray(unk) && unk.length === 0), 'PIN r3784: a receipt state the hub does not know reads «unknown» — not a failure, and a hooks row in it counts as printed (the helper here is the hub\'s own)', unk);
        // (c) ONCE PER CAUSE (r3064): a file left broken re-runs the helper at each start; the gate names the cause and the spell, the start
        //     keys its notice on both (serverNotice burns a key only when a page took it), and a landing on any road starts a new spell
        const REFUSED = line('claude', 'hooks', 'refused', 'settings.json exists but is not valid JSON — not touching it') + '\n' + line('codex', 'hooks', 'missing', '~/.codex not found') + '\n';
        const GOOD = line('claude', 'hooks', 'unchanged') + '\n' + line('codex', 'hooks', 'missing', '~/.codex not found') + '\n';
        let outNow = REFUSED;
        const spells = async (Smod) => { outNow = REFUSED; const S4 = syncWith(Smod, fakeStarter(() => outNow)); await S4.syncCliConfig({ reason: 'boot' }); const g1 = await S4.startGate(), g2 = await S4.startGate(); outNow = GOOD; await S4.syncCliConfig({ reason: 'a fix' }); outNow = REFUSED; await S4.syncCliConfig({ reason: 'broken again' }); const g3 = await S4.startGate(); return { c1: g1 && g1.cause, c2: g2 && g2.cause, s1: g1 && g1.spell, s2: g2 && g2.spell, s3: g3 && g3.spell }; };
        const sp = await spells(require(path.join(REPO, SYNC_REL)));
        ok(!!(sp.c1 && sp.c1 === sp.c2 && /claude\.hooks: /.test(sp.c1) && sp.s1 === sp.s2 && sp.s3 === sp.s1 + 1), 'r3064: a file left broken — two starts name ONE cause in one spell (one notice); after a landing, the same cause is a new spell (said again)', sp);
        const spr = await spells(require(MC.write(SYNC_REL, anchored(src(SYNC_REL), '.then((l) => { if (l && l.ok) landedSpell++; return l; })', '', 'no spell from a landing'), 'sync-no-spell')));
        ok(!!(spr.s3 === spr.s1), 'RED (no spell from a landing): fixed and broken again the same way, the start is never told again', spr);
        ok(/const causeKey = crypto\.createHash\('sha1'\)\.update\(String\(cliLate\.cause \|\| why\)\)/.test(src('src/ws-create.js')) && /serverNotice\?\.\(`cli-config-late-\$\{cliLate\.spell \|\| 0\}-\$\{causeKey\}`/.test(src('src/ws-create.js')), 'PIN r3064: the start keys the late notice on the spell and the cause', {});
        const warnTimes = async (Rm) => { const said = []; const Rw = Rm.createCliConfigRunner({ starter: fakeStarter(REFUSED), helperPath: HELPER, home, journal: () => {}, warn: (m) => said.push(String(m)) }); await Rw.apply(() => PLAN_H, 'hooks', { kind: 'apply+hooks' }); await Rw.apply(() => PLAN_H, 'hooks', { kind: 'apply+hooks' }); return said.length; };
        const w1 = await warnTimes(R);
        ok(w1 === 1, 'r3064: the journal says a cause once — two runs of the same refusal, one line', { w1 });
        const w2 = await warnTimes(require(MC.write(RUNNER_REL, anchored(src(RUNNER_REL), 'else if (landing.why !== warnedWhy) warn(', 'else warn(', 'the journal at every run'), 'runner-warn-every')));
        ok(w2 === 2, 'RED (no memo of the cause): a journal line at every run', { w2 });
        // (d) A PATH THAT IS THERE BUT CANNOT BE READ (round w9xxaxn8a): a link to nowhere — the hooks status and each managed row's chip —
        //     and a folder in the file's place read «there, unreadable», never «will be created — or press Apply»
        const GEN_NOLSTAT = require(MC.write(GEN_R, anchored(src(GEN_R), "    if (code === 'ENOENT') { try { if ((await fs.promises.lstat(file)).isSymbolicLink()) code = 'EDANGLING'; } catch { } }\n", '', 'the status without the lstat'), 'gen-no-lstat'));
        const HC_NOLINK = require(MC.write(HC_R, anchored(src(HC_R), "    if (text == null && code === 'ENOENT') { try { if (fs.lstatSync(file).isSymbolicLink()) code = 'EDANGLING'; } catch { } }\n", '', 'the chip without the link check'), 'hc-no-link'));
        const HC_NOCODE = require(MC.write(HC_R, anchored(src(HC_R), "    if (text == null && code !== 'ENOENT' && code !== 'ENOTDIR') { for (const s of sets) receipts.push(receipt(f, s, 'unreadable', { reason: code === 'EDANGLING' ? 'a link to nowhere' : `could not be read (${code})` })); continue; }\n", '', 'every unread path missing'), 'hc-no-code'));
        const rowsOf = (Hm) => Hm.readConfigPlan(SYNC.cliConfigPlan(), { home }).filter((x) => x.harness === 'claude').map((x) => `${x.state}:${x.missing || x.reason}`);
        const restoreD = PLANTS.dangling();
        let dl = null;
        try {
          const st = (await GEN.agentHooksStatus()).claude;
          const stO = (await GEN_NOLSTAT.create({ rootDir: genRoot, port: 0, applyThisMachine: (o) => SYNC.applyThisMachine(o), homeRead: (fn) => SYNC.homeRead(fn) }).agentHooksStatus()).claude;
          dl = { st: st && { parseError: st.parseError, creatable: st.creatable }, rows: rowsOf(HCJ), stO: stO && { creatable: stO.creatable }, rowsO: rowsOf(HC_NOLINK) };
        } finally { restoreD(); }
        fs.renameSync(sfH, sfH + '.kept'); fs.mkdirSync(sfH);
        let dir = null; try { dir = { rows: rowsOf(HCJ), rowsO: rowsOf(HC_NOCODE) }; } finally { fs.rmdirSync(sfH); fs.renameSync(sfH + '.kept', sfH); }
        ok(!!(dl.st && dl.st.parseError === true && dl.st.creatable === false && dl.rows.length && dl.rows.every((x) => x === 'unreadable:a link to nowhere') && dir.rows.length && dir.rows.every((x) => /^unreadable:could not be read \(EISDIR\)$/.test(x))),
          'r3064: a link to nowhere — the hooks status reads «config unreadable», each managed row «a link to nowhere»; a folder in the file\'s place «could not be read (EISDIR)»; never «will be created»', { dl, dir });
        ok(!!(dl.stO && dl.stO.creatable === true && dl.rowsO.every((x) => x === 'missing:will-create') && dir.rowsO.every((x) => x === 'missing:will-create')), 'RED (no lstat, no read code): «will be created — or press Apply» on a link to nowhere and on a folder', { dl, dir });
        // (e) THE INSTALL PRESS NAMES A REFUSED ROW (r3064 (7)): our hooks landed, a managed row of the same run did not, codex has no folder
        const RW = line('claude', 'hooks', 'unchanged') + '\n' + line('claude', 'transcriptRetentionDays', 'refused', 'a planted refusal of the row') + '\n' + line('codex', 'hooks', 'missing', '~/.codex not found') + '\n';
        const pressWith = (Gmod) => { let S5 = null; const G5 = Gmod.create({ rootDir: genRoot, port: 0, applyThisMachine: (o) => S5.applyThisMachine(o), homeRead: (fn) => S5.homeRead(fn) }); S5 = syncWith(require(path.join(REPO, SYNC_REL)), fakeStarter(RW)); return G5.ensureAgentHooks({ auto: true }); };
        const hlOf = (Hm) => Hm.create({ activeSessions: new Map(), getSessionStatus: () => null, getUserTodos: () => null, sessionStatusKey: () => null, harnesses: { list: () => [] }, log: () => { }, warn: () => { } });
        const ip = await pressWith(require(path.join(REPO, GEN_R)));
        const ans = hlOf(require(path.join(REPO, HL_R))).installAnswer(ip);
        ok(!!(ip && ip.claude && ip.claude.ok === true && ans.success === true && !ans.error && Array.isArray(ans.rowsNotLanded) && ans.rowsNotLanded.some((w) => /^claude\.transcriptRetentionDays: a planted refusal of the row/.test(w))),
          'r3064 (7): the Install press — our hooks landed (codex\'s missing folder no failure, r1518) and the refused row of the same run is named in its answer', { ans, claude: ip && ip.claude });
        const ipO = await pressWith(require(MC.write(GEN_R, anchored(src(GEN_R), 'if (rows.length && results[key]) results[key].rows = rows;', '', 'the answer without the rows'), 'gen-no-rows')));
        const ansO = hlOf(require(MC.write(HL_R, anchored(src(HL_R), "const bad = Object.entries(results && typeof results === 'object' ? results : {}).filter(([, v]) => v && v.ok === false && v.missing !== 'no-dir');", "const bad = Object.entries(results && typeof results === 'object' ? results : {}).filter(([, v]) => v && v.ok === false);", 'a missing folder a failure'), 'hl-old-install'))).installAnswer(ipO);
        // r3784: the two cures each have their own red (one copy took out both)
        const ansRows = hlOf(require(path.join(REPO, HL_R))).installAnswer(ipO), ansDir = hlOf(require(MC.write(HL_R, anchored(src(HL_R), "const bad = Object.entries(results && typeof results === 'object' ? results : {}).filter(([, v]) => v && v.ok === false && v.missing !== 'no-dir');", "const bad = Object.entries(results && typeof results === 'object' ? results : {}).filter(([, v]) => v && v.ok === false);", 'a missing folder a failure, alone'), 'hl-nodir-only'))).installAnswer(ip);
        ok(!!(ansRows.success === true && !ansRows.rowsNotLanded), 'RED (the answer without the rows, alone): the press says «installed», the refused row nowhere', ansRows);
        ok(!!(ansDir.success === false && /^codex: /.test(ansDir.error || '')), 'RED (a missing folder a failure, alone — r1518 undone): the press fails on codex\'s missing folder', ansDir);
        ok(!!(ansO.success === false && /^codex: /.test(ansO.error || '') && !ansO.rowsNotLanded), 'RED (today\'s press: a missing folder a failure, no rows): the toast says only «codex: … not found», the refused row nowhere', ansO);
        // r3784: a machine with NO CLI folder at all registered nothing — the press says what was done
        const none = hlOf(require(path.join(REPO, HL_R))).installAnswer({ claude: { ok: false, missing: 'no-dir', error: '~/.claude not found' }, codex: { ok: false, missing: 'no-dir', error: '~/.codex not found' } });
        ok(!!(none.success === true && JSON.stringify(none.noCli) === '["~/.claude","~/.codex"]' && src('src/lib/manage-agents.js').includes("t('Nothing registered: no CLI folder on this machine ({dirs})', { dirs: r.noCli.join(', ') })")), 'r3784: no CLI folder at all — the press answers what was done («nothing registered», the folders named), never «installed»', none);
        ok(/res\.json\(\{ \.\.\.hooksLate\.installAnswer\(results\), results, status: await agentHooksStatus\(\) \}\);/.test(src('server.js')) && /t\('a setting did not land: \{what\}'/.test(src('src/lib/manage-agents.js')), 'PIN r3064 (7): the Install route answers by the one verdict and its toast names a refused row', {});
      }
    } finally { console.warn = warn0; console.log = log0b; delete process.env.VIBESPACE_FORCE_AGENT_HOOKS; }
    // r1813 (3): a removal the refusal door stopped (this suite's own env refuses: VIBESPACE_SKIP_AGENT_HOOKS) is ANSWERED as a refusal
    const rf = await GEN.stripAgentHookEntries();
    ok(!!(rf && rf.ok === false && rf.refused && typeof rf.why === 'string' && rf.why.length > 0), 'r1813: a removal stopped by the refusal door answers ok:false with the refusal by name (the uninstall route then says it, never «success»)', rf);
    // r1813 (3): the Apply press says a queued removal's own reason (a landing carries `why`), never «removed: undefined»
    {
      const routes = {}, app = { post: (pp, fn) => { routes[pp] = fn; } };
      require(path.join(REPO, 'src/server/hooks-late.js')).create({ activeSessions: new Map(), getSessionStatus: () => null, getUserTodos: () => null, sessionStatusKey: () => null, harnesses: { list: () => [] }, log: () => { }, warn: () => { } })
        .registerApplyRoute(app, { ensureAgentHooks: async () => ({ optedOut: true, removed: { ok: false, why: 'our hook entries are still in ~/.claude/settings.json' } }), agentHooksStatus: () => ({}), integrationEnabled: () => true, harnessConfig: { syncCliConfig: async () => ({ receipts: [] }), cliConfigStatus: () => ({}) }, hookRegistrationSafe: () => true });
      let body = null; const res = { status() { return res; }, json(x) { body = x; return res; } };
      await routes['/api/cli-config/apply']({ body: {}, query: {}, headers: {} }, res);
      ok(!!(body && body.ok === false && /removed: our hook entries are still in ~\/\.claude\/settings\.json/.test(body.error || '') && !/undefined/.test(body.error || '')), 'r1813: the Apply press says the queued removal\'s own reason', body);
    }
    // r2345 (1): an opted-out start whose look at our rows was NOT read (the guard) — the Apply press says it, never «applied» over it
    const applyUnread = async (HL) => {
      const routes = {}, app = { post: (pp, fn) => { routes[pp] = fn; } };
      HL.create({ activeSessions: new Map(), getSessionStatus: () => null, getUserTodos: () => null, sessionStatusKey: () => null, harnesses: { list: () => [] }, log: () => { }, warn: () => { } })
        .registerApplyRoute(app, { ensureAgentHooks: async () => ({ optedOut: true, error: 'our hook entries on disk were not read (the home still has not answered an earlier read (1 still out)) — no removal asked; asked again at the next start' }), agentHooksStatus: () => ({}), integrationEnabled: () => true, harnessConfig: { syncCliConfig: async () => ({ receipts: [] }), cliConfigStatus: () => ({}) }, hookRegistrationSafe: () => true });
      let body = null; const res = { status() { return res; }, json(x) { body = x; return res; } };
      await routes['/api/cli-config/apply']({ body: {}, query: {}, headers: {} }, res);
      return body;
    };
    const au = await applyUnread(require(path.join(REPO, 'src/server/hooks-late.js')));
    ok(!!(au && au.ok === false && /our hook entries on disk were not read \(the home still has not answered/.test(au.error || '')), 'r2345 (1): the Apply press says an opted-out start\'s unread look by name — never «applied»', au);
    const HLU = require(MC.write('src/server/hooks-late.js', anchored(src('src/server/hooks-late.js'), "        ...(hooks && hooks.optedOut && typeof hooks.error === 'string' ? [hooks.error] : []),", '', 'the unread look not gathered'), 'apply-unread'));
    const aum = await applyUnread(HLU);
    ok(!!(aum && aum.ok === true), 'RED (the unread look not gathered — line 412\'s form): the press answers «applied» over a look nobody read', aum);
    const SJ = src('server.js'), hc = SJ.slice(SJ.indexOf('function checkAgentHookHealth()'), SJ.indexOf('function checkAgentHookHealth()') + 1600);
    ok(/if \(info\.stale \|\| !info\.installed \|\| scriptMissing\) \{[\s\S]*?ensureAgentHooks\(\{ auto: true \}\)/.test(hc) && (hc.match(/ensureAgentHooks\(/g) || []).length === 1,
      'WIRING (d): the six-hourly check asks the helper only inside «stale, not installed, or the hook script missing»');
  } finally { process.env.HOME = HOME0; }
}

console.log('⑦ (b) the settings answer at the landing');
async function answerLegs(A) {
  const res = () => { const r = { body: null, json: (b) => { r.body = b; return r; } }; return r; };
  const timers = []; const fake = { setTimer: (fn, ms) => { const t = { fn, ms }; timers.push(t); return t; }, clearTimer: (t) => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); } };
  const out = {};
  { const r = res(); A.answerAtLanding(r, { success: true }, null, fake); out.none = r.body; }
  { const r = res(); A.answerAtLanding(r, { success: true }, Promise.resolve({ receipts: [], files: [] }), fake); out.before = r.body; await tick(); out.landed = r.body; }
  { const r = res(); A.answerAtLanding(r, { success: true }, Promise.resolve({ error: 'the helper exited 1: EIO' }), fake); await tick(); out.failed = r.body; }
  { const r = res(); A.answerAtLanding(r, { success: true }, Promise.resolve({ skipped: true, refused: { line: 'hooks not registered: a worktree' } }), fake); await tick(); out.refused = r.body; }
  { const r = res(); A.answerAtLanding(r, { success: true }, new Promise(() => {}), fake); out.pending = r.body; const t = timers[timers.length - 1]; if (t) t.fn(); out.past = r.body; }
  return out;
}
{
  const A = require(path.join(REPO, ANSWER_REL));
  const a = await answerLegs(A);
  ok(a.none && a.none.success === true && !('cliConfig' in a.none), 'no CLI-config row moved → the plain answer', a.none);
  ok(a.before === null && a.landed && a.landed.cliConfig && a.landed.cliConfig.landed === true, 'a moved row: NO answer before the landing, then «landed»', a);
  ok(a.failed.cliConfig.landed === false && /exited 1/.test(a.failed.cliConfig.why) && a.refused.cliConfig.landed === false && /a worktree/.test(a.refused.cliConfig.why), 'a failed or refused landing is told by name', a);
  const NL = A.notLanded;
  const nl = { switchOn: NL([{ claude: { ok: true }, codex: { ok: false, missing: 'no-dir', error: '~/.codex not found' } }, null]), regFailed: NL([{ claude: { ok: false, error: 'the starter did not answer' } }, { receipts: [], files: [] }]),
    removalFailed: NL([{ at: 1, ok: false, why: 'the helper exited 1' }, null]), optedOut: NL([{ optedOut: true }, null]), removed: NL([{ at: 1, ok: true, receipts: [], created: [] }, null]) };
  ok(nl.switchOn === null && nl.regFailed === 'claude: the starter did not answer' && nl.removalFailed === 'the helper exited 1' && nl.optedOut === null && nl.removed === null,
    'the Integration switch\'s own answer is read too: a failed registration or removal is told by name; a CLI that has not run on this machine (no-dir) and an opt-out are no failure', nl);
  ok(/return \(landing \|\| toggled\) \? Promise\.all\(\[toggled, landing\]\) : null;/.test(src('server.js')), 'WIRING: the settings write hands back both — the switch\'s registration and the rows\' landing');
  ok(a.pending === null && a.past && a.past.cliConfig.landed === false && /has not landed on this machine within 10 s \(still writing\)/.test(a.past.cliConfig.why), 'past the bound: told «still writing», by name — never «applied»', a);
  const M = require(MC.write(ANSWER_REL, anchored(src(ANSWER_REL), "  if (!landing || typeof landing.then !== 'function') return res.json(body);", '  return res.json(body);', 'an answer that never waits'), 'no-wait-answer'));
  const am = await answerLegs(M);
  ok(am.before !== null && !('cliConfig' in am.before), 'RED (an answer that never waits): «success» before the landing, the landing never said', am.before);
  const PS = src('src/routes/persistence.js');
  ok(/const out = \{\}, spend = writeSettings\(data, out\);\n\s+answerAtLanding\(res, \{ success: true, \.\.\.\(spend \? \{ spend \} : \{\}\)[^\n]*\}, out\.landing\);/.test(PS) && /const out = \{\}; writeSettings\(merged, out\);\n\s+answerAtLanding\(res, \{ success: true, [^\n]*\}, out\.landing\);/.test(PS)
    && /if \(out\) out\.landing = landing;/.test(PS) && !/_landing\b/.test(PS),
    'WIRING (r1518): the settings POST and PATCH answer through it with THEIR OWN write\'s landing (writeSettings\' `out`) — no module-wide landing another writer could leave behind');
  ok(/const r = await fetchJson\('\/api\/agent-hooks\/uninstall', \{ method: 'POST' \}\); if \(!r \|\| r\.success === false \|\| typeof r\.error === 'string'\) showToast\(t\('The hooks were not removed — \{reason\}'/.test(src('src/lib/manage-agents.js'))
    && src('src/lib/i18n-zh.js').includes('"The hooks were not removed — {reason}":') && src('src/lib/i18n-ja.js').includes('"The hooks were not removed — {reason}":'),
    'WIRING (r1518): «Remove» says a removal that did not land (zh / ja), never «Hook removed» over it');
  // the page says it: a save whose answer carries «not landed» is a toast with the why (en / zh / ja)
  const W = "Saved in VibeSpace, but not yet in this machine's CLI files: {why}";
  const SM = src('src/lib/settings.js'), APP = src('src/lib/app.js');
  ok(/if \(j && j\.cliConfig && j\.cliConfig\.landed === false\) \{ try \{ this\.onCliConfig\?\.\(j\.cliConfig\); \}/.test(SM) && APP.includes(`this.settings.onCliConfig = (c) => { showToast(t(${JSON.stringify(W)}, { why: String((c && c.why) || '') }), { type: 'warn' }); };`)
    && src('src/lib/i18n-zh.js').includes(JSON.stringify(W) + ':') && src('src/lib/i18n-ja.js').includes(JSON.stringify(W) + ':'),
    'WIRING: the settings save hands a «not landed» answer to the page, which says it in a toast with the why (zh and ja words)');
}

console.log('⑧ r1518 (the full round\'s must): the hook root\'s watch sees a recovery on a machine where one CLI never ran');
const RW_REL = 'src/server/hook-root-watch.js';
async function watchRecovery(RW) {
  const d = path.join(ROOT, `watch-${Math.random().toString(36).slice(2, 8)}`); fs.mkdirSync(d, { recursive: true });
  const memo = path.join(d, RW.MEMO_FILE); fs.writeFileSync(memo, JSON.stringify({ cause: 'an earlier unknown root' }));
  const notices = [];
  const w = RW.create({ dataDir: d, ensureAgentHooks: () => ({ claude: { ok: true }, codex: { ok: false, missing: 'no-dir', error: '~/.codex not found — the CLI has not run on this machine; nothing is created' } }), rootRecovery: () => ({ registeredAfterError: { at: 0, error: 'EIO' } }), ownerWriteRefusal: () => null, serverNotice: (id) => { notices.push(id); return 1; }, setTimer: () => ({ unref() { } }), log: () => { } });
  w._state.attempt = 3; await w.sync();
  return { memoKept: fs.existsSync(memo), said: w._state.said, attempt: w._state.attempt, notices };
}
{
  const RWM = require(path.join(REPO, RW_REL));
  const rw = await watchRecovery(RWM);
  ok(!rw.memoKept && rw.said === true && rw.attempt === 0 && rw.notices.includes('hook-root-registered'), 'a good registration on a Claude-only machine (codex: no folder here) IS a recovery: the memo removed, the backoff reset, «registered after an earlier read error» said', rw);
  const TIP_GUARD = "      else if (r && !r.refused && !Object.values(r).some((x) => x && x.ok === false)) recovered();   // a registration that did not land is no recovery";   // stale-pins: kept (the tip's guard, rebuilt for the red control)
  const NOW_GUARD = /      else if \(r && !r\.refused && require\('\.\/landing-answer\.js'\)\.notLanded\(r\) === null\) recovered\(\);[^\n]*/;
  const rwm = await watchRecovery(require(MC.write(RW_REL, anchored(src(RW_REL), NOW_GUARD, TIP_GUARD, 'the tip\'s guard'), 'tip-guard')));
  ok(rwm.memoKept && rwm.said === false, 'RED (the tip\'s guard): «no folder here» reads as a failure — the memo kept, the recovery never said (a person keeps a warning that is no longer true)', rwm);
}

// ── r4027 (B-ddf3, lane bl-scratch): THE PLAN REACHES THE HELPER ON THE REAL STARTER ──
// The runner hands the helper its plan as VIBESPACE_CLI_CONFIG; the real starter (src/server/child-starter.js) refused every
// added name of the one secret shape, whose first half is the hub's own prefixes — so the shipped helper fell back to its
// hooks-only default plan, wrote none of the managed rows and read none of them back. Here THE REAL STARTER runs the shipped
// helper's --status through the runner on a scratch HOME, on BOTH roads (the starter's process, and the direct road a twice-
// failed starter falls back to): the helper prints a receipt of a PLANNED MANAGED ROW (claude's transcript retention).
//                                                     RED: the starter's drop of the plan's name (either road)
console.log('r4027: THE PLAN REACHES THE SHIPPED HELPER ON THE REAL STARTER (its road and the direct road) — a receipt of a planned managed row');
{
  const CS_REL = 'src/server/child-starter.js', SHIPPED = path.join(REPO, 'data', 'bin', 'vibespace-hook-register.mjs');
  const planHome = path.join(ROOT, `plan-home-${process.pid}`);
  fs.rmSync(planHome, { recursive: true, force: true }); fs.mkdirSync(path.join(planHome, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(planHome, '.claude', 'settings.json'), JSON.stringify({ cleanupPeriodDays: 36500 }, null, 2) + '\n');
  const S0 = require(path.join(REPO, SYNC_REL)).create({ serverSetting: () => undefined, harnesses: require(path.join(REPO, 'src/harnesses/index.js')), adapterRegistry: { get: () => null }, activeSessions: new Map(), hookRegistrationSafe: () => true, home: planHome, helperPath: SHIPPED, runner: { last: () => null }, log: () => {}, warn: () => {} });
  const planB64 = S0.cliConfigPlanB64();
  const planned = (HCJ.decodePlan(planB64).files || []).some((f) => f.harness === 'claude' && (f.set || []).some((x) => x.key === 'transcriptRetentionDays'));
  const viaStarter = async (CSmod, { direct = false } = {}) => {
    const st = CSmod.createChildStarter(direct ? { script: path.join(ROOT, 'no-such-starter.cjs'), guardMs: 100, log: { warn: () => {} } } : { log: { warn: () => {} } });
    try {
      if (direct) for (let i = 0; i < 2 && !st.stats().direct; i++) await st.run(process.execPath, ['-e', ''], { timeoutMs: 2000 });   // a starter that cannot start: twice ⇒ the direct road
      const Rr = R.createCliConfigRunner({ starter: st, helperPath: SHIPPED, home: planHome, timeoutMs: 15000, journal: () => {}, warn: () => {} });
      const l = await Rr.status(planB64);
      return { direct: st.stats().direct, row: (l.receipts || []).find((x) => x && x.harness === 'claude' && x.key === 'transcriptRetentionDays') || null, keys: (l.receipts || []).filter((x) => x && x.harness).length, why: l.why || null };
    } finally { try { st.closePipe(); } catch { } }
  };
  const CSm = require(path.join(REPO, CS_REL));
  const viaS = await viaStarter(CSm), viaD = await viaStarter(CSm, { direct: true });
  ok(!!(planned && viaS.direct === false && viaS.row && viaS.row.state === 'applied' && viaD.direct === true && viaD.row && viaD.row.state === 'applied'),
    'r4027: the REAL starter hands the shipped helper its plan — on the starter\'s road and on the direct road the helper prints a receipt of the planned retention row (read back as it is on disk)', { planned, viaS, viaD });
  const srcCS = src(CS_REL);
  ok(/^const PLAN_MARKS = new Set\(\['VIBESPACE_CLI_CONFIG'\]\);$/m.test(srcCS) && (srcCS.match(/PLAN_MARKS\.has\(k\)/g) || []).length === 2 && /\(!SECRET_NAME\.test\(k\) \|\| PLAN_MARKS\.has\(k\)\)\) add\[k\] = v;/.test(srcCS) && /if \(SECRET_NAME\.test\(k\) && !PLAN_MARKS\.has\(k\)\) continue;/.test(srcCS),
    'PIN r4027: ONE plan mark, matched by its whole name, read on both roads — every other name of the secret shape still refused', {});
  const DROP_S = require(MC.write(CS_REL, anchored(srcCS, '(!SECRET_NAME.test(k) || PLAN_MARKS.has(k))) add[k] = v;', '!SECRET_NAME.test(k)) add[k] = v;', 'the starter\'s road drops the plan'), 'starter-drop-plan'));
  const DROP_D = require(MC.write(CS_REL, anchored(srcCS, 'if (SECRET_NAME.test(k) && !PLAN_MARKS.has(k)) continue;', 'if (SECRET_NAME.test(k)) continue;', 'the direct road drops the plan'), 'starter-drop-plan-direct'));
  const redS = await viaStarter(DROP_S), redD = await viaStarter(DROP_D, { direct: true });
  ok(!!(!redS.row && !redD.row && redS.keys === 0 && redD.keys === 0 && redS.why === null && redD.why === null && redS.direct === false && redD.direct === true), 'RED (the release\'s drop of the plan\'s name, on each road): the helper RAN (no failure) on its hooks-only plan — no receipt of any managed row', { redS, redD });
}

clearInterval(KEEP);
if (SKIPPED.length) { console.log(counts.fail ? `\n${counts.fail} FAILED (${counts.pass} passed, ${SKIPPED.length} skipped — ${SKIPPED.join('; ')})` : `\nALL PASS (${counts.pass}, ${SKIPPED.length} skipped — ${SKIPPED.join('; ')})`); process.exit(counts.fail ? 1 : 0); }
report();
