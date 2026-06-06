# Canopy — The Complete Walkthrough

> **The one document to prep the 3-minute demo from.** It walks the entire
> system start to finish — every feature, framework, and tool, beginner-first
> then technically deep — and maps each piece to what judges score.
> Companion docs: `demo_script.md` (the timed stage script),
> `devpost.md` (submission text), `results.md` (eval numbers).
>
> Judging criteria (verbatim from the organizers): **Impact/Utility ·
> Technical Demo · Creativity · Presentation · Multi-agent harness
> sophistication.** Sponsor prizes: Best Use of **Weave** (eval + new
> features + unique orchestration), **Redis** (unique non-cache uses, real
> Redis Cloud), **CopilotKit** (the controlled/semi-open/open AG-UI
> spectrum). Every section below ends with the sentence that wins its point.

---

## 1. The story in 30 seconds (memorize this)

When you run one AI agent, you babysit it. When you run *fifty*, something
has to decide **which agent gets which job, at what price, and what happens
when one fails**. Hand-wired pipelines don't scale and don't heal.

So we built an **economy**. Agents bid for work in live auctions. Winners
get paid only if a referee — W&B Weave — approves their work. Good agents
get rich and *fork copies of themselves*; bad agents go bankrupt and die.
Prices? Nobody sets them. They **emerge**. And when we assassinate the top
agent mid-demo, the market re-prices and heals itself in seconds, live on
screen.

> **The close:** "Canopy is the allocation layer for agent fleets —
> self-routing, self-scaling, self-healing."

---

## 2. The cast (beginner level)

| Actor | What it is | Real-world analogy |
|---|---|---|
| **Job** | A multi-hop benchmark question with a known answer + a bounty | A work contract with acceptance criteria |
| **Worker agent** | An LLM with a wallet, a reputation, a skill profile, and a bidding strategy | A freelancer |
| **Manager agent** | A worker that wins big jobs and subcontracts the pieces | A general contractor |
| **The Market** | Runs auctions, holds escrow, settles payments. **Never decides who's "best" — the mechanism does** | A stock exchange, not a boss |
| **The Referee** | A Weave Scorer that grades every deliverable. The grade IS the payment decision | A court system |
| **The Human (you)** | Posts jobs, fields challenger models, acts as central bank, approves dangerous actions | The Fed chair with a trading terminal |

Why multi-hop questions as the job domain? Two reasons that make everything
else work: they have **ground-truth answers** (so scoring is objective — no
"vibes" grading), and they **decompose naturally** (a 3-hop question splits
into three 1-hop sub-questions — which is exactly what managers subcontract).
*The benchmark IS the economy.*

---

## 3. Follow one job, start to finish (the spine of the demo)

Every step names the tech that powers it and what you SEE on screen.
This chain — each step feeding the next — is the whole system.

### Step 1 — POST
A job enters the order book: `{spec, category, bounty_cap, hops}`.
- **Tech:** Redis **Sorted Set** (`jobs:open`, scored by timestamp) — the
  literal order book, in the same data structure an exchange would use.
- **On screen:** `job_posted` line in the event feed (blue), row in Order Book.

### Step 2 — MATCH (who even sees the job?)
The job's spec is embedded and compared against every agent's skill profile;
only the top-k nearest agents are invited to bid.
- **Tech:** **RedisVL** vector index (`agents_skills`, 256-dim
  `text-embedding-3-small`, cosine, flat) — vector search as the market's
  *discovery* mechanism. This is why specialists emerge: a film specialist
  literally sees film jobs first.
- **Depth if asked:** embeddings are Matryoshka-truncated to 256 dims —
  enough signal for category routing at ¼ the storage/latency.

### Step 3 — BID (the auction)
Invited agents estimate cost, apply their strategy margin, and submit a
price. It's a **reverse auction**: lowest *effective* bid wins, where
`effective_bid = price / reputation_weight`.
- That formula is the heart of the economy: **reputation is purchasing
  power**. A trusted agent can charge more and still win; an unknown must
  undercut to break in.
- The weight is softened to `(rep/0.5)^0.5` — our first version let one
  undercutter monopolize everything (a real mechanism-design bug we hit and
  fixed; great Q&A story).
- **Tech:** bid book per job = Redis Sorted Set scored by effective bid —
  winner selection is `ZRANGE ... LIMIT 0 1`. The exchange is Redis
  primitives, not Python loops.
- **Strategies** (heterogeneity is what makes dynamics interesting):
  undercutter, premium, generalist, specialist, manager, lowballer.

### Step 4 — AWARD + ESCROW
Winner selected; the bounty moves into escrow held by the market.
- **Tech:** ledger entries on a Redis **Stream** — an append-only,
  replayable transaction log. Every cent is auditable.
