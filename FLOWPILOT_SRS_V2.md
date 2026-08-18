# FlowPilot — Software Requirements Specification (SRS)

**Project:** FlowPilot  
**Version:** 2.0 — Multi-Agent / Multi-Surface Architecture  
**Hackathon:** Vibe Code Hackathon by IEEE, MHSSCE  
**Document Type:** Software Requirements Specification  
**Primary Goal:** Build a memorable, polished, working, database-backed queue orchestration platform that demonstrates a complete closed-loop response to physical waiting and congestion.

---

# 1. Product Definition

FlowPilot is an AI-assisted **operating system for physical waiting**.

It is not merely a digital-token application. It connects visitors, frontline staff and operations managers through one shared real-time intelligence layer.

The core product loop is:

```text
Observe
→ Predict
→ Simulate
→ Recommend
→ Human Approves
→ Staff Executes
→ Visitor Experience Improves
→ Impact Is Measured
```

FlowPilot must demonstrate that it can do more than report queue conditions. It must help change the outcome.

---

# 2. Product Surfaces

FlowPilot is intentionally divided into multiple coordinated experiences.

## 2.1 FlowPilot Visitor

Primary platform:
- Android application built with React Native + Expo

Fallback:
- Mobile-first PWA/web client

Purpose:
- Let visitors discover the correct service.
- Join queues.
- Receive digital tokens.
- Track ETA and queue position.
- Leave the waiting area safely.
- Receive realtime updates when interventions improve their wait.
- Follow an optimized multi-service Journey.

## 2.2 FlowPilot Desk

Platform:
- Responsive web/tablet staff console

Purpose:
- Frontline counter operation.
- Call/start/complete tokens.
- Open/close a counter.
- Receive temporary reassignment instructions.
- Confirm or accept an operational reassignment.

## 2.3 FlowPilot Control

Platform:
- Desktop-first web control room

Purpose:
- Facility-wide operational awareness.
- Digital Twin / Flow Graph.
- Congestion forecast.
- Simulation and recommendations.
- Staff/counter reassignment.
- Human Time Saved.
- Intervention Timeline.
- Replay / demo recovery.

## 2.4 FlowPilot Intelligence

Shared logic layer.

Responsibilities:
- Queue metrics.
- Adaptive ETA.
- Queue health.
- Future queue simulation.
- Counter/staff intervention scoring.
- Journey optimization.
- Flow Graph / downstream demand modeling.
- Human Time Saved.
- Optional Gemini-based language understanding and explanation.

Critical logic must remain deterministic and testable.

---

# 3. Hackathon Problem Statement

Build an AI-powered system to manage queues and crowds in places such as hospitals, colleges, banks, offices and service centers. The system should help users know their expected waiting time and assist organizations in monitoring and managing queues more efficiently. Features such as digital tokens, crowd monitoring notifications, appointment management and waiting time prediction may be incorporated.

---

# 4. Competitive Strategy

Because this is a vibe-coding hackathon, assume many competing teams will produce:
- React dashboards
- Firebase/Supabase CRUD
- digital tokens
- basic ETA
- generic AI chatbot
- appointment pages
- stock shadcn UI

FlowPilot should win through **cohesion, realtime interaction and a closed operational loop**.

The intended judge reaction is:

1. “This looks like a real product.”
2. “It actually works across devices.”
3. “It doesn’t just track the queue — it changes the outcome.”

---

# 5. Core Differentiators

## 5.1 Closed-Loop Queue Orchestration

Example:

1. Examination queue is predicted to become critical.
2. FlowPilot simulates available counter/staff actions.
3. It recommends moving an eligible staff member.
4. Admin approves.
5. FlowPilot Desk receives the reassignment.
6. Staff accepts.
7. Counter capacity changes.
8. Visitor Android app updates.
9. ETA decreases.
10. Human Time Saved increases.

This cross-surface sequence is a headline capability.

## 5.2 Facility Flow Graph

The facility is modeled as a graph of service stages.

Example:

