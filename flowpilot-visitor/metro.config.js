// Metro must be taught two things about flowpilot-core, because the engine is a
// sibling source tree rather than an installed package: where it lives, and how
// its ESM-style `./types.js` specifiers map onto `.ts` source.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const coreRoot = path.resolve(projectRoot, '..', 'flowpilot-core');
const coreEntry = path.join(coreRoot, 'src', 'index.ts');

const config = getDefaultConfig(projectRoot);

// Outside the app root, so Metro will not watch or bundle it unless told.
config.watchFolders = [coreRoot];

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@flowpilot/core') {
    return { type: 'sourceFile', filePath: coreEntry };
  }

  // tsc's `bundler` resolution maps `./types.js` onto `./types.ts`; Metro does
  // not. Confined to flowpilot-core so app code keeps normal resolution.
  if (
    moduleName.startsWith('.') &&
    moduleName.endsWith('.js') &&
    context.originModulePath.startsWith(coreRoot)
  ) {
    return context.resolveRequest(
      context,
      `${moduleName.slice(0, -'.js'.length)}.ts`,
      platform,
    );
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
