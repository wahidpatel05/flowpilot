// Metro resolves the transform preset from this file. Without it Metro falls
// back to the bare React Native preset: JSX still compiles, so nothing errors,
// but babel-preset-expo's static substitution of `process.env.EXPO_PUBLIC_*`
// never runs and every one of those reads is `undefined` at runtime. See
// AGENTS.md, "EXPO_PUBLIC_* must be read literally".
module.exports = function (api) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
};
