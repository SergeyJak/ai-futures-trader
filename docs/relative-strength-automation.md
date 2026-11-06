# Automatic relative-strength paper replay

The existing application runs the frozen replay on startup and hourly, five
minutes after the UTC boundary. On failure it retries after ten minutes. This
uses public Binance USDⓈ-M data only; it never calls order/account APIs. Existing
Bybit collectors remain separate. Selection/risk/fees and the Nov6 01UTC start
are unchanged. Recovered historical hours are paper reconstructions, not timely
exchange fills; the UI labels this explicitly.

Deployment needs the included Dockerfile (Python3 + Node22 + frozen engine).
`railway.toml` selects that Dockerfile. No new Railway service, volume, exchange
key or variable is needed: the existing DATABASE_URL stores the result.
Default is enabled. `RELATIVE_STRENGTH_ENABLED=false` disables the worker.
`RELATIVE_STRENGTH_CHECKPOINT_FILE` explicitly selects manual file mode and
disables automation; remove it to use automatic database reports.

One row in `relative_strength_forward` stores the raw source packet, both cost
scenarios and run status. A session advisory lock prevents replica overlap;
record replacement is atomic. A failed fetch/replay retains the last successful
packet and report. Restart recomputes only when a new boundary is due; it never
applies cash flows to a previously accumulated balance. Last-success time,
next attempt and failures are displayed at `/`, refreshed every minute while
visible. An infeasible basket displays its rejection reason. Stale reports remain
labelled; a pending/failed job is never evidence of fresh market coverage.

The worker has a 180-second deadline, per-request 15-second timeout, response and
output limits, incremental candle/funding pagination, and a 180-day study cap.
Cached boundary candles are refetched because they were still forming. Missing
candles/funding or changed exchange order filters fail closed. HTTP451/429/403
are surfaced without alternate-host or geographic workarounds. Running in a
European Railway region does not itself prove API availability.

For audit export, serialize the stored JSONB packet with Python
`json.dumps(packet, sort_keys=True, separators=(',', ':'), allow_nan=False)`.
Its UTF-8 SHA256 matches `checkpoint.snapshot_sha256`; use those exact bytes
with offline `replay.py --snapshot ... --sha256 ...`. JSONB key ordering therefore
does not invalidate the evidence digest. Only the latest complete raw packet is
stored; it includes the study history. The worker preserves earlier cached rows,
except the last candle of each series, which is refetched.

Verification: `npm run check` with TEST_DATABASE_URL enables PostgreSQL tests;
`python3 -m unittest discover -s research/relative-strength-forward` covers the
frozen engine and downloader. Before claiming production is running, observe
Railway SUCCESS and `/api/relative-strength`: `forward.scheduled=true`, an idle
job, non-null lastSuccess/asOf, and both scenarios. On error inspect the explicit
job message and `RELATIVE_STRENGTH_JOB_ERROR` logs. A successful offline run or
CI is not a successful production fetch.
