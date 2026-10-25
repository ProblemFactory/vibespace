#!/usr/bin/env node
// THE ANTIGRAVITY CLI HARNESS (lane antigravity-harness). The descriptor re-derived from what agy 1.4.3 MEASURED
// (scripts/fixtures/antigravity-cli-1.4.3.json), then the REAL data/bin/agy-wrapper.js drives the fake agy
// (scripts/fixtures/antigravity-agy, the headless stream-json contract) over plain pipes, and the journal it writes is
// read back through the ACP normalizer the harness shares:
//   ① the descriptor rows ⇄ the fixture (every flag the adapter passes is one agy's --help lists; effort / mode values;
//     the docs' model slugs; the derived never-armed auto-resume row; the job door's agy names)
//   ② one chat turn: the conversation id adopted from agy's init, the text, a tool step as a tool card, result = turn end,
//     the version recorded per spawn; the ACP normalizer renders the journal
//   ①b agy's OWN slash commands (lane agy-slash-guard-paths): ONE closed list = the measured fixture's, PURE, the wrapper's
//     one source; the table — a command answers its name, a line that starts with a path (the attachment's) or any other
//     "/…" is text — + its RED control (the base's first-character rule: the attachment message is «/home»)
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
//   ⑫ THE SUBAGENT CARD (lane agy-subagent-cards): over a fixture agy store (scripts/fixtures/agy-store), the
//     invoke_subagent row → the `subagent` card record (linked by the task's spawning step), the sub's steps as `sub`
//     records, the row's own end, the card ending on the sub's answer (elapsed, files), the tail ON only while a sub
//     works and OFF after + its RED copy; an older agy (no subagent_info, no store) ⇒ no card, no error; no transcript ⇒
//     the db's rows (node:sqlite read-only) are the timeline; the ACP normalizer draws the card and the virtual session
//   ⑭ THE LIVE LANE (lane agy-peer-wake): the 'peer-message' frame — idle ⇒ a turn (the wake) with the «Message from»
//     head, busy ⇒ queued (a notification says steer:'unsupported'), no text ⇒ nothing, while agy restarts ⇒ queued and
//     delivered to the new process, not signed in ⇒ ok:false with its words, the queue at exit ⇒ back with its words; the
//     advert (peerMessage + notificationSteer:false) and the census of the answers (started early, run beside the rest)
// Run: node scripts/test-agy-harness.mjs
import fs from 'node:fs';
import crypto from 'node:crypto';
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
// a wrapper COPY lives at <root>/data/bin beside <root>/src → the repo's src, so its require of src/agy-store.js resolves
// (lane agy-subagent-cards: the wrapper's store parser is the shared module)
const MUTBIN = path.join(ROOT, 'data', 'bin');
fs.mkdirSync(MUTBIN, { recursive: true });
try { fs.symlinkSync(path.join(REPO, 'src'), path.join(ROOT, 'src')); } catch { }
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
  // lane effort-menu-per-harness: a level agy does not have is REFUSED BY NAME (it used to ride as no --effort at all, without a word)
  { let e = null; try { agyFlags({ effort: 'ultracode' }); } catch (x) { e = x; }
    ok('an effort agy does not have (claude\'s ultracode) THROWS effort_not_supported naming agy\'s levels — never dropped', e?.code === 'effort_not_supported' && JSON.stringify(e.levels) === JSON.stringify([...AGY_EFFORTS]) && /"ultracode"/.test(e.message), e?.message);
    ok('the descriptor declares the SAME array as its effort menu (ui.effortLevels), no extras', g.ui.effortLevels === AGY_EFFORTS && !g.ui.effortExtras); }
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

