#!/usr/bin/env node
// ONE TEXT PER FREE-TEXT COMMAND (lane cli-one-text-arg, the owner 2026-10-14; gate row `test-cli-one-text`, fast).
// An agent's Lark reply reached the person cut mid-sentence: an inner `"` closed the shell string, so the shell handed
// vibespace-channels three words; it sent the first and DROPPED the rest without a word. vibespace-msg send did the same;
// vibespace-ask and vibespace-task progress / backlog-add JOINED the words (the quotes lost, the bug hidden). The rule the
// four agent CLIs now share is PURE src/agent-cli-text.js (a checkout reads it there; a host its boot-time copy
// agent-cli-text.js beside the CLIs). This suite gates it:
//   §1 the PURE rule: chars (code points), takeDoors, textOf, positionals, strayRefusal (the brief's sentence), sentLine
//   §2 THE CENSUS: every command of the four CLIs' usage tables (grep-derived) has a verdict — one-text (refuses a stray
//      word, takes --text-file / --text -, echoes the count) / guard (refuses a stray word, no text of its own) / lookup /
//      members / name / no-text — a usage command without a row, or a row without a command, is red
//   §3 every one-text / guard command against a FAKE route (a loopback server that counts calls): a stray word ⇒ exit 2,
//      the named sentence quoting the first stray word, ZERO requests; the same words as ONE argument ⇒ exit 0, the route
//      got them whole, `sent: N characters` printed
//   §4 the doors: --text-file and --text - round-trip quotes / newlines / CJK / $( ) / backticks byte for byte (ONE trailing
//      newline trimmed); --detail-file on ask / task; a text given twice, a missing file, nothing piped in ⇒ refused, 0 sent
//   §5 the echo is the ROUTE's count: a route that kept fewer ⇒ the cut is said; an older route (no chars) ⇒ the CLI's own
//   §6 CONTROLS: copies without the stray scan reproduce the incident (exit 0, the first piece sent, the rest dropped) and
//      the pre-fix join (ask) — each RED under §3's judge; a host layout finds the copy beside it, and without it REFUSES
//   §7 the wiring: the routes answer chars, the boot-time copy, AGENT_TOOLS, .gitignore, the usage + manual lines
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1200) : '')); } };
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

const ROOT = scratch('cli-one-text');
const cleanup = () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });

const T = require(path.join(REPO, 'src/agent-cli-text.js'));
const CLI = (n) => path.join(REPO, 'data/bin/vibespace-' + n);

