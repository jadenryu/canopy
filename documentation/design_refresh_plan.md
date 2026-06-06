# Canopy — Design Refresh Handoff

> **Audience:** a Claude Code agent doing a visual-only redesign pass on the frontend.
> **Goal:** take the current functional-but-plain dark UI and turn it into a polished,
> professional **trading-terminal** aesthetic (Bloomberg-terminal energy: dark, dense,
> monospace numbers, emerald accents, micro-animations on live data).
> **Authored:** 2026-06-06. Direction chosen by the project owner from three candidates.

---

## 0. What this app is (60-second context)

Canopy is a hackathon demo (WeaveHacks): a **live, watchable labor market where AI
agents bid on jobs, hire each other, and build reputation**. The backend (FastAPI +
Redis + Weave) is the entire brain; the frontend is a **pure projection of backend
state** received over one AG-UI event stream (`STATE_SNAPSHOT` / `STATE_DELTA`).

The demo's money shot: judges watch prices converge in real time, then a "shock"
(e.g., kill the top agent) hits and the market visibly heals. The UI must make that
*feel* alive — flashing rows, moving bars, a pulsing event feed.

The UI also demonstrates **three CopilotKit gen-UI patterns**, labeled by badges on
each panel: `controlled` (fixed widgets), `declarative` (backend streams a UI spec),
`open-ended` (agent-authored HTML in a sandboxed iframe). **These badges are
load-bearing for judging — keep them visible, just make them beautiful.**

---

## 1. Hard constraints — read before touching anything

1. **Visual changes only.** Do not modify `lib/useMarketState.ts` data flow, the
   AG-UI connection, `app/api/copilotkit/route.ts`, or anything in `backend/`.
   Props/types stay as they are; you restyle what renders.
2. **Tailwind CSS v4.** There is no `tailwind.config.js`; theme tokens are defined
   in CSS via `@theme` in `app/globals.css`. Don't create a v3-style config.
3. **Next.js 16.2.7 — newer than your training data.** Per `frontend/AGENTS.md`:
   read the relevant guide in `frontend/node_modules/next/dist/docs/` before
   writing Next-specific code (fonts, layout, etc.). Heed deprecation notices.
4. **No new heavy dependencies.** Recharts is already in. Allowed additions:
   a Google font via `next/font/google` (zero-runtime), and at most one tiny
   utility (e.g., `clsx`). **No** component libraries (shadcn, MUI), **no** CSS-in-JS,
   **no** framer-motion (CSS animations are enough and safer under stream load).
5. **Performance under stream load.** Events arrive in bursts (a full market round
   is seconds; dozens of events/sec). All animation must be CSS
   transform/opacity-based. Recharts keeps `isAnimationActive={false}` — that's
   intentional, don't re-enable it. No layout-thrashing animations on table rows.
6. **Empty states must survive.** Every panel has a "no data yet" state (the demo
   starts cold, then fills). Restyle them; never remove them.
7. **The `ReportFrame` iframe keeps `sandbox=""`** (no scripts, no same-origin).
   Its *content* is agent-generated and unstyleable from outside — style the frame
   chrome only.
8. **Demo reliability beats beauty.** If a flourish risks jank or breakage, cut it.
9. **Commit early and often** with descriptive messages (judges read the history
   as proof of weekend work). Work on a branch is fine, but small commits.
10. Dark theme **only** — no light mode, no theme toggle. Delete the
    `prefers-color-scheme` block in `globals.css` and hardcode dark.

---

## 2. Current state inventory

All paths relative to `frontend/`.

