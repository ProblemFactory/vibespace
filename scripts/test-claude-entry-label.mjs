#!/usr/bin/env node
// THE ENTRY LABEL OF A CHAT CONVERSATION (主开发 r4483, the owner's word, 2026-11-25) — src/claude-entry-label.js (PURE), the claude
// table's row `entryLabel` (src/harness-settings.js + src/harness-settings-words.js), the Claude adapter's chat env, the Settings
// line (src/lib/entry-label-words.js) and the measurement's PURE verdict (src/entry-measure.js).
//   ① THE RULE: the vendor's naming rule over every class (the characters, the length, the first letter, cli, sdk…, the vendor's
//      own names, remote…, local_projects) and the stored value read (off, nothing, ours, a typed name, a refused one).
//   ② THE ADAPTER: buildSessionArgs in chat and terminal over every value — the name rides a CHAT start's env only; the args and
//      every other env name are the setting-off start's, byte for byte.
//   ③ THE ROADS (each a row of ROADS — the census leg names every road ws-create has): the REAL ws-create (the production adapter
//      registry, a stub pty, nothing executes) on this machine's dtach road and the device agent's pipe road — the env the spawn
//      gets; the ssh and dial ladders' remote lines (every `parts: [` composition quotes the spawn pairs); the drift guards (ONE
//      buildSessionArgs call; the pairs are its env, built before every road).
//   ③b 主开发 r4493: every other harness's adapter and the REAL create for every other backend, chat and terminal, with the name
//      in every bag they are handed, hand nothing on; terminal Claude neither; the boot restore's remote re-adopt starts no CLI.
//   ④ THE ROW: declared (a combobox, default off, options off and vibespace — no cli —, spawn mode chat, its fact tag), checkTable
//      and the words census clean, the spawn conformance probe, the derived Settings row, the hub's typed read.
//   ⑤ THE WORDS: the fact line for each kind of value; each refusal code its own words; zh and ja for every word.
//   ⑥ THE VERDICT (src/entry-measure.js) over made-up summaries: PASS, each judged fact failing, a difference recorded, INCOMPLETE.
//   ⑦ RED CONTROLS (scripts/mutant-copy.mjs, anchored edits): the adapter's mode guard dropped; a refused name passed as typed;
//      the release's adapter (no entry label); the ten lines' push in the create WITHOUT its backend guard (r4493).
// Run: node scripts/test-claude-entry-label.mjs
import './scratch.mjs';   // FIRST (§113 THE ROW): the create below reads a home — the re-home comes before any of this suite's code
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { scratchDir, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(import.meta.url);
const RELEASE = 'eb7608d54';   // 2.369.419: the release this unit was built on (its adapter passes no entry label)
let pass = 0, fail = 0, skipped = 0;
const ok = (c, msg, detail) => {
  if (typeof msg !== 'string' || msg.length === 0) throw new TypeError(`ok(cond, name): the name is a ${typeof msg} — the arguments are swapped`);
  if (c === true) { pass++; console.log(`  ✓ ${msg}`); } else { fail++; console.log(`  ✗ ${msg}${detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 600) : ''}`); }
};
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const EL = require(path.join(REPO, 'src/claude-entry-label.js'));
const { ENTRY_VAR } = EL;

console.log('— ① THE RULE: the vendor\'s naming rule, the stored value read');
{
  const RULE = [
    ['vibespace', true], ['my-team', true], ['a', true], ['a_b-c9', true], ['x'.repeat(32), true], ['team-remote', true], ['clix', true], ['mcpx', true],
    ['', 'entry_name_empty'], ['x'.repeat(33), 'entry_name_shape'], ['My-Team', 'entry_name_shape'], ['9team', 'entry_name_shape'], ['-team', 'entry_name_shape'],
    ['_team', 'entry_name_shape'], ['team space', 'entry_name_shape'], ['team\n--flag', 'entry_name_shape'], ['tëam', 'entry_name_shape'], ['team.x', 'entry_name_shape'],
    ['cli', 'entry_name_cli'], ['sdk', 'entry_name_sdk'], ['sdk-cli', 'entry_name_sdk'], ['sdkmine', 'entry_name_sdk'],
    ['remote', 'entry_name_remote'], ['remote-box', 'entry_name_remote'], ['local_projects', 'entry_name_reserved'],
  ];
  const bad = RULE.filter(([n, want]) => { const v = EL.nameVerdict(n); return want === true ? !(v.ok && v.name === n) : !(v.ok === false && v.code === want); });
  ok(bad.length === 0, `nameVerdict over ${RULE.length} names: 1 to 32 of a–z 0–9 _ -, a letter first; cli, sdk…, remote…, local_projects refused, each by its code`, bad.map(([n, w]) => `${JSON.stringify(n)} want ${w} got ${JSON.stringify(EL.nameVerdict(n))}`));
  const BRIEF = ['cli', 'mcp', 'sdk-cli', 'sdk-ts', 'sdk-py', 'bench', 'claude-vscode', 'claude-code-github-action', 'local-agent', 'local_agent', 'claude-desktop', 'claude-desktop-3p', 'claude-in-teams', 'claude_in_slack', 'claude-in-slack', 'ssh-remote', 'claude-coworker', 'claude-coworker-terminal', 'claude-security'];
  ok(JSON.stringify(EL.VENDOR_NAMES) === JSON.stringify(BRIEF) && Object.isFrozen(EL.VENDOR_NAMES), `the vendor's own names are the brief's ${BRIEF.length}, frozen`);
  ok(EL.VENDOR_NAMES.every((n) => EL.nameVerdict(n).ok === false), 'every vendor name is refused (by its first matching rule: cli, sdk, the list)', EL.VENDOR_NAMES.filter((n) => EL.nameVerdict(n).ok));
  ok(EL.VENDOR_NAMES.filter((n) => n !== 'cli' && !n.startsWith('sdk')).every((n) => EL.nameVerdict(n).code === 'entry_name_vendor'), 'a vendor name that is neither cli nor sdk… is refused AS the vendor\'s (entry_name_vendor)');
  const codes = new Set(RULE.filter(([, w]) => w !== true).map(([, w]) => w).concat('entry_name_vendor'));
  ok(JSON.stringify([...codes].sort()) === JSON.stringify([...EL.REFUSALS].sort()), 'REFUSALS names exactly the codes nameVerdict answers (each reached by a name above)', [...codes]);
  ok(JSON.stringify(EL.CHOICES) === '["off","vibespace"]' && !EL.CHOICES.includes('cli') && EL.OFF === 'off' && EL.OURS === 'vibespace' && ENTRY_VAR === 'CLAUDE_CODE_ENTRYPOINT', 'the listed choices are off and vibespace — NO cli; the variable is CLAUDE_CODE_ENTRYPOINT');
  const L = (v) => JSON.stringify(EL.entryLabelOf(v));
  ok(L(undefined) === '{"on":false}' && L(null) === '{"on":false}' && L('') === '{"on":false}' && L('off') === '{"on":false}', 'nothing stored, an empty typed field and off: the CLI\'s own label (nothing passed)');
  ok(L('vibespace') === '{"on":true,"name":"vibespace","typed":false}' && L('my-team') === '{"on":true,"name":"my-team","typed":true}', 'ours, and a typed name the rule takes');
  ok(L('cli') === '{"on":false,"refused":"entry_name_cli","typed":true}' && L('claude-desktop') === '{"on":false,"refused":"entry_name_vendor","typed":true}', 'a typed name the rule refuses: off, with its code — never a half-applied name');
  ok(EL.entryNameFor({ mode: 'chat', value: 'vibespace' }) === 'vibespace' && EL.entryNameFor({ mode: 'terminal', value: 'vibespace' }) === null && EL.entryNameFor({ mode: 'chat', value: 'cli' }) === null && EL.entryNameFor({ mode: 'chat' }) === null && EL.entryNameFor() === null,
    'entryNameFor: a chat start with a name the rule takes, never a terminal start, never a refused name, nothing by default');
}

console.log('— ② THE ADAPTER: the name rides a CHAT start\'s env only');
const { ClaudeCodeAdapter } = require(path.join(REPO, 'src/adapters/claude-code.js'));
const mk = (A) => new A({ claudeCmd: '/opt/bin/claude', chatWrapper: '/w/chat', ptyWrapper: '/w/pty', buffersDir: '/b' });
const specOf = (A, mode, value) => mk(A).buildSessionArgs({ cwd: '/home/u/proj', mode, permissionMode: 'default', settings: value === undefined ? {} : { entryLabel: value } });
const VALUES = [[undefined, null], ['off', null], ['', null], ['vibespace', 'vibespace'], ['my-team', 'my-team'], ['x'.repeat(32), 'x'.repeat(32)], ['x'.repeat(33), null], ['cli', null], ['sdk-mine', null], ['claude-desktop', null], ['remote-box', null], ['local_projects', null], ['My-Team', null], ['team\n--flag', null]];
const chatCarries = (A) => VALUES.every(([v, want]) => { const e = specOf(A, 'chat', v).env; return want === null ? !Object.prototype.hasOwnProperty.call(e, ENTRY_VAR) : e[ENTRY_VAR] === want; });
const terminalNever = (A) => VALUES.every(([v]) => !Object.prototype.hasOwnProperty.call(specOf(A, 'terminal', v).env, ENTRY_VAR));
{
  ok(chatCarries(ClaudeCodeAdapter), `chat: each of ${VALUES.length} stored values ⇒ the env carries the name the rule takes, and nothing for off / nothing / a refused name`, VALUES.map(([v]) => [v, specOf(ClaudeCodeAdapter, 'chat', v).env[ENTRY_VAR] ?? null]));
  ok(terminalNever(ClaudeCodeAdapter), 'terminal: NO stored value puts the name in the env — a terminal start keeps the CLI\'s own label (cli)');
  const strip = (s) => { const e = { ...s.env }; delete e[ENTRY_VAR]; return JSON.stringify({ args: s.args, env: e, wrapper: s.wrapper, mode: s.mode }); };
  const same = ['chat', 'terminal'].every((m) => VALUES.every(([v]) => strip(specOf(ClaudeCodeAdapter, m, v)) === strip(specOf(ClaudeCodeAdapter, m, 'off'))));
  ok(same, 'in both modes the args, the wrapper and every other env name are the setting-off start\'s, byte for byte (the setting changes ONE env name)');
  ok(!specOf(ClaudeCodeAdapter, 'chat', 'vibespace').args.some((a) => String(a).includes(ENTRY_VAR)), 'the name never rides argv (env only)');
}

console.log('— ③ THE ROADS: the real create on this machine\'s dtach road and the device agent\'s pipe road; the remote ladders\' lines');
const W = (f) => '/w/' + f;
const EXE = '/opt/bin/claude';
const { createAdapterRegistry } = require(path.join(REPO, 'src/adapters/index.js'));
const registry = () => createAdapterRegistry({
  claudeCmd: EXE, codexCmd: '/opt/bin/codex', chatWrapper: W('chat-wrapper.js'), codexChatWrapper: W('codex-chat-wrapper.js'),
  acpWrapper: W('acp-wrapper.js'), acpCommands: { opencode: '/opt/bin/opencode', antigravity: '/opt/bin/agy' }, ptyWrapper: W('pty-wrapper.js'), buffersDir: '/b',
});
const accountsStub = () => ({ _state: { accounts: [], defaultAccountId: null }, resolveForSpawn: () => null, get: () => null, poolMembership: () => [], poolCurrent: () => null });
const SOCK = scratchDir('entry-sock'), BUF = scratchDir('entry-buf'), CWD = scratchDir('entry-cwd');
const wsCreate = require(path.join(REPO, 'src/ws-create.js'));
/** one create through the REAL handler: `bag` = the claude spawn settings the hub's typed read hands it (harnessSpawnSettings) */
async function createWith({ mode, bag, pipe = false, backend = 'claude', mod = wsCreate }) {
  const active = new Map(), noop = () => undefined, pipes = [], spawned = [], sent = [];
  const hosts = pipe ? { device: async () => ({ openPipeSession: async (spec) => { pipes.push(spec); return { pid: 4343, write() { }, kill() { } }; } }) } : null;
  const ctx = new Proxy({
    activeSessions: active, WS_OPEN: 1, sessionCounterRef: { value: 0 }, adapterRegistry: registry(), hosts, accounts: accountsStub(), os, fs, path,
    execFileSync: require('child_process').execFileSync, ensureDir: (d) => fs.mkdirSync(d, { recursive: true }),
    SOCKETS_DIR: SOCK, BUFFERS_DIR: BUF, PTY_WRAPPER: W('pty-wrapper.js'), CHAT_WRAPPER: W('chat-wrapper.js'),
    NODE_CMD: '/n/node', DTACH_CMD: '/stub/dtach', ENV_CMD: '/usr/bin/env', CLAUDE_CMD: EXE, EDITOR_CMD: '/stub/editor/code', AGENT_BIN_DIR: '/stub/bin', PORT: 1, X_ENV: {},
    cliCmds: { forSpawn: async (b, c) => c }, USAGE_STATUSLINE_CMD: '/stub/vibespace-usage', userStatuslineCmd: () => '',
    serverSetting: (k) => (pipe && k === 'agentd.localPipeSessions' ? true : undefined), harnessSetting: noop, harnessDeclares: () => false, harnessSpawnSettings: () => ({ ...bag }),   // EVERY harness handed this bag (the worst case for the other backends' legs)
    integrationEnabled: () => true, readSessionMeta: () => null, readLayouts: () => ({}), getSyncStore: () => null, serverNotice: () => 1,
    pty: { spawn: (cmd, args, opts) => { spawned.push({ cmd, args, env: opts.env }); return { pid: 4242, onData() { }, onExit() { }, write() { }, resize() { }, kill() { } }; } },
    setupSessionPty: (s, id, p) => { s.pty = p; },
  }, { get: (t, k) => (k in t ? t[k] : (typeof k === 'string' && /^[a-z]/.test(k) ? noop : undefined)) });
  const handler = mod.createWsCreateHandler({
    ctx, agentEnv: () => ({ PATH: '/usr/bin:/bin', HOME: os.homedir() }), crashLoopRef: { map: new Map() }, noConvoRef: { map: new Map() },
    execFileAsync: async () => ({ stdout: '', stderr: '' }), pickCodexThreadCandidate: () => null,
    getSessionKey: (s) => `${s.backend}:${s.backendSessionId}`, normalizeComparablePath: (p) => p,
  });
  await handler({ readyState: 1, send: (t) => sent.push(JSON.parse(t)) }, { type: 'create', mode, backend, cwd: CWD, reqId: 'r1' }, new Set());
  return { spawned, pipes, sent, errors: sent.filter((m) => m.type === 'error').map((m) => m.message || m.code) };
}
/** the name a spawn hands the CLI: the env's, else an argv NAME=value word (the old `env` prefix) — null when it carries none */
const nameOn = (sp) => { if (!sp) return undefined; if (sp.env && Object.prototype.hasOwnProperty.call(sp.env, ENTRY_VAR)) return sp.env[ENTRY_VAR]; const w = (sp.args || []).find((a) => String(a).startsWith(ENTRY_VAR + '=')); return w ? w.slice(ENTRY_VAR.length + 1) : null; };
// THE ROADS ws-create has — a row each (the census leg below names every road the create's code opens)
const ROADS = [
  ['this machine\'s dtach road', { pipe: false }, (x) => x.spawned.find((s) => s.cmd === '/stub/dtach'), 'spawnFor(null)[sessionMode]('],
  ['the device agent\'s pipe road (agentd.localPipeSessions)', { pipe: true }, (x) => x.pipes[0], 'dm.openPipeSession('],
  ['a host\'s ladder, chat (ssh or dial: the remote lines below)', null, null, 'spawnFor(h).chat('],
  ['a host\'s ladder, terminal (ssh or dial)', null, null, 'spawnFor(h).terminal('],
];
{
  for (const [what, opt, pick] of ROADS.filter((r) => r[1])) {
    const on = await createWith({ mode: 'chat', bag: { entryLabel: 'vibespace' }, ...opt });
    const off = await createWith({ mode: 'chat', bag: {}, ...opt });
    const typed = await createWith({ mode: 'chat', bag: { entryLabel: 'my-team' }, ...opt });
    const refused = await createWith({ mode: 'chat', bag: { entryLabel: 'cli' }, ...opt });
    ok(nameOn(pick(on)) === 'vibespace' && nameOn(pick(typed)) === 'my-team', `${what}: a chat start with the setting on hands the CLI the name (vibespace; a typed my-team)`, { on: nameOn(pick(on)), typed: nameOn(pick(typed)), errors: on.errors });
    ok(nameOn(pick(off)) === null && nameOn(pick(refused)) === null, `${what}: off and a refused typed name (cli) hand it nothing — the CLI's own label`, { off: nameOn(pick(off)), refused: nameOn(pick(refused)), errors: off.errors });
  }
  const term = await createWith({ mode: 'terminal', bag: { entryLabel: 'vibespace' } });
  ok(nameOn(term.spawned.find((s) => s.cmd === '/stub/dtach')) === null, 'this machine\'s dtach road: a TERMINAL start with the setting on hands the CLI nothing', term.errors);
  // the remote ladders: every remote line they compose quotes the spawn pairs (the adapter's env among them) — ssh and dial alike
  const comp = ['src/spawn/ssh.js', 'src/spawn/dial.js'].map((f) => { const lines = read(f).split('\n').filter((l) => l.includes('parts: [')); return [f, lines.length, lines.filter((l) => l.includes('...spawnEnvPairs.map(shq)')).length]; });
  ok(comp.every(([, n, w]) => n > 0 && n === w), 'the ssh and dial ladders: EVERY remote line they compose (each `parts: [`) quotes the spawn pairs — the name reaches the host\'s CLI with the rest of the env', comp);
  const { buildRemoteExec, buildRemoteShellPrelude } = require(path.join(REPO, 'src/remote-shell.js'));
  const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
  const pairs = (v) => Object.entries(specOf(ClaudeCodeAdapter, 'chat', v).env).map(([k, x]) => `${k}=${x}`);
  const line = (v) => buildRemoteExec({ cwd: '/home/u/proj', shq, pre: buildRemoteShellPrelude({ toolsOnPath: true }), parts: [...pairs(v).map(shq), 'claude'] });
  ok(line('vibespace').includes(`'${ENTRY_VAR}=vibespace'`) && !line('off').includes(ENTRY_VAR), 'the remote builder over the adapter\'s pairs: the name quoted like every pair; off carries none');
  // THE CENSUS of roads + the drift guards (the create's own code)
  const code = read('src/ws-create.js').replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  // every ladder call (spawnFor(<host>).<mode>( / spawnFor(<host>)[<mode>]() and every pipe session the create opens, read off its code
  const opened = [...new Set([...code.matchAll(/spawnFor\([^)]*\)(?:\.\w+|\[\w+\])\(/g), ...code.matchAll(/\b\w+\.openPipeSession\(/g)].map((m) => m[0]))];
  ok(opened.length >= 4 && JSON.stringify([...opened].sort()) === JSON.stringify(ROADS.map((r) => r[3]).sort()), `the census: every road the create's code opens is a row of ROADS (${opened.length}: ${opened.join(' ')})`, opened);
  const iBuild = code.indexOf('const sessionSpec = adapter.buildSessionArgs({'), iPairs = code.indexOf('let spawnEnvPairs = Object.entries(sessionSpec.env || {})');
  const roadsAt = ROADS.map((r) => code.indexOf(r[3]));
  ok((code.match(/\.buildSessionArgs\(/g) || []).length === 1 && iBuild > 0 && iPairs > iBuild && roadsAt.every((i) => i > iPairs), 'drift guard: ONE buildSessionArgs call; the spawn pairs are its env, built after it and before every road', { iBuild, iPairs, roadsAt });
}

console.log('— ③b 主开发 r4493: TERMINAL mode and every non-Claude backend never carry the name');
const H = require(path.join(REPO, 'src/harnesses/index.js'));
const OTHERS = H.ids().filter((id) => id !== 'claude');
const spawnOf = (x) => x.spawned.find((sp) => sp.cmd === '/stub/dtach') || x.spawned[0] || x.pipes[0] || null;
/** every other backend through the REAL create, chat and terminal, the name in every bag it is handed → [[id, mode, {spawned, name}]] */
async function othersThrough(mod, bag) {
  const rows = [];
  for (const id of OTHERS) for (const mode of ['chat', 'terminal']) {
    let x = null; try { x = await createWith({ mode, backend: id, bag, mod }); } catch (e) { rows.push([id, mode, { spawned: false, why: String(e && e.message).slice(0, 80) }]); continue; }
    const sp = spawnOf(x);
    rows.push([id, mode, sp ? { spawned: true, name: nameOn(sp) } : { spawned: false, why: x.errors.join(' | ').slice(0, 80) || 'no spawn, no error' }]);
  }
  return rows;
}
{
  const reg = registry();
  const adapterRow = (id, mode) => { try { const sp = reg.get(id).buildSessionArgs({ cwd: '/home/u/proj', mode, permissionMode: 'default', settings: { entryLabel: 'vibespace' } }); return { ran: true, name: (sp.env || {})[ENTRY_VAR] ?? null, argv: (sp.args || []).some((a) => String(a).includes(ENTRY_VAR)) }; } catch (e) { return { ran: false, why: String(e && e.message).slice(0, 80) }; } };
  const rows = OTHERS.flatMap((id) => ['chat', 'terminal'].map((mode) => [id, mode, adapterRow(id, mode)]));
  const ran = rows.filter(([, , r]) => r.ran);
  ok(OTHERS.length >= 4 && ran.length >= OTHERS.length && rows.every(([, , r]) => !r.ran || (r.name === null && r.argv === false)),
    `every other harness's adapter (${OTHERS.join(', ')}), chat and terminal, handed the setting WITH the name: none carries it (${ran.length} of ${rows.length} spawns built)`, rows);
  const created = await othersThrough(wsCreate, { entryLabel: 'vibespace' });
  const judged = created.filter(([, , r]) => r.spawned);
  ok(judged.length >= 2 && created.every(([, , r]) => !r.spawned || r.name === null),
    `the REAL create for every other backend, chat and terminal, the name in every bag: no spawn hands it on (${judged.length} of ${created.length} spawned here — the rest answered as their stub allows)`, created);
  const term = await createWith({ mode: 'terminal', bag: { entryLabel: 'my-team' } });
  ok(nameOn(spawnOf(term)) === null && ['vibespace', 'my-team', 'cli'].every((v) => !Object.prototype.hasOwnProperty.call(specOf(ClaudeCodeAdapter, 'terminal', v).env, ENTRY_VAR)),
    'TERMINAL Claude: the real create and the adapter carry no name for any value (the red control for a dropped mode guard is ⑦)');
  // 主开发 r4493: THE REMOTE RE-ADOPT (src/server/boot-restore.js) starts NO CLI — its ssh line runs the keeper with no program after
  // it (the create's keeper tail adds `-- <the CLI's line>`, src/remote-shell.js keeperRunTail): it re-attaches to the keeper of the
  // FIRST start, whose CLI keeps the env that start gave it — the name exactly when the first start carried it, nothing new
  const runs = [read('src/server/boot-restore.js'), read('src/remote-shell.js')].map((t) => t.split('\n').filter((l) => l.includes('vibespace-remote-keeper" run')));
  ok(runs[0].length === 1 && /run \$\{meta\.keeperSid\} __VS_OFFSET__`;\s*$/.test(runs[0][0]) && !runs[0][0].includes(' -- ') && runs[1].length === 1 && /\(cmd \? ' -- ' \+ cmd\.join\(' '\) : ''\)/.test(runs[1][0]),
    'the boot restore\'s remote chat re-adopt names NO program after the keeper\'s run (the create\'s tail does): it re-attaches to the first start\'s CLI, which carries the name exactly when that start did', runs);
}

console.log('— ④ THE ROW: declared, checked, derived, read');
const HS = require(path.join(REPO, 'src/harness-settings.js'));
const HSW = require(path.join(REPO, 'src/harness-settings-words.js'));
{
  const row = HS.rowOf(HS.HARNESS_SETTINGS.claude, 'entryLabel');
  ok(!!row && row.type === 'enum' && row.combobox === true && row.default === 'off' && JSON.stringify(row.options.map((o) => o.value)) === '["off","vibespace"]' && row.fact === 'entry-label'
    && JSON.stringify(row.apply) === '{"kind":"spawn","mode":"chat"}', 'the row: an enum combobox, default off, options off and vibespace (NO cli), spawn in chat mode only, its fact tag', row);
  ok(!HS.HARNESS_SETTINGS.claude.rows.some((r) => r.key !== 'entryLabel' && /entry/i.test(r.key)) && JSON.stringify(row.options.map((o) => o.value)) === JSON.stringify(EL.CHOICES), 'ONE row (no second entry row); its options are the rule\'s CHOICES');
  ok(HS.checkTable(HSW.withWords(HS.HARNESS_SETTINGS.claude)).length === 0 && HS.checkTable(HS.HARNESS_SETTINGS.claude, { wordsApart: true }).length === 0, 'checkTable passes the claude table, joined to its words and bare');
  const census = HSW.wordsCensus(HS.HARNESS_SETTINGS).filter((x) => /entryLabel/.test(x));
  ok(census.length === 0, 'the words census names nothing of the row (label, description, details, placeholder, both option labels, the apply note — none left in the device\'s table)', census);
  const probe = (s) => JSON.stringify({ a: s.args, e: s.env || {} });
  ok(probe(specOf(ClaudeCodeAdapter, 'chat', 'vibespace')) !== probe(specOf(ClaudeCodeAdapter, 'chat', undefined)) && probe(specOf(ClaudeCodeAdapter, 'terminal', 'vibespace')) === probe(specOf(ClaudeCodeAdapter, 'terminal', undefined)),
    'spawn conformance (test-harness-contract\'s probe, its first non-default option): the chat spawn CHANGES, the terminal spawn does not (apply.mode chat is true)');
  const SCH = await import(path.join(REPO, 'src/lib/settings-schema.js'));
  const d = SCH.SETTINGS_SCHEMA['claude.entryLabel'];
  ok(!!d && d.type === 'enum' && d.combobox === true && d.default === 'off' && d.harness === 'claude' && d.apply.kind === 'spawn' && d.apply.mode === 'chat' && d.apply.how === 'CLAUDE_CODE_ENTRYPOINT' && d.fact === 'entry-label'
    && typeof d.placeholder === 'string' && d.placeholder.length > 0 && Array.isArray(d.details) && d.details.length === 2 && /next time it starts|next start/.test(d.description) && d.liveApply === true,
    'the derived Settings row carries the words, the two details, the typed field\'s placeholder, the fact tag and the apply road', d && { fact: d.fact, placeholder: d.placeholder, details: d.details && d.details.length });
  const harnesses = require(path.join(REPO, 'src/harnesses/index.js'));
  const { create: createSync } = require(path.join(REPO, 'src/server/harness-config-sync.js'));
  const store = {};
  const sync = createSync({ serverSetting: (k) => store[k], harnesses, adapterRegistry: { get: () => null }, activeSessions: new Map(), hookRegistrationSafe: () => false, log: () => { }, warn: () => { } });
  const bag0 = sync.harnessSpawnSettings('claude');
  store['claude.entryLabel'] = 'my-team'; const bag1 = sync.harnessSpawnSettings('claude');
  store['claude.entryLabel'] = 'cli'; const bag2 = sync.harnessSpawnSettings('claude');
  ok(bag0.entryLabel === 'off' && bag1.entryLabel === 'my-team' && bag2.entryLabel === 'cli', 'the hub\'s typed read: nothing stored ⇒ off; a typed name is kept as typed (a combobox) — the adapter judges it', [bag0.entryLabel, bag1.entryLabel, bag2.entryLabel]);
  ok(mk(ClaudeCodeAdapter).buildSessionArgs({ cwd: '/x', mode: 'chat', settings: bag2 }).env[ENTRY_VAR] === undefined && mk(ClaudeCodeAdapter).buildSessionArgs({ cwd: '/x', mode: 'chat', settings: bag1 }).env[ENTRY_VAR] === 'my-team',
    '…the bag through the adapter: the typed my-team rides, the typed cli does not');
  delete store['claude.entryLabel'];
}

console.log('— ⑤ THE WORDS: the fact line, the refusals, zh and ja');
{
  const WD = await import(path.join(REPO, 'src/lib/entry-label-words.js'));
  const off = WD.entryFactText('off'), none = WD.entryFactText(undefined), ours = WD.entryFactText('vibespace'), typed = WD.entryFactText('my-team'), cli = WD.entryFactText('cli'), long = WD.entryFactText('Q'.repeat(80));
  ok(off === none && /CLI's own label/.test(off) && !/«/.test(off), 'off and nothing stored: the CLI\'s own label', off);
  ok(ours === 'Chat conversations report «vibespace» from their next start.' && /«my-team»/.test(typed), 'on: the name the next chat start reports, and when it takes effect', [ours, typed]);
  ok(/^«cli» is not used \(the CLI rewrites cli on a chat start\): nothing is passed/.test(cli) && long.includes('…') && long.length < 200, 'a refused typed name: not used, why, nothing passed — a long one clipped', [cli, long.length]);
  const why = EL.REFUSALS.map((c) => WD.entryRefusalWords(c));
  ok(new Set(why).size === EL.REFUSALS.length && why.every((w) => typeof w === 'string' && w.length > 0) && JSON.stringify(WD.ENTRY_REFUSAL_CODES) === JSON.stringify(EL.REFUSALS), `each of the ${EL.REFUSALS.length} refusal codes has its own words (never a code shown)`, why);
  const lit = (src) => [...src.matchAll(/\bt\(\s*(['"])((?:\\.|(?!\1).)*)\1/g)].map((m) => m[2].replace(/\\(['"\\])/g, '$1'));
  const rowWords = HSW.HARNESS_SETTINGS_WORDS.claude.rows.entryLabel;
  const keys = [...new Set([...lit(read('src/lib/entry-label-words.js')), rowWords.label, rowWords.description, ...rowWords.details, rowWords.placeholder, rowWords.options.off])];
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  const missing = keys.filter((k) => !zh.includes('  ' + JSON.stringify(k) + ': ') || !ja.includes('  ' + JSON.stringify(k) + ': '));
  ok(keys.length >= 16 && missing.length === 0, `zh and ja hold every one of the ${keys.length} words (the row's and the fact line's)`, missing);
  const ph = (k) => (k.match(/\{\w+\}/g) || []).sort().join();
  const lost = keys.filter((k) => { const z = new RegExp('  ' + JSON.stringify(k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ': ("(?:\\\\.|[^"\\\\])*")').exec(zh), j = new RegExp('  ' + JSON.stringify(k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ': ("(?:\\\\.|[^"\\\\])*")').exec(ja); return !z || !j || ph(JSON.parse(z[1])) !== ph(k) || ph(JSON.parse(j[1])) !== ph(k); });
  ok(lost.length === 0, 'every translation keeps its {name} / {why} placeholders', lost);
  const face = rowWords.description;
  ok(/Off \(the default\)/.test(face) && /has not said how it treats/.test(face) && /choice, and any risk in it, are yours/.test(face) && /nothing is promised about cost or limits/.test(face) && /next start/.test(face),
    'the face says: what it changes, off by default, the vendor has not said how it treats other names, the choice and its risk are the person\'s, no promise of saving, a running conversation at its next start');
  ok(/Terminal conversations always keep the CLI's own label/.test(rowWords.details[0]) && /Refused: cli/.test(rowWords.details[1]), 'the details: terminal keeps the CLI\'s label; the naming rule with cli refused');
}

console.log('— ⑥ THE VERDICT (src/entry-measure.js) over made-up summaries');
{
  const EM = require(path.join(REPO, 'src/entry-measure.js'));
  const head = (label, ua, extra = {}) => ({ path: '/v1/messages?beta=true', headers: { 'anthropic-version': '2023-06-01', 'user-agent': ua, ...extra }, body: { keys: ['messages', 'model', 'system'], stream: true, toolNames: ['Edit', 'Read'], system: 2, systemHead: `x-anthropic-billing-header: cc_version=1.fak; cc_entrypoint=${label}; cch=<masked>;` } });
  const EV = ['system/init {subtype,type}', 'result/success {is_error,result,subtype,type}'];
  const run = (label, { ua = `claude-cli/1 (external, ${label})`, events = EV, extra = {}, turnOk = true } = {}) => ({ heads: [head(label, ua, extra), head(label, ua, extra)], countHeads: [], calls: ['/v1/messages stream claude-fake O bearer 200'], files: 0, edited: true, turnOk, events });
  const v = EM.entryVerdict(run('sdk-cli'), run('vibespace'), 'vibespace');
  ok(v.verdict === 'PASS' && v.findings.length === 0 && v.elsewhere.length === 0 && JSON.stringify(v.marks.on.labels) === '["vibespace"]' && JSON.stringify(v.marks.off.labels) === '["sdk-cli"]' && v.marks.on.uas[0] === 'claude-cli/1 (external, vibespace)',
    'PASS: the billing line names it with the name, the CLI\'s own label without; the events keep their shape; the user agents recorded (the label masked for the comparison)', v);
  const not = EM.entryVerdict(run('sdk-cli'), run('sdk-cli'), 'vibespace');
  ok(not.verdict === 'FAIL' && /^with the name, the billing line said \["sdk-cli"\]/.test(not.findings[0]), 'FAIL: the name never reached the billing line', not.findings);
  const already = EM.entryVerdict(run('vibespace'), run('vibespace'), 'vibespace');
  ok(already.verdict === 'FAIL' && already.findings.some((f) => /without the name, the billing line already said «vibespace»/.test(f)), 'FAIL: the run without the name already said it', already.findings);
  const shape = EM.entryVerdict(run('sdk-cli'), run('vibespace', { events: ['system/init {entry,subtype,type}', EV[1]] }), 'vibespace');
  ok(shape.verdict === 'FAIL' && shape.findings.some((f) => /^the first stream events differ in shape: #1 system\/init \{subtype,type\} \| system\/init \{entry,subtype,type\}/.test(f)), 'FAIL: the first stream events\' shape differs, the event named', shape.findings);
  const extra = EM.entryVerdict(run('sdk-cli'), run('vibespace', { extra: { 'x-more': '1' } }), 'vibespace');
  ok(extra.verdict === 'PASS' && extra.elsewhere.some((f) => /header only with the name: x-more$/.test(f)), 'a header only with the name: RECORDED by name (elsewhere), not judged', extra.elsewhere);
  const ua2 = EM.entryVerdict(run('sdk-cli'), run('vibespace', { ua: 'claude-cli/2 (external, vibespace)' }), 'vibespace');
  ok(ua2.verdict === 'PASS' && ua2.elsewhere.some((f) => /header user-agent: /.test(f)), 'a user agent that differs beyond the label is recorded too', ua2.elsewhere);
  ok(EM.entryVerdict(null, run('vibespace'), 'vibespace').verdict === 'INCOMPLETE' && EM.entryVerdict(run('sdk-cli'), run('vibespace', { turnOk: false }), 'vibespace').verdict === 'INCOMPLETE' && EM.entryVerdict(run('sdk-cli'), run('vibespace'), '').verdict === 'INCOMPLETE',
    'INCOMPLETE: a run missing, a turn that did not finish, no name — nothing is judged');
  const evs = EM.eventShapeOf([{ o: { type: 'system', subtype: 'init', model: 'x' } }, { o: { type: 'assistant', message: {} } }, { o: { type: 'result', subtype: 'success', is_error: false } }, { o: { type: 'system', subtype: 'late' } }]);
  ok(JSON.stringify(evs) === JSON.stringify(['system/init {model,subtype,type}', 'assistant {message,type}', 'result/success {is_error,subtype,type}']), 'eventShapeOf: type, subtype and key names (never a value), up to the first result', evs);
  const m = EM.maskEntry({ heads: [head('sdk-cli', 'claude-cli/1 (external, sdk-cli)')] }, 'sdk-cli');
  ok(m.heads[0].headers['user-agent'] === 'claude-cli/1 (external, <entry>)' && /cc_entrypoint=<entry>;/.test(m.heads[0].body.systemHead), 'maskEntry: the label as a whole word in the user agent (claude-cli untouched) and the billing line\'s value', m.heads[0]);
  ok(JSON.stringify(EM.ENTRY_VARIANTS) === '["entry-off","entry-on"]' && EM.ENTRY_DEFAULT_NAME === 'vibespace', 'the pair: entry-off, entry-on; vibespace unless the run names another');
  const P = read('src/claude-oat-probe.js');
  ok(/'CLAUDE_CODE_ENTRYPOINT'\]\);/.test(P) && /if \(env\[ENTRY_VAR\] !== undefined && variant !== 'entry-on'\) bad\(/.test(P) && /if \(env\[ENTRY_VAR\] !== undefined && !entryNameVerdict\(env\[ENTRY_VAR\]\)\.ok\) bad\(/.test(P)
    && /\.\.\.\(name === 'entry-on' \? \{ \[ENTRY_VAR\]: ENTRY_NAME \} : \{\}\)/.test(P) && !/OAT_VARIANTS[^\n]*entry-/.test(read('src/cli-caps.js')),
    'the probe: the name on the allowlist for entry-on alone and only as a name the setting takes; set on entry-on\'s launch alone; NOT an oat variant (the hub\'s own check of a new CLI build never runs it)');
}

console.log('— ⑦ RED CONTROLS');
{
  const M = mutantCopies('entry-label', REPO);
  const AS = read('src/adapters/claude-code.js');
  const GUARD = '{ const en = ENTRY.entryNameFor({ mode, value: S.entryLabel }); if (en) env[ENTRY.ENTRY_VAR] = en; }';
  const noGuard = M.load('src/adapters/claude-code.js', anchored(AS, GUARD, "{ const en = ENTRY.entryNameFor({ mode: 'chat', value: S.entryLabel }); if (en) env[ENTRY.ENTRY_VAR] = en; }", 'mode guard dropped'), 'mode');
  ok(chatCarries(noGuard.ClaudeCodeAdapter) && !terminalNever(noGuard.ClaudeCodeAdapter), 'RED: the adapter reading every start as chat ⇒ the terminal leg goes RED (the chat leg still green: the control changes one thing)');
  const RS = read('src/claude-entry-label.js');
  const raw = M.load('src/claude-entry-label.js', anchored(RS, '  return r.ok ? { on: true, name: r.name, typed: true } : { on: false, refused: r.code, typed: true };', '  return { on: true, name: v, typed: true };', 'refused passed'), 'raw');
  ok(raw.entryNameFor({ mode: 'chat', value: 'cli' }) === 'cli' && raw.entryNameFor({ mode: 'chat', value: 'claude-desktop' }) === 'claude-desktop', 'RED: a refused typed name passed as typed ⇒ cli and a vendor name would ride (the ① and ② legs refuse them)');
  // 主开发 r4493: «red if the guard is dropped» — the ten lines' push in the create WITHOUT its backend guard (chat mode alone)
  const WS = read('src/ws-create.js');
  const PAIRS = "          let spawnEnvPairs = Object.entries(sessionSpec.env || {}).map(([k, v]) => `${k}=${v == null ? '' : String(v)}`);\n";
  const unguarded = M.load('src/ws-create.js', anchored(WS, PAIRS, PAIRS + "          { const ep = require('./claude-entry-label.js').entryNameFor({ mode: sessionMode, value: 'vibespace' }); if (ep) spawnEnvPairs.push(`CLAUDE_CODE_ENTRYPOINT=${ep}`); }\n", 'backend guard dropped'), 'unguarded');
  const carried = (await othersThrough(unguarded, {})).filter(([, , r]) => r.spawned && r.name === 'vibespace').map(([id, mode]) => `${id} ${mode}`);
  ok(carried.length >= 1, `RED: the push without its backend guard ⇒ the every-backend leg goes RED (${carried.join(', ') || 'NONE — the control proves nothing'} would hand the name on)`, carried);
  let rel = null; try { rel = execFileSync('git', ['show', `${RELEASE}:src/adapters/claude-code.js`], { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { rel = null; }
  if (!rel) { skipped++; console.log(`  - SKIP the release's adapter (${RELEASE} is not in this clone's history)`); }
  else {
    const R = M.load('src/adapters/claude-code.js', rel, 'release');
    ok(!chatCarries(R.ClaudeCodeAdapter) && terminalNever(R.ClaudeCodeAdapter), `RED: the release's adapter (${RELEASE}) ⇒ the chat leg goes RED (it passes no entry label)`);
  }
}

console.log(fail ? `${fail} FAILED (${pass} passed${skipped ? `, ${skipped} skipped` : ''})` : `ALL PASS (${pass}${skipped ? `, ${skipped} skipped` : ''})`);
process.exit(fail ? 1 : 0);
