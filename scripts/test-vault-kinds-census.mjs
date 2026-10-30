#!/usr/bin/env node
// THE VAULT KIND CENSUS (fast, in-process — lane vault-totp-add, 2026-10-26; the owner: 「你需要更系统化地方案管理代码中的各种细节，
// 这种不是应该有个统一的注册表之类的吗」, after 「我似乎不能添加两步验证在vault里」 — 两步验证 had a rail category, a row and a route,
// and no 添加… door). src/vault-kinds.js holds ONE row per kind family; this suite walks it and FAILS a family whose declared
// surface is absent in the tree:
//   ① THE REGISTRY'S SHAPE: every family declares all nine surfaces — in `surfaces` or in `deferred`, never both; a NONE
//      has its words; its category is the rail's; ids, doors and door orders unique; `stores` is a list of the inventory's
//      stores, or null WITH an entry shape; a deferred surface is { lane, backlog } — the lane's name (^[a-z][a-z0-9-]{2,}$)
//      or 'unscheduled', and its backlog id (B-xxxx), both required — printed below (⏳), never silently green
//   ② EACH SURFACE IN THE TREE: list (the store's source in the hub's wiring; a hub secret's sample is a row secretRowOf
//      makes) · row (the extras module, its exports, imported by the window) · add (registerVaultAdd({ id: '<door>' … }) in
//      the window's import closure — comments never count) · reveal (revealableOf agrees) · use + route (mounted:
//      app|router.<method>('<path>')) · delete (doorsOf's door for the sample, its route mounted; a { method, path } door asks
//      in the words of the family's `confirmKey` — doorsOf hands it on, the window's CONFIRM_WORDS words it; an { open } door
//      is one the window's 删除 opens; a { module } door asks its own confirm) · cli (the verb in that CLI's usage) · doc (a
//      docs/kb-features.md line names it)
//   ③ THE REVERSE: every door registered in the tree is a registry door; every store of the inventory is LISTED in some
//      family's `stores` (a stores-null family holds rows by their entry shape, never a store) and every head of the engine's
//      SECRET_RE (+ the agent namespace) is held by a family; every key of the window's CONFIRM_WORDS is a family's
//      confirmKey (no hand-keyed list); the inventory's purposes ARE the registry's categories and each family's sample lands
//      in its own family and category; every category is some family's; a category with no door says why in its families'
//      words (the invariant: a category the window counts has a door that adds to it — or the words why not)
//   ④ RED CONTROLS (in memory, nothing written): TODAY'S GAP — the window without the totp door's registration ⇒ RED naming
//      totp·add; a family missing a surface ⇒ RED; a door the registry does not name ⇒ RED; a SECRET_RE head nobody holds
//      ⇒ RED; a declared route unmounted ⇒ RED; and (acceptance r2) the registry without its `secrets` holders ⇒ RED naming
//      «secrets» (the stores-null family holds no store); stores null with no entry shape ⇒ RED; a deferral with a 2-char
//      lane, a free-text lane, no lane, no backlog id, a malformed one or the old string form ⇒ RED ('unscheduled' or a
//      lane's name WITH its backlog id ⇒ green, printed so); a { method, path } delete with no confirmKey, the window without
//      totp's confirm words, a confirm-words key no family names, a confirmKey on a door with its own dialog ⇒ RED
// THE TABLE (family × surface: ✓ present in the tree · ⚙ VibeSpace uses it itself · — not this kind's · ⏳ deferred · ✗ missing)
// is printed on every run, then the words of every — / ⚙ / ⏳ cell.
// Run: node scripts/test-vault-kinds-census.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const VK = require(path.join(REPO, 'src/vault-kinds.js'));
const VI = require(path.join(REPO, 'src/vault-inventory.js'));
const acorn = require('acorn');

