# S3 — Cross-device acceptance run and failure rehearsal

The run-through both teams do together, on the real devices, before anyone is judged. Issue #14.

Two halves. The automated half proves the chain against the live project and fails fast when
something is broken; the human half proves the things only a person watching a screen can prove.
**Do the automated half first** — it costs two minutes and it leaves the database at the seeded
baseline, which is exactly where the human half starts.

---

## Before you start

| | |
|---|---|
| Web app | `npm --prefix apps/web run dev` → Live Queues `/`, Control `/control`, Desk `/desk`, Visitor PWA `/visitor` |
| Android app | `npm --prefix flowpilot-visitor start`, then open it on the phone |
| Credentials | `.env.local` at the repo root, `*_PUBLISHABLE_KEY` (never `*_ANON_KEY`) |
| Migrations | `0003_reset_demo_api_safe.sql` must be applied, or Control's Reset Demo button fails on stage |
| Devices | The phone on the same wifi as the laptop, screen timeout set long, brightness up |

Fill these in before the rehearsal, and don't change them afterwards:

- **Narrator** — tells the story, touches nothing: `____________`
- **Driver** — drives Control and Desk: `____________`
  (not "Operator": CONTEXT.md reserves that word, and this person is not Staff)
- **Visitor** — holds the phone, says what it says: `____________`

---

## Half one: the automated acceptance run

```bash
npm --prefix scripts run acceptance            # two passes from a clean reset
npm --prefix scripts run acceptance -- --passes 3
```

