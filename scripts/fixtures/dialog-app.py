#!/usr/bin/env python3
"""A GTK3 app that opens DIALOGS (lane window-dialog-member): a main window
with an "Open file…" button (Gtk.FileChooserDialog OPEN, transient for the
main window, modal), a "Save as…" button (FileChooserDialog SAVE — its Name
entry holds the focus) and a "Show message" button (Gtk.MessageDialog).
stdin lines drive it without the tree: `open` / `save` / `message` / `close`.
Prints `READY <pid> <xid>` once the main window is mapped, `DIALOG <kind>
<xid>` when a dialog maps, `ANSWER <kind> <response> <text>` when one is
answered (the SAVE dialog's text = the Name field). Exits on SIGTERM."""
import os
import sys

import gi
gi.require_version("Gtk", "3.0")
gi.require_version("Gdk", "3.0")
gi.require_version("GdkX11", "3.0")
from gi.repository import Gtk, Gdk, GdkX11, GLib  # noqa: E402,F401


def say(*parts):
    print(" ".join(str(p) for p in parts), flush=True)


class App(Gtk.Window):
    def __init__(self):
        super().__init__(title=os.environ.get("VS_DLG_TITLE") or "vs dialog fixture")
        self.set_default_size(560, 400)
        self.dialog = None
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=6, margin=12)
        self.add(box)
        self.status = Gtk.Label(label="no dialog yet")
        box.pack_start(self.status, False, False, 0)
        for label, fn in (("Open file…", self.open_file), ("Save as…", self.save_file), ("Show message", self.message)):
            b = Gtk.Button(label=label)
            b.connect("clicked", lambda _b, f=fn: f())
            box.pack_start(b, False, False, 0)
        self.entry = Gtk.Entry()
        self.entry.set_placeholder_text("the main window's own entry")
        box.pack_start(self.entry, False, False, 0)
        self.connect("destroy", Gtk.main_quit)
        self.connect("map-event", self.on_map)

    def on_map(self, *_):
        say("READY", os.getpid(), self.get_window().get_xid())
        return False

    def shown(self, kind, d):
        self.dialog = (kind, d)
        d.connect("map-event", lambda *_: say("DIALOG", kind, d.get_window().get_xid()) or False)
        d.connect("response", self.on_response, kind)
        d.show_all()

    def open_file(self):
        d = Gtk.FileChooserDialog(title="Open", transient_for=self, modal=True, action=Gtk.FileChooserAction.OPEN)
        d.add_buttons("_Cancel", Gtk.ResponseType.CANCEL, "_Open", Gtk.ResponseType.ACCEPT)
        self.shown("open", d)

    def save_file(self):
        d = Gtk.FileChooserDialog(title="Save as", transient_for=self, modal=True, action=Gtk.FileChooserAction.SAVE)
        d.add_buttons("_Cancel", Gtk.ResponseType.CANCEL, "_Save", Gtk.ResponseType.ACCEPT)
        d.set_current_name("untitled.txt")
        self.shown("save", d)

    def message(self):
        d = Gtk.MessageDialog(transient_for=self, modal=True, message_type=Gtk.MessageType.INFO, buttons=Gtk.ButtonsType.OK, text="Hello from the fixture")
        self.shown("message", d)

    def on_response(self, d, response, kind):
        text = d.get_current_name() if kind == "save" else (d.get_filename() if kind == "open" else "")
        say("ANSWER", kind, int(response), text or "")
        self.status.set_text("answered %s %d" % (kind, int(response)))
        self.dialog = None
        d.destroy()

    def on_stdin(self, src, cond):
        line = src.readline()
        if not line:
            return False
        cmd = line.strip()
        if cmd == "open":
            self.open_file()
        elif cmd == "save":
            self.save_file()
        elif cmd == "message":
            self.message()
        elif cmd == "close" and self.dialog:
            self.dialog[1].response(Gtk.ResponseType.CANCEL)
        return True


app = App()
app.show_all()
GLib.io_add_watch(sys.stdin, GLib.IO_IN | GLib.IO_HUP, app.on_stdin)
Gtk.main()
