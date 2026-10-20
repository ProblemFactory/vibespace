'use strict';
// THE AGENT CLI REGISTRY (lane cli-registry, the owner 2026-10-18: "我们vibespace提供的工具本质都是cli，那应该直接维护一个
// vibespace cli工具列表…最顶级的工具列表和简述，做好总长度的限制和测试避免context注入过长。因为是single source of truth，也好
// 维护一些"). ONE row per agent CLI VibeSpace puts on PATH: its name, its manual topic, a one-line summary (≤ 140 B, the
// index's column), the manual file(s) under docs/agent, the teaching gate, and the copy-ready teaching each injected
// surface carries. Every surface that lists the tools renders from these rows:
//   · renderSessionStartTools — the Task-Group SessionStart "Reporting back" section (task-groups _toolsSectionParts adds
//     its trailer: the absolute-paths + Artifacts line, which teaches no CLI);
//   · renderReminderLine — the per-turn reminder's standard line (agent-routes perTurnToolsLine);
//   · renderIndex — the table `vibespace-docs` with no argument prints (docs/agent/index-manual.md's generated block);
//   · AGENT_DOC_TOPICS — topic → manual file(s), what `GET /api/agent/docs/:topic` serves.
// `gate` is a NAME the hook already evaluates, never a function into the server: status / ask / task / jobs = the
// per-feature toggles, channels = the session's reach word ('read' | 'request' — lane channels-teach), always. A closed
// gate OMITS the row from every surface (2.211.0: teaching a command whose endpoint refuses trains dead ends). A row with
// `teach: null` is INDEX-ONLY: named in the docs pointer and the index, never injected. Row order = every surface's order.
// scripts/test-cli-registry.mjs holds the census (every bin has a row or an EXCLUDED reason), the caps and the renders.
// PURE: imports nothing.

/** lane channels-teach: the SessionStart paragraph by REACH ('read': it may read at least one conversation the user
 *  connected; 'request': it may only ask for some) — docs/agent/channels-manual.md "When to look here" carries the rest */
const CHANNELS_SECTION_LINES = Object.freeze({
  read: 'What the user connected — mail, chats, threads — you may read here: `vibespace-channels list` (what you may read), `vibespace-channels search "<words>"` (across everything you can see), `vibespace-channels read <conv>`; `reply` only PROPOSES (the user approves). A question about people, mail, deals or chats: look here BEFORE any other connector or file. Manual: `vibespace-docs channels`.',
  request: 'The user connected mail, chats and threads you may ASK to read: `vibespace-channels list --all` names them, `vibespace-channels request <conv> "why"` files the ask (the user approves). A question about people, mail, deals or chats: ask here BEFORE any other connector or file. Manual: `vibespace-docs channels`.',
});
/** lane channels-teach: the reminder's segment by reach (each ≤ 120 B — test-channels-teach) */
const CHANNELS_REMINDER_SEG = Object.freeze({
  read: 'vibespace-channels list|search "words"|read <conv> — the mail and chats the user connected; look there first',
  request: 'vibespace-channels list --all|request <conv> "why" — the mail and chats the user connected, yours to ask for',
});
const channelsByReach = (map, reach) => map[reach === 'request' ? 'request' : 'read'];

const GATES = Object.freeze(['status', 'ask', 'task', 'jobs', 'channels', 'always']);
/** the byte caps test-cli-registry holds the rendered teaching to (every gate open, the widest shape; RED past them):
 *  · sessionStart — the section with its trailer, measured 2 561 B (three groups, read reach) + the 164 B test-prompt-budget
 *    ③ leaves that shape under its 7 168 B: a paragraph past it is the budget's red too, named here first; lane
 *    agent-feedback's paragraph took 154 B of that room (2 715 B — 10 B left: the next paragraph cuts another);
 *  · reminder — the bare line, measured 1 077 B (a manager, several groups, read reach) + room for ONE more segment the size
 *    of the channels one (113 B): the next taught row pays for itself or cuts another — lane agent-feedback's segment and
 *    its `feedback` pointer topic took 101 B (1 178 B — 22 B left);
 *  · summary — one index cell. */
const CAPS = Object.freeze({ summary: 140, sessionStart: 2725, reminder: 1200 });