```text
Document Verification
       │
       ├────────────→ Examination
       │
       └────────────→ Fees

Examination ────────→ Fees
```

Active Journeys and historical/seeded route proportions can be used to estimate downstream arrivals.

## 5.3 Journey Optimization

A visitor needing multiple services receives one Journey rather than multiple disconnected queue experiences.

FlowPilot can reorder independent service steps to minimize predicted total visit time.

## 5.4 Prescriptive Operations

FlowPilot must produce actionable recommendations, not only warnings.

## 5.5 Human Time Saved

Impact must be expressed as person-time returned, not merely queue statistics.

---

# 6. Scope

## 6.1 P0 — Submission Survival

The project is not considered functional without:

- Connected Supabase/PostgreSQL database
- Seeded organization/location/services
- Join queue
- Digital token
- Queue persistence
- FlowPilot Desk token lifecycle
- FlowPilot Control live queue state
- Realtime synchronization or reliable live fallback
- Adaptive ETA
- Basic health states
- Android Visitor app or mobile-first Visitor PWA working
- GitHub repository

## 6.2 P1 — Winning Core

- FlowPilot Visitor Android experience
- Realtime cross-device token/ETA updates
- Freedom Radius
- Digital Twin / Facility Flow Graph
- Simulate Rush
- Congestion forecast
- Recommendation engine
- Apply Intervention
- FlowPilot Desk reassignment receipt/acceptance
- Human Time Saved
- Intervention Timeline
- High-end Admin UI
- Polished mobile Visitor UI

## 6.3 P2 — Strong Differentiation

- Journey Token
- Journey Optimizer
- Cascade prediction / downstream arrivals
- Skill-aware staff reassignment
- Scenario Lab
- Gemini natural-language service router
- Operational Replay
- PWA fallback
- Expo/local notifications if stable

## 6.4 P3 — Luxury / Only If Stable

- Webcam people count
- Multilingual Visitor UI
- AI explanation/copilot
- Ghost queue / “still coming?” state
- Advanced crowd visualization
- additional motion polish

## 6.5 Explicitly Out of Scope

Unless directly requested after P0/P1 completion:

- custom trained ML models
- medical diagnosis/triage
- facial recognition
- blockchain
- complex appointment scheduling
- native Kotlin/Swift duplicate apps
- multi-branch maps
- voice assistant
- autonomous staff control without human approval
- employee productivity surveillance
- complex workforce rostering
- external calendar/event prediction
- full 3D digital twin

---

# 7. User Roles

## 7.1 Visitor

May:
- describe/select service
- join queue
- receive token
- view ETA
- view queue position
- view Freedom Radius guidance
- cancel queue
- follow Journey
- receive realtime intervention updates

## 7.2 Desk Operator

May:
- identify counter
- view next waiting tokens
- call next
- start service
- complete service
- toggle counter status
- receive reassignment
- accept/acknowledge reassignment

## 7.3 Operations Manager

May:
- view entire facility
- view current/future state
- simulate demand/resource changes
- view FlowPilot recommendation
- apply recommendation
- view intervention timeline
- trigger demo rush
- replay an operational sequence

---

# 8. Functional Requirements

## FR-001 — Service Catalog

The system shall load services from the connected database.

Demo seed:
1. Document Verification
2. Fees
3. Examination Cell

Each service must include:
- ID
- name
- description
- default service duration
- health thresholds
- current active counters

---

## FR-002 — Natural-Language Service Router

**Priority:** P2

Visitor can enter:

> “I lost my Semester 5 marksheet.”

Gemini receives:
- user text
- allowed services
- service descriptions

Gemini returns structured output only.

Example:

```json
{
  "service_id": "exam",
  "intent": "Duplicate Marksheet",
  "confidence": 0.92
}
```

Rules:
- Never invent a service.
- Manual picker must remain available.
- LLM failure must not block queue entry.

---

## FR-003 — Join Queue

Visitor shall:
- choose or be routed to a service
- join queue
- receive unique token
- persist token in PostgreSQL
- receive position and ETA

