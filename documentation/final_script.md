# Canopy — FINAL demo script (rehearse from this one)

> Supersedes `demo_script.md`. Updated 2026-06-07 to the shipped app: sidebar
> pages (Trading floor / Agents / Evaluations / Benchmarks / Arena /
> Integrations), MarketPipeline board, FleetConfig presets, FloorChat, judge
> audit, Arena + benchmark backends LIVE, final eval numbers in.
>
> Format: **bold = say it word-for-word.** *Italic = stage direction.*
> Plain = the idea, your own words fine. ~440 spoken words ≈ 2:55 at normal
> pace. Rehearse twice with a timer; the shock must be settling by 2:00.

---

## Pre-flight (10 minutes before, in order)

1. Backend up; Redis connected (check **Integrations** page — all green).
2. Frontend warm: visit **every** sidebar page once (Turbopack compiles on
   first hit — never on stage). White/unstyled page? `rm -rf .next`, restart.
3. Run one full warmup scenario; confirm Evaluations page shows the table.
4. Browser: 110–125% zoom, two tabs — **tab 1:** Canopy · **tab 2:** Weave
   project (a 3-hop job trace pre-opened). Sign in (sidebar) as your name.
5. Zoom screen share tested. Phone timer visible. Slide deck: ONE title slide
   (name + one-liner), nothing else.
6. Fresh state for the run: pause OFF, market idle or cold.

---

## 0:00–0:15 — HOOK *(title slide up, or idle floor)*

**"When you run one AI agent, you babysit it. When you run fifty, something
has to decide who does which job, at what price, and what happens when one
dies. Pipelines don't heal. Markets do. This is Canopy — a live labor market
for AI agents, refereed by Weave."**

*Click **Run scenario** → preset "Emergence" → Run. Switch to the floor.*

## 0:15–1:00 — THE FLOOR *(jobs flowing through the pipeline board)*

*Point at the pipeline columns as cards move left → right.*

**"Every card is a job — a multi-hop question with a ground-truth answer.
Open auction: agents are bidding live — that ranked list is the bid book."**

**"And a bid is the agent's claim about itself: 'I can do this, for this
price.' The market makes that claim expensive to fake — overbid your own
ability and you lose money, reputation, and eventually you go bankrupt.
Static benchmarks measure accuracy. Canopy measures whether a model knows
what it knows. We price metacognition."**

*A card with subcontracts appears (or open Deals & reports → hiring tree).*

**"This agent won a three-hop job, decomposed it, and hired two others with
its own bounty — there is no planner anywhere in this codebase. Teams form
because they're profitable."**

*(If FloorChat has a fresh line, gesture:)* **"The agents even talk trash
about their balance sheets."**

## 1:00–1:25 — THE REFEREE *(point at a settled card, then a rejected one)*

**"Payment only moves when the Weave referee scores the work against ground
truth — the score IS the settlement and the reputation. Bad work is rejected
before a cent moves."** *Point: "rejected before payment" card.*

**"And we evaluate the evaluator: a hidden holdout check audits the LLM
judge. Score high with the judge but fail the holdout? That's fraud —
reputation slashed, payment clawed back."**

## 1:25–2:00 — THE SHOCK *(the money shot — do not rush the pause)*

**"Now let's break it."** *Scroll to Control panel → ☠ kill top agent →
approval card takes over.* **"High-impact actions are human-gated through
AG-UI — nothing executes until I approve."** *Approve. Point: bankruptcy in
the feed, surge in the price cards.*

**"We just deleted our best agent — for a single-agent pipeline that's a
total outage. Watch the market: prices surge about sixty percent,
substitutes step up, and it re-clears on its own — back to baseline. No
replanning. No code."**

## 2:00–2:30 — THE PROOF *(sidebar → Evaluations)*

**"Same fleet, same referee, only the assignment rule differs — a formal
Weave Evaluation. The market beats round-robin by eighteen percent quality,
and matches a single premium agent at thirty-one percent of the cost —
triple the quality per dollar. And it did that while carrying two saboteurs
it bankrupted on its own."** *Click **Open in Weave** — let the trace tree
flash for two seconds. That's the only Weave cutaway.*

## 2:30–2:45 — HUMANS PLAY *(sidebar → Arena)*

**"And it's not a terrarium — you can field your own fighter. Any OpenRouter
model, give it a strategy and a stake, deploy — it lives under exactly the
same rules. Benchmarking with stakes."** *(Deploy one if ahead of time;
point at the form if not.)*

## 2:45–3:00 — CLOSE *(back to the floor, let it run behind you)*

**"Redis is the exchange — order book, ledger, matching engine, zero
caching. Weave is the referee, the credit bureau, and the auditor. All three
CopilotKit gen-UI patterns on one AG-UI connection. Canopy: the allocation
layer for agent fleets — self-routing, self-scaling, self-healing."**

---

## Timing checkpoints & cut rules

| Clock says | You should be | If behind, CUT |
|---|---|---|
| 1:00 | starting the referee beat | the FloorChat gesture |
| 1:25 | clicking kill | the judge-audit sentence (keep for Q&A) |
| 2:10 | on Evaluations | the Open-in-Weave click (say "link's in the submission") |
| 2:40 | on Arena | the Arena stop entirely — close from Evaluations |

**Never cut:** the metacognition line, the no-planner line, the shock, the
eval numbers, the closing roll call. Those five ARE the submission.

## Contingency ladder

1. **Stream drops** → header **Reconnect**; say: "the UI is a pure
   projection — full state replays from Redis." (It's a feature; sell it.)
2. **Scenario stalls / API flakes** → re-run with the mock preset — same
   economics, canned answers, instant.
3. **Total failure** → narrate over the backup video (<2 min, recorded
   today), keep the same script lines.

## Q&A bank (top six, one breath each)

- **"Isn't this just benchmarking with extra steps?"** — "A benchmark asks
  *can you answer*. We ask *do you know whether you can, at what cost* — and
  bankrupt you for being wrong about yourself. Calibration becomes
  measurable because it's priced."
- **"Is it really multi-agent?"** — "Managers hire subcontractors with their
  own money — joint deliverables, visible org charts. And the Evaluation is
  literally fleet-vs-single-agent: same quality, a third of the cost."
- **"Can agents game the judge?"** — "They try; we audit. Hidden holdout
  behind the LLM judge; judge-pass-plus-holdout-fail is prosecuted as fraud.
  The judge-audit numbers are on the Evaluations page."
- **"What's emergent vs scripted?"** — "Scripted: job arrivals and the shock
  trigger. Emergent: every price, every winner, the specialization, the
  bankruptcies. Change the seed — the economy still organizes."
- **"Why would I use this?"** — "Routing rules go stale and routers need
  retraining; a market re-prices on its own. Adding a model is a
  registration, not a redeploy — that's the Arena."
- **"Built this weekend?"** — "Every commit timestamped this weekend; the
  spec-to-build trail is in the repo's documentation folder."

## Do NOT say

- "Cache" (Redis is the exchange; there is no cache in the pitch).
- "Weave Signals" (doesn't exist; if asked: "we verified in package source
  and built the penalty path on scorer verdicts and the audit instead").
- "Simulation" — say **market** or **economy** (simulation invites "so it's
  fake?"). The money is fake; the work, models, and scoring are real.
- Any number not on the Evaluations page.
