/** Playwright globalSetup: bundle the browser wallet shim (esbuild → IIFE) so the spec can inject it. */
import { build } from "esbuild";
import { join } from "node:path";
import { loadEnvLocal } from "./env";

export const SHIM_BUNDLE = join(__dirname, "..", ".e2e", "shim.iife.js");

export default async function globalSetup() {
  loadEnvLocal();
  await build({
    entryPoints: [join(__dirname, "shim.ts")],
    bundle: true,
    platform: "browser",
    format: "iife",
    target: "es2020",
    outfile: SHIM_BUNDLE,
    tsconfig: join(__dirname, "..", "tsconfig.json"),
    logLevel: "silent",
  });
}
