# ADR 0001: `di/` composition root

**Status:** accepted (Phase 1)

**Context.** The spec says the DI container is created in `app/_layout.tsx` and provides repository implementations, but also that `app/` must not import `data/`. Both cannot hold literally.

**Decision.** A top-level `di/` folder is the only place allowed to import concrete `data/` and `integrations/` implementations. `app/_layout.tsx` calls `di/bootstrap` and passes the resulting `Container` to `ContainerProvider`. ESLint allows `di/` imports only from `app/_layout.tsx`.

**Consequences.** Features depend on interfaces (`data/index.ts`) and receive implementations through the container; tests build the same container over Node SQLite. Device-only modules (expo-file-system, expo-sqlite) are injected into `bootstrapCore` so it stays testable in Node.
