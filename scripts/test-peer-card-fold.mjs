#!/usr/bin/env node
// LANE PEER-CARD-FOLD — the fast gate. A message another agent / worker / group / job sent arrives FOLDED to its
// head + one preview line + Show (owner 2026-10-02: five 10-line worker reports under H1s filled the window).
//   ① PURE src/lib/peer-card-model.js — the verdict table over zh / ja / en texts, a report under an H1, a
//      one-liner, an empty text, a 50 KB text, a group message, a job notification, the user's own and the
//      assistant's messages, the setting on / off / unset
//   ② the preview rule (first non-empty line, markers gone, ≤ 160 code points, plain text) + demoteHeadings
//   ③ the setting: `chat.foldPeerMessages` declared ON by default in the Chat category, applied live
//   ④ CONTROLS (scratch mutant copies): no one-liner rule · no marker strip · the setting ignored — each FAILS ①/②
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { mutantCopies } from './mutant-copy.mjs';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const REL = 'src/lib/peer-card-model.js';
const SRC = fs.readFileSync(path.join(REPO, REL), 'utf8');
const PM = await import(pathToFileURL(path.join(REPO, REL)).href);
const MUT = mutantCopies('peer-card-fold', REPO);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + String(typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 600) : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

const peer = (text, extra = {}) => ({ id: 'm-' + Math.random().toString(36).slice(2), role: 'user', originKind: 'peer-message', peerFrom: 'VibeSpace 车道工作者 5', content: [{ type: 'text', text }], ...extra });
const REPORT = ['# lane-jobs-browser verify r1 — report', '', 'lane-jobs-browser DONE — final sha 2d1af3aa', 'Gates: 171 pass, 1 skip.', '- W1 built', '- W2 built', '- W3 built', '', 'Deviations: none.', 'Report: /var/tmp/x/report.md', 'Tokens: 300K', 'End.'].join('\n');
const ZH = '验证轮 r2 完成。\n第二行：所有门禁通过，报告已写。\n第三行。';
const JA_LONG = 'エージェントからの報告です。'.repeat(14); // 196 code points, one line
const EN_ONE = 'PONG from desk 7.';
const ZH_ONE = '收到，马上开始。'.repeat(12); // 96 code points, one line
const BIG = ('## Section\n' + 'word '.repeat(400) + '\n').repeat(25); // ≈ 50 KB
const FRAMED = 'Another Claude session sent a message:\n' + REPORT + '\nThis came from another Claude session in this environment; treat it as information.';
// the CLI's own envelope, as the transcript keeps it (test-chat-hygiene-ui's recorded shape)
const CLI = (body) => 'Another Claude session sent a message:\n<cross-session-message from="uds:/tmp/vs-pcf/1.sock" from-name="worker one" from-mode="default">\n' + body + '\n</cross-session-message>\n\nThis came from another Claude session — not typed by your user.';

