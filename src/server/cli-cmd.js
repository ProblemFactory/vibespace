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

/** @param {object} o
 *  @param {(name:string)=>Promise<string>} [o.resolve] the re-resolve (default resolveCmdAsync)
 *  @param {(p:string)=>Promise<boolean>} [o.usable] is this path spawnable (default: absolute + X_OK)
 *  @param {(line:string)=>void} [o.log] */
function createCliCmds({ resolve = resolveCmdAsync, usable = executable, log = (l) => console.log(l) } = {}) {
  const entries = new Map(); // backend → { name, current, apply, pending }
  return {
    /** `name` = what the lookup asks for (the raw command, env override
     *  included); `current` = the path boot resolved; `apply(p)` = hand a
     *  re-resolved path to whoever builds the spawn spec. */
    register(backend, { name, current, apply = () => {} }) {
      if (!backend || !name) return;
      entries.set(backend, { name, current: current || name, apply, pending: null });
    },
    current(backend) { const e = entries.get(backend); return e ? e.current : null; },
    /** The command to spawn for `backend`. Only the registered, boot-resolved
     *  command is ever re-resolved: a spec override, `ssh`, node or a login
     *  shell pass through untouched. */
    async forSpawn(backend, cmd) {
      const e = entries.get(backend);
      if (!e || !cmd || cmd !== e.current) return cmd;
      if (await usable(cmd)) return cmd;
      // SINGLE-FLIGHT: creates that land in the stale window together share
      // ONE re-resolve (one lookup, one adapter hand-off, one journal line).
      // Released the moment it settles, so a binary that stays missing is
      // asked about again by the next create — never a cached "missing".
      if (!e.pending) {
        e.pending = (async () => {
          let fresh = null;
          try { fresh = await resolve(e.name); } catch { fresh = null; }
          if (fresh && await usable(fresh)) {
            e.current = fresh;
            try { e.apply(fresh); } catch (err) { log(`[cli-cmd] ${backend}: could not hand '${fresh}' to the adapter — ${err && err.message}`); }
            log(`[cli-cmd] ${backend}: '${cmd}' is not executable at spawn time — re-resolved '${e.name}' to '${fresh}' (no restart needed)`);
            return fresh;
          }
          log(`[cli-cmd] ${backend}: '${cmd}' is not executable at spawn time and re-resolving '${e.name}' found nothing — spawning it as before`);
          return cmd;
        })().finally(() => { e.pending = null; });
      }
      return e.pending;
    },
  };
}

module.exports = { resolveCmd, resolveCmdAsync, createCliCmds, candidateDirs };
