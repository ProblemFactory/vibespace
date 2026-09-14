'use strict';
/**
 * BACKEND READINESS FOR ONBOARDING — `GET /api/backend-status`.
 * Extracted VERBATIM from server.js (2026-09-13) so the channels wiring
 * stanza fits inside the size ratchet: this is a MECHANISM (machine probes +
 * an orchestrator-side composition over the account roster), not bootstrap,
 * so by the routing table it belongs under src/server/.
 *
 * Is each CLI installed and logged in? Login detection is best-effort file
 * existence — it NEVER spawns the CLIs.
 *
 * R1 (three-tier): the machine facts come from the SHARED probe module — the
 * same implementation the device daemon serves as `probe-cli` for remote
 * machines. This route is device #0's in-process call (CS amendment #2: shared
 * implementation, no socket transit). Orchestrator-only composition (env-key
 * overlay, named-account counts) layers on after.
 */
function create({ app, machineProbes, accounts, claudeCmd, codexCmd } = {}) {
  if (!app) throw new Error('backend-status-route: app is required');

  app.get('/api/backend-status', async (req, res) => {
    let out;
    try { out = await machineProbes.cliFacts({ claudeCmd, codexCmd }); } catch { out = { claude: {}, codex: {} }; }
    if (!out.claude.loggedIn && process.env.ANTHROPIC_API_KEY) { out.claude.loggedIn = true; out.claude.loginMethod = 'env-key'; }
    // Named-account nuance (2.267.1): under full pooling the MACHINE login
    // legitimately idles to token-less — count usable named identities so the
    // client can say what's actually true instead of "not logged in".
    try {
      const l = accounts.list();
      out.claude.namedLoggedIn = (l.accounts || []).filter((a) =>
        (a.backend || 'claude') === 'claude' && (a.loggedIn || (!a.pooled && a.type !== 'subscription' && a.tail))).length;
      if (out.codex) out.codex.namedLoggedIn = (l.accounts || []).filter((a) => a.backend === 'codex' && a.loggedIn).length; // onboarding readiness per backend (2.369.21)
    } catch {}
    res.json(out);
  });
}

module.exports = { create };
