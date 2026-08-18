# FlowPilot — Project Context & AI Agent Operating Brief

**Version:** 2.0 — Multi-Agent / Multi-Surface  
**Audience:** Every AI agent, coding assistant, designer, tester and integrator working on FlowPilot.

> Read this entire document before changing the project.

---

# 1. Why This Project Exists

We are building FlowPilot for the **Vibe Code Hackathon by IEEE at MHSSCE**.

Problem:
- queues
- crowds
- uncertain waiting
- poor operational visibility
- organizations reacting too late

The obvious hackathon solution is:
- take token
- show ETA
- admin dashboard
- chatbot

That is not enough.

FlowPilot must be memorable because it closes the operational loop.

---

# 2. The Revised Product Idea

FlowPilot is:

> **A closed-loop AI orchestration platform for physical waiting.**

It connects three human groups:

- visitors
- frontline staff
- operations managers

through one intelligence layer.

The product ecosystem:

### FlowPilot Visitor
Android + PWA

### FlowPilot Desk
Staff console

### FlowPilot Control
Admin command center

### FlowPilot Intelligence
Prediction + simulation + optimization

---

# 3. The Winning Thesis

Ordinary queue app:

> “You are number 17.”

Better queue app:

> “Your wait is 31 minutes.”

FlowPilot:

> “This queue will become critical. Moving an eligible counter for 20 minutes is predicted to reduce wait from 31 to 15 minutes. The staff member receives the reassignment, and affected visitors immediately see their new ETA.”

That is the core difference.

---

# 4. The Closed Loop

Protect this model:

```text
Visitor joins
      ↓
Live telemetry
      ↓
Congestion forecast
      ↓
Digital Twin simulation
      ↓
Best intervention selected
      ↓
Manager approves
      ↓
Desk receives action
      ↓
Staff executes
      ↓
Capacity changes
      ↓
Visitor ETA improves
      ↓
Human Time Saved measured
```

This loop matters more than feature count.

---

# 5. The Signature Demo

The demo should feel physical and immediate.

### Device 1 — Judge/Visitor Android phone

Shows:
> E-042  
> 17 min  
> Free to leave

### Device 2 — Admin Control

Presenter clicks:
> Simulate Rush

Flow Graph changes.

Examination becomes critical.

FlowPilot shows:
> Reassign Counter 2  
> Documents → Examination  
> 29 min → 13 min  
> 4h 06m estimated time returned

Admin clicks:
> Apply Intervention

### Device 3 — FlowPilot Desk

Staff sees:
> New temporary assignment  
> Examination · 20 min

Accept.

### Back to Android

Phone updates:

> Your wait just got shorter  
> 17 min → 8 min

Optional haptic.

### Back to Control

> +4h 06m  
> TIME RETURNED

Timeline shows the causal chain.

That is the moment judges should remember.

---

# 6. What Multi-Agent Development Changes

Parallel agents give us enough implementation capacity for multiple product surfaces.

They do **not** remove:
- integration risk
- inconsistent data models
- API breakage
- merge conflicts
- testing time
- unreliable external services

Therefore multi-agent development should increase **product completeness**, not uncontrolled scope.

Correct response:
- Android Visitor in parallel
- Desk in parallel
- Control in parallel
- Intelligence in parallel
- one shared backend/contracts

Wrong response:
- 40 unrelated features

---

# 7. New Priority Stack

## P0 — Survival

- PostgreSQL/Supabase
- queue join
- token persistence
- Desk lifecycle
- Control live state
- adaptive ETA
- Visitor Android or PWA core
- realtime/fallback

## P1 — Win

- Android Visitor experience
- cross-device realtime update
- Freedom Radius
- Simulate Rush
- Flow Graph / Digital Twin
- congestion forecast
- recommendation
- Apply Intervention
- Desk reassignment
- Human Time Saved
- intervention timeline
- premium UI/UX

## P2 — Distinguish

- Journey Token
- Journey Optimizer
- Journey auto-advance
- cascade prediction
- skill-aware reassignment
- Scenario Lab
- Operational Replay
- Gemini service routing
- PWA fallback
- stable mobile notifications

## P3 — Luxury

- crowd camera
- multilingual
- AI explanation
- ghost queue
- advanced visuals

---

# 8. Features Still Forbidden Until Core Is Stable

Parallel agents do not justify:
- trained ML
- medical triage
- facial recognition
- blockchain
- giant appointment system
- maps
- voice
- full autonomous staffing
- employee surveillance
- 3D facility
- duplicated native Android + PWA logic
- complex login systems
- unrelated analytics pages

---

# 9. Key Architectural Principle

## One Platform, Multiple Clients

Do not build:
- one queue implementation for web
- another queue implementation for Android
- another for Desk

Build:
- one database
- one canonical state model
- one deterministic intelligence implementation
- multiple UIs

