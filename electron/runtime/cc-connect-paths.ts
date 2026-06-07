import { app } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

function binaryName(): string {
  return process.platform === 'win32' ? 'cc-connect.exe' : 'cc-connect';
}

export function getCcConnectManagedDir(): string {
  return join(app.getPath('userData'), 'runtimes', 'cc-connect');
}

export function getCcConnectConfigPath(): string {
  return join(getCcConnectManagedDir(), 'config.toml');
}

export function getCcConnectCodexSessionsDir(): string {
  return join(getCcConnectManagedDir(), 'codex-sessions');
}

export function getCcConnectCodexHomeDir(): string {
  return join(getCcConnectManagedDir(), 'codex-home');
}

export function getCcConnectProviderProfilePath(): string {
  return join(getCcConnectManagedDir(), 'provider-profile.json');
}

export function getCcConnectBinaryPath(): string {
  if (process.env.CLAWX_CC_CONNECT_PATH?.trim()) {
    return process.env.CLAWX_CC_CONNECT_PATH.trim();
  }
  if (app.isPackaged) {
    return join(process.resourcesPath, 'cc-connect', binaryName());
  }
  const nodeModulesBinary = join(process.cwd(), 'node_modules', 'cc-connect', 'bin', binaryName());
  if (existsSync(nodeModulesBinary)) {
    return nodeModulesBinary;
  }
  const bundledDevBinary = join(process.cwd(), 'build', 'cc-connect', `${process.platform}-${process.arch}`, binaryName());
  if (existsSync(bundledDevBinary)) {
    return bundledDevBinary;
  }
  return nodeModulesBinary;
}

export function assertCcConnectBinaryPath(candidate = getCcConnectBinaryPath()): string {
  if (!existsSync(candidate)) {
    throw new Error(
      `cc-connect binary not found at ${candidate}. Run pnpm install or pnpm run bundle:cc-connect:current before selecting cc-connect runtime.`,
    );
  }
  return candidate;
}
