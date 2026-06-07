import { EventEmitter } from 'node:events';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { OpenClawDoctorMode, OpenClawDoctorResult } from '@shared/host-api/contract';
import type {
  RuntimeProvider,
  RuntimeSendWithMediaPayload,
  RuntimeStatus,
} from './types';
import {
  CC_CONNECT_RUNTIME_CAPABILITIES,
  withRuntimeStatus,
} from './types';
import {
  assertCcConnectBinaryPath,
  getCcConnectCodexSessionsDir,
  getCcConnectConfigPath,
  getCcConnectManagedDir,
  getCcConnectProviderProfilePath,
} from './cc-connect-paths';
import { CodexCliBridge } from './codex-cli-bridge';
import {
  syncCcConnectProviderProfile,
  toPublicCodexProviderProfile,
  type CodexProviderProfile,
} from './cc-connect-provider-profile';

type CcConnectRuntimeProviderOptions = {
  binaryPath?: string;
  codexPath?: string;
  workDir?: string;
  codexBridge?: CodexCliBridge;
  providerProfileLoader?: (payload?: { providerId?: string; reason?: string }) => Promise<CodexProviderProfile>;
};

const CC_CONNECT_DOCTOR_TIMEOUT_MS = 60_000;
const MAX_DOCTOR_OUTPUT_BYTES = 10 * 1024 * 1024;

function unsupported(method: string): never {
  throw new Error(`cc-connect runtime does not support RPC method: ${method}`);
}

function appendBoundedOutput(current: string, currentBytes: number, data: Buffer | string) {
  const chunk = typeof data === 'string' ? Buffer.from(data) : data;
  if (currentBytes + chunk.length <= MAX_DOCTOR_OUTPUT_BYTES) {
    return {
      output: current + chunk.toString(),
      bytes: currentBytes + chunk.length,
    };
  }
  const remaining = Math.max(0, MAX_DOCTOR_OUTPUT_BYTES - currentBytes);
  return {
    output: current + (remaining > 0 ? chunk.subarray(0, remaining).toString() : ''),
    bytes: MAX_DOCTOR_OUTPUT_BYTES,
  };
}

function defaultConfig(): string {
  const managedDir = getCcConnectManagedDir();
  const dataDir = join(managedDir, 'data').replace(/\\/g, '\\\\');
  const workDir = (process.env.CLAWX_CODEX_WORKDIR || process.cwd()).replace(/\\/g, '\\\\');
  return [
    '# Managed by ClawX. Do not edit while ClawX is running.',
    '# ClawX stores this file under app userData and does not modify ~/.cc-connect.',
    '# cc-connect v1.3.2 requires at least one [[projects]] entry with a real messaging platform.',
    '# ClawX GUI chat uses CodexCliBridge directly until a local GUI platform is available.',
    '# ClawX stores the active Codex provider/model profile in provider-profile.json.',
    '',
    `data_dir = "${dataDir}"`,
    '',
    '[log]',
    'level = "info"',
    '',
    '# Enable when ClawX starts using cc-connect management endpoints for provider/cron/channel parity.',
    '# [management]',
    '# enabled = true',
    '# port = 9820',
    '# token = "replace-with-clawx-managed-token"',
    '',
    '# Enable when external bridge adapters are configured.',
    '# [bridge]',
    '# enabled = true',
    '# port = 9810',
    '# token = "replace-with-clawx-managed-token"',
    '',
    '# Codex project template. Uncomment and add a real [[projects.platforms]] section',
    '# such as telegram, feishu, slack, dingtalk, discord, wecom, weixin, qq, qqbot, or line.',
    '# [[projects]]',
    '# name = "clawx-codex"',
    '# [projects.agent]',
    '# type = "codex"',
    '# [projects.agent.options]',
    `# work_dir = "${workDir}"`,
    '# mode = "full-auto"',
    '# [[projects.platforms]]',
    '# type = "telegram"',
    '# [projects.platforms.options]',
    '# token = "${TELEGRAM_BOT_TOKEN}"',
    '',
  ].join('\n');
}

export class CcConnectRuntimeProvider extends EventEmitter implements RuntimeProvider {
  readonly kind = 'cc-connect' as const;
  private child: ChildProcess | null = null;
  private readonly codexBridge: CodexCliBridge;
  private readonly providerProfileLoader: NonNullable<CcConnectRuntimeProviderOptions['providerProfileLoader']>;
  private status = withRuntimeStatus({
    state: 'stopped',
    port: 0,
  }, this.kind, CC_CONNECT_RUNTIME_CAPABILITIES, getCcConnectManagedDir());
  private readonly binaryPath?: string;

  constructor(options: CcConnectRuntimeProviderOptions = {}) {
    super();
    this.binaryPath = options.binaryPath;
    this.codexBridge = options.codexBridge ?? new CodexCliBridge({
      codexPath: options.codexPath,
      sessionsDir: getCcConnectCodexSessionsDir(),
      workDir: options.workDir,
    });
    this.providerProfileLoader = options.providerProfileLoader ?? syncCcConnectProviderProfile;
  }