Shared contracts are sacred.

---

# 10. Shared Contract Freeze

Before agents work in parallel, freeze:

## TokenStatus

```ts
"waiting"
"called"
"serving"
"completed"
"cancelled"
"skipped"
```

## CounterStatus

```ts
"active"
"inactive"
```

## QueueHealth

```ts
"healthy"
"busy"
"critical"
```

## Core entities

- Service
- Counter
- Staff
- Token
- QueueSnapshot
- Recommendation
- Intervention
- Journey

## Function outputs

- `calculateEta`
- `simulateFacility`
- `recommendIntervention`
- `optimizeJourney`

Agents do not rename these concepts casually.

---

# 11. Engineering Philosophy

## Deterministic Core

Use normal code for:
- queue ordering
- ETA
- simulation
- recommendation
- Human Time Saved
- Journey optimization
- downstream flow calculation

## LLM at the Edges

Use Gemini for:
- user intent → service
- explanation
- optional translation

This makes the project:
- reliable
- explainable
- easier to defend
- not a generic LLM wrapper

---

# 12. Facility Flow Graph Philosophy

FlowPilot should understand that queues interact.

Example:

```text
Documents → Examination → Fees
```

A queue can look healthy now but become overloaded because upstream visitors will soon arrive.

Therefore Journey and Flow Graph data should feed the forecast.

Pitch:

> “The facility is modeled as a directed service graph. Active Journeys create expected downstream demand, allowing FlowPilot to detect a queue cascade before it physically forms.”

This is a strong technical talking point.

---

# 13. Journey Philosophy

Do not force visitors to manage multiple independent tokens.

Preferred concept:

> One visit = one Journey

Example:

```text
J-104

✓ Documents
→ Examination
○ Fees
```

FlowPilot can optimize order when steps are independent.

This gives the Visitor app a purpose beyond being a token viewer.

---

# 14. Staff Reassignment Philosophy

Do not pretend organizations can summon new counters.

If time permits, model real resource constraints.

Example:

```text
Sara:
Documents ✓
Examination ✓
Fees ✗
```

FlowPilot may recommend moving Sara only between compatible services.

This makes the optimization more practical.

Always keep a simple “activate inactive counter” fallback for demo safety.

---

# 15. Human Approval

FlowPilot is not allowed to silently control staff.

Preferred:

```text
Recommendation
→ Manager approves
→ Staff accepts
→ Apply
```

Hackathon fallback:

```text
Recommendation
→ Manager applies
```

When presenting:

> “Operational AI remains human-in-the-loop.”

This is a strength, not a limitation.

---

# 16. Intervention Timeline

Every intervention should be explainable.

Example:

```text
10:42  Examination forecast crossed threshold
10:43  FlowPilot recommended reassignment
10:44  Manager approved
10:44  Desk accepted
10:45  ETA recalculated
10:45  258 person-minutes estimated returned
```

This supports:
- judge explanation
- trust
- replay
- debugging

---

# 17. Operational Replay

Replay is a smart hackathon feature because it gives us a fallback.

If live conditions become awkward:
- show a seeded recorded rush
- replay how FlowPilot reacted

It should look like:
- compressed operational history
- not a fake video

Do not make Replay part of the critical runtime.

---

# 18. UI/UX Is a Winning Feature

Do not treat UI as cleanup.

## Visitor

Feeling:
- calm
- premium
- effortless
- mobile-native

User should understand state in under two seconds.

## Desk

Feeling:
- fast
- clear
- operational
- zero clutter

## Control

Feeling:
- intelligent command center
- premium infrastructure software
- not a student CRUD panel

---

# 19. Visual Identity

Control/Desk:

```text
#090B0D background
#111417 surface
#171B1F elevated
#66F2B3 Flow mint
#65C7FF prediction
#FFB547 warning
#FF626B critical
#F5F7F8 text
#858D95 muted
```

Visitor:
- softer companion theme
- Flow mint retained

Never default to:
- purple-gradient SaaS
- stock shadcn
- excessive glass cards
- random neon

---

# 20. Signature UX Moments

Agents should optimize these moments:

### Moment A — Join
Android creates real token.

### Moment B — Freedom
> You’re free to leave.

### Moment C — Rush
Digital Twin visibly degrades.

### Moment D — Recommendation
Before/after appears.

### Moment E — Staff Action
Desk receives assignment.

### Moment F — Customer Benefit
Android:
> Your wait just got shorter.

### Moment G — Impact
Human Time Saved counts up.

These moments matter more than extra pages.

---

# 21. Android Philosophy

The Android app is **FlowPilot Visitor**, not “all of FlowPilot on Android.”

Must focus on:
- service discovery
- token
- ETA
- Journey
- updates

Do not recreate:
- admin analytics
- simulation controls
- giant dashboards

PWA remains the no-install fallback.

---

# 22. FlowPilot Desk Philosophy

