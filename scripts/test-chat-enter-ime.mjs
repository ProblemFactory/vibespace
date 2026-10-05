#!/usr/bin/env node
// AN ENTER MEANT FOR THE INPUT METHOD MUST NOT SEND THE MESSAGE (lane chat-enter-ime, inc-muukd9oq-qyc3, 2026-10-05 —
// the owner, Chrome 152 / macOS / a Chinese IME: "我还没写完消息怎么发出去了？"). PURE: src/lib/chat-enter-keys.js, the
// very EnterGuard ChatInput holds, driven over keydown/composition sequences with a fake clock in the handler's order.
//   §1 THE TABLE (r2, the owner's correction: the Enter that COMMITS an English word is what sent): Enter(229) →
//      compositionend → a plain Enter(13) +1 ms ⇒ 'ime-swallow' (no send, no newline, the hint) · the ring's shape · a
//      commit then Enter +1/+30 ms ⇒ swallow, +120/+300/+700 ms ⇒ send (Space → Enter never swallowed) · Cmd/Ctrl+Enter sends · Safari order (compositionend
//      before the 229 Enter) ⇒ no send, one hint · chat.enterSends off · touch keeps chat.touchEnterSends · expanded;
//   §2 the recorder's key words: S- for Shift, c:1 when the IME owned the key, k:'ime' start/end markers (textarea only),
//      an end's how: commit | cancel (r2 — the data's length, never its text);
//   §3 the send-mode hint names the send key when chat.enterSends is off; the schema row, zh/ja words, docs row;
//   §4 wiring census: ChatInput / the recorder / chat-view use these exports in the handler's order;
//   §5 patched-copy controls: the guard removed, or r1's "an Enter ended it" exemption restored ⇒ the owner's sequence
//      SENDS (and each other law has its own mutant).
// The real textarea under CDP Input.imeSetComposition is scripts/test-chat-enter-ime-chrome.mjs (heavy).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + JSON.stringify(e) : '')); } };
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');
const SRC = path.join(REPO, 'src/lib/chat-enter-keys.js');

