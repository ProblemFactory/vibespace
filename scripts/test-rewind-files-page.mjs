#!/usr/bin/env node
// test-rewind-files-page (fast, in-process — row B-437e, the files tier's PAGE, U3; lane lg-rewind 2026-11-22, 主开发 r1988, r2245):
//   ① THE WORDS (src/lib/rewind-files-words.js, PURE): which confirm (DARK = today's), the confirm's model from the server's facts
//      (the choices it drew — one that cannot act ABSENT with one sentence, never greyed —, its default, each file's state), every
//      reason of src/rewind-files.js and src/rewind-kept.js in words, the outcome (never «all files restored»; a press that failed
//      after its keep), the kept line (WHICH rewind, what its files step did, a partial put-back, its door only while its copy
//      stands), the strip's order, the put-back's plan (bounded) and answer
//   ② THE VIEW (src/lib/chat-view.js, its U3 block and tier one's door, lifted over stand-ins): dark ⇒ ONE request and today's
//      confirm word for word; the files fact on ⇒ the files dry run beside tier one's, «Checking the files…» while it is out, the
//      files confirm (its extra node: the radio group, the default, the rows, the keep); a window closed meanwhile draws no dialog;
//      the files ask unanswered ⇒ today's confirm; the press frame with the conversation step bound as tier one's, its watchdog
//      armed by the answer; the conversation's own refusal in tier one's words; THE KEPT LINES from the SERVER's own frames (the
//      real door on scratch files: a files press's told line, an attach's whole record) through the view's live meta: their own
//      place above the list, the live ones first, a close for this view, back at an attach while a copy stands; a second press of
//      one put-back SAID; the wiring no other leg reads (the hub's attach field and after-calls, the page's meta parse, the history
//      loads' redraw) and the strip's CSS (its bound, its own scroll; what floats over the list moves down by its height)
//   RED CONTROLS (anchored copies): the view's dark gate off; the default not the server's; a press without `drawn`; a door on a
//   copy that is gone; the press's watchdog never armed; the kept-lines meta not wired; the left-behind line back over the strip
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
const CSS = fs.readFileSync(path.join(REPO, 'public/chat.css'), 'utf8');
/** the strip's CSS (r2245 (3)): its own row, its lines bounded with their own scroll, what floats over the list moved down by its height */
const ruleOf = (css, sel) => { const m = css.match(new RegExp('^' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'm')); return m ? m[1] : ''; };
const cssOk = (css) => {
  const strip = ruleOf(css, '.chat-rewind-kept'), lines = ruleOf(css, '.chat-rewind-kept-lines');
  const phone = /\.chat-rewind-kept-lines \{ max-height: (\d+(?:\.\d+)?)em; \}/.exec(css);
  const floats = ['.chat-left-behind', '.chat-history-status', '.chat-pos-indicator', '.chat-run-bar'].filter((x) => !/top: [^;]*var\(--chat-kept-h, 0px\)/.test(ruleOf(css, x)));
  return { own: !/position:\s*absolute/.test(strip) && /flex: none/.test(strip), scroll: /max-height:/.test(lines) && /overflow-y: auto/.test(lines), phone: !!phone && Number(phone[1]) <= 5, floats };
};
const KD = require(path.join(REPO, 'src/server/rewind-kept-door.js'));
const KW = require(path.join(REPO, 'src/server/rewind-keep-worker.js'));
const kcall = (op, payload) => Promise.resolve().then(() => KW.runOp(op, payload).result);   // the keep pool's own ops, inline
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
  const afterKeep = W.filesOutcomeWords({ ok: false, reason: 'door-failed', results: { kept: { files: 1 } }, outcome: { failed: 'files', maybePartial: true } });
  ok(ok1 === t('Files put back or removed: {n}.', { n: 2 }) && /may have been put back/.test(part) && none === t('Nothing was put back.') && /changed since this was opened/.test(moved) && /may have been put back/.test(afterKeep),
    '① THE OUTCOME of the files step, on its own: put back or removed (a count), some may have been put back, nothing put back, a refusal by name; a press that failed AFTER its keep says what is known (r2245 (7))', { ok1, part, none, moved, afterKeep });
  const fmt = (ms) => `D${ms}`;
  const L = (over) => ({ press: 'kp-x', at: 3, until: 9, files: 3, machine: null, msgAt: 2, ...over });
  const which = t('the rewind to your message of {when}', { when: 'D2' }), here = t('on this computer');
  const kept = W.keptLineModel(L({ state: 'kept', door: true, step: 'done' }), { fmt });
  const part2 = W.keptLineModel(L({ state: 'kept', door: true, step: 'partial' }), { fmt });
  const none2 = W.keptLineModel(L({ state: 'kept', door: true, step: 'none' }), { fmt });
  const first = W.keptLineModel(L({ state: 'kept', door: true, of: 'put-back', msgAt: null }), { fmt });
  const tried = W.keptLineModel(L({ state: 'kept', door: true, step: 'done', triedAt: 5, notPut: 1 }), { fmt });
  const back = W.keptLineModel(L({ state: 'put-back', door: false, putBackAt: 7 }), { fmt });
  const gone = W.keptLineModel(L({ state: 'gone', door: false }), { fmt });
  const stale = W.keptLineModel(L({ state: 'kept', door: false }), { fmt });
  const lost = W.keptLineModel(L({ state: 'kept', door: true, step: 'done', unrecorded: true }), { fmt });
  const onLab = W.keptLineModel(L({ state: 'kept', door: true, step: 'done', machine: 'the lab machine' }), { fmt });
  ok(kept.door && kept.words === t('Files were put back by {which} — a copy of {n} file(s) as they were before it is kept {where} until {date}.', { which, n: 3, where: here, date: 'D9' })
    && part2.door && part2.words.startsWith(t('Some files may have been put back by {which} — a copy of {n} file(s) as they were before it is kept {where} until {date}.', { which, n: 3, where: here, date: 'D9' }))
    && none2.door && none2.words === t('No files were put back by {which} — the copy of {n} file(s) kept before it stays {where} until {date}.', { which, n: 3, where: here, date: 'D9' })
    && first.door && first.words.includes(t('the put-back of {when}', { when: 'D3' })) && onLab.words.includes(t('on {machine}', { machine: 'the lab machine' })),
    '① THE KEPT LINE names WHICH rewind (the message\'s date; a put-back\'s keep-first: the put-back\'s) and what its files step did — put back · may have put some back · put nothing back (r2245 (3), (7)); the machine named', { kept, part2, none2, first });
  ok(tried.door && tried.words.includes(t('A put-back on {date} left {m} file(s) not put back — the kept copy still holds them.', { date: 'D5', m: 1 }))
    && !back.door && back.words === t('The copy kept for {which} was put back on {date}.', { which, date: 'D7' }) && !gone.door && gone.words === t('The copy kept for {which} is gone (it was kept seven days).', { which }) && !stale.door
    && lost.door && lost.words.endsWith(t('This line could not be saved: the conversation\'s record of kept files could not be read.')),
    '① its door ONLY while its copy stands; a PARTIAL put-back keeps the door and says how many were not put back (r2245 (2)); put back or gone, the line SAYS so — never a greyed door; a line not recorded says so (r2245 (8))', { tried, back, gone, lost });
  const ord = W.keptOrderOf([{ press: 'a', at: 1, door: false }, { press: 'b', at: 2, door: true }, { press: 'c', at: 3, door: false }, { press: 'd', at: 0, door: true }]);
  ok(ord.map((x) => x.press).join() === 'b,d,c,a', '① THE STRIP\'s ORDER (r2245 (3)): the lines whose copy still stands first, then the newest first', ord.map((x) => x.press));
  const plan = W.putBackPlanWords(K.PUT_BACK_ACTS.map((act) => ({ path: `/w/${act}.js`, act, why: act === 'refused' ? 'kept-changed' : null })));
  const refused = W.putBackOutcomeWords({ ok: false, reason: 'pending' });
  ok(plan.length === K.PUT_BACK_ACTS.length && plan.every((p) => !/not known/.test(p)) && /already being put back/.test(refused) && W.putBackOutcomeWords({ ok: true, rows: [{ done: true }, { done: false, act: 'overwrite' }] }) === t('Put back as they were: {n} file(s); {m} not put back — the kept copy still holds them.', { n: 1, m: 1 }),
    '① THE PUT-BACK: each act named before it acts; a second client\'s press of one put-back said in a person\'s words (pending); what was not put back counted', { plan, refused });
  const lostW = W.putBackOutcomeWords({ ok: true, rows: [{ done: true, act: 'overwrite' }, { done: false, act: 'overwrite', why: 'kept-changed' }, { done: false, act: 'overwrite', why: 'EACCES' }] });
  const lostL = W.keptLineModel({ press: 'kp-x', state: 'kept', door: true, files: 3, until: 9, at: 3, msgAt: 2, step: 'done', triedAt: 5, notPut: 1, keptLost: 1 }, { fmt: (ms) => `D${ms}` });
  ok(lostW === `${t('Put back as they were: {n} file(s); {m} not put back — the kept copy still holds them.', { n: 1, m: 1 })} ${t('{k} file(s) could not be read from the kept copy — it cannot put them back.', { k: 1 })}`
    && lostL.words.includes(t('A put-back on {date} left {m} file(s) not put back — the kept copy still holds them.', { date: 'D5', m: 1 })) && lostL.words.includes(t('At the put-back on {date}, {k} file(s) could not be read from the kept copy — it cannot put them back.', { date: 'D5', k: 1 })),
    '① A ROW WHOSE KEPT COPY CANNOT BE READ is named apart (r2372 (4)) — in the put-back\'s answer and in the line — never counted as «the kept copy still holds them»', { lostW, lostL: lostL.words });
  ok(W.putBackOutcomeWords({ ok: false, reason: 'not-started' }) === t('This conversation has not started yet — nothing was put back.') && W.putBackOutcomeWords({ ok: false, reason: 'not-running' }) === t('This conversation is not running here — resume it, then put its files back.')
    && W.pressRefusalWords('not-started') === t('This conversation has not started yet — its files can be kept once its first message is sent. Nothing was kept or put back.'),
    '① A CONVERSATION THAT HAS NOT STARTED (a pending fork, r4423) and one that is not running: each refusal in its own words');
  const bounded = W.putBackPlanWords(Array.from({ length: 20 }, (_, i) => ({ path: `/w/p${i}.js`, act: 'overwrite' })));
  ok(bounded.length === W.SHOWN_MAX + 1 && bounded[W.SHOWN_MAX] === t('and {n} more', { n: 20 - W.SHOWN_MAX }), `① THE PUT-BACK's CONFIRM is bounded as the files confirm is (r2245 (11)): ${W.SHOWN_MAX} rows, «and N more»`, bounded.length);
  const d = W.drawnOf(FILES());
  ok(JSON.stringify(d.files) === '["/w/a.js","/w/b.js"]' && d.judged[1].state === 'changed' && d.plus === 12, '① the press\'s `drawn` = the files, their states and counts as the confirm drew them (the server refuses changed-since otherwise)', d);
}

