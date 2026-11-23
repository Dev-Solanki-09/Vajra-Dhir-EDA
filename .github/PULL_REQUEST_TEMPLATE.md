## Description
<!-- Brief summary of changes and technical motivation -->

## Architectural Invariant Checklist
- [ ] Preserves immutable UUIDv7 and signed `i64` nanometer integer coordinates.
- [ ] Complies with Ring 1 permissive licensing (MIT / Apache-2.0 / BSD) with zero AGPL.
- [ ] Includes deterministic offline tests executing with $0 API cost and zero credentials.
- [ ] Passes `node scripts/check-spdx-firewall.mjs` and `node scripts/verify-all.mjs`.
- [ ] All commits signed off with `git commit -s` (DCO).
