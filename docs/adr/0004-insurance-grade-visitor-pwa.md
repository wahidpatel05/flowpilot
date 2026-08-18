---
status: accepted
---

# The Visitor PWA is reinstated, scoped as demo insurance

ADR-0003 cut the Visitor PWA to protect Control's build time. We reversed that: the PWA was the only
mitigation for a phone failing on stage, and losing the demo's visitor hop costs more than Control
losing polish. But the reason for the original cut is still real, so the PWA is reinstated **at
insurance scope, not at FR-028 parity** — one route that proves a real token and a live ETA, built
last, after Control and Desk pass their gates.

## In scope — and nothing beyond it

- Pick a Service from the seeded catalogue (a plain list; no Gemini routing)
- Join Queue, writing a real `tokens` row
- Token number, ETA, and people-ahead, computed with `calculateEta` from `flowpilot-core`
- A Realtime subscription so the ETA visibly drops when an Intervention is applied

## Explicitly out of scope

Freedom Radius, Journey, the Activity feed, Gemini service routing, notifications, and any motion
beyond a simple ETA transition. Every one of these exists on Android already. A second full visitor
product is exactly what ADR-0003 was right to reject.

## Consequences

- The demo has a fallback again: if the Android phone dies, a judge opens a URL and the visitor hop
  survives. This is the entire justification for the work.
- FR-028 is partially, not fully, satisfied — the PWA has no Freedom Radius or Journey. The pitch may
  say "zero-install QR access for visitors"; it may not claim parity with the Android app.
- Build order is a hard constraint, not a preference: **Control, then Desk, then the PWA.** If time
  runs out, the PWA is the thing that doesn't ship, and we are back to ADR-0003 with no code wasted.
- It lives as one route inside the existing Next.js app so it shares the Supabase client, the types,
  and the engine. Do not create a separate deployment for it.
