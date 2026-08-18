# DeQueue — Supabase

Two files, run in order:

| File | What it does |
| --- | --- |
| `migrations/0001_init.sql` | Drops and recreates the whole DeQueue schema: 16 tables, indexes, Realtime publication, RLS, and the two demo functions. Destructive and re-runnable. |
| `seed.sql` | MHSSCE demo data: org, location, 3 services, 4 staff, 5 counters, flow graph, 40 completed history tokens, then calls `reset_demo()` to build the live queue. Re-runnable. |

Both have been executed end-to-end against a real Postgres 17 and re-run twice to
confirm idempotency.

---

## How to apply

### Option A — Supabase SQL editor (fastest, use this during the hackathon)

1. Supabase dashboard → your project → **SQL Editor** → **New query**.
2. Paste the entire contents of `migrations/0001_init.sql`. Click **Run**.
   Expect `Success. No rows returned` (plus a `NOTICE` line if `pgcrypto` is absent — harmless).
3. **New query** again. Paste the entire contents of `seed.sql`. Click **Run**.
4. The last statement in `seed.sql` prints a verification table. It should read:

   | slug | default_service_minutes | waiting | serving | completed | active_counters | measured_avg_service_minutes |
   | --- | --- | --- | --- | --- | --- | --- |
   | documents | 4 | 5 | 1 | 15 | 1 | ~3.6–4.4 |
   | examination | 6 | 6 | 1 | 13 | 1 | ~5.6–6.4 |
   | fees | 3 | 3 | 1 | 12 | 1 | ~2.8–3.2 |

   If `measured_avg_service_minutes` is null, the history insert did not run — re-run `seed.sql`.

Do not run the two files in a single query tab. `seed.sql` depends on
`reset_demo()`, which `0001_init.sql` creates.

### Option B — Supabase CLI

```bash
# One-time, from the repo root
supabase link --project-ref <your-project-ref>

# Push the migration to the linked remote project
supabase db push

# Then seed (the CLI does not auto-run seed.sql against a remote project)
psql "$DATABASE_URL" -f supabase/seed.sql
# ...or just paste seed.sql into the SQL editor.
```

Local stack instead of remote:

```bash
supabase start
supabase db reset     # replays migrations/0001_init.sql AND supabase/seed.sql
```

`supabase db reset` picks up `supabase/seed.sql` automatically. If it does not,
add this to `supabase/config.toml`:

```toml
[db.seed]
enabled = true
sql_paths = ["./seed.sql"]
```

### Option C — a database that already exists (use this after the DeQueue rename)

`migrations/0005_rename_to_dequeue.sql` exists for one reason: every message a
person actually reads is raised from inside a function, so a database created
before the rename keeps saying `FlowPilot:` however many times the apps are
rebuilt. A Desk clerk sees it next to a UI that already says DeQueue.

Paste `migrations/0005_rename_to_dequeue.sql` into the SQL editor and Run. It
redefines the seven affected functions in place — **no table is touched and no
row is deleted**, so the completed Token history that keeps ETAs realistic
survives. Re-running `0001_init.sql` would fix the text too, but it drops
everything.

`0001`–`0004` stay the source of truth. `0005`'s bodies are copied verbatim from
the renamed `0002` and `0004`; if one of those functions changes again, change it
there and regenerate `0005`.

### Re-running

`0001_init.sql` starts with `drop table if exists ... cascade`, so re-running it
wipes and rebuilds everything — that is the intended demo reset. For a reset that
**keeps the completed history** (so ETAs stay realistic), call `reset_demo()`
instead; see below.

---

## Env vars the client apps need

Get both values from Supabase dashboard → **Project Settings → API**.

**Web (Next.js App Router)** — `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public key>

# Server-side only. No NEXT_PUBLIC_ prefix — never ship this to the browser.
GEMINI_API_KEY=<gemini key>
```

