#!/usr/bin/env node
// HARNESS HONESTY — PART 0 + SOURCE PINS (fast, text only — lane lg-text-legs-2, B-94d3 part two). MOVED VERBATIM from the heavy
// scripts/test-harness-honesty.mjs (its REAL wrapper against a stub app-server, the ACP and three-producer legs and the headless-chrome
// image card stay there): Part 0 the caps row as the ONE vocabulary (the caps table of src/backend-caps.js, the PURE predicates of
// src/lib/agent-meta.js, the source pins of src/ws-create.js, src/ws-handler.js, src/lib/chat-status-bar.js, src/lib/chat-view.js,
// src/lib/session-props.js, src/server/wrapper-files.js, src/session-schema.js, src/server/boot-restore.js); Part 3's union census
// (src/acp-message-manager.js); Part 4's pins (data/bin/codex-chat-wrapper.js, src/codex-thread-read.js, src/lib/chat-renderers.js,
// src/lib/chat-view.js); the version marker over its ten sites + docs/changelog-engineering.md's entry, and the docs legs (docs/kb-file-structure.md,
// docs/kb-features.md, docs/kb-api.md). Each file is read BY NAME, so ci.mjs's affected rule selects this suite on a change of any of them.
// Run: node scripts/test-harness-honesty-pins.mjs
import './scratch.mjs';   // FIRST (B-ba47): a suite that reads a home or loads a module that does takes the re-home before any of its code (§113 THE ROW: a NEW one takes the import)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof n !== 'string') throw new TypeError('ok(): the leg name is not a string — a swapped call (scripts/lib/check.mjs)'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const { capsOf, BACKEND_CAPS } = require(path.join(REPO, 'src/backend-caps.js'));

