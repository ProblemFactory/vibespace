'use strict';
/** THE `npm` APP KIND (design §3.4) — a node tool the agent installs itself as the user into ~/.local (`vibespace-app add
 *  --kind npm`), then records; lives in HOME, nothing to replay. PURE, imports nothing; one line in src/app-kinds/index.js. */
module.exports = Object.freeze({ id: 'npm', entry: 'home', cliWord: 'npm', addArgv: Object.freeze(['npm', 'install', '-g', '--prefix', '~/.local']), removeArgv: Object.freeze(['npm', 'uninstall', '-g', '--prefix', '~/.local']) });
