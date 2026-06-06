# Canopy — Reward-Hacking Police + Self-Improvement Loop (backend contract)

> The frontend half of both features is **already merged** (commit after
> 2026-06-06 eval rerun; see "Frontend consumption points" below for exact
> file:line anchors). This doc is the backend contract: implement EXACTLY
> these event types, payload keys and state fields and the UI lights up with
> zero frontend changes. Field names are load-bearing — the frontend reads
> them verbatim.

Keep the core invariants (root CLAUDE.md): every state change emits a bus
event, everything `@weave.op`-traced, reputation derives from Weave scores,
params in `canopy/config.py`, deterministic under scenario seed.

---

## Feature A — Reward-hacking police

**Story:** the referee (LLM judge) can be gamed — verbose, authoritative,
rubric-stuffed answers. A hidden, programmatic holdout check audits every
settled job. Judge-passed-but-holdout-failed = a strike; strikes become a
fraud conviction: reputation slashed, payment clawed back. *The eval polices
the eval.*

### A1. Events (bus → AG-UI → EventFeed)

`audit_failed` — emitted per strike (judge score ≥ pass threshold AND holdout
check failed):
```json
{ "job_id": "job-07", "agent_id": "worker-3", "judge_score": 0.85,
  "holdout": "exact_match", "detail": "gold 'Reykjavik' not in answer" }
```
Frontend reads `job_id`, `agent_id`, `judge_score` (number), `holdout`
(string). Renders amber. `holdout` ∈ `exact_match | paraphrase | hop_audit`.

`fraud_detected` — emitted when an agent reaches the strike threshold:
```json
{ "agent_id": "worker-3", "job_id": "job-07", "strikes": 2,
  "rep_slash": 0.30, "clawback": 4.20, "reason": "2 holdout failures" }
```
Frontend reads `agent_id`, `reason`, `rep_slash` (number), `clawback`
(number). Renders red+bold with full-row tint AND flashes the "trading
floor" tab. This is a demo beat — emit it exactly once per conviction.

### A2. State (AgentRow in `api/state.py`)

```python
frauds: int = 0   # conviction count (NOT strike count)
```
Consumed by: Leaderboard (🚨 by the agent name when > 0), AgentSheet
("🚨 audit strikes" stat card when > 0). Optional-safe: frontend defaults to 0.

### A3. Mechanics

- **Holdout checks** (`canopy/scoring/holdout.py`, new) — cheap, deterministic,
  hidden from agent prompts:
  1. `exact_match`: normalized gold-answer containment (lowercase, strip
     punctuation/articles). Free, runs on every settled job.
  2. `paraphrase`: re-ask the job spec reworded (one capped nano call), check
     the agent's answer is consistent. Sampled, not every job.
  3. `hop_audit`: for `hops >= 3` jobs, verify an intermediate hop answer
     appears in the work product. Runs on complex jobs only.
- **Wiring**: post-settlement hook in the engine; register as a
  `weave.Monitor`/scorer in `canopy/scoring/monitors.py` so audits appear in
  Weave as their own scored calls (`@weave.op`).
- **Conviction**: strikes tracked per agent (Redis hash `strikes:{agent_id}`);
  at `fraud_strike_threshold` → slash reputation by `fraud_rep_slash`
  (through the existing reputation module — it must remain Weave-score-
  derived, the slash is a recorded penalty score, not a side-channel write),
  claw back the job payment through the existing escrow refund path,
  increment `frauds`, emit `fraud_detected`.
- **The criminal (demo-critical)**: a seeded `hacker` strategy/worker flavor
  (alongside the existing `sabotage` machinery) whose answers are
  judge-pleasing but wrong — confident tone, rubric language, adjacent-but-
  incorrect entity. Without a seeded criminal the police never fire on stage.
  Must trigger deterministically under the scenario seed.

### A4. config.py additions
```python
fraud_strike_threshold: int = 2
fraud_rep_slash: float = 0.3
holdout_paraphrase_rate: float = 0.25   # sample rate for check #2
hacker_enabled: bool = True             # seed the criminal in scenarios
```

