'use strict';
/**
 * PURE (imports nothing; CJS so the store, the census and the browser bundle
 * share ONE spelling) — WHO FILED a For-you item (B-328d, 2026-09-24).
 *
 * The owner expected a third inbox tab for the spend notices and found them
 * buried among everything else. The decision (not a Spending tab): every item
 * carries a closed-set `origin` naming its PRODUCER, and the popup's Notices
 * area groups by it behind filter chips.
 *
 *   spend    — src/server/spend-guard.js (the unattended-turn ceiling)
 *   login    — src/server/login-expiry-watch.js (a subscription login ending)
 *   pool     — src/server/usage-pool-engine.js (the reset-credit decision)
 *   jobs     — src/server/jobs-wiring.js (Background Work notify / ask; B-dfb4: the ≤ 1/h notice that a
 *              conversation's job notifications fell off the 30-entry stash cap)
 *   channels — src/server/channels-engine.js (adapter failures, outbox, reach)
 *   browser  — src/server/browser-handback.js + the browser-switch proposal
 *              (src/server/mounts-plugins-wiring.js wires the browser routes)
 *              + src/server/browser-keeper.js (a profile's browser keeps
 *              closing: the heal budget's ONE notice, lane H verify r5)
 *   machines — src/exit-proxy.js (lane-pairing ⑥: an exit's "ask me each time" — Allow / Deny a command an
 *              agent wants to run ON a paired machine, 60 s)
 *              + src/server/device-upgrade-watch.js (a device agent the hub could not update — ONE item per
 *              machine and version, retracted when the device reports it; lane device-upgrade-stuck)
 *   apps     — src/server/apps-engine.js (Layer 0 of docs/design-app-persistence.zh.md: an agent's PROPOSAL to install /
 *              remove an app or add a package source — Install opens the install dialog, Not now declines — and the
 *              one notice when apps could not be put back after a rebuilt machine)
 *   agent    — src/agent-routes.js (`vibespace-ask`, an agent's own item)
 *              + src/server/helper-asks.js (a helper's permission ask left
 *              unanswered for 60 s — lane S1)
 *              + src/server/unexpected-exit.js (a conversation that exited
 *              unexpectedly while working: restarted once, or why not — B-f698)
 *
 * Exactly the producers that file (r2: a `system` row was dropped — nothing
 * has ever filed with `by: 'system'`, so its group, chip and legacy-rung row
 * described a group that could not appear). The array order IS the display
 * order of the Notices groups. A producer DECLARES its origin at the `add()`
 * call — the store REFUSES a filing that names none (r2: fail closed; a
 * default let an undeclared producer file under Agents silently, the buried-
 * notice class this field exists to end) and
 * scripts/test-user-todos-layout.mjs ⑪ is the census beside it (every
 * two-argument `.add(` on any receiver: an unwired site fails, and so does an
 * origin with no producer); nothing infers it from text. Items filed before
 * this field existed carry none and are classified at READ time by the ONE
 * legacy rung, `originOf` in src/lib/user-todos-layout.js — no migration.
 */

const INBOX_ORIGINS = Object.freeze(['spend', 'login', 'pool', 'jobs', 'channels', 'browser', 'machines', 'apps', 'agent', 'server']);

// The group / chip words — English t() keys (the panel words them per device;
// i18nKey is the extraction marker scripts/i18n-extract.mjs reads).
const i18nKey = (s) => s;
const ORIGIN_LABELS = Object.freeze({
  spend: i18nKey('Spending'),
  login: i18nKey('Login expiry'),
  pool: i18nKey('Account pool'),
  jobs: i18nKey('Background Work'),
  channels: i18nKey('Channels'),
  browser: i18nKey('Agent browser'), // the agent-browser face's name (2.369.168 faces rename — the bare word is retired)
  machines: i18nKey('Machines'), // lane-pairing ⑥: "Allow <conversation> to run a command on <machine>?" (src/exit-proxy.js)
  apps: i18nKey('Apps'), // Layer 0 apps: "<conversation> wants to install <app>?" — Install / Not now (src/server/apps-engine.js)
  agent: i18nKey('Agents'),
  server: i18nKey('This machine'), // lane browser-resource-care: memory pressure — ONE item per episode naming who started each top process (src/memory-pressure.js)
});

/** A member of the closed set → itself. null/undefined/'' THROWS `origin
 *  required (one of …)` — there is NO default (r2: the store used to stamp
 *  `agent` on a filing that named none, so a producer the census missed filed
 *  under Agents with nothing red anywhere); anything else THROWS `origin must
 *  be one of …` (a typo in a producer must fail its filing loudly, never land
 *  in a group nobody reads). */
function normalizeOrigin(x) {
  if (x == null || x === '') throw new Error(`origin required (one of ${INBOX_ORIGINS.join('/')})`);
  if (typeof x !== 'string' || !INBOX_ORIGINS.includes(x)) throw new Error(`origin must be one of ${INBOX_ORIGINS.join('/')}`);
  return x;
}

module.exports = { INBOX_ORIGINS, ORIGIN_LABELS, normalizeOrigin };