let passed = 0, failed = 0;
const ok = (c, name, extra) => { if (c) { passed++; console.log(`  ✓ ${name}`); } else { failed++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1200) : ''}`); } };

// ── THE TREE, as files (an overlay = a mutated copy in memory) ──
const READ = new Map();   // the real tree, read once
const realRead = (rel) => { if (!READ.has(rel)) { let s = null; try { s = fs.readFileSync(path.join(REPO, rel), 'utf8'); } catch { } READ.set(rel, s); } return READ.get(rel); };
const walkJs = (rel) => { const out = []; const go = (r) => { let ents = []; try { ents = fs.readdirSync(path.join(REPO, r), { withFileTypes: true }); } catch { return; } for (const e of ents) { const p = `${r}/${e.name}`; if (e.isDirectory()) go(p); else if (e.name.endsWith('.js')) out.push(p); } }; go(rel); return out; };
const SERVER_FILES = [...walkJs('src').filter((f) => !f.startsWith('src/lib/')), 'server.js'];
const LIB_FILES = walkJs('src/lib');
const treeOf = (overlay = {}) => ({ read: (rel) => (Object.prototype.hasOwnProperty.call(overlay, rel) ? overlay[rel] : realRead(rel)),
  lib: [...new Set([...LIB_FILES, ...Object.keys(overlay).filter((k) => k.startsWith('src/lib/') && k.endsWith('.js'))])] });

const ROUTES_OF = new Map();   // a file's text → its mounted routes (an unchanged file is scanned once)
const routesOf = (s) => { if (!ROUTES_OF.has(s)) ROUTES_OF.set(s, [...s.matchAll(/\b(?:app|router)\.(get|post|put|delete|patch)\(\s*'([^']+)'/g)].map((m) => `${m[1].toUpperCase()} ${m[2]}`)); return ROUTES_OF.get(s); };
const CONFIRM_OF = new Map();   // the window's text → the keys of its CONFIRM_WORDS table (null: no such table) — parsed once per text
function confirmKeysOf(s) {
  if (!CONFIRM_OF.has(s)) {
    let keys = null;
    try {
      for (const n of acorn.parse(s, { ecmaVersion: 'latest', sourceType: 'module' }).body) {
        if (n.type !== 'VariableDeclaration') continue;
        for (const d of n.declarations) if (d.id.type === 'Identifier' && d.id.name === 'CONFIRM_WORDS' && d.init && d.init.type === 'ObjectExpression') keys = new Set(d.init.properties.filter((q) => q.type === 'Property').map((q) => (q.key.type === 'Identifier' ? q.key.name : String(q.key.value))));
      }
    } catch { keys = null; }
    CONFIRM_OF.set(s, keys);
  }
  return CONFIRM_OF.get(s);
}
/** The facts a census reads from a tree. */
function factsOf(tree) {
  const routes = new Set();
  for (const f of SERVER_FILES) for (const r of routesOf(tree.read(f) || '')) routes.add(r);
  // the window's import closure (src/lib, relative imports) — a door registered outside it never runs
  const closure = new Set(), todo = ['src/lib/vault-window.js'];
  while (todo.length) {
    const f = todo.pop();
    if (closure.has(f)) continue;
    const s = tree.read(f);
    if (s == null) continue;
    closure.add(f);
    for (const m of s.matchAll(/\bfrom\s+'(\.\.?\/[^']+\.js)'/g)) { const p = path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1])); if (p.startsWith('src/lib/')) todo.push(p); }
  }
  // the doors: registerVaultAdd({ id: '<door>' — read from TOKENS (a comment never registers anything)
  const doors = new Map();   // door → file
  for (const f of tree.lib) {
    const s = tree.read(f) || '';
    if (!s.includes('registerVaultAdd')) continue;
    const tk = [...acorn.tokenizer(s, { ecmaVersion: 'latest', sourceType: 'module' })];
    for (let i = 0; i + 5 < tk.length; i++) {
      if (tk[i].value !== 'registerVaultAdd' || tk[i + 1].type.label !== '(' || tk[i + 2].type.label !== '{' || tk[i + 3].value !== 'id' || tk[i + 4].type.label !== ':' || tk[i + 5].type.label !== 'string') continue;
      doors.set(tk[i + 5].value, f);
    }
  }
  const wiring = tree.read('src/server/mounts-plugins-wiring.js') || '';
  const srcBlock = (/const vaultSources = \{([\s\S]*?)\n\};/.exec(wiring) || [])[1] || '';
  const engine = tree.read('src/server/vault-engine.js') || '';
  const secretLit = (/^const SECRET_RE = (\/.+\/[a-z]*);/m.exec(engine) || [])[1] || null;
  const win = tree.read('src/lib/vault-window.js') || '';
  return { routes, closure, doors, srcBlock, secretLit, win, confirmKeys: confirmKeysOf(win), read: tree.read };
}

// ── THE CENSUS: families × the tree → cells + problems ──
const NONE_OK = (v) => v && typeof v === 'object' && typeof v.none === 'string' && v.none.trim().length >= 8;
const SYSTEM_OK = (v) => v && typeof v === 'object' && typeof v.system === 'string' && v.system.trim().length >= 8;
const LANE_RE = /^[a-z][a-z0-9-]{2,}$/, BACKLOG_RE = /^B-[0-9a-f]{4}$/, DEFER_KEYS = ['lane', 'backlog', 'why'];
/** A deferral → { words } (printed: «lane <name> · B-xxxx» or «unscheduled · B-xxxx») | { bad } (what it lacks, in words).
 *  Acceptance r2: BOTH named — a lane's name or 'unscheduled', and its backlog id; a string names neither. */
function deferralOf(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return { bad: 'a deferral is { lane, backlog } — a lane\'s name or \'unscheduled\', and its backlog id (B-xxxx)' };
  const extra = Object.keys(d).filter((k) => !DEFER_KEYS.includes(k));
  if (extra.length) return { bad: `«${extra.join(', ')}» is no deferral field (lane · backlog · why)` };
  if (typeof d.lane !== 'string' || !d.lane) return { bad: 'it names no lane (a lane\'s name, or \'unscheduled\')' };
  if (!LANE_RE.test(d.lane)) return { bad: `the lane «${d.lane}» is not a lane's name (^[a-z][a-z0-9-]{2,}$) or 'unscheduled'` };
  if (typeof d.backlog !== 'string' || !d.backlog) return { bad: 'it names no backlog id (B-xxxx)' };
  if (!BACKLOG_RE.test(d.backlog)) return { bad: `«${d.backlog}» is no backlog id (B-xxxx)` };
  if (d.why !== undefined && (typeof d.why !== 'string' || d.why.trim().length < 8)) return { bad: 'its why has no words' };
  return { words: `${d.lane === 'unscheduled' ? 'unscheduled' : `lane ${d.lane}`} · ${d.backlog}${d.why ? ` — ${d.why}` : ''}` };
}
const routeParts = (r) => { const m = /^(GET|POST|PUT|DELETE|PATCH) (\/\S+)$/.exec(String(r || '')); return m ? { method: m[1], path: m[2] } : null; };
function census(families, facts) {
  const cells = new Map(), problems = [], words = [];
  const cell = (f, s, mark, note) => { if (!cells.has(f.id)) cells.set(f.id, {}); cells.get(f.id)[s] = { mark, note }; if (mark === '✗') problems.push(`${f.id}·${s}: ${note}`); else if (note) words.push(`${f.id}·${s} ${mark} ${note}`); };
  const mounted = (r) => facts.routes.has(r);
  const ids = new Set(), doorIds = new Map(), orders = new Map();
  for (const f of families) {
    if (ids.has(f.id)) problems.push(`${f.id}: two families of one id`); ids.add(f.id);
    if (!VK.CATEGORY_IDS.includes(f.category)) problems.push(`${f.id}: category «${f.category}» is not the rail's`);
    if (f.stores === null) { if (!(f.entryRe instanceof RegExp)) problems.push(`${f.id}: stores null (a row of any store) with no entry shape — it would hold every row of every store`); }
    else if (!Array.isArray(f.stores) || !f.stores.length) problems.push(`${f.id}: stores is a list of the inventory's stores, or null with an entry shape`);
    const del = f.surfaces && f.surfaces.delete;
    if (f.confirmKey !== undefined && !(del && typeof del.method === 'string')) problems.push(`${f.id}: confirmKey «${f.confirmKey}» on a family whose 删除 is not the window's confirm door ({ method, path })`);
    const store0 = (f.stores && f.stores[0]) || 'secrets';
    const sur = f.surfaces || {}, def = f.deferred || {};
    for (const k of [...Object.keys(sur), ...Object.keys(def)]) if (!VK.SURFACES.includes(k)) problems.push(`${f.id}: «${k}» is no surface`);
    for (const s of VK.SURFACES) {
      const inS = Object.prototype.hasOwnProperty.call(sur, s), inD = Object.prototype.hasOwnProperty.call(def, s);
      if (inS && inD) { cell(f, s, '✗', 'declared AND deferred'); continue; }
      if (!inS && !inD) { cell(f, s, '✗', 'not declared (every family declares all nine surfaces, or defers one with its lane and backlog id)'); continue; }
      if (inD) { const d = deferralOf(def[s]); if (d.words) cell(f, s, '⏳', d.words); else cell(f, s, '✗', `deferred ${JSON.stringify(def[s])}: ${d.bad}`); continue; }
      const v = sur[s];
      if (v && typeof v === 'object' && 'none' in v) { if (NONE_OK(v)) cell(f, s, '—', v.none); else cell(f, s, '✗', 'NONE without its words'); continue; }
      if (s === 'use' && v && typeof v === 'object' && 'system' in v) { if (SYSTEM_OK(v)) cell(f, s, '⚙', v.system); else cell(f, s, '✗', 'system without its words'); continue; }
      try {
        const bad = CHECK[s](f, v, { facts, store0, mounted });
        cell(f, s, bad ? '✗' : '✓', bad || '');
      } catch (e) { cell(f, s, '✗', `the check threw: ${e.message}`); }
    }
    const add = sur.add;
    if (add && typeof add.door === 'string') {
      if (doorIds.has(add.door)) problems.push(`door «${add.door}» declared by ${doorIds.get(add.door)} and ${f.id}`); doorIds.set(add.door, f.id);
      if (orders.has(add.order)) problems.push(`door order ${add.order} declared twice (${orders.get(add.order)}, ${f.id})`); orders.set(add.order, f.id);
    }
  }
  // ③ the reverse
  for (const [door, file] of facts.doors) if (!doorIds.has(door)) problems.push(`registerVaultAdd «${door}» (${file}) is no registry door — the window refuses it; declare it on its family`);
  // a store is held by a family that LISTS it — a stores-null family holds rows by their entry shape, never a store (r2: the
  // old `f.stores === null ||` made this leg unable to fire)
  for (const store of VI.GROUP_IDS) if (!families.some((f) => Array.isArray(f.stores) && f.stores.includes(store))) problems.push(`the inventory's store «${store}» is held by no family (no family lists it in its stores)`);
  const keys = new Set(families.map((f) => f.confirmKey).filter((k) => typeof k === 'string'));
  if (facts.confirmKeys) for (const k of facts.confirmKeys) if (!keys.has(k)) problems.push(`the window's confirm words «${k}» are no family's confirmKey (src/lib/vault-window.js CONFIRM_WORDS is keyed by the registry — no hand-keyed list)`);
  const heads = [];
  if (facts.secretLit) {
    const src = new Function(`return ${facts.secretLit}`)().source;
    const alt = /^\^\(\?:([a-z|-]+)\):/.exec(src);
    if (alt) heads.push(...alt[1].split('|'));
    for (const m of src.matchAll(/\|\^([a-z-]+):/g)) heads.push(m[1]);
    if (!heads.length) problems.push('the engine\'s SECRET_RE: no head read (its shape changed — teach this census)');
  } else problems.push('the engine\'s SECRET_RE was not found (src/server/vault-engine.js `const SECRET_RE = /…/;`)');
  for (const h of [...heads, 'agent']) {
    const sample = h === 'agent' ? 'agent:conv-census/x' : `${h}:census`;
    const held = families.find((f) => (f.stores === null || f.stores.includes('secrets')) && (!f.entryRe || f.entryRe.test(sample)));
    if (!held || held.entryRe === null) problems.push(`the hub secret «${h}:» is held by no family of its own (a new SECRET_RE kind is a registry row first)`);
  }
  const used = new Set(families.map((f) => f.category));
  for (const c of VK.CATEGORY_IDS) if (!used.has(c)) problems.push(`the rail's category «${c}» is no family's — nothing can land in it`);
  const doorless = [];
  for (const c of VK.CATEGORY_IDS) {
    const fs_ = families.filter((f) => f.category === c);
    if (!fs_.length) continue;
    const door = fs_.find((f) => f.surfaces && f.surfaces.add && typeof f.surfaces.add.door === 'string');
    if (door) continue;
    const why = fs_.map((f) => { const dw = f.deferred && f.deferred.add !== undefined ? deferralOf(f.deferred.add).words : null; return dw ? `${f.id}: ⏳ ${dw}` : NONE_OK(f.surfaces && f.surfaces.add) ? `${f.id}: ${f.surfaces.add.none}` : null; });
    if (why.some((w) => w === null)) problems.push(`the category «${c}» has no door and a family that does not say why`); else doorless.push(`${c} — ${why.join(' · ')}`);
  }
  return { cells, problems, words, heads, doorless };
}

