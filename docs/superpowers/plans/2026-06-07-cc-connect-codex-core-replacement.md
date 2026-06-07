# cc-connect + Codex Core Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make cc-connect runtime mode provide working ClawX GUI chat, sessions, history, and supported provider/model selection through Codex without OpenClaw Gateway.

**Architecture:** Add a focused Codex CLI bridge under `electron/runtime`, then delegate cc-connect provider chat/session/history/delete calls to it. Convert supported ClawX provider/model accounts into a managed Codex launch profile. Keep renderer and host API contracts stable.

**Tech Stack:** Electron main process, TypeScript, Node child_process, JSONL transcript files, Vitest.

---

### Task 1: Codex CLI Bridge

**Files:**
- Create: `electron/runtime/codex-cli-bridge.ts`
- Test: `tests/unit/codex-cli-bridge.test.ts`

- [ ] Create a bridge that accepts `sessionKey`, `message`, `media`, and `workDir`.
- [ ] Persist user and assistant messages to managed JSONL transcript files.
- [ ] Spawn `codex exec --json -C <workDir> <prompt>`.
- [ ] Extract assistant final text from tolerant JSONL parsing.
- [ ] Return `runId` and stored assistant message.
- [ ] Unit test success, malformed JSONL tolerance, and non-zero exit.

### Task 2: Provider Integration

**Files:**
- Modify: `electron/runtime/cc-connect-provider.ts`
- Modify: `electron/runtime/types.ts`
- Test: `tests/unit/cc-connect-runtime-provider.test.ts`

- [ ] Instantiate `CodexCliBridge` in `CcConnectRuntimeProvider`.
- [ ] Route `sendMessageWithMedia` to the bridge.
- [ ] Route `listSessions`, `loadHistory`, and `deleteSession` to the bridge.
- [ ] Emit `chat:message` after assistant messages are stored.
- [ ] Update cc-connect capabilities for core replacement coverage.
- [ ] Unit test provider-level send/history/delete behavior.

### Task 2A: Provider/Model Profile Integration

**Files:**
- Create: `electron/runtime/cc-connect-provider-profile.ts`
- Modify: `electron/runtime/codex-cli-bridge.ts`
- Modify: `electron/services/providers-api.ts`
- Test: `tests/unit/cc-connect-provider-profile.test.ts`
- Test: `tests/unit/host-services.test.ts`

- [ ] Convert OpenAI/Codex accounts into `codex exec --model <model>` plus process-only `OPENAI_API_KEY` env when available.
- [ ] Convert Ollama accounts into `codex exec --oss --local-provider ollama --model <model>`.
- [ ] Write a managed `provider-profile.json` without secret values.
- [ ] Dispatch providers Host API sync through `RuntimeManager` when cc-connect is active.
- [ ] Return stable unsupported errors for other provider types without mutating OpenClaw config.

### Task 3: Doctor and Logs

**Files:**
- Modify: `electron/runtime/codex-cli-bridge.ts`
- Modify: `electron/runtime/cc-connect-provider.ts`
- Test: `tests/unit/cc-connect-runtime-provider.test.ts`

- [ ] Add `codex --version` diagnostic helper.
- [ ] Include Codex diagnostic output in cc-connect runtime Doctor result.
- [ ] Add runtime logs for Codex command attempts and managed transcript paths.
- [ ] Unit test Doctor output includes Codex diagnostics.

### Task 4: Documentation and Delivery Artifacts

**Files:**
- Create: `.delivery/runs/cc-connect-codex-core-replacement/requirements.md`
- Create: `.delivery/runs/cc-connect-codex-core-replacement/plan.md`
- Create: `.delivery/runs/cc-connect-codex-core-replacement/verification.md`
- Create: `.delivery/runs/cc-connect-codex-core-replacement/delivery-report.md`
- Modify: `docs/runtime-abstraction-cc-connect.md`

- [ ] Record G1 through G8 status with evidence.
- [ ] Update runtime abstraction docs to point to the replacement design.
- [ ] Keep release readiness gaps explicit.

### Task 5: Validation

**Files:**
- Existing test files only unless fixes are required.

- [ ] Run `pnpm exec vitest run tests/unit/codex-cli-bridge.test.ts tests/unit/cc-connect-runtime-provider.test.ts tests/unit/cc-connect-provider-profile.test.ts tests/unit/runtime-manager.test.ts`.
- [ ] Run `pnpm run typecheck`.
- [ ] Run `pnpm run build:vite && pnpm exec playwright test tests/e2e/cc-connect-codex-runtime.spec.ts tests/e2e/settings-runtime-selector.spec.ts`.
- [ ] Run `pnpm run comms:replay && pnpm run comms:compare`.
- [ ] Run `git diff --check`.
- [ ] Run focused sensitive-information scan over changed files.
