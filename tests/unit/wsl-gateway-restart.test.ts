import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

describe('restartWslGateway', () => {
  it('restarts the configured user service without opening a Windows console', async () => {
    const execFile = vi.fn(async () => ({ stdout: '', stderr: '' }));
    const waitForPort = vi.fn(async () => undefined);
    const { restartWslGateway } = await import('@electron/gateway/wsl-restart');

    await restartWslGateway({
      distro: 'Ubuntu',
      linuxUser: 'daniel',
      host: '127.0.0.1',
      port: 18789,
    }, {
      execFile,
      waitForPort,
    });

    expect(execFile).toHaveBeenCalledWith(
      'wsl.exe',
      [
        '-d',
        'Ubuntu',
        '--user',
        'daniel',
        '--exec',
        '/bin/systemctl',
        '--user',
        'restart',
        'openclaw-gateway.service',
      ],
      expect.objectContaining({
        windowsHide: true,
      }),
    );
    expect(waitForPort).toHaveBeenCalledWith('127.0.0.1', 18789, 2_000);
  });

  it('starts the configured user service and waits until it is reachable', async () => {
    const execFile = vi.fn(async () => ({ stdout: '', stderr: '' }));
    const waitForPort = vi.fn(async () => undefined);
    const { startWslGateway } = await import('@electron/gateway/wsl-restart');

    await startWslGateway({
      distro: 'Ubuntu',
      linuxUser: 'daniel',
      host: '127.0.0.1',
      port: 18789,
    }, {
      execFile,
      waitForPort,
    });

    expect(execFile).toHaveBeenCalledWith(
      'wsl.exe',
      [
        '-d',
        'Ubuntu',
        '--user',
        'daniel',
        '--exec',
        '/bin/systemctl',
        '--user',
        'start',
        'openclaw-gateway.service',
      ],
      expect.objectContaining({
        windowsHide: true,
      }),
    );
    expect(waitForPort).toHaveBeenCalledWith('127.0.0.1', 18789, 2_000);
  });

  it('starts one detached hidden WSL keepalive process', async () => {
    vi.useFakeTimers();
    vi.resetModules();
    const child = Object.assign(new EventEmitter(), {
      exitCode: null,
      killed: false,
      unref: vi.fn(),
    });
    const spawn = vi.fn(() => child);
    const { ensureWslKeepalive } = await import('@electron/gateway/wsl-restart');
    const options = {
      distro: 'Ubuntu',
      linuxUser: 'daniel',
      host: '127.0.0.1',
      port: 18789,
    };

    ensureWslKeepalive(options, { spawn });
    ensureWslKeepalive(options, { spawn });

    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn).toHaveBeenCalledWith(
      'wsl.exe',
      ['-d', 'Ubuntu', '--user', 'daniel', '--exec', '/bin/sleep', 'infinity'],
      {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      },
    );
    expect(child.unref).toHaveBeenCalledTimes(1);

    child.emit('exit', 1);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(spawn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
