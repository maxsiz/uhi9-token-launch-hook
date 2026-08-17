import { readFileSync } from "node:fs";

// App version, read from package.json at build time and inlined as NEXT_PUBLIC_APP_VERSION.
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

// Self-hosted production (unilaunch.envelop.is) builds a Node standalone bundle:
// NEXT_OUTPUT_STANDALONE=1 npm run build  ->  .next/standalone/server.js
// Unset everywhere else, so Vercel (stage) keeps building exactly as before.
const standalone = process.env.NEXT_OUTPUT_STANDALONE === "1";

// Whether this build may be indexed by search engines.
//
// prod and stage are built from the same `master`, so this cannot be a constant in the source. The
// distinguishing fact is the build host: stage and its previews run on Vercel (which always sets
// `VERCEL=1`), the production container does not. `SEO_INDEXABLE=0|1` overrides the inference in
// either direction, e.g. to give the stage a temporary window in the index or to pull prod out.
//
// Computed here, once, and inlined as `NEXT_PUBLIC_SEO_INDEXABLE` so that robots.txt, the sitemap,
// the `noindex` meta tag, the `X-Robots-Tag` header below and the analytics gate can never disagree
// with each other. Everything downstream reads `INDEXABLE` from `lib/config/site.ts`.
const indexable =
  process.env.SEO_INDEXABLE !== undefined ? process.env.SEO_INDEXABLE === "1" : !process.env.VERCEL;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(standalone ? { output: "standalone" } : {}),
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_SEO_INDEXABLE: indexable ? "1" : "0",
  },
  // The meta tag alone would leave non-HTML responses (the OG image, the sitemap) indexable, and it
  // is invisible to anything that does not execute the page. The header covers every route.
  async headers() {
    if (indexable) return [];
    return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
  },
  // wagmi/walletconnect pull in optional deps that are not needed in the browser bundle.
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};

export default nextConfig;
