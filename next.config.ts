import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
  // No rewrites: /api/* is served by app/api/[...path]/route.ts, which adds the server-side API key.
  // (A rewrite would run first and send requests to the backend without the key.)
};

export default config;
