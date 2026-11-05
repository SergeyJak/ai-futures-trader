# Relative-strength paper test UI

Open `/relative-strength` from the main navigation. The read-only JSON endpoint is
`GET /api/relative-strength`. Historical selection results and forward results
are separate tabs; the default tab never substitutes historical profit for a
missing forward report. Both baseline and stress cost scenarios are available.

Without configuration, the forward tab shows a waiting state. To display an
actual replay, run the frozen procedure in
`research/relative-strength-forward/README.md`, then set
`RELATIVE_STRENGTH_CHECKPOINT_FILE` to the absolute path of its output JSON on the
application server. Publish the complete file with an atomic rename. In Railway,
the file must be provisioned in the service or an attached volume; a path on a
developer's computer is not accessible to the deployed application.

The reader validates timestamps, frozen start, cost scenarios, finite values,
equity consistency, symbols and events. Files over 5 MiB or invalid configured
files return HTTP 503 without leaking the local path. Reports older than 36 hours
are visibly stale. An absent configuration produces a normal empty state.

The refresh button only reads the saved report. This change does not schedule
replay, download market data, upload checkpoints, or place real orders. Merging
and deploying the UI alone therefore does not activate forward calculation.
The historical snapshot is bundled from the committed audit summary so the
production Docker image does not need the research directory.

Validation: `npm run check`. Browser QA used Chromium at 1280px and 390px with a
local fixture server importing the compiled page and normalizer. Synthetic
fixtures cover waiting, ready, stale and error states, scenario/tab switches,
chart visibility, short positions and mobile navigation; they are not trading
results. Database integration tests require their existing external setup.
