# .ai-sync — Multi-Agent Coordination Bus

Orchestrator: Qoder main session (throne). Workers: external IDE agents.
Protocol: adapted from the user-supplied Orchestrator/Worker wave protocol.

## Rules (all agents)
1. `main` is orchestrator-only. Workers NEVER commit to main, never push to any remote.
2. Workers operate ONLY in their assigned worktree on their assigned branch.
3. Orchestrator-owned files (workers read, never edit): `.ai-sync/TASK_BOARD.md`, `.ai-sync/ARCHITECTURE.md`, `.ai-sync/tickets/*`, `task_plan.md`, `findings.md`, `progress.md`, `AGENTS.md`.
4. Worker-owned files: ONLY `.ai-sync/handoffs/<TICKET>-<worker>.md` (own ticket only) + paths in the ticket's WRITE_SCOPE.
5. Every ticket execution starts by reading: `AGENTS.md`, `docs/AGENT_KNOWLEDGE_UPDATE_2026_11.md`, the ticket file, and `findings.md`.
6. No completion claim without raw VERIFY_CMD output pasted into the handoff. No invented APIs. No weakened tests.
7. BLOCKER: after 3 failed fix attempts, STOP, revert partial changes, write root cause into the handoff, set ticket status BLOCKED in the handoff. Never hack around a failure.
8. Commits on worker branches use `git commit -s` (DCO trailer). Small logical commits.
9. Out-of-WRITE_SCOPE edits = automatic rejection at audit.
10. Fresh chat/session per ticket (no solver history bleed).

## Layout
- `TASK_BOARD.md` — live wave/ticket status (orchestrator writes).
- `tickets/<ID>-<worker>.md` — full ticket: scope, contract, acceptance, verify command.
- `handoffs/<ID>-<worker>.md` — worker's completion report + raw verify output.
- `ARCHITECTURE.md` — pointer to canonical architecture docs.

## Audit & merge (orchestrator)
On handoff: `git -C <worktree> diff --name-only main..HEAD` vs WRITE_SCOPE → run VERIFY_CMD fresh → dual-context independent review for kernel/geometry/security tickets → `git merge --no-ff` into local main → update board → `git -C <worktree> rebase main` for next ticket.