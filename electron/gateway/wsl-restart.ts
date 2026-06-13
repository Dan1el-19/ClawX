import { execFile as execFileCallback } from 'node:child_process';
import net from 'node:net';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFileCallback);

type RestartWslGatewayOptions = {
  distro: string;
  linuxUser: string;
  host: string;
  port: number;
};

type RestartWslGatewayDependencies = {
  execFile: (
    file: string,
    args: string[],
    options: { timeout: number; windowsHide: boolean },
  ) => Promise<unknown>;
  waitForPort: (host: string, port: number, stableForMs: number) => Promise<void>;
};

async function waitForTcpPort(
  host: string,
  port: number,
  stableForMs = 0,
  timeoutMs = 30_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let reachableSince: number | null = null;
  while (Date.now() < deadline) {
    const connected = await new Promise<boolean>((resolve) => {
      const socket = net.createConnection({ host, port });
      socket.setTimeout(1_000);
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      socket.once('error', () => resolve(false));
    });
    if (connected) {
      reachableSince ??= Date.now();
      if (Date.now() - reachableSince >= stableForMs) return;
    } else {
      reachableSince = null;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`WSL2 Gateway did not become stably reachable at ${host}:${port}`);
}

export async function restartWslGateway(
  options: RestartWslGatewayOptions,
  dependencies: RestartWslGatewayDependencies = {
    execFile: execFileAsync,
    waitForPort: waitForTcpPort,
  },
): Promise<void> {
  const distro = options.distro.trim();
  const linuxUser = options.linuxUser.trim();
  if (!distro) {
    throw new Error('A WSL2 distribution is required to restart the external Gateway');
  }

  const args = ['-d', distro];
  if (linuxUser) {
    args.push('--user', linuxUser);
  }
  args.push(
    '--exec',
    '/bin/systemctl',
    '--user',
    'restart',
    'openclaw-gateway.service',
  );

  await dependencies.execFile('wsl.exe', args, {
    timeout: 30_000,
    windowsHide: true,
  });
  await dependencies.waitForPort(options.host, options.port, 2_000);
}
