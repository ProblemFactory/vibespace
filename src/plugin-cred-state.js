// src/plugin-cred-state.js — PURE (CJS, imports nothing): what the «Install plugin…» dialog may say about the
// Plugin Git credential. Hotfix 2.369.368 (the owner, 2026-10-31, installing the custom browser): the dialog read
// `c.values` / `c.set` off the ROUTE'S ENVELOPE — /api/integrations/:id answers `{ integration: publicView }` —
// so a saved credential always read «not set — Set up…» and a private repository could never be chosen.
// ONE reader of that answer shape lives here; src/lib/plugins-ui.js readCred goes through it; the shape is pinned
// both ways in scripts/test-dialog-yield.mjs (the reader + the route).
'use strict';

/** The view inside the route's answer (`{ integration: view }`), or a bare view (one shape, one reader); null for
 *  no answer, a refusal (`{ error }`) or anything that is not a view. */
function viewOf(answer) {
  if (!answer || typeof answer !== 'object') return null;
  const v = answer.integration && typeof answer.integration === 'object' ? answer.integration : answer;
  return v && typeof v === 'object' && (v.values || v.set || v.id) ? v : null;
}

/** `{ ready, host, kind, locked }` — ready only with a host AND a sealed secret the hub can read NOW (`set.token` or
 *  `set.deployKey`). A locked vault answers the measured shape — `values: { host: '', username: '' }`, every `set` false,
 *  `whyCode: 'vault-locked'` — so it is never «ready» over a secret nobody can open, and `locked` lets the dialog say the
 *  lock instead of «not set» (B-3b8e: «not set — Set up…» sent the person to set up a credential already saved). Never throws. */
// B-3b8e follow-up (主开发's reading of 249f68f34): a FAILED act never looks like something else — `state` names WHY a credential
// is not ready: 'unread' (the read failed or was refused — no view: it may well be saved), 'locked' (the vault), 'undecryptable'
// (saved, the key cannot open it), 'store-unreadable' (the integrations store itself), else 'unset' (nothing saved)
const STATE_OF_WHY = Object.freeze({ 'vault-locked': 'locked', undecryptable: 'undecryptable', 'store-unreadable': 'store-unreadable' });
function pluginGitCredOf(answer) {
  const v = viewOf(answer);
  const host = v && v.values && typeof v.values === 'object' ? String(v.values.host || '') : '';
  const set = v && v.set && typeof v.set === 'object' ? v.set : {};
  const kind = set.token ? 'token' : set.deployKey ? 'deployKey' : null;
  const ready = !!(host && kind);
  const state = ready ? 'ready' : !v ? 'unread' : Object.prototype.hasOwnProperty.call(STATE_OF_WHY, v.whyCode) ? STATE_OF_WHY[v.whyCode] : 'unset';
  return { ready, host, kind, locked: state === 'locked', state };
}

module.exports = { viewOf, pluginGitCredOf };
