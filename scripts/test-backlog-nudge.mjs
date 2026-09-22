#!/usr/bin/env node
// THE BACKLOG CLEANUP NUDGE (2026-09-22): the store has no cap, so a session
// can hoard parked items. When the OPEN items a session holds (claimed by it
// OR parked by it — `addedBy`) reach `tasks.backlogNudgeAt` (default 20, 0 =
// off), ONE paragraph (src/backlog-select.js `nudgeText`, English, ≤ 500 B)
// asks it to finish / drop / merge before parking more — on the answer of
// every verb that can grow what it holds (add / edit / claim; never done /
// drop / unclaim / show), at the end of the backlog note every FULL context
// injection carries (SessionStart / the codex first prompt / a full
// re-delivery), and on EVERY other prompt through prompt-context. Several
// groups over the threshold share ONE paragraph under ONE 500 B budget.
// Legs, each with a NEGATIVE CONTROL (a patched copy that must fail it):
// (1) PURE — nudgeThreshold, ownedOpen (addedBy counts, dedup), backlogNudge
//     (below → null, at → nudge, stale / oldest, 0 = never), nudgeText (≤ 500 B
//     with 50 × 500-char CJK items, the three verbs, the --group prefix),
//     nudgeTextAll (1 entry = nudgeText's words; N entries = ONE ≤ 500 B
//     paragraph naming every group);
// (2) ROUTE — the REAL /api/agent/task-backlog on the fake-express harness:
//     25 owned ⇒ add / edit / claim carry `nudge`, done / drop / unclaim / show
//     do not; a session holding 3 never; the threshold is read through
//     serverSetting('tasks.backlogNudgeAt');
// (3) NOTE — `_backlogNoteLines` ends with the same paragraph over the
//     threshold (the store's getSetting), not under it — the note of every
//     full context injection;
// (3b) EVERY TURN — the REAL task-context then prompt-context ×2: the quiet
//     turns carry the paragraph too (a diff turn as well, a full-delivery turn
//     exactly once, task tool off / threshold 0 never);
// (3c) SIZE — 2 / 3 groups × 60 owned CJK items: the REAL task-context stays
//     ≤ 9600 B UNTRIMMED with ONE paragraph; 5 groups is capped inline;
// (4) CLI — the REAL data/bin/vibespace-task over loopback prints
//     `note: <nudge text>` on add / edit / claim, plus source pins;
// (5) the setting row + its zh/ja keys + the wiring pins.
// Run: node scripts/test-backlog-nudge.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sel = require('../src/backlog-select.js');
const { TaskGroupManager } = require('../src/task-groups.js');
const { setupAgentRoutes } = require('../src/agent-routes.js');

let failed = 0, passed = 0;
const check = (name, cond, extra) => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); return; }
  failed++; console.error(`  ✗ ${name}${extra ? `\n    ${extra}` : ''}`);
};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-backlog-nudge-'));
let patchN = 0;
const loadPatched = (rel, cuts) => {
  const src = fs.readFileSync(path.join(REPO, rel), 'utf8');
  let out = src;
  for (const [a, b] of cuts) { if (!out.includes(a)) throw new Error(`patch anchor missing in ${rel}: ${a.slice(0, 60)}`); out = out.split(a).join(b); }
  out = out.replace(/require\('\.\/([^']+)'\)/g, (_, m) => `require(${JSON.stringify(path.join(REPO, path.dirname(rel), m))})`);
  out = out.replace(/require\('([a-z@][^'.][^']*)'\)/g, (_, m) => `require(${JSON.stringify(require.resolve(m, { paths: [path.join(REPO, path.dirname(rel))] }))})`);
  const f = path.join(tmp, `patched-${patchN++}-${path.basename(rel)}`);
  fs.writeFileSync(f, out);
  return require(f);
};
const DAY = 86400000;
const NOW = Date.now(); // the route stamps its own clock — ages are whole days off this
const bytes = (s) => Buffer.byteLength(s, 'utf-8');
// n open items owned by `key` — claimed; ages 0, 2, 4, … days
const owned = (n, key, { by = 'claim', prefix = 'o', text = null } = {}) => Array.from({ length: n }, (_, i) => ({
  id: `B-${prefix}${String(i).padStart(3, '0')}`.replace(/[^B0-9a-f-]/g, 'a'), text: text || `${prefix} item ${i}`, status: 'open', priority: 'normal',
  addedAt: NOW - i * 2 * DAY, addedBy: by === 'add' ? key : 'claude:someone', claimedBy: by === 'claim' ? [key] : [],
}));

