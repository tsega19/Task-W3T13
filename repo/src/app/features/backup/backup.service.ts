import { Injectable, inject } from '@angular/core';
import { DbService, StoreName } from '../../core/services/db.service';
import { AuthService } from '../../core/services/auth.service';
import { PermissionService } from '../../core/services/permission.service';
import { LoggerService } from '../../logging/logger.service';
import { AuditService } from '../../core/services/audit.service';
import { AppConfigService } from '../../config/app-config.service';
import { trace } from '../../core/services/tracing.util';
import { AuditEntry } from '../../core/models/models';

interface BackupBundle {
  version: 1;
  exportedAt: number;
  stores: Record<string, unknown[]>;
}

const STORES: StoreName[] = ['users', 'projects', 'canvases', 'versions', 'reviews', 'tickets', 'audit_log', 'blobs'];
// audit_log is append-only / immutable — never wiped during a restore.
const NON_WIPE_STORES: ReadonlySet<StoreName> = new Set<StoreName>(['audit_log']);

// Hard cap on the JSON payload we will parse during restore (100 MB).
// Keep in sync with UI guidance in BackupComponent.
export const BACKUP_RESTORE_MAX_BYTES = 100 * 1024 * 1024;

@Injectable({ providedIn: 'root' })
export class BackupService {
  private readonly db = inject(DbService);
  private readonly auth = inject(AuthService);
  private readonly perm = inject(PermissionService);
  private readonly logger = inject(LoggerService);
  private readonly audit = inject(AuditService);
  private readonly cfg = inject(AppConfigService);

  async export(): Promise<BackupBundle> {
    this.perm.enforce('backup.manage');
    const slowMs = this.cfg.get().diagnostics.slowMs;
    return trace(this.logger, 'backup.export', slowMs, async () => {
      const stores: Record<string, unknown[]> = {};
      for (const s of STORES) {
        const rows = await this.db.all(s);
        stores[s] = s === 'blobs' ? rows.map((r) => this.serializeBlob(r)) : rows;
      }
      const bundle: BackupBundle = { version: 1, exportedAt: Date.now(), stores };
      await this.audit.record(this.auth.session(), 'backup.export', 'backup', 'bundle');
      return bundle;
    });
  }

  async restore(bundle: BackupBundle): Promise<void> {
    this.perm.enforce('backup.manage');
    if (bundle.version !== 1) throw new Error('Unsupported backup version.');
    const slowMs = this.cfg.get().diagnostics.slowMs;
    await trace(this.logger, 'backup.restore', slowMs, async () => {
      // Record a pre-restore immutable event (captured BEFORE restore runs).
      await this.audit.record(this.auth.session(), 'backup.restore.begin', 'backup', 'bundle');

      // Capture the existing immutable audit log; it must survive the restore.
      const existingAudit = (await this.db.all('audit_log')) as AuditEntry[];

      for (const s of STORES) {
        if (NON_WIPE_STORES.has(s)) {
          // Append incoming audit rows to the existing immutable log;
          // never clear the store.
          const rows = (bundle.stores[s] ?? []) as Array<Record<string, unknown>>;
          const existingIds = new Set(existingAudit.map((e) => e.id));
          for (const r of rows) {
            const id = String((r as { id?: unknown }).id ?? '');
            if (!id || existingIds.has(id)) continue;
            await this.db.put(s, r as { id: string });
            existingIds.add(id);
          }
          continue;
        }
        await this.db.clear(s);
        const rows = (bundle.stores[s] ?? []) as Array<Record<string, unknown>>;
        for (const r of rows) {
          const value = s === 'blobs' ? this.deserializeBlob(r) : r;
          await this.db.put(s, value as { id: string });
        }
      }

      // Post-restore immutable event with counts — recorded after the restore
      // finishes so the audit timeline has a verifiable bookend pair.
      await this.audit.record(
        this.auth.session(),
        'backup.restore.complete',
        'backup',
        'bundle',
        `preserved ${existingAudit.length} pre-restore audit entries`
      );
      this.logger.info('backup', 'restore', 'bundle restored', { preservedAudit: existingAudit.length });
    });
  }

  private serializeBlob(rec: unknown): Record<string, unknown> {
    const r = rec as { key: string; name: string; mimeType: string; sizeBytes: number; data: ArrayBuffer; createdAt: number };
    return {
      key: r.key,
      name: r.name,
      mimeType: r.mimeType,
      sizeBytes: r.sizeBytes,
      createdAt: r.createdAt,
      dataBase64: arrayBufferToBase64(r.data)
    };
  }

  private deserializeBlob(raw: Record<string, unknown>): Record<string, unknown> {
    return {
      key: raw['key'],
      name: raw['name'],
      mimeType: raw['mimeType'],
      sizeBytes: raw['sizeBytes'],
      createdAt: raw['createdAt'],
      data: base64ToArrayBuffer(String(raw['dataBase64'] ?? ''))
    };
  }
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  if (!b64) return new ArrayBuffer(0);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}
