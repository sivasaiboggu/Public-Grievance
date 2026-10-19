# GrievanceGrid implementation specification

This repository follows the supplied **GrievanceGrid Codex Master Prompt v2**, Dataset Audit, Revised Implementation Blueprint, and First-Review deck. The full source copies are retained by the project owner; this in-repository control document records the binding implementation requirements.

Build two independent applications: a mobile-first Expo/React Native app for citizens and field officers, and a responsive Next.js web app for citizens and officers. Share only pure contracts, validation, lifecycle logic, fixtures, and design-token data. Use English, a simulated municipality, mock API adapters while the FastAPI service is unreachable, and an environment-configured authentication URL.

The supported reporting categories are visible road damage, garbage dumping, road waterlogging, and missing or broken manhole covers. A citizen retains an individual complaint record even if officers link its confirmed issue to a shared incident. Manual reporting always remains possible. AI only provides transparent, versioned suggestions where validated; it never makes a decision or an authenticity claim.

Follow six phases in order: foundation/isolation; citizen journey; officer workspace; field workflow; senior dashboard/maps; hardening. Every changed screen must support loading, empty, error, offline, and success states, be responsive from 320px through 2560px in light and dark themes, and have real verification evidence.

`AGENTS.md` defines the binding truth, isolation, and engineering rules. The Blueprint is the source of truth for records, roles, workflow, and data-science limits. The Dataset Audit controls any claims about available data. The review deck informs presentation and terminology only; it cannot override either document.
