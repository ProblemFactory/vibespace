#!/usr/bin/env node
// claude.disableModelFallback contract test (2.228.0; since 2.369.123 the value rides the
// harness spawn-settings bag `settings.disableModelFallback` — design-harness-settings §5). Covers the three
// mechanisms: (1) spawn — buildSessionArgs merges switchModelsOnFlag:false
// into ONE --settings flag (repeated flags = undefined CLI behavior) and arms
// the subagent-covering env var; (2) mid-session — formatSetFallbackPolicy
// rides apply_flag_settings and re-enables with the LITERAL true (null would
// DELETE the inline key, with undocumented precedence against a spawn-time
// --settings false); (3) the normalizer renders model_refusal_no_fallback
// (the record a disabled session dead-ends with) in BOTH key casings —
// unrendered it is a silent failure.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { ClaudeCodeAdapter } = require('../src/adapters/claude-code.js');
const { MessageManager } = require('../src/message-manager.js');
const fs = require('fs');
const path = require('path');

let failed = 0;
const check = (name, cond, extra) => {
  if (cond) console.log(`  ✓ ${name}`);
  else { failed++; console.error(`  ✗ ${name}${extra ? ' — ' + extra : ''}`); }
};

const adapter = new ClaudeCodeAdapter({ claudeCmd: 'claude', chatWrapper: 'cw.js', ptyWrapper: 'pw.js', supportsName: true });

// (1) spawn: plain
let spec = adapter.buildSessionArgs({ cwd: '/tmp', mode: 'chat', settings: { disableModelFallback: true } });
let si = spec.args.indexOf('--settings');
check('spawn adds --settings with switchModelsOnFlag:false', si >= 0 && JSON.parse(spec.args[si + 1]).switchModelsOnFlag === false);
check('spawn arms CLAUDE_CODE_DISABLE_REFUSAL_FALLBACK (subagents)', spec.env.CLAUDE_CODE_DISABLE_REFUSAL_FALLBACK === '1');

// (1) spawn: merges with ultracode's --settings instead of a second flag
spec = adapter.buildSessionArgs({ cwd: '/tmp', mode: 'chat', effort: 'ultracode', settings: { disableModelFallback: true } });
check('ONE --settings flag when ultracode also uses it', spec.args.filter((a) => a === '--settings').length === 1);
si = spec.args.indexOf('--settings');
const merged = JSON.parse(spec.args[si + 1]);
check('merged settings keep ultracode AND switchModelsOnFlag', merged.ultracode === true && merged.switchModelsOnFlag === false);

// (1) off: untouched
// (2.369.155: every claude spawn now carries autoContinueAtUsageLimit:false on
// the ONE --settings flag — the owner ruling; see §(5) below — so "untouched"
// means: no switchModelsOnFlag key and no env var, not "no flag at all")
const settingsOf = (sp) => { const i = sp.args.indexOf('--settings'); return i < 0 ? {} : JSON.parse(sp.args[i + 1]); };
spec = adapter.buildSessionArgs({ cwd: '/tmp', mode: 'chat' });
check('toggle off leaves args/env untouched', !('switchModelsOnFlag' in settingsOf(spec)) && !('CLAUDE_CODE_DISABLE_REFUSAL_FALLBACK' in spec.env));

// (1) terminal mode: env objects compose (tuiRenderer + fallback)
spec = adapter.buildSessionArgs({ cwd: '/tmp', mode: 'terminal', tuiRenderer: 'fullscreen', settings: { disableModelFallback: true } });
check('terminal mode composes both env vars', spec.env.CLAUDE_CODE_NO_FLICKER === '1' && spec.env.CLAUDE_CODE_DISABLE_REFUSAL_FALLBACK === '1');

// (2) mid-session
let req = JSON.parse(adapter.formatSetFallbackPolicy(true));
check('disable rides apply_flag_settings with literal false',
  req.request.subtype === 'apply_flag_settings' && req.request.settings.switchModelsOnFlag === false);
req = JSON.parse(adapter.formatSetFallbackPolicy(false));
check('re-enable sends literal true, never null', req.request.settings.switchModelsOnFlag === true);

