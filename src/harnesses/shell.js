'use strict';
// Plain login-shell terminals — no AI, no chat pipeline (S1).
const { BACKEND_CAPS } = require('../backend-caps');
const { ShellAdapter } = require('../adapters/shell');

module.exports = {
  id: 'shell',
  label: 'Terminal',
  kind: 'terminal',
  caps: BACKEND_CAPS.shell,
  Adapter: ShellAdapter,
  adapterConfig: (cfg) => ({ ptyWrapper: cfg.ptyWrapper }),
  wrapper: null,
  Normalizer: null,
  store: null,
  quota: require('./null-quota.js').NULL_QUOTA, // no quota concept
  settingsPrefix: null,
  inject: null,
};
