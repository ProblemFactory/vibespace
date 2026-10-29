#!/usr/bin/env node
// A CHANGE THE PERSON MADE NEVER VANISHES WITHOUT A WORD (lane dialog-unsaved-guard, B-bc31 — the owner 2026-10-21 ticked
// «Also judge plain replies» in Notify…, closed it with ✕, and a colleague's reply went unjudged) — FAST, PURE (acorn).
//   ① THE CENSUS: every createModalShell( call in src/lib whose dialog draws a Save button — t('Save') / '保存' in the
//      function that opens it, or in a same-file top-level function it calls (grantAccessBody's shape; a function that
//      opens its OWN dialog is that dialog's, never followed) — passes `unsaved:` in its options: an object (the shell's
//      guard) or an explicit `false` with its reason as a comment on the same line. PRINTED, counted; a miss is RED with
//      its file:line. A hand list never decides it.
//   ② the controls: Notify… without `unsaved` ⇒ RED; a `false` without its reason ⇒ RED; `unsaved: someName` (neither an
//      object nor false) ⇒ RED; a NEW Save dialog in a scratch file (inline, and through a helper it calls) ⇒ RED; a
//      dialog with no Save is not counted; a helper that opens another dialog is not followed
//   ③ the shell's wiring pin: ✕, the backdrop and Escape (the overlay's and the idle one) go through the guard's
//      `dismiss` — MUTANT ✕ straight to `close` ⇒ RED
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const acorn = require('acorn');
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, m, e) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (e !== undefined ? '\n    ' + String(typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } };

function walk(node, fn, parents = []) {
  if (!node || typeof node.type !== 'string') return;
  fn(node, parents);
  const ps = [...parents, node];
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'start' || k === 'end') continue;
    const v = node[k];
    if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') walk(x, fn, ps); }
    else if (v && typeof v.type === 'string') walk(v, fn, ps);
  }
}
const FN = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
/** A Save button's words: t('Save') (tr / tc alike) or a literal '保存'. */
const isSaveWords = (n) => (n.type === 'CallExpression' && n.callee.type === 'Identifier' && /^t[rc]?$/.test(n.callee.name) && n.arguments[0] && n.arguments[0].type === 'Literal' && n.arguments[0].value === 'Save')
  || (n.type === 'Literal' && n.value === '保存');
/** A module-level function (declared, exported, or a top-level const = function) — the only ones a call is followed into. */
function topLevel(ps) {
  const k = ps.map((p) => p.type);
  if (k.length === 1) return true;   // Program › FunctionDeclaration
  if (k.length === 2 && /^Export/.test(k[1])) return true;
  if (k.length === 3 && k[1] === 'VariableDeclaration') return true;
  return k.length === 4 && /^Export/.test(k[1]) && k[2] === 'VariableDeclaration';
}

export function censusFiles(root) {
  return execFileSync('git', ['-C', root, 'ls-files', '-co', '--exclude-standard', 'src/lib'], { encoding: 'utf8' }).split('\n').filter((f) => f.endsWith('.js') && fs.existsSync(path.join(root, f)));
}

/** → { rows: [{file, line, fn, saves, decl: 'object'|'false'|'missing'|'bad', reason}], bad: [...rows not wired] }.
 *  `override` = { file: text } (a mutant or a scratch file the tree does not hold). A dialog's Save may be drawn by a
 *  function it IMPORTS from another src/lib module (Reach & policy… draws grantAccessBody's) — a named import of a
 *  relative module is followed exactly like a same-file call. */
