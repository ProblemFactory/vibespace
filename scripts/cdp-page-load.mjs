// THE ONE PAGE LOAD (B-1217 member 13, lane lg-leak-census, 2026-11-20). A heavy chrome suite that navigates its tab to the app
// waits for the NEW document's app to boot. Ten suites carried one copy of a load helper that did it wrong: `Page.navigate`, then a
// poll for `!!(window.app && app.ready)` that swallows its own timeout and is never checked, then a bare
// `Runtime.evaluate('app.ready.then(…)')`. The poll could be answered by the OLD document (it still has its app) before the
// navigation committed, or run out unseen; the bare evaluate then landed in a new document whose boot had not run — «page threw:
// ReferenceError: app is not defined» (hosted run 44786427248, test-foryou-honest-chrome, red then green; placed by the
// coordinator's readers). No page code reads the bare name: only a harness evaluates in that gap.
//
// THE LAW: a page load does not end until the NEW document has booted. `loadPage` ties its wait to the navigation it started —
// the loader `Page.navigate` returned must be the frame's committed loader (`Page.getFrameTree`) — and, as a belt, the old document
// is MARKED before the navigate (a property only it carries), so no answer from it ever counts. A wait that runs out is a NAMED
// red — «the app never booted in N s …», with what the last ask saw — never a later ReferenceError and never a longer timeout. A
// failed navigation (`errorText`) is a named red at once.
//
//   loadPage(call, url, { boot, settle, bootMs = 30000, everyMs = 150, fatal, who, sleep, now }) → { ms, asks, loaderId }
//     call(method, params) → the CDP RESULT object (it throws on a protocol error) — the suite's own sender (one whose sender
//       answers the whole message passes a two-line adapter); boot = the boot test (APP_BOOTED); settle = what it awaits once the
//       boot test holds (APP_READY, awaitPromise); fatal(e) → true for an error that must end the wait at once (a dead page);
//       sleep / now injectable (the fast legs drive a fake page with no wall time).
//
// test-ci-gate §2m pins it: the old shape (an unchecked wait for window.app followed by a bare read of app) is found by the tree
// (oldAppWaits over acorn) and is red by name outside its named debt rows; the helper's legs run a fake page over node:vm (the old
// document answering first, a commit that never comes, a failed navigation, a same-document navigation) with the old helper's own
// shape as the RED CONTROL (it throws the hosted ReferenceError on the same fake).
export const APP_BOOTED = '!!(window.app && app.ready)';
export const APP_READY = 'app.ready.then(() => true)';
export const LOAD_MARK = '__vsOldDocument';

const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (x) => (x ? String(x).slice(0, 8) : 'none');
const thrown = (r) => { const d = r && r.exceptionDetails; return d ? String((d.exception && d.exception.description) || d.text || 'an exception').split('\n')[0].slice(0, 160) : ''; };
const named = (msg) => Object.assign(new Error(msg), { loadPageNamed: true });
let marks = 0;

async function untilBooted(call, { mark, loaderId, boot, settle, bootMs, everyMs, fatal, sleep, now, who, what }) {
  const fresh = `(window.${LOAD_MARK} !== ${JSON.stringify(mark)})`;
  const t0 = now();
  let seen = 'nothing answered yet', asks = 0;
  for (;;) {
    asks++;
    try {
      const cur = loaderId ? (((await call('Page.getFrameTree', {})) || {}).frameTree || {}).frame?.loaderId || null : null;
      if (loaderId && cur !== loaderId) seen = `the old document still answers (the frame's loader ${short(cur)}, the navigation's ${short(loaderId)}: not committed)`;
      else {
        const r = await call('Runtime.evaluate', { expression: `${fresh} && (${boot})`, returnByValue: true });
        if (r && r.exceptionDetails) seen = `the boot test threw (${thrown(r)})`;
        else if (r && r.result && r.result.value === true) {
          const s = await call('Runtime.evaluate', { expression: `${fresh} && (${settle})`, awaitPromise: true, returnByValue: true });
          if (s && s.exceptionDetails) throw named(`${who}: the new document's app booted ${what}, then its ready step threw: ${thrown(s)}`);
          if (s && s.result && s.result.value === true) return { ms: now() - t0, asks, loaderId: loaderId || null };
          seen = 'the document changed again under the ready step';
        } else seen = loaderId ? 'the new document has committed; its app has not booted yet' : 'no new document has booted yet (the old one carries the mark)';
      }
    } catch (e) {
      if (e && e.loadPageNamed) throw e;
      if (fatal(e)) throw e;
      seen = `an ask failed: ${String((e && e.message) || e).split('\n')[0].slice(0, 160)}`;
    }
    if (now() - t0 >= bootMs) throw named(`${who}: the app never booted in ${Math.round(bootMs / 1000)} s ${what} — last seen: ${seen} (${asks} ask(s))`);
    await sleep(everyMs);
  }
}

