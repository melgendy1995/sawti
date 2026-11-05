import { Routes } from '@angular/router';

/**
 * Feature routes are lazy-loaded. `speak` is the default route.
 * `/storage` is the P0.6 iOS storage soak page (lazy, so speak budgets hold).
 */
export const routes: Routes = [
  {
    path: 'speak',
    loadComponent: () => import('./features/speak/speak').then((m) => m.Speak),
  },
  {
    path: 'audio/diagnostics',
    loadComponent: () => import('./features/audio/diagnostics').then((m) => m.AudioDiagnostics),
  },
  {
    path: 'audio',
    loadComponent: () => import('./features/audio/audio').then((m) => m.AudioBoard),
  },
  {
    path: 'storage',
    loadComponent: () => import('./features/storage/storage').then((m) => m.StoragePage),
  },
  { path: '', pathMatch: 'full', redirectTo: 'speak' },
  { path: '**', redirectTo: 'speak' },
];
