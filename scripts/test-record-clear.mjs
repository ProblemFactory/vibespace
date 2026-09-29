#!/usr/bin/env node
// test-record-clear — "CLEAR CONTENT…" (2026-09-28, the owner's ask: a peer agent wrote
// content from an unrelated mailbox into a Task Group's records; scrub them without a hand
// edit of data/). PURE src/record-clear.js as TABLES, each rule beside a patched copy of the
// module that breaks it (scripts/mutant-copy.mjs — outside the checkout):
//   ① clearVerdict — caller (owner / agent / job token / none) × the five kinds × ownership
//      (own / foreign), the pending fork, the producer items an agent never owns, not_found;
//      every refusal a CODE with its sentence and an HTTP status
//   ② clearedRecord / applyClear — per kind, over records in the stores' REAL shapes: the text
//      fields become the ONE sentence (or null / []), clearedAt + clearedBy stamped, EVERYTHING
//      ELSE BYTE-IDENTICAL; the copy leaves the original untouched; a second clear is a no-op
//      that keeps the first stamp; a job that ran again after a clear is cleared again
//   ③ THE SENTENCE IS A STRUCTURE: stores hold the English key only; the owner's zh / ja words
//      live in the two client dictionaries, nowhere in the server tree
//   ④ foldClears — the group log as every reader sees it (replacements dropped, both kinds of
//      clear applied, order kept, the input untouched)
//   ⑤ the dialog's words: recordAt / recordWords / previewWords
//   ⑥ patched-copy controls: a verdict that lets an agent clear ANOTHER session's entry ⇒ ① red;
//      a clear that drops a field it does not own ⇒ ② red; a store that writes the zh words ⇒ ③ red
//   ⑦ the patched-copy census (nothing written under src/)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REL = 'src/record-clear.js';
const SRC = fs.readFileSync(path.join(ROOT, REL), 'utf8');
const RC = require(path.join(ROOT, REL));
let pass = 0, fail = 0;
const ok = (c, m, e) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)) : '')); } };
const J = JSON.stringify;
const M = mutantCopies('record-clear', ROOT);
const mutant = (tag, from, to) => {
  if (!SRC.includes(from)) { ok(false, `control ${tag}: the edit applies to the real module`, from); return null; }
  return M.load(REL, SRC.split(from).join(to), tag);
};

console.log('imports nothing');
ok(!/\brequire\(/.test(SRC.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '')) && !/^\s*import\s/m.test(SRC), 'src/record-clear.js requires nothing');
ok(J(RC.RECORD_KINDS) === J(['activity', 'todo', 'status', 'job', 'group-message']), 'the CLOSED set of record kinds: activity, todo, status, job, group-message');

// ── fixtures in the stores' REAL shapes ──
const ME = 'claude:aaaa1111-0000-4000-8000-000000000001', MY_WEBUI = 'webui:cw-17', OTHER = 'claude:bbbb2222-0000-4000-8000-000000000002';
const MY_CID = 'aaaa1111-0000-4000-8000-000000000001', OTHER_CID = 'bbbb2222-0000-4000-8000-000000000002';
const activity = (session, x = {}) => ({ id: 'P-1a2b3c', at: 1790000000000, note: 'pasted a mail from the finance inbox', detail: 'From: someone@example.com\nSubject: invoices', session, ...x });
const todo = (sessionKey, x = {}) => ({ id: 'ut-00aa11bb22', sessionKey, text: 'Forward the invoice thread?', detail: 'the whole mail body…', urgency: 'normal', kind: 'action', status: 'open', by: 'agent', sessionName: 'mail agent', jobId: null, i18n: null, action: null, expiresAt: null, options: ['Yes', 'No'], reply: { text: 'no — delete it', at: 1790000000500 }, origin: 'agent', createdAt: 1790000000100, resolvedAt: null, resolvedBy: null, ...x });
const status = (x = {}) => ({ state: 'blocked', urgency: 'high', reason: 'waiting on the finance mailbox', detail: 'the mail says …', setBy: 'agent', at: 1790000000200, ...x });
const vcsRow = () => ({ event: 'vcs', kind: 'push', branch: 'fix/finance-mail', setBy: 'agent', at: 1790000000300 });
const job = (cid, x = {}) => ({
  id: 'jb-0a1b2c3d', kind: 'cron', name: 'mail digest', note: 'reads the finance inbox', cmd: { argv: ['sh', '-c', 'fetch-mail'], cwd: '/tmp/w' }, envFrom: [], restart: 'on-failure',
  health: null, ports: [], publish: false, singleInstance: true, timeoutMs: null, untilOutput: null, stdinOpen: false, notifyUser: false, notifyOk: false,
  schedule: { cron: '0 9 * * *' }, catchUp: 'once', action: { type: 'notify', text: 'new mail from the CFO' }, context: { payload: 'watch the finance inbox for invoices' },
  interaction: { pending: null, answers: [{ ok: true, version: 1, ts: 1 }] }, owner: { conversation: { id: cid }, sessionId: 'cw-17', createdBy: 'agent', groupsSnapshot: ['T-1'] },
  access: { view: 'group', control: 'session' }, stopWithOwner: false, desiredUp: true, state: 'scheduled', proc: null, supervise: { consecutiveFails: 0, parkedAt: null },
  runs: [{ startedAt: 10, trigger: 'cron', log: '/x/current.log', endedAt: 20, exit: 0, lastLine: 'Subject: invoices for Q3' }, { startedAt: 30, trigger: 'cron', log: '/y', endedAt: 40, exit: 0, lastLine: '' }],
  progress: 'read 12 mails', lastNotify: { ts: 50, lane: 'stash', ok: true, reason: 'unreachable' }, notifyLog: [{ ts: 50, lane: 'stash', ok: false, reason: 'not reachable', to: 'aaaa1111' }, { ts: 60, lane: 'message', ok: true, to: 'peer' }],
  createdAt: 1790000000400, ...x,
});
const gmsg = (authorId, x = {}) => ({ id: 'groups:g-1:gm-abc-1', convId: 'g-1', adapterId: 'groups', vendorId: 'gm-abc-1', at: 1790000000600, author: { id: authorId, name: 'mail agent', isSelf: false, isBot: false }, text: 'the finance mail says: …', mentions: [{ id: OTHER_CID, name: 'other' }], attachments: [], replyTo: null, threadKey: null, raw: { kind: 'message' }, ...x });
const ginvite = (authorId) => gmsg(authorId, { vendorId: 'gs-abc-2', text: 'A added B', raw: { kind: 'invite', by: authorId, member: OTHER_CID, context: 'read the finance inbox with me', wake: true } });

