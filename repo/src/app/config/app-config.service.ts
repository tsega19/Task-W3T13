import { Injectable } from '@angular/core';

export interface SeededUserConfig {
  username: string;
  passphrase: string;
  role: 'admin' | 'editor' | 'reviewer';
}

export interface AppConfig {
  appName: string;
  appPort: number;
  enableTls: boolean;
  auth: {
    maxFailedAttempts: number;
    cooldownMinutes: number;
    inactivityMinutes: number;
  };
  projects: {
    max: number;
    canvasMaxPerProject: number;
  };
  canvas: {
    elementCap: number;
    autosaveMs: number;
    versionGapMs: number;
    maxVersions: number;
    undoLimit: number;
  };
  importExport: {
    maxNodes: number;
    imageMaxBytes: number;
  };
  diagnostics: {
    storageWarnPct: number;
    capWarnPct: number;
    slowMs: number;
  };
  seededUsers: SeededUserConfig[];
}

type EnvDict = Record<string, string | undefined>;

interface GlobalWithEnv { __FC_ENV__?: EnvDict; }

function readEnv(): EnvDict {
  if (typeof globalThis !== 'undefined') {
    const g = globalThis as unknown as GlobalWithEnv;
    if (g.__FC_ENV__ && typeof g.__FC_ENV__ === 'object') {
      return g.__FC_ENV__;
    }
  }
  return {};
}

function asInt(v: string | undefined, fallback: number): number {
  if (v === undefined || v === '') return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function asBool(v: string | undefined, fallback: boolean): boolean {
  if (v === undefined) return fallback;
  return v === 'true' || v === '1' || v === 'yes';
}

function asStr(v: string | undefined, fallback: string): string {
  return v && v.length > 0 ? v : fallback;
}

export function buildAppConfig(env: EnvDict = readEnv()): AppConfig {
  return {
    appName: asStr(env['APP_NAME'], 'FlowCanvas Offline Studio'),
    appPort: asInt(env['APP_PORT'], 4200),
    enableTls: asBool(env['ENABLE_TLS'], false),
    auth: {
      maxFailedAttempts: asInt(env['AUTH_MAX_FAILED_ATTEMPTS'], 3),
      cooldownMinutes: asInt(env['AUTH_COOLDOWN_MINUTES'], 15),
      inactivityMinutes: asInt(env['AUTH_INACTIVITY_MINUTES'], 30)
    },
    projects: {
      max: asInt(env['PROJECTS_MAX'], 50),
      canvasMaxPerProject: asInt(env['CANVAS_MAX_PER_PROJECT'], 20)
    },
    canvas: {
      elementCap: asInt(env['CANVAS_ELEMENT_CAP'], 5000),
      autosaveMs: asInt(env['CANVAS_AUTOSAVE_MS'], 10000),
      versionGapMs: asInt(env['CANVAS_VERSION_GAP_MS'], 60000),
      maxVersions: asInt(env['CANVAS_MAX_VERSIONS'], 30),
      undoLimit: asInt(env['CANVAS_UNDO_LIMIT'], 200)
    },
    importExport: {
      maxNodes: asInt(env['IMPORT_MAX_NODES'], 1000),
      imageMaxBytes: asInt(env['IMAGE_MAX_BYTES'], 52_428_800)
    },
    diagnostics: {
      storageWarnPct: asInt(env['DIAG_STORAGE_WARN_PCT'], 75),
      capWarnPct: asInt(env['DIAG_CAP_WARN_PCT'], 80),
      slowMs: asInt(env['DIAG_SLOW_MS'], 500)
    },
    seededUsers: [
      {
        username: asStr(env['SEED_ADMIN_USERNAME'], 'admin'),
        passphrase: asStr(env['SEED_ADMIN_PASSPHRASE'], 'demo-change-me-admin'),
        role: 'admin'
      },
      {
        username: asStr(env['SEED_EDITOR_USERNAME'], 'editor'),
        passphrase: asStr(env['SEED_EDITOR_PASSPHRASE'], 'demo-change-me-editor'),
        role: 'editor'
      },
      {
        username: asStr(env['SEED_REVIEWER_USERNAME'], 'reviewer'),
        passphrase: asStr(env['SEED_REVIEWER_PASSPHRASE'], 'demo-change-me-reviewer'),
        role: 'reviewer'
      }
    ]
  };
}

@Injectable({ providedIn: 'root' })
export class AppConfigService {
  private readonly value: AppConfig = buildAppConfig();
  get(): AppConfig {
    return this.value;
  }
}
