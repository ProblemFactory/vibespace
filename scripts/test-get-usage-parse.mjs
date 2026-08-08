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
console.log(fail?`${fail} FAILED`:`ALL PASS (${pass})`);
process.exit(fail?1:0);
