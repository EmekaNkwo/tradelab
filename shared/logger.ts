import { redactText, redactValue } from './redact';

/**
 * Local-only logger (spec §32A.6: no analytics). Keeps a bounded in-memory
 * buffer for the development debug screen. Never log API keys or journal text;
 * as a second line of defence every message and context is redacted
 * (`shared/redact.ts`) before it is kept or printed.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  readonly level: LogLevel;
  readonly message: string;
  readonly context?: Readonly<Record<string, unknown>>;
  readonly at: string;
}

const MAX_ENTRIES = 200;
let buffer: readonly LogEntry[] = [];

function write(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  const safeContext = context === undefined ? undefined : (redactValue(context) as Record<string, unknown>);
  const entry: LogEntry = { level, message: redactText(message), context: safeContext, at: new Date().toISOString() };
  buffer = [...buffer.slice(-(MAX_ENTRIES - 1)), entry];
  if (typeof __DEV__ !== 'undefined' && __DEV__ && level !== 'debug') {
    const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
    sink(`[${level}] ${entry.message}`, safeContext ?? '');
  }
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => write('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) => write('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => write('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => write('error', message, context),
  entries: (): readonly LogEntry[] => buffer,
  clear: (): void => {
    buffer = [];
  },
};
