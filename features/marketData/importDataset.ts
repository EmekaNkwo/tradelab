import { formatUtcOffset, parseOhlcvCsv, parseUtcOffset, type CsvImportResult } from '../../domain/marketData/csvImport';
import { CONTRACT_INSTRUMENT_FOR_MARKET, type DatasetSummary } from '../../domain/models/marketData';
import { dataQualityError, validationError, type AppError } from '../../shared/errors';
import { err, type Result } from '../../shared/result';
import { toUtcIso } from '../../shared/time';
import type { MarketKind } from '../../shared/types';
import type { Container } from '../app';

/** Details the learner gives for an imported file (spec §30 standard instrument metadata). */
export interface ImportDetails {
  readonly symbol: string;
  readonly name: string;
  readonly market: MarketKind;
  readonly currency: string;
  /** The UTC offset ("±HH:MM") of the file's zone-less times. It is applied when the file is read; zoned times ignore it. */
  readonly utcOffset: string;
}

export const DEFAULT_UTC_OFFSET = '+00:00';

export interface PickedFile {
  readonly fileName: string;
  /** The file's text, kept so it can be read again with another UTC offset. */
  readonly text: string;
  /** The offset `result` was read with, in minutes east of UTC. */
  readonly offsetMinutes: number;
  readonly result: CsvImportResult;
}

/** Reads the file again with the learner's UTC offset, so the report and candles match what will be saved. */
export function recheck(c: Pick<Container, 'clock'>, file: PickedFile, utcOffset: string): PickedFile {
  const minutes = parseUtcOffset(utcOffset);
  if (minutes === null || minutes === file.offsetMinutes) return file;
  return { ...file, offsetMinutes: minutes, result: parseOhlcvCsv(file.text, { nowMs: c.clock.now().getTime(), utcOffsetMinutes: minutes }) };
}

/** Opens the picker and checks the file. Null when the learner cancels. */
export async function pickAndCheckCsv(c: Pick<Container, 'datasetFiles' | 'clock'>): Promise<Result<PickedFile | null, AppError>> {
  const picked = await c.datasetFiles.pickCsv();
  if (!picked.ok || picked.value === null) return picked as Result<null, AppError>;
  const text = picked.value.text;
  return { ok: true, value: { fileName: picked.value.name.slice(0, 200) || 'file.csv', text, offsetMinutes: 0, result: parseOhlcvCsv(text, { nowMs: c.clock.now().getTime(), utcOffsetMinutes: 0 }) } };
}

export function detailIssues(d: ImportDetails): readonly string[] {
  return [
    ...(d.symbol.trim().length === 0 || d.symbol.trim().length > 40 ? ['Enter the symbol (up to 40 characters)'] : []),
    ...(d.name.trim().length > 120 ? ['The name is too long'] : []),
    ...(!/^[A-Za-z]{3}$/.test(d.currency.trim()) ? ['Enter the quote currency as three letters, e.g. USD'] : []),
    ...(parseUtcOffset(d.utcOffset) === null ? ['Enter the UTC offset as ±HH:MM, for example +00:00 or -05:00'] : []),
  ];
}

/** Saves a checked file with the learner's details. Refused files are never saved. */
export async function saveImport(c: Pick<Container, 'marketData' | 'clock'>, picked: PickedFile, details: ImportDetails): Promise<Result<DatasetSummary, AppError>> {
  const issues = detailIssues(details);
  if (issues.length > 0) return err(validationError(issues[0] as string, { issues }));
  // Always save what the chosen offset gives, even if the screen showed an older reading.
  const file = recheck(c, picked, details.utcOffset);
  if (file.result.report.status === 'refused' || !file.result.report.timeframe) return err(dataQualityError('This file failed its checks and cannot be imported'));
  return c.marketData.saveImport(
    {
      origin: 'user_import',
      sourceName: 'Your file',
      fileName: file.fileName,
      symbol: details.symbol.trim(),
      name: details.name.trim() || details.symbol.trim(),
      market: details.market,
      venue: null,
      currency: details.currency.trim().toUpperCase(),
      timeZone: `UTC${formatUtcOffset(file.offsetMinutes)}`,
      timeframe: file.result.report.timeframe,
      contractInstrumentId: CONTRACT_INSTRUMENT_FOR_MARKET[details.market],
      candles: file.result.candles,
      quality: file.result.report,
    },
    toUtcIso(c.clock.now()),
  );
}
