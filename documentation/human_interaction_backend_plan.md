# Canopy — Human-Interaction Backend Plan

> Companion to the frontend shipped 2026-06-06: the **Arena** tab (field your
> own OpenRouter model in the market) and the **/benchmarks** page (import a
> multi-hop benchmark, run models through the market, compare allocators).
> The frontend is live and calls the endpoints below; until they exist it
> degrades to "engine pending" states. This doc is the contract.

Read `documentation/spec.md` and root `CLAUDE.md` first. Everything here keeps
the core invariants: frontend = pure projection of backend state, every state
change emits a bus event, everything traced with `@weave.op`, reputation
derives from Weave scores, params in `canopy/config.py`.

---

## Feature 1 — Custom agents (Arena)

A human picks any OpenRouter model, names it, gives it a strategy + stake,
and it competes in the live market as a first-class agent.

### OpenRouter routing
OpenRouter is OpenAI-API-compatible — reuse the existing `openai` client:

```python
# canopy/agents/llm.py (new)
openrouter = AsyncOpenAI(
    base_url=settings.openrouter_base_url,  # https://openrouter.ai/api/v1
    api_key=settings.openrouter_api_key,
)
```

A worker's `model` field decides routing: ids containing `/` (e.g.
`anthropic/claude-haiku-4.5`) go through the OpenRouter client; bare house ids
(`gpt-5.4-nano`) keep the existing OpenAI client. Same `@weave.op`-decorated
call site, so tracing/threads are unchanged.

### config.py additions (all env-driven)
```python
openrouter_api_key: str = ""            # feature off when empty
openrouter_base_url: str = "https://openrouter.ai/api/v1"
max_custom_agents: int = 6
custom_stake_min: float = 10.0
custom_stake_max: float = 500.0
custom_max_tokens: int = worker_max_tokens  # same cap as house workers
```

### Endpoint (frontend already calls this — exact shape)
`POST /control/register_custom_agent`
```json
{ "name": "you-haiku", "model": "anthropic/claude-haiku-4.5",
  "strategy": "generalist", "stake": 100 }
```
Validation: strategy ∈ strategies.py registry (lowercased class names);
stake within bounds; name slugified + prefixed `you-` if not already (visual
distinction in the graph); reject when `max_custom_agents` reached or key
missing (503 + detail, NOT 404 — frontend shows detail verbatim).

Effects: create the worker with `model_tier = <openrouter id>` (the frontend
identifies fielded agents as `model_tier ∉ {nano, mini}`), register in the
market registry, fund wallet with stake, emit `agent_registered` with
`{"custom": true}` in the payload. It then bids/works/settles through the
exact same loop as house agents — no special-casing downstream.

### Guardrails
- Per-call token cap (`custom_max_tokens`), per-agent timeout same as house.
- Custom agents are subject to the same guardrail/referee Scorers — a human's
  model can be rejected pre-payment and go bankrupt. That's the product.
- Kill switch: `DELETE /control/custom_agents` (drain + deregister all).

**Done-when ✅:** deploy from the Arena tab → agent enters the market graph,
bids on the next scenario, and at least one settles or rejects with its score
visible in Weave.

---

## Feature 2 — Benchmark engine (/benchmarks)

Import a public multi-hop QA benchmark, sample N questions as market jobs,
field the chosen models, run a round, referee-score against ground truth,
aggregate per-model economics.

### Datasets
`canopy/bench/datasets.py` — loader registry keyed by the ids the frontend
sends: `hotpotqa`, `2wikimultihopqa`, `musique`, `bamboogle`, `frames`.
Use HuggingFace `datasets` with a normalizer per source →
`{question, answer, hops, category}`. Cache normalized samples in Redis
(`bench:ds:<id>` list) so repeat runs don't re-download. Bamboogle (125 qs)
is the demo default — small and fast.

### Run pipeline
`POST /bench/run` (frontend shape):
```json
{ "dataset": "bamboogle", "models": ["anthropic/claude-haiku-4.5", "openai/gpt-5.4-nano"],
  "allocator": "market", "questions": 10 }
```
1. Sample `questions` items (seeded RNG — deterministic scenario mode applies).
2. Field one custom agent per model (stake from config) alongside house agents.
3. Drive jobs through the chosen allocator — reuse
   `eval/allocators.py` (`CONDITIONS = market | single_cheap | single_premium |
   random | round_robin`). `market` is the full auction.
4. Referee Scorer (existing) scores each answer vs ground truth → pay + rep.
5. Aggregate per model and persist to `bench:runs` (Redis hash/stream).
6. Emit `bench_run_started` / `bench_run_finished` bus events (the floor UI
   can flash; the benchmarks page polls).

`GET /bench/runs` → list of (exact frontend `BenchResult` type):
```json
{ "run_id": "br-012", "dataset": "bamboogle", "model": "anthropic/claude-haiku-4.5",
  "allocator": "market", "questions": 10, "accuracy": 0.8,
  "cost_per_correct": 3.12, "market_share": 0.4, "bankruptcies": 0,
  "finished_at": "2026-06-06T21:04:00Z" }
```

Metric definitions:
- **accuracy** — referee score ≥ pass threshold, per question answered by that model.
- **cost_per_correct** — total market spend paid to that model ÷ correct count
  (economic cost, not token cost; token cost optional v2 via OpenRouter usage).
- **market_share** — jobs won ÷ jobs posted (only meaningful for `market`).
- **bankruptcies** — times the model's agent went bankrupt during the run.

### Weave tie-in (load-bearing for judging)
Each run = one formal `weave.Evaluation` per model with the referee Scorer;
runs land on the Weave Leaderboard next to the live-market reputation board.
This makes the demo claim crisp: *the same referee that settles live trades
is the benchmark judge.*

**Done-when ✅:** a 10-question Bamboogle run with 2 models completes in mock
AND real mode; a results row appears on /benchmarks; the run is visible as a
weave.Evaluation in the Weave UI.

---

## Cost & safety rails
- `questions` clamped to 50 server-side; default 10; mock mode honored end-to-end.
- One bench run at a time (Redis lock) — runs queue, never overlap a live demo.
- OpenRouter spend: hard per-run budget in config; abort + partial results on breach.
- Dataset text is untrusted: it flows into prompts but never into shell/HTML
  without the existing sandboxing (reports stay in the sandboxed iframe).

## Phasing
1. **B1 — Arena backend** (custom agents): smallest slice, biggest demo win.
2. **B2 — Bench pipeline** (datasets + /bench/run + /bench/runs).
3. **B3 — Weave Evaluations + leaderboard wiring** for bench runs.

Stop for review after each phase per CLAUDE.md. If time runs short before the
demo: B1 alone already delivers the "field your fighter" moment; /benchmarks
degrades gracefully and reads as roadmap.
