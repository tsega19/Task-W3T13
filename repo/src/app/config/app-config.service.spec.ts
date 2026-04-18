import '../../test-setup';
import { AppConfigService, buildAppConfig } from './app-config.service';

describe('AppConfigService', () => {
  it('builds defaults when env is empty', () => {
    const cfg = buildAppConfig({});
    expect(cfg.appName).toBe('FlowCanvas Offline Studio');
    expect(cfg.appPort).toBe(4200);
    expect(cfg.enableTls).toBe(false);
    expect(cfg.auth.maxFailedAttempts).toBe(3);
    expect(cfg.seededUsers).toHaveLength(3);
  });

  it('overrides values from env', () => {
    const cfg = buildAppConfig({
      APP_NAME: 'Test',
      APP_PORT: '1234',
      ENABLE_TLS: 'true',
      AUTH_MAX_FAILED_ATTEMPTS: '5',
      AUTH_COOLDOWN_MINUTES: '10',
      AUTH_INACTIVITY_MINUTES: '20',
      PROJECTS_MAX: '100',
      CANVAS_MAX_PER_PROJECT: '30',
      CANVAS_ELEMENT_CAP: '1000',
      CANVAS_AUTOSAVE_MS: '2000',
      CANVAS_VERSION_GAP_MS: '5000',
      CANVAS_MAX_VERSIONS: '15',
      CANVAS_UNDO_LIMIT: '50',
      IMPORT_MAX_NODES: '500',
      IMAGE_MAX_BYTES: '1000',
      DIAG_STORAGE_WARN_PCT: '60',
      DIAG_CAP_WARN_PCT: '70',
      DIAG_SLOW_MS: '300',
      SEED_ADMIN_USERNAME: 'a',
      SEED_ADMIN_PASSPHRASE: 'pa',
      SEED_EDITOR_USERNAME: 'b',
      SEED_EDITOR_PASSPHRASE: 'pb',
      SEED_REVIEWER_USERNAME: 'c',
      SEED_REVIEWER_PASSPHRASE: 'pc'
    });
    expect(cfg.appName).toBe('Test');
    expect(cfg.appPort).toBe(1234);
    expect(cfg.enableTls).toBe(true);
    expect(cfg.auth.maxFailedAttempts).toBe(5);
    expect(cfg.canvas.elementCap).toBe(1000);
    expect(cfg.seededUsers[0].username).toBe('a');
  });

  it('falls back when int parse fails', () => {
    const cfg = buildAppConfig({ APP_PORT: 'abc', CANVAS_ELEMENT_CAP: '' });
    expect(cfg.appPort).toBe(4200);
    expect(cfg.canvas.elementCap).toBe(5000);
  });

  it('service provides value', () => {
    const s = new AppConfigService();
    expect(s.get().appName.length).toBeGreaterThan(0);
  });

  it('reads from window.__FC_ENV__ when present', () => {
    const g = globalThis as unknown as { __FC_ENV__?: Record<string, string> };
    g.__FC_ENV__ = { APP_NAME: 'From Window', CANVAS_ELEMENT_CAP: '12' };
    const cfg = buildAppConfig();
    expect(cfg.appName).toBe('From Window');
    expect(cfg.canvas.elementCap).toBe(12);
    delete g.__FC_ENV__;
  });

  it('asBool recognizes truthy forms', () => {
    expect(buildAppConfig({ ENABLE_TLS: '1' }).enableTls).toBe(true);
    expect(buildAppConfig({ ENABLE_TLS: 'yes' }).enableTls).toBe(true);
    expect(buildAppConfig({ ENABLE_TLS: 'no' }).enableTls).toBe(false);
  });
});