// A sequence player in ChatInput's keydown order: imeOwnsKey ⇒ the IME's · Enter ⇒ guard.enter. (r2's guard has no
// keydown; the r1-exemption control restores one, so the player feeds it when present.)
const C = (key, extra = {}) => ({ kd: { key, isComposing: true, keyCode: 229, ...extra } });   // a key the IME owns
const K = (key, extra = {}) => ({ kd: { key, keyCode: key === 'Enter' ? 13 : 0, ...extra } });  // a plain key
const CS = { cs: 1 }, CE = { ce: 1 }, W = (ms) => ({ wait: ms });
function play(M, seq, ctx = {}) {
  let clock = 1_000_000;
  const g = new M.EnterGuard({ now: () => clock });
  const out = [];
  for (const s of seq) {
    if (s.wait) clock += s.wait;
    else if (s.cs) g.compositionstart();
    else if (s.ce) g.compositionend();
    else {
      const e = { shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, code: s.kd.key === 'Enter' ? 'Enter' : '', ...s.kd };
      g.keydown?.(e);
      if (M.imeOwnsKey(e)) { if (e.key === 'Enter' || e.code === 'Enter') out.push('ime'); continue; }
      if (e.key === 'Enter') out.push(g.enter(e, { expanded: false, touch: false, touchEnterSends: false, enterSends: true, ...ctx }));
    }
    clock += 1;
  }
  return out;
}
// the ring (2.369.207 recorder: no c:1 / ime markers): a word committed by a composing Enter ×2 (no send), then the
// next word — a capital letter's Shift at :11.860 inside it — and its committing Enter at :12.243 arriving PLAIN
const INCIDENT = [CS, C('n'), C('Enter'), CE, W(1150), CS, C('h'), C('Enter'), CE, W(1057), CS, C('Shift', { shiftKey: true }), C('H', { shiftKey: true }), W(383), CE, K('Enter')];
const OWNER = [CS, C('h'), C('Enter'), CE, W(1), K('Enter')];
const ROWS = [
  ['THE OWNER\'S SEQUENCE: Enter(229) → compositionend → a plain Enter(13, isComposing false) +1 ms ⇒ swallowed, no send', OWNER, ['ime', 'ime-swallow']],
  ['the ring\'s shape: two composing Enters, then a commit whose Enter arrives plain ⇒ swallowed', INCIDENT, ['ime', 'ime', 'ime-swallow']],
  ['…and the Enter after the hint SENDS (the hint says "press Enter again")', [...INCIDENT, W(1), K('Enter')], ['ime', 'ime', 'ime-swallow', 'send']],
  ['a commit (compositionend, data "hello"), Enter(13) +1 ms ⇒ swallowed + the hint', [CS, C('o'), CE, W(1), K('Enter')], ['ime-swallow']],
  ['…Enter +30 ms (still the commit\'s event burst) ⇒ swallowed', [CS, C('o'), CE, W(30), K('Enter')], ['ime-swallow']],
  ['…Enter +120 / +300 / +700 ms (a human\'s second press) ⇒ send', [CS, C('o'), CE, W(120), K('Enter'), CS, C('p'), CE, W(300), K('Enter'), CS, C('q'), CE, W(700), K('Enter')], ['send', 'send', 'send']],
  ['the everyday Chinese send: Space commits, Enter 120 / 250 ms later ⇒ send (never swallowed)', [CS, C('a'), C(' '), CE, W(120), K('Enter'), CS, C('b'), C(' '), CE, W(250), K('Enter')], ['send', 'send']],
  ['compositionend → Cmd+Enter / Ctrl+Enter +1 ms ⇒ send (a deliberate chord)', [CS, C('a'), CE, W(1), K('Enter', { metaKey: true }), CS, C('b'), CE, W(1), K('Enter', { ctrlKey: true })], ['send', 'send']],
  ['Safari order (compositionend BEFORE the 229 Enter) ⇒ no send; a plain Enter +10 ms ⇒ ONE swallow (one hint), then send', [CS, C('a', { isComposing: false }), CE, K('Enter', { keyCode: 229 }), W(10), K('Enter'), W(10), K('Enter')], ['ime', 'ime-swallow', 'send']],
  ['Chrome/Windows: the committing key reported as "Process" (code Enter), a plain Enter +10 ms ⇒ swallowed', [CS, C('a'), C('Process', { code: 'Enter' }), CE, W(10), K('Enter')], ['ime', 'ime-swallow']],
  ['an Escape that cancels, or a click that ends the composition, Enter +10 ms ⇒ swallowed', [CS, C('a'), C('Escape'), CE, W(10), K('Enter'), CS, C('b'), CE, W(10), K('Enter')], ['ime-swallow', 'ime-swallow']],
  ['Shift+Enter inside the window stays a plain newline (no hint)', [CS, C('a'), CE, W(10), K('Enter', { shiftKey: true })], ['newline']],
  ['a new composition clears an armed window (compositionstart); its own end re-arms', [CS, C('a'), CE, W(1), CS, W(700), C('Enter'), CE, W(700), K('Enter')], ['ime', 'send']],
  ['an Enter long after any composition ⇒ send (today\'s default)', [K('a'), W(5000), K('Enter')], ['send']],
];
async function table(M, label = '') {
  const res = ROWS.map(([n, seq, want]) => { const got = play(M, seq); return { n, ok: JSON.stringify(got) === JSON.stringify(want), got, want }; });
  const off = { enterSends: false };
  res.push({ n: 'chat.enterSends off: Enter ⇒ newline, Shift+Enter ⇒ newline, Cmd+Enter ⇒ send, Ctrl+Enter ⇒ send', got: play(M, [K('Enter'), K('Enter', { shiftKey: true }), K('Enter', { metaKey: true }), K('Enter', { ctrlKey: true })], off), want: ['newline', 'newline', 'send', 'send'] });
  res.push({ n: 'touch keeps chat.touchEnterSends: off ⇒ Enter is a newline even with chat.enterSends on', got: play(M, [K('Enter')], { touch: true, touchEnterSends: false }), want: ['newline'] });
  res.push({ n: '…on ⇒ Enter sends even with chat.enterSends off (the desktop setting does not reach touch)', got: play(M, [K('Enter')], { touch: true, touchEnterSends: true, enterSends: false }), want: ['send'] });
  res.push({ n: 'the expanded composer: Enter ⇒ newline, Ctrl+Enter ⇒ send', got: play(M, [K('Enter'), K('Enter', { ctrlKey: true })], { expanded: true }), want: ['newline', 'send'] });
  for (const r of res.slice(ROWS.length)) r.ok = JSON.stringify(r.got) === JSON.stringify(r.want);
  return res;
}

