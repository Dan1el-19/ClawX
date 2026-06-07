import { EventEmitter } from 'node:events';
import type { GatewayManager } from '../gateway/manager';
import type {
  RuntimeProvider,
  RuntimeSendWithMediaPayload,
} from './types';
import {
  OPENCLAW_RUNTIME_CAPABILITIES,
  withRuntimeStatus,
} from './types';
import { createChatSendWithMediaHandler } from '../services/chat-api';
import { createSessionsApi } from '../services/sessions-api';
import { logger } from '../utils/logger';
import { runOpenClawDoctor, runOpenClawDoctorFix } from '../utils/openclaw-doctor';
import type { OpenClawDoctorMode } from '@shared/host-api/contract';

export class OpenClawRuntimeProvider extends EventEmitter implements RuntimeProvider {
  readonly kind = 'openclaw' as const;
  private readonly sessionsApi = createSessionsApi();

  constructor(private readonly gatewayManager: GatewayManager) {
    super();
    const forward = (eventName: string) => (payload: unknown) => {
      this.emit(eventName, payload);
    };
    for (const eventName of [
      'status',
      'error',
      'notification',
      'gateway:health',
      'gateway:presence',
      'chat:message',
      'chat:runtime-event',
      'channel:status',
      'exit',
    ]) {
      this.gatewayManager.on(eventName, forward(eventName));
    }
  }

  listCapabilities() {
    return OPENCLAW_RUNTIME_CAPABILITIES;
  }

  getStatus() {
    return withRuntimeStatus(this.gatewayManager.getStatus(), this.kind, this.listCapabilities());
  }

  start() {
    return this.gatewayManager.start();
  }

  stop() {
    return this.gatewayManager.stop();
  }

  restart() {
    return this.gatewayManager.restart();
  }

  checkHealth(options?: { probe?: boolean }) {
    return this.gatewayManager.checkHealth(options);
  }

  rpc<T = unknown>(method: string, params?: unknown, timeoutMs?: number): Promise<T> {
    return this.gatewayManager.rpc(method, params, timeoutMs);
  }

  async sendMessageWithMedia(payload: RuntimeSendWithMediaPayload) {
    const handler = createChatSendWithMediaHandler(this.gatewayManager, logger);
    const response = await handler(payload);
    if (!response.success) {
      throw new Error(response.error || 'OpenClaw chat send failed');
    }
    return response.result ?? {};
  }

  async listSessions(payload?: unknown) {
    return await this.sessionsApi.summaries(payload as never);
  }

  async loadHistory(payload?: unknown) {
    return await this.sessionsApi.history(payload as never);
  }

  async deleteSession(payload?: unknown) {
    return await this.sessionsApi.delete(payload as never);
  }

  async listLogs() {
    return { content: logger.getRecentLogs().join('\n') };
  }

  runDoctor(mode: OpenClawDoctorMode) {
    return mode === 'fix' ? runOpenClawDoctorFix() : runOpenClawDoctor();
  }
}
