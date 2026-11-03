# Daily public research archive

GitHub Actions `Research data archive` downloads all currently available public
samples, trade aggregates and funding every day at 03:17 UTC. It also runs on
relevant pull requests and main changes, and supports **Run workflow** manually.
No Railway configuration, credentials or strategy changes are required.

Each artifact contains a compressed snapshot and SHA-256 checksum. Every raw
API page and the coverage document have checksums in the manifest. Truncated
responses, missing expected symbol coverage and mismatched hashes fail the job.
After upload, the job downloads its artifact again and verifies the bytes.
Overlapping daily snapshots allow recovery from missed days while source rows
remain available. Source gaps are preserved, never filled with zeros.

A separate 15:17 UTC check fails if no successful main-branch archive with a
non-expired artifact exists from the preceding 36 hours. Failure is visible in
Actions; notification delivery depends on the user's GitHub notification
settings. GitHub schedules may be delayed and public-repository schedules may
be disabled after 60 days of inactivity; this is not an independent uptime monitor.

Artifacts expire after **90 days** (repository policy may impose a shorter limit).
Download them for longer retention. This is a rolling research archive, not a
permanent backup of PostgreSQL or candles. A prolonged outage beyond the source's
seven-day retention cannot be repaired by this workflow. Initial historical
completeness is not implied by passing checksum verification.

Download the artifact from its Actions run, unzip, then:

```sh
sha256sum -c research-data.sha256
tar -xzf research-data.tar.gz
python3 research/collector-archive/verify.py snapshot
```

Automatic schedules become active after this workflow is merged into main.
