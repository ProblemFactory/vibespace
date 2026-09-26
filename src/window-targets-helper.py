#!/usr/bin/env python3
"""
THE BOUNDED AT-SPI TRAVERSAL (docs/design-agent-browser-v2 §4.9, P9).

This file is the ONLY place VibeSpace speaks AT-SPI. It is never imported by
the server: src/window-targets.js spawns it as a SUBPROCESS with one JSON
request on stdin and reads one JSON reply from stdout, under a wall-clock
deadline the parent enforces with SIGKILL. Inside, every D-Bus method call is
bounded by libatspi's own timeout (`Atspi.set_timeout`, the `callTimeoutMs`
of the request) and the whole traversal by a NODE BUDGET — so an application
that stops answering its a11y bus costs one timeout per node it owns, is
reported as an UNREADABLE subtree, and never holds the server's or the
daemon's event loop (§0's law: FUSE threadpool, execFileSync sweep freeze).

Why python3 + GObject introspection and not a node D-Bus client (§12.33,
measured 2026-09-21, numbers in docs/kb-design-lessons.md §18): the GI path
goes through libatspi, which carries the AT-SPI protocol's own cache; a raw
D-Bus client pays one round trip per accessor per node and has no cache. The
fork tax is paid ONCE per traversal, not per node.

Requests (one JSON object on stdin):
  {"op":"probe"}
  {"op":"apps"}
  {"op":"snapshot","pids":[…],"budget":600,"callTimeoutMs":800,"maxDepth":40,"text":true}
  {"op":"act","pid":N,"path":[…],"expect":{"role":"…","name":"…"},
   "verb":"do_action"|"set_text"|"insert_text"|"read","action":"click"|0,"text":"…"}
  {"op":"focused","pids":[…]}                      the node holding keyboard focus (type's default target)
  {"op":"screenshot","out":"/p.png","bounds":{x,y,w,h}}   pixels of the DISPLAY in the env (the fallback)
  {"op":"windowshot","out":"/p.png","origin":{x,y},"w":W,"h":H,"windows":[{id,x,y,w,h}]}
                                                   lane E (D7): the app's OWN X windows, each grabbed as
                                                   itself (a foreign GdkWindow per xid — on the xpra rung the
                                                   ROOT is composited offscreen and grabs black), composed by
                                                   root position onto a W×H canvas whose (0,0) is `origin`
  act verb "focus"                                 lane E: Component.grab_focus on the node (an injected
                                                   `type` then lands in it — Chrome's entries have no
                                                   EditableText)
The reply is ALWAYS a JSON object with `ok`; a refusal carries `code` + `why`.
Exit 0 whenever a reply was written; 3 when AT-SPI itself is unavailable.
"""
import json
import os
import sys
import time
import warnings

warnings.simplefilter("ignore")

REPLY_VERSION = 1


def reply(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False))
    sys.stdout.write("\n")
    sys.stdout.flush()


def read_request():
    raw = sys.stdin.read()
    if not raw.strip():
        return {"op": "probe"}
    return json.loads(raw)


try:
    import gi  # noqa: E402
    gi.require_version("Atspi", "2.0")
    from gi.repository import Atspi  # noqa: E402
except Exception as e:  # the machine has no AT-SPI binding — a NAMED refusal, not a crash
    reply({"ok": False, "code": "a11y_unavailable", "why": "python3 gi Atspi not importable: %s" % e, "v": REPLY_VERSION})
    sys.exit(3)


def safe(fn, default=None):
    try:
        return fn()
    except Exception:
        return default


def role_name(acc):
    return safe(lambda: acc.get_role_name(), "unknown")


def state_names(acc):
    try:
        ss = acc.get_state_set()
        out = []
        for s in ss.get_states():
            n = s.value_nick if hasattr(s, "value_nick") else str(s)
            out.append(n)
        return out
    except Exception:
        return []


def extents(acc):
    try:
        comp = acc.get_component_iface() if hasattr(acc, "get_component_iface") else acc.get_component()
        if comp is None:
            return None
        r = Atspi.Component.get_extents(comp, Atspi.CoordType.SCREEN)
        return {"x": r.x, "y": r.y, "w": r.width, "h": r.height}
    except Exception:
        return None


