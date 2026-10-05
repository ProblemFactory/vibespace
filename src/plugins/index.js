// THE ONE LIST of built-in plugins (lane dc-plugins, 2026-10-04). A built-in plugin = one file in this folder
// declaring { id, label, description, provides, create(h) } (the contract in src/plugins.js, validated when the
// PluginManager registers it) + ONE line here. Order = the ⚙ → Plugins panel order.
module.exports = [
  require('./tailscale.js'),
  require('./frp.js'),
  require('./opencode-serve.js'),
];
