# FlowPilot — Technical & Product Spec Sheet

**Version:** 2.0 — Multi-Agent / Multi-Surface  
**Purpose:** Canonical implementation contract for all coding, design and integration agents.  
**Rule:** Shared contracts in this document override agent-local assumptions.

---

# 1. Product Architecture

FlowPilot has four named layers:

```text
FlowPilot Visitor
Android + PWA
        │
        │
FlowPilot Desk ───────────┐
Staff console             │
        │                 │
        ├──── Supabase Realtime + PostgreSQL
        │                 │
FlowPilot Control ────────┘
Admin control room
        │
        ▼
FlowPilot Intelligence
Queue + Simulation + Journey + Optimization
```

Critical rule:

> There is one backend, one set of domain contracts, and one canonical intelligence implementation.

Do not implement separate queue logic for Android, web and admin.

---

# 2. Stack Contract

## Web
- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui, heavily customized
- Motion for React
- Recharts

## Mobile
- React Native
- Expo
- TypeScript
- Expo Router preferred
- Supabase JS client
- native-feeling motion/haptics
- Expo Notifications only if stable

## Data
- Supabase PostgreSQL
- Supabase Realtime
- Supabase Auth only if needed

## AI
- Gemini API
- server-side only for privileged calls

## Delivery
- Vercel for web
- Expo development build / Expo Go or Android build depending environment
- GitHub repository

---

# 3. Recommended Monorepo

```text
flowpilot/
├── apps/
│   ├── web/
│   │   ├── src/app/
│   │   │   ├── visitor/
│   │   │   ├── desk/
│   │   │   ├── control/
│   │   │   ├── control/simulation/
│   │   │   └── api/
│   │   └── ...
│   │
│   └── mobile/
│       ├── app/
│       │   ├── index.tsx
│       │   ├── service/[id].tsx
│       │   ├── token/[id].tsx
│       │   ├── journey/[id].tsx
│       │   └── activity.tsx
│       └── ...
│
├── packages/
│   ├── core/
│   │   ├── src/queue/
│   │   ├── src/simulation/
│   │   ├── src/journey/
│   │   ├── src/flow/
│   │   └── src/metrics/
│   │
│   ├── types/
│   ├── validation/
│   └── supabase/
│
└── supabase/
    ├── migrations/
    └── seed.sql
```

If monorepo setup costs too much time:
- keep separate apps
- still share copied/frozen contract files
- do not diverge names or enums

---

# 4. Canonical Types

```ts
export type TokenStatus =
  | "waiting"
  | "called"
  | "serving"
  | "completed"
  | "cancelled"
  | "skipped";

export type CounterStatus =
  | "active"
  | "inactive";

export type QueueHealth =
  | "healthy"
  | "busy"
  | "critical";

export type InterventionStatus =
  | "recommended"
  | "approved"
  | "pending_staff"
  | "accepted"
  | "applied"
  | "rejected"
  | "completed";

export type AssignmentType =
  | "primary"
  | "temporary";
```

Shared interface:

```ts
export interface QueueSnapshot {
  serviceId: string;
  queueLength: number;
  activeCounters: number;
  averageServiceMinutes: number;
  predictedWaitMinutes: number;
  etaLowerMinutes: number;
  etaUpperMinutes: number;
  health: QueueHealth;
  arrivalRatePerMinute?: number;
}
```

Recommendation:

```ts
export interface Recommendation {
  id?: string;
  serviceId: string;
  actionType:
    | "activate_counter"
    | "reassign_counter"
    | "reassign_staff";
  actionPayload: Record<string, unknown>;
  baselineWaitMinutes: number;
  optimizedWaitMinutes: number;
  baselinePersonMinutes: number;
  optimizedPersonMinutes: number;
  humanMinutesSaved: number;
  confidence?: "low" | "medium" | "high";
}
```

---

# 5. Database Contract

Core tables:

## organizations
```text
id uuid pk
name text
industry_type text
created_at timestamptz
```

## locations
```text
id uuid pk
organization_id uuid fk
name text
max_capacity integer
created_at timestamptz
```

## services
```text
id uuid pk
location_id uuid fk
name text
slug text unique
description text
default_service_minutes numeric
healthy_wait_threshold numeric
critical_wait_threshold numeric
created_at timestamptz
```

## staff
```text
id uuid pk
organization_id uuid fk
name text
status text
created_at timestamptz
```

## staff_skills
```text
staff_id uuid fk
service_id uuid fk
proficiency numeric nullable
primary key(staff_id, service_id)
```