// ── ① THE VERDICT ──
console.log('① clearVerdict — caller × kind × ownership');
const OWNER = { role: 'owner' };
const AGENT = { role: 'agent', keys: [ME, MY_WEBUI], conversationId: MY_CID, by: ME };
const FORK = { ...AGENT, pendingFork: true };
const JOB = { role: 'job' };
/** [label, {kind, caller, record, key}, expected code | 'ok'] */
const VERDICTS = (R) => [
  ['owner · activity of another session', { kind: 'activity', caller: OWNER, record: activity(OTHER) }, 'ok'],
  ['owner · a UI-added activity entry (session null)', { kind: 'activity', caller: OWNER, record: activity(null) }, 'ok'],
  ['owner · a producer For-you item (helper ask)', { kind: 'todo', caller: OWNER, record: todo(ME, { origin: 'agent', action: { type: 'helper-ask', requestId: 'r1' } }) }, 'ok'],
  ['owner · a status entry the user set', { kind: 'status', caller: OWNER, record: status({ setBy: 'user' }), key: OTHER }, 'ok'],
  ['owner · a job the user created', { kind: 'job', caller: OWNER, record: job(null, { owner: { createdBy: 'user' } }) }, 'ok'],
  ['owner · another agent\'s group message', { kind: 'group-message', caller: OWNER, record: gmsg(OTHER_CID) }, 'ok'],
  ['agent · its OWN activity entry', { kind: 'activity', caller: AGENT, record: activity(ME) }, 'ok'],
  ['agent · its own entry written under its pre-conversation webui key', { kind: 'activity', caller: AGENT, record: activity(MY_WEBUI) }, 'ok'],
  ['agent · ANOTHER session\'s activity entry', { kind: 'activity', caller: AGENT, record: activity(OTHER) }, 'not_yours'],
  ['agent · a UI-added entry (session null)', { kind: 'activity', caller: AGENT, record: activity(null) }, 'not_yours'],
  ['agent · a For-you item it filed itself', { kind: 'todo', caller: AGENT, record: todo(ME) }, 'ok'],
  ['agent · a For-you item under its OWN key filed by a producer (browser)', { kind: 'todo', caller: AGENT, record: todo(ME, { origin: 'browser' }) }, 'not_yours'],
  ['agent · a HELPER\'S PERMISSION ASK under its own key (origin agent, a producer action)', { kind: 'todo', caller: AGENT, record: todo(ME, { action: { type: 'helper-ask', requestId: 'r1' } }) }, 'not_yours'],
  ['agent · an item under its key carrying producer words (i18n)', { kind: 'todo', caller: AGENT, record: todo(ME, { i18n: { text: { key: 'x' } } }) }, 'not_yours'],
  ['agent · a legacy item with no origin (fail closed)', { kind: 'todo', caller: AGENT, record: todo(ME, { origin: undefined }) }, 'not_yours'],
  ['agent · another session\'s For-you item', { kind: 'todo', caller: AGENT, record: todo(OTHER) }, 'not_yours'],
  ['agent · a status entry it set, under its key', { kind: 'status', caller: AGENT, record: status(), key: ME }, 'ok'],
  ['agent · a status entry the USER set under its key', { kind: 'status', caller: AGENT, record: status({ setBy: 'user' }), key: ME }, 'not_yours'],
  ['agent · another session\'s status entry', { kind: 'status', caller: AGENT, record: status(), key: OTHER }, 'not_yours'],
  ['agent · a job its conversation owns', { kind: 'job', caller: AGENT, record: job(MY_CID) }, 'ok'],
  ['agent · another conversation\'s job', { kind: 'job', caller: AGENT, record: job(OTHER_CID) }, 'not_yours'],
  ['agent · a message it posted', { kind: 'group-message', caller: AGENT, record: gmsg(MY_CID) }, 'ok'],
  ['agent · another member\'s message', { kind: 'group-message', caller: AGENT, record: gmsg(OTHER_CID) }, 'not_yours'],
  ['agent · a SYSTEM record it caused (an invite)', { kind: 'group-message', caller: AGENT, record: ginvite(MY_CID) }, 'not_yours'],
  ...R.RECORD_KINDS.map((k) => [`a FORK still borrowing its parent's id · ${k} (its "own" record)`, { kind: k, caller: FORK, record: k === 'activity' ? activity(ME) : k === 'todo' ? todo(ME) : k === 'status' ? status() : k === 'job' ? job(MY_CID) : gmsg(MY_CID), key: ME }, 'pending_fork']),
  ...R.RECORD_KINDS.map((k) => [`a JOB TOKEN · ${k}`, { kind: k, caller: JOB, record: {} }, 'job_token']),
  ['no caller', { kind: 'activity', caller: null, record: activity(ME) }, 'no_caller'],
  ['an unknown caller role', { kind: 'activity', caller: { role: 'root' }, record: activity(ME) }, 'no_caller'],
  ['an unknown kind', { kind: 'backlog', caller: OWNER, record: {} }, 'bad_kind'],
  ['the owner · no such record', { kind: 'todo', caller: OWNER, record: null }, 'not_found'],
  ['an agent · no such record', { kind: 'todo', caller: AGENT, record: null }, 'not_found'],
];
const verdictFailures = (R) => {
  const bad = [];
  for (const [label, input, want] of VERDICTS(R)) {
    const v = R.clearVerdict(input);
    const got = v && v.ok ? 'ok' : v && v.code;
    if (got !== want) bad.push(`${label}: ${got} ≠ ${want}`);
    if (!v.ok && !(typeof v.why === 'string' && v.why.length > 10 && Number.isInteger(v.status) && v.status >= 400)) bad.push(`${label}: a refusal without its sentence/status`);
  }
  return bad;
};
for (const [label, input, want] of VERDICTS(RC)) {
  const v = RC.clearVerdict(input);
  const got = v && v.ok ? 'ok' : v && v.code;
  ok(got === want && (v.ok || (typeof v.why === 'string' && v.why.length > 10 && Number.isInteger(v.status))), `${label} → ${want}${v.ok ? '' : ` (${v.status}: "${String(v.why).slice(0, 48)}…")`}`, v);
}
ok(Object.values(RC.REFUSALS).every((r) => Number.isInteger(r.status) && typeof r.why === 'string' && r.why.length > 10), `every refusal code has a status and a plain sentence (${Object.keys(RC.REFUSALS).join(', ')})`);
ok(RC.REFUSALS.agent_forbidden.status === 403 && RC.REFUSALS.job_token.status === 403 && RC.REFUSALS.not_yours.status === 403 && RC.REFUSALS.pending_fork.status === 409 && RC.REFUSALS.not_found.status === 404, 'the statuses: agent_forbidden / job_token / not_yours 403 · pending_fork 409 · not_found 404');

// ── ② THE CLEARED RECORD ──
console.log('② clearedRecord / applyClear — the text fields go, everything else byte-identical');
/** A deep copy with every clearedFields path REMOVED (the outside-the-text-fields view). */
const outside = (R, kind, rec) => {
  const c = JSON.parse(J(rec));
  delete c.clearedAt; delete c.clearedBy;
  for (const { path: p } of R.clearedFields(kind, rec)) {
    const segs = p.split('.');
    let targets = [c];
    for (let i = 0; i < segs.length - 1; i++) {
      const arr = segs[i].endsWith('[]'); const key = arr ? segs[i].slice(0, -2) : segs[i];
      targets = targets.flatMap((t) => (t && typeof t === 'object' ? (arr ? (Array.isArray(t[key]) ? t[key] : []) : (t[key] && typeof t[key] === 'object' ? [t[key]] : [])) : []));
    }
    for (const t of targets) if (t && typeof t === 'object') delete t[segs[segs.length - 1]];
  }
  return J(c);
};
const get = (rec, p) => p.split('.').reduce((v, seg) => (v == null ? v : seg.endsWith('[]') ? v[seg.slice(0, -2)] : v[seg]), rec);
const CASES = [
  ['activity', activity(ME), { note: RC.CLEARED_TEXT, detail: null }],
  ['activity (no detail — stays absent)', activity(ME, { detail: undefined }), { note: RC.CLEARED_TEXT }],
  ['todo (an agent\'s ask with chips + a reply)', todo(ME), { text: RC.CLEARED_TEXT, detail: null, options: null, reply: null, sessionName: 'mail agent' }],
  ['todo (a producer item — its i18n words go too)', todo(ME, { origin: 'channels', i18n: { text: { key: 'Proposals awaiting approval in {c}', params: { c: 'finance' } } } }), { text: RC.CLEARED_TEXT, i18n: null }],
  ['todo (a Background Work item — the job name in its label goes)', todo('claude:x', { origin: 'jobs', jobId: 'jb-1', sessionName: 'agent · mail digest', options: null, reply: null }), { text: RC.CLEARED_TEXT, sessionName: null }],
  ['status (a history entry)', status(), { reason: RC.CLEARED_TEXT, detail: null }],
  ['status (a vcs row — the branch name)', vcsRow(), { branch: null }],
  ['job (registry record)', job(MY_CID), { name: RC.CLEARED_TEXT, note: null, context: null, progress: null, 'action.text': RC.CLEARED_TEXT, 'lastNotify.reason': null }],
  ['group-message (a message)', gmsg(OTHER_CID), { text: RC.CLEARED_TEXT }],
  ['group-message (an invite — its context)', ginvite(OTHER_CID), { text: RC.CLEARED_TEXT, 'raw.context': null }],
];
const kindOf = (label) => label.split(' ')[0];
const clearedFailures = (R) => {
  const bad = [];
  for (const [label, rec, want] of CASES) {
    const kind = kindOf(label);
    const before = J(rec);
    const c = R.clearedRecord(rec, { kind, by: 'owner', at: 1790000009999 });
    if (J(rec) !== before) bad.push(`${label}: the original was mutated`);
    if (outside(R, kind, c) !== outside(R, kind, JSON.parse(before))) bad.push(`${label}: something OUTSIDE the text fields changed`);
    if (c.clearedAt !== 1790000009999 || c.clearedBy !== 'owner') bad.push(`${label}: clearedAt/clearedBy not stamped`);
    for (const [p, v] of Object.entries(want)) if (J(get(c, p)) !== J(v)) bad.push(`${label}: ${p} = ${J(get(c, p))} ≠ ${J(v)}`);
    // every key the original had is still there (a clear never deletes a key)
    // (a key UNDER a cleared field goes with it: a dropped reply takes reply.text)
    const under = R.clearedFields(kind, rec).map((f) => f.path.replace(/\[\]/g, ''));
    const keys = (o, pre = '') => Object.entries(o || {}).flatMap(([k, v]) => [pre + k, ...(v && typeof v === 'object' && !Array.isArray(v) ? keys(v, pre + k + '.') : [])]);
    for (const k of keys(JSON.parse(before))) if (!under.some((u) => k.startsWith(u + '.')) && !keys(c).includes(k)) bad.push(`${label}: key ${k} disappeared`);
  }
  return bad;
};
for (const [label, rec, want] of CASES) {
  const kind = kindOf(label);
  const c = RC.clearedRecord(rec, { kind, by: 'owner', at: 1790000009999 });
  const same = outside(RC, kind, c) === outside(RC, kind, rec);
  const fields = Object.entries(want).every(([p, v]) => J(get(c, p)) === J(v));
  ok(same && fields && c.clearedAt === 1790000009999 && c.clearedBy === 'owner', `${label}: ${Object.keys(want).join(', ')} cleared; everything else byte-identical; stamped`, { same, fields, c });
}
{
  const j = RC.clearedRecord(job(MY_CID), { kind: 'job', by: 'owner', at: 5 });
  ok(j.runs[0].lastLine === null && j.runs[1].lastLine === '' && j.notifyLog[0].reason === null && j.notifyLog[1].reason === undefined && J(j.interaction.answers) === '[]' && j.runs[0].startedAt === 10 && J(j.cmd) === J(job(MY_CID).cmd),
    'job: every run\'s last line and every delivery\'s reason go (an empty one stays empty, an absent one absent), the panel answers become [], the runs\' times and the COMMAND stay', { runs: j.runs, notifyLog: j.notifyLog, answers: j.interaction.answers });
  ok(J(j.owner) === J(job(MY_CID).owner) && j.id === 'jb-0a1b2c3d' && j.state === 'scheduled' && J(j.schedule) === J(job(MY_CID).schedule) && j.createdAt === 1790000000400, 'job: identity, owner, state, schedule and time stay');
  const a = RC.clearedRecord(activity(ME), { kind: 'activity', by: ME, at: 6 });
  ok(a.id === 'P-1a2b3c' && a.at === 1790000000000 && a.session === ME && a.clearedBy === ME, 'activity: its id, time and author stay; clearedBy = the agent\'s own session key when it cleared its own entry');
}
{
  const live = activity(ME);
  const r1 = RC.applyClear(live, { kind: 'activity', by: 'owner', at: 100 });
  const r2 = RC.applyClear(live, { kind: 'activity', by: ME, at: 200 });
  ok(r1.changed && J(r1.paths) === J(['note', 'detail']) && live.note === RC.CLEARED_TEXT && live.clearedAt === 100, 'applyClear mutates IN PLACE and names the paths it changed (a live job object keeps its runtime-only fields)', r1);
  ok(!r2.changed && live.clearedAt === 100 && live.clearedBy === 'owner', 'a SECOND clear is a no-op that keeps the FIRST stamp', { r2, live });
  const j = job(MY_CID);
  RC.applyClear(j, { kind: 'job', by: 'owner', at: 300 });
  j.runs.push({ startedAt: 50, trigger: 'cron', lastLine: 'Subject: more invoices' });
  const r3 = RC.applyClear(j, { kind: 'job', by: 'owner', at: 400 });
  ok(r3.changed && J(r3.paths) === J(['runs[].lastLine']) && j.runs[2].lastLine === null && j.clearedAt === 400, 'a job that RAN AGAIN after a clear has new words — a second clear takes them and restamps', r3);
  const s = status({ reason: null, detail: null });
  const r4 = RC.applyClear(s, { kind: 'status', by: 'owner', at: 7 });
  ok(!r4.changed && J(r4.paths) === '[]' && s.reason === null && !('clearedAt' in s), 'a record with no words (a state-only status entry) is left as it is — it would read the sentence for nothing');
  ok(!RC.applyClear(activity(ME), { kind: 'nope', by: 'owner', at: 1 }).changed && RC.clearedFields('nope').length === 0, 'an unknown kind clears nothing');
}

