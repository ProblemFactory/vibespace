'use strict';
// Lazy singleton bridge for the decomposed src/server modules: wraps a
// `() => singleton` getter in a Proxy so extracted code keeps calling
// `hosts.foo()` VERBATIM on late-boot singletons (created after the module's
// create() ran). Re-resolves per property access — never caches, so a
// re-created singleton is always the live one. NOT for mutable `let` bindings
// whose null-ness is meaningful (a Proxy is always truthy and erases the null
// check) — those cross as explicit get*() calls instead (deviceMgr rule).
// set trap (2.343.0, the 7th decomposition incident — publish dead since 拆分
// #12): `proxy.plugins = x` with only a get trap silently wrote to the dummy
// TARGET, never the real singleton; every extracted `obj.prop = value` on a
// mk()-wrapped singleton was a no-op. The set trap forwards to the live
// instance (and drops the write when it doesn't exist yet — same semantics as
// calling a method too early).
const mk = (get) => new Proxy({}, {
  get: (_, k) => { const o = get(); if (!o) return undefined; const v = o[k]; return typeof v === 'function' ? v.bind(o) : v; },
  set: (_, k, v) => { const o = get(); if (o) o[k] = v; return true; },
});
module.exports = { mk };
