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
const ok = (c, n, e) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1200) : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
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
  ok(verdictOf(/given twice/.test(T.takeDoors(['--text', 'a', '--text-file', 'b'], ['text']).error || '')), 'two doors for one text are refused');
  ok(verdictOf(/only one text can come from stdin/.test(T.takeDoors(['--text', '-', '--detail-file', '-'], ['text', 'detail']).error || '')), 'two stdin doors are refused');
  ok(verdictOf(/needs a value/.test(T.takeDoors(['--text-file'], ['text']).error || '')), 'a door without its value is refused');
  ok(JSON.stringify(T.takeDoors(['--detail-file', 'p'], ['text']).argv) === '["--detail-file","p"]', 'a door the command does not have stays in argv (the stray scan names it)');
  ok(verdictOf(/given twice/.test(T.textOf('typed', { file: 'p', flag: '--text-file' }, {}).error || '')), 'the argument AND a door ⇒ refused (given twice)');
  ok(verdictOf(/nothing is piped in/.test(T.readDoor({ stdin: true, flag: '--text' }, { stdinIsTTY: true }).error || '')), 'stdin that is a terminal (or /dev/null) is refused, never waited on');
  ok(verdictOf(/no such file/.test(T.readDoor({ file: '/nope', flag: '--text-file' }, { readFile: () => { const e = new Error('x'); e.code = 'ENOENT'; throw e; } }).error || '')), 'a missing file is named');
  const pos = T.positionals(['lark/oc_1', 'first', 'vs', '--to', 'om_1', '--why', 'w', '--in-thread', 'tail', '--all', 'x'], { valued: ['--why'], optional: ['--to', '--in-thread'], bare: ['--all'] });
  ok(JSON.stringify(pos.map((p) => p.word)) === '["lark/oc_1","first","vs","x"]', 'positionals: a valued flag takes the next word, an optional one takes it unless it is a flag, a bare one none', pos);
  const unk = T.positionals(['acct', 'text', '--subject', 'S'], { valued: [] });
  ok(gateOf(unk[2]) && unk[2].word === 'S' && unk[2].after === '--subject', 'positionals: a word after a flag the verb does not know carries that flag (`after`)');
  const s = T.strayRefusal({ tool: 'vibespace-channels reply', strays: ['vs', '人员名单会对不上'] });
  ok(s === 'vibespace-channels reply: refused — a message is ONE argument — 2 more words followed it ("vs", …): a quote in the text probably closed early; put the text in a file (--text-file <path>) or on stdin (--text -), or escape the inner quotes — nothing was sent', 'THE sentence (the brief\'s words): the count, the first stray word quoted, the likely cause, both doors', s);
  ok(verdictOf(/1 more word followed it \("tail"\)/.test(T.strayRefusal({ tool: 't', strays: ['tail'] }))), 'one stray word: singular, no ellipsis');
  ok(verdictOf(/"--subject" is not an option of vibespace-channels reply/.test(T.strayRefusal({ tool: 'vibespace-channels reply', strays: ['--subject'] }))), 'a stray FLAG is named as a flag the command does not take');
  ok(T.strayRefusal({ tool: 't', strays: [] }) === null, 'nothing stray ⇒ no refusal');
  ok(T.sentLine({ chars: 412 }, 'x'.repeat(412)) === 'sent: 412 characters', 'the echo: sent: N characters (the route\'s count)');
  ok(T.sentLine({ chars: 10 }, 'y'.repeat(25)) === 'sent: 10 characters — 25 were given: the last 15 were CUT', 'a route that kept fewer ⇒ the cut is SAID');
  ok(T.sentLine({}, '若对照') === 'sent: 3 characters', 'an older route without chars ⇒ the CLI\'s own count');
  ok(T.sentLine({ chars: 3, detailChars: 2 }, 'abc', 'de ') === 'sent: 3 characters + --detail 2', 'a --detail count rides the same line');
  // lane bl-msg B-3e61: a route that names what the secret belt MASKED is told that — never «the last N were CUT» (four sightings read the count as a length cap)
  const MASKED_LINE = 'sent: 30 characters — the secret belt masked the value at «session:», «data-key=» (each now «redacted»)';
  ok(T.sentLine({ chars: 30, masked: ['session:', 'data-key='] }, 'y'.repeat(36)) === MASKED_LINE, 'a route that names what its belt masked ⇒ the line SAYS the mask and where, and no cut');
  ok(gateOf(T.sentLine({ chars: 30, masked: [] }, 'y'.repeat(36)).endsWith('the last 6 were CUT')) && verdictOf(T.sentLine({ chars: 30, masked: [7, ''] }, 'y'.repeat(36)).endsWith('the last 6 were CUT')), '…an empty or malformed masked list changes nothing (the cut is still said)');
  {
    const { mutantCopies } = await import('./mutant-copy.mjs');
    const tsrc = fs.readFileSync(path.join(REPO, 'src/agent-cli-text.js'), 'utf8');
    const T0 = mutantCopies('blm-cli', REPO).load('src/agent-cli-text.js', editAnchor(tsrc, '  else if (said.length) line +=', '  else if (false) line +=', "src/agent-cli-text.js"), 'no-masked');   // B-4f7f: the heads' branch now follows the count's
    ok(verdictOf(T.sentLine({ chars: 30, masked: ['a:'], maskedMore: true }, 'y'.repeat(36)).includes('«a:» and more (each')), '…a ninth mask is said as «and more»');
    ok(gateOf(tsrc.includes('  else if (said.length) line +=')) && verdictOf(T0.sentLine({ chars: 30, masked: ['session:'] }, 'y'.repeat(36)).endsWith('were CUT')), 'RED CONTROL (the masked branch removed): the mask is read as a CUT again — the leg above goes red');
  }
  // B-4f7f (主开发 r2804): a route that COUNTS the spans its scrub changed ⇒ the sender is told HOW MANY (a count, never the words),
  // with or without a head to name — so a sender knows that what arrived is not what it wrote
  {
    const both = T.sentLine({ chars: 30, masked: ['session:'], scrubbed: 3 }, 'y'.repeat(36));
    const bare = T.sentLine({ chars: 30, masked: [], scrubbed: 1 }, 'y'.repeat(36));
    ok(both === 'sent: 30 characters — the secret belt changed 3 spans of it to «redacted», so what arrived is not what you wrote (a value at «session:»)'
      && bare === 'sent: 30 characters — the secret belt changed 1 span of it to «redacted», so what arrived is not what you wrote' && !/CUT/.test(both + bare),
      'B-4f7f: a route that counts the spans its scrub changed ⇒ the line SAYS how many (3, with its head; 1 with no head to name), never a cut', JSON.stringify([both, bare]));
    ok(gateOf(T.sentLine({ chars: 30, masked: ['session:'], scrubbed: 0 }, 'y'.repeat(36)).endsWith('(each now «redacted»)')) && verdictOf(T.sentLine({ chars: 30, scrubbed: 'x' }, 'y'.repeat(36)).endsWith('were CUT')),
      '…a count of 0 or a malformed one changes nothing: the heads as before, else the cut');
    const { mutantCopies: mc } = await import('./mutant-copy.mjs');
    const tsrc2 = fs.readFileSync(path.join(REPO, 'src/agent-cli-text.js'), 'utf8');
    const T1 = mc('b4f7f-cli', REPO).load('src/agent-cli-text.js', editAnchor(tsrc2, '  if (spans) line +=', '  if (false) line +=', "src/agent-cli-text.js"), 'no-count');
    const red = T1.sentLine({ chars: 30, masked: [], scrubbed: 2 }, 'y'.repeat(36));
    ok(!/changed 2 spans/.test(red) && verdictOf(/were CUT/.test(red)), 'RED CONTROL (the count branch removed, a copy): the sender is told nothing about the 2 changed spans — the leg above goes red', red);
  }
  // …on EVERY road a member's message is sent by: the send's answer and the dispatch's answer carry the engine's count
  {
    const AR = require(path.join(REPO, 'src/agent-routes.js'));
    const post = { group: { id: 'g-1', name: 'lane', pair: true }, pairCreated: false, woke: [], refused: [], later: [], message: { text: 'a «redacted» b «redacted»' }, masked: ['session:'], scrubbed: 2 };
    const sent = AR.msgSendAnswer(post), none = AR.msgSendAnswer({ ...post, scrubbed: 0 });
    const disp = AR.dispatchAnswer({ post, record: { why: '', target: null, wake: {} }, replay: false, attempt: null });
    ok(sent.scrubbed === 2 && disp.scrubbed === 2 && !('scrubbed' in none), 'B-4f7f: the SEND answer and the DISPATCH answer both carry the count (2); a post that changed nothing carries none', JSON.stringify({ sent: sent.scrubbed, dispatch: disp.scrubbed, none: none.scrubbed }));
  }
}

