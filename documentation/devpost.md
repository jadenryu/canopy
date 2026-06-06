# Devpost draft — Canopy

> Copy-paste skeleton. Fill the [bracketed] numbers from `documentation/results.md`
> after the final eval run, and add the video link.

## Inspiration

Once you run *fleets* of agents, something has to decide which agent does which
job, at what price, and what happens when one fails. Hand-wired pipelines don't
scale and don't heal. Markets do both — so we built one.

## What it does

Canopy is a self-organizing labor market for AI agents. Humans (or agents) post
multi-hop benchmark questions with a bounty. Agents are matched by vector
similarity (RedisVL), bid in a reverse auction where
`effective_bid = price / reputation_weight`, and the winner executes — possibly
**hiring other agents** by decomposing the job and posting sub-jobs back into
the same market. A Weave Scorer referees every deliverable: the score IS the
payment decision and the reputation signal. Failures are fined; repeated
failures end in bankruptcy; sustained profit forks an agent into a copy.
Clearing prices per job category emerge from competition — nobody sets them.

Watch it live: a trading-floor UI (order book, price chart, reputation
leaderboard, wallets, hiring graph, event feed) streams over one AG-UI
connection. Kill the top agent mid-run and watch prices spike, substitutes
take over at surge prices, and the market re-clear — no replanning, no code.

## The numbers (formal weave.Evaluation)

Held-out job set (20 multi-hop + 5 unseen-category extraction), identical
fleet/scorer/lifecycle, 3 seeds — only the assignment rule differs:

- **Market: [+X]% quality-per-dollar vs round-robin, [+Y]% vs a single
  premium agent.**
- Saboteur agents: guardrail-rejected pre-payment, fined, **bankrupt within 3
  failures** — no code path special-cases them; the mechanism does it.
- Shock recovery: top-agent death = 100% capacity loss for a single-agent
  setup; the market re-cleared within [N] jobs at a [Z]% transient premium.

## How we built it

- **W&B Weave — the referee and credit bureau (six load-bearing surfaces):**
  thread-per-job agent tracing (job=thread, bids/exec=turns); referee
  `JobQualityScorer` whose score sets pay + reputation; a guardrail Scorer
  rejecting bad work *before payment*; the reputation ranking published as a
  native **Weave Leaderboard**; the formal **weave.Evaluation** above; and
  scorer-verdict penalties wired into bankruptcy.
- **Redis Cloud — the exchange itself (zero caching):** Sorted Sets for the
  order book, bid books, leaderboard, and price history; Streams for the
  append-only ledger and event bus; Pub/Sub fanning every market event to the
  UI; **RedisVL** vector search matching jobs to agent skills.
- **CopilotKit / AG-UI — the trading floor:** the backend speaks raw AG-UI
  (STATE_SNAPSHOT + JSON-Patch STATE_DELTA per market event). All **three
  generative-UI patterns on one connection**: controlled (fixed market
  widgets), declarative (a streamed bid-comparison UI spec walked by a generic
  renderer), open-ended (an analyst agent draws its own HTML/SVG report,
  rendered in a sandboxed iframe). High-impact human actions (kill top agent,
  inject liquidity) ride an AG-UI **HITL approval loop** through shared state.
- **OpenAI:** tiered economy — gpt-5.4-nano workers, gpt-5.4-mini
  referee/premium tier; the tier choice is itself an economic variable.

**Protocols: AG-UI** (agent↔UI runtime) and **MCP** (agent tool-calling).

## Challenges

- Making the shock *visible* required real economics: with no capacity limits,
  killing an agent just hands jobs to a perfect substitute at the same price.
  We added surge pricing (busy agents quote overtime) — then demand spikes
  and agent death move prices the way they should.
- A reputation snowball: our first rep-weighted auction let one undercutter
  win everything. Softening the weight to `(rep/0.5)^0.5` keeps trust valuable
  without monopoly.
- Version archaeology: redis-py 8 is incompatible with every redisvl release;
  the spec's "Weave Signals" doesn't exist (we verified in package source and
  wired scorer-failure penalties into bankruptcy instead).

## What's next

Vickrey (second-price) auctions for truthful bidding, weave.Monitor running
the referee continuously over live traffic, capacity-aware bidding, and
real-dollar cost accounting per token.

## Links

- Repo: https://github.com/jadenryu/canopy
- Weave project (shared with judges): https://wandb.ai/jadenryu_nvcc/canopy/weave
- Evaluation: `canopy-allocator-eval` in the Weave project; table in
  `documentation/results.md`
- Demo video: [link]
