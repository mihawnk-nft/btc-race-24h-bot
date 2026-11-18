// DipBuyer bot for make.fun btc-race-24h-20261118-1444.
//
// Long-only rider of the one pattern that paid in the dev window: a sharp
// drop in cbBTC/USDC followed by a recovery. The replay is one 1-minute
// bar at a time, orders fill at the next bar's open, and a full round trip
// costs about 26 bps, so the bot only trades when the drop is big enough
// for the bounce to cover the costs, and stays out the rest of the time.
// No shorts, no leverage, at most one open position, full-size buys.
//
// Why this shape (measured on the dev window, not guessed): after a drop
// of 1.5% or more from the 20-bar high, the best 30-bar forward return,
// net of the 26 bps round trip, was above 0.3% on 10 of 10 bars
// (mean +0.4% to +1.2%); after a 1-1.5% drop it averaged +0.21%. Drops
// of 1% or less are noise: trading them lost money after costs, as did
// chasing every small breakout (38 orders, -$57). So the entry waits for
// a real drop (>=1.2% from the 30-bar high), for the fall to pause
// (the last 2 bars flat or up), and for the price to still sit within
// 0.6% of the 30-bar low. The exit rides the recovery with a 0.25%
// trailing stop, a 1.5% safety stop, a 3% take-profit (effectively off),
// and a 60-bar time stop.
//
// Last resort: if no trade has happened by bar 1320 (2 hours left), the
// bot takes the first fresh 5-bar breakout. A race entry with no trade
// ranks below every entry that traded and takes no prize, while even a
// small losing trade still ranks, so a ~26 bps noise trade is strictly
// better than sitting out. The same trailing exit caps it. It never
// fires on the dev window (the dip trade lands at bar 70).
//
// All decisions are exact bigint arithmetic on the bar closes (no floats,
// no clock, no environment, no randomness), so two runs on the same bars
// give the same orders byte for byte.

import { runBars, type BarsState, type Batch, type BuyInput, type OrderInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const MAX_SLIPPAGE_BPS = 100; // 1% past the close the order was decided on

const P = {
  dropLookback: 30, // bars for the high/low the dip is measured against
  dropBps: 120, // min drop from the 30-bar high to enter (1.20%)
  stabBars: 2, // bars over which the fall must have paused
  stabBps: 0, // min return over stabBars (0 = flat or up)
  nearLowBps: 60, // entry only within 0.60% above the 30-bar low
  trailBps: 25, // trailing stop below the peak value since entry
  tpBps: 300, // hard take-profit over entry cost (3.00%, effectively off)
  slBps: 150, // hard stop-loss under entry cost (1.50%, safety only)
  timeStop: 60, // max bars held
  resortBar: 1320, // first bar the last-resort trade may fire on
  resortBreakout: 5, // bars for the last-resort breakout
};

const closes: bigint[] = []; // raw close prices (price_scale 5)
let peakValue = 0n; // peak position value since entry (quote units)
let holdBars = 0; // bars held
let everTraded = false; // a position has been observed (a buy filled)
let resortUsed = false; // the last-resort trade was sent

function maybeExit(state: BarsState, qty: bigint, cost: bigint): OrderInput[] {
  const value = state.value(SYMBOL, qty);
  if (value > peakValue) peakValue = value;
  holdBars += 1;
  const trailHit = value * 10000n <= peakValue * (10000n - BigInt(P.trailBps));
  const tpHit = value * 10000n >= cost * (10000n + BigInt(P.tpBps));
  const slHit = value * 10000n <= cost * (10000n - BigInt(P.slBps));
  const timeHit = holdBars >= P.timeStop;
  if (trailHit || tpHit || slHit || timeHit) {
    peakValue = 0n;
    holdBars = 0;
    const sell: SellInput = { side: 'sell', symbol: SYMBOL, qty, max_slippage_bps: MAX_SLIPPAGE_BPS };
    return [sell];
  }
  return [];
}

await runBars({
  onBatch(state: BarsState, batch: Batch): OrderInput[] {
    for (const bar of batch.bars) {
      if (bar.symbol === SYMBOL) closes.push(BigInt(bar.c));
    }
    if (state.warmingUp) return [];

    const held = state.positions.get(SYMBOL);
    if (held !== undefined) {
      everTraded = true;
      return maybeExit(state, held.qty, held.cost);
    }

    const n = closes.length;
    const H = P.dropLookback;
    if (n <= H + 1) return [];
    const c = closes[n - 1]!;
    let hi = closes[n - H - 1]!;
    let low = closes[n - H - 1]!;
    for (let i = n - H; i < n; i++) {
      if (closes[i]! > hi) hi = closes[i]!;
      if (closes[i]! < low) low = closes[i]!;
    }
    const nearLow = c * 10000n <= low * (10000n + BigInt(P.nearLowBps));
    const stabClose = closes[n - 1 - P.stabBars]!;
    const dip =
      c * 10000n <= hi * (10000n - BigInt(P.dropBps)) &&
      c * 10000n >= stabClose * (10000n + BigInt(P.stabBps)) &&
      nearLow;
    if (dip) {
      peakValue = 0n;
      holdBars = 0;
      const buy: BuyInput = { side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS };
      return [buy];
    }

    // Last resort: no trade yet and late in the window.
    if (!everTraded && !resortUsed && state.seq >= P.resortBar) {
      const K = P.resortBreakout;
      let hiK = closes[n - K - 1]!;
      for (let i = n - K; i < n - 1; i++) {
        if (closes[i]! > hiK) hiK = closes[i]!;
      }
      if (c > hiK && closes[n - 2]! <= hiK) {
        resortUsed = true;
        peakValue = 0n;
        holdBars = 0;
        const buy: BuyInput = { side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS };
        return [buy];
      }
    }
    return [];
  },
});