const M = await import(pathToFileURL(SRC).href);
console.log('§1 the table (PURE EnterGuard, fake clock)');
for (const r of await table(M)) ok(r.n, r.ok, { got: r.got, want: r.want });
ok('the window is the commit\'s event burst, 50 ms, and the hint lives 2 s', M.IME_COMMIT_BURST_MS === 50 && M.IME_HINT_MS === 2000);

console.log('§2 the recorder\'s key words');
const kw = (e) => M.actionKeyWords({ shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...e });
ok('a Shift tap the IME owned ⇒ { key: "S-Shift", c: 1 }', JSON.stringify(kw({ key: 'Shift', shiftKey: true, isComposing: true, keyCode: 229 })) === '{"key":"S-Shift","c":1}', kw({ key: 'Shift', shiftKey: true, isComposing: true }));
ok('a composing Enter ⇒ { key: "Enter", c: 1 }; a plain Enter ⇒ { key: "Enter" } (no c)', JSON.stringify(kw({ key: 'Enter', isComposing: true })) === '{"key":"Enter","c":1}' && JSON.stringify(kw({ key: 'Enter', keyCode: 13 })) === '{"key":"Enter"}');
ok('Shift+Enter ⇒ "S-Enter"; Ctrl+Alt+Shift+Enter ⇒ "C-A-S-Enter" (the C-/M-/A- order kept, S- last)', kw({ key: 'Enter', shiftKey: true }).key === 'S-Enter' && kw({ key: 'Enter', ctrlKey: true, altKey: true, shiftKey: true }).key === 'C-A-S-Enter');
ok('keyCode 229 alone (Safari) also marks c:1', kw({ key: 'Enter', keyCode: 229 }).c === 1);
ok('a plain character (even shifted) is null — the "typing" marker, never the text', kw({ key: 'a' }) === null && kw({ key: 'A', shiftKey: true }) === null);
ok('k:"ime" markers on a textarea: start / end (no data ⇒ no how), no text field', JSON.stringify(M.imeMarker('compositionstart', { tagName: 'TEXTAREA' })) === '{"k":"ime","ph":"start"}' && JSON.stringify(M.imeMarker('compositionend', { tagName: 'TEXTAREA' })) === '{"k":"ime","ph":"end"}');
ok('…and none for an input / another event', M.imeMarker('compositionend', { tagName: 'INPUT' }) === null && M.imeMarker('compositionupdate', { tagName: 'TEXTAREA' }) === null);

