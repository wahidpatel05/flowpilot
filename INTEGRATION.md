# FlowPilot — Integration Contract

Read this before writing a line on the website or the Android app. Three teams, one truth.

## What is already built for you

| Thing | Where | Owner |
|---|---|---|
| Frozen domain types | `flowpilot-core/src/types.ts` | backend/intelligence |
| Queue + ETA engine | `flowpilot-core/src/queue/` | backend/intelligence |
| Facility projection (rows → domain state) | `flowpilot-core/src/projection/` | backend/intelligence |
| Facility simulation | `flowpilot-core/src/simulation/` | backend/intelligence |
| Recommendation engine | `flowpilot-core/src/recommendation/` | backend/intelligence |
| Estimated Time Returned | `flowpilot-core/src/metrics/` | backend/intelligence |
| Schema + seed + demo fns | `supabase/` | backend/intelligence |
| Vocabulary | `CONTEXT.md` | everyone |

`flowpilot-core` is pure TypeScript with **zero dependencies** — no Supabase, no React, no I/O.
Both the website and the Android app import it directly. Copy the folder in if npm-linking across
repos costs you more than 5 minutes; just never edit your copy.

## The three rules

1. **Never reimplement the engine.** If you find yourself computing an ETA inside a component, stop.
   Call `calculateEta`. A second implementation is how the phone and the dashboard end up disagreeing
   on stage.
2. **Never invent a status string.** Every status lives in `types.ts` and is CHECK-constrained in
   Postgres. A typo fails at insert time, which is the point.
3. **Read `CONTEXT.md` before naming anything.** Two teams inventing two words for one concept is the
   most expensive bug available to us today.
4. **Never derive facility state from rows yourself.** Call `projectFacility(rows, { now })` from
   `flowpilot-core/src/projection/facility.ts`. It is the only place rows become domain state, and it
   already encodes the rules you would otherwise get subtly wrong: active Counters come from `active`
   `counter_assignments` and never from `counters.status` (ADR-0001); queue length counts `waiting`
   and `called` only; the average service time cold-starts on `services.default_service_minutes`;
   zero active Counters is an infinite ETA and `critical` Health, never `NaN`. It returns
   `FacilityServiceState[]` and `QueueSnapshot[]`, so `simulateFacility` and `recommendIntervention`
   take its output with no adaptation:

   ```ts
   const projection = projectFacility(rows);                        // rows → domain state
   const snapshot   = findQueueSnapshot(projection, examinationId);  // queue length, ETA, Health
   const visitorEta = projectTokenEta(projection, myTokenId);        // people ahead + this ETA
   const rec        = recommendIntervention({ ...projection, horizonMinutes: 60 });
   ```

## Two deviations from the spec sheet — these override it

- There is no `reassign_counter`. Only `activate_counter` and `reassign_staff`. See
  `docs/adr/0001-assignment-is-the-movable-unit.md`.
- There is no `human_minutes_saved`. The column and the concept are `estimated_minutes_returned`,
  and the UI label is **"Estimated time returned"**. See `docs/adr/0002-estimated-not-measured.md`.

## The closed loop, and who owns each hop

The demo is one causal chain. Each arrow is an owner boundary, and an unowned arrow is a dead demo.

```
Visitor joins            → Android / PWA    writes  tokens
Control sees it          → Control          subscribes  tokens
Simulate Rush            → Control          calls  simulate_rush()
Forecast + Digital Twin  → Control          calls  simulateFacility()
Recommendation appears   → Control          calls  recommendIntervention(), writes  recommendations
Manager approves         → Control          rpc  approve_recommendation()
Desk receives            → Desk             subscribes  interventions
Staff accepts            → Desk             rpc  accept_intervention()
CAPACITY ACTUALLY CHANGES→ POSTGRES        rpc  apply_intervention()  ← THE KEYSTONE
Visitor ETA drops        → Android / PWA    subscribes  counter_assignments, recomputes ETA
Time returned rises      → Control          reads  interventions
Timeline explains        → Control          subscribes  intervention_events
```

**The keystone hop lives in Postgres, so no UI team can get it wrong.** Every other hop is display;
that one hop is the only place the world actually changes, so it is one atomic RPC that any surface
calls. Do not write `counter_assignments` by hand from a client.

## Realtime subscriptions — subscribe narrowly

- **Visitor**: own token; `counter_assignments` filtered to their service.
- **Desk**: tokens for its service; interventions targeting its counter.
- **Control**: tokens, counter_assignments, recommendations, interventions, intervention_events.

Do not subscribe every client to every table. On hackathon wifi that is how you lose.

## Demo reset

`select reset_demo();` restores the live queue. `select simulate_rush();` injects the pressure.
Rehearse with these, not by hand-inserting rows.

## Environment variables — copy these names exactly

This project uses Supabase's **new** key format. The variable is `*_PUBLISHABLE_KEY`, **not**
`*_ANON_KEY`, and the key starts `sb_publishable_`. Using the old name yields `undefined` at runtime
with no error, which is a miserable thing to debug at hour two.

- Web (Control + Desk): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- Mobile (Visitor): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- Server-only: `GEMINI_API_KEY` — never prefixed with `NEXT_PUBLIC_` or `EXPO_PUBLIC_`

See `.env.example` for the shape. The real values are in `.env.local`, which is gitignored; get them
from the team channel. The publishable key is safe in a client bundle — that is what it is for. No
service-role key is needed anywhere in FlowPilot.

## Database RPCs — call these, don't reinvent them

| RPC | Who calls it | What it does |
|---|---|---|
| `reset_demo()` | Control | Restores the live queue between rehearsals |
| `simulate_rush()` | Control | Injects demand; tokens marked `is_simulated` |
| `approve_recommendation(id)` | Control | Recommendation → Intervention, status `approved` |
| `accept_intervention(id)` | Desk | Status `accepted` |
| `apply_intervention(id)` | Control or Desk | **Changes capacity for real.** Atomic, skill-checked |
| `reject_recommendation(id, reason)` | Control | Status `rejected`, logged to the timeline |
| `expire_temporary_assignments()` | Any | Ends temporary assignments past `ends_at` |

Every one is `security definer` and granted to `anon`, so call them with `supabase.rpc('name', {...})`
using the publishable key. They raise `P0001` with a human-readable message on invalid state — surface
that message to the operator rather than swallowing it.

## Build order — this is a constraint, not a preference

Website team, in this order, and do not start one before the previous works end to end:

1. **Control** — the Digital Twin, the Recommendation card, Apply, Estimated Time Returned, the
   timeline. This is the surface judges score. It gets the most time because it earns the most.
2. **Desk** — Call Next, Start, Complete, Accept assignment. Four big buttons. It is allowed to be
   plain; it is on stage for about four seconds.
3. **Visitor PWA** — one route, insurance scope only, per `docs/adr/0004-insurance-grade-visitor-pwa.md`.
   Service list, Join Queue, token number, ETA, people ahead, live ETA update. Nothing else.

If the clock runs out, the PWA is what doesn't ship. That is the plan, not a failure — the Android app
is the primary visitor surface and the PWA exists only so a dead phone can't kill the demo.

## Rehearse the failure, once

Before judging, run the golden path once with the phone deliberately switched off, using the PWA in a
browser instead. It takes two minutes and converts your single biggest stage risk into a shrug.
