# SDD ledger — plan: docs/superpowers/plans/2026-11-01-research-market-data.md

Isolated materialized checkout of upstream main e38113004b566f405eec64396cf9be3cede721a7 at /workspace/ai-futures-trader-collector. Local baseline commit 48dc836. No repository AGENTS.md found. Existing remote research PR remains separate.

Execution: inline, chosen under the user's delegation of implementation choices; no new permission requests for routine reversible work. A fresh final reviewer will inspect the complete diff.

Pre-flight: Tasks 2/3 consume row types from Task 1; Task 4 consumes all three. Interfaces will be defined in the store/state modules before runtime integration. No conflicting requirements found.

Scope: deliver a complete deployable PR, not merge/deploy automatically; latest user explicitly requested a PR for their deployment.

Ruling: use a dedicated research pg pool (max 2, statement timeout 5s, query timeout 6s) instead of sharing the existing pool — isolates slow collection and shutdown from strategy/candle work — costs up to two additional database connections.

Baseline: npm run check passed, 108 test files, TypeScript build passed.
Task 1: complete — missing-module RED observed; research store test file GREEN; npm run build passed. Schema, idempotent parameterized writes, bounded retention and explicit missing-coverage reporting implemented.
Task 2: complete — missing-module RED observed; all 5 funding cases GREEN in direct node:test execution; TypeScript build passed. Pagination cap, duplicate pages, signed rates, provider errors and abort propagation covered.
Task 3: complete — RED→GREEN for snapshot/delta/restart/reconnect, missing delta side, stale ticker, duplicate/late/buffer-bounded trades; 10 cases GREEN, TypeScript build passed.
Ruling: request 120 days of funding rather than the initial 30 — the existing historical strategy window starts in July and October should be covered immediately — up to five pages per symbol still bounds traffic; dense histories explicitly remain incomplete at the cap.
Task 4: complete — runtime/API cases RED→GREEN, all 114 test files and TypeScript build passed; separate PostgreSQL 16 schema/write/read/retention integration passed. State updated to 120-day funding lookback, signed rates and individual ticker freshness. Original candle/paper route semantics preserved.

Review preparation: public data only, one socket, bounded jobs/queries, 7-day sample/trade retention, 730-day rates, explicit assumed fees. No new dependencies or strategy edits. Deployment is user merge to existing Railway main branch.

Fresh final review: /tmp/collector-final-review.md, read-only reviewer, baseline 48dc836 through 1fc6b97. No strategy/order scope violations or critical findings. Two important findings and one coverage-contract finding entered one fix pass.
Final: fixed unbounded pg connection/acquisition — real TCP blackhole startup test RED (>8s)→GREEN (~5s); pool now has connectionTimeoutMillis=5000. Late schema completion after stop is also covered RED→GREEN.
Final: fixed forgotten bucket loss on capacity recovery — separate dedup-boundary and pending-bucket cases RED→GREEN; one bounded per-symbol loss watermark retains incomplete quality without manufacturing zero buckets.
Final: fixed duplicate funding completeness — exact duplicate fixture RED→GREEN; repeated settlements remain deduplicated and explicitly incomplete.
Final: Ruling: grade duplicate funding coverage as Important for this research contract despite reviewer Minor — callers rely on completeness and the agreed docs promise repeated-record visibility — no financial row inflation, but incorrect quality could invalidate subsequent research.
Final: Ruling: review excludes live deployment — user explicitly merges the PR for automatic Railway deployment — data availability remains unverified until that deployment.
Final: Ruling: profitability/account fee verification and orders remain outside this collector PR — public feeds cannot establish account/VIP cash flows — API keeps those limitations explicit.
Final: Ruling: no full tick archive, reconnect trade backfill or claim of lossless exchange delivery — bounded samples/aggregates and explicit gaps are the agreed scope — downstream users must not infer queue position or exact fills.
Final: Ruling: unrelated HTTP/security/formatting changes stay out — preserves existing behavior and review scope — those pre-existing areas are not revalidated by this PR.

Final verification: npm run check with TEST_DATABASE_URL against local PostgreSQL 16 passed, 416 tests / 0 failures, after the single review fix pass. Dedicated regressions: 12 microstructure, 7 funding, 9 lifecycle, 2 PostgreSQL cases; original API/store checks also green. git diff --check clean. No open review findings remain after regression-verified fixes; no second reviewer pass was substituted for test evidence.
