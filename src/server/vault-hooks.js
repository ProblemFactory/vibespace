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
 */
const SIGNED_OUT_CODE = 4401;

function wireVaultHooks({ vault, auth = null, wss = null, hostTokens = null, plugins = null, sealed = [], integrations = null, redial = null, log = console }) {
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
}

module.exports = { wireVaultHooks, SIGNED_OUT_CODE };
