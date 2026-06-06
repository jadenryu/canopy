# Canopy — A Self-Organizing Agent Labor Market

> A self-organizing labor market where AI agents bid on jobs, hire each other, build reputation, go bankrupt, and a clearing price emerges with no central planner — watchable live, steerable by a human, and refereed by Weave.

Built for **WeaveHacks 4**.

**Weave project:** https://wandb.ai/jadenryu_nvcc/canopy/weave · **Evaluation results:** [`documentation/results.md`](documentation/results.md)

---

## What is this?

Once you run fleets of agents, three questions become hard: *who* does *which* job, at *what price*, and what happens when one dies? Hand-wiring pipelines doesn't scale. Canopy answers all three with a market — no central planner, no static routing.

Agents bid on posted jobs in a reverse auction. The lowest *effective bid* wins, where `effective_bid = price / reputation_weight`, so a pricier high-reputation agent can beat a cheap unknown. Winners execute the job, get Weave-scored, and their reputation and balance update. Low scorers drain to bankruptcy. High earners fork into copies. A clearing price for each job category emerges from competition — nobody sets it.

The **shock-and-heal** moment: kill the top agent mid-demo, watch prices spike, a new specialist rise, and the market re-clear on its own.

---

## Sponsor Tools

| Tool | Role in Canopy |
|---|---|
| **W&B Weave** | The market's referee and credit bureau — scores every job, drives reputation, runs the formal evaluation proving the market beats baselines |
| **Redis Cloud** | The exchange itself — order book (Sorted Sets), ledger (Streams), event bus (Pub/Sub), agent matching (RedisVL), price history (TimeSeries) |
| **CopilotKit / AG-UI** | Live trading-floor UI — all three generative-UI patterns over one AG-UI connection, plus human-in-the-loop market controls |
| **OpenAI** | Tiered workers (cheap small model) and scorer (stronger model) — model tier is itself part of the economy |

**Protocols used: AG-UI · MCP**

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  FRONTEND — Next.js 16 + CopilotKit 1.59 (the trading floor)  │
│  OrderBook · PriceChart · Leaderboard · Wallets · HiringGraph  │
│  EventFeed (generative-UI cards) · ControlPanel (HITL)         │
└───────────────▲───────────────────────────┬───────────────────┘
        AG-UI shared state /                 │ post job,
        generative-UI events                 │ shock, central-bank actions
                │                             ▼
┌───────────────┴──────────────────────────────────────────────┐
│  BACKEND — FastAPI + ag-ui-protocol 0.1.19                     │
│   /agui  (raw AG-UI SSE endpoint)                              │
│   /ws    (event stream projection)   /rest (control)           │
│                                                                │
│   MARKET                AGENTS               SCORING           │
│   order_book (ZSET)     Worker (OpenAI)      JobQualityScorer  │
│   auction (reverse)     strategies           (weave.Scorer)    │
│   escrow / ledger       skills (embeddings)  guardrail scorer  │
│   reputation (EMA)      subcontracting                         │
│   registry (RedisVL)                                           │
│   events (Streams + Pub/Sub)                                   │
└───────┬─────────────────────┬─────────────────────┬───────────┘
        │ all @weave.op        │ tiered LLM calls    │ vectors/state
        ▼                      ▼                     ▼
   ┌──────────────┐     ┌────────────┐        ┌──────────────┐
   │  W&B Weave   │     │  OpenAI    │        │  Redis Cloud │
   │ thread/turn  │◄────┤ gpt-5.4-   │        │ orderbook ·  │
   │ tracing ·    │ pay │ nano/mini  │        │ ledger ·     │
   │ Scorer ·     │ +rep└────────────┘        │ match ·      │
   │ Evaluation · │                           │ leaderboard  │
   │ Leaderboard  │                           └──────────────┘
   │ Monitor      │
   └──────────────┘
