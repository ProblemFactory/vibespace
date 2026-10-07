#!/usr/bin/env node
// LANE BROWSER-RECIPES (2026-10-02, userR's pod) — the agent is TAUGHT what to do when the user asks for a browser with
// THEIR login. Her agent ran `vibespace-browser status`, read only what it could NOT do, launched the system chromium
// itself and died on "Missing X server or $DISPLAY". Fast, in-process + the REAL shipped CLI against a stub server:
//   ① the manual's §0 comes FIRST (before §1's verbs), ≤ 40 lines, four recipes, the exact sentence to the user
//   ② the NAIVE READER: in the first 60 lines, recipe (a)'s `new "` precedes every page verb (the first-screen rule)
//   ③ PURE src/browser-recipes.js: the no-display table (a launch's fact wins, else a probe's verdict) + its words
//   ④ the status census over the real CLI: ephemeral ⇒ the pointer; no display ⇒ the sentence; "exit machines" absent
//   ⑤ the first verb's refusal ⇒ `next:` + the pointer (the real CLI, a fake browser CLI that never runs)
//   ⑥ the tools intro: the clause once, the no-display clause only with the fact, under the 9 600 B cap; the wiring
//   ⑦ verify r1 F1: a conversation on ANOTHER machine (rung H / f.remote) is never offered the recipe it cannot follow
//      (`new` answers remote_session there, no live view): status + the first verb's refusal + the intro say the login
//      needs a conversation on the VibeSpace machine; F2: the manual says the quoted sentences are SAID in the user's language
//   CONTROLS (mutant copies in a scratch dir): a manual without §0 fails ①②, a CLI without the pointer fails ④, an
//   agent-routes copy whose Browsing line lost the clause fails ⑥.
// Scratch: /tmp/vs-brcp-<pid>/ only. Zero vendor calls, no browser launched.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { mutantCopies, treeLitter } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const SCRATCH = path.join(os.tmpdir(), `vs-brcp-${process.pid}`);
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n      ' + String(extra).slice(0, 600) : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
fs.rmSync(SCRATCH, { recursive: true, force: true });
fs.mkdirSync(SCRATCH, { recursive: true });

const R = require(path.join(REPO, 'src/browser-recipes.js'));
const AR = require(path.join(REPO, 'src/agent-routes.js'));
const PAGE_VERB_RE = /vibespace-browser (?:open|snapshot|click|fill|type|press|select|hover|get|is|find|scroll|back|forward|reload|tab|screenshot|pdf|eval|cookies|batch)\b/;