// ── (1) PURE ──
console.log('(1) pure');
const pureLegs = (m) => {
  const r = {};
  r.below = m.backlogNudge(owned(19, 'k'), 'k', { threshold: 20, nowMs: NOW });
  r.at = m.backlogNudge(owned(20, 'k'), 'k', { threshold: 20, nowMs: NOW });
  r.addedBy = m.backlogNudge(owned(20, 'k', { by: 'add' }), 'k', { threshold: 20, nowMs: NOW });
  r.zero = m.backlogNudge(owned(50, 'k'), 'k', { threshold: 0, nowMs: NOW });
  const big = Array.from({ length: 50 }, (_, i) => ({ id: `B-${(0x1000 + i).toString(16)}`, text: '积压'.repeat(250), status: 'open', addedAt: NOW - i * DAY, claimedBy: ['k'] }));
  r.bigText = m.nudgeText(m.backlogNudge(big, 'k', { threshold: 20, nowMs: NOW }), '--group g-0123abcd ');
  return r;
};
{
  check('nudgeThreshold: absent/blank/NaN ⇒ 20 · negative ⇒ 0 · fractions floor', sel.nudgeThreshold(undefined) === 20 && sel.nudgeThreshold('') === 20 && sel.nudgeThreshold('x') === 20 && sel.nudgeThreshold(-3) === 0 && sel.nudgeThreshold(7.9) === 7 && sel.nudgeThreshold(0) === 0 && sel.NUDGE_DEFAULT === 20);
  // a stored value of the WRONG TYPE is the default — Number(true) = 1 would
  // nudge every session holding a single item; a numeric string still counts
  const typeLeg = (m) => [true, false, {}, [], [5], ' ', () => 3].every((v) => m.nudgeThreshold(v) === 20) && m.nudgeThreshold('7') === 7 && m.nudgeThreshold(' 12 ') === 12 && m.nudgeThreshold('0') === 0;
  check('nudgeThreshold: boolean / object / array / function / whitespace ⇒ 20; a numeric string counts', typeLeg(sel), [true, false, {}, [], [5], ' '].map((v) => sel.nudgeThreshold(v)).join(','));
  const coerce = loadPatched('src/backlog-select.js', [["else if (typeof v === 'string' && v.trim() !== '') n = Number(v);\n  else return NUDGE_DEFAULT;", "else if (v === undefined || v === null || v === '') return NUDGE_DEFAULT;\n  else n = Number(v);"]]);
  check('negative control: a copy that coerces any type with Number() FAILS the type leg', !typeLeg(coerce) && coerce.nudgeThreshold(true) === 1);
  const both = [{ id: 'B-0001', status: 'open', addedBy: 'k', claimedBy: ['k'] }, { id: 'B-0002', status: 'open', addedBy: 'k', claimedBy: [] }, { id: 'B-0003', status: 'open', addedBy: 'x', claimedBy: ['k'] }, { id: 'B-0004', status: 'done', addedBy: 'k', claimedBy: ['k'] }, { id: 'B-0005', status: 'open', addedBy: 'x', claimedBy: ['y'] }];
  check('ownedOpen = open items claimed by OR parked by the key, each once; resolved and foreign excluded', sel.ownedOpen(both, 'k').map((b) => b.id).join(',') === 'B-0001,B-0002,B-0003', sel.ownedOpen(both, 'k').map((b) => b.id).join(','));
  check('ownedOpen with no session key = nothing', sel.ownedOpen(both, null).length === 0);
  const r = pureLegs(sel);
  check('below the threshold (19 < 20) ⇒ null', r.below === null);
  check('at the threshold ⇒ a nudge {owned, stale, oldest, threshold}', r.at && r.at.owned === 20 && r.at.threshold === 20, JSON.stringify(r.at));
  check('stale = items older than 14 d (ages 0,2,…,38 d ⇒ 12 older than 14)', r.at && r.at.stale === 12, r.at && r.at.stale);
  check('oldest = the 3 oldest, oldest first, with whole-day ages', r.at && r.at.oldest.map((o) => `${o.id}:${o.ageDays}`).join(',') === 'B-a019:38,B-a018:36,B-a017:34', r.at && JSON.stringify(r.at.oldest));
  check('an item PARKED by the session (addedBy, not claimed) counts as held', r.addedBy && r.addedBy.owned === 20);
  check('threshold 0 = never, however many are held', r.zero === null);
  check('text ≤ 500 B with 50 items of 500-char CJK text', bytes(r.bigText) <= 500, `${bytes(r.bigText)} B`);
  const txt = sel.nudgeText(r.at, '');
  check('the text names the count, the stale count and the oldest ids', /^You hold 20 open backlog items in this group \(12 older than 14 d; oldest: \[B-a019\] 38d "o item 19", \[B-a018\] 36d/.test(txt), txt);
  check('the text names the three cleanup verbs', txt.includes('`vibespace-task backlog-done <id>`') && txt.includes('`backlog-drop <id>`') && txt.includes('`backlog-edit <id> --detail`'), txt);
  check('the --group prefix rides the command', sel.nudgeText(r.at, '--group g-1 ').includes('`vibespace-task --group g-1 backlog-done <id>`'));
  check('a multi-line item text is one line in the paragraph', !sel.nudgeText(sel.backlogNudge(owned(3, 'k', { text: 'a\nb\n\nc' }), 'k', { threshold: 3, nowMs: NOW }), '').includes('\n'));
  check('nudgeText(null) = ""', sel.nudgeText(null) === '');
  // nudgeTextAll — the several-groups form
  const ent = (n, grp) => ({ nudge: sel.backlogNudge(owned(n, 'k', { prefix: grp.slice(-1), text: '积压'.repeat(250) }), 'k', { threshold: 20, nowMs: NOW }), gid: `--group ${grp} `, group: grp });
  const e1 = ent(25, 'g-a'), e2 = ent(30, 'g-b');
  check('nudgeTextAll of ONE entry = nudgeText of it (one wording)', sel.nudgeTextAll([e1]) === sel.nudgeText(e1.nudge, e1.gid));
  const two = sel.nudgeTextAll([e1, e2]);
  check('nudgeTextAll of two = ONE paragraph naming both groups, the total, the verbs', /^You hold 55 open backlog items across 2 Task Groups/.test(two) && two.includes('g-a: 25 (') && two.includes('g-b: 30 (') && two.includes('`vibespace-task --group <group> backlog-done <id>`') && !two.includes('\n'), two);
  const many = sel.nudgeTextAll(Array.from({ length: 40 }, (_, i) => ent(25, `g-${'x'.repeat(40)}-${i}`)));
  check('nudgeTextAll stays ≤ 500 B with 40 long-named groups (groups collapse into "+N more")', bytes(many) <= 500 && /\+\d+ more groups/.test(many), `${bytes(many)} B ${many}`);
  check('nudgeTextAll of nothing / null nudges = ""', sel.nudgeTextAll([]) === '' && sel.nudgeTextAll([{ nudge: null }]) === '');
  // NEGATIVE CONTROLS
  const noAddedBy = pureLegs(loadPatched('src/backlog-select.js', [["if (!claimed && b.addedBy !== sessionKey) continue;", 'if (!claimed) continue;']]));
  check('negative control: a copy that ignores addedBy FAILS the parked-counts leg', noAddedBy.addedBy === null);
  const noOff = pureLegs(loadPatched('src/backlog-select.js', [['if (th <= 0) return null;', '']]));
  check('negative control: a copy without the 0 = off gate FAILS the threshold-0 leg', noOff.zero !== null);
  const noBudgetMod = loadPatched('src/backlog-select.js', [['const NUDGE_MAX_BYTES = 500;', 'const NUDGE_MAX_BYTES = 5000;']]);
  const noBudget = pureLegs(noBudgetMod);
  check('negative control: a copy without the 500 B budget FAILS the size leg', bytes(noBudget.bigText) > 500, `${bytes(noBudget.bigText)} B`);
  check('negative control: …and FAILS the 40-group leg', bytes(noBudgetMod.nudgeTextAll(Array.from({ length: 40 }, (_, i) => ent(25, `g-${'x'.repeat(40)}-${i}`)))) > 500);
}

// ── (2) ROUTE ──
console.log('(2) route');
let setting; // what serverSetting('tasks.backlogNudgeAt') answers
let storeSetting; // what the store's getSetting answers
const tasks = new TaskGroupManager({ dataDir: tmp, onChange: () => {}, getSetting: (k) => (k === 'tasks.backlogNudgeAt' ? storeSetting : undefined) });
const cwd = path.join(tmp, 'work'); fs.mkdirSync(cwd, { recursive: true });
const g = tasks.create({ title: 'nudge', objective: 'obj', folders: [cwd] });
const mkRoutes = (mod, settingKeyReads = []) => {
  const routes = {};
  const app = { get: (p, h) => { routes[`GET ${p}`] = h; }, post: (p, h) => { routes[`POST ${p}`] = h; } };
  mod.setupAgentRoutes({
    app, activeSessions: new Map([['big', { agentToken: 'vsst_big', backend: 'claude', cwd, name: 'big' }], ['small', { agentToken: 'vsst_small', backend: 'claude', cwd, name: 'small' }]]), tasks,
    sessionStatus: { snapshot: () => ({}), get: () => null, consumeNotice: () => null, consumeNotices: () => [], rekey: () => {}, clear: () => null, setByUser: () => {} },
    SessionStatusManager: { renderNotice: () => '', renderNotices: () => '' },
    userTodos: { rekey: () => {}, forSession: () => [], resolveByAgent: () => null, add: () => ({}) },
    sessionStatusKey: (s, id) => `claude:${id}`,
    serverSetting: (k) => { settingKeyReads.push(k); return k === 'tasks.backlogNudgeAt' ? setting : undefined; },
    scheduleCtxSync: () => {}, remoteCtxBaseFor: () => null,
  });
  const call = (tok, method, p, body) => {
    let out, code = 200;
    const res = { json: (o) => { out = o; return res; }, status: (c) => { code = c; return res; } };
    routes[`${method} ${p}`]({ headers: { authorization: `Bearer ${tok}` }, query: {}, body: body || {} }, res);
    return { out, code };
  };
  return { routes, call };
};
const seed = () => tasks.update(g.id, { backlog: [...owned(24, 'claude:big', { prefix: 'b' }), ...owned(3, 'claude:small', { prefix: 'c' }), { id: 'B-f00d', text: 'free', status: 'open', addedAt: NOW, addedBy: 'claude:x', claimedBy: [] }] });
const routeLegs = (mod) => {
  const { call } = mkRoutes(mod);
  const r = {};
  setting = undefined; seed();
  r.add = call('vsst_big', 'POST', '/api/agent/task-backlog', { add: 'one more' });
  r.afterAdd = JSON.parse(JSON.stringify(tasks.get(g.id).backlog));
  const firstId = tasks.get(g.id).backlog.find((b) => b.addedBy === 'claude:big' || (b.claimedBy || []).includes('claude:big')).id;
  r.edit = call('vsst_big', 'POST', '/api/agent/task-backlog', { edit: firstId, text: 'reworded' });
  r.claim = call('vsst_big', 'POST', '/api/agent/task-backlog', { claim: 'B-f00d' });
  r.unclaim = call('vsst_big', 'POST', '/api/agent/task-backlog', { unclaim: 'B-f00d' });
  r.show = call('vsst_big', 'POST', '/api/agent/task-backlog', { show: firstId });
  r.done = call('vsst_big', 'POST', '/api/agent/task-backlog', { done: firstId });
  const second = tasks.get(g.id).backlog.find((b) => b.status === 'open' && (b.claimedBy || []).includes('claude:big')).id;
  r.drop = call('vsst_big', 'POST', '/api/agent/task-backlog', { drop: second });
  r.small = call('vsst_small', 'POST', '/api/agent/task-backlog', { add: 'small add' });
  r.groupArg = call('vsst_big', 'POST', '/api/agent/task-backlog', { add: 'with group', group: g.id });
  setting = 5;
  r.small5 = call('vsst_small', 'POST', '/api/agent/task-backlog', { add: 'small add 2' });
  setting = 100;
  r.big100 = call('vsst_big', 'POST', '/api/agent/task-backlog', { add: 'under a high bar' });
  setting = 0;
  r.big0 = call('vsst_big', 'POST', '/api/agent/task-backlog', { add: 'nudge off' });
  setting = undefined;
  return r;
};
{
  const reads = [];
  mkRoutes({ setupAgentRoutes }, reads);
  const r = routeLegs({ setupAgentRoutes });
  check('add by a session holding 24 (→ 25) answers with nudge {text, owned, stale, threshold} beside the item', r.add.code === 200 && r.add.out.item && r.add.out.nudge && r.add.out.nudge.owned === 25 && r.add.out.nudge.threshold === 20 && typeof r.add.out.nudge.stale === 'number' && /^You hold 25 open backlog items/.test(r.add.out.nudge.text), JSON.stringify(r.add.out.nudge));
  check('the route text IS nudgeText of the stored backlog (one wording)', r.add.out.nudge && r.add.out.nudge.text === sel.nudgeText(sel.backlogNudge(r.afterAdd, 'claude:big', { threshold: 20 }), ''), r.add.out.nudge && r.add.out.nudge.text);
  check('edit carries the nudge', r.edit.code === 200 && !!r.edit.out.nudge);
  check('claim carries the nudge (26 held)', r.claim.code === 200 && r.claim.out.nudge && r.claim.out.nudge.owned === 26, JSON.stringify(r.claim.out.nudge));
  check('unclaim never nudges', r.unclaim.code === 200 && !('nudge' in r.unclaim.out));
  check('show never nudges', r.show.code === 200 && !('nudge' in r.show.out));
  check('done never nudges', r.done.code === 200 && !('nudge' in r.done.out));
  check('drop never nudges', r.drop.code === 200 && !('nudge' in r.drop.out));
  check('a session holding 3 (→ 4) gets no nudge', r.small.code === 200 && !('nudge' in r.small.out));
  check('an explicit --group puts the prefix in the commands', r.groupArg.out.nudge && r.groupArg.out.nudge.text.includes(`vibespace-task --group ${g.id} backlog-done <id>`), r.groupArg.out.nudge && r.groupArg.out.nudge.text);
  check('serverSetting 5 ⇒ the small session (5 held) is nudged with threshold 5', r.small5.out.nudge && r.small5.out.nudge.threshold === 5 && r.small5.out.nudge.owned === 5, JSON.stringify(r.small5.out.nudge));
  check('serverSetting 100 ⇒ no nudge at 25', !('nudge' in r.big100.out));
  check('serverSetting 0 ⇒ off', !('nudge' in r.big0.out));
  // NEGATIVE CONTROLS
  const allVerbs = routeLegs(loadPatched('src/agent-routes.js', [['if (added || edit !== undefined || claim !== undefined) {', 'if (true) {']]));
  check('negative control: a copy that nudges on every verb FAILS the done / drop legs', !!allVerbs.done.out.nudge && !!allVerbs.drop.out.nudge);
  const noSetting = routeLegs(loadPatched('src/agent-routes.js', [["let raw; try { raw = serverSetting('tasks.backlogNudgeAt'); } catch { raw = undefined; }", 'let raw;']]));
  check('negative control: a copy that never reads the setting FAILS the threshold-5 leg', !noSetting.small5.out.nudge);
}

// ── (3) REMINDER ──
console.log('(3) the backlog note (every full context injection)');
const reminderLegs = (TGM) => {
  const t = new TGM({ dataDir: fs.mkdtempSync(path.join(tmp, 'rem-')), onChange: () => {}, getSetting: (k) => (k === 'tasks.backlogNudgeAt' ? storeSetting : undefined) });
  const grp = t.create({ title: 'rem', objective: 'o', folders: [] });
  const r = {};
  storeSetting = undefined;
  t.update(grp.id, { backlog: owned(25, 'claude:me', { prefix: 'd' }) });
  r.over = t._backlogNoteLines(t.get(grp.id), { sessionKey: 'claude:me' });
  r.overGid = t._backlogNoteLines(t.get(grp.id), { sessionKey: 'claude:me', gid: `--group ${grp.id} ` });
  storeSetting = 30;
  r.settingHigh = t._backlogNoteLines(t.get(grp.id), { sessionKey: 'claude:me' });
  r.override = t._backlogNoteLines(t.get(grp.id), { sessionKey: 'claude:me', nudgeAt: 10 });
  storeSetting = undefined;
  t.update(grp.id, { backlog: owned(10, 'claude:me', { prefix: 'e' }) });
  r.under = t._backlogNoteLines(t.get(grp.id), { sessionKey: 'claude:me' });
  r.gid = grp.id;
  r.store = t;
  return r;
};
{
  const r = reminderLegs(TaskGroupManager);
  const last = r.over[r.over.length - 1];
  check('over the threshold the note ENDS with the nudge paragraph, one line', /^You hold 25 open backlog items in this group/.test(last) && !last.includes('\n'), last);
  check('the paragraph comes after the count line', /^\(group backlog holds 25 open/.test(r.over[r.over.length - 2]), r.over[r.over.length - 2]);
  check('multi-group gid prefix rides the reminder too', r.overGid[r.overGid.length - 1].includes(`vibespace-task --group ${r.gid} backlog-done`));
  check('the store setting (getSetting) is honoured: 30 ⇒ no paragraph at 25', !r.settingHigh.some((l) => /^You hold/.test(l)));
  check('an explicit nudgeAt overrides the setting', /^You hold 25/.test(r.override[r.override.length - 1]));
  check('under the threshold no paragraph', !r.under.some((l) => /^You hold/.test(l)), r.under.join(' | '));
  check('renderContext (a full context injection) carries it for a session over the threshold', (() => {
    r.store.update(r.gid, { backlog: owned(22, 'claude:me', { prefix: 'f' }) });
    return /You hold 22 open backlog items/.test(r.store.renderContext(r.gid, { sessionKey: 'claude:me' }));
  })());
  const cut = reminderLegs(loadPatched('src/task-groups.js', [['      if (e) out.push(nudgeTextAll([e]));\n', '']]).TaskGroupManager);
  check('negative control: a copy without the push FAILS the over-threshold leg', !/^You hold/.test(cut.over[cut.over.length - 1]));
}

// ── (3b) EVERY TURN + (3c) SIZE — the REAL hook routes ──
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const paragraphs = (x) => (String(x).match(/You hold \d+ open backlog items/g) || []).length;
const ctxHarness = (routesMod, TGM, { groups = 1, n = 25, cjk = false, backend = 'claude', settings = {} } = {}) => {
  const dir = fs.mkdtempSync(path.join(tmp, 'ctx-'));
  const store = new TGM({ dataDir: dir, onChange: () => {}, getSetting: (k) => settings[k] });
  const work = path.join(dir, 'work'); fs.mkdirSync(work);
  const ids = [];
  for (let gi = 0; gi < groups; gi++) {
    const grp = store.create({ title: `ctx${gi}`, objective: 'obj', folders: [work] });
    ids.push(grp.id);
    store.update(grp.id, { backlog: Array.from({ length: n }, (_, i) => ({ id: `B-${gi}${String(i).padStart(3, '0')}`, text: cjk ? '清理积压事项'.repeat(30) + i : `item ${i}`, status: 'open', priority: 'normal', addedAt: NOW - i * DAY, addedBy: 'claude:x', claimedBy: ['claude:s1'] })) });
  }
  const routes = {};
  const app = { get: (p, h) => { routes[`GET ${p}`] = h; }, post: (p, h) => { routes[`POST ${p}`] = h; } };
  routesMod.setupAgentRoutes({
    app, activeSessions: new Map([['s1', { agentToken: 'vsst_s1', backend, cwd: work, name: 's1' }]]), tasks: store,
    sessionStatus: { snapshot: () => ({}), get: () => null, consumeNotice: () => null, consumeNotices: () => [], rekey: () => {}, clear: () => null, setByUser: () => null, setByAgent: () => null, history: () => [] },
    SessionStatusManager: { renderNotice: () => '', renderNotices: () => '' },
    userTodos: { rekey: () => {}, forSession: () => [], resolveByAgent: () => null, add: () => ({}) },
    sessionStatusKey: (x, id) => `claude:${id}`, serverSetting: (k) => settings[k], scheduleCtxSync: () => {}, remoteCtxBaseFor: () => null,
  });
  const get = (p) => { let out; const res = { json: (o) => { out = o; return res; }, status: () => res }; routes[`GET ${p}`]({ headers: { authorization: 'Bearer vsst_s1' }, query: {}, body: {} }, res); return (out && out.context) || ''; };
  return { store, ids, settings, get };
};
console.log('(3b) every turn');
const turnLegs = async (routesMod, TGM) => {
  const r = {};
  { // claude: SessionStart, then two quiet prompts, then a diff prompt
    const h = ctxHarness(routesMod, TGM);
    r.tc = h.get('/api/agent/task-context');
    r.p1 = h.get('/api/agent/prompt-context');
    r.p2 = h.get('/api/agent/prompt-context');
    await sleep(3);
    h.store.addProgress(h.ids[0], { note: 'moved on' });
    r.p3 = h.get('/api/agent/prompt-context');
    h.settings['tasks.backlogNudgeAt'] = 0;
    r.off = h.get('/api/agent/prompt-context');
    h.settings['tasks.backlogNudgeAt'] = 30;
    r.high = h.get('/api/agent/prompt-context');
    delete h.settings['tasks.backlogNudgeAt'];
    h.settings['agents.toolTask'] = false;
    r.taskOff = h.get('/api/agent/prompt-context');
  }
  { // codex: the FIRST prompt is the full delivery — exactly one paragraph
    const h = ctxHarness(routesMod, TGM, { backend: 'codex' });
    r.cx1 = h.get('/api/agent/prompt-context');
    r.cx2 = h.get('/api/agent/prompt-context');
  }
  { // two groups over the threshold: ONE aggregated paragraph per turn
    const h = ctxHarness(routesMod, TGM, { groups: 2 });
    h.get('/api/agent/task-context');
    r.two = h.get('/api/agent/prompt-context');
  }
  { // a session holding 3
    const h = ctxHarness(routesMod, TGM, { n: 3 });
    h.get('/api/agent/task-context');
    r.small = h.get('/api/agent/prompt-context');
  }
  return r;
};
{
  const r = await turnLegs({ setupAgentRoutes }, TaskGroupManager);
  check('SessionStart (task-context) carries the paragraph once', paragraphs(r.tc) === 1, paragraphs(r.tc));
  check('a quiet prompt carries it (turn 1) — inside the per-turn reminder, which still names the tools', paragraphs(r.p1) === 1 && r.p1.includes('Tools on PATH') && /^<vibespace-reminder>[\s\S]*You hold 25 open backlog items[\s\S]*<\/vibespace-reminder>$/.test(r.p1), r.p1);
  check('…and again on turn 2 (every turn, not once per session)', paragraphs(r.p2) === 1, r.p2);
  check('a diff turn carries the update AND the paragraph', r.p3.includes('<vibespace-task-update>') && paragraphs(r.p3) === 1, r.p3.slice(0, 200));
  check('threshold 0 (via serverSetting) ⇒ no paragraph on the turn', paragraphs(r.off) === 0 && r.off.includes('Tools on PATH'), r.off);
  check('threshold 30 ⇒ none at 25', paragraphs(r.high) === 0);
  check('the task tool off ⇒ none', paragraphs(r.taskOff) === 0, r.taskOff);
  check('codex first prompt (the full delivery) carries it exactly once — never twice', paragraphs(r.cx1) === 1 && r.cx1.includes('<vibespace-task-context>'), paragraphs(r.cx1));
  check('codex second prompt carries it too', paragraphs(r.cx2) === 1);
  check('two groups over ⇒ ONE aggregated paragraph per turn', paragraphs(r.two) === 1 && /You hold 50 open backlog items across 2 Task Groups/.test(r.two), r.two);
  check('a session holding 3 ⇒ none', paragraphs(r.small) === 0);
  // NEGATIVE CONTROLS — the pre-fix route (the nudge rode only full contexts)
  const pre = await turnLegs(loadPatched('src/agent-routes.js', [
    ['const body = [extra, std, backlogNudge]', 'const body = [extra, std]'],
    ['if (outParts.length && backlogNudge) outParts.push(', 'if (false) outParts.push('],
  ]), TaskGroupManager);
  check('negative control: the pre-fix route (full contexts only) FAILS the quiet-turn and diff-turn legs', paragraphs(pre.tc) === 1 && paragraphs(pre.p1) === 0 && paragraphs(pre.p2) === 0 && paragraphs(pre.p3) === 0);
  const dup = await turnLegs(loadPatched('src/agent-routes.js', [['          for (const g of firstGroups) fullCovered.add(g.id);\n', '']]), TaskGroupManager);
  check('negative control: a copy that forgets the full block already carries it FAILS the codex exactly-once leg', paragraphs(dup.cx1) === 2, paragraphs(dup.cx1));
}

console.log('(3c) size');
const sizeLegs = (routesMod, TGM) => {
  const r = {};
  for (const g of [1, 2, 3, 5]) r[g] = ctxHarness(routesMod, TGM, { groups: g, n: 60, cjk: true }).get('/api/agent/task-context');
  return r;
};
{
  const r = sizeLegs({ setupAgentRoutes }, TaskGroupManager);
  for (const g of [1, 2, 3]) check(`${g} group(s) × 60 owned CJK items: task-context ≤ 9600 B UNTRIMMED with exactly ONE paragraph`, bytes(r[g]) <= 9600 && !r[g].includes('context trimmed') && paragraphs(r[g]) === 1 && r[g].trimEnd().endsWith('</vibespace-task-context>'), `${bytes(r[g])} B, ${paragraphs(r[g])} paragraph(s)`);
  check('the multi-group paragraph names every group (aggregated)', /across 3 Task Groups/.test(r[3]));
  check('5 groups: task-context is capped inline (≤ 9600 B, the trim pointer names show --full)', bytes(r[5]) <= 9600 && r[5].includes('context trimmed to stay inline — run `vibespace-task --group <id> show --full`'), `${bytes(r[5])} B`);
  // NEGATIVE CONTROLS
  const perGroup = sizeLegs({ setupAgentRoutes }, loadPatched('src/task-groups.js', [
    ['isLiveClaim, highBudget, mineBudget, nudge: false })', 'isLiveClaim, highBudget, mineBudget })'],
    ["    if (nudge) head.push('', nudge);\n", ''],
  ]).TaskGroupManager);
  check('negative control: the pre-fix per-group paragraph FAILS the one-paragraph leg (2 groups ⇒ 2)', paragraphs(perGroup[2]) === 2, paragraphs(perGroup[2]));
  const noMine = sizeLegs({ setupAgentRoutes }, loadPatched('src/task-groups.js', [['const MINE_LINE_TEXT_BYTES = 1500;', 'const MINE_LINE_TEXT_BYTES = 1e9;']]).TaskGroupManager);
  check('negative control: a copy without the shared item-text budget FAILS the 3-group untrimmed leg', noMine[3].includes('context trimmed') || bytes(noMine[3]) > 9600, `${bytes(noMine[3])} B`);
  const noCap = sizeLegs(loadPatched('src/agent-routes.js', [['context: capInline(context, injectGroups.length > 1) })', 'context })']]), TaskGroupManager);
  check('negative control: task-context without capInline FAILS the 5-group leg', bytes(noCap[5]) > 9600, `${bytes(noCap[5])} B`);
}

// ── (4) CLI ──
console.log('(4) CLI');
{
  const { routes } = mkRoutes({ setupAgentRoutes });
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const u = new URL(req.url, 'http://x');
      const h = routes[`${req.method} ${u.pathname}`];
      if (!h) { res.writeHead(404); res.end('{}'); return; }
      let code = 200;
      const r = { status: (c) => { code = c; return r; }, json: (o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); return r; } };
      h({ headers: { authorization: req.headers.authorization || '' }, query: Object.fromEntries(u.searchParams), body: raw ? JSON.parse(raw) : {} }, r);
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const env = { ...process.env, VIBESPACE_API: `http://127.0.0.1:${server.address().port}`, VIBESPACE_SESSION_TOKEN: 'vsst_big' };
  const run = (...args) => promisify(execFile)(process.execPath, [path.join(REPO, 'data/bin/vibespace-task'), ...args], { env }).then((r) => ({ code: 0, out: r.stdout }), (e) => ({ code: e.code, out: (e.stdout || '') + (e.stderr || '') }));
  setting = undefined; seed();
  const noteLine = (out) => out.split('\n').find((l) => l.startsWith('note: You hold'));
  const a = await run('backlog-add', 'cli item');
  check('backlog-add prints `note: <nudge text>` on its own line, exit 0', a.code === 0 && /^parked as \[B-/.test(a.out) && /^note: You hold 25 open backlog items in this group/.test(noteLine(a.out) || ''), a.out);
  const id = tasks.get(g.id).backlog.find((b) => b.text === 'cli item').id;
  const e = await run('backlog-edit', id, '--text', 'cli item 2');
  check('backlog-edit prints the note, exit 0', e.code === 0 && !!noteLine(e.out), e.out);
  const c = await run('backlog-claim', 'B-f00d');
  check('backlog-claim prints the note, exit 0', c.code === 0 && !!noteLine(c.out), c.out);
  const d = await run('backlog-done', id);
  check('backlog-done prints no note', d.code === 0 && !noteLine(d.out), d.out);
  server.close();
  // source pins (comments stripped) + a cut-copy control
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const pins = (src) => {
    const s = strip(src);
    const branch = (start, end) => { const i = s.indexOf(start); const j = s.indexOf(end, i + 1); return i >= 0 && j > i ? s.slice(i, j) : ''; };
    return {
      helper: /const printNudge = \(r\) => \{ if \(r && r\.nudge && r\.nudge\.text\) console\.log\('note: ' \+ r\.nudge\.text\); \};/.test(s),
      add: /printNudge\(r\);/.test(branch("cmd === 'backlog-add'", '} else if')),
      claim: /printNudge\(r\);/.test(branch("cmd === 'backlog-claim' || cmd === 'backlog-unclaim'", "} else if (cmd === 'backlog-done'")),
      edit: /printNudge\(r\);/.test(branch("cmd === 'backlog-edit'", '} else if')),
      doneNot: !/printNudge/.test(branch("cmd === 'backlog-done' || cmd === 'backlog-drop'", '} else if')),
    };
  };
  const CLI = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-task'), 'utf8');
  const p = pins(CLI);
  check('CLI pin: printNudge prints `note: ` + r.nudge.text', p.helper);
  check('CLI pin: add / claim / edit call printNudge(r); done/drop do not', p.add && p.claim && p.edit && p.doneNot, JSON.stringify(p));
  const cutP = pins(CLI.replace("      printNudge(r);\n    } else {\n      console.log('unclaimed", "    } else {\n      console.log('unclaimed"));
  check('negative control: the claim pin fails on a copy without its printNudge', !cutP.claim && cutP.add);
}

// ── (5) setting + wiring ──
console.log('(5) setting + wiring');
{
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const SCHEMA = fs.readFileSync(path.join(REPO, 'src/lib/settings-schema.js'), 'utf8');
  const row = (SCHEMA.match(/'tasks\.backlogNudgeAt': \{[\s\S]*?\n {2}\},/) || [''])[0];
  check("settings-schema row: number, default 20, min 0, category Integration, t() label + description", /type: 'number', default: 20, min: 0,/.test(row) && /category: t\('Integration'\)/.test(row) && /label: t\('Backlog cleanup nudge: items per session'\)/.test(row) && /description: t\('/.test(row), row);
  const zh = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8');
  const ja = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8');
  const keys = [row.match(/label: t\('([^']+)'\)/)?.[1], row.match(/description: t\('([^']+)'\)/)?.[1]].filter(Boolean);
  check('zh + ja carry the label and the description', keys.length === 2 && keys.every((k) => zh.includes(`  ${JSON.stringify(k)}: `) && ja.includes(`  ${JSON.stringify(k)}: `)));
  const AR = strip(fs.readFileSync(path.join(REPO, 'src/agent-routes.js'), 'utf8'));
  check("agent-routes pin: the route reads serverSetting('tasks.backlogNudgeAt') through nudgeThreshold into backlogNudge", /raw = serverSetting\('tasks\.backlogNudgeAt'\)/.test(AR) && /backlogNudge\(updated\.backlog, key, \{ threshold: nudgeThreshold\(raw\) \}\)/.test(AR) && /text: nudgeText\(n, /.test(AR));
  const TG = strip(fs.readFileSync(path.join(REPO, 'src/task-groups.js'), 'utf8'));
  check("task-groups pin: backlogNudgeAt reads getSetting('tasks.backlogNudgeAt'); the note pushes nudgeTextAll([e]); renderMultiContext aggregates once", /nudgeThreshold\(this\._getSetting\?\.\('tasks\.backlogNudgeAt'\)\)/.test(TG) && /if \(e\) out\.push\(nudgeTextAll\(\[e\]\)\);/.test(TG) && /isLiveClaim, highBudget, mineBudget, nudge: false \}\)/.test(TG) && /const nudge = this\.backlogNudgeFor\(ids, sessionKey, \{ multi: true, tools \}\);\s*if \(nudge\) head\.push\('', nudge\);/.test(TG));
  check('agent-routes pin: prompt-context computes backlogNudgeFor over the groups no full block covers, rides the reminder body or its own block; BOTH hook payloads pass capInline', /tasks\.backlogNudgeFor\(nudgeIds, key, \{ multi: injectGroups\.length > 1, tools: toolFlags \}\)/.test(AR) && /const body = \[extra, std, backlogNudge\]/.test(AR) && /if \(outParts\.length && backlogNudge\) outParts\.push\(/.test(AR) && /context: capInline\(context, injectGroups\.length > 1\)/.test(AR) && /const ctx = capInline\(outParts\.join\('\\n\\n'\), injectGroups\.length > 1\);/.test(AR));
  const SV = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8'); // raw: server.js carries '/*' inside strings, the comment stripper would eat code
  check('server.js pin: the store is built with getSetting = serverSetting; agent-routes gets serverSetting', /new TaskGroupManager\(\{[\s\S]{0,200}getSetting: \(k\) => serverSetting\(k\)/.test(SV) && /setupAgentRoutes\(\{[^}]*serverSetting,/.test(SV));
  const BS = fs.readFileSync(path.join(REPO, 'src/backlog-select.js'), 'utf8');
  check('backlog-select stays PURE (no require, no Buffer — the bundle shares it)', !/\brequire\(/.test(strip(BS)) && !/\bBuffer\./.test(strip(BS)));
}

fs.rmSync(tmp, { recursive: true, force: true });
if (failed) { console.error(`\n${failed} FAILED (${passed} passed)`); process.exit(1); }
console.log(`\nALL PASS (${passed})`);
