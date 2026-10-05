'use strict';
/**
 * AN APP KIND IS ONE ROW — PURE, imports nothing (lane dc-apps-rows, 2026-10-04; review rv-desktop-apps F-A1 / F-A2 /
 * F-A3). Every kind the apps of a machine know — an index entry's kind (apt / deb / uv-tool / npm / appimage), a request
 * a person or an agent sends (installer, source, remove, refresh …), a plan the machine half makes (search, forget …) —
 * is ONE row below, declaring what the code used to ask its id. The lists derive (ENTRY_KINDS, HOME_KINDS, PLAN_KINDS,
 * REQUEST_KINDS, AGENT_KINDS, the card word); the manifest, the machine half (src/app-serve.js — its per-kind plan
 * bodies stay there as planners), the engine (src/server/apps-engine.js), THE card (src/app-card.js), the routes and
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
 */
const row = (r) => Object.freeze(r);
const ROWS = Object.freeze([
  row({ id: 'search', plan: true }),
  row({ id: 'apt', entry: 'root', plan: true, request: true, agent: true, sysView: true, card: 'package' }),
  row({ id: 'deb', entry: 'root', plan: true, request: true, agent: true, sysView: true, card: 'deb', from: 'download', staged: 'deb' }),
  row({ id: 'uv-tool', entry: 'home', cliWord: 'uv', addArgv: Object.freeze(['uv', 'tool', 'install']), removeArgv: Object.freeze(['uv', 'tool', 'uninstall']) }),
  row({ id: 'npm', entry: 'home', cliWord: 'npm', addArgv: Object.freeze(['npm', 'install', '-g', '--prefix', '~/.local']), removeArgv: Object.freeze(['npm', 'uninstall', '-g', '--prefix', '~/.local']) }),
  row({ id: 'appimage', entry: 'home', plan: true, request: true, agent: true, cliWord: 'appimage', card: 'appimage', keeps: 'home', from: 'download', staged: 'AppImage', word: 'AppImage' }),
  row({ id: 'installer', request: true, agent: true, fetches: true }),
  row({ id: 'source', plan: true, request: true, agent: true, card: 'source', keeps: 'system', from: 'source' }),
  row({ id: 'source-remove', plan: true, request: true }),
  row({ id: 'remove', plan: true, request: true, agent: true, sysView: true, card: 'remove', from: 'none' }),
  row({ id: 'refresh', plan: true, request: true, sysView: true }),
  row({ id: 'adopt', plan: true, request: true }),
  row({ id: 'replay', plan: true, request: true }),
  row({ id: 'move', plan: true, request: true, sysView: true }), // design 019 M2: the host apps INTO the app system — the USER's click
  row({ id: 'forget', plan: true }),
]);
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
const DEFAULT_CARD = 'package';
const CARD_ROW = ROWS.find((r) => r.card === DEFAULT_CARD);
/** THE card's row for request kind `k`: its own when it declares a card, else the default (the machine's packages). */
const cardRow = (k) => { const r = kindRow(k); return r && r.card ? r : CARD_ROW; };
/** How a card of request kind `k` comes back after a rebuild (the row's `keeps`, default replay). */
const keepsOf = (k) => cardRow(k).keeps || 'replay';
/** Where a card of request kind `k` says it comes from: 'download' | 'source' | 'none' | 'sources'. */
const fromOf = (k) => cardRow(k).from || 'sources';
/** The declared rows as data (GET /api/agent/apps/kinds — the CLI's copy): every column but the functions. */
const kindsView = () => ROWS.map((r) => ({ ...r }));

module.exports = { ROWS, kindRow, ENTRY_KINDS, HOME_KINDS, PLAN_KINDS, REQUEST_KINDS, AGENT_KINDS, SYS_VIEW_KINDS, cardRow, keepsOf, fromOf, kindsView };
