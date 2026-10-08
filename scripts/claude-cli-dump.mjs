// CLAUDE CLI DUMP — the binary oracle's two extractors (moved here verbatim from test-record-shape.mjs,
// lane cli-2-1-288-records, B-e05e) and the dump that pins one CLI build as a TRACKED fixture.
//   node scripts/claude-cli-dump.mjs <claude binary>   → JSON on stdout (scripts/fixtures/claude-cli/<version>.json)
// METHOD (the same read §4 makes on the installed binary): `strings -n 8 <binary>` (latin1), then
// extractZodUnion (the SDK record union: shape → depth-1 keys, helper names read off the anchor) and
// extractPermissionSentences (the §4d tool_result census). The dump adds `zod` — the raw object literal of
// every subtype NEW against the previous dump (the evidence each declaration in src/record-shape.js cites).
// PURE functions + one CLI entry; the test imports the functions, never runs the entry.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// ── THE EXTRACTOR (§4a, §4) ──
// The SDK record union in the installed binary is a run of zod object literals
// `<obj>({type:<lit>("…")[,subtype:<lit>("…")]…})`. The minifier RENAMES the helpers between builds —
// 2.1.274 … 2.1.280 spelled them `u(` / `R(`, 2.1.281 spells the object helper `d(` (2026-09-23: the
// literal extractor found `union 0 shapes` and five §4 legs went red the moment the CLI auto-updated).
// So the helper names are never written here: they are READ off an ANCHOR — the system/compact_boundary
// object (else init / task_started), which exists only in that union — and every object literal spelled
// with the anchor's pair is walked (string literals skipped, the depth-1 keys collected). The guard in
// front of the helper keeps a method call that merely ENDS in the helper's letter out: 2.1.281's MCP
// content blocks carry `QVt.extend({type:R("resource_link")})`, which a bare `d(` matched. No anchor ⇒
// an ERROR NAMING THE ANCHOR, never a silent 0 / 0 / 0.
const UNION_ANCHORS = ['compact_boundary', 'init', 'task_started'];
const HELPER = '[A-Za-z_$][A-Za-z0-9_$]*(?:\\.[A-Za-z_$][A-Za-z0-9_$]*)*';
const NOT_AFTER_IDENT = '(?<![A-Za-z0-9_$.])';
const reEsc = (s) => s.replace(/[$.]/g, '\\$&');
export function extractZodUnion(text) {
  const pairs = new Map();
  for (const a of UNION_ANCHORS) {
    const re = new RegExp(NOT_AFTER_IDENT + '(' + HELPER + ')\\(\\{type:(' + HELPER + ')\\("system"\\),subtype:\\2\\("' + a + '"\\)', 'g');
    let m;
    while ((m = re.exec(text))) { const k = m[1] + ' ' + m[2]; if (!pairs.has(k)) pairs.set(k, { obj: m[1], lit: m[2], anchor: 'system/' + a }); }
  }
  if (!pairs.size) return { union: {}, helpers: [], error: 'NO ANCHOR: none of ' + UNION_ANCHORS.map((a) => '<obj>({type:<lit>("system"),subtype:<lit>("' + a + '")').join(' · ') + ' is in the bundle — the union\'s spelling changed again: read the binary around "compact_boundary" and teach extractZodUnion the new form' };
  const walkTo = (i) => { let depth = 0; for (let j = i; j < text.length && j < i + 40000; j++) { const c = text[j]; if (c === '"' || c === "'" || c === '`') { const q = c; j++; while (j < text.length && text[j] !== q) { if (text[j] === '\\') j++; j++; } continue; } if (c === '(' || c === '{' || c === '[') depth++; else if (c === ')' || c === '}' || c === ']') { depth--; if (depth === 0) return j; } } return -1; };
  const union = {};
  for (const { obj, lit } of pairs.values()) {
    const re = new RegExp(NOT_AFTER_IDENT + reEsc(obj) + '\\(\\{type:' + reEsc(lit) + '\\("([a-z_]+)"\\)(?:,subtype:' + reEsc(lit) + '\\("([a-z_]+)"\\))?', 'g');
    let m;
    while ((m = re.exec(text))) {
      const key = m[1] + (m[2] ? '/' + m[2] : '');
      if (union[key]) continue;
      const i = m.index + m[0].indexOf('{'); const j = walkTo(i); if (j < 0) continue;
      const body = text.slice(i, j + 1);
      let d = 0, cur = ''; const fields = [];
      for (let k = 0; k < body.length; k++) {
        const c = body[k];
        if (c === '"' || c === "'" || c === '`') { const q = c; k++; while (k < body.length && body[k] !== q) { if (body[k] === '\\') k++; k++; } cur = ''; continue; }
        if (c === '(' || c === '{' || c === '[') d++; else if (c === ')' || c === '}' || c === ']') d--;
        if (d === 1) { if (/[A-Za-z0-9_$]/.test(c)) cur += c; else { if (c === ':' && cur) fields.push(cur); cur = ''; } } else cur = '';
      }
      union[key] = fields.filter((f) => f !== 'type' && f !== 'subtype');
    }
  }
  return { union, helpers: [...pairs.values()], error: null };
}

