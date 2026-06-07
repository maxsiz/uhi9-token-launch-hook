/**
 * TokenLaunchHook Studio mark: three rising emerald candlesticks (token price launch) whose base
 * sweeps into a hook (the Uniswap v4 hook). Inline SVG so it scales crisply; size via `className`.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label="TokenLaunchHook Studio" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="30" height="30" rx="8" fill="#0a0a0a" stroke="#10b981" strokeOpacity="0.45" />
      {/* candle wicks */}
      <g stroke="#34d399" strokeWidth="1.4" strokeLinecap="round">
        <line x1="9" y1="13.5" x2="9" y2="23" />
        <line x1="15.5" y1="8.5" x2="15.5" y2="22" />
        <line x1="22" y1="5" x2="22" y2="19" />
      </g>
      {/* candle bodies (rising) */}
      <g fill="#10b981">
        <rect x="7.4" y="16" width="3.2" height="6" rx="1" />
        <rect x="13.9" y="11" width="3.2" height="10" rx="1" />
        <rect x="20.4" y="7" width="3.2" height="11" rx="1" />
      </g>
      {/* hook curling off the tallest candle's base */}
      <path d="M22 19 C 23.6 24.4, 20 27, 16.5 26 C 13.4 25, 13 21.8, 15 21" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
