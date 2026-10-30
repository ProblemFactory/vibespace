'use strict';
/**
 * THE VAULT KIND REGISTRY — PURE (imports nothing; CJS so the inventory, the page and the census share ONE table). Lane
 * vault-totp-add, 2026-10-26 (the owner: 「你需要更系统化地方案管理代码中的各种细节，这种不是应该有个统一的注册表之类的吗」, after
 * 「我似乎不能添加两步验证在vault里」 — 两步验证 had a rail category, a row and a route, and no 添加… door: nothing kept the
 * places that list a kind in agreement).
 *
 * ONE ROW PER KIND FAMILY — every kind of value the vault seals:
 *
 *   { id, label, category, stores, entryRe, sample, confirmKey?, surfaces: { list, row, add, reveal, use, delete, cli, route, doc }, deferred }
 *
 *   · `category` = the Vault window's rail purpose (CATEGORIES below, the rail's order); `stores` = the sealed stores whose
 *     rows it holds — null = a row of ANY store BY ITS ENTRY SHAPE ONLY (it needs an `entryRe`, and it holds no store: every
 *     store of the inventory is LISTED by some family — acceptance r2), `entryRe` = the entry shape it owns (for the hub's
 *     own secrets: its SECRET_RE head, src/server/vault-engine.js); `sample` = an entry name of that shape (the census's — no
 *     value, ever); `confirmKey` = the words its 删除 asks with (src/lib/vault-window.js CONFIRM_WORDS is keyed by it; doorsOf
 *     hands it on as the door's `confirm`) — every family whose delete is { method, path } has one, no other family does;
 *   · FAMILIES' ORDER IS THE MATCHING ORDER — a row is the FIRST family whose stores and entryRe hold it (an `agent:` entry
 *     first, whatever its store); a hub secret no family holds lands in 'other';
 *   · `surfaces` — EVERY one of the nine is declared: what exists in the tree (the census checks it is there) or
 *     NONE(why) — not this kind's, in words. `add` = { door, order }: the 添加… menu's door id (registerVaultAdd in
 *     src/lib/vault-window.js — the doors stay the implementation; this table says which must exist, and their order);
 *     `row` = 'base' or { module, exports } (the window's row extras); `reveal` = true | false (the row's 「显示」);
 *     `use` = { route, also? } (an agent's door — `also`: the other agent doors that use it, lane vault-job-road: a job's
 *     `--vault`) or { system } (VibeSpace uses it itself, in words); `delete` = { method, path } (the
 *     row's 删除, src/vault-inventory.js doorsOf) or { open } or { module, route }; `cli` = { bin, verbs } (in that CLI's
 *     usage); `route` = the person's routes ('METHOD /path', mounted); `doc` = the words of its docs/kb-features.md line;
 *   · `deferred` = { <surface>: { lane, backlog, why? } } — a surface still owed: `lane` = the lane's name (a-z, 0-9 and '-',
 *     3 or more) or 'unscheduled' (no lane holds it yet), `backlog` = its backlog id (B-xxxx) — both required; printed by the
 *     census (⏳ lane <name> · B-xxxx, or ⏳ unscheduled · B-xxxx), never silently green (a surface is declared in exactly one
 *     of the two).
 *
 * THE LAW (docs/kb-design-lessons.md §18): a kind family is ONE row here + its census (scripts/test-vault-kinds-census.mjs —
 * every declared surface present in the tree, the table printed on every run); a deferred surface is a census row too.
 * The rail's categories, the 添加… menu's order and the inventory's row → category mapping read THIS table — no second list.
 */

/** An extraction marker (scripts/i18n-extract.mjs): the rail's words, worded by the page with t(). */
const i18nKey = (s) => s;
const NONE = (why) => Object.freeze({ none: why });
const SURFACES = Object.freeze(['list', 'row', 'add', 'reveal', 'use', 'delete', 'cli', 'route', 'doc']);

/** THE RAIL (lane vault-window-v2, design q-047 §3.1 — the owner's decision ④: grouped by what a secret is FOR). `Other`
 *  shows only when something lands in it. */
