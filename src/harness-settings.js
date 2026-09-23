'use strict';
// HARNESS SETTINGS — THE DECLARED TABLES (docs/design-harness-settings.zh.md
// §2, 2026-09-20). PURE: imports nothing, so the SAME file is bundled into the
// browser (settings-schema.js derives its Claude/Codex/OpenCode sections from
// it), required by the server (harnessSetting()/the config plan) and carried
// by the daemon bundle. CJS on purpose — the backend-caps.js pattern.
//
// ONE table per harness: `{ prefix, category, files, rows }`. A ROW is pure
// data (no functions — the table must survive a JSON round trip, because a
// contributed harness sends its table over /api/home). Its persisted settings
// path is `${prefix}.${key}` — EXACTLY today's spelling, so data/settings.json
// needs no migration and an older bundle's tab reads the same key.
//
// `apply` is a CLOSED tagged union (APPLY_KINDS):
//   {kind:'spawn', how, via?, live?, mode?}
//       consumed by adapter.buildSessionArgs — through `opts.settings.<key>`
//       by default, or through the named top-level option field when `via` is
//       set (model/effort/permissionMode/extraArgs/outputStyle ride the resume
//       ladder in ws-create and arrive as explicit fields). `how` is DISPLAY
//       TEXT ONLY: whether the value becomes argv, env or inline --settings JSON
//       is the adapter's business (codex effort is env in chat and `-c` in a
//       terminal — declaring the transport would be a lie). `live` names the
//       adapter VERB the server calls on every running chat session of that
//       harness when the value changes (formatSetFallbackPolicy). `mode`
//       restricts the spawn to one session mode (tuiRenderer: terminal only).
//       test-harness-contract drives EVERY spawn row through the adapter and
//       fails a row nobody consumes.
//   {kind:'server', how}
//       read by VibeSpace at a decision point through harnessSetting(); no
//       applier.
//   {kind:'cli-config', file, path, off, onUninstall}
//       written INTO the harness's own config file (`file` = an id in
//       `files`; `path` = the key path — json: nested keys; toml: [section,key]
//       or [key]). A value that coerces to `off` means "leave the CLI's own
//       value alone" — not written, never deleted. `onUninstall:'keep'` = an
//       agent-tools uninstall never touches it (the retention a user asked for
//       is not "our entry").
//
// `t` below is only the EXTRACTION MARKER (English-string-as-key): the client
// re-wraps every label/description/option label with the real t() when it
// derives the schema rows, so the same key hits the same zh/ja entry.
const t = (s) => s;

const APPLY_KINDS = Object.freeze(['spawn', 'server', 'cli-config']);
const ROW_TYPES = Object.freeze(['boolean', 'number', 'string', 'text', 'enum']);
const FILE_FORMATS = Object.freeze(['json', 'toml']);
const SPAWN_MODES = Object.freeze(['chat', 'terminal']);
const ON_UNINSTALL = Object.freeze(['keep', 'strip']);
const MAX_ROWS = 50;
const KEY_RE = /^[a-zA-Z][a-zA-Z0-9]*$/;
const PREFIX_RE = /^[a-z][a-z0-9-]*$/;
const TOML_BARE_RE = /^[A-Za-z0-9_-]+$/;

// THE KEY IS A LEGACY SPELLING, THE FEATURE IS NOT (owner ruling 2026-09-08):
// auto-resume is generic (every harness that can classify a limit and restart
// a turn), so its instance default is NOT a row of the claude table — it stays
// a hand-written Chat-category row in settings-schema.js under the persisted
// key it has always had (renaming a persisted key is a migration, and every
// per-session override is recorded against this one). The server reads it by
// THIS name so no server file spells a `claude.` literal (test-architecture's
// literal-id census).
const GENERIC_LEGACY_KEYS = Object.freeze({ autoResumeOnLimit: 'claude.autoResumeOnLimit' });

