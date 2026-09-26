'use strict';
// VIBESPACE'S OWN AGENT TOOLS NEVER ASK PER COMMAND (lane L, 2026-09-25 — the
// naive-user study 2: "7 to 15 'Permission: Bash' cards per task, Always Allow
// does not stop the next one"). PURE: imports nothing, CJS, so the SAME table is
// read by the claude adapter (the spawn's `--settings` layer), by the chat
// renderer (the permission card's plain words + the widened Always Allow) and by
// the tests.
//
// THE CAUSE, MEASURED ON THE CLI (claude 2.1.281, read in the binary):
//   · every `vibespace-browser <verb> …` is a Bash command, and in the default
//     permission mode a Bash command nobody pre-approved asks;
//   · "Always Allow" sends back the CLI's OWN suggestion, and that suggestion is
//     the command's first TWO words (`fCn`: `s.slice(0,2).join(" ")` when the
//     second word is a lowercase word) written as `Bash(vibespace-browser click *)`
//     to localSettings — so allowing a click never covers the next fill, open or
//     snapshot: one card per verb, forever.
// THE FIX: the spawn carries allow rules for VibeSpace's own tools in the inline
// `--settings` JSON (the CLI's `flagSettings` source — one of
// ["userSettings","projectSettings","localSettings","flagSettings",
// "policySettings"], "cli flag" in its own /permissions view), gated by the
// claude row `allowAgentTools` (default ON). Nothing is written into the user's
// ~/.claude/settings.json.
//
// RULE SPELLING (2.1.281): `Bash(<prefix>:*)` is the LEGACY prefix form the
// validator still accepts ("Bash(npm run:*) - prefix matching (legacy)") and the
// matcher reads as `{type:"prefix"}`: `cmd === prefix || cmd.startsWith(prefix +
// " ")` after collapsing runs of blanks (`xOe`). The newer `Bash(<prefix> *)`
// wildcard compiles to `^prefix( .*)?$` — the same set. The legacy spelling is
// used because remote hosts may run an older CLI that predates the wildcard
// form; both are accepted by the one we measured. A COMPOUND command is split by
// the CLI and every sub-command must be allowed on its own (a prefix rule never
// matches a compound as a whole), so `vibespace-browser open x && rm -rf y`
// still asks for the `rm`.
//
// WHICH TOOLS: the ones whose every verb VibeSpace itself mediates. A verb that
// runs an ARBITRARY shell command is a shell, not "VibeSpace's own" action, and
// is HELD (the CLI keeps asking): `vibespace-job run` / `start` (sh -c), and
// `vibespace-job access` (a grant of control over a job is the user's). The
// tools that are not agent verbs at all, or that run commands elsewhere, are
// held whole (HELD_TOOLS) — test-agent-tool-rules censuses every `vibespace-*`
// entry of hosts.js AGENT_TOOLS into exactly one of the two tables.
// PUBLISH ASKS (r2, owner decision 2026-09-25): `vibespace-page publish` puts a
// page under the user's name on this instance (`--public` = a link anyone can
// open), so it is never pre-approved: vibespace-page is VERB-LISTED (`list`,
// `kit`), and `publish` also rides the spawn as an ASK rule
// (`permissions.ask`, 2.1.281: deny > ask > allow, and the ask-rule check runs
// BEFORE the permission-mode check — measured in the binary, the rule prompts
// even under bypassPermissions; dontAsk turns it into a refusal). A CLI with no
// ask support still asks, because publish is not in the allow list at all.
// THE ASK RULE FOLLOWS THE SPAWN MODE (r3, integrator decision 2026-09-26):
// because an ask rule outranks the mode, shipping it everywhere made publish
// PROMPT in a full-access session that never asked before lane L. Our rules may
// only keep OUR allow list from widening — never change what the user's chosen
// mode does — so the ask rule rides ONLY a spawn whose mode asks anyway
// (ASK_RULE_MODES: default / manual / acceptEdits / plan), where all it adds is
// that a user's own broader allow rule cannot pre-approve a publish.
// bypassPermissions: none (publish runs, as it always did); dontAsk: none
// (publish is not pre-approved, so it is refused, as it always was); auto: none
// (its own check decides); no --permission-mode: none (the CLI's own setting
// decides, unknown at spawn). The allow list is verb-listed in EVERY mode. The
// mode is read off the argv the CLI receives (`spawnPermissionMode`), and a
// mid-session switch (set_permission_mode) rewrites no settings, so the rule
// follows the SPAWN mode until the next spawn.
// THE ACCEPTED TRADE-OFF (r2): anything the agent can read it can type or
// upload into a page without asking — `fill` and `upload` are page verbs of
// the one browser tool. The CLI refuses an UPLOAD from the credential stores by
// name (~/.claude, ~/.ssh, ~/.vibespace, ~/.codex, VibeSpace's account stores —
// src/browser-verbs.js `uploadPathVerdict`), server-independent.
//
// CODEX: no equivalent is shipped. Codex 0.154's only per-command allow is an
// execpolicy `.rules` file (`prefix_rule(pattern=[…], decision="allow")`) loaded
// from CODEX_HOME/rules — there is no per-spawn flag for it, so shipping one
// means writing into the user's CODEX_HOME. And its default here is the
// workspace-write sandbox with network access on (the adapter's
// `sandbox_workspace_write.network_access=true`), where these tools already run
// without an approval unless they need to leave the sandbox.
const i18nKey = (s) => s; // extraction marker (scripts/i18n-extract.mjs) — the client renders through t()

