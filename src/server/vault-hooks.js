'use strict';
/**
 * THE VAULT'S HOOKS (lane vault-e2e-password-fix-r2) — what an open and a lock do to the rest of the hub, in ONE place the
 * wiring (src/server/mounts-plugins-wiring.js) calls and scripts/test-vault-secrets.mjs drives with the real objects.
 *   · OPEN (after the setup and every unlock): every secret an older build left in the clear is sealed — a
 *     data/agentd/host-<id>.token file (host-tokens `adoptAll`), frp's relay token in plugins.json (`sealSecrets`), the
 *     voice pair's plain file (sealed-json `seal`) — then every card re-derived (the integrations rows, the channels
 *     accounts, the plugin rows read their sealed values again); a device link that dialed in while LOCKED (its hello could
 *     not be said) is dropped, so the device re-dials and the whole dial-in runs (the hello, the heal, the back-tunnels).
 *   · LOCK (a person's door, an agent, the idle lock — never the shutdown's quiet lock: a restart is not a lock act) SIGNS
 *     EVERY LOGIN OUT (the owner's decision ④, design q-042 D9): the login map cleared, every page's socket closed with
 *     4401 — the page probes /api/home, reads 401 and shows the sign-in, then the unlock modal; every card re-derived
 *     (「保险库已锁定——先解锁」 by name).
 *   · A REFUSAL IS THE SIGNAL (lane vault-locked-refusal-notice — the owner 2026-10-20: "为啥老是有 agent 和我说需要解锁 vault，
 *     这个不是应该系统检测到 agent 被阻拦了然后提醒我解锁吗"): THE ONE FOR-YOU ITEM below is filed at boot over a set-up + locked
 *     vault AND refreshed by the engine's `onBlocked` (a refusal that changed who/what the lock stopped): its line names the
 *     callers and what they were refused, its detail one line each; the unlock resolves it. One row, ever: its `text` is the
 *     store's dedupe key (the same text ⇒ the same id, a later lock epoch REOPENS it), the words the page shows are its i18n.
 *     The owner setting it aside (dismissed / done) holds for that lock epoch — a later refusal refreshes nothing until the next.
 *   · THE DAILY-FAILURE CARD (lane vault-use-law — design q-043 D7): the engine counts failed uses per actor × entry (a
 *     bearer at a person's door, a session asking for a link token it has none of, a wrong second password — never what the
 *     LOCK refused: its item above names those) and runs `onFailing` at the 20th in a day. That files ONE For-you item
 *     naming the actor and the entry (its `text` = the pair: one row per pair, ever); the OWNER resolves it — an unlock does
 *     not (it is not the lock's) — and the same pair files again only a day later (the store REOPENS the same row).
 *   · SAID AT ONCE (lane vault-locked-loud — the owner 2026-10-20: "如果 vault 没解锁应该直接在界面上有个显著提醒，不需要等到 agent 被
 *     block 了 … 或者在 inbox 有个 urgent 提醒"): THE item is URGENT (an action row: the red badge counts it, never the grey
 *     notices) and is filed the MOMENT the vault becomes locked — a boot over a locked vault AND every lock act (a person's
 *     door, an agent, the idle lock) — by PURE src/vault-loud.js's table (`item`), the one the page's dialog and ⚙ mark ask.
 *     Before any refusal its line says what the lock means («… agents that need a credential will be refused until you unlock
 *     it»); a refusal then names who (above). The unlock resolves it; the next lock files it again.
 */
const SIGNED_OUT_CODE = 4401;
const VB = require('../vault-blocked.js');   // PURE: the lock epoch's list and the item's words
const VI = require('../vault-inventory.js'); // PURE: the two producers' rules (lane vault-window-v2)
const VU = require('../vault-use.js');       // PURE: the use law — an entry in words (lane vault-use-law)
const VL = require('../vault-loud.js');      // PURE: what a locked vault says at once (lane vault-locked-loud) — `item` here