console.log('— ② the view');
/** a minimal DOM: elements with children, attributes, a checked radio, and «connected» = under the view's root */
class El {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.parent = null; this.className = ''; this._text = ''; this.title = ''; this.attrs = {}; this.checked = false; this.root = false; this.offsetHeight = 0; this.style = { props: {}, setProperty(k, v) { this.props[k] = v; } }; }
  get parentNode() { return this.parent; }
  set innerHTML(v) { this._html = String(v); }
  get innerHTML() { return this._html || ''; }
  insertBefore(c, ref) { if (c.parent) c.remove(); c.parent = this; const i = this.children.indexOf(ref); if (i < 0) this.children.push(c); else this.children.splice(i, 0, c); return c; }
  get textContent() { return this._text; }
  set textContent(v) { for (const c of this.children) c.parent = null; this.children = []; this._text = String(v); this.scrollTop = 0; }   // as the DOM: setting it removes the children (and the scroll place goes with them)
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
const said = [], toasts = [];
const watchers = [];
class RO { constructor(fn) { this.fn = fn; this.on = false; watchers.push(this); } observe() { this.on = true; } disconnect() { this.on = false; } }   // the strip's size watcher, a stand-in
const FROM = "  // ── B-437e U3: THE FILES TIER's PAGE", TO = '  // Fork a new session from a specific assistant message (the chat fork button).';
const liftView = (src, words = W) => {
  const a = src.indexOf(FROM), b = src.indexOf(TO, a + 1);
  if (a < 0 || b < 0) throw new Error('lift: the U3 block … the fork comment not found in src/lib/chat-view.js');
  const deps = { backendFeatureCaps: (b2) => ({ checkpoints: caps.capsOf(b2).checkpoints }), rewindPointOf: door.rewindPointOf, rewindPlanOf: door.rewindPlanOf, rewindAnswerOf: door.rewindAnswerOf, t,
    REWIND_LIFE_MS: door.REWIND_LIFE_MS, POINT_FIELDS: door.POINT_FIELDS, REWIND_REQUEST_PREFIX: door.REWIND_REQUEST_PREFIX, textOf: door.textOf, setTimeout: stubSet, clearTimeout: stubClear, sessionStorage: store,
    openClock: () => clock.now, PAGE_START: 0, lateFocus: () => true, document: documentStub, dateOf, REWIND_FILES_ASK_MS: 20000, REWIND_FILES_PRESS_MS: 150000,
    showToast: (m, o) => { said.push([m, o && o.type]); const el = { removed: false, remove() { this.removed = true; } }; toasts.push([m, el, o || {}]); return el; },
    showConfirmDialog: (o) => { said.push(['confirm', o]); return Promise.resolve(view && view._yes); },
    confirmModel: words.confirmModel, drawnOf: words.drawnOf, filesOutcomeWords: words.filesOutcomeWords, pressRefusalWords: words.pressRefusalWords, keptLineModel: words.keptLineModel, keptOrderOf: words.keptOrderOf, UI_ICONS: { close: '<svg></svg>' }, ResizeObserver: RO,
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
  const list = root.appendChild(new El('div'));   // the message list: the view's own child (the strip takes its place ABOVE it)
  clock.timers = [];   // a fresh page: no timer of another leg's view (the watchdog leg reads ITS timer)
  Object.assign(v, { sessionId: 'sess-1', _readOnly: false, _disposed: false, _yes: true, _container: root, _messageList: list, _messages: convo, _fileCheckpoints: files,
    _chatInput: { isStreaming: false, putBack: () => 'none' }, _getSessionIds: () => ({ backend: 'claude' }), _keepRewind: () => { }, _sayRewindRefusal: (r) => said.push(['refusal', r]),
    ws: { connected: true, request: (msg, match, opts) => { const q = { msg, match, opts }; reqs.push(q); return () => { q.done = true; }; } } });
  return { v, reqs, root, list };
};
/** the view's live meta, as src/lib/chat-view.js dispatches it (its one line, lifted) */
const META_ANCHOR = "if (op.subtype === 'rewind-kept-line' || op.subtype === 'rewind-kept-lines')";
const metaOf = (src) => { const line = src.split('\n').find((l) => l.includes(META_ANCHOR)); if (!line) throw new Error('lift: the kept-lines meta line not found'); return new Function('op', line); };
/** a files press through the view up to its frame → {s, press} */
const pressThrough = async (V) => {
  const s = fresh(V, { files: true }); view = s.v; said.length = 0; s.v._yes = true;
  s.v._rewindFromMessage(person); await tick();
  const fq = s.reqs.find((q) => q.msg.type === 'rewind-files');
  dryAnswer(tierOne(s.reqs)); fq.match({ type: 'rewind-files-result', sessionId: 'sess-1', reqId: fq.msg.reqId, ...FILES() }); await tick(); await tick(); await tick();
  return { s, press: s.reqs.find((q) => q.msg.type === 'rewind-files' && !q.msg.dryRun) };
};
/** THE SERVER's own frames for one conversation: a real keep on scratch files, the files press's told line, an attach's record */
const KROOT = fs.mkdtempSync(path.join(SCRATCH, 'kept-')), KWORK = fs.mkdtempSync(path.join(SCRATCH, 'work-')), KO = { dataRoot: KROOT, call: kcall };
const serverFrames = async (hex8, { now, msgAt }) => {
  const f = path.join(KWORK, `${hex8}.txt`); fs.writeFileSync(f, 'as it was\n');
  const kept = await KD.keepFor({ session: { mode: 'chat' }, conv: 'sess-1', files: [f], by: { kind: 'human', actBy: null }, now, hex8, ...KO });
  const told = [];
  await KD.afterFilesPress({ mode: 'chat' }, 'sess-1', { ok: true, results: { kept: { press: kept.press, machine: null, files: 1, msgAt }, files: { ok: true } } }, { broadcastToSession: (sx, id, fr) => told.push(fr), now, ...KO });
  return { kept, told };
};
const attachFrame = async (now) => { const sent = []; await KD.sendKeptLines({ readyState: 1, send: (x) => sent.push(JSON.parse(x)) }, 'sess-1', { ...KO, now }); return sent[0] || null; };
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
  const before = clock.timers.length;
  press.match({ type: 'rewind-files-result', sessionId: 'sess-1', reqId: press.msg.reqId, ok: true, steps: ['files', 'conversation'], results: { files: { ok: true }, kept: { press: 'kp-mwq6g800-0000aaaa', files: 2 }, conversation: { ok: true, asked: true } }, outcome: { done: ['files', 'conversation'] } });
  const armed = before === 0 ? clock.timers.find((x) => x.id === s.v._rewindAnswerTimer) : null;
  ok(said.some((x) => x[0] === t('Files put back or removed: {n}.', { n: 2 })) && s.v._rewindInFlight === true && !!armed && armed.at === clock.now + door.REWIND_LIFE_MS,
    '② its answer: the files step SAID on its own (put back or removed); the conversation step still waits its own answer — tier one\'s minute, ARMED by this answer (its own timer; r2245 (11))', said);
  // r2245 (4): a person's press is ATTENDED — «Checking the files…» while the files dry run is out; a window closed meanwhile: no dialog
  s = fresh(V, { files: true }); view = s.v; said.length = 0; toasts.length = 0; s.v._yes = false;
  s.v._rewindFromMessage(person); await tick();
  dryAnswer(tierOne(s.reqs)); await tick();
  const checking = toasts.find((x) => x[0] === t('Checking the files…')), noDialogYet = !said.some((x) => x[0] === 'confirm');
  s.v._disposed = true;
  const fq3 = s.reqs.find((q) => q.msg.type === 'rewind-files');
  fq3.match({ type: 'rewind-files-result', sessionId: 'sess-1', reqId: fq3.msg.reqId, ...FILES() }); await tick(); await tick();
  ok(!!checking && checking[2].pinned === true && noDialogYet && checking[1].removed === true && !said.some((x) => x[0] === 'confirm') && s.v._rewindInFlight === false,
    '② A PRESS IS ATTENDED (r2245 (4)): «Checking the files…» stands while the files dry run is out (taken away when it answers); a window closed meanwhile draws NO dialog', { checking: !!checking, removed: checking && checking[1].removed });
  // r2245 (10): «both» refused by the CONVERSATION — tier one's words, never «the files changed»
  const pc = await pressThrough(V); said.length = 0;
  pc.press.match({ type: 'rewind-files-result', sessionId: 'sess-1', reqId: pc.press.msg.reqId, ok: false, reason: 'changed-since', cls: 'moved', step: 'conversation' });
  ok(said.some((x) => x[0] === 'refusal' && x[1] === 'changed-since') && !said.some((x) => x[0] === W.pressRefusalWords('changed-since')) && pc.s.v._rewindInFlight === false,
    '② «BOTH» REFUSED BY THE CONVERSATION (r2245 (10)): said in tier one\'s words (the conversation moved), never «the files changed since this was opened»', said);
  // THE KEPT LINES, from the SERVER's own frames through the view's live meta (r2245 (1): no door fed by hand)
  const T = Date.now();
  const kOne = await serverFrames('0000abab', { now: T - 1000, msgAt: T - 3600e3 });
  s = fresh(V, { files: true }); view = s.v; said.length = 0;
  const meta = metaOf(VSRC);
  meta.call(s.v, kOne.told[0]);
  const stripNow = () => s.root.children.find((c) => c.className === 'chat-rewind-kept') || null;
  const doors = () => s.root.all().filter((e) => e.tagName === 'BUTTON' && e.className !== 'chat-rewind-kept-close');
  const st1 = stripNow();
  ok(kOne.kept.ok && kOne.told.length === 1 && kOne.told[0].data.door === true && !!st1 && s.root.children.indexOf(st1) < s.root.children.indexOf(s.list) && !s.list.all().includes(st1) && doors().length === 1
    && st1.innerText.includes(t('the rewind to your message of {when}', { when: dateOf(T - 3600e3, { words: true }) })) && !!s.root.style.props['--chat-kept-h'],
    '② A FILES PRESS\'s TOLD LINE (the server\'s own frame, r2245 (1)): drawn WITH its door, naming which rewind; in its OWN place above the message list (a sibling before it, never inside it), its height given to what floats over the list (r2245 (3))', { told: kOne.told[0].data, at: st1 && s.root.children.indexOf(st1) });
  const kTwo = await serverFrames('0000acac', { now: T - 500, msgAt: T - 1800e3 });
  await KD.afterPutBack({ mode: 'chat' }, 'sess-1', kTwo.kept.press, { ok: true, rows: [{ path: '/w/x', act: 'overwrite', done: true }] }, { broadcastToSession: () => { }, now: T - 400, ...KO });
  const att = await attachFrame(T);
  s = fresh(V, { files: true }); view = s.v; said.length = 0;
  meta.call(s.v, att);
  const box = () => (stripNow() ? stripNow().children.find((c) => c.className === 'chat-rewind-kept-lines') : null);
  const order = box() ? box().children.map((c) => c.innerText) : [];
  ok(!!att && att.data.lines.length === 2 && order.length === 2 && order[0].includes(W.putBackDoorWords()) && /was put back on/.test(order[1]) && doors().length === 1,
    '② AN ATTACH draws the whole record (the server\'s frame): the line whose copy stands FIRST, with its door; the put-back kOne after it, no door', order);
  const close = stripNow().children.find((c) => c.className === 'chat-rewind-kept-close');
  close.onclick();
  const closed = !stripNow() && s.root.style.props['--chat-kept-h'] === '0px';
  meta.call(s.v, await attachFrame(T));
  ok(!!close && close.attrs['aria-label'] === t('Close') && closed && !!stripNow() && doors().length === 1,
    '② ITS CLOSE is for this view only: the strip goes (what floats over the list moves back up) and comes back at the next attach while a copy stands (r2245 (3))', { closed });
  const door1 = doors()[0];
  door1.onclick(); door1.onclick();
  const pbs = s.reqs.filter((q) => q.msg.type === 'rewind-files-put-back');
  ok(pbs.length === 1 && pbs[0].msg.dryRun === true && s.root.all().some((e) => e.className === 'chat-rewind-kept-said' && /already being put back/.test(e.textContent)) && doors().length === 1,
    '② TWO PRESSES of one put-back on this page: ONE ask; the second press is SAID (the button stays live, never greyed)', pbs.length);
  stripNow().remove(); s.v._redrawKeptLines();
  ok(!!stripNow() && s.root.children.indexOf(stripNow()) < s.root.children.indexOf(s.list), '② a strip dropped from the page is drawn again in its place by a redraw (a history load calls it)');
  // r2372 (3): a told PATCH with no state of its own (a put-back over a record that could not be read) keeps what the page drew
  const live1 = att.data.lines.find((l) => l.door === true);
  meta.call(s.v, { type: 'msg', sessionId: 'sess-1', op: 'meta', subtype: 'rewind-kept-line', data: { press: live1.press, triedAt: T, notPut: 1, unrecorded: true } });
  const kept1 = s.v._keptLines.get(live1.press);
  ok(kept1.state === 'kept' && kept1.door === true && doors().length === 1 && box().children[0].innerText.includes(t('This line could not be saved: the conversation\'s record of kept files could not be read.')),
    '② a told patch is laid over the line this page drew — its state and its door kept; the line says it was not saved (the hub\'s half — no door, no state in the frame — is test-rewind-kept\'s leg, r4423 MUST 2)', kept1);
  // r4423 (a): a patch with no state for a press this page NEVER drew (a window attached after the record was torn) is not drawn
  const pa = fresh(V, { files: true }); view = pa.v;
  meta.call(pa.v, { type: 'msg', sessionId: 'sess-1', op: 'meta', subtype: 'rewind-kept-line', data: { press: 'kp-mwq6g800-0000abcd', triedAt: T, notPut: 1, unrecorded: true } });
  ok(!pa.root.children.some((c) => c.className === 'chat-rewind-kept') && !(pa.v._keptLines && pa.v._keptLines.has('kp-mwq6g800-0000abcd')),
    '② A PATCH FOR A PRESS THIS PAGE NEVER DREW (r4423 (a)) is not drawn at all — never «gone» for files whose copy still stands (the attach already said the record could not be read)');
  // a line that arrives keeps the strip's scroll place (r2372)
  box().scrollTop = 40;
  meta.call(s.v, { type: 'msg', sessionId: 'sess-1', op: 'meta', subtype: 'rewind-kept-line', data: { ...live1, files: 2 } });
  ok(box().scrollTop === 40, '② a line that arrives keeps the strip\'s own scroll place (r2372)', box().scrollTop);
  // r2372 (2): THE VIEW's END takes «Checking the files…» away (a closed view's ask never settles) and stops the strip's size watcher
  const sc = fresh(V, { files: true }); view = sc.v; toasts.length = 0; sc.v._yes = false;
  sc.v._rewindFromMessage(person); await tick();
  dryAnswer(tierOne(sc.reqs)); await tick();
  sc.v._sayKeptLine({ ...live1 });
  const chk = toasts.find((x) => x[0] === t('Checking the files…')), ro = watchers[watchers.length - 1];
  const before2 = !!chk && chk[1].removed === false && !!ro && ro.on === true;
  sc.v._disposed = true; sc.v._endKeptView();
  ok(before2 && chk[1].removed === true && ro.on === false && /this\._endKeptView\?\.\(\); \/\/ B-437e U3 \(r2372 \(2\)\)/.test(VSRC.slice(VSRC.indexOf('  dispose() {'), VSRC.indexOf('  dispose() {') + 600)),
    '② THE VIEW\'s END (dispose calls _endKeptView — r2372 (2)): «Checking the files…» is taken away though the files ask never answers, and the strip\'s size watcher stops', { before2, removed: chk && chk[1].removed, ro: ro && ro.on });
  // THE WIRING no other leg reads (r2245 (11)): the hub's attach field and after-calls; the page's meta parse; the history loads' redraw
  const WS = fs.readFileSync(path.join(REPO, 'src/ws-handler.js'), 'utf8');
  const WIRES = [['the attach payload\'s files fact', 'fileCheckpoints: session._fileCheckpoints === true,'],
    ['the record sent at an attach, keyed by the conversation, framed for the page', "const KD = require('./server/rewind-kept-door.js'), c = KD.convKeyOf(session); if (c) KD.sendKeptLines(ws, c, { sid: data.sessionId });"],
    ['the files press keyed by the conversation (r2372 (1))', "const conv = require('./server/rewind-kept-door.js').convKeyOf(session);   // the CONVERSATION's own folder"],
    ['the line after a files press (any answer that kept)', "if (data.dryRun !== true) require('./server/rewind-kept-door.js').afterFilesPress(session, conv, r, { broadcastToSession, hosts, msgId: data.msgId, sid: data.sessionId })"],
    ['the lines after a put-back', "require('./server/rewind-kept-door.js').afterPutBack(session, conv, data.press, r, { broadcastToSession, hosts, sid: data.sessionId })"]];
  const unwired = WIRES.filter(([, x]) => WS.split(x).length !== 2).map(([n]) => n);
  const parseLine = VSRC.split('\n').find((l) => l.includes("if ('fileCheckpoints' in meta)"));
  const pv = {}, parse = new Function('meta', parseLine || 'throw new Error("no parse line")');
  parse.call(pv, { fileCheckpoints: true }); const p1 = pv._fileCheckpoints; parse.call(pv, { fileCheckpoints: 'yes' }); const p2 = pv._fileCheckpoints;
  const vl = VSRC.split('\n'), redraws = vl.filter((l, i) => l.includes('this._redrawKeptLines();') && /meta\.leftBehind/.test(vl[i - 1] || '')).length;
  ok(!unwired.length && p1 === true && p2 === false && redraws === 2,
    '② THE WIRING (r2245 (11)): the hub sends the files fact at an attach, the record after it, a line after every press that kept and after every put-back (src/ws-handler.js); the page reads the fact ONLY as true; both history loads draw the lines again', { unwired, p1, p2, redraws });
  // the strip's CSS (r2245 (3)): its own place, its bound and scroll; what floats over the list's top edge moves down by its height
  const cs = cssOk(CSS);
  ok(cs.own && cs.scroll && cs.phone && !cs.floats.length, '② THE STRIP\'s CSS (r2245 (3)): its own row of the view (never an overlay), its lines bounded with their own scroll (about three lines at phone width); the left-behind line, the history status, the position pill and the run bar move down by its height', cs);
}

