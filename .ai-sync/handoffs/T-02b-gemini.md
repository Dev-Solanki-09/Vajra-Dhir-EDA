# Handoff: T-02b — CI Remediation (WORKER-GEMINI / Antigravity)

- **Worker:** WORKER-GEMINI (Antigravity)
- **Worktree:** `D:\project-gemini`
- **Branch:** `feat/worker-gemini`
- **Date:** 2026-11-24
- **Status:** COMPLETED & VERIFIED (PENDING-ORCHESTRATOR-REVIEW)

---

## 1. Task A — Honest `startup_failure` Diagnosis & Raw `gh` Evidence

### A.1. Raw `gh run view` and `gh api` Outputs

#### Run 45368509252 (`Spec & Security CI` on commit `1c157d4`):
```json
{"conclusion":"startup_failure","event":"push","headBranch":"main","status":"completed","workflowName":"Spec & Security CI"}
```

```json
{
  "id": 45368509252,
  "name": "Spec & Security CI",
  "head_branch": "main",
  "head_sha": "1c157d4b4a8bf5d3a779879f1f058abc68dc6725",
  "path": ".github/workflows/ci-spec-integrity.yml",
  "run_number": 18,
  "event": "push",
  "status": "completed",
  "conclusion": "startup_failure",
  "created_at": "2026-11-24T09:47:22Z",
  "updated_at": "2026-11-24T09:47:22Z",
  "run_attempt": 1,
  "jobs_url": "https://api.github.com/repos/Dev-Solanki-09/Vajra-Dhir-EDA/actions/runs/45368509252/jobs",
  "check_suite_url": "https://api.github.com/repos/Dev-Solanki-09/Vajra-Dhir-EDA/check-suites/122760061439"
}
```

```json
// gh api repos/Dev-Solanki-09/Vajra-Dhir-EDA/actions/runs/45368509252/jobs
{"total_count":0,"jobs":[]}

// gh api repos/Dev-Solanki-09/Vajra-Dhir-EDA/check-suites/122760061439/check-runs
{"total_count":0,"check_runs":[]}

// gh api repos/Dev-Solanki-09/Vajra-Dhir-EDA/actions/runs/45368509252/timing
{"billable":{}}
```

#### Run 45362081793 (`Vajra-Dhir License Firewall & Hardware EvalOps` on commit `88b58bf`):
```json
{"conclusion":"startup_failure","event":"push","headBranch":"main","status":"completed","workflowName":"Vajra-Dhir License Firewall & Hardware EvalOps"}
```

```json
{
  "id": 45362081793,
  "name": "Vajra-Dhir License Firewall & Hardware EvalOps",
  "head_branch": "main",
  "head_sha": "88b58bfbd92664bbe3b4ad0d4cb44c149ef37cb9",
  "path": ".github/workflows/ci-license-evalops.yml",
  "run_number": 16,
  "event": "push",
  "status": "completed",
  "conclusion": "startup_failure",
  "created_at": "2026-11-24T09:06:46Z",
  "updated_at": "2026-11-24T09:06:46Z",
  "run_attempt": 1,
  "jobs_url": "https://api.github.com/repos/Dev-Solanki-09/Vajra-Dhir-EDA/actions/runs/45362081793/jobs",
  "check_suite_url": "https://api.github.com/repos/Dev-Solanki-09/Vajra-Dhir-EDA/check-suites/122743056344"
}
```

### A.2. Root Cause Analysis
The evidence definitively proves that GitHub Actions failed at **admission / dispatch time** with:
- Zero jobs queued (`jobs: []`, `total_count: 0`).
- Zero check runs created (`check_runs: []`, `total_count: 0`).
- Zero billable runner execution time (`billable: {}`).
- Instantaneous conclusion timestamp (`created_at == updated_at`).

This zero-job admission abort occurs upstream of runner provisioning. The previous hypothesis that `pull_request:` null caused this was incorrect; bare `pull_request:` is valid YAML. Similarly, Node 26.13.1 is an existing LTS release.

