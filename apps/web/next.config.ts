import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@ledgerline/core"],
  // The project keeps one CLAUDE.md at the root; do not scatter generated ones.
  agentRules: false,
};

export default nextConfig;
