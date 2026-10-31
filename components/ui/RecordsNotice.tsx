import { errorText, type AppError } from '../../shared/errors';
import { Notice } from './Notice';

interface QueryLike {
  readonly status: string;
  readonly error?: AppError;
}

/**
 * For screens whose content is bundled but which also show the learner's own records (scores, bookmarks):
 * when those records fail to load, say so instead of quietly showing "not tried yet".
 */
export function RecordsNotice({ queries }: { readonly queries: readonly QueryLike[] }) {
  const failed = queries.find((q) => q.status === 'error');
  if (!failed) return null;
  return (
    <Notice title="Your saved results could not be loaded" tone="warning">
      {`${failed.error ? errorText(failed.error) : 'Something went wrong.'} The lessons and exercises still work; your records will show again once they load.`}
    </Notice>
  );
}
