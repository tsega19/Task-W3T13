import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DbService } from '../../core/services/db.service';
import { AppConfigService } from '../../config/app-config.service';
import { AuditService } from '../../core/services/audit.service';
import { AuthService } from '../../core/services/auth.service';
import { LoggerService } from '../../logging/logger.service';
import { recentTraces, TraceEntry } from '../../core/services/tracing.util';
import { AuditEntry } from '../../core/models/models';

@Component({
  selector: 'fc-diagnostics',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="container">
      <h2>Diagnostics</h2>
      <div class="grid">
        <div class="card">
          <h3>Storage</h3>
          <p>Used: {{ prettyBytes(storage().usage) }} / {{ prettyBytes(storage().quota) }}</p>
          <p [class.warn]="storage().percent >= cfg.get().diagnostics.storageWarnPct">Usage: {{ storage().percent.toFixed(1) }}%</p>
          <p *ngIf="storage().percent >= cfg.get().diagnostics.storageWarnPct" class="warn">Approaching browser storage quota.</p>
        </div>
        <div class="card">
          <h3>Element counts</h3>
          <p>Projects: {{ counts().projects }}</p>
          <p>Canvases: {{ counts().canvases }}</p>
          <p>Versions: {{ counts().versions }}</p>
          <p>Reviews: {{ counts().reviews }}</p>
          <p>Tickets: {{ counts().tickets }}</p>
        </div>
        <div class="card">
          <h3>Performance</h3>
          <p>Rolling FPS: {{ fps().toFixed(1) }}</p>
          <p>Slow op threshold: {{ cfg.get().diagnostics.slowMs }} ms</p>
          <h4 class="mt">Recent traces</h4>
          <ul class="logs">
            <li *ngIf="traces().length === 0" class="muted">No traced operations yet.</li>
            <li *ngFor="let t of traces()" [class.warn]="t.slow" [attr.data-testid]="'trace-' + t.at">
              {{ t.action }} — {{ t.durationMs.toFixed(0) }} ms{{ t.slow ? ' (slow)' : '' }}
            </li>
          </ul>
        </div>
        <div class="card">
          <h3>Health check</h3>
          <button type="button" class="primary" (click)="runHealthCheck()" [disabled]="checking()" data-testid="diag-run-health">
            {{ checking() ? 'Running…' : 'Run checks' }}
          </button>
          <p *ngIf="lastCheck() as h" [class.warn]="!h.ok" data-testid="diag-health-result">
            {{ h.ok ? 'OK' : 'FAIL' }} · {{ h.durationMs.toFixed(0) }} ms · {{ h.detail }}
          </p>
          <p class="muted small">Also re-reads storage estimate and records the result to the immutable audit timeline.</p>
        </div>
        <div class="card">
          <h3>Recent log</h3>
          <ul class="logs">
            <li *ngFor="let l of recentLogs()" [attr.data-testid]="'log-' + l.ts">
              <span class="badge">{{ l.level }}</span>
              [{{ l.module }}][{{ l.submodule }}] {{ l.message }}
            </li>
          </ul>
        </div>
      </div>
      <div class="card">
        <h3>Audit timeline</h3>
        <ul class="audit">
          <li *ngFor="let a of audit()" [attr.data-testid]="'audit-' + a.id">
            <span class="muted">{{ formatDate(a.timestamp) }}</span>
            <span>{{ a.username }}</span>
            <span>{{ a.action }}</span>
            <span class="muted">{{ a.entityType }}:{{ a.entityId.slice(0, 8) }}</span>
          </li>
        </ul>
      </div>
    </div>
  `,
  styles: [`
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; margin-bottom: 12px; }
    .warn { color: var(--warning); }
    .logs, .audit { list-style: none; padding: 0; max-height: 260px; overflow-y: auto; font-family: monospace; font-size: 12px; }
    .logs li, .audit li { padding: 2px 0; border-bottom: 1px dashed var(--border); display: flex; gap: 8px; }
    .badge { text-transform: uppercase; padding: 0 6px; border-radius: 4px; background: var(--surface-2); font-size: 10px; }
    .mt { margin-top: 10px; }
    .muted { color: var(--muted); }
    .small { font-size: 11px; }
  `]
})
export class DiagnosticsComponent implements OnInit, OnDestroy {
  private readonly db = inject(DbService);
  readonly cfg = inject(AppConfigService);
  private readonly auditSvc = inject(AuditService);
  private readonly auth = inject(AuthService);
  private readonly logger = inject(LoggerService);

  storage = signal<{ usage: number; quota: number; percent: number }>({ usage: 0, quota: 0, percent: 0 });
  counts = signal<{ projects: number; canvases: number; versions: number; reviews: number; tickets: number }>({
    projects: 0, canvases: 0, versions: 0, reviews: 0, tickets: 0
  });
  fps = signal<number>(0);
  recentLogs = signal(this.logger.recent().slice(-50).reverse());
  audit = signal<AuditEntry[]>([]);
  traces = signal<TraceEntry[]>([]);
  checking = signal<boolean>(false);
  lastCheck = signal<{ ok: boolean; durationMs: number; detail: string } | null>(null);
  private lastThresholdAlertAt = 0;

  private rafId: number | null = null;
  private frames: number[] = [];

  async ngOnInit(): Promise<void> {
    await this.refresh();
    this.startFps();
  }

  ngOnDestroy(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
  }

  async refresh(): Promise<void> {
    const storage = await this.db.storageEstimate();
    this.storage.set(storage);
    this.counts.set({
      projects: await this.db.count('projects'),
      canvases: await this.db.count('canvases'),
      versions: await this.db.count('versions'),
      reviews: await this.db.count('reviews'),
      tickets: await this.db.count('tickets')
    });
    this.audit.set((await this.auditSvc.list()).slice(0, 100));
    this.recentLogs.set(this.logger.recent().slice(-50).reverse());
    this.traces.set(recentTraces().slice(-20).reverse());
    await this.maybeRecordThresholdAlert(storage.percent);
  }

  async runHealthCheck(): Promise<void> {
    if (this.checking()) return;
    this.checking.set(true);
    try {
      const result = await this.db.healthCheck();
      this.lastCheck.set(result);
      await this.auditSvc.record(
        this.auth.session(),
        result.ok ? 'diagnostics.healthcheck.ok' : 'diagnostics.healthcheck.fail',
        'diagnostics',
        'idb',
        result.detail,
        result.durationMs
      );
      await this.refresh();
    } finally {
      this.checking.set(false);
    }
  }

  private async maybeRecordThresholdAlert(percent: number): Promise<void> {
    const threshold = this.cfg.get().diagnostics.storageWarnPct;
    if (percent < threshold) return;
    // Debounce alerts so we record at most once per hour per session.
    if (Date.now() - this.lastThresholdAlertAt < 60 * 60 * 1000) return;
    this.lastThresholdAlertAt = Date.now();
    this.logger.warn('diagnostics', 'threshold', 'storage usage over threshold', { percent, threshold });
    await this.auditSvc.record(
      this.auth.session(),
      'diagnostics.alert.storage',
      'diagnostics',
      'storage',
      `usage ${percent.toFixed(1)}% >= ${threshold}%`
    );
  }

  prettyBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  formatDate(ms: number): string {
    return new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
  }

  private startFps(): void {
    if (typeof requestAnimationFrame === 'undefined') return;
    let last = performance.now();
    const loop = (now: number): void => {
      const delta = now - last;
      last = now;
      const instant = delta > 0 ? 1000 / delta : 0;
      this.frames.push(instant);
      if (this.frames.length > 60) this.frames.shift();
      const avg = this.frames.reduce((s, v) => s + v, 0) / this.frames.length;
      this.fps.set(avg);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }
}
