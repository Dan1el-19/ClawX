import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { app } from 'electron';
import { getProviderAccount, getDefaultProviderAccountId } from '@electron/services/providers/provider-store';
import { getProviderSecret } from '@electron/services/secrets/secret-store';
import { getProviderDefaultModel } from '@electron/utils/provider-registry';
import type { ProviderAccount, ProviderSecret } from '@electron/shared/providers/types';
import { getCcConnectCodexHomeDir, getCcConnectProviderProfilePath } from './cc-connect-paths';

export type CodexProviderProfile = {
  providerId: string | null;
  vendorId: string | null;
  label?: string;
  authMode?: string;
  model?: string;
  modelRef?: string;
  supported: boolean;
  unsupportedReason?: string;
  codexArgs: string[];
  env?: Record<string, string>;
  envKeys?: string[];
  secretAvailable: boolean;
  codexHomeDir?: string;
  updatedAt: string;
};

type OpenAIOAuthTokenSet = {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  accountId: string;
};

function resolveModel(account: ProviderAccount): string | undefined {
  const model = account.model?.trim();
  if (model) return model;
  return getProviderDefaultModel(account.vendorId)?.trim() || undefined;
}

function publicProfile(profile: CodexProviderProfile): CodexProviderProfile {
  const { env, ...rest } = profile;
  return {
    ...rest,
    envKeys: Object.keys(env ?? {}),
  };
}

async function writeManagedOpenAIOAuthAuthFile(
  tokens: OpenAIOAuthTokenSet,
): Promise<string> {
  const codexHomeDir = getCcConnectCodexHomeDir();
  await mkdir(codexHomeDir, { recursive: true });
  const authPath = join(codexHomeDir, 'auth.json');

  await writeFile(authPath, JSON.stringify({
    auth_mode: 'chatgpt',
    OPENAI_API_KEY: null,
    tokens: {
      id_token: tokens.idToken,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      account_id: tokens.accountId,
    },
    last_refresh: new Date().toISOString(),
  }, null, 2), { encoding: 'utf8', mode: 0o600 });
  await chmod(authPath, 0o600).catch(() => {});
  return codexHomeDir;
}

async function resolveOpenAIOAuthTokens(
  account: ProviderAccount,
  secret: Extract<ProviderSecret, { type: 'oauth' }>,
): Promise<OpenAIOAuthTokenSet | undefined> {
  const stored = secret.idToken?.trim();
  if (stored) {
    return {
      idToken: stored,
      accessToken: secret.accessToken,
      refreshToken: secret.refreshToken,
      accountId: secret.subject?.trim() || account.id,
    };
  }

  const authPath = join(app.getPath('home'), '.codex', 'auth.json');
  try {
    const auth = JSON.parse(await readFile(authPath, 'utf8')) as {
      tokens?: {
        id_token?: unknown;
        access_token?: unknown;
        refresh_token?: unknown;
        account_id?: unknown;
      };
    };
    const tokens = auth.tokens;
    if (
      !tokens ||
      typeof tokens.id_token !== 'string' ||
      typeof tokens.access_token !== 'string' ||
      typeof tokens.refresh_token !== 'string' ||
      typeof tokens.account_id !== 'string' ||
      !tokens.id_token.trim() ||
      !tokens.access_token.trim() ||
      !tokens.refresh_token.trim() ||
      !tokens.account_id.trim()
    ) {
      return undefined;
    }

    const expectedAccountId = secret.subject?.trim();
    const userAccountId = typeof tokens.account_id === 'string' ? tokens.account_id.trim() : '';
    const accessMatches = typeof tokens.access_token === 'string' && tokens.access_token === secret.accessToken;
    const refreshMatches = typeof tokens.refresh_token === 'string' && tokens.refresh_token === secret.refreshToken;
    const accountMatches = Boolean(expectedAccountId && userAccountId && expectedAccountId === userAccountId);
    const providerIdMatches = Boolean(userAccountId && account.id === userAccountId);

    if (accessMatches || refreshMatches || accountMatches || providerIdMatches) {
      return {
        idToken: tokens.id_token.trim(),
        accessToken: tokens.access_token.trim(),
        refreshToken: tokens.refresh_token.trim(),
        accountId: tokens.account_id.trim(),
      };
    }
  } catch {
    return undefined;
  }

  return undefined;
}

async function buildProfileForAccount(account: ProviderAccount): Promise<CodexProviderProfile> {
  const secret = await getProviderSecret(account.id);
  const model = resolveModel(account);
  const base = {
    providerId: account.id,
    vendorId: account.vendorId,
    label: account.label,
    authMode: account.authMode,
    model,
    modelRef: model ? `${account.vendorId}/${model}` : undefined,
    secretAvailable: Boolean(secret),
    updatedAt: new Date().toISOString(),
  };

  if (account.vendorId === 'openai') {
    if (account.authMode === 'oauth_browser') {
      if (secret?.type !== 'oauth' || !secret.accessToken || !secret.refreshToken) {
        return {
          ...base,
          supported: false,
          unsupportedReason: 'OpenAI OAuth credentials are missing. Sign in to OpenAI again before using cc-connect Codex runtime.',
          codexArgs: [],
        };
      }
      const tokens = await resolveOpenAIOAuthTokens(account, secret);
      if (!tokens) {
        return {
          ...base,
          supported: false,
          unsupportedReason: 'OpenAI OAuth credentials are missing an id_token required by Codex. Sign in to OpenAI again before using cc-connect Codex runtime.',
          codexArgs: [],
        };
      }
      const codexHomeDir = await writeManagedOpenAIOAuthAuthFile(tokens);
      return {
        ...base,
        supported: true,
        codexArgs: model ? ['--model', model] : [],
        env: { CODEX_HOME: codexHomeDir },
        codexHomeDir,
      };
    }

    const env: Record<string, string> = {};
    if ((secret?.type === 'api_key' || secret?.type === 'local') && secret.apiKey) {
      env.OPENAI_API_KEY = secret.apiKey;
    }
    return {
      ...base,
      supported: true,
      codexArgs: model ? ['--model', model] : [],
      env,
    };
  }

  if (account.vendorId === 'ollama') {
    return {
      ...base,
      supported: true,
      codexArgs: [
        '--oss',
        '--local-provider',
        'ollama',
        ...(model ? ['--model', model] : []),
      ],
    };
  }

  return {
    ...base,
    supported: false,
    unsupportedReason: `cc-connect Codex runtime currently supports OpenAI/Codex and Ollama provider accounts; "${account.vendorId}" is not supported yet.`,
    codexArgs: [],
  };
}

export async function syncCcConnectProviderProfile(
  payload?: { providerId?: string; reason?: string },
): Promise<CodexProviderProfile> {
  const providerId = payload?.providerId?.trim() || await getDefaultProviderAccountId();
  const account = providerId ? await getProviderAccount(providerId) : null;
  const profile: CodexProviderProfile = account
    ? await buildProfileForAccount(account)
    : {
        providerId: null,
        vendorId: null,
        supported: true,
        codexArgs: [],
        secretAvailable: false,
        updatedAt: new Date().toISOString(),
      };

  const profilePath = getCcConnectProviderProfilePath();
  await mkdir(dirname(profilePath), { recursive: true });
  await writeFile(profilePath, JSON.stringify({
    ...publicProfile(profile),
    reason: payload?.reason ?? 'sync',
  }, null, 2), 'utf8');
  return profile;
}

export function toPublicCodexProviderProfile(profile: CodexProviderProfile): CodexProviderProfile {
  return publicProfile(profile);
}