/** ①: the manual's §0 judged as text — returns the failures (empty = holds). */
function judgeManual(text) {
  const bad = [];
  const heads = text.split('\n').map((l, i) => [l, i]).filter(([l]) => /^## /.test(l));
  if (!heads.length || !/^## 0\. What the user asked for → what you do$/.test(heads[0][0])) bad.push('the first section is not §0 "What the user asked for → what you do"');
  const s0 = heads.length ? text.split('\n').slice(heads[0][1], heads[1] ? heads[1][1] : undefined).join('\n') : '';
  // verify r1: §0 PROPER ends at its closing `---` (the old intro paragraph after it is not §0) — ≤ 40 lines + the heading
  const s0Lines = s0.split('\n'); const cut = s0Lines.findIndex((l) => /^---\s*$/.test(l));
  const lines0 = (cut >= 0 ? s0Lines.slice(0, cut) : s0Lines).length;
  if (!s0 || lines0 > 41) bad.push(`§0 is ${lines0} lines (≤ 40 + its heading)`);
  if (!/SAID to the user in their language/.test(s0)) bad.push('§0 does not say the quoted sentences are SAID in the user\'s language (verify r1 F2)');
  const a = /\*\*\(a\)[\s\S]*?\*\*\(b\)/.exec(s0)?.[0] || '';
  if (!/vibespace-browser new "<site> — <user>'s login"/.test(a) || !/vibespace-browser use /.test(a) || !/vibespace-browser open <url>/.test(a)) bad.push('(a) lacks new → use → open');
  if (!a.includes(`"${R.USER_SENTENCE}"`)) bad.push('(a) lacks the exact sentence to the user');
  if (!/[Nn]ever ask for a password/.test(a) || !/stays in\s+that profile for every later turn/.test(a)) bad.push('(a) lacks "never ask for a password" / the login staying');
  if (!/ANOTHER machine[\s\S]*remote_session[\s\S]*no live view[\s\S]*conversation on the VibeSpace machine/.test(a)) bad.push('(a) lacks the other-machine row (remote_session, no live view ⇒ a conversation on the VibeSpace machine) (verify r1 F1)');
  if (!/\*\*\(b\)[^\n]*browse/.test(s0)) bad.push('(b) browse is missing');
  if (!/\*\*\(c\)[\s\S]*--sharing instance[\s\S]*Who can use it/.test(s0)) bad.push('(c) lacks --sharing instance / "Who can use it"');
  if (!/\*\*\(d\)[\s\S]*no display[\s\S]*chromium \/ google-chrome \/ playwright[\s\S]*refusal names the\s+next step/.test(s0)) bad.push('(d) lacks no-display / never launch / the refusal names the next step');
  const says = (s0.match(/^Say: "[^"]+"$/gm) || []).length;
  if (says < 3) bad.push(`(b)(c)(d) do not each end with one sentence to say (${says})`);
  return bad;
}
/** ②: the naive reader sees the FIRST screen only — recipe (a) before any page verb. */
function judgeFirstScreen(text) {
  const first = text.split('\n').slice(0, 60).join('\n');
  const a = first.indexOf('vibespace-browser new "');
  const m = PAGE_VERB_RE.exec(first);
  return a >= 0 && (!m || a < m.index) ? [] : [`recipe (a) at ${a}, first page verb at ${m ? m.index : -1} (${m ? m[0] : 'none'})`];
}

console.log('— ① the manual: §0 first, four recipes, the exact sentence to the user');
const manual = read('docs/agent/browser-manual.md');
{ const bad = judgeManual(manual); ok(!bad.length, 'docs/agent/browser-manual.md §0 holds every recipe rule', bad.join('; ')); }
ok(R.USER_SENTENCE === 'Open the Agent browser window and take over to log in; I will continue once you hand it back', 'the user sentence is the brief\'s words verbatim');

console.log('— ② the naive reader (first 60 lines): recipe (a) precedes every page verb');
{ const bad = judgeFirstScreen(manual); ok(!bad.length, 'the first screen teaches `new "<site> — <user>\'s login"` before any page verb', bad.join('; ')); }
{ // CONTROL: the manual as it was (no §0) fails both legs
  const without = manual.replace(/## 0\. What the user asked for[\s\S]*?\n---\n\n/, '');
  fs.writeFileSync(path.join(SCRATCH, 'browser-manual-without-s0.md'), without);
  const copy = fs.readFileSync(path.join(SCRATCH, 'browser-manual-without-s0.md'), 'utf8');
  ok(copy !== manual && judgeManual(copy).length > 0 && judgeFirstScreen(copy).length > 0, 'CONTROL: a manual without §0 FAILS ① and ② (its first page verb comes before any recipe)', judgeFirstScreen(copy).join('; '));
}

console.log('— ③ PURE: where a machine without a display runs the browser, and the words');
{
  const D = require(path.join(REPO, 'src/browser-display.js'));
  const noDX = D.displayVerdict({ env: {}, runtimeDir: null, entries: [], xvfb: true });
  const x11 = D.displayVerdict({ env: { DISPLAY: ':0' }, runtimeDir: null, entries: [{ path: '/tmp/.X11-unix/X0', type: 'socket', alive: true }] });
  const hidden = D.displayFact({ display: noDX, wanted: { headed: true }, mode: 'auto' });
  const headless = D.displayFact({ display: noDX, wanted: { headed: true }, mode: 'headless' });
  const unasked = D.displayFact({ display: noDX, wanted: { headed: false }, mode: 'auto' });
  const shown = D.displayFact({ display: x11, wanted: { headed: true }, mode: 'auto' });
  const rows = [
    [{ fact: hidden }, 'hidden-window'], [{ fact: headless }, 'headless'], [{ fact: unasked }, 'headless'], [{ fact: shown }, null],
    [{ display: noDX }, 'either'], [{ display: x11 }, null], [{}, null], [{ fact: shown, display: noDX }, null], // a launch's fact wins
  ];
  for (const [inp, want] of rows) ok(R.noDisplayRung(inp) === want, `noDisplayRung(${Object.keys(inp).join('+') || 'nothing'}${inp.fact ? ':' + (D.factCode(inp.fact) || inp.fact.kind) : inp.display ? ':' + inp.display.kind : ''}) = ${want}`, R.noDisplayRung(inp));
  const l = R.noDisplayLine({ fact: hidden });
  ok(l.startsWith('this machine has no display — only vibespace-browser works here (a hidden window)') && /do not launch a browser yourself/.test(l) && /\[no_display\]$/.test(l), 'the hidden-window sentence is the brief\'s, plus why and a code', l);
  ok(R.noDisplayLine({ fact: shown }) === '' && R.noDisplayLine({}) === '', 'a display here (or nothing known) ⇒ nothing said');
  ok(/vibespace-browser new "<site> — <user>'s login"/.test(R.RECIPE_POINTER) && /`use`/.test(R.RECIPE_POINTER) && /live view/.test(R.RECIPE_POINTER) && R.RECIPE_POINTER.endsWith('vibespace-docs browser §0'), 'the pointer: new + use, the live view, the manual §0');
  ok(R.FIRST_VERB_NEXT.includes(R.RECIPE_POINTER) && /Never launch a browser yourself/.test(R.FIRST_VERB_NEXT), 'the first verb\'s pointer = the same pointer + never launch one yourself');
  ok(!/`/.test(R.noDisplayLine({ fact: hidden })), 'the status sentence carries no backtick (a shell-safe line)');
  // verify r1 F1: the three surfaces for a conversation on another machine never offer new + use + the live view
  ok(/another machine/.test(R.REMOTE_POINTER) && R.REMOTE_POINTER.includes(R.MANUAL_REF) && /never ask for a password/.test(R.REMOTE_POINTER) && /conversation on the VibeSpace machine/.test(R.REMOTE_POINTER) && !/\+ `use` it/.test(R.REMOTE_POINTER) && !/live view \(the Agent browser window\)/.test(R.REMOTE_POINTER), 'the remote pointer: another machine ⇒ a conversation on the VibeSpace machine, the manual, never a password — never the new + use + live view recipe');
  ok(R.FIRST_VERB_NEXT_REMOTE.includes(R.REMOTE_POINTER) && /Never launch a browser yourself/.test(R.FIRST_VERB_NEXT_REMOTE), 'the remote first verb pointer = the remote pointer + never launch one yourself');
  ok(/another machine/.test(R.INTRO_REMOTE_CLAUSE) && R.INTRO_REMOTE_CLAUSE.includes(R.MANUAL_REF) && /never ask for a password/.test(R.INTRO_REMOTE_CLAUSE) && !/\+ `use` it/.test(R.INTRO_REMOTE_CLAUSE), 'the remote intro clause: another machine, the manual, never a password — not the new + use recipe');
}

// ── a stub VibeSpace answering the CLI (status + resolve) ──
let statusBody = {};
let resolveBody = { status: 409, json: {} };
const server = http.createServer((req, res) => {
  let body = ''; req.on('data', (c) => { body += c; });
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'GET' && req.url === '/api/agent/browser/status') { res.end(JSON.stringify(statusBody)); return; }
    if (req.method === 'POST' && req.url === '/api/agent/browser/resolve') { res.statusCode = resolveBody.status; res.end(JSON.stringify(resolveBody.json)); return; }
    res.statusCode = 404; res.end(JSON.stringify({ error: 'not stubbed: ' + req.method + ' ' + req.url, code: 'stub' }));
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const API = `http://127.0.0.1:${server.address().port}`;
const BIN = path.join(SCRATCH, 'bin');
fs.mkdirSync(BIN, { recursive: true });
fs.writeFileSync(path.join(BIN, 'agent-browser'), '#!/bin/sh\ncase "$1" in --version) echo "agent-browser 0.38.1";; *) echo "the fake browser CLI was run: $*" >&2; exit 9;; esac\n', { mode: 0o755 });
const env = { HOME: path.join(SCRATCH, 'home'), PATH: `${BIN}:${path.dirname(process.execPath)}:/usr/bin:/bin`, VIBESPACE_API: API, VIBESPACE_SESSION_TOKEN: 'vsst_' + 'r'.repeat(24), VIBESPACE_SESSION_CWD: SCRATCH, LANG: 'C.UTF-8' };
fs.mkdirSync(env.HOME, { recursive: true });
const run = (cli, args) => new Promise((resolve) => execFile(process.execPath, [cli, ...args], { env, cwd: SCRATCH, timeout: 20000 }, (e, stdout, stderr) => resolve({ code: e ? (e.code ?? 1) : 0, out: String(stdout), err: String(stderr) })));
const CLI = path.join(REPO, 'data/bin/vibespace-browser');
const ephAnswer = (extra = {}) => ({ browserKey: 'bk-0000000a', leases: [], pin: null, attachments: [], handles: [], children: [], ephemeral: null, shared: false, recipe: R.RECIPE_POINTER, noDisplay: null, ...extra });

/** ④: the status census over one CLI → the failures. */
async function statusCensus(cli) {
  const bad = [];
  statusBody = ephAnswer();
  let r = await run(cli, ['status']);
  if (r.code !== 0 || !r.out.includes(R.RECIPE_POINTER)) bad.push(`ephemeral ⇒ the pointer (exit ${r.code}): ${r.out}${r.err}`);
  if (/this machine has no display/.test(r.out)) bad.push('a display here ⇒ no no-display sentence');
  if (/exit machine/i.test(r.out + r.err)) bad.push('"exit machines" in status');
  statusBody = ephAnswer({ recipe: R.REMOTE_POINTER }); // verify r1 F1: the server's remote pointer is what a remote conversation reads
  r = await run(cli, ['status']);
  if (!r.out.includes(R.REMOTE_POINTER) || r.out.includes(R.RECIPE_POINTER)) bad.push(`a conversation on another machine ⇒ the remote pointer, never the recipe: ${r.out}`);
  statusBody = ephAnswer({ ephemeral: { state: 'ready', live: true, startedAt: Date.now() - 5000 }, noDisplay: R.noDisplayLine({ display: { kind: 'none' } }) });
  r = await run(cli, ['status']);
  if (!r.out.includes(R.RECIPE_POINTER) || !r.out.includes('this machine has no display — only vibespace-browser works here')) bad.push(`no display ⇒ the sentence: ${r.out}`);
  statusBody = ephAnswer({ attachments: [{ alias: 'work', label: 'work', profileId: 'bp-00000001', isDefault: true, since: Date.now() }], leases: [{ profileId: 'bp-00000001', browser: { state: 'ready' }, others: 0 }] });
  r = await run(cli, ['status']);
  if (r.out.includes(R.RECIPE_POINTER)) bad.push('an attached profile ⇒ no pointer (it is already done)');
  return bad;
}
console.log('— ④ the status census over the REAL CLI');
{ const bad = await statusCensus(CLI); ok(!bad.length, 'status: ephemeral ⇒ the pointer · no display ⇒ the sentence · an attachment ⇒ no pointer · never "exit machines"', bad.join(' | ')); }
ok(!/exit machine/i.test(read('data/bin/vibespace-browser')), 'the CLI spells no "exit machines" sentence anywhere (it is vibespace-exit list\'s)');
{ // CONTROL: the CLI without the pointer line, run as a shipped copy (its verb table + stuck words beside it)
  const MUT = path.join(SCRATCH, 'mutant');
  fs.mkdirSync(MUT, { recursive: true });
  const src = read('data/bin/vibespace-browser');
  const line = '    if (!set.length && r.recipe) console.log(r.recipe);\n';
  fs.writeFileSync(path.join(MUT, 'vibespace-browser'), src.replace(line, ''), { mode: 0o755 });
  fs.copyFileSync(path.join(REPO, 'src/browser-verbs.js'), path.join(MUT, 'vibespace-browser-verbs.js'));
  fs.copyFileSync(path.join(REPO, 'src/browser-stuck.js'), path.join(MUT, 'vibespace-browser-stuck.js'));
  const bad = await statusCensus(path.join(MUT, 'vibespace-browser'));
  ok(src.includes(line) && bad.length > 0 && bad.some((b) => b.startsWith('ephemeral ⇒ the pointer')), 'CONTROL: a CLI without the pointer FAILS ④', bad.join(' | ').slice(0, 300));
}

console.log('— ⑤ the first verb refused while no browser exists ⇒ the pointer under the refusal');
{
  resolveBody = { status: 409, json: { error: 'machine ceiling reached — 6 browsers are running on this machine', code: 'browser_cap', remedy: 'wait for an idle-out', recipe: R.FIRST_VERB_NEXT } };
  const r = await run(CLI, ['open', 'https://example.com/']);
  ok(r.code === 1 && /\[browser_cap\]/.test(r.err) && r.err.includes(`next: ${R.FIRST_VERB_NEXT}`) && !/fake browser CLI was run/.test(r.err), 'the refusal, then `next:` + the pointer; nothing ran', r.err);
  resolveBody = { status: 409, json: { error: 'machine ceiling reached', code: 'browser_cap', remedy: 'wait' } };
  const r2 = await run(CLI, ['open', 'https://example.com/']);
  ok(r2.code === 1 && !/next: /.test(r2.err), 'a refusal without the server\'s pointer (a browser exists already) prints none', r2.err);
  const rsrc = read('src/routes/browser.js');
  ok(/if \(!st0\.ephemeral && !\(st0\.leases \|\| \[\]\)\.length\) res\.locals\.recipe = f\.remote \? require\('\.\.\/browser-recipes\.js'\)\.FIRST_VERB_NEXT_REMOTE : require\('\.\.\/browser-recipes\.js'\)\.FIRST_VERB_NEXT/.test(rsrc), 'wiring: /resolve arms the pointer only while the conversation has no browser (no ephemeral record, no lease) — the remote one for a conversation on another machine');
  ok((rsrc.match(/\.\.\.\(res\.locals && res\.locals\.recipe \? \{ recipe: res\.locals\.recipe \} : \{\}\)/g) || []).length === 2, 'wiring: both refusal writers (fail + failVerdict) carry it');
  ok(/recipe: f\.remote \? R\.REMOTE_POINTER : R\.RECIPE_POINTER, noDisplay: \(await statusNoDisplayOf\(k, f, st\)\) \|\| null/.test(rsrc) && /if \(s\.hostId \|\| s\.host \|\| s\._browserVariant === 'H'\) return '';/.test(rsrc), 'wiring: the status route sends the pointer (the remote one for a conversation on another machine) + the no-display line (never for a remote conversation)');
}

console.log('— ⑥ the tools intro: the clause, the display fact, the 9 600 B cap; rung H the remote clause');
/** The intro judged over one agent-routes module → the failures (empty = holds). */
function judgeIntro(ARx) {
  const bad = [];
  const T = { status: true, ask: true, task: true, jobs: true };
  const set = { attachments: [{ alias: 'personal', isDefault: false, profileId: 'bp-00000001' }, { alias: 'work', isDefault: true, profileId: 'bp-00000002' }] };
  const none = { kind: 'none', xvfb: true };
  for (const v of ['D', 'none']) {
    const withNd = ARx.sessionToolsIntro(T, { browserVariant: v, browserSet: set, browserDisplay: none });
    const plain = ARx.sessionToolsIntro(T, { browserVariant: v, browserSet: set });
    const line = withNd.split('\n').find((l) => l.startsWith('Browsing:')) || '';
    const b = Buffer.byteLength(withNd, 'utf8');
    if (line.split(R.INTRO_CLAUSE).length !== 2 || !/only `vibespace-browser` works here/.test(line) || b >= 9600) bad.push(`rung ${v}: the clause ONCE + the no-display clause, under 9 600 B (${b} B): ${line.slice(0, 200)}`);
    if (!plain.includes(R.INTRO_CLAUSE) || /has no display/.test(plain)) bad.push(`rung ${v}: without the display fact — the clause, and no no-display words`);
  }
  // verify r1 F1: a conversation on ANOTHER machine (rung H) is told the recipe is NOT from here — never new + use + the live view
  const h = ARx.sessionToolsIntro(T, { browserVariant: 'H', browserSet: null });
  const hl = h.split('\n').find((l) => l.startsWith('Browsing:')) || '';
  if (hl.split(R.INTRO_REMOTE_CLAUSE).length !== 2 || hl.includes(R.INTRO_CLAUSE) || Buffer.byteLength(h, 'utf8') >= 9600) bad.push(`rung H: the remote clause once, never the new + use clause: ${hl.slice(0, 200)}`);
  if (/has no display/.test(ARx.browserIntroLine('D', { display: { kind: 'x11' } }))) bad.push('a display here ⇒ the line must say nothing about it');
  return bad;
}
{
  const bad = judgeIntro(AR);
  ok(!bad.length, 'rungs D / none: the clause ONCE + the no-display clause under 9 600 B; rung H: the remote clause; a display here ⇒ nothing said', bad.join(' | '));
  const asrc = read('src/agent-routes.js');
  ok((asrc.match(/browserDisplay: browserDisplayFacts\(s\)/g) || []).length === 2, 'wiring: both delivery sites hand the machine\'s display fact beside the set');
  ok(/if \(!s \|\| s\.hostId \|\| s\.host \|\| s\._browserVariant === 'H'\) return null;/.test(asrc), 'wiring: a conversation on another machine is never told THIS machine\'s display');
  ok(/const clause = browserVariant === VARIANTS\.H \? R\.INTRO_REMOTE_CLAUSE : R\.INTRO_CLAUSE;/.test(asrc), 'wiring: rung H picks the remote clause (verify r1 F1)');
  // CONTROL: an agent-routes copy whose isolated Browsing line lost the clause ⇒ RED (a mutant copy outside the tree)
  const MUT = mutantCopies('brcp', REPO);
  const lost = asrc.replace("kept for this conversation) — ' + clause + '; a site", "kept for this conversation); a site");
  const ARm = MUT.load('src/agent-routes.js', lost, 'no-clause');
  const badm = judgeIntro(ARm);
  ok(lost !== asrc && badm.length > 0 && badm.some((x) => /^rung D/.test(x)), 'CONTROL: an intro whose Browsing line lost the clause FAILS ⑥', badm.join(' | ').slice(0, 300));
  const litter = treeLitter(REPO);
  ok(!litter.err && !litter.entries.length, 'the copy lives outside the tree (no litter under src/)', litter);
}

server.close();
fs.rmSync(SCRATCH, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
