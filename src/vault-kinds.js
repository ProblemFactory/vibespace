'use strict';
/**
 * THE VAULT KIND REGISTRY — PURE (imports nothing; CJS so the inventory, the page and the census share ONE table). Lane
 * vault-totp-add, 2026-10-26 (the owner: 「你需要更系统化地方案管理代码中的各种细节，这种不是应该有个统一的注册表之类的吗」, after
 * 「我似乎不能添加两步验证在vault里」 — 两步验证 had a rail category, a row and a route, and no 添加… door: nothing kept the
 * places that list a kind in agreement).
 *
 * ONE ROW PER KIND FAMILY — every kind of value the vault seals:
 *
 *   { id, label, category, stores, entryRe, sample, confirmKey?, surfaces: { list, row, add, reveal, use, delete, cli, route, doc, words }, deferred }
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
 *     `request` (lane login-request-card, B-a681) = an AGENT ASKS THE OWNER for a value of this kind on ONE card
 *     (`vibespace-vault request "<what>" --purpose "<why>" …` — src/vault-paste.js / src/server/vault-paste-door.js): { route (the
 *     ask), answer (the owner's door), lands ('entry' a free entry · 'field' an Integrations field · 'login' a website login),
 *     kinds? (the `--kind` words that land it), into? (a sample `<row>.<field>`), site? (a sample site) } — or NONE(why);
 *     `words` (lane vault-entry-description) = the entry's OWN name and description — { create: [<CLI verbs that write them
 *     at creation>], propose: '<the agent's route>', owner: '<the owner's route>' } (the words rule src/vault-paste.js wordsOf,
 *     the ONE writer vault-engine editEntryWords, `vibespace-vault list` prints them) — or NONE(why): its card, its site or
 *     VibeSpace names it;
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
const SURFACES = Object.freeze(['list', 'row', 'add', 'reveal', 'use', 'delete', 'cli', 'route', 'doc', 'words', 'request']);   // request: lane login-request-card

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
  Object.freeze({ id: 'agents', label: i18nKey('Kept by agents'), help: i18nKey('What an agent kept itself: the conversation that kept it uses it without asking you; another conversation only as you share it') }),   // lane vault-agent-own: the rule in words (the only category with a help sentence)
  Object.freeze({ id: 'other', label: i18nKey('Other'), onlyWhenAny: true }),
]);
const CATEGORY_IDS = Object.freeze(CATEGORIES.map((c) => c.id));

const SYSTEM = (why) => Object.freeze({ system: why });
/** lane vault-entry-description: THE WORDS surface of the two kinds an agent creates or asks for — the doors that write them. */
const WORDS = (create) => Object.freeze({ create: Object.freeze(create), propose: 'POST /api/agent/vault/words', owner: 'POST /api/vault/entry-words' });
/** lane login-request-card: THE REQUEST surface of a kind an agent may ask the owner for — the ONE road's two doors + what it lands. */
const REQUEST = (o) => Object.freeze({ route: 'POST /api/agent/vault/secret-request', answer: 'POST /api/vault/secret-requests/:id/answer', ...o, ...(o.kinds ? { kinds: Object.freeze([...o.kinds]) } : {}) });
const fam = (row) => Object.freeze({ ...row, surfaces: Object.freeze(row.surfaces),
  deferred: Object.freeze(Object.fromEntries(Object.entries(row.deferred || {}).map(([k, d]) => [k, Object.freeze({ ...d })]))) });

