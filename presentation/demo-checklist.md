# Live-demo pre-flight checklist (Act 3)

Do this **before** you hit record. The launch is live on-chain, so a little prep removes the timing risk.

## Wallet

- [ ] Use **Rabby** (or a MetaMask account that is a **plain EOA**, *not* an EIP-7702 "smart account").
      The launch's first mint requires `tx.origin == msg.sender`; the app blocks code-bearing accounts.
- [ ] Wallet network = **Unichain Sepolia (1301)**.
- [ ] Wallet has **enough test ETH** for ~3 txs (token deploy + approvals + launch). Top up first.
- [ ] Only one wallet extension active in the recording profile (avoids the connect dropdown clutter).

## App

- [ ] Open `https://uhi9-token-launch-hook.vercel.app/` and connect the wallet *before* recording.
- [ ] Network selector set to **Unichain Sepolia** (badge shows "live").
- [ ] Tabs pre-opened: `/launch`, `/governance`, `/swap` — so switching is instant.
- [ ] Decide the launch inputs in advance (token name/symbol, pair = native ETH, seed amounts) so you
      don't fumble fields on camera. Native-ETH pair = no Permit2 step = fewer signatures.
- [ ] Enable just **anti-snipe + tax** in the wizard (keeps the demo focused; both are visible in swap).

## Tests (Act 2)

- [ ] Run `forge test -vvv` once beforehand so the build is cached and the on-camera run is fast.
- [ ] Terminal font enlarged; window cropped to the test summary area.

## Fallbacks

- [ ] Keep a **PoolId of an already-launched campaign** handy. If the live launch stalls, paste it into
      `/governance` and `/swap` and continue the demo from there.
- [ ] If a swap won't quote, double-check you're whitelisted / past the whitelist window for that pool.

## Shot order (matches script.md Act 3)

1. Landing → network selector → pick Unichain Sepolia.
2. `/launch` → fill → enable anti-snipe + tax (point at hook badges) → Review → sign → call trace.
3. `/governance` → "Your campaigns" → live hook state → relax tax (optional).
4. `/swap` → normal buy (tax shown) → oversized buy → decoded `BuyTooLarge` revert.
