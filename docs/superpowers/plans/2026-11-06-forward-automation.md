# Forward automation implementation plan

Goal: hourly saved paper replay with observable success/failure, never live orders.
Architecture: bounded public Binance downloader plus existing frozen Python engine;
Node scheduler owns a PostgreSQL advisory lock and atomically persists source
packet, checkpoint and status. API/UI reads PostgreSQL, preserving last success.
Tech: Node22, PostgreSQL, Python3 stdlib. Spec: user-authorized automatic test and
research/relative-strength-forward/README.md frozen rules.

Constraints: same eight symbols, Nov6 01UTC start, no tuning or exchange orders.
UTC hour boundary with five-minute publication delay. Retry failures in ten
minutes. One job across replicas, 180-second child deadline, maximum180day study.
HTTP451 is reported, never bypassed. Manual file override remains explicit.

Review focus: restart/repeated hour cannot double count; partial fetch cannot
replace prior good data; funding gaps fail; missing Python fails visibly; replica
lock/disconnect cannot leave a false successful report.

- [x] Downloader tests: pagination, current endpoint candle replacement, funding
  pagination, invalid/empty responses and frozen schema. Implement worker.py.
- [x] Scheduler/store tests: advisory lock, skip completed boundary, failure
  preservation, timeout/shutdown. Implement relative-strength-job.ts and worker.
- [x] Connect index/API/UI and Docker runtime; display run state, next run,
  last success/error, replay provenance. No manual extra setup after deployment.
- [ ] Run Python/Node/DB and browser checks, review complete diff, publish PR.
- [ ] After merge observe deployment and actual saved production checkpoint;
  only then report automation running. User owns merge as previously agreed.

Execution ledger: independent review found shutdown acquisition race, stale local
DB errors after recovery, and noncanonical JSONB digest. All three reproduced
by tests and fixed. PostgreSQL suite:443 tests passed. Python suite:21 passed.
Docker image build succeeded with Python3. Browser: actual public Nov6 packet replay -> saved DB -> API -> desktop/mobile
UI, and simulated HTTP451 preserving prior report. This is not production-fetch
verification. Production merge remains with the user per prior instruction.
Ruling: reuse frozen Python engine rather than translate to TypeScript, avoiding
numerical/behavior divergence; cost is adding Python3 to the application image.
