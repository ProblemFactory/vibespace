#!/usr/bin/env node
// THE FIRST PROMPT CONTEXT'S BYTE CENSUS (lane prompt-budget, B-2aad). Renders, with the production renderers, what
// rides an agent's first prompt context in three shapes — a session in no Task Group (the baseline tools intro), one
// group, three groups like the owner's — beside 4 pending browser-profile notices and a 1 KB stashed message, and
// prints the bytes per block. The blocks are joined in the routes' payload order ('\n\n' between parts:
// intro / group context → notices → the stash drain), so the total is what the route would hand the hook before
// capInline. test-prompt-budget imports `census` (its control hands the old intro back in through `intro`).
// Run: node scripts/measure-prompt-context.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const B = (t) => Buffer.byteLength(String(t || ''), 'utf-8');
export const INTRO_MAX = 4096;          // the tools intro, every shape
export const FIRST_PROMPT_MAX = 7168;   // the three-group shape with the 4 notices + the 1 KB stash entry
export const ROOM_MIN = 1024;           // under INLINE_CAP, left for what else rides (the nudge, a jobs update, a report)

/** The 4 notices of mirror-green-223's reading (attach Work, attach Personal, the user's pin, the nudge's switch). */
function fourNotices(BP) {
  const n = (o, i) => ({ ...BP.profileChangeNotice({ ...o, at: 1000 + i }), kind: 'browser-profile' });
  return [
    n({ was: 'ephemeral', now: 'Work', by: 'agent', handles: ['work'] }, 0),
    n({ was: 'Work', now: 'Work, Personal', by: 'agent', handles: ['work', 'personal'] }, 1),
    n({ was: 'ephemeral', now: 'Work', by: 'user', handles: ['work'] }, 2),
    n({ was: 'Personal', now: 'Work', by: 'user', handles: ['work'] }, 3),
  ];
}

/** census({ intro }) → { shapes: [{ name, blocks: [[label, bytes]], total, room }], intro, cap }. `intro(T, facts)`
 *  replaces sessionToolsIntro (the suite's control); every other block is the production renderer's. */
export function census({ intro = null, repo = REPO } = {}) {
  const AR = require(path.join(repo, 'src/agent-routes.js'));
  const { TaskGroupManager } = require(path.join(repo, 'src/task-groups.js'));
  const { SessionStatusManager } = require(path.join(repo, 'src/session-status.js'));
  const BP = require(path.join(repo, 'src/browser-profiles.js'));
  const T = { status: true, ask: true, task: true, jobs: true };
  const fileTools = AR.fileToolsOf({ backend: 'claude' });
  const introOf = intro || AR.sessionToolsIntro;
  const toolsIntro = introOf(T, { browserVariant: 'D', fileTools });
  const notices = SessionStatusManager.renderNotices(fourNotices(BP));
  // ≈ 1 KB of CJK (the owner's briefs are Chinese), under the stash's 400-char line cap
  const stash = AR.renderMsgStash([{ ts: Date.UTC(2026, 9, 6, 18, 0), fromName: 'VibeSpace 主开发', text: '简报：' + '车道读简报并回报最终提交与报告路径。'.repeat(19) }]).text;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-prompt-budget-'));
  try {
    const tasks = new TaskGroupManager({ dataDir: tmp, onChange: () => {} });
    const cwd = path.join(tmp, 'work');
    const ids = ['VibeSpace 车道', 'Home lab', 'Travel 2026'].map((title, i) => {
      const g = tasks.create({ title, objective: `${title}: the work this group exists for, in two sentences. Rules live in the brief; the owner reads the board.`, folders: [path.join(cwd, String(i))] });
      for (let k = 0; k < 3; k++) tasks.addProgress(g.id, { note: `step ${k + 1} of ${title} done`, detail: 'a sha, a report path, the next step' });
      return g.id;
    });
    const groupCtx = (n) => tasks.renderMultiContext(ids.slice(0, n), { tools: T, fileTools });
    const toolsSection = (n) => tasks._toolsSectionParts(n > 1 ? '--group <id> ' : '', n > 1, T, fileTools).join('\n');
    const shape = (name, head, introLabel, introBytes) => {
      const parts = [head, notices, stash];
      const total = B(parts.join('\n\n'));
      return { name, total, room: AR.INLINE_CAP - total, blocks: [[introLabel, introBytes], ...(head === toolsIntro ? [] : [['group content', B(head) - introBytes]]), ['4 notices', B(notices)], ['1 KB stash entry', B(stash)], ['joins', 2 * (parts.length - 1)]] };
    };
    const shapes = [
      shape('no Task Group', toolsIntro, 'tools intro', B(toolsIntro)),
      shape('one group', groupCtx(1), 'tools section', B(toolsSection(1))),
      shape('three groups', groupCtx(3), 'tools section', B(toolsSection(3))),
    ];
    return { shapes, intro: toolsIntro, introBytes: B(toolsIntro), cap: AR.INLINE_CAP };
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

export function print(c, out = console.log) {
  out(`first prompt context census (INLINE_CAP ${c.cap} B; intro ≤ ${INTRO_MAX} B; three groups ≤ ${FIRST_PROMPT_MAX} B with ≥ ${ROOM_MIN} B room)`);
  for (const s of c.shapes) out(`  ${s.name.padEnd(14)} ${String(s.total).padStart(5)} B  room ${String(s.room).padStart(5)} B  — ${s.blocks.map(([l, b]) => `${l} ${b}`).join(' · ')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) print(census());
