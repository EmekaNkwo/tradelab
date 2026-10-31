import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { RawContentFile } from '../../data/content/validateContent';

export const ROOT = join(__dirname, '..', '..');
export const CONTENT_DIR = join(ROOT, 'content');
const NON_CONTENT_DIRS = new Set(['schemas']);

export interface ContentOnDisk {
  readonly manifest: unknown;
  readonly files: RawContentFile[];
  readonly parseErrors: string[];
}

/** Reads `content/<type>/*.json`. JSON syntax errors are reported, not thrown. */
export function readContent(dir: string = CONTENT_DIR): ContentOnDisk {
  const parseErrors: string[] = [];
  const readJson = (path: string, label: string): unknown => {
    try {
      return JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
      parseErrors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  };

  const manifest = readJson(join(dir, 'content.json'), 'content.json');
  const types = readdirSync(dir).filter((name) => statSync(join(dir, name)).isDirectory() && !NON_CONTENT_DIRS.has(name));
  const files = types.flatMap((type) =>
    readdirSync(join(dir, type))
      .filter((name) => name.endsWith('.json'))
      .map((fileName) => ({ type, fileName, json: readJson(join(dir, type, fileName), `${type}/${fileName}`) })),
  );
  return { manifest, files, parseErrors };
}
