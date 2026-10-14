#!/usr/bin/env node
// AN ENTER THAT COMMITS A WORD IN AN INPUT METHOD NEVER SUBMITS A TEXT BOX — THE CENSUS (lane channel-enter-ime,
// inc-mv7mdv6b-emxq, 2026-10-14: the Outbox's reject-reason box sent the owner's rejection mid-word — the ring:
// `KEY Enter [composing]` in input.chan-opt-input inside div.chan-prop-rejectbox, the server's receipt a second later).
// The SECOND incident of the class (the composer was the first, lanes chat-enter-ime r1/r2) ⇒ one helper
// (chat-enter-keys.js `enterSubmits(e)` = Enter && !imeOwnsKey(e)) and THIS census, derived from the source, never a list:
//   §1 every key handler in src/lib (addEventListener('keydown'|'keyup'|'keypress', …) / .onkeydown = …, a named handler
//      followed to where it is attached) that tests Enter in ANY spelling — `key ===/!== 'Enter'`, `case 'Enter'`,
//      `[…'Enter'…].includes(key)`, keyCode 13, `enterSubmits(e)`, or a call to a PURE verdict that tests it — is
//      classified by its TARGET's kind, read from the file: the receiver's creation (el/mk/createElement('input'|
//      'textarea'…), `.type`, role, tabIndex, contentEditable, a selector's markup — querySelector / getElementById /
//      `$` resolved in this file, then src/lib, then public/index.html — or a parameter named like an input). A handler
//      on a container (document, an overlay, a popover, a div) is the class unless it narrows the event's target to a
//      non-text element (`e.target === row`, `.closest('.row')`, `.tagName`, `rows.indexOf(document.activeElement)`)
//      or the scope that builds it builds no text box;
//   §2 a TEXT-BOX site must go through the helper or carry the full guard (isComposing AND keyCode 229, or imeOwnsKey)
//      on the same statement / an early return / an enclosing test — a site without it is RED, `!e.isComposing` alone
//      is RED (Safari's 229); buttons, rows, chips, menus, listboxes are exempt BY KIND (their role/tag/tabIndex). The
//      table is printed;
//   §3 controls: planted sources (a bare handler on an el('input'), a switch, an includes, a named handler, a partial
//      guard, a verdict call, a container that builds an input) are RED, their guarded twins green, a role=button row
//      exempt; the base rel268's two reject-box handlers (channel-outbox.js) are RED (git show, SKIP without the sha).
// The reject box's real Enter under CDP Input.imeSetComposition: test-channels-e2e ⑩ (heavy).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const acorn = require('acorn');
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + JSON.stringify(e) : '')); } };

