#!/usr/bin/env node
// A HELPER'S DELIVERABLE REACHES THE USER THROUGH THE AGENT THE USER TALKS TO (lane artifacts-handover; owner 2026-10-06
// "一个 helper agent 做的 design 或者 artifact，能不能转移给上游主 agent 展示给用户"). ① a Task subagent's Write (its sidechain
// transcript, beside the parent's) is the PARENT's row with via.subagent — live at the Task result, the rebuild's parity, a
// streamed sidechain record never births a via-less row, a background agent read at launch AND end counts once, a workflow
// run's agent the same; ② the hand-over over the REAL registry + the REAL msg-acl: reachable ⇒ the receiver's rows + card
// (via.handover) + the helper's handedTo; a design re-registers under the receiver and opens; a stranger / a path the
// helper does not own / 21 items / another machine ⇒ refused by name; ③ the words; ④ patched-copy controls; ⑤ B-299b: the helper
// transcripts are read OFF the hub's loop (the transcript pool's pager) — the release's rows under 8 MB, no main-thread read, a longer
// helper's shape, the chat window's «tail-only display» line never said for a helper, no pool ⇒ no rows, said once.
// Fixtures are invented (a scratch HOME). Run: node scripts/test-artifacts-handover.mjs
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
import { scratch, anchored } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const HOME = scratch('artifacts-handover-home');
process.env.HOME = HOME; // the sidechains live under THIS home's ~/.claude/projects (os.homedir reads $HOME)
const AF = require(path.join(REPO, 'src/artifacts.js'));
const N = require(path.join(REPO, 'src/normalizers.js'));
const REG = require(path.join(REPO, 'src/server/artifact-registry.js'));
const ACL = require(path.join(REPO, 'src/msg-acl.js'));
const HT = require(path.join(REPO, 'src/harnesses/helper-transcripts.js'));
const C = require(path.join(REPO, 'src/adapters/codex.js'));
const M = mutantCopies('artifacts-handover', REPO);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + JSON.stringify(e) : '')); } return !!c; };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const quiet = { log() {}, warn() {} };

// ── the fixture: a parent transcript + its subagents (the CLI's own layout and record shapes) ──
const CWD = '/opt/demo/proj', SID = '7c0e0b8e-1111-4222-8333-944455556666';
const T = (s) => new Date(Date.UTC(2026, 9, 6, 8, 0, s)).toISOString();
const SUB = path.join(HOME, '.claude/projects', CWD.replace(/[^a-zA-Z0-9]/g, '-'), SID, 'subagents');
fs.mkdirSync(path.join(SUB, 'workflows', 'wf_demo1'), { recursive: true });
const jsonl = (f, recs) => fs.writeFileSync(f, recs.map((r) => JSON.stringify(r)).join('\n') + '\n');
const use = (id, name, input, s) => ({ type: 'assistant', uuid: 'u' + id, timestamp: T(s), cwd: CWD, sessionId: SID, message: { id: 'm' + id, role: 'assistant', content: [{ type: 'tool_use', id, name, input }] } });
const side = (agentId, id, name, input, s) => ({ ...use(id, name, input, s), isSidechain: true, agentId });
const res = (id, s, text = 'done', extra = {}) => ({ type: 'user', uuid: 'r' + id, timestamp: T(s), cwd: CWD, sessionId: SID, ...extra, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: [{ type: 'text', text }] }] } });
const note = (tuid, s) => ({ type: 'user', uuid: 'n' + tuid, timestamp: T(s), cwd: CWD, sessionId: SID, origin: { kind: 'task-notification' }, message: { role: 'user', content: `<task-notification>\n<task-id>bg1</task-id>\n<tool-use-id>${tuid}</tool-use-id>\n<status>completed</status>\n</task-notification>` } });
const agent = (dir, id, meta, recs) => { jsonl(path.join(dir, `agent-${id}.jsonl`), recs); fs.writeFileSync(path.join(dir, `agent-${id}.meta.json`), JSON.stringify(meta)); };
const BRIEF = CWD + '/docs/brief.md';
agent(SUB, 'a01', { agentType: 'general-purpose', description: 'Draft the brief', toolUseId: 'toolu_T1' }, [
  side('a01', 'toolu_S1', 'Write', { file_path: BRIEF, content: '# Brief\n' }, 3), side('a01', 'toolu_S2', 'Edit', { file_path: BRIEF, old_string: 'Brief', new_string: 'The brief' }, 4),
  side('a01', 'toolu_S3', 'Write', { file_path: CWD + '/tmp/scratch.py', content: 'x=1' }, 5)]);
const TASK = [use('toolu_T1', 'Agent', { description: 'Draft the brief', prompt: 'write it', subagent_type: 'general-purpose' }, 1), res('toolu_T1', 9, 'the brief is written', { toolUseResult: { status: 'completed', agentId: 'a01' } })];
const mk = (id, extra = {}) => ({ backend: 'claude', cwd: CWD, host: '', sockName: null, claudeSessionId: SID, name: id, _historyLoaded: true, _normalizer: N.createMessageManager('claude', id), ...extra });
const cards = (s) => s._normalizer.messages.filter((m) => m.noticeKind === 'artifact').map((m) => m.content[0]);
const shape = (rows) => Object.values(rows || {}).map((r) => `${r.path}|${r.kind}|w${r.writes}e${r.edits}|${r.via ? r.via.kind + ':' + r.via.name : '-'}`).sort().join(' ');

console.log('① a Task subagent\'s writes are the PARENT\'s rows (via.subagent) — live at the Task result, the rebuild the same');
{
  const live = mk('L1');
  REG.configure({ activeSessions: () => new Map([['L1', live]]), log: quiet });
  REG.observe(live, TASK[0]);
  ok(!Object.keys(live._artifacts || {}).length, 'the Task\'s tool_use alone births nothing (its sidechain has not ended)');
  REG.observe(live, TASK[1]); REG.observe(live, TASK[1]); // the parse + the device feed
  await REG.helperSettled(live); // B-299b: the helper's rows land when its read off the loop has
  const row = (live._artifacts || {})[':' + BRIEF];
  ok(gateOf(row) && gateOf(row.via) && row.via.kind === 'subagent' && row.via.name === 'Draft the brief' && row.writes === 1 && row.edits === 1, 'the sidechain\'s Write + Edit ⇒ ONE parent row, via {subagent, "Draft the brief"}, counted once though the result was fed twice', row);
  const c = cards(live).find((b) => b.path === BRIEF);
  ok(gateOf(c) && gateOf(c.via) && c.via.name === 'Draft the brief' && AF.cardFacts(c).via.kind === 'subagent', 'the parent\'s chat gets the card at the Task result (its block carries via)', c);
  ok(gateOf(live._artifacts[':' + CWD + '/tmp/scratch.py']) && !cards(live).some((b) => b.path.endsWith('.py')), 'the sidechain\'s code file is a row behind the chip\'s Code fold, never a card (the parent\'s rule)');
  const rb = mk('R1', { _normalizer: null, _artifacts: null });
  await N.rebuildHistory(rb, 'R1', TASK);
  ok(shape(rb._artifacts) === shape(live._artifacts), 'REPLAY PARITY: the rebuild over the parent transcript derives the same rows', { live: shape(live._artifacts), rebuild: shape(rb._artifacts) });
  const msgs = rb._normalizer.messages, ci = msgs.findIndex((m) => m.noticeKind === 'artifact' && m.content[0].path === BRIEF);
  ok(ci > 0 && verdictOf(msgs.slice(0, ci).some((m) => JSON.stringify(m).includes('the brief is written'))), 'the rebuilt card sits AFTER the Task\'s result (where the live one was born)', ci);
  const streamed = mk('L2');
  REG.configure({ activeSessions: () => new Map([['L2', streamed]]), log: quiet });
  ok(REG.observe(streamed, { ...side('a01', 'toolu_S1', 'Write', { file_path: BRIEF, content: 'x' }, 3), parent_tool_use_id: 'toolu_T1' }) === 0 && !Object.keys(streamed._artifacts || {}).length,
    'a STREAMED sidechain record (parent_tool_use_id) births no via-less row — the helper door owns it');
}
{
  const bg = mk('L3');
  REG.configure({ activeSessions: () => new Map([['L3', bg]]), log: quiet });
  agent(SUB, 'a02', { agentType: 'general-purpose', description: 'Background notes', toolUseId: 'toolu_T2' }, [side('a02', 'toolu_B1', 'Write', { file_path: CWD + '/notes.md', content: 'n' }, 11)]);
  REG.observe(bg, res('toolu_T2', 12, 'Async agent launched successfully.', { toolUseResult: { isAsync: true, status: 'async_launched', agentId: 'a02' } }));
  fs.appendFileSync(path.join(SUB, 'agent-a02.jsonl'), JSON.stringify(side('a02', 'toolu_B2', 'Edit', { file_path: CWD + '/notes.md', old_string: 'n', new_string: 'nn' }, 13)) + '\n');
  REG.observe(bg, note('toolu_T2', 14));
  await REG.helperSettled(bg);
  const r = bg._artifacts[':' + CWD + '/notes.md'];
  ok(gateOf(r) && r.writes === 1 && r.edits === 1 && r.via.name === 'Background notes', 'a background agent: read at its launch AND at its notification — each op counted once', r);
  const wf = mk('L4');
  REG.configure({ activeSessions: () => new Map([['L4', wf]]), log: quiet });
  agent(path.join(SUB, 'workflows', 'wf_demo1'), 'w01', { agentType: 'workflow-agent', description: 'review: tables' }, [side('w01', 'toolu_W1', 'Write', { file_path: CWD + '/review.md', content: 'r' }, 21)]);
  REG.observe(wf, res('toolu_WF', 20, 'Workflow launched. Run ID: wf_demo1'));
  await REG.helperSettled(wf);
  ok(!Object.keys(wf._artifacts || {}).length, 'a workflow LAUNCH result reads nothing yet (it remembers the run)');
  REG.observe(wf, note('toolu_WF', 30));
  await REG.helperSettled(wf);
  const w = wf._artifacts[':' + CWD + '/review.md'];
  ok(gateOf(w) && gateOf(w.via) && w.via.name === 'review: tables' && w.via.wf === 'wf_demo1', 'a workflow run\'s agent ⇒ the same rule at the run\'s notification (via names the agent + the run)', w);
  const remote = mk('L5', { host: 'gpu-box' });
  REG.configure({ activeSessions: () => new Map([['L5', remote]]), log: quiet });
  REG.observe(remote, TASK[1]);
  await REG.helperSettled(remote);
  ok(!Object.keys(remote._artifacts || {}).length, 'a remote conversation reads no sidechain (its files are on its machine — none is fetched)');
  let reads = 0; const fsMod = require('fs'); const ex = fsMod.existsSync; fsMod.existsSync = (...x) => { reads++; return ex(...x); };
  const plain = HT.claude(res('toolu_BASH', 50, 'ls output'), { sessionId: SID, cwd: CWD, runs: new Map() });
  fsMod.existsSync = ex;
  ok(plain.length === 0 && reads === 0, 'an ordinary tool\'s result (no agentId) is answered [] without touching the disk', { reads });
  ok(HT.claude({ type: 'user', message: { content: 'hello' } }, {}).length === 0 && HT.claude(null).length === 0 && HT.claude(TASK[0], {}).length === 0, 'the helper door answers [] for a record that ends nothing');
}

