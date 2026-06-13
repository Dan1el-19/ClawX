---
id: external-wsl2-gateway
title: Connect native Windows ClawX to an external WSL2 OpenClaw Gateway
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Let ClawX own only the desktop client connection while OpenClaw Gateway lifecycle and data remain managed in WSL2.
touchedAreas:
  - README.md
  - README.zh-CN.md
  - README.ja-JP.md
  - docs/superpowers/**
  - harness/**
  - electron/gateway/**
  - electron/services/**
  - electron/utils/store.ts
  - electron/utils/openclaw-control-ui.ts
  - shared/**
  - src/pages/Settings/index.tsx
  - src/stores/settings.ts
  - tests/**
expectedUserBehavior:
  - Native Windows ClawX can connect to an OpenClaw Gateway running in WSL2.
  - External mode uses the configured host, port, and remote token.
  - ClawX never starts, repairs, reloads, shuts down, or terminates an external Gateway.
  - Managed mode retains existing bundled OpenClaw lifecycle behavior.
  - Control UI opens the configured external Gateway with its remote token.
requiredProfiles:
  - fast
  - comms
  - e2e
requiredRules:
  - renderer-main-boundary
  - backend-communication-boundary
  - api-client-transport-policy
  - gateway-readiness-policy
  - comms-regression
  - docs-sync
requiredTests:
  - tests/unit/gateway-target.test.ts
  - tests/unit/gateway-ws-client.test.ts
  - tests/unit/gateway-manager-external.test.ts
  - tests/unit/openclaw-control-ui.test.ts
  - tests/unit/host-services.test.ts
  - tests/e2e/developer-mode.spec.ts
  - pnpm run typecheck
  - pnpm run comms:replay
  - pnpm run comms:compare
acceptance:
  - Electron Main remains the sole owner of Gateway transport and lifecycle decisions.
  - External mode bypasses local startup orchestration and managed-process operations.
  - External stop closes only the client WebSocket and does not send the shutdown RPC.
  - Unexpected external WebSocket closure schedules reconnect on Windows.
  - Settings save the external target atomically and trigger one client reconnect.
  - WebSocket probes, main connection, and Control UI use the configured target.
docs:
  required: true
---

This task ports the intent of ClawX PR #310 to the current 0.4.10 architecture,
using an explicit external-mode flag so WSL2 localhost forwarding is supported.
