# Narration script — 1-minute landing intro (no deck)

**No slides.** You stand on the **live landing page** (`uhi9-token-launch-hook.vercel.app`) and give a
~60-second spoken intro, then move straight into the demo. Read at ~150 wpm — the body below is ~150
words, i.e. about a minute if you don't rush. Cues in `[brackets]` are actions, not read aloud.

> Use this cut when there's no time for a deck — a booth, a quick judging round, a screen-share where
> the app *is* the slide. For the full demo walk-through after the intro, follow Act 3 of
> [`script-demo.md`](./script-demo.md).

---

## The intro · ~1:00  `[on the landing page, app already open]`

This is **TokenLaunchHook Studio** — what you're looking at is the live app. It's a studio for Uniswap
**v4 launch hooks**, and the first hook built on it is a **fair-launch hook**.

The problem: every token launch gets hit by the same things — snipers grab the first block, sandwich
bots tax early buyers, teams pull liquidity, access isn't fair. All of that happens in the **pool**, not
the token. So instead of baking anti-bot code into the ERC-20, we put the rules in **one v4 hook** that
runs on every swap, add and removal. Your token stays a plain ERC-20.

The hook gives you four mechanisms — an **anti-snipe** cap, a decaying **buy/sell tax**, a **liquidity
lock**, and an optional **whitelist** — enable any subset per launch. And control is just your LP
position as a **governance NFT**: no admin key, and you can only ever make the rules *fairer*.

That's the idea — let me show you it running. `[go to /launch]`

---

## Then → demo

Hand off into the live demo. The compact flow:

1. **`/launch`** — fresh ERC-20, enable anti-snipe + tax (point at the **hook badges**), sign from a
   plain wallet → show the **HookCallTrace** capturing the governance NFT.
2. **`/governance`** — lower the tax (allowed); try to raise it → hook **reverts** (one-way ratchet).
3. **`/swap`** — a normal buy applies the tax; an oversized buy → hook **reverts** *buy too large*.

Full timed version: Act 3 of `script-demo.md`.

---

### If you have only 30 seconds
Cut to the spine: *"Fair-launch rules for token pools, enforced by a Uniswap v4 hook instead of the
token — anti-snipe, tax, lock, whitelist, governed by your own LP NFT. Here it is live."* → straight to
`/launch`.
