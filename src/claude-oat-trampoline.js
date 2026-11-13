'use strict';
/**
 * THE TRAMPOLINE (lane cli-self-measure, acceptance r3 item 1 — the record's stream). The FIRST process the tracer starts
 * (src/claude-oat-probe.js copies this file into the run's own scratch, compares the copy with these bytes before EVERY launch —
 * a difference voids `launcher-changed` — and runs it under node). strace writes its record to ITS stderr — a socket the
 * measurement holds: a socket cannot be reopened through /proc, and no file of it exists. This process inherits that stderr, so it
 * hands the vendor's binary a DIFFERENT one (a file in the run's scratch): the binary, and everything it starts, never inherits the
 * record — its own writes and an accident cannot damage it. That is what it buys, not more: the measurement is a witness of an
 * honest build's conduct, not a sandbox against a build that sets out to deceive it (the probe's header says the limit). It writes
 * nothing itself (no warnings, an uncaught error exits 70 silently); the binary's stdin / stdout are the tracer's (the
 * measurement's stream-json sockets), passed through as they are.
 * argv: <the binary's stderr file> [--pty] <the binary> <its args…>
 * --pty (lane oat-add-door, the mint variant only): the binary runs in a pty — util-linux script(1), which runs its command through
 * /bin/sh -c (the binary's path and args each single-quoted): `setup-token` prints nothing on a pipe (measured, 2.1.321). Still ONE
 * spawn, the same stdio: the tracer's stdin / stdout go to script, the binary's own stdio is the pty, never the record.
 */
const { spawn } = require('child_process');
const fs = require('fs');

process.on('uncaughtException', () => process.exit(70));
const [errFile, ...rest] = process.argv.slice(2);
const pty = rest[0] === '--pty';
const [cli, ...cliArgs] = pty ? rest.slice(1) : rest;
const q = (x) => `'${String(x).replace(/'/g, `'\\''`)}'`;
const bin = pty ? 'script' : cli;
const args = pty ? ['-qfec', [cli, ...cliArgs].map(q).join(' '), '/dev/null'] : cliArgs;
const err = fs.openSync(errFile, 'a', 0o600);
const c = spawn(bin, args, { stdio: [0, 1, err] });
c.on('error', () => process.exit(127));
c.on('exit', (code) => process.exit(code == null ? 128 : code));