def action_iface(acc):
    return safe(lambda: acc.get_action_iface() if hasattr(acc, "get_action_iface") else acc.get_action())


def editable_iface(acc):
    return safe(lambda: acc.get_editable_text_iface() if hasattr(acc, "get_editable_text_iface") else acc.get_editable_text())


def text_iface(acc):
    return safe(lambda: acc.get_text_iface() if hasattr(acc, "get_text_iface") else acc.get_text())


def actions_of(acc):
    a = action_iface(acc)
    if a is None:
        return None
    try:
        n = Atspi.Action.get_n_actions(a)
        return [safe(lambda i=i: Atspi.Action.get_action_name(a, i), "") for i in range(n)]
    except Exception:
        return None


def text_of(acc, cap=200):
    t = text_iface(acc)
    if t is None:
        return None
    try:
        n = Atspi.Text.get_character_count(t)
        if n <= 0:
            return ""
        return Atspi.Text.get_text(t, 0, min(n, cap))
    except Exception:
        return None


def desktop_apps():
    d = Atspi.get_desktop(0)
    n = safe(lambda: d.get_child_count(), 0) or 0
    out = []
    for i in range(n):
        app = safe(lambda i=i: d.get_child_at_index(i))
        if app is None:
            continue
        out.append({"index": i, "name": safe(lambda: app.get_name(), ""), "pid": safe(lambda: app.get_process_id(), None),
                    "children": safe(lambda: app.get_child_count(), None), "acc": app})
    return out


def op_probe(req):
    t0 = time.time()
    apps = desktop_apps()
    return {"ok": True, "v": REPLY_VERSION, "apps": len(apps), "bus": os.environ.get("AT_SPI_BUS_ADDRESS") or None,
            "sessionBus": bool(os.environ.get("DBUS_SESSION_BUS_ADDRESS")), "ms": round((time.time() - t0) * 1000, 1),
            "names": [a["name"] for a in apps][:40]}


def op_apps(req):
    apps = desktop_apps()
    for a in apps:
        a.pop("acc", None)
    return {"ok": True, "v": REPLY_VERSION, "apps": apps}


def walk(app, budget, max_depth, want_text, deadline):
    """Breadth-first over ONE application. Every accessor is wrapped; a node
    whose children cannot be read is reported in `unreadable` and its subtree
    is skipped — the budget is the only thing that ends a traversal early."""
    nodes = []
    unreadable = []
    census = {"nodes": 0, "component": 0, "action": 0, "editableText": 0, "text": 0, "buttons": 0, "buttonsWithAction": 0,
              "byRole": {}, "actionNames": {}}
    queue = [(app, [], 0, None)]
    truncated = False
    while queue:
        if len(nodes) >= budget:
            truncated = True
            break
        if time.time() > deadline:
            truncated = True
            unreadable.append({"path": None, "why": "traversal deadline"})
            break
        acc, path, depth, parent_ref = queue.pop(0)
        ref = "@e%d" % (len(nodes) + 1)
        role = role_name(acc)
        name = safe(lambda: acc.get_name(), "") or ""
        ifaces = safe(lambda: list(acc.get_interfaces()), None)
        if ifaces is None:
            unreadable.append({"ref": ref, "path": path, "why": "get_interfaces failed (no answer within the call timeout)"})
            ifaces = []
        node = {"ref": ref, "parent": parent_ref, "depth": depth, "path": path, "role": role, "name": name[:200], "iface": ifaces}
        b = extents(acc) if "Component" in ifaces else None
        if b is not None:
            node["bounds"] = b
        acts = actions_of(acc) if "Action" in ifaces else None
        if acts is not None:
            node["actions"] = acts
        node["editable"] = "EditableText" in ifaces
        if want_text and "Text" in ifaces:
            tx = text_of(acc)
            if tx:
                node["text"] = tx
        st = state_names(acc)
        if st:
            node["states"] = st
        nodes.append(node)
        # census
        census["nodes"] += 1
        census["byRole"][role] = census["byRole"].get(role, 0) + 1
        if "Component" in ifaces:
            census["component"] += 1
        if "Action" in ifaces:
            census["action"] += 1
            for an in (acts or []):
                census["actionNames"][an] = census["actionNames"].get(an, 0) + 1
        if "EditableText" in ifaces:
            census["editableText"] += 1
        if "Text" in ifaces:
            census["text"] += 1
        if role in ("push button", "toggle button", "button", "menu item", "check box", "radio button"):
            census["buttons"] += 1
            if "Action" in ifaces:
                census["buttonsWithAction"] += 1
        if depth >= max_depth:
            continue
        cnt = safe(lambda: acc.get_child_count(), None)
        if cnt is None:
            unreadable.append({"ref": ref, "path": path, "why": "get_child_count failed (no answer within the call timeout)"})
            continue
        for i in range(cnt):
            if len(queue) + len(nodes) >= budget:
                truncated = True
                break
            ch = safe(lambda i=i: acc.get_child_at_index(i))
            if ch is None:
                unreadable.append({"ref": ref, "path": path + [i], "why": "get_child_at_index failed"})
                continue
            queue.append((ch, path + [i], depth + 1, ref))
    return nodes, census, unreadable, truncated


