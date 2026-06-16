import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the Node-only backend libs external instead of bundling them into route handlers —
  // bullmq/ioredis/postgres do dynamic requires that don't survive bundling.
  serverExternalPackages: ["bullmq", "ioredis", "postgres", "drizzle-orm"],
};

export default nextConfig;
