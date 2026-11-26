'use strict';
// THE WORDS OF THE DECLARED HARNESS SETTINGS TABLES (B-82b8, 主开发 r654). Every word a PERSON reads about a built-in harness
// setting — its category, label, description, option labels and the apply note (`how`) — lives HERE, keyed by the row's own
// name; src/harness-settings.js keeps what a machine acts on (keys, types, defaults, options' values, the apply road). The
// device agent's bundle never loads this module (test-architecture §107 holds it out of the bundle's inputs): those words are
// shown only by the hub's Settings window. PURE, CJS — the harness-settings.js pattern: the browser's settings-schema.js and the
// hub's conversation-ops.js JOIN a table to its words (`withWords`) and read the joined table as the one table it always was.
// ONE TABLE OWNS EACH FACT: a row's words are found by `HARNESS_SETTINGS_WORDS[prefix].rows[key]`; a row with no words, or words
// with no row, is RED by name (`wordsCensus`, judged by scripts/test-harness-contract.mjs) — never a blank on the Settings screen.
// A CONTRIBUTED harness's table (it arrives on /api/home) carries its words inline, as before; `withWords(table)` of a table this
// module has no words for returns it as it is.
//
// `t` below is only the EXTRACTION MARKER (English-string-as-key): the client re-wraps every label/description/option label
// with the real t() when it derives the schema rows; a `how` in prose is a dictionary entry too (src/lib/cli-config-chips.js
// applyHead: t(how)), a flag, an env name or a file's name has none and stays literal.
const t = (s) => s;