const HARNESS_SETTINGS = {
  claude: {
    prefix: 'claude',
    category: t('Claude'),
    // The CLI config files VibeSpace may WRITE (display facts only here —
    // `rel` under $HOME + format; the descriptor's `configFiles.<id>` object
    // is DERIVED from this entry (harness-config.cliConfigFile) and adds the
    // resolver + createIfMissing, so the path is spelled ONCE).
    files: {
      settings: { rel: ['.claude', 'settings.json'], format: 'json' },
    },
    rows: [
    {
      key: "outputStyle",
      type: "enum", default: "",
      options: [
        { value: "", label: t("CLI default") },
        { value: "Concise", label: "Concise" },
        { value: "Explanatory", label: "Explanatory" },
        { value: "Learning", label: "Learning" },
        { value: "Proactive", label: "Proactive" },
      ],
      label: t("Default output style (Claude)"),
      description: t("The CLI output style new chat sessions start with. \"Concise\" makes Claude lead with results and skip preamble. Blank = the CLI's own default. A stream-json session cannot switch style mid-conversation, so a change takes effect on the next resume; the chat status bar sets it per session."),
      apply: { kind: 'spawn', how: '--settings outputStyle', via: 'outputStyle' },
    },
    {
      key: "defaultModel",
      type: "enum", default: "", combobox: true,
      options: [
        { value: "", label: t("Default") },
        { value: "fable", label: "fable (latest, 200k)" },
        { value: "fable[1m]", label: "fable[1m] (latest, 1M context)" },
        { value: "opus", label: "opus (latest, 200k)" },
        { value: "opus[1m]", label: "opus[1m] (latest, 1M context)" },
        { value: "sonnet", label: "sonnet (latest)" },
        { value: "sonnet[1m]", label: "sonnet[1m] (latest, 1M context)" },
        { value: "haiku", label: "haiku (latest)" },
      ],
      label: t("Default model"),
      description: t("Select an alias or choose \"Custom...\" to type a specific model ID (e.g. claude-opus-4-6-20250414). Applies to NEW sessions: a resumed conversation keeps the model the Claude CLI recorded for it (a transcript names the model that served a turn but never its 1M-context variant, so VibeSpace commands none) — set one for a specific conversation under Session parameters on its card."),
      apply: { kind: 'spawn', how: '--model', via: 'model' },
    },
    {
      key: "defaultPermissionMode",
      type: "enum", default: "",
      options: [
        { value: "", label: t("Default") },
        { value: "auto", label: t("Auto") },
        { value: "bypassPermissions", label: t("Bypass") },
        { value: "plan", label: t("Plan") },
        { value: "acceptEdits", label: t("Accept Edits") },
      ],
      label: t("Default permission mode"),
      description: t("Default Claude permission mode for new or resumed Claude sessions."),
      apply: { kind: 'spawn', how: '--permission-mode', via: 'permissionMode' },
    },
    {
      key: "defaultEffort",
      type: "enum", default: "", combobox: true,
      options: [
        { value: "", label: t("Auto (model default)") },
        { value: "low", label: t("Low") },
        { value: "medium", label: t("Medium") },
        { value: "high", label: t("High") },
        { value: "max", label: t("Max") },
      ],
      label: t("Default effort level"),
      description: t("Select a level or choose \"Custom...\" to type any value (e.g. xhigh). Applies to NEW sessions: nothing Claude writes records the effort a turn ran at, so a resume commands none and the CLI’s own config decides — set one for a specific conversation under Session parameters on its card."),
      apply: { kind: 'spawn', how: '--effort', via: 'effort' },
    },
    {
      key: "defaultExtraArgs",
      type: "text", default: "",
      label: t("Default extra args"),
      description: t("Extra Claude CLI args appended when starting a Claude session."),
      apply: { kind: 'spawn', how: 'appended argv', via: 'extraArgs' },
    },
    {
      key: "disableModelFallback",
      type: "boolean", default: false,
      label: t("Disable model fallback"),
      description: t("When safeguards flag a message, pause the turn instead of automatically switching to another model (the CLI's \"Switch models when a message is flagged\" set to off). Applies to new sessions at start and to running chat sessions from their next turn; sessions started while enabled also cover their subagents. A stopped turn shows a notice — rephrase and resend to continue."),
      apply: { kind: 'spawn', how: '--settings switchModelsOnFlag=false + CLAUDE_CODE_DISABLE_REFUSAL_FALLBACK', live: 'formatSetFallbackPolicy' },
    },
    // CLAUDE CODE'S OWN "WAIT FOR THE RESET, THEN CONTINUE" (owner ruling
    // 2026-09-22). The 2.1.280 binary declares `autoContinueAtUsageLimit` in
    // its settings schema ("When a claude.ai usage limit stops your session,
    // wait for the limit to reset and continue the task automatically. When
    // off, the limit dialog offers the wait as a choice instead.") and reads it
    // from policySettings > flagSettings > userSettings only (`$x`/`D7`, list
    // `["policySettings","flagSettings","userSettings"]`) — so the inline
    // `--settings` JSON IS a real layer for it, and a project/local settings
    // file is not. Absent everywhere ⇒ the CLI treats it as ON
    // (`SWt(e){return jmt()??e==="absent"}`) behind its `tengu_marble_heron`
    // flag — BUT it only ever arms in an INTERACTIVE launch (stdout a TTY):
    // chat sessions (piped stdout on every transport) never run it, so there
    // VibeSpace's auto-resume is the only producer and this row changes
    // nothing; terminal sessions (a real pty) did run it, and it was their
    // ONLY automatic continue. Default OFF = the owner's ruling: the CLI's
    // continue is a turn nobody typed that no spend ceiling bounds, so a
    // terminal session now stops at the wall and waits for the user. The
    // adapter spawns `--settings {"autoContinueAtUsageLimit":false}` on every
    // claude session (a missing settings bag is treated as off too). ON =
    // leave Claude Code's own setting alone (nothing passed).
    {
      key: "autoContinueAtUsageLimit",
      type: "boolean", default: false,
      label: t("Let Claude Code continue by itself at a usage limit"),
      description: t("Claude Code's own wait-and-continue at a usage limit (its autoContinueAtUsageLimit setting). Chat sessions never run it — VibeSpace starts Claude Code non-interactively there, and VibeSpace's own auto-resume (with the unattended-spend ceiling and the account pool) is what continues them, when it is on. In terminal sessions it is the only automatic continue: off (the default) means a terminal session stops at the limit, the limit dialog offers the wait as a choice, and nothing continues it by itself; on leaves Claude Code's own setting alone (its default is on), so terminal sessions continue by themselves at the reset — outside the unattended-spend ceiling. Applies to newly started sessions."),
      apply: { kind: 'spawn', how: '--settings autoContinueAtUsageLimit=false (while off)' },
    },
    {
      key: "transcriptRetentionDays",
      type: "number", default: 36500, min: 0, max: 36500, step: 30,
      label: t("Keep Claude Code conversations for (days)"),
      description: t("Claude Code deletes conversation transcripts older than this at every start (its own default is 30 days). VibeSpace writes the value into ~/.claude/settings.json (cleanupPeriodDays) at start-up and whenever it changes, and onto remote hosts when their agent tools are installed. 0 = leave Claude Code's own setting alone."),
      apply: { kind: 'cli-config', file: 'settings', path: ['cleanupPeriodDays'], off: 0, onUninstall: 'keep' },
    },
    {
      key: "brief",
      type: "boolean", default: false,
      label: t("Let the agent send you messages and files (--brief)"),
      description: t("Starts new Claude sessions with the CLI's agent-to-user channel enabled: the agent gets the SendUserMessage and SendUserFile tools and VibeSpace renders each call as a highlighted \"message for you\" card (files are published to a private link in this instance). Off by default because it changes how the agent writes — with --brief, plain text outside the tool is hidden from the message view. Applies to newly started sessions."),
      apply: { kind: 'spawn', how: '--brief' },
    },
    {
      key: "systemPromptSnapshot",
      type: "enum", default: "",
      options: [
        { value: "", label: t("CLI default") },
        { value: "on", label: t("On — record once, reuse verbatim") },
        { value: "off", label: t("Off — never record") },
      ],
      label: t("System prompt snapshot (--system-prompt-snapshot)"),
      description: t("Passes the CLI's --system-prompt-snapshot flag to new Claude sessions: \"on\" records the system prompt once per conversation and reuses it verbatim on every request and resume, which keeps the prompt cache warm across resumes. Blank = leave the CLI's own default alone."),
      apply: { kind: 'spawn', how: '--system-prompt-snapshot' },
    },
    {
      key: "excludeDynamicSystemPromptSections",
      type: "boolean", default: false,
      label: t("Move per-machine prompt sections into the first message"),
      description: t("Passes --exclude-dynamic-system-prompt-sections: the cwd, environment info, memory paths and git status move out of the system prompt and into the first user message, so the cached prefix is identical across machines and users. Only applies with the default system prompt. Off by default — measure before turning it on."),
      apply: { kind: 'spawn', how: '--exclude-dynamic-system-prompt-sections' },
    },
    {
      key: "autocompact",
      type: "enum", default: "", combobox: true,
      options: [
        { value: "", label: t("CLI default") },
        { value: "auto", label: t("Auto") },
        { value: "100k", label: "100k" },
        { value: "200k", label: "200k" },
        { value: "500k", label: "500k" },
      ],
      label: t("Auto-compact window size (--autocompact)"),
      description: t("Passes --autocompact to new Claude sessions. \"auto\", or a token budget between 100k and 1M (e.g. 500k, 200000). A smaller window compacts sooner, which keeps each request cheaper at the cost of more compaction. Blank = the CLI decides. A value the CLI would reject is ignored rather than passed on."),
      apply: { kind: 'spawn', how: '--autocompact' },
    },
    {
      key: "tuiRenderer",
      type: "enum", default: "",
      options: [
        { value: "", label: t("Auto (CLI preference)") },
        { value: "fullscreen", label: t("Fullscreen (flicker-free)") },
        { value: "classic", label: t("Classic (main screen)") },
      ],
      label: t("Terminal TUI renderer"),
      description: t("Renderer for terminal-mode Claude sessions. \"Fullscreen\" forces the flicker-free alternate-screen renderer with virtualized scrollback (CLAUDE_CODE_NO_FLICKER=1, same as /tui fullscreen); \"Classic\" forces the main-screen renderer; \"Auto\" follows the preference saved by the CLI (/tui). Applies to newly started sessions."),
      apply: { kind: 'spawn', how: 'CLAUDE_CODE_NO_FLICKER / CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN', mode: 'terminal' },
    },
    ],
  },
  codex: {
    prefix: 'codex',
    category: t('Codex'),
    files: {
      hooks: { rel: ['.codex', 'hooks.json'], format: 'json' },
      // ~/.codex/config.toml — WRITABLE since 2.369.123 (owner D4: build the
      // TOML writer now) through the comment-and-format-preserving minimal
      // setter in src/harness-config.js (set/replace one `key = value` under a
      // `[section]`, or the dotted `section.key = value` spelling when the file
      // already uses it; refuses by name inline tables, arrays of tables,
      // multi-line strings and anything its conservative tokenizer cannot read).
      config: { rel: ['.codex', 'config.toml'], format: 'toml' },
    },
    rows: [
    {
      key: "outputStyle",
      type: "enum", default: "",
      options: [
        { value: "", label: t("agent default") },
        { value: "none", label: "none" },
        { value: "friendly", label: "friendly" },
        { value: "pragmatic", label: "pragmatic" },
      ],
      label: t("Default response style (Codex)"),
      description: t("The personality new Codex chat sessions start with. Blank = leave it to your own ~/.codex/config.toml (this is the default; VibeSpace used to force \"pragmatic\" on every session). Unlike Claude, a running Codex session CAN be re-styled from the chat status bar — it applies from the next turn."),
      apply: { kind: 'spawn', how: 'CODEX_WEBUI_PERSONALITY (the wrapper\'s thread personality)', via: 'outputStyle' },
    },
    {
      key: "limitResetCredit",
      type: "enum", default: "off",
      // THREE MODES (docs/design-reset-credits.zh.md §3, owner 2026-09-22):
      // automatic consumption is NEVER the default. `ask` files ONE For-you
      // decision per limit event when the verdict (src/reset-credit.js) says a
      // credit is worth it; `auto` consumes it through the spend ceiling. WHEN
      // is the pure verdict's call and the ladder forks by warmth (a warm
      // conversation tries the credit before a pool switch, a cold one after).
      // The claude table has NO such row: Claude Code offers only the
      // interactive /limit-reset, and this table cannot express a declared-but-
      // disabled row (a row here is a working control — the "only working
      // code" settings law).
      options: [
        { value: "off", label: t("Off — never spend a reset credit automatically") },
        { value: "ask", label: t("Ask — offer it in For you when it is worth it") },
        { value: "auto", label: t("Auto — use one when it is worth it (advanced)") },
      ],
      label: t("Use stored reset credits on a usage limit (Codex)"),
      description: t("ChatGPT plans can hold rate-limit reset credits. A consumed credit starts a NEW window at once: the limit is full again and the next reset moves one full window from now (Claude's web reset works differently — it refills in place and the weekly reset time does not move; Claude Code offers it only as the interactive /limit-reset). Because a re-opened window is worth most right at the limit, VibeSpace judges a credit worth using as soon as a limit is hit — except the last credit with less than a tenth of a window left. A conversation that is mid-turn or whose prompt cache is still warm tries the credit before switching accounts (a switch re-bills the whole context); a cold one switches first and uses a credit only when no pool member can take it. \"Off\" (the default) never spends one by itself; \"Ask\" files one decision in For you per limit; \"Auto\" spends it for you, within the unattended-spend ceiling."),
      apply: { kind: 'server', how: 'pool engine — the codex reset-credit rung of the exhaustion ladder' },
    },
    {
      key: "defaultModel",
      type: "enum", default: "", combobox: true,
      options: [
        { value: "", label: t("Default") },
        { value: "gpt-6-astra", label: "gpt-6-astra" },
      ],
      label: t("Default model"),
      description: t("Select a known model or choose \"Custom...\" to type a specific model ID. Applies to NEW sessions: a resumed conversation keeps its own value (set one for a specific conversation under Session parameters on its card)."),
      apply: { kind: 'spawn', how: '--model', via: 'model' },
    },
    {
      key: "defaultPermissionMode",
      type: "enum", default: "",
      options: [
        { value: "", label: t("Default") },
        { value: "read-only", label: t("Read Only") },
        { value: "safe-yolo", label: t("Safe Yolo") },
        { value: "yolo", label: t("Yolo") },
      ],
      label: t("Default permission mode"),
      description: t("Default Codex permission mode for new or resumed Codex sessions."),
      apply: { kind: 'spawn', how: '--permission-mode', via: 'permissionMode' },
    },
    {
      key: "defaultEffort",
      type: "enum", default: "",
      options: [
        { value: "", label: t("Auto (model default)") },
        { value: "minimal", label: t("Minimal") },
        { value: "low", label: t("Low") },
        { value: "medium", label: t("Medium") },
        { value: "high", label: t("High") },
        { value: "xhigh", label: t("XHigh") },
      ],
      label: t("Default effort level"),
      description: t("Default Codex reasoning effort for NEW Codex sessions. A resumed conversation keeps the effort its own last turn ran at; set one for a specific conversation under Session parameters on its card."),
      apply: { kind: 'spawn', how: '--effort', via: 'effort' },
    },
    {
      key: "defaultExtraArgs",
      type: "text", default: "",
      label: t("Default extra args"),
      description: t("Extra Codex CLI args appended when starting a Codex session."),
      apply: { kind: 'spawn', how: 'appended argv', via: 'extraArgs' },
    },
    {
      // THE ONE MANAGED config.toml ROW (2.369.123) — the codex analogue of
      // claude.transcriptRetentionDays. EVIDENCE, codex-cli 0.154.0 (the
      // installed binary, `strings -n 6` over
      // vendor/x86_64-unknown-linux-musl/bin/codex): the resolved-config
      // template embeds
      //     [history]
      //     persistence = "save-all"
      // five times (each right after `project_root_markers = [".git"]`), the
      // config struct is named `HistoryPersistence`, and the runtime message
      // "(Session persistence is disabled; cannot …" is the `none` branch —
      // with persistence "none" codex writes NO rollout, and VibeSpace's
      // history for that machine is empty. Default 'save-all' = VibeSpace
      // ENFORCES that rollouts persist; '' = leave config.toml alone (off).
      key: 'historyPersistence',
      type: 'enum', default: 'save-all',
      options: [
        { value: '', label: t('CLI default (leave config.toml alone)') },
        { value: 'save-all', label: t('Save all — keep every conversation (rollout) on disk') },
        { value: 'none', label: t('None — write no rollouts (history is empty)') },
      ],
      label: t('Keep Codex conversations on disk'),
      description: t('Codex records each conversation as a rollout file under ~/.codex/sessions only while [history] persistence is "save-all" (its own default). VibeSpace writes this value into ~/.codex/config.toml (comments and formatting preserved) at start-up and whenever it changes, and onto remote hosts when their agent tools are installed or a session starts there. "None" means Codex writes nothing and this instance shows no history for those sessions.'),
      apply: { kind: 'cli-config', file: 'config', path: ['history', 'persistence'], off: '', onUninstall: 'keep' },
    },
    ],
  },
  opencode: {
    prefix: 'opencode',
    category: t('OpenCode'),
    files: {},
    rows: [
    {
      key: "defaultModel",
      type: "enum", default: "", combobox: true,
      options: [
        { value: "", label: t("Default") },
      ],
      label: t("Default model"),
      description: t("A model id the agent offers (provider/model, e.g. opencode/big-pickle) — the list fills from the agent once a session has started; empty keeps the agent default. Applies to NEW sessions: a resumed conversation keeps the model OpenCode’s own session record names (that needs the OpenCode background service; without it the default applies and the server log says which rung it used)."),
      apply: { kind: 'spawn', how: '--model', via: 'model' },
    },
    {
      key: "defaultPermissionMode",
      type: "enum", default: "",
      options: [
        { value: "", label: t("Default") },
        { value: "build", label: t("Build") },
        { value: "plan", label: t("Plan") },
      ],
      label: t("Default permission mode"),
      description: t("Default OpenCode session mode for new sessions: build executes tools per its permission rules, plan disallows edits."),
      apply: { kind: 'spawn', how: '--permission-mode', via: 'permissionMode' },
    },
    {
      key: "defaultExtraArgs",
      type: "text", default: "",
      label: t("Default extra args"),
      description: t("Extra OpenCode CLI args appended when starting an OpenCode session."),
      apply: { kind: 'spawn', how: 'appended argv', via: 'extraArgs' },
    },
    ],
  },
};