const mk = (d) => JSON.stringify(M.imeMarker('compositionend', { tagName: 'TEXTAREA' }, d));
ok('an end with data "hello" ⇒ how "commit"; with "" ⇒ how "cancel" — and never the text', mk('hello') === '{"k":"ime","ph":"end","how":"commit"}' && mk('') === '{"k":"ime","ph":"end","how":"cancel"}' && !mk('hello').includes('hello'), [mk('hello'), mk('')]);
console.log('§3 the send-mode hint, the setting');
const { composerSendModes } = await import(pathToFileURL(path.join(REPO, 'src/lib/agent-meta.js')).href);
const q = { queue: true, steer: true, queueOps: true };
ok('default (chat.enterSends on): today\'s modes — a claude-like harness draws no hint', composerSendModes({ queue: true }).showHint === false && composerSendModes(q).sendSegment === false);
ok('chat.enterSends off on a harness with no queue line: the hint is drawn with a SEND segment', (() => { const m = composerSendModes({ queue: true }, { enterSends: false }); return m.showHint && m.sendSegment && m.enterSends === false; })());
ok('chat.enterSends off on a queueing harness: the queue segment names the key (no duplicate send segment)', (() => { const m = composerSendModes(q, { enterSends: false }); return m.showHint && m.queueSegment && !m.sendSegment && m.enterSends === false; })());
ok('sendKeyName: Enter by default, Ctrl+Enter / ⌘+Enter when off', M.sendKeyName(true, false) === 'Enter' && M.sendKeyName(false, false) === 'Ctrl+Enter' && M.sendKeyName(false, true) === '⌘+Enter');
const ci = read('src/lib/chat-input.js');
ok('sendHintHtml draws "{key} sends" / "{key} queues" when off, and keeps "Enter queues" by default', /modes\.sendSegment\) parts\.push\([^\n]*t\('\{key\} sends', \{ key \}\)/.test(ci) && /modes\.enterSends === false \? t\('\{key\} queues', \{ key \}\) : t\('Enter queues'\)/.test(ci));
const schema = read('src/lib/settings-schema.js');
const row = (schema.match(/'chat\.enterSends': \{[\s\S]*?\n  \},/) || [''])[0];
ok('schema row chat.enterSends: boolean, default true, category Chat, live', /type: 'boolean', default: true/.test(row) && /category: t\('Chat'\), liveApply: true/.test(row));
const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
for (const k of ['Enter sends the message', 'Input method just ended — press Enter again to send', '{key} sends', '{key} queues']) ok(`zh + ja carry "${k}"`, zh.includes(JSON.stringify(k) + ':') && ja.includes(JSON.stringify(k) + ':'));
ok('zh hint words are the brief\'s ("输入法刚结束 — 再按一次 Enter 发送")', zh.includes('"输入法刚结束 — 再按一次 Enter 发送"'));
ok('docs/settings.md lists chat.enterSends (gen-settings-reference)', read('docs/settings.md').includes('| `chat.enterSends` | boolean | `true` |'));

console.log('§4 wiring census');
const kdBody = ci.slice(ci.indexOf("this._textarea.addEventListener('keydown', (e) => {"));
ok('the keydown handler no longer feeds the guard (r2: the key that ended a composition no longer matters)', !ci.includes('_enterGuard.keydown('));
ok('…the IME return, then the Enter decision through the guard (send ⇒ preventDefault + _send; ime-swallow ⇒ preventDefault + the hint)', kdBody.indexOf('if (imeOwnsKey(e)) return;') > 0 && kdBody.indexOf('if (imeOwnsKey(e)) return;') < kdBody.indexOf('this._enterGuard.enter(e,') && /if \(act === 'send'\) \{ e\.preventDefault\(\); this\._send\(\); \}\n\s+else if \(act === 'ime-swallow'\) \{ e\.preventDefault\(\); this\._showImeHint\(\); \}/.test(kdBody));
ok('compositionstart / compositionend on the textarea feed the guard', ci.includes("this._textarea.addEventListener('compositionstart', () => this._enterGuard.compositionstart());") && ci.includes("this._textarea.addEventListener('compositionend', () => this._enterGuard.compositionend());"));
ok('the ime line is a role=status node under the composer, hidden by IME_HINT_MS', /this\._imeHint\.setAttribute\('role', 'status'\)/.test(ci) && /this\._sendHint, this\._imeHint\);/.test(ci) && /setTimeout\(\(\) => \{ this\._imeHint\.hidden = true; \}, IME_HINT_MS\)/.test(ci));
ok('chat-view hands chat.enterSends to the composer (default on)', read('src/lib/chat-view.js').includes("getEnterSends: () => this.app?.settings?.get('chat.enterSends') !== false,"));
const rec = read('src/lib/incident-recorder.js');
ok('the recorder writes actionKeyWords + imeMarker into the action ring', /const w = actionKeyWords\(e\);/.test(rec) && /k: 'key', \.\.\.w, el:/.test(rec) && /const m = imeMarker\(type, e\.target, e\.data\);/.test(rec) && /'compositionstart', 'compositionend'/.test(rec));

