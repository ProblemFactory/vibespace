#!/usr/bin/env node
// test-foryou-links — lane foryou-attachments (owner 2026-10-09 "经常 agent 会让我 review 一个产物/文件/网页，我却没法轻易从
// inbox 里打开"): a For-you item SHOWS what the agent wants the owner to look at and opens it in one press.
//   §1 THE SEGMENTER (src/lib/foryou-links.js, PURE): abs / ~ / relative / bare filename / url / /p/ / mailto / a mail
//      address / a path in a code span; an XSS string stays text; the words join back exactly; prose is not over-linked
//   §2 RESOLUTION against the asker's cwd + home + host; the chip's artifact row + its open-time probe
//   §3 THE ROUTE (POST /api/agent/user-todo, src/agent-routes/status.js) over REAL files: --artifact judged by the hand-over's
//      argument shape (handoverItems) + OPENABILITY at submit — too-many / a missing file / an unreadable file / a dangling
//      symlink / a folder without design.json / an unpublished page / an unknown page ⇒ the WHOLE ask refused with the
//      named lines and NOTHING filed; a remote-host path probed on that host, never locally; the registry's `present` ops
//      (the one writer). CONTROL: the old file-without-them behaviour (a patched route) ⇒ RED
//   §4 THE CLI (data/bin/vibespace-ask) against that route: the parse, one line per bad attachment, exit 2, the last line
//   §5 CENSUSES with RED controls: ONE path grammar · no innerHTML of raw text · a chip opens through THE ONE artifact door
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const F = await import(path.join(REPO, 'src/lib/foryou-links.js'));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + JSON.stringify(e).slice(0, 600) : '')); } };
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const links = (s) => F.segmentText(s).filter((g) => g.t === 'link').map((g) => g.kind + ':' + g.ref);
const J = JSON.stringify;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-fyl-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { } });

console.log('§1 THE SEGMENTER — one grammar with the chat, the words exactly as written');
{
  ok(J(links('see docs/plan.md and ~/notes/a.md and https://example.test/x.')) === J(['rel:docs/plan.md', 'path:~/notes/a.md', 'url:https://example.test/x']), 'the brief\'s own sentence: a relative path, a ~ path and a URL (the sentence\'s full stop stays text)');
  ok(J(links('the dump is /home/u/workspace/39AI/platform-dev/docs/skrypt-import-2026-10-09/DRY-DUMP.md, read it')) === J(['path:/home/u/workspace/39AI/platform-dev/docs/skrypt-import-2026-10-09/DRY-DUMP.md']), 'an absolute path (the owner\'s screenshot) — the comma after it is not part of it');
  ok(J(links('设计稿：/var/tmp/vibespace-lanes/webhook-design/design-webhook.zh.md（中文）')) === J(['path:/var/tmp/vibespace-lanes/webhook-design/design-webhook.zh.md']), 'CJK punctuation ends a path (path-linkify\'s rule, shared)');
  ok(J(links('open `report.md` then `out/`')) === J(['rel:report.md', 'rel:out/']), 'a bare filename / a folder IN A CODE SPAN links (the chat\'s rule)');
  ok(J(links('`cat /etc/hosts` and `~/x/y.md`')) === J(['path:/etc/hosts', 'path:~/x/y.md']), 'a path inside a code span links on its own words');
  ok(J(links('page /p/pgabcdefghij and https://vs.test/p/pgabcdefghij')) === J(['page:/p/pgabcdefghij', 'url:https://vs.test/p/pgabcdefghij']), 'a /p/<id> page; inside a URL it is the URL');
  ok(J(links('mail ops@foo.com or mailto:team@bar.org')) === J(['mail:mailto:ops@foo.com', 'mail:mailto:team@bar.org']), 'a mail address and a mailto: link');
  ok(links('report.md Node.js e.g. and/or en/zh/ja 10.0.0.0/8 v2.369.245 TCP/IP').length === 0, 'prose is not over-linked: a bare filename outside a code span, Node.js, e.g., and/or, en/zh/ja, a CIDR, a version, TCP/IP stay words');
  const x = '<img src=x onerror=alert(1)> "/tmp/a/<b>.md" `<script>`';
  const h = F.linkedHtml(x);
  ok(!/<img|<script|<b>/.test(h) && h.includes('&lt;img src=x onerror=alert(1)&gt;'), 'XSS: an <img onerror> / <script> / a tag inside a path stays TEXT (every segment escaped)', h);
  const s = 'a `docs/x.md` b /p/pgabcdefghij https://q.test/a?b=1&c=2), c ~/n.md: d (docs/y.md) ops@x.io';
  ok(F.segmentText(s).map((g) => g.s).join('') === s, 'the segments join back to the words EXACTLY (nothing added, nothing dropped)');
  ok(/data-ref="https:\/\/q\.test\/a\?b=1&amp;c=2"/.test(F.linkedHtml(s)), 'a link\'s ref rides its attribute escaped');
}

