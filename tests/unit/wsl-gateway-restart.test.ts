import { describe, expect, it, vi } from 'vitest';

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
});