console.log('§1 the PURE rule (src/agent-cli-text.js)');
{
  ok(T.chars('若对照') === 3 && T.chars('a😀b') === 3 && T.chars('') === 0 && T.chars(null) === 0, 'chars counts code points (CJK = 1, an emoji = 1, never UTF-16 units)');
  ok(T.trimOnce('x\n\n') === 'x\n' && T.trimOnce('x\r\n') === 'x' && T.trimOnce('x') === 'x', 'a file\'s text loses ONE trailing newline, nothing else');
  const d = T.takeDoors(['g-1', '--text', '-', '--wake'], ['text']);
  ok(JSON.stringify(d.argv) === '["g-1","--wake"]' && d.doors.text.stdin === true && !d.error, '--text - is the stdin door; the rest of argv keeps its order');
  const f = T.takeDoors(['--text-file=/x/y', 'a'], ['text']);
  ok(f.doors.text.file === '/x/y' && JSON.stringify(f.argv) === '["a"]', '--text-file=<path> (the = form) is the file door');
  ok(T.takeDoors(['--text', 'hi'], ['text']).doors.text.value === 'hi', '--text <words> is the text as one argument');
  ok(/given twice/.test(T.takeDoors(['--text', 'a', '--text-file', 'b'], ['text']).error || ''), 'two doors for one text are refused');
  ok(/only one text can come from stdin/.test(T.takeDoors(['--text', '-', '--detail-file', '-'], ['text', 'detail']).error || ''), 'two stdin doors are refused');
  ok(/needs a value/.test(T.takeDoors(['--text-file'], ['text']).error || ''), 'a door without its value is refused');
  ok(JSON.stringify(T.takeDoors(['--detail-file', 'p'], ['text']).argv) === '["--detail-file","p"]', 'a door the command does not have stays in argv (the stray scan names it)');
  ok(/given twice/.test(T.textOf('typed', { file: 'p', flag: '--text-file' }, {}).error || ''), 'the argument AND a door ⇒ refused (given twice)');
  ok(/nothing is piped in/.test(T.readDoor({ stdin: true, flag: '--text' }, { stdinIsTTY: true }).error || ''), 'stdin that is a terminal (or /dev/null) is refused, never waited on');
  ok(/no such file/.test(T.readDoor({ file: '/nope', flag: '--text-file' }, { readFile: () => { const e = new Error('x'); e.code = 'ENOENT'; throw e; } }).error || ''), 'a missing file is named');
  const pos = T.positionals(['lark/oc_1', 'first', 'vs', '--to', 'om_1', '--why', 'w', '--in-thread', 'tail', '--all', 'x'], { valued: ['--why'], optional: ['--to', '--in-thread'], bare: ['--all'] });
  ok(JSON.stringify(pos.map((p) => p.word)) === '["lark/oc_1","first","vs","x"]', 'positionals: a valued flag takes the next word, an optional one takes it unless it is a flag, a bare one none', pos);
  const unk = T.positionals(['acct', 'text', '--subject', 'S'], { valued: [] });
  ok(unk[2] && unk[2].word === 'S' && unk[2].after === '--subject', 'positionals: a word after a flag the verb does not know carries that flag (`after`)');
  const s = T.strayRefusal({ tool: 'vibespace-channels reply', strays: ['vs', '人员名单会对不上'] });
  ok(s === 'vibespace-channels reply: refused — a message is ONE argument — 2 more words followed it ("vs", …): a quote in the text probably closed early; put the text in a file (--text-file <path>) or on stdin (--text -), or escape the inner quotes — nothing was sent', 'THE sentence (the brief\'s words): the count, the first stray word quoted, the likely cause, both doors', s);
  ok(/1 more word followed it \("tail"\)/.test(T.strayRefusal({ tool: 't', strays: ['tail'] })), 'one stray word: singular, no ellipsis');
  ok(/"--subject" is not an option of vibespace-channels reply/.test(T.strayRefusal({ tool: 'vibespace-channels reply', strays: ['--subject'] })), 'a stray FLAG is named as a flag the command does not take');
  ok(T.strayRefusal({ tool: 't', strays: [] }) === null, 'nothing stray ⇒ no refusal');
  ok(T.sentLine({ chars: 412 }, 'x'.repeat(412)) === 'sent: 412 characters', 'the echo: sent: N characters (the route\'s count)');
  ok(T.sentLine({ chars: 10 }, 'y'.repeat(25)) === 'sent: 10 characters — 25 were given: the last 15 were CUT', 'a route that kept fewer ⇒ the cut is SAID');
  ok(T.sentLine({}, '若对照') === 'sent: 3 characters', 'an older route without chars ⇒ the CLI\'s own count');
  ok(T.sentLine({ chars: 3, detailChars: 2 }, 'abc', 'de ') === 'sent: 3 characters + --detail 2', 'a --detail count rides the same line');
}

