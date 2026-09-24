# Channels keep their own store and adopt the mounts patterns — a rethink of integration credentials (design-integrations-per-account r4, 2026-09-23)

> **The owner's critique (r1, zh)**: "这个操作逻辑非常拧巴，为啥我需要特地跑到一个专门的界面里配置一个global的oauth，而我明明可以给每个account都配置不同的oauth？" ("Why a dedicated screen for a *global* OAuth client, when every account could have its own?")
> **r2 directive**: "参考一下remote，尽量让各种feature的UX和逻辑保持一致" ("Look at Remote; keep the features' UX and logic consistent.")
> **r3 directive**: "你得完整看看remote的UX，有些feature你可能没有意识到" ("Look at ALL of Remote's UX.")
> **r4 directive (verbatim)**: "没必要把mounts和频道合并，我的意思是参考mounts那边的设计，比如凭据管理，复制，子mount（这个也许和频道无关）等等，而不是让你直接俩作为一个" ("No need to merge mounts and channels — I meant refer to the mounts design: credential management, duplicate, submounts (maybe irrelevant to channels) and so on, not fold the two into one.")
>
> **Status: SHIPPED (2.369.165, four chunks: 1 the shared dialog component (D1) · 2 the channel server · 3 the account card and dialogs · 4a D2 on the storage side (its own commit) + 4b the census `scripts/test-oauth-field-parity.mjs` and the docs); D1–D8 all at their recommended defaults.** What follows is the design as written (r4); the shipped detail lives in `docs/kb-features.md` (Communication panel / Mounts) and `docs/kb-file-structure.md`. The status line at design time: **design + mockups (r4), zero product code.** r4 = **r2's structure** (channels keep `data/channels/` and their own panel section; the account dialog is the mount dialog's grammar: one "OAuth client" select + custom inline fields, the choice stored per account; the keys library withdrawn; the Integrations window keeps only the browser rows) **+ the mounts-side patterns adopted one by one** (§8: each adopted / adapted / not applicable + why). r3's "channel accounts are children of mounts.json credentials" is **withdrawn** — the reference is the design, not a shared object. §1's Remote inventory stays as the source of the patterns. Chinese original: `docs/design-integrations-per-account.zh.md` (authoritative where they differ).

## §0 In one paragraph

Remote's storage side has a mature **credential-management grammar**: a connection IS a login (status dot, health line, "the sign-in has expired or been revoked — re-authorize to fix", a `Re-authorize {provider}…` button on the row); the add dialog is **type-first** and later fields appear per type (`when:`); the OAuth client is a select (`Preset: …` / `Custom` inline); the Edit dialog prefills every parameter (secrets included) and hosts `Re-authorize` and `Remove`; a credential with children cannot be removed; there once was a `Duplicate` (⧉) deriving a new record from an existing connection. r4 moves those **patterns** onto channel accounts one at a time while the channel objects and store stay untouched: the account record lives in `adapters.json`, the panel section stays the section, the engine's pass / index / outbox / reach run as they do. Genuinely new: **Duplicate** (a sibling account with the same kind / client / filters, its own consent, the token never copied), **Remove refused by name** (while assignments / reach grants / pending outbox proposals reference the account), and **one shared dialog component** (`_mountsDialog` or its exact field grammar) so the two features' dialogs are one.

## §1 The complete Remote inventory (the source of the patterns; r3 Step 1, kept)

Columns: surface · what · object · verbs · states · where.

