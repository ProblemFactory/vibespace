// Dead-reckoning data foundation: identity key precedence (survives sub
// remove+re-add), anchor dedup by fetchedAt, cost-delta pairing.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { UsageAnchors, identityKeyFor, costBetween } = require('../src/usage-anchors.js');
let pass=0,fail=0; const ck=(n,c)=>{if(c){pass++;console.log('  ✓ '+n)}else{fail++;console.log('  ✗ '+n)}};

ck('identity: orgUuid wins', identityKeyFor({accountId:'sub-1', cache:{orgUuid:'ABC'}, email:'x@y.z'})==='org:abc');
ck('identity: email fallback (lowercased)', identityKeyFor({accountId:'sub-1', cache:{}, email:'Me@Ex.COM'})==='email:me@ex.com');
ck('identity: cache orgEmail counts', identityKeyFor({accountId:'sub-1', cache:{orgEmail:'a@b.c'}})==='email:a@b.c');
ck('identity: id last resort', identityKeyFor({accountId:'sub-1', cache:{}})==='acct:sub-1');
ck('identity: SAME key across remove+re-add (new id, same email)',
  identityKeyFor({accountId:'sub-OLD', cache:{}, email:'me@ex.com'})===identityKeyFor({accountId:'sub-NEW', cache:{}, email:'me@ex.com'}));

const dir = fs.mkdtempSync(path.join(os.tmpdir(),'vsanchor-'));
const ua = new UsageAnchors({ dataDir: dir });
const cache1 = { fetchedAt: 1000, source:'statusline', fiveHour:{utilization:0.2,resetsAt:99}, sevenDay:{utilization:0.5,resetsAt:999}, scopedWeekly:[{name:'Fable',utilization:0.3,resetsAt:999}] };
ck('first anchor recorded', ua.maybeRecord({identityKey:'email:a@b.c', accountId:'sub-1', cache:cache1})===true);
ck('same fetchedAt deduped', ua.maybeRecord({identityKey:'email:a@b.c', accountId:'sub-1', cache:cache1})===false);
const cache2 = { ...cache1, fetchedAt: 2000, sevenDay:{utilization:0.55,resetsAt:999} };
ck('newer anchor recorded with prev linkage', ua.maybeRecord({identityKey:'email:a@b.c', accountId:'sub-1', cache:cache2, costSince:{total:1.5,byFamily:{fable:1.5},requests:3}})===true);
const last = ua.lastAnchor('email:a@b.c');
ck('lastAnchor = newest, carries prevFetchedAt + costSince', last.fetchedAt===2000 && last.prevFetchedAt===1000 && last.costSince.total===1.5);
ck('buckets serialized (Fable kept)', last.buckets.scopedWeekly[0].name==='Fable');
// costBetween over a fake ledger
// host event WITH a resolved acct COUNTS since 2.297.0 (quota is per-account
// GLOBAL — another machine's spend is still this account's spend); only the
// unresolved host-bucket (atype:'host') stays out of the odometer.
const fakeUH = { _events: function*(){ yield {acct:'sub-1',ts:1500,model:'claude-fable-5',host:null}; yield {acct:'sub-1',ts:1600,model:'claude-opus-4-8',host:null}; yield {acct:'other',ts:1500,model:'claude-fable-5',host:null}; yield {acct:'sub-1',ts:1500,model:'x',host:'h1'}; yield {acct:'host-h1',atype:'host',ts:1500,model:'x',host:'h1'}; }, _cost: ()=>2 };
const cb = costBetween(fakeUH, 'sub-1', 1000, 2000);
ck('costBetween: filters account, counts RESOLVED remote spend, excludes the host bucket', cb.total===6 && cb.byFamily.fable===2 && cb.byFamily.opus===2 && cb.byFamily.other===2 && cb.requests===3);
// fabricated placeholder buckets (status 'unknown', the statusline hook's
// defensive fallback) must never anchor — a u:0 fabrication paired with the
// next real reading forged a du=+full pair (~6× rate inflation, verifier repro)
const cache3 = { fetchedAt: 3000, source:'statusline', fiveHour:{utilization:0,status:'unknown',resetsAt:0}, sevenDay:{utilization:0.6,resetsAt:999}, scopedWeekly:[] };
ua.maybeRecord({identityKey:'email:a@b.c', accountId:'sub-1', cache:cache3});
ck('status-unknown bucket records as null (never anchors a fabrication)', ua.lastAnchor('email:a@b.c').buckets.fiveHour===null && ua.lastAnchor('email:a@b.c').buckets.sevenDay.u===0.6);
fs.rmSync(dir,{recursive:true,force:true});
console.log(fail?`${fail} FAILED`:`ALL PASS (${pass})`);
process.exit(fail?1:0);
