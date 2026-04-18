import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { LoggerService } from '../../logging/logger.service';

export const authGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const logger = inject(LoggerService);
  if (auth.session()) return true;
  logger.warn('core', 'guard-auth', 'blocked unauthenticated access', { path: route.url.map((s) => s.path).join('/') });
  return router.createUrlTree(['/login']);
};
