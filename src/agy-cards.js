'use strict';
// THE CARDS OF SUBS THAT ALREADY RAN, READ OFF THE HUB'S LOOP (B-299b A1, lane bl-loop-a — the row: «opening or ending a turn of
// an Antigravity conversation walks its store synchronously: single holds of 8 to 11 s»; 37.8 s over 4 holds measured). This
// runs in the hub's «agy-cards» worker (src/agy-cards-worker.js — the hub's own, never the device agent's bundle: the
// architecture suite's bundle census): the batch is the ONE gate's own (src/agy-store-fs.js snapshotsOf — the store's reads
// + agy-store's snapshotOf per spawn, each answer with its not-found signal and whether a read failed).
const { snapshotsOf } = require('./agy-store-fs');

module.exports = { snapshotsOf };
