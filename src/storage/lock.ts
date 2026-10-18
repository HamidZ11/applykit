/**
 * Runs `task` while holding a lock shared by every ApplyKit page, so a
 * check-then-write save cannot interleave with a save in another tab.
 * `storage.local` has no transactions; the Web Locks API (one lock manager
 * per extension origin) provides the exclusion. Where it is missing, the
 * check still runs, but two saves at the same moment could both pass it.
 */
export async function withLock<T>(
  name: string,
  task: () => Promise<T>,
): Promise<T> {
  // Missing in some environments, whatever the DOM typings say.
  const locks: LockManager | undefined = (
    globalThis.navigator as Navigator | undefined
  )?.locks;
  return locks ? locks.request(name, task) : task();
}