const HARNESS_SETTINGS_WORDS = {
  claude: {
    category: t('Claude'),
    rows: {
      outputStyle: {
        label: t("Default output style (Claude)"),
        description: t("The CLI output style new chat sessions start with. \"Concise\" makes Claude lead with results and skip preamble. Blank = the CLI's own default. A stream-json session cannot switch style mid-conversation, so a change takes effect on the next resume; the chat status bar sets it per session."),
        how: '--settings outputStyle',
        options: { [""]: t("CLI default"), ["Concise"]: "Concise", ["Explanatory"]: "Explanatory", ["Learning"]: "Learning", ["Proactive"]: "Proactive" },
      },
      defaultModel: {
        label: t("Default model"),
        description: t("Select an alias or choose \"Custom...\" to type a specific model ID (e.g. claude-opus-4-6-20250414). Applies to NEW sessions: a resumed conversation keeps the model the Claude CLI recorded for it (a transcript names the model that served a turn but never its 1M-context variant, so VibeSpace commands none) — set one for a specific conversation under Session parameters on its card."),
        how: '--model',
        options: { [""]: t("Default"), ["fable"]: "fable (latest, 200k)", ["fable[1m]"]: "fable[1m] (latest, 1M context)", ["opus"]: "opus (latest, 200k)", ["opus[1m]"]: "opus[1m] (latest, 1M context)", ["sonnet"]: "sonnet (latest)", ["sonnet[1m]"]: "sonnet[1m] (latest, 1M context)", ["haiku"]: "haiku (latest)" },
      },
      defaultPermissionMode: {
        label: t("Default permission mode"),
        description: t("Default Claude permission mode for new or resumed Claude sessions."),
        how: '--permission-mode',
        options: { [""]: t("Default"), ["auto"]: t("Auto"), ["bypassPermissions"]: t("Bypass"), ["plan"]: t("Plan"), ["acceptEdits"]: t("Accept Edits") },
      },
      defaultEffort: {
        label: t("Default effort level"),
        description: t("Select a level or choose \"Custom...\" to type any value (e.g. xhigh). Applies to NEW sessions: nothing Claude writes records the effort a turn ran at, so a resume commands none and the CLI’s own config decides — set one for a specific conversation under Session parameters on its card."),
        how: '--effort',
        options: { [""]: t("Auto (model default)"), ["low"]: t("Low"), ["medium"]: t("Medium"), ["high"]: t("High"), ["max"]: t("Max") },
      },
      defaultExtraArgs: {
        label: t("Default extra args"),
        description: t("Extra Claude CLI args appended when starting a Claude session."),
        how: t("added at the end of the command that starts the agent"),
      },
      disableModelFallback: {
        label: t("Disable model fallback"),
        description: t("When safeguards flag a message, pause the turn instead of automatically switching to another model (the CLI's \"Switch models when a message is flagged\" set to off). Applies to new sessions at start and to running chat sessions from their next turn; sessions started while enabled also cover their subagents. A stopped turn shows a notice — rephrase and resend to continue."),
        how: '--settings switchModelsOnFlag=false + CLAUDE_CODE_DISABLE_REFUSAL_FALLBACK',
      },
      autoContinueAtUsageLimit: {
        label: t("Let Claude Code continue by itself at a usage limit"),
        description: t("Claude Code's own wait-and-continue at a usage limit (its autoContinueAtUsageLimit setting). Chat sessions never run it — VibeSpace starts Claude Code non-interactively there, and VibeSpace's own auto-resume (with the unattended-spend ceiling and the account pool) is what continues them, when it is on. In terminal sessions it is the only automatic continue: off (the default) means a terminal session stops at the limit, the limit dialog offers the wait as a choice, and nothing continues it by itself; on leaves Claude Code's own setting alone (its default is on), so terminal sessions continue by themselves at the reset — outside the unattended-spend ceiling. Applies to newly started sessions."),
        how: t("new sessions start without Claude Code's own continue at a usage limit, unless this is on"),
      },
      allowAgentTools: {
        label: t("Let the agent use VibeSpace's own tools without asking"),
        description: t("On: the agent uses VibeSpace’s own tools (its browser, status, inbox and the like) without asking at each step; publishing a page and starting a background command still ask."),
        how: t("VibeSpace's own agent tools run without asking; publishing a page still asks in a mode that asks anyway"),
        details: [t("VibeSpace's own agent tools — its browser (vibespace-browser), status, task, inbox, messages, desktop windows, channels, manuals, and the list of its published pages — run without a permission card for every step, in every permission mode. Only these tools: any other command still asks, and so does the part of a command line that runs something else. Starting a background shell command (vibespace-job run) still asks, because it can run anything, and publishing a page (vibespace-page publish) asks every time, unless the session runs with full access (Never ask), where it runs as it always did. The trade-off: anything the agent can read, it can type or upload into a web page without asking — except an upload from ~/.claude, ~/.ssh, ~/.vibespace, ~/.codex or VibeSpace's account stores, which the browser tool refuses. The browser tool also writes files (a screenshot, a PDF, a download) only under the project directory, /tmp or ~/Downloads — never over your keys, logins or config. Off = every step asks again. Applies to newly started and resumed sessions; nothing is written to your Claude settings file.")], // lane ui-plain-words settings-9: the whole rule, under «详情»
      },
      transcriptRetentionDays: {
        label: t("Keep Claude Code conversations for (days)"),
        description: t("Claude Code deletes conversation transcripts older than this at every start (its own default is 30 days). VibeSpace writes the value into ~/.claude/settings.json (cleanupPeriodDays) at start-up and whenever it changes, and onto remote hosts when their agent tools are installed. 0 = leave Claude Code's own setting alone."),
      },
      brief: {
        label: t("Let the agent send you messages and files (--brief)"),
        description: t("Starts new Claude sessions with the CLI's agent-to-user channel enabled: the agent gets the SendUserMessage and SendUserFile tools and VibeSpace renders each call as a highlighted \"message for you\" card (files are published to a private link in this instance). Off by default because it changes how the agent writes — with --brief, plain text outside the tool is hidden from the message view. Applies to newly started sessions."),
        how: '--brief',
      },
      systemPromptSnapshot: {
        label: t("System prompt snapshot (--system-prompt-snapshot)"),
        description: t("Passes the CLI's --system-prompt-snapshot flag to new Claude sessions: \"on\" records the system prompt once per conversation and reuses it verbatim on every request and resume, which keeps the prompt cache warm across resumes. Blank = leave the CLI's own default alone."),
        how: '--system-prompt-snapshot',
        options: { [""]: t("CLI default"), ["on"]: t("On — record once, reuse verbatim"), ["off"]: t("Off — never record") },
      },
      excludeDynamicSystemPromptSections: {
        label: t("Move per-machine prompt sections into the first message"),
        description: t("Passes --exclude-dynamic-system-prompt-sections: the cwd, environment info, memory paths and git status move out of the system prompt and into the first user message, so the cached prefix is identical across machines and users. Only applies with the default system prompt. Off by default — measure before turning it on."),
        how: '--exclude-dynamic-system-prompt-sections',
      },
      autocompact: {
        label: t("Auto-compact window size (--autocompact)"),
        description: t("Passes --autocompact to new Claude sessions. \"auto\", or a token budget between 100k and 1M (e.g. 500k, 200000). A smaller window compacts sooner, which keeps each request cheaper at the cost of more compaction. Blank = the CLI decides. A value the CLI would reject is ignored rather than passed on."),
        how: '--autocompact',
        options: { [""]: t("CLI default"), ["auto"]: t("Auto"), ["100k"]: "100k", ["200k"]: "200k", ["500k"]: "500k" },
      },
      tuiRenderer: {
        label: t("Terminal TUI renderer"),
        description: t("Renderer for terminal-mode Claude sessions. \"Fullscreen\" forces the flicker-free alternate-screen renderer with virtualized scrollback (CLAUDE_CODE_NO_FLICKER=1, same as /tui fullscreen); \"Classic\" forces the main-screen renderer; \"Auto\" follows the preference saved by the CLI (/tui). Applies to newly started sessions."),
        how: 'CLAUDE_CODE_NO_FLICKER / CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN',
        options: { [""]: t("Auto (CLI preference)"), ["fullscreen"]: t("Fullscreen (flicker-free)"), ["classic"]: t("Classic (main screen)") },
      },
      // 主开发 r4483: what it changes, that the vendor has not said how it treats other names, that the choice and its risk are the
      // person's, no promise of saving, and when a running conversation takes it
      entryLabel: {
        label: t("Entry label of chat conversations (Claude)"),
        description: t("The name this instance's chat conversations report to Anthropic through the Claude CLI on each request, as the place they were started from — one choice for everyone who uses this instance. Off (the default) keeps the CLI's own label. Anthropic has not said how it treats other names: the choice, and any risk in it, are the instance owner's, and nothing is promised about cost or limits. A running conversation takes a change at its next start."),
        details: [
          t("\"vibespace\" reports VibeSpace's name; Custom… reports a name you type. Terminal conversations, and conversations on a third-party provider's account, always keep the CLI's own label."),
          t("A typed name is 1 to 32 characters of a–z, 0–9, _ and -, starting with a letter. Refused: cli (the CLI rewrites it on a chat start), names starting with sdk or remote, the CLI's own names (mcp, claude-vscode, claude-desktop and the others it uses) and local_projects. A refused name passes nothing — the CLI's own label stands, and the line under this setting says why."),
        ],
        placeholder: t("a name, e.g. my-team"),
        how: 'CLAUDE_CODE_ENTRYPOINT',
        options: { ["off"]: t("Off (the CLI's own label)"), ["vibespace"]: "vibespace" },
      },
    },
  },
  codex: {
    category: t('Codex'),
    rows: {
      outputStyle: {
        label: t("Default response style (Codex)"),
        description: t("The personality new Codex chat sessions start with. Blank = leave it to your own ~/.codex/config.toml (this is the default; VibeSpace used to force \"pragmatic\" on every session). Unlike Claude, a running Codex session CAN be re-styled from the chat status bar — it applies from the next turn."),
        how: t("the personality a new Codex conversation starts with"),
        options: { [""]: t("agent default"), ["none"]: "none", ["friendly"]: "friendly", ["pragmatic"]: "pragmatic" },
      },
      limitResetCredit: {
        label: t("Use stored reset credits on a usage limit (Codex)"),
        description: t("ChatGPT plans can hold rate-limit reset credits. A consumed credit starts a NEW window at once: the limit is full again and the next reset moves one full window from now (Claude's web reset works differently — it refills in place and the weekly reset time does not move; Claude Code offers it only as the interactive /limit-reset). Because a re-opened window is worth most right at the limit, VibeSpace judges a credit worth using as soon as a limit is hit — except the last credit with less than a tenth of a window left. A conversation that is mid-turn or whose prompt cache is still warm tries the credit before switching accounts (a switch re-bills the whole context); a cold one switches first and uses a credit only when no pool member can take it. \"Off\" (the default) never spends one by itself; \"Ask\" files one decision in For you per limit; \"Auto\" spends it for you, within the unattended-spend ceiling."),
        how: t("when a Codex conversation reaches its usage limit"),
        options: { ["off"]: t("Off — never spend a reset credit automatically"), ["ask"]: t("Ask — offer it in For you when it is worth it"), ["auto"]: t("Auto — use one when it is worth it (advanced)") },
      },
      defaultModel: {
        label: t("Default model"),
        description: t("Select a known model or choose \"Custom...\" to type a specific model ID. Applies to NEW sessions: a resumed conversation keeps its own value (set one for a specific conversation under Session parameters on its card)."),
        how: '--model',
        options: { [""]: t("Default"), ["gpt-6-astra"]: "gpt-6-astra" },
      },
      defaultPermissionMode: {
        label: t("Default permission mode"),
        description: t("Default Codex permission mode for new or resumed Codex sessions."),
        how: '--permission-mode',
        options: { [""]: t("Default"), ["read-only"]: t("Read Only"), ["safe-yolo"]: t("Safe Yolo"), ["yolo"]: t("Yolo") },
      },
      defaultEffort: {
        label: t("Default effort level"),
        description: t("Default Codex reasoning effort for NEW Codex sessions. A resumed conversation keeps the effort its own last turn ran at; set one for a specific conversation under Session parameters on its card."),
        how: '--effort',
        options: { [""]: t("Auto (model default)"), ["minimal"]: t("Minimal"), ["low"]: t("Low"), ["medium"]: t("Medium"), ["high"]: t("High"), ["xhigh"]: t("XHigh") },
      },
      defaultExtraArgs: {
        label: t("Default extra args"),
        description: t("Extra Codex CLI args appended when starting a Codex session."),
        how: t("added at the end of the command that starts the agent"),
      },
      historyPersistence: {
        label: t('Keep Codex conversations on disk'),
        description: t('Codex records each conversation as a rollout file under ~/.codex/sessions only while [history] persistence is "save-all" (its own default). VibeSpace writes this value into ~/.codex/config.toml (comments and formatting preserved) at start-up and whenever it changes, and onto remote hosts when their agent tools are installed or a session starts there. "None" means Codex writes nothing and this instance shows no history for those sessions.'),
        options: { ['']: t('CLI default (leave config.toml alone)'), ['save-all']: t('Save all — keep every conversation (rollout) on disk'), ['none']: t('None — write no rollouts (history is empty)') },
      },
    },
  },
  opencode: {
    category: t('OpenCode'),
    rows: {
      defaultModel: {
        label: t("Default model"),
        description: t("A model id the agent offers (provider/model, e.g. opencode/big-pickle) — the list fills from the agent once a session has started; empty keeps the agent default. Applies to NEW sessions: a resumed conversation keeps the model OpenCode’s own session record names (that needs the OpenCode background service; without it the default applies and the server log says which rung it used)."),
        how: '--model',
        options: { [""]: t("Default") },
      },
      defaultPermissionMode: {
        label: t("Default permission mode"),
        description: t("Default OpenCode session mode for new sessions: build executes tools per its permission rules, plan disallows edits."),
        how: '--permission-mode',
        options: { [""]: t("Default"), ["build"]: t("Build"), ["plan"]: t("Plan") },
      },
      defaultExtraArgs: {
        label: t("Default extra args"),
        description: t("Extra OpenCode CLI args appended when starting an OpenCode session."),
        how: t("added at the end of the command that starts the agent"),
      },
    },
  },
  antigravity: {
    category: t('Antigravity CLI'),
    rows: {
      defaultModel: {
        label: t("Default model"),
        description: t("The model slug new Antigravity sessions start on (empty keeps Antigravity's own choice). “agy models” lists what your login may use; an unknown slug is refused by name."),
        how: '--model',
        options: { [""]: t("Default"), ["gemini-4-carbon-medium"]: "gemini-4-carbon-medium", ["gemini-4-carbon-high"]: "gemini-4-carbon-high", ["gemini-4-carbon-low"]: "gemini-4-carbon-low", ["gemini-4-argon-high"]: "gemini-4-argon-high", ["gemini-4-argon-medium"]: "gemini-4-argon-medium", ["gemini-3.8-flash-high"]: "gemini-3.8-flash-high", ["gemini-3.8-flash-medium"]: "gemini-3.8-flash-medium" },
      },
      autoUsageReads: {
        label: t("Antigravity usage reads"),
        description: t("Automatically: an account's usage is read once each time one of its conversations hits a usage wall, and once after a stretch of work — when a turn ends and 5 minutes pass with no new turn on the account; that read comes at most once per account per 30 minutes, never during a turn, never for an idle account. Only when I press Re-check: nothing is read by itself. Either way, Re-check in the account's menu reads it: this row decides only the reads that happen by themselves."),
        how: t("when a conversation hits a usage wall, and after a stretch of work"),
        options: { ["on"]: t("Automatically"), ["off"]: t("Only when I press Re-check") },
      },
      defaultEffort: {
        label: t("Default effort"),
        description: t("Reasoning effort for new Antigravity sessions (--effort)."),
        how: '--effort',
        options: { [""]: t("Default"), ["low"]: "low", ["medium"]: "medium", ["high"]: "high", ["xhigh"]: "xhigh", ["max"]: "max" },
      },
      defaultPermissionMode: {
        label: t("Default permission mode"),
        description: t("How a new Antigravity session handles tools that need approval. In a chat, Antigravity cannot ask — a tool it would ask about is skipped and said in the chat; “Never ask” runs everything."),
        how: '--mode · --dangerously-skip-permissions',
        options: { [""]: t("Default"), ["accept-edits"]: t("Edit files freely, ask before commands"), ["auto"]: t("Auto — a safety check decides"), ["plan"]: t("Plan only — read and propose, change nothing"), ["bypassPermissions"]: t("Never ask (full access)") },
      },
      defaultExtraArgs: {
        label: t("Default extra args"),
        description: t("Extra Antigravity CLI args appended when starting an Antigravity session."),
        how: t("added at the end of the command that starts the agent"),
      },
    },
  },};