// ── ③ THE SENTENCE IS A STRUCTURE ──
console.log('③ the stores hold the ENGLISH key; the words live in the client dictionaries');
ok(RC.CLEARED_TEXT === "[cleared at the user's request]" && RC.CLEARED_WORDS.en === RC.CLEARED_TEXT, 'CLEARED_TEXT = "[cleared at the user\'s request]" (the key)');
ok(RC.CLEARED_WORDS.zh === '已按用户要求清除' && RC.CLEARED_WORDS.ja === 'ユーザーの要請により消去済み' && RC.clearedWords('zh') === RC.CLEARED_WORDS.zh && RC.clearedWords('xx') === RC.CLEARED_TEXT, 'the owner\'s words: zh 已按用户要求清除 · ja ユーザーの要請により消去済み; an unknown language ⇒ English');
const dictHas = (f, w) => fs.readFileSync(path.join(ROOT, f), 'utf8').includes(`  ${J(RC.CLEARED_TEXT)}: ${J(w)},`);
ok(dictHas('src/lib/i18n-zh.js', RC.CLEARED_WORDS.zh) && dictHas('src/lib/i18n-ja.js', RC.CLEARED_WORDS.ja), 'i18n-zh.js / i18n-ja.js word the key with exactly those words');
{
  // verify r2: a refusal is worded on the owner's device by its CODE (record-clear-ui clearErrorText) —
  // every sentence it can print has zh + ja words, and "Already cleared" / "Select none" read native
  const dict = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const entry = (f, k, v) => dict(f).includes(`  ${J(k)}: ${J(v)},`);
  const WORDS = [
    ['no such record', '找不到这条记录', '該当する記録がありません'],
    ['the records are not available right now — try again in a moment', '这些记录暂时无法访问，请稍后再试', 'これらの記録はいま利用できません。少し待ってからもう一度お試しください'],
    ['it could not be saved — nothing was changed', '没能保存，什么都没有改动', '保存できませんでした。何も変更されていません'],
    ['several entries share that time — reopen the window and try again', '有几条记录的时间完全相同，请重新打开窗口后再试', '同じ時刻の記録が複数あります。ウィンドウを開き直してからもう一度お試しください'],
    ['Already cleared', '已经清除过了', '消去済みです'],
    ['Select none', '取消全选', '選択をすべて解除'],
    ['Found in the detail: {words}', '在详情中找到：{words}', '詳細の中で見つかりました：{words}'],
  ];
  const miss = WORDS.filter(([k, zh, ja]) => !entry('src/lib/i18n-zh.js', k, zh) || !entry('src/lib/i18n-ja.js', k, ja)).map((w) => w[0]);
  ok(miss.length === 0, 'the refusal words (by code), "Already cleared" 已经清除过了, "Select none" 取消全选 and the Find line have their zh + ja entries', miss);
  const ui = dict('src/lib/record-clear-ui.js');
  const codes = ['not_found', 'unavailable', 'failed', 'ambiguous', 'unreachable'];
  ok(codes.every((c) => new RegExp(`case '${c}': return t\\('`).test(ui)) && !/why: r && r\.error \?/.test(ui), 'clearErrorText words every code an owner\'s own clear can meet with a literal t() (the old toast printed the server\'s English sentence)', codes.filter((c) => !new RegExp(`case '${c}': return t\\('`).test(ui)));
}
const storedWords = (R) => {
  const bad = [];
  for (const [label, rec] of CASES) {
    const c = R.clearedRecord(rec, { kind: kindOf(label), by: 'owner', at: 1 });
    const s = J(c);
    if (s.includes(RC.CLEARED_WORDS.zh) || s.includes(RC.CLEARED_WORDS.ja)) bad.push(`${label}: a translated word in the stored record`);
    if (!s.includes(RC.CLEARED_TEXT) && R.clearedFields(kindOf(label), rec).some((f) => f.op === 'text' && typeof get(rec, f.path) === 'string' && get(rec, f.path))) bad.push(`${label}: the key is missing`);
    if ('cleared' in c) bad.push(`${label}: a \`cleared\` flag (session-status history already means "the status was cleared" by it)`);
  }
  return bad;
};
ok(storedWords(RC).length === 0, 'a cleared record never holds a translated word, always the key, and no `cleared` flag — clearedAt IS the flag', storedWords(RC));
{
  // the server tree never spells the translated words (the stores cannot write what they do not have)
  const walk = (d) => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'lib' && d === 'src' ? [] : walk(path.join(d, e.name))) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []));
  const hits = [...walk('src'), 'server.js'].filter((f) => f !== REL && /已按用户要求清除|ユーザーの要請により消去済み/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  ok(hits.length === 0, 'no server-side file (src/ outside src/lib, server.js) spells the zh / ja words — only the PURE module\'s table does', hits);
}

// ── ④ THE GROUP LOG FOLD ──
console.log('④ foldClears — the replacement records and the index');
{
  const m1 = gmsg(OTHER_CID, { vendorId: 'gm-1', at: 10, text: 'one' });
  const m2 = gmsg(OTHER_CID, { vendorId: 'gm-2', at: 20, text: 'two (mail content)' });
  const m3 = gmsg(OTHER_CID, { vendorId: 'gm-3', at: 30, text: 'three (mail content)' });
  const repl = { ...gmsg('user', { vendorId: 'gx-1', at: 40, text: '' }), raw: { kind: 'cleared', of: 'gm-2', by: 'owner' } };
  const log = [m1, m2, m3, repl];
  const snap = J(log);
  const f = RC.foldClears(log, { 'gm-3': { at: 50, by: 'owner' } });
  ok(J(log) === snap, 'the input is not mutated');
  ok(f.length === 3 && J(f.map((r) => r.vendorId)) === J(['gm-1', 'gm-2', 'gm-3']), 'the replacement record is DROPPED (it is not a message: never unread, never reported, never drawn); order kept');
  ok(f[0].text === 'one' && !f[0].clearedAt, 'an untouched message stays itself');
  ok(f[1].text === RC.CLEARED_TEXT && f[1].clearedAt === 40 && f[1].at === 20 && f[1].author.id === OTHER_CID, 'a record a replacement names is cleared (its time and author stay)');
  ok(f[2].text === RC.CLEARED_TEXT && f[2].clearedAt === 50, 'a record the INDEX names is cleared even when the page does not reach its replacement');
  ok(RC.isReplacement(repl) && !RC.isReplacement(m1) && RC.REPLACEMENT_KIND === 'cleared' && !/-/.test(RC.REPLACEMENT_KIND), 'the replacement kind is `cleared` (no hyphen — the frame census of test-channel-record stays quiet)');
  ok(J(RC.foldClears(null)) === '[]' && J(RC.foldClears([m1], null)) === J([m1]), 'garbage in ⇒ []; no index ⇒ the log as it is');
}