def op_snapshot(req):
    pids = set(int(p) for p in (req.get("pids") or []))
    budget = int(req.get("budget") or 600)
    max_depth = int(req.get("maxDepth") or 40)
    want_text = bool(req.get("text", True))
    call_ms = int(req.get("callTimeoutMs") or 800)
    wall_ms = int(req.get("wallMs") or 20000)
    Atspi.set_timeout(call_ms, max(call_ms, int(req.get("startupTimeoutMs") or 3000)))
    t0 = time.time()
    deadline = t0 + wall_ms / 1000.0
    apps = desktop_apps()
    mine = [a for a in apps if a["pid"] in pids] if pids else apps
    all_nodes, unread, census, trunc = [], [], None, False
    for a in mine:
        n, c, u, t = walk(a["acc"], budget - len(all_nodes), max_depth, want_text, deadline)
        # re-number refs so they stay unique across applications
        base = len(all_nodes)
        remap = {}
        for nd in n:
            new = "@e%d" % (base + int(nd["ref"][2:]))
            remap[nd["ref"]] = new
        for nd in n:
            nd["ref"] = remap[nd["ref"]]
            nd["parent"] = remap.get(nd["parent"]) if nd["parent"] else None
            nd["pid"] = a["pid"]
        for x in u:
            if x.get("ref"):
                x["ref"] = remap.get(x["ref"], x["ref"])
            x["pid"] = a["pid"]
        all_nodes.extend(n)
        unread.extend(u)
        trunc = trunc or t
        if census is None:
            census = c
        else:
            for k in ("nodes", "component", "action", "editableText", "text", "buttons", "buttonsWithAction"):
                census[k] += c[k]
            for k, v in c["byRole"].items():
                census["byRole"][k] = census["byRole"].get(k, 0) + v
            for k, v in c["actionNames"].items():
                census["actionNames"][k] = census["actionNames"].get(k, 0) + v
        if len(all_nodes) >= budget:
            trunc = True
            break
    ms = round((time.time() - t0) * 1000, 1)
    if census is None:
        census = {"nodes": 0, "component": 0, "action": 0, "editableText": 0, "text": 0, "buttons": 0, "buttonsWithAction": 0, "byRole": {}, "actionNames": {}}
    return {"ok": True, "v": REPLY_VERSION, "apps": [{"pid": a["pid"], "name": a["name"]} for a in mine], "nodes": all_nodes,
            "census": census, "unreadable": unread, "truncated": trunc, "budget": budget, "callTimeoutMs": call_ms,
            "ms": ms, "nodesPerSec": round(len(all_nodes) / (ms / 1000.0), 0) if ms > 0 else None}


def resolve_path(pid, path):
    apps = desktop_apps()
    app = next((a["acc"] for a in apps if a["pid"] == pid), None)
    if app is None:
        return None, {"ok": False, "code": "app_gone", "why": "no application with pid %d on the a11y bus" % pid}
    acc = app
    for i in path:
        nxt = safe(lambda: acc.get_child_at_index(int(i)))
        if nxt is None:
            return None, {"ok": False, "code": "ref_unreadable", "why": "child %s of the recorded path could not be read" % i}
        acc = nxt
    return acc, None


