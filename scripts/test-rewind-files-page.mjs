#!/usr/bin/env node
// test-rewind-files-page (fast, in-process — row B-437e, the files tier's PAGE, U3; lane lg-rewind 2026-11-22, 主开发 r1988):
//   ① THE WORDS (src/lib/rewind-files-words.js, PURE): which confirm (DARK = today's), the confirm's model from the server's facts
//      (the choices it drew — one that cannot act ABSENT with one sentence, never greyed —, its default, each file's state), every
//      reason of src/rewind-files.js and src/rewind-kept.js in words, the outcome (never «all files restored»), the kept line (its
//      door only while its copy stands), the put-back's plan and answer
//   ② THE VIEW (src/lib/chat-view.js, its U3 block and tier one's door, lifted over stand-ins): dark ⇒ ONE request and today's
//      confirm word for word; the files fact on ⇒ the files dry run beside tier one's, the files confirm (its extra node: the radio
//      group, the default, the rows, the keep); the files ask unanswered within its bound ⇒ today's confirm; the press frame (its
//      choice, `drawn`, the page's ids) with the conversation step bound as tier one's; the kept lines drawn, again after a redraw,
//      their door only while the copy stands; a second press of one put-back on this page SAID, never a dead button
//   RED CONTROLS (anchored copies): the view's dark gate off; the default not the server's; a press without `drawn`; a door on a
//   copy that is gone
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { anchored } from './scratch.mjs';
import { checker } from './lib/check.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { ok, report } = checker();
const W = await import(path.join(REPO, 'src/lib/rewind-files-words.js'));
const { t } = await import(path.join(REPO, 'src/lib/i18n.js'));
const { dateOf } = await import(path.join(REPO, 'src/lib/page-time.js'));
const F = require(path.join(REPO, 'src/rewind-files.js'));
const K = require(path.join(REPO, 'src/rewind-kept.js'));
const caps = require(path.join(REPO, 'src/backend-caps.js'));
const door = require(path.join(REPO, 'src/rewind-door.js'));
const WSRC = fs.readFileSync(path.join(REPO, 'src/lib/rewind-files-words.js'), 'utf8');
const VSRC = fs.readFileSync(path.join(REPO, 'src/lib/chat-view.js'), 'utf8');
const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-rwpage-'));
process.on('exit', () => { try { fs.rmSync(SCRATCH, { recursive: true, force: true }); } catch { } });
/** a copy of the words module with one line changed, imported as its own module (its import of ./i18n.js pointed at the real one) */
let mutN = 0;
const wordsWith = async (from, to, name) => {
  const f = path.join(SCRATCH, `words-${++mutN}.mjs`);
  let text = anchored(WSRC, from, to, name);
  text = anchored(text, "from './i18n.js'", `from ${JSON.stringify(path.join(REPO, 'src/lib/i18n.js'))}`, 'its i18n import');
  text = anchored(text, "from './page-time.js'", `from ${JSON.stringify(path.join(REPO, 'src/lib/page-time.js'))}`, 'its page-time import');
  fs.writeFileSync(f, text);
  return import(f);
};

const FILES = (over = {}) => ({ ok: true, choices: ['conversation', 'files', 'both'], default: 'both', plus: 12, minus: 3,
  files: [{ path: '/w/a.js', state: 'same' }, { path: '/w/b.js', state: 'changed' }], keep: { ok: true, refusals: [], check: 'sha256' }, ...over });

