#!/usr/bin/env node
// vibespace-hook — delivers VibeSpace task context through the harness's OWN
// native hooks (never by rewriting the user's message):
//   SessionStart     → the task's context (goal, plan, files, rules)
//   UserPromptSubmit → any pending status-override notice for this session
// No-op unless the session was spawned by VibeSpace (VIBESPACE_* env present).
let buf = '';
let ran = false;
async function run(input) {
  if (ran) return;
  ran = true;
  try {
    const event = input.hook_event_name;
    const api = process.env.VIBESPACE_API;
    const token = process.env.VIBESPACE_SESSION_TOKEN;
    if (!api || !token) return process.exit(0);
    let path;
    if (event === 'SessionStart') {
      // Which Task Group(s) this session belongs to is resolved SERVER-SIDE from
      // the token (live-derived — explicit tag / auto-include folder / spawned-
      // into group), so the hook passes no id. With groups it returns their
      // shared context; with none, the baseline VibeSpace tools intro (so every
      // session still learns to report its status).
      path = '/api/agent/task-context';
    } else if (event === 'UserPromptSubmit') {
      path = '/api/agent/prompt-context';
    } else if (event === 'Stop') {
      // Bookkeeping nudge with teeth: the SERVER decides (status freshness +
      // 30min cooldown) whether the agent must update its board before this
      // stop sticks. stop_hook_active = we already nudged — never loop.
      if (input.stop_hook_active) return process.exit(0);
      const c2 = new AbortController();
      const t2 = setTimeout(() => c2.abort(), 2500);
      const r = await fetch(api + '/api/agent/stop-check', { headers: { Authorization: 'Bearer ' + token }, signal: c2.signal });
      clearTimeout(t2);
      if (r.ok) {
        const d = await r.json();
        if (d && d.block && d.reason) process.stdout.write(JSON.stringify({ decision: 'block', reason: d.reason }));
      }
      return process.exit(0);
    } else {
      return process.exit(0);
    }
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 3000);
    const res = await fetch(api + path, { headers: { Authorization: 'Bearer ' + token }, signal: ctl.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      if (data && data.context) {
        // BOTH harnesses read the NESTED hookSpecificOutput.additionalContext
        // (verified against the Claude 2.1.201 binary — it suggests "Did you
        // mean hookSpecificOutput" — and the Codex *HookSpecificOutputWire
        // JSON schema). Emit ONLY that: Codex's output schema is strict
        // (additionalProperties:false), so an extra top-level additionalContext
        // key makes Codex reject the whole object and inject nothing.
        process.stdout.write(JSON.stringify({
          hookSpecificOutput: { hookEventName: event, additionalContext: data.context },
        }));
      }
    }
  } catch { }
  process.exit(0);
}
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (c) => { buf += c; try { run(JSON.parse(buf)); } catch { } });
process.stdin.on('end', () => { try { run(JSON.parse(buf)); } catch { } if (!ran) process.exit(0); });
setTimeout(() => process.exit(0), 8000); // never hang a session start
