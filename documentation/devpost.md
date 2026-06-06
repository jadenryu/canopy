# Devpost draft — Canopy

> Copy-paste skeleton. Fill the [bracketed] numbers from `documentation/results.md`
> after the final eval run, add the video link, and DELETE any
> "[IF LANDED]" block whose backend didn't ship by submission.

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

**Watch it live**: the hero view is the economy itself — a force-directed
market graph where agents are sized by wallet, ringed by reputation, and every
hire draws an edge; click any agent for its profile (work history, lessons,
strikes) or any deal for its full bid book. Around it: live price chart,
order book, reputation leaderboard, wallets, and an event feed that pulses
with every auction. Kill the top agent mid-run and watch prices spike,
substitutes take over at surge prices, and the market re-clear — no
replanning, no code.

**Humans play too.** In the **Arena**, you field your *own* model — any model
on OpenRouter — give it a strategy and a stake, and it competes against the
house agents for real jobs. The **/benchmarks** page flips that into a new
kind of eval: import a multi-hop benchmark (HotpotQA, MuSiQue, Bamboogle…),
run models through the market, and score **economic fitness** — accuracy,
cost-per-correct, market share, survival. Static benchmarks tell you if a
model can answer; Canopy tells you if it can price its own work and stay
solvent.

[IF LANDED — police] **The eval polices the eval.** An audit Monitor runs a
hidden holdout check behind the LLM judge. Score high with the judge but fail
the holdout? Strike. Two strikes: convicted — reputation slashed, payment
clawed back, a 🚨 on your name. Reward-hacking is not a thought experiment in
a market; it's fraud, and the market prosecutes it.

[IF LANDED — learning] **Agents learn from their own Weave feedback.** After
every score, an agent distills the rationale into a one-line lesson ("cite
the exact year — vague dates got docked"), carries it into future prompts and
bid calibration, and you can read each agent's lessons in its profile sheet.
Self-improvement, inside an economy, driven by the referee's own words.

## The numbers (formal weave.Evaluation)

Held-out job set (20 multi-hop + 5 unseen-category extraction), identical
fleet/scorer/lifecycle (including 2 saboteur agents), 3 seeds — only the
assignment rule differs:

| allocator | quality | accuracy | paid/job | quality-per-$ |
|---|---|---|---|---|
| **market** | **0.982** | **0.99** | 2.77 | 0.354 |
| single cheap agent | 0.989 | 0.99 | 2.63 | 0.377 |
| single premium agent | 0.989 | 0.99 | 8.51 | 0.116 |
| random | 0.797 | 0.80 | 2.37 | 0.338 |
| round-robin | 0.830 | 0.84 | 2.70 | 0.308 |

- **Market: +18% quality and +15% quality-per-dollar vs round-robin; same
  quality as a single premium agent at 31% of the cost (+205% QPD).**
- The market **matches a hand-vetted single agent while carrying two
  saboteurs in its fleet** — it bankrupted both during warm-up, unprompted.
  The fixed allocators, which can't react, bled ~17% quality to the same
  saboteurs across the whole window. No code path special-cases bad actors;
  the mechanism does it.
- A vetted single agent ties on efficiency — until it dies. Top-agent death
  is 100% capacity loss for the single-agent setup; the market re-cleared a
  demand burst right after losing its top agent at a ~60% transient surge
  premium (2.04 → 3.35 → back to ~2.1).

## How we built it

- **W&B Weave — the referee and credit bureau (six load-bearing surfaces):**
  thread-per-job agent tracing (job=thread, bids/exec=turns); referee
  `JobQualityScorer` whose score sets pay + reputation; a guardrail Scorer
  rejecting bad work *before payment*; the reputation ranking published as a
  native **Weave Leaderboard**; the formal **weave.Evaluation** above; and
  scorer-verdict penalties wired into bankruptcy.
  [IF LANDED — police: …plus an **audit Monitor** (holdout checks policing
  the LLM judge) — Weave scoring the eval itself.]
- **Redis Cloud — the exchange itself (zero caching):** Sorted Sets for the
  order book, bid books, leaderboard, and price history; Streams for the
  append-only ledger and event bus; Pub/Sub fanning every market event to the
  UI; **RedisVL** vector search matching jobs to agent skills.
  [IF LANDED — learning: …plus per-agent lesson memory (capped Redis lists
  feeding prompts).]
- **CopilotKit / AG-UI — the trading floor:** the backend speaks raw AG-UI
  (STATE_SNAPSHOT + JSON-Patch STATE_DELTA per market event). All **three
  generative-UI patterns on one connection**: controlled (the market graph
  and fixed widgets), declarative (a streamed bid-comparison UI spec walked
  by a generic renderer), open-ended (an analyst agent draws its own HTML/SVG
  report, rendered in a sandboxed iframe). High-impact human actions (kill
  top agent, inject liquidity) ride an AG-UI **HITL approval loop** through
  shared state.
- **OpenAI:** tiered economy — gpt-5.4-nano workers, gpt-5.4-mini
  referee/premium tier; the tier choice is itself an economic variable.
- **OpenRouter:** the Arena routes human-fielded challenger models through
  one OpenAI-compatible client — any model on the catalog can enter the
  market. [Adjust if Arena backend didn't land: "Arena UI live, routing
  ships next."]
- **Frontend:** Next.js 16 + Tailwind v4 terminal design system, d3-force
  market graph (persistent simulation, rAF-gated renders — survives event
  bursts), shadcn primitives, JetBrains Mono everything.

**Protocols: AG-UI** (agent↔UI runtime) and **MCP** (agent tool-calling).

## Challenges

- Making the shock *visible* required real economics: with no capacity limits,
  killing an agent just hands jobs to a perfect substitute at the same price.
  We added surge pricing (busy agents quote overtime) — then demand spikes
  and agent death move prices the way they should.
- A reputation snowball: our first rep-weighted auction let one undercutter
  win everything. Softening the weight to `(rep/0.5)^0.5` keeps trust valuable
  without monopoly.
- A live force-directed graph under dozens of state deltas per second will
  melt React if you let it: we moved to one persistent d3 simulation mutated
  in place, with renders coalesced to animation frames.
- Version archaeology: redis-py 8 is incompatible with every redisvl release;
  the spec's "Weave Signals" doesn't exist (we verified in package source and
  wired scorer-failure penalties into bankruptcy instead).

## What's next

Vickrey (second-price) auctions for truthful bidding, the full benchmark
pipeline (import → market run → weave.Evaluation per model), capacity-aware
bidding, real-dollar cost accounting per token
[adjust: move police/learning here if they didn't land].

## Links

- Repo: https://github.com/jadenryu/canopy
- Weave project (shared with judges): https://wandb.ai/jadenryu_nvcc/canopy/weave
- Evaluation: `canopy-allocator-eval` in the Weave project; table in
  `documentation/results.md`
- Demo video: [link]