/** THE KIND FAMILIES, in matching order. */
const FAMILIES = Object.freeze([
  fam({ id: 'agent-secret', label: 'An agent\'s own secret (mint / put)', category: 'agents', stores: null, entryRe: /^agent:/, sample: 'agent:conv-census/sample', confirmKey: 'agent-secret',
    surfaces: { request: NONE('an agent puts its own (vibespace-vault mint / put) — it never asks the user for one'), list: true, row: 'base', add: NONE('an agent puts it in (vibespace-vault mint / put) — a person never adds one'), reveal: true,
      use: { route: 'POST /api/agent/vault/run', also: ['POST /api/agent/jobs'] }, cli: { bin: 'vibespace-vault', verbs: ['mint', 'put'] },   // lane vault-job-road: + a Background Work job (--vault, its own conversation's)
    // lane lg-vault-file (B-0830): an agent's FILE (put --file) is a member of THIS family — its reveal is the owner's download, a
    // run uses it as a file only, its 删除 (B-3fb5's door) shreds the sealed file with the entry; a job's --vault of it is refused
    // (entry_unreadable — the job road takes no file yet)
      delete: { method: 'DELETE', path: '/api/vault/agent-secrets/' },   // B-3fb5 (found by this registry's census, deferred 2026-10-26): the person's 删除 — design q-047 §3.3
      route: ['POST /api/agent/vault/mint', 'POST /api/agent/vault/put', 'DELETE /api/vault/agent-secrets/:entry'], words: WORDS(['mint', 'put']), doc: '**Agents put their OWN secrets in' } }),
  fam({ id: 'account', label: 'An account\'s API key or long-lived token', category: 'accounts', stores: ['accounts'], entryRe: null, sample: 'acc-census', confirmKey: 'account',
    surfaces: { request: NONE('an account signs in on its own card (Accounts) — an agent asks for no account key'), list: true, row: 'base', add: { door: 'account', order: 10 }, reveal: true, use: SYSTEM('VibeSpace hands it to the CLI it starts — never to an agent'),
      delete: { method: 'DELETE', path: '/api/accounts/' }, cli: NONE('no agent verb — VibeSpace uses it itself'), route: ['POST /api/accounts', 'DELETE /api/accounts/:id'], words: NONE('its account card names it (the account\'s own name) — no words of the vault\'s'), doc: 'API keys and tokens (accounts)' } }),
  // lane lg-providers (B-d578, q-045 §2.6 law 1): a THIRD-PARTY MODEL PROVIDER's key — a hub secret `provider:<record id>`,
  // pasted in the provider wizard (Manage agents), used only by the spawn road and the provider Test
  fam({ id: 'provider-key', label: 'A third-party model provider\'s key', category: 'accounts', stores: ['secrets'], entryRe: /^provider:/, sample: 'provider:pv-census', confirmKey: 'provider',   // ui-words: the registry's own name of the family, printed by its census, never drawn on a page
    surfaces: { request: NONE('a provider\'s key is pasted in its own wizard in Manage agents — an agent asks for none'), list: true, row: 'base', add: NONE('added in Manage agents — the third-party model wizard, with the provider it belongs to'), reveal: true,
      use: SYSTEM('VibeSpace hands it to the agent CLI it starts for that provider — never to an agent'), delete: { method: 'DELETE', path: '/api/providers/' },
      cli: NONE('no agent verb — VibeSpace uses it itself'), route: ['POST /api/providers', 'DELETE /api/providers/:id'], words: NONE('its provider names it (the provider\'s own name in Manage agents)'), doc: '**Third-party model providers**' } }),
  fam({ id: 'integration-machine', label: 'An integration\'s per-machine key', category: 'machines', stores: ['integrations'], entryRe: /\//, sample: 'llm/host-census',
    surfaces: { request: NONE('kept per paired machine on that machine\'s card — a request names a card\'s own field, and row_per_machine refuses this one'), list: true, row: 'base', add: NONE('written by the Integrations card of that machine'), reveal: true, use: SYSTEM('the integration uses it on that machine'),
      delete: NONE('cleared in Integrations… with the machine\'s row'), cli: NONE('no agent verb — VibeSpace uses it itself'), route: ['GET /api/integrations/:id'], words: NONE('the Integrations registry names the row and the machine'), doc: 'per-machine row (`<row>/<host>`)' } }),
  fam({ id: 'integration', label: 'An integration\'s key', category: 'integrations', stores: ['integrations'], entryRe: null, sample: 'llm', confirmKey: 'integration',
    surfaces: { request: REQUEST({ lands: 'field', into: 'llm.apiKey' }), list: true, row: 'base', add: { door: 'integration', order: 20 }, reveal: true, use: SYSTEM('the integration uses it — never handed to an agent'),
      delete: { method: 'DELETE', path: '/api/integrations/' }, cli: NONE('no agent verb — VibeSpace uses it itself'), route: ['GET /api/integrations/:id', 'DELETE /api/integrations/:id'], words: NONE('the Integrations registry names the row and its field'), doc: 'integration keys' } }),
  fam({ id: 'channel', label: 'A channel account\'s sign-in', category: 'integrations', stores: ['channels'], entryRe: null, sample: 'lark-census',
    surfaces: { request: NONE('a channel account signs in on its own card in Channels'), list: true, row: 'base', add: { door: 'channel', order: 30 }, reveal: true, use: SYSTEM('the channel engine reads and sends with it'),
      delete: { open: 'channel-remove' }, cli: NONE('no agent verb — VibeSpace uses it itself'), route: ['GET /api/channels'], words: NONE('the channel account names it (its own name in Channels)'), doc: 'channel tokens' } }),
  fam({ id: 'mount', label: 'A storage mount\'s secret', category: 'storage', stores: ['mounts'], entryRe: null, sample: 'mount-census', confirmKey: 'mount',
    surfaces: { request: NONE('a storage mount\'s secret is typed in the Storage window, with its provider\'s fields'), list: true, row: 'base', add: NONE('added in the Storage window — a mount\'s own form, with its provider\'s fields'), reveal: true, use: SYSTEM('rclone gets it when it mounts'),
      delete: { method: 'DELETE', path: '/api/mounts/' }, cli: NONE('no agent verb — VibeSpace uses it itself'), route: ['POST /api/mounts', 'DELETE /api/mounts/:id'], words: NONE('the Storage window names the mount'), doc: 'mount secrets' } }),
  fam({ id: 'app-login', label: 'A desktop app\'s stored login', category: 'app-logins', stores: ['app-secrets'], entryRe: null, sample: 'app-census', confirmKey: 'app-logins',
    surfaces: { request: NONE('the desktop app\'s own sign-in keeps it'), list: true, row: 'base', add: NONE('the app\'s own sign-in keeps it — VibeSpace asks nobody to type it here'), reveal: true, use: SYSTEM('VibeSpace fills the app\'s login for it'),
      delete: { method: 'POST', path: '/api/desktop/apps/' }, cli: NONE('no agent verb — VibeSpace uses it itself'), route: ['GET /api/desktop/apps/:id/secrets', 'POST /api/desktop/apps/:id/secrets/forget'], words: NONE('the desktop app names its own login'), doc: 'a desktop app\'s stored logins' } }),
  fam({ id: 'passkey', label: 'A browser passkey', category: 'passkeys', stores: ['passkeys'], entryRe: null, sample: 'work/census', confirmKey: 'passkey',
    surfaces: { request: NONE('a site makes it at sign-up (WebAuthn) — nobody types one in'), list: true, row: 'base', add: NONE('a site makes it at sign-up (WebAuthn) — nobody types one in'), reveal: true, use: SYSTEM('the browser kernel signs a site\'s sign-in with it'),
      delete: { method: 'DELETE', path: '/api/browser/passkeys/' }, cli: NONE('no agent verb — the browser kernel uses it itself'), route: ['GET /api/browser/passkeys', 'DELETE /api/browser/passkeys/:profile/:id'], words: NONE('the site and its user name it — a site made it'), doc: 'browser passkeys' } }),
  fam({ id: 'automation-key', label: 'A VibeSpace automation key', category: 'automation', stores: ['automation', 'secrets'], entryRe: /^apikey:/, sample: 'apikey:ak-census',
    surfaces: { request: NONE('VibeSpace mints it for an outside system — nobody pastes one'), list: true, row: { module: 'src/lib/vault-automation.js', exports: ['automationExtras'] }, add: { door: 'automation', order: 40 }, reveal: true,
      use: SYSTEM('an outside system presents it to the automation API — agents inside use their grants'), delete: { module: 'src/lib/vault-automation.js', route: 'POST /api/automation/keys/:id/revoke' },
      cli: NONE('no agent verb — a key is handed to an outside system'), route: ['POST /api/automation/keys', 'POST /api/automation/keys/:id/revoke'], words: NONE('an automation key has its own name and grants in its row (vault-automation.js)'), doc: '**Automation keys**' } }),
  fam({ id: 'machine-link', label: 'A machine\'s link token', category: 'machines', stores: ['secrets'], entryRe: /^host:/, sample: 'host:census',
    surfaces: { request: NONE('pairing the machine makes it'), list: true, row: 'base', add: NONE('pairing the machine makes it'), reveal: false, use: SYSTEM('the hub reaches the machine with it'),
      delete: NONE('unpairing the machine forgets it'), cli: NONE('no agent verb — VibeSpace uses it itself'), route: NONE('listed by the Vault window only — never shown, no door of its own'), words: NONE('the paired machine names it'), doc: 'the hub\'s `host:` / `frp:` entries' } }),
  fam({ id: 'relay-token', label: 'The relay token', category: 'machines', stores: ['secrets'], entryRe: /^frp:/, sample: 'frp:token',
    surfaces: { request: NONE('the relay\'s own setup writes it'), list: true, row: 'base', add: NONE('the relay\'s own setup writes it'), reveal: true, use: SYSTEM('the relay client signs in with it'),
      delete: NONE('the relay\'s own setup replaces it'), cli: NONE('no agent verb — VibeSpace uses it itself'), route: NONE('listed by the Vault window only — no door of its own'), words: NONE('VibeSpace\'s relay — one token, named by what it is'), doc: 'the hub\'s `host:` / `frp:` entries' } }),
  fam({ id: 'web-login', label: 'A website login', category: 'web-logins', stores: ['secrets'], entryRe: /^web-login:/, sample: 'web-login:https://census.example.test#census-user', confirmKey: 'web-login',
    surfaces: { request: REQUEST({ lands: 'login', kinds: ['login'], site: 'https://census.example.test' }), list: true, row: { module: 'src/lib/vault-login-row.js', exports: ['loginExtras'] }, add: { door: 'web-login', order: 45 }, reveal: true,
      use: { route: 'POST /api/agent/browser/fill-vault' }, delete: { method: 'DELETE', path: '/api/vault/web-logins/' }, cli: { bin: 'vibespace-browser', verbs: ['fill'] },
      route: ['GET /api/vault/web-logins', 'POST /api/vault/web-logins', 'DELETE /api/vault/web-logins/:name', 'POST /api/vault/web-logins/confirm', 'POST /api/vault/web-logins/discard'], words: NONE('the site and the user name it (web-login:<origin>#<user>)'), doc: '`web-login:<origin>#<user>`' } }),
  // B-8b87 (lane cli-update-needs-nothing): A BROWSER PROXY'S LOGIN — its password sealed under
  // `proxy-login:<scheme>://<host>:<port>#<user>`; ONE reader, the browser keeper's forwarder (src/server/browser-proxy-logins.js),
  // each reading a use noted (door browser-proxy) — no agent door: the browser never sees it
  fam({ id: 'proxy-login', label: 'A browser proxy\'s login', category: 'web-logins', stores: ['secrets'], entryRe: /^proxy-login:/, sample: 'proxy-login:socks5://census.example.test:1080#census-user', confirmKey: 'proxy-login',   // ui-words: the kind's name in the census's own table (scripts/test-vault-kinds-census prints it) — no window draws a family's label
    surfaces: { request: NONE('saved where its proxy is set — the browser profile\'s «Proxy login», or «Move the password to the vault» on its card'), list: true, row: 'base',
      add: NONE('added from the browser profile whose proxy it serves (its «Proxy login» field) — the Vault window lists and deletes it'), reveal: true,
      use: SYSTEM('the browser keeper\'s forwarder hands it to the profile\'s proxy — the browser never sees it'), delete: { method: 'DELETE', path: '/api/vault/proxy-logins/' },
      cli: NONE('no agent verb — the browser keeper uses it itself'), route: ['GET /api/vault/proxy-logins', 'POST /api/vault/proxy-logins', 'DELETE /api/vault/proxy-logins/:name', 'POST /api/vault/proxy-logins/move'],
      words: NONE('the proxy and the user name it (proxy-login:<scheme>://<host>:<port>#<user>)'), doc: '`proxy-login:<scheme>://<host>:<port>#<user>`' } }),
  fam({ id: 'totp', label: 'A two-step code (TOTP)', category: 'two-step', stores: ['secrets'], entryRe: /^totp:/, sample: 'totp:census', confirmKey: 'totp',
    surfaces: { request: REQUEST({ lands: 'totp', kinds: ['totp'] }), list: true, row: { module: 'src/lib/vault-totp-row.js', exports: ['totpExtras', 'showTotpAddDialog'] }, /* request: lane totp-request-card (fb-251bb41646 — the card IS the 两步验证… dialog's fields: vault-totp-row.js totpFields) */ add: { door: 'totp', order: 35 }, reveal: true,
      use: { route: 'GET /api/agent/vault/totp/:name' }, delete: { method: 'DELETE', path: '/api/vault/totp/' }, cli: { bin: 'vibespace-vault', verbs: ['totp'] },
      route: ['GET /api/vault/totp', 'POST /api/vault/totp', 'GET /api/vault/totp/:name', 'DELETE /api/vault/totp/:name', 'POST /api/vault/totp/:name/grants'], words: NONE('named for its site when it is added (totp:<name>) — the two-step code is what it is for'), doc: '**Two-step codes (TOTP)**' } }),
  fam({ id: 'free-secret', label: 'A key or password no card holds', category: 'keys', stores: ['secrets'], entryRe: /^secret:/, sample: 'secret:census', confirmKey: 'secret',
    surfaces: { request: REQUEST({ lands: 'entry', kinds: ['api-key', 'password', 'secret'] }), list: true, row: 'base', add: { door: 'secret', order: 50 }, reveal: true, use: { route: 'POST /api/agent/vault/run', also: ['POST /api/agent/jobs'] },   // lane vault-job-road: + a Background Work job (--vault, the owner approves it)
      delete: { method: 'DELETE', path: '/api/vault/secrets/' }, cli: { bin: 'vibespace-vault', verbs: ['run', 'request'] }, route: ['POST /api/vault/secrets', 'DELETE /api/vault/secrets/:id'], words: WORDS(['request']), doc: '**「其他密钥或密码…」' } }),
  // lane lg-vault-file (B-0830, design q-058 — the owner 2026-11-02: 「general 文件种类，这样什么 ssh key，某些应用的授权文件啥的都能存进去了」):
  // a FILE the owner put in — its bytes sealed beside the record (data/vault-files/), used by a run as a 0600 file, never read
  // back by an agent. `reveal` = the owner's DOWNLOAD behind 验证是你 (a file is never shown on a page — vault-file-row.js). The
  // agent's ask for one is unit U2 — a deferral with this lane's name until it lands.
  // ui-words: the kind's name in the census's own table (scripts/test-vault-kinds-census prints it) — no window draws a family's label
  fam({ id: 'owner-file', label: 'A file the owner put in (an SSH key, a certificate, a licence file)', category: 'keys', stores: ['secrets'], entryRe: /^keyfile:/, sample: 'keyfile:0123456789', confirmKey: 'keyfile',
    surfaces: { list: true, row: { module: 'src/lib/vault-file-row.js', exports: ['fileExtras', 'showFileAddDialog'] }, add: { door: 'keyfile', order: 55 }, reveal: true,
      use: { route: 'POST /api/agent/vault/run' }, delete: { method: 'DELETE', path: '/api/vault/files/' }, cli: { bin: 'vibespace-vault', verbs: ['run'] },
      route: ['POST /api/vault/files', 'POST /api/vault/files/:id/replace', 'DELETE /api/vault/files/:id', 'POST /api/vault/reveal'], words: WORDS(['request']), doc: '**Files in the vault' },
    // r5043 (f): the KEPT-FILE door (unit U1c: a sealed file the vault's record does NOT name) is no surface of this kind — a kept file
    // is no entry (no row, no id the window lists); its one line and its «Remove them…» stand at the top of the Vault window's list
    // (U1c: POST /api/vault/files/kept/remove, inside the page's 验证是你 window — not a route of this kind)
    deferred: { request: { lane: 'lg-vault-file', backlog: 'B-0830', why: 'unit U2: an agent asks the owner for a file (request --file)' } } }),
  fam({ id: 'sealed-file-key', label: 'A sealed file\'s key', category: 'other', stores: ['secrets'], entryRe: /^file:/, sample: 'file:census',
    surfaces: { request: NONE('VibeSpace makes it when it seals the file'), list: true, row: 'base', add: NONE('VibeSpace makes it when it seals the file'), reveal: false, use: SYSTEM('VibeSpace opens the file with it'),
      delete: NONE('it goes with its file'), cli: NONE('no agent verb — VibeSpace uses it itself'), route: NONE('listed by the Vault window only — never shown, no door of its own'), words: NONE('VibeSpace names it after its file'), doc: 'a sealed file\'s key' } }),
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
