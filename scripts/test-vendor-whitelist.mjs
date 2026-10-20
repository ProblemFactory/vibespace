#!/usr/bin/env node
// VENDOR-CALL WHITELIST GUARD (docs/design-three-tier.md §Quota refresh origin:
// "the safety law is a WHITELIST … a guard test enforces the whitelist
// structurally"). §ban-safety is the one law whose violation gets accounts
// BANNED (real Max ban, refunded, 2.60.0 postmortem) — so which code may
// construct a request to Anthropic is pinned HERE, not by discipline.
//
// Contract:
//  1. The ONLY files that construct an HTTP request to an Anthropic endpoint
//     are the allowlisted ones, with their exact construction counts.
//  2. Each allowlisted site keeps its GATES (opt-in setting / human-gate
//     setting / 429 backoff) — deleting a gate fails this test even though
//     the call site itself is unchanged.
//  3. The device daemon (source AND built bundle) contains ZERO vendor
//     endpoints: no device op may originate a vendor call. When the
//     human-gated quota-refresh op moves device-side, it gets allowlisted
//     HERE deliberately, with its own gate asserts — that is the point.
//  4. The shipped usage tools (statusline capture + remote scanner) import no
//     network primitives at all: purely passive by construction.
//  7. (R3, 2026-09-26) A CHANNEL PICTURE's bytes — the one vendor request a
//     WINDOW can cause — are fetched ON DEMAND, CACHE-FIRST and BUDGET-CHARGED:
//     a census of the engine's order, with four ungated copies as controls.
// Adding a vendor call ANYWHERE else fails this test until it is explicitly
// allowlisted with its gates. That is the desired friction.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { engineSource } from './channels-engine-src.mjs';   // lane dc-channels-seams: the engine + its three family files as one text
const require = createRequire(import.meta.url);

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };

const VENDOR = /api\.anthropic\.com|platform\.claude\.com|console\.anthropic\.com|claude\.ai\/|anthropic-beta/;
// The CONSTRUCTION census also counts OpenAI hosts (dc-pool-quota verify r1): the codex live quota read moved into
// src/harnesses/codex-quota.js and rides the official client's app-server — a raw fetch to ChatGPT/OpenAI beside it
// was invisible here. Only the census widens: whole-file VENDOR reads (permission-rules' comments name chatgpt.com) keep theirs
// lane decision-core: + openrouter.ai and the decisions marker — the ONE decisions caller fetches a URL the PURE model
// builds (any base URL), so the census counts the source marker DECISION_ENDPOINT beside the request, not a host
// lane rule-learning (q-037 P0): + the chat completions marker TEXT_ENDPOINT — the ONE text-model caller fetches a URL it builds
// from its base (a test hands in a loopback base), so the census counts the source marker beside the request, like DECISION_ENDPOINT
// lane models-at-session (q-053 P0c): + the listed-provider refresh's marker PROVIDER_MODELS — the ONE /models caller fetches a URL
// the PURE record builds from a provider's base (any base: OpenRouter's, an OpenAI-compatible one; a suite hands in a loopback)
const CONSTRUCT_HOSTS = new RegExp(VENDOR.source + '|chatgpt\\.com|openai\\.com|fish\\.audio|openrouter\\.ai|DECISION_ENDPOINT|TEXT_ENDPOINT|PROVIDER_MODELS'); // + Dropline voice input (q-029): api.dropline.fish.audio | api.fish.audio | fish.audio
const REQUESTY = /https?\.request\s*\(|\bfetch\s*\(|axios|got\s*\(/;

// ── collect every server-side JS file (the browser bundle never holds tokens) ──
const files = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', '.git', 'public', 'docs', 'lib'].includes(e.name)) continue; // src/lib = browser
      walk(p);
    } else if (/\.(js|mjs)$/.test(e.name)) files.push(p);
  }
};
walk(path.join(REPO, 'src'));
files.push(path.join(REPO, 'server.js'));
for (const f of fs.readdirSync(path.join(REPO, 'data', 'bin'))) {
  if (/\.(js|mjs)$/.test(f) || !f.includes('.')) {
    const p = path.join(REPO, 'data', 'bin', f);
    try { if (fs.statSync(p).isFile()) files.push(p); } catch { }
  }
}

// ── 1+2: request constructions near a vendor string, per file ──
// A "construction" = a vendor endpoint within ±4 lines of a request primitive.
const constructions = {}; // rel → count
for (const f of files) {
  let text; try { text = fs.readFileSync(f, 'utf-8'); } catch { continue; }
  const rel = path.relative(REPO, f);
  if (rel.startsWith('data/bin/vibespace-agentd')) continue; // asserted separately below
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!CONSTRUCT_HOSTS.test(lines[i])) continue;
    const lo = Math.max(0, i - 4), hi = Math.min(lines.length, i + 5);
    const ctx = lines.slice(lo, hi).join('\n');
    if (REQUESTY.test(ctx)) constructions[rel] = (constructions[rel] || 0) + 1;
  }
}

