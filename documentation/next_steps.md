# Canopy — next steps (written 2026-06-07)

Ordered plan for what remains. P0 = demo/submission-critical, P1 = high-value
if time allows, P2 = stretch. Each item states what, why, where, and done-when.

## Current state (for context)

Done: market core, Weave referee/guardrail/leaderboard, RedisVL matching,
subcontracting, fork/bankruptcy, full trading-floor UI (all three gen-UI
patterns), HITL control panel, shock injectors, reward-hacking police,
lessons loop, arena + benchmark engine, model-centric fleet configurator,
formal allocator evaluation (`documentation/results.md`).

In flight (uncommitted): **floor chat** (`agents/chat.py` + state/agui/engine
wiring) — agents post one in-character line per round from their own stats +
latest lesson.

---

## P0-1 · Finish and commit the floor chat

- **What:** wire `round_chat()` into the engine's post-settle step, add the
  chat list to `market_snapshot()` + `DELTA_KEYS`, render a chat panel in the
  UI, commit.
- **Why:** it is the "agents access their own memory and talk after each
  round" feature from `additional_touches.md`; it is also the most visible
  proof that lessons/memory exist.
- **Done when:** a scenario run shows a chat line per active agent per round,
  streamed live; mock mode produces deterministic lines for the scripted demo.

## P0-2 · Fix the headline-evidence problem (the single_cheap tie)

The eval table shows the market **ties** `single_cheap` on quality (0.98 vs
0.99) and slightly loses on quality-per-dollar (0.354 vs 0.377). The +205% vs
`single_premium` and +15% vs `round_robin` numbers are good, but a judge who
reads the table will ask: "why not just use one cheap vetted agent?" The
answer is robustness — currently asserted, not measured. Make it measured:

- **a. Saboteur experiment (evaluation_plan §5.2).** The sim already supports
  `sabotage: true`. Run 30 jobs market-vs-round-robin with 2 saboteurs and
  capture: $ paid to saboteurs, bad jobs settled, jobs-until-bankruptcy.
  Append the table to `results.md`.
- **b. Shock-recovery number (evaluation_plan §5.1).** Run the deterministic
  scenario, kill the top agent at a fixed tick, measure ticks until clearing
  price + throughput return within 15% of pre-shock. Contrast line:
  "single agent: outage is total and permanent; market: re-cleared in N ticks."
- **c. Fix the convergence stat.** `results.md` shows
  `convergence_to_±10%: {}` for 2 of 3 seeds — either runs are too short for
  the detector or the band is too tight. Lengthen warm-up runs or widen the
  band until the stat reliably reports a number; an empty dict reads as
  "convergence didn't happen."
- **d. Reframe the pitch.** Lead with: "the market matches the best fixed
  agent's quality at 1/3 the cost of premium, **and** it is the only
  allocator that survives agent death and defunds saboteurs." Update
  `devpost.md` + `demo_script.md` once a–c produce numbers.
- **Done when:** `results.md` contains the saboteur table and recovery-time
  number, both quotable in one sentence each.

## P0-3 · Submission mechanics

- Record the backup video after P0-1/P0-2 land (spec §13 requirement).
- Rehearse the 3-minute script against `demo_script.md` with the deterministic
  scenario twice back-to-back; both runs must hit every Definition-of-Done beat.
- README/Devpost final pass: Weave project link, Redis Cloud (not local) named,
  all three gen-UI patterns named, AG-UI + MCP protocols named.
- **Done when:** video file exists; Devpost submitted with the eval numbers
  from P0-2.

---

## P1-1 · Semantic agent memory (Redis context retriever)

Upgrade the lessons loop from "inject the latest 5" to retrieval-by-relevance
(decided 2026-06-07; rationale in the conversation re: Redis Agent Memory
Server — hand-roll on RedisVL, do not deploy the separate server).

- **Write path:** at settlement, where lessons are already extracted, store
  `{agent_id, job_spec, lesson, score}` + a 256-dim embedding in a second
  RedisVL index (key `memory:{agent_id}:{job_id}`, `agent_id` as tag field).
- **Read path:** in `worker.execute_job`, query the agent's own memories with
  the job-spec embedding (reuse the vector `match_agents()` already computed),
  inject the top 2–3 lessons. Respect `worker_max_tokens=600` — lessons only,
  never transcripts.
- **Evidence:** add a memory-on/off ablation to the eval (config flag) and a
  "mean score vs jobs-completed" learning curve. Quotable: "agents with
  semantic memory improved +X% over 20 jobs."
- **Why P1 not P0:** new moving part; only add after the demo is stable, and
  keep a config kill-switch so the scripted demo can run memory-off if it
  hurts determinism.
- **Done when:** ablation shows a non-negative delta and the demo scenario
  still reproduces seeded.

## P1-2 · Interactive drill-downs (from `additional_touches.md`)

Every statistic/graph/container answers a click:

- Volume on the trading floor → per-agent bid list (current + previous bids).
- Leaderboard row → that agent's score history + lessons + Weave trace link
  (the `trace_url` field already exists on jobs).
- Activity/event feed entries → the underlying job detail panel (reuses the
  existing declarative `UISpec` path — this deepens the declarative gen-UI
  story rather than adding a new mechanism).
- **Done when:** no dead-end widgets on the trading floor; each panel's click
  target is discoverable (cursor/hover state).

## P1-3 · Clearing-prices tab redesign

Flagged confusing in `additional_touches.md`. Replace with: one chart per
category, converged-band shading (the ±10% band from P0-2c, so the stat and
the visual agree), event markers for shocks, and a one-line explainer of what
a clearing price is. **Done when:** a first-time viewer can say what the tab
shows without narration.

## P1-4 · Mid-run agent entry

`additional_touches.md` asks for custom agents joining a battle in progress
(next-round entry). The registry supports registration at any time; the gap
is (a) a UI affordance during a run, (b) the engine picking up new actives at
round start, (c) skill-index insertion before the next match call.
**Done when:** an agent added mid-scenario wins a job in a later round.
This is also a live-demo beat: "let's add a competitor right now."

---

## P2-1 · Question-type taxonomy

`additional_touches.md` raises it: with raw LLMs underneath, the honest split
is single-hop / multi-hop / comparative / unanswerable rather than topical
domains. Decision: **keep topical domains** — they are what makes RedisVL
specialist matching and emergent specialization work (a "multi-hop specialist"
is not a coherent skill profile). Add hop-type as a second, orthogonal label
(`hops` already exists on jobs) and report eval accuracy broken down by it.
Unanswerable questions are a good guardrail showcase: the correct behavior is
declining, and the guardrail/referee should reward that.

## P2-2 · Vickrey (second-price) auction variant

Config-flagged alternative in `auction.py`; mechanism-design talking point
("truthful bidding") for Q&A. Only if P0/P1 are done.

## P2-3 · Anti-collusion guard

Simplest version per spec §10: detect self-dealing loops in the ledger
(A pays B pays A on subcontracts) and apply a reputation penalty. Ship the
detector + one staged example; do not attempt a general solution.

## P2-4 · Weave Monitors

`weave.Monitor` exists in 0.52.42 (per CLAUDE.md note). If trivial to wire,
run the referee scorer as a continuous monitor over live traffic and mention
it as a sixth Weave surface; otherwise cut without regret.

---

## Explicitly not doing

- Redis Agent Memory Server as a separate service (P1-1 covers the need with
  the existing RedisVL stack).
- LLM caching as a pitch point (judges disfavor it; spec §1.5).
- Renaming domain categories to hop-type categories (breaks specialization).
- Any new feature after the backup video is recorded — past that point,
  reliability only.