const JOB_VERBS = Object.freeze(['list', 'show', 'poll', 'answers', 'logs', 'progress', 'ask', 'docs', 'stop', 'rm', 'notify', 'notify-cron', 'announce', 'subscribe', 'unsubscribe']);
/** vibespace-page's pre-approved verbs (r2): `publish` is held AND an ask rule. */
const PAGE_VERBS = Object.freeze(['list', 'kit']);

/** tool → the verbs pre-approved (null = every verb), the verbs held and why,
 *  and (`ask`) the held verbs the spawn ALSO names as ask rules — an ask rule
 *  beats any allow rule the user holds (every `ask` verb is a `held` verb). */
const AGENT_TOOL_RULES = Object.freeze([
  Object.freeze({ tool: 'vibespace-browser', verbs: null, why: 'drives this conversation\'s own browser — navigation and every refusal are VibeSpace\'s (browser-verbs.js). Accepted trade-off: anything the agent can read it can type or upload into a page without asking (an upload from ~/.claude, ~/.ssh, ~/.vibespace, ~/.codex or the account stores is refused by the CLI by name)' }),
  Object.freeze({ tool: 'vibespace-status', verbs: null, why: 'sets this session\'s status' }),
  Object.freeze({ tool: 'vibespace-task', verbs: null, why: 'reports progress / backlog on this session\'s own task' }),
  Object.freeze({ tool: 'vibespace-ask', verbs: null, why: 'files an item in the user\'s For you inbox' }),
  Object.freeze({ tool: 'vibespace-docs', verbs: null, why: 'reads a VibeSpace manual' }),
  Object.freeze({ tool: 'vibespace-msg', verbs: null, why: 'messages other agents — a wake is a billed turn under the spend ceiling' }),
  Object.freeze({ tool: 'vibespace-window', verbs: null, why: 'drives a desktop-app window under a lease the user can take over' }),
  Object.freeze({ tool: 'vibespace-channels', verbs: null, why: 'reads channels; a reply is a PROPOSAL the outbox policy decides' }),
  Object.freeze({
    tool: 'vibespace-page', verbs: PAGE_VERBS, why: 'lists the pages it published and prepares the design kit; publishing asks every time',
    held: Object.freeze({ publish: 'puts a page under the user\'s name on this instance (--public = a link anyone can open) — it asks every time (owner 2026-09-25)' }),
    ask: Object.freeze(['publish']),
  }),
  Object.freeze({
    tool: 'vibespace-job', verbs: JOB_VERBS, why: 'Background Work bookkeeping',
    held: Object.freeze({
      run: 'runs an arbitrary shell command (sh -c) outside the CLI\'s own Bash check',
      start: 're-runs a job\'s stored shell command',
      access: 'widens who may view or control a job — a grant is the user\'s',
    }),
  }),
]);