const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
/** the table joined to its words: the SAME shape the table had before the split (category, label, description, option
 *  labels, apply.how) — a table this module has no words for (a contributed one) comes back as it is */
function withWords(table, words = table && HARNESS_SETTINGS_WORDS[table.prefix]) {
  if (!table || !words || !words.rows) return table;
  return {
    ...table,
    category: own(words, 'category') ? words.category : table.category,
    rows: (table.rows || []).map((r) => {
      const w = own(words.rows, r.key) ? words.rows[r.key] : null;
      if (!w) return r;
      const row = { ...r, ...(own(w, 'label') ? { label: w.label } : {}), ...(own(w, 'description') ? { description: w.description } : {}), ...(own(w, 'details') ? { details: w.details } : {}), ...(own(w, 'placeholder') ? { placeholder: w.placeholder } : {}) };   // placeholder (r4483): the typed field's hint is a person's word too
      if (Array.isArray(r.options)) row.options = r.options.map((o) => (o && own(w.options, o.value) ? { ...o, label: w.options[o.value] } : o));
      if (r.apply && own(w, 'how')) row.apply = { ...r.apply, how: w.how };
      return row;
    }),
  };
}
/** THE CENSUS (PURE): every built-in row has its words — a label, a description, a label for every option value, and the apply
 *  note every spawn / server row shows — and every word has its row, each named. → ['<prefix>.<key>: why', …] ([] = whole) */
