#!/usr/bin/env node
// THE SCHEMA ORACLE + DRIFT MODULE (docs/design-unknown-records.md §3, owner ruling (b) 2026-09-21:
// "除了未知事件本身，也得注意如果已知事件类型具有未知参数也得有所记录和提醒"). The fall-back card
// (2.369.120, scripts/test-unknown-records.mjs) catches a record TYPE VibeSpace has never seen; this
// suite pins the module that catches a KNOWN type that GREW a field — src/record-shape.js — and the
// hook in both normalizers that turns the verdict into ONE card per shape per session.
//   §1 census over the TRACKED fixtures (scripts/fixtures/**, never production ~/.claude / ~/.codex —
//      the 2026-09-09 fixture rule): every field on every declared shape ∈ known ∪ ignored ∪ envelope
//      ∪ ours. An optional PRINTED local leg over ~/.claude/projects + ~/.codex/sessions runs only
//      behind VIBESPACE_SHAPE_CENSUS=1 (SKIP with reason in the gate).
//   §2 synthetic drift (the card policy — lane drift-card-restore, owner 2026-10-15 「你隐藏了还怎么知道」): init +{foo,bar} →
//      ONE card naming both (the CLI build on it) AND ONE drift-ledger row (conversation + shape, CLI build, count, the redacted
//      sample); a repeat adds no card and counts, a third with +{qux} MERGES into the card (edit op) and GROWS the row, a re-read
//      record counts once, telemetry once; codex token_count.info +{baz}; an unknown TYPE is the fall-back card only.
//   §2c the policy's RED controls (patched copies): .276's field-growth hiding / no ledger write / no enum card each go red.
//   §3 enum drift: an undeclared enum value is a card (its meaning may differ) AND the handler still runs.
//   §4a the extractor on every spelling the minifier has used (2.1.280 `u(`, 2.1.281 `d(`, a future
//      rename, an unminified form) — the helper names are read off an anchor; an unknown form is an error
//      naming the anchor, never a silent 0 / 0 / 0.
//   §4 the BINARY ORACLE: the installed claude's zod union, read with the census's own extractor —
//      every system subtype / stream type on exactly ONE of HANDLED ∪ KNOWN_IGNORED ∪
//      DECLARED_UPSTREAM_UNSEEN, every declared shape's binary fields ⊆ known ∪ ignored, no dead list
//      entry. SKIP with reason when no claude binary is installed. Red locally the day the CLI updates.
//   §4e the PINNED dumps (lane cli-2-1-288-records): each build in SCHEMA_CLI_VERSIONS judged from its tracked
//      dump (scripts/fixtures/claude-cli/<v>.json) — runs with no claude installed; a version-less new row is red.
//   §5 negative control: a scratch copy with every `ignored` map emptied goes red on §1.
// Run: node scripts/test-record-shape.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mutantCopies } from './mutant-copy.mjs';
import { anchored, handedCliCandidates } from './scratch.mjs'; // B-9ff2 step 2: the 2.1.328 controls' edits fail by name when their line moves
// §4d (lane S1 verify r5): THE PERMISSION-OUTCOME SENTENCE CENSUS — the binary's OWN lists of the tool_result
//   texts it writes for a permission outcome (`Gd()` and the exact is_error set) vs src/permission-outcome.js;
//   the names are read off an anchor (the interrupt marker), never spelled; a newer build's extra sentence
//   PRINTS and FAILS until classified — the same discipline as §4's field census.
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0, skipped = 0;
let ORACLE_MODE = 'not read (the binary oracle did not run)';   // B-28b1: said in the closing line
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(`ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`, false); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const skip = (n, why) => { skipped++; console.log('  ○ SKIP ' + n + ' — ' + why); };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const R = require(path.join(REPO, 'src/record-shape.js'));
const MM = require(path.join(REPO, 'src/message-manager.js'));
const { CodexMessageManager } = require(path.join(REPO, 'src/codex-message-manager.js'));
const { createMessageManager } = require(path.join(REPO, 'src/normalizers.js'));
const driftCards = (mm) => mm.messages.filter((m) => m.noticeKind === 'unknown-fields');
const unknownCards = (mm) => mm.messages.filter((m) => m.noticeKind === 'unknown-record');
const ledgerOf = (conversation, MMx = MM) => MMx.driftLedgerRows().filter((r) => r.conversation === conversation); // THE drift ledger (lane record-oracle-2-1-296)
// §4d THE CORRECTION'S CALL SITE, read BY STRUCTURE (B-28b1's side run, the coordinator's r1539/r1543): the first STRICT hosted
// run (44953729818, 2.1.328) read none of the leg's three patterns — they spelled 2.1.314's minified LETTERS (e,n,r,s / e.id /
// e.callRunning) and 2.1.328 renamed its letters (the tracked dumps' helpers: u/T through 2.1.322, c/E in 2.1.328). Here every LOCAL
// name is CAPTURED; only what a minifier keeps is spelled (property names, string literals). A miss carries the bundle's own text.
const CS_ID = '[A-Za-z_$][\\w$]*';
const csE = (n) => n.replace(/[$]/g, '\\$');
const csWord = (n) => new RegExp('(^|[^\\w$.])' + csE(n) + '(?![\\w$])');
const SITE_WINDOW = 4000; // the site sits INSIDE createSyntheticErrorMessage: at most this far after its signature
// `F=(c)=>c.callRunning===!0` (or a body returning it), found by indexOf — no unanchored pattern over a 200 MB bundle
function arrowReads(text, name) {
  const re = new RegExp(`^=\\(?(${CS_ID})(?:,${CS_ID})*\\)?=>(?:\\{[^}]{0,160}return )?\\1\\.callRunning===!0(?![\\w$.])`);
  for (let i = text.indexOf(name + '='); i >= 0; i = text.indexOf(name + '=', i + 1)) {
    if (!/[\w$.]/.test(text[i - 1] || '') && re.test(text.slice(i + name.length, i + name.length + 240))) return true;
  }
  return false;
}
// THE FLAG STANDS AS A POSITIVE CONJUNCT (the coordinator's r1682, round wynbby0e0): the condition is an `&&` chain at its top level
// (no `||` / `??` there; a comma's last operand is the condition) and ONE conjunct IS the flag — bare, `!!f` or `f===!0`. A flag
// merely present (`!c&&…`, `c||…`) is a bundle where the law is FALSE: the corrections written for a call that was NOT running.
function flagConjunct(cond, flag) {
  const c = String(cond), parts = [];
  let depth = 0, cur = '', q = null;
  for (let i = 0; i < c.length; i++) {
    const ch = c[i];
    if (q) { cur += ch; if (ch === '\\') { cur += c[i + 1] || ''; i++; } else if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { q = ch; cur += ch; continue; }
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    if (depth === 0 && (c.startsWith('||', i) || c.startsWith('??', i))) return false;
    if (depth === 0 && ch === ',') { parts.length = 0; cur = ''; continue; }
    if (depth === 0 && c.startsWith('&&', i)) { parts.push(cur); cur = ''; i++; continue; }
    cur += ch;
  }
  parts.push(cur);
  const yes = new Set([flag, '!!' + flag, flag + '===!0', '!0===' + flag]);
  return parts.some((x) => yes.has(x.trim().replace(/^\((.*)\)$/, '$1').trim()));
}
// §4d THE CALL SITE AS 2.1.328 REALLY HAS IT (the coordinator's r2934, the candidate's hosted run 45112121215 — the first strict read of
// the real build): createSyntheticErrorMessage(e,o,r,g,y=!1,h=!1) has SIX parameters, the last two defaulted; the caller hands
// (call.id, "user_interrupted", call.assistantMessage, Ka(call), call.keepsOwnErrorAfterEsc, call.answered); Ka(e,o) returns
// `e.callRunning===!0&&(…its second parameter's denial kind…)`; and the content is a CHAIN, `w4(y?rHn:g&&(k==…)?nHn:Bh)`: each
// correction under its OWN condition. A correction is judged by the row of its own text, through CORRECTION_CONDITION.
const CORRECTION_CONDITION = Object.freeze({
  m9t: { param: 3, words: "its 4th parameter, the caller's running helper (call.callRunning === true)" },
  rHn: { param: 4, callerProp: 'keepsOwnErrorAfterEsc', words: 'its 5th parameter, the call keeps its own error after Esc (call.keepsOwnErrorAfterEsc)' },
});
/** PURE: an expression's top level split at its FIRST ternary → { cond, cons, alt } | null (strings, brackets, `?.` and `??` kept whole) */
function splitTernary(s) {
  let depth = 0, q = null, at = -1, need = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === '\\') { i++; continue; } if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { q = ch; continue; }
    if ('([{'.includes(ch)) { depth++; continue; }
    if (')]}'.includes(ch)) { depth--; continue; }
    if (depth) continue;
    if (ch === '?') {
      if (s[i + 1] === '.' && !/\d/.test(s[i + 2] || '')) { i++; continue; }   // optional chaining
      if (s[i + 1] === '?') { i++; continue; }   // nullish coalescing
      if (at < 0) { at = i; need = 1; } else need++;
      continue;
    }
    if (ch === ':' && at >= 0 && --need === 0) return { cond: s.slice(0, at), cons: s.slice(at + 1, i), alt: s.slice(i + 1) };
  }
  return null;
}
const balancedText = (t) => { let d = 0; for (const ch of t) { if ('([{'.includes(ch)) d++; else if (')]}'.includes(ch) && --d < 0) return false; } return d === 0; };
const unparen = (x) => { let t = String(x).trim(); while (t.startsWith('(') && t.endsWith(')') && balancedText(t.slice(1, -1))) t = t.slice(1, -1).trim(); return t; };
/** PURE: the leaves of a ternary chain, each with the conditions on its path → [{ leaf, path: [{ cond, truth }] }] */
function chainLeaves(expr, path = []) {
  const e = unparen(expr), t = splitTernary(e);
  if (!t) return [{ leaf: e, path }];
  const cond = unparen(t.cond);
  return [...chainLeaves(t.cons, [...path, { cond, truth: true }]), ...chainLeaves(t.alt, [...path, { cond, truth: false }])];
}
/** the argument of the first `content:F(…)` call in `body` whose argument names one of `names` → { at, call, arg } | null */
function contentChainOf(body, names) {
  const re = /content:[A-Za-z_$][\w$]*\(/g;
  let m;
  while ((m = re.exec(body))) {
    const start = m.index + m[0].length;
    let d = 1, q = null, i = start;
    for (; i < body.length && d; i++) { const ch = body[i]; if (q) { if (ch === '\\') { i++; continue; } if (ch === q) q = null; continue; } if (ch === '"' || ch === "'" || ch === '`') q = ch; else if ('([{'.includes(ch)) d++; else if (')]}'.includes(ch)) d--; }
    if (d) continue;
    const arg = body.slice(start, i - 1);
    if (names.some((n) => csWord(n).test(arg))) return { at: m.index, call: body.slice(m.index, i), arg };
  }
  return null;
}
function correctionSiteOf(text, wwName, corrs) {
  const cs = corrs.map((c) => (typeof c === 'string' ? { name: c, row: null } : c));
  const out = { sig: null, site: null, chain: null, leaves: [], judged: [], wwDefault: false, caller: null, callerArg: null, callerArgs: [], ran: false, misses: [] };
  // (1) the signature: FOUR parameters or more (a later one may carry a default), the second compared to "user_interrupted" first thing
  const sm = new RegExp(`createSyntheticErrorMessage\\((${CS_ID}),(${CS_ID}),(${CS_ID}),(${CS_ID})((?:,${CS_ID}(?:=[^,(){}]{1,16})?){0,4})\\)\\{if\\((?:\\2==="user_interrupted"|"user_interrupted"===\\2)\\)`).exec(text);
  if (sm) out.sig = { at: sm.index, params: [...sm.slice(1, 5), ...(sm[5] ? sm[5].slice(1).split(',').map((p) => p.split('=')[0]) : [])], text: sm[0] };
  else out.misses.push('the signature createSyntheticErrorMessage(a,b,c,d[,…]){if(b==="user_interrupted")');
  // (2) THE CONTENT CHAIN inside that body: every correction a LEAF judged by ITS OWN condition; ww the default (every condition false)
  if (sm && wwName) {
    const body = text.slice(sm.index, sm.index + SITE_WINDOW);
    const ch = contentChainOf(body, [wwName, ...cs.map((c) => c.name)]);
    if (!ch) out.misses.push(`a «content:F(…)» naming ${wwName} or a correction within ${SITE_WINDOW} characters of the signature`);
    else {
      out.site = { at: sm.index + ch.at, text: ch.call }; out.chain = ch.arg; out.leaves = chainLeaves(ch.arg);
      const leafOf = (n) => out.leaves.find((l) => l.leaf === n);
      const w = leafOf(wwName);
      out.wwDefault = !!w && w.path.every((p) => !p.truth);
      if (!out.wwDefault) out.misses.push(`${wwName} is not the chain's default (the leaf every condition skips)`);
      for (const c of cs) {
        const l = leafOf(c.name), rule = c.row ? CORRECTION_CONDITION[c.row] : null, p = rule ? out.sig.params[rule.param] : null;
        const held = !!(l && p && l.path.some((x) => x.truth && flagConjunct(x.cond, p)));
        out.judged.push({ name: c.name, row: c.row, leaf: !!l, rule: rule ? rule.words : null, param: p || null, held });
        if (!l) out.misses.push(`${c.name} is not a leaf of the content chain`);
        else if (!rule) out.misses.push(`${c.name} (row ${c.row || '—'}) has no CORRECTION_CONDITION row: name its condition`);
        else if (!p) out.misses.push(`${c.name}'s condition is ${rule.words}, and the signature has no such parameter`);
        else if (!held) out.misses.push(`${c.name}'s own condition does not hold ${p} (${rule.words}) as a positive conjunct`);
      }
    }
  }
  // (3) the caller: (c.id, "user_interrupted", c.assistantMessage, F(c) | c.callRunning===!0, …more) — F reads c.callRunning === true;
  // a correction whose condition names a caller property gets exactly that argument
  const cm = new RegExp(`createSyntheticErrorMessage\\((${CS_ID})\\.id,"user_interrupted",\\1\\.assistantMessage,(?:(${CS_ID})\\(\\1\\)|(\\1\\.callRunning===!0))((?:,[^,()]{1,60}){0,4})\\)`).exec(text);
  if (cm) {
    out.caller = cm[0]; out.callerArg = cm[2] || cm[3];
    out.callerArgs = [`${cm[1]}.id`, '"user_interrupted"', `${cm[1]}.assistantMessage`, cm[2] ? `${cm[2]}(${cm[1]})` : cm[3], ...(cm[4] ? cm[4].slice(1).split(',') : [])];
    if (cm[3]) out.ran = true;
    else {
      const F = csE(cm[2]);
      out.ran = new RegExp(`function ${F}\\((${CS_ID})(?:,${CS_ID})*\\)\\{[^}]{0,160}return \\1\\.callRunning===!0(?![\\w$.])`).test(text) || arrowReads(text, cm[2]);
      if (!out.ran) out.misses.push(`${cm[2]}(call) = call.callRunning === true (function or arrow)`);
    }
    for (const c of cs) {
      const rule = c.row ? CORRECTION_CONDITION[c.row] : null;
      if (rule && rule.callerProp && out.callerArgs[rule.param] !== `${cm[1]}.${rule.callerProp}`) out.misses.push(`the caller's argument ${rule.param + 1} is «${out.callerArgs[rule.param] || 'none'}», not ${cm[1]}.${rule.callerProp} (${c.name}'s condition)`);
    }
  } else out.misses.push('the caller createSyntheticErrorMessage(c.id,"user_interrupted",c.assistantMessage,F(c)[,…])');
  out.ok = !!out.sig && !!out.site && out.wwDefault && out.judged.length === cs.length && out.judged.every((j) => j.leaf && j.held) && !!out.caller && out.ran && !out.misses.length;
  return out;
}
/** PURE (r2084): the record oracle's road to a real claude — { open, handed, pinned, why }. Under VS_NO_REAL_CLI=1 nothing; on the
 *  hosted runner the handed env's candidates (the pin step's install) and a file named by hand; elsewhere only a file named by hand
 *  (VIBESPACE_ORACLE_BINARY), never a person's install. */
function oracleRoad({ hosted, noRealCli, pinned = null }) {
  if (noRealCli) return { open: false, handed: false, pinned: null, why: 'VS_NO_REAL_CLI=1 — no real install is read here (r2084)' };
  if (hosted) return { open: true, handed: true, pinned, why: '' };
  if (pinned) return { open: true, handed: false, pinned, why: '' };
  return { open: false, handed: false, pinned: null, why: "not the hosted runner (no GITHUB_ACTIONS=true) — a person's installed claude is never read (r2084); a file named by a person's own hand (VIBESPACE_ORACLE_BINARY) is read only where this suite is not re-homed: on a person's machine the re-home drops that name (r2225)" };
}
/** PURE: the file the oracle reads on its road — the hand-named file first, then the handed candidates — or null. */
function oracleBinary(road, candidates = [], isFileAt = (c) => { try { const real = fs.realpathSync(c); return fs.statSync(real).isFile() ? real : null; } catch { return null; } }) {
  if (!road || !road.open) return null;
  for (const c of [road.pinned, ...(road.handed ? candidates : [])].filter(Boolean)) { const r = isFileAt(c); if (r) return r; }
  return null;
}
/** PURE (r1682): on a hosted run, why the installed claude is not the tree's pin — or null. Off a hosted run, null (the box judges by
 *  its own strict oracle; a test machine has no agent CLI). */
function hostedPinWhy({ hosted, bin, size, installed, pinned }) {
  if (!hosted) return null;
  if (!bin) return `no claude binary on the hosted runner (the pin step installs ${pinned})`;
  if (size < 4 * 1024 * 1024) return `${bin} is ${size} bytes — a launcher/shim, not the pinned ${pinned}`;
  if (!installed) return `the installed build could not be read off ${bin} (the pin is ${pinned})`;
  if (installed !== pinned) return `the installed ${installed} is not the pin ${pinned}: a failed pin step, or a claude that shadows it on PATH`;
  return null;
}
// THE BUNDLE'S OWN TEXT where the reader looks (≤ 300 characters each): every USE of a correction (never its declaration),
// createSyntheticErrorMessage( and callRunning===. Printed to STDERR on a red: the runner shows a red suite's stderr WHOLE.
function correctionEvidence(text, corrNames, cap = 300) {
  const lines = [];
  const at = (label, i) => lines.push(`${label} @${i}: ${JSON.stringify(text.slice(Math.max(0, i - cap / 2), i + cap / 2))}`);
  for (const n of corrNames) {
    let i = -1, k = 0;
    while (k < 3 && (i = text.indexOf(n, i + 1)) >= 0) {
      const before = text[i - 1] || '', after = text.slice(i + n.length, i + n.length + 2);
      if (/[\w$.]/.test(before) || /^[\w$]/.test(after) || (/^=/.test(after) && after !== '==')) continue; // a longer name, a property, the declaration
      at(`a use of ${n}`, i); k++;
    }
    if (!k) lines.push(`a use of ${n}: NONE in the bundle (only its declaration)`);
  }
  for (const [needle, max] of [['createSyntheticErrorMessage(', 3], ['callRunning===', 2]]) {
    let i = -1, k = 0;
    while (k < max && (i = text.indexOf(needle, i + 1)) >= 0) { at(needle, i); k++; }
    if (!k) lines.push(`${needle}: NOT in the bundle`);
  }
  return lines;
}

// ── the census walker (shared by §1, the local leg and §5) ──
const CODEX_RECORD_TYPES = new Set(['session_meta', 'response_item', 'event_msg', 'turn_context', 'wrapper_meta', 'token_usage_record', 'compacted', 'world_state', 'server_request', 'server_request_resolved', 'inter_agent_communication_metadata', '_stdin_ack']);
function harnessOf(rec, file) {
  if (/(^|\/)rollout-|codex/i.test(file) && rec && typeof rec.type === 'string' && (CODEX_RECORD_TYPES.has(rec.type) || 'payload' in rec)) return 'codex';
  if (rec && typeof rec.type === 'string' && CODEX_RECORD_TYPES.has(rec.type) && 'payload' in rec) return 'codex';
  return rec && typeof rec.type === 'string' ? 'claude' : null;
}
// A file above this cap is SKIPPED, named and counted (never read): the local census leg crashed
// on a 964 MB production transcript (`Cannot create a string longer than 0x1fffffe8 characters`,
// r3 2026-09-21) before printing a line — the design's own census had already noted 2 skipped > 512 MB.
const RECORD_FILE_CAP = 256 * 1024 * 1024;
function* recordsOf(file, stats = null) {
  let text;
  try {
    const size = fs.statSync(file).size;
    if (size > RECORD_FILE_CAP) { if (stats) stats.skipped.push({ file, size, why: 'size' }); return; }
    text = fs.readFileSync(file, 'utf8');
  } catch (e) { if (stats) stats.skipped.push({ file, size: null, why: e.code || e.message }); return; }
  if (file.endsWith('.jsonl')) {
    for (const line of text.split('\n')) { const t = line.trim(); if (!t.startsWith('{')) continue; try { yield JSON.parse(t); } catch { } }
  } else {
    let j; try { j = JSON.parse(text); } catch { return; }
    if (Array.isArray(j)) { for (const x of j) if (x && typeof x === 'object') yield x; }
    else if (j && typeof j === 'object') yield j;
  }
}
function* walk(dir) {
  let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name === 'node_modules') continue; yield* walk(p); }
    else if (/\.(json|jsonl)$/.test(e.name)) yield p;
  }
}
// Exclusions BY RULE (design §3 false-positive (g)): the workflow journal rows look like claude records
// but never reach a normalizer (only /api/workflow reads subagents/workflows/*/journal.jsonl).
const EXCLUDED_PATH = /subagents\/workflows\/[^/]+\/journal\.jsonl$/;
function census(mod, roots) {
  const judged = new Map(); const drift = []; const stats = { skipped: [] }; let files = 0, records = 0;
  for (const root of roots) for (const file of walk(root)) {
    if (EXCLUDED_PATH.test(file)) continue;
    files++;
    for (const rec of recordsOf(file, stats)) {
      records++;
      const h = harnessOf(rec, file);
      if (!h) continue;
      const judge = (r, opts) => {
        const shape = mod.shapeKeyOf(h, h === 'codex' ? 'rollout' : mod.carrierOf('claude', r), r, opts);
        if (!shape || !mod.SHAPES[shape]) return;
        judged.set(shape, (judged.get(shape) || 0) + 1);
        const d = mod.unknownFields(h, h === 'codex' ? 'rollout' : mod.carrierOf('claude', r), r, opts);
        if (d) drift.push({ file: path.relative(REPO, file), ...d });
      };
      // an event_msg line: the carrier judged at the envelope level, its payload once as the event (the normalizer's split)
      judge(rec, h === 'codex' && rec.type === 'event_msg' ? { kind: 'envelope' } : undefined);
      if (h === 'codex' && rec.type === 'event_msg' && rec.payload && typeof rec.payload === 'object') {
        judge(rec.payload, { kind: 'event' });
        const it = rec.payload.type === 'item_completed' ? rec.payload.item : null;
        if (it && typeof it === 'object') judge(it, { kind: 'item' });
      }
    }
  }
  return { judged, drift, files, records, skipped: stats.skipped };
}

console.log('§1 census over the tracked fixtures — every field on every declared shape is declared');
{
  const c = census(R, [path.join(REPO, 'scripts/fixtures')]);
  const shapes = [...c.judged.keys()].sort();
  console.log(`    ${c.files} fixture files · ${c.records} records · ${shapes.length} declared shapes judged`);
  for (const s of shapes) console.log(`      ${String(c.judged.get(s)).padStart(5)}  ${s}`);
  ok('the census is NON-VACUOUS: ≥ 25 declared shapes judged across both harnesses and all three claude/codex carriers', shapes.length >= 25 && shapes.some((s) => s.startsWith('claude:stream:')) && shapes.some((s) => s.startsWith('claude:transcript:')) && shapes.some((s) => s.startsWith('codex:rollout:')), shapes);
  ok('the three live-seen undeclared fields are exercised by a fixture (init.messaging_socket_path / task_started.owned_by_subagent / task_progress.workflow_progress) and NOT flagged', ['claude:stream:system/init', 'claude:stream:system/task_started', 'claude:stream:system/task_progress'].every((s) => c.judged.has(s)) && !c.drift.some((d) => /messaging_socket_path|owned_by_subagent|workflow_progress/.test(d.fields.join(','))));
  ok('ZERO drift over the tracked fixtures (a fixture carrying a field the module does not declare is either a real field to declare or a wrong fixture)', c.drift.length === 0, c.drift.slice(0, 8));
  ok('the three live-seen fields are declared WITH a note (the ignored map carries the reason — never silently known)', ['messaging_socket_path', 'owned_by_subagent', 'workflow_progress'].every((f) => Object.values(R.CORPUS_KNOWN).some((m) => typeof m[f] === 'string' && m[f].length > 10)));
  // the optional PRINTED local leg — never in the gate, never without the env
  if (process.env.VIBESPACE_SHAPE_CENSUS === '1') {
    const roots = [path.join(os.homedir(), '.claude/projects'), path.join(os.homedir(), '.codex/sessions')].filter((p) => fs.existsSync(p));
    const lc = census(R, roots);
    console.log(`    LOCAL LEG (printed only): ${lc.files} files · ${lc.records} records · ${lc.judged.size} shapes · ${lc.drift.length} drift verdicts · ${lc.skipped.length} skipped`);
    for (const s of lc.skipped) console.log(`      skip (${s.why}${s.size != null ? ' ' + Math.round(s.size / 1048576) + ' MB' : ''}) ${s.file.replace(os.homedir(), '~')}`);
    const byShape = new Map();
    for (const d of lc.drift) { const k = d.shape + ' +{' + d.fields.join(',') + '}'; byShape.set(k, (byShape.get(k) || 0) + 1); }
    for (const [k, n] of [...byShape].sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(`      ${String(n).padStart(6)}  ${k}`);
  } else skip('local census over ~/.claude/projects + ~/.codex/sessions', 'set VIBESPACE_SHAPE_CENSUS=1 to print it (read-only; never in the gate)');
}

console.log('§2 synthetic drift — a known record that GREW a field is ONE card per shape per session (the update signal, lane drift-card-restore), merged on repeat, AND ONE drift-ledger row per conversation + shape; telemetry once, the fall-back card never doubled');
{
  const prevEv = global.__vsEvent; const events = []; global.__vsEvent = (n, d) => events.push([n, d]);
  MM.MessageManager._seenShapeDrift.clear();
  const mm = createMessageManager('claude', 'test-shape-1');
  const ops = []; mm.listeners.push((e) => ops.push(e));
  const init = (extra) => ({ type: 'system', subtype: 'init', cwd: '/w/proj', session_id: 'e2e00000-0000-4000-8000-000000000001', uuid: 'u-init-' + Math.random(), tools: [], mcp_servers: [], model: 'claude-fable-5-1', permissionMode: 'default', slash_commands: [], apiKeySource: 'sk-ant-fixture-secret', claude_code_version: '2.1.274', output_style: 'default', skills: [], plugins: [], ...extra });
  mm.processLive(init({ foo: 1, bar: 'x' }));
  const SID1 = 'e2e00000-0000-4000-8000-000000000001';
  let c = driftCards(mm);
  let row = ledgerOf(SID1)[0];
  ok('init +{foo,bar} ⇒ ONE card (noticeKind unknown-fields, block unknown_fields naming the shape, both fields and the CLI build the init frame named) AND ONE drift-ledger row for the conversation (the record\'s own session id): the shape, both fields, the CLI build, count 1', c.length === 1 && c[0].content[0].type === 'unknown_fields' && c[0].content[0].shape === 'system/init' && JSON.stringify(c[0].content[0].fields) === '["foo","bar"]' && c[0].content[0].harness === 'Claude Code' && c[0].content[0].cli === '2.1.274' && ledgerOf(SID1).length === 1 && row.shape === 'system/init' && JSON.stringify(row.fields) === '["foo","bar"]' && row.harness === 'Claude Code' && row.cli === '2.1.274' && row.count === 1, { cards: c.map((m) => m.content[0]), rows: ledgerOf(SID1) });
  ok('…the card is EMITTED as a create op (an open window sees it)', ops.filter((o) => o.op === 'create' && (o.message || o.msg)?.noticeKind === 'unknown-fields').length === 1);
  ok('…the card\'s sample and the row\'s ride through the redactor: the value under apiKeySource (an api+key compound) is masked, the field names are visible', [c[0].content[0].sample, row.sample].every((s) => /«redacted»/.test(s) && !/sk-ant-fixture-secret/.test(s) && /"foo": 1/.test(s)));
  // the redactor judges key SEGMENTS, never substrings (r3 2026-09-21: the /key/ alternative masked the notification's own `key`)
  const red = R.redactRecord({ key: 'stop-hook-error', monkey: 'm', hotkey: 'h', keyboard: 'k', keys: ['a'], turnkey: 't', api_key: 'x', apiKey: 'x', ANTHROPIC_API_KEY: 'x', access_token: 'x', refreshToken: 'x', OAuthToken: 'x', authorization: 'x', password: 'x', secret_key: 'x', apiKeySource: 'x', input_tokens: 5, nested: { cookie: 'c', session_key: 's', key: 'inner-visible' } });
  ok('NEGATIVE CONTROL: `key` / `monkey` / `hotkey` / `keyboard` / `keys` / `turnkey` values stay VISIBLE (a drift card on system/notification must show the field that identifies it)', red.key === 'stop-hook-error' && red.monkey === 'm' && red.hotkey === 'h' && red.keyboard === 'k' && red.keys[0] === 'a' && red.turnkey === 't' && red.nested.key === 'inner-visible', red);
  ok('…while credential compounds and secret segments are masked at any depth: api_key / apiKey / ANTHROPIC_API_KEY / access_token / refreshToken / OAuthToken / authorization / password / secret_key / apiKeySource / nested cookie + session_key; counts (input_tokens) stay', ['api_key', 'apiKey', 'ANTHROPIC_API_KEY', 'access_token', 'refreshToken', 'OAuthToken', 'authorization', 'password', 'secret_key', 'apiKeySource'].every((k) => red[k] === '«redacted»') && red.nested.cookie === '«redacted»' && red.nested.session_key === '«redacted»' && red.input_tokens === 5, red);
  ok('isSecretKey is exported and table-true on the same rows', R.isSecretKey('apiKey') && R.isSecretKey('ACCESS_TOKEN') && !R.isSecretKey('key') && !R.isSecretKey('monkey') && !R.isSecretKey('keyboard') && !R.isSecretKey('messaging_socket_path'));
  ok('…the init card itself still rendered (handling unchanged — the drift hook runs AFTER routing)', mm.messages.some((m) => m.content?.[0]?.initData));
  mm.processLive(init({ foo: 2, bar: 'y' }));
  row = ledgerOf(SID1)[0];
  ok('a SECOND occurrence with the same fields adds NO card and no op; the row counts 2', driftCards(mm).length === 1 && ops.filter((o) => o.op === 'edit' && o.fields?.content?.[0]?.type === 'unknown_fields').length === 0 && ledgerOf(SID1).length === 1 && row.count === 2, row);
  const nEdits = ops.length;
  mm.processLive(init({ foo: 3, qux: true }));
  c = driftCards(mm);
  row = ledgerOf(SID1)[0];
  ok('a THIRD with +{qux} MERGES into the same card (fields now foo,bar,qux) through an EDIT op — never a new card; the row grows the same way (count 3)', c.length === 1 && JSON.stringify(c[0].content[0].fields) === '["foo","bar","qux"]' && ops.slice(nEdits).some((o) => o.op === 'edit' && o.id === c[0].id && o.fields.content[0].fields.length === 3) && ledgerOf(SID1).length === 1 && JSON.stringify(row.fields) === '["foo","bar","qux"]' && row.count === 3, { cards: c.map((m) => m.content[0].fields), row });
  // THE CARD'S NEW HOME (lane door-healthy-chat, 2.369.344 — the naive studies' W1/C1): the notice still exists (the census above) but the
  // chat no longer draws it; the shape is ONE row of the conversation's added kinds — the status bar's quiet chip — said by a meta op
  const kindsOps = ops.filter((o) => o.op === 'meta' && o.subtype === 'record-kinds');
  ok('…the grown shape is ONE added kind of the conversation (kind fields, name system/init, the CLI build) — the bar\'s quiet chip — and its `record-kinds` meta op went out once (the merges add none)', JSON.stringify(mm.addedKinds()) === JSON.stringify([{ kind: 'fields', name: 'system/init', cli: '2.1.274' }]) && kindsOps.length === 1, { kinds: mm.addedKinds(), kindsOps: kindsOps.length });
  const drifts = events.filter((e) => e[0] === 'harness-shape-drift');
  ok('telemetry harness-shape-drift fired ONCE per process per shape, the detail naming shape + fields + the CLI build', drifts.length === 1 && /^claude:stream:system\/init \+\{foo,bar\}/.test(drifts[0][1]) && /cli 2\.1\.274/.test(drifts[0][1]), drifts);
  // the fall-back card owns an unknown TYPE: never ALSO a drift card
  mm.processLive({ type: 'brand_new_record', anything: 1, uuid: 'u-x', session_id: 's' });
  mm.processLive({ type: 'system', subtype: 'never_seen_subtype', whatever: 2, uuid: 'u-y', session_id: 's' });
  ok('an unknown TYPE / subtype is the fall-back card ONLY (2 unknown-record cards, still 1 drift card, no ledger row for them)', unknownCards(mm).length === 2 && driftCards(mm).length === 1 && ledgerOf('s').length === 0);
  // a history rebuild renders the same ONE card; a record already counted (the same record key) is not counted again
  const SID2 = 'e2e00000-0000-4000-8000-000000000002';
  const again = [init({ foo: 1, bar: 2, session_id: SID2, uuid: 'u-h1' }), init({ foo: 1, bar: 2, session_id: SID2, uuid: 'u-h2' })];
  createMessageManager('claude', 'test-shape-2-live').convertHistory(again);
  const hist = createMessageManager('claude', 'test-shape-2');
  hist.convertHistory(again);
  ok('a HISTORY rebuild renders the same ONE card (the hook is a renderer, not an alert); the SAME row, still count 2 (a re-read record counts once, by its record key)', driftCards(hist).length === 1 && driftCards(hist)[0].content[0].fields.length === 2 && ledgerOf(SID2).length === 1 && ledgerOf(SID2)[0].count === 2 && ledgerOf(SID2)[0].fields.length === 2, { cards: driftCards(hist).map((m) => m.content[0].fields), rows: ledgerOf(SID2) });
  // a handled record with NO drift produces nothing
  const clean = createMessageManager('claude', 'test-shape-3');
  clean.processLive(init({ session_id: 'e2e00000-0000-4000-8000-000000000003' }));
  clean.processLive({ type: 'system', subtype: 'thinking_tokens', estimated_tokens: 5, estimated_tokens_delta: 5, uuid: 'u-t', session_id: 's' });
  ok('clean records ⇒ no drift card and no ledger row (negative control for the hook)', driftCards(clean).length === 0 && unknownCards(clean).length === 0 && ledgerOf('e2e00000-0000-4000-8000-000000000003').length === 0);
  // codex
  CodexMessageManager._seenShapeDrift.clear();
  const cx = new CodexMessageManager('test-shape-cx');
  const cops = []; cx.onOp((o) => cops.push(o));
  const tc = (extra) => ({ timestamp: '2026-09-13T16:39:55.000Z', type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { total_tokens: 1 }, last_token_usage: { total_tokens: 1 }, model_context_window: 100, ...extra }, rate_limits: { limit_id: 'codex' } } });
  cx.processLive(tc({ baz: 1 }));
  cx.processLive(tc({ baz: 2 }));
  const cc = driftCards(cx);
  const cxr = ledgerOf('test-shape-cx');
  ok('codex token_count.info +{baz} ⇒ ONE card (shape event/token_count, field info.baz, harness Codex), the repeat adds none; AND ONE ledger row (the same shape + field), the repeat (another record) counts 2', cc.length === 1 && cc[0].content[0].shape === 'event/token_count' && JSON.stringify(cc[0].content[0].fields) === '["info.baz"]' && cc[0].content[0].harness === 'Codex' && cxr.length === 1 && cxr[0].shape === 'event/token_count' && JSON.stringify(cxr[0].fields) === '["info.baz"]' && cxr[0].harness === 'Codex' && cxr[0].count === 2, { cards: cc.map((m) => m.content[0]), cxr });
  ok('…the token_count itself was still consumed (usage meta path ran)', cops.some((o) => o.op === 'meta' && o.subtype === 'usage') || cx.messages.length >= 1);
  ok('codex telemetry once, naming the shape', events.filter((e) => e[0] === 'harness-shape-drift' && /codex:rollout:event\/token_count \+\{info\.baz\}/.test(e[1])).length === 1);
  cx.processLive({ timestamp: '2026-09-13T16:39:56.000Z', type: 'event_msg', payload: { type: 'item_completed', thread_id: 't', turn_id: 'x', item: { type: 'Extension', kind: 'web.sleep', id: 'exec-1', seconds: 2 } } });
  ok('an unknown codex item KIND is the fall-back card by name — never ALSO a drift card / ledger field for its fields (still the one card, the one row)', unknownCards(cx).length === 1 && driftCards(cx).length === 1 && ledgerOf('test-shape-cx').length === 1);
  // the event_msg CARRIER line is judged at the envelope level too (r3 2026-09-21: a new top-level key on an event line was
  // invisible while the same key on a response_item line was flagged) — and the payload is still judged exactly once
  const ce = new CodexMessageManager('test-shape-cx-env');
  ce.processLive({ ...tc({}), brand_new_top: 1 });
  let ced = ledgerOf('test-shape-cx-env');
  ok('codex event_msg line +{brand_new_top} at the TOP level ⇒ a drift card on event/token_count naming brand_new_top (the envelope judged) and its ledger row', driftCards(ce).length === 1 && driftCards(ce)[0].content[0].shape === 'event/token_count' && JSON.stringify(driftCards(ce)[0].content[0].fields) === '["brand_new_top"]' && ced.length === 1 && ced[0].shape === 'event/token_count' && JSON.stringify(ced[0].fields) === '["brand_new_top"]', { cards: driftCards(ce).map((m) => m.content[0]), ced });
  ce.processLive({ ...tc({ baz: 1 }), brand_new_top: 2 });
  ced = ledgerOf('test-shape-cx-env');
  ok('…a line with BOTH an envelope key and a payload field ⇒ still ONE card and ONE row per shape (the two verdicts merge: brand_new_top + info.baz), each judged exactly once (no duplicate field)', driftCards(ce).length === 1 && JSON.stringify(driftCards(ce)[0].content[0].fields) === '["brand_new_top","info.baz"]' && ced.length === 1 && JSON.stringify(ced[0].fields) === '["brand_new_top","info.baz"]', { cards: driftCards(ce).map((m) => m.content[0].fields), rows: ced.map((r) => r.fields) });
  const cr2 = new CodexMessageManager('test-shape-cx-ri');
  cr2.processLive({ timestamp: '2026-09-13T16:39:57.000Z', type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'hi' }] }, brand_new_top: 1 });
  ok('…the response_item twin flags the same key (parity between the two carriers)', driftCards(cr2).length === 1 && driftCards(cr2)[0].content[0].fields.includes('brand_new_top') && ledgerOf('test-shape-cx-ri').length === 1 && ledgerOf('test-shape-cx-ri')[0].fields.includes('brand_new_top'), { cards: driftCards(cr2).map((m) => m.content[0]), rows: ledgerOf('test-shape-cx-ri') });
  const cclean = new CodexMessageManager('test-shape-cx-clean');
  cclean.processLive(tc({}));
  ok('a clean event_msg line ⇒ no card, no ledger row (negative control for the envelope judgement)', driftCards(cclean).length === 0 && ledgerOf('test-shape-cx-clean').length === 0);
  ok('unknownFields kind envelope: judges ONLY the carrier keys (a payload field is not its business)', R.unknownFields('codex', 'rollout', { ...tc({ baz: 1 }), brand_new_top: 1 }, { kind: 'envelope' }).fields.join(',') === 'brand_new_top');
  global.__vsEvent = prevEv;
}