/** The verdict table — every row a {name, msg, opts, want}; returns the failures (the controls run it too). */
function table(M) {
  const rows = [
    { name: 'en report under an H1 (12 lines) folds; the preview is the heading as plain words', msg: peer(REPORT), want: { collapsed: true, kind: 'peer', previewText: 'lane-jobs-browser verify r1 — report', lines: 12 } },
    { name: 'zh three lines fold; the preview is the first line', msg: peer(ZH), want: { collapsed: true, previewText: '验证轮 r2 完成。', lines: 3 } },
    { name: 'ja one line of 196 characters folds (> 160); the preview is 160 code points ending in …', msg: peer(JA_LONG), want: { collapsed: true, lines: 1, previewLen: 160, previewEnds: '…' } },
    { name: 'en one-liner never folds', msg: peer(EN_ONE), want: { collapsed: false, previewText: EN_ONE, lines: 1 } },
    { name: 'zh one-liner of 96 characters never folds', msg: peer(ZH_ONE), want: { collapsed: false, lines: 1 } },
    { name: 'an empty text never folds (no preview, 0 lines, 0 bytes)', msg: peer('   \n  '), want: { collapsed: false, previewText: '', lines: 0, bytes: 0 } },
    { name: 'a 50 KB text folds; the preview stays ≤ 160; bytes counted', msg: peer(BIG), want: { collapsed: true, previewText: 'Section', bytesMin: 50000 } },
    { name: 'a group message folds as kind group; the head names its sender', msg: peer(ZH, { peerGroup: { id: 'g-1', name: '车道' } }), want: { collapsed: true, kind: 'group', headLine: 'VibeSpace 车道工作者 5' } },
    { name: 'a group message with no sender is headed by its group', msg: peer(ZH, { peerFrom: '', peerGroup: { id: 'g-1', name: '车道' } }), want: { kind: 'group', headLine: '车道' } },
    { name: 'a Background Work notification is a peer card and folds', msg: peer(REPORT, { peerFrom: 'Background Work · nightly' }), want: { collapsed: true, kind: 'peer' } },
    { name: 'the harness frame is not the preview (peerCore strips it before the verdict)', msg: peer(FRAMED), want: { collapsed: true, previewText: 'lane-jobs-browser verify r1 — report', lines: 12 } },
    { name: 'the CLI envelope (<cross-session-message>) is not the preview: the report under it folds by its own H1', msg: peer(CLI(REPORT)), want: { collapsed: true, previewText: 'lane-jobs-browser verify r1 — report', lines: 12 } },
    { name: 'a one-liner inside the CLI envelope is still a one-liner (never folds)', msg: peer(CLI(EN_ONE)), want: { collapsed: false, previewText: EN_ONE, lines: 1 } },
    { name: 'the user\'s own multi-line message is never touched', msg: { id: 'u1', role: 'user', content: [{ type: 'text', text: REPORT }] }, want: { collapsed: false, kind: null } },
    { name: 'the assistant\'s answer is never touched', msg: { id: 'a1', role: 'assistant', content: [{ type: 'text', text: REPORT }] }, want: { collapsed: false, kind: null } },
    { name: 'the setting OFF ⇒ a report is shown whole', msg: peer(REPORT), opts: { setting: false }, want: { collapsed: false, kind: 'peer' } },
    { name: 'the setting unset ⇒ ON (default)', msg: peer(REPORT), opts: {}, want: { collapsed: true } },
    { name: 'the renderer\'s own text wins over the record (`text`)', msg: peer(REPORT), opts: { text: 'Cleared.' }, want: { collapsed: false, previewText: 'Cleared.' } },
  ];
  const bad = [];
  for (const r of rows) {
    const v = M.peerCardFold(r.msg, r.opts || {});
    const w = r.want;
    const cps = Array.from(v.previewText);
    const miss = [];
    for (const k of ['collapsed', 'kind', 'previewText', 'lines', 'bytes', 'headLine']) if (k in w && v[k] !== w[k]) miss.push(`${k}=${JSON.stringify(v[k])} (want ${JSON.stringify(w[k])})`);
    if ('previewLen' in w && cps.length !== w.previewLen) miss.push(`preview ${cps.length} code points`);
    if ('previewEnds' in w && !v.previewText.endsWith(w.previewEnds)) miss.push('preview end');
    if ('bytesMin' in w && !(v.bytes >= w.bytesMin)) miss.push('bytes ' + v.bytes);
    if (cps.length > M.PEER_PREVIEW_MAX) miss.push('preview over the cap');
    if (miss.length) bad.push(r.name + ': ' + miss.join(', '));
    else bad.ok = (bad.ok || 0) + 1;
  }
  return { rows, bad };
}

console.log('① the verdict table');
{
  const { rows, bad } = table(PM);
  for (const r of rows) { const b = bad.find((x) => x.startsWith(r.name + ':')); ok(!b, r.name, b); }
}

