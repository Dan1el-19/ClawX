---
id: runtime-abstraction-cc-connect
title: Add runtime abstraction and packaged cc-connect runtime support
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Introduce a runtime abstraction so ClawX can keep OpenClaw as the default runtime while exposing cc-connect as an optional packaged runtime.
touchedAreas:
  - README.md
  - README.zh-CN.md
  - README.ja-JP.md
  - docs/**
  - harness/specs/tasks/runtime-abstraction-cc-connect.md
  - electron/gateway/**
  - electron/main/**
  - electron/services/**
  - electron/main/ipc/**
  - electron/runtime/**
  - electron/shared/providers/**
  - electron/utils/**
  - src/lib/host-api.ts
  - src/stores/settings.ts
  - src/pages/Settings/index.tsx
  - shared/host-api/contract.ts
  - shared/i18n/locales/*/settings.json
  - shared/types/gateway.ts
  - scripts/**
  - tests/e2e/**
  - tests/fixtures/**
  - tests/unit/**
  - electron-builder.yml
  - package.json
  - pnpm-lock.yaml
expectedUserBehavior:
  - OpenClaw remains the default runtime and existing Gateway UI keeps working.
  - Settings exposes a runtime selector with OpenClaw and cc-connect choices.
  - cc-connect can be selected without writing to the user's global ~/.cc-connect directory.
  - Packaged builds contain the cc-connect executable for the target platform.
requiredProfiles:
  - fast
  - comms
requiredTests:
  - tests/unit/runtime-manager.test.ts
  - tests/unit/cc-connect-runtime-provider.test.ts
  - tests/unit/cc-connect-provider-profile.test.ts
  - tests/unit/codex-cli-bridge.test.ts
  - tests/unit/cc-connect-bundle.test.ts
  - tests/unit/host-api-facade.test.ts
acceptance:
  - Renderer does not add direct IPC calls.
  - Renderer does not fetch Gateway or cc-connect HTTP endpoints directly.
  - OpenClaw-specific features are capability-aware when cc-connect is selected.
  - cc-connect packaging does not rely on runtime postinstall downloads.
docs:
  required: true
---

Runtime abstraction work must preserve the existing renderer/Main boundary. The first cc-connect adapter can expose unsupported capability results for features that do not have a stable cc-connect API yet, but the runtime selector, packaged binary resolver, managed config directory, and OpenClaw compatibility path must be implemented in the same delivery.
