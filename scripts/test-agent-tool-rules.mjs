#!/usr/bin/env node
// LANE L — VIBESPACE'S OWN TOOLS NEVER ASK PER COMMAND (the naive-user study 2,
// 2026-09-25: "7 to 15 'Permission: Bash' cards per task, Always Allow does not
// stop the next one, the person feared `close --all` would close other people's
// browsers"). FAST, PURE, no server, no vendor call.
//
//   ① the rule table: every shipped rule is a 2.1.281 PREFIX rule, the spelling
//     the validator accepts (`:*` at the end, a non-empty prefix)
//   ② the matcher (a mirror of 2.1.281's `xOe`): the study's own commands match,
//     a look-alike tool / a held verb / a compound never do
//   ③ the census: every `vibespace-*` entry of hosts.js AGENT_TOOLS is in exactly
//     one of AGENT_TOOL_RULES / HELD_TOOLS; every listed or held job verb is a
//     real `case` of data/bin/vibespace-job
//   ④ widenSuggestions: the CLI's two-word suggestion becomes the tool's rule; a
//     held verb and every other rule pass through; nothing mutated
//   ⑤ describeAgentCommand: the plain words, the `close --all` scope, `others`,
//     a quoted `;` never splits, substitution/heredoc/unbalanced quotes ⇒ null
//   ⑥ the adapter: every spawn (chat / terminal / resume) carries the rules in
//     the ONE --settings flag; the row off carries none (NEGATIVE CONTROL); a
//     user's inline allow/deny kept; a user's --settings FILE untouched
//   ⑦ THE ALWAYS-ALLOW FIELD: the control_response names `updatedPermissions`
//     (the CLI's schema) and never `permission_updates` (stripped on arrival —
//     every Always Allow was a plain Allow)
//   ⑧ the harness row (claude declares allowAgentTools, default ON; codex not)
//   ⑨ the permission-mode words (every CLI mode has words + its raw value)
//   ⑩ i18n: every new key has zh AND ja
//   ⑪ the binary oracle (EVIDENCE SKIP without the CLI): the 2.1.281 strings the
//     measurements above were read from are still in the installed binary
//   ⑫ r2 — THE VERIFIER'S SIX FINDINGS, each pinned above with its number and
//     proven able to go red here: a patched copy of the module (mutant-copy)
//     with each fix reverted fails the pin it names
//     F1 the card wears our face only for the exact head the CLI's rule trusts
//        (a path-prefixed head, a PATH=… prefix ⇒ named in `others` / null)
//     F2 `vibespace-page publish` keeps asking (owner 2026-09-25): not in the
//        allow list, AND an ask rule in the same --settings JSON
//     F3 Always Allow on a HELD verb/tool is narrowed to the exact line, or
//        withheld with its sentence (an ask verb always withheld)
//     F4 the upload trade-off is written down (row why + setting description);
//        the refusal itself is test-browser-verbs' (r2 legs)
//     F5 ONE --settings flag under ultracode + a user's own --settings file
//     F6 rm/stop and notify-cron say what they do
//   ⑬ r3 — THE ASK RULE FOLLOWS THE SPAWN MODE (integrator 2026-09-26: our
//     rules never change what the user's chosen MODE does, they only keep OUR
//     allow list from widening): the publish ask rule rides a spawn whose mode
//     asks anyway (default / manual / acceptEdits / plan) and NO other —
//     bypassPermissions (full access), dontAsk, auto, and no --permission-mode
//     at all carry none; the allow list is verb-listed in every mode; the mode
//     is read off the argv the CLI receives (--dangerously-skip-permissions
//     outranks --permission-mode, the last --permission-mode wins); a
//     mid-session mode switch rewrites no settings; a patched copy that
//     always injects goes red on the bypass leg
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = require(path.join(REPO, 'src/agent-tool-rules.js'));
const { ClaudeCodeAdapter } = require(path.join(REPO, 'src/adapters/claude-code.js'));
const HS = require(path.join(REPO, 'src/harness-settings.js'));

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n      ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('① the rule table');
const RULES = R.claudeAllowRules();
const PAGE_VERBS = R.PAGE_VERBS || []; // (a pre-r2 module has none — the leg then says so instead of crashing)
ok(RULES.length === 8 + R.JOB_VERBS.length + PAGE_VERBS.length && PAGE_VERBS.length === 2, `one rule per whole tool (8) + one per listed job verb (${R.JOB_VERBS.length}) + one per listed page verb (${PAGE_VERBS.length}) = ${RULES.length}`);
ok(RULES.every((r) => { const p = R.parseRule(r); return p && p.toolName === 'Bash' && p.type === 'prefix' && p.prefix.trim() && p.content.endsWith(':*') && !p.content.slice(0, -2).includes(':*') && r === `Bash(${p.content})`; }), 'every rule is a Bash PREFIX rule in the spelling 2.1.281 validates (`:*` only at the end, never an empty prefix)');
ok(['vibespace-browser', 'vibespace-status', 'vibespace-task', 'vibespace-ask', 'vibespace-job poll'].every((t) => RULES.includes(`Bash(${t}:*)`)), 'the study\'s tools are named: browser / status / task / ask / job poll');
ok(!RULES.some((r) => /vibespace-job (run|start|access)\b/.test(r)) && !RULES.includes('Bash(vibespace-job:*)'), 'vibespace-job is NEVER allowed whole — run / start / access are held');
ok(!RULES.some((r) => /vibespace-exit|agent-browser/.test(r)), 'vibespace-exit (runs commands on another machine) and the agent-browser shim are not allowed');
ok(eq(RULES, R.claudeAllowRules()) && Object.isFrozen(R.AGENT_TOOL_RULES), 'the list is stable call to call and the table is frozen');
// r2 F2 (owner 2026-09-25: publish keeps asking)
ok(!RULES.some((r) => /vibespace-page publish/.test(r)) && !RULES.includes('Bash(vibespace-page:*)') && RULES.includes('Bash(vibespace-page list:*)') && RULES.includes('Bash(vibespace-page kit:*)'), 'F2: vibespace-page is VERB-LISTED — list / kit allowed, publish NOT in the allow list at all (a CLI without ask support still asks)');
const ASK = typeof R.claudeAskRules === 'function' ? R.claudeAskRules() : [];
ok(eq(ASK, ['Bash(vibespace-page publish:*)']) && ASK.every((r) => { const p = R.parseRule(r); return p && p.type === 'prefix' && p.toolName === 'Bash'; }), 'F2: …and publish rides the ask list (a 2.1.281 prefix rule; ask beats allow)', ASK);
ok(R.AGENT_TOOL_RULES.every((r) => (r.ask || []).every((v) => r.held && Object.prototype.hasOwnProperty.call(r.held, v) && !(r.verbs || []).includes(v))), 'every ask verb is a HELD verb and never a listed one');