console.log('— ① the words');
{
  ok(W.confirmKindOf({ ok: true, choices: ['conversation'], default: 'conversation' }) === 'conversation' && W.confirmKindOf(null) === 'conversation' && W.confirmKindOf({ ok: false, reason: 'pending' }) === 'conversation'
    && W.confirmKindOf(FILES()) === 'files',
    '① WHICH CONFIRM: dark (the conversation only), no facts (the files ask unanswered), a refusal ⇒ today\'s confirm; a files choice drawn ⇒ the files confirm');
  const m = W.confirmModel(FILES());
  ok(m.kind === 'files' && m.choices.map((c) => c.id).join() === 'conversation,files,both' && m.def === 'both' && m.rows.length === 2 && m.rows[1].words === t('changed since the agent\'s last edit') && m.keep.ok && !m.absent && m.plus === 12,
    '① THE CONFIRM\'s model: the choices the server drew, ITS default, each file\'s state in words, the keep said', m);
  const mc = W.confirmModel(FILES({ default: 'conversation', files: [{ path: '/w/a.js', state: 'unknown', why: 'helper-worked' }] }));
  ok(mc.def === 'conversation' && mc.rows[0].words === t('could not be checked: {why}', { why: t('a helper agent worked in this conversation') }), '① a file that could not be checked: its why in words; the server\'s default (the conversation only) kept', mc.rows);
  const mk = W.confirmModel(FILES({ keep: { ok: false, refusals: [{ path: '/w/l', why: 'link' }] } }));
  ok(mk.choices.map((c) => c.id).join() === 'conversation' && mk.def === 'conversation' && mk.absent === t('Only the conversation can be rewound here.') && mk.keep.rows[0].words === t('cannot keep a copy: {why}', { why: t('it is a link (a rewind would write through it)') }),
    '① A FILE THAT CANNOT BE KEPT: the files choices are ABSENT (not greyed), said in one sentence; the file and its why named', mk);
  const many = W.confirmModel(FILES({ files: Array.from({ length: 20 }, (_, i) => ({ path: `/w/f${i}.js`, state: 'same' })) }));
  ok(many.rows.length === W.SHOWN_MAX && many.more === 20 - W.SHOWN_MAX && W.shortPath('/a/very/long/path/to/some/deeply/nested/folder/and/a/file-name-that-is-long.js', 30).startsWith('…'),
    `① at most ${W.SHOWN_MAX} rows, «and N more»; a long path shortened from the left (its end is what a person knows it by)`);
  const unknown = F.UNKNOWN_WHY.filter((w) => W.stateWords({ state: 'unknown', why: w }) === t('could not be checked: {why}', { why: t('not known') }));
  const keep = K.KEEP_WHY.filter((w) => W.keepWhyWords(w) === t('not known'));
  ok(!unknown.length && !keep.length, `① EVERY reason has its words: the ${F.UNKNOWN_WHY.length} «could not be checked» of src/rewind-files.js, the ${K.KEEP_WHY.length} «cannot keep a copy» of src/rewind-kept.js`, { unknown, keep });
  const sentences = [...WSRC.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)].map((x) => x[1]);
  ok(sentences.length > 60 && !sentences.some((s) => /\ball (?:the )?files\b/i.test(s)) && sentences.filter((s) => /put back or removed/.test(s)).length >= 2,
    '① NEVER «all files restored» (the U2 ruling): no sentence says «all files»; the files step reads «put back or removed»', sentences.length);
  const ok1 = W.filesOutcomeWords({ ok: true, results: { files: { ok: true }, kept: { files: 2 } }, outcome: { done: ['files'] } });
  const part = W.filesOutcomeWords({ ok: true, results: { files: { ok: false } }, outcome: { failed: 'files', maybePartial: true } });
  const none = W.filesOutcomeWords({ ok: true, results: { files: { ok: false, reason: 'checkpoints-off' } }, outcome: { failed: 'files', maybePartial: false } });
  const moved = W.filesOutcomeWords({ ok: false, reason: 'changed-since' });
  ok(ok1 === t('Files put back or removed: {n}.', { n: 2 }) && /may have been put back/.test(part) && none === t('Nothing was put back.') && /changed since this was opened/.test(moved),
    '① THE OUTCOME of the files step, on its own: put back or removed (a count), some may have been put back, nothing put back, a refusal by name', { ok1, part, none, moved });
  const fmt = (ms) => `D${ms}`;
  const kept = W.keptLineModel({ press: 'kp-x', state: 'kept', door: true, files: 3, until: 9, machine: null }, { fmt });
  const back = W.keptLineModel({ press: 'kp-x', state: 'put-back', putBackAt: 7, door: false }, { fmt });
  const gone = W.keptLineModel({ press: 'kp-x', state: 'gone', door: false }, { fmt });
  const stale = W.keptLineModel({ press: 'kp-x', state: 'kept', door: false, until: 9 }, { fmt });
  ok(kept.door && /until D9/.test(kept.words) && !back.door && /put back as they were on D7/.test(back.words) && !gone.door && /is gone/.test(gone.words) && !stale.door,
    '① THE KEPT LINE (r1988 law 1): its door ONLY while its copy stands; put back, or gone after its seven days, the line SAYS so — never a greyed door', { kept, back, gone });
  const plan = W.putBackPlanWords(K.PUT_BACK_ACTS.map((act) => ({ path: `/w/${act}.js`, act, why: act === 'refused' ? 'kept-changed' : null })));
  const refused = W.putBackOutcomeWords({ ok: false, reason: 'pending' });
  ok(plan.length === K.PUT_BACK_ACTS.length && plan.every((p) => !/not known/.test(p)) && /already being put back/.test(refused) && W.putBackOutcomeWords({ ok: true, rows: [{ done: true }, { done: false, act: 'overwrite' }] }) === t('Put back as they were: {n} file(s); {m} not put back — the kept copy still holds them.', { n: 1, m: 1 }),
    '① THE PUT-BACK: each act named before it acts; a second client\'s press of one put-back said in a person\'s words (pending); what was not put back counted', { plan, refused });
  const d = W.drawnOf(FILES());
  ok(JSON.stringify(d.files) === '["/w/a.js","/w/b.js"]' && d.judged[1].state === 'changed' && d.plus === 12, '① the press\'s `drawn` = the files, their states and counts as the confirm drew them (the server refuses changed-since otherwise)', d);
}

