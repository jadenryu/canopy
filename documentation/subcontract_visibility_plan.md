# Subcontract visibility plan — make recursive hiring legible, step by step

Problem: a manager winning a job, decomposing it, hiring subcontractors
through real auctions, and assembling the result is the project's most
impressive mechanic — and today a viewer cannot follow it. The parent card
sits in "In progress" while its sub-jobs appear as three unrelated cards in
"Open auction"; the only links are a 10px `· subcontract` tag
(`MarketPipeline.tsx:78`) and the `HiringGraph` tree, which is easy to miss
and reads as a summary, not a live story.

The fix is presentational. The state snapshot already carries everything
needed: `parent_job_id`, `client_id` (= the manager, on sub-jobs), per-job
`bids` and `status` (`api/state.py:66-88`). Two small backend additions, the
rest is frontend.

## The 8 steps a viewer must be able to follow

| # | What happens (backend) | Where it must be visible |
|---|---|---|
| 1 | Complex job posted (hops ≥ 3) | Parent card badge: `3-hop · will decompose` |
| 2 | Auction → manager wins | Existing bid book on the card (already good) |
| 3 | Manager decomposes (`worker.py:101-123`) | NEW event + parent-card status line: "decomposing…" |
| 4 | Sub-jobs posted, manager becomes client | Sub-cards visually tied to the family (accent + `↳`), spawn animation from parent |
| 5 | Sub-auctions run | Sub-cards' bid books (already good) + parent progress chips |
| 6 | Subcontractors execute + settle | Parent chips tick: `2/3 sub-jobs done` |
| 7 | Manager assembles (`worker.py:117-160`) | Parent status line: "assembling answers" |
| 8 | Parent settles; manager margin = price − sub payouts | Margin line on parent card + detail panel money table |

## Backend changes (small, do first)

1. **`decomposed` event** — emit in `Worker.subcontract()` right after
   `decompose()` returns: `{job_id, agent_id, sub_questions: [...], n}`.
   Today step 3 is invisible (sub-jobs only appear at step 4). Add
   `assembling` event before the assemble LLM call (step 7). Both go through
   the existing `events.emit()` → they reach the feed and trigger deltas for
   free.
2. **`depth` and `sub_job_ids` on job rows** — add `depth` to the snapshot row
   (`api/state.py:66`); compute `children` server-side or leave it to the
   frontend (frontend already groups by `parent_job_id` in `HiringGraph.tsx:26-37`
   — reuse that, no server change needed for children). `depth` is needed for
   nesting and is already on the Job model.
3. **Sub-payout math on settled parents** — the parent row gets
   `sub_paid: float` (sum of children's `price`) so the UI can show
   `price 4.20 − subs 2.80 = margin 1.40` without recomputing from the ledger.

## Frontend changes

### A. Family grouping in `MarketPipeline` (the core fix)

Keep the three-column pipeline (it correctly shows that sub-auctions are real
auctions), but make family membership unmissable:

- **Family accent:** every job family (parent + descendants) gets a stable
  hue derived from the parent job id (e.g. 4-color cycle on a left border).
  Parent card: solid 2px left border. Sub-job cards: same hue, plus a header
  line `↳ sub-job of job-007 · hired by Project manager` that is clickable
  (scroll-to + flash the parent card).
- **Parent progress chips:** while a parent is executing and has children,
  render one chip per sub-job on the parent card — `label · status-dot`
  (waiting / bidding / executing / done). Chips click through to the sub-job
  card. This is step 5/6 at a glance.
- **Parent status line:** replace the generic "executing" (`MarketPipeline.tsx:137`)
  with the subcontract stage when children exist: `decomposing…` (after
  `decomposed` event has not yet produced children), `waiting on 3 sub-auctions`,
  `assembling answers` (on the `assembling` event), `being scored`.
- **Spawn animation:** when a sub-job card first appears, animate it out of
  the parent card (motion `initial` offset toward the parent's position, or
  simpler: scale-in with the family hue flashing on both cards for ~1s).
  This is the single highest-value visual — it *shows* hiring happen.

### B. `HiringGraph` → live step timeline

The tree (`HiringGraph.tsx`) keeps its structure but each chain becomes a
numbered narrative that fills in as steps occur:

```
job-007  "Which year was the director of Inception born…"
 1 ● client posted (cap 10)            2 ● Project manager won at 4.20
 3 ● decomposed into 2 sub-questions   4 ◐ sub-auctions: 1 settled, 1 bidding
 5 ○ assemble                          6 ○ settle — manager margin —
```

- Derive step states from job statuses + the two new events (no new state
  shape; the events array already arrives in the snapshot).
- Rename the panel "Subcontracts — live" and move it adjacent to the
  pipeline on the trading floor so the two views are seen together.

### C. Job detail panel (declarative gen-UI — keep the prize story)

When a parent job is clicked, the backend's `job_detail` UISpec
(`api/state.py:121`) gains two sections:

- `table` "Subcontracts": one row per sub-job — sub-question, winner label,
  price, score, status.
- `stats` "Money flow": `client paid` / `subs paid` / `manager margin`.

This deepens the declarative pattern (a judge-visible benefit) instead of
adding a new mechanism.

### D. Event feed

Indent subcontract-related events with `↳` and the family hue:
`↳ Project manager posted sub-job: "Which year was…" (cap 4.0)`. The
`decomposed` event renders as its own line: `Project manager split job-007
into 2 sub-questions`. One renderer change in `EventFeed.tsx`.

## Implementation order

1. Backend: `decomposed` + `assembling` events, `depth` + `sub_paid` on rows
   (~30 lines total).
2. Pipeline family accents + sub-job header link (pure CSS/markup).
3. Parent progress chips + status line.
4. HiringGraph step timeline.
5. Detail-panel sections + event-feed indentation.
6. Spawn animation last (polish; cut first if time is short).

No changes to market logic, auction, or settlement — read-side only, so the
deterministic demo scenario is unaffected.

## Done when

- A first-time viewer watching one complex job can narrate all 8 steps
  without help: sees the manager win, sees "decomposing", sees sub-job cards
  spawn with the family color, watches sub-auctions fill, sees chips tick to
  done, sees "assembling", and reads the manager's margin on settlement.
- Clicking any sub-job reaches its parent in one click and vice versa.
- The demo script's subcontract beat (walkthrough step 2, 0:20–1:05) can be
  delivered pointing at the screen with no verbal compensation.