Token shall store:
- service_id
- token_number
- status
- joined_at
- priority
- is_simulated

---

## FR-004 — Token Lifecycle

Canonical lifecycle:

```text
waiting
→ called
→ serving
→ completed
```

Terminal alternatives:
- cancelled
- skipped

All clients must use exactly these statuses.

---

## FR-005 — FlowPilot Desk

Desk shall provide:

- Counter identity
- Assigned service
- Current token
- Next waiting users
- Call Next
- Start Service
- Complete Service
- Counter Active/Inactive

When a reassignment is issued:

Example:

> New temporary assignment  
> Documents → Examination  
> Duration: 20 min

Desk must support:
- Accept
- Optional Decline/Unable

On acceptance:
- counter/service assignment updates
- Control updates
- ETA engine recalculates
- affected Visitor clients update

---

## FR-006 — Realtime Cross-Device Synchronization

This is a **critical requirement**.

At minimum:

```text
Visitor joins
→ Control queue count updates

Desk completes token
→ Visitor position updates

Control applies intervention
→ Desk receives reassignment

Desk accepts reassignment
→ Control capacity updates
→ Visitor ETA updates
```

Target:
- visible within a few seconds

Supabase Realtime should be used where practical.

Fallback:
- explicit refetch/polling must preserve demo if Realtime fails.

---

## FR-007 — Adaptive ETA

Must be deterministic.

Minimum inputs:
- customers ahead
- active counters
- recent completed service duration
- service default duration for cold start

Suggested MVP formula:

```text
estimated_service_minutes =
  weighted_recent_average_or_default

effective_capacity_per_minute =
  active_counters / estimated_service_minutes

expected_wait =
  customers_ahead / effective_capacity_per_minute
```

If zero counters:
- show paused/unavailable
- never divide by zero

---

## FR-008 — ETA Range & Confidence

Display range:

> 14–18 min

Confidence:
- High
- Medium
- Low

Suggested heuristic:
- High: >=15 recent completions + stable duration
- Medium: 5–14
- Low: <5

Do not show fake precision.

---

## FR-009 — Freedom Radius

Visitor UI must convert ETA to practical guidance.

States:

### FREE TO LEAVE
Return window shown.

### STAY NEARBY
Turn approaching.

### YOUR TURN SOON
Visitor should return immediately.

Example:

> You’re free to leave.  
> Return around 11:42–11:47.

---

## FR-010 — Live Intervention Update

**Priority:** P1 headline feature.

When an operational intervention changes queue capacity and the user’s ETA materially improves, Visitor should display:

> Your wait just got shorter  
> 18 min → 9 min  
> An additional counter is now serving this queue.

Android:
- animate number transition
- optional haptic
- optional local/push notification if stable

PWA:
- in-app event/toast

This is one of the core demo moments.

---

## FR-011 — Facility Control Dashboard

Control shall show:
- visitors today
- average wait
- Human Time Saved
- active queues
- active counters
- queue lengths
- current ETA
- trend
- health state
- prediction
- recommendation

Avoid generic card-grid dominance.

---

## FR-012 — Facility Flow Graph / Digital Twin

Control must include a large visual service-flow model.

Each node displays:
- service
- queue length
- ETA
- health
- trend

Optional edges display:
- current or expected user movement
- route percentages
- predicted downstream arrivals

View modes:
- NOW
- +15 MIN

Current and predicted states must be visually distinguishable.

---

## FR-013 — Congestion Forecast

For each service, estimate future queue state over a small horizon.

Inputs can include:
- current queue
- recent arrival rate
- active counters
- service duration
- optional Journey downstream arrivals

Output:
- predicted queue length
- predicted wait
- time to critical threshold if applicable

Example:

> Examination likely to exceed target wait in 12 min.

---

## FR-014 — Simulate Rush

Admin/demo-only:

> ⚡ Simulate Rush

Recommended inserts:
- +8 Documents
- +4 Fees
- +12 Examination