/** §4d (lane S1 verify r5): the binary's OWN census of the tool_result texts it writes for a permission
 *  outcome. Anchor = the constant holding the interrupt marker; from it the two lists the binary keeps —
 *  `function X(){return[…,N,…]}` (the 2.1.281 `Gd()`, matched by startsWith in `Hd()`) and
 *  `Y=new Set([…,N,…])` (the exact is_error set, with `a+b` suffix forms) — name every constant; each
 *  is resolved to its string on a strings-dump line that declares at least ONE OTHER member (a chunk
 *  declares them together; a reused minified name elsewhere in the bundle is not that). Template literals
 *  end at the dump's line (a feedback tail after "the user said:" begins on the next line) — the rows are
 *  prefixes, as the binary's own matcher is. Never throws; every failure names its anchor. */
export function extractPermissionSentences(text) {
  const anchor = /(?<![\w$])([\w$]+)="\[Request interrupted by user for tool use\]"/.exec(text);
  if (!anchor) return { error: 'NO ANCHOR: "[Request interrupted by user for tool use]" is not a named constant in the bundle — the interrupt marker moved or was reworded: read the binary around "Tool call did not complete" and teach extractPermissionSentences the new form' };
  const N = anchor[1], esc = N.replace(/\$/g, '\\$');
  const gd = new RegExp('function ([\\w$]+)\\(\\)\\{return\\[((?:[\\w$]+,)*' + esc + '(?:,[\\w$]+)*)\\]\\}').exec(text);
  if (!gd) return { error: 'NO LIST: no `function X(){return[…,' + N + ',…]}` (the tool_result census the 2.1.281 bundle calls Gd) — the list moved: read the binary around "' + N + '" and teach extractPermissionSentences the new form' };
  // several chunks keep a Set naming the marker (2.1.281: If = [Jw,Ud], Fbe = [Jw,Ud,pb,ww,WO], IS = the 15-member exact
  // is_error set) — the census is the LARGEST, the one that lists every constant with its suffix forms
  const setRe = new RegExp('(?<![\\w$])([\\w$]+)=new Set\\(\\[((?:[\\w$+]+,)*' + esc + '(?:,[\\w$+]+)*)\\]\\)', 'g');
  let is = null; for (let m; (m = setRe.exec(text));) if (!is || m[2].split(',').length > is[2].split(',').length) is = m;
  if (!is) return { error: 'NO SET: no `Y=new Set([…,' + N + ',…])` (the exact is_error set the 2.1.281 bundle calls IS) — read the binary around "' + N + '"' };
  const from = new Map(); const suffixes = new Set();
  for (const tok of gd[2].split(',')) from.set(tok, 'Gd');
  for (const tok of is[2].split(',')) { const [head, ...rest] = tok.split('+'); from.set(head, from.has(head) ? 'both' : 'IS'); for (const p of rest) suffixes.add(p); }
  const names = [...from.keys()];
  const defRe = (name, flags) => new RegExp('(?<![\\w$])' + name.replace(/\$/g, '\\$') + '=(?:"((?:[^"\\\\]|\\\\.)*)"|`([^`\\n]*))', flags);
  const defsOf = (name) => { const out = []; const re = defRe(name, 'g'); let m; while ((m = re.exec(text))) out.push({ at: m.index, value: m[1] !== undefined ? m[1] : m[2] }); return out; };
  const lineOf = (at) => { const a = text.lastIndexOf('\n', at) + 1; const b = text.indexOf('\n', at); return [a, b < 0 ? text.length : b]; };
  const declaresAnother = (name, at) => { const [a, b] = lineOf(at); const line = text.slice(a, b); return names.some((o) => o !== name && defRe(o, '').test(line)); };
  const sentences = [], unresolved = [];
  for (const name of names) {
    // 2.1.288: the anchor's own name is REUSED on a 150 KB line that also declares one other member (`Eu="net.host.connection.subtype"`
    // beside `PE=…`) — so among several candidates the one whose line declares the MOST members wins (the census chunk declares
    // them together: 9 there); a tie stays unresolved, named (lane cli-2-1-288-records)
    const cands = defsOf(name).filter((d) => d.value.length >= 20 && declaresAnother(name, d.at));
    const members = (d) => { const [a, b] = lineOf(d.at); const line = text.slice(a, b); return names.filter((o) => o !== name && defRe(o, '').test(line)).length; };
    const ranked = cands.length > 1 ? cands.map((d) => ({ d, n: members(d) })).sort((x, y) => y.n - x.n) : null;
    const pick = cands.length === 1 ? cands[0] : (ranked && ranked[0].n > ranked[1].n ? ranked[0].d : null);
    if (pick) sentences.push({ name, from: from.get(name), text: pick.value.replace(/\\"/g, '"'), at: pick.at });
    else unresolved.push(name + ' (' + cands.length + ' candidate definitions on a line declaring another member)');
  }
  return { anchor: N, list: gd[1], set: is[1], sentences, unresolved, suffixes: [...suffixes] };
}
/** PURE: the binary's sentences vs the table — {unclassified: sentences the table lacks, ghosts: rows the binary lacks}. */
export function outcomeCensus(sentences, rows, literalText = '') {
  const texts = new Set(sentences.map((x) => x.text));
  const unclassified = sentences.filter((x) => !rows.some((r) => r.text === x.text)).map((x) => x.name + ' = ' + JSON.stringify(x.text.slice(0, 90)));
  const ghosts = rows.filter((r) => (r.binary === 'literal' ? !literalText.includes(r.text) : !texts.has(r.text))).map((r) => r.id + ' (' + r.binary + ')');
  return { unclassified, ghosts };
}

/** The raw zod object literal of one union key (`system/ui_toast`, `tombstone`) — bounded, the evidence. */
export function zodLiteralOf(text, helpers, key) {
  const [type, subtype] = key.split('/');
  for (const { obj, lit } of helpers) {
    const needle = obj + '({type:' + lit + '("' + type + '")' + (subtype ? ',subtype:' + lit + '("' + subtype + '")' : '');
    const i = text.indexOf(needle);
    if (i < 0) continue;
    let depth = 0;
    for (let j = i + obj.length; j < text.length && j < i + 8000; j++) {
      const c = text[j];
      if (c === '"' || c === "'" || c === '`') { const q = c; j++; while (j < text.length && text[j] !== q) { if (text[j] === '\\') j++; j++; } continue; }
      if (c === '(' || c === '{' || c === '[') depth++; else if (c === ')' || c === '}' || c === ']') { depth--; if (depth === 0) return text.slice(i, j + 1); }
    }
  }
  return null;
}

/** The dump of one binary: {version, method, helpers, union, sentences, zod:{key: literal}} (zod only for `newKeys`). */
export function dumpBinary(bin, newKeys = []) {
  const text = execFileSync('strings', ['-n', '8', bin], { maxBuffer: 1024 * 1024 * 1024, encoding: 'latin1' });
  const version = (execFileSync(bin, ['--version'], { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'] }).match(/\d+\.\d+\.\d+/) || [path.basename(bin)])[0];
  const { union, helpers, error } = extractZodUnion(text);
  if (error) throw new Error(error);
  const cen = extractPermissionSentences(text);
  const zod = {};
  for (const k of newKeys) zod[k] = zodLiteralOf(text, helpers, k);
  return {
    version,
    method: 'strings -n 8 <binary> (latin1) → extractZodUnion + extractPermissionSentences (scripts/claude-cli-dump.mjs)',
    helpers: helpers.map((h) => h.obj + '/' + h.lit + ' @' + h.anchor),
    union: Object.fromEntries(Object.keys(union).sort().map((k) => [k, union[k]])),
    sentences: cen.error ? { error: cen.error } : { anchor: cen.anchor, list: cen.list, set: cen.set, suffixes: cen.suffixes, unresolved: cen.unresolved, rows: cen.sentences.map((x) => ({ name: x.name, from: x.from, text: x.text })) },
    zod,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const [bin, prev] = process.argv.slice(2);
  if (!bin) { console.error('usage: node scripts/claude-cli-dump.mjs <claude binary> [previous dump.json]'); process.exit(2); }
  let newKeys = [];
  if (prev) {
    const old = JSON.parse(fs.readFileSync(prev, 'utf8')).union;
    const text = execFileSync('strings', ['-n', '8', bin], { maxBuffer: 1024 * 1024 * 1024, encoding: 'latin1' });
    newKeys = Object.keys(extractZodUnion(text).union).filter((k) => !(k in old));
  }
  process.stdout.write(JSON.stringify(dumpBinary(bin, newKeys), null, 1) + '\n');
}
