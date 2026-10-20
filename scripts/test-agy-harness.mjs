#!/usr/bin/env node
// THE ANTIGRAVITY CLI HARNESS (lane antigravity-harness). The descriptor re-derived from what agy 1.4.3 MEASURED
// (scripts/fixtures/antigravity-cli-1.4.3.json), then the REAL data/bin/agy-wrapper.js drives the fake agy
// (scripts/fixtures/antigravity-agy, the headless stream-json contract) over plain pipes, and the journal it writes is
// read back through the ACP normalizer the harness shares:
//   ① the descriptor rows ⇄ the fixture (every flag the adapter passes is one agy's --help lists; effort / mode values;
//     the docs' model slugs; the derived never-armed auto-resume row; the job door's agy names)
//   ② one chat turn: the conversation id adopted from agy's init, the text, a tool step as a tool card, result = turn end,
//     the version recorded per spawn; the ACP normalizer renders the journal
//   ③ THE SLASH REFUSAL + its RED control (a wrapper copy that forwards it: agy ends the stream, exit 2)
//   ④ THE SOFT-DENY CARD + Allow once and retry (one turn with the bypass, then back) / Keep skipped / stale + its RED control
//     (a copy whose stderr reader drops it: the skip is silent); ④b the one-turn bypass never reaches a reordered user
//     turn + its RED control; ④c on a named account the rule door writes the ACCOUNT's settings.json (never through a
//     link — RED copy) and the auth notice names the account's sign-in door
//   ⑨ named accounts through the REAL accounts store: the HOME root + its farm, stat-only sign-in, the spawn env, the
//     remote refusal, the default, Sign in again, export without the login, remove never following a link
//   ⑩ the /usage reading: the judge's STOP rule (any turn sign ⇒ turn-started) + RED copy, no parser before a signed-in
//     capture, and scripts/agy-usage-capture.mjs against the fake agy (exit 2 / 0 / 3, redacted, the account env)
//   ⑤ a model / mode switch RESTARTS agy on the same conversation (--conversation), the next reply on the new flags
//   ⑥ Stop = restart on the same conversation, the turn ends cancelled; the queue's remove / edit
//   ⑦ resume (--conversation from the start), an agent error (AGY_ERROR + result ERROR), a text-only stream
//   ⑧ THE AUTH GATE: an unauthenticated agy is refused in seconds by name, and never gets a user line as its code
// Run: node scripts/test-agy-harness.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratchDir } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const WRAPPER = path.join(REPO, 'data/bin/agy-wrapper.js');
const STUB = path.join(REPO, 'scripts/fixtures/antigravity-agy');
const FX = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/antigravity-cli-1.4.3.json'), 'utf8'));
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 500) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ROOT = scratchDir('agy-harness');
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
const CLEAN_ENV = { ...process.env };
for (const k of Object.keys(CLEAN_ENV)) if (/^VIBESPACE_|^ACP_WEBUI_|^AGY_|^CLAUDE_CODE_/.test(k)) delete CLEAN_ENV[k];

const H = require(path.join(REPO, 'src/harnesses/index.js'));
const g = H.get('antigravity');
const { capsOf } = require(path.join(REPO, 'src/backend-caps.js'));
const { HARNESS_SETTINGS } = require(path.join(REPO, 'src/harness-settings.js'));
const { AgyAdapter, agyFlags, AGY_MODES, AGY_EFFORTS } = require(path.join(REPO, 'src/adapters/agy.js'));
const { AcpMessageManager } = require(path.join(REPO, 'src/acp-message-manager.js'));
const HE = require(path.join(REPO, 'src/harness-env.js'));

console.log('— ① the descriptor, re-derived from what agy 1.4.3 measured');
{
  const helpFlags = Object.keys(FX.help.flags);
  ok('the executable is `agy` (cli-env resolves exe.command; ANTIGRAVITY_CMD overrides), the chat wrapper is agy\'s own', g.exe.command === 'agy' && g.wrapper === 'data/bin/agy-wrapper.js' && g.Adapter === AgyAdapter && fs.existsSync(path.join(REPO, g.wrapper)));
  ok('the journal is the ACP one: caps.streamProtocol acp-events + the ACP normalizer (agy itself is not ACP)', capsOf('antigravity').streamProtocol === 'acp-events' && g.Normalizer === AcpMessageManager && g.caps === capsOf('antigravity'));
  const all = agyFlags({ model: 'm', effort: 'max', permissionMode: 'plan', resumeId: 'c-1' });
  ok('every flag the adapter passes is one agy 1.4.3 --help lists', ['--model', '--effort', '--mode', '--conversation', '--dangerously-skip-permissions', '--prompt-interactive', '--input-format', '--output-format'].every((f) => helpFlags.includes(f)) && all.filter((a) => a.startsWith('--')).every((f) => helpFlags.includes(f)), all);
  ok('effort values = the binary\'s low|medium|high|xhigh|max (the docs said three)', AGY_EFFORTS.join('|') === 'low|medium|high|xhigh|max' && /low\|medium\|high\|xhigh\|max/.test(FX.help.flags['--effort']));
  ok('our modes onto agy\'s: accept-edits / auto / plan = --mode (the binary\'s values), bypass = --dangerously-skip-permissions', AGY_MODES.filter((m) => m !== 'bypassPermissions').every((m) => FX.help.flags['--mode'].includes(m))
    && JSON.stringify(agyFlags({ permissionMode: 'bypassPermissions' })) === '["--dangerously-skip-permissions"]' && JSON.stringify(agyFlags({ permissionMode: 'default' })) === '[]');
  const ad = new AgyAdapter(g.adapterConfig({ acpCommands: { antigravity: '/opt/agy' }, acpWrapper: '/w/acp-wrapper.js', ptyWrapper: '/w/pty' }));
  const term = ad.buildSessionArgs({ mode: 'terminal', model: 'gemini-4-argon-high', effort: 'high', permissionMode: 'auto', resumeId: 'c-9' });
  ok('terminal = agy\'s TUI: --model / --effort / --mode / --conversation', term.cmd === '/opt/agy' && JSON.stringify(term.args) === JSON.stringify(['--model', 'gemini-4-argon-high', '--effort', 'high', '--mode', 'auto', '--conversation', 'c-9']) && term.wrapper === '/w/pty', term);
  const chat = ad.buildSessionArgs({ mode: 'chat', model: 'gemini-4-argon-high', permissionMode: 'bypassPermissions', resumeId: 'c-9' });
  ok('chat = the agy wrapper with the facts in AGY_WEBUI_* (never argv)', chat.wrapper === '/w/agy-wrapper.js' && chat.env.AGY_WEBUI_MODEL === 'gemini-4-argon-high' && chat.env.AGY_WEBUI_MODE === 'bypassPermissions' && chat.env.AGY_WEBUI_RESUME_ID === 'c-9' && chat.args.length === 0, chat);
  ok('the model table = the docs\' slugs (agy models needs a sign-in — measured)', g.models().slice(1).map((m) => m.id).join() === FX.models.slugs.join() && /sign in/i.test(FX.unauthenticated.models));
  const tbl = HARNESS_SETTINGS.antigravity;
  ok('settings: the table IS the descriptor\'s; its effort / mode options are agy\'s own values', g.settings === tbl && tbl.rows.find((r) => r.key === 'defaultEffort').options.filter((o) => o.value).every((o) => AGY_EFFORTS.includes(o.value))
    && tbl.rows.find((r) => r.key === 'defaultPermissionMode').options.filter((o) => o.value).every((o) => AGY_MODES.includes(o.value)));
  ok('auto-resume: the prompt verb exists, no limit signal (NULL_QUOTA, commit 1) ⇒ never offered', JSON.stringify(capsOf('antigravity').autoResume) === JSON.stringify({ signal: false, resume: 'prompt', supported: false }));
  ok('commit 2 = named Google accounts, each its own HOME root (localOnly, nothing shipped); still no pool', !!g.creds && g.creds.spawnForm === 'isolated-home' && g.creds.localOnly === true && g.creds.files.length === 0 && capsOf('antigravity').pool === false);
  ok('the job door strips agy\'s login names (GEMINI_API_KEY / AGY_ADC_AUTH / GOOGLE_GEMINI_BASE_URL — names the binary holds)', ['GEMINI_API_KEY', 'AGY_ADC_AUTH', 'GOOGLE_GEMINI_BASE_URL'].every((n) => HE.VENDOR_CREDENTIAL_ENV.includes(n) && FX.env.names.includes(n)));
}

