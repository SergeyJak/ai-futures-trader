export function createJobTracker(onError: (error: unknown) => void) {
  const active = new Set<Promise<void>>();
  let draining = false;
  function run(task: () => Promise<unknown> | unknown): boolean {
    if (draining) return false;
    const pending: Promise<void> = Promise.resolve().then(task).then(
      () => {},
      error => { try { onError(error); } catch { /* Ignore logger failure. */ } },
    );
    active.add(pending);
    void pending.then(() => { active.delete(pending); });
    return true;
  }
  async function drain(): Promise<void> {
    draining = true;
    while (active.size > 0) await Promise.allSettled([...active]);
  }
  return { run, drain, get activeCount() { return active.size; } };
}