It drives the closed loop twice through the database RPCs and asserts, per pass, that the Visitor's
recomputed ETA is strictly lower; that a **brand-new client** re-derives the capacity change, the
lowered ETA, Estimated Time Returned (through Control's own ledger) and the whole timeline from a
cold read, which is what a refresh does; that every simulated Token is flagged in the projection each
surface renders from; that `approved` never renders after `applied` through Control's own
`buildTimeline`, **including with all five events collapsed into one millisecond**; and that a Visitor
can join the way the PWA joins with no phone involved. Then, across the passes: no surface displays
the banned wording (ADR-0002), and the two passes agree on the ETAs, the capacity change and the
person-minutes returned.

It exits non-zero on the first failure and restores the seeded baseline either way.

**What it cannot do** is look at a screen. Everything below is the part that needs eyes.

### The numbers it produced on the last green run

| | |
|---|---|
| ETA before / after | 26.1 min → 13.0 min, with 5 people ahead throughout |
| Active Counters | 1 → 2 for Examination Cell |
| Estimated Time Returned | 339.6 person-minutes (estimated — never observed) |
| Simulate Rush | 24 Tokens, 12 of them into Examination Cell |
| Timeline | `recommendation_created → approved → staff_accepted → applied → eta_recalculated` |

Both passes matched to the decimal. If your run differs by more than a minute or two, something
changed — find out what before you present it.

---

## Half two: the human run-through

### Order matters, and this is the one that bites

**Reset first, join on the phone second.** `reset_demo()` deletes every non-completed Token facility
wide, including a real Visitor's just-joined one. A phone Token created before the reset is gone by
the time you look at it, and the ETA you are about to narrate belongs to nothing.

### The chain

| # | Moment | Surface | Narrator | What to watch |
|---|---|---|---|---|
| 0 | Reset to baseline | Control → **Reset Demo** | Driver | Documents 5, Fees 3, Examination 6, one Counter each |
| 1 | A Visitor joins | Android phone | Visitor | Token number, position, ETA — read the ETA out loud, it is the number the whole demo turns on |
| 2 | Control sees the join | Control | Narrator | The Token appears in Examination Cell without anyone reloading |
| 3 | The rush lands | Control → **Simulate Rush** | Driver | Queue jumps; the simulated count is labelled, not hidden |
| 4 | Examination Cell is critical | Control | Narrator | Health `critical`. **Say "deepens", not "becomes"** — see the note below |
| 5 | The forecast | Control (Digital Twin, forecast) | Narrator | Now and forecast side by side — confirm the forecast is **labelled as a prediction**, and that its numbers differ from now. The harness asserts the numbers differ; you are checking the screen says which is which |
| 6 | The Recommendation appears | Control | Narrator | Its action, its before/after, its estimated time returned. DeQueue's opinion — nothing has happened yet |
| 7 | A human approves | Control → **Approve** | Driver | Recommendation becomes an Intervention; two records, never one |
| 8 | The Desk receives it | Desk | Narrator | Incoming Assignment card, unprompted |
| 9 | The Desk accepts | Desk → **Accept** | Driver | Capacity changes here and nowhere else — one atomic RPC in Postgres |
| 10 | The phone's ETA drops | Android phone | Visitor | The number falls, and the banner says the wait got shorter. Read both out |
| 11 | Estimated Time Returned rises | Control | Narrator | The figure counts up. Say "estimated", every time |
| 12 | The timeline explains it | Control | Narrator | Five events, in order, `approved` above `applied` |

### The one thing not to overclaim

Examination Cell is **already `critical` at the seeded baseline** — 6 waiting × ~6 min on one Counter
is ~36 min, past its 30 min critical threshold. Simulate Rush deepens an existing crisis; it does not
cause the transition into it. Narrate step 4 as pressure deepening, and if a judge asks, say the
baseline is already critical and that this is what a real morning queue looks like. Claiming a
transition that didn't happen is the kind of thing a judge notices.

### Refresh every surface, mid-demo

Do this *during* the chain, not after it — the point is that a surface reloaded at the worst moment
comes back correct rather than blank.

| Surface | Refresh after step | Must still show |
|---|---|---|
| Control | 6 (Recommendation on screen) | The same Recommendation, the same forecast, the same queue |
| Desk | 8 (Assignment incoming) | The Incoming Assignment card, still awaiting Accept |
| Control | 11 | Estimated Time Returned unchanged, and the full timeline in order |
| Live Queues `/` | any | Current queues and Health, no stale numbers |
| Visitor PWA `/visitor` | after the apply | The same Token, the lowered ETA |
| Android | — | Background and foreground the app; the Token and the ETA come back |

The automated run already proves the *data* survives a cold read. What you are checking here is that
each surface actually re-reads it on mount instead of waiting for a Realtime event that already fired.

### Run it twice

Once is luck. Reset and do the whole chain again, with a new Token on the phone.

| | Run 1 | Run 2 |
|---|---|---|
| Reset clean | ☐ | ☐ |
| Phone joined after the reset | ☐ | ☐ |
| Control saw the join live | ☐ | ☐ |
| Recommendation appeared | ☐ | ☐ |
| Approve → Desk received | ☐ | ☐ |
| Accept → capacity changed | ☐ | ☐ |
| Phone ETA visibly dropped | ☐ | ☐ |
| Phone said the wait got shorter | ☐ | ☐ |
| Estimated Time Returned rose | ☐ | ☐ |
| Timeline in order, `approved` before `applied` | ☐ | ☐ |
| Simulated Visitors labelled everywhere | ☐ | ☐ |
| Every planned refresh survived | ☐ | ☐ |
| ETA before → after | ☐ ____ → ____ | ☐ ____ → ____ |

---

## The failure rehearsal — do it once, on purpose

The Android app is the primary Visitor surface. The PWA exists so a dead phone cannot kill the demo,
and that is only true if you have done it once already.

1. Reset to baseline.
2. **Switch the phone off.** Not asleep — off. This is the rehearsal, so rehearse it.
3. Open `/visitor` in a browser (a second laptop, or a phone-shaped window).
4. Pick Examination Cell and join. Confirm the Token number, the position and the ETA appear.
5. Run the chain from step 3 onward, exactly as above.
6. Confirm the **ETA in the browser drops** after the apply, and Estimated Time Returned rises.
7. Say the sentence you would say on stage: *"the phone is the primary surface, and this is the same
   Visitor experience in a browser."* Practising the sentence is the point of practising the failure.

Sign-off: rehearsed by `____________` on `__________`. Result: ☐ passed ☐ failed → what broke:
`__________________________`

---

## Who says what, and who stays quiet

- The **Narrator** never touches a device. Two people driving one demo is how a click gets missed.
- The **Driver** clicks and says nothing except confirming what they clicked.
- The **Visitor** reads the phone out loud twice, and only twice: the ETA at step 1 and the lowered
  ETA at step 10. Those two numbers are the demo.
- Nobody explains the architecture unless asked. The chain is the argument.

Read this section out before judging. That is the difference between a presentation and improvisation.

---

## Coverage — what is proven where

| Acceptance criterion (#14) | Automated | Human |
|---|---|---|
| The full chain from a clean reset | the data hops, twice | the surfaces, twice |
| Forecast appears | ✅ Control's own view model predicts, not echoes | ✅ labelled as a prediction on screen |
| Every surface survives a mid-demo refresh | data re-derives cold | each surface re-reads on mount |
| Run at least twice from a clean reset | ✅ `--passes 2`, passes compared | ✅ the table above |
| Failure rehearsal with the phone off | the Visitor hop, headless | ✅ the PWA in a browser |
| `approved` never renders after `applied` | ✅ including a one-millisecond tie | ✅ eyes on the timeline |
| Simulated Visitors visibly marked | ✅ every Token flagged in the projection | ✅ labels on Control, Desk and the PWA |
| No surface says the banned word for Estimated Time Returned | ✅ all three surfaces scanned | — |
| Who narrates which moment | — | ✅ filled in at the top |