## counters
```text
id uuid pk
location_id uuid fk
name text
status text
created_at timestamptz
```

## counter_assignments
```text
id uuid pk
counter_id uuid fk
staff_id uuid nullable
service_id uuid fk
assignment_type text
status text
started_at timestamptz
ends_at timestamptz nullable
created_at timestamptz
```

## tokens
```text
id uuid pk
service_id uuid fk
journey_id uuid nullable
token_number text
status text
priority integer default 0
joined_at timestamptz
called_at timestamptz nullable
service_started_at timestamptz nullable
completed_at timestamptz nullable
cancelled_at timestamptz nullable
is_simulated boolean default false
```

## queue_events
```text
id uuid pk
service_id uuid fk
token_id uuid nullable
event_type text
queue_length integer nullable
active_counters integer nullable
predicted_wait numeric nullable
metadata jsonb
created_at timestamptz
```

## recommendations
```text
id uuid pk
service_id uuid fk
action_type text
action_payload jsonb
baseline_wait numeric
predicted_wait numeric
baseline_person_minutes numeric
predicted_person_minutes numeric
human_minutes_saved numeric
status text
created_at timestamptz
```

## interventions
```text
id uuid pk
recommendation_id uuid nullable
action_type text
action_payload jsonb
status text
approved_at timestamptz nullable
accepted_at timestamptz nullable
applied_at timestamptz nullable
human_minutes_saved numeric nullable
created_at timestamptz
```

## intervention_events
```text
id uuid pk
intervention_id uuid fk
event_type text
message text
metadata jsonb
created_at timestamptz
```

## journeys
```text
id uuid pk
journey_number text unique
status text
created_at timestamptz
completed_at timestamptz nullable
```

## journey_steps
```text
id uuid pk
journey_id uuid fk
service_id uuid fk
sequence integer
status text
predicted_wait numeric
started_at timestamptz nullable
completed_at timestamptz nullable
```

## service_flow_edges
```text
id uuid pk
from_service_id uuid fk
to_service_id uuid fk
expected_share numeric
source text
```

Optional:
## crowd_samples

---

# 6. Queue Engine

Canonical functions:

```ts
getQueueSnapshot(serviceId)
calculateAverageServiceMinutes(serviceId)
calculateEta(input)
calculateEtaRange(input)
calculateQueueHealth(input)
```

Do not duplicate these functions inside React components.

---

# 7. ETA Contract

## Recent service duration

Use:
```text
completed_at - service_started_at
```

Preferred sample:
- recent 10–30 completed tokens

Cold start:
- service.default_service_minutes

Blend:

```ts
const avg =
  recentCount === 0
    ? defaultMinutes
    : recentAverage * 0.75 + defaultMinutes * 0.25;
```

ETA:

```ts
if (activeCounters <= 0) return Infinity;

const eta =
  (customersAhead * avgServiceMinutes) /
  activeCounters;
```

Range:
- ±15% for MVP or historical variance if available

---

# 8. Flow Graph Contract

Data model:

```ts
interface FlowEdge {
  fromServiceId: string;
  toServiceId: string;
  expectedShare: number; // 0..1
}
```

Derived downstream demand:

```text
expected_downstream_arrivals =
  upstream_active_journeys
  × probability/share
```

Sources:
1. active Journey next steps
2. seeded flow edges
3. historical route patterns later

Use active Journey data when available because it is more concrete.

Control visualization should support:

```text
NOW
+15 MIN
```

Do not present +15 as certainty.

Label:
- Predicted
- Expected
- Forecast

---

# 9. Simulation Engine Contract

Inputs:

```ts
interface FacilityServiceState {
  serviceId: string;
  queueLength: number;
  activeCounters: number;
  averageServiceMinutes: number;
  arrivalRatePerMinute: number;
  downstreamArrivalRatePerMinute?: number;
}

interface SimulationInput {
  services: FacilityServiceState[];
  horizonMinutes: number;
}
```

Per-minute deterministic model:

```text
arrivals =
  direct arrival rate
  + downstream arrival rate

capacity =
  activeCounters / avgServiceMinutes

queue[t+1] =
  max(0, queue[t] + arrivals - capacity)
```

Output per service:
- queue length
- wait
- utilization proxy
- person-minutes

Facility output:
- total person-minutes waiting

Keep runtime fast.

---

# 10. Recommendation Engine

Candidate generation order:

## P1
- activate inactive counter already eligible for service

## P2
- reassign counter/staff from low-pressure compatible service
- temporary duration recommendation

Validation:
- skill exists
- source service remains operational
- no negative resources
- recommendation yields positive savings

