# GrievanceGrid engineering guardrails

## Truth rules

- Keep a citizen complaint separate from a confirmed incident. Candidate links need an officer decision, a rationale, and a reversible audit trail.
- Never fabricate AI output, accuracy, authenticity verdicts, priority scores, deadlines, coordinates, or municipal integrations. Show only real analysis states and route unavailable analysis to manual review.
- All four supported categories remain available for manual reporting. Waterlogging is Pilot and manholes are Experimental for image suggestions.
- Officers, not models, approve category, priority, routing, incident linking, field outcomes, and closure. Work completion never closes a linked complaint automatically.
- Explain priority using a versioned rule rubric, its known inputs, missing information, configured deadline, and confirming officer. This is not an emergency-dispatch system.
- Label demo data persistently. Maps, charts, and counts state whether they represent reports or confirmed incidents. Mark hotspots Exploratory with parameters and the low-reporting caveat.
- Do not expose voice reporting, generated-image detection, automatic issue span extraction, learned priority, forecasting, GNNs, performance ratings, pgvector, or government-system integrations.

## Isolation architecture

- `apps/web` and `apps/mobile` are independent products. They may share pure TypeScript/data only through packages, never UI components.
- `packages/core` and `packages/tokens` must not import browser globals, `react-dom`, `react-native`, or `expo-*`.
- Each app owns its routes, UI primitives, state wiring, error boundaries, environment template, and tests. Role features are separated and lazy loaded.
- Backend authorisation is authoritative. Client role guards only improve the experience and must handle 401/403 safely.

## Engineering rules

- Use strict TypeScript. Do not hide errors with blanket disables or unchecked types.
- Use design tokens and the message catalogue for colours, spacing, typography, and user-visible strings.
- Every visible control has a working outcome. Build explicit loading, empty, error, offline, and success states.
- Provide semantic accessibility, visible focus, keyboard operation, ≥44px/pt targets, safe evidence handling, and no colour-only status.
- Keep data truthful, avoid client secrets and personal-data logging, and record decisions and verification evidence in `docs/`.
