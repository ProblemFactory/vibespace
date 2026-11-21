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
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { checker } from './lib/check.mjs';
import { scratch, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { ok, report } = checker();
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
  let bDone = false; b.then(() => { bDone = true; });
  if (st.calls[1]) st.calls[1].finish(okRun);
  const [la, lb, lc] = await Promise.all([a, b, c]);
  return { first, second, plan2, most: st.most(), same: lb === lc && la !== lb, bDone };
}

console.log('① one apply in flight, the newest waiting');
const R = require(path.join(REPO, RUNNER_REL));
{
  const q = await queueLegs(R);
  ok(q.first === 1 && q.second === 2 && q.plan2 === 'PLAN-C' && q.most === 1 && q.same, 'three quick requests: ONE run in flight, the two waiting ones coalesce into the next run with the NEWEST plan, never two runs at once', q);
  const M = require(MC.write(RUNNER_REL, anchored(src(RUNNER_REL), '    if (inFlight || !waiting) return;', '    if (!waiting) return;', 'two runs at once'), 'two-at-once'));
  const qm = await queueLegs(M);
  ok(qm.most > 1, 'RED (the queue\'s guard taken out): two helper runs at once on one file', qm);
}

console.log('② no second writer: a starter that does not answer is a failed landing, said; asked again next time');
{
  let n = 0;
  const r = R.createCliConfigRunner({ starter: { run: async () => { n++; return { unknown: true, why: 'no starter' }; } }, helperPath: '/x/h.mjs', stat: async () => { throw new Error('none'); }, journal: () => {}, warn: () => {} });
  const l1 = await r.apply(() => 'P', 'boot'), l2 = await r.apply(() => 'P', 'again');
  ok(!l1.ok && /the starter did not answer/.test(l1.why) && /nothing was written by this hub/.test(l1.why) && n === 2 && !l2.ok, 'the landing FAILS by name («the starter did not answer … nothing was written by this hub»), and the next request asks the starter again', { l1, n });
  ok(!/applyConfigPlan|writeJsonManaged|writeTomlManaged/.test(src(RUNNER_REL)) && !/applyConfigPlan\(/.test(src(SYNC_REL)), 'there is no in-process writer to fall back to: neither the runner nor harness-config-sync calls the applier');
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
  const M = require(MC.write(SYNC_REL, anchored(src(SYNC_REL), 'return cliRunner.landedWithin(cliRunner.BOUND_MS).then((g) => (g.landed ? null : g));', 'return Promise.resolve(null);', 'a gate that never waits'), 'no-wait'));
  const gm = await gateLegs(M);
  ok(gm.late === null, 'RED (a gate that never waits): the late start is never told', gm);
  const wc = src('src/ws-create.js'), sfw = src('src/settings-file-words.js');
  const gateAt = wc.indexOf('const cliLate = '), buildAt = wc.indexOf('const sessionSpec = adapter.buildSessionArgs({');
  ok(gateAt > 0 && gateAt < buildAt && /await Promise\.resolve\(cliConfigGate\(\)\)/.test(wc) && /serverNotice\?\.\(`cli-config-late-\$\{id\}`, w\.replace/.test(wc) && /CLI_CONFIG_LATE_WORDS/.test(wc),
    'WIRING: a local start awaits the gate BEFORE its args are built, and a late / failed gate is said once, by name (cli-config-late-<id>)');
  const words = require(path.join(REPO, 'src/settings-file-words.js')).CLI_CONFIG_LATE_WORDS;
  ok(/\{name\}/.test(words) && /\{why\}/.test(words) && src('src/lib/i18n-zh.js').includes(JSON.stringify(words)) && src('src/lib/i18n-ja.js').includes(JSON.stringify(words)) && sfw.includes('CLI_CONFIG_LATE_WORDS'), 'the words name the conversation and the why, in zh and ja');
}

console.log('④⑤⑥ the REAL helper on a scratch HOME — one run, created read off the loop, the env, the hook command key by key');
{
  const home = path.join(ROOT, 'home'); fs.mkdirSync(path.join(home, '.claude', 'projects'), { recursive: true });
  const genRoot = path.join(ROOT, 'gen'); fs.mkdirSync(path.join(genRoot, 'data'), { recursive: true });
  const HOME0 = process.env.HOME; process.env.HOME = home;
  try {
    let SYNC = null;
    const GEN = require(path.join(REPO, 'src/server/agent-tool-generators.js')).create({ rootDir: genRoot, port: 0, applyThisMachine: (o) => SYNC.applyThisMachine(o) });
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
    const stK = GEN.agentHooksStatus().claude;
    said.length = 0;
    const rk = await hooks();
    const kAfter = JSON.parse(fs.readFileSync(sf, 'utf8'));
    ok(stK.installed === true && stK.stale === false && rk.claude && rk.claude.ok === true && ['SessionStart', 'UserPromptSubmit', 'Stop'].every((ev) => cmdOf(kAfter, ev) === keptCmd) && !said.some((l) => l.startsWith('Hook command rewritten')),
      '(d) a kept spelling reads installed (the check starts nothing for it), and a registration over it keeps it, rewrites nothing and reads ok', { stK, rk, said });
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
  ok(a.pending === null && a.past && a.past.cliConfig.landed === false && /has not landed on this machine within 10 s \(still writing\)/.test(a.past.cliConfig.why), 'past the bound: told «still writing», by name — never «applied»', a);
  const M = require(MC.write(ANSWER_REL, anchored(src(ANSWER_REL), "  if (!landing || typeof landing.then !== 'function') return res.json(body);", '  return res.json(body);', 'an answer that never waits'), 'no-wait-answer'));
  const am = await answerLegs(M);
  ok(am.before !== null && !('cliConfig' in am.before), 'RED (an answer that never waits): «success» before the landing, the landing never said', am.before);
  ok(/answerAtLanding\(res, \{ success: true, \.\.\.\(spend \? \{ spend \} : \{\}\)/.test(src('src/routes/persistence.js')) && /_landing = onSettingsWrite\?\.\(data, prev\) \|\| null/.test(src('src/routes/persistence.js')), 'WIRING: the settings POST and PATCH answer through it, with the change hook\'s landing');
  // the page says it: a save whose answer carries «not landed» is a toast with the why (en / zh / ja)
  const W = "Saved in VibeSpace, but not yet in this machine's CLI files: {why}";
  const SM = src('src/lib/settings.js'), APP = src('src/lib/app.js');
  ok(/if \(j && j\.cliConfig && j\.cliConfig\.landed === false\) \{ try \{ this\.onCliConfig\?\.\(j\.cliConfig\); \}/.test(SM) && APP.includes(`this.settings.onCliConfig = (c) => { showToast(t(${JSON.stringify(W)}, { why: String((c && c.why) || '') }), { type: 'warn' }); };`)
    && src('src/lib/i18n-zh.js').includes(JSON.stringify(W) + ':') && src('src/lib/i18n-ja.js').includes(JSON.stringify(W) + ':'),
    'WIRING: the settings save hands a «not landed» answer to the page, which says it in a toast with the why (zh and ja words)');
}

clearInterval(KEEP);
report();
