# ADR 0003: Content pipeline — zod as source of truth, JSON Schema generated

**Status:** accepted (Phase 1)

**Context.** The spec asks for JSON Schemas for every content type and a validation script checking schemas, answer keys, glossary links, level tags, and source references. Domain models must stay framework-free.

**Decision.** Plain TypeScript models live in `domain/models/content.ts`. Zod schemas in `data/content/schemas.ts` are checked against them with `satisfies`, so they cannot drift. `scripts/build-content.ts` generates `content/schemas/*.schema.json` (draft 2020-12) from zod and compiles a bundle into `data/content/generated/`. Cross-reference checks are plain functions (`crossReferences.ts`). Inline glossary links use `[[term-id]]` or `[[term-id|label]]`.

**Consequences.** One definition drives the TS type, runtime validation, and the published JSON Schema; a test proves every content file also passes the generated JSON Schema (ajv). A test fails if the committed bundle is stale. A disclosure statistic is rejected unless it cites a known, human-reviewed source with jurisdiction, provider, dates, and products covered.