// the per-surface checks: → null (present) | the words of what is missing
const CHECK = {
  list(f, v, { facts, store0 }) {
    if (v !== true) return 'list is `true` (the inventory lists it) or NONE(why)';
    for (const st of f.stores || ['secrets']) if (!new RegExp(`(?:^|[\\s,{])'?${st.replace(/[-]/g, '\\-')}'?\\s*:`).test(facts.srcBlock)) return `the hub's wiring lists no source for the store «${st}» (src/server/mounts-plugins-wiring.js vaultSources)`;
    if (f.stores === null || f.stores.every((s) => s === 'secrets')) { const r = VI.secretRowOf({ name: f.sample, at: 1 }); if (!r) return `secretRowOf makes no row of the sample «${f.sample}» (src/vault-inventory.js SECRET_ROWS)`; }
    else if (!VI.rowOf(store0, { entry: f.sample, field: 'census', label: 'census' })) return `rowOf refuses the sample «${f.sample}» in «${store0}»`;
    return null;
  },
  row(f, v, { facts }) {
    if (v === 'base') return null;
    if (!v || typeof v.module !== 'string' || !Array.isArray(v.exports) || !v.exports.length) return 'row is \'base\' or { module, exports }';
    const src = facts.read(v.module);
    if (src == null) return `the row extras module ${v.module} is not in the tree`;
    const win = facts.read('src/lib/vault-window.js') || '';
    const base = path.posix.basename(v.module);
    const imp = [...win.matchAll(new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*'\\./${base.replace(/\./g, '\\.')}'`, 'g'))].map((m) => m[1]).join(',');
    for (const name of v.exports) {
      if (!new RegExp(`\\bexport\\s+(?:async\\s+)?(?:function|const|let)\\s+${name}\\b`).test(src)) return `${v.module} exports no ${name}`;
      if (!new RegExp(`\\b${name}\\b`).test(imp)) return `the window (src/lib/vault-window.js) does not import ${name} from ./${base}`;
    }
    return null;
  },
  add(f, v, { facts }) {
    if (!v || typeof v.door !== 'string' || !Number.isFinite(v.order)) return 'add is { door, order } or NONE(why)';
    const file = facts.doors.get(v.door);
    if (!file) return `the 添加… door «${v.door}» is not registered (registerVaultAdd({ id: '${v.door}', … }) in src/lib — the window's menu has no door for this kind)`;
    if (!facts.closure.has(file)) return `the door «${v.door}» is registered in ${file}, which the window never imports — it never runs`;
    if (VK.addOrderOf(v.door) !== v.order) return `addOrderOf('${v.door}') is not ${v.order}`;
    return null;
  },
  reveal(f, v, { store0 }) {
    if (typeof v !== 'boolean') return 'reveal is true | false';
    return VI.revealableOf(store0, f.sample) === v ? null : `revealableOf(${store0}, ${f.sample}) says ${!v} — the registry says ${v}`;
  },
  use(f, v, { mounted }) {
    if (!v || typeof v.route !== 'string' || (v.also !== undefined && !(Array.isArray(v.also) && v.also.every((r) => typeof r === 'string')))) return 'use is { route, also? } (an agent\'s door, and the other doors that use it), { system } (VibeSpace uses it itself) or NONE(why)';
    const gone = [v.route, ...(v.also || [])].find((r) => !mounted(r));   // lane vault-job-road: every door that uses it is mounted
    return gone ? `the agent's door «${gone}» is not mounted` : null;
  },
  delete(f, v, { store0, mounted, facts }) {
    const d = VI.doorsOf({ store: store0, entry: f.sample, field: 'census' }).delete;
    if (v && typeof v.open === 'string') {
      if (!d || d.open !== v.open) return `doorsOf gives the sample no «${v.open}» delete door`;
      return facts.win.includes(`d.open === '${v.open}'`) ? null : `the window's 删除 never opens «${v.open}» (src/lib/vault-window.js doDelete — its own dialog asks)`;
    }
    if (v && typeof v.module === 'string' && typeof v.route === 'string') {
      const r = routeParts(v.route), src = facts.read(v.module);
      if (!r || !mounted(v.route)) return `the delete route «${v.route}» is not mounted`;
      const head = r.path.split('/:')[0], tail = r.path.slice(r.path.lastIndexOf('/'));
      if (src == null || !src.includes(head) || !src.includes(tail)) return `${v.module} names no «${head}…${tail}» (its delete door)`;
      return /\bshowConfirmDialog\(/.test(src) ? null : `${v.module} asks no confirm before its delete (showConfirmDialog, in its own words)`;
    }
    if (!v || typeof v.method !== 'string' || typeof v.path !== 'string') return 'delete is { method, path }, { open }, { module, route } or NONE(why)';
    if (!d || d.method !== v.method || !String(d.path || '').startsWith(v.path)) return `doorsOf gives the sample no ${v.method} ${v.path}… delete door (it gives ${JSON.stringify(d)})`;
    // its words (acceptance r2): the family's confirmKey, handed on by doorsOf, worded by the window's CONFIRM_WORDS
    if (typeof f.confirmKey !== 'string' || !f.confirmKey) return 'a { method, path } delete names no confirmKey (the words its confirm asks with — src/lib/vault-window.js CONFIRM_WORDS)';
    if (d.confirm !== f.confirmKey) return `doorsOf hands the sample's delete the confirm «${d.confirm}» — the registry's confirmKey is «${f.confirmKey}»`;
    if (!facts.confirmKeys) return 'the window has no CONFIRM_WORDS table (src/lib/vault-window.js `const CONFIRM_WORDS = { … }`)';
    if (!facts.confirmKeys.has(f.confirmKey)) return `the window has no confirm words for «${f.confirmKey}» (CONFIRM_WORDS) — its 删除 would ask in no words of its own`;
    return [...facts.routes].some((x) => x.startsWith(`${v.method} ${v.path}`)) ? null : `no route ${v.method} ${v.path}… is mounted`;
  },
  cli(f, v, { facts }) {
    if (!v || typeof v.bin !== 'string' || !Array.isArray(v.verbs) || !v.verbs.length) return 'cli is { bin, verbs } or NONE(why)';
    const usage = facts.read(`data/bin/${v.bin}`);
    if (usage == null) return `data/bin/${v.bin} is not in the tree`;
    const missing = v.verbs.filter((verb) => !new RegExp(`\\b${v.bin} ${verb}\\b`).test(usage));
    return missing.length ? `${v.bin}'s usage names no «${missing.join(', ')}»` : null;
  },
  route(f, v, { mounted }) {
    if (!Array.isArray(v) || !v.length) return 'route is [\'METHOD /path\', …] or NONE(why)';
    const bad = v.filter((r) => !routeParts(r) || !mounted(r));
    return bad.length ? `not mounted: ${bad.join(', ')}` : null;
  },
  doc(f, v, { facts }) {
    if (typeof v !== 'string' || v.length < 8) return 'doc is the words of its docs/kb-features.md line';
    return (facts.read('docs/kb-features.md') || '').includes(v) ? null : `docs/kb-features.md has no line naming «${v}»`;
  },
};

function printTable(families, res) {
  const W0 = Math.max(...families.map((f) => f.id.length)) + 1;
  console.log('    ' + 'family'.padEnd(W0) + 'category'.padEnd(14) + VK.SURFACES.map((s) => s.padEnd(7)).join(''));
  for (const f of families) {
    const c = res.cells.get(f.id) || {};
    console.log('    ' + f.id.padEnd(W0) + f.category.padEnd(14) + VK.SURFACES.map((s) => (c[s] ? c[s].mark : '?').padEnd(7)).join(''));
  }
  console.log('    ✓ present in the tree · ⚙ VibeSpace uses it itself · — not this kind\'s · ⏳ deferred (lane <name> | unscheduled · its backlog id) · ✗ missing');
  for (const w of res.words) console.log(`      ${w}`);
  for (const d of res.doorless) console.log(`    category with no 添加… door: ${d}`);
  const deferred = res.words.filter((w) => w.includes(' ⏳ '));
  const unsched = deferred.filter((w) => w.includes(' ⏳ unscheduled · ')).length;
  console.log(`    deferred surfaces: ${deferred.length ? `${deferred.length} (${unsched} unscheduled — no lane holds it yet)` : 'none'}`);
}

console.log('① + ② + ③ THE REGISTRY OVER THIS TREE (src/vault-kinds.js — every surface a family declares, present)');
const real = factsOf(treeOf());
const R = census(VK.FAMILIES, real);
printTable(VK.FAMILIES, R);
ok(VK.FAMILIES.length >= 15 && new Set(VK.FAMILY_IDS).size === VK.FAMILIES.length, `${VK.FAMILIES.length} kind families, ids unique`);
ok(R.problems.length === 0, 'every family\'s declared surfaces are in the tree, and nothing in the tree is outside the registry', R.problems);
ok(real.doors.size >= 7 && [...real.doors.keys()].every((d) => VK.addOrderOf(d) != null), `the 添加… doors registered in the window (${[...real.doors.keys()].join(', ')}) are the registry's`, [...real.doors]);
ok(VK.ADD_DOORS.map((d) => d.door).join() === 'account,integration,channel,totp,automation,web-login,secret' && VK.ADD_DOORS.every((d, i, a) => !i || a[i - 1].order < d.order),
  '添加…\'s order is the registry\'s: Account… · Integration key… · Channel account… · Two-step code… · Automation key… · Website login… · Other key or password…', VK.ADD_DOORS);
ok(R.cells.get('totp') && R.cells.get('totp').add.mark === '✓', 'TOTP\'s add surface: the 两步验证… door is registered (the gap the owner found is closed)', R.cells.get('totp'));
ok(R.heads.join() === 'host,frp,file,apikey,totp,secret,web-login', `the engine's SECRET_RE heads read: ${R.heads.join(', ')} (+ the agent namespace) — each held by a family`, R.heads);
ok(VI.PURPOSES === VK.CATEGORIES && VI.PURPOSE_IDS.join() === VK.CATEGORY_IDS.join(), 'the inventory\'s purposes ARE the registry\'s categories (one list — the rail reads it)');
{
  const off = VK.FAMILIES.filter((f) => { const st = (f.stores && f.stores[0]) || 'secrets'; const fam = VK.familyOf(st, f.sample); return !fam || fam.id !== f.id || VI.purposeOf({ store: st, entry: f.sample }) !== f.category || VK.categoryOf(st, f.sample) !== f.category; });
  ok(!off.length, 'each family\'s sample is held by its OWN family (the matching order is sound) and lands in its category through the inventory\'s purposeOf', off.map((f) => f.id));
}
ok(VK.categoryOf('secrets', 'weird:x') === 'other' && VK.familyOf('secrets', 'weird:x') === null && VK.categoryOf('accounts', 'agent:x') === 'agents' && VK.categoryOf('integrations', 'llm/h1') === 'machines' && VK.categoryOf('integrations', 'llm') === 'integrations',
  'matching order: an agent: entry first whatever its store; an integration\'s per-machine row → machines; a hub secret no family holds → other');
ok(R.doorless.length >= 1 && R.doorless.every((d) => / — /.test(d)), 'every category with no 添加… door says why, in its families\' words (printed above)', R.doorless);
{
  const a = R.cells.get('agent-secret');
  ok(a && a.delete.mark === '⏳' && R.words.includes('agent-secret·delete ⏳ unscheduled · B-3fb5 — design q-047 §3.3 lists 删除 for an agent\'s entry; no route drops one yet'),
    'the one deferral today: agent-secret · delete — PRINTED as unscheduled, with its backlog id B-3fb5 (no lane holds it yet)', R.words.filter((w) => w.includes('⏳')));
  const fams = [...new Set(VK.FAMILIES.map((f) => f.confirmKey).filter(Boolean))].sort().join();
  ok(real.confirmKeys && [...real.confirmKeys].sort().join() === fams && VK.FAMILIES.every((f) => !(f.surfaces.delete && typeof f.surfaces.delete.method === 'string') || typeof f.confirmKey === 'string'),
    `删除's confirm words: every { method, path } delete names its confirmKey, and the window words exactly those keys (${fams})`, { window: real.confirmKeys && [...real.confirmKeys], registry: fams });
  ok(VK.confirmKeyOf('accounts', 'a1') === 'account' && VI.doorsOf({ store: 'accounts', entry: 'a1', field: 'oat' }).delete.confirm === 'account' && VI.doorsOf({ store: 'secrets', entry: 'totp:x', field: 'seed' }).delete.confirm === 'totp' && VK.confirmKeyOf('secrets', 'host:h') === null,
    'doorsOf\'s confirm IS the registry\'s: an account and its long-lived token «account» (the window words the token by its field), a two-step code «totp», a machine\'s link none');
}

console.log('④ RED CONTROLS (in memory)');
{
  // TODAY'S GAP REPRODUCED: the registry declares totp's add door, the window does not register it (the base tree's state)
  const win = realRead('src/lib/vault-window.js');
  const line = win.split('\n').find((l) => /^registerVaultAdd\(\{ id: 'totp',/.test(l));
  const gap = census(VK.FAMILIES, factsOf(treeOf({ 'src/lib/vault-window.js': win.replace(`${line}\n`, '') })));
  ok(line && gap.problems.length === 1 && /^totp·add: the 添加… door «totp» is not registered/.test(gap.problems[0]) && gap.cells.get('totp').add.mark === '✗', 'TODAY\'S GAP — the window without the two-step door\'s registration ⇒ RED, naming totp·add (and only it)', gap.problems);
  // a door outside the closure never runs
  const lost = census(VK.FAMILIES, factsOf(treeOf({ 'src/lib/vault-window.js': win.replace(`${line}\n`, ''), 'src/lib/vault-lost-door.js': `${line}\n` })));
  ok(lost.problems.some((p) => /^totp·add: .*never imports/.test(p)), 'a door registered in a module the window never imports ⇒ RED (it never runs)', lost.problems);
  // a door the registry does not name
  const stray = census(VK.FAMILIES, factsOf(treeOf({ 'src/lib/vault-window.js': `${win}\nregisterVaultAdd({ id: 'qr-scan', label: () => 'x', run: () => {} });\n` })));
  ok(stray.problems.length === 1 && /«qr-scan».*no registry door/.test(stray.problems[0]), 'a 添加… door the registry does not name ⇒ RED', stray.problems);
  // a comment never registers a door
  const commented = census(VK.FAMILIES, factsOf(treeOf({ 'src/lib/vault-window.js': win.replace(`${line}\n`, `// ${line}\n`) })));
  ok(commented.problems.some((p) => /^totp·add:/.test(p)), 'the registration in a COMMENT counts as none (the census reads tokens)', commented.problems);
  // the registry's own shape
  const totp = VK.FAMILIES.find((f) => f.id === 'totp');
  const swap = (fam) => VK.FAMILIES.map((f) => (f.id === 'totp' ? fam : f));
  const { add, ...noAdd } = totp.surfaces;
  const baseTree = factsOf(treeOf({ 'src/lib/vault-window.js': win.replace(`${line}\n`, '') }));   // the base's window: no two-step door
  // a deferral names its lane AND its backlog id (acceptance r2: the shipped one said «no lane yet» and passed)
  const deferAs = (d) => census(swap({ ...totp, surfaces: noAdd, deferred: { add: d } }), baseTree);
  for (const [d, re, what] of [
    [{ lane: 'vt', backlog: 'B-0001' }, /the lane «vt» is not a lane's name/, 'a 2-char lane («vt»)'],
    [{ lane: 'no lane yet', backlog: 'B-0001' }, /the lane «no lane yet» is not a lane's name/, 'a free-text lane («no lane yet»)'],
    [{ backlog: 'B-0001' }, /names no lane/, 'no lane'],
    [{ lane: 'vault-totp-add' }, /names no backlog id/, 'no backlog id'],
    [{ lane: 'vault-totp-add', backlog: 'B-1' }, /«B-1» is no backlog id/, 'a malformed backlog id'],
    ['vault-totp-add · B-0001', /a deferral is \{ lane, backlog \}/, 'the old string form'],
  ]) {
    const r = deferAs(d);
    ok(r.cells.get('totp').add.mark === '✗' && r.problems.some((q) => q.startsWith('totp·add: deferred ') && re.test(q)), `a deferral with ${what} ⇒ RED (never silently green)`, r.problems);
  }
  const unsched = deferAs({ lane: 'unscheduled', backlog: 'B-0001' });
  ok(unsched.problems.length === 0 && unsched.cells.get('totp').add.mark === '⏳' && unsched.words.includes('totp·add ⏳ unscheduled · B-0001'), '\'unscheduled\' WITH its backlog id ⇒ green, PRINTED as unscheduled', { problems: unsched.problems, words: unsched.words.filter((w) => w.startsWith('totp')) });
  const defOk = deferAs({ lane: 'vault-totp-add', backlog: 'B-0001' });
  ok(defOk.problems.length === 0 && defOk.cells.get('totp').add.mark === '⏳' && defOk.words.includes('totp·add ⏳ lane vault-totp-add · B-0001') && defOk.doorless.some((d) => /^two-step — totp: ⏳ lane vault-totp-add · B-0001$/.test(d)),
    'the base\'s window with the add door DEFERRED to a named lane + its backlog id ⇒ green, PRINTED as ⏳ with both — and the category says it has no door yet', { problems: defOk.problems, words: defOk.words.filter((w) => w.startsWith('totp')), doorless: defOk.doorless });
  const both = census(swap({ ...totp, deferred: { add: { lane: 'vault-totp-add', backlog: 'B-0001' } } }), real);
  ok(both.problems.some((p) => /^totp·add: declared AND deferred/.test(p)), 'a surface declared AND deferred ⇒ RED', both.problems);
  const { doc, ...noDoc } = totp.surfaces;
  const missing = census(swap({ ...totp, surfaces: noDoc }), real);
  ok(missing.problems.some((p) => /^totp·doc: not declared/.test(p)), 'a family that leaves a surface undeclared ⇒ RED', missing.problems);
  const mute = census(swap({ ...totp, surfaces: { ...totp.surfaces, cli: { none: '' } } }), real);
  ok(mute.problems.some((p) => /^totp·cli: NONE without its words/.test(p)), 'a NONE without its words ⇒ RED', mute.problems);
  const noCat = census(swap({ ...totp, category: 'nowhere' }), real);
  ok(noCat.problems.some((p) => /totp: category «nowhere» is not the rail's/.test(p)) && noCat.problems.some((p) => /«two-step» is no family's/.test(p)), 'a family on a category the rail has not ⇒ RED (and the rail\'s category nothing lands in ⇒ RED)', noCat.problems);
  // the tree's other surfaces
  const routes = realRead('src/routes/vault.js');
  const unmounted = census(VK.FAMILIES, factsOf(treeOf({ 'src/routes/vault.js': routes.replace("app.post('/api/vault/totp',", "app.post('/api/vault/totp-gone',") })));
  ok(unmounted.problems.length === 1 && /^totp·route: not mounted: POST \/api\/vault\/totp$/.test(unmounted.problems[0]), 'a declared person route that is not mounted ⇒ RED', unmounted.problems);
  const rowLess = census(VK.FAMILIES, factsOf(treeOf({ 'src/lib/vault-window.js': win.replace('import { loadTotp, totpExtras, showTotpAddDialog }', 'import { loadTotp, showTotpAddDialog }') })));
  ok(rowLess.problems.some((p) => /^totp·row: the window .* does not import totpExtras/.test(p)), 'the row extras not imported by the window ⇒ RED', rowLess.problems);
  const cliLess = census(VK.FAMILIES, factsOf(treeOf({ 'data/bin/vibespace-vault': realRead('data/bin/vibespace-vault').replace(/vibespace-vault totp/g, 'vibespace-vault code') })));
  ok(cliLess.problems.length === 1 && /^totp·cli: vibespace-vault's usage names no «totp»/.test(cliLess.problems[0]), 'a CLI verb gone from the usage ⇒ RED', cliLess.problems);
  const docLess = census(VK.FAMILIES, factsOf(treeOf({ 'docs/kb-features.md': realRead('docs/kb-features.md').split('**Two-step codes (TOTP)**').join('**Codes**') })));
  ok(docLess.problems.length === 1 && /^totp·doc:/.test(docLess.problems[0]), 'no kb-features line naming the kind ⇒ RED', docLess.problems);
  const eng = realRead('src/server/vault-engine.js');
  const newHead = census(VK.FAMILIES, factsOf(treeOf({ 'src/server/vault-engine.js': eng.replace('(?:host|frp|file|apikey|totp|secret):', '(?:host|frp|file|apikey|totp|secret|vapid):') })));
  ok(newHead.problems.length === 1 && /«vapid:» is held by no family/.test(newHead.problems[0]), 'a SECRET_RE head nobody holds (a new hub secret kind with no registry row) ⇒ RED', newHead.problems);
  const sourceLess = census(VK.FAMILIES, factsOf(treeOf({ 'src/server/mounts-plugins-wiring.js': realRead('src/server/mounts-plugins-wiring.js').replace("  passkeys: () =>", '  passkeysGone: () =>') })));
  ok(sourceLess.problems.length === 1 && /^passkey·list: the hub's wiring lists no source for the store «passkeys»/.test(sourceLess.problems[0]), 'a store with no source in the wiring ⇒ RED on its family\'s list surface', sourceLess.problems);
  // ③'s store leg can fire (acceptance r2 — `stores === null ||` held every store): the registry without its `secrets` holders
  const noSecrets = VK.FAMILIES.map((f) => (Array.isArray(f.stores) && f.stores.includes('secrets') ? { ...f, stores: f.stores.filter((x) => x !== 'secrets') } : f)).filter((f) => f.stores === null || f.stores.length);
  const unheld = census(noSecrets, real);
  ok(noSecrets.some((f) => f.stores === null) && unheld.problems.includes('the inventory\'s store «secrets» is held by no family (no family lists it in its stores)'), 'the registry without its `secrets` holders ⇒ RED naming «secrets» — the stores-null family (agent-secret) holds no store', unheld.problems.filter((q) => /store/.test(q)));
  const agent = VK.FAMILIES.find((f) => f.id === 'agent-secret');
  const anyRow = census(VK.FAMILIES.map((f) => (f.id === 'agent-secret' ? { ...agent, entryRe: null } : f)), real);
  ok(anyRow.problems.some((q) => /^agent-secret: stores null .* no entry shape/.test(q)), 'stores null with no entry shape (it would hold every row of every store) ⇒ RED', anyRow.problems);
  // 删除's words come from the registry (acceptance r2)
  const { confirmKey, ...keyless } = totp;
  const noKey = census(swap(keyless), real);
  ok(confirmKey === 'totp' && noKey.problems.some((q) => /^totp·delete: a \{ method, path \} delete names no confirmKey/.test(q)) && noKey.problems.some((q) => /confirm words «totp» are no family's confirmKey/.test(q)),
    'a { method, path } delete with no confirmKey ⇒ RED (and the window\'s words for it are then a key no family names ⇒ RED)', noKey.problems);
  const wordLine = win.split('\n').find((l) => l.startsWith("  totp: (row) => ({ title: t('Delete the two-step code"));
  const wordless = census(VK.FAMILIES, factsOf(treeOf({ 'src/lib/vault-window.js': win.replace(`${wordLine}\n`, '') })));
  ok(!!wordLine && wordless.problems.length === 1 && /^totp·delete: the window has no confirm words for «totp»/.test(wordless.problems[0]), 'the window without totp\'s confirm words ⇒ RED naming totp·delete (and only it)', wordless.problems);
  const strayWords = census(VK.FAMILIES, factsOf(treeOf({ 'src/lib/vault-window.js': win.replace('const CONFIRM_WORDS = {\n', 'const CONFIRM_WORDS = {\n  oat: () => ({ title: \'x\', message: \'x\', confirm: \'x\' }),\n') })));
  ok(strayWords.problems.length === 1 && /confirm words «oat» are no family's confirmKey/.test(strayWords.problems[0]), 'a hand-keyed confirm-words entry no family names (the old per-field «oat») ⇒ RED', strayWords.problems);
  const chan = VK.FAMILIES.find((f) => f.id === 'channel');
  const offKey = census(VK.FAMILIES.map((f) => (f.id === 'channel' ? { ...chan, confirmKey: 'channel' } : f)), real);
  ok(offKey.problems.some((q) => /^channel: confirmKey «channel» on a family whose 删除 is not the window's confirm door/.test(q)), 'a confirmKey on a family whose 删除 is its own dialog (a channel account) ⇒ RED', offKey.problems);
}

console.log(failed ? `\n${failed} FAILED, ${passed} passed` : `\nALL PASS (${passed})`);
process.exit(failed ? 1 : 0);