console.log('§2c the card policy\'s RED controls — a patched copy per rule (.276\'s field-growth hiding, no ledger write, no enum card) fails its leg');
{
  const M = mutantCopies('record-policy', REPO);
  const mmSrc = read('src/message-manager.js'), cxSrc = read('src/codex-message-manager.js');
  const gate = '    if (entry && !newFields.length && !newEnums.length) return;\n';
  const write = "    if (drift.fields.length) noteFieldDrift({ conversation: raw.session_id || raw.sessionId || this.sessionId,";
  const cxWrite = "    if (drift.fields.length) noteFieldDrift({ conversation: this._threadId || this.sessionId,";
  ok('the patch sites exist, once per normalizer (a control is meaningful only if its line does)', mmSrc.split(gate).length === 2 && cxSrc.split(gate).length === 2 && mmSrc.includes(write) && cxSrc.includes(cxWrite));
  const SIDC = 'e2e00000-0000-4000-8000-0000000000c1';
  const run = (MMx) => {
    const { createMessageManager: cm } = MMx === MM ? { createMessageManager } : { createMessageManager: (b, id) => new MMx.MessageManager(id) };
    const x = cm('claude', 'test-policy-ctl');
    x.processLive({ type: 'system', subtype: 'init', cwd: '/w', session_id: SIDC, uuid: 'u-pc1', model: 'm', permissionMode: 'default', claude_code_version: '2.1.296', grown_field: 1 });
    x.processLive({ type: 'system', subtype: 'vcs_state_changed', kind: 'squash', cwd: '/w', uuid: 'u-pc2', session_id: SIDC });
    const cardsOf = x.messages.filter((m) => m.noticeKind === 'unknown-fields');
    return { fieldCards: cardsOf.filter((m) => m.content[0].shape === 'system/init').length, enumCards: cardsOf.filter((m) => m.content[0].shape === 'system/vcs_state_changed').length, rows: ledgerOf(SIDC, MMx).length };
  };
  const real = run(MM);
  ok('the real normalizer: field growth ⇒ 1 card + 1 ledger row; an enum drift ⇒ 1 card (lane drift-card-restore: the card is the update signal)', real.fieldCards === 1 && real.rows === 1 && real.enumCards === 1, real);
  const hidden = require(M.write('src/message-manager.js', editAnchor(mmSrc, gate, '    if (!newEnums.length) return;\n', "src/message-manager.js"), 'hidden-276'));
  const hc = run(hidden);
  ok('CONTROL: a copy with .276\'s hiding restored (only an undeclared value draws a card) ⇒ the field leg goes RED (no system/init card; the enum card and the row stay)', hc.fieldCards === 0 && hc.enumCards === 1 && hc.rows === 1, hc);
  const noRow = require(M.write('src/message-manager.js', editAnchor(mmSrc, write, '    if (false) noteFieldDrift({ conversation: raw.session_id || raw.sessionId || this.sessionId,', "src/message-manager.js"), 'no-ledger'));
  const nr = run(noRow);
  ok('CONTROL: a copy that never writes the ledger ⇒ the ledger leg goes RED (0 rows — ⚙ Diagnostics would list nothing; the card alone stays)', nr.rows === 0 && nr.fieldCards === 1, nr);
  const noEnum = require(M.write('src/message-manager.js', editAnchor(mmSrc, gate, '    if (!newFields.length) return;\n', "src/message-manager.js"), 'no-enum-card'));
  const ne = run(noEnum);
  ok('CONTROL: a copy that drops the enum card ⇒ the enum leg goes RED (0 cards for the undeclared value)', ne.enumCards === 0, ne);
  // the codex twin, the same three-way rule
  const cxRun = (C, MMx) => { const x = new C('test-policy-cx-' + Math.random()); x.processLive({ timestamp: '2026-10-15T00:00:00.000Z', type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { total_tokens: 1 }, last_token_usage: { total_tokens: 1 }, model_context_window: 100, grown: 1 }, rate_limits: { limit_id: 'codex' } } }); return { cards: driftCards(x).length, rows: ledgerOf(x.sessionId, MMx).length }; };
  const cr = cxRun(CodexMessageManager, MM);
  ok('codex: field growth ⇒ 1 card + 1 ledger row (the shared ledger, harness Codex)', cr.cards === 1 && cr.rows === 1, cr);
  const cxHidden = require(M.write('src/codex-message-manager.js', editAnchor(cxSrc, gate, '    if (!newEnums.length) return;\n', "src/codex-message-manager.js"), 'cx-hidden-276')).CodexMessageManager;
  const co = cxRun(cxHidden, MM);
  ok('CONTROL: the codex copy with .276\'s hiding restored ⇒ RED (0 cards, the row alone)', co.cards === 0 && co.rows === 1, co);
}

// §2b OURS BY PREFIX (2.369.126 r2): the wrappers mint webui_* keys faster than any list —
// `webui_msg_id` on every codex user record was flagged as drift and pushed a red card into
// every queued send (test-queue-steer, heavy tier). The census below is grep-derived over the
// tree's writers, so the next key cannot regress either.
console.log('§2b every webui_* key the tree writes is OURS by prefix — never drift');
{
  const { execSync } = await import('node:child_process');
  const written = [...new Set(execSync("/usr/bin/grep -rhoE 'webui_[a-z_]+' data/bin server.js src --include='*.js' 2>/dev/null || true", { cwd: REPO, encoding: 'utf8', shell: '/bin/sh' }).split('\n').map((x) => x.trim()).filter(Boolean))].sort();
  ok(`census scope is non-vacuous (${written.length} webui_* keys written by the tree: ${written.join(' ')})`, written.length >= 8, written);
  const notOurs = written.filter((k) => !R.isOurs(k));
  ok(`every written webui_* key is OURS${notOurs.length ? ' — NOT: ' + notOurs.join(', ') : ''}`, notOurs.length === 0, notOurs);
  const payload = { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'one' }] };
  for (const k of written) payload[k] = 'x';
  const codexRec = { timestamp: '2026-09-21T00:00:00.000Z', type: 'response_item', payload };
  ok('a codex user record carrying EVERY written webui_* key judges as no drift', R.unknownFields('codex', 'rollout', codexRec) === null, R.unknownFields('codex', 'rollout', codexRec));
  const claudeRec = { type: 'user', uuid: 'u1', session_id: 's1', webui_msg_id: 'm1', webui_origin_note: 'n', message: { role: 'user', content: [{ type: 'text', text: 'hi' }] } };
  ok('a claude stream user record carrying webui_* keys judges as no drift', R.unknownFields('claude', 'stream', claudeRec) === null, R.unknownFields('claude', 'stream', claudeRec));
  { const nc = R.unknownFields('codex', 'rollout', { timestamp: '2026-09-21T00:00:00.000Z', type: 'response_item', payload: { ...payload, webui_future_key: 1, zzz_new_vendor_field: 1 } }); ok('NEGATIVE CONTROL: a vendor field beside a future webui_* key is still flagged, and the webui_* key is not', !!nc && nc.fields.join(',') === 'zzz_new_vendor_field', nc); }
}

console.log('§3 enum drift — an undeclared enum value is a card, and the handler still runs');
{
  const mm = createMessageManager('claude', 'test-shape-enum');
  // a running task (launch ack + task_started), then a task_notification with an UNDECLARED status
  mm.processLive({ type: 'assistant', uuid: 'a1', session_id: 's', message: { id: 'msg_1', role: 'assistant', model: 'claude-fable-5-1', content: [{ type: 'tool_use', id: 'toolu_e1', name: 'Agent', input: { description: 'census', prompt: 'go' } }] } });
  mm.processLive({ type: 'system', subtype: 'task_started', task_id: 'ag1', tool_use_id: 'toolu_e1', description: 'census', task_type: 'local_agent', uuid: 'u-ts', session_id: 's' });
  const card = mm.messages.find((m) => m.toolCallId === 'toolu_e1');
  ok('setup: the task card is running', card?.taskInfo?.status === 'running');
  mm.processLive({ type: 'system', subtype: 'task_notification', task_id: 'ag1', tool_use_id: 'toolu_e1', status: 'paused', output_file: '/w/o', summary: 's', uuid: 'u-tn', session_id: 's' });
  const c = driftCards(mm);
  ok('task_notification status:"paused" (not in {completed,failed,stopped,killed}) ⇒ an enum-drift card naming field + value', c.length === 1 && c[0].content[0].shape === 'system/task_notification' && JSON.stringify(c[0].content[0].enumDrift) === '[{"field":"status","value":"paused"}]', c.map((m) => m.content[0]));
  ok('…and the HANDLER still ran: the task card closed exactly as for a declared value', card.taskInfo.status === 'completed');
  ok('…no unknown-event card (the subtype is handled; only the value drifted)', unknownCards(mm).length === 0);
  const v = createMessageManager('claude', 'test-shape-enum2');
  v.processLive({ type: 'system', subtype: 'vcs_state_changed', kind: 'squash', cwd: '/w/proj', uuid: 'u-v', session_id: 's' });
  ok('vcs_state_changed kind:"squash" ⇒ an enum-drift card (the binary: "new kinds may be added — treat unknown like known")', driftCards(v).length === 1 && driftCards(v)[0].content[0].enumDrift[0].value === 'squash');
  const w = createMessageManager('claude', 'test-shape-enum3');
  w.processLive({ type: 'system', subtype: 'vcs_state_changed', kind: 'push', branch: 'main', cwd: '/w/proj', uuid: 'u-w', session_id: 's' });
  ok('…a declared value is silent (negative control)', driftCards(w).length === 0);
  const SIDX = 'e2e00000-0000-4000-8000-0000000000e4';
  const x = createMessageManager('claude', 'test-shape-enum4');
  x.processLive({ type: 'system', subtype: 'vcs_state_changed', kind: 'squash', cwd: '/w/proj', uuid: 'u-x', session_id: SIDX, also_grown: 1 });
  const xc = driftCards(x);
  ok('a record with BOTH an undeclared value and a new field ⇒ ONE card naming both (fields [also_grown], the value squash), the field also a ledger row', xc.length === 1 && xc[0].content[0].fields.join() === 'also_grown' && xc[0].content[0].enumDrift[0].value === 'squash' && ledgerOf(SIDX).length === 1 && ledgerOf(SIDX)[0].fields.join() === 'also_grown', { cards: xc.map((m) => m.content[0]), rows: ledgerOf(SIDX) });
}

// ── THE EXTRACTOR (§4a, §4) — moved verbatim to scripts/claude-cli-dump.mjs (lane cli-2-1-288-records) ──
import * as DUMP from './claude-cli-dump.mjs';
const { extractZodUnion, extractPermissionSentences, outcomeCensus, nestedOf, dumpDiff, dumpBinary, NESTED_FIELDS, NESTED_UNIONS, UNION_LITERAL_BOUND } = DUMP;
/** PURE (lane cli-2-1-307-records): a dump's / a binary's `nested` ({'<shape>.<field>': keys}) vs the nested specs of Rx — every
 *  key outside known ∪ ignored, every object with no spec or not read, NAMED. */
const nestedUndeclared = (Rx, nested) => Object.entries(nested).flatMap(([at, keys]) => {
  const cut = at.lastIndexOf('.'), sp = Rx.SHAPES['claude:stream:' + at.slice(0, cut)]?.nested?.[at.slice(cut + 1)];
  if (!sp) return ['NO SPEC ' + at];
  if (!Array.isArray(keys)) return ['UNREAD ' + at + ' (' + (keys && keys.error) + ')'];
  return keys.filter((f) => !sp.known.has(f) && !sp.ignored.has(f)).map((f) => 'UNDECLARED ' + at + '.' + f);
});

console.log('§4a the extractor on every spelling the minifier has used — a rename is FOLLOWED, a new form fails BY NAME');
{
  // Each fixture keeps the real bundle's layout (the lazy `p(()=>…)` wrapper, `.describe(…)` with braces
  // inside the string, a nested object, the envelope pair), shortened. 2.1.280 = `u(`/`R(`,
  // 2.1.281 = `d(`/`R(` + the MCP content-block `.extend(` trap copied from its bundle.
  const body = (o, l) => `Cz=p(()=>${o}({type:${l}("system"),subtype:${l}("compact_boundary"),compact_metadata:${o}({trigger:V(["manual","auto"]),pre_tokens:k().int()}).describe("a } inside a string, and ({ too"),logical_parent_uuid:_().optional(),uuid:_(),session_id:o()})),Hz=p(()=>${o}({type:${l}("system"),subtype:${l}("init"),cwd:o(),model:o(),uuid:_(),session_id:o()})),Jz=p(()=>${o}({type:${l}("tombstone"),message:C(ae()),uuid:_(),session_id:o()}))`;
  const EXPECT = { 'system/compact_boundary': 'compact_metadata,logical_parent_uuid,uuid,session_id', 'system/init': 'cwd,model,uuid,session_id', tombstone: 'message,uuid,session_id' };
  const same = (u) => Object.keys(EXPECT).every((k) => (u[k] || []).join(',') === EXPECT[k]);
  const f280 = extractZodUnion('var ' + body('u', 'R') + ';');
  ok('the 2.1.274–2.1.280 spelling `u({type:R(…)` — helpers read off the anchor, three shapes with their depth-1 keys (the string\'s braces skipped)', !f280.error && f280.helpers.map((h) => h.obj + '/' + h.lit).join() === 'u/R' && same(f280.union) && Object.keys(f280.union).length === 3, f280);
  const trap = ',gt=d({type:R("resource"),resource:Fe([G,D]),annotations:p.optional()}),St=QVt.extend({type:R("resource_link")}),w=Fe([E,L,_,St,gt])';
  const f281 = extractZodUnion('var ' + body('d', 'R') + trap + ';');
  ok('the 2.1.281 spelling `d({type:R(…)` — the same three shapes, helpers d/R', !f281.error && f281.helpers.map((h) => h.obj + '/' + h.lit).join() === 'd/R' && same(f281.union), f281);
  ok('…and `QVt.extend({type:R("resource_link")})` is NOT a shape (a method name ending in the helper\'s letter — the identifier guard)', !('resource_link' in f281.union) && 'resource' in f281.union, Object.keys(f281.union));
  const fNext = extractZodUnion('var ' + body('$q', 'Zt') + ';');
  ok('a FUTURE rename (`$q({type:Zt(…)` — `$` in a helper name escaped) is followed with no code change', !fNext.error && fNext.helpers[0].obj === '$q' && same(fNext.union), fNext);
  const fDotted = extractZodUnion('var ' + body('z.object', 'z.literal') + ';');
  ok('an unminified `z.object({type:z.literal(…)` bundle reads the same', !fDotted.error && same(fDotted.union), fDotted);
  const fNone = extractZodUnion('var Cz=p(()=>u({subtype:R("compact_boundary"),type:R("system"),uuid:_(),session_id:o()}));');
  ok('a form the extractor does not know (keys reordered) is an ERROR NAMING THE ANCHOR — never a silent 0 / 0 / 0', !!fNone.error && /NO ANCHOR/.test(fNone.error) && /compact_boundary/.test(fNone.error) && Object.keys(fNone.union).length === 0, fNone.error);
}