{ // lane artifacts-by-intent r3 (z1): a helper's transcript is an AGENT's — a page link in its Task prompt (the parent's
  // words, read through the helper door) puts the page in front of the person; it is never the person's own paste
  const PG = '/p/pgreferee001';
  agent(SUB, 'a04', { agentType: 'general-purpose', description: 'Check the report', toolUseId: 'toolu_T4' }, [
    { type: 'user', uuid: 'h1', timestamp: T(40), cwd: CWD, sessionId: SID, isSidechain: true, agentId: 'a04', message: { role: 'user', content: `Check the report at ${PG} and list what is missing` } },
    { type: 'assistant', uuid: 'h2', timestamp: T(41), cwd: CWD, sessionId: SID, isSidechain: true, agentId: 'a04', message: { id: 'mh2', role: 'assistant', content: [{ type: 'text', text: 'Two tables are missing.' }] } }]);
  const T4 = [use('toolu_T4', 'Agent', { description: 'Check the report', prompt: `Check the report at ${PG}`, subagent_type: 'general-purpose' }, 39), res('toolu_T4', 42, 'reviewed', { toolUseResult: { status: 'completed', agentId: 'a04' } })];
  const hp = mk('L6');
  REG.configure({ activeSessions: () => new Map([['L6', hp]]), log: quiet });
  for (const r of T4) REG.observe(hp, r);
  await REG.helperSettled(hp);
  const lr = (hp._artifacts || {})[':' + PG];
  ok(gateOf(lr) && gateOf(lr.presented) && lr.by === 'agent' && lr.shown === true && AF.intentOf(lr) === 'foryou' && gateOf(lr.via) && lr.via.kind === 'subagent', 'a page link in a helper\'s Task prompt (its transcript\'s first user record) ⇒ by the agent, shown — «for you», never the person\'s', lr);
  const rb6 = mk('R6', { _normalizer: null, _artifacts: null });
  await N.rebuildHistory(rb6, 'R6', T4);
  const rr = (rb6._artifacts || {})[':' + PG];
  ok(gateOf(rr) && rr.by === 'agent' && AF.intentOf(rr) === 'foryou', 'the rebuild (the same helper door) says the same', rr);
  const hsrc = fs.readFileSync(path.join(REPO, 'src/server/artifact-registry.js'), 'utf8');
  const STRIP = "    const { by: _who, ...op } = o; // a helper's transcript is an agent's: its Task prompt is the parent's words, never the person's (lane artifacts-by-intent r3)\n    out.push({ ...op, id, via, cwd: cwd || session.cwd || '', ...(at ? { at } : {}) });"; // B-299b: helperTagged
  const MH = hsrc.includes(STRIP) ? M.load('src/server/artifact-registry.js', editAnchor(hsrc, STRIP, "    out.push({ ...o, id, via, cwd: cwd || session.cwd || '', ...(at ? { at } : {}) });", "src/server/artifact-registry.js"), 'helperby') : null;
  const hm = mk('M6');
  if (ok(verdictOf(MH), 'CONTROL needle present: the helper door\'s strip of the reader\'s tag (r3) — a tree without it has nothing to patch')) { // r4: a control that cannot find its anchor says so by name, never «null»
    MH.configure({ activeSessions: () => new Map([['M6', hm]]), log: quiet }); for (const r of T4) MH.observe(hm, r); await MH.helperSettled(hm); REG.configure({ activeSessions: () => new Map([['L6', hp]]), log: quiet });
    const mr = (hm._artifacts || {})[':' + PG];
    ok(gateOf(mr) && mr.by === 'user' && AF.intentOf(mr) === 'made', 'CONTROL the helper door keeping the reader\'s person tag (r2: the record\'s TYPE) ⇒ the helper\'s page reads «made here» — RED', mr);
  }
}

console.log('② the hand-over over the REAL registry + the REAL msg-acl');
const CH = 'c0000001-0000-4000-8000-00000000000h', CR = 'c0000001-0000-4000-8000-00000000000r', CS = 'c0000001-0000-4000-8000-00000000000s', CX = 'c0000001-0000-4000-8000-00000000000x';
const GROUPS = { [CH]: ['g-lanes'], [CR]: ['g-lanes'], [CS]: ['g-other'], [CX]: ['g-lanes'] };
const reachFrom = (from) => (cid) => ACL.canMessage(ACL.levelFor({ cid, groups: GROUPS[cid] || [] }, GROUPS[from] || [], () => 'none'));
const DESIGN = '/opt/demo/helper/designs/doc-ui';
function world(reg = REG) {
  const helper = mk('h', { claudeSessionId: CH, name: 'design desk' });
  const recv = mk('r', { claudeSessionId: CR, name: 'coordinator' });
  const stranger = mk('s', { claudeSessionId: CS, name: 'stranger' });
  const far = mk('x', { claudeSessionId: CX, name: 'far one', host: 'gpu-box' });
  const DE = { calls: [], opened: [], register(a) { this.calls.push(a); return { ok: true, design: { id: 'd1', dir: a.dir, host: a.host, sessionId: a.sessionId, conversationId: a.conversationId, via: a.via } }; }, openOn(s, sid, d) { this.opened.push({ sid, dir: d.dir }); } };
  reg.configure({ activeSessions: () => new Map([['h', helper], ['r', recv], ['s', stranger], ['x', far]]), designs: () => DE, log: quiet });
  reg.observe(helper, use('toolu_H1', 'Write', { file_path: '/opt/demo/helper/report.md', content: '# Report\n' }, 40));
  reg.noteDesign({ id: 'd1', dir: DESIGN, title: 'Doc UI', sessionId: 'h', openedAt: 41 });
  reg.notePage({ id: 'pg7', sessionId: 'h', srcKey: 'local:/opt/demo/helper/site/index.html', srcPath: '/opt/demo/helper/site/index.html', path: '/p/pg7', updatedAt: 42 });
  return { helper, recv, stranger, far, DE };
}
{
  const w = world();
  const r = REG.handover({ from: { cid: CH, name: 'design desk', session: w.helper }, to: [CR], items: ['/opt/demo/helper/report.md', DESIGN, '/p/pg7'], reach: reachFrom(CH), at: 50 });
  ok(gateOf(r.ok) && r.handed.length === 3 && !r.refused.length, 'reachable receiver ⇒ 3 items handed (a file, a design folder, a page link)', r);
  const rr = w.recv._artifacts || {};
  const doc = rr[':/opt/demo/helper/report.md'], des = rr[':' + DESIGN], page = Object.values(rr).find((x) => x.url === '/p/pg7');
  ok(gateOf(doc) && doc.kind === 'doc' && doc.via.kind === 'handover' && doc.via.from.cid === CH && doc.via.from.name === 'design desk' && doc.writes === 0, 'the receiver\'s row: same path + kind, via {handover, from: the helper} — a hand-over never counts as a write', doc);
  ok(gateOf(des) && des.kind === 'design' && gateOf(page) && page.kind === 'page' && page.state === 'published', 'the design is a design row, the page a page row (its link + state)', { des, page });
  const rc = cards(w.recv);
  ok(rc.length === 3 && verdictOf(rc.every((b) => b.via && b.via.kind === 'handover')), 'the receiver\'s chat gets one card per item, each saying who handed it over', rc.map((b) => b.name));
  ok(REG.listFor('r').count === 3, 'the receiver\'s Artifacts chip counts them', REG.listFor('r').count);
  ok((w.helper._artifacts[':/opt/demo/helper/report.md'].handedTo || [])[0].cid === CR && (w.helper._artifacts[':/opt/demo/helper/report.md'].handedTo || [])[0].name === 'coordinator', 'the helper\'s own row keeps handedTo {the receiver}', w.helper._artifacts[':/opt/demo/helper/report.md'].handedTo);
  ok(w.DE.calls.length === 1 && w.DE.calls[0].dir === DESIGN && w.DE.calls[0].sessionId === 'r' && w.DE.calls[0].conversationId === CR && w.DE.calls[0].via.cid === CH && w.DE.opened[0].sid === 'r',
    'the design re-registers in the Design window\'s registry under the RECEIVER (via the helper) and its window opens there', w.DE);
  const again = REG.handover({ from: { cid: CH, name: 'design desk', session: w.helper }, to: [CR], items: ['/opt/demo/helper/report.md'], reach: reachFrom(CH), at: 60 });
  ok(gateOf(again.ok) && Object.keys(w.recv._artifacts).length === 3 && cards(w.recv).length === 3, 'handing the same file over again patches the receiver\'s row — still one row, one card');
  const st = REG.handover({ from: { cid: CH, name: 'design desk', session: w.helper }, to: [CS], items: ['/opt/demo/helper/report.md'], reach: reachFrom(CH), at: 70 });
  ok(!st.ok && st.refused[0].why === 'unreachable' && gateOf(st.refused[0].error.includes(CS)) && !Object.keys(w.stranger._artifacts || {}).length, 'a conversation outside the helper\'s reach ⇒ refused by name, nothing lands', st);
  const no = REG.handover({ from: { cid: CH, name: 'design desk', session: w.helper }, to: [CR], items: ['/opt/demo/elsewhere/secret.md'], reach: reachFrom(CH) });
  ok(!no.ok && no.refused[0].why === 'not-yours' && verdictOf(no.refused[0].error.includes('/opt/demo/elsewhere/secret.md')), 'a path the helper does not own ⇒ refused by name', no);
  const many = REG.handover({ from: { cid: CH, session: w.helper }, to: [CR], items: Array.from({ length: 21 }, (_, i) => `/opt/demo/helper/f${i}.md`), reach: reachFrom(CH) });
  ok(!many.ok && many.code === 'too-many' && verdictOf(/21/.test(many.error)), '21 items ⇒ refused (≤ 20 per hand-over)', many);
  const far = REG.handover({ from: { cid: CH, name: 'design desk', session: w.helper }, to: [CX], items: ['/opt/demo/helper/report.md'], reach: reachFrom(CH) });
  ok(!far.ok && far.refused[0].why === 'other-machine' && !Object.keys(w.far._artifacts || {}).length, 'a receiver on another machine ⇒ refused by name (files are never copied)', far);
  ok(!REG.handover({ from: { cid: CH, session: w.helper }, to: [CR], items: ['/opt/demo/helper/report.md'] }).ok, 'no reach function ⇒ refused (the reach is never assumed)');
}