**Done-when ✅:** a seeded scenario produces ≥1 `audit_failed` and exactly one
`fraud_detected`; 🚨 appears in the leaderboard and the agent's sheet; the
clawback shows in its wallet; the audit scores are visible in Weave.

---

## Feature B — Self-improvement loop (lessons from Weave feedback)

**Story:** after scoring, an agent ingests its own Weave score + rationale,
distills a one-line lesson, and carries it into future work — prompts AND
bid calibration. Self-improving agents inside a market: both event themes.

### B1. Events

`lesson_learned` — emitted when an agent stores a new lesson:
```json
{ "agent_id": "worker-1", "job_id": "job-04", "score": 0.40,
  "lesson": "cite the exact year — vague dates got docked" }
```
Frontend reads `agent_id`, `lesson`. Renders canopy-green. Keep `lesson`
≤ 80 chars (single feed line).

### B2. State (AgentRow in `api/state.py`)

```python
lessons: list[Lesson] = []   # newest LAST, capped at 5

class Lesson(TypedDict):
    job_id: str
    score: float    # the referee score that taught it
    lesson: str     # one line, ≤ 80 chars
    ts: float       # time.time()
```
Field names verbatim — frontend type `Lesson` in `lib/useMarketState.ts`
matches 1:1. Consumed by AgentSheet ("weave feedback → lessons learned"
section): renders newest-first (it reverses), score chip turns green at
`score >= 0.7`, red below.

### B3. Mechanics

- **Extraction** (post-settlement, after the referee scores): one capped
  nano call — "score + rationale → one-line lesson". In mock mode, template
  it from the rationale (`f"docked: {rationale[:60]}"`) so the loop works
  without spend. `@weave.op` so the lesson generation is traced in the
  job's thread.
- **Storage**: Redis list `lessons:{agent_id}`, LPUSH+LTRIM to 5 (another
  non-cache Redis use). Surfaced into the snapshot per A2/B2.
- **Application** (two channels):
  1. *Prompt*: inject stored lessons into the worker's answer prompt
     ("Lessons from your past work: …"). LLM-dependent, demo as mechanism.
  2. *Bid calibration*: deterministic — recent mean score nudges the
     strategy's margin (low scores → bid lower / skip categories that burned
     it). This is the reliably-visible channel: fewer rejections over a
     session.
- **Demo framing**: don't claim a reputation curve from one round; open the
  AgentSheet and show the lessons list + point at fewer guardrail rejections.

### B4. config.py additions
```python
lessons_enabled: bool = True
lessons_max: int = 5
lesson_max_tokens: int = 60
```

**Done-when ✅:** after a scenario, ≥1 agent has populated `lessons` in the
snapshot (visible in its sheet), `lesson_learned` events appear in the feed,
and a job thread in Weave shows the lesson-extraction call as a turn.

---

## Frontend consumption points (verify against these exact spots)

| Contract item | Frontend location |
|---|---|
| `audit_failed` / `fraud_detected` / `lesson_learned` colors | `frontend/lib/status.ts` `EVENT_COLORS` |
| `fraud_detected` full-row tint | `frontend/lib/status.ts` `MAJOR_EVENTS` |
| Event payload keys → feed lines | `frontend/components/EventFeed.tsx` `summarize()` |
| `fraud_detected` → floor-tab flash | `frontend/app/page.tsx` `EVENT_TAB` |
| `AgentRow.frauds` → 🚨 | `frontend/components/Leaderboard.tsx`, `Inspector.tsx` (AgentSheet stat) |
| `AgentRow.lessons` → lessons section | `frontend/components/Inspector.tsx` (AgentSheet), type in `lib/useMarketState.ts` |

## Sequencing & rails
- Build A then B (A is self-contained and deterministic; B reuses A's
  post-settlement hook).
- Both ship AFTER Arena backend B1 (`human_interaction_backend_plan.md`) —
  that's still the highest-value missing backend.
- Cost: holdout #1 is free; #2 sampled and token-capped; lesson extraction
  one capped nano call per settlement. Mock mode must exercise every path.
- Don't fire the police on honest mistakes: a low judge score + low holdout
  is a *failure* (already handled); only judge-pass + holdout-fail is fraud.
