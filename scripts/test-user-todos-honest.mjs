#!/usr/bin/env node
// test-user-todos-honest — THE FOR-YOU SURFACE TELLS THE TRUTH AND ANSWERS IN ONE PLACE (lane foryou-honest, 2026-10-25 —
// the inline-answers stress evaluation: 21 agent questions open, every badge said «Nothing waiting on you», the Duo's list
// column spent five screens on chips that were not the options, the For-you window showed `__tests__/` as a bold «tests/»;
// the owner chose B — the list column MARKS, the For-you tray / window answers). PURE + in-process, over the stress fixture
// scripts/fixtures/foryou-stress-asks.json (21 questions, four conversations, six on payments, options=null on all):
//   ① optionsOf — every detail shape of the fixture (the 8-option one, «是 / 否», «A / B / C», the long labels, the empty
//     detail) + the bounds (≤ 10 options, ≤ 120 chars, distinct) + prose / path controls (never a guessed chip)  [P2-3]
//     + ONLY A CHOICE draws chips (acceptance round 2, 主开发 2026-10-25): a numbered PLAN, a one-line sentence ⇒ none;
//     lettered A/B, numbered with a choice cue ⇒ chips; RED CONTROL = a copy with the first commit's rule (the plan chips)
//     + round 3: a QUESTION pointing at the list counts; an option's own «— safe» stays its own on the last item; RED CONTROLS
//     = a copy with the round-2 cut (any dash in the last item) and one with the detail-only cue
//     + round 4: the same words-after-the-list rule on the short and the lettered forms; a ONE-LINE lettered list
//     («A) 北京 B) 上海»); RED CONTROLS = copies with each of the third commit's shapes put back
//   ② askOptions — the agent's explicit options win; a producer's item, a notice, a cleared one parse nothing      [P2-3]
//   ③ openCount + badgeWords — the honest count: 21 band-5 asks ⇒ 21, the words never say «Nothing waiting on you» with one
//     open; inboxBadgeFor / tabCounts say the same number; RED CONTROL = the base's rule (the badge = bands 1–4)   [P1-1]
//   ④ sessionMark + firstLine — a row's «needs you · 6 · <the newest question's first line>»                         [P2-4]
//   ⑤ ONE RENDERER — the tray row and the For-you pane draw an item's words through wordsHtml: `__tests__/` verbatim;
//     RED CONTROL = the base pane's markdown (marked) ⇒ <strong>tests</strong>; a census over both doors          [P1-2]
//   ⑥ the wiring — every door counts through openCount; the marker replaced the inline rows; ✓ / ✕ toast an Undo; the
//     tray head's ⤢ keeps the tray's scope; a tray row's body tap opens it in place; the Duo's bar has For you  [P1-1 P2-4 P3-2 P3-7 P3-8]
//     + the touch scale (one block, 16 px fields), ONE row shape on a phone (the folded row, its door, one open at a time) and
//     the phone's first screen's doors (a reload keeps the window; the badge and the drawer's first row open the page)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m, e) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (e !== undefined ? ' — ' + JSON.stringify(e).slice(0, 700) : '')); } };
const J = JSON.stringify;
const t = (k, p) => (p ? k.replace(/\{(\w+)\}/g, (m, x) => (p[x] !== undefined ? String(p[x]) : m)) : k);

const FIX = JSON.parse(read('scripts/fixtures/foryou-stress-asks.json'));
const NOW = Date.UTC(2026, 9, 25, 21);
let seq = 0;
const ITEMS = Object.entries(FIX.conversations).flatMap(([conv, asks]) => asks.map(([text, detail]) => ({
  id: 'ut-fx' + String(++seq).padStart(2, '0'), sessionKey: 'claude:' + conv, text, detail: detail || null, kind: 'action', by: 'agent', origin: 'agent',
  urgency: 'normal', status: 'open', options: null, createdAt: NOW - (100 - seq) * 60e3,
})));
const O = require(path.join(ROOT, 'src/ask-options.js'));
const L = await import(pathToFileURL(path.join(ROOT, 'src/lib/user-todos-layout.js')).href);

