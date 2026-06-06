# Canopy — build conventions

- Read documentation/spec.md first ("Clearing" in the spec = this project, renamed Canopy).
- Build ONE phase at a time; stop for review after each phase's ✅ Done-when gate.
- API versions were verified 2026-06-06 (Step 0) and pinned:
  weave 0.52.42, openai 2.41.0, redis 7.4.1, redisvl 0.20.0, fastapi 0.136.3,
  ag-ui-protocol 0.1.19. Models: gpt-5.4-nano (workers), gpt-5.4-mini
  (premium/scorer), text-embedding-3-small @ 256 dims.
  (Phase 3 correction: redis-py 8.0.0 + redisvl 0.3.9 were mutually
  incompatible — ALL redisvl releases require redis<8. Downgraded redis-py
  to 7.4.1, bumped redisvl to 0.20.0; our command usage is unaffected.)
- Job domain: MULTI-HOP BENCHMARK QUESTIONS (ground-truth answers → objective
  scoring; multi-hop structure → natural subcontract decomposition).
- NOTE: spec's "Weave Signals" feature does NOT exist (re-checked in weave 0.52.42
  source, Phase 2). Reputation penalties come from guardrail/referee Scorer failures
  instead; weave.Monitor exists if continuous scoring is wanted later.
- The frontend is a pure projection of backend state. Every state change emits
  a structured event to a Redis Stream + Pub/Sub channel; the UI renders that
  via AG-UI STATE_SNAPSHOT/STATE_DELTA.
- Decorate every agent step, LLM call, auction, scorer, and settlement with
  @weave.op. Wrap each job in weave.thread(job_id) (job = thread, calls = turns).
  Reputation MUST derive from Weave scores.
- Keep agents cheap & fast: nano-tier models, capped tokens (worker_max_tokens),
  asyncio concurrency. A full market round = seconds.
- Redis = the exchange (Sorted Sets order book/leaderboard, Streams bus/ledger,
  RedisVL matching) on a hosted Redis Cloud DB. Unique uses, NOT caching — never
  pitch Redis as a cache.
- CopilotKit: demonstrate ALL THREE gen-UI patterns on AG-UI — controlled
  (fixed widgets), declarative (structured panels), open-ended (sandboxed iframe
  HTML/SVG).
- Weave surfaces (all load-bearing): threads/turns agent tracing; Scorer-as-referee
  (sets pay+rep); Scorer-as-guardrail (rejects bad work pre-payment); Weave
  Leaderboard (= reputation ranking); formal weave.Evaluation (market vs.
  baselines, capture the metric); Monitors if available.
- All economic params come from canopy/config.py (env-driven). Deterministic
  scenario mode (seeded RNG) must reliably show price convergence + shock-heal.
- Don't over-build. The win = live watchable market + shock-and-heal + Weave as
  referee. Cut features before cutting demo reliability.
- Secrets in .env at repo root only; never commit keys.
- Backend: cd backend && uv run ... (uv-managed, Python 3.12).
- Frontend: cd frontend && npm run dev (Next.js + CopilotKit).
- Git commit early and often (judges use history as built-this-weekend proof).
