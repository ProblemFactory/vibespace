'use strict';
// Lazy singleton bridge for the decomposed src/server modules: wraps a
// `() => singleton` getter in a Proxy so extracted code keeps calling
// `hosts.foo()` VERBATIM on late-boot singletons (created after the module's
// create() ran). Re-resolves per property access — never caches, so a
// re-created singleton is always the live one. NOT for mutable `let` bindings
// whose null-ness is meaningful (a Proxy is always truthy and erases the null
// check) — those cross as explicit get*() calls instead (deviceMgr rule).
const mk = (get) => new Proxy({}, { get: (_, k) => { const o = get(); if (!o) return undefined; const v = o[k]; return typeof v === 'function' ? v.bind(o) : v; } });
module.exports = { mk };