| File | What it is | Current look |
|---|---|---|
| `app/layout.tsx` | Root layout, loads Geist + Geist Mono, wraps `MarketProvider` | fine structurally |
| `app/page.tsx` | The whole screen: header → 3-col grid of 9 panels → footer → floating `ApprovalCard` | `bg-black font-mono`, ad-hoc utility classes |
| `app/globals.css` | Tailwind v4 import + stale starter tokens | still has light/dark starter cruft + `font-family: Arial` body rule (!) |
| `components/Panel.tsx` | Shared chrome for every widget + gen-UI pattern badge | plain `border-neutral-800 bg-neutral-950` box |
| `components/OrderBook.tsx` | Jobs table (id, category, bids, winner, price, status) | bare `<table>`, status colors via a `STATUS_COLORS` map |
| `components/PriceChart.tsx` | Recharts multi-line clearing-price chart | default-ish recharts, hardcoded hex colors |
| `components/Leaderboard.tsx` | Rank rows + green reputation bar; bankrupt = strikethrough | thin bars, no rank-change affordance |
| `components/Wallets.tsx` | Balance bars sorted desc; bankrupt = red | same thin-bar pattern |
| `components/HiringGraph.tsx` | Who-hires-whom tree; indentation = subcontract depth | plain indented rows + status dots, no tree lines |
| `components/EventFeed.tsx` | One line per market event, `TYPE_COLORS` map, ~20 event types | dense text rows, no entry animation, no autoscroll affordance |
| `components/DeclarativePanel.tsx` | Generic renderer for backend-streamed UI spec (stats/table/note) | minimal boxes |
| `components/ReportFrame.tsx` | Sandboxed iframe for agent-authored HTML report | bare iframe |
| `components/ControlPanel.tsx` | HITL: post-a-job form, demand spike / inject liquidity / kill top agent buttons; exports `ApprovalCard` (floating approve/reject card) | functional, unstyled-feeling form controls |

**Cross-cutting problems to fix:**
- Status colors are duplicated in three independent maps (`OrderBook.STATUS_COLORS`,
  `HiringGraph.STATUS_DOT`, `EventFeed.TYPE_COLORS`) with slight drift. Centralize.
- Everything is `text-xs`/`text-[11px]` neutral-on-black with no hierarchy.
- Body font is Arial (starter-kit leftover) while `page.tsx` slaps `font-mono` on
  everything. Numbers don't use tabular figures, so they jitter as values change.
- No motion at all: a *live market* that looks like a static screenshot.
- All 9 panels are identical `h-72` boxes in a uniform 3-col grid — no visual
  hierarchy between the hero panels (PriceChart, EventFeed) and supporting ones.

---

## 3. Design system (define once in `globals.css`)

### 3.1 Palette — "dark terminal, emerald signal"

Define as Tailwind v4 `@theme` tokens so utilities like `bg-surface` /
`text-positive` exist everywhere:

```css
@import "tailwindcss";

@theme {
  /* base surfaces — near-black with a faint green cast */
  --color-bg:        #070a09;  /* page background */
  --color-surface:   #0c100e;  /* panel background */
  --color-surface-2: #111714;  /* nested elements: inputs, bar tracks, table header */
  --color-edge:      #1d2622;  /* default borders */
  --color-edge-2:    #2c3a33;  /* hover/active borders */

  /* text ladder */
  --color-ink:       #e6ece9;  /* primary text */
  --color-ink-dim:   #8b9892;  /* secondary text */
  --color-ink-faint: #56615c;  /* labels, empty states */

  /* signal colors (semantic, not decorative) */
  --color-positive:  #34d399;  /* settled, paid, up   (emerald-400) */
  --color-negative:  #f87171;  /* rejected, failed, bankrupt, shock */
  --color-working:   #fbbf24;  /* awarded, executing, escrow (amber-400) */
  --color-info:      #38bdf8;  /* open jobs, registrations (sky-400) */
  --color-verify:    #a78bfa;  /* verifying, scored (violet-400) */
  --color-special:   #e879f9;  /* scenario markers, reports (fuchsia-400) */

  /* brand */
  --color-canopy:    #10b981;  /* the one brand green — logo, live dot, primary CTA */

  --font-mono: var(--font-jetbrains-mono);
  --font-sans: var(--font-geist-sans);
}
```

Usage rules:
- Page = `bg-bg`; panels = `bg-surface border-edge`; inputs/tracks = `bg-surface-2`.
- Signal colors are **only** for state. Never use green for decoration — when the
  whole screen is calm, green should mean "money flowed / job settled".
- Glow = same color at low alpha as a shadow, e.g.
  `shadow-[0_0_12px_rgba(52,211,153,0.15)]`. Use sparingly: live dot, settled
  flashes, the ApprovalCard. More than ~3 glows visible at once = mud.

