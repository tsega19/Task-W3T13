import '../../../test-setup';
import { TestBed } from '@angular/core/testing';
import { authGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';
import { Router, UrlTree, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { signal } from '@angular/core';
import { SessionInfo } from '../models/models';

function fakeRouter(): Router {
  const createUrlTree = jest.fn(() => ({} as UrlTree));
  return { createUrlTree } as unknown as Router;
}

function buildAuth(session: SessionInfo | null): Partial<AuthService> {
  const s = signal<SessionInfo | null>(session);
  return { session: s, role: (() => s()?.role ?? null) as unknown as AuthService['role'] };
}

describe('guards', () => {
  const route = { url: [{ path: 'x' }] } as ActivatedRouteSnapshot;
  const state = {} as RouterStateSnapshot;

  it('authGuard allows authenticated users', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: buildAuth({ userId: 'a', username: 'a', role: 'admin', issuedAt: 1, lastActivity: 1 }) },
        { provide: Router, useValue: fakeRouter() }
      ]
    });
    const res = TestBed.runInInjectionContext(() => authGuard(route, state));
    expect(res).toBe(true);
  });

  it('authGuard redirects unauthenticated', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: buildAuth(null) },
        { provide: Router, useValue: fakeRouter() }
      ]
    });
    const res = TestBed.runInInjectionContext(() => authGuard(route, state));
    expect(res).not.toBe(true);
  });
});