console.log('① optionsOf — the detail shapes of the stress fixture, bounded (P2-3)');
{
  const WANT = {
    '选项很多：A 三处都改；B 只改退款；C 先不改；D 改但不加日志；E 改并加日志；F 幂等键也改；G 全部交给我判断；H 先开会讨论': ['A 三处都改', 'B 只改退款', 'C 先不改', 'D 改但不加日志', 'E 改并加日志', 'F 幂等键也改', 'G 全部交给我判断', 'H 先开会讨论'],
    'A 改（推荐）；B 不改': ['A 改（推荐）', 'B 不改'],
    '是 / 否': ['是', '否'],
    'A test/（现有）；B __tests__/': ['A test/（现有）', 'B __tests__/'],
    'A / B / C': ['A', 'B', 'C'],
    'A v2；B v3；C 两版都给；D 合并成 v4': ['A v2', 'B v3', 'C 两版都给', 'D 合并成 v4'],
    'A 万元；B 元；C 两者并列': ['A 万元', 'B 元', 'C 两者并列'],
    'A 提交日；B 截止日': ['A 提交日', 'B 截止日'],
    'A 全称；B 简称': ['A 全称', 'B 简称'],
    'A 改 10%；B 保持 20%；C 问法务': ['A 改 10%', 'B 保持 20%', 'C 问法务'],
    'A 北京；B 上海': ['A 北京', 'B 上海'],
    'A 今天；B 下周一': ['A 今天', 'B 下周一'],
    'A 7 天；B 30 天；C 90 天；D 永久': ['A 7 天', 'B 30 天', 'C 90 天', 'D 永久'],
    'A UTC；B 本地': ['A UTC', 'B 本地'],
    'A 这是选项 A 的很长说明文字；B 选项 B 也同样长的说明；C 更长更长更长更长更长更长更长更长': ['A 这是选项 A 的很长说明文字', 'B 选项 B 也同样长的说明', 'C 更长更长更长更长更长更长更长更长'],
  };
  WANT['A / B / C'] = []; // «第六个问题（短）»: no question mark in the question or the detail — the short form is no choice (round 2's rule d)
  const seen = new Set();
  for (const i of ITEMS) {
    const d = i.detail || '';
    if (seen.has(d)) continue; seen.add(d);
    if (!d) { ok(J(O.optionsOf(d, i.text)) === '[]', 'the empty detail (the «几乎没有内容» question) ⇒ no options, no chip'); continue; }
    ok(d in WANT && J(O.optionsOf(d, i.text)) === J(WANT[d]), `${J(d.slice(0, 40))}${d.length > 40 ? '…' : ''} ⇒ ${WANT[d] ? WANT[d].length : '?'} options`, O.optionsOf(d, i.text));
  }
  ok(ITEMS.filter((i) => O.optionsOf(i.detail || '', i.text).length).length === 19, 'every fixture question parses but the empty one and the question-mark-less «A / B / C» (19 of 21) — the base drew a chip for none', ITEMS.map((i) => O.optionsOf(i.detail || '', i.text).length));
  const eight = ITEMS.find((i) => i.text.length > 200);
  ok(!!eight && eight.text.length >= 240 && O.optionsOf(eight.detail).length === 8 && O.optionsOf(eight.detail).every((l) => l.length <= O.LABEL_MAX), `the ${eight && eight.text.length}-char question with eight options ⇒ 8 chips, each its own words`);
  const longLbl = 'A ' + '很'.repeat(200) + '；B 短';
  ok(J(O.optionsOf(longLbl)) === '[]' && O.LABEL_MAX === 120, 'a 200-char label ⇒ NO parse (bounded: a label ≤ 120 chars — the 200-char one stays prose in the detail)');
  ok(J(O.optionsOf('A 很'.repeat(1) + '；B ' + 'x'.repeat(118))) !== '[]', '…a label right at the bound still parses (≤ 120)');
  const eleven = Array.from({ length: 11 }, (_, k) => String.fromCharCode(65 + k) + ' 选项' + k).join('；');
  ok(J(O.optionsOf(eleven)) === '[]' && O.OPTIONS_MAX === 10 && O.optionsOf(eleven.split('；').slice(0, 10).join('；')).length === 10, 'eleven lettered options ⇒ NO parse; ten ⇒ 10 (OPTIONS_MAX)');
  const NOT = [['prose with a slash in a path', 'I moved src/lib/foo.js to src/lib/bar.js'], ['a bare path', 'test/__tests__'], ['a sentence', 'I changed the retry. A or B?'],
    ['letters out of order', 'A 改；C 不改'], ['one option', 'A 只有一个'], ['duplicates', 'A / A'], ['a slash sentence', 'yes/no, but tell me why'], ['unspaced words', 'and/or']];
  for (const [l, d] of NOT) ok(J(O.optionsOf(d)) === '[]', `${l} ⇒ no parse (prose stays prose)`, O.optionsOf(d));
  ok(J(O.optionsOf('Pick one:\nA keep it\nB drop it')) === J(['A keep it', 'B drop it']) && J(O.optionsOf('Which one?\n1. keep\n2. drop')) === J(['1. keep', '2. drop']) && J(O.optionsOf('yes | no', 'Keep it?')) === J(['yes', 'no']) && J(O.optionsOf('是/否', '要吗？')) === J(['是', '否']),
    'the same shapes in English: a lead-in line + A/B lines, a numbered list under «Which one?», «yes | no» under a question, unspaced «是/否»');
  // ONLY A CHOICE DRAWS CHIPS (acceptance round 2, 主开发 2026-10-25 — the adversarial review: a numbered PLAN in an ask's
  // detail became reply chips on every For-you surface and a tap posted a fragment of the plan as the person's reply)
  const [planQ, planD] = FIX.plan;
  const planAsk = { ...ITEMS[0], id: 'ut-fx-plan', text: planQ, detail: planD };
  ok(/^1\. .+\n2\. .+\n3\. .+$/.test(planD) && J(O.askOptions(planAsk)) === '[]', 'an agent\'s three-step PLAN («1. … 2. … 3. …», a plain vibespace-ask, no explicit options) ⇒ 0 chips — the person types', O.askOptions(planAsk));
  ok(J(O.optionsOf('计划：1. 备份数据库 2. 跑迁移 3. 验证')) === '[]' && J(O.optionsOf('1 北京；2 上海', '哪个？')) === '[]', '…on one line too, and bare numbers are never letters (no choice cue around them ⇒ prose)');
  ok(J(O.askOptions({ ...planAsk, text: '我已经开始处理日志', detail: '把 ingest 的日志按天切分 / 保留 30 天' })) === '[]', '«把 ingest 的日志按天切分 / 保留 30 天» as a SENTENCE (no question mark in the question or the detail) ⇒ 0 chips');
  ok(J(O.askOptions({ ...planAsk, text: '签署日期写哪一天？', detail: 'A 今天；B 下周一' })) === J(['A 今天', 'B 下周一']), '«A 今天；B 下周一» (lettered) ⇒ 2 chips');
  ok(J(O.askOptions({ ...planAsk, text: '管辖法院', detail: '1. 北京 2. 上海 — 选哪个？' })) === J(['1. 北京', '2. 上海']), '«1. 北京 2. 上海 — 选哪个？» (numbered, a choice cue after them) ⇒ 2 chips');
  ok(J(O.optionsOf('Which one?\n1. ' + 'x'.repeat(61) + '\n2. keep')) === '[]' && O.NUMBERED_MAX === 60 && J(O.optionsOf('a / b / c / d', 'Pick?')) === '[]' && J(O.optionsOf('是 / ' + '否'.repeat(60), '要吗？')) === '[]' && O.SHORT_MAX === 60,
    'the bounds: a numbered item over 60 chars, a short form of 4 parts or over 60 chars ⇒ no parse');
  // RED CONTROL: a copy of the module with the first commit's rule put back (no choice cue, no question mark, no length) — the plan leg fails on it
  const SRC = read('src/ask-options.js');
  const red = [["  if (!ASKS.test(String(question || '')) && !CUE.test(s.slice(0, at[0].i) + ' ' + s.slice(tail))) return [];\n", ''],
    ["  if (s.length > SHORT_MAX || !/[?？]/.test(String(question || '') + s)) return []; // a one-line sentence is no choice\n", '']]
    .reduce((src, [a, b]) => (src && src.split(a).length === 2 ? src.replace(a, b) : null), SRC);
  const R = red && (() => { const m = { exports: {} }; new Function('module', 'exports', red)(m, m.exports); return m.exports; })();
  ok(!!R && R.askOptions(planAsk).length === 3 && R.askOptions({ ...planAsk, text: '我已经开始处理日志', detail: '把 ingest 的日志按天切分 / 保留 30 天' }).length === 2, 'RED CONTROL: the first commit\'s rule (a copy without the cue and the question-mark gates) draws the plan as 3 chips and the sentence as 2 — the plan leg FAILS on it', R && R.askOptions(planAsk));
  // ROUND 3 (主开发's delta review of the second commit): the words after a numbered list begin only at a NEW LINE or at a
  // dash whose own words carry a choice cue — the round-2 cut took ANY dash in the LAST item, so its own sub-label was cut
  // while the earlier items kept theirs (the chip's label IS the reply the agent receives); and the cue counts in the
  // QUESTION too (vibespace-ask's own shape: the question asks, the detail lists)
  const dashy = 'Which? 1. fast — risky 2. slow — safe';
  ok(J(O.optionsOf(dashy)) === J(['1. fast — risky', '2. slow — safe']), '«Which? 1. fast — risky 2. slow — safe» ⇒ both options whole — the last one keeps its own «— safe» as the first keeps «— risky»', O.optionsOf(dashy));
  ok(J(O.optionsOf('1. 北京 2. 上海 — 选哪个？')) === J(['1. 北京', '2. 上海']) && J(O.optionsOf('1. fast — risky 2. slow — safe — 选哪个？')) === J(['1. fast — risky', '2. slow — safe']) && J(O.optionsOf('1. 北京 2. 上海 -- which?')) === J(['1. 北京', '2. 上海']),
    '…a dash FOLLOWED BY A CUE still starts the words after the list: «1. 北京 2. 上海 — 选哪个？» ⇒ 2 clean chips, and only the dash whose own words ask (not the option\'s «— safe» before it)');
  ok(J(O.optionsOf('Which?\n1. fast — risky\n2. slow — safe\nthanks')) === J(['1. fast — risky', '2. slow — safe']) && J(O.optionsOf('1. 北京 2. 上海 — 请回复', '选哪个城市？')) === J(['1. 北京', '2. 上海 — 请回复']),
    '…a NEW LINE after the last item starts them too; a dash with no cue after it is the option\'s own words (the rule\'s other side)');
  const cityAsk = { ...planAsk, id: 'ut-fx-city', text: '选哪个城市？', detail: '1. 北京\n2. 上海' };
  const planCue = { ...planAsk, id: 'ut-fx-plan2', text: '发布计划确认：按下面三步走可以吗？', detail: '1. 先在预发环境打包\n2. 灰度 10% 观察一小时\n3. 全量发布' };
  ok(J(O.askOptions(cityAsk)) === J(['1. 北京', '2. 上海']), '«选哪个城市？» over a detail «1. 北京\\n2. 上海» (the cue in the QUESTION — vibespace-ask\'s own shape) ⇒ 2 chips', O.askOptions(cityAsk));
  ok(J(O.askOptions(planCue)) === '[]' && J(O.askOptions(planAsk)) === '[]', '…a three-step plan under a question with no cue («发布计划确认：按下面三步走可以吗？») ⇒ still 0 chips', O.askOptions(planCue));
  const goWait = ['按这个计划做，还是先等等？', 'Go ahead with this plan, or wait?'].map((text) => O.askOptions({ ...planCue, text }).length);
  ok(J(goWait) === '[0,0]' && O.askOptions({ ...planCue, text: '这三步里哪一步要我先确认？' }).length === 3,
    '…and under a go-or-wait question («还是先等等？» / «or wait?» name their OWN alternatives) ⇒ 0; a question that points AT the list («哪一步») ⇒ 3', goWait);
  // RED CONTROLS: copies of THIS module with each round-3 rule put back as the second commit had it
  const red3 = (subs) => { const src = subs.reduce((t, [a, b]) => (t && t.split(a).length === 2 ? t.replace(a, b) : null), SRC); if (!src) return null; const m = { exports: {} }; new Function('module', 'exports', src)(m, m.exports); return m.exports; };
  const cutRed = red3([['function trailerAt(s, from) {\n', 'function trailerAt(s, from) {\n  { const m = /\\s+[—–]+\\s*|\\s*——\\s*|\\s+-{1,2}\\s+|\\r?\\n/.exec(s.slice(from)); return m ? from + m.index : s.length; }\n']]);
  ok(!!cutRed && J(cutRed.optionsOf(dashy)) === J(['1. fast — risky', '2. slow']) && J(cutRed.optionsOf('1. 北京 2. 上海 — 选哪个？')) === J(['1. 北京', '2. 上海']), 'RED CONTROL: the second commit\'s cut (any dash or new line in the LAST item) answers [«1. fast — risky», «2. slow»] — the dash leg FAILS on it', cutRed && cutRed.optionsOf(dashy));
  const cueRed = red3([["  if (!ASKS.test(String(question || '')) && !CUE.test(", '  if (!CUE.test(']]);
  ok(!!cueRed && J(cueRed.askOptions(cityAsk)) === '[]' && J(cueRed.askOptions(planCue)) === '[]', 'RED CONTROL: the second commit\'s detail-only cue draws «选哪个城市？» + «1. 北京\\n2. 上海» as 0 chips — the question leg FAILS on it', cueRed && cueRed.askOptions(cityAsk));
  // ROUND 4 (主开发's own parser probe on the third commit): ONE rule for the words after the last option on EVERY form — a
  // dash whose own words carry a cue begins them, so they are never part of the last chip (the short form posted «wait —
  // which» as the reply); and a ONE-LINE lettered list («A) 北京 B) 上海», no ；/ line break between) splits at its markers
  const tri = 'deploy / rollback / wait — which?';
  ok(J(O.optionsOf(tri)) === J(['deploy', 'rollback', 'wait']) && J(O.optionsOf('是 / 否 — 选哪个？')) === J(['是', '否']) && J(O.optionsOf('yes | no -- which?')) === J(['yes', 'no']),
    '«deploy / rollback / wait — which?» ⇒ [deploy, rollback, wait] — the short form\'s words after its parts are not the last chip', O.optionsOf(tri));
  ok(J(O.optionsOf('fast — risky / slow — safe', 'Which?')) === J(['fast — risky', 'slow — safe']) && J(O.optionsOf('deploy / rollback — risky / wait — which?')) === J(['deploy', 'rollback — risky', 'wait']),
    '…a dash with no cue after it is the part\'s own words (the rule\'s other side), on the last part as on every other');
  ok(J(O.optionsOf('A 三处都改；B 只改退款 — 选哪个？')) === J(['A 三处都改', 'B 只改退款']) && J(O.optionsOf('A fast — risky；B slow — safe')) === J(['A fast — risky', 'B slow — safe']),
    '…and the separated lettered form: «A 三处都改；B 只改退款 — 选哪个？» ⇒ the last chip is «B 只改退款»; an option\'s own «— safe» stays');
  const lineAsk = { ...planAsk, id: 'ut-fx-line', text: '选哪个？', detail: 'A) 北京 B) 上海' };
  ok(J(O.askOptions(lineAsk)) === J(['A) 北京', 'B) 上海']) && J(O.askOptions({ ...lineAsk, detail: 'A）北京 B）上海' })) === J(['A）北京', 'B）上海']),
    '«A) 北京 B) 上海» / «A）北京 B）上海» under «选哪个？» (ONE line, no separator between the items) ⇒ 2 chips', O.askOptions(lineAsk));
  ok(['A、北京 B、上海', 'A: 北京 B: 上海', 'A：北京 B：上海', '选一个：A) 北京 B) 上海', '(A) 北京 (B) 上海'].every((d) => O.optionsOf(d, '选哪个？').length === 2) && J(O.optionsOf('A) 北京 B) 上海 — 选哪个？')) === J(['A) 北京', 'B) 上海']),
    '…the marker forms A、 A: A： too (after a lead-in ending in a colon, or parenthesised) ⇒ 2; the words after them are not the last chip');
  ok(J(O.askOptions({ ...lineAsk, text: '签署日期写哪一天？', detail: 'A）今天；B）下周一' })) === J(['A）今天', 'B）下周一']), '«A）今天；B）下周一» (a separator between) ⇒ 2 chips — as before');
  ok(J(O.optionsOf('A. do x B. do y', 'Which?')) === '[]' && J(O.optionsOf('A do x B do y', 'Which?')) === '[]' && J(O.optionsOf('Option A: fast B: slow', 'Which?')) === '[]' && J(O.optionsOf('A)x B)y', '?')) === '[]',
    '«A. do x B. do y» on ONE line with no separator stays 0, as before (on a running line «A.» / «A » are a sentence\'s words); so do words before the A that are no lead-in, and a marker glued to a Latin word');
  const onLine = Array.from({ length: 11 }, (_, k) => String.fromCharCode(65 + k) + ') 选项' + k);
  ok(O.optionsOf(onLine.slice(0, 10).join(' '), '?').length === 10 && J(O.optionsOf(onLine.join(' '), '?')) === '[]' && J(O.optionsOf('A) ' + '很'.repeat(121) + ' B) 短', '?')) === '[]' && J(O.optionsOf('A) 北京 C) 上海', '?')) === '[]' && J(O.optionsOf('A) 北京 B) 上海\n请回复', '?')) === '[]',
    '…with the same bounds: ten on a line ⇒ 10, eleven ⇒ none, a label over 120 chars ⇒ none, letters out of order ⇒ none, a line after them ⇒ none (as the separated form)');
  // RED CONTROLS: copies of THIS module with each round-4 rule taken out (the third commit's shapes)
  const shortRed = red3([['  const tail = trailerAt(s, s.indexOf(sep) + 1);', '  const tail = s.length;']]);
  ok(!!shortRed && J(shortRed.optionsOf(tri)) === J(['deploy', 'rollback', 'wait — which']), 'RED CONTROL: the third commit\'s short() (no words after its parts) answers [deploy, rollback, «wait — which»] — the short leg FAILS on it', shortRed && shortRed.optionsOf(tri));
  const letterRed = red3([['parts[k].slice(0, trailerAt(parts[k], at))', 'parts[k]']]);
  ok(!!letterRed && J(letterRed.optionsOf('A 三处都改；B 只改退款 — 选哪个？')) === J(['A 三处都改', 'B 只改退款 — 选哪个？']), 'RED CONTROL: the third commit\'s lettered parts (the last part whole) post «B 只改退款 — 选哪个？» — the lettered leg FAILS on it', letterRed && letterRed.optionsOf('A 三处都改；B 只改退款 — 选哪个？'));
  const lineRed = red3([['  const l = letteredLine(s);\n  if (l.length) return l;\n', '']]);
  ok(!!lineRed && J(lineRed.askOptions(lineAsk)) === '[]' && J(lineRed.optionsOf('A）北京 B）上海', '选哪个？')) === '[]' && lineRed.askOptions({ ...lineAsk, detail: 'A）今天；B）下周一' }).length === 2,
    'RED CONTROL: the third commit\'s lettered list (split only at ；/ ; / a line break) draws «A) 北京 B) 上海» as 0 chips — the one-line leg FAILS on it', lineRed && lineRed.askOptions(lineAsk));
  ok(J(O.optionsOf(null)) === '[]' && J(O.optionsOf(undefined)) === '[]' && J(O.optionsOf(42)) === '[]', 'garbage ⇒ []');
}

