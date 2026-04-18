import '../../../test-setup';
import { TestBed } from '@angular/core/testing';
import { AdminService } from './admin.service';
import { AppConfigService, buildAppConfig } from '../../config/app-config.service';
import { AuthService } from '../../core/services/auth.service';
import { signal } from '@angular/core';
import { SessionInfo } from '../../core/models/models';

describe('AdminService', () => {
  beforeEach(async () => {
    (globalThis as unknown as { __resetIndexedDB: () => void }).__resetIndexedDB();
    localStorage.clear();
    const session = signal<SessionInfo | null>({ userId: 'u', username: 'u', role: 'admin', issuedAt: 1, lastActivity: 1 });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AppConfigService, useValue: { get: () => buildAppConfig() } as AppConfigService },
        { provide: AuthService, useValue: { session, role: () => 'admin' } as unknown as AuthService }
      ]
    });
  });

  it('persists and reloads settings', async () => {
    const svc = TestBed.inject(AdminService);
    await svc.save({
      dictionaries: [{ id: '1', term: 't', definition: 'd' }],
      templates: [],
      tagPalette: ['alpha'],
      announcements: ['news']
    });
    expect(svc.settings().tagPalette).toEqual(['alpha']);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AppConfigService, useValue: { get: () => buildAppConfig() } as AppConfigService },
        { provide: AuthService, useValue: { session: signal(null), role: () => null } as unknown as AuthService }
      ]
    });
    const next = TestBed.inject(AdminService);
    expect(next.settings().tagPalette).toEqual(['alpha']);
  });
});