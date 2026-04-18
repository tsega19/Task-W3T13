import { Injectable, inject, signal, computed } from '@angular/core';
import { DbService } from './db.service';
import { AppConfigService } from '../../config/app-config.service';
import { LoggerService } from '../../logging/logger.service';
import { AuditService } from './audit.service';
import { NotificationService } from './notification.service';
import { sha256Hex, uuid } from './crypto.util';
import { SessionInfo, UserRecord, UserRole } from '../models/models';
import { LS_KEYS, lsGetJson, lsRemove, lsSetJson, lsGet, lsSet } from './session-storage.util';

export interface LoginAttemptResult {
  ok: boolean;
  reason?: 'invalid' | 'cooldown' | 'unknown';
  cooldownUntil?: number;
  attemptsLeft?: number;
}

const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click'] as const;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly db = inject(DbService);
  private readonly cfg = inject(AppConfigService);
  private readonly logger = inject(LoggerService);
  private readonly audit = inject(AuditService);
  private readonly notif = inject(NotificationService);

  readonly session = signal<SessionInfo | null>(null);
  readonly isAuthenticated = computed(() => this.session() !== null);
  readonly role = computed<UserRole | null>(() => this.session()?.role ?? null);

  private inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  private activityHandler: (() => void) | null = null;
  private seeded = false;

  async bootstrapSeed(): Promise<void> {
    if (this.seeded) return;
    const existing = await this.db.users.all();
    if (existing.length > 0) {
      this.seeded = true;
      return;
    }
    const now = Date.now();
    for (const u of this.cfg.get().seededUsers) {
      const rec: UserRecord = {
        id: uuid(),
        username: u.username.toLowerCase(),
        passwordHash: await sha256Hex(u.passphrase),
        role: u.role,
        createdAt: now,
        updatedAt: now,
        failedAttempts: 0
      };
      await this.db.users.put(rec);
    }
    this.seeded = true;
    this.logger.info('auth', 'seed', 'seeded default users');
  }

  restoreSession(): void {
    const s = lsGetJson<SessionInfo>(LS_KEYS.SESSION);
    if (!s) return;
    const idleMs = this.cfg.get().auth.inactivityMinutes * 60_000;
    if (Date.now() - s.lastActivity > idleMs) {
      this.logout('inactivity');
      return;
    }
    this.session.set({ ...s, lastActivity: Date.now() });
    lsSetJson(LS_KEYS.SESSION, { ...s, lastActivity: Date.now() });
  }

  async cooldownRemainingMs(username: string): Promise<number> {
    const key = LS_KEYS.COOLDOWN_PREFIX + username.toLowerCase();
    const raw = lsGet(key);
    if (!raw) return 0;
    const until = Number.parseInt(raw, 10);
    if (!Number.isFinite(until)) return 0;
    const remaining = until - Date.now();
    if (remaining <= 0) {
      lsRemove(key);
      return 0;
    }
    return remaining;
  }

  async attemptLogin(username: string, passphrase: string): Promise<LoginAttemptResult> {
    const uname = (username ?? '').trim().toLowerCase();
    if (!uname || !passphrase) {
      return { ok: false, reason: 'invalid', attemptsLeft: this.cfg.get().auth.maxFailedAttempts };
    }
    const cooldown = await this.cooldownRemainingMs(uname);
    if (cooldown > 0) {
      this.logger.warn('auth', 'login', 'blocked by cooldown', { username: uname });
      return { ok: false, reason: 'cooldown', cooldownUntil: Date.now() + cooldown };
    }
    const user = await this.db.users.byUsername(uname);
    if (!user) {
      return this.registerFailure(uname, 0);
    }
    const hash = await sha256Hex(passphrase);
    if (hash !== user.passwordHash) {
      return this.registerFailure(uname, user.failedAttempts, user);
    }
    user.failedAttempts = 0;
    user.lastLogin = Date.now();
    user.updatedAt = Date.now();
    await this.db.users.put(user);
    const session: SessionInfo = {
      userId: user.id,
      username: user.username,
      role: user.role,
      issuedAt: Date.now(),
      lastActivity: Date.now()
    };
    this.session.set(session);
    lsSetJson(LS_KEYS.SESSION, session);
    lsRemove(LS_KEYS.COOLDOWN_PREFIX + uname);
    this.logger.info('auth', 'login', 'success', { username: user.username, role: user.role });
    await this.audit.record(session, 'login', 'user', user.id);
    this.startInactivityWatch();
    return { ok: true };
  }

  private async registerFailure(uname: string, currentFailed: number, user?: UserRecord): Promise<LoginAttemptResult> {
    const authCfg = this.cfg.get().auth;
    const newCount = currentFailed + 1;
    if (user) {
      user.failedAttempts = newCount;
      user.updatedAt = Date.now();
      await this.db.users.put(user);
    }
    if (newCount >= authCfg.maxFailedAttempts) {
      const until = Date.now() + authCfg.cooldownMinutes * 60_000;
      lsSet(LS_KEYS.COOLDOWN_PREFIX + uname, String(until));
      if (user) { user.cooldownUntil = until; await this.db.users.put(user); }
      this.logger.warn('auth', 'login', 'cooldown engaged', { username: uname });
      return { ok: false, reason: 'cooldown', cooldownUntil: until };
    }
    this.logger.warn('auth', 'login', 'invalid credentials', { username: uname });
    return { ok: false, reason: 'invalid', attemptsLeft: authCfg.maxFailedAttempts - newCount };
  }

  logout(reason: 'manual' | 'inactivity' | 'forced' = 'manual'): void {
    const current = this.session();
    this.session.set(null);
    lsRemove(LS_KEYS.SESSION);
    this.stopInactivityWatch();
    if (current) {
      this.logger.info('auth', 'logout', 'session cleared', { reason });
      void this.audit.record(current, `logout-${reason}`, 'user', current.userId);
      if (reason === 'inactivity') {
        this.notif.warning('Signed out due to inactivity.');
      }
    }
  }

  touchActivity(): void {
    const s = this.session();
    if (!s) return;
    s.lastActivity = Date.now();
    lsSetJson(LS_KEYS.SESSION, s);
    this.scheduleInactivityTimeout();
  }

  startInactivityWatch(): void {
    if (typeof document === 'undefined' || this.activityHandler) return;
    const handler = (): void => this.touchActivity();
    for (const ev of ACTIVITY_EVENTS) {
      document.addEventListener(ev, handler, { passive: true });
    }
    this.activityHandler = handler;
    this.scheduleInactivityTimeout();
  }

  stopInactivityWatch(): void {
    if (typeof document !== 'undefined' && this.activityHandler) {
      for (const ev of ACTIVITY_EVENTS) {
        document.removeEventListener(ev, this.activityHandler);
      }
    }
    this.activityHandler = null;
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
  }

  private scheduleInactivityTimeout(): void {
    if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
    const idleMs = this.cfg.get().auth.inactivityMinutes * 60_000;
    this.inactivityTimer = setTimeout(() => {
      if (this.session()) this.logout('inactivity');
    }, idleMs);
  }

  hasRole(roles: UserRole[]): boolean {
    const s = this.session();
    if (!s) return false;
    return roles.includes(s.role);
  }
}