// lane vault-relock-door (owner 2026-10-20 「为啥我有的时候更新后需要重新输入二次密码有时候不用」): the restart's For-you item. The
// vault locks at every restart by law; the open tab re-asks and a persistent strip warns (src/lib/vault-unlock.js), but a
// client that was not open would see nothing. So at boot the hub files ONE tray item when the vault is SET UP and LOCKED.
const i18nKey = (s) => s; // extraction marker (scripts/i18n-extract.mjs) — the client words it with t() (zh + ja in src/lib/i18n-*.js)
const VAULT_INBOX_KEY = 'vault'; // the For-you bucket (not a session), as login-expiry uses 'accounts' and apps uses 'apps'
const RELOCK_TEXT = i18nKey('The vault locked after a restart — enter the second password to unlock. Device links, the relay and account switching are waiting.');   // 2.369.325's line (an upgraded store's resolved rows still show it)
const LOCKED_TEXT = i18nKey('The vault is locked — agents that need a credential will be refused until you unlock it. Enter the second password to unlock.');   // int332: + the door sentence (test-vault-words: a For-you sentence says where)   // lane vault-locked-loud: the line from the moment it locks
// lane vault-locked-refusal-notice: THE item's identity (the store dedupes by bucket + text + action: one row, ever — the page
// words it from `i18n`); the line once the lock has stopped someone; its detail lines
const VAULT_ITEM_TEXT = 'The vault is locked — enter the second password to unlock.';
const BLOCKED_TEXT = i18nKey('The vault is locked — waiting on it: {who}. Enter the second password to unlock.');
const NOTHING_YET = i18nKey('Nothing has been refused yet — whatever the lock stops is named here as it happens.');
const ROW_LINE = i18nKey('{who} — {what}');
const MORE_LINE = i18nKey('…and {n} more, refused while it is locked');   // n = the further callers listed; `N+` once some fell past the list's 50 (counted, not named)
// lane vault-use-law (design q-043 D7): THE DAILY-FAILURE CARD's words — {who} = the actor's name (a conversation, a job,
// «someone at <address>»), {what} = the entry in words (VU.entryLabel), {n} = the failures in the day
const FAILING_TEXT = 'Failed vault uses in a day';   // + « — <who>: <what>» = THE row's identity (the store dedupes by bucket + text + action)
const FAILING_LINE = i18nKey('{who} was refused {what} {n} times in a day — the vault handed nothing out. Look at what it is doing.');
const FAILING_PW_LINE = i18nKey('{who} entered a wrong second password {n} times in a day.');
const FAILING_DOOR = i18nKey('Through {door}; the last answer was {code}.');
const FAILING_ONCE = i18nKey('Filed once a day for this caller and this entry — mark it done when you have looked.');
const FAILING_PW_HINT = i18nKey('If it was not you: lock the vault and change the sign-in password.');