console.log('— red controls');
{
  const V0 = liftView(VSRC);
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
  const doorGone = await wordsWith("  if (l.state === 'kept' && l.door) {", "  if (l.state !== 'put-back') {", 'page: a door on a gone copy');
  ok(doorGone.keptLineModel({ press: 'kp-x', state: 'gone', door: false, until: 9 }).door === true, 'RED CONTROL (a door on a copy that is gone): the line offers «Put my files back» after the copy is swept');
  const noWatch = liftView(anchored(VSRC, "        clearTimeout(this._rewindAnswerTimer);   // the conversation step was ASKED: tier one's minute, from now\n        this._rewindAnswerTimer = setTimeout(", "        clearTimeout(this._rewindAnswerTimer);\n        void (", 'page: the press\'s watchdog never armed'));
  const nw = await pressThrough(noWatch);
  nw.press.match({ type: 'rewind-files-result', sessionId: 'sess-1', reqId: nw.press.msg.reqId, ok: true, steps: ['files', 'conversation'], results: { files: { ok: true }, kept: { press: 'kp-mwq6g800-0000aaaa', files: 2 }, conversation: { ok: true, asked: true } }, outcome: { done: ['files', 'conversation'] } });
  ok(!clock.timers.some((x) => x.id === nw.s.v._rewindAnswerTimer), 'RED CONTROL (the press\'s watchdog never armed): the conversation step waits with no minute — the leg\'s own-timer read sees it (it could not, with a shared clock)');
  const keepsNote = liftView(anchored(VSRC, "    try { this._filesCheckNote?.remove?.(); } catch { }\n", '', 'page: the view\'s end leaves the checking line'));
  const kn = fresh(keepsNote, { files: true }); view = kn.v; toasts.length = 0; kn.v._yes = false;
  kn.v._rewindFromMessage(person); await tick();
  dryAnswer(tierOne(kn.reqs)); await tick();
  kn.v._disposed = true; kn.v._endKeptView();
  const knNote = toasts.find((x) => x[0] === t('Checking the files…'));
  ok(!!knNote && knNote[1].removed === false, 'RED CONTROL (the view\'s end leaves «Checking the files…»): a window closed while its files are checked leaves the line pinned for good');
  const drawsUndrawn = liftView(anchored(VSRC, "    if (!d.state && !lines.has(d.press)) return;\n", '', 'page: an undrawn patch drawn'));
  const du = fresh(drawsUndrawn, { files: true }); view = du.v;
  metaOf(VSRC).call(du.v, { type: 'msg', sessionId: 'sess-1', op: 'meta', subtype: 'rewind-kept-line', data: { press: 'kp-mwq6g800-0000abce', triedAt: Date.now(), notPut: 1, unrecorded: true } });
  ok(du.root.all().some((e) => /is gone/.test(e.textContent || '')), 'RED CONTROL (a patch for a press never drawn, drawn): a second window shows «the copy … is gone» for files whose copy still stands');
  const keepsWatcher = liftView(anchored(VSRC, "    try { this._keptRo?.disconnect?.(); } catch { }\n", '', 'page: the view\'s end leaves the size watcher'));
  const kw = fresh(keepsWatcher, { files: true }); view = kw.v;
  kw.v._sayKeptLine({ press: 'kp-mwq6g800-0000abcf', state: 'kept', door: true, files: 1, at: 1, until: 9e12 });
  const kwRo = watchers[watchers.length - 1]; kw.v._disposed = true; kw.v._endKeptView();
  ok(!!kwRo && kwRo.on === true, 'RED CONTROL (the view\'s end leaves the size watcher): a closed view keeps watching its strip');
  const unwiredMeta = metaOf(anchored(VSRC, "{ this._onKeptMeta(op); return; }", "{ void op; return; }", 'page: the kept-lines meta not wired'));
  const uw = fresh(V0, { files: true }); view = uw.v;
  unwiredMeta.call(uw.v, (await serverFrames('0000adad', { now: Date.now() - 100, msgAt: Date.now() - 9e5 })).told[0]);
  ok(!uw.root.children.some((c) => c.className === 'chat-rewind-kept'), 'RED CONTROL (the kept-lines meta not wired): a second client is told a kept line and draws nothing');
  const over = cssOk(anchored(CSS, '.chat-left-behind { position: absolute; top: calc(40px + var(--chat-kept-h, 0px));', '.chat-left-behind { position: absolute; top: 40px;', 'css: the left-behind line over the strip'));   // stale-pins: kept (a red control: it plants the old text)
  ok(over.floats.includes('.chat-left-behind'), 'RED CONTROL (the left-behind line back at its fixed top): it would sit over the strip — the CSS leg names it', over.floats);
}

report();
