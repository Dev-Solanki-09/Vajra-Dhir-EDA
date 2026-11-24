# Handoff: T-02 (WORKER-GEMINI)
- **Status:** READY_FOR_REVIEW
- **Branch:** feat/worker-gemini
- **Files Touched:**
  - `.github/workflows/ci-spec-integrity.yml` — Rewritten with full 40-char SHA pins, concurrency, workflow_dispatch, real schema validation
  - `.github/workflows/ci-license-evalops.yml` — Rewritten with full 40-char SHA pins, concurrency, workflow_dispatch, Node 22 LTS, actions.lock verification
  - `.github/workflows/actions.lock` — Verified and locked with authentic upstream Git SHAs
  - `scripts/check-actions-lock.mjs` — Automated checker script enforcing all workflow actions match actions.lock
  - `schemas/fixtures/invalid_project.json` — Negative test fixture proving schema validation rejects non-compliant payloads
  - `.ai-sync/handoffs/T-02-gemini.md` — Ticket completion report
- **Verification Commands Run:**
  1. `actionlint .github/workflows/*.yml` -> PASS (exit 0, zero syntax or schema warnings)
  2. `node scripts/check-actions-lock.mjs` -> PASS (exit 0, all 5 action references verified against actions.lock)
  3. Negative test (deliberately altered SHA in test workflow) -> PASS (exit 1, cleanly caught mismatch and failed closed)
- **Verification Result:** PASS (exit 0)
- **UI / Browser Verification:** N/A (CI workflow engineering)

---

## 1. Root Cause Diagnosis of GitHub Actions `startup_failure`

Previous runs (e.g. 45368509252 and 45362081793) failed with `startup_failure` (0 jobs executed) due to two structural issues:
1. **Invalid YAML Event Mapping:** Workflows declared `pull_request:` with no following mapping or branch list, which PyYAML and GitHub's workflow parser parse as `pull_request: null`.
2. **Missing `workflow_dispatch`:** Neither workflow could be manually triggered or dispatched via `gh workflow run`.
3. **Invalid Node Runtime Request:** `ci-license-evalops.yml` requested `node-version: 26.13.1`, which does not exist in standard GitHub hosted runner manifests.
4. **Stale/Nonexistent Action SHAs in actions.lock:** `actions/setup-node` was mapped to a nonexistent SHA (`39370e39...`), and `dtolnay/rust-toolchain` was unpinned on master.

---

## 2. Upstream Cryptographic SHA Verification

Queried directly against upstream GitHub repositories via `git ls-remote`:
- `actions/checkout@v4.2.2`: `11bd71901bbe5b1630ceea73d27597364c9af683`
- `actions/setup-node@v4.2.0`: `1d0ff469b7ec7b3cb9d8673fde0c81c44821de2a`
- `actions/setup-python@v5.4.0`: `42375524e23c412d93fb67b49958b491fce71c38`
- `dtolnay/rust-toolchain@master`: `df2a88e9fe4098bad09cb42c3dec7187f15861fc`

All workflow files now use full 40-character commit SHAs with inline version comments:
```yaml
uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
uses: actions/setup-node@1d0ff469b7ec7b3cb9d8673fde0c81c44821de2a # v4.2.0
uses: dtolnay/rust-toolchain@df2a88e9fe4098bad09cb42c3dec7187f15861fc # master
```

---

## 3. Automated Lockfile Checker (`scripts/check-actions-lock.mjs`)

Implemented standalone zero-dependency Node.js validator that:
1. Parses every `.yml`/`.yaml` in `.github/workflows/`.
2. Asserts every `uses:` statement has a 40-character hex SHA.
3. Asserts the SHA exactly matches `.github/workflows/actions.lock`.
4. Exits with non-zero code on unpinned tags (`@v4`, `@master`) or mismatched digests.

---

## 4. Stable Required-Check Job Names for Branch Protection

For repository branch protection rules on `main`, configure these exact job names:
1. `SQLite DDL, Schemas, DCO & License Firewall` (`verify-spec-and-security`) in `Spec & Security CI`
2. `SPDX License Firewall & Hook Guard` (`license-and-supply-chain-firewall`) in `Vajra-Dhir License Firewall & Hardware EvalOps`
3. `Cargo Clippy & Tests` (`cargo-workspace-tests`) in `Vajra-Dhir License Firewall & Hardware EvalOps`

---

## 5. GitHub Proof Status

- **Status:** **`PENDING-HUMAN`**
- All files are staged and verified locally.
- Per ticket contract, pushing to remote `origin` requires explicit user and orchestrator approval.
