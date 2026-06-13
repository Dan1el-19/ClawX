# External WSL2 Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce and verify a native Windows ClawX 0.4.10 build that connects to an OpenClaw Gateway managed in WSL2.

**Architecture:** Add an explicit external-gateway target to persisted settings. Keep all transport and lifecycle decisions in Electron Main; external mode connects and reconnects WebSocket transport while skipping every local OpenClaw process-management operation.

**Tech Stack:** Electron, TypeScript, React, Zustand, Vitest, Playwright, pnpm, WSL2

---

### Task 1: Define Gateway Target And Transport

**Files:**
- Create: `electron/gateway/target.ts`
- Modify: `electron/gateway/ws-client.ts`
- Test: `tests/unit/gateway-target.test.ts`
- Test: `tests/unit/gateway-ws-client.test.ts`

- [ ] Write failing tests proving target normalization, external token selection, host-aware probe URLs, and host-aware connection URLs.
- [ ] Run `pnpm exec vitest run tests/unit/gateway-target.test.ts tests/unit/gateway-ws-client.test.ts` and verify failures are caused by missing target support.
- [ ] Implement `GatewayTarget`, normalization, token selection, and host-aware WebSocket helper arguments.
- [ ] Re-run the focused tests and verify they pass.

### Task 2: Implement External Lifecycle

**Files:**
- Modify: `electron/gateway/manager.ts`
- Test: `tests/unit/gateway-manager-external.test.ts`

- [ ] Write failing tests proving external start directly connects, stop never sends `shutdown`, and Windows socket closure schedules reconnect.
- [ ] Run `pnpm exec vitest run tests/unit/gateway-manager-external.test.ts` and verify expected failures.
- [ ] Load the target at lifecycle start and branch external lifecycle away from the local startup orchestrator and process operations.
- [ ] Re-run focused manager tests and existing gateway manager tests.

### Task 3: Persist And Edit External Settings

**Files:**
- Modify: `electron/utils/store.ts`
- Modify: `shared/host-api/contract.ts`
- Modify: `electron/services/settings-api.ts`
- Modify: `src/stores/settings.ts`
- Modify: `src/pages/Settings/index.tsx`
- Modify: `shared/i18n/locales/en/settings.json`
- Modify: `shared/i18n/locales/zh/settings.json`
- Modify: `shared/i18n/locales/ja/settings.json`
- Modify: `shared/i18n/locales/ru/settings.json`
- Test: `tests/unit/stores.test.ts`
- Test: `tests/unit/host-services.test.ts`
- Test: `tests/e2e/developer-mode.spec.ts`

- [ ] Write failing unit and E2E assertions for typed external settings and Save and Reconnect behavior.
- [ ] Run focused tests and verify the new assertions fail.
- [ ] Add settings defaults, typed contract entries, reconnect side effects, renderer state, localized controls, and test IDs.
- [ ] Re-run focused unit and E2E tests.

### Task 4: Make Control UI Target-Aware

**Files:**
- Modify: `electron/utils/openclaw-control-ui.ts`
- Modify: `electron/services/gateway-api.ts`
- Test: `tests/unit/openclaw-control-ui.test.ts`
- Test: `tests/unit/host-services.test.ts`

- [ ] Write failing tests for external host and remote-token Control UI URLs.
- [ ] Run the focused tests and verify failure.
- [ ] Pass the configured gateway target through the gateway service.
- [ ] Re-run focused tests and verify pass.

### Task 5: Add Harness And Documentation

**Files:**
- Create: `harness/specs/tasks/external-wsl2-gateway.md`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `README.ja-JP.md`

- [ ] Add a gateway-backend-communication task spec covering lifecycle ownership and transport invariants.
- [ ] Document native Windows ClawX plus WSL2 OpenClaw configuration and limitations.
- [ ] Run `pnpm harness validate --spec harness/specs/tasks/external-wsl2-gateway.md`.

### Task 6: Verify And Package

**Files:**
- Modify only when verification exposes defects.

- [ ] Run focused gateway/settings/control UI tests.
- [ ] Run `pnpm run typecheck`, `pnpm run lint:check`, and `pnpm test`.
- [ ] Run `pnpm run comms:replay`, `pnpm run comms:compare`, and the task harness.
- [ ] Run `pnpm run package:win` and verify the generated installer.
- [ ] Install the custom native Windows build.
- [ ] Configure WSL2 OpenClaw binding/token and native ClawX external settings.
- [ ] Verify packaged ClawX connects and successfully completes a Gateway health RPC.
