# Hackathon video — presentation materials

A 5-minute pitch video for **TokenLaunchHook Studio**. Structure: **① presentation → ② green tests →
③ live web demo.** You narrate over the screen recording.

## Files

| File | What it is |
|---|---|
| `index.html` | Reveal.js deck host (loads `slides.md`, CDN — no build step). |
| `slides.md` | The slides, in Reveal markdown. Speaker notes live in `Note:` blocks. |
| `script.md` | The full English narration, timed in 3 acts, with on-screen cues. |
| `demo-checklist.md` | Pre-flight checklist for the live launch in Act 3. |
| `diagrams/*.mmd` | Mermaid sources for the technical diagrams. |
| `diagrams/*.svg` | Pre-rendered static SVGs embedded in the slides (no runtime Mermaid dep). |
| `render-diagrams.mjs` | Renders every `*.mmd` → `*.svg` via mermaid.ink (dark theme, bg `#191919`). |

## Diagrams

Slides carry the technical story as **infographics**, not bullet-dupes of the narration. Diagrams are
authored in Mermaid (`diagrams/*.mmd`) and pre-rendered to **static SVG** so the deck stays a zero-build,
CDN-only page with no runtime Mermaid dependency. Embed with `<img class="diagram" src="diagrams/x.svg">`
(modifiers: `wide`, `tall`, `compact`). After editing a `.mmd`, regenerate:

```bash
node render-diagrams.mjs   # needs network (mermaid.ink); rewrites diagrams/*.svg
```

## Run the deck

The deck loads `slides.md` over `fetch`, so it must be served over **http://**, not opened as a
`file://` path.

```bash
cd presentation
python3 -m http.server 8000
# open http://localhost:8000/
```

Reveal shortcuts: **`S`** speaker notes (shows `script.md` beats + next slide + timer), **`F`**
fullscreen, **`Esc`** slide overview, **`←/→`** navigate.

## Recording tips

- Record at **1080p**; present the deck **fullscreen** (`F`).
- Hide unrelated browser extensions / bookmarks bar; bump the **terminal font** size for Act 2.
- Run `forge test` once *before* recording so the build is cached and Act 2 finishes fast.
- For Act 3, follow `demo-checklist.md` — and keep a fallback PoolId of an already-launched campaign in
  case the live launch hiccups.
- The whole thing is ~750 spoken words; rehearse once against the timecodes in `script.md`.

## Editing the slides

Edit `slides.md` — `---` on its own line starts a new slide, `Note:` starts speaker notes. No rebuild;
just refresh the browser.