console.log('— ①b agy\'s OWN slash commands: ONE closed list (the measured fixture), a line that starts with a path is text');
{
  const SL = require(path.join(REPO, 'src/harnesses/antigravity-slash.js'));
  const modSrc = fs.readFileSync(path.join(REPO, 'src/harnesses/antigravity-slash.js'), 'utf8');
  const wSrc = fs.readFileSync(WRAPPER, 'utf8');
  ok('the list IS the one agy 1.4.3 measured (the fixture\'s slashInPrint.answeredWithoutATurn — its own changelog), frozen; the descriptor exports the SAME array',
    JSON.stringify(SL.AGY_SLASH_COMMANDS) === JSON.stringify(FX.slashInPrint.answeredWithoutATurn) && FX.slashInPrint.provenance === 'changelog' && Object.isFrozen(SL.AGY_SLASH_COMMANDS)
    && require(path.join(REPO, 'src/harnesses/antigravity.js')).AGY_SLASH_COMMANDS === SL.AGY_SLASH_COMMANDS, SL.AGY_SLASH_COMMANDS);
  ok('the module is PURE (no require, no import — the wrapper loads it beside src/) and names the fixture it was measured from',
    !/\brequire\(|\bimport\b/.test(modSrc.replace(/^\s*\/\/.*$/gm, '')) && modSrc.includes('scripts/fixtures/antigravity-cli-1.4.3.json'));
  ok('ONE definition: the wrapper requires that module and its guard asks agySlashCommand — no first-character test, no list of its own',
    wSrc.includes("require(path.join(__dirname, '..', '..', 'src', 'harnesses', 'antigravity-slash.js'))") && wSrc.includes('  const word = agySlashCommand(text);\n') && !wSrc.includes('^\\/[A-Za-z]') && !wSrc.includes("'/credits'"));
  const CMD = [['/model', '/model'], ['/usage opus', '/usage'], ['/help', '/help'], ['  /MODEL', '/model'], ['/Config\nthe next line', '/config'], ['/credits　全角空格', '/credits'], ...SL.AGY_SLASH_COMMANDS.map((c) => [c, c])];
  const TEXT = ['/home/u/x.zip 这里是…', '/tmp/a.txt', '~/x', './run.sh', '../up.sh', '/ 2', '/2026', '/notacommand hello', '/models', '/model/x', '/usage.txt', 'hello /model', '', null, undefined];
  const bad = CMD.filter(([t, w]) => SL.agySlashCommand(t) !== w).concat(TEXT.filter((t) => SL.agySlashCommand(t) !== null).map((t) => [t, SL.agySlashCommand(t)]));
  ok(`the table: ${CMD.length} command lines answer their command (any case, args after whitespace); ${TEXT.length} lines are TEXT — the attachment's path first, /tmp/a.txt, ~/x, ./run.sh, "/ 2", /2026, /notacommand, /models, /model/x, /usage.txt`, bad.length === 0, bad);
  // RED CONTROL = the base's rule (2.369.340): the guard read the FIRST CHARACTER ("/" + a letter) and named the word after it
  const cut = "  const head = String(text == null ? '' : text).trimStart().split(/\\s/, 1)[0].toLowerCase();\n  return AGY_SLASH_COMMANDS.includes(head) ? head : null;\n";
  const BASE_RULE = "  const t = String(text == null ? '' : text).trimStart();\n  return /^\\/[A-Za-z]/.test(t) ? (t.match(/^\\/[\\w:-]+/) || ['/'])[0] : null;\n";
  const mp = path.join(ROOT, 'antigravity-slash-base.js');
  fs.writeFileSync(mp, modSrc.replace(cut, BASE_RULE));
  const base = require(mp).agySlashCommand;
  ok('RED CONTROL (the base\'s first-character rule): the attachment message IS the command «/home», /tmp/a.txt «/tmp», /notacommand a command',
    modSrc.includes(cut) && base('/home/u/x.zip 这里是…') === '/home' && base('/tmp/a.txt') === '/tmp' && base('/notacommand hello') === '/notacommand' && base('/model') === '/model', [base('/home/u/x.zip 这里是…'), base('/tmp/a.txt'), base('/notacommand hello')]);
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

// ⑭ THE LIVE LANE (lane agy-peer-wake) runs its four wrappers TOGETHER with the sections below (the suite's 10 s
// tier): started here, its asserts are printed in order at ⑭ at the end
const peerLane = (async () => {
  const R = [];
  const ck = (n, c, e) => R.push([n, c, e]);
  const lines = (w) => w.stub().filter((x) => x.stdin).map((x) => JSON.parse(x.stdin).message.content);
  const starts = (w) => w.stub().filter((x) => x.argv && x.argv.includes('--input-format')).length;
  const idleBusy = async () => {
    const w = startWrapper({ env: { AGY_STUB_SLOW_MS: '700' } });
    try {
      await w.until(() => w.find('session'), 8000, 'session');
      const meta = JSON.parse(fs.readFileSync(path.join(w.dir, 's.json'), 'utf8'));
      const { wrapperCaps } = require(path.join(REPO, 'src/server/wrapper-files.js'));
      const wc = wrapperCaps(w.dir, 's', null);
      ck('THE ADVERT: the sidecar says peerMessage:true (the frame is served) and notificationSteer:false (its steer is a stop + a new turn) beside a verb list naming steer', meta.caps.peerMessage === true && meta.caps.notificationSteer === false && meta.caps.queueVerbs.includes('steer'), meta.caps);
      ck('…and the hub reads it so: wrapperCaps → peerMessage true, notificationSteer FALSE (the explicit field beats the list\'s derived true)', wc.peerMessage === true && wc.notificationSteer === false, wc);
      const t0 = Date.now();
      w.send({ type: 'peer-message', text: 'hello from B', fromName: 'session B', cardText: 'hello from B', kind: 'peer' });
      const r1 = await w.until(() => w.find('peer_result'), 8000, 'peer_result (idle)');
      const ms = Date.now() - t0;
      await w.until(() => w.find('prompt_end'), 8000, 'the peer turn');
      ck(`IDLE ⇒ THE WAKE: peer_result {ok:true, mode:'turn'} (frame → answer ${ms} ms), and agy's stdin carries the «Message from session B:» head + the words`, r1.ok === true && r1.mode === 'turn' && !('steer' in r1) && lines(w)[0] === 'Message from session B:\nhello from B', { r1, lines: lines(w) });
      const u1 = w.find('user', (r) => r.peer);
      ck('…the user record carries the peer marker (name, the card text, kind peer) — the ACP normalizer draws the labelled card', !!u1 && u1.peer.name === 'session B' && u1.peer.kind === 'peer' && u1.peer.body === 'hello from B', u1);
      w.send({ type: 'chat-input', text: 'a slow one', msgId: 'p1' });
      await w.until(() => w.all('prompt_start').length === 2, 5000, 'the slow turn');
      w.send({ type: 'peer-message', text: '   ', fromName: 'session C', kind: 'peer' });
      w.send({ type: 'peer-message', text: 'while you work', fromName: 'session C', kind: 'peer' });
      w.send({ type: 'peer-message', text: 'task "nightly" (job-1): done.', fromName: 'Background Work · nightly', kind: 'notification' });
      await w.until(() => w.all('peer_result').length >= 3, 5000, 'two answers while busy');
      const [, r2, r3] = w.all('peer_result');
      ck('BUSY ⇒ queued in the wrapper: a peer\'s message answers {ok:true, mode:\'queued\'} (no steer claim — a person\'s message is its own turn)', r2.ok === true && r2.mode === 'queued' && !('steer' in r2), r2);
      ck('…a NOTIFICATION while busy answers mode \'queued\' + steer:\'unsupported\' — agy folds nothing into a running turn (the hub logs it and charges it)', r3.ok === true && r3.mode === 'queued' && r3.steer === 'unsupported', r3);
      await w.until(() => w.all('prompt_end').length === 4, 10000, 'the queue drained');
      ck('…both run AFTER the running turn, in order, each a turn of its own', JSON.stringify(lines(w)) === JSON.stringify(['Message from session B:\nhello from B', 'a slow one', 'Message from session C:\nwhile you work', 'Message from Background Work · nightly:\ntask "nightly" (job-1): done.']), lines(w));
      ck('A frame with NO text is nothing: no answer, no card, no line (three answers and three peer cards for four frames)', w.all('peer_result').length === 3 && w.all('user', (r) => r.peer).length === 3, { answers: w.all('peer_result').length, cards: w.all('user', (r) => r.peer).length });
    } finally { await w.stop(); }
  };
  const restarting = async () => {
    const w = startWrapper({ env: { AGY_STUB_EXIT_DELAY_MS: '600' } });
    try {
      await w.until(() => w.find('session'), 8000, 'session');
      w.send({ type: 'set-model', model: 'gemini-3.8-flash-medium' });
      await w.until(() => w.find('notice', (r) => r.noticeKind === 'command_applied'), 5000, 'the restart begins');
      w.send({ type: 'peer-message', text: 'during the restart', fromName: 'session D', kind: 'peer' });
      const r = await w.until(() => w.find('peer_result'), 5000, 'the answer');
      const startsAtAnswer = starts(w);
      await w.until(() => lines(w).length === 1, 8000, 'delivered after the restart');
      const log = w.stub();
      const second = log.findIndex((x, i) => x.argv && x.argv.includes('--input-format') && log.slice(0, i).some((y) => y.argv && y.argv.includes('--input-format')));
      ck('WHILE AGY RESTARTS ⇒ {ok:true, mode:\'queued\'} answered before the new process is up, and the words reach the NEW agy (after its start, on the new model) — never a silent drop, never a false "turn"',
        r.ok === true && r.mode === 'queued' && startsAtAnswer === 1 && second >= 0 && log.findIndex((x) => x.stdin) > second && log[second].argv.includes('gemini-3.8-flash-medium') && lines(w)[0] === 'Message from session D:\nduring the restart', { r, startsAtAnswer, second, lines: lines(w) });
    } finally { await w.stop(); }
  };
  const notSignedIn = async () => {
    const w = startWrapper({ env: { AGY_STUB_AUTH: 'wait', AGY_STUB_AUTH_WAIT_MS: '20000' } });
    try {
      w.send({ type: 'peer-message', text: 'are you there, agy', fromName: 'session E', kind: 'peer' });
      await w.until(() => w.exited, 6000, 'the wrapper exit');
      const rs = w.all('peer_result');
      ck('NOT SIGNED IN ⇒ ONE honest answer {ok:false} carrying the words + the sender (the hub re-stashes them) and its reason; agy never got the line', rs.length === 1 && rs[0].ok === false && rs[0].text === 'are you there, agy' && rs[0].fromName === 'session E' && /not signed in|exited/.test(rs[0].reason) && !w.stub().some((x) => x.stdin), rs);
    } finally { await w.stop(); }
  };
  const exitWithQueue = async () => {
    const w = startWrapper({ env: { AGY_STUB_SLOW_MS: '3000' } });
    try {
      await w.until(() => w.find('session'), 8000, 'session');
      w.send({ type: 'chat-input', text: 'a slow one', msgId: 'x1' });
      await w.until(() => w.find('prompt_start'), 5000, 'busy');
      w.send({ type: 'peer-message', text: 'still waiting', fromName: 'session F', kind: 'peer' });
      await w.until(() => w.find('peer_result', (r) => r.mode === 'queued'), 5000, 'queued');
      w.child.kill('SIGTERM');
      await w.until(() => w.exited, 6000, 'the wrapper exit');
      const back = w.all('peer_result', (r) => r.ok === false);
      ck('THE QUEUE DIES WITH THE PROCESS ⇒ its peer goes back with its words (ok:false, NO mode — about an earlier frame: the settle must not take it for the last one)', back.length === 1 && back[0].text === 'still waiting' && back[0].fromName === 'session F' && !('mode' in back[0]) && /ended before it was delivered/.test(back[0].reason), back);
    } finally { await w.stop(); }
  };
  await Promise.all([idleBusy(), restarting(), notSignedIn(), exitWithQueue()].map((p) => p.catch((e) => ck('a ⑭ leg threw', false, e.message))));
  // THE CENSUS of the answers (the settle's rule is the PRODUCER's — test-spend-paths §5b's twin): an answer ABOUT the
  // frame just written carries a mode (ok:true 'turn'|'queued', ok:false 'undelivered'); one about an EARLIER frame (Stop,
  // remove, a drain that failed, the exit) is the one peerBack emitter, mode-less
  const src = fs.readFileSync(WRAPPER, 'utf8');
  const em = [...src.matchAll(/record\('peer_result', \{([^}]*)\}/g)].map((m) => m[1]);
  const back = em.filter((e) => /q\.opts\.peerText/.test(e));
  ck('THE CENSUS: four peer_result emitters — ok:true carries mode, the two own-frame ok:false carry mode \'undelivered\' + text, and ONE mode-less peerBack (every earlier-frame site calls it)',
    em.length === 4 && em.filter((e) => /ok: true/.test(e)).length === 1 && em.filter((e) => /ok: true/.test(e)).every((e) => /mode: ran\.mode/.test(e))
    && em.filter((e) => /ok: false, mode: 'undelivered'/.test(e) && /\btext\b/.test(e)).length === 2 && back.length === 1 && !/mode:/.test(back[0])
    && (src.match(/peerBack\(/g) || []).length === 7, em);   // its definition + Stop, remove, the drain (then / catch), agy's exit, the wrapper's exit
  return R;
})();

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
    ok('a chat line that IS one of agy\'s own commands (/usage) is refused by the wrapper, by name', /\/usage was not sent/.test(n.text), n.text);
    w.send({ type: 'chat-input', text: 'still here', msgId: 's2' });
    await w.until(() => w.find('prompt_end'), 8000, 'the next turn');
    ok('…it never reached agy, and the conversation lives on (the next turn answers)', !w.stub().some((x) => x.stdin && /"\/usage"/.test(x.stdin)) && w.exited === null && /still here/.test(w.text()));
  } finally { await w.stop(); }
  // RED control: the same wrapper with the refusal removed lets the line through — agy ends the session (exit 2)
  const src = fs.readFileSync(WRAPPER, 'utf8');
  const cut = "      if (slashRefused(n.text)) return;\n";
  const mutated = path.join(MUTBIN, 'agy-wrapper-noslash.js');
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
  const mutated = path.join(MUTBIN, 'agy-wrapper-nodeny.js');
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
  const mutated = path.join(MUTBIN, 'agy-wrapper-leak.js');
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
  const mutated = path.join(MUTBIN, 'agy-wrapper-statdir.js');
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
  // the context prefix is a real HTTP round trip (lane stop-refills-composer ⑥c holds it to land a Stop inside it)
  const http = await import('node:http');
  let holdCtx = false, held = 0;
  const srv = http.createServer((req, res) => { if (req.url.startsWith('/api/agent/prompt-context')) { const hold = holdCtx; if (hold) held++; setTimeout(() => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"context":""}'); }, hold ? 500 : 0); return; } res.writeHead(404); res.end(); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const w = startWrapper({ env: { AGY_STUB_SLOW_MS: '1500', VIBESPACE_API: `http://127.0.0.1:${srv.address().port}`, VIBESPACE_SESSION_TOKEN: 'vsst_test' } });
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
    const stopLine = w.find('notice', (r) => r.noticeKind === 'stop-restart');
    ok('Stop ends the running turn as cancelled and drops the queue (the owner\'s law, 2026-09-07 — every harness)', end.stopReason === 'cancelled' && stopLine && w.find('queue_op_result', (r) => r.op === 'remove' && r.reason === 'stopped' && r.msg_id === 'q1'), end);
    // lane agy-harness-fixes (bug 4) SAID the drop in the Stop line («send again what should still run»); since lane
    // stop-refills-composer the words come BACK (the queue_dropped record below → the composer + the client's toast), so
    // the line no longer tells the person to re-send what is already back in their box
    ok('…and the Stop line no longer says «send again» — the dropped words come back into the composer instead (the record below)', !/send again|not sent/.test(stopLine.text) && /Stopped — Antigravity has no cancel in its stream/.test(stopLine.text), stopLine.text);
    await w.until(() => w.stub().filter((x) => x.argv && x.argv.includes('--input-format')).length >= 2, 8000, 'restart after stop');
    const starts = w.stub().filter((x) => x.argv && x.argv.includes('--input-format')).map((x) => x.argv);
    ok('…by restarting agy on the same conversation (its stream has no cancel)', starts[1].includes('--conversation') && starts[1][starts[1].indexOf('--conversation') + 1] === ses.sessionId);
    // STOP PUTS THE DROPPED QUEUE BACK (lane stop-refills-composer): ONE record of the person's rows, the CURRENT text
    const drops = w.all('queue_dropped');
    const iStop = w.records.findLastIndex((r) => r.type === 'acp' && r.kind === 'queue_op_result' && r.reason === 'stopped');
    const iDrop = w.records.findIndex((r) => r.type === 'acp' && r.kind === 'queue_dropped');
    const iEmpty = w.records.findIndex((r, i) => i > iStop && r.type === 'acp' && r.kind === 'queue_changed' && r.items.length === 0);
    ok('…and what Stop dropped comes back: ONE queue_dropped carrying [{msgId q1, the EDITED text}] (q2 was removed before Stop), a `${pid}-${n}` dropId', drops.length === 1 && drops[0].items.length === 1 && drops[0].items[0].msgId === 'q1' && drops[0].items[0].text === 'queued one, edited' && /^\d+-\d+$/.test(drops[0].dropId) && drops[0].by === 'stop' && drops[0].omitted === 0, drops);
    ok('…in ORDER: the per-item stopped results → queue_dropped → the emptied republish', iStop > 0 && iDrop > iStop && iEmpty > iDrop, { iStop, iDrop, iEmpty });
    // ⑥c a Stop inside the context-prefix await cancels a prompt agy never received — and puts it back
    const stdinBefore = w.stub().filter((x) => x.stdin).length, endsBefore = w.all('prompt_end').length;
    holdCtx = true;
    w.send({ type: 'chat-input', text: 'claimed, never sent', msgId: 'u1' });
    await w.until(() => held >= 1, 5000, 'the prompt-context request in flight');
    w.send({ type: 'interrupt' });
    const end2 = await w.until(() => w.all('prompt_end')[endsBefore], 5000, 'the cancelled claim');
    holdCtx = false;
    const drops2 = w.all('queue_dropped');
    ok('⑥c Stop inside the context-prefix await: the claimed prompt ends cancelled and NOTHING more reached agy\'s stdin (lane stop-refills-composer)', end2.stopReason === 'cancelled' && w.stub().filter((x) => x.stdin).length === stdinBefore, { end2, stdin: w.stub().filter((x) => x.stdin).length - stdinBefore });
    ok('⑥c …and that UNDISPATCHED prompt comes back: ONE more queue_dropped, its row the prompt\'s text and msgId', drops2.length === 2 && drops2[1].items.length === 1 && drops2[1].items[0].text === 'claimed, never sent' && drops2[1].items[0].msgId === 'u1' && drops2[1].dropId !== drops2[0].dropId, drops2);
    w.send({ type: 'interrupt' });
    w.send({ type: 'queue-resync' });
    const nQc = w.all('queue_changed').length;
    await w.until(() => w.all('queue_changed').length > nQc, 5000, 'the resync after an idle Stop');
    ok('⑥c a Stop with nothing of the person\'s queued (idle) writes NO queue_dropped', w.all('queue_dropped').length === 2);
  } finally { await w.stop(); srv.close(); }
}

console.log('— ⑥b THE STEER (lane agy-harness-fixes, bug 4): a queued message jumps the queue — the running turn stops, it runs next');
{
  const lines = (w) => w.stub().filter((x) => x.stdin).map((x) => JSON.parse(x.stdin).message.content);
  const starts = (w) => w.stub().filter((x) => x.argv && x.argv.includes('--input-format')).map((x) => x.argv);
  const w = startWrapper({ env: { AGY_STUB_SLOW_MS: '2500' } });
  try {
    const ses = await w.until(() => w.find('session'), 8000, 'session');
    w.send({ type: 'chat-input', text: 'a slow one', msgId: 'v0' });
    await w.until(() => w.find('prompt_start'), 5000, 'start');
    w.send({ type: 'chat-input', text: 'first queued', msgId: 'v1' });
    w.send({ type: 'chat-input', text: 'second queued', msgId: 'v2' });
    w.send({ type: 'chat-input', text: 'third queued', msgId: 'v3' });
    const q3 = await w.until(() => w.all('queue_changed').find((r) => r.items.length === 3), 5000, 'a queue of 3');
    const meta = JSON.parse(fs.readFileSync(path.join(w.dir, 's.json'), 'utf8'));
    ok('the wrapper serves steer: its queue publication and its caps advert name it (the strip shows ⚡ for agy)', q3.verbs.includes('steer') && meta.caps.queueVerbs.includes('steer'), { verbs: q3.verbs, caps: meta.caps.queueVerbs });
    w.send({ type: 'queue-op', op: 'steer-all' });
    w.send({ type: 'queue-op', op: 'steer', id: 'q-nope' });
    w.send({ type: 'queue-op', op: 'steer', id: q3.items[2].id });
    const res = await w.until(() => w.find('queue_op_result', (r) => r.op === 'steer' && r.ok), 5000, 'the steer');
    const head = w.all('queue_changed').find((r) => r.items.length === 3 && r.items[0].msgId === 'v3');
    ok('steer #3 ⇒ ok, and it is at the HEAD of the queue (#1, #2 behind it, in order)', res.msg_id === 'v3' && head && head.items.map((i) => i.msgId).join() === 'v3,v1,v2', head && head.items.map((i) => i.msgId));
    ok('steer-all stays refused (one message at a time); a steer of an id no longer queued says so', w.find('queue_op_result', (r) => r.op === 'steer-all' && r.reason === 'not-steerable') && w.find('queue_op_result', (r) => r.op === 'steer' && r.reason === 'gone'));
    const end = await w.until(() => w.find('prompt_end'), 5000, 'the stopped turn');
    const said = w.find('notice', (r) => r.noticeKind === 'steer-restart');
    ok('the running turn ENDS (cancelled) — agy takes no input mid-turn — and the line says why (what it did stays)', end.stopReason === 'cancelled' && said && /Steered/.test(said.text), { end, said: said && said.text });
    await w.until(() => lines(w).length >= 4, 20000, 'the queue drained');
    ok('…agy restarts on the SAME conversation and runs the steered message FIRST, then the rest in order', starts(w).length >= 2 && starts(w)[1].includes('--conversation') && starts(w)[1].includes(ses.sessionId) && lines(w).join(' | ') === 'a slow one | third queued | first queued | second queued', lines(w));
    ok('…nothing queued was lost or run twice: the queue ends empty, four turns started, three ended normally', w.all('queue_changed').pop().items.length === 0 && w.all('prompt_start').length === 4 && w.all('prompt_end', (r) => r.stopReason === 'end_turn').length === 3, w.all('prompt_end').map((r) => r.stopReason));
  } finally { await w.stop(); }
  // RED control: the pre-fix wrapper (no steer verb) refuses it — the message waits behind the running turn
  const src = fs.readFileSync(WRAPPER, 'utf8');
  const verbs = "const QUEUE_VERBS = ['remove', 'steer', 'reorder', 'edit'];";
  const mutated = path.join(MUTBIN, 'agy-wrapper-nosteer.js');
  fs.writeFileSync(mutated, src.replace(verbs, "const QUEUE_VERBS = ['remove', 'reorder', 'edit'];"));
  const m = startWrapper({ wrapper: mutated, env: { AGY_STUB_SLOW_MS: '1500' } });
  try {
    await m.until(() => m.find('session'), 8000, 'session');
    m.send({ type: 'chat-input', text: 'a slow one', msgId: 'r0' });
    await m.until(() => m.find('prompt_start'), 5000, 'start');
    m.send({ type: 'chat-input', text: 'jump me', msgId: 'r1' });
    const q = await m.until(() => m.all('queue_changed').find((r) => r.items.length === 1), 5000, 'queued');
    m.send({ type: 'queue-op', op: 'steer', id: q.items[0].id });
    const refused = await m.until(() => m.find('queue_op_result', (r) => r.op === 'steer'), 5000, 'refusal');
    ok('RED control: a wrapper copy without the steer verb (the pre-fix) refuses it «not-steerable» and the turn runs on — the ⑥b asserts see it', src.includes(verbs) && refused.ok === false && refused.reason === 'not-steerable' && !m.find('notice', (r) => r.noticeKind === 'steer-restart'));
  } finally { await m.stop(); }
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
    // lane agy-harness-fixes, bug 3: a PASTED picture reaches agy — written once under <cwd>/.vibespace-uploads/, its path
    // FIRST in the text (the composer's upload road); agy's stream still gets text only (another block ends it, exit 1)
    const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const pic = (data = PNG, media_type = 'image/png') => ({ type: 'image', source: { type: 'base64', media_type, data } });
    const sendBlocks = (content, msgId) => w.send({ type: 'chat-input', text: JSON.stringify({ type: 'user', message: { role: 'user', content } }), msgId });
    const agyLines = () => w.stub().filter((x) => x.stdin).map((x) => JSON.parse(x.stdin).message.content);
    const upDir = path.join(w.dir, '.vibespace-uploads');
    const want = path.join(upDir, 'pasted-' + crypto.createHash('sha256').update(Buffer.from(PNG, 'base64')).digest('hex').slice(0, 16) + '.png');
    sendBlocks([pic(), { type: 'text', text: 'see this' }], 'i1');
    await w.until(() => w.all('prompt_end').length === 2, 8000, 'image turn');
    const l1 = agyLines().pop();
    ok('a pasted picture + words: the picture is written ONCE under <cwd>/.vibespace-uploads/ (its content hash, .png) and agy reads its absolute path FIRST, then the words — never dropped',
      l1 === `${want} see this` && fs.readFileSync(want).equals(Buffer.from(PNG, 'base64')) && !w.find('notice', (r) => r.noticeKind === 'unsupported') && w.find('user', (r) => r.msgId === 'i1')?.content[0].text === l1 && w.exited === null, { l1, want });
    ok('…the folder is the person\'s (0700, the file 0600) and a repo never sees it (a `*` .gitignore)', (fs.statSync(upDir).mode & 0o777) === 0o700 && (fs.statSync(want).mode & 0o777) === 0o600 && fs.readFileSync(path.join(upDir, '.gitignore'), 'utf8') === '*\n');
    sendBlocks([pic()], 'i2');
    await w.until(() => w.all('prompt_end').length === 3, 8000, 'picture-only turn');
    ok('a message that is ONLY a picture is sent (its text is the path) — the same picture again is the same file, not a second one', agyLines().pop() === want && fs.readdirSync(upDir).filter((n) => n.startsWith('pasted-')).length === 1);
    sendBlocks([pic('JVBERi0xLjQK', 'application/pdf'), pic(), { type: 'text', text: 'and this' }], 'i3');
    await w.until(() => w.all('prompt_end').length === 4, 8000, 'one bad picture');
    const bad = w.find('notice', (r) => r.noticeKind === 'unsupported');
    ok('a picture that cannot be written (not an image type) is the ONLY thing said as not sent — the rest of the message goes', agyLines().pop() === `${want} and this` && bad && /1 attached picture was not sent/.test(bad.text), bad);
    const readOr = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
    const journal = readOr(path.join(w.dir, 's.buf')) + JSON.stringify(w.records) + w.stderr + readOr(path.join(w.dir, 'agy-wrapper.log'));
    ok('no picture byte in the journal, the stdout records, stderr or the wrapper log (only its path)', !journal.includes(PNG.slice(0, 40)) && !journal.includes('JVBERi0xLjQK'));
    ok('agy\'s stream got TEXT only, every line (another block type would end it)', agyLines().every((c) => typeof c === 'string'));
  } finally { await w.stop(); }
}
{
  // RED control (lane agy-harness-fixes): the pre-fix wrapper DROPPED every picture — a picture-only message never reached agy
  const src = fs.readFileSync(WRAPPER, 'utf8');
  const keep = "      if (b.type === 'image') { images++; try { const fp = quotePath(savePicture(b)); if (!paths.includes(fp)) paths.push(fp); } catch (e) { failed.push(e && e.message ? e.message : String(e)); } }\n";
  const mutated = path.join(MUTBIN, 'agy-wrapper-nopicture.js');
  fs.writeFileSync(mutated, src.replace(keep, "      if (b.type === 'image') { images++; failed.push('text only'); }\n"));
  const m = startWrapper({ wrapper: mutated });
  try {
    await m.until(() => m.find('session'), 8000, 'session');
    m.send({ type: 'chat-input', text: JSON.stringify({ type: 'user', message: { content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' } }] } }), msgId: 'r1' });
    await m.until(() => m.find('notice', (r) => r.noticeKind === 'unsupported'), 8000, 'the dropped picture');
    await sleep(600);
    ok('RED control: a wrapper copy that drops pictures (the pre-fix) sends a picture-only message NOWHERE — the ⑦ asserts see it', src.includes(keep) && !m.find('prompt_start') && !m.stub().some((x) => x.stdin));
  } finally { await m.stop(); }
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
  ok('a SUCCESS with no turn in a shape no signed-in capture pinned is "unparsed" — the one pinned shape is the 1.4.3 capture\'s (usage-groups; its parser legs: test-antigravity-usage)', U.KNOWN_SHAPES.length === 1 && U.KNOWN_SHAPES[0].id === 'usage-groups' && U.judgeUsageAnswer({ code: 0, stdout: JSON.stringify(clean) }).verdict === 'unparsed');
  const billed = [{ ...clean, num_turns: 1 }, { ...clean, conversation_id: 'c-1' }, { ...clean, usage: { input_tokens: 0, output_tokens: 3 } }, { event: 'result', result: { ...clean, num_turns: 2 } }];
  ok('THE STOP RULE: any sign of a turn — num_turns, a conversation, one token, the stream-json result shape — is turn-started', billed.every((e) => U.judgeUsageAnswer({ code: 0, stdout: JSON.stringify(e) }).verdict === 'turn-started'), billed.map((e) => U.judgeUsageAnswer({ code: 0, stdout: JSON.stringify(e) }).verdict));
  const src = fs.readFileSync(path.join(REPO, 'src/harnesses/antigravity-usage.js'), 'utf8');
  const cut = '  if (signs.length) return { verdict: \'turn-started\'';
  const mutated = path.join(ROOT, 'antigravity-usage-noturn.js');
  fs.writeFileSync(mutated, src.replace(cut, '  if (false && signs.length) return { verdict: \'turn-started\'').replace("require('../quota-model.js')", `require(${JSON.stringify(path.join(REPO, 'src/quota-model.js'))})`)); // the copy lives in scratch: its one relative require made absolute
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

console.log('— ⑪ THE EXECUTABLE (lane antigravity-spawn-argv): argv[4] is agy itself, anything else is refused BY NAME');
{
  // the owner's 2.369.334 hub handed `/usr/bin/env K=V … agy` here: `env --input-format …` ⇒ exit 125, «see agy-wrapper.log»
  const run = (cmd, wrapper = WRAPPER) => new Promise((res) => {
    const dir = fs.mkdtempSync(path.join(ROOT, 'x-')), log = path.join(dir, 'stub.log');
    const c = spawn(process.execPath, [wrapper, path.join(dir, 's.buf'), path.join(dir, 's.json'), cmd, '--extra'], { env: { ...CLEAN_ENV, AGY_WEBUI_CWD: dir, AGY_WEBUI_BACKEND: 'antigravity', AGY_STUB_LOG: log }, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = ''; c.stdout.on('data', (d) => { out += d; });
    const t = setTimeout(() => { try { c.kill('SIGKILL'); } catch { } }, 8000);
    c.on('exit', (code) => { clearTimeout(t); const recs = out.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      res({ code, errors: recs.filter((r) => r.kind === 'notice' && r.level === 'error').map((r) => r.text), ran: fs.existsSync(log) }); });
    try { c.stdin.end(); } catch { }
  });
  const unresolved = (c) => `agy-wrapper: the command is not an executable: ${c} — the hub's Antigravity path is unresolved; reinstall agy or set ANTIGRAVITY_CMD`;
  const plain = path.join(ROOT, 'not-executable'); fs.writeFileSync(plain, '#!/bin/sh\n', { mode: 0o644 });
  const cases = [['agy', unresolved('agy')], ['/nope/agy', unresolved('/nope/agy')], [plain, unresolved(plain)], [ROOT, unresolved(ROOT)],
    ['/usr/bin/env', "agy-wrapper: the command is /usr/bin/env, a launcher, not agy — the hub put an env prefix where the executable goes (agy's flags would land in front of it); update VibeSpace"]];
  for (const [cmd, words] of cases) {
    const r = await run(cmd);
    ok(`argv[4] = ${cmd === plain ? '<a file that is not executable>' : cmd === ROOT ? '<a directory>' : cmd}: exit 1, the ONE error line names it, nothing spawned`, r.code === 1 && r.errors.length === 1 && r.errors[0] === words && !r.ran, r);
  }
  // RED copy: the refusal cut ⇒ /usr/bin/env runs and the session says only the exit code (the owner's 125)
  const src = fs.readFileSync(WRAPPER, 'utf8'), cut = "  if (refused) { notice('error', refused, 'spawn-failed'); finalizeExit(1); return; }\n";
  const mutated = path.join(MUTBIN, 'agy-wrapper-no-refusal.js');
  fs.writeFileSync(mutated, src.replace(cut, ''));
  const m = await run('/usr/bin/env', mutated);
  ok('RED copy (the refusal cut): /usr/bin/env runs and the session says only «exit code 125 — see agy-wrapper.log»', src.split(cut).length === 2 && m.code === 125 && m.errors.some((t) => /exited \(exit code 125\) — see agy-wrapper\.log/.test(t)), m);
}

console.log('— ⑫ THE SUBAGENT CARD (lane agy-subagent-cards): the invoke_subagent row read from the agy store; the tail only while a sub works');
{
  const FIXS = path.join(REPO, 'scripts/fixtures/agy-store');
  const P = '9c0f0000-0000-4000-8000-0000000000a1', S = '49120000-0000-4000-8000-0000000000b1', SG = '.system_generated';
  const { AcpMessageManager } = require(path.join(REPO, 'src/acp-message-manager.js'));
  // a HOME whose agy store is the fixture (copied in SHAPE from the owner's): the sub's first `lines` steps on disk
  const mkStore = async (name, { lines = 5, transcript = true, db = false } = {}) => {
    const home = path.join(ROOT, name), store = path.join(home, '.gemini', 'antigravity-cli');
    fs.mkdirSync(store, { recursive: true });
    fs.cpSync(path.join(FIXS, 'brain'), path.join(store, 'brain'), { recursive: true });
    const t = path.join(store, 'brain', S, SG, 'logs', 'transcript.jsonl');
    const all = fs.readFileSync(t, 'utf8').split('\n').filter(Boolean);
    if (transcript) fs.writeFileSync(t, all.slice(0, lines).join('\n') + '\n');
    else fs.rmSync(path.dirname(t), { recursive: true, force: true });
    if (db) {
      const fx = JSON.parse(fs.readFileSync(path.join(FIXS, 'db-steps.json'), 'utf8'));
      const { DatabaseSync } = await import('node:sqlite');
      fs.mkdirSync(path.join(store, 'conversations'), { recursive: true });
      const d = new DatabaseSync(path.join(store, 'conversations', `${S}.db`));
      d.exec('CREATE TABLE steps (idx integer PRIMARY KEY, step_type integer NOT NULL DEFAULT 0, status integer NOT NULL DEFAULT 0, metadata blob, render_info blob, step_payload blob)');
      const ins = d.prepare('INSERT INTO steps VALUES (?, ?, ?, ?, ?, ?)');
      const hex = (h) => (h ? Buffer.from(h, 'hex') : null);
      for (const r of fx.rows) ins.run(r.idx, r.step_type, r.status, hex(r.metadata), hex(r.render_info), hex(r.step_payload));
      d.close();
    }
    return { home, store, t, rest: all.slice(lines) };
  };
  const wlog = (w) => { try { return fs.readFileSync(path.join(w.dir, 'agy-wrapper.log'), 'utf8'); } catch { return ''; } };
  const env = (home, more = {}) => ({ HOME: home, AGY_WEBUI_RESUME_ID: P, AGY_STUB_SPAWN_STEP: '6', AGY_STUB_SUB_ROLE: '示例评审专家', AGY_WEBUI_SUB_TAIL_MS: '200', AGY_WEBUI_SUB_LOOK_MS: '3000', ...more });
  const subKind = (r) => (r.rec.kind === 'update' ? r.rec.update.sessionUpdate : r.rec.kind);

  // the four legs are independent wrappers on their own stores: run them TOGETHER (the suite stays under the fast
  // tier's 10 s), each collecting its checks, printed in this order once all four end
  const legs = [];
  const leg = (fn) => { const out = []; legs.push(fn((n, c, e) => { out.push([n, c, e]); }).then(() => out, (err) => [...out, [`leg threw: ${err && err.message}`, false]])); };
  leg(async (ok) => {
    const A = await mkStore('agy-sub-a');
    const w = startWrapper({ env: env(A.home) });
    try {
      await w.until(() => w.find('session'), 8000, 'session');
      w.send({ type: 'chat-input', text: 'run a tool first', msgId: 'sa0' });
      await w.until(() => w.find('prompt_end'), 8000, 'a plain turn');
      ok('a conversation that starts no subagent never runs the tail (nothing reads the store)', !/subagent tail on/.test(wlog(w)) && !w.find('subagent') && !w.find('sub'), wlog(w).slice(-300));
      w.send({ type: 'chat-input', text: 'please start a subagent', msgId: 'sa1' });
      const card = await w.until(() => w.find('subagent', (r) => r.status === 'running'), 8000, 'the running card');
      ok('the invoke_subagent row → THE CARD: its sub found by the TASK\'s spawning step (6), the role, type, the task the parent gave, running', card.toolCallId === `${P}:6` && card.subId === S && card.role === '示例评审专家' && card.typeName === 'self' && card.spawnStep === 6 && /按 100 分制打分/.test(card.task) && card.home === A.home && card.state === 'SUBAGENT_STATE_ALIVE', card);
      await w.until(() => w.all('sub').length >= 6, 8000, 'the sub\'s first steps');
      const first = w.all('sub');
      ok('…its own steps ride `sub` records under its id (the task bubble, a read, a command — ACP records the virtual session draws)', first.every((r) => r.subId === S && r.toolCallId === `${P}:6`) && subKind(first[0]) === 'user' && first.some((r) => r.rec.update?.title === 'run_command'), first.map(subKind));
      ok('the row itself: a tool_call, then its OWN end on the subagent_info update (the owner\'s two rows never got one) — and no «started 1 subagent» line beside the card',
        w.find('update', (r) => r.update?.sessionUpdate === 'tool_call' && r.update.toolCallId === `${P}:6` && r.update.title === 'invoke_subagent') && w.find('update', (r) => r.update?.sessionUpdate === 'tool_call_update' && r.update.toolCallId === `${P}:6` && r.update.status === 'completed') && !w.find('notice', (r) => r.noticeKind === 'subagents'));
      ok('THE TAIL is on while the sub works', /subagent tail on \(every 200 ms\)/.test(wlog(w)) && !/subagent tail off/.test(wlog(w)), wlog(w).slice(-400));
      const cards = w.all('subagent').length;
      // the sub finishes: its last five steps + its answer land in the store
      fs.appendFileSync(A.t, A.rest.join('\n') + '\n');
      fs.copyFileSync(path.join(FIXS, 'answer.json'), path.join(A.store, 'brain', P, SG, 'messages', 'c0000000-0000-4000-8000-0000000000c3.json'));
      const done = await w.until(() => w.find('subagent', (r) => r.status === 'completed'), 8000, 'the finished card');
      ok('the sub answered (its last step a final planner response) ⇒ the card ends: completed, its answer, the elapsed time (task delivered 14:32:32.119 → last step 14:33:26 = 53 881 ms), the file it wrote, ten steps', /88\/100/.test(done.result) && done.elapsedMs === 53881 && done.files.join() === '/home/u/workspace/示例项目/report.md' && done.steps === 10, done);
      ok('five more steps re-sent the card ONCE (its change: completed) — a step alone never does (the task + answer are the journal\'s largest texts)', w.all('subagent').length === cards + 1, { before: cards, after: w.all('subagent').length });
      await w.until(() => /subagent tail off/.test(wlog(w)), 4000, 'the tail off');
      const n = w.records.length;
      await sleep(500);
      ok('…and the tail STOPS — nothing more is read or written (≥ 4 tail periods, no record)', w.records.length === n && w.all('sub').length === 13, { after: w.records.length - n, subs: w.all('sub').length });
      const mm = new AcpMessageManager('p');
      mm.convertHistory(w.records.filter((r) => r.type === 'acp'));
      const cm = mm.messages.filter((m) => m.taskInfo?.subId === S);
      ok('the ACP normalizer draws ONE card (toolName Agent; taskInfo names the sub, its status, elapsed, files; the answer is its output) — no parent card for a sub step',
        cm.length === 1 && cm[0].toolName === 'Agent' && cm[0].status === 'complete' && cm[0].taskInfo.status === 'completed' && cm[0].taskInfo.elapsedMs === 53881 && /88\/100/.test(cm[0].content[0].output) && cm[0].content[0].input.prompt.includes('按 100 分制打分') && !mm.messages.some((m) => /wc -l/.test(JSON.stringify(m.content))),
        mm.messages.map((m) => `${m.role}:${m.toolName || ''}:${m.status}`));
      const vm = new AcpMessageManager(`sub-${S}`);
      vm.convertHistory(w.all('sub').map((r) => r.rec));
      const tools = vm.messages.filter((m) => m.role === 'tool');
      ok('the virtual session sub-<id> draws the sub\'s own timeline: the task bubble (from «Parent Agent»), four tool cards all closed, its last words',
        vm.messages[0].role === 'user' && vm.messages[0].peerFrom === 'Parent Agent' && tools.length === 4 && tools.every((m) => m.status === 'complete') && /sent my evaluation/.test(JSON.stringify(vm.messages[vm.messages.length - 1].content)),
        vm.messages.map((m) => `${m.role}:${m.toolName || ''}:${m.status}`));
    } finally { await w.stop(); }

  });
  leg(async (ok) => {
    // an OLDER agy: no subagent_info, a store that names no sub ⇒ no card, no error; the look ends within its window
    const B = path.join(ROOT, 'agy-sub-b'); fs.mkdirSync(B, { recursive: true });
    const w2 = startWrapper({ env: env(B, { AGY_WEBUI_SUB_LOOK_MS: '1000' }) });
    try {
      await w2.until(() => w2.find('session'), 8000, 'session');
      w2.send({ type: 'chat-input', text: 'start a subagent the old way', msgId: 'sb1' });
      await w2.until(() => w2.find('prompt_end'), 8000, 'the turn');
      await w2.until(() => /subagent tail off/.test(wlog(w2)), 5000, 'the look window ends');
      const oldRow = w2.find('update', (r) => r.update?.sessionUpdate === 'tool_call' && r.update.title === 'invoke_subagent');
      ok('an older agy (no subagent_info) whose store names no sub ⇒ NO card and NO error: the row ends as a row, the tail looks ≤ its window and stops',
        !!oldRow && !w2.find('subagent') && !w2.find('sub') && !w2.find('notice', (r) => r.level === 'error') && w2.find('update', (r) => r.update?.sessionUpdate === 'tool_call_update' && r.update.toolCallId === oldRow.update.toolCallId && r.update.status === 'completed'),
        w2.records.map((r) => r.kind));
    } finally { await w2.stop(); }

  });
  leg(async (ok) => {
    // an agy that writes NO transcript: the timeline comes from its db (the protobuf rows, read-only)
    const C = await mkStore('agy-sub-c', { transcript: false, db: true });
    const w3 = startWrapper({ env: env(C.home) });
    try {
      await w3.until(() => w3.find('session'), 8000, 'session');
      w3.send({ type: 'chat-input', text: 'please start a subagent', msgId: 'sc1' });
      const fin = await w3.until(() => w3.find('subagent', (r) => r.status === 'completed'), 8000, 'the db-read card');
      const kinds = w3.all('sub').map(subKind);
      ok('no transcript ⇒ the sub\'s DB rows are its timeline (node:sqlite, read-only): the task, read_file calls, results, the final text — and the card ends on the final row',
        fin.steps === 8 && kinds[0] === 'user' && w3.all('sub').some((r) => r.rec.update?.title === 'read_file') && kinds.includes('tool_call_update') && kinds[kinds.length - 1] === 'agent_message_chunk', { steps: fin.steps, kinds });
    } finally { await w3.stop(); }

  });
  leg(async (ok) => {
    // RED control: a copy whose tick never stops the tail keeps reading after the sub ended (the «stops» leg can go red)
    const src = fs.readFileSync(WRAPPER, 'utf8');
    const cut = "  if (!looking && ![...subs.values()].some((s) => !s.done)) stopSubTail();\n";
    const mutated = path.join(MUTBIN, 'agy-wrapper-tail-forever.js');
    fs.writeFileSync(mutated, src.replace(cut, ''));
    const D = await mkStore('agy-sub-d', { lines: 10 });
    fs.copyFileSync(path.join(FIXS, 'answer.json'), path.join(D.store, 'brain', P, SG, 'messages', 'c0000000-0000-4000-8000-0000000000c3.json'));
    const m = startWrapper({ wrapper: mutated, env: env(D.home) });
    try {
      await m.until(() => m.find('session'), 8000, 'session');
      m.send({ type: 'chat-input', text: 'please start a subagent', msgId: 'sd1' });
      await m.until(() => m.find('subagent', (r) => r.status === 'completed'), 8000, 'the card');
      await sleep(800);
      ok('RED control: a copy without the stop keeps its tail on after the sub ended (no «tail off») — the leg above can go red', src.includes(cut) && /subagent tail on/.test(wlog(m)) && !/subagent tail off/.test(wlog(m)), wlog(m).slice(-300));
    } finally { await m.stop(); }
  });
  for (const out of await Promise.all(legs)) for (const [n, c, e] of out) ok(n, c, e);
}

console.log('— ⑬ THE TURN\'S USAGE (lane agy-status-bar-facts; ⑫ is lane agy-subagent-cards\'): one `usage` record per turn, agy\'s transcript read through ONE gate');
{
  // the fake agy speaks the MEASURED semantics: result.usage = the conversation's running sum of every model call, and
  // (AGY_STUB_TRANSCRIPT=1) each step is a row of <HOME>/.gemini/antigravity-cli/brain/<conversation>/…/transcript.jsonl
  const home = path.join(ROOT, 'usage-home');
  fs.mkdirSync(home, { recursive: true });
  const txOf = (cid) => path.join(home, '.gemini', 'antigravity-cli', 'brain', cid, '.system_generated', 'logs', 'transcript.jsonl');
  const sums = (cid) => fs.readFileSync(txOf(cid), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.input_tokens != null)
    .reduce((a, r) => ({ input: a.input + r.input_tokens, cacheRead: a.cacheRead + r.cache_read_tokens, output: a.output + r.output_tokens }), { input: 0, cacheRead: 0, output: 0 });
  const w = startWrapper({ env: { HOME: home, AGY_STUB_TRANSCRIPT: '1', AGY_WEBUI_MODEL: 'gemini-4-argon-high' } });
  let cid = null;
  try {
    cid = (await w.until(() => w.find('session'), 8000, 'session')).sessionId;
    w.send({ type: 'chat-input', text: 'hello', msgId: 'u1' });
    const u1 = await w.until(() => w.find('usage'), 8000, 'usage 1');
    w.send({ type: 'chat-input', text: 'please write the summary', msgId: 'u2' });
    await w.until(() => w.all('usage').length === 2, 8000, 'usage 2');
    const u2 = w.all('usage')[1];
    const s2 = sums(cid);
    ok('ONE `usage` record per turn, after its prompt_end (the transcript read is async; the turn is never held)', w.all('usage').length === 2 && w.records.indexOf(u1) > w.records.indexOf(w.find('prompt_end')), w.records.map((r) => r.kind));
    ok('total = agy\'s running total, which IS the transcript\'s sum over every call of every turn (the measured fact, reproduced)', u2.total.input === s2.input && u2.total.cacheRead === s2.cacheRead && u2.total.output === s2.output && u2.total.total === s2.input + s2.output, { total: u2.total, s2 });
    ok('turn = this turn\'s calls only (2: the write + the reply), thinking from the delta of the two totals; turn 1 had no earlier total ⇒ thinking null', u2.turn.calls === 2 && u2.turn.input + u1.total.input === u2.total.input && u2.turn.thinking === u2.total.thinking - u1.total.thinking && u1.turn.calls === 1 && u1.turn.thinking === null, { u1: u1.turn, u2: u2.turn });
    ok('last = the turn\'s LAST model call (the live context): its cache read is the previous call\'s context — never the turn\'s sum', u2.last.cacheRead > 0 && u2.last.input + u2.last.cacheRead < u2.total.input + u2.total.cacheRead && u2.last.input + u2.last.cacheRead > u1.last.input + u1.last.cacheRead, { u1: u1.last, u2: u2.last });
    const side = await w.until(() => { try { const m = JSON.parse(fs.readFileSync(path.join(w.dir, 's.json'), 'utf8')); return m.usage?.total_tokens === u2.total.total ? m : null; } catch { return null; } }, 3000, 'the sidecar').catch(() => null); // persisted on its 200 ms timer
    ok('the model agy named (init) + the result\'s own time ride the record; the sidecar keeps its copy (meta.usage)', u2.model === 'gemini-4-argon-high' && u2.modelFrom === 'agy' && u2.durationSeconds === 0.3 && !!side, { model: u2.model, modelFrom: u2.modelFrom, d: u2.durationSeconds, side: side?.usage });
    const mm = new AcpMessageManager('sid-u'); const ops = []; mm.onOp((o) => ops.push(o)); for (const r of w.records) mm.processLive(r);
    const meta = ops.filter((o) => o.subtype === 'usage').pop();
    ok('…and the shared ACP normalizer turns it into the usage meta the bar reads (last call = context + cache, totals = the odometer)', meta && meta.data.input_tokens === u2.last.input && meta.data.cache_read_input_tokens === u2.last.cacheRead && meta.data.totals.total_tokens === u2.total.total, meta?.data);
    ok('…and the write_file call is an Artifacts row through the descriptor\'s reader', w.all('update', (r) => r.update.sessionUpdate === 'tool_call' && r.update.title === 'write_file').flatMap((r) => g.artifactsOf(r)).map((o) => o.path).join() === path.join(w.dir, 'reports', 'summary.md'));
  } finally { await w.stop(); }
  // THE GATE: the conversation's brain dir is a LINK out of agy's store (to a file of huge, wrong counts) ⇒ never read
  const linkTurn = async (wrapper, tag) => {
    const cid2 = crypto.randomUUID(), outside = path.join(ROOT, 'usage-outside-' + tag);
    const bdir = path.join(home, '.gemini', 'antigravity-cli', 'brain', cid2);
    fs.rmSync(outside, { recursive: true, force: true });
    fs.mkdirSync(path.join(outside, '.system_generated', 'logs'), { recursive: true });
    fs.writeFileSync(path.join(outside, '.system_generated', 'logs', 'transcript.jsonl'), JSON.stringify({ step_index: 0, type: 'USER_INPUT' }) + '\n' + JSON.stringify({ step_index: 1, type: 'PLANNER_RESPONSE', input_tokens: 777777, cache_read_tokens: 0, output_tokens: 1 }) + '\n');
    fs.symlinkSync(outside, bdir);
    const x = startWrapper({ wrapper, env: { HOME: home, AGY_WEBUI_RESUME_ID: cid2, AGY_WEBUI_MODEL: 'gemini-4-argon-high' } });
    try { await x.until(() => x.find('session'), 8000, 'session'); x.send({ type: 'chat-input', text: 'hello', msgId: 'g1' }); return await x.until(() => x.find('usage'), 8000, 'usage'); }
    finally { await x.stop(); try { fs.unlinkSync(bdir); } catch { } }
  };
  // RED copy: the realpath check cut (O_NOFOLLOW alone guards only the file's own name) — written into a scratch tree whose
  // src/ is the repo's, so the copy's require of src/agy-turn-usage.js resolves
  const src = fs.readFileSync(WRAPPER, 'utf8'), cut = '    if (!rf.startsWith(rs + path.sep)) return null;\n';
  const red = path.join(ROOT, 'red-gate', 'data', 'bin', 'agy-wrapper.js');
  fs.mkdirSync(path.dirname(red), { recursive: true });
  try { fs.symlinkSync(path.join(REPO, 'src'), path.join(ROOT, 'red-gate', 'src')); } catch { }
  fs.writeFileSync(red, src.replace(cut, ''));
  const [viaLink, leaked] = await Promise.all([linkTurn(WRAPPER, 'real'), linkTurn(red, 'red')]); // independent: run together (the suite's 10 s tier)
  ok('THE GATE: a brain dir that LINKS out of agy\'s store is never read — `last` null, the stream\'s total still recorded', viaLink.last === null && viaLink.total.total > 0 && viaLink.total.input !== 777777, viaLink);
  ok('RED copy (the realpath check cut): the link is followed and its counts become the context (777 777 tokens)', src.split(cut).length === 2 && leaked.last && leaked.last.input === 777777, leaked);
}

console.log('— ⑭ THE LIVE LANE (lane agy-peer-wake): the peer-message frame idle / busy / empty / restarting / not signed in / at exit, the advert, the census');
for (const [n, c, e] of await peerLane) ok(n, c, e);

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