const KEY_EVENTS = new Set(['keydown', 'keyup', 'keypress']);
const TEXT_TYPES = new Set(['', 'text', 'search', 'url', 'password', 'email', 'tel', 'number']);
const TEXT_ROLES = new Set(['textbox', 'searchbox', 'combobox']);
const ITEM_ROLES = new Set(['button', 'link', 'option', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'row', 'tab', 'listitem', 'checkbox', 'switch', 'radio', 'treeitem', 'gridcell']);
const COMPOSITE_ROLES = new Set(['menu', 'menubar', 'listbox', 'grid', 'tree', 'treegrid', 'tablist', 'toolbar', 'radiogroup']);
const ITEM_TAGS = new Set(['button', 'a', 'summary', 'select', 'option']);
const TAGS = new Set(['input', 'textarea', 'select', 'button', 'a', 'div', 'span', 'b', 'i', 'p', 'li', 'ul', 'ol', 'section', 'header', 'footer', 'nav', 'label', 'form', 'dialog', 'details', 'summary', 'table', 'tr', 'td', 'img', 'pre', 'code', 'em', 'strong', 'small', 'option', 'aside', 'main', 'article']);
// a parameter that names an input (the brief's "a parameter named like an input")
const INPUT_NAME = /^(inp|input|ta|textarea|field|editor|query|search)$|(Input|In|Field|Ta|Editor)$/;
// a text box built in a scope's source (the "container that builds no text box" exemption reads this)
const BUILDS_TEXT = /\b(?:createElement|el|mk|h)\(\s*(?:\w+\s*,\s*)?['"](?:input|textarea)['"]|<textarea|<input(?![^>]*type=["']?(?:checkbox|radio|hidden|file|button|submit|range|color)\b)|contentEditable|contenteditable/;

function walk(n, p, f) {
  if (!n || typeof n.type !== 'string') return;
  n._p = p; f(n);
  for (const k of Object.keys(n)) {
    if (k === '_p') continue;
    const v = n[k];
    if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') walk(c, n, f); }
    else if (v && typeof v.type === 'string') walk(v, n, f);
  }
}
const isFn = (n) => !!n && /Function/.test(n.type);
const lit = (n) => (n && n.type === 'Literal' ? n.value : n && n.type === 'TemplateLiteral' && !n.expressions.length ? n.quasis[0].value.cooked : undefined);
const unchain = (n) => (n && n.type === 'ChainExpression' ? n.expression : n);
const prop = (m) => { m = unchain(m); return m && m.type === 'MemberExpression' ? (m.computed ? lit(m.property) : m.property.name) : undefined; };
const calleeName = (c) => { c = unchain(c); return c && (c.type === 'Identifier' ? c.name : prop(c)); };
const isKeyRef = (n) => { n = unchain(n); return !!n && ((n.type === 'MemberExpression' && ['key', 'code'].includes(prop(n))) || (n.type === 'Identifier' && n.name === 'key')); };
const isEnter = (n) => ['Enter', 'NumpadEnter'].includes(lit(n));
const literalTags = (n) => { n = unchain(n); if (!n) return []; const v = lit(n); if (typeof v === 'string') return TAGS.has(v) ? [v] : []; if (n.type === 'ConditionalExpression') return [...literalTags(n.consequent), ...literalTags(n.alternate)]; return []; };

/** The markup that makes a selector, searched in `srcs` order: `<tag … class="… c …">`, `el('tag', '… c …')`,
 *  `x.className = '… c …'` / `x.classList.add('c')` beside `x = createElement('tag')`, `id="x"` — the tag + its
 *  role / tabindex / type / contenteditable. */
function markupTag(sel, srcs) {
  const last = String(sel).trim().split(/[\s>+~]+/).pop() || '';
  const m = /^([a-z][a-z0-9]*)?((?:[.#][\w-]+|\[[^\]]+\]|:[\w-]+(?:\([^)]*\))?)*)$/i.exec(last);
  if (!m) return null;
  const typeAttr = /\[type=["']?([\w-]+)/.exec(m[2] || '');
  if (m[1]) return { tag: m[1].toLowerCase(), facts: typeAttr ? { type: typeAttr[1] } : {}, from: 'selector' };
  if (/\[contenteditable/i.test(m[2] || '')) return { tag: 'div', facts: { contentEditable: true }, from: 'selector' };
  const id = /#([\w-]+)/.exec(m[2] || ''), cls = /\.([\w-]+)/.exec(m[2] || '');
  const word = (id || cls || [])[1];
  if (!word) return null;
  const w = word.replace(/-/g, '\\-');
  const attr = id ? `\\bid\\s*=\\s*["']${w}["']` : `\\bclass\\s*=\\s*["'][^"']*(?<![\\w-])${w}(?![\\w-])`;
  const reMarkup = new RegExp(`<([a-z][a-z0-9]*)\\b([^<>]*?)${attr}([^<>]*)>`, 'i');
  const reEl = cls ? new RegExp(`\\b(?:el|mk|h)\\(\\s*(?:\\w+\\s*,\\s*)?['"]([a-z][a-z0-9]*)['"]\\s*,\\s*['"\`][^'"\`]*(?<![\\w-])${w}(?![\\w-])`) : null;
  const reCls = cls ? new RegExp(`([\\w$]+)\\.(?:className\\s*=\\s*['"\`][^'"\`]*|classList\\.add\\([^)]*['"])(?<![\\w-])${w}(?![\\w-])`) : null;
  const attrFacts = (s) => {
    const f = {}, g = (re) => { const x = re.exec(s); return x ? x[1] : undefined; };
    const role = g(/\brole\s*=\s*["']?([\w-]+)/i), ti = g(/\btabindex\s*=\s*["']?(-?\d+)/i), ty = g(/\btype\s*=\s*["']?([\w-]+)/i);
    if (role) f.role = role; if (ti !== undefined) f.tabIndex = Number(ti); if (ty) f.type = ty; if (/contenteditable/i.test(s)) f.contentEditable = true;
    return f;
  };
  for (const { name, src } of srcs) {
    const a = reMarkup.exec(src);
    if (a) return { tag: a[1].toLowerCase(), facts: attrFacts(a[2] + ' ' + a[3]), from: name };
    const b = reEl && reEl.exec(src);
    if (b) return { tag: b[1].toLowerCase(), facts: {}, from: name };
    const c = reCls && reCls.exec(src);
    if (c) {
      const before = src.slice(0, c.index), v = c[1].replace(/\$/g, '\\$');
      const mk = [...before.matchAll(new RegExp(`\\b${v}\\s*=\\s*(?:document\\.createElement|el|mk|h)\\(\\s*(?:\\w+\\s*,\\s*)?['"]([a-z][a-z0-9]*)['"]`, 'g'))].pop();
      if (mk) { const after = src.slice(c.index, c.index + 400); return { tag: mk[1].toLowerCase(), facts: attrFacts(after.replace(new RegExp(`${v}\\.(?:setAttribute\\(['"](\\w+)['"],\\s*|(\\w+)\\s*=\\s*)`, 'g'), ' $1$2=')), from: name }; }
    }
  }
  return null;
}

/** Kind of an element from its tag + facts: text | item | composite | container. */
function kindOf(tag, facts = {}) {
  const role = facts.role, ty = facts.type;
  if (facts.contentEditable) return { kind: 'text', why: `${tag} contentEditable` };
  if (tag === 'textarea') return { kind: 'text', why: 'textarea' };
  if (tag === 'input') return ty == null || TEXT_TYPES.has(ty) ? { kind: 'text', why: `input${ty ? ' type=' + ty : ''}` } : { kind: 'item', why: `input type=${ty}` };
  if (role && TEXT_ROLES.has(role)) return { kind: 'text', why: `${tag} role=${role}` };
  if (ITEM_TAGS.has(tag)) return { kind: 'item', why: tag };
  if (role && ITEM_ROLES.has(role)) return { kind: 'item', why: `${tag} role=${role}` };
  if (role && COMPOSITE_ROLES.has(role)) return { kind: 'composite', why: `${tag} role=${role}` };
  if (facts.tabIndex === 0) return { kind: 'item', why: `${tag} tabIndex=0` };
  return { kind: 'container', why: tag + (role ? ` role=${role}` : '') };
}
const GUARD_RANK = { helper: 3, inline: 3, partial: 1 };
const best = (a, b) => ((GUARD_RANK[a] || 0) >= (GUARD_RANK[b] || 0) ? a : b) || null;
const worst = (a, b) => ((GUARD_RANK[a] || 0) <= (GUARD_RANK[b] || 0) ? a : b) || null;

/** census(files, { extraMarkup }) → rows: one per Enter test inside a key handler, one per PURE verdict, one per a
 *  verdict's call inside a handler. */
function census(files, { extraMarkup = [] } = {}) {
  const rows = [], A = new Map();
  for (const { name, src } of files) {
    let ast;
    try { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true, allowHashBang: true }); }
    catch (e) { rows.push({ file: name, line: 0, how: '-', ev: '-', recv: '-', kind: 'PARSE', why: e.message, guard: null, narrow: null, verdict: 'RED' }); continue; }
    const all = []; walk(ast, null, (n) => all.push(n));
    A.set(name, analyze({ name, src, all }));
  }
  const verdicts = [];
  for (const a of A.values()) verdicts.push(...a.collect());
  for (const a of A.values()) a.follow(verdicts);
  for (const a of A.values()) rows.push(...a.rows);
  return rows;

  function analyze(P) {
    const { name: file, src, all } = P;
    const text = (n) => src.slice(n.start, n.end);
    const lineOf = (n) => n.loc.start.line;
    const scopeOf = (n) => { for (let q = n._p; q; q = q._p) if (isFn(q)) return q; return null; };
    const within = (S, n) => !S || (n.start >= S.start && n.end <= S.end);
    const markupSrcs = () => [P, ...[...A.values()].map((a) => a.P).filter((q) => q !== P), ...extraMarkup];
    // imports: local name → { file, imported }
    const imports = new Map();
    for (const n of all) if (n.type === 'ImportDeclaration' && /^\.\//.test(n.source.value)) for (const s of n.specifiers) imports.set(s.local.name, { file: n.source.value.slice(2), imported: s.type === 'ImportNamespaceSpecifier' ? '*' : s.type === 'ImportDefaultSpecifier' ? 'default' : (s.imported.name || s.imported.value) });
    // declarations
    const decls = new Map();
    const addDecl = (nm, d) => { if (!decls.has(nm)) decls.set(nm, []); decls.get(nm).push(d); };
    const patIds = (pat, f, path = []) => {
      if (!pat) return;
      if (pat.type === 'Identifier') f(pat, path);
      else if (pat.type === 'AssignmentPattern') patIds(pat.left, f, path);
      else if (pat.type === 'ObjectPattern') for (const pr of pat.properties) patIds(pr.type === 'RestElement' ? pr.argument : pr.value, f, pr.type === 'RestElement' ? path : [...path, pr.key.name || lit(pr.key)]);
      else if (pat.type === 'ArrayPattern') for (const e of pat.elements) patIds(e, f, path);
    };
    const fns = new Map();   // function name → node (declarations + const arrows), for return resolution
    for (const n of all) {
      if (n.type === 'VariableDeclarator') {
        if (n.id.type === 'Identifier') { addDecl(n.id.name, { start: n.start, scope: scopeOf(n), init: n.init, how: 'decl', node: n }); if (isFn(n.init)) fns.set(n.id.name, n.init); }
        else patIds(n.id, (id, pth) => addDecl(id.name, { start: n.start, scope: scopeOf(n), init: n.init, how: 'destructure', key: pth[0], node: n }));
      }
      if (n.type === 'FunctionDeclaration' && n.id) fns.set(n.id.name, n);
      if (n.type === 'AssignmentExpression' && n.operator === '=' && n.left.type === 'Identifier') addDecl(n.left.name, { start: n.start, scope: scopeOf(n), init: n.right, how: 'assign', node: n });
      if (n.type === 'AssignmentExpression' && n.operator === '=' && n.left.type === 'MemberExpression' && n.left.object.type === 'ThisExpression') addDecl('this.' + prop(n.left), { start: n.start, scope: null, init: n.right, how: 'this', node: n });
      if (isFn(n)) for (const pa of n.params) patIds(pa, (id) => addDecl(id.name, { start: n.start, scope: n, init: null, how: 'param', fn: n }));
      if ((n.type === 'ForOfStatement' || n.type === 'ForInStatement') && n.left.type === 'VariableDeclaration') patIds(n.left.declarations[0].id, (id) => addDecl(id.name, { start: n.start, scope: n, init: n.right, how: 'forof', node: n }));
    }
    const nameOf = (r) => { r = unchain(r); return !r ? null : r.type === 'Identifier' ? r.name : r.type === 'MemberExpression' && r.object.type === 'ThisExpression' ? 'this.' + prop(r) : null; };
    const declFor = (nm, at) => {
      const c = (decls.get(nm) || []).filter((d) => within(d.scope, at) && (d.how === 'this' || d.how === 'param' || d.how === 'forof' || d.start <= at.start));
      c.sort((a, b) => (b.scope ? b.scope.start : -1) - (a.scope ? a.scope.start : -1) || b.start - a.start);
      return c[0] || null;
    };
    const factsOf = (nm, d) => {
      const f = {}, inScope = (n) => !d || !d.scope || d.how === 'param' || within(d.scope, n);
      for (const n of all) {
        if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && nameOf(n.left.object) === nm && inScope(n)) {
          const k = prop(n.left), v = lit(n.right);
          if (k === 'type') f.type = v !== undefined ? v : n.right.type === 'ConditionalExpression' ? [lit(n.right.consequent), lit(n.right.alternate)].find((x) => TEXT_TYPES.has(x)) : undefined;
          if (k === 'role' && v !== undefined) f.role = v;
          if (k === 'tabIndex' && typeof v === 'number') f.tabIndex = v;
          if (k === 'tabIndex' && n.right.type === 'UnaryExpression' && n.right.operator === '-') f.tabIndex = -lit(n.right.argument);
          if (k === 'contentEditable' && v !== 'false' && v !== false) f.contentEditable = true;
        }
        if (n.type === 'CallExpression' && prop(n.callee) === 'setAttribute' && nameOf(unchain(n.callee).object) === nm && inScope(n)) {
          const k = String(lit(n.arguments[0]) || '').toLowerCase(), v = lit(n.arguments[1]);
          if (k === 'role' && v !== undefined) f.role = v;
          if (k === 'type' && v !== undefined) f.type = v;
          if (k === 'tabindex') f.tabIndex = Number(v);
          if (k === 'contenteditable' && v !== 'false') f.contentEditable = true;
        }
      }
      if (f.type === undefined) delete f.type;
      return f;
    };
    const selectorOf = (call) => {
      call = unchain(call);
      if (!call || call.type !== 'CallExpression') return null;
      const cn = calleeName(call.callee), a0 = lit(call.arguments[0]);
      if (typeof a0 !== 'string') return null;
      if (cn === 'getElementById') return '#' + a0;
      if (['querySelector', 'querySelectorAll', 'closest', 'matches', '$', '$$'].includes(cn)) return a0;
      return null;
    };
    const fromSelector = (sel, more = {}) => {
      const m = markupTag(sel, markupSrcs());
      if (!m) return { kind: 'unknown', why: `${sel}: no markup found` };
      const k = kindOf(m.tag, { ...m.facts, ...more });
      return { kind: k.kind, why: `${sel} → ${k.why}${m.from !== file && m.from !== 'selector' ? ' (' + m.from + ')' : ''}` };
    };
    /** What function `cn` returns (key = a destructured property), resolved in this file or the module it is imported from. */
    const returnOf = (cn, key, depth) => {
      const imp = imports.get(cn);
      const a = imp && imp.imported !== '*' ? A.get(imp.file) : A.get(file);
      const fname = imp && imp.imported !== '*' ? imp.imported : cn;
      if (!a || depth > 5) return null;
      return a.returnKind(fname, key, depth + 1);
    };
    const returnKind = (fname, key, depth) => {
      const F = fns.get(fname);
      if (!F) return null;
      const rets = [];
      walk(F.body, F, (n) => { if (n.type === 'ReturnStatement' && n.argument && scopeOf(n) === F) rets.push(n); });
      if (F.body.type !== 'BlockStatement') rets.push({ argument: F.body, start: F.body.start, end: F.body.end, _p: F });
      const ks = [];
      for (const r of rets) {
        let arg = unchain(r.argument);
        if (key) { if (arg.type !== 'ObjectExpression') continue; const pr = arg.properties.find((q) => q.type === 'Property' && (q.key.name || lit(q.key)) === key); if (!pr) continue; arg = pr.value; }
        const k0 = classifyExpr(arg, r, depth);
        ks.push(k0.kind === 'built' ? finish(k0, null, null) : k0);
      }
      const k = ks.find((x) => x.kind === 'text') || ks.find((x) => x.kind !== 'unknown') || ks[0];
      return k ? { ...k, why: `${fname}()${key ? '.' + key : ''} → ${k.why}`, builders: [...(k.builders || []), { file, node: F }] } : null;
    };
    /** Classify an expression that yields the element (an init, a return value, an array member). */
    const classifyExpr = (init, at, depth = 0) => {
      init = unchain(init);
      if (!init || depth > 6) return { kind: 'unknown', why: init ? 'too deep' : 'no init' };
      if (init.type === 'AwaitExpression') return classifyExpr(init.argument, at, depth);
      if (init.type === 'LogicalExpression' || init.type === 'ConditionalExpression') {
        const parts = init.type === 'LogicalExpression' ? [init.left, init.right] : [init.consequent, init.alternate];
        const ks = parts.map((x) => classifyExpr(x, at, depth + 1)).filter((k) => k.kind !== 'unknown');
        return ks.find((k) => k.kind === 'text') || ks[0] || { kind: 'unknown', why: text(init).slice(0, 40) };
      }
      if (init.type === 'Identifier' || (init.type === 'MemberExpression' && init.object.type === 'ThisExpression')) return classifyRecv(init, at, depth + 1);
      if (init.type === 'CallExpression') {
        const sel = selectorOf(init);
        if (sel != null) return fromSelector(sel);
        const cn = calleeName(init.callee);
        let tags = cn === 'createElement' ? literalTags(init.arguments[0]) : TAGS.has(cn) ? [cn] : [];
        if (!tags.length && cn !== 'createElement') for (const a of init.arguments.slice(0, 2)) { tags = literalTags(a); if (tags.length) break; }
        if (tags.length) return { kind: 'built', tags, why: `${cn}(${tags.join('|')})`, builders: [{ file, node: scopeOf(init) }] };
        const r = cn && unchain(init.callee).type === 'Identifier' ? returnOf(cn, null, depth) : null;
        return r || { kind: 'unknown', why: `${cn || 'call'}()` };
      }
      return { kind: 'unknown', why: init.type };
    };
    // a receiver name at a node → { kind, why, built, builders, global }
    const classifyRecv = (recv, at, depth = 0) => {
      recv = unchain(recv);
      if (!recv) return { kind: 'container', why: 'window (a bare addEventListener)', global: true };
      if (recv.type === 'Identifier' && ['document', 'window', 'globalThis', 'self'].includes(recv.name)) return { kind: 'container', why: recv.name, global: true };
      if (recv.type === 'CallExpression') { const sel = selectorOf(recv); return sel != null ? fromSelector(sel) : { kind: 'unknown', why: text(recv).slice(0, 40) }; }
      const nm = nameOf(recv);
      if (!nm) return { kind: 'unknown', why: text(recv).slice(0, 40) };
      const d = declFor(nm, at);
      if (!d) return { kind: 'unknown', why: `${nm}: no declaration` };
      if (d.how === 'param') {
        const call = d.fn._p;   // the element of X.querySelectorAll(sel).forEach((row) => …)
        if (call && call.type === 'CallExpression' && ['forEach', 'map'].includes(calleeName(call.callee))) {
          let s0 = unchain(call.callee).object;
          if (s0.type === 'ArrayExpression' && s0.elements[0] && s0.elements[0].type === 'SpreadElement') s0 = s0.elements[0].argument;
          const sel = selectorOf(s0);
          if (sel != null) return fromSelector(sel, factsOf(nm, d));
        }
        if (INPUT_NAME.test(nm.replace(/^this\./, ''))) return { kind: 'text', why: `param ${nm} (named like an input)` };
        const f = factsOf(nm, d);
        if (f.role || f.tabIndex === 0 || f.contentEditable) { const k = kindOf('div', f); return { kind: k.kind, why: `param ${nm} ${k.why.replace(/^div ?/, '')}` }; }
        return { kind: 'unknown', why: `param ${nm}` };
      }
      if (d.how === 'forof') {
        const arr = unchain(d.init);
        if (!arr || arr.type !== 'ArrayExpression') return { kind: 'unknown', why: `for-of over ${d.init ? text(d.init).slice(0, 30) : '?'}` };
        const ks = arr.elements.map((x) => ({ x: text(x), k: finish(classifyExpr(x, d.node, depth + 1), nameOf(x), x.type === 'Identifier' ? declFor(x.name, d.node) : null) }));
        const k = ks.find((y) => y.k.kind === 'text') || ks.find((y) => y.k.kind !== 'unknown') || ks[0];
        return { ...k.k, why: `for-of [${ks.map((y) => y.x).join(', ')}]: ${k.x} = ${k.k.why}` };
      }
      if (d.how === 'destructure') {
        const init = unchain(d.init), cn = init && init.type === 'CallExpression' && unchain(init.callee).type === 'Identifier' ? calleeName(init.callee) : null;
        const r = cn ? returnOf(cn, d.key || nm, depth) : null;
        return r ? { ...finish(r, nm, d), why: `${nm} = ${r.why}`, builders: [...(r.builders || []), { file, node: d.scope }] } : { kind: 'unknown', why: `${nm} from ${init ? text(init).slice(0, 30) : '?'}` };
      }
      return finish(classifyExpr(d.init, d.node || at, depth), nm, d);
    };
    // a built element's tag + the facts set on its name ⇒ its kind
    const finish = (k, nm, d) => {
      const f = nm ? factsOf(nm, d) : {};
      if (k.kind === 'built') {
        const ks = k.tags.map((tg) => kindOf(tg, f));
        const kk = ks.find((x) => x.kind === 'text') || ks[0];
        return { kind: kk.kind, why: `${k.why}${kk.why.replace(/^\w+/, '')}`, built: true, builders: k.builders };
      }
      if (k.kind === 'container' && (f.role || f.tabIndex === 0 || f.contentEditable)) { const kk = kindOf('div', f); return { ...k, kind: kk.kind, why: k.why + ' ' + kk.why.replace(/^div ?/, '') }; }
      return k;
    };

    // key-event registrations
    const regs = [];
    for (const n of all) {
      if (n.type === 'CallExpression' && calleeName(n.callee) === 'addEventListener' && KEY_EVENTS.has(lit(n.arguments[0])) && n.arguments[1]) regs.push({ ev: lit(n.arguments[0]), recv: unchain(n.callee).type === 'MemberExpression' ? unchain(n.callee).object : null, h: n.arguments[1], at: n });
      if (n.type === 'AssignmentExpression' && /^onkey(down|up|press)$/.test(prop(n.left) || '')) regs.push({ ev: prop(n.left).slice(2), recv: n.left.object, h: n.right, at: n });
    }
    const fnName = (F) => {
      const p = F._p;
      if (F.type === 'FunctionDeclaration' && F.id) return F.id.name;
      if (p && p.type === 'VariableDeclarator' && p.id.type === 'Identifier') return p.id.name;
      if (p && (p.type === 'MethodDefinition' || p.type === 'Property' || p.type === 'PropertyDefinition')) return p.key.name || lit(p.key);
      if (p && p.type === 'AssignmentExpression') return prop(p.left) || (p.left.type === 'Identifier' ? p.left.name : undefined);
      return undefined;
    };
    // a handler: the function itself, or a named one attached by its name (`addEventListener('keydown', onKey)`, `.bind`)
    const regsFor = (F) => {
      const direct = regs.filter((r) => r.h === F);
      if (direct.length) return direct;
      const nm = fnName(F);
      if (!nm) return [];
      return regs.filter((r) => {
        const h = unchain(r.h);
        if (h.type === 'Identifier' && h.name === nm) return true;
        if (h.type === 'MemberExpression' && prop(h) === nm) return true;
        return h.type === 'CallExpression' && calleeName(h.callee) === 'bind' && prop(unchain(h.callee).object) === nm;
      });
    };
    const handlerOf = (t) => { for (let F = t._p; F; F = F._p) if (isFn(F)) { const r = regsFor(F); if (r.length) return { F, regs: r }; } return null; };
    const firstParam = (F) => (F.params[0] && F.params[0].type === 'Identifier' ? F.params[0].name : null);

    // guards: imeOwnsKey(...) / enterSubmits(...) / isComposing AND 229
    const guardIn = (expr) => {
      if (!expr) return null;
      let helper = false, comp = false, k229 = false;
      walk(expr, expr._p, (m) => {
        if (m.type === 'CallExpression' && /^(imeOwnsKey|enterSubmits)$/.test(calleeName(m.callee) || '')) helper = true;
        if (m.type === 'MemberExpression' && prop(m) === 'isComposing') comp = true;
        if (m.type === 'Literal' && m.value === 229) k229 = true;
      });
      return helper ? 'helper' : comp && k229 ? 'inline' : comp ? 'partial' : null;
    };
    const returns = (s) => { let r = false; walk(s, s._p, (m) => { if (m.type === 'ReturnStatement') r = true; }); return r; };
    /** The guard covering node t inside function F: its own condition, an enclosing if/&&/?:, an earlier `if (…) return`. */
    const guardFor = (t, F) => {
      let g = t.type === 'CallExpression' && calleeName(t.callee) === 'enterSubmits' ? 'helper' : null;
      for (let n = t, p = t._p; p && n !== F; n = p, p = p._p) {
        if (p.type === 'IfStatement' || p.type === 'ConditionalExpression') g = best(g, guardIn(p.test));
        if (p.type === 'LogicalExpression') g = best(g, guardIn(p));
        if (p.type === 'BlockStatement' || p.type === 'SwitchCase') {
          for (const s of p.type === 'SwitchCase' ? p.consequent : p.body) { if (s.start >= n.start) break; if (s.type === 'IfStatement' && returns(s.consequent)) g = best(g, guardIn(s.test)); }
        }
      }
      return g;
    };
    /** How handler F narrows the event's target before/at node t: { to: 'text'|'item'|'excluded'|'self', why } | null. */
    const narrowFor = (t, F, recv) => {
      const ev = firstParam(F);
      const isTR = (m) => { m = unchain(m); return !!m && m.type === 'MemberExpression' && ((ev && prop(m) === 'target' && unchain(m.object).type === 'Identifier' && unchain(m.object).name === ev) || (prop(m) === 'activeElement' && unchain(m.object).type === 'Identifier' && unchain(m.object).name === 'document')); };
      const isTag = (m) => { m = unchain(m); return !!m && m.type === 'MemberExpression' && prop(m) === 'tagName' && isTR(m.object); };
      const found = [];
      const scan = (expr, earlyReturn) => walk(expr, expr._p, (m) => {
        if (m.type === 'BinaryExpression' && /^[!=]==?$/.test(m.operator)) {
          const is = m.operator.startsWith('=') !== earlyReturn;   // `===` on the taken path, or `!==` before a return ⇒ the target IS it
          if (isTag(m.left) || isTag(m.right)) {
            const tg = String(lit(isTag(m.left) ? m.right : m.left) || '').toLowerCase(), tk = kindOf(tg).kind;
            found.push(is ? { to: tk === 'text' ? 'text' : 'item', why: `target is <${tg}>` } : tk === 'text' ? { to: 'excluded', why: `target <${tg}> returns first` } : null);
          } else if (isTR(m.left) || isTR(m.right)) {
            const other = isTR(m.left) ? m.right : m.left;
            if (nameOf(other) && nameOf(other) === nameOf(recv)) { if (is) found.push({ to: 'self', why: `target is ${text(other)} (the receiver itself)` }); }
            else {
              const k = classifyRecv(other, m, 1);
              if (k.kind === 'text') found.push(is ? { to: 'text', why: `target is ${text(other)} (${k.why})` } : { to: 'excluded', why: `target ${text(other)} (a text box) returns first` });
              else if (is && k.kind !== 'unknown') found.push({ to: 'item', why: `target is ${text(other)} (${k.why})` });
            }
          }
        }
        if (m.type === 'CallExpression' && ['closest', 'matches'].includes(calleeName(m.callee)) && isTR(unchain(m.callee).object)) {
          const k = fromSelector(lit(m.arguments[0]) || ''); found.push({ to: k.kind === 'text' ? 'text' : k.kind === 'unknown' ? 'unknown' : 'item', why: `target ${calleeName(m.callee)}(${lit(m.arguments[0])}): ${k.why}` });
        }
        if (m.type === 'CallExpression' && calleeName(m.callee) === 'contains' && prop(unchain(m.callee).object) === 'classList' && isTR(unchain(unchain(m.callee).object).object)) {
          const k = fromSelector('.' + lit(m.arguments[0])); found.push({ to: k.kind === 'text' ? 'text' : k.kind === 'unknown' ? 'unknown' : 'item', why: `target.classList ${k.why}` });
        }
        if (m.type === 'CallExpression' && calleeName(m.callee) === 'test' && m.arguments[0] && isTag(m.arguments[0])) {
          const re = unchain(m.callee).object, pat = re.regex ? re.regex.pattern : '', textOut = /INPUT/.test(pat) && /TEXTAREA/.test(pat);
          found.push(earlyReturn ? (textOut ? { to: 'excluded', why: `target tag /${pat}/ returns first` } : null) : { to: textOut ? 'text' : 'item', why: `target tag /${pat}/` });
        }
        if (m.type === 'CallExpression' && calleeName(m.callee) === 'indexOf' && m.arguments[0] && isTR(m.arguments[0])) found.push({ to: 'item', why: `${text(m).slice(0, 50)} (one of a list)`, indexOf: true });
      });
      for (let n = t, p = t._p; p && n !== F; n = p, p = p._p) {
        if (p.type === 'IfStatement') scan(p.test, false);
        if (p.type === 'LogicalExpression') scan(p, false);
        if (p.type === 'BlockStatement' || p.type === 'SwitchCase') {
          for (const s of p.type === 'SwitchCase' ? p.consequent : p.body) {
            if (s.start >= n.start) break;
            if (s.type === 'IfStatement' && returns(s.consequent) && !s.alternate) scan(s.test, true);
            if (s.type === 'VariableDeclaration') for (const dd of s.declarations) if (dd.init) scan(dd.init, false);
          }
        }
      }
      // an indexOf narrows only when the Enter's own condition reads its result (`… && i >= 0`)
      let cond = t; while (cond._p && cond._p !== F && /Expression$/.test(cond._p.type)) cond = cond._p;
      const fs2 = found.filter(Boolean).filter((f) => !f.indexOf || />=\s*0/.test(text(cond)));
      return fs2.find((f) => f.to === 'text') || fs2.find((f) => f.to === 'item' || f.to === 'excluded' || f.to === 'self') || null;
    };

    const tests = all.filter((n) =>
      (n.type === 'BinaryExpression' && /^[!=]==?$/.test(n.operator) && ((isKeyRef(n.left) && isEnter(n.right)) || (isKeyRef(n.right) && isEnter(n.left))))
      || (n.type === 'BinaryExpression' && /^[!=]==?$/.test(n.operator) && [n.left, n.right].some((s) => ['keyCode', 'which'].includes(prop(s))) && [n.left, n.right].some((s) => lit(s) === 13))
      || (n.type === 'SwitchCase' && isEnter(n.test) && isKeyRef(n._p.discriminant))
      || (n.type === 'CallExpression' && calleeName(n.callee) === 'includes' && unchain(n.callee).object.type === 'ArrayExpression' && unchain(n.callee).object.elements.some(isEnter))
      || (n.type === 'CallExpression' && calleeName(n.callee) === 'enterSubmits'));
    const out = [];
    const row = (t, how, h, extraGuard) => {
      for (const r of h.regs) {
        const k = classifyRecv(r.recv, r.at);
        const guard = best(guardFor(t, h.F), extraGuard);
        const narrow = k.kind === 'text' ? null : narrowFor(t, h.F, r.recv);
        let kind = k.kind, why = k.why, verdict;
        if (narrow && narrow.to === 'text') { kind = 'text'; why += ` · ${narrow.why}`; }
        else if (kind === 'container' || kind === 'unknown') {
          if (narrow && (narrow.to === 'item' || narrow.to === 'excluded' || (narrow.to === 'self' && kind === 'container'))) verdict = 'EXEMPT';
          else if (kind === 'container' && k.built && !k.global && !(k.builders || []).some((b) => BUILDS_TEXT.test(b.node ? A.get(b.file).P.src.slice(b.node.start, b.node.end) : A.get(b.file).P.src))) { verdict = 'EXEMPT'; why += ' · builds no text box'; }
          else if (kind === 'container') kind = 'container+text';
        }
        if (!verdict) verdict = kind === 'item' || kind === 'composite' ? 'EXEMPT' : guard === 'helper' || guard === 'inline' ? 'OK' : 'RED';
        out.push({ file, line: lineOf(t), how, ev: r.ev, recv: r.recv ? text(r.recv).replace(/\s+/g, ' ') : '(global)', kind, why, guard, narrow: narrow && narrow.why, verdict });
      }
    };
    return {
      P, returnKind, rows: out,
      /** this file's Enter tests: handler rows now; the tests outside any handler are PURE verdicts (returned) */
      collect() {
        const vs = [];
        for (const t of tests) {
          const how = t.type === 'SwitchCase' ? "case 'Enter'" : t.type === 'CallExpression' ? (calleeName(t.callee) === 'enterSubmits' ? 'enterSubmits(e)' : "[…'Enter'].includes") : /keyCode|which/.test(text(t)) ? 'keyCode 13' : text(t).replace(/\s+/g, ' ').slice(0, 24);
          const h = handlerOf(t);
          if (h) { row(t, how, h, null); continue; }
          let F = t._p; while (F && !isFn(F)) F = F._p;
          const nm = F ? fnName(F) : null;
          const g = F ? guardFor(t, F) : null;
          const prev = vs.find((v) => v.F === F);
          if (prev) { prev.guard = worst(prev.guard, g); continue; }
          vs.push({ file, F, name: nm, guard: g, line: lineOf(t) });
          out.push({ file, line: lineOf(t), how, ev: '-', recv: nm ? nm + '()' : '(top level)', kind: 'verdict', why: 'not a key handler — its calls inside handlers are rows', guard: g, narrow: null, verdict: 'EXEMPT' });
        }
        return vs;
      },
      /** a PURE verdict's calls inside this file's key handlers: same file, or imported from the verdict's module */
      follow(verdicts) {
        for (const n of all) {
          if (n.type !== 'CallExpression') continue;
          const c = unchain(n.callee), cn = calleeName(c);
          for (const v of verdicts) {
            // enterSubmits(e) is already a row of its own (a test); a verdict's own body never calls itself into a row
            if (!v.name || v.name !== cn || cn === 'enterSubmits' || within(v.F, n)) continue;
            const imp = imports.get(c.type === 'Identifier' ? cn : nameOf(c.object) || '');
            const same = v.file === file && (c.type === 'Identifier' || c.object.type === 'ThisExpression');
            const imported = c.type === 'Identifier' ? imp && imp.file === v.file && imp.imported === cn : imp && imp.imported === '*' && imp.file === v.file;
            if (!same && !imported) continue;
            const h = handlerOf(n);
            if (h) row(n, `via ${cn}()`, h, v.guard);
          }
        }
      },
    };
  }
}

const libFiles = (root) => fs.readdirSync(path.join(root, 'src/lib')).filter((f) => f.endsWith('.js')).sort().map((f) => ({ name: f, src: fs.readFileSync(path.join(root, 'src/lib', f), 'utf8') }));
const INDEX_HTML = { name: 'public/index.html', src: fs.readFileSync(path.join(REPO, 'public/index.html'), 'utf8') };
const t0 = Date.now();
const rows = census(libFiles(REPO), { extraMarkup: [INDEX_HTML] });
const ms = Date.now() - t0;

// §1 the table
console.log('§1 the Enter census over src/lib (' + rows.length + ' sites, ' + ms + ' ms)');
const pad = (s, n) => String(s).padEnd(n).slice(0, n);
for (const r of rows) console.log(`  ${pad(r.verdict, 6)} ${pad(r.file + ':' + r.line, 34)} ${pad(r.how, 22)} ${pad(r.kind, 14)} ${pad(r.guard || '-', 7)} ${pad(r.recv, 22)} ${r.why}${r.narrow ? ' · narrowed: ' + r.narrow : ''}`);
const by = (v) => rows.filter((r) => r.verdict === v);
console.log(`  = ${by('OK').length} guarded text-box sites · ${by('EXEMPT').length} exempt by kind · ${by('RED').length} RED`);

// §2 the law
const red = by('RED');
ok('every text-box Enter in src/lib goes through enterSubmits(e) / the full guard (no RED row)', red.length === 0, red.map((r) => `${r.file}:${r.line} ${r.kind} ${r.why}${r.guard ? ' guard=' + r.guard : ''}`));
ok('the census sees the class: ≥ 25 guarded text-box sites and ≥ 25 exempt rows (a broken classifier shrinks one side)', by('OK').length >= 25 && by('EXEMPT').length >= 25, { ok: by('OK').length, exempt: by('EXEMPT').length });
ok('an unresolvable receiver is never assumed a button: unknown-kind rows are guarded, or exempt only by a narrowing of the event target', !rows.some((r) => r.kind === 'unknown' && r.verdict !== 'OK' && !r.narrow), rows.filter((r) => r.kind === 'unknown').map((r) => `${r.file}:${r.line} ${r.why} ${r.verdict}`));
const rj = rows.filter((r) => r.file === 'channel-outbox.js' && /chan-opt-input|el\(input\)/.test(r.why) && r.kind === 'text');
ok('the incident\'s reject boxes (channel-outbox.js, input.chan-opt-input) are text-box rows and guarded', rj.length === 2 && rj.every((r) => r.verdict === 'OK'), rj);
ok('the census runs fast (< 3 s over all of src/lib)', ms < 3000, ms);

// §3 controls
const one = (src) => census([{ name: 'plant.js', src }]);
const verdictOf = (src) => one(src).map((r) => r.verdict).join(',');
const PLANT = {
  bareInput: "const inp = el('input', 'x'); inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); });",
  helperInput: "import { enterSubmits } from './chat-enter-keys.js'; const inp = el('input', 'x'); inp.addEventListener('keydown', (e) => { if (enterSubmits(e)) go.click(); });",
  inlineInput: "const inp = el('input', 'x'); inp.onkeydown = (e) => { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) go(); };",
  earlyReturn: "const ta = document.createElement('textarea'); ta.addEventListener('keydown', (e) => { if (imeOwnsKey(e)) return; if (e.key === 'Enter') send(); });",
  partial: "const ta = document.createElement('textarea'); ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) send(); });",
  switchCase: "const s = document.createElement('input'); s.type = 'search'; s.onkeydown = (e) => { switch (e.key) { case 'Enter': run(); break; default: } };",
  includes: "const s = el('textarea'); s.onkeydown = (e) => { if (['Enter', 'Tab'].includes(e.key)) pick(); };",
  keyCode: "const s = el('input'); s.onkeydown = (e) => { if (e.keyCode === 13) pick(); };",
  named: "function onKey(e) { if (e.key === 'Enter') save(); }\nconst f = document.createElement('input'); f.addEventListener('keydown', onKey);",
  verdictCall: "export function isSubmit(e) { return e.key === 'Enter'; }\nconst q = el('input'); q.addEventListener('keydown', (e) => { if (isSubmit(e)) save(); });",
  verdictGuarded: "export function isSubmit(e) { return e.key === 'Enter'; }\nconst q = el('input'); q.addEventListener('keydown', (e) => { if (imeOwnsKey(e)) return; if (isSubmit(e)) save(); });",
  containerWithInput: "function box() { const o = el('div', 'dlg'); const i = el('input', 'name'); o.append(i); o.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(true); }); }",
  containerNoInput: "function confirm() { const o = el('div', 'dlg'); const ok = el('button', 'ok'); o.append(ok); o.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(true); }); }",
  document: "document.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitForm(); });",
  documentNarrowed: "document.addEventListener('keydown', (e) => { if (e.target?.tagName === 'SELECT' && e.key === 'Enter') close(e.target); });",
  narrowedToInput: "function f() { const o = el('div'); const inp = el('input'); o.addEventListener('keydown', (e) => { if (e.target === inp && e.key === 'Enter') go(); }); }",
  row: "const row = el('div', 'r'); row.tabIndex = 0; row.setAttribute('role', 'button'); row.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') open(); };",
  checkbox: "const c = el('input'); c.type = 'checkbox'; c.onkeydown = (e) => { if (e.key === 'Enter') c.click(); };",
  forOf: "const user = el('input'), pass = el('input'); pass.type = 'password'; for (const i of [user, pass]) i.onkeydown = (e) => { if (e.key === 'Enter') signIn(); };",
  selector: "const box = mk('div'); box.innerHTML = '<input class=\"q-in\" type=\"text\">'; const q = box.querySelector('.q-in'); q.onkeydown = (e) => { if (e.key === 'Enter') go(); };",
  unknownParam: "export function wire(thing) { thing.onkeydown = (e) => { if (e.key === 'Enter') go(); }; }",
};
const V = Object.fromEntries(Object.entries(PLANT).map(([k, s]) => [k, verdictOf(s)]));
ok('RED control: a planted bare handler on an el(\'input\') is RED', V.bareInput === 'RED', V.bareInput);
ok('… its twins through enterSubmits(e), the inline isComposing+229 guard, an early imeOwnsKey return are OK', V.helperInput === 'OK' && V.inlineInput === 'OK' && V.earlyReturn === 'OK', [V.helperInput, V.inlineInput, V.earlyReturn]);
ok('`!e.isComposing` alone (no keyCode 229 — Safari) is RED', V.partial === 'RED', V.partial);
ok('every spelling is seen: switch case, […].includes, keyCode 13, a named handler attached later — all RED bare', V.switchCase === 'RED' && V.includes === 'RED' && V.keyCode === 'RED' && V.named === 'RED', [V.switchCase, V.includes, V.keyCode, V.named]);
ok('a PURE verdict that tests Enter is followed into the text box\'s handler: RED bare, OK after an early imeOwnsKey return', V.verdictCall.split(',').includes('RED') && !V.verdictGuarded.split(',').includes('RED'), [V.verdictCall, V.verdictGuarded]);
ok('a container that builds a text box is the class (RED); one that builds none is exempt; document unguarded is RED, narrowed to SELECT exempt', V.containerWithInput === 'RED' && V.containerNoInput === 'EXEMPT' && V.document === 'RED' && V.documentNarrowed === 'EXEMPT', [V.containerWithInput, V.containerNoInput, V.document, V.documentNarrowed]);
ok('a container narrowed TO its text box is RED (the narrowing reads the element\'s kind, never just "a target check")', V.narrowedToInput === 'RED', V.narrowedToInput);
ok('exempt BY KIND: a role=button row, a checkbox', V.row === 'EXEMPT' && V.checkbox === 'EXEMPT', [V.row, V.checkbox]);
ok('a for-of over [user, pass], a querySelector resolved through the markup are text boxes (RED bare)', V.forOf === 'RED' && V.selector === 'RED', [V.forOf, V.selector]);
ok('an unresolvable receiver (a parameter not named like an input) is RED, never assumed a button', V.unknownParam === 'RED', V.unknownParam);

// the base rel268: the incident's two reject boxes are RED there
const BASE = '5e9530069';
let baseSrc = null;
try { baseSrc = execFileSync('git', ['-C', REPO, 'show', `${BASE}:src/lib/channel-outbox.js`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 }); } catch {}
if (baseSrc == null) console.log(`  SKIP: ${BASE} is not in this checkout (the base control needs the rel268 commit)`);
else {
  const b = census([{ name: 'channel-outbox.js', src: baseSrc }]).filter((r) => r.kind === 'text');
  ok(`the base ${BASE}'s two reject-box handlers (channel-outbox.js, \`if (e.key === 'Enter') go.click()\`) are RED`, b.length === 2 && b.every((r) => r.verdict === 'RED'), b.map((r) => `${r.line} ${r.verdict}`));
}

console.log(`\n${fail ? 'FAILED' : 'ALL PASS'}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
