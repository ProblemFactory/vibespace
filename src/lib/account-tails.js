// THE KEY TAILS ON THE PAGE (B-ba7d — the owner's decision 2026-11-18): GET /api/accounts and its accounts-updated push carry
// NO key tail; the page asks the PERSON's read (POST /api/accounts/tails, behind the person verdict — src/routes/account-tails.js)
// and lays the tails onto the rows it already holds. ONE cache for the page; one ask in flight at a time; a refused or failed ask
// lays nothing (a row then reads «API key» with no characters — never a wrong one).
import { fetchJson } from './utils.js';
import { t } from './i18n.js';

let last = { accounts: {}, cliKey: null, providers: {} };
let inflight = null;
// ONE ASK A TAILS GENERATION (B-ee0a smalls — the sync-read law: each ask reads the CLI's file synchronously on the hub's main loop;
// its reader's MUST: never a wrong tail). The hub's list (GET /api/accounts and its push) carries `tailsGen`, a word that changes
// whenever a tail MAY have changed (every store change, the CLI's own key seen different — src/accounts.js tailsGen); the person's
// read answers the word it was read under. A read is reused only for the SAME word; any other word (or none) asks again. A refused
// or failed read is never kept as read.
let readGen = null;   // the word the last GOOD read answered under

/** the person's read for the hub's tails generation `gen` (coalesced; reused only for the same word) → { accounts: { [id]: tail },
 *  cliKey, providers } (the last good answer on a refusal) */
export function askTails(gen) {
  const same = () => gen != null && readGen != null && String(gen) === readGen;
  if (!inflight && same()) return Promise.resolve(last);
  if (inflight) return inflight.then(() => (gen == null || same() ? last : askTails(gen)));   // an ask begun under another word: once more
  // a refused or failed read under a word the last read was NOT taken under lays NOTHING (the tails may have changed — never a wrong one)
  const failed = () => { if (gen != null && String(gen) !== readGen) { last = { accounts: {}, cliKey: null, providers: {} }; readGen = null; } return last; };
  inflight = fetchJson('/api/accounts/tails', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    .then((r) => { if (r && r.ok && r.tails && typeof r.tails === 'object') { last = { accounts: { ...(r.tails.accounts || {}) }, cliKey: typeof r.tails.cliKey === 'string' ? r.tails.cliKey : null, providers: { ...(r.tails.providers || {}) } }; readGen = r.gen != null ? String(r.gen) : null; return last; } return failed(); })
    .catch(() => failed())
    .finally(() => { inflight = null; });
  return inflight;
}

/** the person's last read of one account's or provider's tail (null when unknown) — a usage row's tip and the conversation badges read it */
export function tailOf(id) { const v = last ? ((last.accounts || {})[id] ?? (last.providers || {})[id]) : null; return typeof v === 'string' ? v : null; }

/** a badge's tail: the one it carries (none from this server — an older one's, a stand-in's) else the person's read by its account id */
export function badgeTail(a) { return (a && typeof a.tail === 'string' && a.tail) || tailOf(a && a.accountId); }

/** an accounts answer (GET /api/accounts or the push) with the person's tails laid on its rows and its CLI key */
export function withTails(d, t = last) {
  if (!d || typeof d !== 'object') return d;
  const tails = (t && t.accounts) || {};
  const out = { ...d };
  const prov = (t && t.providers) || {};   // the providers' rows (the pickers' «DeepSeek — API …7c2e») from the same read
  // a provider row in the MERGED list (the app's cache, re-laid at every push) takes the providers' map — a re-keyed provider's new tail
  // replaces the old one on every tab, never the first lay's
  if (Array.isArray(d.accounts)) out.accounts = d.accounts.map((a) => { if (!a) return a; const v = a.type === 'provider' ? prov[a.id] : tails[a.id]; return typeof v === 'string' ? { ...a, tail: v } : a; });
  if (Array.isArray(d.providerRows)) out.providerRows = d.providerRows.map((a) => (a && typeof prov[a.id] === 'string' ? { ...a, tail: prov[a.id] } : a));
  if (d.cliKey && d.cliKey.present) out.cliKey = { ...d.cliKey, tail: (t && t.cliKey) || null };
  return out;
}

/** GET /api/accounts with the person's tails laid on it (the roster's own reads) */
export async function accountsWithTails() {
  const d = await fetchJson('/api/accounts');
  return withTails(d, await askTails(d && d.tailsGen));   // the list first: its word decides whether the last read still holds
}

/** a credential door's refusal in the page's words (B-ee0a: the key reveal, the config export and import — the hub refuses by name
 *  whoever is not the person on this page) → words | null (not such a refusal) */
export function credentialDoorWords(r) {
  const c = r && r.code;
  if (c === 'credential_person_only') return t('Only the person, on this VibeSpace page, can see or take out a whole credential — a conversation, job or automation credential cannot');
  if (c === 'credential_page_only') return t('Only the person, on this VibeSpace page, can see or take out a whole credential');
  return null;
}

/** a PAIRED machine's accounts-status answer with its CLI-key tail laid on (B-ee0a): the answer carries none; the person's read
 *  answers the hub's last probe of it (POST /api/accounts/tails { hostId }). A refused or failed ask lays nothing. */
export async function withHostKeyTail(hostId, r) {
  if (!hostId || !r || !r.cliKey || !r.cliKey.present) return r;
  try {
    const a = await fetchJson('/api/accounts/tails', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hostId }) });
    const v = a && a.ok && a.tails ? a.tails.hostCliKey : null;
    return typeof v === 'string' && v ? { ...r, cliKey: { ...r.cliKey, tail: v } } : r;
  } catch { return r; }
}

/** the API-key rows of an answer whose tail the page does not know yet (a key added since the last ask) */
export function tailsMissing(d, t = last) {
  const tails = (t && t.accounts) || {};
  return !!(d && Array.isArray(d.accounts) && d.accounts.some((a) => a && a.type === 'api' && typeof tails[a.id] !== 'string'));
}
