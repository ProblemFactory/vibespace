// Palette search: walter's real regression (inc-msjro90z-n6y3) + guards.
// "cmd+K 搜 best ever 搜不到 best ever toB signing 的 session，只能搜到 vendor session"
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../src/lib/session-palette.js', import.meta.url), 'utf-8');
// lift the two pure helpers out of the ES module (no DOM needed)
const body = src.slice(src.indexOf('function subseq'), src.indexOf('export function'));
const { score } = eval(`(()=>{ ${body}; return { score }; })()`);

let pass=0, fail=0;
const ck=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n)} else {fail++;console.log('  ✗ '+n)} };

// walter's REAL rows: label (custom name), cwd, id, status
const PRE='/home/walter/vibespace-mounts/WalterXSpace/Jarvis/work/';
const rows=[
  { label:'BestEver-ToB-signing', cwd:PRE+'T-260716-bestever-msa-signing', id:'c652065d-3eb9-4923-ada0-9b7b935379b3', live:false },
  { label:'BestEver-Vendor-Agreement-Sign', cwd:PRE+'T-260722-bestever-vendor-agreement-signing', id:'660496fe-4665-4d1a-b447-76cfe07c2663', live:true },
  { label:'D-ToB-signing', cwd:PRE+'T-260101-d-tob', id:'0c8dca7a-1111-2222-3333-444455556666', live:true },
  { label:'Sega-ToB-signing', cwd:PRE+'T-260202-sega', id:'8674f195-1111-2222-3333-444455556666', live:true },
  { label:'weka-vendor-license-signing', cwd:PRE+'T-260303-weka', id:'fdf8fdcb-1111-2222-3333-444455556666', live:true },
  { label:'D-GPU-buildout', cwd:PRE+'T-260404-gpu', id:'1236db05-1111-2222-3333-444455556666', live:true },
];
const rank = (q) => rows.map(r => {
    const hay = `${r.label} ${r.cwd}   claude ${r.id} ${r.id} ${r.id}`;
    const sc = score(q.trim().toLowerCase(), r.label, hay);
    return { ...r, sc: sc < 0 ? -1 : sc*1000 + (r.live?500:0) };
  }).filter(x => x.sc >= 0).sort((a,b)=>b.sc-a.sc);

// THE regression
{ const r = rank('best ever').map(x=>x.label);
  ck('"best ever" finds BOTH BestEver sessions', r.includes('BestEver-ToB-signing') && r.includes('BestEver-Vendor-Agreement-Sign'));
  ck('"best ever" excludes unrelated live sessions', !r.includes('D-GPU-buildout') && !r.includes('weka-vendor-license-signing'));
  ck('the STOPPED one is not buried below unrelated live ones', r.indexOf('BestEver-ToB-signing') <= 1); }
// multi-word narrowing must actually narrow
{ const r = rank('best ever tob').map(x=>x.label);
  ck('"best ever tob" pinpoints the ToB session only', r.length===1 && r[0]==='BestEver-ToB-signing'); }
{ const r = rank('bestever vendor').map(x=>x.label);
  ck('"bestever vendor" pinpoints the vendor session', r[0]==='BestEver-Vendor-Agreement-Sign'); }
// single-word still works, and name beats path
{ const r = rank('sega').map(x=>x.label); ck('single token "sega"', r.length===1 && r[0]==='Sega-ToB-signing'); }
{ const r = rank('signing').map(x=>x.label); ck('"signing" matches every *-signing name', r.length>=4); }
// path + id search preserved
{ const r = rank('T-260716').map(x=>x.label); ck('search by cwd fragment', r.length===1 && r[0]==='BestEver-ToB-signing'); }
{ const r = rank('c652065d').map(x=>x.label); ck('search by session id', r.length===1 && r[0]==='BestEver-ToB-signing'); }
// a token that matches nothing rejects the row (AND semantics)
{ const r = rank('best zzzz'); ck('unmatched token rejects', r.length===0); }
// no degenerate cross-matching through the shared path prefix
{ const r = rank('gpu ever'); ck('"gpu ever" does not match everything via the shared path', r.length===0); }
console.log(fail?`${fail} FAILED (${pass} passed)`:`ALL PASS (${pass})`);
process.exit(fail?1:0);