console.log('③ the words (en / zh / ja)');
{
  const zh = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8'), ja = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8');
  const KEYS = ['Handed over by {name}', 'By subagent {name}', 'Handed to {names}', 'via {name}'];
  ok(gateOf(KEYS.every((k) => zh.includes(JSON.stringify(k) + ':') && ja.includes(JSON.stringify(k) + ':'))) && verdictOf(zh.includes('"移交自 {name}"')), 'every card word has its zh + ja line ("移交自 {name}")');
  const card = fs.readFileSync(path.join(REPO, 'src/lib/artifact-card.js'), 'utf8'), home = fs.readFileSync(path.join(REPO, 'src/lib/design-home.js'), 'utf8');
  ok(gateOf(KEYS.slice(0, 3).every((k) => card.includes(`t('${k}'`))) && verdictOf(home.includes("t('via {name}'")), 'the card says them through t(); the Design home says "via <helper>"');
  ok(AF.viaOf({ kind: 'handover', from: { cid: 'x'.repeat(300), name: 'n' } }).from.cid.length === 64 && AF.viaOf({ kind: 'bogus' }) === null, 'via is bounded and closed (an unknown kind ⇒ none)');
}

console.log('④ patched-copy controls');
{
  const src = fs.readFileSync(path.join(REPO, 'src/server/artifact-registry.js'), 'utf8');
  const REACH = "    if (!reach(cid)) {";
  const MR = src.includes(REACH) ? M.load('src/server/artifact-registry.js', editAnchor(src, REACH, '    if (false) {', "src/server/artifact-registry.js"), 'noreach') : null;
  if (ok(verdictOf(MR), 'CONTROL needle present: the reach check')) { const w = world(MR); const r = MR.handover({ from: { cid: CH, name: 'design desk', session: w.helper }, to: [CS], items: ['/opt/demo/helper/report.md'], reach: reachFrom(CH) }); ok(gateOf(r.ok) && Object.keys(w.stranger._artifacts || {}).length === 1, 'CONTROL: without the reach check a stranger\'s registry gets the row (② sees it red)', r); }
  const OWN = "const row = AF.rowFor(helper._artifacts || {}, it, helper.host || '');";
  const MO = src.includes(OWN) ? M.load('src/server/artifact-registry.js', editAnchor(src, OWN, "const row = AF.rowFor(helper._artifacts || {}, it, helper.host || '') || { key: ':' + it, host: '', path: it, name: it, kind: 'doc' };", "src/server/artifact-registry.js"), 'noown') : null;
  if (ok(verdictOf(MO), 'CONTROL needle present: the ownership check')) { const w = world(MO); const r = MO.handover({ from: { cid: CH, name: 'design desk', session: w.helper }, to: [CR], items: ['/opt/demo/elsewhere/secret.md'], reach: reachFrom(CH) }); ok(gateOf(r.ok) && verdictOf(w.recv._artifacts[':/opt/demo/elsewhere/secret.md']), 'CONTROL: without the ownership check a path the helper never wrote lands (② sees it red)', r); }
  const SIDE = "  foldHelpers(session, record, session._helperArtifacts);\n"; // lane agy-subagent-cards: the door asks every record (the descriptor's hook names what ends a helper); B-299b: it folds off the loop
  const MS = src.includes(SIDE) ? M.load('src/server/artifact-registry.js', editAnchor(src, SIDE, '', "src/server/artifact-registry.js"), 'noside') : null;
  if (ok(verdictOf(MS), 'CONTROL needle present: the live helper door')) { const s = mk('M1'); MS.configure({ activeSessions: () => new Map([['M1', s]]), log: quiet }); MS.observe(s, TASK[1]); await MS.helperSettled(s); ok(!Object.keys(s._artifacts || {}).length, 'CONTROL: sidechain not read ⇒ the fixture\'s row is missing live (① sees it red)'); }
  const nsrc = fs.readFileSync(path.join(REPO, 'src/normalizers.js'), 'utf8');
  const NSIDE = 'if (helper && artifactHelperSource && raw)'; // lane agy-subagent-cards: the hook decides which record ends a helper
  const MN = nsrc.includes(NSIDE) ? M.load('src/normalizers.js', editAnchor(nsrc, NSIDE, 'if (false)', "src/normalizers.js"), 'nonside') : null;
  if (ok(verdictOf(MN), 'CONTROL needle present: the rebuild\'s helper seam')) { MN.setArtifactHelperSource(REG.helperOps, REG.helperPrefetch); const s = mk('M2', { _normalizer: null, _artifacts: null }); await MN.rebuildHistory(s, 'M2', TASK); ok(!Object.keys(s._artifacts || {}).length, 'CONTROL: the rebuild without the helper seam derives no row (the parity assert sees it red)'); }
}

