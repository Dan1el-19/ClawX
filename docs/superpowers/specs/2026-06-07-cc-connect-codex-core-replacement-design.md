# cc-connect + Codex Core Replacement Design

## Status

Approved by user on 2026-06-07.

## Design

ClawX will treat `cc-connect` runtime mode as a mixed provider. The GUI chat/session/history loop is powered directly by Codex CLI, while cc-connect remains responsible for managed runtime packaging, Doctor, channel bridge, cron, provider CLI integration, and future management API integration. Supported provider/model settings are converted into a ClawX-managed Codex launch profile. OpenAI OAuth uses a managed `CODEX_HOME` under app userData and must not depend on user `~/.codex`.

The first implementation slice adds a `CodexCliBridge` owned by `CcConnectRuntimeProvider`. The bridge runs `codex exec --json`, captures the final assistant text, applies supported provider/model launch args, and persists a ClawX-owned transcript under `app userData/runtimes/cc-connect/codex-sessions/`. The runtime provider returns existing host API envelopes so renderer entry points do not change.

## Components

- `electron/runtime/codex-cli-bridge.ts`: isolated Codex execution, JSONL parsing, transcript persistence, and session listing.
- `electron/runtime/cc-connect-provider-profile.ts`: converts OpenAI API key, OpenAI OAuth/Codex, and Ollama provider accounts into safe Codex launch profiles.
- `electron/runtime/cc-connect-provider.ts`: delegates chat/session/history/delete to the bridge and keeps cc-connect binary/Doctor ownership.
- `electron/runtime/types.ts`: capability matrix reflects real cc-connect/Codex core coverage.
- `tests/unit/codex-cli-bridge.test.ts`: bridge parsing and persistence tests.
- `tests/unit/cc-connect-runtime-provider.test.ts`: provider-level replacement behavior tests.

## Data Flow

1. Renderer calls `hostApi.chat.sendWithMedia`.
2. `createChatApi` calls `runtimeManager.getActiveProvider().sendMessageWithMedia`.
3. In cc-connect mode, provider appends the user message to managed transcript.
4. `CcConnectRuntimeProvider` syncs the active provider/model into `provider-profile.json`; OpenAI OAuth also writes managed `codex-home/auth.json`.
5. `CodexCliBridge` runs `codex exec --json -C <workDir> <provider args> <prompt>`.
6. Bridge extracts the assistant final text from JSONL events and stores it.
7. Provider emits a runtime chat message event and returns a run id.
8. Session/history APIs read the managed transcript.

## Error Handling

- Missing Codex binary returns a stable runtime error and a Doctor diagnostic.
- Codex non-zero exit stores a system error message in the transcript and returns a failed send result.
- Malformed JSONL lines are retained in logs but do not crash parsing.
- Media attachments are converted into prompt references in the first slice; image passthrough can be added after Codex media behavior is verified.
- Unsupported provider accounts fail with a stable message before spawning Codex, and do not write OpenClaw config.

## Testing

- Mock child process spawn for successful Codex output.
- Mock non-zero Codex exit and malformed output.
- Verify transcript JSONL shape and session metadata.
- Verify provider `listSessions`, `loadHistory`, and `deleteSession`.
- Verify OpenAI API key, OpenAI OAuth, and Ollama provider profile conversion and E2E Codex launch args/env.
- Re-run focused runtime tests, typecheck, and comms checks before delivery.
