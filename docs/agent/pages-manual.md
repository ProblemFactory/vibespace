# vibespace-page — host HTML on this VibeSpace, share by link

`vibespace-page` turns any self-contained HTML you produce (a mockup, a
report, a one-page tool) into a page hosted by the VibeSpace instance you are
running in, with a stable share URL — shareable output that lives on the
user's own instance.

A DESIGN the user asked for (screens, a mockup to iterate on) is made with
`vibespace-design` instead: plain-HTML artboards the user watches in the
Design window while you work, published with `vibespace-design publish`
(`vibespace-docs design`).

```
vibespace-page publish <file.html> --title "<what the user would call it>" [--public]
vibespace-page list
vibespace-page unpublish <page>
vibespace-page visibility <page> public|private
```

`<page>` = the published file's path, the page id (`pg…`) or its `/p/…` link.

## publish

- Uploads a SNAPSHOT of the file (≤ 25 MB) and prints the share URL
  (`/p/<id>`; absolute when the server knows its public address).
- **Private by default** — viewers must be logged in to this VibeSpace.
  `--public` opens it to anyone with the link; omitting the flag on a
  republish KEEPS whatever visibility the user set since. The user can flip public /
  private later from the chat status bar's design popover or the file
  browser's *Publish page…* dialog; you can with `vibespace-page visibility`.
- **Same file path again = same URL, new snapshot.** Iterate freely; the
  link the user already shared keeps working and shows the latest publish.
- **Every publish asks the user** (a permission card in their chat) — unless
  the session runs with full access ("Never ask", bypassPermissions), where
  nothing asks and publish runs directly; in the "refuse what is not
  pre-approved" mode (dontAsk) publish is refused. A page goes out under the
  user's name, `--public` as a link anyone can open, so even with full access
  publish only what they asked for. `vibespace-page list` runs without asking
  in every mode. If the user denies (or the mode refuses) a publish, say
  what you would have published and stop — never retry it in a loop.
- Name things as the user would (`--title "Spring Menu Poster"`), never by
  format or tool. Say the URL in your reply — the chat UI linkifies it.
- Hosted pages run under a CSP `sandbox` (opaque origin): scripts run,
  but there is no access to the VibeSpace session, cookies or API — a page
  that tries to save back to the server cannot; say so at handover.

## list

Pages published from this session or this conversation (earlier
incarnations of the same chat): visibility, URL, title, last publish.

## unpublish

Takes a page down: it leaves the list and the user's Pages list, and its link
answers **410 "this page was unpublished"** from then on (a link someone
still holds says what happened instead of a bare not-found). Publishing the
same file again afterwards gives a NEW link. Only a page THIS conversation (or
session) published — anything else is "not among the pages this conversation
published". It is never pre-approved: the user is asked unless the session
runs with full access. Do it when the user asks to take a page down — never to
tidy up on your own.

## visibility

`vibespace-page visibility <page> public|private` — `public` opens the page
to anyone with the link, `private` makes viewers log in to this VibeSpace. It
asks the user exactly as `publish` does — every time, unless the session runs
with full access (it is the same exposure as `--public`). A later republish
without `--public` keeps what you set.

## Rules

- Tokens ride your session env — never on argv.
- Anything the user needs (the URL, what you assumed) goes in your CHAT
  REPLY; the tool output is not a substitute.
- Publishing is replacing: a republish swaps the snapshot for everyone
  who holds the link. Do not publish files you did not author this
  session unless asked.