console.log('② the matcher (the 2.1.281 prefix semantics)');
const covered = (c) => R.coveredByAgentToolRules(c);
ok(covered('vibespace-browser open https://the-internet.herokuapp.com/login'), 'vibespace-browser open <url> is covered (the study\'s first step)');
ok(covered('vibespace-browser click @e1') && covered('vibespace-browser fill @e3 "Alex Chén"') && covered('vibespace-browser snapshot -i'), 'click / fill / snapshot — every verb, one rule (the second, third … step no longer asks)');
ok(covered('vibespace-browser') && covered('vibespace-browser   status'), 'the bare tool and a doubled blank match (the CLI collapses blank runs)');
ok(!covered('vibespace-browserx open y') && !covered('xvibespace-browser open y'), 'a look-alike name never matches (prefix + a blank, not a substring)');
ok(covered('vibespace-job poll j_1') && !covered('vibespace-job run "rm -rf ~"') && !covered('vibespace-job start j_1') && !covered('vibespace-job access j_1 --control all'), 'job: poll covered; run / start / access NOT (they run a shell command or grant control)');
ok(!covered('vibespace-exit run box -- id'), 'vibespace-exit run is not covered');
ok(!covered('vibespace-page publish x.html --public') && !covered('vibespace-page publish x.html') && covered('vibespace-page list') && covered('vibespace-page kit'), 'F2: `vibespace-page publish x.html --public` is NOT covered; `vibespace-page list` / `kit` are');
ok(R.ruleMatchesCommand(ASK[0], 'vibespace-page publish x.html --public') && !R.ruleMatchesCommand(ASK[0], 'vibespace-page list'), 'F2: the ask rule matches every publish and nothing else of the tool');
ok(!covered('vibespace-browser open x && rm -rf /tmp/y') && !covered('vibespace-browser close --all; sleep 3; pgrep -f x'), 'a compound is never "one command" here (the CLI splits it and asks for the rm / pgrep)');
ok(R.ruleMatchesCommand('Bash(npm run *)', 'npm run') && R.ruleMatchesCommand('Bash(npm run *)', 'npm run build') && !R.ruleMatchesCommand('Bash(npm run *)', 'npm runx'), 'the wildcard spelling mirrors `( .*)?` (the CLI\'s own suggestion form)');
ok(!R.ruleMatchesCommand('Read(src/**)', 'vibespace-browser open x'), 'NEGATIVE CONTROL: a non-Bash rule never matches a shell command');

console.log('③ the census');
{
  const hostsSrc = fs.readFileSync(path.join(REPO, 'src/hosts.js'), 'utf8');
  const m = /static AGENT_TOOLS = \[([^\]]+)\]/.exec(hostsSrc);
  const tools = m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]).filter((n) => n.startsWith('vibespace-')) : [];
  ok(tools.length >= 10, `hosts.js AGENT_TOOLS read (${tools.length} vibespace-* entries)`);
  const inRules = new Set(R.AGENT_TOOL_RULES.map((r) => r.tool));
  const inHeld = new Set(Object.keys(R.HELD_TOOLS));
  const bad = tools.filter((t) => (inRules.has(t) ? 1 : 0) + (inHeld.has(t) ? 1 : 0) !== 1);
  ok(!bad.length, 'every vibespace-* agent tool is classified exactly once — allowed (with a why) or held (with a why): a NEW tool must be decided here', bad);
  ok([...inRules].every((t) => tools.includes(t)) && [...inHeld].every((t) => tools.includes(t)), 'no dead row: every classified tool still ships');
  ok(R.AGENT_TOOL_RULES.every((r) => typeof r.why === 'string' && r.why.length > 10) && Object.values(R.HELD_TOOLS).every((w) => w.length > 10), 'every row says WHY');
  const jobSrc = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-job'), 'utf8');
  const cases = new Set([...jobSrc.matchAll(/case '([a-z-]+)'/g)].map((x) => x[1]));
  const job = R.AGENT_TOOL_RULES.find((r) => r.tool === 'vibespace-job');
  ok(job.verbs.every((v) => cases.has(v)), 'every listed job verb is a real verb of data/bin/vibespace-job', job.verbs.filter((v) => !cases.has(v)));
  ok(Object.keys(job.held).every((v) => cases.has(v)) && job.verbs.every((v) => !(v in job.held)), 'every held job verb is real, and none is also listed');
  ok([...cases].filter((c) => !job.verbs.includes(c) && !(c in job.held)).length === 0, 'every job verb is decided: listed or held (a new verb must be classified)', [...cases].filter((c) => !job.verbs.includes(c) && !(c in job.held)));
  const pageSrc = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-page'), 'utf8');
  const pverbs = new Set([...pageSrc.matchAll(/if \(verb === '([a-z-]+)'\) \{/g)].map((x) => x[1]));
  const page = R.AGENT_TOOL_RULES.find((r) => r.tool === 'vibespace-page');
  ok(pverbs.size >= 3 && Array.isArray(page.verbs) && [...pverbs].every((v) => (page.verbs.includes(v) ? 1 : 0) + (page.held && v in page.held ? 1 : 0) === 1) && page.verbs.every((v) => pverbs.has(v)), `F2: every vibespace-page verb (${[...pverbs].join(', ')}) is decided exactly once — listed or held`, [...pverbs]);
  const br = R.AGENT_TOOL_RULES.find((r) => r.tool === 'vibespace-browser');
  ok(/type or upload/.test(br.why) && /~\/\.ssh/.test(br.why), 'F4: the browser row says the accepted trade-off (anything it can read it can type or upload) and names the refused stores');
}

