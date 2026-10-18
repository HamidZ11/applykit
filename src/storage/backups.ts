import { storage } from 'wxt/utils/storage';

/**
 * Copies of stored data that could not be read, kept before the data is
 * replaced: a list under `key`, oldest first, so a second failure never
 * overwrites the first copy.
 */

interface Backup {
  /** When it was backed up; null for a backup kept by an earlier format. */
  backedUpAt: string | null;
  data: unknown;
}

function isBackup(value: unknown): value is Backup {
  return (
    typeof value === 'object' &&
    value !== null &&
    'backedUpAt' in value &&
    'data' in value
  );
}

/** Adds a copy of unreadable data to the backups, keeping every earlier one. */
export async function keepBackup(
  key: `local:${string}`,
  data: unknown,
  now: Date,
): Promise<void> {
  const current = await storage.getItem<unknown>(key);
  const backups: Backup[] =
    current === null
      ? []
      : Array.isArray(current) && current.every(isBackup)
        ? current
        : [{ backedUpAt: null, data: current }];
  await storage.setItem(key, [
    ...backups,
    { backedUpAt: now.toISOString(), data },
  ]);
}

/**
 * The new data, with anything this version does not know (fields of the
 * stored object, entries of its `inner` object) kept as it was.
 */
export function keepingUnknown<T extends object>(
  existing: unknown,
  saved: T,
  inner: keyof T & string,
): unknown {
  const stored = existing as Record<string, unknown>;
  const storedInner = stored[inner] as Record<string, unknown> | undefined;
  return {
    ...stored,
    ...saved,
    [inner]: { ...storedInner, ...(saved[inner] as object) },
  };
}
