# Implementation boundary

## 2026-10-17 — autonomous defaults and verification prerequisites

- Use the existing Next.js and Expo stacks. The repository already matches the implementation blueprint, so no framework migration is justified.
- Use English, a simulated municipality, and a mock API adapter until real FastAPI credentials and reachability are supplied. Any external authentication destination belongs only in an environment variable.
- Adopt pnpm workspaces and Turborepo as required by the master specification. Local packages use `workspace:*`; a registry lookup for local source is a configuration defect.
- Phase 0 cannot be marked complete until registry installation produces a lockfile and the defined checks execute. The project checkout currently has no Git metadata, so no requested commit history can be created.

## 2026-10-17 — review deck conflicts

- The first-review deck describes planned voice reporting, issue-span extraction, evidence authenticity or synthetic-risk flags, learned response coverage, officer performance ratings, pgvector, GNNs, and learned priority-related analysis. The later master specification and revised blueprint explicitly remove these from scope. The master specification's truth rules prevail; the application will not expose or imply those features.
- The deck uses a broader multi-issue model. The current revised scope preserves individual complaints and supports a second manually entered concern, while officers confirm any subsequent issue or incident structure. This avoids claiming automated issue extraction.

The 16 October 2026 revised blueprint is the planning basis. This repository starts with the manual workflow rather than the earlier, broader presentation proposal.

- Supported reporting categories: road damage, garbage accumulation, road waterlogging and missing/broken manhole covers.
- One **simulated municipality**, clearly labelled until the team confirms a real jurisdiction and department directory.
- English-first; Android-first device testing.
- Public registration creates citizens only. Officer accounts are provisioned locally by an authorised operator.
- Citizens see only their own complaints. GRO review is restricted to its configured jurisdiction. Technical administration alone does not grant grievance disposal authority.
- Photographs are useful but never worth unsafe collection. Missing evidence goes to manual review; it does not prevent registration.
- Preserve the complaint and tracking ID before any later AI analysis. AI is explicitly disabled, not simulated.
- Initial priority rules, image classification, incident matching, maps and hotspot experiments follow the working manual lifecycle and reviewed data. Do not describe them as implemented yet.
- Incident matching is the planned research comparison: text alone versus text plus category/location/time, on reviewed same/different incident pairs.
- No automatic closure, AI-generated-image verdict, world-first claim or claim of replacing CPGRAMS.

## Why this structure

A modular FastAPI application gives both clients the same permissions and status rules. PostgreSQL/PostGIS is the intended shared database. SQLite is allowed for isolated tests and a lightweight local API demo only; it is not a replacement for PostGIS. Local private-file storage is a development adapter; private S3-compatible storage is the deployment path.

No raw datasets or earlier PDF/PPT submissions are copied into this repository. The image-colorization style is followed through short, meaningful commits, not invented history or backdated commits.
