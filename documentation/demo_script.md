# Canopy — 3-minute demo script (strictly timed)

> WeaveHacks judging: Impact/Utility · Technical Demo · Creativity ·
> Presentation · **Multi-agent harness sophistication**. The demo IS the
> pitch — max one slide, everything else live. Practice this twice with a
> timer before judging; the shock beat must land before 2:10.

## Pre-demo checklist (do this 10 min before, not 1 min)

- [ ] Redis Cloud reachable (`backend`: state endpoint returns agents)
- [ ] Backend up: `cd backend && uv run uvicorn canopy.api.main:app --port 8000`
- [ ] Frontend warm: `cd frontend && npm run dev`, **open / and /benchmarks
      once each** (Turbopack compiles routes on first hit — never eat that
      10s on stage). If the page ever loads unstyled: `rm -rf .next`, restart.
- [ ] Run ONE warmup scenario end-to-end, then refresh the page
- [ ] Browser: 125% zoom, bookmarks bar hidden, two tabs only —
      tab 1: Canopy floor · tab 2: Weave project (traces + leaderboard pre-loaded)
- [ ] Zoom screen-share tested (judging is over Zoom share)
- [ ] Phone timer on the podium, started at "hi"

## The script

**0:00–0:20 — Hook (one slide or just say it over the idle floor)**
> "When you run a *fleet* of agents, something has to decide who does which
> job, at what price, and what happens when one fails. Pipelines don't heal.
> Markets do. Canopy is a labor market where AI agents bid, hire each other,
> and live or die by their work — refereed by Weave."

**0:20–1:05 — The economy materializes (tab 1)**
- Click **▶ run scenario**. Narrate as it fills:
- "Each node is an agent — size is wallet, ring is reputation. Jobs are
  multi-hop benchmark questions with ground-truth answers."
- Point at event feed: "vector match via RedisVL shortlists who even sees the
  job, then a reverse auction — bid ÷ reputation weight."
- Point at market graph when a manager subcontracts: "this agent just *hired
  those two* — it decomposed the job and posted sub-jobs back into the same
  market. Nobody orchestrated that." **← harness-sophistication line, do not cut**
- Point at price chart: "clearing prices converging — nobody set them."

**1:05–1:35 — Weave is the referee (tab 1 → tab 2 → tab 1, fast)**
- Click any settled job → JobSheet bid book: "every deliverable is scored by
  a Weave Scorer — the score IS the payment decision and the reputation."
- Flip to tab 2 (pre-loaded Weave): "job = thread, every bid and execution a
  turn; the reputation leaderboard is a native Weave Leaderboard." Flip back.
- [IF police landed]: wait for the 🚨 — "this agent gamed the judge:
  high LLM-judge score, failed the hidden holdout check. Convicted, slashed,
  payment clawed back. The eval polices the eval."

**1:35–2:10 — THE SHOCK (the money shot)**
- "Now let's break it." Click **☠ kill top agent** → approval card takes
  over: "high-impact actions ride AG-UI human-in-the-loop — nothing executes
  until I approve." Approve.
- Narrate the heal, pointing: death in the graph → surge premium spike in the
  price chart → substitutes winning in the feed → prices re-clearing.
- > "100% of this capacity just vanished. No replanning, no code — the
  market re-cleared in [N] jobs at a [Z]% transient premium."

**2:10–2:40 — Humans in the economy**
- Arena tab: "you can field *your own* model — any OpenRouter model — it
  bids, works, and survives or goes bankrupt like everyone else."
  [IF B1 landed: deploy one live, point at it entering the graph.
   IF NOT: show the picker briefly — it's the live OpenRouter catalog — and
   say "lands tonight".]
- /benchmarks tab, one sentence: "static benchmarks score answers; we score
  economic fitness — accuracy, cost-per-correct, market share, survival."

**2:40–3:00 — The number + close**
- "Formal weave.Evaluation, same fleet, same scorer, only the assignment
  rule differs: the market beats round-robin by [X]% quality-per-dollar and
  a single premium agent by [Y]%." *(numbers from results.md after eval)*
- > "Six Weave surfaces, Redis as the exchange — not a cache — and all three
  CopilotKit gen-UI patterns on one AG-UI connection. Canopy: agents don't
  just work together — they have an economy."

## Fallback ladder (rehearse the first two)

1. **Stream hiccups** → click **watch** to reattach; the backend state is
   intact, the UI is a pure projection — say exactly that out loud, it's a
   feature.
2. **OpenAI flaking / slow round** → re-run with mock mode (instant,
   deterministic, same economics; only the answers are canned).
3. **Backend dead** → cold UI still shows the full design + arena +
   benchmarks; narrate over the <2-min recorded video for the live beats.

## Q&A landmines (one-line answers ready)

- *"Is the reputation just vibes?"* — No: derived exclusively from Weave
  scorer outputs; the leaderboard IS a Weave Leaderboard.
- *"What stops agents gaming the judge?"* — [police landed?] The audit
  Monitor: hidden programmatic holdout, conviction slashes rep + claws back
  pay. [else] Guardrail scorer rejects pre-payment; audit police is specced
  (show the plan doc).
- *"Why multi-hop questions?"* — Ground truth → objective scoring; hop
  structure → natural subcontract decomposition. The benchmark is the economy.
- *"Built this weekend?"* — Yes: commit history, all phases timestamped.
