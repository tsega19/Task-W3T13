import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'projects' },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent)
  },
  {
    path: 'projects',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/projects/project-list.component').then((m) => m.ProjectListComponent)
  },
  {
    path: 'projects/:projectId/canvas/:canvasId',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/canvas/canvas-editor.component').then((m) => m.CanvasEditorComponent)
  },
  {
    path: 'admin',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/admin/admin-panel.component').then((m) => m.AdminPanelComponent)
  },
  {
    path: 'reviews',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/reviewer/reviewer-panel.component').then((m) => m.ReviewerPanelComponent)
  },
  {
    path: 'diagnostics',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/diagnostics/diagnostics.component').then((m) => m.DiagnosticsComponent)
  },
  {
    path: 'backup',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/backup/backup.component').then((m) => m.BackupComponent)
  },
  { path: '**', redirectTo: 'projects' }
];
