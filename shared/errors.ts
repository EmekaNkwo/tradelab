/**
 * Application error types (spec §32A.6). Each screen maps these to a clear
 * message and a recovery action via `describeError`.
 */
export type AppErrorKind =
  | 'ValidationError'
  | 'NotFound'
  | 'DataQualityError'
  | 'ProviderUnavailable'
  | 'Timeout'
  | 'Cancelled'
  | 'StorageError';

export interface AppError {
  readonly kind: AppErrorKind;
  /** Developer-facing detail. Never shown verbatim to the learner. */
  readonly message: string;
  /** Optional field-level issues, e.g. from schema validation. */
  readonly issues?: readonly string[];
  readonly cause?: unknown;
  /** A message written for the learner (e.g. an online service's plan limit), shown instead of the generic text for the kind. */
  readonly learnerText?: string;
}

const make =
  (kind: AppErrorKind) =>
  (message: string, extra: Omit<AppError, 'kind' | 'message'> = {}): AppError => ({
    kind,
    message,
    ...extra,
  });

export const validationError = make('ValidationError');
export const notFound = make('NotFound');
export const dataQualityError = make('DataQualityError');
export const providerUnavailable = make('ProviderUnavailable');
export const timeoutError = make('Timeout');
export const cancelled = make('Cancelled');
export const storageError = make('StorageError');

/** An error whose message is written for the learner and is safe to show as it is. */
export const shownError = (kind: AppErrorKind, message: string, extra: Omit<AppError, 'kind' | 'message' | 'learnerText'> = {}): AppError => ({ kind, message, learnerText: message, ...extra });

export interface UserFacingError {
  readonly title: string;
  readonly body: string;
  readonly recovery: string;
}

const USER_FACING: Record<AppErrorKind, UserFacingError> = {
  ValidationError: {
    title: 'Something in the input is not valid',
    body: 'Some of the information could not be accepted.',
    recovery: 'Check the highlighted details and try again.',
  },
  NotFound: {
    title: 'Not found',
    body: 'We could not find what you were looking for.',
    recovery: 'Go back and choose another item.',
  },
  DataQualityError: {
    title: 'This data has a problem',
    body: 'The file or data set is damaged, incomplete, or in an unexpected format.',
    recovery: 'Try a different file, or create a fresh one.',
  },
  ProviderUnavailable: {
    title: 'Service unavailable',
    body: 'This optional online feature could not be reached. Everything offline still works.',
    recovery: 'Check your connection and try again later.',
  },
  Timeout: {
    title: 'This took too long',
    body: 'The operation did not finish in time.',
    recovery: 'Try again. If it keeps happening, restart the app.',
  },
  Cancelled: {
    title: 'Cancelled',
    body: 'The operation was cancelled. Nothing was changed.',
    recovery: 'Start it again when you are ready.',
  },
  StorageError: {
    title: 'Could not save or read your data',
    body: 'The app could not access its storage on this device.',
    recovery: 'Make sure the device has free space, then try again.',
  },
};

export function describeError(error: AppError): UserFacingError {
  return USER_FACING[error.kind];
}

/** Wraps an unknown thrown value (from a third-party API) into an AppError. */
export function fromUnknown(kind: AppErrorKind, context: string, cause: unknown): AppError {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return { kind, message: `${context}: ${detail}`, cause };
}

/**
 * Text for the learner. Validation messages are written for the learner and
 * shown as they are; any other error is described by its kind, so storage or
 * library detail never reaches the screen.
 */
export function errorText(error: AppError): string {
  if (error.kind === 'ValidationError') return error.message;
  if (error.learnerText) return error.learnerText;
  const view = describeError(error);
  return `${view.body} ${view.recovery}`;
}
