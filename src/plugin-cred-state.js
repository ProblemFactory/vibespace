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

/** `{ ready, host, kind }` — ready only with a host AND a sealed secret the hub can read NOW (`set.token` or
 *  `set.deployKey`). A locked vault answers `values: {}` / `set: {}` (the integration card names the lock by itself),
 *  so the dialog says «not set» then — never «ready» over a secret nobody can open. Never throws. */
function pluginGitCredOf(answer) {
  const v = viewOf(answer);
  const host = v && v.values && typeof v.values === 'object' ? String(v.values.host || '') : '';
  const set = v && v.set && typeof v.set === 'object' ? v.set : {};
  const kind = set.token ? 'token' : set.deployKey ? 'deployKey' : null;
  return { ready: !!(host && kind), host, kind };
}

module.exports = { viewOf, pluginGitCredOf };