Scoring:

```ts
score = baselinePersonMinutes - candidatePersonMinutes
```

Pick maximum positive score.

Do not let Gemini choose.

---

# 11. Staff Reassignment Contract

Example:

```ts
interface StaffSkill {
  staffId: string;
  serviceId: string;
}

interface TemporaryAssignment {
  staffId: string;
  counterId: string;
  fromServiceId: string;
  toServiceId: string;
  durationMinutes: number;
}
```

Lifecycle:

```text
recommended
→ approved
→ pending_staff
→ accepted
→ applied
→ completed
```

If Desk acceptance is omitted for MVP:
- use approved → applied

But UI copy must match actual behavior.

---

# 12. Intervention Timeline Contract

Every meaningful event appends an `intervention_events` record.

Canonical event types:

```text
forecast_triggered
recommendation_created
approved
staff_notified
staff_accepted
applied
eta_recalculated
completed
rejected
```

Control renders chronological timeline.

Do not fabricate timestamps.

---

# 13. Operational Replay Contract

Replay input:
- queue_events
- intervention_events

Replay output:
- read-only time-indexed state

Controls:
- Play
- Pause
- Reset
- Speed 1× / 2× / 4×

Hackathon shortcut:
- support one seeded rush replay

Important:
- Replay should not mutate live queue state.

---

# 14. Human Time Saved

Use person-minutes.

```ts
humanMinutesSaved =
  Math.max(
    0,
    baseline.totalPersonMinutesWaiting -
    optimized.totalPersonMinutesWaiting
  );
```

Render:
- `< 60`: `42 min`
- `>= 60`: `4h 18m`

UI label:
> Estimated time returned

Cumulative session number may sum applied interventions.

---

# 15. Journey Engine

Functions:

```ts
createJourney()
generateValidPermutations()
estimateJourney()
optimizeJourney()
advanceJourney()
```

Input:
```ts
serviceIds: string[]
```

For <=4 services:
- brute-force permutations acceptable

Estimate:
- predicted wait at expected arrival
- optional service time
- sum total

Output:
```ts
interface JourneyPlan {
  orderedServiceIds: string[];
  estimatedTotalMinutes: number;
  estimatedMinutesSaved: number;
}
```

---

# 16. Realtime Contract

Critical subscriptions:

## Visitor
- own token update
- related service/counter capacity update if needed
- own Journey update

## Desk
- tokens for assigned service
- counter assignment changes
- pending interventions/assignments

## Control
- tokens
- active assignments
- interventions
- relevant queue events

Avoid subscribing every client to every table.

---

# 17. FlowPilot Visitor — Android

## Navigation

Recommended:

```text
Home
→ Service
→ Token
→ Journey
→ Activity
```

### Home
- FlowPilot brand
- “What do you need to get done?”
- service finder
- manual fallback

### Service
- current wait
- queue size
- health
- Join Queue

### Token
Above fold:
- service
- token number
- ETA
- people ahead
- Freedom Radius
- return window

### Journey
- ordered steps
- current step
- next step
- remaining predicted time

### Activity
Optional:
- wait updated
- turn approaching
- Journey updated

---

# 18. Android Interaction Contract

When ETA materially improves after intervention:

1. animate old ETA out
2. animate new ETA in
3. show:
   > Your wait just got shorter
4. optional success haptic

When turn is soon:
- stronger haptic if permissions/runtime allow
- optional notification

Do not let notifications block core experience.

---

# 19. FlowPilot Visitor — PWA

Must offer same essential data:
- Join Queue
- Token
- ETA
- position
- Freedom Radius
- Journey

Purpose:
- no-install fallback
- QR entry

Do not force account/app install.

---

# 20. FlowPilot Desk Page

Recommended layout:

```text
COUNTER 3 · EXAMINATION

NOW SERVING
E-041
02:14 elapsed

[ Complete Service ]

NEXT
E-042

[ Call Next ]

────────────

TEMPORARY ASSIGNMENT
Documents → Examination
20 min

[ Accept ]
```

Large tap targets.

Minimal analytics.

---

# 21. FlowPilot Control Page

Desktop-first hierarchy:

```text
┌───────────────────────────────────────────────┐
│ Operations Header                    LIVE ●   │
├───────────────────────────────────────────────┤
│ Visitors | Avg Wait | Human Time Returned     │
├───────────────────────────┬───────────────────┤
│                           │ Critical Service  │
│ FACILITY FLOW GRAPH       │                   │
│ / DIGITAL TWIN            │ Recommendation    │
│                           │                   │
│                           │ Apply             │
├───────────────────────────┼───────────────────┤
│ Intervention Timeline     │ Queue Detail      │
└───────────────────────────┴───────────────────┘
```

