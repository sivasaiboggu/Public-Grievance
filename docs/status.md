# First implementation status

## Included

The initial citizen-to-GRO path, React Native app, Next.js website, shared API/types, explicit migrations, optional private photographs, tracking/history and permission tests. All four categories can be registered for manual review; this does not imply a trained model for each category.

## Verification boundary

- Local API workflow tests: passed on isolated SQLite, with the PostGIS-only test skipped when no PostgreSQL test URL is provided.
- Shared API-client tests and both TypeScript checks: passed.
- Next.js production build: passed.
- Expo SDK dependency compatibility and Android Metro export: passed. No physical Android/emulator execution is claimed.
- PostgreSQL/PostGIS in GitHub Actions: **24 API/spatial tests passed**, including the migrated geography column and the same citizen/GRO workflow. The first successful source snapshot is `754464c`; [verified run](https://github.com/MK00315/GrievanceGrid/actions/runs/38791237020).
- Browser end-to-end checks: **2 passed locally and in CI**. These cover separate citizen/officer browser sessions and a phone-width sign-in layout. The final QA correction keeps the list status in sync when refreshing an open record.
- Shared-client tests: **6 passed**. Both TypeScript checks, Next.js production build and the Android Metro bundle passed locally and in CI at the initial verified source snapshot. See the [latest checks](https://github.com/MK00315/GrievanceGrid/actions) for subsequent commits.
- Python dependency audit: no known advisories reported. Expo tooling has unresolved dependency warnings described in SECURITY.md.
- Live S3, Docker Compose startup, real-device permissions, TLS/hosting, backup recovery, load testing and real municipal use: not yet verified.

## Next implementation boundary

1. Confirm municipality, team deadline/resources and the four-category scope with the guide.
2. Complete manual department assignment/work orders, field evidence, responses and independent appeals. Current status notes are not a complete appeal subsystem.
3. Collect and independently review a local data pilot. Do not download public training datasets again without a selected preparation task.
4. Add image baselines and uncertain/disabled states, followed by reviewed incident-matching candidates.
5. Add explainable priority rules, officer overrides and report-versus-incident maps; only train/evaluate later models when suitable labels exist.

The main planned research comparison remains incident matching with text alone versus text/category/location/time. The interface currently provides no AI judgement, automatic duplicate merge or learned priority score.
