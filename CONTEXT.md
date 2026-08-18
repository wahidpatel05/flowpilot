# FlowPilot

A closed-loop queue orchestration platform for physical waiting. It predicts congestion
before a queue forms, simulates capacity interventions, and coordinates the one that
returns the most human time — with a manager approving every action.

This file is the shared vocabulary for all three build teams (backend/intelligence,
website, Android). It is a glossary, not a spec. If you find yourself wanting to write
"how it works" here, it belongs in the SRS or the code instead.

## Language

### The waiting side

**Visitor**:
A person waiting for a service. Never has an account.
_Avoid_: user, customer, client, guest

**Token**:
One Visitor's claim on one Service, carrying a position and an ETA.
_Avoid_: ticket, number, entry

**Journey**:
One visit made of several ordered Steps across multiple Services. One visit, one Journey —
a Visitor never juggles independent Tokens.
_Avoid_: session, trip, workflow, multi-token

**Step**:
One Service within a Journey. Realised as a Token when the Visitor reaches it.
_Avoid_: stage, leg, task

**Freedom Radius**:
The guidance telling a Visitor whether they may leave, should stay nearby, or are next.
_Avoid_: geofence, proximity alert

### The capacity side

**Service**:
A kind of work a Visitor queues for (Documents, Fees, Examination). The queue belongs to
the Service, never to the Counter.
_Avoid_: department, desk type, category

**Counter**:
A physical position where work happens. A Counter is furniture: it is activated and
deactivated, and it never moves between Services.
_Avoid_: window, booth, station

**Staff**:
A person who serves Visitors. Staff are the constrained resource, and what they can serve
is gated by Skill.
_Avoid_: agent, operator, employee, worker

**Skill**:
A (Staff, Service) pair recording that this person is competent at this Service. Absence of
a Skill is a hard constraint, never a preference.
_Avoid_: capability, qualification, training

**Assignment**:
A binding of (Staff, Counter, Service) for a period. THE ASSIGNMENT IS THE UNIT FLOWPILOT
MOVES — not the Counter, not the Staff member in isolation. Primary assignments are the
normal roster; temporary assignments expire.
_Avoid_: shift, posting, allocation, roster entry

### The intelligence side

**Queue Snapshot**:
The state of one Service at one instant: length, active Counters, predicted wait, Health.
_Avoid_: queue state, metrics, stats

**Health**:
A Service's pressure band — healthy, busy, or critical. Derived from predicted wait against
that Service's own thresholds.
_Avoid_: status, severity, level, alert

**Flow Graph**:
The directed graph of Services showing what share of Visitors move from one to the next.
It is what lets FlowPilot see a queue forming upstream before it arrives.
_Avoid_: pipeline, funnel, topology, digital twin (see below)

**Digital Twin**:
The Flow Graph rendered live in Control, showing now and forecast side by side. The Digital
Twin is the *visualisation*; the Flow Graph is the *model*.
_Avoid_: using the two terms interchangeably

**Recommendation**:
A proposed Assignment change, with its simulated before and after. A Recommendation is
FlowPilot's opinion and has no effect on the world.
_Avoid_: suggestion, insight, alert, action

**Intervention**:
An approved Recommendation moving through the world. A Recommendation becomes an
Intervention the moment a human approves it; the two are never the same record.
_Avoid_: action, change, command, execution

**Estimated Time Returned**:
The person-minutes of waiting that an Intervention is predicted to avoid, computed as a
counterfactual against the simulator. ALWAYS "estimated", NEVER "measured" — no one observes
the facility that didn't happen.
_Avoid_: Human Time Saved, time saved, measured impact

**Simulate Rush**:
An operator-triggered injection of demand for demonstration. Tokens it creates are marked
simulated and must be visibly labelled.
_Avoid_: load test, stress test, demo mode
