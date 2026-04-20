import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { LoggerService } from '../../logging/logger.service';

@Component({
  selector: 'fc-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="login-wrap">
      <form class="card login-card" (ngSubmit)="submit()" autocomplete="off">
        <h2>Sign in to FlowCanvas</h2>
        <label>
          Username
          <input name="username" [(ngModel)]="username" data-testid="login-username" autocomplete="username" required />
        </label>
        <label>
          Passphrase
          <input type="password" name="passphrase" [(ngModel)]="passphrase" data-testid="login-passphrase" autocomplete="current-password" required />
        </label>
        <button type="submit" class="primary" [disabled]="busy() || cooldownMs() > 0" data-testid="login-submit">
          {{ busy() ? 'Checking…' : (cooldownMs() > 0 ? 'Locked' : 'Sign in') }}
        </button>
        <p class="error" *ngIf="errorMsg()" data-testid="login-error">{{ errorMsg() }}</p>
        <p class="muted" *ngIf="cooldownMs() > 0" data-testid="login-cooldown">
          Too many failed attempts. Try again in {{ cooldownLabel() }}.
        </p>
        <details class="seed-hints">
          <summary>Seeded accounts (demo defaults — override via env before any real use)</summary>
          <ul>
            <li>admin / demo-change-me-admin</li>
            <li>editor / demo-change-me-editor</li>
            <li>reviewer / demo-change-me-reviewer</li>
          </ul>
        </details>
      </form>
    </div>
  `,
  styles: [`
    .login-wrap { display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }
    .login-card { width: 360px; display: flex; flex-direction: column; gap: 12px; }
    label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--muted); }
    .seed-hints { margin-top: 10px; font-size: 12px; color: var(--muted); }
  `]
})
export class LoginComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly logger = inject(LoggerService);

  username = '';
  passphrase = '';
  errorMsg = signal<string>('');
  busy = signal<boolean>(false);
  cooldownMs = signal<number>(0);
  private cdTimer: ReturnType<typeof setInterval> | null = null;

  async ngOnInit(): Promise<void> {
    if (this.auth.session()) {
      await this.router.navigate(['/projects']);
    }
  }

  ngOnDestroy(): void {
    if (this.cdTimer) clearInterval(this.cdTimer);
  }

  cooldownLabel(): string {
    const ms = this.cooldownMs();
    const s = Math.ceil(ms / 1000);
    const m = Math.floor(s / 60);
    const rs = s % 60;
    return `${m}:${rs.toString().padStart(2, '0')}`;
  }

  private startCooldownTimer(until: number): void {
    if (this.cdTimer) clearInterval(this.cdTimer);
    const tick = (): void => {
      const left = until - Date.now();
      if (left <= 0) {
        this.cooldownMs.set(0);
        if (this.cdTimer) clearInterval(this.cdTimer);
        this.cdTimer = null;
      } else {
        this.cooldownMs.set(left);
      }
    };
    tick();
    this.cdTimer = setInterval(tick, 1000);
  }

  async submit(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.errorMsg.set('');
    try {
      const res = await this.auth.attemptLogin(this.username, this.passphrase);
      if (res.ok) {
        this.passphrase = '';
        await this.router.navigate(['/projects']);
        return;
      }
      if (res.reason === 'cooldown' && res.cooldownUntil) {
        this.startCooldownTimer(res.cooldownUntil);
        this.errorMsg.set('Account temporarily locked after too many failed attempts.');
      } else {
        const left = res.attemptsLeft ?? 0;
        this.errorMsg.set(`Invalid credentials. ${left > 0 ? left + ' attempt(s) remaining.' : ''}`);
      }
    } catch (e) {
      this.logger.error('auth', 'login-ui', 'unexpected error', { error: String(e) });
      this.errorMsg.set('Unexpected error. Please try again.');
    } finally {
      this.busy.set(false);
    }
  }
}
