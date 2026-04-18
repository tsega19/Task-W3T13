import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BackupService, BACKUP_RESTORE_MAX_BYTES } from './backup.service';
import { NotificationService } from '../../core/services/notification.service';
import { LoggerService } from '../../logging/logger.service';

function humanBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(0)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

@Component({
  selector: 'fc-backup',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="container">
      <h2>Backup &amp; Restore</h2>
      <div class="card">
        <h3>Export</h3>
        <p>Download a full JSON bundle of all local data.</p>
        <button type="button" class="primary" (click)="doExport()" data-testid="backup-export">Export bundle</button>
      </div>
      <div class="card">
        <h3>Restore</h3>
        <p class="warn">Restoring wipes current data and loads the uploaded bundle. The audit log is append-only and is preserved.</p>
        <p class="muted small">Maximum bundle size: {{ maxBytesLabel }}</p>
        <input type="file" accept="application/json" (change)="doRestore($event)" data-testid="backup-restore" />
      </div>
    </div>
  `,
  styles: [`.warn { color: var(--warning); } .small { font-size: 11px; } .muted { color: var(--muted); }`]
})
export class BackupComponent {
  private readonly svc = inject(BackupService);
  private readonly notif = inject(NotificationService);
  private readonly logger = inject(LoggerService);
  readonly maxBytesLabel = humanBytes(BACKUP_RESTORE_MAX_BYTES);

  async doExport(): Promise<void> {
    try {
      const bundle = await this.svc.export();
      const blob = new Blob([JSON.stringify(bundle)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `flowcanvas-backup-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      this.notif.success('Backup exported.');
    } catch (e) {
      this.logger.error('backup', 'export-ui', 'failed', { error: String(e) });
      this.notif.error('Export failed.');
    }
  }

  async doRestore(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > BACKUP_RESTORE_MAX_BYTES) {
      const msg = `Backup bundle too large (${humanBytes(file.size)}). Maximum allowed is ${this.maxBytesLabel}.`;
      this.logger.warn('backup', 'restore-ui', 'rejected oversized bundle', { sizeBytes: file.size, maxBytes: BACKUP_RESTORE_MAX_BYTES });
      this.notif.error(msg);
      input.value = '';
      return;
    }
    if (file.size === 0) {
      this.notif.error('Backup bundle is empty.');
      input.value = '';
      return;
    }
    try {
      const text = await file.text();
      const bundle = JSON.parse(text);
      await this.svc.restore(bundle);
      this.notif.success('Backup restored. Reload to see changes.');
    } catch (e) {
      this.logger.error('backup', 'restore-ui', 'failed', { error: String(e) });
      this.notif.error('Restore failed: ' + (e as Error).message);
    }
  }
}