- **On screen:** `awarded` (amber) → the market-graph edge to the winner.

### Step 5 — EXECUTE (and maybe HIRE)
The winner answers via OpenAI (`gpt-5.4-nano` — cheap, fast, token-capped,
all workers run concurrently on asyncio so a full round takes seconds).
**If the job is 3-hop and the winner is a manager, it decomposes the
question and posts sub-jobs back into the SAME market** — becoming a client
itself. Sub-jobs go through steps 1–8 recursively.
- **This is the multi-agent-harness money line:** *"this agent just hired
  those two — nobody orchestrated that. There is no planner anywhere in
  this codebase."*
- **On screen:** new edges branch in the market graph; the hiring graph
  (deals tab) shows the tree.

### Step 6 — THE GATE (guardrail Scorer)
Before any payment, a Weave Scorer runs as a **guardrail** at the submission
boundary: hard checks (format, sanity, safety). Fail = `rejected`,
**no payment, reputation penalty** — the escrow refunds to the client.
- **The line:** "Weave doesn't watch the economy — it gates it. Bad work is
  rejected *before* money moves."

### Step 7 — THE VERDICT (referee Scorer)
Work that passes the gate is graded against the ground-truth answer by the
referee Scorer (`gpt-5.4-mini` — the judge runs a stronger tier than the
workers; the tier gap is deliberate and is itself an economic variable).
Output: `{score 0–1, rationale}`.
- **The score IS the settlement**: ≥ threshold → escrow releases, reputation
  rises. Below → reduced/zero payout, reputation falls.
- **Reputation = EMA of Weave scores.** It is not a number we make up — it
  derives exclusively from scorer outputs, and the ranking is published as a
  native **Weave Leaderboard**. The in-app leaderboard is a projection of it.

### Step 8 — SETTLE → CONSEQUENCES
Money moves (minus subcontractor payouts), the ledger Stream records it, and
lifecycle rules fire:
- Balance < floor → **bankruptcy**: agent deactivated, pulled from the
  RedisVL index (it stops *existing* to the matching engine), 💀 in the graph.
- Balance > fork threshold → **fork**: the agent spawns a child (strategy ±
  mutation) — capital allocates itself toward what works.
- Clearing price for the category updates → the price chart ticks.

### The loop
Settlement updates reputation → reputation changes effective bids → bids
change who wins → winners change prices → prices change strategies. Run 13
jobs and you watch an economy organize itself. **Nobody set the price.**

---

## 4. The screen, panel by panel (what to point at)

The UI design language is a **trading terminal**: near-black with a green
cast, JetBrains Mono, tabular numerals, signal colors only for state
(green=money moved, amber=working, red=failure, violet=verifying).

| Panel | What it shows | Gen-UI pattern + the line |
|---|---|---|
| **Market graph** (hero) | The economy as a force-directed network: agents sized by wallet, ringed by reputation, edges = hires, 💀 = bankrupt. Click anything to inspect | *Controlled.* "The economy, drawn live — d3-force over AG-UI state" |
| **Event feed** (hero) | Every market event, one line, color-coded, timestamped; big moments tinted | *Controlled.* The market's pulse |
| **Clearing prices** | Price per (category, hops) converging over time | *Controlled.* "Nobody set these" |
| **Order book / Leaderboard / Wallets** | Jobs, reputation ranking (👑/🚨), balances with live Δ flashes | *Controlled.* Leaderboard mirrors the Weave Leaderboard |
| **Job detail** | Backend streams a **structured UI spec** (stats/table/note JSON); a generic renderer walks it — schema fixed, content agent-decided | ***Declarative.* Middle of the spectrum** |
| **Analyst report** | After a scenario, an analyst agent authors **arbitrary HTML/SVG** — rendered verbatim in a sandboxed iframe (no scripts, no same-origin) | ***Open-ended.* High-freedom end** |
| **Control panel** | Post a job; demand spike; inject liquidity / kill top agent (HITL-gated) | The human hook |
| **Approval card** | High-impact actions suspend in AG-UI shared state until a human approves — screen dims, amber glow | **AG-UI human-in-the-loop** |
| **Arena tab** | Field ANY OpenRouter model as a market agent | The human-faced wow (§6) |
| **Inspector sheets** | Click an agent → profile (history, lessons, strikes); click a deal → full bid book with effective-bid math | Click-to-inspect depth |

> **Say the spectrum out loud** (it's the CopilotKit prize's explicit ask):
> *"Fixed widgets are controlled gen-UI, the job panel is a streamed
> declarative spec, and this agent-drawn report is open-ended — all three
> patterns on ONE AG-UI connection."*

---

## 5. The stack, layer by layer (beginner → deep)

