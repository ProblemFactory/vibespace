#!/usr/bin/env node
// A SUBSCRIPTION PICK SETS THE MACHINE'S KEY HELPER ASIDE (unit «billing pick alive», ruled by 主开发 2026-11-18 01:45Z) —
// src/billing-pick.js + the ONE spawn spec of src/ws-create.js.
// A helper named in the machine's Claude settings (`apiKeyHelper`) outranks every OAuth login. 2.236.0 measured the cure (an
// inline `--settings {"apiKeyHelper":""}` overrides the file's helper) and shipped the adapter's half, but the create never
// passed `neutralizeKeyHelper`: a picked subscription billed the helper's paid credential while the page said picks bypass it.
//   ① PURE: the rule over every shape the account resolution answers (named / pool / linked / long-lived token / API key /
//      the bare CLI login / a harness no helper outranks); the settings reader; the words and the once-per-pick-and-machine key.
//   ② THE REAL ws-create (the production adapter registry, a stub pty, a stub accounts store — nothing executes) on the LOCAL
//      DTACH road: a picked subscription's line carries the neutralizer; the bare case's line is the RELEASE create's byte for
//      byte (the release's own src/ws-create.js, b06f36e90, loaded beside the tree — else the flag line cut out of this one).
//   ③ THE DAEMON PIPE road (agentd.localPipeSessions on, a stub device): the pipe session runs the same neutralized line.
//   ④ THE REMOTE roads: the real adapter + the real remote builder (src/remote-shell.js buildRemoteExec) over the flag the rule
//      answers for a remote resolution (a host-held subscription, a pick that IS the host's login, the host's own login) — and
//      the drift guards: ONE buildSessionArgs call, built AFTER the account is resolved, its args the spawn line of every road.
//   ⑤ SAID ONCE: the notice when the machine's settings name a helper (a scratch HOME), its key the same for a second start of
//      the same pick on the same machine, nothing without a helper, nothing for the bare case.
//   ⑥ RED CONTROLS: the release create bills the helper under a pick (the dormant rule); mutants of this create — the flag
//      not passed, the rule answering yes for everything, the notice without the helper check — each goes RED; and the
//      cure's (主开发 09:09Z): the file set aside at every pick, the said-once memo dropped, the notice reading the hub's env,
//      the adopted-process skip dropped, the machine named by its id.
//   THE CURE: the person's own settings file is set aside only when a helper is really named for that machine (② a case per
//      state: named / none / no file / not JSON; ⑦ a paired machine that names one, none, or does not answer); ⑦ the paired
//      machine through the real create (its ladder stood in, the REAL hosts.backendStatus over a stub device) and an ADOPTED
//      process; ⑧ a resume and a fork of a picked conversation; every «nothing said» leg waits on THE FACT (the read settled).
//   ⑨ THE THIRD STATE ON A PAIRED MACHINE (B-bc9f): every settings-file state through three roads — this machine's create, the
//      REAL device probe (src/machine-probes.js under the scratch HOME) through the REAL hosts.backendStatus, and the ssh rung run
//      by sh — the probe answers what the create answers (one rule, src/helper-fact.js); the ssh rung by its text law; RED controls.
// Run: node scripts/test-billing-pick.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { scratchDir, scratchHome, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
// (the swap guard — test-ci-gate-tiers §7b: an inline helper refuses a name that is not a string, so ok(name, cond) crashes, never passes)
const ok = (c, msg, detail) => {
  if (typeof msg !== 'string' || msg.length === 0) throw new TypeError(`ok(cond, name): the name is a ${typeof msg} — the arguments are swapped`);
  if (c) { pass++; console.log(`  ✓ ${msg}`); } else { fail++; console.log(`  ✗ ${msg}${detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 600) : ''}`); }
};
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const BP = require(path.join(REPO, 'src/billing-pick.js'));
const H = require(path.join(REPO, 'src/harnesses/index.js'));
const CLAUDE_CREDS = H.get('claude').creds;
const RELEASE = 'b06f36e90';

console.log('— ① PURE: the rule, the reader, the words');
{
  const sub = { id: 'sub-a1', kind: 'subscription' }, pool = { id: 'pool-p1', kind: 'subscription', pooled: true }, oat = { id: 'sub-o1', kind: 'subscription', oatOnly: true };
  const api = { id: 'acct-k1', kind: 'api' };
  ok(BP.setsHelperAside({ creds: CLAUDE_CREDS, account: sub }) && BP.setsHelperAside({ creds: CLAUDE_CREDS, account: pool }) && BP.setsHelperAside({ creds: CLAUDE_CREDS, account: oat }),
    'a named subscription, a pool of them and a long-lived-token subscription set the helper aside');
  ok(BP.setsHelperAside({ creds: CLAUDE_CREDS, account: null, linked: 'sub-a1' }), 'a picked subscription that runs on the machine\'s own login (it IS that login) sets it aside too');
  ok(!BP.setsHelperAside({ creds: CLAUDE_CREDS, account: null }) && !BP.setsHelperAside({ creds: CLAUDE_CREDS, account: null, linked: null }),
    'the bare «the CLI\'s own login» case (no account resolved) sets nothing aside');
  ok(!BP.setsHelperAside({ creds: CLAUDE_CREDS, account: api }), 'an API-key account sets nothing aside (no subscription to bill)');
  for (const id of H.list().map((h) => h.id).filter((x) => x !== 'claude')) {
    ok(!BP.setsHelperAside({ creds: H.get(id).creds || null, account: sub }), `${id}: a harness whose descriptor names no key helper sets nothing aside, whatever account`);
  }
  ok(CLAUDE_CREDS.keyHelper && CLAUDE_CREDS.keyHelper.setting === 'apiKeyHelper' && CLAUDE_CREDS.keyHelper.file === 'settings.json' && CLAUDE_CREDS.homeEnvVar === 'CLAUDE_CONFIG_DIR',
    'the claude descriptor names the setting and the file of the CLI\'s config dir', CLAUDE_CREDS.keyHelper);
  ok(read('src/machine-probes.js').includes(`const HELPER_ROW = { setting: '${CLAUDE_CREDS.keyHelper.setting}', file: '${CLAUDE_CREDS.keyHelper.file}' };`), 'the paired machine\'s probe reads the SAME setting in the same file (the descriptor\'s row; the page\'s warning and the rule speak of one helper)');
  const HF = require(path.join(REPO, 'src/helper-fact.js'));
  ok(BP.localHelperFact === HF.helperFactOfText && BP.namesHelper === HF.namesHelper && BP.SETTINGS_READ_MAX === HF.SETTINGS_READ_MAX && HF.SETTINGS_READ_MAX === 1 << 20,
    'ONE rule (B-bc9f): this machine\'s fact IS src/helper-fact.js\'s, the one a paired machine\'s probe runs (the bound 1 MiB)');
  const fileOf = (env, home) => BP.settingsFileOf(CLAUDE_CREDS.keyHelper, { creds: CLAUDE_CREDS, env, home });
  ok(fileOf({}, '/home/u') === '/home/u/.claude/settings.json' && fileOf({ CLAUDE_CONFIG_DIR: '/cfg/cl/' }, '/home/u') === '/cfg/cl/settings.json'
    && fileOf({ CLAUDE_CONFIG_DIR: '  ' }, '/home/u/') === '/home/u/.claude/settings.json' && fileOf({}, '') === null && BP.settingsFileOf(null, {}) === null,
    'the file read: the CLI\'s config dir (CLAUDE_CONFIG_DIR) wins, else ~/.claude; no home and no dir ⇒ nothing read');
  const row = CLAUDE_CREDS.keyHelper;
  ok(BP.namesHelper({ apiKeyHelper: '/usr/local/bin/key-helper' }, row) && !BP.namesHelper({ apiKeyHelper: '' }, row) && !BP.namesHelper({ apiKeyHelper: '  ' }, row)
    && !BP.namesHelper({}, row) && !BP.namesHelper(null, row) && !BP.namesHelper([], row) && !BP.namesHelper({ apiKeyHelper: 'x' }, null),
    'the reader: a non-empty helper is named; empty, absent, not an object or no row is not');
  const n1 = BP.helperNotice({ name: 'Fix the build', account: 'Work Max', accountId: 'sub-a1' });
  const n2 = BP.helperNotice({ name: 'Fix the build', account: 'Work Max', accountId: 'sub-a1', host: 'box-2', hostId: 'h-2' });
  ok(n1.key === 'billing-pick-helper-sub-a1-local' && n2.key === 'billing-pick-helper-sub-a1-h-2' && n1.key !== n2.key, 'the key: one per picked account and machine', [n1.key, n2.key]);
  ok(n1.words === BP.HELPER_SET_ASIDE.local && n2.words === BP.HELPER_SET_ASIDE.remote && /^Fix the build bills Work Max, the subscription you picked — the apiKeyHelper in this machine’s Claude settings is not used for it\. To bill through the helper, set its billing to «CLI login»/.test(n1.text)
    && n2.text.includes('in the Claude settings on box-2') && n2.text.includes('«CLI login @ box-2»') && !/\{\w+\}/.test(n1.text + n2.text),
    'the words: the conversation, the subscription, where the helper lives, and the door (the billing switcher\'s CLI-login entry)', [n1.text, n2.text]);
  ok(BP.helperNotice({ name: '', accountId: 'sub-a1' }).params.name === 'This conversation' && BP.helperNotice({ name: 'x' }) === null, 'a nameless conversation is «This conversation»; no account ⇒ no notice');
  const dicts = { zh: read('src/lib/i18n-zh.js'), ja: read('src/lib/i18n-ja.js') };
  for (const [lang, d] of Object.entries(dicts)) {
    for (const w of Object.values(BP.HELPER_SET_ASIDE)) ok(d.includes(JSON.stringify(w) + ':'), `${lang}: the words have a row (the page says them in ${lang})`, w.slice(0, 60));
  }
  ok(read('scripts/i18n-check.mjs').includes("req('../src/billing-pick.js').HELPER_SET_ASIDE"), 'i18n-check: the words are a notice-key table (a missing translation fails the build)');
}

console.log('— ② the REAL ws-create on the local dtach road');
const W = (f) => '/w/' + f;
const EXE = '/opt/bin/claude';
const { createAdapterRegistry } = require(path.join(REPO, 'src/adapters/index.js'));
const registry = () => createAdapterRegistry({
  claudeCmd: EXE, codexCmd: '/opt/bin/codex', chatWrapper: W('chat-wrapper.js'), codexChatWrapper: W('codex-chat-wrapper.js'),
  acpWrapper: W('acp-wrapper.js'), acpCommands: { opencode: '/opt/bin/opencode', antigravity: '/opt/bin/agy' }, ptyWrapper: W('pty-wrapper.js'), buffersDir: '/b',
});
// the account store's answers, by what the create asks (accounts.resolveForSpawn's shapes, src/accounts.js)
const ACCOUNTS = {
  'sub-a1': { rec: { id: 'sub-a1', name: 'Work Max', type: 'subscription' }, spawn: { id: 'sub-a1', name: 'Work Max', kind: 'subscription', localEnv: { CLAUDE_SECURESTORAGE_CONFIG_DIR: '/stub/subs/sub-a1' }, secret: null } },
  'pool-p1': { rec: { id: 'pool-p1', name: 'Team pool', type: 'pooled' }, spawn: { id: 'pool-p1', name: 'Team pool', kind: 'subscription', pooled: true, poolTarget: 'sub-a1', linkPath: '/stub/subs/pool-p1', localEnv: { CLAUDE_SECURESTORAGE_CONFIG_DIR: '/stub/subs/pool-p1' }, secret: null } },
  'acct-k1': { rec: { id: 'acct-k1', name: 'Console key', type: 'api' }, spawn: { id: 'acct-k1', name: 'Console key', tail: 'tail', kind: 'api', localEnv: { ANTHROPIC_API_KEY: ['not', 'a', 'key'].join('-') }, secret: { var: 'ANTHROPIC_API_KEY', value: ['not', 'a', 'key'].join('-') } } },
};
function accountsStub({ defaultId = null } = {}) {
  const asked = [];
  return {
    asked, _state: { accounts: Object.values(ACCOUNTS).map((a) => a.rec), defaultAccountId: defaultId },
    resolveForSpawn(requested, backend) { asked.push({ requested, backend }); if (requested === 'subscription') return null; const id = requested || defaultId; if (!id) return null; const a = ACCOUNTS[id]; if (!a) throw new Error('unknown account: ' + id); return { ...a.spawn }; },
    get: (id) => (ACCOUNTS[id] ? { ...ACCOUNTS[id].rec } : null), poolMembership: () => [], poolCurrent: () => 'sub-a1',
  };
}
const SOCK = scratchDir('bpick-sock'), BUF = scratchDir('bpick-buf'), CWD = scratchDir('bpick-cwd');
// THE FACT A LEG WAITS ON (the cure: never a fixed window): the create's read of the machine's settings file — its open refused, or
// its handle closed — or a paired machine's backend status answered or failed; `factDone` settles a turn after that (the create's
// own continuation — judge, then say or not — runs first)
function factSpy({ hangOpen = false } = {}) {
  let done = null; const settled = new Promise((r) => { done = r; });
  // every open the create makes is a read of THE FACT (ws-create opens no other file through fs.promises.open) — since cure 2 one start
  // reads several files at once (the config dir's, the project's two, the person's own): the fact is settled when ALL have finished
  let pending = 0;
  const turn = () => setImmediate(() => setImmediate(done));
  const end = () => { if (--pending === 0) turn(); };
  const reads = [];
  const open = async (file, ...rest) => {
    reads.push(String(file));
    if (hangOpen) return new Promise(() => { });   // a config dir on a stuck mount: the open never answers
    pending++;
    let fh;
    try { fh = await fs.promises.open(file, ...rest); } catch (e) { end(); throw e; }
    const close = fh.close.bind(fh);
    fh.close = async () => { try { return await close(); } finally { end(); } };
    return fh;
  };
  const promises = new Proxy(fs.promises, { get: (t, k) => (k === 'open' ? open : t[k]) });
  return { fs: new Proxy(fs, { get: (t, k) => (k === 'promises' ? promises : t[k]) }), reads, settled, turn };
}
const within = (p, ms = 5000) => Promise.race([p.then(() => true), new Promise((r) => setTimeout(() => r(false), ms))]);
/** ONE create handler (its own said-once memo, as one hub run) — `create` runs one create through it */
function makeCreate(mod, { accounts = accountsStub(), pipe = false, hosts: hostsIn = null, env = {}, helperFactMs = undefined, hangOpen = false, failSpawn = false } = {}) {
  const active = new Map(), noop = () => undefined, pipes = [];
  let st = null;   // the current create's record
  const hosts = hostsIn || (pipe ? { device: async () => ({ openPipeSession: async (spec) => { pipes.push(spec); return { pid: 4343, write() { }, kill() { } }; } }) } : null);
  let spy = factSpy({ hangOpen });
  const fsOf = new Proxy({}, { get: (t, k) => spy.fs[k] });
  const ctx = new Proxy({
    activeSessions: active, WS_OPEN: 1, sessionCounterRef: { value: 0 }, adapterRegistry: registry(), hosts, accounts, os, fs: fsOf, path,
    execFileSync: require('child_process').execFileSync, ensureDir: (d) => fs.mkdirSync(d, { recursive: true }),
    SOCKETS_DIR: SOCK, BUFFERS_DIR: BUF, PTY_WRAPPER: W('pty-wrapper.js'), CHAT_WRAPPER: W('chat-wrapper.js'),
    NODE_CMD: '/n/node', DTACH_CMD: '/stub/dtach', ENV_CMD: '/usr/bin/env', CLAUDE_CMD: EXE, EDITOR_CMD: '/stub/editor/code', AGENT_BIN_DIR: '/stub/bin', PORT: 1, X_ENV: {},
    cliCmds: { forSpawn: async (b, c) => c }, USAGE_STATUSLINE_CMD: '/stub/vibespace-usage', userStatuslineCmd: () => '',
    serverSetting: (k) => (pipe && k === 'agentd.localPipeSessions' ? true : undefined), harnessSetting: noop, harnessDeclares: () => false, harnessSpawnSettings: () => ({}),
    integrationEnabled: () => true, readSessionMeta: () => null, readLayouts: () => ({}), getSyncStore: () => null,
    serverNotice: (key, text, o) => { st.notices.push({ key, text, ...(o || {}) }); return 1; },
    pty: { spawn: (cmd, args, opts) => { if (failSpawn) throw new Error('the pty refused the spawn (stand-in)'); st.spawned.push({ cmd, args, env: opts.env }); return { pid: 4242, onData() { }, onExit() { }, write() { }, resize() { }, kill() { } }; } },
    setupSessionPty: (s, id, p) => { s.pty = p; },
  }, { get: (t, k) => (k in t ? t[k] : (typeof k === 'string' && /^[a-z]/.test(k) ? noop : undefined)) });
  const handler = mod.createWsCreateHandler({
    ctx, agentEnv: () => ({ PATH: '/usr/bin:/bin', HOME: os.homedir(), ...env }), crashLoopRef: { map: new Map() }, noConvoRef: { map: new Map() },
    execFileAsync: async () => ({ stdout: '', stderr: '' }), pickCodexThreadCandidate: () => null,
    getSessionKey: (s) => `${s.backend}:${s.backendSessionId}`, normalizeComparablePath: (p) => p,
    ...(helperFactMs ? { helperFactMs } : {}),   // the factory's seam: the bound's own legs
  });
  return {
    hosts,
    async create(data, { wait = 0 } = {}) {
      spy = factSpy({ hangOpen });
      if (hosts && hosts._onFact) hosts._onFact = spy.turn;
      st = { sent: [], spawned: [], pipes, notices: [], accounts, reads: spy.reads, factDone: spy.settled };
      const before = new Set(active.keys());
      await handler({ readyState: 1, send: (t) => st.sent.push(JSON.parse(t)) }, { type: 'create', mode: 'chat', backend: 'claude', cwd: CWD, reqId: 'r1', ...data }, new Set());
      // a leg that asks for the notice waits for THE FACT (the read settled), bounded — never a fixed window
      if (wait) await within(st.factDone, wait);
      const [id, session] = [...active.entries()].find(([k]) => !before.has(k)) || [];
      return { ...st, id, session };
    },
  };
}
const drive = (mod, data, opts = {}) => makeCreate(mod, opts).create(data, opts);
/** the line a road runs (dtach's argv from node on, or the pipe's argv) → {line, settings} | {why} */
function lineOf(x, road = 'dtach') {
  const errs = x.sent.filter((m) => m.type === 'error').map((m) => m.message || m.code);
  let line = null;
  if (road === 'pipe') { const p = x.pipes[0]; if (p) line = [p.cmd, ...p.args]; }
  else { const sp = x.spawned[0]; if (sp && sp.cmd === '/stub/dtach') line = sp.args.slice(sp.args.indexOf('/n/node')); }
  if (!line || !x.session) return { why: `no ${road} spawn (${errs.join(' | ') || 'no error'})` };
  const i = line.indexOf('--settings');
  let settings = null;
  try { settings = i >= 0 ? JSON.parse(line[i + 1]) : null; } catch { settings = undefined; }
  return { line, settings };
}
const neutralized = (l) => !!l.settings && Object.prototype.hasOwnProperty.call(l.settings, 'apiKeyHelper') && l.settings.apiKeyHelper === '';
const carriesNone = (l) => !!l.line && !(l.settings && Object.prototype.hasOwnProperty.call(l.settings, 'apiKeyHelper'));
// the session id and the token differ per create; everything else on the line must not
const sameLine = (a, b) => !!a.line && !!b.line && JSON.stringify(a.line.map((w) => w.replace(/sess-\d+-\d+/g, 'SID'))) === JSON.stringify(b.line.map((w) => w.replace(/sess-\d+-\d+/g, 'SID')));

