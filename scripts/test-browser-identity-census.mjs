#!/usr/bin/env node
// THE IDENTITY CENSUS (identity verify round 3, 2026-09-28 — the CENSUS round). Round 1 fenced a remote key on the PATCH;
// round 2 found the same remote session admitted at three OTHER doors. Round 1 stripped one agent route; round 2 found
// four more answers naming other conversations. Twice the fix was ONE example while its siblings stayed open — so this
// round ships a CENSUS GATE + a SERVER BELT, not a fifth example:
//   ① THE ADMISSION CENSUS (static, grep-derived over the keeper's text): every site that creates / re-carries a lease,
//      writes a pin, or writes a profile's `owner` list is inside a KNOWN function, and inside it the ONE fence —
//      `isRemoteKey` (remoteSessionRefusal) + `decideAttach` / `mayAttach` (whoMayUse) — comes BEFORE the write. A new
//      site the table does not know is RED by name. CONTROLS: a keeper copy with a raw `joinRaw` door; a copy whose
//      `attach` lost its remote fence.
//   ② THE ADMISSION CALLERS CENSUS: the routes / ws-create / the trace routes / the stream bridge / the bindings writer
//      reach a lease or a list only through the keeper's fenced primitives (`attach` / `setPin` / `copyPin` /
//      `ensureEphemeral` / `updateProfile`), each caller KNOWN; `reshapeStore` / `_reg` (the raw doors) are called by
//      migrations and suites only; the bindings' `record` has one caller (session-stdout's meta choke point) and its
//      two refusals. CONTROL: a routes copy with an unknown `k.attach(` caller.
//   ③ THE AGENT-VIEW CENSUS: the belt `router.use(AGENT_PREFIX, agentBelt)` precedes EVERY `/api/agent/browser/*`
//      registration; every agent route's answer is `res.json` (never `send` / `end`); the routes that answer records
//      call the PURE view; every route has a row in ④'s walk table and every CLI call names a registered route.
//      CONTROLS: a raw route registered before the belt; a `/profiles` answering `k.list()` raw.
//   ④ THE RUNTIME JSON WALK over the REAL keeper + routes + mediator (a fake 0.38.1): A admitted (a helper, an
//      ephemeral, a mediated grant, a drive claim, a takeover), B not, R on another machine — every answer for B and R
//      walked recursively: no string equals A's browser key / webui id / conversation id / pid / bs-session id / helper
//      key, except under `$.drivers.*` (owner ruling A (2), THE one exception — pinned present and the ONLY one); the
//      shipped CLI's stdout for B likewise. CONTROLS: the routes WITHOUT the belt + a raw route ⇒ RED; the real belt +
//      the same raw route ⇒ GREEN (a route written raw tomorrow is still safe); a belt copy with a second exception ⇒ RED.
//   ⑤ THE SWITCH (r3's finding): an agent the list keeps out switched a profile's backend DIRECTLY (the rule read the
//      pre-list `owner.kind === 'session'`); now `admitted` (the ONE admission) decides — PURE table + the keeper over the
//      wired-cloak world + a remote session; CONTROL: the pre-fix rule restored in a copy.
// Fast: in-process, port 0, scratch dirs only, no real browser, no vendor call (~3 s).
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = new URL('..', import.meta.url).pathname;
const B = require('../src/browser-profiles.js');
const K = require('../src/server/browser-keeper.js');
const F = require('../src/browser-facts.js');
const S = require('../src/browser-stream.js');
const SW = require('../src/browser-switch.js');
const BE = require('../src/server/browser-env.js');
const MED = require('../src/server/cdp-mediator.js');
const express = require('express');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1200) : '')); } return !!c; };
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const stripComments = (src) => src.split('\n').map((l) => (/^\s*(\/\/|\*|\/\*)/.test(l) ? '' : l)).join('\n');

const ROOT = scratch('browser-idcensus');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const XDG = scratch('browser-idcensus-x'); fs.mkdirSync(XDG, { recursive: true, mode: 0o700 });
function cleanup() {
  try { for (const n of ['launches.log', 'connects.log']) for (const l of fs.readFileSync(path.join(ROOT, 'ab', n), 'utf8').trim().split('\n').filter(Boolean)) { try { process.kill(JSON.parse(l).pid, 'SIGKILL'); } catch { } } } catch { /* none */ }
  for (const d of [ROOT, XDG]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* next run */ } }
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(130); });
const M = mutantCopies('browser-idcensus', REPO);