/** Navigate to `url` and wait for THAT navigation's document to boot (see the head). */
export async function loadPage(call, url, opts = {}) {
  const { boot = APP_BOOTED, settle = APP_READY, bootMs = 30000, everyMs = 150, fatal = () => false, who = 'loadPage', sleep = realSleep, now = Date.now } = opts;
  const mark = `vs-load-${process.pid}-${++marks}-${now().toString(36)}`;
  try { await call('Runtime.evaluate', { expression: `(() => { window.${LOAD_MARK} = ${JSON.stringify(mark)}; return true; })()`, returnByValue: true }); } catch (e) { if (fatal(e)) throw e; }   // no document yet: nothing old can answer
  const nav = (await call('Page.navigate', { url })) || {};
  if (nav.errorText) throw named(`${who}: the navigation to ${url} failed (${nav.errorText}) — the app never booted`);
  return untilBooted(call, { mark, loaderId: nav.loaderId || null, boot, settle, bootMs, everyMs, fatal, sleep, now, who, what: `after the navigation to ${url}` });
}

/** test-ci-gate §2m: every OLD LOAD SHAPE in `src` — a statement `await <wait>(<text naming window.app>, …)` whose result is
 *  dropped, followed in the same statement list by `await <evaluate>(<text starting with app.>)`: a wait that swallows its
 *  timeout, then a bare read of the app in whatever document answers. `<wait>` is any call whose name begins `waitFor`;
 *  `<evaluate>` any call; a text is a string or a template with no `${…}`. `acorn` is the caller's. → [{ line }] (an
 *  unparsable source answers [{ line: 0, error }]; a source that never names window.app is not parsed) */
export function oldAppWaits(src, acorn) {
  if (!/window\.app/.test(src)) return [];
  let ast; try { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true, allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true, locations: true }); } catch (e) { return [{ line: 0, error: e.message }]; }
  const text = (n) => (n && n.type === 'Literal' && typeof n.value === 'string' ? n.value : n && n.type === 'TemplateLiteral' && n.expressions.length === 0 ? n.quasis[0].value.cooked : null);
  const awaitedCall = (st) => (st && st.type === 'ExpressionStatement' && st.expression.type === 'AwaitExpression' && st.expression.argument.type === 'CallExpression' ? st.expression.argument : null);
  const nameOf = (c) => (c.callee.type === 'Identifier' ? c.callee.name : c.callee.type === 'MemberExpression' && c.callee.property.type === 'Identifier' ? c.callee.property.name : '');
  const isWait = (st) => { const c = awaitedCall(st); const t = c && text(c.arguments[0]); return !!c && /^waitFor/.test(nameOf(c)) && t !== null && /window\.app\b/.test(t); };
  const isBare = (st) => { const c = awaitedCall(st); const t = c && text(c.arguments[0]); return t !== null && /^\s*app\./.test(t); };
  const hits = [];
  const visit = (node) => {
    if (!node || typeof node.type !== 'string') return;
    for (const list of [node.body, node.consequent].filter(Array.isArray)) for (let i = 0; i < list.length - 1; i++) if (isWait(list[i]) && isBare(list[i + 1])) hits.push({ line: list[i].loc.start.line });
    for (const k of Object.keys(node)) { if (k === 'loc') continue; const v = node[k]; if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') visit(x); } else if (v && typeof v.type === 'string') visit(v); }
  };
  visit(ast);
  return hits;
}