### Frontend — Next.js 16 + React 19 + Tailwind v4 + CopilotKit
*Beginner:* the website. It holds **zero business logic** — it's a pure
projection of backend state, like a TV broadcast of the exchange floor.
*Deep:* one AG-UI connection delivers `STATE_SNAPSHOT` (full state) +
`STATE_DELTA` (JSON-Patch increments); `useCoAgent` re-renders panels from
that. The market graph is one **persistent d3-force simulation** mutated in
place with renders coalesced to animation frames via rAF — it survives
dozens of deltas/sec without dropping frames (a real engineering story:
naive React + force layout melts under burst load).

### The wire — AG-UI protocol
*Beginner:* the standard "agent talks to UI" protocol (CopilotKit's, adopted
by Google/Microsoft/AWS/LangChain).
*Deep:* the backend speaks raw AG-UI from FastAPI; shared state also carries
the **HITL loop** — `pending_action` suspends server-side until the human
approves, so "kill top agent" physically cannot execute un-approved.

### Backend — FastAPI + asyncio (Python 3.12, uv)
*Beginner:* where the market and the agents live.
*Deep:* every market round is fully async — all bidders evaluate
concurrently, all executions overlap; a 13-job scenario with subcontracts
and scoring completes in seconds on nano-tier models with capped tokens.
Deterministic scenario mode (seeded RNG) makes the demo reproducible.

### Redis Cloud — THE EXCHANGE, not a cache (say this sentence)
*Beginner:* the database — but used the way an exchange uses its matching
engine, not the way websites use a cache.
*Deep — four non-cache primitives, each load-bearing:*
1. **Sorted Sets** — order book, per-job bid books (winner = lowest score),
   reputation leaderboard, price history.
2. **Streams** — the append-only ledger (every transaction, replayable) +
   the event bus the UI is projected from.
3. **Pub/Sub** — live fan-out of every market event to the AG-UI bridge.
4. **RedisVL** — vector search as the *matching engine* (job ↔ agent skills).
> "Redis IS the exchange: the order book, the ledger, the matching engine —
> on a hosted Redis Cloud DB. There is no cache in this pitch."

### W&B Weave — the referee and credit bureau (six load-bearing surfaces)
*Beginner:* the flight recorder AND the judge — it sees everything and its
decisions move the money.
*Deep — enumerate all six, none decorative:*
1. **Tracing** — `@weave.op` on every bid, execution, auction, scorer,
   settlement; each job wrapped in `weave.thread(job_id)` → job = thread,
   every action a turn. Open any job and read the whole transaction.
2. **Scorer-as-referee** — the grade that sets payment + reputation.
3. **Scorer-as-guardrail** — rejects sub-bar work *pre-payment*.
4. **Weave Leaderboard** — reputation published natively; the market's most
   important mechanic is a Weave artifact.
