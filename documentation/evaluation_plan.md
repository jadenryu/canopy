# Canopy Evaluation Plan — proving the market beats single-agent baselines

Maps to spec §8.5 (formal `weave.Evaluation`) and Phase 6. Goal: quotable numbers
demonstrating three claims — **power** (the market allocates better than any fixed
single-agent setup), **robustness** (it self-heals under shocks and bad actors),
and **necessity** (each mechanism component is load-bearing, shown by ablation).

All experiments run on the existing stack: same worker fleet, same seeded RNG
(`rng_seed=42`), same `JobQualityScorer` referee, results published as a
`weave.Evaluation` in the Weave project.

---

## 1. Claims and the experiment that proves each

| # | Claim | Experiment | Headline metric |
|---|---|---|---|
| C1 | Market allocation yields higher quality-per-dollar than fixed allocation | Allocator comparison (§3) | quality-per-dollar vs each baseline |
| C2 | The market survives shocks; fixed pipelines don't | Shock recovery (§5.1) | recovery time in ticks |
| C3 | The market defunds bad agents automatically | Saboteur injection (§5.2) | $ paid to bad agents, market vs baselines |
| C4 | Reputation weighting and the guardrail are load-bearing | Ablations (§6) | quality drop with component removed |
| C5 | Subcontract decomposition improves multi-hop accuracy | Depth ablation (§6) | accuracy at depth 2 vs depth 0 |
| C6 | Price discovery converges without a planner | Convergence stat (§4) | ticks to ±10% band |

---

## 2. Conditions (allocators)

All conditions use the identical worker fleet (same mix of strategies and model
tiers from `config.py`), identical job set, identical scorer. Only the
**assignment rule** differs.

| Condition | Assignment rule | Price paid per job |
|---|---|---|
| **Market** (treatment) | Reverse auction, `effective_bid = price / rep_weight` | Winning bid |
| **B1: Single cheap agent** | One fixed `gpt-5.4-nano` worker does every job | That agent's quoted price (its strategy's bid, no competition) |
| **B2: Single premium agent** | One fixed `gpt-5.4-mini` worker does every job | Same rule — quoted price at premium cost (`model_cost_premium=3.0`) |
| **B3: Random assignment** | Uniform-random active worker per job | Assigned agent's quoted price |
| **B4: Round-robin** | Cycle through workers in fixed order | Assigned agent's quoted price |

Pricing rationale: baselines pay the assigned agent's own quote (cost × margin,
clamped to `bounty_cap`) with no competitive pressure. This isolates exactly what
the auction adds — price competition and reputation-weighted selection — without
inventing artificial prices for the baselines.

B2 matters: it pre-empts the judge question "why not just use a bigger model for
everything?" Expected result: premium quality ≈ market quality, but at ~3× cost,
so the market wins on quality-per-dollar.

---

## 3. Primary experiment: allocator comparison (C1)

**Job set.** Held-out multi-hop QA jobs, disjoint from the 10 questions in
`jobs/seed.py` (those are the "training" set the market runs on during the demo).
Default: expand the bank to 40 questions → 20 held-out for the Evaluation.
Plus one **unseen category** (5 jobs) for the "does it generalize?" question
(spec §17) — e.g. structured extraction.

**Protocol.**
1. Warm-up: run the market on the 20 non-held-out jobs so reputations and
   clearing prices are non-trivial (seeded, deterministic ordering).
2. For each condition, run the 20 held-out jobs through the full lifecycle
   (post → assign → execute → guardrail → referee score → settle).
3. Repeat with 3 seeds (42, 43, 44). LLM outputs are nondeterministic even with
   a fixed seed, so report **mean ± std across seeds**, not a single run.
4. Implement as one `weave.Evaluation` where the "model" parameter is the
   allocator name — all five conditions appear side-by-side in the Weave UI.

**Metrics (exact definitions).**
- **Quality**: mean referee score (0–1) over the 20 jobs.
- **Accuracy**: fraction of jobs with score ≥ `score_threshold` (0.7).
- **Cost**: total amount paid out (from the ledger Stream), in wallet units.
  Secondary: total tokens consumed (workers + any subcontracts), since wallet
  units are nominal.
- **Quality-per-dollar** (headline): total quality / total paid.
- **Rejection rate**: fraction of submissions blocked by the guardrail Scorer.
- **Regret vs oracle**: after the run, compute the post-hoc best assignment
  (highest-scoring agent per job at its quoted price) and report each
  allocator's quality gap from that oracle. This quantifies how close the
  market gets to optimal with zero global knowledge.

**Quotable output format:** "Market: +X% quality at −Y% cost vs round-robin;
Z% of oracle-optimal allocation, discovered purely through bidding."

**Honest expectation.** The market's edge over B3/B4 comes from reputation
routing (good agents win more) and competitive pricing (margins compress).
Its edge over B2 is cost, not raw quality. If the fleet is too homogeneous,
B3/B4 will tie the market on quality — heterogeneity (strategy mix + a
deliberately weak agent or two) is what creates the measurable gap. Tune fleet
composition in the warm-up scenario before locking the eval.

---

## 4. Standing market statistics (C6 — necessity of the mechanism)

Computed from the events Stream / price history on every scenario run:

- **Price convergence**: rolling std-dev of clearing price per category;
  report "converged to ±10% band within N jobs."
- **Margin compression**: mean winning margin over time (competition is working).
- **Specialization index**: share of a category's jobs won by the top agent
  in that category (≥1 emergent specialist is a demo Definition-of-Done item).
- **Leaderboard churn**: rank changes per 10 jobs (reputation is live, not static).

These are descriptive, not comparative — they show the mechanism *doing
something* a fixed pipeline cannot do at all (no fixed pipeline has a price).

