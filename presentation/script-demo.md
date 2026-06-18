# Narration script — demo-first cut (1-min intro)

**Alternate version of `script.md`.** Same deck, same demo — but the slide walk-through is compressed
to **~1:00** and almost all the time goes to the **live demonstration**. Read at ~150 wpm. Cues in
`[brackets]` are for the editor / screen, not read aloud. Timecodes are cumulative (when each part
should *start*). Slide numbers match `slides.md`.

> Use this cut when the value is in *showing*, not *telling* — judges who'd rather watch the hook fire
> than hear the architecture. For the balanced 5-act pitch, use `script.md`.

---

## ACT 1 — Presentation · ~1:00  `[screen: Reveal deck, fullscreen — move fast, one beat per slide]`

**[00:00 · Slide 1 — Title / Studio]**
**TokenLaunchHook Studio** — a studio for Uniswap v4 launch hooks. Today, one hook built on it: a
fair-launch hook. The token contract is never touched.

**[00:08 · Slide 2 — The pains]**
Every launch is a battlefield — snipers, sandwich bots, rug pulls, unfair access. All of it happens in
the *pool*.

**[00:16 · Slide 3 — Insight]**
So the fix lives in the pool: one v4 hook runs code on every swap, add and removal. Bring your own
plain ERC-20.

**[00:24 · Slide 4 — Four mechanisms]**
Four mechanisms — an anti-snipe buy cap, a decaying buy/sell tax via the dynamic LP fee, a liquidity
lock, an optional whitelist. Enable any subset.

**[00:34 · Slide 5 — Governance]**
Control is the **governance NFT** — just the deployer's own LP position, no admin key. Params only ever
get *fairer*, then freeze when the window ends.

**[00:43 · Slide 6 — Architecture]**
Four contracts, deployed once per chain. A launch is **one atomic multicall**.

**[00:49 · Slide 7 — Not just a launcher]**
And the studio doesn't just launch — every control is badged with the v4 callback it fires.

**[00:54 · Slide 8 — Status]**
**147 tests** — fuzz and mainnet-fork — live on three chains, public txs to verify. Enough slides —
let me show you.

---

## ACT 2 — Green tests · ~0:30  `[switch to terminal]`

**[01:00 · Slide 9 → terminal]**
First, proof it holds up. `[run: forge test -vvv]`

**[01:08]**
**147 tests, all green** — unit, fuzz on the tax-decay math, and mainnet-fork against live Uniswap v4.
`[let the green summary sit for a beat, then switch to browser]`

---

## ACT 3 — Live demo · ~3:30  `[browser: uhi9-token-launch-hook.vercel.app — this is the show]`

**[01:30 · Slide 10 → landing]**
The live studio. Notice up top: a **network selector** and, on every control, a **hook badge** — the
v4 callback that control fires. I'll switch to **Unichain Sepolia**. `[pick Unichain Sepolia]`

**[01:45 · /launch — the wizard]**
Let's launch a token. The wizard deploys a fresh ERC-20 for me — or I could paste an existing one,
since the token's never modified. I name it, set the supply, and pair it. `[fill name + supply]`

**[02:05 · enable mechanisms]**
Now the mechanisms. **Anti-snipe** — cap the first-window buy size; watch the badge, this one runs on
`beforeSwap`. **Tax** — an asymmetric buy/sell fee that decays to a floor; same callback, applied as the
dynamic LP fee. `[enable anti-snipe + tax, hover a HookBadge to show the explainer popover]` I'll leave
the lock and whitelist off for this run — any subset is valid.

**[02:30 · review + sign]**
Review screen shows exactly what'll be armed. I sign from a plain wallet — the hook requires
`tx.origin == msg.sender`, so no smart-wallet relay. `[sign in Rabby]`

**[02:45 · post-launch call trace]**
One transaction, done. Here's the part I care about — the **HookCallTrace**: the hook fired
`beforeAddLiquidity`, captured my LP position as the **governance NFT**, and armed anti-snipe and the
tax. Not a claim — the actual decoded call. `[scroll the trace]`

**[03:05 · /governance — live on-chain state]**
Governance. The studio discovers my campaign straight from my wallet and reads **live hook state from
chain** — current tax, the anti-snipe cap, the window. As the NFT holder I can only **relax**: I'll lower
the tax. `[lower tax → sign]` Watch — `[try to raise it]` the hook *reverts*. One-way ratchet, enforced
on-chain, not in the UI.

**[03:35 · /swap — see the mechanisms bite]**
Now trade against it. A normal buy applies the **current tax** — you can see the fee in the quote.
`[small buy → sign]` Now a buy **over the anti-snipe cap** — `[oversized amount]` — the hook **reverts**:
*buy too large*. That's the mechanism firing on a real swap, on a real chain. `[show the revert toast]`

**[04:00 · recap the live state]**
Back on governance, the panel reflects what just happened — the lowered tax, the swaps counted. Live
hook state, end to end. `[brief pause on HookActivityPanel]`

---

## CLOSE · ~0:15  `[Slide 11 — roadmap]`

**[04:50 · Slide 11 — roadmap]**
That's TokenLaunchHook Studio — fairness enforced in the pool, not the token. Next: a richer studio UI,
more hooks, and an opt-in **protocol fee** from campaign revenue. Thanks for watching.

**[05:05 · end]**

---

### Timing cushion
The intro is deliberately a single beat per slide — don't linger, the demo is the payload. If you're
long, drop the governance *relax* step and go launch → anti-snipe revert. If short, let the post-launch
**call trace** and the **revert toast** breathe — those two shots are the proof.