const ALLOW = {
  // _fetchOAuthUsage (oauth/usage) + _fetchOAuthRoles (claude_cli/roles):
  // each URL line + its anthropic-beta header line sit inside one https.request
  // context window; counts pin the shape, not exact line numbers.
  'src/usage-routes.js': { max: 6, gates: ['usagePollingEnabled', '_rateLimitBackoffUntil', "onDemandQuotaRefresh"] },
  // refreshAvailableModels' v1/models fetch (both auth types) — lived in
  // server.js until the 2.325.0 decomposition moved the CLI environment out
  'src/server/cli-env.js': { max: 4, gates: ['usagePollingEnabled'] },
  // Dropline voice input (q-029 P0): THE one vendor module — /v1/me (the plugin card's Test) + /v1/dictate (the hub
  // proxy); every request gated by the plugin's switch and the `dropline` row's key; P1 (lane voice-p1-oauth-teach):
  // the OAuth tier (register / token exchange / single-flight refresh) + the teach writes behind teachCap — same 6 sites
  'src/server/dropline-client.js': { max: 6, gates: ['pluginOn', 'credentialOf', 'teachCap', 'refreshing'] },
  // lane decision-core: THE decisions API caller (OpenAI /v1/decisions, OpenRouter /api/alpha/decisions) — ONE fetch,
  // behind the PURE budget verdict, the plugin's own switch and the registry row's key
  // lane judge-one-shot-body: `oneShot` — the request carries the ONE-SHOT body (M.oneShotBody), asserted by token below
  'src/server/decision-engine.js': { max: 1, oneShot: true, gates: ['budgetVerdict', 'pluginOn', "resolveIntegration(ROW_ID)", 'DECISION_ENDPOINT'] },
  // lane rule-learning (design q-037 P0): THE chat completions caller (OpenRouter /api/v1/chat/completions — the text model
  // that DRAFTS the person's 「我关心什么」 block, proposed never written) — ONE fetch, behind the PURE budget verdict (the
  // plugin's daily budget + the use's own cap), the plugin's switch, the Language model row's key, and the zero-data-retention
  // routing as LITERALS (no endpoint ⇒ the named refusal no-zdr, never a request without them)
  'src/server/text-model-client.js': { max: 1, oneShot: true, gates: ['budgetVerdict', 'pluginOn', 'resolveIntegration(ROW_ID)', 'TEXT_ENDPOINT', 'zdr: true', "data_collection: 'deny'"] },
  // lane models-at-session (design q-053 r1 §3): THE LISTED-PROVIDER REFRESH — a GET of a third-party provider's /models
  // (OpenRouter, an OpenAI-compatible base) — ONE request, behind a person's press (the one door; `by: 'human'`), the vault
  // open, once a minute per provider (the PURE refreshVerdict), the answer CACHED on the record (setListed); §15 pins each
  'src/server/provider-models.js': { max: 1, gates: ['PROVIDER_MODELS', "if (by !== 'human')", 'MP.refreshVerdict(', 'vault: vaultState()', 'providers.setListed('] },
};
for (const [rel, n] of Object.entries(constructions)) {
  const a = ALLOW[rel];
  ok(!!a, `vendor request construction only in allowlisted files (found in ${rel}${a ? '' : ' — NOT ALLOWLISTED'})`);
  if (a) ok(n <= a.max, `${rel}: construction count ${n} ≤ ${a.max} (a NEW vendor call site must be allowlisted here with its gates)`);
}
// CONTROL: a raw vendor fetch planted beside the codex live read (quota.readLive) is a construction in a file outside
// the rows — the census counts it, so the allowlist check above would go red
{
  const constructionsIn = (text) => { const L = text.split('\n'); let n = 0; for (let i = 0; i < L.length; i++) if (CONSTRUCT_HOSTS.test(L[i]) && REQUESTY.test(L.slice(Math.max(0, i - 4), i + 5).join('\n'))) n++; return n; };
  const cq = fs.readFileSync(path.join(REPO, 'src/harnesses/codex-quota.js'), 'utf-8');
  const planted = cq.replace('function settleLive(', "async function peekUsage() { return fetch('https://chatgpt.com/backend-api/wham/usage'); }\nfunction settleLive(");
  ok(!ALLOW['src/harnesses/codex-quota.js'] && constructionsIn(cq) === 0 && planted !== cq && constructionsIn(planted) === 1, 'CONTROL: a raw ChatGPT fetch planted beside the codex live read is a construction outside the allowlist (RED)', String(constructionsIn(planted)));
}
// CONTROL (q-029): a COPY of the Dropline dictation request planted in the hub route (src/routes/voice.js) is a
// construction outside the allowlist — the one-module rule for api.dropline.fish.audio goes RED on it
{
  const constructionsIn = (text) => { const L = text.split('\n'); let n = 0; for (let i = 0; i < L.length; i++) if (CONSTRUCT_HOSTS.test(L[i]) && REQUESTY.test(L.slice(Math.max(0, i - 4), i + 5).join('\n'))) n++; return n; };
  const vr = fs.readFileSync(path.join(REPO, 'src/routes/voice.js'), 'utf-8');
  const anchor = '  router.get(\'/api/voice/status\'';
  const planted = vr.replace(anchor, "  const direct = (buf) => fetch('https://api.dropline.fish.audio/v1/dictate', { method: 'POST', body: buf });\n" + anchor);
  ok(!ALLOW['src/routes/voice.js'] && constructionsIn(vr) === 0 && planted !== vr && constructionsIn(planted) === 1 && (constructions['src/server/dropline-client.js'] || 0) >= 2, 'CONTROL: a Dropline request planted in the hub route is a construction outside the allowlist (RED); the vendor module holds /v1/me + /v1/dictate', String(constructionsIn(planted)));
}
// voice-verify F4: the census also follows a vendor module's EXPORTED URL constants — a request built from
// `require('./dropline-client.js').DROPLINE_BASE` elsewhere has no host literal near its fetch(, so the count above never
// sees it. Derived from the module: every exported string naming a vendor host; outside that module no server file that
// requires it may name one (a reader of the base is a construction the host census cannot see)
{
  const VENDOR_MODULES = ['src/server/dropline-client.js'];
  const urlExportsOf = (rel) => { const M = require(path.join(REPO, rel)); return Object.keys(M).filter((k) => typeof M[k] === 'string' && CONSTRUCT_HOSTS.test(M[k])); };
  const baseReaders = (texts) => VENDOR_MODULES.flatMap((vm) => {
    const NAME = new RegExp(`\\b(?:${urlExportsOf(vm).join('|')})\\b`), stem = path.basename(vm, '.js');
    return Object.entries(texts).filter(([rel, t]) => rel !== vm && t.includes(stem) && NAME.test(t)).map(([rel]) => `${rel} ← ${vm}`);
  });
  const texts = Object.fromEntries(files.map((f) => { try { return [path.relative(REPO, f), fs.readFileSync(f, 'utf-8')]; } catch { return [path.relative(REPO, f), '']; } }));
  const names = urlExportsOf('src/server/dropline-client.js');
  ok(['DROPLINE_BASE', 'OAUTH_BASE', 'AUTHORIZE_URL'].every((n) => names.includes(n)), `the vendor module's exported URL constants are derived (${names.join(', ')})`, names.join());
  const readers = baseReaders(texts);
  ok(readers.length === 0, 'no server file outside the vendor module reads its exported URL constants', readers.join('; '));
  const rel = 'src/server/voice-teach-engine.js', t = texts[rel] || '';
  const planted = t.replace("'use strict';\n", "'use strict';\nconst sneak = (body) => fetch(require('./dropline-client.js').DROPLINE_BASE + '/v1/terms', { method: 'POST', body });\n");
  const hostLines = (s) => s.split('\n').filter((l) => CONSTRUCT_HOSTS.test(l)).length;
  ok(planted !== t && hostLines(planted) === hostLines(t) && baseReaders({ ...texts, [rel]: planted }).includes(`${rel} ← src/server/dropline-client.js`), 'CONTROL (voice-verify m2): a fetch in the teach engine built from the exported DROPLINE_BASE adds no host literal (the count above stays green) but is RED here');
}
// CONTROL (lane decision-core): a copy of the decisions fetch planted anywhere else — beside the PURE model's own URLs,
// or a marker-carrying fetch in another server file — is a construction outside the allowlist (RED); the engine with
// its budget gate taken out no longer carries the gate marker (RED)
{
  const constructionsIn = (text) => { const L = text.split('\n'); let n = 0; for (let i = 0; i < L.length; i++) if (CONSTRUCT_HOSTS.test(L[i]) && REQUESTY.test(L.slice(Math.max(0, i - 4), i + 5).join('\n'))) n++; return n; };
  const dm = fs.readFileSync(path.join(REPO, 'src/decision-model.js'), 'utf-8');
  const eng = fs.readFileSync(path.join(REPO, 'src/server/decision-engine.js'), 'utf-8');
  const plantedModel = dm.replace("openrouter: { baseUrl: 'https://openrouter.ai',", "openrouter: { peek: () => fetch('https://openrouter.ai/api/alpha/decisions'), baseUrl: 'https://openrouter.ai',");
  const plantedEngine = eng.replace(/^.*budgetVerdict\(\{\s*$/m, '    const v = { ok: true }; ({');
  ok(!ALLOW['src/decision-model.js'] && constructionsIn(dm) === 0 && plantedModel !== dm && constructionsIn(plantedModel) >= 1, 'CONTROL: a decisions fetch planted in the PURE model (beside its own URL) is a construction outside the allowlist (RED)', String(constructionsIn(plantedModel)));
  ok(constructionsIn(eng) === 1 && plantedEngine !== eng && (plantedEngine.match(/budgetVerdict\(/g) || []).length < (eng.match(/budgetVerdict\(/g) || []).length, 'CONTROL: the engine with its budgetVerdict call removed loses the gate the row names (the gate census turns RED)');
}
// lane rule-learning: the chat completions call is EXACTLY one site in ONE file (count exact); the gates live in the CODE (a
// header that merely names them is no gate); CONTROLS — a copy planted beside the learn route (RED: outside the allowlist), a
// second call in the client (RED: over its count), the routing literal taken out / the budget verdict taken out (RED: a code
// gate gone); the client and the PURE drafter name no Anthropic endpoint (the Sonnet tier rides OpenRouter)
{
  const REL = 'src/server/text-model-client.js';
  const constructionsIn = (text) => { const L = text.split('\n'); let n = 0; for (let i = 0; i < L.length; i++) if (CONSTRUCT_HOSTS.test(L[i]) && REQUESTY.test(L.slice(Math.max(0, i - 4), i + 5).join('\n'))) n++; return n; };
  const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
  const ROUTING = "provider: Object.freeze({ zdr: true, data_collection: 'deny' })";   // the request's routing literal, whole and FROZEN (a journal row's zdr: true is no gate)
  const CODE_GATES = ['budgetVerdict(', 'pluginOn', 'resolveIntegration(ROW_ID)', ROUTING];
  const missing = (text) => CODE_GATES.filter((g) => !code(text).includes(g));
  const tm = fs.readFileSync(path.join(REPO, REL), 'utf-8');
  const rl = fs.readFileSync(path.join(REPO, 'src/rule-learning.js'), 'utf-8');
  ok(constructions[REL] === 1 && constructionsIn(tm) === 1 && ALLOW[REL].max === 1, `${REL}: exactly ONE chat completions construction (count exact: ${constructions[REL]})`);
  ok(missing(tm).length === 0, `${REL}: every gate is CODE, not only a comment (${CODE_GATES.join(' · ')})`, missing(tm).join());
  ok(!VENDOR.test(tm) && !VENDOR.test(rl) && !/api\.anthropic|anthropic\.com/.test(tm + rl), 'the text-model client and the PURE drafter name no Anthropic endpoint (the quality tier rides OpenRouter, billed per token)');
  const rt = fs.readFileSync(path.join(REPO, 'src/routes/channels.js'), 'utf-8');
  const anchor = "router.post('/api/channels/decision/learn'";
  const planted = rt.replace(anchor, "const direct = (body) => fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', body });\n" + anchor);
  ok(!ALLOW['src/routes/channels.js'] && constructionsIn(rt) === 0 && planted !== rt && constructionsIn(planted) === 1, 'CONTROL: a chat completions fetch planted beside the learn route is a construction outside the allowlist (RED)', String(constructionsIn(planted)));
  const twice = tm.replace('    const u = json ? usageOf(json)', "    // TEXT_ENDPOINT — a second call (a retry without the routing)\n    await fetch(url, { method: 'POST' });\n    const u = json ? usageOf(json)");
  ok(twice !== tm && constructionsIn(twice) === 2 && constructionsIn(twice) > ALLOW[REL].max, 'CONTROL: a SECOND chat completions call in the client itself is over its count (RED)', String(constructionsIn(twice)));
  const noZdr = tm.replace(ROUTING + ',', 'provider: {},'), offZdr = tm.replace(ROUTING, "provider: { zdr: false, data_collection: 'deny' }"), allow = tm.replace(ROUTING, "provider: { zdr: true, data_collection: 'allow' }");
  ok([noZdr, offZdr, allow].every((x) => x !== tm && missing(x).join() === ROUTING), 'CONTROL: the client with its routing literal taken out, with zdr: false, or with data_collection: allow loses the zero-data-retention gate (RED ×3) — a header or a journal row naming them does not count', [noZdr, offZdr, allow].map((x) => missing(x).join()));
  const noBudget = tm.replace('const v = M.budgetVerdict(', 'const v = ({ ok: true }) || (');
  ok(noBudget !== tm && missing(noBudget).join() === 'budgetVerdict(', 'CONTROL: the client with its budget verdict taken out loses the money gate (RED)', missing(noBudget).join());

  // lane rule-learning-fix F1 — the census COUNTS, it does not only look: (a) the request PRIMITIVES in the client's code are
  // counted as TOKENS (a second call carries no marker comment of its own — the ±4-line host census above never saw it):
  // exactly the row's max; the default binding `(...a) => globalThis.fetch(...a)` defines the primitive, it is no call site;
  // (b) a server file that REACHES the client (requires text-model-client.js or reads a `.textModel`) and holds a request
  // primitive is a construction site — allowlisted within its count, or RED (a fetch built from the client's own `url`
  // carries no host literal); (c) the body the request carries is the literal as built — never written after (an
  // Object.assign / a property write / a delete would override the routing on the wire with the literal still in the text);
  // (d) the routing literal is a DIRECT line of that body (a literal in a dead branch is text, not a request)
  const PRIM = /\b(?:fetch|fetchImpl)\s*\(|\bhttps?\.request\s*\(|\baxios\b|\bgot\s*\(|\bXMLHttpRequest\b|\bundici\b/g;
  const DEFAULT_PRIM = '(...a) => globalThis.fetch(...a)';
  const primCount = (text) => (code(text).split(DEFAULT_PRIM).join('').match(PRIM) || []).length;
  const reaches = (text) => /text-model-client|\.textModel\b/.test(code(text));
  const texts = Object.fromEntries(files.map((f) => { try { return [path.relative(REPO, f), fs.readFileSync(f, 'utf-8')]; } catch { return [path.relative(REPO, f), '']; } }));
  const reachSites = (all) => Object.entries(all).filter(([rel, t]) => rel !== REL && reaches(t) && primCount(t) > 0)
    .filter(([rel, t]) => !ALLOW[rel] || primCount(t) > ALLOW[rel].max).map(([rel, t]) => `${rel} (${primCount(t)} request primitive(s), allowlisted ${ALLOW[rel] ? ALLOW[rel].max : 0})`);
  const bodyWrites = (text) => (code(text).match(/\b(?:Object\.assign|Object\.defineProperty|Reflect\.set|Reflect\.deleteProperty)\s*\(\s*body\b|\bbody\s*(?:\.\s*\w+|\[[^\]\n]*\])\s*(?:[-+*\/|&]?=(?!=)|\+\+|--)|\bdelete\s+body\b/g) || []).length;
  const BODY_AT = 'const body = Object.freeze({';
  const bodyLiteral = (text) => { const c = code(text), i = c.indexOf(BODY_AT); if (i < 0) return ''; let d = 0; for (let k = c.indexOf('{', i); k < c.length; k++) { if (c[k] === '{') d++; else if (c[k] === '}' && --d === 0) return c.slice(i, k + 1); } return ''; };
  // …serialized ONCE into bytes and sent as a ONE-SHOT stream of them (lane rule-learning-fix-r2: a string body is re-sent
  // by Node's fetch on a 421 — a second request; a body with no source never is)
  const SERIAL = 'const bytes = new TextEncoder().encode(JSON.stringify(body));';
  const ONE_SHOT = "body: M.oneShotBody(bytes), duplex: 'half',";   // the shared PURE stream (lane judge-one-shot-body) — the census below asserts it for BOTH rows
  const count = (hay, needle) => hay.split(needle).length - 1;
  const routedOnBody = (text) => { const c = code(text); return bodyLiteral(text).split('\n').some((l) => l.trim() === ROUTING + ',') && count(c, SERIAL) === 1 && count(c, ONE_SHOT) === 1 && (c.match(/\bbytes\b/g) || []).length === 3; };
  ok(primCount(tm) === ALLOW[REL].max, `${REL}: ${primCount(tm)} request primitive token(s) in its code = the row's max ${ALLOW[REL].max} (counted as tokens, not as marker lines)`, primCount(tm));
  const reachers = Object.entries(texts).filter(([rel, t]) => rel !== REL && reaches(t)).map(([rel]) => rel);
  ok(reachers.includes('src/server/decision-engine.js') && reachers.includes('src/server/channels-attention.js') && reachSites(texts).length === 0, `the files that reach the text client (${reachers.join(', ')}) hold no request primitive beyond their own allowlisted count`, reachSites(texts));
  ok(bodyWrites(tm) === 0 && routedOnBody(tm), `${REL}: the request's body is never written after it is built, and the routing literal is a direct line of it`, { writes: bodyWrites(tm), routed: routedOnBody(tm) });
  const U = '    const u = json ? usageOf(json)';
  const retry = tm.replace(U, "    if (status === 0) { try { const r2 = await fetch(url, { method: 'POST', body: JSON.stringify({ ...body, provider: undefined }) }); status = r2.status; } catch { } }\n" + U);
  ok(retry !== tm && primCount(retry) === 2 && constructionsIn(retry) === 1, 'CONTROL (M3): a non-ZDR retry with NO marker comment — invisible to the ±4-line host census (still 1) — is 2 primitive tokens (RED)', [constructionsIn(retry), primCount(retry)]);
  const ca = texts['src/server/channels-attention.js'] || '';
  const viaUrl = ca.replace('  /** lane rule-learning: is the text-model drafter there?', "  async function quickDraft(messages) { const tm = decision && decision.textModel; return fetch(tm.url, { method: 'POST', body: JSON.stringify({ messages }) }); }\n  /** lane rule-learning: is the text-model drafter there?");
  ok(viaUrl !== ca && reachSites({ ...texts, 'src/server/channels-attention.js': viaUrl }).some((s) => s.startsWith('src/server/channels-attention.js')), 'CONTROL (M4): a chat completions copy in channels-attention built from the client\'s own url (no host literal) is a construction site outside the allowlist (RED)');
  const de = texts['src/server/decision-engine.js'] || '';
  const engCopy = de.replace("  const textModel = require('./text-model-client.js').create(", "  const peek = (m) => fetch(String(textModel && textModel.url), { method: 'POST', body: JSON.stringify({ m }) });\n  const textModel = require('./text-model-client.js').create(");
  ok(engCopy !== de && reachSites({ ...texts, 'src/server/decision-engine.js': engCopy }).some((s) => s.startsWith('src/server/decision-engine.js')), 'CONTROL: a second request in the decision engine (which builds the client) is over its own count (RED)');
  const LET = "    let status = 0, json = null, message = '', failed = null, sending = null;";
  const over = tm.replace(LET, "    Object.assign(body, { provider: { data_collection: 'allow' } });\n" + LET), prop = tm.replace(LET, '    body.provider = {};\n' + LET), del = tm.replace(LET, '    delete body.provider;\n' + LET);
  ok([over, prop, del].every((x) => x !== tm && bodyWrites(x) === 1 && missing(x).length === 0), 'CONTROL (M2): the literal kept and then overridden (Object.assign / a property write / a delete) — every text gate still green — is a body write (RED ×3)', [over, prop, del].map(bodyWrites));
  const dead = tm.replace(ROUTING + ',', `...(false ? { ${ROUTING}, } : {}),`);
  ok(dead !== tm && missing(dead).length === 0 && !routedOnBody(dead), 'CONTROL (M8b): the routing literal moved into a dead branch — the text gate still green — is no direct line of the body (RED)');

  // lane rule-learning-fix-r2 F1 (verify r2: N1 / N2a-c / N3 GREEN on every census above) — (e) THE REQUEST IS FROZEN where
  // it is built, by TOKEN: `const body = Object.freeze({` and the routing `Object.freeze`d inside it, in a strict module
  // (a write — `body.provider.zdr = false`, an alias of it — throws; it never reaches the wire), and SERIALIZED ONCE, in
  // the request: ONE JSON.stringify in the client (into the bytes the one-shot stream sends — no copy, no spread, no edit of
  // it — the bytes named three times: made · measured · sent), `body` named exactly twice (built · serialized), the routing
  // never read back (`.provider`); (f) THE PRIMITIVES
  // ARE COUNTED OVER THE CLIENT'S REQUIRE CLOSURE — the client and every src-local module it requires, transitively:
  // fetch( / fetchImpl( / .call( / .apply( / .bind( / Reflect.apply( / Reflect.construct( / http(s).request|get( /
  // undici / axios / got( / XMLHttpRequest / WebSocket / globalThis — EXACTLY 1 in total (the one call); the primitive
  // named nowhere but where it is bound (an alias is a call site); a load the census cannot follow (a computed require, an
  // import(), createRequire) or a network module (http / https / net / tls / undici …) anywhere in the closure is RED.
  // `reaches` therefore runs both ways: the files that require the client (above) and the files the client requires.
  const FROZEN = [BODY_AT, ROUTING];
  const frozen = (text) => /^'use strict';/.test(text) && FROZEN.every((f) => code(text).includes(f));
  const bodyRefs = (text) => (code(text).match(/\bbody\b(?!\s*:)/g) || []).length;            // a key `body:` is no reference
  const serials = (text) => (code(text).match(/\bJSON\s*\.\s*stringify\s*\(/g) || []).length;
  const readsRouting = (text) => /\.\s*provider\b|\[\s*['"`]provider['"`]\s*\]/.test(code(text));
  const sealed = (text) => frozen(text) && bodyRefs(text) === 2 && serials(text) === 1 && routedOnBody(text) && !readsRouting(text);
  const sealOf = (text) => ({ frozen: frozen(text), bodyRefs: bodyRefs(text), serials: serials(text), routed: routedOnBody(text), readsRouting: readsRouting(text) });
  ok(sealed(tm), `${REL}: the request body and its routing are Object.freeze'd where they are built (strict module), \`body\` is named twice (built · serialized), ONE JSON.stringify — in the request — and the routing is never read back`, sealOf(tm));
  // lane learn-card-untick (verify r3 R3-F4): + `module` (`require('module')._load` = a createRequire) and Node's internal
  // aliases `_http_*` / `_tls_*` / `_stream_*` (`require('_http_client')` is the HTTP client itself)
  const NET_MODULE = /^(?:node:)?(?:http|https|http2|net|tls|dgram|dns|child_process|worker_threads|cluster|inspector|module|_(?:http|tls|stream)_\w+|undici|node-fetch|axios|got|ws|request|superagent)$/;
  const PRIM_ALL = /\b(?:fetch|fetchImpl)\s*\(|\.\s*(?:call|apply|bind)\s*\(|\bReflect\s*\.\s*(?:apply|construct)\s*\(|\bhttps?\s*\.\s*(?:request|get)\s*\(|\bundici\b|\baxios\b|\bgot\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bglobalThis\b|\bglobal\s*\.\s*fetch\b/g;
  const BENIGN = ['Object.prototype.hasOwnProperty.call('];   // the one `.call(` receiver the closure holds: an own-key read, never a request
  const BINDING = ['fetchImpl = (...a) => globalThis.fetch(...a)', 'const fetch = fetchImpl;'];   // where the primitive is BOUND (the parameter, its census name)
  const stripped = (text) => [...BINDING, ...BENIGN].reduce((c, b) => c.split(b).join(b === BINDING[0] ? 'fetchImpl' : ' '), code(text));
  const primsOf = (text) => stripped(text).match(PRIM_ALL) || [];
  const namesOf = (text) => (stripped(text).replace(/\bfetchImpl\b(?=\s*[,}])/, '').match(/\b(?:fetch|fetchImpl)\b(?!\s*\()/g) || []);   // an alias of the primitive
  const resolveRel = (from, spec, exists) => { let r = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec)); if (!/\.(c?js|mjs|json)$/.test(r)) r = exists(r + '.js') ? r + '.js' : r + '/index.js'; return r; };
  const closureOf = (start, read, exists) => {
    const seen = new Map(), bad = [], q = [start];
    while (q.length) {
      const rel = q.shift(); if (seen.has(rel)) continue;
      const t = read(rel); if (t === null) { bad.push(`${rel}: unreadable`); continue; }
      seen.set(rel, t);
      const c = code(t);
      for (const m of c.matchAll(/\b(require|import)\s*\(\s*([^)]*?)\s*\)/g)) {
        const lit = /^(['"`])([^'"`$]+)\1$/.exec(m[2]);
        if (!lit) { bad.push(`${rel}: ${m[1]}(${m[2].slice(0, 40)}) — a load the census cannot follow`); continue; }
        if (lit[2].startsWith('.')) q.push(resolveRel(rel, lit[2], exists));
        else if (NET_MODULE.test(lit[2])) bad.push(`${rel}: requires '${lit[2]}' (a network module)`);
      }
      if (/\bcreateRequire\b|\bmodule\s*\.\s*require\b|\bprocess\s*\.\s*(?:binding|dlopen)\b|\bprocess\s*\[|\b_load\s*\(/.test(c)) bad.push(`${rel}: a loader the census cannot follow`);   // process[…] (R3-F4)
    }
    return { files: [...seen.keys()], texts: seen, bad };
  };
  const onDisk = (over = {}) => ({ read: (rel) => (rel in over ? over[rel] : (() => { try { return fs.readFileSync(path.join(REPO, rel), 'utf-8'); } catch { return null; } })()), exists: (rel) => rel in over || fs.existsSync(path.join(REPO, rel)) });
  const closureCensus = (over = {}) => {
    const d = onDisk(over), cl = closureOf(REL, d.read, d.exists);
    const prims = cl.files.flatMap((rel) => primsOf(cl.texts.get(rel)).map((p) => `${rel}: ${p.trim()}`));
    const names = cl.files.flatMap((rel) => namesOf(cl.texts.get(rel)).map((p) => `${rel}: ${p}`));
    return { files: cl.files, prims, names, bad: cl.bad, ok: prims.length === 1 && names.length === 0 && cl.bad.length === 0 };
  };
  const cc = closureCensus();
  ok(cc.ok && cc.files.includes('src/rule-learning.js') && cc.files.includes('src/decision-model.js') && cc.files.length >= 3, `${REL} + the ${cc.files.length - 1} src-local modules it requires (transitively): EXACTLY 1 request primitive in all (${cc.prims.join('; ')}), the primitive named only where it is bound, every load followed, no network module`, { prims: cc.prims, names: cc.names, bad: cc.bad });
  // CONTROLS — verify r2's own roads, each as a plant: every one RED on the census alone (the wire sweep of
  // test-rule-learning ⑪b catches them by behaviour too)
  const U2 = '    const u = json ? usageOf(json)';
  const n3 = tm.replace(U2, "    if (status === 504) { const r2 = await fetch.call(null, url, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ ...body, provider: undefined }) }); status = r2.status; }\n" + U2);
  const n1 = tm.replace(U2, "    if (status === 504) { const r2 = await require('./text-retry.js').again(url, key, { ...body, provider: undefined }); status = r2.status; }\n" + U2);
  const HELPER = "'use strict';\nmodule.exports.again = (url, key, payload) => fetch(url, { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: JSON.stringify(payload) });\n";
  const alias = tm.replace(U2, "    const send = fetch; if (status === 502) await send(url, { method: 'POST', body: JSON.stringify({ model: body.model }) });\n" + U2);
  const viaRl = (fs.readFileSync(path.join(REPO, 'src/rule-learning.js'), 'utf-8')).replace("const M = require('./decision-model.js');", "const M = require('./decision-model.js');\nconst https = require('https');");
  const dyn = (fs.readFileSync(path.join(REPO, 'src/rule-learning.js'), 'utf-8')).replace("const M = require('./decision-model.js');", "const M = require('./decision-' + 'model.js');");
  const rows = {
    'N3 fetch.call( a non-ZDR retry': closureCensus({ [REL]: n3 }),
    'N1 a helper the client requires': closureCensus({ [REL]: n1, 'src/server/text-retry.js': HELPER }),
    'an alias of the primitive (const send = fetch)': closureCensus({ [REL]: alias }),
    'a network module in a required module (rule-learning.js requires https)': closureCensus({ 'src/rule-learning.js': viaRl }),
    'a computed require in the closure': closureCensus({ 'src/rule-learning.js': dyn }),
  };
  const missed = Object.entries(rows).filter(([n, r]) => r.ok || n3 === tm || n1 === tm || alias === tm || viaRl.length === dyn.length).map(([n]) => n);
  ok(missed.length === 0, `CONTROLS (closure): ${Object.keys(rows).join(' · ')} — each RED`, Object.fromEntries(Object.entries(rows).map(([n, r]) => [n, { prims: r.prims.length, names: r.names, bad: r.bad }])));
  const thawed = tm.replace(BODY_AT, 'const body = ({').replace(ROUTING, "provider: { zdr: true, data_collection: 'deny' }");
  const N2B = "    if (tier.key === 'sonnet') body.provider.data_collection = 'allow';\n", N2C = "    const route = body.provider; if (tier.key === 'sonnet') route.zdr = false;\n";
  const seals = {
    'the freeze taken out (the routing a plain literal again)': thawed,
    'N2b a nested write on the Sonnet tier': tm.replace('    ' + SERIAL, N2B + '    ' + SERIAL),
    'N2c an alias of the routing written': tm.replace('    ' + SERIAL, N2C + '    ' + SERIAL),
    'a spread copy without the routing serialized': tm.replace(SERIAL, 'const bytes = new TextEncoder().encode(JSON.stringify({ ...body, provider: undefined }));'),
    'the serialized body edited on the Sonnet tier': tm.replace(SERIAL, "const bytes = new TextEncoder().encode(tier.key === 'sonnet' ? JSON.stringify(body).replace('\"zdr\":true', '\"zdr\":false') : JSON.stringify(body));"),
    'the bytes edited before they are sent': tm.replace(SERIAL, SERIAL + " if (tier.key === 'sonnet') bytes[6] = 32;"),
    'a string body again (Node re-sends it on a 421)': tm.replace(ONE_SHOT, "body: JSON.stringify(body), duplex: 'half',").replace(SERIAL, '').replace(", 'content-length': String(bytes.length)", ''),
  };
  const unsealed = Object.entries(seals).filter(([, x]) => x === tm || sealed(x)).map(([n]) => n);
  ok(unsealed.length === 0, `CONTROLS (frozen + serialized once): ${Object.keys(seals).join(' · ')} — each RED`, Object.fromEntries(Object.entries(seals).map(([n, x]) => [n, sealOf(x)])));

  // lane learn-card-untick (verify r3 R3-F3 / R3-F4) — (g) THE LITERAL'S SHAPE: its top-level keys are EXACTLY the request's
  // seven (no spread; `provider` once — a second key or a spread inside it overrides the routing on the wire with the
  // routing line still in the text), the client's code writes a `provider:` key ONCE (a branch's own literal is an
  // override too), nothing follows the literal's `})` but `;` (`}) && Object.freeze({…})` re-creates the body after it),
  // and the bytes are measured only as `String(bytes.length)` (a one-reference byte patch in that slot keeps the three
  // names of (e)); (c) the closure census follows the three loader spellings r3 planted GREEN
  const BODY_KEYS = ['model', 'messages', 'temperature', 'max_tokens', 'response_format', 'provider', 'usage'];
  const topKeys = (lit) => {
    const inner = lit.slice(lit.indexOf('{') + 1, lit.lastIndexOf('}')), parts = [];
    let d = 0, q = null, cur = '';
    for (const ch of inner) {
      if (q) { cur += ch; if (ch === q) q = null; continue; }
      if (ch === "'" || ch === '"' || ch === '`') q = ch;
      else if ('([{'.includes(ch)) d++;
      else if (')]}'.includes(ch)) d--;
      if (ch === ',' && d === 0) { parts.push(cur.trim()); cur = ''; } else cur += ch;
    }
    if (cur.trim()) parts.push(cur.trim());
    return parts.map((x) => (x.startsWith('...') ? '...' : (/^([A-Za-z_$][\w$]*)\s*(?::|$)/.exec(x) || [null, `?${x.slice(0, 24)}`])[1]));
  };
  const shapeOf = (text) => {
    const c = code(text), lit = bodyLiteral(text), i = lit ? c.indexOf(lit) : -1;
    return { keys: topKeys(lit), providerKeys: (c.match(/\bprovider\s*:/g) || []).length, closed: i >= 0 && /^\s*\)\s*;/.test(c.slice(i + lit.length)), measured: count(c, 'String(bytes.length)') };
  };
  const shaped = (text) => { const x = shapeOf(text); return JSON.stringify(x.keys) === JSON.stringify(BODY_KEYS) && x.providerKeys === 1 && x.closed && x.measured === 1; };
  ok(shaped(tm), `${REL}: the request literal's keys are exactly ${BODY_KEYS.join(' · ')} (no spread, \`provider\` once in the client), nothing follows it but \`;\`, the bytes measured only as String(bytes.length)`, shapeOf(tm));
  const CLOSE = '      usage: { include: true },\n    });', CL = "String(bytes.length)";
  const LIT_AGAIN = "Object.freeze({ model: tier.id, messages, temperature: 0, max_tokens: outMax, response_format: { type: 'json_schema', json_schema: { name, strict: true, schema } }, usage: { include: true } })";
  const shapes = {
    'B2 a second provider key spread in on the Sonnet tier': tm.replace(CLOSE, "      usage: { include: true },\n      ...(tier.key === 'sonnet' ? { provider: { zdr: true } } : {}),\n    });"),
    'a second provider key, plain': tm.replace(CLOSE, "      usage: { include: true },\n      provider: { zdr: false },\n    });"),
    'B2b a spread of a tier field': tm.replace(CLOSE, '      usage: { include: true },\n      ...(tier.extra || {}),\n    });'),
    'B2c a spread of a setting': tm.replace(CLOSE, '      usage: { include: true },\n      ...(s.learnProvider ? { provider: s.learnProvider } : {}),\n    });'),
    'B1b the body re-created after the literal': tm.replace(CLOSE, `      usage: { include: true },\n    }) && ${LIT_AGAIN};`),
    'B1c …only when a base URL is set': tm.replace(CLOSE, `      usage: { include: true },\n    }) && (baseUrl ? ${LIT_AGAIN} : null);`),
    'a later body.provider = (a write after the freeze)': tm.replace('    ' + SERIAL, "    if (tier.key === 'sonnet') body.provider = { zdr: false };\n    " + SERIAL),
    'B3 a one-reference byte patch where the bytes are measured': tm.replace(CL, "String(((b) => { if (tier.key === 'sonnet') b[b.length - 61] = 120; return b; })(bytes).length)"),
  };
  const unshaped = Object.entries(shapes).filter(([, x]) => x === tm || (shaped(x) && sealed(x) && bodyWrites(x) === 0)).map(([n]) => n);
  ok(unshaped.length === 0, `CONTROLS (the literal's shape — verify r3 R3-F3, GREEN on (a)–(f)): ${Object.keys(shapes).join(' · ')} — each RED`, Object.fromEntries(Object.entries(shapes).map(([n, x]) => [n, { ...shapeOf(x), writes: bodyWrites(x) }])));
  const TM_RL = "const RL = require('../rule-learning.js');";
  const loaders = {
    "process['binding'](…)": "const RAW = () => process['binding']('tcp_wrap');",
    "require('module')._load('https')": "const RAW = () => require('module')._load('https');",
    "require('_http_client')": "const RAW = () => require('_http_client').ClientRequest;",
    "require('node:_tls_wrap')": "const RAW = () => require('node:_tls_wrap');",
  };
  const followed = Object.entries(loaders).filter(([, line]) => !tm.includes(TM_RL) || closureCensus({ [REL]: tm.replace(TM_RL, `${TM_RL}\n${line}`) }).ok).map(([n]) => n);
  ok(followed.length === 0, `CONTROLS (closure — verify r3 R3-F4, GREEN before): ${Object.keys(loaders).join(' · ')} planted in the client — each RED`, Object.fromEntries(Object.entries(loaders).map(([n, line]) => [n, closureCensus({ [REL]: tm.replace(TM_RL, `${TM_RL}\n${line}`) }).bad])));
}
// lane judge-one-shot-body: BOTH vendor callers of the Language model row (the rows marked `oneShot`: the judge's decisions
// request and the text client's chat completions) send a ONE-SHOT body — by TOKEN. Node's fetch re-sends a body that has a
// SOURCE (a string, bytes, a Buffer, a Blob — measured, all four) on an HTTP 421 over a new connection: empty, with every
// header, the key included — a second request no count above ever saw (found by the status sweep, lane rule-learning-fix-r2).
// Per row: the ONE request primitive's call (its argument text, read off the code) carries `body: M.oneShotBody(bytes),
// duplex: 'half',` and NO other body key, the bytes' own `'content-length'` (never chunked) and `redirect: 'error'`; the
// request is frozen where it is built and serialized ONCE into the bytes (named three times: made · measured · sent; `body`
// twice: built · serialized); the row's file builds no stream of its own (ONE implementation — the PURE model's
// oneShotBody); and the helper IS that stream: it hands the bytes over once, and refuses anything but bytes.
{
  const ROWS = Object.entries(ALLOW).filter(([, a]) => a.oneShot).map(([rel]) => rel);
  const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
  const SERIAL = 'const bytes = new TextEncoder().encode(JSON.stringify(body));';
  const ONE_SHOT = "body: M.oneShotBody(bytes), duplex: 'half',";
  const LENGTH = "'content-length': String(bytes.length)";
  const BUILT = /const body = Object\.freeze\(/;
  const count = (hay, needle) => hay.split(needle).length - 1;
  /** the ONE request primitive call of a row's code: `fetch(` … its matching `)` (the default binding is no call) */
  const callOf = (c) => {
    const s = c.split('(...a) => globalThis.fetch(...a)').join(''), i = s.search(/\bfetch\s*\(/);
    if (i < 0) return '';
    for (let k = s.indexOf('(', i), d = 0; k < s.length; k++) { if (s[k] === '(') d++; else if (s[k] === ')' && --d === 0) return s.slice(i, k + 1); }
    return '';
  };
  const oneShotOf = (text) => {
    const c = code(text), call = callOf(c);
    const f = { call: call.length > 0, oneShot: count(call, ONE_SHOT) === 1, oneBody: (call.match(/\bbody\s*:/g) || []).length === 1, length: call.includes(LENGTH), noRedirect: call.includes("redirect: 'error'"),
      frozen: BUILT.test(c), serialOnce: count(c, SERIAL) === 1 && count(c, 'JSON.stringify(body)') === 1,
      bytes3: (c.match(/\bbytes\b/g) || []).length === 3, body2: (c.match(/\bbody\b(?!\s*:)/g) || []).length === 2, noOwnStream: !/\bReadableStream\b/.test(c) };
    return { ...f, ok: Object.values(f).every(Boolean), broken: Object.keys(f).filter((k) => !f[k]) };
  };
  const rowText = Object.fromEntries(ROWS.map((rel) => [rel, fs.readFileSync(path.join(REPO, rel), 'utf-8')]));
  ok(ROWS.length === 2 && ROWS.includes('src/server/decision-engine.js') && ROWS.includes('src/server/text-model-client.js'), `the rows marked oneShot are BOTH vendor callers of the Language model row (${ROWS.join(', ')})`);
  for (const rel of ROWS) ok(oneShotOf(rowText[rel]).ok, `${rel}: its ONE request carries \`${ONE_SHOT}\` (no other body), its length and redirect: 'error'; the body frozen, serialized ONCE (bytes ×3, body ×2), no stream of its own`, oneShotOf(rowText[rel]));
  // the helper: ONE implementation in the PURE model, and it IS a one-shot stream of the bytes (a behaviour read)
  const DM_REL = 'src/decision-model.js', dmCode = code(fs.readFileSync(path.join(REPO, DM_REL), 'utf-8'));
  const STREAM = 'return new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } });';
  const streams = files.map((f) => path.relative(REPO, f)).filter((rel) => { try { return /\bnew\s+ReadableStream\b/.test(code(fs.readFileSync(path.join(REPO, rel), 'utf-8'))); } catch { return false; } });
  const DMod = require(path.join(REPO, DM_REL));
  const probe = new TextEncoder().encode('{"q":1}');
  const st = DMod.oneShotBody(probe), rd = st instanceof ReadableStream ? st.getReader() : null, r1 = rd ? await rd.read() : {}, r2 = rd ? await rd.read() : {};   // no stream ⇒ RED by name, never a crash
  let refused = false; try { DMod.oneShotBody('{"q":1}'); } catch (e) { refused = e instanceof TypeError; }
  ok(count(dmCode, STREAM) === 1 && /function oneShotBody\(bytes\) \{/.test(dmCode) && streams.join() === DM_REL && st instanceof ReadableStream && r1.value === probe && r2.done === true && refused,
    `the ONE implementation: ${DM_REL}'s oneShotBody (the only server-tier file that builds a request stream: ${streams.join(', ')}) — a stream that hands the bytes over ONCE (then done), and a string is refused (TypeError: nothing is sent)`, { streams, once: r1.value === probe, done: r2.done, refused });
  // CONTROLS — each shape planted in EACH row is RED (the matrix): the four bodies with a source Node re-sends on a 421, a
  // stream of the row's own, the length dropped (chunked), redirects followed, a second body key after the one-shot one
  const PLANTS = {
    'a string body': [ONE_SHOT, "body: JSON.stringify(body), duplex: 'half',"],
    'the bytes as the body': [ONE_SHOT, "body: bytes, duplex: 'half',"],
    'a Buffer': [ONE_SHOT, "body: Buffer.from(bytes), duplex: 'half',"],
    'a Blob': [ONE_SHOT, "body: new Blob([bytes]), duplex: 'half',"],
    'a stream of its own': [ONE_SHOT, "body: new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }), duplex: 'half',"],
    'the length dropped': [', ' + LENGTH, ''],
    'redirects followed': [", redirect: 'error' });", ' });'],
    'a second body key': [", redirect: 'error' });", ", redirect: 'error', body: JSON.stringify(body) });"],
  };
  const matrix = {};
  for (const rel of ROWS) for (const [name, [from, to]] of Object.entries(PLANTS)) {
    const t = rowText[rel], m = t.replace(from, to);
    matrix[`${rel.split('/').pop()} · ${name}`] = m === t ? 'ANCHOR MISSING' : oneShotOf(m).ok ? 'GREEN' : `RED (${oneShotOf(m).broken.join(', ')})`;
  }
  const green = Object.entries(matrix).filter(([, v]) => !v.startsWith('RED'));
  console.log(`    one-shot matrix: ${Object.entries(matrix).map(([k, v]) => `${k} ⇒ ${v.split(' ')[0]}`).join(' · ')}`);
  ok(green.length === 0 && Object.keys(matrix).length === ROWS.length * Object.keys(PLANTS).length, `CONTROLS (one-shot, ${Object.keys(matrix).length}): ${Object.keys(PLANTS).join(' · ')} — planted in EACH row, each RED`, green.length ? green : matrix);
}
for (const [rel, a] of Object.entries(ALLOW)) {
  ok(constructions[rel] > 0, `${rel} still holds its allowlisted vendor call (moved/renamed ⇒ update the allowlist)`);
  const text = fs.readFileSync(path.join(REPO, rel), 'utf-8');
  for (const g of a.gates) ok(text.includes(g), `${rel} keeps gate marker '${g}' (§ban-safety gate deleted?)`);
}

// ── 3: the device protocol's vendor surface is EXACTLY the quota-refresh op ──
// (design §Quota refresh origin: "the ONLY device op that may reach the
// vendor API is the human-gated, throttled read-only quota query"). agentd.js
// holds that one op WITH its gates; every other daemon file stays at zero.
{
  const text = fs.readFileSync(path.join(REPO, 'src/agentd/agentd.js'), 'utf-8');
  const hits = (text.match(/api\.anthropic\.com/g) || []).length;
  ok(hits === 1, `src/agentd/agentd.js: exactly ONE vendor host literal (the quota-refresh op; found ${hits})`);
  for (const g of ["humanGated !== true", '_quotaAt', 'never refreshes']) {
    ok(text.includes(g), `agentd quota-refresh keeps gate marker '${g}'`);
  }
  ok(!/oauth\/token|platform\.claude\.com/.test(text), 'agentd never touches the token-refresh endpoint (read-only peek only)');
}
for (const rel of ['src/agentd/client.js', 'src/agentd/ws-min.js', 'src/agentd/mux.js']) {
  const text = fs.readFileSync(path.join(REPO, rel), 'utf-8');
  ok(!VENDOR.test(text), `${rel}: zero vendor endpoints`);
}
// bundle: carries the same single op (minified) — gate property names survive
for (const b of ['data/bin/vibespace-agentd.js']) {
  try {
    const text = fs.readFileSync(path.join(REPO, b), 'utf-8');
    ok((text.match(/api\.anthropic\.com/g) || []).length <= 2 && text.includes('humanGated'),
      `${b}: bundle vendor surface = the gated quota-refresh op only`);
  } catch { ok(true, `${b} not built here — source asserted above`); }
}
try {
  const att = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-agentd-attach.js'), 'utf-8');
  ok(!/api\.anthropic\.com|oauth\/usage/.test(att), 'attach-cli bundle carries zero vendor endpoints');
} catch { ok(true, 'attach bundle not built here'); }

// ── 4: shipped usage tools are passive by construction ──
// vibespace-usage legitimately requires child_process — it PASSES THROUGH the
// user's own statusline command (by design); the passivity contract for it is
// "no network primitive + no vendor endpoint". The scanner allows neither.
{
  const u = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-usage'), 'utf-8');
  ok(!/require\(['"](https?|net|tls|dgram)['"]\)/.test(u) && !/\bfetch\s*\(/.test(u) && !VENDOR.test(u),
    'data/bin/vibespace-usage: no network primitive, no vendor endpoint (statusline passthrough via child_process is the one sanctioned spawn)');
  const sc = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-usage-scan'), 'utf-8');
  ok(!/require\(['"](https?|net|tls|dgram|child_process)['"]\)/.test(sc) && !/\bfetch\s*\(/.test(sc),
    'data/bin/vibespace-usage-scan: imports no network primitive at all (purely passive)');
}

// ── 5: the CLI-native quota channel stays write-to-STDIN (first-party call) ──
const adapter = fs.readFileSync(path.join(REPO, 'src/adapters/claude-code.js'), 'utf-8');
ok(/get_usage/.test(adapter) && !VENDOR.test(adapter), 'claude-code adapter: get_usage rides the CLI control channel, never a direct vendor call');

// ── 5b: THE /usage PANEL PROBE MAKES ITS ONE VENDOR CALL AND NO OTHER (B-9b40) ──
// claude 2.1.288 print mode loads the account's claude.ai connectors unless the MCP config is strict
// (`headlessSyncsClaudeAiConnectors: !strictConfig && …`): before this every auto-cli probe listed them
// and opened the mcp-proxy for each (production: five mcp-logs-claude-ai-* dirs per member, one file per probe).
{
  const { PANEL_PROBE_ARGS } = require(path.join(REPO, 'src/usage-routes.js'));
  ok(Array.isArray(PANEL_PROBE_ARGS) && PANEL_PROBE_ARGS.includes('--strict-mcp-config') && !PANEL_PROBE_ARGS.some((a) => /^--mcp-config/.test(a)),
    'B-9b40: the auto-cli /usage probe loads NO MCP server (--strict-mcp-config, no --mcp-config)', JSON.stringify(PANEL_PROBE_ARGS));
  ok(Array.isArray(PANEL_PROBE_ARGS) && PANEL_PROBE_ARGS[0] === '-p' && PANEL_PROBE_ARGS[1] === '/usage' && PANEL_PROBE_ARGS.length === 3, 'B-9b40: …and asks for /usage and nothing else');
  const ur = fs.readFileSync(path.join(REPO, 'src/usage-routes.js'), 'utf-8');
  ok((ur.match(/execFile\(bin, \[\.\.\.PANEL_PROBE_ARGS\]/g) || []).length === 1 && !/'-p', '\/usage'/.test(ur.replace(/const PANEL_PROBE_ARGS = [^\n]*/, '')),
    'B-9b40: the probe spawns exactly PANEL_PROBE_ARGS — no second spelling of the argv');
}

// ── 6: LOCAL ORACLES (owner ruling 6 of docs/design-harness-features.md §5.1) ──
// "用（逐条附「不发 vendor 请求」证据进白名单豁免；人触发/已有节拍）", with §4.2's
// hard gate: the zero-network property must be MEASURED per command, never
// inferred from the shape of the CLI. Two halves:
//   (a) STRUCTURAL — every shipped oracle carries a proof whose every measured
//       run is 0 INET connects; every measured-and-REJECTED candidate carries
//       its counts and its verdict and can never appear as a shipped oracle;
//       the runner can only spawn registry argv and holds no vendor endpoint.
//   (b) LIVE — when strace + the CLI are present, RE-MEASURE each shipped
//       oracle here and fail on any AF_INET/AF_INET6 connect. A NEGATIVE
//       CONTROL (a deliberate loopback connect) proves the detector can see
//       one, so a green run is never vacuous.
// The REJECTED candidates are deliberately NOT re-run: they reach
// api.anthropic.com by construction, and a suite that runs on every push is
// exactly the "on a timer" shape §ban-safety forbids. Their numbers are the
// hand-measurement recorded in src/local-oracles.js with tool + date + version.
{
  const { ORACLES, NOT_ORACLES, PROOF_KEYS, oracle, rejected, blockedCapability, blockingRejectionsFor } = require(path.join(REPO, 'src/local-oracles.js'));
  const runner = fs.readFileSync(path.join(REPO, 'src/server/permission-rules.js'), 'utf-8');
  // "IN-PROCESS" is load-bearing (round-2 verifier). This assert reads the
  // file's own text, so it can only ever speak about requests this MODULE
  // constructs — it says nothing about what a child it spawns does, and the
  // first cut of this module spawned `codex app-server`, which connects to
  // chatgpt.com. The companion assert below is the one that covers children.
  ok(!VENDOR.test(runner) && !REQUESTY.test(runner.split('\n').filter((l) => VENDOR.test(l)).join('\n')),
    'src/server/permission-rules.js (the oracle runner + rule reader) constructs NO vendor request IN-PROCESS');
  ok(/spawn\(cmd, o\.argv\.slice\(\)/.test(runner),
    'the oracle runner spawns the REGISTRY\'s frozen argv — a caller cannot supply its own command');
  // …AND that is the ONLY child it starts. A file that may spawn a vendor CLI
  // needs every such spawn to come from the measured registry, because the
  // registry is the thing that cannot accept an entry without a proof. A
  // second `spawn(` here is exactly how a 7-connect app-server child shipped
  // under a menu advertising "no network requests (measured)".
  {
    // count CODE spawns only: the comments above the runner quote the call on
    // purpose (they explain why it is the only one), and a census that counts
    // its own documentation is a census that gets silenced by rewording it.
    const code = runner.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    const spawns = (code.match(/\bspawn\s*\(/g) || []).length;
    ok(spawns === 1, `src/server/permission-rules.js starts exactly ONE kind of child — the registry oracle (found ${spawns} spawn call(s) in code; a new one must go through src/local-oracles.js, which needs a measurement)`);
    // the counter must be able to SEE a second one, or the 1 above is luck
    ok(((code + '\n  const x = spawn(other, []);').match(/\bspawn\s*\(/g) || []).length === 2,
      'NEGATIVE CONTROL: the spawn census counts a second call when one is present (so "exactly one" is a measurement)');
    ok(!/'app-server'/.test(runner) && !/"app-server"/.test(runner),
      'src/server/permission-rules.js starts no `codex app-server` child: measured 2026-09-07 at 7 INET connects incl. chatgpt.com:443 with an EMPTY CODEX_HOME, so the codex INSTANCE scope is not offered at all');
  }
  // A rejection that claims to explain a missing capability must actually
  // match a caps row that is OFF. Otherwise the note is decoration and the
  // connecting path is live again — the exact regression this round fixes.
  {
    const { capsOf } = require(path.join(REPO, 'src/backend-caps.js'));
    const dig = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
    const blocking = NOT_ORACLES.filter((r) => r.blocks);
    ok(blocking.length > 0, `at least one rejection explains a switched-off capability (${blocking.map((r) => r.blocks).join(', ') || 'none'})`);
    for (const r of blocking) {
      const [backend, ...rest] = r.blocks.split('.');
      const capPath = rest.join('.');
      const live = dig(capsOf(backend), capPath);
      ok(live === false, `${r.id}: the capability it blocks (${r.blocks}) is really OFF — re-enabling it needs a NEW measurement, not just a caps edit (found ${JSON.stringify(live)})`);
      ok(blockedCapability(backend, capPath) === r, `${r.id}: is reachable through blockedCapability('${backend}', '${capPath}') — the server's refusal and the menu's note read the SAME record`);
      ok(blockingRejectionsFor(backend).includes(r), `${r.id}: appears in blockingRejectionsFor('${backend}') so the menu shows it EVEN THOUGH ${backend} has shipped oracles (a missing button must be explained)`);
    }
    // the client mirror must agree, or the chrome offers a door the server refuses
    const meta = fs.readFileSync(path.join(REPO, 'src/lib/agent-meta.js'), 'utf-8');
    ok(/permissionRules: \{ source: 'config-read', session: true, instance: false, liveVerb: true \}/.test(meta),
      'src/lib/agent-meta.js mirrors codex permissionRules.instance:false (a client that still offered the row would fetch a refusal)');
  }
  ok(!/setInterval|setTimeout\([^)]*runOracle/.test(runner) && /app\.post\('\/api\/local-oracle/.test(runner),
    'an oracle runs ONLY on a POST (a button): nothing schedules one, and the route is not a pre-fetchable GET');
  ok(ORACLES.length > 0, `at least one measured-clean oracle ships (${ORACLES.map((o) => o.id).join(', ') || 'none'})`);
  const rejectedIds = new Set(NOT_ORACLES.map((o) => o.id));
  for (const o of ORACLES) {
    ok(PROOF_KEYS.every((k) => o.proof && o.proof[k] != null) && Array.isArray(o.proof.runs) && o.proof.runs.length > 0,
      `oracle ${o.id}: carries a proof (tool + date + CLI version + at least one measured run)`);
    ok(o.proof.runs.every((r) => r.inetConnects === 0),
      `oracle ${o.id}: EVERY recorded run measured ZERO INET connects (${o.proof.runs.map((r) => `${r.what}=${r.inetConnects}`).join('; ')})`);
    ok(!rejectedIds.has(o.id), `oracle ${o.id}: is not also on the rejected list`);
    // program-use billing law: an oracle is a READ, never an inference channel
    ok(!o.argv.some((a) => /^(-p|--print|exec|--json-schema|--output-schema|-o)$/.test(a)),
      `oracle ${o.id}: argv carries no print/exec/inference flag (${o.argv.join(' ')})`);
  }
  for (const r of NOT_ORACLES) {
    ok(r.measured && r.measured.inetConnects > 0 && typeof r.verdict === 'string' && r.verdict.length > 20,
      `rejected candidate ${r.id}: keeps its measurement (${r.measured?.inetConnects} INET connects) and the reason it is not offered`);
    ok(!oracle(r.id) && !!rejected(r.id), `rejected candidate ${r.id}: cannot be looked up as a shipped oracle`);
  }
  ok(NOT_ORACLES.some((r) => r.id === 'claude-auth-status') && NOT_ORACLES.some((r) => r.id === 'claude-agents-list') && NOT_ORACLES.some((r) => r.id === 'codex-doctor'),
    'the three candidates the design proposed (claude auth status / claude agents / codex doctor) are all recorded as MEASURED AND REJECTED — the negative control that keeps them out');
  ok(!ORACLES.some((o) => o.backend === 'claude'),
    'no claude oracle ships: every measured claude subcommand reached api.anthropic.com, including with every traffic-suppressing env set');
  // THE OTHER app-server SPAWN IN THE REPO (round-2 verifier, same root cause).
  // src/codex-thread-read.js is shipped B-21e4 code whose behaviour this round
  // deliberately does NOT change — but it carried the same unmeasured "no
  // network of ours" claim, and a false comment is how the next reader ships
  // the same mistake. The measurement now lives in it; this assert keeps it
  // there. (An UNMEASURED reassurance is worse than none: it is the sentence
  // someone will cite as the precedent.)
  {
    const ctr = fs.readFileSync(path.join(REPO, 'src/codex-thread-read.js'), 'utf-8');
    ok(!/no\s+network\s+of\s+ours/.test(ctr),
      'src/codex-thread-read.js no longer claims its `codex app-server` child makes no network calls (measured: it connects to chatgpt.com even logged out)');
    ok(/strace/.test(ctr) && /chatgpt\.com/.test(ctr) && /B-af31/.test(ctr),
      'src/codex-thread-read.js records the measurement + the tool + the backlog id that owns the §ban-safety decision, instead of a reassurance nobody checked');
  }

  // ── (b) the live re-measurement ──
  const has = (bin) => { try { execFileSync('sh', ['-c', `command -v ${bin}`], { stdio: 'pipe' }); return true; } catch { return false; } };
  const cmdPath = (bin) => { try { return execFileSync('sh', ['-c', `command -v ${bin}`], { encoding: 'utf-8' }).trim(); } catch { return ''; } };
  const straceOk = has('strace');
  if (!straceOk) {
    ok(true, 'SKIP live re-measurement: strace is not on PATH (`command -v strace` found nothing) — the recorded proofs above stand alone');
  } else {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-oracle-'));
    const ENVBASE = { HOME: tmp, PATH: process.env.PATH || '/usr/bin:/bin', TERM: 'dumb' };
    /** Run one command under strace and count INET connects. AF_UNIX and
     *  AF_NETLINK are NOT network (every process does those). */
    const inetConnects = (bin, argv, timeoutMs = 60000) => {
      const out = path.join(tmp, 'trace-' + Math.random().toString(36).slice(2));
      let timedOut = false;
      try {
        execFileSync('strace', ['-f', '-qq', '-e', 'trace=network', '-o', out, bin, ...argv],
          { env: ENVBASE, stdio: 'ignore', timeout: timeoutMs });
      } catch (e) {
        // a non-zero exit is fine: the TRACE is the measurement — but only a
        // trace of a command that EXITED (B-5f0b): a timeout kill is partial
        if (e && (e.code === 'ETIMEDOUT' || (e.signal && e.status === null))) timedOut = true;
      }
      if (timedOut) { try { fs.unlinkSync(out); } catch { } return { timedOut: true, timeoutMs }; }
      let text = ''; try { text = fs.readFileSync(out, 'utf-8'); } catch { return null; }
      const lines = text.split('\n').filter((l) => /\bconnect\(/.test(l) && /AF_INET6?/.test(l));
      return { n: lines.length, sample: lines.slice(0, 2).join(' | ') };
    };
    // NEGATIVE CONTROL FIRST: a deliberate LOOPBACK connect must be seen, or a
    // green measurement below means nothing. Loopback, never a vendor — the
    // rejected candidates stay un-run precisely because re-running them WOULD
    // be the call this law forbids.
    const ctl = inetConnects(process.execPath, ['-e', "const s=require('net').connect(1,'127.0.0.1');s.on('error',()=>process.exit(0));setTimeout(()=>process.exit(0),300)"]);
    ok(ctl && ctl.n >= 1, `NEGATIVE CONTROL: the detector sees a deliberate loopback connect (${ctl?.n} INET connect lines) — a zero below is a measurement, not a blind spot`);
    // THE TERMINAL SIGNAL (B-5f0b): a trace is a measurement only once the
    // traced command EXITED. A run the 60 s timeout killed on a loaded box
    // holds whatever had been traced by then, and its "zero" is vacuous.
    // Driven deterministically: a loopback connect AFTER a 1.5 s wait, under a
    // 400 ms budget — the trace ends before the connect ever happens.
    const cut = inetConnects(process.execPath, ['-e', "setTimeout(()=>{const s=require('net').connect(1,'127.0.0.1');s.on('error',()=>process.exit(0))},1500)"], 400);
    ok(cut && cut.timedOut === true, `TERMINAL SIGNAL: a trace the timeout cut short is reported as timedOut, never as a zero-connect measurement (${JSON.stringify(cut)})`);
    for (const o of ORACLES) {
      const bin = cmdPath(o.backend === 'codex' ? 'codex' : o.backend);
      if (!bin) { ok(true, `SKIP live re-measurement of ${o.id}: ${o.backend} is not installed here (\`command -v ${o.backend}\` found nothing)`); continue; }
      const got = inetConnects(bin, o.argv.slice());
      if (got?.timedOut) { ok(true, `SKIP live re-measurement of ${o.id}: ${o.backend} ${o.argv.join(' ')} did not exit within ${got.timeoutMs} ms on this machine — a trace cut short is not a zero (B-5f0b)`); continue; }
      ok(got && got.n === 0, `LIVE: ${o.id} (${o.backend} ${o.argv.join(' ')}) opened ZERO INET connections under strace${got && got.n ? ' — got ' + got.n + ': ' + got.sample : ''}`);
    }
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { }
  }
}

// ── 7: A CHANNEL PICTURE'S BYTES (R3, 2026-09-26 — docs/design-communication-panel.zh.md §23) ──
// The owner: "lark图像不能预览吗？". Showing a Lark / Gmail picture needs ONE more vendor request per
// picture (Lark `messages/:id/resources/:key`, Gmail `attachments.get`) — the only vendor call a WINDOW
// can cause. It is allowlisted HERE deliberately, with its three gates, and the census below is a
// FUNCTION of the source text so an UNGATED copy (scripts/mutant-copy.mjs, never src/) turns it red:
//   ON-DEMAND      the ONLY caller of any adapter's `fetchAttachment` is the engine's `attachment()`,
//                  and the only caller of THAT is the GET attachment route (a thumbnail the window
//                  rendered, a person's click) — ingest, timers and agent routes never fetch bytes;
//   CACHE-FIRST    `attachment()` asks the cache (`store.attachmentGet`) and the PURE verdict first, and
//                  the verdict serves a cached file whatever the budget / back-off / account say;
//   BUDGET-CHARGED the fetch runs only on the verdict's `fetch` — after the back-off and `affordable()` —
//                  through `vendor(rec, e, …)`, where the adapter's meter charges the account's minute.
{
  const { mutantCopies, copiesCensus } = await import('./mutant-copy.mjs');
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/([^:'"\\])\/\/[^'"\n]*$/gm, '$1');
  /** THE CENSUS: rows [name, pass, detail] over the engine's + the routes' + every server file's text.
   *  lane channel-attach-read (B-d6b9, design 005 §4): the AGENT's route is the second caller, admitted ONLY behind its
   *  two conditions — the read route's REACH asked first inside attachment() (before the cache: a cached picture of a
   *  conversation the agent may not read is no picture), and the AGENTS' SHARE asked between the verdict's `fetch` and
   *  the one vendor call; the agent route calls it `by: 'agent'` with the caller's principal, never as the owner. */
  const attachmentCensus = (engineSrc, routesSrc, serverTexts) => {
    const rows = [];
    const E = strip(engineSrc);
    const at = E.indexOf('async function attachment(');
    const end = at < 0 ? -1 : E.indexOf('\n  }\n', at);
    const body = at < 0 || end < 0 ? '' : E.slice(at, end);
    const pos = (needle, from = 0) => body.indexOf(needle, from);
    const cache = pos('store.attachmentGet('), v1 = pos('Att.fetchVerdict('), owner = pos('ownerRecordOf('), v2 = v1 < 0 ? -1 : pos('Att.fetchVerdict(', v1 + 1), gate = pos("case 'fetch': break;"), call = pos('.fetchAttachment(');
    rows.push(['the engine\'s attachment() exists and fetches through ONE adapter call', !!body && call > 0 && body.split('.fetchAttachment(').length === 2, `body ${body.length} chars, calls ${body.split('.fetchAttachment(').length - 1}`]);
    rows.push(['CACHE-FIRST: the cache is asked, then the verdict, BEFORE the owner lookup and long before the fetch', cache > 0 && v1 > cache && owner > v1 && call > owner && /Att\.fetchVerdict\(\{ cached: !!hit/.test(body), JSON.stringify({ cache, v1, owner, call })]);
    const facts = v2 > 0 ? body.slice(v2, body.indexOf('});', v2)) : '';
    rows.push(['BUDGET-CHARGED: the fetch verdict is asked the back-off AND the minute\'s budget (`affordable(rec, e)`) and a join', /backoff: inBackoff\(e\)/.test(facts) && /affordable: affordable\(rec, e\)/.test(facts) && /inflight: attInflight\.has\(k\)/.test(facts), facts.slice(0, 240)]);
    rows.push(['…and the fetch runs only on the verdict\'s `fetch` (every other act returns first), charged through vendor(rec, e, …)', gate > v2 && call > gate && /return budgetRefusal\(rec, e\);\s*\n\s*\}/.test(body.slice(v2, call)) && /vendor\(rec, e, \(\) => e\.adapter\.fetchAttachment\(/.test(body), JSON.stringify({ v2, gate, call })]);
    const callers = [];
    for (const [rel, text] of Object.entries(serverTexts)) {
      const code = strip(text);
      const n = (code.match(/\.fetchAttachment\(/g) || []).length;
      if (n) callers.push(`${rel}:${n}`);
    }
    rows.push(['ON-DEMAND: `.fetchAttachment(` is CALLED from exactly one place in the server tree (the engine\'s attachment())', callers.length === 1 && callers[0] === 'src/server/channels-engine.js:1', callers.join(', ')]);
    const R = strip(routesSrc);
    const routeAt = R.indexOf("router.get('/api/channels/:adapterId/:convId/attachment/:id'");
    const routeBody = routeAt < 0 ? '' : R.slice(routeAt, R.indexOf('\n});', routeAt));
    // r-verify (2026-09-26): EVERY `.attachment(` in the server tree counts, whatever its receiver is called
    // (a receiver-name list let a wiring file's `engine.attachment(` through), and inside the engine a bare
    // `attachment(` occurs ONCE — its definition: an ingest that queued `attachment(rec.id, convId, id)` per
    // fresh picture on the next tick was GREEN on the receiver list and on a synchronous runtime count
    const engineCallers = Object.entries(serverTexts).flatMap(([rel, text]) => ((strip(text).match(/\.attachment\(/g) || []).map(() => rel)));
    rows.push(['ON-DEMAND: the engine\'s attachment() is called ONLY by the owner\'s GET attachment route and the agent\'s (every `.attachment(` in the server tree)', /engine\(\)\.attachment\(/.test(routeBody) && engineCallers.slice().sort().join() === 'src/agent-routes.js,src/routes/channels.js', engineCallers.join(', ')]);
    const AR = strip(serverTexts['src/agent-routes.js'] || '');
    const arAt = AR.indexOf("app.get('/api/agent/channels/attachment'");
    const arBody = arAt < 0 ? '' : AR.slice(arAt, AR.indexOf('\n});', arAt));
    rows.push(['AGENT DOOR: the agent\'s route asks it `by: \'agent\'` with the calling session\'s principal (a session token — agentSession — never as the owner)', /const hit = agentSession\(req, res\);/.test(arBody) && /eng\.attachment\(key\.adapterId, key\.convId, att, \{ msg, by: 'agent', principal: channelPrincipal\(s, id\) \}\)/.test(arBody) && (arBody.match(/\.attachment\(/g) || []).length === 1, arBody.slice(0, 200)]);
    const reach = pos("if (agent && !(ctx && ctx.kind === 'agent' && stillSees(ctx, adapterId, convId))) return ACL.notFound();");
    rows.push(['AGENT REACH FIRST: an agent\'s call asks the read route\'s reach (stillSees — the uniform not-found) BEFORE the cache is asked', /const agent = by === 'agent';/.test(body) && reach > 0 && cache > reach, JSON.stringify({ reach, cache })]);
    const share = pos('if (agent) { const sh = agentShareRefusal(rec, e); if (sh) return sh; }');
    rows.push(['AGENT SHARE: an agent\'s fetch asks the agents\' share (agentShareRefusal) after the verdict\'s `fetch` and before the one vendor call, and its charge is the agents\'', share > gate && gate > 0 && call > share && /spendAs\(agent \? 'agent' : 'owner', /.test(body.slice(share, call)), JSON.stringify({ gate, share, call })]);
    const bare = E.match(/(?<![.\w$])attachment\(/g) || [];
    rows.push(['ON-DEMAND: inside the engine `attachment(` is never INVOKED — its definition is the only bare occurrence (no ingest / timer / view prefetches a picture through it)', bare.length === 1 && /async function attachment\(/.test(E), `bare occurrences: ${bare.length}`]);
    return rows;
  };
  const serverTexts = {};
  for (const f of files) { const rel = path.relative(REPO, f); try { serverTexts[rel] = fs.readFileSync(f, 'utf-8'); } catch { } }
  const engineRel = 'src/server/channels-engine.js', routesRel = 'src/routes/channels.js';
  const engineSrc = serverTexts[engineRel], routesSrc = serverTexts[routesRel];
  for (const [name, pass, detail] of attachmentCensus(engineSrc, routesSrc, serverTexts)) ok(pass, `§7 ${name}`, detail);
  // the PURE verdict's table — the gate's own semantics, run (not read)
  const AttSrc = fs.readFileSync(path.join(REPO, 'src/channel-attachments.js'), 'utf-8');
  const verdictTable = (A) => {
    const full = { cached: false, remembered: null, owner: true, fetchable: true, enabled: true, inflight: false, backoff: false, affordable: true };
    return [
      ['a cached file is served even with the budget spent, the vendor backing off and the account disabled', A.fetchVerdict({ ...full, cached: true, affordable: false, backoff: true, enabled: false }).act === 'serve'],
      ['a spent budget is refused `vendor-budget` — never a fetch', A.fetchVerdict({ ...full, affordable: false }).act === 'refuse' && A.fetchVerdict({ ...full, affordable: false }).code === 'vendor-budget'],
      ['the vendor\'s back-off is refused `backoff` — never a fetch', A.fetchVerdict({ ...full, backoff: true }).code === 'backoff'],
      ['a remembered vendor refusal answers with no fetch (the person\'s Retry skips it)', A.fetchVerdict({ ...full, remembered: { code: 'forbidden' } }).act === 'refuse' && A.fetchVerdict({ ...full, remembered: { code: 'forbidden' }, retry: true }).act === 'fetch'],
      ['nothing is fetched before the log named the attachment (`lookup`), nor for an id no record carries', A.fetchVerdict({ cached: false }).act === 'lookup' && A.fetchVerdict({ ...full, owner: false }).code === 'not-found'],
      ['a fetch in flight is JOINED (one charge), a metadata-only adapter is refused', A.fetchVerdict({ ...full, inflight: true }).act === 'join' && A.fetchVerdict({ ...full, fetchable: false }).code === 'not-supported'],
      ['only every gate open answers `fetch`', A.fetchVerdict(full).act === 'fetch'],
    ];
  };
  for (const [name, pass] of verdictTable(require(path.join(REPO, 'src/channel-attachments.js')))) ok(pass, `§7 verdict: ${name}`);
  // lane channel-threads (spec §6.1): a CUSTOM EMOJI's picture is the second picture a window can cause a vendor to
  // serve — the same three gates, read off the engine's `emojiImage()`: ON-DEMAND (`.emojiImage(` called from exactly
  // that function; the engine's function called only by the GET emoji route), CACHE-FIRST (the account's picture
  // cache before anything else), BUDGET-CHARGED (the back-off and the minute's budget before the one metered call)
  const emojiCensus = (engineSrc2, routesSrc2, texts) => {
    const rows = [];
    const E = strip(engineSrc2);
    const at = E.indexOf('async function emojiImage(');
    const end = at < 0 ? -1 : E.indexOf('\n  }\n', at);
    const body = at < 0 || end < 0 ? '' : E.slice(at, end);
    // verify r2 (MONEY): the emoji route follows the attachment's ONE order (PURE Att.fetchVerdict) — the cache, the
    // REMEMBERED refusal, then the verdict asked the back-off (the account's and a picture rate limit) and the budget,
    // the fetch only on its `fetch`
    const cache = body.indexOf('store.attachmentGet('), v1 = body.indexOf('Att.fetchVerdict({ cached: !!hit, remembered })'), v2 = v1 < 0 ? -1 : body.indexOf('Att.fetchVerdict(', v1 + 1), gate = body.indexOf("case 'fetch': break;"), call = body.indexOf('vendor(rec, e, () => e.adapter.emojiImage(');
    const facts = v2 > 0 ? body.slice(v2, body.indexOf('});', v2)) : '';
    rows.push(['EMOJI CACHE-FIRST + BUDGET-CHARGED: emojiImage() asks the cache and the remembered refusal, then ONE verdict with the back-off and the budget, then ONE metered call on its `fetch`', !!body && cache > 0 && v1 > cache && v2 > v1 && gate > v2 && call > gate && /backoff: inBackoff\(e\)/.test(facts) && /affordable: affordable\(rec, e\)/.test(facts) && /inflight: emojiFlights\.has\(fk\)/.test(facts) && /return budgetRefusal\(rec, e\);\s*\n\s*\}/.test(body.slice(v2, call)) && body.split('.emojiImage(').length === 2, JSON.stringify({ cache, v1, v2, gate, call })]);
    const callers = [];
    for (const [rel, text] of Object.entries(texts)) { const n = (strip(text).match(/\.emojiImage\(/g) || []).length; if (n) callers.push(`${rel}:${n}`); }
    const R = strip(routesSrc2);
    const rAt = R.indexOf("router.get('/api/channels/:adapterId/emoji/:key'");
    const rBody = rAt < 0 ? '' : R.slice(rAt, R.indexOf('\n});', rAt));
    rows.push(['EMOJI ON-DEMAND: `.emojiImage(` is called by the engine once (its vendor call) and by the GET emoji route once — nowhere else in the server tree', callers.sort().join() === 'src/routes/channels.js:1,src/server/channels-engine.js:1' && /engine\(\)\.emojiImage\(/.test(rBody), callers.join(', ')]);
    return rows;
  };
  for (const [name, pass, detail] of emojiCensus(engineSrc, routesSrc, serverTexts)) ok(pass, `§7 ${name}`, detail);
  {
    const from = 'inflight: emojiFlights.has(fk), backoff: inBackoff(e) || (Number(e.attBackoffUntil) || 0) > t, affordable: affordable(rec, e) });';
    ok(engineSrc.split(from).length === 2, '§7 CONTROL emoji: the budget fact of emojiImage()\'s verdict is spelled once');
    const mut = engineSrc.replace(from, 'inflight: emojiFlights.has(fk), backoff: inBackoff(e) || (Number(e.attBackoffUntil) || 0) > t });');
    const r = emojiCensus(mut, routesSrc, { ...serverTexts, [engineRel]: mut }).filter(([, p]) => !p).map(([n]) => n);
    ok(r.some((n) => /EMOJI CACHE-FIRST \+ BUDGET-CHARGED/.test(n)), `§7 CONTROL: an emojiImage() that skips the budget is RED (${r.join(' | ')})`);
  }
  // §7b lane channel-avatars (B-5fe1, 2026-10-04): A PERSON'S PICTURE — allowlisted HERE deliberately: Lark
  // `contact/v3/users/:id` + the picture host's bytes, Slack `users.info` + avatars.slack-edge.com. ON-DEMAND (the
  // adapters' `avatarImage` called once by the engine, the engine's once by the GET avatar route), MEMO-FIRST (the
  // account's on-disk memo + its remembered refusal before anything), OURS ONLY + BUDGET-CHARGED (the author named by a
  // record of the account, the back-off and the budget, then ONE call through vendor(rec, e, …) — paced inside the adapter).
  const avatarCensus = (engineSrc3, routesSrc3, texts) => {
    const E = strip(engineSrc3);
    const at = E.indexOf('async function avatarImage(');
    const body = at < 0 ? '' : E.slice(at, E.indexOf('\n  }\n', at));
    const p = (x) => body.indexOf(x);
    const callers = [];
    for (const [rel, text] of Object.entries(texts)) { const n = (strip(text).match(/\.avatarImage\(/g) || []).length; if (n) callers.push(`${rel}:${n}`); }
    const R = strip(routesSrc3);
    const rAt = R.indexOf("router.get('/api/channels/avatar'");
    const rBody = rAt < 0 ? '' : R.slice(rAt, R.indexOf('\n});', rAt));
    return [
      ['AVATAR MEMO-FIRST + OURS ONLY + BUDGET-CHARGED: avatarImage() asks the memo and its refusal, then ONE verdict with the owner, the back-off and the budget, then ONE metered call on its `fetch`', !!body && p('store.avatarGet(') > 0 && p('Att.fetchVerdict({ cached: f.cached') > p('store.avatarGet(') && p('owner: authorIsOurs(') > p('Att.fetchVerdict({ cached: f.cached') && p('affordable: affordable(rec, e)') > p('owner: authorIsOurs(') && p("case 'fetch': break;") > p('affordable: affordable(rec, e)') && p('vendor(rec, e, () => e.adapter.avatarImage(') > p("case 'fetch': break;")],
      ['AVATAR ON-DEMAND: `.avatarImage(` is called by the engine once (its vendor call) and by the GET avatar route once — nowhere else in the server tree', callers.sort().join() === 'src/routes/channels.js:1,src/server/channels-engine.js:1' && /engine\(\)\.avatarImage\(/.test(rBody), callers.join(', ')],
    ];
  };
  for (const [name, pass, detail] of avatarCensus(engineSrc, routesSrc, serverTexts)) ok(pass, `§7b ${name}`, detail);
  {
    const from = 'backoff: inBackoff(e) || (Number(e.attBackoffUntil) || 0) > t, affordable: affordable(rec, e) });\n    switch (v.act) {\n      case \'join\': return avatarFlights';
    ok(engineSrc.split(from).length === 2, '§7b CONTROL avatar: the budget fact of avatarImage()\'s verdict is spelled once');
    const mut = engineSrc.replace(from, from.replace(', affordable: affordable(rec, e)', ''));
    const r = avatarCensus(mut, routesSrc, { ...serverTexts, [engineRel]: mut }).filter(([, q]) => !q).map(([n]) => n);
    ok(r.some((n) => /AVATAR MEMO-FIRST/.test(n)), `§7b CONTROL: an avatarImage() that skips the budget is RED (${r.join(' | ')})`);
    const wf2 = 'src/server/channels-wiring.js';
    const sweep = serverTexts[wf2] + '\nfunction sweepFaces(engine, rows) { for (const r of rows) engine.avatarImage(r.adapterId, r.author).catch(() => {}); }\n';
    const r2 = avatarCensus(engineSrc, routesSrc, { ...serverTexts, [wf2]: sweep }).filter(([, q]) => !q).map(([n]) => n);
    ok(r2.some((n) => /AVATAR ON-DEMAND/.test(n)), `§7b CONTROL: a wiring-file copy that sweeps every author's picture is RED (${r2.join(' | ')})`);
  }
  // THE CONTROLS: ungated copies, written by scripts/mutant-copy.mjs into this run's scratch dir
  const MUT = mutantCopies('vendor-whitelist-att', REPO);
  const reds = (rows) => rows.filter(([, p]) => !p).map(([n]) => n);
  const mutEngine = (label, from, to) => {
    ok(engineSrc.includes(from), `§7 CONTROL ${label}: the edit's anchor is in the engine`);
    const f = MUT.write(engineRel, engineSrc.replace(from, to), label);
    return reds(attachmentCensus(fs.readFileSync(f, 'utf-8'), routesSrc, { ...serverTexts, [engineRel]: fs.readFileSync(f, 'utf-8') }));
  };
  const noBudget = mutEngine('no-budget', 'affordable: affordable(rec, e),', '');
  ok(noBudget.length >= 1 && noBudget.some((n) => /BUDGET-CHARGED/.test(n)), `§7 CONTROL: a copy that drops the budget fact is RED (${noBudget.join(' | ')})`);
  // lane channel-attach-read: the agent caller's two conditions, each removed in a copy — and a route that asks as the owner
  const noReach = mutEngine('agent-no-reach', "if (agent && !(ctx && ctx.kind === 'agent' && stillSees(ctx, adapterId, convId))) return ACL.notFound();", '');
  ok(noReach.some((n) => /AGENT REACH FIRST/.test(n)), `§7 CONTROL: a copy whose agent call skips the reach check is RED (${noReach.join(' | ')})`);
  const noShare = mutEngine('agent-no-share', 'if (agent) { const sh = agentShareRefusal(rec, e); if (sh) return sh; }', '');
  ok(noShare.some((n) => /AGENT SHARE/.test(n)), `§7 CONTROL: a copy whose agent fetch skips the agents' share is RED (${noShare.join(' | ')})`);
  {
    const arRel = 'src/agent-routes.js', from = "{ msg, by: 'agent', principal: channelPrincipal(s, id) }";
    ok(serverTexts[arRel].split(from).length === 2, '§7 CONTROL agent-as-owner: the anchor is spelled once in the agent route');
    const af = MUT.write(arRel, serverTexts[arRel].replace(from, '{ msg }'), 'agent-as-owner');
    const asOwner = reds(attachmentCensus(engineSrc, routesSrc, { ...serverTexts, [arRel]: fs.readFileSync(af, 'utf-8') }));
    ok(asOwner.some((n) => /AGENT DOOR/.test(n)), `§7 CONTROL: an agent route that asks as the OWNER (no by / principal) is RED (${asOwner.join(' | ')})`);
  }
  const noCache = mutEngine('no-cache', 'const legacy = () => {\n      const o = store.attachmentGet(adapterId, convId, attId);\n      if (!o || (o.meta && o.meta.msg)) return null;\n      const carriers = store.readTail(adapterId, convId, { limit: 5000 }).filter((r) => r && Array.isArray(r.attachments) && r.attachments.some((a) => a && String(a.id) === String(attId)));\n      return carriers.length === 1 && String(carriers[0].vendorId) === scope ? o : null;\n    };\n    const hit = store.attachmentGet(adapterId, convId, attId, scope) || (scope && !agent ? legacy() : null);', 'const hit = null;');   // verify r2: the bare-id `legacy` asks the cache too — the copy drops both
  ok(noCache.some((n) => /CACHE-FIRST/.test(n)), `§7 CONTROL: a copy that never asks the cache is RED (${noCache.join(' | ')})`);
  const second = mutEngine('ingest-fetch', 'const r = await vendor(rec, e, () => e.adapter.history(convId, opts));', 'const r = await vendor(rec, e, () => e.adapter.history(convId, opts)); for (const x of r.records || []) for (const a of x.attachments || []) await e.adapter.fetchAttachment(convId, { messageId: x.vendorId, attachmentId: a.id });');
  ok(second.some((n) => /ON-DEMAND/.test(n)), `§7 CONTROL: a copy whose INGEST fetches every picture is RED (${second.join(' | ')})`);
  // r-verify: the two callers the first census missed — an INTERNAL prefetch at ingest, a wiring file's own receiver name
  const prefetch = mutEngine('ingest-prefetch', 'if (freshRecs.length) en.authors = mergeAuthors(en.authors, freshRecs);', 'if (freshRecs.length) en.authors = mergeAuthors(en.authors, freshRecs); for (const x of freshRecs) for (const at of x.attachments || []) setTimeout(() => attachment(rec.id, convId, at.id).catch(() => {}), 0);');
  ok(prefetch.some((n) => /never INVOKED/.test(n)), `§7 CONTROL: a copy whose INGEST prefetches every picture through the engine's OWN attachment() is RED (${prefetch.join(' | ')})`);
  const wiringRel = 'src/server/channels-wiring.js';
  ok(typeof serverTexts[wiringRel] === 'string', '§7 CONTROL wiring-prefetch: the wiring file is in the census');
  const wf = MUT.write(wiringRel, serverTexts[wiringRel] + '\nfunction prefetchPictures(engine, rows) { for (const r of rows) engine.attachment(r.adapterId, r.id, r.attId).catch(() => {}); }\n', 'wiring-prefetch');
  const wiring = reds(attachmentCensus(engineSrc, routesSrc, { ...serverTexts, [wiringRel]: fs.readFileSync(wf, 'utf-8') }));
  ok(wiring.some((n) => /every `\.attachment\(` in the server tree/.test(n)), `§7 CONTROL: a wiring-file copy calling \`engine.attachment(\` (a receiver the old list did not name) is RED (${wiring.join(' | ')})`);
  const Amut = MUT.load('src/channel-attachments.js', AttSrc.replace("if (f.affordable === false) return { act: 'refuse', code: 'vendor-budget' };", ''), 'no-budget-verdict');
  ok(AttSrc.includes("if (f.affordable === false) return { act: 'refuse', code: 'vendor-budget' };") && reds(verdictTable(Amut)).length >= 1, `§7 CONTROL: a PURE verdict without its budget gate is RED (${reds(verdictTable(Amut)).join(' | ')})`);
  for (const x of copiesCensus(MUT.files, MUT.dir, REPO, { minCopies: 9, label: '§7 ' })) ok(x.pass, x.name + (x.pass ? '' : ' — ' + x.detail));
}

// ── 8: THE BROWSER-TOOLS INSTALL SLOT (lane browser-admin 2b, 2026-10-01) ──
// VibeSpace downloads a program in exactly ONE place: the browser keeper's install slot (data/browser-tools), shared by the
// CloakBrowser install (lane-cloak) and the browser CLI install (`agent-browser@<version>`). Allowlisted HERE deliberately
// with its gates, as a FUNCTION of the source text (an ungated copy turns it red):
//   USER-ONLY   each install is reached from ONE route, and that route refuses an agent's token by name
//               (refuseAgentBearer) — no timer, no boot path, no agent route installs anything;
//   ONE SPAWN   every npm the keeper runs is `SW.installArgv(...)` (a prefix of ours, --no-save, a pinned spec);
//   REGISTRY    the CLI install's spec is CLI_PACKAGE@<the verdict's version> and its argv carries --ignore-scripts (the
//               package's postinstall — the one script that would fetch from GitHub — never runs): the npm registry
//               is the ONE host (the measured record CLI_PIN_RECORD names it);
//   ONE SLOT    the CLI install's verdict is asked the slot's `installState.running` (never two installs at once).
{
  const { mutantCopies, copiesCensus } = await import('./mutant-copy.mjs');
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const keeperRel = 'src/server/browser-keeper.js', routesRel = 'src/routes/browser.js';
  // rv-browser F7 (lane dc-browser-installs): the install slot and its rows moved out of the keeper — the census reads them AS
  // the keeper (ONE text: the keeper + the slot + every INSTALLERS row file), never as "another module" calling the installs
  const INSTALL_FILES = ['src/server/browser-installs.js', ...[...fs.readFileSync(path.join(REPO, 'src/server/browser-installs.js'), 'utf-8').matchAll(/require\('\.\/([\w-]+\.js)'\)/g)].map((m) => 'src/server/' + m[1])];
  const keeperSrc = [keeperRel, ...INSTALL_FILES].map((rel) => fs.readFileSync(path.join(REPO, rel), 'utf-8')).join('\n'), routesSrc = fs.readFileSync(path.join(REPO, routesRel), 'utf-8');
  const serverTexts = Object.fromEntries(files.map((f) => [path.relative(REPO, f), (() => { try { return fs.readFileSync(f, 'utf-8'); } catch { return ''; } })()]));
  for (const rel of INSTALL_FILES) { if (serverTexts[rel] != null) serverTexts[keeperRel] = keeperSrc; delete serverTexts[rel]; } // the slot + rows ride the keeper's text
  const slotCensus = (K, R, texts) => {
    const rows = [];
    const k = strip(K), r = strip(R);
    const fnBody = (src, name) => { const at = src.indexOf(`function ${name}(`); if (at < 0) return ''; const end = src.indexOf('\n  }\n', at); return end < 0 ? '' : src.slice(at, end); };
    const cli = fnBody(k, 'installCli');
    rows.push(['installCli exists', !!cli, '']);
    rows.push(['ONE SPAWN: every npm the keeper runs is SW.installArgv (cloak\'s runStep + the CLI\'s spawn)', (k.match(/SW\.installArgv\(/g) || []).length === 2 && /spawn\(npm, argv,/.test(cli) && /const argv = \[\.\.\.SW\.installArgv\(\{ spec: v0\.spec, prefix \}\), '--ignore-scripts'\];/.test(cli), `${(k.match(/SW\.installArgv\(/g) || []).length} installArgv`]);
    rows.push(['REGISTRY: the CLI install runs --ignore-scripts and its spec comes from THE verdict (CLI_PACKAGE@<version>)', /'--ignore-scripts'/.test(cli) && /VERBS\.cliInstallVerdict\(/.test(cli), '']);
    rows.push(['ONE SLOT: the CLI install\'s verdict is asked the slot\'s running state', /cliInstallVerdict\(\{ version: String\(version \|\| ''\), running: installState\.running,/.test(cli), '']);
    // USER-ONLY: who calls installCli / installCloak across the server tree — only routes/browser.js, each behind refuseAgentBearer
    const callers = [];
    for (const [rel, text] of Object.entries(texts)) {
      const code = strip(text);
      for (const m of code.matchAll(/\.(installCli|installCloak)\(/g)) callers.push(rel + ':' + m[1]);
      if (rel !== keeperRel && /\binstallCli\(|\binstallCloak\(/.test(code.replace(/\.(installCli|installCloak)\(/g, ''))) callers.push(rel + ':bare');
    }
    // the ONE other caller: lane browser-propose's runner — its `inst.start` (= installCloak) runs only inside run(), run()
    // only from approve(), and approve only from the user's Approve route (refuseAgentBearer, PROPOSAL_IS_USERS)
    const PROPOSE = 'src/server/browser-propose.js';
    const ext = callers.filter((c) => !c.startsWith(routesRel + ':') && c !== PROPOSE + ':installCloak');
    const pr = strip(texts[PROPOSE] || '');
    const proposeOk = (pr.match(/inst\.start\(/g) || []).length === 1 && /async function run\(entry\) \{[\s\S]*inst\.start\(/.test(pr) && (pr.match(/[^.\w]run\(/g) || []).length === 2 && /function approve\([\s\S]{0,600}run\(st\.entry\)/.test(pr)
      && /router\.post\('\/api\/browser\/proposals\/:id\/approve'[\s\S]{0,120}refuseAgentBearer\(req, res, PROPOSAL_IS_USERS\)/.test(r);
    rows.push(['USER-ONLY: installCli / installCloak are called only from src/routes/browser.js and the proposal runner\'s user-approved run (no timer, no boot path, no other module)', ext.length === 0 && callers.filter((c) => c.startsWith(routesRel)).length === 2 && proposeOk, callers.join(', ') + (proposeOk ? '' : ' · the proposal runner\'s install is not approve-only')]);
    const route = (p) => { const at = r.indexOf(`router.post('${p}'`); if (at < 0) return ''; const end = r.indexOf('\n});', at); return end < 0 ? '' : r.slice(at, end); };
    const rc = route('/api/browser/cli/install'), rk = route('/api/browser/install');
    rows.push(['USER-ONLY: each install route refuses an agent\'s token (refuseAgentBearer) BEFORE the keeper is asked', /refuseAgentBearer\(req, res, INSTALL_IS_USERS\)/.test(rc) && rc.indexOf('refuseAgentBearer') < rc.indexOf('installCli(') && /refuseAgentBearer\(req, res, INSTALL_IS_USERS\)/.test(rk) && rk.indexOf('refuseAgentBearer') < rk.indexOf('installCloak('), '']);
    rows.push(['no AGENT route installs anything', !/router\.(get|post)\('\/api\/agent\/[^']*'[\s\S]{0,800}?(installCli|installCloak)\(/.test(r.replace(/router\.(get|post|patch|delete)\('\/api\/(?!agent)/g, '§')), '']);
    return rows;
  };
  const reds = (rows) => rows.filter(([, p]) => !p).map(([n, , d]) => n + (d ? ' [' + d + ']' : ''));
  for (const [n, p, d] of slotCensus(keeperSrc, routesSrc, serverTexts)) ok(p, '§8 ' + n + (p || !d ? '' : ' — ' + d));
  const V = require(path.join(REPO, 'src/browser-verbs.js'));
  ok(V.CLI_PIN_RECORD.registryHost === 'registry.npmjs.org' && V.cliInstallVerdict({}).spec === `${V.CLI_PACKAGE}@${V.TABLE_VERSION}` && V.cliInstallVerdict({ version: 'https://evil.example/x.tgz' }).ok === false, '§8 the CLI spec is the package at a dotted version (never a URL / a tarball / another package); the measured record names the ONE host');
  // CONTROLS
  const MUT = mutantCopies('vendor-whitelist-slot', REPO);
  const mut = (label, rel, src, from, to) => { ok(src.includes(from), `§8 CONTROL ${label}: the edit's anchor is in ${rel}`); const f = MUT.write(rel, src.replace(from, to), label); return fs.readFileSync(f, 'utf-8'); };
  const scripts = mut('scripts-run', keeperRel, keeperSrc, "    const argv = [...SW.installArgv({ spec: v0.spec, prefix }), '--ignore-scripts'];", '    const argv = [...SW.installArgv({ spec: v0.spec, prefix })];');
  ok(reds(slotCensus(scripts, routesSrc, { ...serverTexts, [keeperRel]: scripts })).some((n) => /REGISTRY|ONE SPAWN/.test(n)), '§8 CONTROL: a CLI install that lets the package\'s scripts run is RED');
  const timer = mut('timer', keeperRel, keeperSrc, '  const reattached = installs.reattach();', '  const reattached = installs.reattach(); setInterval(() => { try { api.installCli({}); } catch { /* none */ } }, 3600e3);');
  ok(reds(slotCensus(timer, routesSrc, { ...serverTexts, [keeperRel]: timer })).some((n) => /USER-ONLY/.test(n)), '§8 CONTROL: a keeper that installs on a timer is RED');
  const open = mut('agent-token', routesRel, routesSrc, "  if (refuseAgentBearer(req, res, INSTALL_IS_USERS)) return;\n  const k = keeperOr503(res); if (!k) return;\n  if (typeof k.installCli", "  const k = keeperOr503(res); if (!k) return;\n  if (typeof k.installCli");
  ok(reds(slotCensus(keeperSrc, open, { ...serverTexts, [routesRel]: open })).some((n) => /USER-ONLY/.test(n)), '§8 CONTROL: a CLI install route an agent token reaches is RED');
  const twoSlots = mut('two-slots', keeperRel, keeperSrc, "VERBS.cliInstallVerdict({ version: String(version || ''), running: installState.running,", "VERBS.cliInstallVerdict({ version: String(version || ''), running: false,");
  ok(reds(slotCensus(twoSlots, routesSrc, { ...serverTexts, [keeperRel]: twoSlots })).some((n) => /ONE SLOT/.test(n)), '§8 CONTROL: a CLI install that ignores the slot is RED');
  // lane chrome-builds-download (design 004, B-80c1): THE SLOT'S THIRD KIND — a Chrome for Testing build into the CLI's own
  // builds folder. OUR fetch (no child downloads), so the census reads the fetch itself:
  //   ONE FETCH   the keeper has exactly ONE `fetch(` — inside `buildFetch`, AFTER egressVerdict over the hosts of
  //               CHROME_BUILDS_RECORD (https only, redirects by hand); no http(s).request / http(s).get anywhere in the keeper;
  //   USER-ONLY   installChromeBuild / removeChromeBuild / chromeBuildsAvailable are called only from routes/browser.js, each
  //               route refusing an agent's token BEFORE the keeper is asked — no timer, no boot path, no agent route;
  //   ONE SLOT    the download asks `installState.running` and takes the slot as kind `chrome-build`.
  const buildCensus = (K, R, texts) => {
    const rows = [], k = strip(K), r = strip(R);
    const fnBody = (src, name) => { const at = src.indexOf(`function ${name}(`); if (at < 0) return ''; const end = src.indexOf('\n  }\n', at); return end < 0 ? '' : src.slice(at, end); };
    const bf = fnBody(k, 'buildFetch'), inst = fnBody(k, 'installChromeBuild');
    rows.push(['installChromeBuild + buildFetch exist', !!bf && !!inst, '']);
    const fetches = (k.match(/\bfetch\(/g) || []).length;
    rows.push(['ONE FETCH: the keeper\'s only `fetch(` is buildFetch\'s, after egressVerdict over CHROME_BUILDS_RECORD\'s hosts (https only, redirect: manual)', fetches === 1 && /const ev = B\.egressVerdict\(x\.hostname, buildHosts\(\)\);\s*if \(!ev\.allow \|\| x\.protocol !== 'https:'\) throw namedError\('build_url_offhost',/.test(bf) && bf.indexOf('B.egressVerdict(') < bf.indexOf('fetch(') && /redirect: 'manual'/.test(bf)
      && /const CBR = VERBS\.CHROME_BUILDS_RECORD;/.test(k) && /const buildHosts = \(\) => B\.parseEgressAllowlist\(\[CBR\.listHost, CBR\.fileHost\]\);/.test(k), `${fetches} fetch(`]);
    const reqs = k.match(/\bhttps?\.(request|get)\(/g) || [];
    rows.push(['ONE FETCH: no other request leaves the keeper (its one http.get is the CDP probe of a browser\'s own /json/version)', reqs.length === 1 && /http\.get\(\{ host: target\.hostname, port: target\.port \|\| \(target\.protocol === 'https:' \? 443 : 80\), path: '\/json\/version',/.test(k), reqs.join(' ')]);
    const callers = [];
    for (const [rel, text] of Object.entries(texts)) for (const m of strip(text).matchAll(/\.(installChromeBuild|removeChromeBuild|chromeBuildsAvailable)\(/g)) callers.push(rel + ':' + m[1]);
    rows.push(['USER-ONLY: the download, the removal and the list reads are called only from src/routes/browser.js (no timer, no boot path, no other module)', callers.length === 3 && callers.every((c) => c.startsWith(routesRel + ':')), callers.join(', ')]);
    const route = (verb, p) => { const at = r.indexOf(`router.${verb}('${p}'`); if (at < 0) return ''; const end = r.indexOf('\n});', at); return end < 0 ? '' : r.slice(at, end); };
    const rs = [route('get', '/api/browser/builds/available'), route('post', '/api/browser/builds/download'), route('delete', '/api/browser/builds/:version')];
    rows.push(['USER-ONLY: each of the three routes refuses an agent\'s token (refuseAgentBearer) BEFORE the keeper is asked', rs.every((x) => /refuseAgentBearer\(req, res, BUILDS_DOWNLOAD_IS_USERS\)/.test(x) && x.indexOf('refuseAgentBearer') < x.search(/k\.(chromeBuildsAvailable|installChromeBuild|removeChromeBuild)\(/)), '']);
    rows.push(['no AGENT route downloads a build', !/router\.(get|post|delete)\('\/api\/agent\/[^']*'[\s\S]{0,800}?(installChromeBuild|removeChromeBuild|chromeBuildsAvailable)\(/.test(r.replace(/router\.(get|post|patch|delete)\('\/api\/(?!agent)/g, '§')), '']);
    rows.push(['ONE SLOT: the download asks the slot\'s running state and takes it as its row\'s id (`chrome-build`)', /if \(installState\.running\) throw namedError\('install_running',/.test(inst) && /Object\.assign\(installState, \{ running: true, kind: ROW\.id,/.test(inst) && /const ROW = \{ id: 'chrome-build',/.test(keeperSrc), '']);
    return rows;
  };
  for (const [n, p, d] of buildCensus(keeperSrc, routesSrc, serverTexts)) ok(p, '§8 ' + n + (p || !d ? '' : ' — ' + d));
  const noVerdict = mut('build-no-verdict', keeperRel, keeperSrc, '      const ev = B.egressVerdict(x.hostname, buildHosts());', '      const ev = { allow: true };');
  ok(reds(buildCensus(noVerdict, routesSrc, { ...serverTexts, [keeperRel]: noVerdict })).some((n) => /ONE FETCH/.test(n)), '§8 CONTROL: a build fetch without the egress verdict is RED');
  const secondFetch = mut('build-second-fetch', keeperRel, keeperSrc, '  async function jsonBody(res, max) {', '  async function headOf(u) { return fetch(u, { method: \'HEAD\' }); }\n  async function jsonBody(res, max) {');
  ok(reds(buildCensus(secondFetch, routesSrc, { ...serverTexts, [keeperRel]: secondFetch })).some((n) => /ONE FETCH/.test(n)), '§8 CONTROL: a second fetch site beside buildFetch is RED');
  const openDl = mut('build-agent-token', routesRel, routesSrc, "router.post('/api/browser/builds/download', async (req, res) => {\n  if (refuseHost(req, res)) return;\n  if (refuseAgentBearer(req, res, BUILDS_DOWNLOAD_IS_USERS)) return;", "router.post('/api/browser/builds/download', async (req, res) => {\n  if (refuseHost(req, res)) return;");
  ok(reds(buildCensus(keeperSrc, openDl, { ...serverTexts, [routesRel]: openDl })).some((n) => /USER-ONLY/.test(n)), '§8 CONTROL: a download route an agent token reaches is RED');
  const atBoot = mut('build-at-boot', keeperRel, keeperSrc, '  const reattached = installs.reattach();', "  const reattached = installs.reattach(); setTimeout(() => { api.installChromeBuild({ version: VERBS.CHROME_BUILDS_RECORD.measured.stable }).catch(() => {}); }, 0);");
  ok(reds(buildCensus(atBoot, routesSrc, { ...serverTexts, [keeperRel]: atBoot })).some((n) => /USER-ONLY/.test(n)), '§8 CONTROL: a keeper that downloads a build at boot is RED');
  for (const x of copiesCensus(MUT.files, MUT.dir, REPO, { minCopies: 4, label: '§8 ' })) ok(x.pass, x.name + (x.pass ? '' : ' — ' + x.detail));
}

// ── 9: A THREAD BORN AFTER ITS ROOT WAS STORED (lane lark-threads, 2026-10-01 — the owner's post) ──
// Two more vendor reads, allowlisted HERE deliberately with their gates (a function of the source text — an ungated copy,
// written by scripts/mutant-copy.mjs, turns it red):
//   RECHECK  `.recentRoots(` (ONE page of a chat's newest messages) is called ONCE in the server tree — the engine's
//            `recheckOne()`, through `vendor(rec, e, …)` (the minute's budget, the pace); `recheckOne` is invoked ONLY by
//            the drain's `recheck` action (rule 22a, the timer — one page per conversation per channels.threadRecheckSec)
//            and the OWNER's press (rule 22b, `act.recheck`, floored) — never an agent route, never an ingest;
//   BY-ID    `.messageById(` is called ONCE — the engine's `fetchMissing()`, through `vendor(rec, e, …)`, after the per-tick
//            bound (BYID_PER_TICK) and `affordable(rec, e)` are asked; every answer that is not a thread reply remembered
//            (BYID_MEMORY_MS) — `fetchMissing` is invoked only from the change feed's page (`feedPage`).
{
  const { mutantCopies, copiesCensus } = await import('./mutant-copy.mjs');
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/([^:'"\\])\/\/[^'"\n]*$/gm, '$1');
  const bodyOf = (E, head) => { const at = E.indexOf(head); if (at < 0) return ''; const end = E.indexOf('\n  }\n', at); return end < 0 ? '' : E.slice(at, end); };
  const census = (engineSrc, serverTexts) => {
    const rows = [];
    const E = strip(engineSrc);
    const callersOf = (re) => { const out = []; for (const [rel, text] of Object.entries(serverTexts)) { const n = (strip(text).match(re) || []).length; if (n) out.push(`${rel}:${n}`); } return out; };
    const rc = callersOf(/\.recentRoots\(/g), bc = callersOf(/\.messageById\(/g);
    rows.push(['RECHECK: `.recentRoots(` is called from exactly one place in the server tree (the engine\'s recheckOne)', rc.length === 1 && rc[0] === 'src/server/channels-engine.js:1' && /vendor\(rec, e, \(\) => e\.adapter\.recentRoots\(/.test(bodyOf(E, 'async function recheckOne(')), rc.join(', ')]);
    const invokes = (E.match(/(?<![.\w$])recheckOne\(/g) || []).length;
    const fo = bodyOf(E, '      const fetchOne = async (act) => {') || E;
    rows.push(['RECHECK: recheckOne is invoked only by the drain\'s `recheck` action and the OWNER\'s press (`act.recheck`, floored by recheckOnPress)', invokes === 3 && /act\.type === 'recheck'\) \{ e\.chargeBy = 'timer'; result = await recheckOne\(/.test(E) && /if \(act\.recheck && threadsRow\(registry\.capsOf\(rec\.kind\)\)\.listing === 'separate' && Drain\.recheckOnPress\(/.test(E), `bare occurrences ${invokes} (the definition + 2)`]);
    const fm = bodyOf(E, 'async function fetchMissing(');
    const bound = fm.indexOf('if (e.byIdTick.n >= BYID_PER_TICK || !affordable(rec, e)'), call = fm.indexOf('vendor(rec, e, () => e.adapter.messageById(');
    rows.push(['BY-ID: `.messageById(` is called from exactly one place (the engine\'s fetchMissing), through vendor(rec, e, …), AFTER the per-tick bound and the minute\'s budget', bc.length === 1 && bc[0] === 'src/server/channels-engine.js:1' && bound > 0 && call > bound, JSON.stringify({ callers: bc, bound, call })]);
    rows.push(['BY-ID: every answer that is not a thread reply (and every refusal) is remembered — never asked again per tick', /rememberById\(e, vid, 'refused'\)/.test(fm) && /rememberById\(e, vid, \(r && r\.kind\) \|\| 'absent'\)/.test(fm) && /e\.byIdMem\.has\(vid\)/.test(fm), '']);
    const fmCalls = (E.match(/(?<![.\w$])fetchMissing\(/g) || []).length;
    rows.push(['BY-ID: fetchMissing is invoked only from the change feed\'s page', fmCalls === 2 && /if \(separate\) await fetchMissing\(rec, e\);/.test(bodyOf(E, 'async function feedPage(')), `bare occurrences ${fmCalls}`]);
    return rows;
  };
  const serverTexts = {};
  for (const f of files) { const rel = path.relative(REPO, f); try { serverTexts[rel] = fs.readFileSync(f, 'utf-8'); } catch { } }
  const engineRel = 'src/server/channels-engine.js';
  const engineSrc = engineSource(REPO);   // lane dc-channels-seams: the engine + its three family files as one text
  ok(typeof engineSrc === 'string', '§9 the engine is in the server census');
  for (const [name, pass0, detail] of census(engineSrc, serverTexts)) ok(pass0, `§9 ${name}`, detail);
  const MUT = mutantCopies('vendor-whitelist-lkt', REPO);
  const reds = (rows) => rows.filter(([, p]) => !p).map(([n]) => n);
  const mutEngine = (label, from, to) => {
    ok(engineSrc.includes(from), `§9 CONTROL ${label}: the edit's anchor is in the engine`);
    const f = MUT.write(engineRel, engineSrc.replace(from, to), label);
    const t = fs.readFileSync(f, 'utf-8');
    return reds(census(t, { ...serverTexts, [engineRel]: t }));
  };
  const ingestRecheck = mutEngine('ingest-recheck', 'if (freshRecs.length) en.authors = mergeAuthors(en.authors, freshRecs);', 'if (freshRecs.length) en.authors = mergeAuthors(en.authors, freshRecs); setTimeout(() => recheckOne(rec, e, convId, { by: \'timer\' }).catch(() => {}), 0);');
  ok(ingestRecheck.some((n) => /RECHECK: recheckOne is invoked only/.test(n)), `§9 CONTROL: a copy whose INGEST rechecks every conversation it reads is RED (${ingestRecheck.join(' | ')})`);
  const unbounded = mutEngine('byid-unbounded', 'if (e.byIdTick.n >= BYID_PER_TICK || !affordable(rec, e) || outlived(rec, e)) break;', 'if (outlived(rec, e)) break;');
  ok(unbounded.some((n) => /BY-ID: `\.messageById\(`/.test(n)), `§9 CONTROL: a by-id loop without its per-tick bound and the budget is RED (${unbounded.join(' | ')})`);
  const ingestById = mutEngine('ingest-byid', 'const r = await vendor(rec, e, () => e.adapter.history(convId, opts));', 'const r = await vendor(rec, e, () => e.adapter.history(convId, opts)); for (const x of r.records || []) await e.adapter.messageById(convId, { messageId: x.vendorId });');
  ok(ingestById.some((n) => /BY-ID: `\.messageById\(`/.test(n)), `§9 CONTROL: a copy whose INGEST reads every message by id is RED (${ingestById.join(' | ')})`);
  const forgets = mutEngine('byid-forgets', "rememberById(e, vid, 'refused'); f.counters.missingRefused++;", 'f.counters.missingRefused++;');
  ok(forgets.some((n) => /remembered/.test(n)), `§9 CONTROL: a by-id read that forgets a refusal (asked again every tick) is RED (${forgets.join(' | ')})`);
  for (const x of copiesCensus(MUT.files, MUT.dir, REPO, { minCopies: 4, label: '§9 ' })) ok(x.pass, x.name + (x.pass ? '' : ' — ' + x.detail));
}

// ── 10: THE CODEX APP-SERVER SPAWNS + THE RESET-CREDIT HELPER (lane reset-path, 2026-10-01) ──
// The owner: the Agents list could not use a codex reset credit without a live chat session. The fix is ONE
// bounded `codex app-server` child (src/codex-reset-helper.js) — the first app-server a PERSON'S CLICK starts
// outside a conversation, and a vendor act (the consume IS the vendor call; the app-server's own startup also
// reaches out — measured). It is allowlisted HERE deliberately, with its gates, and every other app-server
// argv in the server tree is a row too — a new one fails until it is listed with its reason:
//   ONE CALLER    the helper is called only by the engine's writeResetCreditViaHelper, after the spend ceiling
//                 and the attempt record (the floor arms on its `onSent`);
//   HUMAN ONLY    that writer is called only by consumeResetCreditFor (the human-only POST, after the
//                 preview's refusals), never by the auto rung, never under a timer;
//   MEASURED      MEASURED_CONNECTS: our own process 0 internet-family calls, the app-server's startup set recorded;
//   LIVE (strace) the helper over the STUB app-server with an EMPTY CODEX_HOME opens ZERO internet connections.
{
  const strip8 = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/([^:'"\\])\/\/[^'"\n]*$/gm, '$1');
  const APP_SERVER = /\[\s*['"]app-server['"]/g;
  const ALLOW_APP_SERVER = {
    'src/codex-thread-read.js': 'B-21e4: the thread/read fallback for a thread with no rollout (navigation-triggered; parked as B-af31)',
    'src/adapters/codex.js': 'a conversation\'s OWN app-server, inside its wrapper (the session is the conversation)',
    'src/local-oracles.js': 'a measured-and-REJECTED candidate record (codex-app-server-config-read) — never spawned',
    'src/codex-reset-helper.js': 'THE RESET-CREDIT HELPER — a person\'s click on Use… with no conversation to carry it (gates below; +1 read per human press, both paths — the owner\'s yes on ut-cdaa01aff0, verify r8 T0)',
  };
  const hits8 = {};
  for (const f of files) {
    const rel = path.relative(REPO, f);
    if (rel.startsWith('data/bin/vibespace-agentd')) continue; // the built bundle carries copies of the two rows above
    let t = ''; try { t = strip8(fs.readFileSync(f, 'utf8')); } catch { continue; }
    const n = (t.match(APP_SERVER) || []).length;
    if (n) hits8[rel] = n;
  }
  for (const [rel, n] of Object.entries(hits8)) ok(!!ALLOW_APP_SERVER[rel], `§10 a \`codex app-server\` argv only in an allowlisted file (${rel}: ${n}${ALLOW_APP_SERVER[rel] ? '' : ' — NOT ALLOWLISTED'})`);
  for (const [rel, why] of Object.entries(ALLOW_APP_SERVER)) ok(hits8[rel] > 0, `§10 allowlist row still matches: ${rel} (${why.split(' — ')[0]})`);
  // THE HELPER'S GATES — a census over TEXT so a patched copy can be shown red
  const helperCensus = (engineText, routeText, helperText) => {
    const E = strip8(engineText), R = strip8(routeText), H = strip8(helperText);
    const rows = [];
    const fnBody = (src, header) => { const at = src.indexOf(header); if (at < 0) return ''; const end = src.indexOf('\n}\n', at); return end < 0 ? '' : src.slice(at, end); };
    const calls = (re) => (E.match(re) || []).length;
    const hb = fnBody(E, 'function writeResetCreditViaHelper(');
    const auth = hb.indexOf("spendGuard.authorize({ reason: 'codex-reset-credit'"), open = hb.indexOf('openResetCreditTry('), spawnAt = hb.indexOf('consumeResetCreditViaAppServer(');
    rows.push(['ONE CALLER: the helper is called once in the server tree, by writeResetCreditViaHelper, after the spend ceiling and the attempt record', calls(/consumeResetCreditViaAppServer\(/g) === 1 && auth > 0 && open > auth && spawnAt > open && /onSent: \(\) => noteResetCreditSent\(t\)/.test(hb), JSON.stringify({ calls: calls(/consumeResetCreditViaAppServer\(/g), auth, open, spawnAt })]);
    const cb = fnBody(E, 'function consumeResetCreditFor(');
    const pv = cb.indexOf('const p = resetCreditPreview('), refuse = cb.indexOf('if (p.code) return'), w = cb.indexOf('writeResetCreditViaHelper(');
    rows.push(['HUMAN ONLY: writeResetCreditViaHelper is called once, by consumeResetCreditFor, after the preview\'s refusals (floor / in_flight / no_credits)', (E.match(/writeResetCreditViaHelper\(/g) || []).length === 2 && pv > 0 && refuse > pv && w > refuse, JSON.stringify({ n: (E.match(/writeResetCreditViaHelper\(/g) || []).length, pv, refuse, w })]);
    // verify r1: the timer census reads up to three lines past a `setTimeout(` / `setInterval(` — a planted call on
    // the next line (the press's own spawn deferred under a timer, a multi-line interval) escaped the same-line form
    rows.push(['NEVER THE AUTO RUNG, NEVER A TIMER: no helper call in resetCreditRung, none under setTimeout / setInterval (up to three lines in)', !/writeResetCreditViaHelper\(|consumeResetCreditViaAppServer\(/.test(fnBody(E, 'function resetCreditRung(')) && !/set(?:Timeout|Interval)\((?:[^\n]*\n){0,3}[^\n]*(?:writeResetCreditViaHelper|consumeResetCreditViaAppServer)/.test(E), '']);
    const post = R.indexOf("app.post('/api/accounts/:id/reset-credit'"), bearer = R.indexOf('if (isAgentBearer(req)) return res.status(403)', post), consume = R.indexOf('engine.consumeResetCreditFor(', post);
    rows.push(['HUMAN ONLY: the POST refuses an agent\'s session / job token BEFORE it reaches the engine; the GET preview never consumes', post > 0 && bearer > post && consume > bearer && /\(vsst_\|jbt_\)/.test(R) && R.slice(0, post).indexOf('consumeResetCreditFor(') < 0, JSON.stringify({ post, bearer, consume })]);
    rows.push(['the helper module builds no request of its own (no http/fetch, no vendor host in code)', !/require\(['"](https?|net|tls)['"]\)/.test(H) && !REQUESTY.test(H) && !/https?:\/\//.test(H.replace(/MEASURED_CONNECTS = Object\.freeze\(\{[\s\S]*?\}\);/, '')), '']);
    return rows;
  };
  const engRel = 'src/server/usage-pool-engine.js', routeRel = 'src/routes/reset-credit.js', helperRel = 'src/codex-reset-helper.js';
  const engT = fs.readFileSync(path.join(REPO, engRel), 'utf8'), routeT = fs.readFileSync(path.join(REPO, routeRel), 'utf8'), helperT = fs.readFileSync(path.join(REPO, helperRel), 'utf8');
  for (const [name, pass8, detail] of helperCensus(engT, routeT, helperT)) ok(pass8, `§10 ${name}`, detail);
  const H = require(path.join(REPO, helperRel));
  const M = H.MEASURED_CONNECTS;
  ok(M && /strace/.test(M.tool) && /^\d{4}-\d\d-\d\d$/.test(M.date) && /codex-cli \d+\.\d+\.\d+/.test(M.version) && /unshare -n/.test(M.runner) && M.ours.inet === 0 && M.appServer.inetOk === 0 && M.appServer.inet === M.appServer.dns + M.appServer.https + M.appServer.other,
    '§10 MEASURED: the helper\'s connect set is a measurement (tool, date, CLI version, runner) — our own process 0 internet-family calls, none succeeded in the empty namespace', JSON.stringify(M));
  // CONTROLS — the census over patched TEXT
  const red8 = (rows) => rows.filter(([, p8]) => !p8).map(([n]) => n);
  const swapEng = (from, to) => { ok(engT.includes(from), `§10 CONTROL: the anchor is in the engine (${from.slice(0, 50).trim()}…)`); return engT.replace(from, to); };
  const before = swapEng("  const t = openResetCreditTry({ key, sid: null, via: 'helper', origin: 'user', resetsAtSec, lane: null, now, idemKey, av, creditsAt: resetCreditsLeft(null, key), reportsSent: true, window: spentWindowOf(readRawUsageCache(key)) });", "  codexResetHelper.consumeResetCreditViaAppServer({ idempotencyKey: 'x' });\n  const t = openResetCreditTry({ key, sid: null, via: 'helper', origin: 'user', resetsAtSec, lane: null, now, idemKey, av, creditsAt: resetCreditsLeft(null, key), reportsSent: true, window: spentWindowOf(readRawUsageCache(key)) });");
  ok(red8(helperCensus(before, routeT, helperT)).some((n) => /ONE CALLER/.test(n)), '§10 CONTROL: a second helper call BEFORE the attempt record is RED');
  const auto = swapEng("    // AUTO — through the ONE writer the manual button uses too (writeResetCredit).", "    if (!session.pty) writeResetCreditViaHelper(key, { resetsAtSec: R });\n    // AUTO — through the ONE writer the manual button uses too (writeResetCredit).");
  ok(red8(helperCensus(auto, routeT, helperT)).some((n) => /NEVER THE AUTO RUNG/.test(n)), '§10 CONTROL: an auto rung that falls to the helper is RED');
  const timer = swapEng("function writeResetCreditViaHelper(", "function _retry(k) { setTimeout(() => writeResetCreditViaHelper(k), 60e3); }\nfunction writeResetCreditViaHelper(");
  ok(red8(helperCensus(timer, routeT, helperT)).some((n) => /NEVER A TIMER/.test(n)), '§10 CONTROL: a helper call under a timer is RED');
  const deferred = swapEng("  Promise.resolve(codexResetHelper.consumeResetCreditViaAppServer({", "  setTimeout(() => {\n  Promise.resolve(codexResetHelper.consumeResetCreditViaAppServer({");
  ok(red8(helperCensus(deferred, routeT, helperT)).some((n) => /NEVER A TIMER/.test(n)), '§10 CONTROL (verify r1): the press\'s own spawn deferred under a MULTI-LINE timer is RED (the same-line census let it through)');
  const routeOpen = routeT.replace("      if (isAgentBearer(req)) return res.status(403).json({ error: 'human-triggered only', code: 'agent_forbidden' });\n", '');
  ok(routeOpen !== routeT && red8(helperCensus(engT, routeOpen, helperT)).some((n) => /agent's session \/ job token/.test(n)), '§10 CONTROL: a POST that lets an agent token through is RED');
  const fetchy = helperT.replace("const { spawn } = require('child_process');", "const { spawn } = require('child_process');\nconst https = require('https');");
  ok(fetchy !== helperT && red8(helperCensus(engT, routeT, fetchy)).some((n) => /builds no request/.test(n)), '§10 CONTROL: a helper that loads an http client is RED');
  // verify r2 (Q5): the timer census above is LEXICAL and ENGINE-ONLY — a timer two files away reaching the helper
  // through the EXPORTED consumeResetCreditFor (server.js hands it to the routes; any module could call it) escaped
  // it. A TREE-WIDE census of every CALL of consumeResetCreditFor: the route's POST (twice — the press, and the press
  // re-asked after the conversation's read) and the engine's own definition; nothing else, none under a timer
  const ALLOW_CONSUME_CALLS = { 'src/routes/reset-credit.js': 2, 'src/server/usage-pool-engine.js': 1 };
  // verify r3: a REFERENCE census beside the call census — `const f = engine.consumeResetCreditFor; setInterval(f, …)` and
  // `engine.consumeResetCreditFor.bind(engine)` carry no `(` after the name and slipped the call census whole. Every
  // mention of the name is counted per file (the route: its typeof guard + two calls; the engine: the definition + the
  // export; server.js: the one engine literal handed to the routes) and a `.bind(` / `.call(` / `.apply(` on it is RED
  const ALLOW_CONSUME_REFS = { 'src/routes/reset-credit.js': 3, 'src/server/usage-pool-engine.js': 2, 'server.js': 1 };
  const consumeCalls = (text) => (strip8(text).match(/consumeResetCreditFor\(/g) || []).length;
  const consumeRefs = (text) => (strip8(text).match(/\bconsumeResetCreditFor\b/g) || []).length;
  const consumeBound = (text) => /\bconsumeResetCreditFor\s*\.\s*(?:bind|call|apply)\s*\(/.test(strip8(text));
  const consumeUnderTimer = (text) => /set(?:Timeout|Interval)\((?:[^\n]*\n){0,3}[^\n]*\bconsumeResetCreditFor\b/.test(strip8(text));
  // verify r4 (T2 ⑤): a reach into the engine object that never SPELLS the name — `engine['consume' + 'ResetCreditFor']`,
  // `Reflect.get(engine, k)`, a spread re-export `{ ...engine }` — carries no reference the census above can count. The
  // server tree reaches the engine by dotted names only; any dynamic reach into an object called `engine` is RED by shape
  // verify r5 (reproduced over the r4 census itself: FIVE aliasing shapes passed it — `const e = engine; e['consume' + …]`,
  // a parameter `eng` with `Reflect.get(eng, k)`, `const { engine: pe } = deps; { ...pe }`, `Object.values(engine).find(f =>
  // f.name.endsWith('ResetCreditFor'))`, `engine?.[k]`): a census keyed on ONE identifier is a census of a spelling. It is
  // keyed on the NAME REACHED and on EVERY ALIAS the file binds to the engine: ① any string fragment that assembles the name
  // ('consume' + …, … + 'ResetCreditFor', a bare 'ResetCreditFor', a template literal); ② the engine or any alias of it
  // (const/let/var x = …engine, { engine: x }, a parameter named engine / eng, this.engine) reached by a computed member
  // ([…] / ?.[…]), Reflect.get/apply/ownKeys, a spread, Object.values/entries/keys/getOwnPropertyNames, for…in
  const consumeDynamic = (text) => {
    const s = strip8(text);
    if (/['"]consume['"]\s*\+|\+\s*['"]ResetCreditFor['"]|['"]ResetCreditFor['"]|`consume\$\{|\}ResetCreditFor`/.test(s)) return true;
    const aliases = new Set(['engine', 'eng']);
    for (const m of s.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:[\w$]+\s*\.\s*)*engine\b(?!\s*(?:\.|\?\.|\(|\[))/g)) aliases.add(m[1]); // the expression ENDS at the engine (`const r = engine.takeover(…)` binds a result, not the engine)
    for (const m of s.matchAll(/\bengine\s*:\s*([A-Za-z_$][\w$]*)\s*[,}]/g)) aliases.add(m[1]);
    const names = [...aliases].map((a) => a.replace(/\$/g, '\\$')).join('|');
    const recv = `(?:\\b(?:${names})\\b|\\bthis\\s*\\.\\s*engine\\b)`;
    return new RegExp(`${recv}\\s*(?:\\?\\.)?\\s*\\[|\\bReflect\\s*\\.\\s*(?:get|apply|ownKeys)\\s*\\(\\s*${recv}|\\.\\.\\.\\s*${recv}\\s*[,}]|\\bObject\\s*\\.\\s*(?:values|entries|keys|getOwnPropertyNames)\\s*\\(\\s*${recv}|\\bfor\\s*\\(\\s*(?:const|let|var)\\s+[\\w$]+\\s+in\\s+${recv}`).test(s);
  };
  // per file, memoised on (rel, text) (lane fast-tier-ratchet): each control below re-runs the census over the whole tree with ONE
  // file planted — the other files' findings are the same text's, so only the planted file is judged again (was ~14 × the tree)
  const CALL_MEMO = new Map();
  const callCensus = (texts) => { const bad = []; for (const [rel, t] of Object.entries(texts)) { const hit = CALL_MEMO.get(rel); if (hit && hit.t === t) { bad.push(...hit.bad); continue; } const at = bad.length; const n = consumeCalls(t); if (n && n !== (ALLOW_CONSUME_CALLS[rel] || 0)) bad.push(`${rel}: ${n} call(s), allowed ${ALLOW_CONSUME_CALLS[rel] || 0}`); const m = consumeRefs(t); if (m && m !== (ALLOW_CONSUME_REFS[rel] || 0)) bad.push(`${rel}: ${m} reference(s), allowed ${ALLOW_CONSUME_REFS[rel] || 0}`); if (consumeBound(t)) bad.push(`${rel}: consumeResetCreditFor bound with bind/call/apply`); if (consumeUnderTimer(t)) bad.push(`${rel}: a consumeResetCreditFor call under a timer`); if (consumeDynamic(t)) bad.push(`${rel}: a dynamic reach into the engine object (engine[…] / Reflect.get(engine / { …engine })`); CALL_MEMO.set(rel, { t, bad: bad.slice(at) }); } return bad; };
  const treeTexts = {}; for (const f of files) { const rel = path.relative(REPO, f); if (rel.startsWith('data/bin/vibespace-agentd')) continue; try { treeTexts[rel] = fs.readFileSync(f, 'utf8'); } catch { } }
  const badCalls = callCensus(treeTexts);
  ok(badCalls.length === 0, '§10 TREE CENSUS (verify r2): consumeResetCreditFor is CALLED only by the route\'s POST (twice) and defined once in the engine — no other caller, none under a timer anywhere in the server tree', badCalls.join(' | '));
  ok(Object.keys(ALLOW_CONSUME_CALLS).every((rel) => consumeCalls(treeTexts[rel] || '') === ALLOW_CONSUME_CALLS[rel]), '§10 TREE CENSUS: the allowlist rows still match (route 2, engine 1)');
  ok(Object.keys(ALLOW_CONSUME_REFS).every((rel) => consumeRefs(treeTexts[rel] || '') === ALLOW_CONSUME_REFS[rel]), '§10 TREE CENSUS (verify r3): the reference rows still match (route 3, engine 2, server.js 1)', JSON.stringify(Object.fromEntries(Object.keys(ALLOW_CONSUME_REFS).map((rel) => [rel, consumeRefs(treeTexts[rel] || '')]))));
  const plantedAlias = { ...treeTexts, 'server.js': (treeTexts['server.js'] || '') + "\nconst nudgeFn = engine.consumeResetCreditFor;\nsetInterval(nudgeFn, 60e3);\n" };
  ok(callCensus(plantedAlias).some((b) => /^server\.js: 2 reference\(s\), allowed 1/.test(b)) && !callCensus(plantedAlias).some((b) => /server\.js: \d+ call/.test(b)), '§10 TREE CENSUS CONTROL (verify r3): a call through a VARIABLE (const f = engine.consumeResetCreditFor; setInterval(f)) is RED by the reference census — the call census alone saw nothing', callCensus(plantedAlias).join(' | '));
  const plantedBind = { ...treeTexts, 'src/ws-handler.js': (treeTexts['src/ws-handler.js'] || '') + "\nconst spend = engine.consumeResetCreditFor.bind(engine);\n" };
  ok(callCensus(plantedBind).some((b) => /bound with bind\/call\/apply/.test(b)) && callCensus(plantedBind).some((b) => /^src\/ws-handler\.js: 1 reference/.test(b)), '§10 TREE CENSUS CONTROL (verify r3): a `.bind(` on it is RED twice (the bind, and a reference in a file with none allowed)', callCensus(plantedBind).join(' | '));
  const plantedTimer = { ...treeTexts, 'server.js': (treeTexts['server.js'] || '') + "\nsetInterval(() => {\n  engine.consumeResetCreditFor('x');\n}, 60e3);\n" };
  ok(callCensus(plantedTimer).some((b) => /^server\.js: a consumeResetCreditFor call under a timer/.test(b)), '§10 TREE CENSUS CONTROL: a timer TWO FILES AWAY (a setInterval in server.js calling engine.consumeResetCreditFor) is RED');
  const plantedCaller = { ...treeTexts, 'src/ws-handler.js': (treeTexts['src/ws-handler.js'] || '') + "\nfunction nudge(e) { return e.consumeResetCreditFor('x'); }\n" };
  ok(callCensus(plantedCaller).some((b) => /^src\/ws-handler\.js: 1 call/.test(b)), '§10 TREE CENSUS CONTROL: a new caller in another file is RED until it is allowlisted with its reason');
  for (const [what, line] of [['a dynamic property (engine[\'consume\' + \'ResetCreditFor\'])', "setInterval(() => engine['consume' + 'ResetCreditFor']('x'), 60e3);"], ['Reflect.get(engine, k)', "const k = 'consume' + 'ResetCreditFor'; setInterval(Reflect.get(engine, k), 60e3);"], ['a spread re-export ({ ...engine })', 'module.exports = { ...engine };'],
    // verify r5: the aliasing shapes the r4 census let through — the key is assembled from fragments the fragment rule does
    // not know ('cons' + 'umeResetCreditFor'), so only the ALIAS rule can catch them
    ['an alias (const e = engine; e[k])', "const e = engine;\nconst k = 'cons' + 'umeResetCreditFor';\nsetInterval(() => e[k]('x'), 60e3);"],
    ['this.engine[k]', "class N { constructor(engine) { this.engine = engine; } tick() { const k = 'cons' + 'umeResetCreditFor'; this.engine[k]('x'); } }"],
    ['a parameter eng + Reflect.get(eng, k)', "function nudge(eng) { const k = 'cons' + 'umeResetCreditFor'; return Reflect.get(eng, k)('x'); }"],
    ['a destructured alias spread ({ engine: pe } … { ...pe })', 'const { engine: pe } = deps;\nmodule.exports = { ...pe };'],
    ['Object.values(engine) found by suffix', "Object.values(engine).find((f) => typeof f === 'function' && /CreditFor$/.test(f.name))('x');"],
    ['an optional chain (engine?.[k])', "const k = 'cons' + 'umeResetCreditFor'; setInterval(() => engine?.[k]('x'), 60e3);"],
    ['a template literal (`consume${…}`)', "const tail = 'ResetCreditFor'; setInterval(() => engine[`consume${tail}`]('x'), 60e3);"]]) {
    const planted = { ...treeTexts, 'server.js': (treeTexts['server.js'] || '') + '\n' + line + '\n' };
    ok(callCensus(planted).some((b) => /^server\.js: a dynamic reach into the engine object/.test(b)), `§10 TREE CENSUS CONTROL (verify r4): ${what} spells no name the reference census could count — RED by shape`, callCensus(planted).join(' | '));
  }
  // ── THE READ CENSUS (verify r9 ⑥): every `account/rateLimits/read` REQUEST site in the tree is a ROW with its gate — the
  //    owner's yes (ut-cdaa01aff0) bought "+1 read per human press, both paths" and nothing more; a new site is RED until it is
  //    listed here with its reason (the engine never builds one: it asks a wrapper / the helper)
  {
    const READ = /request\(\s*['"]account\/rateLimits\/read['"]/g;
    const ALLOW_READ = {
      'data/bin/codex-chat-wrapper.js': { n: 3, why: 'readAccountLimits (the boot read, fire-and-forget; the on-demand `codex-read-limits` verb: the usage menu ⟳ and the route\'s read over an unsettled prior) · the read BEFORE a consume (inside `if (msg.readFirst === true)` of the codex-reset-credit handler — the engine sets the flag only for a person\'s press, verify r8 T0) · the post-reset read after a consume' },
      'src/codex-reset-helper.js': { n: 2, why: 'the helper\'s read-first (a person\'s press with no conversation to carry it) · its post-consume read' },
    };
    const hitsR = {};
    for (const f of files) { const rel = path.relative(REPO, f); if (rel.startsWith('data/bin/vibespace-agentd')) continue; let t = ''; try { t = strip8(fs.readFileSync(f, 'utf8')); } catch { continue; } const n = (t.match(READ) || []).length; if (n) hitsR[rel] = n; }
    ok(JSON.stringify(Object.keys(hitsR).sort()) === JSON.stringify(Object.keys(ALLOW_READ).sort()) && Object.entries(ALLOW_READ).every(([rel, r]) => hitsR[rel] === r.n), `§10 READ CENSUS (verify r9 ⑥): the account/rateLimits/read request sites are exactly the allowlisted rows, by file and count (${JSON.stringify(hitsR)})`, JSON.stringify(hitsR));
    const wrapperRaw = fs.readFileSync(path.join(REPO, 'data/bin/codex-chat-wrapper.js'), 'utf8'), wrapperT = strip8(wrapperRaw);
    const rc = wrapperT.indexOf("msg.type === 'codex-reset-credit')"), rf = wrapperT.indexOf('if (msg.readFirst === true) {', rc), rd = wrapperT.indexOf("request('account/rateLimits/read'", rf), go = wrapperT.indexOf('resetCreditGoWaiters.set(idempotencyKey', rd), cons = wrapperT.indexOf("request('account/rateLimitResetCredit/consume'", go);
    ok(rc > 0 && rf > rc && rd > rf && go > rd && cons > go, '§10 READ CENSUS: the wrapper\'s read before a consume sits inside the readFirst gate of the codex-reset-credit handler, the wait for the go follows it, and the consume comes after the wait (the order in the source)', JSON.stringify({ rc, rf, rd, go, cons }));
    const countR = (t) => (strip8(t).match(READ) || []).length;
    ok(!ALLOW_READ['src/server/usage-pool-engine.js'] && countR(engT) === 0 && countR(engT + "\nsetInterval(() => request('account/rateLimits/read', {}), 60e3);\n") === 1, '§10 READ CENSUS CONTROL: a planted read site in the engine is RED (a file outside the rows)');
    ok(countR(wrapperRaw) === 3 && countR(wrapperRaw + "\nconst extra = await request('account/rateLimits/read', {}, 20000);\n") === 4, '§10 READ CENSUS CONTROL: a fourth read in the wrapper is RED (the count is the row)');
    // THE SHAPE CENSUS (verify r10 ⑥): the read census counts a LITERAL method name — a read spelled through a variable, a
    // template literal or a computed string would never match it. So every `request(` in the two carriers must name its
    // method as a string literal; the ONE non-literal call is startThread's closed ternary over three thread verbs
    // (thread/start | thread/resume | thread/fork), pinned by shape. Any other non-literal first argument is RED by shape —
    // the runtime census (test-reset-credit-ui §4b: the stub app-server's own log, reads per press) is the second witness
    {
      const helperRaw = fs.readFileSync(path.join(REPO, 'src/codex-reset-helper.js'), 'utf8');
      const NONLIT = /(?<!function )\brequest\(\s*(?!['"`])([^,)]+)/g; // a CALL whose first argument is not a string literal (the `function request(method, …)` definition is not a call)
      const nonLit = (t) => [...strip8(t).matchAll(NONLIT)].map((m) => m[1].trim());
      const ternaryOk = /const method = resumeId \? \(isFork \? 'thread\/fork' : 'thread\/resume'\) : 'thread\/start';\n  if \(resumeId\) params\.threadId = resumeId;\n  const resp = await request\(method, params, 120000\);/.test(wrapperRaw);
      ok(ternaryOk && JSON.stringify(nonLit(wrapperRaw)) === JSON.stringify(['method']), '§10 SHAPE CENSUS (verify r10 ⑥): every request() in the wrapper names a literal method except startThread\'s closed ternary (thread/start | resume | fork) — a method spelled through a variable elsewhere is RED by shape', JSON.stringify(nonLit(wrapperRaw)));
      ok(nonLit(helperRaw).length === 0, '§10 SHAPE CENSUS: every request() in the helper names a literal method', JSON.stringify(nonLit(helperRaw)));
      const planted = "\nconst m2 = 'account/rateLimits/' + 'read'; const r9 = await request(m2, {}, 20000);\n";
      ok(JSON.stringify(nonLit(wrapperRaw + planted)) === JSON.stringify(['method', 'm2']) && countR(wrapperRaw + planted) === 3, '§10 SHAPE CENSUS CONTROL: a read spelled through a variable keeps the LITERAL count at 3 (the text census is blind to it) and is RED by shape (a non-literal method name)', JSON.stringify(nonLit(wrapperRaw + planted)));
    }
  }
  // verify r2 (Q5): the strace leg below is the REAL witness of the census — it must run in the tier that gates a
  // push. This suite is in ci.mjs's FAST tier (the pre-push tier); on a CI runner a missing strace is RED, never a SKIP
  const ciRows = fs.readFileSync(path.join(REPO, 'scripts/ci.mjs'), 'utf8');
  ok(/\{\s*name:\s*'test-vendor-whitelist',\s*tier:\s*'fast'/.test(ciRows), '§10 TIER PIN: test-vendor-whitelist is in the FAST tier of scripts/ci.mjs (the tier that gates a push) — its strace leg runs before every push');
  // LIVE: the helper over the STUB app-server, an EMPTY CODEX_HOME, under strace — zero internet connections
  const has8 = (bin) => { try { execFileSync('sh', ['-c', `command -v ${bin}`], { stdio: 'pipe' }); return true; } catch { return false; } };
  const onCI = !!(process.env.CI || process.env.GITHUB_ACTIONS);
  if (!has8('strace')) ok(!onCI, onCI ? '§10 LIVE leg: strace is REQUIRED on a CI runner — the leg that gates a push may never SKIP there (install strace on the runner)' : '§10 SKIP live leg: strace is not on PATH — the census + the recorded measurement stand alone (a CI runner would be RED here)');
  else {
    const { writeStub } = await import('./codex-app-server-stub.mjs');
    const tmp8 = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-vwl-helper-'));
    try {
      const stub = writeStub(tmp8);
      const home = path.join(tmp8, 'codex-home'); fs.mkdirSync(home);
      const drv = (extra) => { const f = path.join(tmp8, `drv-${Math.random().toString(36).slice(2)}.cjs`); fs.writeFileSync(f, `'use strict';\n${extra}\nrequire(${JSON.stringify(path.join(REPO, helperRel))}).consumeResetCreditViaAppServer({ idempotencyKey: 'k-vwl-1', env: process.env, cwd: process.env.CODEX_HOME, codexCmd: ${JSON.stringify(stub)}, pressedBy: 'person' }).then((r) => { process.stdout.write(JSON.stringify(r)); setTimeout(() => process.exit(0), 300); });\n`); return f; };
      const traced = (f) => {
        const out = path.join(tmp8, 'trace-' + Math.random().toString(36).slice(2));
        const env8 = { HOME: tmp8, CODEX_HOME: home, PATH: process.env.PATH || '/usr/bin:/bin', STUB_TABLE: path.join(REPO, 'scripts/fixtures/codex-app-server/0.159.3-methods.json'), STUB_LOG: path.join(tmp8, 'rpc.ndjson'), STUB_READ_USED: '0' };
        let res = ''; try { res = execFileSync('strace', ['-f', '-qq', '-e', 'trace=connect', '-o', out, process.execPath, f], { env: env8, timeout: 30000, encoding: 'utf8' }); } catch { }
        let text = ''; try { text = fs.readFileSync(out, 'utf8'); } catch { }
        return { result: (() => { try { return JSON.parse(res); } catch { return null; } })(), inet: text.split('\n').filter((l) => /\bconnect\(/.test(l) && /AF_INET6?/.test(l)).length };
      };
      const live = traced(drv(''));
      ok(live.result && live.result.sent === true && live.result.outcome === 'reset' && live.inet === 0, '§10 LIVE: the helper over the stub (EMPTY CODEX_HOME) consumed and read — and the whole tree opened ZERO internet connections', JSON.stringify(live));
      const ctl8 = traced(drv("const s=require('net').connect(1,'127.0.0.1');s.on('error',()=>{});"));
      ok(ctl8.inet >= 1, '§10 LIVE CONTROL: the same run with one deliberate loopback connect is SEEN (the zero above is a measurement)', JSON.stringify(ctl8));
    } finally { try { fs.rmSync(tmp8, { recursive: true, force: true }); } catch { } }
  }
}

// lane message-facts (B-f066, design 007 S5): THE BACKFILL IS ON DEMAND — the ONE caller of an adapter's `factsOf` is the engine's
// `messageFacts`, reached only from the owner's facts route; no timer, no ingest / pass path, no agent route asks it
{
  const engSrc = engineSource(REPO);
  const calls = [...engSrc.matchAll(/adapter\.factsOf\(/g)].map((m) => m.index);
  const at = engSrc.indexOf('async function messageFacts(');
  const end = engSrc.indexOf('\n  }\n', at);
  const body = engSrc.slice(at, end);
  ok(calls.length === 1 && calls[0] > at && calls[0] < end, 'message-facts: the engine calls an adapter\'s factsOf exactly once, inside messageFacts', JSON.stringify({ calls: calls.length }));
  ok(!/setTimeout|setInterval|\.pass\(|requestRefresh/.test(body), 'message-facts: messageFacts arms no timer and starts no pass');
  const callers = [...engSrc.matchAll(/messageFacts\(/g)].length;
  const routes = ['src/routes/channels.js', 'src/agent-routes.js', 'src/routes/agent-channels.js'].filter((f) => fs.existsSync(path.join(REPO, f))).map((f) => [f, (fs.readFileSync(path.join(REPO, f), 'utf-8').match(/messageFacts\(/g) || []).length]);
  ok(callers === 1 && routes.filter(([, n]) => n).length === 1 && routes.find(([f]) => f === 'src/routes/channels.js')[1] === 1, 'message-facts: messageFacts is reached only from the owner\'s route (src/routes/channels.js), never an agent route', JSON.stringify({ callers, routes }));
  const gm = fs.readFileSync(path.join(REPO, 'src/channels/gmail.js'), 'utf-8');
  ok(!/\.factsOf\(/.test(gm) && /async factsOf\(convId\) \{\n[^\n]*\n\s*const t = await api\(/.test(gm), 'message-facts: gmail\'s factsOf reads through the gate (api: token → pace → meter)');
}

// §FS design 010 (B-c9be, lane channels-full-search): THE VENDOR'S OWN SEARCH IS ASKED ONLY ON A PERSON'S ACT. Its one
// adapter call sits in the engine's `vendorSearch`, reached ONLY from the owner's press route (`searchVendor`) and the
// agent's explicit `--full` (`searchFullFor` ← `searchFor`); `around` only from the owner's sheet and the agent's
// `--around`. No timer, no ingest pass, no keystroke: the client asks the full route only from the dialog's press / its
// scroll sentinel, never from an `input` listener. A derived census over the function bodies + two planted controls.
// Lane vendor-search-memo (.230): the fourth ask is the per-account "Search again" button (a press); the pre-filled
// open only PEEKS at the account's memo (`run('open')` → `peek=1`, never the vendor).
console.log('§FS the full search: the call sites (a press, an explicit --full — never a timer, an ingest, a keystroke)');
{
  const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf-8');
  const bodies = (src) => { const out = new Map(); let cur = null, buf = []; for (const l of src.split('\n')) { const m = /^  (?:async\s+)?function\s+(\w+)\s*\(/.exec(l); if (m) { if (cur) out.set(cur, buf.join('\n')); cur = m[1]; buf = [l]; } else if (cur) buf.push(l); } if (cur) out.set(cur, buf.join('\n')); return out; };
  const callers = (b, re, self) => [...b].filter(([n, x]) => n !== self && re.test(x.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n'))).map(([n]) => n).sort().join();
  const judge = (eng, panel) => {
    const b = bodies(eng);
    const sh = panel.slice(panel.indexOf('function showSearchDialog('), panel.indexOf('/** THE OPTIONS EDITOR:'));
    return {
      adapterSearch: callers(b, /e\.adapter\.search\(/), vendorSearch: callers(b, /\bvendorSearch\(/, 'vendorSearch'), searchFullFor: callers(b, /\bsearchFullFor\(/, 'searchFullFor'),
      adapterAround: callers(b, /e\.adapter\.around\(/), aroundFor: callers(b, /\baroundFor\(/, 'aroundFor'),
      clientRoutes: (panel.match(/\/api\/channels\/search\/full/g) || []).length, keystroke: /addEventListener\('input'/.test(sh), askCalls: (sh.match(/\bask\(st/g) || []).length,
      openPeeks: /if \(initial\) \{ input\.value = initial; run\('open'\); \}/.test(sh) && /ask\(st, null, opening \? 'peek' : null\)/.test(sh),
    };
  };
  const want = { adapterSearch: 'vendorSearch', vendorSearch: 'searchFullFor,searchVendor', searchFullFor: 'searchFor', adapterAround: 'aroundFor', aroundFor: 'aroundOwner,readAroundFor', clientRoutes: 1, keystroke: false, askCalls: 4, openPeeks: true };
  const ENGS = engineSource(REPO), PANEL = read('src/lib/channels-panel.js');
  const j = judge(ENGS, PANEL);
  ok(JSON.stringify(j) === JSON.stringify(want), 'the full search\'s ONE adapter call is reached only from the press route and the agent\'s --full; around only from the sheet and --around; the client asks only on a press / the scroll sentinel / the once-retry / Search again; the open only peeks', JSON.stringify(j));
  const rc = read('src/routes/channels.js'), ar = read('src/agent-routes.js');
  ok((rc.match(/engine\(\)\.searchVendor\(/g) || []).length === 1 && /router\.get\('\/api\/channels\/search\/full'[\s\S]{0,400}engine\(\)\.searchVendor\(/.test(rc) && (rc.match(/engine\(\)\.aroundOwner\(/g) || []).length === 1 && (ar.match(/full: req\.query\.full === '1'/g) || []).length === 1, 'the owner\'s two routes and the agent\'s one flag are the only doors');
  const tickSpot = ENGS.indexOf('  function feedDue(rec, e, t = now()) {');
  const planted = ENGS.slice(0, tickSpot) + "  function feedDue(rec, e, t = now()) {\n    vendorSearch(rec, 'x', {});" + ENGS.slice(tickSpot + '  function feedDue(rec, e, t = now()) {'.length);
  const keyed = PANEL.replace("  go.onclick = run;\n", "  go.onclick = run;\n  input.addEventListener('input', () => { for (const st of []) ask(st); });\n");
  const jp = judge(planted, PANEL), jk = judge(ENGS, keyed);
  ok(tickSpot > 0 && jp.vendorSearch.includes('feedDue') && keyed !== PANEL && jk.keystroke === true && jk.askCalls === 5, 'CONTROL: a vendor search planted in the feed\'s tick, and a keystroke listener in the dialog, are each caught by name', JSON.stringify({ tick: jp.vendorSearch, keystroke: jk.keystroke }));
}

// §FS-G design 010 S6 (lane channels-followups): GMAIL'S FULL SEARCH IS ASKED ONLY THROUGH ITS `search` / `around`. The
// engine half is §FS above (the adapter's `search` reached only from the owner's press route and the agent's --full,
// `around` only from the sheet and --around). Here the adapter half, over src/channels/gmail.js's own units (the
// adapter's methods and create()'s helpers): the request that carries the person's WORDS (`messages.list` with a `q`
// that is not one of the reconcile's own `in:sent` queries) and the per-hit metadata read live in `search` alone; the
// thread read for context in `around` alone; no other unit calls either method (no listing, ingest, push or reconcile
// path searches). Two planted copies prove the census reads what it claims.
console.log('§FS-G design 010 S6: Gmail\'s search requests live in its search / around only');
{
  const units = (src) => {
    const out = new Map(); let cur = null, buf = [];
    const head = (l) => { const m = /^  (?:async\s+)?function\s+(\w+)\s*\(/.exec(l) || /^  const (\w+) = /.exec(l) || /^    (?:async\s+)?([A-Za-z_]\w*)\s*\([^)]*\)\s*\{\s*$/.exec(l) || /^    (?:async\s+)?([A-Za-z_]\w*)\s*\(\{[^)]*\}\s*=\s*\{\}\)\s*\{\s*$/.exec(l); return m ? m[1] : null; };
    for (const l of src.split('\n')) { const n = head(l); if (n) { if (cur) out.set(cur, (out.get(cur) || '') + buf.join('\n')); cur = n; buf = [l]; } else if (cur) buf.push(l); }
    if (cur) out.set(cur, (out.get(cur) || '') + buf.join('\n'));
    return out;
  };
  const code = (x) => x.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*\*)/.test(l)).join('\n');
  const judge = (src) => {
    const u = units(src);
    const where = (pred) => [...u].filter(([, b]) => pred(code(b))).map(([n]) => n).sort().join();
    return {
      words: where((b) => b.split('\n').some((l) => /api\(`\/messages\?/.test(l) && !/in:sent/.test(l))),
      hitRead: where((b) => /'gmail search hit'/.test(b)),
      aroundRead: where((b) => /'gmail thread around'/.test(b)),
      searchCallers: [...u].filter(([n, b]) => n !== 'search' && /(?:this|adapter|impl|a)\.search\(|\bsearch\(\{\s*query/.test(code(b))).map(([n]) => n).sort().join(),
      aroundCallers: [...u].filter(([n, b]) => n !== 'around' && /(?:this|adapter|impl|a)\.around\(/.test(code(b))).map(([n]) => n).sort().join(),
      methods: ['listConversations', 'history', 'search', 'around'].filter((n) => u.has(n)).join(),
    };
  };
  const GS = fs.readFileSync(path.join(REPO, 'src/channels/gmail.js'), 'utf-8');
  const want = { words: 'search', hitRead: 'search', aroundRead: 'around', searchCallers: '', aroundCallers: '', methods: 'listConversations,history,search,around' };
  const j = judge(GS);
  ok(JSON.stringify(j) === JSON.stringify(want), 'gmail.js: the request with the person\'s words and the per-hit metadata read are in `search` only, the context read in `around` only, and no other unit calls either (the units are real: the listing, the history, search, around)', JSON.stringify(j));
  const L0 = '    async listConversations({ cursor = null, limit = 100 } = {}) {\n';
  const H0 = '    async history(convId, { anchor = null, limit = 50 } = {}) {\n';
  const planted = GS.split(L0).length === 2 ? GS.replace(L0, L0 + "      await this.search({ query: 'x' });\n") : null;
  const wordsInHistory = GS.split(H0).length === 2 ? GS.replace(H0, H0 + "      await api(`/messages?${new URLSearchParams({ q: String(convId) })}`, { what: 'x' });\n") : null;
  const jp = planted && judge(planted), jw = wordsInHistory && judge(wordsInHistory);
  ok(jp && jp.searchCallers === 'listConversations' && jw && jw.words === 'history,search', 'CONTROL: a search planted in the listing, and a words query planted in the history read, are each caught by name', JSON.stringify({ planted: jp && jp.searchCallers, words: jw && jw.words }));
}

// ── 12: SLACK'S APP CREATE WITH A PASTED SETUP TOKEN (lane slack-connect-easy, design 017) ──
// One more vendor method, allowlisted HERE with its rules (a function of the source text — a patched copy written by
// scripts/mutant-copy.mjs turns each red):
//   ONE SITE   the method name lives only in src/channels/slack-manifest.js (`CREATE_METHOD`); slack.js builds the request
//              once (`Manifest.createRequest(`) inside `createApp`, a JSON POST with the PASTED token as the Bearer;
//   ONE PER HUMAN ACT  `createApp(` is invoked once — the paste exchange's `create` branch, reached only through
//              `oauth.forwardCallback(` from `finish()` (a person pressed "Create the app"), and the token is dropped in
//              that branch's `finally`;
//   KEPT / DROPPED  the answer's `app_id` (and a workspace when named) is read; `credentials` / `client_secret` /
//              `signing_secret` / `oauth_authorize_url` are never read on this (http) path.
{
  const { mutantCopies, copiesCensus } = await import('./mutant-copy.mjs');
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/([^:'"\\])\/\/[^'"\n]*$/gm, '$1');
  const bodyOf = (S, head) => { const at = S.indexOf(head); if (at < 0) return ''; const end = S.indexOf('\n  }\n', at); return end < 0 ? '' : S.slice(at, end); };
  const census = (slackSrc, serverTexts) => {
    const rows = [];
    const S = strip(slackSrc);
    // a user-facing i18nKey('…') sentence may NAME the method (the registry row's describe); a request cannot be built from one
    const where = []; for (const [rel, text] of Object.entries(serverTexts)) { const n = (strip(text).replace(/i18nKey\('(?:[^'\\]|\\.)*'\)/g, '').match(/apps\.manifest\.create/g) || []).length; if (n) where.push(`${rel}:${n}`); }
    rows.push(['ONE SITE: the method name `apps.manifest.create` appears once in the server tree — slack-manifest.js\'s CREATE_METHOD', where.join() === 'src/channels/slack-manifest.js:1', where.join()]);
    const ca = bodyOf(S, '  async function createApp(setupToken, ownerName) {');
    rows.push(['ONE SITE: slack.js builds the create request once, inside createApp — a JSON POST whose Bearer is the pasted token', (S.match(/Manifest\.createRequest\(/g) || []).length === 1 && /const req = Manifest\.createRequest\(manifest\);/.test(ca) && (S.match(/callSlack\(fetchFn, req\.method, req\.body, \{ token: setupToken, json: true \}\)/g) || []).length === 1 && /callSlack\(fetchFn, req\.method, req\.body, \{ token: setupToken, json: true \}\)/.test(ca), `createApp body ${ca.length} chars`]);
    const calls = (S.match(/(?<![.\w$])createApp\(/g) || []).length;
    rows.push(['ONE PER HUMAN ACT: createApp is invoked once — the paste exchange\'s `create` branch, the token dropped in its finally', calls === 2 && /if \(act\.act === 'create'\) \{\n\s*try \{ return await createApp\(pasted, label\); \} finally \{ pasted = null; \}/.test(S), `bare occurrences ${calls}`]);
    rows.push(['ONE PER HUMAN ACT: the exchange is reached only through finish() → oauth.forwardCallback (a paste)', (S.match(/\.forwardCallback\(/g) || []).length === 2 && /if \(fl && fl\.mode === 'public'\) \{[^\n]*\n\s*const r = await oauth\.forwardCallback\(flowId, typeof pasted === 'string' \? pasted : ''\);/.test(S) && /async finish\(flowId, pasted, \{ box = null \} = \{\}\) \{[\s\S]*?const r = await oauth\.forwardCallback\(flowId, pasted\.trim\(\), \{ box: b \}\);/.test(S), '']);
    // design 018: `client_secret` may name the workspace app's OWN secret only inside callSlack's Basic-auth scrub
    const cs0 = S.indexOf('async function callSlack('), S2 = cs0 < 0 ? S : S.slice(0, cs0) + S.slice(S.indexOf('\n}\n', cs0));
    rows.push(['KEPT / DROPPED: createApp reads the app id and never the credentials, the client / signing secret or the authorize URL', /a\.app_id/.test(ca) && !/credentials|client_secret|signing_secret|verification_token|oauth_authorize_url/.test(ca) && !/\.credentials\b|client_secret|oauth_authorize_url/.test(S2), '']);
    return rows;
  };
  const serverTexts = {};
  for (const f of files) { const rel = path.relative(REPO, f); try { serverTexts[rel] = fs.readFileSync(f, 'utf-8'); } catch { } }
  const slackRel = 'src/channels/slack.js';
  const slackSrc = serverTexts[slackRel];
  ok(typeof slackSrc === 'string' && typeof serverTexts['src/channels/slack-manifest.js'] === 'string', '§12 slack.js and slack-manifest.js are in the server census');
  for (const [name, pass_, detail] of census(slackSrc, serverTexts)) ok(pass_, '§12 ' + name, detail);
  const MUT = mutantCopies('vendor-whitelist-slack', REPO);
  const reds = (rows) => rows.filter((r) => !r[1]).map((r) => r[0]);
  const mut = (tag, from, to) => { if (!slackSrc.includes(from)) return null; const f = MUT.write(slackRel, slackSrc.replace(from, to), tag); return fs.readFileSync(f, 'utf-8'); };
  const keeps = mut('keeps-credentials', '    const appId = typeof a.app_id', '    const kept = a.credentials && a.credentials.client_secret; void kept;\n    const appId = typeof a.app_id');
  ok(keeps && reds(census(keeps, { ...serverTexts, [slackRel]: keeps })).some((n) => /KEPT/.test(n)), '§12 CONTROL: a copy that reads the create\'s credentials is RED');
  const twice = mut('second-caller', '    async listConversations({ cursor = null, limit = 100 } = {}) {\n', '    async listConversations({ cursor = null, limit = 100 } = {}) {\n      if (cursor === \'x\') await createApp(\'\', \'\');\n');
  ok(twice && reds(census(twice, { ...serverTexts, [slackRel]: twice })).some((n) => /ONE PER HUMAN ACT/.test(n)), '§12 CONTROL: a copy that also creates from the conversation listing is RED');
  const keepsToken = mut('no-drop', 'try { return await createApp(pasted, label); } finally { pasted = null; }', 'return await createApp(pasted, label);');
  ok(keepsToken && reds(census(keepsToken, { ...serverTexts, [slackRel]: keepsToken })).some((n) => /ONE PER HUMAN ACT/.test(n)), '§12 CONTROL: a copy that does not drop the setup token is RED');
  // ── 13: THE WORKSPACE APP'S CODE EXCHANGE (lane slack-workspace-app, design 018) ──
  //   ONE SITE   `oauth.v2.access` lives only in slack-manifest.js (`EXCHANGE_METHOD`); slack.js calls it once, inside
  //              `exchangeCode`, the app's id + secret as HTTP Basic and the consent's own redirect_uri beside the code
  //              (Slack refuses a mismatch; with several registered URLs it needs it on both steps);
  //   ONE PER HUMAN ACT  `exchangeCode(` is invoked once — the public begin's `exchange` closure, which oauth-loopback
  //              runs at most once per state (the landing route or a paste);
  //   THE SECRET  `.secret()` is read once, inside that call's arguments — never kept in a variable.
  const census13 = (slackText, texts) => {
    const S = strip(slackText), rows = [];
    // the generated card-words table (src/api-call-words.generated.js ⇐ the vendors' catalogues) NAMES every Slack method as words — it calls none
    const where = []; for (const [rel, text] of Object.entries(texts)) { if (rel === 'src/api-call-words.generated.js') continue; const n = (strip(text).replace(/i18nKey\('(?:[^'\\]|\\.)*'\)/g, '').match(/oauth\.v2\.access/g) || []).length; if (n) where.push(`${rel}:${n}`); }
    rows.push(['ONE SITE: the method name `oauth.v2.access` appears once in the server tree — slack-manifest.js\'s EXCHANGE_METHOD', where.join() === 'src/channels/slack-manifest.js:1', where.join()]);
    const ex = bodyOf(S, '  async function exchangeCode(code, redirectUri, cancelled) {');
    rows.push(['ONE SITE: exchangeCode posts the code with the consent\'s redirect_uri, the app authenticated by HTTP Basic', (S.match(/Manifest\.EXCHANGE_METHOD/g) || []).length === 1 && /callSlack\(fetchFn, Manifest\.EXCHANGE_METHOD, \{ code: String\(code\), \.\.\.\(redirectUri \? \{ redirect_uri: redirectUri \} : \{\}\) \}, \{ basic: \{ id: c\.clientId, secret: c\.secret\(\) \} \}\)/.test(ex), '']);
    const calls13 = (S.match(/(?<![.\w$])exchangeCode\(/g) || []).length;
    rows.push(['ONE PER HUMAN ACT: exchangeCode is invoked once — the public begin\'s exchange closure', calls13 === 2 && /exchange: async \(\{ code, redirectUri, cancelled = null \}\) => exchangeCode\(code, redirectUri, cancelled\),/.test(S), `bare occurrences ${calls13}`]);
    rows.push(['THE SECRET: read once, inside the exchange call\'s arguments', (S.match(/\.secret\(\)/g) || []).length === 1 && !/=\s*c\.secret\(\)/.test(S), '']);
    return rows;
  };
  for (const [name, pass_, detail] of census13(slackSrc, serverTexts)) ok(pass_, '§13 ' + name, detail);
  const noRedirect = mut('no-redirect', '{ code: String(code), ...(redirectUri ? { redirect_uri: redirectUri } : {}) }', '{ code: String(code) }');
  ok(noRedirect && reds(census13(noRedirect, { ...serverTexts, [slackRel]: noRedirect })).some((n) => /ONE SITE: exchangeCode/.test(n)), '§13 CONTROL: a copy that drops the redirect_uri from the exchange is RED');
  const twice13 = mut('exchange-twice', '    async listConversations({ cursor = null, limit = 100 } = {}) {\n', '    async listConversations({ cursor = null, limit = 100 } = {}) {\n      if (cursor === \'x\') await exchangeCode(\'c\', null, null);\n');
  ok(twice13 && reds(census13(twice13, { ...serverTexts, [slackRel]: twice13 })).some((n) => /ONE PER HUMAN ACT/.test(n)), '§13 CONTROL: a copy that also exchanges from the conversation listing is RED');
  const keeps13 = mut('keeps-secret', '    const c = workspaceClient();\n    let r;\n    try { r = await callSlack(fetchFn, Manifest.EXCHANGE_METHOD', '    const c = workspaceClient();\n    const kept = c.secret(); void kept;\n    let r;\n    try { r = await callSlack(fetchFn, Manifest.EXCHANGE_METHOD');
  ok(keeps13 && reds(census13(keeps13, { ...serverTexts, [slackRel]: keeps13 })).some((n) => /THE SECRET/.test(n)), '§13 CONTROL: a copy that keeps the secret in a variable is RED');
  for (const x of copiesCensus(MUT.files, MUT.dir, REPO, { minCopies: 3, label: '§12 ' })) ok(x.pass, x.name + (x.pass ? '' : ' — ' + x.detail));
}

// §14 B-2198 THE CHANNELS RAW API (docs/design-channel-raw-api.md) — the ONE allow-listed pass-through vendor surface:
// src/server/channel-api.js constructs vendor requests at ONE site (`vendorFetch`), only to the hosts the credential's
// DECLARED row names (an adapter's `api` row beside its `apiBearer`; the storage mounts' row + its `refresh` token
// endpoint — lane channel-api-declared: the core names no vendor), never following a redirect, and only behind
// the grant (`tierNow(ctx`) and the account's meter (`c.gate()` / `c.charge()`); no other file reaches `rawApi`'s fetch.
// Controls: the host gate cut, the meter cut, the grant cut — each RED.
console.log('§14 the Channels raw API: ONE fetch site, the host table, the grant, the account meter');
{
  const rel = 'src/server/channel-api.js';
  const src0 = fs.readFileSync(path.join(REPO, rel), 'utf8');
  const fence = fs.readFileSync(path.join(REPO, 'src/channel-api.js'), 'utf8');
  const census14 = (src) => {
    const bad = [];
    const sites = (src.match(/\bfetchFn\(/g) || []).length;
    if (sites !== 1) bad.push(`${sites} fetch sites — exactly ONE (vendorFetch)`);
    // a raw global fetch( beside fetchFn (redirects followed, no host table) is a second site too (verify r1)
    const raw = (src.match(/(?<![\w.])fetch\(/g) || []).length;
    if (raw) bad.push(`${raw} raw fetch( call(s) — every vendor request goes through vendorFetch`);
    const vf = (src.match(/\n  function vendorFetch\([\s\S]*?\n  \}/) || [''])[0];
    if (!/if \(u\.protocol !== 'https:' \|\| !hosts\.has\(u\.host\)\) throw/.test(vf)) bad.push('THE HOST TABLE gate is gone from vendorFetch');
    if (!/redirect: 'manual'/.test(vf)) bad.push('vendorFetch follows redirects (THE REDIRECT RULE)');
    const call = (src.match(/\n  async function call\([\s\S]*?\n  \}\n/) || [''])[0];
    const iGate = call.indexOf('const g = c.gate();'), iRun = call.indexOf('await run(');
    if (iGate < 0 || iRun < 0 || iGate > iRun || !/if \(g\) \{/.test(call)) bad.push('THE ACCOUNT METER (c.gate) is not asked before the run');
    if (!/const tr = tierNow\(ctx, cred\);\n    const c = tr\.tier !== 'none' \? credentialOf\(cred\) : null;\n    if \(!c\) return NOT_GRANTED\(\);/.test(call)) bad.push('THE GRANT (tierNow) is not asked before the credential is resolved');
    const runB = (src.match(/\n  async function run\([\s\S]*?\n  \}\n/) || [''])[0];
    if (!/c\.charge\(\);\n\s+res = await vendorFetch\(/.test(runB)) bad.push('a vendor request is not charged to the account meter');
    return bad;
  };
  ok(census14(src0).length === 0, '§14 the raw API: ONE fetch site behind the host table, no redirect, the grant, the account meter', census14(src0).join('; '));
  ok(src0.includes('await vendorFetch(row.refresh,') && census14(src0.replace('await vendorFetch(row.refresh,', 'await fetch(row.refresh,')).length > 0, 'CONTROL: §14 a raw fetch( planted beside vendorFetch (the mount refresh) is red (verify r1)');
  // THE HOSTS ARE DERIVED FROM THE DECLARATIONS (never a second hand list): every adapter module's `api` row + the mounts'
  const chDir = path.join(REPO, 'src/channels');
  const declared = [...fs.readdirSync(chDir).filter((f) => /\.js$/.test(f)).map((f) => require(path.join(chDir, f))).filter((m) => m && m.adapter && m.adapter.api).map((m) => ({ who: m.adapter.kind, row: m.adapter.api })),
    ...Object.entries(require(path.join(REPO, 'src/mounts.js')).MountManager.OAUTH_API).map(([v, row]) => ({ who: `mount-${v}`, row }))];
  const reach = declared.flatMap(({ who, row }) => [...row.hosts, ...(row.refresh ? [new URL(row.refresh).host] : [])].map((h) => `${who}:${h}`));
  const hostLit = /['"`](https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|cn|net|org|io|ai|dev|app)\b/i;
  ok(declared.length >= 4 && !reach.some((x) => /anthropic|claude\.ai/i.test(x)) && !/anthropic|claude\.ai/i.test(fence + src0) && !hostLit.test(fence) && !hostLit.test(src0), `§14 the hosts are the DECLARED rows' (${declared.map((d) => d.who).join(', ')}) — no Anthropic endpoint among them, and the fence + orchestrator hold no host literal`, reach.join(' '));
  const others = fs.readdirSync(path.join(REPO, 'src'), { recursive: true }).map((f) => `src/${f}`).filter((f) => /\.js$/.test(f) && f !== rel && /\brawApi\b/.test(fs.readFileSync(path.join(REPO, f), 'utf8')) && /\bvendorFetch\(/.test(fs.readFileSync(path.join(REPO, f), 'utf8')));
  ok(others.length === 0, '§14 no other file calls the raw API\'s vendorFetch', others.join(', '));
  const cut = (a, b) => (src0.split(a).length === 2 ? src0.replace(a, b) : null);
  const ctl = [
    ['the host gate cut', cut(" || !hosts.has(u.host)) throw", ") throw"), /HOST TABLE/],
    ['the meter cut', cut("    const g = c.gate();\n    if (g) {", "    const g = null;\n    if (g) {"), /ACCOUNT METER/],
    ['the grant cut', cut("    const c = tr.tier !== 'none' ? credentialOf(cred) : null;", "    const c = credentialOf(cred);"), /THE GRANT/],
    ['the charge cut', cut("        c.charge();\n", ""), /charged/],
  ];
  const r = ctl.map(([n, s, re]) => ({ n, red: !!s && census14(s).some((x) => re.test(x)) }));
  ok(r.every((x) => x.red), `§14 CONTROLS: ${r.map((x) => `${x.n} (${x.red ? 'RED' : 'missed'})`).join(', ')}`);
}

// §15 THE LISTED-PROVIDER REFRESH (lane models-at-session, design q-053 r1 §3 — the owner 2026-10-20: a provider's model list,
// fetched where the provider lists them): ONE new vendor request — a GET of a third-party provider's /models (OpenRouter, an
// OpenAI-compatible base) in src/server/provider-models.js (the ALLOW row above, its marker PROVIDER_MODELS beside the one
// request). Its THREE gates, each pinned here as a function of the source or of the running module (each control RED):
//   (a) A PERSON'S PRESS — `refreshListedModels(` is called from exactly ONE place in the server tree: the POST door
//       /api/providers/:id/models/refresh (src/routes/provider-models.js), whose handler asks personVerdict(req) before it and
//       says `by: 'human'`; the module refuses a call that does not; no timer anywhere near it (the module and the door's file
//       hold none). CONTROLS: a copy calling it from a setInterval in the wiring (a TIMER-DRIVEN refresh), a copy calling it
//       from an /api/agent/ route (an AGENT's door), the door without its personVerdict, a timer planted in the module
//   (b) THE VAULT OPEN — the REAL module, a locked vault: the loopback fake is never asked (CONTROL: a copy of the verdict that
//       skips the vault asks it)
//   (c) ONCE A MINUTE per provider — the REAL module: two presses inside the minute ⇒ ONE request (CONTROL: a copy of the
//       verdict without its cooldown — an UNTHROTTLED refresh — asks twice); and (d) the answer CACHED on the record
//       (providers.setListed, fetchedAt) — never asked at a menu, a spawn or a boot
console.log('§15 the listed-provider refresh: a person\'s press · the vault · once a minute · cached');
{
  const MOD = 'src/server/provider-models.js', DOOR = 'src/routes/provider-models.js', WIRE = 'src/server/account-usage-routes.js';
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/([^:'"\\])\/\/[^'"\n]*$/gm, '$1');
  const TIMER = /\b(?:setTimeout|setInterval|setImmediate|cron|schedule)\s*\(/;
  const texts0 = Object.fromEntries(files.map((f) => { try { return [path.relative(REPO, f), fs.readFileSync(f, 'utf-8')]; } catch { return [path.relative(REPO, f), '']; } }));
  // → the census's findings (an empty list = green)
  const census15 = (texts) => {
    const bad = [];
    const callers = Object.entries(texts).flatMap(([rel, t]) => (strip(t).match(/\brefreshListedModels\s*\(/g) || []).map(() => rel));
    const mod = strip(texts[MOD] || ''), door = strip(texts[DOOR] || '');
    if (!/async function refreshListedModels\s*\(/.test(mod)) bad.push('the module defines refreshListedModels');
    const outside = callers.filter((rel) => rel !== MOD && rel !== DOOR);
    if (outside.length) bad.push(`ONE CALLER: refreshListedModels( called outside the door (${outside.join(', ')})`);
    if (callers.filter((rel) => rel === DOOR).length !== 1) bad.push(`ONE CALLER: the door's file calls it ${callers.filter((rel) => rel === DOOR).length} time(s) (exactly 1)`);
    if (callers.filter((rel) => rel === MOD).length !== 1) bad.push('ONE CALLER: the module calls itself');
    const at = door.indexOf("app.post('/api/providers/:id/models/refresh'"), call = door.indexOf('refreshListedModels(');
    const handler = at >= 0 ? door.slice(at, door.indexOf('\n  });', at)) : '';
    if (at < 0 || !(call > at && call < at + handler.length)) bad.push('THE DOOR: the call lies inside POST /api/providers/:id/models/refresh');
    if (!/const who = personVerdict\(req\);\s*\n\s*if \(!who\.ok\) return res\.status\(403\)/.test(handler) || handler.indexOf('personVerdict(req)') > handler.indexOf('refreshListedModels(')) bad.push('A PERSON: the door asks personVerdict(req) (an agent\'s token / another site ⇒ 403) BEFORE the call');
    if (!/refreshListedModels\(String\(req\.params\.id\), \{ by: 'human' \}\)/.test(handler)) bad.push('A PERSON: the door says by: \'human\'');
    if (/['"`]\/api\/agent\//.test(door)) bad.push('A PERSON: the door\'s file registers no /api/agent/ route');
    if (!mod.includes("if (by !== 'human') return { ok: false, code: 'human_only' };")) bad.push('A PERSON: the module refuses a call that does not say a person pressed');
    for (const rel of [MOD, DOOR]) if (TIMER.test(strip(texts[rel] || ''))) bad.push(`NO TIMER: ${rel} holds a timer`);
    for (const rel of [...new Set(callers)]) if (rel !== MOD && rel !== DOOR && TIMER.test(strip(texts[rel]))) bad.push(`NO TIMER: ${rel} calls it beside a timer`);
    const verdict = mod.indexOf('MP.refreshVerdict('), key = mod.indexOf('keyOf(provider.keyRef)'), req = mod.indexOf('await fetch(');
    if (!(verdict > 0 && key > verdict && req > key) || !/vault: vaultState\(\)/.test(mod)) bad.push('THE VAULT + THE MINUTE: the PURE verdict (vault, cooldown, in flight) is asked BEFORE the key is read and the request sent');
    if (!/providers\.setListed\(provider\.id, parsed\.rows, now\(\)\)/.test(mod)) bad.push('THE CACHE: the answer is kept on the record (setListed, fetchedAt)');
    return bad;
  };
  const found = census15(texts0);
  ok(found.length === 0, '§15 the census on the tree: ONE caller (the door), a person\'s press, no timer, the verdict before the key and the request, the cache', found.join('; '));
  ok(constructions[MOD] === 1 && ALLOW[MOD] && ALLOW[MOD].max === 1, `§15 ${MOD}: exactly ONE vendor request construction (the PROVIDER_MODELS marker beside it: ${constructions[MOD]})`);
  const plant = (rel, from, to) => { const t = texts0[rel] || ''; const n = t.split(from).length - 1; return n === 1 ? { ...texts0, [rel]: t.replace(from, to) } : null; };
  const WIRE_AT = "  require('../routes/provider-models.js').registerProviderModelRoutes(";
  const DOOR_AT = "  app.post('/api/providers/:id/models/refresh',";
  const MOD_AT = '  return { refreshListedModels };';
  const controls = [
    ['a TIMER-DRIVEN refresh (a setInterval in the wiring)', plant(WIRE, WIRE_AT, "  setInterval(() => refresher.refreshListedModels('pv-openrouter', { by: 'human' }), 3600e3);\n" + WIRE_AT), /ONE CALLER|NO TIMER/],
    ['a refresh from an AGENT route', plant(DOOR, DOOR_AT, "  app.post('/api/agent/provider-models', async (req, res) => res.json(await refresher.refreshListedModels(String(req.body.id), { by: 'human' })));\n" + DOOR_AT), /ONE CALLER|A PERSON/],
    ['the door without its personVerdict', plant(DOOR, "    const who = personVerdict(req);\n    if (!who.ok) return res.status(403).json({ error: 'only a person on this page can refresh a provider’s list', code: who.code });\n", ''), /A PERSON/],
    ['a timer inside the module', plant(MOD, MOD_AT, "  setInterval(() => refreshListedModels('pv-openrouter', { by: 'human' }), 60e3);\n" + MOD_AT), /NO TIMER|ONE CALLER/],
    ['the module that takes any caller', plant(MOD, "    if (by !== 'human') return { ok: false, code: 'human_only' };\n", ''), /A PERSON/],
  ];
  const r15 = controls.map(([n, t, re]) => ({ n, red: !!t && census15(t).some((x) => re.test(x)) }));
  ok(r15.every((x) => x.red), `§15 CONTROLS: ${r15.map((x) => `${x.n} (${x.red ? 'RED' : 'missed'})`).join(' · ')}`);

  // (b) + (c): the RUNNING module against a loopback fake of a provider's list — the hit count is the witness
  const http = await import('node:http');
  const Mod = (await import('node:module')).default;
  let hits = 0;
  const fakeSrv = http.createServer((req, res) => { hits++; res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ data: [{ id: 'vendor/model-a' }] })); });
  await new Promise((r) => fakeSrv.listen(0, '127.0.0.1', r));
  const scratch15 = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-vw15-'));
  try {
    const MPsrc = fs.readFileSync(path.join(REPO, 'src/model-providers.js'), 'utf-8'), PMsrc = fs.readFileSync(path.join(REPO, MOD), 'utf-8');
    const compile = (src, file, swap = null) => { const m = new Mod(file); m.filename = file; m.paths = Mod._nodeModulePaths(path.dirname(file)); if (swap) m.require = (id) => (id === '../model-providers.js' ? swap : require(id.startsWith('.') ? path.resolve(path.dirname(file), id) : id)); m._compile(src, file); return m.exports; };
    const mpOf = (from, to) => { if (from && MPsrc.split(from).length !== 2) throw new Error('§15 anchor missing: ' + from); return compile(from ? MPsrc.replace(from, to) : MPsrc, path.join(REPO, 'src/model-providers.js')); };
    const run = async (MP, { vault = 'unlocked', presses = 2 } = {}) => {
      const dataDir = fs.mkdtempSync(path.join(scratch15, 'd-'));
      const PS = compile(fs.readFileSync(path.join(REPO, 'src/server/provider-store.js'), 'utf-8'), path.join(REPO, 'src/server/provider-store.js'), MP);
      const store = PS.create({ dataDir, log: () => { } });
      store.put({ id: 'pv-openrouter', kind: 'openrouter', label: 'OpenRouter', baseUrl: `http://127.0.0.1:${fakeSrv.address().port}/api/v1`, modelsSource: 'listed', listedBy: 'provider-api' });
      const PM = compile(PMsrc, path.join(REPO, MOD), MP);
      const r = PM.create({ providers: store, vaultState: () => vault, now: () => 1792494000000, log: () => { } });
      hits = 0;
      const out = [];
      for (let i = 0; i < presses; i++) out.push(await r.refreshListedModels('pv-openrouter', { by: 'human' }));
      return { hits, out, kept: store.get('pv-openrouter') };
    };
    const real = await run(mpOf());
    ok(real.hits === 1 && real.out[0].ok && real.out[1].code === 'cooldown' && real.kept.fetchedAt === 1792494000000 && real.kept.models[0].id === 'vendor/model-a', '§15 (c)+(d) THE REAL MODULE: two presses inside the minute ⇒ ONE request; the second refused (cooldown); the answer kept with fetchedAt', { hits: real.hits, out: real.out.map((o) => o.code || 'ok') });
    const loose = await run(mpOf('  if (wait > 0) return { ok: false, code: \'cooldown\', retryAfterMs: wait };\n', ''));
    ok(loose.hits === 2, '§15 CONTROL: an UNTHROTTLED refresh (the verdict\'s cooldown taken out) asks the provider TWICE inside the minute (RED: > 1)', loose.hits);
    const locked = await run(mpOf(), { vault: 'locked', presses: 1 });
    const open = await run(mpOf("  if (vault !== 'unlocked') return { ok: false, code: vault === 'not_set_up' ? 'vault_not_set_up' : 'vault_locked' };\n", ''), { vault: 'locked', presses: 1 });
    ok(locked.hits === 0 && locked.out[0].code === 'vault_locked' && open.hits === 1, '§15 (b) THE VAULT: locked ⇒ the provider never asked (vault_locked); CONTROL: a verdict that skips the vault asks it (RED)', { locked: locked.hits, open: open.hits });
  } finally { fakeSrv.close(); fs.rmSync(scratch15, { recursive: true, force: true }); }
}

console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
