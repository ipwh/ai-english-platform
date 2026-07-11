import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Production security headers (injected via vercel.json for Vercel,
  // but also set here for non-Vercel deployments)
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
  // Allow Google OAuth avatar images
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
    ],
  },
  // Vercel serverless: AI routes use maxDuration in vercel.json
  // Other routes default to 10s (Vercel Hobby) / 15s (Pro)
};

export default nextConfig;
