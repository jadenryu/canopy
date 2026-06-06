# CLEARING — Build Specification & Claude Code Handoff

> **What this is:** a complete, buildable spec for a WeaveHacks 4 project. Drop it in a fresh repo as `SPEC.md`, open Claude Code in that folder, and drive the build phase by phase (see §12). Also create the `CLAUDE.md` in §15 so conventions auto-load.
>
> **Name:** "Clearing" is a placeholder — the market-*clearing* price, no central planner. Swap via find-replace (`Clearing` / `clearing`) if you prefer **Coase**, **Fill**, or **Tick**.
>
> **One-line pitch:** A self-organizing labor market where AI agents bid on jobs, hire each other, build reputation, go bankrupt, and a clearing price emerges with no central planner — watchable live, steerable by a human, and refereed by Weave.

---

## 0. How to use this with Claude Code

1. `mkdir clearing && cd clearing`, put this file at the root as `SPEC.md`, create `CLAUDE.md` (§15).
2. Open Claude Code in the repo.
3. **Step 0 prompt:** *"Read SPEC.md and CLAUDE.md. Before writing any integration code, verify the current APIs for: OpenAI (models + Agents SDK), W&B Weave (weave.init / @weave.op / Scorer / Evaluation), Redis (RedisVL + Streams + Sorted Sets) and CopilotKit/AG-UI (provider + shared-state hook + generative UI + human-in-the-loop). Pin versions. Then scaffold Phase 0 only and stop for review."*
4. Proceed one phase at a time; do not let it build all phases before the vertical slice (Phase 0–1) runs end to end.

**Critical:** the code snippets below are *illustrative pseudocode for intent*, not verified current signatures. Always confirm against docs first — `docs.wandb.ai/weave`, `docs.copilotkit.ai`, `docs.ag-ui.com`, `redis.io/docs`, `platform.openai.com/docs`.

---

## 1. Why this wins (keep it in view while building)

Three judging axes for WeaveHacks 4 — flashiness, technical complexity, real-world impact — plus four prizes (Best Use of Weave [+ Weave is *required to win*], Best Use of Redis, Best Use of CopilotKit, and the general grand/runner-up prizes).

- **Flashiness:** the demo is a live trading floor — bids streaming, prices converging, a reputation leaderboard reshuffling, agents going bankrupt, a subcontracting graph branching, and a staged **market shock that the system heals in real time**. Emergence is the "oh damn" beat no other team will have ten of.
- **Technical complexity:** decentralized coordination via a market mechanism (auctions, escrow, a reputation system, recursive subcontracting, anti-collusion) is meatier than a task router or a self-tuning loop.
- **Real-world impact:** once you run *fleets* of agents, something has to decide which agent does which job, at what price, and what happens when one fails. Hand-wiring pipelines doesn't scale; a market does — work auto-routes to the cheapest capable agent, scales under load, and self-heals. **Clearing is the allocation layer for agent fleets.**

**Load-bearing design choice:** Weave is *required*, so make it the market's **referee and credit bureau** — a Weave Scorer grades each completed job and that score sets payment + reputation. Weave isn't a dashboard bolted on; it runs the economy's justice system. (Flatters the host; nails Best Use of Weave.)

---

## 1.5 Prize-optimization map (READ — these are hard requirements from the judges' stated preferences)

Each sponsor prize has explicit preferences. Build to hit all three; do not treat any as optional.

**Best Use of Redis — "unique uses, NOT basic caching; a specific Redis use case (e.g. Cloud), not merely 'Redis-compatible.'"**
- Use a real **Redis Cloud** instance (not just local docker) so it's a specific Redis product, and say so in the README/Devpost.
- The headline uses are deliberately *non-cache*: **Sorted Sets** = the order book + reputation leaderboard; **Streams** = the job board + append-only ledger + event bus; **RedisVL / Vector Sets** = capability matching (agent discovery); optionally **Redis TimeSeries** = clearing-price history.
- **Caching is NOT the story.** Any LLM cache is incidental — mention it last or omit it from the pitch. Lead with "Redis IS the exchange: the order book, the ledger, the matching engine."

