#!/usr/bin/env node
// THE FIRST PROMPT CONTEXT LEAVES ROOM (lane prompt-budget, B-2aad, 2.369.227). mirror-green-223 measured 9 278 B of the
// 9 600 B cap on a no-task session's first fetch — the tools intro alone ≈ 8 KB — and one of 4 pending notices waited a
// prompt. The intro became ONE pointer line per surface + the rules every session needs; the teaching moved to the
// manuals `vibespace-docs <topic>` serves. Legs: ① the census (scripts/measure-prompt-context.mjs) printed, bytes per
// block; ② the intro ≤ 4 096 B in every variant; ③ every shape with 4 notices + a 1 KB stash entry fits whole with
// ≥ 1 KB room, the three-group shape ≤ 7.5 KB (lane task-group-context: every Context row told); ④ every pointer names a topic vibespace-docs serves, every surface has
// one; ⑤ every line the cut dropped is in its manual and not in the intro; ⑥ CONTROL: the dropped lines put back ⇒
// the same judge is red. lane channels-teach: ③ and ④ also judge a session whose channel REACH teaches `vibespace-channels`
// (the tools section's paragraph, the reminder's segment). lane injection-relevance: ⑦ a busy group's mid-session UPDATE
// (8 picked lines + the digest naming every session left out + the others'-backlog line) stays ≤ 4 096 B a group, three
// groups under their 6 500 B block, each beside the per-turn reminder and a 500 B extra with ≥ 1 KB room under the cap.
// Run: node scripts/test-prompt-budget.mjs
import './scratch.mjs';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { census, print, updateShapes, INTRO_MAX, FIRST_PROMPT_MAX, ROOM_MIN, UPDATE_MAX, FIXTURE_ROOT } from './measure-prompt-context.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AR = require(path.join(REPO, 'src/agent-routes.js'));
const { TaskGroupManager } = require(path.join(REPO, 'src/task-groups.js'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const B = (t) => Buffer.byteLength(String(t || ''), 'utf-8');
const norm = (t) => String(t).replace(/\s+/g, ' ').trim();

/** The judge (the real tree and the control): the failures, empty = holds. */
function judge(c) {
  const bad = [];
  if (c.introBytes > INTRO_MAX) bad.push(`the tools intro is ${c.introBytes} B (> ${INTRO_MAX})`);
  for (const s of c.shapes) if (s.room < ROOM_MIN) bad.push(`${s.name}: ${s.total} B leaves ${s.room} B under the ${c.cap} B cap (< ${ROOM_MIN})`);
  const three = c.shapes.find((s) => s.name === 'three groups');
  if (!three || three.total > FIRST_PROMPT_MAX) bad.push(`three groups: ${three && three.total} B (> ${FIRST_PROMPT_MAX})`);
  return bad;
}

console.log('— ① the census (bytes per block)');
const c = census();
print(c, (l) => console.log('    ' + l));
ok(c.shapes.length === 3 && verdictOf(c.shapes.every((s) => s.blocks.every(([, b]) => b > 0))), 'three shapes, every block rendered (non-vacuous)');

console.log('— ② the tools intro ≤ 4 096 B in every variant');
const T = { status: true, ask: true, task: true, jobs: true };
const set = { attachments: [{ alias: 'personal', isDefault: false, profileId: 'bp-00000001' }, { alias: 'work', isDefault: true, profileId: 'bp-00000002' }] };
const variants = ['D', 'none', 'H'].flatMap((v) => [{ browserVariant: v }, { browserVariant: v, browserSet: set, browserDisplay: { kind: 'none', xvfb: true }, fileTools: AR.fileToolsOf({ backend: 'claude' }) }]);
const sizes = variants.map((f) => B(AR.sessionToolsIntro(T, f)));
ok(Math.max(...sizes) <= INTRO_MAX, `the widest intro is ${Math.max(...sizes)} B (≤ ${INTRO_MAX}; ${sizes.join(' / ')})`);

console.log('— ③ room beside 4 notices + a 1 KB stash entry');
const bad = judge(c);
ok(bad.length === 0, `every shape fits whole with ≥ ${ROOM_MIN} B room, three groups ≤ ${FIRST_PROMPT_MAX} B${bad.length ? ' — ' + bad.join('; ') : ''}`);
for (const reach of ['read', 'request']) {
  const cr = census({ channels: reach });
  print(cr, (l) => console.log('    ' + l));
  const crBad = judge(cr);
  ok(crBad.length === 0 && gateOf(cr.shapes.every((s, i) => s.total > c.shapes[i].total || s.name === 'no Task Group')) && cr.reminder.one > 0 && cr.reminder.multi < cr.cap, `channels reach '${reach}': every shape still fits whole with ≥ ${ROOM_MIN} B room (the paragraph rides the group shapes), the reminder ${cr.reminder.one} B${crBad.length ? ' — ' + crBad.join('; ') : ''}`);
}

console.log('— ③b the budget is the same wherever the scratch dir is (B-52fa)');
{
  // a LONG real TMPDIR (a verifier's 87 chars): the measured shapes are byte-identical to the default dir's — the fixture's
  // dir is written as FIXTURE_ROOT; the raw renders (the real paths, the control) grow by the path's length, row after row
  const longDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-pb-long-' + 'x'.repeat(Math.max(64, 90 - os.tmpdir().length)) + '-')), was = process.env.TMPDIR;
  let atLong = null, rawLong = null, rawHere = null;
  try {
    rawHere = census({ raw: true });
    process.env.TMPDIR = longDir; atLong = census(); rawLong = census({ raw: true });
  } finally { if (was === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = was; fs.rmSync(longDir, { recursive: true, force: true }); }
  const totals = (x) => x.shapes.map((s) => s.total).join(' / ');
  // a long real path may make the planner step a row down (it budgets on the real head) — the measured shape can then only SHRINK:
  // the law is «the budget never reds by where the scratch dir is», never «byte-identical»
  ok(FIXTURE_ROOT.length === 28 && longDir.length > 80 && judge(atLong).length === 0 && verdictOf(atLong.shapes.every((s, i) => s.total <= c.shapes[i].total)),
    `with TMPDIR ${longDir.length} chars long every shape still fits whole and none measures more than the default's (${totals(atLong)} vs ${totals(c)}) — the fixture dir is ONE fixed-length stand-in`);
  ok(rawLong.shapes[2].total > rawHere.shapes[2].total,
    `CONTROL: measured on the REAL paths the three groups grow with the scratch dir's length (${rawHere.shapes[2].total} → ${rawLong.shapes[2].total} B) — what made a long TMPDIR red`);
}

console.log('— ③c a LONG real path steps a Context row down — and the row says so (B-07f5, the leg B-52fa asked for)');
{
  // The Context table tells each row at its chosen depth within the group's byte budget; a row that does not fit steps DOWN and
  // its line says «[over the injection budget: … — told as … instead]» (src/task-groups.js _ctxPlan). A group's folder (made by
  // `folders`, told at «file names») carries its REAL path in its row, once — so the SAME folder (24 files) under a long real
  // path costs exactly the path's extra bytes. One budget set between the two measured costs: under the short path the row is
  // told whole at its depth, no note; under the long path it steps down and its own line says so — never a silent drop. The
  // plant proves itself first, by a count: the long row costs exactly the two paths' difference more, at the same depth
  const tree = (root) => { const dir = path.join(root, 'work'); fs.mkdirSync(dir, { recursive: true }); for (let i = 0; i < 24; i++) fs.writeFileSync(path.join(dir, `notes-${String(i).padStart(2, '0')}.md`), '# notes\n'); return dir; };
  const planAt = (root, bytes) => {
    const data = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-pb-ctx-d-'));
    try {
      const tm = new TaskGroupManager({ dataDir: data, onChange: () => {} });
      const g = tm.create({ title: 'Paths', objective: 'a group whose folder lives under a long path', folders: [tree(root)] });
      return tm._ctxPlan(tm.get(g.id), bytes, { gid: '' });
    } finally { fs.rmSync(data, { recursive: true, force: true }); }
  };
  const shortRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-pb-ctx-s-'));
  const longBase = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-pb-ctx-l-'));
  const longRoot = path.join(longBase, ...Array.from({ length: 6 }, (_, i) => `a-long-folder-name-a-person-chose-${i}`));
  let s = null, l = null, sAt = null, lAt = null, budget = null;
  try {
    s = planAt(shortRoot, Infinity); l = planAt(longRoot, Infinity);
    budget = Math.floor((s.rows[0].bytes + l.rows[0].bytes) / 2);
    sAt = planAt(shortRoot, budget); lAt = planAt(longRoot, budget);
  } finally { fs.rmSync(shortRoot, { recursive: true, force: true }); fs.rmSync(longBase, { recursive: true, force: true }); }
  const cs = s && s.rows[0] ? s.rows[0].bytes : 0, cl = l && l.rows[0] ? l.rows[0].bytes : 0, extra = Buffer.byteLength(longRoot) - Buffer.byteLength(shortRoot);
  ok(!!(s && l && s.rows[0].chosen === 'names' && s.rows[0].level === 'names' && l.rows[0].level === 'names' && extra > 200 && cl - cs === extra),
    `③c the plant is where it claims: the same folder, told at «file names», costs ${cs} B under a ${shortRoot.length}-char path and ${cl} B under a ${longRoot.length}-char one — exactly the paths' ${extra} B difference (the path rides its row, once)`);
  const sLine = sAt ? sAt.lines.join('\n') : '', lLine = lAt ? lAt.lines.join('\n') : '';
  ok(!!(sAt && sAt.rows[0].level === 'names' && !/over the injection budget/.test(sLine)),
    `③c within ${budget} B the short path's row is told whole at «file names», no note`);
  ok(!!(lAt && lAt.rows[0].level !== 'names' && /\[over the injection budget: file names need [^\]]* — told as [^\]]* instead/.test(lLine) && lAt.rows[0].bytes <= cl),
    `③c within the same ${budget} B the LONG path steps the row down (to «${lAt ? lAt.rows[0].level : '?'}») and its own line says so; the measured row only shrinks (${lAt ? lAt.rows[0].bytes : '?'} ≤ ${cl} B)`);
  // The words the line says are the row's OWN level's — not merely some «told as …»: a line that named another depth than the one
  // told would mislead the reader. The depths' words as a person reads them (src/task-groups.js TELL_WORDS, pinned here); the line
  // says the row's level and NO other level's words.
  const DEPTH_WORDS = { note: 'the path and note only', names: 'file names', index: 'file names + key files', contents: 'full contents' };
  const saysAs = (line, lv) => line.includes(`— told as ${DEPTH_WORDS[lv]} instead`);
  const lv = lAt ? lAt.rows[0].level : '', othersIn = (line) => Object.keys(DEPTH_WORDS).filter((k) => k !== lv && saysAs(line, k));
  const saysOwn = (line) => !!(DEPTH_WORDS[lv] && saysAs(line, lv) && othersIn(line).length === 0);
  // control: the same line with another level's words in place of its own is refused (a pin that cannot tell them apart pins nothing)
  const wrongLv = lv === 'index' ? 'names' : 'index', wrong = DEPTH_WORDS[lv] ? lLine.replace(`— told as ${DEPTH_WORDS[lv]} instead`, `— told as ${DEPTH_WORDS[wrongLv]} instead`) : '';
  ok(gateOf(saysOwn(lLine)) && wrong !== lLine && !saysOwn(wrong),
    `③c the line says «told as ${DEPTH_WORDS[lv] || '?'} instead» — the words of the row's own level («${lv || '?'}»), no other level's (${othersIn(lLine).join(' ') || 'none'}); control: the line with «${DEPTH_WORDS[wrongLv]}» in their place is refused`);
  // …and the level itself: below «file names» there is only «the path and note only» (the adversarial read: the words agreeing with
  // rows[0].level did not pin the level — only the byte bound kept an upward step out), and that step names the door to every file
  ok(lv === 'note' && verdictOf(lLine.includes('told as the path and note only instead; `vibespace-task show --full` lists every file]')),
    `③c the step is DOWN to «the path and note only» (level «${lv || '?'}»), and its line names the door to every file (\`vibespace-task show --full\`)`);
}

console.log('— ④ every pointer names a served manual; every surface has one');
const intro = AR.sessionToolsIntro(T, { browserVariant: 'D' });
const section = TaskGroupManager.prototype._toolsSectionParts.call({}, '', false, T).join('\n');
const chSection = ['read', 'request'].map((reach) => TaskGroupManager.prototype._toolsSectionParts.call({}, '', false, { ...T, channels: reach }).join('\n')).join('\n');
const pointers = [...(intro + '\n' + section + '\n' + chSection + '\n' + AR.perTurnToolsLine({ ...T, channels: 'read' })).matchAll(/vibespace-docs ([a-z]+)/g)].map((m) => m[1]);
const topics = Object.keys(AR.AGENT_DOC_TOPICS || {});
ok(topics.length >= 10 && pointers.length >= 10 && verdictOf(pointers.every((t) => topics.includes(t))), `${pointers.length} pointers, each a topic vibespace-docs serves (${[...new Set(pointers)].join(' ')})`);
const surfaces = ['status', 'ask', 'jobs', 'msg', 'browser', 'window', 'design', 'pages', 'exit', 'task', 'channels'];
ok(verdictOf(surfaces.every((t) => pointers.includes(t))), `every surface has its pointer (${surfaces.filter((t) => !pointers.includes(t)).join(' ') || 'none missing'})`);
ok(verdictOf(['status', 'ask', 'jobs', 'msg', 'task'].every((t) => new RegExp('vibespace-docs ' + t).test(section))), 'the group Reporting-back section points at task / status / ask / jobs / msg');

console.log('— ⑤ every dropped line lives in its manual');
const FX = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/prompt-budget-moved.json'), 'utf-8'));
const manual = (t) => [].concat(AR.AGENT_DOC_TOPICS[t]).map((f) => fs.readFileSync(path.join(REPO, 'docs/agent', f), 'utf-8')).join('\n');
const lost = FX.moved.filter((m) => !norm(manual(m.topic)).includes(m.text));
ok(FX.moved.length >= 30 && lost.length === 0, `${FX.moved.length} dropped lines, each found in its manual${lost.length ? ' — missing: ' + lost.map((m) => `${m.topic}: ${m.text.slice(0, 60)}`).join(' | ') : ''}`);
const allIntros = norm(variants.map((f) => AR.sessionToolsIntro(T, f)).join('\n') + '\n' + section + '\n' + chSection);
ok(verdictOf(FX.moved.every((m) => !allIntros.includes(m.text))), 'none of them rides the intro or the section any more');

console.log('— ⑥ CONTROL: the intro\'s dropped lines put back ⇒ the judge is red');
const restored = (Tx, f) => AR.sessionToolsIntro(Tx, f).replace('\n</vibespace-session-tools>', '\n' + FX.moved.filter((m) => m.from === 'intro').map((m) => m.text).join('\n') + '\n</vibespace-session-tools>');
const cc = census({ intro: restored });
const cbad = judge(cc);
ok(cc.introBytes > INTRO_MAX && verdictOf(cbad.some((b) => /^no Task Group/.test(b))), `the old-size intro (${cc.introBytes} B) fails the same judge: ${cbad.join('; ')}`);

console.log('— ⑦ a busy group\'s update: the digest and the others\'-backlog line inside the 9 600 B law (lane injection-relevance)');
const ups = updateShapes();
for (const u of ups) console.log(`    ${u.name.padEnd(32)} ${String(u.bytes).padStart(5)} B`);
const [p90, burst, three] = ups;
ok(ups.length === 3 && verdictOf(ups.every((u) => /- New activity \(/.test(u.text) && /- Backlog: 3 parked \(1 HIGH \[B-[0-9a-f]+\]\) by others since your last update/.test(u.text))), 'three update shapes, each with its activity section and the others\'-backlog line (non-vacuous)');
ok(gateOf(/ logged \d+ more/.test(burst.text)) && gateOf(/… \d+ more from \d+ other sessions/.test(burst.text)) && gateOf(/, \d+ of them yours — not repeated\)/.test(burst.text)) && !/more lines —/.test(burst.text), 'the burst names the sessions it leaves out (≤ 6 + the overflow), counts the member\'s own lines, and pops nothing');
ok(p90.bytes <= UPDATE_MAX && burst.bytes <= UPDATE_MAX, `one group's update ≤ ${UPDATE_MAX} B (the p90 ${p90.bytes} B, a 460-line burst ${burst.bytes} B)`);
const extra = 500 + '<vibespace-reminder></vibespace-reminder>'.length, rem = c.reminder;
ok(three.bytes <= 6500 && !/truncated —/.test(three.text) && verdictOf([p90.bytes + rem.one, burst.bytes + rem.one, three.bytes + rem.multi].every((b) => b + extra + 4 <= AR.INLINE_CAP - ROOM_MIN)),
  `three groups bursting ${three.bytes} B ≤ 6 500 B, uncut; each shape + the per-turn reminder + a 500 B extra leaves ≥ ${ROOM_MIN} B under ${AR.INLINE_CAP} B (${[p90.bytes + rem.one, burst.bytes + rem.one, three.bytes + rem.multi].map((b) => b + extra + 4).join(' / ')} B)`);

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
