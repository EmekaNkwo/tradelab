import { Notice } from '../ui';

/** Shown when a link points at price data that is no longer on this device; the screen falls back to simulated data. */
export function MissingDataNotice() {
  return (
    <Notice title="That price data is not on this device" tone="warning">
      It may have been deleted, or it was fetched data, which is not restored from backups. Simulated data is shown instead.
    </Notice>
  );
}
