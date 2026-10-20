'use strict';
// THE AGENT-CLI COMMAND PATHS AND THEIR SPAWN-TIME RE-RESOLVE (B-a18e).
//
// node-pty's posix_spawnp may not find a command whose directory is missing
// from Node's inherited PATH (Homebrew/nvm), so every CLI is resolved to an
// absolute path at BOOT — `resolveCmd`, once per command name. That made the
// boot instant the only moment the answer was ever asked for: an Update
// restart that landed inside an installer's window ("old version deleted, new
// one not yet placed", a fleet instance, 2026-08-11) pinned a path that no
// longer existed, and EVERY spawn failed until somebody restarted again.
//
// `forSpawn(backend, cmd)` is the ONE spawn-time check every local session
// spawn passes through (the pty terminal, the chat wrapper and the daemon
// pipe all run the same argv, built in src/ws-create.js): the resolved path
// still executable ⇒ untouched (one `access`, no process); gone ⇒ resolveCmd
// runs ONCE more, the new path is adopted by the adapter (so later spawns are
// born right) and ONE log line names the old and the new path — creates that
// arrive together in that window share the one re-resolve; nothing found
// ⇒ the spawn proceeds exactly as before and fails the way it always did. The
// spawned CLI runs INSIDE a wrapper under dtach, so its ENOENT is never seen by
// this process — the check before the spawn IS the retry.
//
// `check(backend, { force })` is THE READ-TIME twin (lane antigravity-card-fixes,
// the owner 2026-10-20: Manage agents said 「Antigravity CLI 未安装」 for an agy
// installed five minutes after the hub booted — the boot answer was the only one
// ever asked for, and a READ never spawns). A resolved path is re-validated on
// every read (one `access`), so an uninstall shows; an unresolved or gone one is
// looked up again at most once per RECHECK_MS per CLI (one `which`) — unless the
// read is a person's (Install / Re-check in Manage agents: `force`). A path found
// is ADOPTED exactly like a spawn-time re-resolve (the adapter gets it, one log
// line), and the shared lookup is single-flight with forSpawn's.
const fs = require('fs');
const path = require('path');
const { execFileSync, execFile } = require('child_process');

// The directories a bare name is looked for in after `which`, in order.
function candidateDirs(envPath = process.env.PATH) {
  return ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin',
    ...(envPath || '').split(path.delimiter).filter(Boolean)];
}

/** BOOT ONLY (sync): absolute path of `name`, or `name` itself when nothing
 *  executable is found (the caller spawns it bare, as it always has). */
function resolveCmd(name) {
  try {
    const r = execFileSync('/usr/bin/which', [name], { encoding: 'utf-8', timeout: 2000 }).trim();
    if (r && r.startsWith('/')) return r;
  } catch {}
  for (const dir of candidateDirs()) {
    const p = path.join(dir, name);
    try { fs.accessSync(p, fs.constants.X_OK); return p; } catch {}
  }
  return name;
}

/** The SAME lookup, async — the spawn-time spelling (a create path never
 *  blocks the event loop). */
function resolveCmdAsync(name) {
  return new Promise((resolve) => {
    execFile('/usr/bin/which', [name], { encoding: 'utf-8', timeout: 2000 }, async (err, out) => {
      const r = !err && String(out || '').trim();
      if (r && r.startsWith('/')) return resolve(r);
      for (const dir of candidateDirs()) {
        const p = path.join(dir, name);
        try { await fs.promises.access(p, fs.constants.X_OK); return resolve(p); } catch {}
      }
      resolve(name);
    });
  });
}

const executable = async (p) => {
  if (typeof p !== 'string' || !p.startsWith('/')) return false;
  try { await fs.promises.access(p, fs.constants.X_OK); return true; } catch { return false; }
};

/** The bound on a READ's lookup of an unresolved (or gone) CLI: one `which` per
 *  CLI per this many ms; a person's Install / Re-check skips it (`force`). */
const RECHECK_MS = 30000;

