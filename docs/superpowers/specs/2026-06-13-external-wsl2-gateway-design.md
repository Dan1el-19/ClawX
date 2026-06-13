# External WSL2 Gateway Design

## Goal

Build a native Windows ClawX 0.4.10 variant that connects to an OpenClaw Gateway
managed inside WSL2 without launching, repairing, reloading, shutting down, or
terminating the bundled Windows OpenClaw runtime.

## Architecture

ClawX gains an explicit `gatewayExternal` setting alongside `gatewayHost`,
`gatewayPort`, and `gatewayRemoteToken`. Explicit mode selection is required
because a WSL2 gateway can be exposed through Windows localhost forwarding;
classifying a gateway as external only from its hostname would be incorrect.

The Electron Main process remains the sole owner of gateway transport. Renderer
code only edits typed settings and requests lifecycle operations through the
existing host API.

## Gateway Lifecycle

When `gatewayExternal` is false, existing ClawX behavior remains unchanged.

When `gatewayExternal` is true:

- `GatewayManager.start()` loads the configured target and connects directly.
- ClawX skips local process discovery, port cleanup, Python warmup, config sync,
  OpenClaw doctor repair, bundled process launch, and readiness waiting.
- `GatewayManager.stop()` closes its WebSocket but never sends `shutdown` and
  never terminates an OpenClaw process.
- `GatewayManager.restart()` performs a client reconnect only.
- Reconnect scheduling remains enabled after unexpected socket closure,
  including on Windows where no local child-process exit event will occur.
- Reload requests reconnect the client instead of signaling a process.

## Transport And Authentication

Gateway WebSocket helpers accept a host parameter and connect to
`ws://<host>:<port>/ws`. The remote token is used in external mode, with the
local generated gateway token retained for managed mode.

The current signed device identity handshake is preserved. Removing device
identity, as PR #310 did against protocol version 3, is not appropriate for the
current protocol version 4 implementation.

## Settings UI

The Gateway settings section exposes:

- an External Gateway switch;
- gateway host and port fields;
- a masked remote token field;
- a single Save and Reconnect action.

The fields are visible only in external mode. All labels and help text are
provided in every existing locale. Saving uses the typed host API and causes a
client reconnect.

## Control UI

The external OpenClaw Control UI URL uses the configured host, port, and remote
token. Managed mode continues to use loopback and the local token.

## Testing

- Unit tests prove host-aware WebSocket URLs and token selection.
- Unit tests prove external lifecycle skips all local process operations and
  does not issue `shutdown`.
- Unit tests prove Control UI URL construction for external targets.
- Settings tests and Electron E2E cover editing and saving external settings.
- Existing unit, typecheck, lint, harness, communication replay, and Windows
  packaging checks must pass.
- Runtime verification must connect the packaged native Windows ClawX build to
  the WSL2 OpenClaw Gateway and successfully execute a health RPC.

## Out Of Scope

ClawX features that directly read or write the Windows OpenClaw config directory
are not transparently redirected into WSL2 in this change. Gateway-backed chat,
agents, channels, cron, status, health, and Control UI are the supported path.
