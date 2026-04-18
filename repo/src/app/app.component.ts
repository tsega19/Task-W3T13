import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { AuthService } from './core/services/auth.service';
import { ToastContainerComponent } from './shared/components/toast-container.component';
import { ConflictBannerComponent } from './shared/components/conflict-banner.component';
import { DbService } from './core/services/db.service';
import { LoggerService } from './logging/logger.service';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'fc-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, ToastContainerComponent, ConflictBannerComponent],
  template: `
    <div class="app-shell" *ngIf="ready">
      <header class="top-nav" *ngIf="auth.session() as s">
        <div class="brand">FlowCanvas</div>
        <nav>
          <a routerLink="/projects" routerLinkActive="active">Projects</a>
          <a routerLink="/reviews" routerLinkActive="active">Reviews</a>
          <a *ngIf="canDiag(s.role)" routerLink="/diagnostics" routerLinkActive="active">Diagnostics</a>
          <a *ngIf="s.role === 'admin'" routerLink="/admin" routerLinkActive="active">Admin</a>
          <a *ngIf="s.role === 'admin'" routerLink="/backup" routerLinkActive="active">Backup</a>
        </nav>
        <div class="user-box">
          <span class="badge" [ngClass]="s.role">{{ s.role }}</span>
          <span>{{ s.username }}</span>
          <button type="button" (click)="logout()" data-testid="logout-btn">Logout</button>
        </div>
      </header>
      <main><router-outlet /></main>
      <fc-conflict-banner />
    </div>
    <div *ngIf="!ready" class="loading">Loading FlowCanvas…</div>
    <fc-toast-container />
  `,
  styles: [`
    .app-shell { display: flex; flex-direction: column; min-height: 100vh; }
    .top-nav { display: flex; align-items: center; gap: 24px; padding: 10px 20px; background: var(--bg-2); border-bottom: 1px solid var(--border); }
    .brand { font-weight: 700; color: var(--primary); font-size: 16px; }
    nav { display: flex; gap: 16px; flex: 1; }
    nav a { color: var(--muted); padding: 4px 8px; border-radius: 4px; }
    nav a.active { color: var(--text); background: var(--surface); }
    .user-box { display: flex; align-items: center; gap: 10px; }
    main { flex: 1; }
    .loading { padding: 40px; text-align: center; color: var(--muted); }
  `]
})
export class AppComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly db = inject(DbService);
  private readonly router = inject(Router);
  private readonly logger = inject(LoggerService);
  ready = false;

  async ngOnInit(): Promise<void> {
    try {
      await this.db.init();
      await this.auth.bootstrapSeed();
      this.auth.restoreSession();
      this.auth.startInactivityWatch();
    } catch (e) {
      this.logger.error('app', 'boot', 'initialization failed', { error: String(e) });
    }
    this.ready = true;
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
      if (!this.auth.session() && !this.router.url.startsWith('/login')) {
        void this.router.navigate(['/login']);
      }
    });
  }

  canDiag(role: string): boolean {
    return role === 'admin' || role === 'editor';
  }

  logout(): void {
    this.auth.logout('manual');
    void this.router.navigate(['/login']);
  }
}
