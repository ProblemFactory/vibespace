#!/usr/bin/env node
// test-voice-teach — Dropline voice input P1 (design q-029 §4 + §8 OWNER RULINGS; lane voice-p1-oauth-teach): the PURE
// teach schedule (src/voice-teach.js) and THE ENGINE (src/server/voice-teach-engine.js) over a FAKE vendor client and a
// fake For-you store. Nothing is written to Dropline without the person's press:
//   ① PURE: both switches default OFF; a proposal per conversation at most once an hour; 忽略 remembers 30 days; the
//     per-project tier = file names + identifiers only, ≤ 50/h; the 10-minute context cadence (first = PREVIEW, a 不发
//     previews again, same text skipped); caps terms 6/h + context 6/h; the journal keeps 50.
//   ② ENGINE: teach + context OFF ⇒ ZERO vendor calls across a dictation (not even the vocabulary read); teach ON ⇒ a
//     card + a For-you item and NO /v1/terms; 加入词库 ⇒ ONE /v1/terms with exactly the ticked words; 忽略 ⇒ none and not
//     offered again; the For-you chip = the press; the project tier sends without a card and journals; the context's
//     first send is a PREVIEW, 发送 ⇒ ONE /v1/context with exactly the previewed text, then the 10-minute cadence.
//   ③ RED CONTROLS: a schedule copy that POSTs terms without a confirmation, and one that sends the context without the
//     first-time preview — each turns the matching check above red.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 600) : ''}`); }
};
const T = require(path.join(REPO, 'src/voice-teach.js'));
const VM = require(path.join(REPO, 'src/voice-model.js'));
const ENGINE = path.join(REPO, 'src/server/voice-teach-engine.js');
const H = 3600e3, MIN = 60e3, DAY = 24 * H;
const ON = { teach: true, context: true, autoProjects: [] };