console.log('② askOptions — explicit options win; only an agent\'s ask is parsed (P2-3)');
{
  const ask = ITEMS[1];
  ok(J(O.askOptions(ask)) === J(['A 改（推荐）', 'B 不改']), 'an agent ask with options=null ⇒ its detail parsed');
  ok(J(O.askOptions({ ...ask, options: ['Yes', 'No'] })) === J(['Yes', 'No']), 'the agent\'s explicit options[] (vibespace-ask --options) win over the parse');
  ok(J(O.askOptions(ask, 'A x；B y')) === J(['A x', 'B y']), 'the detail the surface SHOWS is what is parsed (the device\'s own words)');
  for (const [l, it] of [['a producer\'s action', { ...ask, action: { type: 'reset-credit' } }], ['a card', { ...ask, card: { kind: 'api-call' } }], ['a notice', { ...ask, kind: 'notice' }],
    ['a cleared item', { ...ask, clearedAt: NOW }], ['i18n words', { ...ask, i18n: { text: { key: 'x' } } }], ['a job\'s form', { ...ask, jobId: 'j1' }]]) ok(J(O.askOptions(it)) === '[]', `${l} ⇒ no parsed chips (its buttons are its own)`);
  ok(J(O.askOptions(null)) === '[]', 'no item ⇒ []');
}

