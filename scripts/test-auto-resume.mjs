#!/usr/bin/env node
// Auto-continue after a usage limit resets + the CLI output style (2.368.0,
// owner: "都做吧 另外可以配置是否默认开启自动恢复").
//
// The CLI has its own auto-continue, but only in the interactive REPL —
// `/rate-limit-options` is absent from a stream-json session's command list and
// the timer is a TUI interval — so this is ours. What the suite protects:
//   · the tri-state gate (per-session OFF must survive the default being ON)
//   · it never fires early, never twice, never while the session is working
//   · anything that proves recovery (pool switch, the user's own prompt)
//     DISARMS it — a fire on a recovered session is a billed turn for nothing
//   · the wait SURVIVES A RESTART (the CLI's own cannot; that is the point)
//   · output style rides the ONE --settings flag we already use, and only at
//     spawn (stream-json has no /output-style)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const { create, CONTINUE_PROMPT, GRACE_MS, MAX_WAIT_MS } = require(path.join(REPO, 'src/server/auto-resume.js'));

const mk = ({ dflt = false, dir } = {}) => {
  const d = dir || fs.mkdtempSync(path.join(os.tmpdir(), 'vs-ar-'));
  const sent = [], notes = [], casts = [];
  const sessions = new Map();
  const ar = create({
    dataDir: d, activeSessions: sessions,
    serverSetting: (k) => (k === 'claude.autoResumeOnLimit' ? dflt : undefined),
    sendToSession: (id, s, text) => { if (s.dead) return false; sent.push({ id, text }); return true; },
    notify: (id, s, text) => notes.push({ id, text }),
    broadcast: (id, m) => casts.push(m),
  });
  return { ar, dir: d, sent, notes, casts, sessions };
};
const sess = (over = {}) => ({ mode: 'chat', backend: 'claude', pty: {}, _isStreaming: false, ...over });
const T0 = Date.now();   // the module refuses waits >26h out, so the clock must be REAL

// ── 1. the tri-state gate ──
{
  const a = mk({ dflt: false });
  a.sessions.set('s1', sess());
  ok('default OFF ⇒ exhaustion does not arm', a.ar.armIfEnabled('s1', a.sessions.get('s1'), Date.now() + 60000, '5h') === null);
  const b = mk({ dflt: true });
  b.sessions.set('s1', sess());
  ok('default ON ⇒ arms', !!b.ar.armIfEnabled('s1', b.sessions.get('s1'), Date.now() + 60000, '5h'));
  const c = mk({ dflt: true });
  c.sessions.set('s1', sess({ _autoResume: false }));
  ok('THE POINT of the tri-state: a per-session OFF beats the default being ON', c.ar.armIfEnabled('s1', c.sessions.get('s1'), Date.now() + 60000, '5h') === null);
  const d = mk({ dflt: false });
  d.sessions.set('s1', sess({ _autoResume: true }));
  ok('and a per-session ON beats the default being OFF', !!d.ar.armIfEnabled('s1', d.sessions.get('s1'), Date.now() + 60000, '5h'));
  ok('status reports where the answer came from', d.ar.statusFor('s1').explicit === true && d.ar.statusFor('s1').globalDefault === false);
}

// ── 2. refusals: nothing to wait for ──
{
  const a = mk({ dflt: true });
  a.sessions.set('s1', sess());
  ok('no reset time ⇒ no arm (we do not invent a wait)', a.ar.armIfEnabled('s1', a.sessions.get('s1'), null, 'x') === null);
  ok('a reset already in the past ⇒ no arm', a.ar.armIfEnabled('s1', a.sessions.get('s1'), Date.now() - 1000, 'x') === null);
  ok('a reset a week out ⇒ refuses to squat', a.ar.armIfEnabled('s1', a.sessions.get('s1'), Date.now() + MAX_WAIT_MS + 60000, 'weekly') === null);
  ok('an unknown session ⇒ no arm', a.ar.armIfEnabled('nope', null, Date.now() + 60000, 'x') === null);
}

