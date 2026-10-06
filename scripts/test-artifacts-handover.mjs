#!/usr/bin/env node
// A HELPER'S DELIVERABLE REACHES THE USER THROUGH THE AGENT THE USER TALKS TO (lane artifacts-handover; owner 2026-10-06
// "一个 helper agent 做的 design 或者 artifact，能不能转移给上游主 agent 展示给用户"). ① a Task subagent's Write (its sidechain
// transcript, beside the parent's) is the PARENT's row with via.subagent — live at the Task result, the rebuild's parity, a
// streamed sidechain record never births a via-less row, a background agent read at launch AND end counts once, a workflow
// run's agent the same; ② the hand-over over the REAL registry + the REAL msg-acl: reachable ⇒ the receiver's rows + card
// (via.handover) + the helper's handedTo; a design re-registers under the receiver and opens; a stranger / a path the
// helper does not own / 21 items / another machine ⇒ refused by name; ③ the words; ④ patched-copy controls.
// Fixtures are invented (a scratch HOME). Run: node scripts/test-artifacts-handover.mjs
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const HOME = scratch('artifacts-handover-home');
process.env.HOME = HOME; // the sidechains live under THIS home's ~/.claude/projects (os.homedir reads $HOME)
const AF = require(path.join(REPO, 'src/artifacts.js'));
const N = require(path.join(REPO, 'src/normalizers.js'));
const REG = require(path.join(REPO, 'src/server/artifact-registry.js'));
const ACL = require(path.join(REPO, 'src/msg-acl.js'));
const HT = require(path.join(REPO, 'src/harnesses/helper-transcripts.js'));
const M = mutantCopies('artifacts-handover', REPO);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + JSON.stringify(e) : '')); } return !!c; };
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
  const row = (live._artifacts || {})[':' + BRIEF];
  ok(row && row.via && row.via.kind === 'subagent' && row.via.name === 'Draft the brief' && row.writes === 1 && row.edits === 1, 'the sidechain\'s Write + Edit ⇒ ONE parent row, via {subagent, "Draft the brief"}, counted once though the result was fed twice', row);
  const c = cards(live).find((b) => b.path === BRIEF);
  ok(c && c.via && c.via.name === 'Draft the brief' && AF.cardFacts(c).via.kind === 'subagent', 'the parent\'s chat gets the card at the Task result (its block carries via)', c);
  ok(live._artifacts[':' + CWD + '/tmp/scratch.py'] && !cards(live).some((b) => b.path.endsWith('.py')), 'the sidechain\'s code file is a row behind the chip\'s Code fold, never a card (the parent\'s rule)');
  const rb = mk('R1', { _normalizer: null, _artifacts: null });
  await N.rebuildHistory(rb, 'R1', TASK);
  ok(shape(rb._artifacts) === shape(live._artifacts), 'REPLAY PARITY: the rebuild over the parent transcript derives the same rows', { live: shape(live._artifacts), rebuild: shape(rb._artifacts) });
  const msgs = rb._normalizer.messages, ci = msgs.findIndex((m) => m.noticeKind === 'artifact' && m.content[0].path === BRIEF);
  ok(ci > 0 && msgs.slice(0, ci).some((m) => JSON.stringify(m).includes('the brief is written')), 'the rebuilt card sits AFTER the Task\'s result (where the live one was born)', ci);
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
  const r = bg._artifacts[':' + CWD + '/notes.md'];
  ok(r && r.writes === 1 && r.edits === 1 && r.via.name === 'Background notes', 'a background agent: read at its launch AND at its notification — each op counted once', r);
  const wf = mk('L4');
  REG.configure({ activeSessions: () => new Map([['L4', wf]]), log: quiet });
  agent(path.join(SUB, 'workflows', 'wf_demo1'), 'w01', { agentType: 'workflow-agent', description: 'review: tables' }, [side('w01', 'toolu_W1', 'Write', { file_path: CWD + '/review.md', content: 'r' }, 21)]);
  REG.observe(wf, res('toolu_WF', 20, 'Workflow launched. Run ID: wf_demo1'));
  ok(!Object.keys(wf._artifacts || {}).length, 'a workflow LAUNCH result reads nothing yet (it remembers the run)');
  REG.observe(wf, note('toolu_WF', 30));
  const w = wf._artifacts[':' + CWD + '/review.md'];
  ok(w && w.via && w.via.name === 'review: tables' && w.via.wf === 'wf_demo1', 'a workflow run\'s agent ⇒ the same rule at the run\'s notification (via names the agent + the run)', w);
  const remote = mk('L5', { host: 'gpu-box' });
  REG.configure({ activeSessions: () => new Map([['L5', remote]]), log: quiet });
  REG.observe(remote, TASK[1]);
  ok(!Object.keys(remote._artifacts || {}).length, 'a remote conversation reads no sidechain (its files are on its machine — none is fetched)');
  let reads = 0; const fsMod = require('fs'); const ex = fsMod.existsSync; fsMod.existsSync = (...x) => { reads++; return ex(...x); };
  const plain = HT.claude(res('toolu_BASH', 50, 'ls output'), { sessionId: SID, cwd: CWD, runs: new Map() });
  fsMod.existsSync = ex;
  ok(plain.length === 0 && reads === 0, 'an ordinary tool\'s result (no agentId) is answered [] without touching the disk', { reads });
  ok(HT.claude({ type: 'user', message: { content: 'hello' } }, {}).length === 0 && HT.claude(null).length === 0 && HT.claude(TASK[0], {}).length === 0, 'the helper door answers [] for a record that ends nothing');
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
  ok(r.ok && r.handed.length === 3 && !r.refused.length, 'reachable receiver ⇒ 3 items handed (a file, a design folder, a page link)', r);
  const rr = w.recv._artifacts || {};
  const doc = rr[':/opt/demo/helper/report.md'], des = rr[':' + DESIGN], page = Object.values(rr).find((x) => x.url === '/p/pg7');
  ok(doc && doc.kind === 'doc' && doc.via.kind === 'handover' && doc.via.from.cid === CH && doc.via.from.name === 'design desk' && doc.writes === 0, 'the receiver\'s row: same path + kind, via {handover, from: the helper} — a hand-over never counts as a write', doc);
  ok(des && des.kind === 'design' && page && page.kind === 'page' && page.state === 'published', 'the design is a design row, the page a page row (its link + state)', { des, page });
  const rc = cards(w.recv);
  ok(rc.length === 3 && rc.every((b) => b.via && b.via.kind === 'handover'), 'the receiver\'s chat gets one card per item, each saying who handed it over', rc.map((b) => b.name));
  ok(REG.listFor('r').count === 3, 'the receiver\'s Artifacts chip counts them', REG.listFor('r').count);
  ok((w.helper._artifacts[':/opt/demo/helper/report.md'].handedTo || [])[0].cid === CR && (w.helper._artifacts[':/opt/demo/helper/report.md'].handedTo || [])[0].name === 'coordinator', 'the helper\'s own row keeps handedTo {the receiver}', w.helper._artifacts[':/opt/demo/helper/report.md'].handedTo);
  ok(w.DE.calls.length === 1 && w.DE.calls[0].dir === DESIGN && w.DE.calls[0].sessionId === 'r' && w.DE.calls[0].conversationId === CR && w.DE.calls[0].via.cid === CH && w.DE.opened[0].sid === 'r',
    'the design re-registers in the Design window\'s registry under the RECEIVER (via the helper) and its window opens there', w.DE);
  const again = REG.handover({ from: { cid: CH, name: 'design desk', session: w.helper }, to: [CR], items: ['/opt/demo/helper/report.md'], reach: reachFrom(CH), at: 60 });
  ok(again.ok && Object.keys(w.recv._artifacts).length === 3 && cards(w.recv).length === 3, 'handing the same file over again patches the receiver\'s row — still one row, one card');
  const st = REG.handover({ from: { cid: CH, name: 'design desk', session: w.helper }, to: [CS], items: ['/opt/demo/helper/report.md'], reach: reachFrom(CH), at: 70 });
  ok(!st.ok && st.refused[0].why === 'unreachable' && st.refused[0].error.includes(CS) && !Object.keys(w.stranger._artifacts || {}).length, 'a conversation outside the helper\'s reach ⇒ refused by name, nothing lands', st);
  const no = REG.handover({ from: { cid: CH, name: 'design desk', session: w.helper }, to: [CR], items: ['/opt/demo/elsewhere/secret.md'], reach: reachFrom(CH) });
  ok(!no.ok && no.refused[0].why === 'not-yours' && no.refused[0].error.includes('/opt/demo/elsewhere/secret.md'), 'a path the helper does not own ⇒ refused by name', no);
  const many = REG.handover({ from: { cid: CH, session: w.helper }, to: [CR], items: Array.from({ length: 21 }, (_, i) => `/opt/demo/helper/f${i}.md`), reach: reachFrom(CH) });
  ok(!many.ok && many.code === 'too-many' && /21/.test(many.error), '21 items ⇒ refused (≤ 20 per hand-over)', many);
  const far = REG.handover({ from: { cid: CH, name: 'design desk', session: w.helper }, to: [CX], items: ['/opt/demo/helper/report.md'], reach: reachFrom(CH) });
  ok(!far.ok && far.refused[0].why === 'other-machine' && !Object.keys(w.far._artifacts || {}).length, 'a receiver on another machine ⇒ refused by name (files are never copied)', far);
  ok(!REG.handover({ from: { cid: CH, session: w.helper }, to: [CR], items: ['/opt/demo/helper/report.md'] }).ok, 'no reach function ⇒ refused (the reach is never assumed)');
}

