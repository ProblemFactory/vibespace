#!/usr/bin/env node
// vibespace-hook — delivers VibeSpace task context through the harness's OWN
// native hooks (never by rewriting the user's message):
//   SessionStart     → the task's context (goal, plan, files, rules)
//   UserPromptSubmit → any pending status-override notice for this session
// No-op unless the session was spawned by VibeSpace (VIBESPACE_* env present).
// THE TURN CARRIED IT — THEN THE HUB MARKS IT (lane report-mark-on-ack, 2026-11-09): the hub moves the marks of an answer
// (a group message «read by», a Task Group delta seen, a notice consumed) only when this hook says it handed the answer to
// the CLI — its stdout written, then the answer's delivery id POSTed back (measured on claude 2.1.321: the CLI attaches
// what the hook printed before exit 0; an answer later than the 3 s fetch abort, or a Stop that SIGTERMs this hook, prints
// nothing and confirms nothing — the hub composes it again next turn). When it prints nothing it says WHY on stderr: the
// CLI keeps a hook's stderr out of the model's context (measured) and hands it to the chat wrapper's log.
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
    // The hook NAMES its event (channel-jump verify r7): a harness that runs this hook and drops its answer (the codex
    // app-server) gets an empty one and nothing is drained or consumed for it — the wrapper's own call is its delivery.
    // It says it will CONFIRM (lane report-mark-on-ack) and when it asked (the hub's journal names an answer it was too late for).
    let res;
    try { res = await fetch(api + path, { headers: { Authorization: 'Bearer ' + token, 'X-VibeSpace-Hook-Event': event, 'X-VibeSpace-Confirm': '1', 'X-VibeSpace-Hook-Sent': String(Date.now()) }, signal: ctl.signal }); }
    catch (e) { say(ctl.signal.aborted ? 'the hub did not answer within 3 s' : 'the hub is unreachable (' + ((e && e.cause && e.cause.code) || (e && e.message) || e) + ')'); return process.exit(0); }
    clearTimeout(timer);
    if (!res.ok) say('the hub answered HTTP ' + res.status);
    if (res.ok) {
      const data = await res.json();
      if (data && data.context) {
        // BOTH harnesses read the NESTED hookSpecificOutput.additionalContext
        // (verified against the Claude 2.1.201 binary — it suggests "Did you
        // mean hookSpecificOutput" — and the Codex *HookSpecificOutputWire
        // JSON schema). Emit ONLY that: Codex's output schema is strict
        // (additionalProperties:false), so an extra top-level additionalContext
        // key makes Codex reject the whole object and inject nothing.
        // a stdout the CLI closed is an answer, never a crash (acceptance r1, law C): the write's error is said below
        process.stdout.on('error', () => { });
        const wrote = await new Promise((resolve) => process.stdout.write(JSON.stringify({
          hookSpecificOutput: { hookEventName: event, additionalContext: data.context },
        }), (e) => resolve(e ? (e.code || 'error') : true)));
        if (wrote !== true) say('its answer could not be written to the CLI (' + wrote + ')');
        else if (typeof data.delivery === 'string') await carried(api, token, data.delivery);
      }
    }
  } catch (e) { say('the hook failed (' + ((e && e.message) || e) + ')'); }
  process.exit(0);
}
/** why this turn has no hub context — stderr only (never the model's context), one line */
function say(why) { try { console.error('vibespace-hook: no hub context this turn — ' + String(why).slice(0, 200)); } catch { } }
/** the answer is written to the CLI: hand its delivery id back. The request is WRITTEN (flushed to the socket)
 *  before this exits — the hub reads a complete request even after the hook is gone; the turn never waits on its answer. */
async function carried(api, token, delivery) {
  try {
    const u = new URL(api + '/api/agent/prompt-context/carried');
    const mod = await import(u.protocol === 'https:' ? 'node:https' : 'node:http');
    const body = JSON.stringify({ delivery });
    await new Promise((resolve) => {
      const done = setTimeout(resolve, 1000);
      const rq = mod.request(u, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, (r) => { r.resume(); r.on('end', () => { clearTimeout(done); resolve(); }); });
      rq.on('error', () => { clearTimeout(done); resolve(); });
      rq.on('finish', () => { clearTimeout(done); setTimeout(resolve, 20); });
      rq.end(body);
    });
  } catch { }
}
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (c) => { buf += c; try { run(JSON.parse(buf)); } catch { } });
process.stdin.on('end', () => { try { run(JSON.parse(buf)); } catch { } if (!ran) process.exit(0); });
setTimeout(() => { say('the hook stopped at its 8 s limit (the CLI did not take its answer)'); process.exit(0); }, 8000); // never hang a session start — and say so (lane report-mark-on-ack r3)
