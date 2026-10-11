# V6 provider and trade-history audit (2026-10-11 UTC)

## Verified production evidence

Railway deployment `69a40af8` is successful. The collector is running, and GitHub Actions for this revision are green. The V6 analysis log at 10:16 UTC reports 66 stored history observations from 4 traders and 177 open-position snapshots from 5 traders. Only 53 distinct fully closed history positions qualify; 11 history observations are partial and 2 are duplicate updates. **Do not add open snapshots or partial exits to realized trade counts.**

The 10:16 UTC ingestion attempted 10 activity requests and all 10 failed with `HTTP 429` (provider rate limit). Unique history remained at 53 fully closed positions from the 09:16 run. Repeated hourly retries without a cooldown will not improve data coverage.

The last fully available entry-classification summary covers only 13 entries with sufficiently fresh BTC/ETH/SOL candles across the traders; 11 were classified as countertrend dips and 2 as momentum. Most observations lack matching market candles. This is **descriptive, highly selected data**, not evidence that buying dips is profitable. Some copied positions last days rather than minutes, and their reported nominal PnL is not a reproducible small-account result.

## Provider safety policy

- On HTTP 429 stop subsequent requests immediately and honor `Retry-After`, using at least a two-hour pause and at most twelve hours per response.
- Avoid retry storms and reduce the request budget. Rotate at most two trader IDs per hourly cycle rather than requesting five identical traders every hour. Spread samples across the 20 observed trader IDs.
- Preserve successfully fetched first-page history when a later page is rate limited. Distinguish incomplete pagination from a complete history response.
- Record rate-limited state separately from normal source outages. Do not interpret a rate-limited response as an empty position history.
- Verify that `page` actually advances the provider's history and whether a documented cursor exists. Never assume five pages means complete history.

## Research decision

No V6 strategy has yet passed out-of-sample testing after fees, slippage, funding, and drawdown constraints. Reported trader PnL and descriptive dip/momentum counts must not be presented as trading returns. Keep live execution disabled.

## Next implementation priority

Wire `src/v6-request-policy.ts` into `src/v6.ts` with cooldown, rotating sampling and first-page preservation. Run the new policy tests and all existing checks, deploy, and inspect the next scheduled V6 cycle for reduced HTTP 429s and additional unique fully closed positions. Then test explicit entry/exit rules chronologically against a passive baseline and holdout periods.
