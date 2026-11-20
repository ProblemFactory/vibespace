#!/usr/bin/env node
// THE CODEX EFFORT's WIRING PINS (fast — source text, plus the few PURE in-process legs that sat inside the moved blocks; no browser, server or hub — lane text-legs, B-94d3). MOVED VERBATIM from the heavy scripts/test-codex-effort-meta.mjs
// (its REAL-wrapper legs over the stub app-server, its PURE ladders and its end-to-end resume stay there): the writer's effortNext pins
// (src/server/stdout/codex-events.js), ⑧ the spawn / restore wiring, ⑨ the client wiring, ⑪c every resume / fork / restart entry
// point and where the origin is stated, ⑫c both halves of the client-resolved wire and the placement hint. Each reads the file it
// pins BY NAME, so ci.mjs's affected rule selects this suite on a change of one of them.
// Run: node scripts/test-codex-effort-meta-pins.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof n !== 'string') throw new TypeError('a leg\'s name is not a string — its arguments are swapped (test-ci-gate-tiers §7b)'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };

console.log('— ⑦ the writer reads effortNext only (source pins)');
{
  const src = fs.readFileSync(path.join(REPO, 'src/server/stdout/codex-events.js'), 'utf8');
  ok(/payload\.effortNext !== undefined/.test(src) && !/payload\.effortNext \|\| payload\.effort/.test(src),
    'wiring pin: the writer reads effortNext ONLY (the `|| payload.effort` fallback is the defect, not a belt)');
  ok(/effortOrigin: session\._effortOrigin \|\| null,/.test(src) && !/modelOrigin: session\._modelOrigin/.test(src),
    'r3 ① wiring pin: the meta write lists the key it AUTHORS (effortOrigin) and not the one it does not (modelOrigin — the spread carries that)');
}