console.log('④ widenSuggestions (the CLI suggests the first TWO words)');
{
  const cli = [{ type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: 'vibespace-browser click *' }, { toolName: 'Bash', ruleContent: 'vibespace-browser snapshot *' }, { toolName: 'Bash', ruleContent: 'vibespace-job run *' }, { toolName: 'Bash', ruleContent: 'git status *' }, { toolName: 'Bash', ruleContent: 'vibespace-job poll *' }], behavior: 'allow', destination: 'localSettings' }, { type: 'setMode', mode: 'acceptEdits', destination: 'session' }];
  const before = JSON.stringify(cli);
  const w = R.widenSuggestions(cli);
  ok(eq(w[0].rules, [{ toolName: 'Bash', ruleContent: 'vibespace-browser:*' }, { toolName: 'Bash', ruleContent: 'git status *' }, { toolName: 'Bash', ruleContent: 'vibespace-job poll:*' }]), 'the two browser verbs collapse into ONE whole-tool rule; a foreign command passes untouched; a listed job verb gets its own rule; a HELD verb with no line to narrow to is withheld (F3)', w[0].rules);
  ok(w[0].behavior === 'allow' && w[0].destination === 'localSettings' && eq(w[1], cli[1]), 'behavior / destination kept; a non-addRules update untouched');
  ok(JSON.stringify(cli) === before, 'the input is never mutated');
  ok(eq(R.widenSuggestions([{ type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: 'vibespace-browser click:*' }], behavior: 'allow', destination: 'localSettings' }])[0].rules, [{ toolName: 'Bash', ruleContent: 'vibespace-browser:*' }]), 'the legacy `:*` suggestion form widens too');
  ok(eq(R.rulesText(w), ['Bash(vibespace-browser:*)', 'Bash(git status *)', 'Bash(vibespace-job poll:*)']), 'rulesText spells them the way the CLI prints them (the Always Allow tooltip)');
  ok(eq(R.widenSuggestions([]), []) && R.widenSuggestions(null) === null, 'empty / absent suggestions pass through');
  // r2 F3 — the CLI's own builder (`ten`) suggests `${first two words} *` to localSettings for EVERY command,
  // so Always Allow on a held verb would persist "every future shell command through that verb"
  const one = (rule) => [{ type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: rule }], behavior: 'allow', destination: 'localSettings' }];
  const aaf = typeof R.alwaysAllowFor === 'function' ? R.alwaysAllowFor : () => ({ updates: null, withheld: null });
  const RUN = 'vibespace-job run "make test" --name t';
  const EXIT = 'vibespace-exit run box -- id';
  ok(eq(R.widenSuggestions(one('vibespace-job run *'), RUN), one(RUN)), 'F3: Always Allow on `vibespace-job run …` is narrowed to THAT exact line (the CLI\'s `een` form, no ` *`)', R.widenSuggestions(one('vibespace-job run *'), RUN));
  ok(eq(R.widenSuggestions(one('vibespace-exit run *'), EXIT), one(EXIT)), 'F3: …and on `vibespace-exit run …` (a held TOOL) too', R.widenSuggestions(one('vibespace-exit run *'), EXIT));
  ok(eq(R.widenSuggestions(one('vibespace-job run *')), []) && eq(R.widenSuggestions(one('vibespace-exit run *')), []) && aaf(one('vibespace-job run *')).withheld === R.WITHHELD_HELD && !!R.WITHHELD_HELD, 'F3: with no line to narrow to, the rule is withheld — the update dropped, the card\'s sentence named');
  ok(eq(R.widenSuggestions(one('git status *'), 'git status'), one('git status *')), 'F3 CONTROL: `git status *` is untouched (a foreign rule is the CLI\'s own business)');
  ok(eq(R.widenSuggestions(one('vibespace-job run *'), 'vibespace-job run x && echo y'), []) && eq(R.widenSuggestions(one('vibespace-job run *'), 'vibespace-job run "ls *.log"'), []) && eq(R.widenSuggestions(one('vibespace-job run *'), 'vibespace-job start j_1'), []), 'F3: a compound line, a line holding `*` (an exact rule with a star reads as a WILDCARD) and a line of another verb are never narrowed to — withheld');
  ok(eq(R.widenSuggestions(one('vibespace-job *'), RUN), one(RUN)) && eq(R.widenSuggestions(one('vibespace-job:*'), RUN), one(RUN)) && eq(R.widenSuggestions(one('vibespace-job r*'), RUN), one(RUN)), 'F3: a pattern over the whole verb-listed tool (`vibespace-job *`, `:*`, `r*`) reaches the held verbs — narrowed too');
  ok(eq(R.widenSuggestions(one(EXIT), EXIT), one(EXIT)), 'F3: an EXACT rule for a held command already names one line — kept');
  const pub = aaf(one('vibespace-page publish *'), 'vibespace-page publish x.html --public');
  ok(eq(pub.updates, []) && pub.withheld === R.WITHHELD_ASK && !!R.WITHHELD_ASK && eq(R.widenSuggestions(one('vibespace-page publish x.html --public'), 'vibespace-page publish x.html --public'), []), 'F2/F3: an ASK verb is ALWAYS withheld — no allow rule can win over the shipped ask rule, and the card says so', pub);
  ok(eq(R.widenSuggestions(one('vibespace-page list *'), 'vibespace-page list'), one('vibespace-page list:*')), 'a listed page verb gets its own rule');
  ok(eq(R.widenSuggestions([...one('vibespace-job run *'), { type: 'setMode', mode: 'acceptEdits', destination: 'session' }]), [{ type: 'setMode', mode: 'acceptEdits', destination: 'session' }]), 'a dropped addRules update leaves the other updates alone');
}