function wireVaultHooks({ vault, auth = null, wss = null, hostTokens = null, plugins = null, sealed = [], integrations = null, redial = null, userTodos = null, log = console }) {
  const rederive = () => {
    if (integrations && typeof integrations.vaultChanged === 'function') { try { integrations.vaultChanged(); } catch (e) { log.warn?.(`[vault] the integrations rows were not re-derived: ${(e && e.message) || e}`); } }
  };
  if (hostTokens) vault.onOpen(() => hostTokens.adoptAll());
  if (plugins) vault.onOpen(() => plugins.sealSecrets());
  for (const s of sealed) vault.onOpen(() => s.seal());
  vault.onOpen(rederive);
  if (typeof redial === 'function') vault.onOpen(() => redial());   // a device link that dialed in LOCKED never said hello — it re-dials
  for (const s of sealed) if (typeof s.forget === 'function') vault.onLock(() => s.forget());   // verify r2 low: no decrypted copy outlives a lock
  vault.onLock((why) => {
    if (auth && auth.enabled) {
      const n = auth.revokeAllTokens();
      log.log?.(`[vault] locked (${why}) — ${n} login(s) signed out`);
      if (wss) for (const c of wss.clients) { try { c.close(SIGNED_OUT_CODE, 'signed out: the vault was locked'); } catch { } }
    }
    rederive();
    if (plugins && typeof plugins.vaultChanged === 'function') plugins.vaultChanged();
  });

  // THE ONE FOR-YOU ITEM (lane vault-relock-door → lane vault-locked-refusal-notice): at boot, a SET UP + LOCKED vault files it
  // so the owner is told the vault is waiting even on a client that was not open; its door (`vault-unlock`) opens the unlock
  // dialog (src/lib/user-todos-actions.js). A refusal that changes who the lock stopped (the engine's `onBlocked`) files /
  // refreshes the SAME row — its line names them (`BLOCKED_TEXT`), its detail one line each. A SECOND boot while still locked
  // re-files the same row (the store dedupes by sessionKey + text + action); a vault that is NOT set up files nothing;
  // `onUnlock` resolves it (a person's unlock on any device, through the store's broadcast, clears it everywhere).
  let itemId = null;
  const isVaultItem = (it) => !!it && it.sessionKey === VAULT_INBOX_KEY && !!it.action && it.action.type === 'vault-unlock';
  function fileItem(summary = null) {
    const w = summary && summary.count ? VB.itemWords(summary) : null;
    // the owner set it aside during THIS lock epoch (dismissed / done — not the unlock's own resolve) ⇒ quiet until the next
    const prev = itemId ? userTodos.get(itemId) : null;
    const since = (vault.facts() || {}).lockedSince || 0;
    if (w && prev && prev.status !== 'open' && prev.resolvedBy !== 'vault' && (Number(prev.resolvedAt) || 0) >= since) return;
    const lines = w ? [...w.lines.map((l) => ({ key: ROW_LINE, params: { who: l.who, what: l.what } })), ...(w.moreActors || w.moreRefusals ? [{ key: MORE_LINE, params: { n: w.moreRefusals ? `${w.moreActors}+` : w.moreActors } }] : [])] : [{ key: NOTHING_YET }];
    const detail = lines.map((l) => l.key.replace(/\{(\w+)\}/g, (m, k) => (l.params && l.params[k] != null ? String(l.params[k]) : m))).join('\n');
    try {
      const r = userTodos.add(VAULT_INBOX_KEY, { origin: 'vault', kind: 'action', urgency: 'urgent', by: 'agent', sessionName: 'Vault', text: VAULT_ITEM_TEXT, detail,
        i18n: { text: w ? { key: BLOCKED_TEXT, params: { who: w.who } } : { key: LOCKED_TEXT }, detail: lines }, action: { type: 'vault-unlock' } });
      if (r && r.id) itemId = r.id;
    } catch (e) { log.warn?.(`[vault] the vault's For-you item was not filed: ${(e && e.message) || e}`); }
  }
  if (userTodos) {
    // an older build's restart notice (its own text) gives way to THE item — never two rows for one lock
    try { for (const it of userTodos.forSession(VAULT_INBOX_KEY)) if (isVaultItem(it) && it.text !== VAULT_ITEM_TEXT) userTodos.setStatus(it.id, 'done', 'vault'); } catch { /* gone already */ }
    const loud = () => VL.vaultLoudState({ facts: vault.facts() }).item;   // lane vault-locked-loud: THE table's word — set up + locked
    if (loud()) fileItem(typeof vault.blockedSummary === 'function' ? vault.blockedSummary() : null);
    vault.onLock(() => { if (loud()) fileItem(null); });   // lane vault-locked-loud: the moment it locks (a lock act, the idle lock) — not first at a refusal
    if (typeof vault.onBlocked === 'function') vault.onBlocked((summary) => fileItem(summary));
  }
  // lane vault-use-law (design q-043 D7): THE DAILY-FAILURE CARD — one item per actor × entry, filed when the engine's count
  // reaches 20 in a day (`onFailing` runs once a day per pair); the owner resolves it, an unlock never does
  function fileFailing(c) {
    const pw = c.entry === VU.VAULT_ENTRY && c.by === 'human';
    const who = VB.actorName(c.actor, c.by === 'job' ? 'a job' : c.by === 'human' ? 'someone' : 'a conversation');
    const what = VU.entryLabel(c.entry);
    const lines = [{ key: FAILING_DOOR, params: { door: c.door || 'a vault door', code: c.outcome } }, { key: pw ? FAILING_PW_HINT : FAILING_ONCE }];
    const detail = lines.map((l) => l.key.replace(/\{(\w+)\}/g, (m, k) => (l.params && l.params[k] != null ? String(l.params[k]) : m))).join('\n');
    try {
      userTodos.add(VAULT_INBOX_KEY, { origin: 'vault', kind: 'notice', urgency: pw ? 'urgent' : 'high', by: 'agent', sessionName: 'Vault', text: `${FAILING_TEXT} — ${who}: ${what}`, detail,
        i18n: { text: { key: pw ? FAILING_PW_LINE : FAILING_LINE, params: { who, what, n: c.n } }, detail: lines } });
    } catch (e) { log.warn?.(`[vault] the failed-uses item was not filed: ${(e && e.message) || e}`); }
  }
  if (userTodos && typeof vault.onFailing === 'function') vault.onFailing((c) => fileFailing(c));
  if (userTodos) vault.onUnlock(() => {
    try { for (const it of userTodos.forSession(VAULT_INBOX_KEY)) if (it.action && it.action.type === 'vault-unlock') userTodos.setStatus(it.id, 'done', 'vault'); } catch { /* the item is already gone */ }
  });
}