// ── 3. firing: on time, once, and only when idle ──
{
  const a = mk({ dflt: true });
  a.sessions.set('s1', sess());
  const resets = T0 + 60000;
  a.ar.armIfEnabled('s1', a.sessions.get('s1'), resets, '5h limit');
  ok('armed status carries the reset time for the UI', a.ar.statusFor('s1').armed === true && a.ar.statusFor('s1').resetsAt === resets);
  ok('does NOT fire before the reset', a.ar.tick(resets - 1) === 0 && a.sent.length === 0);
  ok('does NOT fire during the grace window (let the reset actually land)', a.ar.tick(resets + GRACE_MS - 1) === 0);
  a.sessions.get('s1')._isStreaming = true;
  ok('does NOT fire while the session is already working', a.ar.tick(resets + GRACE_MS + 1) === 0 && a.sent.length === 0);
  a.sessions.get('s1')._isStreaming = false;
  ok('fires once the reset has landed and the session is idle', a.ar.tick(resets + GRACE_MS + 1) === 1);
  ok('and sends the CLI\'s own continue wording', a.sent[0].text === CONTINUE_PROMPT && /do not repeat work that is already complete/.test(a.sent[0].text));
  ok('NEVER twice', a.ar.tick(resets + 600000) === 0 && a.sent.length === 1);
  ok('the fire is announced in the conversation (a billed turn must explain itself)', a.notes.some((n) => /自动继续|continue/i.test(n.text)));
  ok('the arming announcement is DELAYED, not immediate (2.368.34 §10 covers the full lifecycle)', a.notes.filter((n) => /已安排/.test(n.text)).length === 0);
}

// ── 4. recovery disarms (a fire on a recovered session is money for nothing) ──
{
  for (const why of ['user sent a prompt', 'fresh non-rejected reading', 'pool switched']) {
    const a = mk({ dflt: true });
    a.sessions.set('s1', sess());
    const resets = T0 + 60000;
    a.ar.armIfEnabled('s1', a.sessions.get('s1'), resets, '5h');
    a.ar.noteRecovered('s1', why);
    ok(`disarmed by: ${why}`, a.ar.statusFor('s1').armed === false && a.ar.tick(resets + 600000) === 0 && a.sent.length === 0);
  }
  const a = mk({ dflt: true });
  a.sessions.set('s1', sess());
  a.ar.armIfEnabled('s1', a.sessions.get('s1'), T0 + 60000, '5h');
  a.ar.setEnabled('s1', false);
  ok('turning the toggle off cancels a pending wait', a.ar.statusFor('s1').armed === false && a.ar.tick(T0 + 600000) === 0);
  const b = mk({ dflt: true });
  b.sessions.set('s1', sess());
  b.ar.armIfEnabled('s1', b.sessions.get('s1'), T0 + 60000, '5h');
  b.sessions.delete('s1');
  ok('a session that died while waiting is dropped, not resurrected', b.ar.tick(T0 + 600000) === 0 && b.sent.length === 0);
}

// ── 5. THE differentiator: the wait survives a restart ──
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-ar-p-'));
  const a = mk({ dflt: true, dir });
  a.sessions.set('s1', sess());
  const resets = T0 + 3_600_000;
  a.ar.armIfEnabled('s1', a.sessions.get('s1'), resets, '5h limit');
  ok('the pending wait is persisted', JSON.parse(fs.readFileSync(path.join(dir, 'auto-resume.json'), 'utf-8')).armed.s1.resetsAt === resets);
  const b = mk({ dflt: true, dir });          // a NEW process, same data dir
  b.sessions.set('s1', sess());
  ok('a fresh process still knows about the wait (the CLI\'s own version cancels here)', b.ar.statusFor('s1').armed === true);
  ok('and it still fires', b.ar.tick(resets + GRACE_MS + 1) === 1 && b.sent[0].text === CONTINUE_PROMPT);
  fs.rmSync(dir, { recursive: true, force: true });
}

