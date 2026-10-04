#!/usr/bin/env node
// test-exit-call — lane exit-calls-in-history (2026-10-04, the owner: "对话历史里的exit指令似乎没有正确识别和渲染"): a
// `vibespace-exit` Bash call is a MACHINE call in the chat, live and after a rebuild (src/exit-call.js).
//   ① THE PARSE over real output: the REAL data/bin/vibespace-exit, run through bash against a stub hub that answers with
//     exit-reach's own lines (run ok / exit 3 / 124 timeout / refused / not granted / could not start / cmd.exe +
//     EncodedCommand / push / pull / pull refused / list / runs / use / url, behind cd && / env / a path), merged as claude
//     merges a Bash result — machine, verb, outcome, code, and the card's words = the live card's words.
//   ② shapes that stay a Bash card (never guess): expansions, globs, ~, pipes, a second command, redirections, a forged
//     or out-of-order last line, an exit code that disagrees with the line.
//   ③ THE LIVE PAIRING (cardBelongsTo): which pending Bash call a Machines card belongs to.
//   ④ HISTORY: a claude JSONL of those calls rebuilt by the real MessageManager → every call is a Machines card, the
//     BOX-STUDIO calls are ONE machine run, no plain Bash card for them, failures on screen.
//   ⑤ LIVE: one call → ONE card (the injected card upgrades the pending Bash card); no pending call / ambiguous ⇒ the card.
//   ⑥ controls (patched copies).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mutantCopies } from './mutant-copy.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const MUT = mutantCopies('exit-call', REPO);
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 400) : '')); } };

const XC = require(path.join(REPO, 'src/exit-call.js'));
const E = require(path.join(REPO, 'src/exit-reach.js'));
const RS = await import(pathToFileURL(path.join(REPO, 'src/lib/chat-run-summary.js')).href);
const { createMessageManager } = require(path.join(REPO, 'src/normalizers.js'));

