'use strict';
// cwd-wait.js — A FOLDER THAT WAITS IS NOT GONE (B-864f; userW's incident of 2026-10-23: «Resume all» pressed after an
// update restart, BEFORE the vault was unlocked, judged every conversation whose folder sits on a pulled machine folder or
// a storage mount «Working directory is gone»). Every restart locks the vault (no auto-unlock); a storage mount's
// credentials and a machine's link token are sealed under it, so the mount point is a bare folder for as long as the vault
// stays locked — and for the seconds its mount takes after the unlock. src/ws-create.js asks `verdict(cwd)` for a LOCAL cwd
// BEFORE anything is recreated (a folder made under a mount point that waits is the very
// shadow that blocks the mount later — mounts.js shadowedBy). `verdict(cwd, { missing })`, for EVERY local cwd (a mount point
// left as a bare folder passes `test -d`):
//   { why: 'vault_locked', root, name } — the vault is locked and the mount on the path needs it (a storage row whose secret is
//     sealed under it; a machine's pulled folder — its link token is a vault entry): the create is refused by that code (the
//     page's window says it resumes once the vault is unlocked, and it does — src/lib/session-lifecycle.js);
//   { why: 'mount_starting', root, name } — that mount is being brought up (its connect / start in flight, or the unlock less
//     than HEAL_MS ago and its restore not failed): `whenBack(cwd)` waits for it, bounded, and the folder is probed again;
//   { why: 'mount_down', root, name } — the folder is MISSING under a recorded mount that is not up: refused by that code —
//     never «gone», never recreated (an empty folder made there would shadow the mount);
//   null — no recorded mount down on the path (or an existing folder under one that waits for nothing): the folder's own
//     verdict stands.
// The managers register where the server wires them (src/server/mounts-plugins-wiring.js: the vault + the storage mounts;
// src/server/dial-pairing.js: the hosts + the machine mounts) — before that, in a worker, and in a process with neither,
// nothing waits. No fs of its own: the managers' answers (shadowedBy / list) only.

const HEAL_MS = 90e3;   // an unlock's restore: every storage mount re-mounted in turn, every machine re-dialed and its pulls healed
const BACK_MS = 45e3;   // the longest one create waits for its mount (a mount's own connect window is 10–25 s)
const STEP_MS = 500;
const VAULT_LOCKED = 'key-unreadable:vault_locked';   // = src/key-file.js VAULT_LOCKED: a storage row's key the locked vault holds
const reg = { vault: null, mounts: null, getHosts: null, getMachineMounts: null };

function register(o) { for (const k of Object.keys(reg)) if (o && o[k] !== undefined) reg[k] = o[k]; }
const under = (p, root) => !!root && (p === root || p.startsWith(String(root).replace(/\/+$/, '') + '/'));
const call = (fn, dflt) => { try { return fn(); } catch { return dflt; } };

function machineName(hostId) {
  const hosts = typeof reg.getHosts === 'function' ? call(() => reg.getHosts(), null) : null;
  const h = hosts ? call(() => hosts.get(hostId), null) : null;
  return String((h && (h.name || h.host)) || hostId || 'a machine');
}

/** The recorded mount whose mount point holds `cwd` and is not up now → { root, name, busy, failed, sealed } or null:
 *  busy = its connect / start is in flight; failed = its last restore ended in an error; sealed = it needs the vault. */
function downMountOf(cwd) {
  const p = String(cwd || '');
  if (!p) return null;
  const mounts = reg.mounts;
  const m = mounts && typeof mounts.shadowedBy === 'function' ? call(() => mounts.shadowedBy(p), null) : null;
  if (m && m.desired === 'mounted') {
    const row = call(() => (mounts.list() || []).find((r) => r.id === m.id), null) || {};
    const busy = !!(row.connecting || row.starting);
    return { root: call(() => mounts.pathOf(m), null), name: String(m.name || ''), busy, failed: !busy && !!row.error, sealed: !!(row.keyFile && row.keyFile.code === VAULT_LOCKED) };
  }
  const mm = typeof reg.getMachineMounts === 'function' ? call(() => reg.getMachineMounts(), null) : null;
  for (const r of (mm && typeof mm.list === 'function' ? call(() => mm.list(), []) : [])) {
    if (r && r.dir === 'pull' && !r.live && under(p, r.mountpoint)) return { root: r.mountpoint, name: machineName(r.hostId), busy: false, failed: false, sealed: true };
  }
  return null;
}

/** Why a local `cwd` waits, or cannot start, because of the mount it sits on (see the head) — or null. */
function verdict(cwd, { missing = true, now = Date.now() } = {}) {
  const d = downMountOf(cwd);
  if (!d) return null;
  const f = reg.vault && typeof reg.vault.facts === 'function' ? call(() => reg.vault.facts(), null) : null;
  const at = { root: d.root, name: d.name };
  if (f && f.state === 'locked' && d.sealed) return { why: 'vault_locked', ...at };
  if (d.busy || (f && f.state === 'unlocked' && !d.failed && Number(f.unlockedSince) > 0 && now - Number(f.unlockedSince) < HEAL_MS)) return { why: 'mount_starting', ...at };
  return missing ? { why: 'mount_down', ...at } : null;
}

/** Wait (bounded) while `cwd`'s mount is being brought up: true once the mount point is up, false when it stops waiting
 *  (the bound, the heal window over, the vault locked again) — the caller probes the folder and asks `verdict` again. */
async function whenBack(cwd, { ms = BACK_MS, now = () => Date.now(), sleep = (t) => new Promise((r) => setTimeout(r, t)) } = {}) {
  const until = now() + ms;
  for (;;) {
    if (!downMountOf(cwd)) return true;
    const w = verdict(cwd, { now: now() });
    if (!w || w.why !== 'mount_starting' || now() >= until) return false;
    await sleep(STEP_MS);
  }
}

/** The refusal's words (the hub's own log and an older page; the page words it itself, src/lib/session-lifecycle.js). */
const lockedWords = (cwd, w) => `the vault is locked — the folder ${cwd} is on ${w.name}, which opens after the owner unlocks the vault with the second password (nothing was started; the conversation resumes once it is unlocked)`;
const downWords = (cwd, w) => `the folder ${cwd} is on ${w.name}, which is not mounted right now — nothing was started and nothing was made there (an empty folder would hide the mount); resume once it is back`;

module.exports = { register, verdict, whenBack, lockedWords, downWords, HEAL_MS, BACK_MS };
