'use strict';
/** THE REQUESTS THAT ARE NOT AN APP KIND — what a person or an agent asks of the apps of a machine besides installing a
 *  kind (search, the package sources, remove, refresh, adopt, replay, move, forget). PURE, imports nothing; src/app-kinds/
 *  index.js lists `search` first and the rest after the kinds (the derived lists keep their order). */
const row = (r) => Object.freeze(r);
const search = row({ id: 'search', plan: true });
const requests = Object.freeze([
  row({ id: 'source', plan: true, request: true, agent: true, card: 'source', keeps: 'system', from: 'source', doing: 'adding the source' }),
  row({ id: 'source-remove', plan: true, request: true }),
  row({ id: 'remove', plan: true, request: true, agent: true, sysView: true, card: 'remove', from: 'none', doing: 'removing' }),
  row({ id: 'refresh', plan: true, request: true, sysView: true }),
  row({ id: 'adopt', plan: true, request: true, closurePlan: true, plansWith: 'apt' }), // keep installed packages: apt's planner + request words
  row({ id: 'replay', plan: true, request: true }),
  row({ id: 'move', plan: true, request: true, sysView: true }), // design 019 M2: the host apps INTO the app system — the USER's click
  row({ id: 'forget', plan: true }),
]);
module.exports = { search, requests };