console.log('⑤ describeAgentCommand (display only)');
{
  const d = R.describeAgentCommand;
  const w = (c) => (d(c)?.steps || []).map((s) => [s.key, s.params]);
  ok(eq(w('vibespace-browser open https://example.com'), [['Open {url}', { url: 'https://example.com' }]]) && d('vibespace-browser open https://example.com').browser === true, 'open <url> ⇒ "Open {url}", a browser card');
  ok(eq(w('vibespace-browser click @e1 2>&1 | grep -v \'^note:\\|^profile:\'; vibespace-browser snapshot'), [['Click {target}', { target: '@e1' }], ['Read the page', {}]]) && d('vibespace-browser click @e1 2>&1 | grep -v x; vibespace-browser snapshot').browser, 'the study\'s S1-24 shape (2>&1, a grep filter, a second verb) ⇒ two steps, still a browser card');
  const s526 = d('vibespace-browser close --all; sleep 3; pgrep -f "user-data-dir=/tmp/x"');
  ok(s526 && s526.scope === R.SCOPE_CLOSE_ALL && /only this conversation/.test(s526.scope) && eq(s526.others, ['pgrep']) && s526.browser === false, 'the study\'s S5-26 card: close --all SAYS its scope, names the other command it runs (pgrep), and stays a Bash card', s526);
  ok(d('vibespace-browser close').scope === null && d('vibespace-browser close').steps[0].key === 'Close its tab', 'a plain close closes the tab and owes no scope sentence');
  ok(eq(w('vibespace-browser fill @e1 "a; rm -rf /"'), [['Type into {target}', { target: '@e1' }]]) && !d('vibespace-browser fill @e1 "a; rm -rf /"').others.length, 'a `;` inside quotes never splits the line');
  ok(d('echo $(id)') === null && d('vibespace-browser open "$(cat x)"') === null && d('cat <<EOF\nx\nEOF') === null && d('vibespace-browser open "x') === null, 'substitution / heredoc / an unbalanced quote ⇒ null (the raw command is shown)');
  ok(d('git status') === null && d('ls -la') === null, 'NEGATIVE CONTROL: a command that is not ours ⇒ null');
  ok(eq(d('rm -rf ~/x; vibespace-browser open y').others, ['rm']) && !d('rm -rf ~/x; vibespace-browser open y').browser, 'a line that also runs something else is never a browser card and names it');
  ok(!d('vibespace-browser open x | sh').browser && eq(d('vibespace-browser open x | sh').others, ['sh']), 'a pipe into a non-filter is named, never folded away');
  ok(d('vibespace-browser snapshot > /tmp/page.txt') === null, 'a redirect into a file is not the tool\'s act ⇒ no plain words');
  ok(d('VIBESPACE_BROWSER=bk-1 vibespace-browser open https://x.y').steps[0].key === 'Open {url}', 'a VAR=value prefix (the documented VIBESPACE_BROWSER form) is read past');
  ok(d('vibespace-job run "rm -rf ~"').steps[0].key === 'Start a background shell command' && d('vibespace-page publish x.html --public').steps[0].key.includes('anyone with the link'), 'a held job verb and a public page say what they do');
  ok(R.agentCommandText({ command: ['bash', '-lc', 'vibespace-browser open https://x'] }) === 'vibespace-browser open https://x' && R.agentCommandText({ command: 'vibespace-status set x' }) === 'vibespace-status set x' && R.agentCommandText({ cmd: ['ls', '-la'] }) === 'ls -la', 'agentCommandText: claude\'s string, codex\'s `bash -lc` script, any other argv joined');
  ok(d('vibespace-browser open ' + 'u'.repeat(400)).steps[0].params.url.length <= 120, 'a long url is shortened for the card (the Input keeps it whole)');
  // r2 F1 — THE CARD WEARS OUR FACE ONLY FOR THE EXACT HEAD THE CLI'S RULE TRUSTS: 2.1.281 never
  // path-strips a head on the allow path, so `./data/bin/vibespace-browser open x` ASKS — and a card
  // reading "Permission: Agent browser — Open x" for it (or for `/tmp/evil/vibespace-browser`) is the
  // one card a naive user clicks Allow on
  ok(d('./data/bin/vibespace-browser open x') === null && d('/tmp/evil/vibespace-browser open x') === null, 'F1: a path-prefixed head alone ⇒ null (the raw Bash card), never the browser face', [d('./data/bin/vibespace-browser open x'), d('/tmp/evil/vibespace-browser open x')]);
  const mixed = d('vibespace-browser open x; /tmp/evil/vibespace-browser click y');
  ok(mixed && mixed.browser === false && eq(mixed.others, ['/tmp/evil/vibespace-browser']), 'F1: …beside a real step it is named AS WRITTEN in `others` (also runs: /tmp/evil/vibespace-browser)', mixed);
  ok(d('PATH=/tmp/evil vibespace-browser open x') === null && d('NODE_OPTIONS=--require=/tmp/e.js vibespace-status set x') === null && eq(d('vibespace-browser open x && PATH=/tmp/evil vibespace-browser click y').others, ['PATH=… vibespace-browser']), 'F1: a VAR= prefix outside the safe set (PATH=, NODE_OPTIONS=) chooses what runs — no face, named with its variable');
  ok(d('/tmp/x/vibespace-job poll j_1') === null && d('vibespace-browser snapshot | /tmp/evil/grep x').browser === false, 'F1: the same rule for every tool and for the filters (a path-prefixed `grep` is not our filter)');
  ok(d('vibespace-browser open x').browser === true && d('VIBESPACE_BROWSER=bk-1 vibespace-browser open x').browser === true, 'F1 CONTROL: the bare head (and the documented VIBESPACE_BROWSER= prefix) still wears the face');
  // r2 F6 — a destructive / wake-scheduling verb is not "check on"
  ok(d('vibespace-job rm j_1 --stop').steps[0].key === 'Stop or remove one of its background jobs' && d('vibespace-job stop j_1').steps[0].key === 'Stop or remove one of its background jobs', 'F6: `vibespace-job rm|stop` ⇒ "Stop or remove one of its background jobs"');
  ok(d('vibespace-job notify-cron --name x --every 12h --text y').steps[0].key === 'Schedule a reminder that wakes this conversation', 'F6: `vibespace-job notify-cron` ⇒ "Schedule a reminder that wakes this conversation"');
  ok(d('vibespace-job access j_1 --control all').steps[0].key === 'Let others see or control one of its background jobs' && d('vibespace-job poll j_1').steps[0].key === 'Check on a background job', 'F6: `access` (a held verb that DOES ask) says what it grants; `poll` still reads as a check (CONTROL)');
  ok(d('vibespace-page list').steps[0].key === 'List the pages it published' && d('vibespace-page kit').steps[0].key === 'Prepare the design kit', 'the page verbs that no longer ask say what they are (never "Publish a page" for a list)');
}

