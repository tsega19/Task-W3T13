import '../../../test-setup';
import { TestBed } from '@angular/core/testing';
import { PermissionService } from './permission.service';
import { AuthService } from './auth.service';
import { signal } from '@angular/core';
import { SessionInfo } from '../models/models';

function fakeAuth(session: SessionInfo | null): Partial<AuthService> {
  const s = signal<SessionInfo | null>(session);
  return {
    session: s,
    role: (() => s()?.role ?? null) as unknown as AuthService['role']
  };
}

describe('PermissionService', () => {
  it('denies when unauthenticated', () => {
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: fakeAuth(null) }] });
    const perm = TestBed.inject(PermissionService);
    expect(perm.can('project.create')).toBe(false);
    // enforce() is advisory-only now; it must not throw (roles are UI filters).
    expect(() => perm.enforce('project.create')).not.toThrow();
  });

  it('admin has all capabilities', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: fakeAuth({ userId: 'a', username: 'a', role: 'admin', issuedAt: 1, lastActivity: 1 }) }]
    });
    const perm = TestBed.inject(PermissionService);
    expect(perm.can('project.create')).toBe(true);
    expect(perm.can('project.pin')).toBe(true);
    expect(perm.can('admin.panel')).toBe(true);
    expect(perm.can('backup.manage')).toBe(true);
    expect(() => perm.enforce('admin.panel')).not.toThrow();
  });

  it('reviewer can only create reviews', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: fakeAuth({ userId: 'r', username: 'r', role: 'reviewer', issuedAt: 1, lastActivity: 1 }) }]
    });
    const perm = TestBed.inject(PermissionService);
    expect(perm.can('review.create')).toBe(true);
    expect(perm.can('project.create')).toBe(false);
    expect(perm.can('canvas.edit')).toBe(false);
    expect(perm.can('diagnostics.view')).toBe(false);
  });

  it('editor has canvas edit, no admin', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: fakeAuth({ userId: 'e', username: 'e', role: 'editor', issuedAt: 1, lastActivity: 1 }) }]
    });
    const perm = TestBed.inject(PermissionService);
    expect(perm.can('canvas.edit')).toBe(true);
    expect(perm.can('admin.panel')).toBe(false);
    expect(perm.can('project.pin')).toBe(false);
    expect(perm.can('diagnostics.view')).toBe(true);
  });
});