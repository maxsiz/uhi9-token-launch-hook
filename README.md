# TokenLaunchHook — Coding Spec

V4 hook attached to a newly launched token's pool. Enforces fair-launch rules (anti-snipe, dynamic LP fee tax, conditional liquidity lock, whitelist phase) without modifying the ERC-20 token contract. Single hook deployment per chain serves all launches.

## Current state  - deep testing & debug