console.log('⑥ the adapter (every spawn, one --settings flag)');
{
  const a = new ClaudeCodeAdapter({ claudeCmd: 'claude' });
  const so = (o) => { const r = a.buildSessionArgs({ cwd: '/tmp', mode: 'chat', ...o }); const i = r.args.indexOf('--settings'); return i < 0 ? null : JSON.parse(r.args[i + 1]); };
  ok(eq(so({})?.permissions?.allow, RULES), 'chat, no settings bag: the rules ride --settings permissions.allow (default ON)');
  ok(eq(so({ mode: 'terminal' })?.permissions?.allow, RULES) && eq(so({ resumeId: 'abc' })?.permissions?.allow, RULES), 'terminal mode and a resume carry them too (every spawn)');
  ok(eq(so({ settings: { allowAgentTools: true } })?.permissions?.allow, RULES), 'the row ON (the bag) carries them');
  const off = so({ settings: { allowAgentTools: false } });
  ok(!!off && !('permissions' in off), 'NEGATIVE CONTROL: the row OFF ⇒ no permissions key at all (autoContinue still rides)', off);
  const user = so({ extraArgs: ['--settings', JSON.stringify({ permissions: { allow: ['Bash(git:*)', 'Bash(vibespace-browser:*)'], deny: ['Read(./.env)'] } })] });
  ok(user && user.permissions.allow[0] === 'Bash(git:*)' && user.permissions.allow.filter((r) => r === 'Bash(vibespace-browser:*)').length === 1 && eq(user.permissions.deny, ['Read(./.env)']) && RULES.every((r) => user.permissions.allow.includes(r)), 'a user\'s own inline allow is KEPT (first), ours appended without a duplicate, their deny untouched');
  const file = a.buildSessionArgs({ cwd: '/tmp', mode: 'chat', extraArgs: ['--settings', '/home/u/my-settings.json'] });
  ok(file.args[file.args.indexOf('--settings') + 1] === '/home/u/my-settings.json', 'a user\'s --settings FILE is never overwritten (the default stands down, like autoContinue)');
  const one = a.buildSessionArgs({ cwd: '/tmp', mode: 'chat', effort: 'ultracode', settings: { disableModelFallback: true }, neutralizeKeyHelper: true });
  const o1 = JSON.parse(one.args[one.args.indexOf('--settings') + 1]);
  ok(one.args.filter((x) => x === '--settings').length === 1 && o1.ultracode === true && o1.switchModelsOnFlag === false && o1.apiKeyHelper === '' && eq(o1.permissions.allow, RULES), 'ONE --settings flag carries every key (ultracode, fallback, keyHelper, the rules)');
  // r2 F2: the ask list rides the same JSON; a user's own inline ask is kept (first)
  // (r3: only in a mode that asks anyway — ⑬ pins every mode; `default` here)
  const one3 = a.buildSessionArgs({ cwd: '/tmp', mode: 'chat', permissionMode: 'default', effort: 'ultracode', settings: { disableModelFallback: true }, neutralizeKeyHelper: true });
  const o3 = JSON.parse(one3.args[one3.args.indexOf('--settings') + 1]);
  ok(eq(so({ permissionMode: 'default' })?.permissions?.ask, ASK) && eq(so({ mode: 'terminal', permissionMode: 'default' })?.permissions?.ask, ASK) && one3.args.filter((x) => x === '--settings').length === 1 && eq(o3.permissions.ask, ASK) && o3.ultracode === true, 'F2: a spawn in the default mode carries permissions.ask = the publish rule, in the ONE --settings flag (chat, terminal, beside ultracode)');
  const uask = so({ permissionMode: 'default', extraArgs: ['--settings', JSON.stringify({ permissions: { ask: ['Bash(git push:*)', 'Bash(vibespace-page publish:*)'] } })] });
  ok(uask && eq(uask.permissions.ask, ['Bash(git push:*)', 'Bash(vibespace-page publish:*)']) && eq(uask.permissions.allow, RULES), 'F2: a user\'s own inline ask is kept first, ours appended without a duplicate', uask && uask.permissions);
  // r2 F5: ultracode + a user's own --settings FILE ⇒ ONE flag, the user's path; the stand-down is said
  const warn = console.warn; const warned = []; console.warn = (...a) => warned.push(a.join(' '));
  let uf; try { uf = a.buildSessionArgs({ cwd: '/tmp', mode: 'chat', effort: 'ultracode', extraArgs: ['--settings', '/home/u/s.json'] }); } finally { console.warn = warn; }
  ok(uf.args.filter((x) => x === '--settings').length === 1 && uf.args[uf.args.indexOf('--settings') + 1] === '/home/u/s.json' && uf.args.join(' ').includes('--effort xhigh'), 'F5: effort ultracode + the user\'s `--settings <file>` ⇒ exactly ONE --settings flag, and it is the user\'s path', uf.args);
  ok(Array.isArray(uf.notes) && /ultracode stands down/.test(uf.notes[0]) && warned.some((l) => /\[claude-adapter\] ultracode stands down/.test(l)), 'F5: …the stand-down is SAID (spec.notes + one journal line)', [uf.notes, warned]);
  const ui = a.buildSessionArgs({ cwd: '/tmp', mode: 'chat', effort: 'ultracode', extraArgs: ['--settings', JSON.stringify({ model: 'x' })] });
  const oi = JSON.parse(ui.args[ui.args.indexOf('--settings') + 1]);
  ok(ui.args.filter((x) => x === '--settings').length === 1 && oi.model === 'x' && oi.ultracode === true && eq(oi.permissions.allow, RULES) && !ui.notes, 'F5: ultracode + a user\'s INLINE JSON ⇒ one flag carrying both (no stand-down)', ui.args);
  console.warn = () => {};
  let ue; try { ue = a.buildSessionArgs({ cwd: '/tmp', mode: 'chat', effort: 'ultracode', extraArgs: ['--settings=/home/u/s.json'] }); } finally { console.warn = warn; }
  ok(ue.args.filter((x) => x === '--settings' || x.startsWith('--settings=')).length === 1 && ue.args[ue.args.indexOf('--settings') + 1] === '/home/u/s.json', 'F5: the `--settings=<file>` spelling is the same one flag', ue.args);
}

console.log('⑦ the Always Allow field (the CLI\'s spelling)');
{
  const upd = [{ type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: 'vibespace-browser:*' }], behavior: 'allow', destination: 'localSettings' }];
  const r = ClaudeCodeAdapter.buildPermissionResponse('req-1', true, { command: 'x' }, upd);
  ok(eq(r.response.response.updatedPermissions, upd), 'an approved response carries the updates as `updatedPermissions` (2.1.281 schema: {behavior, updatedInput?, updatedPermissions?, toolUseID?, decisionClassification?})');
  ok(!('permission_updates' in r.response.response), 'and NEVER `permission_updates` — a key the CLI strips on arrival (the reason every Always Allow was a plain Allow)');
  const plain = ClaudeCodeAdapter.buildPermissionResponse('req-2', true, { command: 'x' }, []);
  ok(!('updatedPermissions' in plain.response.response), 'a plain Allow carries no updates');
  const deny = ClaudeCodeAdapter.buildPermissionResponse('req-3', false, null, upd);
  ok(deny.response.response.behavior === 'deny' && !('updatedPermissions' in deny.response.response), 'a Deny never carries a rule');
  const rendSrc = fs.readFileSync(path.join(REPO, 'src/lib/chat-renderers.js'), 'utf8');
  ok(/permissionUpdates: always \}/.test(rendSrc) && /const aa = alwaysAllowFor\(msg\.permission\.suggestions \|\| \[\], agentCommandText\(msg\.permission\.input\)\);\n\s*const always = aa\.updates/.test(rendSrc), 'WIRING PIN: the card\'s Always Allow sends the WIDENED (r2: or narrowed) suggestions for THIS command line (the chrome suite drives it for real)');
  ok(/\$\{always\.length \? `<button class="chat-perm-btn chat-perm-always"/.test(rendSrc) && /aa\.withheld && !always\.length \? `<div class="chat-permission-withheld">\$\{escHtml\(t\(aa\.withheld\)\)\}/.test(rendSrc), 'F3 WIRING PIN: the button shows only when a rule survives, and when none does the withheld sentence (escHtml\'d) stands where the button would be — never a silent missing button, never a sentence beside a live button');
  const accCalls = [...rendSrc.matchAll(/agentBrowserHeadHtml\(([^)]*)\)/g)].map((m) => m[1]).filter((x) => x !== 'desc');
  ok(accCalls.length >= 3 && accCalls.every((x) => new RegExp(`${x.replace(/[.?]/g, (c) => '\\' + c)}\\?\\.browser \\? agentBrowserHeadHtml\\(${x}\\)`).test(rendSrc)) && /const ac(?:Done)? = (?:isAgent \? null : )?agentCommandOf\(block\.input\)/.test(rendSrc) && /return cmd \? describeAgentCommand\(cmd\) : null;/.test(rendSrc), `F1 WIRING PIN: every tool-card head that wears the browser face (${accCalls.length}: pending / error / done) is gated on the classifier's \`.browser\` — so the exact-head rule governs them too`, accCalls);
  const css = fs.readFileSync(path.join(REPO, 'public/chat.css'), 'utf8');
  ok(/\.chat-perm-btn\.chat-perm-allow:hover \{[^}]*background: var\(--green\)/.test(css), 'the hovered Allow keeps its green (a (0,3,0) rule over `.chat-perm-btn:hover`) — the S9-68 "dead" button');
}