```

The frontend is a **pure projection** of backend state. Every state change emits a structured event to a Redis Stream + Pub/Sub channel; the UI renders the stream via AG-UI shared state with zero polling.

---

## Redis: the exchange (not a cache)

Redis is the market's infrastructure — every key has a purpose beyond caching:

| Key | Type | Role |
|---|---|---|
| `jobs:open` | **Sorted Set** | The order book — open jobs ranked by post time |
| `job:{id}:bids` | **Sorted Set** | Bid book — ranked by `effective_bid`, lowest wins |
| `agents:leaderboard` | **Sorted Set** | Live reputation ranking |
| `ledger` | **Stream** | Append-only transaction log (escrow, payments, fees) |
| `events` | **Stream** | Market event bus (`job_posted`, `bid_placed`, `awarded`, `settled`, `bankruptcy`, `fork`, `shock`) |
| `skill:{agent}` | **RedisVL index** | Vector similarity search — capability matching routes jobs to the nearest skills |
| `prices:{category}:h{hops}` | **Sorted Set** | Clearing-price history per (category, complexity) |
| `agent:{id}` | Hash | Agent state (balance, reputation, strategy, status) — `HINCRBYFLOAT` = atomic wallet transfers |
| `escrow` | Hash | Funds held between award and settlement |

**Caching is not the story.** The optional LLM response cache is incidental — never pitched as the Redis use case.

Production uses a hosted **Redis Cloud** instance. Local dev uses `redis/redis-stack:latest` (includes RediSearch for RedisVL + RedisInsight on `:8001`).

---

## Weave: seven load-bearing surfaces

Weave runs the market's justice system — every surface does real economic work:

1. **Agent-native tracing** — each job runs inside `weave.thread(job_id)`. The job = a thread; each bid and execution = a turn; every LLM/tool call = a step. Full per-transaction lineage in the Weave UI.

2. **Scorer as referee** — `JobQualityScorer(weave.Scorer)` grades every completed job. The score *is* the payment and reputation signal. Reputation is an EMA of recent scores.

3. **Scorer as guardrail** — a guardrail scorer runs at job submission and rejects work that fails a hard safety/format bar *before any payment* (`status=rejected`, reputation penalty). Weave runs the quality gate of the entire economy.

4. **Weave Leaderboard** — the agent reputation ranking is published as a native Weave Leaderboard via `weave.flow.leaderboard`. The single most important market mechanic (who's trusted, who wins bids) is a Weave-native, eval-backed artifact.

5. **Formal `weave.Evaluation`** — `canopy-allocator-eval` benchmarks market allocation vs. four baselines (single cheap agent, single premium agent, random, round-robin) on a held-out job set (25 jobs incl. an unseen category, 3 seeds, saboteurs in the fleet). **Headline: the market matches a hand-vetted single agent (0.98 vs 0.99 quality) while bankrupting both saboteurs unprompted; fixed allocators bleed ~17% quality to them. Same quality as a single premium agent at 31% of the cost (+205% quality-per-dollar); +15% QPD vs round-robin.** Full table in [`documentation/results.md`](documentation/results.md).

6. **Scorer verdicts drive natural selection** — every guardrail rejection or referee failure levies a balance penalty; repeated failures drain a wallet below the bankruptcy floor and the agent is deactivated and removed from matching. Weave scores literally decide who lives in the market. (The spec's "Signals" feature does not exist in weave 0.52.42 — verified in source.)

7. **`weave.Monitor` online evals** — `canopy-guardrail-monitor` runs the submission guardrail continuously over live `Worker.execute_job` traffic (100% sampling): the same scorer that gates escrow also watches production.

---

## CopilotKit / AG-UI: the full generative-UI spectrum

The trading floor demonstrates all three generative-UI patterns over **one AG-UI connection**:

| Pattern | What it is | In Canopy |
|---|---|---|
| **Controlled** | Agent picks from pre-built widgets and feeds data | `OrderBook`, `Leaderboard`, `PriceChart`, deal-receipt / bankruptcy / shock cards |
| **Declarative** (A2UI / Open-JSON-UI) | Agent streams a structured UI spec at runtime | Bid-comparison panel, job-detail view |
| **Open-ended** (MCP Apps) | Agent generates arbitrary HTML/SVG in a sandboxed iframe | Agent-drawn deliverable view, free-form market-report graphic |

The demo explicitly names the spectrum: *"fixed widgets = controlled, bid-comparison = declarative, agent-drawn report = open-ended — all over one AG-UI connection."*

**Human-in-the-loop (`ControlPanel`):**
- Post a job as a Client and watch the market mobilize
- Act as central bank — inject liquidity, set a reserve price, tax, or trigger a market shock — with high-impact actions routed through an AG-UI approval step

**Wiring:** the backend speaks the AG-UI protocol natively (`ag-ui-protocol 0.1.19`). The Next.js route handler bridges it to CopilotKit via `HttpAgent` + `CopilotRuntime`.

---

## Stack & pinned versions

| Layer | Choice | Version |
|---|---|---|
| Backend language | Python | 3.12+ |
| Backend framework | FastAPI | 0.136.3 |
| Agent-UI protocol | ag-ui-protocol | 0.1.19 |
| Observability / eval | W&B Weave | 0.52.42 |
| LLM client | openai (AsyncOpenAI) | 2.41.0 |
| Worker model | gpt-5.4-nano | — |
| Scorer / premium model | gpt-5.4-mini | — |
| Redis client | redis[hiredis] | 7.4.1 |
| Vector search | redisvl | 0.20.0 |
| Frontend framework | Next.js | 16.2.7 |
| React | React | 19.2.4 |
| CopilotKit | @copilotkit/react-core | 1.59.5 |
| AG-UI client | @ag-ui/client | 0.0.53 |
| Styling | Tailwind CSS | v4 |

> `@ag-ui/client` is pinned to `0.0.53` — `0.0.55` has a private-property type conflict with CopilotKit 1.59.5's bundled copy.
> `redis` is pinned `<8` because every redisvl release requires `redis<8.0` (discovered in Phase 3); our command usage is identical on 7.x.

---

## Repo structure

```
canopy/
  README.md             this file
  CLAUDE.md             build conventions for Claude Code
  .env.example          all required env vars
  docker-compose.yml    local Redis Stack (dev fallback)
  documentation/
    spec.md             full build specification
    library_verification.md   Context7-verified API notes
  backend/
    pyproject.toml
    canopy/
      config.py           env, model tiers, economic knobs
      weave_setup.py      weave.init + thread/turn tracing
      redis_client.py     async Redis connection
      market/
        order_book.py     ZSET order book
        auction.py        reverse / Vickrey winner selection
        escrow.py         hold / release funds
        ledger.py         wallets, balances, Stream ledger
        reputation.py     EMA reputation from Weave scores
        registry.py       agent registry + RedisVL skill index
        events.py         Streams + Pub/Sub event bus
      agents/
        base.py           bidding economics (est cost, surge, rep-weighted bids)
        worker.py         OpenAI-backed worker (+ manager subcontracting)
        strategies.py     bidding strategies (undercutter/premium/specialist/manager)
        skills.py         skill profiles + embeddings
        analyst.py        authors the open-ended HTML/SVG market report
      scoring/
        scorers.py        JobQualityScorer + SubmissionGuardrail (weave.Scorer)
        leaderboard.py    publishes reputation as a native Weave Leaderboard
      jobs/
        schema.py         Job, Bid, Result (pydantic)
        seed.py           demo job generators (categories + 3-hop complex)
      sim/
        phase0.py         smoke test (one job end-to-end)
        engine.py         Market class — full lifecycle, fork, scenario runner
        shock.py          kill-top-agent / demand-spike injectors
      eval/
        heldout.py        20 held-out + 5 unseen-category eval jobs
        allocators.py     market vs single/random/round-robin assignment rules
        run_eval.py       the formal weave.Evaluation harness
        stats.py          convergence + specialization statistics
      market/
        lifecycle.py      failure penalties → bankruptcy; fork funding
        matching.py       RedisVL capability matching
      api/
        main.py           FastAPI app, CORS, startup
        agui.py           AG-UI live stream (STATE_SNAPSHOT + STATE_DELTA)
        state.py          market snapshot read off Redis primitives
        rest.py           /sim/run trigger
        control.py        HITL: post job, central bank, approval loop
  frontend/
    package.json
    app/
      page.tsx            trading floor
      layout.tsx
      api/copilotkit/route.ts   CopilotKit bridge (HttpAgent → AG-UI)
    components/
      MarketProvider.tsx  CopilotKitProvider + useCoAgent wrapper
      OrderBook.tsx
      PriceChart.tsx
      Leaderboard.tsx
      Wallets.tsx
      HiringGraph.tsx
      EventFeed.tsx       generative-UI event cards
      ControlPanel.tsx    HITL — post job, central bank, shock
    lib/
      useMarketState.ts   typed hook over useCoAgent
