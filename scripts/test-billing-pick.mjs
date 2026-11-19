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
function makeCreate(mod, { accounts = accountsStub(), pipe = false, hosts: hostsIn = null, env = {}, helperFactMs = undefined, hangOpen = false } = {}) {
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
    pty: { spawn: (cmd, args, opts) => { st.spawned.push({ cmd, args, env: opts.env }); return { pid: 4242, onData() { }, onExit() { }, write() { }, resize() { }, kill() { } }; } },
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
    const ONLY = '    const files = [file, ...BILLPICK.projectSettingsFilesOf(cwd, ownFile)];';
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
    const JOIN = '    return BILLPICK.combinedFact(await Promise.all(files.map((f) => readOneFactOnce(f, row))));';
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
    _onFact: () => { }, asked: [],
    get: (id) => (id === 'h-2' ? { id: 'h-2', name: 'build-box', host: 'build-box.lan', transport: 'ssh' } : null),
    deviceBounded: async () => {
      if (hang) return new Promise(() => { });   // a device that never answers
      if (!answer || sshOut !== null) throw new Error('device link lost');
      return { probeCli: async () => ({ facts: { claude: { installed: true, version: '2.1.322', loggedIn: true, loginMethod: 'oauth', ...(helper ? { keyHelper: true } : {}) }, codex: { installed: false, loggedIn: false } } }) };
    },
    _hostShell: async (h, script) => { if (String(script).includes('__VS_DIR_OK__')) return '__VS_DIR_OK__'; if (sshOut !== null) return sshOut; throw new Error('ssh: no route to host'); },
    homeDir: async () => '/home/u', conversationOwner: () => owner, findKeeperFor: async () => keeper, accountsStatus: async () => ({}), invalidateDiscovery: () => { },
  };
  me.backendStatus = async (id) => { me.asked.push(id); try { return await HostManager.prototype.backendStatus.call(me, id); } finally { me._onFact(); } };
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
  const byShell = async (HM, rung = HF.SSH_HELPER_RUNG) => {
    const out = execFileSync('sh', ['-c', `${rung}true`], { env: { HOME, PATH: '/usr/bin:/bin' }, encoding: 'utf8', timeout: 5000 });   // (the release's rung exits 2 where grep fails: its lines are read all the same)
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
  const PROBES_ST = "    return st.isFile() && st.size <= SETTINGS_READ_MAX ? { text: fs.readFileSync(file, 'utf-8') } : { text: null };";
  ok(PROBES_SRC.split(PROBES_ST).length === 2 && !PROBES_SRC.includes('fs.openSync('), 'the probe stats the file before it reads it (a FIFO is never opened — a blocking open would hold the agent; the FIFO leg above would never end)');
  put(JSON.stringify({ apiKeyHelper: '/usr/local/bin/key-helper' }));
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
