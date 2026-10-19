# Prototype security boundaries

Do not deploy this development setup as a public grievance service. Use synthetic accounts/records until the team has reviewed access, consent, hosting and retention requirements.

Implemented controls include Argon2 password hashes, random bearer sessions stored as hashes with expiry/revocation, citizen ownership checks, GRO jurisdiction checks, backend-enforced status transitions, optimistic update versions, restricted CORS, private image routes and JPEG/PNG decoding/re-encoding. Session tokens are kept in client memory. Technical account administration does not imply grievance disposal authority.

Evidence images are processed copies: orientation is applied and EXIF metadata is removed. The prototype does not retain an unmodified forensic original or certify image authenticity. Complaint location is explicit user-provided/device data, not extracted and trusted from photo metadata.

Before internet exposure, add and test HTTPS, shared gateway rate/body limits (including chunked uploads), verified account enrolment/recovery, operational logging without sensitive content, malware/abuse handling, backup/restore, retention/deletion policy, audit access, proper S3 policy, deployment secrets and real jurisdiction/department configuration. The in-memory login limiter is only a single-process development safeguard. Storage/DB failures may require orphan-object reconciliation. A broader security/load review is still required.

## Dependency audit at initial implementation

The Python lockfile audit reported no known advisories when checked. This is time-specific, not a guarantee.

The initial npm audit reported **22 dependency paths (15 high, 7 moderate)** rooted in Expo's tooling, concerning `braces`, `node-forge` and legacy `uuid`. These are not 22 independent application vulnerabilities. Normal compatible updates did not remove the warnings. The suggested force-fix downgrades Expo to SDK 44 and is not a safe solution for this SDK 57 app. Do not run `npm audit fix --force` blindly.

Track the upstream [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), [node-forge advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv) and [uuid advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq). Avoid untrusted project inputs and keep Metro/dev tooling off public networks. Re-audit before release. Type checking and a successful bundle do not remove these risks.

Report suspected vulnerabilities privately to the repository owner rather than posting credentials, citizen information or exploit data in a public issue.
