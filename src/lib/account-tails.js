// THE KEY TAILS ON THE PAGE (B-ba7d — the owner's decision 2026-11-18): GET /api/accounts and its accounts-updated push carry
// NO key tail; the page asks the PERSON's read (POST /api/accounts/tails, behind the person verdict — src/routes/account-tails.js)
// and lays the tails onto the rows it already holds. ONE cache for the page; one ask in flight at a time; a refused or failed ask
// lays nothing (a row then reads «API key» with no characters — never a wrong one).
import { fetchJson } from './utils.js';

let last = { accounts: {}, cliKey: null, providers: {} };
let inflight = null;

/** ask the person's read once (coalesced) → { accounts: { [id]: tail }, cliKey } (the last good answer on a refusal) */
export function askTails() {
  if (!inflight) {
    inflight = fetchJson('/api/accounts/tails', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then((r) => { if (r && r.ok && r.tails && typeof r.tails === 'object') last = { accounts: { ...(r.tails.accounts || {}) }, cliKey: typeof r.tails.cliKey === 'string' ? r.tails.cliKey : null, providers: { ...(r.tails.providers || {}) } }; return last; })
      .catch(() => last)
      .finally(() => { inflight = null; });
  }
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
  const [d, t] = await Promise.all([fetchJson('/api/accounts'), askTails()]);
  return withTails(d, t);
}

/** the API-key rows of an answer whose tail the page does not know yet (a key added since the last ask) */
export function tailsMissing(d, t = last) {
  const tails = (t && t.accounts) || {};
  return !!(d && Array.isArray(d.accounts) && d.accounts.some((a) => a && a.type === 'api' && typeof tails[a.id] !== 'string'));
}
