# vibespace-page — host HTML on this VibeSpace, share by link; the design-canvas kit

`vibespace-page` turns any self-contained HTML you produce (a design canvas,
a mockup, a report, a one-page tool) into a page hosted by the VibeSpace
instance you are running in, with a stable share URL. It replaces "publish
to claude.ai as an Artifact" for design canvases — the user asked for
shareable output that lives on their own instance.

```
vibespace-page publish <file.html> --title "<what the user would call it>" [--public]
vibespace-page kit
vibespace-page list
```

## publish

- Uploads a SNAPSHOT of the file (≤ 25 MB) and prints the share URL
  (`/p/<id>`; absolute when the server knows its public address).
- **Private by default** — viewers must be logged in to this VibeSpace.
  `--public` opens it to anyone with the link; omitting the flag on a
  republish KEEPS whatever visibility the user set since. The user can flip public /
  private later from the chat status bar's design popover or the file
  browser's *Publish page…* dialog.
- **Same file path again = same URL, new snapshot.** Iterate freely; the
  link the user already shared keeps working and shows the latest publish.
- Name things as the user would (`--title "Spring Menu Poster"`), never by
  format or tool. Say the URL in your reply — the chat UI linkifies it.
- Hosted pages run under a CSP `sandbox` (opaque origin): scripts run,
  but there is no access to the VibeSpace session, cookies or API. For a
  design canvas that means **view + PNG/PDF export, no online Save** — say
  so in one line at handover.

## kit — design canvases from a chat session

Claude Code's bundled `/design` skill is only reachable from the terminal
UI. `vibespace-page kit` prepares the same kit on this machine (the
seeding helper, the editor payload and the instructions, adapted so that
the publish step is `vibespace-page publish`) and prints its base
directory:

```
Base directory for this skill: /…/design-kit/2.1.238
```

Then **read `<that directory>/SKILL.md` and follow it**: author the
`.dc.html` artboards (and `canvas.json` for several), seed with
`seed-canvas.mjs`, run its `--check`, publish with `vibespace-page
publish`, reply with the link and a line on what you drafted. Do not use
the `Artifact` tool, `artifact-capabilities` or anything pointing at
claude.ai — those paths are not available here.

If `kit` reports the kit is not ready, relay the reason to the user (e.g.
the CLI binary was not found, or the skill layout changed in a newer CLI
and VibeSpace needs an update).

## list

Pages published from this session or this conversation (earlier
incarnations of the same chat): visibility, URL, title, last publish.

## Rules

- Tokens ride your session env — never on argv.
- Anything the user needs (the URL, what you assumed) goes in your CHAT
  REPLY; the tool output is not a substitute.
- Publishing is replacing: a republish swaps the snapshot for everyone
  who holds the link. Do not publish files you did not author this
  session unless asked.
