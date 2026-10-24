#!/usr/bin/env node
// test-browser-takeover-request — FAST, PURE (lane browser-takeover-queue — a fleet power user, 2026-10-23: 「…所有等待我
// take over 的都在这里集中一下，然后这样我多个 task 并行的时候都可以在这集中处理这些需要 take over 的东西」).
// src/browser-takeover-request.js is THE takeover request record: the keeper writes it, the routes answer it, the
// announcer files its ONE For-you item, the Agent browser window / the live view / the rail draw it.
//   ① THE RECORD: its fields, the agent's words ONE line of ≤ 300 code points (whitespace folded, the cut said, a hidden /
//      reordering character dropped), a url only with a scheme, the title bounded
//   ② THE STATE MACHINE: waiting ─take→ taken ─handback→ done · taken ─release→ waiting · waiting ─done→ done ·
//      open ─withdraw / lease-gone→ withdrawn · a closed request never moves (refused `closed`) · every handback cause
//   ③ ONE REQUEST PER LEASE: a re-ask re-asserts (the same id, its new words, asks + 1, the parking ends); a closed one never
//   ④ WHO MAY SEE IT (the live view's rule): the owner while the lease is held · an agent its own (a helper's key too) ·
//      nobody else
//   ⑤ THE QUEUE: only open + visible, the driven first then the waiting longest-waiting first; no viewer id leaves
//   ⑥ THE AGENT'S WORDS: the ask's answer, human_asked (+ the wait's budget and lines), the ended / handback / done lines
//   ⑦ THE FOR-YOU ITEM: urgent (band 1) / parked (band 4), its dedupe text stable across re-asks, the words in i18n params,
//      the action's identity; who resolved it
//   ⑧ THE RAIL BADGE (channelsBadge's sibling) over the REAL attention model: the waiting ones in bands 1–4, a parked one
//      still counted (band 4), a driven one not, the owner's band 1 switched off ⇒ the urgent one falls to band 5 ⇒ no count
//   ⑨ MUTANTS: a release that resolves the request (the person walked away ⇒ «done») and a re-ask that files a second row ⇒ RED
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { mutantCopies } from './mutant-copy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const R = require(path.join(ROOT, 'src/browser-takeover-request.js'));
const A = require(path.join(ROOT, 'src/attention-model.js'));
let pass = 0, fail = 0;
const ok = (c, m, e) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (e !== undefined ? ' — ' + JSON.stringify(e) : '')); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m, { got: a, want: b });
const M = mutantCopies('takeover-request', ROOT);
const T0 = Date.UTC(2026, 9, 23, 18, 0, 0);
const base = (o = {}) => R.newRequest({ id: 'tr-0000aaaa', browserKey: 'bk-aaaa', profileId: 'bp-bank', conversationKey: 'claude:c1', sessionId: 'sess-1', conversationName: 'Bank reconcile', profileLabel: 'bank', text: 'Log in to the bank and solve the captcha', url: 'https://bank.example/login', title: 'Sign in — Bank', at: T0, ...o });