// ── ⑤ THE DIALOG'S WORDS ──
console.log('⑤ recordAt / recordWords / previewWords');
ok(RC.recordAt('activity', activity(ME)) === 1790000000000 && RC.recordAt('todo', todo(ME)) === 1790000000100 && RC.recordAt('status', status()) === 1790000000200 && RC.recordAt('job', job(MY_CID)) === 1790000000400 && RC.recordAt('group-message', gmsg(ME)) === 1790000000600, 'recordAt: at / createdAt / at / createdAt / at');
ok(RC.recordWords('activity', activity(ME)) === 'pasted a mail from the finance inbox' && RC.recordWords('todo', todo(ME)) === 'Forward the invoice thread?' && RC.recordWords('status', vcsRow()) === 'fix/finance-mail' && RC.recordWords('job', job(MY_CID)) === 'mail digest' && RC.recordWords('group-message', gmsg(ME)) === 'the finance mail says: …', 'recordWords: the words each kind shows');
ok(RC.previewWords('  a\n\n b  ') === 'a b' && RC.previewWords('x'.repeat(100), 10) === 'xxxxxxxxx…' && Array.from(RC.previewWords('汉'.repeat(90), 80)).length === 80 && RC.previewWords(null) === '', 'previewWords: one line, cut at the limit with …, by code point (CJK), null ⇒ ""');