function startWrapper({ env = {}, wrapper = WRAPPER } = {}) {
  const dir = fs.mkdtempSync(path.join(ROOT, 'w-'));
  const buf = path.join(dir, 's.buf'), meta = path.join(dir, 's.json'), log = path.join(dir, 'stub.log');
  const child = spawn(process.execPath, [wrapper, buf, meta, STUB], { env: { ...CLEAN_ENV, AGY_WEBUI_CWD: dir, AGY_WEBUI_BACKEND: 'antigravity', AGY_STUB_LOG: log, AGY_WEBUI_AUTH_GRACE_MS: '400', ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  const h = { child, dir, records: [], stderr: '', exited: null, log };
  let lb = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => { lb += d; let i; while ((i = lb.indexOf('\n')) !== -1) { const l = lb.slice(0, i).trim(); lb = lb.slice(i + 1); if (!l) continue; try { const r = JSON.parse(l); if (r.type !== '_stdin_ack') h.records.push(r); } catch { } } });
  child.stderr.setEncoding('utf8'); child.stderr.on('data', (d) => { h.stderr += d; });
  child.on('exit', (code) => { h.exited = { code, at: Date.now() }; });
  h.send = (o) => { try { child.stdin.write(JSON.stringify(o) + '\n'); } catch { } };
  h.find = (kind, pred = () => true) => h.records.find((r) => r.type === 'acp' && r.kind === kind && pred(r));
  h.all = (kind, pred = () => true) => h.records.filter((r) => r.type === 'acp' && r.kind === kind && pred(r));
  h.stub = () => { try { return fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
  h.until = async (pred, ms = 8000, what = 'condition') => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = pred(); if (v) return v; await sleep(20); } throw new Error(`timeout: ${what} (records ${h.records.map((r) => r.kind).join(',')}; ${h.stderr.slice(-300)})`); };
  h.text = () => h.all('update', (r) => r.update?.sessionUpdate === 'agent_message_chunk').map((r) => r.update.content.text).join('');
  h.stop = async () => { try { child.kill('SIGTERM'); } catch { } await sleep(150); };
  return h;
}

console.log('— ② one chat turn through the REAL wrapper against the fake agy');
let firstCid = null;
{
  const w = startWrapper({ env: { AGY_WEBUI_MODEL: 'gemini-4-argon-high' } });
  try {
    const ses = await w.until(() => w.find('session'), 8000, 'session');
    firstCid = ses.sessionId;
    ok('agy\'s init names the conversation → the `session` record (how new), the id the resume uses', /^[0-9a-f-]{36}$/.test(ses.sessionId) && ses.how === 'new' && ses.agentInfo?.name === 'agy', ses);
    const v = await w.until(() => w.find('agent_version'), 5000, 'version');
    ok('THE VERSION LAW: every spawn records the agy version it ran (`agy --version`)', v.version === FX.version, v);
    const st0 = await w.until(() => w.stub().find((x) => x.argv && x.argv.includes('--input-format')), 5000, 'stream start');
    ok('agy was started in its stream mode with the session\'s flags, --print-timeout 0 pinned (the binary: "0 waits until the turn completes"; its docs page: 5 m)',
      JSON.stringify(st0.argv) === JSON.stringify(['--input-format', 'stream-json', '--output-format', 'stream-json', '--print-timeout', '0', '--model', 'gemini-4-argon-high']) && /0 waits until the turn completes/.test(FX.help.flags['--print-timeout']), st0.argv);
    w.send({ type: 'chat-input', text: 'hello', msgId: 'u1' });
    const end = await w.until(() => w.find('prompt_end'), 8000, 'prompt_end');
    ok('one turn: the user line on agy\'s stdin, the reply\'s deltas as text, its `result` ends the turn (end_turn)', end.stopReason === 'end_turn' && w.text() === 'Antigravity (gemini-4-argon-high, request-review): hello' && w.stub().some((x) => x.stdin && JSON.parse(x.stdin).message.content === 'hello'), w.text());
    w.send({ type: 'chat-input', text: 'run the tool', msgId: 'u2' });
    await w.until(() => w.all('prompt_end').length === 2, 8000, 'second turn');
    const tc = w.find('update', (r) => r.update?.sessionUpdate === 'tool_call'), tu = w.find('update', (r) => r.update?.sessionUpdate === 'tool_call_update');
    ok('a tool step = a tool card: tool_call (run_command, execute, its parameters) then tool_call_update completed with the output', tc && tc.update.title === 'run_command' && tc.update.kind === 'execute' && tc.update.rawInput.CommandLine === 'echo hello_headless_demo' && tu && tu.update.status === 'completed' && /hello_headless_demo/.test(tu.update.content[0].content.text), [tc, tu]);
    const mm = new AcpMessageManager('agy');
    for (const r of w.records) { try { mm.processLive(r); } catch { } }
    const msgs = mm.tail(mm.total);
    ok('the ACP normalizer renders the journal: the user bubble, the assistant reply and the tool card', msgs.some((m) => m.role === 'user') && msgs.some((m) => m.role === 'assistant' && /Antigravity \(/.test(JSON.stringify(m))) && msgs.some((m) => /run_command|hello_headless_demo/.test(JSON.stringify(m))), msgs.map((m) => m.role + ':' + (m.type || '')).join(' '));
  } finally { await w.stop(); }
}

console.log('— ③ THE SLASH REFUSAL (agy would end the stream, exit 2)');
{
  const w = startWrapper();
  try {
    await w.until(() => w.find('session'), 8000, 'session');
    w.send({ type: 'chat-input', text: '/usage', msgId: 's1' });
    const n = await w.until(() => w.find('notice', (r) => r.noticeKind === 'slash-refused'), 5000, 'refusal');
    ok('a chat line starting with "/" is refused by the wrapper, by name', /\/usage was not sent/.test(n.text), n.text);
    w.send({ type: 'chat-input', text: 'still here', msgId: 's2' });
    await w.until(() => w.find('prompt_end'), 8000, 'the next turn');
    ok('…it never reached agy, and the conversation lives on (the next turn answers)', !w.stub().some((x) => x.stdin && /"\/usage"/.test(x.stdin)) && w.exited === null && /still here/.test(w.text()));
  } finally { await w.stop(); }
  // RED control: the same wrapper with the refusal removed lets the line through — agy ends the session (exit 2)
  const src = fs.readFileSync(WRAPPER, 'utf8');
  const cut = "      if (slashRefused(n.text)) return;\n";
  const mutated = path.join(ROOT, 'agy-wrapper-noslash.js');
  fs.writeFileSync(mutated, src.replace(cut, ''));
  const m = startWrapper({ wrapper: mutated });
  try {
    await m.until(() => m.find('session'), 8000, 'session');
    m.send({ type: 'chat-input', text: '/usage', msgId: 's1' });
    await m.until(() => m.exited, 8000, 'exit');
    ok('RED control: a wrapper copy WITHOUT the refusal forwards it — agy ends the conversation (exit 2), said as such', src.includes(cut) && m.find('notice', (r) => r.noticeKind === 'agent-exited' && /exit 2/.test(r.text)) && m.exited.code === 2, m.records.filter((r) => r.kind === 'notice').map((r) => r.text));
  } finally { await m.stop(); }
}

console.log('— ④ THE SOFT-DENY CARD 「agy skipped <tool>」 + Allow and retry (agy skips a tool that needs approval and carries on)');
const streamStarts = (w) => w.stub().filter((x) => x.argv && x.argv.includes('--input-format')).map((x) => x.argv);
{
  const w = startWrapper();
  try {
    const ses = await w.until(() => w.find('session'), 8000, 'session');
    w.send({ type: 'chat-input', text: 'please deny this', msgId: 'd1' });
    await w.until(() => w.find('prompt_end'), 8000, 'turn');
    const card = w.find('permission_request');
    ok('agy\'s stderr soft-deny line becomes the harness-neutral permission card naming the tool, its words kept, the retry\'s reach said',
      card && /^agy-deny-/.test(card.requestId) && card.toolCall.title === 'agy skipped run_command: it needs approval' && card.toolCall.kind === 'execute'
      && /requires approval/.test(card.toolCall.rawInput.notice) && /EVERY tool approved for one turn/.test(card.toolCall.rawInput.allowOnce) && !card.toolCall.rawInput.allowRule
      && JSON.stringify(card.options) === JSON.stringify([{ optionId: 'retry', name: 'Allow once and retry', kind: 'allow_once' }, { optionId: 'skip', name: 'Keep skipped', kind: 'reject_once' }]), card);
    ok('…and the turn still ended normally (the run continues, as agy documents)', w.find('prompt_end').stopReason === 'end_turn');
    const mm = new AcpMessageManager('agy');
    for (const r of w.records) { try { mm.processLive(r); } catch { } }
    const pc = mm.tail(mm.total).find((m) => m.permission && m.permission.requestId === card.requestId);
    ok('the ACP normalizer draws it as an approval card with the two buttons (no new client); on the machine login no rule door (its settings are the person\'s own file)', pc && pc.permission.kind === 'approval' && pc.permission.toolName === 'Bash' && pc.permission.options.map((o) => o.name).join('|') === 'Allow once and retry|Keep skipped' && pc.permission.input.tool === 'run_command', pc && pc.permission);
    const before = streamStarts(w).length;
    w.send({ type: 'permission-response', sessionId: 's', requestId: card.requestId, approved: true, optionId: 'retry' });
    await w.until(() => w.all('prompt_end').length === 2, 8000, 'the retry turn');
    await w.until(() => streamStarts(w).length >= before + 2, 8000, 'the restore restart');
    const starts = streamStarts(w), retryStart = starts[before], restoreStart = starts[before + 1];
    ok('Allow and retry: answered on the card (allow_once), agy restarted on the SAME conversation with --dangerously-skip-permissions for the retry',
      w.find('permission_resolved', (r) => r.requestId === card.requestId && r.optionKind === 'allow_once') && retryStart.includes('--dangerously-skip-permissions') && retryStart[retryStart.indexOf('--conversation') + 1] === ses.sessionId, retryStart);
    ok('…the retry line names the tool and that turn ran under always-proceed (the bypass)', w.stub().some((x) => x.stdin && /allowed run_command/.test(x.stdin)) && /always-proceed\): The user allowed run_command/.test(w.text()), w.text());
    ok('…ONE turn only: right after it agy is back on the conversation\'s mode (restarted without the bypass)', !restoreStart.includes('--dangerously-skip-permissions') && restoreStart[restoreStart.indexOf('--conversation') + 1] === ses.sessionId, restoreStart);
    w.send({ type: 'chat-input', text: 'and now', msgId: 'd2' }); // during the restore restart it queues (a restart drains the queue)
    await w.until(() => w.all('prompt_end').length === 3, 8000, 'the next turn');
    ok('…the next user turn runs under request-review again', /request-review\): and now/.test(w.text()), w.text());
    w.send({ type: 'chat-input', text: 'deny again', msgId: 'd3' });
    await w.until(() => w.all('permission_request').length === 2, 8000, 'second card');
    const c2 = w.all('permission_request')[1], n0 = streamStarts(w).length;
    w.send({ type: 'permission-response', sessionId: 's', requestId: c2.requestId, approved: false, optionId: 'skip' });
    await w.until(() => w.find('permission_resolved', (r) => r.requestId === c2.requestId), 5000, 'skip');
    await sleep(150);
    ok('Keep skipped: answered (reject_once), nothing restarts, nothing is sent', w.find('permission_resolved', (r) => r.requestId === c2.requestId).optionKind === 'reject_once' && streamStarts(w).length === n0 && w.all('prompt_end').length === 4);
    w.send({ type: 'permission-response', sessionId: 's', requestId: c2.requestId, approved: true, optionId: 'retry' });
    const st = await w.until(() => w.find('notice', (r) => r.noticeKind === 'stale'), 5000, 'stale');
    ok('a second answer to the same card is refused by name (stale) — no restart', /unknown\/expired/.test(st.text) && streamStarts(w).length === n0);
  } finally { await w.stop(); }
  const src = fs.readFileSync(WRAPPER, 'utf8');
  const line = "  if (SOFT_DENY_RE.test(line)) { softDenyCard(line); }";
  const mutated = path.join(ROOT, 'agy-wrapper-nodeny.js');
  fs.writeFileSync(mutated, src.replace(line, '  if (false && SOFT_DENY_RE.test(line)) { softDenyCard(line); }'));
  const m = startWrapper({ wrapper: mutated });
  try {
    await m.until(() => m.find('session'), 8000, 'session');
    m.send({ type: 'chat-input', text: 'please deny this', msgId: 'd1' });
    await m.until(() => m.find('prompt_end'), 8000, 'turn');
    ok('RED control: a copy whose stderr reader drops the line leaves the skip SILENT — no card, no notice (the legs above can go red)', src.includes(line) && !m.find('permission_request') && !m.find('notice', (r) => /approval/.test(r.text || '')));
  } finally { await m.stop(); }
}
console.log('— ④b THE ONE-TURN BYPASS never reaches a user turn (a reorder during the slow restart)');
{
  async function reorderLeg(wrapper) {
    const w = startWrapper({ wrapper, env: { AGY_STUB_EXIT_DELAY_MS: '450' } });
    try {
      await w.until(() => w.find('session'), 8000, 'session');
      w.send({ type: 'chat-input', text: 'please deny this', msgId: 'd1' });
      const card = await w.until(() => w.find('permission_request'), 8000, 'card');
      await w.until(() => w.find('prompt_end'), 8000, 'turn');
      w.send({ type: 'permission-response', sessionId: 's', requestId: card.requestId, approved: true, optionId: 'retry' });
      await w.until(() => w.find('notice', (r) => r.noticeKind === 'soft-deny-retry'), 5000, 'allowed');
      await sleep(100);
      w.send({ type: 'chat-input', text: 'mine', msgId: 'u9' });
      const q = await w.until(() => w.all('queue_changed').reverse().find((r) => r.items.length === 2), 5000, 'two queued');
      const mineId = q.items.find((i) => i.kind === 'user').id;
      w.send({ type: 'queue-op', op: 'reorder', id: mineId, afterId: null });
      await w.until(() => w.all('prompt_end').length === 3, 15000, 'both turns');
      return w.text();
    } finally { await w.stop(); }
  }
  const t = await reorderLeg(WRAPPER);
  ok('the user turn moved ahead of the retry runs under request-review; the retry alone gets the bypass', /request-review\): mine/.test(t) && /always-proceed\): The user allowed run_command/.test(t), t);
  const src = fs.readFileSync(WRAPPER, 'utf8');
  const guard = '  if (wantBypass !== childRetryBypass) {';
  const mutated = path.join(ROOT, 'agy-wrapper-leak.js');
  fs.writeFileSync(mutated, src.replace(guard, '  if (wantBypass && !retryBypass) {'));
  const tm = await reorderLeg(mutated);
  ok('RED control: a copy that checks only "retry wants it" (not what the process was started with) runs the moved user turn with every tool approved', src.includes(guard) && /always-proceed\): mine/.test(tm), tm);
}