function wordsCensus(tables, words = HARNESS_SETTINGS_WORDS) {
  const out = [];
  for (const [id, tbl] of Object.entries(tables || {})) {
    const w = words[id];
    if (!w) { out.push(`${id}: no words for this table`); continue; }
    if (typeof w.category !== 'string' || !w.category) out.push(`${id}: no category`);
    if (own(tbl, 'category')) out.push(`${id}: «category» is still in the device's table`);
    const keys = new Set((tbl.rows || []).map((r) => r.key));
    for (const r of tbl.rows || []) {
      const at = `${tbl.prefix}.${r.key}`, rw = own(w.rows, r.key) ? w.rows[r.key] : null;
      if (!rw) { out.push(`${at}: a row with no words`); continue; }
      if (typeof rw.label !== 'string' || !rw.label) out.push(`${at}: no label`);
      if (typeof rw.description !== 'string') out.push(`${at}: no description`);
      if (own(rw, 'details') && !(Array.isArray(rw.details) && rw.details.every((d) => typeof d === 'string' && d))) out.push(`${at}: details are not a list of words`);
      if (own(rw, 'placeholder') && (typeof rw.placeholder !== 'string' || !rw.placeholder || !r.combobox)) out.push(`${at}: a placeholder is words for a typed field (a combobox row's)`);
      // the device's table keeps NO word of a person's (one table owns each fact — a word left in it is red by name)
      for (const f of ['label', 'description', 'details', 'placeholder']) if (own(r, f)) out.push(`${at}: «${f}» is still in the device's table`);
      if (r.apply && own(r.apply, 'how')) out.push(`${at}: «apply.how» is still in the device's table`);
      if ((r.options || []).some((o) => o && own(o, 'label'))) out.push(`${at}: an option label is still in the device's table`);
      for (const o of Array.isArray(r.options) ? r.options : []) if (!own(rw.options, o.value) || typeof rw.options[o.value] !== 'string') out.push(`${at}: option ${JSON.stringify(o.value)} has no label`);
      for (const v of Object.keys(rw.options || {})) if (!(r.options || []).some((o) => o.value === v)) out.push(`${at}: words for option ${JSON.stringify(v)}, which the row does not have`);
      if (r.apply && (r.apply.kind === 'spawn' || r.apply.kind === 'server') && (typeof rw.how !== 'string' || !rw.how)) out.push(`${at}: no apply note (how)`);
    }
    for (const k of Object.keys(w.rows || {})) if (!keys.has(k)) out.push(`${tbl.prefix}.${k}: words with no row`);
  }
  for (const id of Object.keys(words || {})) if (!own(tables, id)) out.push(`${id}: words for a table that does not exist`);
  return out;
}

module.exports = { HARNESS_SETTINGS_WORDS, withWords, wordsCensus };
