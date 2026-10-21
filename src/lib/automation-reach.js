// THE WORDS OF A GRANT'S REACH (lane key-instance-scope — the owner 2026-10-20: 「key 应该可以被授权在整个 vibe space 上工作」),
// shared by the three places that offer or show it: the first-use card (src/lib/user-todos-row.js — the tray; the For-you
// window src/lib/inbox-window.js) and the Vault window's key row (src/lib/vault-automation.js). ONE spelling of the three
// choices — 只有它开的会话 (the default, the narrowest) · 这些岗位的会话 (the caller's / the grant's Task Groups) · 整个 VibeSpace
// (every conversation of this instance, present and later — RED-tinted, its title says what it means). The reach itself is
// PURE src/automation-keys.js (`reachOf` / `reachKind`; the verdict `reachVerdict`); nothing here decides anything.
import { t } from './i18n.js';
import { reachKind } from '../automation-keys.js';

/** The three kinds, narrowest first (the card's and the window's order). */
export const REACH_CHOICES = Object.freeze(['opened', 'groups', 'instance']);
/** A kind's label. */
export const reachWord = (kind) => (kind === 'instance' ? t('The whole VibeSpace') : kind === 'groups' ? t('The conversations of its Task Groups') : t('Only the conversations it opens'));
/** A kind's help (its title): what the key may then do; 整个 VibeSpace says it plainly — including the owner's own conversations. */
export const reachTitle = (kind, groupsText = '') => (kind === 'instance' ? t('This key may act on every conversation here, including yours')
  : kind === 'groups' ? t('Rename, end or archive the conversations of: {groups}', { groups: groupsText }) : t('Rename, end or archive only the conversations it opens with this key (and itself)'));
/** A stored reach (a grant row's) → its kind, for the chip. */
export const kindOf = (reach) => reachKind(reach);
/** The Task Group ids a stored reach names (none unless it is a groups reach). */
export const groupsOf = (reach) => (reach && typeof reach === 'object' && Array.isArray(reach.taskGroups) ? reach.taskGroups.map(String) : []);
