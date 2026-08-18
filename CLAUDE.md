# FlowPilot

A closed-loop queue orchestration platform for physical waiting. Built across three teams:
backend/intelligence (this repo's `flowpilot-core` + `supabase`), the website (Control + Desk),
and the Android app (FlowPilot Visitor). The web app also carries an insurance-grade Visitor PWA
route — see `docs/adr/0004-insurance-grade-visitor-pwa.md`.

## Read before you build

- **`CONTEXT.md`** — the shared vocabulary. Use its terms; don't drift to the synonyms it lists under `_Avoid_`.
- **`INTEGRATION.md`** — the handoff contract, the closed-loop ownership table, and the two places we
  deliberately override the spec sheet.
- **`flowpilot-core/src/types.ts`** — frozen domain contracts. Never reimplement the engine; never invent
  a status string.
- **`flowpilot-visitor/AGENTS.md`** — the Expo Visitor app: how `@flowpilot/core` is aliased into Metro,
  and why `EXPO_PUBLIC_*` must be read literally.

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues in this repo's public GitHub Issues, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, using the default label strings unchanged. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and one `docs/adr/` at the repo root. See `docs/agents/domain.md`.
