#!/usr/bin/env node
// Print the manifest of a WORKSPACE Slack app (design 018): the admin pastes it into api.slack.com/apps → Create New
// App → From a manifest, then copies the Client ID / Secret (Basic Information) into the cluster preset or the
// account dialog's "Your workspace app".
//   node scripts/slack-manifest.mjs --relay https://<host>/<path>/ [--relay <another>] [--name "Acme"]
// The relay page (docs/slack-relay/) or an instance's own https callback (https://<host>/api/channels/oauth/cb/slack)
// is registered as a redirect URL; the user scopes are slack-manifest.js USER_SCOPES.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../src/channels/slack-manifest.js');
const args = process.argv.slice(2);
const relays = [];
let name = '';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--relay' && args[i + 1]) relays.push(args[++i]);
  else if (args[i] === '--name' && args[i + 1]) name = args[++i];
  else { console.error('usage: node scripts/slack-manifest.mjs --relay https://… [--relay https://…] [--name "Acme"]'); process.exit(2); }
}
const m = M.manifestFor({ ownerName: name, redirectUrls: relays });
if (relays.length && !(m.oauth_config.redirect_urls || []).length) { console.error('slack-manifest: every --relay must be an https URL'); process.exit(2); }
console.log(JSON.stringify(m, null, 2));