/** @param {object} o
 *  @param {(name:string)=>Promise<string>} [o.resolve] the re-resolve (default resolveCmdAsync)
 *  @param {(p:string)=>Promise<boolean>} [o.usable] is this path spawnable (default: absolute + X_OK)
 *  @param {(line:string)=>void} [o.log]
 *  @param {number} [o.recheckMs] the read-time lookup bound (RECHECK_MS)
 *  @param {()=>number} [o.now] the clock the bound reads */
function createCliCmds({ resolve = resolveCmdAsync, usable = executable, log = (l) => console.log(l), recheckMs = RECHECK_MS, now = Date.now } = {}) {
  const entries = new Map(); // backend → { name, current, apply, pending, lookedAt }
  // SINGLE-FLIGHT: callers that land in the stale window together share ONE
  // re-resolve (one lookup, one adapter hand-off, one journal line — the
  // initiator's `said`). Released the moment it settles, so a binary that stays
  // missing is asked about again by the next caller — never a cached "missing".
  // Answers the adopted path, or null when nothing usable was found.
  const reresolve = (backend, e, said) => {
    if (!e.pending) {
      e.pending = (async () => {
        let fresh = null;
        try { fresh = await resolve(e.name); } catch { fresh = null; }
        const was = e.current;
        if (fresh && await usable(fresh)) {
          e.current = fresh;
          try { e.apply(fresh); } catch (err) { log(`[cli-cmd] ${backend}: could not hand '${fresh}' to the adapter — ${err && err.message}`); }
          said(was, fresh);
          return fresh;
        }
        said(was, null);
        return null;
      })().finally(() => { e.pending = null; });
    }
    return e.pending;
  };
  return {
    /** `name` = what the lookup asks for (the raw command, env override
     *  included); `current` = the path boot resolved; `apply(p)` = hand a
     *  re-resolved path to whoever builds the spawn spec. */
    register(backend, { name, current, apply = () => {} }) {
      if (!backend || !name) return;
      entries.set(backend, { name, current: current || name, apply, pending: null, lookedAt: -Infinity });
    },
    current(backend) { const e = entries.get(backend); return e ? e.current : null; },
    /** Every registered backend (the status route checks them all). */
    ids() { return [...entries.keys()]; },
    /** The command to spawn for `backend`. Only the registered, boot-resolved
     *  command is ever re-resolved: a spec override, `ssh`, node or a login
     *  shell pass through untouched. */
    async forSpawn(backend, cmd) {
      const e = entries.get(backend);
      if (!e || !cmd || cmd !== e.current) return cmd;
      if (await usable(cmd)) return cmd;
      const fresh = await reresolve(backend, e, (was, p) => log(p
        ? `[cli-cmd] ${backend}: '${cmd}' is not executable at spawn time — re-resolved '${e.name}' to '${p}' (no restart needed)`
        : `[cli-cmd] ${backend}: '${cmd}' is not executable at spawn time and re-resolving '${e.name}' found nothing — spawning it as before`));
      return fresh || cmd;
    },
    /** THE READ-TIME CHECK: the usable absolute path of `backend`'s CLI right
     *  now, or null (not installed / gone). A resolved path costs one `access`
     *  per read; an unresolved or gone one is looked up at most once per
     *  `recheckMs` (a read inside the bound answers null without a lookup), and
     *  `force` (a person's Install / Re-check) looks it up now. */
    async check(backend, { force = false } = {}) {
      const e = entries.get(backend);
      if (!e) return null;
      if (typeof e.current === 'string' && e.current.startsWith('/') && await usable(e.current)) return e.current;
      const t = now();
      if (!force && t - e.lookedAt < recheckMs) return null;
      e.lookedAt = t;
      return reresolve(backend, e, (was, p) => {
        if (p && p !== was) log(`[cli-cmd] ${backend}: '${e.name}' found at '${p}' on a status read (it was '${was}') — no restart needed`);
      });
    },
  };
}

module.exports = { resolveCmd, resolveCmdAsync, createCliCmds, candidateDirs, RECHECK_MS };
