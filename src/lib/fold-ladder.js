// THE POSTURE LADDER'S OWNER (lane duo-build-1 slice 4 — SPEC-v3 rev 3.3 §1.6): <html data-fold> = none | pending | book |
// laptop, driven by the six media queries of PURE src/fold-posture.js (FOLD_MQ) — matchMedia is the ONLY event source the
// product can count on (`navigator.devicePosture` lives only in a secure context; it is listened to when present, never
// required). `resize` is a RE-READ trigger, never a fold signal (whether a fold resizes is unproven). Each trigger re-reads
// all six queries, asks targetOf, and walks foldStep's timing: into book / laptop after 120 ms, out after 300 ms, pending at
// once and back to none after 1.5 s without segments (counted once per timeout: `fold-pending-timeout`). Book / laptop
// publish the geometry the stylesheet places by: --seg-edge (the shared edge: env() first, the regular class's 475.5 /
// innerHeight − 475.5 fallback) and --fold-seam. Nothing is persisted (SPEC-v3 §0.9 / §7).
import { FOLD_MQ, targetOf, foldStep, seamOf, laptopYield } from '../fold-posture.js';
import { track } from './telemetry-client.js';

/** Read env(viewport-segment-*) through a probe element (the CSS env() of the current segments; NaN when unresolved). */
function segEdge(axis) {
  const p = document.createElement('div');
  p.style.cssText = `position:fixed;visibility:hidden;pointer-events:none;left:0;top:0;width:${axis === 'v' ? 'env(viewport-segment-bottom 0 0, -1px)' : 'env(viewport-segment-right 0 0, -1px)'};height:1px`;
  document.documentElement.appendChild(p);
  const w = p.getBoundingClientRect().width;
  p.remove();
  return w > 0 ? w : NaN;
}

export function installFoldLadder(app) {
  const mqs = {};
  for (const [k, q] of Object.entries(FOLD_MQ)) { try { mqs[k] = window.matchMedia(q); } catch { mqs[k] = null; } }
  const root = document.documentElement;
  let state = 'none', timer = null, pendingTimer = null;
  const read = () => Object.fromEntries(Object.entries(mqs).map(([k, m]) => [k, !!m?.matches]));
  const apply = (to) => {
    state = to;
    root.dataset.fold = to;
    if (to === 'book') {
      const s = seamOf({ edge: segEdge('h') });
      root.style.setProperty('--seg-edge', s.edge + 'px');
      root.style.setProperty('--fold-seam', s.width + 'px');
    } else if (to === 'laptop') {
      const y = segEdge('v');
      const L = laptopYield({ K: 0, innerHeight: window.innerHeight, yFold: y });
      root.style.setProperty('--seg-edge', L.yFold + 'px');
    } else { root.style.removeProperty('--seg-edge'); root.style.removeProperty('--fold-seam'); }
    app._mobileNav?.bar?.update?.();
    try { window.__vsOp?.('fold', { to }); } catch { }
    window.dispatchEvent(new CustomEvent('vs-fold', { detail: { to } }));
  };
  const tick = () => {
    clearTimeout(timer); timer = null;
    const target = targetOf(read(), app._vc);
    const step = foldStep({ state, target });
    if (step.to === null) return;
    const go = () => {
      timer = null;
      // the target must still hold when the settle ends (a fold passes through transitional readings)
      if (targetOf(read(), app._vc) !== step.to) { tick(); return; }
      clearTimeout(pendingTimer); pendingTimer = null;
      apply(step.to);
      if (step.to === 'pending') pendingTimer = setTimeout(() => {
        pendingTimer = null;
        if (state !== 'pending') return;
        try { track('event', 'fold-pending-timeout'); } catch { }
        apply('none');
      }, step.timeout);
    };
    if (step.delayMs) timer = setTimeout(go, step.delayMs); else go();
  };
  for (const m of Object.values(mqs)) { try { m?.addEventListener('change', tick); } catch { } }
  window.addEventListener('resize', tick);
  window.addEventListener('vs-viewport-class', tick); // the class decides pending (regular only) and compact ignores folded
  try { navigator.devicePosture?.addEventListener?.('change', tick); } catch { }
  root.dataset.fold = 'none';
  tick();
  return { state: () => state, tick };
}
