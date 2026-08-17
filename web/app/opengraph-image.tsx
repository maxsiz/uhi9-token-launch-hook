import { ImageResponse } from "next/og";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/config/site";

export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Social card (1200×630), generated from code rather than committed as a binary: it stays in sync
// with the palette and the copy, and there is no asset to forget to update. The previous metadata
// pointed at a static `/og-image.png` that never existed and 404'd on every share.
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #0A0A0A 0%, #0B1210 55%, #08170F 100%)",
          color: "#F5F5F5",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* The three rising candles from the app mark, flattened to plain rects (Satori has no
              SVG path support worth relying on here). */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 62 }}>
            <div style={{ width: 16, height: 26, borderRadius: 5, background: "#10b981" }} />
            <div style={{ width: 16, height: 44, borderRadius: 5, background: "#10b981" }} />
            <div style={{ width: 16, height: 62, borderRadius: 5, background: "#34d399" }} />
          </div>
          <div style={{ fontSize: 40, fontWeight: 800, color: "#34d399", letterSpacing: -1 }}>{SITE_NAME}</div>
        </div>

        <div style={{ marginTop: 40, fontSize: 62, fontWeight: 800, lineHeight: 1.1, letterSpacing: -2, maxWidth: 940 }}>
          {SITE_TAGLINE}
        </div>

        <div style={{ marginTop: 30, fontSize: 29, color: "#A3A3A3", maxWidth: 960, lineHeight: 1.35 }}>
          Anti-snipe window, decaying buy/sell tax, conditional liquidity lock and a whitelist phase — one shared
          Uniswap v4 hook, and a live view of which callback enforces each rule.
        </div>
      </div>
    ),
    { ...size },
  );
}
