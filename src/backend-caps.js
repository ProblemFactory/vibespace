'use strict';
// PURE per-backend account/switching capability registry (P4 first slice,
// design-backend-parity.md §4 — owner ask: "把其它agent支持接口化之后怎么区分
// 这些冷切热切之类的feature"). The pool engine consults THIS instead of
// backend-id special cases; a future backend adds a row, never an if-chain.
//
// hotSwitch is a VERDICT, not a wish:
//   'verified'   — forensically proven live re-read (claude: dir-symlink
//                  survives atomic cred writes, env re-resolved per syscall,
//                  CLI re-reads .credentials.json per request —
//                  scripts/test-creds-symlink-swap.mjs).
//   'impossible' — experimentally REFUTED (codex, 2026-08-24 P3: the
//                  app-server canonicalizes CODEX_HOME at startup — a symlink
//                  repoint never reaches a running process — AND a turn
//                  completed fine after auth.json's content was swapped to
//                  garbage tokens ⇒ tokens live in process memory).
//   'unverified' — no experiment yet; treat as cold.
// A pool on a backend without hotSwitch 'verified' always cold-restarts
// (kill → exited → resume), whatever its `hot` flag says.
const BACKEND_CAPS = {
  claude: {
    pool: true,
    hotSwitch: 'verified',
    planC: true,          // per-session pool links (model-family projection)
    sealedOrders: true,   // device-side offline fallback switch
    resetCredit: false,   // no such product concept
    quotaProbe: 'cli-usage',      // `claude -p /usage` auto-cli rung
  },
  codex: {
    pool: true,
    hotSwitch: 'impossible',
    planC: false,
    sealedOrders: false,
    resetCredit: true,    // account/rateLimitResetCredit/consume (stored resets)
    quotaProbe: 'rpc-rate-limits', // account/rateLimits/read on a live app-server
  },
};

const NO_CAPS = Object.freeze({ pool: false, hotSwitch: 'unverified', planC: false, sealedOrders: false, resetCredit: false, quotaProbe: null });

function capsOf(backend) {
  return BACKEND_CAPS[backend || 'claude'] || NO_CAPS;
}

module.exports = { BACKEND_CAPS, capsOf };
