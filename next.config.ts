import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  // Medical certificates (справки) go through a server action: photos are shrunk in the browser, files up to 4 MB
  // (Vercel accepts request bodies up to 4.5 MB).
  experimental: { serverActions: { bodySizeLimit: "4.5mb" } },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
