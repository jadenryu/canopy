# Library & Framework Verification

> Context7-verified against current docs. Cross-reference before writing any integration code.

---

## W&B Weave

### Confirmed APIs

```python
import weave
weave.init("clearing")

from weave import Scorer

class JobQualityScorer(Scorer):
    model_tier: str = "scorer"

    @weave.op  # no parentheses
    async def score(self, job_spec: str, requirements: list[str], output: str) -> dict:
        ...
```

```python
# Evaluation — requires a weave.Model subclass, not a bare function
class MarketAllocator(weave.Model):
    strategy: str

    @weave.op
    async def predict(self, job_spec: str) -> dict:
        # run one market round
        ...

evaluation = weave.Evaluation(
    dataset=held_out_jobs,
    scorers=[JobQualityScorer()],
)
await evaluation.evaluate(MarketAllocator(strategy="market"))
# or in scripts: asyncio.run(evaluation.evaluate(...))
```

```python
# Monitor (confirmed API for "Monitors" surface)
my_monitor = weave.Monitor(
    name="market-referee",
    description="Scores live job completions",
    sampling_rate=1.0,
    op_names=["Agent.execute_job", "Market.settle"],
    scorers=[JobQualityScorer()],
)
my_monitor.activate()
```

### ~~Unverified~~ → RESOLVED (Step 0, 2026-06-06, weave 0.52.42)

| Feature | Verdict | Verified API |
|---|---|---|
| Agent-native tracing | ✅ EXISTS as **threads/turns**: `with weave.thread(job_id) as t:` — calls inside become turns (`t.thread_id`, `t.turn_id`). Job = thread, bid/exec = turns, nested `@weave.op`s = steps. | `weave.thread()` context manager |
| Weave Signals | ❌ NOT FOUND in current docs — drop from pitch. Bankruptcy logic = `weave.Monitor` + guardrail-scorer failures → reputation penalties. | use `weave.Monitor` (confirmed) |
| Weave Leaderboard | ✅ EXISTS as publishable artifact: `from weave.flow import leaderboard; spec = leaderboard.Leaderboard(name=..., columns=[leaderboard.LeaderboardColumn(evaluation_object_ref=get_ref(evaluation).uri(), scorer_name=..., summary_metric_path="mean")]); weave.publish(spec)` | `weave.flow.leaderboard` |

