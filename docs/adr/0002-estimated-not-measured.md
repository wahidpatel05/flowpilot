---
status: accepted
---

# Estimated Time Returned, never "measured"

The project brief described the impact metric as "Human Time Saved **measured**", but the number is
computed as `baselinePersonMinutes - optimizedPersonMinutes` where both terms come from our own
simulator — it is a counterfactual against a facility that never existed, and nobody observed it.
We renamed the concept to **Estimated Time Returned** in the database, the engine, the UI copy and
the demo script, and we state the estimate's provenance out loud when presenting.

## Consequences

- A judge asking "how do you know?" gets a confident answer about the model instead of catching an
  overclaim, which is a net win for credibility even though the weaker word feels less impressive.
- The column is `estimated_minutes_returned`; `human_minutes_saved` does not exist. Any surface
  reading the old name gets undefined, loudly, at integration time rather than on stage.