console.log('⑤ B-299b: a helper\'s transcript is read OFF the hub\'s loop (the transcript pool\'s pager), its rows the release\'s');
{
  // THE RELEASE'S READER (src/harnesses/helper-transcripts.js readRecords at 2.369.413, verbatim but its name): the newest 8 MB, split, parsed
  const releaseRecords = (file, max = 8 * 1024 * 1024) => {
    let text = '';
    try { const st = fs.statSync(file); const fd = fs.openSync(file, 'r'); const n = Math.min(st.size, max); const buf = Buffer.alloc(n); fs.readSync(fd, buf, 0, n, st.size - n); fs.closeSync(fd); text = buf.toString('utf8'); } catch { return []; }
    const out = [];
    for (const line of text.split('\n')) { if (!line.trim()) continue; try { out.push(JSON.parse(line)); } catch { } }
    return out;
  };
  const RELEASE_READ = "((f) => { const fs = require('fs'); let text = ''; try { const st = fs.statSync(f); const fd = fs.openSync(f, 'r'); const n = Math.min(st.size, 8 * 1024 * 1024); const buf = Buffer.alloc(n); fs.readSync(fd, buf, 0, n, st.size - n); fs.closeSync(fd); text = buf.toString('utf8'); } catch { return []; } const out = []; for (const line of text.split('\\n')) { if (!line.trim()) continue; try { out.push(JSON.parse(line)); } catch { } } return out; })(file)";
  const PAGER = "await require('../adapters/codex.js').readJsonlBoundedParsedPagedAsync(file, { tailOnly: false, slot: 'helper', note: false, onFail: (w) => { why = w; } })";   // row B-422c follow: + note: false (its refusals carry no history weight)
  const MR = M.load('src/server/artifact-registry.js', anchored(fs.readFileSync(path.join(REPO, 'src/server/artifact-registry.js'), 'utf8'), PAGER, RELEASE_READ, 'the release\'s main-thread reader'), 'releaseread');
  const PAD = 'p'.repeat(3900), MB = 1048576;
  // a helper transcript of `mb` MB: padding records, a Write at each `writes[i].atMb` (Infinity = after the last padding), `extra` lines verbatim
  const helper = (id, tuid, desc, { mb, writes = [], extra = [] }) => {
    const lines = [], want = [...writes].sort((a, b) => a.atMb - b.atMb);
    let bytes = 0, k = 0;
    const push = (line) => { lines.push(line); bytes += Buffer.byteLength(line) + 1; k++; };
    while (bytes < mb * MB) {
      if (want.length && bytes >= want[0].atMb * MB) { push(JSON.stringify(side(id, `toolu_${id}_${k}`, 'Write', { file_path: want.shift().file, content: 'w' }, 2))); continue; }
      push(JSON.stringify({ type: 'assistant', uuid: `p${id}${k}`, timestamp: T(2), cwd: CWD, sessionId: SID, isSidechain: true, agentId: id, message: { id: `mp${id}${k}`, role: 'assistant', content: [{ type: 'text', text: PAD }] } }));
      if (k % 400 === 7) for (const x of extra) push(x);
    }
    for (const w of want) push(JSON.stringify(side(id, `toolu_${id}_${k}`, 'Write', { file_path: w.file, content: 'w' }, 2)));
    fs.writeFileSync(path.join(SUB, `agent-${id}.jsonl`), lines.join('\n') + '\n');
    fs.writeFileSync(path.join(SUB, `agent-${id}.meta.json`), JSON.stringify({ agentType: 'general-purpose', description: desc, toolUseId: tuid }));
    return path.join(SUB, `agent-${id}.jsonl`);
  };
  const ends = (tuid, id, s) => res(tuid, s, 'done', { toolUseResult: { status: 'completed', agentId: id } });
  // every main-thread read of a helper TRANSCRIPT (a .jsonl under the subagents dir) while `run` runs — by name
  const mainReads = async (run) => {
    const seen = [], K = ['openSync', 'readFileSync', 'statSync', 'createReadStream'], real = {};
    for (const k of K) { real[k] = fs[k]; fs[k] = function (p0, ...a) { if (typeof p0 === 'string' && p0.startsWith(SUB) && p0.endsWith('.jsonl')) seen.push(`${k} ${path.basename(p0)}`); return real[k].call(this, p0, ...a); }; }
    try { await run(); } finally { for (const k of K) fs[k] = real[k]; }
    return seen;
  };
  // the subagents folder listed on the main thread while `run` runs (the claude hook's agentsIn: one listing a record that ends a helper)
  const dirReads = async (run) => { let n = 0; const real = fs.readdirSync; fs.readdirSync = function (p0, ...a) { if (p0 === SUB) n++; return real.call(this, p0, ...a); }; try { await run(); } finally { fs.readdirSync = real; } return n; };
  const liveOf = async (reg, id, recs) => { const s = mk(id); reg.configure({ activeSessions: () => new Map([[id, s]]), log: quiet }); for (const r of recs) reg.observe(s, r); await reg.helperSettled(s); return s; };
  const rows = (s) => s._artifacts || {};

  // (a) UNDER 8 MB the release read the whole file: the pager's records ARE the release's (blank, «null», broken, padded and CRLF lines too)
  const D = CWD + '/eq/', EXTRA = ['', '   ', 'null', '{"type":"assistant","broken', '  ' + JSON.stringify(side('a05', 'toolu_EQpad', 'Write', { file_path: D + 'padded.md', content: 'x' }, 2)) + '  ', JSON.stringify(side('a05', 'toolu_EQcr', 'Edit', { file_path: D + 'padded.md', old_string: 'x', new_string: 'y' }, 2)) + '\r'];
  const F5 = helper('a05', 'toolu_T5', 'Equal under 8 MB', { mb: 7.5, writes: [0.1, 1.5, 3, 4.5, 6, 7.4].map((atMb, i) => ({ atMb, file: D + `f${i}.md` })), extra: EXTRA });
  const recP = await C.readJsonlBoundedParsedPagedAsync(F5, { tailOnly: false }), recR = releaseRecords(F5);
  ok(fs.statSync(F5).size < 8 * MB && gateOf(Array.isArray(recP)) && recP.length === recR.length && JSON.stringify(recP) === JSON.stringify(recR), 'a 7.5 MB helper: the pager\'s records (head+tail road) are EXACTLY the release reader\'s — every record, in order, the «null» line kept, blank and broken lines dropped', { pager: recP && recP.length, release: recR.length });
  const T5 = [use('toolu_T5', 'Agent', { description: 'Equal under 8 MB', prompt: 'go', subagent_type: 'general-purpose' }, 60), ends('toolu_T5', 'a05', 61)];
  const pagedBefore = C.pagedReadStats().reads, readBefore = REG.helperReadStats().read;
  let L5 = null;
  const liveReads = await mainReads(async () => { L5 = await liveOf(REG, 'B1', T5); });
  const R5 = mk('B1r', { _normalizer: null, _artifacts: null });
  const rbReads = await mainReads(async () => { await N.rebuildHistory(R5, 'B1r', T5); });
  const want5 = [0, 1, 2, 3, 4, 5].map((i) => D + `f${i}.md`).concat(D + 'padded.md');
  ok(liveReads.length === 0 && rbReads.length === 0, 'NO MAIN-THREAD READ of the helper transcript — live (the Task\'s end) and at a rebuild', { live: liveReads, rebuild: rbReads });
  const R5b = mk('B1r2', { _normalizer: null, _artifacts: null });
  const lists = await dirReads(async () => { await N.rebuildHistory(R5b, 'B1r2', T5); });
  const MQ = M.load('src/server/artifact-registry.js', anchored(fs.readFileSync(path.join(REPO, 'src/server/artifact-registry.js'), 'utf8'), 'for (const { file, via } of named || helperFilesOf(session, record, state))', /* stale-pins: kept — the control's PLANT (the fold asking the hook again), not a pin */ 'for (const { file, via } of helperFilesOf(session, record, state))', 'the fold asks the hook again'), 'askstwice');
  MQ.configure({ activeSessions: () => new Map(), log: quiet });
  const R5c = mk('B1r3', { _normalizer: null, _artifacts: null });
  const listsTwice = await dirReads(async () => { await N.rebuildHistory(R5c, 'B1r3', T5); });
  REG.configure({ activeSessions: () => new Map(), log: quiet }); // the real seam again
  ok(lists === 1 && listsTwice === 2 && shape(rows(R5b)) === shape(rows(R5c)), 'the rebuild asks the helper hook ONCE a record (the prefetch\'s answer is the fold\'s): one listing of the subagents folder for the one end record; CONTROL a fold that asks again lists it twice', { lists, listsTwice });
  ok(C.pagedReadStats().reads >= pagedBefore + 1 && REG.helperReadStats().read === readBefore + 1, 'the read went through the transcript pool\'s pager (its paged-read count), ONCE: the rebuild used the ops kept for the unchanged file', { paged: C.pagedReadStats().reads - pagedBefore, read: REG.helperReadStats().read - readBefore, kept: REG.helperReadStats().kept });
  let M5 = null;
  const mReads = await mainReads(async () => { M5 = await liveOf(MR, 'B1m', T5); }); REG.configure({ activeSessions: () => new Map(), log: quiet }); // the copy's configure pointed the rebuild's helper seam at itself — the real one again
  ok(mReads.length >= 2 && verdictOf(mReads.some((x) => /^openSync /.test(x))), 'CONTROL the release\'s reader in the same door ⇒ the spy names its main-thread reads (stat + open) — the zero above can fail', mReads);
  ok(gateOf(want5.every((p) => rows(L5)[':' + p] && rows(L5)[':' + p].via.name === 'Equal under 8 MB')) && shape(rows(L5)) === shape(rows(M5)) && shape(rows(R5)) === shape(rows(L5)) && rows(L5)[':' + D + 'padded.md'].writes === 1 && rows(L5)[':' + D + 'padded.md'].edits === 1,
    'THE ROWS ARE THE RELEASE\'S under 8 MB: the cure\'s live rows = the release reader\'s rows (the control copy) = the rebuild\'s — seven files, the padded and CRLF lines counted', { cure: shape(rows(L5)), release: shape(rows(M5)), rebuild: shape(rows(R5)) });

  // (b) A LONGER HELPER: 9 MB — the release read its newest 8 MB and lost a write in its first MB; the pager reads it whole
  const D9 = CWD + '/nine/';
  helper('a06', 'toolu_T6', 'Nine megabytes', { mb: 9, writes: [{ atMb: 0.2, file: D9 + 'early.md' }, { atMb: Infinity, file: D9 + 'late.md' }] });
  const T6 = [use('toolu_T6', 'Agent', { description: 'Nine megabytes', prompt: 'go', subagent_type: 'general-purpose' }, 62), ends('toolu_T6', 'a06', 63)];
  const L6 = await liveOf(REG, 'B2', T6), M6 = await liveOf(MR, 'B2m', T6); REG.configure({ activeSessions: () => new Map(), log: quiet });
  ok(gateOf(rows(L6)[':' + D9 + 'early.md']) && gateOf(rows(L6)[':' + D9 + 'late.md']) && !rows(M6)[':' + D9 + 'early.md'] && verdictOf(rows(M6)[':' + D9 + 'late.md']), 'a 9 MB helper: its early write is a row now (the file is read whole up to 34 MB); the release\'s 8 MB tail lost it (the control)', { cure: shape(rows(L6)), release: shape(rows(M6)) });

  // (c) OVER 34 MB: its first 2 MB and its last 32 MB — and the chat window's «tail-only display» line is NEVER said for a helper's file
  const DL = CWD + '/long/';
  const FL = helper('a07', 'toolu_T7', 'Very long', { mb: 34.5, writes: [{ atMb: 0.5, file: DL + 'start.md' }, { atMb: 2.2, file: DL + 'middle.md' }, { atMb: Infinity, file: DL + 'end.md' }] });
  const T7 = [use('toolu_T7', 'Agent', { description: 'Very long', prompt: 'go', subagent_type: 'general-purpose' }, 64), ends('toolu_T7', 'a07', 65)];
  const said = [], realErr = process.stderr.write, realWarn = console.warn;
  const hear = async (run) => { said.length = 0; process.stderr.write = function (c, ...a) { said.push(String(c)); return realErr.call(this, c, ...a); }; console.warn = (...a) => { said.push(a.join(' ')); };
    try { await run(); await new Promise((r) => setTimeout(r, 400)); } finally { process.stderr.write = realErr; console.warn = realWarn; } return said.join(''); };
  let L7 = null;
  const heardDoor = await hear(async () => { L7 = await liveOf(REG, 'B3', T7); });
  const heardChat = await hear(async () => { await C.readJsonlBoundedParsedPagedAsync(FL, { tailOnly: true }); });
  ok(!/tail-only display/.test(heardDoor) && verdictOf(/tail-only display/.test(heardChat)), 'a 34.5 MB helper: the helper door says NO «tail-only display» line (the head+tail road never prints it); CONTROL the same file on the chat window\'s tailOnly road says it — the ear hears the worker', { door: heardDoor.slice(0, 200), chat: (heardChat.match(/\[jsonl\][^\n]*/) || [''])[0].slice(0, 160) });
  ok(gateOf(rows(L7)[':' + DL + 'start.md']) && !rows(L7)[':' + DL + 'middle.md'] && verdictOf(rows(L7)[':' + DL + 'end.md']), 'over 34 MB a helper\'s rows come from its first 2 MB and its last 32 MB: the write at 0.5 MB and the last one are rows, the one at 2.2 MB (in neither) is not', shape(rows(L7)));

  // (d) NO READ OFF THE LOOP ⇒ NO ROWS, NO MAIN-THREAD READ, said ONCE a process (the history worker refuses by its heap bound — a real road)
  const DN = CWD + '/none/', warns = [];
  helper('a08', 'toolu_T8', 'Refused one', { mb: 0.05, writes: [{ atMb: 0.01, file: DN + 'one.md' }] });
  helper('a09', 'toolu_T9', 'Refused two', { mb: 0.05, writes: [{ atMb: 0.01, file: DN + 'two.md' }] });
  const unreadBefore = REG.helperReadStats().unread;
  C._setHistoryHeapMbForTest(1);
  let S8 = null;
  const nReads = await mainReads(async () => {
    S8 = mk('B4'); REG.configure({ activeSessions: () => new Map([['B4', S8]]), log: { log() {}, warn: (m) => warns.push(String(m)) } });
    for (const r of [use('toolu_T8', 'Agent', { description: 'Refused one', prompt: 'go', subagent_type: 'general-purpose' }, 66), ends('toolu_T8', 'a08', 67), use('toolu_T9', 'Agent', { description: 'Refused two', prompt: 'go', subagent_type: 'general-purpose' }, 68), ends('toolu_T9', 'a09', 69)]) REG.observe(S8, r);
    await REG.helperSettled(S8);
  });
  C._setHistoryHeapMbForTest(768);
  REG.configure({ activeSessions: () => new Map(), log: quiet });
  const notDerived = warns.filter((w) => /a helper's rows were not derived/.test(w));
  ok(!Object.keys(rows(S8)).length && nReads.length === 0 && REG.helperReadStats().unread === unreadBefore + 2 && notDerived.length === 1 && gateOf(/heap bound/.test(notDerived[0])) && verdictOf(/none is read on it/.test(notDerived[0])),
    'the history worker refusing (its heap bound): the two helpers\' rows are NOT derived, nothing is read on the main thread, and the log says why ONCE', { rows: Object.keys(rows(S8)), reads: nReads, warns });
  const agentUse = (tuid, desc, s0) => use(tuid, 'Agent', { description: desc, prompt: 'go', subagent_type: 'general-purpose' }, s0);
  // (d2) a read that failed is read AGAIN at the next rebuild (a null is never kept as «nothing found»)
  const R8 = mk('B4r', { _normalizer: null, _artifacts: null });
  await N.rebuildHistory(R8, 'B4r', [agentUse('toolu_T8', 'Refused one', 66), ends('toolu_T8', 'a08', 67), agentUse('toolu_T9', 'Refused two', 68), ends('toolu_T9', 'a09', 69)]);
  ok(gateOf(rows(R8)[':' + DN + 'one.md']) && verdictOf(rows(R8)[':' + DN + 'two.md']), 'the two refused helpers are read again at the next rebuild, the worker answering now: their rows', shape(rows(R8)));

  // (e) 主开发 r604 ①: a person's PAGED history read keeps its pages while a helper is read beside it (the worker's own «helper» slot)
  const PF = path.join(HOME, 'person-history.jsonl');
  fs.writeFileSync(PF, Array.from({ length: 3000 }, (_, i) => JSON.stringify({ type: 'assistant', uuid: 'h' + i, message: { role: 'assistant', content: [{ type: 'text', text: 'line ' + i }] } })).join('\n') + '\n');
  const beside = async (reg, aid) => {
    const tuid = 'toolu_P' + aid, desc = 'Beside ' + aid;
    helper(aid, tuid, desc, { mb: 0.05, writes: [{ atMb: 0.01, file: CWD + '/beside/' + aid + '.md' }] });
    const st0 = C.pagedReadStats();
    const person = C.readJsonlBoundedParsedPagedAsync(PF, { page: 10 }); // 300 pages, the history slot
    for (let k = 0; k < 100000 && C.pagedReadStats().pages < st0.pages + 3; k++) await new Promise((r) => setImmediate(r)); // the person's read is under way
    const s = await liveOf(reg, 'P' + aid, [agentUse(tuid, desc, 70), ends(tuid, aid, 71)]);
    const recs = await person, st1 = C.pagedReadStats();
    return { records: recs && recs.length, gone: st1.gone - st0.gone, oneShot: st1.oneShot - st0.oneShot, row: !!rows(s)[':' + CWD + '/beside/' + aid + '.md'] };
  };
  const MP = M.load('src/server/artifact-registry.js', anchored(fs.readFileSync(path.join(REPO, 'src/server/artifact-registry.js'), 'utf8'), "{ tailOnly: false, slot: 'helper', note: false, onFail: (w) => { why = w; } }", /* stale-pins: kept — the control's PLANT (a helper read in the history slot), not a pin */ "{ tailOnly: false, note: false, onFail: (w) => { why = w; } }", 'a helper read without its slot'), 'noslot');
  const bOwn = await beside(REG, 'a10'), bShared = await beside(MP, 'a11');
  REG.configure({ activeSessions: () => new Map(), log: quiet }); // the copy's configure pointed the rebuild's helper seam at itself — the real one again
  ok(bOwn.records === 3000 && bOwn.gone === 0 && bOwn.oneShot === 0 && gateOf(bOwn.row) && bShared.gone >= 1 && verdictOf(bShared.row),
    'a person\'s 300-page history read beside a helper\'s read keeps every page (no snapshot gone, no one-shot read); CONTROL a helper read in the history slot cuts it (gone)', { own: bOwn, shared: bShared });

  // (f) 主开发 r604 ②: a conversation killed while its helper is read gets NO rows and NO save (its meta would come back holding only the rows)
  const killed = async (kill) => {
    const aid = kill ? 'a12' : 'a13', tuid = 'toolu_K' + aid, desc = 'Killed ' + aid;
    helper(aid, tuid, desc, { mb: 0.05, writes: [{ atMb: 0.01, file: CWD + '/killed/' + aid + '.md' }] });
    const s = mk('K' + aid, { sockName: 'cw-k' + aid }), live = new Map([['sess-k' + aid, s]]), writes = [];
    REG.configure({ activeSessions: () => live, sessionMeta: () => ({ readSessionMeta: () => null, writeSessionMeta: (n) => writes.push(n) }), log: quiet });
    for (const r of [agentUse(tuid, desc, 72), ends(tuid, aid, 73)]) REG.observe(s, r);
    if (kill) setImmediate(() => live.delete('sess-k' + aid)); // killed while its read is in flight
    await REG.helperSettled(s);
    const timer = !!s._artifactsTimer; clearTimeout(s._artifactsTimer);
    REG.configure({ activeSessions: () => new Map(), sessionMeta: null, log: quiet });
    return { rows: Object.keys(rows(s)).length, saveDue: timer, writes: writes.length };
  };
  const kOn = await killed(true), kOff = await killed(false);
  ok(kOn.rows === 0 && !kOn.saveDue && kOn.writes === 0 && kOff.rows === 1 && verdictOf(kOff.saveDue), 'a conversation killed while its helper\'s read is in flight: no row, no save due; CONTROL the one still standing gets its row and its save', { killed: kOn, standing: kOff });

  // (g) 主开发 r604 ③: the rebuild's prefetch is BOUNDED — the history opens, what it left is said and read on; the next open folds it
  for (const [aid, nm] of [['a14', 'one'], ['a15', 'two']]) helper(aid, 'toolu_B' + aid, 'Bounded ' + nm, { mb: 0.05, writes: [{ atMb: 0.01, file: CWD + '/bounded/' + nm + '.md' }] });
  const TB = [agentUse('toolu_Ba14', 'Bounded one', 74), ends('toolu_Ba14', 'a14', 75), agentUse('toolu_Ba15', 'Bounded two', 76), ends('toolu_Ba15', 'a15', 77)];
  const told = [], s0 = REG.helperReadStats();
  fs.appendFileSync(FL, '\n'); // the 34.5 MB helper changed: its read (hundreds of ms in the worker) holds the one helper-read turn
  const busy = liveOf(REG, 'BBusy', T7);
  await new Promise((r) => setTimeout(r, 20)); // its read is in the turn now: the prefetch's two wait behind it
  REG.configure({ activeSessions: () => new Map(), log: { log: (m) => told.push(String(m)), warn() {} } });
  REG._setHelperPrefetchMsForTest(1);
  const RB1 = mk('BB1', { _normalizer: null, _artifacts: null });
  await N.rebuildHistory(RB1, 'BB1', TB);
  REG._setHelperPrefetchMsForTest(60000); // the next open waits for what is left (a slow machine's long read never cuts this leg)
  await busy;
  const RB2 = mk('BB2', { _normalizer: null, _artifacts: null });
  await N.rebuildHistory(RB2, 'BB2', TB);
  REG._setHelperPrefetchMsForTest(2000);
  const s1 = REG.helperReadStats();
  REG.configure({ activeSessions: () => new Map(), log: quiet });
  const B1 = CWD + '/bounded/';
  ok(!rows(RB1)[':' + B1 + 'one.md'] && !rows(RB1)[':' + B1 + 'two.md'] && s1.left - s0.left === 2 && gateOf(told.some((m) => /the history opened before 2 of 2 helper transcripts were read/.test(m))) && gateOf(rows(RB2)[':' + B1 + 'one.md']) && gateOf(rows(RB2)[':' + B1 + 'two.md']) && s1.read - s0.read === 3,
    'a rebuild whose prefetch wait is spent (behind a long helper read) opens without the two helpers\' rows and SAYS it; their reads go on — the next open folds both, each file read once (three reads with the long one)', { first: shape(rows(RB1)), second: shape(rows(RB2)), left: s1.left - s0.left, reads: s1.read - s0.read, told });

  // (h) THE REBUILD'S FOLD, PACED (B-299b, the member after A6 — 主开发 r604 / r648 / r751): ONE Task end bringing 1 200 helper writes
  // (700 past the 500-row cap, ~1 ms a new row there: far over the 20 ms line) folds in loop turns, then the parent's own Edit of one
  // of them. THE LOOP GETS ITS TURNS — counted, not timed (a fast leg judges no wall clock): an immediate that re-arms itself counts the
  // turns that ran WHILE that record folded; CONTROL a copy with the yield removed (the async wrapper kept) ⇒ 0 turns. The rows, the cards
  // and every message's place = the UNPACED fold's (a copy with the pacing off), which answered the conversion no promise.
  const DH = CWD + '/heavy/', HW = 1200;
  fs.writeFileSync(path.join(SUB, 'agent-a16.jsonl'), Array.from({ length: HW }, (_, i) => JSON.stringify(side('a16', `toolu_H16_${i}`, 'Write', { file_path: DH + `f${i}.md`, content: 'x' }, 2))).join('\n') + '\n');
  fs.writeFileSync(path.join(SUB, 'agent-a16.meta.json'), JSON.stringify({ agentType: 'general-purpose', description: 'Heavy writer', toolUseId: 'toolu_T16' }));
  const TH = [agentUse('toolu_T16', 'Heavy writer', 80), ends('toolu_T16', 'a16', 81), use('toolu_E16', 'Edit', { file_path: DH + `f${HW - 1}.md`, old_string: 'x', new_string: 'y' }, 82)];
  const MWP = require(path.join(REPO, 'src/message-window.js')).MessageWindow.prototype, realConvert = MWP.convertHistoryAsync;
  let thenables = 0, turns = 0, foldTurns = [];
  MWP.convertHistoryAsync = function (records, opts = {}) {
    const br = opts && opts.beforeRecord;
    return realConvert.call(this, records, br ? { ...opts, beforeRecord: (r) => { const p = br(r); if (p && typeof p.then === 'function') { thenables++; const at0 = turns; return p.then((v) => { foldTurns.push(turns - at0); return v; }); } return p; } } : opts);
  };
  const counting = async (run) => { let on = true; thenables = 0; foldTurns = []; const spin = () => { if (!on) return; turns++; setImmediate(spin); }; setImmediate(spin); try { await run(); } finally { on = false; } return { thenables, turns: foldTurns.reduce((a, b) => a + b, 0) }; };
  const factsOf = (sx) => ({ rows: JSON.stringify(Object.values(rows(sx)).sort((x, y) => String(x.key).localeCompare(String(y.key)))), order: sx._normalizer.messages.map((m) => m.id).join(), cards: sx._normalizer.messages.filter((m) => m.noticeKind === 'artifact').length });
  const NSRC = fs.readFileSync(path.join(REPO, 'src/normalizers.js'), 'utf8');
  const copyOf = (anchor, to, name, tag) => { const C2 = M.load('src/normalizers.js', anchored(NSRC, anchor, to, name), tag); C2.setArtifactHelperSource(REG.helperOps, REG.helperPrefetch); return C2; };
  let paced = null, unpaced = null, cP = null, cU = null, cY = null;
  try {
    const RP = mk('BH', { _normalizer: null, _artifacts: null }); cP = await counting(() => N.rebuildHistory(RP, 'BH', TH)); paced = factsOf(RP);
    const MU = copyOf('const DERIVE_PACED = 64,', 'const DERIVE_PACED = Infinity,', 'the derivation unpaced', 'unpaced');
    const RU = mk('BH', { _normalizer: null, _artifacts: null }); cU = await counting(() => MU.rebuildHistory(RU, 'BH', TH)); unpaced = factsOf(RU);
    const MY = copyOf('if (Date.now() - t0 >= DERIVE_TURN_MS) { await new Promise((r) => setImmediate(r)); t0 = Date.now(); }', /* stale-pins: kept — the control's PLANT (the yield removed), not a pin */ 'if (Date.now() - t0 >= DERIVE_TURN_MS) { t0 = Date.now(); }', 'the paced fold without its yield', 'noyield');
    const RY = mk('BH', { _normalizer: null, _artifacts: null }); cY = await counting(() => MY.rebuildHistory(RY, 'BH', TH));
  } finally { MWP.convertHistoryAsync = realConvert; }
  const heavyRows = paced ? JSON.parse(paced.rows) : [];
  ok(cP.thenables === 1 && cP.turns >= 3 && cY.thenables === 1 && cY.turns === 0 && cU.thenables === 0,
    'a rebuild of ONE end bringing 1 200 helper writes folds them PACED: the loop got turns while that record folded (counted); CONTROL the yield removed ⇒ 0 turns (the async wrapper alone holds the loop), the pacing off ⇒ no promise', { paced: cP, noYield: cY, unpaced: cU });
  ok(paced.rows === unpaced.rows && paced.order === unpaced.order && heavyRows.length === 500 && verdictOf(heavyRows.some((r) => r.path === DH + `f${HW - 1}.md` && r.writes === 1 && r.edits === 1 && r.lastOp === 'edit')),
    '…and every row field, every card and every message\'s place = the unpaced fold\'s — 500 rows (the cap), the parent\'s later Edit on its row', { rows: heavyRows.length, cards: paced.cards, sameRows: paced.rows === unpaced.rows, sameOrder: paced.order === unpaced.order });

  // (i) 主开发 r751: a fold that THROWS midway is SAID — one journal line naming the record it was folding — and the conversion goes on
  fs.writeFileSync(path.join(SUB, 'agent-a17.jsonl'), Array.from({ length: 100 }, (_, i) => JSON.stringify(side('a17', `toolu_H17_${i}`, 'Write', { file_path: CWD + `/broken/${i === 70 ? 'boom' : 'f' + i}.md`, content: 'x' }, 2))).join('\n') + '\n');
  fs.writeFileSync(path.join(SUB, 'agent-a17.meta.json'), JSON.stringify({ agentType: 'general-purpose', description: 'Broken writer', toolUseId: 'toolu_T17' }));
  const TE = [agentUse('toolu_T17', 'Broken writer', 90), ends('toolu_T17', 'a17', 91), use('toolu_E17', 'Write', { file_path: CWD + '/broken/after.md', content: 'z' }, 92)];
  const MBR = copyOf('  function applyOp(raw, o) {\n', "  function applyOp(raw, o) {\n    if (String(o.path || '').endsWith('/boom.md')) throw new Error('planted fold error');\n", 'a fold that throws', 'foldthrows');
  const errsI = [], realErrI = console.error; console.error = (...x) => errsI.push(x.join(' '));
  const RE = mk('BE', { _normalizer: null, _artifacts: null });
  try { await MBR.rebuildHistory(RE, 'BE', TE); } finally { console.error = realErrI; }
  const saidI = errsI.filter((m) => /the step before a record failed during history rebuild/.test(m));
  ok(saidI.length === 1 && gateOf(saidI[0].includes('rtoolu_T17')) && gateOf(saidI[0].includes('planted fold error')) && gateOf(rows(RE)[':' + CWD + '/broken/f0.md']) && !rows(RE)[':' + CWD + '/broken/f99.md'] && verdictOf(rows(RE)[':' + CWD + '/broken/after.md']),
    'a paced fold that throws midway: ONE journal line naming the record it was folding (its uuid) and why; the ops before it stand, its later ones are lost, the NEXT record still folds', { said: saidI, rows: Object.keys(rows(RE)).length });

  // (j) B-360d (主开发 r1206 — the artifact registry's fold over a helper's transcript, the LIVE door): EVERY PACED STRETCH STARTS ON
  // A LOOP ITERATION OF ITS OWN. MEASURED on the release (probe runs 70db1a0a8-20261121120046-box and 7f71e6078-…-box, never lined):
  // one dense 34 MB helper held the loop 71 ms in one turn — the per-record hook loop began in the iteration that received the read's
  // last page, the rows in the iteration of the hook's last slice, each with a FRESH 20 ms budget. COUNTED, not timed (a fast leg
  // judges no wall clock): an immediate that re-arms itself counts the CHECK PHASES; the read's last page lands in a POLL phase, so
  // one setImmediate from there still runs in that SAME iteration (no timer between — the round's must): the first hook call is TWO
  // check phases after the read's end; the first row's apply at least one after the last hook call; the rows the same. CONTROLS:
  // a single hop ⇒ ONE (the same iteration); the two yields removed ⇒ the same phases.
  const RSRC = fs.readFileSync(path.join(REPO, 'src/server/artifact-registry.js'), 'utf8');
  {
    const DJ = CWD + '/turns/';
    helper('a18', 'toolu_T18', 'Turn taker', { mb: 0.3, writes: Array.from({ length: 40 }, (_, i) => ({ atMb: 0.005 * i, file: DJ + `f${i}.md` })) });
    const TJ = [agentUse('toolu_T18', 'Turn taker', 100), ends('toolu_T18', 'a18', 101)];
    const Hc = require(path.join(REPO, 'src/harnesses')).harnessOf('claude');
    const turnsOf = async (reg, id) => {
      let turns = 0, on = true; const spin = () => { if (!on) return; turns++; setImmediate(spin); };
      const realRead = C.readJsonlBoundedParsedPagedAsync, realHook = Hc.artifactsOf, realApply = AF.apply;
      const at = { read: null, firstHook: null, lastHook: null, firstApply: null };
      C.readJsonlBoundedParsedPagedAsync = function (...a) { return realRead.apply(this, a).then((v) => { if (at.read == null) at.read = turns; return v; }); };
      Hc.artifactsOf = function (...a) { if (at.read != null && at.firstApply == null) { if (at.firstHook == null) at.firstHook = turns; at.lastHook = turns; } return realHook.apply(this, a); };
      AF.apply = function (...a) { if (at.lastHook != null && at.firstApply == null) at.firstApply = turns; return realApply.apply(this, a); };
      setImmediate(spin);
      let s = null;
      try { s = await liveOf(reg, id, TJ); } finally { on = false; C.readJsonlBoundedParsedPagedAsync = realRead; Hc.artifactsOf = realHook; AF.apply = realApply; }
      return { ...at, rows: Object.keys(rows(s)).filter((k) => k.includes('/turns/')).length };
    };
    const real = await turnsOf(REG, 'BJ');
    const HOP2 = 'const loopTurn = () => new Promise((r) => setImmediate(() => { queueReset(); setImmediate(r); }));', HOP1 = 'const loopTurn = () => new Promise((r) => setImmediate(r));';
    const Y1 = "  try {\n    await pace.turn();\n    for (let i = 0; i < recs.length; i++) {\n", Y2 = "      const pace = pacer();\n      await pace.turn();\n";   // r1384: the hook's first turn now sits inside the read's try (its pacer ended in a finally)
    const MH = M.load('src/server/artifact-registry.js', anchored(RSRC, HOP2, HOP1, 'B-360d one hop'), 'b360d-onehop');
    const hop = MH ? await turnsOf(MH, 'BJh') : null;
    const MJ = M.load('src/server/artifact-registry.js', anchored(anchored(RSRC, Y1, "  try {\n    for (let i = 0; i < recs.length; i++) {\n", 'B-360d the hook\'s yield'), Y2, "      const pace = pacer();\n", 'B-360d the rows\' yield'), 'b360d-noyield');
    const ctl = MJ ? await turnsOf(MJ, 'BJm') : null;
    REG.configure({ activeSessions: () => new Map(), log: quiet });   // the copies' configure pointed the seams at themselves — the real one again
    ok(real.read != null && real.firstHook - real.read >= 2 && real.firstApply - real.lastHook >= 1 && real.rows === 40,
      'B-360d: the live helper fold\'s paced stretches each start on a loop ITERATION of their own — the first hook call two check phases after the read\'s end (a timer phase between), the first row\'s apply after the last hook call\'s; its 40 rows', real);
    ok(!!hop && hop.read != null && hop.firstHook - hop.read === 1 && hop.rows === 40, 'CONTROL one hop (a single setImmediate from the read\'s poll phase): the hook starts ONE check phase later — in the very iteration that received the page — the leg above can tell', hop);
    ok(!!ctl && ctl.read != null && ctl.firstHook === ctl.read && ctl.firstApply === ctl.lastHook && ctl.rows === 40,
      'CONTROL the two yields removed (its rows the same 40): the hook starts in the read\'s own turn and the rows in the hook\'s last', ctl);
  }
  // (k) B-360d (its read's shoulds): THE BUDGET IS ASKED BEFORE EVERY OP, AND IT IS SHARED. A clock the leg advances by 25 ms (over the
  // 20 ms budget) on every helper op noted: at most ONE op lands in any loop iteration; CONTROL a check per 16-op chunk ⇒ 16 in one.
  // Two pacers resumed in ONE check phase: the second sees the first one's work — due at once; CONTROL a budget per pacer ⇒ not due.
  {
    const DK = CWD + '/budget/';
    helper('a19', 'toolu_T19', 'Budget one', { mb: 0.05, writes: Array.from({ length: 40 }, (_, i) => ({ atMb: 0.001 * i, file: DK + `a${i}.md` })) });
    const TK = [agentUse('toolu_T19', 'Budget one', 110), ends('toolu_T19', 'a19', 111)];
    const perIteration = async (reg, id) => {
      let turns = 0, on = true, t = 1e12; const spin = () => { if (!on) return; turns++; setImmediate(spin); };
      const realApply = AF.apply, byTurn = new Map();
      let s = null;
      try {
        reg._setHelperClockForTest(() => t);
        AF.apply = function (rowsX, op) { if (op && op.via) { byTurn.set(turns, (byTurn.get(turns) || 0) + 1); t += 25; } return realApply.call(this, rowsX, op); };
        setImmediate(spin);
        s = await liveOf(reg, id, TK);
      } finally { on = false; AF.apply = realApply; reg._setHelperClockForTest(null); }
      await new Promise((r) => setImmediate(() => setImmediate(r)));   // the budget's reset runs before the next leg (the leg's clock is gone)
      return { max: Math.max(0, ...byTurn.values()), ops: [...byTurn.values()].reduce((x, y) => x + y, 0), rows: Object.keys(rows(s)).filter((k) => k.includes('/budget/')).length };
    };
    const pk = await perIteration(REG, 'BK');
    const PER_OP = "        for (const op of ops) {   // the budget is asked before EACH op (one past the rows' cap costs ~1.1 ms: a 16-op chunk overran it)\n          if (pace.due()) { await pace.turn(); if (!stands(session)) return; }\n          noteOps(session, [op]);\n        }\n";
    const MC = M.load('src/server/artifact-registry.js', anchored(RSRC, PER_OP, "        if (pace.due()) { await pace.turn(); if (!stands(session)) return; }\n        if (ops.length) noteOps(session, ops);\n", 'B-360d the budget per chunk'), 'b360d-perchunk');
    const pc = MC ? await perIteration(MC, 'BKc') : null;
    REG.configure({ activeSessions: () => new Map(), log: quiet });
    ok(pk.ops === 40 && pk.max === 1 && pk.rows === 40, 'B-360d: the rows\' budget is asked before EVERY op — an op that spends the whole budget (the leg\'s clock) lands ALONE in its loop iteration; 40 ops, 40 rows', pk);
    ok(!!pc && pc.max === 16 && pc.rows === 40, 'CONTROL the budget asked per 16-op chunk: 16 such ops land in ONE iteration — the leg above can tell', pc);
    // THE SHARED BUDGET: two pacers whose turns were asked together resume in ONE check phase; the first spends the budget
    const sharedOf = async (reg) => {
      let t = 2e12, turns = 0, on = true; const spin = () => { if (!on) return; turns++; setImmediate(spin); };
      try {
        reg._setHelperClockForTest(() => t); setImmediate(spin);
        const P = reg._pacerForTest, p1 = P(), p2 = P();
        let at1 = null, at2 = null;
        await Promise.all([p1.turn().then(() => { at1 = turns; t += 25; }), p2.turn().then(() => { at2 = turns; })]);
        return { at1, at2 };
      } finally { on = false; reg._setHelperClockForTest(null); await new Promise((r) => setImmediate(() => setImmediate(r))); }
    };
    const sh = await sharedOf(REG);
    const OWN = "  const due = () => _helperClock() - _turnT0 >= bgBudget();\n";
    const MP = M.load('src/server/artifact-registry.js', anchored(RSRC, OWN, "  const due = () => _helperClock() - mine >= bgBudget();\n", 'B-360d a budget per pacer'), 'b360d-perpacer');
    const shc = MP ? await sharedOf(MP) : null;
    ok(sh.at1 != null && sh.at2 > sh.at1, 'B-360d: the budget is SHARED — of two pacers whose turns resumed in one check phase, the second finds the first one\'s spend and does no unit there: it returns a later iteration (no forced unit)', sh);
    ok(!!shc && shc.at2 === shc.at1, 'CONTROL a budget per pacer: the second takes a fresh budget in the same check phase — the leg above can tell', shc);
    // NO FOLD STARVES BEHIND ANOTHER (its read's should): two stretches of 40 units of 5 ms each (4 to a budget), side by side — a
    // slice cut short by the other's spend resumes one iteration sooner, so they take the iterations in turn: when the first ends,
    // the second is (nearly) done too; CONTROL every turn a whole iteration ⇒ the second does one forced unit per two iterations
    const fairOf = async (reg) => {
      let t = 3e12;
      try {
        reg._setHelperClockForTest(() => t);
        const P = reg._pacerForTest, done = { a: 0, b: 0 };
        const run = async (k, p) => { await p.turn(); for (let i = 0; i < 40; i++) { if (p.due()) await p.turn(); t += 5; done[k]++; } };
        let bAtAEnd = null;
        await Promise.all([run('a', P()).then(() => { bAtAEnd = done.b; }), run('b', P())]);
        return { bAtAEnd, b: done.b };
      } finally { reg._setHelperClockForTest(null); await new Promise((r) => setImmediate(() => setImmediate(r))); }
    };
    const fr = await fairOf(REG);
    const SHORT = "        const short = resumed && _helperClock() - mine < bgBudget() / 2;\n        if (short) { queueReset(); await oneHop(); } else await loopTurn();\n";
    const MF = M.load('src/server/artifact-registry.js', anchored(RSRC, SHORT, "        await loopTurn();\n", 'B-360d no turn taking'), 'b360d-nofair');
    const frc = MF ? await fairOf(MF) : null;
    ok(fr.b === 40 && fr.bAtAEnd >= 30, 'B-360d: two folds side by side take the loop\'s iterations IN TURN — when the first of two 40-unit stretches ends, the second has done ≥ 30 of its own', fr);
    ok(!!frc && frc.bAtAEnd < 20, 'CONTROL every turn a whole iteration (no turn taking): the second stretch only crawls behind the first — the leg above can tell', frc);
    // (l) 主开发 r1339 — A PERSON'S ASK GOES BEFORE BACKGROUND FOLDS: TWENTY folds in flight and one person's WALK (the stretch a
    // history open awaits: the rebuild's prefetch walk is a foreground pacer) — the walk's units an iteration, counted: its own share of
    // every iteration (≈ 10 units of 1 ms), and an iteration's total stays one budget (+ one unit of each); RED: the walk as a background
    // stretch (the tip before this rule) crawls — under one unit an iteration
    const fgOf = async (reg, walks = 1) => {
      let t = 4e12, turns = 0, on = true; const spin = () => { if (!on) return; turns++; setImmediate(spin); };
      try {
        reg._setHelperClockForTest(() => t); setImmediate(spin);
        const P = reg._pacerForTest, total = new Map();
        let bgLeft = 20, start = null, firstTen = 0, fgUnits = 0;
        const bg = async () => { const p = P(); try { await p.turn(); for (let i = 0; i < 30; i++) { if (p.due()) await p.turn(); t += 2; total.set(turns, (total.get(turns) || 0) + 2); } } finally { p.end(); bgLeft--; } };
        const fg = async () => { if (start == null) start = turns; const p = P({ foreground: true }); try { await p.turn(); for (let i = 0; i < 400 && bgLeft > 0; i++) { if (p.due()) await p.turn(); if (bgLeft <= 0) break; t += 1; fgUnits++; if (turns < start + 10) firstTen++; total.set(turns, (total.get(turns) || 0) + 1); } } finally { p.end(); } };
        await Promise.all([...Array.from({ length: 20 }, bg), ...Array.from({ length: walks }, fg)]);
        return { firstTen, fgUnits, maxTotal: Math.max(0, ...total.values()) };
      } finally { on = false; reg._setHelperClockForTest(null); await new Promise((r) => setImmediate(() => setImmediate(r))); }
    };
    const fgr = await fgOf(REG);
    const MW = M.load('src/server/artifact-registry.js', anchored(RSRC, '  if (foreground) {\n', '  if (false) {\n', 'B-360d the walk as background'), 'b360d-walk-bg');
    const fgc = MW ? await fgOf(MW) : null;
    ok(fgr.firstTen >= 50 && fgr.maxTotal <= 23, 'B-360d (r1339): a person\'s WALK beside TWENTY background folds keeps its own share of every iteration — ≥ 50 units of 1 ms in its first ten iterations — and an iteration\'s total stays one budget (≤ 20 ms + one unit of each)', fgr);
    ok(!!fgc && fgc.firstTen < 20, 'RED — the walk as a background stretch (the tip before this rule): it waits behind the twenty folds — under 20 units in its first ten iterations — the leg above goes red there', fgc);
    // ITS READ'S MUST: THREE walks at once (three windows re-attached) share ONE foreground share — an iteration still holds one budget;
    // RED: a share per walk (the first cut of this rule) — three walks hold 30 ms beside the background's 10
    const fg3 = await fgOf(REG, 3);
    const PERWALK = "    const fgDue = () => _helperClock() - _fgT0 >= FG_TURN_MS;\n";
    const MPW = M.load('src/server/artifact-registry.js', anchored(RSRC, PERWALK, "    const fgDue = () => _helperClock() - mine >= FG_TURN_MS;\n", 'B-360d a share per walk'), 'b360d-perwalk');
    const fg3c = MPW ? await fgOf(MPW, 3) : null;
    ok(fg3.firstTen >= 50 && fg3.maxTotal <= 23, 'B-360d: THREE walks beside the twenty folds share ONE foreground share — ≥ 50 walk units in their first ten iterations, and no iteration over one budget (≤ 20 ms + one unit of each)', fg3);
    ok(!!fg3c && fg3c.maxTotal >= 30, 'RED — a share per walk: three walks hold ≥ 30 ms of one iteration beside the background — the leg above goes red there', fg3c);
  }
  // (l2) r1384 (1) — THE PREFETCH's READS RIDE THE PERSON's SHARE: a history open awaits them (inside its 2 s bound), so once a helper's
  // read is in, its slices run as FOREGROUND — the person's share is live while they run (never a crawl behind two live folds);
  // RED: the reads in the background's share (the tip before this small)
  {
    const readShareOf = async (reg, aid) => {
      reg.configure({ activeSessions: () => new Map(), log: quiet });
      helper(aid, 'toolu_' + aid, 'Prefetch ' + aid, { mb: 0.2, writes: [{ atMb: 0.1, file: CWD + '/pf/' + aid + '.md' }] });
      const s = mk('PF' + aid), realRead = C.readJsonlBoundedParsedPagedAsync, seen = [];
      let after = false, on = true;
      C.readJsonlBoundedParsedPagedAsync = function (...x) { return realRead.apply(this, x).then((v) => { after = true; return v; }); };
      const spin = () => { if (!on) return; if (after) seen.push(reg._helperShareForTest().fgLive); setImmediate(spin); };
      let r = null;
      try { setImmediate(spin); r = await reg.helperPrefetch(s, [agentUse('toolu_' + aid, 'Prefetch ' + aid, 140), ends('toolu_' + aid, aid, 141)]); if (r && r.done) await r.done; }
      finally { on = false; C.readJsonlBoundedParsedPagedAsync = realRead; }
      return { read: !!(r && r.ops && r.ops.size === 1), fgSeen: seen.some((x) => x > 0), samples: seen.length };
    };
    const rs = await readShareOf(REG, 'pf1');
    const READ_FG = "  const out = [], pace = pacer({ foreground: !!(fg && fg.on) });";
    const MBG = M.load('src/server/artifact-registry.js', anchored(RSRC, READ_FG, '  const out = [], pace = pacer();', 'r1384 the reads in the background share'), 'r1384-read-bg');   // the control writes the reads' old pacer back on purpose — stale-pins: kept
    const rsc = MBG ? await readShareOf(MBG, 'pf2') : null;
    REG.configure({ activeSessions: () => new Map(), log: quiet });
    ok(gateOf(rs.read) && gateOf(rs.fgSeen) && rs.samples > 0, 'r1384 (1): the rebuild\'s prefetch READS a helper and its slices take the PERSON\'s share (the foreground share is live while they run)', rs);
    ok(!!rsc && gateOf(rsc.read) && !rsc.fgSeen, 'CONTROL the reads in the background\'s share (the tip before): no foreground share while they run — the leg above can tell', rsc);
  }
  // (m) THE ROWS' ORDER AND THE LAST ROW = the unpaced fold's (the round: counted, never compared) — 600 writes past the 500-row cap,
  // every row's fields but its instants; CONTROL a copy that tags each chunk backwards ⇒ the order differs (the compare can fail)
  {
    const DM = CWD + '/order/';
    helper('a21', 'toolu_T21', 'Order keeper', { mb: 0.2, writes: Array.from({ length: 600 }, (_, i) => ({ atMb: 0.0003 * i, file: DM + `f${i}.md` })) });
    const TM = [agentUse('toolu_T21', 'Order keeper', 120), ends('toolu_T21', 'a21', 121)];
    const factsM = (sx) => { const r = rows(sx), ks = Object.keys(r).filter((k) => k.includes('/order/')); return { n: ks.length, keys: ks.join('|'), last: ks[ks.length - 1], rows: JSON.stringify(ks.map((k) => { const { firstAt: _f, lastAt: _l, ...x } = r[k]; return x; })) }; };
    const sM = await liveOf(REG, 'BM', TM);
    const MU = M.load('src/server/artifact-registry.js', anchored(RSRC, 'const HELPER_TURN_MS = 20,', 'const HELPER_TURN_MS = Infinity,', 'B-360d the pacing off'), 'b360d-unpaced');
    const sU = MU ? await liveOf(MU, 'BMu', TM) : null;
    const MV = M.load('src/server/artifact-registry.js', anchored(RSRC, 'helperTagged(session, list.slice(i, i + HELPER_NOTE_CHUNK), via, state, at)', 'helperTagged(session, list.slice(i, i + HELPER_NOTE_CHUNK).reverse(), via, state, at)', 'B-360d each chunk backwards'), 'b360d-backwards');
    // ITS READ'S SHOULD: the RELEASE's own rows loop (the whole list tagged at once, noted 16 ops at a time) as the second reference
    const ROWS_NOW = RSRC.slice(RSRC.indexOf("      if (!list || !list.length) continue;\n"), RSRC.indexOf("    }\n  }).catch((e) => { deps.log.warn?.(`[artifacts] a helper's rows failed"));
    const ROWS_REL = "      const ops = list && list.length ? helperTagged(session, list, via, state, at) : [], pace = pacer();\n      for (let i = 0; i < ops.length; i += HELPER_NOTE_CHUNK) { if (pace.due()) await pace.turn(); if (!stands(session)) return; noteOps(session, ops.slice(i, i + HELPER_NOTE_CHUNK)); }\n";
    const MREL = ROWS_NOW.length > 200 ? M.load('src/server/artifact-registry.js', anchored(RSRC, ROWS_NOW, ROWS_REL, 'B-360d the release\'s rows loop'), 'b360d-release-rows') : null;
    const sRel = MREL ? await liveOf(MREL, 'BMrel', TM) : null;
    const sV = MV ? await liveOf(MV, 'BMv', TM) : null;
    REG.configure({ activeSessions: () => new Map(), log: quiet });
    const fa = factsM(sM), fu = sU ? factsM(sU) : null, fv = sV ? factsM(sV) : null, fr = sRel ? factsM(sRel) : null;
    ok(fa.n === 500 && !!fu && !!fr && fa.keys === fu.keys && fa.last === fu.last && fa.rows === fu.rows && fa.keys === fr.keys && fa.last === fr.last && fa.rows === fr.rows, 'B-360d: the rows\' ORDER, every row\'s fields and THE LAST ROW equal the unpaced fold\'s AND the release\'s own rows loop\'s — 600 helper writes past the 500-row cap', { n: fa.n, last: fa.last, sameKeys: !!fu && fa.keys === fu.keys, sameRows: !!fu && fa.rows === fu.rows, release: !!fr && fa.keys === fr.keys && fa.rows === fr.rows });
    ok(!!fv && fv.keys !== fu.keys, 'CONTROL each chunk tagged backwards: the rows\' order differs — the compare above can fail', { same: !!fv && !!fu && fv.keys === fu.keys });
  }
  // (n) A CONVERSATION REMOVED BETWEEN THE NEW HOPS (as its helper's read ends, before the rows' first iteration) gets NO row and NO
  // save — the stands() after the rows' first turn; RED: a copy without it notes the rows
  {
    const goneOf = async (reg, aid) => {
      helper(aid, 'toolu_' + aid, 'Gone ' + aid, { mb: 0.05, writes: [{ atMb: 0.01, file: CWD + '/gone/' + aid + '.md' }] });
      const s = mk('G' + aid, { sockName: 'cw-g' + aid }), live = new Map([['sess-g' + aid, s]]), writes = [];
      reg.configure({ activeSessions: () => live, sessionMeta: () => ({ readSessionMeta: () => null, writeSessionMeta: (n) => writes.push(n) }), log: quiet });
      const realRead = C.readJsonlBoundedParsedPagedAsync;
      C.readJsonlBoundedParsedPagedAsync = function (...x) { return realRead.apply(this, x).then((v) => { live.delete('sess-g' + aid); return v; }); };   // removed as the read ends: between the new hops
      try { for (const r of [agentUse('toolu_' + aid, 'Gone ' + aid, 130), ends('toolu_' + aid, aid, 131)]) reg.observe(s, r); await reg.helperSettled(s); }
      finally { C.readJsonlBoundedParsedPagedAsync = realRead; }
      const timer = !!s._artifactsTimer; clearTimeout(s._artifactsTimer);
      reg.configure({ activeSessions: () => new Map(), sessionMeta: null, log: quiet });
      return { rows: Object.keys(rows(s)).length, saveDue: timer, writes: writes.length };
    };
    const gn = await goneOf(REG, 'a22');
    const MG = M.load('src/server/artifact-registry.js', anchored(RSRC, '      await pace.turn();\n      if (!stands(session)) return;\n', '      await pace.turn();\n', 'B-360d no stands after the rows\' first turn'), 'b360d-nostands');
    const gc = MG ? await goneOf(MG, 'a23') : null;
    REG.configure({ activeSessions: () => new Map(), log: quiet });
    ok(gn.rows === 0 && !gn.saveDue && gn.writes === 0, 'B-360d: a conversation removed between the new hops (its helper\'s read ended, the rows not begun) gets NO row and NO save due', gn);
    ok(!!gc && gc.rows >= 1, 'RED — no stands() after the rows\' first turn: the gone conversation gets its row — the leg above goes red there', gc);
  }
}
console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