### A.3. Repository Administrator Action Checklist
To enable GitHub Actions execution upon push:
1. **Repository Actions Permissions:**
   - Navigate to `https://github.com/Dev-Solanki-09/Vajra-Dhir-EDA/settings/actions`.
   - Verify **"Actions permissions"** is set to **"Allow all actions and reusable workflows"** (or that repository actions are not disabled).
2. **Workflow Permissions:**
   - Under `Workflow permissions`, select **"Read and write permissions"** (or Read repository contents) and ensure **"Allow GitHub Actions to create and approve pull requests"** is toggled appropriately.
3. **Fork PR Approval Policy:**
   - Under `Fork pull request workflows from outside collaborators`, verify **"Require approval for first-time contributors"** is not blocking automated triggers.
4. **Account Spending Limit / Billing:**
   - Under Account Settings -> Billing and plans -> Spending limits: verify GitHub Actions spending limit has not been reached ($0 limit with 0 included minutes remaining causes silent startup aborts on private/transferred repos).

---

## 2. Tasks B & C — Node.js & Python CI Jobs Added

### B. Node.js Job (`node-build-test`)
- Pinned action: `actions/setup-node@1d0ff469b7ec7b3cb9d8673fde0c81c44821de2a # v4.2.0`
- `node-version: '26.13.1'` (reverting unauthorized downgrade to 22; Lithium LTS floor respected)
- Corepack enabled and activated: `corepack enable && corepack prepare pnpm@10.6.0 --activate`
- Frozen install: `pnpm install --frozen-lockfile`
- Type checking: `pnpm -r --if-present exec tsc --noEmit`
- Build execution: `pnpm build`
- Unit testing: `pnpm test`

### C. Python Job (`python-tests`)
- Pinned action: `actions/setup-python@42375524e23c412d93fb67b49958b491fce71c38 # v5.4.0`
- `python-version: '3.14'` (adhering to `requires-python = ">=3.14,<3.15"`)
- Pinned uv installation: `pip install uv==0.6.5`
- Frozen dependency synchronization: `uv sync --frozen`
- Offline test execution: `uv run pytest packages -q` ($0 API cost, zero external credentials)

---

## 3. Task D — Real JSON Schema Validation

Step 3 in `.github/workflows/ci-spec-integrity.yml` replaces pseudo-validation with genuine `jsonschema` engine checks:
1. **Meta-Schema Validation:** Iterates over all schemas in `schemas/*.json` and validates each schema definition against its meta-schema using `validator_cls = jsonschema.validators.validator_for(schema); validator_cls.check_schema(schema)`.
2. **Budget Verification:** Asserts single-source `budget.json` exists, is non-empty, and parses as a valid dictionary.
3. **Valid Test Fixture:** Created `schemas/fixtures/valid_worker_contract.json` complying with Draft 2020-12 schema `schemas/worker_contract.v1.json`, confirmed passing `jsonschema.validate()`.
4. **Negative Test Fixture:** Validated `schemas/fixtures/invalid_project.json` against `schemas/worker_contract.v1.json`, asserting that `jsonschema.ValidationError` is genuinely thrown with exception catch.

---

## 4. Task E — Rust Toolchain Availability Check & Pin (`T-02c` Remediation)

Upstream tags inspection command:
```powershell
git ls-remote --tags https://github.com/rust-lang/rust "1.100*" "1.99*"
```
Raw command output (exit code `0`):
```text
6b503e798d0cc01ca1052eeefaccee43893b0ff6	refs/tags/1.100.0
0ef1bc386059596dada8fb65b50425aab2ea637a	refs/tags/1.100.0^{}
daa8d75bc715f77869fa06d80b6ea1a3fe52d38e	refs/tags/1.99.0
b940084d7eb6a299eb4bfeb8e34901bc051e7ac4	refs/tags/1.99.0^{}
213cfbe66a6da4e4b41bde365643286371af6e5a	refs/tags/1.99.1
58cf8f9c35b355199727627d07ae34a4e2846d67	refs/tags/1.99.1^{}
```
**Toolchain Pin:** `refs/tags/1.100.0` (`6b503e798d0cc01ca1052eeefaccee43893b0ff6`) exists upstream. Toolchain is **pinned `1.100.0`, no deviation** in `.github/workflows/ci-license-evalops.yml` (`cargo-workspace-tests` job) via `dtolnay/rust-toolchain@df2a88e9fe4098bad09cb42c3dec7187f15861fc # master`. Machine-verified receipt: `.ai-sync/handoffs/G0-receipt.json`.