console.log('① the PURE schedule');
{
  const d = T.settingsOf({});
  ok('both switches default OFF; no project opted in', d.teach === false && d.context === false && d.autoProjects.length === 0, d);
  const s0 = T.stateOf(null);
  const now = 1e12;
  ok('teach OFF ⇒ nothing proposed, nothing automatic', T.proposalVerdict(s0, { conv: 'c1', terms: ['commentsBatches'], now, settings: { teach: false }, kindOf: VM.termKind }).why === 'teach-off');
  const v1 = T.proposalVerdict(s0, { conv: 'c1', terms: ['commentsBatches', 'doc-window-ui.js', 'Zephyr Team'], now, settings: ON, kindOf: VM.termKind });
  ok('teach ON ⇒ a PROPOSAL of the fresh terms; nothing automatic', v1.propose.join() === 'commentsBatches,doc-window-ui.js,Zephyr Team' && v1.auto.length === 0, v1);
  const s1 = { ...s0, lastProposal: { c1: now } };
  ok('per conversation at most once an hour (59 min: none; 61 min: again; another conversation: at once)',
    T.proposalVerdict(s1, { conv: 'c1', terms: ['fooBar'], now: now + 59 * MIN, settings: ON, kindOf: VM.termKind }).why === 'hourly'
    && T.proposalVerdict(s1, { conv: 'c1', terms: ['fooBar'], now: now + 61 * MIN, settings: ON, kindOf: VM.termKind }).propose.length === 1
    && T.proposalVerdict(s1, { conv: 'c2', terms: ['fooBar'], now: now + MIN, settings: ON, kindOf: VM.termKind }).propose.length === 1);
  const s2 = T.ignore(s0, ['fooBar'], now);
  ok('忽略 remembers the terms 30 days (29 d: not offered; 31 d: offered again, pruned)',
    T.proposalVerdict(s2, { conv: 'c1', terms: ['fooBar'], now: now + 29 * DAY, settings: ON, kindOf: VM.termKind }).why === 'nothing-new'
    && T.proposalVerdict(T.prune(s2, now + 31 * DAY), { conv: 'c1', terms: ['fooBar'], now: now + 31 * DAY, settings: ON, kindOf: VM.termKind }).propose.join() === 'fooBar');
  const P = { ...ON, autoProjects: ['/w/vibespace'] };
  const v3 = T.proposalVerdict(s0, { conv: 'c1', cwd: '/w/vibespace', terms: ['commentsBatches', 'doc-window-ui.js', 'Zephyr Team'], now, settings: P, kindOf: VM.termKind, autoFrom: ['commentsBatches', 'doc-window-ui.js'] });
  ok('the per-project tier: that project\'s file names + identifiers go without a card; a name still asks', v3.auto.join() === 'commentsBatches,doc-window-ui.js' && v3.propose.join() === 'Zephyr Team', v3);
  const v3b = T.proposalVerdict(s0, { conv: 'c1', cwd: '/w/vibespace', terms: ['commentsBatches', 'jane.doe', 'my_private_plan99'], now, settings: P, kindOf: VM.termKind, autoFrom: ['commentsBatches'] });
  ok('…named by SOURCE, never by shape: a file- or identifier-shaped word autoFrom does not name still asks (voice-verify F2)', v3b.auto.join() === 'commentsBatches' && v3b.propose.join() === 'jane.doe,my_private_plan99', v3b);
  ok('…only for the project opted in (another cwd still asks for everything)', T.proposalVerdict(s0, { conv: 'c1', cwd: '/w/other', terms: ['commentsBatches'], now, settings: P, kindOf: VM.termKind }).auto.length === 0);
  const many = Array.from({ length: 70 }, (_, i) => `term_${i}_x`);
  const s4 = T.recordAuto(s0, 45, now - 10 * MIN);
  ok('…still ≤ 50 an hour (45 sent 10 min ago ⇒ 5 now)', T.proposalVerdict(s4, { conv: 'c1', cwd: '/w/vibespace', terms: many, now, settings: P, kindOf: VM.termKind, autoFrom: many }).auto.length === 5);
  let s5 = s0; for (let i = 0; i < 6; i++) s5 = T.recordCall(s5, 'terms', now - i * MIN);
  ok('caps: 6 terms calls in the hour ⇒ none left; the project tier waits (no auto)', T.capLeft(s5, 'terms', now) === 0 && T.capLeft(s5, 'terms', now + H) === 6 && T.proposalVerdict(s5, { conv: 'c1', cwd: '/w/vibespace', terms: ['fooBar'], now, settings: P, kindOf: VM.termKind }).auto.length === 0);
  const AS = VM.autoSourcesOf({ cwd: '/w/vibespace', files: ['/w/vibespace/src/a-file.js', '/w/other/b-file.js', '/w/vibespace/../x/c-file.js'], messages: [
    { role: 'user', content: [{ type: 'text', text: 'tell jane.doe my_private_plan99 about `userSpanWord` and src/user/path.js' }] },
    { role: 'assistant', content: [{ type: 'text', text: 'Sure: `src/lib/foo.ts` and\n```js\nconst parseConfig = loadIt();\n```\nalso bareCamelWord, see lib/bar.mjs' }] }] });
  const want = ['a-file.js', 'foo.ts', 'parseConfig', 'loadIt', 'bar.mjs'], never = ['b-file.js', 'c-file.js', 'jane.doe', 'my_private_plan99', 'userSpanWord', 'path.js', 'bareCamelWord'];
  ok('autoSourcesOf: project files under cwd, AGENT code-span identifiers, AGENT-named paths — never the person\'s words (prose, spans or paths) nor agent prose words (voice-verify F2)', want.every((w) => AS.includes(w)) && !never.some((w) => AS.includes(w)), AS);
  ok('context OFF ⇒ none', T.contextVerdict(s0, { conv: 'c1', hash: 'h1', now, settings: { context: false } }).why === 'context-off');
  ok('context: the FIRST send of a conversation is a PREVIEW', T.contextVerdict(s0, { conv: 'c1', hash: 'h1', now, settings: ON }).act === 'preview');
  const s6 = { ...s0, ctxSent: { c1: { at: now, hash: 'h1' } } };
  ok('context cadence: < 10 min none; ≥ 10 min + same text none; ≥ 10 min + changed text SEND (no dialog)',
    T.contextVerdict(s6, { conv: 'c1', hash: 'h2', now: now + 9 * MIN, settings: ON }).why === 'cadence'
    && T.contextVerdict(s6, { conv: 'c1', hash: 'h1', now: now + 11 * MIN, settings: ON }).why === 'same'
    && T.contextVerdict(s6, { conv: 'c1', hash: 'h2', now: now + 11 * MIN, settings: ON }).act === 'send');
  ok('a 不发 previews again (after the cadence), never a silent send', T.contextVerdict({ ...s0, ctxSent: { c1: { at: now, hash: 'h1', declined: true } } }, { conv: 'c1', hash: 'h2', now: now + 11 * MIN, settings: ON }).act === 'preview');
  let s7 = s6; for (let i = 0; i < 6; i++) s7 = T.recordCall(s7, 'context', now + i * MIN);
  ok('context cap 6/h', T.contextVerdict(s7, { conv: 'c1', hash: 'h9', now: now + 11 * MIN, settings: ON }).why === 'cap');
  let s8 = s0; for (let i = 0; i < 60; i++) s8 = T.journalAdd(s8, { at: now + i, kind: 'terms', title: 't' + i, chars: 3 });
  ok('the journal keeps the last 50 rows (time, kind, title, chars, added/skipped)', s8.journal.length === 50 && s8.journal[0].title === 't10' && 'added' in s8.journal[0]);
  ok('the For-you words in zh / ja / en', T.teachWords('zh', 'proposal', { terms: 'a, b' }) === 'Dropline 建议加入词库：a, b' && T.teachWords('zh', 'add') === '加入词库' && T.teachWords('zh', 'ignore') === '忽略' && T.teachWords('ja', 'add') === '辞書に追加' && T.teachWords('xx', 'ignore') === 'Ignore');
}

