# Files across hosts

The file explorer can browse and edit files on any registered [remote host](mounts.md#remote-hosts), not just the local machine.

## Switching host

Each file-explorer window has a **host dropdown** next to the path bar (Local + every ssh host you've added). Switching re-browses that host's filesystem from its home directory; the window title carries the host name (e.g. `AIDev: /home/you`). Path autocomplete and recent-dir suggestions follow the selected host.

Every operation works remotely with full parity: list, open/edit text, view images/PDF/binary (hex), create/rename/delete, upload, download, compress/extract archives, properties. Each runs one ssh command on the host (no daemon installed there), reusing the host's key.

## Copying between hosts

Drag-and-drop or copy/paste a file from one explorer window to another on a **different host** transfers it automatically:

- **Same host** → a remote `cp`/`mv` on that machine.
- **Different hosts (or host ↔ local)** → the file streams through the VibeSpace server (A → server → B). Works local→remote, remote→local, and remote→remote.

Folders: compress to an archive first, transfer, then extract (direct cross-host folder trees are on the roadmap).

## Limits

Remote file access is one ssh round trip per operation (~200-600ms latency), so large directory listings and big-file reads are slower than local. Text edit is capped at 10 MB (use the hex viewer beyond that), same as local.
