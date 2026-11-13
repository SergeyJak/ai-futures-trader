# Railway background workload and database migration

Legacy background experiments are disabled by default. Set
`LEGACY_BACKGROUND_JOBS_ENABLED=true` only to deliberately resume them.
This pauses original/shadow/experimental paper strategies, SOL variants,
V3–V8 research loops, OKX discovery, legacy reports and 90-day history scans.
Existing tables, trades and API access remain. Archived positions are frozen,
not closed; resuming is not equivalent to an uninterrupted forward test.

The current relative-strength paper job, market stream, research-data collectors,
recent candle repair and storage monitoring remain active. Full candle statistics
are logged every 15 minutes instead of every minute. On startup verify
`BACKGROUND_MODE` has `legacyJobsEnabled:false`, and verify a fresh successful
relative-strength hourly run. Compare CPU/RAM over 24 hours with the previous
period; savings are not guaranteed by a configuration change alone.

## PostgreSQL region move

Observed on 2026-11-13: application in `europe-west4-drams3a`, PostgreSQL and its
5-GB volume in `sfo`; volume usage approximately 0.8 GB. Move the existing
PostgreSQL service to the application's European region, keeping its volume,
private hostname, credentials and service identity. This reduces geographic
latency; it does not by itself guarantee lower billing.

1. Merge/deploy the background workload change and verify healthy collection.
2. In Railway volume Backups, create a manual backup and verify completion.
   The connected Railway tool cannot create or inspect backups. Do not detach
   or delete the existing volume or create an empty replacement database.
3. Record database size, candle counts/latest timestamps and current paper
   report/status. Schedule a maintenance window outside the hourly paper run.
4. Change the PostgreSQL service region to `europe-west4-drams3a`, one replica.
   Railway migrates the attached volume; the database is unavailable during
   copying. Duration depends on platform migration time, not just database size.
5. Wait for deployment and database readiness. Confirm both service and volume
   are in the target region, application reconnects, table counts are preserved,
   latest candles advance and the current paper report remains available.
6. Check research-data coverage during downtime. Recent candle repair can recover
   candles, but missed order-book observations cannot be reconstructed; retain
   explicit gaps. Verify the next successful hourly paper run.
7. If migration fails, inspect Railway migration status before further changes.
   Use Railway support/backup restore as appropriate; never initialize over the
   original volume. Keep the backup until post-migration checks pass.

Reference: https://docs.railway.com/deployments/regions#volumes
