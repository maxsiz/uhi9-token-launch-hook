// Canonical identity of the site, plus the one switch that decides whether a build may be indexed.
//
// Prod (unilaunch.envelop.is) and stage (Vercel) are built from the same `master`, so nothing here
// may be hard-coded per environment: everything is derived from env vars that differ between the
// two build hosts. See DEPLOY.md ("Indexing and analytics") for the operator's view.

/** Human-readable product name — used in titles, OG cards and JSON-LD. */
export const SITE_NAME = "TokenLaunchHook Studio";

export const SITE_TAGLINE = "Fair-launch on Uniswap v4 — in one transaction";

export const SITE_DESCRIPTION =
  "Launch a fair-launch token campaign on Uniswap v4 in a single transaction — anti-snipe window, " +
  "decaying buy/sell tax, conditional liquidity lock and a whitelist phase, all enforced by one " +
  "shared v4 hook. The studio shows which hook callback enforces each rule.";

export const REPO_URL = "https://github.com/maxsiz/uhi9-token-launch-hook";

/**
 * Absolute origin this build serves from, no trailing slash. Feeds `metadataBase`, canonicals,
 * robots.txt and the sitemap.
 *
 * - prod: `NEXT_PUBLIC_SITE_URL` is set by the deploy workflow (`https://unilaunch.envelop.is`);
 * - Vercel: falls back to the deployment URL Vercel injects, so canonicals on stage at least point
 *   at stage rather than at localhost (which is what they used to do — see git history);
 * - local: `http://localhost:3000`.
 */
function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercelAlias =
    process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL?.trim() || process.env.NEXT_PUBLIC_VERCEL_URL?.trim();
  if (vercelAlias) return `https://${vercelAlias.replace(/\/+$/, "")}`;
  return "http://localhost:3000";
}

export const SITE_URL = resolveSiteUrl();

/**
 * Whether this build is allowed into search indexes.
 *
 * Computed once in `next.config.mjs` and inlined as `NEXT_PUBLIC_SEO_INDEXABLE` so that server
 * components, client components and the config itself cannot disagree. The rule there is: any
 * deployment running on Vercel (our stage and its previews) is *not* indexable; the self-hosted
 * production container is. `SEO_INDEXABLE=0|1` overrides it either way.
 *
 * The default when the variable is somehow missing is **indexable** — deliberately failing towards
 * the state prod needs, because a silently de-indexed production site is far more expensive than a
 * stage that briefly leaks into the index.
 */
export const INDEXABLE = process.env.NEXT_PUBLIC_SEO_INDEXABLE !== "0";

/**
 * GTM container that carries the GA4 configuration tag (property "unilaunch", G-FK7SVLRRK6).
 * Not a secret — a container id is public by design, it ships in every page of the site.
 * Set `NEXT_PUBLIC_GTM_ID=""` to build without analytics at all.
 */
export const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID ?? "GTM-ML64J4C3";

/**
 * Google Search Console ownership token (URL-prefix property, META method). Public by design: its
 * only power is to prove control of this origin, which requires already controlling this origin.
 */
export const GOOGLE_SITE_VERIFICATION = "PJCw_VmpKGVRc5YZ0KrYEQVF2WJ-eSjzmQU63s2py54";