console.log('— ⑧ spawn / restore wiring pins (the saved effort must REACH the wrapper)');
{
  const wsCreate = fs.readFileSync(path.join(REPO, 'src/ws-create.js'), 'utf8');
  ok(/buildSessionArgs\(\{[\s\S]{0,900}?effort: data\.effort,/.test(wsCreate),
    'ws-create hands the session\'s effort to buildSessionArgs on EVERY create (resume included)');
  // B-6b6d: with none supplied the fallback still runs — as the shared ladder
  // one step earlier (leg ⑪ measures it end to end), not as a codex-only env
  // post-fill whose `env is empty` test the client had made unreachable.
  ok(/await pickKnob\(data\.effort, hstore\.lastTurnEffort, 'defaultEffort'\)/.test(wsCreate)
    && /const conversation = stated \? '' : await fromConversation\(hook\);/.test(wsCreate),
    'and with none supplied, the resume falls back to the thread\'s OWN last turn effort (B-21e4 continuity)');
  const adapter = fs.readFileSync(path.join(REPO, 'src/adapters/codex.js'), 'utf8');
  ok(/CODEX_WEBUI_EFFORT/.test(adapter), 'the codex adapter is what turns that into the wrapper\'s env');
  const boot = fs.readFileSync(path.join(REPO, 'src/server/boot-restore.js'), 'utf8');
  ok(((s, r) => (s.match(new RegExp(r.source, 'g')) || []).length === 1 && r.test((s.match(/\nfunction sessionFromMeta\(meta, transportFacts\) \{[\s\S]*?\n\}\n/) || [''])[0]) && (s.match(/= sessionFromMeta\(meta, \{/g) || []).length === 3)(boot, /_effort: meta\.effort \|\| null/),
    'every boot-restore path restores _effort from session-meta (so a server restart does not lose it)');
  const wsh = fs.readFileSync(path.join(REPO, 'src/ws-handler.js'), 'utf8');
  ok(/chatStatus\.effortNext = session\._effort/.test(wsh), 'the attach payload carries the pending value separately from the running one');
  // the adapter really produces the env for a resume spawn
  const { CodexAdapter } = require(path.join(REPO, 'src/adapters/codex.js'));
  const spec = new CodexAdapter().buildSessionArgs({ cwd: '/w', resumeId: 'th-z', effort: 'ultra', mode: 'chat' });
  ok(spec?.env?.CODEX_WEBUI_EFFORT === 'ultra', 'a resume spawn carries the saved effort into CODEX_WEBUI_EFFORT', JSON.stringify(spec?.env?.CODEX_WEBUI_EFFORT));
}

console.log('— ⑨ client wiring pins');
{
  const cv = fs.readFileSync(path.join(REPO, 'src/lib/chat-view.js'), 'utf8');
  ok(/op\.subtype === 'effort'/.test(cv) && /_statusBar\.setEffort\(/.test(cv), 'chat-view routes the live effort meta op to the status bar');
  ok(/add\(t\('Effort'\), effortDisplay\(/.test(cv), 'the metadata popup renders the effort through effortDisplay');
  const sb = fs.readFileSync(path.join(REPO, 'src/lib/chat-status-bar.js'), 'utf8');
  ok(/setEffort\(live, next\)/.test(sb), 'the status bar exposes setEffort(live, next)');
  ok(/effortDisplay\(this\._backend, this\._statusEffort/.test(sb), 'and its tooltip decorates the value the same way');
  ok(/noteModelCatalog\(this\._backend, models\)/.test(sb), 'the effort picker\'s own catalog fetch feeds the model catalog');
  const appjs = fs.readFileSync(path.join(REPO, 'src/lib/app.js'), 'utf8');
  ok(/noteModelCatalog\(be, data\[be\]\)/.test(appjs), 'the boot catalog fetch feeds it too');
  const srv = fs.readFileSync(path.join(REPO, 'src/harnesses/codex-models.js'), 'utf8'); // the codex descriptor's models() (dc-ws-create; was server.js)
  ok(/multiAgentEffort: m\.multi_agent_reasoning_effort \|\| ''/.test(srv),
    'the codex model list (src/harnesses/codex-models.js) carries multi_agent_reasoning_effort out of codex\'s own model cache (never a hardcoded level)');
}

console.log('— ⑪c WIRING: every resume/fork/restart entry point, and where the origin is stated');
{
  const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  const sl = read('src/lib/session-lifecycle.js');
  // (1) the client half is the SAME pure rule, and it can no longer fill a default on a continuation
  ok(/import \{ resumeSpawnPick \} from '\.\.\/resume-continuity\.js';/.test(sl),
    'the client spawns by the same PURE ladder as the server (one law, two callers)');
  ok(/const continuesConversation = !!resumeId;/.test(sl)
    && /const modelPick = pickHere\(model, defaults\.model\);/.test(sl)
    && /const effortPick = pickHere\(effort, defaults\.effort\);/.test(sl)
    // the model twin then passes THE DOOR (lane fable-52-cli-321 r6): a saved value that is no model id is not sent — the spawn takes its default
    && /const sessionModel = \(modelPick\.value && !namedModel\(modelPick\.value\)\) \? undefined : modelPick\.value;/.test(sl) && /const sessionEffort = effortPick\.value;/.test(sl)
    && /resume: continuesConversation, hasSource: false/.test(sl),
    'createSession: BOTH twins go through it (the model twin then through the door), and the client declares it cannot read the conversation (hasSource:false)');
  // r3: the client keeps the whole pick — its ORIGIN is the fact the wire
  // could not otherwise carry (leg ⑬ measures it end to end).
  ok(/spawnOriginHint: \{ model: modelPick\.origin, effort: effortPick\.origin \},/.test(sl),
    'r3: …and states WHICH FACT each resolved value is, for both twins');
  ok(!/const sessionEffort = effort !== undefined \? effort : defaults\.effort;/.test(sl)
    && !/const sessionModel = model !== undefined \? model : defaults\.model;/.test(sl),
    'the pre-fix expression is GONE from both twins (this is the line the owner\'s incident traced to)');
  // r2: a NEW session sends the resolved value VERBATIM so an explicit
  // "Auto (model default)" ('') survives the wire as a choice; a continuation
  // keeps `|| undefined`, where '' means the same thing as silence.
  ok(/const wireKnob = \(v\) => \(continuesConversation \? \(v \|\| undefined\) : v\);/.test(sl)
    && /model: wireKnob\(sessionModel\)/.test(sl) && /effort: wireKnob\(sessionEffort\)/.test(sl)
    && !/model: sessionModel\|\|undefined/.test(sl) && !/effort: sessionEffort\|\|undefined/.test(sl),
    'r2: BOTH twins reach the wire through the same continuation-aware helper (a stated empty must survive on a NEW create)');
  // (2) every entry point that continues a conversation funnels through it
  ok(/resumeSession\(sessionId, cwd, sessionName, \{ mode, model, effort/.test(sl)
    && /effort: effort !== undefined \? effort : savedCfg\.effort,/.test(sl)
    && /model: model !== undefined \? model : savedCfg\.model,/.test(sl),
    'resumeSession still forwards an EXPLICIT pick (caller > the card ⚙ override) — the "chosen" rung',
    'resumeSession');
  // WHAT THIS PINS is that the fork's createSession call carries BOTH keys —
  // `resumeId` (so `continuesConversation` is true and the ladder takes the
  // parent's values) and `fork: true`. It used to pin the DISTANCE between them
  // (2000 chars from the method name), which is a fact about formatting: owner
  // ruling 9 added ~950 characters of comment inside `_doForkSession`
  // explaining why the fork needs its own `worktree` pick, and the pin went red
  // for a change that did not touch either key. Scope it to the METHOD BODY and
  // read the call instead — same claim, and it cannot be broken by a paragraph.
  const forkBody = (() => {
    const i = sl.lastIndexOf('async _doForkSession(');
    if (i < 0) return null;
    let depth = 0;
    for (let k = sl.indexOf('{', i); k < sl.length; k++) {
      if (sl[k] === '{') depth++;
      else if (sl[k] === '}' && --depth === 0) return sl.slice(i, k + 1);
    }
    return null;
  })();
  const forkCall = forkBody && /this\.createSession\(\{[\s\S]*?\n\s*\}\);/.exec(forkBody);
  ok(!!forkCall && /\n\s*resumeId,/.test(forkCall[0]) && /\n\s*fork: true,/.test(forkCall[0]),
    'a FORK carries resumeId → it is a continuation, so it inherits the parent conversation\'s values',
    forkCall ? forkCall[0].slice(0, 200) : 'no _doForkSession createSession call found');
  ok(/restartConversationInPlace[\s\S]{0,1200}?this\.resumeSession\(cid,/.test(sl),
    'restartConversationInPlace goes through resumeSession (no second spawn path to keep in sync)');
  ok(/const retry = \(\) => this\.createSession\(\{\n\s*cwd, name: sessionName, resumeId, mode: sessionMode, model, permission, effort,/.test(sl),
    'the failed-resume retries re-send the caller\'s ORIGINAL explicitness (never the resolved sessionModel/sessionEffort)');
  const cv = read('src/lib/chat-view.js');
  ok(/this\.app\.resumeSession\(backendSessionId, cwd, name, \{\n\s*mode: 'chat',\n\s*backend,/.test(cv),
    'the chat RESUME BAR sends no model/effort at all — the path the owner hit');
  const lay = read('src/lib/layout.js'), pacer = read('src/lib/resume-pacer.js');
  // lane resume-all-paced (L1): resume-all goes through the pacer (src/lib/resume-pacer.js) — layout.js hands it `extra: { stay: true }`
  // (L3: `bulk: true` beside it — the history read's place in the hub's line, not a spawn option — REQUIRED since it is in the
  // tree: the pin no longer passes a resume-all that dropped it),
  // resumeAndWait spreads the row's own opts, then `extra`, then its ONE addition: the create's end it waits on (onCreateEnd)
  ok(/resumePaced\(this\.app, go, \{ extra: \{ stay: true, bulk: true \} \}\)/.test(lay)   // B-f64b cure: `go` = the offer's rows less the ones still being checked
    && /const opts = d\.opts \|\| \{\};/.test(pacer)
    && /app\.resumeSession\(d\.sessionId, d\.cwd, d\.name, \{ \.\.\.opts, \.\.\.extra, onCreateEnd: \(how, msg\) => end\(how, msg, r && r\.row \? r\.row : null\) \}\)/.test(pacer),
    'resume-all replays the window\'s own opts and invents nothing (lane phone-resume-keeps-layout: + `stay` — each row re-opened where it is, no switch)');
  // (3) the server states WHICH FACT it used, everywhere a client can read it
  const wc = read('src/ws-create.js');
  ok(wc.indexOf('resumeSpawnPick({') < wc.indexOf('adapter.buildSessionArgs({'),
    'the ladder runs BEFORE the spawn spec, so every downstream reader (pool chooser, _spawnModel, the lock target) sees the value the session really starts with');
  ok(/data\._modelOrigin = picks\.model\.origin;/.test(wc) && /data\._effortOrigin = picks\.effort\.origin;/.test(wc)
    && /continuityLogLine\(backend, data\.resumeId, picks\)/.test(wc),
    'it records the ORIGIN and logs the decision (a resume that quietly took the default must be readable afterwards)');
  ok(!/lastCodexTurnEffort\(data\.resumeId\)/.test(wc) && !/lastCodexTurnModel\(data\.resumeId\)/.test(wc),
    'the codex-only env post-fill is GONE — one ladder, per-harness readers, no backend branch');
  // r2: only the LADDER may decide what '' means. Normalising `explicit` here
  // is how the dialog's explicit Auto became codex.defaultEffort.
  ok(/resumeSpawnPick\(\{\n\s*explicit, conversation, instanceDefault: instDefault\(key\),/.test(wc)
    && !/const e = \(explicit === undefined \|\| explicit === null\) \? '' : String\(explicit\)\.trim\(\);/.test(wc),
    'r2: ws-create forwards `explicit` UNTOUCHED into the ladder (the pre-fix normalisation is gone)');
  // r2: the claude source is deleted, not repaired — both the descriptor hook
  // and the reader it called must be absent, and the reason must be readable.
  const chz = read('src/harnesses/claude.js'), ssz = read('src/session-store.js');
  // the DEFINITION and the EXPORT, not the prose: the tombstone comment names
  // the deleted reader on purpose, so a bare name match would be a red herring.
  ok(!/lastTurnModel:/.test(chz) && !/lastTurnEffort:/.test(chz)
    && !/function lastClaudeTurnModel/.test(ssz) && !/^\s*lastClaudeTurnModel,\s*$/m.test(ssz)
    && !/function _unfallback/.test(ssz),
    'r2: no claude reader anywhere — no descriptor hook, no session-store definition, no export, and the dead fallback guard is gone with it');
  ok(/WHY THERE IS NO CLAUDE MODEL READER HERE/.test(ssz) && /\[1m\]/.test(ssz) && /2650 transcripts/.test(ssz),
    '…and session-store carries the measured reason where the reader used to be (the next person who wants one reads it first)');
  ok(/RESUME CONTINUITY \(B-6b6d/.test(chz) && /context-window variant/.test(chz),
    '…restated on the descriptor, which is the place a future hook would be added');
  const ocz = read('src/harnesses/opencode.js'), acz = read('src/harnesses/acp.js');
  ok(/lastTurnModel: \(id\) => serve\.facts\(\)\.sessionModel\(id\)/.test(ocz),
    'r2: opencode DOES declare the model reader (its own session record names it)');
  ok(/deliberately NO `lastTurnModel`/.test(acz),
    '…and the GENERIC ACP harness says in place why it declares none (⑫: a silent behaviour change per harness must be written down where that harness lives)');
  ok(/spawnOrigin: \{ model: session\._modelOrigin \|\| null, effort: session\._effortOrigin \|\| null \}/.test(wc),
    "the 'created' reply carries it (the creator never gets an 'attached' — 2.368.4)");
  ok(/effort: session\._effort \|\| null,\n\s*spawnModel: session\._spawnModel \|\| null,/.test(wc),
    "…along with the effort the spawn resolved to, since on a resume the CLIENT deliberately sent none");
  ok(/modelOrigin: session\._modelOrigin \|\| null,/.test(wc) && /effortOrigin: session\._effortOrigin \|\| null,/.test(wc),
    'and session-meta persists it, so a server restart does not turn an honest row into a guess');
  const wsh = read('src/ws-handler.js');
  ok(/spawnOrigin: \{ model: session\._modelOrigin \|\| null, effort: session\._effortOrigin \|\| null \}/.test(wsh),
    'the ATTACH payload carries it too (a second client opening the window learns the same fact)');
  ok(/session\._effortOrigin = 'chosen';/.test(wsh) && /if \(data\.model\) s2\._modelOrigin = 'chosen';/.test(wsh),
    'a pick made INSIDE the session RE-AUTHORS the origin — the panel must not keep calling a hand-changed value "the conversation\'s own"');
  ok(/effortOrigin: session\._effortOrigin/.test(wsh) && /modelOrigin: s2\._modelOrigin \|\| null/.test(wsh),
    '…and that re-authoring is persisted with the value it describes');
  const sbar = read('src/lib/chat-status-bar.js');
  ok(/this\._spawnOrigin = \{ \.\.\.\(this\._spawnOrigin \|\| \{\}\), effort: 'chosen' \};/.test(sbar),
    '…on the CLIENT too, next to the optimistic chip value (one pick, one pair of writes)');
  const boot = read('src/server/boot-restore.js');
  ok(((s, r) => (s.match(new RegExp(r.source, 'g')) || []).length === 1 && r.test((s.match(/\nfunction sessionFromMeta\(meta, transportFacts\) \{[\s\S]*?\n\}\n/) || [''])[0]) && (s.match(/= sessionFromMeta\(meta, \{/g) || []).length === 3)(boot, /_modelOrigin: meta\.modelOrigin \|\| null/),
    'every boot-restore path restores it (all three, like _effort)');
  const srv = read('server.js');
  ok(/modelOrigin: s\._modelOrigin \|\| null, effortOrigin: s\._effortOrigin \|\| null,/.test(srv),
    'the active-sessions payload carries value + origin for Session Properties');
  const sb = read('src/lib/sidebar.js');
  // THE CLAIM IS "BOTH BRANCHES CARRY IT", not "there are two hand-copied lines
  // that spell it". This started as a pair of literal-line counts because the
  // facts WERE hand-copied one per line — and the finding it was written for
  // (`outputStyle` reached NEITHER branch) is precisely the drift a per-fact
  // line invites. Owner ruling 9 round 3 replaced the copies with ONE declared
  // list spread into both branches, so the pin now asks the two questions that
  // survive that: is the fact DECLARED, and does each branch spread the list.
  // A key dropped from the list still turns this red; a fifth fact added to it
  // no longer needs a sixth line here.
  const factList = /const LIVE_SESSION_FACTS = Object\.freeze\(\{([\s\S]*?)\n\}\);/.exec(sb);
  const spreads = (sb.match(/\.\.\.liveSessionFacts\((?:wm|ws)\)/g) || []).length;
  const declares = (k) => !!factList && new RegExp(`(^|[^\\w])${k}\\s*:`, 'm').test(factList[1]);
  ok(!!factList && spreads === 2 && declares('modelOrigin') && declares('effortOrigin')
    && declares('spawnModel') && declares('effort'),
    'BOTH merge branches carry it onto the session record (the 2.369.58 outputStyle row reached neither — fixed here with them)',
    JSON.stringify({ spreads, declared: !!factList && factList[1].replace(/\s+/g, ' ').slice(0, 200) }));
  ok(declares('outputStyle'),
    '…including that outputStyle twin, whose "live" value the panel had been reading as always-empty');
  // …and the list is not a place a fact can hide: every key it declares must be
  // one the SERVER payload really publishes, or the merge carries a null under
  // a name nothing writes (the other half of the same drift).
  const srvPayload = read('server.js');
  const declaredKeys = factList ? [...factList[1].matchAll(/^\s*(?:\/\/[^\n]*\n\s*)*([A-Za-z_$][\w$]*)\s*:/gm)].map((m) => m[1]) : [];
  const unpublished = declaredKeys.filter((k) => !new RegExp(`(^|[^\\w])${k}:`).test(srvPayload));
  ok(declaredKeys.length >= 8 && unpublished.length === 0,
    'every fact the merge declares is one the active-sessions payload actually publishes',
    JSON.stringify({ declaredKeys, unpublished }));
  // NEGATIVE CONTROLS for the two questions above — a pin that replaced a
  // literal-line count has to show it can still fail.
  {
    const dropped = sb.replace(/\n\s*'?outputStyle'?: \{ digest[^\n]*\n/, '\n');
    const fl2 = /const LIVE_SESSION_FACTS = Object\.freeze\(\{([\s\S]*?)\n\}\);/.exec(dropped);
    ok(!!fl2 && !/(^|[^\w])outputStyle\s*:/m.test(fl2[1]) && dropped !== sb,
      'NEGATIVE CONTROL: a fact deleted from the declared list is DETECTED (the pin is not satisfied by the list merely existing)');
    const unspread = sb.replace('...liveSessionFacts(ws)', '/* dropped */');
    ok((unspread.match(/\.\.\.liveSessionFacts\((?:wm|ws)\)/g) || []).length === 1,
      'NEGATIVE CONTROL: a branch that stops spreading the list is DETECTED (the unmatched-session branch is the one 2.369.58 forgot)');
  }
  const sp = read('src/lib/session-props.js');
  ok(/originRow\(t\('Model'\), s\.spawnModel \|\| '', cfg\.model, s\.modelOrigin\)/.test(sp)
    && /originRow\(t\('Effort'\), s\.effort \|\| '', cfg\.effort, s\.effortOrigin,/.test(sp),
    'Session Properties shows value + origin for both twins');
  ok((sp.match(/const ORIGIN_LABEL = \{/g) || []).length === 1,
    'ONE label map for all three origin rows (a second copy is how one fact starts being worded two ways in one panel)');
  ok(/const originBit = ORIGIN_LABEL\[originKey\]/.test(sp) && !/ORIGIN_LABEL\[spawnValueOrigin\(stated, live, picked\)\]\(\)/.test(sp),
    "r2: the row only prints a parenthetical for an origin the label map HAS — 'unknown' shows the value alone rather than a fact we do not hold");
  ok(/wrap: true/.test(sp) && /white-space:normal;overflow-wrap:anywhere/.test(sp),
    'an origin row WRAPS instead of ellipsizing (375×667: the origin is the last thing on the line — measured, see scripts/dbg-session-props-mobile.mjs)');
  // (4) the decision is DOCUMENTED where the next reader looks, under its id
  const kb = read('docs/kb-bugfix-invariants.md');
  ok(/B-6b6d/.test(kb) && /is a NEW-session default/i.test(kb) && /conversation's OWN value wins on resume\/fork\/restart/i.test(kb),
    'the kb states the RULE under the backlog id that carries the owner decision');
  ok(/chat resume bar|resume-all/.test(kb) && /session-lifecycle\.js/.test(kb),
    '…with the precise scope it came from (which resume paths, which line)');
  ok(/hasSource/.test(kb) && /nothing claude writes records the effort/i.test(kb),
    '…and the ASYMMETRY, which reads like an omission unless it is written down');
  ok(/NEW sessions only \(B-6b6d\)|NEW Codex sessions/.test(read('docs/settings.md'))
    && /Applies to NEW sessions/.test(read('src/harness-settings-words.js')), // B-82b8: the row's words live in the words module now; 2.369.123: the row (and its description) lives in the codex harness's DECLARED table; the schema derives it
    'the SETTING itself no longer claims "new or resumed" — the description a user reads is part of the fix');
}

console.log('— ⑫c r3 WIRING: both halves, and the placement hint that is never a command');
{
  const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  const sl = read('src/lib/session-lifecycle.js'), wc = read('src/ws-create.js');
  ok(/const pickHere = \(explicit, instanceDefault\) =>\n\s*resumeSpawnPick\(\{ explicit, instanceDefault, resume: continuesConversation, hasSource: false \}\);/.test(sl),
    'the client keeps the WHOLE pick (its origin is the fact the wire could not carry)');
  ok(/spawnOriginHint: \{ model: modelPick\.origin, effort: effortPick\.origin \},/.test(sl),
    '…and sends it for BOTH twins');
  ok(/const hint = data\.spawnOriginHint \|\| \{\};/.test(wc)
    && /picks\.model\.origin = applyOriginHint\(picks\.model\.origin, hint\.model\);/.test(wc)
    && /picks\.effort\.origin = applyOriginHint\(picks\.effort\.origin, hint\.effort\);/.test(wc),
    'ws-create reconciles it through the PURE rule, for both twins');
  // ORDER, stated so it cannot pass vacuously: `indexOf` answers -1 for text
  // that is not there, and -1 is less than everything — an ordering pin that
  // does not first assert BOTH sites exist goes green when the fix is deleted
  // (measured: this exact assert survived the mutation run).
  const iHint = wc.indexOf('applyOriginHint(picks.model.origin'), iRec = wc.indexOf('data._modelOrigin = picks.model.origin;');
  ok(iHint > 0 && iRec > 0 && iHint < iRec,
    '…BEFORE the origin is handed to the session (else the recorded value is the un-reconciled one)',
    JSON.stringify({ iHint, iRec }));
  ok(/const \{ resumeSpawnPick, applyOriginHint, continuityLogLine \} = require\('\.\/resume-continuity'\);/.test(wc),
    'and it comes from the ONE pure module (no second copy of the rule)');
  // r3 ③: the placement hint is a FAMILY guess for the pool chooser, never a command
  ok(/data\._placementModelHint = data\.model \|\| instDefault\('defaultModel'\) \|\| null;/.test(wc),
    'r3 ③: the pooled-spawn chooser gets a placement hint when the ladder commands nothing');
  ok(/chooseMember: \((?:poolId(?:, how = \{\})?)?\) => poolChooser\?\.\([^)]*\{ model: data\.model \|\| data\._placementModelHint \|\| null(?:, hinted: !data\.model)?(?:, forDefault: !!how\.forDefault)?(, \.\.\.\(data\._poolPin(?: && !how\.forDefault)? \? \{ pin: data\._poolPin\.memberId \} : \{\}\))? \}\)/.test(wc), // (+ the conversation's pool pin, 2026-09-28 — the chooser starts a pinned resume on its pin; + `forDefault`, lane reset-unproven r3 — the pool default is never a proving spawn)
    '…at the chooser call site, and nowhere else');
  ok(!/model: data\._placementModelHint/.test(wc.replace(/chooseMember[\s\S]{0,200}?\n/, ''))
    && !/CODEX_WEBUI_MODEL = data\._placementModelHint/.test(wc)
    && !/data\.model = data\._placementModelHint/.test(wc),
    'r3 ③ negative control: it never reaches data.model, the spawn spec or the env — placement is not commanding');
  ok(/session\._spawnModel = data\.model \|\| null;/.test(wc),
    'r3 ③: `_spawnModel` records what the spawn COMMANDED and stays null here — the hint must never leak into session-meta / the attach payload / sessionModelFor\'s floor');
  // …and "placement only" is a COUNTABLE claim, not a promise: exactly two
  // non-comment sites exist — where it is set, and the one chooser that reads it.
  const hintSites = wc.split('\n').filter((l) => l.includes('_placementModelHint') && !l.trim().startsWith('//'));
  ok(hintSites.length === 2,
    'r3 ③: exactly TWO non-comment sites — the assignment beside the ladder, and the chooser',
    JSON.stringify(hintSites.map((l) => l.trim().slice(0, 60))));
}

console.log(fail ? `\nFAILED (${fail} of ${pass + fail})` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