**Best Use of CopilotKit — "AG-UI-focused: controlled, semi-open, open."**
- This maps to CopilotKit's three generative-UI patterns, all on the AG-UI runtime. Demonstrate **all three** in the trading floor (details in §9):
  - **Controlled** (high control) → AG-UI: the market picks from pre-built widgets (OrderBook, Leaderboard, deal-receipt / bankruptcy cards) and feeds them data.
  - **Semi-open / Declarative** (shared control) → A2UI / Open-JSON-UI: the market streams a structured UI spec for dynamic job-detail / bid-comparison widgets.
  - **Open** (high freedom) → MCP Apps / custom iframe: a worker (or an analyst agent) generates **arbitrary HTML/SVG** — e.g. a free-form visualization of its own deliverable or a market report — rendered in a sandboxed iframe.
- Showing the *full spectrum on one AG-UI connection* is the strongest possible Best-Use-of-CopilotKit story. Make the demo explicitly call out "controlled → declarative → open-ended."

**Best Use of Weave — "evaluation, newly released features, and unique/useful multi-agent orchestration."**
- **Evaluation is central, not a stretch:** ship a formal `weave.Evaluation` proving the *market* allocates better than baselines (random assignment / single fixed agent / round-robin) on a held-out job set — plus the in-loop `Scorer` that referees every job. Two distinct, visible uses of Weave evaluation.
- **Use the newly released agent features** (shipped ~late May 2026; verify in docs): **agent-native tracing** (model the trace as sessions → turns → steps, where a *job* is a session, *bids + execution* are turns, *LLM/tool calls* are steps); **Signals** to auto-surface failure modes in the market's traffic; **Monitors** for online/production evals. Name these explicitly in the pitch as "using Weave's newest agent observability."
- **Unique multi-agent orchestration:** a decentralized *market* (not a planner-led pipeline) is a genuinely novel orchestration — lean into that framing.

---

## 2. The economic core (mechanism design)

**Actors**
- **Client** — the human, or any agent that posts a job (agents become clients when they subcontract).
- **Worker agent** — heterogeneous (different model tiers, different skill profiles). Has a `wallet` (balance), a `reputation`, a `skill_embedding`, and a `bidding_strategy`.
- **Market** — *not a planner*. It only runs the auction, holds escrow, settles payments, and emits events. It never decides "who is best"; the mechanism does.