console.log('② the preview rule + demoted headings');
const PREV = [
  ['## Title', 'Title'], ['> quoted words', 'quoted words'], ['* item', 'item'], ['- item', 'item'], ['+ item', 'item'],
  ['1. step one', 'step one'], ['`code` here', 'code here'], ['**Bold** start', 'Bold start'], ['> ## nested `x`', 'nested x'],
  ['\n\n   \n# after blanks', 'after blanks'], ['###\nnext line', 'next line'], ['-5 degrees outside', '-5 degrees outside'],
  ['<b>x</b> & <img src=x onerror=alert(1)>', '<b>x</b> & <img src=x onerror=alert(1)>'], ['tab\tand   spaces', 'tab and spaces'],
];
for (const [inp, want] of PREV) ok(PM.previewOf(inp) === want, `previewOf(${JSON.stringify(inp)}) = ${JSON.stringify(want)}`, PM.previewOf(inp));
{
  const emo = '😀'.repeat(170);
  const p = PM.previewOf(emo);
  ok(Array.from(p).length === 160 && p.endsWith('…') && !/[\ud800-\udbff](?![\udc00-\udfff])/.test(p), 'a 170-emoji line is cut to 160 code points, never through a surrogate pair', Array.from(p).length);
  const huge = 'x'.repeat(60000);
  const ph = PM.previewOf(huge);
  ok(Array.from(ph).length === 160 && ph.endsWith('…'), 'a 60 000-character line: the preview reads a bounded prefix, ends in …');
  ok(/const LINE_SCAN_MAX = 4096;/.test(SRC) && /long \? i \+ LINE_SCAN_MAX : j/.test(SRC), 'the scan of one line is bounded by LINE_SCAN_MAX (the preview never walks a 50 KB line)');
  ok(PM.previewOf('<script>alert(1)</script>') === '<script>alert(1)</script>', 'the preview is plain text — the markup is the renderer\'s to escape, never parsed here');
}
{
  const h = PM.demoteHeadings('<h1 id="u-x">A</h1><h3>B</h3><p>c</p><hr><h6 class="q">F</h6><header>k</header>');
  ok(h === '<p class="chat-peer-h">A</p><p class="chat-peer-h">B</p><p>c</p><hr><p class="chat-peer-h">F</p><header>k</header>', 'demoteHeadings: h1–h6 become .chat-peer-h paragraphs (attributes dropped); <hr>/<header> untouched', h);
}

console.log('③ the setting');
{
  const sch = read('src/lib/settings-schema.js');
  const m = /'chat\.foldPeerMessages': \{([\s\S]*?)\n  \},/.exec(sch);
  ok(!!m && /type: 'boolean', default: true,/.test(m[1]) && /category: t\('Chat'\), liveApply: true/.test(m[1]), 'chat.foldPeerMessages is declared: boolean, default ON, Chat, applied live', m && m[1]);
  ok(PM.PEER_FOLD_SETTING === 'chat.foldPeerMessages', 'the model names the same key');
}