console.log('— ④c ON A NAMED ACCOUNT: "Allow <rule> and retry" writes the rule into the ACCOUNT\'s own settings.json');
{
  const H8 = require(path.join(REPO, 'src/harnesses/antigravity.js'));
  const mkRoot = (name) => { const root = path.join(ROOT, name), machine = path.join(ROOT, name + '-machine'); fs.mkdirSync(machine, { recursive: true }); H8.seedHomeRoot(root, machine); return root; };
  const settingsOf = (root) => path.join(root, '.gemini', 'antigravity-cli', 'settings.json');
  async function ruleLeg(root, wrapper = WRAPPER) {
    const w = startWrapper({ wrapper, env: { HOME: root } });
    try {
      await w.until(() => w.find('session'), 8000, 'session');
      w.send({ type: 'chat-input', text: 'please deny this', msgId: 'r1' });
      const card = await w.until(() => w.find('permission_request'), 8000, 'card');
      await w.until(() => w.find('prompt_end'), 8000, 'turn');
      const n0 = streamStarts(w).length;
      if (card.options.some((o) => o.optionId === 'rule')) {
        w.send({ type: 'permission-response', sessionId: 's', requestId: card.requestId, approved: true, optionId: 'rule' });
        await w.until(() => w.all('prompt_end').length === 2, 8000, 'the retry turn');
      }
      return { w, card, starts: streamStarts(w).slice(n0), text: w.text() };
    } finally { await w.stop(); }
  }
  const root = mkRoot('acct-a');
  const r = await ruleLeg(root);
  ok('the card offers the rule the notice names, scoped to THIS account, before the once-door', r.card.options.map((o) => o.optionId).join() === 'rule,retry,skip' && r.card.options[0].name === 'Allow command(rm) and retry' && r.card.options[0].kind === 'allow_always' && /this Google account's own Antigravity settings/.test(r.card.toolCall.rawInput.allowRule), r.card.options);
  const js = JSON.parse(fs.readFileSync(settingsOf(root), 'utf8'));
  ok('…answered: command(rm) is in the account\'s settings.json permissions.allow (mode 0600)', JSON.stringify(js.permissions.allow) === '["command(rm)"]' && (fs.statSync(settingsOf(root)).mode & 0o777) === 0o600, js);
  ok('…agy restarted on the same conversation WITHOUT the bypass (the rule, not every tool) and the turn was sent again', r.starts.length >= 1 && !r.starts[0].includes('--dangerously-skip-permissions') && r.starts[0].includes('--conversation') && /request-review\): The user allowed run_command \(the rule command\(rm\)/.test(r.text), { starts: r.starts, text: r.text });
  // a settings.json that is a LINK (to the person's global file) is never written through
  const root2 = mkRoot('acct-b');
  const globalFile = path.join(ROOT, 'global-settings.json');
  fs.writeFileSync(globalFile, '{"mine":true}\n');
  fs.rmSync(settingsOf(root2)); fs.symlinkSync(globalFile, settingsOf(root2));
  const r2 = await ruleLeg(root2);
  ok('a linked settings.json: no rule door is offered, the linked file is untouched', !r2.card.options.some((o) => o.optionId === 'rule') && fs.readFileSync(globalFile, 'utf8') === '{"mine":true}\n', r2.card.options);
  // the real hazard: a LINKED antigravity-cli DIR — the atomic rename would land in the person's global dir
  const root3 = mkRoot('acct-c');
  const globalDir = path.join(ROOT, 'global-antigravity-cli');
  fs.mkdirSync(globalDir); fs.writeFileSync(path.join(globalDir, 'settings.json'), '{"mine":true}\n');
  const cliDir = path.join(root3, '.gemini', 'antigravity-cli');
  fs.rmSync(cliDir, { recursive: true, force: true }); fs.symlinkSync(globalDir, cliDir);
  const r4 = await ruleLeg(root3);
  ok('a linked antigravity-cli dir: no rule door, the person\'s global settings untouched', !r4.card.options.some((o) => o.optionId === 'rule') && fs.readFileSync(path.join(globalDir, 'settings.json'), 'utf8') === '{"mine":true}\n', r4.card.options);
  // RED control: a copy that checks the dirs with stat (following links) offers the door and writes the GLOBAL file
  const src = fs.readFileSync(WRAPPER, 'utf8');
  const chk = 'if (!fs.lstatSync(d).isDirectory())';
  const mutated = path.join(ROOT, 'agy-wrapper-statdir.js');
  fs.writeFileSync(mutated, src.replace(chk, 'if (!fs.statSync(d).isDirectory())'));
  const r5 = await ruleLeg(root3, mutated);
  ok('RED control: a copy that follows the link writes the rule into the person\'s global settings.json (the leg above can go red)', src.includes(chk) && r5.card.options.some((o) => o.optionId === 'rule') && /command\(rm\)/.test(fs.readFileSync(path.join(globalDir, 'settings.json'), 'utf8')));
  // the machine login (no mark in HOME): the auth notice names the terminal sign-in; an account: its own sign-in door
  const w = startWrapper({ env: { HOME: root, AGY_STUB_AUTH: 'none' } });
  try {
    w.send({ type: 'chat-input', text: 'hello?', msgId: 'a0' });
    const n = await w.until(() => w.find('notice', (x) => x.noticeKind === 'auth-required'), 6000, 'auth-required (account)');
    ok('an account session that is not signed in names ITS door (Agents → Antigravity CLI → ⋯ → Sign in again)', /This Google account \(Antigravity\) is not signed in/.test(n.text) && /Sign in again/.test(n.text), n.text);
  } finally { await w.stop(); }
}

console.log('— ⑤ a model / mode switch restarts agy on the same conversation');
{
  const w = startWrapper();
  try {
    const ses = await w.until(() => w.find('session'), 8000, 'session');
    w.send({ type: 'set-model', model: 'gemini-3.8-flash-medium' });
    w.send({ type: 'set-mode', mode: 'bypassPermissions' });
    await w.until(() => w.stub().filter((x) => x.argv && x.argv.includes('--input-format')).length >= 2, 8000, 'restart');
    w.send({ type: 'chat-input', text: 'after the switch', msgId: 'm1' }); // queued behind the restart if it is still in flight
    await w.until(() => w.find('prompt_end'), 8000, 'turn');
    const starts = w.stub().filter((x) => x.argv && x.argv.includes('--input-format')).map((x) => x.argv);
    const last = starts[starts.length - 1];
    ok('the restart carries --conversation <the same id> and the new flags', last.includes('--conversation') && last[last.indexOf('--conversation') + 1] === ses.sessionId && last.includes('--model') && last[last.indexOf('--model') + 1] === 'gemini-3.8-flash-medium' && last.includes('--dangerously-skip-permissions'), last);
    ok('…the notice says the process restarts, and the next reply runs on the new model / mode', w.find('notice', (r) => r.noticeKind === 'command_applied' && /restarts its process on the same conversation/.test(r.text)) && /gemini-3.8-flash-medium, always-proceed/.test(w.text()), w.text());
    w.send({ type: 'set-mode', mode: 'yolo' });
    const u = await w.until(() => w.find('notice', (r) => r.noticeKind === 'unsupported'), 5000, 'unsupported mode');
    ok('a mode agy does not have is refused by name (never passed through)', /has no Mode "yolo"/.test(u.text), u.text);
  } finally { await w.stop(); }
}

console.log('— ⑥ Stop and the queue');
{
  const w = startWrapper({ env: { AGY_STUB_SLOW_MS: '1500' } });
  try {
    const ses = await w.until(() => w.find('session'), 8000, 'session');
    w.send({ type: 'chat-input', text: 'a slow one', msgId: 'q0' });
    await w.until(() => w.find('prompt_start'), 5000, 'start');
    w.send({ type: 'chat-input', text: 'queued one', msgId: 'q1' });
    w.send({ type: 'chat-input', text: 'queued two', msgId: 'q2' });
    const qc = await w.until(() => w.all('queue_changed').find((r) => r.items.length === 2), 5000, 'queue');
    w.send({ type: 'queue-op', op: 'edit', id: qc.items[0].id, text: 'queued one, edited' });
    w.send({ type: 'queue-op', op: 'remove', id: qc.items[1].id });
    await w.until(() => w.all('queue_op_result').length >= 2, 5000, 'queue ops');
    ok('a turn runs, later lines queue in the WRAPPER; edit / remove are served', w.all('queue_op_result').every((r) => r.ok) && w.all('queued_input').length === 2);
    w.send({ type: 'interrupt' });
    const end = await w.until(() => w.find('prompt_end'), 5000, 'end');
    ok('Stop ends the running turn as cancelled and drops the queue', end.stopReason === 'cancelled' && w.find('notice', (r) => r.noticeKind === 'stop-restart'), end);
    await w.until(() => w.stub().filter((x) => x.argv && x.argv.includes('--input-format')).length >= 2, 8000, 'restart after stop');
    const starts = w.stub().filter((x) => x.argv && x.argv.includes('--input-format')).map((x) => x.argv);
    ok('…by restarting agy on the same conversation (its stream has no cancel)', starts[1].includes('--conversation') && starts[1][starts[1].indexOf('--conversation') + 1] === ses.sessionId);
  } finally { await w.stop(); }
}

console.log('— ⑦ resume, an agent error, text only');
{
  const w = startWrapper({ env: { AGY_WEBUI_RESUME_ID: firstCid } });
  try {
    const ses = await w.until(() => w.find('session'), 8000, 'session');
    const startArgv = await w.until(() => (w.stub().find((x) => x.argv && x.argv.includes('--input-format')) || {}).argv, 8000, 'agy start');
    ok('a resume is --conversation <id> from the first start, the session record says load', ses.how === 'load' && ses.sessionId === firstCid && startArgv.includes('--conversation') && startArgv.includes(firstCid), { ses, startArgv });
    w.send({ type: 'chat-input', text: 'this will fail', msgId: 'f1' });
    const end = await w.until(() => w.find('prompt_end'), 8000, 'end');
    ok('agy\'s ERROR result ends the turn as an error with its words; the AGY_ERROR line is said', end.stopReason === 'error' && /model unavailable/.test(end.error.message) && w.find('notice', (r) => r.noticeKind === 'agy-error' && /model unavailable/.test(r.text)), end);
    w.send({ type: 'chat-input', text: JSON.stringify({ type: 'user', message: { content: [{ type: 'image', source: { data: 'AAAA', media_type: 'image/png' } }, { type: 'text', text: 'see this' }] } }), msgId: 'i1' });
    await w.until(() => w.all('prompt_end').length === 2, 8000, 'image turn');
    ok('an image is not sent (agy\'s stream takes text only — another block ends it, exit 1); the text is, and it says so', w.find('notice', (r) => r.noticeKind === 'unsupported' && /text only/.test(r.text)) && w.stub().filter((x) => x.stdin).every((x) => typeof JSON.parse(x.stdin).message.content === 'string') && w.exited === null);
  } finally { await w.stop(); }
}

console.log('— ⑧ THE AUTH GATE: an unauthenticated agy');
{
  // the measured stream start on a pipe: agy refuses at once — said by name, the session ends
  const w0 = startWrapper({ env: { AGY_STUB_AUTH: 'none' } });
  try {
    w0.send({ type: 'chat-input', text: 'hello?', msgId: 'a0' });
    const n0 = await w0.until(() => w0.find('notice', (r) => r.noticeKind === 'auth-required'), 6000, 'auth-required (pipe)');
    await w0.until(() => w0.exited, 6000, 'exit');
    ok('agy\'s immediate refusal on a pipe (measured 1.4.3) is said BY NAME (shape: refusal) and ends the wrapper', /not signed in/.test(n0.text) && w0.exited.code === 1 && !w0.stub().some((x) => x.stdin) && w0.find('auth_required', (r) => r.how === 'refusal'), w0.find('auth_required'));
  } finally { await w0.stop(); }
  const w = startWrapper({ env: { AGY_STUB_AUTH: 'wait', AGY_STUB_AUTH_WAIT_MS: '20000' } });
  try {
    w.send({ type: 'chat-input', text: 'are you there', msgId: 'a1' });
    const n = await w.until(() => w.find('notice', (r) => r.noticeKind === 'auth-required'), 6000, 'auth-required');
    await w.until(() => w.exited, 6000, 'wrapper exit');
    // ordering, not a clock: the stub's own wait (20 s) ends with "authentication failed or timed out" — the wrapper must be gone first
    ok('refused BY NAME before agy\'s pasted-code wait ends (its timeout result never arrives) — and the wrapper ends (exit 1)', /not signed in/.test(n.text) && w.exited.code === 1 && !JSON.stringify(w.records).includes('timed out'), { code: w.exited && w.exited.code });
    ok('…agy never received our line as its authorization code', !w.stub().some((x) => x.authCodeLine) && !w.stub().some((x) => x.stdin), w.stub());
    ok('…the journal names the shape (link-wait), and the OAuth link is not copied into it', !JSON.stringify(w.records).includes('client_id=') && !JSON.stringify(w.records).includes('oauth2') && w.find('auth_required', (r) => r.how === 'link-wait'), w.find('auth_required'));
  } finally { await w.stop(); }
}

console.log('— ⑨ NAMED ACCOUNTS: «Add Google account (Antigravity)» = a HOME root each (the real accounts store, a scratch data dir)');
{
  const H8 = require(path.join(REPO, 'src/harnesses/antigravity.js'));
  const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
  // a scratch MACHINE HOME (os.homedir() reads HOME): the person's dotfiles, their agy customizations, their own login
  const MACHINE = path.join(ROOT, 'machine-home'), DATA = path.join(ROOT, 'data');
  for (const d of ['.ssh', '.gemini/config', '.gemini/antigravity-cli/skills', '.config/gh', '.config/antigravity']) fs.mkdirSync(path.join(MACHINE, d), { recursive: true });
  fs.writeFileSync(path.join(MACHINE, '.ssh/id_ed25519'), 'machine-key\n');
  fs.writeFileSync(path.join(MACHINE, '.gitconfig'), '[user]\n\tname = u\n');
  fs.writeFileSync(path.join(MACHINE, '.config/gh/hosts.yml'), 'gh\n');
  fs.writeFileSync(path.join(MACHINE, '.config/antigravity/plugin-secrets.json'), '{"machine":1}\n');
  fs.writeFileSync(path.join(MACHINE, '.gemini/antigravity-cli/settings.json'), '{"permissions":{"allow":["command(git)"]}}\n');
  fs.writeFileSync(path.join(MACHINE, H8.TOKEN_REL), 'MACHINE-LOGIN');
  fs.mkdirSync(DATA, { recursive: true });
  const prevHome = process.env.HOME; process.env.HOME = MACHINE;
  try {
    const am = new AccountManager({ dataDir: DATA });
    const c = am.createHomeSubscription('antigravity', { name: '' });
    ok('createHomeSubscription: an agy- id whose dir data/agy-subs/<id> is a 0700 HOME root, named by the login label', /^agy-[0-9a-f]{12}$/.test(c.id) && c.dir === path.join(DATA, 'agy-subs', c.id) && (fs.statSync(c.dir).mode & 0o777) === 0o700 && am.get(c.id).name === 'Google' && am.get(c.id).backend === 'antigravity');
    ok('…the login is agy\'s OWN sign-in (its TUI: a link + a pasted code) on that root, the bus disabled, in an empty working dir', c.loginCmd === `cd '${c.dir}/.vibespace-login' && HOME='${c.dir}' DBUS_SESSION_BUS_ADDRESS=disabled: 'agy'`, c.loginCmd);
    const L = (rel) => { try { return fs.readlinkSync(path.join(c.dir, rel)); } catch { return null; } };
    ok('THE FARM: the agent\'s own commands see the person\'s dotfiles (.ssh, .gitconfig, .config/gh, ~/.gemini/config are links)',
      L('.ssh') === path.join(MACHINE, '.ssh') && L('.gitconfig') === path.join(MACHINE, '.gitconfig') && L('.config/gh') === path.join(MACHINE, '.config/gh') && L('.gemini/config') === path.join(MACHINE, '.gemini/config'));
    ok('…agy\'s own state is per account: .gemini/antigravity-cli and .config/antigravity are the root\'s (no machine login, no machine plugin secrets)',
      fs.lstatSync(path.join(c.dir, '.gemini/antigravity-cli')).isDirectory() && !fs.existsSync(path.join(c.dir, H8.TOKEN_REL)) && !fs.existsSync(path.join(c.dir, '.config/antigravity')));
    const acctSettings = path.join(c.dir, '.gemini/antigravity-cli/settings.json');
    ok('…the person\'s agy customizations are linked (skills), settings.json is the ACCOUNT\'S OWN file seeded from the machine\'s',
      L('.gemini/antigravity-cli/skills') === path.join(MACHINE, '.gemini/antigravity-cli/skills') && fs.lstatSync(acctSettings).isFile() && JSON.parse(fs.readFileSync(acctSettings, 'utf8')).permissions.allow[0] === 'command(git)');
    let threw = ''; try { am.resolveForSpawn(c.id, 'antigravity'); } catch (e) { threw = e.message; }
    ok('before the sign-in: listed not logged in, and a spawn on it refuses by name', am.list().accounts.find((a) => a.id === c.id).loggedIn === false && /not logged in/.test(threw), threw);
    fs.writeFileSync(path.join(c.dir, H8.TOKEN_REL), 'ACCOUNT-LOGIN', { mode: 0o600 }); // what agy's sign-in writes
    const fin = am.finalizeHomeSubscription(c.id);
    ok('finalize: logged in by a stat of agy\'s file (no identity read — the name stays until the person renames it)', fin.loggedIn === true && fin.email === null && am.get(c.id).name === 'Google', fin);
    fs.writeFileSync(path.join(MACHINE, '.npmrc'), 'registry\n'); // the person's HOME gains an entry after the account was made
    const sp = am.resolveForSpawn(c.id, 'antigravity');
    ok('a spawn on it: HOME = the account root + the bus disabled (process env, never argv), no secret, nothing to ship', sp.localEnv.HOME === c.dir && sp.localEnv.DBUS_SESSION_BUS_ADDRESS === 'disabled:' && sp.secret === null && sp.remoteCreds === null && sp.kind === 'antigravity-subscription', sp);
    ok('…and the spawn REFRESHED the farm (the new ~/.npmrc is linked)', L('.npmrc') === path.join(MACHINE, '.npmrc'));
    let rt = ''; try { am.resolveForSpawn(c.id, 'antigravity', { remote: true }); } catch (e) { rt = e.message; }
    ok('a REMOTE spawn on a named account is refused by name (localOnly: the login never leaves this machine)', /run on this machine only/.test(rt), rt);
    am.setDefault(c.id, 'antigravity');
    ok('the default is the descriptor\'s field (defaultAntigravityAccountId), a no-pick spawn takes it, "subscription" = the machine login', am.list().defaultAntigravityAccountId === c.id && am.resolveForSpawn(undefined, 'antigravity')?.id === c.id && am.resolveForSpawn('subscription', 'antigravity') === null);
    ok('…the claude / codex defaults are untouched', am.list().defaultAccountId === null && am.list().defaultCodexAccountId === null);
    const again = am.homeLoginCommand(c.id);
    ok('"Sign in again" answers the same login command on the existing root', again.id === c.id && again.loginCmd === c.loginCmd);
    const exp = JSON.stringify(am.exportBundle());
    ok('export carries the account record and NOT its login (files: nothing — a secret we never read)', exp.includes(c.id) && !exp.includes('ACCOUNT-LOGIN') && !exp.includes('MACHINE-LOGIN'));
    am.remove(c.id);
    ok('remove: the root goes and NOTHING it linked is touched (rm never follows: the person\'s .ssh key, gh, agy settings, machine login all intact)',
      !fs.existsSync(c.dir) && am.list().defaultAntigravityAccountId === null && fs.readFileSync(path.join(MACHINE, '.ssh/id_ed25519'), 'utf8') === 'machine-key\n'
      && fs.existsSync(path.join(MACHINE, '.config/gh/hosts.yml')) && fs.existsSync(path.join(MACHINE, '.gemini/antigravity-cli/skills')) && fs.readFileSync(path.join(MACHINE, H8.TOKEN_REL), 'utf8') === 'MACHINE-LOGIN');
    const ms = g.creds.machineStatus({ cmd: null });
    fs.rmSync(path.join(MACHINE, H8.TOKEN_REL));
    const ms2 = g.creds.machineStatus({ cmd: '/opt/agy' });
    ok('machineStatus (the Agents row): a stat only — the machine\'s file ⇒ signed in; no file ⇒ UNKNOWN (null: with a session bus agy keeps it in the OS keyring)', ms.installed === false && ms.loggedIn === true && ms2.installed === true && ms2.loggedIn === null, { ms, ms2 });
  } finally { process.env.HOME = prevHome; }
}

console.log('— ⑩ THE /usage READING: the judge (the brief\'s STOP rule) + the capture script (no parser until a signed-in capture)');
{
  const U = require(path.join(REPO, 'src/harnesses/antigravity-usage.js'));
  const measured = U.judgeUsageAnswer({ code: 1, stdout: JSON.stringify(FX.unauthenticated.usageStdout), stderr: FX.unauthenticated.streamPipe.stderr.join('\n') });
  ok('the MEASURED unauthenticated answer (agy 1.4.3 offline) is auth-required — and shows no turn', measured.verdict === 'auth-required' && U.turnSigns(FX.unauthenticated.usageStdout).length === 0, measured);
  const clean = { conversation_id: '', status: 'SUCCESS', response: 'x', num_turns: 0, usage: { input_tokens: 0, output_tokens: 0 } };
  ok('a SUCCESS with no turn is "unparsed" — KNOWN_SHAPES is empty: no reading is ever guessed before a signed-in capture', U.KNOWN_SHAPES.length === 0 && U.judgeUsageAnswer({ code: 0, stdout: JSON.stringify(clean) }).verdict === 'unparsed');
  const billed = [{ ...clean, num_turns: 1 }, { ...clean, conversation_id: 'c-1' }, { ...clean, usage: { input_tokens: 0, output_tokens: 3 } }, { event: 'result', result: { ...clean, num_turns: 2 } }];
  ok('THE STOP RULE: any sign of a turn — num_turns, a conversation, one token, the stream-json result shape — is turn-started', billed.every((e) => U.judgeUsageAnswer({ code: 0, stdout: JSON.stringify(e) }).verdict === 'turn-started'), billed.map((e) => U.judgeUsageAnswer({ code: 0, stdout: JSON.stringify(e) }).verdict));
  const src = fs.readFileSync(path.join(REPO, 'src/harnesses/antigravity-usage.js'), 'utf8');
  const cut = '  if (signs.length) return { verdict: \'turn-started\'';
  const mutated = path.join(ROOT, 'antigravity-usage-noturn.js');
  fs.writeFileSync(mutated, src.replace(cut, '  if (false && signs.length) return { verdict: \'turn-started\''));
  ok('RED control: a judge copy without the turn check calls a billed answer "unparsed" (the STOP rule can go red)', src.includes(cut) && require(mutated).judgeUsageAnswer({ code: 0, stdout: JSON.stringify(billed[0]) }).verdict === 'unparsed');
  ok('redactCapture: e-mails, project ids and opaque tokens become placeholders', JSON.stringify(U.redactCapture({ a: 'me@x.com', p: 'proj-name-123456', t: 'x'.repeat(48) })) === '{"a":"<email>","p":"<project>","t":"<opaque>"}');
  // the capture script, against the fake agy
  const CAP = path.join(REPO, 'scripts/agy-usage-capture.mjs');
  const run = (args, env = {}) => new Promise((res) => { const log = path.join(ROOT, `cap-${Math.random().toString(36).slice(2)}.log`); const c = spawn(process.execPath, [CAP, '--agy', STUB, ...args], { env: { ...CLEAN_ENV, AGY_STUB_LOG: log, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }); let out = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; }); c.on('close', (code) => res({ code, out, log: (() => { try { return fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } })() })); });
  const outOf = (n) => path.join(ROOT, `usage-${n}.json`);
  const a = await run(['--out', outOf('auth')]);
  ok('capture, not signed in: exit 2, nothing written', a.code === 2 && /auth-required/.test(a.out) && !fs.existsSync(outOf('auth')), a.out);
  const o = await run(['--out', outOf('ok')], { AGY_STUB_USAGE: 'ok' });
  const capOk = fs.existsSync(outOf('ok')) ? JSON.parse(fs.readFileSync(outOf('ok'), 'utf8')) : null;
  ok('capture, no turn: exit 0, the redacted answer written (version, argv, verdict unparsed, no e-mail left)', o.code === 0 && capOk && capOk.version === FX.version && capOk.verdict === 'unparsed' && JSON.stringify(capOk.argv) === JSON.stringify(U.USAGE_ARGV) && !/@example\.com/.test(JSON.stringify(capOk)), o.out);
  const tr = await run(['--out', outOf('turn')], { AGY_STUB_USAGE: 'turn' });
  ok('capture, a turn started: exit 3 (STOP) and the evidence written marked turn-started', tr.code === 3 && JSON.parse(fs.readFileSync(outOf('turn'), 'utf8')).verdict === 'turn-started', tr.out);
  const H8 = require(path.join(REPO, 'src/harnesses/antigravity.js'));
  const machine = path.join(ROOT, 'cap-machine'); fs.mkdirSync(machine);
  const root = path.join(ROOT, 'cap-acct'); H8.seedHomeRoot(root, machine);
  const ac = await run(['--account', root, '--out', outOf('acct')], { AGY_STUB_USAGE: 'ok' });
  const usageCall = ac.log.find((x) => x.argv && x.argv[0] === '-p');
  ok('--account runs it on the account\'s root: HOME = the root, the bus disabled (the spawn env), the CLI\'s own argv', ac.code === 0 && usageCall && usageCall.home === root && usageCall.bus === 'disabled:' && JSON.stringify(usageCall.argv) === JSON.stringify(U.USAGE_ARGV), { log: ac.log, out: ac.out });
  const bad = await run(['--account', machine, '--out', outOf('bad')]);
  ok('--account on a directory that is not an account root is refused (exit 1), agy never runs', bad.code === 1 && !bad.log.some((x) => x.argv && x.argv[0] === '-p'), bad.out);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