**Mobile (React Native / Expo)** — `.env`:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
```

The anon key is all any surface needs. RLS is permissive for the demo (see
"Security posture"), so no auth flow and **no service-role key** is required in
any client. If you find yourself reaching for the service-role key, something
else is wrong.

---

## Tables

| Table | Purpose |
| --- | --- |
| `organizations` | MHSSCE. |
| `locations` | Student Services, `max_capacity` 200. |
| `services` | The 3 queues, with `default_service_minutes` and the healthy/critical wait thresholds that produce `QueueHealth`. |
| `staff` | People. `status` `idle` \| `active` (`StaffAvailability`). |
| `staff_skills` | `(staff_id, service_id)` PK. Gates `reassign_staff`. |
| `counters` | Physical desks. `status` `active` \| `inactive`. No service column — desks do not belong to a service. |
| `counter_assignments` | **The movable unit**: a `(staff, counter, service)` binding. `assignment_type` `primary` \| `temporary`. |
| `tokens` | Queue entries. Full `TokenStatus` lifecycle, `is_simulated` flag. |
| `queue_events` | Append-only queue telemetry. Feeds Operational Replay. |
| `recommendations` | Simulator output awaiting a decision. |
| `interventions` | An approved recommendation moving through the lifecycle. |
| `intervention_events` | Append-only timeline rows rendered by Control. |
| `journeys` | Multi-service visit, one journey number. |
| `journey_steps` | Ordered steps, unique per `(journey_id, sequence)`. |
| `service_flow_edges` | Facility flow graph. `expected_share` 0..1. |
| `crowd_samples` | Optional per spec sheet section 5. Created, unseeded. |

### Functions

| Function | Returns | Behaviour |
| --- | --- | --- |
| `reset_demo()` | `jsonb` | Deletes live state (non-completed + simulated tokens, journeys, recommendations, interventions, timelines, orphaned queue events), restores baseline counter/staff capacity, and re-seeds the live queue. **Completed history is preserved**, so ETA stays realistic. |
| `simulate_rush()` | `jsonb` | Inserts documents +8, fees +4, examination +12 as `waiting` tokens with `is_simulated = true`, plus one `rush_simulated` queue event per service. |

Call from any client with the anon key:

```ts
const { data } = await supabase.rpc("reset_demo");
// { reset: true, waiting_tokens: 14, serving_tokens: 3, completed_history_preserved: 40 }

const { data } = await supabase.rpc("simulate_rush");
// { rush: true, tokens_added: 24, documents: 8, fees: 4, examination: 12 }
```

---

## Seeded IDs (stable — safe to hardcode)

| Entity | UUID |
| --- | --- |
| Organization MHSSCE | `00000000-0000-4000-8000-000000000001` |
| Location Student Services | `00000000-0000-4000-8000-000000000010` |
| Service `documents` (Document Verification, 4 min) | `00000000-0000-4000-8000-000000000101` |
| Service `fees` (Fees, 3 min) | `00000000-0000-4000-8000-000000000102` |
| Service `examination` (Examination Cell, 6 min) | `00000000-0000-4000-8000-000000000103` |
| Staff A — Priya Deshmukh (documents, examination) | `00000000-0000-4000-8000-000000000201` |
| Staff B — Rahul Iyer (fees) | `00000000-0000-4000-8000-000000000202` |
| Staff C — Ayesha Khan (documents, fees) | `00000000-0000-4000-8000-000000000203` |
| Staff D — Vikram Rao (examination) — **IDLE** | `00000000-0000-4000-8000-000000000204` |
| Counter 1..5 | `...000000000301` … `...000000000305` |

Prefer looking services up by `slug` (`documents` / `fees` / `examination`) —
those are unique and are what the flow graph and both demo functions key on.

### Baseline demo state

```
Counter 1  ACTIVE    Ayesha Khan     -> documents
Counter 2  ACTIVE    Priya Deshmukh  -> examination
Counter 3  ACTIVE    Rahul Iyer      -> fees
Counter 4  INACTIVE  (spare)
Counter 5  INACTIVE  (spare)         <- activate_counter target

Vikram Rao  IDLE, examination-skilled <- activate_counter candidate
```

Queue: 5 waiting documents, 3 fees, 6 examination, 1 `serving` per active counter,
40 completed history tokens.

Resulting health at t0, with one counter per service:

```
fees          3 x 3 min => ~9 min    healthy
documents     5 x 4 min => ~20 min   busy
examination   6 x 6 min => ~36 min   CRITICAL
```

So Examination is the pressure point from the moment you load Control, and the P1
fix is deterministic: **`activate_counter` on Counter 5 with Vikram Rao.**
`simulate_rush()` deepens exactly that crisis (examination 6 → 18 waiting).

---

## Realtime

The migration adds these to the `supabase_realtime` publication and sets
`replica identity full` on each, so `old_record` is populated on updates:

`tokens`, `counter_assignments`, `recommendations`, `interventions`,
`intervention_events`, `queue_events`

Subscribe narrowly — per the Realtime Contract, do not put every client on every
table:

```ts
supabase
  .channel(`tokens:${serviceId}`)
  .on("postgres_changes",
      { event: "*", schema: "public", table: "tokens",
        filter: `service_id=eq.${serviceId}` },
      handler)
  .subscribe();