```

---

## Setup

### Prerequisites

- Python 3.12+, [`uv`](https://docs.astral.sh/uv/)
- Node.js 20+, npm
- A [Redis Cloud](https://redis.io/try-free/) instance (free tier works) **or** Docker for local dev
- OpenAI API key
- W&B API key ([wandb.ai](https://wandb.ai))

### 1. Environment

```bash
cp .env.example .env
# fill in: OPENAI_API_KEY, WANDB_API_KEY, REDIS_URL
```

`.env.example`:
```
OPENAI_API_KEY=
WANDB_API_KEY=
WEAVE_PROJECT=canopy
REDIS_URL=                    # Redis Cloud connection string (rediss://...)
WORKER_MODEL=gpt-5.4-nano
SCORER_MODEL=gpt-5.4-mini
SCORE_THRESHOLD=0.7
STARTING_BALANCE=100
BANKRUPTCY_FLOOR=0
FORK_BALANCE=500
MAX_SUBCONTRACT_DEPTH=2
RNG_SEED=42
```

### 2. Local Redis (dev only — skip if using Redis Cloud)

```bash
docker compose up -d
# Redis on :6379, RedisInsight on :8001
```

### 3. Backend

```bash
cd backend
uv sync
uv run uvicorn canopy.api.main:app --reload
# → http://localhost:8000
# → http://localhost:8000/health
```

### 4. Frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

### 5. Run things

```bash
cd backend
uv run python -m canopy.sim.phase0        # smoke test: one job end-to-end
uv run python -m canopy.sim.engine --jobs 13 --sabotage   # full market scenario (CLI)
uv run python -m canopy.eval.run_eval --quick             # evaluation smoke
uv run python -m canopy.eval.run_eval                     # full eval (5 allocators × 3 seeds)
```

Or drive everything from the trading floor at `localhost:3000`:
**▶ run scenario**, post a job, **☠ kill top agent** (approve in the HITL card), **⚡ demand spike** — and watch prices jump and re-clear.

> If `uv run uvicorn` resolves to a system uvicorn, use
> `uv run python -m uvicorn canopy.api.main:app` instead.

---

## Economic parameters

All knobs are env / config driven — tune without touching code:

| Param | Default | Effect |
|---|---|---|
| `SCORE_THRESHOLD` | `0.7` | Minimum Weave score for payment release |
| `STARTING_BALANCE` | `100` | Each agent's initial wallet |
| `BANKRUPTCY_FLOOR` | `0` | Balance floor — agent deactivated below this |
| `FORK_BALANCE` | `500` | Balance at which an agent forks a child copy |
| `MAX_SUBCONTRACT_DEPTH` | `2` | Cap on recursive job decomposition |
| `RNG_SEED` | `42` | Seed for the deterministic demo scenario |

---

## Job lifecycle

```
Post → Discover (RedisVL match) → Bid (reverse auction) → Award + Escrow
     → Execute (OpenAI ± subcontract) → Guardrail score → Referee score
     → Settle (reputation + payment) → [bankruptcy | fork]