// ── ② THE ENGINE over a fake client + plugin record + For-you store ──
const MSGS = [
  { role: 'user', content: [{ type: 'text', text: 'please fix commentsBatches in doc-window-ui.js' }] },
  { role: 'assistant', content: [{ type: 'text', text: 'Done: `commentsBatches` now packs notes; see src/doc-model.js and dictation_context.' }, { type: 'tool_use', name: 'Edit', input: { file_path: '/secret/tool_only_name.js' } }] },
];
function rig(enginePath = ENGINE, { settings = {}, model = null } = {}) {
  const calls = [];
  let clock = 1e12;
  const client = {
    connected: () => true,
    vocabulary: async () => { calls.push(['vocabulary']); return ['VibeSpace']; },
    terms: async (list) => { calls.push(['terms', list.slice()]); return { added: list.slice(), skipped: [] }; },
    context: async (b) => { calls.push(['context', b]); return { ok: true }; },
  };
  const rec = { enabled: true, config: { ...settings } };
  const plugin = { peek: () => rec, update: (fn) => fn(rec) };
  const items = [], listeners = [];
  const userTodos = {
    add: (key, it) => { const x = { id: 'ut' + items.length, sessionKey: key, status: 'open', reply: null, ...it }; items.push(x); return x; },
    get: (id) => items.find((x) => x.id === id) || null,
    setStatus: (id, st) => { const x = items.find((i) => i.id === id); if (x) x.status = st; },
    onStatus: (fn) => listeners.push(fn),
    reply: (id, text) => { const x = items.find((i) => i.id === id); x.reply = { text, at: clock }; x.status = 'resolved'; for (const f of listeners) f(x, { status: 'resolved' }); },
  };
  delete require.cache[require.resolve(enginePath)];
  const E = require(enginePath).create({ client, plugin, userTodos, now: () => clock, log: { warn() { }, log() { } }, ...(model ? { model } : {}) });
  return { E, calls, rec, items, userTodos, tick: (ms) => { clock += ms; }, writes: () => calls.filter((c) => c[0] !== 'vocabulary') };
}
const seenArgs = (over = {}) => ({ conv: 'conv-1', title: 'Doc comments', cwd: '/w/vibespace', messages: MSGS, uiLang: 'zh', ...over });

