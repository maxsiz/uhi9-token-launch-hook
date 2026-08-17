import { readFileSync } from "node:fs";

// App version, read from package.json at build time and inlined as NEXT_PUBLIC_APP_VERSION.
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

// Self-hosted production (unilaunch.envelop.is) builds a Node standalone bundle:
// NEXT_OUTPUT_STANDALONE=1 npm run build  ->  .next/standalone/server.js
// Unset everywhere else, so Vercel (stage) keeps building exactly as before.
const standalone = process.env.NEXT_OUTPUT_STANDALONE === "1";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(standalone ? { output: "standalone" } : {}),
  env: { NEXT_PUBLIC_APP_VERSION: pkg.version },
  // wagmi/walletconnect pull in optional deps that are not needed in the browser bundle.
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};

export default nextConfig;
