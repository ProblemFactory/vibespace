// THE CODEX APP-SERVER PROTOCOL CENSUS (lane-codex-0159, 2026-09-30) — PURE
// helpers shared by the drift gate (scripts/test-codex-protocol-drift.mjs) and
// the maintainer's measurement (scripts/measure-codex-protocol.mjs). Never a
// test-*.mjs (not a suite) and never a vendor call: it reads the wrapper's
// SOURCE, a schema bundle the CLI writes to disk (`codex app-server
// generate-json-schema --experimental`, launch-free) and the measured tables.
//
// Born of the incident: the owner updated codex-cli to 0.159.3 and every codex
// reset credit failed with "Invalid request: missing field `idempotencyKey`" —
// the wrapper's `account/rateLimitResetCredit/consume {}` had been measured on
// 0.153.4 and nobody measured again. The census turns "the CLI moved" into a
// red gate naming the method and the field.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const TABLE_DIR = 'scripts/fixtures/codex-app-server';
export const WRAPPER = 'data/bin/codex-chat-wrapper.js';

/** Source with // and /* *\/ comments blanked (strings and templates kept, line
 *  numbers kept) — a key written inside a comment is not a key the wrapper sends. */
export function stripComments(src) {
  let out = '', i = 0, q = null;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (q) { out += c; if (c === '\\') { out += n || ''; i += 2; continue; } if (c === q) q = null; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; out += c; i++; continue; }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') { out += ' '; i++; } continue; }
    if (c === '/' && n === '*') { while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { out += src[i] === '\n' ? '\n' : ' '; i++; } out += '  '; i += 2; continue; }
    out += c; i++;
  }
  return out;
}

/** The balanced (…) / {…} / […] text starting at `start` (src[start] is the opener). */
export function balanced(src, start) {
  const open = src[start], close = { '(': ')', '{': '}', '[': ']' }[open];
  let depth = 0, q = null;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') { depth--; if (depth === 0) return c === close ? src.slice(start, i + 1) : null; }
  }
  return null;
}

