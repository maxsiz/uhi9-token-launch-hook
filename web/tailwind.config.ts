import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Per-hook-callback accent colors used by HookBadge (the demo layer).
        hook: {
          add: "#22c55e", // _beforeAddLiquidity  (green)
          swap: "#3b82f6", // _beforeSwap          (blue)
          after: "#a855f7", // _afterSwap          (purple)
          remove: "#ef4444", // _beforeRemoveLiquidity (red)
        },
      },
    },
  },
  plugins: [],
};

export default config;