console.log('— ② the view');
/** a minimal DOM: elements with children, attributes, a checked radio, and «connected» = under the view's root */
class El {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.parent = null; this.className = ''; this._text = ''; this.title = ''; this.attrs = {}; this.checked = false; this.root = false; }
  get textContent() { return this._text; }
  set textContent(v) { for (const c of this.children) c.parent = null; this.children = []; this._text = String(v); }   // as the DOM: setting it removes the children
  append(...k) { for (const c of k) this.appendChild(c); }
  appendChild(c) { if (c.parent) c.remove(); c.parent = this; this.children.push(c); return c; }
  prepend(c) { if (c.parent) c.remove(); c.parent = this; this.children.unshift(c); return c; }
  remove() { if (this.parent) { this.parent.children = this.parent.children.filter((x) => x !== this); this.parent = null; } }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  get isConnected() { let e = this; while (e) { if (e.root) return true; e = e.parent; } return false; }
  all() { return this.children.flatMap((c) => [c, ...c.all()]); }
  querySelector(sel) { if (sel === 'input[type="radio"]:checked') return this.all().find((e) => e.tagName === 'INPUT' && e.type === 'radio' && e.checked) || null; return null; }
  get innerText() { return [this.textContent, ...this.children.map((c) => c.innerText)].join(' ').trim(); }
}
const documentStub = { createElement: (tag) => new El(tag) };
const clock = { now: 0, timers: [], n: 0 };
const stubSet = (fn, ms) => { const id = ++clock.n; clock.timers.push({ id, fn, at: clock.now + ms }); return id; };
const stubClear = (id) => { clock.timers = clock.timers.filter((x) => x.id !== id); };
const store = { m: new Map(), getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }, setItem(k, v) { this.m.set(k, String(v)); }, removeItem(k) { this.m.delete(k); }, get length() { return this.m.size; }, key(i) { return [...this.m.keys()][i] || null; } };
const said = [];
const FROM = "  // ── B-437e U3: THE FILES TIER's PAGE", TO = '  // Fork a new session from a specific assistant message (the chat fork button).';
const liftView = (src, words = W) => {
  const a = src.indexOf(FROM), b = src.indexOf(TO, a + 1);
  if (a < 0 || b < 0) throw new Error('lift: the U3 block … the fork comment not found in src/lib/chat-view.js');
  const deps = { backendFeatureCaps: (b2) => ({ checkpoints: caps.capsOf(b2).checkpoints }), rewindPointOf: door.rewindPointOf, rewindPlanOf: door.rewindPlanOf, rewindAnswerOf: door.rewindAnswerOf, t,
    REWIND_LIFE_MS: door.REWIND_LIFE_MS, POINT_FIELDS: door.POINT_FIELDS, REWIND_REQUEST_PREFIX: door.REWIND_REQUEST_PREFIX, textOf: door.textOf, setTimeout: stubSet, clearTimeout: stubClear, sessionStorage: store,
    openClock: () => clock.now, PAGE_START: 0, lateFocus: () => true, document: documentStub, dateOf, REWIND_FILES_ASK_MS: 20000, REWIND_FILES_PRESS_MS: 150000,
    showToast: (m, o) => said.push([m, o && o.type]),
    showConfirmDialog: (o) => { said.push(['confirm', o]); return Promise.resolve(view && view._yes); },
    confirmModel: words.confirmModel, drawnOf: words.drawnOf, filesOutcomeWords: words.filesOutcomeWords, pressRefusalWords: words.pressRefusalWords, keptLineModel: words.keptLineModel,
    putBackDoorWords: words.putBackDoorWords, putBackPlanWords: words.putBackPlanWords, putBackOutcomeWords: words.putBackOutcomeWords };
  const names = Object.keys(deps);
  return new Function(...names, `return class { ${src.slice(a, b)} }`)(...names.map((k) => deps[k]));
};
let view = null;
const U = (n) => `e2e00000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const person = { id: 'p1', role: 'user', uuid: U(31), content: [{ type: 'text', text: 'ask' }] };
const convo = [person, { id: 'a1', role: 'assistant', uuid: U(33), content: [] }, { id: 'p2', role: 'user', uuid: U(34), content: [{ type: 'text', text: 'two' }] }];
const tick = () => new Promise((res) => setTimeout(res, 0));
const fresh = (V, { files = false } = {}) => {
  const reqs = [];
  const v = new V();
  const root = new El('div'); root.root = true;
  Object.assign(v, { sessionId: 'sess-1', _readOnly: false, _disposed: false, _yes: true, _container: root, _messages: convo, _fileCheckpoints: files,
    _chatInput: { isStreaming: false, putBack: () => 'none' }, _getSessionIds: () => ({ backend: 'claude' }), _keepRewind: () => { }, _sayRewindRefusal: (r) => said.push(['refusal', r]),
    ws: { connected: true, request: (msg, match, opts) => { const q = { msg, match, opts }; reqs.push(q); return () => { q.done = true; }; } } });
  return { v, reqs, root };
};
const tierOne = (reqs) => reqs.find((q) => q.msg.type === 'rewind' && q.msg.dryRun === true);
const dryAnswer = (q) => q.match({ type: 'rewind-result', sessionId: 'sess-1', reqId: q.msg.reqId, ok: true, dryRun: true, taken: 3, turns: 2, files: false });
{
  const V = liftView(VSRC);
  // DARK: one request, today's confirm word for word
  let s = fresh(V); view = s.v; said.length = 0;
  s.v._rewindFromMessage(person); await tick();
  const one = s.reqs.length; dryAnswer(s.reqs[0]); await tick(); await tick();
  const conf = said.find((x) => x[0] === 'confirm');
  ok(one === 1 && s.reqs[0].msg.type === 'rewind' && !!conf && !conf[1].extra && /Files on disk are not rolled back/.test(conf[1].message),
    '② DARK (the conversation\'s files fact off — nothing sets it until U1): ONE request (tier one\'s dry run), today\'s confirm word for word', { one, conf: conf && conf[1].message });
  // the files fact on: the files dry run beside it; the files confirm drawn from its facts
  s = fresh(V, { files: true }); view = s.v; said.length = 0; s.v._yes = false;
  s.v._rewindFromMessage(person); await tick();
  const two = s.reqs.map((q) => q.msg.type).sort().join();
  const fq = s.reqs.find((q) => q.msg.type === 'rewind-files');
  dryAnswer(tierOne(s.reqs)); fq.match({ type: 'rewind-files-result', sessionId: 'sess-1', reqId: fq.msg.reqId, ...FILES() }); await tick(); await tick();
  const fc = said.find((x) => x[0] === 'confirm');
  const radios = fc && fc[1].extra ? fc[1].extra.all().filter((e) => e.tagName === 'INPUT') : [];
  ok(two === 'rewind,rewind-files' && fq.msg.dryRun === true && !!fc && !!fc[1].extra && radios.map((r) => r.value).join() === 'conversation,files,both' && radios.find((r) => r.checked).value === 'both'
    && !/Files on disk are not rolled back/.test(fc[1].message) && fc[1].extra.innerText.includes(t('changed since the agent\'s last edit')),
    '② THE FILES FACT ON: the files dry run beside tier one\'s; the files confirm — its radio group of the server\'s choices, ITS default checked, each file\'s state', { two, radios: radios.map((r) => [r.value, r.checked]) });
  // the files ask unanswered within its bound: today's confirm (the conversation step never held past it)
  s = fresh(V, { files: true }); view = s.v; said.length = 0; s.v._yes = false;
  s.v._rewindFromMessage(person); await tick();
  dryAnswer(tierOne(s.reqs)); s.reqs.find((q) => q.msg.type === 'rewind-files').opts.onTimeout(); await tick(); await tick();
  const tc1 = said.find((x) => x[0] === 'confirm');
  ok(!!tc1 && !tc1[1].extra && /Files on disk are not rolled back/.test(tc1[1].message), '② THE FILES ASK UNANSWERED within its bound: today\'s confirm, word for word (r1988\'s one more leg)', tc1 && tc1[1].message);
  // THE PRESS: «both» — the frame carries its choice, `drawn`, the page's ids; the conversation step bound as tier one's
  s = fresh(V, { files: true }); view = s.v; said.length = 0; s.v._yes = true;
  s.v._rewindFromMessage(person); await tick();
  const fq2 = s.reqs.find((q) => q.msg.type === 'rewind-files');
  dryAnswer(tierOne(s.reqs)); fq2.match({ type: 'rewind-files-result', sessionId: 'sess-1', reqId: fq2.msg.reqId, ...FILES() }); await tick(); await tick(); await tick();
  const press = s.reqs.find((q) => q.msg.type === 'rewind-files' && !q.msg.dryRun);
  const bound = press && s.v._rewindBound && s.v._rewindBound.has(door.REWIND_REQUEST_PREFIX + press.msg.reqId);
  ok(!!press && press.msg.choice === 'both' && JSON.stringify(press.msg.drawn) === JSON.stringify(W.drawnOf(FILES())) && press.msg.expectTaken === 3 && press.msg.lastSeenUuid === U(34) && bound && s.v._rewindLive === door.REWIND_REQUEST_PREFIX + press.msg.reqId,
    '② THE PRESS («both»): one frame with its choice, `drawn` (what the confirm drew), the page\'s newest uuid and the count; the conversation step BOUND before it is sent, under the CLI\'s own id (tier one\'s rule)', press && press.msg);
  said.length = 0;
  press.match({ type: 'rewind-files-result', sessionId: 'sess-1', reqId: press.msg.reqId, ok: true, steps: ['files', 'conversation'], results: { files: { ok: true }, kept: { press: 'kp-mwq6g800-0000aaaa', files: 2 }, conversation: { ok: true, asked: true } }, outcome: { done: ['files', 'conversation'] } });
  ok(said.some((x) => x[0] === t('Files put back or removed: {n}.', { n: 2 })) && s.v._rewindInFlight === true && clock.timers.length > 0,
    '② its answer: the files step SAID on its own (put back or removed); the conversation step still waits its own answer (tier one\'s minute from now)', said);
  // THE KEPT LINES: drawn, again after a redraw; the door only while the copy stands; a second press SAID
  s = fresh(V, { files: true }); view = s.v; said.length = 0;
  s.v._sayKeptLine({ press: 'kp-mwq6g800-0000bbbb', state: 'kept', door: true, files: 2, at: 5, until: 9e12 });
  s.v._sayKeptLine({ press: 'kp-mwq6g800-0000cccc', state: 'put-back', door: false, at: 4, putBackAt: 6 });
  const strip = s.root.children.find((c) => c.className === 'chat-rewind-kept');
  const doors = () => s.root.all().filter((e) => e.tagName === 'BUTTON');
  const before = strip ? strip.children.length : 0, doorsBefore = doors().length;
  strip.remove(); s.v._redrawKeptLines();
  const again = s.root.children.find((c) => c.className === 'chat-rewind-kept');
  ok(before === 2 && doorsBefore === 1 && !!again && again.children.length === 2 && doors().length === 1 && again.children[0].innerText.includes('2 file(s)'),
    '② THE KEPT LINES (r1988 laws 1 + 3): drawn in the conversation, the door on the one whose copy stands only; a history redraw (a compaction view, a rewind past it) draws them AGAIN', { before, doorsBefore });
  const door1 = doors()[0];
  door1.onclick(); door1.onclick();
  const pbs = s.reqs.filter((q) => q.msg.type === 'rewind-files-put-back');
  ok(pbs.length === 1 && pbs[0].msg.dryRun === true && s.root.all().some((e) => e.className === 'chat-rewind-kept-said' && /already being put back/.test(e.textContent)) && doors().length === 1,
    '② TWO PRESSES of one put-back on this page: ONE ask; the second press is SAID (the button stays live, never greyed)', pbs.length);
}

console.log('— red controls');
{
  const darkOff = liftView(anchored(VSRC, "    const files = this._fileCheckpoints === true ? this._askRewindFiles(msg) : null;", "    const files = this._askRewindFiles(msg);", 'page: the dark gate off'));
  const s = fresh(darkOff); view = s.v; said.length = 0;
  s.v._rewindFromMessage(person); await tick();
  ok(s.reqs.length === 2, 'RED CONTROL (the view\'s dark gate off): a conversation with its files fact off asks the files dry run on every rewind');
  const notServers = await wordsWith("  const def = ids.includes(facts.default) ? facts.default : 'conversation';", "  const def = ids[ids.length - 1] || 'conversation';", 'page: the default not the server\'s');
  ok(notServers.confirmModel(FILES({ default: 'conversation' })).def === 'both', 'RED CONTROL (the default not the server\'s): a changed file\'s confirm preselects «both»');
  const noDrawn = liftView(anchored(VSRC, ", choice, drawn: drawnOf(facts), lastSeenUuid:", ", choice, lastSeenUuid:", 'page: a press without drawn'));
  const s2 = fresh(noDrawn, { files: true }); view = s2.v; said.length = 0; s2.v._yes = true;
  s2.v._rewindFromMessage(person); await tick();
  const fq = s2.reqs.find((q) => q.msg.type === 'rewind-files');
  dryAnswer(tierOne(s2.reqs)); fq.match({ type: 'rewind-files-result', sessionId: 'sess-1', reqId: fq.msg.reqId, ...FILES() }); await tick(); await tick(); await tick();
  const p2 = s2.reqs.find((q) => q.msg.type === 'rewind-files' && !q.msg.dryRun);
  ok(!!p2 && p2.msg.drawn === undefined, 'RED CONTROL (a press without `drawn`): the press goes out with no record of what the confirm drew');
  const doorGone = await wordsWith("  if (line && line.state === 'kept' && line.door) return", "  if (line && line.state !== 'put-back') return", 'page: a door on a gone copy');
  ok(doorGone.keptLineModel({ press: 'kp-x', state: 'gone', door: false, until: 9 }).door === true, 'RED CONTROL (a door on a copy that is gone): the line offers «Put my files back» after the copy is swept');
}

report();
