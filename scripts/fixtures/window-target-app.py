#!/usr/bin/env python3
"""A tiny GTK3 window for the window-target suites and measurements (P9):
a counter button, a label that states the count, an entry echoed into a
label, a check box, an unpainted canvas (a DrawingArea) that reports where it was clicked (the
`click --at` witness — pixels, no Action) and a key witness label (the
`key` witness) — plus a "button" drawn as a plain label that exports NO
Action in the tree (the negative control for "never degrade a node without
Action to a click"). Prints `READY <pid>` on stdout once mapped. Exits on
SIGTERM."""
import os
import sys

import gi
gi.require_version("Gtk", "3.0")
gi.require_version("Gdk", "3.0")
from gi.repository import Gtk, Gdk, GLib  # noqa: E402


class App(Gtk.Window):
    def __init__(self):
        super().__init__(title=os.environ.get("VS_WT_TITLE") or "vibespace-window fixture")
        self.set_default_size(420, 360)
        self.count = 0
        self.canvas_clicks = 0
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=6, margin=12)
        self.add(box)
        self.label = Gtk.Label(label="count 0")
        box.pack_start(self.label, False, False, 0)
        self.button = Gtk.Button(label="Count")
        self.button.connect("clicked", self.on_click)
        box.pack_start(self.button, False, False, 0)
        self.entry = Gtk.Entry()
        self.entry.set_placeholder_text("type here")
        self.entry.connect("changed", self.on_entry)
        box.pack_start(self.entry, False, False, 0)
        self.echo = Gtk.Label(label="entry ''")
        box.pack_start(self.echo, False, False, 0)
        self.check = Gtk.CheckButton(label="Enabled")
        box.pack_start(self.check, False, False, 0)
        # a "button" drawn as a plain label inside an event box: Component + Text, NO Action
        ev = Gtk.EventBox()
        fake = Gtk.Label(label="Fake button (no Action)")
        ev.add(fake)
        box.pack_start(ev, False, False, 0)
        # the canvas: a drawing area that only answers to a POINTER press
        self.canvas = Gtk.DrawingArea()
        self.canvas.set_size_request(380, 80)
        self.canvas.add_events(Gdk.EventMask.BUTTON_PRESS_MASK)
        # no "draw" handler: painting needs python3-gi-cairo, and the click witness does not
        self.canvas.connect("button-press-event", self.on_canvas)
        box.pack_start(self.canvas, False, False, 0)
        self.canvas_label = Gtk.Label(label="canvas none")
        box.pack_start(self.canvas_label, False, False, 0)
        # the key witness: any key press on the window is named here
        self.key_label = Gtk.Label(label="key none")
        box.pack_start(self.key_label, False, False, 0)
        self.connect("key-press-event", self.on_key)
        self.connect("destroy", Gtk.main_quit)

    def on_click(self, _b):
        self.count += 1
        self.label.set_text("count %d" % self.count)

    def on_entry(self, e):
        self.echo.set_text("entry %r" % e.get_text())

    def on_canvas(self, _w, event):
        self.canvas_clicks += 1
        self.canvas_label.set_text("canvas click %d at %d,%d" % (self.canvas_clicks, int(event.x), int(event.y)))
        return True

    def on_key(self, _w, event):
        mods = []
        if event.state & Gdk.ModifierType.CONTROL_MASK:
            mods.append("ctrl")
        if event.state & Gdk.ModifierType.MOD1_MASK:
            mods.append("alt")
        if event.state & Gdk.ModifierType.SHIFT_MASK:
            mods.append("shift")
        name = Gdk.keyval_name(event.keyval) or "?"
        if name in ("Control_L", "Control_R", "Alt_L", "Alt_R", "Shift_L", "Shift_R", "Super_L", "Super_R"):
            return False
        self.key_label.set_text("key %s" % "+".join(mods + [name.lower()]))
        return False


def main():
    w = App()
    w.show_all()

    def announce():
        sys.stdout.write("READY %d\n" % os.getpid())
        sys.stdout.flush()
        return False
    GLib.idle_add(announce)
    GLib.unix_signal_add(GLib.PRIORITY_HIGH, 15, Gtk.main_quit)
    Gtk.main()


if __name__ == "__main__":
    main()
