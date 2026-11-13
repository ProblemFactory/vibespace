// THE KEYBOARD, READ FROM THE VISUAL VIEWPORT (lane duo-build-1 slice 3 — SPEC-v3 rev 3.3 §7 / §5): every class, never a
// width rule (a peer system tied its keyboard fix to ≤ 760 px and the 951 px Duo lost it). A keyboard is up when the
// visual viewport is > 120 px shorter than the layout viewport and not pinch-zoomed (scale ≤ 1.2); the page publishes
//   --kb-inset (how much of the layout viewport's bottom the keyboard covers), --kb-viewport-height, html.vs-kb-open,
// and in the laptop pose (html[data-fold="laptop"], src/lib/fold-ladder.js) SPEC-v3 §5's yielding order from PURE
// laptopYield: the problem strip first (html.vs-kb-nostrip), then the dead zone (--fold-dead), then the bar
// (html.vs-kb-nobar) — and --composer-h, the composer's height the lowered bar sits on.
import { laptopYield } from '../fold-posture.js';

/** THE SEND BUTTON ON SCREEN (lane phone-six): the active window's composer send button whole inside the visual viewport,
 *  else scrolled there — the smallest move that shows it (the visual viewport pans; a phone class only: a desktop's window
 *  may stand past the screen's edge by the person's own choice). → 'in' | 'moved' | 'none' (no phone, no composer). */
export function sendIntoView(vv = window.visualViewport) {
  const vc = document.documentElement.dataset.vc;
  if (!vv || (vc !== 'compact' && vc !== 'regular')) return 'none';
  const b = document.querySelector('.window.window-active .chat-send-btn');
  if (!b || !b.getClientRects().length) return 'none';
  const r = b.getBoundingClientRect(); // layout-viewport coordinates, as vv.offsetLeft / offsetTop are
  const inside = r.left >= vv.offsetLeft - 1 && r.top >= vv.offsetTop - 1 && r.right <= vv.offsetLeft + vv.width + 1 && r.bottom <= vv.offsetTop + vv.height + 1;
  if (inside) return 'in';
  b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  return 'moved';
}

export function installKeyboardInset() {
  const vv = window.visualViewport;
  const root = document.documentElement;
  if (!vv) return null;
  let raf = 0;
  let lastH = vv.height;
  const update = () => {
    raf = 0;
    // lane phone-six (userW: 「输完东西回来找不到发送键」): the keyboard folded — the visual viewport grew back by more than a
    // sliver — and the composer's send button is off the screen (iOS left the page zoomed or scrolled to the field): back
    const grew = vv.height - lastH > 80;
    lastH = vv.height;
    if (grew) sendIntoView(vv);
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