Simulated entries must either:
1. enter the same database queue engine with `is_simulated=true`, or
2. enter isolated scenario state.

Preferred:
- same queue engine for stronger Realtime demo

Must include Reset Demo if feasible.

---

## FR-015 — Digital Twin Simulation

Must evaluate what-if states.

P1 scenarios:
- activate inactive counter
- deactivate counter
- higher arrival rate
- slower service rate

P2:
- move eligible staff/counter between services

Outputs:
- predicted wait
- predicted queue
- utilization proxy
- total person-minutes waiting

---

## FR-016 — Recommendation Engine

Deterministic.

For each valid intervention:
1. clone current state
2. apply candidate
3. simulate outcome
4. calculate total person-minutes waiting
5. compare to baseline
6. select best positive-savings action

Example:

> Reassign Counter 2 from Documents to Examination for 20 min.

Before:
- Documents 5m
- Examination 31m

After:
- Documents 8m
- Examination 15m

Estimated time returned:
- 3h 51m

Gemini may explain but must not decide.

---

## FR-017 — Skill-Aware Reassignment

**Priority:** P2 high-value.

Staff/counters may have capabilities.

Example:

```text
Sara:
- Documents ✓
- Examination ✓
- Fees ✗
```

Only valid skills may be recommended.

The system must not magically create capacity.

---

## FR-018 — Apply Intervention

Control shall require human approval.

Possible sequence:
- manager clicks Apply Intervention
- reassignment record created
- Desk receives assignment
- staff accepts
- live counter assignment changes
- queue engine recalculates

For simple “activate inactive counter” demo:
- update may occur immediately

For staff movement:
- acceptance should be represented if implemented

---

## FR-019 — Human Time Saved

Primary impact unit:
- person-minutes

Example:

```text
baseline_total_person_minutes = 520
optimized_total_person_minutes = 262

saved = 258
```

Display:
> 4h 18m estimated time returned

Distinguish:
- predicted/simulated savings
- realized/session savings

---

## FR-020 — Intervention Timeline

**Priority:** P1/P2.

Control should record:

```text
10:42 Congestion predicted
10:43 Recommendation generated
10:44 Intervention approved
10:44 Desk accepted reassignment
10:45 ETA recalculated
10:45 Estimated 258 person-minutes returned
```

This improves:
- explainability
- demo storytelling
- replay
- operational auditability

---

## FR-021 — Operational Replay

**Priority:** P2.

Replay stored/simulated queue events over a compressed timeline.

Use cases:
- demo backup
- show system response without manually creating traffic
- explain causal chain

Replay shall clearly indicate it is replay/simulation mode.

It must not mutate live production/demo state unless explicitly configured.

---

## FR-022 — Journey Token

A multi-service visitor receives one Journey ID.

Example:

```text
Journey J-104

✓ Document Verification
→ Examination
○ Fees
```

---

## FR-023 — Journey Optimizer

For small sets of independent services:
- generate valid permutations
- estimate future wait at arrival to each step
- sum wait
- choose lowest predicted total

Example:

Standard:
> Documents → Fees → Exam = 46 min

FlowPilot:
> Exam → Documents → Fees = 24 min

Estimated saved:
> 22 min

No complex indoor navigation is required.

---

## FR-024 — Journey Auto-Advance

When current step completes:
- Journey marks step complete
- next service becomes active
- Visitor receives next-step guidance
- predicted ETA for next step appears

Optional:
- pre-position next queue entry depending on policy

For MVP, guidance-only is sufficient if automatic queue insertion becomes complex.

---

## FR-025 — Cascade Prediction

If Journey data exists, estimate downstream service demand.

Example:
- 14 visitors at Documents are expected to visit Examination next
- Examination currently looks healthy
- system predicts future critical state

The Flow Graph should make this intuitive.

---

## FR-026 — Scenario Lab

Admin can alter:
- arrival rate
- active counters
- average service duration

Show:
- before/after wait
- queue
- person-time
- health