const CATEGORIES = Object.freeze([
  Object.freeze({ id: 'two-step', label: i18nKey('Two-step codes') }),
  Object.freeze({ id: 'accounts', label: i18nKey('Accounts & sign-in') }),
  Object.freeze({ id: 'integrations', label: i18nKey('Integrations & channels') }),
  Object.freeze({ id: 'machines', label: i18nKey('Machines & relay') }),
  Object.freeze({ id: 'storage', label: i18nKey('Storage') }),
  Object.freeze({ id: 'app-logins', label: i18nKey('App logins') }),
  Object.freeze({ id: 'passkeys', label: i18nKey('Passkeys') }),
  Object.freeze({ id: 'web-logins', label: i18nKey('Web logins') }),
  Object.freeze({ id: 'automation', label: i18nKey('Automation keys') }),
  Object.freeze({ id: 'keys', label: i18nKey('Passwords & keys') }),
  Object.freeze({ id: 'agents', label: i18nKey('Kept by agents'), help: i18nKey('What an agent kept itself: the conversation that kept it uses it without asking you; other conversations cannot use it') }),   // lane vault-agent-own: the rule in words (the only category with a help sentence)
  Object.freeze({ id: 'other', label: i18nKey('Other'), onlyWhenAny: true }),
]);
const CATEGORY_IDS = Object.freeze(CATEGORIES.map((c) => c.id));

const SYSTEM = (why) => Object.freeze({ system: why });
const fam = (row) => Object.freeze({ ...row, surfaces: Object.freeze(row.surfaces),
  deferred: Object.freeze(Object.fromEntries(Object.entries(row.deferred || {}).map(([k, d]) => [k, Object.freeze({ ...d })]))) });

