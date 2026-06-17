import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control",     value: "on" },
  { key: "X-Frame-Options",            value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options",     value: "nosniff" },
  { key: "Referrer-Policy",            value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy",         value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://unpkg.com",  // unsafe-eval diperlukan Next.js dev
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://storage.pedami-inventaris.com",
      "connect-src 'self' https://unpkg.com https://tile.openstreetmap.org https://*.tile.openstreetmap.org",
      "frame-ancestors 'none'",
    ].join("; "),
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
]

const nextConfig: NextConfig = {
  output: "standalone",
  // pdfkit memuat file font .afm dari node_modules saat runtime; jangan di-bundle webpack
  serverExternalPackages: ["pdfkit"],
  async headers() {
    return [
      // CORS headers untuk semua endpoint mobile API
      {
        source: "/api/mobile/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, PUT, DELETE, OPTIONS, PATCH" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization, X-Requested-With" },
          { key: "Access-Control-Max-Age", value: "86400" },
        ],
      },
      // Security headers untuk halaman web (bukan API)
      {
        source: "/((?!api).*)",
        headers: securityHeaders,
      },
    ]
  },
};

export default nextConfig;
