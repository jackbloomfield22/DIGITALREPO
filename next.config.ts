import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  async redirects() {
    // Legacy URLs from before the Creators → Talent rename
    return [
      { source: "/creators", destination: "/talent", permanent: true },
      { source: "/creators/:path*", destination: "/talent/:path*", permanent: true },
      // Research Inbox became the Ingest system
      { source: "/inbox", destination: "/ingest", permanent: true },
    ];
  },
};

export default nextConfig;