  listCapabilities() {
    return CC_CONNECT_RUNTIME_CAPABILITIES;
  }

  getStatus() {
    return this.status;
  }

  async start(): Promise<void> {
    if (this.status.state === 'running' || this.status.state === 'starting') return;
    await this.ensureManagedConfig();
    assertCcConnectBinaryPath(this.binaryPath);
    this.setStatus({ state: 'starting', error: undefined });

    const codexDiagnostic = await this.codexBridge.diagnose();
    if (!codexDiagnostic.success) {
      const error = codexDiagnostic.error || codexDiagnostic.stderr || 'Codex CLI is unavailable';
      this.setStatus({ state: 'error', error });
      throw new Error(error);
    }
    await this.syncProviderProfile({ reason: 'runtime-start' });

    this.setStatus({
      state: 'running',
      pid: process.pid,
      connectedAt: Date.now(),
      gatewayReady: true,
      error: undefined,
    });
  }

  async stop(): Promise<void> {
    const child = this.child;
    this.child = null;
    if (child) {
      try {
        child.kill();
      } catch {
        // ignore
      }
    }
    this.setStatus({ state: 'stopped', pid: undefined, connectedAt: undefined, gatewayReady: undefined });
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  async checkHealth() {
    return {
      ok: this.status.state === 'running',
      error: this.status.error,
      uptime: this.status.connectedAt ? Date.now() - this.status.connectedAt : undefined,
    };
  }

  async rpc<T = unknown>(method: string, params?: unknown): Promise<T> {
    switch (method) {
      case 'chat.send':
        return await this.sendMessageWithMedia(toSendPayload(params)) as T;
      case 'sessions.list':
        return await this.listSessions(params) as T;
      case 'chat.history':
        return await this.loadHistory(params) as T;
      case 'sessions.delete':
      case 'session.delete':
      case 'chat.session.delete':
        return await this.deleteSession(params) as T;
      case 'providers.sync':
      case 'models.sync':
        return await this.syncProviderProfile(toProviderSyncPayload(params)) as T;
      case 'providers.profile':
      case 'models.profile':
        return await this.syncProviderProfile(toProviderSyncPayload(params)) as T;
      default:
        return unsupported(method);
    }
  }

  async sendMessageWithMedia(payload: RuntimeSendWithMediaPayload) {
    const result = await this.codexBridge.send(payload);
    this.emit('chat:runtime-event', {
      type: 'run.started',
      runId: result.runId,
      sessionKey: payload.sessionKey,
      startedAt: Date.now(),
      ts: Date.now(),
    });
    this.emit('chat:message', {
      state: 'final',
      runId: result.runId,
      sessionKey: payload.sessionKey,
      message: result.assistantMessage,
    });
    this.emit('chat:runtime-event', {
      type: 'run.ended',
      runId: result.runId,
      sessionKey: payload.sessionKey,
      status: result.assistantMessage.isError ? 'error' : 'completed',
      endedAt: Date.now(),
      ts: Date.now(),
      ...(result.assistantMessage.isError ? { error: result.assistantMessage.errorMessage } : {}),
    });
    return { runId: result.runId };
  }

  async listSessions(payload?: unknown) {
    if (isRecord(payload) && Array.isArray(payload.sessionKeys)) {
      return {
        success: true,
        summaries: await this.codexBridge.summarizeSessions(
          payload.sessionKeys.filter((value): value is string => typeof value === 'string'),
        ),
      };
    }
    const sessions = await this.codexBridge.listSessions();
    return {
      success: true,
      sessions: sessions.map((session) => ({
        key: session.key,
        displayName: session.displayName,
        updatedAt: session.updatedAt,
      })),
    };
  }

  async loadHistory(payload?: unknown) {
    const body = isRecord(payload) ? payload : {};
    const sessionKey = typeof body.sessionKey === 'string' && body.sessionKey.trim()
      ? body.sessionKey.trim()
      : 'agent:main:main';
    const limit = typeof body.limit === 'number' && Number.isFinite(body.limit)
      ? Math.max(1, Math.min(Math.floor(body.limit), 1000))
      : 200;
    return {
      success: true,
      messages: await this.codexBridge.loadHistory(sessionKey, limit),
    };
  }

  async deleteSession(payload?: unknown) {
    const sessionKey = getSessionKey(payload);
    await this.codexBridge.deleteSession(sessionKey);
    return { success: true };
  }

  async listLogs() {
    const configPath = getCcConnectConfigPath();
    const content = existsSync(configPath)
      ? await readFile(configPath, 'utf8').catch(() => '')
      : '';
    return {
      content: [
        `[cc-connect] config=${configPath}`,
        `[cc-connect] providerProfile=${getCcConnectProviderProfilePath()}`,
        `[codex] sessions=${this.codexBridge.getSessionsDir()}`,
        '',
        content,
      ].join('\n'),
    };
  }

  async runDoctor(mode: OpenClawDoctorMode): Promise<OpenClawDoctorResult> {
    const startedAt = Date.now();
    const cwd = getCcConnectManagedDir();
    const configPath = await this.ensureManagedConfig();
    const binaryPath = assertCcConnectBinaryPath(this.binaryPath);
    const args = ['doctor', 'user-isolation', '--config', configPath];
    const command = `cc-connect ${args.join(' ')}`;
    const codexDiagnostic = await this.codexBridge.diagnose();
    const codexStdout = [
      'Codex CLI:',
      codexDiagnostic.success ? 'ok' : 'failed',
      codexDiagnostic.stdout.trim(),
      codexDiagnostic.error ? `error: ${codexDiagnostic.error}` : '',
    ].filter(Boolean).join('\n');

    if (mode === 'fix') {
      return {
        mode,
        success: false,
        exitCode: null,
        stdout: codexStdout,
        stderr: codexDiagnostic.stderr,
        command,
        cwd,
        durationMs: Date.now() - startedAt,
        error: 'cc-connect doctor does not support fix mode in v1.3.2',
      };
    }

    return await new Promise<OpenClawDoctorResult>((resolve) => {
      const child = spawn(binaryPath, args, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let settled = false;

      const finish = (result: Omit<OpenClawDoctorResult, 'durationMs'>) => {
        if (settled) return;
        settled = true;
        resolve({
          ...result,
          durationMs: Date.now() - startedAt,
        });
      };

      const timeout = setTimeout(() => {
        try {
          child.kill();
        } catch {
          // ignore
        }
        finish({
          mode,
          success: false,
          exitCode: null,
          stdout,
          stderr,
          command,
          cwd,
          timedOut: true,
          error: `Timed out after ${CC_CONNECT_DOCTOR_TIMEOUT_MS}ms`,
        });
      }, CC_CONNECT_DOCTOR_TIMEOUT_MS);

      child.stdout?.on('data', (data) => {
        const next = appendBoundedOutput(stdout, stdoutBytes, data);
        stdout = next.output;
        stdoutBytes = next.bytes;
      });
      child.stderr?.on('data', (data) => {
        const next = appendBoundedOutput(stderr, stderrBytes, data);
        stderr = next.output;
        stderrBytes = next.bytes;
      });
      child.on('error', (error) => {
        clearTimeout(timeout);
        finish({
          mode,
          success: false,
          exitCode: null,
          stdout,
          stderr,
          command,
          cwd,
          error: error instanceof Error ? error.message : String(error),
        });
      });
      child.on('exit', (code) => {
        clearTimeout(timeout);
        finish({
          mode,
          success: code === 0,
          exitCode: code,
          stdout: [stdout, codexStdout].filter(Boolean).join('\n'),
          stderr: [stderr, codexDiagnostic.stderr].filter(Boolean).join('\n'),
          command,
          cwd,
        });
      });
    });
  }

  private async ensureManagedConfig(): Promise<string> {
    const configPath = getCcConnectConfigPath();
    await mkdir(dirname(configPath), { recursive: true });
    if (!existsSync(configPath)) {
      await writeFile(configPath, defaultConfig(), 'utf8');
    }
    return configPath;
  }

  private async syncProviderProfile(payload?: { providerId?: string; reason?: string }) {
    const profile = await this.providerProfileLoader(payload);
    this.codexBridge.setProviderProfile(profile);
    return {
      success: true,
      profile: toPublicCodexProviderProfile(profile),
    };
  }

  private setStatus(patch: Partial<RuntimeStatus>): void {
    this.status = {
      ...this.status,
      ...patch,
      runtimeKind: this.kind,
      capabilities: this.listCapabilities(),
      configDir: getCcConnectManagedDir(),
    };
    this.emit('status', this.status);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getSessionKey(payload: unknown): string {
  if (typeof payload === 'string' && payload.trim()) return payload.trim();
  if (isRecord(payload)) {
    const value = payload.sessionKey ?? payload.id;
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return 'agent:main:main';
}

function toSendPayload(payload: unknown): RuntimeSendWithMediaPayload {
  const body = isRecord(payload) ? payload : {};
  const message = typeof body.message === 'string'
    ? body.message
    : typeof body.content === 'string'
      ? body.content
      : '';
  const idempotencyKey = typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim()
    ? body.idempotencyKey.trim()
    : `cc-connect-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const media = Array.isArray(body.media)
    ? body.media
    : Array.isArray(body.attachments)
      ? body.attachments
      : undefined;
  return {
    sessionKey: getSessionKey(body),
    message,
    deliver: typeof body.deliver === 'boolean' ? body.deliver : false,
    idempotencyKey,
    ...(media ? { media: media as RuntimeSendWithMediaPayload['media'] } : {}),
  };
}

function toProviderSyncPayload(payload: unknown): { providerId?: string; reason?: string } | undefined {
  if (!isRecord(payload)) return undefined;
  return {
    providerId: typeof payload.providerId === 'string' ? payload.providerId : undefined,
    reason: typeof payload.reason === 'string' ? payload.reason : undefined,
  };
}