// ── the FAKE route: counts every call, answers each path in the shape its CLI prints; `chars` = what it got, counted
const FAKE = { calls: [], mode: 'count' };
const kept = (t) => (FAKE.mode === 'cut' ? [...String(t)].slice(0, 10).join('') : String(t));
const counted = (t) => (FAKE.mode === 'none' ? {} : { chars: T.chars(kept(t)) });
const srv = http.createServer((req, res) => {
  let b = '';
  req.on('data', (c) => { b += c; });
  req.on('end', () => {
    let body = {}; try { body = JSON.parse(b || '{}'); } catch { }
    const u = new URL(req.url, 'http://x');
    FAKE.calls.push({ method: req.method, path: u.pathname, body, q: Object.fromEntries(u.searchParams) });
    const p = u.pathname;
    let j = { error: 'no such fake route ' + p };
    if (p === '/api/agent/msg/send') j = { posted: true, group: { id: 'g-1', name: 'G', pair: false }, woke: [], refused: [], nextTurn: [], ...counted(body.text) };
    else if (p === '/api/agent/msg/dispatch') j = { dispatched: true, posted: true, group: { id: 'g-1', name: 'G', pair: true }, record: { compacted: false, why: 'idle', wake: { billed: false, reason: 'fake' } }, ...counted(body.text) };
    else if (p === '/api/agent/user-todo' && body.add) j = { success: true, item: { id: 't-1', text: kept(body.add.text), ...(body.add.detail ? { detail: body.add.detail } : {}) }, ...counted(body.add.text), ...(body.add.detail ? { detailChars: T.chars(body.add.detail) } : {}) };
    else if (p === '/api/agent/user-todo') j = { success: true, items: [] };
    else if (p === '/api/agent/task-progress') j = { success: true, entry: { id: 'P-1' }, ...counted(body.note), ...(body.detail ? { detailChars: T.chars(body.detail) } : {}) };
    else if (p === '/api/agent/task-backlog' && body.add !== undefined) j = { success: true, item: { id: 'B-1111', text: String(body.add).trim(), status: 'open' }, backlog: [], ...counted(body.add) };
    else if (p === '/api/agent/task-backlog' && body.edit !== undefined) j = { success: true, item: { id: 'B-1111', text: body.text }, backlog: [], ...(body.text !== undefined ? counted(body.text) : {}) };
    else if (p === '/api/agent/group-admin') j = { group: { id: 'T-1', title: 't', sessions: 0 } };
    else if (p === '/api/agent/channels/reply') j = { ok: true, proposal: { id: 'pr-1', state: 'awaiting-approval', policy: { reasons: [] }, placement: 'chat' }, ...counted(body.text) };
    else if (p === '/api/agent/channels/compose') j = { ok: true, proposal: { id: 'pr-2', state: 'awaiting-approval', policy: { reasons: [] }, compose: { to: ['a@example.com'] } }, ...counted(body.text) };
    else if (p === '/api/agent/channels/request') j = { ok: true, request: { id: 'rq-1' }, ...counted(body.why) };
    else if (p === '/api/agent/channels/react') j = { ok: true, proposal: { id: 'pr-3', state: 'awaiting-approval', reaction: { op: 'add', key: body.key, msg: body.msg } } };
    else if (/^\/api\/agent\/channels\/proposals\/[^/]+\/withdraw$/.test(p)) j = { ok: true, proposal: { id: 'pr-1' } };
    else if (p === '/api/agent/channels/search') j = { ok: true, results: [], covered: 0 };
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(j));
  });
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const API = `http://127.0.0.1:${srv.address().port}`;
/** run a CLI: `input` = its stdin (a pipe; null = /dev/null); → { code, out, err, calls } (the calls made by THIS run) */
const run = (file, args, { input = '', mode = 'count', cwd = ROOT } = {}) => new Promise((resolve) => {
  FAKE.mode = mode;
  const before = FAKE.calls.length;
  const c = spawn(process.execPath, [file, ...args], { cwd, env: { PATH: process.env.PATH, HOME: ROOT, VIBESPACE_API: API, VIBESPACE_SESSION_TOKEN: 'vsst_onetext' }, stdio: [input === null ? 'ignore' : 'pipe', 'pipe', 'pipe'] });
  let out = '', err = '';
  c.stdout.on('data', (d) => { out += d; });
  c.stderr.on('data', (d) => { err += d; });
  if (input !== null) c.stdin.end(input);
  const t = setTimeout(() => c.kill('SIGKILL'), 15000);
  c.on('close', (code) => { clearTimeout(t); resolve({ code, out, err, calls: FAKE.calls.slice(before) }); });
});

// ── §2 THE CENSUS — the commands each usage table names (grep-derived), each with its verdict
// one-text: [verdict, the argv BEFORE the text, the argv AFTER it, the route + how it holds the text]
// guard:    [verdict, an argv whose last words are stray (a --why / a query whose quote closed early)]
const SENT = {
  msg: (b) => b.text, dispatch: (b) => b.text, ask: (b) => b.add && b.add.text, progress: (b) => b.note, backlogAdd: (b) => b.add,
  reply: (b) => b.text, compose: (b) => b.text, request: (b) => b.why,
};
const VERDICTS = {
  'msg send': ['one-text', 'msg', ['send', 'g-1'], ['--wake'], '/api/agent/msg/send', SENT.msg, 'a message to an agent or a group'],
  'msg dispatch': ['one-text', 'msg', ['dispatch', 'worker-1'], [], '/api/agent/msg/dispatch', SENT.dispatch, 'a brief (also --file <path>, as before)'],
  'msg list': ['no-text', 'the sessions you can message'], 'msg group list': ['no-text', 'your groups'], 'msg read': ['no-text', 'a group id + --before / --limit'],
  'msg group create': ['members', 'a name + members — a stray word is a MEMBER the server refuses by name (not-found / unreachable), nothing posted; --context is a flag'],
  'msg group invite': ['members', 'members — the same: a stray word is a member the server refuses by name'],
  'msg group leave': ['no-text', 'a group id'], 'msg group kick': ['no-text', 'a group id + a member'], 'msg group archive': ['no-text', 'a group id'], 'msg group notify': ['no-text', 'a group id + a mode the server checks'],
  'msg group rename': ['name', 'the new name is the rest JOINED on purpose (a name, ≤ 80 chars) and the answer echoes it whole (renamed to "…")'],
  'channels reply': ['one-text', 'channels', ['reply', 'lark/oc_1'], ['--to', 'om_1', '--why', 'answer'], '/api/agent/channels/reply', SENT.reply, 'a message to a person — THE incident'],
  'channels compose': ['one-text', 'channels', ['compose', 'gmail-1', '--to', 'a@example.com', '--subject', 'Hi'], [], '/api/agent/channels/compose', SENT.compose, 'a NEW message (it took the LAST free word — a quote that closed early sent only the tail)'],
  'channels request': ['one-text', 'channels', ['request', 'lark/oc_1'], [], '/api/agent/channels/request', SENT.request, 'the reason the user reads'],
  'channels react': ['guard', 'channels', ['react', 'lark/oc_1', 'om_1', 'THUMBSUP', '--why', 'because', 'vs', 'that'], 'its --why (a word after the emoji key)'],
  'channels unreact': ['guard', 'channels', ['unreact', 'lark/oc_1', 'om_1', 'THUMBSUP', '--why', 'because', 'vs'], 'its --why'],
  'channels withdraw': ['guard', 'channels', ['withdraw', 'pr-1', '--why', 'because', 'vs'], 'its --why (a word after the id)'],
  // lane channels-proposals-recall: the list takes no text; a recall's --why is guarded like withdraw's (a word after the id)
  'channels proposals': ['no-text', 'none (--all is a flag)'],
  'channels recall': ['guard', 'channels', ['recall', 'lark/oc_1', 'om_1', '--why', 'because', 'vs'], 'its --why (a word after the message id)'],
  'channels search': ['guard', 'channels', ['search', 'two', 'words'], 'the query — never a narrower search than the one typed'],
  'channels list': ['no-text', 'conversations'], 'channels read': ['no-text', 'a conversation + flags'], 'channels attachment': ['no-text', 'a message id + an attachment id'], 'channels refresh': ['no-text', 'a conversation'],
  'channels status': ['no-text', 'an id'], 'channels watch': ['no-text', 'rule flags the SERVER parses (src/channel-watch-spec.js refuses an unexpected word by name)'],
  'channels watches': ['no-text', 'none'], 'channels unwatch': ['no-text', 'a target'],
  // lane pod-oauth-callback: an account TYPE (lark / gmail …) — no text; a word after it is refused (exit 2), nothing posted
  'channels connect': ['no-text', 'an account type — a stray word after it is refused (exit 2), nothing posted'],
  'channels api': ['no-text', 'a raw vendor call — its body is --json / --body @file / --body - (a door of its own)'], 'channels api creds': ['no-text', 'none'], 'channels api wait': ['no-text', 'a proposal id'],
  'ask (question)': ['one-text', 'ask', [], ['--urgency', 'high'], '/api/agent/user-todo', SENT.ask, 'a question to the user (it JOINED the words: the quotes lost, the bug hidden); --detail-file for the detail'],
  'ask list': ['no-text', 'none'], 'ask resolve': ['lookup', 'an id or a unique text fragment — joined on purpose; a stray word makes the lookup miss by name'],
  'ask show': ['lookup', 'an id'], 'ask clear': ['lookup', 'an id'],
  'task progress': ['one-text', 'task', ['progress'], ['--detail', 'ctx'], '/api/agent/task-progress', SENT.progress, 'a summary other agents read (it JOINED the words); --detail-file for the detail'],
  'task backlog-add': ['one-text', 'task', ['backlog-add'], [], '/api/agent/task-backlog', SENT.backlogAdd, 'an item (it JOINED the words)'],
  'task backlog-edit': ['text-flag', 'the new text is --text "…" | --text - | --text-file <path>; the ref is a lookup'],
  'task group-create': ['guard', 'task', ['group-create', '--title', 'Two', 'words'], 'its --title / --objective (it takes no word of its own)'],
  'task group-update': ['guard', 'task', ['group-update', 'T-1', '--objective', 'one', 'two'], 'its --title / --objective (a word after the id)'],
  'task show': ['no-text', 'none'], 'task progress-redact': ['lookup', 'an entry id'], 'task backlog': ['lookup', 'an id / # / unique text'],
  'task backlog-claim': ['lookup', 'a ref'], 'task backlog-unclaim': ['lookup', 'a ref'], 'task backlog-done': ['lookup', 'a ref'], 'task backlog-drop': ['lookup', 'a ref'],
  'task group-list': ['no-text', 'none'], 'task group-bind': ['no-text', 'a group id + --session'], 'task group-unbind': ['no-text', 'a group id + --session'],
};
console.log('§2 the census: every usage-table command of the four CLIs has a verdict');
/** the commands a CLI's usage table names: `  vibespace-<cli> <verb>` lines (`group <op>` / `api <sub>`, a quoted text = the
 *  default form), and the `| <op> <…>` alternatives on a `group` line */
function usageCommands(cli, src) {
  const out = new Set();
  const re = new RegExp(String.raw`^[\s'"]*vibespace-${cli} ((?:group |api )?[a-z][a-z-]*|"[^"\n]*")(.*)$`, 'gm');
  for (const m of src.matchAll(re)) {
    const verb = m[1].startsWith('"') ? '(question)' : m[1];
    out.add(`${cli} ${verb}`);
    if (verb.startsWith('group ')) for (const alt of m[2].split(' | ').slice(1)) { const w = /^\s*([a-z][a-z-]*)\b/.exec(alt); if (w) out.add(`${cli} group ${w[1]}`); }
  }
  return out;
}
const derived = new Set();
for (const cli of ['msg', 'channels', 'ask', 'task']) for (const c of usageCommands(cli, read('data/bin/vibespace-' + cli))) derived.add(c);
const rows = Object.keys(VERDICTS);
ok(derived.size >= 50, `the census is derived from the usage tables (${derived.size} commands)`, [...derived]);
const unjudged = [...derived].filter((c) => !VERDICTS[c]);
ok(!unjudged.length, 'every usage command has a verdict row (a NEW command is red here until judged)', unjudged);
const dead = rows.filter((r) => !derived.has(r));
ok(!dead.length, 'no verdict row outlives its command', dead);
const unsaid = rows.filter((r) => !['one-text', 'guard', 'text-flag', 'lookup', 'members', 'name', 'no-text'].includes(VERDICTS[r][0]) || typeof VERDICTS[r][VERDICTS[r].length - 1] !== 'string' || VERDICTS[r][VERDICTS[r].length - 1].length < 4);
ok(!unsaid.length, 'every verdict is of the closed set and says why', unsaid);
{ // the census's own control: a usage line for a new free-text verb is caught by name
  const planted = usageCommands('msg', read('data/bin/vibespace-msg') + '\n  vibespace-msg shout <agent> "text"   ← planted\n');
  ok(planted.has('msg shout') && !VERDICTS['msg shout'], 'CONTROL: a planted usage line (vibespace-msg shout) is derived — and has no verdict, so it would be red');
}
const ONE = rows.filter((r) => VERDICTS[r][0] === 'one-text');
const GUARD = rows.filter((r) => VERDICTS[r][0] === 'guard');
ok(ONE.length === 8 && GUARD.length === 7 /* lane channels-proposals-recall: + channels recall */, `${ONE.length} one-text commands, ${GUARD.length} guard commands carry legs below`);

// the incident's shape — invented words, the same three pieces the shell made of the agent's reply
const PIECES = ['……若对照有源码权限的人', 'vs', '人员名单会对不上。\n2. 某同事 …'];
const WHOLE = 'a "quoted" line — 若对照"有源码权限的人 vs 人员名单"会对不上。\n2. second line';

console.log('§3 a stray word ⇒ exit 2, the named sentence, ZERO requests; ONE argument ⇒ sent whole + the echo');
/** THE judge of a stray leg (the controls of §6 run it on the pre-fix copies) */
const strayJudge = (r, tool) => r.code === 2 && r.calls.length === 0 && r.err.includes(`${tool}: refused — `) && /ONE argument — \d+ more words? followed it \("/.test(r.err) && /nothing was (sent|filed|recorded)/.test(r.err);
for (const row of ONE) {
  const [, cli, pre, post, route, sentOf] = VERDICTS[row];
  const tool = row === 'ask (question)' ? 'vibespace-ask' : 'vibespace-' + row;
  const s = await run(CLI(cli), [...pre, ...PIECES, ...post]);
  ok(strayJudge(s, tool) && s.err.includes('2 more words followed it ("vs", …)'), `${row}: the incident shape is REFUSED by name, nothing sent`, s.err || s.out);
  const w = await run(CLI(cli), [...pre, WHOLE, ...post]);
  const got = w.calls.filter((c) => c.path === route);
  ok(w.code === 0 && got.length === 1 && String(sentOf(got[0].body)).trim() === WHOLE.trim() && w.out.includes(`sent: ${T.chars(WHOLE.trim())} characters`), `${row}: the same words as ONE argument ⇒ sent whole, the echo says ${T.chars(WHOLE.trim())} characters`, w.err || w.out);
}
for (const row of GUARD) {
  const [, cli, argv] = VERDICTS[row];
  const s = await run(CLI(cli), argv);
  ok(strayJudge(s, 'vibespace-' + row), `${row}: a stray word is REFUSED by name, nothing sent`, s.err || s.out);
}
{ // the guards' valid calls still go through
  const a = await run(CLI('channels'), ['react', 'lark/oc_1', 'om_1', 'THUMBSUP', '--why', 'because of that']);
  ok(a.code === 0 && a.calls.length === 1 && a.calls[0].body.why === 'because of that', 'channels react: a --why given as ONE argument still proposes', a.err || a.out);
  const q = await run(CLI('channels'), ['search', 'two words', '--account', 'lark']);
  ok(q.code === 0 && q.calls.length === 1 && q.calls[0].q.q === 'two words', 'channels search: the words as ONE argument still search', q.err || q.out);
  const x = await run(CLI('channels'), ['reply', 'lark/oc_1', 'hi', '--subject', 'S']);
  ok(x.code === 2 && x.calls.length === 0 && /"--subject" is not an option of vibespace-channels reply, so the word after it stood alone/.test(x.err), 'channels reply: a word after a flag the verb does not take is refused, naming that flag', x.err);
  const y = await run(CLI('msg'), ['send', 'g-1', 'hi', '--loud']);
  ok(y.code === 2 && y.calls.length === 0 && /"--loud" is not an option of vibespace-msg send/.test(y.err), 'msg send: an unknown flag after the text is refused by name (it used to be dropped)', y.err);
}

console.log('§4 the doors: --text-file / --text - / --detail-file');
const BYTES = 'He said "stop" — it\'s $(not run) and `not run`\n若对照"有源码权限的人 vs 人员名单"\ttab 😀\n';
const FILE = path.join(ROOT, 'reply.txt');
fs.writeFileSync(FILE, BYTES);
const EXPECT = BYTES.slice(0, -1);   // ONE trailing newline trimmed
for (const row of ONE) {
  const [, cli, pre, post, route, sentOf] = VERDICTS[row];
  const f = await run(CLI(cli), [...pre, '--text-file', FILE, ...post]);
  const fg = f.calls.filter((c) => c.path === route);
  const exactF = fg.length === 1 && (row.startsWith('task') ? sentOf(fg[0].body) === EXPECT.trim() : sentOf(fg[0].body) === EXPECT);
  ok(f.code === 0 && exactF, `${row}: --text-file round-trips quotes / newline / CJK / $( ) / backticks / tab / emoji byte for byte`, f.err || JSON.stringify(fg.map((c) => c.body)));
  const i = await run(CLI(cli), [...pre, '--text', '-', ...post], { input: BYTES });
  const ig = i.calls.filter((c) => c.path === route);
  ok(i.code === 0 && ig.length === 1 && String(sentOf(ig[0].body)).trim() === EXPECT.trim(), `${row}: --text - (stdin, a heredoc) round-trips the same bytes`, i.err || i.out);
}
{
  const both = await run(CLI('msg'), ['send', 'g-1', 'typed', '--text-file', FILE]);
  ok(both.code === 2 && both.calls.length === 0 && /given twice/.test(both.err), 'a text given as an argument AND by --text-file ⇒ refused, nothing sent', both.err);
  const gone = await run(CLI('channels'), ['reply', 'lark/oc_1', '--text-file', path.join(ROOT, 'nope.txt')]);
  ok(gone.code === 2 && gone.calls.length === 0 && /no such file/.test(gone.err), 'a missing --text-file ⇒ refused by name, nothing sent', gone.err);
  const tty = await run(CLI('msg'), ['send', 'g-1', '--text', '-'], { input: null });
  ok(tty.code === 2 && tty.calls.length === 0 && /nothing is piped in/.test(tty.err), '--text - with nothing piped in (stdin = /dev/null) ⇒ refused, never waited on', tty.err);
  const DET = path.join(ROOT, 'detail.md');
  fs.writeFileSync(DET, 'line 1 "q"\n第二行\n');
  const ad = await run(CLI('ask'), ['the question', '--detail-file', DET]);
  const adc = ad.calls.find((c) => c.path === '/api/agent/user-todo');
  ok(ad.code === 0 && adc && adc.body.add.detail === 'line 1 "q"\n第二行' && /sent: 12 characters \+ --detail 14/.test(ad.out), 'ask --detail-file: the detail is the file\'s text; the echo counts both', ad.err || ad.out);
  const td = await run(CLI('task'), ['progress', 'did it', '--detail-file', '-'], { input: 'ctx "x"\nmore\n' });
  const tdc = td.calls.find((c) => c.path === '/api/agent/task-progress');
  ok(td.code === 0 && tdc && tdc.body.detail === 'ctx "x"\nmore', 'task progress --detail-file - : the detail from stdin', td.err || td.out);
  const dd = await run(CLI('task'), ['progress', 'did it', '--detail', 'a', '--detail-file', DET]);
  ok(dd.code === 2 && dd.calls.length === 0 && /detail is given twice/.test(dd.err), '--detail AND --detail-file ⇒ refused, nothing recorded', dd.err);
  const be = await run(CLI('task'), ['backlog-edit', 'B-1111', '--text-file', FILE]);
  const bec = be.calls.find((c) => c.path === '/api/agent/task-backlog');
  ok(be.code === 0 && bec && bec.body.text === EXPECT && bec.body.edit === 'B-1111', 'task backlog-edit --text-file: the new text is the file\'s text (the ref stays a lookup)', be.err || be.out);
  const bl = await run(CLI('task'), ['backlog-edit', 'B-1111', '--text', 'renamed']);
  ok(bl.code === 0 && bl.calls.length === 1 && bl.calls[0].body.text === 'renamed', 'task backlog-edit --text "…" unchanged', bl.err || bl.out);
  const df = await run(CLI('msg'), ['dispatch', 'worker-1', '--file', FILE]);
  ok(df.code === 0 && df.calls.length === 1 && df.calls[0].body.text === BYTES, 'msg dispatch --file unchanged (the brief read as it is)', df.err || df.out);
}

console.log('§5 the echo is the ROUTE\'s count');
{
  const cut = await run(CLI('channels'), ['reply', 'lark/oc_1', 'x'.repeat(25)], { mode: 'cut' });
  ok(cut.code === 0 && cut.out.includes('sent: 10 characters — 25 were given: the last 15 were CUT'), 'a route that kept 10 of 25 ⇒ the confirmation SAYS the cut', cut.out);
  const old = await run(CLI('msg'), ['send', 'g-1', '若对照 vs 名单'], { mode: 'none' });
  ok(old.code === 0 && old.out.includes('sent: 9 characters'), 'an older route without chars ⇒ the CLI\'s own count (code points)', old.out);
  const one = await run(CLI('task'), ['backlog-add', 'x'], { mode: 'count' });
  ok(one.code === 0 && /^ {2}sent: 1 character$/m.test(one.out), 'one character ⇒ singular', one.out);
}

console.log('§6 controls: the pre-fix shapes are RED under the same judge; the host layout');
{
  const M = mutantCopies('cli-one-text', REPO);
  const msgSrc = read('data/bin/vibespace-msg');
  const A = "oneText('vibespace-msg send', 'a message', args[2], args.slice(3))";
  ok(msgSrc.includes(A), 'the msg send call site is where the control cuts');
  const msgNo = M.write('data/bin/vibespace-msg', msgSrc.replace(A, "oneText('vibespace-msg send', 'a message', args[2], [])"), 'no-stray');
  const r1 = await run(msgNo, ['send', 'g-1', ...PIECES]);
  ok(!strayJudge(r1, 'vibespace-msg send') && r1.code === 0 && r1.calls.length === 1 && r1.calls[0].body.text === PIECES[0], 'CONTROL: msg send without the stray scan sends the FIRST piece and drops the rest, exit 0 — RED under §3\'s judge', r1.err || JSON.stringify(r1.calls.map((c) => c.body.text)));
  const chSrc = read('data/bin/vibespace-channels');
  const B = 'const strays = pos.slice(CH_SPEC.n);';
  ok(chSrc.includes(B), 'the channels scan line is where the control cuts');
  const chNo = M.write('data/bin/vibespace-channels', chSrc.replace(B, 'const strays = [];'), 'no-stray');
  const r2 = await run(chNo, ['reply', 'lark/oc_1', ...PIECES, '--to', 'om_1']);
  ok(!strayJudge(r2, 'vibespace-channels reply') && r2.code === 0 && r2.calls.length === 1 && r2.calls[0].body.text === PIECES[0], 'CONTROL: THE INCIDENT — reply without the scan proposes "……若对照有源码权限的人" alone, exit 0, nothing said', r2.err || JSON.stringify(r2.calls.map((c) => c.body.text)));
  const askSrc = read('data/bin/vibespace-ask');
  const C = "return fileItem(oneText('vibespace-ask', rawArgs[0], rawArgs.slice(1)));";
  ok(askSrc.includes(C), 'the ask default-form call site is where the join control cuts');
  const askJoin = M.write('data/bin/vibespace-ask', askSrc.replace(C, "return fileItem(rawArgs.join(' ').trim());"), 'join');
  const r3 = await run(askJoin, PIECES);
  ok(!strayJudge(r3, 'vibespace-ask') && r3.code === 0 && r3.calls.length === 1 && r3.calls[0].body.add.text === PIECES.join(' ').trim(), 'CONTROL: the pre-fix JOIN (ask) files the pieces glued with spaces — the quotes lost, exit 0 — RED under the judge', r3.err || r3.out);
  // a HOST: the CLI in a bin dir with no checkout two levels up reads the boot-time copy beside it — and refuses without it
  const HOST = path.join(ROOT, 'host', '.vibespace', 'bin');
  fs.mkdirSync(HOST, { recursive: true });
  fs.copyFileSync(CLI('msg'), path.join(HOST, 'vibespace-msg'));
  fs.copyFileSync(path.join(REPO, 'src/agent-cli-text.js'), path.join(HOST, 'agent-cli-text.js'));
  const h1 = await run(path.join(HOST, 'vibespace-msg'), ['send', 'g-1', ...PIECES]);
  ok(strayJudge(h1, 'vibespace-msg send'), 'a host layout (no checkout): the copy beside the CLI is the rule — the stray words refused', h1.err || h1.out);
  fs.rmSync(path.join(HOST, 'agent-cli-text.js'));
  const h2 = await run(path.join(HOST, 'vibespace-msg'), ['send', 'g-1', 'whole text']);
  ok(h2.code === 2 && h2.calls.length === 0 && /text rule \(agent-cli-text\.js\) is missing beside it/.test(h2.err), 'a host whose install lacks the rule: a free-text verb REFUSES (it could not tell a stray word), nothing sent', h2.err);
  const h3 = await run(path.join(HOST, 'vibespace-msg'), ['group', 'list']);
  ok(h3.calls.length === 1, '…while a verb without text still works there', h3.err);
}

console.log('§7 the wiring: routes count, the copy ships, the words are taught');
{
  const routes = read('src/agent-routes.js'), status = read('src/agent-routes/status.js');
  ok(/nextTurn: msgNames\(r\.later\), \.\.\.\(r\.message && typeof r\.message\.text === 'string' \? \{ chars: cliText\.chars\(r\.message\.text\) \} : \{\}\)/.test(routes), 'msg send / dispatch answer chars = the STORED message, counted (msgSendAnswer)');
  ok(/\{ chars: cliText\.chars\(kept\.note\), \.\.\.\(kept\.detail \? \{ detailChars: cliText\.chars\(kept\.detail\) \}/.test(routes), 'task progress answers the KEPT note\'s count (a note past 2000 is cut — now visible)');
  ok(/\{ chars: cliText\.chars\(acted\.text\)/.test(routes), 'task backlog add / edit answer the stored item\'s count');
  ok((routes.match(/r\.chars = cliText\.chars\(b\.text\)/g) || []).length === 2 && /r\.chars = cliText\.chars\(b\.why\)/.test(routes) && /\.\.\.r, chars: cliText\.chars\(b\.text\)/.test(routes), 'channels reply / compose (+ --caller) / request answer chars');
  ok(/chars: cliText\.chars\(item\.text\)/.test(status), 'ask answers the stored question\'s count (a question past 500 is cut — now visible)');
  const gen = read('src/server/agent-tool-generators.js');
  ok(/fs\.readFileSync\(path\.join\(rootDir, 'src', 'agent-cli-text\.js'\)\)/.test(gen) && /path\.join\(AGENT_BIN_DIR, 'agent-cli-text\.js'\)/.test(gen) && /^createCliTextCopy\(\);$/m.test(gen), 'the boot copies src/agent-cli-text.js beside the CLIs as agent-cli-text.js');
  ok(require(path.join(REPO, 'src/hosts.js')).HostManager.AGENT_TOOLS.includes('agent-cli-text.js'), 'it ships with them (AGENT_TOOLS)');
  ok(/^data\/bin\/agent-cli-text\.js$/m.test(read('.gitignore')), 'the boot copy is gitignored (a generated file that is tracked dirties the tree)');
  for (const cli of ['msg', 'channels', 'ask', 'task']) {
    const src = read('data/bin/vibespace-' + cli);
    ok(/--text-file <path> or --text - \(stdin, a heredoc\)/.test(src) && /refuses\s+(?:'?,?\s*'?\s*)?stray words/.test(src.replace(/'\s*,\s*'/g, ' ')), `vibespace-${cli}: its usage teaches the doors and the refusal`);
    ok(/require\('\.\.\/\.\.\/src\/agent-cli-text\.js'\)/.test(src) && /require\('\.\/agent-cli-text\.js'\)/.test(src), `vibespace-${cli}: requires the rule by its literal name (checkout, then beside it)`);
  }
  for (const topic of ['msg', 'channels', 'ask', 'task']) {
    const man = read(`docs/agent/${topic}-manual.md`);
    ok(/--text-file <path>/.test(man) && /--text -/.test(man) && /refuses stray words/.test(man), `vibespace-docs ${topic}: the manual says «long or quoted text: --text-file or --text - (stdin); the CLI refuses stray words»`);
  }
}

srv.close();
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
