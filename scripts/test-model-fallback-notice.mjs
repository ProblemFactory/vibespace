import { createRequire } from 'node:module';
const { MessageManager } = createRequire(import.meta.url)('../src/message-manager.js');
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
// STDOUT shape (snake_case) — same record, different key casing than the JSONL.
// Reading only one shape rendered every LIVE notice as "? → ?" (2.227.6).
const liveRec = { type:'system', subtype:'model_refusal_fallback', trigger:'refusal', direction:'retry',
  original_model:'claude-fable-5', fallback_model:'claude-opus-4-8', api_refusal_category:'cyber',
  api_refusal_explanation:'This request triggered restrictions on violative cyber content…',
  content:"Fable 5's safeguards flagged this message. … Switched to Opus 4.8." };
const mm4 = new MessageManager('t4'); mm4.processLive(liveRec);
const c4 = mm4.messages.find(m=>m.noticeKind==='model-refusal-fallback')?.content?.[0];
check('stdout snake_case yields real model names (no "?")', c4?.fallbackFrom==='claude-fable-5' && c4?.fallbackTo==='claude-opus-4-8', JSON.stringify(c4).slice(0,160));
check('stdout policy explanation is included', /violative cyber content/.test(c4?.cliText||''));
// ── B-c643 (lane chat-residuals): the status bar's ⚠ chip NAMES a safety-classifier reroute ──
// The one-time notice said why; the persistent ⚠ chip blamed "capacity/overload".
// The REAL ChatStatusBar over a minimal fake DOM (the test-status-bar-chips shape).
{
  const path = await import('node:path');
  const { pathToFileURL, fileURLToPath } = await import('node:url');
  const fs = await import('node:fs');
  const { mutantCopies, copiesCensus } = await import('./mutant-copy.mjs');
  const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  class FakeEl {
    constructor(tag) { this.tagName = String(tag).toUpperCase(); this.attrs = new Map(); this.childNodes = []; this.parentNode = null; this._html = ''; }
    get children() { return this.childNodes.filter((n) => n instanceof FakeEl); }
    setAttribute(k, v) { this.attrs.set(k, String(v)); } getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
    hasAttribute(k) { return this.attrs.has(k); } removeAttribute(k) { this.attrs.delete(k); }
    get className() { return this.getAttribute('class') || ''; } set className(v) { this.setAttribute('class', v); }
    get title() { return this.getAttribute('title') || ''; }
    get innerHTML() { return this._html; } set innerHTML(h) { this._html = String(h); }
    get textContent() { return this._html.replace(/<[^>]*>/g, ''); }
    appendChild(n) { return this.insertBefore(n, null); }
    insertBefore(n, ref) { if (n.parentNode) n.parentNode.removeChild(n); const i = ref ? this.childNodes.indexOf(ref) : -1; if (i < 0) this.childNodes.push(n); else this.childNodes.splice(i, 0, n); n.parentNode = this; return n; }
    removeChild(n) { const i = this.childNodes.indexOf(n); if (i >= 0) this.childNodes.splice(i, 1); n.parentNode = null; return n; }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    addEventListener() {} get isConnected() { return true; }
  }
  const barSrcPath = path.join(repo, 'src/lib/chat-status-bar.js');
  const { ChatStatusBar } = await import(pathToFileURL(barSrcPath).href);
  globalThis.document = { createElement: (tag) => new FakeEl(tag) };
  const REROUTE = { from: 'claude-fable-5', to: 'claude-opus-4-8', category: 'cyber' }; // the notice's own fields (fallbackFrom / fallbackTo / refusalCategory)
  const walk = (Klass) => {
    const bar = new Klass({ send() {} }, 'sid-c643', { backend: 'claude', getToolMsg: () => null, openSubagentViewer() {}, openInTempEditor() {} });
    const chip = () => bar.element.children.find((el) => el.getAttribute('data-chip') === 'model');
    const read = () => ({ label: chip()?.textContent || '', title: chip()?.title || '' });
    bar.applyStatus({ model: 'claude-fable-5', permissionMode: 'default' });
    bar.setServedModel('claude-opus-4-8');
    if (bar.setRefusalFallback) bar.setRefusalFallback(REROUTE);
    const named = read();
    bar.applyStatus({ model: 'claude-fable-5', permissionMode: 'default' }); bar.setServedModel('claude-opus-4-8'); // the next turn on the same reroute
    const later = read();
    bar.setServedModel('claude-sonnet-5'); // a CAPACITY reroute to another model — the refusal does not explain it
    const capacity = read();
    bar.setServedModel('claude-fable-5'); // back on the commanded model
    const back = read();
    return { named, later, capacity, back };
  };
  const w = walk(ChatStatusBar);
  const namesIt = (r) => r.label === '⚠ claude-opus-4-8 · refusal (cyber)' && /^Safety-classifier fallback: claude-fable-5 flagged a message \(cyber\), so claude-opus-4-8 is answering instead of claude-fable-5\./.test(r.title) && !/capacity/.test(r.title);
  check('B-c643 the ⚠ chip names the safety-classifier reroute (label "refusal (cyber)", tooltip from → to), never "capacity/overload"', namesIt(w.named), JSON.stringify(w.named));
  check('B-c643 …and keeps naming it on the next turn served by the same fallback (persistent, not one-time)', namesIt(w.later), JSON.stringify(w.later));
  check('B-c643 a reroute to ANOTHER model is not claimed as the refusal (the capacity wording, no "refusal")', /capacity\/overload/.test(w.capacity.title) && !/refusal/.test(w.capacity.label), JSON.stringify(w.capacity));
  check('B-c643 back on the commanded model the chip is the plain model again', w.back.label === 'claude-fable-5' && !/fallback/i.test(w.back.title), JSON.stringify(w.back));
  const cr = fs.readFileSync(path.join(repo, 'src/lib/chat-renderers.js'), 'utf8'), cv = fs.readFileSync(path.join(repo, 'src/lib/chat-view.js'), 'utf8');
  check('B-c643 the notice (live AND rebuilt) hands the status bar its reroute: the renderer\'s side effect, chat-view applies it', /sideEffect: \{ refusalFallback: \{ from: b\.fallbackFrom \|\| null, to: b\.fallbackTo, category: b\.refusalCategory \|\| null \} \}/.test(cr) && /if \(se\.refusalFallback\) this\._statusBar\.setRefusalFallback\(se\.refusalFallback\);/.test(cv));
  const zh = fs.readFileSync(path.join(repo, 'src/lib/i18n-zh.js'), 'utf8'), ja = fs.readFileSync(path.join(repo, 'src/lib/i18n-ja.js'), 'utf8');
  const KEYS = ['Safety-classifier fallback: {from} flagged a message{category}, so {served} is answering instead of {model}. Your model setting is unchanged. Click to re-pick.', 'refusal'];
  check('B-c643 the chip\'s two words have zh + ja entries', KEYS.every((k) => zh.includes(JSON.stringify(k) + ':') && ja.includes(JSON.stringify(k) + ':')));
  // NEGATIVE CONTROL: the pre-fix rule (the chip never consults the reroute) — the base's "capacity/overload"
  const M = mutantCopies('fallback-chip', repo);
  const src = fs.readFileSync(barSrcPath, 'utf8');
  const pre = src.replace('const refusal = mismatch && this._refusalFallback && sameModel(this._refusalFallback.to, this._servedModel) ? this._refusalFallback : null; // B-c643', 'const refusal = null;');
  check('B-c643 (the pre-fix patch applied)', pre !== src);
  const P = walk((await import(pathToFileURL(M.write('src/lib/chat-status-bar.js', pre, 'pre-c643')).href)).ChatStatusBar);
  check('B-c643 NEGATIVE CONTROL: the pre-fix chip blames "capacity/overload" for the refusal reroute (the item\'s report)', !namesIt(P.named) && /capacity\/overload/.test(P.named.title) && P.named.label === '⚠ claude-opus-4-8', JSON.stringify(P.named));
  for (const r of copiesCensus(M.files, M.dir, repo, { minCopies: 1, label: 'B-c643 ' })) check(r.name, r.pass, r.detail);
}
console.log(failed===0?'ALL PASS':`${failed} FAILED`); process.exit(failed?1:0);
