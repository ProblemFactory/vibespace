// THE LAST-READ SHAPE (主开发 r1141 (2), lane bl-tests-chrome, 2026-11-21 — the class of 2.369.414's test-browser-resume-ui control,
// read as a product verdict): a bounded poll that returns its READ when a separate test on it passes, and the SAME read (or one more
// read) when its bound runs out — with no timed-out mark, so the caller judges a state that never came as the product's answer.
// lastReadWaits(src, acorn) → [{ line, page, hit }] over the Node code AND the page code a suite ships in template literals (each
// literal's text, its ${…} as identifiers, tried as an async function body). Cured shapes are not named: a timed-out mark (a new
// object, a null or a false on exhaustion), or a wait whose test IS its read's truthiness (the read's own falsy is the mark).
const walk = (n, f) => { if (!n || typeof n.type !== 'string') return; f(n); for (const k of Object.keys(n)) { if (k === 'loc' || k === 'start' || k === 'end') continue; const v = n[k]; if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === 'string' && walk(c, f)); else if (v && typeof v.type === 'string') walk(v, f); } };
const isLoop = (n) => /^(For|While|DoWhile|ForOf|ForIn)Statement$/.test(n.type);
const SLEEPS = /^(sleep|tick|delay|wait|pause|nap|realSleep)$/;
const sleeps = (n) => { let y = false; walk(n, (m) => { if (y || m.type !== 'AwaitExpression') return; walk(m.argument, (c) => { if ((c.type === 'Identifier' && (SLEEPS.test(c.name) || c.name === 'setTimeout')) || (c.type === 'MemberExpression' && c.property && c.property.name === 'setTimeout')) y = true; }); }); return y; };
const unAwait = (a) => (a && a.type === 'AwaitExpression' ? a.argument : a);
const rootOf = (e) => { while (e && (e.type === 'CallExpression' || e.type === 'MemberExpression' || e.type === 'AwaitExpression')) e = e.type === 'CallExpression' ? e.callee : e.type === 'MemberExpression' ? e.object : e.argument; return e && e.type === 'Identifier' ? e.name : null; };
const calleeOf = (a) => { a = unAwait(a); if (!a || a.type !== 'CallExpression') return null; const c = a.callee; return c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' && c.property && c.property.name ? '.' + c.property.name : null; };
function shapesOf(ast, page) {
  const out = [];
  walk(ast, (fn) => {
    if (!/Function/.test(fn.type) || !fn.body || fn.body.type !== 'BlockStatement') return;
    const body = fn.body.body;
    for (let i = 0; i < body.length - 1; i++) {
      const loop = body[i]; if (!isLoop(loop) || !sleeps(loop)) continue;
      const next = body.slice(i + 1).find((s) => s.type === 'ReturnStatement' || s.type === 'TryStatement');
      const ret = next && next.type === 'ReturnStatement' ? next : next && next.type === 'TryStatement' ? next.block.body.find((s) => s.type === 'ReturnStatement') : null;
      if (!ret || !ret.argument) continue;
      const after = unAwait(ret.argument), fromCall = new Map();
      walk(loop, (m) => { if (m.type === 'VariableDeclarator' && m.id.type === 'Identifier' && calleeOf(m.init)) fromCall.set(m.id.name, calleeOf(m.init)); if (m.type === 'AssignmentExpression' && m.left.type === 'Identifier' && calleeOf(m.right)) fromCall.set(m.left.name, calleeOf(m.right)); });
      let hit = null;
      walk(loop, (m) => {
        if (hit || m.type !== 'IfStatement') return;
        const rets = []; walk(m.consequent, (r) => { if (r.type === 'ReturnStatement' && r.argument && r.argument.type === 'Identifier') rets.push(r.argument.name); });
        for (const v of rets) {
          if (m.test.type === 'Identifier' && m.test.name === v) continue;   // its test IS its read's truthiness: the read's falsy is the mark
          if (after.type === 'Identifier' && after.name === v) hit = `returns ${v} when a test on it passes, and ${v} — its last read — when its bound runs out`;
          else if (after.type === 'CallExpression' && fromCall.get(v) && fromCall.get(v) === calleeOf(after)) hit = `returns ${v} = ${fromCall.get(v)}() when a test on it passes, and one more ${fromCall.get(v)}() when its bound runs out`;
        }
      });
      // THE BREAK FORM (r1372, read in the nine): a test on the read BREAKS the loop, and the read (or a call on it: o.sort(…)) is
      // returned after it, whichever way the loop ended. Cured: a timed-out mark (markTimedOut) or a choice between the two ends
      if (!hit) {
        const x = rootOf(ret.argument), assigned = new Set();
        walk(loop, (m) => { if (m.type === 'AssignmentExpression' && m.left.type === 'Identifier') assigned.add(m.left.name); if (m.type === 'VariableDeclarator' && m.id.type === 'Identifier') assigned.add(m.id.name); });
        if (x && assigned.has(x)) walk(loop, (m) => { if (hit || m.type !== 'IfStatement' || (m.test.type === 'Identifier' && m.test.name === x)) return; let brk = false; walk(m.consequent, (c) => { if (c.type === 'BreakStatement' && !c.label) brk = true; }); if (brk) hit = `breaks its loop when a test on ${x} passes, and returns ${x} — its last read — whichever way the loop ended`; });
      }
      if (hit) out.push({ at: fn.start, page, hit });
    }
  });
  return out;
}
// the cheap gate before the parse: a test that returns a NAME (the in-loop success of the shape), and a wait (a sleep or a timer)
const BREAKS = /if\s*\([^\n]*?\)\s*(?:\{\s*)?break\s*[;}][^]{0,240}?\}\s*return\s+[A-Za-z_$]/;   // the break form's own text gate (r1372): a break, the loop's end, then its return
const MAYBE = /if\s*\([^\n]*?\)\s*(?:\{\s*)?return\s+([A-Za-z_$][\w$]*)\s*[;}]/g, WAITS = /\b(?:sleep|tick|delay|wait|pause|nap|realSleep|setTimeout)\s*\(/;
export const mayHaveLastReadWait = (src) => {
  if (!WAITS.test(src)) return false;
  if (BREAKS.test(src)) return true;
  for (const m of src.matchAll(MAYBE)) { const tail = src.slice(m.index + m[0].length, m.index + m[0].length + 700); if (new RegExp(`\\}\\s*(?:try\\s*\\{\\s*)?return\\s+(?:await\\s+)?(?:${m[1].replace(/\$/g, '\\$')}\\b|[A-Za-z_$.][\\w$.]*\\()`).test(tail)) return true; }   // the loop's own end, then its return
  return false;
};
export function lastReadWaits(src, acorn) {
  if (!mayHaveLastReadWait(src)) return [];
  const opts = { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true, allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true };   // no locations: a line is counted from the offset (half the parse)
  let ast; try { ast = acorn.parse(src, opts); } catch (e) { return [{ line: 0, page: false, error: String(e.message).slice(0, 80) }]; }
  const lineAt = (off) => { let n = 1; for (let i = src.indexOf('\n'); i !== -1 && i < off; i = src.indexOf('\n', i + 1)) n++; return n; };
  const out = shapesOf(ast, false).map((h) => ({ line: lineAt(h.at), page: false, hit: h.hit }));
  walk(ast, (t) => {
    if (t.type !== 'TemplateLiteral' || !t.quasis.some((q) => /for\s*\(|while\s*\(/.test(q.value.cooked || ''))) return;
    const text = t.quasis.map((q, i) => (q.value.cooked || '') + (i < t.expressions.length ? ` __X${i}__ ` : '')).join('');
    let inner = null;
    for (const wrap of [(x) => `(async () => { ${x} })`, (x) => `(${x})`]) { try { inner = acorn.parse(wrap(text), { ecmaVersion: 'latest', sourceType: 'script', allowAwaitOutsideFunction: true }); break; } catch { inner = null; } }
    if (!inner) return;
    for (const h of shapesOf(inner, true)) out.push({ line: lineAt(t.start), page: true, hit: h.hit });
  });
  return out;
}
