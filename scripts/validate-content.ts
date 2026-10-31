/* Validates everything under content/. Exits non-zero on any error. */
import { validateContent } from '../data/content/validateContent';
import { readContent } from './lib/readContent';

const { manifest, files, parseErrors } = readContent();
const { bundle, issues, withheld } = validateContent(manifest, files);

for (const message of parseErrors) console.error(`ERROR   ${message}`);
for (const issue of issues) {
  const line = `${issue.severity === 'error' ? 'ERROR  ' : 'WARNING'} ${issue.file}: ${issue.message}`;
  (issue.severity === 'error' ? console.error : console.warn)(line);
}

if (parseErrors.length > 0 || !bundle) {
  console.error(`\nContent validation failed.`);
  process.exit(1);
}
for (const w of withheld) console.warn(`WITHHELD ${w.type}/${w.id}: ${w.reason}`);
const counts = (['glossary', 'disclosures', 'sources', 'lessons', 'quizzes', 'modules', 'programs', 'mtTasks', 'psychScenarios', 'companies', 'redFlagCases', 'marketScenarios', 'marketComparison', 'labConcepts', 'strategies', 'traders', 'challenges', 'calendarEvents'] as const)
  .map((k) => `${bundle[k].length} ${k}`)
  .join(', ');
console.info(`Content ${bundle.version} (${bundle.hash}) is valid: ${counts}${withheld.length > 0 ? `; ${withheld.length} item(s) withheld until human review` : ''}.`);
