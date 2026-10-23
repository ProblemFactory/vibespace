// THE CHAT BAR'S PLAIN WORDS (lane door-healthy-chat — the naive studies, 2.369.342: W1/C1 red protocol cards in a person's
// chat, W3/C21 a bare «$0.47» everyone read as a bill). Two status-bar chips say what they are in a person's words:
//   · the cost: «This chat ≈ $0.24 · included in your subscription» — the figure, what it is, and whether it is billed;
//   · the kinds of record the agent's CLI added: «1 record kind this version added — Diagnostics» — the update signal the
//     owner reads (ruling 2026-10-15), ONE quiet chip instead of red cards in the flow; it opens ⚙ Diagnostics.
// PURE — imports nothing, touches no DOM (node-imported by scripts/test-status-bar-chips.mjs); the caller passes t.

/** The billing basis of a conversation from its `auth` (server.js sessionAuth → the harness's billingIdentity):
 *  'subscription' (a plan's login: usage is not billed per use), 'api' (an API key: billed per use), or null (a pool, an
 *  unknown login — no claim either way). */
export function costBasisOf(auth) {
  const s = auth && typeof auth.source === 'string' ? auth.source : '';
  if (s === 'subscription' || s === 'codex-subscription') return 'subscription';
  if (s === 'api-key' || s === 'api-console' || s === 'api-other') return 'api';
  return null;
}

/** The cost chip: its words (the figure always beside them), its tooltip, and whether its colour may warn (`tier`: only
 *  where the figure IS a bill or nobody knows; a subscription's figure is quiet). */
export function costChipWords(usd, basis, t) {
  const amount = '$' + (Number(usd) || 0).toFixed(2);
  const what = t('An estimate of this conversation\'s usage at API prices, as the agent\'s program reports it.');
  if (basis === 'subscription') return { text: t('This chat ≈ {usd} · included in your subscription', { usd: amount }), title: what + ' ' + t('Your subscription covers it — nothing is billed per use.'), tone: 'quiet' };
  if (basis === 'api') return { text: t('This chat ≈ {usd} · billed per use (API key)', { usd: amount }), title: what + ' ' + t('This conversation runs on an API key, which is billed per use.'), tone: 'tier' };
  return { text: t('This chat ≈ {usd}', { usd: amount }), title: what + ' ' + t('Whether it is billed depends on the account this conversation runs on.'), tone: 'tier' };
}

/** The record-kinds chip: null without kinds; else its words and a tooltip naming each kind (the CLI build beside it). */
export function addedKindsChipWords(kinds, t) {
  const list = Array.isArray(kinds) ? kinds.filter((k) => k && k.name) : [];
  if (!list.length) return null;
  const n = list.length;
  const text = n === 1 ? t('1 record kind this version added — Diagnostics') : t('{n} record kinds this version added — Diagnostics', { n });
  const lines = list.slice(0, 12).map((k) => (k.kind === 'fields' ? t('{name}: new fields', { name: k.name }) : t('{name}: a new record', { name: k.name })) + (k.cli ? ` (${k.cli})` : ''));
  if (n > 12) lines.push(t('…and {n} more', { n: n - 12 }));
  const title = t('The agent\'s program sent records VibeSpace does not know yet — most likely it updated to a version this release has not registered. Nothing changes for the conversation; they are listed in ⚙ Diagnostics. Click to open it.') + '\n' + lines.join('\n');
  return { text, title };
}
