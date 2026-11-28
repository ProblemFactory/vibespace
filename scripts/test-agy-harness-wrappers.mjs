#!/usr/bin/env node
// B-7e49 (lane bl-vault, 主开发 r2347): THE HEAVY TWIN of scripts/test-agy-harness.mjs — the legs that drive the REAL
// data/bin/agy-wrapper.js through a chat over the fake agy, moved VERBATIM by the tier rule (a leg that starts a real child is heavy):
// ② – ⑧ (the chat turn, the slash refusal, the soft-deny card, the restarts, Stop and the steer, resume / errors / pictures /
// stderr, the auth gate) and ⑫ – ⑲ (the subagent card and the store gate, the turn's usage and set-model, the live lane, the
// fixes). The descriptor table and the in-process legs stay fast there; both files judge themselves at their end against
// ONE table of legs (scripts/lib/agy-harness-legs.mjs): each its own half, disjoint, whole (208 marks in sum). The header
// below describes the whole suite as it stood before the split.
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
// ⑮–⑲ lane agy-harness-fixes-2 (the owner 2026-10-25 — five linked bugs; started early, run beside the rest, each leg with
//   its RED copy): ⑮ THE MODE THROUGH THE RING — a chip-picked mode + a 1.2 MB reply: the journal's head (the `session`
//   record) is cut, the sidecar keeps meta.modes, chatStatus answers the mode AND its list (the base reader: an empty list);
//   ⑯ THE RESUME — the session's sidecar deleted (the hub's teardown), a new wrapper on the same conversation with no stated
//   mode runs in the conversation's own (--dangerously-skip-permissions), a stated mode wins (the base: agy's default);
//   ⑰ «required» is no tool: jetski's «a tool required the "command" permission» names `command` on the card and the retry;
//   ⑱ NO FALSE CARD on a nudge turn whose tool steps all completed, nor under bypass — a step never completed still gets
//   it; ⑲ A STOPPED PROCESS IS NEVER AN ERROR — steer / Stop: the old agy's «interrupted» raises nothing, while one from the
//   CURRENT process (no restart) is still said
// Run: node scripts/test-agy-harness-wrappers.mjs (heavy; its fast half: node scripts/test-agy-harness.mjs)
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratchDir, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { LEGS, FILES, trackLegs, judge, controls } from './lib/agy-harness-legs.mjs';   // B-7e49 (主开发 r2347): the ONE table of this suite's legs and its twin's
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const WRAPPER = path.join(REPO, 'data/bin/agy-wrapper.js');
const STUB = path.join(REPO, 'scripts/fixtures/antigravity-agy');
const FX = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/antigravity-cli-1.4.3.json'), 'utf8'));
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 500) : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(`ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`, false); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ROOT = scratchDir('agy-harness-wrappers');
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
// a wrapper COPY lives at <root>/data/bin beside <root>/src → the repo's src, so its require of src/agy-store.js resolves
// (lane agy-subagent-cards: the wrapper's store parser is the shared module)
const MUTBIN = path.join(ROOT, 'data', 'bin');
fs.mkdirSync(MUTBIN, { recursive: true });
try { fs.symlinkSync(path.join(REPO, 'src'), path.join(ROOT, 'src')); } catch { }
const CLEAN_ENV = { ...process.env };
// THE CALLER'S OWN CONVERSATION IS NOT THIS SUITE'S (int402, 2026-11-14): a suite started from inside an agent
// conversation inherits the hub's injected CLAUDE_WEBUI_* names; the wrapper reads CLAUDE_WEBUI_SESSION_ID to keep a picture
// with its conversation when the cwd is temporary, so with the name left in, the picture leg wrote under data/chat-attachments/
// of the CALLER's conversation and was red. Every name the hub injects is dropped; a leg that wants one sets it itself.
for (const k of Object.keys(CLEAN_ENV)) if (/^VIBESPACE_|^ACP_WEBUI_|^AGY_|^CLAUDE_CODE_|^CLAUDE_WEBUI_/.test(k)) delete CLEAN_ENV[k];

const H = require(path.join(REPO, 'src/harnesses/index.js'));
const g = H.get('antigravity');
const { capsOf } = require(path.join(REPO, 'src/backend-caps.js'));
const { HARNESS_SETTINGS } = require(path.join(REPO, 'src/harness-settings.js'));
const { AgyAdapter, agyFlags, AGY_MODES, AGY_EFFORTS } = require(path.join(REPO, 'src/adapters/agy.js'));
const { AcpMessageManager } = require(path.join(REPO, 'src/acp-message-manager.js'));
const HE = require(path.join(REPO, 'src/harness-env.js'));
const AS = require(path.join(REPO, 'src/agy-store.js'));   // the timing pair (2.369.405): the card a tail tick settles on, by the store's own cardOf

const LEG = trackLegs(console);   // B-7e49: each printed mark counted under its section's heading (judged at ⓣ)

