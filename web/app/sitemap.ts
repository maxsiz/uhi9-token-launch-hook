import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config/site";

// The three stable, self-describing routes. `/swap/<chainId>/<pid>` is left out: it is an unbounded
// per-campaign URL space with no content of its own before a wallet connects, and it is noindex.
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/launch`, lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/governance`, lastModified, changeFrequency: "monthly", priority: 0.6 },
  ];
}
