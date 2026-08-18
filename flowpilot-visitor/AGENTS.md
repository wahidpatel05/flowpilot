# FlowPilot Visitor (Expo / Android)

## Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Scope

This app is **FlowPilot Visitor**, not all of FlowPilot on a phone. Service discovery, Token,
ETA, Journey, updates. No admin, simulation or dashboard surfaces — those are Control's.

## The engine is not installed, it is aliased

`@flowpilot/core` is the sibling `../flowpilot-core` source tree, not an npm package. Three
configs must agree, and all three are already set up — change them together or not at all:

- `metro.config.js` — `watchFolders` plus a `resolveRequest` that also maps flowpilot-core's
  ESM-style `./types.js` specifiers onto `.ts` source, which Metro does not do on its own.
- `tsconfig.json` — `paths`.
- `vitest.config.ts` — `resolve.alias`.

Never reimplement an ETA, a queue length or a Health band here. Call `projectFacility` and read
the `QueueSnapshot`, so the phone and Control can never disagree about the same queue.

## EXPO_PUBLIC_* must be read literally

Expo inlines `process.env.EXPO_PUBLIC_FOO` by **static substitution** at build time. Any
indirection — `process.env[name]`, destructuring, a helper taking the name as a string — leaves
`undefined` in the bundle with no build error, surfacing much later as an unauthorised fetch.
See `src/supabase.ts`. To verify a value actually shipped:

```bash
npx expo export --platform android --output-dir /tmp/bundle-check
grep -a "<your-project-ref>" /tmp/bundle-check/_expo/static/js/android/*.hbc
```

## Checks

```bash
npm run typecheck
npm test                 # vitest, pure logic only
npx expo export --platform android --output-dir /tmp/bundle-check   # proves Metro resolves
```
