import type { NextConfig } from "next";
import path from "node:path";

/**
 * This app runs on webpack, not the Turbopack default (see package.json's
 * `--webpack` flag), because flowpilot-core lives outside apps/, and its
 * internal cross-file imports use the NodeNext `.js`-specifier-resolves-to-
 * `.ts`-file convention that `tsc` understands natively but webpack does not
 * by default. `resolve.extensionAlias` below teaches it that one trick.
 */
const nextConfig: NextConfig = {
  agentRules: false,
  outputFileTracingRoot: path.join(__dirname, "../.."),
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
