import { describe, expect, it } from 'vitest';

import {
  buildGatewayWebSocketUrl,
  normalizeGatewayTarget,
  selectGatewayToken,
} from '@electron/gateway/target';

describe('gateway target', () => {
  it('normalizes a blank managed target to loopback defaults', () => {
    expect(normalizeGatewayTarget({
      external: false,
      host: '  ',
      port: Number.NaN,
    })).toEqual({
      external: false,
      host: '127.0.0.1',
      port: 18789,
    });
  });

  it('preserves an external WSL2 target', () => {
    expect(normalizeGatewayTarget({
      external: true,
      host: ' 172.24.80.1 ',
      port: 19789,
    })).toEqual({
      external: true,
      host: '172.24.80.1',
      port: 19789,
    });
  });

  it('builds WebSocket URLs for hostnames and IPv6 addresses', () => {
    expect(buildGatewayWebSocketUrl({
      external: true,
      host: 'wsl-openclaw.local',
      port: 18789,
    })).toBe('ws://wsl-openclaw.local:18789/ws');
    expect(buildGatewayWebSocketUrl({
      external: true,
      host: '::1',
      port: 18789,
    })).toBe('ws://[::1]:18789/ws');
  });

  it('selects remote token only for external targets', () => {
    expect(selectGatewayToken({
      target: { external: true, host: '127.0.0.1', port: 18789 },
      localToken: 'local-token',
      remoteToken: 'remote-token',
    })).toBe('remote-token');
    expect(selectGatewayToken({
      target: { external: false, host: '127.0.0.1', port: 18789 },
      localToken: 'local-token',
      remoteToken: 'remote-token',
    })).toBe('local-token');
  });

  it('falls back to the local token when the external token is blank', () => {
    expect(selectGatewayToken({
      target: { external: true, host: '127.0.0.1', port: 18789 },
      localToken: 'local-token',
      remoteToken: '  ',
    })).toBe('local-token');
  });
});
