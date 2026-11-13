#!/usr/bin/env node
// THE ARTIFACTS LIST BY INTENT (lane artifacts-by-intent; owner 2026-11-06, a phone shot of the Artifacts popover:
// 「这个界面你得好好优化下了 根本找不到想找的东西」 + 「分一下哪些可能是用户最需要看的，比如 publish 这种行为显然就是 agent 想要
// 让用户看的，自动检测修改过的文件这种优先级就更低」). PURE: src/artifacts.js `intentOf` (the ONE verdict) and the list model
// src/lib/artifacts-list-model.js over the owner's shape.
//   ① the VERDICT TABLE — every row shape the reducer makes (KINDS × write / edit, the registries' ops: publish ·
//     unpublish · present · handover · open · upload, a service running / stopped, a design opened / not) ⇒ its band;
//     sticky: an ask's --artifact stays «for you» after an edit; `merge` keeps it; every card block carries the verdict;
//     the chip's order (view) = the bands, newest first — CONTROL: the base's kind-first view ⇒ RED.
//   ② the OWNER'S SHAPE (30 artifacts incl. three README.md + 41 code files; 2 published pages, a hand-over, a service)
//     through the real reducer + view + cardBlock (listFor's own composition) ⇒ bands 4 · 26 · 41 (touched folded);
//     the README rows told apart by their shortest distinguishing suffix; every row names its folder; a band over 8
//     rows sub-groups by folder (every row in exactly one; a band ≤ 8 flat); the filter over a folder name / a path /
//     the kind's word keeps the bands and unfolds a folded hit; 最近 holds only what no open section draws.
//   ③ the window: the rail opens with the three bands; no column clicked ⇒ the bands' order; the Path column sorts by
//     the folder it shows, then the name. ④ the device-kept view: a view stored before the intent default reads as it.
//   ROUND 2 (the r1 acceptance): a row from ELSEWHERE (a helper's folder) leads with WHO and WHERE — «referee · …/out ·
//     文档», never a whole absolute path; the kind's word matches as a WORD (equal, or a word's prefix of ≥ 3 — «de»
//     never floods 41 code rows, a prefix alone never unfolds «touched»); the host prefix names ANOTHER machine only;
//     inside a folder head the BARE name and no folder; the root by the cwd's own name; a /p/ link the PERSON pasted
//     is theirs (never «for you»).
//   ROUND 3 (the r2 acceptance): the AUTHOR of a link is the message's PROVENANCE (the CLI's measured user-record shapes,
//     the delivery frame whose stamp is gone, codex / ACP) — a peer's send is «for you», the person's paste «made here»,
//     a showing is sticky forward (a row kept before the field too); a folder is KEYED by its directory and labelled by
//     its tail, a label that collides grows; ONE host rule for the names and the folders; a head tapped while filtering
//     is a peek the plan honours and never stores.
//   CONTROLS (patched copies of the model, each RED by name): the bare name on a collision; a «show more» in place of a
//   section; 最近 repeating an open section's rows; the kind-first default; «touched» unfolded by default; r1's folderOf
//   (the whole path); the kind word as a substring; the Path sort by the path's tail; the host on every remote row;
//   the suffix kept inside a folder head; (r3) the reader's r2 type rule; the showing not sticky forward; a folder keyed
//   by its tail; the names' r2 host rule; the plan ignoring a peek.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const AF = require(path.join(REPO, 'src/artifacts.js'));
const MODEL = path.join(REPO, 'src/lib/artifacts-list-model.js');
const M = await import(pathToFileURL(MODEL).href);
let pass = 0, fail = 0;
const ok = (c, msg, why) => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (why !== undefined ? ' — ' + (typeof why === 'string' ? why : JSON.stringify(why)).slice(0, 600) : '')); } };
const done = () => { console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASSED'} (${pass} passed)`); process.exit(fail ? 1 : 0); };
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-af-intent-'));
process.on('exit', () => { try { fs.rmSync(scratch, { recursive: true, force: true }); } catch { } });

console.log('⓪ the names this suite judges (a copy without them is RED here, by name)');
const need = [['src/artifacts.js intentOf', typeof AF.intentOf === 'function'], ['src/artifacts.js INTENTS', Array.isArray(AF.INTENTS)], ['the model\'s shownNames', typeof M.shownNames === 'function'], ['the model\'s folderOf', typeof M.folderOf === 'function'], ['the model\'s foldersOf', typeof M.foldersOf === 'function'], ['the model\'s whereOf', typeof M.whereOf === 'function'], ['the model\'s metaLine', typeof M.metaLine === 'function'], ['the model\'s kindHit', typeof M.kindHit === 'function'], ['the model\'s pathWord', typeof M.pathWord === 'function'], ['src/artifacts.js opAuthor', typeof AF.opAuthor === 'function'], ['src/artifacts.js wasShown', typeof AF.wasShown === 'function'], ['the model\'s folderNames', typeof M.folderNames === 'function'], ['the model\'s hostTag', typeof M.hostTag === 'function'], ['the model\'s listCtx', typeof M.listCtx === 'function'], ['the model\'s foldToggle', typeof M.foldToggle === 'function'], ['the model\'s intent group', Array.isArray(M.GROUPS) && M.GROUPS[0] === 'intent']];
for (const [n, c] of need) ok(c, `${n} exists`);
if (fail) done();
ok(AF.INTENTS.join() === 'foryou,made,touched' && M.INTENT_ORDER.join() === AF.INTENTS.join(), 'the bands, in order: for you · made here · touched (the server\'s INTENTS = the model\'s INTENT_ORDER)');

// ── ① THE VERDICT TABLE ──
console.log('① intentOf over every row shape the reducer makes');
const CWD = '/home/u/proj', T0 = Date.UTC(2026, 10, 6, 12), MIN = 60e3;
const one = (...ops) => { let r = {}; for (const o of ops) r = AF.fold(r, { cwd: CWD, ...o }); return Object.values(r).pop(); };
const EXT = { doc: 'notes.md', media: 'cover.png', page: 'site.html', code: 'run.py', other: 'blob.bin' };
const job = (state) => ({ id: 'j1', state, listen: { port: 8100, at: T0, firstAt: T0 }, runs: [{ startedAt: T0 - MIN, ...(state === 'down' ? { endedAt: T0 + MIN } : {}) }], ownerSession: { conversationId: 'c-A' } });
const TABLE = [];
for (const [kind, file] of Object.entries(EXT)) {
  TABLE.push([`${kind}: written by the agent`, one({ op: 'write', path: file, at: T0 }), kind === 'code' ? 'touched' : 'made']);
  TABLE.push([`${kind}: born by an edit (a file that was there)`, one({ op: 'edit', path: file, at: T0 }), 'touched']);
  TABLE.push([`${kind}: written, then edited`, one({ op: 'write', path: file, at: T0 }, { op: 'edit', path: file, at: T0 + MIN }), kind === 'code' ? 'touched' : 'made']);
}
TABLE.push(['doc: written by a subagent', one({ op: 'write', path: 'sub.md', at: T0, via: { kind: 'subagent', name: 'pt2:fix' } }), 'made']);
TABLE.push(['doc: the person\'s own save of a file the agent never wrote', one({ op: 'edit', by: 'user', path: 'mine.md', at: T0 }), 'touched']);
TABLE.push(['README.md: edited (the project\'s scaffolding ⇒ code)', one({ op: 'edit', path: 'README.md', at: T0 }), 'touched']);
TABLE.push(['README.md: written («write me a README» is the deliverable)', one({ op: 'write', path: 'docs/README.md', at: T0 }), 'made']);
const PG = { id: 'pg1', name: 'site', srcKey: 'local:' + CWD + '/site.html', srcPath: CWD + '/site.html', path: '/p/pg1', updatedAt: T0 };
TABLE.push(['page: written + PUBLISHED (its /p/ link)', one({ op: 'write', path: 'site.html', at: T0 }, AF.pageOp(PG)), 'foryou']);
TABLE.push(['page: published, then the agent edits its source', one({ op: 'write', path: 'site.html', at: T0 }, AF.pageOp(PG), { op: 'edit', path: 'site.html', at: T0 + MIN }), 'foryou']);
TABLE.push(['page: UNPUBLISHED (it leaves the band and says so)', one({ op: 'write', path: 'site.html', at: T0 }, AF.pageOp(PG), AF.pageOp(PG, { removed: true })), 'made']);
const pres = one(AF.presentOp({ id: 'pgabcdefghij', origin: '' }));
const live = AF.resolvePresented({ [pres.key]: pres }, { pageOf: () => ({ page: { id: 'pgabcdefghij', name: 'Their page', path: '/p/pgabcdefghij', public: true } }) })[pres.key];
const gone = AF.resolvePresented({ [pres.key]: pres }, { pageOf: () => ({ gone: true }) })[pres.key];
TABLE.push(['page: PRESENTED here (another conversation\'s, live)', live, 'foryou']);
TABLE.push(['page: presented, then taken down (gone)', gone, 'made']);
const helperRow = one({ op: 'write', path: '/home/u/helper/report.md', at: T0 });
TABLE.push(['doc: HANDED OVER by a helper conversation', one(AF.handoverOp(helperRow, { from: { cid: 'c-H', name: 'helper' }, at: T0 })), 'foryou']);
TABLE.push(['doc: an ask\'s --artifact (present)', one({ op: 'write', path: 'ask.md', at: T0 }, AF.askOp({ kind: 'file', path: CWD + '/ask.md' }, { at: T0 + MIN })), 'foryou']);
TABLE.push(['doc: an ask\'s --artifact, then an edit (once shown, still for you)', one({ op: 'write', path: 'ask.md', at: T0 }, AF.askOp({ kind: 'file', path: CWD + '/ask.md' }, { at: T0 + MIN }), { op: 'edit', path: 'ask.md', at: T0 + 2 * MIN }), 'foryou']);
TABLE.push(['code: an ask\'s --artifact names a code file (the agent put it in front of the person)', one({ op: 'edit', path: 'run.py', at: T0 }, AF.askOp({ kind: 'file', path: CWD + '/run.py' }, { at: T0 + MIN })), 'foryou']);
TABLE.push(['upload: the person attached it (theirs — never «for you»)', one(AF.uploadOp({ path: CWD + '/brief.pdf', size: 9 }, { at: T0 })), 'made']);
TABLE.push(['page: a /p/ link the PERSON pasted into their own message (theirs — never «for you»)', AF.resolvePresented((() => { const r0 = one({ ...AF.presentOp({ id: 'pgpasted0001', origin: '' }), by: 'user', at: T0 }); return { [r0.key]: r0 }; })(), { pageOf: () => ({ page: { id: 'pgpasted0001', name: 'Pasted', path: '/p/pgpasted0001', public: true } }) })[':/p/pgpasted0001'], 'made']);
TABLE.push(['page: the person pasted it, then the agent linked it too (now shown)', one({ ...AF.presentOp({ id: 'pgpasted0002', origin: '' }), by: 'user', at: T0 }, { ...AF.presentOp({ id: 'pgpasted0002', origin: '' }), at: T0 + MIN }), 'foryou']);
TABLE.push(['upload: attached to an ask (still the person\'s own)', one(AF.uploadOp({ path: CWD + '/mine.pdf', size: 9 }, { at: T0 }), AF.askOp({ kind: 'file', path: CWD + '/mine.pdf' }, { at: T0 + MIN })), 'made']);
TABLE.push(['upload: attached, then the agent edits it', one(AF.uploadOp({ path: CWD + '/brief.md', size: 9 }, { at: T0 }), { op: 'edit', path: 'brief.md', at: T0 + MIN }), 'made']);
const DS = { id: 'd1', dir: CWD + '/designs/landing', title: 'Landing', openedAt: T0 };
TABLE.push(['design: registered ⇒ the Design window opened on it', one(AF.designOp(DS)), 'foryou']);
TABLE.push(['design: a row no Design window opened (a merged row: lastOp edit, never shown)', { key: ':' + DS.dir, kind: 'design', path: DS.dir, name: 'Landing', writes: 0, edits: 1, lastOp: 'edit', by: 'agent' }, 'made']);
TABLE.push(['design: handed over by a helper', one(AF.handoverOp(one(AF.designOp({ ...DS, dir: '/home/u/helper/designs/x' })), { from: { cid: 'c-H', name: 'helper' }, at: T0 })), 'foryou']);
TABLE.push(['service: RUNNING, with the link the person clicks', AF.serviceRow(job('up'), { now: T0 + MIN }), 'foryou']);
TABLE.push(['service: stopped (greyed for a day)', AF.serviceRow(job('down'), { now: T0 + 2 * MIN }), 'made']);
TABLE.push(['junk: null', null, 'touched']);
TABLE.push(['junk: a row with no facts', { key: 'x' }, 'touched']);
const got = TABLE.map(([what, row, want]) => ({ what, want, got: AF.intentOf(row) }));
for (const g of got) console.log(`    ${g.got === g.want ? ' ' : '!'} ${g.what.padEnd(84)} ${g.got}`);
ok(got.every((g) => g.got === g.want), `the table: ${got.length} row shapes, each in its band`, got.filter((g) => g.got !== g.want));
// r5 (V1): wasShown's read of a row WITHOUT `shown` agrees with `shown` on every row this reducer writes — over the
// table and over a seeded walk of op sequences (every op the readers and the stores make, both authors, three paths)
// — so the fallback can only ever speak for a row an older tree wrote, never add a showing this reducer would not stamp
const disagree = TABLE.filter(([, r]) => r && AF.wasShown(r) !== !!r.shown).map(([w]) => w);
const FZ = 'pgfuzz000001', fzPage = (p) => ({ id: 'pgfz' + p.length, srcKey: 'local:' + CWD + '/' + p, srcPath: CWD + '/' + p, path: '/p/pgfz', updatedAt: T0 });
const FZOPS = [(p) => ({ op: 'write', path: p }), (p) => ({ op: 'edit', path: p }), (p) => ({ op: 'edit', path: p, by: 'user' }), () => AF.presentOp({ id: FZ, origin: '' }), () => ({ ...AF.presentOp({ id: FZ, origin: '' }), by: 'user' }),
  (p) => AF.askOp({ kind: 'file', path: CWD + '/' + p }, { at: T0, id: 'ask:ut-00000000ff:0' }), () => AF.askOp({ kind: 'page', page: FZ }, { at: T0, id: 'ask:ut-00000000ff:1' }), () => AF.askOp({ kind: 'page', page: FZ }, { at: T0 }),
  (p) => AF.uploadOp({ path: CWD + '/' + p, size: 1 }, { at: T0 }), (p) => AF.handoverOp(one({ op: 'write', path: p, at: T0 }), { from: { cid: 'c-H', name: 'h' }, at: T0 }), (p) => AF.pageOp(fzPage(p)), (p) => AF.pageOp(fzPage(p), { removed: true }), (p) => AF.designOp({ id: 'dz', dir: CWD + '/' + p, title: 'z', openedAt: T0 })];
let seed = 7, walks = 0;
const rnd = (n) => ((seed = (seed * 1103515245 + 12345) % 2147483648) % n);
for (let w = 0; w < 150; w++) { let rows = {}; for (let i = 0, n = 1 + rnd(6); i < n; i++) { const o = FZOPS[rnd(FZOPS.length)](['a.md', 'b.py', 'c.html'][rnd(3)]); if (o) rows = AF.apply(rows, { cwd: CWD, at: T0 + i, ...o, by: AF.opAuthor(o) === 'user' || o.by === 'user' ? 'user' : 'agent', id: o.id ? o.id + ':' + w + ':' + i : undefined }).rows; } for (const r of Object.values(rows)) { walks++; if (AF.wasShown(r) !== !!r.shown) disagree.push(JSON.stringify(r)); } }
ok(!disagree.length && walks > 150, `r5 (V1): wasShown agrees with \`shown\` on every row the reducer writes (the table + ${walks} rows of 150 seeded op walks)`, disagree.slice(0, 3));
ok(AF.KINDS.every((k) => TABLE.some(([, r]) => r && r.kind === k)), `every kind of src/artifacts.js KINDS is in the table (${AF.KINDS.join(' ')})`);
ok(['publish', 'unpublish', 'present', 'handover', 'open', 'upload', 'write', 'edit', 'listen'].every((op) => TABLE.some(([, r]) => r && r.lastOp === op)), 'every op the rows can last carry is in the table (write · edit · the six REG_OPS · a service\'s listen)');
console.log('  a /p/ link in the PERSON\'s own message is theirs: the harness hook tags it, the reducer never marks it shown');
const OF = require(path.join(REPO, 'src/harnesses/artifacts-of.js'));
const said = (t) => [{ type: 'text', text: t }];
const cu = OF.claude({ type: 'user', message: { role: 'user', content: said('look at /p/pgabcdefghij') } }), ca = OF.claude({ type: 'assistant', message: { content: said('here: /p/pgabcdefghij') } });
const xu = OF.codex({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '/p/pgabcdefghij' }] } }), xa = OF.codex({ type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '/p/pgabcdefghij' }] } });
const au = OF.acp({ kind: 'update', update: { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: '/p/pgabcdefghij' } } }), aa = OF.acp({ kind: 'update', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: '/p/pgabcdefghij' } } });
ok([cu, xu, au].every((o) => o.length === 1 && o[0].op === 'present' && o[0].by === 'user') && [ca, xa, aa].every((o) => o.length === 1 && o[0].op === 'present' && !o[0].by), 'claude · codex · ACP: the person\'s message ⇒ a present op `by: user`; the agent\'s ⇒ untagged (the agent\'s)', [cu, xu, au, ca, xa, aa]);
ok(AF.opAuthor(cu[0]) === 'user' && AF.opAuthor(ca[0]) === 'agent' && AF.opAuthor({ op: 'write', by: 'user' }) === 'agent' && AF.opAuthor(null) === 'agent', 'opAuthor (the live consumer\'s and the rebuild\'s ONE rule): only a present op keeps the person\'s authorship');
console.log('  r3: the AUTHOR of a link is the message\'s PROVENANCE, never the record\'s type (the CLI\'s measured user-record shapes)');
const LNK = '/p/pgabcdefghij';
const withLink = (rec) => { const c = rec.message.content, li = Array.isArray(c) ? c.map((b) => b.type).lastIndexOf('text') : -1; return { ...rec, message: { ...rec.message, content: typeof c === 'string' ? c + ' ' + LNK : c.map((b, i) => (i === li ? { ...b, text: b.text + ' ' + LNK } : b)) } }; };
const textOfRec = (r) => (typeof r.message.content === 'string' ? r.message.content : r.message.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
const FIX = fs.readFileSync(path.join(REPO, 'scripts/fixtures/message-origin/claude-user-records.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((r) => textOfRec(r).trim());
const PERSON = { 'mo-typed-1': 'user', 'mo-tray-answer-1': 'user', 'mo-command-1': 'user', 'mo-typed-picture': 'user', 'mo-typed-tasktag': 'user', 'mo-typed-compactpaste': 'user', 'mo-typed-2': 'user', 'mo-compact-1': 'none' }; // every other shape: an agent's
const byOf = (ops) => (ops.length ? ops[0].by || 'agent' : 'none');
const fx = FIX.map((r) => [r.uuid, byOf(OF.claude(withLink(r))), PERSON[r.uuid] || 'agent']);
ok(fx.length >= 20 && fx.every(([, g, w]) => g === w), `claude: ${fx.length} measured user-record shapes ⇒ the person's typing (a message, a tray answer, a command, a typed tag / summary head) «user»; a peer, a notice, a task's wake, VibeSpace's note / continue, the CLI's own lines «agent»; the compaction summary witnesses nothing`, fx.filter(([, g, w]) => g !== w));
const FRAME = `Message from session "referee" (via vibespace-msg; reply: vibespace-msg send "referee" "..."):\nreport published: ${LNK}`;
ok(byOf(OF.claude({ type: 'user', message: { content: FRAME } })) === 'agent' && byOf(OF.claude({ type: 'user', _fromWebui: true, msgId: 'm1', message: { role: 'user', content: said(FRAME) } })) === 'user', 'the vibespace-msg frame with its origin stamp gone (the acceptor\'s probe) ⇒ an agent\'s; the same words sent from our composer stay the person\'s');
const cx = (item) => byOf(OF.codex({ type: 'response_item', payload: { type: 'message', role: 'user', ...item } }));
ok(cx({ content: [{ type: 'input_text', text: FRAME }] }) === 'agent' && cx({ content: [{ type: 'input_text', text: 'see ' + LNK }], webui_peer: { name: 'referee', body: 'see ' + LNK, kind: 'peer' } }) === 'agent' && cx({ content: [{ type: 'input_text', text: FRAME }], webui_msg_id: 'w1' }) === 'user' && cx({ content: [{ type: 'input_text', text: 'see ' + LNK }] }) === 'user',
  'codex (THE codex message, userItemOf): the rollout\'s frame and the wrapper\'s peer marker ⇒ an agent\'s; a typed message ⇒ the person\'s');
const ac = (text) => byOf(OF.acp({ kind: 'update', update: { sessionUpdate: 'user_message_chunk', content: { type: 'text', text } } }));
const NOTICE = 'VibeSpace (this workspace, not another agent) reports: [build] the report is up: ' + LNK; // src/notification-senders.js VIBESPACE_NOTICE_HEAD
ok(ac(FRAME) === 'agent' && ac(NOTICE) === 'agent' && ac('see ' + LNK) === 'user', 'ACP: a user chunk opening with the delivery frame or VibeSpace\'s notice head ⇒ an agent\'s; any other ⇒ the person\'s');
const foldBy = (recs, rows = {}, A = AF, R = OF) => { for (const r of recs) for (const o of R.claude(r)) rows = A.apply(rows, { cwd: CWD, at: T0, ...o, by: A.opAuthor(o) }).rows; return rows; };
const PAGE = { page: { id: 'pgabcdefghij', name: 'Referee report', path: LNK, public: true } };
const bandBy = (rows, A = AF) => { const r = Object.values(A.resolvePresented(rows, { pageOf: () => PAGE }))[0]; return r ? A.intentOf(r) : '-'; };
const PEER_REC = { type: 'user', isMeta: true, origin: { kind: 'peer', from: 'unknown' }, promptSource: 'system', message: { role: 'user', content: 'Another Claude session sent a message:\n' + FRAME } };
const PERSON_REC = { type: 'user', promptSource: 'sdk', message: { role: 'user', content: said(`can you fix the table on ${LNK} ?`) } };
const AGENT_REC = { type: 'assistant', message: { content: said(`Here it is: ${LNK}`) } };
ok(bandBy(foldBy([PEER_REC])) === 'foryou' && bandBy(foldBy([{ type: 'user', message: { content: FRAME } }])) === 'foryou', 'a peer\'s vibespace-msg send with a /p/ link (the CLI\'s record; the frame alone) ⇒ present by an agent ⇒ «for you»');
ok(bandBy(foldBy([PERSON_REC])) === 'made', 'the person\'s own paste ⇒ «made here» (r2\'s leg stays)');
const quoted = Object.values(foldBy([AGENT_REC, PERSON_REC]))[0];
ok(bandBy(foldBy([AGENT_REC, PERSON_REC])) === 'foryou' && quoted.by === 'user' && quoted.shown === true, 'a row an agent showed, quoted again by the person ⇒ still «for you» (`by` = the last writer; the showing kept)', quoted);
// r5 (V1): A ROW THE OLD REDUCER WROTE IS NO WITNESS. b48937610's observe() / artifactDeriver wrote every op `by: 'agent'`,
// the person's paste included — these are the rows it persisted (captured by running b48937610's reader + reducer over
// the same records): the shape every existing conversation's meta holds when this release first reads it
const BASE_PASTE = { key: AF.keyOf('', LNK), host: '', path: LNK, name: 'pgabcdefghij', kind: 'page', firstAt: T0 - MIN, lastAt: T0 - MIN, by: 'agent', writes: 0, edits: 0, lastOp: 'present', bytes: null, lastId: null, url: LNK, presented: true, page: 'pgabcdefghij', origin: '' };
const BASE_ASK = { ...BASE_PASTE, lastId: 'ask:ut-0123456789:0' }; // the base's row for an ask's --artifact /p/… (presentAsk's id, on every tree since 2.369.247)
const keep = (row) => ({ [row.key]: row });
const persist = (rows) => JSON.parse(JSON.stringify(rows)); // the session meta persistSoon writes, read back at the next attach
const rebuild = (recs, persisted, A = AF) => A.merge(foldBy(recs, {}, A), persisted); // normalizers: merge(the transcript's derivation, the persisted rows)
const rb1 = rebuild([PERSON_REC], keep(BASE_PASTE)), rb2 = rebuild([PERSON_REC], persist(rb1)), rbL = foldBy([PERSON_REC], keep(BASE_PASTE));
ok(AF.intentOf(BASE_PASTE) === 'made' && bandBy(rb1) === 'made' && !Object.values(rb1)[0].shown && bandBy(rb2) === 'made' && !Object.values(rb2)[0].shown && bandBy(rbL) === 'made' && !Object.values(rbL)[0].shown,
  'r5 (V1): the base\'s persisted row for the PERSON\'s paste + its record ⇒ «made» — alone, after the rebuild\'s merge, after persist + a second rebuild, under a live op (never «for you», never stamped `shown`)', [rb1, rb2, rbL].map((x) => Object.values(x)[0]));
const rbA = rebuild([AGENT_REC, PERSON_REC], keep(BASE_PASTE)), rbA2 = rebuild([PERSON_REC], persist(rbA));
ok(bandBy(rbA) === 'foryou' && Object.values(rbA)[0].shown === true && bandBy(rbA2) === 'foryou', 'the same base row + an AGENT\'s present of the page in the transcript ⇒ «for you» — the derivation found the witness (stamped `shown`: persisted, it stays)', Object.values(rbA)[0]);
const STAMPED = { ...BASE_PASTE, shown: true }; // a row this release wrote: shown by an agent, then quoted by the person
const sq = Object.values(foldBy([PERSON_REC], keep(STAMPED)))[0], sm = Object.values(rebuild([PERSON_REC], keep(STAMPED)))[0];
ok(AF.intentOf(sq) === 'foryou' && sq.shown === true && sq.by === 'user' && AF.intentOf(sm) === 'foryou' && sm.shown === true, 'a row the NEW reducer stamped `shown`, quoted by the person (live) or merged beside their paste (rebuild) ⇒ stays «for you»', { sq, sm });
const aq = Object.values(foldBy([PERSON_REC], keep(BASE_ASK)))[0];
ok(AF.intentOf(BASE_ASK) === 'foryou' && bandBy(rebuild([PERSON_REC], keep(BASE_ASK))) === 'foryou' && aq.shown === true, 'the base\'s row for an ASK\'s page (an `ask:` id — presentAsk alone writes it: a fact that tells the agent from the person) ⇒ «for you»; quoted by the person later, the showing is stamped and kept', aq);
ok(AF.wasShown({ by: 'agent', presented: true, lastOp: 'present' }) === false && AF.wasShown({ ...BASE_PASTE }) === false && AF.wasShown({ by: 'agent', presented: true, lastOp: 'present', lastId: 'ask:ut-0123456789:0' }) === true
  && AF.wasShown({ by: 'agent', lastOp: 'publish' }) === true && AF.wasShown({ by: 'agent', lastOp: 'present' }) === true && AF.wasShown({ by: 'agent', lastOp: 'handover' }) === true && AF.wasShown({ by: 'user', lastOp: 'upload' }) === false && AF.wasShown({ by: 'user', shown: true }) === true && AF.wasShown(null) === false,
  'wasShown on a row WITHOUT `shown`: a page link only by an ask\'s id (its `by` / `presented` witness nothing); any other row by a showing op as its last (publish · an ask\'s file present · hand-over · open); an upload never');
// r6 (U2): AN ASK IS A WITNESS FOR EVERY ROW — FROM THE ASK STORE. On the base tree a later op overwrote the ask's `ask:` id
// on its row and no `shown` was written; an ask lives in no transcript, but the For-you store keeps it (its attachments, its
// words), so the rebuild's third input folds the ops it folded live (AF.askOps through storeRows) and the merge stamps the
// row. The base's own rows (captured by running b48937610's reducer: write → ask → the agent's edit / the person's save;
// a code file; a page an ask named before the person pasted it — the same row as BASE_PASTE):
const RPT = CWD + '/out/report.md', TPY = CWD + '/tool.py';
const BASE_S3H = { key: AF.keyOf('', RPT), host: '', path: RPT, name: 'report.md', kind: 'doc', firstAt: T0, lastAt: T0 + 2 * MIN, by: 'agent', writes: 1, edits: 1, lastOp: 'edit', bytes: null, lastId: 'toolu_e1' };
const BASE_S3G = { ...BASE_S3H, by: 'user', lastId: null }; // …the PERSON saved it after the ask (touch: by user)
const BASE_CODE = { ...BASE_S3H, key: AF.keyOf('', TPY), path: TPY, name: 'tool.py', kind: 'code', writes: 0, edits: 2, lastId: 'toolu_e2' };
const askOf = (id, o) => ({ id, sessionKey: 'claude:c-A', origin: 'agent', status: 'done', resolvedBy: 'user', urgency: 'normal', text: 'Please review', detail: null, createdAt: T0 + MIN, ...o }); // the store's item
const fileAsk = (p, id) => askOf(id, { artifacts: [{ kind: 'file', host: '', path: p, name: path.basename(p) }] });
const derive = (...ops) => ops.reduce((r, o) => AF.fold(r, { cwd: CWD, by: 'agent', ...o }), {});
const rebuild3 = (derived, persisted, asks) => AF.merge(AF.merge(derived, persisted), AF.storeRows({ asks })); // normalizers: ∪ the stores' rows (r6: + the asks)
const W1 = { op: 'write', path: RPT, id: 'toolu_w1', at: T0 }, E1 = { op: 'edit', path: RPT, id: 'toolu_e1', at: T0 + 2 * MIN };
const cells = (asks) => ({
  s3h: rebuild3(derive(W1, E1), keep(BASE_S3H), asks)[BASE_S3H.key],
  s3g: rebuild3(derive(W1), keep(BASE_S3G), asks)[BASE_S3G.key],
  code: rebuild3(derive({ op: 'edit', path: TPY, id: 'toolu_e0', at: T0 }, { op: 'edit', path: TPY, id: 'toolu_e2', at: T0 + 2 * MIN }), keep(BASE_CODE), asks)[BASE_CODE.key],
  b3: bandBy(rebuild3(foldBy([PERSON_REC]), keep(BASE_PASTE), asks.filter((a) => String(a.text).includes(LNK)))),
});
const c6 = cells([fileAsk(RPT, 'ut-00000000e1'), fileAsk(TPY, 'ut-00000000e2'), askOf('ut-00000000e3', { status: 'open', text: `Please review the referee report ${LNK}` })]), c5 = cells([]);
ok([c6.s3h, c6.s3g, c6.code].every((r) => r && AF.intentOf(r) === 'foryou' && r.shown === true) && c6.b3 === 'foryou',
  'r6 (U2): the base\'s rows + the transcript intact + the ask store ⇒ «for you», stamped — a file an ask attached, then the agent edited (S3h) or the PERSON saved (S3g); a code file (never «touched»); a page an ask named before the person pasted it (B3); an answered ask counts', c6);
ok(AF.intentOf(c5.s3h) === 'made' && AF.intentOf(c5.s3g) === 'made' && AF.intentOf(c5.code) === 'touched' && c5.b3 === 'made', 'CONTROL r5\'s rebuild (no ask store — the `ask:` id read on page rows only, overwritten by the later op) ⇒ «made» · «made» · «touched» · «made» — RED', c5);
const later = rebuild3(derive(W1, E1), persist(keep(c6.s3h)), [])[BASE_S3H.key];
ok(AF.intentOf(later) === 'foryou', 'the stamp, persisted (r6 U3: the rebuild writes it), outlives the ask: a later rebuild with the ask gone from the store (pruned, cleared) ⇒ still «for you»', later);
const cutAsk = AF.storeRows({ asks: [askOf('ut-00000000e4', { text: 'x'.repeat(483) + ' ' + LNK + '…' }), askOf('ut-00000000e5', { text: 'x'.repeat(484) + ' /p/pgabcdefghik' })] });
ok(Object.keys(cutAsk).join() === ':/p/pgabcdefghik', 'the rebuild reads an ask\'s KEPT words through the same reader (askOps): a token the store\'s cut went through (the mark after it) births no row; a whole link ending at the cap does', Object.keys(cutAsk));
const pasted = TABLE.find(([w]) => w.startsWith('page: a /p/ link the PERSON'))[1];
ok(pasted.shown !== true && pasted.by === 'user' && pasted.presented === true, 'the person\'s paste: a presented row, never `shown`', pasted);
const W0 = (r, lang = 'en') => M.rowWords(r, { kindWord: (k) => AF.kindWord(k, lang), t: (s) => s });
ok(W0(TABLE.find(([w]) => w.startsWith('page: UNPUBLISHED'))[1]).edits.includes('Unpublished') && W0(TABLE.find(([w]) => w.startsWith('page: written + PUBLISHED'))[1]).edits.includes('Published'), 'a page that left «for you» SAYS so on its row («Unpublished»); a published one says «Published»');
const askRow = TABLE.find(([w]) => w.startsWith('doc: an ask\'s --artifact, then'))[1];
ok(askRow.shown === true && askRow.lastOp === 'edit', 'sticky: the present op marks the row `shown`; a later edit keeps it (lastOp alone would drop it)', askRow);
const mergedShown = AF.merge({ [askRow.key]: { ...askRow, shown: undefined, lastAt: T0 + 9 * MIN } }, { [askRow.key]: askRow })[askRow.key];
ok(mergedShown.shown === true && AF.intentOf(mergedShown) === 'foryou', 'merge keeps `shown` from either side (the transcript\'s re-derivation never loses it)');
const blk = AF.cardBlock(askRow);
ok(blk.intent === 'foryou' && blk.shown === true && AF.cardBlock(TABLE[0][1]).intent === 'made' && AF.cardBlock(AF.serviceRow(job('up'), { now: T0 })).intent === 'foryou', 'every card block carries the verdict (`intent`) — the client groups by the server\'s word');
ok(M.bandOf({ kind: 'doc' }) === 'made' && M.bandOf({ kind: 'code' }) === 'touched' && M.bandOf({ kind: 'page', state: 'published' }) === 'made' && M.bandOf({ kind: 'doc', intent: 'foryou' }) === 'foryou', 'a block without the verdict (an older hub) reads code ⇒ touched, the rest ⇒ made — never «for you» on a guess');

console.log('  the chip\'s order follows the verdict (view) — and the base\'s kind-first order is RED');
const orderRows = (() => { let r = {}; const add = (o) => { r = AF.fold(r, { cwd: CWD, ...o }); };
  add({ op: 'write', path: 'a_doc.md', at: T0 + 5 * MIN }); add({ op: 'write', path: 'site.html', at: T0 + 1 * MIN }); add(AF.pageOp({ ...PG, updatedAt: T0 + 2 * MIN }));
  add({ op: 'edit', path: 'old.md', at: T0 + 9 * MIN }); add({ op: 'write', path: 'pic.png', at: T0 + 7 * MIN }); add(AF.uploadOp({ path: CWD + '/up.pdf' }, { at: T0 + 8 * MIN }));
  add({ op: 'write', path: 'run.py', at: T0 + 10 * MIN });
  return { ...r, ...AF.serviceRows([job('up')], { cid: 'c-A', now: T0 + 3 * MIN }) }; })();
const chipOrder = (A) => A.view(orderRows).items.map((b) => b.name + ':' + A.intentOf(b)).join(' ');
const WANT_ORDER = 'site.html:foryou j1:foryou up.pdf:made pic.png:made a_doc.md:made old.md:touched';
ok(chipOrder(AF) === WANT_ORDER, `view: «for you» (the page, the service) › made here (newest first) › touched — "${chipOrder(AF)}"`);
{ const src = fs.readFileSync(path.join(REPO, 'src/artifacts.js'), 'utf8');
  const needle = '(INTENTS.indexOf(intentOf(a)) - INTENTS.indexOf(intentOf(b)))';
  const base = path.join(scratch, 'artifacts-base-order.js');
  fs.writeFileSync(base, src.replace(needle, '(VIEW_ORDER.indexOf(a.kind) - VIEW_ORDER.indexOf(b.kind))').replace(/require\('\.\/([\w.-]+\.js)'\)/g, (m, f) => `require(${JSON.stringify(path.join(REPO, 'src', f))})`)); // its relative requires made absolute (r6: + the reply grammar's cut mark)
  const B = require(base);
  ok(src.includes(needle) && chipOrder(B) !== WANT_ORDER, `CONTROL the base's kind-first view (VIEW_ORDER) ⇒ the order leg is RED ("${chipOrder(B)}")`); }

// ── ② THE OWNER'S SHAPE ──
console.log('② the owner\'s shape: 30 artifacts (three README.md) + 41 code files; 2 pages published, a hand-over, a service');
function ownerView({ codeNewest = false } = {}) {
  let r = {};
  const add = (o) => { r = AF.fold(r, { cwd: CWD, ...o }); };
  const at = (m) => T0 - m * MIN;
  // for you: two published pages, one hand-over, one running service
  add({ op: 'write', path: 'site/index.html', at: at(30) }); add(AF.pageOp({ id: 'pgsite000001', name: 'Site', srcKey: 'local:' + CWD + '/site/index.html', srcPath: CWD + '/site/index.html', path: '/p/pgsite000001', updatedAt: at(3) }));
  add({ op: 'write', path: 'report/summary.html', at: at(50) }); add(AF.pageOp({ id: 'pgrep0000001', name: 'Summary', srcKey: 'local:' + CWD + '/report/summary.html', srcPath: CWD + '/report/summary.html', path: '/p/pgrep0000001', updatedAt: at(40) }));
  add(AF.handoverOp(one({ op: 'write', path: '/home/u/helper/review.md', at: at(20) }), { from: { cid: 'c-H', name: 'referee' }, at: at(20) }));
  // made here: 26 — the three README.md, tagged docs by helpers, a picture, an upload
  const tags = ['verify', 'attack:sandbox', 'pt2:fix', null];
  const made = ['traces/v3-or1/README.md', 'referee3/README.md', 'v3/README.md', 'docs/DESIGN.md', 'docs/status_r2.md', 'docs/todo_wave12.md', 'docs/设计说明.md',
    'out/sec10_tail.md', 'out/wave1_notes.md', 'out/wave2_notes.md', 'out/wave3_notes.md', 'out/wave4_notes.md', 'traces/v3-or1/trace.md', 'traces/v3-or1/verdict.md',
    'referee3/score.md', 'referee3/notes.md', 'v3/plan.md', 'v3/plan_b.md', 'renders/cover.png', 'renders/floor.png', 'notes/a.md', 'notes/b.md', 'notes/c.md', 'notes/d.md', 'summary.md'];
  made.forEach((p, i) => add({ op: 'write', path: p, at: at(60 + i * 7), ...(tags[i % 4] ? { via: { kind: 'subagent', name: tags[i % 4] } } : {}) }));
  add(AF.uploadOp({ path: CWD + '/inbox/brief.pdf', size: 12 }, { at: at(400) }));
  // touched: 41 code files — 40 .py the agent edited across the tree + a README it edited (scaffolding ⇒ code)
  for (let i = 0; i < 40; i++) add({ op: 'edit', path: `src/pkg${i % 6}/mod_${i}.py`, at: codeNewest && i < 3 ? at(1 + i) - 0 : at(90 + i * 5) });
  add({ op: 'edit', path: 'mirror/v3-or1/README.md', at: at(95) });
  const svc = AF.serviceRows([{ id: 'web2', state: 'up', listen: { port: 8100, at: at(10), firstAt: at(10) }, runs: [{ startedAt: at(12) }], ownerSession: { conversationId: 'c-A' } }], { cid: 'c-A', now: T0, labelOf: () => 'house3d-web2-2' });
  const v = AF.view({ ...r, ...svc });
  return { ok: true, items: v.items.map(AF.cardBlock), code: v.code.map(AF.cardBlock), count: v.count, codeCount: v.codeCount, full: v.full, cwd: CWD, host: '' };
}
const OV = ownerView();
ok(OV.count === 30 && OV.codeCount === 41, `the fixture is the owner's «30 项产出 · 41 个代码文件» (${OV.count} + ${OV.codeCount})`);
const plan = M.listPlan(OV, { ...M.DEFAULT_VIEW, collapsed: M.DEFAULT_VIEW.collapsed.intent });
const sec = (k) => plan.sections.find((s) => s.key === k);
const bands = plan.sections.filter((s) => s.head.group === 'intent');
ok(bands.map((s) => s.key + ' ' + s.head.count).join(' · ') === 'i:foryou 4 · i:made 26 · i:touched 41', `the DEFAULT plan's bands: ${bands.map((s) => s.key + ' ' + s.head.count).join(' · ')}`);
ok(plan.sections[0].key === 'i:foryou' && plan.sections[0].open, 'the first section is «for you», open (the first screen = the attention list)');
ok(sec('i:foryou').rows.map((b) => b.kind).sort().join() === 'doc,page,page,service' && sec('i:foryou').rows.every((b, i, a) => i === 0 || (a[i - 1].lastAt || 0) >= (b.lastAt || 0)), `«for you» = the 2 published pages + the hand-over + the service, newest first (${sec('i:foryou').rows.map((b) => b.name).join(', ')})`);
ok(sec('i:touched').open === false && sec('i:touched').head.code === 41 && sec('i:touched').head.count === 41, '«touched» is FOLDED by default behind its count — 41, all code («顺带改了 41 个代码文件»)');
ok(sec('i:made').rows.some((b) => b.kind === 'upload') && sec('i:made').rows.every((b) => b.kind !== 'code'), 'made here holds the upload (the person\'s own) and never a code row');
const NAMES = plan.ctx.names;
const readme = (p) => NAMES.get(':' + CWD + '/' + p);
ok(readme('traces/v3-or1/README.md') === 'traces/v3-or1/README.md' && readme('referee3/README.md') === 'referee3/README.md' && readme('v3/README.md') === 'v3/README.md' && readme('mirror/v3-or1/README.md') === 'mirror/v3-or1/README.md',
  `the README.md rows wear their shortest distinguishing suffix — grown past «v3-or1/README.md» because another README sits in a v3-or1 folder (${['traces/v3-or1', 'referee3', 'v3', 'mirror/v3-or1'].map((d) => readme(d + '/README.md')).join(' · ')})`);
ok(NAMES.get(':' + CWD + '/summary.md') === 'summary.md' && NAMES.get(':' + CWD + '/out/sec10_tail.md') === 'sec10_tail.md', 'a unique name shows as it is');
const words = (b) => M.rowWords(b, { cwd: OV.cwd, host: OV.host });
const metaOf = (p) => words([...OV.items, ...OV.code].find((b) => b.path === CWD + '/' + p));
ok(metaOf('traces/v3-or1/README.md').folder === 'traces/v3-or1' && metaOf('summary.md').folder === 'proj' && metaOf('src/pkg1/mod_1.py').folder === 'src/pkg1', `every row names its FOLDER from the conversation's cwd; the cwd itself by its own name, never «./» (traces/v3-or1 · ${metaOf('summary.md').folder} · src/pkg1)`);
const dirOf = (p) => String(p).slice(0, String(p).lastIndexOf('/'));
const wholePath = (b) => { const f = words(b).folder, d = dirOf(b.path); return d.split('/').filter(Boolean).length > 1 && (f === d || f.endsWith(':' + d) || f.includes(CWD)); };
ok([...OV.items, ...OV.code].every((b) => !wholePath(b)), 'no row\'s folder is the whole absolute path');
const svcRow = OV.items.find((b) => b.kind === 'service'), handed = OV.items.find((b) => b.via && b.via.kind === 'handover');
const zhW = (b, ctx = OV) => M.rowWords(b, { cwd: ctx.cwd, host: ctx.host, folders: ctx.folders, hubWord: ctx.hubWord, kindWord: (k) => AF.kindWord(k, 'zh'), t: (x, v) => x.replace(/\{(\w+)\}/g, (_, k) => v[k]) });
ok(words(svcRow).folder === '' && words(handed).folder === '~/helper' && words(handed).away === true && M.metaLine(zhW(handed)) === 'referee · ~/helper · 文档', `a service has no folder; a hand-over from ANOTHER folder leads with WHO and WHERE («${M.metaLine(zhW(handed))}»)`);
console.log('  x1: a row from elsewhere (a realistic helper) reads «referee · …/out · 文档» — never a whole absolute path');
const REFP = '/var/tmp/vibespace-lanes/wt-referee/out/review.md';
const REF = AF.cardBlock(one(AF.handoverOp(one({ op: 'write', path: REFP, at: T0 }), { from: { cid: 'c-R', name: 'referee' }, at: T0 })));
const refZh = M.metaLine(zhW(REF)), refEn = M.metaLine(M.rowWords(REF, { cwd: CWD, host: '', kindWord: (k) => AF.kindWord(k, 'en') }));
ok(refZh === 'referee · …/out · 文档' && refEn === 'referee · …/out · Document', `the realistic helper's hand-over: «${refZh}» / «${refEn}» (who · the folder's tail · the kind)`);
ok(M.metaLine(zhW(OV.items.find((b) => b.path === CWD + '/traces/v3-or1/README.md'))).startsWith('traces/v3-or1 · 文档'), 'a row under the cwd still leads with its folder («traces/v3-or1 · 文档 · …»)');
const FT = [[{ path: '/home/u/proj/a/b.md' }, 'a'], [{ path: '/home/u/proj/b.md' }, 'proj'], [{ path: '/home/u/proj/a/b/c/d/e/f.md' }, '…/c/d/e'], [{ path: '/home/u/x/y.md' }, '~/x'], [{ path: '/home/u/y.md' }, '~'], [{ path: '/home/u/a/b/c/d/e.md' }, '…/d'], [{ path: '/opt/data/x.csv' }, '…/data'], [{ path: '/tmp/x.csv' }, '/tmp'], [{ path: REFP }, '…/out'], [{ path: '/home/u/proj/q.md', host: 'gpu1' }, 'gpu1:~/proj'], [{ path: '/srv/w/out/q.md', host: 'gpu1' }, 'gpu1:…/out'], [{ path: '' , kind: 'service' }, ''], [{ path: '/p/pgabcdefghij', presented: true }, '']];
const ft = FT.map(([r, want]) => [M.folderOf(r, { cwd: CWD, host: '' }), want]);
ok(ft.every(([g, w]) => g === w), `folderOf (a LOCAL conversation): in the cwd · the cwd by its name · deep · a home · elsewhere = the folder's TAIL · another machine says so · none (${ft.map(([g]) => JSON.stringify(g)).join(' ')})`, ft);
console.log('  x4: the host prefix names ANOTHER machine only — a remote conversation\'s own rows never wear it');
const RC = { cwd: CWD, host: 'gpu1' };
const FR = [[{ path: CWD + '/out/a.md', host: 'gpu1' }, 'out'], [{ path: CWD + '/a.md', host: 'gpu1' }, 'proj'], [{ path: '/home/u/notes/x.md', host: 'gpu1' }, '~/notes'], [{ path: '/srv/w/out/q.md', host: 'gpu2' }, 'gpu2:…/out']];
const fr2 = FR.map(([r, want]) => [M.folderOf(r, RC), want]);
ok(fr2.every(([g, w]) => g === w), `folderOf (a REMOTE conversation on gpu1): its cwd's rows · its home · a third machine (${fr2.map(([g]) => JSON.stringify(g)).join(' ')})`, fr2);
console.log('  r3: ONE host rule — the told-apart names and the folders: the machine that is not the conversation\'s says which');
const TW = [{ key: 'gpu1:' + CWD + '/README.md', path: CWD + '/README.md', host: 'gpu1', name: 'README.md' }, { key: ':' + CWD + '/README.md', path: CWD + '/README.md', host: '', name: 'README.md' }];
const remoteN = M.shownNames(TW, { host: 'gpu1' }), localN = M.shownNames(TW, { host: '' });
ok(remoteN.get(TW[0].key) === 'proj/README.md' && remoteN.get(TW[1].key) === 'Local:proj/README.md', `a REMOTE conversation (gpu1): its own copy bare, the hub's says so (${remoteN.get(TW[0].key)} · ${remoteN.get(TW[1].key)})`);
ok(localN.get(TW[0].key) === 'gpu1:proj/README.md' && localN.get(TW[1].key) === 'proj/README.md', `a LOCAL conversation: the gpu1 copy says «gpu1:», the hub's bare (${localN.get(TW[0].key)} · ${localN.get(TW[1].key)})`);
ok(M.folderOf(TW[1], { cwd: CWD, host: 'gpu1' }) === 'Local:~/proj' && M.shownNames(TW, { host: 'gpu1', hubWord: '本机' }).get(TW[1].key) === '本机:proj/README.md' && M.hostTag({ host: 'gpu1' }, { host: 'gpu1' }) === '' && M.hostTag({ host: '' }, { host: '' }) === '',
  'the folders by the same rule (the hub\'s folder in a remote conversation «Local:~/proj»); the hub\'s word in the person\'s language («本机:»); the own machine never');
console.log('  r4: a machine is named AS THE PERSON READS IT — the host pickers\' name (the view\'s hostNames), never its internal id');
const HID = 'host-1a2b3c4d', HN = { [HID]: 'gpu1' };
const HV = { cwd: CWD, host: '', hostNames: HN, items: [{ key: HID + ':/srv/w/out/q.md', path: '/srv/w/out/q.md', host: HID, name: 'q.md', kind: 'doc' }, { key: HID + ':' + CWD + '/README.md', path: CWD + '/README.md', host: HID, name: 'README.md', kind: 'doc' }, { key: ':' + CWD + '/README.md', path: CWD + '/README.md', host: '', name: 'README.md', kind: 'doc' }, { key: 'host-dead1234:/srv/x/a.md', path: '/srv/x/a.md', host: 'host-dead1234', name: 'a.md', kind: 'doc' }], code: [] };
const HC = M.listCtx(HV, { hubWord: '本机' });
ok(M.folderOf(HV.items[0], HC) === 'gpu1:…/out' && HC.names.get(HV.items[1].key) === 'gpu1:proj/README.md' && M.folderOf(HV.items[3], HC) === 'host-dead1234:…/x' && M.folderOf(HV.items[2], M.listCtx({ ...HV, host: HID }, { hubWord: '本机' })) === '本机:~/proj',
  `the folder and the told-apart name say «gpu1:» (the record\'s name), never «${HID}:»; a machine gone from the list by its id; the hub\'s own by the hub\'s word (${M.folderOf(HV.items[0], HC)} · ${HC.names.get(HV.items[1].key)})`);
ok(M.whereOf({ path: '/home/u/a.md' }, { cwd: '/home/u' }).folder === '~' && M.whereOf({ path: '/home/u/a.md' }, { cwd: '/home/u' }).key === ':/home/u', 'a conversation AT a home: its root reads «~» (key = the directory — a sub-folder of the same name stays apart)');
const made = sec('i:made');
ok(Array.isArray(made.folders) && made.folders.length > 1 && made.folders.reduce((n, f) => n + f.rows.length, 0) === 26 && new Set(made.folders.flatMap((f) => f.rows.map((b) => b.key))).size === 26,
  `«made here» (26 > 8) sub-groups by folder: ${made.folders.map((f) => (f.head.label || '·') + ' ' + f.head.count).join(', ')} — every row in exactly one`);
ok(made.folders.every((f) => f.head.count === f.rows.length && f.open) && made.folders.every((f, i, a) => i === 0 || !f.head.label || Math.max(...a[i - 1].rows.map((b) => b.lastAt)) >= Math.max(...f.rows.map((b) => b.lastAt))), 'each folder head counts its rows, opens by default, the folder with the newest change first');
ok(sec('i:foryou').folders === null, '«for you» (4 ≤ 8) stays flat');
const rootF = made.folders.find((f) => f.key === 'f:i:made::' + CWD);
ok(rootF && rootF.head.label === 'proj' && rootF.rows.map((b) => b.name).join() === 'summary.md', `the ROOT folder's head says the cwd's own name («${rootF && rootF.head.label}»), never «./»`);
console.log('  x6: inside a folder head the BARE name and no folder (the head names it); the flat lists keep the suffix');
const tr = made.folders.find((f) => f.head.label === 'traces/v3-or1');
const trR = tr && tr.rows.find((b) => b.name === 'README.md');
ok(tr && tr.ctx && tr.ctx.inFolder === true && tr.ctx.names.get(trR.key) === 'README.md' && tr.rows.every((b) => tr.ctx.names.get(b.key) === b.name), `in the «traces/v3-or1» head: «${tr && tr.ctx.names.get(trR.key)}» (bare) — the global name «${NAMES.get(trR.key)}» stays for the flat lists`);
ok(!M.metaLine(zhW(trR), { inFolder: true }).includes('traces') && M.metaLine(zhW(trR), { inFolder: true }).startsWith('文档'), `…and its meta line drops the folder («${M.metaLine(zhW(trR), { inFolder: true })}» — the helper no longer pushed off at 320)`);
console.log('  r3: a folder is KEYED by its directory, labelled by its tail — two helpers\' out/ folders are two heads');
const OUTS = [['referee', '/var/tmp/vibespace-lanes/wt-referee/out'], ['judge', '/var/tmp/vibespace-lanes/wt-judge/out']];
const handed2 = OUTS.flatMap(([who, dir], h) => Array.from({ length: 5 }, (_, i) => AF.cardBlock(one(AF.handoverOp(one({ op: 'write', path: `${dir}/part${i}.md`, at: T0 + h * 10 + i }), { from: { cid: 'c-' + who, name: who }, at: T0 + h * 10 + i })))));
const OV2 = { ...OV, items: [...OV.items, ...handed2] };
const P2 = M.listPlan(OV2, { collapsed: ['i:touched'] });
const outsOf = (p) => (p.sections.find((s) => s.key === 'i:foryou').folders || []).filter((f) => /out$/.test(f.head.label));
ok(outsOf(P2).map((f) => f.head.label + ' · ' + f.head.count).sort().join(' | ') === '…/wt-judge/out · 5 | …/wt-referee/out · 5', `two helpers' out/ folders ⇒ TWO heads (${outsOf(P2).map((f) => f.head.label + ' · ' + f.head.count).sort().join(' | ')}) — never one «…/out · 10»`);
const outKeys = outsOf(P2).map((f) => f.key);
ok(new Set(outKeys).size === 2 && outKeys.every((k) => k.startsWith('f:i:foryou::/var/tmp/vibespace-lanes/wt-')) && outsOf(P2).every((f) => f.rows.every((b) => f.ctx.names.get(b.key) === b.name)), 'each with its own fold key (the directory: host + path), each row bare inside its own head', outKeys);
ok(outsOf(M.listPlan(OV2, { collapsed: ['i:touched', outKeys.find((k) => k.includes('wt-judge'))] })).map((f) => f.head.label + ':' + f.open).sort().join() === '…/wt-judge/out:false,…/wt-referee/out:true', 'folding one leaves the other open');
ok(M.metaLine(zhW(handed2[0], P2.ctx)) === 'referee · …/wt-referee/out · 文档', `a flat list's meta line says the same grown words («${M.metaLine(zhW(handed2[0], P2.ctx))}»)`);
const FN = M.folderNames([{ key: 'a', path: CWD + '/p1/q/k/l/m/one.md' }, { key: 'b', path: CWD + '/p2/q/k/l/m/two.md' }, { key: 'c', path: CWD + '/x.md' }, { key: 'd', path: CWD + '/proj/y.md' }, { key: 'e', path: '/home/u/elsewhere/out/r.md' }], { cwd: CWD, host: '' });
ok(FN.get(':' + CWD + '/p1/q/k/l/m') === 'p1/q/k/l/m' && FN.get(':' + CWD + '/p2/q/k/l/m') === 'p2/q/k/l/m' && FN.get(':' + CWD) === 'proj' && FN.get(':' + CWD + '/proj') === 'proj/proj' && !FN.has(':/home/u/elsewhere/out') && FN.size === 4,
  `folderNames grows ONLY labels that collide: «…/k/l/m» twice ⇒ ${FN.get(':' + CWD + '/p1/q/k/l/m')} · ${FN.get(':' + CWD + '/p2/q/k/l/m')}; the root «proj» and a sub-folder «proj» ⇒ proj · ${FN.get(':' + CWD + '/proj')}; a unique one never`, [...FN]);
const opened = M.listPlan(OV, { collapsed: [] });
ok(opened.sections.find((s) => s.key === 'i:touched').folders.length >= 6, '«touched» opened: its 41 rows sub-group by folder too');
const shut = M.listPlan(OV, { collapsed: ['i:touched', 'f:i:made::' + CWD + '/notes'] });
ok(shut.sections.find((s) => s.key === 'i:made').folders.find((f) => f.head.label === 'notes').open === false, 'a folder head folds (its key f:<band>:<folder> in the device-kept collapsed set)');
console.log('  r4: two homes never wear one label — «~» is a LABEL, never a key; a grown label is checked against EVERY folder\'s');
const HOMES = M.folderNames([{ key: 'h1', path: '/home/a/x/notes.md' }, { key: 'h2', path: '/root/x/plan.md' }, { key: 'h3', path: '/home/b/x/todo.md' }, { key: 'h4', path: '/home/a/n.md' }, { key: 'h5', path: '/home/b/n.md' }, { key: 'h6', path: '/srv/y/z.md' }], { cwd: '/w/proj', host: '' });
const homeL = [':/home/a/x', ':/root/x', ':/home/b/x', ':/home/a', ':/home/b'].map((k) => HOMES.get(k));
ok(homeL.join() === '/home/a/x,/root/x,/home/b/x,/home/a,/home/b' && !HOMES.has(':/srv/y') && M.whereOf({ path: '/srv/y/z.md' }, { cwd: '/w/proj' }).folder === '…/y',
  `/home/a/x · /root/x · /home/b/x (each «~/x») and two homes\' roots (each «~») grow PAST «~» to the path that tells them apart: ${homeL.join(' · ')}; a unique folder keeps its tail`);
const K1 = M.folderNames([{ key: 'k1', path: CWD + '/a.md' }, { key: 'k2', path: CWD + '/proj/b.md' }, { key: 'k3', path: CWD + '/proj/proj/c.md' }], { cwd: CWD, host: '' });
const K2 = M.folderNames([{ key: 'm1', path: '/m/k/x/out/1.md' }, { key: 'm2', path: '/m/j/x/out/2.md' }, { key: 'm3', path: CWD + '/a/b/k/x/out/3.md' }], { cwd: CWD, host: '' });
const k1L = [K1.get(':' + CWD), K1.get(':' + CWD + '/proj'), K1.get(':' + CWD + '/proj/proj')], k2L = [K2.get(':/m/k/x/out'), K2.get(':/m/j/x/out'), K2.get(':' + CWD + '/a/b/k/x/out')];
ok(k1L.join() === 'proj,proj/proj,proj/proj/proj' && new Set(k2L).size === 3 && k2L.every(Boolean),
  `a grown label that lands on another folder\'s grows on (the r3 acceptance\'s two): ${k1L.join(' · ')}; ${k2L.join(' · ')}`, [...K2]);
console.log('  r4: a filter hides rows, never renames a folder — the head, the meta line and the window say the words grown over ALL rows');
const AR = [...Array.from({ length: 6 }, (_, i) => ['referee', '/var/tmp/lanes/wt-referee/out', i]), ...Array.from({ length: 4 }, (_, i) => ['referee', '/var/tmp/lanes/wt-referee/notes', 6 + i])]
  .map(([who, dir, i]) => AF.cardBlock(one(AF.handoverOp(one({ op: 'write', path: `${dir}/r${i}.md`, at: T0 + i }), { from: { cid: 'c-' + who, name: who }, at: T0 + i }))));
const AJ = Array.from({ length: 3 }, (_, i) => AF.cardBlock(one({ op: 'write', path: `/var/tmp/lanes/wt-judge/out/j${i}.md`, at: T0 + 20 + i })));
const AV = { ...OV, items: [...AR, ...AJ], code: [] }, REFOUT = '…/wt-referee/out';
const allWords = (mod, q) => { const p = mod.listPlan(AV, { q, collapsed: [] }), fy = p.sections.find((x) => x.key === 'i:foryou'), w = windowRows(AV, { q, mod }); return { head: ((fy && fy.folders) || []).map((f) => f.head.label).find((l) => /out$/.test(l)) || '', meta: mod.rowWords(AR[0], p.ctx).folder, win: mod.pathWord(AR[0], w), judge: mod.rowWords(AJ[0], p.ctx).folder }; };
function windowRows(v, { q, mod }) { const ctx = mod.listCtx(v); mod.filterRows(mod.rowsOfView(v), q, ctx); return ctx; } // the window's own sequence (artifacts-window.js windowRows): listCtx over the view, then the filter
const aw0 = allWords(M, ''), awQ = allWords(M, 'referee');
ok(aw0.head === REFOUT && aw0.judge === '…/wt-judge/out' && awQ.head === REFOUT && awQ.meta === REFOUT && awQ.win === REFOUT,
  `«referee» typed (the judge\'s out/ hidden) — the head «${awQ.head}», the meta line «${awQ.meta}», the window «${awQ.win}»; no filter, the judge\'s out/ in ANOTHER band — the for-you head «${aw0.head}»`, { aw0, awQ });

console.log('  the filter: name · folder · path · helper · the kind\'s word — the bands kept, a folded hit unfolded, the counts restated');
const F = (q, extra = {}) => M.listPlan(OV, { q, collapsed: M.DEFAULT_VIEW.collapsed.intent, ...extra });
const fr = F('referee3');
ok(fr.sections.filter((s) => s.head.group === 'intent').map((s) => s.key + ' ' + s.head.count).join() === 'i:made 3' && fr.sections[0].rows.every((b) => b.path.includes('/referee3/')), `a FOLDER name ("referee3") finds its rows, in their band, the count restated (${fr.sections.map((s) => s.key + ' ' + s.head.count).join()})`);
const fm = F('mirror');
ok(fm.sections.length === 1 && fm.sections[0].key === 'i:touched' && fm.sections[0].open === true, 'a hit inside the FOLDED band («touched») unfolds it while filtering');
ok(M.viewFrom(null).collapsed.intent.includes('i:touched'), '…and the remembered fold is untouched');
ok(F('v3-or1/tr').sections[0].rows.map((b) => b.name).join() === 'trace.md', 'a PATH from the cwd ("v3-or1/tr") finds its row');
ok(F('attack:sandbox').sections.every((s) => s.rows.every((b) => M.helperOf(b) === 'attack:sandbox')) && F('attack:sandbox').sections.length > 0, 'a helper\'s label finds its rows');
const kw = (k) => AF.kindWord(k, 'zh');
const fk = F('服务', { kindWord: kw });
ok(fk.sections.length === 1 && fk.sections[0].rows.length === 1 && fk.sections[0].rows[0].kind === 'service', 'the KIND\'S WORD in the person\'s language ("服务") finds the service');
ok(F('proj').sections.flatMap((s) => s.rows).map((b) => b.name).join() === 'summary.md', `the cwd's own name ("proj") finds the root's rows — what they read as their folder — never every row (${F('proj').sections.flatMap((s) => s.rows).length})`);
console.log('  x2: the kind\'s word matches as a WORD — «de» never floods, a prefix alone never unfolds «touched»');
const KH = [['Document', 'de', ''], ['Code', 'co', ''], ['Document', 'me', ''], ['Code', 'code', 'equal'], ['Code', 'cod', 'prefix'], ['Document', 'docu', 'prefix'], ['Document', 'ume', ''], ['文档', '文', ''], ['文档', '文档', 'equal'], ['ドキュメント', 'ドキュ', ''], ['', 'x', '']];
const kh = KH.map(([w, q, want]) => [M.kindHit(w, q), want]);
ok(kh.every(([g, w]) => g === w), `kindHit: equal · a word's prefix of ≥ 3 · never inside a word · a CJK word only whole (${kh.map(([g]) => JSON.stringify(g)).join(' ')})`, kh);
const enKw = (k) => AF.kindWord(k, 'en');
const FEs = new Map(), FE = (q) => FEs.get(q) || FEs.set(q, F(q, { kindWord: enKw })).get(q); // one plan per query (read-only below)
const real = (q) => [...OV.items, ...OV.code].filter((b) => [b.name, M.folderOf(b, OV), M.relPath(b, OV), M.helperOf(b)].some((x) => String(x).toLowerCase().includes(q))).length;
const rowsIn = (p) => p.sections.filter((s) => s.key !== 'recent').reduce((n, s) => n + s.rows.length, 0);
const touchedOpen = (p) => !!p.sections.find((s) => s.key === 'i:touched' && s.open);
const realCode = (q) => OV.code.some((b) => [b.name, M.folderOf(b, OV), M.relPath(b, OV)].some((x) => String(x).toLowerCase().includes(q)));
for (const q of ['de', 'co', 'me']) ok(rowsIn(FE(q)) === real(q) && touchedOpen(FE(q)) === realCode(q), `q="${q}" ⇒ the real hits only (${rowsIn(FE(q))} = ${real(q)}); «touched» opens only on a real hit in it (${touchedOpen(FE(q))}) — never through «Document» / «Code»`);
ok(!touchedOpen(FE('de')) && !touchedOpen(FE('co')), 'q="de" / "co" (typing «decisions.md», «cover») ⇒ «touched» stays folded');
ok(FE('code').sections.find((s) => s.key === 'i:touched')?.open === true && FE('code').sections.find((s) => s.key === 'i:touched').rows.length === 41, 'q="code" (the kind\'s whole word) ⇒ «touched» opens with its 41 rows');
const cod = FE('cod').sections.find((s) => s.key === 'i:touched');
ok(cod && cod.rows.length === 41 && cod.open === false, `q="cod" (a prefix) ⇒ the 41 code rows counted, «touched» stays FOLDED (${cod && cod.open})`);
ok(FE('cod').count.filtered.weak.size === 41 && FE('code').count.filtered.weak.size === 0, 'filterRows names the prefix-only rows (`weak`) — the plan never unfolds on them');
ok(F('文', { kindWord: kw }).sections.every((s) => s.rows.every((b) => /文/.test(b.name + b.path))) , 'zh: «文» (part of 文档) matches no row through the kind word — only the whole word does');
console.log('  r3: a head tapped WHILE FILTERING is a peek — the plan honours it, never the stored folds');
const PK = (q, peek) => M.listPlan(OV, { q, collapsed: M.DEFAULT_VIEW.collapsed.intent, kindWord: enKw, peek }).sections.find((s) => s.key === 'i:touched');
ok(PK('cod', new Map([['i:touched', true]])).open === true && PK('cod', null).open === false, 'q="cod": a peek opens «touched» (the prefix rule left it folded)');
ok(PK('code', new Map([['i:touched', false]])).open === false, '…and a peek folds a band the filter opened («code»)');
ok(PK('', new Map([['i:touched', true]])).open === false, 'no filter typed ⇒ a peek is nothing (the stored folds decide)');

console.log('  最近: only what no open section draws — never a row twice on one screen');
const twice = (p) => { const seen = new Map(); for (const s of p.sections) { if (!s.open) continue; for (const x of s.folders || [{ rows: s.rows, open: true }]) if (x.open) for (const b of x.rows) seen.set(b.key, (seen.get(b.key) || 0) + 1); } return [...seen.values()].filter((n) => n > 1).length; };
ok(!plan.sections.some((s) => s.key === 'recent') && twice(plan) === 0, 'the owner\'s shape: the five newest are all on the open bands ⇒ 最近 folds away (no row twice)');
const CN = ownerView({ codeNewest: true });
const pc = M.listPlan(CN, { collapsed: M.DEFAULT_VIEW.collapsed.intent });
const rc = pc.sections.find((s) => s.key === 'recent');
ok(rc && rc.rows.length === 3 && rc.rows.every((b) => b.kind === 'code') && twice(pc) === 0, `code touched a minute ago (in the folded band) ⇒ 最近 holds just those ${rc ? rc.rows.length : 0} rows`);
ok(pc.sections.findIndex((s) => s.key === 'recent') === pc.sections.findIndex((s) => s.key === 'i:touched') - 1 && pc.sections[0].key === 'i:foryou', '…placed just above «touched» (the first screen stays «for you»)');
ok(!M.listPlan(CN, { collapsed: [] }).sections.some((s) => s.key === 'recent'), '«touched» opened ⇒ those rows are on screen ⇒ 最近 goes');
ok(M.listPlan(CN, { group: 'kind', collapsed: ['k:code'] }).sections[0].key === 'recent', 'by kind (a secondary choice) 最近 stays first');

// ── ③ the window's rail + order ──
console.log('③ the window: the rail opens with the three bands; no column clicked ⇒ the bands, newest first');
const R = M.railOf(M.rowsOfView(OV));
ok(R.intents.map((b) => b.key + ' ' + b.count).join() === 'i:foryou 4,i:made 26,i:touched 41' && M.railRows(M.rowsOfView(OV), 'i:foryou').length === 4, `railOf: ${R.intents.map((b) => b.key + ' ' + b.count).join(', ')}; a click selects its band`);
ok(M.railOf([]).intents.every((b) => b.count === 0) && M.railOf([]).intents.length === 3, 'an empty «for you» still shows (with 0) — the rail says nothing was put in front of you yet');
const wo = M.sortRows(M.rowsOfView(OV), { col: 'intent' });
ok(wo.slice(0, 4).every((b) => M.bandOf(b) === 'foryou') && wo.slice(4, 30).every((b) => M.bandOf(b) === 'made') && wo.slice(30).every((b) => M.bandOf(b) === 'touched'), 'sortRows col "intent": band by band (4 · 26 · 41), newest first in each');
console.log('  x3: the Path column sorts by the folder it SHOWS, then the name');
const PS = [['zz.md', 'x/a/zz.md'], ['aa.md', 'b/aa.md'], ['mm.md', 'c/mm.md'], ['a.md', 'b/a.md']].map(([name, p], i) => ({ key: ':' + CWD + '/' + p, name, path: CWD + '/' + p, kind: 'doc', lastAt: T0 + i }));
const ps = M.sortRows(PS, { col: 'path', cwd: CWD, host: '' }).map((b) => M.pathWord(b, { cwd: CWD }) + '/' + b.name).join(' ');
ok(ps === 'b/a.md b/aa.md c/mm.md x/a/zz.md' && M.sortRows(PS, { col: 'path', dir: 'desc', cwd: CWD }).map((b) => b.name).join() === 'zz.md,mm.md,aa.md,a.md', `Path ▲ reads in the folder order the column shows (${ps})`);
ok(M.pathWord(svcRow, OV) === svcRow.url && M.pathWord(handed, OV) === '~/helper', 'pathWord: a service shows (and sorts by) its address; any other row its folder');

// ── ④ the device-kept view ──
console.log('④ the device-kept view: intent is the default; a view stored before it reads as it');
ok(M.DEFAULT_VIEW.group === 'intent' && M.viewFrom(null).group === 'intent' && M.viewFrom({ group: 'kind' }).group === 'intent' && M.viewFrom({ v: 2, group: 'kind' }).group === 'kind' && M.viewFrom({ group: 'helper' }).group === 'helper',
  'null ⇒ intent; an OLD stored {group: kind} (the old default, never a choice) ⇒ intent; a v2 kind choice and a helper choice stay');
const F200 = Array.from({ length: M.FOLDS_MAX }, (_, i) => 'd:2026-10-' + i);
const f201 = M.viewFrom({ v: M.VIEW_VERSION, collapsed: { day: M.foldToggle(F200, 'd:new') } }).collapsed.day;
ok(M.FOLDS_MAX === 200 && f201.length === 200 && f201[0] === 'd:new' && !f201.includes(F200[199]) && M.foldToggle(['a', 'b'], 'a').join() === 'b' && M.foldToggle(['a', 'b'], 'c').join() === 'c,a,b',
  'r4 — ONE fold rule for every family: a fold moves its key to the FRONT, an unfold takes it out; past 200 the save keeps the NEWEST (a 201st fold survives, the oldest goes)');
ok(M.viewFrom({ collapsed: { day: ['d:old', 'd:new'] } }).collapsed.day.join() === 'd:new,d:old' && M.viewFrom({ v: M.VIEW_VERSION, collapsed: { day: ['d:new', 'd:old'] } }).collapsed.day.join() === 'd:new,d:old',
  'a list stored before v2 was appended (oldest first) — read newest first; a v2 list as kept');
// r5 (V3): THE CAP COUNTS THE PERSON'S FOLDS — a seeded key (i:touched, k:code) is never the one evicted; one the person
// unfolded stays out. The popover's own road: a tap = foldToggle, its save = viewFrom (what a later load reads back)
const tapFolds = (M0, v, group, keys) => { for (const k of keys) v = M0.viewFrom({ ...v, collapsed: { ...v.collapsed, [group]: M0.foldToggle(v.collapsed[group], k) } }); return v; };
const FK = Array.from({ length: 200 }, (_, i) => `f:i:made::/w/dir${i}`), CODE1 = [{ key: 'c1', kind: 'code', path: CWD + '/run.py', name: 'run.py', lastAt: 1, intent: 'touched' }];
const touchedShut = (M0, v) => M0.listPlan({ items: [{ key: 'd1', kind: 'doc', path: CWD + '/a.md', name: 'a.md', lastAt: 2, intent: 'made' }], code: CODE1, cwd: CWD }, { group: 'intent', collapsed: v.collapsed.intent }).sections.find((s) => s.key === 'i:touched').open === false;
const vS = tapFolds(M, M.viewFrom(null), 'intent', FK), FKK = FK.map((k) => k.replace('f:i:', 'f:k:'));
const vK = M.viewFrom({ v: M.VIEW_VERSION, group: 'kind', collapsed: { kind: M.foldToggle([...FKK, 'k:code'], 'f:k:new') } }); // the kind group at the boundary: 200 folds + the seed, a 201st tap
ok(vS.collapsed.intent.includes('i:touched') && vS.collapsed.intent.length === 201 && vS.collapsed.intent[0] === FK[199] && touchedShut(M, vS) === true && vK.collapsed.kind.includes('k:code') && vK.collapsed.kind.length === 201 && !vK.collapsed.kind.includes(FKK[199]),
  'r5 (V3): 200 folds after a fresh view ⇒ «touched» still SHUT (the seed is never the one evicted; the person\'s newest 200 kept beside it) — k:code alike in the kind group', { n: vS.collapsed.intent.length, last: vS.collapsed.intent.at(-1) });
const vU = tapFolds(M, tapFolds(M, M.viewFrom(null), 'intent', ['i:touched']), 'intent', FK);
ok(!vU.collapsed.intent.includes('i:touched') && touchedShut(M, vU) === false && vU.collapsed.intent.length === 200 && !tapFolds(M, vU, 'intent', ['f:i:made::/w/more']).collapsed.intent.includes('i:touched'),
  'unfold «touched», then 200 folds ⇒ «touched» still OPEN (an unfolded seed is out of the list and never re-seeded on read); the cap keeps the person\'s newest 200', vU.collapsed.intent.slice(-2));

// ── CONTROLS ──
console.log('⑤ CONTROLS — patched copies of the model, each must be RED');
const src = fs.readFileSync(MODEL, 'utf8');
const copy = async (tag, from, to) => { if (!src.includes(from)) return null; const f = path.join(scratch, `model-${tag}.mjs`); fs.writeFileSync(f, src.replace(from, to)); return import(pathToFileURL(f).href); };
const bare = await copy('bare', '    if (rs.length < 2) { out.set(rs[0].key, n); continue; }', '    { for (const r of rs) out.set(r.key, n); continue; }');
ok(bare && bare.listPlan(OV, { collapsed: ['i:touched'] }).ctx.names.get(':' + CWD + '/referee3/README.md') === 'README.md', 'CONTROL the bare name on a collision ⇒ the README leg reads «README.md» three times — RED');
const more = await copy('more', '    sections.push({ key: g.head.key, head: g.head, rows: g.rows, open, folders });', '    sections.push({ key: g.head.key, head: g.head, rows: g.rows.slice(0, 8), more: Math.max(0, g.rows.length - 8), open, folders: null });');
const pm = more && more.listPlan(OV, { collapsed: ['i:touched'] });
ok(pm && !(pm.sections.find((s) => s.key === 'i:made').rows.length === 26 && Array.isArray(pm.sections.find((s) => s.key === 'i:made').folders)), 'CONTROL a «show more» in place of a section (8 rows + a count) ⇒ the made-here leg (26 rows, every one in a folder) is RED');
const dup = await copy('dup', '.filter((r) => !drawn.has(r.key))', '');
const pd = dup && dup.listPlan(OV, { collapsed: M.DEFAULT_VIEW.collapsed.intent });
ok(pd && pd.sections.some((s) => s.key === 'recent') && (() => { const seen = new Set(), all = pd.sections.filter((s) => s.open).flatMap((s) => (s.folders || [s]).filter((x) => x.open !== false).flatMap((x) => x.rows.map((b) => b.key))); return all.some((k) => (seen.has(k) ? true : (seen.add(k), false))); })(), 'CONTROL 最近 repeating the open bands\' rows ⇒ a row twice on one screen — RED');

const kfirst = await copy('kfirst', "export function listPlan(v, { q = '', group = 'intent'", "export function listPlan(v, { q = '', group = 'kind'");
ok(kfirst && kfirst.listPlan(OV, { collapsed: [] }).sections[0].key !== 'i:foryou', 'CONTROL the kind-first default ⇒ the first section is not «for you» — RED');
const unf = await copy('unfold', "intent: Object.freeze(['i:touched'])", 'intent: Object.freeze([])');
ok(unf && unf.listPlan(OV, { collapsed: unf.DEFAULT_VIEW.collapsed.intent }).sections.find((s) => s.key === 'i:touched').open === true, 'CONTROL «touched» unfolded by default ⇒ 41 code rows on the first screens — RED');
const r1f = await copy('r1folder', "segs, base: 0, depth: 1, max:", "segs, base: 0, depth: 3, max:"); // r1: the folder's last three segments from the root
const r1meta = r1f && r1f.metaLine(r1f.rowWords(REF, { cwd: CWD, host: '', kindWord: (k) => AF.kindWord(k, 'zh') }));
ok(r1meta && r1meta !== 'referee · …/out · 文档' && r1meta.includes('vibespace-lanes'), `CONTROL r1's folderOf (a path outside the cwd printed from its root) ⇒ «${r1meta}» — RED`);
const sub = await copy('substr', "    const k = kw ? kindHit(kw(r.kind || 'other'), s) : '';", "    const k = kw && fold(kw(r.kind || 'other')).includes(s) ? 'equal' : '';");
const subP = sub && sub.listPlan(OV, { q: 'de', collapsed: ['i:touched'], kindWord: enKw });
ok(subP && (subP.sections.some((s) => s.key === 'i:touched' && s.open) || subP.sections.reduce((n, s) => n + s.rows.length, 0) > real('de')), 'CONTROL the kind word as a substring ⇒ «de» floods «Document» / «Code» rows — RED');
const tailS = await copy('tailsort', "        : (a, b) => WORDS.compare(pathWord(a, { cwd, host, hubWord, hostNames, folders }), pathWord(b, { cwd, host, hubWord, hostNames, folders })) || CMP.name(a, b);", '        : keyCmp((r) => pathTail(r.path));');
ok(tailS && tailS.sortRows(PS, { col: 'path', cwd: CWD }).map((b) => b.name).join() !== 'a.md,aa.md,mm.md,zz.md', 'CONTROL the Path sort by the path\'s tail (not what the cell shows) ⇒ RED');
const hostAll = await copy('hostall', "  if (rh === str(host)) return '';", "  return rh ? rh + ':' : '';");
ok(hostAll && hostAll.folderOf({ path: '/home/u/notes/x.md', host: 'gpu1' }, RC) === 'gpu1:~/notes', 'CONTROL the host on every row of a remote conversation («gpu1:~/notes») ⇒ RED');
const keepSfx = await copy('keepsfx', '[r.key, str(r.name)]', '[r.key, names.get(r.key)]');
const ks = keepSfx && keepSfx.listPlan(OV, { collapsed: ['i:touched'] }).sections.find((s) => s.key === 'i:made').folders.find((f) => f.head.label === 'traces/v3-or1');
ok(ks && ks.ctx.names.get(trR.key) !== 'README.md', 'CONTROL the suffix kept inside a folder head (the folder said three times) ⇒ RED');

const tailKey = await copy('tailkey', 'return { folder: grown || labelAt(w, w.depth), key: w.key, away: w.away };', 'return { folder: grown || labelAt(w, w.depth), key: w.away ? labelAt(w, w.depth) : w.key, away: w.away };');
ok(tailKey && outsOf(tailKey.listPlan(OV2, { collapsed: ['i:touched'] })).length === 1, 'CONTROL a folder keyed by its TAIL (r2) ⇒ the two out/ folders share one head — RED');
const hostR2 = await copy('namehost', '(paths.get(full[i]) > 1 ? hostTag(r, { host, hubWord, hostNames }) : \'\')', '(paths.get(full[i]) > 1 && r.host ? r.host + \':\' : \'\')');
ok(hostR2 && hostR2.shownNames(TW, { host: 'gpu1' }).get(TW[0].key) === 'gpu1:proj/README.md', 'CONTROL the names\' r2 host rule (the conversation\'s OWN machine prefixed) ⇒ RED');
const noPeek = await copy('nopeek', 'const unfold = (key, rs) => (peeked(key) ?', 'const unfold = (key, rs) => (false ?');
ok(noPeek && noPeek.listPlan(OV, { q: 'cod', collapsed: M.DEFAULT_VIEW.collapsed.intent, kindWord: enKw, peek: new Map([['i:touched', true]]) }).sections.find((s) => s.key === 'i:touched').open === false, 'CONTROL the plan ignoring a peek ⇒ a tapped head stays shut while filtering — RED');
const fnText = (name) => { const i = src.indexOf(`export function ${name}(`), j = i < 0 ? -1 : src.indexOf('\n}\n', i); return j < 0 ? '\0' : src.slice(i, j + 3); };
const R3_FOLDER_NAMES = `export function folderNames(rows, ctx = {}) {
  const places = new Map(), byLabel = new Map(), out = new Map();
  for (const r of asRows(rows)) { const w = placeOf(r, ctx || {}); if (w && !places.has(w.key)) places.set(w.key, w); }
  for (const [k, w] of places) { const l = labelAt(w, w.depth); const g = byLabel.get(l); if (g) g.push(k); else byLabel.set(l, [k]); }
  for (const ks of byLabel.values()) {
    if (ks.length < 2) continue;
    const d = new Map(ks.map((k) => [k, places.get(k).depth]));
    for (let grew = true; grew;) {
      grew = false;
      const at = new Map();
      for (const k of ks) { const l = labelAt(places.get(k), d.get(k)); const g = at.get(l); if (g) g.push(k); else at.set(l, [k]); }
      for (const g of at.values()) if (g.length > 1) for (const k of g) if (d.get(k) < places.get(k).segs.length) { d.set(k, d.get(k) + 1); grew = true; }
    }
    for (const k of ks) out.set(k, labelAt(places.get(k), d.get(k)));
  }
  return out;
}
`; // r3's folderNames, verbatim (e372c6178)
const r3N = await copy('r3names', fnText('folderNames'), R3_FOLDER_NAMES);
const r3H = r3N && [':/home/a/x', ':/root/x'].map((k) => r3N.folderNames([{ key: 'h1', path: '/home/a/x/notes.md' }, { key: 'h2', path: '/root/x/plan.md' }], { cwd: '/w/proj', host: '' }).get(k));
const r3K = r3N && r3N.folderNames([{ key: 'k1', path: CWD + '/a.md' }, { key: 'k2', path: CWD + '/proj/b.md' }, { key: 'k3', path: CWD + '/proj/proj/c.md' }], { cwd: CWD, host: '' });
const r3W = (p) => r3N.whereOf({ path: p }, { cwd: CWD, host: '', folders: r3K }).folder; // the label a head / a meta line shows
ok(r3H && r3H[0] === r3H[1] && r3W(CWD + '/proj/b.md') === r3W(CWD + '/proj/proj/c.md'), `CONTROL r3\'s folderNames (growth stops at the segments; a grown label checked only against its first collision) ⇒ two homes both «${r3H && r3H[0]}», «proj/proj» twice — RED`);
const hostId = await copy('hostid', "str(hostNames && typeof hostNames === 'object' && Object.hasOwn(hostNames, rh) ? hostNames[rh] : '') || rh", 'rh');
ok(hostId && hostId.folderOf(HV.items[0], hostId.listCtx(HV)) === HID + ':…/out', 'CONTROL r3\'s host word (the internal id) ⇒ «host-1a2b3c4d:…/out» — RED');
const mm1 = await copy('mm1', "  const f = filterRows(all, q, { ...ctx, kindWord }), filtering = !!f.q;", "  const f = filterRows(all, q, { ...ctx, kindWord }), filtering = !!f.q; if (filtering) ctx.folders = folderNames(f.rows, ctx);");
const mm3 = await copy('mm3', 'hostNames: ctx.hostNames, folders: ctx.folders })', 'hostNames: ctx.hostNames, folders: null })');
const m1 = mm1 && allWords(mm1, 'referee'), m3 = mm3 && allWords(mm3, '');
ok(m1 && m1.head !== REFOUT && m1.meta !== REFOUT, `CONTROL the folders grown over the FILTERED rows (the acceptor\'s MM1) ⇒ «referee» typed: the head «${m1 && m1.head}», the meta «${m1 && m1.meta}» — RED`);
ok(m3 && m3.head !== REFOUT, `CONTROL a section\'s folders grown over its OWN rows (MM2 / MM3) ⇒ the for-you head «${m3 && m3.head}» while the judge\'s out/ sits in «made» — RED`);
const pushF = await copy('foldpush', 'return rest.length < c.length ? rest : [k, ...rest];', 'return rest.length < c.length ? rest : [...rest, k];');
ok(pushF && !pushF.viewFrom({ v: 2, collapsed: { day: pushF.foldToggle(F200, 'd:new') } }).collapsed.day.includes('d:new'), 'CONTROL the base\'s fold (APPENDED; the cap keeps the first 200) ⇒ the 201st fold lost on save — RED');
const cjsCopy = (rel, from, to, tag) => { const src0 = fs.readFileSync(path.join(REPO, rel), 'utf8'); if (!src0.includes(from)) return null; const f = path.join(scratch, `${tag}.js`); fs.writeFileSync(f, src0.replace(from, to).replace(/(['"])\.\.?\/([\w./-]+\.js)\1/g, (m, q, p) => JSON.stringify(path.resolve(path.dirname(path.join(REPO, rel)), (m.slice(1).startsWith('../') ? '../' : './') + p)))); return require(f); }; // a CommonJS copy in the scratch dir, its relative requires made absolute (the tree is never written)
const ofSrc = fs.readFileSync(path.join(REPO, 'src/harnesses/artifacts-of.js'), 'utf8');
const dynReq = (t) => [...t.matchAll(/\brequire\(\s*(?!['"])/g)].length; // a require whose argument is not a literal: esbuild leaves it to the runtime
ok(dynReq(ofSrc) === 0 && /lazy\(\(\) => require\('\.\.\/message-manager\.js'\)\)/.test(ofSrc), 'r4 (W5): every require in the reader is a LITERAL — the device\'s bundle (build:agentd) carries the module it reads (the heavy test-artifacts-intent-chrome bundles the reader and runs it)');
ok(dynReq(ofSrc.replace("const lazy = (load) => { let m = null; return () => m || (m = load()); };", "const lazy = (p) => { let m = null; return () => m || (m = require(p)); };")) > 0, 'CONTROL r3\'s lazy(p) (a variable require) ⇒ the census finds it — RED');
const ofLine = "  if (r.type === 'user' && r.message) { const texts = textBlocks(r.message.content, ['text']); return texts.some((s) => pageLinksIn(s).length) ? said(claudeAuthor(r), texts) : []; }";
const OFT = ofSrc.includes(ofLine) ? cjsCopy('src/harnesses/artifacts-of.js', ofLine, "  if (r.type === 'user' && r.message) return presentOps(textBlocks(r.message.content, ['text']), 'user');", 'of-typerule') : null;
ok(OFT && bandBy(foldBy([PEER_REC], {}, AF, OFT)) === 'made', 'CONTROL the reader\'s r2 rule (every user RECORD is the person\'s) ⇒ a peer\'s page reads «made here» — RED');
const sticky = '  if (prev && wasShown(prev)) row.shown = true;';
const AFS = cjsCopy('src/artifacts.js', sticky, '  if (false) row.shown = true;', 'af-nosticky');
ok(AFS && bandBy(foldBy([PERSON_REC], keep(BASE_ASK), AFS), AFS) === 'made', 'CONTROL the showing not sticky forward (r2) ⇒ the base\'s ask row quoted by the person reads «made here» — RED');
const r4shown = "const wasShown = (r) => !!(r && (r.shown || (r.presented ? String(r.lastId || '').startsWith('ask:') : SHOWN_OPS.includes(r.lastOp))));";
const AF4 = cjsCopy('src/artifacts.js', r4shown, "const wasShown = (r) => !!(r && (r.shown || (r.by !== 'user' && (r.presented || SHOWN_OPS.includes(r.lastOp)))));", 'af-r4shown');
const rb4 = AF4 && rebuild([PERSON_REC], persist(rebuild([PERSON_REC], keep(BASE_PASTE), AF4)), AF4);
ok(AF4 && bandBy(rb4, AF4) === 'foryou' && Object.values(rb4)[0].shown === true, 'CONTROL r4\'s wasShown (a row without `shown` read by its `by` / `presented`) ⇒ the base\'s row for the person\'s paste reads «for you», stamped `shown` and persisted — RED');
const cap4 = await copy('cap4', 'foldsCap((v.v === VIEW_VERSION ? c[g] : c[g].slice().reverse()).filter((x) => typeof x === \'string\'), g)', '(v.v === VIEW_VERSION ? c[g] : c[g].slice().reverse()).filter((x) => typeof x === \'string\').slice(0, FOLDS_MAX)');
ok(cap4 && touchedShut(cap4, cap4.viewFrom({ v: cap4.VIEW_VERSION, collapsed: { intent: cap4.foldToggle([...FK.slice(0, 199).reverse(), 'i:touched'], FK[199]) } })) === false, 'CONTROL r4\'s cap (the newest 200 of every key) ⇒ after 200 folds the seeded «touched» is evicted and opens — RED');
const OFN = cjsCopy('src/harnesses/artifacts-of.js', '(ours || !CMM().opensWithServerFrame(text))', "(ours || !CMM().opensWithServerFrame(String(text).replace(/^\\s*VibeSpace \\(this workspace, not another agent\\) reports:/, '')))", 'of-nonotice');
ok(OFN && byOf(OFN.acp({ kind: 'update', update: { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: NOTICE } } })) === 'user', 'CONTROL the server frame without its notice-head half ⇒ VibeSpace\'s notice reads as the person\'s — RED');

done();