console.log('③ openCount + badgeWords — THE HONEST COUNT (P1-1)');
{
  const b = L.badgeOf(ITEMS, NOW);
  ok(L.openCount(ITEMS) === 21 && b.action.length === 0, `the fixture: 21 open, all in band 5 «Other questions» — openCount 21, the loud part (bands 1–4) ${b.action.length}`);
  const words = L.badgeWords(b.action, L.openCount(ITEMS), t);
  ok(words === '21 waiting on you — none pressing', 'the badge\'s words with 21 open and nothing loud: «21 waiting on you — none pressing»', words);
  // RED CONTROL = the base's rule: the badge counted bands 1–4 and worded THAT list (actionWords(action) — total = its length)
  const base = L.badgeWords(b.action, b.action.length, t);
  ok(base === 'Nothing waiting on you', 'RED CONTROL: the base\'s rule (count = bands 1–4) says «Nothing waiting on you» with 21 open — the stress evaluation\'s P1-1', base);
  const urgent = { ...ITEMS[0], id: 'ut-urg', urgency: 'urgent' };
  const all = [urgent, ...ITEMS];
  const w2 = L.badgeWords(L.badgeOf(all, NOW).action, L.openCount(all), t);
  ok(w2 === '1 urgent — waiting on you · 21 more, none pressing', 'one urgent + 21 quiet: the loud tier first, then «21 more, none pressing»', w2);
  ok(L.badgeWords([], 0, t) === 'Nothing waiting on you', '«Nothing waiting on you» ONLY at zero');
  ok(L.badgeWords([], 1, t) !== 'Nothing waiting on you' && L.badgeWords([{ urgency: 'high' }], 1, t) === '1 high — waiting on you', 'one open item never reads «Nothing…»; a loud-only count reads as before');
  const notice = { ...ITEMS[0], id: 'ut-n', kind: 'notice' };
  ok(L.openCount([notice, ...ITEMS]) === 21 && L.openCount(null) === 0 && L.openCount([null, undefined]) === 0, 'notices are not counted (their own grey count); garbage counts nothing');
  const tc = L.tabCounts(ITEMS, [], 0, NOW);
  ok(tc.inbox.action === 21 && tc.inbox.urgency === 'quiet', 'tabCounts (the tray\'s Inbox tab) = the honest count, `quiet` (outlined) when nothing is loud', tc.inbox);
  ok(L.tabCounts(ITEMS, [], 0).inbox.action === 21 && L.tabCounts(ITEMS, [], 0).inbox.urgency === 'normal', '…the For-you window\'s Actions tab (no `now`) the same 21');
  const pay = L.inboxBadgeFor(ITEMS, ['claude:payments'], NOW);
  ok(pay.count === 6 && pay.urgency === 'quiet', 'inboxBadgeFor (payments\' title-bar badge) = its 6 open questions, quiet', pay);
  ok(L.inboxBadgeFor(all, ['claude:payments'], NOW).urgency === 'urgent' && L.inboxBadgeFor(all, ['claude:payments'], NOW).count === 7, '…an urgent one among them colours it urgent and counts 7');
}