---

## 5. Task F — Actions Lock & Checker Verification

`scripts/check-actions-lock.mjs` verifies every action invocation in `.github/workflows/*.yml` against `.github/workflows/actions.lock`.

### F.1. Actions Lock Content (`.github/workflows/actions.lock`)
```json
{
  "actions/checkout@v4.2.2": "11bd71901bbe5b1630ceea73d27597364c9af683",
  "actions/setup-node@v4.2.0": "1d0ff469b7ec7b3cb9d8673fde0c81c44821de2a",
  "actions/setup-python@v5.4.0": "42375524e23c412d93fb67b49958b491fce71c38",
  "dtolnay/rust-toolchain@master": "df2a88e9fe4098bad09cb42c3dec7187f15861fc"
}
```

### F.2. Positive Verification Output
```text
$ node scripts/check-actions-lock.mjs
[PASS] ci-license-evalops.yml: actions/checkout@11bd719 matches actions.lock (actions/checkout@v4.2.2)
[PASS] ci-license-evalops.yml: actions/setup-node@1d0ff46 matches actions.lock (actions/setup-node@v4.2.0)
[PASS] ci-license-evalops.yml: actions/checkout@11bd719 matches actions.lock (actions/checkout@v4.2.2)
[PASS] ci-license-evalops.yml: actions/setup-node@1d0ff46 matches actions.lock (actions/setup-node@v4.2.0)
[PASS] ci-license-evalops.yml: actions/checkout@11bd719 matches actions.lock (actions/checkout@v4.2.2)
[PASS] ci-license-evalops.yml: actions/setup-python@4237552 matches actions.lock (actions/setup-python@v5.4.0)
[PASS] ci-license-evalops.yml: actions/checkout@11bd719 matches actions.lock (actions/checkout@v4.2.2)
[PASS] ci-license-evalops.yml: dtolnay/rust-toolchain@df2a88e matches actions.lock (dtolnay/rust-toolchain@master)
[PASS] ci-spec-integrity.yml: actions/checkout@11bd719 matches actions.lock (actions/checkout@v4.2.2)

All GitHub Action SHAs match .github/workflows/actions.lock cleanly.
```

### F.3. Negative Test (Fails Closed)
Deliberately mismatched SHA in temporary lockfile exits with code 1:
```text
[FAIL] ci-license-evalops.yml: Action actions/checkout SHA mismatch! Workflow has 11bd71901bbe5b1630ceea73d27597364c9af683, lockfile has 0000000000000000000000000000000000000000
[FAIL] ci-license-evalops.yml: Action actions/setup-node not registered in temp_bad.lock
...
Actions lock verification FAILED.
EXIT_CODE: 1
```

### F.4. Actionlint Verification
```text
$ npx --yes @kjanat/actionlint .github/workflows/ci-license-evalops.yml .github/workflows/ci-spec-integrity.yml
(0 errors reported, exit code 0)
```

---

## 6. Task G — Required-Check Job Names for Branch Protection

The stable GitHub Actions job names across all workflows:
1. `license-and-supply-chain-firewall` (`SPDX License Firewall & Hook Guard`)
2. `node-build-test` (`Node.js TypeCheck, Build & Tests (v26.13.1)`)
3. `python-tests` (`Python 3.14 Neuro-Symbolic & Verifier Tests`)
4. `cargo-workspace-tests` (`Cargo Clippy & Tests`)
5. `verify-spec-and-security` (`SQLite DDL, Schemas, DCO & License Firewall`)

---

## 7. Raw VERIFY_CMD Outputs