console.log('§4 the BINARY ORACLE — the installed claude\'s zod union vs the three lists + the declared shapes');
{
  const HANDLED = MM.HANDLED_SYSTEM_SUBTYPES, IGN = MM.KNOWN_IGNORED_SYSTEM_SUBTYPES, IGNT = MM.KNOWN_IGNORED_RECORD_TYPES;
  const UNSEEN = R.DECLARED_UPSTREAM_UNSEEN;
  // list hygiene needs no binary
  const both = [...HANDLED].filter((s) => IGN.has(s) || s in UNSEEN.system).concat([...IGN].filter((s) => s in UNSEEN.system));
  ok('no system subtype sits on two lists at once (HANDLED / KNOWN_IGNORED / DECLARED_UPSTREAM_UNSEEN are disjoint)', both.length === 0, both);
  ok('every DECLARED_UPSTREAM_UNSEEN entry carries a one-line disposition', Object.values(UNSEEN.system).concat(Object.values(UNSEEN.types)).every((d) => typeof d === 'string' && d.length > 12));
  const routeSrc = read('src/message-manager.js');
  const routeBody = routeSrc.slice(routeSrc.indexOf('_routeMessage(raw, emit) {'), routeSrc.indexOf('_processTombstone(raw, emit) {'));
  const cases = new Set([...routeBody.matchAll(/case '([a-z_-]+)':/g)].map((m) => m[1]));
  ok('the routed top-level types were read off _routeMessage (non-vacuous)', cases.has('system') && cases.has('user') && cases.has('result') && cases.size >= 8, [...cases]);
  const both2 = [...IGNT].filter((t) => cases.has(t) || t in UNSEEN.types).concat([...cases].filter((t) => t in UNSEEN.types));
  ok('no top-level type is both routed and ignored/unseen', both2.length === 0, both2);

  // B-5e52 (lane bl-tests-e, 2026-11-10 cli-records review): the oracle READ the binary but also RAN it — `claude --version` twice
  // here and once in claude-cli-dump's dumpBinary, on whatever binary it found (on a developer box the real CLI). The build is read
  // off the file now (versionOfBinary: the versions-dir name, else the bundle's VERSION stamp); a 0644 copy dumps the same.
  {
    // B-5e52 cure (a reader's should): ANY process spawn whose program is not a string literal (node itself, process.execPath,
    // aside) is a binary run — not only one spelled bin / real / claude; a RegExp's .exec( and comment lines are not spawns
    const SPAWN_RE = /(?<![.\w$])(?:execFileSync|execFile|execSync|exec|spawnSync|spawn)\(\s*(?=\S)(?!['"`]|process\.execPath\b)/;
    const runsBin = (src) => src.split('\n').some((l) => !/^\s*(?:\/\/|\*)/.test(l) && SPAWN_RE.test(l));
    const OLD_CALL = ['let ver = \'?\'; try { ver = execFile', 'Sync(bin, [\'--version\'], { encoding: \'utf8\' }); } catch { }'].join('');   // spelled in two pieces: this file is censused too
    ok('§4 B-5e52: no claude binary is RUN by this suite or by scripts/claude-cli-dump.mjs (no exec of the binary — the build is read off the file)', !runsBin(read('scripts/test-record-shape.mjs')) && !runsBin(read('scripts/claude-cli-dump.mjs')));
    ok('§4 B-5e52 NEG: the census sees the old call', runsBin(OLD_CALL));
    ok('§4 B-5e52 NEG: …and the shapes the old spelling missed (any program name, execFile, spawn — each planted from pieces)', ['execFile' + 'Sync(binary, [\'--version\'])', 'execFile' + '(realPath, [\'--version\'], cb)', 'spawn' + 'Sync(found, [\'-v\'])'].every(runsBin) && runsBin('exec' + '(cmd, cb)') && !runsBin('spawn' + 'Sync(') && !runsBin('execFile' + 'Sync(\'strings\', [\'-n\', \'8\', bin])') && !runsBin('spawn' + '(process.execPath, [script])') && !runsBin('re.exec' + '(text)'));
    let said = null; try { DUMP.dumpBinary(path.join(os.tmpdir(), 'vs-record-shape-no-such', 'claude'), [], { text: 'strings with no stamp' }); } catch (e) { said = e.message; }
    ok('§4 B-5e52: dumpBinary over a binary that names no build REFUSES by name — it never runs the file to ask (a missing file proves no run was tried)', /names no build/.test(String(said)), said);
    ok('§4 B-5e52: …and reads the build off a 0644 copy\'s stamp, or its versions-dir name', DUMP.versionOfBinary('/x/claude-copy', 'a VERSION:"2.1.322" b VERSION:"2.1.322"') === '2.1.322' && DUMP.versionOfBinary('/x/claude/versions/2.1.322', '') === '2.1.322');
  }
  // THE ORACLE'S ROAD TO A REAL CLAUDE (the coordinator's r2084, the hosted run 44980743210). Since f5a1eb87b (B-ba47 pick B) a re-homed
  // suite's PATH is BUILT — nothing of the handed PATH carried — and an agent CLI is reached ONLY through scripts/scratch.mjs
  // REAL_CLI_ALLOW: the oracle had run nowhere since. This suite is a row, FENCED: it reads the bytes ONLY of the program the hosted
  // runner's pin step installed (the runner's own mark, GITHUB_ACTIONS=true; the handed env's candidates). On a person's machine and
  // under VS_NO_REAL_CLI=1 it reads NO real install — a named skip. VIBESPACE_ORACLE_BINARY is a file named BY HAND (a 0644 copy of a
  // build, the kb's registration road): ONLY A PERSON'S OWN HAND SETS IT — no gate, kit or script does (the coordinator's r2215). It is
  // read with the switch off, and only where this suite is NOT re-homed (a home under a temp root, as a lane env's): on a person's
  // machine the re-home drops the name before this line reads it (scratch.mjs; its stderr line names it), so the road says so (r2225).
  // THE BINDING (r2225, the round's nice-to-have): the road is computed from exactly these three names — pinned below by a leg.
  const road = oracleRoad({ hosted: process.env.GITHUB_ACTIONS === 'true', noRealCli: process.env.VS_NO_REAL_CLI === '1', pinned: process.env.VIBESPACE_ORACLE_BINARY || null });
  const findBinary = () => oracleBinary(road, road.handed ? handedCliCandidates('claude') : []);
  // §4d THE CORRECTION'S CALL-SITE READER on made-up bundles — needs no binary (B-28b1's side run r1543; the real build, r2934)
  {
    const WW = 'The user doesn\'t want to proceed with this tool use.';
    const B314 = 'var Nh="' + WW + '",m9t=`${Nh} Correction to the text above: stopped while running.`;class Pq{createSyntheticErrorMessage(e,n,r,s){if(n==="user_interrupted"){let o=this.abortController.signal.reason;return cq({toolUseID:e,content:dq(s&&o==="remote-cancel"?m9t:Nh),assistantMessage:r})}return null}}function ql(e,n){if(!e)return!1;return e.callRunning===!0}x.createSyntheticErrorMessage(e.id,"user_interrupted",e.assistantMessage,ql(e));';
    // 2.1.328 AS THE HOSTED RUN READ IT (45112121215, evidence 7, 9, 10, 11): six parameters, the caller's six arguments, the helper's
    // two-parameter form, the content chain. The text past `content:w4(y?rHn:g&&(k==` was NOT in the evidence: spelled here as
    // `k==="remote-cancel")`, and the live leg now prints the whole chain so the next strict run shows it
    const B328 = 'var Bh="' + WW + '",nHn=`${Bh} Correction to the text above: stopped while running.`,rHn=`${Bh} Correction to the text above: files may have reached the connector.`;'
      + 'function Ka(e,o){let r=o?.type==="user"?o.toolDenialKind:void 0;return e.callRunning===!0&&(r===void 0||r==="interrupted")}'
      + 'class Wc{createSyntheticErrorMessage(e,o,r,g,y=!1,h=!1){if(o==="user_interrupted"){let k=Fi(this.toolUseContext.abortController.signal.reason),R=SC(this.toolUseContext);let w=this.tools.find((P)=>P.id===e),C=w!==void 0&&(w.callStarted!==!0||w.callRunning===void 0&&this.toolUseContext.toolDecisions?.get(e)?.decision==="reject");return He({content:[{type:"tool_result",content:w4(y?rHn:g&&(k==="remote-cancel")?nHn:Bh),is_error:!0,tool_use_id:e}]})}return null}}'
      + 'x.createSyntheticErrorMessage(e.id,"user_interrupted",e.assistantMessage,Ka(e),e.keepsOwnErrorAfterEsc,e.answered);';
    const C2 = [{ name: 'nHn', row: 'm9t' }, { name: 'rHn', row: 'rHn' }];
    const r314 = correctionSiteOf(B314, 'Nh', [{ name: 'm9t', row: 'm9t' }]), r328 = correctionSiteOf(B328, 'Bh', C2);
    ok('§4d the call-site reader on a made-up bundle in the 2.1.314 spelling: the signature (e,n,r,s), the chain dq(s&&…?m9t:Nh) — m9t under s (its 4th parameter), Nh the default — the caller ql(e), ql reading callRunning', r314.ok && r314.sig.params.join() === 'e,n,r,s' && r314.judged.length === 1 && r314.judged[0].param === 's' && r314.judged[0].held && r314.callerArg === 'ql' && r314.misses.length === 0, r314);
    ok('§4d …and 2.1.328 AS THE HOSTED RUN READ IT: six parameters (e,o,r,g,y,h), the chain w4(y?rHn:g&&(…)?nHn:Bh) — nHn under g (its 4th: the running helper), rHn under y (its 5th: the call keeps its own error after Esc), Bh the default — the caller\'s six arguments with e.keepsOwnErrorAfterEsc 5th, Ka(e,o) reading callRunning', r328.ok && r328.sig.params.join() === 'e,o,r,g,y,h' && r328.judged.map((j) => `${j.name}:${j.param}:${j.held}`).join() === 'nHn:g:true,rHn:y:true' && r328.callerArgs[4] === 'e.keepsOwnErrorAfterEsc' && r328.callerArg === 'Ka' && r328.misses.length === 0, r328);
    // stale-pins: kept — the a9751279e leg's three patterns, rebuilt for this control (fixed letters e,n,r,s / e.id / site[1] 's')
    const oldRead = (t, wwN) => { const site = new RegExp('content:[\\w$]+\\(([\\w$]+)&&([\\w$]+)==="remote-cancel"\\?([^]{0,400}?):' + csE(wwN) + '\\)').exec(t); return !!site && site[1] === 's' && /createSyntheticErrorMessage\(e,n,r,s\)\{if\(n==="user_interrupted"\)/.test(t) && /createSyntheticErrorMessage\(e\.id,"user_interrupted",e\.assistantMessage,([\w$]+)\(e\)\)/.test(t); };
    // stale-pins: kept — the 2f6a7255e reader's two closed forms, rebuilt: FOUR parameters and FOUR caller arguments (the run 45112121215 red)
    const fourOnly = (t) => new RegExp(`createSyntheticErrorMessage\\((${CS_ID}),(${CS_ID}),(${CS_ID}),(${CS_ID})\\)\\{if\\(\\2==="user_interrupted"\\)`).test(t) && new RegExp(`createSyntheticErrorMessage\\((${CS_ID})\\.id,"user_interrupted",\\1\\.assistantMessage,(${CS_ID})\\(\\1\\)\\)`).test(t);
    ok('§4d …RED CONTROLS: the a9751279e fixed-letter patterns read the 2.1.314 spelling only; the 2f6a7255e four-parameter forms read 2.1.314 and NOT 2.1.328 (the hosted run 45112121215 red, in its shapes)', oldRead(B314, 'Nh') && !oldRead(B328, 'Bh') && fourOnly(B314) && !fourOnly(B328));
    const mut = (from, to) => { if (!B328.includes(from)) throw new Error('§4d control: the made-up bundle no longer holds ' + from); return B328.replace(from, to); };
    const at = (m) => correctionSiteOf(m, 'Bh', C2);
    const noCorr = at(mut('w4(y?rHn:g&&(k==="remote-cancel")?nHn:Bh)', 'w4(y?Bh:g&&(k==="remote-cancel")?Bh:Bh)'));
    ok('§4d …RED: a chain that writes ww where the corrections stood (no correction a leaf) fails, naming each', !noCorr.ok && noCorr.misses.some((m) => /^nHn is not a leaf/.test(m)) && noCorr.misses.some((m) => /^rHn is not a leaf/.test(m)), noCorr);
    const nNoRun = at(mut('?rHn:g&&(k==="remote-cancel")', '?rHn:R&&(k==="remote-cancel")'));
    ok('§4d …RED: nHn\'s condition without the 4th parameter (the running helper) fails, by name', !nNoRun.ok && nNoRun.misses.some((m) => /^nHn's own condition does not hold g/.test(m)) && !nNoRun.misses.some((m) => /^rHn/.test(m)), nNoRun);
    const rRun = at(mut('w4(y?rHn:', 'w4(g?rHn:'));
    ok('§4d …RED: rHn\'s condition NOT the 5th parameter (the running flag in its place) fails, by name', !rRun.ok && rRun.misses.some((m) => /^rHn's own condition does not hold y/.test(m)), rRun);
    const swapArg = at(mut('Ka(e),e.keepsOwnErrorAfterEsc,e.answered)', 'Ka(e),e.answered,e.keepsOwnErrorAfterEsc)'));
    ok('§4d …RED: the caller\'s 5th argument not e.keepsOwnErrorAfterEsc (rHn\'s condition) fails, naming the argument', !swapArg.ok && swapArg.misses.some((m) => /^the caller's argument 5 is «e\.answered», not e\.keepsOwnErrorAfterEsc/.test(m)), swapArg);
    const noRun = at(mut('return e.callRunning===!0&&(', 'return e.status==="running"&&('));
    ok('§4d …RED: a helper without its running conjunct fails, naming it', !noRun.ok && !noRun.ran && noRun.misses.some((m) => /^Ka\(call\) = call\.callRunning === true/.test(m)), noRun);
    const far = at(mut('if(o==="user_interrupted"){', 'if(o==="user_interrupted"){return null}' + ';'.repeat(SITE_WINDOW) + '{'));
    ok('§4d …RED: a content chain outside the user_interrupted body (past ' + SITE_WINDOW + ' characters) is not its site', !far.ok && !far.site && far.misses.some((m) => /content:F/.test(m)), far);
    // r1682 (round wynbby0e0): the flag must be a POSITIVE conjunct — negated, or or-ed in, is a bundle where the law is FALSE
    const negated = at(mut('?rHn:g&&(', '?rHn:!g&&(')), ored = at(mut('?rHn:g&&(', '?rHn:g||('));
    ok('§4d …RED: nHn\'s flag NEGATED (`!g&&…`: written for a call that was NOT running) fails, and so does an «or» (`g||…`): the flag stands as a positive conjunct', !negated.ok && !ored.ok && negated.judged.find((j) => j.name === 'nHn').held === false && ored.judged.find((j) => j.name === 'nHn').held === false, { negated, ored });
    ok('§4d …and a positive conjunct in any place, any shape, is the flag: `l==="remote-cancel"&&c`, `(c)&&…`, `!!c&&…`, `c===!0&&…`, after a comma', ['l==="remote-cancel"&&c', '(c)&&l==="remote-cancel"', '!!c&&l==="remote-cancel"', 'c===!0&&l==="remote-cancel"', 'x,c&&l==="remote-cancel"'].every((cnd) => flagConjunct(cnd, 'c')) && !['!c&&l', 'c||l', 'l??c', 'ac&&l', 'x.c&&l', 'c,l'].some((cnd) => flagConjunct(cnd, 'c')));
    const third = correctionSiteOf(mut('?nHn:Bh)', '?nHn:k===1?zzz:Bh)'), 'Bh', [...C2, { name: 'zzz', row: 'zz9' }]);
    ok('§4d …RED: a correction whose row has no CORRECTION_CONDITION fails by name (a new build\'s third correction is named, never passed)', !third.ok && third.misses.some((m) => /^zzz \(row zz9\) has no CORRECTION_CONDITION row/.test(m)), third);
    const arrow = at(mut('function Ka(e,o){let r=o?.type==="user"?o.toolDenialKind:void 0;return e.callRunning===!0&&(r===void 0||r==="interrupted")}', 'Ka=(e,o)=>{let r=o?.type==="user"?o.toolDenialKind:void 0;return e.callRunning===!0&&(r===void 0||r==="interrupted")};'));
    const inline = at(mut('e.assistantMessage,Ka(e),e.keepsOwnErrorAfterEsc', 'e.assistantMessage,e.callRunning===!0,e.keepsOwnErrorAfterEsc'));
    ok('§4d …and the helper as an arrow, or the running read inline as the 4th argument, is read too', arrow.ok && inline.ok && inline.callerArg === 'e.callRunning===!0', { arrow, inline });
    ok('§4d …the chain parser keeps strings, brackets, `?.` and `??` whole: a ternary inside a call and a string holding «?» and «:» stay one leaf\'s condition', JSON.stringify(chainLeaves('a?.b??c?f(x?1:2):"q?:r"').map((l) => [l.leaf, l.path.map((p) => p.cond + (p.truth ? '+' : '-'))])) === JSON.stringify([['f(x?1:2)', ['a?.b??c+']], ['"q?:r"', ['a?.b??c-']]]));
    const ev = correctionEvidence(B328, C2.map((c) => c.name)), none = correctionEvidence('var nHn=`x`;', ['nHn']);
    ok('§4d …a red carries THE BUNDLE\'S OWN TEXT: one excerpt per USE of each correction (never its declaration), createSyntheticErrorMessage( and callRunning===, each at most 300 characters; a correction never used says NONE', ev.filter((l) => /^a use of nHn @/.test(l)).length === 1 && ev.filter((l) => /^a use of rHn @/.test(l)).length === 1 && ev.filter((l) => /^createSyntheticErrorMessage\( @/.test(l)).length === 2 && ev.some((l) => /^callRunning=== @/.test(l)) && ev.every((l) => JSON.parse(l.slice(l.indexOf(': ') + 2)).length <= 300) && /^a use of nHn: NONE/.test(none[0]), ev);
    const me = read('scripts/test-record-shape.mjs'); // the needles in two pieces: this pin's own line never matches itself
    ok('§4d …the live leg reads the installed bundle through this reader with each correction\'s ROW, prints the WHOLE chain, and on a red the evidence to STDERR (the runner shows a red suite\'s stderr whole)', me.includes('const cs = correction' + 'SiteOf(text, sw ? sw.name : null, corrRows);') && me.includes('if (!good) for (const [k, l] of correction' + 'Evidence(text, corr.map((x) => x.name)).entries()) console.error(') && me.includes('the content chain, as the bundle ' + 'has it'));
  }
  const bin = findBinary();
  const size = bin ? fs.statSync(bin).size : 0;
  // the installed BUILD vs the build the shapes were dumped from (src/record-shape.js SCHEMA_CLI_VERSION): STRICT wherever the
  // oracle runs. The Actions mirror once installed whatever npm served that day (2.1.278 on 2026-09-21 vs the pinned 2.1.274) and
  // printed a newer build's drift as skips; since B-28b1 (1) it installs the tree's pin, and since r1682 a hosted build that is
  // not the pin is RED (hostedPinWhy), never lenient.
  const pinned = process.env.VIBESPACE_ORACLE_PINNED || R.SCHEMA_CLI_VERSION;
  // B-5e52 (lane bl-tests-e): the oracle READS the binary, never runs it — the build is the versions-dir name, else the bundle's
  // own VERSION stamp (scripts/claude-cli-dump.mjs versionOfBinary); its strings are read ONCE, here and for §4 below
  let binText = null;
  const binTextOf = () => { if (binText === null) { try { binText = execFileSync('strings', ['-n', '8', bin], { maxBuffer: 1024 * 1024 * 1024, encoding: 'latin1' }); } catch { try { binText = fs.readFileSync(bin, 'latin1'); } catch { binText = ''; } } } return binText; };
  const installed = !bin ? null : (DUMP.versionOfBinary(bin, null) || (size >= 4 * 1024 * 1024 ? DUMP.versionOfBinary(bin, binTextOf()) : null));
  // ON A HOSTED RUN THE INSTALLED BUILD IS THE PIN, or the suite is RED (the coordinator's r1682, round wynbby0e0). The lenient branch
  // (a newer build's drift printed, not red) was for the mirror before B-28b1 (1); every hosted job installs the tree's pin since, so a
  // build that is not it is a failed pin step, a claude that shadows it on PATH, or no binary at all — never a skip.
  const hostedWhy = road.handed ? hostedPinWhy({ hosted: true, bin, size, installed, pinned }) : null;
  if (process.env.GITHUB_ACTIONS === 'true' && !road.handed) console.log(`  §4 the hosted runner under VS_NO_REAL_CLI=1 (its other major's job): the oracle reads no install here — the Node 22 job reads the pin`);
  if (road.handed) ok(`§4 the hosted runner's claude IS the tree's pin: installed ${installed || '(none)'}, pinned ${pinned} (B-28b1, r1682: never lenient)`, !hostedWhy, hostedWhy);
  {
    // THE FENCE (r2084): a planted program on the handed path is NOT read under the switch, nor off the runner; on the runner it is
    const plantDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-oracle-fence-')), planted = path.join(plantDir, 'claude');
    try {
      fs.writeFileSync(planted, 'a planted program, never a real install\n');
      const at = (o) => oracleBinary(oracleRoad(o), [planted]);
      const underSwitch = at({ hosted: true, noRealCli: true }), offRunner = at({ hosted: false, noRealCli: false }), onRunner = at({ hosted: true, noRealCli: false });
      const byHand = at({ hosted: false, noRealCli: false, pinned: planted }), byHandSwitch = at({ hosted: false, noRealCli: true, pinned: planted });
      ok('§4 THE FENCE (r2084): a planted program on the handed path is NOT read under VS_NO_REAL_CLI=1 (even on the runner), nor off the hosted runner; a file named by hand is read off the runner but never under the switch',
        underSwitch === null && offRunner === null && byHandSwitch === null && byHand === fs.realpathSync(planted), { underSwitch, offRunner, byHand, byHandSwitch });
      ok('§4 …CONTROL: on the hosted runner, with the switch off, the SAME planted program IS read (so the nulls above are the fence\'s, not a file that could not be read)', onRunner === fs.realpathSync(planted), { onRunner });
      ok('§4 …and the road says why it is shut, by name (the switch; a person\'s machine)', /VS_NO_REAL_CLI=1/.test(oracleRoad({ hosted: true, noRealCli: true }).why) && /never read/.test(oracleRoad({ hosted: false, noRealCli: false }).why));
      // THE BINDING (r2225): the live road is computed from EXACTLY the runner's mark, the switch and the by-hand name — an edit such as
      // `hosted: !!process.env.CI` is red here (the needle in two pieces: this pin's own line never matches itself)
      const me = fs.readFileSync(new URL(import.meta.url), 'utf8');
      ok('§4 …the live road reads exactly GITHUB_ACTIONS === \'true\', VS_NO_REAL_CLI === \'1\' and VIBESPACE_ORACLE_BINARY (one binding, in this file)', me.split('const road = oracle' + "Road({ hosted: process.env.GITHUB_ACTIONS === 'true', noRealCli: process.env.VS_NO_REAL_CLI === '1', pinned: process.env.VIBESPACE_ORACLE_BINARY || null });").length === 2);
    } finally { fs.rmSync(plantDir, { recursive: true, force: true }); }
  }
  {
    const H = (o) => hostedPinWhy({ hosted: true, bin: '/x/claude', size: 200 * 1024 * 1024, installed: '2.1.328', pinned: '2.1.328', ...o });
    ok('§4 the hosted verdict (PURE): the pin is green; another build, a shim, no binary and an unread build are each RED by name; off a hosted run it judges nothing',
      H({}) === null && /2\.1\.330 is not the pin 2\.1\.328/.test(H({ installed: '2.1.330' })) && /a launcher\/shim/.test(H({ size: 900 })) && /no claude binary/.test(H({ bin: null })) && /build could not be read/.test(H({ installed: null })) && hostedPinWhy({ hosted: false, bin: null, size: 0, installed: null, pinned: '2.1.328' }) === null);
  }
  console.log(`  installed claude ${installed || '(unknown)'} vs pinned schema ${pinned} — STRICT`);
  // B-28b1 (the coordinator's r238): the oracle's MODE rides the suite's CLOSING line too — the line a run's summary shows
  ORACLE_MODE = !bin || size < 4 * 1024 * 1024 ? 'no binary (the binary oracle did not run)' : `STRICT on ${installed || '(unknown)'} (pinned ${pinned})${installed !== pinned ? ' — NOT THE PIN' : ''}`;
  const oracleOk = ok;   // r1682: every oracle leg is strict wherever it runs (the hosted verdict above names a build that is not the pin)
  if (!bin || size < 4 * 1024 * 1024) {
    skip('binary oracle', bin ? `${bin} is ${size} bytes — a launcher/shim, not the CLI binary (install the native build to run this leg)` : road.open ? 'no claude binary on the road (the handed env / VIBESPACE_ORACLE_BINARY)' : road.why);
  } else {
    // THE EXTRACTOR (§4a): the helper names read off the anchor, never spelled. `strings` keeps memory
    // sane on a 230 MB ELF; the raw latin1 read is the fallback.
    let text = binTextOf(); binText = ''; // the read above (B-5e52), held once
    const { union, helpers, error: exErr, unclosed: liveUnclosed } = extractZodUnion(text);
    // lane cli-2-1-319-records r2 (round-1 acceptance, D2): the gate a new CLI hits FIRST. A literal the walker cannot read is a shape no leg below can judge — its
    // fields would pass unseen (a mutant with the bound at 50 000 and a FIELDS_319 row removed left every live leg green on 2.1.319)
    oracleOk('§4 the walker read every object literal in the installed bundle (UNION_LITERAL_BOUND ' + UNION_LITERAL_BOUND + ') — one it cannot read FAILS HERE, named, never a shape that quietly went', !liveUnclosed, { UNCLOSED: liveUnclosed });
    // §4d THE PERMISSION-OUTCOME SENTENCE CENSUS (lane S1 verify r5) — while the dump is still in memory
    {
      const PO = require(path.join(REPO, 'src/permission-outcome.js'));
      const cen = extractPermissionSentences(text);
      oracleOk('§4d the sentence extractor found its anchor (the interrupt marker), the tool_result list and the exact is_error set in the installed bundle (a moved list fails HERE, by name)', !cen.error, cen.error);
      if (!cen.error) {
        console.log(`    §4d permission sentences: anchor ${cen.anchor} · list ${cen.list}() · set ${cen.set} · ${cen.sentences.length} resolved (${cen.sentences.map((x) => x.name).join(',')}) · suffixes ${cen.suffixes.join(',') || '(none)'} · unresolved ${cen.unresolved.join('; ') || '(none)'}`);
        oracleOk(`§4d every member of both lists resolves to ONE sentence (${cen.sentences.length} — the 2.1.281 census is 13 + the user-message marker the set adds)`, cen.unresolved.length === 0 && cen.sentences.length >= 14, cen.unresolved);
        // a row a NEWER build added (its `since` past the installed build — 2.1.314's m9t on a 2.1.312 box) is excused, printed by name,
        // exactly as SHAPE_SINCE excuses a shape (lane cli-2-1-314-records); the forward leg (an unclassified sentence) stays strict
        const sinceCmp = (a, b) => { const pa = String(a).replace(/^≤/, '').split('.').map(Number), pb = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0); return 0; };
        const rowsHere = PO.PERMISSION_OUTCOME_ROWS.filter((r) => !(installed && sinceCmp(r.since, installed) > 0));
        if (rowsHere.length < PO.PERMISSION_OUTCOME_ROWS.length) console.log(`    §4d rows excused as newer than the installed ${installed}: ${PO.PERMISSION_OUTCOME_ROWS.filter((r) => !rowsHere.includes(r)).map((r) => r.id + ' (' + r.since + ')').join(', ')}`);
        const { unclassified, ghosts } = outcomeCensus(cen.sentences, rowsHere, text);
        oracleOk(`§4d every sentence the binary writes for a permission outcome is a ROW of src/permission-outcome.js (${cen.sentences.length} checked) — a newer build's extra sentence FAILS HERE, named, until classified`, unclassified.length === 0, 'UNCLASSIFIED: ' + unclassified.join(' · '));
        oracleOk('§4d no GHOST row: every list-backed row is in the binary\'s lists and every literal row is spelled in the bundle (the WebFetch deadline, the conversation-ended and streaming-fallback results)', ghosts.length === 0, 'GHOST: ' + ghosts.join(', '));
        oracleOk('§4d the census names the installed build it was read from (PERMISSION_OUTCOME_CLI_VERSION = SCHEMA_CLI_VERSION)', PO.PERMISSION_OUTCOME_CLI_VERSION === R.SCHEMA_CLI_VERSION, PO.PERMISSION_OUTCOME_CLI_VERSION);
        // NEGATIVE CONTROLS on the real census: one planted sentence is named; one row removed is named
        // the .320 mirror: on a DRIFTED build (newer than every pinned dump) the base census is not clean (new sentences, moved
        // names), so a control that adds or removes ONE row has no clean arithmetic to stand on — it proves nothing. The two
        // negative controls run only on a clean base; elsewhere they SKIP with the drift as the evidence (and on the mirror
        // they are informational like the census itself)
        const cleanBase = unclassified.length === 0 && ghosts.length === 0;
        const ctl = cleanBase ? oracleOk : (n, c, e) => skip(n, 'the base census is not clean on this build — a control over a drifted census proves nothing: ' + JSON.stringify({ unclassified, ghosts }).slice(0, 300));
        const planted = cen.sentences.concat([{ name: 'zz9', from: 'Gd', text: '[Tool call refused: the safety classifier declined it after your approval — a sentence a future build invented]' }]);
        const pv = outcomeCensus(planted, rowsHere, text);
        ctl('…NEGATIVE CONTROL: the real lists plus ONE planted sentence fail the classification leg naming exactly it', pv.unclassified.length === unclassified.length + 1 && pv.unclassified.some((x) => /^zz9 = .*safety classifier declined it/.test(x)) && pv.ghosts.length === ghosts.length, pv);
        const fewer = rowsHere.filter((r) => r.id !== 'hL');
        const fv = outcomeCensus(cen.sentences, fewer, text);
        ctl('…NEGATIVE CONTROL: the table without the SUBAGENT\'s denial row (the r5 finding) fails the same leg naming that sentence', fv.unclassified.length === unclassified.length + 1 && fv.unclassified.some((x) => /Permission for this tool use was denied/.test(x)), fv);
        // the extractor's own controls: a synthetic bundle in the 2.1.281 spelling, a reused name elsewhere, a missing anchor / list
        const mini = 'var Jw="[Request interrupted by user]",Ud="[Request interrupted by user for tool use]",ok="[Tool call did not complete: the turn was ended.]",pb="The user doesn\'t want to take this action right now.",u4e=`\nNote: a suffix`;\nvar ok="tengu_worker_owner_rows_killswitch_reused_name";\nvar ww="The user doesn\'t want to proceed with this tool use. Rejected.",Dx=`The user doesn\'t want to proceed with this tool use. The user said:\nfeedback`;\nvar If=new Set([Jw,Ud]);function Gd(){return[ww,Dx,pb,Ud,ok]}function Hd(e){return Gd().some((r)=>n.startsWith(r))}\nvar IS=new Set([Jw,Ud,ok,pb,pb+u4e,ww,ww+u4e]);';
        const mc = extractPermissionSentences(mini);
        ok('§4d the extractor on a synthetic 2.1.281-shaped bundle: names read off the anchor, the LARGEST marker set taken (a two-member If is not the census), the reused `ok` elsewhere ignored (its line declares no other member), a template literal ends at its line, the suffix named, from = Gd | IS | both', !mc.error && mc.list === 'Gd' && mc.set === 'IS' && mc.suffixes.join() === 'u4e' && mc.sentences.length === 6 && mc.sentences.find((x) => x.name === 'ok').text.startsWith('[Tool call did not complete') && mc.sentences.find((x) => x.name === 'Dx').text === "The user doesn't want to proceed with this tool use. The user said:" && mc.sentences.find((x) => x.name === 'Jw').from === 'IS' && mc.sentences.find((x) => x.name === 'Dx').from === 'Gd' && mc.sentences.find((x) => x.name === 'Ud').from === 'both', mc);
        ok('§4d …and a bundle without the anchor / without the list fails BY NAME', /NO ANCHOR/.test(extractPermissionSentences('var x="nothing here";').error) && /NO LIST/.test(extractPermissionSentences('var Ud="[Request interrupted by user for tool use]";').error));
        // THE CORRECTION'S WRITER (lane cli-2-1-314-records): where this build has the stopped-while-running sentence, it is written ONLY for
        // a RUNNING call a stream-json Stop cut off — createSyntheticErrorMessage("user_interrupted") picks it over ww when the abort reason
        // is remote-cancel AND its 4th argument holds, the caller's ql(call) = `call.callRunning === true`; read off the installed bundle.
        // 2.1.328 AS IT REALLY IS (r2934, read on the hosted run 45112121215): six parameters, and the content a chain in which EACH
        // correction has its OWN condition — m9t's text (nHn) under the 4th (the running helper), rHn under the 5th (the call keeps its own
        // error after Esc). CORRECTION_CONDITION holds the condition by row; a correction with no row there is red by name.
        {
          // B-9ff2 step 3 (the coordinator's r180): ANY NUMBER of corrections — 2.1.328 has two (nHn = m9t's text, and rHn: «… files it sends
          // may have reached the connector»), both ww's sentence + « Correction to the text above». Each is found by its CONTENT and judged
          // by THE row of its own text (never «the» first one); the pick may name them all in its remote-cancel branch, in any shape
          // (a ternary inside it included), with ww the other branch — and the call site read is PRINTED, so a red says what the bundle has.
          const WWR = PO.PERMISSION_OUTCOME_ROWS.find((r) => r.id === 'ww');
          const sw = cen.sentences.find((x) => x.text === WWR.text), corr = cen.sentences.filter((x) => x.text !== WWR.text && x.text.startsWith(WWR.text + ' Correction to the text above'));
          if (!corr.length) console.log('    §4d the stopped-while-running sentence: not in this build (row m9t since ' + ((PO.PERMISSION_OUTCOME_ROWS.find((r) => r.id === 'm9t') || {}).since || '—') + ')');
          else {
            const rowsOf = corr.map((x) => { const r = PO.PERMISSION_OUTCOME_ROWS.find((y) => y.text === x.text); return [x.name, r ? r.id + ' ' + r.outcome : 'NO ROW']; });
            // r2934: each correction judged by the ROW of its own text (CORRECTION_CONDITION), never one condition for all
            const corrRows = corr.map((x) => ({ name: x.name, row: (PO.PERMISSION_OUTCOME_ROWS.find((y) => y.text === x.text) || {}).id || null }));
            const cs = correctionSiteOf(text, sw ? sw.name : null, corrRows);
            const said = cs.sig ? `createSyntheticErrorMessage(${cs.sig.params.join(',')})` : 'createSyntheticErrorMessage(?)';
            console.log(`    §4d the content chain, as the bundle has it: ${cs.site ? JSON.stringify(cs.site.text.slice(0, 600)) : 'NOT FOUND'} · ${said} · caller ${cs.caller ? JSON.stringify(cs.caller.slice(0, 200)) : 'NOT FOUND'} · ${cs.judged.map((j) => `${j.name} (row ${j.row}) under ${j.param || '?'}: ${j.held ? 'held' : 'NOT held'}`).join(' · ')} · rows ${rowsOf.map(([n, r]) => n + ' → ' + r).join(', ')}`);
            if (cs.site) console.error(`    §4d the content chain, as the bundle has it (not a leg; whole, up to 600 characters): ${JSON.stringify(cs.site.text.slice(0, 600))}`);
            const good = !!sw && cs.ok && rowsOf.every(([, r]) => / stopped$/.test(r));
            const conds = corrRows.map((c) => `${c.name} (row ${c.row}) under ${(CORRECTION_CONDITION[c.row] || {}).words || 'NO CONDITION ROW'}`).join('; ');
            oracleOk(`§4d the ${corr.length} correction(s) ${corr.map((x) => x.name).join(', ')} are written ONLY in the user_interrupted branch of ${said} (a person's Stop), each under ITS OWN condition — ${conds} — ${sw ? sw.name : 'ww'} the default; the caller hands ${cs.callerArgs.length ? cs.callerArgs.join(', ') : '?'}; and each is the table's row of ITS OWN text, outcome stopped (never denied); every local name read, none spelled`,
              good, { misses: cs.misses, chain: cs.chain ? cs.chain.slice(0, 300) : null, judged: cs.judged.map((j) => ({ name: j.name, row: j.row, param: j.param, held: j.held })), wwDefault: cs.wwDefault, rowsOf, sig: cs.sig ? cs.sig.params : null, caller: !!cs.caller, ran: cs.ran, evidence: 'the bundle\'s own text: on stderr, «§4d evidence» lines and the whole content chain' });
            if (!good) for (const [k, l] of correctionEvidence(text, corr.map((x) => x.name)).entries()) console.error(`    §4d evidence ${k + 1} (not a leg; the bundle's own text where the reader looked) — ${l}`);
          }
        }
      }
    }
    const nb = nestedOf(text, helpers); // the nested objects, read while the dump is still in memory (lane cli-2-1-307-records)
    // THE REMOTE-TRANSPORT GATE (lane claude-steer-inject r3): inherited_asks_settled is DECLARED_UPSTREAM_UNSEEN because 2.1.312 writes
    // it only behind `reportKept`, and every `reportKept:` the bundle computes is `…isRemoteTransport()&&…` (the stdio transport's
    // isRemoteTransport() is `return!1`) — read off the installed bundle, so a build that drops the gate fails HERE, by name
    {
      const writer = text.includes('subtype:"inherited_asks_settled",kept_request_ids:');
      // every site that COMPUTES reportKept (a bare identifier is the writer's own destructured parameter, `{…,reportKept:y}`)
      const gates = [...text.matchAll(/reportKept:([^,}]{0,160})/g)].map((m) => m[1]).filter((g) => !/^[A-Za-z_$][\w$]*$/.test(g));
      const words = /subtype:[A-Za-z_$][\w$]*\("inherited_asks_settled"\)[^]{0,400}?\.describe\("@internal A cloud worker's report, before its first turn, of which asks it inherited and keeps\. Any ask stored before this event that it does not name is over\."\)/.test(text);
      if (!writer && !/inherited_asks_settled/.test(text)) console.log('    inherited_asks_settled: not in this build (SHAPE_SINCE ' + R.SHAPE_SINCE['system/inherited_asks_settled'] + ')');
      else oracleOk(`inherited_asks_settled is written only behind reportKept, and every reportKept the bundle computes is gated on isRemoteTransport() (${gates.length} site${gates.length === 1 ? '' : 's'}: ${gates.map((g) => g.slice(0, 70)).join(' · ')}) — the stdio stream-json the wrapper speaks never carries it; the record's own words: «A cloud worker's report, before its first turn, of which asks it inherited and keeps»`, writer && words && gates.length >= 1 && gates.every((g) => /\.isRemoteTransport\(\)&&/.test(g)) && /isRemoteTransport\(\)\{return!1\}/.test(text), { writer, words, gates });
    }
    // THE INIT'S CLIENT UUIDS (lane claude-steer-inject r5): the bundle's own init writer adds user_message_uuids
    // (`e.subtype==="init"?<fn>(e,n):e` over `{...e,user_message_uuids:r.user_message_uuids}`) — where it is, the corpus row must be
    {
      const I = '[\\w$]+';
      // anchored on the literal (a regex over the whole bundle costs a second): the writer, then the init dispatch beside it
      const near = []; for (let at = text.indexOf('.user_message_uuids}}catch'); at >= 0 && near.length < 8; at = text.indexOf('.user_message_uuids}}catch', at + 1)) near.push(text.slice(Math.max(0, at - 160), at + 260));
      const initUuids = near.some((w) => new RegExp('\\{\\.\\.\\.' + I + ',user_message_uuids:' + I + '\\.user_message_uuids\\}').test(w) && new RegExp(I + '\\.subtype==="init"\\?' + I + '\\(' + I + ',' + I + '\\):' + I + '\\}').test(w));
      if (!initUuids) console.log('    init.user_message_uuids: no init writer in this build (the row is keyed to ' + R.INIT_UUIDS_MEASURED.join(' / ') + ')');
      else oracleOk('this build\'s init writer adds user_message_uuids (a stamped frame\'s uuid) — the registry declares it on system/init (' + (R.INIT_UUIDS_MEASURED.includes(installed) ? 'MEASURED on ' + installed : 'a build the row was not run on: ' + installed) + ')', R.SHAPES['claude:stream:system/init'].ignored.has('user_message_uuids'));
    }
    text = '';
    oracleOk('the extractor found the union\'s anchor in the installed bundle (a new spelling fails HERE, by name)', !exErr, exErr);
    const keys = Object.keys(union);
    const sys = keys.filter((k) => k.startsWith('system/')).map((k) => k.slice(7));
    const EXPLICIT = new Set(['user', 'transcript_mirror', 'control_request', 'control_response', 'control_cancel_request', 'keep_alive', 'update_environment_variables', 'result', 'result/success']);
    const recs = keys.filter((k) => !k.startsWith('system/') && ((union[k].includes('uuid') && union[k].includes('session_id')) || EXPLICIT.has(k)));
    const types = [...new Set(recs.map((k) => k.replace(/\/.*$/, '')))];
    const ver = installed || '?'; // B-5e52: read off the binary, never `--version`
    console.log(`    binary ${bin} (${(size / 1048576).toFixed(0)} MB, ${ver}) · helpers ${helpers.map((h) => h.obj + '/' + h.lit + ' @' + h.anchor).join(', ') || '(none)'} · union ${keys.length} shapes · ${sys.length} system subtypes · ${types.length} stream record types`);
    oracleOk('the extractor read a plausible union (≥ 40 system subtypes, ≥ 25 stream types — the design\'s 2.1.274 census said 51 / 34; this extractor reads 51 / 35 on 2.1.274 and 2.1.280, 52 / 35 on 2.1.281)', sys.length >= 40 && types.length >= 25, { sys: sys.length, types: types.length });
    const missSys = sys.filter((s) => !HANDLED.has(s) && !IGN.has(s) && !(s in UNSEEN.system));
    oracleOk(`every binary system subtype is on exactly one list (${sys.length} checked) — a new one FAILS HERE, named`, missSys.length === 0, 'UNLISTED: ' + missSys.join(', '));
    const missT = types.filter((t) => !cases.has(t) && !IGNT.has(t) && !(t in UNSEEN.types));
    oracleOk(`every binary stream record type is routed, declared-ignored or declared-unseen (${types.length} checked)`, missT.length === 0, 'UNLISTED: ' + missT.join(', '));
    // declared shapes: binary fields − envelope ⊆ known ∪ ignored
    const env = R.ENVELOPES['claude:stream'];
    const undeclared = (u) => {
      const out = [];
      let n = 0;
      for (const k of Object.keys(u)) {
        const shape = 'claude:stream:' + (k === 'result/success' ? 'result' : k);
        const spec = R.SHAPES[shape];
        if (!spec) continue;
        n++;
        for (const f of u[k]) if (!env.has(f) && !spec.known.has(f) && !spec.ignored.has(f) && !R.isOurs(f)) out.push(shape + '.' + f);
      }
      return { viol: out, checked: n };
    };
    const { viol, checked } = undeclared(union);
    oracleOk(`every declared claude stream shape's binary field set ⊆ known ∪ ignored (${checked} shapes, incl. the result union)`, viol.length === 0 && checked >= 60, viol.length ? 'UNDECLARED: ' + viol.join(', ') : { checked });
    // …NEGATIVE CONTROL on the real union: one planted field on one declared shape is named by the same leg
    const planted = { ...union, 'system/init': [...(union['system/init'] || []), 'planted_drift_field'] };
    const pv = undeclared(planted).viol;
    ok('…NEGATIVE CONTROL: the real union with ONE planted field on system/init fails that leg, naming exactly it', pv.length === viol.length + 1 && pv.includes('claude:stream:system/init.planted_drift_field'), pv);
    // …and ONE LEVEL DOWN (lane cli-2-1-307-records): each nested object record-shape judges, read off this binary (nestedOf)
    const nviol = nestedUndeclared(R, nb);
    oracleOk(`every NESTED object's binary field set ⊆ known ∪ ignored (${Object.keys(nb).length} objects: ${Object.keys(nb).join(', ')})`, nviol.length === 0 && Object.keys(nb).length === NESTED_FIELDS.length, nviol.length ? nviol.join(', ') : { objects: Object.keys(nb).length });
    // reverse: no dead list entry, no declared stream shape the binary does not have. A row a NEWER build
    // declared (R.SHAPE_SINCE) is excused on an older installed build — printed, never silent.
    const verCmp = (a, b) => { const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0); } return 0; };
    const newer = (k) => !!(installed && R.SHAPE_SINCE[k] && verCmp(R.SHAPE_SINCE[k], installed) > 0);
    const excused = Object.keys(R.SHAPE_SINCE).filter(newer);
    if (excused.length) console.log(`    excused as newer than the installed ${installed}: ${excused.map((k) => k + ' (' + R.SHAPE_SINCE[k] + ')').join(', ')}`);
    const bsys = new Set(sys);
    const dead = [...HANDLED, ...IGN, ...Object.keys(UNSEEN.system)].filter((s) => !bsys.has(s) && !(s in R.CORPUS_ONLY_SUBTYPES) && !newer('system/' + s));
    oracleOk('no DEAD system-subtype entry (every list name is in the binary or on CORPUS_ONLY_SUBTYPES with a note)', dead.length === 0, 'DEAD: ' + dead.join(', '));
    const bt = new Set(types);
    const deadT = Object.keys(UNSEEN.types).filter((t) => !bt.has(t) && !newer(t));
    oracleOk('no DEAD declared-unseen top-level type', deadT.length === 0, 'DEAD: ' + deadT.join(', '));
    const bkeys = new Set(keys.map((k) => (k === 'result/success' ? 'result' : k)));
    const ghost = Object.keys(R.SHAPES).filter((s) => s.startsWith('claude:stream:')).map((s) => s.slice(14)).filter((k) => !bkeys.has(k) && !newer(k));
    oracleOk('every declared claude STREAM shape exists in the binary union (no ghost shape)', ghost.length === 0, 'GHOST: ' + ghost.join(', '));
  }
}

console.log('§4b the CLI 2.1.280 pass (2026-09-22): the latency reason told true, the lists moved by corpus evidence');
{
  ok('the 2.1.280 additions keep their notes after the 2.1.281 pass (scratchpad_path / staged_files / no_query_first / decision_reason_code / initiator / narration_hint)', [['system/init', 'scratchpad_path'], ['system/turn_handoff_available', 'staged_files'], ['system/turn_handoff_available', 'no_query_first'], ['system/permission_denied', 'decision_reason_code'], ['user', 'initiator'], ['assistant', 'narration_hint']].every(([k, f]) => /2\.1\.280/.test(R.SHAPES['claude:stream:' + k].ignored.get(f) || '')));
  const res = R.SHAPES['claude:stream:result'];
  const LAT = ['first_stream_post_queue_wait_ms', 'first_stream_post_queued_behind', 'frame_received_wall_ms', 'frame_enqueued_wall_ms', 'turn_started_wall_ms', 'first_text_post_ms', 'first_text_post_wall_ms'];
  ok('the seven 2.1.280 result latency fields are declared ignored, each with a reason that no longer claims a surface shows ttft', LAT.every((f) => res.ignored.has(f) && !/shows ttft/.test(res.ignored.get(f)) && /nothing in VibeSpace reads it/.test(res.ignored.get(f))), LAT.map((f) => res.ignored.get(f)));   // stale-pins: kept — the phrase pinned here is the record-shape table's own (its ignored latency fields), not src/vault.js's SECRETS_AT_REST words B-ef1b rewrote
  // …and the reason STAYS true: the day a src/ file reads a latency field, this goes red and says to move it to known
  const walk = (d, out = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f, out); else if (/\.js$/.test(e.name)) out.push(f); } return out; };
  const LAT_RE = new RegExp('\\b(?:ttft_ms|ttft_stream_ms|duration_api_ms|' + LAT.join('|') + ')\\b');
  const readers = walk(path.join(REPO, 'src')).map((f) => path.relative(REPO, f)).filter((f) => f !== 'src/record-shape.js' && LAT_RE.test(fs.readFileSync(path.join(REPO, f), 'utf8')));
  ok('no src/ file reads a latency field (the reason "nothing reads it" is a census, not a claim) — a consumer ⇒ move the field to known', readers.length === 0, readers);
  ok('…NEGATIVE CONTROL: the census regex does catch a reader', LAT_RE.test('const t = raw.first_text_post_ms;') && LAT_RE.test('meta.ttft_ms = r.ttft_ms'));
  const U = R.DECLARED_UPSTREAM_UNSEEN.system, IGN = MM.KNOWN_IGNORED_SYSTEM_SUBTYPES, IGNT = MM.KNOWN_IGNORED_RECORD_TYPES;
  ok('scheduled_task_fire LEFT declared-upstream-unseen (a transcript row exists) and is KNOWN_IGNORED (card-less)', !('scheduled_task_fire' in U) && IGN.has('scheduled_task_fire'));
  ok('bridge_status is KNOWN_IGNORED and excused on CORPUS_ONLY_SUBTYPES (not in the SDK union — the dead-entry check would otherwise call it dead)', IGN.has('bridge_status') && typeof R.CORPUS_ONLY_SUBTYPES.bridge_status === 'string' && R.CORPUS_ONLY_SUBTYPES.bridge_status.length > 12);
  ok('the /design canvas bookkeeping rows are KNOWN_IGNORED top-level types', ['artifact-autoreact-ledger', 'frame-link', 'artifact-comment-monitor'].every((t) => IGNT.has(t)));
  // the transcript twins the corpus proves: a clean row judges clean, a grown row is drift (the shape is live, not decoration)
  const envT = { parentUuid: 'p', isSidechain: false, isMeta: false, timestamp: '2026-01-01T00:00:00.000Z', uuid: 'u1', userType: 'external', entrypoint: 'cli', cwd: '/w/proj', sessionId: 's', version: '2.1.118', gitBranch: 'main', slug: 'x' };
  ok('transcript system/scheduled_task_fire {content} + the envelope ⇒ no drift', R.unknownFields('claude', 'transcript', { ...envT, type: 'system', subtype: 'scheduled_task_fire', content: 'wakeup' }) === null);
  const grown = R.unknownFields('claude', 'transcript', { ...envT, type: 'system', subtype: 'scheduled_task_fire', content: 'wakeup', cron_id: 'c1' });
  ok('…a scheduled_task_fire row that GREW a field is drift, naming it (negative control)', grown && grown.shape === 'claude:transcript:system/scheduled_task_fire' && grown.fields.join(',') === 'cron_id', grown);
  ok('transcript system/bridge_status {content, url} + the envelope (incl. agentId) ⇒ no drift', R.unknownFields('claude', 'transcript', { ...envT, agentId: 'a1', type: 'system', subtype: 'bridge_status', content: 'banner', url: 'https://example.invalid/x' }) === null);
  const mm = createMessageManager('claude', 'test-shape-280');
  mm.convertHistory([
    { ...envT, uuid: 'st', type: 'system', subtype: 'scheduled_task_fire', content: 'wakeup' },
    { ...envT, uuid: 'bs', agentId: 'a1', type: 'system', subtype: 'bridge_status', content: 'banner', url: 'https://example.invalid/x' },
    { type: 'artifact-autoreact-ledger', v: 1, sessionId: 's', accountUuid: 'acct', artifacts: { a1: {} } },
    { type: 'frame-link', sessionId: 's', path: '/p', frameUrl: 'https://example.invalid/f', title: 't', artifactCount: 2, timestamp: 't' },
    { type: 'artifact-comment-monitor', v: 1, sessionId: 's', artifacts: { a1: {} } },
  ]);
  ok('a history carrying all five renders NO card of any kind (neither unknown-event nor drift)', unknownCards(mm).length === 0 && driftCards(mm).length === 0, mm.messages.map((m) => m.noticeKind));
}

console.log('§4c the CLI 2.1.281 pass (2026-09-23): the pinned build, six fields on three shapes, one new subtype routed to the fall-back card');
{
  ok('2.1.281 stays a PINNED build beside 2.1.288, 2.1.296, 2.1.306, 2.1.307, 2.1.308, 2.1.312, 2.1.314, 2.1.319, 2.1.321, 2.1.322, 2.1.328 and 2.1.332 (SCHEMA_CLI_VERSIONS; SCHEMA_CLI_VERSION = the newest)', R.SCHEMA_CLI_VERSIONS.join() === '2.1.281,2.1.288,2.1.296,2.1.306,2.1.307,2.1.308,2.1.312,2.1.314,2.1.319,2.1.321,2.1.322,2.1.328,2.1.332' && R.SCHEMA_CLI_VERSION === '2.1.332', R.SCHEMA_CLI_VERSIONS);
  const ADDED = [['system/init', 'per_turn_effort_active'], ['system/init', 'view_mode'], ['assistant', 'local_command_outcome'], ['conversation_reset', 'trigger'], ['conversation_reset', 'user_message_uuid'], ['conversation_reset', 'timestamp']];
  ok('the six fields 2.1.281 added are declared IGNORED (never known — known is the 2.1.274 dump), each with a reason naming the build', ADDED.every(([k, f]) => { const sp = R.SHAPES['claude:stream:' + k]; return !sp.known.has(f) && /2\.1\.281/.test(sp.ignored.get(f) || '') && sp.ignored.get(f).length > 60; }), ADDED.map(([k, f]) => k + '.' + f + ' = ' + R.SHAPES['claude:stream:' + k].ignored.get(f)));
  const pte = R.SHAPES['claude:stream:system/per_turn_effort_changed'];
  ok('system/per_turn_effort_changed has a shape row (its own 2.1.281 declaration) and SHAPE_SINCE names the build', pte && [...pte.known].join() === 'per_turn_effort_active' && R.SHAPE_SINCE['system/per_turn_effort_changed'] === '2.1.281');
  // lane session-title-record (B-fbef): 2.1.288 names the session itself — both carriers pinned, the build named, card-less
  const stc = R.SHAPES['claude:stream:system/session_title_changed'], stt = R.SHAPES['claude:transcript:system/session_title_changed'];
  ok('system/session_title_changed: stream + transcript rows ({title}), SHAPE_SINCE 2.1.288, KNOWN_IGNORED (session-brain owns it: the name ladder\'s CLI-title rung)',
    stc && stt && [...stc.known].join() === 'title' && [...stt.known].join() === 'title' && R.SHAPE_SINCE['system/session_title_changed'] === '2.1.288' && MM.KNOWN_IGNORED_SYSTEM_SUBTYPES.has('session_title_changed') && !MM.HANDLED_SYSTEM_SUBTYPES.has('session_title_changed'));
  const recLive = { type: 'system', subtype: 'session_title_changed', title: 'Fix the login', uuid: 'u1', session_id: 's1' };
  const recJsonl = { parentUuid: 'p', isSidechain: false, userType: 'external', cwd: '/w', sessionId: 's1', version: '2.1.288', gitBranch: 'main', type: 'system', subtype: 'session_title_changed', title: 'Fix the login', uuid: 'u2', timestamp: '2026-10-05T00:00:00Z' };
  ok('the measured 2.1.288 record (live + JSONL envelope) is clean; a field it grows is still named (the pin is strict)', R.shapeKeyOf('claude', 'stream', recLive) === 'claude:stream:system/session_title_changed' && R.shapeKeyOf('claude', 'transcript', recJsonl) === 'claude:transcript:system/session_title_changed' && R.unknownFields('claude', 'stream', recLive) === null && R.unknownFields('claude', R.carrierOf('claude', recJsonl), recJsonl) === null && R.unknownFields('claude', 'stream', { ...recLive, emoji: 'x' })?.fields.join() === 'emoji');
  const U = R.DECLARED_UPSTREAM_UNSEEN.system, IGN = MM.KNOWN_IGNORED_SYSTEM_SUBTYPES, H = MM.HANDLED_SYSTEM_SUBTYPES;
  // B-8dcf ① (2026-11-18): the record left DECLARED_UPSTREAM_UNSEEN — a consumer exists (the cost fact as ONE dim notice in our words)
  ok('…and is HANDLED now (B-8dcf ①): on the normalizer\'s handled list, on no other list', !('per_turn_effort_changed' in U) && !IGN.has('per_turn_effort_changed') && H.has('per_turn_effort_changed'));
  const mm = createMessageManager('claude', 'test-shape-281');
  mm.processLive({ type: 'system', subtype: 'per_turn_effort_changed', per_turn_effort_active: false, uuid: 'u-pte', session_id: 's' });
  const pteNote = mm.messages.filter((m) => m.noticeKind === 'harness-informational');
  ok('a live per_turn_effort_changed (active false) renders ONE dim harness notice in OUR words (say per-turn-effort-off, level notice) — no Unknown-event card, no drift card', pteNote.length === 1 && mm.messages.length === 1 && pteNote[0].content[0].say === 'per-turn-effort-off' && pteNote[0].content[0].level === 'notice' && /rewrites the prompt cache/.test(pteNote[0].content[0].text) && unknownCards(mm).length === 0 && driftCards(mm).length === 0, mm.messages.map((m) => m.noticeKind));   // stale-pins: kept — the words moved from record-shape.js's comment to message-manager.js, where this reads them
  const mt = createMessageManager('claude', 'test-shape-281-on');
  mt.processLive({ type: 'system', subtype: 'per_turn_effort_changed', per_turn_effort_active: true, uuid: 'u-pte-on', session_id: 's' });
  ok('…its `true` (nothing changed for the person) is card-less', mt.messages.length === 0, mt.messages.map((m) => m.noticeKind));
  {
    const crx = fs.readFileSync(path.join(REPO, 'src/lib/chat-renderers.js'), 'utf8');
    const KEY = 'The API stopped taking the effort per turn — from now on, changing the effort rewrites the prompt cache (its next request pays the full cache write)';
    ok('…the renderer words it through t() (escaped) on the dim card; zh + ja carry the line', crx.includes("b.say === 'per-turn-effort-off' ? escHtml(t(" + JSON.stringify(KEY).replace(/^"|"$/g, "'")) && ['src/lib/i18n-zh.js', 'src/lib/i18n-ja.js'].every((f) => fs.readFileSync(path.join(REPO, f), 'utf8').includes(JSON.stringify(KEY) + ':')));
    let base = ''; try { base = (await import('node:child_process')).execFileSync('git', ['show', 'b06f36e90:src/message-manager.js'], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 << 20 }); } catch { base = ''; }
    if (base) {
      const { mutantCopies } = await import('./mutant-copy.mjs');
      const MB = mutantCopies('record-shape-pte', REPO).load('src/message-manager.js', base, 'release-mm');
      const rb = new MB.MessageManager('test-shape-281-rel');
      rb.processLive({ type: 'system', subtype: 'per_turn_effort_changed', per_turn_effort_active: false, uuid: 'u-pte-r', session_id: 's' });
      ok('RED control: the release b06f36e90\'s normalizer drew the red Unknown-event card for it (the latent card the row names)', unknownCards(rb).length === 1 && !rb.messages.some((m) => m.noticeKind === 'harness-informational'), rb.messages.map((m) => m.noticeKind));
    } else console.log('  · SKIP: the release b06f36e90 is not in this clone');
  }
  const mi = createMessageManager('claude', 'test-shape-281-init');
  mi.processLive({ type: 'system', subtype: 'init', cwd: '/w/proj', session_id: 's', uuid: 'u-i', tools: [], mcp_servers: [], model: 'claude-fable-5-1', permissionMode: 'default', slash_commands: [], apiKeySource: 'none', claude_code_version: '2.1.281', output_style: 'default', skills: [], plugins: [], per_turn_effort_active: true, view_mode: 'default' });
  ok('a 2.1.281 init carrying per_turn_effort_active + view_mode is clean (no drift card)', driftCards(mi).length === 0 && unknownCards(mi).length === 0, mi.messages.map((m) => m.noticeKind));
  const mj = createMessageManager('claude', 'test-shape-281-init2');
  mj.processLive({ type: 'system', subtype: 'init', cwd: '/w/proj', session_id: 's-281-near', uuid: 'u-j', model: 'claude-fable-5-1', view_mode: 'focus', per_turn_effort_mode: 'x' });
  ok('…NEGATIVE CONTROL: a near-miss name (per_turn_effort_mode) is still drift, named (a card AND a ledger row)', driftCards(mj).length === 1 && driftCards(mj)[0].content[0].fields.join() === 'per_turn_effort_mode' && ledgerOf('s-281-near').length === 1 && ledgerOf('s-281-near')[0].fields.join() === 'per_turn_effort_mode', { cards: driftCards(mj).map((m) => m.content[0].fields), rows: ledgerOf('s-281-near') });
}

console.log('§4e the PINNED dumps (lane cli-2-1-288-records, B-e05e): every build in SCHEMA_CLI_VERSIONS judged from its tracked dump — no binary needed');
{
  const HANDLED = MM.HANDLED_SYSTEM_SUBTYPES, IGN = MM.KNOWN_IGNORED_SYSTEM_SUBTYPES, IGNT = MM.KNOWN_IGNORED_RECORD_TYPES;
  const routeSrc = read('src/message-manager.js');
  const routeBody = routeSrc.slice(routeSrc.indexOf('_routeMessage(raw, emit) {'), routeSrc.indexOf('_processTombstone(raw, emit) {'));
  const cases = new Set([...routeBody.matchAll(/case '([a-z_-]+)':/g)].map((m) => m[1]));
  const vcmp = (a, b) => { const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0); return 0; };
  const dumpOf = (v) => { try { return JSON.parse(read('scripts/fixtures/claude-cli/' + v + '.json')); } catch { return null; } };
  /** PURE: one pinned build's dump vs the declarations (R-shaped) — the §4 legs, expecting the rows of THAT build. */
  const judgeDump = (Rx, dump) => {
    const v = dump.version, union = dump.union, UNSEEN = Rx.DECLARED_UPSTREAM_UNSEEN;
    const keys = Object.keys(union);
    const sys = keys.filter((k) => k.startsWith('system/')).map((k) => k.slice(7));
    const EXPLICIT = new Set(['user', 'transcript_mirror', 'control_request', 'control_response', 'control_cancel_request', 'keep_alive', 'update_environment_variables', 'result', 'result/success']);
    const types = [...new Set(keys.filter((k) => !k.startsWith('system/') && ((union[k].includes('uuid') && union[k].includes('session_id')) || EXPLICIT.has(k))).map((k) => k.replace(/\/.*$/, '')))];
    const newer = (k) => !!(Rx.SHAPE_SINCE[k] && vcmp(Rx.SHAPE_SINCE[k], v) > 0);
    const out = [];
    for (const s of sys) if (!HANDLED.has(s) && !IGN.has(s) && !(s in UNSEEN.system)) out.push('UNLISTED system/' + s);
    for (const t of types) if (!cases.has(t) && !IGNT.has(t) && !(t in UNSEEN.types)) out.push('UNLISTED ' + t);
    const env = Rx.ENVELOPES['claude:stream'];
    for (const k of keys) { const spec = Rx.SHAPES['claude:stream:' + (k === 'result/success' ? 'result' : k)]; if (spec) for (const f of union[k]) if (!env.has(f) && !spec.known.has(f) && !spec.ignored.has(f) && !Rx.isOurs(f)) out.push('UNDECLARED ' + k + '.' + f); }
    const bsys = new Set(sys);
    for (const s of [...HANDLED, ...IGN, ...Object.keys(UNSEEN.system)]) if (!bsys.has(s) && !(s in Rx.CORPUS_ONLY_SUBTYPES) && !newer('system/' + s)) out.push('DEAD system/' + s);
    const bkeys = new Set(keys.map((k) => (k === 'result/success' ? 'result' : k)));
    for (const s of Object.keys(Rx.SHAPES).filter((x) => x.startsWith('claude:stream:')).map((x) => x.slice(14))) if (!bkeys.has(s) && !newer(s)) out.push('GHOST ' + s);
    for (const [k, since] of Object.entries(Rx.SHAPE_SINCE)) if (vcmp(since, v) <= 0 && !bkeys.has(k)) out.push('SINCE-WRONG ' + k + ' (' + since + ' but not in ' + v + ')');
    return out;
  };
  /** PURE: a row a pinned build ADDED (absent from the oldest pinned dump) must name its build — SHAPE_SINCE, a pinned version whose dump has it. */
  const versionless = (Rx, dumps) => {
    const oldest = new Set(Object.keys(dumps[0].union).map((k) => (k === 'result/success' ? 'result' : k)));
    const bad = [];
    const rows = new Set(Object.keys(Rx.SHAPES).filter((x) => x.startsWith('claude:stream:')).map((x) => x.slice(14)));
    for (const s of [...HANDLED, ...IGN, ...Object.keys(Rx.DECLARED_UPSTREAM_UNSEEN.system)]) if (!(s in Rx.CORPUS_ONLY_SUBTYPES)) rows.add('system/' + s);
    for (const k of rows) {
      if (oldest.has(k)) continue;
      const since = Rx.SHAPE_SINCE[k];
      const d = since && dumps.find((x) => x.version === since);
      if (!since || !Rx.SCHEMA_CLI_VERSIONS.includes(since) || !d || !(k in d.union)) bad.push(k + (since ? ' (since ' + since + ' — not a pinned dump that has it)' : ' (no SHAPE_SINCE)'));
    }
    return bad;
  };
  const dumps = R.SCHEMA_CLI_VERSIONS.map(dumpOf);
  ok('every pinned build has its TRACKED dump (scripts/fixtures/claude-cli/<version>.json), taken by the oracle\'s own method', dumps.every((d, i) => d && d.version === R.SCHEMA_CLI_VERSIONS[i] && /^strings -n 8 .*extractZodUnion/.test(d.method) && Object.keys(d.union).length >= 150), dumps.map((d) => d && [d.version, Object.keys(d.union).length]));
  if (dumps.every(Boolean)) {
    for (const d of dumps) { const v = judgeDump(R, d); ok(`${d.version}: every subtype / stream type listed, every field declared, no dead entry, no ghost shape (the rows of THAT build; SHAPE_SINCE excuses the newer ones)`, v.length === 0, v); }
    const vl = versionless(R, dumps);
    ok('every row newer than the oldest pinned build names its build (SHAPE_SINCE ∈ SCHEMA_CLI_VERSIONS, in that build\'s dump)', vl.length === 0, vl);
    // CONTROLS on in-memory patched copies
    const noSince = { ...R, SHAPE_SINCE: Object.fromEntries(Object.entries(R.SHAPE_SINCE).filter(([k]) => k !== 'system/ui_toast')) };
    const ns = versionless(noSince, dumps), ns281 = judgeDump(noSince, dumps[0]);
    ok('CONTROL: a copy declaring ui_toast WITHOUT a version goes red, naming it (version-less row, and DEAD + GHOST on the 2.1.281 dump)', ns.length === 1 && /^system\/ui_toast \(no SHAPE_SINCE\)/.test(ns[0]) && ns281.join() === 'DEAD system/ui_toast,GHOST system/ui_toast', { ns, ns281 });
    const no288 = { ...R, SHAPES: Object.fromEntries(Object.entries(R.SHAPES).map(([k, sp]) => [k, R.FIELDS_288[k] ? { ...sp, ignored: new Map([...sp.ignored].filter(([f]) => !(f in R.FIELDS_288[k]))) } : sp])) };
    const n288 = judgeDump(no288, dumps[1]);
    ok('CONTROL: a copy without FIELDS_288 is red on the 2.1.288 dump (23 fields named) and still green on 2.1.281', n288.length === 23 && n288.every((x) => x.startsWith('UNDECLARED ')) && judgeDump(no288, dumps[0]).length === 0, n288.length);
    // the §4d sentences of each pinned build: all resolved, each a row of the table
    const PO = require(path.join(REPO, 'src/permission-outcome.js'));
    // …and they ARE the table's list rows of THAT build (every row not spelled as a literal, `since` ≤ the build — lane cli-2-1-314-records)
    const listRowsOf = (v) => PO.PERMISSION_OUTCOME_ROWS.filter((r) => r.binary !== 'literal' && vcmp(String(r.since).replace(/^≤/, ''), v) <= 0);
    for (const d of dumps) { const c = outcomeCensus(d.sentences.rows || [], PO.PERMISSION_OUTCOME_ROWS, ''), want = listRowsOf(d.version); ok(`${d.version}: §4d ${(d.sentences.rows || []).length} permission sentences, none unresolved, each a row of src/permission-outcome.js — exactly the table's ${want.length} list rows of that build (since ≤ ${d.version})`, (d.sentences.rows || []).length === want.length && want.every((r) => d.sentences.rows.some((x) => x.text === r.text)) && d.sentences.unresolved.length === 0 && c.unclassified.length === 0, { unresolved: d.sentences.unresolved, c: c.unclassified, want: want.length }); }
    // B-9ff2 step 3: every sentence of every tracked dump resolves to THE row of its own text — the longest-row lookup never lands on a
    // prefix row (2.1.328's rHn and m9t's nHn both open with ww's sentence: each must read as itself, never as ww or as each other)
    { const all = dumps.flatMap((d) => (d.sentences.rows || []).map((x) => [d.version, x])), misread = all.filter(([, x]) => { const o = PO.permissionOutcome(x.text, true); return !o.row || o.row.text !== x.text; }).map(([v, x]) => v + ' ' + x.name + ' → ' + (PO.permissionOutcome(x.text, true).row || { id: 'none' }).id);
      ok(`every sentence of every tracked dump (${all.length} across ${dumps.length} builds) resolves to THE row of its own text — never a prefix row`, all.length >= 180 && misread.length === 0, misread); }
    const texts = (d, drop = []) => JSON.stringify(d.sentences.rows.map((x) => x.text).filter((t) => !drop.includes(t)).sort());
    const M9T = PO.PERMISSION_OUTCOME_ROWS.find((r) => r.id === 'm9t'), d314s = dumps.find((d) => d.version === '2.1.314');
    const OU9 = PO.PERMISSION_OUTCOME_ROWS.find((r) => r.id === 'OU'), d319s = dumps.find((d) => d.version === '2.1.319'), d321s = dumps.find((d) => d.version === '2.1.321'), d322s = dumps.find((d) => d.version === '2.1.322');
    ok('§4d 2.1.281 → 2.1.288 → 2.1.296 → 2.1.306 → 2.1.307 → 2.1.308 → 2.1.312: the same 14 sentences (none added, none vanished — no row needs `until`); 2.1.314 = those 14 + ONE (m9t, since 2.1.314); 2.1.319 = those 15 + ONE (OU, since 2.1.319); 2.1.321 = those 16, renamed — none vanished; 2.1.322 = those 16, renamed again (B-9ff2); 2.1.328 = those 16 + FIVE (pBe, w5e, b5e, k5e, rHn — since 2.1.328, B-9ff2 step 2); 2.1.332 = those 21, renamed (主开发 r5510); PERMISSION_OUTCOME_CLI_VERSION 2.1.332 (the newest pinned)', dumps.filter((d) => vcmp(d.version, '2.1.312') <= 0).every((d) => texts(d) === texts(dumps[0])) && !!d314s && !!M9T && M9T.since === '2.1.314' && d314s.sentences.rows.some((x) => x.text === M9T.text) && texts(d314s, [M9T.text]) === texts(dumps[0]) && !!d319s && !!OU9 && OU9.since === '2.1.319' && d319s.sentences.rows.some((x) => x.text === OU9.text) && texts(d319s, [OU9.text]) === texts(d314s) && !!d321s && texts(d321s) === texts(d319s) && !!d322s && texts(d322s) === texts(d321s) && (() => { const d328s = dumps.find((d) => d.version === '2.1.328'), N5 = PO.PERMISSION_OUTCOME_ROWS.filter((r) => r.since === '2.1.328'); return !!d328s && N5.map((r) => r.id).join() === 'pBe,w5e,b5e,k5e,rHn' && texts(d328s, N5.map((r) => r.text)) === texts(d322s) && (() => { const d332s = dumps.find((d) => d.version === '2.1.332'); return !!d332s && texts(d332s) === texts(d328s); })(); })() && PO.PERMISSION_OUTCOME_CLI_VERSION === '2.1.332' && PO.PERMISSION_OUTCOME_CLI_VERSION === R.SCHEMA_CLI_VERSION);
    // THE EIGHT DECISIONS, each on its evidence (the dump's zod literal)
    const z = dumps[1].zod || {};
    const EIGHT = ['session_metadata', 'instruction_size_warning', 'ui_invalidate', 'ui_log', 'ui_toast', 'ui_status', 'ui_scroll', 'ui_focus'];
    ok('the eight 2.1.288 subtypes: a zod literal in the dump, a stream shape row, SHAPE_SINCE 2.1.288', EIGHT.every((s) => typeof z['system/' + s] === 'string' && z['system/' + s].includes('subtype:R("' + s + '")') && R.SHAPES['claude:stream:system/' + s] && R.SHAPE_SINCE['system/' + s] === '2.1.288'), EIGHT.filter((s) => !z['system/' + s]));
    ok('instruction_size_warning is HANDLED (the dim notice); the other seven are KNOWN_IGNORED (card-less) — none left for the red card', HANDLED.has('instruction_size_warning') && !IGN.has('instruction_size_warning') && EIGHT.filter((s) => s !== 'instruction_size_warning').every((s) => IGN.has(s) && !HANDLED.has(s)));
    ok('ui_toast evidence: its zod object is {plugin, text, timeout_ms} only — no level / severity, so no error-class toast exists to surface', (dumps[1].union['system/ui_toast'] || []).filter((f) => f !== 'uuid' && f !== 'session_id').join() === 'plugin,text,timeout_ms' && !/level|severity|error/.test(z['system/ui_toast'].replace(/describe\("[^"]*"\)/g, '')));
    ok('session_metadata evidence: metadata carries artifacts only (no model / cwd / version for the status bar)', /metadata:u\(\{artifacts:/.test(z['system/session_metadata'] || '') && !/model|cwd|version/.test(z['system/session_metadata'] || ''));
    // THE 2.1.296 PIN (lane record-oracle-2-1-296) — each decision on the dump's zod literal
    const d296 = dumps.find((d) => d.version === '2.1.296'), d288 = dumps.find((d) => d.version === '2.1.288');
    const z6 = d296.zod || {};
    const no296 = { ...R, SHAPES: Object.fromEntries(Object.entries(R.SHAPES).map(([k, sp]) => [k, R.FIELDS_296[k] ? { ...sp, ignored: new Map([...sp.ignored].filter(([f]) => !(f in R.FIELDS_296[k]))) } : sp])) };
    const n296 = judgeDump(no296, d296);
    ok('CONTROL: a copy without FIELDS_296 is red on the 2.1.296 dump (18 fields named, result/success\'s twin included) and still green on 2.1.288', n296.filter((x) => x.startsWith('UNDECLARED ')).length === n296.length && new Set(n296.map((x) => x.replace('result/success.', 'result.'))).size === 18 && judgeDump(no296, d288).length === 0, n296);
    const f296 = Object.entries(R.FIELDS_296).flatMap(([k, fs]) => Object.entries(fs).map(([f, note]) => [k, f, note]));
    ok('FIELDS_296: 18 fields on ten shapes, each IGNORED with a one-line reason naming 2.1.296 (no reader in the tree), never known', f296.length === 18 && new Set(f296.map(([k]) => k)).size === 10 && f296.every(([k, f, note]) => typeof note === 'string' && /2\.1\.296/.test(note) && note.length > 60 && R.SHAPES[k].ignored.get(f) === note && !R.SHAPES[k].known.has(f)), f296.filter(([k, f, n]) => !/2\.1\.296/.test(n || '')));
    const lit = (st) => z6['system/' + st] || '';
    ok('the two 2.1.296 subtypes: a zod literal in the dump (helpers read off the anchor), a stream shape row of exactly the literal\'s fields, SHAPE_SINCE 2.1.296', ['permission_check_status', 'file_attachments_missing'].every((st) => lit(st).includes('subtype:A("' + st + '")') && R.SHAPE_SINCE['system/' + st] === '2.1.296' && [...R.SHAPES['claude:stream:system/' + st].known].join() === d296.union['system/' + st].filter((f) => f !== 'uuid' && f !== 'session_id').join()));
    ok('permission_check_status is KNOWN_IGNORED (card-less): its literal is {tool_use_id, agent_id?, status: checking|done} — a pulse with no words for any card', IGN.has('permission_check_status') && !HANDLED.has('permission_check_status') && /status:U\(\["checking","done"\]\)/.test(lit('permission_check_status')) && !/text:|message:|content:/.test(lit('permission_check_status').replace(/describe\("[^"]*"\)/g, '')) && [...R.SHAPES['claude:stream:system/permission_check_status'].enums.status].join() === 'checking,done');
    ok('file_attachments_missing is HANDLED (a plain dim line): its literal names the files that did not arrive — missing[{file_uuid, reason}] + sent_count', HANDLED.has('file_attachments_missing') && !IGN.has('file_attachments_missing') && /missing:T\(u\(\{file_uuid:/.test(lit('file_attachments_missing')) && /reason:o\(\)/.test(lit('file_attachments_missing')) && /sent_count:E\(\)/.test(lit('file_attachments_missing')));
    // the three hook ATTACHMENT payloads (no uuid / session_id — never a stream record type): each classified on its literal
    const nonRec = Object.keys(z6).filter((k) => !k.startsWith('system/'));
    ok('every non-system zod key of the 2.1.296 dump is an attachment payload on ATTACHMENT_PAYLOADS (async_hook_response, hook_additional_context, hook_success) — none is a stream record (no uuid / session_id)', nonRec.sort().join() === 'async_hook_response,hook_additional_context,hook_success' && nonRec.every((k) => k in R.ATTACHMENT_PAYLOADS && z6[k].includes('type:A("' + k + '")') && !(d296.union[k] || []).includes('uuid')), nonRec);
    const mmSrc6 = read('src/message-manager.js');
    const attBody = mmSrc6.slice(mmSrc6.indexOf('_processAttachment(raw, emit) {'), mmSrc6.indexOf('_processUser(raw, emit) {'));
    ok('…the two KNOWN ones name a reader that exists (_processAttachment branches on hook_success / hook_additional_context); async_hook_response is IGNORED and no branch reads it', /^known — message-manager _processAttachment/.test(R.ATTACHMENT_PAYLOADS.hook_success) && /^known — message-manager _processAttachment/.test(R.ATTACHMENT_PAYLOADS.hook_additional_context) && attBody.includes("a.type === 'hook_success'") && attBody.includes("a.type === 'hook_additional_context'") && /^ignored — /.test(R.ATTACHMENT_PAYLOADS.async_hook_response) && !attBody.includes('async_hook_response'));
    // THE 2.1.306 PIN (lane cli-2-1-306-records, B-42ed) — the zod diff 2.1.296 → 2.1.306 (the npm package's linux-x64 binary in a scratch
    // prefix, dumped STATIC), each decision on the dump
    const d306 = dumps.find((d) => d.version === '2.1.306');
    const z306 = d306.zod || {};
    const shapeOf = (k) => 'claude:stream:' + (k === 'result/success' ? 'result' : k);
    const no306 = { ...R, SHAPES: Object.fromEntries(Object.entries(R.SHAPES).map(([k, sp]) => [k, R.FIELDS_306[k] ? { ...sp, ignored: new Map([...sp.ignored].filter(([f]) => !(f in R.FIELDS_306[k]))) } : sp])) };
    const n306 = judgeDump(no306, d306);
    ok('CONTROL: a copy without FIELDS_306 is red on the 2.1.306 dump (21 fields named, result/success\'s twins included) and still green on 2.1.296', n306.length > 0 && n306.every((x) => x.startsWith('UNDECLARED ')) && new Set(n306.map((x) => x.replace('result/success.', 'result.'))).size === 21 && judgeDump(no306, d296).length === 0, n306);
    const f306 = Object.entries(R.FIELDS_306).flatMap(([k, fs]) => Object.entries(fs).map(([f, note]) => [k, f, note]));
    ok('FIELDS_306: 21 fields on eight shapes, each IGNORED with a one-line reason naming 2.1.306 (no reader in the tree), never known', f306.length === 21 && new Set(f306.map(([k]) => k)).size === 8 && f306.every(([k, f, note]) => typeof note === 'string' && /2\.1\.306/.test(note) && note.length > 60 && R.SHAPES[k].ignored.get(f) === note && !R.SHAPES[k].known.has(f)), f306.filter(([k, f, n]) => !/2\.1\.306/.test(n || '')));
    const grown = [...new Set(Object.keys(d306.union).filter((k) => k in d296.union && R.SHAPES[shapeOf(k)]).flatMap((k) => d306.union[k].filter((f) => !d296.union[k].includes(f)).map((f) => shapeOf(k) + '.' + f)))].sort();
    ok('…and they ARE the dump diff, computed: every field 2.1.306 added to a declared stream shape (its dump minus the 2.1.296 dump) is a FIELDS_306 row, and no row lies outside it', JSON.stringify(grown) === JSON.stringify(f306.map(([k, f]) => k + '.' + f).sort()), { grown, rows: f306.map(([k, f]) => k + '.' + f).sort() });
    const EXPLICIT6 = new Set(['user', 'transcript_mirror', 'control_request', 'control_response', 'control_cancel_request', 'keep_alive', 'update_environment_variables', 'result', 'result/success']);
    const sysOf = (d) => Object.keys(d.union).filter((k) => k.startsWith('system/')).sort().join();
    const recsOf = (d) => [...new Set(Object.keys(d.union).filter((k) => !k.startsWith('system/') && ((d.union[k].includes('uuid') && d.union[k].includes('session_id')) || EXPLICIT6.has(k))).map((k) => k.replace(/\/.*$/, '')))].sort().join();
    ok('2.1.306 adds no system subtype and no stream record type (the 2.1.296 sets exactly) — no SHAPE_SINCE row, no list decision; nothing is left red', sysOf(d306) === sysOf(d296) && recsOf(d306) === recsOf(d296) && !Object.values(R.SHAPE_SINCE).includes('2.1.306'), { sys: sysOf(d306).split(',').length, recs: recsOf(d306).split(',').length });
    // the two new zod keys: the items of task_progress.workflow_progress (CORPUS_KNOWN — the live Workflow card), now with a schema
    const nonRec6 = Object.keys(z306).filter((k) => !k.startsWith('system/')).sort();
    ok('every non-system zod key of the 2.1.306 dump is a workflow_progress ITEM on WORKFLOW_PROGRESS_ITEMS (workflow_agent, workflow_phase) — none is a stream record (no uuid / session_id), neither a 2.1.296 key', nonRec6.join() === 'workflow_agent,workflow_phase' && nonRec6.every((k) => /^known — /.test(R.WORKFLOW_PROGRESS_ITEMS[k] || '') && z306[k].includes('type:A("' + k + '")') && !(d306.union[k] || []).includes('uuid') && !(k in d296.union)), nonRec6);
    const readsOf = (seg) => [...new Set([...seg.matchAll(/\be\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]).filter((f) => f !== 'type'))];
    const cut = (s, a, b) => { const i = s.indexOf(a), j = b ? s.indexOf(b, i + 1) : s.length; return i < 0 || j < 0 ? '' : s.slice(i, j); };
    const mmW = read('src/message-manager.js'), ssW = read('src/routes/sessions.js');
    const nwp = cut(mmW, 'function normalizeWorkflowProgress(list) {', 'function unknownRecordJson(raw) {'), nws = cut(ssW, 'function normalizeWorkflowSnapshot(o, runId) {', 'const phases = ordered');
    const READ = {
      workflow_phase: [...new Set([...readsOf(cut(nwp, "e.type === 'workflow_phase'", "e.type === 'workflow_agent'")), ...readsOf(cut(nws, "e.type === 'workflow_phase'", "e.type !== 'workflow_agent'"))])],
      workflow_agent: [...new Set([...readsOf(cut(nwp, "e.type === 'workflow_agent'", 'if (!phases.length')), ...readsOf(cut(nws, "e.type !== 'workflow_agent'", null))])],
    };
    const undeclaredReads = (reads) => Object.entries(reads).flatMap(([k, fs]) => fs.filter((f) => !(d306.union[k] || []).includes(f)).map((f) => k + '.' + f));
    ok(`the Workflow card's two readers (message-manager normalizeWorkflowProgress, routes/sessions normalizeWorkflowSnapshot) read ONLY fields the 2.1.306 literal declares — phase {${READ.workflow_phase.join(', ')}}, agent {${READ.workflow_agent.join(', ')}}`, READ.workflow_phase.length >= 2 && READ.workflow_agent.length >= 10 && undeclaredReads(READ).length === 0, undeclaredReads(READ));
    const plantedRead = undeclaredReads({ ...READ, workflow_agent: READ.workflow_agent.concat(['progressPct']) });
    ok('…CONTROL: a reader taking an invented field (workflow_agent.progressPct) is named by the same leg', plantedRead.join() === 'workflow_agent.progressPct', plantedRead);
    const wfState = /state:F\(\[([^\]]*)\]\)/.exec(z306.workflow_agent || ''), wfWorking = /const WF_WORKING_STATES = new Set\(\[([^\]]*)\]\)/.exec(read('src/lib/chat-renderers.js'));
    ok('workflow_agent.state is the literal\'s start | progress | done | error, and the card\'s working words (chat-renderers WF_WORKING_STATES) hold both working values — start and progress draw as running', !!wfState && wfState[1] === '"start","progress","done","error"' && !!wfWorking && /'start'/.test(wfWorking[1]) && /'progress'/.test(wfWorking[1]), { state: wfState && wfState[1], working: wfWorking && wfWorking[1] });
    // §4d THE MOVED NAME — the B-42ed mirror's «GHOST: Dx (Gd)»: the feedback sentence still sits on the tool_result list (2.1.296 vD,
    // 2.1.306 D0) but its template literal now OPENS its line; the extractor reads the whole declaration and resolves it
    const dxRow = PO.PERMISSION_OUTCOME_ROWS.find((r) => r.id === 'Dx');
    const s296 = d296.sentences.rows.find((x) => x.text === dxRow.text), s306 = d306.sentences.rows.find((x) => x.text === dxRow.text);
    ok('§4d the MOVED name: the Dx row\'s sentence (2.1.296 vD) is 2.1.306\'s D0, on the tool_result list, resolved — 14 sentences, none unresolved, the row unchanged, no GHOST', !!s296 && s296.name === 'vD' && !!s306 && s306.name === 'D0' && s306.from === 'Gd' && d306.sentences.rows.length === 14 && d306.sentences.unresolved.length === 0 && outcomeCensus(d306.sentences.rows, PO.PERMISSION_OUTCOME_ROWS, '').unclassified.length === 0, { s296, s306 });
    const mini306 = 'var x9n="Tool loaded.";function t2(e){if(_f())return e+Gbt;return e}var D0=`The user doesn\'t want to proceed with this tool use. The user said:\n`,n2="Permission for this tool use was denied. Try a different approach.",ep="[Request interrupted by user for tool use]",bT="The user doesn\'t want to take this action right now.",_T="[Request interrupted by user]";\nvar D0=p(()=>u({hookEventName:A("SubagentStart")}));function wp(){return[D0,n2,ep,bT]}\nvar Ur=new Set([_T,ep,bT,bT+Gbt,D0]);';
    const m6 = extractPermissionSentences(mini306), d0 = m6.sentences && m6.sentences.find((x) => x.name === 'D0');
    ok('the extractor on a synthetic 2.1.306-shaped chunk: D0\'s template ends its line (no other member there), the next member follows its closing backtick ⇒ resolved, its value ending at the line ("…The user said:"); the reused D0=p(…) ignored', !m6.error && m6.list === 'wp' && m6.set === 'Ur' && m6.unresolved.length === 0 && m6.sentences.length === 5 && !!d0 && d0.text === "The user doesn't want to proceed with this tool use. The user said:" && d0.from === 'both', m6);
    const dumpSrc = read('scripts/claude-cli-dump.mjs');
    const DECL = dumpSrc.split('\n').filter((l) => l.startsWith('  const declOf = (at) => {'));
    const Mx = mutantCopies('record-extractor', REPO);
    const lineOnly = DECL.length === 1 ? await import(pathToFileURL(Mx.write('scripts/claude-cli-dump.mjs', dumpSrc.replace(DECL[0], '  const declOf = (at) => { const [a, b] = lineOf(at); return text.slice(a, b); };'), 'line-only')).href) : null;
    const lo = lineOnly && lineOnly.extractPermissionSentences(mini306);
    const loGhost = lo && outcomeCensus(lo.sentences, [{ id: 'Dx', binary: 'Gd', text: d0 ? d0.text : '?' }], '').ghosts;
    ok('RED CONTROL: a copy of the extractor judging the LINE alone (the pre-lane rule) leaves D0 unresolved and the row a GHOST — «GHOST: Dx (Gd)», the mirror\'s red', DECL.length === 1 && !!lo && lo.unresolved.length === 1 && /^D0 \(0 candidate/.test(lo.unresolved[0]) && loGhost.join() === 'Dx (Gd)', { decl: DECL.length, unresolved: lo && lo.unresolved, loGhost });
    // THE 2.1.307 PIN (lane cli-2-1-307-records) — the hub's claude AUTO-UPDATED to 2.1.307 (2026-10-21): its dump (strings over a 0644
    // copy, never run as a session) minus the 2.1.306 dump, each decision on the dump
    const d307 = dumps.find((d) => d.version === '2.1.307');
    const z307 = d307.zod || {};
    const [, lit7] = (/^([^/]+)\/([^ ]+) @/.exec(d307.helpers[0] || '') || []).slice(1);
    const no307 = { ...R, SHAPES: Object.fromEntries(Object.entries(R.SHAPES).map(([k, sp]) => [k, R.FIELDS_307[k] ? { ...sp, ignored: new Map([...sp.ignored].filter(([f]) => !(f in R.FIELDS_307[k]))) } : sp])) };
    const n307 = judgeDump(no307, d307);
    ok('CONTROL: a copy without FIELDS_307 is red on the 2.1.307 dump (3 fields named) and still green on 2.1.306', n307.length === 3 && n307.every((x) => x.startsWith('UNDECLARED ')) && judgeDump(no307, d306).length === 0, n307);
    const f307 = Object.entries(R.FIELDS_307).flatMap(([k, fs]) => Object.entries(fs).map(([f, note]) => [k, f, note]));
    ok('FIELDS_307: 3 fields on two shapes (user, command_lifecycle), each IGNORED with a one-line reason naming 2.1.307 (no reader in the tree), never known', f307.length === 3 && new Set(f307.map(([k]) => k)).size === 2 && f307.every(([k, f, note]) => typeof note === 'string' && /2\.1\.307/.test(note) && note.length > 60 && R.SHAPES[k].ignored.get(f) === note && !R.SHAPES[k].known.has(f)), f307.filter(([k, f, n]) => !/2\.1\.307/.test(n || '')));
    const grown7 = [...new Set(Object.keys(d307.union).filter((k) => k in d306.union && R.SHAPES[shapeOf(k)]).flatMap((k) => d307.union[k].filter((f) => !d306.union[k].includes(f)).map((f) => shapeOf(k) + '.' + f)))].sort();
    ok('…and they ARE the dump diff, computed: every field 2.1.307 added to a declared stream shape (its dump minus the 2.1.306 dump) is a FIELDS_307 row, and no row lies outside it', JSON.stringify(grown7) === JSON.stringify(f307.map(([k, f]) => k + '.' + f).sort()), { grown7, rows: f307.map(([k, f]) => k + '.' + f).sort() });
    ok('2.1.307 adds no system subtype and no stream record type (the 2.1.306 sets exactly) — no SHAPE_SINCE row, no KNOWN_IGNORED decision; nothing is left red', sysOf(d307) === sysOf(d306) && recsOf(d307) === recsOf(d306) && !Object.values(R.SHAPE_SINCE).includes('2.1.307'), { sys: sysOf(d307).split(',').length, recs: recsOf(d307).split(',').length });
    // the one new zod key: a transcript ATTACHMENT payload (no uuid / session_id — never a stream record type), classified on its literal
    const nonRec7 = Object.keys(z307).filter((k) => !k.startsWith('system/')).sort();
    ok('the one non-system zod key of the 2.1.307 dump is an attachment payload on ATTACHMENT_PAYLOADS — projects_thread_ask {call, after, deliveredAt, messageId}, IGNORED: no uuid / session_id (not a stream record), not a 2.1.306 key, and no _processAttachment branch reads it', !!lit7 && nonRec7.join() === 'projects_thread_ask' && z307.projects_thread_ask.includes('type:' + lit7 + '("projects_thread_ask")') && (d307.union.projects_thread_ask || []).join() === 'call,after,deliveredAt,messageId' && !('projects_thread_ask' in d306.union) && /^ignored — \(2\.1\.307\)/.test(R.ATTACHMENT_PAYLOADS.projects_thread_ask || '') && !attBody.includes('projects_thread_ask'), { nonRec7, lit7 });
    const same14 = d306.sentences.rows.every((r) => d307.sentences.rows.some((x) => x.text === r.text && x.from === r.from));
    ok('§4d 2.1.307: the same 14 sentences on the same lists, only RENAMED (anchor ' + d306.sentences.anchor + ' → ' + d307.sentences.anchor + ', list ' + d306.sentences.list + ' → ' + d307.sentences.list + ', set ' + d306.sentences.set + ' → ' + d307.sentences.set + ') — no row moves list, none needs `until`', same14 && d307.sentences.rows.length === 14 && d307.sentences.unresolved.length === 0 && d307.sentences.anchor !== d306.sentences.anchor, d307.sentences.rows.map((x) => x.name + ':' + x.from));
    // the frames 2.1.307 writes, through the REAL normalizer — and the drift card they drew before this pin (a copy without FIELDS_307)
    const SID7 = 'e2e00000-0000-4000-8000-0000000003a7';
    const live7 = (MMx, conv) => {
      const x = MMx === MM ? createMessageManager('claude', conv) : new MMx.MessageManager(conv);
      x.processLive({ type: 'command_lifecycle', command_uuid: 'c-307-1', state: 'started', wakeup_source: 'loop_wakeup', scheduled_for: 1792636800000, uuid: 'u-307-1', session_id: conv });
      x.processLive({ type: 'command_lifecycle', command_uuid: 'c-307-2', state: 'started', wakeup_source: 'schedule_wakeup', uuid: 'u-307-2', session_id: conv });
      const before = x.messages.length;
      x.processLive({ type: 'attachment', attachment: { type: 'projects_thread_ask', call: { name: 'ask', id: 'toolu_307', input: {} }, after: 'u-307-2', deliveredAt: 1792636800000, messageId: 'msg_307' }, uuid: 'u-307-3', session_id: conv });
      const cards = driftCards(x);
      return { cards: cards.length, fields: cards.flatMap((m) => m.content[0].fields).sort().join(), rows: ledgerOf(conv, MMx).length, attachmentMsgs: x.messages.length - before, all: x.messages.length };
    };
    const real7 = live7(MM, SID7);
    ok('the REAL normalizer on 2.1.307\'s frames: a scheduler fire\'s command_lifecycle (wakeup_source loop_wakeup + scheduled_for, schedule_wakeup) and a projects_thread_ask attachment ⇒ no drift card, no ledger row, no message at all', real7.cards === 0 && real7.rows === 0 && real7.all === 0 && real7.attachmentMsgs === 0, real7);
    const M7 = mutantCopies('record-307', REPO);
    const FILL7 = 'for (const [key, fields] of Object.entries(FIELDS_307)) for (const [f, note] of Object.entries(fields)) if (!SHAPES[key].known.has(f)) SHAPES[key].ignored.set(f, note);';
    const rsSrc7 = read('src/record-shape.js'), mmSrc7 = read('src/message-manager.js'), REQ7 = "require('./record-shape.js')";
    const MM7 = rsSrc7.split(FILL7).length === 2 && mmSrc7.split(REQ7).length === 2 ? require(M7.write('src/message-manager.js', editAnchor(mmSrc7, REQ7, 'require(' + JSON.stringify(M7.write('src/record-shape.js', editAnchor(rsSrc7, FILL7, '/* FIELDS_307 not filled (control) */', "src/record-shape.js"), 'no-307')) + ')', "src/message-manager.js"), 'mm-no-307')) : null;
    const ctl7 = MM7 && live7(MM7, SID7.replace(/a7$/, 'a8'));
    ok('RED CONTROL: the same frames on a copy without FIELDS_307 (the .340 tree on 2.1.307) ⇒ the red card is back — ONE drift card on command_lifecycle naming scheduled_for + wakeup_source, and its ledger row; the attachment still draws nothing', !!ctl7 && ctl7.cards === 1 && ctl7.fields === 'scheduled_for,wakeup_source' && ctl7.rows === 1 && ctl7.attachmentMsgs === 0, ctl7);
    // THE NESTED OBJECTS (lane cli-2-1-307-records) — the union is depth-1, so a field a build added INSIDE rate_limit_info never
    // reached a leg: 2.1.296's rate_limit_info.overageEnabled drew a live red card on every rate-limited conversation (the owner's
    // telemetry: harness-shape-drift «rate_limit_event +{rate_limit_info.overageEnabled} · cli 2.1.296»). From 2.1.307 on the dump
    // carries `nested` (scripts/claude-cli-dump.mjs nestedOf), judged here with no binary.
    const declaredNested = Object.entries(R.SHAPES).filter(([k]) => k.startsWith('claude:stream:')).flatMap(([k, sp]) => Object.keys(sp.nested).map((f) => k.slice(14) + '.' + f)).sort();
    ok(`census: the nested objects src/record-shape.js judges on a claude stream shape are exactly the ones nestedOf reads off a binary (NESTED_FIELDS, ${NESTED_FIELDS.length}) plus the one named union (NESTED_UNIONS: ${Object.keys(NESTED_UNIONS).join(', ')}) — a new nested spec without a dump row goes red here`, JSON.stringify(declaredNested) === JSON.stringify([...NESTED_FIELDS.map(([k, f]) => k + '.' + f), ...Object.keys(NESTED_UNIONS)].sort()) && Object.values(NESTED_UNIONS).every((why) => why.length > 60), { declaredNested });
    const nestedDumps = dumps.filter((d) => vcmp(d.version, '2.1.307') >= 0);
    ok(`every pinned dump from 2.1.307 on carries \`nested\` and reads all ${NESTED_FIELDS.length} objects (none unresolved)`, nestedDumps.length >= 1 && nestedDumps.every((d) => d.nested && Object.keys(d.nested).length === NESTED_FIELDS.length && Object.values(d.nested).every(Array.isArray)), nestedDumps.map((d) => [d.version, d.nested]));
    for (const d of nestedDumps) { const v = nestedUndeclared(R, d.nested); ok(`${d.version}: every NESTED object's field set ⊆ known ∪ ignored (${Object.keys(d.nested).length} objects)`, v.length === 0, v); }
    const nestedRows = NESTED_FIELDS.flatMap(([k, f]) => [...R.SHAPES['claude:stream:' + k].nested[f].ignored].map(([x, note]) => [k + '.' + f, x, note]));
    const uniqRows = [...new Map(nestedRows.map((r) => [r[0].replace(/^system\/task_(?:notification|progress)/, 'task') + '.' + r[1], r])).values()];
    ok('the nested IGNORED rows: 15 — rate_limit_info 12 (overageEnabled 2.1.296, usageCreditOffer 2.1.306, adminRequestOffer 2.1.307, dailyCapPaused 2.1.319, memberSpendLimit 2.1.328, seven ≤2.1.287), compact_metadata 1, api_error.error 2 — each naming its first build, none known; overageInUse is KNOWN (src/rate-limit-capture.js reads it)', uniqRows.length === 15 && uniqRows.every(([, x, note]) => /\((≤2\.1\.287|2\.1\.296|2\.1\.306|2\.1\.307|2\.1\.319|2\.1\.328)\)/.test(note) && note.length > 60) && /\(2\.1\.296\)/.test(R.SHAPES['claude:stream:rate_limit_event'].nested.rate_limit_info.ignored.get('overageEnabled')) && /\(2\.1\.306\)/.test(R.SHAPES['claude:stream:rate_limit_event'].nested.rate_limit_info.ignored.get('usageCreditOffer')) && /\(2\.1\.307\)/.test(R.SHAPES['claude:stream:rate_limit_event'].nested.rate_limit_info.ignored.get('adminRequestOffer')) && R.SHAPES['claude:stream:rate_limit_event'].nested.rate_limit_info.known.has('overageInUse') && read('src/rate-limit-capture.js').includes('info.overageInUse'), uniqRows.map(([at, x]) => at + '.' + x));
    const pre307 = { ...R, SHAPES: Object.fromEntries(Object.entries(R.SHAPES).map(([k, sp]) => [k, { ...sp, nested: Object.fromEntries(Object.entries(sp.nested).map(([f, ns]) => [f, { ...ns, known: new Set([...ns.known].filter((x) => x !== 'overageInUse')), ignored: new Map() }])) }])) };
    const n340 = nestedUndeclared(pre307, d307.nested);
    ok('RED CONTROL: the .340 tree\'s nested declarations (no ignored rows, overageInUse unknown) on the 2.1.307 dump ⇒ 14 named, the live card of 2.1.296 (rate_limit_info.overageEnabled), 2.1.306\'s usageCreditOffer and 2.1.307\'s adminRequestOffer among them', n340.length === 14 && ['overageEnabled', 'usageCreditOffer', 'adminRequestOffer', 'overageInUse'].every((f) => n340.includes('UNDECLARED rate_limit_event.rate_limit_info.' + f)), n340);
    // the live frame, through the REAL normalizer — and the card it drew before this lane (a copy with the .340 nested declaration)
    const rlFrame = (conv) => ({ type: 'rate_limit_event', rate_limit_info: { status: 'rejected', resetsAt: 1792650000, rateLimitType: 'seven_day', overageStatus: 'rejected', isUsingOverage: false, overageInUse: false, overageEnabled: true, usageCreditOffer: { kind: 'extra_credit', headlinePct: 20, daysLeft: 3, label: 'x' }, adminRequestOffer: { state: 'can_ask', label: 'x', doneLabel: 'y', confirm: false, confirmPrompt: 'z' } }, uuid: 'u-rl-' + conv.slice(-2), session_id: conv });
    const liveRl = (MMx, conv) => { const x = MMx === MM ? createMessageManager('claude', conv) : new MMx.MessageManager(conv); x.processLive(rlFrame(conv)); const c = driftCards(x); return { cards: c.length, fields: c.flatMap((m) => m.content[0].fields).sort().join(), rows: ledgerOf(conv, MMx).length }; };
    const realRl = liveRl(MM, 'e2e00000-0000-4000-8000-0000000003b1');
    ok('the REAL normalizer on a 2.1.307 rejected rate_limit_event (overageEnabled, overageInUse, usageCreditOffer, adminRequestOffer) ⇒ no drift card, no ledger row', realRl.cards === 0 && realRl.rows === 0, realRl);
    const EXPORTS7 = 'module.exports = { SCHEMA_CLI_VERSION,';
    const MMn = rsSrc7.split(EXPORTS7).length === 2 ? require(M7.write('src/message-manager.js', editAnchor(mmSrc7, REQ7, 'require(' + JSON.stringify(M7.write('src/record-shape.js', editAnchor(rsSrc7, EXPORTS7, "for (const sp of [RATE_LIMIT_INFO, COMPACT_METADATA, API_ERROR_ERROR]) sp.ignored.clear(); RATE_LIMIT_INFO.known.delete('overageInUse'); /* the .340 nested declaration (control) */\n" + EXPORTS7, "src/record-shape.js"), 'nested-340')) + ')', "src/message-manager.js"), 'mm-nested-340')) : null;
    const ctlRl = MMn && liveRl(MMn, 'e2e00000-0000-4000-8000-0000000003b2');
    ok('RED CONTROL: the same frame on a copy with the .340 nested declaration ⇒ the red card is back — ONE drift card on rate_limit_event naming rate_limit_info.adminRequestOffer / .overageEnabled / .overageInUse / .usageCreditOffer, and its ledger row', !!ctlRl && ctlRl.cards === 1 && ctlRl.fields === 'rate_limit_info.adminRequestOffer,rate_limit_info.overageEnabled,rate_limit_info.overageInUse,rate_limit_info.usageCreditOffer' && ctlRl.rows === 1, ctlRl);
    // THE 2.1.308 PIN (lane cli-2-1-308-records) — the hub's claude AUTO-UPDATED again (2026-10-21 22:48 PT): its dump (strings over a
    // 0644 copy) EQUALS the 2.1.307 dump — the same union keys and fields, the same nested objects, the same 14 sentences under the
    // same minified names; the strings diff is the version / build stamps, the chunk hashes and the Bun runtime. Nothing to declare.
    const d308 = dumps.find((d) => d.version === '2.1.308');
    const sameAs = (a, b, k) => JSON.stringify(a[k]) === JSON.stringify(b[k]);
    ok('2.1.308: its tracked dump EQUALS 2.1.307\'s — the same ' + Object.keys(d307.union).length + ' union keys with the same fields, the same nested objects, the same 14 sentences under the same names (' + d307.sentences.anchor + '/' + d307.sentences.list + '/' + d307.sentences.set + '), no new zod key — so no FIELDS_308, no SHAPE_SINCE row, no KNOWN_IGNORED decision, nothing left red', !!d308 && ['union', 'nested', 'sentences', 'helpers'].every((k) => sameAs(d308, d307, k)) && Object.keys(d308.zod || {}).length === 0 && !('FIELDS_308' in R) && !Object.values(R.SHAPE_SINCE).includes('2.1.308') && judgeDump(R, d308).length === 0 && nestedUndeclared(R, d308.nested).length === 0, d308 && ['union', 'nested', 'sentences', 'helpers'].filter((k) => !sameAs(d308, d307, k)));
    // CONTROL: the leg above can fail — the same dump with one field more on a declared shape and one more inside rate_limit_info is named twice
    const d308x = d308 && { ...d308, union: { ...d308.union, command_lifecycle: [...d308.union.command_lifecycle, 'x_308_probe'] }, nested: { ...d308.nested, 'rate_limit_event.rate_limit_info': [...d308.nested['rate_limit_event.rate_limit_info'], 'x308Probe'] } };
    const n308x = d308x ? [...judgeDump(R, d308x), ...nestedUndeclared(R, d308x.nested)] : null;
    ok('CONTROL: the 2.1.308 dump with one undeclared field on command_lifecycle and one inside rate_limit_info ⇒ both NAMED (the equality above is a judgement, not a skip)', !!n308x && n308x.length === 2 && n308x.some((x) => /^UNDECLARED .*command_lifecycle\.x_308_probe/.test(x)) && n308x.includes('UNDECLARED rate_limit_event.rate_limit_info.x308Probe'), n308x);
    // THE 2.1.312 PIN (lane claude-steer-inject r3) — the box's claude SELF-UPDATED to 2.1.312 (2026-10-27 18:44 PT): its dump (strings
    // over a 0644 copy) minus the 2.1.308 dump, each decision on the dump — and the real 2.1.312 RUN against a loopback mock for what a
    // CLI VibeSpace runs WRITES (scripts/fixtures/claude-cli/2.1.312-frames.jsonl: its stdout records, ids and paths replaced)
    const d312 = dumps.find((d) => d.version === '2.1.312');
    const z312 = (d312 && d312.zod) || {};
    const [, lit12] = (/^([^/]+)\/([^ ]+) @/.exec((d312 && d312.helpers[0]) || '') || []).slice(1);
    const no312 = { ...R, SHAPES: Object.fromEntries(Object.entries(R.SHAPES).map(([k, sp]) => [k, R.FIELDS_312[k] ? { ...sp, ignored: new Map([...sp.ignored].filter(([f]) => !(f in R.FIELDS_312[k]))) } : sp])) };
    const n312 = d312 ? judgeDump(no312, d312) : null;
    ok('CONTROL: a copy without FIELDS_312 is red on the 2.1.312 dump (13 fields named, result/success\'s twins included — the shell_* set the brief named among them) and still green on 2.1.308', !!n312 && n312.every((x) => x.startsWith('UNDECLARED ')) && new Set(n312.map((x) => x.replace('result/success.', 'result.'))).size === 13 && n312.includes('UNDECLARED result/success.shell_cpu_ms_turn') && judgeDump(no312, d308).length === 0, n312);
    const f312 = Object.entries(R.FIELDS_312).flatMap(([k, fs]) => Object.entries(fs).map(([f, note]) => [k, f, note]));
    ok('FIELDS_312: 13 fields on two shapes (result 12, turn_handoff_available 1), each IGNORED with a one-line reason naming 2.1.312 (no reader in the tree), never known', f312.length === 13 && new Set(f312.map(([k]) => k)).size === 2 && f312.filter(([k]) => k === 'claude:stream:result').length === 12 && f312.every(([k, f, note]) => typeof note === 'string' && /2\.1\.312/.test(note) && note.length > 60 && R.SHAPES[k].ignored.get(f) === note && !R.SHAPES[k].known.has(f)), f312.filter(([k, f, n]) => !/2\.1\.312/.test(n || '')));
    const grown12 = d312 ? [...new Set(Object.keys(d312.union).filter((k) => k in d308.union && R.SHAPES[shapeOf(k)]).flatMap((k) => d312.union[k].filter((f) => !d308.union[k].includes(f)).map((f) => shapeOf(k) + '.' + f)))].sort() : null;
    ok('…and they ARE the dump diff, computed: every field 2.1.312 added to a declared stream shape (its dump minus the 2.1.308 dump) is a FIELDS_312 row, and no row lies outside it (sdk.connectorId grew on an MCP server CONFIG, not a stream shape)', JSON.stringify(grown12) === JSON.stringify(f312.map(([k, f]) => k + '.' + f).sort()) && !R.SHAPES['claude:stream:sdk'] && (d312.union.sdk || []).includes('connectorId'), { grown12, rows: f312.map(([k, f]) => k + '.' + f).sort() });
    const sys308 = Object.keys(d308.union).filter((k) => k.startsWith('system/'));
    const ias = R.SHAPES['claude:stream:system/inherited_asks_settled'];
    ok('2.1.312 adds ONE system subtype and no stream record type: inherited_asks_settled — its zod literal in the dump (kept_request_ids: «The request ids of the earlier worker\'s asks that this worker keeps answerable.» — the record\'s own words are read off the binary in §4), a stream shape row of exactly the literal\'s fields, SHAPE_SINCE 2.1.312', !!d312 && sysOf(d312) === [...sys308, 'system/inherited_asks_settled'].sort().join() && recsOf(d312) === recsOf(d308) && (z312['system/inherited_asks_settled'] || '').includes('subtype:' + lit12 + '("inherited_asks_settled")') && /kept_request_ids:[^]{0,40}\.describe\("The request ids of the earlier worker's asks that this worker keeps answerable\."\)/.test(z312['system/inherited_asks_settled'] || '') && !!ias && [...ias.known].join() === d312.union['system/inherited_asks_settled'].filter((f) => f !== 'uuid' && f !== 'session_id').join() && R.SHAPE_SINCE['system/inherited_asks_settled'] === '2.1.312', { lit12, ias: ias && [...ias.known] });
    const iasWhy = R.DECLARED_UPSTREAM_UNSEEN.system.inherited_asks_settled || '';
    ok('…it is DECLARED_UPSTREAM_UNSEEN — neither HANDLED nor KNOWN_IGNORED — and its disposition names the gate (the remote transport: reportKept = isRemoteTransport() && …), the measurement (a 2.1.312 killed with an ask unanswered and resumed said nothing of it) and what a card would do (close the permission cards it does not name); the §4 oracle reads the gate off the installed bundle', !HANDLED.has('inherited_asks_settled') && !IGN.has('inherited_asks_settled') && /isRemoteTransport\(\)/.test(iasWhy) && /MEASURED/.test(iasWhy) && /close the permission cards it does not name/.test(iasWhy), iasWhy);
    const nonRec12 = Object.keys(z312).filter((k) => !k.startsWith('system/')).sort();
    ok('every non-system zod key of the 2.1.312 dump is a ZOD_NON_RECORDS row, each on its literal — active / inactive (an API refusal body\'s cyber_verification), search_result_location (a web-search citation inside a text block), source_revision_not_on_remote_error / source_revision_stale_on_remote_error (a remote-session start\'s answer): none a stream record (no uuid / session_id), none a 2.1.308 key, and no row outside the dump', !!lit12 && nonRec12.join() === Object.keys(R.ZOD_NON_RECORDS).filter((k) => /^ignored — \(2\.1\.312\)/.test(R.ZOD_NON_RECORDS[k])).sort().join() && nonRec12.length === 5 && nonRec12.every((k) => /^ignored — \(2\.1\.312\)/.test(R.ZOD_NON_RECORDS[k]) && R.ZOD_NON_RECORDS[k].length > 60 && z312[k].includes('type:' + lit12 + '("' + k + '")') && !(d312.union[k] || []).includes('uuid') && !(d312.union[k] || []).includes('session_id') && !(k in d308.union)), nonRec12);
    const same14c = !!d312 && d308.sentences.rows.every((r) => d312.sentences.rows.some((x) => x.text === r.text && x.from === r.from));
    ok('§4d 2.1.312: the same 14 sentences on the same lists, only RENAMED (anchor ' + d308.sentences.anchor + ' → ' + (d312 && d312.sentences.anchor) + ', list ' + d308.sentences.list + ' → ' + (d312 && d312.sentences.list) + ', set ' + d308.sentences.set + ' → ' + (d312 && d312.sentences.set) + ') — no row moves list, none needs `until`; the nested objects equal 2.1.308\'s', same14c && d312.sentences.rows.length === 14 && d312.sentences.unresolved.length === 0 && d312.sentences.anchor !== d308.sentences.anchor && JSON.stringify(d312.nested) === JSON.stringify(d308.nested), d312 && d312.sentences.rows.map((x) => x.name + ':' + x.from));
    // what the REAL 2.1.312 writes (a loopback mock — a tool turn that took a frame in, a turn with a subagent, a Stop answered by the
    // second interrupt on its follow-up init): the one new field it carries, through the REAL normalizer — and the card it drew before this pin
    const FR12 = read('scripts/fixtures/claude-cli/2.1.312-frames.jsonl').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const res12 = FR12.filter((r) => r.type === 'result');
    ok('the real 2.1.312\'s stdout (scripts/fixtures/claude-cli/2.1.312-frames.jsonl, ' + FR12.length + ' records): every init names 2.1.312, EVERY result carries model_usage_since_last_result (' + res12.length + ' results, the interrupted ones too), NONE a shell_* / process_* / main_stream_* field (sent only by a worker Anthropic hosts), no inherited_asks_settled', FR12.filter((r) => r.subtype === 'init').length >= 3 && FR12.filter((r) => r.subtype === 'init').every((r) => r.claude_code_version === '2.1.312') && res12.length >= 5 && res12.some((r) => r.subtype === 'error_during_execution') && res12.every((r) => r.model_usage_since_last_result && typeof r.model_usage_since_last_result === 'object') && res12.every((r) => !Object.keys(r).some((k) => /^(shell_|process_|main_stream_)/.test(k))) && !FR12.some((r) => r.subtype === 'inherited_asks_settled'), res12.map((r) => Object.keys(r).filter((k) => /since_last|^shell_|^process_|^main_stream_/.test(k))));
    const SIDS12 = [...new Set(FR12.map((r) => r.session_id).filter(Boolean))];
    const live12 = (MMx) => SIDS12.map((conv) => {
      const x = MMx === MM ? createMessageManager('claude', conv) : new MMx.MessageManager(conv);
      for (const r of FR12.filter((y) => y.session_id === conv)) x.processLive(JSON.parse(JSON.stringify(r)));
      const cards = driftCards(x);
      return { cards: cards.length, fields: cards.flatMap((m) => m.content[0].fields).sort().join(), shapes: cards.map((m) => m.content[0].shape).join(), cli: cards.map((m) => m.content[0].cli).join(), rows: ledgerOf(conv, MMx).length };
    });
    const real12 = live12(MM);
    ok('the REAL normalizer on the real 2.1.312 stdout, conversation by conversation (' + SIDS12.length + ') ⇒ no drift card, no ledger row', SIDS12.length >= 3 && real12.every((c) => c.cards === 0 && c.rows === 0), real12);
    const M12 = mutantCopies('record-312', REPO);
    const FILL12 = 'for (const [key, fields] of Object.entries(FIELDS_312)) for (const [f, note] of Object.entries(fields)) if (!SHAPES[key].known.has(f)) SHAPES[key].ignored.set(f, note);';
    const rsSrc12 = read('src/record-shape.js'), mmSrc12 = read('src/message-manager.js');
    const MM12 = rsSrc12.split(FILL12).length === 2 && mmSrc12.split(REQ7).length === 2 ? require(M12.write('src/message-manager.js', editAnchor(mmSrc12, REQ7, 'require(' + JSON.stringify(M12.write('src/record-shape.js', editAnchor(rsSrc12, FILL12, '/* FIELDS_312 not filled (control) */', "src/record-shape.js"), 'no-312')) + ')', "src/message-manager.js"), 'mm-no-312')) : null;
    const ctl12 = MM12 && live12(MM12);
    ok('RED CONTROL: the same stdout on a copy without FIELDS_312 (the 7df30f96 tree on 2.1.312) ⇒ the card is back in EVERY conversation — ONE drift card on result naming model_usage_since_last_result alone, CLI 2.1.312, and its ledger row', !!ctl12 && ctl12.every((c) => c.cards === 1 && c.shapes === 'result' && c.fields === 'model_usage_since_last_result' && c.cli === '2.1.312' && c.rows === 1), ctl12);
    // A RECORD THE PRODUCT'S OWN INPUT CAUSES IS DECLARED WITH THE INPUT (lane claude-steer-inject r5): r4's chat wrapper stamps a uuid
    // on every mid-turn frame (the copy's witness), and the CLI then names the turn's consumed client uuids on its init —
    // `system/init.user_message_uuids`, declared upstream on assistant / result / stream_event only. Undeclared, it drew an
    // «added kind» chip + a drift-ledger row on every stamped frame (6 of 7 scenarios at 6334e9a8). The fixtures ARE the wrapper's
    // buffer (scripts/fixtures/claude-cli/<v>-stamped.jsonl: the real chat-wrapper + the real CLI against a loopback mock, a frame
    // handed into a text turn and run as its own turn, a frame held and drained; ids and paths replaced), fed record by record to
    // the LIVE normalizer exactly as the server parses the wrapper's stdout (the buffer-only copy lines skipped — never on stdout).
    const stampedOf = (v) => { try { return read('scripts/fixtures/claude-cli/' + v + '-stamped.jsonl').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return null; } };
    const liveStamped = (MMx, recs) => {
      const live = recs.filter((r) => !r.webui_copy);
      const convs = [...new Set(live.map((r) => r.session_id).filter(Boolean))];
      return convs.map((conv) => {
        const x = MMx === MM ? createMessageManager('claude', conv) : new MMx.MessageManager(conv);
        for (const r of live.filter((y) => !y.session_id || y.session_id === conv)) x.processLive(JSON.parse(JSON.stringify(r)));
        const cards = driftCards(x);
        return { added: x.addedKinds().map((k) => k.kind + ':' + k.name).join(), cards: cards.length, fields: cards.flatMap((m) => m.content[0].fields).join(), rows: ledgerOf(conv, MMx).length };
      });
    };
    const rsSrcU = read('src/record-shape.js'), mmSrcU = read('src/message-manager.js');
    const ROW_U = '    user_message_uuids: INIT_UUIDS_NOTE,\n';
    const MU = mutantCopies('record-init-uuids', REPO);
    const MMU = rsSrcU.split(ROW_U).length === 2 && mmSrcU.split(REQ7).length === 2 ? require(MU.write('src/message-manager.js', editAnchor(mmSrcU, REQ7, 'require(' + JSON.stringify(MU.write('src/record-shape.js', editAnchor(rsSrcU, ROW_U, '', "src/record-shape.js"), 'no-init-uuids')) + ')', "src/message-manager.js"), 'mm-no-init-uuids')) : null;
    ok('init.user_message_uuids is a CORPUS row (undeclared on init upstream), keyed by the builds it was MEASURED on (' + R.INIT_UUIDS_MEASURED.join(', ') + '), its reason naming the stamp that causes it — never known (nothing reads it)', R.INIT_UUIDS_MEASURED.includes('2.1.308') && R.INIT_UUIDS_MEASURED.includes('2.1.312') && R.SHAPES['claude:stream:system/init'].ignored.has('user_message_uuids') && !R.SHAPES['claude:stream:system/init'].known.has('user_message_uuids') && /MEASURED on 2\.1\.308 and 2\.1\.312/.test(R.SHAPES['claude:stream:system/init'].ignored.get('user_message_uuids')) && /stamps a uuid/.test(R.SHAPES['claude:stream:system/init'].ignored.get('user_message_uuids')) && !!MMU);
    for (const v of R.INIT_UUIDS_MEASURED) {
      const recs = stampedOf(v);
      const inits = (recs || []).filter((r) => r.type === 'system' && r.subtype === 'init' && Array.isArray(r.user_message_uuids));
      const copies = (recs || []).filter((r) => r.webui_copy);
      ok(v + ': the wrapper\'s buffer of a STAMPED run (scripts/fixtures/claude-cli/' + v + '-stamped.jsonl) — every init names ' + v + ', and the init of each turn that took a stamped frame says user_message_uuids = that frame\'s stamp (the copy\'s cliUuid)', !!recs && inits.length >= 2 && recs.filter((r) => r.subtype === 'init').every((r) => r.claude_code_version === v) && copies.length >= 2 && copies.every((c) => inits.some((i) => i.user_message_uuids.includes(c.cliUuid))), { inits: inits.length, copies: copies.map((c) => c.cliUuid) });
      const real = recs ? liveStamped(MM, recs) : [];
      ok(v + ': the LIVE normalizer over that buffer ⇒ no «added kind», no drift card, no ledger row (' + real.length + ' conversations)', real.length >= 2 && real.every((c) => !c.added && c.cards === 0 && c.rows === 0), real);
      const ctl = recs && MMU ? liveStamped(MMU, recs) : null;
      ok('RED CONTROL ' + v + ': the same buffer on a copy without the init row (the 6334e9a8 registry) ⇒ the «added kind» chip + ONE drift card on system/init naming user_message_uuids + its ledger row, in every conversation', !!ctl && ctl.every((c) => /fields:system\/init/.test(c.added) && c.cards === 1 && c.fields === 'user_message_uuids' && c.rows === 1), ctl);
    }
    // THE STAND-IN (scripts/fixtures/claude-stand-in-cli.cjs's shape, version-keyed by $STAND_IN_CLI_VERSION): a 2.1.312 stand-in writes
    // the measured 2.1.312 result (model_usage_since_last_result on every result), a 2.1.308 one the 2.1.308 result — both clean
    const standIn = (ver) => new Promise((resolve) => {
      const c = spawn(process.execPath, [path.join(REPO, 'scripts/fixtures/claude-stand-in-cli.cjs')], { stdio: ['pipe', 'pipe', 'ignore'], env: { PATH: process.env.PATH, ...(ver ? { STAND_IN_CLI_VERSION: ver } : {}) } });
      let buf = '';
      const recs = [];
      const done = () => { clearTimeout(t); try { c.kill(); } catch { } resolve({ init: (recs.find((x) => x.subtype === 'init') || {}).claude_code_version, uuids: (recs.find((x) => x.subtype === 'init') || {}).user_message_uuids || null, results: recs.filter((x) => x.type === 'result'), drift: recs.map((x) => R.unknownFields('claude', 'stream', x)).filter(Boolean) }); };
      const t = setTimeout(done, 5000);
      c.stdout.setEncoding('utf8');
      c.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); try { recs.push(JSON.parse(l)); } catch { } if (recs.some((x) => x.type === 'result')) return done(); } });
      c.stdin.write(JSON.stringify({ type: 'user', uuid: STAMP, message: { role: 'user', content: [{ type: 'text', text: 'hello' }] } }) + '\n');
    });
    const STAMP = '7e57a000-0000-4000-8000-00000000057a';
    const [si12, si08] = await Promise.all([standIn(null), standIn('2.1.308')]);
    ok('the stand-in CLI is version-keyed: by default it IS 2.1.312 (init claude_code_version 2.1.312, every result carries model_usage_since_last_result); STAND_IN_CLI_VERSION=2.1.308 writes the 2.1.308 result (no such field); both clean under the declarations', si12.init === '2.1.312' && si12.results.length >= 1 && si12.results.every((x) => x.model_usage_since_last_result && typeof x.model_usage_since_last_result === 'object') && si08.init === '2.1.308' && si08.results.length >= 1 && si08.results.every((x) => !('model_usage_since_last_result' in x)) && si12.drift.length === 0 && si08.drift.length === 0, { si12: { init: si12.init, results: si12.results.length, drift: si12.drift }, si08: { init: si08.init, results: si08.results.length } });
    ok('…and a STAMPED frame (r5): both versions\' init names it in user_message_uuids (the writer is in 2.1.307 on) — clean under the declarations', JSON.stringify(si12.uuids) === JSON.stringify([STAMP]) && JSON.stringify(si08.uuids) === JSON.stringify([STAMP]) && si12.drift.length === 0 && si08.drift.length === 0, { si12: si12.uuids, si08: si08.uuids });
    // THE 2.1.314 PIN (lane cli-2-1-314-records) — the box's claude SELF-UPDATED to 2.1.314 (2026-10-30 17:33 PT) and the strict oracle went
    // red on two lines («UNLISTED: ui_placed» · «UNCLASSIFIED: m9t = "${Nh} Correction to the text above: …"»). Its dump (strings over a
    // 0644 copy, the --auto road — the binary never run) minus the 2.1.312 dump, each decision on the dump
    const d314 = dumps.find((d) => d.version === '2.1.314');
    const z314 = (d314 && d314.zod) || {};
    const [, lit14] = (/^([^/]+)\/([^ ]+) @/.exec((d314 && d314.helpers[0]) || '') || []).slice(1);
    const WW = PO.PERMISSION_OUTCOME_ROWS.find((r) => r.id === 'ww'), M9 = PO.PERMISSION_OUTCOME_ROWS.find((r) => r.id === 'm9t');
    const diff14 = d314 && d312 ? dumpDiff(d312, d314) : null;
    ok('2.1.314 against 2.1.312 is exactly TWO changes (the dump diff, recomputed): ONE new key, system/ui_placed, and ONE new sentence, m9t — no field grew or went on any shape, no nested key, no key gone, no sentence gone; so no FIELDS_314', !!diff14 && diff14.changes === 2 && diff14.newKeys.join() === 'system/ui_placed' && diff14.goneKeys.length === 0 && Object.keys(diff14.fields).length === 0 && Object.keys(diff14.nested).length === 0 && diff14.sentencesAdded.length === 1 && !!M9 && diff14.sentencesAdded[0] === M9.text && diff14.sentencesGone.length === 0 && !('FIELDS_314' in R), diff14);
    // ui_placed — the plugin UI host's placed rows
    const up = R.SHAPES['claude:stream:system/ui_placed'], upLit = z314['system/ui_placed'] || '';
    ok('ui_placed: its zod literal in the dump (subtype:' + lit14 + '("ui_placed"), rows: [{plugin, id, request_id, after_uuid?}] — «The main conversation\'s placed rows, in order», each row the `ui_render` ask with component "Placed" that draws it), a stream shape row of exactly the literal\'s fields, SHAPE_SINCE 2.1.314', !!lit14 && upLit.includes('subtype:' + lit14 + '("ui_placed")') && /rows:[\w$]+\([\w$]+\(\{plugin:/.test(upLit) && upLit.includes('ui_render') && upLit.includes("The main conversation's placed rows, in order.") && !!up && [...up.known].join() === 'rows' && [...up.known].join() === (d314.union['system/ui_placed'] || []).filter((f) => f !== 'uuid' && f !== 'session_id').join() && R.SHAPE_SINCE['system/ui_placed'] === '2.1.314', { upLit, known: up && [...up.known] });
    ok('…it is KNOWN_IGNORED (card-less) like the 2.1.288 ui_* — neither HANDLED nor declared-unseen: a placement list with no words for any card (no text / message / content field)', IGN.has('ui_placed') && !HANDLED.has('ui_placed') && !('ui_placed' in R.DECLARED_UPSTREAM_UNSEEN.system) && !/text:|message:|content:/.test(upLit.replace(/describe\((?:"[^"]*"|'[^']*')\)/g, '')));
    const noUp = { ...R, SHAPES: Object.fromEntries(Object.entries(R.SHAPES).filter(([k]) => k !== 'claude:stream:system/ui_placed')), SHAPE_SINCE: Object.fromEntries(Object.entries(R.SHAPE_SINCE).filter(([k]) => k !== 'system/ui_placed')) };
    let nUp14 = null, nUp12 = null;
    const hadUp = IGN.has('ui_placed');
    IGN.delete('ui_placed');
    try { if (d314) { nUp14 = judgeDump(noUp, d314); nUp12 = judgeDump(noUp, d312); } } finally { if (hadUp) IGN.add('ui_placed'); }
    ok('CONTROL: the lists and shapes without ui_placed (the .366 tree) are red on the 2.1.314 dump — exactly «UNLISTED system/ui_placed», the box\'s drift line — and green on 2.1.312', !!nUp14 && nUp14.join() === 'UNLISTED system/ui_placed' && nUp12.length === 0, { nUp14, nUp12 });
    const upRec = (conv) => ({ type: 'system', subtype: 'ui_placed', rows: [{ plugin: 'acme-notes', id: 'row-1', request_id: 'inst-1', after_uuid: 'u-314-0' }, { plugin: 'acme-notes', id: 'row-2', request_id: 'inst-2' }], uuid: 'u-314-up', session_id: conv });
    const liveUp = (MMx, conv) => { const x = MMx === MM ? createMessageManager('claude', conv) : new MMx.MessageManager(conv); x.processLive(upRec(conv)); return { unknown: unknownCards(x).length, drift: driftCards(x).length, rows: ledgerOf(conv, MMx).length, all: x.messages.length }; };
    const realUp = liveUp(MM, 'e2e00000-0000-4000-8000-0000000003c1');
    ok('the REAL normalizer on a 2.1.314 ui_placed record (the literal\'s shape) ⇒ no card of any kind, no ledger row, no message', realUp.unknown === 0 && realUp.drift === 0 && realUp.rows === 0 && realUp.all === 0, realUp);
    const M14 = mutantCopies('record-314', REPO);
    const mmSrc14 = read('src/message-manager.js'), UP_LINE = mmSrc14.split('\n').filter((l) => l.startsWith("  'ui_placed',"));
    const MMup = UP_LINE.length === 1 ? require(M14.write('src/message-manager.js', editAnchor(mmSrc14, UP_LINE[0] + '\n', '', "src/message-manager.js"), 'no-ui-placed')) : null;
    const ctlUp = MMup && liveUp(MMup, 'e2e00000-0000-4000-8000-0000000003c2');
    ok('RED CONTROL: the same record on a copy without the ui_placed row (the .366 tree on 2.1.314) ⇒ the red «Unknown event» card is back, and no drift card', !!ctlUp && ctlUp.unknown === 1 && ctlUp.drift === 0, ctlUp);
    // m9t — the correction: ww's sentence plus « Correction to the text above: this call was stopped while running, …»
    const s14 = d314 && M9 && d314.sentences.rows.find((x) => x.text === M9.text);
    const same14d = !!d314 && d312.sentences.rows.every((r) => d314.sentences.rows.some((x) => x.text === r.text && x.from === r.from));
    ok('§4d 2.1.314: the 14 sentences of 2.1.312 on the same lists (renamed: anchor ' + d312.sentences.anchor + ' → ' + (d314 && d314.sentences.anchor) + ', list ' + d312.sentences.list + ' → ' + (d314 && d314.sentences.list) + ') and ONE more on the exact is_error set only (bare and with its suffix, on no ' + (d314 && d314.sentences.list) + '()) — ' + (s14 && s14.name) + ' = ww\'s sentence + « Correction to the text above: this call was stopped while running, not refused before it ran. …» (its template `${…} Correction…` EXPANDED by the extractor to the text the tool_result carries)', same14d && d314.sentences.rows.length === 15 && d314.sentences.unresolved.length === 0 && !!s14 && s14.from === 'IS' && M9.text.startsWith(WW.text) && M9.text.slice(WW.text.length).startsWith(' Correction to the text above: this call was stopped while running, not refused before it ran. It may have run in part or in full'), s14);
    const po = (t, e = true) => PO.permissionOutcome(t, e).outcome;
    ok('the row m9t: outcome STOPPED (the call ran — allowed, then cut off; never «denied», never «Not run»), since 2.1.314, on the exact is_error set (binary IS), its text the dump\'s; the LONGEST matching row wins — m9t (and m9t + a suffix) ⇒ stopped, ww alone ⇒ denied; isStoppedRun is the one speller', !!M9 && M9.outcome === 'stopped' && PO.PERMISSION_OUTCOMES.includes('stopped') && M9.since === '2.1.314' && M9.binary === 'IS' && M9.match === 'prefix' && !!s14 && po(M9.text) === 'stopped' && PO.permissionOutcome(M9.text, true).row.id === 'm9t' && po(M9.text + '\n\nNote: a suffix') === 'stopped' && po('  ' + M9.text) === 'stopped' && po(WW.text) === 'denied' && po(M9.text, false) === 'allowed' && PO.isStoppedRun(M9.text) && !PO.isStoppedRun(WW.text) && !PO.isStoppedRun(M9.text, false));
    const c9 = d314 && outcomeCensus(d314.sentences.rows, PO.PERMISSION_OUTCOME_ROWS.filter((r) => r.id !== 'm9t'), '');
    ok('CONTROL: the table without the m9t row (the .366 tree) leaves exactly that sentence UNCLASSIFIED on the 2.1.314 dump — named by the row it extends: «' + (c9 && c9.unclassified[0] || '').slice(0, 70) + '…» — and nothing on 2.1.312', !!c9 && c9.unclassified.length === 1 && /^[\w$]+ = ww \+ " Correction to the text above: this call was stopped while running/.test(c9.unclassified[0]) && outcomeCensus(d312.sentences.rows, PO.PERMISSION_OUTCOME_ROWS.filter((r) => r.id !== 'm9t'), '').unclassified.length === 0, c9);
    const poSrc = read('src/permission-outcome.js');
    const LOOK_A = '  let hit = null;\n', LOOK_B = "  return hit ? { outcome: hit.outcome, row: hit } : { outcome: 'unknown', row: null };\n";
    const iA = poSrc.indexOf(LOOK_A), iB = poSrc.indexOf(LOOK_B);
    const POfirst = iA > 0 && iB > iA ? require(M14.write('src/permission-outcome.js', poSrc.slice(0, iA) + "  for (const r of PERMISSION_OUTCOME_ROWS) if (r.match === 'prefix' ? t.startsWith(r.text) : s.includes(r.text)) return { outcome: r.outcome, row: r };\n  let hit = null;\n" + poSrc.slice(iB), 'first-match')) : null;
    const fm = POfirst && POfirst.permissionOutcome(M9.text, true);
    ok('RED CONTROL: a copy with the pre-lane FIRST-match lookup (the m9t row and all) reads m9t «denied» by the ww row — ww is its prefix and comes first: the longest-match rule is what makes the row work', !!fm && fm.outcome === 'denied' && fm.row.id === 'ww', fm && { outcome: fm.outcome, row: fm.row && fm.row.id });
    // the extractor's expansion, on a synthetic 2.1.314-shaped chunk — and the copy that reads the template raw
    const mini314 = 'var gf="[Request interrupted by user for tool use]",BA="The user doesn\'t want to take this action right now.",Dk="[Request interrupted by user]";\nvar Nh="The user doesn\'t want to proceed with this tool use. The tool use was rejected.",m9t=`${Nh} Correction to the text above: this call was stopped while running.`,Zq=`${e} a sentence built on a variable`,GPt="User rejected tool use";function Jm(){return[Nh,BA,gf]}\nvar Kr=new Set([Dk,gf,BA,BA+SBe,Nh,Nh+SBe,m9t,m9t+SBe,Zq]);';
    const e14 = extractPermissionSentences(mini314), m9s = e14.sentences && e14.sentences.find((x) => x.name === 'm9t');
    ok('the extractor on a synthetic 2.1.314-shaped chunk: m9t = `${Nh} Correction…` is EXPANDED to Nh\'s sentence + the correction (from IS — in the set bare and with its suffix, counted once); a template built on a non-member (`${e} …`) is UNRESOLVED, named — never a raw «${…}» row', !e14.error && e14.list === 'Jm' && e14.set === 'Kr' && !!m9s && m9s.text === "The user doesn't want to proceed with this tool use. The tool use was rejected. Correction to the text above: this call was stopped while running." && m9s.from === 'IS' && e14.sentences.length === 5 && e14.unresolved.join() === 'Zq (interpolates e — not a census sentence)', e14);
    const dumpSrc14 = read('scripts/claude-cli-dump.mjs'), EXPAND = dumpSrc14.split('\n').filter((l) => l.includes('x.text = x.text.replace(/\\$\\{([^}]*)\\}/g'));
    const rawX = EXPAND.length === 1 ? await import(pathToFileURL(M14.write('scripts/claude-cli-dump.mjs', dumpSrc14.replace(EXPAND[0], '    /* no expansion (control) */'), 'no-expand')).href) : null;
    const rawMini = rawX && rawX.extractPermissionSentences(mini314), rawM9 = rawMini && rawMini.sentences.find((x) => x.name === 'm9t');
    const rawGhost = rawMini && outcomeCensus(rawMini.sentences, [{ id: 'm9t', binary: 'Gd', text: m9s ? m9s.text : '?' }], '').ghosts;
    ok('RED CONTROL: a copy of the extractor that reads the template RAW keeps «${Nh} Correction…» — the row is a GHOST and the box\'s drift line comes back verbatim («${Nh} Correction to the text above…»)', EXPAND.length === 1 && !!rawM9 && rawM9.text.startsWith('${Nh} Correction to the text above') && rawGhost.join() === 'm9t (Gd)', { expand: EXPAND.length, raw: rawM9 && rawM9.text, rawGhost });
    ok('the copies live outside the tree', M14.files.every((f) => !f.startsWith(REPO)));
    // THE 2.1.319 PIN (lane cli-2-1-319-records) — the box's claude SELF-UPDATED to 2.1.319 (2026-11-06 16:27 PT) and the strict oracle went red on
    // four lines (§4d's «[Agent call interrupted: …», UNLISTED session_writes_lost, the undeclared stream fields, the nested). Its dump (strings over
    // a 0644 copy — the binary never run) minus the 2.1.314 dump, each decision on the dump. The dump's walker first said «result/success gone»:
    // that literal grew to 58 668 characters, past the walker's 40 000 bound, and the shape vanished with no word (eight fields hidden with it).
    const d319 = dumps.find((d) => d.version === '2.1.319');
    const z319 = (d319 && d319.zod) || {};
    const diff19 = d319 && d314 ? dumpDiff(d314, d319) : null;
    const [, lit19] = (/^([^/]+)\/([^ ]+) @/.exec((d319 && d319.helpers[0]) || '') || []).slice(1);
    ok('2.1.319 against 2.1.314 (the dump diff, recomputed): new keys message_pdf_reads, not_forwarded, system/session_writes_lost; file_unchanged gone; ONE sentence added, none gone; fields grew on exactly these ten keys, none went; ONE nested key', !!diff19 && diff19.newKeys.join() === 'message_pdf_reads,not_forwarded,system/session_writes_lost' && diff19.goneKeys.join() === 'file_unchanged' && diff19.sentencesAdded.length === 1 && diff19.sentencesGone.length === 0 && Object.keys(diff19.fields).sort().join() === 'evaluated,result,result/success,sse,system/informational,system/init,system/model_refusal_fallback,system/status,user,workflow_agent' && JSON.stringify(diff19.nested) === JSON.stringify({ 'rate_limit_event.rate_limit_info': { add: ['dailyCapPaused'], gone: [] } }) && Object.values(diff19.fields).every((f) => f.gone.length === 0), diff19);
    const NON_STREAM19 = Object.keys((diff19 && diff19.fields) || {}).filter((k) => !R.SHAPES['claude:stream:' + (k === 'result/success' ? 'result' : k)]);
    const streamAdds19 = [...new Set(Object.entries((diff19 && diff19.fields) || {}).filter(([k]) => !NON_STREAM19.includes(k)).flatMap(([k, f]) => f.add.map((x) => 'claude:stream:' + (k === 'result/success' ? 'result' : k) + '.' + x)))].sort();
    const f319 = Object.entries(R.FIELDS_319 || {}).flatMap(([k, m]) => Object.keys(m).map((x) => k + '.' + x)).sort();
    ok('FIELDS_319: 19 fields on six stream shapes ARE the dump diff, computed (every field 2.1.319 added to a declared stream shape is a row, no row outside it), each IGNORED with a one-line reason naming 2.1.319 (no reader in the tree), never known', f319.length === 19 && JSON.stringify(f319) === JSON.stringify(streamAdds19) && f319.every((kf) => { const c = kf.lastIndexOf('.'), sp = R.SHAPES[kf.slice(0, c)], x = kf.slice(c + 1); return !sp.known.has(x) && sp.ignored.has(x) && /\(2\.1\.319\)/.test(sp.ignored.get(x)) && sp.ignored.get(x).length > 60; }), { f319, streamAdds19 });
    ok('…and what the diff grew off a stream shape is named, never a stream row: ' + NON_STREAM19.join(', ') + ' — each classified on its key in FIELDS_319_ELSEWHERE, with its reason (none reaches a card)', NON_STREAM19.sort().join() === 'evaluated,sse,workflow_agent' && NON_STREAM19.every((k) => diff19.fields[k].add.every((x) => ((R.FIELDS_319_ELSEWHERE || {})[k + '.' + x] || '').length > 60)) && Object.keys(R.FIELDS_319_ELSEWHERE || {}).length === 3, R.FIELDS_319_ELSEWHERE);
    ok('…and the three zod non-records: message_pdf_reads an ATTACHMENT_PAYLOADS row (its literal `reads`: base64 for the model, no card), not_forwarded a ZOD_NON_RECORDS row (an MCP proxy\'s error body), neither a stream record; file_unchanged, gone, was never a row', /^ignored — \(2\.1\.319\)/.test(R.ATTACHMENT_PAYLOADS.message_pdf_reads) && /^ignored — \(2\.1\.319\)/.test(R.ZOD_NON_RECORDS.not_forwarded) && /reads:/.test(z319.message_pdf_reads || '') && /not_forwarded/.test(z319.not_forwarded || '') && !!d319 && !(d319.union.message_pdf_reads || []).includes('uuid') && !R.SHAPES['claude:stream:file_unchanged'] && !('file_unchanged' in R.ATTACHMENT_PAYLOADS) && !('file_unchanged' in R.ZOD_NON_RECORDS), { z: Object.keys(z319) });
    // the walker's bound: the hole that hid eight of those fields
    const dumpSrc19 = read('scripts/claude-cli-dump.mjs');
    const bigLit = (n) => 'u({type:A("system"),subtype:A("compact_boundary"),note:A()});u({type:A("result"),subtype:A("success"),' + Array.from({ length: n }, (_, i) => 'f' + i + ':A()').join(',') + ',uuid:A(),session_id:A()})';
    const big50k = extractZodUnion(bigLit(6000)), huge = extractZodUnion(bigLit(60000));
    ok('every pinned dump has result/success and no `unclosed`; 2.1.319\'s carries its eight own fields. A literal past the old 40 000 bound is READ (' + bigLit(6000).length + ' chars); one past UNION_LITERAL_BOUND is NAMED in `unclosed`, never silently absent', dumps.every((d) => Array.isArray(d.union['result/success']) && !d.unclosed) && !!d319 && ['process_turn_states', 'request_build_detail', 'text_post_count'].every((f) => d319.union['result/success'].includes(f)) && bigLit(6000).length > 40000 && (big50k.union['result/success'] || []).length === 6002 && !big50k.unclosed && huge.unclosed && huge.unclosed.join() === 'result/success' && !huge.union['result/success'], { big: (big50k.union['result/success'] || []).length, unclosed: huge.unclosed });
    const M19 = mutantCopies('record-319', REPO);
    const oldWalk = dumpSrc19.includes('UNION_LITERAL_BOUND = 400000') ? await import(pathToFileURL(M19.write('scripts/claude-cli-dump.mjs', dumpSrc19.replace('UNION_LITERAL_BOUND = 400000', 'UNION_LITERAL_BOUND = 40000').replace("if (j < 0) { if (!unclosed.includes(key)) unclosed.push(key); continue; }", 'if (j < 0) continue;'), 'old-walk')).href) : null;
    const oldU = oldWalk && oldWalk.extractZodUnion(bigLit(6000));
    ok('RED CONTROL: the walker with its old bound and silent skip (the 8b3fdb6ab extractor) reads the same literal as NOTHING: no key, no error, no word — the dump diff\'s «result/success gone»', !!oldU && !oldU.error && !oldU.union['result/success'] && !oldU.unclosed && !!oldU.union['system/compact_boundary'], oldU && Object.keys(oldU.union));
    const lowWalk = dumpSrc19.includes('UNION_LITERAL_BOUND = 400000') ? await import(pathToFileURL(M19.write('scripts/claude-cli-dump.mjs', dumpSrc19.replace('UNION_LITERAL_BOUND = 400000', 'UNION_LITERAL_BOUND = 50000'), 'low-walk')).href) : null;
    const lowU = lowWalk && lowWalk.extractZodUnion(bigLit(6000));
    ok('r2: RED CONTROL for the live §4 leg: a walker with its bound at 50 000 NAMES the literal it cannot read (the mutant that left every live leg green), so §4 fails on it, by name, on the gate a new CLI hits first', !!lowU && Array.isArray(lowU.unclosed) && lowU.unclosed.join() === 'result/success', lowU && lowU.unclosed);
    const prevDraft = { version: '2.1.999', union: { 'result/success': ['a'], 'system/compact_boundary': ['note'], 'gone_for_real': ['x'] }, nested: {}, sentences: { rows: [] } };
    const hugeDump = typeof dumpBinary === 'function' ? dumpBinary('/nonexistent/claude', [], { text: bigLit(60000), version: '2.1.1000' }) : null;
    const draftDiff = hugeDump && dumpDiff(prevDraft, hugeDump);
    ok('r2: the hub\'s draft: a dump carries `unclosed`, and its diff against the newest build names the key there, counted as a change, NEVER in goneKeys — only a key really absent is gone', !!hugeDump && (hugeDump.unclosed || []).join() === 'result/success' && !!draftDiff && (draftDiff.unclosed || []).join() === 'result/success' && draftDiff.goneKeys.join() === 'gone_for_real' && draftDiff.changes >= 2, draftDiff && { gone: draftDiff.goneKeys, unclosed: draftDiff.unclosed, changes: draftDiff.changes });
    // session_writes_lost — the writes the disk refused
    const swl = R.SHAPES['claude:stream:system/session_writes_lost'], swlLit = z319['system/session_writes_lost'] || '';
    ok('session_writes_lost: its zod literal in the dump (subtype:' + lit19 + '("session_writes_lost"): error_code, lost, transcript_session_ids; «More codes may be added», «More values may be added»), a stream shape row of exactly the literal\'s fields, no enums, SHAPE_SINCE 2.1.319', !!lit19 && swlLit.includes('subtype:' + lit19 + '("session_writes_lost")') && /error_code:/.test(swlLit) && /lost:/.test(swlLit) && /transcript_session_ids:/.test(swlLit) && /More codes may be added/.test(swlLit) && !!swl && [...swl.known].sort().join() === 'error_code,lost,transcript_session_ids' && Object.keys(swl.enums).length === 0 && R.SHAPE_SINCE['system/session_writes_lost'] === '2.1.319');
    ok('…it is on EXACTLY one list, HANDLED — a lost write is a warning the person must hear, though the binary calls it «Safe to ignore»', HANDLED.has('session_writes_lost') && !IGN.has('session_writes_lost') && !('session_writes_lost' in R.DECLARED_UPSTREAM_UNSEEN.system));
    const noSwl = { ...R, SHAPES: Object.fromEntries(Object.entries(R.SHAPES).filter(([k]) => k !== 'claude:stream:system/session_writes_lost')), SHAPE_SINCE: Object.fromEntries(Object.entries(R.SHAPE_SINCE).filter(([k]) => k !== 'system/session_writes_lost')) };
    let nSwl19 = null, nSwl14 = null;
    HANDLED.delete('session_writes_lost');
    try { if (d319) { nSwl19 = judgeDump(noSwl, d319); nSwl14 = judgeDump(noSwl, d314); } } finally { HANDLED.add('session_writes_lost'); }
    ok('CONTROL: the lists and shapes without session_writes_lost (the 8b3fdb6ab tree) are red on the 2.1.319 dump — exactly «UNLISTED system/session_writes_lost», the gate\'s line — and green on 2.1.314', !!nSwl19 && nSwl19.join() === 'UNLISTED system/session_writes_lost' && nSwl14.length === 0, { nSwl19, nSwl14 });
    const swlRec = (conv, over = {}) => ({ type: 'system', subtype: 'session_writes_lost', error_code: 'ENOSPC', lost: ['transcript', 'global_config'], transcript_session_ids: [conv], uuid: 'u-319-swl', session_id: conv, ...over });
    const liveSwl = (MMx, conv, over) => { const x = MMx === MM ? createMessageManager('claude', conv) : new MMx.MessageManager(conv); x.processLive(swlRec(conv, over)); const line = x.messages.find((m) => m.content && m.content[0] && m.content[0].type === 'harness_informational'); return { unknown: unknownCards(x).length, drift: driftCards(x).length, rows: ledgerOf(conv, MMx).length, all: x.messages.length, say: line && line.content[0].say, level: line && line.content[0].level, params: line && line.content[0].params, text: line && line.content[0].text }; };
    const realSwl = liveSwl(MM, 'e2e00000-0000-4000-8000-0000000003d1');
    ok('the REAL normalizer on a 2.1.319 session_writes_lost (the literal\'s shape) ⇒ ONE warning line in our words (say writes-lost, level warning, the code and the kinds in params), no unknown card, no drift card, no ledger row', realSwl.unknown === 0 && realSwl.drift === 0 && realSwl.rows === 0 && realSwl.all === 1 && realSwl.say === 'writes-lost' && realSwl.level === 'warning' && realSwl.params.code === 'ENOSPC' && realSwl.params.lost.join() === 'transcript,global_config' && /the disk is full/.test(realSwl.text), realSwl);
    const swlNext = liveSwl(MM, 'e2e00000-0000-4000-8000-0000000003d2', { error_code: 'EIO', lost: ['plugin_cache'] });
    ok('…a code or a kind this release has no word for («More codes may be added») is still the warning, in the general words — no drift card, no unknown card', swlNext.unknown === 0 && swlNext.drift === 0 && swlNext.level === 'warning' && swlNext.params.code === 'EIO' && /a disk write failed \(EIO\)/.test(swlNext.text), swlNext);
    const mmSrc19 = read('src/message-manager.js'), SWL_LINE = mmSrc19.split('\n').filter((l) => l.startsWith("  'session_writes_lost',"));
    const MMswl = SWL_LINE.length === 1 && mmSrc19.includes("if (raw.subtype === 'session_writes_lost') {") ? require(M19.write('src/message-manager.js', editAnchor(editAnchor(mmSrc19, SWL_LINE[0] + '\n', '', "src/message-manager.js"), "if (raw.subtype === 'session_writes_lost') {", 'if (false) {', "src/message-manager.js"), 'no-swl')) : null;
    const ctlSwl = MMswl && liveSwl(MMswl, 'e2e00000-0000-4000-8000-0000000003d3');
    ok('RED CONTROL: the same record on a copy without the row (the 8b3fdb6ab tree on 2.1.319) ⇒ the unknown-record notice — which a person\'s chat never draws (lane door-healthy-chat: only the status chip counts it) — and no warning line: the lost write said nothing', !!ctlSwl && ctlSwl.unknown === 1 && !ctlSwl.say, ctlSwl);
    // the new fields on a live result / init / user / status: declared ⇒ no drift card
    const fieldRecs19 = (conv) => [
      { type: 'system', subtype: 'init', session_id: conv, uuid: 'u-319-i', claude_code_version: '2.1.319', model: 'claude-fable-5', cwd: '/x', tools: [], mcp_servers: [], permissionMode: 'default', apiKeySource: 'none', ultrathink_available: true, ultrathink_typed_raises: true, synced_skills_path: '/x/s', client_thinking: { max_thinking_tokens: 0, thinking_display: null }, flag_restate_noop: true },
      { type: 'system', subtype: 'status', session_id: conv, uuid: 'u-319-s', status: null, resume_held_for_plan: true },
      { type: 'system', subtype: 'informational', session_id: conv, uuid: 'u-319-n', content: 'Model fable is not available; using sonnet.', level: 'warning', model_restriction: { requested_model: 'fable', effective_model: 'sonnet', at: 'start' } },
      { type: 'rate_limit_event', session_id: conv, uuid: 'u-319-r', rate_limit_info: { status: 'allowed', dailyCapPaused: true } },
      { type: 'user', session_id: conv, uuid: 'u-319-p', message: { role: 'user', content: 'Run the review' }, plugin_prompt: { name: 'acme-notes', text: 'Run the review' } },
      { type: 'system', subtype: 'model_refusal_fallback', session_id: conv, uuid: 'u-319-f', original_model: 'claude-fable-5', fallback_model: 'claude-opus-5-5', api_refusal_category: 'cyber', content: 'Switched models.', api_refusal_cyber_verification: { type: 'inactive' } },
      { type: 'result', subtype: 'success', session_id: conv, uuid: 'u-319-t', is_error: false, num_turns: 1, result: 'ok', duration_ms: 1, duration_api_ms: 1, stop_reason: 'end_turn', total_cost_usd: 0, usage: {}, modelUsage: {}, permission_denials: [], stopped_by_permission_check: true, credential_expires_at: '2026-12-01T00:00:00.000Z', process_turn_states: {}, process_turn_threads: {}, tool_schema_build_detail: {}, message_normalization_detail: {}, request_build_detail: {}, text_post_count: 1, text_post_gap_over_500ms_count: 0, text_post_flush_timer_max_late_ms: 0 },
    ];
    const liveF19 = (MMx, conv) => { const x = MMx === MM ? createMessageManager('claude', conv) : new MMx.MessageManager(conv); for (const r of fieldRecs19(conv)) x.processLive(JSON.parse(JSON.stringify(r))); return { unknown: unknownCards(x).length, drift: driftCards(x).length, rows: ledgerOf(conv, MMx).length }; };
    const realF19 = liveF19(MM, 'e2e00000-0000-4000-8000-0000000003d4');
    ok('the REAL normalizer on a 2.1.319 conversation carrying every new stream field (init, status, informational, rate limit, user, model refusal, result) ⇒ no drift card, no ledger row, no unknown card', realF19.unknown === 0 && realF19.drift === 0 && realF19.rows === 0, realF19);
    const rsSrc19 = read('src/record-shape.js'), FILL19 = "for (const [key, fields] of Object.entries(FIELDS_319)) for (const [f, note] of Object.entries(fields)) if (!SHAPES[key].known.has(f)) SHAPES[key].ignored.set(f, note);\n";
    const NEST19 = rsSrc19.split('\n').filter((l) => l.startsWith('    dailyCapPaused: NESTED_NOTE('));
    const REQ19 = "require('./record-shape.js')";
    const MMno19 = rsSrc19.includes(FILL19) && NEST19.length === 1 && mmSrc19.split(REQ19).length === 2 ? require(M19.write('src/message-manager.js', editAnchor(mmSrc19, REQ19, 'require(' + JSON.stringify(M19.write('src/record-shape.js', editAnchor(editAnchor(rsSrc19, FILL19, '', "src/record-shape.js"), NEST19[0] + '\n', '', "src/record-shape.js"), 'no-fields-319')) + ')', "src/message-manager.js"), 'mm-no-fields-319')) : null;
    const ctlF19 = MMno19 && liveF19(MMno19, 'e2e00000-0000-4000-8000-0000000003d5');
    ok('RED CONTROL: the same conversation on a copy without FIELDS_319 + dailyCapPaused (the 8b3fdb6ab tree on 2.1.319) ⇒ the drift cards and the ledger rows are back', !!ctlF19 && ctlF19.drift >= 3 && ctlF19.rows >= 3, ctlF19);
    // LAW 3, FOR THE PERSON (主开发 on the interim): what each new shape DOES show. An unknown record is silence in a person's chat (lane door-healthy-chat), so a
    // bare «no unknown card» proves nothing. A closed table of the dump diff's own names: a warning line, card words, or NOTHING by design — and nothing is measured.
    const DOORS19 = { warning: ['system/session_writes_lost'], card: ['[Agent call interrupted:'], nothing: ['message_pdf_reads', 'not_forwarded', ...f319.map((kf) => kf.replace(/^claude:stream:/, '')), 'rate_limit_event.rate_limit_info.dailyCapPaused', 'evaluated.cited_rule', 'sse.displayName', 'workflow_agent.endedWithRun'] };
    const named19 = diff19 ? [...diff19.newKeys, ...diff19.sentencesAdded.map((t) => t.slice(0, 24)), ...Object.entries(diff19.fields).flatMap(([k, f]) => f.add.map((x) => (k === 'result/success' ? 'result' : k) + '.' + x)), ...Object.entries(diff19.nested).flatMap(([k, f]) => f.add.map((x) => k + '.' + x))] : [];
    const doored19 = new Set(Object.values(DOORS19).flat());
    ok('every name the 2.1.319 dump diff added has ONE door for the person — session_writes_lost a warning line, the sentence its card words, the other ' + DOORS19.nothing.length + ' nothing, by design — and a name with no door fails here', named19.length >= 24 && named19.every((n) => doored19.has(n)) && Object.values(DOORS19).flat().length === doored19.size, named19.filter((n) => !doored19.has(n)));
    const strip19 = (r) => { const c = JSON.parse(JSON.stringify(r)); for (const kf of DOORS19.nothing) { const [k, x] = [kf.slice(0, kf.lastIndexOf('.')), kf.slice(kf.lastIndexOf('.') + 1)]; if (k === (r.type === 'system' ? 'system/' + r.subtype : r.type)) delete c[x]; } if (c.rate_limit_info) delete c.rate_limit_info.dailyCapPaused; return c; };
    const drawn19 = (recs, conv) => { const x = createMessageManager('claude', conv); for (const r of recs) x.processLive(JSON.parse(JSON.stringify(r))); return x.messages.map((m) => JSON.stringify({ role: m.role, status: m.status, kind: m.noticeKind || null, content: m.content, turn: m.turnIndex })); };
    const C19 = 'e2e00000-0000-4000-8000-0000000003d7', full19 = drawn19(fieldRecs19(C19), C19), bare19 = drawn19(fieldRecs19(C19).map(strip19), C19);
    const stripped19 = fieldRecs19(C19).map(strip19);
    ok('«nothing, by design» is MEASURED: the same conversation (' + full19.length + ' messages) with every such field and with them stripped draws the same messages word for word — no field reaches a person', full19.length >= 3 && JSON.stringify(full19) === JSON.stringify(bare19) && stripped19.every((r) => !('credential_expires_at' in r) && !('plugin_prompt' in r) && !('ultrathink_available' in r) && !('resume_held_for_plan' in r) && !('model_restriction' in r) && !('api_refusal_cyber_verification' in r)) && !(stripped19.find((r) => r.rate_limit_info) || { rate_limit_info: { dailyCapPaused: 1 } }).rate_limit_info.dailyCapPaused, { full: full19.length, bare: bare19.length });
    const pdf19 = createMessageManager('claude', 'e2e00000-0000-4000-8000-0000000003d8');
    pdf19.convertHistory([{ type: 'attachment', uuid: 'u-319-d', sessionId: 'e2e00000-0000-4000-8000-0000000003d8', attachment: { type: 'message_pdf_reads', reads: [{ path: '/x/a.pdf', pages: 2, result: { type: 'text', text: 'the pages' } }] } }]);
    ok('message_pdf_reads, off the transcript: no message of any kind — the model\'s bytes are never a person\'s card', pdf19.messages.length === 0, pdf19.messages);
    const wfItem = { type: 'workflow_agent', index: 0, label: 'Survey', state: 'stopped', agentId: 'a1' };
    const wfWith = MM.normalizeWorkflowProgress([{ ...wfItem, endedWithRun: 'stopped' }]), wfNo = MM.normalizeWorkflowProgress([wfItem]);
    ok('workflow_agent.endedWithRun: the Workflow card\'s reader takes the same row with it and without it — the row keeps reading `state`', JSON.stringify(wfWith) === JSON.stringify(wfNo) && JSON.stringify(wfWith).includes('Survey') && !JSON.stringify(wfWith).includes('endedWithRun'), { wfWith, wfNo });
    // OU — «[Agent call interrupted: …»
    const OUr = PO.PERMISSION_OUTCOME_ROWS.find((r) => r.id === 'OU'), sOU = d319 && OUr && d319.sentences.rows.find((x) => x.text === OUr.text);
    ok('§4d 2.1.319: the 15 sentences of 2.1.314 on the same lists (renamed: anchor ' + (d314 && d314.sentences.anchor) + ' → ' + (d319 && d319.sentences.anchor) + ', list ' + (d314 && d314.sentences.list) + ' → ' + (d319 && d319.sentences.list) + ', m9t → aan) and ONE more on BOTH — ' + (sOU && sOU.name) + ' «[Agent call interrupted: …»', !!d319 && d314.sentences.rows.every((r) => d319.sentences.rows.some((x) => x.text === r.text && x.from === r.from)) && d319.sentences.rows.length === d314.sentences.rows.length + 1 && !!sOU && sOU.name === 'OU' && sOU.from === 'both', sOU);
    const po19 = (t, e = true) => PO.permissionOutcome(t, e).outcome;
    ok('the row OU: outcome STOPPED (an agent the process died under ran, returned nothing — nobody refused it; never «denied», never «Not run»), since 2.1.319, on the census list (binary Gd), its text the dump\'s; isStoppedRun and isAgentCutOff say so; m9t is stopped but no agent cut-off; a non-error is allowed', !!OUr && OUr.outcome === 'stopped' && OUr.since === '2.1.319' && OUr.binary === 'Gd' && OUr.match === 'prefix' && po19(OUr.text) === 'stopped' && PO.isStoppedRun(OUr.text) && PO.isAgentCutOff(OUr.text) && !PO.isAgentCutOff(M9.text) && PO.isStoppedRun(M9.text) && !PO.isAgentCutOff(OUr.text, false) && po19(OUr.text, false) === 'allowed', OUr);
    const c19 = d319 && outcomeCensus(d319.sentences.rows, PO.PERMISSION_OUTCOME_ROWS.filter((r) => r.id !== 'OU'), '');
    ok('CONTROL: the table without the OU row (the 8b3fdb6ab tree) leaves exactly that sentence UNCLASSIFIED on the 2.1.319 dump — the gate\'s §4d line — and nothing on 2.1.314', !!c19 && c19.unclassified.length === 1 && c19.unclassified[0].includes('[Agent call interrupted: the process running this conversation stopped') && outcomeCensus(d314.sentences.rows, PO.PERMISSION_OUTCOME_ROWS.filter((r) => r.id !== 'OU'), '').unclassified.length === 0, c19 && c19.unclassified);
    const ouText = sOU ? sOU.text : '';
    const agentRecs = (conv) => [
      { type: 'assistant', session_id: conv, uuid: 'u-319-a', message: { id: 'm-319', role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_319', name: 'Agent', input: { description: 'Survey the tree', prompt: 'x' } }] } },
      { type: 'user', session_id: conv, uuid: 'u-319-b', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_319', content: ouText, is_error: true }] } },
    ];
    const liveOU = (MMx, conv) => { const x = MMx === MM ? createMessageManager('claude', conv) : new MMx.MessageManager(conv); for (const r of agentRecs(conv)) x.processLive(JSON.parse(JSON.stringify(r))); const b = x.messages.flatMap((m) => m.content || []).find((c) => c.type === 'tool_result' && c.toolCallId === 'toolu_319'); return { unknown: unknownCards(x).length, drift: driftCards(x).length, stopped: !!(b && b.stoppedWhileRunning), cut: !!(b && b.agentCutOff), status: b && b.status }; };
    const realOU = liveOU(MM, 'e2e00000-0000-4000-8000-0000000003d6');
    ok('the REAL normalizer on an Agent call + the 2.1.319 sentence: the tool block is marked for its card (stoppedWhileRunning + agentCutOff — the renderer reads the marks, never the sentence), no unknown card, no drift card', realOU.unknown === 0 && realOU.drift === 0 && realOU.stopped && realOU.cut && realOU.status === 'error', realOU);
    // THE 2.1.321 PIN (lane fable-52-cli-321) — npm published 2.1.321 on 2026-11-09 (Fable 5.2 ships with it); the owner installed it on the box
    // at 12:54 PT the same day: this build is classified for the hotfix. Its dump (strings over a 0644 copy of the npm package's binary —
    // never run) minus the 2.1.319 dump; on f5e087bb5 the strict oracle on it read 221 passed / 2 failed: UNLISTED ui_notify, ui_notify_cancel
    // and the two undeclared result fields.
    const d321 = dumps.find((d) => d.version === '2.1.321');
    const z321 = (d321 && d321.zod) || {};
    const diff21 = d321 && d319 ? dumpDiff(d319, d321) : null;
    const [, lit21] = (/^([^/]+)\/([^ ]+) @/.exec((d321 && d321.helpers[0]) || '') || []).slice(1);
    ok('2.1.321 against 2.1.319 (the dump diff, recomputed): new keys system/ui_notify and system/ui_notify_cancel, none gone; fields grew on result/success (2) and sdk (1), none went; no nested key, no sentence added or gone, nothing unread', !!diff21 && diff21.newKeys.join() === 'system/ui_notify,system/ui_notify_cancel' && diff21.goneKeys.length === 0 && Object.keys(diff21.fields).sort().join() === 'result/success,sdk' && diff21.fields['result/success'].add.slice().sort().join() === 'first_request_cache_read_input_tokens,tool_pool_build_count' && diff21.fields.sdk.add.join() === 'autoModeVerdictTools' && Object.values(diff21.fields).every((f) => f.gone.length === 0) && Object.keys(diff21.nested).length === 0 && diff21.sentencesAdded.length === 0 && diff21.sentencesGone.length === 0 && !(d321.unclosed || []).length, diff21);
    const NON_STREAM21 = Object.keys((diff21 && diff21.fields) || {}).filter((k) => !R.SHAPES['claude:stream:' + (k === 'result/success' ? 'result' : k)]);
    const streamAdds21 = [...new Set(Object.entries((diff21 && diff21.fields) || {}).filter(([k]) => !NON_STREAM21.includes(k)).flatMap(([k, f]) => f.add.map((x) => 'claude:stream:' + (k === 'result/success' ? 'result' : k) + '.' + x)))].sort();
    const f321 = Object.entries(R.FIELDS_321 || {}).flatMap(([k, m]) => Object.keys(m).map((x) => k + '.' + x)).sort();
    ok('FIELDS_321: the 2 fields on result ARE the dump diff, computed (every field 2.1.321 added to a declared stream shape is a row, no row outside it), each IGNORED with a reason naming 2.1.321, never known', f321.length === 2 && JSON.stringify(f321) === JSON.stringify(streamAdds21) && f321.every((kf) => { const [k, f] = [kf.slice(0, kf.lastIndexOf('.')), kf.slice(kf.lastIndexOf('.') + 1)]; const n = R.SHAPES[k].ignored.get(f); return !R.SHAPES[k].known.has(f) && typeof n === 'string' && n.includes('(2.1.321)'); }), { f321, streamAdds21 });
    ok('…and what the diff grew off a stream shape is named, never a stream row: ' + NON_STREAM21.join(', ') + ' — FIELDS_321_ELSEWHERE «sdk.autoModeVerdictTools» (an MCP server config of type sdk), with its reason', NON_STREAM21.join() === 'sdk' && Object.keys(R.FIELDS_321_ELSEWHERE || {}).join() === 'sdk.autoModeVerdictTools' && /\(2\.1\.321\)/.test(R.FIELDS_321_ELSEWHERE['sdk.autoModeVerdictTools']), NON_STREAM21);
    const rowIs21 = (k) => { const sp = R.SHAPES['claude:stream:' + k], u = (d321 && d321.union[k]) || []; return !!sp && u.length > 0 && JSON.stringify([...sp.known].sort()) === JSON.stringify(u.filter((f) => !R.ENVELOPES['claude:stream'].has(f)).sort()); };
    ok('ui_notify / ui_notify_cancel: each a zod literal in the dump (subtype:' + lit21 + '("…")), a stream shape row of exactly the literal\'s fields, SHAPE_SINCE 2.1.321, on EXACTLY one list — card-less (KNOWN_IGNORED) like ui_toast, whose road the binary sends both down', ['ui_notify', 'ui_notify_cancel'].every((x) => typeof z321['system/' + x] === 'string' && z321['system/' + x].includes('subtype:' + lit21 + '("' + x + '")') && rowIs21('system/' + x) && R.SHAPE_SINCE['system/' + x] === '2.1.321' && IGN.has(x) && !HANDLED.has(x) && !(x in R.DECLARED_UPSTREAM_UNSEEN.system)) && /until_back/.test(z321['system/ui_notify'] || ''), ['ui_notify', 'ui_notify_cancel'].map((x) => [x, rowIs21('system/' + x), R.SHAPE_SINCE['system/' + x], IGN.has(x)]));
    const noNotify = { ...R, SHAPES: Object.fromEntries(Object.entries(R.SHAPES).filter(([k]) => !k.startsWith('claude:stream:system/ui_notify'))), SHAPE_SINCE: Object.fromEntries(Object.entries(R.SHAPE_SINCE).filter(([k]) => !k.startsWith('system/ui_notify'))) };
    let nN21 = null, nN19 = null;
    IGN.delete('ui_notify'); IGN.delete('ui_notify_cancel');
    try { if (d321) { nN21 = judgeDump(noNotify, d321); nN19 = judgeDump(noNotify, d319); } } finally { IGN.add('ui_notify'); IGN.add('ui_notify_cancel'); }
    ok('CONTROL: the lists and shapes without the two (the f5e087bb5 tree) are red on the 2.1.321 dump — exactly «UNLISTED system/ui_notify», «UNLISTED system/ui_notify_cancel», the gate\'s line — and green on 2.1.319', !!nN21 && nN21.join() === 'UNLISTED system/ui_notify,UNLISTED system/ui_notify_cancel' && nN19.length === 0, { nN21, nN19 });
    const F321 = R.FIELDS_321 || {}, no321 = { ...R, SHAPES: Object.fromEntries(Object.entries(R.SHAPES).map(([k, sp]) => [k, F321[k] ? { ...sp, ignored: new Map([...sp.ignored].filter(([f]) => !(f in F321[k]))) } : sp])) };
    const n321 = d321 ? judgeDump(no321, d321) : null;
    ok('CONTROL: a copy without FIELDS_321 is red on the 2.1.321 dump — the two result fields named, the gate\'s other line — and green on 2.1.319', !!n321 && n321.slice().sort().join() === 'UNDECLARED result/success.first_request_cache_read_input_tokens,UNDECLARED result/success.tool_pool_build_count' && judgeDump(no321, d319).length === 0, n321);
    // what the person sees: nothing, measured — a plugin's notification never draws in the chat, the new result fields change nothing
    const recs21 = (conv) => [
      { type: 'user', session_id: conv, uuid: 'u-321-u', message: { role: 'user', content: 'Run the build' } },
      { type: 'assistant', session_id: conv, uuid: 'u-321-a', message: { id: 'm-321', role: 'assistant', content: [{ type: 'text', text: 'Started it.' }] } },
      { type: 'system', subtype: 'ui_notify', session_id: conv, uuid: 'u-321-n', plugin: 'acme-notes', source: 'acme-notes@market', title: 'Build done', text: 'The build finished.', key: 'build', delay_ms: 60000, until_back: true, rewritten: false },
      { type: 'system', subtype: 'ui_notify_cancel', session_id: conv, uuid: 'u-321-c', plugin: 'acme-notes', source: 'acme-notes@market', key: 'build' },
      { type: 'result', subtype: 'success', session_id: conv, uuid: 'u-321-t', is_error: false, num_turns: 1, result: 'ok', duration_ms: 1, duration_api_ms: 1, stop_reason: 'end_turn', total_cost_usd: 0, usage: {}, modelUsage: {}, permission_denials: [], tool_pool_build_count: 2, first_request_cache_read_input_tokens: 0 },
    ];
    const live21 = (MMx, conv) => { const x = MMx === MM ? createMessageManager('claude', conv) : new MMx.MessageManager(conv); for (const r of recs21(conv)) x.processLive(JSON.parse(JSON.stringify(r))); return { unknown: unknownCards(x).length, drift: driftCards(x).length, rows: ledgerOf(conv, MMx).length, words: JSON.stringify(x.messages).includes('Build done') }; };
    const real21 = live21(MM, 'e2e00000-0000-4000-8000-0000000003e1');
    ok('the REAL normalizer on a 2.1.321 conversation (a plugin notification, its cancel, a result with both new fields) ⇒ no unknown card, no drift card, no ledger row, and the plugin\'s words appear nowhere', real21.unknown === 0 && real21.drift === 0 && real21.rows === 0 && !real21.words, real21);
    const M21 = mutantCopies('record-321', REPO);
    const rsSrc21 = read('src/record-shape.js'), mmSrc21 = read('src/message-manager.js'), REQ21 = "require('./record-shape.js')";
    const FILL21 = "for (const [key, fields] of Object.entries(FIELDS_321)) for (const [f, note] of Object.entries(fields)) if (!SHAPES[key].known.has(f)) SHAPES[key].ignored.set(f, note);\n";
    const IGN21 = mmSrc21.split('\n').filter((l) => l.startsWith("  'ui_notify',") || l.startsWith("  'ui_notify_cancel',"));
    const MMno21 = rsSrc21.includes(FILL21) && IGN21.length === 2 && mmSrc21.split(REQ21).length === 2 ? require(M21.write('src/message-manager.js', editAnchor(IGN21.reduce((t, l) => editAnchor(t, l + '\n', '', "src/message-manager.js"), mmSrc21), REQ21, 'require(' + JSON.stringify(M21.write('src/record-shape.js', editAnchor(rsSrc21, FILL21, '', "src/record-shape.js"), 'no-fields-321')) + ')', "src/message-manager.js"), 'mm-no-321')) : null;
    const ctl21 = MMno21 && live21(MMno21, 'e2e00000-0000-4000-8000-0000000003e2');
    ok('RED CONTROL: the same conversation on a copy without the two list lines and FIELDS_321 (the f5e087bb5 tree on 2.1.321) ⇒ two unknown-record notices (a person\'s chat draws neither — only the status chip counts them) and the drift card + ledger rows for the result fields', !!ctl21 && ctl21.unknown === 2 && ctl21.drift >= 1 && ctl21.rows >= 1, ctl21);
    const DOORS21 = { nothing: ['system/ui_notify', 'system/ui_notify_cancel', 'result.tool_pool_build_count', 'result.first_request_cache_read_input_tokens', 'sdk.autoModeVerdictTools'] };
    const named21 = diff21 ? [...diff21.newKeys, ...Object.entries(diff21.fields).flatMap(([k, f]) => f.add.map((x) => (k === 'result/success' ? 'result' : k) + '.' + x))] : [];
    ok('every name the 2.1.321 dump diff added has ONE door for the person — all five nothing, by design — and a name with no door fails here', named21.length === 5 && named21.every((n) => DOORS21.nothing.includes(n)), named21.filter((n) => !DOORS21.nothing.includes(n)));
    const drawn21 = (recs, conv) => { const x = createMessageManager('claude', conv); for (const r of recs) x.processLive(JSON.parse(JSON.stringify(r))); return x.messages.map((m) => JSON.stringify({ role: m.role, status: m.status, kind: m.noticeKind || null, content: m.content, turn: m.turnIndex })); };
    const C21 = 'e2e00000-0000-4000-8000-0000000003e3';
    const bare21 = recs21(C21).filter((r) => !String(r.subtype).startsWith('ui_notify')).map((r) => { const c = { ...r }; delete c.tool_pool_build_count; delete c.first_request_cache_read_input_tokens; return c; });
    const full21 = drawn21(recs21(C21), C21), stripped21 = drawn21(bare21, C21);
    ok('«nothing, by design» is MEASURED: the same conversation with the two notification records and the result fields, and without them, draws the same messages word for word', full21.length >= 2 && JSON.stringify(full21) === JSON.stringify(stripped21) && bare21.length === 3 && full21.join().includes('Started it.'), { full: full21.length, bare: stripped21.length });
    ok('the 2.1.321 copies live outside the tree', M21.files.every((f) => !f.startsWith(REPO)));
    ok('the copies live outside the tree', M19.files.every((f) => !f.startsWith(REPO)));
    // THE 2.1.322 PIN (B-9ff2, lane bl-tests-e, 2026-11-17) — the box's claude by 2026-11-13. Its dump: the tree's dump script over
    // the installed file, READ (strings), never run — the build named by its versions-dir name. It equals 2.1.321's in every key,
    // field, nested object and sentence text (only the minified names moved), so nothing is declared for it — the 2.1.308 case.
    // Its `zod` is {} where 2.1.321.json carries ui_notify / ui_notify_cancel: the dump writes zod ONLY for the keys new against the
    // previous dump (newKeys), and 2.1.322 has none — an empty zod here is not a lost shape.
    const d322 = dumps.find((d) => d.version === '2.1.322');
    const diff22 = d322 && d321 ? dumpDiff(d321, d322) : null;
    ok('2.1.322 against 2.1.321 (the dump diff, recomputed): 0 changes — no key added or gone, no field, no nested key, no sentence — so no FIELDS_322 and no list moves', !!diff22 && diff22.changes === 0 && diff22.newKeys.length === 0 && diff22.goneKeys.length === 0 && Object.keys(diff22.fields).length === 0 && Object.keys(diff22.nested).length === 0 && diff22.sentencesAdded.length === 0 && diff22.sentencesGone.length === 0, diff22);
    ok('…its dump was READ off the file (the method the tree spells, the versions-dir name as its build) and names no path, machine or person', !!d322 && d322.version === '2.1.322' && /^strings -n 8 <binary>/.test(d322.method) && !/\/(home|Users|var|tmp)\//.test(JSON.stringify(d322)));
    const j22 = d322 ? [...judgeDump(R, d322), ...nestedUndeclared(R, d322.nested)] : null;
    ok('the lists and shapes of THIS tree judge the 2.1.322 dump clean, nested objects too — the strict oracle a 2.1.322 box runs', !!j22 && j22.length === 0, j22);
    // THE 2.1.328 PIN (B-9ff2 step 2, lane bl-ci, 2026-11-20) — the HOSTED RUNNER's build (npm's newest on 2026-11-19): its dump was taken ON
    // the runner by ci.yml's fast part 1 (the tree's dump script over the installed file, strings, never run) and handed over by the
    // integrator; the binary is on no machine of ours. Against 2.1.322: 54 changes — three new subtypes, nine zod non-records +
    // queued_command, fields on twelve stream shapes and six non-records, one nested key, five sentences. Every one is classified
    // from the dump's own literals; nothing draws for a person (the doors census below).
    const d328 = dumps.find((d) => d.version === '2.1.328');
    const z328 = (d328 && d328.zod) || {};
    const diff28 = d328 && d322 ? dumpDiff(d322, d328) : null;
    const NEW28 = 'anthropic,claude_ai_connector,client_configured,failed,not_found_error,queued_command,reply,resource_link,server_tool_use,system/late_allow_not_run,system/shell_cwd,system/task_list_statuses,web_search_tool_result';
    const SUB28 = ['late_allow_not_run', 'shell_cwd', 'task_list_statuses'], NONREC28 = NEW28.split(',').filter((k) => !k.startsWith('system/'));
    ok('2.1.328 against 2.1.322 (the dump diff, recomputed): 54 changes — the 13 new keys (3 subtypes, 10 non-record objects), none gone; fields on 19 keys; ONE nested key (rate_limit_info.memberSpendLimit); FIVE sentences added, none gone',
      !!diff28 && diff28.changes === 54 && diff28.newKeys.slice().sort().join() === NEW28 && diff28.goneKeys.length === 0 && Object.keys(diff28.fields).length === 19 && JSON.stringify(diff28.nested) === '{"rate_limit_event.rate_limit_info":{"add":["memberSpendLimit"],"gone":[]}}' && diff28.sentencesAdded.length === 5 && diff28.sentencesGone.length === 0,
      diff28 && { changes: diff28.changes, newKeys: diff28.newKeys, fields: Object.keys(diff28.fields), nested: diff28.nested });
    ok('…its dump names the build its own stamp says, by the tree\'s method, with no draft and no path, machine or person in it', !!d328 && d328.version === '2.1.328' && /^strings -n 8 <binary>/.test(d328.method) && !('draft' in d328) && !/\/(home|Users|var|tmp)\//.test(JSON.stringify(d328)));
    const isStream28 = (k) => !!R.SHAPES['claude:stream:' + (k === 'result/success' ? 'result' : k)];
    const NON_STREAM28 = Object.keys((diff28 && diff28.fields) || {}).filter((k) => !isStream28(k)).sort();
    const streamAdds28 = [...new Set(Object.entries((diff28 && diff28.fields) || {}).filter(([k]) => isStream28(k)).flatMap(([k, f]) => f.add.map((x) => 'claude:stream:' + (k === 'result/success' ? 'result' : k) + '.' + x)))].sort();
    const f328 = Object.entries(R.FIELDS_328 || {}).flatMap(([k, m]) => Object.keys(m).map((x) => k + '.' + x)).sort();
    // B-9ff2's remainder (the coordinator's r1210): ONE field moved to KNOWN with its consumer — the cancel's takes_late_allow (message-manager's late-Allow judge)
    const KNOWN28 = ['claude:stream:control_cancel_request.takes_late_allow'];
    ok(`FIELDS_328: the ${f328.length} fields on twelve stream shapes + the ${KNOWN28.length} moved to known with its consumer (${KNOWN28.map((k) => k.replace('claude:stream:', '')).join(', ')}) ARE the dump diff, computed (result/success's twins on result), each in FIELDS_328 IGNORED with a reason naming 2.1.328, never known`, f328.length === 25 && JSON.stringify([...f328, ...KNOWN28].sort()) === JSON.stringify(streamAdds28) && KNOWN28.every((kf) => { const c = kf.lastIndexOf('.'), sp = R.SHAPES[kf.slice(0, c)]; return !!sp && sp.known.has(kf.slice(c + 1)) && !sp.ignored.has(kf.slice(c + 1)); }) && f328.every((kf) => { const c = kf.lastIndexOf('.'), sp = R.SHAPES[kf.slice(0, c)], f = kf.slice(c + 1); return !!sp && !sp.known.has(f) && /\(2\.1\.328; by its name/.test(sp.ignored.get(f) || ''); }), { f328, streamAdds28 });
    const off28 = Object.entries((diff28 && diff28.fields) || {}).filter(([k]) => NON_STREAM28.includes(k)).flatMap(([k, f]) => f.add.map((x) => k + '.' + x)).sort();
    ok('…and what the diff grew off a stream shape is named, never a stream row: ' + NON_STREAM28.join(', ') + ' — FIELDS_328_ELSEWHERE holds exactly their ' + off28.length + ' added fields, each with its reason (resource only LOST two fields: nothing to retire)', NON_STREAM28.join() === 'local,mcp_tool,not_forwarded,plan_approval_response,resource,sdk' && JSON.stringify(Object.keys(R.FIELDS_328_ELSEWHERE || {}).sort()) === JSON.stringify(off28) && off28.length === 6 && off28.every((k) => /^ignored — \(2\.1\.328\)/.test(R.FIELDS_328_ELSEWHERE[k])) && JSON.stringify(diff28.fields.resource) === '{"add":[],"gone":["annotations","_meta"]}', { off28, ELSEWHERE: Object.keys(R.FIELDS_328_ELSEWHERE || {}) });
    const rowIs28 = (k) => { const sp = R.SHAPES['claude:stream:' + k], u = (d328 && d328.union[k]) || []; return !!sp && u.length > 0 && JSON.stringify([...sp.known].sort()) === JSON.stringify(u.filter((f) => !R.ENVELOPES['claude:stream'].has(f)).sort()); };
    const HANDLED28 = ['late_allow_not_run'];   // B-9ff2's remainder: its door is the late-Allow card
    ok('late_allow_not_run / shell_cwd / task_list_statuses: each a zod literal in the dump, a stream shape row of exactly the literal\'s fields, SHAPE_SINCE 2.1.328, on EXACTLY one list — late_allow_not_run HANDLED (the late-Allow card, B-9ff2\'s remainder), the two others card-less (KNOWN_IGNORED)', SUB28.every((x) => typeof z328['system/' + x] === 'string' && z328['system/' + x].includes('subtype:E("' + x + '")') && rowIs28('system/' + x) && R.SHAPE_SINCE['system/' + x] === '2.1.328' && (HANDLED28.includes(x) ? HANDLED.has(x) && !IGN.has(x) : IGN.has(x) && !HANDLED.has(x))), SUB28.map((x) => [x, rowIs28('system/' + x), R.SHAPE_SINCE['system/' + x], IGN.has(x), HANDLED.has(x)]));
    ok('…and late_allow_not_run says WHY no late Allow ran the call (its reason enum on the literal) — its door is the card the person pressed (B-9ff2\'s remainder, the coordinator\'s r1210: message-manager _processLateAllowNotRun → lateAllowOf; test-helper-ask ⑱h)', /reason:U\(\["turn_running","card_open","call_gone","invalid_answer","limited","stopped","declined","asked_again","withdrawn","expired","not_run"\]\)/.test(z328['system/late_allow_not_run'] || '') && /_processLateAllowNotRun\(raw, emit\)/.test(read('src/message-manager.js')) && typeof MM.lateAllowOf === 'function');
    const nonRec28 = NONREC28.map((k) => [k, (d328 && d328.union[k]) || [], R.ZOD_NON_RECORDS[k] || R.ATTACHMENT_PAYLOADS[k] || null]);
    ok('the ten non-system new keys: none carries uuid + session_id (never a stream record); each a zod literal and ONE row naming 2.1.328 — queued_command an ATTACHMENT_PAYLOADS row (known: message-manager reads it), the nine others ZOD_NON_RECORDS', nonRec28.every(([k, f, note]) => !(f.includes('uuid') && f.includes('session_id')) && typeof z328[k] === 'string' && !!note && /2\.1\.328/.test(note) && ((k === 'queued_command') === (k in R.ATTACHMENT_PAYLOADS)) && !((k in R.ZOD_NON_RECORDS) && (k in R.ATTACHMENT_PAYLOADS))) && /^known/.test(R.ATTACHMENT_PAYLOADS.queued_command || '') && /a\.type === 'queued_command'/.test(read('src/message-manager.js')), nonRec28.map(([k, , n]) => [k, !!n]));
    const RLI = R.SHAPES['claude:stream:rate_limit_event'].nested.rate_limit_info;
    const nj28 = d328 ? [...judgeDump(R, d328), ...nestedUndeclared(R, d328.nested)] : null;
    ok('rate_limit_info.memberSpendLimit: declared IGNORED naming 2.1.328 — and the lists and shapes of THIS tree judge the 2.1.328 dump clean, nested objects too (the strict oracle the hosted runner now runs: 2.1.328 is pinned)', !!RLI && !RLI.known.has('memberSpendLimit') && /\(2\.1\.328\)/.test(RLI.ignored.get('memberSpendLimit') || '') && !!nj28 && nj28.length === 0, nj28);
    // the five sentences
    const N5 = PO.PERMISSION_OUTCOME_ROWS.filter((r) => r.since === '2.1.328'), po28 = (t) => PO.permissionOutcome(t, true).outcome;
    const want5 = { pBe: 'cancelled', w5e: 'cancelled', b5e: 'cancelled', k5e: 'cancelled', rHn: 'stopped' };
    ok('the five 2.1.328 sentences are rows with the dump\'s own text: pBe (the turn PAUSED) / w5e (a safety check left it to a person, closed) / b5e + k5e (the request STILL OPEN — the ruling r140 (d)) CANCELLED, on the census list; rHn (ww + «files … may have reached the connector») STOPPED, on the is_error set — each read so by the lookup', !!d328 && N5.length === 5 && N5.every((r) => want5[r.id] === r.outcome && d328.sentences.rows.some((x) => x.name === r.id && x.text === r.text && (r.binary === 'IS' ? x.from === 'IS' : x.from === 'both')) && po28(r.text) === r.outcome), N5.map((r) => [r.id, r.outcome, po28(r.text)]));
    const c28 = d328 && outcomeCensus(d328.sentences.rows, PO.PERMISSION_OUTCOME_ROWS.filter((r) => r.since !== '2.1.328'), '');
    const rHn = N5.find((r) => r.id === 'rHn'), ww = PO.PERMISSION_OUTCOME_ROWS.find((r) => r.id === 'ww');
    ok('CONTROL: the table without the five (the 073cc4a1e tree) leaves exactly those five UNCLASSIFIED on the 2.1.328 dump — and rHn alone reads DENIED by ww\'s prefix (the longest row is what makes it stopped); nothing on 2.1.322', !!c28 && c28.unclassified.length === 5 && outcomeCensus(d322.sentences.rows, PO.PERMISSION_OUTCOME_ROWS.filter((r) => r.since !== '2.1.328'), '').unclassified.length === 0 && !!rHn && !!ww && rHn.text.startsWith(ww.text) && PO.permissionOutcome(rHn.text, true).row.id === 'rHn', c28 && c28.unclassified.map((t) => String(t).slice(0, 60)));
    // CONTROLS on the lists and the field maps (the 073cc4a1e tree)
    const no3 = { ...R, SHAPES: Object.fromEntries(Object.entries(R.SHAPES).filter(([k]) => !SUB28.some((x) => k === 'claude:stream:system/' + x))), SHAPE_SINCE: Object.fromEntries(Object.entries(R.SHAPE_SINCE).filter(([k]) => !SUB28.some((x) => k === 'system/' + x))) };
    let n3_28 = null, n3_22 = null;
    const tookI28 = SUB28.filter((x) => IGN.has(x)), tookH28 = SUB28.filter((x) => HANDLED.has(x));
    for (const x of tookI28) IGN.delete(x);
    for (const x of tookH28) HANDLED.delete(x);
    try { if (d328) { n3_28 = judgeDump(no3, d328); n3_22 = judgeDump(no3, d322); } } finally { for (const x of tookI28) IGN.add(x); for (const x of tookH28) HANDLED.add(x); }
    ok('CONTROL: the lists and shapes without the three (the 073cc4a1e tree) are red on the 2.1.328 dump — exactly «UNLISTED system/late_allow_not_run», «…/shell_cwd», «…/task_list_statuses» — and green on 2.1.322', !!n3_28 && n3_28.slice().sort().join() === 'UNLISTED system/late_allow_not_run,UNLISTED system/shell_cwd,UNLISTED system/task_list_statuses' && n3_22.length === 0, { n3_28, n3_22 });
    const F328 = R.FIELDS_328 || {}, no328 = { ...R, SHAPES: Object.fromEntries(Object.entries(R.SHAPES).map(([k, sp]) => [k, F328[k] ? { ...sp, ignored: new Map([...sp.ignored].filter(([f]) => !(f in F328[k]))) } : sp])) };
    const n328 = d328 ? judgeDump(no328, d328) : null;
    const wantU28 = Object.entries((diff28 && diff28.fields) || {}).filter(([k]) => isStream28(k)).flatMap(([k, f]) => f.add.map((x) => 'UNDECLARED ' + k + '.' + x)).filter((u) => !KNOWN28.includes('claude:stream:' + u.replace('UNDECLARED ', ''))).sort();
    ok(`CONTROL: a copy without FIELDS_328 is red on the 2.1.328 dump — every stream field the diff added named (${wantU28.length}, result/success's twins included) — and green on 2.1.322`, !!n328 && JSON.stringify(n328.slice().sort()) === JSON.stringify(wantU28) && judgeDump(no328, d322).length === 0, n328);
    // what the person sees: nothing, measured — the three records draw no card, the new fields change nothing
    const recs28 = (conv) => [
      { type: 'user', session_id: conv, uuid: 'u-328-u', message: { role: 'user', content: 'Run the build' }, keeps_request_id: true },
      { type: 'assistant', session_id: conv, uuid: 'u-328-a', message: { id: 'm-328', role: 'assistant', content: [{ type: 'text', text: 'Started it.' }] } },
      { type: 'system', subtype: 'late_allow_not_run', session_id: conv, uuid: 'u-328-l', request_id: 'req-328', tool_use_id: 'toolu_328', reason: 'expired' },
      { type: 'system', subtype: 'shell_cwd', session_id: conv, uuid: 'u-328-c', cwd: '/w/proj-328-folder' },
      { type: 'system', subtype: 'task_list_statuses', session_id: conv, uuid: 'u-328-t', statuses: [{ id: 'task-328', status: 'in_progress' }] },
      { type: 'result', subtype: 'success', session_id: conv, uuid: 'u-328-r', is_error: false, num_turns: 1, result: 'ok', duration_ms: 1, duration_api_ms: 1, stop_reason: 'end_turn', total_cost_usd: 0, usage: {}, modelUsage: {}, permission_denials: [], tool_pool_limit_ms: 900, restored_rewind: false, memory_check_detail: 'x' },
    ];
    const live28 = (MMx, conv) => { const x = MMx === MM ? createMessageManager('claude', conv) : new MMx.MessageManager(conv); for (const r of recs28(conv)) x.processLive(JSON.parse(JSON.stringify(r))); const all = JSON.stringify(x.messages); return { unknown: unknownCards(x).length, names: unknownCards(x).map((m) => m.content[0].name).sort(), drift: driftCards(x).length, driftShapes: driftCards(x).map((m) => m.content[0].shape), rows: ledgerOf(conv, MMx).length, words: all.includes('proj-328-folder') || all.includes('task-328') || all.includes('req-328') }; };
    const real28 = live28(MM, 'e2e00000-0000-4000-8000-0000000003f1');
    ok('the REAL normalizer on a 2.1.328 conversation (the three new records, a user record and a result with new fields) ⇒ no unknown card, no drift card, no ledger row, and none of their words appear', real28.unknown === 0 && real28.drift === 0 && real28.rows === 0 && !real28.words, real28);
    const M28 = mutantCopies('record-328', REPO);
    const rsSrc28 = read('src/record-shape.js'), mmSrc28 = read('src/message-manager.js'), REQ28 = "require('./record-shape.js')";
    const FILL28 = "for (const [key, fields] of Object.entries(FIELDS_328)) for (const [f, note] of Object.entries(fields)) if (!SHAPES[key].known.has(f)) SHAPES[key].ignored.set(f, note);\n";
    const IGN28 = mmSrc28.split('\n').filter((l) => SUB28.some((x) => l.startsWith(`  '${x}',`)));
    const MMno28 = rsSrc28.includes(FILL28) && IGN28.length === 3 && mmSrc28.split(REQ28).length === 2 ? require(M28.write('src/message-manager.js', IGN28.reduce((t, l) => anchored(t, l + '\n', '', 'ign-328'), anchored(mmSrc28, REQ28, 'require(' + JSON.stringify(M28.write('src/record-shape.js', anchored(rsSrc28, FILL28, '', 'fill-328'), 'no-fields-328')) + ')', 'req-328')), 'mm-no-328')) : null;
    const ctl28 = MMno28 && live28(MMno28, 'e2e00000-0000-4000-8000-0000000003f2');
    ok('RED CONTROL: the same conversation on a copy without the three list lines and FIELDS_328 (the 073cc4a1e lists on 2.1.328) ⇒ EXACTLY three unknown-record notices — late_allow_not_run, shell_cwd, task_list_statuses (since B-9ff2 step 3 a record with a call id is never dropped without a trace) — EXACTLY one drift card and one ledger row (the shape it names is printed: ' + JSON.stringify(ctl28 && ctl28.driftShapes) + ')', !!ctl28 && ctl28.unknown === 3 && ctl28.names.join() === 'late_allow_not_run,shell_cwd,task_list_statuses' && ctl28.drift === 1 && ctl28.rows === 1, ctl28);
    const DOORS28 = { known: ['queued_command', 'server_tool_use', 'web_search_tool_result', 'system/late_allow_not_run', 'control_cancel_request.takes_late_allow'], nothing: [...SUB28.filter((x) => !HANDLED28.includes(x)).map((x) => 'system/' + x), ...NONREC28.filter((k) => !['queued_command', 'server_tool_use', 'web_search_tool_result'].includes(k)), ...f328.map((kf) => kf.replace('claude:stream:', '')), ...off28, 'rate_limit_event.rate_limit_info.memberSpendLimit'] };
    const named28 = diff28 ? [...diff28.newKeys, ...Object.entries(diff28.fields).flatMap(([k, f]) => f.add.map((x) => (k === 'result/success' ? 'result' : k) + '.' + x)), ...Object.entries(diff28.nested).flatMap(([at, f]) => f.add.map((x) => at + '.' + x))] : [];
    const doorOf28 = (n) => Object.entries(DOORS28).filter(([, l]) => l.includes(n)).map(([d]) => d);
    ok(`every name the 2.1.328 dump diff added has ONE door for the person — ${DOORS28.known.length} known (readers that exist), the rest nothing, by design — and a name with no door, or two, fails here`, [...new Set(named28)].length === 46 && [...new Set(named28)].every((n) => doorOf28(n).length === 1), [...new Set(named28)].filter((n) => doorOf28(n).length !== 1));
    // THE DOORS CENSUS BITES (B-9ff2 step 3, the coordinator's r180): every name it calls «nothing» is SEARCHED for a reader — ONE
    // fixed-string whole-word git grep over the code (src/, server.js, data/bin), comment lines and the two declaring files
    // (src/record-shape.js, src/permission-outcome.js) and message-manager's list lines left out. A hit is a reader unless it is a
    // SAME-NAMED other thing, each named below with its file. A word too common to tell from a reader by its name is listed, unsearched.
    const COMMON28 = { anthropic: 'a common word (provider names)', failed: 'a common word', label: 'a common word', origin: 'a common word', reason: 'a common word', reply: 'a common word', tool_use_id: 'every tool record carries one', backgrounded: 'the tree\'s own taskInfo.backgrounded', planDigest: 'the desktop-access plan digest (src/app-system.js)' };
    const SAME_NAME28 = { resource_link: { 'src/acp-message-manager.js': 'the ACP harness\'s own content-block reader (an ACP block, not a claude record)' }, not_found_error: { 'src/provider-test-model.js': 'a provider test\'s API-error text match (a model probe, not a claude record)' } };
    const nameOf28 = (n) => n.split(/[./]/).pop();
    const searched28 = [...new Set(DOORS28.nothing.map(nameOf28))].filter((n) => !(n in COMMON28)).sort();
    const DECL28 = new Set(['src/record-shape.js', 'src/permission-outcome.js']), LIST28 = new RegExp(`^\\s*'(?:${SUB28.join('|')})',`);
    const readersIn = (grepOut) => String(grepOut || '').split('\n').filter(Boolean).flatMap((l) => {
      const m = /^([^:]+):(\d+):(.*)$/.exec(l); if (!m) return [];
      const [, file, line, text] = m, t = text.trim();
      if (DECL28.has(file) || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || (file === 'src/message-manager.js' && LIST28.test(text))) return [];
      return searched28.filter((n) => new RegExp('(^|[^\\w$])' + n + '([^\\w$]|$)').test(text) && !(SAME_NAME28[n] && SAME_NAME28[n][file])).map((n) => `${n} @ ${file}:${line}`);
    });
    const gg28 = spawnSync('git', ['-C', REPO, 'grep', '-n', '-F', '-w', ...searched28.flatMap((n) => ['-e', n]), '--', 'src', 'server.js', 'data/bin'], { encoding: 'utf8', maxBuffer: 64 << 20 });
    const found28 = readersIn(gg28.stdout);
    ok(`the doors census BITES: each of the ${searched28.length} searchable names it calls «nothing» has NO reader in the code (one fixed-string whole-word search; ${Object.keys(COMMON28).length} common names listed unsearched: ${Object.keys(COMMON28).join(', ')}; same-named other things: ${Object.entries(SAME_NAME28).map(([n, f]) => n + ' in ' + Object.keys(f).join(', ')).join(' · ')})`, (gg28.status === 0 || gg28.status === 1) && searched28.length >= 30 && found28.length === 0, { status: gg28.status, err: String(gg28.stderr || '').slice(0, 200), found28 });
    const planted28 = readersIn(String(gg28.stdout || '') + '\nsrc/lib/chat-renderers.js:1:    if (rec.message_undelivered) keepOpen();\nsrc/server/x.js:2:  // a comment naming shell_cwd is no reader\n');
    ok('CONTROL: a planted reader (a renderer reading message_undelivered) is NAMED by the same judge — and a comment naming another is not', planted28.length === 1 && planted28[0] === 'message_undelivered @ src/lib/chat-renderers.js:1', planted28);
    const C28 = 'e2e00000-0000-4000-8000-0000000003f3';
    const bare28 = recs28(C28).filter((r) => !SUB28.includes(r.subtype)).map((r) => { const c = { ...r }; for (const f of ['keeps_request_id', 'tool_pool_limit_ms', 'restored_rewind', 'memory_check_detail']) delete c[f]; return c; });
    const full28 = drawn21(recs28(C28), C28), stripped28 = drawn21(bare28, C28);
    ok('«nothing, by design» is MEASURED: the same conversation with the three records and the new fields, and without them, draws the same messages word for word', full28.length >= 2 && JSON.stringify(full28) === JSON.stringify(stripped28) && bare28.length === 3 && full28.join().includes('Started it.'), { full: full28.length, bare: stripped28.length });
    ok('the 2.1.328 copies live outside the tree', M28.files.every((f) => !f.startsWith(REPO)));
    // THE 2.1.332 PIN (主开发 r5510, lane cli-update-needs-nothing, 2026-11-27) — the hub's machine's build since 2026-11-26: its dump taken by
    // the INTEGRATOR's box row r5513 (the tree's dump script over the file — strings, never run) and handed over, with the zod literal of every
    // shape whose fields changed (a driver over the same module; user, result and system/init run past its walker's bound). Against 2.1.328:
    // no new subtype, no sentence; 18 fields on nine stream shapes (FIELDS_332), three off a stream shape (FIELDS_332_ELSEWHERE), one zod
    // non-record (page_texts), three non-record keys gone (array, audio, boolean: never declared). Each classified; nothing draws for a person.
    const d332 = dumps.find((d) => d.version === '2.1.332');
    const diff32 = d332 && d328 ? dumpDiff(d328, d332) : null;
    const f32 = (diff32 && diff32.fields) || {};
    ok('2.1.332 against 2.1.328 (the dump diff, recomputed): 26 changes — ONE new key (page_texts), three gone (array, audio, boolean), 22 fields added on 13 keys and none gone, no nested key, no sentence added or gone',
      !!diff32 && diff32.changes === 26 && diff32.newKeys.join() === 'page_texts' && diff32.goneKeys.join() === 'array,audio,boolean' && Object.keys(f32).length === 13
        && Object.values(f32).every((f) => f.gone.length === 0) && Object.values(f32).reduce((s, f) => s + f.add.length, 0) === 22 && Object.keys(diff32.nested).length === 0
        && diff32.sentencesAdded.length === 0 && diff32.sentencesGone.length === 0,
      diff32 && { changes: diff32.changes, newKeys: diff32.newKeys, goneKeys: diff32.goneKeys, fields: Object.keys(f32), nested: diff32.nested });
    ok('…its dump names the build its own stamp says, by the tree\'s method, with no draft and no path, machine or person in it', !!d332 && d332.version === '2.1.332' && /^strings -n 8 <binary>/.test(d332.method) && !('draft' in d332) && !/\/(home|Users|var|tmp)\//.test(JSON.stringify(d332)));
    const isStream32 = (k) => !!R.SHAPES['claude:stream:' + (k === 'result/success' ? 'result' : k)];
    const NON_STREAM32 = Object.keys(f32).filter((k) => !isStream32(k)).sort();
    const streamAdds32 = [...new Set(Object.entries(f32).filter(([k]) => isStream32(k)).flatMap(([k, f]) => f.add.map((x) => 'claude:stream:' + (k === 'result/success' ? 'result' : k) + '.' + x)))].sort();
    const fl332 = Object.entries(R.FIELDS_332 || {}).flatMap(([k, m]) => Object.keys(m).map((x) => k + '.' + x)).sort();
    ok(`FIELDS_332: the ${fl332.length} fields on nine stream shapes ARE the dump diff's stream fields, computed (result/success's twins on result), each IGNORED with a reason naming 2.1.332, never known (no reader in the tree)`,
      fl332.length === 18 && JSON.stringify(fl332) === JSON.stringify(streamAdds32) && fl332.every((n) => { const i = n.lastIndexOf('.'), sp = R.SHAPES[n.slice(0, i)], f = n.slice(i + 1); return !!sp && !sp.known.has(f) && /\(2\.1\.332/.test(sp.ignored.get(f) || '') && sp.ignored.get(f).length > 80; }),
      { fl332, streamAdds32 });
    const off32 = Object.entries(f32).filter(([k]) => NON_STREAM32.includes(k)).flatMap(([k, f]) => f.add.map((x) => k + '.' + x)).sort();
    ok('…and what the diff grew off a stream shape is named, never a stream row: ' + NON_STREAM32.join(', ') + ' — FIELDS_332_ELSEWHERE holds exactly their ' + off32.length + ' added fields, each with its reason',
      NON_STREAM32.join() === 'command,evaluated,sdk' && JSON.stringify(Object.keys(R.FIELDS_332_ELSEWHERE || {}).sort()) === JSON.stringify(off32) && Object.values(R.FIELDS_332_ELSEWHERE).every((v) => /^ignored — \(2\.1\.332\)/.test(v)), { NON_STREAM32, off32 });
    const pt = (d332 && d332.union.page_texts) || [];
    ok('page_texts: no uuid + session_id (never a stream record), a zod literal in the dump, ONE ZOD_NON_RECORDS row naming 2.1.332 — and the three keys gone (array, audio, boolean) were declared nowhere: nothing to retire',
      pt.length > 0 && !(pt.includes('uuid') && pt.includes('session_id')) && typeof (d332.zod || {}).page_texts === 'string' && /^ignored — \(2\.1\.332\)/.test(R.ZOD_NON_RECORDS.page_texts || '') && !R.ATTACHMENT_PAYLOADS.page_texts
        && ['array', 'audio', 'boolean'].every((k) => !(k in R.ZOD_NON_RECORDS) && !(k in R.ATTACHMENT_PAYLOADS) && !R.SHAPES['claude:stream:' + k]), { pt, zod: (d332 && d332.zod) || null });
    const c32 = d332 && outcomeCensus(d332.sentences.rows, PO.PERMISSION_OUTCOME_ROWS, '');
    ok('the sentences: the SAME 21 texts as 2.1.328 on the same lists (every name renamed), so the census classifies every one — and it names the build it was read from (PERMISSION_OUTCOME_CLI_VERSION = 2.1.332)',
      !!d332 && d332.sentences.rows.length === 21 && JSON.stringify(d332.sentences.rows.map((r) => r.text + '|' + r.from).sort()) === JSON.stringify(d328.sentences.rows.map((r) => r.text + '|' + r.from).sort()) && !!c32 && c32.unclassified.length === 0 && PO.PERMISSION_OUTCOME_CLI_VERSION === '2.1.332', c32 && c32.unclassified);
    const nj32 = d332 ? [...judgeDump(R, d332), ...nestedUndeclared(R, d332.nested)] : null;
    ok('the lists and shapes of THIS tree judge the 2.1.332 dump clean, nested objects too (the strict oracle the hub\'s machine runs: 2.1.332 is pinned)', !!nj32 && nj32.length === 0, nj32);
    // CONTROL (主开发 r5135 law 1: judged on a WITNESS that its plant was in force — the copy's shapes really lack every FIELDS_332 entry)
    const F332 = R.FIELDS_332 || {}, no332 = { ...R, SHAPES: Object.fromEntries(Object.entries(R.SHAPES).map(([k, sp]) => [k, F332[k] ? { ...sp, ignored: new Map([...sp.ignored].filter(([f]) => !(f in F332[k]))) } : sp])) };
    const plant332 = Object.entries(F332).every(([k, m]) => Object.keys(m).every((f) => !no332.SHAPES[k].ignored.has(f) && !no332.SHAPES[k].known.has(f)));
    const n332 = d332 && plant332 ? judgeDump(no332, d332) : null;
    const wantU32 = Object.entries(f32).filter(([k]) => isStream32(k)).flatMap(([k, f]) => f.add.map((x) => 'UNDECLARED ' + k + '.' + x)).sort();
    if (!plant332) skip('CONTROL (a copy without FIELDS_332)', 'its plant was not in force — the copy still declares a FIELDS_332 field; not judged');
    else ok(`CONTROL: a copy without FIELDS_332 (witness: its shapes declare none of them) is red on the 2.1.332 dump — every stream field the diff added named (${wantU32.length}, result/success's twins included) — and green on 2.1.328`, !!n332 && JSON.stringify(n332.slice().sort()) === JSON.stringify(wantU32) && judgeDump(no332, d328).length === 0, n332);
    // what the person sees: nothing, measured — a 2.1.332 conversation whose records carry the new fields
    const recs32 = (conv) => [
      { type: 'user', session_id: conv, uuid: 'u-332-u', message: { role: 'user', content: 'Run the tests' }, client_content_width: 88, refusal_retry: false },
      { type: 'assistant', session_id: conv, uuid: 'u-332-a', message: { id: 'm-332', role: 'assistant', content: [{ type: 'text', text: 'Ran them.' }] } },
      { type: 'system', subtype: 'informational', session_id: conv, uuid: 'u-332-i', content: 'Saved two files', level: 'info', saved_from: { files: 2, app: 'app-word-332' } },
      { type: 'system', subtype: 'informational', session_id: conv, uuid: 'u-332-n', content: 'A note was left', level: 'info', agent_note: { to: { kind: 'main' }, about: { kind: 'agent' }, text: 'note-word-332', source: 'plugin-332@builtin' } },
      { type: 'system', subtype: 'model_refusal_fallback', session_id: conv, uuid: 'u-332-f', original_model: 'model-a-332', fallback_model: 'model-b-332', served_notice: { text: 'served-word-332 {model}', learn_more_url: 'https://example.invalid/served-332' } },
      { type: 'result', subtype: 'success', session_id: conv, uuid: 'u-332-r', is_error: false, num_turns: 1, result: 'ok', duration_ms: 1, duration_api_ms: 1, stop_reason: 'end_turn', total_cost_usd: 0, usage: {}, modelUsage: {}, permission_denials: [], begun_message_ids: ['m-332'], tool_hold_detail: 'hold-word-332' },
    ];
    const NEW32 = ['client_content_width', 'refusal_retry', 'saved_from', 'agent_note', 'served_notice', 'begun_message_ids', 'tool_hold_detail'];
    const C32 = 'e2e00000-0000-4000-8000-000000000332';
    const mm32 = createMessageManager('claude', C32); for (const r of recs32(C32)) mm32.processLive(JSON.parse(JSON.stringify(r)));
    const all32 = JSON.stringify(mm32.messages);
    ok('the REAL normalizer on a 2.1.332 conversation (a user record, two informational lines, a refusal fallback and a result, each with its new fields) ⇒ no unknown card, no drift card, no ledger row, and none of the new fields\' words appear',
      unknownCards(mm32).length === 0 && driftCards(mm32).length === 0 && ledgerOf(C32).length === 0 && !/app-word-332|note-word-332|served-word-332|hold-word-332/.test(all32), { unknown: unknownCards(mm32).length, drift: driftCards(mm32).map((m) => m.content[0].shape), rows: ledgerOf(C32).length });
    const C32b = 'e2e00000-0000-4000-8000-000000000333';
    const bare32 = recs32(C32b).map((r) => { const c = { ...r }; for (const f of NEW32) delete c[f]; return c; });
    const full32 = drawn21(recs32(C32b), C32b), stripped32 = drawn21(bare32, C32b);
    ok('«nothing, by design» is MEASURED: the same conversation with the new fields and without them draws the same messages word for word', full32.length >= 4 && JSON.stringify(full32) === JSON.stringify(stripped32) && bare32.every((r) => NEW32.every((f) => !(f in r))), { full: full32.length, stripped: stripped32.length });
    // THE DOORS CENSUS (as 2.1.328's): every name the diff added is a door of NOTHING (no reader); each searchable name is SEARCHED — one
    // fixed-string whole-word git grep over src/, server.js and data/bin, comment lines and the declaring file left out
    const named32 = diff32 ? [...new Set([...diff32.newKeys, ...Object.entries(f32).flatMap(([, f]) => f.add)])].sort() : [];
    const COMMON32 = { preview: 'a common word (previews of files, pages and designs)', unhooked: 'an English word (the tree\'s own listeners «unhooked» in comments; a class name of the live view)' };
    const searched32 = named32.filter((n) => !(n in COMMON32));
    const readers32 = (grepOut) => String(grepOut || '').split('\n').filter(Boolean).flatMap((l) => {
      const m = /^([^:]+):(\d+):(.*)$/.exec(l); if (!m) return [];
      const [, file, line, text] = m, t = text.trim();
      if (file === 'src/record-shape.js' || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return [];
      return searched32.filter((n) => new RegExp('(^|[^\\w$])' + n + '([^\\w$]|$)').test(text)).map((n) => `${n} @ ${file}:${line}`);
    });
    const gg32 = spawnSync('git', ['-C', REPO, 'grep', '-n', '-F', '-w', ...searched32.flatMap((n) => ['-e', n]), '--', 'src', 'server.js', 'data/bin'], { encoding: 'utf8', maxBuffer: 64 << 20 });
    const found32 = readers32(gg32.stdout);
    ok(`the doors census: every one of the ${named32.length} names the 2.1.332 diff added is a door of NOTHING, and each of the ${searched32.length} searchable ones has NO reader in the code (${Object.keys(COMMON32).length} common words listed unsearched: ${Object.keys(COMMON32).join(', ')})`,
      named32.length === 22 && gg32.status !== null && gg32.status <= 1 && found32.length === 0, found32);
    const planted32 = readers32(String(gg32.stdout || '') + '\nsrc/lib/chat-renderers.js:1:    if (rec.served_notice) showNotice(rec.served_notice.text);\nsrc/server/x.js:2:  // a comment naming tool_hold_detail is no reader\n');
    ok('CONTROL: a planted reader (a renderer reading served_notice) is NAMED by the same judge — and a comment naming another is not', planted32.length === 1 && planted32[0] === 'served_notice @ src/lib/chat-renderers.js:1', planted32);
  }
}

console.log('§5 negative control — a scratch copy with every `ignored` map emptied goes red on §1');
{
  const src = read('src/record-shape.js');
  const line = "for (const [key, fields] of Object.entries(CORPUS_KNOWN)) for (const [f, note] of Object.entries(fields)) if (!SHAPES[key].known.has(f)) SHAPES[key].ignored.set(f, note);";
  ok('the scratch mutation targets the ONE line that fills the ignored maps (the control is meaningful only if that line exists)', src.includes(line));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-record-shape-neg-'));
  try {
    const mutated = editAnchor(src, line, "for (const [key] of Object.entries(CORPUS_KNOWN)) SHAPES[key].ignored.clear(); for (const s of Object.values(SHAPES)) s.ignored.clear(); // NEGATIVE CONTROL", "src/record-shape.js");
    fs.writeFileSync(path.join(dir, 'record-shape.js'), mutated);
    const neg = require(path.join(dir, 'record-shape.js'));
    const emptied = Object.values(neg.SHAPES).every((s) => s.ignored.size === 0);
    const c = census(neg, [path.join(REPO, 'scripts/fixtures')]);
    ok('the scratch copy has no ignored entries and §1 goes RED on it (the fixtures carry the live-seen fields — proof the census can fail)', emptied && c.drift.length >= 3 && c.drift.some((d) => /messaging_socket_path/.test(d.fields.join(','))) && c.drift.some((d) => /workflow_progress/.test(d.fields.join(','))), { emptied, drift: c.drift.slice(0, 4) });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

console.log(`\n${pass} passed, ${fail} failed${skipped ? `, ${skipped} skipped` : ''} · record oracle ${ORACLE_MODE}`);
process.exit(fail ? 1 : 0);