/** THE KIND FAMILIES, in matching order. */
const FAMILIES = Object.freeze([
  fam({ id: 'agent-secret', label: 'An agent\'s own secret (mint / put)', category: 'agents', stores: null, entryRe: /^agent:/, sample: 'agent:conv-census/sample',
    surfaces: { list: true, row: 'base', add: NONE('an agent puts it in (vibespace-vault mint / put) — a person never adds one'), reveal: true,
      use: { route: 'POST /api/agent/vault/run', also: ['POST /api/agent/jobs'] }, cli: { bin: 'vibespace-vault', verbs: ['mint', 'put'] },   // lane vault-job-road: + a Background Work job (--vault, its own conversation's)
      route: ['POST /api/agent/vault/mint', 'POST /api/agent/vault/put'], doc: '**Agents put their OWN secrets in' },
    // found by this registry's census; no lane holds it yet (the coordinator took the backlog item, 2026-10-26)
    deferred: { delete: { lane: 'unscheduled', backlog: 'B-3fb5', why: 'design q-047 §3.3 lists 删除 for an agent\'s entry; no route drops one yet' } } }),
  fam({ id: 'account', label: 'An account\'s API key or long-lived token', category: 'accounts', stores: ['accounts'], entryRe: null, sample: 'acc-census', confirmKey: 'account',
    surfaces: { list: true, row: 'base', add: { door: 'account', order: 10 }, reveal: true, use: SYSTEM('VibeSpace hands it to the CLI it starts — never to an agent'),
      delete: { method: 'DELETE', path: '/api/accounts/' }, cli: NONE('no agent verb — VibeSpace uses it itself'), route: ['POST /api/accounts', 'DELETE /api/accounts/:id'], doc: 'API keys and tokens (accounts)' } }),
  fam({ id: 'integration-machine', label: 'An integration\'s per-machine key', category: 'machines', stores: ['integrations'], entryRe: /\//, sample: 'llm/host-census',
    surfaces: { list: true, row: 'base', add: NONE('written by the Integrations card of that machine'), reveal: true, use: SYSTEM('the integration uses it on that machine'),
      delete: NONE('cleared in Integrations… with the machine\'s row'), cli: NONE('no agent verb — VibeSpace uses it itself'), route: ['GET /api/integrations/:id'], doc: 'per-machine row (`<row>/<host>`)' } }),
  fam({ id: 'integration', label: 'An integration\'s key', category: 'integrations', stores: ['integrations'], entryRe: null, sample: 'llm', confirmKey: 'integration',
    surfaces: { list: true, row: 'base', add: { door: 'integration', order: 20 }, reveal: true, use: SYSTEM('the integration uses it — never handed to an agent'),
      delete: { method: 'DELETE', path: '/api/integrations/' }, cli: NONE('no agent verb — VibeSpace uses it itself'), route: ['GET /api/integrations/:id', 'DELETE /api/integrations/:id'], doc: 'integration keys' } }),
  fam({ id: 'channel', label: 'A channel account\'s sign-in', category: 'integrations', stores: ['channels'], entryRe: null, sample: 'lark-census',
    surfaces: { list: true, row: 'base', add: { door: 'channel', order: 30 }, reveal: true, use: SYSTEM('the channel engine reads and sends with it'),
      delete: { open: 'channel-remove' }, cli: NONE('no agent verb — VibeSpace uses it itself'), route: ['GET /api/channels'], doc: 'channel tokens' } }),
  fam({ id: 'mount', label: 'A storage mount\'s secret', category: 'storage', stores: ['mounts'], entryRe: null, sample: 'mount-census', confirmKey: 'mount',
    surfaces: { list: true, row: 'base', add: NONE('added in the Storage window — a mount\'s own form, with its provider\'s fields'), reveal: true, use: SYSTEM('rclone gets it when it mounts'),
      delete: { method: 'DELETE', path: '/api/mounts/' }, cli: NONE('no agent verb — VibeSpace uses it itself'), route: ['POST /api/mounts', 'DELETE /api/mounts/:id'], doc: 'mount secrets' } }),
  fam({ id: 'app-login', label: 'A desktop app\'s stored login', category: 'app-logins', stores: ['app-secrets'], entryRe: null, sample: 'app-census', confirmKey: 'app-logins',
    surfaces: { list: true, row: 'base', add: NONE('the app\'s own sign-in keeps it — VibeSpace asks nobody to type it here'), reveal: true, use: SYSTEM('VibeSpace fills the app\'s login for it'),
      delete: { method: 'POST', path: '/api/desktop/apps/' }, cli: NONE('no agent verb — VibeSpace uses it itself'), route: ['GET /api/desktop/apps/:id/secrets', 'POST /api/desktop/apps/:id/secrets/forget'], doc: 'a desktop app\'s stored logins' } }),
  fam({ id: 'passkey', label: 'A browser passkey', category: 'passkeys', stores: ['passkeys'], entryRe: null, sample: 'work/census', confirmKey: 'passkey',
    surfaces: { list: true, row: 'base', add: NONE('a site makes it at sign-up (WebAuthn) — nobody types one in'), reveal: true, use: SYSTEM('the browser kernel signs a site\'s sign-in with it'),
      delete: { method: 'DELETE', path: '/api/browser/passkeys/' }, cli: NONE('no agent verb — the browser kernel uses it itself'), route: ['GET /api/browser/passkeys', 'DELETE /api/browser/passkeys/:profile/:id'], doc: 'browser passkeys' } }),
  fam({ id: 'automation-key', label: 'A VibeSpace automation key', category: 'automation', stores: ['automation', 'secrets'], entryRe: /^apikey:/, sample: 'apikey:ak-census',
    surfaces: { list: true, row: { module: 'src/lib/vault-automation.js', exports: ['automationExtras'] }, add: { door: 'automation', order: 40 }, reveal: true,
      use: SYSTEM('an outside system presents it to the automation API — agents inside use their grants'), delete: { module: 'src/lib/vault-automation.js', route: 'POST /api/automation/keys/:id/revoke' },
      cli: NONE('no agent verb — a key is handed to an outside system'), route: ['POST /api/automation/keys', 'POST /api/automation/keys/:id/revoke'], doc: '**Automation keys**' } }),
  fam({ id: 'machine-link', label: 'A machine\'s link token', category: 'machines', stores: ['secrets'], entryRe: /^host:/, sample: 'host:census',
    surfaces: { list: true, row: 'base', add: NONE('pairing the machine makes it'), reveal: false, use: SYSTEM('the hub reaches the machine with it'),
      delete: NONE('unpairing the machine forgets it'), cli: NONE('no agent verb — VibeSpace uses it itself'), route: NONE('listed by the Vault window only — never shown, no door of its own'), doc: 'the hub\'s `host:` / `frp:` entries' } }),
  fam({ id: 'relay-token', label: 'The relay token', category: 'machines', stores: ['secrets'], entryRe: /^frp:/, sample: 'frp:token',
    surfaces: { list: true, row: 'base', add: NONE('the relay\'s own setup writes it'), reveal: true, use: SYSTEM('the relay client signs in with it'),
      delete: NONE('the relay\'s own setup replaces it'), cli: NONE('no agent verb — VibeSpace uses it itself'), route: NONE('listed by the Vault window only — no door of its own'), doc: 'the hub\'s `host:` / `frp:` entries' } }),
  fam({ id: 'web-login', label: 'A website login', category: 'web-logins', stores: ['secrets'], entryRe: /^web-login:/, sample: 'web-login:https://census.example.test#census-user', confirmKey: 'web-login',
    surfaces: { list: true, row: { module: 'src/lib/vault-login-row.js', exports: ['loginExtras'] }, add: { door: 'web-login', order: 45 }, reveal: true,
      use: { route: 'POST /api/agent/browser/login' }, delete: { method: 'DELETE', path: '/api/vault/web-logins/' }, cli: { bin: 'vibespace-browser', verbs: ['login'] },
      route: ['GET /api/vault/web-logins', 'POST /api/vault/web-logins', 'DELETE /api/vault/web-logins/:name'], doc: '`web-login:<origin>#<user>`' } }),
  fam({ id: 'totp', label: 'A two-step code (TOTP)', category: 'two-step', stores: ['secrets'], entryRe: /^totp:/, sample: 'totp:census', confirmKey: 'totp',
    surfaces: { list: true, row: { module: 'src/lib/vault-totp-row.js', exports: ['totpExtras', 'showTotpAddDialog'] }, add: { door: 'totp', order: 35 }, reveal: true,
      use: { route: 'GET /api/agent/vault/totp/:name' }, delete: { method: 'DELETE', path: '/api/vault/totp/' }, cli: { bin: 'vibespace-vault', verbs: ['totp'] },
      route: ['GET /api/vault/totp', 'POST /api/vault/totp', 'GET /api/vault/totp/:name', 'DELETE /api/vault/totp/:name', 'POST /api/vault/totp/:name/grants'], doc: '**Two-step codes (TOTP)**' } }),
  fam({ id: 'free-secret', label: 'A key or password no card holds', category: 'keys', stores: ['secrets'], entryRe: /^secret:/, sample: 'secret:census', confirmKey: 'secret',
    surfaces: { list: true, row: 'base', add: { door: 'secret', order: 50 }, reveal: true, use: { route: 'POST /api/agent/vault/run', also: ['POST /api/agent/jobs'] },   // lane vault-job-road: + a Background Work job (--vault, the owner approves it)
      delete: { method: 'DELETE', path: '/api/vault/secrets/' }, cli: { bin: 'vibespace-vault', verbs: ['run', 'request'] }, route: ['POST /api/vault/secrets', 'DELETE /api/vault/secrets/:id'], doc: '**「其他密钥或密码…」' } }),
  fam({ id: 'sealed-file-key', label: 'A sealed file\'s key', category: 'other', stores: ['secrets'], entryRe: /^file:/, sample: 'file:census',
    surfaces: { list: true, row: 'base', add: NONE('VibeSpace makes it when it seals the file'), reveal: false, use: SYSTEM('VibeSpace opens the file with it'),
      delete: NONE('it goes with its file'), cli: NONE('no agent verb — VibeSpace uses it itself'), route: NONE('listed by the Vault window only — never shown, no door of its own'), doc: 'a sealed file\'s key' } }),
]);
const FAMILY_IDS = Object.freeze(FAMILIES.map((f) => f.id));

