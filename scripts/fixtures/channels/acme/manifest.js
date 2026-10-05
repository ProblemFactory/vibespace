'use strict';
// scripts/fixtures/channels/acme/manifest.js — THE FAKE VENDOR's manifest (lane dc-channels-manifest proof,
// scripts/test-channel-manifest.mjs): the same shape as src/channels/<vendor>/manifest.js — PURE, its settings
// table (budget / pace + an option row), its integration row + its own validator, its adapter's repo path.
const t = (s) => s;
const i18nKey = (s) => s;
const settings = {
  vendor: 'acme', vendorName: t('Acme'),
  rows: [
    { key: 'budgetAcmePerMin', role: 'budget', type: 'number', default: 30, min: 5, max: 300, step: 5, label: t('Acme: requests per minute per account'), description: t('Acme budget.') },
    { key: 'acmeRequestsPerSec', role: 'pace', type: 'number', default: 2, min: 1, max: 10, step: 1, label: t('Acme: requests per second per account'), description: t('Acme pace.') },
  ],
  options: [
    { key: 'acmeNameField', role: 'nameField', type: 'enum', default: 'none', options: [{ value: 'none', label: t('Name only') }, { value: 'department', label: t('Name (department)') }], label: t('Acme: how people are named'), description: t('Acme names.') },
  ],
};
function integrationRow({ V, okV, bad }) {
  const acmeKey = (v) => (/^acme_[a-z0-9]{6,}$/.test(String(v)) ? okV : bad('an Acme key starts with acme_'));
  return {
    id: 'acme', label: 'Acme',
    fields: [
      { key: 'clientId', label: i18nKey('Client ID'), secret: false, required: true, help: i18nKey('Acme console.'), validate: acmeKey },
      { key: 'clientSecret', label: i18nKey('Client secret'), secret: true, required: true, help: i18nKey('Same page.'), validate: V.minLen(8) },
    ],
    delegate: { to: 'drive-presets', prefer: 'channels', multi: true },   // the Gmail row's shape: no env of its own
    setup: null,
    test: { kind: 'shape-only', describe: i18nKey('Checks the shape.'), caveat: i18nKey('Shape only.') },
    consumers: ['scripts/fixtures/channels/acme/adapter.js'],
    usedBy: i18nKey('Used by the Acme channel'),
    bindsPerAccount: true,
    clientHint: i18nKey('The Acme app this account signs in through.'),
    docs: 'docs/design-communication-panel.zh.md',
  };
}
module.exports = { kind: 'acme', adapter: 'scripts/fixtures/channels/acme/adapter.js', settings, integrationRow };