console.log('③ the words (en / zh / ja)');
{
  const zh = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8'), ja = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8');
  const KEYS = ['Handed over by {name}', 'By subagent {name}', 'Handed to {names}', 'via {name}'];
  ok(KEYS.every((k) => zh.includes(JSON.stringify(k) + ':') && ja.includes(JSON.stringify(k) + ':')) && zh.includes('"移交自 {name}"'), 'every card word has its zh + ja line ("移交自 {name}")');
  const card = fs.readFileSync(path.join(REPO, 'src/lib/artifact-card.js'), 'utf8'), home = fs.readFileSync(path.join(REPO, 'src/lib/design-home.js'), 'utf8');
  ok(KEYS.slice(0, 3).every((k) => card.includes(`t('${k}'`)) && home.includes("t('via {name}'"), 'the card says them through t(); the Design home says "via <helper>"');
  ok(AF.viaOf({ kind: 'handover', from: { cid: 'x'.repeat(300), name: 'n' } }).from.cid.length === 64 && AF.viaOf({ kind: 'bogus' }) === null, 'via is bounded and closed (an unknown kind ⇒ none)');
}

console.log('④ patched-copy controls');
{
  const src = fs.readFileSync(path.join(REPO, 'src/server/artifact-registry.js'), 'utf8');
  const REACH = "    if (!reach(cid)) {";
  const MR = src.includes(REACH) ? M.load('src/server/artifact-registry.js', src.replace(REACH, '    if (false) {'), 'noreach') : null;
  if (ok(MR, 'CONTROL needle present: the reach check')) { const w = world(MR); const r = MR.handover({ from: { cid: CH, name: 'design desk', session: w.helper }, to: [CS], items: ['/opt/demo/helper/report.md'], reach: reachFrom(CH) }); ok(r.ok && Object.keys(w.stranger._artifacts || {}).length === 1, 'CONTROL: without the reach check a stranger\'s registry gets the row (② sees it red)', r); }
  const OWN = "const row = AF.rowFor(helper._artifacts || {}, it, helper.host || '');";
  const MO = src.includes(OWN) ? M.load('src/server/artifact-registry.js', src.replace(OWN, "const row = AF.rowFor(helper._artifacts || {}, it, helper.host || '') || { key: ':' + it, host: '', path: it, name: it, kind: 'doc' };"), 'noown') : null;
  if (ok(MO, 'CONTROL needle present: the ownership check')) { const w = world(MO); const r = MO.handover({ from: { cid: CH, name: 'design desk', session: w.helper }, to: [CR], items: ['/opt/demo/elsewhere/secret.md'], reach: reachFrom(CH) }); ok(r.ok && w.recv._artifacts[':/opt/demo/elsewhere/secret.md'], 'CONTROL: without the ownership check a path the helper never wrote lands (② sees it red)', r); }
  const SIDE = "ops = ops.concat(helperOps(session, record, session._helperArtifacts)); }";
  const MS = src.includes(SIDE) ? M.load('src/server/artifact-registry.js', src.replace(SIDE, '}'), 'noside') : null;
  if (ok(MS, 'CONTROL needle present: the live helper door')) { const s = mk('M1'); MS.configure({ activeSessions: () => new Map([['M1', s]]), log: quiet }); MS.observe(s, TASK[1]); ok(!Object.keys(s._artifacts || {}).length, 'CONTROL: sidechain not read ⇒ the fixture\'s row is missing live (① sees it red)'); }
  const nsrc = fs.readFileSync(path.join(REPO, 'src/normalizers.js'), 'utf8');
  const NSIDE = 'if (helper && artifactHelperSource && raw && raw.type === \'user\')';
  const MN = nsrc.includes(NSIDE) ? M.load('src/normalizers.js', nsrc.replace(NSIDE, 'if (false)'), 'nonside') : null;
  if (ok(MN, 'CONTROL needle present: the rebuild\'s helper seam')) { MN.setArtifactHelperSource(REG.helperOps); const s = mk('M2', { _normalizer: null, _artifacts: null }); await MN.rebuildHistory(s, 'M2', TASK); ok(!Object.keys(s._artifacts || {}).length, 'CONTROL: the rebuild without the helper seam derives no row (the parity assert sees it red)'); }
}
console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
