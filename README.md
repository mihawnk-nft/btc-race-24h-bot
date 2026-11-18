# DipBuyer — a cbBTC dip-recovery bot for make.fun

[![make.fun · btc-race-24h-20261118-1444](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/mihawnk-nft/btc-race-24h-bot/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444/leaderboard)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/mihawnk-nft/btc-race-24h-bot/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444)

Entry for **["Race a BTC trading bot live for 24 hours"](https://make.fun/bounty/btc-race-24h-20261118-1444)** (pot $250, free). The bot trades cbBTC/USDC (Orca Whirlpool) in a 1-minute-bar replay, long only, no leverage, starting from 1,000 paper USDC.

## Strategy

**Buy the sharp dip, ride the bounce, get out fast.** A full round trip costs about 26 bps (4 bps fee + 2 bps slippage + price impact each way), so the bot only trades when the move is big enough to pay for itself — and stays in cash the rest of the time.

- **Entry:** the close has dropped **≥1.2% from the 30-bar high**, the fall has paused (last 2 bars flat or up), and the price still sits **within 0.6% of the 30-bar low**. Full-size buy (all cash).
- **Exit:** a **0.25% trailing stop** below the peak position value since entry, a **1.5% safety stop**, a **3% take-profit** (effectively off), and a **60-bar time stop**.
- **Last resort:** if no trade has happened by bar 1320 (2 hours left), the bot takes the first fresh 5-bar breakout. A race entry with no trade ranks below every entry that traded and takes no prize, while even a small losing trade still ranks — so a ~26 bps noise trade is strictly better than sitting out. The same trailing exit caps it. It never fires on the dev window.

## Why this shape

Measured on the dev window (1,440 1-minute bars, BTC 65,083 → 63,261, −2.80%), not guessed:

- After a drop of **≥1.5%** from the 20-bar high, the best 30-bar forward return, net of the 26 bps round trip, was **above +0.3% on 10 of 10 bars** (mean +0.4% to +1.2%). After a 1–1.5% drop it averaged +0.21%.
- Drops of **≤1% are noise**: trading them lost money after costs, as did chasing every small breakout (38 orders, −$57) and every EMA cross (−$148).
- The whole dev profit comes from **one trade**: buy at bar 70, after the −2.6% drop to 63,366, sell at bar 87 at 64,140 — the recovery from the day's biggest dip.

## Local grade (dev window)

```
net PnL   9.949510 USDC  (return 0.009949510)
trading   2 trades, win rate 1.000, max drawdown 0.004343, sharpe 0.028865, 0 rejected
fees      0.804142 USDC; at 2x fees net PnL 9.142734 USDC
guardrails met (trades ok, symbols ok, drawdown ok)
L1 regrade reproduced byte for byte
```

The gate needs net PnL > 0; this passes with a healthy margin, and it still passes at 2× fees. Neighbouring parameters (±20% on every value) all stay positive (+$6.18 to +$9.95), so the result is a plateau, not a tuned spike. Determinism is verified: the grader's L1 regrade reproduced the action log byte for byte.

## How to grade locally

You need the competition kit (download it from the bounty page) and Node 22+:

```sh
node cli/makefun.mjs grade-local --kit <kit-dir> --bot <this-repo> --driver process
```

The kit's `grade-local` runs the bot twice on the dev window and checks that the two action logs are byte-identical.

## Files

- `main.ts` — the bot (TypeScript, erasable syntax, Node 22). All decisions are exact `bigint` arithmetic on the bar closes: no floats, no clock, no environment, no randomness.
- `vendor/makefun-bars.ts` — byte-identical copy of the kit's SDK shim (excluded from authorship).
- `.makefun/owner.json` — claim file naming the payout wallet.
- `LICENSE` — MIT.

## Risks

- **One-trade dev result.** The dev profit is a single round trip on the day's biggest dip. If the race window has no ≥1.2% drop, the bot only makes its last-resort trade and likely ends slightly negative — but still ranked, and prizes go to the top 10 even when some are below zero.
- **A drop that keeps dropping.** If a ≥1.2% dip is followed by further falls instead of a bounce, the 1.5% safety stop caps the loss at roughly −$15–$18 on that trade.
- **Overfitting.** The entry threshold was chosen from the dev window's own dip/recovery structure. The ±20% neighbourhood check and the oracle analysis (10/10 bars after a ≥1.5% drop) argue the pattern is structural — sharp 1-minute drops in cbBTC mean-revert — rather than a single lucky bar, but the race window is unseen data and the edge may not repeat.