Also confirmed: `weave.Evaluation` accepts bare `@weave.op` functions as models too (docs' own leaderboard example does this), so a `weave.Model` subclass is optional, not required.

### Correction — `weave.Evaluation` needs a model object

The spec implies passing a market function directly to `evaluate()`. The actual API requires a `weave.Model` subclass (or any callable with `predict()`). Wrap the market allocation logic accordingly (see snippet above).

---

## CopilotKit / AG-UI

### Confirmed APIs

**Hook name is `useCoAgent`** (spec left this as "confirm current name"):

```ts
import { useCoAgent } from "@copilotkit/react-core";

const { state } = useCoAgent<MarketState>({
  name: "market-agent",
  initialState: { agents: [], orderBook: [], prices: {} },
});
```

**FastAPI backend:**

```python
from copilotkit import CopilotKitRemoteEndpoint
from copilotkit.integrations.fastapi import add_fastapi_endpoint

sdk = CopilotKitRemoteEndpoint(agents=[market_agent])
add_fastapi_endpoint(app, sdk, "/copilotkit")  # path is configurable — spec uses "/agui", that's fine
```

**Generative UI spectrum** — all three patterns are confirmed real CopilotKit concepts:

| Pattern | CopilotKit name | Implementation |
|---|---|---|
| Controlled (high control) | AG-UI controlled | Pre-built widgets; agent feeds data to existing components |
| Declarative / semi-open | A2UI / Open-JSON-UI | Structured UI spec streamed at runtime |
| Open-ended (high freedom) | MCP Apps | Arbitrary HTML/SVG rendered in sandboxed iframe |

**HITL** — confirmed CopilotKit feature.

### Correction — backend wiring terminology (SUPERSEDED at Step 0)

~~Use `CopilotKitRemoteEndpoint` + `add_fastapi_endpoint`~~ — CopilotKit's own docs now mark that pattern as legacy and migrate **to** raw AG-UI endpoints. The verified current pattern (built & type-checked 2026-06-06):

- **Backend** (`ag-ui-protocol==0.1.19`): FastAPI route takes `ag_ui.core.RunAgentInput`, streams SSE via `ag_ui.encoder.EventEncoder` — `RunStartedEvent → StateSnapshotEvent/StateDeltaEvent → Text/Tool events → RunFinishedEvent`.
- **Frontend bridge** (`@copilotkit/runtime@1.59.5`): Next.js route handler with `new CopilotRuntime({ agents: { canopy_market: new HttpAgent({ url }) } })` + `copilotRuntimeNextJSAppRouterEndpoint` + `ExperimentalEmptyAdapter`.
- **Pin `@ag-ui/client@0.0.53`** — 0.0.55 has a private-property type conflict with CopilotKit 1.59.5's bundled copy.

This is also the stronger Best-Use-of-CopilotKit story: we speak the AG-UI protocol directly.

---

## RedisVL

### Confirmed API

```python
from redisvl.index import SearchIndex
from redisvl.query import VectorQuery, RangeQuery
from redisvl.schema import IndexSchema

schema = IndexSchema.from_yaml("agents_skills_idx.yaml")
index = SearchIndex(schema, redis_client)
index.create(overwrite=True, drop=True)
index.load(agent_records)  # list of dicts containing id + embedding field

query = VectorQuery(
    vector=job_requirements_embedding,   # list[float]
    vector_field_name="skill_embedding",
    return_fields=["agent_id", "name", "model_tier"],
    num_results=10,
)
results = index.query(query)  # list of dicts; each has "vector_distance"
```

### Correction — "RedisVL / Vector Sets" are not the same thing

The spec uses these interchangeably in §5 and §7. They are distinct:

- **RedisVL** — Python SDK over the RediSearch module. Uses `SearchIndex`, `VectorQuery`, etc. Mature, supports hybrid filters. **Use this.**
- **Vector Sets (VSET)** — Redis 8 native primitive (`VADD`, `VSIM` commands). Simpler, no mature Python SDK yet.

**Action:** Commit to RedisVL everywhere. Remove "Vector Sets" from the pitch to avoid confusion. The Best-Use-of-Redis story is already strong without it.

---

## OpenAI Python SDK

### Confirmed — skip the Agents SDK

The spec correctly says "Agents SDK optional." The OpenAI Agents SDK has its own span-based tracing (`AgentSpanData`, handoff spans, tool spans) which would conflict with or duplicate Weave's tracing. Using the raw `openai` Python SDK with Weave decorators is the right call.

```python
from openai import AsyncOpenAI

client = AsyncOpenAI()

@weave.op
async def llm_call(messages: list, model: str) -> str:
    response = await client.chat.completions.create(model=model, messages=messages)
    return response.choices[0].message.content
```

Use `asyncio.gather` for concurrent worker execution.

---

## Redis — Sorted Sets, Streams, Pub/Sub, TimeSeries

All confirmed standard Redis primitives. No API concerns.

- `ZADD` / `ZRANGEBYSCORE` / `ZRANK` — order book + leaderboard ✅
- `XADD` / `XREAD` / `XREADGROUP` — Streams (ledger + event bus) ✅
- `PUBLISH` / `SUBSCRIBE` — real-time fan-out ✅
- `TS.ADD` / `TS.RANGE` — TimeSeries for price history (optional, confirmed Redis module) ✅

**docker-compose image:** `redis/redis-stack:latest` includes RediSearch (required for RedisVL), RedisJSON, RedisTimeSeries, and RedisInsight on port 8001. Correct.

---

## FastAPI

Standard usage. No concerns. `uvicorn clearing.api.main:app --reload` is correct.

---

## Frontend (Next.js / Recharts)

Standard usage. No concerns.

**Gap in spec §5:** "a force-graph lib" is unspecified. Common choices: `react-force-graph` (WebGL-backed, good for large graphs) or `d3-force` (more control). Pick one and pin it.

---

## Action Checklist Before Phase 0

- [ ] Verify agent-native tracing sessions/turns/steps API at `docs.wandb.ai/weave`
- [ ] Verify Weave Signals API at `docs.wandb.ai/weave`
- [ ] Verify Weave Leaderboard as a publishable artifact at `docs.wandb.ai/weave`
- [ ] Wrap market allocation in `weave.Model` subclass for `weave.Evaluation`
- [ ] Use `useCoAgent` from `@copilotkit/react-core` (confirmed)
- [ ] Use `CopilotKitRemoteEndpoint` + `add_fastapi_endpoint` for FastAPI backend
- [ ] Replace all "Vector Sets" references with "RedisVL" in pitch/README
- [ ] Pick and pin a force-graph library for the hiring network visualization
- [ ] If Weave Signals is unavailable, use `weave.Monitor` + score thresholds for bankruptcy logic
