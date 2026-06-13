/**
 * Zustand Stores Tests
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSettingsStore } from '@/stores/settings';
import { useGatewayStore } from '@/stores/gateway';

const hostApiMock = vi.hoisted(() => ({
  gateway: {
    status: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    restart: vi.fn(),
    health: vi.fn(),
    rpc: vi.fn(),
  },
  settings: {
    getAll: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    setMany: vi.fn(),
    reset: vi.fn(),
  },
  logs: {
    recent: vi.fn(),
    dir: vi.fn(),
    listFiles: vi.fn(),
    readFile: vi.fn(),
  },
}));

vi.mock('@/lib/host-api', () => ({
  hostApi: hostApiMock,
}));

describe('Settings Store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hostApiMock.settings.set.mockResolvedValue({ success: true });
    hostApiMock.settings.setMany.mockResolvedValue({ success: true });
    // Reset store to default state
    useSettingsStore.setState({
      theme: 'system',
      language: 'en',
      sidebarCollapsed: false,
      sidebarWidth: 280,
      devModeUnlocked: false,
      gatewayAutoStart: true,
      gatewayExternal: false,
      gatewayHost: '127.0.0.1',
      gatewayPort: 18789,
      gatewayRemoteToken: '',
      gatewayWslDistro: '',
      gatewayWslUser: '',
      autoCheckUpdate: true,
      startMinimized: false,
      launchAtStartup: false,
      updateChannel: 'stable',
    });
  });
  
  it('should have default values', () => {
    const state = useSettingsStore.getState();
    expect(state.theme).toBe('system');
    expect(state.sidebarCollapsed).toBe(false);
    expect(state.gatewayAutoStart).toBe(true);
  });
  
  it('should update theme', () => {
    const { setTheme } = useSettingsStore.getState();
    setTheme('dark');
    expect(useSettingsStore.getState().theme).toBe('dark');
  });
  
  it('should toggle sidebar collapsed state', () => {
    const { setSidebarCollapsed } = useSettingsStore.getState();
    setSidebarCollapsed(true);
    expect(useSettingsStore.getState().sidebarCollapsed).toBe(true);
  });

  it('should clamp sidebar width', () => {
    const { setSidebarWidth } = useSettingsStore.getState();

    setSidebarWidth(320);
    expect(useSettingsStore.getState().sidebarWidth).toBe(320);

    setSidebarWidth(100);
    expect(useSettingsStore.getState().sidebarWidth).toBe(220);

    setSidebarWidth(600);
    expect(useSettingsStore.getState().sidebarWidth).toBe(420);
  });
  
  it('should unlock dev mode', () => {
    hostApiMock.settings.set.mockResolvedValueOnce({ success: true });

    const { setDevModeUnlocked } = useSettingsStore.getState();
    setDevModeUnlocked(true);

    expect(useSettingsStore.getState().devModeUnlocked).toBe(true);
    expect(hostApiMock.settings.set).toHaveBeenCalledWith('devModeUnlocked', true);
  });

  it('should persist launch-at-startup setting through host api', () => {
    hostApiMock.settings.set.mockResolvedValueOnce({ success: true });

    const { setLaunchAtStartup } = useSettingsStore.getState();
    setLaunchAtStartup(true);

    expect(useSettingsStore.getState().launchAtStartup).toBe(true);
    expect(hostApiMock.settings.set).toHaveBeenCalledWith('launchAtStartup', true);
  });

  it('should save an external gateway target atomically', async () => {
    const { saveGatewayTarget } = useSettingsStore.getState();

    await saveGatewayTarget({
      external: true,
      host: '127.0.0.1',
      port: 18789,
      remoteToken: 'wsl-token',
      wslDistro: 'Ubuntu',
      wslUser: 'daniel',
    });

    expect(useSettingsStore.getState()).toMatchObject({
      gatewayExternal: true,
      gatewayHost: '127.0.0.1',
      gatewayPort: 18789,
      gatewayRemoteToken: 'wsl-token',
      gatewayWslDistro: 'Ubuntu',
      gatewayWslUser: 'daniel',
    });
    expect(hostApiMock.settings.setMany).toHaveBeenCalledWith({
      gatewayExternal: true,
      gatewayHost: '127.0.0.1',
      gatewayPort: 18789,
      gatewayRemoteToken: 'wsl-token',
      gatewayWslDistro: 'Ubuntu',
      gatewayWslUser: 'daniel',
    });
  });
});

describe('Gateway Store', () => {
  beforeEach(() => {
    // Reset store
    useGatewayStore.setState({
      status: { state: 'stopped', port: 18789 },
      isInitialized: false,
    });
  });
  
  it('should have default status', () => {
    const state = useGatewayStore.getState();
    expect(state.status.state).toBe('stopped');
    expect(state.status.port).toBe(18789);
  });
  
  it('should update status', () => {
    const { setStatus } = useGatewayStore.getState();
    setStatus({ state: 'running', port: 18789, pid: 12345 });
    
    const state = useGatewayStore.getState();
    expect(state.status.state).toBe('running');
    expect(state.status.pid).toBe(12345);
  });

  it('should proxy gateway rpc through ipc', async () => {
    hostApiMock.gateway.rpc.mockResolvedValueOnce({ ok: true });

    const result = await useGatewayStore.getState().rpc<{ ok: boolean }>('chat.history', { limit: 10 }, 5000);

    expect(result.ok).toBe(true);
    expect(hostApiMock.gateway.rpc).toHaveBeenCalledWith('chat.history', { limit: 10 }, 5000);
  });

  it('reconciles gateway status after restart completes', async () => {
    hostApiMock.gateway.restart.mockResolvedValueOnce({ success: true });
    hostApiMock.gateway.status.mockResolvedValueOnce({
      state: 'running',
      port: 18789,
      gatewayReady: true,
    });

    await useGatewayStore.getState().restart();

    expect(hostApiMock.gateway.status).toHaveBeenCalledTimes(1);
    expect(useGatewayStore.getState().status).toMatchObject({
      state: 'running',
      gatewayReady: true,
    });
  });

  it('reconciles gateway readiness when lifecycle state stays running', async () => {
    hostApiMock.gateway.status
      .mockResolvedValueOnce({
        state: 'running',
        port: 18789,
        gatewayReady: false,
      })
      .mockResolvedValueOnce({
        state: 'running',
        port: 18789,
        gatewayReady: true,
      });

    await useGatewayStore.getState().init();

    expect(useGatewayStore.getState().status).toMatchObject({
      state: 'running',
      gatewayReady: true,
    });
  });
});