// ── 6. delivery failure must not silently drop the wait ──
{
  const a = mk({ dflt: true });
  a.sessions.set('s1', sess({ dead: true }));   // sendToSession returns false
  // FRESH now, not module-load T0 (CI flake 2026-08-24: a slow Actions runner
  // took >1s to reach this section, T0+1000 was already past, armIfEnabled
  // correctly refused, and both asserts failed — green locally for weeks)
  const resets = Date.now() + 60000;
  a.ar.armIfEnabled('s1', a.sessions.get('s1'), resets, '5h');
  ok('a failed delivery keeps the wait armed for the next tick', a.ar.tick(resets + GRACE_MS + 1) === 0 && a.ar.statusFor('s1').armed === true);
  a.sessions.get('s1').dead = false;
  ok('…and it lands on the retry', a.ar.tick(resets + GRACE_MS + 2) === 1);
}

// ── 7. wiring pins ──
{
  const eng = read('src/server/usage-pool-engine.js');
  ok('exhaustion arms it — AFTER trying the pool switch (seconds beat hours)', /maybePoolAutoSwitch\(session\);[\s\S]{0,400}getAutoResume\(\)\?\.armIfEnabled/.test(eng));
  ok('a fresh non-rejected reading disarms it', eng.includes("getAutoResume()?.noteRecovered?.(session._webuiId, 'fresh non-rejected reading')"));
  const wsh = read('src/ws-handler.js');
  ok('a user prompt disarms it', wsh.includes("autoResume?.noteRecovered?.(data.sessionId, 'user sent a prompt')"));
  ok('the live toggle is a ws case', wsh.includes("case 'auto-resume'") && wsh.includes('autoResume?.setEnabled'));
  ok('attach carries the state (a reconnecting tab sees the pending wait)', wsh.includes('autoResume: autoResume?.statusFor?.(data.sessionId)'));
  const sv = read('server.js');
  ok('server.js creates + starts it', sv.includes("auto-resume.js').create") && sv.includes('autoResume.start()'));
  ok('and hands it to the engine LAZILY (created later in the file)', sv.includes('getAutoResume: () => { try { return autoResume;'));
  const sb = read('src/lib/chat-status-bar.js');
  ok('status bar shows the pending wait with its time', sb.includes('chat-status-autoresume') && sb.includes('will continue by itself at {t}'));
  ok('and the toggle persists per session', /type: 'auto-resume'[\s\S]{0,200}autoResume: on/.test(sb));
  // 2.368.5 (owner: "几乎没有视觉反馈…和outputstyle的待加载沙漏挨着不好"): the
  // chip's ON state must be visibly ON (accent class + label, not a one-shade
  // dim), and its icon must NOT be the hourglass — that means "pending pick"
  // on the style chip one chip to the left.
  {
    const arSpan = sb.slice(sb.indexOf('chat-status-autoresume chat-status-clickable') - 400, sb.indexOf('chat-status-autoresume chat-status-clickable') + 400);
    ok('auto-continue chip does NOT reuse the style chip\'s hourglass', arSpan.includes('UI_ICONS.autoContinue') && !arSpan.includes('UI_ICONS.hourglass'));
    ok('ON state is visibly on: accent class + label', sb.includes('chat-status-autoresume-on') && /a\.enabled \? ' ' \+ escHtml\(t\('auto'\)\)/.test(sb));
    ok('the on-state class is styled (accent, not dim)', /\.chat-status-autoresume-on\s*{\s*color: var\(--accent\)/.test(read('public/chat.css')));
    ok('the icon exists in the SVG library', read('src/lib/icons.js').includes('autoContinue:'));
  }
  ok('the default is a documented setting', read('src/lib/settings-schema.js').includes("'claude.autoResumeOnLimit'"));
}

// ── 8. output style: spawn-only, on the ONE --settings flag ──
{
  const { ClaudeCodeAdapter } = require(path.join(REPO, 'src/adapters/claude-code.js'));
  const ad = new ClaudeCodeAdapter({ buffersDir: '/tmp' });
  const argsOf = (opts) => ad.buildSessionArgs({ cwd: '/tmp', mode: 'chat', ...opts }).args;
  const settingsOf = (args) => { const i = args.indexOf('--settings'); return i < 0 ? null : JSON.parse(args[i + 1]); };
  ok('no style ⇒ no settings flag invented', settingsOf(argsOf({})) === null);
  ok('Concise rides --settings as outputStyle', settingsOf(argsOf({ outputStyle: 'Concise' })).outputStyle === 'Concise');
  ok('"default" is treated as unset', settingsOf(argsOf({ outputStyle: 'default' })) === null);
  const both = argsOf({ outputStyle: 'Concise', effort: 'ultracode' });
  ok('MERGED with the other settings keys, never a second --settings flag', both.filter((a) => a === '--settings').length === 1 && settingsOf(both).outputStyle === 'Concise' && settingsOf(both).ultracode === true);
  ok('there is no --output-style flag to pass (the CLI has none)', !argsOf({ outputStyle: 'Concise' }).includes('--output-style'));
  const wc = read('src/ws-create.js');
  ok('every create path gets the instance default unless the client picked one', wc.includes("data.outputStyle || (() => { try { return serverSetting('claude.outputStyle')"));
  ok('the session records what it was spawned with (the EFFECTIVE style)', wc.includes('session._outputStyle = data._effOutputStyle'));
  ok('a resume carries the saved style + auto-resume choice', read('src/lib/session-lifecycle.js').includes('outputStyle: savedCfg.outputStyle') && read('src/lib/session-lifecycle.js').includes('autoResume: savedCfg.autoResume'));
  const sb = read('src/lib/chat-status-bar.js');
  ok('the picker exists and is HONEST that it only applies next resume', sb.includes('chat-status-style') && sb.includes('A running session cannot change style'));
  ok('the default style is a documented setting', read('src/lib/settings-schema.js').includes("'claude.outputStyle'"));
  // ── STRIKE FOUR (2.368.1, owner-caught within hours): the sidebar's
  // per-session-config WHITELIST silently dropped both new keys — the exact
  // bug its own comment documents for 'account' (2.43.0) and 'groupManager'
  // (2.132.0). Pin the list AND the tri-state exception, because the truthy
  // filter would erase an explicit autoResume:false (whose whole point is
  // beating the global default being ON).
  const st = read('src/lib/sidebar-state.js');
  ok('config whitelist carries outputStyle (strike-four fix)', /for \(const k of \[[^\]]*'outputStyle'/.test(st));
  ok('an explicit autoResume:false PERSISTS (tri-state, not truthy-filtered)', st.includes('config?.autoResume === true || config?.autoResume === false'));
  ok('the chip reports the EFFECTIVE spawn style, default-sourced included', read('src/ws-create.js').includes('data._effOutputStyle') && read('src/ws-create.js').includes('session._outputStyle = data._effOutputStyle'));
  ok('a pick is VISIBLY pending on the chip (a silent drop must never look like this again)', sb.includes('setOutputStylePending') && sb.includes('applies on the next resume (now running'));
  const cv2 = read('src/lib/chat-view.js');
  ok('partial-meta refreshes do NOT reset the live style (2.368.3: wiping os to \'\' re-lit the hourglass on a running Concise session)', /_applyLiveMeta\(meta\)\s*{\s*if \(!meta\) return;[\s\S]{0,200}'outputStyle' in meta/.test(cv2) && cv2.includes("'autoResume' in meta"));
  // ── 2.368.4 (owner-caught on the very resume the feature was built for):
  // the CREATOR never receives an 'attached' payload — its history loads over
  // HTTP with NO meta — so the live style must ride the 'created' reply. And
  // the attach path copied the payload into meta KEY BY KEY, a hand list that
  // silently lacked outputStyle/autoResume (the whitelist-drift class, fifth
  // strike): both attach-shaped call sites must pass the payload WHOLESALE.
  ok("'created' carries the live style + auto-resume state (always, null = default)", /type: 'created'[\s\S]{0,1800}outputStyle: session\._outputStyle \|\| null[\s\S]{0,200}autoResume: autoResume\?\.statusFor\?\.\(id\) \|\| null/.test(read('src/ws-create.js')));
  const sl2 = read('src/lib/session-lifecycle.js');
  ok('the created handler APPLIES it (HTTP history load has no meta)', /if \(sessionEffort\) chatView\.applyStatus[\s\S]{0,600}chatView\._applyLiveMeta\?\.\(msg\)/.test(sl2));
  ok('the attach path passes the payload WHOLESALE, not a hand-copied key list', /chatView\.loadHistory\(msg\.messages, msg\.totalCount, msg\.isStreaming, msg\)/.test(sl2) && !/loadHistory\(msg\.messages, msg\.totalCount, msg\.isStreaming, { chatStatus: msg\.chatStatus, taskState/.test(sl2));
  ok('…and a zero-message attach still applies live state', /else {\s*\n\s*chatView\._applyLiveMeta\?\.\(msg\);/.test(sl2));
  ok('_fullViewReset passes the payload wholesale too', /this\.loadHistory\(msg\.messages \|\| \[\], msg\.totalCount \|\| 0, msg\.isStreaming, msg\)/.test(cv2));
}

// ── §8 arm-target selection (TWO c1206711 corrections): candidates span
// identities (self + pool siblings), but within one identity the wait is the
// MAX over its DEAD buckets — "重置的是7d但没和5h对齐, 5h还在cd就发了恢复消息"
// (the 2:00am premature fire): the 7d reset came first, the 5h was still
// blocking, the continue bounced. A healthy bucket's nearer reset is not a
// candidate at all. Wiring pinned at all arm sites (2.355.0 lesson).
{
  const { pickArmReset, MAX_WAIT_MS } = require(path.join(REPO, 'src/server/auto-resume.js'));
  const now = 1787751372000;
  const H = 3600000;
  // the premature-fire shape: rejection names the 7d (resets +2h), the 5h
  // bucket is dead until +4.7h — the wait must be +4.7h (max over dead)
  const r1 = pickArmReset({ identities: [{ eventMs: now + 2 * H, buckets: { fiveHour: { resetsAt: (now + 4.7 * H) / 1000, utilization: 1, status: 'limited' }, sevenDay: { resetsAt: (now + 2 * H) / 1000, utilization: 1 } } }], now });
  ok('within one identity the wait is the MAX over DEAD buckets (the 2:00am premature fire)', r1 && r1.label === 'fiveHour' && r1.ms === now + 4.7 * H, JSON.stringify(r1));
  // a HEALTHY bucket resetting sooner is not a candidate
  const r2 = pickArmReset({ identities: [{ buckets: { fiveHour: { resetsAt: (now + 1 * H) / 1000, utilization: 0.4 }, sevenDay: { resetsAt: (now + 9 * H) / 1000, utilization: 1 } } }], now });
  ok("a healthy bucket's nearer reset is ignored (it isn't blocking)", r2 && r2.label === 'sevenDay' && r2.ms === now + 9 * H, JSON.stringify(r2));
  // the pool shape (c1206711 #1): current member 7d dead ~99h out, sibling
  // 5h dead 40min out with 7d healthy — the sibling frees first
  const r3 = pickArmReset({ identities: [
    { eventMs: now + 99 * H, buckets: { sevenDay: { resetsAt: (now + 99 * H) / 1000, utilization: 1, status: 'rejected' } } },
    { label: 'ProblemFactory', buckets: { fiveHour: { resetsAt: (now + 0.6 * H) / 1000, utilization: 1, status: 'limited' }, sevenDay: { resetsAt: (now + 80 * H) / 1000, utilization: 0.6 } } },
  ], now });
  ok('across identities the SOONEST-usable member wins (its own max-over-dead)', r3 && r3.label === 'ProblemFactory:fiveHour' && r3.ms === now + 0.6 * H, JSON.stringify(r3));
  const r4 = pickArmReset({ identities: [{ eventMs: now + 100 * H, buckets: {} }], now });
  ok('all candidates out of range ⇒ nearest returned WITH tooFar (caller must say so)', r4 && r4.tooFar === true, JSON.stringify(r4));
  ok('no dead reset known ⇒ null (nothing to pretend to wait for)', pickArmReset({ identities: [{ buckets: { fiveHour: { resetsAt: 1, utilization: 1 } } }], now }) === null);
  ok('MAX_WAIT is the arming ceiling (26h)', MAX_WAIT_MS === 26 * H);
  const eng2 = read('src/server/usage-pool-engine.js');
  ok('WIRING: the claude dead branch arms via armBestReset(key), not the raw event', /if \(r\.dead\) \{[\s\S]{0,700}armBestReset\(session, key,/.test(eng2));
  ok('WIRING: both codex exhaustion sites go through armBestReset too', /armBestReset\(session, w\.key,/.test(eng2) && /armBestReset\(session, \(w2 && w2\.key\) \|\| '__global_codex__',/.test(eng2));
  ok('WIRING: the LIMIT-BANNER path (re-)arms off the just-marked dead buckets (the premature fire left nothing re-armed)', /armBestReset\(session, key, bannerResetMs \|\| 0, hit\.kind \+ ' limit banner'\)/.test(eng2));
  ok('armBestReset spans pool member identities and BOTH scoped shapes', /identities\.push\(\{ label: m\.name \|\| m\.id, buckets: mb \}\)/.test(eng2) && /raw\.scopedWeekly/.test(eng2));
  const arS = read('src/server/auto-resume.js');
  ok('a far-reset refusal still SPEAKS in the session (1/h floor)', /不会自动续跑/.test(arS) && /_refuseNotified/.test(arS));
}

// ── §9 the OWNER CORRECTION on c1206711 (2026-08-26): the pool had moved the
// session onto a member whose 7d then died, while the 5h-exhausted SIBLING
// (7d fine) was the account to come back to. The pool DID switch back at
// 07:09 — but a hot re-point does not move an idle blocked session, and the
// arm had been refused. Three mechanisms, functionally + wiring-pinned:
//   ① armBestReset includes POOL SIBLING members' bucket resets
//   ② a hot per-session switch fires an ARMED session's continue NOW
//   ③ the timed fire runs beforeFire (pool eval) before spending
{
  const { ar, sent, notes, sessions } = mk({ dflt: true });
  const s9 = sess();
  sessions.set('w9', s9);
  const resets = Date.now() + 60000;
  ar.armIfEnabled('w9', s9, resets, 'fiveHour limit');
  ok('fireNow on an ARMED idle session delivers the continue immediately and disarms', ar.fireNow('w9', '账号池已切换') === true && sent.length === 1 && sent[0].text === CONTINUE_PROMPT && ar.statusFor('w9').armed === false);
  ok('…and says WHY in the session', notes.some((n) => /账号池已切换/.test(n.text)));
  ok('fireNow on an unarmed session is a no-op (never promised a continue)', ar.fireNow('w9', 'again') === false && sent.length === 1);
  ar.armIfEnabled('w9', s9, Date.now() + 60000, 'fiveHour limit');
  s9._isStreaming = true;
  ok('fireNow never interrupts a working session', ar.fireNow('w9', 'x') === false && ar.statusFor('w9').armed === true);
  s9._isStreaming = false;
  // ③ beforeFire ordering on the timed path
  const order = [];
  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-ar9-'));
  const sess2 = new Map();
  const ar2 = create({
    dataDir: d2, activeSessions: sess2,
    serverSetting: () => true,
    beforeFire: () => order.push('pool-eval'),
    sendToSession: () => { order.push('send'); return true; },
  });
  const sB = sess(); sess2.set('wB', sB);
  ar2.armIfEnabled('wB', sB, Date.now() + 1000, 'fiveHour limit');
  ar2.tick(Date.now() + 1000 + GRACE_MS + 1);
  ok('the timed fire runs beforeFire (pool eval) BEFORE sending the continue', order.join(',') === 'pool-eval,send', order.join(','));
  // wiring pins (2.355.0 lesson — every hook must be seen at its call site)
  const eng9 = read('src/server/usage-pool-engine.js');
  ok('WIRING: armBestReset merges pool SIBLING members\' buckets (poolReadCache over poolMembers)', /pa\.type === 'pooled'[\s\S]{0,300}poolReadCache\(pa\.id\)[\s\S]{0,300}poolMembers\(pa\.id\)/.test(eng9));
  ok('WIRING: a HOT per-session switch fireNow()s the armed session (cold restarts via the client instead)', /per-session switch[\s\S]{0,600}if \(a\.hot\) \{ try \{ getAutoResume\(\)\?\.fireNow\?\.\(sid,/.test(eng9));
  ok('WIRING: server.js passes beforeFire → maybePoolAutoSwitch', /beforeFire: \(id, s\) => \{ try \{ maybePoolAutoSwitch\(s\); \} catch \{ \} \}/.test(read('server.js')));
}


// ── §10 FALSE-ARM handling, v2 (2.368.34 — v1's "already recovered" pre-check
// ATE A REAL WALL: a live CLI holds its OLD token, the org-verified banner
// marked the OLD member dead while the pool link pointed at a healthy one, so
// the check read "usable" and refused to arm — 9h dark session). The check is
// GONE; noise is handled by mechanisms that cannot eat a real wall:
//   ① the announcement is DELAYED — disarm inside the window ⇒ never speaks
//   ② noteWorked disarms only on SUSTAINED post-arm output (>30s), so the
//      wall banner's own trailing records can't kill a fresh arm
{
  ok("the unsound pre-check is GONE (link ≠ the org a running CLI is on)", !read('src/server/usage-pool-engine.js').includes('pool already recovered onto a usable member'));
  // delayed announcement: notifyDelayMs=0 fires on the next macrotask —
  // a disarm BEFORE it must suppress the notice entirely
  const d10 = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-ar10-'));
  const notes10 = [];
  const sess10 = new Map();
  const ar10 = create({
    dataDir: d10, activeSessions: sess10, serverSetting: () => true,
    sendToSession: () => true, notify: (id, s, text) => notes10.push(text), notifyDelayMs: 30,
  });
  const sA = sess(); sess10.set('wA', sA);
  ar10.armIfEnabled('wA', sA, Date.now() + 60000, 'fiveHour limit');
  ok('the armed STATE is instant but the announcement is NOT (delayed)', ar10.statusFor('wA').armed === true && notes10.length === 0);
  ar10.noteRecovered('wA', 'pool switch took over');
  await new Promise((r) => setTimeout(r, 80));
  ok('a disarm inside the delay window suppresses the announcement entirely', notes10.length === 0);
  ar10.armIfEnabled('wA', sA, Date.now() + 60000, 'fiveHour limit');
  await new Promise((r) => setTimeout(r, 80));
  ok('a SURVIVING arm announces after the delay', notes10.length === 1 && /自动继续/.test(notes10[0]), JSON.stringify(notes10));
  // noteWorked age gate
  ok('noteWorked within 30s of arming is a NO-OP (the wall banner trails its own assistant records)', (ar10.noteWorked('wA'), ar10.statusFor('wA').armed === true));
  ar10._armed.get('wA').at = Date.now() - 31000;
  ar10.noteWorked('wA');
  ok('sustained post-arm output (>30s) disarms', ar10.statusFor('wA').armed === false);
  // precise banner reset time
  const { ClaudeCodeAdapter } = require(path.join(REPO, 'src/adapters/claude-code.js'));
  const nb = Date.parse('2026-08-27T15:50:00Z');
  ok("the banner's own reset time is parsed with its timezone (12:40pm LA = 19:40Z)", ClaudeCodeAdapter.parseBannerResetMs("You've hit your session limit · resets 12:40pm (America/Los_Angeles)", nb) === Date.parse('2026-08-27T19:40:00Z'));
  ok('…rolls to tomorrow when the wall time already passed; absent time → 0', ClaudeCodeAdapter.parseBannerResetMs('resets 3am (America/Los_Angeles)', nb) === Date.parse('2026-08-28T10:00:00Z') && ClaudeCodeAdapter.parseBannerResetMs('no time here', nb) === 0);
  const eng10 = read('src/server/usage-pool-engine.js');
  ok('WIRING: the banner path feeds the precise time to bump AND armBestReset', /bannerResetMs > Date\.now\(\) \? Math\.floor\(bannerResetMs \/ 1000\)/.test(eng10) && /armBestReset\(session, key, bannerResetMs \|\| 0, hit\.kind/.test(eng10));
  ok('WIRING: noteSessionProduced routes through the age-gated noteWorked', /getAutoResume\(\)\?\.noteWorked\?\.\(session\._webuiId\)/.test(eng10) && /noteSessionProduced\?\.\(session\)/.test(read('src/server/session-stdout.js')));
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
