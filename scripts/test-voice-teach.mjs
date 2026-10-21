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
//   ④ THE NAG (lane voice-dictionary-nag — a fleet user 2026-10-21: 「一天到晚有这个 Dropline 让我发信息的消息, 站在我的 inbox
//     里」): on the REAL store with a movable clock and the ledger FILE — two conversations' batches = ONE open item (merged
//     in place, same id), filed low (band 5: no pin, no badge); × CONSUMES the words' evidence (nothing sent, the cards leave
//     the sheet, the file 0600 remembers); a new ITEM waits a day (the card does not); the SAME messages read again never
//     re-earn a word, a NEW dictation does; 加入 sends exactly the merged words and they are known at once; the settings
//     list (view().candidates) with per-word 加入 / 忽略; 「词典建议」 off ⇒ nothing proposed; mode settings-only ⇒ no item;
//     a restart reads the ledger and unpins an open item; CONTROL the pre-fix listener (× unheard) ⇒ the dismissed words
//     come back from the same messages the next day — RED
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
  { role: 'assistant', content: [{ type: 'text', text: 'Done: `commentsBatches` now packs notes; see src/doc-model.js and dictation_context. doc-model.js keeps the batches.' }, { type: 'tool_use', name: 'Edit', input: { file_path: '/secret/tool_only_name.js' } }] },
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
  const plugin = { peek: () => rec, update: (fn) => fn(rec), settings: () => rec.config || {}, writeSettings: (p) => { rec.config = { ...(rec.config || {}), ...p }; } }; // lane plugin-settings-p0: the switches are settings rows (this suite's store = rec.config)
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
  ok('teach ON ⇒ a PROPOSAL (card) + ONE For-you item with 加入词库 / 忽略 — and NO /v1/terms', proposalCheck(r, out) && r.items.length === 1 && r.items[0].options.join() === '加入词库,忽略' && r.items[0].text.startsWith('Dropline 建议加入词库：') && r.items[0].origin === 'plugin' && r.items[0].plugin === 'voice-input' && r.items[0].open?.kind === 'plugin-settings', { calls: r.calls, items: r.items });
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
  ok('the For-you chip IS the press: "Add to dictionary" ⇒ ONE /v1/terms with the preselected words it shows', r.writes().length === 1 && r.writes()[0][1].join() === out.proposal.pick.join() && r.items[0].text.endsWith(out.proposal.pick.join(', ')), r.writes());
}
{
  const r = rig(ENGINE, { settings: { teach: true, autoProjects: ['/w/vibespace'] } });
  const out = await r.E.seen(seenArgs());
  const w = r.writes();
  ok('the per-project tier ⇒ the agent\'s code-span identifier + named path go WITHOUT a card, journaled as this project; the person\'s file name still asks (voice-verify F2); an identifier only the agent wrote is no proposal (voice-teach-candidates)', w.length === 1 && w[0][1].join() === 'commentsBatches,doc-model.js' && out.proposal && out.proposal.terms.join() === 'doc-window-ui.js' && r.E.view().journal[0].auto === true, { w, out });
  const r2 = rig(ENGINE, { settings: { teach: true, autoProjects: ['/w/vibespace'] } });
  await r2.E.seen(seenArgs({ cwd: '/w/other' }));
  ok('…another project still asks (no write)', r2.writes().length === 0);
  // voice-verify F2 RED leg: the person's own sentence in an opted-in project — nothing of it leaves without a press;
  // a path in the agent's code span does (the base auto-sent jane.doe + my_private_plan99 here)
  const r3 = rig(ENGINE, { settings: { teach: true, autoProjects: ['/w/vibespace'] } });
  const out3 = await r3.E.seen(seenArgs({ messages: [{ role: 'user', content: [{ type: 'text', text: 'tell jane.doe my_private_plan99 about it' }] }, { role: 'assistant', content: [{ type: 'text', text: 'Sure — see `src/lib/foo.ts`.' }] }] }));
  const w3 = r3.writes();
  ok('the person\'s own words never auto-send (jane.doe and the identifier my_private_plan99 ⇒ the card — ids are what dictation gets wrong, lane voice-teach-ids-allowed); the agent\'s code-span path does (foo.ts)', w3.length === 1 && w3[0][1].join() === 'foo.ts' && !!out3.proposal && out3.proposal.terms.includes('jane.doe') && out3.proposal.terms.includes('my_private_plan99'), { w3, p: out3.proposal && out3.proposal.terms });
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

console.log('②b the card\'s batch (lane voice-teach-candidates): ≤ 12, preselection, the words under the line wait for a recurrence');
{
  const ON = { teach: true };
  const cands = Array.from({ length: 15 }, (_, i) => ({ term: `Word${String.fromCharCode(65 + i)}x`, seen: 2, pick: i % 2 === 0 }));
  const v = T.proposalVerdict(T.stateOf({}), { conv: 'c1', terms: [], candidates: cands, now: 1e12, settings: ON, kindOf: VM.termKind });
  ok('proposePerCard = 12: a batch is the top 12 by rank, `pick` = the preselected of them, 3 cut under the line', T.TEACH_LIMITS.proposePerCard === 12 && v.propose.length === 12 && v.propose[0] === 'WordAx' && v.pick.join() === cands.slice(0, 12).filter((c) => c.pick).map((c) => c.term).join() && v.below.length === 3, v);
  const s1 = T.hold(Object.assign(T.stateOf({}), { lastProposal: { c1: 1e12 } }), 'c1', v.below, v.propose);
  const rest = cands.slice(12);
  const later = 1e12 + 61 * MIN;
  ok('…an hour later the cut words do NOT come back unless seen again', T.proposalVerdict(s1, { conv: 'c1', candidates: rest, now: later, settings: ON, kindOf: VM.termKind }).why === 'nothing-new');
  const again = T.proposalVerdict(s1, { conv: 'c1', candidates: [{ ...rest[0], seen: 3 }, rest[1]], now: later, settings: ON, kindOf: VM.termKind });
  ok('…a cut word seen again (2 → 3) is offered in the next batch, the others still wait', again.propose.join() === rest[0].term, again);
  ok('…a batch with no candidate files no card', T.proposalVerdict(T.stateOf({}), { conv: 'c2', candidates: [], now: 1e12, settings: ON, kindOf: VM.termKind }).propose.length === 0);
  const r = rig(ENGINE, { settings: { teach: true } });
  const out = await r.E.seen(seenArgs({ messages: [{ role: 'assistant', content: [{ type: 'text', text: 'Open Settings, then Settings again.' }] }] }));
  ok('…a card with nothing preselected files NO For-you item (its chip would add nothing); the card waits in Settings', out.proposal && out.proposal.terms.join() === 'Settings' && !out.proposal.pick.length && r.items.length === 0 && r.writes().length === 0, out.proposal);
}

console.log('③ RED controls (schedule copies)');
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-voice-teach-'));
  try {
    const src = fs.readFileSync(path.join(REPO, 'src/voice-teach.js'), 'utf8');
    const a1 = "  return { auto, propose: top.map((c) => c.term), pick: top.filter((c) => c.pick).map((c) => c.term), below: rest.slice(top.length).map((c) => [c.term, Number(c.seen) || 0]), why: null };";
    const a2 = "  if (!last || last.declined) return { act: 'preview', why: null };";
    ok('CONTROL anchors apply once each', src.split(a1).length === 2 && src.split(a2).length === 2);
    fs.writeFileSync(path.join(dir, 'm1.js'), src.replace(a1, "  return { ...none, auto: [...auto, ...top.map((c) => c.term)], why: null };"));
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

console.log('③ THE TRAY\'S DOOR (lane foryou-plugin-notices): the suggestion is a PLUGIN\'s reminder with its door; ONE ✓ by the owner adds, 「全部标为已看」 / × / a failed ✓ send nothing; the older items take the door at boot');
{
  const os = require('node:os');
  const UT = require(path.join(path.dirname(ENGINE), '..', 'user-todos.js'));
  const VP = require(path.join(path.dirname(ENGINE), '..', 'plugins', 'voice-input.js'));
  const { DONE_KEY } = require(ENGINE);
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const MC = mutantCopies('voice-door', path.join(path.dirname(ENGINE), '..', '..'));
  const dirs = [];
  process.on('exit', () => { for (const d of dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } } });
  // the REAL store (its status events, its gate: the plugin's DECLARED capability) under the rig's engine
  const realRig = (enginePath = ENGINE, { settings = { teach: true } } = {}) => {
    const r = rig(enginePath, { settings });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-voice-door-')); dirs.push(dir);
    const ut = new UT.UserTodoManager({ dataDir: dir, expirySweepMs: 0 });
    ut.setPluginGate((id) => id === VP.id && VP.provides.includes('reminders'));
    delete require.cache[require.resolve(enginePath)];
    r.E = require(enginePath).create({ client: { connected: () => true, vocabulary: async () => { r.calls.push(['vocabulary']); return ['VibeSpace']; }, terms: async (l) => { r.calls.push(['terms', l.slice()]); return { added: l.slice(), skipped: [] }; }, context: async (b) => { r.calls.push(['context', b]); return { ok: true }; } },
      plugin: { peek: () => r.rec, update: (fn) => fn(r.rec), settings: () => r.rec.config || {}, writeSettings: (pp) => { r.rec.config = { ...(r.rec.config || {}), ...pp }; } }, userTodos: ut, now: () => 1e12, log: { warn() { }, log() { } } });
    return { ...r, ut };
  };
  const settle = () => new Promise((res) => setTimeout(res, 30));
  const tickLeg = async (enginePath = ENGINE) => {
    const r = realRig(enginePath);
    const out = await r.E.seen(seenArgs());
    const it = r.ut.get(out.proposal.itemId);
    r.ut.setStatus(it.id, 'done', 'user');   // the row's ✓ (POST /api/user-todos/:id {status:'done'})
    await settle();
    return { r, out, it };
  };
  {
    const { r, out, it } = await tickLeg();
    const want = { kind: 'plugin-settings', plugin: 'voice-input', panel: 'teach', prefill: { proposal: out.proposal.id, terms: out.proposal.pick }, done: DONE_KEY };
    ok('the suggestion is filed by the REAL store as a PLUGIN\'s reminder: origin plugin, its plugin id, under that id, with its door (the teach panel, this proposal, its preselected words, what ✓ does)', it.origin === 'plugin' && it.plugin === VP.id && it.sessionKey === VP.id && JSON.stringify(it.open) === JSON.stringify(want), it);
    ok('ONE ✓ by the owner ⇒ ONE POST /v1/terms with exactly the preselected words; the card is gone and the row stays done', r.writes().length === 1 && r.writes()[0][1].join() === out.proposal.pick.join() && r.E.view().proposals.length === 0 && r.ut.get(it.id).status === 'done', r.writes());
  }
  {
    const r = realRig();
    const a = await r.E.seen(seenArgs({ conv: 'conv-a' })), b = await r.E.seen(seenArgs({ conv: 'conv-b', messages: [{ role: 'user', content: [{ type: 'text', text: 'rename fooBarQux in zeta_notes.md, then fooBarQux again' }] }] }));
    const ids = [a, b].map((o) => o.proposal && o.proposal.itemId).filter(Boolean);
    r.ut.setStatusMany([...new Set(ids)], 'done', 'user');   // 「全部标为已看」 on the plugin's section head
    await settle();
    // lane voice-dictionary-nag: the second conversation's batch MERGED into the one open item; a batch marked seen is «not now»
    ok('「全部标为已看」 on the section (a batch) ⇒ nothing sent; the ONE item (both conversations\' batches merged into it) is «not now» — both cards leave the sheet', ids.length === 2 && ids[0] === ids[1] && r.writes().length === 0 && r.E.view().proposals.length === 0, { ids, w: r.writes() });
    const c = await (async () => { const rr = realRig(); const o = await rr.E.seen(seenArgs()); rr.ut.setStatus(o.proposal.itemId, 'dismissed', 'user'); await settle(); return { rr, o }; })();
    ok('× (dismissed) ⇒ nothing sent; «not now» — the batch leaves the sheet (the evidence of its words consumed: ④)', c.rr.writes().length === 0 && c.rr.E.view().proposals.length === 0);
  }
  {
    const r = realRig();
    const out = await r.E.seen(seenArgs());
    r.rec.config.teach = false;   // the owner turned suggesting off after the row was filed
    r.ut.setStatus(out.proposal.itemId, 'done', 'user');
    await settle();
    ok('a ✓ that could not add (teach turned off) sends nothing and REOPENS the row (the words were not sent)', r.writes().length === 0 && r.ut.get(out.proposal.itemId).status === 'open', r.ut.get(out.proposal.itemId).status);
  }
  {
    // the items filed BEFORE the door (origin server, no open): one open with its proposal, one resolved — a new boot
    const r = realRig();
    const out = await r.E.seen(seenArgs());
    const old = r.ut.get(out.proposal.itemId);
    const hist = r.ut.add(VP.id, { origin: 'plugin', plugin: VP.id, text: 'an older handled suggestion' });
    r.ut.setStatus(hist.id, 'done', 'agent');
    r.ut.reshapeItems((x) => { if (x.sessionKey !== VP.id) return false; x.origin = 'server'; delete x.plugin; delete x.open; return true; });
    delete require.cache[require.resolve(ENGINE)];
    const E2 = require(ENGINE).create({ client: { connected: () => true, vocabulary: async () => [], terms: async (l) => ({ added: l, skipped: [] }), context: async () => ({}) }, plugin: { peek: () => r.rec, update: (fn) => fn(r.rec), settings: () => r.rec.config || {}, writeSettings() { } }, userTodos: r.ut, now: () => 1e12, log: { warn() { }, log() { } } });
    const now = r.ut.get(old.id), h = r.ut.get(hist.id);
    ok('BOOT: an OPEN item filed before the door takes origin plugin + its door (this proposal, its words); a RESOLVED one is history and stays as it was', !!E2 && now.origin === 'plugin' && now.plugin === VP.id && now.open && now.open.prefill.proposal === out.proposal.id && h.origin === 'server' && !h.open, { now, h });
  }
  {
    // CONTROLS: the pre-fix listener (only a reply was a press) ⇒ the ✓ sends nothing; a listener blind to `batch` ⇒ 「全部标为已看」 sends
    const src = fs.readFileSync(ENGINE, 'utf8');
    const needle = "      const tick = !reply && ev.status === 'done' && byUser && !ev.batch;";
    ok('the controls\' needle occurs exactly once', src.split(needle).length === 2);
    const noTick = MC.write('src/server/voice-teach-engine.js', src.replace(needle, '      const tick = false;'), 'notick');
    const c1 = await tickLeg(noTick);
    ok('CONTROL RED: the pre-fix engine (only a reply is a press) ⇒ the owner\'s ✓ sends NOTHING (the words wait for ever behind a done row)', c1.r.writes().length === 0);
    const blind = MC.write('src/server/voice-teach-engine.js', src.replace(needle, "      const tick = !reply && ev.status === 'done' && byUser;"), 'blind');
    const r = realRig(blind);
    const a = await r.E.seen(seenArgs());
    r.ut.setStatusMany([a.proposal.itemId], 'done', 'user');
    await settle();
    ok('CONTROL RED: a listener blind to `batch` ⇒ 「全部标为已看」 sends the words (a whole section marked seen would add to the dictionary)', r.writes().length === 1);
  }

  console.log('④ THE NAG (lane voice-dictionary-nag): ONE open item, low; × consumes the evidence (the ledger file); the day\'s pace; only a NEW dictation re-earns; the settings list; 加入 = known');
  {
    const AM = require(path.join(path.dirname(ENGINE), '..', 'attention-model.js'));
    const D = 24 * H;
    const say = (...texts) => texts.map((text) => ({ role: 'user', content: [{ type: 'text', text }] }));
    const quiet = { warn() { }, log() { } };
    const nagRig = ({ settings = { teach: true }, enginePath = ENGINE } = {}) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-voice-nag-')); dirs.push(dir);
      const ut = new UT.UserTodoManager({ dataDir: dir, expirySweepMs: 0 });
      ut.setPluginGate((id) => id === VP.id && VP.provides.includes('reminders'));
      const r = { calls: [], rec: { enabled: true, config: { ...settings } }, clock: 1e12, ut, file: path.join(dir, 'voice-suggestions.json') };
      r.make = () => {
        delete require.cache[require.resolve(enginePath)];
        return require(enginePath).create({ client: { connected: () => true, vocabulary: async () => { r.calls.push(['vocabulary']); return ['VibeSpace']; }, terms: async (l) => { r.calls.push(['terms', l.slice()]); return { added: l.slice(), skipped: [] }; }, context: async (b) => { r.calls.push(['context', b]); return { ok: true }; } },
          plugin: { peek: () => r.rec, update: (fn) => fn(r.rec), settings: () => r.rec.config || {}, writeSettings: (pp) => { r.rec.config = { ...(r.rec.config || {}), ...pp }; } }, userTodos: ut, now: () => r.clock, log: quiet, ledgerFile: r.file });
      };
      r.E = r.make();
      r.writes = () => r.calls.filter((c) => c[0] !== 'vocabulary');
      r.open = () => ut.openItems().filter((i) => i.sessionKey === VP.id);
      r.seen = (conv, ...texts) => r.E.seen({ conv, title: conv, cwd: '/w/p', messages: say(...texts), uiLang: 'en' });
      r.disk = () => JSON.parse(fs.readFileSync(r.file, 'utf8'));
      return r;
    };
    const has = (it, w) => !!it && it.text.slice(it.text.indexOf(':') + 1).split(',').map((x) => x.trim()).includes(w);
    const A1 = 'rename fooBarQux in zeta_notes.md, then fooBarQux again';
    // A — ONE open item: the second conversation's batch merges into it IN PLACE (same id), deduped; filed low ⇒ band 5
    const r = nagRig();
    const a = await r.seen('conv-a', A1);
    r.clock += 5 * MIN;
    const b = await r.seen('conv-b', 'wire quuxFrobnicate into gamma_widget.md, then quuxFrobnicate again, and fooBarQux');
    const it1 = r.open()[0];
    const row = AM.rowOf(it1, r.clock);
    ok('two conversations\' batches ⇒ ONE open For-you item: the second MERGED into it in place (the same id), its words joined and deduped (fooBarQux once)',
      r.open().length === 1 && a.proposal.itemId === it1.id && b.proposal.itemId === it1.id && ['fooBarQux', 'zeta_notes.md', 'quuxFrobnicate', 'gamma_widget.md'].every((w) => has(it1, w)) && it1.text.split('fooBarQux').length === 2, { open: r.open(), a: a.proposal, b: b.proposal });
    ok('…filed LOW — band 5 with the other asks (never the plugin pin under urgent), no badge, no toast; the sheet still holds both cards', it1.urgency === 'low' && row.band === 5 && !AM.toastWorthy(row) && !AM.badgeRows([row], r.clock).length && r.E.view().proposals.length === 2, { it1, row });
    // B — × CONSUMES the evidence: nothing sent, the cards leave the sheet, the ledger FILE (0600) holds it
    r.ut.setStatus(it1.id, 'dismissed', 'user');
    await settle();
    const disk1 = r.disk();
    ok('× ⇒ nothing sent; the batch\'s cards leave the sheet; the ledger FILE (0600, the plugin\'s own store) holds each word\'s CONSUMED evidence (its count back to 0)',
      r.writes().length === 0 && r.E.view().proposals.length === 0 && (fs.statSync(r.file).mode & 0o777) === 0o600 && ['foobarqux', 'zeta_notes.md', 'quuxfrobnicate', 'gamma_widget.md'].every((k) => disk1.words[k] && disk1.words[k].consumed.length >= 1 && disk1.words[k].evidence.length === 0), disk1);
    // C — the pace: within a day of the dismissal no For-you ITEM, even for brand-new words (their card waits on the sheet)
    r.clock += 2 * H;
    const c = await r.seen('conv-c', 'and plinthMarker went into delta_sheet.md, plinthMarker twice');
    ok('a day after a dismissal: a dictation with NEW words 2 h later files NO For-you item — its card waits on the sheet (the pace: 24 h since the last dismissal on this instance)', !!c.proposal && !c.proposal.itemId && c.proposal.terms.includes('plinthMarker') && r.open().length === 0 && r.E.view().proposals.length === 1, c);
    // D — RULE 1: the SAME messages read again never re-earn a dismissed word; a NEW dictation that says it does
    r.clock += 23 * H;
    const d0 = await r.seen('conv-a', A1);
    ok('a day later the SAME conversation read again (no new dictation): the dismissed words are not proposed at all — no card, no item', !d0.proposal && r.open().length === 0, d0);
    const d1 = await r.seen('conv-a', A1, 'and newtonBridge, twice: newtonBridge');
    const it2 = r.open()[0];
    ok('…a new message with a NEW word: only the new word is filed (the old evidence stays consumed)', !!d1.proposal && has(it2, 'newtonBridge') && !has(it2, 'fooBarQux') && !has(it2, 'zeta_notes.md'), it2);
    r.clock += 10 * MIN;
    const d2 = await r.seen('conv-a2', A1, 'and newtonBridge, twice: newtonBridge', 'please open fooBarQux again'); // another conversation (conv-a proposed 10 min ago: its hourly cadence)
    ok('…a NEW dictation that SAYS fooBarQux re-earns it — merged into the open item; zeta_notes.md (not said again) stays out; never a blacklist', !!d2.proposal && has(r.open()[0], 'fooBarQux') && !has(r.open()[0], 'zeta_notes.md') && r.open().length === 1 && r.disk().words.foobarqux.evidence.length === 1, r.open());
    // E — 加入 (the chip): EXACTLY the merged words, ONE /v1/terms; they leave the ledger and are KNOWN at once
    const it5 = r.open()[0];
    const words5 = it5.text.slice(it5.text.indexOf(':') + 1).split(',').map((x) => x.trim()).sort();
    r.ut.resolveByReply(it5.id, T.teachWords('en', 'add'));
    await settle();
    const w5 = r.writes();
    ok('加入 on the merged item ⇒ ONE POST /v1/terms with EXACTLY its words (both batches\' preselection), the item done, its cards gone', w5.length === 1 && w5[0][1].slice().sort().join() === words5.join() && r.ut.get(it5.id).status === 'done' && !r.E.view().proposals.some((x) => x.terms.some((t) => words5.includes(t))), { w5, words5 });
    r.clock += 10 * MIN;   // inside the hour the dictionary read is cached (the fake vendor never learns: the engine must)
    const g = await r.seen('conv-g', 'rename fooBarQux in kestrel notes, fooBarQux, and zaraGlide zaraGlide');
    ok('the added words are KNOWN at once (the hour\'s cached dictionary does not offer them again) and out of the ledger', !!g.proposal && !g.proposal.terms.includes('fooBarQux') && g.proposal.terms.includes('zaraGlide') && !('foobarqux' in r.disk().words), g.proposal);
    // F — THE SETTINGS LIST: every word suggested now, each 加入 / 忽略 (the route's engine door)
    const listed = r.E.view().candidates.map((x) => x.term);
    ok('the settings list (view().candidates) = every word suggested now (the sheet\'s cards and the open item, deduped)', listed.includes('zaraGlide') && listed.includes('plinthMarker') && new Set(listed.map((x) => x.toLowerCase())).size === listed.length, listed);
    const before = r.writes().length;
    const vi = await r.E.answerWord('ZARAGLIDE', 'ignore');
    ok('忽略 on one word ⇒ nothing sent; off the list and off its card; its evidence consumed (a new dictation would bring it back)', r.writes().length === before && !vi.candidates.some((x) => x.term === 'zaraGlide') && !r.E.view().proposals.some((x) => x.terms.includes('zaraGlide')) && r.disk().words.zaraglide.consumed.length >= 1, vi.candidates);
    const va = await r.E.answerWord('plinthMarker', 'add');
    ok('加入 on one word ⇒ ONE POST /v1/terms with exactly that word; off the list, out of the ledger, known at once', r.writes().length === before + 1 && r.writes().slice(-1)[0][1].join() === 'plinthMarker' && !va.candidates.some((x) => x.term === 'plinthMarker') && !('plinthmarker' in r.disk().words), r.writes().slice(-1));
    let e404 = '', e400 = '';
    try { await r.E.answerWord('neverSuggested', 'add'); } catch (x) { e404 = x.code; }
    try { await r.E.answerWord('delta_sheet.md', 'drop'); } catch (x) { e400 = x.code; }
    ok('a word not suggested now is refused by name (no-candidate), a verb other than add / ignore too (bad-request)', e404 === 'no-candidate' && e400 === 'bad-request', { e404, e400 });
    // the open item loses a word answered in the list — re-worded in place, the same id
    r.clock += 2 * D;
    await r.seen('conv-h', 'and orbitLatch, orbitLatch, with tallowMint and tallowMint');
    const ith = r.open()[0];
    await r.E.answerWord('orbitLatch', 'ignore');
    ok('a word answered in the list leaves the OPEN item too — re-worded in place (the same id), the other word stays', r.open().length === 1 && r.open()[0].id === ith.id && !has(r.open()[0], 'orbitLatch') && has(r.open()[0], 'tallowMint'), r.open());
    // G — 「词典建议」 off ⇒ nothing proposed; voice.suggestions.mode settings-only ⇒ the card, never a For-you item
    const h = nagRig({ settings: { teach: true, suggest: false } });
    const ho = await h.seen('conv-h', A1);
    const m = nagRig({ settings: { teach: true, suggestionsMode: 'settings-only' } });
    const mo = await m.seen('conv-m', A1);
    ok('「词典建议」 OFF (suggest: false) ⇒ nothing is proposed (no card, no item); mode settings-only ⇒ the card and the settings list, NEVER a For-you item; setSettings flips both', !ho.proposal && h.open().length === 0 && !!mo.proposal && !mo.proposal.itemId && m.open().length === 0 && m.E.view().candidates.some((x) => x.term === 'fooBarQux')
      && h.E.setSettings({ suggest: true }).settings.suggest === true && m.E.setSettings({ suggestionsMode: 'item' }).settings.mode === 'item', { ho, mo: mo.proposal });
    // H — a restart: the ledger FILE is read (consumed stays consumed) and an open item an older engine filed normal is unpinned
    const k = nagRig();
    await k.seen('conv-k', A1);
    k.ut.setStatus(k.open()[0].id, 'dismissed', 'user'); await settle();
    const old = k.ut.add(VP.id, { origin: 'plugin', plugin: VP.id, text: 'an older suggestion', urgency: 'normal' });
    k.clock += 2 * D;
    k.E = k.make();   // a new engine instance on the same store and file (a restart)
    const ko = await k.seen('conv-k', A1);
    ok('a RESTART: the new engine reads the ledger file — the same messages still earn nothing; an open item an older engine filed normal is LOW at boot (unpinned)', !ko.proposal && k.ut.get(old.id).urgency === 'low' && AM.rowOf(k.ut.get(old.id), k.clock).band === 5, { ko, old: k.ut.get(old.id) });
    // CONTROL: the pre-fix listener (× unheard — only a reply and a ✓ were answers) ⇒ the same messages re-offer the words
    const src = fs.readFileSync(ENGINE, 'utf8');
    const needle = "      const notNow = (!!reply && reply === model.teachWords(lang, 'ignore')) || (!reply && byUser && (ev.status === 'dismissed' || (ev.status === 'done' && ev.batch === true)));";
    ok('the nag control\'s needle occurs exactly once', src.split(needle).length === 2);
    const deaf = MC.write('src/server/voice-teach-engine.js', src.replace(needle, "      const notNow = !!reply && reply === model.teachWords(lang, 'ignore');"), 'deaf');
    const x = nagRig({ enginePath: deaf });
    await x.seen('conv-x', A1);
    x.ut.setStatus(x.open()[0].id, 'dismissed', 'user'); await settle();
    x.clock += 25 * H;
    const xo = await x.seen('conv-x', A1);
    ok('CONTROL RED: the pre-fix listener (× unheard) ⇒ the SAME messages offer the dismissed words again the next day — the checks above fail on it', !!xo.proposal && xo.proposal.terms.includes('fooBarQux'), xo.proposal);
  }
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
