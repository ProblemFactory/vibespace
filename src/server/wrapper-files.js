// Resolve the CHAT WRAPPER's actual buffer/sidecar file pair for a session
// (2.339.2, the 设备运维大师 stuck-thinking incident). The expected pair is
// <BUFFERS_DIR>/<id>.{buf,json} — but sessions born in the 2.302.0
// counter-collision window carry a DIFFERENT id inside the wrapper argv/env
// than their socket/meta filename (7/15 fleet sessions measured back then),
// so the sidecar the wrapper actually maintains lives under the OTHER id and
// every restart silently restored nothing for them: streaming state, goal,
// todos, running-agent watchers and the buffer replay all vanished into a
// catch{}. Fallback: the dtach MASTER process of the session's socket carries
// the wrapper argv, and argv[2] IS the buffer path — read it out of /proc
// (Linux; best-effort, returns the expected pair when anything fails).
const fs = require('fs');
const path = require('path');

function resolveWrapperFiles(BUFFERS_DIR, id, sockPath) {
  const expected = { buf: path.join(BUFFERS_DIR, id + '.buf'), sidecar: path.join(BUFFERS_DIR, id + '.json') };
  try {
    if (fs.existsSync(expected.sidecar)) return expected;
    if (!sockPath) return expected;
    for (const pidDir of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(pidDir)) continue;
      let cmd = '';
      try { cmd = fs.readFileSync(path.join('/proc', pidDir, 'cmdline'), 'utf-8'); } catch { continue; }
      // the dtach MASTER: `dtach -c <sockPath> … chat-wrapper.js <buf> <sidecar> …`
      if (!cmd.includes(sockPath) || !cmd.includes('dtach\0-c\0') || !cmd.includes('chat-wrapper.js')) continue;
      const argv = cmd.split('\0');
      const buf = argv.find((a) => a.endsWith('.buf'));
      if (buf) {
        console.log(`[restore] ${id}: wrapper files resolved via /proc (counter-collision session) → ${path.basename(buf)}`);
        return { buf, sidecar: buf.replace(/\.buf$/, '.json') };
      }
    }
  } catch { }
  return expected;
}

module.exports = { resolveWrapperFiles };
