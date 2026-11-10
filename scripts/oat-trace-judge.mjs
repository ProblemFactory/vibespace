#!/usr/bin/env node
// oat-trace-judge — the hub's measurement fence (src/claude-oat-probe.js), run on a trace of YOUR OWN (lane cli-self-measure,
// acceptance r3: «pure-parser pins over synthetic tracer lines that I can re-run with lines of my own»). It runs NO binary: it
// reads `strace -f --always-show-pid -tt -q -y` text from stdin (or a file) and prints what the measurement would conclude:
//   the grammar (joined / cut / dangling / unparsed), the record's gap (recordGap — VOID when it cannot account for every call),
//   the file fence (guardedReadsOf: guarded roots, deny / allow roots, another process's /proc by resolution AND by argument),
//   the doors (io_uring & co. that succeeded), and the network fence (outboundOf on every line).
// usage: node scripts/oat-trace-judge.mjs [--port=N] [--deny=/a,/b] [--allow=/c] [--guarded=/d] [--killed] [--not-ended] [file]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const P = require(path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'src', 'claude-oat-probe.js'));
const arg = (n) => { const a = process.argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : null; };
const list = (n) => (arg(n) || '').split(',').filter(Boolean);
const file = process.argv.slice(2).find((x) => !x.startsWith('--'));
const text = fs.readFileSync(file || 0, 'utf8');
const p = P.parseTrace(text);
const lines = p.lines;
const gap = P.recordGap(p, { ended: !process.argv.includes('--not-ended'), killed: process.argv.includes('--killed') });
const reads = P.guardedReadsOf(lines, list('guarded'), { deny: list('deny'), allow: list('allow') });
const doors = P.doorsOpenedOf(lines);
const port = Number(arg('port') || 0);
const escapes = text.split('\n').map((l) => P.outboundOf(l, { port })).filter((o) => o && !o.netlink);
const verdict = gap ? gap.void : reads.length ? 'guarded-read' : doors.length ? 'door' : escapes.length ? 'aborted' : 'clean';
console.log(JSON.stringify({ verdict, gap, guardedReads: reads, doors, escapes, joined: p.joined, cut: p.cut, dangling: p.dangling, unparsed: p.unparsed, root: p.root, rootExited: p.root !== null && p.exits.has(p.root) }, null, 1));
