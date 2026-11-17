'use strict';
// THE OWNER MAP — A STUB WITH THE REAL MODULE'S SIGNATURE (the separation, M1 — the interface, piece B2). The owner map (one
// PURE table: every route, message type, pushed list, timer and store → its owning party) is the owner-map lane's; until
// that module is taken, EVERY row is owned by today's hub — the one party behind the interface on day one. The piece that
// takes the real map deletes this file; nothing chooses between the two.
const TODAY_HUB = 'hub';

/** → the party that owns `row` ({ kind: 'route', method, path } — a page's HTTP exchange; more kinds with the real map) */
function ownerOf(row) { return TODAY_HUB; }   // eslint-disable-line no-unused-vars

module.exports = { ownerOf, TODAY_HUB };
