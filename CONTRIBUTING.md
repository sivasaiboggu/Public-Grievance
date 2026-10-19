# Working together

Use the setup instructions in README.md. Never commit `.env`, passwords, real citizen information, raw datasets, images or trained weights.

1. Pull the latest `main` before starting.
2. Create a branch for one task, for example `mobile-location` or `officer-queue`.
3. Keep commits small and use short names: `add location picker`, `test status rules`, `fix upload retry`.
4. Run the relevant checks and open a pull request. Another teammate should review permissions and API changes.
5. Merge after checks pass. Do not force-push shared history.

Suggested workstreams are mobile, website, backend/workflow and data/ML. Assign people within the team; no names are assigned automatically here.

Changes to complaint categories, labels, authority, priority rules or AI scope should update `docs/decisions.md` and be discussed with the guide. Adding an interface label is not evidence that a feature is implemented or evaluated.
