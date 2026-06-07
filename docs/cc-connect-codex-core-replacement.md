# cc-connect + Codex Core Replacement

## Status

Status: approved for implementation

This document upgrades the runtime abstraction work from "cc-connect is selectable" to "cc-connect + Codex can replace OpenClaw core GUI functionality." OpenClaw remains the fallback runtime, but cc-connect mode must no longer be a mostly unsupported stub.

## Goal

When `cc-connect` is selected as the runtime, ClawX should provide a working core loop without OpenClaw Gateway:

- GUI chat sends prompts to Codex.
- Sessions and history are stored under ClawX-managed app data.
- Runtime status, logs, and Doctor are runtime-aware.
- Provider, cron, and channel surfaces degrade through cc-connect capability checks instead of writing OpenClaw config.

## Accepted Architecture

ClawX uses a mixed replacement provider:

- ClawX directly drives Codex for GUI chat, session creation, and history.
- cc-connect owns channel/messaging bridge, provider/cron CLI integration, Doctor, managed config, logs, and packaged binary lifecycle.
- ClawX converts supported provider/model settings into a managed Codex launch profile for cc-connect mode.
- `RuntimeManager` remains the boundary exposed to host services.

```mermaid
flowchart LR
  UI["Renderer host-api/api-client"] --> Host["Host Services"]
  Host --> RuntimeManager["RuntimeManager"]
  RuntimeManager --> Provider["CcConnectRuntimeProvider"]
  Provider --> CodexBridge["CodexCliBridge"]
  Provider --> Store["ClawX managed transcripts"]
  Provider --> CcCli["cc-connect CLI / managed config"]
  CodexBridge --> Codex["codex exec --json"]
```

## Why Not Route GUI Chat Through cc-connect Only

`cc-connect@1.3.2` is designed around projects bound to messaging platforms. Local probing showed the binary rejects project configurations without a real platform and does not expose `bridge`, `custom`, or `web` as project platform types. That makes it unsuitable as the sole GUI chat backend for ClawX until cc-connect adds a first-class local GUI platform or management endpoint that accepts direct GUI prompts.

Direct Codex execution keeps the ClawX GUI usable today while still using cc-connect for packaged runtime, Doctor, channels, cron, and provider management.

## Core Capability Contract

| Capability | Replacement behavior |
|---|---|
| Chat | `CcConnectRuntimeProvider.sendMessageWithMedia` calls `CodexCliBridge.send`. |
| Sessions | ClawX stores cc-connect/Codex sessions under app userData. |
| History | ClawX reads managed JSONL transcripts and returns `RawMessage[]`. |
| Delete session | Deletes managed transcript and metadata. |
| Logs/status | Shows provider logs, Codex command logs, and cc-connect managed config hints. |
| Doctor | Runs cc-connect Doctor plus Codex CLI availability/version checks. |
| Providers/models | ClawX syncs the active provider account into `provider-profile.json`; OpenAI API key, OpenAI OAuth/Codex, and Ollama are passed to `codex exec` as launch args/env. |
| Cron/channels | First implementation remains capability-aware; later work should map to cc-connect CLI/management API. |

## Managed Paths

All cc-connect/Codex runtime state stays under:

```text
app.getPath('userData')/runtimes/cc-connect/
```

Subdirectories:

- `config.toml`
- `codex-sessions/`
- `codex-home/`
- `logs/`
- `provider-profile.json`

ClawX must not read or mutate user `~/.cc-connect` or rely on user `~/.codex` auth state for cc-connect mode.

## Provider And Model Conversion

The cc-connect runtime converts the active ClawX provider account into a Codex launch profile:

- OpenAI API key accounts: `codex exec --model <model>` with `OPENAI_API_KEY` in the child process environment.
- OpenAI OAuth browser accounts: `codex exec --model <model>` with `CODEX_HOME` pointing at `app userData/runtimes/cc-connect/codex-home/`. ClawX writes a managed Codex `auth.json` from the stored OpenAI OAuth access, refresh, optional ID token, and account id.
- Ollama local accounts: `codex exec --oss --local-provider ollama --model <model>`.
- Unsupported vendors return a stable unsupported error before spawning Codex and do not mutate OpenClaw configuration.

`provider-profile.json` is intentionally public/diagnostic: it records provider id, model, args, and environment key names only. It must not contain API keys or OAuth token values.

## First Implementation Slice

The first replacement-grade slice implements:

- `CodexCliBridge`
- transcript metadata and JSONL persistence
- `sendMessageWithMedia`
- `listSessions`
- `loadHistory`
- `deleteSession`
- provider/model profile sync for OpenAI API key, OpenAI OAuth/Codex, and Ollama
- runtime logs that include Codex command attempts
- Doctor output that includes Codex CLI version

Cron and channel deep integration remains visible in capability docs and follow-up gates, but the cc-connect runtime should no longer report chat/session/history/provider/model as unsupported.

Current implemented capability flags for cc-connect mode:

- `chat`: supported through `CodexCliBridge`
- `sessions`: supported through ClawX managed transcripts
- `history`: supported through ClawX managed transcripts
- `providers`: supported for OpenAI API key, OpenAI OAuth/Codex, and Ollama via managed Codex launch profile
- `models`: supported for OpenAI/Codex and Ollama via `codex exec --model` or `--oss --local-provider ollama`
- `logs`: supported through managed config/session path output
- `doctor`: supported through cc-connect Doctor plus Codex CLI diagnostics
- `channels`, `cron`, `skills`, `controlUi`: not yet marked supported in the runtime capability matrix

## Acceptance

- Unit tests prove `cc-connect` runtime sends through a mock Codex binary and stores user/assistant messages.
- Unit tests prove sessions/history/delete operate from managed storage.
- Unit tests prove Doctor includes Codex CLI diagnostics.
- Unit tests prove OpenAI and Ollama provider accounts convert to Codex launch profiles without writing secrets to disk.
- E2E tests prove a ClawX-managed cc-connect runtime can start from Settings-seeded config, write managed `config.toml`, send a real UI chat through the Codex bridge, and read back managed history through Host API.
- E2E tests prove an Ollama provider account is converted into `codex exec --oss --local-provider ollama --model <model>`.
- Typecheck passes.
- Existing runtime abstraction tests still pass.
- Comms replay/compare remains required before PR or merge because chat routing changed.

## Rollback

- Switch runtime back to OpenClaw in Settings.
- Stop cc-connect runtime.
- Managed cc-connect/Codex session files remain under app userData and are not deleted automatically.