console.log('⑧ the harness row');
{
  const row = HS.rowOf(HS.HARNESS_SETTINGS.claude, 'allowAgentTools');
  ok(!!row && row.type === 'boolean' && row.default === true && row.apply.kind === 'spawn' && !row.apply.mode && !row.apply.via, 'claude declares allowAgentTools: boolean, default ON, a SPAWN row (both modes, through the bag)');
  ok(HS.coerce(row, undefined) === true && HS.coerce(row, false) === false && HS.coerce(row, 'false') === true, 'unset ⇒ ON; only an explicit false turns it off (the string "false" is not a boolean)');
  ok(!HS.rowOf(HS.HARNESS_SETTINGS.codex, 'allowAgentTools'), 'codex declares no such row — its reason is written down (CODEX_NOTE)');
  ok(/CODEX_HOME/.test(R.CODEX_NOTE) && /sandbox/.test(R.CODEX_NOTE), 'CODEX_NOTE names the mechanism that exists and why it is not shipped');
  ok(/vibespace-job run/.test(row.description) && /nothing is written/i.test(row.description), 'the description says what stays asked and that no settings file is written');
  ok(/vibespace-page publish\) asks every time/.test(row.description), 'F2: the description says publishing a page asks every time');
  ok(/asks every time, unless the session runs with full access/.test(row.description) && !/even with full access/.test(row.description) && /mode that asks anyway/.test(row.apply.how), 'r3: …and that full access is the exception (the ask rule follows the spawn mode) — never "even with full access"');
  ok(/type or upload into a web page without asking/.test(row.description) && /~\/\.ssh/.test(row.description), 'F4: the description states the trade-off (anything the agent can read it can type or upload into a page without asking) and the refused stores');
}

console.log('⑨ the permission-mode words');
{
  const L = await import(pathToFileURL(path.join(REPO, 'src/lib/permission-mode-labels.js')).href);
  const tt = (s) => s;
  const cliModes = (() => { const m = /let PERMISSION_MODES = \[([^\]]+)\]/.exec(fs.readFileSync(path.join(REPO, 'src/server/cli-env.js'), 'utf8')); return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : []; })();
  ok(cliModes.length >= 6 && cliModes.every((v) => L.permissionModeWords('claude', v, tt)), `every mode the CLI's --help lists has words (${cliModes.join(', ')})`);
  ok(cliModes.every((v) => { const lab = L.permissionModeLabel('claude', v, tt); return lab.endsWith(' · ' + v) && lab !== v; }), 'each option reads "<words> · <raw value>" — the protocol value stays visible as a hint');
  ok(L.permissionModeLabel('claude', 'bypassPermissions', tt) === 'Never ask (full access) · bypassPermissions' && L.permissionModeLabel('claude', 'dontAsk', tt).startsWith('Never ask — refuse'), 'bypassPermissions / dontAsk say what they do');
  ok(!L.permissionModeLabel('claude', '', tt).includes('·'), 'the empty value (no flag) has no raw spelling to show');
  ok(L.permissionModeLabel('claude', 'manual', tt) === 'Ask before acting · manual', '`manual` (2.1.281\'s --help; the CLI maps it to `default`) reads as asking');
  ok(L.permissionModeLabel('claude', 'someNewMode', tt) === 'someNewMode', 'a mode a newer CLI adds shows its raw value, never hidden');
  ok(['', 'read-only', 'safe-yolo', 'yolo'].every((v) => L.permissionModeWords('codex', v, tt)), 'codex\'s four modes have words too');
  const opts = L.permissionModeOptions('claude', ['', 'default'], tt);
  ok(eq(opts.map((o) => o.value), ['', 'default']), 'the option VALUES are the protocol strings, unchanged');
}

