# Progress

## Phase 0 — verification harness

**Status:** Blocked — package registry installation incomplete

**Current slice:** Repository governance, workspace conversion, and repeatable checks.

**Acceptance criteria:** pnpm workspace; strict type, lint, test, build, guard, E2E, accessibility, responsive, and dependency checks; evidence log; truthful `NOT RUN` reporting.

**Assumptions:** simulated municipality; English-only interface; mock API while FastAPI is unavailable; existing Next.js web stack retained; authentication redirect is configured only through an environment variable.

**Blockers:** The supplied checkout has no `.git` directory, no installed Node dependencies, and no `pnpm-lock.yaml`. Small commits cannot be created until a Git repository is supplied or initialised by the project owner. The first package install exposed invalid `*` references to the local API package; these now use `workspace:*`. A repeated elevated `pnpm install` began fetching but did not complete and left no `node_modules` or lockfile; later package-manager activity again produced registry `EACCES` errors.

**Next step:** Restore package-registry access, rerun `pnpm install`, then execute and document baseline checks.