### 3.2 Typography

- Load **JetBrains Mono** via `next/font/google` in `layout.tsx` (variable
  `--font-jetbrains-mono`), replacing Geist Mono. Keep Geist (sans) loaded for the
  rare prose moments (panel subtitles, approval card body).
- Default body font = the mono (it's a terminal). Remove the Arial rule and the
  stale `:root`/`prefers-color-scheme` starter block from `globals.css`.
- **All numerals get `tabular-nums`** (`font-variant-numeric: tabular-nums` on
  `body` is fine) so prices/balances don't jitter as they update.
- Type scale (keep it tight, it's a dense terminal):
  - Panel titles: `text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-dim`
  - Data rows: `text-xs` (12px), `leading-5`
  - Micro-labels/badges: `text-[10px]`
  - The H1 wordmark: `text-lg font-bold tracking-tight`
- One shared style for table headers (`text-[10px] uppercase tracking-wider
  text-ink-faint`) used by OrderBook + DeclarativePanel tables.

### 3.3 Shared status tokens (new file: `lib/status.ts`)

Create one module exporting the semantic mapping all panels import, replacing the
three drifting maps:

```ts
export const STATUS = {
  open:      { text: "text-info",     dot: "bg-info" },
  awarded:   { text: "text-working",  dot: "bg-working" },
  executing: { text: "text-working",  dot: "bg-working" },
  verifying: { text: "text-verify",   dot: "bg-verify" },
  settled:   { text: "text-positive", dot: "bg-positive" },
  rejected:  { text: "text-negative", dot: "bg-negative" },
  failed:    { text: "text-negative", dot: "bg-negative" },
} as const;
```

Also move `EventFeed`'s `TYPE_COLORS` here as `EVENT_COLORS`, re-expressed in the
semantic tokens (e.g. `settled: "text-positive"`, `shock: "text-negative font-bold"`).

### 3.4 Motion vocabulary (define keyframes in `globals.css`)

| Name | What | Where |
|---|---|---|
| `flash-row` | background flashes `--color-positive` at 12% alpha → transparent over 800ms | new OrderBook rows, new EventFeed lines, wallet balance changes |
| `pulse-dot` | scale 1→1.6 + fade ring, 2s loop | the LIVE dot, executing-status dots |
| `slide-in` | translateY(-4px)+fade in, 200ms ease-out | new EventFeed entries, ApprovalCard mount |
| bar transitions | keep existing `transition-all duration-500` | Leaderboard/Wallets bars |

Implementation note for flashes: key the animation off the row's identity
(`key={...}` + `animation` on mount) — new rows animate on insertion, no JS timers
needed. For value-change flashes (wallets), a tiny `usePrevious` hook comparing
the value and toggling a class is acceptable; keep it inside the component.

`@media (prefers-reduced-motion: reduce)` → disable all of the above.

---

## 4. Layout redesign (`app/page.tsx`)

Replace the uniform 9-cell grid with a deliberate hierarchy. Target (desktop,
`lg:` and up — collapse to 1 column below):

```
┌──────────────────────────────────────────────────────────────────┐
│ HEADER  🌳 CANOPY  agent labor market   ●LIVE  [watch][▶ run]    │
├──────────────────────────────────────────────────────────────────┤
│ TICKER STRIP  jobs settled · total volume · active agents · …    │  ← new, thin
├──────────────────────────┬───────────────────────────────────────┤
│ CLEARING PRICES (hero)   │  EVENT FEED (hero, taller)            │
│ 2 cols wide, h-80        │  1 col, h-80, autoscrolls             │
├────────────┬─────────────┼───────────────────────────────────────┤
│ ORDER BOOK │ LEADERBOARD │  WALLETS                              │
├────────────┼─────────────┼───────────────────────────────────────┤
│ HIRING     │ JOB DETAIL  │  ANALYST REPORT                       │
│ GRAPH      │ (declarat.) │  (open-ended)                         │
├────────────┴─────────────┴───────────────────────────────────────┤
│ CONTROL PANEL (full width, short — form left, shock buttons right)│
├──────────────────────────────────────────────────────────────────┤
│ FOOTER  gen-UI legend as colored chips                           │
└──────────────────────────────────────────────────────────────────┘
```

Details:
- **Header**: wordmark `🌳 CANOPY` (caps, tracking-tight, the emoji is the logo —
  fine to keep), tagline in `text-ink-faint`. Right side: LIVE indicator (pulsing
  `bg-canopy` dot + `LIVE`/`IDLE` label), `watch` ghost button, `▶ run scenario`
  as the **one** solid-fill primary button (`bg-canopy text-black`, hover
  brightens). Ledger count moves into the ticker strip.
- **Ticker strip** (new, purely derived from existing `state` — no data changes):
  a thin `border-y border-edge` bar with 4–6 stats computed from props already on
  the page: settled jobs count, active agents, bankrupt count, ledger entries,
  last clearing price. Separated by `·`, `text-[11px] text-ink-dim`, numbers in
  `text-ink`. This is cheap and instantly reads "terminal".
- **Grid**: `lg:grid-cols-3` with `lg:col-span-2` on PriceChart; heights move from
  uniform `h-72` to `h-80` for the hero row, `h-72` for the middle rows. ControlPanel
  becomes a full-width `lg:col-span-3` short strip (`h-auto`), since a form doesn't
  need chart height.
- **Footer**: replace the prose sentence with three chips —
  `■ controlled · fixed widgets`, `■ declarative · streamed UI spec`,
  `■ open-ended · sandboxed agent HTML` — each chip in its pattern color (badge
  colors from §5.1), plus the HITL note. Reads as a legend, not a paragraph.

---

## 5. Component-by-component spec

Work through these in order. Each is a self-contained commit.

### 5.1 `Panel.tsx` — the shell everything inherits
- `bg-surface border border-edge rounded-lg overflow-hidden`; on hover
  `border-edge-2` (subtle, 150ms).
- Header: `bg-surface-2/50 border-b border-edge px-3 py-2`; title per §3.2.
- Pattern badge: keep the three colors (sky/amber/fuchsia → `info`/`working`/`special`)
  but render as a filled-tint chip: `bg-{color}/10 text-{color} border-{color}/30
  rounded-full px-2 py-0.5 text-[10px] lowercase`. These must stay readable —
  judges look for them.
- Add an optional `accent?: boolean` prop: hero panels get a 2px top border in
  `--color-canopy` (use for PriceChart + EventFeed).
- Style scrollbars globally in `globals.css`: thin (6px), `bg-edge` thumb,
  transparent track. The default chrome scrollbar ruins the terminal look.

### 5.2 `OrderBook.tsx`
- Table header per §3.2 shared style; rows `border-t border-edge/60`,
  `hover:bg-surface-2/60`.
- Job id in `text-ink-dim`; price right-aligned `tabular-nums text-ink`.
- Status: replace bare colored text with a dot+text pair from `lib/status.ts`
  (`<span class="dot"/> settled`), dot `h-1.5 w-1.5 rounded-full`.
- `★` (3-hop marker) → `text-working` so it reads as "premium job".
- New rows get `flash-row` (key insight: rows are newest-first, so animate the
  first render of each `key`).
- Empty state: see §5.10.

### 5.3 `PriceChart.tsx`
- Series colors: replace the hardcoded `COLORS` array with the semantic ladder —
  `#34d399, #38bdf8, #fbbf24, #e879f9, #a78bfa, #f87171, #a3e635, #2dd4bf` (same
  hues as the tokens, fine to keep as a local array since recharts needs raw hex).
- Grid: `stroke="#1d2622"` (the edge token), dasharray stays.
- Axes ticks: `fill: #56615c`, fontSize 10.
- Tooltip: `background: #0c100e; border: 1px solid #2c3a33; border-radius: 6px;
  fontSize: 11`, mono.
- Lines: `strokeWidth={2}`, `dot={false}`, `activeDot={{ r: 3 }}` — cleaner than
  dotted lines at every tick. Keep `isAnimationActive={false}` and `connectNulls`.
- Legend: move to `verticalAlign="top"`, `height: 24`, fontSize 10 — out of the
  way of the converging lines (the demo's hero visual).
- Title this panel's story: keep "Clearing prices" but add a one-line
  `text-ink-faint` subtitle slot in Panel (optional prop) — "per (category, hops) —
  watch them converge".

### 5.4 `Leaderboard.tsx`
- Rank column: `#1` gets `text-working` (gold) and a `👑` (or `▲` if too cute);
  ranks 2–3 `text-ink`; rest `text-ink-faint`.
- Reputation bar: track `bg-surface-2`, fill gradient
  `bg-gradient-to-r from-emerald-700 to-emerald-400`, `rounded-full`, height 2px→6px
  (`h-1.5` is fine, but round the ends).
- Strategy tag: render as a tiny chip (`bg-surface-2 text-ink-faint rounded px-1`)
  instead of a bare word.
- `w/f` record: color the pieces — wins `text-positive`, failures `text-negative`,
  e.g. `4w` `/` `1f`.
- Bankrupt rows: keep `opacity-40 line-through`, add `text-negative` on the id.

### 5.5 `Wallets.tsx`
- Same bar treatment as Leaderboard (track `bg-surface-2`, rounded, gradient fill:
  emerald for healthy, amber `from-amber-700 to-amber-400` for <100, red flat for
  bankrupt).
- Balance number: `tabular-nums`; flash the row (`flash-row`) when a balance
  changes (small `usePrevious` comparison — this is the panel where money visibly
  moves, make it felt).
- Add a `Δ` next to the balance when it changed in the last update: `+12.40` in
  `text-positive` / `-3.00` in `text-negative`, fading out via the flash animation.
  Derived purely from previous-props comparison; no data-layer changes.

### 5.6 `HiringGraph.tsx`
- Add tree guides: children get a `border-l border-edge ml-[7px] pl-3` wrapper
  instead of raw `paddingLeft` math — reads as an actual tree.
- The `client → winner` arrow: `text-ink-faint` arrow, client `text-ink-dim`,
  winner `text-ink`; price chip `text-positive tabular-nums` once settled.
- Status dot: from `lib/status.ts`; executing dots get `pulse-dot`.
- Subcontract rows (depth>0) at `text-[11px]` and slightly dimmer — hierarchy
  through type, not just indent.

### 5.7 `EventFeed.tsx`
- **Autoscroll**: pin to top (newest-first already) — fine as is; new entries get
  `slide-in` + `flash-row`.
- Event type column: keep the color map (moved to `lib/status.ts`), render the
  type as a fixed-width lowercase tag; add a 2px left border on the row in the
  event's color for fast scanning (`border-l-2 border-current pl-2` trick on the
  colored span's row).
- Big moments get weight: `shock`, `bankruptcy`, `fork`, `scenario_*` rows get
  `bg-{color}/5` full-row tint + bold type. The shock-and-heal demo beat must be
  unmissable in this panel.
- Cap rendered rows (~80) with `slice` — it's a feed, not an archive (DOM size
  under burst load).
- Timestamps: add a dim `HH:MM:SS` left column if `e.ts` is available (it is —
  it's already used in the key). `text-ink-faint text-[10px] tabular-nums`.

### 5.8 `ControlPanel.tsx` + `ApprovalCard`
- Now full-width (§4): two-zone layout — job form left (textarea + selects inline),
  shock buttons right, separated by `border-l border-edge`.
- Inputs: `bg-surface-2 border border-edge rounded-md px-2.5 py-1.5
  focus:border-canopy focus:outline-none placeholder:text-ink-faint` — focused
  field glows faintly (`focus:shadow-[0_0_0_1px_var(--color-canopy)]`).
- Button hierarchy:
  - `post job` → solid `bg-info/15 text-info border-info/40 hover:bg-info/25`
  - `⚡ demand spike` → outline working
  - `💰 inject liquidity`, `☠ kill top agent` → outline emerald / red, with a tiny
    `HITL` chip on each so the approval-gating is legible before clicking.
- `ApprovalCard`: this is a judging moment — make it land. Keep fixed bottom-right;
  add `slide-in` on mount, a soft amber glow
  (`shadow-[0_0_24px_rgba(251,191,36,0.2)] border-working/60`), a subtle pulsing
  border, and a dim full-screen backdrop (`fixed inset-0 bg-black/40 -z-10` inside
  the same fixed wrapper) so attention snaps to it. Approve = solid emerald,
  Reject = ghost.

### 5.9 `DeclarativePanel.tsx` + `ReportFrame.tsx`
- DeclarativePanel stats: cards `bg-surface-2 border-edge rounded-md`, label per
  micro-label style, value `text-sm text-ink tabular-nums`.
- Declarative table: shared table-header style; `highlight` rows →
  `bg-positive/10 text-positive` with the 🏆 kept.
- ReportFrame: style the chrome like a filed document — iframe gets
  `bg-white rounded` (agent HTML usually assumes light) **only if** current agent
  reports render dark; check first by running a scenario — if reports are
  dark-styled, keep `bg-black`. Add a thin header strip inside the panel body:
  `“filed by analyst-agent” text-ink-faint text-[10px]` when html is present.
- Both keep their distinctive badge colors prominently — these two panels *are*
  the declarative/open-ended demo evidence.

### 5.10 Shared empty state (new: `components/Empty.tsx`)
One component used by every panel: centered, `text-ink-faint text-xs`, a dim
relevant glyph above the text (`◌` / `⊘` style, not emoji soup), and where useful
a hint (`run a scenario ▶`). Replaces the seven slightly-different inline versions.

---

## 6. Implementation order (commit after each)

1. **Foundations** — `globals.css` rewrite (tokens §3.1, keyframes §3.4,
   scrollbars), `layout.tsx` font swap (JetBrains Mono; read the Next 16 font docs
   first per constraint #3), `lib/status.ts`, `components/Empty.tsx`.
2. **Shell** — `Panel.tsx` restyle + `accent` prop; `page.tsx` new layout, header,
   ticker strip, footer chips.
3. **Hero panels** — `PriceChart`, `EventFeed` (incl. autoscroll/cap/flashes).
4. **Data panels** — `OrderBook`, `Leaderboard`, `Wallets`, `HiringGraph`.
5. **Interactive** — `ControlPanel`, `ApprovalCard`, `DeclarativePanel`,
   `ReportFrame`.
6. **QA pass** — §7.

Each step must leave the app building and working; don't batch the whole redesign
into one commit.

## 7. Verification — definition of done

Run from `frontend/`:

- [ ] `npm run lint` and `npm run build` pass clean.
- [ ] `npm run dev`, open the page **cold** (backend down or idle): every panel
      shows its styled empty state; nothing crashes; header shows IDLE.
- [ ] Start the backend (`cd backend && uv run ...` — see root README) and click
      **▶ run scenario** (it has a mock mode — `runScenario({ jobs: 13, mock: true })`
      is wired to the same button path; if no mock toggle is exposed in the UI,
      temporarily call `launch(true)` to verify without API spend).
- [ ] During the run: rows flash on insert, event feed slides/scans, bars animate,
      LIVE dot pulses, prices chart draws multiple colored series, no dropped
      frames or scroll jank with the dev-tools performance panel open.
- [ ] Trigger `💰 inject liquidity` → ApprovalCard appears with glow + backdrop;
      approve and reject both work.
- [ ] All three pattern badges (`controlled`, `declarative`, `open-ended`) are
      visible and legible at a glance; footer legend matches them.
- [ ] Window at 1280px and at full-screen 1440p: grid hierarchy holds; below `lg`
      it collapses to one column without overflow.
- [ ] `prefers-reduced-motion` (toggle in dev tools rendering tab): animations off.
- [ ] Screenshot the populated dashboard and drop it in `documentation/` (it'll be
      used for the Devpost page).

## 8. Explicitly out of scope

- Light mode, theming, settings.
- Mobile-first work beyond "collapses to one column sanely".
- Any backend or `useMarketState.ts` logic change; any new data fields. If a
  visual idea needs data that isn't in `state`, skip it and note it at the end of
  your handback summary.
- Accessibility audit beyond reduced-motion + sensible contrast (the token ladder
  above keeps body text ≥ AA on the surfaces given).
- Rewriting agent-generated report HTML styling (it's sandboxed agent output).