```

If a Realtime subscription silently receives nothing, check
**Database → Replication** in the dashboard and confirm the table is listed under
`supabase_realtime`.

---

## Security posture

**This is a 3-hour hackathon demo.** RLS is enabled on all 16 tables, and each
one carries a single fully permissive policy named `<table>_demo_all`
(`for all to anon, authenticated using (true) with check (true)`). Any client
holding the anon key can read and write everything. That is a deliberate
trade-off for "it works from the client".

`migrations/0001_init.sql` section 17 contains a clearly marked comment block
with the production policies these would be replaced by: visitor-owns-token
`select`/`insert`, desk-operator `update` scoped to the operator's active
assignment, ops-manager-only writes on the intelligence tables, append-only
audit tables, and dropping the demo RPCs. Read that block before this schema
goes anywhere real.

---

## Contract notes

`flowpilot-core/src/types.ts` is frozen and is the source of truth. Every status
column here is a `CHECK` constraint (deliberately not a Postgres `enum`, so
values can be changed by migration without an `ALTER TYPE` dance) whose value
list matches a types.ts union character-for-character:

| Column | types.ts union |
| --- | --- |
| `tokens.status` | `TokenStatus` |
| `counters.status` | `CounterStatus` |
| `counter_assignments.assignment_type` | `AssignmentType` |
| `recommendations.status`, `interventions.status` | `InterventionStatus` |
| `recommendations.action_type`, `interventions.action_type` | `ActionType` |
| `recommendations.confidence` | `Recommendation["confidence"]` |
| `staff.status` | `StaffAvailability` |

Four `CHECK`ed columns have no counterpart union in types.ts and were specified
here; each is commented inline at its definition:

- `counter_assignments.status` — `active` \| `ended`.
- `journeys.status` — `active` \| `completed` \| `cancelled`.
- `journey_steps.status` — `pending` \| `active` \| `completed` \| `skipped`.
- `service_flow_edges.source` — `seed` \| `observed` \| `journey`.

If any of these needs to change, add the union to types.ts first.

### Deviations from `FLOWPILOT_SPEC_SHEET_V2.md` section 5

1. **`reassign_counter` is deleted from the domain.** `action_type` on both
   `recommendations` and `interventions` is `CHECK`-constrained to
   `('activate_counter','reassign_staff')`. The movable unit is a
   `(staff, counter, service)` assignment; a counter is a physical desk and does
   not move. This is why `counters` has no `service_id` column.
2. **`human_minutes_saved` → `estimated_minutes_returned`** on both
   `recommendations` and `interventions`. It is a counterfactual simulator
   estimate, never a measurement, and `COMMENT ON COLUMN` says so on both
   columns. UI label: *"Estimated time returned"*.
3. `recommendations.confidence` was added — it exists on the frozen
   `Recommendation` interface but was missing from the spec-sheet table.
4. `predicted_wait` / `predicted_person_minutes` keep their spec-sheet names but
   map to `optimizedWaitMinutes` / `optimizedPersonMinutes` in types.ts. The
   mapping is recorded in `COMMENT ON COLUMN` so nobody has to guess.
5. `queue_events.event_type` and `intervention_events.event_type` are **not**
   `CHECK`-constrained. Neither is a status column, and the timeline needs to be
   able to grow without a migration. The canonical value lists from spec sheet
   sections 12 and 13 are recorded as comments at each table.
6. Seed layout: only three staff are on shift, so only three desks are active at
   baseline — one per service — and **Counter 2 (a documents desk) holds the
   examination binding**, because Priya is the only on-shift staff member with
   the examination skill. The SRS section 15 desk-to-service list is preserved as
   the desk *layout*; the live service comes from `counter_assignments`. This is
   forced: `calculateWaitMinutes()` returns `Infinity` when
   `activeCounters <= 0`, so no service may start at zero capacity, and the
   signature acceptance test has a visitor join Examination. Counter 4 also
   starts inactive for the same staffing reason.
