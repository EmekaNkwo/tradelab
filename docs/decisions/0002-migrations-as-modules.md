# ADR 0002: Migrations as TypeScript modules with checksums

**Status:** accepted (Phase 1)

**Context.** The spec sketches `migrations/0001_init.sql`. Metro does not bundle `.sql` files without extra asset plumbing, and raw assets would need async loading before the database opens.

**Decision.** Each migration is `data/db/migrations/NNNN_name.ts` exporting `{ version, name, sql }`. The runner applies pending migrations in order, each in its own transaction, and stores an FNV-1a checksum in `migration_log`.

**Consequences.** SQL stays plain text inside the module. Editing an applied migration is detected and refused at startup (fix forward with a new migration). A database newer than the app is refused rather than corrupted.
