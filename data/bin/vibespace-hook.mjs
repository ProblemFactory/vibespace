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
      // Call task-context whether or not a task is bound: with a task it returns
      // the task context; without one it returns the baseline VibeSpace tools
      // intro (so no-task sessions still learn to report their status). The
      // endpoint scopes to the session's OWN task via the token, ignoring this query.
      const taskId = process.env.VIBESPACE_TASK_ID;
      path = '/api/agent/task-context' + (taskId ? '?taskId=' + encodeURIComponent(taskId) : '');
    } else if (event === 'UserPromptSubmit') {
      path = '/api/agent/prompt-context';
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
