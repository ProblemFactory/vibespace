# vibespace-app — apps that survive a rebuilt machine

A machine can have TWO userspaces: the image's own (rebuilt with the pod — `sudo apt` in a terminal lands there and is lost) and, on a pod with an app system, the app system (a persistent userland on the home disk — what VibeSpace installs into; its apps run through `~/.vibespace/sysroot/bin/<name>` and show as `sys.<entry>` rows). You never pick one: `vibespace-app install` proposes, the user approves, VibeSpace installs where it lasts. An IDE inside the app system sees the app system's tools, not the image's.

Moving the apps root still reinstalls at every rebuild into the app system (Desktop apps → Move…) is the user's click only: `vibespace-app` cannot propose it (the hub answers `agent_forbidden`). Installing the exact packages of such an app goes into the app system as its move; the user approves it like any install.

## The user asked for an app → what you do

1. `vibespace-app search <name>` — the machine's package sources, plus VibeSpace's short list of well-known apps (WeChat /
   微信, Chrome, VS Code, Edge, Zoom, Discord, TeamViewer, Steam): a hit prints the exact command to propose it.
2. In the sources → `vibespace-app install <package> --why "<their words>"`.
3. **Not in the package sources?** Find the vendor's OFFICIAL download address (prefer the `.deb` to an AppImage) and
   propose it: `vibespace-app install --from <https address> --why "…"`. VibeSpace downloads it, reads what it is from its
   bytes and the app's own name and icon from inside it, and files ONE card. Already have the installer on that machine?
   `vibespace-app install --file <absolute path> --why "…"` (VibeSpace copies it; yours is no longer needed).
4. **Never download, unpack, write a launcher for or start the app yourself**, and never `sudo apt install` / `dpkg -i`
   it — that is lost when the machine is rebuilt, and the user cannot see or undo it.
5. Tell the user in one plain sentence that a card is waiting in their For you tray. Do not mention package formats.
   The outcome reaches you on your next turn: "Installed: 微信 — open it with `vibespace-window open app.wechat`."

**The first thing to know:** a machine's system files are not kept when it is rebuilt (a container pod is recreated
on every update; only the user's home survives). An app installed with `sudo apt install` is GONE after that. An app
installed through VibeSpace is kept: VibeSpace saves every `.deb` it needed and puts the app back by itself, offline,
right after the server starts again. So: **never `sudo apt install` an app the user wants to keep — propose it here.**

**The second thing:** you only PROPOSE. `install` / `remove` file ONE item in the user's For you tray (bottom right of
their screen) with the plan — every package, the download and disk sizes, where they come from. Nothing runs until the
user presses Install there; then VibeSpace runs it through its own package slot (one install per machine at a time).
The outcome reaches you for free on your next turn (a VibeSpace notice), or now with `wait`.

## Verbs

```
vibespace-app search <words…>                     search the machine's package sources (apt-cache search)
vibespace-app plan <package…>                     what an install would do — nothing is proposed
vibespace-app install <package…> --why "<why>"    PROPOSE an install (the user reads your why)
vibespace-app install --from https://… --why "…"  PROPOSE a vendor's download (.deb / AppImage) — VibeSpace downloads it
vibespace-app install --file /abs/path --why "…"  PROPOSE an installer already on that machine
vibespace-app remove <app-id> --why "<why>"       PROPOSE removing an app (the id from `list`)
vibespace-app list                                apps installed through VibeSpace, their catalog ids, your proposals
vibespace-app status                              after a rebuild: restoring / done; installed outside VibeSpace; updates
vibespace-app wait <proposal>                     wait up to 100 s for the decision; run it again to keep waiting
vibespace-app docs                                this manual
```

Options: `--host <machine>` (default: the machine this conversation runs on), `--json`.

## A typical flow

```
$ vibespace-app search image editor
gimp — GNU Image Manipulation Program
…
$ vibespace-app install gimp --why "you asked for an image editor that opens PSD files"
Proposed ap-7c1e2a: gimp + 337 packages, 209 MB download, 861 MB on disk.
Nothing is installed until the user approves it in VibeSpace (For you → Install). Wait for it: vibespace-app wait ap-7c1e2a
$ vibespace-app wait ap-7c1e2a
14:02:10 installing
14:05:31 done
Your proposal ap-7c1e2a (installing gimp) was approved by the user and is done. Open it with: vibespace-window open app.gimp
```

