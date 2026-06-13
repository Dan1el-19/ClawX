import { PORTS } from '../utils/config';

export interface GatewayTarget {
  external: boolean;
  host: string;
  port: number;
}

export function normalizeGatewayTarget(target: Partial<GatewayTarget>): GatewayTarget {
  const host = target.host?.trim().replace(/^\[|\]$/g, '') || '127.0.0.1';
  const port = Number.isInteger(target.port) && Number(target.port) > 0 && Number(target.port) <= 65535
    ? Number(target.port)
    : PORTS.OPENCLAW_GATEWAY;

  return {
    external: target.external === true,
    host,
    port,
  };
}

export function buildGatewayWebSocketUrl(target: Pick<GatewayTarget, 'host' | 'port'>): string {
  const normalized = normalizeGatewayTarget({ ...target, external: false });
  const host = normalized.host.includes(':') ? `[${normalized.host}]` : normalized.host;
  return `ws://${host}:${normalized.port}/ws`;
}

export function selectGatewayToken(options: {
  target: GatewayTarget;
  localToken: string;
  remoteToken: string;
}): string {
  const remoteToken = options.remoteToken.trim();
  return options.target.external && remoteToken ? remoteToken : options.localToken;
}