/** `vibespace-*` agent tools that are never pre-approved, and why. */
const HELD_TOOLS = Object.freeze({
  'vibespace-exit': 'runs an arbitrary command on another machine (`run <machine> -- …`) or hands out its network',
  'vibespace-usage': 'the statusline command — the CLI runs it, never the agent',
  'vibespace-remote-keeper': 'the remote chat keeper — a VibeSpace process, never an agent verb',
  'vibespace-claude-subscription-login.mjs': 'the login helper — the user\'s act',
  'vibespace-hook.mjs': 'the hook the CLI runs itself',
  'vibespace-hook-register.mjs': 'the register helper VibeSpace runs over ssh',
  'vibespace-browser-verbs.js': 'a module the browser CLI requires, not a command',
});

const CODEX_NOTE = 'codex: no per-spawn allow list — its only per-command allow is an execpolicy .rules file under CODEX_HOME (a write into the user\'s own config), and the default workspace-write sandbox with network on already runs these tools without an approval';

/** THE rules the claude spawn carries (ordered, stable). */
function claudeAllowRules() {
  const out = [];
  for (const r of AGENT_TOOL_RULES) {
    if (!r.verbs) out.push(`Bash(${r.tool}:*)`);
    else for (const v of r.verbs) out.push(`Bash(${r.tool} ${v}:*)`);
  }
  return out;
}

/** THE ask rules the claude spawn carries beside them (`permissions.ask`):
 *  2.1.281 decides deny > ask > allow, so these prompt even when the user's
 *  own settings hold a broader allow rule (r2: `vibespace-page publish`). */
function claudeAskRules() {
  const out = [];
  for (const r of AGENT_TOOL_RULES) for (const v of r.ask || []) out.push(`Bash(${r.tool} ${v}:*)`);
  return out;
}

/** The modes that ask for a publish anyway (r3) — the only spawns that carry
 *  the ask rules. `manual` is 2.1.281's alias of `default` (`Um`). */
const ASK_RULE_MODES = Object.freeze(['default', 'manual', 'acceptEdits', 'plan']);

/** The permission mode a claude argv spawns in, read off the argv the CLI
 *  receives: `--dangerously-skip-permissions` ⇒ 'bypassPermissions' (2.1.281
 *  `Rvr` makes it the FIRST mode candidate, ahead of --permission-mode), else
 *  the LAST `--permission-mode <v>` / `--permission-mode=<v>` (commander keeps
 *  the last value; a user's own flag lands after the session's), else null —
 *  no flag means the CLI's own setting decides, which is unknown here. */
function spawnPermissionMode(argv) {
  if (!Array.isArray(argv)) return null;
  if (argv.includes('--dangerously-skip-permissions')) return 'bypassPermissions';
  let mode = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--permission-mode' && typeof argv[i + 1] === 'string') mode = argv[++i];
    else if (typeof a === 'string' && a.startsWith('--permission-mode=')) mode = a.slice('--permission-mode='.length);
  }
  return mode || null;
}

/** The ask rules a spawn in `mode` carries: claudeAskRules() in a mode that
 *  asks anyway (ASK_RULE_MODES), none in any other (r3). */
function claudeAskRulesFor(mode) {
  return ASK_RULE_MODES.includes(mode) ? claudeAskRules() : [];
}

/** A permission rule string → {toolName, content, type, prefix|pattern|command}
 *  (2.1.281's `ZZt` / `T0e`: `X:*` = prefix, an unescaped `*` = wildcard, else exact). */
function parseRule(rule) {
  const m = /^([A-Za-z][\w-]*)(?:\((.*)\))?$/s.exec(String(rule || ''));
  if (!m) return null;
  const toolName = m[1];
  const content = m[2];
  if (content === undefined) return { toolName, content: null, type: 'tool' };
  const px = /^(.+):\*$/s.exec(content);
  if (px) return { toolName, content, type: 'prefix', prefix: px[1] };
  if (/(^|[^\\])\*/.test(content)) return { toolName, content, type: 'wildcard', pattern: content };
  return { toolName, content, type: 'exact', command: content };
}