console.log('④ sessionMark + firstLine — «needs you · N · <the newest question>» (P2-4)');
{
  const m = L.sessionMark(ITEMS, ['claude:payments', 'webui:w-pay']);
  ok(m.n === 6 && m.newest && m.newest.text === '第六个问题（短）', 'payments: n 6, the newest question = the one asked last', { n: m.n, newest: m.newest && m.newest.text });
  const re = { ...ITEMS[0], reaskedAt: NOW };
  ok(L.sessionMark([re, ...ITEMS.slice(1)], ['claude:payments']).newest.id === re.id, 'a re-ask makes a question the newest again');
  ok(L.sessionMark(ITEMS, ['claude:nobody']).n === 0 && L.sessionMark(ITEMS, ['claude:nobody']).newest === null && L.sessionMark(ITEMS, null).n === 0, 'a conversation with nothing open ⇒ n 0 (no marker)');
  ok(L.sessionMark([{ ...ITEMS[0], kind: 'notice' }], ['claude:payments']).n === 0, 'a notice is no «needs you»');
  ok(L.firstLine('\n  first line here  \nsecond') === 'first line here' && L.firstLine('x'.repeat(130), 120) === 'x'.repeat(119) + '…' && L.firstLine(null) === '', 'firstLine: the first non-empty line, cut at 120 with an ellipsis');
  ok(L.firstLine(ITEMS[0].text).length === 120 && L.firstLine(ITEMS[0].text).endsWith('…'), 'the 243-char question\'s marker line is cut (the window holds the whole)');
}