def op_act(req):
    call_ms = int(req.get("callTimeoutMs") or 800)
    Atspi.set_timeout(call_ms, max(call_ms, 3000))
    pid = int(req.get("pid"))
    path = [int(x) for x in (req.get("path") or [])]
    expect = req.get("expect") or {}
    acc, err = resolve_path(pid, path)
    if err:
        return err
    role = role_name(acc)
    name = safe(lambda: acc.get_name(), "") or ""
    if expect and ((expect.get("role") and expect["role"] != role) or (expect.get("name") is not None and expect["name"] != name)):
        return {"ok": False, "code": "ref_stale", "why": "the node at that path is now %r %r, the ref named %r %r — take a new snapshot" % (role, name, expect.get("role"), expect.get("name"))}
    ifaces = safe(lambda: list(acc.get_interfaces()), []) or []
    verb = req.get("verb")
    t0 = time.time()
    if verb == "do_action":
        if "Action" not in ifaces:
            return {"ok": False, "code": "node_has_no_action", "why": "%s %r exports no Action interface (interfaces: %s) — a node without an action is never degraded to a coordinate click" % (role, name, ",".join(ifaces) or "none")}
        a = action_iface(acc)
        n = safe(lambda: Atspi.Action.get_n_actions(a), 0) or 0
        names = [safe(lambda i=i: Atspi.Action.get_action_name(a, i), "") for i in range(n)]
        want = req.get("action", 0)
        idx = None
        if isinstance(want, int):
            idx = want if 0 <= want < n else None
        elif isinstance(want, str) and want.isdigit():
            idx = int(want) if 0 <= int(want) < n else None
        elif isinstance(want, str):
            idx = names.index(want) if want in names else None
        if idx is None:
            return {"ok": False, "code": "action_unknown", "why": "%s %r has actions %s, not %r" % (role, name, names, want)}
        ok = safe(lambda: Atspi.Action.do_action(a, idx), None)
        if ok is None:
            return {"ok": False, "code": "action_failed", "why": "do_action(%d) did not answer within %d ms" % (idx, call_ms)}
        return {"ok": bool(ok), "code": None if ok else "action_refused", "did": {"verb": "do_action", "index": idx, "action": names[idx], "role": role, "name": name},
                "ms": round((time.time() - t0) * 1000, 1)}
    if verb in ("set_text", "insert_text"):
        if "EditableText" not in ifaces:
            return {"ok": False, "code": "node_not_editable", "why": "%s %r exports no EditableText interface (interfaces: %s)" % (role, name, ",".join(ifaces) or "none")}
        e = editable_iface(acc)
        text = str(req.get("text") or "")
        if verb == "set_text":
            ok = safe(lambda: Atspi.EditableText.set_text_contents(e, text), None)
        else:
            t = text_iface(acc)
            pos = safe(lambda: Atspi.Text.get_caret_offset(t), 0) if t is not None else 0
            if pos is None or pos < 0:
                pos = safe(lambda: Atspi.Text.get_character_count(t), 0) or 0
            ok = safe(lambda: Atspi.EditableText.insert_text(e, pos, text, len(text)), None)
        if ok is None:
            return {"ok": False, "code": "action_failed", "why": "%s did not answer within %d ms" % (verb, call_ms)}
        return {"ok": bool(ok), "code": None if ok else "action_refused", "did": {"verb": verb, "chars": len(text), "role": role, "name": name}, "ms": round((time.time() - t0) * 1000, 1)}
    if verb == "read":
        return {"ok": True, "did": {"verb": "read", "role": role, "name": name, "iface": ifaces, "text": text_of(acc, 2000), "actions": actions_of(acc), "states": state_names(acc)}}
    if verb == "focus":
        if "Component" not in ifaces:
            return {"ok": False, "code": "action_refused", "why": "%s %r exports no Component interface — it cannot take keyboard focus through the tree" % (role, name)}
        comp = safe(lambda: acc.get_component_iface() if hasattr(acc, "get_component_iface") else acc.get_component())
        ok = safe(lambda: Atspi.Component.grab_focus(comp), None) if comp is not None else None
        if ok is None:
            return {"ok": False, "code": "action_failed", "why": "grab_focus did not answer within %d ms" % call_ms}
        return {"ok": bool(ok), "code": None if ok else "action_refused", "did": {"verb": "focus", "role": role, "name": name}, "ms": round((time.time() - t0) * 1000, 1)}
    return {"ok": False, "code": "bad-request", "why": "unknown verb %r" % verb}


