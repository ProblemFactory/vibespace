#!/usr/bin/env node
// THE FIRST PROMPT CONTEXT'S BYTE CENSUS (lane prompt-budget, B-2aad). Renders, with the production renderers, what
// rides an agent's first prompt context in three shapes — a session in no Task Group (the baseline tools intro), one
// group, three groups like the owner's — beside 4 pending browser-profile notices and a 1 KB stashed message, and
// prints the bytes per block. The blocks are joined in the routes' payload order ('\n\n' between parts:
// intro / group context → notices → the stash drain), so the total is what the route would hand the hook before
// capInline. test-prompt-budget imports `census` (its control hands the old intro back in through `intro`).
// lane channels-teach: `channels` ('read' | 'request') renders every block for a session whose REACH teaches
// `vibespace-channels` (the tools section's paragraph), and `reminder` = the per-turn reminder block's bytes (single group /
// multi) — the prompt that carries nothing bigger. Run: node scripts/measure-prompt-context.mjs
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

/** census({ intro, channels }) → { shapes: [{ name, blocks: [[label, bytes]], total, room }], intro, cap, reminder }. `intro(T, facts)`
 *  replaces sessionToolsIntro (the suite's control); every other block is the production renderer's. */
export function census({ intro = null, repo = REPO, channels = false } = {}) {
  // lane agent-context-owner-facts (B-7960 a): the times ride in the owner's zone, named — measured in the incident's zone
  // (America/Los_Angeles), never this box's own (PT here, UTC on a runner: the same shape would measure differently)
  require(path.join(repo, 'src/server/owner-facts.js')).configure({ setting: (k) => (k === 'instance.timezone' ? 'America/Los_Angeles' : undefined) });
  const AR = require(path.join(repo, 'src/agent-routes.js'));
  const { TaskGroupManager } = require(path.join(repo, 'src/task-groups.js'));
  const { SessionStatusManager } = require(path.join(repo, 'src/session-status.js'));
  const BP = require(path.join(repo, 'src/browser-profiles.js'));
  const T = { status: true, ask: true, task: true, jobs: true, ...(channels ? { channels } : {}) };
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
    // the per-turn reminder as the route wraps it (a tree before lane channels-teach has no module-scope line: null)
    const rem = (multi) => (typeof AR.perTurnToolsLine === 'function' ? B(`<vibespace-reminder>${AR.perTurnToolsLine(T, { multi })}</vibespace-reminder>`) : null);
    return { shapes, intro: toolsIntro, introBytes: B(toolsIntro), cap: AR.INLINE_CAP, channels, reminder: { one: rem(false), multi: rem(true) } };
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

/** lane cli-registry: THE TEACHING SHAPES — every surface that teaches the agent CLIs, rendered by the tree's OWN renderers
 *  (the Task-Group section via _toolsSectionParts, the per-turn reminder via perTurnToolsLine as the route wraps it, the
 *  no-group intro) in the shapes a session meets. `repo` may be another tree (a
 *  base copy: its renders are the "before" numbers). test-cli-registry pins each shape's bytes + sha256
 *  (scripts/fixtures/cli-registry-renders.json). */
export function teachingShapes({ repo = REPO } = {}) {
  const AR = require(path.join(repo, 'src/agent-routes.js'));
  const { TaskGroupManager } = require(path.join(repo, 'src/task-groups.js'));
  const fileTools = AR.fileToolsOf({ backend: 'claude' });
  const T4 = { status: true, ask: true, task: true, jobs: true };
  const OFF = { status: false, ask: false, task: false, jobs: false };
  const sec = (T, multi) => TaskGroupManager.prototype._toolsSectionParts.call({}, multi ? '--group <id> ' : '', multi, T, fileTools).join('\n');
  const rem = (T, o) => `<vibespace-reminder>${AR.perTurnToolsLine(T, o)}</vibespace-reminder>`;
  const out = [];
  for (const [label, multi] of [['one group', false], ['three groups', true]]) for (const reach of [false, 'read', 'request']) out.push([`section · ${label}${reach ? ' · ' + reach : ''}`, sec(reach ? { ...T4, channels: reach } : T4, multi)]);
  out.push(['section · status only', sec({ ...OFF, status: true }, false)], ['section · every toggle off', sec(OFF, false)]);
  for (const [label, multi] of [['one group / none', false], ['several groups', true]]) for (const reach of [false, 'read', 'request']) out.push([`reminder · ${label}${reach ? ' · ' + reach : ''}`, rem(reach ? { ...T4, channels: reach } : T4, { multi })]);
  out.push(['reminder · manager · several groups · read', rem({ ...T4, channels: 'read' }, { multi: true, manager: true })], ['reminder · status only', rem({ ...OFF, status: true }, {})], ['reminder · every toggle off', rem({ ...OFF, jobs: false }, {})]);
  out.push(['no-group intro', AR.sessionToolsIntro(T4, { browserVariant: 'D', fileTools })]);
  return out.map(([name, text]) => ({ name, text, bytes: B(text) }));
}

export function print(c, out = console.log) {
  out(`first prompt context census${c.channels ? ` — channels reach: ${c.channels}` : ''} (INLINE_CAP ${c.cap} B; intro ≤ ${INTRO_MAX} B; three groups ≤ ${FIRST_PROMPT_MAX} B with ≥ ${ROOM_MIN} B room)`);
  for (const s of c.shapes) out(`  ${s.name.padEnd(14)} ${String(s.total).padStart(5)} B  room ${String(s.room).padStart(5)} B  — ${s.blocks.map(([l, b]) => `${l} ${b}`).join(' · ')}`);
  if (c.reminder && c.reminder.one !== null) out(`  per-turn reminder ${c.reminder.one} B (one group / none) · ${c.reminder.multi} B (several groups)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { print(census()); print(census({ channels: 'read' })); print(census({ channels: 'request' })); }
