---
status: superseded by ADR-0004
---

# The Visitor PWA is cut; Android owns the visitor experience

The SRS mandates both an Expo Android app and a Visitor PWA delivering "the same essential data"
(FR-027, FR-028) — which is also the one duplication the project brief explicitly forbids
("duplicated native Android + PWA logic"). With a 3-hour build and one team on the website, shipping
three web surfaces would have starved Control, the surface judges actually score. We cut the PWA:
**the website team builds Control and Desk only, and the Android app is the sole visitor surface.**

## Consequences

- Control gets roughly double the build time, which is where the demo is won or lost.
- We lose the zero-install QR fallback. That was insurance against a phone failing on stage, and we
  have accepted that risk deliberately by committing to a live device demo — it is not an oversight.
  If a phone dies, the demo degrades to Control + Desk and the visitor hop must be narrated.
- FR-028 is now out of scope and the judge answer changes: it is "an installable Android app for
  visitors", not "Android plus a zero-install PWA". Do not claim the PWA in the pitch.
- `flowpilot-core` stays framework-agnostic anyway, so a PWA remains cheap to add after the hackathon.