const BUILTIN_PREFIXES = Object.freeze(Object.keys(HARNESS_SETTINGS));

/** The persisted settings path of a row — TODAY's spelling, byte for byte. */
function settingPath(prefix, key) { return `${prefix}.${key}`; }
/** The row of `table` whose key is `key`, or null. */
function rowOf(table, key) {
  if (!table || !Array.isArray(table.rows)) return null;
  return table.rows.find((r) => r && r.key === key) || null;
}
/** Every row of one apply kind. */
function rowsOfKind(table, kind) {
  if (!table || !Array.isArray(table.rows)) return [];
  return table.rows.filter((r) => r && r.apply && r.apply.kind === kind);
}

/** TYPED read of a raw stored value: the row's type decides, the row's default
 *  answers for anything unset/unreadable (the ONE home of every default — the
 *  36500 that used to live twice, in the schema and in server.js). Numbers are
 *  clamped to the row's min/max. An `enum` row's domain IS its options: a
 *  value outside them falls back to the row default (checkTable guarantees the
 *  default is listed) — EXCEPT a `combobox` row, whose options are suggestions
 *  and whose typed value is the point. Validated HERE, at the ONE typed read,
 *  because the old "validated where it becomes an argv token" was only true
 *  of argv: a cli-config row's value became a config-file value with no check
 *  at all, and codex 0.154.0 refuses to load a config.toml whose
 *  `history.persistence` is an unknown variant — POST /api/settings could
 *  write `bogus`, every receipt said ✓ applied, and the prelude fanned it out
 *  to every remote host (2026-09-21 verifier finding). `refusedValue` names
 *  what was dropped so the ORCH half can say so at boot. */