// ── the stub hub: exit-routes' answers, built from exit-reach's own words ──
const M = 'BOX-STUDIO', WIN = 'WIN-DESK1';
const SHA = 'ab'.repeat(32);
const enc = (s) => Buffer.from(s, 'utf16le').toString('base64');
const PS = `powershell -EncodedCommand ${enc('Get-Date -Format o')}`;
const RUNS = {
  hostname: { machine: M, stdout: 'BOX-STUDIO\r\n', code: 0, ms: 412 },
  'uname -a': { machine: M, stdout: 'Linux studio 6.8.0\n', code: 0, ms: 230 },
  'cmd /c exit 3': { machine: M, stderr: 'boom: no such thing\n', code: 3, ms: 120 },
  'sleep 99': { machine: M, timedOut: true, code: null, ms: 30010 },
  [PS]: { machine: WIN, stdout: '2026-10-04T09:41:00\r\n', code: 0, ms: 840, interpreter: 'cmd.exe' },
  'rm -rf /tmp/x': { refuse: 'ask_denied', status: 403 },
  whoami: { refuse: 'not_granted', status: 403 },
  'no-such-tool --x': { refuse: 'spawn_failed', status: 422, exitCode: 127 },
};
const send = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (d) => chunks.push(d));
  req.on('end', () => {
    const u = new URL(req.url, 'http://x');
    let body = {}; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { }
    if (u.pathname === '/api/agent/exit' && req.method === 'GET') return send(res, 200, { exits: [{ id: 'host-dial-BOX-STUDIO', name: M, online: true, grants: { use: true, run: true } }, { id: 'host-dial-WIN-DESK1', name: WIN, online: true, grants: { use: false, run: true, runAsk: true } }] });
    if (u.pathname === '/api/agent/exit/runs') return send(res, 200, { runs: [{ at: Date.UTC(2026, 9, 4, 9, 40), machine: M, outcome: 'ran', code: 0, ms: 412, cmd: 'hostname', stdout: 'BOX-STUDIO' }] });
    if (u.pathname === '/api/agent/exit/use') return send(res, 200, { url: 'socks5h://vs-u1:s3cretpass@127.0.0.1:41234', machine: M });
    if (u.pathname === '/api/agent/exit/run') {
      const r = RUNS[body.cmd];
      if (!r) return send(res, 400, { error: 'unknown fixture', code: 'bad_command' });
      if (r.refuse) return send(res, r.status, { error: E.refusalText(r.refuse, { machine: M, cmd: body.cmd, grant: 'run', spawnError: { code: 'ENOENT' }, interpreter: 'sh', platform: 'linux' }), code: r.refuse, ...(r.exitCode ? { exitCode: r.exitCode } : {}) });
      return send(res, 200, { machine: r.machine, code: r.code, stdout: r.stdout || '', stderr: r.stderr || '', ms: r.ms, timedOut: !!r.timedOut, line: E.cliLine({ outcome: 'ran', code: r.code, ms: r.ms, timedOut: !!r.timedOut }, { machine: r.machine }) });
    }
    if (u.pathname === '/api/agent/exit/pull') {
      if (/exists/.test(body.remote)) return send(res, 409, { error: E.refusalText('exists', { machine: M, path: body.local, side: 'local' }), code: 'exists' });
      return send(res, 200, { line: E.transferCliLine({ verb: 'pull', remote: body.remote, local: body.local, bytes: 1258291, sha256: SHA, verified: 'sha256', ms: 410 }, { machine: M }) });
    }
    if (u.pathname === '/api/agent/exit/push') {
      const q = u.searchParams;
      return send(res, 200, { line: E.transferCliLine({ verb: 'push', remote: q.get('remote'), local: q.get('local'), bytes: Number(q.get('size')), sha256: SHA, verified: 'sha256', ms: 90 }, { machine: WIN }) });
    }
    send(res, 404, { error: 'not found' });
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const API = `http://127.0.0.1:${server.address().port}`;
const SCR = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-exit-call-'));
fs.writeFileSync(path.join(SCR, 'notes.txt'), 'hello machine\n');
const BIN = path.join(REPO, 'data/bin');
/** Run a command LINE as claude's Bash tool does (bash -c) and merge its result as claude records it. */
const runLine = (line) => new Promise((resolve) => {   // async: the stub hub answers in THIS process
  const ch = spawn('bash', ['-c', line], { cwd: SCR, env: { PATH: `${BIN}:${path.dirname(process.execPath)}:/usr/bin:/bin`, HOME: SCR, VIBESPACE_API: API, VIBESPACE_SESSION_TOKEN: 'tok' } });
  let so = '', se = '';
  ch.stdout.on('data', (d) => { so += d; }); ch.stderr.on('data', (d) => { se += d; });
  const kill = setTimeout(() => ch.kill('SIGKILL'), 20000);
  ch.on('close', (status) => { clearTimeout(kill); resolve(merge({ status, stdout: so, stderr: se })); });
});
const merge = (r) => {
  const body = [String(r.stdout || '').replace(/\n+$/, ''), String(r.stderr || '').replace(/\n+$/, '')].filter(Boolean).join('\n');
  return { code: r.status, error: r.status !== 0, content: r.status ? `Exit code ${r.status}\n${body}` : body };
};

// ── ① the parse over the CLI's real output ──
console.log('① the parse over the real CLI');
const CASES = [
  { name: 'run ok', line: `vibespace-exit run ${M} -- hostname`, verb: 'run', machine: M, outcome: 'ok', code: 0, live: E.cardText({ outcome: 'ran', cmd: 'hostname', code: 0, ms: 412 }, { machine: M }) },
  { name: 'run behind cd && + env + a path to the binary', line: `cd /tmp && VIBESPACE_X=1 ${BIN}/vibespace-exit run studio -- uname -a 2>&1`, verb: 'run', machine: M, outcome: 'ok', code: 0, live: E.cardText({ outcome: 'ran', cmd: 'uname -a', code: 0, ms: 230 }, { machine: M }) },
  { name: 'run fail (exit 3)', line: `vibespace-exit run ${M} -- cmd /c exit 3`, verb: 'run', machine: M, outcome: 'exit', code: 3, live: E.cardText({ outcome: 'ran', cmd: 'cmd /c exit 3', code: 3, ms: 120 }, { machine: M }), out: 'boom: no such thing' },
  { name: '124 timeout', line: `vibespace-exit run ${M} -- sleep 99`, verb: 'run', machine: M, outcome: 'timed_out', code: 124, live: E.cardText({ outcome: 'ran', cmd: 'sleep 99', ms: 30010, timedOut: true }, { machine: M }) },
  { name: 'cmd.exe + EncodedCommand (decoded on the card)', line: `vibespace-exit run ${WIN} -- '${PS}'`, verb: 'run', machine: WIN, outcome: 'ok', code: 0, live: E.cardText({ outcome: 'ran', cmd: PS, code: 0, ms: 840 }, { machine: WIN }), words: 'PowerShell: Get-Date -Format o' },
  { name: 'refused (the user did not allow)', line: `vibespace-exit run ${M} -- rm -rf /tmp/x`, verb: 'run', machine: '', outcome: 'failed', code: 1, words: 'the user did not allow' },
  { name: 'not granted (+ the way out line)', line: `vibespace-exit run ${M} -- whoami`, verb: 'run', machine: '', outcome: 'failed', code: 1, words: 'is not open to this conversation' },
  { name: 'could not start (127)', line: `vibespace-exit run ${M} -- no-such-tool --x`, verb: 'run', machine: '', outcome: 'failed', code: 127, words: 'not found on that machine' },
  { name: 'push', line: `vibespace-exit push notes.txt ${WIN} 'C:\\Users\\me\\notes.txt'`, verb: 'push', machine: WIN, outcome: 'ok', code: 0, words: `pushed \`${path.join(SCR, 'notes.txt')}\` to ${WIN} → \`C:\\Users\\me\\notes.txt\` — 14 bytes` },
  { name: 'pull', line: `vibespace-exit pull ${M} /home/me/out.bin ./out.bin`, verb: 'pull', machine: M, outcome: 'ok', code: 0, words: `pulled \`/home/me/out.bin\` from ${M} → \`${path.join(SCR, 'out.bin')}\` — 1.2 MiB · sha256 ababababab` },
  { name: 'pull refused (exists)', line: `vibespace-exit pull ${M} /home/me/exists.bin`, verb: 'pull', machine: '', outcome: 'failed', code: 1, words: 'already exists here' },
  { name: 'list', line: 'vibespace-exit list', verb: 'list', machine: '', outcome: 'ok', code: 0, words: 'listed the machines open to this conversation', out: 'network: yes · commands: yes' },
  { name: 'runs', line: `vibespace-exit runs ${M}`, verb: 'runs', machine: M, outcome: 'ok', code: 0, words: `listed this conversation's commands on ${M}`, out: 'exit 0 · 0.4 s' },
  { name: 'use (the url secret cut on the row)', line: `vibespace-exit use ${M}`, verb: 'use', machine: M, outcome: 'ok', code: 0, words: `borrowed ${M}'s network`, noSecret: true },
  { name: 'url (the url secret cut on the row)', line: `vibespace-exit url ${M}`, verb: 'url', machine: M, outcome: 'ok', code: 0, words: `asked for ${M}'s proxy address`, noSecret: true },
];
const RESULTS = {};
for (const c of CASES) {
  const r = await runLine(c.line);
  const p = XC.exitCallOf(c.line, r.content, { error: r.error });
  const card = XC.exitCallCard(p, { id: 'm-' + c.name, ts: 1 });
  RESULTS[c.name] = { ...r, line: c.line, card };
  const words = card ? card.content[0].text : '';
  const outText = card && card.exitRun ? card.exitRun.stdout : '';
  const good = !!p && p.verb === c.verb && p.machine === c.machine && p.outcome === c.outcome && p.code === c.code && r.code === c.code
    && (!c.live || words === c.live) && (!c.words || words.includes(c.words)) && (!c.out || outText.includes(c.out))
    && (!c.noSecret || (!outText.includes('s3cretpass') && outText.includes('127.0.0.1:41234')))
    && card.exitCall.failed === (c.outcome !== 'ok') && card.exitCall.verb === (c.verb === 'run' ? 'run' : ['push', 'pull'].includes(c.verb) ? 'copy' : 'info');
  ok(good, `${c.name}: ${c.verb} · ${c.machine || '(no machine named)'} · ${c.outcome}${c.live ? ' · words = the live card\'s' : ''}`, { p: p && { ...p, output: p.output.slice(0, 120) }, words, rc: r.code, content: r.content.slice(-300) });
}
{ // int209: a lookup's words are OURS (no live card; the CLI prints a table) — every INFO_WORDS row is a zh + ja dictionary
  // key, the card carries {key, params} for the chat's t(), and filled they are exactly its English words
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  const keys = Object.values(XC.INFO_WORDS);
  const missing = keys.filter((k) => !zh.includes(`  ${JSON.stringify(k)}: `) || !ja.includes(`  ${JSON.stringify(k)}: `));
  ok(keys.length === 12 && !missing.length, `int209: the ${keys.length} lookup words are zh + ja dictionary keys`, missing);
  const info = CASES.filter((c) => XC.INFO_VERBS.includes(c.verb)).map((c) => RESULTS[c.name].card);
  const fill = (w) => w.key.replace(/\{(\w+)\}/g, (_, k) => w.params[k]);
  ok(info.length === 4 && info.every((c) => c.exitCall.words && keys.includes(c.exitCall.words.key) && c.content[0].text === fill(c.exitCall.words)), 'int209: a lookup card carries its words as a key + params (the chat translates them); filled, they are its English words', info.map((c) => c.exitCall.words));
  const refused = XC.callWords({ kind: 'info', verb: 'runs', machine: '', ref: 'box1', said: 'no such machine' });
  ok(refused === "could not list this conversation's commands on box1 — no such machine", 'int209: a refused lookup keeps the hub\'s sentence after the dash', refused);
  ok(RESULTS['run ok'].card && !('words' in RESULTS['run ok'].card.exitCall), "int209: a run card has no words key (its words are the live card's, as the hub wrote them)");
}
{ // the decoded script, as the live card shows it: exitRun.cmd = the whole command, exitCmdBlock decodes it
  const c = RESULTS['cmd.exe + EncodedCommand (decoded on the card)'].card;
  ok(c && c.exitRun && c.exitRun.cmd === PS && c.exitRun.merged === true, 'cmd.exe + EncodedCommand: the card carries the WHOLE command (decoded by the card, as live) and its output as one text', c && c.exitRun);
  const crlf = RESULTS['run ok'].card;
  ok(crlf && crlf.exitRun.stdout === 'BOX-STUDIO' && !/\r/.test(crlf.content[0].text), 'a Windows CRLF output reads as text (no CR on the card)', crlf && crlf.exitRun);
  const tail = await runLine(`cd /tmp && vibespace-exit run ${M} -- hostname`);
  ok(!!XC.exitCallOf(`cd /tmp && vibespace-exit run ${M} -- hostname`, tail.content + '\nShell cwd was reset to /var/tmp/x', { error: false }), "claude's own \"Shell cwd was reset\" tail is not the call's output");
}
// the CLI's own lines are the ones this module knows (data/bin/vibespace-exit)
const CLI = read('data/bin/vibespace-exit');
ok(CLI.includes(`const WAY_OUT = '${XC.WAY_OUT_LINE}';`), 'the way-out line is the CLI\'s own');
ok(XC.WAIT_NOTES.every((n) => CLI.includes(JSON.stringify(n))), 'both waiting notes are the CLI\'s own');

// ── ② shapes that stay a Bash card ──
console.log('② never guess');
const ran = RESULTS['run ok'].content;
const NEVER = [
  ['an expansion', 'vibespace-exit run BOX-STUDIO -- echo $HOME'], ['a glob', 'vibespace-exit run BOX-STUDIO -- ls *.txt'], ['a leading ~', 'vibespace-exit run BOX-STUDIO -- ls ~'],
  ['a pipe', 'vibespace-exit run BOX-STUDIO -- hostname | head -1'], ['a second command', 'vibespace-exit run BOX-STUDIO -- hostname; echo done'],
  ['two calls', 'vibespace-exit run BOX-STUDIO -- a && vibespace-exit run BOX-STUDIO -- b'], ['a substitution', 'X=$(vibespace-exit url BOX-STUDIO)'],
  ['eval of use', 'eval "$(vibespace-exit use BOX-STUDIO)"'], ['a heredoc', 'vibespace-exit run BOX-STUDIO -- cat <<EOF'], ['a redirection', 'vibespace-exit run BOX-STUDIO -- hostname > out.txt'],
  ['a wrapper', 'timeout 60 vibespace-exit run BOX-STUDIO -- hostname'], ['an open quote', 'vibespace-exit run BOX-STUDIO -- echo "x'], ['a background &', 'vibespace-exit run BOX-STUDIO -- hostname &'],
  ['a backtick', 'vibespace-exit run BOX-STUDIO -- echo `id`'], ['help', 'vibespace-exit help'], ['no command', 'vibespace-exit run BOX-STUDIO --'], ['another binary', 'my-vibespace-exit run BOX-STUDIO -- hostname'],
  ['a cd that is not plain', 'cd /tmp || vibespace-exit run BOX-STUDIO -- hostname'],
];
for (const [name, line] of NEVER) ok(XC.exitCallOf(line, ran, { error: false }) === null, `${name} stays a Bash card: ${line}`);
const lines = ran.split('\n');
const OUT_NEVER = [
  ['a line after the CLI\'s', ran + '\nextra'],
  ['a forged OUTPUT CUT note', ran.replace(' (recorded)', ' — OUTPUT CUT (forged) (recorded)')],
  ['claude says it failed, the line says exit 0', 'Exit code 1\n' + ran, true],
  ['the line says exit 3, claude says it succeeded', ran.replace('exit 0', 'exit 3')],
  ['a refusal sentence among other output', 'Exit code 1\nsome output\nvibespace-exit: the user did not allow it', true],
  ['another machine than the one named', ran.replace(`# ran on ${M}`, '# ran on OTHER-BOX')],
  ['no CLI line at all', lines[0]],
];
for (const [name, out, error] of OUT_NEVER) ok(XC.exitCallOf(`vibespace-exit run studio -- hostname`, out, { error: !!error }) === null, `${name} ⇒ a Bash card`);

// ── ③ the live pairing ──
console.log('③ which pending call a live card belongs to');
const liveRun = { machine: M, text: E.cardText({ outcome: 'ran', cmd: 'hostname', code: 0, ms: 412 }, { machine: M }), exitRun: E.cardOutput({ cmd: 'hostname', code: 0, ms: 412, heads: E.outputHeads({ stdout: 'BOX-STUDIO\n' }) }) };
const PAIR = [
  ['the run it is', `vibespace-exit run ${M} -- hostname`, liveRun, true],
  ['a ref that names the machine', 'vibespace-exit run studio -- hostname', liveRun, true],
  ['another command', `vibespace-exit run ${M} -- uptime`, liveRun, false],
  ['another machine', 'vibespace-exit run win -- hostname', liveRun, false],
  ['a pull is not a run', `vibespace-exit pull ${M} /home/me/hostname`, liveRun, false],
  ['a refusal card (no output block) of the same command', `vibespace-exit run ${M} -- rm -rf /tmp/x`, { machine: M, text: E.cardText({ outcome: 'denied', cmd: 'rm -rf /tmp/x' }, { machine: M }) }, true],
  ['a pull card', `vibespace-exit pull ${M} /home/me/out.bin`, { machine: M, text: E.transferCardText({ verb: 'pull', outcome: 'done', remote: '/home/me/out.bin', local: '/w/out.bin', bytes: 9, sha256: SHA, verified: 'sha256', ms: 5 }, { machine: M }) }, true],
  ['a push card (a relative local path)', `vibespace-exit push notes.txt ${WIN} C:/notes.txt`, { machine: WIN, text: E.transferCardText({ verb: 'push', outcome: 'denied', remote: 'C:/notes.txt', local: '/w/notes.txt' }, { machine: WIN }) }, true],
  ['a loop of calls', `for m in a b; do vibespace-exit run $m -- hostname; done`, liveRun, false],
];
for (const [name, line, card, want] of PAIR) ok(XC.cardBelongsTo(line, card) === want, `${name} ⇒ ${want ? 'belongs' : 'does not'}`);

// ── ④ history ──
console.log('④ a history rebuild draws machine cards');
const HIST = ['list', 'run ok', 'run fail (exit 3)', 'refused (the user did not allow)', 'use (the url secret cut on the row)', 'pull', '124 timeout'];
const recs = [];
let n = 0;
const at = (k) => new Date(Date.UTC(2026, 9, 4, 9, 39, k)).toISOString();
recs.push({ type: 'user', uuid: 'u0', timestamp: at(0), message: { role: 'user', content: 'check the machine' } });
for (const name of HIST) {
  const r = RESULTS[name], id = `toolu_${++n}`;
  recs.push({ type: 'assistant', uuid: `a${n}`, timestamp: at(2 * n), message: { id: `msg_${n}`, role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'tool_use', id, name: 'Bash', input: { command: r.line, description: name } }] } });
  recs.push({ type: 'user', uuid: `r${n}`, timestamp: at(2 * n + 1), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: r.content, is_error: r.error }] }, toolUseResult: r.error ? `Error: ${r.content}` : { stdout: r.content, stderr: '', interrupted: false, isImage: false } });
}
recs.push({ type: 'assistant', uuid: 'a-x', timestamp: at(40), message: { id: 'msg_x', role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_x', name: 'Bash', input: { command: 'ls -la' } }] } });
recs.push({ type: 'user', uuid: 'r-x', timestamp: at(41), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_x', content: 'total 0', is_error: false }] } });
fs.writeFileSync(path.join(SCR, 'history.jsonl'), recs.map((r) => JSON.stringify(r)).join('\n') + '\n');
const HISTORY = (rs) => {
  const mm = createMessageManager('claude', 'hist');
  mm.convertHistory(fs.readFileSync(path.join(SCR, 'history.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)));
  const tools = mm.messages.filter((m) => m.role === 'tool');
  const kinds = tools.map((m) => rs.messageKind(m, { toolCard: true }));
  const cards = tools.map((m) => rs.machineCardOf(m));
  const runs = rs.splitRuns(tools, (m) => (rs.messageKind(m, { toolCard: true }) === 'machine' ? 'noise' : null), (m) => rs.machineCardOf(m)?.machine || null);
  const part = rs.machineRunPart({ cards: cards.slice(0, HIST.length), time: () => '09:39' }, (s, p) => s.replace(/\{(\w+)\}/g, (_, k) => p[k]));
  const lines = tools.map((m) => rs.machineLineOf(m));
  return { tools, kinds, cards, runs, part, lines };
};
const H = HISTORY(RS);
ok(H.tools.length === HIST.length + 1, `the rebuild has the ${HIST.length + 1} tool calls`, H.tools.length);
ok(H.kinds.slice(0, HIST.length).every((k) => k === 'machine') && H.kinds[HIST.length] === 'bash', 'every vibespace-exit call is a Machines card; the plain `ls -la` stays Bash', H.kinds);
ok(H.runs.length === 1 && H.runs[0].length === HIST.length, 'the calls are ONE machine run (list and the refusal join their machine)', H.runs.map((r) => r.length));
ok(!!H.part && H.part.text === `${M} · 4 commands · 1 files · 2 lookups · 3 failed · last: timed out` && H.part.failed === 3, 'the head: the machine, the counts, the lookups apart, the failures, the last outcome', H.part);
ok(H.cards.filter(Boolean).filter((c) => c.failed).length === 3 && H.cards[2].failed && H.cards[3].failed && H.cards[6].failed, 'exit 3, the refusal and the timeout are failures (on screen in a closed fold)', H.cards);
ok(H.lines[1] && H.lines[1].text === 'hostname · exit 0 · 0.4 s' && H.lines[2].error === 'boom: no such thing' && H.lines[3].outcome.startsWith('did not run — the user did not allow'), 'the compact lines: command · outcome, the first error line, the refusal said', H.lines.slice(1, 4));
ok(RS.exitCallCardOf(H.tools[HIST.length]) === null && RS.machineLineOf(H.tools[HIST.length]) === null, 'a plain Bash call draws no machine card');

// ── ⑤ live ──
console.log('⑤ live: one call → one card');
const LIVE = (MM) => {
  const mm = new MM('claude-live');
  const ops = []; mm.onOp((op) => ops.push(op));
  const r = RESULTS['run ok'];
  mm.processLive({ type: 'assistant', message: { id: 'msg_l1', role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_l1', name: 'Bash', input: { command: r.line } }] } });
  const before = mm.messages.length;
  const card = { fromName: `Machines · ${M}`, kind: 'notification', text: liveRun.text, exitRun: liveRun.exitRun };
  const ret = mm.injectPeerCard({ ...card, belongsTo: XC.cardMatcher(card) }); // as server.js wires the exit proxy's emitCard
  const mid = mm.messages.slice();
  const tool = mid.find((m) => m.role === 'tool');
  const pendingCard = RS.exitCallCardOf(tool);
  mm.processLive({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_l1', content: r.content, is_error: false }] } });
  const after = mm.messages;
  const drawn = after.filter((m) => RS.machineCardOf(m));
  // a conversation with no pending Bash call (a terminal session, a helper's call): the card as before
  const mm2 = new MM('claude-live-2');
  const c2 = mm2.injectPeerCard({ ...card, belongsTo: XC.cardMatcher(card) });
  // two identical pending calls: never guess — the card as before
  const mm3 = new MM('claude-live-3');
  for (const k of [1, 2]) mm3.processLive({ type: 'assistant', message: { id: 'msg_d' + k, role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_d' + k, name: 'Bash', input: { command: r.line } }] } });
  const c3 = mm3.injectPeerCard({ ...card, belongsTo: XC.cardMatcher(card) });
  return { before, ret, mid, tool, pendingCard, after, drawn, ops, c2, c3 };
};
const { MessageManager } = require(path.join(REPO, 'src/message-manager.js'));
const L = LIVE(MessageManager);
ok(L.mid.length === L.before && L.ret === L.tool && !L.ops.some((o) => o.op === 'create' && o.message && o.message.originKind === 'peer-message'), 'the injected card creates NO second message — it upgrades the pending Bash card', { before: L.before, mid: L.mid.length });
ok(L.ops.some((o) => o.op === 'edit' && o.id === L.tool.id && o.fields && o.fields.exitCard), 'one edit op carries the live card onto the Bash card');
ok(L.pendingCard && L.pendingCard.content[0].text === liveRun.text && L.pendingCard.exitRun === liveRun.exitRun, 'while the call runs, the Bash card draws the live card\'s words and output block');
ok(L.drawn.length === 1 && RS.exitCallCardOf(L.drawn[0]).content[0].text === liveRun.text, 'after the result: ONE Machines card, its words = the live card\'s (= history\'s)', L.drawn.length);
ok(L.c2 && L.c2.originKind === 'peer-message' && L.c2.exitRun, 'no Bash card for it (a terminal session, a script): the injected card still appears');
ok(L.c3 && L.c3.originKind === 'peer-message', 'two identical pending calls: never guess — the injected card appears');
ok(read('server.js').includes("emitCard: (s, card) => feedPeerCard(s, { ...card, belongsTo: require('./src/exit-call.js').cardMatcher(card) })"), 'server.js hands the exit proxy\'s cards their matcher (the wiring the live leg stands for)');
ok(!/require\(['"]\.\/exit-(call|reach)/.test(read('src/message-manager.js')), 'message-manager names no exit module (it is bundled into the device agent — test-architecture §52b)');

// ── ⑥ controls ──
console.log('⑥ controls (patched copies)');
const XSRC = read('src/exit-call.js');
const xcControl = (tag, from, to, why, want) => {
  if (!XSRC.includes(from)) { ok(false, `CONTROL ${tag}: the anchor is gone`, from); return; }
  const X = require(MUT.write('src/exit-call.js', XSRC.replace(from, to), tag));
  const red = want(X);
  ok(red, `CONTROL ${tag}: ${why} — goes red`);
};
xcControl('no-rebuild', "if (E.cliLine({ outcome: 'ran', code, ms, timedOut, truncated }, { machine }) !== last) return null;", '', 'the last line is not rebuilt by the CLI\'s producer', (X) => X.exitCallOf('vibespace-exit run studio -- hostname', ran.replace(' (recorded)', ' — OUTPUT CUT (forged) (recorded)'), { error: false }) !== null);
xcControl('no-exit-check', 'if (exitCode !== (timedOut ? 124 : code)) return null;', '', 'claude\'s exit code is not compared', (X) => X.exitCallOf('vibespace-exit run studio -- hostname', ran.replace('exit 0', 'exit 3'), { error: false }) !== null);
xcControl('dollar-ok', "if ('|;&<>()`$*?[]{}\\n\\r#'.includes(c)) return null;", "if ('|;&<>()`*?[]{}\\n\\r#'.includes(c)) return null;", 'an expansion read as a word', (X) => X.exitCallOf('vibespace-exit run BOX-STUDIO -- echo $HOME', ran, { error: false }) !== null);
xcControl('any-ref', 'if (!refNames(call.ref, machine)) return null;', '', 'a line naming another machine is believed', (X) => X.exitCallOf('vibespace-exit run studio -- hostname', ran.replace(`# ran on ${M}`, '# ran on OTHER-BOX'), { error: false }) !== null);
const MMSRC = read('src/message-manager.js');
{
  const from = "const host = !msgId && kind === 'notification' && typeof belongsTo === 'function' ? this._exitCallHost(fromName, belongsTo) : null;";
  if (!MMSRC.includes(from)) ok(false, 'CONTROL no-upgrade: the anchor is gone');
  else {
    const { MessageManager: MMx } = require(MUT.write('src/message-manager.js', MMSRC.replace(from, 'const host = null;'), 'no-upgrade'));
    const Lx = LIVE(MMx);
    ok(Lx.after.filter((m) => RS.machineCardOf(m)).length === 2, 'CONTROL no-upgrade: the live card is a second card — ⑤ goes red (two cards for one call)', Lx.after.length);
  }
}
const RSSRC = read('src/lib/chat-run-summary.js');
{
  const from = "  if (!b0 || b0.toolName !== 'Bash' || typeof b0.input?.command !== 'string') return null;";
  if (!RSSRC.includes(from)) ok(false, 'CONTROL no-recognition: the anchor is gone');
  else {
    const rs = await import(pathToFileURL(MUT.write('src/lib/chat-run-summary.js', RSSRC.replace(from, '  return null;'), 'no-recognition', { esm: true })).href);
    const Hx = HISTORY(rs);
    ok(Hx.kinds.every((k) => k === 'bash'), 'CONTROL no-recognition (the base): every call is a plain Bash card — ④ goes red', Hx.kinds);
  }
}

server.close();
fs.rmSync(SCR, { recursive: true, force: true });
console.log(`\n${fail ? `✗ ${fail} FAILED` : `ALL PASS (${pass})`}`);
process.exit(fail ? 1 : 0);
