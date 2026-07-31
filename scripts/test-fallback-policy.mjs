#!/usr/bin/env node
// claude.disableModelFallback contract test (2.228.0). Covers the three
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

let failed = 0;
const check = (name, cond, extra) => {
  if (cond) console.log(`  ✓ ${name}`);
  else { failed++; console.error(`  ✗ ${name}${extra ? ' — ' + extra : ''}`); }
};

const adapter = new ClaudeCodeAdapter({ claudeCmd: 'claude', chatWrapper: 'cw.js', ptyWrapper: 'pw.js', supportsName: true });

// (1) spawn: plain
let spec = adapter.buildSessionArgs({ cwd: '/tmp', mode: 'chat', disableModelFallback: true });
let si = spec.args.indexOf('--settings');
check('spawn adds --settings with switchModelsOnFlag:false', si >= 0 && JSON.parse(spec.args[si + 1]).switchModelsOnFlag === false);
check('spawn arms CLAUDE_CODE_DISABLE_REFUSAL_FALLBACK (subagents)', spec.env.CLAUDE_CODE_DISABLE_REFUSAL_FALLBACK === '1');

// (1) spawn: merges with ultracode's --settings instead of a second flag
spec = adapter.buildSessionArgs({ cwd: '/tmp', mode: 'chat', effort: 'ultracode', disableModelFallback: true });
check('ONE --settings flag when ultracode also uses it', spec.args.filter((a) => a === '--settings').length === 1);
si = spec.args.indexOf('--settings');
const merged = JSON.parse(spec.args[si + 1]);
check('merged settings keep ultracode AND switchModelsOnFlag', merged.ultracode === true && merged.switchModelsOnFlag === false);

// (1) off: untouched
spec = adapter.buildSessionArgs({ cwd: '/tmp', mode: 'chat' });
check('toggle off leaves args/env untouched', !spec.args.includes('--settings') && !('CLAUDE_CODE_DISABLE_REFUSAL_FALLBACK' in spec.env));

// (1) terminal mode: env objects compose (tuiRenderer + fallback)
spec = adapter.buildSessionArgs({ cwd: '/tmp', mode: 'terminal', tuiRenderer: 'fullscreen', disableModelFallback: true });
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
spec = adapter.buildSessionArgs({ cwd: '/tmp', mode: 'chat', effort: 'ultracode', disableModelFallback: true, neutralizeKeyHelper: true });
check('ONE --settings with all three keys merged', spec.args.filter((a) => a === '--settings').length === 1
  && (() => { const o = JSON.parse(spec.args[spec.args.indexOf('--settings') + 1]); return o.ultracode === true && o.switchModelsOnFlag === false && o.apiKeyHelper === ''; })());
spec = adapter.buildSessionArgs({ cwd: '/tmp', mode: 'chat' });
check('no neutralizer flag ⇒ no settings key', !spec.args.includes('--settings'));

console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`);
process.exit(failed ? 1 : 0);