console.log('① the record');
{
  const r = base();
  eq([r.id, r.state, r.browserKey, r.profileId, r.ephemeral, r.asks, r.at, r.askedAt, r.takenAt, r.doneAt, r.how, r.parked, r.itemId], ['tr-0000aaaa', 'waiting', 'bk-aaaa', 'bp-bank', false, 1, T0, T0, 0, 0, null, false, null], 'a new request waits, one ask, nothing taken or done');
  ok(R.newRequest({ id: 'tr-0000bbbb', browserKey: 'bk-a', text: 'x' }).ephemeral === true, 'a request with no profile is about the conversation\'s OWN browser (ephemeral)');
  const long = R.newRequest({ id: 'tr-0000cccc', browserKey: 'bk-a', text: 'a'.repeat(400) });
  ok([...long.text].length === R.LIMITS.textChars && long.text.endsWith('…'), `the agent's words are cut at ${R.LIMITS.textChars} code points, the cut said with …`, [...long.text].length);
  const cjk = R.newRequest({ id: 'tr-0000dddd', browserKey: 'bk-a', text: '请'.repeat(301) });
  ok([...cjk.text].length === 300, 'the bound counts CODE POINTS (a CJK sentence is cut at 300 characters, not bytes)');
  eq(R.newRequest({ id: 'tr-0000eeee', browserKey: 'bk-a', text: '  log in\n\n  then\tpress   Continue ' }).text, 'log in then press Continue', 'ONE line: line breaks, tabs and runs of spaces become one space');
  ok(R.newRequest({ id: 'tr-0000ffff', browserKey: 'bk-a', text: 'pay \u202eevil\u202c now\u200b' }).text === 'pay evil now', 'the agent\'s words lose a reordering character (U+202E / U+202C) and a zero-width one (THE one set, src/hidden-chars.js)');
  eq([base({ url: 'javascript:alert(1)' }).url !== '', base({ url: 'bank.example/x' }).url, base({ url: 'https://a b' }).url], [true, '', ''], 'a url needs a scheme and no whitespace (a bare host / a spaced string is dropped) — the row draws it as text, never a link');
  ok([...base({ title: 't'.repeat(500) }).title].length === R.LIMITS.titleChars, `the tab title is bounded (${R.LIMITS.titleChars})`);
  eq(R.leaseKeyOf({ browserKey: 'bk-a', profileId: 'bp-x' }) + ' ' + R.leaseKeyOf({ browserKey: 'bk-a' }), 'bk-a|bp-x bk-a|ephemeral', 'the lease key: (browser key, profile) — the conversation\'s own browser is `|ephemeral` (the keeper\'s input key)');
  ok(R.askVerdict({ text: '   ', lease: { browserKey: 'bk-a' } }).code === 'empty' && R.askVerdict({ text: 'x', lease: null }).code === 'no_browser' && R.askVerdict({ text: 'x', lease: { browserKey: 'bk-a' } }).ok, 'an ask needs words (empty) and a browser (no_browser), else it is filed');
}

console.log('② the state machine');
{
  const r = base();
  const tk = R.transition(r, 'take', { at: T0 + 1000, viewerId: 7 });
  eq([tk.ok, tk.changed, tk.from, tk.to, tk.rec.takenAt, tk.rec.takenBy], [true, true, 'waiting', 'taken', T0 + 1000, '7'], 'waiting ─take→ taken (when, by which view)');
  const again = R.transition(tk.rec, 'take', { at: T0 + 2000, viewerId: 8 });
  ok(again.ok && !again.changed && again.rec.takenAt === T0 + 1000, 'a second takeover (another view, a pass) changes nothing — the same cycle');
  const hb = R.transition(tk.rec, 'handback', { at: T0 + 5000 });
  eq([hb.to, hb.rec.doneAt, hb.rec.how, hb.rec.takenBy], ['done', T0 + 5000, 'handback', null], 'taken ─handback (the person\'s explicit Hand back)→ done');
  const rel = R.transition(tk.rec, 'release', { at: T0 + 5000 });
  eq([rel.to, rel.rec.doneAt, rel.rec.takenBy], ['waiting', 0, null], 'taken ─release (idle / the view closed / a stop)→ WAITING again — nobody said it is done, it stays listed');
  ok(R.transition(r, 'release', {}).ok && !R.transition(r, 'release', {}).changed, 'a release of a waiting request changes nothing');
  eq([R.transition(r, 'done', { at: 9 }).to, R.transition(r, 'done', { at: 9 }).rec.how], ['done', 'done'], 'waiting ─done (the person\'s Done, no takeover)→ done');
  eq([R.transition(r, 'withdraw', {}).to, R.transition(tk.rec, 'withdraw', {}).to, R.transition(tk.rec, 'lease-gone', {}).rec.how], ['withdrawn', 'withdrawn', 'lease-gone'], 'waiting | taken ─withdraw / lease-gone→ withdrawn (how says which)');
  const closed = hb.rec;
  ok(['take', 'handback', 'release', 'done', 'withdraw', 'lease-gone'].every((h) => R.transition(closed, h, {}).code === 'closed'), 'CONTROL: a Done on a request already done is refused closed — and so is every other move (a closed request never moves)');
  ok(R.transition(r, 'resolve', {}).code === 'bad_how', 'an unknown move is refused bad_how');
  eq(['explicit', 'continue', 'idle', 'viewer-left', 'stop', 'detach', 'whatever'].map(R.howOfHandback), ['handback', 'handback', 'release', 'release', 'release', 'release', 'release'], 'a handback the person CHOSE (Hand back, Hand back and continue) ends the request; every other cause releases it');
}