// THE VAULT WINDOW'S 「需要你」 (lane vault-window-v2, design q-047 §3.4) — the band at the window's top is the For-you list's
// own items of origin 'vault' (filtered — never a second queue). Two producers file them here:
//   · useFailed({ entry, name, code, who }) — a use door refused a caller by a cause the owner can act on (locked / not
//     granted / expired — PURE useFailVerdict): ONE notice per entry per hour; while it is open each later failure of the
//     hour updates its count; once answered, the hour's later failures are counted, never re-filed (the next hour files again)
//   · agentPut({ entry, name, who }) — an agent stored a value it had SEEN (q-043 §9 `put`: its door calls this): ONE
//     notice per store act; nothing re-files it once answered
// The words ride as STRUCTURE (the client says them in its language); the English is the store's dedupe key.
const fillKey = (l) => String(l.key).replace(/\{(\w+)\}/g, (m, k) => (l.params && l.params[k] != null ? String(l.params[k]) : m));
function createVaultAttention({ userTodos = null, now = () => Date.now(), log = console } = {}) {
  const hours = new Map();   // entry → { next, itemId }
  const file = (words, action) => userTodos.add(VAULT_INBOX_KEY, {
    origin: 'vault', kind: 'notice', urgency: 'normal', by: 'agent', sessionName: 'Vault',
    text: fillKey(words.text), detail: words.detail.map(fillKey).join('\n'), i18n: { text: words.text, detail: words.detail }, action,
  });
  /** → the item filed / updated, or null (no cause the owner is told about, a merged failure, no store). */
  function useFailed({ entry = null, name = null, code, who = null } = {}) {
    if (!userTodos) return null;
    const key = String(entry || 'apikey:*').slice(0, 200);
    const prev = hours.get(key) || null;
    const v = VI.useFailVerdict(prev && prev.next, { code, at: now(), who });
    if (!v.counted) return null;
    const open = prev && !v.fresh && prev.itemId ? userTodos.get(prev.itemId) : null;
    if (!v.fresh && !(open && open.status === 'open')) { hours.set(key, { next: v.next, itemId: prev && prev.itemId }); return null; }   // answered inside the hour: counted, never re-filed
    try {
      const it = file(VI.useFailCard({ name, next: v.next }), { type: 'vault-use-failed', entry: key });
      hours.set(key, { next: v.next, itemId: it && it.id });
      while (hours.size > 256) hours.delete(hours.keys().next().value);
      return it;
    } catch (e) { log.warn?.(`[vault] a failed use of ${key} was not filed: ${(e && e.message) || e}`); return null; }
  }
  function agentPut({ entry, name = null, who = null } = {}) {
    if (!userTodos || !entry) return null;
    try { return file(VI.rotateCard({ name: name || entry, who }), { type: 'vault-rotate', entry: String(entry).slice(0, 200) }); }
    catch (e) { log.warn?.(`[vault] the rotate suggestion for ${entry} was not filed: ${(e && e.message) || e}`); return null; }
  }
  return { useFailed, agentPut, _hours: hours };
}

module.exports = { wireVaultHooks, createVaultAttention, SIGNED_OUT_CODE, VAULT_INBOX_KEY, RELOCK_TEXT, LOCKED_TEXT, VAULT_ITEM_TEXT, BLOCKED_TEXT, NOTHING_YET, ROW_LINE, MORE_LINE,
  FAILING_TEXT, FAILING_LINE, FAILING_PW_LINE, FAILING_DOOR, FAILING_ONCE, FAILING_PW_HINT };   // lane vault-use-law: the daily-failure card
