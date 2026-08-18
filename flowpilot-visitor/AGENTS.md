# FlowPilot Visitor (Expo / Android)

## Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.

## The Expo SDK version must match the team's Expo Go app, not npm's `latest`

The project targets **SDK 54**, deliberately behind npm's current `latest` (57 as of this
writing). Expo Go's Play Store build lags the SDK release cadence — "up to date" per the Play
Store does not mean it supports the newest SDK — and Expo Go only ever runs a project whose SDK
matches its own exactly; it fails with "incompatible" rather than warning. Expo Go's error screen
states the exact SDK number it needs; if a phone reports a different one than this project targets,
resolve it there — `npx expo install expo@^<N>.0.0 && npx expo install --fix`, then `rm -rf
node_modules && npm install` to force a clean dependency resolution — rather than guessing.
Test on a real device before assuming a version bump is safe.

## Running on a shared/venue Wi-Fi with client isolation

`npx expo start --lan` only works if the phone and this machine can reach each other directly.
Many venue/"common" Wi-Fi networks block device-to-device traffic even on the same SSID. If a
phone can't load the LAN URL, use `npx expo start --tunnel` instead (needs `@expo/ngrok`,
installed as a devDependency) — it relays through a public endpoint, so client isolation doesn't
matter. Two gotchas specific to this machine's toolchain:

- If `$ANDROID_HOME` is set but has no `platform-tools/adb` (SDK installed without it), Expo
  CLI's device-scan step crashes the *entire* dev server rather than skipping gracefully. Run with
  `env -u ANDROID_HOME -u ANDROID_SDK_ROOT npx expo start --tunnel` to fall back to `$PATH`'s adb.
- Do not add `expo-status-bar` (or any package with no native config) to `app.json`'s `plugins`
  array — `npx expo install --fix` did this automatically on this project and it is wrong: the
  package has no `app.plugin.js`, and Node 26's strict TypeScript-stripping refuses to load its
  `.ts` source directly, crashing the dev server with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`
  before a single line of app code runs. If `--fix` adds a `plugins` entry, verify the package
  actually needs one before keeping it.

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