function coerce(row, raw) {
  if (!row) return undefined;
  switch (row.type) {
    case 'boolean':
      return raw === true ? true : raw === false ? false : !!row.default;
    case 'enum': {
      const dflt = String(row.default == null ? '' : row.default);
      if (raw === null || raw === undefined) return dflt;
      const s = String(raw);
      if (row.combobox || !Array.isArray(row.options)) return s;
      return row.options.some((o) => o && o.value === s) ? s : dflt;
    }
    case 'number': {
      if (raw === '' || raw === null || raw === undefined) return row.default;
      const n = Number(raw);
      if (!Number.isFinite(n)) return row.default;
      let v = n;
      if (typeof row.min === 'number' && v < row.min) v = row.min;
      if (typeof row.max === 'number' && v > row.max) v = row.max;
      return v;
    }
    default:
      return raw === null || raw === undefined ? String(row.default == null ? '' : row.default) : String(raw);
  }
}

/** The stored value a CLOSED enum row REFUSED (as a string), or null when the
 *  value is listed, the row is a combobox / not an enum, or nothing is set. */
function refusedValue(row, raw) {
  if (!row || row.type !== 'enum' || row.combobox || !Array.isArray(row.options)) return null;
  if (raw === null || raw === undefined) return null;
  const s = String(raw);
  return row.options.some((o) => o && o.value === s) ? null : s;
}