// ── the FAKE route: counts every call, answers each path in the shape its CLI prints; `chars` = what it got, counted
const FAKE = { calls: [], mode: 'count' };
const kept = (t) => (FAKE.mode === 'cut' ? [...String(t)].slice(0, 10).join('') : String(t));
const counted = (t) => (FAKE.mode === 'none' ? {} : FAKE.mode === 'masked' ? { chars: T.chars(String(t).replace(/session:\S+/, 'session:«redacted»')), masked: ['session:'] } : FAKE.mode === 'scrubbed' ? { chars: T.chars(String(t).replace(/session:\S+/, 'session:«redacted»').replace(/token=\S+/, 'token=«redacted»')), masked: ['session:'], scrubbed: 2 } : { chars: T.chars(kept(t)) });   // lane bl-msg B-3e61: a route that names what its belt masked
const srv = http.createServer((req, res) => {
  let b = '';
  req.on('data', (c) => { b += c; });
  req.on('end', () => {
    let body = {}; try { body = JSON.parse(b || '{}'); } catch { }
    const u = new URL(req.url, 'http://x');
    FAKE.calls.push({ method: req.method, path: u.pathname, body, q: Object.fromEntries(u.searchParams) });
    const p = u.pathname;
    let j = { error: 'no such fake route ' + p };
    if (p === '/api/agent/msg/send' && FAKE.mode === 'job-no-pair') { res.statusCode = 403; j = { error: 'no direct group with "gamma" exists yet, and a job token never creates one', code: 'job-token', why: 'no-pair', target: { conversationId: 'e2e00000-0000-4000-8000-00000000c0c0', name: 'gamma' }, pairs: 2 }; }   // fb-f48717393b
    else if (p === '/api/agent/msg/send' && FAKE.mode === 'job-no-pair-noname') { res.statusCode = 403; j = { error: 'no direct group with "e2e00000-0000-4000-8000-00000000c0c1" exists yet, and a job token never creates one', code: 'job-token', why: 'no-pair', target: { conversationId: 'e2e00000-0000-4000-8000-00000000c0c1', name: 'e2e00000-0000-4000-8000-00000000c0c1' }, pairs: 0 }; }   // line 826's round: a session with no name
    else if (p === '/api/agent/msg/send' && FAKE.mode === 'job-other') { res.statusCode = 403; j = { error: 'a job token never creates a group', code: 'job-token' }; }
    else if (p === '/api/agent/msg/send') j = { posted: true, group: { id: 'g-1', name: 'G', pair: false }, woke: [], refused: [], nextTurn: [], ...counted(body.text) };
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
  'channels resend': ['no-text', 'none (the proposal id is a lookup)'],   // lane bl-msg B-da74
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
  ok(gateOf(planted.has('msg shout')) && !VERDICTS['msg shout'], 'CONTROL: a planted usage line (vibespace-msg shout) is derived — and has no verdict, so it would be red');
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
  ok(gateOf(strayJudge(s, tool)) && verdictOf(s.err.includes('2 more words followed it ("vs", …)')), `${row}: the incident shape is REFUSED by name, nothing sent`, s.err || s.out);
  const w = await run(CLI(cli), [...pre, WHOLE, ...post]);
  const got = w.calls.filter((c) => c.path === route);
  ok(w.code === 0 && got.length === 1 && String(sentOf(got[0].body)).trim() === WHOLE.trim() && verdictOf(w.out.includes(`sent: ${T.chars(WHOLE.trim())} characters`)), `${row}: the same words as ONE argument ⇒ sent whole, the echo says ${T.chars(WHOLE.trim())} characters`, w.err || w.out);
}
for (const row of GUARD) {
  const [, cli, argv] = VERDICTS[row];
  const s = await run(CLI(cli), argv);
  ok(verdictOf(strayJudge(s, 'vibespace-' + row)), `${row}: a stray word is REFUSED by name, nothing sent`, s.err || s.out);
}
{ // the guards' valid calls still go through
  const a = await run(CLI('channels'), ['react', 'lark/oc_1', 'om_1', 'THUMBSUP', '--why', 'because of that']);
  ok(a.code === 0 && a.calls.length === 1 && a.calls[0].body.why === 'because of that', 'channels react: a --why given as ONE argument still proposes', a.err || a.out);
  const q = await run(CLI('channels'), ['search', 'two words', '--account', 'lark']);
  ok(q.code === 0 && q.calls.length === 1 && q.calls[0].q.q === 'two words', 'channels search: the words as ONE argument still search', q.err || q.out);
  const x = await run(CLI('channels'), ['reply', 'lark/oc_1', 'hi', '--subject', 'S']);
  ok(x.code === 2 && x.calls.length === 0 && verdictOf(/"--subject" is not an option of vibespace-channels reply, so the word after it stood alone/.test(x.err)), 'channels reply: a word after a flag the verb does not take is refused, naming that flag', x.err);
  const y = await run(CLI('msg'), ['send', 'g-1', 'hi', '--loud']);
  ok(y.code === 2 && y.calls.length === 0 && verdictOf(/"--loud" is not an option of vibespace-msg send/.test(y.err)), 'msg send: an unknown flag after the text is refused by name (it used to be dropped)', y.err);
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
  ok(f.code === 0 && verdictOf(exactF), `${row}: --text-file round-trips quotes / newline / CJK / $( ) / backticks / tab / emoji byte for byte`, f.err || JSON.stringify(fg.map((c) => c.body)));
  const i = await run(CLI(cli), [...pre, '--text', '-', ...post], { input: BYTES });
  const ig = i.calls.filter((c) => c.path === route);
  ok(i.code === 0 && ig.length === 1 && String(sentOf(ig[0].body)).trim() === EXPECT.trim(), `${row}: --text - (stdin, a heredoc) round-trips the same bytes`, i.err || i.out);
}
{
  const both = await run(CLI('msg'), ['send', 'g-1', 'typed', '--text-file', FILE]);
  ok(both.code === 2 && both.calls.length === 0 && verdictOf(/given twice/.test(both.err)), 'a text given as an argument AND by --text-file ⇒ refused, nothing sent', both.err);
  const gone = await run(CLI('channels'), ['reply', 'lark/oc_1', '--text-file', path.join(ROOT, 'nope.txt')]);
  ok(gone.code === 2 && gone.calls.length === 0 && verdictOf(/no such file/.test(gone.err)), 'a missing --text-file ⇒ refused by name, nothing sent', gone.err);
  const tty = await run(CLI('msg'), ['send', 'g-1', '--text', '-'], { input: null });
  ok(tty.code === 2 && tty.calls.length === 0 && verdictOf(/nothing is piped in/.test(tty.err)), '--text - with nothing piped in (stdin = /dev/null) ⇒ refused, never waited on', tty.err);
  const DET = path.join(ROOT, 'detail.md');
  fs.writeFileSync(DET, 'line 1 "q"\n第二行\n');
  const ad = await run(CLI('ask'), ['the question', '--detail-file', DET]);
  const adc = ad.calls.find((c) => c.path === '/api/agent/user-todo');
  ok(ad.code === 0 && gateOf(adc) && adc.body.add.detail === 'line 1 "q"\n第二行' && verdictOf(/sent: 12 characters \+ --detail 14/.test(ad.out)), 'ask --detail-file: the detail is the file\'s text; the echo counts both', ad.err || ad.out);
  const td = await run(CLI('task'), ['progress', 'did it', '--detail-file', '-'], { input: 'ctx "x"\nmore\n' });
  const tdc = td.calls.find((c) => c.path === '/api/agent/task-progress');
  ok(td.code === 0 && gateOf(tdc) && tdc.body.detail === 'ctx "x"\nmore', 'task progress --detail-file - : the detail from stdin', td.err || td.out);
  const dd = await run(CLI('task'), ['progress', 'did it', '--detail', 'a', '--detail-file', DET]);
  ok(dd.code === 2 && dd.calls.length === 0 && verdictOf(/detail is given twice/.test(dd.err)), '--detail AND --detail-file ⇒ refused, nothing recorded', dd.err);
  const be = await run(CLI('task'), ['backlog-edit', 'B-1111', '--text-file', FILE]);
  const bec = be.calls.find((c) => c.path === '/api/agent/task-backlog');
  ok(be.code === 0 && gateOf(bec) && bec.body.text === EXPECT && bec.body.edit === 'B-1111', 'task backlog-edit --text-file: the new text is the file\'s text (the ref stays a lookup)', be.err || be.out);
  const bl = await run(CLI('task'), ['backlog-edit', 'B-1111', '--text', 'renamed']);
  ok(bl.code === 0 && bl.calls.length === 1 && bl.calls[0].body.text === 'renamed', 'task backlog-edit --text "…" unchanged', bl.err || bl.out);
  const df = await run(CLI('msg'), ['dispatch', 'worker-1', '--file', FILE]);
  ok(df.code === 0 && df.calls.length === 1 && df.calls[0].body.text === BYTES, 'msg dispatch --file unchanged (the brief read as it is)', df.err || df.out);
}

console.log('§5 the echo is the ROUTE\'s count');
{
  const cut = await run(CLI('channels'), ['reply', 'lark/oc_1', 'x'.repeat(25)], { mode: 'cut' });
  ok(cut.code === 0 && verdictOf(cut.out.includes('sent: 10 characters — 25 were given: the last 15 were CUT')), 'a route that kept 10 of 25 ⇒ the confirmation SAYS the cut', cut.out);
  const old = await run(CLI('msg'), ['send', 'g-1', '若对照 vs 名单'], { mode: 'none' });
  ok(old.code === 0 && verdictOf(old.out.includes('sent: 9 characters')), 'an older route without chars ⇒ the CLI\'s own count (code points)', old.out);
  const msk = await run(CLI('msg'), ['send', 'g-1', 'the session:abcdefghijklmnopqrst and the rest'], { mode: 'masked' });
  ok(msk.code === 0 && gateOf(msk.out.includes('sent: 35 characters — the secret belt masked the value at «session:» (each now «redacted»)')) && !/CUT/.test(msk.out), 'lane bl-msg B-3e61: msg send through a route whose belt masked a value ⇒ the confirmation names it, never a cut', msk.out);
  const V4 = ['abcdefgh', 'ijklmnop', 'qrst'].join('');   // a value, joined at runtime (a secret-shaped fixture is never a literal)
  const scr = await run(CLI('msg'), ['send', 'g-1', `the session:${V4} and ${['tok', 'en'].join('')}=${V4} end`], { mode: 'scrubbed' });
  ok(scr.code === 0 && gateOf(scr.out.includes('the secret belt changed 2 spans of it to «redacted», so what arrived is not what you wrote (a value at «session:»)')) && !/CUT/.test(scr.out), 'B-4f7f: msg send through a route that counts the changed spans ⇒ the CLI SAYS how many (2)', scr.out);
  // fb-f48717393b (主开发 r2235): a JOB's send refused because its owner conversation has no direct group with that target yet ⇒ the remedy
  // SAYS that case (the target, how many direct groups the owner has, how to open one), never «run it from the conversation» alone
  const jnp = await run(CLI('msg'), ['send', 'gamma', 'batch finished'], { mode: 'job-no-pair' });
  ok(jnp.code === 1 && gateOf(jnp.err.includes('this job posts only into a direct group its owner conversation already has (2 open now); it has none with "gamma" yet — send to it once from the owner conversation (vibespace-msg send e2e00000-0000-4000-8000-00000000c0c0 "…")')) && !jnp.err.includes('its own VIBESPACE_SESSION_TOKEN'),
    'fb-f48717393b: a job send refused for want of a direct group ⇒ the CLI names the target, the owner\'s direct groups (2) and the one step that opens it — not the generic remedy', jnp.err);
  const jnn = await run(CLI('msg'), ['send', 'e2e00000-0000-4000-8000-00000000c0c1', 'batch finished'], { mode: 'job-no-pair-noname' });
  const remedyLine = jnn.err.split('\n').find((l) => l.includes('this job posts only')) || '';
  ok(jnn.code === 1 && gateOf(remedyLine.includes('it has none with that conversation yet')) && remedyLine.split('e2e00000-0000-4000-8000-00000000c0c1').length === 2,
    'line 826\'s round: a target with NO name of its own (its name is its id) ⇒ the remedy says «that conversation» and prints the id ONCE, in the command', remedyLine);
  const jot = await run(CLI('msg'), ['send', 'gamma', 'batch finished'], { mode: 'job-other' });
  ok(jot.code === 1 && verdictOf(jot.err.includes('run it from the conversation that owns this job (its own VIBESPACE_SESSION_TOKEN)')), 'CONTROL: any other job-token refusal keeps the generic remedy', jot.err);
  const one = await run(CLI('task'), ['backlog-add', 'x'], { mode: 'count' });
  ok(one.code === 0 && verdictOf(/^ {2}sent: 1 character$/m.test(one.out)), 'one character ⇒ singular', one.out);
}

console.log('§6 controls: the pre-fix shapes are RED under the same judge; the host layout');
{
  const M = mutantCopies('cli-one-text', REPO);
  const msgSrc = read('data/bin/vibespace-msg');
  const A = "oneText('vibespace-msg send', 'a message', args[2], args.slice(3))";
  ok(verdictOf(msgSrc.includes(A)), 'the msg send call site is where the control cuts');
  const msgNo = M.write('data/bin/vibespace-msg', editAnchor(msgSrc, A, "oneText('vibespace-msg send', 'a message', args[2], [])", "data/bin/vibespace-msg"), 'no-stray');
  const r1 = await run(msgNo, ['send', 'g-1', ...PIECES]);
  ok(!strayJudge(r1, 'vibespace-msg send') && r1.code === 0 && r1.calls.length === 1 && r1.calls[0].body.text === PIECES[0], 'CONTROL: msg send without the stray scan sends the FIRST piece and drops the rest, exit 0 — RED under §3\'s judge', r1.err || JSON.stringify(r1.calls.map((c) => c.body.text)));
  const chSrc = read('data/bin/vibespace-channels');
  const B = 'const strays = pos.slice(CH_SPEC.n);';
  ok(verdictOf(chSrc.includes(B)), 'the channels scan line is where the control cuts');
  const chNo = M.write('data/bin/vibespace-channels', editAnchor(chSrc, B, 'const strays = [];', "data/bin/vibespace-channels"), 'no-stray');
  const r2 = await run(chNo, ['reply', 'lark/oc_1', ...PIECES, '--to', 'om_1']);
  ok(!strayJudge(r2, 'vibespace-channels reply') && r2.code === 0 && r2.calls.length === 1 && r2.calls[0].body.text === PIECES[0], 'CONTROL: THE INCIDENT — reply without the scan proposes "……若对照有源码权限的人" alone, exit 0, nothing said', r2.err || JSON.stringify(r2.calls.map((c) => c.body.text)));
  const askSrc = read('data/bin/vibespace-ask');
  const C = "return fileItem(oneText('vibespace-ask', rawArgs[0], rawArgs.slice(1)));";
  ok(verdictOf(askSrc.includes(C)), 'the ask default-form call site is where the join control cuts');
  const askJoin = M.write('data/bin/vibespace-ask', editAnchor(askSrc, C, "return fileItem(rawArgs.join(' ').trim());", "data/bin/vibespace-ask"), 'join');
  const r3 = await run(askJoin, PIECES);
  ok(!strayJudge(r3, 'vibespace-ask') && r3.code === 0 && r3.calls.length === 1 && r3.calls[0].body.add.text === PIECES.join(' ').trim(), 'CONTROL: the pre-fix JOIN (ask) files the pieces glued with spaces — the quotes lost, exit 0 — RED under the judge', r3.err || r3.out);
  // a HOST: the CLI in a bin dir with no checkout two levels up reads the boot-time copy beside it — and refuses without it
  const HOST = path.join(ROOT, 'host', '.vibespace', 'bin');
  fs.mkdirSync(HOST, { recursive: true });
  fs.copyFileSync(CLI('msg'), path.join(HOST, 'vibespace-msg'));
  fs.copyFileSync(path.join(REPO, 'src/agent-cli-text.js'), path.join(HOST, 'agent-cli-text.js'));
  fs.copyFileSync(path.join(REPO, 'src/cli-call.js'), path.join(HOST, 'cli-call.js'));   // lane cli-call-timeouts: THE ONE CALL rides beside them too
  const h1 = await run(path.join(HOST, 'vibespace-msg'), ['send', 'g-1', ...PIECES]);
  ok(verdictOf(strayJudge(h1, 'vibespace-msg send')), 'a host layout (no checkout): the copy beside the CLI is the rule — the stray words refused', h1.err || h1.out);
  fs.rmSync(path.join(HOST, 'agent-cli-text.js'));
  const h2 = await run(path.join(HOST, 'vibespace-msg'), ['send', 'g-1', 'whole text']);
  ok(h2.code === 2 && h2.calls.length === 0 && verdictOf(/text rule \(agent-cli-text\.js\) is missing beside it/.test(h2.err)), 'a host whose install lacks the rule: a free-text verb REFUSES (it could not tell a stray word), nothing sent', h2.err);
  const h3 = await run(path.join(HOST, 'vibespace-msg'), ['group', 'list']);
  ok(h3.calls.length === 1, '…while a verb without text still works there', h3.err);
}

console.log('§7 the wiring: routes count, the copy ships, the words are taught');
{
  const routes = read('src/agent-routes.js'), status = read('src/agent-routes/status.js');
  ok(verdictOf(/nextTurn: msgNames\(r\.later\), \.\.\.\(r\.message && typeof r\.message\.text === 'string' \? \{ chars: cliText\.chars\(r\.message\.text\) \} : \{\}\)/.test(routes)), 'msg send / dispatch answer chars = the STORED message, counted (msgSendAnswer)');
  ok(verdictOf(/\{ chars: cliText\.chars\(kept\.note\), \.\.\.\(kept\.detail \? \{ detailChars: cliText\.chars\(kept\.detail\) \}/.test(routes)), 'task progress answers the KEPT note\'s count (a note past 2000 is cut — now visible)');
  ok(verdictOf(/\{ chars: cliText\.chars\(acted\.text\)/.test(routes)), 'task backlog add / edit answer the stored item\'s count');
  ok((routes.match(/r\.chars = cliText\.chars\(b\.text\)/g) || []).length === 2 && gateOf(/r\.chars = cliText\.chars\(b\.why\)/.test(routes)) && verdictOf(/\.\.\.r, chars: cliText\.chars\(b\.text\)/.test(routes)), 'channels reply / compose (+ --caller) / request answer chars');
  ok(verdictOf(/chars: cliText\.chars\(item\.text\)/.test(status)), 'ask answers the stored question\'s count (a question past 500 is cut — now visible)');
  const gen = read('src/server/agent-tool-generators.js');
  ok(gateOf(/fs\.readFileSync\(path\.join\(rootDir, 'src', 'agent-cli-text\.js'\)\)/.test(gen)) && gateOf(/path\.join\(AGENT_BIN_DIR, 'agent-cli-text\.js'\)/.test(gen)) && verdictOf(/^createCliTextCopy\(\);$/m.test(gen)), 'the boot copies src/agent-cli-text.js beside the CLIs as agent-cli-text.js');
  ok(verdictOf(require(path.join(REPO, 'src/hosts.js')).HostManager.AGENT_TOOLS.includes('agent-cli-text.js')), 'it ships with them (AGENT_TOOLS)');
  ok(verdictOf(/^data\/bin\/agent-cli-text\.js$/m.test(read('.gitignore'))), 'the boot copy is gitignored (a generated file that is tracked dirties the tree)');
  for (const cli of ['msg', 'channels', 'ask', 'task']) {
    const src = read('data/bin/vibespace-' + cli);
    ok(gateOf(/--text-file <path> or --text - \(stdin, a heredoc\)/.test(src)) && verdictOf(/refuses\s+(?:'?,?\s*'?\s*)?stray words/.test(src.replace(/'\s*,\s*'/g, ' '))), `vibespace-${cli}: its usage teaches the doors and the refusal`);
    ok(gateOf(/require\('\.\.\/\.\.\/src\/agent-cli-text\.js'\)/.test(src)) && verdictOf(/require\('\.\/agent-cli-text\.js'\)/.test(src)), `vibespace-${cli}: requires the rule by its literal name (checkout, then beside it)`);
  }
  for (const topic of ['msg', 'channels', 'ask', 'task']) {
    const man = read(`docs/agent/${topic}-manual.md`);
    ok(gateOf(/--text-file <path>/.test(man)) && gateOf(/--text -/.test(man)) && verdictOf(/refuses stray words/.test(man)), `vibespace-docs ${topic}: the manual says «long or quoted text: --text-file or --text - (stdin); the CLI refuses stray words»`);
  }
}

srv.close();
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
