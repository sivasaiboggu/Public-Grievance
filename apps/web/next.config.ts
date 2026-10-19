import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@grievancegrid/api-client"],
  poweredByHeader: false,
  devIndicators: false,
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: "http://127.0.0.1:8000/api/v1/:path*",
      },
    ];
  },
};

export default config;