// ═════════ Part 0 — the caps row is the ONE vocabulary ═════════
console.log('— caps row');
{
  for (const id of Object.keys(BACKEND_CAPS)) {
    const rs = BACKEND_CAPS[id].responseStyle;
    ok(rs && typeof rs.live === 'boolean' && typeof rs.closed === 'boolean' && Array.isArray(rs.values), `${id}: declares responseStyle {live, closed, values}`, JSON.stringify(rs));
  }
  ok(capsOf('codex').responseStyle.live === true, 'codex can be re-styled LIVE (thread/settings/update)');
  ok(JSON.stringify(capsOf('codex').responseStyle.values) === JSON.stringify(['none', 'friendly', 'pragmatic']),
    "codex's values ARE the 0.153.4 Personality enum (schema-read, not remembered)", JSON.stringify(capsOf('codex').responseStyle.values));
  ok(capsOf('claude').responseStyle.live === false && capsOf('claude').responseStyle.values.length === 4,
    'claude is spawn-only (--settings outputStyle) with its four output styles');
  // OPEN vs CLOSED is not decoration: claude's ~/.claude/output-styles/*.md are
  // real user-defined styles, so `values` there is only what the PICKER offers
  // and validating a spawn against it would silently eat a user's own style.
  ok(capsOf('codex').responseStyle.closed === true && capsOf('claude').responseStyle.closed === false,
    "codex's enum is CLOSED (the RPC rejects anything else); claude's is OPEN (custom output-style files)");
  {
    const wc = read('src/ws-create.js');
    ok(/return \(!rs\.closed \|\| rs\.values\.includes\(want\)\) \? want : '';/.test(wc),
      'ws-create drops an out-of-enum value ONLY for a closed vocabulary (an open one passes through)');
    const whs = read('src/ws-handler.js');
    ok(/if \(style && rs\.closed && !rs\.values\.includes\(style\)\)/.test(whs), 'the ws case applies the same open/closed rule');
  }
  ok(capsOf('shell').responseStyle.values.length === 0 && capsOf('opencode').responseStyle.values.length === 0,
    'shell + opencode declare no style knob at all (the chip is not drawn)');
  ok(capsOf('gemini').responseStyle.live === false && capsOf('gemini').responseStyle.values.length === 0,
    "an unknown backend gets the no-knob row (never codex's by accident)");
  const BM = await import(path.join(REPO, 'src/lib/agent-meta.js'));
  for (const id of Object.keys(BM.BACKEND_META)) {
    const caps = BM.BACKEND_META[id].caps;
    if (!caps) continue; // shell carries no caps object
    ok(JSON.stringify(caps.responseStyle) === JSON.stringify(capsOf(id).responseStyle),
      `${id}: client META caps.responseStyle deep-equals the server row (no drift)`, JSON.stringify({ client: caps.responseStyle, server: capsOf(id).responseStyle }));
  }
  ok(BM.responseStyleLabel('codex', 'friendly').startsWith('friendly — '), 'a picker label is the PROTOCOL value + its hint (the value itself is never translated)', BM.responseStyleLabel('codex', 'friendly'));
  ok(BM.responseStyleLabel('codex', 'made-up') === 'made-up', 'a value with no hint labels as itself');
  const sb = read('src/lib/chat-status-bar.js');
  // r2: the row is gated on the HARNESS caps row AND the RUNNING WRAPPER's own
  // advert — with caps alone, every codex session spawned before the live
  // switch got a refusal, no restart row and an invisible saved pick.
  ok(/if \(!styleAppliesLive\(caps, this\._responseStyleLive\) && this\._onRestartSession/.test(sb),
    'the "Restart now to apply" row is gated on styleAppliesLive(caps, wrapper advert) — never on a backend id');
  ok(/if \(styleAppliesLive\(caps, this\._responseStyleLive\)\) \{/.test(sb), '…and so is the choice between "send the live verb" and "save it for the next resume"');
  ok(!/showToast\(s\.v \? t\('Response style .{0,40}applies from the next turn/.test(sb),
    'the live-switch SUCCESS toast is NOT fired at click time (it announced a switch the server was about to refuse)');
  {
    const cv = read('src/lib/chat-view.js');
    ok(/if \(msg\.live\) showToast\(msg\.outputStyle/.test(cv), '…it fires on the server\u2019s response-style-updated ECHO instead');
    ok(/if \('responseStyleLive' in meta\) this\._statusBar\?\.setResponseStyleLive\?\.\(meta\.responseStyleLive\)/.test(cv),
      'the client learns the wrapper advert from the attach payload (carries-the-key guard, like queueSupported)');
    ok(/if \(msg\.code === 'style-wrapper-old'\) this\._statusBar\?\.setResponseStyleLive\?\.\(false\)/.test(cv),
      "only the 'style-wrapper-old' refusal flips the flag (self-heal, no reload) — a transient/other refusal changes no belief");
    ok(!/if \(msg\.code === 'style-not-live'\) this\._statusBar/.test(cv),
      "…and 'style-not-live' does NOT: it also covers a sidecar not written yet and a session that just died (the 2.363.1 one-code-many-meanings law)");
    ok(/setResponseStyleLive\(v\) \{ this\._responseStyleLive = \(v === undefined \|\| v === null\) \? undefined/.test(sb),
      'null on the wire (server: "the wrapper has not reported yet") is UNKNOWN on the client, never false');
    ok(/responseStyleLive: wcapsAttach\./.test(read('src/ws-handler.js')) && /const wcapsAttach = wrapperCaps\(/.test(read('src/ws-handler.js')),
      'the server publishes that advert on attach, from the SAME sidecar read as queueSupported (resolveWrapperFiles walks /proc when the sidecar is missing)');
    ok(/NO `responseStyleLive` here, deliberately/.test(read('src/ws-create.js')), 'the created payload states WHY it cannot know yet (undefined = try it)');
  }
  // the PURE predicate itself (a DOM-free client rule needs a functional test)
  {
    const LIVE = { live: true, closed: true, values: ['none'] }, SPAWN = { live: false, closed: false, values: ['Concise'] };
    ok(BM.styleAppliesLive(LIVE, undefined) === true, 'styleAppliesLive: live harness, wrapper not yet known ⇒ TRY it');
    ok(BM.styleAppliesLive(LIVE, true) === true, 'styleAppliesLive: live harness + a wrapper that adverts it ⇒ live');
    ok(BM.styleAppliesLive(LIVE, false) === false, 'styleAppliesLive: live harness but an OLD wrapper ⇒ needs a restart');
    ok(BM.styleAppliesLive(SPAWN, true) === false, 'styleAppliesLive: a spawn-only harness is never live, whatever the wrapper says');
    ok(BM.styleAppliesLive(null, true) === false, 'styleAppliesLive: no caps row ⇒ never live');
  }
  // …and the ORIGIN label rule (r2: it called the instance default "your
  // choice" whenever ANY pick existed, contradicting the note beside it)
  {
    ok(BM.responseStyleOrigin('Concise', 'Concise') === 'chosen', 'origin: live === picked ⇒ the user\u2019s choice');
    ok(BM.responseStyleOrigin('Explanatory', 'Concise') === 'spawn', 'origin: a DIFFERENT pick is saved ⇒ the live value is what the session started with (never "your choice")');
    ok(BM.responseStyleOrigin('Explanatory', undefined) === 'instance', 'origin: no pick here ⇒ the instance default');
    ok(BM.responseStyleOrigin('Explanatory', null) === 'spawn', 'origin: a CLEARED pick still differs from the live value');
    ok(BM.responseStyleOrigin('', 'Concise') === 'saved', 'origin: stopped session + a pick ⇒ saved for the next resume');
    ok(BM.responseStyleOrigin('', undefined) === 'harness', 'origin: nothing anywhere ⇒ the harness default');
    ok(/const origin = ORIGIN_LABEL\[responseStyleOrigin\(live, picked\)\]\(\)/.test(read('src/lib/session-props.js')),
      'Session Properties uses that ONE rule (wiring pin — a pure fix with no call site is dead code)');
  }
  ok(!/=== 'codex'|=== 'claude'/.test(sb.slice(sb.indexOf('const styleEl'), sb.indexOf('const effortEl'))), 'the style menu contains no backend-id branch');
  ok(/const STYLES = \[\{ v: '', label: t\('agent default'\) \}, \.\.\.caps\.values\.map/.test(sb), 'the menu rows ARE the caps values (no hardcoded list)');
  const wh = read('src/ws-handler.js');
  ok(/case 'set-response-style'/.test(wh) && /capsOf\(session\.backend\)\.responseStyle/.test(wh) && /code = 'style-not-live'/.test(wh) && /scope: 'action'/.test(wh),
    "ws 'set-response-style' gates on the caps row and refuses with a coded, scope:'action' error");
  ok(/const wcaps = wrapperCaps\(BUFFERS_DIR, data\.sessionId, session\.socketPath\);\s*\n\s*if \(!wcaps\.responseStyle\)/.test(wh),
    '…and on the RUNNING wrapper\u2019s own advert too (a session spawned before this release drops the verb silently)');
  ok(/wcaps\.reason === 'no-sidecar' \? 'style-not-live' : 'style-wrapper-old'/.test(wh),
    '…and the two refusals carry DIFFERENT codes: "restart to change it" vs "not reported yet, try again"');
  ok(/responseStyleLive: wcapsAttach\.reason === 'no-sidecar' \? null : !!wcapsAttach\.responseStyle/.test(wh),
    'the attach advert is TRI-STATE: a sidecar not written yet is null (unknown), never a false that would wear a restart row');
  ok(/responseStyle: !!\(caps && caps\.responseStyle\)/.test(read('src/server/wrapper-files.js')), 'wrapperCaps reads that advert from the sidecar the WRAPPER writes (never session-meta \u2014 the 2.364.1 lesson)');
  // RESTART SURVIVAL: a live style must not evaporate when the server restarts
  // (the chip would report "default" for a session really running one).
  ok(/outputStyle: session\._outputStyle \|\| null,/.test(read('src/ws-create.js')) && /Promise\.resolve\(session\.sockName \? writeSessionMeta\(session\.sockName, \{ \.\.\.readSessionMeta\(session\.sockName\), outputStyle: session\._outputStyle \}, \{ durable: true \}\) : true\)\.then\(\(ok\) => \{\n\s+broadcastToSession\(session, data\.sessionId, \{ type: 'response-style-updated'/.test(wh),
    'the effective style is written to session meta at spawn AND on every live change — the live change\u2019s write asked DURABLE (lane hub-loop-stalls commit 2: the store writer), its «response-style-updated» frame sent only after that write answered');
  ok(((s, r) => (s.match(new RegExp(r.source, 'g')) || []).length === 1 && r.test((s.match(/\nfunction sessionFromMeta\(meta, transportFacts\) \{[\s\S]*?\n\}\n/) || [''])[0]) && (s.match(/= sessionFromMeta\(meta, \{/g) || []).length === 3)(read('src/server/boot-restore.js'), /_outputStyle: meta\.outputStyle \|\| null,/),
    'boot-restore reads it back on ALL THREE session-construction paths (a dead persistence write is worse than none)');
  ok(/_outputStyle:\s+\{ owner: 'ws',\s+persisted: 'session-meta'/.test(read('src/session-schema.js')), 'the session-schema row names its real persistence home');
}

console.log('— ACP: every union kind has a case (Part 3\'s census)');
{
    // every kind the installed agent's schema declares is either handled or named
    const src = read('src/acp-message-manager.js');
    for (const k of ['agent_message_chunk', 'agent_thought_chunk', 'user_message_chunk', 'tool_call', 'tool_call_update', 'plan', 'available_commands_update', 'current_mode_update', 'config_option_update', 'usage_update', 'session_info_update']) {
      ok(src.includes(`case '${k}'`), `ACP zod union kind '${k}' has a case (opencode 1.x SessionNotification)`);
    }
    ok(/default: return this\._noteUnknownUpdate\(u\.sessionUpdate\);/.test(src), 'the default arm is the breadcrumb, not a bare return');
}

console.log('— image_gen + sleep: the source pins (Part 4)');
{
  // the live PENDING stub uses the SAME input keys, so the merge cannot drift
  const wsrc = read('data/bin/codex-chat-wrapper.js');
  ok(/name: 'image_gen', arguments: JSON\.stringify\(\{ prompt: asString\(item\.revisedPrompt\), path: asString\(item\.savedPath\) \}\)/.test(wsrc),
    'wrapper pin: the pending image_gen stub carries the SAME input keys its completion does');
  ok(/kind: 'image_gen\.generation'/.test(wsrc) && /kind: 'clock\.sleep'/.test(wsrc), "wrapper pin: the completion is recorded in codex's OWN rollout spelling (one shape, three producers)");
  {
    // the emitted PAYLOAD literal itself (not the comment above it) must name
    // no `result` field — that is the 3 MB base64 PNG
    const i = wsrc.indexOf("kind: 'image_gen.generation'");
    const line = wsrc.slice(wsrc.lastIndexOf('\n', i) + 1, wsrc.indexOf('\n', i));
    ok(!/\bresult\b/.test(line) && /savedPath: asString\(item\.savedPath\)/.test(line), 'wrapper pin: `result` (the 3 MB base64 PNG) is deliberately not carried — savedPath is', line.trim().slice(0, 160));
  }
  const tr = read('src/codex-thread-read.js');
  ok(/case 'sleep':/.test(tr) && !/hookPrompt, sleep, future kinds/.test(tr), 'thread-read pin: sleep is no longer in the "not conversation content" drop list');
  // the renderer draws it
  const cr = read('src/lib/chat-renderers.js');
  ok(/const generatesImage = lowerTool === 'image_gen';/.test(cr) && /generatesImage \? t\('Generated image'\)/.test(cr), 'renderer pin: image_gen goes through the SAME media card as view_image');
  ok(/imageMediaHtml\(\{ path: isImagePath\(imgPath\) \? imgPath : ''/.test(cr), 'renderer pin: the thumbnail rides imageMediaHtml (an <img> built by .src, never raw innerHTML)');
  ok(/data-sleep-until="\$\{escHtml\(String\(until\)\)\}"/.test(cr), 'renderer pin: the sleep countdown carries its own deadline');
  ok(/lowerTool === 'sleep'\) \{\n      return `<div class="chat-tool-use"><span class="chat-tool-label">\$\{UI_ICONS\.hourglass\} \$\{escHtml\(resultText/.test(cr), 'renderer pin: a COMPLETED sleep freezes into the normalizer\'s own text (no ticking element survives)');
  const cv = read('src/lib/chat-view.js');
  ok(/this\._sleepTicker = setInterval/.test(cv) && /clearInterval\(this\._sleepTicker\)/.test(cv), 'ChatView pin: ONE ticker per view, cleared on dispose');
}

// ═════════ the version marker names THIS change ═════════
// r2 review: the first cut stamped "2.369.54" into 21 files while master had
// already SHIPPED 2.369.54 as an unrelated fix — every kb entry and code
// comment then pointed a reader at somebody else's release. A marker is a
// cross-reference; it has to resolve.
console.log('— version marker');
{
  const MARK = '2.369.58';   // renumber HERE and everywhere else in one sed
  const SITES = ['src/backend-caps.js', 'data/bin/codex-chat-wrapper.js', 'src/acp-message-manager.js',
    'src/codex-thread-read.js', 'src/lib/chat-status-bar.js', 'src/lib/session-props.js',
    'src/ws-handler.js', 'docs/kb-file-structure.md', 'docs/kb-features.md', 'docs/kb-api.md'];
  for (const f of SITES) ok(read(f).includes(MARK), `${f} carries the marker ${MARK} (all sites name ONE version)`);
  // The engineering log holds every release's full entry (CHANGELOG.md became
  // the user's one-line-per-change file on 2026-09-30; the old record moved
  // verbatim), so a release's topic is read there.
  const changelog = read('docs/changelog-engineering.md');
  // The section for that number, header line to the next `## ` (plain slicing:
  // a lazy regex with a multiline `$` lookahead stops at the end of the HEADER
  // and reads the body as empty, which passes any content check vacuously).
  const head = new RegExp(`^## ${MARK.replace(/\./g, '\\.')}(?![\\d.])`, 'm').exec(changelog);
  let entry = null;
  if (head) {
    const from = head.index;
    const next = changelog.indexOf('\n## ', from + 1);
    entry = changelog.slice(from, next < 0 ? changelog.length : next);
  }
  // Unreleased = no entry yet (fine). Released = the entry under this number
  // must be THIS change, not a squatter that shipped first.
  ok(!entry || /personality|response style|ServerRequest|elicitation/i.test(entry),
    `CHANGELOG ${MARK} is either unwritten or describes THIS change (a number another release already used = renumber)`,
    (entry ? entry.slice(0, 160) : 'no entry yet'));
}

// ═════════ docs ═════════
console.log('— docs carry the change');
{
  const kbf = read('docs/kb-file-structure.md');
  ok(/responseStyle/.test(kbf) && /thread\/settings\/update/.test(kbf), 'kb-file-structure documents the response-style capability + the live RPC');
  ok(/image_gen\.generation/.test(kbf) && /clock\.sleep/.test(kbf), 'kb-file-structure documents the media/sleep producers');
  ok(/SERVER_REQUEST_SPEC|ServerRequest/.test(kbf), 'kb-file-structure documents the per-method ServerRequest table');
  ok(/acp-unknown-update/.test(kbf), 'kb-file-structure documents the ACP breadcrumb');
  ok(/[Rr]esponse style/.test(read('docs/kb-features.md')), 'kb-features documents the response-style surface');
  ok(/set-response-style/.test(read('docs/kb-api.md')), "kb-api documents the ws 'set-response-style' message");
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
