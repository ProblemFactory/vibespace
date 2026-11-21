'use strict';
// B-ba47 shape H — PURE, loaded by data/bin/vibespace-browser from ITS OWN CHECKOUT only (never a device bundle input: src/browser-verbs.js
// is one, so the rule lives here). A paired machine's copy of the CLI has no checkout and keeps the account's rule inline.
/** B-ba47 shape H: WHOSE HOME a page verb's account-home uses are (`~`, the Downloads write fence, the machine's browser config
 *  and where a composed one is pinned, rung H's profile root). The ACCOUNT's — its passwd entry, never $HOME, which the agent's
 *  shell sets (takeover finding 2) — UNLESS this CLI runs from a checkout (`treeRoot`: server.js beside src/) whose hub RE-HOMED
 *  itself (a copy run from a git worktree, src/server/throwaway-root.js): then $HOME is <treeRoot>/.home — the PRODUCT moved
 *  it there — and that home is the account's for every use; the person's passwd home is never read (`readPw` not called). A copy
 *  beside the CLI on a paired machine (no treeRoot) keeps the account's rule. PURE: the caller hands the facts' readers.
 *  → { home, pw, env, agrees, ownTree? } */
function accountHomeOf({ env = '', treeRoot = null, readPw = () => null, fallback = null, realpath = (p) => p } = {}) {
  const norm = (d) => { try { return realpath(d); } catch { return d; } };
  if (treeRoot && env) {
    const own = norm(`${String(treeRoot).replace(/\/+$/, '')}/.home`);
    if (norm(env) === own) return { home: own, pw: null, env, agrees: true, ownTree: true };
  }
  let pw = null;
  try { pw = readPw() || null; } catch { pw = null; }
  if (!pw) return { home: fallback, pw: null, env, agrees: true };
  return { home: pw, pw, env, agrees: !env || norm(env) === norm(pw) };
}

module.exports = { accountHomeOf };