def op_focused(req):
    """The node that holds keyboard focus inside the given applications — the
    `type` verb's target when the agent named no @ref. Bounded like a
    snapshot; answers `node: null` when nothing is focused."""
    req = dict(req)
    req["text"] = False
    snap = op_snapshot(req)
    if not snap.get("ok"):
        return snap
    for nd in snap["nodes"]:
        if "focused" in (nd.get("states") or []):
            return {"ok": True, "v": REPLY_VERSION, "node": nd, "ms": snap["ms"]}
    return {"ok": True, "v": REPLY_VERSION, "node": None, "ms": snap["ms"], "scanned": len(snap["nodes"])}


def op_screenshot(req):
    """Pixels of a rectangle of the X display in the environment (DISPLAY /
    XAUTHORITY set by the caller) — the fallback read, never the primary."""
    try:
        gi.require_version("Gdk", "3.0")
        from gi.repository import Gdk
    except Exception as e:
        return {"ok": False, "code": "screenshot_unavailable", "why": "python3 gi Gdk not importable: %s" % e}
    out = req.get("out")
    if not out:
        return {"ok": False, "code": "bad-request", "why": "screenshot needs `out`"}
    root = Gdk.get_default_root_window()
    if root is None:
        return {"ok": False, "code": "screenshot_unavailable", "why": "no X display reachable (DISPLAY=%s)" % os.environ.get("DISPLAY")}
    rw, rh = root.get_width(), root.get_height()
    b = req.get("bounds") or {}
    x = max(0, int(b.get("x", 0))); y = max(0, int(b.get("y", 0)))
    w = min(rw - x, int(b.get("w", rw))); h = min(rh - y, int(b.get("h", rh)))
    if w <= 0 or h <= 0:
        return {"ok": False, "code": "bad-request", "why": "empty rectangle %r on a %dx%d display" % (b, rw, rh)}
    pb = Gdk.pixbuf_get_from_window(root, x, y, w, h)
    if pb is None:
        return {"ok": False, "code": "screenshot_failed", "why": "the display gave no pixels for %d,%d %dx%d" % (x, y, w, h)}
    pb.savev(out, "png", [], [])
    return {"ok": True, "v": REPLY_VERSION, "out": out, "x": x, "y": y, "w": w, "h": h, "bytes": os.path.getsize(out)}


