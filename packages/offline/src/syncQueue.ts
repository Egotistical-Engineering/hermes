import { db } from './db';
import type { SyncQueueEntry } from './types';

const MAX_ATTEMPTS = 5;

/**
 * Enqueue a sync operation. Coalesces: if an entry for the same table+record
 * already exists, update it instead of creating a duplicate.
 */
export async function enqueue(
  table: SyncQueueEntry['table'],
  recordId: string,
  operation: SyncQueueEntry['operation'],
): Promise<void> {
  // Coalesce: check for existing entry
  const existing = await db.syncQueue
    .where('[table+recordId]')
    .equals([table, recordId])
    .first();

  if (existing) {
    // Update the existing entry with the latest operation
    await db.syncQueue.update(existing.id!, {
      operation,
      createdAt: new Date().toISOString(),
      attempts: 0,
    });
  } else {
    await db.syncQueue.add({
      table,
      recordId,
      operation,
      createdAt: new Date().toISOString(),
      attempts: 0,
    });
  }
}

/**
 * Get all pending queue entries, ordered by creation time.
 * Skips entries that have exceeded max attempts.
 */
export async function getPendingEntries(): Promise<SyncQueueEntry[]> {
  const all = await db.syncQueue.orderBy('id').toArray();
  return all.filter((e) => e.attempts < MAX_ATTEMPTS);
}

/** Increment attempt counter for a failed entry */
export async function incrementAttempts(id: number): Promise<void> {
  const entry = await db.syncQueue.get(id);
  if (entry) {
    await db.syncQueue.update(id, { attempts: entry.attempts + 1 });
  }
}

/** Remove a queue entry after successful sync */
export async function removeEntry(id: number): Promise<void> {
  await db.syncQueue.delete(id);
}

/** Process all pending queue entries with a given handler */
export async function processQueue(
  handler: (entry: SyncQueueEntry) => Promise<boolean>,
): Promise<{ processed: number; failed: number }> {
  const entries = await getPendingEntries();
  let processed = 0;
  let failed = 0;

  for (const entry of entries) {
    try {
      const success = await handler(entry);
      if (success) {
        await removeEntry(entry.id!);
        processed++;
      } else {
        await incrementAttempts(entry.id!);
        failed++;
      }
    } catch {
      await incrementAttempts(entry.id!);
      failed++;
    }
  }

  return { processed, failed };
}
