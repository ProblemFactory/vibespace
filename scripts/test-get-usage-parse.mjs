// B-7edc: get_usage control-request builder + rate_limits→cache parser.
// Pure pieces — the LIVE ws-correlation is validated separately on a real
// chat session (the control_response envelope nesting is the open unknown).
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { ClaudeCodeAdapter } = require('../src/adapters/claude-code.js');
let pass=0,fail=0; const ck=(n,c)=>{if(c){pass++;console.log('  ✓ '+n)}else{fail++;console.log('  ✗ '+n)}};
const req = ClaudeCodeAdapter.buildGetUsage();
ck('builder shape', req.type==='control_request' && req.request.subtype==='get_usage' && req.request_id.startsWith('vsu-'));
const payload = { subscription_type:'max', rate_limits_available:true, rate_limits:{
  five_hour:{used_percentage:42, resets_at:'2026-08-08T05:00:00.000Z'},
  seven_day:{used_percentage:71, resets_at:'2026-08-12T00:00:00.000Z'},
  model_scoped:[{display_name:'Claude Fable', utilization:33, resets_at:'2026-08-13T00:00:00.000Z'},
                {display_name:'Claude Opus', utilization:0.12, resets_at:1786665600}] } };
const out = ClaudeCodeAdapter.parseGetUsageResponse(payload);
ck('fiveHour 0.42', Math.abs(out.fiveHour.utilization-0.42)<1e-3);
ck('sevenDay 0.71', Math.abs(out.sevenDay.utilization-0.71)<1e-3);
ck('scoped Fable 0.33', out.scopedWeekly.some(w=>w.name==='Claude Fable'&&Math.abs(w.utilization-0.33)<1e-3));
ck('scoped Opus 0-1 kept', out.scopedWeekly.some(w=>w.name==='Claude Opus'&&Math.abs(w.utilization-0.12)<1e-3));
ck('source=control', out.source==='control');
ck('null on garbage', ClaudeCodeAdapter.parseGetUsageResponse(null)===null && ClaudeCodeAdapter.parseGetUsageResponse({})===null);
// ── REAL live envelope (captured 2026-08-09 on a 2.1.x session): utilization
// is a 0-100 INTEGER, resets_at ISO, NO model_scoped array — named nullable
// fields + codename buckets instead. The payload nests at
// control_response.response.response (double). ──
const live = { session:{total_cost_usd:0}, subscription_type:'max', rate_limits_available:true, rate_limits:{
  five_hour:{utilization:34, resets_at:'2026-08-09T09:59:59.753015+00:00', limit_dollars:null},
  seven_day:{utilization:39, resets_at:'2026-08-11T16:59:59.753043+00:00'},
  seven_day_oauth_apps:null, seven_day_opus:null,
  seven_day_sonnet:{utilization:12, resets_at:'2026-08-11T16:59:59.753043+00:00'},
  nimbus_quill:{utilization:0, resets_at:null},
  extra_usage:{is_enabled:false} } };
const lv = ClaudeCodeAdapter.parseGetUsageResponse(live);
ck('LIVE: 0-100 int utilization normalized (34 → 0.34)', Math.abs(lv.fiveHour.utilization-0.34)<1e-3);
ck('LIVE: sevenDay 0.39', Math.abs(lv.sevenDay.utilization-0.39)<1e-3);
ck('LIVE: ISO resets_at → epoch seconds', lv.sevenDay.resetsAt === Math.floor(Date.parse('2026-08-11T16:59:59.753043+00:00')/1000));
ck('LIVE: named scoped field picked up (seven_day_sonnet → Sonnet)', lv.scopedWeekly.some(w=>/Sonnet/i.test(w.name)&&Math.abs(w.utilization-0.12)<1e-3));
ck('LIVE: codename bucket without resets_at skipped', !lv.scopedWeekly.some(w=>/nimbus/i.test(w.name)));
ck('LIVE: null buckets skipped, extra_usage not a scoped entry', !lv.scopedWeekly.some(w=>/extra|oauth/i.test(w.name)));

// ── chat-mode limit banner parser (passive exhaustion signal) ──
const pb = ClaudeCodeAdapter.parseLimitBanner;
ck("banner: 5-hour", pb("You've reached your 5-hour limit.").kind==='fiveHour');
ck('banner: weekly', pb("You've reached your weekly limit.").kind==='sevenDay');
ck('banner: model-scoped weekly', (()=>{const r=pb("You've reached your Fable weekly limit."); return r.kind==='scoped'&&r.name==='Fable';})());
ck('banner: unknown wording → fiveHour (shortest self-heal)', pb("You've reached your usage limit for now.").kind==='fiveHour');
ck('banner: non-banner text → null', pb('Normal assistant reply about limits')===null);
// the REAL 2026-08-09 incident wording (workflow agent failure strings) — the
// reach-only anchored regex was blind to it and the pool switched only after
// exhaustion had failed 9 agents
ck("banner: 'hit your session limit' (workflow failure wording) → fiveHour", pb("You've hit your session limit · resets 3am (America/Los_Angeles)").kind==='fiveHour');
ck('banner: phrase mid-blob (task-notification carrier) still matches', pb("[verify:x] failed: You've hit your session limit · resets 3am").kind==='fiveHour');

console.log(fail?`${fail} FAILED`:`ALL PASS (${pass})`);
process.exit(fail?1:0);