An installed package with a desktop file becomes a row of the Desktop apps catalog: `app.<entry>` (more than one
desktop file: `app.<entry>.<name>`). Open it like any catalog app: `vibespace-window open app.gimp`. A package without
one (a command-line tool) is simply on PATH.

## Refusals (by name — say them to the user in plain words)

| code | what it means |
|---|---|
| `not_found` | no such package in the machine's package sources (try `search`) |
| `bad_name` | not a Debian package name |
| `needs_snap` | the package is a placeholder for a snap (it pulls in snapd) — snaps do not run here; find another package or a `.deb` |
| `conflict` | apt cannot install it with what is installed (the unmet lines are quoted) |
| `removes` | installing it would remove other packages — VibeSpace never does that |
| `disk` | not enough free space (the numbers are in the error) |
| `no_apt` | the machine has no apt-get (not a Debian / Ubuntu machine) |
| `no_sudo` | the plan is shown, but the machine has no passwordless sudo — the user runs the commands by hand |
| `shared` | removing it would also remove a package another installed app needs |
| `agent_forbidden` | that request is the user's (Refresh, putting apps back, a file VibeSpace staged) — ask the user |
| `bad_address` | the download address is refused: not https, an IP address, a private name (localhost, .local, .internal…), more than 5 redirects, or a redirect to one of those — name the vendor's public address |
| `not_an_installer` | what the address sent (or the file) is neither a Debian package nor an AppImage — often a web PAGE: find the file's own address |
| `too_large` | more than 2 GiB |
| `fetch_failed` | the address did not answer, answered an error, or stopped sending — say so; never fall back to another site silently |
| `unsupported` / `hostile` / `unreadable` | an AppImage VibeSpace cannot open (packed with xz, an old type-1, a damaged or hostile file tree) — look for the vendor's `.deb` |
| `changed` | the downloaded file changed after the card was shown — nothing ran; propose it again |
| `host_needs_daemon` | the VibeSpace agent on that machine is too old — the user reconnects the machine to upgrade it |

## Decisions

- **Install** (the user's press): the app is installed and kept; you hear `done` (with the catalog ids) or `failed`
  (with the reason).
- **Not now**: the proposal is declined. That is final — do not propose it again unless the user asks.
- Nothing yet: `wait` answers `still proposed`; carry on — the outcome comes on your next turn.

## A third-party package source

Some programs come from their publisher's own apt repository. A source is its OWN proposal — the user sees its address
and its signing key's fingerprint and approves it before any package can come from it:

```
vibespace-app install --source vscode --uri https://packages.example.com/repos/code --suite stable --component main \
  --key https://packages.example.com/keys/key.asc --why "VS Code is published in Microsoft's own repository"
```

https only, and a key is required (VibeSpace never adds a source without one). Once the user approves it, propose the
package itself with a normal `install`.

## After a rebuild

`vibespace-app status` says whether the apps are being put back ("restoring…" in the user's catalog) and lists packages
installed OUTSIDE VibeSpace (they will be lost at the next rebuild — the user can adopt them in Desktop apps). Updates
are the user's: "N updates · last refreshed …" + Refresh in Desktop apps. Never upgrade anything yourself.

## User-level tools (no root, nothing to replay)

```
vibespace-app add --kind uv <tool> --why "…"          uv tool install <tool>          (needs uv)
vibespace-app add --kind npm <package> --why "…"      npm install -g --prefix ~/.local <package>
```
(`add --kind appimage <file>` is now `install --file <file>` — a proposal: VibeSpace unpacks it into
`~/.vibespace/apps/appimage/<id>/` at the user's click, never by running it, and gives it a row in Apps.)

These run AS YOU in the user's home (it survives a rebuild, so nothing needs putting back) and are recorded. `add` runs
an installer, so your CLI asks the user's permission for it like any other command.

## What VibeSpace does for an install (for when the user asks)

The plan is simulated as the user (`apt-get -s install`, `--print-uris`); the run is `sudo apt-get update` +
`sudo apt-get install -y <packages>` with apt keeping every downloaded `.deb` in `~/.vibespace/apps/debs` (root-owned),
completed against the machine image's own package set; the record lives in `~/.vibespace/apps/manifest.json`. After a
rebuild the packages are installed again from that local repository, offline (a few seconds for a small app, about
10 s for GIMP), and online only when the machine image itself changed.