Desk is not an admin portal.

Its job:
- serve customers
- receive operational changes

No unnecessary analytics.

Large controls.

Fast feedback.

---

# 23. FlowPilot Control Philosophy

Control is the product showcase.

Primary:
- Flow Graph / Digital Twin

Secondary:
- critical queue
- recommendation
- Human Time Saved
- timeline

Avoid 20 equal cards.

---

# 24. Agent Roles

## Agent A — Database/Supabase

Must:
- implement schema
- seed
- realtime
- keep migrations clean

Must not:
- invent UI contracts

## Agent B — Intelligence

Must:
- write pure/testable TypeScript
- expose stable functions
- use deterministic logic

Must not:
- use Gemini for math

## Agent C — Control

Must:
- build hero-quality admin UI
- integrate actual data
- make Digital Twin understandable

Must not:
- hardcode operational numbers except explicit demo fixtures

## Agent D — Desk

Must:
- own token lifecycle controls
- own staff reassignment UX

## Agent E — PWA

Must:
- provide zero-install Visitor fallback
- match canonical queue contracts

## Agent F — Android

Must:
- build FlowPilot Visitor in Expo
- use same backend
- prioritize Live Token experience
- isolate notification risk

## Agent G — AI/Integration

Must:
- integrate Gemini with structured output
- test cross-surface flows
- detect contract drift

---

# 25. Rules for Every Agent

1. Read SRS.
2. Read Spec Sheet.
3. Read this file.
4. Do not change stack silently.
5. Do not change status strings independently.
6. Do not duplicate core logic.
7. Do not add dependencies casually.
8. Do not use LLM for arithmetic.
9. Do not hardcode core data.
10. Label simulation.
11. Preserve demo reset.
12. Preserve fallback paths.
13. Preserve mobile-first Visitor.
14. Preserve Control visual hierarchy.
15. Do not add generic chatbot UI.
16. Favor reliability over sophistication.
17. Favor reusable engine logic.
18. Favor visible judge value.
19. Test the golden demo after major changes.
20. Never break the closed loop.

---

# 26. Decision Filter

Before adding a feature:

### Does it improve:
- Functionality?
- Innovation?
- Relevance?
- UI/UX?
- Database implementation?

If no:
- do not build.

### Does it appear in the demo?
If no:
- lower priority.

### Does it reuse existing intelligence?
If yes:
- good.

### Does it introduce external failure?
If yes:
- isolate.

### Can it be explained in one sentence?
If no:
- simplify.

---

# 27. Judge Questions

## “Where is the AI?”

> “FlowPilot uses a hybrid intelligence architecture. Live operational telemetry feeds deterministic forecasting, simulation and optimization. Gemini handles natural-language service understanding and explanations, while operational decisions remain explainable and testable.”

## “Why Android and web?”

> “Visitors can use the installable Android app if they are frequent users, while the PWA preserves zero-install QR access. Staff and managers receive interfaces optimized for their actual tasks.”

## “Why not just add another counter?”

> “Capacity is constrained. FlowPilot evaluates the cost of moving existing resources, including the wait it may create elsewhere, and selects the intervention that minimizes total person-time.”

## “What if Gemini fails?”

> “The queue, prediction, simulation, recommendation and realtime experience continue working. Gemini is not on the critical path.”

## “What if there is no historical data?”

> “Cold start uses configured service priors, then completed transactions continuously replace those assumptions with real service-time data.”

## “Is this really AI?”

> “The intelligence is in forecasting future queue states, evaluating counterfactual interventions and optimizing the response. Generative AI is only one component.”

## “Does the AI control employees?”

> “No. Recommendations remain human-in-the-loop. The manager approves operational changes, and staff can acknowledge reassignment.”

---

# 28. Demo Narrative

Opening:

> “Waiting is an uncertainty problem for visitors and a decision problem for organizations.”

Visitor:

> “The visitor knows when to return instead of physically standing in line.”

Rush:

> “Now demand changes suddenly.”

Prediction:

> “FlowPilot sees the pressure propagating through the facility before the queue physically forms.”

Simulation:

> “It evaluates available counter and staff configurations.”

Recommendation:

> “This reassignment produces the greatest reduction in total waiting.”

Action:

> “The manager approves and the staff console receives the change.”

Outcome:

> “Every affected visitor is recalculated immediately.”

Impact:

> “And we measure what matters: human time returned.”

Close:

> “Other queue systems tell you how long you’ll wait. FlowPilot determines how to make you wait less.”

---

# 29. The Final Product Standard

FlowPilot should feel like:

- one coherent ecosystem
- three intentionally different interfaces
- one shared real-time truth
- one intelligence engine
- one unforgettable demo loop

The project is successful if judges remember:

> **The phone wait changed because the system predicted the queue and coordinated an actual intervention.**

Everything else is secondary.
