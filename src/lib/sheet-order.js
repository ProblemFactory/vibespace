// THE STYLESHEETS' ORDER (B-78db line 914's cure — 主开发 r4115 MUST 1). The launch cure (public/index.html) puts the six
// stylesheet links in the BODY, after the inline loading screen, so the first paint is ours and not WebKit's white. But every
// style injected at runtime goes to the end of the HEAD: themes.js _injectStyle (a person's custom theme, a plugin's theme),
// doc-window-ui.js's rules, design-canvas.js ensureCanvasStyle, and any plugin that appends to the head by itself. Each of
// them ties with the sheets on weight (themes.js writes [data-theme="custom-…"] (0,1,0) against style.css's
// `:root, [data-theme="dark"]` (0,1,0)), and a tie is won by the LATER rule in the document. At the release the links stood
// in the head, so the injected rule came later and won; with the links in the body the sheets come later and win. Every
// custom theme then fell back to the dark defaults, on every device.
// THE CURE keeps the launch and restores the release's order for everybody: at the bundle's start, each body link gets a
// clone at its release place in the head (after <title>, before the lazy-bundle link), in the same order. The body twin
// goes only once the clone's sheet is there (its load event, or its .sheet seen on a later frame). Nothing stands unstyled
// at any moment. A clone that fails to load is dropped and its twin kept, so the page keeps its styles in the body order.
// From then on the document is the release's, so a style appended to the head by anybody, ours or a plugin's, comes after
// the sheets and wins its ties exactly as at the release. A style inserted at the head's start loses its ties, as it did.
// THE MOMENT BETWEEN (the short round's reading): while a clone and its twin both stand, the body twin is the later and wins ties,
// so a theme applied at boot reads the default ground until the clone loads. It corrects itself when the twin goes, and the
// loading screen covers it: no bug. A clone that fails, or whose sheet never shows within its frames, leaves its twin: that one
// sheet keeps the body's order until a reload. Both are SAID through `onMiss` (one telemetry line, src/client.js).
// «Ready» is a sheet whose rules can be read: Gecko gives a loading link a .sheet whose cssRules throw until it loads.
// The census of every runtime style door in src/ is in docs/kb-features.md «THE STYLESHEETS' ORDER».

/** The links the launch placed in the body → clones at their release place in the head; returns how many. */
export function restoreSheetOrder(doc = document, win = window, { onMiss = null } = {}) {
  const head = doc.head, body = doc.body;
  if (!head || !body) return 0;
  const twins = [...body.querySelectorAll(':scope > link[rel="stylesheet"]')];
  if (!twins.length) return 0;
  const anchor = head.querySelector(':scope > link[rel="vs-lazy-bundle"]');
  const raf = (f) => (win && typeof win.requestAnimationFrame === 'function' ? win.requestAnimationFrame(f) : setTimeout(f, 16));
  const ready = (sheet) => { try { return !!sheet && sheet.cssRules.length >= 0; } catch { return false; } };
  const miss = (twin, why) => { try { onMiss?.({ href: twin.getAttribute?.('href') || twin.attrs?.href || '', why }); } catch { } };
  for (const twin of twins) {
    const clone = twin.cloneNode(false);
    head.insertBefore(clone, anchor || null);
    const drop = () => { if (twin.isConnected && clone.isConnected) twin.remove(); };
    clone.addEventListener('load', drop, { once: true });
    clone.addEventListener('error', () => { if (clone.isConnected) { clone.remove(); miss(twin, 'error'); } }, { once: true });
    let n = 0;
    const seen = () => { if (!twin.isConnected || !clone.isConnected) return; if (ready(clone.sheet)) { drop(); return; } if (++n < 300) raf(seen); else miss(twin, 'frames'); };
    raf(seen);
  }
  return twins.length;
}