const wsCreate = require(path.join(REPO, 'src/ws-create.js'));
const M = mutantCopies('billing-pick', REPO);
const SRC = read('src/ws-create.js');
// THE RELEASE's create, loaded beside the tree (its requires reach this tree's modules) — else (no history on this clone) the
// flag line cut out of this create, which is what the release did: it never passed the flag
const FLAG_LINE = '            neutralizeKeyHelper: keyHelperOff,\n';
let releaseSrc = null;
try { releaseSrc = execFileSync('git', ['show', `${RELEASE}:src/ws-create.js`], { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { releaseSrc = null; }
const RELEASE_HERE = !!releaseSrc && !releaseSrc.includes('neutralizeKeyHelper');
let skipped = 0;
const skip = (msg) => { skipped++; console.log(`  - SKIP ${msg} (the release ${RELEASE} is not in this clone's history)`); };
// the release's own create where the clone has it; the flag cut out of THIS create is the red control either way (the release never passed it)
const release = RELEASE_HERE ? M.load('src/ws-create.js', releaseSrc, 'release-create') : null;
const flagless = M.load('src/ws-create.js', SRC.replace(FLAG_LINE, ''), 'flag-cut');
ok(SRC.split(FLAG_LINE).length === 2, 'setup: the create passes the flag on ONE line (the mutants below cut it)');

const PICKS = [['a named subscription', 'sub-a1'], ['a pool of subscriptions', 'pool-p1']];
const home0 = process.env.HOME;
const HOME = scratchHome('bpick-home');
process.env.HOME = HOME;
ok(os.homedir() === HOME && HOME !== home0, 'setup: the create runs under a scratch HOME (the real ~/.claude is never read)', [os.homedir(), HOME]);
const SETTINGS = path.join(HOME, '.claude', 'settings.json');
// a helper named / a settings file that names none / no settings file at all / a file that is not JSON
const helperOn = (on) => { if (on === 'missing') fs.rmSync(SETTINGS, { force: true }); else fs.writeFileSync(SETTINGS, on === 'garbled' ? '{ "apiKeyHelper": ' : on === 'empty' ? '' : JSON.stringify(on ? { apiKeyHelper: '/usr/local/bin/key-helper' } : { theme: 'dark' })); };
const cfg0 = process.env.CLAUDE_CONFIG_DIR;
delete process.env.CLAUDE_CONFIG_DIR;   // the CLI's config dir is ~/.claude here unless a leg says otherwise
helperOn(true);
const runs = {};
for (const [what, id] of PICKS) {
  const x = await drive(wsCreate, { accountId: id }, { wait: 5000 });
  const l = lineOf(x);
  runs[id] = x;
  ok(!l.why && neutralized(l), `${what} (${id}): the dtach line's ONE --settings carries apiKeyHelper "" (the helper set aside)`, l.why || l.settings);
  ok(!l.why && l.line.filter((w) => w === '--settings').length === 1, `${what}: …in the ONE --settings flag`, l.line);
  ok(x.session && x.session._accountId === id, `${what}: the conversation is badged as the pick it bills`, x.session && x.session._accountId);
}
{
  const x = await drive(wsCreate, {}, { accounts: accountsStub({ defaultId: 'sub-a1' }) });
  ok(neutralized(lineOf(x)), 'the default subscription the person starred in Manage agents is their pick too: its start sets the helper aside (a resume names it as the account anyway)', lineOf(x).settings);
}
const BARE = [['the «CLI login» entry', { accountId: 'subscription' }, {}], ['no pick and no default', {}, {}], ['an API-key account', { accountId: 'acct-k1' }, {}]];
for (const [what, data] of BARE) {
  const now = lineOf(await drive(wsCreate, data));
  ok(carriesNone(now), `${what}: the line carries no apiKeyHelper`, now.why || now.settings);
  if (release) { const rel = lineOf(await drive(release, data)); ok(sameLine(now, rel), `${what}: the line is the release create's, byte for byte`, [now.line, rel.line]); }
  else skip(`${what}: the line against the release create's`);
}
// a person's own --settings FILE (B-8dcf part two, alive from this unit): under a pick the file is set aside for that start — ONLY WHEN
// THAT IS NEEDED (the cure, 主开发 09:09Z): the machine's settings name a helper (said «billing»), or that fact cannot be read (billing
// wins, said «billingUnread»); a machine naming none: the file applies WHOLE, as on the release. With no account the file governs.
const FILE = ['--settings', '/home/u/my-settings.json'];
const fileKept = (l) => !l.why && l.line[l.line.indexOf('--settings') + 1] === '/home/u/my-settings.json' && l.line.filter((w) => w === '--settings').length === 1;
const saidKind = (x, k) => x.notices.filter((n) => n.key.startsWith(`settings-file-${k}-`)).length;
{
  const x = await drive(wsCreate, { accountId: 'sub-a1', extraArgs: FILE });
  const l = lineOf(x);
  ok(neutralized(l) && !l.line.includes('/home/u/my-settings.json') && x.notices.some((n) => n.key.startsWith('settings-file-billing-') && n.i18n && /set its billing to «CLI login»/.test(n.i18n.key) && /name an apiKeyHelper/.test(n.i18n.key)),
    'a pick + the person\'s settings file on a machine whose settings NAME a helper: the file is set aside for that start (the neutralizer rides the one inline flag) and that is SAID — why, and the CLI-login door', [l.settings, x.notices.map((n) => n.key)]);
  ok(x.reads.filter((f) => f === SETTINGS).length === 1 && new Set(x.reads).size === x.reads.length, 'the fact was read ONCE for that start (before the build; the notice reuses it) — each of its files once', x.reads);
  for (const [what, state, want] of [['names NO helper', false, 'whole'], ['has no settings file at all', 'missing', 'whole'], ['has an EMPTY settings file (it names nothing)', 'empty', 'whole'], ['has a settings file that is not JSON', 'garbled', 'unread']]) {
    helperOn(state);
    const y = await drive(wsCreate, { accountId: 'sub-a1', extraArgs: FILE, outputStyle: 'Explanatory' });
    const m = lineOf(y);
    if (want === 'whole') ok(fileKept(m) && !(m.settings && 'apiKeyHelper' in m.settings) && saidKind(y, 'billing') + saidKind(y, 'billingUnread') === 0 && saidKind(y, 'outputStyle') === 1 && y.session && JSON.stringify(y.session._settingsFileGoverns) === JSON.stringify(['outputStyle', 'noFallback', 'jobNotices']),
      `a pick + the person's settings file on a machine that ${what}: the file applies WHOLE, as on the release (its hooks and rules kept; nothing set aside, nothing of billing said; the three stand down as with no pick and the file governs every kind)`, [m.line, y.notices.map((n) => n.key), y.session && y.session._settingsFileGoverns]);
    else ok(neutralized(m) && !m.line.includes('/home/u/my-settings.json') && saidKind(y, 'billingUnread') === 1 && saidKind(y, 'billing') === 0 && y.notices.some((n) => /could not be read/.test((n.i18n && n.i18n.key) || '')),
      `a pick + the person's settings file on a machine that ${what}: the fact cannot be read — billing wins (the file set aside) and the notice says so`, [m.settings, y.notices.map((n) => n.key)]);
  }
  helperOn(true);
  const b = await drive(wsCreate, { accountId: 'subscription', extraArgs: FILE });
  const bl = lineOf(b);
  ok(!bl.why && bl.line[bl.line.indexOf('--settings') + 1] === '/home/u/my-settings.json' && !b.notices.some((n) => n.key.startsWith('settings-file-billing-')), 'the bare case + a settings file: the file governs, nothing set aside', bl.line);
  if (release) { const r = lineOf(await drive(release, { accountId: 'subscription', extraArgs: FILE })); ok(sameLine(bl, r), 'the bare case + a settings file: the release create\'s line, byte for byte', [bl.line, r.line]); }
  else skip('the bare case + a settings file against the release create\'s line');
}

// B-e7c0 — WHERE THIS MACHINE CAN READ THE PERSON'S OWN SETTINGS FILE, A PICK THAT MUST SET IT ASIDE MERGES IT INSTEAD: the start's one
// --settings names a file of the conversation's own (<buffers>/<id>.settings, 0600) = the person's file (its hooks, its deny rules, its
// env) + the override + what this start adds; NOTHING of the person's rides argv; nothing is set aside, so nothing of billing is said.
// A file that is no JSON object is set aside as before (said); a merged file that cannot be written sets the file aside the same way
// (only what this start adds — never the person's values on the line).
const OWN = path.join(CWD, 'my-own-settings.json'), OWN_MARK = `person-${process.pid}-${Date.now().toString(36)}`;
const PAID_KEY = ['sk', 'ant', 'api03', 'stand-in'].join('-');   // built at run time: a person's file that also names who bills
const PERSON = { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo checked' }] }] }, permissions: { deny: ['Bash(rm -rf:*)'] }, env: { PERSON_MARK: OWN_MARK, ANTHROPIC_API_KEY: PAID_KEY } };
const ownLine = (x) => { const l = lineOf(x); const at = l.line ? l.line[l.line.indexOf('--settings') + 1] : null; let disk = null, mode = null; try { disk = JSON.parse(fs.readFileSync(at, 'utf8')); mode = fs.statSync(at).mode & 0o777; } catch { } return { ...l, at, disk, mode }; };
const merged = (o, x) => !o.why && o.at === path.join(BUF, `${x.id}.settings`) && !!o.disk && o.disk.apiKeyHelper === '' && JSON.stringify(o.disk.hooks) === JSON.stringify(PERSON.hooks) && JSON.stringify(o.disk.permissions && o.disk.permissions.deny) === JSON.stringify(PERSON.permissions.deny) && (o.disk.permissions.allow || []).some((r) => /^Bash\(vibespace-/.test(r)) && o.disk.env?.PERSON_MARK === OWN_MARK && o.mode === 0o600 && !o.line.join(' ').includes(OWN_MARK) && o.line.filter((w) => w === '--settings').length === 1;
{
  helperOn(true);
  fs.writeFileSync(OWN, JSON.stringify(PERSON));
  const x = await drive(wsCreate, { accountId: 'sub-a1', extraArgs: ['--settings', OWN], outputStyle: 'Explanatory' });
  const o = ownLine(x);
  ok(merged(o, x) && o.disk.outputStyle === 'Explanatory' && !('ANTHROPIC_API_KEY' in o.disk.env) && !JSON.stringify(o.disk).includes(PAID_KEY) && saidKind(x, 'billing') + saidKind(x, 'billingUnread') + saidKind(x, 'outputStyle') === 0 && x.reads.filter((f) => f === OWN).length === 1,
    'B-e7c0 a pick + the person\'s settings file on a machine whose settings NAME a helper: MERGED, not set aside — the line\'s one --settings is <id>.settings (0600): the person\'s hooks, deny rules and env + apiKeyHelper "" + what this start adds (the output style, the agent tools\' allow rules beside the person\'s deny); an env name that decides who bills is NOT carried (the pick decides); none of the person\'s values on argv; nothing of billing said; the file read ONCE (the fact\'s own read)', { at: o.at, mode: o.mode, disk: o.disk, notices: x.notices.map((n) => n.key), reads: x.reads.filter((f) => f === OWN).length });
  helperOn('garbled');
  const u = ownLine(await drive(wsCreate, { accountId: 'sub-a1', extraArgs: ['--settings', OWN] }));
  helperOn(true);
  ok(!u.why && u.disk && u.disk.env?.PERSON_MARK === OWN_MARK && u.disk.apiKeyHelper === '', 'B-e7c0 …the machine\'s fact cannot be read (billing wins): merged the same way, never set aside', { at: u.at, disk: u.disk });
  fs.writeFileSync(OWN, JSON.stringify([PERSON]));
  const a = await drive(wsCreate, { accountId: 'sub-a1', extraArgs: ['--settings', OWN] });
  const al = lineOf(a);
  ok(neutralized(al) && !al.line.includes(OWN) && !fs.existsSync(path.join(BUF, `${a.id}.settings`)) && saidKind(a, 'billing') === 1, 'B-e7c0 a person\'s file that is no JSON object (an array) is set aside as before — the override inline, said «billing», no file of the conversation\'s own', [al.settings, a.notices.map((n) => n.key)]);
  // a person's file that ITSELF says apiKeyHelper "" (the reader's case: a value equal to the override must never drop it)
  fs.writeFileSync(OWN, JSON.stringify({ ...PERSON, apiKeyHelper: '' }));
  if (typeof process.getuid === 'function' && process.getuid() === 0) skip('B-e7c0 the unwritable buffers folder (run as root, a chmod cannot refuse)');
  else {
    fs.chmodSync(BUF, 0o500);
    let w = null;
    try { w = await drive(wsCreate, { accountId: 'sub-a1', extraArgs: ['--settings', OWN] }); } finally { fs.chmodSync(BUF, 0o700); }
    const wl = lineOf(w), deny = (wl.settings && wl.settings.permissions && wl.settings.permissions.deny) || [];
    ok(neutralized(wl) && !wl.line.join(' ').includes(OWN_MARK) && !wl.line.join(' ').includes(PAID_KEY) && !(wl.settings && wl.settings.hooks) && !deny.includes('Bash(rm -rf:*)') && !fs.existsSync(path.join(BUF, `${w.id}.settings`)) && saidKind(w, 'billing') === 1,
      'B-e7c0 a merged file that cannot be written (the buffers folder read-only): the RELEASE\'S SET-ASIDE — the override kept (even when the person\'s own file says apiKeyHelper ""), none of the person\'s values (hooks, deny rules, env) on the line, and the set-aside SAID («billing»)', [wl.settings || wl.why, w.notices.map((n) => n.key)]);
  }
}

// B-e7c0 CURE (主开发 07:55Z, the must): the merged copy drops EVERY name the tree's own rule counts — ONE list (src/claude-route-
// names.js) src/managed-claude-settings.js and the merge both read — in ANY case, a switch when present, plus the cloud credential
// commands; the drop is SAID once, by name, with the door to the pick. A start that fails after the file was written removes it; the
// end paths take it (THE ONE LIST). The paired-machine guard has its red control.
{
  const MCS = require(path.join(REPO, 'src/managed-claude-settings.js')), RN = require(path.join(REPO, 'src/claude-route-names.js'));
  const every = [...MCS.ENV_NAMES, ...MCS.ENV_SWITCHES];
  const envAll = Object.fromEntries(every.map((n, k) => [k === 0 ? n.toLowerCase() : n, k % 2 ? '0' : 'x']));
  const got = BP.ownSettingsOf(JSON.stringify({ hooks: {}, env: { ...envAll, KEEP_ME: 'yes' }, awsAuthRefresh: 'aws sso login', awsCredentialExport: 'aws export', gcpAuthRefresh: 'gcloud auth login' }));
  const left = Object.keys(got.settings.env).filter((k) => k !== 'KEEP_ME');
  ok(MCS.ENV_NAMES === RN.ENV_NAMES && MCS.ENV_SWITCHES === RN.ENV_SWITCHES && every.length > 100 && left.length === 0 && got.settings.env.KEEP_ME === 'yes'
    && !['awsAuthRefresh', 'awsCredentialExport', 'gcpAuthRefresh'].some((k) => k in got.settings) && got.dropped.length === every.length + 3 && 'hooks' in got.settings,
    `B-e7c0 THE CENSUS: every one of the ${every.length} names the managed rule counts (ONE list, the same objects; its switches whatever their value; one in lower case) is dropped from a merged copy and named; a name that decides nothing stays; the three cloud credential commands go`, { left, dropped: got.dropped.length });
  helperOn(true);
  const FOUNDRY_KEY = ['foundry', 'key', 'stand', 'in'].join('-');
  fs.writeFileSync(OWN, JSON.stringify({ ...PERSON, env: { ...PERSON.env, CLAUDE_CODE_USE_FOUNDRY: '1', ANTHROPIC_FOUNDRY_API_KEY: FOUNDRY_KEY, claude_config_dir: '/srv/another-login' }, awsAuthRefresh: 'aws sso login --profile other' }));
  const f = await drive(wsCreate, { accountId: 'sub-a1', extraArgs: ['--settings', OWN] });
  const fo = ownLine(f), fenv = (fo.disk && fo.disk.env) || {}, said = f.notices.filter((n) => n.key.startsWith('settings-file-mergeDropped-'));
  const gone = (n) => !Object.keys(fenv).some((k) => k.toUpperCase() === n.toUpperCase());
  ok(merged(fo, f) && gone('CLAUDE_CODE_USE_FOUNDRY') && gone('ANTHROPIC_FOUNDRY_API_KEY') && gone('CLAUDE_CONFIG_DIR') && !('awsAuthRefresh' in fo.disk) && !JSON.stringify(fo.disk).includes(FOUNDRY_KEY)
    && said.length === 1 && ['CLAUDE_CODE_USE_FOUNDRY', 'ANTHROPIC_FOUNDRY_API_KEY', 'claude_config_dir', 'awsAuthRefresh', 'ANTHROPIC_API_KEY'].every((n) => said[0].text.includes(n)) && /«CLI login»/.test(said[0].text) && !said[0].text.includes(FOUNDRY_KEY),
    'B-e7c0 a person\'s Foundry road (its switch and its key), another login\'s config dir (lower case) and a cloud credential command in the merged file: none on disk — and SAID once, by name only (never a value), with the door to the pick', { env: Object.keys(fenv), said: said.map((n) => n.text) });
  // a start that FAILS after its merged file was written takes the file with it
  const before = new Set(fs.readdirSync(BUF).filter((n) => n.endsWith('.settings')));
  const fail = await makeCreate(wsCreate, { failSpawn: true }).create({ accountId: 'sub-a1', extraArgs: ['--settings', OWN] });
  const orphan = () => fs.readdirSync(BUF).filter((n) => n.endsWith('.settings') && !before.has(n));
  for (let k = 0; k < 100 && orphan().length; k++) await new Promise((r) => setTimeout(r, 20));
  ok(fail.sent.some((m) => m.type === 'error' && /Failed to spawn session/.test(m.message || '')) && orphan().length === 0, 'B-e7c0 a start that fails after its merged file was written removes the file (no end path knows a conversation that never registered)', orphan());
  // the end paths: THE ONE LIST of a wrapper's files takes <id>.settings
  const WF = require(path.join(REPO, 'src/server/wrapper-files.js'));
  const at = fo.at;
  WF.removeWrapperFiles(BUF, f.id);
  for (let k = 0; k < 100 && fs.existsSync(at); k++) await new Promise((r) => setTimeout(r, 20));
  ok(WF.WRAPPER_FILE_KINDS.includes('settings') && !fs.existsSync(at), 'B-e7c0 the end paths take the merged file: removeWrapperFiles (the kill, the exit teardown, a duplicate retired at boot) removes <id>.settings', at);
}

// B-e7c0 OWED (主开发 09:30Z): the person's OWN file over the bound (SETTINGS_READ_MAX) and one whose read FAILS are unread
// themselves — never merged: set aside, said, no merged file written
{
  helperOn(true);
  const settingsFiles = () => new Set(fs.readdirSync(BUF).filter((n) => n.endsWith('.settings')));
  const scene = async (what, prep, undo = () => { }) => {
    const before = settingsFiles();
    prep();
    let x = null;
    try { x = await drive(wsCreate, { accountId: 'sub-a1', extraArgs: ['--settings', OWN] }); } finally { undo(); }
    const l = lineOf(x), written = [...settingsFiles()].filter((n) => !before.has(n));
    return { what, ok: !l.why && neutralized(l) && !l.line.includes(OWN) && !l.line.join(' ').includes(OWN_MARK) && written.length === 0 && saidKind(x, 'billing') + saidKind(x, 'billingUnread') === 1, written, notes: x.notices.map((n) => n.key), settings: l.settings || l.why };
  };
  const over = await scene('over the bound', () => fs.writeFileSync(OWN, JSON.stringify({ ...PERSON, pad: 'x'.repeat(BP.SETTINGS_READ_MAX) })));
  ok(over.ok, 'B-e7c0 a person\'s own settings file OVER the read bound (SETTINGS_READ_MAX): unread, never merged — the file set aside, said, no merged file written', over);
  if (typeof process.getuid === 'function' && process.getuid() === 0) skip('B-e7c0 an own file whose read fails (run as root, a chmod cannot refuse)');
  else {
    const failed = await scene('a read that fails', () => { fs.writeFileSync(OWN, JSON.stringify(PERSON)); fs.chmodSync(OWN, 0o000); }, () => fs.chmodSync(OWN, 0o600));
    ok(failed.ok, 'B-e7c0 a person\'s own settings file whose READ FAILS (no permission): unread, never merged — set aside, said, no merged file written', failed);
  }
  fs.writeFileSync(OWN, JSON.stringify(PERSON));
}

console.log('— ③ the DAEMON PIPE road (agentd.localPipeSessions)');
{
  const x = await drive(wsCreate, { accountId: 'sub-a1' }, { pipe: true });
  const l = lineOf(x, 'pipe');
  ok(!l.why && neutralized(l) && x.spawned.length === 0, 'a picked subscription on the pipe road: the pipe session runs the neutralized line (no dtach behind it)', l.why || l.settings);
  const d = lineOf(runs['sub-a1']);
  ok(!l.why && !d.why && JSON.stringify(l.line.slice(l.line.indexOf(EXE))) === JSON.stringify(d.line.slice(d.line.indexOf(EXE))), '…the CLI\'s argv on the pipe is the dtach road\'s, word for word (ONE line, two transports)');
  const b = lineOf(await drive(wsCreate, { accountId: 'subscription' }, { pipe: true }), 'pipe');
  ok(carriesNone(b), 'the bare case on the pipe road carries none', b.why || b.settings);
}

console.log('— ④ the REMOTE roads: the real adapter + the real remote builder, and the drift guards');
{
  const { ClaudeCodeAdapter } = require(path.join(REPO, 'src/adapters/claude-code.js'));
  const { buildRemoteExec, buildRemoteShellPrelude } = require(path.join(REPO, 'src/remote-shell.js'));
  const ad = new ClaudeCodeAdapter({ claudeCmd: '/usr/bin/claude', chatWrapper: '/w/chat', ptyWrapper: '/w/pty', buffersDir: '/b' });
  const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
  const settingsOfLine = (s) => { const m = /'--settings' '(\{[^']*\})'/.exec(s); try { return m ? JSON.parse(m[1]) : null; } catch { return null; } };
  // the three remote resolutions ws-create's account block answers (src/ws-create.js: host-held dir, the host's login BEING the pick, the host's own login)
  const SHAPES = [
    ['a host-held subscription (the pick\'s own dir on the host)', { account: { id: 'sub-a1', kind: 'subscription', _hostSubReady: true, remoteCreds: { dirName: 'subs/sub-a1', envVar: 'CLAUDE_SECURESTORAGE_CONFIG_DIR' } } }, true],
    ['a pick that IS the host\'s own login (linked)', { account: null, linked: 'sub-a1' }, true],
    ['the host\'s own login (no pick, or a default that cannot reach the host)', { account: null, linked: null }, false],
  ];
  for (const mode of ['chat', 'terminal']) {
    for (const [what, shape, want] of SHAPES) {
      const flag = BP.setsHelperAside({ creds: CLAUDE_CREDS, ...shape });
      const args = ad.buildSessionArgs({ cwd: '/home/u/proj', mode, neutralizeKeyHelper: flag }).args;
      // the ssh keeper tail, the ssh/dial agentd pipe and the dial pty all compose `rcmd …rargs.map(shq)` through buildRemoteExec
      const keeper = buildRemoteExec({ cwd: '/home/u/proj', shq, pre: buildRemoteShellPrelude({ toolsOnPath: true }), parts: ['TERM=xterm-256color'], tail: ' node "$HOME/.vibespace/bin/vibespace-remote-keeper" run \'sess-1\' __VS_OFFSET__ -- ' + ['claude', ...args.map(shq)].join(' ') });
      const pipeLine = buildRemoteExec({ cwd: '/home/u/proj', shq, pre: buildRemoteShellPrelude({ toolsOnPath: true }), parts: ['claude', ...args.map(shq)] });
      const got = [keeper, pipeLine].map((s) => { const o = settingsOfLine(s); return !!o && o.apiKeyHelper === ''; });
      ok(got.every((g) => g === want), `${mode}: ${what} ⇒ ${want ? 'the remote line carries apiKeyHelper "" (quoted like every arg)' : 'the remote line carries none'}`, got);
      if (!want) ok(JSON.stringify(args) === JSON.stringify(ad.buildSessionArgs({ cwd: '/home/u/proj', mode }).args), `${mode}: …and its args are the ones the release built (the flag off = the option never passed)`);
    }
  }
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  const iResolve = code.indexOf('accounts.resolveForSpawn('), iRule = code.indexOf('const keyHelperOff = BILLPICK.setsHelperAside({ creds: harness && harness.creds, account: spawnAccount, linked: linkedAccountId });'), iBuild = code.indexOf('const sessionSpec = adapter.buildSessionArgs({');
  ok((code.match(/\.buildSessionArgs\(/g) || []).length === 1, 'drift guard: ONE buildSessionArgs call in the create (no second spec a road could run)');
  ok(iResolve > 0 && iRule > iResolve && iBuild > iRule && code.slice(iBuild, code.indexOf('});', iBuild)).includes('neutralizeKeyHelper: keyHelperOff,'),
    'drift guard: the account is resolved, THEN the rule is asked, THEN the one spec is built with its answer', [iResolve, iRule, iBuild]);
  const iSpawnArgs = code.indexOf('let spawnArgs = sessionSpec.args || [];');
  const ladders = ['spawnFor(h).terminal(', 'spawnFor(h).chat(', 'spawnFor(null)[sessionMode]('].map((s) => code.indexOf(s));
  ok(iSpawnArgs > iBuild && ladders.every((i) => i > iSpawnArgs), 'drift guard: every road (the ssh / dial ladders and this machine\'s) starts from spawnArgs = the spec\'s args', [iSpawnArgs, ladders]);
  const ssh = read('src/spawn/ssh.js'), dial = read('src/spawn/dial.js');
  ok(/rcmd, \.\.\.rargs\.map\(shq\)/.test(ssh) && /\.\.\.spawnArgs\.map\(shq\)|\.\.\.rargs\.map\(shq\)/.test(dial), 'drift guard: the ssh and dial builders quote the spec\'s args into the remote line (no builder of its own)');
}

console.log('— ⑤ SAID ONCE, where the person looks');
{
  const x = runs['sub-a1'];
  const said = x.notices.filter((n) => n.key.startsWith('billing-pick-helper-'));
  ok(said.length === 1 && said[0].key === 'billing-pick-helper-sub-a1-local' && said[0].level === 1 && said[0].i18n && said[0].i18n.key === BP.HELPER_SET_ASIDE.local
    && said[0].i18n.params.account === 'Work Max' && said[0].text.includes('Work Max'), 'the start that set a helper aside says it: one notice, information level, the page words it (t key + params)', said);
  const again = (await drive(wsCreate, { accountId: 'sub-a1' }, { wait: 5000 })).notices.filter((n) => n.key.startsWith('billing-pick-helper-'));
  ok(again.length === 1 && again[0].key === said[0].key, 'a second start of the same pick on the same machine asks under the SAME key — the hub\'s notice channel says a key once', again.map((n) => n.key));
  const pool = runs['pool-p1'].notices.filter((n) => n.key.startsWith('billing-pick-helper-'));
  ok(pool.length === 1 && pool[0].key === 'billing-pick-helper-pool-p1-local' && pool[0].i18n.params.account === 'Team pool', 'another pick has its own key (its own first time)', pool.map((n) => n.key));
  const bare = (await drive(wsCreate, { accountId: 'subscription' })).notices.filter((n) => n.key.startsWith('billing-pick-helper-'));
  ok(bare.length === 0, 'the bare case says nothing (nothing was set aside)', bare);
  for (const [what, state] of [['a settings file that names no helper', false], ['no settings file at all', 'missing'], ['a settings file that is not JSON', 'garbled']]) {
    helperOn(state);
    const none = await drive(wsCreate, { accountId: 'sub-a1' });
    const settled = await within(none.factDone);   // THE FACT: the create's read of the settings file settled (never a fixed window)
    ok(settled && none.reads.includes(SETTINGS) && neutralized(lineOf(none)) && none.notices.filter((n) => n.key.startsWith('billing-pick-helper-')).length === 0, `${what}: the read settled, the line still carries the neutralizer (harmless), and nothing is said`, { settled, reads: none.reads, notices: none.notices });
  }
  helperOn(true);
  // CURE 2 (主开发 11:18Z: «read them into the fact on this machine — the fact must be the one the CLI will act on»): the PROJECT's own
  // .claude/settings.json and .claude/settings.local.json (the conversation's cwd) and the person's own --settings file are read beside
  // the machine's; a helper named in ANY of them is named — the machine's own settings naming none
  {
    const PROJ = path.join(CWD, '.claude');
    fs.mkdirSync(PROJ, { recursive: true });
    const OWN = path.join(CWD, 'own-settings.json'), OWNARG = ['--settings', OWN];
    const clear = () => { for (const f of ['settings.json', 'settings.local.json']) fs.rmSync(path.join(PROJ, f), { force: true }); fs.rmSync(OWN, { force: true }); };
    helperOn(false);
    for (const [what, write, arg] of [
      ['the project\'s .claude/settings.json', () => fs.writeFileSync(path.join(PROJ, 'settings.json'), JSON.stringify({ apiKeyHelper: '/opt/proj-helper' })), FILE],
      ['the project\'s .claude/settings.local.json', () => fs.writeFileSync(path.join(PROJ, 'settings.local.json'), JSON.stringify({ apiKeyHelper: '/opt/proj-helper' })), FILE],
      ['the person\'s own settings file itself', () => fs.writeFileSync(OWN, JSON.stringify({ apiKeyHelper: '/opt/own-helper', hooks: {} })), OWNARG],
    ]) {
      clear(); write();
      const y = await drive(wsCreate, { accountId: 'sub-a1', extraArgs: arg });
      const m = lineOf(y);
      ok(neutralized(m) && !m.line.includes(arg[1]) && saidKind(y, 'billing') === 1 && y.reads.includes(SETTINGS),
        `a picked subscription, the machine's settings naming none, ${what} NAMING a helper: the helper is named — the person's file is set aside and the pick bills, said «billing»`, { line: m.line, notes: y.notices.map((n) => n.key), reads: y.reads });
    }
    clear(); fs.writeFileSync(path.join(PROJ, 'settings.json'), '{ "apiKeyHelper": ');
    const g = await drive(wsCreate, { accountId: 'sub-a1', extraArgs: FILE });
    ok(neutralized(lineOf(g)) && saidKind(g, 'billingUnread') === 1, 'a project settings file that does not parse: the fact cannot be read — billing wins, said «billingUnread»', g.notices.map((n) => n.key));
    clear(); fs.writeFileSync(path.join(PROJ, 'settings.json'), JSON.stringify({ apiKeyHelper: '/opt/proj-helper' }));
    const n = await drive(wsCreate, { accountId: 'sub-a1' }, { wait: 5000 });
    ok(neutralized(lineOf(n)) && n.notices.filter((k) => k.key === 'billing-pick-helper-sub-a1-local').length === 1, 'no person\'s file, a project helper: the inline override rides (as always) and the helper notice is said', n.notices.map((k) => k.key));
    clear();
    const w = await drive(wsCreate, { accountId: 'sub-a1', extraArgs: FILE });
    ok(fileKept(lineOf(w)) && saidKind(w, 'billing') + saidKind(w, 'billingUnread') === 0 && w.reads.includes(path.join(PROJ, 'settings.json')) && w.reads.includes(path.join(PROJ, 'settings.local.json')),
      'no helper in ANY file the CLI reads (the machine\'s, the project\'s two, the person\'s own): the person\'s file applies whole — all four read', w.reads);
    // RED: the tip before cure 2 (the machine's file alone): a project helper under a pick leaves the person's file whole — the helper bills
    const ONLY = '    const files = [file, ...placed.files];';
    ok(SRC.split(ONLY).length === 2, 'setup: the files the fact reads are ONE list (the control edits it)');
    const machineOnly = M.load('src/ws-create.js', SRC.replace(ONLY, '    const files = [file];'), 'machine-file-only');
    fs.writeFileSync(path.join(PROJ, 'settings.json'), JSON.stringify({ apiKeyHelper: '/opt/proj-helper' }));
    const r = await drive(machineOnly, { accountId: 'sub-a1', extraArgs: FILE });
    ok(fileKept(lineOf(r)) && saidKind(r, 'billing') === 0, 'RED CONTROL: the fact read from the machine\'s file alone (the tip before cure 2) leaves the person\'s file whole under a project helper — the pick would bill the helper; the legs above can go red', lineOf(r).line);
    clear(); fs.rmSync(PROJ, { recursive: true, force: true });
    helperOn(true);
  }
  // THE BOUND (its reader's S1): a config dir on a stuck mount — the open never answers — never holds the start; billing wins, said so
  {
    const p = makeCreate(wsCreate, { hangOpen: true, helperFactMs: 300 }).create({ accountId: 'sub-a1', extraArgs: FILE });
    const done = await within(p, 4000), y = done ? await p : null;
    ok(done && !!y && neutralized(lineOf(y)) && saidKind(y, 'billingUnread') === 1, 'this machine\'s settings read never answers (a stuck mount): the start goes on at the bound — billing wins, the file set aside, said «billingUnread»', { done, notes: y && y.notices.map((n) => n.key) });
    // ONE READ IN FLIGHT PER FILE (cure 2, its readers' should): a second start against the same stuck files JOINS the hung reads — no new
    // open, so no more threadpool threads tied up — and goes on at its own bound
    const run2 = async (mod) => {
      const one = makeCreate(mod, { hangOpen: true, helperFactMs: 300 });
      const p1 = one.create({ accountId: 'sub-a1', extraArgs: FILE }); await within(p1, 4000);
      const p2 = one.create({ accountId: 'sub-a1', extraArgs: FILE }); const d2 = await within(p2, 4000);
      return { d2, b: d2 ? await p2 : null };
    };
    const j = await run2(wsCreate);
    ok(j.d2 && j.b.reads.length === 0 && saidKind(j.b, 'billingUnread') === 1, 'a second start against the same stuck files opens NOTHING (it joins the reads in flight) and goes on at its bound, said «billingUnread»', j.b && j.b.reads);
    const JOIN = '    const reads = await Promise.all(files.map((f) => readOneFactOnce(f, row)));';   // B-e7c0: the joined reads now also hand the person's own text to its start
    ok(SRC.split(JOIN).length === 2, 'setup: the fact\'s reads go through ONE joiner (the control edits it)');
    const jr = await run2(M.load('src/ws-create.js', SRC.replace(JOIN, JOIN.replace('readOneFactOnce(f, row)', 'readOneFact(f, row)')), 'no-join'));
    ok(jr.d2 && jr.b.reads.length > 0, 'RED CONTROL: without the joiner every start opens the stuck files again (one more hung thread each) — the leg above can go red', jr.b && jr.b.reads);
  }
  // SAID ONCE through ONE handler (one hub run): the second start of the same pick on the same machine says nothing and ASKS nothing
  {
    const one = makeCreate(wsCreate);
    // (a read the create starts is begun before the create returns — the reader's open is its first step — so `reads` is the fact)
    const a = await one.create({ accountId: 'sub-a1' }, { wait: 5000 }), b = await one.create({ accountId: 'sub-a1' });
    ok(a.notices.filter((n) => n.key === 'billing-pick-helper-sub-a1-local').length === 1 && b.notices.filter((n) => n.key.startsWith('billing-pick-helper-')).length === 0 && a.reads.includes(SETTINGS) && b.reads.length === 0 && neutralized(lineOf(b)),
      'one hub run, two starts of the same pick on the same machine: said at the first; the second says nothing and reads no settings file (a said key asks no machine again) — its line still neutralized', { a: a.notices.map((n) => n.key), b: b.notices.map((n) => n.key), reads: b.reads });
    const c = await one.create({ accountId: 'pool-p1' }, { wait: 5000 });
    ok(c.notices.filter((n) => n.key === 'billing-pick-helper-pool-p1-local').length === 1 && c.reads.includes(SETTINGS), '…another pick in the same run is its own first time (read, said)', c.notices.map((n) => n.key));
  }
  // the CLI's config dir (CLAUDE_CONFIG_DIR) is where its settings live — as the SPAWN's own env places it (the cure: never the hub's
  // process env): a helper named THERE is the one set aside, and said; the hub's own config dir is not the spawn's
  const CFG = path.join(HOME, 'cfg-dir');
  fs.mkdirSync(CFG, { recursive: true });
  fs.writeFileSync(path.join(CFG, 'settings.json'), JSON.stringify({ apiKeyHelper: '/opt/helper' }));
  helperOn(false);
  const viaDir = await drive(wsCreate, { accountId: 'sub-a1' }, { wait: 5000, env: { CLAUDE_CONFIG_DIR: CFG } });
  ok(viaDir.notices.filter((n) => n.key.startsWith('billing-pick-helper-')).length === 1 && viaDir.reads.includes(path.join(CFG, 'settings.json')) && !viaDir.reads.includes(SETTINGS),
    'the spawn\'s env places the CLI\'s config dir (CLAUDE_CONFIG_DIR) where a helper is named — ~/.claude naming none, the hub\'s env naming no dir — it is read there, and said', { reads: viaDir.reads, notices: viaDir.notices.map((n) => n.key) });
  process.env.CLAUDE_CONFIG_DIR = CFG;
  const hubOnly = await drive(wsCreate, { accountId: 'sub-a1' });
  const hubSettled = await within(hubOnly.factDone);
  delete process.env.CLAUDE_CONFIG_DIR;
  ok(hubSettled && hubOnly.reads.includes(SETTINGS) && !hubOnly.reads.includes(path.join(CFG, 'settings.json')) && hubOnly.notices.filter((n) => n.key.startsWith('billing-pick-helper-')).length === 0,
    '…and the reverse: the HUB\'s env names that dir, the spawn\'s does not — the spawn\'s ~/.claude is read (naming none), nothing said', { reads: hubOnly.reads });
  helperOn(true);
}

console.log('— ⑦ A PAIRED MACHINE through the real create (its ladder stood in — the ssh / dial ladders have their own suites — and the REAL hosts.backendStatus over a stub device)');
const { HostManager } = require(path.join(REPO, 'src/hosts.js'));
const SPAWN_AT = require.resolve(path.join(REPO, 'src/spawn/index.js'));
const realSpawn = require(SPAWN_AT);
/** a copy of a create whose paired-machine ladder answers a spawn line (the remote CLI's argv as the create built it) — a resume
 *  that asks `_adoptHere` is ADOPTED by it (a live keeper holds the conversation, as src/spawn/ssh.js finds one) */
function withLadder(src, tag, { same = false } = {}) {
  const saved = require.cache[SPAWN_AT];
  // (as src/spawn/ssh.js does on its roads: the session is the machine's — host = its id, hostName = its name)
  const chat = async (lc) => { if (lc.data._adoptHere) { lc.data.keeperSid = `k-${lc.id}`; lc.data.keeperKind = 'agentd'; } lc.session.host = lc.h.id; lc.session.hostName = lc.h.name; return { spawnCmd: '/stub/ssh', spawnArgs: ['h-2', lc.rcmd, ...lc.rargs], spawnEnvPairs: [], spawnCwd: lc.cwd }; };
  require.cache[SPAWN_AT] = { id: SPAWN_AT, filename: SPAWN_AT, loaded: true, children: [], paths: [], exports: { ...realSpawn, spawnFor: (h) => (h ? { id: 'ssh', chat } : realSpawn.spawnFor(h)) } };
  try { return M.load('src/ws-create.js', src, tag, { same }); } finally { require.cache[SPAWN_AT] = saved; }
}
/** the paired machine «build-box» (id h-2): its device answers the CLI probe (`helper` = its Claude settings name one), or nothing
 *  answers (`answer` false: the device link and the ssh probe both fail) — or the ssh probe answers `sshOut` */
function hostsStub({ helper = true, answer = true, sshOut = null, hang = false, owner = null, keeper = null } = {}) {
  const me = {
    _onFact: () => { }, asked: [], helpers: [],
    get: (id) => (id === 'h-2' ? { id: 'h-2', name: 'build-box', host: 'build-box.lan', transport: 'ssh' } : null),
    deviceBounded: async () => {
      if (hang) return new Promise(() => { });   // a device that never answers
      if (!answer || sshOut !== null) throw new Error('device link lost');
      return { probeCli: async (h) => ({ facts: { claude: { installed: true, version: '2.1.322', loggedIn: true, loginMethod: 'oauth', ...(helper ? { keyHelper: true } : {}), ...(h ? { startHelper: helper ? 'named' : 'none' } : {}) }, codex: { installed: false, loggedIn: false } } }) };   // (an agent of B-77ed: asked about a start, it answers it)
    },
    _hostShell: async (h, script) => { if (String(script).includes('__VS_DIR_OK__')) return '__VS_DIR_OK__'; if (sshOut !== null) return sshOut; throw new Error('ssh: no route to host'); },
    homeDir: async () => '/home/u', conversationOwner: () => owner, findKeeperFor: async () => keeper, accountsStatus: async () => ({}), invalidateDiscovery: () => { },
    held: () => false, unreadWords: () => null,   // the meeting with B-f276's held hosts store: its hold is a SYNC answer (the Proxy below answers an unknown method with an async null — a Promise reads as «held»)
  };
  me.backendStatus = async (id, opts) => { me.asked.push(id); me.helpers.push(opts && opts.helper); try { return await HostManager.prototype.backendStatus.call(me, id, opts); } finally { me._onFact(); } };
  return new Proxy(me, { get: (t, k) => (k in t ? t[k] : (typeof k === 'string' && k !== 'then' && /^[a-z]/.test(k) ? async () => null : undefined)) });
}
const remoteCreate = withLadder(SRC, 'remote-road', { same: true }); // the real module behind the ssh ladder, on purpose (B-0d3e)
const R = (data) => ({ hostId: 'h-2', cwd: '/home/u/proj', ...data });
const helperSaid = (x) => x.notices.filter((n) => n.key.startsWith('billing-pick-helper-'));
{
  // the fact as the REAL hosts.backendStatus answers it (both of its roads) → the create's reader
  const op = await hostsStub({ helper: true }).backendStatus('h-2'), opNone = await hostsStub({ helper: false }).backendStatus('h-2');
  const ssh = await hostsStub({ sshOut: 'claude|yes|2.1.322\ncodex|no|\nclaude-login|yes|oauth\nclaude-helper|yes\ncodex-login|no' }).backendStatus('h-2');
  const sshNone = await hostsStub({ sshOut: 'claude|yes|2.1.322\ncodex|no|\nclaude-login|yes|oauth\ncodex-login|no' }).backendStatus('h-2');
  const sshMute = await hostsStub({ sshOut: '' }).backendStatus('h-2');
  ok(BP.remoteHelperFact(op, 'claude') === true && BP.remoteHelperFact(opNone, 'claude') === false && BP.remoteHelperFact(ssh, 'claude') === true && BP.remoteHelperFact(sshNone, 'claude') === false
    && BP.remoteHelperFact(sshMute, 'claude') === null && BP.remoteHelperFact(null, 'claude') === null && BP.remoteHelperFact(op, 'codex') === false,
    'the paired machine\'s FIELD: hosts.backendStatus\'s own answer (the probe op\'s facts, and the ssh probe\'s lines) is read as named / none / cannot be read (an empty answer says nothing of the CLI)', { op: op.claude, ssh: ssh.claude, sshMute });
  const BPSRC = read('src/billing-pick.js'), FIELD = '  if (r.keyHelper === true) return true;';
  ok(BPSRC.split(FIELD).length === 2, 'setup: the paired machine\'s field is read in ONE place');
  const other = M.load('src/billing-pick.js', BPSRC.replace(FIELD, '  if (r.helper === true) return true;'), 'other-field');
  ok(other.remoteHelperFact(op, 'claude') === false && other.remoteHelperFact(ssh, 'claude') === false, 'RED CONTROL (a copy of src/billing-pick.js reading another field name): the same answers read «none» where a helper is named — the leg above can go red');
}
{
  const hs = hostsStub({ helper: true });
  const x = await makeCreate(remoteCreate, { hosts: hs }).create(R({ accountId: 'sub-a1' }), { wait: 5000 });
  const l = lineOf(x), said = helperSaid(x);
  ok(!l.why && neutralized(l) && l.line.includes('/stub/ssh'), 'a pick on the paired machine: the remote line (the create\'s argv through the ladder) sets the helper aside', l.why || l.settings);
  ok(said.length === 1 && said[0].key === 'billing-pick-helper-sub-a1-h-2' && said[0].i18n.key === BP.HELPER_SET_ASIDE.remote && said[0].i18n.params.host === 'build-box' && said[0].text.includes('on build-box') && said[0].text.includes('«CLI login @ build-box»') && !said[0].text.includes('h-2') && hs.asked.join() === 'h-2',
    'the paired machine whose settings name a helper: asked once (its backend status), said by the machine\'s NAME — never its id — with its door «CLI login @ build-box»', { said, asked: hs.asked });
  const none = hostsStub({ helper: false }), y = await makeCreate(remoteCreate, { hosts: none }).create(R({ accountId: 'sub-a1' }));
  const settled = await within(y.factDone);
  ok(settled && none.asked.length === 1 && helperSaid(y).length === 0 && neutralized(lineOf(y)), 'the paired machine names NO helper: the answer settled, nothing said', { settled, asked: none.asked });
  const mute = hostsStub({ answer: false }), z = await makeCreate(remoteCreate, { hosts: mute }).create(R({ accountId: 'sub-a1' }));
  ok(await within(z.factDone) && helperSaid(z).length === 0 && neutralized(lineOf(z)), 'the paired machine does not answer and the start carries no settings file: billing wins anyway (the inline override), nothing to say');
  const muteF = hostsStub({ answer: false }), f = await makeCreate(remoteCreate, { hosts: muteF }).create(R({ accountId: 'sub-a1', extraArgs: FILE }));
  ok(neutralized(lineOf(f)) && !lineOf(f).line.includes('/home/u/my-settings.json') && saidKind(f, 'billingUnread') === 1 && muteF.asked.length === 1,
    'the paired machine does not answer and the start carries the person\'s settings file: billing wins — the file set aside, and the notice says the fact could not be read', { notes: f.notices.map((n) => n.key), asked: muteF.asked });
  const namedF = hostsStub({ helper: true }), nf = await makeCreate(remoteCreate, { hosts: namedF }).create(R({ accountId: 'sub-a1', extraArgs: FILE }), { wait: 5000 });
  ok(neutralized(lineOf(nf)) && !lineOf(nf).line.includes('/home/u/my-settings.json') && saidKind(nf, 'billing') === 1 && helperSaid(nf).length === 1 && namedF.asked.length === 1,
    'the paired machine NAMES a helper and the start carries the person\'s file: the file is set aside on the remote line, said «billing», and the helper notice said — the machine asked ONCE', { notes: nf.notices.map((n) => n.key), asked: namedF.asked });
  {
    // THE PAIRED-MACHINE GUARD, its red control: a remote start made to read THIS machine's files (planted) still never merges — the
    // guard holds; with the guard removed too, the person's values ride the REMOTE line inline (the file road is this machine's only)
    helperOn(true); fs.writeFileSync(OWN, JSON.stringify(PERSON));   // THIS machine names a helper; the person's file as the other legs have it
    const REMOTE_READ = '    if (hostId) return BILLPICK.remoteHelperFact(await hosts.backendStatus(hostId, { helper: { cwd, ownFile } }), backend);';   // (B-77ed: the remote ask hands the start)
    const GUARD = ' && !data.hostId && !onProvider ? BILLPICK.ownSettingsOf(ownRead.text) : null;';
    const planted = anchored(SRC, REMOTE_READ, '    if (hostId && false) return BILLPICK.remoteHelperFact(await hosts.backendStatus(hostId, { helper: { cwd, ownFile } }), backend);', 'B-e7c0 a remote start reads this machine (planted)');
    const withGuard = withLadder(planted, 'e7c0-remote-guarded'), noGuard = withLadder(anchored(planted, GUARD, ' && !onProvider ? BILLPICK.ownSettingsOf(ownRead.text) : null;', 'B-e7c0 the paired-machine guard removed'), 'e7c0-remote-unguarded');
    const rgx = await makeCreate(withGuard, { hosts: hostsStub({ helper: true }) }).create(R({ accountId: 'sub-a1', extraArgs: ['--settings', OWN] }));
    const rux = await makeCreate(noGuard, { hosts: hostsStub({ helper: true }) }).create(R({ accountId: 'sub-a1', extraArgs: ['--settings', OWN] }));
    const mergedSaid = (x) => x.notices.filter((n) => n.key.startsWith('settings-file-mergeDropped-')).length;
    ok(!lineOf(rgx).why && saidKind(rgx, 'billing') === 1 && mergedSaid(rgx) === 0 && mergedSaid(rux) === 1 && saidKind(rux, 'billing') === 0,
      'B-e7c0 RED CONTROL for the paired-machine guard: a remote start made to read this machine\'s files still SETS THE FILE ASIDE (said «billing», nothing merged); without the guard that remote start MERGES the person\'s file (its drop said)', { guarded: rgx.notices.map((n) => n.key), unguarded: rux.notices.map((n) => n.key) });
  }
  // THE BOUND on the paired machine's road: a device that never answers holds no start
  const hang = hostsStub({ hang: true }), hp = makeCreate(remoteCreate, { hosts: hang, helperFactMs: 300 }).create(R({ accountId: 'sub-a1', extraArgs: FILE }));
  const hDone = await within(hp, 4000), hx = hDone ? await hp : null;
  ok(hDone && !!hx && saidKind(hx, 'billingUnread') === 1 && neutralized(lineOf(hx)), 'a paired machine that never answers: the start goes on at the bound — billing wins, said «billingUnread»', { hDone, notes: hx && hx.notices.map((n) => n.key) });
  const noneF = hostsStub({ helper: false }), g = await makeCreate(remoteCreate, { hosts: noneF }).create(R({ accountId: 'sub-a1', extraArgs: FILE }));
  ok(fileKept(lineOf(g)) && saidKind(g, 'billing') + saidKind(g, 'billingUnread') === 0 && noneF.asked.length === 1, 'the paired machine names no helper and the start carries the person\'s file: the file applies whole on the remote line, asked ONCE (before the build; the notice reuses it)', { line: lineOf(g).line, asked: noneF.asked });
  // AN ADOPTED PROCESS (the default the person starred, a resume a live keeper holds): it keeps the argv it started with — nothing asked, nothing said
  const ADOPT = { resume: true, resumeId: 'b3c4d5e6-0000-4000-8000-000000000001', _adoptHere: true };
  const ah = hostsStub({ helper: true }), ad = await makeCreate(remoteCreate, { hosts: ah, accounts: accountsStub({ defaultId: 'sub-a1' }) }).create(R(ADOPT));
  ok(ad.session && ad.session._accountId === 'sub-a1' && ah.asked.length === 0 && helperSaid(ad).length === 0,
    'an ADOPTED process (the default the person starred; a live keeper holds the resumed conversation): no machine asked, no helper notice — none of this start\'s argv is its own', { asked: ah.asked, notices: ad.notices.map((n) => n.key) });
  // (the ladder decides an adoption AFTER the one build, so a start carrying the person's file has asked the fact already — once)
  const ahF = hostsStub({ helper: true }), adF = await makeCreate(remoteCreate, { hosts: ahF, accounts: accountsStub({ defaultId: 'sub-a1' }) }).create(R({ ...ADOPT, extraArgs: FILE }));
  // an adoption the create KNOWS before its build (a host-less resume of a conversation a paired machine's live keeper holds — the host
  // inferred, the keeper found): nothing asked, and the record reads the person's file as GOVERNING (its reader's m1 — no later push to
  // the running CLI writes over a file it may hold)
  const ahK = hostsStub({ helper: true, owner: 'h-2', keeper: { sid: 'k-77', kind: 'agentd' } });
  const adK = await makeCreate(remoteCreate, { hosts: ahK, accounts: accountsStub({ defaultId: 'sub-a1' }) }).create({ cwd: '/home/u/proj', resume: true, resumeId: 'b3c4d5e6-0000-4000-8000-000000000002', extraArgs: FILE });
  ok(adK.session && adK.session.host === 'h-2' && ahK.asked.length === 0 && JSON.stringify(adK.session._settingsFileGoverns) === JSON.stringify(['outputStyle', 'noFallback', 'jobNotices']) && adK.notices.filter((n) => n.key.startsWith('settings-file-') || n.key.startsWith('billing-pick-helper-')).length === 0,
    'an adoption known BEFORE the build (the host inferred, its keeper found): no machine asked, nothing said, and the record keeps the person\'s file as governing all three kinds', { asked: ahK.asked, governs: adK.session && adK.session._settingsFileGoverns, sent: adK.sent.filter((m) => m.type === 'error') });
  ok(adF.session && helperSaid(adF).length === 0 && adF.notices.filter((n) => n.key.startsWith('settings-file-')).length === 0 && ahF.asked.length === 1,
    '…with the person\'s settings file: no settings-file words and no helper notice for the adopted process (the fact was asked once, before the build — the ladder adopts after it)', { asked: ahF.asked, notices: adF.notices.map((n) => n.key) });
}

console.log('— ⑦b B-e7c0 ON A PAIRED MACHINE (r723): the merge made ON the device by its agent; the line carries only its path');
{
  // PURE: the one merge both sides run, the layer's bound, the id, the argv swap
  const layer = { apiKeyHelper: '', outputStyle: 'Concise' };
  const m = BP.deviceMergeOf({ ownText: JSON.stringify(PERSON), layer, row: CLAUDE_CREDS.keyHelper });
  const mj = m.ok ? JSON.parse(m.json) : {};
  console.log(`    (the merged keys: ${Object.keys(mj).join(', ')} · env: ${Object.keys(mj.env || {}).join(', ')} · dropped: ${(m.dropped || []).join(', ')})`);
  ok(m.ok && mj.hooks && JSON.stringify(mj.permissions) === JSON.stringify(PERSON.permissions) && mj.env.PERSON_MARK === OWN_MARK && !('ANTHROPIC_API_KEY' in mj.env) && m.dropped.includes('ANTHROPIC_API_KEY') && mj.apiKeyHelper === '' && mj.outputStyle === 'Concise',
    '⑦b PURE deviceMergeOf: the person\'s hooks, deny rules and own env KEPT, every route / credential name DROPPED (named), the start\'s layer applied LAST', { keys: Object.keys(mj), dropped: m.dropped });
  const helperFile = BP.deviceMergeOf({ ownText: JSON.stringify({ apiKeyHelper: '/x/key.sh' }), layer, row: CLAUDE_CREDS.keyHelper });
  const notJson = BP.deviceMergeOf({ ownText: '[1]', layer, row: CLAUDE_CREDS.keyHelper }), big = BP.deviceMergeOf({ ownText: '{}', layer: { k: 'x'.repeat(BP.LAYER_MAX) }, row: CLAUDE_CREDS.keyHelper });
  ok(helperFile.reason === 'own-names-helper' && notJson.reason === 'own-not-json' && big.reason === 'layer-too-large' && BP.layerRefusal([]) === 'layer-not-object',
    '⑦b PURE: a person\'s file that names the helper itself, one that is no JSON object, and a layer over LAYER_MAX are refused BY NAME (each falls to the set-aside)', { helperFile, notJson, big: big.reason });
  ok(BP.MERGE_SID_RE.test('sess-abc_1') && !BP.MERGE_SID_RE.test('../etc') && !BP.MERGE_SID_RE.test('a/b') && !BP.MERGE_SID_RE.test('x'.repeat(65)),
    '⑦b PURE: the id a device names its file by is a closed alphabet, bounded — no path part from the hub');
  const args = ['-p', '--settings', JSON.stringify(layer), '--x'];
  ok(JSON.stringify(BP.settingsLayerOf(args)) === JSON.stringify(layer) && JSON.stringify(BP.withSettingsPath(args, '/d/s.settings')) === JSON.stringify(['-p', '--settings', '/d/s.settings', '--x']) && BP.settingsLayerOf(['--settings', '/a/file.json']) === null,
    '⑦b PURE: the layer is the argv\'s inline --settings (a file path is none), and only the merged file\'s PATH goes back into the line');
  // THE HUB'S ONE ASK (src/server/settings-merge-device.js) over stand-in agents
  const ASK = require(path.join(REPO, 'src/server/settings-merge-device.js'));
  const hostsOf = (dm) => ({ deviceBounded: async () => dm });
  const okDm = { asked: [], settingsMerge: async (o) => { okDm.asked.push(o); return { ok: true, path: `/home/u/.vibespace/agentd/state/settings/${o.sid}.settings`, dropped: ['ANTHROPIC_API_KEY'] }; } };
  const good = await ASK.askDeviceMerge({ hosts: hostsOf(okDm), hostId: 'h-2', id: 'sess-1', args, cwd: '/home/u/proj', ownFile: '/home/u/my.json', by: 'human:t' });
  ok(good.args && good.args[2] === '/home/u/.vibespace/agentd/state/settings/sess-1.settings' && okDm.asked.length === 1 && JSON.stringify(okDm.asked[0].layer) === JSON.stringify(layer) && okDm.asked[0].by === 'human:t',
    '⑦b the ask: the layer sent is EXACTLY the inline settings (no widening), named `by`, and the argv comes back with the device\'s path only', { good, asked: okDm.asked[0] && Object.keys(okDm.asked[0]) });
  const t0 = Date.now();
  const hung = await ASK.askDeviceMerge({ hosts: hostsOf({ settingsMerge: () => new Promise(() => { }) }), hostId: 'h-2', id: 'sess-1', args, boundMs: 200 });
  const old = await ASK.askDeviceMerge({ hosts: hostsOf({ probeCli: async () => ({}) }), hostId: 'h-2', id: 'sess-1', args });
  const none = await ASK.askDeviceMerge({ hosts: { deviceBounded: async () => { throw new Error('no agent'); } }, hostId: 'h-2', id: 'sess-1', args });
  const foreign = await ASK.askDeviceMerge({ hosts: hostsOf({ settingsMerge: async () => ({ ok: true, path: '/etc/passwd', dropped: [] }) }), hostId: 'h-2', id: 'sess-1', args });
  const refused = await ASK.askDeviceMerge({ hosts: hostsOf({ settingsMerge: async () => { const e = new Error('op not allowed'); e.code = 'op-not-allowed'; throw e; } }), hostId: 'h-2', id: 'sess-1', args });
  const badId = await ASK.askDeviceMerge({ hosts: hostsOf(okDm), hostId: 'h-2', id: '../x', args });
  console.log(`    (no answer: ${hung.refused} after its bound · old agent: ${old.refused} · no agent: ${none.refused} · foreign path: ${foreign.refused} · refused: ${refused.refused} · bad id: ${badId.refused})`);
  ok(hung.refused === 'late' && Date.now() - t0 >= 150 && old.refused === 'no-agent' && none.refused === 'no agent' && foreign.refused && !foreign.args && refused.refused === 'op-not-allowed' && badId.refused === 'bad-sid' && okDm.asked.length === 1,
    '⑦b the ask never hangs and never widens: no answer ⇒ «late» at its ONE bound; an agent without the op, no agent, a path not of the device\'s own shape, a refusal (its policy\'s), a bad id ⇒ refused by name, no argv — the create keeps the set-aside', { hung, old, none, foreign, refused, badId });
  // THE MACHINE'S OWN POLICY: a machine that allows no file writes refuses the op by name (and that too falls to the set-aside)
  const DP = require(path.join(REPO, 'src/device-policy.js'));
  const v = DP.verdict(DP.readOf(JSON.stringify({ v: 1, allow: ['run'] })), { op: 'settings-merge', sid: 'sess-1' });
  ok(v.ok === false && v.flag === 'files' && v.code === 'op-not-allowed' && DP.verdict(DP.readOf(null), { op: 'settings-merge' }).ok === true,
    '⑦b a machine whose own allow list holds no `files` refuses settings-merge BY NAME (flag files); an older list-less machine (every flag) allows it', v);
  // THE FILE'S LIFE on the device: the agent's hourly sweep (src/machine-probes.js sweepMergedSettings)
  const MP = require(path.join(REPO, 'src/machine-probes.js'));
  const SD = path.join(scratchDir('bpick-merged'), 'settings'); fs.mkdirSync(SD, { recursive: true });   // the agent's own folder (the scratch dir keeps its own marker file)
  for (const n of ['ended-1', 'old-1', 'live-1']) fs.writeFileSync(path.join(SD, `${n}.settings`), '{}', { mode: 0o600 });
  fs.writeFileSync(path.join(SD, 'other.txt'), 'x');
  const oldAt = new Date(Date.now() - MP.SETTINGS_KEEP_MS - 60000); fs.utimesSync(path.join(SD, 'old-1.settings'), oldAt, oldAt);
  const gone = await MP.sweepMergedSettings(SD, { ended: (sid) => sid === 'ended-1' });
  const left = fs.readdirSync(SD).sort().join(',');
  console.log(`    (the sweep removed ${gone}; left: ${left})`);
  ok(gone === 2 && left === 'live-1.settings,other.txt' && MP.SETTINGS_KEEP_MS === 7 * 86400000,
    '⑦b the merged file\'s life: the sweep takes the one whose conversation ENDED (by the agent\'s own record) and the one past 7 days; a live one and anything not <id>.settings stay', left);
  // RED CONTROL: the merge without its drop of route / credential names — the person's credential rides the device's file
  const SMSRC = read('src/settings-merge.js');
  const noDrop = M.load('src/settings-merge.js', anchored(SMSRC, "    for (const [k, v] of Object.entries(settings.env)) { if (ROUTE.routeNameAny(k)) dropped.push(k); else env[k] = v; }", "    for (const [k, v] of Object.entries(settings.env)) { env[k] = v; }", 'B-e7c0 the drop of route / credential names'), 'nodrop-device');
  const nd = noDrop.deviceMergeOf({ ownText: JSON.stringify(PERSON), layer, row: CLAUDE_CREDS.keyHelper });
  ok(nd.ok && JSON.parse(nd.json).env.ANTHROPIC_API_KEY === PAID_KEY, '⑦b RED CONTROL (the merge with no drop list): the person\'s ANTHROPIC_API_KEY rides the merged file — the leg above can go red');
}
{
  // THROUGH THE REAL CREATE on the paired machine (its ladder stood in): the device merges ⇒ the remote line carries only the path
  function mergeHosts(mode) {
    const base = hostsStub({ helper: true }), merges = [];
    return new Proxy(base, { get: (t, k) => (k === 'merges' ? merges : k === 'deviceBounded' ? async (...a) => {
      const dm = await t.deviceBounded(...a);
      return { ...dm, settingsMerge: async (o) => { merges.push(o); if (mode === 'hang') return new Promise(() => { }); if (mode === 'refuse') { const e = new Error('op not allowed'); e.code = 'op-not-allowed'; throw e; } return { ok: true, path: `/home/u/.vibespace/agentd/state/settings/${o.sid}.settings`, dropped: ['ANTHROPIC_API_KEY'] }; } };
    } : t[k]) });
  }
  const mh = mergeHosts('ok'), x = await makeCreate(remoteCreate, { hosts: mh }).create(R({ accountId: 'sub-a1', extraArgs: FILE }), { wait: 5000 });
  const lx = lineOf(x), path0 = lx.line ? lx.line[lx.line.indexOf('--settings') + 1] : null;
  const rf = mergeHosts('refuse'), y = await makeCreate(remoteCreate, { hosts: rf }).create(R({ accountId: 'sub-a1', extraArgs: FILE }), { wait: 5000 });
  const ly = lineOf(y);
  console.log(`    (the merged start's --settings: ${path0} · asked with ${mh.merges[0] ? JSON.stringify(mh.merges[0].layer) : 'nothing'} · the refused start's inline: ${JSON.stringify(ly.settings)})`);
  ok(!lx.why && mh.merges.length === 1 && path0 === `/home/u/.vibespace/agentd/state/settings/${mh.merges[0].sid}.settings` && !lx.line.includes('/home/u/my-settings.json') && mh.merges[0].ownFile === '/home/u/my-settings.json' && mh.merges[0].cwd === '/home/u/proj',
    '⑦b the REAL create on the paired machine: a pick whose start carries the person\'s file asks its agent ONCE (the start\'s cwd and file named as the start has them) and the remote line carries ONLY the merged file\'s path', { why: lx.why, path0, asked: mh.merges.length });
  ok(JSON.stringify(mh.merges[0] && mh.merges[0].layer) === JSON.stringify(ly.settings) && neutralized(ly),
    '⑦b NO WIDENING: the layer the device merged is EXACTLY the inline settings the set-aside start carries (the refused run\'s line)', { asked: mh.merges[0] && mh.merges[0].layer, setAside: ly.settings });
  ok(saidKind(x, 'billing') === 0 && x.notices.filter((n) => n.key.startsWith('settings-file-mergeDropped-')).length === 1 && saidKind(y, 'billing') === 1,
    '⑦b SAID like this machine\'s merge: the merged start names what it dropped (once) and says no set-aside; the refused one (its policy) keeps the set-aside, said «billing» as today', { merged: x.notices.map((n) => n.key), refused: y.notices.map((n) => n.key) });
  const nh = hostsStub({ helper: false }), merges0 = [];
  const nhm = new Proxy(nh, { get: (t, k) => (k === 'deviceBounded' ? async (...a) => ({ ...(await t.deviceBounded(...a)), settingsMerge: async (o) => { merges0.push(o); return { ok: false }; } }) : t[k]) });
  const z = await makeCreate(remoteCreate, { hosts: nhm }).create(R({ accountId: 'sub-a1', extraArgs: FILE }), { wait: 5000 });
  ok(merges0.length === 0 && lineOf(z).line && lineOf(z).line.includes('/home/u/my-settings.json'), '⑦b a paired machine that names NO helper: never asked — the person\'s file applies whole, as on the release', { asked: merges0.length });
  const SRCW = SRC;
  const noAsk = withLadder(anchored(SRCW, "            if (r && r.args) { spawnArgs = r.args; deviceMerged = r;", "            if (false) { spawnArgs = r.args; deviceMerged = r;", 'B-e7c0 the paired machine\'s merge taken'), 'e7c0-device-off');
  const mo = mergeHosts('ok'), w = await makeCreate(noAsk, { hosts: mo }).create(R({ accountId: 'sub-a1', extraArgs: FILE }), { wait: 5000 });
  ok(neutralized(lineOf(w)) && saidKind(w, 'billing') === 1, '⑦b RED CONTROL (the create that never takes the device\'s merge): the same paired start sets the person\'s file aside — the legs above can go red');
}

console.log('— ⑧ A RESUME and A FORK of a picked conversation through the real create');
{
  const RID = 'c0ffee00-1111-4222-8333-444455556666';
  for (const [what, extra, flags] of [['a resume', { resume: true, resumeId: RID }, ['--resume', RID]], ['a fork', { resume: true, resumeId: RID, fork: true }, ['--resume', RID, '--fork-session']]]) {
    const x = await drive(wsCreate, { accountId: 'sub-a1', ...extra }, { wait: 5000 });
    const l = lineOf(x), at = l.line ? l.line.indexOf('--resume') : -1;
    ok(!l.why && neutralized(l) && at > 0 && l.line[at + 1] === RID && flags.every((fl) => l.line.includes(fl)) && (extra.fork ? true : !l.line.includes('--fork-session')) && helperSaid(x).length === 1,
      `${what} of a picked conversation: the line ${extra.fork ? 'forks' : 'resumes'} it (${flags.join(' ')}) and sets the helper aside; said once`, l.why || { line: l.line, said: helperSaid(x).map((n) => n.key) });
    helperOn(false);
    const y = await drive(wsCreate, { accountId: 'sub-a1', ...extra, extraArgs: FILE });
    ok(fileKept(lineOf(y)) && lineOf(y).line.includes(RID), `${what} with the person's settings file on a machine that names no helper: the file applies whole`, lineOf(y).line);
    helperOn(true);
  }
}

console.log('— ⑨ THE THIRD STATE ON A PAIRED MACHINE (B-bc9f): one rule for this machine, the device probe and the ssh rung');
{
  const HF = require(path.join(REPO, 'src/helper-fact.js')), PROBES = require(path.join(REPO, 'src/machine-probes.js'));
  const PROBES_SRC = read('src/machine-probes.js'), HOSTS_SRC = read('src/hosts.js'), BP_SRC = read('src/billing-pick.js');
  const BOX = { id: 'h-2', name: 'build-box', host: 'build-box.lan', transport: 'ssh' };
  /** the paired machine's answer by its device: the REAL probe (this scratch HOME is its home) through backendStatus */
  const byDevice = async (probes, HM) => {
    const facts = await probes.cliFacts({ claudeCmd: '/nonexistent-claude', codexCmd: '/nonexistent-codex' });
    return HM.prototype.backendStatus.call({ get: () => BOX, deviceBounded: async () => ({ probeCli: async () => ({ facts }) }), _hostShell: async () => { throw new Error('ssh: not asked'); } }, 'h-2');
  };
  /** …by the ssh rung: the script backendStatus sends must carry the rung; the rung runs under sh on this HOME; its line is parsed
   *  by backendStatus itself (no CLI runs: the rung only tests and greps a file) */
  const byShell = async (HM, rung = HF.SSH_HELPER_RUNG, pathFirst = '') => {
    const out = execFileSync('sh', ['-c', `${rung}true`], { env: { HOME, PATH: `${pathFirst}/usr/bin:/bin` }, encoding: 'utf8', timeout: 5000 });   // (the release's rung exits 2 where grep fails: its lines are read all the same)
    let script = '';
    const st = await HM.prototype.backendStatus.call({ get: () => BOX, deviceBounded: async () => { throw new Error('device link lost'); }, _hostShell: async (h, s) => { script = s; return `claude|yes|2.1.322\n${out}codex|no|\ncodex-login|no`; } }, 'h-2');
    return { st, carried: script.includes(HF.SSH_HELPER_RUNG), out };
  };
  /** …and this machine's own, as the create reads it: said «billing» = named, «billingUnread» = cannot be read, nothing = none */
  const byHub = async () => { const x = await drive(wsCreate, { accountId: 'sub-a1', extraArgs: FILE }); return saidKind(x, 'billing') ? true : saidKind(x, 'billingUnread') ? null : false; };
  const put = (how) => {
    fs.rmSync(SETTINGS, { recursive: true, force: true });
    if (how === 'missing') return;
    if (how === 'folder') return void fs.mkdirSync(SETTINGS);
    if (how === 'fifo') return void execFileSync('mkfifo', [SETTINGS]);
    fs.writeFileSync(SETTINGS, how);
  };
  const BIG = JSON.stringify({ theme: 'dark', pad: 'x'.repeat(HF.SETTINGS_READ_MAX) });
  // [the state, the file, this machine's fact (= the device probe's), the ssh rung's fact (its text law)]
  const STATES = [
    ['names a helper', JSON.stringify({ apiKeyHelper: '/usr/local/bin/key-helper' }), true, true],
    ['names none', JSON.stringify({ theme: 'dark' }), false, false],
    ['no file', 'missing', false, false],
    ['an EMPTY file', '', false, false],
    ['an empty helper value (the ssh rung reads the quoted key: billing wins there)', JSON.stringify({ apiKeyHelper: '' }), false, true],
    ['not JSON, the key quoted in it (the ssh rung: named — billing wins on both)', '{ "apiKeyHelper": ', null, true],
    ['not JSON, an unquoted key', '{ apiKeyHelper: "/x" }', null, null],
    ['not JSON, never mentioning a helper (no reading can name one: the ssh rung says none)', '{ "theme": ', null, false],
    ['JSON but not an object', '[]', null, false],
    ['a folder where the file goes', 'folder', null, null],
    ['a FIFO where the file goes (never opened: nothing waits)', 'fifo', null, null],
    ['a file over 1 MiB naming none (the ssh rung reads text: none)', BIG, null, false],
  ];
  const seen = [];
  for (const [what, how, want, wantSsh] of STATES) {
    put(how);
    const hub = await byHub(), dev = BP.remoteHelperFact(await byDevice(PROBES, HostManager), 'claude');
    const sh = await byShell(HostManager), ssh = BP.remoteHelperFact(sh.st, 'claude');
    seen.push({ what, hub, dev, ssh });
    ok(hub === want, `this machine's create, a settings file that is ${what}: the fact reads ${want}`, { hub });
    ok(dev === hub, `a PAIRED machine's device probe on the same file (${what}): ${hub} — the answer this machine's create gives`, { dev, hub });
    ok(sh.carried && ssh === wantSsh, `the ssh rung on the same file (${what}): ${wantSsh}${wantSsh === hub ? '' : ` (this machine: ${hub})`}`, { ssh, out: sh.out });
  }
  ok(seen.every((s) => s.ssh !== false || s.hub !== true) && seen.filter((s) => s.ssh === false && s.hub === null).every((s) => !/apiKeyHelper/.test(STATES.find((x) => x[0] === s.what)[1])),
    'the ssh rung\'s law: it never reads «none» where this machine reads a helper, and reads «none» where this machine cannot read only when the file never mentions the setting', seen);
  // RED CONTROLS (anchored copies): the probe as the release read it, the field not passed, the field not read, the release's rung
  put('{ "theme": ');
  const relProbe = M.load('src/machine-probes.js', anchored(PROBES_SRC, '  const helper = helperFact();\n  if (helper === true) r.keyHelper = true; else if (helper === null) r.keyHelperUnread = true;\n',
    "  try { if (readJson(path.join(home, '.claude', 'settings.json'))?.apiKeyHelper) r.keyHelper = true; } catch { }\n", 'probe-two-states'), 'probe-two-states'); // stale-pins: kept — the control plants the release's line
  ok(BP.remoteHelperFact(await byDevice(relProbe, HostManager), 'claude') === false && (await byHub()) === null,
    'RED CONTROL (the probe as the release read it: readJson, true / false): a file that does not parse reads «none» on the paired machine while this machine says it cannot be read — the parity legs above can go red');
  const noPass = M.load('src/hosts.js', anchored(HOSTS_SRC, ', ...(f.claude.keyHelperUnread === true ? { keyHelperUnread: true } : {})', '', 'unread-not-passed'), 'unread-not-passed');
  ok(BP.remoteHelperFact(await byDevice(PROBES, noPass.HostManager), 'claude') === false, 'RED CONTROL (backendStatus without the pass-through): the device said it cannot be read and the hub reads «none»');
  const noRead = M.load('src/billing-pick.js', anchored(BP_SRC, '  return r.keyHelperUnread === true ? null : false;', '  return false;', 'unread-not-read'), 'unread-not-read');
  ok(noRead.remoteHelperFact(await byDevice(PROBES, HostManager), 'claude') === false, 'RED CONTROL (remoteHelperFact without the third state): «cannot be read» read as «none»');
  put('folder');
  const RELEASE_RUNG = 'grep -q "\\"apiKeyHelper\\"" "$HOME/.claude/settings.json" 2>/dev/null && echo "claude-helper|yes"; '; // stale-pins: kept — the release's rung, planted
  ok(BP.remoteHelperFact((await byShell(HostManager, RELEASE_RUNG)).st, 'claude') === false && BP.remoteHelperFact((await byShell(HostManager)).st, 'claude') === null,
    'RED CONTROL (the release\'s ssh rung, a folder where the file goes): it reads «none» where the rung now says it cannot be read');
  { const sh = await byShell(HostManager); let script = ''; await HostManager.prototype.backendStatus.call({ get: () => BOX, deviceBounded: async () => { throw new Error('device link lost'); }, _hostShell: async (h, s) => { script = s; return ''; } }, 'h-2');
    const greps = script.split('"$HOME/.claude/settings.json" 2>/dev/null').length - 1, guarded = script.split('[ -f "$HOME/.claude/settings.json" ] && grep -q "\\"apiKeyHelper\\"" "$HOME/.claude/settings.json" 2>/dev/null').length - 1;
    ok(sh.carried && greps === 1 && guarded === 1, 'the ssh script greps the settings file only when it is a regular file — the login ladder\'s grep and the rung alike (a FIFO there never holds the probe)', { greps, guarded }); }
  // THE RUNG NEVER FAILS OPEN (主开发 05:30Z): a regular, readable file grep then cannot READ (an I/O error, a stale network handle —
  // grep's exit 2) is «cannot be read», never «none». A stand-in grep on the PATH exits 2.
  put(JSON.stringify({ apiKeyHelper: '/usr/local/bin/key-helper' }));
  const failBin = path.join(scratchDir('bpick-failgrep'), 'bin'); fs.mkdirSync(failBin, { recursive: true });
  fs.writeFileSync(path.join(failBin, 'grep'), '#!/bin/sh\nexit 2\n', { mode: 0o755 });
  const failed = BP.remoteHelperFact((await byShell(HostManager, HF.SSH_HELPER_RUNG, `${failBin}:`)).st, 'claude');
  ok(failed === null, 'the ssh rung over a file grep cannot read (its exit 2): «cannot be read» — billing wins, never «none»', failed);
  // the SECOND grep's exit too: the quoted key not found (1), then the bare name's grep cannot read (2)
  const halfBin = path.join(scratchDir('bpick-halfgrep'), 'bin'); fs.mkdirSync(halfBin, { recursive: true });
  fs.writeFileSync(path.join(halfBin, 'grep'), '#!/bin/sh\ncase "$2" in *\\"*) exit 1;; *) exit 2;; esac\n', { mode: 0o755 });
  const half = BP.remoteHelperFact((await byShell(HostManager, HF.SSH_HELPER_RUNG, `${halfBin}:`)).st, 'claude');
  ok(half === null, 'the quoted key\'s grep finds none (1) and the bare name\'s grep cannot read (2): «cannot be read», never «none»', half);
  // a login shell that set errexit: the common no-match (exit 1) never ends the probe (its later lines still answer)
  put(JSON.stringify({ theme: 'dark' }));
  const strict = execFileSync('sh', ['-c', `set -e; ${HF.SSH_HELPER_RUNG}echo after-the-rung`], { env: { HOME, PATH: '/usr/bin:/bin' }, encoding: 'utf8', timeout: 5000 });
  ok(strict.includes('after-the-rung') && !strict.includes('claude-helper|'), 'under errexit a file naming none prints nothing and the probe goes on (each grep\'s exit read through ||)', strict);
  put(JSON.stringify({ apiKeyHelper: '/usr/local/bin/key-helper' }));
  const RUNG_412 = 'vs_kh="$HOME/.claude/settings.json"; if [ -f "$vs_kh" ] && [ -r "$vs_kh" ]; then if grep -q "\\"apiKeyHelper\\"" "$vs_kh"; then echo "claude-helper|yes"; elif grep -q apiKeyHelper "$vs_kh"; then echo "claude-helper|unread"; fi; elif [ -e "$vs_kh" ]; then echo "claude-helper|unread"; fi; '; // stale-pins: kept — the rung as B-bc9f shipped it, planted
  ok(BP.remoteHelperFact((await byShell(HostManager, RUNG_412, `${failBin}:`)).st, 'claude') === false, 'RED CONTROL (the rung as B-bc9f shipped it: a grep that fails reads as no match): the same file reads «none» — it failed open');
  const PROBES_ST = "    return st.isFile() && st.size <= SETTINGS_READ_MAX ? { text: fs.readFileSync(file, 'utf-8') } : { text: null };";
  ok(PROBES_SRC.split(PROBES_ST).length === 2 && !PROBES_SRC.includes('fs.openSync('), 'the probe stats the file before it reads it (a FIFO is never opened — a blocking open would hold the agent; the FIFO leg above would never end)');
  put(JSON.stringify({ apiKeyHelper: '/usr/local/bin/key-helper' }));
}

console.log('— ⑨b B-77ed: a paired machine reads the START\'s files — the CLI\'s config dirs, the project\'s two, the person\'s own — by the one rule');
{
  const put = (how) => {
    fs.rmSync(SETTINGS, { recursive: true, force: true });
    if (how === 'missing') return;
    if (how === 'folder') return void fs.mkdirSync(SETTINGS);
    if (how === 'fifo') return void execFileSync('mkfifo', [SETTINGS]);
    fs.writeFileSync(SETTINGS, how);
  };
  const HF = require(path.join(REPO, 'src/helper-fact.js')), PROBES = require(path.join(REPO, 'src/machine-probes.js'));
  const PROBES_SRC = read('src/machine-probes.js'), BP_SRC = read('src/billing-pick.js'), HOSTS_SRC = read('src/hosts.js');
  const BOX = { id: 'h-2', name: 'build-box', host: 'build-box.lan', transport: 'ssh' };
  const runRung = (rung, env = {}) => execFileSync('sh', ['-c', `${rung}true`], { env: { HOME, PATH: '/usr/bin:/bin', ...env }, encoding: 'utf8', timeout: 10000 });
  // a paired machine whose agent answers the start (the REAL probe), or an agent too old to (its facts carry no startHelper): then
  // the shell rung over the same start decides
  const askDevice = async (start, { probes = PROBES, HM = HostManager, bp = BP, old = false, env = {} } = {}) => bp.remoteHelperFact(await HM.prototype.backendStatus.call({ get: () => BOX,
    deviceBounded: async () => ({ probeCli: async (h) => { const facts = await probes.cliFacts({ claudeCmd: '/nonexistent-claude', codexCmd: '/nonexistent-codex', helper: old ? null : h }); return { facts }; } }),
    _hostShell: async (h, s) => `claude|yes|2.1.322\n${runRung(HF.sshHelperRungFor(start), env)}codex|no|\ncodex-login|no` }, 'h-2', { helper: start }), 'claude');
  const askShell = async (start, env = {}) => {
    let script = '';
    const st = await HostManager.prototype.backendStatus.call({ get: () => BOX, deviceBounded: async () => { throw new Error('device link lost'); },
      _hostShell: async (h, s) => { script = s; return `claude|yes|2.1.322\n${runRung(HF.sshHelperRungFor(start), env)}codex|no|\ncodex-login|no`; } }, 'h-2', { helper: start });
    return { fact: BP.remoteHelperFact(st, 'claude'), carried: script.includes(HF.sshHelperRungFor(start)) };
  };
  const byHub = async (extraArgs = FILE) => { const x = await drive(wsCreate, { accountId: 'sub-a1', extraArgs }); return saidKind(x, 'billing') ? true : saidKind(x, 'billingUnread') ? null : false; };
  put(JSON.stringify({ theme: 'dark' }));   // the CLI's own settings file names none: only the start's other files decide
  const PROJ = path.join(CWD, '.claude'), projFile = path.join(PROJ, 'settings.json'), localFile = path.join(PROJ, 'settings.local.json'), ownRel = 'own-77ed.json', ownFile = path.join(CWD, ownRel);
  fs.mkdirSync(PROJ, { recursive: true });
  const clear = () => { for (const f of [projFile, localFile, ownFile]) fs.rmSync(f, { force: true }); };
  const NAMES = JSON.stringify({ apiKeyHelper: '/usr/local/bin/project-helper' });
  const CASES = [
    ['the project file names a helper', () => fs.writeFileSync(projFile, NAMES), FILE, true],
    ['the project\'s settings.local.json names one', () => fs.writeFileSync(localFile, NAMES), FILE, true],
    ['the person\'s own file (relative to the cwd) names one', () => fs.writeFileSync(ownFile, NAMES), ['--settings', ownRel], true],
    ['the project file is not JSON, with an unquoted key', () => fs.writeFileSync(projFile, '{ apiKeyHelper: "/x" }'), FILE, null],
    ['the project file names none', () => fs.writeFileSync(projFile, JSON.stringify({ theme: 'light' })), FILE, false],
  ];
  for (const [what, plant, args, want] of CASES) {
    clear(); plant();
    const start = { cwd: CWD, ownFile: args[1] };
    const hub = await byHub(args), dev = await askDevice(start), sh = await askShell(start), old = await askDevice(start, { old: true });
    ok(hub === want && dev === want && sh.carried && sh.fact === want && old === want, `${what}: this machine's create, a paired machine's probe, its ssh rung — and an agent too old to answer the start (the rung decides) — all read ${want}`, { hub, dev, ssh: sh.fact, old });
  }
  clear();
  // the paths placed on THAT machine: a relative cwd is its home's; a path it cannot place is «cannot be read», never «none»
  const relProj = path.join(HOME, 'rel-77ed', '.claude'); fs.mkdirSync(relProj, { recursive: true }); fs.writeFileSync(path.join(relProj, 'settings.json'), NAMES);
  ok((await askDevice({ cwd: 'rel-77ed' })) === true && (await askShell({ cwd: 'rel-77ed' })).fact === true, 'a relative cwd is placed under that machine\'s home (as a remote cd places it): its project\'s helper is seen, by the probe and the rung');
  fs.rmSync(path.join(HOME, 'rel-77ed'), { recursive: true, force: true });
  ok((await askDevice({ cwd: '/a\nb' })) === null && (await askShell({ cwd: '/a\nb' })).fact === null, 'a cwd that cannot be placed (a newline): «cannot be read» — billing wins, never «none»');
  // THE CONFIG DIRS: a CLAUDE_CONFIG_DIR the CLI reads (the probe's own env; the rung's shell) names a helper the home file does not
  const CCD = scratchDir('bpick-77ed-ccd'); fs.writeFileSync(path.join(CCD, 'settings.json'), NAMES);
  const ccd0 = process.env.CLAUDE_CONFIG_DIR; process.env.CLAUDE_CONFIG_DIR = CCD;
  let devC; try { devC = await askDevice({ cwd: CWD }); } finally { if (ccd0 === undefined) delete process.env.CLAUDE_CONFIG_DIR; else process.env.CLAUDE_CONFIG_DIR = ccd0; }
  const shC = await askShell({ cwd: CWD }, { CLAUDE_CONFIG_DIR: CCD });
  ok(devC === true && shC.fact === true, 'a CLAUDE_CONFIG_DIR whose settings name a helper: the probe (its env) and the rung (its shell) both read named', { devC, shC: shC.fact });
  // ITS SECOND READ: the LOGIN shell's config dir (only in a profile — the CLI starts under `sh -lc`), a login shell that fails,
  // a FIFO in the project, a stalled read at the bound, a `~` cwd, a cut answer
  const PROF = path.join(HOME, '.profile'), LCCD = scratchDir('bpick-77ed-lccd'); fs.writeFileSync(path.join(LCCD, 'settings.json'), NAMES);
  fs.writeFileSync(PROF, `export CLAUDE_CONFIG_DIR=${LCCD}\n`); PROBES.forgetLoginDir();
  const devL = await askDevice({ cwd: CWD }), shL = await askShell({ cwd: CWD });
  ok(devL === true && shL.fact === true, 'a CLAUDE_CONFIG_DIR set only in the login profile (the CLI starts under sh -lc): the probe and the rung both read named', { devL, shL: shL.fact });
  const MLOGIN = M.load('src/machine-probes.js', anchored(PROBES_SRC, ", login || ''])", '])', 'probe-no-login-dir'), 'probe-no-login-dir'); MLOGIN.forgetLoginDir();
  ok((await askDevice({ cwd: CWD }, { probes: MLOGIN })) === false, 'RED CONTROL (the probe without the login shell\'s dir): «none» while the CLI would read the helper');
  const HNOLOGIN = M.load('src/helper-fact.js', anchored(read('src/helper-fact.js'), " + ccdWord('$vs_ccd')", '', 'rung-no-login-dir'), 'rung-no-login-dir');
  ok(BP.remoteHelperFact({ claude: { installed: true, ...(runRung(HNOLOGIN.sshHelperRungFor({ cwd: CWD })).includes('claude-helper|yes') ? { keyHelper: true } : {}) } }, 'claude') === false, 'RED CONTROL (the rung without the login shell\'s dir): «none» likewise');
  fs.writeFileSync(PROF, 'exit 3\n'); PROBES.forgetLoginDir();
  ok((await askDevice({ cwd: CWD })) === null && (await askShell({ cwd: CWD })).fact === null, 'a login shell that fails: «cannot be read» on both roads, never «none»');
  fs.rmSync(PROF, { force: true }); PROBES.forgetLoginDir();
  fs.rmSync(projFile, { force: true }); execFileSync('mkfifo', [projFile]);
  ok((await byHub()) === null && (await askDevice({ cwd: CWD, ownFile: FILE[1] })) === null && (await askShell({ cwd: CWD, ownFile: FILE[1] })).fact === null, 'a FIFO where the project file goes: «cannot be read» on all three roads (nothing waits on it)');
  fs.rmSync(projFile, { force: true });
  // a stuck mount: each read is held (and let go after the legs — a held read stays the ONE read in flight for its file, so the
  // starts after it would only join it)
  const stalls = [], stuck = () => new Promise((r) => stalls.push(r));
  const firstStuck = await PROBES.startHelperFact({ cwd: CWD }, { readOff: stuck, boundMs: 60 });
  for (let i = 0; i < 100 && !stalls.length; i++) await new Promise((r) => setTimeout(r, 20));   // (the bound may answer before the login shell does)
  const readsHeld = stalls.length;
  ok(firstStuck === 'unread' && readsHeld >= 3, 'a read that never ends (a stuck mount): the start answers «cannot be read» at its bound', { firstStuck, readsHeld });
  const secondStuck = await PROBES.startHelperFact({ cwd: CWD }, { readOff: stuck, boundMs: 60 });
  ok(secondStuck === 'unread' && stalls.length === readsHeld, 'a second start while those reads hang JOINS them: no new read of a file already in flight (one held thread per file, never one per start)', { secondStuck, reads: stalls.length, readsHeld });
  for (const r of stalls) r({ missing: true });
  await new Promise((r) => setImmediate(r));   // the held reads end: the next start reads afresh
  const tilde = path.join(HOME, 'tilde-77ed', '.claude'); fs.mkdirSync(tilde, { recursive: true }); fs.writeFileSync(path.join(tilde, 'settings.json'), NAMES);
  ok((await askDevice({ cwd: '~/tilde-77ed' })) === true && (await askShell({ cwd: '~/tilde-77ed' })).fact === true, 'a `~/…` cwd is placed under that machine\'s home on both roads');
  fs.rmSync(path.join(HOME, 'tilde-77ed'), { recursive: true, force: true });
  // ── THE CURE OF ROUND w38ycpn6z ──
  // THE MUST: the rung's text runs the same under sh, bash and zsh — no command kept in a variable (zsh never splits one)
  const hasShell = (sh) => { try { return execFileSync('sh', ['-c', `command -v ${sh}`], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin' } }).trim() !== ''; } catch { return false; } };
  const rungIn = (sh, rung) => { try { return execFileSync(sh, ['-c', `${rung}true`], { env: { HOME, PATH: '/usr/bin:/bin' }, encoding: 'utf8', timeout: 10000 }); } catch (e) { return String((e && e.stdout) || '') + '(exit ' + (e && e.status) + ')'; } };
  const START_RUNG = HF.sshHelperRungFor({ cwd: CWD, ownFile: FILE[1] });
  clear(); fs.rmSync(PROF, { force: true });
  const shells = ['sh', 'bash', 'zsh'].filter(hasShell), rungSaid = shells.map((sh) => `${sh}: ${(rungIn(sh, START_RUNG).match(/claude-helper\|\w+/) || ['(no line)'])[0]}`);
  ok(rungSaid.length >= 2 && rungSaid.every((x) => x.endsWith('claude-helper|none')), `the start's rung, no helper planted anywhere: «none» in every shell here (${rungSaid.join(' · ')})`, rungSaid);
  if (shells.includes('zsh') && hasShell('timeout')) {
    const VAR_FORM = M.load('src/helper-fact.js', anchored(read('src/helper-fact.js'), /    \+ `if command -v timeout >\/dev\/null 2>&1; then vs_ccd_out=\$\(timeout 3 sh \$\{ask\}\) \|\| vs_kh_all="\$vs_kh_all unread"; `\n    \+ `else vs_ccd_out=\$\(sh \$\{ask\}\) \|\| vs_kh_all="\$vs_kh_all unread"; fi; `\n/,
      '    + `if command -v timeout >/dev/null 2>&1; then vs_lsh="timeout 3 sh"; else vs_lsh="sh"; fi; `\n    + `vs_ccd_out=$($vs_lsh ${ask}) || vs_kh_all="$vs_kh_all unread"; `\n', 'rung-command-in-a-variable'), 'rung-command-in-a-variable');
    const vz = rungIn('zsh', VAR_FORM.sshHelperRungFor({ cwd: CWD, ownFile: FILE[1] })), vs = rungIn('sh', VAR_FORM.sshHelperRungFor({ cwd: CWD, ownFile: FILE[1] }));
    ok(/claude-helper\|unread/.test(vz) && /claude-helper\|none/.test(vs), 'RED CONTROL (the command kept in a variable, as 18b7851ab had it): «none» under sh, «cannot be read» under zsh — every start there would set the person\'s file aside', { zsh: vz.slice(-60), sh: vs.slice(-60) });
  } else ok(true, '(no zsh or no timeout on this machine: the variable form\'s control cannot show here — said, not skipped silently)');
  // (1) ONE PLACEMENT: this machine's start, the probe and the rung place the start's files by ONE helper — a parity table
  const placedSh = (start) => { const { files, unplaced } = HF.startFilesOf(start, HF.shellAt); return { files: files.map((w) => path.posix.normalize(execFileSync('sh', ['-c', `printf '%s' ${w}`], { env: { HOME, PATH: '/usr/bin:/bin' }, encoding: 'utf8' }))), unplaced }; };   // (the shell's spelling read lexically: '//' and 'p/../' as node joins them)
  const placedJs = (start) => { const r = HF.startFilesOf(start, HF.nodeAt(path, HOME)); return { files: r.files.map((f) => path.posix.normalize(f)), unplaced: r.unplaced }; };   // (both roads join literally — the kernel resolves; compared lexically)
  const ROWS = [{ cwd: '/srv/p', ownFile: 'own.json' }, { cwd: '/srv/p/', ownFile: '/etc/own.json' }, { cwd: '~/p', ownFile: '../o.json' }, { cwd: '~' }, { cwd: 'p', ownFile: 'sub/o.json' }, { cwd: '/srv/p', ownFile: '~/own.json' }, { cwd: null, ownFile: 'own.json' }, { cwd: '/a\nb' }, { cwd: '/srv/p', ownFile: '~' }, { cwd: '/srv/p', ownFile: '~bob/own.json' }, { cwd: null, ownFile: '~/own.json' }];
  const par = ROWS.map((r) => { const a = placedJs(r), b = placedSh(r); return { r, same: JSON.stringify(a) === JSON.stringify(b), a, b }; });
  ok(par.every((x) => x.same), `ONE placement: the node roads (this machine, the probe) and the rung place every start alike (${ROWS.length} rows: absolute, a trailing /, ~, a relative cwd, a ~/ own file (OWN_TILDE = ${HF.OWN_TILDE}: both files), ~ and ~name, an own file with no cwd, a newline)`, par.filter((x) => !x.same));
  // the probe on a Windows device places `~\…` as its own tilde (its path module), the rung refuses a backslash (a POSIX shell)
  const W32 = HF.startFilesOf({ cwd: 'C:\\p', ownFile: '~\\own.json' }, HF.nodeAt(path.win32, 'C:\\Users\\u')), W32c = HF.startFilesOf({ cwd: '~\\proj' }, HF.nodeAt(path.win32, 'C:\\Users\\u'));
  ok(JSON.stringify(W32.files) === JSON.stringify(['C:\\p\\.claude/settings.json', 'C:\\p\\.claude/settings.local.json', 'C:\\Users\\u\\own.json', 'C:\\p\\~\\own.json']) && !W32.unplaced && W32c.files[0] === 'C:\\Users\\u\\proj\\.claude/settings.json' && HF.startFilesOf({ cwd: '/srv/p', ownFile: '~\\own.json' }, HF.shellAt).unplaced,
    'a Windows device: an own file «~\\…» is judged over both files (under its home, and literal under the cwd), a cwd «~\\…» under its home; the rung (a POSIX shell) cannot place a backslash', { W32, W32c });
  ok(read('src/ws-create.js').includes("BILLPICK.startFilesOf({ cwd, ownFile }, BILLPICK.nodeAt(path, (env && env.HOME) || os.homedir()))") && PROBES_SRC.includes('startFilesOf({ cwd, ownFile }, nodeAt(path, os.homedir()))') && read('src/helper-fact.js').includes('const { files: words, unplaced } = startFilesOf(start, shellAt);'),
    'all three roads call it: this machine\'s start (ws-create), the device probe (machine-probes), the rung\'s builder (helper-fact)');
  // THE TILDE RULE (主开发 09:31Z): an own file `~/…` reaches the CLI unexpanded; the fact is judged over BOTH files it could open —
  // under that machine's home and the literal `<cwd>/~/…` — on all three roads
  const TOWN = '~/own-77ed-t.json', homeOwn = path.join(HOME, 'own-77ed-t.json'), litDir = path.join(CWD, '~'), litOwn = path.join(litDir, 'own-77ed-t.json');
  const tclear = () => { fs.rmSync(homeOwn, { force: true }); fs.rmSync(litDir, { recursive: true, force: true }); };
  const three = async () => ({ hub: await byHub(['--settings', TOWN]), dev: await askDevice({ cwd: CWD, ownFile: TOWN }), sh: (await askShell({ cwd: CWD, ownFile: TOWN })).fact });
  const TCASES = [
    ['only the LITERAL <cwd>/~/ file names a helper', () => { fs.mkdirSync(litDir, { recursive: true }); fs.writeFileSync(litOwn, NAMES); }, true],
    ['only the HOME\'s file names a helper', () => fs.writeFileSync(homeOwn, NAMES), true],
    ['neither file exists', () => { }, false],
    ['the literal one is not JSON (the home\'s names none)', () => { fs.mkdirSync(litDir, { recursive: true }); fs.writeFileSync(litOwn, '{ apiKeyHelper: 1 }'); fs.writeFileSync(homeOwn, JSON.stringify({ theme: 'x' })); }, null],
  ];
  for (const [what, plant, want] of TCASES) {
    clear(); tclear(); plant();
    const got = await three();
    ok(got.hub === want && got.dev === want && got.sh === want, `an own file «~/…» — ${what}: this machine's start, the probe and the rung all read ${want}`, got);
  }
  tclear(); fs.mkdirSync(litDir, { recursive: true }); fs.writeFileSync(litOwn, NAMES);
  const ONE_TILDE = M.load('src/helper-fact.js', anchored(read('src/helper-fact.js'), ' if (base) files.push(at.under(base, s)); else unplaced = true; }', ' }', 'own-tilde-home-only'), 'own-tilde-home-only');
  ok(BP.remoteHelperFact({ claude: { installed: true, ...(runRung(ONE_TILDE.sshHelperRungFor({ cwd: CWD, ownFile: TOWN })).includes('claude-helper|yes') ? { keyHelper: true } : {}) } }, 'claude') === false, 'RED CONTROL (a «~/…» own file read under the home only): the literal file\'s helper is missed — «none» ⇒ RED');
  tclear(); clear();
  // (2) ONE login shell in flight: two starts at once ask it once
  const LCOUNT = path.join(HOME, 'login-count');
  fs.writeFileSync(PROF, `echo x >> ${JSON.stringify(LCOUNT)}\n`); fs.rmSync(LCOUNT, { force: true }); PROBES.forgetLoginDir();
  await Promise.all([PROBES.startHelperFact({ cwd: CWD }), PROBES.startHelperFact({ cwd: CWD }), PROBES.startHelperFact({ cwd: CWD })]);
  const asked = fs.existsSync(LCOUNT) ? fs.readFileSync(LCOUNT, 'utf8').split('\n').filter(Boolean).length : 0;
  ok(asked === 1, `three starts at once: the login shell is asked ONCE (${asked}), the others join it`);
  fs.rmSync(PROF, { force: true }); fs.rmSync(LCOUNT, { force: true }); PROBES.forgetLoginDir();
  // (2b) B-77ed's REMAINDER (主开发 2026-11-20): a Windows machine with a POSIX shell starts its conversations under `sh -lc` (the door
  // lets the spawn through when the agent's LAST HELLO said `sh`), and there the login shell's dir is read by a NATIVE child of that
  // shell: the agent's own node, handed as $0 (what the CLI, such a child, will read). Both sides, here with process.platform as
  // win32; the native-child read runs for real (this node is the agent's node). NOT MEASURED on Windows itself: no Windows machine
  // runs in our gates.
  const asWin = async (shells, fn, probes = PROBES) => {
    const pd = Object.getOwnPropertyDescriptor(process, 'platform');
    probes.useShellsSaid(() => shells); probes.forgetLoginDir();
    Object.defineProperty(process, 'platform', { ...pd, value: 'win32' });
    try { return await fn(probes); } finally { Object.defineProperty(process, 'platform', pd); probes.useShellsSaid(null); probes.forgetLoginDir(); }
  };
  const loginRuns = () => (fs.existsSync(LCOUNT) ? fs.readFileSync(LCOUNT, 'utf8').split('\n').filter(Boolean).length : 0);
  const winProfile = () => { fs.writeFileSync(PROF, `echo x >> ${JSON.stringify(LCOUNT)}\nexport CLAUDE_CONFIG_DIR=${LCCD}\n`); fs.rmSync(LCOUNT, { force: true }); };
  winProfile();
  const winSh = await asWin(['sh', 'bash'], (p) => p.startHelperFact({ cwd: CWD }));
  ok(winSh === 'named' && loginRuns() === 1, `win32, the last hello said sh: the login shell is asked once (${loginRuns()}) and its CLAUDE_CONFIG_DIR, read by the agent's own node as a native child of it, names the helper (${winSh})`, { winSh, runs: loginRuns() });
  winProfile();
  const WIN_OLD = M.load('src/machine-probes.js', anchored(PROBES_SRC, "  if (process.platform === 'win32' && !startsUnderSh()) return shSaidOnce ? null : '';", "  if (process.platform === 'win32') return '';", 'win32-never-asks'), 'win32-never-asks');   // stale-pins: kept — the control plants the rule as it was
  const winOld = await asWin(['sh', 'bash'], (p) => p.startHelperFact({ cwd: CWD }), WIN_OLD);
  ok(winOld === 'none' && loginRuns() === 0, `RED CONTROL (the rule before: win32 never asks): the login shell's helper is missed — ${winOld} while the CLI started under that shell would read it`, { winOld, runs: loginRuns() });
  for (const [what, shells] of [['the last hello said no sh (bash only)', ['bash']], ['nothing said (the hub\'s own process: no seam handed)', null]]) {
    winProfile();
    const got = await asWin(shells, (p) => p.startHelperFact({ cwd: CWD }));
    ok(got === 'none' && loginRuns() === 0, `win32, ${what}: no login shell is started (${loginRuns()}) — today's answer, the empty folder (${got})`, { got, runs: loginRuns() });
  }
  winProfile();
  const WIN_ALWAYS = M.load('src/machine-probes.js', anchored(PROBES_SRC, "  if (process.platform === 'win32' && !startsUnderSh()) return shSaidOnce ? null : '';", "  if (false) return '';", 'win32-asks-always'), 'win32-asks-always');
  const winAlways = await asWin(['bash'], (p) => p.startHelperFact({ cwd: CWD }), WIN_ALWAYS);
  ok(winAlways === 'named' && loginRuns() === 1, `RED CONTROL (asked whatever the hello said): a Windows machine whose agent never starts under sh had its login shell started (${loginRuns()})`, { winAlways, runs: loginRuns() });
  winProfile(); PROBES.useShellsSaid(() => []); PROBES.forgetLoginDir();
  let posixGot; try { posixGot = await PROBES.startHelperFact({ cwd: CWD }); } finally { PROBES.useShellsSaid(null); PROBES.forgetLoginDir(); }
  ok(process.platform !== 'win32' && posixGot === 'named' && loginRuns() === 1, `a machine that is not win32 keeps today's read, whatever list is handed (${posixGot}, asked ${loginRuns()})`, { posixGot, runs: loginRuns() });
  // A LIST THAT HAD sh AND LOST IT (round wdg6h2r4m, should 1): a later hello's probe dropped `sh` while an earlier link's door may
  // still pass a `sh -lc` start — «cannot be read» (billing wins), never the empty word; the login shell is not started for it
  const lostOf = async (probes) => asWin(['sh'], async (p) => { const said = { l: ['sh'] }; p.useShellsSaid(() => said.l); const first = await p.startHelperFact({ cwd: CWD }); said.l = ['bash']; p.forgetLoginDir(); const runs = loginRuns(); const then = await p.startHelperFact({ cwd: CWD }); return { first, then, more: loginRuns() - runs }; }, probes);
  winProfile();
  const lost = await lostOf(PROBES);
  ok(lost.first === 'named' && lost.then === 'unread' && lost.more === 0, `win32, sh said then LOST in a later hello: «cannot be read», not the empty word, and no login shell started for it (${lost.first} → ${lost.then})`, lost);
  winProfile();
  const LOST_OLD = M.load('src/machine-probes.js', anchored(PROBES_SRC, 'return shSaidOnce ? null : \'\';', 'return \'\';', 'lost-sh-reads-none'), 'lost-sh-reads-none');
  const lostOld = await lostOf(LOST_OLD);
  ok(lostOld.then === 'none', `RED CONTROL (a lost sh read as the empty word): «none» while an earlier link may still start under that shell (${lostOld.then})`, lostOld);
  // B-b83c (主开发 r317 (2)): two BEHAVIOUR legs where only source pins stood — a stand-in device handle each
  {
    const linkOf = (info, { memory = true } = {}) => ({ ...(memory ? { helloInfo: () => info, isLinked: () => true } : {}), status: () => ({ connected: true, info }) });
    const AGENT = '/opt/agent/node/bin/node';
    ok(HostManager.scannerNodeOf(linkOf({ nodePath: AGENT })) === AGENT && HostManager.scannerNodeOf(linkOf({})) === 'node' && HostManager.scannerNodeOf(linkOf({ nodePath: AGENT }, { memory: false })) === AGENT && HostManager.scannerNodeOf(linkOf({ nodePath: 'node' })) === 'node' && HostManager.scannerNodeOf({}) === 'node',
      'B-b83c: the usage scanner\'s fallback runs the agent\'s own node as its first word when the hello said one (read from memory, or status() on an older link), else `node`');
    let connects = 0, asked = 0;
    const host = (transport, dm) => ({ connectedDevice: () => { asked++; return dm; }, deviceBounded: async () => { connects++; return dm; } });
    const ssh = await HostManager.prototype._agentNodeOf.call(host('ssh', linkOf({ nodePath: AGENT })), { id: 'h-ssh', transport: 'ssh' });
    const askedSsh = asked;
    const dialUp = await HostManager.prototype._agentNodeOf.call(host('dial', linkOf({ nodePath: AGENT })), { id: 'h-dial', transport: 'dial' });
    const dialDown = await HostManager.prototype._agentNodeOf.call(host('dial', null), { id: 'h-dial', transport: 'dial' });
    ok(ssh === null && askedSsh === 0 && dialUp === AGENT && dialDown === null && connects === 0, `B-b83c: the host's reader answers nothing for an ssh host (nothing asked), the agent's node for a dial link already up, nothing for one that is not — and never opens a connect (${connects})`, { ssh, dialUp, dialDown, connects, asked });
  }
  // WHICH READ answered (its read's S1): a CLAUDE_CONFIG_DIR the profile sets but does NOT export is the shell's variable, never a
  // child's — the native child (as the CLI, a child of that shell) does not see it, today's printf on a POSIX machine does
  fs.writeFileSync(PROF, `echo x >> ${JSON.stringify(LCOUNT)}\nCLAUDE_CONFIG_DIR=${LCCD}\n`); fs.rmSync(LCOUNT, { force: true });
  const winUnexp = await asWin(['sh'], (p) => p.startHelperFact({ cwd: CWD }));
  ok(winUnexp === 'none' && loginRuns() === 1, `win32: a variable the profile sets but does not export is not the CLI's — the native child reads none of it, as the CLI would (${winUnexp}, asked ${loginRuns()})`, { winUnexp, runs: loginRuns() });
  fs.rmSync(LCOUNT, { force: true });
  const WIN_PRINTF = M.load('src/machine-probes.js', anchored(PROBES_SRC, "process.platform === 'win32' ? ['-lc', WIN_CCD_READ, process.execPath.replace(/\\\\/g, '/'), WIN_CCD_JS] : ", '', 'win32-printf-read'), 'win32-printf-read');
  const winPrintf = await asWin(['sh'], (p) => p.startHelperFact({ cwd: CWD }), WIN_PRINTF);
  ok(winPrintf === 'named', `RED CONTROL (win32 given the printf read): the shell's own variable read as the CLI's folder (${winPrintf}) — the native-child leg above tells the two reads apart`, { winPrintf });
  fs.rmSync(LCOUNT, { force: true }); PROBES.useShellsSaid(() => ['sh']); PROBES.forgetLoginDir();
  let posixUnexp; try { posixUnexp = await PROBES.startHelperFact({ cwd: CWD }); } finally { PROBES.useShellsSaid(null); PROBES.forgetLoginDir(); }
  ok(posixUnexp === 'named' && loginRuns() === 1, `a machine that is not win32 keeps today's printf read, unchanged (the shell's variable: ${posixUnexp})`, { posixUnexp, runs: loginRuns() });
  // THE AGENT SIDE (its read's MUST): the hello-ack KEEPS the list it says, and the agent hands it to the probe — text-pinned here
  // (the real daemons are the heavy suites'), each with its red control
  const AGENTD_SRC = read('src/agentd/agentd.js');
  const seamBad = (src) => [
    ...(src.split('posixShells: (posixShellsSaid = shells),').length === 2 ? [] : ['the hello-ack no longer keeps the list it says (posixShells: (posixShellsSaid = shells))']),
    ...(src.split('machineProbes.useShellsSaid(() => posixShellsSaid);').length === 2 ? [] : ['the agent no longer hands that list to the probe (machineProbes.useShellsSaid(() => posixShellsSaid))'])];
  ok(typeof PROBES.useShellsSaid === 'function' && !seamBad(AGENTD_SRC).length, 'the agent side: its hello-ack keeps the list it SAYS (the value the door reads) and hands it to the probe, once each', seamBad(AGENTD_SRC));
  ok(seamBad(anchored(AGENTD_SRC, 'posixShells: (posixShellsSaid = shells),', 'posixShells: shells,', 'hello-keeps-nothing')).length === 1 && seamBad(anchored(AGENTD_SRC, 'machineProbes.useShellsSaid(() => posixShellsSaid);', '', 'agent-hands-nothing')).length === 1,   // stale-pins: kept — the control plants the hello line as it was
    'RED CONTROL (the agent side): a hello that keeps nothing, or an agent that hands nothing, is RED by name');
  fs.rmSync(PROF, { force: true }); fs.rmSync(LCOUNT, { force: true }); PROBES.forgetLoginDir();
  // (3) A HOSTILE NAME through sh over a scratch tree: a single quote, a dollar with parentheses, a backtick, a space — read as
  // the path it is, nothing in it runs
  const HOSTILE = path.join(HOME, "it's $(touch RAN-1) `touch RAN-2` a b"), RUNAT = scratchDir('bpick-77ed-runat');
  fs.mkdirSync(path.join(HOSTILE, '.claude'), { recursive: true }); fs.writeFileSync(path.join(HOSTILE, '.claude', 'settings.json'), NAMES);
  const inSh = (rung, sh = 'sh') => execFileSync(sh, ['-c', `${rung}true`], { cwd: RUNAT, env: { HOME, PATH: '/usr/bin:/bin' }, encoding: 'utf8', timeout: 10000 });
  const hostileSaid = shells.map((sh) => `${sh}: ${(inSh(HF.sshHelperRungFor({ cwd: HOSTILE }), sh).match(/claude-helper\|\w+/) || ['(no line)'])[0]}`);
  ok(hostileSaid.every((x) => x.endsWith('claude-helper|yes')) && !fs.readdirSync(RUNAT).some((f) => f.startsWith('RAN-')), `a folder named with a quote, $( ), a backtick and spaces: its project's helper is seen in every shell here, and nothing in its name ran (${hostileSaid.join(' · ')})`, { said: hostileSaid, ran: fs.readdirSync(RUNAT) });
  const DQ_RUNG = M.load('src/helper-fact.js', anchored(read('src/helper-fact.js'), "const shq = (s) => `'${String(s).replace(/'/g, `'\\\\''`)}'`;", 'const shq = (s) => JSON.stringify(String(s));', 'rung-double-quoted'), 'rung-double-quoted');
  let hostileDq = ''; try { hostileDq = inSh(DQ_RUNG.sshHelperRungFor({ cwd: HOSTILE })); } catch (e) { hostileDq = String((e && e.stdout) || ''); }
  ok(!/claude-helper\|yes/.test(hostileDq) || fs.readdirSync(RUNAT).some((f) => f.startsWith('RAN-')), 'RED CONTROL (the paths double-quoted): the name\'s $( ) and backtick RUN and the helper is missed ⇒ RED', { said: hostileDq.trim(), ran: fs.readdirSync(RUNAT) });
  fs.rmSync(HOSTILE, { recursive: true, force: true }); fs.rmSync(RUNAT, { recursive: true, force: true });
  const cut = BP.remoteHelperFact(await HostManager.prototype.backendStatus.call({ get: () => BOX, deviceBounded: async () => { throw new Error('device link lost'); }, _hostShell: async () => 'claude|yes|2.1.322\n' }, 'h-2', { helper: { cwd: CWD } }), 'claude');
  ok(cut === null, 'a start\'s answer cut short (no claude-helper line — a dial run that timed out): «cannot be read», never «none»', cut);
  // THE WIRING: the client sends the start with its ask; the agent hands it to the probe
  const { DeviceManager } = require(path.join(REPO, 'src/agentd/client.js'));
  const dmS = Object.create(DeviceManager.prototype); let sentOp = null; dmS._request = (pl) => { sentOp = pl; return Promise.resolve({}); };
  await dmS.probeCli({ cwd: '/home/u/proj', ownFile: 'own.json' });
  ok(sentOp && sentOp.op === 'probe-cli' && sentOp.helper && sentOp.helper.cwd === '/home/u/proj' && sentOp.helper.ownFile === 'own.json', 'the client\'s probe-cli carries the start (its cwd and own file)', sentOp);
  ok(read('src/agentd/agentd.js').includes("machineProbes.cliFacts({ helper: msg.helper && typeof msg.helper === 'object' ? { cwd: msg.helper.cwd, ownFile: msg.helper.ownFile } : null })"), 'the agent hands the op\'s start to the probe');
  const hs = hostsStub({ helper: false }); fs.writeFileSync(projFile, NAMES); await makeCreate(remoteCreate, { hosts: hs }).create(R({ accountId: 'sub-a1', extraArgs: FILE }));
  ok(hs.helpers.length === 1 && hs.helpers[0] && hs.helpers[0].cwd === '/home/u/proj' && hs.helpers[0].ownFile === FILE[1], 'a remote create asks its machine about THIS start: the cwd and the person\'s own file ride the backend-status ask', hs.helpers);
  // RED CONTROLS (anchored, each proving its plant)
  fs.writeFileSync(projFile, NAMES);
  const homeOnly = M.load('src/machine-probes.js', anchored(PROBES_SRC, '.concat(placed.files)', '', 'probe-dirs-only'), 'probe-dirs-only');
  ok((await askDevice({ cwd: CWD, ownFile: FILE[1] }, { probes: homeOnly })) === false, 'RED CONTROL (the probe reading the config dirs only, as before B-77ed): the project\'s helper is missed — «none» while this machine says named');
  const noStart = M.load('src/billing-pick.js', anchored(BP_SRC, "  if (typeof r.startHelper === 'string') return r.startHelper === 'named' ? true : r.startHelper === 'none' ? false : null;", '', 'start-fact-unread'), 'start-fact-unread');
  ok((await askDevice({ cwd: CWD, ownFile: FILE[1] }, { bp: noStart })) === false, 'RED CONTROL (remoteHelperFact without the start\'s fact): the same «none»');
  const oldReturns = M.load('src/hosts.js', anchored(HOSTS_SRC, "      if (f?.claude && (!helper || typeof f.claude.startHelper === 'string')) {", '      if (f?.claude) {', 'old-agent-answers'), 'old-agent-answers'); // stale-pins: kept — the control plants the device road as B-bc9f left it
  ok((await askDevice({ cwd: CWD, ownFile: FILE[1] }, { HM: oldReturns.HostManager, old: true })) === false, 'RED CONTROL (an old agent\'s home-only answer taken as the start\'s): the project\'s helper missed — it failed open');
  const noAsk = withLadder(anchored(SRC, 'await hosts.backendStatus(hostId, { helper: { cwd, ownFile } })', 'await hosts.backendStatus(hostId)', 'create-asks-no-files'), 'create-asks-no-files'); // stale-pins: kept — the control plants the create as B-bc9f left it
  const hs2 = hostsStub({ helper: false }); await makeCreate(noAsk, { hosts: hs2 }).create(R({ accountId: 'sub-a1', extraArgs: FILE }));
  ok(hs2.helpers.length === 1 && !hs2.helpers[0], 'RED CONTROL (the create asking without the start\'s files): its machine is never told the cwd or the person\'s file');
  clear(); put(JSON.stringify({ apiKeyHelper: '/usr/local/bin/key-helper' }));
}

console.log('— ⑥ RED CONTROLS');
{
  if (release) { const rel = lineOf(await drive(release, { accountId: 'sub-a1' })); ok(carriesNone(rel), `the release ${RELEASE}'s create: a picked subscription's line carries NO neutralizer — it billed the helper (the dormant rule this unit makes alive)`, rel.why || rel.settings); }
  else skip('the release create under a pick');
  const fl = lineOf(await drive(flagless, { accountId: 'sub-a1' }));
  ok(carriesNone(fl), 'this create with the flag cut (what the release did): a pick\'s line carries no neutralizer — the pick legs above can go red', fl.why || fl.settings);
  const MUT = [
    ['the flag not passed', [FLAG_LINE, ''], async (mod) => carriesNone(lineOf(await drive(mod, { accountId: 'sub-a1' })))],
    ['the rule answering yes for everything', ['const keyHelperOff = BILLPICK.setsHelperAside({ creds: harness && harness.creds, account: spawnAccount, linked: linkedAccountId });', 'const keyHelperOff = true;'],
      async (mod) => { const a = lineOf(await drive(mod, { accountId: 'subscription' })), b = lineOf(await drive(wsCreate, { accountId: 'subscription' })); return !sameLine(a, b) && neutralized(a); }],
    ['the notice without the helper check', ['              if (on === true && serverNotice && serverNotice(', '              if (serverNotice && serverNotice('],
      async (mod) => { helperOn(false); const n = (await drive(mod, { accountId: 'sub-a1' }, { wait: 5000 })).notices.filter((k) => k.key.startsWith('billing-pick-helper-')).length; helperOn(true); return n === 1; }],
    // the cure's own
    ['the file set aside at every pick (the unit before its cure)', ['            keyHelperNamed,\n', ''],
      async (mod) => { helperOn(false); const l = lineOf(await drive(mod, { accountId: 'sub-a1', extraArgs: FILE })); helperOn(true); return !fileKept(l); }],
    ['B-e7c0: the person\'s file set aside where it could be merged (the release road)', ['            ownSettings,   // B-e7c0: the person\'s file to merge (this machine only), else null\n', ''],
      async (mod) => { fs.writeFileSync(OWN, JSON.stringify(PERSON)); const x = await drive(mod, { accountId: 'sub-a1', extraArgs: ['--settings', OWN] }); const l = lineOf(x); return neutralized(l) && !(l.settings && l.settings.hooks) && saidKind(x, 'billing') === 1; }],
    ['B-e7c0: the merged settings on the command line (no file of its own)', ['            if (sessionSpec.ownFileMerged) spawnArgs = await ownSettingsOnDisk(spawnArgs, id, sessionSpec);\n', ''],
      async (mod) => { fs.writeFileSync(OWN, JSON.stringify(PERSON)); const x = await drive(mod, { accountId: 'sub-a1', extraArgs: ['--settings', OWN] }); return lineOf(x).line.join(' ').includes(OWN_MARK); }],
    ['the said-once memo dropped', ['            if (said && !helperSaidKeys.has(said.key)) try { helperFact().then((on) => {', '            if (said) try { helperFact().then((on) => {'],
      async (mod) => { const one = makeCreate(mod); await one.create({ accountId: 'sub-a1' }, { wait: 5000 }); const b = await one.create({ accountId: 'sub-a1' }, { wait: 5000 }); return b.reads.length > 0; }],
    ['«cannot be read» read as «names none» (the file applies whole where billing must win)', ['(data.keeperSid ? false : await helperFact())', '(data.keeperSid ? false : (await helperFact()) === true)'],
      async (mod) => { helperOn('garbled'); const l = lineOf(await drive(mod, { accountId: 'sub-a1', extraArgs: FILE })); helperOn(true); return fileKept(l); }],
    ['the notice reading the hub\'s env', ['            env: { ...agentEnv(), ...((spawnAccount && spawnAccount.localEnv) || {}) },', '            env: process.env,'],
      async (mod) => { helperOn(false); const CFG = path.join(HOME, 'cfg-dir'); const x = await drive(mod, { accountId: 'sub-a1' }, { wait: 5000, env: { CLAUDE_CONFIG_DIR: CFG } }); helperOn(true); return helperSaid(x).length === 0; }],
  ];
  for (const [name, [from, to], red] of MUT) {
    ok(SRC.split(from).length === 2, `setup: «${name}» edits ONE place`);
    const mod = M.load('src/ws-create.js', SRC.replace(from, to), name.replace(/\W+/g, '-').slice(0, 40));
    ok(await red(mod), `MUTANT ${name} ⇒ the leg it breaks goes RED`);
  }
  // the paired machine's mutants run through the same stood-in ladder
  const RMUT = [
    ['the adopted-process skip dropped', ['          if (keyHelperOff && !data.keeperSid && harness && harness.creds && harness.creds.keyHelper) {', '          if (keyHelperOff && harness && harness.creds && harness.creds.keyHelper) {'],
      async (mod) => { const ah = hostsStub({ helper: true }); const ad = await makeCreate(mod, { hosts: ah, accounts: accountsStub({ defaultId: 'sub-a1' }) }).create(R({ resume: true, resumeId: 'b3c4d5e6-0000-4000-8000-000000000001', _adoptHere: true }), { wait: 5000 }); return ah.asked.length === 1 || helperSaid(ad).length === 1; }],
    ['an adopted process recorded as setting the file aside', ['(data.keeperSid ? false : await helperFact())', '(data.keeperSid ? undefined : await helperFact())'],
      async (mod) => { const ah = hostsStub({ helper: true, owner: 'h-2', keeper: { sid: 'k-78', kind: 'agentd' } }); const x = await makeCreate(mod, { hosts: ah, accounts: accountsStub({ defaultId: 'sub-a1' }) }).create({ cwd: '/home/u/proj', resume: true, resumeId: 'b3c4d5e6-0000-4000-8000-000000000003', extraArgs: FILE }); return !!x.session && JSON.stringify(x.session._settingsFileGoverns) === '[]'; }],
    ['the bound dropped', ['    return Promise.race([readHelperFactOf(o).catch(() => null), late]).finally(() => clearTimeout(timer));', '    return readHelperFactOf(o).catch(() => null);'],
      async (mod) => { const p = makeCreate(mod, { hosts: hostsStub({ hang: true }), helperFactMs: 300 }).create(R({ accountId: 'sub-a1', extraArgs: FILE })); return !(await within(p, 2000)); }],
    ['the machine named by its id', ['            const said = BILLPICK.helperNotice({ name: session.name || data.name, accountId: acctId, host: hostName,', '            const said = BILLPICK.helperNotice({ name: session.name || data.name, accountId: acctId, host: null,'],
      async (mod) => { const x = await makeCreate(mod, { hosts: hostsStub({ helper: true }) }).create(R({ accountId: 'sub-a1' }), { wait: 5000 }); return helperSaid(x).length === 1 && helperSaid(x)[0].text.includes('on h-2'); }],
  ];
  for (const [name, [from, to], red] of RMUT) {
    ok(SRC.split(from).length === 2, `setup: «${name}» edits ONE place`);
    const mod = withLadder(SRC.replace(from, to), name.replace(/\W+/g, '-').slice(0, 40));
    ok(await red(mod), `MUTANT ${name} ⇒ the leg it breaks goes RED`);
  }
}
process.env.HOME = home0;
if (cfg0 !== undefined) process.env.CLAUDE_CONFIG_DIR = cfg0;
try { fs.rmSync(HOME, { recursive: true, force: true }); } catch { }
console.log(fail ? `\n${fail} FAILED (${pass} passed${skipped ? `, ${skipped} skipped` : ''})` : `\nALL PASS (${pass}${skipped ? `, ${skipped} skipped — the release's history is not in this clone` : ''})`);
process.exit(fail ? 1 : 0);