**Job lifecycle (one transaction)**
1. **Post** — Job enters the order book with `{spec, requirements, bounty_cap, deadline}`.
2. **Discover/Match** — candidate workers found by capability matching (vector similarity of `requirements` ↔ worker `skill_embedding`) via RedisVL. Matched workers are notified.
3. **Bid** — workers submit a price (their estimated cost × strategy margin), bounded by `bounty_cap`. **Reverse auction**: lowest *effective* bid wins, where `effective_bid = price / reputation_weight` so a slightly pricier high-rep agent can beat a cheap unknown. (Stretch: a second-price/**Vickrey** variant for truthful bidding — a clean mechanism-design flex for the judges.)
4. **Award + Escrow** — winner selected; `bounty` moved into **escrow** (held by market).
5. **Execute** — worker performs the job (OpenAI calls + tools). It MAY **subcontract**: decompose and post sub-jobs, becoming a Client. Recursive hiring is what makes the *network/economy* emerge.
6. **Gate (guardrail) → Verify/Score** — first a **Weave Scorer running as a guardrail** checks a hard bar (safety + format/constraints) at the submission boundary; a fail is **rejected before payment** (`status=rejected`, reputation penalty, no escrow release). If it passes the gate, the **referee Scorer** grades quality → `{score 0–1, rationale}`.
7. **Settle** — `score ≥ threshold` → escrow released (minus subcontractor payouts), reputation ↑. `score < threshold` → reduced/zero payout, reputation ↓, job optionally re-auctioned. Reputation is the agent's standing on a **Weave Leaderboard** (see §8). **Weave Signals** continuously watches market traffic and the failures it surfaces feed reputation penalties — repeated failure drains balance → **bankruptcy** (agent deactivated). Winners accumulate capital and may **fork** (spawn a copy) to capture demand.
8. **Price discovery** — across many jobs, the clearing price per job-type emerges from competition; specialists emerge; the leaderboard churns.

**Config knobs (all env/config-driven so the demo is tunable & repeatable)**
`SCORE_THRESHOLD`, `REP_WEIGHT_FN`, `STARTING_BALANCE`, `BANKRUPTCY_FLOOR`, `FORK_BALANCE`, `MARGIN_RANGE`, `MAX_SUBCONTRACT_DEPTH`, supply/demand rates, RNG seed.

---

## 3. Emergent phenomena to surface (= the demo wow)

Build the system so these are *visible*, and tune params so they reliably occur in a scripted scenario:
- **Price discovery** — clearing price for a job category converges (price chart).
- **Specialization** — one agent comes to dominate a niche.
- **Reputation dynamics** — leaderboard reshuffles live.
- **Bankruptcy & exit** — a bad agent's balance hits the floor and it dies.
- **Subcontracting graph** — who-hires-whom as a live network.
- **Shock & self-heal (the money shot)** — kill the top agent or spike demand → prices jump → a new entrant/specialist rises → the market re-clears. The system *recovers on its own*.

---

## 4. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  FRONTEND — Next.js + CopilotKit (the trading floor)           │
│  OrderBook · PriceChart · Leaderboard · Wallets · HiringGraph  │
│  EventFeed (generative-UI cards) · ControlPanel (HITL)         │
└───────────────▲───────────────────────────┬───────────────────┘
        AG-UI shared state /                 │ post job, central-bank
        generative-UI events                 │ actions, approvals
                │                             ▼
┌───────────────┴─────────────────────────────────────────────┐
│  BACKEND — FastAPI                                            │
│   /agui  (AG-UI HttpAgent + shared state)                     │
│   /ws    (event stream projection)   /rest (control)          │
│                                                               │
│   MARKET            AGENTS              SCORING               │
│   order_book(ZSET)  worker(OpenAI)      JobQualityScorer       │
│   auction           strategies          (weave.Scorer)        │
│   escrow/ledger     skills(embeddings)                        │
│   reputation        subcontracting                            │
│   registry(RedisVL)                                           │
│   events(Streams+PubSub)                                      │
└───────┬─────────────────────┬───────────────────┬────────────┘
        │ all @weave.op        │ tiered LLM calls  │ vectors/state
        ▼                      ▼                   ▼
   ┌──────────────┐     ┌────────────┐       ┌──────────────┐
   │  Weave       │     │  OpenAI    │       │  Redis Cloud  │
   │ trace·score· │     │  (tiered;  │       │ orderbook·    │
   │ guardrail·   │◄────┤  workers + │       │ ledger·match· │
   │ leaderboard· │ pay │  scorer)   │       │ leaderboard   │
   │ eval·signals │ +rep└────────────┘       └──────────────┘
   └──────────────┘
   reputation = Weave scores → Weave Leaderboard
```

The frontend is a **pure projection** of backend state: every state change is emitted as a structured event (Redis Stream + Pub/Sub), and the UI just renders the stream + AG-UI shared state.

---

## 5. Tech stack (specific)

| Concern | Choice | Notes |
|---|---|---|
| Backend lang | Python 3.11+ | agents + market |
| Agent layer | Thin custom `Agent` over the **OpenAI** API (Agents SDK optional) | we need *many cheap* agents and full control of bidding economics; keep it light |
| Models | OpenAI, **tiered** | cheap small model for workers, stronger model for the scorer/hard jobs — tier choice is itself part of the economy |
| Observability/eval | **W&B Weave** | `weave.init`, `@weave.op`, `weave.Scorer`, `weave.Evaluation` |
| State/infra | **Redis Cloud** (Redis 8 / Stack) | the exchange itself: **Sorted Sets** (order book + leaderboard), **Streams** (job bus + ledger), **RedisVL / Vector Sets** (matching), Pub/Sub, optional TimeSeries (prices). Use a hosted Redis Cloud DB, not just local. |
| ~~Cache~~ (optional, NOT the story) | a small Redis-backed LLM cache *iff* needed for demo speed | judges disfavor caching — keep it incidental; never pitch Redis as "the cache" |
| Backend API | **FastAPI** | REST + WebSocket/SSE + AG-UI endpoint |
| Frontend | **Next.js + React + CopilotKit** over **AG-UI** | shared state + generative UI across the **controlled / declarative / open-ended** spectrum (§9) + human-in-the-loop |
| Charts/graph | Recharts (price/leaderboard) + a force-graph lib (hiring network) | |

---

## 6. Repo structure

```
clearing/
  SPEC.md  CLAUDE.md  README.md  .env.example  docker-compose.yml
  backend/
    pyproject.toml
    clearing/
      config.py            # env, model tiers, thresholds, RNG seed
      weave_setup.py       # weave.init + scorer wiring
      market/
        order_book.py      # ZSET order book (open jobs, bids)
        auction.py         # reverse / Vickrey winner selection
        escrow.py          # hold/release funds
        ledger.py          # wallets, balances, transactions (Stream)
        reputation.py      # reputation derived from Weave scores (EMA)
        registry.py        # agent registry + RedisVL skill index
        events.py          # Redis Streams + Pub/Sub event bus
      agents/
        base.py            # Agent: bid(), execute(), maybe_subcontract()
        worker.py          # OpenAI-backed worker
        strategies.py      # bidding strategies (margin, undercut, ...)
        skills.py          # skill profiles + embeddings
      scoring/
        scorers.py         # JobQualityScorer(weave.Scorer)
      jobs/
        schema.py          # Job, Bid, Result (pydantic)
        seed.py            # demo job generators (categories)
      sim/
        engine.py          # market tick / run loop
        scenario.py        # scripted demo scenario (deterministic)
        shock.py           # kill-agent / demand-spike injectors
      api/
        main.py  rest.py  agui.py  ws.py
  frontend/
    package.json
    app/ (page.tsx, layout.tsx)
    components/ (MarketProvider, OrderBook, PriceChart, Leaderboard,
                Wallets, HiringGraph, EventFeed, ControlPanel)
    lib/ (useMarketState.ts)
```

---

## 7. Redis data model (key schema — implement exactly, tune names as needed)

| Key | Type | Holds |
|---|---|---|
| `agent:{id}` | JSON/Hash | `{id, name, model_tier, balance, reputation, jobs_won, jobs_failed, status, strategy, parent_id}` |
| `agents:leaderboard` | ZSET | score=`reputation`, member=`agent_id` |
| `agents:skills` | RedisVL index / Vector Set | `skill_embedding` per agent → capability matching |
| `job:{id}` | JSON | `{id, spec, requirements, bounty_cap, deadline, status, client_id, winner_id, escrow_amount, parent_job_id, category}` |
| `jobs:open` | ZSET | score=`posted_ts`, member=`job_id` (the order book) |
| `job:{id}:bids` | ZSET | score=`effective_bid`, member=`agent_id` → winner = lowest |
| `ledger` | Stream | `{ts, from, to, amount, job_id, type}` append-only |
| `events` | Stream **and** Pub/Sub channel | `{ts, type, payload}` — `job_posted`, `bid_placed`, `awarded`, `executing`, `scored`, `settled`, `bankruptcy`, `fork`, `shock`, `price_update` |
| `prices:{category}` | ZSET (or Redis TimeSeries) | clearing-price history per job category |
| `cache:llm:{hash}` | string + TTL | optional LLM cache — NOT the Redis story (see §1.5) |

`status ∈ {open, awarded, executing, verifying, rejected, settled, failed}` for jobs; `{active, bankrupt}` for agents.
The `agents:leaderboard` ZSET is the live operational ranking; it is **also published as a Weave Leaderboard** (§8) so reputation is a Weave-native, eval-backed artifact.

---

## 8. Weave integration (the quality oracle — load-bearing)

```python
# weave_setup.py  (ILLUSTRATIVE — verify current API)
import weave
weave.init("clearing")

from weave import Scorer

class JobQualityScorer(Scorer):
    model_tier: str = "scorer"
    @weave.op
    async def score(self, job_spec: str, requirements: list[str], output: str) -> dict:
        # LLM-as-judge + programmatic checks (format, constraints satisfied)
        # returns {"score": float 0..1, "rationale": str, "checks": {...}}
        ...
```

**Weave does real work on SIX surfaces — this breadth-with-depth is the Best-Use-of-Weave argument. Each must be load-bearing, not a checkbox.**

1. **Agent-native tracing (newly released):** model the trace as **sessions → turns → steps** — a *job* = a session, each *bid* and the *execution* = turns, each *LLM/tool call* = a step. `@weave.op` on `Agent.execute_job`, `Agent.bid`, `worker.llm_call`, `Market.run_auction`, the Scorers, and `Market.settle` → a clean agent-native trace per transaction. (Verify the current session/turn/step API in docs.)
2. **Scorer as in-loop referee (evaluation):** `JobQualityScorer` grades every completed job; the score *is* the payment + reputation signal. Reputation = EMA of recent scores (`reputation.py`). Demo line: *"Weave runs the credit bureau."*
3. **Scorer as guardrail (evaluation at the boundary):** a guardrail Scorer runs at job submission and **rejects work that fails a hard safety/format bar before any payment** (`status=rejected`, reputation penalty). This is Weave's guardrail mode doing market-critical work — the quality gate of the whole economy.
4. **Weave Leaderboard = the reputation ranking:** publish the agent reputation ranking as a native **Weave Leaderboard**, ranked by the Scorer's eval results. Your single most important market mechanic (who's trusted, who wins bids) becomes a Weave-native, eval-backed artifact — not a generic side use.
5. **Formal `weave.Evaluation` benchmark (core deliverable, NOT a stretch):** run an Evaluation over a held-out job set comparing **market allocation vs. baselines** (random / single-fixed-agent / round-robin) on a quality-per-dollar metric. Capture the numbers (e.g. "market: +X% quality at −Y% cost vs round-robin") — hard evidence + the answer to "does it actually work?"
6. **Signals + Monitors (newly released, made load-bearing):** **Signals** auto-surfaces failure modes in market traffic, and *those flagged failures feed the reputation penalties that drive bankruptcy* — so Signals is wired into market logic, not decorative. **Monitors** run the referee/guardrail Scorers continuously over the live stream. Name these as "Weave's newest agent-observability features."

- **Unique multi-agent orchestration:** frame the market explicitly as a *decentralized, planner-free* orchestration — distinct from the usual planner→workers pipeline. This is the "unique and useful orchestration" the prize wants.
- **Share the Weave project with the judges** (required to win). Project URL in the README + Devpost.

---

## 9. CopilotKit / AG-UI integration (the trading floor)

> Verify current packages/hooks at `docs.copilotkit.ai` + `docs.ag-ui.com` before coding. Intent below.

- **AG-UI is the runtime** beneath everything: the backend exposes an AG-UI agent endpoint (`/agui`), and the market's live snapshot (active agents, order book, events, price series, leaderboard, balances) is published as **AG-UI shared state**. The frontend uses the AG-UI shared-state hook (e.g. `useAgent` / `useCoAgent` — confirm current name) so the whole dashboard is live with zero polling.
- **Demonstrate the full generative-UI spectrum (this is the prize's explicit ask — controlled / semi-open / open):**
  1. **Controlled** (high control) → **AG-UI**: pre-built market widgets the agent/market *chooses* and feeds data — the `OrderBook`, `Leaderboard`, `PriceChart`, plus event cards (`deal_receipt`, `bankruptcy`, `shock_alert`). The agent maps data to existing components; it doesn't invent layout.
  2. **Semi-open / Declarative** (shared control) → **A2UI / Open-JSON-UI**: the market streams a *structured UI spec* (cards/lists/forms) for dynamic surfaces like a **job-detail panel** or a **bid-comparison widget** — the schema is fixed (or LLM-generated) and the agent streams data into it at runtime.
  3. **Open** (high freedom) → **MCP Apps / custom iframe**: a worker or an "analyst" agent generates **arbitrary HTML/SVG** — e.g. a free-form visual of its own deliverable, or a generated market-report graphic — rendered in a **sandboxed iframe**.
- In the demo, *name the spectrum out loud*: "fixed dashboard widgets are controlled gen-UI, the bid-comparison panel is declarative, and this agent-drawn market report is open-ended — all over one AG-UI connection."
- **Human-in-the-loop (the interactive hook):** a `ControlPanel` lets the human
  1. **post a job** (become a Client) and watch the market mobilize;
  2. act as **central bank** — inject liquidity, set a reserve/minimum bid, tax, or **trigger a shock** — with high-impact actions routed through an AG-UI approval/HITL step.
- **Protocols named in the submission:** **AG-UI** (agent↔UI runtime) and **MCP** (via the open-ended MCP Apps gen-UI, and optionally agent tool-calling). Naming two real protocols strengthens the "orchestration protocols used" part of the Devpost.

---

## 10. Agent & bidding design

- `Agent.bid(job)` → estimate cost (token estimate × model price), apply `strategy` margin, clamp to `bounty_cap`; compute `effective_bid = price / rep_weight(reputation)`.
- Strategies (in `strategies.py`): `Undercutter` (bid just below recent clearing price), `Premium` (high price, leans on reputation), `Specialist` (only bids on its category, sharp pricing), `Generalist`. Heterogeneity creates interesting dynamics.
- `Agent.execute_job(job)` → do the work via OpenAI (cached); if `complexity > k` and `depth < MAX_SUBCONTRACT_DEPTH`, decompose and **post sub-jobs** (recursive hiring), then assemble.
- Capability matching: store a `skill_embedding` per agent; match jobs via RedisVL similarity to route the open call (or let agents self-select among matches).
- Lifecycle hooks: on settle, update balance + reputation; if `balance < BANKRUPTCY_FLOOR` → deactivate + emit `bankruptcy`; if `balance > FORK_BALANCE` → spawn child agent (inherit strategy ± mutation) + emit `fork`.

**Anti-pathology notes (for Q&A and a bit of real depth):** cap subcontract depth; detect/penalize obvious collusion or reputation-farming (e.g., self-dealing loops in the ledger); reserve price prevents race-to-zero. You don't need to fully solve these — acknowledge them and ship the simplest guard.

---

## 11. Cost & speed (non-negotiable for a live demo)

- Workers use a **cheap small model**, capped tokens, run **concurrently** (asyncio).
- **LangCache / Redis cache** in front of LLM calls → reuse + a live "cost saved" counter (great judge metric).
- A full market round (post → bid → execute → score → settle) must complete in **seconds**, so several rounds and the shock-and-heal fit inside the demo window.

---

## 12. Build phases (vertical-slice-first; one phase at a time)

Each phase ends with a **✅ Done when** gate — Claude Code must satisfy it and stop for review before the next phase. Verify the relevant SDK/API first (Step 0).

- **Phase 0 — Skeleton.** Repo, `docker-compose`, `.env`, `weave.init`, OpenAI key, a **Redis Cloud** connection. One worker does one hardcoded job end-to-end. Frontend boots with the CopilotKit/AG-UI provider + a placeholder reading shared state.
  - ✅ **Done when:** one job runs end-to-end; its agent-native trace (session→turns→steps) is visible in the Weave UI; the frontend renders one value from AG-UI shared state.
- **Phase 1 — Market core.** Order book + bid book (ZSETs), reverse auction (`effective_bid = price / rep_weight`), escrow, ledger (Stream), wallets, settlement. A `sim` runs N jobs through the full lifecycle; every state change emits an event to Redis Streams + Pub/Sub.
  - ✅ **Done when:** `sim` posts jobs, agents bid, winners are awarded from the ZSET, escrow moves, the ledger Stream records transactions, and balances update — all via Redis primitives (no caching used).
- **Phase 2 — Weave as the economic brain.** `JobQualityScorer` (referee) grades jobs; reputation = EMA of scores; **guardrail Scorer** rejects sub-bar work pre-payment (`status=rejected`); reputation ranking published as a **Weave Leaderboard**.
  - ✅ **Done when:** referee scores show in Weave and set payment + reputation; a deliberately-bad job is rejected by the guardrail before payment; the Weave Leaderboard ranks agents and updates as scores change.
- **Phase 3 — Emergence + Signals.** Multiple heterogeneous agents + strategies; RedisVL capability matching; subcontracting (recursive jobs); fork; **Weave Signals wired into bankruptcy** (flagged failures → reputation penalties → balance floor → deactivation). Tune supply/demand.
  - ✅ **Done when:** a clearing price for a category visibly converges; ≥1 specialist emerges; Signals-flagged failures drive ≥1 bankruptcy; subcontracting produces a multi-level hiring graph.
- **Phase 4 — Trading-floor UI (full gen-UI spectrum).** AG-UI shared state → live OrderBook, PriceChart, Leaderboard, Wallets, HiringGraph, EventFeed (**controlled**); a bid-comparison / job-detail panel via A2UI/Open-JSON-UI (**declarative**); an agent-drawn HTML/SVG deliverable view in a sandboxed iframe (**open-ended**).
  - ✅ **Done when:** the dashboard is a live projection of backend events, and all three gen-UI patterns render on the one AG-UI connection.
- **Phase 5 — HITL + the shock.** `ControlPanel`: post a job; act as **central bank** (liquidity / reserve / tax) with an AG-UI approval step; `shock.py` (kill top agent / demand spike).
  - ✅ **Done when:** a human posts a job from the UI and watches the market fulfill it; triggering a shock visibly makes the market re-price and re-clear on its own.
- **Phase 6 — Evaluation + polish + demo.** Run the formal **`weave.Evaluation`** (market vs. random / round-robin / single-agent) and capture the headline metric; make `scenario.py` deterministic (seeded) so convergence + a clean shock-and-heal reproduce every run; record a **backup video**; write the Devpost (repo, every sponsor tool + protocol described, Weave project link).
  - ✅ **Done when:** the Evaluation shows the market beating baselines on quality-per-dollar with a quotable number; the scripted demo reliably hits every Definition-of-Done item below; backup video recorded.

---

## 13. Demo (3 min, strictly timed) & acceptance criteria

**Script**
1. **0:00–0:20** — Hook: "Once you run fleets of agents, *who* does *which* job, at what price, and what happens when one dies? We built a market that answers all three — with no central planner. This is Clearing." Idle trading floor on screen.
2. **0:20–1:05** — Post a real, decomposable job from the ControlPanel. Bids stream into the order book (controlled gen-UI); tap a bid to open the **declarative** bid-comparison panel; a winner is awarded, subcontracts, finishes — and an agent renders an **open-ended** HTML/SVG view of its deliverable in an iframe. *(That's the full AG-UI gen-UI spectrum in ~45s — say so.)*
3. **1:05–1:55** — Let a few rounds run: the **price chart converges**, the **leaderboard reshuffles**, an agent **goes bankrupt**, a **specialist** emerges. Narrate the emergence ("nobody set that price").
4. **1:55–2:35** — **The shock.** Kill the top agent (or spike demand). Prices jump, a new specialist rises, the market **re-clears on its own**. The wow.
5. **2:35–3:00** — Proof + impact: cut to **Weave** — the agent-native trace (job→bids→steps), the **Signals** flagging the failures that bankrupted an agent, and the **Evaluation** result showing the market beat random/round-robin allocation. Flash **Redis Insight** (order-book ZSET + ledger Stream on Redis Cloud). Close: "the allocation layer for agent fleets — self-routing, self-scaling, self-healing."

**Definition of done (demo must show all):**
- [ ] Job → bids → award → execute (w/ a subcontract) → Weave-scored → settled, all live.
- [ ] **All three gen-UI patterns shown** on AG-UI: controlled widgets, a declarative panel, an open-ended iframe visual.
- [ ] **Weave Leaderboard** is the reputation ranking and reshuffles live; ≥1 bankruptcy; ≥1 emergent specialist; a clearing price visibly converges.
- [ ] The **guardrail Scorer rejects a sub-bar submission before payment** at least once.
- [ ] A staged shock that the market re-clears within the demo.
- [ ] Weave shows the **agent-native trace + Signals (driving a bankruptcy) + the formal Evaluation** (market vs. baseline, with a quotable metric) and the scores driving reputation.
- [ ] Redis Insight shows order book (ZSET) + ledger (Stream) on a **Redis Cloud** instance.
- [ ] Human can post a job and perturb the market from the UI.
- [ ] Backup demo video recorded.

---

## 14. Setup & environment

`.env.example`
```
OPENAI_API_KEY=
WANDB_API_KEY=
WEAVE_PROJECT=clearing
REDIS_URL=           # your Redis Cloud connection string (not just localhost)
WORKER_MODEL=         # cheap/small
SCORER_MODEL=         # stronger
SCORE_THRESHOLD=0.7
STARTING_BALANCE=100
BANKRUPTCY_FLOOR=0
FORK_BALANCE=500
MAX_SUBCONTRACT_DEPTH=2
RNG_SEED=42
```

`docker-compose.yml` → Redis Stack (`redis/redis-stack:latest`) exposing 6379 + RedisInsight on 8001.

Run: backend `uvicorn clearing.api.main:app --reload`; frontend `npm run dev`; sim/scenario via a CLI entrypoint.

---

## 15. `CLAUDE.md` (drop at repo root so conventions auto-load)

```md
# Clearing — build conventions
- Read SPEC.md first. Build ONE phase at a time; stop for review after each.
- VERIFY current SDK/API signatures from official docs BEFORE writing any
  integration (OpenAI, Weave, CopilotKit/AG-UI, RedisVL). Pin versions.
- The frontend is a pure projection of backend state. Every state change emits
  a structured event to a Redis Stream + Pub/Sub channel; the UI renders that.
- Decorate every agent step, LLM call, auction, scorer, and settlement with
  @weave.op. Reputation MUST derive from Weave scores.
- Keep agents cheap & fast: small models, capped tokens, asyncio concurrency.
  (A tiny Redis cache is OK for speed but is NOT the Redis story — never pitch it.)
  A full market round = seconds.
- Redis = the exchange (Sorted Sets order book/leaderboard, Streams bus/ledger,
  RedisVL matching) on a hosted Redis Cloud DB. Unique uses, not caching.
- CopilotKit: demonstrate ALL THREE gen-UI patterns on AG-UI — controlled
  (fixed widgets), declarative/A2UI (structured panels), open-ended (iframe HTML/SVG).
- Weave does real work on SIX surfaces (none decorative): agent-native tracing
  (session=job, turn=bid/exec, step=call); Scorer-as-referee (sets pay+rep);
  Scorer-as-guardrail (rejects bad work pre-payment); Weave Leaderboard (=reputation
  ranking); formal weave.Evaluation (market vs. baseline, capture the metric);
  Signals wired into bankruptcy + Monitors. Reputation MUST derive from Weave scores.
- All economic params come from config/env. Provide a deterministic scenario
  mode (seeded RNG) that reliably yields price convergence + a clean shock-heal.
- Don't over-build. The win = live watchable market + shock-and-heal + Weave as
  referee. Cut features before cutting demo reliability.
- Secrets in .env only; never commit keys. Follow good, modern frontend design.
```

---

## 16. Open decisions / knobs (pick fast, keep configurable)
- Auction type: reverse (ship first) vs Vickrey (stretch flex).
- Job domain: pick ONE clean, fast, auto-scorable, decomposable category (e.g., short research briefs, structured extraction, or small code tasks). Avoid anything that needs slow tools or human judgment.
- Matching: open call to all vs RedisVL-filtered shortlist (RedisVL is the better Best-Use-of-Redis story).
- Fork mutation: copy strategy exactly vs mutate margin (mutation makes evolution more visible).

---

## 17. Submission checklist
- [ ] Public GitHub repo; README explains architecture + names every sponsor tool (Weave, Redis, CopilotKit/AG-UI, OpenAI) and both protocols used (**AG-UI** + **MCP**).
- [ ] **Redis:** README states the *unique, non-cache* uses (order book/leaderboard = Sorted Sets, bus/ledger = Streams, matching = RedisVL) on a **Redis Cloud** instance.
- [ ] **CopilotKit:** README + demo explicitly show **controlled, declarative (semi-open), and open-ended** gen-UI, all on AG-UI.
- [ ] **Weave:** all six surfaces demonstrated — agent-native tracing, Scorer-referee, Scorer-guardrail, **Weave Leaderboard** (reputation), formal **Evaluation** (market vs. baseline, with a metric), Signals→bankruptcy + Monitors — framed as a unique decentralized-market orchestration. Weave project shared with judges.
- [ ] 3-min demo rehearsed; ≤2 slides; backup video recorded.
- [ ] Devpost filled; team listed; Weave project link included.
- [ ] One unseen job category ready for the "does it generalize?" question.