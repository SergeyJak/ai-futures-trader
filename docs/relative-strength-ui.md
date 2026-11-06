# Relative-strength paper test UI

Open `/` (or `/relative-strength`). The navigation contains only the current
paper test and `/data-status` for collector coverage. Retired strategy screens,
old finance summaries, market overlays and research progress screens redirect
to `/`, including bookmarked query strings. Their stored evidence, research APIs
and background jobs remain unchanged; this is a UI cleanup, not strategy shutdown.
 The read-only JSON endpoint is
`GET /api/relative-strength`. Historical selection results and forward results
are separate tabs; the default tab never substitutes historical profit for a
missing forward report. Both baseline and stress cost scenarios are available.

Automatic deployment behavior is documented in [relative-strength-automation.md](relative-strength-automation.md).
The normal source is the saved PostgreSQL report. The page shows scheduler
state, last success, next attempt and errors, and refreshes once per minute.
A rejected basket explains why the account stayed flat.

For offline/manual review, RELATIVE_STRENGTH_CHECKPOINT_FILE selects a server-local
JSON output and disables automatic calculations. The reader validates frozen
start, timestamps, symbols, costs and equity. Invalid files return503; absent
reports never fall back to historical profits. Reports older than36hours are
marked stale. The refresh button reads reports without triggering trades.
