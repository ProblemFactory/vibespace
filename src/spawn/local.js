/**
 * THE LOCAL SPAWN LADDER (decoupling wave 2b, lane dc-seams-server, 2026-10-05) — one member of the
 * spawn-ladder registry (src/spawn/index.js `spawnFor(host)`; docs/design-cs-unification.md
 * "Remaining 2"). A create with no hostId (this machine, device #0): the passive usage
 * statusline of a terminal and the pre-resume writer sweep over device #0. The spawn line itself
 * is ws-create's shared tail (dtach, or the R6 daemon pipe for a chat).
 * MOVED VERBATIM out of src/ws-create.js's createBody (the lines below keep their indentation there,
 * so `git diff --color-moved` / `git blame -C` show a move): the closures it captured arrive as the
 * ladder context `c` (ws-create `ladderCtx`), the four spawn-line `let`s it assigned are its answer.
 * A ladder ANSWERS {spawnCmd, spawnArgs, spawnEnvPairs, spawnCwd} for ws-create's shared dtach /
 * pipe spawn tail, or undefined once it has answered the socket itself (the old `return;` that
 * ended the create — ws-create returns on it). No `break;` crosses the seam (a stray one would be a
 * SyntaxError here, not a silent change of the do{}while(0) exit).
 */
const { sweepWriters } = require('../writer-sweep');
const { hasWriterSweep } = require('../resume-store');

async function prepare(c) {
  const { ctx, data, backend, SP, sessionMode, session, spawnAccount, sweepOpts, usageEnvPairs } = c;
  const { hosts, USAGE_STATUSLINE_CMD, userStatuslineCmd } = ctx;
  let { spawnCmd, spawnArgs, spawnEnvPairs, spawnCwd } = c;
  const answer = () => ({ spawnCmd, spawnArgs, spawnEnvPairs, spawnCwd });
          // PASSIVE usage capture (§ban-safety): for LOCAL CLAUDE TERMINAL
          // sessions (a statusLine only renders in the TUI — chat/stream-json
          // has none), inject a statusLine command that harvests the CLI's OWN
          // 5h/7d rate_limits into data/usage-cache/. This is why VibeSpace
          // makes NO background /api/oauth/usage calls with subscription
          // tokens. Merged into any existing --settings (e.g. ultracode) so
          // there's ONE flag. The harness gate (spawn.statusline) is load-bearing: only the claude
          // CLI understands --settings — appending it to `zsh -l` (shell
          // terminals, incl. the Manage-Agents update/login helpers) or codex
          // made them exit instantly ("terminated").
          // Deliberately NOT gated by the Integration master switch (2.190.1,
          // user decision): the statusline is never model-visible — it renders
          // in the TUI and writes usage-cache locally. The switch scopes to
          // AGENT-VISIBLE integration only (hooks/context/tools); billing env
          // is likewise exempt.
          if (typeof SP.statusline === 'function' && sessionMode === 'terminal' && !data.hostId && USAGE_STATUSLINE_CMD) {
            try {
              spawnArgs = SP.statusline(spawnArgs, USAGE_STATUSLINE_CMD);
              // A POOLED spawn attributes usage to the real TARGET account, not
              // the pool: the statusline cache + quota popup are per-account.
              // The old comment here claimed "the target is fixed for this
              // process's lifetime anyway (a hot re-point is a known
              // attribution seam handled by the ledger's time-based records)".
              // It was wrong on both halves (2026-09-07): the CLI re-reads the
              // credential file on the re-point's mtime bump, and the STATUSLINE
              // cache is not the ledger — nothing re-attributed it by time, so
              // every later reading of a hot-switched terminal session landed on
              // the member it started on. The link itself is the slot, so ship
              // its PATH and let the statusline resolve it per write.
              const acctKey = spawnAccount?.poolTarget || spawnAccount?.id || '__global__';
              const orig = (userStatuslineCmd && userStatuslineCmd()) || '';
              usageEnvPairs.push(`VIBESPACE_ACCOUNT_KEY=${acctKey}`);
              // resolveForSpawn NAMES the credential symlink (`linkPath`) — the
              // per-session plan-C link, else the pool default. Not derived
              // from localEnv here: the consumer must not guess which key of a
              // spawn env happens to hold the slot.
              if (spawnAccount?.pooled && spawnAccount.linkPath) usageEnvPairs.push(`VIBESPACE_ACCOUNT_LINK=${spawnAccount.linkPath}`);
              if (orig) usageEnvPairs.push(`VIBESPACE_ORIG_STATUSLINE=${orig}`);
            } catch {}
          }
          // ── LOCAL pre-resume writer sweep (CS separation, 2.276.0) ──
          // The SAME invariant the remote paths have enforced since B-4058:
          // no other process may still be writing this conversation. Local
          // never had it — not because local is safe (a claude running in an
          // external terminal holds the transcript exactly the same way) but
          // because the incident that motivated the sweep happened remotely,
          // and the local twin is the one nobody exercises. Now hostId is a
          // parameter: the identical script runs over device #0.
          // The live-session case is already refused earlier (2.179.0
          // resume-already-live) — EXCEPT forks, which that guard exempts by
          // design (branching a live conversation is legitimate). A fork must
          // therefore skip the sweep too: its resume target is the live
          // parent's own conversation, and sweeping it SIGTERMs the parent
          // mid-turn (2.284.4, real incident on this very machine — the fork
          // writes a NEW id's JSONL, so there is no double-writer to prevent).
          // Codex too (P1): `thread/resume` reuses the thread id, and a codex
          // app-server holds its rollout open for its lifetime — a `codex
          // resume <id>` TUI in an external terminal is exactly the local
          // double-writer the claude leg exists for.
          if (data.resume && data.resumeId && !data.fork && !data.hostId && !data.keeperSid
              && hasWriterSweep(backend) && /^[\w-]+$/.test(data.resumeId) && hosts) {
            try {
              // shq is defined in the remote branches' scope, not here — the
              // undefined ref was swallowed by this catch and the local sweep
              // NEVER ran (caught in a fleet console ring: "sweep skipped:
              // shq is not defined"). Inline the same quoting.
              const shqL = (v) => `'${String(v).replace(/'/g, `'\''`)}'`;
              const r = await sweepWriters(hosts, null, data.resumeId, { shq: shqL, connectMs: 8000, ...sweepOpts(null) });
              if (r.swept.length) session._resumeSwept = { host: 'this machine', pids: r.swept };
            } catch (e) {
              // Local device daemon down ⇒ legacy behaviour (no sweep), which
              // is what every release before this one did — warn, never block.
              console.warn('[session] local pre-resume sweep skipped:', e.message);
            }
          }
  return answer();
}

module.exports = {
  id: 'local',
  hostless: true, // the member for a create that names no host
  terminal: prepare,
  chat: prepare,
};