console.log('⑩ i18n');
{
  const load = (f) => { const s = fs.readFileSync(path.join(REPO, 'src/lib', f), 'utf8'); const out = new Set(); for (const l of s.split('\n')) { const x = l.match(/^  ("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'): /); if (x) { try { out.add(new Function('return ' + x[1])()); } catch { } } } return out; };
  const zh = load('i18n-zh.js'), ja = load('i18n-ja.js');
  const keys = new Set(['Agent browser', 'also runs: {cmds}', 'Always allow: {rules}']);
  const lit = /\b(?:t|i18nKey)\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;
  for (const f of ['src/agent-tool-rules.js', 'src/lib/permission-mode-labels.js']) for (const m of fs.readFileSync(path.join(REPO, f), 'utf8').matchAll(lit)) keys.add(new Function('return ' + (m[1] !== undefined ? "'" + m[1] + "'" : '"' + m[2] + '"'))());
  const row = HS.rowOf(HS.HARNESS_SETTINGS.claude, 'allowAgentTools');
  keys.add(row.label); keys.add(row.description);
  const miss = [...keys].filter((k) => !zh.has(k) || !ja.has(k));
  ok(keys.size >= 50 && !miss.length, `every new key (${keys.size}) has a zh AND a ja entry`, miss);
}

console.log('⑪ the binary oracle (the strings the measurements were read from)');
{
  const bin = (() => { try { return fs.realpathSync(path.join(os.homedir(), '.local/bin/claude')); } catch { return null; } })();
  let buf = null;
  if (bin) { try { const st = fs.statSync(bin); if (st.size > 50e6) buf = fs.readFileSync(bin); } catch { } }
  if (!buf) skip('no native claude binary at ~/.local/bin/claude — the 2.1.281 measurements stand as recorded in src/agent-tool-rules.js');
  else {
    const has = (s) => buf.indexOf(s) >= 0;
    const ver = path.basename(bin);
    ok(has('Bash(npm run:*) - prefix matching (legacy)'), `${ver}: the validator still accepts the legacy prefix spelling we ship`);
    ok(has('if(Pe===xe)return!0;if(Pe.startsWith(xe+" "))return!0') || has('.startsWith(e.prefix+" ")'), `${ver}: prefix matching is still "equal, or followed by a blank"`);
    ok(/behavior:R\("allow"\),updatedInput:me\(o\(\),ae\(\)\)\.optional\(\),updatedPermissions:C\(/.test(buf.toString('latin1', 0, buf.length)), `${ver}: the stdio permission result still names updatedPermissions`);
    ok(has('["userSettings","projectSettings","localSettings","flagSettings","policySettings"]'), `${ver}: flagSettings (the --settings layer) is still a rule source`);
    ok(has('["permissions.allow","permissions.deny","permissions.ask"]'), `${ver}: r2 F2 — permissions.ask is still a settings rule list (the publish ask rule rides it)`);
    ok(/\{type:"addRules",rules:\[\{toolName:[A-Za-z$_]+,ruleContent:`\$\{[A-Za-z$_]+\} \*`\}\],behavior:"allow",destination:"localSettings"\}/.test(buf.toString('latin1', 0, buf.length)), `${ver}: r2 F3 — the CLI still suggests \`<words> *\` to localSettings (the rule a held verb's Always Allow would have persisted)`);
  }
}

console.log('⑫ r2 controls: each finding\'s pin goes red on a patched copy with that fix reverted');
{
  const M = mutantCopies('agent-tool-rules', REPO);
  const src = fs.readFileSync(path.join(REPO, 'src/agent-tool-rules.js'), 'utf8');
  const mut = (tag, pairs) => { let x = src; for (const [a, b] of pairs) { if (!x.includes(a)) return null; x = x.replace(a, b); } return M.load('src/agent-tool-rules.js', x, tag); };
  // F1: the pre-fix head — the basename of the word, every VAR= prefix read past
  const f1 = mut('f1', [['const head = w[0]; // the word AS WRITTEN', 'const head = String(w[0] || \'\').split(\'/\').pop(); //'], ['if (env.length) { other(w, env); continue; }', 'if (false) { other(w, env); continue; }']]);
  ok(!!f1 && f1.describeAgentCommand('./data/bin/vibespace-browser open x')?.browser === true && f1.describeAgentCommand('PATH=/tmp/evil vibespace-browser open x')?.browser === true, 'F1 CONTROL: the pre-fix head (basename, any VAR= read past) dresses ./data/bin/vibespace-browser and PATH=… as the Agent browser — the F1 pins can go red');
  // F2: the pre-fix whole-tool row
  const f2 = mut('f2', [["tool: 'vibespace-page', verbs: PAGE_VERBS,", "tool: 'vibespace-page', verbs: null,"], ["ask: Object.freeze(['publish']),", '']]);
  ok(!!f2 && f2.coveredByAgentToolRules('vibespace-page publish x.html --public') === true && f2.claudeAskRules().length === 0, 'F2 CONTROL: the pre-fix whole-tool row covers `publish --public` and ships no ask rule — the F2 pins can go red');
  // F3: the pre-fix pass-through of held rules
  const f3 = mut('f3', [['  if (!/(^|[^\\\\])\\*/.test(content)) return { rule: rv };\n  const exact = exactRuleFor(command, head, plainVerb ? verb : null);\n  return exact ? { rule: exact } : { rule: null, withheld: WITHHELD_HELD };', '  return { rule: rv };']]);
  ok(!!f3 && eq(f3.widenSuggestions([{ type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: 'vibespace-job run *' }], behavior: 'allow', destination: 'localSettings' }], 'vibespace-job run x')[0].rules, [{ toolName: 'Bash', ruleContent: 'vibespace-job run *' }]), 'F3 CONTROL: without the narrowing, `vibespace-job run *` is persisted as-is — the F3 pins can go red');
  // F6: the pre-fix job words
  const f6 = mut('f6', [["      if (verb === 'rm' || verb === 'stop') return S(i18nKey('Stop or remove one of its background jobs'));\n      if (verb === 'notify-cron') return S(i18nKey('Schedule a reminder that wakes this conversation'));\n", '']]);
  ok(!!f6 && f6.describeAgentCommand('vibespace-job rm j_1 --stop').steps[0].key === 'Check on a background job', 'F6 CONTROL: the pre-fix words read `rm --stop` as "Check on a background job" — the F6 pins can go red');
  // F5: the pre-fix adapter (ultracode pushed as its own flag before extraArgs)
  const asrc = fs.readFileSync(path.join(REPO, 'src/adapters/claude-code.js'), 'utf8');
  const a5s = asrc.replace("      args.push('--effort', 'xhigh');\n", "      args.push('--effort', 'xhigh', '--settings', JSON.stringify({ ultracode: true }));\n").replace('      if (userSettingsMergeable) mergeSettings({ ultracode: true });', '      if (false) mergeSettings({ ultracode: true });');
  const A5 = a5s !== asrc ? M.load('src/adapters/claude-code.js', a5s, 'f5').ClaudeCodeAdapter : null;
  const warn = console.warn; console.warn = () => {};
  let n5 = -1; try { n5 = A5 ? new A5({ claudeCmd: 'claude' }).buildSessionArgs({ cwd: '/tmp', mode: 'chat', effort: 'ultracode', extraArgs: ['--settings', '/home/u/s.json'] }).args.filter((x) => x === '--settings').length : -1; } finally { console.warn = warn; }
  ok(n5 === 2, `F5 CONTROL: the pre-fix ultracode push makes TWO --settings flags beside a user's file (${n5}) — the F5 pin can go red`);
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 5, label: '⑫ ' })) ok(r.pass, r.name, r.detail);
}

