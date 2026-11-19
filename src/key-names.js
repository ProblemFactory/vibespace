'use strict';
// THE DEFAULT KEY NAME (B-ba7d — the owner's decision 2026-11-18; one function, B-ee0a smalls). PURE.
// A key added without a name was once named «API key …<its tail>» (accounts add()); that tail never leaves in a NAME — a name
// travels in every list, push, session payload, refusal and usage row. src/accounts.js and src/usage-history.js both ask HERE.

/** the name an account is SHOWN by: a stored name in the old default shape for ITS OWN tail reads «API key» */
function publicNameOf(a) { const n = String((a && a.name) || ''); return a && a.tail && n === 'API key …' + a.tail ? 'API key' : n; }
/** a name STORED elsewhere (the usage ledger's events, an older export — written before the rename) in the old default shape
 *  «API key …<8>» → «API key» */
function maskDefaultKeyName(name) { const n = String(name == null ? '' : name); return /^API key …\S{8}$/.test(n) ? 'API key' : n; }

module.exports = { publicNameOf, maskDefaultKeyName };
