// THE KEYBOARD, READ FROM THE VISUAL VIEWPORT (lane duo-build-1 slice 3 — SPEC-v3 rev 3.3 §7 / §5): every class, never a
// width rule (a peer system tied its keyboard fix to ≤ 760 px and the 951 px Duo lost it). A keyboard is up when the
// visual viewport is > 120 px shorter than the layout viewport and not pinch-zoomed (scale ≤ 1.2); the page publishes
//   --kb-inset (how much of the layout viewport's bottom the keyboard covers), --kb-viewport-height, html.vs-kb-open,
// and in the laptop pose (html[data-fold="laptop"], src/lib/fold-ladder.js) SPEC-v3 §5's yielding order from PURE
// laptopYield: the problem strip first (html.vs-kb-nostrip), then the dead zone (--fold-dead), then the bar
// (html.vs-kb-nobar) — and --composer-h, the composer's height the lowered bar sits on.
import { laptopYield } from '../fold-posture.js';

export function installKeyboardInset() {
  const vv = window.visualViewport;
  const root = document.documentElement;
  if (!vv) return null;
  let raf = 0;
  const update = () => {
    raf = 0;
    const lost = window.innerHeight - vv.height;
    const open = lost > 120 && vv.scale <= 1.2;
    const inset = open ? Math.max(0, Math.round(window.innerHeight - (vv.height + vv.offsetTop))) : 0;
    root.style.setProperty('--kb-inset', inset + 'px');
    root.style.setProperty('--kb-viewport-height', Math.round(vv.height) + 'px');
    root.classList.toggle('vs-kb-open', open);
    if (root.dataset.fold === 'laptop') {
      const area = document.querySelector('.window.window-active .chat-input-area');
      const bar = document.querySelector('.window.window-active .chat-status-bar');
      root.style.setProperty('--composer-h', Math.round((area?.offsetHeight || 56) + (bar?.offsetHeight || 48)) + 'px');
      const y = laptopYield({ K: open ? lost : 0, innerHeight: window.innerHeight, yFold: parseFloat(getComputedStyle(root).getPropertyValue('--seg-edge')) });
      root.classList.toggle('vs-kb-nostrip', !y.strip);
      root.classList.toggle('vs-kb-nobar', !y.bar);
      root.style.setProperty('--fold-dead', y.dead + 'px');
    } else {
      root.classList.remove('vs-kb-nostrip', 'vs-kb-nobar');
    }
  };
  const soon = () => { if (!raf) raf = requestAnimationFrame(update); };
  vv.addEventListener('resize', soon);
  vv.addEventListener('scroll', soon);
  window.addEventListener('vs-fold', soon);
  update();
  return { update };
}
