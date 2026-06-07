import { readFileSync } from "node:fs";

// App version, read from package.json at build time and inlined as NEXT_PUBLIC_APP_VERSION.
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: { NEXT_PUBLIC_APP_VERSION: pkg.version },
  // wagmi/walletconnect pull in optional deps that are not needed in the browser bundle.
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};

export default nextConfig;
