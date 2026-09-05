// Hello plugin — SERVER side. Runs as its OWN process (forked by VibeSpace's
// plugin loader); talks to the host only over IPC (process.send / 'message').
// Env: VIBESPACE_PLUGIN_ID, VIBESPACE_PLUGIN_DIR, VIBESPACE_PLUGIN_DATA (a
// writable per-plugin state dir), VIBESPACE_PLUGIN_API_VERSION.
'use strict';
const fs = require('fs');
const path = require('path');
const dataDir = process.env.VIBESPACE_PLUGIN_DATA || __dirname;
const counterFile = path.join(dataDir, 'counter.json');
const readCounter = () => { try { return JSON.parse(fs.readFileSync(counterFile, 'utf-8')).n || 0; } catch { return 0; } };
const bump = () => { const n = readCounter() + 1; try { fs.writeFileSync(counterFile, JSON.stringify({ n })); } catch { } return n; };

process.on('message', (m) => {
  if (!m || typeof m !== 'object') return;
  if (m.t === 'route') {
    // /api/plugins/example.hello/x/<path> → here. Reply with { status, body }.
    if (m.method === 'GET' && m.path === '/ping') return process.send({ t: 'route-reply', id: m.id, status: 200, body: { pong: true, count: readCounter() } });
    if (m.method === 'POST' && m.path === '/count') return process.send({ t: 'route-reply', id: m.id, status: 200, body: { count: bump() } });
    return process.send({ t: 'route-reply', id: m.id, status: 404, body: { error: 'no such route: ' + m.method + ' ' + m.path } });
  }
  if (m.t === 'tool') {
    // vibespace-tool-example.hello-hello --name Ada   →  here
    if (m.name === 'hello') return process.send({ t: 'tool-reply', id: m.id, ok: true, output: `hello, ${(m.args && m.args.name) || 'world'}! (from the ${process.env.VIBESPACE_PLUGIN_ID} plugin process, session ${m.session?.sessionId || 'n/a'})` });
    return process.send({ t: 'tool-reply', id: m.id, ok: false, error: 'unknown tool ' + m.name });
  }
  if (m.t === 'shutdown') process.exit(0);
});
process.send({ t: 'hello', api: 1 });
