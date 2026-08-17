import type { MetadataRoute } from "next";
import { INDEXABLE, SITE_URL } from "@/lib/config/site";

// `/api/` is the server-side RPC proxy — a POST-only route handler with nothing to index.
// `/swap/<chainId>/<pid>` is deliberately NOT disallowed: those pages carry `noindex` in their own
// metadata, and a crawler that is forbidden from fetching a page can never read the noindex on it.
const DISALLOW = ["/api/"];

// Named explicitly so the public pages are never caught by a future blanket AI-crawler block.
const AI_BOTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "anthropic-ai",
  "Claude-Web",
  "PerplexityBot",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
];

export default function robots(): MetadataRoute.Robots {
  // Stage (Vercel). Crawling stays *open* on purpose: the de-indexing signal is the
  // `X-Robots-Tag: noindex` header plus the `noindex` meta tag, and both are invisible to a crawler
  // that robots.txt has told to stay away. `Disallow: /` would instead freeze whatever is already
  // indexed in place. No sitemap is advertised, so nothing invites a crawl either.
  if (!INDEXABLE) {
    return { rules: [{ userAgent: "*", allow: "/" }] };
  }

  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: DISALLOW },
      ...AI_BOTS.map((userAgent) => ({ userAgent, allow: "/", disallow: DISALLOW })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