// ctx: sessionStart { g: the `--group <id> ` prefix ('' single-group), multi, reach } · reminder { multi, reach, topics }
const ROWS = Object.freeze([
  {
    name: 'vibespace-status', topic: 'status', manual: 'status-manual.md', gate: 'status',
    summary: 'your session\'s LIVE state on the user\'s board (working / needs-input / blocked / review / done), set the moment it changes',
    teach: {
      sessionStart: () => 'Your live state on the board, the MOMENT it changes: `vibespace-status working|review|done`; a waiting state needs both flags — `vibespace-status blocked --reason "what you\'re waiting on" --detail "options + your recommendation" --urgency high` (or needs-input). Manual: `vibespace-docs status`.',
      reminder: () => 'vibespace-status <state> — keep your board state honest',
    },
  },
  {
    name: 'vibespace-ask', topic: 'ask', manual: 'ask-manual.md', gate: 'ask',
    summary: 'file what the USER must act on into their For you tray (bottom right, never "your inbox"); resolve it when they answer',
    teach: {
      sessionStart: () => 'Asking the user anything / ending a turn waiting on them: ALSO file it in their For you tray (bottom right of their screen: say that, never "your inbox") — `vibespace-ask "the question" --detail "options + your recommendation"` — AND write the full question in your CHAT REPLY; `vibespace-ask resolve <id>` the moment they answer. Manual: `vibespace-docs ask`.',
      reminder: () => 'vibespace-ask "q" [--artifact <path|/p/id>…] — MIRROR every chat question into their For you tray (bottom right of their screen — name it that way, never "your inbox"; the FULL content still goes in your chat reply — the tray is only the notification), and resolve <id|text> the moment they answer',
    },
  },
  {
    name: 'vibespace-task', topic: 'task', manual: 'task-manual.md', gate: 'task',
    summary: 'the Task Group\'s memory: log finished work (progress), park deferred items (backlog), read the group\'s shared state',
    teach: {
      sessionStart: ({ g }) => `After each meaningful piece of work, log it for the group: \`vibespace-task ${g}progress "one-line summary" --detail "specifics other agents may need"\`. The user DEFERS something ('later') → park it: \`vibespace-task ${g}backlog-add "item" --detail "context"\` (non-immediate items only, never started unasked; \`backlog\` lists, \`backlog-claim <id>\` takes one). Manual: \`vibespace-docs task\`.`,
      reminder: ({ multi }) => `vibespace-task ${multi ? '--group <id> ' : ''}progress "summary" — log finished work`,
    },
  },
  {
    name: 'vibespace-job', topic: 'jobs', manual: 'background-work-manual.md', gate: 'jobs',
    summary: 'background work that OUTLIVES this conversation (a service, a long run, a schedule); you are notified when it ends',
    teach: {
      sessionStart: () => 'Work that must OUTLIVE this conversation (a server, a monitor, a batch, a schedule) — never nohup/systemd/harness-cron: `vibespace-job run "<cmd>" --name <name> --context "<what your future self needs>"`, later `vibespace-job poll <id>`. Manual: `vibespace-docs jobs`.',
      reminder: () => 'vibespace-job run "cmd" --name x --context "brief" — background work that must OUTLIVE this conversation (auto-notifies you on completion; poll/show/subscribe/announce; full manual: vibespace-job docs)',
    },
  },
  {
    name: 'vibespace-channels', topic: 'channels', manual: 'channels-manual.md', gate: 'channels',
    summary: 'the mail, chats and threads the user connected and lets you see: list, search, read; a reply is a proposal the user approves',
    teach: {
      sessionStart: ({ reach }) => channelsByReach(CHANNELS_SECTION_LINES, reach),
      reminder: ({ reach }) => channelsByReach(CHANNELS_REMINDER_SEG, reach),
    },
  },
  {
    name: 'vibespace-msg', topic: 'msg', manual: 'msg-manual.md', gate: 'always',
    summary: 'message other agent sessions in explicit groups (a direct message = a two-member group); next turn is free, a wake is billed',
    teach: {
      // AGENT GROUPS (design §22): ONE pointer line — the manual carries the rest
      sessionStart: () => 'Other agents: `vibespace-msg send <agent|group> "…"` reaches them on THEIR next turn at no cost (`--wake` or an @name = a billed turn now); `vibespace-msg group create <name> <member…>` makes a group; group news arrives here on your next turn. Manual: `vibespace-docs msg`.',
      reminder: null,
    },
  },
  {
    // lane agent-feedback (the owner 2026-10-18: "能不能让他们通过某个指令直接给你 feedback…"): ONE line each surface; the manual
    // carries the rest. The paragraph is paid from the section's room (2 561 → 2 715 B of 2 725), the segment from the reminder's.
    name: 'vibespace-feedback', topic: 'feedback', manual: 'feedback-manual.md', gate: 'always',
    summary: 'tell the maintainers what felt wrong (a command, a flow, a screen, a manual); the user reads every report in the ⚙ menu',
    teach: {
      sessionStart: () => 'A tool or flow felt wrong, missing or surprising → `vibespace-feedback "what, and where" --about <tool>` — one line; the maintainers read every one.',
      reminder: () => 'vibespace-feedback "what, and where" — a tool or flow felt wrong? tell the maintainers',
    },
  },
  {
    name: 'vibespace-page', topic: 'pages', manual: 'pages-manual.md', gate: 'always', teach: null,
    summary: 'host a self-contained HTML page on this VibeSpace behind a share link (a design the user asked for: vibespace-design)',
  },
  {
    name: 'vibespace-design', topic: 'design', manual: ['design-manual.md', 'design-skill.md'], gate: 'always', teach: null,
    summary: 'designs, mockups, screens: HTML artboards the user watches live in the Design window; its manual carries the craft rules',
  },
  {
    name: 'vibespace-exit', topic: 'exit', manual: 'exit-manual.md', gate: 'always', teach: null,
    summary: 'borrow a paired machine\'s network for one command, or run a command ON it: only machines the user opened to you',
  },
  {
    name: 'vibespace-remote', topic: 'remote', manual: 'remote-manual.md', gate: 'always', teach: null,
    summary: 'what this VibeSpace did on its paired machines because YOU asked: each act, its verdict, who asked',
  },
  {
    name: 'vibespace-window', topic: 'window', manual: 'window-manual.md', gate: 'always', teach: null,
    summary: 'a NATIVE app window the user shared with you (or you opened) as a target: accessibility tree + @refs, or pixels',
  },
  {
    name: 'vibespace-browser', topic: 'browser', manual: 'browser-manual.md', gate: 'always', teach: null,
    summary: 'THE browser tool: open / snapshot / click @ref / fill in THIS conversation\'s own browser, shown live to the user',
  },
  {
    name: 'vibespace-app', topic: 'apps', aliases: ['app'], manual: 'apps-manual.md', gate: 'always', teach: null,
    summary: 'apps that survive the machine\'s rebuild: search, then PROPOSE an install or a removal (the user installs)',
  },
  {
    // lane vault-e2e-password: the vault's state and its lock (unlock is never an agent's) — INDEX-ONLY: a locked vault says
    // itself in every refusal (`vault_locked`), so no injected surface pays for it; lane vault-locked-refusal-notice: and that
    // refusal says the user was already told (src/vault-blocked.js agentWords) — the summary says it too
    name: 'vibespace-vault', topic: 'vault', manual: 'vault-manual.md', gate: 'always', teach: null,
    summary: 'the vault that seals every stored credential: its state, lock it now (locked ⇒ the user is told; never ask them to unlock)',
  },
  {
    // design q-046 (lane automation-keys-core): VibeSpace's own automation API — INDEX-ONLY (a call with no grant asks the
    // user by itself; every refusal names its code), so no injected surface pays for it
    name: 'vibespace-api', topic: 'api', manual: 'automation-manual.md', gate: 'always', teach: null,
    summary: 'VibeSpace\'s own automation verbs (rename a conversation, …) through keys the user GRANTED this conversation — never a key\'s value',
  },
  {
    name: 'vibespace-docs', topic: 'index', manual: 'index-manual.md', gate: 'always',
    summary: 'this list; `vibespace-docs <topic>` prints one tool\'s full manual, always matching the running server',
    teach: {
      sessionStart: null,   // the section's header names it
      reminder: ({ topics }) => `vibespace-docs [${topics.join('|')}] — the full manual for any of these tools`,
    },
  },
]);

