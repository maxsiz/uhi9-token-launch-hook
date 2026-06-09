/**
 * Render every presentation/diagrams/*.mmd (Mermaid source) to a static *.svg via mermaid.ink, so the
 * deck has NO runtime dependency on Mermaid — the committed SVGs are plain images. Re-run after editing
 * a .mmd. Requires network (mermaid.ink). Dark theme + bg #191919 to match the Reveal "black" theme.
 *
 * Run:  node presentation/render-diagrams.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "diagrams");
const MERMAID = {
  theme: "dark",
  themeVariables: {
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    fontSize: "24px", // larger so text stays legible after the SVG is scaled to fit a slide
    lineColor: "#34d399",
    primaryColor: "#0b3b2e",
    primaryBorderColor: "#10b981",
    primaryTextColor: "#e5e7eb",
  },
  flowchart: { curve: "basis", htmlLabels: true, useMaxWidth: true, padding: 14 },
  // Sequence diagrams have their own font knobs — bump them all (the architecture slide was tiny).
  sequence: { actorFontSize: 20, messageFontSize: 19, noteFontSize: 18, actorMargin: 55, useMaxWidth: true },
};

const files = readdirSync(DIR).filter((f) => f.endsWith(".mmd")).sort();
if (!files.length) throw new Error(`no .mmd files in ${DIR}`);

for (const f of files) {
  const code = readFileSync(join(DIR, f), "utf8");
  const b64 = Buffer.from(JSON.stringify({ code, mermaid: MERMAID })).toString("base64");
  const url = `https://mermaid.ink/svg/${b64}?bgColor=191919`;
  const res = await fetch(url);
  const body = await res.text();
  if (!res.ok || !body.includes("<svg")) {
    console.error(`✗ ${f}: HTTP ${res.status}\n${body.slice(0, 300)}`);
    process.exit(1);
  }
  const out = join(DIR, basename(f, ".mmd") + ".svg");
  writeFileSync(out, body);
  console.log(`✓ ${f} → ${basename(out)}  (${body.length} bytes)`);
}
console.log(`\nrendered ${files.length} diagram(s).`);
