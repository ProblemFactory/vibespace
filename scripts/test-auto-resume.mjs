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
  ok('and the arming was announced too', a.notes.length >= 2);
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
  const resets = T0 + 1000;
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
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
