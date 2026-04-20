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

  it('hydrates legacy settings from localStorage by filling defaults for every missing collection', () => {
    // Seed a pre-channels/topics/featuredSlots shape; only `dictionaries` and
    // `tagPalette` are present. This forces hydrate()'s `??` fallbacks on
    // templates / announcements / channels / topics / featuredSlots.
    localStorage.setItem('fc_admin_settings', JSON.stringify({
      dictionaries: [{ id: 'd', term: 't', definition: 'x' }],
      tagPalette: ['legacy']
    }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AppConfigService, useValue: { get: () => buildAppConfig() } as AppConfigService },
        { provide: AuthService, useValue: { session: signal<SessionInfo | null>(null), role: () => null } as unknown as AuthService }
      ]
    });
    const svc = TestBed.inject(AdminService);
    const s = svc.settings();
    expect(s.dictionaries).toHaveLength(1);
    expect(s.tagPalette).toEqual(['legacy']);
    // Missing collections must be empty arrays (each `?? []` fallback).
    expect(s.templates).toEqual([]);
    expect(s.announcements).toEqual([]);
    expect(s.channels).toEqual([]);
    expect(s.topics).toEqual([]);
    // Missing featuredSlots must default to the policy defaults.
    expect(s.featuredSlots).toEqual({ maxSlots: 1, rotationDays: 14 });
  });

  it('hydrates partial featuredSlots policy by falling back only on the missing scalar', () => {
    // featuredSlots is present but maxSlots is absent → inner `??` kicks in for maxSlots only.
    localStorage.setItem('fc_admin_settings', JSON.stringify({ featuredSlots: { rotationDays: 7 } }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AppConfigService, useValue: { get: () => buildAppConfig() } as AppConfigService },
        { provide: AuthService, useValue: { session: signal<SessionInfo | null>(null), role: () => null } as unknown as AuthService }
      ]
    });
    expect(TestBed.inject(AdminService).settings().featuredSlots).toEqual({ maxSlots: 1, rotationDays: 7 });

    // Vice-versa: rotationDays absent → fallback to default 14, maxSlots preserved.
    localStorage.clear();
    localStorage.setItem('fc_admin_settings', JSON.stringify({ featuredSlots: { maxSlots: 5 } }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AppConfigService, useValue: { get: () => buildAppConfig() } as AppConfigService },
        { provide: AuthService, useValue: { session: signal<SessionInfo | null>(null), role: () => null } as unknown as AuthService }
      ]
    });
    expect(TestBed.inject(AdminService).settings().featuredSlots).toEqual({ maxSlots: 5, rotationDays: 14 });
  });

  it('persists and reloads settings', async () => {
    const svc = TestBed.inject(AdminService);
    await svc.save({
      dictionaries: [{ id: '1', term: 't', definition: 'd' }],
      templates: [],
      tagPalette: ['alpha'],
      announcements: ['news'],
      channels: [],
      topics: [],
      featuredSlots: { maxSlots: 1, rotationDays: 14 }
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