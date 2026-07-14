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
          // CSP: Content-Security-Policy (prevents XSS, clickjacking, data injection)
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https://lh3.googleusercontent.com https://avatars.githubusercontent.com",
              "connect-src 'self' https://api.deepseek.com https://generativelanguage.googleapis.com https://*.googleapis.com",
              "media-src 'self' blob:",
              "frame-src 'self' https://accounts.google.com",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
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