/** Does a coerced value mean "leave the CLI alone" for a cli-config row? */
function isOff(row, value) {
  if (!row || !row.apply || row.apply.kind !== 'cli-config') return false;
  return value === row.apply.off;
}

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
function hasFunctionDeep(v, depth = 0) {
  if (typeof v === 'function') return true;
  if (depth > 6 || !v || typeof v !== 'object') return false;
  return Object.values(v).some((x) => hasFunctionDeep(x, depth + 1));
}
function checkRel(rel) {
  if (!Array.isArray(rel) || !rel.length) return 'rel must be a non-empty array of path segments';
  for (const seg of rel) {
    if (typeof seg !== 'string' || !seg) return 'rel has an empty segment';
    if (seg === '..' || seg === '.') return `rel segment ${JSON.stringify(seg)} is not allowed`;
    if (seg.includes('/') || seg.includes('\\') || seg.startsWith('~')) return `rel segment ${JSON.stringify(seg)} must be a bare name (no separators, no ~)`;
  }
  return null;
}

/** THE VALIDATOR (design §2 "校验"). Returns a list of problems — empty means
 *  the table is sound. `ctx` carries what a PURE module cannot see:
 *    settingsPrefix — the descriptor's prefix (must match table.prefix)
 *    configFiles    — the descriptor's file table (a cli-config row's `file`
 *                     must exist there, with the same rel, and be writable)
 *    adapterHas(v)  — does the harness's Adapter implement live verb `v`
 *    contributed    — {id} of a contributed (plugin) harness: the prefix must
 *                     be its own id and never a built-in one (§7)
 *  Every refusal names the row and the reason. */
