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
 */
const SIGNED_OUT_CODE = 4401;
const VB = require('../vault-blocked.js');   // PURE: the lock epoch's list and the item's words

// lane vault-relock-door (owner 2026-10-20 「为啥我有的时候更新后需要重新输入二次密码有时候不用」): the restart's For-you item. The
// vault locks at every restart by law; the open tab re-asks and a persistent strip warns (src/lib/vault-unlock.js), but a
// client that was not open would see nothing. So at boot the hub files ONE tray item when the vault is SET UP and LOCKED.
const i18nKey = (s) => s; // extraction marker (scripts/i18n-extract.mjs) — the client words it with t() (zh + ja in src/lib/i18n-*.js)
const VAULT_INBOX_KEY = 'vault'; // the For-you bucket (not a session), as login-expiry uses 'accounts' and apps uses 'apps'
const RELOCK_TEXT = i18nKey('The vault locked after a restart — enter the second password to unlock. Device links, the relay and account switching are waiting.');
// lane vault-locked-refusal-notice: THE item's identity (the store dedupes by bucket + text + action: one row, ever — the page
// words it from `i18n`); the line once the lock has stopped someone; its detail lines
const VAULT_ITEM_TEXT = 'The vault is locked — enter the second password to unlock.';
const BLOCKED_TEXT = i18nKey('The vault is locked — waiting on it: {who}. Enter the second password to unlock.');
const NOTHING_YET = i18nKey('Nothing has been refused yet — whatever the lock stops is named here as it happens.');
const ROW_LINE = i18nKey('{who} — {what}');
const MORE_LINE = i18nKey('…and {n} more, refused while it is locked');   // n = the further callers listed; `N+` once some fell past the list's 50 (counted, not named)

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
      const r = userTodos.add(VAULT_INBOX_KEY, { origin: 'vault', kind: 'notice', urgency: 'high', by: 'agent', sessionName: 'Vault', text: VAULT_ITEM_TEXT, detail,
        i18n: { text: w ? { key: BLOCKED_TEXT, params: { who: w.who } } : { key: RELOCK_TEXT }, detail: lines }, action: { type: 'vault-unlock' } });
      if (r && r.id) itemId = r.id;
    } catch (e) { log.warn?.(`[vault] the vault's For-you item was not filed: ${(e && e.message) || e}`); }
  }
  if (userTodos) {
    // an older build's restart notice (its own text) gives way to THE item — never two rows for one lock
    try { for (const it of userTodos.forSession(VAULT_INBOX_KEY)) if (isVaultItem(it) && it.text !== VAULT_ITEM_TEXT) userTodos.setStatus(it.id, 'done', 'vault'); } catch { /* gone already */ }
    if (vault.state() === 'locked') fileItem(typeof vault.blockedSummary === 'function' ? vault.blockedSummary() : null);
    if (typeof vault.onBlocked === 'function') vault.onBlocked((summary) => fileItem(summary));
  }
  if (userTodos) vault.onUnlock(() => {
    try { for (const it of userTodos.forSession(VAULT_INBOX_KEY)) if (it.action && it.action.type === 'vault-unlock') userTodos.setStatus(it.id, 'done', 'vault'); } catch { /* the item is already gone */ }
  });
}

module.exports = { wireVaultHooks, SIGNED_OUT_CODE, VAULT_INBOX_KEY, RELOCK_TEXT, VAULT_ITEM_TEXT, BLOCKED_TEXT, NOTHING_YET, ROW_LINE, MORE_LINE };