console.log('⑬ r3 — the publish ask rule follows the SPAWN mode (our rules never change what the chosen mode does)');
{
  const permsOf = (A, o) => { const r = new A({ claudeCmd: 'claude' }).buildSessionArgs({ cwd: '/tmp', mode: 'chat', ...o }); const i = r.args.indexOf('--settings'); const s = i < 0 ? null : JSON.parse(r.args[i + 1]); return s && s.permissions ? s.permissions : null; };
  const P = (o) => permsOf(ClaudeCodeAdapter, o);
  const ASKING = ['default', 'manual', 'acceptEdits', 'plan'];
  const NOT_ASKING = ['bypassPermissions', 'dontAsk', 'auto'];
  const noAsk = (p) => !!p && !('ask' in p) && eq(p.allow, RULES);
  // THE BYPASS LEG (the regression r2 shipped: publish prompted under full access)
  const bypassLeg = (A) => noAsk(permsOf(A, { permissionMode: 'bypassPermissions' })) && noAsk(permsOf(A, { permissionMode: 'bypassPermissions', mode: 'terminal' })) && noAsk(permsOf(A, { permissionMode: 'bypassPermissions', resumeId: 'abc' }));
  ok(bypassLeg(ClaudeCodeAdapter), 'r3: bypassPermissions (full access) carries NO permissions.ask — chat, terminal and a resume — so publish runs without asking, as it did before lane L; the allow list is the same verb-listed one', P({ permissionMode: 'bypassPermissions' }));
  ok(ASKING.every((m) => eq(P({ permissionMode: m })?.ask, ASK) && eq(P({ permissionMode: m, mode: 'terminal' })?.ask, ASK)), 'r3: a mode that asks anyway (default / manual / acceptEdits / plan) carries permissions.ask = the publish rule (chat and terminal) — so a user\'s own broader allow never pre-approves a publish there', ASKING.map((m) => [m, P({ permissionMode: m })?.ask]));
  ok(noAsk(P({ permissionMode: 'dontAsk' })) && noAsk(P({ permissionMode: 'auto' })), 'r3: dontAsk (publish is not pre-approved ⇒ refused, as always) and auto (its own safety check decides) carry no ask rule');
  ok(noAsk(P({})), 'r3: no --permission-mode at all (the CLI\'s own setting decides — unknown at spawn: 2.1.281 takes a user\'s defaultMode, bypass included, or falls to auto) ⇒ no ask rule', P({}));
  ok([...ASKING, ...NOT_ASKING, undefined].every((m) => { const p = P(m ? { permissionMode: m } : {}); return !!p && eq(p.allow, RULES) && !p.allow.some((r) => /vibespace-page publish|vibespace-page:\*/.test(r)); }), 'r3: the allow list is VERB-LISTED in every mode — list / kit, never publish (that half never widens)');
  // the argv the CLI receives decides (2.1.281 `Rvr`: --dangerously-skip-permissions is the first candidate; commander keeps the last --permission-mode)
  ok(noAsk(P({ permissionMode: 'default', extraArgs: ['--dangerously-skip-permissions'] })), 'r3: --dangerously-skip-permissions in the session\'s own args outranks --permission-mode default ⇒ full access ⇒ no ask rule');
  ok(noAsk(P({ permissionMode: 'default', extraArgs: ['--permission-mode', 'bypassPermissions'] })) && eq(P({ extraArgs: ['--permission-mode=plan'] })?.ask, ASK) && eq(P({ permissionMode: 'bypassPermissions', extraArgs: ['--permission-mode', 'acceptEdits'] })?.ask, ASK), 'r3: a --permission-mode in the session\'s own args is the one the CLI keeps (the last; both spellings)');
  const ub = P({ permissionMode: 'bypassPermissions', extraArgs: ['--settings', JSON.stringify({ permissions: { ask: ['Bash(git push:*)'] } })] });
  ok(!!ub && eq(ub.ask, ['Bash(git push:*)']) && eq(ub.allow, RULES), 'r3: under full access a user\'s OWN inline ask is kept verbatim — we add nothing and remove nothing', ub);
  // the PURE verdict
  const SPM = R.spawnPermissionMode;
  ok(typeof SPM === 'function' && SPM(['--permission-mode', 'plan', '--dangerously-skip-permissions']) === 'bypassPermissions' && SPM(['--permission-mode', 'plan', '--permission-mode', 'default']) === 'default' && SPM(['--permission-mode=acceptEdits']) === 'acceptEdits' && SPM(['--model', 'x']) === null && SPM([]) === null && SPM(null) === null, 'r3: spawnPermissionMode(argv) — skip-permissions ⇒ bypassPermissions, else the last --permission-mode (both spellings), else null (unknown)');
  ok(Array.isArray(R.ASK_RULE_MODES) && eq([...R.ASK_RULE_MODES].sort(), [...ASKING].sort()) && Object.isFrozen(R.ASK_RULE_MODES) && typeof R.claudeAskRulesFor === 'function' && eq(R.claudeAskRulesFor('plan'), ASK) && eq(R.claudeAskRulesFor('bypassPermissions'), []) && eq(R.claudeAskRulesFor(null), []), 'r3: ASK_RULE_MODES = exactly the modes that ask anyway; claudeAskRulesFor(mode) = the ask rules there, [] anywhere else');
  // a mid-session mode switch rewrites no settings ⇒ the ask rule follows the SPAWN mode
  const sw = ClaudeCodeAdapter.buildSetPermissionMode('bypassPermissions');
  ok(eq(Object.keys(sw.request).sort(), ['mode', 'subtype']) && sw.request.subtype === 'set_permission_mode', 'r3: the mid-session mode switch (set_permission_mode) carries the mode alone — no settings are rewritten, so the ask rule follows the SPAWN mode (a switch takes effect on the next spawn)');
  const a3 = new ClaudeCodeAdapter({ claudeCmd: 'claude' });
  const flagReqs = [a3.formatSetEffort('ultracode'), a3.formatSetEffort('high'), a3.formatSetEffort(''), a3.formatSetFallbackPolicy(true), a3.formatSetFallbackPolicy(false)].map((x) => JSON.parse(x).request);
  const srcHits = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (/\.(c|m)?js$/.test(e.name)) fs.readFileSync(f, 'utf8').split('\n').forEach((l, i) => { if (l.includes("subtype: 'apply_flag_settings'") && /\bpermissions\b/.test(l)) srcHits.push(path.relative(REPO, f) + ':' + (i + 1)); }); } };
  walk(path.join(REPO, 'src'));
  ok(flagReqs.every((q) => q.subtype === 'apply_flag_settings' && !('permissions' in q.settings)) && !srcHits.length, 'r3: no mid-session apply_flag_settings the product sends names `permissions` (effort, fallback policy; a census over src/) — nothing re-injects or drops the ask rule mid-session', srcHits);
  // CONTROL: a patched copy of the verdict that ALWAYS injects (the r2 behaviour) goes red on the bypass leg
  const M3 = mutantCopies('agent-tool-rules-r3', REPO);
  const rsrc = fs.readFileSync(path.join(REPO, 'src/agent-tool-rules.js'), 'utf8');
  const always = rsrc.replace('return ASK_RULE_MODES.includes(mode) ? claudeAskRules() : [];', 'return claudeAskRules();');
  let bypassOnMutant = null;
  if (always !== rsrc) {
    const rp = M3.write('src/agent-tool-rules.js', always, 'r3-always', { esm: false, name: 'agent-tool-rules-r3-always' });
    const asrc = fs.readFileSync(path.join(REPO, 'src/adapters/claude-code.js'), 'utf8');
    const apatched = asrc.replace("require('../agent-tool-rules.js')", `require(${JSON.stringify(rp)})`);
    if (apatched !== asrc) bypassOnMutant = bypassLeg(M3.load('src/adapters/claude-code.js', apatched, 'r3-always').ClaudeCodeAdapter);
  }
  ok(bypassOnMutant === false, `r3 CONTROL: a patched copy whose verdict always injects the ask rule (r2's behaviour) FAILS the bypass leg (${bypassOnMutant}) — the r3 pin can go red`);
  for (const r of copiesCensus(M3.files, M3.dir, REPO, { minCopies: 2, label: '⑬ ' })) ok(r.pass, r.name, r.detail);
}

console.log(`\n${fail ? fail + ' FAILED (' + pass + ' passed' + (skipped ? ', ' + skipped + ' skipped' : '') + ')' : 'ALL PASS (' + pass + (skipped ? ', ' + skipped + ' skipped' : '') + ')'}`);
process.exit(fail ? 1 : 0);