export function censusSaveDialogs({ root = REPO, files = null, override = {} } = {}) {
  const list = [...new Set([...(files || censusFiles(root)), ...Object.keys(override)])];
  const cache = new Map();
  const index = (f) => {
    if (cache.has(f)) return cache.get(f);
    let text = null;
    if (Object.prototype.hasOwnProperty.call(override, f)) text = override[f];
    else if (fs.existsSync(path.join(root, f))) text = fs.readFileSync(path.join(root, f), 'utf8');
    let ix = null;
    if (text !== null) {
      try { ix = { file: f, text, ast: acorn.parse(text, { ecmaVersion: 'latest', sourceType: 'module', locations: true }) }; }
      catch (e) { ix = { file: f, text, err: e }; }
    }
    if (ix && ix.ast) {
      const named = new Map(); const fnName = new Map(); const saves = []; const calls = []; const imports = new Map();
      walk(ix.ast, (n, ps) => {
        if (n.type === 'ImportDeclaration' && typeof n.source.value === 'string' && n.source.value.startsWith('.')) {
          const to = path.posix.normalize(path.posix.join(path.posix.dirname(f), n.source.value));
          for (const sp of n.specifiers) if (sp.type === 'ImportSpecifier') imports.set(sp.local.name, { file: to, name: sp.imported.name });
        }
        if (FN.has(n.type)) {
          const p = ps[ps.length - 1];
          let name = n.id && n.id.name;
          if (!name && p && p.type === 'VariableDeclarator' && p.id.type === 'Identifier') name = p.id.name;
          if (!name && p && (p.type === 'Property' || p.type === 'MethodDefinition') && p.key && p.key.type === 'Identifier') name = p.key.name;
          if (name) fnName.set(n, name);
          // the shell's own definition (its sheet's Save) is never a dialog's
          if (name && name !== 'createModalShell' && topLevel(n.type === 'FunctionDeclaration' ? ps : ps.slice(0, -1))) { if (!named.has(name)) named.set(name, []); named.get(name).push(n); }
        }
        if (isSaveWords(n)) saves.push(n);
        if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'createModalShell') calls.push({ n, fn: [...ps].reverse().find((q) => FN.has(q.type)) || null });
      });
      const builders = calls.map((c) => c.fn).filter(Boolean);
      Object.assign(ix, { named, fnName, saves, calls, imports, opensOwn: (g) => builders.some((b) => b.start >= g.start && b.end <= g.end) });
    }
    cache.set(f, ix);
    return ix;
  };
  const rows = [];
  for (const f of list) {
    const ix = index(f);
    if (!ix || !ix.text.includes('createModalShell(')) continue;
    if (ix.err) { rows.push({ file: f, line: (ix.err.loc && ix.err.loc.line) || 0, fn: '(parse)', saves: [], decl: 'bad', reason: 'unparseable: ' + ix.err.message }); continue; }
    const lines = ix.text.split('\n');
    for (const { n, fn } of ix.calls) {
      if (!fn || ix.fnName.get(fn) === 'createModalShell') continue;   // the shell's own definition
      // THE DIALOG'S UNIT: the function that opens it + every top-level function it calls (same file, or a named import of
      // a relative module), transitively — never one that opens its own dialog (that is the other dialog's)
      const unit = [{ ix, fn }]; const seen = new Set([fn]);
      for (let i = 0; i < unit.length; i++) {
        const u = unit[i];
        walk(u.fn.body, (c) => {
          if (c.type !== 'CallExpression' || c.callee.type !== 'Identifier') return;
          const nm = c.callee.name;
          const add = (oix, g) => { if (!seen.has(g) && !oix.opensOwn(g)) { seen.add(g); unit.push({ ix: oix, fn: g }); } };
          if (u.ix.named.has(nm)) { for (const g of u.ix.named.get(nm)) add(u.ix, g); return; }
          const im = u.ix.imports.get(nm);
          const oix = im && index(im.file);
          if (oix && oix.named && oix.named.has(im.name)) for (const g of oix.named.get(im.name)) add(oix, g);
        });
      }
      const hit = [];
      for (const u of unit) for (const sv of u.ix.saves) if (sv.start >= u.fn.start && sv.end <= u.fn.end) hit.push(u.ix.file === f ? String(sv.loc.start.line) : `${u.ix.file}:${sv.loc.start.line}`);
      if (!hit.length) continue;
      const opts = n.arguments[0];
      const prop = opts && opts.type === 'ObjectExpression' ? opts.properties.find((q) => q.type === 'Property' && !q.computed && ((q.key.type === 'Identifier' && q.key.name === 'unsaved') || (q.key.type === 'Literal' && q.key.value === 'unsaved'))) : null;
      let decl = 'missing'; let reason = '';
      if (prop && prop.value.type === 'ObjectExpression') decl = 'object';
      else if (prop && prop.value.type === 'Literal' && prop.value.value === false) {
        const line = lines[prop.value.loc.end.line - 1] || '';
        const m = /\/\/\s*(.*)$/.exec(line.slice(prop.value.loc.end.column));
        reason = m ? m[1].trim() : '';
        decl = reason.length >= 12 ? 'false' : 'bad';
        if (decl === 'bad') reason = 'unsaved: false without its reason (a // comment on the same line)';
      } else if (prop) { decl = 'bad'; reason = 'unsaved: is neither an object nor false'; }
      rows.push({ file: f, line: n.loc.start.line, fn: ix.fnName.get(fn) || '(anonymous)', saves: [...new Set(hit)], decl, reason });
    }
  }
  return { rows, bad: rows.filter((r) => r.decl === 'missing' || r.decl === 'bad') };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  console.log('— ① the census: every Save dialog declares `unsaved:`');
  const r = censusSaveDialogs();
  const wired = r.rows.filter((x) => x.decl === 'object'); const declared = r.rows.filter((x) => x.decl === 'false');
  for (const x of r.rows) console.log(`    ${x.decl === 'object' ? 'GUARDED ' : x.decl === 'false' ? 'FALSE   ' : 'MISSING '} ${x.file}:${x.line} ${x.fn} (Save at ${x.saves.join(', ')})${x.reason ? ' — ' + x.reason : ''}`);
  console.log(`    census: ${r.rows.length} Save dialogs — ${wired.length} guarded, ${declared.length} declared false, ${r.bad.length} not wired`);
  ok(r.bad.length === 0, `every Save dialog passes unsaved: (an object, or false with its reason) — ${r.rows.length} counted`, r.bad.map((x) => `${x.file}:${x.line} ${x.fn}: ${x.decl}${x.reason ? ' — ' + x.reason : ''}`));
  // the census sees what it must (a detector that finds nothing would be green on nothing)
  const at = (file, fn) => r.rows.find((x) => x.file === file && x.fn === fn);
  for (const [file, fn] of [['src/lib/channel-filter-editor.js', 'showNotifyDialog'], ['src/lib/channel-filter-editor.js', 'showGrantAccessDialog'], ['src/lib/vault-automation.js', 'showEditDialog'], ['src/lib/sidebar-mounts.js', '_showEditMountDialog'], ['src/lib/channel-reach-editor.js', 'showAccountReachDialog']]) {
    ok(!!at(file, fn), `the census sees ${fn} (${file}) as a Save dialog`);
  }
  ok(at('src/lib/channel-filter-editor.js', 'showGrantAccessDialog')?.saves.length === 1 && at('src/lib/channel-filter-editor.js', 'showNotifyDialog')?.saves.length === 1, 'Access… reaches its Save through grantAccessBody, never Notify…\'s (a function that opens its own dialog is not followed)');
  ok(at('src/lib/channel-filter-editor.js', 'showNotifyDialog')?.decl === 'object' && at('src/lib/channel-filter-editor.js', 'showGrantAccessDialog')?.decl === 'object', 'Notify… and Access… are GUARDED (the owner\'s two)');
  ok(r.rows.length >= 15, `the census counts at least 15 Save dialogs (${r.rows.length})`);

  console.log('— ② the controls');
  const NOTIFY = 'src/lib/channel-filter-editor.js';
  const src = fs.readFileSync(path.join(REPO, NOTIFY), 'utf8');
  const cut = src.replace("unsaved: { isDirty: () => dirtyNow(), save: () => saveNow() }, kind: 'form' });\n  if (raised) return null;", "unsavedX: { isDirty: () => dirtyNow(), save: () => saveNow() }, kind: 'form' });\n  if (raised) return null;"); // (r3: the call reads `raised` next) // lane dialog-yield: the call declares its kind (a form)
  ok(cut !== src, 'mutant: Notify… loses `unsaved`');
  const m1 = censusSaveDialogs({ files: [NOTIFY], override: { [NOTIFY]: cut } });
  ok(m1.bad.some((x) => x.fn === 'showNotifyDialog' && x.decl === 'missing'), 'Notify… without `unsaved:` ⇒ RED (missing)', m1.bad);
  const PROBE = 'src/lib/__unsaved-census-probe.js';
  const probe = (body) => ({ [PROBE]: `import { createModalShell } from './utils.js';\nimport { t } from './i18n.js';\n${body}\n` });
  const run = (body) => censusSaveDialogs({ files: [], override: probe(body) });
  const inline = run(`export function showThing() {\n  const { body, close } = createModalShell({ id: 'x', title: 'X' });\n  const b = document.createElement('button'); b.textContent = t('Save'); body.appendChild(b);\n}`);
  ok(inline.bad.length === 1 && inline.bad[0].decl === 'missing', 'a NEW Save dialog without `unsaved:` ⇒ RED', inline.rows);
  const viaHelper = run(`function drawForm(body) { const b = document.createElement('button'); b.textContent = t('Save'); body.appendChild(b); }\nexport function showThing() {\n  const { body } = createModalShell({ id: 'x' });\n  drawForm(body);\n}`);
  ok(viaHelper.bad.length === 1, 'a NEW Save dialog whose Save is drawn by a top-level helper it calls ⇒ RED', viaHelper.rows);
  const imported = censusSaveDialogs({ files: [], override: { ...probe(`import { grantAccessBody } from './channel-filter-editor.js';\nexport function showThing(app, st) {\n  const { body, close } = createModalShell({ id: 'x' });\n  grantAccessBody(app, st, body, { close });\n}`) } });
  ok(imported.bad.length === 1 && imported.bad[0].saves.some((x) => x.startsWith('src/lib/channel-filter-editor.js:')), 'a NEW dialog whose Save is drawn by an IMPORTED helper (grantAccessBody) ⇒ RED', imported.rows);
  const zh = run(`export function showThing() {\n  const { body } = createModalShell({ id: 'x' });\n  body.innerHTML = '<button>' + '保存' + '</button>';\n}`);
  ok(zh.bad.length === 1, "a Save worded '保存' counts too", zh.rows);
  const noReason = run(`export function showThing() {\n  const { body } = createModalShell({ id: 'x', unsaved: false });\n  body.append(t('Save'));\n}`);
  ok(noReason.bad.length === 1 && noReason.bad[0].decl === 'bad', '`unsaved: false` without its reason ⇒ RED', noReason.rows);
  const withReason = run(`export function showThing() {\n  const { body } = createModalShell({ id: 'x', unsaved: false }); // nothing changes here until Save: it only shows\n  body.append(t('Save'));\n}`);
  ok(withReason.bad.length === 0 && withReason.rows[0]?.decl === 'false' && /nothing changes/.test(withReason.rows[0].reason), '`unsaved: false // <reason>` is a declaration (the reason printed)', withReason.rows);
  const named = run(`export function showThing(g) {\n  const { body } = createModalShell({ id: 'x', unsaved: g });\n  body.append(t('Save'));\n}`);
  ok(named.bad.length === 1 && named.bad[0].decl === 'bad', '`unsaved: someName` (neither an object nor false) ⇒ RED', named.rows);
  const guarded = run(`export function showThing() {\n  const { body } = createModalShell({ id: 'x', unsaved: { save: () => true } });\n  body.append(t('Save'));\n}`);
  ok(guarded.bad.length === 0 && guarded.rows.length === 1 && guarded.rows[0].decl === 'object', 'a guarded Save dialog is GREEN', guarded.rows);
  const noSave = run(`export function showThing() {\n  const { body } = createModalShell({ id: 'x' });\n  body.append(t('Close'));\n}`);
  ok(noSave.rows.length === 0, 'a dialog with no Save is not counted');
  const opener = run(`export function showOther() {\n  const { body } = createModalShell({ id: 'y', unsaved: { save: () => true } });\n  body.append(t('Save'));\n}\nexport function showThing() {\n  const { body } = createModalShell({ id: 'x' });\n  body.append(t('Close'));\n  showOther();\n}`);
  ok(opener.rows.length === 1 && opener.rows[0].fn === 'showOther', 'a dialog that OPENS another Save dialog is not that dialog (the opener is not followed)', opener.rows);

  console.log('— ③ the shell routes the person\'s dismissals through the guard');
  const U = fs.readFileSync(path.join(REPO, 'src/lib/utils.js'), 'utf8');
  // lane dialog-yield r2: every Escape goes through the shell's ONE door (escDoor — the caller's onEscape first, then the guard /
  // the typed ask, PURE escapeVerdict), and the door's close is the guard's dismiss
  const PINS = [
    ['✕', 'closeBtn.onclick = () => dismiss();'],
    ['the backdrop', "if (e.target === overlay && (!fh || fh.mode() === 'sheet')) dismiss(); });"],
    ["the overlay's Escape", "if (e.key === 'Escape') { e.stopPropagation(); escDoor(e); } });"],
    ["a form's Escape", "if (escDoor(e) === 'none') return;"],
    ['the idle Escape', "e.preventDefault(); escDoor(e);"],
    ['the ONE door', "if (v === 'guard' || v === 'close') dismiss('escape');"],
  ];
  const pinned = (text) => PINS.filter(([, s]) => !text.includes(s)).map(([w]) => w);
  ok(pinned(U).length === 0, "✕, the backdrop and both Escapes call the guard's dismiss (never `close` straight)", pinned(U));
  const mut = U.replace('closeBtn.onclick = () => dismiss();', 'closeBtn.onclick = close;');
  ok(mut !== U && pinned(mut).includes('✕'), 'MUTANT ✕ straight to close ⇒ the pin is RED');
  ok(/unsaved = null, onEscape = null, opener = 'person', from = null, undismissable = false \} = \{\}, deferred = false\) \{/.test(U) && /function unsavedGuard\(/.test(U), 'createModalShell takes `unsaved` and owns the ONE guard (unsavedGuard)');

  console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
  process.exit(fail ? 1 : 0);
}