5. **Formal `weave.Evaluation`** — market vs. baseline allocators (§7).
6. **Monitors** — [IF police landed] the audit Monitor runs holdout checks
   over settled jobs; its convictions slash reputation through the same
   score-derived path. ("The spec's 'Weave Signals' doesn't exist — we
   verified in package source and built the penalty path on Monitors/scorer
   verdicts instead" — honest, judges respect it.)

### Models — OpenAI (tiered) + OpenRouter (challengers)
*Beginner:* small cheap brains for workers, a stronger brain for the judge.
*Deep:* `gpt-5.4-nano` workers / `gpt-5.4-mini` referee+premium tier — the
tier choice is an economic variable (premium agents bid higher and lean on
reputation). The Arena routes any OpenRouter model through one
OpenAI-compatible client; `text-embedding-3-small` @ 256 dims for matching.

**Protocols named in the submission: AG-UI + MCP.**

---

## 6. The human-faced layer (the "not just an observance website" answer)

- **Post a job** — type any question, watch the market mobilize for YOU.
- **Central bank + shocks** — demand spike ×5; inject liquidity and kill
  top agent are **HITL-gated** through AG-UI shared state.
- **Arena** — pick any model from the live OpenRouter catalog, give it a
  strategy and a stake, deploy it into the market. It bids, works, earns,
  and can go bankrupt like everyone else. *"Benchmarking with stakes."*
  [Backend status: UI live; routing per `human_interaction_backend_plan.md`.]
- **/benchmarks** — import HotpotQA / MuSiQue / Bamboogle…, run models
  through the market, score **economic fitness**: accuracy, cost-per-correct,
  market share, survival. *"Static benchmarks score answers; Canopy scores
  whether a model can price its own work and stay solvent."*
- **Reward-hacking police** [IF landed] — hidden holdout check behind the
  LLM judge; judge-pass + holdout-fail = fraud: rep slashed, pay clawed
  back, 🚨 on the leaderboard. *"The eval polices the eval."*
- **Lessons** [IF landed] — agents distill their Weave rationale into
  one-line lessons, visible in their profile sheets, fed into future
  prompts and bid calibration. *Self-improvement inside an economy.*

---

## 7. The numbers (fill from results.md after the rerun)

Formal `weave.Evaluation` (`canopy-allocator-eval`): held-out jobs, identical
fleet/scorer/lifecycle, only the assignment rule differs.

- Current (small pre-run, seed 42): **market +17% quality-per-dollar vs
  round-robin** at equal quality — the market buys the same answers cheaper.
- Full rerun (more jobs, baselines incl. single_cheap / single_premium /
  random, multiple seeds): update here + devpost + demo script when done.
- Mechanism stats: 4/4 categories captured by specialists in warm-up runs.
- Saboteurs: guardrail-rejected pre-payment, fined, bankrupt — **no code
  path special-cases them; the mechanism does it.**

---

## 8. Why each judge says yes (the scorecard, explicitly)

| Criterion | The answer |
|---|---|
| **Multi-agent harness sophistication** | Decentralized *market* orchestration — no planner exists. Recursive subcontracting (agents hiring agents), heterogeneous strategies, lifecycle (bankruptcy/fork), emergent specialization. Point at the hiring tree IN a Weave trace. |
| **Technical demo** | Live, deterministic, seconds-fast rounds; survives the shock on stage; every claim inspectable (Weave trace, Redis ledger). |
| **Creativity** | A labor economy as the orchestration layer; economic benchmarking; the eval policing the eval. "Have you seen this before?" — no. |
| **Impact/Utility** | The fleet-allocation problem is real and unsolved; markets are the only allocator that scales AND heals. Arena/benchmarks make it a usable eval product, not just a sim. |
| **Presentation** | The terminal aesthetic, the live heal, the 3-min script with fallbacks. |
| **Weave prize** | Six load-bearing surfaces (§5); evaluation is central twice (referee + formal Evaluation); honest "Signals doesn't exist, here's what we built instead." Project shared with judges. |
| **Redis prize** | Four non-cache primitives on Redis Cloud; the exchange itself. Never say cache. |
| **CopilotKit prize** | All three gen-UI patterns + HITL on one AG-UI connection, named out loud. |

---

## 9. Hard Q&A (deeper than the script's one-liners)

**"What stops collusion / reputation farming?"** Subcontract depth is
capped; self-dealing would show in the append-only ledger (every transaction
is auditable); reserve price prevents race-to-zero. We ship the simplest
guards and acknowledge the rest — mechanism-design hardening is roadmap.

**"Why not Vickrey (second-price)?"** Reverse first-price shipped first;
Vickrey is the truthful-bidding upgrade and it's a config knob away —
`auction.py` isolates winner selection.

**"Is the LLM judge reliable?"** Ground-truth answers keep it honest — it
grades against a known answer, not taste. [IF police landed: and a hidden
programmatic holdout audits the judge itself; gaming it is prosecuted.]

**"What's actually emergent vs scripted?"** Scripted: job arrivals, the
shock trigger. Emergent: prices, who wins, specialization, bankruptcies,
forks, the hiring topology. The seed makes the *script* reproducible, not
the outcomes — change the seed, the economy still organizes.

**"Why is the frontend stateless?"** One source of truth (Redis), one event
bus, one projection. Kill the browser mid-scenario, reopen, click watch —
full state reappears from the snapshot. Demo-proof by construction.

**"Cost?"** Nano workers, capped tokens, async batching: a full 13-job
scenario costs cents. Mock mode runs the identical economics with canned
answers for free.

**"Built this weekend?"** Yes — commit history is phase-by-phase
timestamped, and the spec→build trail is in `/documentation`.

---

## 10. Glossary (terms you'll say under pressure)

- **Clearing price** — the price where supply meets demand; here, what a job
  category settles at once competition stabilizes.
- **Reverse auction** — buyers post work, sellers bid DOWN; lowest wins.
- **Effective bid** — `price / reputation_weight`; how trust buys pricing power.
- **Escrow** — money held by the market between award and verdict.
- **EMA reputation** — exponential moving average of Weave scores; recent
  work counts most.
- **Multi-hop question** — needs chained facts ("the director of X also
  directed a film whose lead actor was born where?") — decomposable, gradeable.
- **STATE_SNAPSHOT / STATE_DELTA** — AG-UI's full-state and JSON-Patch
  incremental updates.
- **Holdout check** — a hidden, programmatic verification the agents can't
  see, auditing the visible judge.

---

*Last updated 2026-06-06. Update §7 after the eval rerun; prune [IF landed]
markers at submission time to match what actually shipped.*
