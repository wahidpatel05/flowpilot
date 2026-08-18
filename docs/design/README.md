# Design reference

The source material the DeQueue UI was built against. These are inputs, not
generated output — the moodboards define the palette, illustration style and
motion vocabulary that `apps/web/src/app/globals.css` implements.

| File | What it is |
| --- | --- |
| `moodboard-website-system.png` | The website system: core components, booking flow, navigation structure, notification and queue-state animations, dashboard layout, colour palette and typography. |
| `moodboard-web-components.png` | Web component sheet — buttons, chips, status indicators, cards, the booking flow and the queue animation timeline. |
| `moodboard-mobile-components.png` | The same system for mobile, plus the in-app queue states and micro-interactions. |
| `moodboard-avatar-states.png` | The assistant avatar's ten states (idle, greeting, thinking, analysing, idea, alert, confused, excited, celebration) and where each is allowed to appear. See `DeQueueAvatar.tsx` and `lib/avatarMood.ts`. |
| `reference-neo-brutalism.jpeg` | The neo-brutalist treatment the current theme follows: hard black strokes, offset shadows with no blur, saturated colour blocks on a yellow canvas. |
| `screenshot-control-redesign.png` | Control after the first redesign pass. |
| `screenshot-desk-stale-name-bug.png` | The Desk still raising `FlowPilot:` from a Postgres function after the apps had been renamed — the bug `supabase/migrations/0005_rename_to_dequeue.sql` fixes. |

The avatar moodboard carries one rule worth repeating here, because it is easy
to lose: **use the avatar only during meaningful moments, not everywhere.**
`deriveAvatarMood` is what enforces it.
