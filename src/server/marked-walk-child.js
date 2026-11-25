'use strict';
/**
 * THE MARKED WALK's CHILD (src/server/marked-walk.js starts it through the starter — never the hub's process): src/proc-identity.js
 * membersOf HERE, its rows handed back as PIDS AND START TIMES only — one JSON line on stdout, and it ends. argv: <mark> <since>
 * <pgid> <first pids, comma-separated> [<a suite's stand-in /proc root>]. It throws when it is not its own process.
 */
if (require.main !== module) throw new Error('src/server/marked-walk-child.js runs only as its own process (src/server/marked-walk.js starts it through the starter)');
const PI = require('../proc-identity.js');
const [mark = '', since = '0', pgid = '0', first = '', procRoot = ''] = process.argv.slice(2);
const found = PI.membersOf({ mark, since: Number(since) || 0, pgid: Number(pgid) || 0, first: String(first).split(',').map(Number).filter((n) => n > 0) }, procRoot ? { procRoot } : undefined);
const s = found.scan || null;
process.stdout.write(JSON.stringify({ rows: found.map((id) => [Number(id.pid), Number(id.starttime)]), scan: s ? { scanned: s.scanned, total: s.total, unreadable: s.unreadable, others: s.others, ending: s.ending || 0, cut: !!s.cut, ...(s.unread ? { unread: String(s.unread) } : {}) } : null }) + '\n');
