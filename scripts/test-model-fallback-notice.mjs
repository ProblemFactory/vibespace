import { MessageManager } from '/home/xingweil/workspace/AIWorkspace/vibespace/src/message-manager.js';
let failed = 0; const check=(n,c,e)=>{ if(c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e?' — '+e:''}`);} };
// REAL record shape captured from the transcript
const rec = { type:'system', subtype:'model_refusal_fallback', direction:'retry',
  content:"Fable 5's safeguards flagged this message. … Switched to Opus 4.8. …",
  level:'warning', trigger:'refusal', originalModel:'claude-fable-5', fallbackModel:'claude-opus-4-8',
  requestId:'req_x', apiRefusalCategory:'cyber' };
const mm = new MessageManager('t1');
const ops=[]; mm.listeners.push((op)=>ops.push(op));
mm.processLive(rec);
const created = ops.filter(o=>o.op==='create').map(o=>o.message);
const notice = created.find(m=>m.noticeKind==='model-refusal-fallback');
check('refusal fallback produces a notice message', !!notice, JSON.stringify(created).slice(0,200));
check('carries from/to', notice?.content?.[0]?.fallbackFrom==='claude-fable-5' && notice?.content?.[0]?.fallbackTo==='claude-opus-4-8');
check('carries the CLI explanation', /safeguards flagged/.test(notice?.content?.[0]?.cliText||''));
check('carries the refusal category', notice?.content?.[0]?.refusalCategory==='cyber');
// history rebuild path must handle it too (restart/resume)
const mm2 = new MessageManager('t2');
mm2.convertHistory([rec]);
check('convertHistory renders it as well', mm2.messages.some(m=>m.noticeKind==='model-refusal-fallback'));
// unrelated subtypes must not regress
const mm3 = new MessageManager('t3'); const ops3=[]; mm3.listeners.push(o=>ops3.push(o));
mm3.processLive({type:"system",subtype:"init",model:"claude-fable-5"});
check('init still handled', ops3.some(o=>o.message?.content?.[0]?.initData));
console.log(failed===0?'ALL PASS':`${failed} FAILED`); process.exit(failed?1:0);
