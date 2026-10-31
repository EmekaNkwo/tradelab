import { z } from 'zod';
import {
  disclosureSchema,
  glossaryEntrySchema,
  lessonSchema,
  metaTraderTaskSchema,
  psychScenarioSchema,
  companySchema,
  redFlagCaseSchema,
  marketScenarioSchema,
  comparisonDimensionSchema,
  labConceptSchema,
  strategySchema,
  traderSchema,
  challengeSchema,
  calendarEventTypeSchema,
  moduleSchema,
  programSchema,
  quizSchema,
  sourceSchema,
} from './schemas';

/** The compiled content bundle shipped inside the app (built by scripts/build-content.ts). */
export const contentBundleSchema = z
  .object({
    version: z.string(),
    hash: z.string(),
    glossary: z.array(glossaryEntrySchema),
    disclosures: z.array(disclosureSchema),
    sources: z.array(sourceSchema),
    quizzes: z.array(quizSchema),
    lessons: z.array(lessonSchema),
    mtTasks: z.array(metaTraderTaskSchema),
    psychScenarios: z.array(psychScenarioSchema),
    companies: z.array(companySchema),
    redFlagCases: z.array(redFlagCaseSchema),
    marketScenarios: z.array(marketScenarioSchema),
    marketComparison: z.array(comparisonDimensionSchema),
    labConcepts: z.array(labConceptSchema),
    strategies: z.array(strategySchema),
    traders: z.array(traderSchema),
    challenges: z.array(challengeSchema),
    calendarEvents: z.array(calendarEventTypeSchema),
    modules: z.array(moduleSchema),
    programs: z.array(programSchema),
  })
  .strict();

export type ContentBundle = z.infer<typeof contentBundleSchema>;
