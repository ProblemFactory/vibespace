'use strict';
/**
 * AN APP KIND IS ITS OWN FILE + ONE LINE BELOW — PURE, imports nothing but its siblings (lane dc-app-kinds, 2026-10-05,
 * decoupling wave 3; before it lane dc-apps-rows' one table, review rv-desktop-apps F-A1 / F-A2 / F-A3). Every kind the apps of a machine know — an index entry's kind (apt / deb / uv-tool / npm / appimage), a request
 * a person or an agent sends (installer, source, remove, refresh …), a plan the machine half makes (search, forget …) —
 * is ONE row (src/app-kinds/<kind>.js; the requests that are no app kind: ops.js), declaring what the code used to ask its id. The lists derive (ENTRY_KINDS, HOME_KINDS, PLAN_KINDS,
 * REQUEST_KINDS, AGENT_KINDS, the card word); the manifest, the machine half (src/app-serve.js — a kind's plan body
 * is its row's `planner`), the engine (src/server/apps-engine.js), THE card (src/app-card.js), the routes and
 * the CLI (data/bin/vibespace-app reads the declared rows from GET /api/agent/apps/kinds) ask the row. The app system's
 * own requests (sys-*) are src/app-system.js's SYS_KINDS (its rows), appended by the lists that take them.
 * A row (absent column = no / the default):
 *   id
 *   entry      'root' (installed by root through the package slot; 1–64 Debian packages; may go INTO the app system)
 *              | 'home' (lives in the user's home — no root, nothing to replay)            → ENTRY_KINDS / HOME_KINDS
 *   plan       the machine half plans it (POST app-plan)                                    → PLAN_KINDS
 *   request    a request may name it (normRequest)                                          → REQUEST_KINDS
 *   agent      an agent may PROPOSE it                                                      → AGENT_KINDS
 *   sysView    its plan reads the app system's view first (it may land in Layer 1)
 *   card       THE card's kind word (design 009 §4); `keeps` = how it comes back after a rebuild (replay | home |
 *              system, default replay); `from` = where the card says it comes from: 'download' (a fetched installer)
 *              | 'source' (the source's own address) | 'none' | default the machine's sources
 *   staged     the extension of the installer file VibeSpace staged for it (the machine's own word after its fetch)
 *   fetches    a request of it is an installer by ADDRESS or FILE (downloaded first — the agent's answer is slow)
 *   word       how a person reads the kind (default: its id)
 *   cliWord    the word `vibespace-app add --kind` takes for it (a home kind the agent installs itself, then records)
 *   addArgv / removeArgv   the argv prefix (+ the tool's name) that installs / removes a recorded home tool as the user
 *              (`~/.local` = the user's ~/.local)
 * The kind's OWN behaviour (lane dc-app-kinds — the core asks these cells, never an id):
 *   planner(c)   THE plan from apt's / the file's words (src/app-serve.js plan() hands `c`); `plansWith` = another row's
 *                planner + request words (adopt plans like apt)
 *   requestOf(x, {kind, PKG_RE})   a request of it, normalized or refused by name (the engine's normRequest)
 *   record(e, helpers)   the record reader: the extra fields root / the home wrote for an entry of it ({error} = refused)
 *   mode / commands(o)   the root script's mode for its install + the steps a person reads for it (appCommands)
 *   rootDefault  the root kind a root install of a non-kind request is recorded as · recordSource  the entry's fixed source
 *   sameEntry(e, packages, key)   the index entry an install of it reuses · fileBound  the FILE names the package (sha256-bound)
 *   unpacked     unpacked into the home at the click (no slot, no root) · closurePlan  the dialog lists an apt closure
 *   doing / doneNote / proposeLines(pl)   the engine's words · dialogTitle(t, machine) / dialogRows(plan, line, t) /
 *                entryNote(t)   the dialog's words (t = the client's i18n)
 */
const OPS = require('./ops.js'); // the requests that are not an app kind
const LIST = [
  OPS.search,
  require('./apt.js'),
  require('./deb.js'),
  require('./uv-tool.js'),
  require('./npm.js'),
  require('./appimage.js'),
  require('./installer.js'),
  ...OPS.requests,
];
const ROWS = Object.freeze(LIST.map((r) => {
  const like = r.plansWith && LIST.find((x) => x.id === r.plansWith);
  return like ? Object.freeze({ ...r, planner: like.planner, requestOf: like.requestOf }) : r;
}));
const BY_ID = new Map(ROWS.map((r) => [r.id, r]));
const ids = (pred) => Object.freeze(ROWS.filter(pred).map((r) => r.id));
/** The row of kind `id`, or null. */
const kindRow = (id) => BY_ID.get(String(id)) || null;
const ENTRY_KINDS = ids((r) => !!r.entry);
const HOME_KINDS = ids((r) => r.entry === 'home');
/** Without the app system's own kinds (src/app-system.js SYS_KINDS — the consumers append them). */
const PLAN_KINDS = ids((r) => r.plan);
const REQUEST_KINDS = ids((r) => r.request);
const AGENT_KINDS = ids((r) => r.agent);
const SYS_VIEW_KINDS = ids((r) => r.sysView);
/** The row a ROOT install of request kind `k` is recorded as: its own when it is a root kind, else the default (apt). */
const ROOT_ROW = ROWS.find((r) => r.rootDefault);
const rootRowOf = (k) => { const r = kindRow(k); return r && r.entry === 'root' ? r : ROOT_ROW; };
const DEFAULT_CARD = 'package';
const CARD_ROW = ROWS.find((r) => r.card === DEFAULT_CARD);
/** THE card's row for request kind `k`: its own when it declares a card, else the default (the machine's packages). */
const cardRow = (k) => { const r = kindRow(k); return r && r.card ? r : CARD_ROW; };
/** How a card of request kind `k` comes back after a rebuild (the row's `keeps`, default replay). */
const keepsOf = (k) => cardRow(k).keeps || 'replay';
/** Where a card of request kind `k` says it comes from: 'download' | 'source' | 'none' | 'sources'. */
const fromOf = (k) => cardRow(k).from || 'sources';
/** The declared rows as data (GET /api/agent/apps/kinds — the CLI's copy): every column but the functions. */
const kindsView = () => ROWS.map((r) => Object.fromEntries(Object.entries(r).filter(([, v]) => typeof v !== 'function')));

module.exports = { ROWS, kindRow, rootRowOf, ENTRY_KINDS, HOME_KINDS, PLAN_KINDS, REQUEST_KINDS, AGENT_KINDS, SYS_VIEW_KINDS, cardRow, keepsOf, fromOf, kindsView };