console.log('§2 RESOLUTION — against the ASKING conversation\'s cwd + home on ITS host');
{
  const at = { cwd: '/tmp/x/repo', host: 'h1' };
  ok(J(F.linkTarget('rel', 'docs/plan.md', at)) === J({ open: 'file', cands: ['/tmp/x/repo/docs/plan.md', '/tmp/x/docs/plan.md'], host: 'h1' }), 'a relative path → the chat\'s candidates under the asker\'s cwd, on the asker\'s host');
  ok(J(F.linkTarget('path', '~/notes/a.md', at)) === J({ open: 'file', cands: ['~/notes/a.md'], host: 'h1' }), '~ is the asker\'s home — expanded by ITS host at open, never here');
  ok(F.linkTarget('path', '/srv/a.js:42', at).line === 42 && F.linkTarget('path', '/srv/a.js:42', at).cands[0] === '/srv/a.js', 'a :line suffix opens at the line');
  ok(J(F.linkTarget('rel', 'repo/docs/z.md', { cwd: '/tmp/x/repo/sub' }).cands) === J(['/tmp/x/repo/sub/repo/docs/z.md', '/tmp/x/repo/docs/z.md', '/tmp/x/repo/repo/docs/z.md']), 'the cwd\'s own segment overlap (the chat\'s relCandidates — shared, src/path-linkify.js)');
  ok(F.linkTarget('url', 'https://e.test/x', at).open === 'url' && F.linkTarget('url', 'javascript:alert(1)', at) === null && F.linkTarget('mail', 'mailto:a@b.c', at).href === 'mailto:a@b.c' && F.linkTarget('page', '/p/pgabcdefghij', at).path === '/p/pgabcdefghij', 'a URL / a mail / a page; a javascript: ref opens nothing');
  const P = require(path.join(REPO, 'src/path-linkify.js'));
  ok(J(F.linkTarget('rel', 'a/b.md', { cwd: '/w/r' }).cands) === J(P.relCandidates('a/b.md', '/w/r')), 'the For-you candidates ARE the chat\'s (one function)');
  const fr = F.askArtifactRow({ kind: 'file', host: 'h1', path: '/tmp/x/repo/report.md', name: 'report.md' });
  ok(J(fr) === J({ kind: 'doc', host: 'h1', path: '/tmp/x/repo/report.md', name: 'report.md' }), 'a file chip → a doc row on its host (the door opens its viewer there)');
  ok(F.askArtifactRow({ kind: 'design', host: '', path: '/d/x' }).kind === 'design' && F.askArtifactRow({ kind: 'page', page: 'pgabcdefghij', name: 'P' }).url === '/p/pgabcdefghij' && F.askArtifactRow({ kind: 'page', page: 'pgabcdefghij' }).presented === true, 'a design chip → its folder; a page chip → its /p/ link (presented: the door opens the page)');
  ok(F.askArtifactRow({ kind: 'exe', path: '/x' }) === null && F.askArtifactRow(null) === null, 'a malformed attachment is no row');
  ok(F.askArtifactProbe({ kind: 'design', host: 'h1', path: '/d/x/' }).url === '/api/file/info?path=%2Fd%2Fx%2Fdesign.json&host=h1' && F.askArtifactProbe({ kind: 'page', page: 'pgabcdefghij' }).method === 'HEAD', 'the open-time re-check: a design\'s manifest on its host, a page\'s own URL');
}

