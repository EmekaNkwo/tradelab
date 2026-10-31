import { fnv1a } from '../../shared/hash';
import { applyAttributionGate, type WithheldItem } from './attributionGate';
import type { ContentBundle } from './bundle';
import { checkCrossReferences, type ContentIssue } from './crossReferences';
import { CONTENT_SCHEMAS, CONTENT_TYPES, contentManifestSchema, type ContentType } from './schemas';

export type { ContentIssue } from './crossReferences';

/** One JSON file from `content/<type>/<id>.json`. Filesystem-free so it can be unit tested. */
export interface RawContentFile {
  readonly type: string;
  readonly fileName: string;
  readonly json: unknown;
}

export interface ContentValidation {
  /** The bundle to ship: after the attribution gate, so it never holds unreviewed attributed content. */
  readonly bundle: ContentBundle | null;
  readonly issues: readonly ContentIssue[];
  /** Content left out by the attribution gate until a person reviews it (spec §15.1). */
  readonly withheld: readonly WithheldItem[];
}

const emptyItems = (): Record<ContentType, unknown[]> =>
  Object.fromEntries(CONTENT_TYPES.map((t) => [t, []])) as unknown as Record<ContentType, unknown[]>;

function isContentType(type: string): type is ContentType {
  return (CONTENT_TYPES as string[]).includes(type);
}

function parseFiles(files: readonly RawContentFile[]): { items: Record<ContentType, unknown[]>; issues: ContentIssue[] } {
  const items = emptyItems();
  const issues: ContentIssue[] = [];
  const seen = new Map<string, string>();

  for (const file of [...files].sort((a, b) => `${a.type}/${a.fileName}`.localeCompare(`${b.type}/${b.fileName}`))) {
    const path = `${file.type}/${file.fileName}`;
    if (!isContentType(file.type)) {
      issues.push({ severity: 'error', file: path, message: `unknown content type folder "${file.type}"` });
      continue;
    }
    const parsed = CONTENT_SCHEMAS[file.type].safeParse(file.json);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        issues.push({ severity: 'error', file: path, message: `${issue.path.join('.') || '(root)'}: ${issue.message}` });
      }
      continue;
    }
    const { id } = parsed.data;
    if (file.fileName !== `${id}.json`) {
      issues.push({ severity: 'error', file: path, message: `file name must be "${id}.json"` });
    }
    const key = `${file.type}:${id}`;
    if (seen.has(key)) {
      issues.push({ severity: 'error', file: path, message: `duplicate id "${id}" (also in ${seen.get(key)})` });
      continue;
    }
    seen.set(key, path);
    items[file.type].push(parsed.data);
  }
  return { items, issues };
}

/**
 * Validates all content: schemas, file naming, unique ids, answer keys,
 * glossary links, level tags, and source references (spec §9.2).
 * A bundle is produced only when there are no errors (warnings are allowed).
 */
export function validateContent(manifestJson: unknown, files: readonly RawContentFile[]): ContentValidation {
  const manifest = contentManifestSchema.safeParse(manifestJson);
  const manifestIssues: ContentIssue[] = manifest.success
    ? []
    : manifest.error.issues.map((i) => ({ severity: 'error' as const, file: 'content.json', message: i.message }));

  const { items, issues: parseIssues } = parseFiles(files);
  const draft = { ...(items as unknown as Omit<ContentBundle, 'version' | 'hash'>) };
  const version = manifest.success ? manifest.data.version : '0.0.0';
  const all: ContentBundle = { version, hash: '', ...draft };
  const issues = [...manifestIssues, ...parseIssues, ...checkCrossReferences(all)];

  const { bundle: gated, withheld } = applyAttributionGate(all);
  // What ships must still hold together once withheld content is gone.
  const known = new Set(issues.map((i) => `${i.file}|${i.message}`));
  const afterGate = checkCrossReferences(gated)
    .filter((i) => i.severity === 'error' && !known.has(`${i.file}|${i.message}`))
    .map((i) => ({ ...i, message: `${i.message} (after withholding unreviewed content)` }));
  const allIssues = [...issues, ...afterGate];
  // JSON.stringify drops the undefined hash, so this hashes { version, ...content } as before.
  const bundle: ContentBundle = { ...gated, hash: fnv1a(JSON.stringify({ ...gated, hash: undefined })) };

  return { bundle: allIssues.some((i) => i.severity === 'error') ? null : bundle, issues: allIssues, withheld };
}