Preset scenarios:
- Normal
- Rush
- Counter Failure
- 2× Demand

---

## FR-027 — Android Visitor App

React Native + Expo.

P0 screens:
1. Home / service selection
2. Queue join
3. Live Token
4. Freedom Radius / realtime state

P1:
5. Journey
6. realtime intervention update
7. polished transitions

P2:
- history/activity
- Expo notifications
- natural-language router

Android app must use the same backend and canonical types/contracts as web.

---

## FR-028 — PWA Fallback

Visitor web experience should remain usable without installing an app.

Value proposition:
- one-time visitors: QR → web
- frequent users: Android app

Do not force app installation to join a queue.

---

# 9. Non-Functional Requirements

## NFR-001 — Demo Reliability

Core demo must not depend on:
- Gemini response
- camera detection
- push notification delivery
- external maps

Queue, ETA, simulation, recommendation and cross-device updates must remain available.

## NFR-002 — Multi-Agent Contract Stability

All agents must use:
- shared domain types
- shared status names
- shared database schema
- shared simulation contracts

No agent may independently redefine core entities.

## NFR-003 — Security

- environment variables for secrets
- no service-role key in clients
- no committed secrets
- RLS where practical
- minimal permissions

## NFR-004 — Performance

- responsive first render
- simulations interactive
- realtime changes visible within seconds
- mobile token screen smooth

## NFR-005 — Accessibility

- readable contrast
- meaningful labels
- focus states
- status not conveyed by color alone
- mobile thumb-friendly actions

## NFR-006 — Responsive Design

Visitor:
- Android/mobile-first

Desk:
- tablet/laptop responsive

Control:
- desktop-first

---

# 10. Architecture

Recommended monorepo:

```text
flowpilot/
├── apps/
│   ├── web/
│   │   ├── visitor/
│   │   ├── desk/
│   │   └── control/
│   │
│   └── mobile/
│       └── Expo React Native Visitor
│
├── packages/
│   ├── core/
│   │   ├── queue/
│   │   ├── simulation/
│   │   ├── journey/
│   │   └── metrics/
│   │
│   ├── types/
│   └── supabase/
│
└── supabase/
    ├── migrations/
    └── seed.sql
```

Shared:
- TypeScript types
- pure queue logic where runtime-compatible
- data contracts

Server-side-only secrets and LLM calls remain server-side.

---

# 11. Database Additions for V2

Retain prior core tables:
- organizations
- locations
- services
- counters
- tokens
- queue_events
- recommendations
- journeys
- journey_steps
- crowd_samples optional

Add:

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

Optional:

## service_flow_edges

```text
id uuid pk
from_service_id uuid fk
to_service_id uuid fk
expected_share numeric
source text
```

---

# 12. UI/UX Requirements

## 12.1 FlowPilot Visitor

Feel:
- calm
- premium
- minimal
- reassuring

Primary hierarchy:
1. Token
2. ETA
3. People ahead
4. Freedom state
5. Return guidance

Example:

```text
EXAMINATION

E-042

14–18
MINUTES

6 people ahead

FREE TO LEAVE

Return around
11:42–11:47
```

## 12.2 FlowPilot Desk

Feel:
- fast
- operational
- low distraction

Primary:
- current token
- next token
- Call / Start / Complete
- reassignment

## 12.3 FlowPilot Control

Feel:
- premium command center
- high information clarity
- not generic dashboard CRUD

Primary visual:
- Facility Flow Graph / Digital Twin

Secondary:
- critical service
- recommendation
- Human Time Saved
- timeline

---

# 13. Visual Design System

Admin / Desk dark theme:

- Background: `#090B0D`
- Surface: `#111417`
- Raised: `#171B1F`
- Flow Mint: `#66F2B3`
- Prediction Cyan: `#65C7FF`
- Warning Amber: `#FFB547`
- Critical Coral: `#FF626B`
- Text: `#F5F7F8`
- Muted: `#858D95`

Visitor:
- calmer/light or softer-neutral companion theme
- preserve Flow Mint identity