console.log('§3 THE ROUTE — --artifact judged at submit; ANY attachment that would not open ⇒ nothing filed');
const express = require(path.join(REPO, 'node_modules/express'));
const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
const REG = require(path.join(REPO, 'src/server/artifact-registry.js'));
const { runOp } = require(path.join(REPO, 'src/safe-fs-worker.js'));
const AR = read('src/agent-routes.js');
const hm = /const handoverItems = (\(b\) => [^\n]+);/.exec(AR);
const handoverItems = hm ? (0, eval)(hm[1]) : null; // THE hand-over's argument shape, extracted verbatim (never a copy of its own)
ok(typeof handoverItems === 'function' && /handoverItems: \(b\) => handoverItems\(b\)/.test(AR), 'the route reads vibespace-msg\'s hand-over argument shape (handoverItems, handed in by setupAgentRoutes)');
const REPOX = path.join(TMP, 'repo');
fs.mkdirSync(path.join(REPOX, 'docs'), { recursive: true });
fs.writeFileSync(path.join(REPOX, 'report.md'), '# report\n');
fs.writeFileSync(path.join(REPOX, 'secret.md'), 'x'); fs.chmodSync(path.join(REPOX, 'secret.md'), 0o000);
fs.symlinkSync(path.join(REPOX, 'nowhere.md'), path.join(REPOX, 'dangle.md'));
fs.mkdirSync(path.join(REPOX, 'plain-dir')); fs.writeFileSync(path.join(REPOX, 'plain-dir', 'a.txt'), 'a');
fs.mkdirSync(path.join(REPOX, 'design-dir')); fs.writeFileSync(path.join(REPOX, 'design-dir', 'design.json'), '{}');
for (let i = 0; i < 9; i++) fs.writeFileSync(path.join(REPOX, `f${i}.md`), String(i));
const rootRead = (() => { try { fs.readFileSync(path.join(REPOX, 'secret.md')); return true; } catch { return false; } })();
const PAGES = { byId: (id) => (id === 'pgaaaaaaaaaa' ? { page: { name: 'Live page', path: '/p/pgaaaaaaaaaa' } } : id === 'pgbbbbbbbbbb' ? { gone: true } : null) };
const sessL = { name: 'asker', cwd: REPOX, host: 'local', _artifacts: {} };
const sessR = { name: 'remote-asker', cwd: '/remote', host: 'h1', _artifacts: {} };
REG.configure({ activeSessions: () => new Map([['s1', sessL], ['s2', sessR]]), pages: () => PAGES, log: { log() { }, warn() { } } });
const localCalls = [], remoteCalls = [];
async function serve(statusModule) {
  const todos = new UserTodoManager({ dataDir: fs.mkdtempSync(path.join(TMP, 'todos-')), onChange: () => { }, expirySweepMs: 0 });
  const app = express();
  app.use(express.json());
  app.locals.safeFs = { call: async (op, p) => { localCalls.push(p.path); return runOp(op, p).result; } };
  app.locals.getRemoteFs = () => ({ info: async (host, p) => { remoteCalls.push(host + ':' + p); if (p === '/remote/ok.md') return { path: p, isDirectory: false }; throw Object.assign(new Error('No such file or directory'), { code: 'ENOENT' }); } });
  const who = (req) => (req.headers.authorization === 'Bearer R' ? [sessR, 's2'] : [sessL, 's1']);
  require(statusModule).register(app, { activeSessions: new Map(), sessionStatus: {}, userTodos: todos, sessionStatusKey: (s, id) => 'claude:' + id, clearAsAgent: () => { }, agentSession: (req) => who(req), toolOn: () => true, toolDisabled: () => { }, bookkept: () => { }, handoverItems });
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${srv.address().port}`;
  const ask = async (add, tok = 'L') => { const res = await fetch(base + '/api/agent/user-todo', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: J({ add }) }); return { status: res.status, j: await res.json() }; };
  return { todos, srv, base, ask, count: () => todos.snapshot().open.length };
}
const S = await serve(path.join(REPO, 'src/agent-routes/status.js'));
{
  const r = await S.ask({ text: 'Review the dry run?', artifacts: [path.join(REPOX, 'report.md'), path.join(REPOX, 'design-dir'), '/p/pgaaaaaaaaaa'] });
  const it = r.j.item || {};
  ok(r.status === 200 && J((it.artifacts || []).map((a) => a.kind)) === J(['file', 'design', 'page']), 'a readable file, a design folder (design.json), a published page ⇒ filed with three attachments', r.j);
  ok(it.artifacts && it.artifacts[0].path === path.join(REPOX, 'report.md') && it.artifacts[0].name === 'report.md' && it.artifacts[0].host === '' && it.artifacts[2].name === 'Live page' && it.artifacts[2].url === '/p/pgaaaaaaaaaa', 'each row: kind, host, path | page, name (a page\'s own name), url');
  ok(it.cwd === REPOX && !it.hostId, 'the store stamps the asker\'s cwd (and no host: this box)');
  const rows = sessL._artifacts;
  ok(rows[':' + path.join(REPOX, 'report.md')] && rows[':' + path.join(REPOX, 'report.md')].lastOp === 'present' && rows[':' + path.join(REPOX, 'design-dir')].kind === 'design' && rows[':/p/pgaaaaaaaaaa'] && rows[':/p/pgaaaaaaaaaa'].presented, 'THE ONE WRITER: the registry folded a `present` op per attachment — the conversation\'s Artifacts list shows them', Object.keys(rows));
  ok(!/_artifacts/.test(read('src/agent-routes/status.js')) && /presentAsk\(s, item\.artifacts, \{ id: item\.id \}\)/.test(read('src/agent-routes/status.js')), 'the route never writes the rows itself — presentAsk (artifact-registry.js) does');
  const n0 = S.count();
  const cases = [
    ['a missing file', [path.join(REPOX, 'missing.md')], 'missing', /no such file on this machine — check the path/],
    ...(rootRead ? [] : [['an unreadable file', [path.join(REPOX, 'secret.md')], 'unreadable', /not readable on this machine \(permission denied\) — make it readable/]]),
    ['a dangling symlink', [path.join(REPOX, 'dangle.md')], 'missing', /a link whose target is gone counts as missing/],
    ['a folder without design.json', [path.join(REPOX, 'plain-dir')], 'folder', /a folder without design\.json — attach a file in it, or a design folder/],
    ['an unpublished page', ['/p/pgbbbbbbbbbb'], 'unpublished', /not published \(it was taken down\) — publish it again first/],
    ['a page never published here', ['/p/pgcccccccccc'], 'no-page', /no such page on this server — publish the file first/],
    ['nine attachments', Array.from({ length: 9 }, (_, i) => path.join(REPOX, `f${i}.md`)), 'too-many', /9 attachments — at most 8 per item/],
    ['one bad among good ones', [path.join(REPOX, 'report.md'), path.join(REPOX, 'missing.md'), '/p/pgaaaaaaaaaa'], 'missing', /missing\.md: no such file/],
  ];
  for (const [what, arts, why, re] of cases) {
    const b = await S.ask({ text: 'Q ' + what, artifacts: arts });
    const lines = b.j.refused || [];
    ok(b.status === 422 && b.j.code === 'bad-artifact' && lines.length === 1 && lines[0].why === why && re.test(lines[0].error) && /^nothing was filed/.test(b.j.error) && S.count() === n0, `${what} ⇒ the WHOLE ask refused (422), the line names it and the fix, NOTHING filed`, b.j);
  }
  if (rootRead) ok(true, 'an unreadable file: SKIPPED — this account reads a 000 file (root)');
  const two = await S.ask({ text: 'Q two bad', artifacts: [path.join(REPOX, 'missing.md'), '/p/pgbbbbbbbbbb'] });
  ok(two.status === 422 && (two.j.refused || []).length === 2, 'ONE LINE PER bad attachment');
  const rem = await S.ask({ text: 'Q remote', artifacts: ['/remote/ok.md'] }, 'R');
  ok(rem.status === 200 && remoteCalls.includes('h1:/remote/ok.md') && !localCalls.includes('/remote/ok.md') && rem.j.item.artifacts[0].host === 'h1' && rem.j.item.hostId === 'h1' && rem.j.item.cwd === '/remote', 'a REMOTE asker\'s path is probed on ITS host (RemoteFs info), never by a local stat; the chip carries the host', { remoteCalls, localCalls });
  const remBad = await S.ask({ text: 'Q remote gone', artifacts: ['/remote/gone.md'] }, 'R');
  ok(remBad.status === 422 && /no such file on h1/.test(remBad.j.refused[0].error) && !localCalls.includes('/remote/gone.md'), 'a remote file that is not there is refused naming THAT host');
  const plain = await S.ask({ text: 'Q no attachments' });
  ok(plain.status === 200 && !plain.j.item.artifacts && plain.j.item.cwd === REPOX, 'an ask without --artifact files as before (+ the cwd its words resolve against)');
  // CONTROL: the old file-without-them behaviour — a patched route that files the item WITHOUT the refused ones
  const mutDir = fs.mkdtempSync(path.join(TMP, 'mut-'));
  const orig = read('src/agent-routes/status.js');
  const mut = orig.replace(/        if \(j\.bad\.length\) return res\.status\(422\)[^\n]*\n/, '').replace(/require\('\.\.\//g, `require('${REPO}/src/`);
  fs.writeFileSync(path.join(mutDir, 'status.js'), mut);
  const M = await serve(path.join(mutDir, 'status.js'));
  const m0 = M.count();
  const mb = await M.ask({ text: 'Q mutant', artifacts: [path.join(REPOX, 'report.md'), path.join(REPOX, 'missing.md')] });
  ok(mut !== orig && mb.status === 200 && M.count() === m0 + 1, 'CONTROL: the old file-without-them route FILES the item (status 200) — the "nothing filed" legs above are RED on it', mb.j);
  M.srv.close();
}

console.log('§4 THE CLI — vibespace-ask --artifact against that route');
{
  // ASYNC (the route answers from THIS process — a spawnSync would hold the loop the answer needs)
  const cli = (args, cwd = REPOX) => new Promise((res) => { const p = spawn(process.execPath, [path.join(REPO, 'data/bin/vibespace-ask'), ...args], { cwd, env: { PATH: process.env.PATH, VIBESPACE_API: S.base, VIBESPACE_SESSION_TOKEN: 'L' } }); let stdout = '', stderr = ''; p.stdout.on('data', (d) => { stdout += d; }); p.stderr.on('data', (d) => { stderr += d; }); p.on('close', (status) => res({ status, stdout, stderr })); });
  const n0 = S.count();
  const bad = await cli(['Please review', '--artifact', 'report.md', 'missing.md', 'plain-dir']);
  const errs = bad.stderr.trim().split('\n');
  ok(bad.status === 2 && errs.length === 3 && /missing\.md: no such file/.test(errs[0]) && /plain-dir: a folder without design\.json/.test(errs[1]) && errs[2] === 'nothing was filed — fix the attachment and run vibespace-ask again' && S.count() === n0, 'two bad attachments ⇒ exit 2, one line each (absolute against the shell\'s cwd), the last line says nothing was filed', { status: bad.status, errs });
  const good = await cli(['Please review', '--artifact', 'report.md', 'design-dir', '/p/pgaaaaaaaaaa', '--urgency', 'high']);
  ok(good.status === 0 && /attached: .*\/report\.md \(file\)/.test(good.stdout) && /attached: \/p\/pgaaaaaaaaaa \(page\)/.test(good.stdout) && S.count() === n0 + 1, 'fixed ⇒ filed ONCE: every path after the flag until the next flag, each attachment echoed', good.stdout);
  const first = await cli(['--artifact', 'report.md', 'Is', 'this', 'right?']);
  const it = S.todos.snapshot().open.find((i) => i.text === 'Is this right?');
  ok(first.status === 0 && it && it.artifacts && it.artifacts.length === 1 && it.artifacts[0].path === path.join(REPOX, 'report.md'), 'the flag BEFORE the question takes one path (vibespace-msg\'s rule) — the rest is the question', first.stderr || first.stdout);
  ok(/--artifact <path\|\/p\/id>…/.test((await cli(['--help'])).stdout), 'the usage names --artifact');
}
S.srv.close();

console.log('§5 CENSUSES — one grammar · escaped words · the one artifact door (each with a RED control)');
{
  const FY = read('src/lib/foryou-links.js'), CR = read('src/lib/chat-renderers.js'), PL = read('src/path-linkify.js');
  const SAMPLES = ['/tmp/x/a.md', '~/notes/a.md', 'docs/plan.md', 'report.md', 'B2BTasks/x/final/'];
  const acorn = require(path.join(REPO, 'node_modules/acorn'));
  const pathRegexes = (src) => { const out = []; for (const tk of acorn.tokenizer(src, { ecmaVersion: 'latest', sourceType: 'module' })) if (tk.type.label === 'regexp') { const re = new RegExp(tk.value.pattern, tk.value.flags.replace('g', '')); if (SAMPLES.some((s) => { const m = re.exec(s); return m && m[0] === s; })) out.push('/' + tk.value.pattern + '/'); } return out; };
  const oneGrammar = (fy) => /import \{ pathRe, cleanPath, looksRelPath, relCandidates \} from '\.\.\/path-linkify\.js';/.test(fy) && pathRegexes(fy).length === 0;
  ok(oneGrammar(FY), 'ONE GRAMMAR: foryou-links.js reads where a path ends / a relative rule / the candidates from src/path-linkify.js, and holds no regex of its own that matches a whole path', pathRegexes(FY));
  ok(/looksRelPath, relCandidates \} from '\.\.\/path-linkify\.js'/.test(CR) && /if \(looksRelPath\(txt\)\)/.test(CR) && /const cands = relCandidates\(rel, cwd\);/.test(CR), 'the chat reads the SAME relative rule and candidates (moved, not copied)');
  const SIG = String.raw`[\w@%+=.\-][^\s<>"'` + '`' + String.raw`|]*$`;
  const holders = []; const walk = (d) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const rel = path.posix.join(d, e.name); if (e.isDirectory()) walk(rel); else if (/\.(m?js)$/.test(e.name) && read(rel).includes(SIG)) holders.push(rel); } };
  walk('src');
  ok(J(holders) === J(['src/path-linkify.js']) && PL.includes(SIG), 'the relative rule\'s own pattern lives in ONE file under src/', holders);
  const mutFy = FY.replace('const CODE_RE', 'const MY_PATH = /(?:~|\\.\\.?)?\\/[^\\s]+/g;\nconst CODE_RE');
  ok(mutFy !== FY && !oneGrammar(mutFy), 'CONTROL: a patched copy with its own path regex ⇒ the one-grammar census is RED', pathRegexes(mutFy));
  // escaped words: the tray draws its words / detail through linkedHtml (every segment escaped); the window links TEXT nodes
  const ROW = read('src/lib/user-todos-row.js'), IW = read('src/lib/inbox-window.js');
  const wordsEscaped = (row) => /<div class="ut-text">\$\{card \? escHtml\(words\) : linkedHtml\(words, \{ escape: escHtml \}\)\}<\/div>/.test(row) && /<div class="ut-detail">\$\{linkedHtml\(detail, \{ escape: escHtml \}\)\}<\/div>/.test(row) && /a\.textContent = g\.s;/.test(row) && !/\.innerHTML = g\./.test(row);
  ok(wordsEscaped(ROW), 'NO innerHTML OF RAW TEXT: the tray\'s words and detail go through linkedHtml (escaped); the window\'s links are nodes with textContent');
  ok(/mdInto\(c\.title, v\.title, \{ inline: true \}\); linkifyInto\(c\.title\);/.test(IW) && /if \(!card\) linkifyInto\(c\.detail\);/.test(IW) && /c\.arts\.replaceChildren\(\.\.\.askChipEls\(it, t\)\)/.test(IW), 'the For-you window: its sanitized words linked as text nodes, its chips as nodes');
  ok(!wordsEscaped(ROW.replace('linkedHtml(words, { escape: escHtml })', 'words')), 'CONTROL: the words written raw into the row HTML ⇒ the census is RED');
  const rawHtml = (await import('data:text/javascript,' + encodeURIComponent(FY.replace("import { pathRe, cleanPath, looksRelPath, relCandidates } from '../path-linkify.js';", `import { pathRe, cleanPath, looksRelPath, relCandidates } from 'file://${path.join(REPO, 'src/path-linkify.js')}';`).replace('export function linkedHtml(text, { escape = esc } = {})', 'export function linkedHtml(text, { escape = (s) => s } = {})')))).linkedHtml('<img src=x onerror=alert(1)>');
  ok(/<img/.test(rawHtml), 'CONTROL: a linkedHtml without its escape lets <img onerror> through — the §1 XSS leg is RED on it');
  // the one artifact door: a chip opens through openArtifactRow (artifacts-window.js) — never its own opener
  const ACT = read('src/lib/user-todos-actions.js');
  const body = (src) => { const i = src.indexOf('const openArtifact = async (item, k) => {'); const j = src.indexOf('\n  };', i); return i < 0 ? '' : src.slice(i, j); };
  const oneDoor = (src) => { const b = body(src); return /openArtifactRow\(app, /.test(b) && /await import\('\.\/artifacts-window\.js'\)/.test(b) && !/app\.(openFile|openDesign|openBrowser|openFileExplorer)\b|window\.open\(/.test(b); };
  ok(oneDoor(ACT), 'THE ONE DOOR: a chip opens through openArtifactRow (the chat view\'s _openArtifact when this client shows the conversation, else the row\'s own facts)');
  ok(/export function openArtifactRow\(app, sessionId, b\)/.test(read('src/lib/artifacts-window.js')) && /model\.openArtifact\(it, Number\(fy\.dataset\.ai\)\)/.test(read('src/lib/user-todos-panel.js')) && /model\.openArtifact\(it, Number\(fy\.dataset\.ai\)\)/.test(IW), 'the tray AND the window press a chip into model.openArtifact');
  ok(!oneDoor(ACT.replace("openArtifactRow(app, (s && s.webuiId) || '', row);", 'app.openFile(row.path, row.name, { host: row.host });')), 'CONTROL: a chip that opens its file by itself ⇒ the one-door census is RED');
  ok(/'\{name\} is gone — nothing at \{path\} any more'/.test(body(ACT)) && /'\{name\} is no longer published'/.test(body(ACT)), 'the open-time re-check speaks: a gone file / an unpublished page is a toast that says so, never silent');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