// (3) normalizer: model_refusal_no_fallback → notice, both casings
for (const [label, raw] of [
  ['snake_case (stdout)', { type: 'system', subtype: 'model_refusal_no_fallback', original_model: 'claude-fable-5', api_refusal_category: 'cyber', api_refusal_explanation: 'why' }],
  ['camelCase (JSONL)', { type: 'system', subtype: 'model_refusal_no_fallback', originalModel: 'claude-fable-5', apiRefusalCategory: 'cyber' }],
]) {
  const mm = new MessageManager('claude', 't1');
  const ops = [];
  mm.onOp((op) => ops.push(op));
  mm.processLive(raw);
  const m = ops.find((o) => o.op === 'create')?.message;
  check(`no-fallback record renders a notice [${label}]`,
    m && m.noticeKind === 'model-refusal-no-fallback' && m.content[0].fallbackFrom === 'claude-fable-5'
      && m.content[0].refusalCategory === 'cyber');
}

// (4) apiKeyHelper neutralization (2.236.0) — merges into the ONE --settings
spec = adapter.buildSessionArgs({ cwd: '/tmp', mode: 'chat', neutralizeKeyHelper: true });
si = spec.args.indexOf('--settings');
check('neutralizer adds --settings apiKeyHelper:""', si >= 0 && JSON.parse(spec.args[si + 1]).apiKeyHelper === '');
spec = adapter.buildSessionArgs({ cwd: '/tmp', mode: 'chat', effort: 'ultracode', settings: { disableModelFallback: true }, neutralizeKeyHelper: true });
check('ONE --settings with all three keys merged', spec.args.filter((a) => a === '--settings').length === 1
  && (() => { const o = JSON.parse(spec.args[spec.args.indexOf('--settings') + 1]); return o.ultracode === true && o.switchModelsOnFlag === false && o.apiKeyHelper === ''; })());
spec = adapter.buildSessionArgs({ cwd: '/tmp', mode: 'chat' });
check('no neutralizer flag ⇒ no settings key', !('apiKeyHelper' in settingsOf(spec)));

// (5) CLAUDE CODE'S OWN AUTO-CONTINUE AT A USAGE LIMIT (owner ruling
// 2026-09-22): the CLI's settings key `autoContinueAtUsageLimit` (2.1.280:
// read from policy > --settings > user settings; absent ⇒ ON) is spawned OFF
// on every claude session. It only ARMS in an interactive launch (stdout a
// TTY — 2.1.280 `Zrn`: `-p||--print||--init-only||--sdk-url||!process.stdout.isTTY`
// ⇒ non-interactive), so what it changes is per MODE: nothing in chat (the
// CLI's continue cannot arm there — VibeSpace's auto-resume is the only
// producer), and in terminal sessions it removes the ONLY automatic continue.
const acOf = (opts) => settingsOf(adapter.buildSessionArgs({ cwd: '/tmp', mode: 'chat', ...opts })).autoContinueAtUsageLimit;
check('auto-continue: row OFF (the default) ⇒ --settings autoContinueAtUsageLimit:false', acOf({ settings: { autoContinueAtUsageLimit: false } }) === false);
check('auto-continue: NO settings bag at all ⇒ still false (the money-safe direction)', acOf({}) === false);
check('auto-continue: terminal mode carries it too (the one mode where the CLI\'s continue can arm — a real pty)', settingsOf(adapter.buildSessionArgs({ cwd: '/tmp', mode: 'terminal' })).autoContinueAtUsageLimit === false);
// (lane L: the ONE --settings flag also carries the agent-tool allow rules by default,
// so "nothing passed" is asserted with that row off too — the key itself is the claim)
check('auto-continue: row ON ⇒ nothing passed (the CLI\'s own setting governs) — NEGATIVE CONTROL for the leg above', acOf({ settings: { autoContinueAtUsageLimit: true } }) === undefined
  && !adapter.buildSessionArgs({ cwd: '/tmp', mode: 'chat', settings: { autoContinueAtUsageLimit: true, allowAgentTools: false } }).args.includes('--settings'));
spec = adapter.buildSessionArgs({ cwd: '/tmp', mode: 'chat', effort: 'ultracode', settings: { disableModelFallback: true }, neutralizeKeyHelper: true });
check('auto-continue: MERGED into the ONE --settings flag with every other key', spec.args.filter((a) => a === '--settings').length === 1
  && (() => { const o = settingsOf(spec); return o.ultracode === true && o.switchModelsOnFlag === false && o.apiKeyHelper === '' && o.autoContinueAtUsageLimit === false; })());