Avoid:
- default shadcn appearance
- generic purple SaaS gradient
- excessive glassmorphism
- decorative animation overload

---

# 14. Signature Motion

Required demo transitions:
1. Simulate Rush.
2. Queue counts rise.
3. Flow Graph shows pressure.
4. Health becomes critical.
5. Recommendation appears.
6. Apply intervention.
7. Desk receives/accepts.
8. Digital Twin recalculates.
9. Android ETA drops.
10. Human Time Saved counts upward.

Motion must communicate causality.

---

# 15. Seed Demo Model

Organization:
- MHSSCE

Location:
- Student Services

Services:
- Document Verification
- Fees
- Examination Cell

Suggested capabilities:
- Staff A: Documents + Examination
- Staff B: Fees
- Staff C: Documents + Fees
- Counter 1: Documents
- Counter 2: Documents
- Counter 3: Fees
- Counter 4: Fees
- Counter 5: Examination

Seed enough completed history for realistic ETA.

Simulate Rush should create obvious pressure at Examination.

---

# 16. Acceptance Test — Signature Multi-Device Demo

Before judging, this exact flow must pass:

1. Android Visitor opens FlowPilot.
2. Visitor joins Examination.
3. Token persists.
4. Control updates live.
5. Desk can see queue.
6. Visitor sees adaptive ETA + Freedom Radius.
7. Control triggers Simulate Rush.
8. Flow Graph becomes critical.
9. Congestion forecast appears.
10. Recommendation appears.
11. Admin applies intervention.
12. Desk receives reassignment or counter activation.
13. Staff accepts if required.
14. Capacity updates.
15. Visitor Android ETA drops live.
16. Visitor sees “Your wait just got shorter.”
17. Human Time Saved increases.
18. Intervention Timeline logs the sequence.

Optional:
19. Journey Optimizer demo.
20. Replay demo.
21. Gemini service routing.

If optional steps threaten reliability, skip them.

---

# 17. Multi-Agent Ownership

Recommended:

### Agent A — Database / Supabase
- schema
- migrations
- realtime
- seed
- persistence

### Agent B — Intelligence
- ETA
- simulation
- recommendations
- Human Time Saved
- cascade
- journey optimization

### Agent C — FlowPilot Control
- admin UX
- Digital Twin
- recommendation
- timeline
- Scenario Lab

### Agent D — FlowPilot Desk
- counter operations
- reassignment
- operator realtime

### Agent E — FlowPilot Visitor Web/PWA
- zero-install fallback
- token
- freedom state
- journey

### Agent F — FlowPilot Visitor Android
- Expo app
- live token
- realtime update
- haptics/notifications if stable

### Agent G — Gemini / Integration
- service routing
- explanation
- contract validation
- integration testing

All agents must follow shared schema and types.

---

# 18. Definition of Done

FlowPilot V2 is hackathon-ready when:

- one Supabase backend powers all surfaces
- Android Visitor can join and track a real queue
- Desk can progress tokens
- Control sees realtime operations
- Digital Twin responds to rush
- recommendation engine works
- human approves intervention
- affected mobile ETA visibly improves
- Human Time Saved is calculated
- UI is polished
- demo is repeatable
- GitHub repository is clean
- optional AI failures cannot break the core flow

---

# 19. Product Positioning

### One-line pitch

> **FlowPilot connects visitors, frontline staff and administrators through one real-time intelligence layer that predicts congestion, simulates interventions and coordinates the action that reduces waiting.**

### Simple analogy

> **Google Maps predicts traffic and suggests a better route. FlowPilot does that for queues — and gives operations teams the controls to change the traffic itself.**

### Core promise

> **Other queue systems tell you how long you will wait. FlowPilot determines how to make you wait less.**

### Product ecosystem

- **FlowPilot Visitor** — customer Android/PWA
- **FlowPilot Desk** — staff operations
- **FlowPilot Control** — management control room
- **FlowPilot Intelligence** — prediction, simulation and optimization