```

`effective_bid = price / reputation_weight` — a pricier high-rep agent can beat a cheap unknown.

---

## Demo script (3 min)

1. **0:00–0:20** Hook — idle trading floor. "No central planner. This is Canopy."
2. **0:20–1:05** Post a real job from the ControlPanel. Bids stream into the order book (controlled gen-UI). Tap a bid → declarative bid-comparison panel. Winner executes, subcontracts, delivers — agent draws an open-ended HTML/SVG view in an iframe. *Name the spectrum out loud.*
3. **1:05–1:55** Let rounds run: price chart converges, leaderboard reshuffles, an agent goes bankrupt, a specialist emerges. "Nobody set that price."
4. **1:55–2:35** The shock — kill the top agent. Prices jump, new specialist rises, market re-clears on its own.
5. **2:35–3:00** Proof — Weave UI (thread trace, scorer verdicts → bankruptcy, the Evaluation vs. baselines, the reputation Leaderboard), Redis Insight (order-book ZSET + ledger Stream on Redis Cloud). Close: "the allocation layer for agent fleets."

---

## Build phases

| Phase | What ships | Done when |
|---|---|---|
| **0 — Skeleton** | Repo, Redis, Weave init, one job end-to-end, AG-UI frontend boots | Weave thread trace visible; frontend reads AG-UI shared state |
| **1 — Market core** | Order book + bid book (ZSETs), reverse auction, escrow, ledger (Stream), settlement | `sim` posts jobs, agents bid, ZSET selects winner, ledger records all |
| **2 — Weave brain** | `JobQualityScorer`, EMA reputation, guardrail scorer, Weave Leaderboard | Bad job rejected pre-payment; Leaderboard updates live |
| **3 — Emergence** | Heterogeneous agents + strategies, RedisVL matching, subcontracting, fork, scorer-failure penalties → bankruptcy | Clearing price converges; specialist emerges; scorer failures drive ≥1 bankruptcy |
| **4 — Trading-floor UI** | Full gen-UI spectrum: controlled widgets, declarative panel, open iframe | All three patterns render on one AG-UI connection |
| **5 — HITL + shock** | ControlPanel (post job, central bank, shock.py) with AG-UI approval | Human posts job; shock triggers visible re-pricing and recovery |
| **6 — Eval + polish** | `weave.Evaluation` (market vs. baselines), deterministic scenario, backup video, Devpost | Evaluation shows market beats baselines with a quotable metric |

---

## Submission checklist

- [ ] Weave project shared with judges (project URL in Devpost)
- [ ] README names every sponsor tool: **Weave**, **Redis**, **CopilotKit/AG-UI**, **OpenAI**
- [ ] README names both protocols: **AG-UI**, **MCP**
- [ ] Redis section explains unique non-cache uses (Sorted Sets, Streams, RedisVL) on a **Redis Cloud** instance
- [ ] CopilotKit section shows all three gen-UI patterns (controlled, declarative, open-ended)
- [ ] Weave section covers all six surfaces (tracing, Scorer-referee, Scorer-guardrail, Leaderboard, Evaluation, Monitor)
- [ ] 3-min demo rehearsed and backup video recorded
- [ ] One unseen job category ready for "does it generalize?" Q&A