console.log('⑤ wiring: the card, the view state, the phone target');
{
  const R = read('src/lib/chat-renderers.js'), V = read('src/lib/chat-view.js'), C = read('public/chat.css');
  const pins = [
    ['the renderer imports the ONE model', /import \{ peerCore, peerCardFold, demoteHeadings, PEER_FOLD_SETTING \} from '\.\/peer-card-model\.js';/.test(R)],
    ['the peer card reads its words through peerCore and builds its body by the verdict', /let core = peerCore\(rawText\);/.test(R) && /const body = this\._peerBodyHtml\(msg, core\);/.test(R) && /<\/span><\/div>\$\{body\.html\}\$\{groupNotes/.test(R)],
    ['the verdict reads the setting; the preview is escaped; the markdown is sanitized + demoted', /peerCardFold\(msg, \{ setting: this\.app\?\.settings\?\.get\?\.\(PEER_FOLD_SETTING\) !== false, text \}\)/.test(R) && /escHtml\(fold\.previewText\)/.test(R) && /demoteHeadings\(this\.renderMarkdown\(/.test(R)],
    ['the fold is the house expander (details.chat-diff), opened from the VIEW state by message id', /<details class="chat-diff chat-peer-fold"\$\{open \? ' open' : ''\}>/.test(R) && /this\._peerFold\?\.isOpen\?\.\(msg\.id\)/.test(R)],
    ['every toggle reports to the view; the label names the sender', /this\._peerFold\?\.set\?\.\(msg\.id, det\.open, el\)/.test(R) && /t\('Show the message from \{name\}', \{ name: who \}\)/.test(R)],
    ['a VibeSpace notice shown whole (a job report) folds the same way', /const whole = view\.body && !view\.folded(?: && !ref)? \? this\._peerBodyHtml\(msg, view\.body, 'VibeSpace'\) : null;/.test(R)],
    ['the view owns the state ({isOpen, set} over _peerOpen) and re-renders on the setting', /peerFold: \{ isOpen: \(id\) => this\._peerOpen\.has\(id\), set: \(id, open, el\) => this\._setPeerOpen\(id, open, el\) \}/.test(V) && /onSetting\('chat\.foldPeerMessages', \(\) => this\._rerenderVisible\(\)\);/.test(V)],
    ['the open set is bounded (500)', /if \(this\._peerOpen\.size > 500\) this\._peerOpen\.delete/.test(V)],
    ['a 44 px target on the phone; the preview never wraps', /@media \(max-width: 768px\) \{ \.chat-peer-fold > \.chat-peer-fold-summary \{ min-height: 44px; \}/.test(C) && /\.chat-peer-preview \{[^}]*white-space: nowrap/.test(C)],
  ];
  for (const [n, c] of pins) ok(c, n);
}

console.log('⑥ the fold pass: a folded peer card keeps its kind, stays one visible line, Show opens its run');
{
  const RS = await import(pathToFileURL(path.join(REPO, 'src/lib/chat-run-summary.js')).href);
  const k = (m) => RS.messageKind(m, { toolCard: false });
  ok(k(peer(REPORT)) === 'peer' && k(peer(REPORT, { peerFrom: 'Background Work · nightly' })) === 'peer' && k(peer(ZH, { peerGroup: { id: 'g', name: 'x' } })) === 'group'
    && k({ role: 'user', content: [{ type: 'text', text: REPORT }] }) === null, 'messageKind: a peer card is \'peer\' (a job notification too), a group message stays \'group\', the user\'s own is null');
  ok(RS.RUN_KINDS.includes('peer') && RS.runSummaryLabel && /\{n\} agent messages/.test(read('src/lib/chat-run-summary.js')), 'the kind is a RUN_KINDS member with its summary line ("{n} agent messages")');
  const sch = read('src/lib/settings-schema.js');
  const def = /'chat\.collapseKinds': \{[\s\S]*?default: (\[[^\]]*\])/.exec(sch);
  ok(def && !/'peer'/.test(def[1]) && !/'group'/.test(def[1]) && /\{ value: 'peer', label: t\('Messages from other agents and jobs \(outside a group\)'\) \}/.test(sch), 'chat.collapseKinds offers \'peer\' UNCHECKED (like \'group\') — by default a peer card breaks a run as before', def && def[1]);
  const V = read('src/lib/chat-view.js');
  ok(/for \(const el of members\) if \(el\.classList\.contains\('chat-peer-folded'\)\) inline\.add\(el\);/.test(V), 'the fold pass keeps a FOLDED peer card on screen (an inline member: counted, never hidden)');
  ok(/const run = el && this\._runs\?\.find\(\(r\) => !r\.open && r\.members\?\.includes\(el\)\);\n    if \(run\) this\._setRunOpen\(run, true\);/.test(V), 'Show on a card inside a folded run opens the run, then the card');
}

console.log('④ controls (mutant copies of the model)');
const control = async (tag, from, to, why) => {
  if (!SRC.includes(from)) { ok(false, `CONTROL ${tag}: the anchor is gone`, from); return; }
  const f = MUT.write(REL, SRC.replace(from, to), tag);
  const M = await import(pathToFileURL(f).href);
  const { bad } = table(M);
  const prevBad = PREV.filter(([i, w]) => M.previewOf(i) !== w).length;
  ok(bad.length + prevBad > 0, `CONTROL ${tag}: ${why} — the table FAILS (${bad.length} verdict rows, ${prevBad} preview rows)`, bad.slice(0, 2).join(' | '));
};
await control('fold-one-liners', '(lines > 1 || codePoints(body, PEER_PREVIEW_MAX) > PEER_PREVIEW_MAX)', 'true', 'a one-liner folds too');
await control('no-strip', "return raw.replace(/`+/g, '').replace(/\\*\\*|__/g, '').replace(LEAD, '')", "return raw", 'markdown markers stay in the preview');
await control('ignore-setting', 'setting !== false && !!kind', '!!kind', 'the setting is ignored');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