spec = adapter.buildSessionArgs({ cwd: '/tmp', mode: 'chat', extraArgs: ['--settings', '/home/u/my-settings.json'] });
check('auto-continue: a user\'s own --settings FILE in extra args is never clobbered by this default', spec.args.filter((a) => a === '--settings').length === 1 && spec.args[spec.args.indexOf('--settings') + 1] === '/home/u/my-settings.json');
spec = adapter.buildSessionArgs({ cwd: '/tmp', mode: 'chat', extraArgs: ['--settings', '{"autoContinueAtUsageLimit":true,"x":1}'] });
check('auto-continue: an explicit key in the user\'s own inline --settings JSON is kept', settingsOf(spec).autoContinueAtUsageLimit === true && settingsOf(spec).x === 1);

// (5b) THE PREMISE THE ROW'S WORDING STANDS ON — pinned, because if it moves the
// row lies (the 2026-09-22 verifier finding: "two producers race" was false in
// BOTH modes). Chat: the wrapper gives claude a PIPE for stdout ⇒ the CLI is
// non-interactive ⇒ its auto-continue never arms. Terminal: the pty wrapper gives
// it a TTY ⇒ interactive ⇒ it arms — and VibeSpace's auto-resume does NOT deliver
// there (server.js sendToSession refuses a non-chat session). Each pin is a
// regex over the real file, with a NEGATIVE CONTROL on a snippet that breaks it.
{
  const readRepo = (f) => fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', f), 'utf8');
  const PIPED = /child = spawn\(cmd, spawnArgs, \{[^}]*stdio: \['pipe', 'pipe', 'pipe'\]/;
  const PTY = /child = pty\.spawn\(cmd, args,/;
  const CHAT_ONLY = /sendToSession: \(id, s, text, carried\) => \{ try \{ const ad = adapterRegistry\.get\(s\.backend\); if \(!ad \|\| !s\.pty \|\| s\.mode !== 'chat'\) return false;/;
  check('premise: chat-wrapper spawns claude with a PIPED stdout (⇒ non-interactive ⇒ the CLI\'s continue cannot arm in chat)', PIPED.test(readRepo('data/bin/chat-wrapper.js')));
  check('premise NEGATIVE CONTROL: a wrapper that handed claude a TTY/inherited stdout fails the pin', !PIPED.test("child = spawn(cmd, spawnArgs, { cwd: process.cwd(), env: process.env, stdio: 'inherit' });"));
  check('premise: pty-wrapper spawns claude on a real pty (⇒ interactive ⇒ the CLI\'s continue CAN arm in terminal sessions)', PTY.test(readRepo('data/bin/pty-wrapper.js')));
  check('premise NEGATIVE CONTROL: a piped terminal spawn fails the pin', !PTY.test("child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });"));
  check('premise: VibeSpace\'s auto-resume delivers to CHAT sessions only (server.js sendToSession) — so OFF leaves terminal sessions with no automatic continue', CHAT_ONLY.test(readRepo('server.js')));
  check('premise NEGATIVE CONTROL: a sendToSession without the chat gate fails the pin', !CHAT_ONLY.test("sendToSession: (id, s, text, carried) => { try { const ad = adapterRegistry.get(s.backend); if (!ad || !s.pty) return false;"));
  const HS = require(path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'src/harness-settings.js'));
  const row = HS.HARNESS_SETTINGS.claude.rows.find((r) => r.key === 'autoContinueAtUsageLimit');
  const TRUE_WORDS = (d) => /Chat sessions never run it/.test(d) && /nothing continues it by itself/.test(d) && !/two producers/.test(d) && !/pick up/.test(d);
  check('the row\'s description says the per-mode truth (chat never runs it; terminal: nothing continues it when off) and not the refuted "two producers" premise', !!row && TRUE_WORDS(row.description));
  check('description NEGATIVE CONTROL: the pre-fix wording ("…a limit then stops the turn for VibeSpace\'s auto-resume to pick up … two producers…") fails it', !TRUE_WORDS("VibeSpace runs its own auto-resume, so this stays off: a limit then stops the turn for VibeSpace's auto-resume to pick up. On lets two producers continue the same conversation at the same reset."));
}

console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`);
process.exit(failed ? 1 : 0);