function checkTable(table, ctx = {}) {
  const errs = [];
  if (!isPlainObject(table)) return ['settings table must be an object'];
  if (typeof table.prefix !== 'string' || !PREFIX_RE.test(table.prefix)) errs.push(`prefix must be a lowercase slug (got ${JSON.stringify(table.prefix)})`);
  if (typeof table.category !== 'string' || !table.category.trim()) errs.push('category must be a non-empty string');
  if (ctx.settingsPrefix !== undefined && table.prefix !== ctx.settingsPrefix) errs.push(`prefix ${JSON.stringify(table.prefix)} does not match the descriptor's settingsPrefix ${JSON.stringify(ctx.settingsPrefix)}`);
  if (ctx.contributed) {
    if (table.prefix !== ctx.contributed.id) errs.push(`a contributed harness may only own its own namespace: prefix must be ${JSON.stringify(ctx.contributed.id)} (got ${JSON.stringify(table.prefix)})`);
    if (BUILTIN_PREFIXES.includes(table.prefix)) errs.push(`prefix ${JSON.stringify(table.prefix)} is a built-in harness namespace`);
  }
  const files = table.files === undefined ? {} : table.files;
  if (!isPlainObject(files)) errs.push('files must be an object of {rel, format}');
  else {
    for (const [id, f] of Object.entries(files)) {
      if (!isPlainObject(f)) { errs.push(`files.${id} must be {rel, format}`); continue; }
      const r = checkRel(f.rel); if (r) errs.push(`files.${id}: ${r}`);
      if (!FILE_FORMATS.includes(f.format)) errs.push(`files.${id}: format must be one of ${FILE_FORMATS.join('|')} (got ${JSON.stringify(f.format)})`);
      if (ctx.configFiles !== undefined) {
        const d = ctx.configFiles && ctx.configFiles[id];
        if (!d) errs.push(`files.${id} is declared in the table but not in the descriptor's configFiles`);
        else if (d.rel !== f.rel) errs.push(`files.${id}: the descriptor's configFiles.${id}.rel is not the table's rel object (one spelling only)`);
      }
    }
  }
  if (!Array.isArray(table.rows)) { errs.push('rows must be an array'); return errs; }
  if (table.rows.length > MAX_ROWS) errs.push(`too many rows (${table.rows.length} > ${MAX_ROWS})`);
  const seen = new Set();
  table.rows.forEach((row, i) => {
    const at = `row[${i}]${row && row.key ? ' ' + row.key : ''}`;
    if (!isPlainObject(row)) { errs.push(`${at}: must be an object`); return; }
    if (typeof row.key !== 'string' || !KEY_RE.test(row.key)) errs.push(`${at}: key must match ${KEY_RE} (got ${JSON.stringify(row.key)})`);
    else if (seen.has(row.key)) errs.push(`${at}: duplicate key`);
    seen.add(row.key);
    if (hasFunctionDeep(row)) errs.push(`${at}: rows are pure data — a function cannot cross the wire`);
    if (!ROW_TYPES.includes(row.type)) errs.push(`${at}: type must be one of ${ROW_TYPES.join('|')} (got ${JSON.stringify(row.type)})`);
    if (typeof row.label !== 'string' || !row.label) errs.push(`${at}: label required`);
    if (typeof row.description !== 'string') errs.push(`${at}: description required (may be empty)`);
    if (row.scope !== undefined && row.scope !== 'instance') errs.push(`${at}: scope must be 'instance' (v1)`);
    switch (row.type) {
      case 'boolean': if (typeof row.default !== 'boolean') errs.push(`${at}: boolean default required`); break;
      case 'number':
        if (typeof row.default !== 'number' || !Number.isFinite(row.default)) errs.push(`${at}: finite number default required`);
        for (const k of ['min', 'max', 'step']) if (row[k] !== undefined && (typeof row[k] !== 'number' || !Number.isFinite(row[k]))) errs.push(`${at}: ${k} must be a finite number`);
        if (typeof row.min === 'number' && typeof row.max === 'number' && row.min > row.max) errs.push(`${at}: min > max`);
        break;
      case 'enum': {
        if (typeof row.default !== 'string') errs.push(`${at}: enum default must be a string`);
        if (!Array.isArray(row.options) || !row.options.length) errs.push(`${at}: enum needs a non-empty options list`);
        else {
          for (const o of row.options) if (!isPlainObject(o) || typeof o.value !== 'string' || typeof o.label !== 'string') { errs.push(`${at}: every option is {value, label} (strings)`); break; }
          if (typeof row.default === 'string' && row.options.every((o) => !o || o.value !== row.default)) errs.push(`${at}: default ${JSON.stringify(row.default)} is not among its options`);
        }
        break;
      }
      default: if (typeof row.default !== 'string') errs.push(`${at}: string default required`);
    }
    const a = row.apply;
    if (!isPlainObject(a) || !APPLY_KINDS.includes(a.kind)) { errs.push(`${at}: apply.kind must be one of ${APPLY_KINDS.join('|')}`); return; }
    if (a.kind === 'spawn') {
      if (typeof a.how !== 'string' || !a.how) errs.push(`${at}: apply.how (display text) required`);
      if (a.via !== undefined && (typeof a.via !== 'string' || !KEY_RE.test(a.via))) errs.push(`${at}: apply.via must name a buildSessionArgs option field`);
      if (a.mode !== undefined && !SPAWN_MODES.includes(a.mode)) errs.push(`${at}: apply.mode must be ${SPAWN_MODES.join('|')}`);
      if (a.live !== undefined) {
        if (typeof a.live !== 'string' || !KEY_RE.test(a.live)) errs.push(`${at}: apply.live must name an adapter verb`);
        else if (typeof ctx.adapterHas === 'function' && !ctx.adapterHas(a.live)) errs.push(`${at}: live verb ${JSON.stringify(a.live)} is not implemented by the adapter`);
      }
    } else if (a.kind === 'server') {
      if (typeof a.how !== 'string' || !a.how) errs.push(`${at}: apply.how (who reads it) required`);
    } else {
      const f = isPlainObject(files) ? files[a.file] : null;
      if (typeof a.file !== 'string' || !f) errs.push(`${at}: apply.file ${JSON.stringify(a.file)} is not in the table's files`);
      else {
        if (ctx.configFiles !== undefined) {
          const d = ctx.configFiles && ctx.configFiles[a.file];
          if (!d) errs.push(`${at}: apply.file ${JSON.stringify(a.file)} is not in the descriptor's configFiles`);
          else if (d.writable === false) errs.push(`${at}: ${a.file} (${Array.isArray(d.rel) ? d.rel.join('/') : '?'}) is declared read-only — VibeSpace has no writer for it`);
        }
        if (!Array.isArray(a.path) || !a.path.length || a.path.some((p) => typeof p !== 'string' || !p)) errs.push(`${at}: apply.path must be a non-empty array of key names`);
        else if (f.format === 'toml') {
          if (a.path.length > 2) errs.push(`${at}: a toml path is [section, key] or [key] (got depth ${a.path.length})`);
          if (a.path.some((p) => !TOML_BARE_RE.test(p))) errs.push(`${at}: toml section/key names must be bare (${TOML_BARE_RE})`);
          if (!['string', 'enum', 'boolean', 'number'].includes(row.type)) errs.push(`${at}: the toml writer supports string/boolean/integer values only`);
        }
      }
      if (!('off' in a)) errs.push(`${at}: apply.off (the "leave the CLI alone" value) required`);
      else if (a.off !== null && !['string', 'number', 'boolean'].includes(typeof a.off)) errs.push(`${at}: apply.off must be a primitive`);
      if (!ON_UNINSTALL.includes(a.onUninstall)) errs.push(`${at}: apply.onUninstall must be ${ON_UNINSTALL.join('|')}`);
    }
  });
  return errs;
}
/** checkTable that THROWS (registration paths). */
function assertTable(table, ctx) {
  const errs = checkTable(table, ctx);
  if (errs.length) throw new Error(`harness settings table ${table && table.prefix ? JSON.stringify(table.prefix) + ' ' : ''}invalid: ${errs.join('; ')}`);
  return table;
}