let stubSeq = 0;
// B-518e: the agy-error notice as ⑦ and ⑦b read it (one reader — ⑦b's control guards ⑦'s own read)
const noticeSaid = (w) => w.find('notice', (r) => r.noticeKind === 'agy-error' && /model unavailable/.test(r.text));
function startWrapper({ env = {}, wrapper = WRAPPER, dir: inDir = null } = {}) {
  // `dir`: a second wrapper in the SAME buffers dir (lane agy-harness-fixes-2 ⑯ — a Resume beside the earlier session's files)
  const dir = inDir || fs.mkdtempSync(path.join(ROOT, 'w-'));
  const buf = path.join(dir, 's.buf'), meta = path.join(dir, 's.json'), log = path.join(dir, inDir ? `stub-${++stubSeq}.log` : 'stub.log');
  const child = spawn(process.execPath, [wrapper, buf, meta, STUB], { env: { ...CLEAN_ENV, AGY_WEBUI_CWD: dir, AGY_WEBUI_BACKEND: 'antigravity', AGY_STUB_LOG: log, AGY_WEBUI_AUTH_GRACE_MS: '400', ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  const h = { child, dir, records: [], stderr: '', exited: null, log };
  let lb = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => { lb += d; let i; while ((i = lb.indexOf('\n')) !== -1) { const l = lb.slice(0, i).trim(); lb = lb.slice(i + 1); if (!l) continue; try { const r = JSON.parse(l); if (r.type !== '_stdin_ack') h.records.push(r); } catch { } } });
  child.stderr.setEncoding('utf8'); child.stderr.on('data', (d) => { h.stderr += d; });
  child.on('exit', (code) => { h.exited = { code, at: Date.now() }; });
  child.on('close', () => { h.closed = true; });   // B-7e49: every stdio stream ended — the records are whole
  h.send = (o) => { try { child.stdin.write(JSON.stringify(o) + '\n'); } catch { } };
  h.find = (kind, pred = () => true) => h.records.find((r) => r.type === 'acp' && r.kind === kind && pred(r));
  h.all = (kind, pred = () => true) => h.records.filter((r) => r.type === 'acp' && r.kind === kind && pred(r));
  h.stub = () => { try { return fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
  h.until = async (pred, ms = 8000, what = 'condition') => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = pred(); if (v) return v; await sleep(20); } throw new Error(`timeout: ${what} (records ${h.records.map((r) => r.kind).join(',')}; ${h.stderr.slice(-300)})`); };
  h.text = () => h.all('update', (r) => r.update?.sessionUpdate === 'agent_message_chunk').map((r) => r.update.content.text).join('');
  // B-7e49 (bl-vault's slice, r2173): the stop waits for the child's own CLOSE (it exited and every stream ended: the records it
  // wrote are read) — never longer than the 150 ms it slept, never past the end it waits for; 39 stops slept 5.9 s of the suite
  h.stop = async () => { try { child.kill('SIGTERM'); } catch { } const t0 = Date.now(); while (!h.closed && Date.now() - t0 < 150) await sleep(5); };
  return h;
}

// ⑦c B-bba6 runs as a LANE beside the sections below (as ⑭ does — the suite's time stays its own): its wrappers start here,
// two batches one after the other; its asserts are printed in order at ⑦c. EVERY PLACEMENT IS AN ORDER THE LEG HOLDS (gate
// files the stand-in waits on, the wrapper's own log lines waited for) — never a window that load could close.
const bba6Lane = (async () => {
  const src = fs.readFileSync(WRAPPER, 'utf8');
  const mutant = (name, anchor, to) => { const f = path.join(MUTBIN, `agy-wrapper-bba6-${name}.js`); fs.writeFileSync(f, anchored(src, anchor, to, `B-bba6 ${name}`)); return f; };
  const NO_WAIT = mutant('nowait', '    if (errEnded) { childExited(code, signal); return; }\n    log(`agy exited', '    { childExited(code, signal); return; }\n    log(`agy exited');
  const NO_BOUND = mutant('nobound', '    t = setTimeout(go, ERR_TAIL_MS);\n', '    t = null;\n');
  const NO_END_FLUSH = mutant('noendflush', "  child.stderr.on('end', () => { errEnded = true; log('agy stderr ended'); flushErr(); });\n", "  child.stderr.on('end', () => { errEnded = true; log('agy stderr ended'); });\n");
  const NO_LATE = mutant('nolate', '  if (stoppedChild(from)) { lateError(line, from); return; }', '  if (stoppedChild(from)) { return; }');
  const NO_TURN_GUARD = mutant('noturnguard', '  if (!turnOpenOn.has(old)) lateErrorOf.set(old, servedModel());', '  lateErrorOf.set(old, servedModel());');
  const NO_EPIPE = mutant('noepipe', "  child.stdin.on('error', (err) => log(", '  void (0, (err) => log(');
  const NO_RUN_GUARD = mutant('norunguard', '    if (!child && !restarting && !shuttingDown && !childEnding) startChild();', '    if (!child && !restarting && !shuttingDown) startChild();');
  const NO_ONCE = mutant('noonce', '  lateErrorOf.delete(from);\n', '');
  const SERVED_LATE = mutant('servedlate', "notice('error', `Antigravity: ${said}`, 'agy-error', served ? { servedModel: served } : {});", "notice('error', `Antigravity: ${said}`, 'agy-error', servedField());");
  const NO_ENDING_MARK = mutant('noendingmark', '    childEnding = mine;\n    if (errEnded) { childExited(code, signal); return; }\n', '    if (errEnded) { childExited(code, signal); return; }\n');
  const NO_INIT_META = mutant('noinitmeta', '    scheduleMeta();   // the init\'s facts are WRITTEN by the init', '    void 0;   // the init\'s facts are WRITTEN by the init');
  const NO_QUIET = mutant('noquiet', '  if (!said || /interrupt|cancel/i.test(said)) return;', '  if (!said) return;');
  const wlog = (w) => { try { return fs.readFileSync(path.join(w.dir, 'agy-wrapper.log'), 'utf8'); } catch { return ''; } };
  let seq = 0;
  const gateFile = (what) => path.join(ROOT, `bba6-${what}-${++seq}`);
  // (1) one turn whose agy says its last words with no newline and exits 1. end-first: stderr closed, the exit held until the
  // wrapper LOGGED the pipe's end; held: a grandchild holds the pipe until the leg releases it (after the wrapper ended — or,
  // for the unbounded control, after it was seen still running)
  const lastWords = async ({ order = 'end-first', text = 'this will noeol', wrapper = WRAPPER, stillAt = false }) => {
    const exitGate = gateFile('exit'), release = gateFile('release');
    const w = startWrapper({ wrapper, env: { AGY_STUB_NOEOL_ORDER: order, AGY_STUB_EXIT_GATE: exitGate, AGY_STUB_HOLDER_RELEASE: release } });
    try {
      await w.until(() => w.find('session'), 8000, 'session');
      w.send({ type: 'chat-input', text, msgId: `ne${seq}` });
      let endLogged = null, heldAtEnd = null;
      if (order === 'end-first') {
        endLogged = await w.until(() => /agy stderr ended/.test(wlog(w)), 8000, 'the wrapper read the pipe\'s end').then(() => true, () => false);   // the stand-in exits only once the leg opens its gate (or the wrapper ends it — a sign-in)
        fs.writeFileSync(exitGate, '');
        await w.until(() => w.exited, 8000, 'the wrapper ends').catch(() => null);
      } else if (stillAt) {
        await w.until(() => w.stub().some((x) => x.holder), 8000, 'the grandchild holds the pipe');
        await w.until(() => w.exited, 1500, 'the wrapper ends while held').catch(() => null);
        heldAtEnd = !!w.exited;
        fs.writeFileSync(release, '');
        await w.until(() => w.exited, 8000, 'the wrapper ends once released').catch(() => null);
      } else {
        await w.until(() => w.exited, 8000, 'the wrapper ends while the pipe is held').catch(() => null);
        const hp = (w.stub().find((x) => x.holder) || {}).holder;
        heldAtEnd = !!w.exited && !!hp && (() => { try { process.kill(hp, 0); return true; } catch { return false; } })();   // the grandchild still alive, holding the pipe
        fs.writeFileSync(release, '');
      }
      const notices = w.all('notice').map((r) => r.noticeKind);
      return { endLogged, heldAtEnd, exited: w.exited, notices, last: w.find('notice', (r) => r.noticeKind === 'agy-error' && /quota exhausted, said last/.test(r.text)), end: w.find('prompt_end'), cards: w.all('permission_request').length, skipped: w.find('notice', (r) => r.noticeKind === 'soft-deny-ended'), holder: (w.stub().find((x) => x.holder) || {}).holder || null };
    } finally { fs.writeFileSync(release, ''); fs.writeFileSync(exitGate, ''); await w.stop(); }
  };
  // (2) a turn that fails, its RESULT held by a gate until the leg's switch / Stop has been taken in, its AGY_ERROR line (twice)
  // held by another until the turn's end AND the restart were read
  const lateErr = async ({ wrapper = WRAPPER, stop = false, short = null }) => {
    const resultGate = gateFile('result'), errGate = gateFile('err');
    const w = startWrapper({ wrapper, env: { AGY_STUB_RESULT_GATE: resultGate, AGY_STUB_ERR_GATE: errGate, AGY_STUB_ERR_TWICE: '1', AGY_STUB_EXIT_DELAY_MS: '200', AGY_WEBUI_MODEL: 'claude-sonnet-4-6', ...(short ? { AGY_STUB_ERR_SHORT: short } : {}) } });
    const starts = () => w.stub().filter((x) => x.argv && x.argv.includes('--input-format')).length;
    try {
      await w.until(() => w.find('session'), 8000, 'session');
      w.send({ type: 'chat-input', text: 'a turn that will faillate', msgId: `le${seq}` });
      await w.until(() => w.find('prompt_start'), 8000, 'the turn starts');
      if (stop) { w.send({ type: 'interrupt' }); await w.until(() => w.find('prompt_end'), 8000, 'the Stop ends the turn'); }
      else { w.send({ type: 'set-model', model: 'gemini-3.8-flash-medium' }); await w.until(() => w.find('notice', (r) => r.noticeKind === 'command_applied'), 8000, 'the switch waits for the turn'); }
      fs.writeFileSync(resultGate, '');   // now the old process answers its turn
      const end = await w.until(() => w.find('prompt_end'), 8000, 'the turn ends');
      await w.until(() => /restart \((model gemini-3\.8-flash-medium|stop)\)/.test(wlog(w)), 8000, 'the restart begins').catch(() => null);
      const held = { said: w.all('notice', (r) => r.noticeKind === 'agy-error').length > 0, starts: starts(), restarting: /restart \((model gemini-3\.8-flash-medium|stop)\)/.test(wlog(w)) };
      fs.writeFileSync(errGate, '');   // now the old process writes its line (twice)
      await w.until(() => (wlog(w).match(/\[stderr\] AGY_ERROR/g) || []).length >= 2, 8000, 'both late lines read').catch(() => null);
      await w.until(() => starts() >= 2, 8000, 'the next process').catch(() => null);
      const next = w.stub().filter((x) => x.argv && x.argv.includes('--input-format'))[1] || null;
      return { end, held, read: (wlog(w).match(/\[stderr\] AGY_ERROR/g) || []).length, said: w.all('notice', (r) => r.noticeKind === 'agy-error'), next: next && next.argv.join(' '), endAt: w.records.indexOf(end), saidAt: w.records.findIndex((r) => r.type === 'acp' && r.kind === 'notice' && r.noticeKind === 'agy-error') };
    } finally { fs.writeFileSync(resultGate, ''); fs.writeFileSync(errGate, ''); await w.stop(); }
  };
  const [ef, held, signin, skipped, cNoEnd, cNoWait, cNoBound] = await Promise.all([
    lastWords({}), lastWords({ order: 'held' }), lastWords({ text: 'this will noeol signin' }), lastWords({ text: 'this will noeol skipped' }),
    lastWords({ wrapper: NO_END_FLUSH }), lastWords({ order: 'held', wrapper: NO_WAIT }), lastWords({ order: 'held', wrapper: NO_BOUND, stillAt: true })]);
  // the grandchildren end once released (each leg releases its own); one still alive now is ended — its pid from the stub log, its command line checked first
  for (const pid of [held.holder, cNoWait.holder, cNoBound.holder]) { try { if (pid && fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes('setInterval')) process.kill(pid, 'SIGKILL'); } catch { } }
  // (3) a CRASH mid-turn while a model switch waits for the turn's end: the turn ends error, the wrapper ends — and starts no second agy
  // (counted by the wrapper's own synchronous «spawned … --input-format» log lines, written before its exit)
  const crash = async (wrapper = WRAPPER) => {
    const resultGate = gateFile('crash');
    const w = startWrapper({ wrapper, env: { AGY_STUB_RESULT_GATE: resultGate } });
    try {
      await w.until(() => w.find('session'), 8000, 'session');
      w.send({ type: 'chat-input', text: 'a turn that will crash', msgId: `cr${seq}` });
      await w.until(() => w.find('prompt_start'), 8000, 'the turn starts');
      w.send({ type: 'set-model', model: 'gemini-3.8-flash-medium' });
      await w.until(() => w.find('notice', (r) => r.noticeKind === 'command_applied'), 8000, 'the switch waits for the turn');
      fs.writeFileSync(resultGate, '');
      await w.until(() => w.exited, 8000, 'the wrapper ends').catch(() => null);
      return { exited: w.exited, end: w.find('prompt_end'), spawned: (wlog(w).match(/spawned [^\n]*--input-format/g) || []).length };
    } finally { fs.writeFileSync(resultGate, ''); await w.stop(); }
  };
  const [cr, cLate] = await Promise.all([crash(), crash(NO_ENDING_MARK)]);
  // (4) THE CURE OF THE CURE (主开发 04:23Z): a write to a process that closed its stdin (EPIPE) is logged, never a crash; a person's
  // line typed INSIDE the exit wait starts no agy and comes back into the box (by: 'exit'); a late line read after the NEXT process
  // started is filed under the model of the process that wrote it
  const deaf = async (wrapper = WRAPPER) => {
    const w = startWrapper({ wrapper });
    try {
      await w.until(() => w.find('session'), 8000, 'session');
      w.send({ type: 'chat-input', text: 'this turn goes deaf', msgId: `df${++seq}` });
      await w.until(() => w.find('prompt_end'), 8000, 'the deaf turn ends');
      w.send({ type: 'chat-input', text: 'and this one meets a closed pipe', msgId: `df${++seq}` });
      await w.until(() => /agy stdin: EPIPE/.test(wlog(w)) || w.exited, 8000, 'the write meets the closed pipe').catch(() => null);
      return { epipe: /agy stdin: EPIPE/.test(wlog(w)), exited: w.exited };
    } finally { await w.stop(); }
  };
  const typedInWait = async (wrapper = WRAPPER) => {
    const release = gateFile('release');
    const w = startWrapper({ wrapper, env: { AGY_STUB_NOEOL_ORDER: 'held', AGY_STUB_HOLDER_RELEASE: release, AGY_WEBUI_ERR_TAIL_MS: '8000' } });
    try {
      await w.until(() => w.find('session'), 8000, 'session');
      w.send({ type: 'chat-input', text: 'this will noeol', msgId: `tw${++seq}` });
      await w.until(() => /agy exited \(1\) — its last stderr words are read first/.test(wlog(w)), 8000, 'the exit wait begins');
      w.send({ type: 'chat-input', text: 'typed while it ends', msgId: 'tw-late' });
      await w.until(() => w.find('queued_input', (r) => r.msg_id === 'tw-late'), 8000, 'the late line queued');
      fs.writeFileSync(release, '');
      await w.until(() => w.exited, 8000, 'the wrapper ends').catch(() => null);
      return { dropped: w.find('queue_dropped'), spawned: (wlog(w).match(/spawned [^\n]*--input-format/g) || []).length, exited: w.exited };
    } finally { fs.writeFileSync(release, ''); await w.stop(); }
  };
  const lateServed = async (wrapper = WRAPPER, stall = 0) => {   // `stall`: the RESTARTED stand-in held asleep before its init (ckpt61 hosted red: a node start on a loaded runner)
    const resultGate = gateFile('result'), release = gateFile('late');
    const w = startWrapper({ wrapper, env: { AGY_STUB_RESULT_GATE: resultGate, AGY_STUB_LATE_RELEASE: release, AGY_WEBUI_MODEL: 'claude-sonnet-4-6', ...(stall ? { AGY_STUB_RESTART_STALL_MS: String(stall) } : {}) } });
    const metaOf = () => { try { return JSON.parse(fs.readFileSync(path.join(w.dir, 's.json'), 'utf8')); } catch { return null; } };
    try {
      await w.until(() => w.find('session'), 8000, 'session');
      w.send({ type: 'chat-input', text: 'a turn that will faillate', msgId: `ls${++seq}` });
      await w.until(() => w.find('prompt_start'), 8000, 'the turn starts');
      w.send({ type: 'set-model', model: 'gemini-3.8-flash-medium' });
      await w.until(() => w.find('notice', (r) => r.noticeKind === 'command_applied'), 8000, 'the switch waits');
      fs.writeFileSync(resultGate, '');
      await w.until(() => metaOf()?.agy?.model === 'gemini-3.8-flash-medium', 8000, 'the NEXT process started and named its model')
        .catch((e) => { const spawned = (wlog(w).match(/spawned [^\n]*--input-format[^\n]* pid=\d+/g) || []).map((l) => l.replace(/^.* pid=/, 'pid ')); throw new Error(`${e.message} — the fact waited for: the meta's agy.model = gemini-3.8-flash-medium (the meta names ${JSON.stringify(metaOf()?.agy?.model ?? null)}); the processes spawned: ${spawned.join(', ') || 'none'}`); });
      fs.writeFileSync(release, '');   // only now the old process's grandchild writes the late line on the old pipe
      const n = await w.until(() => w.find('notice', (r) => r.noticeKind === 'agy-error'), 8000, 'the late notice').catch(() => null);
      return { served: n ? (n.servedModel || null) : undefined, text: n && n.text };
    } finally { fs.writeFileSync(resultGate, ''); fs.writeFileSync(release, ''); await w.stop(); }
  };
  const [df, cDf, tw, cTw, ls, cLs, lsSlow, cLsSlow] = await Promise.all([deaf(), deaf(NO_EPIPE), typedInWait(), typedInWait(NO_RUN_GUARD), lateServed(), lateServed(SERVED_LATE), lateServed(WRAPPER, 2000), lateServed(NO_INIT_META, 2000).then((r) => ({ red: false, r }), (e) => ({ red: true, error: String((e && e.message) || e) }))]);
  const [sw, st, quiet, cNoLate, cNoGuard, cNoQuiet] = await Promise.all([lateErr({}), lateErr({ stop: true }), lateErr({ short: 'interrupted' }), lateErr({ wrapper: NO_LATE }), lateErr({ wrapper: NO_TURN_GUARD, stop: true }), lateErr({ wrapper: NO_QUIET, short: 'interrupted' })]);
  const cOnce = await lateErr({ wrapper: NO_ONCE });
  return { ef, held, signin, skipped, cNoEnd, cNoWait, cNoBound, sw, st, quiet, cNoLate, cNoGuard, cNoQuiet, cr, cLate, df, cDf, tw, cTw, ls, cLs, lsSlow, cLsSlow, cOnce };
})();
bba6Lane.catch(() => { });   // a throw (an anchor gone) is raised where ⑦c awaits it, by name

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

// ⑮–⑲ (lane agy-harness-fixes-2) run TOGETHER with the sections below; their asserts are printed at the end
const fixes2 = (async () => {
  const R = [];
  const ck = (n, c, e) => R.push([n, c, e]);
  const src = fs.readFileSync(WRAPPER, 'utf8');
  const mutant = (name, cut, put) => { if (src.split(cut).length !== 2) throw new Error(`ANCHOR GONE OR NOT UNIQUE (${src.split(cut).length - 1} times): ${JSON.stringify(String(cut).slice(0, 80))} — the control's anchor is not in the source — move it with the product line (B-0d3e)`); const f = path.join(MUTBIN, `agy-wrapper-${name}.js`); fs.writeFileSync(f, editAnchor(src, cut, put, "data/bin/agy-wrapper.js")); return f; };
  const starts = (w) => w.stub().filter((x) => x.argv && x.argv.includes('--input-format')).map((x) => x.argv);
  const agyLines = (w) => w.stub().filter((x) => x.stdin).map((x) => JSON.parse(x.stdin).message.content);
  const ended = async (w) => { await w.stop(); await w.until(() => w.exited, 5000, 'the wrapper exit').catch(() => null); }; // its finalize persists the files 500 ms after SIGTERM
  const wlog = (w) => { try { return fs.readFileSync(path.join(w.dir, 'agy-wrapper.log'), 'utf8'); } catch { return ''; } };
  const { AcpSessionMessages } = require(path.join(REPO, 'src/acp-message-manager.js'));
  const { createTranscriptService } = require(path.join(REPO, 'src/transcript-service.js'));
  // ⑯ RED, the base ROAD (B-952b: the status road now hands the live session's reader its id — before, it passed none): the
  // service whose readerFor builds the reader with no id, loaded once
  const tsSrc = fs.readFileSync(path.join(REPO, 'src/transcript-service.js'), 'utf8'), ROAD = 'createSessionMessages(sessionShape(r, session), liveIdOf(session))';
  const baseRoad = mutantCopies('agy-harness-road', REPO).load('src/transcript-service.js', anchored(tsSrc, ROAD, 'createSessionMessages(sessionShape(r, session))', 'base-road'), 'base-road');   // stale-pins: kept (the red control rebuilds the base road)
  const AgyReader = g.store.SessionMessages; // the agy descriptor's reader (AgySessionMessages over AcpSessionMessages)
  let baseReader = null; // ⑯ RED: the base wrapperMeta (the sidecar only by the caller's session id) — set in ⑮
  // ⑯ the HUB's consumer (src/server/stdout/acp-events.js) over the resumed wrapper's own stdout: what the creator's window is told
  const evSrc = fs.readFileSync(path.join(REPO, 'src/server/stdout/acp-events.js'), 'utf8');
  const NOTE = '            noteMode(msg);\n';
  const baseEvents = evSrc.split(NOTE).length === 3 ? mutantCopies('agy-harness-events', REPO).load('src/server/stdout/acp-events.js', editAnchor(evSrc, NOTE, '', "src/server/stdout/acp-events.js", 'join'), 'base-events') : null;
  const STRIP = ".trim().replace(DTACH_CLEAR_PREAMBLE, '').trim();\n";
  const noStrip = evSrc.split(STRIP).length === 2 ? mutantCopies('agy-harness-events', REPO).load('src/server/stdout/acp-events.js', editAnchor(evSrc, STRIP, '.trim();\n', "src/server/stdout/acp-events.js"), 'no-strip') : null;
  // lane hub-loop-stalls commit 2 round 2 (law B): the person's permission mode is written as a durable act and the ack
  // goes AFTER the write — so the hub's answer is read after the write settles (a microtask turn here: the stub writes at once)
  const hubOf = async (records, mod = require(path.join(REPO, 'src/server/stdout/acp-events.js'))) => {
    const S = { backend: 'antigravity', mode: 'chat', buffer: '', sockName: 'cw-x', _permissionMode: null }, told = [], metas = [];
    let onData = null;
    mod.create({ engine: { noteTurnEnd() { } }, noteHarnessModels() { }, deliverRef: null, permissionRulesRef: null })
      .attach(S, 's', { onData: (cb) => { onData = cb; } }, { feedLive() { }, broadcastToSession: (_s, _id, m) => told.push(m), broadcastActiveSessions() { }, readSessionMeta: () => ({}), writeSessionMeta: (_k, m) => metas.push(m), updateSessionTodos() { } });
    onData('\x1b[H\x1b[J' + records.map((r) => JSON.stringify(r)).join('\r\n') + '\r\n'); // what the hub's dtach client reads: the clear preamble, then CRLF lines
    await new Promise((r) => setImmediate(r));
    return { mode: S._permissionMode, acks: told.filter((m) => m.type === 'permission-mode-ack').map((m) => [m.ok, m.mode]), meta: metas.map((m) => m.permissionMode).filter(Boolean).pop() || null };
  };
  const statusOf = (Cls, dir) => new Cls({ buffer: fs.readFileSync(path.join(dir, 's.buf'), 'utf8') }, 's', { buffersDir: dir }).chatStatus();
  const FOUR = 'accept-edits,auto,plan,bypassPermissions';
  const http = await import('node:http');
  const reasons = new Map(); // session token → the stop-check nudge's reason (⑱)
  const srv = http.createServer((req, res) => {
    const tok = String(req.headers.authorization || '').replace(/^Bearer /, '');
    res.writeHead(200, { 'content-type': 'application/json' });
    if (req.url.startsWith('/api/agent/stop-check')) { const r = reasons.get(tok); reasons.delete(tok); res.end(JSON.stringify(r ? { block: true, reason: r } : { block: false })); return; }
    res.end('{"context":""}');
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const API = `http://127.0.0.1:${srv.address().port}`;

  // ⑮ + ⑯ — ONE conversation: its mode picked in the chip, a reply that pushes the journal past the 800 KB ring
  const ring = async () => {
    const a = startWrapper();
    const dir = a.dir;
    let cid = null;
    try {
      cid = (await a.until(() => a.find('session'), 8000, 'session')).sessionId;
      a.send({ type: 'set-mode', mode: 'bypassPermissions' });
      await a.until(() => starts(a).length >= 2, 8000, 'the mode restart');
      a.send({ type: 'chat-input', text: 'a bulk reply', msgId: 'b1' });
      await a.until(() => a.find('prompt_end'), 15000, 'the bulk turn');
      const cut = await a.until(() => { try { const b = fs.readFileSync(path.join(dir, 's.buf'), 'utf8'); return b.length > 700000 && b.includes('"kind":"prompt_end"') ? b : null; } catch { return null; } }, 6000, 'the persisted journal').catch(() => '');
      ck('⑮ the ring cut the journal\'s HEAD: the persisted journal (800 KB) has no `session` record and no `config` record — the mode + its values went with them',
        cut.length > 700000 && cut.length <= 800000 && !cut.includes('"kind":"session"') && !cut.includes('"kind":"config"') && a.find('session')?.modeValues?.join() === FOUR, { len: cut.length, session: cut.includes('"kind":"session"') });
      const side = await a.until(() => { try { const m = JSON.parse(fs.readFileSync(path.join(dir, 's.json'), 'utf8')); return m.modes?.currentModeId === 'bypassPermissions' ? m : null; } catch { return null; } }, 3000, 'the sidecar').catch(() => null);
      ck('⑮ …the SIDECAR keeps the mode outside the ring: agentMode + meta.modes {availableModes: the four, currentModeId} (was modes: null)',
        !!side && side.agentMode === 'bypassPermissions' && side.modes.availableModes.map((m) => m.id).join() === FOUR, side && { agentMode: side.agentMode, modes: side.modes });
      const st = statusOf(AcpSessionMessages, dir);
      ck('⑮ …chatStatus over the cut journal + that sidecar (the attach / a reload): the mode AND the four (the chip opens them)', st?.permissionMode === 'bypassPermissions' && st.permissionModes.join() === FOUR, st && { mode: st.permissionMode, modes: st.permissionModes });
      // RED (the base reader: the list from configOptions only — agy's sidecar has none) over the SAME files
      const amm = fs.readFileSync(path.join(REPO, 'src/acp-message-manager.js'), 'utf8');
      const NEW = '      permissionModes: st.permissionModes?.length ? st.permissionModes : sidecarModes(meta),\n';
      const OLD = "      permissionModes: st.permissionModes?.length ? st.permissionModes : asArray(meta?.configOptions).filter((o) => o && (o.category === 'mode' || o.id === 'mode')).flatMap((o) => flattenSelect(o).map((v) => String(v.value))),\n";
      const base = amm.split(NEW).length === 2 ? mutantCopies('agy-harness-ring', REPO).load('src/acp-message-manager.js', editAnchor(amm, NEW, OLD, "src/acp-message-manager.js"), 'base-list') : null;
      const bst = base ? statusOf(base.AcpSessionMessages, dir) : null;
      const WID = "    const wid = this._sessionId || this._session?._webuiId || null;\n";
      if (amm.split(WID).length === 2) baseReader = mutantCopies('agy-harness-wid', REPO).load('src/acp-message-manager.js', editAnchor(amm, WID, '    const wid = this._sessionId || null;\n', "src/acp-message-manager.js"), 'base-wid').AcpSessionMessages;
      ck('⑮ RED copy (the base reader): the label survives (meta.agentMode) but the list is EMPTY — the chip opened nothing', !!bst && bst.permissionMode === 'bypassPermissions' && bst.permissionModes.length === 0, bst && { mode: bst.permissionMode, modes: bst.permissionModes });
    } finally { await ended(a); }
    // the hub's teardown (src/server/session-stdout.js cleanupOnExit) deletes the session's journal + sidecar: a Resume is a NEW session
    const gone = () => { for (const f of ['s.json', 's.buf']) fs.rmSync(path.join(dir, f), { force: true }); };
    gone();
    const factFile = path.join(dir, 'agy-conversation-modes', `${cid}.json`);
    let fact = null; try { fact = JSON.parse(fs.readFileSync(factFile, 'utf8')); } catch { }
    ck('⑯ the durable fact outlives the session: <buffers>/agy-conversation-modes/<conversation>.json {mode} (0600, its dir 0700)',
      fact?.mode === 'bypassPermissions' && (fs.statSync(factFile).mode & 0o777) === 0o600 && (fs.statSync(path.dirname(factFile)).mode & 0o777) === 0o700, fact);
    const factText = fs.readFileSync(factFile, 'utf8');
    const resume = async (wrapper, at, env = {}) => {
      const b = startWrapper({ wrapper, dir: at, env: { AGY_WEBUI_RESUME_ID: cid, ...env } });
      try {
        await b.until(() => b.find('session'), 8000, 'session');
        const argv = await b.until(() => starts(b)[0], 8000, 'agy start');
        b.send({ type: 'chat-input', text: 'after the resume', msgId: 'r1' });
        await b.until(() => b.find('prompt_end'), 8000, 'the resumed turn');
        await b.until(() => { try { return JSON.parse(fs.readFileSync(path.join(at, 's.json'), 'utf8')).sessionId === cid && fs.readFileSync(path.join(at, 's.buf'), 'utf8').includes('"kind":"prompt_end"'); } catch { return false; } }, 4000, 'its sidecar + journal (persisted on their timers)').catch(() => null);
        // the Resume's own status road: the client's GET /api/session-messages?withStatus=1 → transcript-service.status(),
        // by CONVERSATION id, over the live session — whose hub journal may not hold the wrapper's boot records yet
        const route = async (Cls, TS = { createTranscriptService }) => TS.createTranscriptService({ activeSessions: new Map([['s', { backend: 'antigravity', backendSessionId: cid, buffer: '', _webuiId: 's' }]]), createSessionMessages: (sess, sid) => new Cls(sess, sid, { buffersDir: at }) })
          .status({ backend: 'antigravity', sessionId: cid, cwd: at }).then((x) => x.chatStatus).catch((e) => ({ err: e.message }));
        return { argv, text: b.text(), st: statusOf(AcpSessionMessages, at), said: b.find('notice', (r) => r.noticeKind === 'mode-resumed')?.text || null, routeSt: await route(AgyReader), routeBase: baseReader && baseRoad ? await route(baseReader, baseRoad) : undefined, routeRoad: baseReader ? await route(baseReader) : undefined, hub: await hubOf(b.records), hubBase: baseEvents ? await hubOf(b.records, baseEvents) : undefined, hubNoStrip: noStrip ? await hubOf(b.records, noStrip) : undefined, first: b.records[0]?.kind };
      } finally { await ended(b); }
    };
    const r = await resume(WRAPPER, dir);
    gone();
    ck('⑯ a RESUME with no stated mode runs in the conversation\'s OWN mode: agy started with --dangerously-skip-permissions on --conversation <it>, the reply under always-proceed',
      r.argv.includes('--dangerously-skip-permissions') && r.argv[r.argv.indexOf('--conversation') + 1] === cid && /always-proceed\): after the resume/.test(r.text), { argv: r.argv, text: r.text.slice(-80) });
    ck('⑯ …and the Resume\'s OWN status road says it: transcript-service.status() by conversation id, over the live session with an EMPTY hub journal ⇒ the sidecar (by the session\'s _webuiId): bypassPermissions + the four',
      r.routeSt?.permissionMode === 'bypassPermissions' && (r.routeSt.permissionModes || []).join() === FOUR, r.routeSt);
    ck('⑯ RED copy (the base reader on the base road: the sidecar by neither the session\'s _webuiId nor the caller\'s id — the road passed none before B-952b): null — the resumed chip said «default»', !!baseReader && !!baseRoad && r.routeBase === null, r.routeBase);
    ck('⑯ …and the ROAD alone (B-952b: readerFor hands the live session\'s reader its id): the base reader finds the sidecar by that id — bypassPermissions', !!baseReader && r.routeRoad?.permissionMode === 'bypassPermissions', r.routeRoad);
    ck('⑯ …and the HUB is told: acp-events over the resumed wrapper\'s stdout sets session._permissionMode, writes it to session-meta and tells the windows (permission-mode-ack {ok, bypassPermissions}) — the creator\'s chip, which no init card reaches',
      r.hub?.mode === 'bypassPermissions' && JSON.stringify(r.hub.acks) === JSON.stringify([[true, 'bypassPermissions']]) && r.hub.meta === 'bypassPermissions', r.hub);
    ck('⑯ RED copy (the base consumer: the record\'s mode is never read): no ack, the hub\'s mode stays null — the resumed window\'s chip said «default»', !!baseEvents && r.hubBase?.mode === null && r.hubBase.acks.length === 0, r.hubBase);
    ck('⑯ RED copy (dtach\'s clear preamble left on the line, the base reader): the FIRST record — a Resume\'s `session` record, the one carrying the mode — fails to parse, so the hub never hears the mode (heavy-measured: «\\e[H\\e[J{"ts"…"kind":"session"…})', !!noStrip && r.first === 'session' && r.hubNoStrip?.mode === null && r.hubNoStrip.acks.length === 0, { first: r.first, hub: r.hubNoStrip });
    ck('⑯ …its status says so (chatStatus → bypassPermissions + the four), and ONE line says why', r.st?.permissionMode === 'bypassPermissions' && r.st.permissionModes.join() === FOUR && /own mode: bypassPermissions \(no mode was asked/.test(r.said || ''), { st: r.st && [r.st.permissionMode, r.st.permissionModes], said: r.said });
    // RED copy (the base boot: AGY_WEBUI_MODE alone), in a copy of the buffers dir holding the same fact
    const redDir = fs.mkdtempSync(path.join(ROOT, 'w-'));
    fs.mkdirSync(path.join(redDir, 'agy-conversation-modes'), { recursive: true });
    fs.writeFileSync(path.join(redDir, 'agy-conversation-modes', `${cid}.json`), factText);
    const noAdopt = mutant('no-own-mode', '  const own = resumeId && !state.mode ? conversationMode(resumeId) : null;\n', '  const own = null;\n');
    const red = noAdopt ? await resume(noAdopt, redDir) : null;
    ck('⑯ RED copy (the base: the Resume reads AGY_WEBUI_MODE only): agy starts WITHOUT the bypass, the reply under request-review, the status «default» (mode \'\')',
      !!red && !red.argv.includes('--dangerously-skip-permissions') && /request-review\): after the resume/.test(red.text) && !(red.st?.permissionMode), red && { argv: red.argv, text: red.text.slice(-60), st: red.st && red.st.permissionMode }); // null status / '' ⇒ the chip's «default»
    const p = await resume(WRAPPER, dir, { AGY_WEBUI_MODE: 'plan' });
    let after = null; try { after = JSON.parse(fs.readFileSync(factFile, 'utf8')); } catch { }
    ck('⑯ a STATED mode wins (AGY_WEBUI_MODE=plan ⇒ --mode plan, no line) and is the conversation\'s from then on', p.argv.includes('--mode') && p.argv[p.argv.indexOf('--mode') + 1] === 'plan' && !p.argv.includes('--dangerously-skip-permissions') && !p.said && after?.mode === 'plan', { argv: p.argv, said: p.said, after });
    ck('⑯ the fact file takes only a conversation id (no path): the wrapper builds <dir>/<id>.json from [\\w-] alone', src.includes("const convModeFile = (id) => (typeof id === 'string' && /^[\\w-]{1,128}$/.test(id) ? path.join(CONV_MODES_DIR, id + '.json') : null);"));
  };

  // ⑰ «required» is no tool (bug 3): a user turn that left a tool step uncompleted, jetski's line ⇒ the card + the retry
  const required = async (wrapper) => {
    const w = startWrapper({ wrapper });
    try {
      await w.until(() => w.find('session'), 8000, 'session');
      w.send({ type: 'chat-input', text: 'quiet skipped', msgId: 'j1' });
      const card = await w.until(() => w.find('permission_request'), 8000, 'the card');
      w.send({ type: 'permission-response', sessionId: 's', requestId: card.requestId, approved: true, optionId: 'retry' });
      const retry = await w.until(() => agyLines(w).find((c) => /^The user allowed /.test(c)), 8000, 'the retry line');
      return { title: card.toolCall.title, tool: card.toolCall.rawInput.tool, notice: card.toolCall.rawInput.notice, retry };
    } finally { await ended(w); }
  };
  const OLD_TOOL = "  const m = /required the [“\"'`]([\\w.:-]+)[”\"'`] permission/i.exec(line) || /\\b([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\\b/.exec(line) || /\\b(?:tool|command)\\s+(?!required\\b)[“\"'`]?([\\w.:-]+)/i.exec(line);\n";
  const baseTool = mutant('tool-required', OLD_TOOL, "  const m = /\\b([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\\b/.exec(line) || /\\b(?:tool|command)\\s+[“\"'`]?([\\w.:-]+)/i.exec(line);\n");

  // ⑱ no false card (bug 4): the stop-check nudge turn — one tool step, completed, no text — and jetski's line after it
  const nudge = async (wrapper, reason, env = {}) => {
    const tok = `vsst_${crypto.randomUUID().slice(0, 8)}`;
    if (reason) reasons.set(tok, reason);
    const w = startWrapper({ wrapper, env: { VIBESPACE_API: API, VIBESPACE_SESSION_TOKEN: tok, ...env } });
    try {
      await w.until(() => w.find('session'), 8000, 'session');
      w.send({ type: 'chat-input', text: reason ? 'hello' : 'quiet skipped', msgId: 'n1' });
      await w.until(() => wlog(w).includes('[stderr] jetski: no output produced'), 8000, 'jetski\'s line');
      // B-e818 (the batcher: «:416 still sleeps 200 ms»): the wrapper DECIDES in the same call as the jetski line — a card record
      // (stdout, it lands after the log line) or «no soft-deny card: …» (the log) — wait on that decision, never a 200 ms sleep
      await w.until(() => w.all('permission_request').length > 0 || /no soft-deny card: /.test(wlog(w)), 8000, 'the card or its «no soft-deny card» line');
      return { cards: w.all('permission_request').map((r) => r.toolCall.title), nudged: agyLines(w).some((c) => /^<vibespace-reminder>/.test(c)), why: (/no soft-deny card: ([^\n]*)/.exec(wlog(w)) || [])[1] || null };
    } finally { await ended(w); }
  };
  const GUARD = "  if (nothing) { log(`no soft-deny card: ${nothing}`); return; }\n";
  const noGuard = mutant('nudge-card', GUARD, '');

  // ⑲ a stopped process is never an error (bug 5): agy prints result ERROR «interrupted» when the restart's SIGTERM lands
  const stopped = async (wrapper, how) => {
    const w = startWrapper({ wrapper, env: { AGY_STUB_SLOW_MS: '1500', AGY_STUB_SIGTERM_RESULT: '1' } });
    try {
      await w.until(() => w.find('session'), 8000, 'session');
      if (how === 'stray') {
        w.send({ type: 'chat-input', text: 'a stray one', msgId: 's1' });
        await w.until(() => w.find('prompt_end'), 8000, 'the turn');
        await w.until(() => w.find('notice', (r) => r.noticeKind === 'agent-error'), 3000, 'the stray result').catch(() => null);
        return { errors: w.all('notice', (r) => r.noticeKind === 'agent-error').map((r) => r.text), ends: w.all('prompt_end').map((r) => r.stopReason) };
      }
      w.send({ type: 'chat-input', text: 'a slow one', msgId: 's1' });
      await w.until(() => w.find('prompt_start'), 5000, 'start');
      if (how === 'steer') {
        w.send({ type: 'chat-input', text: 'steered next', msgId: 's2' });
        const q = await w.until(() => w.all('queue_changed').find((r) => r.items.length === 1), 5000, 'queued');
        w.send({ type: 'queue-op', op: 'steer', id: q.items[0].id });
        await w.until(() => w.all('prompt_end').length === 2, 10000, 'the steered turn');
      } else {
        w.send({ type: 'interrupt' });
        await w.until(() => starts(w).length >= 2, 8000, 'the restart');
      }
      // the old agy prints its «interrupted» (the stub's SIGTERM line) on its way out: wait for the wrapper to have judged it
      await w.until(() => wlog(w).includes("the stopped agy's result ignored") || w.find('notice', (r) => r.noticeKind === 'agent-error'), 4000, 'the old agy\'s result').catch(() => null);
      await sleep(150);
      return { errors: w.all('notice', (r) => r.noticeKind === 'agent-error').map((r) => r.text), ends: w.all('prompt_end').map((r) => r.stopReason), ignored: /the stopped agy's result ignored \(it was asked to stop\): ERROR — interrupted/.test(wlog(w)) };
    } finally { await ended(w); }
  };
  const STOP_GUARD = "    if (stoppedChild(from)) { log(`the stopped agy's result ignored (it was asked to stop): ${clip(r.status || '', 40)}${r.error ? ' — ' + clip(r.error, 200) : ''}`); return; }\n";
  const noStop = mutant('stopped-child', STOP_GUARD, '');

  const [, t, tb, n1, n2, n3, nr, s1, s2, s3, sr] = await Promise.all([
    ring().catch((e) => ck('⑮/⑯ ran', false, e.message)),
    required(WRAPPER).catch((e) => ({ err: e.message })), baseTool ? required(baseTool).catch((e) => ({ err: e.message })) : null,
    nudge(WRAPPER, 'Before you stop, run vibespace-status done quietly — quiet please'), nudge(WRAPPER, 'quiet skipped please'),
    nudge(WRAPPER, null, { AGY_WEBUI_MODE: 'bypassPermissions' }), noGuard ? nudge(noGuard, 'Before you stop, run vibespace-status done quietly — quiet please') : null,
    stopped(WRAPPER, 'steer').catch((e) => ({ err: e.message })), stopped(WRAPPER, 'stop').catch((e) => ({ err: e.message })), stopped(WRAPPER, 'stray').catch((e) => ({ err: e.message })),
    noStop ? stopped(noStop, 'stop').catch((e) => ({ err: e.message })) : null,
  ].map((p) => Promise.resolve(p).catch((e) => ({ err: e && e.message }))));
  srv.close();
  ck('⑰ jetski\'s «a tool required the "command" permission…» names the tool `command` — the card «agy skipped command: it needs approval», its words kept', t?.title === 'agy skipped command: it needs approval' && t.tool === 'command' && /^jetski: no output produced/.test(t.notice || ''), t);
  ck('⑰ …and Allow once retries naming it: «The user allowed command, which you skipped…»', /^The user allowed command, which you skipped because it needed approval/.test(t?.retry || ''), t?.retry);
  ck('⑰ RED copy (the base regexes): the VERB is the tool — «agy skipped required», «The user allowed required…»', !!baseTool && tb?.title === 'agy skipped required: it needs approval' && /^The user allowed required, /.test(tb.retry || ''), tb);
  ck('⑱ the stop-check NUDGE turn (one tool step, completed, no text): jetski\'s line raises NO card — the log says why', n1 && n1.nudged && n1.cards.length === 0 && /stop-check nudge turn completed its 1 tool step/.test(n1.why || ''), n1);
  ck('⑱ CONTROL — a nudge turn whose tool step never completed (a real skip, not bypass): the card still comes', n2 && n2.nudged && n2.cards.length === 1 && n2.cards[0] === 'agy skipped command: it needs approval', n2);
  ck('⑱ under bypass (every tool approved) jetski\'s line raises no card, even with a step left open', n3 && n3.cards.length === 0 && /every tool is approved/.test(n3.why || ''), n3);
  ck('⑱ RED copy (the guard cut): the completed nudge turn raises «agy skipped command» — the false card the owner saw', !!noGuard && nr?.nudged && nr.cards.length === 1, nr);
  ck('⑲ STEER: the old agy\'s result ERROR «interrupted» (its SIGTERM) raises NO error line, and the steered turn ends normally', s1 && !s1.err && s1.errors.length === 0 && s1.ignored && s1.ends.join() === 'cancelled,end_turn', s1);
  ck('⑲ STOP: the same — no «Antigravity: interrupted» after Stop (the log names the ignored result)', s2 && !s2.err && s2.errors.length === 0 && s2.ignored && s2.ends.join() === 'cancelled', s2);
  ck('⑲ CONTROL — an «interrupted» from the CURRENT process (no restart, idle) is still said: «Antigravity: interrupted»', s3 && s3.errors.length === 1 && s3.errors[0] === 'Antigravity: interrupted' && s3.ends.join() === 'end_turn', s3);
  ck('⑲ RED copy (the guard cut): Stop leaves the stale «Antigravity: interrupted» error line', !!noStop && sr && sr.errors.includes('Antigravity: interrupted'), sr);
  return R;
})();

console.log('— ② one chat turn through the REAL wrapper against the fake agy');
let firstCid = null;
{
  const w = startWrapper({ env: { AGY_WEBUI_MODEL: 'gemini-4-argon-high' } });
  try {
    const ses = await w.until(() => w.find('session'), 8000, 'session');
    firstCid = ses.sessionId;
    ok('agy\'s init names the conversation → the `session` record (how new), the id the resume uses', gateOf(/^[0-9a-f-]{36}$/.test(ses.sessionId)) && ses.how === 'new' && ses.agentInfo?.name === 'agy', ses);
    const v = await w.until(() => w.find('agent_version'), 5000, 'version');
    ok('THE VERSION LAW: every spawn records the agy version it ran (`agy --version`)', v.version === FX.version, v);
    const st0 = await w.until(() => w.stub().find((x) => x.argv && x.argv.includes('--input-format')), 5000, 'stream start');
    ok('agy was started in its stream mode with the session\'s flags, --print-timeout 0 pinned (the binary: "0 waits until the turn completes"; its docs page: 5 m)',
      JSON.stringify(st0.argv) === JSON.stringify(['--input-format', 'stream-json', '--output-format', 'stream-json', '--print-timeout', '0', '--model', 'gemini-4-argon-high']) && verdictOf(/0 waits until the turn completes/.test(FX.help.flags['--print-timeout'])), st0.argv);
    w.send({ type: 'chat-input', text: 'hello', msgId: 'u1' });
    const end = await w.until(() => w.find('prompt_end'), 8000, 'prompt_end');
    ok('one turn: the user line on agy\'s stdin, the reply\'s deltas as text, its `result` ends the turn (end_turn)', end.stopReason === 'end_turn' && w.text() === 'Antigravity (gemini-4-argon-high, request-review): hello' && verdictOf(w.stub().some((x) => x.stdin && JSON.parse(x.stdin).message.content === 'hello')), w.text());
    w.send({ type: 'chat-input', text: 'run the tool', msgId: 'u2' });
    await w.until(() => w.all('prompt_end').length === 2, 8000, 'second turn');
    const tc = w.find('update', (r) => r.update?.sessionUpdate === 'tool_call'), tu = w.find('update', (r) => r.update?.sessionUpdate === 'tool_call_update');
    ok('a tool step = a tool card: tool_call (run_command, execute, its parameters) then tool_call_update completed with the output', gateOf(tc) && tc.update.title === 'run_command' && tc.update.kind === 'execute' && tc.update.rawInput.CommandLine === 'echo hello_headless_demo' && gateOf(tu) && tu.update.status === 'completed' && verdictOf(/hello_headless_demo/.test(tu.update.content[0].content.text)), [tc, tu]);
    const mm = new AcpMessageManager('agy');
    for (const r of w.records) { try { mm.processLive(r); } catch { } }
    const msgs = mm.tail(mm.total);
    ok('the ACP normalizer renders the journal: the user bubble, the assistant reply and the tool card', gateOf(msgs.some((m) => m.role === 'user')) && gateOf(msgs.some((m) => m.role === 'assistant' && /Antigravity \(/.test(JSON.stringify(m)))) && verdictOf(msgs.some((m) => /run_command|hello_headless_demo/.test(JSON.stringify(m)))), msgs.map((m) => m.role + ':' + (m.type || '')).join(' '));
  } finally { await w.stop(); }
}

console.log('— ③ THE SLASH REFUSAL (agy would end the stream, exit 2)');
{
  const w = startWrapper();
  try {
    await w.until(() => w.find('session'), 8000, 'session');
    w.send({ type: 'chat-input', text: '/usage', msgId: 's1' });
    const n = await w.until(() => w.find('notice', (r) => r.noticeKind === 'slash-refused'), 5000, 'refusal');
    ok('a chat line that IS one of agy\'s own commands (/usage) is refused by the wrapper, by name', verdictOf(/\/usage was not sent/.test(n.text)), n.text);
    w.send({ type: 'chat-input', text: 'still here', msgId: 's2' });
    await w.until(() => w.find('prompt_end'), 8000, 'the next turn');
    ok('…it never reached agy, and the conversation lives on (the next turn answers)', !w.stub().some((x) => x.stdin && /"\/usage"/.test(x.stdin)) && w.exited === null && verdictOf(/still here/.test(w.text())));
  } finally { await w.stop(); }
  // RED control: the same wrapper with the refusal removed lets the line through — agy ends the session (exit 2)
  const src = fs.readFileSync(WRAPPER, 'utf8');
  const cut = "      if (slashRefused(n.text)) return;\n";
  const mutated = path.join(MUTBIN, 'agy-wrapper-noslash.js');
  fs.writeFileSync(mutated, editAnchor(src, cut, '', "data/bin/agy-wrapper.js"));
  const m = startWrapper({ wrapper: mutated });
  try {
    await m.until(() => m.find('session'), 8000, 'session');
    m.send({ type: 'chat-input', text: '/usage', msgId: 's1' });
    await m.until(() => m.exited, 8000, 'exit');
    ok('RED control: a wrapper copy WITHOUT the refusal forwards it — agy ends the conversation (exit 2), said as such', gateOf(src.includes(cut)) && gateOf(m.find('notice', (r) => r.noticeKind === 'agent-exited' && /exit 2/.test(r.text))) && m.exited.code === 2, m.records.filter((r) => r.kind === 'notice').map((r) => r.text));
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
      gateOf(card) && gateOf(/^agy-deny-/.test(card.requestId)) && card.toolCall.title === 'agy skipped run_command: it needs approval' && card.toolCall.kind === 'execute'
      && gateOf(/requires approval/.test(card.toolCall.rawInput.notice)) && gateOf(/EVERY tool approved for one turn/.test(card.toolCall.rawInput.allowOnce)) && !card.toolCall.rawInput.allowRule
      && JSON.stringify(card.options) === JSON.stringify([{ optionId: 'retry', name: 'Allow once and retry', kind: 'allow_once' }, { optionId: 'skip', name: 'Keep skipped', kind: 'reject_once' }]), card);
    ok('…and the turn still ended normally (the run continues, as agy documents)', w.find('prompt_end').stopReason === 'end_turn');
    const mm = new AcpMessageManager('agy');
    for (const r of w.records) { try { mm.processLive(r); } catch { } }
    const pc = mm.tail(mm.total).find((m) => m.permission && m.permission.requestId === card.requestId);
    ok('the ACP normalizer draws it as an approval card with the two buttons (no new client); on the machine login no rule door (its settings are the person\'s own file)', gateOf(pc) && pc.permission.kind === 'approval' && pc.permission.toolName === 'Bash' && pc.permission.options.map((o) => o.name).join('|') === 'Allow once and retry|Keep skipped' && pc.permission.input.tool === 'run_command', pc && pc.permission);
    const before = streamStarts(w).length;
    w.send({ type: 'permission-response', sessionId: 's', requestId: card.requestId, approved: true, optionId: 'retry' });
    await w.until(() => w.all('prompt_end').length === 2, 8000, 'the retry turn');
    await w.until(() => streamStarts(w).length >= before + 2, 8000, 'the restore restart');
    const starts = streamStarts(w), retryStart = starts[before], restoreStart = starts[before + 1];
    ok('Allow and retry: answered on the card (allow_once), agy restarted on the SAME conversation with --dangerously-skip-permissions for the retry',
      gateOf(w.find('permission_resolved', (r) => r.requestId === card.requestId && r.optionKind === 'allow_once')) && gateOf(retryStart.includes('--dangerously-skip-permissions')) && retryStart[retryStart.indexOf('--conversation') + 1] === ses.sessionId, retryStart);
    ok('…the retry line names the tool and that turn ran under always-proceed (the bypass)', gateOf(w.stub().some((x) => x.stdin && /allowed run_command/.test(x.stdin))) && verdictOf(/always-proceed\): The user allowed run_command/.test(w.text())), w.text());
    ok('…ONE turn only: right after it agy is back on the conversation\'s mode (restarted without the bypass)', !restoreStart.includes('--dangerously-skip-permissions') && restoreStart[restoreStart.indexOf('--conversation') + 1] === ses.sessionId, restoreStart);
    w.send({ type: 'chat-input', text: 'and now', msgId: 'd2' }); // during the restore restart it queues (a restart drains the queue)
    await w.until(() => w.all('prompt_end').length === 3, 8000, 'the next turn');
    ok('…the next user turn runs under request-review again', verdictOf(/request-review\): and now/.test(w.text())), w.text());
    w.send({ type: 'chat-input', text: 'deny again', msgId: 'd3' });
    await w.until(() => w.all('permission_request').length === 2, 8000, 'second card');
    const c2 = w.all('permission_request')[1], n0 = streamStarts(w).length;
    w.send({ type: 'permission-response', sessionId: 's', requestId: c2.requestId, approved: false, optionId: 'skip' });
    await w.until(() => w.find('permission_resolved', (r) => r.requestId === c2.requestId), 5000, 'skip');
    await sleep(150);
    ok('Keep skipped: answered (reject_once), nothing restarts, nothing is sent', w.find('permission_resolved', (r) => r.requestId === c2.requestId).optionKind === 'reject_once' && streamStarts(w).length === n0 && w.all('prompt_end').length === 4);
    w.send({ type: 'permission-response', sessionId: 's', requestId: c2.requestId, approved: true, optionId: 'retry' });
    const st = await w.until(() => w.find('notice', (r) => r.noticeKind === 'stale'), 5000, 'stale');
    ok('a second answer to the same card is refused by name (stale) — no restart', gateOf(/unknown\/expired/.test(st.text)) && streamStarts(w).length === n0);
  } finally { await w.stop(); }
  const src = fs.readFileSync(WRAPPER, 'utf8');
  const line = "  if (SOFT_DENY_RE.test(line)) {";   // B-bba6: the line's head (its body now also words a skip said as agy ends)
  const mutated = path.join(MUTBIN, 'agy-wrapper-nodeny.js');
  fs.writeFileSync(mutated, editAnchor(src, line, '  if (false && SOFT_DENY_RE.test(line)) {', "data/bin/agy-wrapper.js"));
  const m = startWrapper({ wrapper: mutated });
  try {
    await m.until(() => m.find('session'), 8000, 'session');
    m.send({ type: 'chat-input', text: 'please deny this', msgId: 'd1' });
    await m.until(() => m.find('prompt_end'), 8000, 'turn');
    ok('RED control: a copy whose stderr reader drops the line leaves the skip SILENT — no card, no notice (the legs above can go red)', gateOf(src.includes(line)) && !m.find('permission_request') && !m.find('notice', (r) => /approval/.test(r.text || '')));
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
  ok('the user turn moved ahead of the retry runs under request-review; the retry alone gets the bypass', gateOf(/request-review\): mine/.test(t)) && verdictOf(/always-proceed\): The user allowed run_command/.test(t)), t);
  const src = fs.readFileSync(WRAPPER, 'utf8');
  const guard = '  if (wantBypass !== childRetryBypass) {';
  const mutated = path.join(MUTBIN, 'agy-wrapper-leak.js');
  fs.writeFileSync(mutated, editAnchor(src, guard, '  if (wantBypass && !retryBypass) {', "data/bin/agy-wrapper.js"));
  const tm = await reorderLeg(mutated);
  ok('RED control: a copy that checks only "retry wants it" (not what the process was started with) runs the moved user turn with every tool approved', gateOf(src.includes(guard)) && verdictOf(/always-proceed\): mine/.test(tm)), tm);
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
  ok('the card offers the rule the notice names, scoped to THIS account, before the once-door', r.card.options.map((o) => o.optionId).join() === 'rule,retry,skip' && r.card.options[0].name === 'Allow command(rm) and retry' && r.card.options[0].kind === 'allow_always' && verdictOf(/this Google account's own Antigravity settings/.test(r.card.toolCall.rawInput.allowRule)), r.card.options);
  const js = JSON.parse(fs.readFileSync(settingsOf(root), 'utf8'));
  ok('…answered: command(rm) is in the account\'s settings.json permissions.allow (mode 0600)', JSON.stringify(js.permissions.allow) === '["command(rm)"]' && (fs.statSync(settingsOf(root)).mode & 0o777) === 0o600, js);
  ok('…agy restarted on the same conversation WITHOUT the bypass (the rule, not every tool) and the turn was sent again', r.starts.length >= 1 && !r.starts[0].includes('--dangerously-skip-permissions') && gateOf(r.starts[0].includes('--conversation')) && verdictOf(/request-review\): The user allowed run_command \(the rule command\(rm\)/.test(r.text)), { starts: r.starts, text: r.text });
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
  fs.writeFileSync(mutated, editAnchor(src, chk, 'if (!fs.statSync(d).isDirectory())', "data/bin/agy-wrapper.js"));
  const r5 = await ruleLeg(root3, mutated);
  ok('RED control: a copy that follows the link writes the rule into the person\'s global settings.json (the leg above can go red)', gateOf(src.includes(chk)) && gateOf(r5.card.options.some((o) => o.optionId === 'rule')) && verdictOf(/command\(rm\)/.test(fs.readFileSync(path.join(globalDir, 'settings.json'), 'utf8'))));
  // the machine login (no mark in HOME): the auth notice names the terminal sign-in; an account: its own sign-in door
  const w = startWrapper({ env: { HOME: root, AGY_STUB_AUTH: 'none' } });
  try {
    w.send({ type: 'chat-input', text: 'hello?', msgId: 'a0' });
    const n = await w.until(() => w.find('notice', (x) => x.noticeKind === 'auth-required'), 6000, 'auth-required (account)');
    ok('an account session that is not signed in names ITS door (Agents → Antigravity CLI → ⋯ → Sign in again)', gateOf(/This Google account \(Antigravity\) is not signed in/.test(n.text)) && verdictOf(/Sign in again/.test(n.text)), n.text);
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
    ok('the restart carries --conversation <the same id> and the new flags', gateOf(last.includes('--conversation')) && last[last.indexOf('--conversation') + 1] === ses.sessionId && gateOf(last.includes('--model')) && last[last.indexOf('--model') + 1] === 'gemini-3.8-flash-medium' && verdictOf(last.includes('--dangerously-skip-permissions')), last);
    ok('…the notice says the process restarts, and the next reply runs on the new model / mode', gateOf(w.find('notice', (r) => r.noticeKind === 'command_applied' && /restarts its process on the same conversation/.test(r.text))) && verdictOf(/gemini-3.8-flash-medium, always-proceed/.test(w.text())), w.text());
    w.send({ type: 'set-mode', mode: 'yolo' });
    const u = await w.until(() => w.find('notice', (r) => r.noticeKind === 'unsupported'), 5000, 'unsupported mode');
    ok('a mode agy does not have is refused by name (never passed through)', verdictOf(/has no Mode "yolo"/.test(u.text)), u.text);
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
    ok('a turn runs, later lines queue in the WRAPPER; edit / remove are served', gateOf(w.all('queue_op_result').every((r) => r.ok)) && w.all('queued_input').length === 2);
    w.send({ type: 'interrupt' });
    const end = await w.until(() => w.find('prompt_end'), 5000, 'end');
    const stopLine = w.find('notice', (r) => r.noticeKind === 'stop-restart');
    ok('Stop ends the running turn as cancelled and drops the queue (the owner\'s law, 2026-09-07 — every harness)', end.stopReason === 'cancelled' && gateOf(stopLine) && verdictOf(w.find('queue_op_result', (r) => r.op === 'remove' && r.reason === 'stopped' && r.msg_id === 'q1')), end);
    // lane agy-harness-fixes (bug 4) SAID the drop in the Stop line («send again what should still run»); since lane
    // stop-refills-composer the words come BACK (the queue_dropped record below → the composer + the client's toast), so
    // the line no longer tells the person to re-send what is already back in their box
    ok('…and the Stop line no longer says «send again» — the dropped words come back into the composer instead (the record below)', !/send again|not sent/.test(stopLine.text) && verdictOf(/Stopped — Antigravity has no cancel in its stream/.test(stopLine.text)), stopLine.text);
    await w.until(() => w.stub().filter((x) => x.argv && x.argv.includes('--input-format')).length >= 2, 8000, 'restart after stop');
    const starts = w.stub().filter((x) => x.argv && x.argv.includes('--input-format')).map((x) => x.argv);
    ok('…by restarting agy on the same conversation (its stream has no cancel)', gateOf(starts[1].includes('--conversation')) && starts[1][starts[1].indexOf('--conversation') + 1] === ses.sessionId);
    // STOP PUTS THE DROPPED QUEUE BACK (lane stop-refills-composer): ONE record of the person's rows, the CURRENT text
    const drops = w.all('queue_dropped');
    const iStop = w.records.findLastIndex((r) => r.type === 'acp' && r.kind === 'queue_op_result' && r.reason === 'stopped');
    const iDrop = w.records.findIndex((r) => r.type === 'acp' && r.kind === 'queue_dropped');
    const iEmpty = w.records.findIndex((r, i) => i > iStop && r.type === 'acp' && r.kind === 'queue_changed' && r.items.length === 0);
    ok('…and what Stop dropped comes back: ONE queue_dropped carrying [{msgId q1, the EDITED text}] (q2 was removed before Stop), a `${pid}-${n}` dropId', drops.length === 1 && drops[0].items.length === 1 && drops[0].items[0].msgId === 'q1' && drops[0].items[0].text === 'queued one, edited' && gateOf(/^\d+-\d+$/.test(drops[0].dropId)) && drops[0].by === 'stop' && drops[0].omitted === 0, drops);
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
    ok('the wrapper serves steer: its queue publication and its caps advert name it (the strip shows ⚡ for agy)', gateOf(q3.verbs.includes('steer')) && verdictOf(meta.caps.queueVerbs.includes('steer')), { verbs: q3.verbs, caps: meta.caps.queueVerbs });
    w.send({ type: 'queue-op', op: 'steer-all' });
    w.send({ type: 'queue-op', op: 'steer', id: 'q-nope' });
    w.send({ type: 'queue-op', op: 'steer', id: q3.items[2].id });
    const res = await w.until(() => w.find('queue_op_result', (r) => r.op === 'steer' && r.ok), 5000, 'the steer');
    const head = w.all('queue_changed').find((r) => r.items.length === 3 && r.items[0].msgId === 'v3');
    ok('steer #3 ⇒ ok, and it is at the HEAD of the queue (#1, #2 behind it, in order)', res.msg_id === 'v3' && gateOf(head) && head.items.map((i) => i.msgId).join() === 'v3,v1,v2', head && head.items.map((i) => i.msgId));
    ok('steer-all stays refused (one message at a time); a steer of an id no longer queued says so', gateOf(w.find('queue_op_result', (r) => r.op === 'steer-all' && r.reason === 'not-steerable')) && verdictOf(w.find('queue_op_result', (r) => r.op === 'steer' && r.reason === 'gone')));
    const end = await w.until(() => w.find('prompt_end'), 5000, 'the stopped turn');
    const said = w.find('notice', (r) => r.noticeKind === 'steer-restart');
    ok('the running turn ENDS (cancelled) — agy takes no input mid-turn — and the line says why (what it did stays)', end.stopReason === 'cancelled' && gateOf(said) && verdictOf(/Steered/.test(said.text)), { end, said: said && said.text });
    await w.until(() => lines(w).length >= 4, 20000, 'the queue drained');
    ok('…agy restarts on the SAME conversation and runs the steered message FIRST, then the rest in order', starts(w).length >= 2 && gateOf(starts(w)[1].includes('--conversation')) && gateOf(starts(w)[1].includes(ses.sessionId)) && lines(w).join(' | ') === 'a slow one | third queued | first queued | second queued', lines(w));
    await w.until(() => w.all('prompt_end').length >= 4, 8000, 'the last turn\'s end').catch(() => null); // its stdin line lands before its end (lane agy-harness-fixes-2: ⑮–⑲ beside it made that race show)
    ok('…nothing queued was lost or run twice: the queue ends empty, four turns started, three ended normally', w.all('queue_changed').pop().items.length === 0 && w.all('prompt_start').length === 4 && w.all('prompt_end', (r) => r.stopReason === 'end_turn').length === 3, w.all('prompt_end').map((r) => r.stopReason));
  } finally { await w.stop(); }
  // RED control: the pre-fix wrapper (no steer verb) refuses it — the message waits behind the running turn
  const src = fs.readFileSync(WRAPPER, 'utf8');
  const verbs = "const QUEUE_VERBS = ['remove', 'steer', 'reorder', 'edit'];";
  const mutated = path.join(MUTBIN, 'agy-wrapper-nosteer.js');
  fs.writeFileSync(mutated, editAnchor(src, verbs, "const QUEUE_VERBS = ['remove', 'reorder', 'edit'];", "data/bin/agy-wrapper.js"));
  const m = startWrapper({ wrapper: mutated, env: { AGY_STUB_SLOW_MS: '1500' } });
  try {
    await m.until(() => m.find('session'), 8000, 'session');
    m.send({ type: 'chat-input', text: 'a slow one', msgId: 'r0' });
    await m.until(() => m.find('prompt_start'), 5000, 'start');
    m.send({ type: 'chat-input', text: 'jump me', msgId: 'r1' });
    const q = await m.until(() => m.all('queue_changed').find((r) => r.items.length === 1), 5000, 'queued');
    m.send({ type: 'queue-op', op: 'steer', id: q.items[0].id });
    const refused = await m.until(() => m.find('queue_op_result', (r) => r.op === 'steer'), 5000, 'refusal');
    ok('RED control: a wrapper copy without the steer verb (the pre-fix) refuses it «not-steerable» and the turn runs on — the ⑥b asserts see it', gateOf(src.includes(verbs)) && refused.ok === false && refused.reason === 'not-steerable' && !m.find('notice', (r) => r.noticeKind === 'steer-restart'));
  } finally { await m.stop(); }
}

console.log('— ⑦ resume, an agent error, text only');
{
  const w = startWrapper({ env: { AGY_WEBUI_RESUME_ID: firstCid } });
  try {
    const ses = await w.until(() => w.find('session'), 8000, 'session');
    const startArgv = await w.until(() => (w.stub().find((x) => x.argv && x.argv.includes('--input-format')) || {}).argv, 8000, 'agy start');
    ok('a resume is --conversation <id> from the first start, the session record says load', ses.how === 'load' && ses.sessionId === firstCid && gateOf(startArgv.includes('--conversation')) && verdictOf(startArgv.includes(firstCid)), { ses, startArgv });
    w.send({ type: 'chat-input', text: 'this will fail', msgId: 'f1' });
    const end = await w.until(() => w.find('prompt_end'), 8000, 'end');
    // B-518e (red in two packed runs on the test machine, 638450bff and 2f241bf12: the turn's end read before its notice): agy
    // writes the AGY_ERROR line on STDERR and its result on STDOUT — two pipes nothing orders, so the wrapper may say the notice
    // after the end. The leg WAITS for the notice's own record (8 s, an end for a notice that never comes), never reads it at the
    // end's instant (⑦b places the other order)
    const said = await w.until(() => noticeSaid(w), 8000, 'the AGY_ERROR notice').catch(() => null);
    ok('agy\'s ERROR result ends the turn as an error with its words; the AGY_ERROR line is said (its own record, waited for)', end.stopReason === 'error' && gateOf(/model unavailable/.test(end.error.message)) && !!said, { end, said: said || null });
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
      l1 === `${want} see this` && gateOf(fs.readFileSync(want).equals(Buffer.from(PNG, 'base64'))) && !w.find('notice', (r) => r.noticeKind === 'unsupported') && w.find('user', (r) => r.msgId === 'i1')?.content[0].text === l1 && w.exited === null, { l1, want });
    ok('…the folder is the person\'s (0700, the file 0600) and a repo never sees it (a `*` .gitignore)', (fs.statSync(upDir).mode & 0o777) === 0o700 && (fs.statSync(want).mode & 0o777) === 0o600 && fs.readFileSync(path.join(upDir, '.gitignore'), 'utf8') === '*\n');
    sendBlocks([pic()], 'i2');
    await w.until(() => w.all('prompt_end').length === 3, 8000, 'picture-only turn');
    ok('a message that is ONLY a picture is sent (its text is the path) — the same picture again is the same file, not a second one', agyLines().pop() === want && fs.readdirSync(upDir).filter((n) => n.startsWith('pasted-')).length === 1);
    sendBlocks([pic('JVBERi0xLjQK', 'application/pdf'), pic(), { type: 'text', text: 'and this' }], 'i3');
    await w.until(() => w.all('prompt_end').length === 4, 8000, 'one bad picture');
    const bad = w.find('notice', (r) => r.noticeKind === 'unsupported');
    ok('a picture that cannot be written (not an image type) is the ONLY thing said as not sent — the rest of the message goes', agyLines().pop() === `${want} and this` && gateOf(bad) && verdictOf(/1 attached picture was not sent/.test(bad.text)), bad);
    const readOr = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
    const journal = readOr(path.join(w.dir, 's.buf')) + JSON.stringify(w.records) + w.stderr + readOr(path.join(w.dir, 'agy-wrapper.log'));
    ok('no picture byte in the journal, the stdout records, stderr or the wrapper log (only its path)', !journal.includes(PNG.slice(0, 40)) && !journal.includes('JVBERi0xLjQK'));
    ok('agy\'s stream got TEXT only, every line (another block type would end it)', verdictOf(agyLines().every((c) => typeof c === 'string')));
  } finally { await w.stop(); }
}
// lane agy-wall-signal r3: a wall record names the model the running turn's process started on (agy's own init.model)
{
  const w = startWrapper({ env: { AGY_STUB_DEFAULT_MODEL: 'gemini-3.8-flash-medium' } });
  try {
    await w.until(() => w.find('session'), 8000, 'session');
    w.send({ type: 'chat-input', text: 'this will fail', msgId: 'sm1' });
    const end = await w.until(() => w.find('prompt_end'), 8000, 'end');
    const n = await w.until(() => w.find('notice', (r) => r.noticeKind === 'agy-error'), 4000, 'agy-error notice');
    ok('r3: a DEFAULT-model conversation — agy\'s init names its model, and the agy-error notice + the error prompt_end both carry it as servedModel', end.stopReason === 'error' && end.servedModel === 'gemini-3.8-flash-medium' && n.servedModel === 'gemini-3.8-flash-medium', { end, n });
  } finally { await w.stop(); }
  const w2 = startWrapper({});
  try {
    await w2.until(() => w2.find('session'), 8000, 'session');
    w2.send({ type: 'chat-input', text: 'this will fail', msgId: 'sm2' });
    const end = await w2.until(() => w2.find('prompt_end'), 8000, 'end');
    const n = await w2.until(() => w2.find('notice', (r) => r.noticeKind === 'agy-error'), 4000, 'agy-error notice');
    ok('r3: …an agy whose init names no model: no servedModel field on either record (never a guess)', !('servedModel' in end) && !('servedModel' in n), { end, n });
  } finally { await w2.stop(); }
  // r4: TWO PROCESSES — a model, then a set-model to Default (agy restarts; its init names none): the stamp is cleared,
  // never the previous process's model
  // …and the WRAPPER puts a non-Gemini slug on agy's own argv as typed (the 2026-11-10 question, end to end)
  {
    const wn = startWrapper({ env: { AGY_WEBUI_MODEL: 'claude-opus-5-5-low' } });
    try {
      await wn.until(() => wn.find('session'), 8000, 'session');
      const stn = await wn.until(() => wn.stub().find((x) => x.argv && x.argv.includes('--input-format')), 5000, 'stream start');
      ok('a non-Gemini slug reaches agy as typed: --model claude-opus-5-5-low (no validator refuses it; agy itself judges the slug)', verdictOf(stn.argv.join(' ').endsWith('--model claude-opus-5-5-low')), stn.argv);
    } finally { await wn.stop(); }
  }
  const w3 = startWrapper({ env: { AGY_WEBUI_MODEL: 'claude-sonnet-4-6' } });
  try {
    await w3.until(() => w3.find('session'), 8000, 'session');
    const metaOf = () => { try { return JSON.parse(fs.readFileSync(path.join(w3.dir, 's.json'), 'utf8')); } catch { return null; } };
    await w3.until(() => metaOf()?.agy?.model === 'claude-sonnet-4-6', 4000, 'the first process names its model');
    w3.send({ type: 'set-model', model: '' });
    await w3.until(() => w3.find('notice', (r) => r.noticeKind === 'command_applied'), 5000, 'the restart onto Default');
    await w3.until(() => w3.stub().filter((x) => x.argv && x.argv.includes('--input-format')).length >= 2, 8000, 'the second agy start');
    await w3.until(() => metaOf()?.agy && metaOf().agy.model === null, 4000, 'the second init clears the model').catch(() => null); // a wrapper that never clears it is the ✗ below, not a throw
    w3.send({ type: 'chat-input', text: 'this will fail', msgId: 'sm3' });
    const end = await w3.until(() => w3.find('prompt_end'), 8000, 'end');
    const n = await w3.until(() => w3.find('notice', (r) => r.noticeKind === 'agy-error'), 4000, 'agy-error notice');
    ok('r4: a set-model to DEFAULT (the 2nd process\'s init names none) ⇒ the sidecar\'s agy.model is null and the wall records carry NO servedModel (never the 1st process\'s claude-sonnet-4-6)', metaOf().agy.model === null && !('servedModel' in end) && !('servedModel' in n), { end, n, agy: metaOf()?.agy });
  } finally { await w3.stop(); }
}
{
  // RED control (lane agy-harness-fixes): the pre-fix wrapper DROPPED every picture — a picture-only message never reached agy
  const src = fs.readFileSync(WRAPPER, 'utf8');
  const keep = "      if (b.type === 'image') { images++; try { const fp = quotePath(savePicture(b)); if (!paths.includes(fp)) paths.push(fp); } catch (e) { failed.push(e && e.message ? e.message : String(e)); } }\n";
  const mutated = path.join(MUTBIN, 'agy-wrapper-nopicture.js');
  fs.writeFileSync(mutated, editAnchor(src, keep, "      if (b.type === 'image') { images++; failed.push('text only'); }\n", "data/bin/agy-wrapper.js"));
  const m = startWrapper({ wrapper: mutated });
  try {
    await m.until(() => m.find('session'), 8000, 'session');
    m.send({ type: 'chat-input', text: JSON.stringify({ type: 'user', message: { content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' } }] } }), msgId: 'r1' });
    await m.until(() => m.find('notice', (r) => r.noticeKind === 'unsupported'), 8000, 'the dropped picture');
    await sleep(600);
    ok('RED control: a wrapper copy that drops pictures (the pre-fix) sends a picture-only message NOWHERE — the ⑦ asserts see it', gateOf(src.includes(keep)) && !m.find('prompt_start') && !m.stub().some((x) => x.stdin));
  } finally { await m.stop(); }
}

// ⑦b B-518e — THE OTHER ORDER, PLACED EXACTLY: the stub's `faillate` writes the result first and holds the AGY_ERROR line until
// a gate file exists — the leg opens it only after its OLD-style read, so the order is the test's, never a margin load can close.
// The plant proves itself first (the notice's record comes AFTER the end's); the old read (⑦'s reader at the end's instant)
// misses it; the cure's wait has it
console.log('— ⑦b B-518e: the AGY_ERROR line after the result (two pipes in the other order, placed by a gate)');
{
  const gate = path.join(ROOT, 'agy-err-gate');
  try { fs.rmSync(gate, { force: true }); } catch { }
  const w = startWrapper({ env: { AGY_STUB_ERR_GATE: gate } });
  try {
    await w.until(() => w.find('session'), 8000, 'session');
    w.send({ type: 'chat-input', text: 'this will faillate', msgId: 'fl1' });
    const end = await w.until(() => w.find('prompt_end'), 8000, 'end');
    const atEnd = !!noticeSaid(w);   // the OLD leg's read, at the end's instant (the stub holds the line until the gate opens)
    fs.writeFileSync(gate, '');      // now let the stub write it
    const said = await w.until(() => noticeSaid(w), 8000, 'the held notice').catch(() => null);
    const after = !!said && w.records.indexOf(said) > w.records.indexOf(end);
    ok('⑦b the plant is where it claims: with the AGY_ERROR line held until the result is read, the wrapper says the notice AFTER the turn\'s end', end.stopReason === 'error' && verdictOf(after), { end, said: !!said, after });
    ok('⑦b RED CONTROL: the old read (the notice looked for at the end\'s instant) misses it under the placement; the cure (its own record, waited for) has it', !atEnd && !!said, { atEnd, said: !!said });
  } finally { await w.stop(); try { fs.rmSync(gate, { force: true }); } catch { } }
}

// ⑦c B-bba6 — THE LAST WORDS AND THE LATE ERROR. (1) agy's LAST stderr line with no newline is said, in both orders of the
// pipe's end and the exit (placed by the stand-in: stderr closed and the exit held until the wrapper logged the end / a
// grandchild holding the pipe until the leg releases it), and the wait for the end is bounded (the wrapper ends while the
// pipe is STILL held — an order); a sign-in head said last decides the exit's own words; a skip said last is a notice, never
// a card no process can act on. (2) a process REPLACED after its own turn ended (a model switch made during the turn) says
// that turn's late AGY_ERROR line ONCE; one stopped mid-turn (Stop) stays quiet, and so does an interruption (bug 5).
// Every control is a mutant built through anchored(): it fails by name when its line moves.
console.log('— ⑦c B-bba6: the last stderr words, and the late error of a replaced process');
{
  const { ef, held, signin, skipped, cNoEnd, cNoWait, cNoBound, sw, st, quiet, cNoLate, cNoGuard, cNoQuiet, cr, cLate, df, cDf, tw, cTw, ls, cLs, lsSlow, cLsSlow, cOnce } = await bba6Lane;
  const before = (r) => r.notices.indexOf('agy-error') >= 0 && r.notices.indexOf('agy-error') < r.notices.indexOf('agent-exited');
  ok('⑦c the last stderr line with NO newline is said — the wrapper read the pipe\'s END while agy still ran (the exit held behind it): «Antigravity: quota exhausted, said last» before the exit\'s own notice, the turn ends error, the wrapper exits 1',
    gateOf(ef.endLogged) && !!ef.last && gateOf(before(ef)) && ef.end?.stopReason === 'error' && ef.exited?.code === 1, ef);
  ok('⑦c …and in the OTHER order (a grandchild holds agy\'s stderr past its exit): the wrapper waits for the end at most its bound — the line is said, and the wrapper ENDS WHILE THE PIPE IS STILL HELD (released only after)',
    !!held.last && gateOf(before(held)) && held.heldAtEnd === true && !!held.holder, held);
  ok('⑦c a SIGN-IN head said last decides the exit\'s words: the sign-in notice, no «Antigravity exited» notice, exit 1',
    gateOf(signin.endLogged) && gateOf(signin.notices.includes('auth-required')) && !signin.notices.includes('agent-exited') && signin.exited?.code === 1, signin);
  ok('⑦c a soft-deny line said last (no newline) is a notice naming the step — never a permission card whose «allow and retry» needs the process that just ended',
    gateOf(skipped.endLogged) && !!skipped.skipped && gateOf(/requires approval and was skipped/.test(skipped.skipped.text)) && skipped.cards === 0, skipped);
  ok('⑦c RED CONTROL (no flush at the pipe\'s end): the end read first (logged), the line is NEVER said — only the exit\'s notice', gateOf(cNoEnd.endLogged) && !cNoEnd.last && verdictOf(cNoEnd.notices.includes('agent-exited')), cNoEnd);
  ok('⑦c RED CONTROL (no wait for the pipe\'s end at the exit): with the pipe held, the last line is NEVER said', !cNoWait.last && verdictOf(cNoWait.notices.includes('agent-exited')), cNoWait);
  ok('⑦c a CRASH mid-turn while a model switch waits for the turn\'s end: the turn ends error, the wrapper ends, and NO second agy is started on its way out (one spawn)', cr.end?.stopReason === 'error' && !!cr.exited && cr.spawned === 1, cr);
  ok('⑦c RED CONTROL (no ending mark at the process\'s own exit — its one assignment removed): the switch waiting at the crash spawns a SECOND agy just before the exit', cLate.spawned === 2, cLate);
  ok('⑦c a write to a process that CLOSED its stdin (EPIPE) is a journal line, never a crash — the wrapper lives on', gateOf(df.epipe) && !df.exited, df);
  ok('⑦c RED CONTROL (no stdin error listener): that write kills the wrapper', !!cDf.exited && !cDf.epipe, cDf);
  ok('⑦c a person\'s line typed INSIDE the exit wait starts no agy (one spawn) and comes back into the box — one `queue_dropped` by «exit» carrying its words (the toast: «The conversation ended — 1 queued message(s) put back into the input box»)',
    tw.spawned === 1 && !!tw.dropped && tw.dropped.by === 'exit' && gateOf(Array.isArray(tw.dropped.items)) && tw.dropped.items.length === 1 && tw.dropped.items[0].text === 'typed while it ends', tw);
  ok('⑦c RED CONTROL (the runPrompt guard dropped): that line starts a SECOND agy during the exit wait', cTw.spawned === 2, cTw);
  ok('⑦c a late line read after the NEXT process started is filed under the model of the process that WROTE it (claude-sonnet-4-6), not the new one', ls.served === 'claude-sonnet-4-6' && verdictOf(/model unavailable/.test(ls.text || '')), ls);
  ok('⑦c RED CONTROL (the served model read when the notice is said): it is filed under the NEW process\'s model', cLs.served === 'gemini-3.8-flash-medium', cLs);
  ok('⑦c (ckpt61 hosted red) the RESTARTED process held 2 s before its init (a node start on a loaded runner): the scene as written is green — its init\'s model reaches the meta (the init writes it) and the late line is filed under the old model', lsSlow.served === 'claude-sonnet-4-6' && verdictOf(/model unavailable/.test(lsSlow.text || '')), lsSlow);
  ok('⑦c RED CONTROL (the init\'s write removed — only the spawn\'s write 200 ms after the start): with the same placement the scene is RED, and its timeout says the fact it waited for (the meta\'s agy.model, what the meta names instead) and the processes spawned', gateOf(cLsSlow.red) && verdictOf(/the fact waited for: the meta's agy\.model = gemini-3\.8-flash-medium \(the meta names "claude-sonnet-4-6"\); the processes spawned: pid \d+, pid \d+/.test(cLsSlow.error)), cLsSlow);
  ok('⑦c RED CONTROL («said once» removed): the replaced process\'s two late lines say TWO notices', cOnce.said.length === 2, cOnce);
  ok('⑦c RED CONTROL (the wait has no bound): while the grandchild holds the pipe the wrapper never ends — it ends only once released', cNoBound.heldAtEnd === false && !!cNoBound.exited, cNoBound);
  const plant = (r) => !r.held.said && r.held.starts === 1 && r.held.restarting && r.read === 2;
  ok('⑦c the plant: the switch (or the Stop) taken in BEFORE the turn answers, then its end and the restart read with the old process still alive, nothing said yet — then the old process writes its AGY_ERROR line twice',
    gateOf([sw, st, quiet, cNoLate, cNoGuard, cNoQuiet].every(plant)) && sw.end.stopReason === 'error' && st.end.stopReason === 'cancelled', [sw, st, quiet, cNoLate, cNoGuard, cNoQuiet].map((r) => ({ ...r.held, read: r.read })));
  ok('⑦c a model switch made during a turn that then FAILS: the replaced process\'s late error is said ONCE (two lines, one notice), after the turn\'s end, under the model that process served (the next starts only after it exits); the next process runs the new model',
    sw.said.length === 1 && sw.saidAt > sw.endAt && gateOf(/Antigravity: model unavailable/.test(sw.said[0].text)) && sw.said[0].servedModel === 'claude-sonnet-4-6' && verdictOf(/--model gemini-3\.8-flash-medium/.test(sw.next || '')), sw);
  ok('⑦c a Stop in the MIDDLE of the turn: the stopped process\'s error stays quiet (bug 5 — no agy-error notice)', st.said.length === 0, st);
  ok('⑦c a replaced process that reports an INTERRUPTION on its way out stays quiet too (bug 5)', quiet.said.length === 0, quiet);
  ok('⑦c RED CONTROL (the late error only logged — the base\'s road): the switch\'s failed turn says nothing', cNoLate.said.length === 0, cNoLate);
  ok('⑦c RED CONTROL (no open-turn guard): a Stop mid-turn WOULD say the stopped process\'s error', cNoGuard.said.length === 1, cNoGuard);
  ok('⑦c RED CONTROL (no interruption filter): the replaced process\'s «interrupted» WOULD be said', cNoQuiet.said.length === 1 && verdictOf(/interrupted/.test(cNoQuiet.said[0].text)), cNoQuiet);
}

console.log('— ⑧ THE AUTH GATE: an unauthenticated agy');
{
  // the measured stream start on a pipe: agy refuses at once — said by name, the session ends
  const w0 = startWrapper({ env: { AGY_STUB_AUTH: 'none' } });
  try {
    w0.send({ type: 'chat-input', text: 'hello?', msgId: 'a0' });
    const n0 = await w0.until(() => w0.find('notice', (r) => r.noticeKind === 'auth-required'), 6000, 'auth-required (pipe)');
    await w0.until(() => w0.exited, 6000, 'exit');
    ok('agy\'s immediate refusal on a pipe (measured 1.4.3) is said BY NAME (shape: refusal) and ends the wrapper', gateOf(/not signed in/.test(n0.text)) && w0.exited.code === 1 && !w0.stub().some((x) => x.stdin) && verdictOf(w0.find('auth_required', (r) => r.how === 'refusal')), w0.find('auth_required'));
  } finally { await w0.stop(); }
  const w = startWrapper({ env: { AGY_STUB_AUTH: 'wait', AGY_STUB_AUTH_WAIT_MS: '20000' } });
  try {
    w.send({ type: 'chat-input', text: 'are you there', msgId: 'a1' });
    const n = await w.until(() => w.find('notice', (r) => r.noticeKind === 'auth-required'), 6000, 'auth-required');
    await w.until(() => w.exited, 6000, 'wrapper exit');
    // ordering, not a clock: the stub's own wait (20 s) ends with "authentication failed or timed out" — the wrapper must be gone first
    ok('refused BY NAME before agy\'s pasted-code wait ends (its timeout result never arrives) — and the wrapper ends (exit 1)', gateOf(/not signed in/.test(n.text)) && w.exited.code === 1 && !JSON.stringify(w.records).includes('timed out'), { code: w.exited && w.exited.code });
    ok('…agy never received our line as its authorization code', !w.stub().some((x) => x.authCodeLine) && !w.stub().some((x) => x.stdin), w.stub());
    ok('…the journal names the shape (link-wait), and the OAuth link is not copied into it', !JSON.stringify(w.records).includes('client_id=') && !JSON.stringify(w.records).includes('oauth2') && verdictOf(w.find('auth_required', (r) => r.how === 'link-wait')), w.find('auth_required'));
  } finally { await w.stop(); }
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
      // THE TIMING PAIR (2.369.405, lane artifacts-by-intent): the row's end rides the STREAM's subagent_info DONE (the stub prints it
      // after ACTIVE), never the tail's records that the wait above counts (hosted: the tail's first tick beat the DONE under load) — the
      // leg waits on that end record itself (a row that never ends throws: the leg is red), then reads it whole
      await w.until(() => w.find('update', (r) => r.update?.sessionUpdate === 'tool_call_update' && r.update.toolCallId === `${P}:6`), 8000, 'the row\'s own end');
      ok('the row itself: a tool_call, then its OWN end on the subagent_info update (the owner\'s two rows never got one) — and no «started 1 subagent» line beside the card',
        w.find('update', (r) => r.update?.sessionUpdate === 'tool_call' && r.update.toolCallId === `${P}:6` && r.update.title === 'invoke_subagent') && w.find('update', (r) => r.update?.sessionUpdate === 'tool_call_update' && r.update.toolCallId === `${P}:6` && r.update.status === 'completed') && !w.find('notice', (r) => r.noticeKind === 'subagents'));
      ok('THE TAIL is on while the sub works', /subagent tail on \(every 200 ms\)/.test(wlog(w)) && !/subagent tail off/.test(wlog(w)), wlog(w).slice(-400));
      // …the card's BASELINE at the watcher's SETTLED state (the timing pair): a tail tick writes its `sub` records and THEN its card, so a
      // count right after the records could be taken MID-TICK (hosted: before 1, after 3) — it waits for the card that carries the first
      // steps' last (its lastText, the store's own cardOf over that step); a card that never comes throws (the leg is red)
      const firstSteps = fs.readFileSync(A.t, 'utf8').split('\n').filter(Boolean);
      const settledText = AS.cardOf({ lastStep: AS.transcriptStepOf(firstSteps[firstSteps.length - 1]) }).lastText;
      await w.until(() => { const c = w.all('subagent'); return c.length > 0 && c[c.length - 1].lastText === settledText; }, 8000, 'the card of the first steps');
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
    fs.writeFileSync(mutated, editAnchor(src, cut, '', "data/bin/agy-wrapper.js"));
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
  // B-0f7b: THE ANSWER CAN LAND LATE — the tail read a sub's answer only on the tick that first saw it over, then stopped
  // (sub.done): an answer the parent's store got after that tick was never read and the card stayed «completed» with no
  // result. Steps first, the answer three tail periods later: the card must end WITH it; with no answer at all the tail
  // still ends at its bound; the release's wrapper is the red control.
  const lateLeg = (name, wrapper, { answer = true, look = 2500, bound = '3000' } = {}) => async (ok) => {
    const L = await mkStore(name);
    const w = startWrapper({ wrapper, env: env(L.home, { AGY_WEBUI_SUB_ANSWER_WAIT_MS: bound }) });
    try {
      await w.until(() => w.find('session'), 8000, 'session');
      w.send({ type: 'chat-input', text: 'please start a subagent', msgId: name });
      await w.until(() => w.find('subagent', (r) => r.status === 'running'), 8000, 'the running card');
      fs.appendFileSync(L.t, L.rest.join('\n') + '\n');                          // the sub's last steps: it is over …
      await w.until(() => w.find('subagent', (r) => r.status === 'completed'), 8000, 'the ended card');
      await sleep(600);                                                             // … three tail periods with no answer
      if (answer) fs.copyFileSync(path.join(FIXS, 'answer.json'), path.join(L.store, 'brain', P, SG, 'messages', 'c0000000-0000-4000-8000-0000000000c3.json'));
      let withAnswer = null;
      try { withAnswer = await w.until(() => w.find('subagent', (r) => r.status === 'completed' && /88\/100/.test(r.result || '')), look, 'the answer'); } catch { withAnswer = null; }
      let off = false;
      try { await w.until(() => /subagent tail off/.test(wlog(w)), 4000, 'the tail off'); off = true; } catch { off = false; }
      return { withAnswer, off, log: wlog(w).slice(-300) };
    } finally { await w.stop(); }
  };
  leg(async (ok) => {
    const r = await lateLeg('agy-sub-late', WRAPPER)(ok);
    ok('B-0f7b: the sub\'s answer written THREE TAIL PERIODS after its last step is still read — the card ends completed WITH it (88/100), and then the tail stops', !!r.withAnswer && r.off, r);
  });
  leg(async (ok) => {
    const r = await lateLeg('agy-sub-none', WRAPPER, { answer: false, look: 900, bound: '1000' })(ok);
    ok('B-0f7b: a sub that never writes an answer: the tail still ends at its bound (AGY_WEBUI_SUB_ANSWER_WAIT_MS) — the card completed, no result invented', !r.withAnswer && r.off, r);
  });
  leg(async (ok) => {
    let base = '';
    try { base = (await import('node:child_process')).execFileSync('git', ['show', 'b06f36e90:data/bin/agy-wrapper.js'], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 << 20 }); } catch { base = ''; }
    if (!base) { console.log('  - SKIP B-0f7b RED control: the release b06f36e90 is not in this clone (its history is not here)'); return; }   // said by name, never counted as a pass (test-architecture §75)
    const f = path.join(MUTBIN, 'agy-wrapper-release-b06f36e90.js'); fs.writeFileSync(f, base);
    const r = await lateLeg('agy-sub-late-red', f, { look: 1200 })(ok);
    ok('B-0f7b RED control: the release\'s wrapper stops at the first ended tick — the late answer is never read (the card stays «completed» with no result)', !r.withAnswer, r);
  });
  for (const out of await Promise.all(legs)) for (const [n, c, e] of out) ok(n, verdictOf(c), e);
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
    ok('…and the shared ACP normalizer turns it into the usage meta the bar reads (last call = context + cache, totals = the odometer)', gateOf(meta) && meta.data.input_tokens === u2.last.input && meta.data.cache_read_input_tokens === u2.last.cacheRead && meta.data.totals.total_tokens === u2.total.total, meta?.data);
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
  fs.writeFileSync(red, editAnchor(src, cut, '', "data/bin/agy-wrapper.js"));
  const [viaLink, leaked] = await Promise.all([linkTurn(WRAPPER, 'real'), linkTurn(red, 'red')]); // independent: run together (the suite's 10 s tier)
  ok('THE GATE: a brain dir that LINKS out of agy\'s store is never read — `last` null, the stream\'s total still recorded', viaLink.last === null && viaLink.total.total > 0 && viaLink.total.input !== 777777, viaLink);
  ok('RED copy (the realpath check cut): the link is followed and its counts become the context (777 777 tokens)', src.split(cut).length === 2 && gateOf(leaked.last) && leaked.last.input === 777777, leaked);
}

console.log('— ⑭ THE LIVE LANE (lane agy-peer-wake): the peer-message frame idle / busy / empty / restarting / not signed in / at exit, the advert, the census');
for (const [n, c, e] of await peerLane) ok(n, verdictOf(c), e);

console.log('— ⑮–⑲ (lane agy-harness-fixes-2): the mode through the ring + a Resume, «required» is no tool, no false card on a nudge turn, a stopped process is never an error');
for (const [n, c, e] of await fixes2) ok(n, verdictOf(c), e);


console.log('— ⓣ THE ONE TABLE (B-7e49, 主开发 r2347): this file and its twin run disjoint halves of one table of legs, whole');
{
  const OWN = fs.readFileSync(path.join(REPO, FILES.heavy), 'utf8'), OTHER = fs.readFileSync(path.join(REPO, FILES.fast), 'utf8');
  for (const [n, c, e] of [...judge('heavy', LEG, OWN, OTHER), ...controls('heavy', LEG, OWN, OTHER)]) ok(n, verdictOf(c), e);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
