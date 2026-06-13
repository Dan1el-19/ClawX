# Native Windows ClawX with an OpenClaw Gateway in WSL2

This unofficial fork lets the native Windows ClawX application connect to an
OpenClaw Gateway running inside WSL2. The Electron UI remains a native Windows
application while OpenClaw and its Linux tooling run in WSL2.

## Architecture

```text
Native Windows ClawX
        |
        | WebSocket + gateway token
        v
Windows localhost:18789
        |
        | WSL2 localhost forwarding
        v
OpenClaw Gateway in Ubuntu WSL2
```

External mode normally manages only the client connection. When a WSL2
distribution is configured in ClawX, **Restart Gateway** can restart the
`openclaw-gateway.service` user service without opening a console window.

## Requirements

- Windows 11 with WSL2 and localhost forwarding enabled
- An installed WSL2 distribution, such as Ubuntu
- OpenClaw installed and configured inside WSL2
- A gateway token configured in `~/.openclaw/openclaw.json`
- A Windows build produced from this fork

Do not commit or publish your gateway token.

## Configure OpenClaw in WSL2

Confirm that the gateway configuration uses token authentication:

```json
{
  "gateway": {
    "mode": "local",
    "auth": {
      "mode": "token",
      "token": "replace-with-a-strong-secret"
    }
  }
}
```

Install the user service:

```bash
openclaw gateway install --force
```

Some OpenClaw versions generate a systemd service without the explicit `run`
subcommand. If the service is active but port `18789` is not listening, edit
`~/.config/systemd/user/openclaw-gateway.service` so its command contains:

```text
openclaw ... gateway run --port 18789
```

Then reload and restart the service:

```bash
systemctl --user daemon-reload
systemctl --user enable --now openclaw-gateway.service
openclaw gateway health
```

Verify from Windows PowerShell:

```powershell
Test-NetConnection 127.0.0.1 -Port 18789
```

## Keep WSL2 Running

WSL2 can stop a distribution after its last Linux process exits. A lightweight
Windows Scheduled Task can keep the distribution available after login without
opening a console window. Register the included hidden keep-alive script:

```powershell
$script = (Resolve-Path '.\scripts\windows\wsl-keepalive.vbs').Path
$action = New-ScheduledTaskAction `
  -Execute "$env:SystemRoot\System32\wscript.exe" `
  -Argument "//B //Nologo `"$script`" Ubuntu"
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet `
  -Hidden `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask `
  -TaskName 'OpenClaw WSL2 Host' `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description 'Keeps WSL2 running for the OpenClaw gateway.' `
  -Force
```

Pass the Linux user after the distribution name when it differs from the WSL
default user, for example `Ubuntu daniel`. Adjust the distribution name if it
is not `Ubuntu`.

## Connect ClawX

1. Open **Settings > Gateway**.
2. Enable **External Gateway**.
3. Set the host to `127.0.0.1`.
4. Set the port to `18789`.
5. Enter the token from the WSL2 OpenClaw configuration.
6. Set the WSL2 distribution and optional Linux user to enable service restart.
7. Choose **Save and Reconnect**.

The application log should report `external=true`, followed by a successful
gateway connection.

## Limitations

- Features that directly inspect a local Windows OpenClaw directory are not
  redirected into WSL2.
- ClawX only supports lifecycle restart for a configured local WSL2 gateway.
- WSL2 localhost forwarding must be working before ClawX can connect.
- The gateway token is stored in the ClawX settings file for reconnection.

## Building

Install dependencies and build the Windows installer:

```powershell
corepack pnpm install
$env:SKIP_PREINSTALLED_SKILLS = '1'
corepack pnpm run package:win
```

`SKIP_PREINSTALLED_SKILLS` avoids a Windows-only `bsdtar` dependency. Omit it
when `bsdtar` is installed and you want the optional preinstalled skill bundle.

Large dependencies and release artifacts can be kept outside the system drive
by cloning the repository and configuring the pnpm store on another drive:

```powershell
pnpm config set store-dir A:\Projects\.pnpm-store
```

## Project Status

This is an unofficial community fork. For upstream ClawX issues unrelated to
the external WSL2 gateway, consult
[ValueCell-ai/ClawX](https://github.com/ValueCell-ai/ClawX).