def op_windowshot(req):
    """Lane E (D7): the app's OWN windows composed by root position — the
    pixel road's read. Each xid is grabbed as ITSELF (a foreign GdkWindow):
    on the xpra rung the display's root is composited offscreen and a root
    grab is black even with a viewer attached (measured 2026-09-25), while
    the app's own X window has its pixels whenever it is mapped. The canvas
    is `w`×`h` with (0,0) at `origin` (the main window's top-left), so a
    pixel of the image IS the `--at` coordinate the engine maps back."""
    try:
        gi.require_version("Gdk", "3.0")
        gi.require_version("GdkX11", "3.0")
        gi.require_version("GdkPixbuf", "2.0")
        from gi.repository import Gdk, GdkX11, GdkPixbuf, GLib
    except Exception as e:
        return {"ok": False, "code": "screenshot_unavailable", "why": "python3 gi Gdk/GdkX11 not importable: %s" % e}
    out = req.get("out")
    if not out:
        return {"ok": False, "code": "bad-request", "why": "windowshot needs `out`"}
    origin = req.get("origin") or {}
    ox, oy = int(origin.get("x", 0)), int(origin.get("y", 0))
    cw, ch = int(req.get("w") or 0), int(req.get("h") or 0)
    if cw <= 0 or ch <= 0 or cw > 16384 or ch > 16384:
        return {"ok": False, "code": "bad-request", "why": "a %dx%d canvas is not a window image" % (cw, ch)}
    # the X backend BY NAME: a caller env that still names a Wayland display would hand us a GdkWaylandDisplay
    # (measured), and a foreign X window needs the X one — the display named by DISPLAY, opened explicitly
    safe(lambda: Gdk.set_allowed_backends("x11"))
    disp = safe(lambda: Gdk.Display.open(os.environ.get("DISPLAY") or ""))
    if disp is None or not isinstance(disp, GdkX11.X11Display):
        return {"ok": False, "code": "screenshot_unavailable", "why": "no X display reachable (DISPLAY=%s)" % os.environ.get("DISPLAY")}
    # the canvas carries alpha (a window pixmap does — depth 32) and every pixel is made OPAQUE: an X window's
    # contents are what the user sees, but its alpha bytes are often 0 (measured: a straight alpha composite of the
    # calculator's grab was all black while its RGB was drawn)
    canvas = GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB, True, 8, cw, ch)
    canvas.fill(0x000000ff)
    shot, lit, total = [], 0, 0
    for w in req.get("windows") or []:
        try:
            xid, wx, wy, ww, wh = int(w["id"]), int(w["x"]), int(w["y"]), int(w["w"]), int(w["h"])
        except Exception:
            continue
        gw = safe(lambda: GdkX11.X11Window.foreign_new_for_display(disp, xid))
        if gw is None:
            shot.append({"id": xid, "ok": False, "why": "the window is gone"})
            continue
        pb = safe(lambda: Gdk.pixbuf_get_from_window(gw, 0, 0, ww, wh))
        if pb is None:
            shot.append({"id": xid, "ok": False, "why": "no pixels (unmapped or off-screen)"})
            continue
        if pb.get_has_alpha():
            buf = bytearray(pb.get_pixels())
            buf[3::4] = b"\xff" * len(buf[3::4])
            pb = GdkPixbuf.Pixbuf.new_from_bytes(GLib.Bytes.new(bytes(buf)), GdkPixbuf.Colorspace.RGB, True, 8, pb.get_width(), pb.get_height(), pb.get_rowstride())
        else:
            pb = pb.add_alpha(False, 0, 0, 0)
        dx, dy = wx - ox, wy - oy
        sx, sy = max(0, -dx), max(0, -dy)
        cx, cy = max(0, dx), max(0, dy)
        cwid = min(pb.get_width() - sx, cw - cx)
        chei = min(pb.get_height() - sy, ch - cy)
        if cwid > 0 and chei > 0:
            pb.copy_area(sx, sy, cwid, chei, canvas, cx, cy)
        shot.append({"id": xid, "ok": True, "w": pb.get_width(), "h": pb.get_height()})
    # a coarse "is anything drawn" census (every 97th pixel): a black image is a fact the caller names, never a success
    px = canvas.get_pixels()
    stride, nch = canvas.get_rowstride(), canvas.get_n_channels()
    for yy in range(0, ch, max(1, ch // 64)):
        row = yy * stride
        for xx in range(0, cw, max(1, cw // 64)):
            i = row + xx * nch
            total += 1
            if px[i] or px[i + 1] or px[i + 2]:
                lit += 1
    canvas.savev(out, "png", [], [])
    return {"ok": True, "v": REPLY_VERSION, "out": out, "w": cw, "h": ch, "originX": ox, "originY": oy, "windows": shot,
            "lit": lit, "sampled": total, "bytes": os.path.getsize(out)}


OPS = {"probe": op_probe, "apps": op_apps, "snapshot": op_snapshot, "act": op_act, "focused": op_focused, "screenshot": op_screenshot, "windowshot": op_windowshot}


def main():
    try:
        req = read_request()
    except Exception as e:
        reply({"ok": False, "code": "bad-request", "why": "request is not JSON: %s" % e, "v": REPLY_VERSION})
        return 0
    op = req.get("op") or "probe"
    fn = OPS.get(op)
    if fn is None:
        reply({"ok": False, "code": "bad-request", "why": "unknown op %r" % op, "v": REPLY_VERSION})
        return 0
    try:
        reply(fn(req))
    except Exception as e:
        reply({"ok": False, "code": "helper_error", "why": "%s: %s" % (type(e).__name__, e), "v": REPLY_VERSION})
    return 0


if __name__ == "__main__":
    sys.exit(main())
