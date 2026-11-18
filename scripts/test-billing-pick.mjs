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
//      not passed, the rule answering yes for everything, the notice without the helper check — each goes RED.
// Run: node scripts/test-billing-pick.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { scratchDir, scratchHome } from './scratch.mjs';
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
  ok(read('src/machine-probes.js').includes("'settings.json'))?.apiKeyHelper"), 'the page\'s machine probe reads the SAME setting in the same file (the warning and the rule speak of one helper)');
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
async function drive(mod, data, { accounts = accountsStub(), pipe = false, wait = 0 } = {}) {
  const sent = [], spawned = [], pipes = [], notices = [], active = new Map(), noop = () => undefined;
  const hosts = pipe ? { device: async () => ({ openPipeSession: async (spec) => { pipes.push(spec); return { pid: 4343, write() { }, kill() { } }; } }) } : null;
  const ctx = new Proxy({
    activeSessions: active, WS_OPEN: 1, sessionCounterRef: { value: 0 }, adapterRegistry: registry(), hosts, accounts, os, fs, path,
    execFileSync: require('child_process').execFileSync, ensureDir: (d) => fs.mkdirSync(d, { recursive: true }),
    SOCKETS_DIR: SOCK, BUFFERS_DIR: BUF, PTY_WRAPPER: W('pty-wrapper.js'), CHAT_WRAPPER: W('chat-wrapper.js'),
    NODE_CMD: '/n/node', DTACH_CMD: '/stub/dtach', ENV_CMD: '/usr/bin/env', CLAUDE_CMD: EXE, EDITOR_CMD: '/stub/editor/code', AGENT_BIN_DIR: '/stub/bin', PORT: 1, X_ENV: {},
    cliCmds: { forSpawn: async (b, c) => c }, USAGE_STATUSLINE_CMD: '/stub/vibespace-usage', userStatuslineCmd: () => '',
    serverSetting: (k) => (pipe && k === 'agentd.localPipeSessions' ? true : undefined), harnessSetting: noop, harnessDeclares: () => false, harnessSpawnSettings: () => ({}),
    integrationEnabled: () => true, readSessionMeta: () => null, readLayouts: () => ({}), getSyncStore: () => null,
    serverNotice: (key, text, o) => { notices.push({ key, text, ...(o || {}) }); return 1; },
    pty: { spawn: (cmd, args, opts) => { spawned.push({ cmd, args, env: opts.env }); return { pid: 4242, onData() { }, onExit() { }, write() { }, resize() { }, kill() { } }; } },
    setupSessionPty: (s, id, p) => { s.pty = p; },
  }, { get: (t, k) => (k in t ? t[k] : (typeof k === 'string' && /^[a-z]/.test(k) ? noop : undefined)) });
  const handler = mod.createWsCreateHandler({
    ctx, agentEnv: () => ({ PATH: '/usr/bin:/bin', HOME: os.homedir() }), crashLoopRef: { map: new Map() }, noConvoRef: { map: new Map() },
    execFileAsync: async () => ({ stdout: '', stderr: '' }), pickCodexThreadCandidate: () => null,
    getSessionKey: (s) => `${s.backend}:${s.backendSessionId}`, normalizeComparablePath: (p) => p,
  });
  await handler({ readyState: 1, send: (t) => sent.push(JSON.parse(t)) }, { type: 'create', mode: 'chat', backend: 'claude', cwd: CWD, reqId: 'r1', ...data }, new Set());
  // the notice reads the machine's settings AFTER the spawn: a leg that asks for it waits up to `wait` ms (a fixed wait for a leg that wants none)
  for (const t0 = Date.now(); wait > 0 && Date.now() - t0 < wait && !notices.some((n) => n.key.startsWith('billing-pick-helper-'));) await new Promise((r) => setTimeout(r, 5));
  const [id, session] = [...active.entries()][0] || [];
  return { sent, spawned, pipes, notices, id, session, accounts };
}
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
const helperOn = (on) => { if (on === 'missing') fs.rmSync(SETTINGS, { force: true }); else fs.writeFileSync(SETTINGS, on === 'garbled' ? '{ "apiKeyHelper": ' : JSON.stringify(on ? { apiKeyHelper: '/usr/local/bin/key-helper' } : { theme: 'dark' })); };
const cfg0 = process.env.CLAUDE_CONFIG_DIR;
delete process.env.CLAUDE_CONFIG_DIR;   // the CLI's config dir is ~/.claude here unless a leg says otherwise
helperOn(true);
const runs = {};
for (const [what, id] of PICKS) {
  const x = await drive(wsCreate, { accountId: id }, { wait: 400 });
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
// a person's own --settings FILE (B-8dcf part two, alive from this unit): under a pick the file is set aside for that start and SAID;
// with no account the file governs — the line names it, as the release's create built it
{
  const FILE = ['--settings', '/home/u/my-settings.json'];
  const x = await drive(wsCreate, { accountId: 'sub-a1', extraArgs: FILE });
  const l = lineOf(x);
  ok(neutralized(l) && !l.line.includes('/home/u/my-settings.json') && x.notices.some((n) => n.key.startsWith('settings-file-billing-') && n.i18n && /set its billing to «CLI login»/.test(n.i18n.key)),
    'a pick + the person\'s settings file: the file is set aside for that start (the neutralizer rides the one inline flag) and that is SAID, with the CLI-login door', [l.settings, x.notices.map((n) => n.key)]);
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
  const again = (await drive(wsCreate, { accountId: 'sub-a1' }, { wait: 400 })).notices.filter((n) => n.key.startsWith('billing-pick-helper-'));
  ok(again.length === 1 && again[0].key === said[0].key, 'a second start of the same pick on the same machine asks under the SAME key — the hub\'s notice channel says a key once', again.map((n) => n.key));
  const pool = runs['pool-p1'].notices.filter((n) => n.key.startsWith('billing-pick-helper-'));
  ok(pool.length === 1 && pool[0].key === 'billing-pick-helper-pool-p1-local' && pool[0].i18n.params.account === 'Team pool', 'another pick has its own key (its own first time)', pool.map((n) => n.key));
  const bare = (await drive(wsCreate, { accountId: 'subscription' })).notices.filter((n) => n.key.startsWith('billing-pick-helper-'));
  ok(bare.length === 0, 'the bare case says nothing (nothing was set aside)', bare);
  for (const [what, state] of [['a settings file that names no helper', false], ['no settings file at all', 'missing'], ['a settings file that is not JSON', 'garbled']]) {
    helperOn(state);
    const none = await drive(wsCreate, { accountId: 'sub-a1' }, { wait: 150 });   // the window the notice above landed in, and more
    ok(neutralized(lineOf(none)) && none.notices.filter((n) => n.key.startsWith('billing-pick-helper-')).length === 0, `${what}: the line still carries the neutralizer (harmless), and nothing is said`, none.notices);
  }
  // the CLI's config dir (CLAUDE_CONFIG_DIR) is where its settings live: a helper named THERE is the one set aside, and said
  const CFG = path.join(HOME, 'cfg-dir');
  fs.mkdirSync(CFG, { recursive: true });
  fs.writeFileSync(path.join(CFG, 'settings.json'), JSON.stringify({ apiKeyHelper: '/opt/helper' }));
  helperOn(false);
  process.env.CLAUDE_CONFIG_DIR = CFG;
  const viaDir = (await drive(wsCreate, { accountId: 'sub-a1' }, { wait: 400 })).notices.filter((n) => n.key.startsWith('billing-pick-helper-'));
  delete process.env.CLAUDE_CONFIG_DIR;
  ok(viaDir.length === 1, 'a helper named in the CLI\'s config dir (CLAUDE_CONFIG_DIR) — ~/.claude naming none — is said', viaDir);
  helperOn(true);
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
    ['the notice without the helper check', ['              if (on && serverNotice && serverNotice(', '              if (serverNotice && serverNotice('],
      async (mod) => { helperOn(false); const n = (await drive(mod, { accountId: 'sub-a1' }, { wait: 400 })).notices.filter((k) => k.key.startsWith('billing-pick-helper-')).length; helperOn(true); return n === 1; }],
  ];
  for (const [name, [from, to], red] of MUT) {
    ok(SRC.split(from).length === 2, `setup: «${name}» edits ONE place`);
    const mod = M.load('src/ws-create.js', SRC.replace(from, to), name.replace(/\W+/g, '-').slice(0, 40));
    ok(await red(mod), `MUTANT ${name} ⇒ the leg it breaks goes RED`);
  }
}
process.env.HOME = home0;
if (cfg0 !== undefined) process.env.CLAUDE_CONFIG_DIR = cfg0;
try { fs.rmSync(HOME, { recursive: true, force: true }); } catch { }
console.log(fail ? `\n${fail} FAILED (${pass} passed${skipped ? `, ${skipped} skipped` : ''})` : `\nALL PASS (${pass}${skipped ? `, ${skipped} skipped — the release's history is not in this clone` : ''})`);
process.exit(fail ? 1 : 0);