console.log('⑤ ONE RENDERER — the tray row and the For-you pane draw the agent\'s words as written (P1-2)');
{
  const noop = () => {};
  const mkEl = () => ({ dataset: {}, className: '', innerHTML: '', querySelector: () => null, querySelectorAll: () => [], appendChild: noop, addEventListener: noop, setAttribute: noop, classList: { add: noop, remove: noop, toggle: noop }, style: {} });
  const had = { window: globalThis.window, document: globalThis.document, localStorage: globalThis.localStorage, addEventListener: globalThis.addEventListener, removeEventListener: globalThis.removeEventListener };
  globalThis.window = globalThis; globalThis.addEventListener = globalThis.addEventListener || noop; globalThis.removeEventListener = globalThis.removeEventListener || noop;
  globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
  globalThis.document = { createElement: mkEl, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener: noop, removeEventListener: noop, documentElement: { style: {}, lang: 'en' }, body: mkEl(), head: mkEl() };
  try {
    const R = await import(pathToFileURL(path.join(ROOT, 'src/lib/user-todos-row.js')).href);
    const q = ITEMS.find((i) => /__tests__/.test(i.text));
    const html = R.wordsHtml(q.text), dHtml = R.wordsHtml(q.detail);
    const textOf = (h) => h.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
    ok(textOf(html) === q.text && textOf(dHtml) === q.detail && !/<strong|<em/.test(html + dHtml), 'wordsHtml: the question and its detail read EXACTLY as the agent wrote them — `__tests__/` stays, no emphasis', { html, dHtml });
    ok(R.wordsHtml('<img src=x onerror=alert(1)>') === '&lt;img src=x onerror=alert(1)&gt;' && R.wordsHtml(null) === '', 'every segment escaped (an item is peer text); nothing ⇒ empty');
    const ctx = { t, nameFor: () => 'payments', wordsOf: (i) => i.text, detailOf: (i) => i.detail || '', replyState: () => ({ show: true, enabled: true }), optionsOf: (i) => O.askOptions(i, i.detail || '') };
    const row = R.renderRow({ item: q, resolved: false, band: 5 }, ctx).innerHTML;
    ok(row.includes(`<div class="ut-text">${R.wordsHtml(q.text)}</div>`) && row.includes(`<div class="ut-detail">${R.wordsHtml(q.detail)}</div>`), 'the tray row\'s words and detail ARE wordsHtml (one renderer)');
    const chips = [...row.matchAll(/<button type="button" class="ut-opt" data-idx="(\d+)">([^<]*)<\/button>/g)].map((m) => m[2]);
    ok(J(chips) === J(['Reply: A test/（现有）', 'Reply: B __tests__/']), 'the row draws the parsed options as chips — «Reply: B __tests__/» verbatim (addressed by index)', chips);
    const eight = ITEMS.find((i) => i.text.length > 200);
    const r8 = R.renderRow({ item: eight, resolved: false, band: 5 }, ctx).innerHTML;
    ok((r8.match(/class="ut-opt"/g) || []).length === 8, 'the 8-option question draws 8 chips in the tray row');
    ok((R.renderRow({ item: eight, resolved: false, band: 5 }, { ...ctx, optionsOf: undefined }).innerHTML.match(/class="ut-opt"/g) || []).length === 0, 'CONTROL: without the model\'s optionsOf (the base: item.options only) ⇒ 0 chips — the stress evaluation\'s P2-3');
    // RED CONTROL = the base pane: a private Marked (gfm, breaks) over the same words
    const { Marked } = await import(pathToFileURL(require.resolve('marked', { paths: [ROOT] })).href);
    const md = new Marked({ gfm: true, breaks: true });
    const baseTitle = md.parseInline(q.text), baseDetail = md.parse(q.detail);
    ok(/<strong>tests<\/strong>/.test(baseTitle) && /<strong>tests<\/strong>/.test(baseDetail), 'RED CONTROL: the base pane\'s markdown made `__tests__/` a bold «tests/» in the title AND the detail (the option the person answered was not the agent\'s)', { baseTitle, baseDetail });
  } finally { for (const [k, v] of Object.entries(had)) { if (v === undefined) delete globalThis[k]; else globalThis[k] = v; } }
  // THE CENSUS OVER BOTH DOORS: an item's words reach the screen through wordsHtml only — no markdown in either file
  const ROW = read('src/lib/user-todos-row.js'), IW = read('src/lib/inbox-window.js');
  const census = (row, iw) => ({
    row: /export const wordsHtml = \(text\) => linkedHtml\(String\(text \|\| ''\), \{ escape: escHtml \}\);/.test(row) && /<div class="ut-text">\$\{card \? escHtml\(words\) : wordsHtml\(words\)\}<\/div>/.test(row) && /<div class="ut-detail">\$\{wordsHtml\(detail\)\}<\/div>/.test(row),
    pane: /function wordsInto\(el, src\) \{\s*el\.innerHTML = wordsHtml\(src\);\s*\}/.test(iw) && /wordsInto\(c\.title, v\.title\);/.test(iw) && /else wordsInto\(c\.detail, v\.detail\);/.test(iw),
    noMarkdown: ![row, iw].some((s) => /from ['"]marked['"]|new Marked\(|renderMarkdown\(|\bmdInto\(/.test(s)),
  });
  const c = census(ROW, IW);
  ok(c.row && c.pane && c.noMarkdown, 'CENSUS: the tray row (words + detail) and the For-you pane (title + detail) both draw wordsHtml; neither file parses markdown', c);
  const baseIW = IW.replace('function wordsInto(el, src) {\n  el.innerHTML = wordsHtml(src);\n}', "import { Marked } from 'marked';\nconst md = new Marked({});\nfunction mdInto(el, src) {\n  el.innerHTML = md.parse(src);\n}").replace('wordsInto(c.title, v.title);', 'mdInto(c.title, v.title);');
  const cb = census(ROW, baseIW);
  ok(baseIW !== IW && !(cb.pane && cb.noMarkdown), 'CONTROL: a pane with its markdown put back ⇒ the census is RED', cb);
}

console.log('⑥ THE WIRING — every door counts honestly, the row marks, the window answers');
{
  const P = read('src/lib/user-todos-panel.js'), W = read('src/lib/inbox-window.js'), ACT = read('src/lib/user-todos-actions.js'), CSS = read('public/style.css');
  const SR = read('src/lib/sidebar-render.js'), COL = read('src/lib/sidebar-column.js');
  const wiring = (p) => ({
    badge: /const total = openCount\(todos\.open\);/.test(p) && /btn\.classList\.toggle\('ut-has-items', total > 0\);/.test(p) && /mBtn\.classList\.toggle\('ut-has-items', total > 0\);/.test(p) && /btn\.title = actionWords\(action, total\)/.test(p) && /ut-seg-quiet/.test(p),
    tab: /const words = actionWords\(action, c\.inbox\.action\);/.test(p),
    head: /const openActions = openCount\(todos\.open\);/.test(p),
  });
  const w = wiring(P);
  ok(w.badge && w.tab && w.head, 'the taskbar button AND the phone / Duo nav button (one renderBtn), the tray\'s Inbox tab and its head say THE honest count (openCount) with its words', w);
  ok(!wiring(P.replace("btn.classList.toggle('ut-has-items', total > 0);", "btn.classList.toggle('ut-has-items', n > 0);")).badge, 'CONTROL: the base\'s «lit only for bands 1–4» put back ⇒ RED');
  ok(/const words = actionWords\(openInScope\.filter\(\(i\) => !isNotice\(i\)\), c\.inbox\.action\);/.test(W) && /export function actionWords\(action, total = action\.length\) \{ return badgeWords\(action, total, t\); \}/.test(ACT), 'the For-you window\'s Actions tab says the same count and words (badgeWords — ONE sentence)');
  ok(/this\.app\.sessionAsks\?\.markIn\?\.\(card, s\);/.test(SR) && /markIn: \(card, s\) => \{/.test(P) && /sessionMark\(todos\.open, keys\)/.test(P) && /t\('needs you · \{n\}', \{ n: m\.n \}\)/.test(P) && /app\.openInbox\(\{ itemId: m\.newest\.id, sessionKey: m\.newest\.sessionKey \}\)/.test(P),
    'every session row (_buildSessionCard: the Duo\'s column, the phone\'s drawer, the desktop\'s sidebar) gets ONE «needs you · N» marker; its tap opens the For-you window on that conversation\'s newest question');
  ok(!/sessionAsks\.render|col-asks/.test(COL) && !/\.col-asks\b/.test(CSS) && !/render: \(box, s\) =>|colAsks/.test(P), 'the inline answers of slice 2c are gone (no .col-asks box, no CSS, no render door) — the owner\'s B');
  ok(/if \(e\.target\.closest\('\.ut-done'\)\) model\.resolveOne\(id, 'done'\);/.test(P) && /else if \(e\.target\.closest\('\.ut-dismiss'\)\) model\.resolveOne\(id, 'dismissed'\);/.test(P)
    && /showToast\(status === 'done' \? t\('Marked done'\) : t\('Dismissed'\), \{ duration: 6000, actions: \[\{ label: t\('Undo'\), run: \(\) => setStatus\(id, 'open'\) \}\] \}\);/.test(ACT), '✓ / ✕ on a row: ONE toast with Undo for 6 s — the ↺ road (status open) on the same item (P3-2)');
  ok(/app\.openInbox\(\{ scope: 'all' \}\)/.test(P) && /else if \(scope === 'all'\) st\.scopeKey = null;/.test(W), 'the tray head\'s ⤢ opens the window on ALL sessions — never the scope another device left (P3-7)');
  ok(/if \(expand && !item\.classList\.contains\('ut-item-resolved'\) && !e\.target\.closest\('\.ut-sess'\) && !\(rec && model\.isDoor\(rec\.sessionKey, rec\)\)\) \{ toggleOpen\(item\); return; \}/.test(P) && /const isDoor = \(key, item\) =>/.test(ACT) && /rowClick\(e, item, \{ expand: true \}\);/.test(P) && /#user-todos-popup \.ut-bands \.ut-item:not\(\.ut-open\):not\(:has/.test(CSS), 'a tray row\'s body tap opens it in place (never navigates away); its conversation\'s name is the door (P3-8); a RESOLVED row has nothing to open — its body jumps (round 2)');
  ok(/model\.optionsFor\(rec\)\[Number\(chip\.dataset\.idx\)\]/.test(P) && /model\.optionsFor\(it\)\[Number\(opt\.dataset\.idx\)\]/.test(W) && /options: model\.optionsFor\(it\)/.test(W) && /const optionsFor = \(i\) => askOptions\(i, detailOf\(i\)\);/.test(ACT), 'a chip answers with ITS label in the tray and in the window (THE model\'s optionsFor — explicit, else parsed)');
  // THE TOUCH SCALE (the owner 2026-10-25: 「按钮这么大，字这么小」): ONE touch-only block, its floors, the phone's first-screen page outside it
  const blkA = CSS.indexOf('/* ── lane foryou-honest: THE TOUCH SCALE'), blkB = CSS.indexOf('/* ── end of the touch scale (lane foryou-honest) ── */');
  const blk = blkA >= 0 && blkB > blkA ? CSS.slice(blkA, blkB) : '';
  ok(/@media \(hover: none\) and \(pointer: coarse\) \{/.test(blk) && /#user-todos-popup \*, \.ut-mini-popover \*, #phone-home \*, \.iw \*, \.ut-sess-mark, \.ut-sess-mark \* \{ font-size: max\(14px, 1em\) !important; \}/.test(blk) && (blk.match(/min-height: 44px !important/g) || []).length === 1 && /  #phone-home :is\(button, \[role="button"\], summary/.test(blk) && /:is\(#user-todos-popup, \.ut-mini-popover, #phone-home, \.iw\) :is\(textarea, select, input:not\(\[type="radio"\], \[type="checkbox"\]\)\) \{ font-size: 16px !important; \}/.test(blk) && CSS.split('/* ── lane foryou-honest: THE TOUCH SCALE').length === 2,
    'THE TOUCH SCALE is ONE touch-only block (hover: none, pointer: coarse — the mouse keeps its sizes): text ≥ 14 px and targets ≥ 44 px on the tray, the mini inbox, the phone\'s first-screen page, the window and the marker; every field 16 px (iOS never zooms)');
  const ROWS = read('src/lib/user-todos-row.js');
  const labelled = ['Open', 'Reply', 'Mark done', 'Reopen', 'More'].every((w) => ROWS.includes('data-label="${escHtml(t(\'' + w + '\'))}"')) && ROWS.includes('data-label="${escHtml(tc(\'inbox\', \'Dismiss\'))}"') && /\.ut-actions > \.ut-act\[data-label\]::after \{ content: attr\(data-label\);/.test(blk);
  ok(labelled, 'every verb of a row carries its WORD (data-label: Reply · Open · Mark done · Dismiss · Reopen · More) — a touch screen draws it under the icon (::after; the button text, title and aria unchanged)');
  ok(!(() => { const b = blk.replace(/(\.ut-actions > \.ut-act\[data-label\]::after \{ )content: attr\(data-label\);/, '$1content: none;'); return /\.ut-actions > \.ut-act\[data-label\]::after \{ content: attr\(data-label\);/.test(b); })(), 'CONTROL: a block that draws no word fails the label leg');
  // ONE ROW SHAPE on a phone (主开发's pick A, 2026-10-25): the sheet's and the page's rows FOLD on a touch screen — the question
  // + one meta line, the whole row the tap, its trailing conversation door; ONE open at a time; an answer folds it
  const acc = {
    css: /:is\(#user-todos-popup, #phone-home\) \.ut-item:not\(\.ut-open\) > \.ut-body > :not\(\.ut-go, \.ut-text, \.ut-meta\) \{ display: none !important; \}/.test(blk)
      && /:is\(#user-todos-popup, #phone-home\) \.ut-item:not\(\.ut-open\) > \.ut-body > :is\(\.ut-text, \.ut-meta\) \* \{ pointer-events: none; \}/.test(blk)
      && /\.ut-item:not\(\.ut-open\) > \.ut-body > \.ut-text \{ display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 1 !important;/.test(blk)
      && /:is\(#user-todos-popup, #phone-home\) \.ut-item > \.ut-body > \.ut-go \{ display: inline-flex;[^}]*min-width: 52px; min-height: 44px;/.test(blk) && /^\.ut-go \{ display: none; \}/m.test(CSS),
    js: /if \(expand && isTouchDevice\(\)\) \{\n\s+if \(!item\.classList\.contains\('ut-open'\)\) \{ openOne\(item\); return; \}/.test(P)
      && /for \(const o of surface\.querySelectorAll\('\.ut-item\.ut-open'\)\) if \(o !== item\) toggleOpen\(o\);/.test(P)
      && /if \(item\) rowClick\(e, item, \{ expand: isTouchDevice\(\) \}\);/.test(P)
      && /if \(e\.target\.closest\('\.ut-go'\)\) \{ const rec = byId\(id\); if \(rec\) jump\(rec\.sessionKey, rec\); return; \}/.test(P),
    row: /const go = notice \|\| entry\.band \? `<button type="button" class="ut-go" title="\$\{escHtml\(t\('Go to this session'\)\)\}" aria-label="\$\{escHtml\(t\('Go to this session'\)\)\}" data-label="\$\{escHtml\(tc\('inbox', 'Chat'\)\)\}">\$\{UI_ICONS\.chat\}<\/button>`/.test(ROWS)
      && /if \(wasOpen && !entry\.resolved\) el\.classList\.add\('ut-open'\);/.test(ROWS),
  };
  ok(acc.css && acc.js && acc.row, 'ONE ROW SHAPE on a phone: the sheet\'s and the page\'s rows FOLD on a touch screen (the question in ONE line + one meta line, nothing tappable inside but the trailing «Chat» door — an SVG, 44 px), the whole row opens it, ONE open at a time, a repaint keeps it open and an answer folds it', acc);
  ok(!/if \(expand && isTouchDevice\(\)\) \{\n\s+if \(!item\.classList\.contains\('ut-open'\)\) \{ openOne\(item\); return; \}/.test(P.replace('if (expand && isTouchDevice()) {', 'if (false) {')), 'CONTROL: the accordion switched off ⇒ RED');
  // THE PHONE'S FIRST SCREEN's doors (the owner on a phone: «每次刷新都是这个» / «切到其他窗口之后又回不来了»)
  const NAV = read('src/lib/mobile-nav.js');
  const doors = {
    reload: /const reloaded = homeWas !== null \|\| !!app\._mobileNav\?\.shownAtBoot\?\.\(\);\n\s+if \(reloaded && homeWas !== '1' && app\.wm\?\.activeWindowId\) return;/.test(P)
      && /const HOME_ON_KEY = 'vibespace\.phoneHomeOn';/.test(P) && /noteHomeOn\(true\);/.test(P) && /noteHomeOn\(false\);/.test(P)
      && /this\._shownAtBoot = Object\.keys\(this\._shown\)\.length > 0;/.test(NAV) && /shownAtBoot\(\) \{ return this\._shownAtBoot; \}/.test(NAV),
    badge: /if \(app\.viewportClass\?\.\(\) === 'compact' && home\) \{\n\s+if \(homeShown\(\)\) \{ hideHome\(\); if \(!app\.wm\?\.activeWindowId\) app\.sidebar\?\.toggle\?\.\(true\); return; \}\n\s+if \(showHome\(\)\) \{/.test(P),
    drawer: /b\.id = 'drawer-foryou';/.test(P) && /sec\.prepend\(b\);/.test(P) && /paintDrawerRow\(total\);/.test(P) && /`<span>\$\{escHtml\(t\('For you'\)\)\} · \$\{total\}<\/span>`/.test(P) && /html\[data-vc="compact"\] \.drawer-foryou \{ display: flex;[^}]*min-height: 44px;/.test(CSS),
  };
  ok(doors.reload && doors.badge && doors.drawer, 'THE PHONE\'S FIRST SCREEN: a RELOAD of a tab that had a window on show keeps it (the page only on a cold open, nothing on show, or the page itself on show); the top bar\'s For you TOGGLES the page (the sheet only when it has no row); the ☰ drawer\'s first row «For you · N» opens it', doors);
  ok(!/if \(reloaded && homeWas !== '1' && app\.wm\?\.activeWindowId\) return;/.test(P.replace("        if (reloaded && homeWas !== '1' && app.wm?.activeWindowId) return;\n", '')), 'CONTROL: the base\'s boot (the guard cut — the page takes every reload) ⇒ RED');
  const land = CSS.slice(CSS.indexOf('/* ── landscape: the TRAILING BAR'), CSS.indexOf('/* ── portrait: list 320'));
  ok(/html\[data-vc="regular"\] #mobile-nav #mobile-nav-todos \{\s*display: inline-flex !important; order: 11;/.test(land) && /html\[data-vc="regular"\] #mobile-nav-dest-tasks \{ order: 1[12]; \}/.test(land), 'the Duo\'s regular class has For you on its bar: the bottom section\'s first destination (order 11 — before Task Groups)');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