// ═══ ① THE ADMISSION CENSUS ════════════════════════════════════════════════
console.log('— ① THE ADMISSION CENSUS: every lease / pin / owner-list write in the keeper is inside a known function, behind the ONE fence');
/** The keeper's functions at the closure's indent: name → its text (up to the next such function or the api object). */
function keeperFunctions(src) {
  const lines = src.split('\n');
  const heads = [];
  lines.forEach((l, i) => { const m = /^  (?:async )?function ([A-Za-z_$][\w$]*)\(/.exec(l); if (m) heads.push({ name: m[1], at: i }); if (/^  const api = \{/.test(l)) heads.push({ name: '(api)', at: i }); });
  const out = new Map();
  heads.forEach((h, i) => { const end = i + 1 < heads.length ? heads[i + 1].at : lines.length; out.set(h.name, { at: h.at + 1, text: lines.slice(h.at, end).join('\n') }); });
  return out;
}
/** Every write site of the admission class in the keeper's text (comment lines dropped) with its enclosing function. */
const SITE_RES = [
  ['lease-push', /reg\.leases\.push\(/g], ['lease-set', /reg\.leases = /g], ['pin-write', /reg\.pins\[[^\]]+\] = /g], ['owner-write', /\bp\.owner = /g],
  ['owner-with-conversation', /B\.ownerWithConversation\(/g], ['decide-attach', /B\.decideAttach\(/g], ['grant', /mediator\.grantFor\(/g],
];
function admissionSites(src) {
  const clean = stripComments(src);
  const fns = keeperFunctions(clean);
  const lines = clean.split('\n');
  const sites = [];
  lines.forEach((l, i) => { for (const [kind, re] of SITE_RES) if (new RegExp(re.source).test(l)) { let fn = '(top)'; for (const [name, f] of fns) if (f.at <= i + 1 && i + 1 < f.at + f.text.split('\n').length) fn = name; sites.push({ kind, line: i + 1, fn }); } });
  return { sites, fns };
}
/** THE KNOWN TABLE: function → the fence evidence its text must carry, IN ORDER (each needle after the previous). */
const KNOWN_KEEPER = {
  attach: { why: 'THE admission: the remote fence first, then the list (decideAttach → mayAttach), then the lease', order: ['isRemoteKey(browserKey)', 'B.remoteSessionRefusal(', 'B.decideAttach(', 'reg.leases.push(d.lease)', 'mediator.grantFor('] },
  addConversation: { why: 'THE add: the remote fence, then the list judged, then the owner written', order: ['isRemoteKey(browserKey, remote)', 'B.mayAttach(', 'B.ownerWithConversation(', 'p.owner = owner'] },
  setPin: { why: 'a USER pick writes the list through addConversation before the pin; an AGENT pin is judged by mayAttach', order: ["by === 'agent'", 'B.mayAttach(', 'addConversation(p, browserKey, facts, { remote })', 'reg.pins[browserKey] = '], never: ['B.ownerWithConversation(', 'p.owner ='] },
  copyPin: { why: 'a fork\'s COPY of a pin: a preference carried, never an authorization', order: ['reg.pins[toKey] = '], never: ['B.ownerWithConversation(', 'p.owner =', 'reg.leases'] },
  // the .196 integration (lane-browser-key's late key): the spawn's WITNESSED pick restored under a late key — a preference
  // like copyPin's, so it writes the pin alone: never an owner (a witness widens nothing), never a lease
  restorePin: { why: 'the late key restores the pick its spawn WITNESSED at the start: a preference, never an owner, never a lease', order: ['B.isPinWitness(witness)', 'reg.pins[browserKey] = '], never: ['B.ownerWithConversation(', 'p.owner =', 'reg.leases', 'addConversation('] },
  ensureEphemeral: { why: 'a conversation\'s OWN managed browser: the record it leases is the one whose owner is its key', order: ["isEph(x) && x.owner.id === bk", "owner: { kind: 'conversation', id: bk }", 'reg.leases.push(l)'] },
  updateProfileNow: { why: 'the PATCH: a remote key is never a known key, the list is judged by usePatchVerdict, then the owner written, then the leases re-judged', order: ['knownKeysOf(p, opts.knownKeys)', 'B.usePatchVerdict(', 'p.owner = v.owner', 'rejudgeLeases('] },
  detach: { why: 'a removal', order: ['reg.leases = d.remaining'] },
  dropChild: { why: 'a removal (a helper\'s leases go with it)', order: ['reg.leases = reg.leases.filter('] },
  reconcile: { why: 'the boot sweep keeps what the PURE reconcile kept — never adds', order: ['reg.leases = r.kept'] },
  removeProfile: { why: 'a delete CLEARS every pin naming it (the cleared mark)', order: ['reg.pins[k] = { profileId: null'] },
  clearPin: { why: 'a clear (the cleared mark)', order: ['reg.pins[bk] = { profileId: null'] },
  streamPortFor: { why: 'the live view\'s mediated grant is for the TARGET\'s session — a target streamTargetFor built over the session\'s own attachment set (②)', order: ['target.sessionName', 'mediator.grantFor('] },
};
function judgeAdmission(src) {
  const { sites, fns } = admissionSites(src);
  const unknown = sites.filter((s) => !KNOWN_KEEPER[s.fn]).map((s) => `${s.kind} at line ${s.line} in ${s.fn}`);
  const fence = [];
  for (const [name, rule] of Object.entries(KNOWN_KEEPER)) {
    const f = fns.get(name);
    if (!f) { fence.push(`${name}: the function is gone (the table names it)`); continue; }
    let pos = -1;
    for (const needle of rule.order) { const i = f.text.indexOf(needle, pos + 1); if (i < 0) { fence.push(`${name}: "${needle}" is missing or out of order (${rule.why})`); break; } pos = i; }
    for (const n of rule.never || []) if (f.text.includes(n)) fence.push(`${name}: must never contain "${n}" (${rule.why})`);
  }
  return { sites, unknown, fence };
}
const ksrc = read('src/server/browser-keeper.js');
{
  const v = judgeAdmission(ksrc);
  const fnsHit = [...new Set(v.sites.map((s) => s.fn))].sort();
  ok(v.sites.length >= 16 && !v.unknown.length, `every admission-class write site in the keeper (${v.sites.length}: ${SITE_RES.map(([k]) => k).join(' / ')}) is inside a KNOWN function — ${fnsHit.join(', ')}`, v.unknown);
  ok(!v.fence.length, `…and in every known function the fence comes BEFORE the write (attach: remote refusal → decideAttach → lease → grant; addConversation: remote → mayAttach → owner; setPin: agent judged / user adds first; copyPin and the sweeps never write an owner; ensureEphemeral leases its own record; the PATCH judges by usePatchVerdict and re-judges)`, v.fence);
  ok(v.sites.filter((s) => s.kind === 'grant').every((s) => s.fn === 'attach' || s.fn === 'streamPortFor'), 'a mediator grant is minted only inside `attach` (after decideAttach) and `streamPortFor` (for a target over the session\'s own set)', v.sites.filter((s) => s.kind === 'grant'));
  // isRemoteKey itself: the wiring's rule (a live session on another machine), never a branch on hostId inside the keeper
  ok(/const isRemoteKey = \(browserKey, remote = false\) => \{ if \(remote\) return true; try \{ const v = remoteKeys\(\);/.test(ksrc) && !/hostId\s*\|\|\s*\w+\.host\b/.test(stripComments(ksrc).split('\n').filter((l) => /isRemoteKey/.test(l)).join('\n')), 'isRemoteKey reads the wiring\'s `remoteKeys()` set (or the caller\'s explicit `remote`), never a hostId branch of its own');
  // CONTROL (a): a raw door added to the keeper — a new function pushing a lease without any fence ⇒ unknown site RED
  const rawDoor = ksrc.replace('  function detach({ profileId, profile: ref, browserKey, by = \'agent\' } = {}) {', "  function joinRaw(profileId, browserKey) { reg.leases.push({ profileId, browserKey, since: now() }); commit(); }\n  function detach({ profileId, profile: ref, browserKey, by = 'agent' } = {}) {");
  const va = judgeAdmission(rawDoor);
  ok(rawDoor !== ksrc && va.unknown.length === 1 && /lease-push .* in joinRaw/.test(va.unknown[0]), 'CONTROL (a): a keeper copy with a raw `joinRaw` door that pushes a lease outside the fence is RED by name', va.unknown);
  M.write('src/server/browser-keeper.js', rawDoor, 'raw-door'); // written (the census discipline: every control is a copy outside the tree), judged as text
  // CONTROL (b): attach without its remote fence ⇒ the fence-order leg RED naming attach
  const noFence = ksrc.replace(/    if \(isRemoteKey\(browserKey\)\) \{\n      const rr = B\.remoteSessionRefusal\(\{ label: p\.label \}\);[\s\S]*?throw namedError\(rr\.code, rr\.error, \{ remedy: rr\.remedy \}\);\n    \}\n/, '');
  const vb = judgeAdmission(noFence);
  ok(noFence !== ksrc && vb.fence.some((x) => /^attach: "isRemoteKey\(browserKey\)"/.test(x)), 'CONTROL (b): a keeper copy whose `attach` lost the remote fence is RED (attach named, the missing needle named)', vb.fence);
  M.write('src/server/browser-keeper.js', noFence, 'no-remote-fence');
  // CONTROL (c): setPin writing the owner itself (the list written beside the ONE add) ⇒ RED
  const pinWrites = ksrc.replace("    reg.pins[browserKey] = { profileId: p.id, origin, at: now(), by: by === 'agent' ? 'agent' : 'user' };", "    p.owner = B.ownerWithConversation(p, browserKey) || p.owner;\n    reg.pins[browserKey] = { profileId: p.id, origin, at: now(), by: by === 'agent' ? 'agent' : 'user' };");
  const vc = judgeAdmission(pinWrites);
  ok(pinWrites !== ksrc && vc.fence.some((x) => /^setPin: must never contain/.test(x)), 'CONTROL (c): a keeper copy whose `setPin` writes the owner list itself (a second writer beside addConversation) is RED', vc.fence);
  M.write('src/server/browser-keeper.js', pinWrites, 'pin-writes-owner');
}

// ═══ ② THE ADMISSION CALLERS CENSUS ════════════════════════════════════════
console.log('— ② THE CALLERS: routes / ws-create / trace routes / stream bridge / bindings reach a lease or a list only through the keeper\'s fenced primitives');
const CALLER_FILES = ['src/routes/browser.js', 'src/routes/browser-trace.js', 'src/ws-create.js', 'src/server/browser-bindings.js', 'src/server/cdp-mediator.js', 'src/server/browser-stream.js', 'src/server/browser-trace.js', 'src/server/browser-handback.js', 'src/server/browser-helpers.js', 'src/server/browser-env.js', 'src/server/browser-backend.js', 'src/server/mounts-plugins-wiring.js', 'src/server/session-stdout.js', 'src/server/browser-key.js', 'server.js'];
const CALL_RE = /\b(?:k|keeper|kp|keeper\(\))\??\.(attach|setPin|copyPin|restorePin|ensureEphemeral|addConversation|updateProfile|rejudgeLeases)\(/g;
function callerSites(rel, src) {
  const clean = stripComments(src);
  const out = [];
  clean.split('\n').forEach((l, i) => { for (const m of l.matchAll(CALL_RE)) out.push({ file: rel, line: i + 1, prim: m[1], text: l.trim() }); });
  return out;
}
/** THE KNOWN CALLERS: primitive → [file, a needle of the calling line, why]. */
const KNOWN_CALLERS = [
  ['attach', 'src/routes/browser.js', "by: 'user'", 'POST /api/browser/attach — the user\'s attach (adds through the keeper, fenced there)'],
  ['attach', 'src/routes/browser.js', "by: 'pin'", 'attachPin — a bare command opening the conversation\'s own pin through the keeper'],
  ['attach', 'src/routes/browser.js', "alias: req.body?.alias });", 'POST /api/agent/browser/use'],
  ['attach', 'src/routes/browser.js', 'profileId: v.attachment.profileId', 'POST /api/agent/browser/resolve — a command on an attachment'],
  ['attach', 'src/routes/browser.js', 'profileId: jv.profileId, browserKey: f.browserKey', 'resolveForJob (lane jobs-browser) — a Background Work job\'s OWN lease in its owner conversation\'s pinned / default profile; the key is a child handle, so admission is the owner\'s (src/browser-job-principal.js)'],
  ['setPin', 'src/routes/browser.js', "origin: 'chosen'", 'pinAnswer — the ONE pin implementation (user + agent)'],
  ['setPin', 'src/ws-create.js', 'remote: !!data.hostId', 'ws create — the New Session dialog\'s explicit pick, the remote flag carried'],
  ['copyPin', 'src/ws-create.js', 'copyPin(forkParentKey, bk.key)', 'ws create — a fork\'s copy'],
  ['restorePin', 'src/server/browser-key.js', "late.source === 'witness'", 'the late key — the pick its spawn witnessed, restored (a preference: restorePin writes no owner)'],
  ['setPin', 'src/server/browser-key.js', "late.source === 'landing'", 'the late key — the current default as a landing (a default origin: setPin adds nothing to the list)'],
  ['ensureEphemeral', 'src/routes/browser.js', 'browserKey: f.browserKey', 'resolve — the conversation\'s OWN managed browser'],
  ['ensureEphemeral', 'src/routes/browser.js', 'browserKey: v.handle', 'resolve — a helper\'s own managed browser'],
  ['updateProfile', 'src/routes/browser-trace.js', 'knownKeys', 'PATCH /api/browser/profiles/:id — the who-list write (the keeper judges, a remote key never known)'],
  ['reshapeStore', 'src/server/browser-keeper.js', '', '(the keeper\'s own export — MIGRATIONS ONLY)'],
];
{
  const sites = CALLER_FILES.filter((f) => fs.existsSync(path.join(REPO, f))).flatMap((f) => callerSites(f, read(f)));
  const unknown = sites.filter((s) => !KNOWN_CALLERS.some(([prim, file, needle]) => prim === s.prim && file === s.file && (!needle || s.text.includes(needle))));
  const missing = KNOWN_CALLERS.filter(([prim, file, needle]) => file !== 'src/server/browser-keeper.js' && !sites.some((s) => s.prim === prim && s.file === file && s.text.includes(needle)));
  ok(sites.length >= 10 && !unknown.length, `every caller of a lease / pin / list primitive across ${CALLER_FILES.length} files (${sites.length} calls) is KNOWN (attach ×5, setPin ×3, copyPin, restorePin, ensureEphemeral ×2, updateProfile)`, unknown.map((s) => `${s.file}:${s.line} ${s.prim}( ${s.text}`));
  ok(!missing.length, '…and every known caller is still there (a moved door is a door to re-judge)', missing);
  // the raw doors: reshapeStore / _reg are never called outside the keeper, the migrations and the suites
  const rawCallers = [];
  const RAW_READERS = { 'src/server/browser-trace.js': 'the recorder READS the registry (forget / adopt / orphans verdicts over leases + browsers + dirs) — never a write' };
  const walkDir = (d) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const rel = path.join(d, e.name); if (e.isDirectory()) { if (!/node_modules|\.git/.test(e.name)) walkDir(rel); } else if (/\.(c|m)?js$/.test(e.name)) { const src = stripComments(read(rel)); if (/^src\/server\/(migrations|browser-keeper)\.js$/.test(rel)) continue; if (/\b(?:k|keeper|kp)\??\.reshapeStore\(/.test(src)) rawCallers.push(rel + ' (reshapeStore)'); if (/\b(?:k|keeper|kp)\??\._reg\(/.test(src) && (!RAW_READERS[rel] || /\breg\.(leases|pins|profiles|browsers)\s*(=[^=]|\.push\(|\.splice\()|\.owner\s*=[^=]/.test(src))) rawCallers.push(rel + ' (_reg)'); } } };
  walkDir('src'); { const s0 = stripComments(read('server.js')); if (/\b(?:k|keeper)\??\.(reshapeStore|_reg)\(/.test(s0)) rawCallers.push('server.js'); }
  ok(!rawCallers.length, 'the keeper\'s raw doors: `reshapeStore` is called by the migrations only; `_reg` is read by the recorder alone (forget / adopt verdicts) and written by nobody in src/ + server.js', rawCallers);
  // the bindings writer: ONE caller (session-stdout's meta choke point) and its two refusals before the write
  const bsrc = stripComments(read('src/server/browser-bindings.js'));
  const rec = bsrc.slice(bsrc.indexOf('  function record(conversationId, key'), bsrc.indexOf('  function lookup(conversationId)'));
  const recCallers = [];
  const walk2 = (d) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const rel = path.join(d, e.name); if (e.isDirectory()) { if (!/node_modules|\.git/.test(e.name)) walk2(rel); } else if (/\.js$/.test(e.name) && rel !== 'src/server/browser-bindings.js') { const src = stripComments(read(rel)); if (/\bb(?:indings)?\.record\(/.test(src) || /browserBindings\(\)\.record\(/.test(src)) recCallers.push(rel); } } };
  walk2('src');
  ok(recCallers.length === 1 && recCallers[0] === 'src/server/session-stdout.js' && rec.indexOf('refuseMove(') < rec.indexOf('writeAll(all)') && rec.indexOf('refuseShare(') < rec.indexOf('writeAll(all)'), 'the bindings writer `record` has ONE caller (session-stdout\'s meta choke point) and refuses a moved binding (a fork never takes its parent\'s key) and a shared key BEFORE it writes', { recCallers });
  // the stream bridge: every target comes from streamTargetFor over the session's OWN attachment set — never a profile named freely
  const ssrc = stripComments(read('src/server/browser-stream.js'));
  const targets = ssrc.split('\n').filter((l) => /streamTargetFor\(/.test(l));
  ok(targets.length >= 2 && targets.every((l) => /browserKey: f\.browserKey, set,/.test(l)) && (ssrc.match(/set = keeper\.setFor\(f\.browserKey\)/g) || []).length >= 2, `the live-view bridge asks streamTargetFor over the session's own set (${targets.length} sites, each \`set = keeper.setFor(f.browserKey)\`) — a view of a profile the session does not hold is not_attached, never a grant`, targets);
  // CONTROL (d): a routes copy with a new attach caller ⇒ unknown caller RED by file:line
  const rsrc = read('src/routes/browser.js');
  const extraCaller = rsrc + "\nrouter.post('/api/browser/join-raw', async (req, res) => { const k = ctx.keeper; res.json(await k.attach({ profileId: req.body.profileId, browserKey: req.body.browserKey })); });\n";
  const sitesD = callerSites('src/routes/browser.js', extraCaller);
  const unknownD = sitesD.filter((s) => !KNOWN_CALLERS.some(([prim, file, needle]) => prim === s.prim && file === s.file && (!needle || s.text.includes(needle))));
  ok(unknownD.length === 1 && /join-raw|req\.body\.profileId/.test(unknownD[0].text), 'CONTROL (d): a routes copy with an unknown `k.attach(` caller is RED by file:line', unknownD);
  M.write('src/routes/browser.js', extraCaller, 'extra-caller');
}

// ═══ ③ THE AGENT-VIEW CENSUS ═══════════════════════════════════════════════
console.log('— ③ THE AGENT-VIEW CENSUS: the belt precedes every agent route; records answered through the PURE view; res.json only');
const AGENT_ROUTE_RE = /router\.(get|post|patch|delete)\('(\/api\/agent\/browser\/[^']*)'/g;
/** The routes the walk (④) drives, with the view each handler must name in its body (null = an answer with no record). */
const AGENT_ROUTES = {
  'GET /api/agent/browser/profiles': 'agentDigest(k, f)',
  'POST /api/agent/browser/use': 'agent: agentFactsOf(f)',
  'POST /api/agent/browser/resolve': 'agent: agentFactsOf(f)',
  'POST /api/agent/browser/new-child': null,
  'POST /api/agent/browser/audit': null,
  'GET /api/agent/browser/providers': null,
  'POST /api/agent/browser/new': 'B.agentProfileView(p, agentFactsOf(f)',
  'POST /api/agent/browser/detach': null,
  'GET /api/agent/browser/status': null,
  'POST /api/agent/browser/pin': null,
  'GET /api/agent/browser/backend': 'B.agentDigestView({ leases: v.leases, blocked: v.blocked }, agentFactsOf(f))',
  'POST /api/agent/browser/backend': null,
  'POST /api/agent/browser/blocked': null,
  'POST /api/agent/browser/site-hint': null,
  // lane browser-stuck (2026-09-28): the page-dialog long-poll and the dialog verbs — a dialog is only ever told to the
  // conversation whose browser it is (routes/browser.js dialogTargetFor); no record in either answer
  'GET /api/agent/browser/dialog': null,
  'POST /api/agent/browser/dialog': null,
  // lane site-reset (2026-09-30): the ways out (a tab of THIS conversation only — dialogTargetFor + ownsTab) and one site's
  // stored login cleared in its own browser / proposed on a shared one; no record in either answer
  'POST /api/agent/browser/direct': null,
  'POST /api/agent/browser/site-reset': null,
  // lane browser-resume B (§3.9): `vibespace-browser resume` — THIS conversation's own browser only (its key from the
  // token; a helper's handle / a named profile refused by name), its own kept tabs' urls + titles; no record in the answer
  'POST /api/agent/browser/resume': null,
  // lane browser-resume C (§3.9, ruling 3): the agent's own `tab` verbs on a shared profile — judged from the TOKEN's key
  // (never a key the body names); the answer = PURE agentTabView (its own tabs + a count — test-browser-tabs ② walks a
  // browser holding another conversation's tab and the user's own tab)
  'POST /api/agent/browser/tab': 'k.agentTabAct({ browserKey: f.browserKey',
  // lane browser-passkey (owner inc-muuvthv9-g69w): `passkey status | cancel` — THIS conversation's own browser only
  // (dialogTargetFor, asked again after every await); the answer is the passkey block + a sentence, no record
  'POST /api/agent/browser/passkey': null,
};
function judgeAgentRoutes(src) {
  const clean = stripComments(src);
  const lines = clean.split('\n');
  const beltAt = lines.findIndex((l) => /^router\.use\(AGENT_PREFIX, agentBelt\);/.test(l));
  const routes = [];
  lines.forEach((l, i) => { for (const m of l.matchAll(AGENT_ROUTE_RE)) routes.push({ key: `${m[1].toUpperCase()} ${m[2]}`, line: i + 1 }); });
  const problems = [];
  if (beltAt < 0) problems.push('the belt `router.use(AGENT_PREFIX, agentBelt)` is missing');
  for (const r of routes) if (beltAt >= 0 && r.line <= beltAt + 1) problems.push(`${r.key} (line ${r.line}) is registered BEFORE the belt (line ${beltAt + 1}) — its answers bypass it`);
  // each handler's body: from its registration to the next top-level `router.` / `function` / `module.exports`
  const bodies = new Map();
  routes.forEach((r, i) => { let end = lines.length; for (let j = r.line; j < lines.length; j++) if (/^(router\.|function |const |module\.exports)/.test(lines[j]) && j > r.line - 1) { end = j; break; } bodies.set(r.key, lines.slice(r.line - 1, end).join('\n')); });
  for (const r of routes) {
    const body = bodies.get(r.key) || '';
    if (!(r.key in AGENT_ROUTES)) problems.push(`${r.key} has NO row in the walk table (④) — a route the census does not drive`);
    else if (AGENT_ROUTES[r.key] && !body.includes(AGENT_ROUTES[r.key])) problems.push(`${r.key} answers without its view call "${AGENT_ROUTES[r.key]}"`);
    if (/\bres\.(send|end|write|sendFile)\(/.test(body)) problems.push(`${r.key} answers through res.send/end/write — the belt wraps res.json only`);
  }
  for (const k of Object.keys(AGENT_ROUTES)) if (!routes.some((r) => r.key === k)) problems.push(`walk row ${k} names a route that is not registered`);
  // the belt itself: agentAnswerView on every res.json, the asker's facts, the echoes
  const belt = clean.slice(clean.indexOf('function agentBelt(req, res, next)'), clean.indexOf('router.use(AGENT_PREFIX, agentBelt);'));
  if (!/res\.json = \(body\) =>/.test(belt) || !/B\.agentAnswerView\(body, \{ me: f \? f\.browserKey : null, foreign: foreignOf\(f\), echoes: B\.echoesOf\(req\.body, req\.query, req\.params\) \}\)/.test(belt)) problems.push('the belt does not run agentAnswerView over every res.json body with the asker\'s facts + the request\'s echoes');
  if (!/const AGENT_PREFIX = '\/api\/agent\/browser';/.test(clean)) problems.push('AGENT_PREFIX is not the agent router\'s prefix');
  return { routes, beltAt: beltAt + 1, problems };
}
const rsrc = read('src/routes/browser.js');
{
  const v = judgeAgentRoutes(rsrc);
  ok(v.routes.length === Object.keys(AGENT_ROUTES).length && !v.problems.length, `every /api/agent/browser/* route (${v.routes.length}) is registered after the belt (line ${v.beltAt}), answers through res.json, names its view call where it answers a record, and has a walk row`, v.problems);
  // the CLI names only registered routes, and every route the CLI can reach is walked
  const cli = read('data/bin/vibespace-browser');
  const cliCalls = [...cli.matchAll(/call\('(GET|POST)', '(\/api\/agent\/browser\/[a-z-]+)/g)].map((m) => `${m[1]} ${m[2]}`);
  const unknownCli = [...new Set(cliCalls)].filter((c) => !(c in AGENT_ROUTES));
  ok(cliCalls.length >= 12 && !unknownCli.length, `every route the shipped CLI calls (${new Set(cliCalls).size} distinct) is a registered, walked route`, unknownCli);
  // the belt's exception: exactly ['drivers'] (owner ruling A (2)), spelled once in the PURE module
  ok(Array.isArray(B.BELT_EXCEPTIONS) && B.BELT_EXCEPTIONS.length === 0 && Object.isFrozen(B.BELT_EXCEPTIONS), 'BELT_EXCEPTIONS is EMPTY and frozen — lane browser-windows retired `$.drivers` (owner ruling A (2)\'s one exception) with the drive claim: no conversation\'s key reaches another, ever');
  // CONTROL (e): a raw agent route registered BEFORE the belt ⇒ RED naming the route and the belt line
  const early = rsrc.replace("const AGENT_PREFIX = '/api/agent/browser';", "router.get('/api/agent/browser/early', (req, res) => res.json(ctx.keeper.list()));\nconst AGENT_PREFIX = '/api/agent/browser';");
  const ve = judgeAgentRoutes(early);
  ok(early !== rsrc && ve.problems.some((p) => /early .*registered BEFORE the belt/.test(p)), 'CONTROL (e): a routes copy with a raw route registered before the belt is RED by name', ve.problems);
  M.write('src/routes/browser.js', early, 'early-route');
  // CONTROL (f): /profiles answering k.list() raw ⇒ RED (the view call named)
  const rawProfiles = rsrc.replace('try { res.json({ ...agentDigest(k, f), me: k.statusFor(f.browserKey) }); } catch (e) { fail(res, e); }', 'try { res.json({ ...k.list(), me: k.statusFor(f.browserKey) }); } catch (e) { fail(res, e); }');
  const vf = judgeAgentRoutes(rawProfiles);
  ok(rawProfiles !== rsrc && vf.problems.some((p) => /GET \/api\/agent\/browser\/profiles answers without its view call/.test(p)), 'CONTROL (f): a routes copy whose /profiles answers k.list() raw is RED (the missing view named)', vf.problems);
  // CONTROL (g): a route answering through res.send ⇒ RED
  const sendRoute = rsrc.replace("router.get('/api/agent/browser/status', async (req, res) => {", "router.get('/api/agent/browser/status-raw', (req, res) => { res.send(JSON.stringify(ctx.keeper.list())); });\nrouter.get('/api/agent/browser/status', async (req, res) => {"); // lane browser-recipes: the status route is async (it probes the display)
  const vg = judgeAgentRoutes(sendRoute);
  ok(sendRoute !== rsrc && vg.problems.some((p) => /status-raw.*res\.send/.test(p)) && vg.problems.some((p) => /status-raw has NO row in the walk table/.test(p)), 'CONTROL (g): a routes copy with a route answering through res.send (and no walk row) is RED twice, by name', vg.problems);
}

// ═══ ③c THE USER'S OWN SURFACES (BROWSE YOURSELF verify r2, #5) ═══════════════
// Every COOKIE route that starts, drives, ends or reads the user's own browsing (a handler naming `/browse`, `isHumanKey`,
// a `holder === 'user'` entry, or the row's Stop that ends his page) — derived from the two routers' text — carries the
// agent-token guard IN ITS OWN BODY (`refuseAgentBearer(req, res)` / `isAgentBearer(req)`: `vsst_` AND `jbt_`), and the
// live-view upgrade judges the PARSED `browse` value. The runtime walk of all of them × both tokens over his REAL recorded
// entries is test-browser-human's human-route walk (its world has them); this is the census that names a new route.
console.log('— ③c THE USER\'S OWN SURFACES: every cookie route serving his browsing carries the vsst_ / jbt_ guard in its body; the upgrade judges the parsed query');
{
  const surfaces = (src, guardRe) => { const out = []; const ms = [...src.matchAll(/router\.(get|post|patch|delete)\('([^']+)'/g)]; ms.forEach((m, i) => { const body = src.slice(m.index, i + 1 < ms.length ? ms[i + 1].index : src.length).split(/\n(?:const|function|let) /)[0]; if (/^\/api\/agent\//.test(m[2])) return; const his = /\/browse\b/.test(m[2]) || /isHumanKey|holder === 'user'|k\.humanOf\(req\.params\.id\)/.test(body); if (his) out.push({ route: m[1].toUpperCase() + ' ' + m[2], guarded: guardRe.test(body) }); }); return out; };
  const judgeHuman = (rbSrc, rtSrc, stSrc) => {
    const rows = [...surfaces(rbSrc, /refuseAgentBearer\(req, res(?:, [A-Z_]+)?\)/), ...surfaces(rtSrc, /isAgentBearer\(req\)/)];
    const problems = rows.filter((r) => !r.guarded).map((r) => `${r.route} serves his browsing WITHOUT the agent-token guard`);
    if (!/\(vsst_\|jbt_\)/.test(rbSrc.slice(rbSrc.indexOf('const isAgentBearer'), rbSrc.indexOf('const isAgentBearer') + 200))) problems.push('routes/browser.js: the guard does not name both tokens (vsst_ | jbt_)');
    if (!/\(vsst_\|jbt_\)/.test(rtSrc.slice(rtSrc.indexOf('const isAgentBearer'), rtSrc.indexOf('const isAgentBearer') + 200))) problems.push('routes/browser-trace.js: the guard does not name both tokens (vsst_ | jbt_)');
    if (!/\n    if \(browse && \/\^Bearer\\s\+\(vsst_\|jbt_\)\/i\.test\(/.test(stSrc)) problems.push('browser-stream.js: the ?browse= upgrade is not judged on the parsed `browse` value with both tokens');
    return { rows, problems };
  };
  const rbS = read('src/routes/browser.js'), rtS = read('src/routes/browser-trace.js'), stS = read('src/server/browser-stream.js');
  const hv = judgeHuman(rbS, rtS, stS);
  ok(hv.rows.length >= 9 && !hv.problems.length, `every cookie route serving his browsing (${hv.rows.length}: ${hv.rows.map((r) => r.route.replace('/api/browser', '')).join(', ')}) carries the vsst_ / jbt_ guard in its own body, and the upgrade judges the parsed query`, hv.problems);
  // CONTROLS: a new route of his without the guard; the frame route's guard removed; a guard that forgets jbt_ — each RED by name
  const newRoute = rbS + "\nrouter.post('/api/browser/browse/:key/zoom', (req, res) => res.json({ ok: true }));\n";
  const noFrame = rtS.replace("  if (isAgentBearer(req)) { const e = tr.entry(req.params.id);", "  if (false) { const e = tr.entry(req.params.id);");
  const vsstOnly = rtS.replace('/^Bearer\\s+(vsst_|jbt_)/i', '/^Bearer\\s+(vsst_)/i');
  const c1 = judgeHuman(newRoute, rtS, stS), c2 = judgeHuman(rbS, noFrame, stS), c3 = judgeHuman(rbS, vsstOnly, stS);
  ok(c1.problems.some((p) => /browse\/:key\/zoom/.test(p)) && noFrame !== rtS && c2.problems.some((p) => /frame\/:which/.test(p)) && vsstOnly !== rtS && c3.problems.some((p) => /both tokens/.test(p)),
    'CONTROLS: a new route of his without the guard, the frame route\'s guard removed, a trace guard that forgets jbt_ — each RED by name', { c1: c1.problems, c2: c2.problems, c3: c3.problems });
}

// ═══ ④ THE RUNTIME JSON WALK ═══════════════════════════════════════════════
console.log('— ④ THE RUNTIME JSON WALK: the real keeper + routes + mediator; every answer for B and R walked; the CLI\'s stdout; the belt over a planted raw route');
const BIN = path.join(ROOT, 'bin'), AB = path.join(ROOT, 'ab'), HOME = path.join(ROOT, 'home'), DATA = path.join(ROOT, 'data');
for (const d of [BIN, AB, path.join(HOME, '.agent-browser'), DATA]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
// the fake agent-browser (0.38.1's measured shape — test-browser-share-model's, verbatim)
fs.writeFileSync(path.join(BIN, 'agent-browser'), `#!${process.execPath}
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const st = process.env.FAKE_AB_STATE; const ns = process.env.AGENT_BROWSER_NAMESPACE || 'default'; const sess = process.env.AGENT_BROWSER_SESSION || ns;
let cfgProf = null; try { const c = JSON.parse(fs.readFileSync(process.env.AGENT_BROWSER_CONFIG, 'utf8')); if (c && typeof c.profile === 'string') cfgProf = c.profile; } catch { }
const prof = process.env.AGENT_BROWSER_PROFILE || cfgProf, cdp = process.env.AGENT_BROWSER_CDP || null;
const f = path.join(st, ns + '__' + sess + '.json');
const read = () => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const out = (o) => { process.stdout.write(JSON.stringify(o) + '\\n'); };
const log = (n, o) => fs.appendFileSync(path.join(st, n), JSON.stringify(o) + '\\n');
const argv = process.argv.slice(2).filter((x) => x !== '--pin-tab' && x !== '--json');
if (argv[0] === '--executable-path') argv.splice(0, 2); if (argv[0] === '--args') argv.splice(0, 2); // a cloak launch: another binary + its seed, then the verb
const [a, b] = argv;
const view = process.env.AGENT_BROWSER_IDLE_TIMEOUT_MS || '';
const daemon = (by) => {
  let s = read(); if (s && alive(s.pid)) return s;
  if (cdp) { const c = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' }); c.unref(); s = { pid: c.pid, cdp, view }; fs.writeFileSync(f, JSON.stringify(s)); log('connects.log', { ns, sess, cdp, by, pid: c.pid }); return s; }
  const lock = prof ? path.join(prof, 'SingletonLock.fake') : null;
  if (lock) { let h = null; try { h = Number(fs.readFileSync(lock, 'utf8')); } catch { } if (h && alive(h)) { return { refused: 'Chrome exited early (exit code: 21) ... Failed to create ' + prof + '/SingletonLock: File exists (17)' }; } }
  const c = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' }); c.unref(); s = { pid: c.pid, profile: prof, view }; fs.writeFileSync(f, JSON.stringify(s));
  if (lock) fs.writeFileSync(lock, String(c.pid));
  log('launches.log', { ns, sess, by, profile: prof, pid: c.pid });
  return s;
};
if (a === '--version') { console.log('agent-browser 0.38.1'); process.exit(0); }
if (a === 'session' && b === 'info') { const s = read(); const act = !!(s && alive(s.pid)); out({ success: true, data: { active: act, namespace: ns, pid: act ? s.pid : null, session: sess, socketDir: path.join(st, ns, 'run') } }); process.exit(0); }
if (a === 'get' && b === 'cdp-url') { const s0 = read(); if (!(s0 && alive(s0.pid))) { out({ success: false, error: 'fake: no browser' }); process.exit(1); } out({ success: true, data: { cdpUrl: 'ws://127.0.0.1:19777/devtools/browser/fake-' + ns } }); process.exit(0); }
if (a === 'close' && b === '--all') { const s = read(); if (s && alive(s.pid)) { try { process.kill(s.pid, 'SIGKILL'); } catch { } } try { fs.unlinkSync(f); } catch { } if (s && s.profile) { try { fs.unlinkSync(path.join(s.profile, 'SingletonLock.fake')); } catch { } } out({ success: true, data: { closed: 1 } }); process.exit(0); }
if (a === 'close' && b !== '--all') { out({ success: true, data: { closed: 1 } }); process.exit(0); }
if (a === 'tab' && (b === 'close' || b === 'new')) { out({ success: true, data: { closed: 1 } }); process.exit(0); }
if (a === 'stream' && b === 'status') { const s = daemon('stream status'); if (s.refused) { out({ success: false, error: s.refused }); process.exit(1); } out({ success: true, data: { enabled: true, connected: true, port: 21000 + (sess.length * 7) % 900, screencasting: false } }); process.exit(0); }
if (['open', 'snapshot', 'get', 'click'].includes(a)) { const s = daemon(a); if (s.refused) { out({ success: false, error: s.refused }); process.exit(1); } out({ success: true, data: { ok: true } }); process.exit(0); }
out({ success: false, error: 'fake: unknown verb ' + process.argv.slice(2).join(' ') }); process.exit(1);
`, { mode: 0o755 });
const PATH_ENV = `${BIN}:${path.dirname(process.execPath)}:/usr/bin:/bin`;
const env = { PATH: PATH_ENV, HOME, FAKE_AB_STATE: AB, XDG_RUNTIME_DIR: XDG };
let clock = 1_900_000_000_000;
const active = new Map();
const facts = {};
const live = new Set();
const groupsOf = new Map();
const TASKS = new Map([['T-G', { title: 'Ops', archived: false }]]);
const taskDeps = { taskIdsForKey: (bk) => { for (const [, x] of active) if (x && x._browserKey === bk) return { ids: groupsOf.get(bk) || [], unreadable: false }; return { ids: [], unreadable: false, live: false }; }, taskInfo: (id) => TASKS.get(id) || null };
const remoteKeys = () => new Set([...active.values()].filter((x) => x && x._browserKey && (x.hostId || x.host || x._browserVariant === 'H')).map((x) => x._browserKey));
const mkKeeper = (extra = {}) => K.create({ ...taskDeps, dataDir: DATA, homeDir: HOME, env: () => env, serverSetting: () => undefined, liveKeys: () => live, remoteKeys, runtime: F.createBrowserRuntime({ env }), facts: F.createBrowserFacts({ env }), log: { log() { }, warn() { }, error() { } }, install: false, now: () => clock, conversationFacts: (bk) => facts[bk] || { turn: null, name: null }, ...extra });
const med = MED.create({ log: { log() { }, warn() { } } });
const k = mkKeeper({ mediator: med });
const be = BE.create({ dataDir: DATA, homeDir: HOME, serverNotice: null, telemetry: null, log: { warn() { }, log() { } }, env: { XDG_RUNTIME_DIR: XDG } });
const tok = (c) => 'vsst_' + String(c).repeat(24);
const mkSession = (id, bk, name, { rungD = false, host = null } = {}) => {
  const s = { agentToken: tok(id.slice(-1)), _browserKey: bk, _browserVariant: null, name, webuiName: name, mode: 'chat', createdAt: clock, claudeSessionId: 'e2e00000-0000-4000-8000-' + id.replace(/\W/g, '').padEnd(12, '0').slice(0, 12) };
  if (host) { s.hostId = host; s._browserVariant = B.VARIANTS.H; }
  if (rungD) { const e = be.envFor({ browserKey: bk, integrationOn: true, remote: false, cwd: ROOT }); s._browserVariant = e.variant; s._browserEnv = e.pairs.slice(); }
  active.set(id, s); live.add(bk); facts[bk] = { turn: 'idle', name };
  return s;
};
const A = 'bk-0000aaa1', Bk = 'bk-0000bbb2', Rk = 'bk-0000eee9';
const sA = mkSession('sess-a', A, 'Alpha chat', { rungD: true }), sB = mkSession('sess-b', Bk, 'Beta chat', { rungD: true }), sR = mkSession('sess-r', Rk, 'Remote chat', { host: 'h-remote' });
k.setCap(A, 6); k.setCap(Bk, 6);
const ctxFor = (kk) => ({ keeper: kk, activeSessions: active, browserEnv: () => be, adoptRoots: { homeDir: HOME, dataDir: DATA }, notice: () => { }, persistPin: () => { }, tasksForSession: (s) => groupsOf.get(s && s._browserKey) || [] });
const R = require('../src/routes/browser.js');
R.setup(ctxFor(k));
const serve = async (routers) => { const app = express(); app.use(express.json()); for (const r of routers) app.use(r); return new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); }); };
const srv = await serve([R.router]);
const API = `http://127.0.0.1:${srv.address().port}`;
const jAt = (base) => async (method, p, body, headers = {}) => { const res = await fetch(base + p, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined }); let json = null; try { json = await res.json(); } catch { } return { status: res.status, json }; };
const j = jAt(API);
const as = (s) => ({ Authorization: 'Bearer ' + s.agentToken });
const plant = (owner, label, extra = {}) => {
  const id = 'bp-' + Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
  k.reshapeStore((reg) => { reg.profiles.push(B.newProfileRecord({ id, label, dir: path.join(HOME, '.agent-browser', 'profiles', id), now: clock })); const p = reg.profiles[reg.profiles.length - 1]; p.owner = owner; Object.assign(p, extra); });
  fs.mkdirSync(path.join(HOME, '.agent-browser', 'profiles', id), { recursive: true });
  return k.profile(id);
};
// THE FIXTURE: p-secret (only A), p-med (only A, mediated), p-all (everyone)
const P = plant({ kind: 'only', who: [{ kind: 'session', id: A }] }, 'p-secret', { createdBy: A });
const PM = plant({ kind: 'only', who: [{ kind: 'session', id: A }] }, 'p-med', { createdBy: A, sharing: 'instance' });
const PALL = plant({ kind: 'instance', id: null }, 'p-all', { createdBy: A });
let r;
r = await j('POST', '/api/agent/browser/use', { profile: 'p-secret' }, as(sA)); ok(r.status === 200, 'fixture: A uses p-secret', r.json);
r = await j('POST', '/api/agent/browser/use', { profile: 'p-med' }, as(sA)); ok(r.status === 200 && r.json.mediated === true, 'fixture: A uses p-med (a mediated grant)', r.json);
r = await j('POST', '/api/agent/browser/new-child', {}, as(sA)); ok(r.status === 200, 'fixture: A mints a helper', r.json);
const helperKey = r.json && r.json.handle;
r = await j('POST', '/api/agent/browser/resolve', { handle: helperKey, argv: ['open', 'https://x'] }, as(sA)); ok(r.status === 200 && r.json.kind === 'child', 'fixture: the helper opens its own browser', r.json);
r = await j('POST', '/api/agent/browser/detach', { profile: 'p-secret' }, as(sA)); r = await j('POST', '/api/agent/browser/detach', { profile: 'p-med' }, as(sA));
r = await j('POST', '/api/agent/browser/resolve', { handle: '', argv: ['open', 'https://x'] }, as(sA)); ok(r.status === 200 && r.json.kind === 'ephemeral', 'fixture: A opens its OWN managed ephemeral browser', r.json);
r = await j('POST', '/api/agent/browser/use', { profile: 'p-secret' }, as(sA)); r = await j('POST', '/api/agent/browser/use', { profile: 'p-med' }, as(sA));
r = await j('POST', '/api/agent/browser/resolve', { handle: 'p-secret', argv: ['open', 'https://x'] }, as(sA)); ok(r.status === 200 && r.json.kind === 'attachment', 'fixture: A drives p-secret (a drive claim)', r.json);
facts[A].turn = 'running';
r = await j('POST', '/api/agent/browser/use', { profile: 'p-all' }, as(sB)); ok(r.status === 200, 'fixture: B uses p-all', r.json);
r = await j('POST', '/api/agent/browser/use', { profile: 'p-all' }, as(sA)); ok(r.status === 200, 'fixture: A uses p-all too (a lease beside B\'s)', r.json);
const tk = k.takeover({ browserKey: A, profileId: PALL.id, viewerId: 'v2', sessionId: 'sess-a' }); ok(tk.ok, 'fixture: the user takes over A\'s p-all from A\'s live view (B holds it too)', tk);
const tk1 = k.takeover({ browserKey: A, profileId: P.id, viewerId: 'v1', sessionId: 'sess-a' }); ok(tk1.ok, 'fixture: the user takes over A\'s p-secret too (the switcher rows of a kept profile name a driver)', tk1);
r = await j('POST', '/api/agent/browser/blocked', { url: 'https://blocked.example/x', why: 'captcha', profile: 'p-secret' }, as(sA)); ok(r.status === 200, 'fixture: A files a blocked claim on p-secret', r.json);
// A's identifiers
const aEph = k.ephemeralFor(A), hEph = helperKey ? k.ephemeralFor(helperKey) : null;
const idsA = { browserKey: A, webuiId: 'sess-a', conversationId: sA.claudeSessionId, helperKey, ephPid: aEph && aEph.pid, helperPid: hEph && hEph.pid, bsSession: B.sessionNameFor(A), helperBs: helperKey && B.sessionNameFor(helperKey) };
ok(Object.values(idsA).every((v) => v !== null && v !== undefined && v !== ''), 'A\'s identifiers are all real (key, webui id, conversation id, helper key, two pids, two bs-session ids)', idsA);
const AVALS = [...new Set(Object.values(idsA).map(String))];
/** Walk a body: every string / number leaf that equals or contains one of A's identifiers, with its JSON path. */
function walk(v, p, hits) {
  if (v === null || v === undefined) return;
  if (typeof v === 'string' || typeof v === 'number') { const s = String(v); for (const a of AVALS) if (s === a || (typeof v === 'string' && a.length >= 6 && s.includes(a))) hits.push({ path: p, value: s.slice(0, 160), id: a }); return; }
  if (Array.isArray(v)) { v.forEach((x, i) => walk(x, p + '[' + i + ']', hits)); return; }
  if (typeof v === 'object') for (const [kx, x] of Object.entries(v)) { for (const a of AVALS) if (kx === a || (a.length >= 6 && kx.includes(a))) hits.push({ path: p + '.{' + kx + '}', value: kx.slice(0, 160), id: a }); walk(x, p + '.' + kx, hits); } // r4: an object KEY is a string too
}
const EXCEPTION_PATH = /^\$\.drivers\.bp-[0-9a-f]{8}\.browserKey$/;
const said = (body, p) => { const out = new Set(); const w = (v) => { if (typeof v === 'string') out.add(v); else if (v && typeof v === 'object') Object.values(v).forEach(w); }; w(body); for (const q of (p.split('?')[1] || '').split('&')) if (q) out.add(decodeURIComponent(q.split('=').slice(1).join('='))); return out; };
/** The judge: hits outside the exception that the asker did not itself send. */
const judge = (body, p, reqBody) => { const hits = []; walk(body, '$', hits); const echo = said(reqBody, p); return { leaks: hits.filter((h) => !EXCEPTION_PATH.test(h.path) && ![...echo].some((e) => e.includes(h.id) && h.value.includes(e))), exceptions: hits.filter((h) => EXCEPTION_PATH.test(h.path)) };
};
/** THE WALK TABLE: one request per agent route (several for the branching ones). Every route in ③'s table is here. */
const WALK = (eph, helper) => [
  ['GET', '/api/agent/browser/profiles'], ['GET', '/api/agent/browser/status'], ['GET', '/api/agent/browser/providers'],
  ['GET', '/api/agent/browser/backend'], ['GET', '/api/agent/browser/backend?profile=p-secret'], ['GET', '/api/agent/browser/backend?profile=p-med'], ['GET', '/api/agent/browser/backend?profile=p-all'],
  ['POST', '/api/agent/browser/use', { profile: 'p-secret' }], ['POST', '/api/agent/browser/use', { profile: 'p-med', wrapper: true }], ['POST', '/api/agent/browser/use', { profile: 'p-all', wrapper: true }],
  ['POST', '/api/agent/browser/resolve', { handle: '', argv: ['open', 'https://x'], wrapper: true }], ['POST', '/api/agent/browser/resolve', { handle: 'p-all', argv: ['open', 'https://x'], wrapper: true }],
  ['POST', '/api/agent/browser/resolve', { handle: 'p-secret', argv: ['open', 'https://x'], wrapper: true }], ['POST', '/api/agent/browser/resolve', { handle: helper, argv: ['open', 'https://x'], wrapper: true }],
  ['POST', '/api/agent/browser/resolve', { handle: eph, argv: ['open', 'https://x'], wrapper: true }],
  ['POST', '/api/agent/browser/audit', { profile: 'p-all', verb: 'open', ok: true, since: clock, url: 'https://x' }], ['POST', '/api/agent/browser/audit', { profile: eph, verb: 'open', ok: true, since: clock }], ['POST', '/api/agent/browser/audit', { profile: 'p-secret', verb: 'open', ok: true, since: clock, handle: helper }],
  ['POST', '/api/agent/browser/pin', { profile: 'p-secret' }], ['POST', '/api/agent/browser/pin', { profile: 'p-all' }], ['POST', '/api/agent/browser/pin', { profile: null }],
  ['POST', '/api/agent/browser/new', { label: 'p-secret' }], ['POST', '/api/agent/browser/new', { label: 'p-new-of-b' }], ['POST', '/api/agent/browser/new', { label: 'x', adoptDir: P.dir }], ['POST', '/api/agent/browser/new', { label: 'x', adoptDir: aEph && aEph.dir }],
  ['POST', '/api/agent/browser/new-child', {}], ['POST', '/api/agent/browser/detach', { profile: 'p-secret' }], ['POST', '/api/agent/browser/detach', { profile: helper }],
  ['POST', '/api/agent/browser/backend', { provider: 'cloak', profile: 'p-all' }], ['POST', '/api/agent/browser/backend', { provider: 'chromium', profile: 'p-secret' }],
  ['POST', '/api/agent/browser/blocked', { url: 'https://blocked.example/y', why: 'captcha', profile: 'p-all' }], ['POST', '/api/agent/browser/blocked', { url: 'https://blocked.example/y', why: 'captcha', profile: 'p-secret' }],
  ['POST', '/api/agent/browser/site-hint', { site: 'blocked.example', tier: 2, why: 'x' }],
  ['GET', '/api/agent/browser/dialog?profile=p-secret&wait=0'], ['GET', '/api/agent/browser/dialog?profile=p-all&wait=0'], ['GET', `/api/agent/browser/dialog?profile=${eph}&wait=0`],
  ['POST', '/api/agent/browser/dialog', { profile: 'p-secret', action: 'status' }], ['POST', '/api/agent/browser/dialog', { profile: eph, action: 'dismiss' }],
  // lane browser-passkey: the passkey status / cancel (another conversation's profile, its own temporary browser, a shared one)
  ['POST', '/api/agent/browser/passkey', { profile: 'p-secret', action: 'status' }], ['POST', '/api/agent/browser/passkey', { profile: eph, action: 'cancel' }], ['POST', '/api/agent/browser/passkey', { profile: 'p-all', action: 'status' }],
  // lane site-reset: the ways out (direct, through the watch) and one site's stored login cleared / proposed
  ['POST', '/api/agent/browser/direct', { profile: 'p-secret', action: 'stop' }], ['POST', '/api/agent/browser/direct', { profile: eph, action: 'stop' }], ['POST', '/api/agent/browser/direct', { profile: 'p-all', action: 'close' }], ['POST', '/api/agent/browser/direct', { profile: eph, action: 'screenshot' }],
  ['POST', '/api/agent/browser/site-reset', { profile: 'p-secret', host: 'x' }], ['POST', '/api/agent/browser/site-reset', { profile: 'p-all', host: 'x', explicit: true }], ['POST', '/api/agent/browser/site-reset', { profile: eph, host: 'x', explicit: true }],
  ['GET', '/api/agent/browser/status'], ['GET', '/api/agent/browser/profiles'],
  // lane browser-resume B: the agent's own resume (its own browser; a helper's handle and a named profile refused by name)
  ['POST', '/api/agent/browser/resume', {}], ['POST', '/api/agent/browser/resume', { handle: helper }], ['POST', '/api/agent/browser/resume', { handle: 'p-secret' }],
  // lane browser-resume C: the agent's own tab verbs (a shared profile, a helper's handle, its own browser, A's key named in the body)
  ['POST', '/api/agent/browser/tab', { handle: 'p-all', argv: ['tab', 'list', '--json'] }], ['POST', '/api/agent/browser/tab', { handle: 'p-all', argv: ['tab', 'close', 't1'] }],
  ['POST', '/api/agent/browser/tab', { handle: helper, argv: ['tab', 'list'] }], ['POST', '/api/agent/browser/tab', { argv: ['tab'] }], ['POST', '/api/agent/browser/tab', { handle: 'p-secret', argv: ['tab', 'new', 'https://x.example/'], browserKey: A }],
];
async function walkAs(jj, s, { eph = aEph && aEph.profileId, helper = helperKey } = {}) {
  const leaks = [], exceptions = [], routes = new Set();
  for (const [m, p, body] of WALK(eph, helper)) {
    const r = await jj(m, p, body, as(s));
    routes.add(`${m} ${p.split('?')[0]}`);
    const v = judge(r.json, p, body);
    if (v.leaks.length) leaks.push({ m, p, status: r.status, hits: v.leaks.slice(0, 4) });
    for (const h of v.exceptions) exceptions.push({ m, p, ...h });
  }
  return { leaks, exceptions, routes };
}
{
  const w = await walkAs(j, sB);
  ok([...w.routes].sort().join() === Object.keys(AGENT_ROUTES).sort().join(), `the walk drove every route of ③'s table (${w.routes.size})`, [...w.routes]);
  ok(!w.leaks.length, 'B (not admitted): no answer of any agent route names A — key, webui id, conversation id, ephemeral pid, helper pid, helper key, bs-session ids (echoes of B\'s own request excepted)', w.leaks);
  ok(w.exceptions.length === 0, `NO EXCEPTION (lane browser-windows): no $.drivers path names A anywhere any more — the drive claim it relayed is gone (${w.exceptions.length} rows)`, w.exceptions);
  // what the view (not just the belt) does: the digest's browsers map is the state only; another's ephemeral records are gone
  const d = (await j('GET', '/api/agent/browser/profiles', undefined, as(sB))).json;
  const recs = Object.values(d.browsers || {});
  ok(recs.length >= 2 && recs.every((x) => !('pid' in x) && !('ns' in x) && !('startedBy' in x) && !('socketDir' in x) && !('launchEnv' in x) && !('dir' in x) && typeof x.state === 'string') && !Object.keys(d.browsers).includes(aEph.profileId) && !Object.keys(d.browsers).includes(hEph.profileId), 'the digest\'s `browsers` for B: the named profiles\' records reduced to state facts (no pid / ns / startedBy / socket dir / dir / launch env); A\'s ephemeral and helper records absent', { keys: Object.keys(d.browsers), sample: recs[0] });
  ok(d.leases.every((l) => !l.other || (l.ephemeral ? !('profileId' in l) && !('browserKey' in l) : !('browserKey' in l) && !('sessionId' in l))) && d.ephemerals.length === 0 && d.ephemeralsOthers >= 2 && Object.keys(d.pins).every((x) => x === Bk), 'B\'s leases: other rows without key / session id, another\'s ephemeral without even its record id; ephemerals = none of its own + a count; pins = its own only', { leases: d.leases, eph: d.ephemerals, others: d.ephemeralsOthers, pins: Object.keys(d.pins) });
  // A's own answers keep A's own facts whole (the belt masks OTHERS only)
  const sa = (await j('GET', '/api/agent/browser/status', undefined, as(sA))).json;
  ok(sa.browserKey === A && sa.leases.some((l) => l.browserKey === A && l.sessionId === 'sess-a') && sa.ephemeral && sa.ephemeral.pid === aEph.pid && sa.children.some((c) => c.handle === helperKey), 'A\'s own status keeps its own key, webui id, ephemeral pid and helper handle (the belt masks other conversations, never the asker)', { bk: sa.browserKey, eph: sa.ephemeral && sa.ephemeral.pid, children: sa.children });
  // the digest's browsers map for A carries its OWN ephemeral record with its pid
  const da = (await j('GET', '/api/agent/browser/profiles', undefined, as(sA))).json;
  ok(da.browsers[aEph.profileId] && da.browsers[aEph.profileId].pid === aEph.pid && da.browsers[hEph.profileId] && da.browsers[hEph.profileId].pid === hEph.pid, 'A\'s digest carries its own ephemeral + helper records (pid kept for its own)', Object.keys(da.browsers));
  // R (another machine): every admission door refused remote_session — and nothing of A in its answers
  const doors = [['POST', '/api/agent/browser/use', { profile: 'p-all' }], ['POST', '/api/agent/browser/pin', { profile: 'p-all' }], ['POST', '/api/agent/browser/new', { label: 'p-by-remote' }], ['POST', '/api/agent/browser/new', { label: 'x', adoptDir: P.dir }]];
  const rr = [];
  for (const [m, p, body] of doors) { const x = await j(m, p, body, as(sR)); rr.push({ m, p, status: x.status, code: x.json && x.json.code }); }
  ok(rr.every((x) => x.status === 409 && x.code === 'remote_session'), 'R (a session on another machine): use / pin / new / new --adopt are each refused remote_session (409) — it can neither hold, pin nor make a profile here', rr);
  const wr = await walkAs(j, sR);
  ok(!wr.leaks.length, 'R: no answer of any agent route names A either', wr.leaks);
  ok(k.list().leases.every((l) => B.parentKeyOf(l.browserKey) !== Rk) && !k.list().pins[Rk] && !k.list().profiles.some((p) => p.createdBy === Rk), 'after R\'s walk the registry holds no lease, pin or profile of R', { leases: k.list().leases.map((l) => l.browserKey), pins: Object.keys(k.list().pins) });
  // a blocked CLAIM on a kept profile: refused by the admission's name (the user's live view of p-secret never shows B's claim); on p-all accepted
  const cs = await j('POST', '/api/agent/browser/blocked', { url: 'https://blocked.example/z', why: 'captcha', profile: 'p-secret', remember: true }, as(sB));
  const ca = await j('POST', '/api/agent/browser/blocked', { url: 'https://blocked.example/z', why: 'captcha', profile: 'p-all' }, as(sB));
  ok(cs.status === 403 && cs.json.code === 'not_owner' && !k.blockedFor({ profileId: P.id }).some((c) => c.browserKey === Bk) && !k.siteHints().some((h) => h.host === 'blocked.example' && /agent claim/.test(String(h.why))) && ca.status === 200 && k.blockedFor({ profileId: PALL.id }).some((c) => c.browserKey === Bk), 'B\'s blocked claim on p-secret (a profile the list keeps from it) is refused not_owner — no claim, no remembered site hint; its claim on p-all (admitted) lands', { cs: cs.json && cs.json.code, ca: ca.status });
  // THE CLI: the shipped vibespace-browser as B — its stdout + stderr for the non-page verbs name nothing of A
  const cliEnv = { ...env, VIBESPACE_API: API, VIBESPACE_SESSION_TOKEN: sB.agentToken, VIBESPACE_SESSION_CWD: ROOT, ...S.pairsToEnv(sB._browserEnv) };
  const cli = (args) => new Promise((resolve) => execFile(process.execPath, [path.join(REPO, 'data/bin/vibespace-browser'), ...args], { env: cliEnv, cwd: ROOT, encoding: 'utf8', timeout: 20000 }, (err, so, se) => resolve({ code: err ? err.code : 0, out: String(so || '') + '\n' + String(se || '') })));
  const verbs = [['profiles'], ['status'], ['backend'], ['backend', '--profile', 'p-secret'], ['backend', '--profile', 'p-all'], ['use', 'p-secret'], ['use', 'p-all'], ['pin', 'p-all'], ['providers'], ['new', 'p-cli-of-b'], ['detach', 'p-all'], ['new-child'], ['children'], ['pin', '--none']];
  const cliLeaks = [];
  let ran = 0;
  for (const v of verbs) { const c = await cli(v); ran++; for (const a of AVALS) if (a.length >= 6 && c.out.includes(a)) cliLeaks.push({ verb: v.join(' '), id: a, line: c.out.split('\n').find((l) => l.includes(a)) }); }
  ok(ran === verbs.length && !cliLeaks.length, `the shipped CLI as B (${verbs.length} verbs, stdout + stderr): nothing of A printed`, cliLeaks);
  // CONTROL (h): the routes WITHOUT the belt + a raw route answering k.list() ⇒ the walk is RED on that route
  const rsrcAll = read('src/routes/browser.js');
  const rawRoute = "\nrouter.get('/api/agent/browser/raw', (req, res) => { const f = agentFacts(req, res); if (!f) return; res.json({ ...ctx.keeper.list(), me: ctx.keeper.statusFor(f.browserKey), rows: ctx.keeper.switcherView(" + JSON.stringify(P.id) + ").rows }); });\n";
  const noBelt = rsrcAll.replace('router.use(AGENT_PREFIX, agentBelt);', '') + rawRoute;
  ok(noBelt !== rsrcAll + rawRoute, 'CONTROL (h): the belt line was really removed from the copy');
  const Rn = M.load('src/routes/browser.js', noBelt, 'no-belt-raw-route'); Rn.setup(ctxFor(k));
  const srvN = await serve([Rn.router]); const jN = jAt(`http://127.0.0.1:${srvN.address().port}`);
  const rn = await jN('GET', '/api/agent/browser/raw', undefined, as(sB));
  const vn = judge(rn.json, '/api/agent/browser/raw', undefined);
  const hn = { lease: vn.leaks.some((h) => /^\$\.leases\[\d+\]\.browserKey$/.test(h.path)), rec: vn.leaks.some((h) => /startedBy|\.ns$/.test(h.path)), driver: vn.leaks.some((h) => /^\$\.rows\[\d+\]\.(facts\.)?driver$/.test(h.path)), me: vn.leaks.some((h) => /^\$\.me\./.test(h.path)) };
  ok(rn.status === 200 && vn.leaks.length >= 4 && hn.lease && hn.rec && hn.driver && hn.me, `CONTROL (h): without the belt a raw route hands B A's key, session ids, browser records, the switcher's driver and its own status rows' driver (${vn.leaks.length} hits) — the walk's judge is RED`, { hn, sample: vn.leaks.filter((h) => /rows|me\.|browsers/.test(h.path)).slice(0, 8) });
  srvN.close();
  // …and the REAL belt over the SAME raw route ⇒ GREEN: a route written raw tomorrow is still safe
  const Rb = M.load('src/routes/browser.js', rsrcAll + rawRoute, 'belt-raw-route'); Rb.setup(ctxFor(k));
  const srvB = await serve([Rb.router]); const jB = jAt(`http://127.0.0.1:${srvB.address().port}`);
  const rb = await jB('GET', '/api/agent/browser/raw', undefined, as(sB));
  const vb = judge(rb.json, '/api/agent/browser/raw', undefined);
  const hb = { leaks: vb.leaks.length, exc: vb.exceptions.length, lease: rb.json.leases.some((l) => l.browserKey === B.MASKED_KEY), driver: rb.json.rows.some((x) => x.facts && x.facts.driver === B.MASKED_KEY), started: Object.values(rb.json.browsers).some((x) => x.startedBy === 'attach ' + B.MASKED_KEY) };
  ok(rb.status === 200 && !vb.leaks.length && vb.exceptions.length === 0 && hb.lease && hb.driver && hb.started, 'CONTROL (h′): the REAL belt over the same raw route: every key of A masked `bk-********`, the driver masked, `startedBy` masked, no exception left — GREEN', { hb, rows: (rb.json.rows || []).map((x) => x.facts && x.facts.driver), started: Object.values(rb.json.browsers).map((x) => x.startedBy) });
  const rbA = await jB('GET', '/api/agent/browser/raw', undefined, as(sA));
  ok(rbA.status === 200 && rbA.json.leases.some((l) => l.browserKey === A) && rbA.json.leases.some((l) => l.browserKey === B.MASKED_KEY), 'CONTROL (h″): the belt keeps the ASKER\'s own key in the raw answer and masks B\'s for A', rbA.json.leases.map((l) => l.browserKey));
  srvB.close();
  // CONTROL (i): a PURE belt copy that GAINS an exception ⇒ the walk's judge RED on it (lane browser-windows: there is none)
  const bsrc = read('src/browser-profiles.js');
  const bsrcX = bsrc.replace("const BELT_EXCEPTIONS = Object.freeze([]);", "const BELT_EXCEPTIONS = Object.freeze(['leases']);");
  ok(bsrcX !== bsrc, 'control: the patched belt copy gained an exception (`leases`)');
  const Bx = M.load('src/browser-profiles.js', bsrcX, 'two-exceptions');
  const raw = { ...k.list(), me: k.statusFor(Bk) };
  const viaReal = judge(B.agentAnswerView(raw, { me: Bk, foreign: { ids: new Set(['sess-a', sA.claudeSessionId]), pids: new Set([aEph.pid, hEph.pid]) } }), '/x', undefined);
  const viaTwo = judge(Bx.agentAnswerView(raw, { me: Bk, foreign: { ids: new Set(['sess-a', sA.claudeSessionId]), pids: new Set([aEph.pid, hEph.pid]) } }), '/x', undefined);
  ok(!viaReal.leaks.length && viaTwo.leaks.length >= 1 && viaTwo.leaks.every((h) => /^\$\.leases\[/.test(h.path)), 'CONTROL (i): a belt copy with an exception (`leases`) hands A\'s key through it and the judge is RED there; the real belt is green over the same raw digest', viaTwo.leaks.slice(0, 3));

  // r4: THE BELT'S OWN EDGES — a key inside a longer token, next to a word character, in upper case, as an object KEY, in a
  // string of any length, at any depth; the asker's own family and its echoes kept. CONTROL (i″): the pre-r4 regex restored.
  {
    const me = Bk, A1 = A, fg = { ids: new Set(['sess-a', sA.claudeSessionId]), pids: new Set([aEph.pid]) };
    const v = (body, echoes = []) => B.agentAnswerView(body, { me, foreign: fg, echoes: new Set(echoes) });
    const bad = (o) => /bk-0000aaa1|BK-0000AAA1|sess-a|sessa/i.test(JSON.stringify(o).replace(/\[another conversation\]/g, '').replace(/bk-\*{8}/g, ''));
    const edges = { under: 'trace_' + A1, before: 'x' + A1, hexAfter: A1 + 'f', digitAfter: A1 + '9', upper: A1.toUpperCase(), url: 'http://h/x/' + A1 + '/y?s=' + sA.claudeSessionId, key: { [A1]: { alias: 'x' } }, idKey: { 'sess-a': 1 }, twoKeys: { [A1]: 1, [A1 + '.1']: 2 }, long: 'z'.repeat(70000) + ' ' + A1 + ' ' + 'z'.repeat(70000), deep: (() => { let x = A1; for (let i = 0; i < 70; i++) x = { d: x }; return x; })(), idInText: 'conversation ' + sA.claudeSessionId + ' holds it', pid: aEph.pid, own: me, ownChild: me + '.2', ownUpper: me.toUpperCase() };
    const out = v(edges);
    ok(!bad(out), 'r4 the belt masks a key inside a longer token, beside a letter / digit / underscore, in upper case, in a url, as an object KEY (twice, told apart), in a 140 KB string and 70 levels deep (dropped), a conversation id inside a sentence, an ephemeral pid', JSON.stringify(out).slice(0, 300));
    ok(out.own === me && out.ownChild === me + '.2' && out.ownUpper === me.toUpperCase() && Object.keys(out.twoKeys).length === 2 && !JSON.stringify(out.deep).includes(A1) && JSON.stringify(out.deep).includes('null'), 'r4 the asker\'s own key (child form, upper case) is kept; two masked keys are two entries; the too-deep subtree is dropped, never returned raw', out);
    ok(v({ s: A1 + ' and ' + A1 + '.1' }, [A1 + '.1']).s === B.MASKED_KEY + ' and ' + A1 + '.1', 'r4 an echo of what the asker said is kept even beside a masked one');
    const pre = M.load('src/browser-profiles.js', bsrc.replace("const KEY_IN_TEXT_RE = /bk-[0-9a-f]{8}(?:\\.\\d{1,4})?/gi;", "const KEY_IN_TEXT_RE = /\\bbk-[0-9a-f]{8}(?:\\.\\d{1,4})?\\b/g;"), 'pre-r4-belt-regex');
    const preOut = pre.agentAnswerView({ under: 'trace_' + A1, upper: A1.toUpperCase(), hexAfter: A1 + 'f' }, { me, foreign: fg, echoes: new Set() });
    ok(/bk-0000aaa1|BK-0000AAA1/.test(JSON.stringify(preOut)), 'CONTROL (i″): the pre-r4 word-boundary regex in a copy lets `trace_bk-…`, `BK-…` and `bk-…f` through — RED', preOut);
  }
  // the belt fails CLOSED: a body it cannot judge is answered as belt_failed, never raw
  const Rf = M.load('src/routes/browser.js', rsrcAll.replace('out = B.agentAnswerView(body, {', 'if (body && body.profiles) throw new Error(\'fake: cannot judge\'); out = B.agentAnswerView(body, {') + rawRoute, 'belt-throws'); Rf.setup(ctxFor(k));
  const srvF = await serve([Rf.router]); const jF = jAt(`http://127.0.0.1:${srvF.address().port}`);
  const warn0 = console.warn; console.warn = () => { }; // the belt's own warn line, expected here
  const rf = await jF('GET', '/api/agent/browser/raw', undefined, as(sB));
  console.warn = warn0;
  ok(rf.json && rf.json.code === 'belt_failed' && !rf.json.leases && !judge(rf.json, '/x', undefined).leaks.length, 'the belt fails CLOSED: a body it cannot judge is answered `belt_failed` — never the raw body', rf.json);
  srvF.close();
}

// ═══ ④b THE USER AS A HOLDER (BROWSE YOURSELF verify r1, H1) ═══════════════
console.log('— ④b the user browsing a profile himself: every agent READ byte-identical with and without him; no answer of the walk names him');
{
  const HM = require('../src/browser-human.js');
  const GETS = WALK(aEph && aEph.profileId, helperKey).filter(([m]) => m === 'GET');
  const reads = async (s) => { const out = []; for (const [m, p] of GETS) { const r = await j(m, p, undefined, as(s)); out.push(`${m} ${p} ${r.status} ${JSON.stringify(r.json)}`); } return out; };
  const HUMAN_RE = /hu-[0-9a-f]{8}|"human"\s*:|"holder"\s*:\s*"user"|"recordMine"/;
  const before = { A: await reads(sA), B: await reads(sB) };
  clock += 60000; // his press is LATER than every agent act above — a stamp it moved (lastUsedAt) would show
  const HALL = HM.humanKeyFor(PALL.id), HSEC = HM.humanKeyFor(P.id);
  const b1 = await k.browse(PALL.id); k.humanAttach({ key: HALL, viewerId: 'hv1', token: b1.fresh });
  const b2 = await k.browse(P.id); k.humanAttach({ key: HSEC, viewerId: 'hv2', token: b2.fresh }); k.humanRelease({ key: HSEC, viewerId: 'hv2' });
  ok(k.humanOf(PALL.id) && k.humanOf(PALL.id).state === 'driving' && k.humanOf(P.id) && k.humanOf(P.id).state === 'away' && k.list().leases.filter((l) => l.human).length === 2, 'fixture: the user browses p-all himself (driving) and p-secret (away) — two human holder rows in the digest', k.list().leases.filter((l) => l.human));
  const during = { A: await reads(sA), B: await reads(sB) };
  const diff = [];
  for (const who of ['A', 'B']) before[who].forEach((x, i) => { if (x !== during[who][i]) { let c = 0; const y = during[who][i]; while (c < x.length && x[c] === y[c]) c++; diff.push({ who, route: GETS[i][1], without: x.slice(Math.max(0, c - 60), c + 120), with: y.slice(Math.max(0, c - 60), c + 160) }); } });
  ok(!diff.length, `every agent READ (${GETS.length} GET routes × A admitted + B not) is BYTE-IDENTICAL with and without the user browsing — his presence, his driving / away and his press's instant are nobody's to read`, diff.slice(0, 4));
  const w = [];
  for (const s of [sA, sB, sR]) for (const [m, p, body] of WALK(aEph && aEph.profileId, helperKey)) { const r = await j(m, p, body, as(s)); const t = JSON.stringify(r.json); if (HUMAN_RE.test(t)) { const i = t.search(HUMAN_RE); w.push({ who: s.name, m, p, hit: t.match(HUMAN_RE)[0], at: t.slice(Math.max(0, i - 300), i + 60) }); } }
  ok(!w.length, 'the WHOLE walk (every agent route, A / B / R) while he browses: no answer names his key, a human row, his holder or his recording switch', w.slice(0, 4));
  const sw = await j('POST', '/api/agent/browser/backend', { provider: 'cloak', profile: 'p-all' }, as(sA));
  ok(!HUMAN_RE.test(JSON.stringify(sw.json)) && k.browserOf(PALL.id).state === 'ready', 'an agent\'s backend switch while he browses: never a stop under his page, and its answer names nobody (the belt masks a `hu-` key like another conversation\'s)', sw.json);
  // CONTROLS (scripts/mutant-copy.mjs): the pre-fix agent views — a lease view that keeps his row, a switcher read with him
  const bsrc = read('src/browser-profiles.js');
  const lneedle = "  if (l.human === true || /^hu-[0-9a-f]{8}$/.test(String(l.browserKey || ''))) return null;";
  ok(bsrc.includes(lneedle), 'the agent lease-view needle (the control below removes it)');
  const Bh = M.load('src/browser-profiles.js', bsrc.replace(lneedle, '').replace("  delete rest.lastUsedAt; delete rest.recordMine; delete ex.lastUsedAt; delete ex.recordMine;\n", ''), 'agent-sees-human');
  const facts = { browserKey: Bk, taskIds: [], groupsUnreadable: false };
  const real = JSON.stringify(B.agentDigestView(k.list(), facts, (id) => k.profile(id)));
  const pre = JSON.stringify(Bh.agentDigestView(k.list(), facts, (id) => k.profile(id)));
  ok(real !== pre && (pre.match(/"other":true/g) || []).length > (real.match(/"other":true/g) || []).length, 'CONTROL: the pre-fix PURE agent view counts his rows as other holders (and carries lastUsedAt) — the byte-identical leg can go red', { real: (real.match(/"other":true/g) || []).length, pre: (pre.match(/"other":true/g) || []).length });
  const rsrc = read('src/routes/browser.js');
  const sneedle = 'k.switcherView(p.id, { forAgent: true })';
  ok(rsrc.includes(sneedle), 'the agent switcher-read needle');
  const Rh = M.load('src/routes/browser.js', rsrc.replace(sneedle, 'k.switcherView(p.id)'), 'agent-switcher-with-human'); Rh.setup(ctxFor(k));
  const srvH = await serve([Rh.router]); const jH = jAt(`http://127.0.0.1:${srvH.address().port}`);
  const rh = await jH('GET', '/api/agent/browser/backend?profile=p-all', undefined, as(sB));
  const i0 = GETS.findIndex(([, p]) => p === '/api/agent/browser/backend?profile=p-all');
  ok(`GET /api/agent/browser/backend?profile=p-all ${rh.status} ${JSON.stringify(rh.json)}` !== before.B[i0], 'CONTROL: a routes copy whose agent switcher read sees him answers B differently while he browses (the row "driven") — red', null);
  srvH.close();
  // verify r2 (the revert table): in THIS fixture p-all is already `driven` (the user took over A's tab) and p-secret's row
  // shows no hold for an AWAY holder — so the byte-identical read above never saw a hold only HE makes, and the keeper's
  // `forAgent` half (switcherView without his input and his holder rows) reverted whole stayed GREEN (the route's needle was
  // the only pin). A profile only he drives, read the agent's way: identical with and without him; the user's own view
  // sees him (the fixture makes a hold); each layer alone keeps him out; both gone ⇒ RED
  {
    const faLeg = async (Kmod, tag) => {
      const kk = Kmod.create({ ...taskDeps, dataDir: DATA + '-fa-' + tag, homeDir: HOME, env: () => env, serverSetting: () => undefined, liveKeys: () => live, remoteKeys, runtime: F.createBrowserRuntime({ env }), facts: F.createBrowserFacts({ env }), log: { log() { }, warn() { }, error() { } }, install: false, now: () => clock, conversationFacts: (bk) => facts[bk] || { turn: null, name: null } });
      await kk._facts.probeVersion();
      const pp = kk.createProfile({ label: 'p-hand' }, { owner: { kind: 'instance', id: null } });
      await kk.attach({ profileId: pp.id, browserKey: A, sessionId: 'sess-a', by: 'user' });
      const agentRead = () => JSON.stringify(kk.switcherView(pp.id, { forAgent: true }).rows);
      const before = agentRead(), userBefore = JSON.stringify(kk.switcherView(pp.id).rows);
      const bb = await kk.browse(pp.id); kk.humanAttach({ key: HM.humanKeyFor(pp.id), viewerId: 'fa-' + tag, token: bb.fresh });
      const during = agentRead(), userDuring = JSON.stringify(kk.switcherView(pp.id).rows);
      try { await kk.stop(pp.id, { why: 'user' }); } catch { }
      kk.shutdown();
      return { same: before === during, userSees: userBefore !== userDuring };
    };
    const kr = await faLeg(K, 'real');
    ok(kr.same && kr.userSees, 'a profile only HE drives: the agent\'s switcher read is byte-identical with and without him, while the user\'s own view shows his hold (the fixture really makes one)', kr);
    const ksrc = read('src/server/browser-keeper.js');
    const L1 = 'inputs: inputsView({ withHumans: !forAgent })', L2 = 'humans: forAgent ? [] : humanRowsOn(p.id)';
    ok(ksrc.includes(L1) && ksrc.includes(L2), 'the two forAgent layers (the controls below remove them)');
    const kIn = await faLeg(M.load('src/server/browser-keeper.js', ksrc.replace(L1, 'inputs: inputsView()'), 'fa-inputs-only-gone'), 'in');
    const kHu = await faLeg(M.load('src/server/browser-keeper.js', ksrc.replace(L2, 'humans: humanRowsOn(p.id)'), 'fa-rows-only-gone'), 'hu');
    const kBoth = await faLeg(M.load('src/server/browser-keeper.js', ksrc.replace(L1, 'inputs: inputsView()').replace(L2, 'humans: humanRowsOn(p.id)'), 'fa-both-gone'), 'both');
    ok(kIn.same && kHu.same && !kBoth.same, 'CONTROLS: either forAgent layer alone keeps him out of the agent\'s read (two layers, each enough); with BOTH gone the agent reads his hold ("driven") — the leg above can go red', { inputsGone: kIn, rowsGone: kHu, bothGone: kBoth });
    // …and the BELT's own `hu-` mask (r1: "a raw route tomorrow"): a raw answer carrying his key through the REAL PURE belt is
    // masked; a belt copy without the mask hands it over — r1 added the mask with no control of its own
    const rawHuman = { h: k.humanOf(PALL.id), note: `the user ${HALL} browses p-all` };
    const viaBelt = JSON.stringify(B.agentAnswerView(rawHuman, { me: A, foreign: { ids: new Set(), pids: new Set() } }));
    const bsrc2 = read('src/browser-profiles.js');
    const mline = "    t = t.replace(HUMAN_KEY_IN_TEXT_RE, (m) => (said.has(m) ? m : MASKED_KEY)); // BROWSE YOURSELF verify r1: the user's key is nobody's to read (a proposal's reason, a raw route tomorrow)\n";
    const Bm = M.load('src/browser-profiles.js', bsrc2.replace(mline, ''), 'belt-no-human-mask');
    const viaNoMask = JSON.stringify(Bm.agentAnswerView(rawHuman, { me: A, foreign: { ids: new Set(), pids: new Set() } }));
    ok(rawHuman.h && !/hu-[0-9a-f]{8}/.test(viaBelt) && bsrc2.includes(mline) && viaNoMask.includes(HALL), 'the BELT masks his key in a raw answer (`bk-********`); CONTROL a belt copy without the `hu-` mask hands it to the agent — red', { viaBelt: viaBelt.slice(0, 200) });
  }
  await k.closeHuman(HALL); await k.endHuman(P.id, 'released');
}

// ═══ ⑤ THE SWITCH (r3's finding) ═══════════════════════════════════════════
console.log('— ⑤ THE SWITCH: an agent the list keeps out never switches a profile\'s backend directly (a proposal); admitted ⇒ direct; a remote session never');
{
  const { wiredCloak } = await import('./fixtures/browser-switcher-views.mjs');
  const resolveKey = () => ({ source: 'cluster', key: 'cb_x', clusterLabel: 'Team' });
  const base = { target: 'cloak', rowOf: wiredCloak.row, controlOf: wiredCloak.control, resolveKey, seats: { cloak: { tier: 'free', total: 1, at: 1 } }, majors: {}, hex: '0000002a', leases: [], by: { kind: 'agent' }, byKey: Bk, now: 1 };
  const prof = (owner) => ({ id: 'bp-1', label: 'p-secret', provider: 'chromium', dir: '/x', lastChromiumMajor: 140, owner });
  const T = [
    ['list only[A], B not admitted', prof({ kind: 'only', who: [{ kind: 'session', id: A }] }), false, 'proposal'],
    ['list only[task G], B not admitted', prof({ kind: 'only', who: [{ kind: 'task', id: 'T-G' }] }), false, 'proposal'],
    ['pre-list session A, B not admitted', prof({ kind: 'session', id: A }), false, 'proposal'],
    ['instance (everyone), B admitted', prof({ kind: 'instance', id: null }), true, 'switch'],
    ['list only[B], B admitted', prof({ kind: 'only', who: [{ kind: 'session', id: Bk }] }), true, 'switch'],
    ['not judged (null) — fail closed', prof({ kind: 'instance', id: null }), null, 'proposal'],
    ['the user (never a proposal for admission)', prof({ kind: 'only', who: [{ kind: 'session', id: A }] }), undefined, 'switch', { kind: 'user' }],
  ];
  const bad = T.filter(([, p, admitted, want, by]) => { const v = SW.switchVerdict({ ...base, profile: p, admitted, ...(by ? { by } : {}) }); return !(v.ok && v.mode === want); }).map(([n, p, admitted]) => [n, SW.switchVerdict({ ...base, profile: p, admitted })]);
  ok(!bad.length, `switchVerdict (${T.length} rows): an agent's switch of a profile it is NOT admitted to (a list, a task list, the pre-list shape) is a proposal; admitted ⇒ direct; not judged ⇒ proposal (fail closed); the user's switch is never a proposal for admission`, bad);
  const v0 = SW.switchVerdict({ ...base, profile: T[0][1], admitted: false });
  ok(/may not use the profile/.test(v0.reason) && /Who can use it/.test(v0.reason), 'the proposal\'s reason names the list ("Who can use it")', v0.reason);
  // the keeper over the wired-cloak world: B (not admitted) ⇒ proposal; A (admitted) ⇒ the real switch runs (a stop + a start); R ⇒ proposal
  const CLOAK_EXE = path.join(BIN, 'cloakbrowser'); fs.writeFileSync(CLOAK_EXE, `#!${process.execPath}\nprocess.exit(0);\n`, { mode: 0o755 });
  const kw = mkKeeper({ providers: wiredCloak, keys: { keyFor: () => ({ source: 'cluster', key: 'cb_x', clusterLabel: 'Team' }), sourceOf: () => ({ source: 'cluster' }) }, dataDir: path.join(ROOT, 'data-sw'), serverSetting: (key) => (key === 'browser.cloak.executablePath' ? CLOAK_EXE : undefined) });
  const pw = kw.createProfile({ label: 'kept' }, { owner: { kind: 'only', who: [{ kind: 'session', id: A }] }, createdBy: A });
  kw.reshapeStore((reg) => { const p = reg.profiles.find((x) => x.id === pw.id); p.lastChromiumMajor = 140; reg.seats.cloak = { tier: 'free', total: 3, at: clock, source: 'cluster' }; });
  const sw = async (bk, extra = {}) => { try { return await kw.switchBackend({ profileId: pw.id, target: 'cloak', by: { kind: 'agent' }, browserKey: bk, sessionId: 'x', ...extra }); } catch (e) { return { threw: e.code, error: e.message }; } };
  const vB = await sw(Bk);
  ok(vB.ok && vB.mode === 'proposal' && /may not use/.test(vB.reason) && kw.profile(pw.id).provider === 'chromium', 'the keeper: B\'s switch of a profile kept to A is a PROPOSAL — nothing stopped, the provider unchanged', vB);
  const vR = await sw(Rk);
  ok(vR.ok && vR.mode === 'proposal' && kw.profile(pw.id).provider === 'chromium', 'the keeper: a remote session\'s switch is a proposal too (never admitted)', vR);
  const vG = await sw(Bk, { taskIds: ['T-G'] });
  ok(vG.ok && vG.mode === 'proposal', 'the keeper: B in a Task Group the list does not name — still a proposal', vG);
  kw.reshapeStore((reg) => { const p = reg.profiles.find((x) => x.id === pw.id); p.owner = { kind: 'only', who: [{ kind: 'task', id: 'T-G' }] }; });
  const vG2 = await sw(Bk, { taskIds: ['T-G'] });
  ok(vG2.ok && vG2.mode !== 'proposal' && kw.profile(pw.id).provider === 'cloak', 'the keeper: B admitted THROUGH its Task Group ⇒ the switch runs (provider now cloak)', vG2);
  try { await kw.stop(pw.id, { why: 'user' }); } catch { /* fake */ }
  // CONTROL (j): the pre-fix rule restored (owner.kind === 'session') ⇒ the list shapes switch directly — RED
  const swsrc = read('src/browser-switch.js');
  const pre = swsrc.replace(/    else if \(admitted !== true\) \{ mode = 'proposal'; reason = admitted === false \? '[^']*' : '[^']*'; \}/, "    else if (profile.owner && profile.owner.kind === 'session' && byKey && profile.owner.id !== byKey) { mode = 'proposal'; reason = 'this conversation does not own the profile'; }");
  const SWp = M.load('src/browser-switch.js', pre, 'pre-fix-owner-rule');
  const direct = T.slice(0, 3).map(([n, p]) => [n, SWp.switchVerdict({ ...base, profile: p, admitted: false }).mode]);
  ok(pre !== swsrc && direct[0][1] === 'switch' && direct[1][1] === 'switch' && direct[2][1] === 'proposal', 'CONTROL (j): the pre-fix rule (owner.kind === \'session\') in a copy: the list and the task list switch DIRECTLY, only the retired pre-list shape proposes — the table is RED on it', direct);
}

// ═══ ⑥ THE FRESH-KEY RULE (identity r4) ═════════════════════════════════════
console.log('— ⑥ THE FRESH-KEY RULE (r4): a browser key is 32 bits and carries every authority; a key any store still names is never minted again (keeper registry + maps, env bindings / directory / meta, the live sessions); the ONE mint site goes through it');
{
  // the reproduction that opened this section (r4): a STOPPED conversation's key still on a list row, its pin, its `told`
  // — a NEW conversation minted with the same 8 hex digits inherited its attachments, alias, pin and admission (the keeper
  // judges by key). Before the rule the mint was `mintBrowserKey(randomBytes(4))` with no check (the profile id, the grant
  // token and the blocked-claim id each loop for uniqueness; the key did not).
  const OLD = 'bk-0000dead';
  ok(k.keyNamed(OLD) === false && be.keyNamed(OLD) === false, '⑥ a key nothing names is fresh on both sides');
  // the keeper: each place a key may be named — the whole serialized registry is scanned, so every field counts
  const kn = (mut) => { let r; k.reshapeStore((reg) => { const snap = JSON.stringify(reg); mut(reg); r = k.keyNamed(OLD); Object.assign(reg, JSON.parse(snap)); for (const key of Object.keys(reg)) if (!(key in JSON.parse(snap))) delete reg[key]; }); return r; };
  const pk = plant({ kind: 'instance', id: null }, 'p-fresh');
  const places = [
    ['a list row', (reg) => { reg.profiles.find((p) => p.id === pk.id).owner = { kind: 'only', who: [{ kind: 'session', id: OLD }] }; }],
    ['createdBy', (reg) => { reg.profiles.find((p) => p.id === pk.id).createdBy = OLD; }],
    ['an ephemeral record\'s owner', (reg) => { reg.profiles.push({ ...B.newProfileRecord({ id: 'bp-0000eeee', label: 'eph', dir: path.join(HOME, 'x'), now: clock }), owner: { kind: 'conversation', id: OLD }, ephemeral: true }); }],
    ['a lease', (reg) => { reg.leases.push({ profileId: pk.id, browserKey: OLD, sessionId: 'sess-old', since: clock, input: 'agent', targetId: null }); }],
    ['a pin', (reg) => { reg.pins[OLD] = { profileId: pk.id, origin: 'chosen', at: clock, by: 'agent' }; }],
    ['a cap', (reg) => { reg.caps[OLD] = { cap: 2, group: null, at: clock }; }],
    ['the told memory', (reg) => { reg.told[OLD] = { fingerprint: 'x', at: clock }; }],
    ['a child handle', (reg) => { reg.children[OLD + '.1'] = { parent: OLD, since: clock }; }],
    ['a blocked claim', (reg) => { reg.blocked.push({ id: 'bl-00000001', browserKey: OLD, sessionId: 'sess-old', profileId: pk.id, url: 'https://x', why: 'x', at: clock }); }],
    ['a tabClosed mark', (reg) => { reg.tabClosed[pk.id + '|' + OLD] = clock; }],
  ];
  for (const [name, mut] of places) ok(kn(mut) === true, `⑥ the keeper: ${name} naming the key ⇒ named`);
  ok(k.keyNamed(OLD) === false, '⑥ …and with every one of them undone the key is fresh again (the probe mutated a snapshot, not the store)');
  ok(kn((reg) => { reg.pins[OLD + '.2'] = { profileId: pk.id }; }) === true && k.keyNamed(OLD + '.7') === false && kn((reg) => { reg.pins['bk-0000dea0'] = { profileId: pk.id }; }) === false && kn((reg) => { reg.profiles.find((p) => p.id === pk.id).label = 'not bk-0000deadbeef'; }) === false, '⑥ the keeper: a child form names its parent; a neighbouring key, a longer hex run and a child of an unnamed key do not');
  // the env: the bindings, the directory entries, the scratch dir, the meta files
  ok(be.keyNamed(OLD) === false, '⑥ the env: nothing names the key yet');
  const ENV_DIR = path.join(DATA, 'browser-env'); fs.mkdirSync(ENV_DIR, { recursive: true });
  for (const n of [OLD + '.json', OLD + '.profile', OLD + '.cwd', OLD + '.3.json']) { fs.writeFileSync(path.join(ENV_DIR, n), '{}'); ok(be.keyNamed(OLD) === true, `⑥ the env: a directory entry ${n} ⇒ named`); fs.unlinkSync(path.join(ENV_DIR, n)); }
  ok(be.keyNamed(OLD) === false, '⑥ the env: the entries removed ⇒ fresh');
  fs.mkdirSync(path.join(DATA, 'browser-profiles', OLD), { recursive: true }); ok(be.keyNamed(OLD) === true, '⑥ the env: the scratch profile directory ⇒ named'); fs.rmdirSync(path.join(DATA, 'browser-profiles', OLD));
  fs.mkdirSync(path.join(DATA, 'session-meta'), { recursive: true }); fs.writeFileSync(path.join(DATA, 'session-meta', 'sess-old.json'), JSON.stringify({ browserKey: OLD })); ok(be.keyNamed(OLD) === true, '⑥ the env: a session-meta file naming the key ⇒ named'); fs.unlinkSync(path.join(DATA, 'session-meta', 'sess-old.json'));
  ok(be.bindings.record('e2e00000-0000-4000-8000-oldconv00000', OLD) === true && be.keyNamed(OLD) === true, '⑥ the env: a binding ⇒ named');
  ok(be.keyNamed('bk-0000dea0') === false && be.keyNamed(OLD + '.4') === true && be.keyNamed('not-a-key') === false, '⑥ the env: a neighbour is fresh, a child form names its parent, a non-key is never named');
  // the PURE loop
  const seq = (arr) => { let i = 0; return () => arr[i++] || 'bk-0000cafe'; };
  const named = (x) => k.keyNamed(x) || be.keyNamed(x);
  const r1 = B.freshBrowserKey({ mint: seq([OLD, OLD, 'bk-0000beef']), named });
  ok(r1.key === 'bk-0000beef' && r1.retries === 2 && r1.exhausted === false, '⑥ freshBrowserKey skips the named candidates and says how many', r1);
  const r2 = B.freshBrowserKey({ mint: () => OLD, named: () => true, tries: 5 });
  ok(r2.key === OLD && r2.retries === 5 && r2.exhausted === true && B.FRESH_KEY_TRIES >= 16, '⑥ an exhausted loop returns the last candidate and SAYS so (a create is never refused for it)', r2);
  ok(B.freshBrowserKey({ mint: seq(['bk-0000f00d']) }).key === 'bk-0000f00d', '⑥ with no rule given nothing is named');
  let threw = false; try { B.freshBrowserKey({ mint: seq(['bk-0000f00d']), named: () => { throw new Error('store'); } }); } catch { threw = true; }
  ok(threw, '⑥ a rule that throws is the caller\'s to catch (ws-create says so and mints unchecked)');
  // the ONE mint site: src/server/browser-key.js `mintKey` (the .197 integration moved r4's ws-create-local rule there so
  // the spawn AND the late key — `ensureBrowserKey` — both go through it) over the live sessions + both stores' rule
  const bksrc = stripComments(read('src/server/browser-key.js'));
  const mintSites = bksrc.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /mintBrowserKey\(/.test(l));
  ok(mintSites.length === 1 && /const rawMint = \(\) => B\.mintBrowserKey\(crypto\.randomBytes\(4\)/.test(mintSites[0][1]), '⑥ browser-key.js has ONE raw mint (`rawMint`) — the randomness in one place', mintSites);
  ok(/B\.freshBrowserKey\(\{ mint: rawMint, named: keyNamed \}\)/.test(bksrc) && /be0\.keyNamed\(k\)/.test(bksrc) && /kp0\.keyNamed\(k\)/.test(bksrc) && /for \(const \[, es\] of sessions\) if \(es && es\._browserKey && B\.parentKeyOf\(String\(es\._browserKey\)\) === k\) return true;/.test(bksrc) && /mintFacts = \{ activeSessions, browserEnv: be, keeper: kp, log \};/.test(bksrc), '⑥ browser-key.js: THE mint goes through the fresh rule over the live sessions + the env\'s + the keeper\'s rule, with the facts the wiring registers at create()');
  const wsrc = stripComments(read('src/ws-create.js'));
  ok(/browserKeyFor\(\{\s*prior, resume: [^}]*fork: [^}]*\n\s*mint: browserKeyMod\.mintKey,[^\n]*\n\s*\}\)/.test(wsrc) && /const bk = B\.browserKeyFor\(\{ prior: v\.reuse, resume: true, fork: false, mint: mintKey \}\);/.test(bksrc), '⑥ the spawn (ws-create) and the late key (ensureBrowserKey) both hand THE mint to the ladder');
  const otherMints = ['src/ws-create.js', 'src/routes/browser.js', 'src/server/browser-keeper.js', 'src/server/browser-env.js', 'src/server/browser-bindings.js', 'server.js', 'src/ws-handler.js'].map((f) => [f, (stripComments(read(f)).match(/mintBrowserKey\(|freshBrowserKey\(/g) || []).length]).filter(([, n]) => n > 0);
  ok(otherMints.length === 0, '⑥ no other module mints a browser key or runs its own fresh rule (the census over the callers, ws-create included)', otherMints);
  // the runtime: THE mint with a registered fact naming the first candidates skips them (the rule is wired, not only spelled)
  {
    const BKm = require('../src/server/browser-key.js');
    const liveOld = new Map([['sess-live', { _browserKey: OLD }]]);
    const Bprof = B; // the same module object browser-key.js reads `mintBrowserKey` off
    const realMint = Bprof.mintBrowserKey; let n = 0;
    Bprof.mintBrowserKey = (hex) => (n++ < 2 ? OLD : realMint(hex));
    let got; try { got = BKm.mintKey({ activeSessions: liveOld, browserEnv: () => be, keeper: () => k, log: { warn() { } } }); } finally { Bprof.mintBrowserKey = realMint; }
    ok(got !== OLD && B.isBrowserKey(got) && n === 3, '⑥ runtime: THE mint skips a key a live session still holds (two named candidates, the third taken)', { got, n });
  }
  // CONTROLS: (l) the loop without its rule mints the named key; (l′) browser-key.js with the raw mint restored fails the wiring pin
  const bsrc = read('src/browser-profiles.js');
  const nl = "    if (!named(key)) return { key, retries, exhausted: false };";
  ok(bsrc.split(nl).length === 2, '⑥ control setup: the rule\'s one line is found once');
  const Bm = M.load('src/browser-profiles.js', bsrc.replace(nl, "    if (true) return { key, retries, exhausted: false };"), 'no-fresh-rule');
  const rl = Bm.freshBrowserKey({ mint: seq([OLD, 'bk-0000beef']), named });
  ok(rl.key === OLD, 'CONTROL (l): the loop without its rule (a copy) hands out the key the store still names — RED', rl);
  const bkRaw = read('src/server/browser-key.js').replace(/B\.freshBrowserKey\(\{ mint: rawMint, named: keyNamed \}\)/, '{ key: rawMint(), retries: 0, exhausted: false }');
  const bkRawPath = M.write('src/server/browser-key.js', bkRaw, 'raw-mint');
  ok(bkRaw !== read('src/server/browser-key.js') && !/B\.freshBrowserKey\(\{ mint: rawMint, named: keyNamed \}\)/.test(stripComments(fs.readFileSync(bkRawPath, 'utf8'))), 'CONTROL (l′): browser-key.js with the raw mint restored (a copy) fails the wiring pin — RED');
  k.reshapeStore((reg) => { reg.profiles = reg.profiles.filter((p) => p.id !== pk.id); });
}

// ═══ ⑦ A TASK GROUP CHANGE RE-JUDGES AT ONCE (identity r4) ══════════════════
console.log('— ⑦ A TASK GROUP CHANGE (r4): a conversation removed from the Task Group a profile is kept to loses the lease AT ONCE — its mediated grant revoked — not at its next command; a stopped member stays undecided; the task store\'s onChange calls the ONE hook');
{
  // the reproduction (r4, on the real keeper + mediator over a fake CDP upstream): admitted through T-G to a mediated
  // profile, A's lease + grant + a Runtime.evaluate through a raw CDP client on the mediated url ALL STOOD after A left
  // the group; only A's own next CLI verb (verb-time re-judge) ended them — an agent that sent no verb kept the browser
  const KT = 'bk-0000aa77', KS = 'bk-0000aa78';
  for (const b of Object.values(k.list().browsers)) if (B.isLiveBrowser(b)) { try { await k.stop(b.profileId, { why: 'user' }); } catch { /* fake */ } } // the earlier sections' browsers: this section needs the machine ceiling free
  const sT = mkSession('sess-t', KT, 'Group chat', { rungD: true }); active.set('sess-t', sT); live.add(KT); facts[KT] = { turn: 'idle', name: 'Group chat' };
  const sS = mkSession('sess-s2', KS, 'Stopped member', { rungD: true }); active.set('sess-s2', sS); live.add(KS); facts[KS] = { turn: 'idle', name: 'Stopped member' };
  groupsOf.set(KT, ['T-G']); groupsOf.set(KS, ['T-G']);
  const pg = plant({ kind: 'only', who: [{ kind: 'task', id: 'T-G' }] }, 'p-group-med', { sharing: 'instance' });
  let r = await j('POST', '/api/agent/browser/use', { profile: 'p-group-med' }, as(sT)); ok(r.status === 200, '⑦ T (in T-G) uses the kept mediated profile', r.json);
  r = await j('POST', '/api/agent/browser/resolve', { handle: 'p-group-med', argv: ['open', 'https://x'], wrapper: true }, as(sT)); ok(r.status === 200 && !!med._grant(pg.id, KT), '⑦ T resolves a command: the mediator holds its grant', r.json && r.json.code);
  r = await j('POST', '/api/agent/browser/use', { profile: 'p-group-med' }, as(sS)); ok(r.status === 200, '⑦ S (in T-G) uses it too', r.json);
  active.delete('sess-s2'); live.delete(KS); // S stops — its lease persists through the grace by design
  // the change: T is removed from T-G (or T-G is deleted) — nothing else; the hook runs (what server.js's tasks onChange calls)
  groupsOf.set(KT, []);
  ok(k.leasesOn(pg.id).some((l) => l.browserKey === KT) && !!med._grant(pg.id, KT), '⑦ before the hook: T\'s lease and grant stand (the pre-fix state, reproduced)');
  const rj = k.rejudgeAll('task-groups-changed');
  ok(rj.profiles === 1 && rj.detached.length === 1 && rj.detached[0].browserKey === KT && rj.detached[0].profileId === pg.id, '⑦ the hook detaches exactly T', rj);
  ok(!k.leasesOn(pg.id).some((l) => l.browserKey === KT) && !med._grant(pg.id, KT), '⑦ T\'s lease is gone and its mediated grant revoked (its connections closed 1008 lease_gone — test-browser-mediation ③)');
  ok(k.leasesOn(pg.id).some((l) => l.browserKey === KS) && rj.undecided.includes(KS), '⑦ the STOPPED member\'s lease is kept, undecided (no running session carries its key — judged at its next command)');
  r = await j('POST', '/api/agent/browser/resolve', { handle: 'p-group-med', argv: ['open', 'https://x'], wrapper: true }, as(sT));
  ok(r.status === 409 && r.json.code === 'profile_changed', '⑦ T\'s next verb is refused profile_changed (its set changed under it), the lease never re-granted', r.json && r.json.code);
  r = await j('POST', '/api/agent/browser/resolve', { handle: 'p-group-med', argv: ['open', 'https://x'], wrapper: true }, as(sT));
  ok(r.status === 404 && r.json.code === 'not_attached', '⑦ …then not_attached (no lease to act through)', r.json && r.json.code);
  // a change that KEEPS T (still in T-G) detaches nothing; a list with only session rows is never walked
  groupsOf.set(KT, ['T-G']); r = await j('POST', '/api/agent/browser/use', { profile: 'p-group-med' }, as(sT)); ok(r.status === 200, '⑦ T re-admitted through T-G');
  const rj2 = k.rejudgeAll('task-groups-changed'); ok(rj2.profiles === 1 && rj2.detached.length === 0 && k.leasesOn(pg.id).some((l) => l.browserKey === KT), '⑦ a change that keeps T detaches nothing', rj2);
  const ps = plant({ kind: 'only', who: [{ kind: 'session', id: KT }] }, 'p-session-only');
  r = await j('POST', '/api/agent/browser/use', { profile: 'p-session-only' }, as(sT)); ok(r.status === 200, '⑦ T uses a profile listed by its session row', r.json);
  groupsOf.set(KT, []); const rj3 = k.rejudgeAll('task-groups-changed');
  ok(rj3.profiles === 1 && rj3.detached.length === 1 && k.leasesOn(ps.id).some((l) => l.browserKey === KT), '⑦ a session-row list is not walked by a group change (T keeps p-session-only, loses p-group-med)', rj3);
  // THE WIRING: server.js's tasks onChange calls the ONE hook on the keeper singleton
  const ssrc = stripComments(read('server.js'));
  const hook = /onChange: \(list\) => \{[\s\S]*?type: 'tasks-updated'[\s\S]*?const rj = require\('\.\/src\/server\/browser-keeper\.js'\)\.keeper\(\)\?\.rejudgeAll\?\.\('task-groups-changed'\);[\s\S]*?for \(const d of \(rj && rj\.detached\) \|\| \[\]\)[\s\S]*?sessionStatus\.pushNotice\(sessionStatusKey\(s, d\.sessionId\), \{ \.\.\.require\('\.\/src\/browser-profiles\.js'\)\.profileChangeNotice\(\{ was: label, now: '', by: 'user', handles: \[\] \}\), kind: 'browser-profile' \}\)[\s\S]*?\n  \},/;
  ok(hook.test(ssrc), '⑦ server.js: the task store\'s onChange (after the tasks-updated broadcast) calls keeper().rejudgeAll(\'task-groups-changed\') and pushes each detached conversation the PATCH\'s own browser-profile notice (heard at its next message)');
  ok((stripComments(read('src/server/browser-keeper.js')).match(/function rejudgeAll\(/g) || []).length === 1 && /rejudgeLeases\(p\.id, why, \{ quietUndecided: true \}\)/.test(read('src/server/browser-keeper.js')), '⑦ the keeper: ONE rejudgeAll over rejudgeLeases (the §3.1 ONE re-judge), quiet on the undecided');
  // CONTROLS: (m) server.js without the hook line fails the wiring pin; (m′) a keeper copy that skips task-row lists leaves T's lease standing
  const noHook = read('server.js').replace(/const rj = require\('\.\/src\/server\/browser-keeper\.js'\)\.keeper\(\)\?\.rejudgeAll\?\.\('task-groups-changed'\);/, 'const rj = null;');
  const noHookPath = M.write('server.js', noHook, 'no-rejudge-hook');
  ok(noHook !== read('server.js') && !hook.test(stripComments(fs.readFileSync(noHookPath, 'utf8'))), 'CONTROL (m): server.js with the hook line removed (a copy) fails the wiring pin — RED');
  const ksrc = read('src/server/browser-keeper.js');
  const nk = "      if (!U || U.mode !== 'only' || !U.who.some((w) => w.kind === 'task')) continue;";
  ok(ksrc.split(nk).length === 2, '⑦ control setup: the walk\'s one filter line is found once');
  const Km = M.load('src/server/browser-keeper.js', ksrc.replace(nk, "      if (true) continue;"), 'no-task-walk');
  groupsOf.set(KT, ['T-G']); r = await j('POST', '/api/agent/browser/use', { profile: 'p-group-med' }, as(sT)); ok(r.status === 200, '⑦ T re-admitted for the control');
  const km = Km.create({ ...taskDeps, dataDir: DATA, homeDir: HOME, env: () => env, serverSetting: () => undefined, liveKeys: () => live, remoteKeys, runtime: F.createBrowserRuntime({ env }), facts: F.createBrowserFacts({ env }), log: { log() { }, warn() { }, error() { } }, install: false, now: () => clock, conversationFacts: (bk) => facts[bk] || { turn: null, name: null } });
  groupsOf.set(KT, []);
  const rjm = km.rejudgeAll('task-groups-changed');
  ok(rjm.profiles === 0 && rjm.detached.length === 0 && km.leasesOn(pg.id).some((l) => l.browserKey === KT), 'CONTROL (m′): a keeper copy that never walks a task-row list leaves T\'s lease standing after the group change — RED', rjm);
  try { km.shutdown(); } catch { /* none */ }
  const rjr = k.rejudgeAll('task-groups-changed'); ok(rjr.detached.length === 1 && !k.leasesOn(pg.id).some((l) => l.browserKey === KT), '⑦ …and the real keeper detaches it');
}

for (const x of copiesCensus(M.files, M.dir, REPO, { minCopies: 16 })) ok(x.pass, x.name + (x.pass ? '' : ' — ' + x.detail));

try { for (const p of k.list().profiles) await k.stop(p.id).catch(() => { }); } catch { /* none */ }
try { k.shutdown(); } catch { /* none */ }
srv.close();
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
