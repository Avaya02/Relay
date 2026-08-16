import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Lets a throwaway verification instance run alongside the real dev server
  // (Next 16 holds a per-distDir lock). No-op unless the env var is set.
  ...(process.env.RELAY_VERIFY_DIST_DIR
    ? { distDir: process.env.RELAY_VERIFY_DIST_DIR }
    : {}),
};

export default nextConfig;