| Surface | What | Object | Verbs | States | Where |
|---|---|---|---|---|---|
| `_renderMounts` | The whole tab: Machines → `Add machine` / `Pair a device` → Storage (**one flat list of connections**, credential rows with children right after) → `Shares I created` → four footer actions → `Bridge tokens` → note | all | — | first paint "Loading…"; then swaps in place | the Remote tab (phone: same renderer) |
| `_buildLocalMachineRow` / `_buildHostRow` / `_buildMachineMountRow` / `_autoTestHosts` | The local row; one row per machine (test / set up / upgrade to dial-out / re-pair / push mount / pull mount / ports / exit node / new session / remove), a failed probe = an inline `.mounts-errline`; machine-mount child rows (3-state dot, badges, ↻ / open / unmount); 2-min auto-probe swapping one row | host / device / machine-mount | see left | dot / badges / chips / error line | rows + icon actions |
| `_showAddHostDialog` (+ `_askPrivateKey`) / `_showDevicePairDialog` / `_showGraduateDialog` / `_showBootstrapDialog` / `_showPortsDialog` / `_showHostMountDialog` / `_showMachinePullDialog` | The machines-side dialogs: add (key errors retried in place) / pair command / dial-out upgrade / step progress + log / port forward + publish / push mount / pull mount | host / device / machine-mount | — | — | `_mountsDialog` or dedicated |
| **`_buildMountRow`** | One storage connection per row: status dot (or **credential-only = key icon**, no Connect), ↳ arrow, name, `RO` / `EXPIRED`, `Connecting…` chip; actions: Browse / Disconnect (Gmail: Stop syncing) / Connect / Share / ＋ submount / ✎; detail line `[TYPE] path`; the Gmail sync line; **the whole row clicks**; **the error line + (auth death) the `Re-authorize {provider}…` primary button**; **`Duplicate` (⧉) and `Remove` used to be row icons — duplicate superseded by submounts, Remove moved into the Edit dialog (owner: fewer per-row icons)** | mount / credential / child | see left | mounted / err / off / connecting / expired / credential-only / syncing | row |
| `_accessErrorMsg` (server) | The OAuth-cloud auth-death sentence: *"connected but the sign-in has expired or been revoked — listings come from cache while every file read fails; re-authorize to fix"* | mount | — | — | health probe → row |
| **`_showDriveReauthDialog`** | `Re-authorize "{name}"`: who reported the death, `Sign in with {provider}`, status, **the cross-browser link row `oauthLinkRow`**, the paste box; the token is written back (a child's to its parent) and everything reconnects | credential | Sign in / paste back | preparing / opened / popup blocked / completing / failed | dialog |
| **`_showAddChildDialog`** | `New submount under "{name}"`: name + path fields by the parent's type + mount point + access; `Create & connect` | child | Create & connect | — | `_mountsDialog` |
| **`_showAddMountDialog`** | `Connect storage`: **the source-type select decides the fields** (`when:`); Drive / Gmail: the **`OAuth client`** select (`Preset: …` / built-in / `Custom`) + custom id/secret inline + the inline consent block; common: extra params / mode / mount point (advanced); `Connect` | mount / credential | Connect | inline error; on failure the dialog closes + toast | `_mountsDialog` |
| `_wireDriveConnect` / `_wireGmailConnect` / **`_wireOAuthConnect`** | The in-dialog consent block: primary → status → `oauthLinkRow` → paste-back; the token lands in the field; the button becomes `Reconnect` | — | Connect / Reconnect | see left | in the dialog |
| `_wireGmailLabelsPicker` / `_wireSharedDrivePicker` | Cloud-side pickers by record id or the dialog's token | — | — | — | add / edit dialogs |
| **`_showEditMountDialog` + `_mountEditFields`** | `Edit "{name}"`: **every parameter prefilled, secrets included** (2.108.8); the `OAuth client` select; the token textarea; only changes sent (PATCH); **`Re-authorize {provider}…` and `Remove…` inside the dialog** | mount / credential / child | Save / Re-authorize / Remove | inline error | its own form |
| `_showMintShareDialog` / `_showCephShareDialog` / `_showBridgeShareDialog` / `_showImportShareDialog` / `_showRcloneConfDialog` | Share (S3 / Ceph) / bridge tokens / import a link / import rclone.conf | share / token / mount | Create link / Import | — | dialogs |
| Footer ×4 / `Shares I created` / `Bridge tokens` / the rclone card / orphan mounts | actions and lists | — | Revoke / Install / Unmount | — | sections |
| **Server `mounts.js`** | `kind:'credential'`, `parentId` children, `_connOf`, `addChild` (no nesting), **`remove` refused with children**, `update` (unchanged secrets not re-encrypted), `config()` decrypted, `list()`, `startDriveAuthForMount` (the record's own client), `applyDriveToken` (written to the holder, children bounced), export / import (children re-linked by parent name), `drivePresets()`, `_driveClient` / `gmail-sync._client` (custom > preset > only) | — | — | — | — |
| **Health** | 60 s sweep (credentials skipped; a dead Gmail worker restarted; a dead daemon reconnected at once; a hung mountpoint → disconnect + breaker + backoff 1/2/5/10 min); **OAuth clouds probed every 10 min**; **auth-class errors never auto-retried** | mount | — | error line | background |
| `machine-mounts.js` / `hosts.js` / `webdav.js` | Machine mounts (90 s sweep) / the machine registry / the WebDAV bridge + scoped tokens | — | — | — | — |

## §2 The model (r4 = r2's structure)

### §2.1 Three nouns (unchanged)

```
provider = a registry row (lark / gmail; the six browser rows bind to no object)   —— PURE: fields, setup, test
preset   = an instance preset: one client in the env, {key, label}, read-only, rotated by the env —— one reader per env name
account  = one channel adapter record (data/channels/adapters.json)                —— records its own client choice and token
```

### §2.2 The "OAuth client" field (r2 as is)

The storage dialog's drive/gmail field: label `OAuth client`; options `Preset: {name}` × N + `Custom (own client id/secret)` (Gmail / Lark have no built-in fallback ⇒ no Built-in item); preselect `presets[0]`, `custom` when none; one hint per provider (the registry's `clientHint`); custom fields inline: `Custom {field.label}` (secrets as password) + the registry `help` as the hint line; Lark's setup only under Custom: the callback URL as an `oauthLinkRow`-shaped read-only input + Copy, the three prerequisites as hint lines; consent = `{label} access` + the `.mounts-drive-connect` block; submit `.btn-create` "Connect" — the record is created **then**.

### §2.3 Data: the choice lives on the account record (r2 as is)

| | Mount (`mounts.json`) | Channel account (`adapters.json`, r4) |
|---|---|---|
| Preset | `clientPreset: '<key>'` | `credentialKey: 'cluster:<key>'` (**today's value untouched**) |
| Custom | `clientId` + `clientSecretEnc` (`.mounts-key`) | `credentialKey: 'custom'` + `credential: {appId, appSecretEnc}` (`.channels-key`) |
| Token | `tokenEnc` on the record | `auth.tokenEnc` on the record (**today's place untouched**) |
| Resolution | `_driveClient` / `gmail-sync._client`: custom > preset | the engine's `clientFor(rec)`: `custom` ⇒ the record; `cluster:<k>` ⇒ `resolveIntegration(id,{credentialKey})`; the `own` rung retires |

The registry gains `bindsPerAccount` (lark / gmail / fake = true): not a card, presets go to the account dialog, no Test drawn.

### §2.4 The wire (r2 as is + r4's three verbs)

- Preset readers: Google = `drivePresets()`, Lark = the integration store's `VIBESPACE_INTEGRATIONS`; the wire `{key,label}`, the word `Preset: {label}`; no new route.
- Consent: the mounts route family's shape (`POST /api/channels/oauth/start {kind, clientPreset | clientId+clientSecret}` → `status` → `callback {url}`), the record created on `connect {credentialKey|'custom', credential?, flowId, newAccount:true}`; `reauthorize {credentialKey?, credential?}` = the mount's semantics (switching the client IS re-authorizing).
- **New in r4**: `POST /api/channels/adapters/:id/duplicate {name?}` → a new record (the copied fields in §8 #2), unauthenticated, answers `{adapter}`; the client then runs the consent block for it. `DELETE /api/channels/adapters/:id` (= Remove) answers `409 account-referenced {refs:[{kind:'assignment'|'reach'|'outbox', …}]}` by name while referenced; `disconnect` still only drops the token.
- Integrations routes: `bindsPerAccount` rows absent from `GET /api/integrations`; PUT / DELETE / test 404.

### §2.5 Surfaces

- **The account section = a credential-first card** (mockup `account-card`): status dot + name + client chip `Preset: …` / `Custom client` + count + ✎ + ⋯; a **health line** in the storage row's detail-line grammar (`[Gmail] connected · label:INBOX · last poll 2 min ago · push: exclusive`); auth death = `.mounts-errline` "Couldn't connect: the sign-in has expired or been revoked — conversations come from cache while every fetch fails; re-authorize to fix" + the `Re-authorize {provider}…` primary button; **tracked conversations = ↳ rows** (the child-row grammar); **an account tracking nothing** = "Login only — no conversation tracked yet; nothing is fetched until you track one. Use Track… to pick conversations under this account." + `Track…` (the credential-only row's "add submounts under it" register); the ⋯ verbs in the storage row's order (§8 #6).
- **Connect an account** (mockups `connect-dialog` / `-custom`): **type-first** (`Type` = Gmail / Lark …; = Connect storage's `Source type`), every later field with `when:`; name; `OAuth client` (§2.2); the `{provider} access` block; the kind's own fields (Gmail: include query + `List labels`; Lark: included groups (optional)); `Connect`.
- **Duplicate "{account}"** (mockup `duplicate-dialog`): name `… (copy)`, type read-only, `OAuth client` (copied, changeable), filter and push claim (copied), a note saying what is / is not copied, **its own consent block**, `Create & connect`.
- **Re-authorize "{account}"** (mockup `reauth-dialog`): `_showDriveReauthDialog` verbatim + the `OAuth client` select on top (switching = a new token under the new client).
- **Edit "{account}"** (mockup `edit-dialog`): name / `OAuth client` / the custom fields **prefilled, secret included** (2.108.8) / an auth-state fact / the kind's own fields / the push claim; buttons `Re-authorize {provider}…` · `Duplicate…` · `Remove…` · `Save`; switching the client ⇒ Save opens re-authorize.
- **Remove refused** (mockup `remove-refused`): "Cannot remove "{account}" — this account is still referenced: assignments ×2 / reach ×1 / outbox pending ×1; release them first"; `Disconnect` is unaffected.

### §2.6 Migration (back to r2)

| Side | What | Risk |
|---|---|---|
| **channels** | **`adapters.json` is not migrated**, except one thing: accounts with `credentialKey:'own'` get the integration row's `values` decrypted (`.integrations-key`) and re-encrypted (`.channels-key`) onto the record as their custom client, stamped `custom` — migration `2026-09-channel-custom-client-inline` (the shared runner, ledger-keyed); the token's place unchanged; **this instance has zero `own` accounts ⇒ a no-op** | low |
| **mounts** | **zero** (r4 touches no mounts record; D2, if adopted, is a separate commit) | zero |
| **integrations.json** | the lark / gmail rows' `values` / `clusterKey` left in place (no reader) | zero |

## §3 The flows

| # | Scenario | Steps | Difference from a mount |
|---|---|---|---|
| 3.1 | One preset, the first account | `Connect an account` → `Type: Lark` → `OAuth client` pre-picks `Preset: …` → `Connect Lark` → `Connect` | 0 |
| 3.2 | A second Gmail account, another client | `Connect an account` → `Type: Gmail` → another preset or `Custom` → consent → `Connect` | 0 |
| 3.3 | A self-hoster, no preset | Only `Custom` in the select, fields inline, Lark's callback row + three facts | 0 |
| 3.4 | The token died | The section's error line + `Re-authorize {provider}…` → the dialog (client switchable) → `Sign in with {provider}` → done | 0 |
| 3.5 | **Duplicate** | ⋯ `Duplicate…` (or in Edit) → the dialog (settings copied, no token) → consent → `Create & connect` ⇒ a sibling account | the mount's ⧉ retired (superseded by submounts); channels have no submounts — the copy is exactly where it belongs |
| 3.6 | Switch client / rotate secret | Edit → change → Save (client ⇒ re-authorize opens; secret ⇒ direct) | mounts swap the client silently today (D2) |
| 3.7 | The env withdrew a preset | The error line names `preset <k> no longer provided` | improvement (mounts do not name it) |
| 3.8 | **Remove** | ⋯ / Edit `Remove…` → referenced ⇒ refused by name; else the record + index removed | = a credential with children cannot be removed |
| 3.9 | Track conversations | The section's `Track…` / the empty account's button → today's `showTrackPicker` (a checklist) → tracked conversations become ↳ rows | not a submount dialog (§8 #7) |

## §4 The per-point impact

| Category | Content |
|---|---|
| **Removed** | The Integrations window's lark / gmail / fake cards; the wizard's stepper / credential step / own flow dialog; the `own` rung for per-object rows; `credentialDefault`; `credential-bound` (replaced by "switch = re-authorize"); the first-account-keeps-its-record special case (`disconnect` only drops the token; `Remove` always runs the reference check) |
| **Kept** | Everything under `data/channels/*` and the engine (pass / index / options / push / outbox / reach / groups); the registry; the two-form env reader; secret-box (`.channels-key`); oauth-loopback; `LARK_CALLBACK_URL`; the six browser rows; the agent routes; **zero change on the mounts side** |
| **New** | `bindsPerAccount` + `clientHint`; `credential` on the record (custom); the engine's `clientFor` / the three transient consent routes / `duplicate` / the reference check `referencesOf(adapterId)`; UI: the credential-first section (health line / error line + button / ↳ rows / the empty wording), the type-first connect dialog, the duplicate dialog, the re-authorize dialog (r2), the edit dialog (r2 + Duplicate), the remove-refused dialog; the ⋯ reordered; the shared dialog component (§8 #12) |
| **Migration** | §2.6 |
| **Phone** | The section and ↳ rows = the storage row's phone layout (same CSS); dialogs share the shell (`*.phone.png`) |
| **i18n (zh + ja)** | Shared keys: `OAuth client` · `Preset: {name}` · `Custom (own client id/secret)` · `Re-authorize {provider}…` · `Re-authorize "{name}"` · `Sign in with {provider}` · `Couldn’t connect:` · `Remove…` · `Edit` · `Duplicate` (exists) · `Create & connect` · `List labels` · `Track…` · `Options` · `Push…` · `Enable` / `Disable` · `Nothing is fetched for a conversation until you track it.`; new keys: `Connect an account` · `Type` · `Connected · {filter} · last poll {ago} · push: {claim}` · `connected but the sign-in has expired or been revoked — conversations come from cache while every fetch fails; re-authorize to fix` · `Login only — no conversation tracked yet; nothing is fetched until you track one. Use Track… to pick conversations under this account.` · `Duplicate "{name}"` · `{name} (copy)` · `Copied from the original; you can change it.` · `Copied: the type, the OAuth client, the query, the push claim, the sender line. NOT copied: the token (a login is one person's consent), tracked conversations, assignments, reach grants, the message log — the copy signs in on its own.` · `This copy needs its own sign-in — another account, or the same one authorized again.` · `Cannot remove "{name}"` · `This account is still referenced — release these first:` · `assignment: {conv} → {who}` · `reach: {who} may see the whole account` · `outbox: {n} proposal(s) awaiting approval` · `Disconnect only drops the token and keeps these; Remove needs them released first — the same rule as a credential with submounts.` · `Open conversation window` · `Custom App ID` · `Custom App Secret` · `Included groups (optional)` · `Include query (Gmail search syntax)`; removed keys: r2 §4's list + `Add account…` (becomes `Connect an account`) |
| **Tests** | `test-channels-accounts` (fast): the custom client on the record; `clientFor`'s order; the transient flow → `connect {flowId}`; `duplicate`'s copied field set = a **declared table** (`DUPLICATE_FIELDS`), token / tracked / assignments / reach / log **absent**; `DELETE` referenced ⇒ `409 account-referenced` naming each (assignment / reach / outbox), unreferenced ⇒ removed; `disconnect` unaffected by references; the `own → custom` migration idempotent + named failure without an engine + a pre-fix copy; **`test-oauth-field-parity`** (fast, new, a grep census): the two features' connect dialogs use the **same keys** (the type-first field, the `OAuth client` label + options, the `Custom {…}` labels, `.mounts-field-hint` / `.mounts-drive-connect` / `oauthLinkRow` / `.btn-create` / `.cfg-err`, `Re-authorize {provider}…`, `Duplicate`, `Remove…`) — one side reworded without the other = red; if `_mountsDialog` is shared, the census becomes "channels-panel holds no second field renderer"; `test-integrations-ui` ⑩ rewritten: type-first / preset pre-picked / custom inline + callback row / inline consent / record created only on `Connect` / the section's health and error lines / Duplicate (settings carried, no token, its own consent) / Remove refused by name / the ⋯ order / 375 px; `test-channels-i18n`; `test-vendor-whitelist` zero new calls; `test-mounts-*` **untouched** |

## §5 The trimmed build list

| File | Change |
|---|---|
| `src/integration-registry.js` (PURE) | `bindsPerAccount` + `clientHint`; the `checkRow` assert |
| `src/server/integration-store.js` · `src/routes/integrations.js` | `bindsPerAccount` rows are not cards (404); the `own` rung only for false rows |
| `src/server/channels-engine.js` | `clientFor(rec)`; the transient consent flow (`startOAuth` / `oauthStatus` / `oauthCallback`); `connect({credentialKey, credential, flowId, newAccount})`; `reauthorize` re-bind semantics; **`duplicate(adapterId, {name})`** (the declared `DUPLICATE_FIELDS`); **`referencesOf(adapterId)`** (assignments / adapter-scoped reach grants / unsettled outbox proposals) + the `remove` refusal; `credential` on the record via `.channels-key` |
| `src/routes/channels.js` | the three `/api/channels/oauth/*`; `POST /adapters/:id/duplicate`; the 409 on `DELETE /adapters/:id` |
| `src/lib/channels-panel.js` | the section = the credential-first card (health line / error line + button / ↳ rows / empty wording); the ⋯ reordered + `Duplicate…` + `Remove…`; the connect dialog = a **`_mountsDialog` spec** (type-first + `when:`); the Duplicate / Re-authorize (= `_showDriveReauthDialog`'s shape + the select) / Edit (= the mount edit grammar + Duplicate) / remove-refused dialogs |
| `src/lib/sidebar-mounts.js` | **zero change** — unless §8 #12's "extract `_mountsDialog` into a shared module" (a pure move, no behaviour change) and D2 (a separate commit) are adopted |
| `src/lib/mounts-dialog.js` (new, optional) | `_mountsDialog` + `oauthLinkRow` + `_wireOAuthConnect` moved into a shared module, imported by both (§8 #12) |
| `public/style.css` | below mockup.css's marker: `.chan-sec-health`, `.chan-row-tracked`, the error-line indent (3 rules) |
| i18n zh/ja · `docs/kb-file-structure.md` (channels-panel / channels-engine / integration-store) · `docs/kb-api.md` · `docs/design-communication-panel.zh.md` §14.5 (a closing pointer here) · `CHANGELOG.md` | same commit |
| `src/server/migrations.js` | `2026-09-channel-custom-client-inline` |

Estimate: one lane, 4–5 rounds (engine + routes + migration; the section + four dialogs; the shared dialog module + census; suites; adversarial verification — credentials / remove / duplicate are must-verify).

## §6 Decisions only the owner can make (r4; r3's D1 / D3 / D5 / D6 / D7 vanished with the merge)

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | **Extract `_mountsDialog` into a shared module** (the two dialogs = one component) vs channels copying its field grammar (the census pins spellings) | extract / copy | **Extract** (`src/lib/mounts-dialog.js`, a pure move; zero behaviour change on mounts); the census degrades to "channels-panel holds no second renderer" |
| D2 | **Mounts adopt "switching the client = re-authorize"** | adopt (separate commit) / untouched | **Adopt, separate commit**: today Edit swaps `clientPreset` silently, the next refresh fails `invalid_client` |
| D3 | **The custom secret prefilled in Edit** | follow mounts (2.108.8) / Replace-never-Reveal | **Follow mounts**: the directive's object was exactly "the dialog that edits a connection"; the cost (`GET …/config` returns plaintext) equals mounts'; the six browser rows do not follow |
| D4 | **Which fields Duplicate copies** | the declared table `DUPLICATE_FIELDS` = {type, client choice (preset key, or custom id+secret), include query / included groups, push claim, sender line} / fewer (type + client only) | **The table as stated**; the token / tracked list / assignments / reach / message log are never copied (each with its reason in §8 #2) |
| D5 | **The scope of the Remove reference check** | assignments + reach grants + unsettled outbox proposals (recommended) / assignments only / plus "references from agent groups" (groups reference agent sessions, not channel accounts ⇒ not counted) | **The three as stated**; `Disconnect` unaffected (drops the token, references kept) |
| D6 | **The ⋯ verb order** | the storage row's action order (Open → Track… → Options → Push… ‖ Re-authorize/Connect → Duplicate… → Disconnect → Remove… ‖ Disable) / keep today's grouping | **The storage row's order**; `Remove…` also lives in Edit (the mount's home) |
| D7 | **The Test verb / the six remaining Integrations rows** | (r2 D5 / D7) | no Test; the six rows untouched |
| D8 | **The health sentence's wording** | borrow the mount's verbatim ("the sign-in has expired or been revoked — … re-authorize to fix") / the channels' own four-valued why | **Borrow verbatim**, with the channel `why` code as a trailing parenthesis (`(refresh-refused)`) |

## §7 Mockups (`docs/mockups/integrations-per-account/`, r4)

| File | Shows | The mounts pattern it mirrors | PNG (desktop / phone 390) |
|---|---|---|---|
| `account-card.html` | The panel: three account sections (health line / the OPEN ⋯ menu with `Duplicate…` `Remove…` / ↳ tracked conversations / the auth-death error line + button / the "login only" wording of an empty account) + `Connect an account` | `_buildMountRow` + error line + credential-only row + child rows | `account-card.png` / `.phone.png` |
| `connect-dialog.html` | `Connect an account`: type-first (Gmail) → name → `OAuth client` → consent block → include query → `Connect` | `_showAddMountDialog` (type-first + `when:`) | `connect-dialog.png` / `.phone.png` |
| `connect-dialog-custom.html` | Same, Type = Lark, `Custom` ⇒ custom fields + callback URL row + three facts | same (the Custom branch) | `connect-dialog-custom.png` / `.phone.png` (+`.full`) |
| `duplicate-dialog.html` | `Duplicate "{account}"`: settings copied, no token, its own consent | the retired ⧉ (2.107.0) | `duplicate-dialog.png` / `.phone.png` |
| `reauth-dialog.html` | `Re-authorize "{account}"` | `_showDriveReauthDialog` | `reauth-dialog.png` / `.phone.png` |
| `edit-dialog.html` | `Edit "{account}"`: prefilled secrets included / Re-authorize · Duplicate · Remove · Save | `_showEditMountDialog` | `edit-dialog.png` / `.phone.png` |
| `remove-refused.html` | `Cannot remove "{account}"`: references named | `remove()`'s "refused with children" | `remove-refused.png` / `.phone.png` |

`mockup.css` = the dialog shell, the `.mounts-*` and `.chan-*` rules copied verbatim from `public/style.css` + the rules below the marker (the open menu is a static mockup drawing with the product's popover tokens; the product renders it through `showContextMenu`). `shoot.mjs` / `check.py` as before: **28 frames, 268 probes, all pass**. Re-run: `node docs/mockups/integrations-per-account/shoot.mjs && python3 docs/mockups/integrations-per-account/check.py`.

## §8 The mounts patterns, one by one

### §8.1 Twelve patterns: adopted / adapted / not applicable + why

| # | The mounts pattern (where in §1) | Channels side | Verdict | Why / how |
|---|---|---|---|---|
| 1 | **Credential-first record**: the connection row IS the login — status dot (mounted / err / off / connecting), a health line, the auth-death sentence *"sign-in has expired or been revoked — … re-authorize to fix"*, `Connect` / `Disconnect` verbs, the **credential-only row's** wording ("this token can't open the storage root; add submounts under it") | the section head has a dot and a four-valued auth line; no health line; an empty account only says "No conversations discovered yet." | **Adopted** | the section = the card: the dot (adapter state connected / needs-reauth / needs-credentials / unknown → ok / bad / warn / idle), a **health line** in the detail-line grammar (`[Gmail] connected · label:INBOX · last poll 2 min ago · push: exclusive`), the auth-death sentence **borrowed verbatim** with the why code appended (D8), the same `Connect` / `Disconnect` verbs; an account tracking nothing uses the credential-only register: "Login only — no conversation tracked yet; nothing is fetched until you track one. Use Track… to pick conversations under this account." + a `Track…` button |
| 2 | **Duplicate**: `docs/mounts.md` "Duplicate (⧉) derives a new standalone mount from an existing connection" (2.107.0); in `_buildMountRow` it is **retired** — "duplicate is superseded by submounts, and Remove moved into the Edit dialog (fewer per-row icons)"; a mount row has no ⋯ menu, its actions are icons | none | **Adopted** (channels have no submounts; the copy is exactly its place) | `Duplicate…` in the ⋯ + in the Edit dialog; **copied**: the type, the OAuth client choice (the preset key, or the custom id + secret — two accounts on one app is the normal case), the include query / included groups, the push exclusivity claim, the sender-honesty line; **never copied**: the token (a login is one person's consent; the copy signs in on its own — another person, or the same one again), the tracked list (tracking is a per-account choice), assignments, reach grants (they point at this account's id), the message log and cursors (they belong to the original's conversations); route `POST /adapters/:id/duplicate {name?}` → an unauthenticated new record, the dialog then runs the consent block → `Create & connect`; `DUPLICATE_FIELDS` is a **declared table** in the engine, pinned by the suite |
| 3 | **Re-authorize**: the row's error line with the `Re-authorize {provider}…` primary button (auth-death regex) + `_showDriveReauthDialog` (who reported / `Sign in with {provider}` / `oauthLinkRow` / paste-back) + one more in Edit | ⋯ `Re-authorize`, its own flow dialog (`chan-flow-*`), a countdown line | **Adopted, verbatim** | the section's error line + the same button; the dialog = `_showDriveReauthDialog`'s shape + the `OAuth client` select on top (switching = re-authorizing, #4); Lark runs the fixed-port flow in the same dialog; the channels' own flow dialog **deleted** |
| 4 | **Edit**: `Edit "{name}"` with every parameter prefilled, secrets included (2.108.8), the `OAuth client` select (`(custom / built-in)` + `Preset: …`), only changes sent, `Re-authorize…` / `Remove…` inside | ⋯ `Options` dialog (declared schema) / `Push…` dialog | **Adopted** (channel side) | `Edit "{account}"`: name / `OAuth client` / custom fields **prefilled, secret included** (D3) / an auth-state fact / the kind's own fields (the options schema) / the push claim; `Re-authorize…` · `Duplicate…` · `Remove…` · `Save`; **switching the client = re-authorizing** (Save opens the re-authorize dialog pre-filled with the new client); mounts adopting the same = D2, a separate commit; `Options` / `Push…` stay as shortcuts, same content |
| 5 | **Remove**: `remove()` — "This credential still has mount points under it — remove those first"; `Remove…` lives in Edit | `Disconnect` (drops the token; a further account is removed with its record) | **Adopted** | `Remove…` (⋯ + Edit): referenced ⇒ `409 account-referenced` naming: assignments (`assignment: conversation → who`), reach grants (scope.kind==='adapter'), unsettled outbox proposals; unreferenced ⇒ the record + index removed; `Disconnect` keeps "drop the token only, references kept"; agent groups reference agent sessions, not counted (D5) |
| 6 | **Action placement and order**: the mount row's icon order = Browse → Disconnect / Connect → Share → ＋ submount → ✎; `Remove` in Edit ("fewer per-row icons"); host rows likewise | ⋯ groups: Track… / Options / Push… ‖ sender line ‖ Re-authorize/Connect / Add account… / Disconnect ‖ Enable/Disable | **Adapted** (channels have a ⋯, mounts do not) | keep the ⋯ (the section head already has one) but **order** it like the mount row: Open conversation window (= Browse) → Track… (= ＋) → Options → Push… ‖ Re-authorize / Connect → Duplicate… → Disconnect → Remove… ‖ Disable; `Add account…` leaves the ⋯ for the panel's bottom `Connect an account` (= the footer's `Connect storage`); `Remove…` also in Edit (the mount's home) |
| 7 | **Submounts**: `_showAddChildDialog` — N paths under one credential | N tracked conversations / one filter under one account | **Adapted: a lighter form, not a submount dialog** | a channel account's "children" are the conversations it tracks — they **already exist on the other side** (the discovery list), they are not paths the user creates; so: tracked conversations render as ↳ rows (the child-row grammar), adding = today's `Track…` checklist (`showTrackPicker`), not a "new …" dialog; the filter (Gmail query / Lark included groups) is the account's own field (in Edit), not a child; the owner said submounts "may be irrelevant to channels" — they are, except for their **rendering** grammar |
| 8 | **Share / import link / bridge / rclone.conf import** | none | **Not applicable** | share = minting a down-scoped storage credential for someone else — a channel account is one person's login, there is no "down-scoped" form of it; import link = consuming a storage credential someone minted — channels have nothing importable; bridge = exposing a local folder over WebDAV to another VibeSpace — channels have no folder; rclone.conf = consuming existing rclone remotes — channels have no equivalent pre-existing config file (a Lark / Gmail token never exists as a file elsewhere) |
| 9 | **Health / heal**: the 60 s sweep + the 10 min OAuth probe + backoff 1/2/5/10 min reconnect + auth-class errors wait (mounts); the 15 min reconcile is the **channels** engine's own (`RECONCILE_SECONDS`) | the engine's 5 s scheduler: hot 30 s / cold 300 s / reconcile 15 min; amber after 3 failures; auth-expired never retried | **Keep the channels' own** | the mounts heal repairs a **mountpoint** (dead daemon / hung IO / breaker); a channel account has no mountpoint — its liveness is the pass; both sides **already** never auto-retry auth-class errors — what is borrowed is the **expression on the row** (error line + button + wording), not the loop |
| 10 | **Phone layout**: storage rows use the same renderer at ≤768, rows / children / error lines the same CSS, dialogs the same shell | the panel's window fallback; sections the same CSS | **Adopted** | the section / ↳ rows / error line use the same `.mounts-*` classes (error line, re-authorize button, child indent), so on a phone the storage row's CSS applies **as is**; dialogs = the same shell (`*.phone.png`) |
| 11 | **The type-first dialog**: `Connect storage`'s first field is `Source type`, every later field carries `when: is('drive')` | one entry button per kind | **Adopted, exactly** | `Connect an account`'s first field is `Type` (Gmail / Lark / …), every later field carries `when:`; one dialog serves every kind; one `Connect an account` button at the panel's bottom (= the footer's `Connect storage`); the per-kind entry buttons retire |
| 12 | **The `_mountsDialog` component**: a field-spec array (`{key,label,type,options,value,when,hint,advanced,autocomplete}`) → label / control / hint / advanced fold / `.cfg-err` / `.btn-create`, conditional re-evaluation, the `_lastMountsDialog` context | hand-built DOM | **Adopted** | the two dialogs = **one component**: move `_mountsDialog` + `oauthLinkRow` + `_wireOAuthConnect` into `src/lib/mounts-dialog.js` (a pure move, D1) and import it from channels-panel; if not moved (D1 no), copy its exact field grammar and let **`test-oauth-field-parity`** pin the shared spellings (labels / options / class names / button wording) — one side reworded without the other = red |

### §8.2 Per element (Remote/storage today · Channels today · the unified rule · who changes)

| Element | Remote today | Channels today | Unified rule | Who changes |
|---|---|---|---|---|
| Entry point | footer `Connect storage` | ⋯ `Add account…` / per-kind buttons | the panel's bottom `Connect an account` (type-first) | Channels |
| Dialog shape | `_mountsDialog` | stepper + `chan-flow-*` | one component (D1) or the exact grammar + census | Channels (+ an optional move) |
| The OAuth client field | `Preset: …` / built-in / `Custom` inline | a radio → the Integrations window | the same field | Channels |
| Where the choice / token lives | per record | per account + the row's own | per account record (r2) | Channels |
| Preset source | `drivePresets()` | the registry | one reader per env name; `{key,label}`; no new route | none |
| The consent flow | `_wireOAuthConnect` + `oauthLinkRow` + paste-back | its own flow dialog | Remote's, nothing else | Channels |
| The card | dot / detail line / error line + button / credential-only wording | head + auth line | the credential-first card (§8.1 #1) | Channels |
| The re-authorize dialog | `_showDriveReauthDialog` | the flow dialog | Remote's + the client select | Channels |
| Edit / remove | prefilled incl. secrets / re-authorize / remove (refused with children) | Options / Push / Disconnect | the mount edit grammar + Duplicate + the refused remove | Channels; D2 = Remote optional |
| Duplicate | the retired ⧉ | none | adopted by channels (a declared field table) | Channels |
| Children | the ＋ submount dialog | Track… checklist | ↳ rows + Track… (not a submount dialog) | Channels (rendering) |
| The ⋯ order | icon order | groups | the mount row's order | Channels |
| Health | mountpoint heal | the engine's pass | each its own; the expression shared | Channels (wording) |
| Share / import / bridge / conf | present | none | not applicable | none |
| Phone | same renderer | same shell | same CSS | none |
| A global page | none | ⚙ Integrations & keys | no global page for OAuth; the window keeps only browser keys | Channels |

**The retraction log**: r1's keys library (shared client entries + delete refusals) → withdrawn (Remote has none); r3's "channel accounts are children of mounts.json credentials" → withdrawn (owner: refer to the design, do not merge the objects); r4 = r2's structure + the patterns.

## §9 Not doing / not verified

- Not doing: merging the stores; a cluster auth relay; the browser key rows; the agent routes; mounts-side changes (except D1's move and D2, each a separate commit).
- Not verified: two self-built apps in one Lark tenant each holding an independent long connection (50 per app per the docs); Google's behaviour for one account holding a refresh token under each of two clients (should be independent). Neither affects the model.