/** Split `text` (no outer brackets) on top-level commas. */
export function topLevelParts(text) {
  const parts = []; let depth = 0, q = null, cur = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { cur += c; if (c === '\\') { cur += text[++i] || ''; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; cur += c; continue; }
    if (c === '(' || c === '{' || c === '[') depth++;
    if (c === ')' || c === '}' || c === ']') depth--;
    if (c === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

const MAYBE_ABSENT = /(\|\||\?\?)\s*undefined\s*$|^undefined$|\?\s*[^:]+:\s*undefined\s*$/;
/** An object literal `{…}` → { always: keys sent on every call, conditional:
 *  keys that may be absent (a `|| undefined` value, a conditional spread) }. */
export function objectKeys(lit) {
  const always = [], conditional = [];
  for (const part of topLevelParts(lit.slice(1, -1))) {
    if (part.startsWith('...')) {
      // a spread: its literal keys are conditional (`...(x ? { k } : {})`)
      for (const m of part.matchAll(/\{([^{}]*)\}/g)) for (const p of topLevelParts(m[1])) { const k = (p.match(/^['"]?([A-Za-z_$][\w$]*)['"]?\s*(?::|$)/) || [])[1]; if (k) conditional.push(k); }
      continue;
    }
    const m = part.match(/^['"]?([A-Za-z_$][\w$]*)['"]?\s*(?::\s*([\s\S]*))?$/);
    if (!m) continue;
    if (m[2] !== undefined && MAYBE_ABSENT.test(m[2].trim())) conditional.push(m[1]); else always.push(m[1]);
  }
  return { always, conditional };
}

/**
 * Every app-server REQUEST the wrapper makes: `request('<method>', <params>, …)`.
 * A non-literal method (startThread's `request(method, params)`) is resolved
 * from its `const method = …` line (every 'a/b' literal in it); a non-literal
 * params from its nearest `const <id> = {…}` / `cond ? {…} : {…}` (a ternary's
 * keys are the INTERSECTION — a required field must be in every branch) plus
 * `<id>.<key> =` assignments (conditional).
 * → [{ methods:[…], line, always:[…], conditional:[…], dynamic:bool }]
 */
export function wrapperRequestSites(rawSrc) {
  const src = stripComments(rawSrc);
  const sites = [];
  const re = /(?<![\w.$])request\(/g;
  let m;
  while ((m = re.exec(src))) {
    const before = src.slice(Math.max(0, m.index - 9), m.index);
    if (/function\s*$/.test(before)) continue; // the definition
    const call = balanced(src, m.index + 'request'.length);
    if (!call) continue;
    const args = topLevelParts(call.slice(1, -1));
    const line = src.slice(0, m.index).split('\n').length;
    const prior = src.slice(0, m.index);
    let methods = [], dynamic = false;
    const lit = (args[0] || '').match(/^'([^']+)'$/);
    if (lit) methods = [lit[1]];
    else {
      dynamic = true;
      const id = args[0];
      const defs = [...prior.matchAll(new RegExp(`(?:const|let)\\s+${id}\\s*=([^;]*);`, 'g'))];
      const def = defs.length ? defs[defs.length - 1][1] : '';
      methods = [...def.matchAll(/'([a-z][\w]*\/[\w/]+)'/g)].map((x) => x[1]);
    }
    let always = [], conditional = [];
    const p = (args[1] || '').trim();
    if (p.startsWith('{')) ({ always, conditional } = objectKeys(p));
    else if (/^[A-Za-z_$][\w$]*$/.test(p)) {
      const defs = [...prior.matchAll(new RegExp(`(?:const|let)\\s+${p}\\s*=\\s*`, 'g'))];
      const d = defs.length ? defs[defs.length - 1] : null;
      if (d) {
        const at = d.index + d[0].length;
        const branches = [];
        let i = at;
        // `{…}` or `cond ? {…} : {…}` — collect each literal up to the `;`
        const stmtEnd = (() => { let depth = 0, q = null; for (let k = at; k < src.length; k++) { const c = src[k]; if (q) { if (c === '\\') { k++; continue; } if (c === q) q = null; continue; } if (c === '"' || c === "'" || c === '`') { q = c; continue; } if ('({['.includes(c)) depth++; else if (')}]'.includes(c)) depth--; else if (c === ';' && depth === 0) return k; } return src.length; })();
        while (i < stmtEnd) { if (src[i] === '{') { const b = balanced(src, i); if (!b) break; branches.push(objectKeys(b)); i += b.length; } else i++; }
        if (branches.length) {
          always = branches[0].always.filter((k) => branches.every((b) => b.always.includes(k)));
          conditional = [...new Set(branches.flatMap((b) => [...b.always, ...b.conditional]).filter((k) => !always.includes(k)))];
        }
        const tail = src.slice(stmtEnd, m.index);
        for (const a of tail.matchAll(new RegExp(`\\b${p}\\.([A-Za-z_$][\\w$]*)\\s*=(?!=)`, 'g'))) if (!always.includes(a[1]) && !conditional.includes(a[1])) conditional.push(a[1]);
      }
    }
    sites.push({ methods, line, always, conditional, dynamic });
  }
  return sites;
}

/** The notification / server-request names the wrapper CONSUMES: every
 *  `method === '<name>'` literal + every SERVER_REQUEST_SPEC key. */
export function wrapperConsumed(rawSrc) {
  const src = stripComments(rawSrc);
  const compared = [...new Set([...src.matchAll(/method === '([^']+)'/g)].map((x) => x[1]))].sort();
  const at = src.indexOf('const SERVER_REQUEST_SPEC = {');
  const spec = at >= 0 ? balanced(src, src.indexOf('{', at)) : null;
  const serverRequests = spec ? topLevelParts(spec.slice(1, -1)).map((p) => (p.match(/^'([^']+)'\s*:/) || [])[1]).filter(Boolean).sort() : [];
  const notifies = [...new Set([...src.matchAll(/(?<![\w.$])notify\('([^']+)'/g)].map((x) => x[1]))].sort();
  return { compared, serverRequests, notifies };
}

/** A schema bundle directory (generate-json-schema --experimental) → the
 *  protocol facts the census judges against. */
export function tableFromSchemaDir(dir) {
  const rd = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const cr = rd('ClientRequest.json');
  const defs = cr.definitions || cr.$defs || {};
  const deref = (s) => { let d = s, hops = 0; while (d && d.$ref && hops++ < 8) d = defs[d.$ref.split('/').pop()]; return d; };
  const clientRequests = {};
  for (const v of cr.oneOf || []) {
    const method = v.properties?.method?.enum?.[0];
    if (!method) continue;
    const p = v.properties?.params;
    let type = null, d = null;
    if (p && p.$ref) { type = p.$ref.split('/').pop(); d = deref(p); }
    else if (p && p.anyOf) { const r = p.anyOf.find((x) => x.$ref); type = r ? r.$ref.split('/').pop() + '|null' : null; d = r ? deref(r) : null; }
    const required = (v.required || []).includes('params') && d ? [...(d.required || [])].sort() : (d ? [...(d.required || [])].sort() : []);
    const properties = d && d.properties ? Object.keys(d.properties).sort() : [];
    clientRequests[method] = { params: type, paramsOptional: !(v.required || []).includes('params'), required, properties };
  }
  const names = (f) => (rd(f).oneOf || []).map((v) => v.properties?.method?.enum?.[0]).filter(Boolean).sort();
  const v2 = rd('codex_app_server_protocol.v2.schemas.json');
  const v2defs = v2.definitions || v2.$defs || {};
  const outcomes = (v2defs.ConsumeAccountRateLimitResetCreditOutcome?.oneOf || v2defs.ConsumeAccountRateLimitResetCreditOutcome?.enum?.map((e) => ({ enum: [e] })) || []).flatMap((o) => o.enum || []).sort();
  return {
    clientRequests,
    clientNotifications: names('ClientNotification.json'),
    serverNotifications: names('ServerNotification.json'),
    serverRequests: names('ServerRequest.json'),
    resetCreditOutcomes: outcomes,
  };
}

/** Judge the wrapper against one measured table → findings (empty = in step).
 *  `neverShipped` = consumed names deliberately absent from every measured
 *  binary, each with a reason. */
export function judge(table, src, { neverShipped = {} } = {}) {
  const findings = [];
  for (const s of wrapperRequestSites(src)) {
    if (!s.methods.length) { findings.push({ kind: 'unresolved-site', line: s.line, detail: 'a request() whose method could not be read off the source' }); continue; }
    for (const method of s.methods) {
      const row = table.clientRequests[method];
      if (!row) { findings.push({ kind: 'unknown-method', method, line: s.line, detail: `${method} is not a request codex ${table.codexVersion} serves` }); continue; }
      for (const f of row.required) {
        if (s.always.includes(f)) continue;
        if (s.conditional.includes(f) && s.dynamic) continue; // a dynamic site's conditional key (startThread's threadId on resume/fork) — the stub leg drives it
        findings.push({ kind: 'missing-required', method, field: f, line: s.line, detail: `${method} requires \`${f}\` on codex ${table.codexVersion} (${s.conditional.includes(f) ? 'sent only sometimes' : 'never sent'})` });
      }
      // a dynamic site's CONDITIONAL keys are method-dependent (threadId only on
      // resume/fork, personality never on fork) — only its always-sent keys are
      // judged against every method it can name
      if (row.properties.length) for (const k of (s.dynamic ? s.always : [...s.always, ...s.conditional])) if (!row.properties.includes(k)) findings.push({ kind: 'unknown-field', method, field: k, line: s.line, detail: `${method} has no \`${k}\` field on codex ${table.codexVersion} (renamed or retired — serde drops it silently)` });
    }
  }
  const c = wrapperConsumed(src);
  const known = new Set([...table.serverNotifications, ...table.serverRequests]);
  for (const n of c.compared) if (!known.has(n) && !(n in neverShipped) && !table.clientRequests[n]) findings.push({ kind: 'retired-notification', method: n, detail: `the wrapper consumes \`${n}\`, which codex ${table.codexVersion} never sends` });
  for (const n of c.serverRequests) if (!table.serverRequests.includes(n)) findings.push({ kind: 'retired-server-request', method: n, detail: `the wrapper answers \`${n}\`, which codex ${table.codexVersion} never asks` });
  for (const n of c.notifies) if (!table.clientNotifications.includes(n)) findings.push({ kind: 'unknown-client-notification', method: n, detail: `the wrapper sends notification \`${n}\`, unknown to codex ${table.codexVersion}` });
  return findings;
}

/** Every measured table in the fixture dir, oldest first (semver order). */
export function measuredTables(repo) {
  const dir = path.join(repo, TABLE_DIR);
  const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };
  return fs.readdirSync(dir).map((f) => f.match(/^(\d+\.\d+\.\d+)-methods\.json$/)).filter(Boolean)
    .sort((a, b) => cmp(a[1], b[1])).map((m) => ({ version: m[1], file: path.join(dir, m[0]), table: JSON.parse(fs.readFileSync(path.join(dir, m[0]), 'utf8')) }));
}

/** The INSTALLED codex-cli version, launch-free first: the npm package.json
 *  beside the `codex` on PATH; else `codex --version` under a throwaway
 *  CODEX_HOME (no login, no network use). → {version, bin, how} | null */
export function installedCodexVersion({ env = process.env, scratchHome = null } = {}) {
  let bin = '';
  try { bin = execFileSync('sh', ['-c', 'command -v codex'], { encoding: 'utf8', env }).trim(); } catch { }
  if (!bin) return null;
  try {
    let d = path.dirname(fs.realpathSync(bin));
    for (let i = 0; i < 6; i++) {
      const pj = path.join(d, 'package.json');
      if (fs.existsSync(pj)) { const j = JSON.parse(fs.readFileSync(pj, 'utf8')); if (j.name === '@openai/codex' && j.version) return { version: j.version, bin, how: pj }; }
      d = path.dirname(d);
    }
  } catch { }
  try {
    const out = execFileSync(bin, ['--version'], { encoding: 'utf8', timeout: 10000, env: { ...env, ...(scratchHome ? { CODEX_HOME: scratchHome } : {}) }, stdio: ['ignore', 'pipe', 'ignore'] });
    const v = (out.match(/(\d+\.\d+\.\d+)/) || [])[1];
    if (v) return { version: v, bin, how: 'codex --version' };
  } catch { }
  return null;
}
