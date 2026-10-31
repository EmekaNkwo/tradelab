/*
 * Compiles content/ into the bundle the app ships with and regenerates the
 * JSON Schemas in content/schemas/. Refuses to write if validation fails.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { CONTENT_SCHEMAS, contentManifestSchema } from '../data/content/schemas';
import { validateContent } from '../data/content/validateContent';
import { CONTENT_DIR, readContent, ROOT } from './lib/readContent';

export const BUNDLE_PATH = join(ROOT, 'data', 'content', 'generated', 'contentBundle.json');

const { manifest, files, parseErrors } = readContent();
const { bundle, issues, withheld } = validateContent(manifest, files);
const errors = [...parseErrors, ...issues.filter((i) => i.severity === 'error').map((i) => `${i.file}: ${i.message}`)];
if (errors.length > 0 || !bundle) {
  console.error(`Not building: ${errors.length} content error(s). Run npm run content:validate.`);
  process.exit(1);
}

mkdirSync(join(ROOT, 'data', 'content', 'generated'), { recursive: true });
writeFileSync(BUNDLE_PATH, `${JSON.stringify(bundle, null, 2)}\n`);

const schemaDir = join(CONTENT_DIR, 'schemas');
mkdirSync(schemaDir, { recursive: true });
const schemas = { ...CONTENT_SCHEMAS, manifest: contentManifestSchema };
for (const [name, schema] of Object.entries(schemas)) {
  const jsonSchema = { title: `TradeLab ${name}`, ...z.toJSONSchema(schema, { target: 'draft-2020-12' }) };
  writeFileSync(join(schemaDir, `${name}.schema.json`), `${JSON.stringify(jsonSchema, null, 2)}\n`);
}
for (const w of withheld) console.warn(`Withheld until human review: ${w.type}/${w.id} (${w.reason})`);
console.info(`Built content ${bundle.version} (${bundle.hash}) and ${Object.keys(schemas).length} JSON Schemas.`);
