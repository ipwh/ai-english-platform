import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cloud Run 需要 standalone 輸出模式（自帶 server.js）
  output: 'standalone',

  // Production security headers（由 Next.js 直接注入，所有部署環境一致）
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
  // Route timeouts: Cloud Run request timeout is 300s (cloud-run.yaml).
  // Per-route `maxDuration` exports remain as in-process guards only.
};

export default nextConfig;