console.log('§5 patched-copy controls');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-cei-'));
const src = fs.readFileSync(SRC, 'utf8');
const MUT = [
  ['the guard removed (no window) ⇒ the owner\'s sequence SENDS', [/ && \(ctx\.now - ctx\.imeEndedAt\) < windowMs\) return 'ime-swallow';/, ' && false) return \'ime-swallow\';'], 0],
  ['r1\'s exemption restored (an Enter-ended composition arms nothing) ⇒ the owner\'s sequence SENDS', [/compositionend\(\) \{ this\._imeEndedAt = this\._now\(\); \}/, "keydown(e) { this._lastKeyEnter = e.key === 'Enter' || e.code === 'Enter'; if (this._lastKeyEnter && imeOwnsKey(e)) this._imeEndedAt = 0; }\n  compositionend() { this._imeEndedAt = this._lastKeyEnter ? 0 : this._now(); }"], 0],
  ['…the same restored exemption ⇒ the ring\'s shape SENDS too', [/compositionend\(\) \{ this\._imeEndedAt = this\._now\(\); \}/, "keydown(e) { this._lastKeyEnter = e.key === 'Enter' || e.code === 'Enter'; if (this._lastKeyEnter && imeOwnsKey(e)) this._imeEndedAt = 0; }\n  compositionend() { this._imeEndedAt = this._lastKeyEnter ? 0 : this._now(); }"], 9],
  ['the guard not consumed ⇒ the Enter after the hint is swallowed again', [/if \(a === 'ime-swallow' \|\| a === 'send'\) this\._imeEndedAt = 0;/, ''], 2],
  ['modifiers not exempt ⇒ Cmd+Enter inside the window no longer sends', [/if \(!mod && !e\.altKey && ctx\.imeEndedAt/, 'if (ctx.imeEndedAt'], 7],
  ['r1\'s 600 ms back ⇒ the everyday Space → Enter send at 120 ms is swallowed', [/export const IME_COMMIT_BURST_MS = 50;/, 'export const IME_COMMIT_BURST_MS = 600;'], 6],
];
for (const [n, [re, to], rowIdx] of MUT) {
  ok(`control: the mutation site exists (${n.split(' ⇒')[0]})`, re.test(src));
  const f = path.join(tmp, `m${MUT.findIndex((m) => m[0] === n)}.mjs`);
  fs.writeFileSync(f, src.replace(re, to));
  const r = (await table(await import(pathToFileURL(f).href)))[rowIdx];
  ok('control: ' + n, r && !r.ok, r && r.got);
}
const sR = fs.readFileSync(path.join(REPO, 'src/lib/chat-enter-keys.js'), 'utf8');
const noS = path.join(tmp, 'nos.mjs'); fs.writeFileSync(noS, sR.replace("(e.shiftKey ? 'S-' : '') + ", ''));
ok('control: the S- prefix removed ⇒ the Shift tap reads as a bare "Shift"', (await import(pathToFileURL(noS).href)).actionKeyWords({ key: 'Shift', shiftKey: true, isComposing: true }).key === 'Shift');
fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
