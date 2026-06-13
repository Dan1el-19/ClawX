import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const settings: Record<string, unknown> = {
    gatewayExternal: true,
    gatewayHost: '127.0.0.1',
    gatewayPort: 18789,
    gatewayToken: 'local-token',
    gatewayRemoteToken: 'wsl-token',
  };
  return {
    settings,
    connectGatewaySocket: vi.fn(),
    startWslGateway: vi.fn(async () => undefined),
    restartWslGateway: vi.fn(async () => undefined),
    runGatewayStartupSequence: vi.fn(),
    warmupManagedPythonReadiness: vi.fn(),
  };
});

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp',
    isPackaged: false,
  },
  utilityProcess: {},
}));

vi.mock('@electron/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@electron/utils/store', () => ({
  getSetting: vi.fn(async (key: string) => mocks.settings[key]),
}));

vi.mock('@electron/utils/device-identity', () => ({
  loadOrCreateDeviceIdentity: vi.fn(async () => null),
}));

vi.mock('@electron/gateway/startup-orchestrator', () => ({
  runGatewayStartupSequence: mocks.runGatewayStartupSequence,
}));

vi.mock('@electron/gateway/supervisor', async (importOriginal) => ({
  ...await importOriginal<typeof import('@electron/gateway/supervisor')>(),
  warmupManagedPythonReadiness: mocks.warmupManagedPythonReadiness,
}));

vi.mock('@electron/gateway/ws-client', async (importOriginal) => ({
  ...await importOriginal<typeof import('@electron/gateway/ws-client')>(),
  connectGatewaySocket: mocks.connectGatewaySocket,
}));

vi.mock('@electron/gateway/wsl-restart', () => ({
  startWslGateway: mocks.startWslGateway,
  restartWslGateway: mocks.restartWslGateway,
}));

describe('GatewayManager external gateway lifecycle', () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mocks.settings.gatewayExternal = true;
    mocks.settings.gatewayHost = '127.0.0.1';
    mocks.settings.gatewayPort = 18789;
    mocks.settings.gatewayToken = 'local-token';
    mocks.settings.gatewayRemoteToken = 'wsl-token';
    mocks.settings.gatewayWslDistro = '';
    mocks.settings.gatewayWslUser = '';
    mocks.connectGatewaySocket.mockImplementation(async (options: {
      getToken: () => Promise<string>;
      onHandshakeComplete: (ws: {
        readyState: number;
        on: ReturnType<typeof vi.fn>;
        ping: ReturnType<typeof vi.fn>;
        send: ReturnType<typeof vi.fn>;
        terminate: ReturnType<typeof vi.fn>;
      }) => void;
    }) => {
      await options.getToken();
      const ws = {
        readyState: 1,
        on: vi.fn(),
        ping: vi.fn(),
        send: vi.fn(),
        terminate: vi.fn(),
      };
      options.onHandshakeComplete(ws);
      return ws;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('connects directly to the configured target without starting a local gateway', async () => {
    const { GatewayManager } = await import('@electron/gateway/manager');
    const manager = new GatewayManager();

    await manager.start();

    expect(mocks.runGatewayStartupSequence).not.toHaveBeenCalled();
    expect(mocks.warmupManagedPythonReadiness).not.toHaveBeenCalled();
    expect(mocks.connectGatewaySocket).toHaveBeenCalledWith(expect.objectContaining({
      host: '127.0.0.1',
      port: 18789,
    }));
    const options = mocks.connectGatewaySocket.mock.calls[0][0] as { getToken: () => Promise<string> };
    await expect(options.getToken()).resolves.toBe('wsl-token');
    expect(manager.getStatus()).toMatchObject({
      state: 'running',
      external: true,
      host: '127.0.0.1',
      port: 18789,
    });
  });

  it('disconnects from an external gateway without sending shutdown', async () => {
    const { GatewayManager } = await import('@electron/gateway/manager');
    const manager = new GatewayManager();
    await manager.start();
    const rpcSpy = vi.spyOn(manager, 'rpc');

    await manager.stop();

    expect(rpcSpy).not.toHaveBeenCalledWith('shutdown', expect.anything(), expect.anything());
    expect(manager.getStatus().state).toBe('stopped');
  });

  it('schedules reconnect after an external socket closes on Windows', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const { GatewayManager } = await import('@electron/gateway/manager');
    const manager = new GatewayManager();
    await manager.start();
    const internals = manager as unknown as { scheduleReconnect: () => void };
    const scheduleReconnectSpy = vi.spyOn(internals, 'scheduleReconnect');
    const options = mocks.connectGatewaySocket.mock.calls[0][0] as {
      onCloseAfterHandshake: (code: number) => void;
    };

    options.onCloseAfterHandshake(1006);

    expect(scheduleReconnectSpy).toHaveBeenCalledTimes(1);
    expect(manager.getStatus().state).toBe('reconnecting');
  });

  it('restarts a configured WSL2 gateway before reconnecting the client', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    mocks.settings.gatewayWslDistro = 'Ubuntu';
    mocks.settings.gatewayWslUser = 'daniel';
    const { GatewayManager } = await import('@electron/gateway/manager');
    const manager = new GatewayManager();
    await manager.start();

    await manager.restart();

    expect(mocks.restartWslGateway).toHaveBeenCalledWith({
      distro: 'Ubuntu',
      linuxUser: 'daniel',
      host: '127.0.0.1',
      port: 18789,
    });
    expect(mocks.connectGatewaySocket).toHaveBeenCalledTimes(2);
  });

  it('restarts a configured WSL2 gateway immediately while reconnect is pending', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    mocks.settings.gatewayWslDistro = 'Ubuntu';
    mocks.settings.gatewayWslUser = 'daniel';
    const { GatewayManager } = await import('@electron/gateway/manager');
    const manager = new GatewayManager();
    await manager.start();
    const options = mocks.connectGatewaySocket.mock.calls[0][0] as {
      onCloseAfterHandshake: (code: number) => void;
    };
    options.onCloseAfterHandshake(1012);
    expect(manager.getStatus().state).toBe('reconnecting');

    await manager.restart();

    expect(mocks.restartWslGateway).toHaveBeenCalledTimes(1);
    expect(manager.getStatus().state).toBe('running');
  });

  it('starts a configured WSL2 gateway and retries when the first connection fails', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    mocks.settings.gatewayWslDistro = 'Ubuntu';
    mocks.settings.gatewayWslUser = 'daniel';
    mocks.connectGatewaySocket
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:18789'));
    const { GatewayManager } = await import('@electron/gateway/manager');
    const manager = new GatewayManager();

    await manager.start();

    expect(mocks.startWslGateway).toHaveBeenCalledWith({
      distro: 'Ubuntu',
      linuxUser: 'daniel',
      host: '127.0.0.1',
      port: 18789,
    });
    expect(mocks.connectGatewaySocket).toHaveBeenCalledTimes(2);
    expect(manager.getStatus().state).toBe('running');
  });
});
