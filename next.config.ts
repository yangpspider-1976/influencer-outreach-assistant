import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * SEC-006 / general hardening. The app renders no third-party content and never
 * embeds Facebook or Instagram (§16), so everything is locked to 'self'.
 *
 * `'unsafe-eval'` is added in development only: React's dev build uses eval()
 * for debugging features such as reconstructing callstacks, and Turbopack's HMR
 * client needs it too. React never uses eval() in production, so the shipped
 * policy stays strict.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  // Next.js injects inline bootstrap scripts and styles.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  // Dev also needs websocket connections for hot module replacement.
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

/**
 * LAN access in development. `next dev` already listens on all interfaces, but
 * Next.js 16 blocks cross-origin requests to dev-only assets (HMR, RSC) by
 * default, so another device reaching the app by this machine's LAN IP would be
 * refused. These host patterns allow the common private IPv4 ranges — the
 * matcher treats `*` as one address segment, so `192.168.*.*` covers any
 * 192.168.x.y address and survives DHCP re-assignment.
 *
 * Dev-only: `allowedDevOrigins` has no effect on a production build. Override or
 * extend with a comma-separated DEV_ALLOWED_ORIGINS env var if your subnet
 * differs (e.g. a hostname or a specific IP).
 */
const allowedDevOrigins = [
  "192.168.*.*", // typical home/office Wi-Fi routers (192.168.0.x, 192.168.1.x, …)
  "10.*.*.*", // another common private range
  "172.16.*.*", // and the 172.16–31 private block (Docker/corporate)
  "*.ngrok-free.dev", // ngrok HTTPS tunnels used for shared UAT/dev sessions
  "*.ngrok-free.app",
  "*.ngrok.app",
  "*.ngrok.io",
  ...(process.env.DEV_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
];

const nextConfig: NextConfig = {
  // Emits .next/standalone so the Docker runtime stage stays minimal.
  output: "standalone",

  // Development-only: permit LAN devices to load HMR/dev resources (see above).
  allowedDevOrigins,

  // The generated Prisma client is required at runtime by the server bundle.
  serverExternalPackages: ["@prisma/client", "@node-rs/argon2", "exceljs"],

  /**
   * Keep development-only material out of the deployable standalone bundle,
   * and therefore out of the Docker image: test suites, the acceptance and UI
   * scripts (which carry the seeded demo credentials), and internal
   * documentation such as the security review.
   *
   * `prisma/` is deliberately not excluded — the Dockerfile ships migrations so
   * an operator can run `prisma migrate deploy` against the container.
   */
  outputFileTracingExcludes: {
    "/*": [
      "tests/**/*",
      "scripts/**/*",
      "docs/**/*",
      "*.md",
      "vitest.config.ts",
      "eslint.config.mjs",
      "tsconfig.tsbuildinfo",
      "docker-compose.yml",
      "Dockerfile",
    ],
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
        ],
      },
    ];
  },
};

export default nextConfig;