console.log('③ one request per lease — a re-ask re-asserts');
{
  const r = { ...base(), parked: true };
  const ra = R.reassert(r, { text: 'Now also accept the cookie banner', at: T0 + 60000 });
  eq([ra.ok, ra.rec.id, ra.rec.text, ra.rec.asks, ra.rec.askedAt, ra.rec.at, ra.rec.parked, ra.rec.url], [true, 'tr-0000aaaa', 'Now also accept the cookie banner', 2, T0 + 60000, T0, false, 'https://bank.example/login'], 'the SAME id, the new words, asks 2, a newer askedAt (the first ask kept), the parking ends, the old tab kept when none is named');
  ok(R.reassert(R.transition(base(), 'done', {}).rec, { text: 'x' }).code === 'closed', 'a closed request is never re-asserted (a new ask on that lease is a new request)');
  const tk = R.transition(base(), 'take', { at: T0 + 1 }).rec;
  ok(R.reassert(tk, { text: 'y', at: T0 + 2 }).rec.state === 'taken', 'a re-ask while the person drives keeps it taken');
}

console.log('④ who may see it');
{
  const r = base();
  eq([R.seeVerdict({ request: r, viewer: { kind: 'owner' }, leaseHeld: true }).ok, R.seeVerdict({ request: r, viewer: { kind: 'owner' }, leaseHeld: false }).ok], [true, false], 'the owner sees it while the conversation still holds that browser — not after (the live view could not open it either)');
  eq([R.seeVerdict({ request: r, viewer: { kind: 'agent', browserKey: 'bk-aaaa' } }).ok, R.seeVerdict({ request: r, viewer: { kind: 'agent', browserKey: 'bk-aaaa.2' } }).ok, R.seeVerdict({ request: r, viewer: { kind: 'agent', browserKey: 'bk-bbbb' } }).ok], [true, true, false], 'an agent sees its OWN conversation\'s request (a helper of it too) — never another conversation\'s');
  ok(!R.seeVerdict({ request: r, viewer: null, leaseHeld: true }).ok && !R.seeVerdict({ request: r, viewer: { kind: 'job' }, leaseHeld: true }).ok, 'nobody else sees a request');
}

console.log('⑤ the queue');
{
  const a = base({ id: 'tr-0000000a', at: T0 + 3000, browserKey: 'bk-a' });
  const b = base({ id: 'tr-0000000b', at: T0 + 1000, browserKey: 'bk-b' });
  const c = R.transition(base({ id: 'tr-0000000c', at: T0 + 5000, browserKey: 'bk-c' }), 'take', { at: T0 + 6000, viewerId: 3 }).rec;
  const d = R.transition(base({ id: 'tr-0000000d', at: T0, browserKey: 'bk-d' }), 'done', {}).rec;
  const e = base({ id: 'tr-0000000e', at: T0 + 2000, browserKey: 'bk-e' });
  const q = R.queueOf([a, b, c, d, e], { viewer: { kind: 'owner' }, leaseHeld: (r) => r.browserKey !== 'bk-e', live: (r) => r.browserKey !== 'bk-b' });
  eq(q.map((x) => x.id), ['tr-0000000c', 'tr-0000000b', 'tr-0000000a'], 'only OPEN requests the viewer may see (the closed one out, the one whose lease is gone out); the driven one first, then the waiting longest-waiting first');
  ok(q.every((x) => !('takenBy' in x)) && q.find((x) => x.id === 'tr-0000000b').live === false, 'no viewer id leaves the keeper; a conversation not running is marked (live: false)');
  eq(R.waitingCount(q), 2, 'the count (title, badge) = the WAITING rows — a driven one is being done');
  eq(R.queueOf([a, b], { viewer: { kind: 'agent', browserKey: 'bk-a' } }).map((x) => x.id), ['tr-0000000a'], 'an agent\'s queue is its own request');
}

