'use strict';
/** THE `uv-tool` APP KIND (design §3.4) — a Python tool the agent installs itself as the user (`vibespace-app add --kind uv`),
 *  then records; lives in HOME, nothing to replay. PURE, imports nothing; one line in src/app-kinds/index.js. */
module.exports = Object.freeze({ id: 'uv-tool', entry: 'home', cliWord: 'uv', addArgv: Object.freeze(['uv', 'tool', 'install']), removeArgv: Object.freeze(['uv', 'tool', 'uninstall']) });