/** a gate NAME read against the hook's flags (`T` = the session's tools: the toggles + `channels`, its reach word) */
function gateOpen(gate, T) {
  if (gate === 'always') return true;
  return !!(T && T[gate]);
}
const teachOf = (row, surface) => (row.teach && typeof row.teach[surface] === 'function' ? row.teach[surface] : null);

/** THE SESSIONSTART TOOLS SECTION (lines; the caller joins them): the header — its count = the paragraphs that rendered —
 *  then one copy-ready paragraph per open row. Every toggle and the reach closed ⇒ [] (2.211.0: nothing taught; the msg
 *  pointer never rides alone — test-msg-cli-groups). `gid` = the --group prefix agents must use ('' single-group; the
 *  generic '--group <id> ' in the shared multi-group section). */
function renderSessionStartTools(T, { gid = '', multi = false } = {}, rows = ROWS) {
  const F = T || { status: true, ask: true, task: true, jobs: true };
  const ctx = { g: gid || '', multi: !!multi, reach: F.channels || false };
  const on = rows.map((r) => ({ r, fn: teachOf(r, 'sessionStart') })).filter((x) => x.fn && gateOpen(x.r.gate, F))
    .map((x) => ({ r: x.r, text: x.fn(ctx) })).filter((x) => x.text);
  if (!on.some((x) => x.r.gate !== 'always')) return [];
  const n = on.length;
  const out = ['', `### Reporting back — ${n > 1 ? n + ' CLIs' : 'one CLI'} on your PATH (run ${n > 1 ? 'any' : 'it'} with no args for full usage; \`vibespace-docs <topic>\` = the full manual)`, '',
    multi
      ? (F.task
        ? `You belong to MORE THAN ONE Task Group; pass \`--group <id>\` to \`vibespace-task\` (each block below names its id).${(F.status || F.ask) ? ` \`${[F.status && 'vibespace-status', F.ask && 'vibespace-ask'].filter(Boolean).join('`/`')}\` always mean${F.status && F.ask ? '' : 's'} THIS session.` : ''}`
        : 'These are bound to THIS session.')
      : 'They\'re bound to THIS session — you never pass a group id.'];
  for (const x of on) out.push('', x.text);
  return out;
}

/** the topics the docs pointer names: every open row's, in row order (the index row itself is `vibespace-docs` alone) */
function pointerTopics(T, rows = ROWS) {
  return rows.filter((r) => r.topic !== 'index' && gateOpen(r.gate, T || {})).map((r) => r.topic);
}

/** THE PER-TURN REMINDER's standard line (2.78.0): one segment per open row that teaches one, the docs pointer, and — for
 *  a Group MANAGER session — the clause naming the group verbs of vibespace-task (a mode of that CLI, not a CLI). */
function renderReminderLine(T, { multi = false, manager = false } = {}, rows = ROWS) {
  const F = T || {};
  const ctx = { multi: !!multi, reach: F.channels || false, topics: pointerTopics(F, rows) };
  const segs = rows.map((r) => ({ r, fn: teachOf(r, 'reminder') })).filter((x) => x.fn && gateOpen(x.r.gate, F))
    .map((x) => x.fn(ctx)).filter(Boolean);
  const mgrClause = manager ? ' · you are a Group MANAGER: `vibespace-task group-list` + group-create/-update/-bind organize ALL groups (any verb takes --group <id>)' : '';
  return `Tools on PATH: ${segs.join(' · ')}${mgrClause}. Run any with no args for usage.`;
}

/** THE INDEX (`vibespace-docs` with no argument): the table of every row + the usage line. docs/agent/index-manual.md
 *  carries it between INDEX_MARKS (test-cli-registry: the committed block equals this render; --write-index rewrites it). */
const INDEX_MARKS = Object.freeze({
  open: '<!-- cli-registry:index — generated from src/agent-cli-registry.js renderIndex(); edit the rows, then run node scripts/test-cli-registry.mjs --write-index -->',
  close: '<!-- /cli-registry:index -->',
});
function renderIndex(rows = ROWS) {
  const cell = (s) => String(s).replace(/\|/g, '\\|');
  const L = ['| Topic | Tool | One line | Full manual |', '|---|---|---|---|'];
  for (const r of rows) L.push(`| \`${r.topic}\` | \`${r.name}\` | ${cell(r.summary)} | \`vibespace-docs${r.topic === 'index' ? '' : ' ' + r.topic}\` |`);
  const aliases = rows.flatMap((r) => (r.aliases || []).map((a) => `\`${a}\` = \`${r.topic}\``));
  L.push('', `\`vibespace-docs <topic>\` prints one manual${aliases.length ? ` (${aliases.join(', ')})` : ''}; \`vibespace-docs\` alone prints this index. Every tool prints its own usage when run with no arguments.`);
  return L.join('\n');
}

/** topic → manual file(s) under docs/agent, aliases included — what `vibespace-docs <topic>` serves */
const AGENT_DOC_TOPICS = Object.freeze(Object.fromEntries(ROWS.flatMap((r) => [[r.topic, r.manual], ...(r.aliases || []).map((a) => [a, r.manual])])));

module.exports = { ROWS, GATES, CAPS, CHANNELS_SECTION_LINES, CHANNELS_REMINDER_SEG, AGENT_DOC_TOPICS, INDEX_MARKS, gateOpen, pointerTopics, renderSessionStartTools, renderReminderLine, renderIndex };