console.log('⑥ the agent\'s words');
{
  const r = base();
  const ans = R.askAnswer(r, {});
  ok(/request tr-0000aaaa/.test(ans) && ans.includes('"Log in to the bank and solve the captcha"') && /waits until they hand back or you withdraw/.test(ans) && ans.includes('vibespace-browser ask-human --withdraw') && /end your turn now — the handback arrives as a message/.test(ans), 'the ask\'s answer: the id, the words, where the person sees it, the next verb WAITS, the withdraw, the turn may end');
  ok(/asked again — the same request tr-0000aaaa \(no second row\)/.test(R.askAnswer(r, { reasserted: true })) && /cut at 300/.test(R.askAnswer(r, { cut: 300 })), 'a re-ask says it is the same request; a cut says so');
  const h = R.humanAskedRefusal(r, { handles: ['bank'], now: T0 + 120000 });
  eq([h.ok, h.code, h.handles, h.request.id, h.request.state, h.request.waitMs, h.request.pollMs], [false, 'human_asked', ['bank'], 'tr-0000aaaa', 'waiting', R.WAIT_MS, R.POLL_MS], 'human_asked: typed, the handles, the request with the wait\'s budget (the CLI ships without src/ — the server says it)');
  ok(/your command did NOT run yet/.test(h.error) && /2 min ago/.test(h.error) && /up to 90 s/.test(h.request.waitLine) && /End your turn: their handback arrives as a message/.test(h.request.stillLine) && /Do not retry in a loop/.test(h.request.stillLine), 'the refusal and the wait\'s two lines say what ran (nothing), how long it waits, and what to do after');
  ok(R.WAIT_MS < 120000 && R.POLL_MS < R.WAIT_MS, 'one verb waits under the agent harness\'s 2-minute tool cap, in long-polls shorter than that');
  const done = R.transition(r, 'handback', {}).rec, mark = R.transition(r, 'done', {}).rec, wd = R.transition(r, 'withdraw', {}).rec, lg = R.transition(r, 'lease-gone', {}).rec;
  ok(/handed back\) — re-read the page first; your command runs now/.test(R.endedLine(done)) && /marked done without taking over here/.test(R.endedLine(mark)) && /was withdrawn/.test(R.endedLine(wd)) && /ended with your lease/.test(R.endedLine(lg)), 'the wait\'s end says why the verb now runs (handed back · marked done · withdrawn · the lease ended)');
  ok(R.handbackLine(done) === 'This answers your request tr-0000aaaa ("Log in to the bank and solve the captcha") — it is done.' && R.handbackLine(null) === '', 'the handback\'s delivery names the request it answers');
  ok(/marked your browser request tr-0000aaaa .* done from the Agent browser window — they did not take over/.test(R.doneText(r)) && /https:\/\/bank\.example\/login/.test(R.doneText(r)), 'Done without a takeover is told in its own words (the page it was about)');
  ok(/waiting for a person/.test(R.statusAnswer(r, T0)) && /no request is open/.test(R.statusAnswer(null)) && /the person is driving/.test(R.statusAnswer(R.transition(r, 'take', { at: T0 }).rec, T0)), '--status says the state in words');
  ok(/withdrew request tr-0000aaaa/.test(R.withdrawAnswer(r)), 'the withdraw\'s answer names it');
}

