# Usage & Token Analytics

Two complementary things track your Claude usage, both **without VibeSpace ever
calling Anthropic on its own** (that background-poll pattern is what gets
Pro/Max accounts flagged — see [Accounts § Staying within the terms](accounts.md#staying-within-anthropics-terms)):

1. **Taskbar usage pies** — live 5h / 7d rate-limit donuts, captured *passively*.
2. **Usage window** (⚙ → Usage) — a full analytics dashboard over a permanent
   per-request token ledger.

## Taskbar pies (live rate limits, passive)

The 5h / 7d donuts show your subscription rate-limit utilization. The data is
captured **passively**: while you run an interactive **terminal** session, the
CLI already receives your 5h/7d figures in its normal API responses and hands
them to its status-line — VibeSpace caches what the CLI already knows. There is
**no background call to Anthropic**.

- The pies follow your **default account** (the starred one — what new sessions
  bill to), falling back to the machine's own login when none is starred.
- Because it's a byproduct of real use, usage refreshes when you run the account
  in a **terminal** session. Chat (stream-json) sessions have no status line, so
  a chat-only account shows its last-known value.
- The taskbar re-reads the cached value every ~8s (a cheap local read).
- **Opt-in active polling** (default OFF): *Settings → "⚠ Actively poll
  subscription usage"* restores the old behavior of calling Anthropic's usage
  endpoint on a timer. It carries a stark warning — that off-CLI, fixed-cadence
  traffic is exactly what can get a subscription flagged as automated. Only
  enable it if you accept that risk (e.g. to see live usage for chat-only or
  idle accounts).

## Usage window (historical per-request ledger)

Open from **⚙ → Usage**. It reads a **permanent, append-only ledger**
(`data/usage-history/`) mined from Claude Code's own JSONL transcripts — so it
covers **both terminal and chat** sessions (the transcript is mode-independent)
and keeps the atomic facts forever, surviving transcript rotation/deletion.

**Accurate by construction:**
- Each record is **one API request, deduped by `requestId`** — a single request
  writes 2–3 transcript records with identical usage, so summing raw records
  would multi-count.
- Attribution is **per-request, by time**: every request records **which
  account** it billed to and its **billing type**, so **subscription usage and
  API-key usage are never conflated**. A session resumed under a different
  account is split correctly; sessions with no VibeSpace account are their own
  "CLI global login" bucket.

**The dashboard shows:**
- Headline tiles: estimated API-equivalent **cost**, **total tokens** (with its
  four component tiles — cached reads / cache writes / fresh input / output —
  that visibly sum to it; cached reads usually dominate at >95%), **cache-hit
  ratio**, **requests / sessions**.
- **Daily trend** chart (cost or tokens).
- Breakdowns **by billing type, account, model, project, mode, cache
  efficiency, hour-of-day, weekday, and top sessions**.
- **Range** (7d / 30d / 90d / all) and **backend** filters, and **CSV export**.

### Cost is an estimate

Cost is the **API-equivalent** — what the tokens would cost on the pay-per-use
API. **Subscription** sessions don't actually cost this (they're covered by your
plan); it's a reference figure. Token counts are the hard facts.

Prices come from an editable table with the current official Anthropic rates
(e.g. Fable 5 $10/$50, Opus 4.5–4.8 $5/$25, Sonnet $3/$15, Haiku $1/$5 per
million tokens; prompt-cache write ~1.25–2× input, cache read ~0.1×). Batch
(−50%) and US-only inference (+1.1×) are not modeled.

### Per-account pricing

Different API keys really do bill at different rates (negotiated discounts).
The **Pricing** editor in the Usage window lets you:
- edit the **default per-model rates**, and
- give any **API-key account a discount %** (or a full rate override).

Subscriptions always use the default rates (as the API-equivalent reference).
The table is also directly editable at `data/usage-history/pricing.json`.
