// B-0d3e slice 8 (lane lg-text-legs-2, 主开发 r2677 / r2678): THE CENSUS'S SECOND LIST, in a module of its own — only
// test-suite-files-parse imports it, so the heavy suites that import scripts/mutant-copy.mjs (most of them) are not touched by it.
// paramTextEdits: the red controls unanchoredEdits cannot see (its docstring below). censusAll: the three censuses of one script
// over ONE walk of its AST — mutant-copy.mjs's unanchoredEdits and anchorHelpers in their plan form, and this list — so §1's walk
// still parses and walks each file once (B-7e49's law, 主开发 r2206).
import { createRequire } from 'node:module';
import { unanchoredEdits, anchorHelpers } from '../mutant-copy.mjs';
const req = createRequire(import.meta.url);
const READ = /\b(?:readFileSync|readRepo|readSrc|readTree|readText|readFile|read)\s*\(/, PRODUCT = /['"`](?:src\/|server\.js|data\/bin\/|src['"`])/;
const CURED_NAMES = new Set(['editAnchor', 'anchored']);
// ONE ancestor stack, pushed and popped — mutant-copy.mjs's own walk, the same nodes in the same order
const walkAst = (n, fn, anc = []) => { if (!n || typeof n.type !== 'string') return; fn(n, anc); anc.push(n); for (const k in n) { if (k === 'type' || k === 'start' || k === 'end') continue; const v = n[k]; if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') walkAst(x, fn, anc); } else if (v && typeof v.type === 'string') walkAst(v, fn, anc); } anc.pop(); };

export function paramTextEdits(src, { ast: given = null, plan = false } = {}) {
  // THE DOOR — unanchoredEdits' own: no edit, no loader, or no line that reads a product file ⇒ nothing to parse
  if (!/\.(?:replace|replaceAll|join)\(/.test(src) || !/(?:\.load|\.write|_compile|runIn\w*Context|compileFunction|writeFileSync|new Function)\(/.test(src)) return plan ? null : [];
  if (!src.split('\n').some((l) => READ.test(l) && PRODUCT.test(l))) return plan ? null : [];
  let ast = given;
  if (!ast) for (const sourceType of ['module', 'script']) { try { ast = req('acorn').parse(src, { ecmaVersion: 'latest', sourceType, allowHashBang: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true }); break; } catch { } }
  if (!ast) return plan ? null : [];
  const text = (n) => src.slice(n.start, n.end);
  // THE FIRST LIST'S PRODUCT NAMES, by unanchoredEdits' own rule (scripts/mutant-copy.mjs): a name bound to a product read, or to
  // a cured link of one (`const c = editAnchor(src, …)`) — an edit of such a name is the first list's, never this one's
  const product = new Set();
  const productBase = (x) => { let b = x; for (;;) { if (b && b.type === 'CallExpression' && b.callee.type === 'MemberExpression' && /^(?:replace|replaceAll|split|join)$/.test(b.callee.property.name || '')) b = b.callee.object; else if (b && b.type === 'CallExpression' && b.callee.type === 'Identifier' && CURED_NAMES.has(b.callee.name) && b.arguments[0]) b = b.arguments[0]; else return b; } };
  const curedOf = (x) => { if (!x || x.type !== 'CallExpression' || x.callee.type !== 'Identifier' || !CURED_NAMES.has(x.callee.name)) return false; const b = productBase(x); return !!b && b.type === 'Identifier' && product.has(b.name); };
  const FNT = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
  const CURED = new Set(['editAnchor', 'anchored']);
  // the argument that carries the TEXT a loader runs or writes — never its path, tag or options (read off the callee's own
  // name, no text sliced: this runs on every call node of every script the door lets in)
  const COPY = new Set(['load', 'write', 'writeFileSync']), RUN1 = new Set(['_compile', 'runInThisContext', 'runInNewContext', 'runInContext', 'compileFunction']);
  const calleeName = (c) => (c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' && !c.computed && c.property.type === 'Identifier' ? c.property.name : '');
  const textArg = (n) => {
    if (n.type === 'NewExpression') { const c = calleeName(n.callee); return c === 'Function' ? n.arguments[n.arguments.length - 1] : c === 'Script' ? n.arguments[0] : null; }
    if (n.type !== 'CallExpression') return null;
    const c = calleeName(n.callee); return RUN1.has(c) ? n.arguments[0] : COPY.has(c) ? n.arguments[1] : null;
  };
  const isEdit = (x) => x && x.type === 'CallExpression' && x.callee.type === 'MemberExpression' && !x.callee.computed && /^(?:replace|replaceAll|split|join)$/.test(x.callee.property.name || '');
  const isCure = (x) => x && x.type === 'CallExpression' && x.callee.type === 'Identifier' && CURED.has(x.callee.name);
  const chainBase = (x) => { let b = x; for (;;) { if (isEdit(b)) b = b.callee.object; else if (isCure(b) && b.arguments[0]) b = b.arguments[0]; else return b; } };
  const hasName = (q, nm) => { if (!q) return false; if (q.type === 'Identifier') return q.name === nm; if (q.type === 'AssignmentPattern') return hasName(q.left, nm); if (q.type === 'ArrayPattern') return q.elements.some((x) => hasName(x, nm)); if (q.type === 'ObjectPattern') return q.properties.some((x) => hasName(x.value || x.argument, nm)); if (q.type === 'RestElement') return hasName(q.argument, nm); return false; };
  const cureDef = (q) => (q.type === 'FunctionDeclaration' && q.id && CURED.has(q.id.name)) || (q.type === 'VariableDeclarator' && q.id.type === 'Identifier' && CURED.has(q.id.name));
  const fnAbove = (anc, k) => { for (let j = k; j >= 0; j--) if (FNT.has(anc[j].type)) return anc[j]; return ast; };
  const helperName = (fnNode, anc) => { if (fnNode.type === 'FunctionDeclaration' && fnNode.id) return fnNode.id.name; const k = anc.indexOf(fnNode), up = k > 0 ? anc[k - 1] : null; return up && up.type === 'VariableDeclarator' && up.id.type === 'Identifier' && up.init === fnNode ? up.id.name : null; };
  const loaders = [], cands = [];   // loaders: each text argument's own base (down its chain / cures) — a name, or a helper's call
  const visit = (n, anc) => {
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init && READ.test(text(n.init)) && PRODUCT.test(text(n.init))) product.add(n.id.name);
    else if (n.type === 'AssignmentExpression' && n.left.type === 'Identifier' && READ.test(text(n.right)) && PRODUCT.test(text(n.right))) product.add(n.left.name);
    else if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && curedOf(n.init)) product.add(n.id.name);
    else if (n.type === 'AssignmentExpression' && n.left.type === 'Identifier' && curedOf(n.right)) product.add(n.left.name);
    if (n.type === 'CallExpression' || n.type === 'NewExpression') {
      const ta = textArg(n);
      if (ta) { const b = chainBase(ta); if (b && (b.type === 'Identifier' || (b.type === 'CallExpression' && b.callee.type === 'Identifier'))) loaders.push({ b, scope: fnAbove(anc, anc.length - 1) }); }
    }
    if (n.type !== 'CallExpression' || n.callee.type !== 'MemberExpression' || n.callee.computed) return;
    const prop = n.callee.property.name;
    const isJoin = prop === 'join' && n.callee.object.type === 'CallExpression' && n.callee.object.callee.type === 'MemberExpression' && n.callee.object.callee.property.name === 'split';
    if (!(prop === 'replace' || prop === 'replaceAll' || isJoin)) return;
    let base = isJoin ? n.callee.object.callee.object : n.callee.object;
    while (isEdit(base)) base = base.callee.object;
    if (!base || base.type !== 'Identifier' || product.has(base.name)) return;   // a product name: unanchoredEdits' own (most edits stop here)
    const pat = isJoin ? n.callee.object.arguments[0] : n.arguments[0];
    if (pat && pat.type === 'Literal' && /\b(?:require|import|from)\b/.test(pat.regex ? pat.regex.pattern : String(pat.value))) return;
    // THE FLOW: the edit's own result, up through only what hands it on whole — the next link of its chain, a fold's step (an
    // arrow's body, or a step's `return`, as a `.reduce(` callback: the fold's answer), a cure's text argument — to its USER.
    let top = n, i = anc.length - 1;
    for (; i >= 0; i--) { const q = anc[i], up = i > 0 ? anc[i - 1] : null;
      if (q.type === 'MemberExpression' && q.object === top && !q.computed && up && up.callee === q && isEdit(up)) { top = up; i--; continue; }
      if (FNT.has(q.type) && q.body === top && up && up.type === 'CallExpression' && up.arguments[0] === q && calleeName(up.callee) === 'reduce') { top = up; i--; continue; }
      if (q.type === 'ReturnStatement' && q.argument === top && i >= 3 && anc[i - 1].type === 'BlockStatement' && FNT.has(anc[i - 2].type) && anc[i - 2].body === anc[i - 1] && anc[i - 3].type === 'CallExpression' && anc[i - 3].arguments[0] === anc[i - 2] && calleeName(anc[i - 3].callee) === 'reduce') { top = anc[i - 3]; i -= 3; continue; }
      if (isCure(q) && q.arguments[0] === top) { top = q; continue; }
      break; }
    const user = i >= 0 ? anc[i] : null;
    if (!user) return;
    const inText = textArg(user) === top;
    const decl = user.type === 'VariableDeclarator' && user.init === top && user.id.type === 'Identifier' ? user.id.name : user.type === 'AssignmentExpression' && user.right === top && user.left.type === 'Identifier' ? user.left.name : null;
    const returned = (user.type === 'ReturnStatement' && user.argument === top) || (FNT.has(user.type) && user.body === top);
    if (!inText && !decl && !returned) return;   // nothing a loader takes whole: no candidate (most string edits stop here)
    if (anc.some(cureDef)) return;   // the cure's own body
    let handed = false;
    for (let k = anc.length - 1; k >= 0 && !handed; k--) { const q = anc[k];
      if (FNT.has(q.type)) handed = q.params.some((x) => hasName(x, base.name));
      else if ((q.type === 'ForOfStatement' || q.type === 'ForInStatement') && q.left.type === 'VariableDeclaration') handed = hasName(q.left.declarations[0].id, base.name); }
    if (!handed) return;
    // the place that USES it is read where the user stands — a fold's step is not the helper, nor the declaring function
    const at = FNT.has(user.type) ? user : fnAbove(anc, i - 1);
    cands.push({ n, base: base.name, inText, decl, scope: at, helper: (returned || (decl && decl === base.name)) && at !== ast ? helperName(at, anc) : null });
  };
  const finish = () => {
    const out = [];
    for (const c of cands) {
      if (product.has(c.base)) continue;   // unanchoredEdits' own (a name bound after the edit was met)
      const reach = c.inText || (c.decl && loaders.some((l) => l.scope === c.scope && l.b.type === 'Identifier' && l.b.name === c.decl)) || (c.helper && loaders.some((l) => l.b.type === 'CallExpression' && l.b.callee.name === c.helper));
      if (reach) out.push({ line: src.slice(0, c.n.start).split('\n').length, text: text(c.n).replace(/\s+/g, ' ').slice(0, 100) });
    }
    return out;
  };
  if (plan) return { visit, finish };
  walkAst(ast, visit);
  return finish();
}

/** The three censuses of one script over ONE walk: the first list (unanchoredEdits), the anchor helpers (anchorHelpers), the second
 *  list (paramTextEdits) — each its own door, visitor and answer, the walk shared, so each answer is the one its own call gives.
 *  → { edits, helpers, paramEdits } */
export function censusAll(src, { ast }) {
  const e = unanchoredEdits(src, { ast, plan: true }), h = anchorHelpers(src, { ast, plan: true }), pt = paramTextEdits(src, { ast, plan: true });
  const vs = [e, h, pt].filter(Boolean).map((c) => c.visit);
  if (vs.length === 1) walkAst(ast, vs[0]);
  else if (vs.length) walkAst(ast, (n, anc) => { for (const v of vs) v(n, anc); });
  return { edits: e ? e.finish() : [], helpers: h ? h.finish() : [], paramEdits: pt ? pt.finish() : [] };
}