console.log('② the engine');
{
  const r = rig();
  const out = await r.E.seen(seenArgs());
  ok('teach OFF + context OFF ⇒ a full dictation reaches NOTHING (zero vendor calls, not even the vocabulary read)', r.calls.length === 0 && !out.proposal && !out.preview, r.calls);
}
let proposalCheck, previewCheck;
{
  const r = rig(ENGINE, { settings: { teach: true } });
  const out = await r.E.seen(seenArgs());
  const p = out.proposal;
  proposalCheck = (rr, o) => !!o.proposal && rr.writes().length === 0;
  ok('teach ON ⇒ a PROPOSAL (card) + ONE For-you item with 加入词库 / 忽略 — and NO /v1/terms', proposalCheck(r, out) && r.items.length === 1 && r.items[0].options.join() === '加入词库,忽略' && r.items[0].text.startsWith('Dropline 建议加入词库：') && r.items[0].origin === 'server', { calls: r.calls, items: r.items });
  ok('the proposal = this conversation\'s identifiers + file names, minus the dictionary; never a tool call\'s argument', p && p.terms.includes('commentsBatches') && p.terms.includes('doc-window-ui.js') && p.terms.includes('doc-model.js') && !p.terms.includes('tool_only_name.js') && !p.terms.includes('VibeSpace'), p && p.terms);
  ok('the dictionary was READ (no confirmation needed for a read) once', r.calls.filter((c) => c[0] === 'vocabulary').length === 1);
  const pick = ['commentsBatches', 'doc-window-ui.js'];
  const res = await r.E.confirm(p.id, [...pick, 'notInTheProposal']);
  const w = r.writes();
  ok('加入词库 ⇒ ONE POST /v1/terms with EXACTLY the two ticked words (a word not in the proposal is dropped)', w.length === 1 && w[0][0] === 'terms' && w[0][1].join() === pick.join() && res.added.length === 2, w);
  ok('…the card is gone, its For-you item closed, the journal row says terms · title · chars · added', r.E.view().proposals.length === 0 && r.items[0].status === 'done' && r.E.view().journal[0].kind === 'terms' && r.E.view().journal[0].added === 2 && r.E.view().journal[0].title === 'Doc comments');
  r.tick(61 * MIN);
  const again = await r.E.seen(seenArgs());
  ok('an hour later the unticked words come back as a new proposal (only a press sent the two)', again.proposal && again.proposal.terms.includes('doc-model.js') && r.writes().length === 1);
  await r.E.ignore(again.proposal.id);
  r.tick(61 * MIN);
  const third = await r.E.seen(seenArgs());
  ok('忽略 ⇒ nothing leaves, and those words are not offered again', r.writes().length === 1 && (!third.proposal || !third.proposal.terms.includes('doc-model.js')), third.proposal);
}
{
  const r = rig(ENGINE, { settings: { teach: true } });
  const out = await r.E.seen(seenArgs({ uiLang: 'en' }));
  r.userTodos.reply(out.proposal.itemId, 'Add to dictionary');
  await new Promise((res) => setTimeout(res, 20));
  ok('the For-you chip IS the press: "Add to dictionary" ⇒ ONE /v1/terms with the whole shown list', r.writes().length === 1 && r.writes()[0][1].join() === out.proposal.terms.join(), r.writes());
}
{
  const r = rig(ENGINE, { settings: { teach: true, autoProjects: ['/w/vibespace'] } });
  const out = await r.E.seen(seenArgs());
  const w = r.writes();
  ok('the per-project tier ⇒ the agent\'s code-span identifier + named path go WITHOUT a card, journaled as this project; the person\'s file name and agent prose still ask (voice-verify F2)', w.length === 1 && w[0][1].join() === 'commentsBatches,doc-model.js' && out.proposal && out.proposal.terms.join() === 'doc-window-ui.js,dictation_context' && r.E.view().journal[0].auto === true, { w, out });
  const r2 = rig(ENGINE, { settings: { teach: true, autoProjects: ['/w/vibespace'] } });
  await r2.E.seen(seenArgs({ cwd: '/w/other' }));
  ok('…another project still asks (no write)', r2.writes().length === 0);
  // voice-verify F2 RED leg: the person's own sentence in an opted-in project — nothing of it leaves without a press;
  // a path in the agent's code span does (the base auto-sent jane.doe + my_private_plan99 here)
  const r3 = rig(ENGINE, { settings: { teach: true, autoProjects: ['/w/vibespace'] } });
  const out3 = await r3.E.seen(seenArgs({ messages: [{ role: 'user', content: [{ type: 'text', text: 'tell jane.doe my_private_plan99 about it' }] }, { role: 'assistant', content: [{ type: 'text', text: 'Sure — see `src/lib/foo.ts`.' }] }] }));
  const w3 = r3.writes();
  ok('the person\'s own words never auto-send (jane.doe, my_private_plan99 ⇒ the card); the agent\'s code-span path does (foo.ts)', w3.length === 1 && w3[0][1].join() === 'foo.ts' && !!out3.proposal && out3.proposal.terms.includes('jane.doe') && out3.proposal.terms.includes('my_private_plan99'), { w3, p: out3.proposal && out3.proposal.terms });
}
{
  const r = rig(ENGINE, { settings: { context: true } });
  const out = await r.E.seen(seenArgs());
  previewCheck = (rr, o) => !!o.preview && rr.writes().length === 0;
  ok('context ON ⇒ the FIRST send is a PREVIEW (title, source VibeSpace, the text) and nothing left', previewCheck(r, out) && out.preview.source === 'VibeSpace' && out.preview.title === 'Doc comments' && out.preview.text.includes('commentsBatches'), { out, calls: r.calls });
  await r.E.answerPreview(out.preview.id, true);
  const w = r.writes();
  ok('发送 ⇒ ONE POST /v1/context with EXACTLY the previewed text', w.length === 1 && w[0][0] === 'context' && w[0][1].text === out.preview.text && w[0][1].title === out.preview.title, w);
  r.tick(5 * MIN);
  const msgs2 = [...MSGS, { role: 'user', content: [{ type: 'text', text: 'now rename fooBarBaz' }] }];
  await r.E.seen(seenArgs({ messages: msgs2 }));
  ok('within 10 minutes: nothing more', r.writes().length === 1);
  r.tick(6 * MIN);
  const later = await r.E.seen(seenArgs({ messages: msgs2 }));
  ok('after 10 minutes with changed text: sent WITHOUT the dialog, journaled as memory', r.writes().length === 2 && !later.preview && later.context && r.E.view().journal[0].kind === 'context');
  const r2 = rig(ENGINE, { settings: { context: true } });
  const o2 = await r2.E.seen(seenArgs());
  await r2.E.answerPreview(o2.preview.id, false);
  ok('不发 ⇒ nothing leaves', r2.writes().length === 0);
}

