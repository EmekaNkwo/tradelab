import Ajv2020 from 'ajv/dist/2020';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readContent, CONTENT_DIR } from '../../../scripts/lib/readContent';
import { createContentRepository, loadBundledContent, parseContentBundle } from '../contentLoader';
import { validateContent } from '../validateContent';
import generated from '../generated/contentBundle.json';

describe('shipped content', () => {
  const disk = readContent();
  const validation = validateContent(disk.manifest, disk.files);

  it('has no JSON syntax or validation errors', () => {
    expect(disk.parseErrors).toEqual([]);
    expect(validation.issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('generated bundle is up to date with content/ (run npm run content:build)', () => {
    expect(generated.hash).toBe(validation.bundle?.hash);
  });

  it('every content file satisfies its generated JSON Schema', () => {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    for (const file of disk.files) {
      const schema = JSON.parse(readFileSync(join(CONTENT_DIR, 'schemas', `${file.type}.schema.json`), 'utf8'));
      const validate = ajv.compile(schema);
      expect({ file: `${file.type}/${file.fileName}`, valid: validate(file.json), errors: validate.errors ?? null }).toEqual({
        file: `${file.type}/${file.fileName}`,
        valid: true,
        errors: null,
      });
    }
  });

  it('carries no statistics in disclosures until a human-reviewed source is added', () => {
    for (const d of validation.bundle?.disclosures ?? []) expect(d.statistics).toEqual([]);
  });

  it('has a first-launch risk disclosure', () => {
    const repo = loadBundledContent();
    expect(repo.ok).toBe(true);
    if (!repo.ok) return;
    const firstLaunch = repo.value.disclosuresFor('first_launch');
    expect(firstLaunch.length).toBeGreaterThan(0);
    expect(firstLaunch[0]?.body.join(' ')).toMatch(/can lose money/);
    expect(repo.value.disclosuresFor('futures')[0]?.body.join(' ')).toMatch(/larger than the margin/);
  });
});

describe('contentLoader', () => {
  it('rejects a corrupt bundle with a DataQualityError', () => {
    const result = parseContentBundle({ version: '1', glossary: 'nope' });
    expect(!result.ok && result.error.kind).toBe('DataQualityError');
  });

  it('looks up and sorts glossary terms', () => {
    const parsed = parseContentBundle(generated);
    if (!parsed.ok) throw new Error('bundle invalid');
    const repo = createContentRepository(parsed.value);
    expect(repo.glossaryEntry('pip')?.term).toBe('Pip');
    expect(repo.glossaryEntry('missing')).toBeNull();
    const terms = repo.glossary().map((g) => g.term);
    expect(terms).toEqual([...terms].sort((a, b) => a.localeCompare(b)));
    expect(repo.counts().glossary).toBe(terms.length);
  });
});