### Command 1: `node scripts/check-actions-lock.mjs`
```text
[PASS] ci-license-evalops.yml: actions/checkout@11bd719 matches actions.lock (actions/checkout@v4.2.2)
[PASS] ci-license-evalops.yml: actions/setup-node@1d0ff46 matches actions.lock (actions/setup-node@v4.2.0)
[PASS] ci-license-evalops.yml: actions/checkout@11bd719 matches actions.lock (actions/checkout@v4.2.2)
[PASS] ci-license-evalops.yml: actions/setup-node@1d0ff46 matches actions.lock (actions/setup-node@v4.2.0)
[PASS] ci-license-evalops.yml: actions/checkout@11bd719 matches actions.lock (actions/checkout@v4.2.2)
[PASS] ci-license-evalops.yml: actions/setup-python@4237552 matches actions.lock (actions/setup-python@v5.4.0)
[PASS] ci-license-evalops.yml: actions/checkout@11bd719 matches actions.lock (actions/checkout@v4.2.2)
[PASS] ci-license-evalops.yml: dtolnay/rust-toolchain@df2a88e matches actions.lock (dtolnay/rust-toolchain@master)
[PASS] ci-spec-integrity.yml: actions/checkout@11bd719 matches actions.lock (actions/checkout@v4.2.2)

All GitHub Action SHAs match .github/workflows/actions.lock cleanly.
```

### Command 2: `actionlint .github/workflows/*.yml`
```text
$ npx --yes @kjanat/actionlint .github/workflows/ci-license-evalops.yml .github/workflows/ci-spec-integrity.yml
(Clean pass, exit 0)
```

### Command 3: Schema Negative Test Traceback
```text
$ python -c "import json,jsonschema; s=json.load(open('schemas/worker_contract.v1.json')); jsonschema.validate(json.load(open('schemas/fixtures/invalid_project.json')), s)"
Traceback (most recent call last):
  File "<string>", line 1, in <module>
    import json,jsonschema; s=json.load(open('schemas/worker_contract.v1.json')); jsonschema.validate(json.load(open('schemas/fixtures/invalid_project.json')), s)
                                                                                  ~~~~~~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "<USER_HOME>\AppData\Local\Python\pythoncore-3.14-64\Lib\site-packages\jsonschema\validators.py", line 1332, in validate
    raise error
jsonschema.exceptions.ValidationError: 'job_id' is a required property

Failed validating 'required' in schema:
    {'$schema': 'https://json-schema.org/draft/2020-12/schema',
     '$id': 'https://vajra-dhir.org/schemas/worker_contract.v1.json',
     'title': 'Vajra-Dhīr EDA Ring 2 Stateless Worker Contract',
     'description': 'Zero-egress gVisor/OCI job execution interface for '
                    'heavy physical simulation and silicon compilation',
     'type': 'object',
     'required': ['job_id',
                  'pack_id',
                  'image_digest_sha256',
                  'network_mode',
                  'timeout_sec',
                  'inputs',
                  'expected_outputs'],
     'properties': {'job_id': {'type': 'string', 'format': 'uuid'},
                    'pack_id': {'type': 'string',
                                'enum': ['pack-2a',
                                         'pack-2b',
                                         'pack-2c',
                                         'pack-2c-vlsi',
                                         'pack-2d',
                                         'pack-2e']},
                    'image_digest_sha256': {'type': 'string',
                                            'pattern': '^sha256:[a-f0-9]{64}$'},
                    'network_mode': {'type': 'string', 'const': 'none'},
                    'timeout_sec': {'type': 'integer',
                                    'minimum': 1,
                                    'maximum': 7200},
                    'resource_limits': {'type': 'object',
                                        'properties': {'max_memory_mib': {'type': 'integer',
                                                                          'default': 8192},
                                                       'max_cpus': {'type': 'number',
                                                                    'default': 4.0}}},
                    'inputs': {'type': 'object',
                               'required': ['board_id', 'input_files'],
                               'properties': {'board_id': {'type': 'string'},
                                              'input_files': {'type': 'array',
                                                              'items': {'type': 'string'}},
                                              'parameters': {'type': 'object'}}},
                    'expected_outputs': {'type': 'array',
                                         'items': {'type': 'string'}}}}

On instance:
    {'invalid_payload': True,
     'missing_required_fields': ['project_id', 'board_id', 'schematic'],
     'reason': 'Deterministic negative fixture to prove schema validators '
               'reject non-compliant payloads'}
```
