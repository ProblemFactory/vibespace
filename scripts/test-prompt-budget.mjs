#!/usr/bin/env node
// THE FIRST PROMPT CONTEXT LEAVES ROOM (lane prompt-budget, B-2aad, 2.369.227). mirror-green-223 measured 9 278 B of the
// 9 600 B cap on a no-task session's first fetch — the tools intro alone ≈ 8 KB — and one of 4 pending notices waited a
// prompt. The intro became ONE pointer line per surface + the rules every session needs; the teaching moved to the
// manuals `vibespace-docs <topic>` serves. Legs: ① the census (scripts/measure-prompt-context.mjs) printed, bytes per
// block; ② the intro ≤ 4 096 B in every variant; ③ every shape with 4 notices + a 1 KB stash entry fits whole with
// ≥ 1 KB room, the three-group shape ≤ 7 KB; ④ every pointer names a topic vibespace-docs serves, every surface has
// one; ⑤ every line the cut dropped is in its manual and not in the intro; ⑥ CONTROL: the dropped lines put back ⇒
// the same judge is red. Run: node scripts/test-prompt-budget.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { census, print, INTRO_MAX, FIRST_PROMPT_MAX, ROOM_MIN } from './measure-prompt-context.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AR = require(path.join(REPO, 'src/agent-routes.js'));
const { TaskGroupManager } = require(path.join(REPO, 'src/task-groups.js'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
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
ok(c.shapes.length === 3 && c.shapes.every((s) => s.blocks.every(([, b]) => b > 0)), 'three shapes, every block rendered (non-vacuous)');

console.log('— ② the tools intro ≤ 4 096 B in every variant');
const T = { status: true, ask: true, task: true, jobs: true };
const set = { attachments: [{ alias: 'personal', isDefault: false, profileId: 'bp-00000001' }, { alias: 'work', isDefault: true, profileId: 'bp-00000002' }] };
const variants = ['D', 'none', 'H'].flatMap((v) => [{ browserVariant: v }, { browserVariant: v, browserSet: set, browserDisplay: { kind: 'none', xvfb: true }, fileTools: AR.fileToolsOf({ backend: 'claude' }) }]);
const sizes = variants.map((f) => B(AR.sessionToolsIntro(T, f)));
ok(Math.max(...sizes) <= INTRO_MAX, `the widest intro is ${Math.max(...sizes)} B (≤ ${INTRO_MAX}; ${sizes.join(' / ')})`);

console.log('— ③ room beside 4 notices + a 1 KB stash entry');
const bad = judge(c);
ok(bad.length === 0, `every shape fits whole with ≥ ${ROOM_MIN} B room, three groups ≤ ${FIRST_PROMPT_MAX} B${bad.length ? ' — ' + bad.join('; ') : ''}`);

console.log('— ④ every pointer names a served manual; every surface has one');
const intro = AR.sessionToolsIntro(T, { browserVariant: 'D' });
const section = TaskGroupManager.prototype._toolsSectionParts.call({}, '', false, T).join('\n');
const pointers = [...(intro + '\n' + section).matchAll(/vibespace-docs ([a-z]+)/g)].map((m) => m[1]);
const topics = Object.keys(AR.AGENT_DOC_TOPICS || {});
ok(topics.length >= 10 && pointers.length >= 10 && pointers.every((t) => topics.includes(t)), `${pointers.length} pointers, each a topic vibespace-docs serves (${[...new Set(pointers)].join(' ')})`);
const surfaces = ['status', 'ask', 'jobs', 'msg', 'browser', 'window', 'design', 'pages', 'exit', 'task'];
ok(surfaces.every((t) => pointers.includes(t)), `every surface has its pointer (${surfaces.filter((t) => !pointers.includes(t)).join(' ') || 'none missing'})`);
ok(['status', 'ask', 'jobs', 'msg', 'task'].every((t) => new RegExp('vibespace-docs ' + t).test(section)), 'the group Reporting-back section points at task / status / ask / jobs / msg');

console.log('— ⑤ every dropped line lives in its manual');
const FX = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/prompt-budget-moved.json'), 'utf-8'));
const manual = (t) => [].concat(AR.AGENT_DOC_TOPICS[t]).map((f) => fs.readFileSync(path.join(REPO, 'docs/agent', f), 'utf-8')).join('\n');
const lost = FX.moved.filter((m) => !norm(manual(m.topic)).includes(m.text));
ok(FX.moved.length >= 30 && lost.length === 0, `${FX.moved.length} dropped lines, each found in its manual${lost.length ? ' — missing: ' + lost.map((m) => `${m.topic}: ${m.text.slice(0, 60)}`).join(' | ') : ''}`);
const allIntros = norm(variants.map((f) => AR.sessionToolsIntro(T, f)).join('\n') + '\n' + section);
ok(FX.moved.every((m) => !allIntros.includes(m.text)), 'none of them rides the intro or the section any more');

console.log('— ⑥ CONTROL: the intro\'s dropped lines put back ⇒ the judge is red');
const restored = (Tx, f) => AR.sessionToolsIntro(Tx, f).replace('\n</vibespace-session-tools>', '\n' + FX.moved.filter((m) => m.from === 'intro').map((m) => m.text).join('\n') + '\n</vibespace-session-tools>');
const cc = census({ intro: restored });
const cbad = judge(cc);
ok(cc.introBytes > INTRO_MAX && cbad.some((b) => /^no Task Group/.test(b)), `the old-size intro (${cc.introBytes} B) fails the same judge: ${cbad.join('; ')}`);

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