// ── ⑤b WHY A FIND MATCHED; THE PER-REQUEST CAP (verify r2) ──
console.log('⑤b matchSnippet (the dialog\'s "Found in the detail" line) · MAX_ITEMS + chunked (a batch over the cap goes in parts)');
const snippetFailures = (R) => {
  const bad = [];
  const long = 'From: someone@example.com — the deploy log also quoted FINANCE-MAILBOX in the middle of a line that goes on for a good while longer';
  const s1 = R.matchSnippet(long, 'finance-mailbox', 40);
  if (!s1.includes('FINANCE-MAILBOX')) bad.push(`the match is not in its own snippet: ${s1}`);
  if (Array.from(s1.replace(/^…|…$/g, '')).length > 40) bad.push(`longer than max: ${s1}`);
  if (!s1.startsWith('…') || !s1.endsWith('…')) bad.push(`a cut side is not marked …: ${s1}`);
  if (R.matchSnippet('short FINANCE-MAILBOX note', 'finance-mailbox', 80) !== 'short FINANCE-MAILBOX note') bad.push('a text that fits is returned whole, no …');
  if (R.matchSnippet('line one\n\n  FINANCE-MAILBOX  here', 'FINANCE-MAILBOX') !== 'line one FINANCE-MAILBOX here') bad.push('whitespace collapsed onto one line');
  if (R.matchSnippet('no hit here', 'FINANCE') !== '' || R.matchSnippet('anything', '') !== '' || R.matchSnippet(null, 'x') !== '') bad.push('absent / empty ⇒ ""');
  const cjk = R.matchSnippet('汉'.repeat(100) + '财务邮箱' + '字'.repeat(100), '财务邮箱', 30);
  if (!cjk.includes('财务邮箱') || Array.from(cjk.replace(/^…|…$/g, '')).length > 30) bad.push(`CJK by code point: ${cjk}`);
  const head = R.matchSnippet('FINANCE-MAILBOX at the very start of a long line that keeps going and going', 'finance-mailbox', 30);
  if (head.startsWith('…') || !head.startsWith('FINANCE-MAILBOX')) bad.push(`a match at the start is not cut before it: ${head}`);
  return bad;
};
ok(snippetFailures(RC).length === 0, 'matchSnippet: the match inside its own window (≤ max code points, … on a cut side, one line, CJK by code point, "" when absent)', snippetFailures(RC));
const chunkFailures = (R) => {
  const bad = [];
  if (R.MAX_ITEMS !== 200) bad.push(`MAX_ITEMS = ${R.MAX_ITEMS}`);
  if (!/at most 200 records per request/.test(R.REFUSALS.too_many.why)) bad.push('too_many names the cap');
  const list = Array.from({ length: 450 }, (_, i) => i);
  const parts = R.chunked(list);
  if (J(parts.map((p) => p.length)) !== J([200, 200, 50])) bad.push(`450 ⇒ ${J(parts.map((p) => p.length))}`);
  if (J(parts.flat()) !== J(list)) bad.push('the parts, concatenated, are the list (order kept, nothing dropped)');
  if (J(R.chunked([1, 2, 3], 2)) !== J([[1, 2], [3]]) || J(R.chunked([])) !== '[]' || J(R.chunked(null)) !== '[]' || J(R.chunked([1], 0)) !== J([[1]])) bad.push('small / empty / bad n');
  return bad;
};
ok(chunkFailures(RC).length === 0, 'MAX_ITEMS 200 (the route\'s too_many names it) · chunked: 450 ⇒ 200 + 200 + 50, order kept, nothing dropped', chunkFailures(RC));
{
  // the ORCH door counts by the same number (one constant, never a twin)
  const orch = fs.readFileSync(path.join(ROOT, 'src/server/record-clear.js'), 'utf8');
  ok(/const MAX_ITEMS = RC\.MAX_ITEMS;/.test(orch) && !/const MAX_ITEMS = \d/.test(orch), 'src/server/record-clear.js refuses by the PURE module\'s MAX_ITEMS (no second number)');
  const ui = fs.readFileSync(path.join(ROOT, 'src/lib/record-clear-ui.js'), 'utf8');
  ok(/for \(const part of chunked\(list, MAX_ITEMS\)\)/.test(ui), 'the client sends a batch in chunked(list, MAX_ITEMS) parts (wiring pin: "Select all shown" over a 500-entry log was ONE refused request)');
}
// verify r4: THE DIALOG SAYS WHAT A CLEAR CANNOT REACH — a copy an agent already received (injected into its turn, delivered
// as a notification / wake, or written by it) stays in its own conversation; "This cannot be undone" alone read as "gone
// everywhere". The sentence is in the ONE confirm dialog every surface opens, and it is worded on zh / ja devices.
const COPIES_KEY = "An agent that already received these words keeps them in its own conversation — only VibeSpace's records change.";
const copiesFailures = (ui) => {
  const bad = [];
  const body = (ui.split('export function confirmClear(')[1] || '').split('\nexport ')[0];
  if (!body.includes(`t(${J(COPIES_KEY)})`)) bad.push('confirmClear does not word the delivered-copies sentence with a literal t()');
  if (!/body\.append\(ul, hint, copies\);/.test(body) || !/copies\.className = 'dialog-hint rc-copies';/.test(body)) bad.push('the sentence is not appended to the dialog body as .rc-copies');
  const dict = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const f of ['src/lib/i18n-zh.js', 'src/lib/i18n-ja.js']) if (!new RegExp(`^  ${J(COPIES_KEY).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: "[^"]+",$`, 'm').test(dict(f))) bad.push(`${f} has no entry for it`);
  return bad;
};
{
  const UI_REL = 'src/lib/record-clear-ui.js', UI_SRC = fs.readFileSync(path.join(ROOT, UI_REL), 'utf8');
  ok(copiesFailures(UI_SRC).length === 0, 'the confirm dialog says a copy an agent already received stays in its conversation (.rc-copies, zh + ja worded — verify r4)', copiesFailures(UI_SRC));
  // NEGATIVE CONTROL: the dialog as it was before r4 (the sentence never appended) fails the same check
  const PRE = M.write(UI_REL, UI_SRC.replace('body.append(ul, hint, copies);', 'body.append(ul, hint);'), 'dialog-silent-on-copies');
  const bad = copiesFailures(fs.readFileSync(PRE, 'utf8'));
  ok(bad.some((b) => /not appended/.test(b)), 'NEGATIVE CONTROL: a dialog that builds the sentence but never shows it fails the check', bad);
  // verify r4 (LOW): the For-you board chip's tooltip (popup + window) printed the status record's stored reason — after a
  // clear, the English KEY on a zh / ja device. The model words it once (`why`); neither chip reads `rec.reason` itself.
  const acts = fs.readFileSync(path.join(ROOT, 'src/lib/user-todos-actions.js'), 'utf8');
  const panel = fs.readFileSync(path.join(ROOT, 'src/lib/user-todos-panel.js'), 'utf8');
  const win = fs.readFileSync(path.join(ROOT, 'src/lib/inbox-window.js'), 'utf8');
  ok(/why: typeof rec\.reason === 'string' \? \(isCleared\(rec\) \? clearedText\(\) : rec\.reason\) : ''/.test(acts) && /const why = b\.why \|\| '';/.test(panel) && /c\.board\.title = b\.why \|\| '';/.test(win) && !/rec\.reason/.test(panel) && !/b\.rec\.reason/.test(win),
    'the board chip\'s tooltip is the model\'s `why` — a cleared reason in this device\'s words — in the popup and the window (verify r4)');
}
// verify r4 (reproduced in chrome on the pre-fix modules — test-record-clear-ui ③ went red on all three legs): a For-you item's
// ARRIVAL toast carried its words and every toast is kept in the device's localStorage for the Notifications tab — a copy on
// every device that was open when the item arrived, still shown after the clear. The history keeps the head + a `ref`; the tab
// words it from the live store; an older build's entries are cut back on every load.
// verify r5 (reproduced in chrome — test-record-clear-client): r4's head kept the item's LABEL (`<head> · <nameFor>`), and a
// Background Work ask's label IS the job's name (its `sessionName`, nameFor's fallback) — the device kept a cleared job's name.
// The history keeps the HEAD only; the tab looks the label AND the words up live; an old entry is cut back to its head.
const toastFailures = (panelSrc, utilsSrc) => {
  const bad = [];
  if (!/const el = showToast\(`\$\{head\} · \$\{nameFor\(i\.sessionKey, \[i\]\)\}: \$\{wordsOf\(i\)\}`, \{ history: \{ m: head, ref: \{ kind: 'todo', id: i\.id \} \} \}\);/.test(panelSrc)) bad.push('the arrival toast does not keep its history as the head + the item\'s ref');
  if (/history: \{ m: kept/.test(panelSrc) || /const kept = /.test(panelSrc)) bad.push('the history keeps the item\'s label (a job\'s name) beside the head');
  if (!/const histWords = \(e\) => \{[^\n]*byId\(e\.ref\.id\); return it \? `\$\{nameFor\(it\.sessionKey, \[it\]\)\}: \$\{wordsOf\(it\)\}` : ''; \};/.test(panelSrc) || !/\$\{histWords\(e\) \? ' · ' \+ escHtml\(histWords\(e\)\) : ''\}/.test(panelSrc)) bad.push('the Notifications tab does not word a ref\'s label and words from the live store');
  if (!/const cut = e\.m\.indexOf\(' · '\);\s*if \(cut < 0\) continue;\s*e\.m = e\.m\.slice\(0, cut\);/.test(utilsSrc)) bad.push('an older build\'s entry keeps its label (a job\'s name) after the load-time cut');
  if (!/stripLegacyRecordToasts\(\[t\('Added to For you'\), 'Added to For you'\]\);/.test(panelSrc)) bad.push('the legacy entries are not cut back at load');
  if (!/_recordToast\(history && typeof history\.m === 'string' \? history\.m : message, type, history && history\.ref\);/.test(utilsSrc)) bad.push('showToast records the message, not the history it was given');
  return bad;
};
{
  const P_REL = 'src/lib/user-todos-panel.js', P_SRC = fs.readFileSync(path.join(ROOT, P_REL), 'utf8');
  const U_SRC = fs.readFileSync(path.join(ROOT, 'src/lib/utils.js'), 'utf8');
  ok(toastFailures(P_SRC, U_SRC).length === 0, 'a For-you arrival toast keeps no words in the device\'s toast history (head + ref; the tab words it live; older entries cut at load — verify r4)', toastFailures(P_SRC, U_SRC));
  const OLD = "const el = showToast(`${head} · ${nameFor(i.sessionKey, [i])}: ${wordsOf(i)}`);";
  const NEW = "const el = showToast(`${head} · ${nameFor(i.sessionKey, [i])}: ${wordsOf(i)}`, { history: { m: head, ref: { kind: 'todo', id: i.id } } });";
  ok(P_SRC.split(NEW).length === 2, 'the arrival toast call is present once (the control swaps exactly it)');
  const PRE = M.write(P_REL, P_SRC.replace(NEW, OLD), 'arrival-toast-keeps-words');
  const bad = toastFailures(fs.readFileSync(PRE, 'utf8'), U_SRC);
  ok(bad.some((b) => /head \+ the item's ref/.test(b)), 'NEGATIVE CONTROL: the pre-r4 arrival toast (the words in the message, no history) fails the check', bad);
  // verify r5 NEGATIVE CONTROL: r4's form — the history keeps `<head> · <label>` — fails too (the label can be a job's name)
  const R4 = M.write(P_REL, P_SRC.replace(NEW, "const kept = `${head} · ${nameFor(i.sessionKey, [i])}`; const el = showToast(`${kept}: ${wordsOf(i)}`, { history: { m: kept, ref: { kind: 'todo', id: i.id } } });"), 'arrival-toast-keeps-label');
  const bad2 = toastFailures(fs.readFileSync(R4, 'utf8'), U_SRC);
  ok(bad2.some((b) => /label/.test(b)), 'NEGATIVE CONTROL (verify r5): r4\'s history (the head + the item\'s label) fails the check', bad2);
}

// verify r5 (reproduced in chrome — test-record-clear-client, the pre-fix run): the Job input window listened to its own
// id only, and "Clear content…" broadcasts `jobs-updated {cleared: [ids]}` — so the window kept the job's name in its title
// (the window, the taskbar, data/layouts.json, an incident's scene snapshot) and the ask the clear had dropped, on every
// device that replayed it. It re-renders on its id in `cleared`, words a cleared job's name, and paints the LATEST fetch.
const interactFailures = (src) => {
  const bad = [];
  const body = (src.split('export function openInteractWindow(')[1] || '').split('\n}\n')[0];
  if (!/msg\.type === 'jobs-updated' && \(msg\.id === jobId \|\| \(Array\.isArray\(msg\.cleared\) && msg\.cleared\.includes\(jobId\)\)\)\) render\(\);/.test(body)) bad.push('the window does not re-render when its job is in a broadcast\'s `cleared`');
  if (!/app\.wm\.setTitle\(winInfo\.id, \(isCleared\(job\) \? clearedText\(\) : job\.name\) \+ ' — ' \+ t\('needs your input'\)\);/.test(body)) bad.push('the title does not word a cleared job\'s name as the sentence');
  if (!/const seq = \+\+renderSeq;[\s\S]*?await fetchJson\(`\/api\/jobs\/\$\{jobId\}`\);\s*if \(seq !== renderSeq\) return;/.test(body)) bad.push('an earlier fetch can paint over a later one');
  if (/job\.name \+ ' — '/.test(body)) bad.push('a raw job.name still reaches the title');
  return bad;
};
{
  const JP_REL = 'src/lib/jobs-panel.js', JP_SRC = fs.readFileSync(path.join(ROOT, JP_REL), 'utf8');
  ok(interactFailures(JP_SRC).length === 0, 'the Job input window re-renders on its job\'s clear, words the cleared name, paints the latest fetch (verify r5)', interactFailures(JP_SRC));
  const FIXED = "if (msg.type === 'jobs-updated' && (msg.id === jobId || (Array.isArray(msg.cleared) && msg.cleared.includes(jobId)))) render();";
  ok(JP_SRC.split(FIXED).length === 2, 'the window\'s listener is present once (the control swaps exactly it)');
  const PRE = M.write(JP_REL, JP_SRC.replace(FIXED, "if (msg.type === 'jobs-updated' && msg.id === jobId) render();"), 'interact-own-id-only');
  const bad = interactFailures(fs.readFileSync(PRE, 'utf8'));
  ok(bad.length === 1 && /cleared/.test(bad[0]), 'NEGATIVE CONTROL: the pre-r5 listener (its own id only) fails the check', bad);
}

// verify r5 (reproduced in chrome): a status HISTORY entry that is not the current status, cleared, left the statuses map
// exactly as every client held it — the sidebar's change guard (`sig !== this._statusSig`) dropped the broadcast and the
// expanded session card's history (fetched at render) kept the words for good. The store's broadcast names what it cleared
// (`cleared: [{key, ats}]`, ids only), server.js carries it, and the guard counts it as a change.
const statusGuardFailures = (tasksSrc, statusSrc, serverSrc) => {
  const bad = [];
  if (!/const changed = sig !== this\._statusSig \|\| \(Array\.isArray\(msg\.cleared\) && msg\.cleared\.length > 0\);/.test(tasksSrc)) bad.push('the sidebar\'s change guard drops a broadcast whose statuses did not change, even when it names a clear');
  if (!/this\._notify\(\{ cleared: \[\{ key, ats: out\.cleared\.slice\(\) \}\] \}\);/.test(statusSrc) || !/_notify\(extra = null\) \{ try \{ this\._onChange\(this\.snapshot\(\), extra\); \} catch \{ \} \}/.test(statusSrc)) bad.push('the history clear does not name what it touched');
  if (!/\.\.\.\(extra && Array\.isArray\(extra\.cleared\) \? \{ cleared: extra\.cleared \} : \{\}\)/.test(serverSrc)) bad.push('server.js does not carry `cleared` in session-status-updated');
  return bad;
};
{
  const T_REL = 'src/lib/sidebar-tasks.js', T_SRC = fs.readFileSync(path.join(ROOT, T_REL), 'utf8');
  const ST_SRC = fs.readFileSync(path.join(ROOT, 'src/session-status.js'), 'utf8'), SV_SRC = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  ok(statusGuardFailures(T_SRC, ST_SRC, SV_SRC).length === 0, 'a status history clear reaches the sidebar: the broadcast names it, server.js carries it, the change guard admits it (verify r5)', statusGuardFailures(T_SRC, ST_SRC, SV_SRC));
  const FIXED = 'const changed = sig !== this._statusSig || (Array.isArray(msg.cleared) && msg.cleared.length > 0);';
  ok(T_SRC.split(FIXED).length === 2, 'the guard is present once (the control swaps exactly it)');
  const PRE = M.write(T_REL, T_SRC.replace(FIXED, 'const changed = sig !== this._statusSig;'), 'status-guard-drops-clear');
  const bad = statusGuardFailures(fs.readFileSync(PRE, 'utf8'), ST_SRC, SV_SRC);
  ok(bad.length === 1 && /change guard/.test(bad[0]), 'NEGATIVE CONTROL: the pre-r5 guard (the statuses\' signature alone) fails the check', bad);
}

// verify r5 (reproduced in chrome): the Task Group detail window skips its WHOLE render while a non-empty field is focused
// (never clobber typing) — and every tasks-updated returned there, so a device whose title / objective field kept the focus
// showed a cleared Activity entry's words for good. The guard now repaints the Activity list in place (it holds no field).
const detailGuardFailures = (src) => {
  const bad = [];
  if (!/if \(_typing && _ae\.value\) \{ const pl = root\.querySelector\('\.task-detail-progress'\); if \(pl && !pl\.contains\(_ae\)\) \{ const st = pl\.scrollTop; fillProgress\(pl, task\); pl\.scrollTop = st; \} return; \}/.test(src)) bad.push('the typing guard returns without repainting the Activity log');
  const fp = (src.split('const fillProgress = (progList, task) => {')[1] || '').split('\n  };\n')[0];
  if (!fp || !/isCleared\(p\) \? `\$\{stamp\}<span class="rc-cleared">\$\{escHtml\(clearedText\(\)\)\}<\/span>`/.test(fp) || !/if \(p\.detail && !isCleared\(p\)\)/.test(fp)) bad.push('the Activity rows are not drawn by ONE cleared-aware fillProgress');
  if ((src.match(/const fillProgress = /g) || []).length !== 1 || (src.match(/fillProgress\((progList|pl), task\)/g) || []).length !== 2) bad.push('fillProgress is not the ONE painter (defined once, called by the render and the guard)');
  return bad;
};
{
  const TD_REL = 'src/lib/task-detail.js', TD_SRC = fs.readFileSync(path.join(ROOT, TD_REL), 'utf8');
  ok(detailGuardFailures(TD_SRC).length === 0, 'the Task Group detail window repaints its Activity log from the store even while a field is being typed in (verify r5)', detailGuardFailures(TD_SRC));
  const FIXED = "if (_typing && _ae.value) { const pl = root.querySelector('.task-detail-progress'); if (pl && !pl.contains(_ae)) { const st = pl.scrollTop; fillProgress(pl, task); pl.scrollTop = st; } return; }";
  ok(TD_SRC.split(FIXED).length === 2, 'the guard is present once (the control swaps exactly it)');
  const PRE = M.write(TD_REL, TD_SRC.replace(FIXED, 'if (_typing && _ae.value) return;'), 'detail-guard-skips-activity');
  const bad = detailGuardFailures(fs.readFileSync(PRE, 'utf8'));
  ok(bad.some((b) => /without repainting/.test(b)), 'NEGATIVE CONTROL: the pre-r5 guard (return, nothing repainted) fails the check', bad);
}

// verify r5 (reproduced in chrome): Session Properties skips its WHOLE render while one of its selects has the focus (an open
// native list must not be torn down) — every broadcast returned there, so a window whose select kept the focus showed a
// cleared status history entry's words (and a cleared "Now" reason) for good. The guard repaints both in place.
const propsGuardFailures = (src) => {
  const bad = [];
  const guard = (src.split("if (root.contains(document.activeElement) && document.activeElement.tagName === 'SELECT') {")[1] || '').split('\n    }\n')[0];
  if (!guard || !/const nv = root\.querySelector\('\.sp-now-value'\);\s*if \(nv\) \{ const h = nowHtml\(s\); if \(nv\.innerHTML !== h\) nv\.innerHTML = h; \}/.test(guard) || !/const hl = root\.querySelector\('\.session-history-list'\);\s*if \(hl\) fillHistory\(hl, s\);\s*return;/.test(guard)) bad.push('the select guard returns without repainting the status (Now + history)');
  if (/document\.activeElement\.tagName === 'SELECT'\) return;/.test(src)) bad.push('a bare select guard still returns with nothing repainted');
  if (!/<span class="session-detail-value sp-now-value" style="flex:1">\$\{nowHtml\(s\)\}<\/span>/.test(src) || !/\n    fillHistory\(histList, s\);\n/.test(src)) bad.push('the whole render does not draw through the same nowHtml / fillHistory');
  // verify r6: BOTH handlers — the answer's and the failure's (the r5 pin matched either, so dropping the answer's guard kept it green)
  if ((src.match(/if \(!histList\.isConnected \|\| histList\._fill !== my\) return;/g) || []).length !== 2 || !/\}\)\.then\(d => \{\s*if \(!histList\.isConnected \|\| histList\._fill !== my\) return;/.test(src)) bad.push('an earlier history fetch can paint over a later one');
  return bad;
};
{
  const SP_REL = 'src/lib/session-props.js', SP_SRC = fs.readFileSync(path.join(ROOT, SP_REL), 'utf8');
  ok(propsGuardFailures(SP_SRC).length === 0, 'Session Properties repaints its "Now" line and status history from the store even while a select has the focus (verify r5)', propsGuardFailures(SP_SRC));
  const g0 = SP_SRC.indexOf("if (root.contains(document.activeElement) && document.activeElement.tagName === 'SELECT') {");
  const g1 = SP_SRC.indexOf('\n    }\n', g0) + '\n    }\n'.length;
  ok(g0 > 0 && g1 > g0, 'the guard is present (the control swaps exactly it)');
  const PRE = M.write(SP_REL, SP_SRC.slice(0, g0) + "if (root.contains(document.activeElement) && document.activeElement.tagName === 'SELECT') return;\n" + SP_SRC.slice(g1), 'props-guard-skips-status');
  const bad = propsGuardFailures(fs.readFileSync(PRE, 'utf8'));
  ok(bad.some((b) => /bare select guard|without repainting/.test(b)), 'NEGATIVE CONTROL: the pre-r5 select guard (Session Properties returns, nothing repainted) fails the check', bad);
}

// verify r5 (LOW, seen by the client census): the arrival toast ON SCREEN kept the item's words for its whole life (up to the
// toast-seconds setting's 60 s) after the item was cleared. Every snapshot re-words a live arrival toast from the current record.
const liveToastFailures = (src) => {
  const bad = [];
  if (!/if \(el\) \{ el\.dataset\.todoId = i\.id; el\.dataset\.todoHead = head; \}/.test(src)) bad.push('the arrival toast does not carry its item id + head');
  const body = (src.split("for (const el of document.querySelectorAll('#global-toasts > .global-toast[data-todo-id]')) {")[1] || '').split('\n    }\n')[0];
  if (!body || !/const it = byId\(el\.dataset\.todoId\);/.test(body) || !/const want = `\$\{el\.dataset\.todoHead\} · \$\{nameFor\(it\.sessionKey, \[it\]\)\}: \$\{wordsOf\(it\)\}`;/.test(body)) bad.push('a snapshot does not re-word the live arrival toasts (label + words) from the current record');
  return bad;
};
{
  const P_REL = 'src/lib/user-todos-panel.js', P_SRC = fs.readFileSync(path.join(ROOT, P_REL), 'utf8');
  ok(liveToastFailures(P_SRC).length === 0, 'a live arrival toast is re-worded from the current record on every snapshot — a cleared item\'s toast reads the sentence (verify r5)', liveToastFailures(P_SRC));
  const a = P_SRC.indexOf("    for (const el of document.querySelectorAll('#global-toasts > .global-toast[data-todo-id]')) {");
  const b = P_SRC.indexOf('\n    }\n', a) + '\n    }\n'.length;
  ok(a > 0 && b > a, 'the re-word loop is present (the control removes exactly it)');
  const PRE = M.write(P_REL, P_SRC.slice(0, a) + P_SRC.slice(b), 'live-toast-keeps-words');
  const bad = liveToastFailures(fs.readFileSync(PRE, 'utf8'));
  ok(bad.length === 1 && /re-word/.test(bad[0]), 'NEGATIVE CONTROL: the pre-r5 panel (no re-word) fails the check', bad);
}

// verify r5 (LOW, found by the client census's HEAP leg — a V8 snapshot after the clear): three handlers kept a WHOLE record
// in their closure — the arrival toast's click (the For-you item, for the toast's life), the sidebar Task View's group bars
// and Session Properties' Task Group toggles (the Task Group, its Activity notes included — Session Properties' toggles
// outlive a broadcast under its select guard). Memory only, never drawn or sent; each keeps the ID now.
const idCaptureFailures = (panel, tasks, props) => {
  const bad = [];
  if (!/if \(el\) \{ const id = i\.id, key = i\.sessionKey; el\.style\.cursor = 'pointer'; el\.onclick = \(\) => jump\(key, byId\(id\)\); \}/.test(panel) || /jump\(i\.sessionKey, i\)/.test(panel)) bad.push('the arrival toast\'s click keeps the item, not its id');
  if (!/const gid = g\.id;\s*bar\.onclick = \(e\) => \{ e\.stopPropagation\(\); this\.app\.openTaskDetail\(gid\); \};/.test(tasks) || !/this\._showTaskContextMenu\(e\.clientX, e\.clientY, gid\);/.test(tasks)) bad.push('the Task View bars keep the group, not its id');
  if (!/const gid = g\.id;\s*cb\.onchange = \(\) => \{ cb\.checked \? sidebar\._taskBind\(gid, s\) : sidebar\._taskUnbind\(gid, s\); \};/.test(props)) bad.push('Session Properties\' Task Group toggles keep the group, not its id');
  return bad;
};
{
  const P_REL = 'src/lib/user-todos-panel.js', P_SRC = fs.readFileSync(path.join(ROOT, P_REL), 'utf8');
  const T_SRC = fs.readFileSync(path.join(ROOT, 'src/lib/sidebar-tasks.js'), 'utf8'), S_SRC = fs.readFileSync(path.join(ROOT, 'src/lib/session-props.js'), 'utf8');
  ok(idCaptureFailures(P_SRC, T_SRC, S_SRC).length === 0, 'the handlers on surfaces that outlive a broadcast keep a record\'s ID, never the record (verify r5, the heap census)', idCaptureFailures(P_SRC, T_SRC, S_SRC));
  const FIXED = "if (el) { const id = i.id, key = i.sessionKey; el.style.cursor = 'pointer'; el.onclick = () => jump(key, byId(id)); }";
  ok(P_SRC.split(FIXED).length === 2, 'the toast\'s click is present once (the control swaps exactly it)');
  const PRE = M.write(P_REL, P_SRC.replace(FIXED, "if (el) { el.style.cursor = 'pointer'; el.onclick = () => jump(i.sessionKey, i); }"), 'toast-click-keeps-item');
  const bad = idCaptureFailures(fs.readFileSync(PRE, 'utf8'), T_SRC, S_SRC);
  ok(bad.length === 1 && /arrival toast/.test(bad[0]), 'NEGATIVE CONTROL: the pre-r5 toast click (the item captured) fails the check', bad);
}

// verify r5 (LOW, client-side ORDER — what the census cannot see by construction): a fetch answered BEFORE a clear that lands
// AFTER the clear's broadcast painted the words back — the group window's page (patchCleared had found no row yet), the
// Background Work window's list (renders overlap: every jobs-updated, the 30 s tick, ⟳), the For-you reconnect resync.
const orderFailures = (win, jobs, acts, sidebar = null, appSrc = '', panel = '') => {
  const bad = [];
  if (!/const fresh = recs\.filter\(\(r\) => r && !seen\.has\(r\.vendorId\)\)\.map\(\(r\) => clearedSeen\.get\(r\.vendorId\) \|\| r\);/.test(win) || !/drawn\.set\(c\.vendorId, c\.record\); clearedSeen\.set\(c\.vendorId, c\.record\);/.test(win)) bad.push('the group window draws a page\'s copy of a record a clear replaced while the page was on its way');
  const w = (jobs.split('export function openJobsWindow(')[1] || '').split('\n}\n')[0];
  if (!/const seq = \+\+renderSeq;\s*const \[r\] = await Promise\.all\(\[fetchJson\('\/api\/jobs'\), loadFolds\(app\)\]\);\s*if \(seq !== renderSeq\) return;/.test(w) || !/const esc = await fetchJson\('\/api\/jobs-escapes'\);\s*if \(seq !== renderSeq\) return;/.test(w)) bad.push('the Background Work window lets an earlier render paint over a later one');
  if (!/const setTodos = \(next\) => \{ gen\+\+;/.test(acts) || !/if \(connected\) \{ const g0 = gen; fetchJson\('\/api\/user-todos'\)\.then\(\(d\) => \{ if \(d\?\.todos && gen === g0\) setTodos\(d\.todos\); \}\); \}/.test(acts)) bad.push('the For-you reconnect resync can replace a newer snapshot');
  // verify r6 (reproduced in chrome — a real socket drop, the pre-clear answers held until after the clear's broadcasts):
  // the STATUS mirror's two fetches (page load + the reconnect resync) and the Channels panel's group list
  if (sidebar != null) {
    if (!/proto\._fetchStatuses = function\(\) \{\s*const gen = this\._statusGen \|\| 0;[\s\S]{0,200}?if \(!d\?\.statuses \|\| \(this\._statusGen \|\| 0\) !== gen\) return;/.test(sidebar) || !/msg\.type === 'session-status-updated' && msg\.statuses\) \{\s*this\._statusGen = \(this\._statusGen \|\| 0\) \+ 1;/.test(sidebar) || (sidebar.match(/fetch\('\/api\/session-status'\)/g) || []).length !== 1) bad.push('the status mirror\'s fetch can replace a newer status frame');
    if (!/this\.sidebar\?\._fetchStatuses\?\.\(\);/.test(appSrc) || /\/api\/session-status'\)\.then/.test(appSrc)) bad.push('the reconnect resync fetches the statuses itself (no generation)');
    if (!/const g0 = groupsGen;/.test(panel) || !/if \(groupsGen !== g0\) \{/.test(panel) || !/groups = msg\.groups; groupsGen\+\+;/.test(panel)) bad.push('the Channels panel\'s refresh can replace a newer group list');
  }
  // verify r6 (reproduced in chrome by the client census's stale answers): a clear that lands while the group window's FIRST
  // page is on its way — the window was just opened, or replayed — is kept (clearedSeen) before the `!group` return, and a
  // page never replaces a newer group entry (its lastText)
  if (!/if \(Array\.isArray\(msg\.cleared\)\) \{ for \(const c of msg\.cleared\) if \(c && c\.groupId === groupId && c\.record\) \{ drawn\.set\(c\.vendorId, c\.record\); clearedSeen\.set\(c\.vendorId, c\.record\); \} \}\s*if \(!group\) \{ if \(g\) group = g; return; \}/.test(win) || /msg\.type !== 'channel-groups-updated' \|\| !group\) return;/.test(win) || !/if \(r\.group && groupGen === g0\) group = r\.group;/.test(win)) bad.push('the group window drops a clear that lands while its FIRST page is on its way');
  return bad;
};
{
  const W_REL = 'src/lib/channel-window.js', W_SRC = fs.readFileSync(path.join(ROOT, W_REL), 'utf8');
  const JB = fs.readFileSync(path.join(ROOT, 'src/lib/jobs-panel.js'), 'utf8'), AC = fs.readFileSync(path.join(ROOT, 'src/lib/user-todos-actions.js'), 'utf8');
  const SB = fs.readFileSync(path.join(ROOT, 'src/lib/sidebar-tasks.js'), 'utf8'), AP = fs.readFileSync(path.join(ROOT, 'src/lib/app.js'), 'utf8'), CP = fs.readFileSync(path.join(ROOT, 'src/lib/channels-panel.js'), 'utf8');
  ok(orderFailures(W_SRC, JB, AC, SB, AP, CP).length === 0, 'a fetch answered before a clear never paints over the clear\'s broadcast — the group window\'s pages, the Background Work window, the For-you resync (verify r5), the status mirror, the Channels panel\'s group list and the group window\'s first page (verify r6)', orderFailures(W_SRC, JB, AC, SB, AP, CP));
  // verify r6 NEGATIVE CONTROL: the pre-r6 reconnect resync (app.js set the statuses from its own fetch) fails the check
  const APP_PRE = "      fetchJson('/api/session-status').then((d) => {\n        const sb = this.sidebar;\n        if (!d?.statuses || !sb) return;\n        sb._sessionStatuses = d.statuses;\n        sb._render?.();\n        sb._lastAttnSig = null;\n        sb.refreshTaskAttention?.();\n      }).catch(() => {});\n";
  const APP_FIX = '      try { this.sidebar?._fetchStatuses?.(); } catch {}';
  ok(AP.split(APP_FIX).length === 2, 'the resync\'s status fetch is present once (the control swaps exactly it)');
  const APP_M = M.write('src/lib/app.js', AP.replace(APP_FIX, APP_PRE), 'status-resync-ungated');
  const badR = orderFailures(W_SRC, JB, AC, SB, fs.readFileSync(APP_M, 'utf8'), CP);
  ok(badR.length === 1 && /reconnect resync fetches the statuses itself/.test(badR[0]), 'NEGATIVE CONTROL (verify r6): the pre-r6 reconnect resync (the statuses set from its own fetch, no generation) fails the check', badR);
  const PANEL_FIX = '    if (groupsGen !== g0) {';
  ok(CP.split(PANEL_FIX).length === 2, 'the panel\'s generation check is present once (the control removes exactly it)');
  const CP_M = M.write('src/lib/channels-panel.js', CP.replace(PANEL_FIX, '    if (false) {'), 'panel-refresh-ungated');
  const badP = orderFailures(W_SRC, JB, AC, SB, AP, fs.readFileSync(CP_M, 'utf8'));
  ok(badP.length === 1 && /Channels panel/.test(badP[0]), 'NEGATIVE CONTROL (verify r6): a Channels panel refresh that keeps its answer over a newer broadcast fails the check', badP);
  // verify r6 NEGATIVE CONTROL: the pre-r6 broadcast handler (returns on `!group` before it keeps the clear) fails the check
  const FIRST_FIX = "    if (msg.type !== 'channel-groups-updated') return;\n";
  ok(W_SRC.split(FIRST_FIX).length === 2, 'the group window\'s handler head is present once (the control swaps exactly it)');
  const W_M = M.write(W_REL, W_SRC.replace(FIRST_FIX, "    if (msg.type !== 'channel-groups-updated' || !group) return;\n"), 'group-first-page-drops-clear');
  const badF = orderFailures(fs.readFileSync(W_M, 'utf8'), JB, AC, SB, AP, CP);
  ok(badF.length === 1 && /FIRST page/.test(badF[0]), 'NEGATIVE CONTROL (verify r6): a group window that drops a clear while its first page is on its way fails the check', badF);
  const FIXED = 'const fresh = recs.filter((r) => r && !seen.has(r.vendorId)).map((r) => clearedSeen.get(r.vendorId) || r);';
  ok(W_SRC.split(FIXED).length === 2, 'the page substitution is present once (the control swaps exactly it)');
  const PRE = M.write(W_REL, W_SRC.replace(FIXED, 'const fresh = recs.filter((r) => r && !seen.has(r.vendorId));'), 'group-page-draws-original');
  const bad = orderFailures(fs.readFileSync(PRE, 'utf8'), JB, AC);
  ok(bad.length === 1 && /group window/.test(bad[0]), 'NEGATIVE CONTROL: the pre-r5 place() (the page\'s copy drawn as it came) fails the check', bad);
}

// verify r5 (LOW, the client belt): the Background Work "Remove job" confirm named a cleared job by its STORED English key on a
// zh / ja device (the r4 board-chip class) — every text field a surface draws goes through the cleared-aware words.
{
  const JP_REL = 'src/lib/jobs-panel.js', JP_SRC = fs.readFileSync(path.join(ROOT, JP_REL), 'utf8');
  const rmOk = (src) => /t\('Remove \{name\} and its run history\?', \{ name: isCleared\(j\) \? clearedText\(\) : j\.name \}\)/.test(src) && !/\{ name: j\.name \}/.test(src);
  ok(rmOk(JP_SRC), 'the "Remove job" confirm words a cleared job\'s name in this device\'s language (verify r5, the belt)');
  const PRE = M.write(JP_REL, JP_SRC.replace('{ name: isCleared(j) ? clearedText() : j.name }', '{ name: j.name }'), 'rm-confirm-stored-key');
  ok(!rmOk(fs.readFileSync(PRE, 'utf8')), 'NEGATIVE CONTROL: the pre-r5 confirm (the stored name) fails the check');
}

// verify r6 (the r5 held LOW, re-judged): the session status popover opened BEFORE a "Clear content…" of the current reason
// (another device, the agent) kept the words in its Reason box, and Apply — pressed to change the state only — re-filed
// them as the owner's own status (every surface, and the agent's "the user changed your status" note). An UNTOUCHED
// prefill follows the LIVE record at the press (a cleared reason is dropped); what the owner typed is theirs.
const popoverFailures = (src) => {
  const bad = [];
  const body = (src.split('proto._showSessionStatusPopover = function(anchor, sessionRef) {')[1] || '').split('\n  };\n')[0];
  if (!/const prefill = cur\.clearedAt \? '' : \(cur\.reason \|\| ''\);/.test(body) || !/reasonInp\.value = prefill;/.test(body)) bad.push('the popover does not remember what it prefilled');
  if (!/const live = this\.getSessionStatus\(sessionRef\) \|\| \{\};\s*const reason = reasonInp\.value === prefill \? \(live\.clearedAt \? '' : \(live\.reason \|\| ''\)\) : reasonInp\.value;/.test(body) || /reason: reasonInp\.value/.test(body)) bad.push('Apply re-files an untouched prefill instead of the live record');
  if ((body.match(/pop\._closeCtl\?\.abort\(\); pop\.remove\(\);/g) || []).length !== 2) bad.push('Apply / Clear remove the popover but leave its outside-press listeners holding the box (the words) until the next press');
  return bad;
};
{
  const T_REL = 'src/lib/sidebar-tasks.js', T_SRC = fs.readFileSync(path.join(ROOT, T_REL), 'utf8');
  ok(popoverFailures(T_SRC).length === 0, 'the status popover\'s Apply sends the LIVE reason for an untouched prefill — a reason cleared while it was open is never re-filed (verify r6)', popoverFailures(T_SRC));
  const FIXED = "      const live = this.getSessionStatus(sessionRef) || {};\n      const reason = reasonInp.value === prefill ? (live.clearedAt ? '' : (live.reason || '')) : reasonInp.value;\n      this.setSessionStatusUser(sessionRef, { state: stateSel.value || null, urgency: urgSel.value || null, reason });";
  ok(T_SRC.split(FIXED).length === 2, 'the Apply handler is present once (the control swaps exactly it)');
  const PRE = M.write(T_REL, T_SRC.replace(FIXED, "      this.setSessionStatusUser(sessionRef, { state: stateSel.value || null, urgency: urgSel.value || null, reason: reasonInp.value });"), 'popover-apply-refiles-prefill');
  const bad = popoverFailures(fs.readFileSync(PRE, 'utf8'));
  ok(bad.length === 1 && /re-files an untouched prefill/.test(bad[0]), 'NEGATIVE CONTROL (verify r6): the pre-r6 Apply (the box\'s value, whatever it was prefilled with) fails the check', bad);
}

// ── ⑥ PATCHED-COPY CONTROLS ──
console.log('⑥ negative controls — each rule broken on a copy goes red');
{
  const lax = mutant('verdict-lets-agent-clear-another', "activity: (rec, c) => typeof rec.session === 'string' && c.keys.has(rec.session),", 'activity: (rec, c) => typeof rec.session === \'string\',');
  const bad = lax ? verdictFailures(lax) : ['no copy'];
  ok(lax && bad.some((b) => /ANOTHER session's activity entry: ok ≠ not_yours/.test(b)), 'a verdict that lets an agent clear ANOTHER session\'s activity entry fails ① (control)', bad);
  const nofork = mutant('verdict-forgets-the-fork', "  if (caller.pendingFork) return refuse('pending_fork');\n", '');
  const bad2 = nofork ? verdictFailures(nofork) : ['no copy'];
  ok(nofork && bad2.some((b) => /FORK still borrowing/.test(b)), 'a verdict that forgets the pending fork fails ① (control)', bad2);
  const jobok = mutant('verdict-lets-a-job-token-in', "  if (caller.role === 'job') return refuse('job_token');\n", '');
  const bad3 = jobok ? verdictFailures(jobok) : ['no copy'];
  ok(jobok && bad3.some((b) => /JOB TOKEN/.test(b)), 'a verdict that lets a job token through fails ① (control)', bad3);
  const drops = mutant('clear-drops-a-field', '  record.clearedAt = Number.isFinite(at) ? at : Date.now();', '  delete record.session; delete record.sessionKey; delete record.author;\n  record.clearedAt = Number.isFinite(at) ? at : Date.now();');
  const bad4 = drops ? clearedFailures(drops) : ['no copy'];
  ok(drops && bad4.some((b) => /OUTSIDE the text fields|disappeared/.test(b)), 'a clear that drops a field it does not own (the author) fails ② (control)', bad4.slice(0, 3));
  const keeps = mutant('clear-keeps-the-detail', "activity: Object.freeze([['note', 'text'], ['detail', 'drop']]),", "activity: Object.freeze([['note', 'text']]),");
  const bad5 = keeps ? clearedFailures(keeps) : ['no copy'];
  ok(keeps && bad5.some((b) => /activity: detail = /.test(b)), 'a clear that keeps the detail fails ② (control)', bad5.slice(0, 3));
  const zh = mutant('store-writes-the-zh-words', 'const CLEARED_TEXT = "[cleared at the user\'s request]";', "const CLEARED_TEXT = '已按用户要求清除';");
  const bad6 = zh ? storedWords(zh) : ['no copy'];
  ok(zh && bad6.length > 0, 'a store that writes the translated words fails ③ (control)', bad6.slice(0, 2));
  ok(verdictFailures(RC).length === 0 && clearedFailures(RC).length === 0 && storedWords(RC).length === 0, 'the same three checks pass on the real module', [...verdictFailures(RC), ...clearedFailures(RC), ...storedWords(RC)].slice(0, 3));
  // verify r2 controls: a chunker that drops the last part, a snippet that ignores case
  const drop = mutant('chunked-drops-the-tail', '  for (let i = 0; i < a.length; i += size) out.push(a.slice(i, i + size));', '  for (let i = 0; i + size <= a.length; i += size) out.push(a.slice(i, i + size));');
  const bad7 = drop ? chunkFailures(drop) : ['no copy'];
  ok(drop && bad7.some((b) => /450 ⇒/.test(b)), 'a chunker that drops the short last part fails ⑤b (control)', bad7.slice(0, 2));
  const cased = mutant('snippet-case-sensitive', '  const at = v.toLowerCase().indexOf(q.toLowerCase());', '  const at = v.indexOf(q);');
  const bad8 = cased ? snippetFailures(cased) : ['no copy'];
  ok(cased && bad8.some((b) => /not in its own snippet/.test(b)), 'a snippet that ignores the Find box\'s case-insensitive rule fails ⑤b (control)', bad8.slice(0, 2));
}

// ── ⑦ the census ──
for (const row of copiesCensus(M.files, M.dir, ROOT, { minCopies: 8, label: '⑦ ' })) ok(row.pass, row.name, row.detail);

console.log(`\n${fail ? 'FAIL' : 'ALL PASS'} (${pass}${fail ? `, ${fail} failed` : ''})`);
process.exit(fail ? 1 : 0);