console.log('⑦ the For-you item');
{
  const r = base();
  const it = R.itemOf(r), it2 = R.itemOf(R.reassert(r, { text: 'Different words now', at: T0 + 5 }).rec), parked = R.itemOf({ ...r, parked: true });
  eq([it.urgency, parked.urgency], ['urgent', 'normal'], 'open ⇒ urgent (band 1); parked by a dismissal ⇒ normal (band 4 — still listed, never resolved by it)');
  ok(it.text === it2.text && it.text === 'An assistant needs you in its browser', 'the dedupe TEXT is stable across re-asks (the store reopens / refreshes the SAME item)');
  eq([it.i18n.text.key, it.i18n.text.params.words, it2.i18n.text.params.words], ['Take over the browser: {words}', 'Log in to the bank and solve the captcha', 'Different words now'], 'the words ride the i18n params (each device words them); a re-ask moves them');
  eq(it.action, { type: 'browser-takeover', requestId: 'tr-0000aaaa', profileId: 'bp-bank', browserKey: 'bk-aaaa', ephemeral: false }, 'the action names the request (its identity: src/user-todos.js ACTION_IDENTITY browser-takeover → requestId)');
  ok(/"Log in to the bank and solve the captcha"/.test(it.detail) && /Page: Sign in — Bank \(https:\/\/bank\.example\/login\)/.test(it.detail), 'the English detail: the words and the page');
  const UT = fs.readFileSync(path.join(ROOT, 'src/user-todos.js'), 'utf8');
  ok(/'browser-takeover': 'requestId'/.test(UT), 'the store merges an item only with a filing of the same request');
  eq(['handback', 'done', 'withdraw', 'lease-gone'].map((h) => R.resolvedByOf(R.transition(r, h, {}).rec)), ['handed-back', 'user', 'agent', 'conversation-gone'], 'who resolved the item: the handback · the person · the agent · the lease ended');
}

console.log('⑧ the rail badge — the real attention model');
{
  const w1 = base({ id: 'tr-000000a1', at: T0 }), w2 = base({ id: 'tr-000000a2', at: T0 + 10 });
  const tk = R.transition(base({ id: 'tr-000000a3' }), 'take', { at: T0 }).rec;
  const pk = { ...base({ id: 'tr-000000a4' }), parked: true };
  const bands = A.settingsPolicy(() => undefined);
  eq(R.takeoverBadge([w1, w2, tk], T0, { bands, needsMe: A.needsMe }), 2, 'two waiting + one driven ⇒ 2 (a driven one is being done)');
  eq(A.bandOfRow(R.attentionRowOf(w1), T0), 1, 'a waiting request is a band-1 row (urgent)');
  eq([A.bandOfRow(R.attentionRowOf(pk), T0), R.takeoverBadge([pk], T0, { bands, needsMe: A.needsMe })], [4, 1], 'a PARKED one is a band-4 row (a producer\'s button) — still counted (bands 1–4)');
  const off = A.settingsPolicy((k) => (k === 'attention.band.urgent' ? false : undefined));
  eq(R.takeoverBadge([w1], T0, { bands: off, needsMe: A.needsMe }), 0, 'the owner switched band 1 OFF ⇒ the urgent row falls to band 5 ⇒ no badge (the owner\'s switches, the ONE reader)');
  eq(R.takeoverBadge([w1], T0, {}), 0, 'no attention model handed in ⇒ 0 (never a guess)');
}

console.log('⑨ mutants');
{
  const SRC = fs.readFileSync(path.join(ROOT, 'src/browser-takeover-request.js'), 'utf8');
  const n1 = "  if (how === 'release') {\n";
  ok(SRC.split(n1).length === 2, 'mutant anchor 1 present once');
  const Rel = M.load('src/browser-takeover-request.js', SRC.replace(n1, "  if (how === 'release') return close('done');\n  if (false) {\n"), 'release-resolves');
  const tk = Rel.transition(Rel.newRequest({ id: 'tr-0000aaaa', browserKey: 'bk-a', text: 'x' }), 'take', { at: 1 }).rec;
  ok(Rel.transition(tk, 'release', { at: 2 }).to === 'done', 'MUTANT: a release that resolves the request (the person closed the view ⇒ «done») — the ② release row reddens on it');
  const n2 = "  if (!isOpen(rec)) return { ok: false, code: 'closed', rec };\n";
  ok(SRC.split(n2).length === 2, 'mutant anchor 2 present once');
  const Two = M.load('src/browser-takeover-request.js', SRC.replace(n2, "  return { ok: false, code: 'closed', rec };\n"), 'reask-new-row');
  ok(Two.reassert(Two.newRequest({ id: 'tr-0000aaaa', browserKey: 'bk-a', text: 'x' }), { text: 'y' }).ok === false, 'MUTANT: a re-ask that never re-asserts (the keeper then files a SECOND row) — the ③ row reddens on it');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