---

## 5. Robustness experiments (C2, C3)

### 5.1 Shock and heal
1. Run the deterministic scenario to convergence; record steady-state clearing
   price and throughput (jobs settled per tick).
2. Trigger `shock.py`: kill the top agent (and separately, a 2× demand spike).
3. **Recovery time**: ticks until clearing price and throughput return within
   15% of pre-shock steady state.
4. Contrast for the narrative: in B1/B2, killing the single agent is **total
   outage** — recovery time is infinite by construction. This is the cleanest
   robustness statistic in the deck: "single-agent: 100% capacity loss;
   market: re-cleared in N ticks."

### 5.2 Saboteur injection
1. Add 2 sabotaged workers (deliberately wrong answers or format violations).
2. Run 30 jobs under Market vs B3/B4 (B1/B2 excluded — they never hire them).
3. Report: cumulative $ paid to saboteurs, number of bad jobs that reached
   settlement, and whether the market drove them bankrupt
   (`balance < bankruptcy_floor`).
4. Expected quotable: "Round-robin kept paying both saboteurs indefinitely;
   the market bankrupted both within N jobs and paid them $D total — Y%
   less than round-robin." The guardrail + reputation EMA
   (`reputation_beta=0.3`) do this automatically; no code path special-cases
   saboteurs.

---

## 6. Ablations (C4, C5 — every component is load-bearing)

Each ablation = the full market with one knob zeroed, on the same held-out set:

| Ablation | Knob | Expected effect | Proves |
|---|---|---|---|
| No reputation in auction | `rep_weight_alpha = 0` | Quality drops toward random-assignment level; saboteurs win on price | Reputation weighting is necessary |
| No guardrail | Skip guardrail Scorer | Bad submissions get paid; cost ↑ for same quality | Guardrail is necessary |
| No subcontracting | `max_subcontract_depth = 0` | Multi-hop accuracy drops (worker must answer both hops in one capped-token call) | Decomposition is the multi-agent power claim |
| No reserve price | `reserve_price = 0` | Race-to-zero pricing; quality-per-dollar becomes unstable | Mechanism-design depth for Q&A |

The depth-0 ablation is the direct answer to "is multi-agent actually better
than one agent doing the whole task?" — same model, same budget, only the
ability to decompose removed.

---

## 7. Implementation plan

New files (Phase 6; no changes to market core needed):

```
backend/canopy/eval/
  allocators.py    # market / single_cheap / single_premium / random / round_robin
                   # — each is a function (job, fleet, state) -> (agent_id, price)
  heldout.py       # 20 held-out questions + 5 unseen-category jobs
  run_eval.py      # weave.Evaluation harness; CLI: uv run python -m canopy.eval.run_eval
  stats.py         # convergence, churn, regret-vs-oracle, recovery-time calculators
```

- Reuse `sim/engine.py` for execution; allocators replace only the auction step.
- Every allocator run gets its own Weave thread; the Evaluation rows link to
  the underlying job traces (judges can click from the metric to the trace).
- Ablations are pure config overrides — no new code paths.
- Output: one markdown results table auto-written to `documentation/results.md`
  + the Weave Evaluation URL for the README/Devpost.

**Cost/time estimate.** ~20 jobs × 5 conditions × 3 seeds ≈ 300 jobs, ~2 nano
calls + 1 mini scorer call each ≈ 900 LLM calls, all capped at
`worker_max_tokens=600`. Minutes of wall time with asyncio; well under a
dollar of API spend at nano/mini pricing. Ablations and robustness runs add
~150 jobs more.

---

## 8. Reporting — the numbers that go in the Devpost/demo

1. **The table**: quality, accuracy, cost, quality-per-dollar for all 5
   conditions, mean ± std over 3 seeds (from the Weave Evaluation).
2. **One sentence**: "Market: +X% quality-per-dollar vs round-robin, +X% vs a
   single premium agent."
3. **Robustness pair**: "Top-agent death: single agent = full outage; market
   re-cleared in N ticks." + "Saboteurs bankrupted in N jobs."
4. **Ablation line**: "Remove reputation from the auction and quality falls
   X% — the mechanism, not the models, does the work."
5. **Generalization**: held-out *and* unseen-category numbers (spec §17).

## 9. Threats to validity (acknowledge in Q&A, don't hide)

- **Small job set** (20 held-out): mitigated by 3 seeds and reporting std;
  don't claim significance, claim consistency.
- **LLM-judge noise**: referee scores against `ground_truth` (objective
  anchor), not free-form judgment; spot-check 10 scores by hand.
- **Nominal currency**: wallet units ≠ real dollars; report token counts as
  the secondary cost metric.
- **Fleet composition is chosen by us**: state it — the claim is "given a
  heterogeneous fleet, the market allocates it well," not "the market improves
  a fleet of identical agents."
- **Market overhead**: bidding is arithmetic (strategy margin × cost
  estimate), not LLM calls, so auction overhead is negligible — but report
  total tokens per condition anyway so the comparison is airtight.

---

## 10. Decisions needed from you (defaults applied if unconfirmed)

1. **Held-out bank size** — default 20 held-out + 5 unseen-category. Generate
   them with an LLM and hand-verify ground truths, or hand-write all 25?
2. **Include B2 (single premium agent)?** — default **yes** (kills the
   "just use a bigger model" objection).
3. **Seeds** — default 3 (42/43/44). 5 seeds is sturdier but ~70% more spend.
4. **Unseen category** — default structured extraction (fast, auto-scorable).
   Alternatives: short summarization with checklist scoring, small code tasks.
5. **Run ablations §6 in full or only the two cheapest** (reputation + depth)?
   Default: all four — they're config flips, marginal cost is low.