/** A row's family: the FIRST whose stores and entry shape hold it, or null. */
function familyOf(store, entry) {
  const e = String(entry == null ? '' : entry);
  return FAMILIES.find((f) => (f.stores === null || f.stores.includes(store)) && (!f.entryRe || f.entryRe.test(e))) || null;
}
/** A row's category (the rail's purpose id): its family's, or 'other' (nothing holds it). */
function categoryOf(store, entry) {
  const f = familyOf(store, entry);
  return f ? f.category : 'other';
}
/** A row's 删除 words: its family's `confirmKey`, or null (src/vault-inventory.js doorsOf hands it on as the door's `confirm`). */
function confirmKeyOf(store, entry) {
  const f = familyOf(store, entry);
  return (f && f.confirmKey) || null;
}
/** 添加…'s doors in the registry's order: [{ door, order, family }]. A door the registry does not name is no door. */
const ADD_DOORS = Object.freeze(FAMILIES.filter((f) => f.surfaces.add && typeof f.surfaces.add.door === 'string')
  .map((f) => Object.freeze({ door: f.surfaces.add.door, order: f.surfaces.add.order, family: f.id }))
  .sort((a, b) => a.order - b.order));
/** A door id → its order in 添加…, or null (not a door the registry names — the window refuses it). */
function addOrderOf(id) {
  const d = ADD_DOORS.find((x) => x.door === id);
  return d ? d.order : null;
}

module.exports = { SURFACES, NONE, CATEGORIES, CATEGORY_IDS, FAMILIES, FAMILY_IDS, familyOf, categoryOf, confirmKeyOf, ADD_DOORS, addOrderOf };