Digital Twin dominates.

---

# 22. UI Design System

Admin/Desk:

```text
Background       #090B0D
Surface          #111417
Raised           #171B1F
Flow Mint        #66F2B3
Prediction Cyan  #65C7FF
Warning Amber    #FFB547
Critical Coral   #FF626B
Text             #F5F7F8
Muted            #858D95
```

Visitor:
- lighter/softer companion theme
- same mint identity
- generous whitespace

Typography:
- Geist or Inter
- large numeric hierarchy

---

# 23. Motion Contract

Use motion for:
- count changes
- ETA changes
- health transitions
- recommendation appearance
- graph transitions
- reassignment state
- time saved count

Do not:
- continuously float cards
- animate meaningless background blobs
- overuse spring/bounce

---

# 24. Simulate Rush

Default:

```text
Documents +8
Fees +4
Examination +12
```

Expected UI sequence:
- queue increases
- forecast changes
- flow graph becomes critical
- recommendation appears

Provide:
- Seed Demo
- Reset Demo
- Simulate Rush

if time permits.

---

# 25. Gemini Contract

## Service routing only

Input:
- text
- allowed services

Output:

```json
{
  "service_id": "exam",
  "intent": "Duplicate Marksheet",
  "confidence": 0.92
}
```

Fallback:
- manual selection

## Recommendation explanation

Input:
- numbers generated by deterministic engine

Output:
- max 2 sentences
- no invented numbers
- no invented actions

---

# 26. Agent Ownership Contract

## Agent A — Backend
Owns:
- schema
- migrations
- seed
- Supabase access
- realtime configuration

## Agent B — Intelligence
Owns:
- queue core
- ETA
- simulation
- recommendation
- journey
- flow
- metrics

## Agent C — Control
Owns:
- Digital Twin
- dashboard
- timeline
- scenario lab
- replay UI

## Agent D — Desk
Owns:
- operator lifecycle
- reassignment UX

## Agent E — Visitor PWA
Owns:
- zero-install visitor experience

## Agent F — Android
Owns:
- Expo Visitor
- realtime token
- Journey
- haptics/notifications if stable

## Agent G — AI + Integration
Owns:
- Gemini
- schemas
- cross-surface integration tests
- contract compliance

No agent may change database status strings without coordinated approval.

---

# 27. Integration Gates

## Gate A — Shared Contracts
- [ ] enums frozen
- [ ] schema frozen
- [ ] environment variables frozen
- [ ] core function signatures frozen

## Gate B — Core Queue
- [ ] join
- [ ] persist
- [ ] Desk lifecycle
- [ ] ETA
- [ ] Realtime

## Gate C — Cross-Device
- [ ] Android token
- [ ] Control sees join
- [ ] Desk complete updates Android
- [ ] intervention changes Android ETA

## Gate D — Winning Intelligence
- [ ] Simulate Rush
- [ ] forecast
- [ ] Digital Twin
- [ ] recommendation
- [ ] apply
- [ ] Human Time Saved

## Gate E — Advanced
- [ ] Journey
- [ ] flow/cascade
- [ ] skill-aware reassignment
- [ ] timeline
- [ ] replay
- [ ] Gemini router

Do not add new features if earlier gate is unstable.

---

# 28. Demo Contract

The golden path:

```text
Android Visitor joins
→ Control updates
→ Rush
→ Forecast
→ Recommendation
→ Admin approves
→ Desk receives/accepts
→ Capacity changes
→ Android ETA drops
→ Time Returned increases
→ Timeline explains what happened
```

Any code change that breaks this path is a blocker.

---

# 29. Fail-Safe Contract

If:
- Gemini fails → manual service selection
- notifications fail → in-app update
- Realtime fails → refetch fallback
- camera fails → ignore camera
- Journey fails → normal single queue remains
- staff reassignment fails → simple activate-counter recommendation remains

Core demo must survive.

---

# 30. Product Copy

Visitor:
- “You’re in line.”
- “You’re free to leave.”
- “Stay nearby.”
- “Your wait just got shorter.”
- “Your turn is approaching.”

Control:
- “Congestion predicted in 12 min.”
- “Reassign Counter 2.”
- “31 min → 15 min.”
- “Estimated time returned: 3h 51m.”

Desk:
- “New temporary assignment.”
- “Call Next.”
- “Start Service.”
- “Complete Service.”

Avoid generic AI marketing language.