const squash = (s) => String(s || '').replace(/[ \t]+/g, ' ').trim();

/** Does ONE simple command match a Bash rule the way 2.1.281 matches it? (the
 *  mirror of `xOe` — prefix: equal or followed by a blank; wildcard: `*` = any
 *  run, a trailing ` *` also matches the bare prefix). Compounds are the CLI's
 *  business (it splits them); call this per sub-command. */
function ruleMatchesCommand(rule, command) {
  const r = typeof rule === 'string' ? parseRule(rule) : rule;
  if (!r || r.toolName !== 'Bash') return false;
  const cmd = squash(command);
  if (r.type === 'tool') return true;
  if (r.type === 'exact') return cmd === squash(r.command);
  if (r.type === 'prefix') { const p = squash(r.prefix); return cmd === p || cmd.startsWith(p + ' '); }
  const esc = r.pattern.replace(/[.+?^${}()|[\]\\'"]/g, '\\$&').replace(/\*/g, '.*');
  const count = (r.pattern.match(/\*/g) || []).length;
  const body = esc.endsWith(' .*') && count === 1 ? esc.slice(0, -3) + '( .*)?' : esc;
  return new RegExp(`^${body}$`, 's').test(cmd);
}

/** Is this ONE simple command pre-approved by the shipped rules? A compound is
 *  never "one command" — the CLI splits it and asks per sub-command — so a line
 *  that splits into more than one command answers false here. A shipped ASK
 *  rule that matches wins over every allow rule (2.1.281: deny > ask > allow). */
function coveredByAgentToolRules(command) {
  const segs = splitShell(command);
  if (!segs || segs.length !== 1) return false;
  if (claudeAskRules().some((r) => ruleMatchesCommand(r, command))) return false;
  return claudeAllowRules().some((r) => ruleMatchesCommand(r, command));
}

const tableRow = (tool) => AGENT_TOOL_RULES.find((r) => r.tool === tool) || null;

const hasOwn = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
/** Why an Always Allow is withheld (the card says it where the button would be). */
const WITHHELD_ASK = i18nKey('Publishing a page asks every time — Always Allow is not offered.');
const WITHHELD_HELD = i18nKey('Always Allow is not offered for this line: it can run any command, and only a single exact command line can be remembered.');

/** A HELD command's suggestion narrowed to the exact line (the CLI's own
 *  `een` form: ruleContent = the command, no ` *`) — or null when it cannot
 *  be: a compound (which sub-command is remembered is the CLI's split), a line
 *  holding `*` (2.1.281 `Ut` would read an exact rule with a star as a
 *  WILDCARD), a newline, or a line whose head is not the bare tool (the words
 *  the suggestion named). */
function exactRuleFor(command, head, verb) {
  const cmd = String(command == null ? '' : command).trim();
  if (!cmd || /[*\n\r]/.test(cmd)) return null;
  const segs = splitShell(cmd);
  if (!segs || segs.length !== 1) return null;
  const w = segs[0].words;
  if (w[0] !== head || (verb && w[1] !== verb)) return null;
  return { toolName: 'Bash', ruleContent: cmd };
}

/** One suggested rule → `{rule}` (the rule to send, possibly unchanged) or
 *  `{rule: null, withheld}` (dropped, with the sentence that says why). */
function widenRule(rv, command) {
  if (!rv || rv.toolName !== 'Bash' || typeof rv.ruleContent !== 'string') return { rule: rv };
  const content = rv.ruleContent;
  const words = squash(content.replace(/:\*$/, '').replace(/ \*$/, '')).split(' ');
  const head = words[0];
  const row = tableRow(head);
  const heldTool = hasOwn(HELD_TOOLS, head);
  if (!row && !heldTool) return { rule: rv }; // not ours (a path-prefixed head included): the CLI's rule as-is
  if (row && !row.verbs) return { rule: { toolName: 'Bash', ruleContent: `${row.tool}:*` } };
  const verb = words[1];
  const plainVerb = !!verb && !verb.includes('*');
  if (row && plainVerb && row.verbs.includes(verb)) return { rule: { toolName: 'Bash', ruleContent: `${row.tool} ${verb}:*` } };
  // an ASK verb: no allow rule can ever take effect over the shipped ask rule — withheld, said by name
  if (row && plainVerb && row.ask && row.ask.includes(verb)) return { rule: null, withheld: WITHHELD_ASK };
  // an unknown verb of a verb-listed tool reaches no held verb: the CLI's rule as-is
  if (row && plainVerb && !hasOwn(row.held, verb)) return { rule: rv };
  // HELD from here: a held tool, a held verb, or a pattern over the tool's verbs (`vibespace-job *`) —
  // an exact rule already names one line; a prefix / wildcard is narrowed to THIS line or withheld
  if (!/(^|[^\\])\*/.test(content)) return { rule: rv };
  const exact = exactRuleFor(command, head, plainVerb ? verb : null);
  return exact ? { rule: exact } : { rule: null, withheld: WITHHELD_HELD };
}

/** "Always Allow" on a card, the full answer: `{updates, withheld}`.
 *  The CLI suggested the command's first two words (`vibespace-browser click
 *  *`), which never covers the next verb — for a whole tool of ours it becomes
 *  the tool's rule, for a listed verb its verb rule. For a HELD tool or a held
 *  verb (`vibespace-job run *` = every future shell command through that verb;
 *  `vibespace-exit run *`) the rule is narrowed to the exact command line the
 *  card is for (`command`), or withheld when that cannot be spelled; an ASK
 *  verb (`vibespace-page publish`) is always withheld. An update left with no
 *  rule is dropped; every foreign rule passes untouched; deduped; never
 *  mutates. `withheld` = the i18n sentence for the card when a rule was
 *  dropped (null otherwise). */
function alwaysAllowFor(suggestions, command) {
  if (!Array.isArray(suggestions)) return { updates: suggestions, withheld: null };
  let withheld = null;
  const updates = [];
  for (const u of suggestions) {
    if (!u || u.type !== 'addRules' || !Array.isArray(u.rules)) { updates.push(u); continue; }
    const seen = new Set();
    const rules = [];
    for (const rv of u.rules) {
      const r = widenRule(rv, command);
      if (!r.rule) { if (r.withheld && withheld !== WITHHELD_ASK) withheld = r.withheld; continue; }
      const key = r.rule.toolName + '(' + (r.rule.ruleContent || '') + ')';
      if (seen.has(key)) continue;
      seen.add(key);
      rules.push(r.rule);
    }
    if (rules.length || !u.rules.length) updates.push({ ...u, rules });
  }
  return { updates, withheld };
}

/** The rules Always Allow sends (`alwaysAllowFor(…).updates`). */
function widenSuggestions(suggestions, command) {
  return alwaysAllowFor(suggestions, command).updates;
}

/** The rules an addRules update list will add, spelled the way the CLI prints them. */
function rulesText(suggestions) {
  const out = [];
  for (const u of Array.isArray(suggestions) ? suggestions : []) {
    if (!u || u.type !== 'addRules' || !Array.isArray(u.rules)) continue;
    for (const r of u.rules) if (r && r.toolName) out.push(r.ruleContent ? `${r.toolName}(${r.ruleContent})` : r.toolName);
  }
  return out;
}

// ── the permission card's plain words (display only — never a permission decision) ──

/** Quote-aware split of a shell line into simple commands. null = the line holds
 *  something a display must not guess at (substitution, heredoc, subshell,
 *  unbalanced quotes) — the card then shows the raw command. */
function splitShell(line) {
  const s = String(line || '');
  const segs = [];
  let cur = [];
  let tok = null;
  let i = 0;
  const endTok = () => { if (tok !== null) { cur.push(tok); tok = null; } };
  const endSeg = (op) => { endTok(); if (cur.length) segs.push({ words: cur, op }); else if (op && op !== '\n' && op !== ';') return false; cur = []; return true; };
  while (i < s.length) {
    const c = s[i];
    if (c === "'") {
      const j = s.indexOf("'", i + 1);
      if (j < 0) return null;
      tok = (tok || '') + s.slice(i + 1, j); i = j + 1; continue;
    }
    if (c === '"') {
      let j = i + 1; let buf = '';
      while (j < s.length && s[j] !== '"') {
        if (s[j] === '\\' && j + 1 < s.length) { buf += s[j + 1]; j += 2; continue; }
        if (s[j] === '$' && s[j + 1] === '(') return null;
        if (s[j] === '`') return null;
        buf += s[j]; j++;
      }
      if (j >= s.length) return null;
      tok = (tok || '') + buf; i = j + 1; continue;
    }
    if (c === '\\') { if (s[i + 1] === '\n') { i += 2; continue; } tok = (tok || '') + (s[i + 1] || ''); i += 2; continue; }
    if (c === '`' || (c === '$' && s[i + 1] === '(') || c === '(' || c === ')' || c === '{' || c === '}') return null;
    if (c === '<' && s[i + 1] === '<') return null;
    if (c === ' ' || c === '\t') { endTok(); i++; continue; }
    if (c === '\n' || c === ';') { if (!endSeg(c)) return null; i++; continue; }
    if (c === '&' && s[i + 1] === '&') { if (!endSeg('&&')) return null; i += 2; continue; }
    if (c === '|' && s[i + 1] === '|') { if (!endSeg('||')) return null; i += 2; continue; }
    if (c === '|') { if (!endSeg('|')) return null; i++; continue; }
    if (c === '&') {
      // `2>&1` / `&>/dev/null` stay inside the word; a bare `&` (background) is not ours to describe
      if (tok !== null && /[0-9]?>$/.test(tok)) { tok += c; i++; continue; }
      if (s[i + 1] === '>') { tok = (tok || '') + c; i++; continue; }
      return null;
    }
    tok = (tok || '') + c; i++;
  }
  endTok();
  if (cur.length) segs.push({ words: cur, op: null });
  return segs;
}

const QUIET_REDIRECT = /^(?:[0-9]?>&[0-9]|&?[0-9]?>{1,2}\/dev\/null|[0-9]?>{1,2}\/dev\/null)$/;
const FILTERS = new Set(['grep', 'egrep', 'fgrep', 'head', 'tail', 'wc', 'sort', 'uniq', 'cut', 'jq', 'cat', 'tr']);
const QUIET = new Set(['sleep', 'echo', 'printf', 'true', ':']);
/** THE CARD WEARS OUR FACE ONLY FOR THE HEAD THE CLI'S RULE TRUSTS (r2): a
 *  word is read as one of our tools (or a filter / a quiet command) only when
 *  it IS the bare name — `./data/bin/vibespace-browser` or
 *  `/tmp/evil/vibespace-browser` is some other file (2.1.281 never path-strips
 *  a head on the allow path, so that line DOES ask), and so is the bare name
 *  behind a `VAR=value` prefix outside `SAFE_ENV` (`PATH=/tmp/evil …`,
 *  `NODE_OPTIONS=--require …` choose what runs). Such a segment is named in
 *  `others` as written; a line of nothing else has no plain words (null). */
const SAFE_ENV = /^(?:VIBESPACE_BROWSER|AGENT_BROWSER_[A-Z0-9_]+)=/;
const shownHead = (h) => { const v = String(h || ''); return v.length > 40 ? '…' + v.slice(-39) : v; };

const BROWSER_VALUE_FLAGS = new Set(['--profile', '-p', '--max-output', '--screenshot-dir', '--screenshot-format', '--screenshot-quality', '--depth', '--selector']);
const shorten = (s, n = 120) => { const v = String(s || ''); return v.length > n ? v.slice(0, n - 1) + '…' : v; };

/** One browser command's words → {verb, key, params}. */
function browserStep(args) {
  const words = [];
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (a === '--') continue;
    if (BROWSER_VALUE_FLAGS.has(a)) { k++; continue; }
    if (a.startsWith('-')) continue;
    words.push(a);
  }
  const verb = words[0] || '';
  const arg = shorten(words[1] || '');
  const all = args.includes('--all');
  const S = (key, params = {}) => ({ verb, key, params });
  switch (verb) {
    case 'open': case 'goto': case 'navigate': return arg ? S(i18nKey('Open {url}'), { url: arg }) : S(i18nKey('Open a page'));
    case 'click': case 'dblclick': return S(i18nKey('Click {target}'), { target: arg || '?' });
    case 'fill': case 'type': return S(i18nKey('Type into {target}'), { target: arg || '?' });
    case 'press': case 'keyboard': case 'keydown': case 'keyup': return S(i18nKey('Press {key}'), { key: arg || '?' });
    case 'select': return S(i18nKey('Choose an option in {target}'), { target: arg || '?' });
    case 'check': case 'uncheck': return S(i18nKey('Tick or untick {target}'), { target: arg || '?' });
    case 'hover': case 'focus': case 'scrollintoview': return S(i18nKey('Point at {target}'), { target: arg || '?' });
    case 'snapshot': case 'get': case 'is': case 'read': case 'console': case 'errors': case 'vitals': case 'diff': return S(i18nKey('Read the page'));
    case 'find': return S(i18nKey('Find an element on the page and use it'));
    case 'screenshot': case 'pdf': return S(i18nKey('Take a picture of the page'));
    case 'scroll': case 'mouse': case 'drag': return S(i18nKey('Scroll or move on the page'));
    case 'back': return S(i18nKey('Go back'));
    case 'forward': return S(i18nKey('Go forward'));
    case 'reload': return S(i18nKey('Reload the page'));
    case 'wait': return S(i18nKey('Wait for the page'));
    case 'tab': case 'window': case 'frame': return S(i18nKey('Switch or open a tab'));
    case 'upload': return S(i18nKey('Upload {file} into the page'), { file: shorten(words[2] || words[1] || '?') });
    case 'download': return S(i18nKey('Download from the page'));
    case 'eval': return S(i18nKey('Run a script in the page'));
    case 'cookies': case 'storage': case 'state': return S(i18nKey('Read or change the page\'s cookies and storage'));
    case 'dialog': return S(i18nKey('Answer a dialog on the page'));
    case 'batch': return S(i18nKey('Run several browser steps'));
    case 'close': return all ? S(i18nKey('Close this conversation\'s browser')) : S(i18nKey('Close its tab'));
    case 'status': case 'profiles': case 'providers': case 'watch': case 'help': case '': return S(i18nKey('Check its browser'));
    case 'new': case 'use': case 'detach': case 'pin': case 'new-child': case 'backend': case 'blocked': return S(i18nKey('Manage its browser profiles'));
    default: return S(i18nKey('Run the browser command “{verb}”'), { verb: shorten(verb, 40) });
  }
}

/** One non-browser VibeSpace tool command → {verb, key, params}. */
function toolStep(tool, args) {
  const verb = (args.find((a) => !a.startsWith('-')) || '');
  const S = (key, params = {}) => ({ verb, key, params });
  switch (tool) {
    case 'vibespace-status': return S(i18nKey('Update this session\'s status'));
    case 'vibespace-task': return S(i18nKey('Report progress on its task'));
    case 'vibespace-ask': return S(i18nKey('Add an item to your For you inbox'));
    case 'vibespace-docs': return S(i18nKey('Read the VibeSpace manual'));
    case 'vibespace-msg': return verb === 'send' ? S(i18nKey('Message another agent')) : S(i18nKey('Read or manage agent messages'));
    case 'vibespace-window': return S(i18nKey('Use a desktop app window'));
    case 'vibespace-channels': return S(i18nKey('Read a channel or propose a reply'));
    case 'vibespace-page':
      if (verb === 'list') return S(i18nKey('List the pages it published'));
      if (verb === 'kit') return S(i18nKey('Prepare the design kit'));
      return args.includes('--public') ? S(i18nKey('Publish a page anyone with the link can open')) : S(i18nKey('Publish a page on this VibeSpace'));
    case 'vibespace-job':
      if (verb === 'run' || verb === 'start') return S(i18nKey('Start a background shell command'));
      if (verb === 'rm' || verb === 'stop') return S(i18nKey('Stop or remove one of its background jobs'));
      if (verb === 'notify-cron') return S(i18nKey('Schedule a reminder that wakes this conversation'));
      if (verb === 'access') return S(i18nKey('Let others see or control one of its background jobs'));
      return S(i18nKey('Check on a background job'));
    default: return null;
  }
}

/** The shell line a tool input carries: claude's Bash `command` string, or
 *  codex's argv (`["bash","-lc","…"]` → the script; any other argv joined). */
function agentCommandText(input) {
  const c = input && typeof input === 'object' ? (input.command !== undefined ? input.command : input.cmd) : null;
  if (Array.isArray(c)) {
    const a = c.map((x) => String(x));
    if (a.length === 3 && /^(?:\/(?:usr\/)?bin\/)?(?:ba|z|da|k)?sh$/.test(a[0]) && /^-l?c$/.test(a[1])) return a[2];
    return a.join(' ');
  }
  return typeof c === 'string' ? c : '';
}

const SCOPE_CLOSE_ALL = i18nKey('Closes only this conversation\'s browser — browsers of other sessions are not touched.');

/** A Bash command → the plain words a permission card shows, or null when no
 *  part of it is one of VibeSpace's own tools (or the line cannot be read
 *  safely). `browser` = the WHOLE line is browser steps (the card may wear the
 *  browser's face); `others` = the names of any other commands the line also
 *  runs (then the card stays a Bash card and says so — the S5-26 card was
 *  `vibespace-browser close --all; sleep 3; pgrep -f …`, and the scope sentence
 *  is exactly what its reader needed). Display only: the CLI decides
 *  permissions, never this. */
function describeAgentCommand(command) {
  const segs = splitShell(command);
  if (!segs || !segs.length) return null;
  const steps = [];
  const tools = new Set();
  const others = [];
  let scope = null;
  let prevOp = null;
  const other = (w, env = []) => {
    const n = [...env.map((v) => v.slice(0, v.indexOf('=')) + '=…'), shownHead(w[0])].join(' ');
    if (!others.includes(n)) others.push(n);
  };
  for (const seg of segs) {
    let w = seg.words.filter((x) => !QUIET_REDIRECT.test(x));
    const env = [];
    while (w.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0])) { if (!SAFE_ENV.test(w[0])) env.push(w[0]); w = w.slice(1); } // VAR=value prefix
    const piped = prevOp === '|';
    prevOp = seg.op;
    if (!w.length) continue;
    const head = w[0]; // the word AS WRITTEN — never its basename (r2)
    const writes = w.some((x) => /^[0-9&]?>/.test(x) || x.startsWith('<'));
    if (env.length) { other(w, env); continue; } // a prefix that can choose what runs: not our face
    if (piped && FILTERS.has(head) && !writes) continue;
    if (!piped && QUIET.has(head) && !writes) continue;
    if (writes || piped) { other(w); continue; } // a redirect into a file, or a pipe into a non-filter, is not the tool's act
    if (head === 'vibespace-browser') {
      const st = browserStep(w.slice(1));
      if (st.verb === 'close' && w.includes('--all')) scope = SCOPE_CLOSE_ALL;
      steps.push({ tool: head, ...st });
      tools.add(head);
      continue;
    }
    const st = tableRow(head) ? toolStep(head, w.slice(1)) : null;
    if (!st) { other(w); continue; }
    steps.push({ tool: head, ...st });
    tools.add(head);
  }
  if (!steps.length) return null;
  return { browser: !others.length && tools.size === 1 && tools.has('vibespace-browser'), tools: [...tools], steps, others, scope };
}

module.exports = {
  AGENT_TOOL_RULES, HELD_TOOLS, JOB_VERBS, PAGE_VERBS, CODEX_NOTE, SCOPE_CLOSE_ALL, WITHHELD_ASK, WITHHELD_HELD, SAFE_ENV,
  claudeAllowRules, claudeAskRules, ASK_RULE_MODES, spawnPermissionMode, claudeAskRulesFor, parseRule, ruleMatchesCommand, coveredByAgentToolRules,
  widenSuggestions, alwaysAllowFor, rulesText, splitShell, describeAgentCommand, agentCommandText,
};
