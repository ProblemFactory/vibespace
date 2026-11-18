// THE ONE PAGE-TARGET WAITER (B-fcae, lane bl-tests-chrome, 2026-11-18). A suite that launches its own headless Chrome waits
// for the browser's first PAGE target on its DevTools port. Fifty-eight copies of one loop in fifty-three scripts did it with their
// only wait in their catch: once the endpoint answered with no page listed yet (a browser that is merely late), every poll ran
// back to back and the suite gave up in tens of ms («chrome never came up», test-age-badge-chrome on the hotfix's hosted run — a
// probe of that shape gave up after 70 ms). Here a miss ALWAYS waits (never after the last ask), each ask is bounded, the
// browser's exit ends the wait at once, and the bound is the caller's own: `polls` asks `everyMs` apart — the time each copy
// always meant. When nothing comes it SAYS what it saw (one stderr line + `.lastSeen`) and answers null: the caller keeps its own
// red or SKIP. test-ci-gate §2k finds the old loop in ANY layout (oldPageLoops — the loop's own sleeps all inside its catch).
//   waitPageTarget(port, { polls = 80, everyMs = 250, askMs = 2000, deadlineMs, child }) → the page target, or null
//   (deadlineMs: a wall bound on top of the polls — an endpoint that accepts and never answers costs askMs per poll)
//   waitPageList(port, { … }) → the whole /json list once it holds a page, or null (a caller that reads other targets too)
const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));
const realList = async (port, askMs) => (await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(askMs) })).json();
const isPage = (x) => !!x && x.type === 'page';

async function untilPage(port, { polls = 80, everyMs = 250, askMs = 2000, deadlineMs = 0, child = null, sleep = realSleep, list = realList, now = Date.now, quiet = false, who = 'waitPageTarget' } = {}) {
  let seen = 'the DevTools endpoint never answered';
  const t0 = now();
  for (let i = 0; i < polls; i++) {
    if (deadlineMs && now() - t0 >= deadlineMs) { seen += ` (the ${deadlineMs} ms deadline)`; break; }
    if (child && (child.exitCode !== null && child.exitCode !== undefined || child.signalCode)) { seen = `the browser exited (code ${child.exitCode}, signal ${child.signalCode})`; break; }
    try {
      const l = await list(port, askMs);
      if (Array.isArray(l) && l.some(isPage)) return { list: l, seen: 'a page' };
      seen = `the endpoint answered ${Array.isArray(l) ? l.length : 0} target(s), none a page`;
    } catch (e) { seen = `the endpoint did not answer (${String((e && e.cause && e.cause.code) || (e && e.name) || e).slice(0, 60)})`; }
    if (i < polls - 1) await sleep(everyMs);
  }
  if (!quiet) console.error(`  ${who}: no page target on DevTools port ${port} after ${polls} ask(s) ${everyMs} ms apart — ${seen}`);
  return { list: null, seen };
}
export async function waitPageList(port, opts) { const r = await untilPage(port, { who: 'waitPageList', ...opts }); waitPageList.lastSeen = r.seen; return r.list; }
export async function waitPageTarget(port, opts) { const r = await untilPage(port, opts); waitPageTarget.lastSeen = r.seen; return r.list ? r.list.find(isPage) : null; }
waitPageTarget.lastSeen = null; waitPageList.lastSeen = null;

/** test-ci-gate §2k: every loop in `src` that compares something to 'page' (==/===, any spelling) and whose OWN waits are ALL on its
 *  error road — the old shape, any layout. A «wait» is an awaited call that is not an ask (no fetch / .json() in it), or a
 *  setTimeout / sleep / delay / pause / nap / wait call; «the error road» is a catch clause or the callback of a `.catch(...)`; the loop's update counts as its own (not the
 *  error road); a nested loop and its waits are its own loop. `acorn` is the caller's (this module needs none). → [{ line }] (an
 *  unparsable source answers [{ line: 0, error }]; a source that never quotes 'page' is not parsed) */
export function oldPageLoops(src, acorn) {
  if (!/['"`]page['"`]/.test(src)) return [];
  let ast; try { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true, allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true, locations: true }); } catch (e) { return [{ line: 0, error: e.message }]; }
  const LOOPS = new Set(['ForStatement', 'WhileStatement', 'DoWhileStatement', 'ForOfStatement', 'ForInStatement']);
  const kids = (node) => { const out = []; for (const k of Object.keys(node)) { if (k === 'loc') continue; const v = node[k]; if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') out.push(x); } else if (v && typeof v.type === 'string') out.push(v); } return out; };
  const each = (node, visit, anc = [], stopAtLoops = false) => { if (!node || typeof node.type !== 'string') return; if (stopAtLoops && anc.length && LOOPS.has(node.type)) return; visit(node, anc); const next = [...anc, node]; for (const k of kids(node)) each(k, visit, next, stopAtLoops); };
  const isPage = (n) => n && ((n.type === 'Literal' && n.value === 'page') || (n.type === 'TemplateLiteral' && n.expressions.length === 0 && n.quasis[0].value.cooked === 'page'));
  const isAsk = (n) => { let ask = false; each(n, (c) => { if (c.type !== 'CallExpression') return; const cal = c.callee; if ((cal.type === 'Identifier' && cal.name === 'fetch') || (cal.type === 'MemberExpression' && cal.property.type === 'Identifier' && cal.property.name === 'json')) ask = true; }); return ask; };
  const onErrorRoad = (anc) => anc.some((a, i) => a.type === 'CatchClause' || (a.type === 'CallExpression' && a.callee.type === 'MemberExpression' && a.callee.property.type === 'Identifier' && a.callee.property.name === 'catch' && i < anc.length - 1 && a.arguments.includes(anc[i + 1])));
  const hits = [];
  each(ast, (loop) => {
    if (!LOOPS.has(loop.type)) return;
    let page = 0, onError = 0, outside = 0;
    for (const part of [loop.body, loop.update, loop.test].filter(Boolean)) {
      each(part, (c, anc) => {
        if (c.type === 'BinaryExpression' && (c.operator === '===' || c.operator === '==') && (isPage(c.left) || isPage(c.right))) page++;
        const wait = (c.type === 'AwaitExpression' && !isAsk(c.argument)) || (c.type === 'CallExpression' && c.callee.type === 'Identifier' && /^(setTimeout|sleep|delay|pause|nap|wait)$/.test(c.callee.name));
        if (!wait) return;
        if (part === loop.body && onErrorRoad([loop, ...anc])) onError++; else outside++;
      }, [], true);
    }
    if (page > 0 && onError > 0 && outside === 0) hits.push({ line: loop.loc.start.line });
  });
  return hits;
}