console.log('③ RED controls (schedule copies)');
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-voice-teach-'));
  try {
    const src = fs.readFileSync(path.join(REPO, 'src/voice-teach.js'), 'utf8');
    const a1 = "  return { auto, propose: rest.slice(0, TEACH_LIMITS.termsPerCall), why: null };";
    const a2 = "  if (!last || last.declined) return { act: 'preview', why: null };";
    ok('CONTROL anchors apply once each', src.split(a1).length === 2 && src.split(a2).length === 2);
    fs.writeFileSync(path.join(dir, 'm1.js'), src.replace(a1, "  return { auto: [...auto, ...rest], propose: [], why: null };"));
    fs.writeFileSync(path.join(dir, 'm2.js'), src.replace(a2, "  if (!last || last.declined) return { act: 'send', why: null };"));
    const m1 = require(path.join(dir, 'm1.js')), m2 = require(path.join(dir, 'm2.js'));
    const r1 = rig(ENGINE, { settings: { teach: true }, model: m1 });
    const o1 = await r1.E.seen(seenArgs());
    ok('CONTROL: a schedule that POSTs /v1/terms without a confirmation ⇒ the "NO /v1/terms before the press" check is RED on it', !proposalCheck(r1, o1) && r1.writes().some((c) => c[0] === 'terms'), r1.writes());
    const r2 = rig(ENGINE, { settings: { context: true }, model: m2 });
    const o2 = await r2.E.seen(seenArgs());
    ok('CONTROL: a schedule that sends the context without the first-time preview ⇒ the PREVIEW check is RED on it', !previewCheck(r2, o2) && r2.writes().some((c) => c[0] === 'context'), r2.writes());
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
