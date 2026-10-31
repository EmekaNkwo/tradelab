/**
 * Tiny table-change event bus. Repositories announce writes; feature hooks
 * re-query when a table they read from changes (spec §32A.4: the database is
 * the source of truth).
 */
import { logger } from '../../shared/logger';

export type ChangeListener = (tables: readonly string[]) => void;

export interface ChangeBus {
  emit(tables: readonly string[]): void;
  subscribe(tables: readonly string[], listener: ChangeListener): () => void;
}

export function createChangeBus(): ChangeBus {
  let listeners: readonly { tables: readonly string[]; listener: ChangeListener }[] = [];

  return {
    emit(tables) {
      for (const entry of listeners) {
        if (!entry.tables.some((t) => tables.includes(t))) continue;
        try {
          entry.listener(tables);
        } catch (error) {
          // One faulty subscriber must not stop the others from refreshing.
          logger.error('Change listener failed', { tables: tables.join(','), error: String(error) });
        }
      }
    },
    subscribe(tables, listener) {
      const entry = { tables, listener };
      listeners = [...listeners, entry];
      return () => {
        listeners = listeners.filter((e) => e !== entry);
      };
    },
  };
}
