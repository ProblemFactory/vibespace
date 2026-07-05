#!/usr/bin/env node
// vibespace-hook — injects VibeSpace task context at SessionStart.
// No-op unless the session was spawned by VibeSpace with a bound task.
let buf = '';
let ran = false;
async function run(input) {
  if (ran) return;
  ran = true;
  try {
    if (input.hook_event_name !== 'SessionStart') return process.exit(0);
    const api = process.env.VIBESPACE_API;
    const token = process.env.VIBESPACE_SESSION_TOKEN;
    const taskId = process.env.VIBESPACE_TASK_ID;
    if (!api || !token || !taskId) return process.exit(0);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 3000);
    const res = await fetch(api + '/api/agent/task-context?taskId=' + encodeURIComponent(taskId), {
      headers: { Authorization: 'Bearer ' + token }, signal: ctl.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      if (data?.context) {
        // Claude Code (verified against 2.1.201 binary: it even suggests "Did
        // you mean hookSpecificOutput") requires the nested shape; Codex's
        // hook schema descends from the same contract but the org's plugin
        // uses top-level additionalContext — emit BOTH keys, each harness
        // reads the one it knows.
        process.stdout.write(JSON.stringify({
          hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: data.context },
          additionalContext: data.context,
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
