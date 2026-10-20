'use strict';
// THE LOCKED VAULT, SAID AT ONCE (lane vault-locked-loud — the owner 2026-10-20: "如果 vault 没解锁应该直接在界面上有个显著提醒，
// 不需要等到 agent 被 block 了。比如应该在刷新后第一时间弹对话框，或者在 inbox 有个 urgent 提醒，或者直接设置按钮标红标"). A SET UP +
// LOCKED vault is said on the first screen, by three things fed by ONE table over the vault's facts (src/server/vault-engine.js
// `facts()`, the ONE source; src/lib/vault-unlock.js the ONE client reader):
//   · the DIALOG — the unlock modal opens at a page load and at a reconnect, ONCE per lock: 「稍后」 / Esc / ✕ write this
//     lock's key into sessionStorage (`dismissed`), and the page asks no more for that lock (a reload included). A NEW lock — a
//     restart (a new `startedAt`) or a lock act (a new `lockedSince`) — is a new key, so it asks again. A `vault-state`
//     broadcast asks only for a NEW boot (a restart the tab reconnected to): a lock act, an idle-door write or a refusal's
//     count on the same boot draws the marks, never the dialog over the page;
//   · the MARK — the ⚙ button wears a red lock while locked (every client follows the broadcast), and a press opens the
//     unlock dialog first, then the menu;
//   · the ITEM — the hub files ONE urgent For-you item at the moment the vault becomes locked (a boot over a locked vault,
//     a lock act, the idle lock); the unlock resolves it (src/server/vault-hooks.js).
// A hub that never set up a vault (or an unlocked one) says none of the three.
// PURE: imports nothing (scripts/test-architecture.mjs PURE set) — the bundle and the hub share it.

const EVENTS = Object.freeze(['load', 'reconnect', 'broadcast']);
const LATER_KEY = 'vs-vault-unlock-later';   // sessionStorage: the lock whose ask the person set aside in this tab

/** THE TABLE — what a page and the hub say for each case (scripts/test-vault-loud.mjs drives every row). */
const LOUD_TABLE = Object.freeze([
  Object.freeze({ facts: 'none yet / not set up', dismissed: 'any', on: 'any', dialog: false, mark: false, item: false }),
  Object.freeze({ facts: 'unlocked', dismissed: 'any', on: 'any', dialog: false, mark: false, item: false }),
  Object.freeze({ facts: 'locked', dismissed: 'not this lock', on: 'load / reconnect', dialog: true, mark: true, item: true }),
  Object.freeze({ facts: 'locked', dismissed: 'this lock', on: 'load / reconnect', dialog: false, mark: true, item: true }),
  Object.freeze({ facts: 'locked', dismissed: 'not this lock', on: 'broadcast of a new boot', dialog: true, mark: true, item: true }),
  Object.freeze({ facts: 'locked', dismissed: 'any', on: 'broadcast of the same boot', dialog: false, mark: true, item: true }),
]);

/** A lock's identity: the boot and the moment it locked — a restart and a lock act each make a new one. */
function lockKey(facts) {
  if (!facts || facts.state !== 'locked') return null;
  return `${facts.startedAt == null ? '' : facts.startedAt}:${facts.lockedSince == null ? '' : facts.lockedSince}`;
}

/** facts = the vault's facts (or null), dismissed = the lock key this tab set aside (or null), on = what brought the facts,
 *  seen = the `startedAt` this page held before them (a broadcast's new-boot test) → { locked, lock, dialog, mark, item }. */
function vaultLoudState({ facts = null, dismissed = null, on = 'load', seen = undefined } = {}) {
  const locked = !!facts && facts.state === 'locked';
  const lock = lockKey(facts);
  const event = EVENTS.includes(on) ? on : 'load';
  const fresh = event !== 'broadcast' || (locked && facts.startedAt != null && facts.startedAt !== seen);
  return { locked, lock, dialog: locked && fresh && dismissed !== lock, mark: locked, item: locked };
}

module.exports = { LOUD_TABLE, EVENTS, LATER_KEY, lockKey, vaultLoudState };
