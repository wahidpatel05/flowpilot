---
status: accepted
---

# The Assignment is the unit FlowPilot moves

The V2 spec sheet offered three action types — `activate_counter`, `reassign_counter`,
`reassign_staff` — but all three resolve to editing a single `counter_assignments` row holding
`(counter_id, staff_id, service_id)`, and one of them is physically incoherent: "Counter 2" is a
desk bolted to a floor and cannot relocate to Examination. We collapsed the domain to two verbs
over one movable unit, the **Assignment**: `activate_counter` binds an idle Staff member to an
inactive Counter, and `reassign_staff` rebinds an active Staff member to a different Service,
gated by Skill. `reassign_counter` is deleted.

## Consequences

- The recommendation engine generates candidates over Assignments, so adding a resource type
  later (a roaming kiosk, a second location) means adding a candidate generator, not a verb.
- Skill becomes a hard constraint at the centre of the model rather than a nice-to-have, which is
  what makes the "why not just add another counter?" answer land.
- The Spec Sheet (§4, §10, §11) and SRS (FR-016, FR-017) still list three action types and are now
  stale on this point. This ADR overrides them. Any surface that ships a `reassign_counter` string
  will fail the database CHECK constraint, which is deliberate.