/** THE CONFIG PLAN (design §6): self-contained, relative paths only, ONE
 *  object every machine applies with the ONE shared applier. Input = one spec
 *  per harness: `{ harness, table, files: { id: {createIfMissing, hooks?} },
 *  values: { key: raw } }` — the descriptor-side facts (createIfMissing, the
 *  hook events of the file that is ALSO the hook file) come pre-resolved so
 *  this stays pure. A row whose coerced value is its `off` value is NOT in
 *  the plan (not written, never deleted). Files with neither a managed key nor
 *  hooks are omitted. */
function buildConfigPlan(specs) {
  const files = [];
  for (const spec of Array.isArray(specs) ? specs : []) {
    const table = spec && spec.table;
    if (!table || !isPlainObject(table.files)) continue;
    const values = spec.values || {};
    for (const [id, f] of Object.entries(table.files)) {
      const facts = (spec.files && spec.files[id]) || {};
      const set = [];
      for (const row of rowsOfKind(table, 'cli-config')) {
        if (row.apply.file !== id) continue;
        const value = coerce(row, values[row.key]);
        if (isOff(row, value)) continue;
        set.push({ key: row.key, path: [...row.apply.path], value, onUninstall: row.apply.onUninstall });
      }
      const hooks = facts.hooks && Array.isArray(facts.hooks.events) && facts.hooks.events.length ? { events: [...facts.hooks.events] } : null;
      if (!set.length && !hooks) continue;
      const entry = { harness: spec.harness || table.prefix, id, rel: [...f.rel], format: f.format, createIfMissing: !!facts.createIfMissing, set };
      if (hooks) entry.hooks = hooks;
      files.push(entry);
    }
  }
  return { v: 1, files };
}
/** Is this a plan this applier understands? (an unknown `v` is refused) */
function isPlan(p) { return isPlainObject(p) && p.v === 1 && Array.isArray(p.files); }

module.exports = {
  HARNESS_SETTINGS, BUILTIN_PREFIXES, APPLY_KINDS, ROW_TYPES, FILE_FORMATS, SPAWN_MODES, ON_UNINSTALL, MAX_ROWS, GENERIC_LEGACY_KEYS,
  settingPath, rowOf, rowsOfKind, coerce, refusedValue, isOff, checkRel, checkTable, assertTable, buildConfigPlan, isPlan,
};
